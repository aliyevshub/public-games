// Nishon Poligoni — yuqori grafikali otish mashg'uloti
// Modellar, teksturalar va osmon: Poly Haven (CC0)
import * as THREE from 'three';
import { GLTFLoader } from './jsm/loaders/GLTFLoader.js';
import { RGBELoader } from './jsm/loaders/RGBELoader.js';
import { EffectComposer } from './jsm/postprocessing/EffectComposer.js';
import { RenderPass } from './jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from './jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from './jsm/postprocessing/OutputPass.js';
import { ImprovedNoise } from './jsm/math/ImprovedNoise.js';

const $ = id => document.getElementById(id);
const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const smooth = (x, a, b) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const store = {
  get: (k, d) => { try { const v = localStorage.getItem('np.' + k); return v === null ? d : v; } catch (e) { return d; } },
  set: (k, v) => { try { localStorage.setItem('np.' + k, String(v)); } catch (e) {} },
};

// =====================================================================
// RENDERER, SAHNA, KAMERA
// =====================================================================
const canvas = $('gl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.95;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const maxAniso = renderer.capabilities.getMaxAnisotropy();

const scene = new THREE.Scene();
const world = new THREE.Group(); scene.add(world);
const camera = new THREE.PerspectiveCamera(70, 1, 0.03, 1500);
camera.rotation.order = 'YXZ';
scene.add(camera);

const sun = new THREE.DirectionalLight(0xfff1dc, 3.2);
sun.shadow.bias = -0.0003; sun.shadow.normalBias = 0.03;
Object.assign(sun.shadow.camera, { left: -75, right: 75, top: 75, bottom: -75, near: 1, far: 500 });
scene.add(sun, sun.target);

// =====================================================================
// GRAFIKA SIFATI
// =====================================================================
const QUALITY = {
  low:    { pr: 1,   shadows: false, map: 1024, bloom: false },
  medium: { pr: 1.5, shadows: true,  map: 1024, bloom: false },
  high:   { pr: 2,   shadows: true,  map: 2048, bloom: true },
};
let qMode = store.get('quality', 'auto');
let quality = qMode === 'auto' ? 'medium' : qMode;
let composer = null, bloomPass = null;

function applyQuality(q) {
  quality = q;
  const Q = QUALITY[q];
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, Q.pr));
  const shadowChanged = renderer.shadowMap.enabled !== Q.shadows;
  renderer.shadowMap.enabled = Q.shadows;
  sun.castShadow = Q.shadows;
  if (sun.shadow.mapSize.x !== Q.map) {
    sun.shadow.mapSize.set(Q.map, Q.map);
    if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
  }
  if (shadowChanged) scene.traverse(o => { if (o.material) [].concat(o.material).forEach(m => m.needsUpdate = true); });
  if (Q.bloom && !composer) {
    composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    bloomPass = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.28, 0.55, 0.9);
    composer.addPass(bloomPass);
    composer.addPass(new OutputPass());
  }
  resize();
}

// =====================================================================
// YUKLASH
// =====================================================================
const manager = new THREE.LoadingManager();
manager.onProgress = (url, loaded, total) => {
  const p = Math.round(loaded / total * 100);
  $('loadBar').style.width = p + '%';
  $('loadPct').textContent = `${p}%  (${loaded} / ${total})`;
};
const gltfLoader = new GLTFLoader(manager);
const texLoader = new THREE.TextureLoader(manager);
const rgbeLoader = new RGBELoader(manager);

function loadTex(name, rep, srgb) {
  const t = texLoader.load(`assets/textures/${name}.jpg`);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep, rep);
  t.anisotropy = Math.min(8, maxAniso);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function pbr(name, rep, extra = {}) {
  return new THREE.MeshStandardMaterial({
    map: loadTex(name + '_diff', rep, true), normalMap: loadTex(name + '_nor', rep), roughnessMap: loadTex(name + '_rough', rep),
    roughness: 1, metalness: 0, ...extra,
  });
}
const MODELS = {};
function loadModel(name) {
  return new Promise((res, rej) => gltfLoader.load(`assets/models/${name}/${name}.gltf`, g => {
    g.scene.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; if (o.material.map) o.material.map.anisotropy = Math.min(4, maxAniso); } });
    MODELS[name] = g.scene; res(g.scene);
  }, undefined, rej));
}
function place(name, x, y, z, ry = 0, s = 1, parent = world) {
  const m = MODELS[name].clone();
  m.position.set(x, y, z); m.rotation.y = ry; m.scale.setScalar(s);
  parent.add(m); return m;
}

// =====================================================================
// OSMON: quyosh yo'nalishini HDR rasmdan topish
// =====================================================================
const half = THREE.DataUtils.fromHalfFloat;
function analyseSky(tex) {
  const { data, width: w, height: h } = tex.image;
  const isHalf = data instanceof Uint16Array;
  const get = i => isHalf ? half(data[i]) : data[i];
  let best = -1, bu = 0.5, bv = 0.75;
  const hor = [0, 0, 0]; let hn = 0;
  for (let y = 0; y < h; y += 2) for (let x = 0; x < w; x += 2) {
    const i = (y * w + x) * 4, r = get(i), g = get(i + 1), b = get(i + 2);
    const l = r * 0.2126 + g * 0.7152 + b * 0.0722;
    const v = 1 - (y + 0.5) / h, u = (x + 0.5) / w;
    if (l > best) { best = l; bu = u; bv = v; }
    if (v > 0.51 && v < 0.54) { hor[0] += r; hor[1] += g; hor[2] += b; hn++; }
  }
  const ang = (bu - 0.5) * Math.PI * 2, lat = (bv - 0.5) * Math.PI;
  const dir = new THREE.Vector3(Math.cos(lat) * Math.cos(ang), Math.sin(lat), Math.cos(lat) * Math.sin(ang)).normalize();
  const horizon = new THREE.Color(hor[0] / hn, hor[1] / hn, hor[2] / hn);
  return { dir, horizon };
}

// =====================================================================
// RELYEF
// =====================================================================
const perlin = new ImprovedNoise();
function fbm(x, z, oct = 4) { let n = 0, a = 1, f = 1; for (let i = 0; i < oct; i++) { n += perlin.noise(x * f, z * f, 1.7 + i * 3.1) * a; a *= 0.5; f *= 2; } return n; }
function groundH(x, z) {
  const side = smooth(Math.abs(x), 24, 34) * 5;
  const back = smooth(-z, 112, 126) * 8;
  const behind = smooth(z, 12, 34) * 3;
  const berm = Math.max(side, back, behind);
  const far = smooth(Math.hypot(x * 0.9, z + 60), 75, 170);
  const hills = Math.max(0, fbm(x * 0.006, z * 0.006) * 34 + 10) * far;
  const bumps = fbm(x * 0.15, z * 0.15, 2) * 0.12 * smooth(Math.hypot(x, z), 6, 12);
  return berm * (1 + fbm(x * 0.05, z * 0.05, 2) * 0.25) + hills + bumps;
}
let terrain = null;
function buildTerrain(groundMat, hillsMap) {
  const size = 800, seg = 200;
  const geo = new THREE.PlaneGeometry(size, size, seg, seg); geo.rotateX(-Math.PI / 2);
  const p = geo.attributes.position, blend = new Float32Array(p.count);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i) - 50, y = groundH(x, z);
    p.setZ(i, z); p.setY(i, y);
    blend[i] = clamp(smooth(y, 1.5, 6) + smooth(Math.hypot(x, z + 60), 90, 140), 0, 1);
  }
  geo.setAttribute('blend', new THREE.BufferAttribute(blend, 1));
  geo.computeVertexNormals();
  const mat = groundMat;
  mat.onBeforeCompile = sh => {
    sh.uniforms.map2 = { value: hillsMap };
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float blend;\nvarying float vBlend;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvBlend = blend;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform sampler2D map2;\nvarying float vBlend;')
      .replace('#include <map_fragment>', `#ifdef USE_MAP
        vec4 c1 = texture2D( map, vMapUv );
        vec4 c2 = texture2D( map2, vMapUv * 0.23 ) * vec4(0.92, 0.95, 0.85, 1.0);
        diffuseColor *= mix( c1, c2, vBlend );
      #endif`);
  };
  terrain = new THREE.Mesh(geo, mat);
  terrain.receiveShadow = true;
  world.add(terrain);
}

// =====================================================================
// NISHONLAR
// =====================================================================
function ringTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 512; const g = c.getContext('2d');
  g.fillStyle = '#efe8d6'; g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 4000; i++) { g.fillStyle = `rgba(120,100,70,${Math.random() * 0.06})`; g.fillRect(Math.random() * 512, Math.random() * 512, 2, 2); }
  for (let r = 10; r >= 1; r--) {
    const rad = r * 23;
    g.beginPath(); g.arc(256, 256, rad, 0, Math.PI * 2);
    g.fillStyle = r <= 2 ? '#c8261d' : r <= 6 ? '#1b1b1b' : '#efe8d6'; g.fill();
    g.lineWidth = 2; g.strokeStyle = r <= 6 && r > 2 ? '#efe8d6' : '#1b1b1b'; g.stroke();
  }
  g.fillStyle = '#efe8d6'; g.font = 'bold 13px sans-serif'; g.textAlign = 'center';
  for (let r = 7; r <= 9; r++) { g.fillStyle = '#1b1b1b'; g.fillText(String(11 - r), 256, 256 - r * 23 + 16); }
  for (let r = 3; r <= 6; r++) { g.fillStyle = '#efe8d6'; g.fillText(String(11 - r), 256, 256 - r * 23 + 16); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = Math.min(8, maxAniso);
  return t;
}
let MAT = {};
function makeMaterials(planks) {
  MAT.paper = new THREE.MeshStandardMaterial({ map: ringTexture(), roughness: 0.95 });
  MAT.frame = planks;
  MAT.steel = new THREE.MeshStandardMaterial({ color: 0xd9822b, roughness: 0.45, metalness: 0.75 });
  MAT.steelW = new THREE.MeshStandardMaterial({ color: 0xe9e4d8, roughness: 0.5, metalness: 0.6 });
  MAT.post = new THREE.MeshStandardMaterial({ color: 0x3b3a36, roughness: 0.6, metalness: 0.8 });
  MAT.hole = new THREE.MeshBasicMaterial({ color: 0x111111 });
}
const holeGeo = new THREE.CircleGeometry(0.012, 10);
const targets = [];
const hitMeshes = [];

function makePaperTarget() {
  const g = new THREE.Group();
  const board = new THREE.Mesh(new THREE.BoxGeometry(1.0, 1.0, 0.03), [MAT.frame, MAT.frame, MAT.frame, MAT.frame, MAT.paper, MAT.frame]);
  board.position.y = 1.35; board.castShadow = board.receiveShadow = true;
  const pivot = new THREE.Group(); pivot.position.y = 0.8; board.position.y = 0.55; pivot.add(board);
  for (const x of [-0.42, 0.42]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.85, 0.07), MAT.frame); leg.position.set(x, 0.42, 0); leg.castShadow = true; g.add(leg);
  }
  g.add(pivot);
  const t = { kind: 'paper', group: g, pivot, hit: board, holes: [], down: 0, state: 'up', timer: 0, value: 10 };
  board.userData.target = t;
  return t;
}
function makeSteelTarget(round = true) {
  const g = new THREE.Group();
  const pivot = new THREE.Group(); pivot.position.y = 0.55; g.add(pivot);
  let plate;
  if (round) {
    plate = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.025, 32), MAT.steel);
    plate.rotation.x = Math.PI / 2; plate.position.y = 0.36;
  } else {
    const s = new THREE.Shape();
    s.moveTo(-0.28, 0); s.lineTo(0.28, 0); s.lineTo(0.28, 0.55); s.lineTo(0.14, 0.62); s.lineTo(0.12, 0.72);
    s.absarc(0, 0.82, 0.13, -0.3, Math.PI + 0.3, false); s.lineTo(-0.14, 0.62); s.lineTo(-0.28, 0.55); s.lineTo(-0.28, 0);
    plate = new THREE.Mesh(new THREE.ExtrudeGeometry(s, { depth: 0.025, bevelEnabled: false }), MAT.steelW);
    plate.position.z = -0.012;
  }
  plate.castShadow = plate.receiveShadow = true; pivot.add(plate);
  const post = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.6, 0.06), MAT.post); post.position.y = 0.3; post.castShadow = true; g.add(post);
  const foot = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.05, 0.3), MAT.post); foot.position.y = 0.025; foot.receiveShadow = true; g.add(foot);
  const t = { kind: round ? 'steel' : 'mover', group: g, pivot, hit: plate, down: 0, state: 'up', timer: 0, value: 5 };
  plate.userData.target = t;
  return t;
}
function addTarget(t, x, z) {
  t.group.position.set(x, groundH(x, z), z);
  t.group.rotation.y = rand(-0.08, 0.08);
  t.base = new THREE.Vector3(x, 0, z);
  world.add(t.group); targets.push(t); hitMeshes.push(t.hit);
  return t;
}
function removeTarget(t) {
  world.remove(t.group);
  targets.splice(targets.indexOf(t), 1);
  hitMeshes.splice(hitMeshes.indexOf(t.hit), 1);
}
function clearTargets() { while (targets.length) removeTarget(targets[0]); }
function randomSpot(minZ, maxZ, spread = 18) {
  for (let i = 0; i < 30; i++) {
    const z = -rand(minZ, maxZ), x = rand(-spread, spread) * (0.4 + 0.6 * (-z / 110));
    if (targets.every(t => Math.hypot(t.base.x - x, t.base.z - z) > 3.2)) return [x, z];
  }
  return [rand(-10, 10), -rand(minZ, maxZ)];
}

// =====================================================================
// QUROLLAR
// =====================================================================
const WEAPONS = {
  rifle: { name: 'Miltiq 7.62', model: 'bolt_action_rifle_7_62', mag: 5, cycle: 0.85, reload: 2.3, hip: 0.014, ads: 0.0004, zoom: 14, kick: 0.035, sound: 'rifle' },
  pistol: { name: 'To\'pponcha', model: 'service_pistol', mag: 12, cycle: 0.17, reload: 1.5, hip: 0.006, ads: 0.0035, zoom: 48, kick: 0.025, sound: 'pistol' },
};
const viewHolder = new THREE.Group(); camera.add(viewHolder);
const viewGuns = {};
const muzzleLocal = {};
const flashLight = new THREE.PointLight(0xffb05a, 0, 6, 2); camera.add(flashLight);
let flashSprite;

function setupViewGuns() {
  for (const [key, w] of Object.entries(WEAPONS)) {
    const m = MODELS[w.model].clone();
    // namuna uchun qo'shilgan ortiqcha qismlarni olib tashlaymiz (ikkinchi nusxa, alohida o'q, magazin)
    [...m.children].forEach(ch => { if (/(_b$|bullet|magazine)/.test(ch.name)) m.remove(ch); });
    m.traverse(o => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = true; } });
    const box = new THREE.Box3().setFromObject(m);
    const inner = new THREE.Group(); inner.add(m);
    // model +X bo'ylab cho'zilgan; uchini oldinga (-Z) buramiz
    m.rotation.y = Math.PI / 2;
    const g = new THREE.Group(); g.add(inner);
    if (key === 'rifle') { inner.position.set(0, 0, 0.02); g.position.set(0.075, -0.115, -0.13); g.rotation.set(0.02, 0.05, 0); }
    else { inner.position.set(0, 0, 0.07); g.position.set(0.15, -0.14, -0.3); g.scale.setScalar(1.25); }
    muzzleLocal[key] = new THREE.Vector3(0, (box.max.y + box.min.y) / 2 + 0.02, -box.max.x + 0.02).add(inner.position);
    g.visible = false;
    viewHolder.add(g); viewGuns[key] = g;
  }
  const c = document.createElement('canvas'); c.width = c.height = 64; const gg = c.getContext('2d');
  const r = gg.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, 'rgba(255,250,220,1)'); r.addColorStop(0.25, 'rgba(255,190,90,.9)'); r.addColorStop(1, 'rgba(255,110,0,0)');
  gg.fillStyle = r; gg.fillRect(0, 0, 64, 64);
  flashSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  flashSprite.visible = false; viewHolder.add(flashSprite);
}

// =====================================================================
// EFFEKTLAR: tutun, chang, uchqun
// =====================================================================
function softTex() {
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
  const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, 'rgba(255,255,255,.9)'); r.addColorStop(0.5, 'rgba(255,255,255,.35)'); r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}
let puffs = [], sparks = [];
function setupFX() {
  const st = softTex();
  for (let i = 0; i < 40; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: st, transparent: true, depthWrite: false, color: 0xcfc6b5 }));
    s.visible = false; s.userData = { v: new THREE.Vector3(), life: 0, max: 1, grow: 1 }; scene.add(s); puffs.push(s);
  }
  for (let i = 0; i < 60; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: st, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: 0xffc070 }));
    s.visible = false; s.scale.setScalar(0.06); s.userData = { v: new THREE.Vector3(), life: 0 }; scene.add(s); sparks.push(s);
  }
}
let puffI = 0, sparkI = 0;
function puff(p, color, size, life, vy = 0.6) {
  const s = puffs[puffI++ % puffs.length];
  s.position.copy(p); s.material.color.set(color); s.material.opacity = 0.7;
  s.userData.v.set(rand(-0.3, 0.3), vy * rand(0.6, 1.2), rand(-0.3, 0.3));
  s.userData.life = s.userData.max = life; s.userData.size = size; s.scale.setScalar(size); s.visible = true;
}
function sparkBurst(p, n, color = 0xffc070) {
  for (let i = 0; i < n; i++) {
    const s = sparks[sparkI++ % sparks.length];
    s.position.copy(p); s.material.color.set(color);
    s.userData.v.set(rand(-1, 1), rand(0, 1.5), rand(-1, 1)).multiplyScalar(rand(2, 5));
    s.userData.life = rand(0.15, 0.4); s.visible = true;
  }
}
function updateFX(dt) {
  for (const s of puffs) if (s.visible) {
    const u = s.userData; u.life -= dt;
    s.position.addScaledVector(u.v, dt); u.v.multiplyScalar(1 - dt * 0.8);
    const k = 1 - u.life / u.max; s.scale.setScalar(u.size * (1 + k * 2.2)); s.material.opacity = 0.6 * (1 - k);
    if (u.life <= 0) s.visible = false;
  }
  for (const s of sparks) if (s.visible) {
    const u = s.userData; u.life -= dt; u.v.y -= 9.8 * dt; s.position.addScaledVector(u.v, dt);
    if (u.life <= 0) s.visible = false;
  }
}

// =====================================================================
// OVOZ
// =====================================================================
let actx = null, noiseBuf = null, master = null, verb = null;
function initAudio() {
  if (actx) { if (actx.state === 'suspended') actx.resume(); return; }
  try {
    actx = new (window.AudioContext || window.webkitAudioContext)();
    master = actx.createGain(); master.gain.value = 0.85; master.connect(actx.destination);
    noiseBuf = actx.createBuffer(1, actx.sampleRate * 1.5, actx.sampleRate);
    const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    // ochiq maydon aks-sadosi
    const ir = actx.createBuffer(2, actx.sampleRate * 2.2, actx.sampleRate);
    for (let c = 0; c < 2; c++) { const b = ir.getChannelData(c); for (let i = 0; i < b.length; i++) b[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / b.length, 3.2) * (i < actx.sampleRate * 0.12 ? 0.2 : 1); }
    verb = actx.createConvolver(); verb.buffer = ir;
    const vg = actx.createGain(); vg.gain.value = 0.35; verb.connect(vg); vg.connect(master);
  } catch (e) { actx = null; }
}
function noiseHit(t, len, f0, f1, vol, type = 'lowpass', toVerb = true) {
  const src = actx.createBufferSource(); src.buffer = noiseBuf;
  const f = actx.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(f1, t + len);
  const g = actx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + len);
  src.connect(f); f.connect(g); g.connect(master); if (toVerb) g.connect(verb);
  src.start(t); src.stop(t + len + 0.05);
}
function tone(t, f0, f1, len, vol, type = 'sine', toVerb = false) {
  const o = actx.createOscillator(), g = actx.createGain();
  o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + len);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + len);
  o.connect(g); g.connect(master); if (toVerb) g.connect(verb); o.start(t); o.stop(t + len + 0.02);
}
const sfx = {
  rifle() { if (!actx) return; const t = actx.currentTime; noiseHit(t, 0.45, 5000, 300, 1.0); tone(t, 120, 38, 0.3, 0.9, 'sine', true); },
  pistol() { if (!actx) return; const t = actx.currentTime; noiseHit(t, 0.22, 6500, 500, 0.7); tone(t, 200, 60, 0.12, 0.5); },
  bolt() { if (!actx) return; const t = actx.currentTime + 0.25; noiseHit(t, 0.05, 3000, 2000, 0.25, 'bandpass', false); noiseHit(t + 0.22, 0.06, 2500, 1800, 0.3, 'bandpass', false); },
  reload() { if (!actx) return; const t = actx.currentTime; noiseHit(t + 0.1, 0.05, 2400, 1600, 0.3, 'bandpass', false); noiseHit(t + 0.9, 0.07, 1800, 1200, 0.35, 'bandpass', false); },
  ding(dist) { if (!actx) return; const t = actx.currentTime + dist / 340; const v = clamp(1.4 - dist / 80, 0.25, 1) * 0.3; tone(t, 1480, 1460, 1.1, v, 'sine', true); tone(t, 2210, 2190, 0.7, v * 0.6, 'sine', true); },
  thwack(dist) { if (!actx) return; const t = actx.currentTime + dist / 340; noiseHit(t, 0.08, 1800, 600, 0.35, 'bandpass', false); },
  click() { if (!actx) return; tone(actx.currentTime, 2000, 1500, 0.03, 0.2, 'square'); },
  chime() { if (!actx) return; const t = actx.currentTime; [660, 880, 1320].forEach((f, i) => tone(t + i * 0.1, f, f, 0.25, 0.15, 'triangle')); },
  end() { if (!actx) return; const t = actx.currentTime; [523, 659, 784, 1047].forEach((f, i) => tone(t + i * 0.12, f, f, 0.3, 0.16, 'triangle')); },
};

// =====================================================================
// O'YIN HOLATI
// =====================================================================
const ROUND = 60;
const G = { phase: 'loading', time: 0, left: ROUND, score: 0, shots: 0, hits: 0, wave: 0, popT: 0 };
const P = { yaw: 0, pitch: -0.02, baseYaw: 0, cur: 'rifle', mag: { rifle: 5, pistol: 12 }, nextShot: 0, reloadEnd: 0, switchEnd: 0, aim: false, aimK: 0, kick: 0, sway: 0 };
let time = 0;

function startGame() {
  initAudio();
  clearTargets();
  Object.assign(G, { phase: 'play', left: ROUND, score: 0, shots: 0, hits: 0, wave: 0, popT: 0 });
  P.yaw = P.baseYaw; P.pitch = -0.02; P.mag = { rifle: 5, pistol: 12 }; P.reloadEnd = 0; P.aim = false; P.aimK = 0; P.cur = 'rifle';
  showGun();
  startWave(1);
  showScreen(null);
}
const WAVES = {
  1: ['1-bosqich', 'Qog\'oz nishonlar — markazga oting'],
  2: ['2-bosqich', 'Po\'lat plitalar — tez paydo bo\'lib yo\'qoladi'],
  3: ['3-bosqich', 'Harakatlanuvchi nishonlar'],
};
function startWave(n) {
  G.wave = n; clearTargets(); sfx.chime();
  banner(WAVES[n][0], WAVES[n][1], 2.2);
  $('wave').textContent = WAVES[n][0];
  if (n === 1) for (let i = 0; i < 4; i++) { const [x, z] = randomSpot(14, 42, 12); addTarget(makePaperTarget(), x, z); }
  if (n === 2) { G.popT = 0.2; }
  if (n === 3) {
    for (let i = 0; i < 2; i++) {
      const t = addTarget(makeSteelTarget(false), 0, -(32 + i * 22));
      t.speed = rand(2.2, 3.4) * (i ? -1 : 1); t.range = 9 + i * 4; t.phase = rand(0, 6);
    }
    const [x, z] = randomSpot(70, 90, 8); addTarget(makePaperTarget(), x, z);
  }
}
function updateGame(dt) {
  G.left -= dt;
  const elapsed = ROUND - G.left;
  if (G.wave === 1 && elapsed >= 20) startWave(2);
  else if (G.wave === 2 && elapsed >= 40) startWave(3);
  if (G.left <= 0) { G.left = 0; endGame(); return; }
  if (G.wave === 2) {
    G.popT -= dt;
    const upCount = targets.filter(t => t.state === 'up').length;
    if (G.popT <= 0 && upCount < 3) {
      const [x, z] = randomSpot(22, 75, 16);
      const t = addTarget(makeSteelTarget(true), x, z); t.life = rand(2.2, 3.2); t.pivot.rotation.x = -Math.PI / 2; t.rise = 0;
      G.popT = rand(0.5, 1.0);
    }
  }
  for (const t of [...targets]) {
    if (t.kind === 'mover' && t.state === 'up') {
      t.phase += dt * t.speed / t.range;
      const x = Math.sin(t.phase) * t.range;
      t.group.position.x = x; t.base.x = x; t.group.position.y = groundH(x, t.base.z);
    }
    if (t.kind === 'steel' && t.state === 'up' && t.rise !== undefined) {
      t.rise = Math.min(1, t.rise + dt * 6); t.pivot.rotation.x = -Math.PI / 2 * (1 - t.rise);
      t.life -= dt; if (t.life <= 0) { t.state = 'falling'; t.timer = 0; t.missed = true; }
    }
    if (t.state === 'falling') {
      t.timer += dt;
      const k = Math.min(1, t.timer / 0.28);
      t.pivot.rotation.x = -(Math.PI / 2) * (k * k);
      if (t.timer > 0.9) respawn(t);
    }
    if (t.wobble) { t.wobble = Math.max(0, t.wobble - dt * 3); t.pivot.rotation.x = Math.sin(time * 40) * 0.05 * t.wobble; }
  }
}
function respawn(t) {
  if (t.kind === 'steel') { removeTarget(t); return; }
  if (t.kind === 'mover') { t.state = 'up'; t.pivot.rotation.x = 0; return; }
  // qog'oz: yangi joyda paydo bo'ladi
  removeTarget(t);
  const nt = makePaperTarget();
  const [x, z] = G.wave === 3 ? randomSpot(60, 95, 10) : randomSpot(14, 45, 13);
  addTarget(nt, x, z);
}
function endGame() {
  G.phase = 'over'; P.aim = false;
  const best = +store.get('best', 0);
  const isBest = G.score > best;
  if (isBest) store.set('best', G.score);
  const acc = G.shots ? Math.round(G.hits / G.shots * 100) : 0;
  const stars = G.score >= 260 ? 3 : G.score >= 150 ? 2 : G.score >= 60 ? 1 : 0;
  $('stars').innerHTML = [0, 1, 2].map(i => `<span class="${i < stars ? '' : 'off'}">★</span>`).join('');
  $('rScore').textContent = G.score; $('rAcc').textContent = acc + '%'; $('rHits').textContent = G.hits;
  $('rBest').textContent = isBest ? '🏆 Yangi rekord!' : `Rekord: ${Math.max(best, G.score)}`;
  sfx.end(); showScreen('over'); updateBest();
}

// =====================================================================
// OTISH
// =====================================================================
const ray = new THREE.Raycaster(); ray.far = 600;
const V = new THREE.Vector3(), V2 = new THREE.Vector3(), E = new THREE.Euler(0, 0, 0, 'YXZ');
let solid = [];
const W = () => WEAPONS[P.cur];

function fire() {
  if (G.phase !== 'play') return;
  const w = W();
  if (time < P.nextShot || P.reloadEnd > time || time < P.switchEnd) return;
  if (P.mag[P.cur] <= 0) { sfx.click(); startReload(); P.nextShot = time + 0.3; return; }
  P.mag[P.cur]--; G.shots++;
  P.nextShot = time + w.cycle;
  const spread = P.aimK > 0.9 ? w.ads : w.hip * (1 - P.aimK * 0.7);
  E.set(P.pitch + P.kick + rand(-spread, spread), P.yaw + rand(-spread, spread), 0);
  const dir = V.set(0, 0, -1).applyEuler(E);
  ray.set(camera.position, dir);
  const hits = ray.intersectObjects(hitMeshes.concat(solid), true);
  const h = hits[0];
  if (h && h.object.userData.target) onHit(h.object.userData.target, h);
  else if (h) { puff(h.point, 0xb39a78, 0.35, 0.9, 0.4); puff(h.point, 0x9c8462, 0.2, 0.6, 1.2); }
  // effektlar
  P.kick += w.kick * (P.aimK > 0.5 ? 0.6 : 1);
  sfx[w.sound]();
  if (P.cur === 'rifle') sfx.bolt();
  flashSprite.position.copy(muzzleLocal[P.cur]).applyMatrix4(viewGuns[P.cur].matrix);
  flashSprite.scale.setScalar(P.cur === 'rifle' ? 0.32 : 0.2); flashSprite.material.rotation = rand(0, 6);
  flashSprite.userData.life = 0.05; flashLight.intensity = 6; flashLight.position.copy(flashSprite.position);
  const mz = V2.copy(flashSprite.position); camera.localToWorld(mz);
  puff(mz, 0xd8d2c6, 0.12, 0.9, 0.3);
  if (P.mag[P.cur] === 0) setTimeout(() => startReload(), w.cycle * 1000);
}
function onHit(t, h) {
  if (t.state !== 'up') return;
  G.hits++;
  const dist = h.distance;
  const bonus = 1 + Math.max(0, dist - 20) / 40;
  let pts;
  if (t.kind === 'paper') {
    const local = t.hit.worldToLocal(h.point.clone());
    const r = Math.hypot(local.x, local.y);
    const ring = clamp(10 - Math.floor(r / 0.045), 1, 10);
    pts = Math.round(ring * bonus);
    const hole = new THREE.Mesh(holeGeo, MAT.hole); hole.position.set(local.x, local.y, 0.0161); t.hit.add(hole);
    puff(h.point, 0xf2ead8, 0.15, 0.4, 0.5);
    sfx.thwack(dist);
    popText(ring === 10 ? `+${pts}  MARKAZ!` : `+${pts}`, ring >= 9);
    t.state = 'falling'; t.timer = 0;
  } else {
    pts = Math.round(t.value * bonus * (t.kind === 'mover' ? 2 : 1));
    sparkBurst(h.point, 10);
    sfx.ding(dist);
    popText(`+${pts}`, t.kind === 'mover');
    t.state = 'falling'; t.timer = 0;
  }
  G.score += pts;
}
function startReload() {
  const w = W();
  if (P.reloadEnd > time || P.mag[P.cur] >= w.mag || G.phase !== 'play') return;
  P.reloadEnd = time + w.reload; P.aim = false; sfx.reload();
}
function switchWeapon() {
  if (G.phase !== 'play') return;
  P.cur = P.cur === 'rifle' ? 'pistol' : 'rifle';
  P.reloadEnd = 0; P.switchEnd = time + 0.4; P.aim = false;
  showGun(); sfx.click();
}
function showGun() { for (const k in viewGuns) viewGuns[k].visible = k === P.cur; }

// =====================================================================
// BOSHQARUV
// =====================================================================
let sens = +store.get('sens', 1.1);
$('sens').value = sens;
$('sens').addEventListener('input', () => { sens = +$('sens').value; store.set('sens', sens); });
function look(dx, dy) {
  if (G.phase !== 'play') return;
  const k = 0.0042 * sens * (camera.fov / 70);
  P.yaw = clamp(P.yaw - dx * k, P.baseYaw - 1.3, P.baseYaw + 1.3);
  P.pitch = clamp(P.pitch - dy * k, -0.6, 0.5);
}
const finePointer = matchMedia('(pointer: fine)').matches;
const touchUI = $('touch');
const pts = new Map();
touchUI.addEventListener('pointerdown', e => {
  e.preventDefault(); initAudio();
  try { touchUI.setPointerCapture(e.pointerId); } catch (err) {}
  const b = e.target.closest('[data-act]');
  pts.set(e.pointerId, { x: e.clientX, y: e.clientY, btn: b });
  if (b) {
    const a = b.dataset.act; b.classList.add('on');
    if (a === 'fire') fire();
    else if (a === 'aim') { if (P.reloadEnd <= time) P.aim = !P.aim; }
    else if (a === 'reload') startReload();
    else if (a === 'switch') switchWeapon();
    else if (a === 'pause') pauseGame();
  }
  $('lookHint').hidden = true;
});
touchUI.addEventListener('pointermove', e => {
  const p = pts.get(e.pointerId); if (!p) return;
  if (!p.btn || p.btn.dataset.act === 'fire') look(e.clientX - p.x, e.clientY - p.y);
  p.x = e.clientX; p.y = e.clientY;
});
const endPt = e => { const p = pts.get(e.pointerId); if (p && p.btn) p.btn.classList.toggle('on', p.btn.dataset.act === 'aim' && P.aim); pts.delete(e.pointerId); };
touchUI.addEventListener('pointerup', endPt);
touchUI.addEventListener('pointercancel', endPt);
document.addEventListener('touchmove', e => e.preventDefault(), { passive: false });
document.addEventListener('gesturestart', e => e.preventDefault());

addEventListener('keydown', e => {
  if (e.code === 'KeyR') startReload();
  if (e.code === 'KeyQ' || e.code === 'Digit1' || e.code === 'Digit2') switchWeapon();
  if (e.code === 'Escape' && G.phase === 'play') pauseGame();
});
canvas.addEventListener('contextmenu', e => e.preventDefault());
canvas.addEventListener('mousedown', e => {
  if (!finePointer || G.phase !== 'play') return;
  initAudio();
  if (document.pointerLockElement !== canvas) { canvas.requestPointerLock?.(); return; }
  if (e.button === 0) fire(); else if (e.button === 2) P.aim = true;
});
addEventListener('mouseup', e => { if (e.button === 2) P.aim = false; });
addEventListener('mousemove', e => { if (document.pointerLockElement === canvas) look(e.movementX * 0.7, e.movementY * 0.7); });

// =====================================================================
// INTERFEYS
// =====================================================================
let paused = false;
function showScreen(name) {
  for (const s of ['menu', 'pause', 'over', 'help']) $(s).hidden = s !== name;
  $('hud').hidden = !(name === null || name === 'pause');
  $('touch').hidden = name !== null || finePointer;
  if (name !== null && document.pointerLockElement) document.exitPointerLock?.();
}
function pauseGame() { if (G.phase !== 'play') return; paused = true; showScreen('pause'); }
function resumeGame() { paused = false; showScreen(null); }
let bannerT = 0;
function banner(t, s, d) { $('banner').innerHTML = `<b>${t}</b><span>${s}</span>`; bannerT = d; }
let popT = 0;
function popText(s, big) { const el = $('hitPop'); el.textContent = s; el.style.fontSize = big ? '34px' : '26px'; popT = 0.9; }
function updateBest() { const b = +store.get('best', 0); $('bestOut').textContent = b ? `🏆 Rekord: ${b}` : ''; }
function setQMode(m) {
  qMode = m; store.set('quality', m);
  document.querySelectorAll('#qSeg button').forEach(b => b.classList.toggle('on', b.dataset.q === m));
  autoLocked = false; fpsHist = [];
  applyQuality(m === 'auto' ? 'medium' : m);
}
document.querySelectorAll('#qSeg button').forEach(b => b.onclick = () => setQMode(b.dataset.q));
$('playBtn').onclick = () => { paused = false; startGame(); };
$('helpBtn').onclick = () => showScreen('help');
$('helpClose').onclick = () => showScreen('menu');
$('resumeBtn').onclick = resumeGame;
$('restartBtn').onclick = () => { paused = false; startGame(); };
const toMenu = () => { paused = false; G.phase = 'menu'; clearTargets(); demoTargets(); showScreen('menu'); };
$('menuBtn').onclick = toMenu; $('overMenuBtn').onclick = toMenu;
$('againBtn').onclick = () => { paused = false; startGame(); };
document.addEventListener('visibilitychange', () => { if (document.hidden) pauseGame(); });

function checkOrientation() { const p = !finePointer && innerHeight > innerWidth; $('rotate').hidden = !p; return p; }
function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h; camera.updateProjectionMatrix();
  if (composer) { composer.setPixelRatio(renderer.getPixelRatio()); composer.setSize(w, h); }
  checkOrientation();
}
addEventListener('resize', resize);
addEventListener('orientationchange', () => setTimeout(resize, 250));

// =====================================================================
// FPS va avtomatik sifat
// =====================================================================
let fpsFrames = 0, fpsAcc = 0, fpsHist = [], autoLocked = false;
function trackFps(dt) {
  fpsFrames++; fpsAcc += dt;
  if (fpsAcc < 0.5) return;
  const fps = fpsFrames / fpsAcc; fpsFrames = 0; fpsAcc = 0;
  $('fps').textContent = `${Math.round(fps)} FPS · ${({ low: 'Past', medium: 'O\'rta', high: 'Yuqori' })[quality]}`;
  if (qMode !== 'auto' || G.phase !== 'play' || paused) return;
  fpsHist.push(fps); if (fpsHist.length > 12) fpsHist.shift();
  const avg = n => fpsHist.slice(-n).reduce((a, b) => a + b, 0) / Math.min(n, fpsHist.length);
  if (fpsHist.length >= 6 && avg(6) < 44 && quality !== 'low') { applyQuality(quality === 'high' ? 'medium' : 'low'); autoLocked = true; fpsHist = []; }
  else if (!autoLocked && fpsHist.length >= 12 && avg(12) >= 57 && quality === 'medium') { applyQuality('high'); fpsHist = []; }
}

// =====================================================================
// KAMERA VA QUROL ANIMATSIYASI
// =====================================================================
const EYE = new THREE.Vector3(0, 0.25 + 1.62, 0.3);
function updateView(dt) {
  const w = W();
  const wantAim = P.aim && P.reloadEnd <= time && time >= P.switchEnd ? 1 : 0;
  P.aimK += (wantAim - P.aimK) * Math.min(1, dt * 14);
  const scoped = P.cur === 'rifle' && P.aimK > 0.85;
  camera.fov = 70 + (w.zoom - 70) * P.aimK;
  camera.updateProjectionMatrix();
  P.kick = Math.max(0, P.kick - dt * (0.12 + P.kick * 6));
  P.sway += dt;
  const sw = scoped ? 0.0012 : 0;
  camera.position.copy(EYE).applyAxisAngle(THREE.Object3D.DEFAULT_UP, P.baseYaw);
  camera.rotation.set(P.pitch + P.kick + Math.sin(P.sway * 1.3) * sw, P.yaw + Math.sin(P.sway * 0.9) * sw, 0);
  // qurol
  const g = viewGuns[P.cur]; if (!g) return;
  let down = 0;
  if (P.reloadEnd > time) down = Math.sin((1 - (P.reloadEnd - time) / w.reload) * Math.PI);
  if (time < P.switchEnd) down = Math.max(down, (P.switchEnd - time) / 0.4);
  let bolt = 0;
  if (P.cur === 'rifle' && time < P.nextShot) { const k = 1 - (P.nextShot - time) / w.cycle; if (k > 0.25) bolt = Math.sin((k - 0.25) / 0.75 * Math.PI); }
  const aimX = P.cur === 'rifle' ? -0.12 : -0.15, aimY = P.cur === 'rifle' ? 0.035 : 0.05;
  viewHolder.position.set(aimX * P.aimK, aimY * P.aimK - down * 0.25 - bolt * 0.03 + Math.sin(P.sway * 1.6) * 0.003, P.kick * 1.8);
  viewHolder.rotation.set(P.kick * 3 - down * 0.8 + bolt * 0.08, 0, bolt * 0.25);
  viewHolder.visible = !scoped;
  $('scope').style.opacity = scoped ? 1 : 0;
  $('cross').style.opacity = P.aimK > 0.5 ? 0 : 1;
  if (flashSprite.userData.life > 0) { flashSprite.userData.life -= dt; flashSprite.visible = !scoped; } else flashSprite.visible = false;
  flashLight.intensity = Math.max(0, flashLight.intensity - dt * 120);
}
function updateHUD() {
  $('score').textContent = G.score;
  const t = Math.ceil(G.left); $('timer').textContent = t; $('timer').className = t <= 10 ? 'low' : '';
  const w = W();
  $('ammoN').textContent = P.reloadEnd > time ? 'O\'qlanmoqda…' : `${P.mag[P.cur]} / ${w.mag}`;
  $('wName').textContent = w.name;
  $('banner').style.opacity = bannerT > 0 ? 1 : 0;
  const hp = $('hitPop'); hp.style.opacity = popT > 0 ? Math.min(1, popT * 3) : 0; hp.style.transform = `translate(-50%, ${-(0.9 - popT) * 40}px)`;
  $('bAim').classList.toggle('on', P.aim);
}

// =====================================================================
// SAHNA QURISH
// =====================================================================
let menuCamT = 0;
function demoTargets() {
  for (const [x, z] of [[-6, -18], [4, -26], [-2, -38], [9, -50]]) addTarget(makePaperTarget(), x, z);
  addTarget(makeSteelTarget(true), -10, -32); addTarget(makeSteelTarget(false), 12, -40);
}
async function build() {
  // Osmon
  const skyTex = await new Promise((res, rej) => rgbeLoader.load('assets/sky/sky_2k.hdr', res, undefined, rej));
  skyTex.mapping = THREE.EquirectangularReflectionMapping;
  const sky = analyseSky(skyTex);
  scene.background = skyTex;
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromEquirectangular(skyTex).texture;
  scene.environmentIntensity = 0.9;
  const hm = Math.max(sky.horizon.r, sky.horizon.g, sky.horizon.b, 1e-4);
  const fogCol = new THREE.Color(sky.horizon.r / hm, sky.horizon.g / hm, sky.horizon.b / hm).multiplyScalar(0.72);
  scene.fog = new THREE.Fog(fogCol, 160, 620);
  // Poligon quyoshga orqa o'girib turadi: quyosh o'yinchining chap-orqasida
  const sunYaw = Math.atan2(-sky.dir.x, -sky.dir.z);
  P.baseYaw = sunYaw + THREE.MathUtils.degToRad(145);
  world.rotation.y = P.baseYaw;
  P.yaw = P.baseYaw;
  const center = new THREE.Vector3(0, 0, -55).applyAxisAngle(THREE.Object3D.DEFAULT_UP, P.baseYaw);
  sun.target.position.copy(center);
  sun.position.copy(sky.dir).multiplyScalar(220).add(center);

  // Materiallar va modellar
  const ground = pbr('ground', 140, { normalScale: new THREE.Vector2(1.2, 1.2) });
  const hillsMap = loadTex('hills_diff', 140, true);
  const concrete = pbr('concrete', 3);
  const planks = pbr('planks', 1);
  makeMaterials(planks);
  await Promise.all(['bolt_action_rifle_7_62', 'service_pistol', 'wooden_military_crate', 'old_military_crate', 'Barrel_01', 'barrel_03',
    'old_tyre', 'concrete_road_barrier_02', 'ammo_box', 'metal_jerrycan_green', 'wooden_table_02', 'rock_07', 'rock_09', 'shrub_03', 'shrub_sorrel_01'].map(loadModel));

  buildTerrain(ground, hillsMap);
  const props = new THREE.Group(); world.add(props);

  // Otish maydonchasi (beton) va tom
  const pad = new THREE.Mesh(new THREE.BoxGeometry(16, 0.25, 5), concrete);
  pad.position.set(0, 0.125, 1.3); pad.receiveShadow = pad.castShadow = true; props.add(pad);
  const roofMat = planks;
  for (const x of [-7.6, -2.6, 2.6, 7.6]) for (const z of [-1.1, 3.6]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.16, 3.4, 0.16), roofMat); post.position.set(x, 0.25 + 1.7, z); post.castShadow = true; props.add(post);
  }
  const roof = new THREE.Mesh(new THREE.BoxGeometry(16.6, 0.12, 5.6), roofMat);
  roof.position.set(0, 3.75, 1.25); roof.rotation.x = -0.06; roof.castShadow = roof.receiveShadow = true; props.add(roof);
  const beam = new THREE.Mesh(new THREE.BoxGeometry(16.4, 0.2, 0.18), roofMat); beam.position.set(0, 3.55, -1.1); beam.castShadow = true; props.add(beam);

  // Stollar va buyumlar
  place('wooden_table_02', 0, 0.25, -0.75, 0, 1, props);
  place('wooden_table_02', -3.2, 0.25, -0.75, 0, 1, props);
  place('wooden_table_02', 3.2, 0.25, -0.75, 0, 1, props);
  place('ammo_box', 0.38, 1.05, -0.8, 0.3, 1, props);
  place('ammo_box', -3.0, 1.05, -0.7, -0.4, 1, props);
  place('metal_jerrycan_green', 3.5, 1.05, -0.7, 2.5, 1, props);
  place('old_military_crate', -5.8, 0.25, 0.6, 0.2, 1, props);
  place('wooden_military_crate', 5.6, 0.25, 0.8, -0.3, 1, props);
  place('wooden_military_crate', 5.7, 0.68, 0.8, -0.2, 1, props);

  // Yo'lak chegaralari: beton to'siqlar (faqat yaqinida — telefon uchun yengil)
  for (const x of [-8.6, 8.6]) for (let i = 0; i < 3; i++) place('concrete_road_barrier_02', x, groundH(x, -3 - i * 1.6), -3 - i * 1.6, Math.PI / 2, 1, props);

  // Nishonlar atrofida bochka, yashik, shinalar
  const scatter = [
    ['Barrel_01', -11, -22], ['barrel_03', -10.3, -22.6], ['Barrel_01', 12, -35], ['barrel_03', 14, -58], ['Barrel_01', -15, -64],
    ['wooden_military_crate', 9, -24], ['old_military_crate', -13, -44], ['wooden_military_crate', 16, -76], ['old_military_crate', -6, -88],
  ];
  for (const [n, x, z] of scatter) place(n, x, groundH(x, z), z, rand(0, 6), 1, props);
  for (const [x, z] of [[-4, -30], [7, -46], [-9, -70], [3, -96]]) {
    for (let i = 0; i < 3; i++) { const t = place('old_tyre', x + i * 0.62, groundH(x, z) + 0.08, z, 0, 1, props); t.rotation.x = -Math.PI / 2; t.rotation.z = rand(0, 3); }
    const top = place('old_tyre', x + 0.62, groundH(x, z) + 0.25, z, 0, 1, props); top.rotation.x = -Math.PI / 2;
  }
  // Tepaliklarda toshlar va butalar
  for (let i = 0; i < 26; i++) {
    const side = Math.random() < 0.5 ? -1 : 1;
    const x = side * rand(26, 40), z = -rand(5, 120);
    place(Math.random() < 0.5 ? 'rock_07' : 'rock_09', x, groundH(x, z) - 0.1, z, rand(0, 6), rand(6, 14), props);
  }
  for (let i = 0; i < 14; i++) { const x = rand(-30, 30), z = -rand(118, 130); place('rock_07', x, groundH(x, z) - 0.2, z, rand(0, 6), rand(8, 16), props); }
  for (let i = 0; i < 40; i++) {
    const x = (Math.random() < 0.5 ? -1 : 1) * rand(14, 38), z = -rand(4, 115);
    place('shrub_03', x, groundH(x, z), z, rand(0, 6), rand(2, 3.5), props);
  }
  for (let i = 0; i < 60; i++) { const x = rand(-22, 22), z = -rand(8, 110); place('shrub_sorrel_01', x, groundH(x, z), z, rand(0, 6), rand(3, 5), props); }

  solid = [terrain, props];
  setupViewGuns(); showGun();
  setupFX();
  demoTargets();
}

// =====================================================================
// ASOSIY SIKL
// =====================================================================
let last = performance.now();
function frame(now) {
  const dt = clamp((now - last) / 1000, 0, 0.05); last = now;
  time += dt;
  const portrait = checkOrientation();
  if (G.phase === 'play' && !paused && !portrait) updateGame(dt);
  if (G.phase === 'play' || G.phase === 'over' || paused) {
    updateView(dt); updateHUD();
  } else if (G.phase === 'menu') {
    menuCamT += dt * 0.05;
    const p = new THREE.Vector3(Math.sin(menuCamT) * 5, 2.1 + Math.sin(menuCamT * 0.7) * 0.3, -2.2).applyAxisAngle(THREE.Object3D.DEFAULT_UP, P.baseYaw);
    camera.position.copy(p); camera.fov = 60; camera.updateProjectionMatrix();
    camera.rotation.set(-0.03, P.baseYaw + Math.sin(menuCamT * 0.8) * 0.15 - 0.2, 0);
    viewHolder.visible = false;
  }
  updateFX(dt);
  popT = Math.max(0, popT - dt); bannerT = Math.max(0, bannerT - dt);
  for (const t of targets) if (t.kind === 'paper' && t.state === 'up') t.pivot.rotation.z = Math.sin(time * 1.3 + t.base.z) * 0.01;
  trackFps(dt);
  if (G.phase !== 'loading') {
    if (QUALITY[quality].bloom && composer) composer.render(); else renderer.render(scene, camera);
  }
  requestAnimationFrame(frame);
}

applyQuality(quality);
document.querySelectorAll('#qSeg button').forEach(b => b.classList.toggle('on', b.dataset.q === qMode));
updateBest();
requestAnimationFrame(frame);
build().then(() => {
  G.phase = 'menu';
  $('loading').remove();
  showScreen('menu');
  window.__ready = true;
}).catch(err => {
  console.error(err);
  $('loadPct').textContent = 'Yuklashda xato: internetni tekshirib, sahifani yangilang.';
});
