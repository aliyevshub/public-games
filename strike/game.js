// Strike Zone — taktik otishma (1-bosqich)
import * as THREE from './three.module.min.js';

const $ = id => document.getElementById(id);
const rand = (a, b) => a + Math.random() * (b - a);
const randInt = ([a, b]) => Math.floor(rand(a, b + 1));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const angDiff = (a, b) => { let d = (b - a) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return d; };
const yawTo = (from, to) => Math.atan2(-(to.x - from.x), -(to.z - from.z));

// =====================================================================
// XARITA  (# — devor, c — yashik, . — yo'l)
// =====================================================================
const MAP = [
  '############################',
  '#.......#........#.........#',
  '#...c...#..c..c..#.....c...#',
  '#.......#........#.........#',
  '#...######...cc...######...#',
  '#..........................#',
  '#..c....###......###....c..#',
  '#.......#..........#.......#',
  '####....#...c..c...#....####',
  '#.......#..........#.......#',
  '#..c....###......###....c..#',
  '#..........................#',
  '#...######...cc...######...#',
  '#.......#........#.........#',
  '#...c...#..c..c..#.....c...#',
  '#.......#........#.........#',
  '############################',
];
const CELL = 3, WALL_H = 4.6, CRATE_H = 1.9, CRATE_S = 2.4, EYE = 1.62, RAD = 0.36;
const ROWS = MAP.length, COLS = MAP[0].length;
const at = (c, r) => (r < 0 || r >= ROWS || c < 0 || c >= COLS) ? '#' : MAP[r][c];
const walk = (c, r) => at(c, r) === '.';
const OPEN = [];
for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (walk(c, r)) OPEN.push({ c, r });
const SPAWNS = [
  [[2, 5], [2, 7], [2, 9], [2, 11]],
  [[25, 5], [25, 7], [25, 9], [25, 11]],
];

function boxOf(c, r) {
  const ch = at(c, r);
  if (ch === '#') return { x0: c * CELL, x1: (c + 1) * CELL, z0: r * CELL, z1: (r + 1) * CELL, h: WALL_H };
  if (ch === 'c') { const m = (CELL - CRATE_S) / 2; return { x0: c * CELL + m, x1: (c + 1) * CELL - m, z0: r * CELL + m, z1: (r + 1) * CELL - m, h: CRATE_H }; }
  return null;
}
function collide(p) {
  for (let it = 0; it < 2; it++) {
    const c0 = Math.floor(p.x / CELL), r0 = Math.floor(p.z / CELL);
    for (let r = r0 - 1; r <= r0 + 1; r++) for (let c = c0 - 1; c <= c0 + 1; c++) {
      const b = boxOf(c, r); if (!b) continue;
      const qx = clamp(p.x, b.x0, b.x1), qz = clamp(p.z, b.z0, b.z1);
      const dx = p.x - qx, dz = p.z - qz, d2 = dx * dx + dz * dz;
      if (d2 >= RAD * RAD) continue;
      if (d2 > 1e-8) { const d = Math.sqrt(d2); p.x += dx / d * (RAD - d); p.z += dz / d * (RAD - d); }
      else {
        const l = p.x - b.x0, rr = b.x1 - p.x, t = p.z - b.z0, bb = b.z1 - p.z, m = Math.min(l, rr, t, bb);
        if (m === l) p.x = b.x0 - RAD; else if (m === rr) p.x = b.x1 + RAD; else if (m === t) p.z = b.z0 - RAD; else p.z = b.z1 + RAD;
      }
    }
  }
}
function blockedAt(x, z, y) {
  const b = boxOf(Math.floor(x / CELL), Math.floor(z / CELL));
  return !!b && y <= b.h && x >= b.x0 && x <= b.x1 && z >= b.z0 && z <= b.z1;
}
function los(a, b) {
  const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
  const n = Math.ceil(Math.hypot(dx, dz) / 0.35);
  for (let i = 1; i < n; i++) { const t = i / n; if (blockedAt(a.x + dx * t, a.z + dz * t, a.y + dy * t)) return false; }
  return true;
}
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
function findPath(sx, sz, gx, gz) {
  const sc = Math.floor(sx / CELL), sr = Math.floor(sz / CELL), gc = Math.floor(gx / CELL), gr = Math.floor(gz / CELL);
  if (!walk(gc, gr)) return null;
  const prev = new Int32Array(ROWS * COLS).fill(-1);
  const s = sr * COLS + sc, g = gr * COLS + gc;
  const q = [s]; prev[s] = s; let h = 0;
  while (h < q.length) {
    const k = q[h++]; if (k === g) break;
    const c = k % COLS, r = (k / COLS) | 0;
    for (const [dc, dr] of DIRS) {
      const nc = c + dc, nr = r + dr;
      if (!walk(nc, nr)) continue;
      if (dc && dr && (!walk(c + dc, r) || !walk(c, r + dr))) continue;
      const nk = nr * COLS + nc;
      if (prev[nk] !== -1) continue;
      prev[nk] = k; q.push(nk);
    }
  }
  if (prev[g] === -1) return null;
  const path = []; let k = g;
  while (k !== s) { path.push({ x: (k % COLS + 0.5) * CELL + rand(-0.5, 0.5), z: (((k / COLS) | 0) + 0.5) * CELL + rand(-0.5, 0.5) }); k = prev[k]; }
  return path.reverse();
}

// =====================================================================
// RENDER
// =====================================================================
const canvas = $('gl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.autoClear = false;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9cc6ea);
scene.fog = new THREE.Fog(0xd9cba9, 30, 95);
const camera = new THREE.PerspectiveCamera(72, 1, 0.05, 220);
camera.rotation.order = 'YXZ';
scene.add(camera);
scene.add(new THREE.HemisphereLight(0xfff3dc, 0x8a7350, 1.05));
const sun = new THREE.DirectionalLight(0xffffff, 1.5);
sun.position.set(40, 60, 25); scene.add(sun);

function canvasTex(size, draw, rx = 1, ry = 1) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rx, ry);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}
function noise(g, s, n, a, col) { for (let i = 0; i < n; i++) { g.fillStyle = `rgba(${col},${Math.random() * a})`; g.fillRect(Math.random() * s, Math.random() * s, rand(1, 3), rand(1, 3)); } }

const floorTex = canvasTex(256, (g, s) => {
  g.fillStyle = '#d6bd8b'; g.fillRect(0, 0, s, s);
  noise(g, s, 2500, 0.25, '120,90,50'); noise(g, s, 1200, 0.25, '255,240,210');
  g.strokeStyle = 'rgba(110,80,40,.35)'; g.lineWidth = 3;
  g.strokeRect(1.5, 1.5, s - 3, s - 3); g.beginPath(); g.moveTo(s / 2, 0); g.lineTo(s / 2, s); g.moveTo(0, s / 2); g.lineTo(s, s / 2); g.stroke();
}, COLS, ROWS);
const wallTex = canvasTex(256, (g, s) => {
  g.fillStyle = '#cfae77'; g.fillRect(0, 0, s, s);
  const rows = 9, bh = s / rows;
  for (let r = 0; r < rows; r++) {
    const off = (r % 2) * (s / 6);
    for (let x = -off; x < s; x += s / 3) {
      const l = 70 + Math.random() * 12;
      g.fillStyle = `hsl(36,${38 + Math.random() * 10}%,${l}%)`;
      g.fillRect(x + 2, r * bh + 2, s / 3 - 4, bh - 4);
    }
  }
  noise(g, s, 1800, 0.18, '90,60,30');
  const grd = g.createLinearGradient(0, 0, 0, s); grd.addColorStop(0, 'rgba(0,0,0,0)'); grd.addColorStop(1, 'rgba(60,35,10,.35)');
  g.fillStyle = grd; g.fillRect(0, 0, s, s);
});
const crateTex = canvasTex(256, (g, s) => {
  g.fillStyle = '#a5733f'; g.fillRect(0, 0, s, s);
  for (let y = 0; y < s; y += s / 6) { g.fillStyle = `hsl(28,${45 + Math.random() * 10}%,${36 + Math.random() * 8}%)`; g.fillRect(0, y + 2, s, s / 6 - 4); }
  noise(g, s, 900, 0.2, '50,25,5');
  g.strokeStyle = '#6b4320'; g.lineWidth = 22; g.strokeRect(11, 11, s - 22, s - 22);
  g.beginPath(); g.moveTo(16, 16); g.lineTo(s - 16, s - 16); g.stroke();
  g.fillStyle = '#3a3a3a'; for (const [x, y] of [[14, 14], [s - 14, 14], [14, s - 14], [s - 14, s - 14]]) { g.beginPath(); g.arc(x, y, 5, 0, 7); g.fill(); }
});

const floor = new THREE.Mesh(new THREE.PlaneGeometry(COLS * CELL, ROWS * CELL), new THREE.MeshLambertMaterial({ map: floorTex }));
floor.rotation.x = -Math.PI / 2; floor.position.set(COLS * CELL / 2, 0, ROWS * CELL / 2);
scene.add(floor);
const walls = [], crates = [];
for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) { if (MAP[r][c] === '#') walls.push([c, r]); if (MAP[r][c] === 'c') crates.push([c, r]); }
const wallMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(CELL, WALL_H, CELL), new THREE.MeshLambertMaterial({ map: wallTex }), walls.length);
const crateMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(CRATE_S, CRATE_H, CRATE_S), new THREE.MeshLambertMaterial({ map: crateTex }), crates.length);
const m4 = new THREE.Matrix4(), col = new THREE.Color();
walls.forEach(([c, r], i) => {
  m4.makeTranslation((c + 0.5) * CELL, WALL_H / 2, (r + 0.5) * CELL); wallMesh.setMatrixAt(i, m4);
  wallMesh.setColorAt(i, col.setHSL(0.09, 0.2, 0.86 + Math.random() * 0.14));
});
crates.forEach(([c, r], i) => {
  m4.makeRotationY((Math.random() - 0.5) * 0.25).setPosition((c + 0.5) * CELL, CRATE_H / 2, (r + 0.5) * CELL); crateMesh.setMatrixAt(i, m4);
});
scene.add(wallMesh, crateMesh);
const WORLD = [wallMesh, crateMesh, floor];

// =====================================================================
// BOT MODELI
// =====================================================================
const BG = {
  leg: new THREE.BoxGeometry(0.44, 0.86, 0.3), torso: new THREE.BoxGeometry(0.6, 0.72, 0.36),
  head: new THREE.SphereGeometry(0.17, 14, 10), helmet: new THREE.SphereGeometry(0.195, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2),
  arm: new THREE.BoxGeometry(0.15, 0.15, 0.5), gun: new THREE.BoxGeometry(0.08, 0.1, 0.7), vest: new THREE.BoxGeometry(0.62, 0.42, 0.4),
};
const TEAM_MAT = [
  { torso: new THREE.MeshLambertMaterial({ color: 0x3d6fd1 }), helmet: new THREE.MeshLambertMaterial({ color: 0x1f3a75 }), leg: new THREE.MeshLambertMaterial({ color: 0x2e3440 }), vest: new THREE.MeshLambertMaterial({ color: 0x24324a }) },
  { torso: new THREE.MeshLambertMaterial({ color: 0xc2452f }), helmet: new THREE.MeshLambertMaterial({ color: 0x5e2014 }), leg: new THREE.MeshLambertMaterial({ color: 0x4b3d2a }), vest: new THREE.MeshLambertMaterial({ color: 0x3a2a1a }) },
];
const SKIN = new THREE.MeshLambertMaterial({ color: 0xd9a77e }), GUNM = new THREE.MeshLambertMaterial({ color: 0x1e1e1e });

function makeBotMesh(team, unit) {
  const g = new THREE.Group(), body = new THREE.Group(); g.add(body);
  const M = TEAM_MAT[team];
  const add = (geo, mat, x, y, z, head = false, rx = 0) => {
    const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.x = rx;
    m.userData = { unit, head }; body.add(m); return m;
  };
  add(BG.leg, M.leg, 0, 0.43, 0);
  add(BG.torso, M.torso, 0, 1.22, 0);
  add(BG.vest, M.vest, 0, 1.28, 0);
  add(BG.head, SKIN, 0, 1.76, 0, true);
  add(BG.helmet, M.helmet, 0, 1.79, 0, true);
  add(BG.arm, M.torso, 0.3, 1.33, -0.2, false, 0.15);
  add(BG.arm, M.torso, -0.22, 1.3, -0.3, false, 0.3).rotation.y = -0.5;
  add(BG.gun, GUNM, 0.16, 1.34, -0.45);
  g.userData.body = body;
  scene.add(g);
  return g;
}

// =====================================================================
// QUROLLAR
// =====================================================================
const WEAPONS = {
  rifle: { name: 'Burgut-7', auto: true, rate: 0.1, dmg: 33, head: 115, mag: 30, reserve: 90, reload: 2.3, spread: 0.0035, move: 0.04, rec: 0.007, recMax: 0.055, kick: 0.013, speed: 5.0, sound: 1 },
  pistol: { name: 'Lochin', auto: false, rate: 0.16, dmg: 27, head: 98, mag: 12, reserve: 48, reload: 1.6, spread: 0.005, move: 0.022, rec: 0.012, recMax: 0.04, kick: 0.022, speed: 5.6, sound: 0 },
};
const DIFF = {
  easy:   { acc: 0.14, head: 0.07, react: 0.8,  turn: 3.2, burst: [2, 4] },
  normal: { acc: 0.24, head: 0.12, react: 0.48, turn: 4.8, burst: [3, 6] },
  hard:   { acc: 0.36, head: 0.19, react: 0.27, turn: 7.5, burst: [4, 8] },
};
let D = DIFF.normal;

// =====================================================================
// O'YINCHI QUROLI (ko'rinadigan model)
// =====================================================================
const wScene = new THREE.Scene();
const wCam = new THREE.PerspectiveCamera(58, 1, 0.01, 10);
wScene.add(new THREE.HemisphereLight(0xffffff, 0x6b5a45, 1.3));
const wl = new THREE.DirectionalLight(0xffffff, 1.2); wl.position.set(1, 2, 1.5); wScene.add(wl);
const flashTex = canvasTex(64, (g, s) => {
  const r = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  r.addColorStop(0, 'rgba(255,255,230,1)'); r.addColorStop(0.3, 'rgba(255,200,80,.9)'); r.addColorStop(1, 'rgba(255,120,0,0)');
  g.fillStyle = r; g.fillRect(0, 0, s, s);
});
const flashMat = new THREE.SpriteMaterial({ map: flashTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });

function box(w, h, d, color, x, y, z, rx = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshLambertMaterial({ color }));
  m.position.set(x, y, z); m.rotation.x = rx; return m;
}
function buildRifle() {
  const g = new THREE.Group();
  g.add(box(0.07, 0.11, 0.44, 0x2a2a2a, 0, 0, 0));
  g.add(box(0.075, 0.085, 0.26, 0x7a4a24, 0, -0.012, -0.3));
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.3, 8), new THREE.MeshLambertMaterial({ color: 0x151515 }));
  barrel.rotation.x = Math.PI / 2; barrel.position.set(0, 0.02, -0.55); g.add(barrel);
  g.add(box(0.05, 0.19, 0.085, 0x333333, 0, -0.13, -0.09, 0.3));
  g.add(box(0.06, 0.11, 0.26, 0x7a4a24, 0, -0.03, 0.32));
  g.add(box(0.05, 0.12, 0.06, 0x222222, 0, -0.1, 0.1, -0.3));
  g.add(box(0.02, 0.045, 0.02, 0x111111, 0, 0.075, -0.5));
  g.add(box(0.03, 0.03, 0.12, 0x111111, 0, 0.07, 0.05));
  g.add(box(0.1, 0.09, 0.2, 0xc99673, -0.01, -0.07, -0.3));
  g.add(box(0.1, 0.1, 0.16, 0x3a3a3a, 0.01, -0.12, 0.1));
  g.userData.muzzle = new THREE.Vector3(0, 0.02, -0.72);
  g.userData.rest = new THREE.Vector3(0.22, -0.2, -0.42);
  return g;
}
function buildPistol() {
  const g = new THREE.Group();
  g.add(box(0.05, 0.065, 0.22, 0x2b2b2b, 0, 0, 0));
  g.add(box(0.044, 0.13, 0.065, 0x1a1a1a, 0, -0.085, 0.07, -0.25));
  g.add(box(0.015, 0.02, 0.015, 0x111111, 0, 0.042, -0.095));
  g.add(box(0.095, 0.1, 0.14, 0xc99673, 0, -0.1, 0.1));
  g.userData.muzzle = new THREE.Vector3(0, 0.01, -0.13);
  g.userData.rest = new THREE.Vector3(0.17, -0.16, -0.34);
  return g;
}
const viewGuns = { rifle: buildRifle(), pistol: buildPistol() };
const holder = new THREE.Group(); wScene.add(holder);
for (const k in viewGuns) { holder.add(viewGuns[k]); viewGuns[k].visible = false; }
const vFlash = new THREE.Sprite(flashMat); vFlash.scale.set(0.3, 0.3, 0.3); vFlash.visible = false; wScene.add(vFlash);

// =====================================================================
// EFFEKTLAR
// =====================================================================
const tracerGeo = new THREE.BoxGeometry(0.025, 0.025, 1); tracerGeo.translate(0, 0, -0.5);
const tracers = Array.from({ length: 40 }, () => {
  const m = new THREE.Mesh(tracerGeo, new THREE.MeshBasicMaterial({ color: 0xffe9a0, transparent: true, opacity: 0.8, depthWrite: false }));
  m.visible = false; m.userData.life = 0; scene.add(m); return m;
});
let tracerI = 0;
function tracer(from, to) {
  const t = tracers[tracerI++ % tracers.length];
  t.position.copy(from); t.lookAt(to); t.scale.set(1, 1, from.distanceTo(to));
  t.visible = true; t.userData.life = 0.06; t.material.opacity = 0.85;
}
const sparkGeo = new THREE.BoxGeometry(0.06, 0.06, 0.06);
const sparks = Array.from({ length: 90 }, () => {
  const m = new THREE.Mesh(sparkGeo, new THREE.MeshBasicMaterial({ color: 0xffffff }));
  m.visible = false; m.userData.v = new THREE.Vector3(); m.userData.life = 0; scene.add(m); return m;
});
let sparkI = 0;
function burst(p, color, n = 6, spd = 3) {
  for (let i = 0; i < n; i++) {
    const s = sparks[sparkI++ % sparks.length];
    s.position.copy(p); s.material.color.set(color);
    s.userData.v.set(rand(-1, 1), rand(0.2, 1.4), rand(-1, 1)).multiplyScalar(spd);
    s.userData.life = rand(0.25, 0.5); s.visible = true;
  }
}
const botFlashes = Array.from({ length: 10 }, () => { const s = new THREE.Sprite(flashMat); s.scale.set(0.7, 0.7, 0.7); s.visible = false; s.userData.life = 0; scene.add(s); return s; });
let bfI = 0;
function botFlash(p) { const s = botFlashes[bfI++ % botFlashes.length]; s.position.copy(p); s.visible = true; s.userData.life = 0.05; }

// =====================================================================
// OVOZ
// =====================================================================
let actx = null, noiseBuf = null, master = null;
function initAudio() {
  if (actx) { if (actx.state === 'suspended') actx.resume(); return; }
  try {
    actx = new (window.AudioContext || window.webkitAudioContext)();
    master = actx.createGain(); master.gain.value = 0.8; master.connect(actx.destination);
    noiseBuf = actx.createBuffer(1, actx.sampleRate * 0.6, actx.sampleRate);
    const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  } catch (e) { actx = null; }
}
function gunSound(vol, heavy) {
  if (!actx || vol < 0.02) return;
  const t = actx.currentTime;
  const src = actx.createBufferSource(); src.buffer = noiseBuf;
  const f = actx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(heavy ? 2600 : 3600, t); f.frequency.exponentialRampToValueAtTime(400, t + 0.2);
  const g = actx.createGain(); g.gain.setValueAtTime(vol * 0.9, t); g.gain.exponentialRampToValueAtTime(0.0001, t + (heavy ? 0.28 : 0.2));
  src.connect(f); f.connect(g); g.connect(master); src.start(t); src.stop(t + 0.3);
  const o = actx.createOscillator(), og = actx.createGain();
  o.frequency.setValueAtTime(heavy ? 140 : 190, t); o.frequency.exponentialRampToValueAtTime(45, t + 0.15);
  og.gain.setValueAtTime(vol * 0.8, t); og.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
  o.connect(og); og.connect(master); o.start(t); o.stop(t + 0.17);
}
function tone(f1, f2, len, vol, type = 'sine', delay = 0) {
  if (!actx) return;
  const t = actx.currentTime + delay, o = actx.createOscillator(), g = actx.createGain();
  o.type = type; o.frequency.setValueAtTime(f1, t); o.frequency.exponentialRampToValueAtTime(f2, t + len);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + len);
  o.connect(g); g.connect(master); o.start(t); o.stop(t + len);
}
const sfx = {
  click: () => tone(1800, 1200, 0.03, 0.15, 'square'),
  reload: () => { tone(900, 600, 0.05, 0.15, 'square'); tone(700, 1100, 0.06, 0.15, 'square', 0.35); },
  hit: () => tone(1300, 1100, 0.05, 0.18, 'triangle'),
  head: () => { tone(1900, 1900, 0.08, 0.2, 'sine'); tone(2600, 2600, 0.12, 0.15, 'sine', 0.05); },
  hurt: () => tone(140, 60, 0.18, 0.4, 'sawtooth'),
  start: () => { tone(660, 660, 0.12, 0.2); tone(880, 880, 0.18, 0.2, 'sine', 0.15); },
  win: () => { [523, 659, 784, 1047].forEach((f, i) => tone(f, f, 0.2, 0.18, 'square', i * 0.12)); },
  lose: () => { [400, 330, 260].forEach((f, i) => tone(f, f * 0.95, 0.25, 0.18, 'square', i * 0.18)); },
};

// =====================================================================
// BIRLIKLAR (o'yinchi + botlar)
// =====================================================================
const NAMES = [['Akmal', 'Bobur', 'Dilshod'], ['Jasur', 'Sardor', 'Timur', 'Otabek']];
let units = [], P = null;

function makeUnit(team, name, isPlayer) {
  const u = {
    team, name, isPlayer, pos: new THREE.Vector3(), yaw: 0, pitch: 0, hp: 100, alive: true,
    kills: 0, deaths: 0, hs: 0, moving: false, hurtT: -99,
    path: null, pi: 0, goal: null, target: null, react: 0, fireT: 0, burst: 3, pauseT: 0, thinkT: 0,
    lastSeen: null, lastSeenT: -99, repathT: 0, strafe: 0, strafeT: 0, deadT: 0, bob: 0,
  };
  if (!isPlayer) u.mesh = makeBotMesh(team, u);
  return u;
}
function buildTeams() {
  for (const u of units) if (u.mesh) scene.remove(u.mesh);
  units = [];
  P = makeUnit(0, 'Siz', true);
  P.guns = {}; P.cur = 'rifle'; P.nextShot = 0; P.recoil = 0; P.kickP = 0; P.reloadEnd = 0; P.switchEnd = 0; P.semiReady = true; P.moveAmt = 0; P.walkPh = 0;
  units.push(P);
  for (const n of NAMES[0]) units.push(makeUnit(0, n, false));
  for (const n of NAMES[1]) units.push(makeUnit(1, n, false));
}

// =====================================================================
// RAUNDLAR
// =====================================================================
const WIN_ROUNDS = 5, ROUND_TIME = 105;
const R = { n: 0, score: [0, 0], phase: 'menu', t: 0, timer: ROUND_TIME };
let time = 0, spectate = null;

function startMatch() {
  buildTeams();
  R.n = 0; R.score = [0, 0];
  $('feed').innerHTML = '';
  startRound();
}
function startRound() {
  R.n++; R.phase = 'freeze'; R.t = 3; R.timer = ROUND_TIME;
  spectate = null;
  for (const t of [0, 1]) {
    const team = units.filter(u => u.team === t);
    const sp = SPAWNS[t].slice().sort(() => Math.random() - 0.5);
    if (t === 0) { const i = sp.findIndex(s => s[1] === 7); if (i > 0) [sp[0], sp[i]] = [sp[i], sp[0]]; }
    team.forEach((u, i) => {
      const [c, r] = sp[i % sp.length];
      u.pos.set((c + 0.5) * CELL + rand(-0.6, 0.6), 0, (r + 0.5) * CELL + rand(-0.6, 0.6));
      u.yaw = t === 0 ? -Math.PI / 2 : Math.PI / 2; u.pitch = 0;
      u.hp = 100; u.alive = true; u.path = null; u.goal = null; u.target = null; u.lastSeen = null; u.lastSeenT = -99; u.hurtT = -99;
      u.thinkT = rand(0, 0.2); u.repathT = 0; u.deadT = 0; u.pauseT = 0; u.burst = randInt(D.burst);
      if (u.mesh) { u.mesh.visible = true; u.mesh.userData.body.rotation.set(0, 0, 0); u.mesh.userData.body.position.set(0, 0, 0); }
    });
  }
  for (const k in WEAPONS) P.guns[k] = { mag: WEAPONS[k].mag, res: WEAPONS[k].reserve };
  P.cur = 'rifle'; P.recoil = 0; P.kickP = 0; P.reloadEnd = 0; P.switchEnd = 0;
  showGun();
  banner(`RAUND ${R.n}`, 'Tayyorlaning…', 2.6);
  $('dead').textContent = '';
}
function aliveCount(t) { return units.filter(u => u.team === t && u.alive).length; }
function checkRoundEnd() {
  if (R.phase !== 'live') return;
  const a0 = aliveCount(0), a1 = aliveCount(1);
  if (a0 === 0 || a1 === 0) endRound(a0 > 0 ? 0 : 1);
}
function endRound(w) {
  R.phase = 'end'; R.t = 4;
  if (w !== null) R.score[w]++;
  if (w === 0) { banner('RAUND SIZNIKI!', `${R.score[0]} : ${R.score[1]}`, 3.5); sfx.win(); }
  else if (w === 1) { banner('QIZILLAR YUTDI', `${R.score[0]} : ${R.score[1]}`, 3.5); sfx.lose(); }
  else banner('VAQT TUGADI', 'Durrang — hech kimga ochko yo\'q', 3.5);
}
function finishMatch() {
  R.phase = 'over';
  const won = R.score[0] > R.score[1];
  $('overTitle').textContent = won ? 'G\'ALABA!' : 'MAG\'LUBIYAT';
  $('overTitle').className = won ? 'win' : 'lose';
  $('overSub').textContent = `Ko'k ${R.score[0]} : ${R.score[1]} Qizil`;
  const rows = units.slice().sort((a, b) => b.kills - a.kills || a.deaths - b.deaths)
    .map(u => `<tr class="t${u.team}${u.isPlayer ? ' me' : ''}"><td>${u.name}</td><td>${u.kills}</td><td>${u.deaths}</td><td>${u.hs}</td></tr>`).join('');
  $('board').innerHTML = `<tr><th>O'yinchi</th><th>Qotil</th><th>O'lim</th><th>Bosh</th></tr>${rows}`;
  if (won) sfx.win(); else sfx.lose();
  showScreen('over');
}

// =====================================================================
// ZARAR VA O'LIM
// =====================================================================
let hurtFlash = 0, hitT = 0;
function damage(t, amt, src, head) {
  if (!t.alive || R.phase === 'over') return;
  t.hp -= amt; t.hurtT = time;
  if (!t.isPlayer) { t.lastSeen = src.pos.clone(); t.lastSeenT = time; }
  else { hurtFlash = 1; sfx.hurt(); if (navigator.vibrate) try { navigator.vibrate(40); } catch (e) {} }
  if (t.hp > 0) return;
  t.hp = 0; t.alive = false; t.deaths++; src.kills++; if (head) src.hs++;
  addFeed(src, t, head);
  if (t.isPlayer) {
    $('dead').innerHTML = `Halok bo'ldingiz — <b>${src.name}</b><br><small>Jamoadoshingiz kuzatilmoqda</small>`;
    showGun();
  }
  checkRoundEnd();
}
function addFeed(k, v, head) {
  const d = document.createElement('div');
  d.innerHTML = `<span class="t${k.team}">${k.name}</span> ▸ <span class="t${v.team}">${v.name}</span>${head ? ' <i>✛ bosh</i>' : ''}`;
  const f = $('feed'); f.prepend(d);
  while (f.children.length > 5) f.lastChild.remove();
  setTimeout(() => d.remove(), 6000);
}

// =====================================================================
// O'YINCHI: OTISH, O'QLASH, ALMASHTIRISH
// =====================================================================
const ray = new THREE.Raycaster(); ray.far = 160;
const tmpV = new THREE.Vector3(), tmpA = new THREE.Vector3(), tmpB = new THREE.Vector3(), eul = new THREE.Euler(0, 0, 0, 'YXZ');
const W = () => WEAPONS[P.cur];

function canAct() { return P.alive && R.phase !== 'freeze' && R.phase !== 'over' && R.phase !== 'menu' && time >= P.switchEnd; }
function startReload() {
  const w = W(), g = P.guns[P.cur];
  if (!P.alive || P.reloadEnd > time || g.mag >= w.mag || g.res <= 0) return;
  P.reloadEnd = time + w.reload; sfx.reload();
}
function switchWeapon() {
  if (!P.alive) return;
  P.cur = P.cur === 'rifle' ? 'pistol' : 'rifle';
  P.reloadEnd = 0; P.switchEnd = time + 0.45; P.recoil = 0;
  showGun(); sfx.click();
}
function showGun() {
  for (const k in viewGuns) viewGuns[k].visible = P && P.alive && k === P.cur;
}
function muzzleWorld(out) {
  return out.set(0.22, -0.17, -0.9).applyQuaternion(camera.quaternion).add(camera.position);
}
function tryFire() {
  if (!canAct()) return;
  const w = W(), g = P.guns[P.cur];
  if (P.reloadEnd > time || time < P.nextShot) return;
  if (!w.auto && !P.semiReady) return;
  if (g.mag <= 0) { sfx.click(); P.nextShot = time + 0.25; startReload(); return; }
  P.semiReady = false; P.nextShot = time + w.rate; g.mag--;
  const s = w.spread + P.moveAmt * w.move + P.recoil;
  P.recoil = Math.min(P.recoil + w.rec, w.recMax);
  P.kickP += w.kick;
  eul.set(P.pitch + P.kickP + rand(-s, s), P.yaw + rand(-s, s), 0);
  const dir = tmpV.set(0, 0, -1).applyEuler(eul);
  ray.set(camera.position, dir);
  const targets = WORLD.concat(units.filter(u => !u.isPlayer && u.alive && u.team !== 0).map(u => u.mesh));
  const hit = ray.intersectObjects(targets, true)[0];
  const end = hit ? hit.point : tmpA.copy(camera.position).addScaledVector(dir, 120);
  if (hit && hit.object.userData.unit) {
    const u = hit.object.userData.unit, head = hit.object.userData.head;
    const fall = clamp(1.15 - hit.distance / 120, 0.75, 1);
    damage(u, Math.round((head ? w.head : w.dmg) * fall), P, head);
    burst(hit.point, 0xb3122b, 7, 2.5);
    hitT = 0.18; $('hitm').className = head ? 'head' : '';
    head ? sfx.head() : sfx.hit();
  } else if (hit) burst(hit.point, 0xe8d6b0, 6, 3);
  tracer(muzzleWorld(tmpB), end);
  vFlash.userData.life = 0.045;
  gunSound(0.75, w.sound === 1);
  if (g.mag === 0) startReload();
}

// =====================================================================
// BOT SUN'IY INTELLEKTI
// =====================================================================
function pickGoal(b) {
  const half = COLS / 2;
  const pool = Math.random() < 0.7 ? OPEN.filter(o => (b.team === 0 ? o.c >= half - 2 : o.c <= half + 1)) : OPEN;
  const o = pool[Math.floor(Math.random() * pool.length)];
  b.goal = { x: (o.c + 0.5) * CELL, z: (o.r + 0.5) * CELL };
  b.path = null;
}
function botThink(b) {
  const eye = tmpA.set(b.pos.x, EYE, b.pos.z);
  let best = null, bd = 1e9;
  for (const e of units) {
    if (!e.alive || e.team === b.team) continue;
    const d = Math.hypot(e.pos.x - b.pos.x, e.pos.z - b.pos.z);
    if (d > 75) continue;
    const off = Math.abs(angDiff(b.yaw, yawTo(b.pos, e.pos)));
    if (off > 1.3 && d > 7 && time - b.hurtT > 1.5) continue;
    if (!los(eye, tmpB.set(e.pos.x, 1.45, e.pos.z))) continue;
    if (d < bd) { bd = d; best = e; }
  }
  if (best) {
    if (b.target !== best) { b.target = best; b.react = D.react * rand(0.8, 1.35); }
    b.lastSeen = best.pos.clone(); b.lastSeenT = time;
  } else b.target = null;
}
function botFire(b, t) {
  const d = Math.hypot(t.pos.x - b.pos.x, t.pos.z - b.pos.z);
  const tm = t.isPlayer ? P.moveAmt : (t.moving ? 1 : 0);
  const p = D.acc * clamp(1.35 - d / 40, 0.3, 1.2) * (tm > 0.3 ? 0.72 : 1);
  const hit = Math.random() < p, head = hit && Math.random() < D.head;
  const from = tmpA.set(0.16, 1.36, -0.85).applyAxisAngle(THREE.Object3D.DEFAULT_UP, b.yaw).add(b.pos);
  const to = tmpB.set(t.pos.x, head ? 1.75 : 1.15, t.pos.z);
  if (!hit) { to.x += rand(-0.9, 0.9); to.y += rand(-0.5, 0.8); to.z += rand(-0.9, 0.9); }
  if (!t.isPlayer || !hit) tracer(from, to);
  botFlash(from);
  const ear = spectate || P;
  gunSound(0.6 * clamp(1 - Math.hypot(ear.pos.x - b.pos.x, ear.pos.z - b.pos.z) / 70, 0.04, 1), true);
  if (hit) damage(t, head ? 100 : Math.round(rand(24, 32)), b, head);
}
const UP = new THREE.Vector3(0, 1, 0);
function botUpdate(b, dt) {
  if (!b.alive) {
    if (b.deadT < 1) {
      b.deadT += dt;
      const k = Math.min(1, b.deadT / 0.45), body = b.mesh.userData.body;
      body.rotation.x = k * Math.PI / 2 * 0.98; body.position.y = k * 0.15;
    }
    return;
  }
  b.thinkT -= dt;
  if (b.thinkT <= 0) { b.thinkT = 0.18; botThink(b); }
  let mx = 0, mz = 0, speed = 0;
  const t = b.target;
  if (t && t.alive) {
    const want = yawTo(b.pos, t.pos);
    const dy = angDiff(b.yaw, want);
    b.yaw += clamp(dy, -D.turn * dt, D.turn * dt);
    b.react -= dt;
    b.strafeT -= dt;
    if (b.strafeT <= 0) { b.strafeT = rand(0.4, 1.2); b.strafe = Math.random() < 0.3 ? 0 : (Math.random() < 0.5 ? -1 : 1); }
    mx = Math.cos(b.yaw) * b.strafe; mz = -Math.sin(b.yaw) * b.strafe; speed = 2.2;
    if (Math.abs(dy) < 0.13 && b.react <= 0) {
      if (b.pauseT > 0) b.pauseT -= dt;
      else {
        b.fireT -= dt;
        if (b.fireT <= 0) {
          botFire(b, t); b.fireT = 0.11; b.burst--;
          if (b.burst <= 0) { b.burst = randInt(D.burst); b.pauseT = rand(0.25, 0.6); }
        }
      }
    }
  } else {
    if (b.lastSeen && time - b.lastSeenT < 5) {
      if (!b.goal || Math.hypot(b.goal.x - b.lastSeen.x, b.goal.z - b.lastSeen.z) > 2) { b.goal = { x: b.lastSeen.x, z: b.lastSeen.z }; b.path = null; }
    } else if (!b.goal) pickGoal(b);
    b.repathT -= dt;
    if (!b.path || b.repathT <= 0) {
      b.path = findPath(b.pos.x, b.pos.z, b.goal.x, b.goal.z); b.pi = 0; b.repathT = 3;
      if (!b.path || !b.path.length) { pickGoal(b); b.path = null; }
    }
    if (b.path && b.pi < b.path.length) {
      const n = b.path[b.pi];
      const dx = n.x - b.pos.x, dz = n.z - b.pos.z, d = Math.hypot(dx, dz);
      if (d < 0.7) b.pi++;
      else {
        mx = dx / d; mz = dz / d; speed = 4.1;
        const want = Math.atan2(-mx, -mz);
        b.yaw += clamp(angDiff(b.yaw, want), -6 * dt, 6 * dt);
      }
    } else if (b.path) { b.goal = null; b.path = null; b.lastSeen = null; }
  }
  const ox = b.pos.x, oz = b.pos.z;
  b.pos.x += mx * speed * dt; b.pos.z += mz * speed * dt;
  collide(b.pos);
  b.moving = Math.hypot(b.pos.x - ox, b.pos.z - oz) > 0.5 * dt;
  if (b.moving) b.bob += dt * 10;
  b.mesh.position.set(b.pos.x, b.moving ? Math.abs(Math.sin(b.bob)) * 0.05 : 0, b.pos.z);
  b.mesh.rotation.y = b.yaw;
}
function separate() {
  for (let i = 0; i < units.length; i++) for (let j = i + 1; j < units.length; j++) {
    const a = units[i], b = units[j];
    if (!a.alive || !b.alive) continue;
    const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z, d = Math.hypot(dx, dz);
    if (d > 0 && d < 0.7) { const p = (0.7 - d) / 2; a.pos.x -= dx / d * p; a.pos.z -= dz / d * p; b.pos.x += dx / d * p; b.pos.z += dz / d * p; }
  }
}

// =====================================================================
// BOSHQARUV
// =====================================================================
const input = { fire: false, jx: 0, jy: 0, kx: 0, ky: 0 };
let sens = 1.1;
try { sens = +localStorage.getItem('sz.sens') || 1.1; } catch (e) {}
$('sens').value = sens;
$('sens').addEventListener('input', () => { sens = +$('sens').value; try { localStorage.setItem('sz.sens', String(sens)); } catch (e) {} });

function look(dx, dy) {
  if (!P || !P.alive) return;
  P.yaw -= dx * 0.0052 * sens;
  P.pitch = clamp(P.pitch - dy * 0.0052 * sens, -1.35, 1.35);
}
const touch = { joy: null, look: null, fires: new Map() };
const tUI = $('touch'), joyBase = $('joyBase'), joyKnob = $('joyKnob');
tUI.addEventListener('pointerdown', e => {
  e.preventDefault(); initAudio();
  const b = e.target.closest('[data-act]'), x = e.clientX, y = e.clientY;
  try { tUI.setPointerCapture(e.pointerId); } catch (err) {}
  if (b) {
    const a = b.dataset.act;
    if (a === 'fire') { touch.fires.set(e.pointerId, { x, y, el: b }); b.classList.add('on'); input.fire = true; }
    else if (a === 'reload') startReload();
    else if (a === 'switch') switchWeapon();
    else if (a === 'pause') pauseGame();
    return;
  }
  if (x < innerWidth * 0.42 && !touch.joy) {
    touch.joy = { id: e.pointerId, ox: x, oy: y };
    joyBase.hidden = joyKnob.hidden = false; $('joyHint').hidden = true;
    joyBase.style.left = joyKnob.style.left = x + 'px'; joyBase.style.top = joyKnob.style.top = y + 'px';
  } else if (!touch.look) touch.look = { id: e.pointerId, x, y };
});
tUI.addEventListener('pointermove', e => {
  const x = e.clientX, y = e.clientY;
  if (touch.joy && touch.joy.id === e.pointerId) {
    let dx = x - touch.joy.ox, dy = y - touch.joy.oy; const d = Math.hypot(dx, dy), max = 50;
    if (d > max) { dx = dx / d * max; dy = dy / d * max; }
    input.jx = dx / max; input.jy = dy / max;
    joyKnob.style.left = (touch.joy.ox + dx) + 'px'; joyKnob.style.top = (touch.joy.oy + dy) + 'px';
  } else if (touch.look && touch.look.id === e.pointerId) {
    look(x - touch.look.x, y - touch.look.y); touch.look.x = x; touch.look.y = y;
  } else if (touch.fires.has(e.pointerId)) {
    const f = touch.fires.get(e.pointerId); look(x - f.x, y - f.y); f.x = x; f.y = y;
  }
});
function endPointer(e) {
  if (touch.joy && touch.joy.id === e.pointerId) { touch.joy = null; input.jx = input.jy = 0; joyBase.hidden = joyKnob.hidden = true; $('joyHint').hidden = false; }
  if (touch.look && touch.look.id === e.pointerId) touch.look = null;
  if (touch.fires.has(e.pointerId)) {
    touch.fires.get(e.pointerId).el.classList.remove('on'); touch.fires.delete(e.pointerId);
    if (!touch.fires.size) { input.fire = false; P && (P.semiReady = true); }
  }
}
tUI.addEventListener('pointerup', endPointer);
tUI.addEventListener('pointercancel', endPointer);
document.addEventListener('touchmove', e => e.preventDefault(), { passive: false });
document.addEventListener('gesturestart', e => e.preventDefault());

// Kompyuter: klaviatura va sichqoncha
const keys = {};
const finePointer = matchMedia('(pointer: fine)').matches;
addEventListener('keydown', e => {
  keys[e.code] = true;
  if (e.code === 'KeyR') startReload();
  if (e.code === 'KeyQ' || e.code === 'Digit1' || e.code === 'Digit2') switchWeapon();
  if (e.code === 'Escape' && R.phase !== 'menu' && R.phase !== 'over') pauseGame();
});
addEventListener('keyup', e => keys[e.code] = false);
canvas.addEventListener('mousedown', () => {
  if (!finePointer || $('hud').hidden) return;
  initAudio();
  if (document.pointerLockElement !== canvas) { canvas.requestPointerLock?.(); return; }
  input.fire = true;
});
addEventListener('mouseup', () => { if (finePointer) { input.fire = false; P && (P.semiReady = true); } });
addEventListener('mousemove', e => { if (document.pointerLockElement === canvas) look(e.movementX * 0.6, e.movementY * 0.6); });

// =====================================================================
// INTERFEYS
// =====================================================================
let paused = false;
function showScreen(name) {
  for (const s of ['menu', 'pause', 'over', 'help']) $(s).hidden = s !== name;
  const inGame = name === null || name === 'pause';
  $('hud').hidden = !inGame && name !== 'over';
  $('touch').hidden = !(name === null) || finePointer;
  if (name !== null && document.pointerLockElement) document.exitPointerLock?.();
}
function pauseGame() { if (R.phase === 'menu' || R.phase === 'over') return; paused = true; input.fire = false; showScreen('pause'); }
function resumeGame() { paused = false; last = performance.now(); showScreen(null); }
let bannerT = 0;
function banner(title, sub, dur) { $('banner').innerHTML = `<b>${title}</b><span>${sub || ''}</span>`; bannerT = dur; }

let difficulty = 'normal';
try { difficulty = localStorage.getItem('sz.diff') || 'normal'; } catch (e) {}
function setDiff(d) {
  difficulty = DIFF[d] ? d : 'normal'; D = DIFF[difficulty];
  document.querySelectorAll('#diffSeg button').forEach(b => b.classList.toggle('on', b.dataset.d === difficulty));
  try { localStorage.setItem('sz.diff', difficulty); } catch (e) {}
}
setDiff(difficulty);
document.querySelectorAll('#diffSeg button').forEach(b => b.onclick = () => setDiff(b.dataset.d));
$('playBtn').onclick = () => { initAudio(); paused = false; showScreen(null); startMatch(); };
$('helpBtn').onclick = () => showScreen('help');
$('helpClose').onclick = () => showScreen('menu');
$('resumeBtn').onclick = resumeGame;
$('restartBtn').onclick = () => { paused = false; showScreen(null); startMatch(); };
const toMenu = () => { paused = false; R.phase = 'menu'; showScreen('menu'); };
$('menuBtn').onclick = toMenu;
$('overMenuBtn').onclick = toMenu;
$('againBtn').onclick = () => { paused = false; showScreen(null); startMatch(); };
document.addEventListener('visibilitychange', () => { if (document.hidden) pauseGame(); });

const isTouch = !finePointer;
function checkOrientation() {
  const portrait = isTouch && innerHeight > innerWidth;
  $('rotate').hidden = !portrait;
  return portrait;
}
function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = wCam.aspect = w / h;
  camera.updateProjectionMatrix(); wCam.updateProjectionMatrix();
  checkOrientation();
}
addEventListener('resize', resize);
addEventListener('orientationchange', () => setTimeout(resize, 250));
resize();

// =====================================================================
// ASOSIY SIKL
// =====================================================================
const hud = { hp: '', ammo: '', clock: '', s: '', gap: '' };
function updateHUD() {
  if (!P) return;
  const g = P.guns[P.cur], w = W();
  const hp = `✚ ${Math.max(0, Math.ceil(P.hp))}`;
  if (hp !== hud.hp) { hud.hp = hp; $('hp').textContent = hp; $('hp').className = P.hp <= 30 ? 'low' : ''; }
  const reloading = P.reloadEnd > time;
  const ammo = reloading ? 'O\'qlanmoqda…' : `${g.mag} <small>/ ${g.res}</small>`;
  if (ammo !== hud.ammo) { hud.ammo = ammo; $('ammo').innerHTML = ammo; $('wname').textContent = w.name; }
  const tt = R.phase === 'freeze' ? Math.ceil(R.t) : Math.max(0, Math.ceil(R.timer));
  const clock = R.phase === 'freeze' ? `0:0${tt}` : `${Math.floor(tt / 60)}:${String(tt % 60).padStart(2, '0')}`;
  if (clock !== hud.clock) { hud.clock = clock; $('clock').textContent = clock; }
  const s = `${R.score[0]}|${R.score[1]}`;
  if (s !== hud.s) { hud.s = s; $('s0').textContent = R.score[0]; $('s1').textContent = R.score[1]; }
  const gap = Math.round(7 + (w.spread + P.moveAmt * w.move + P.recoil) * 520) + 'px';
  if (gap !== hud.gap) { hud.gap = gap; $('cross').style.setProperty('--g', gap); }
  $('cross').style.display = P.alive ? '' : 'none';
  $('hitm').style.opacity = hitT > 0 ? Math.min(1, hitT * 8) : 0;
  $('vig').style.opacity = Math.max(hurtFlash * 0.9, P.alive && P.hp <= 30 ? 0.35 : 0);
  $('banner').style.opacity = bannerT > 0 ? Math.min(1, bannerT * 2) : 0;
}

function updatePlayer(dt) {
  const w = W();
  let mx = input.jx + ((keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0));
  let my = input.jy + ((keys.KeyS ? 1 : 0) - (keys.KeyW ? 1 : 0));
  const l = Math.hypot(mx, my); if (l > 1) { mx /= l; my /= l; }
  if (!P.alive || R.phase === 'freeze') { mx = my = 0; }
  P.moveAmt = Math.min(1, Math.hypot(mx, my));
  const sy = Math.sin(P.yaw), cy = Math.cos(P.yaw);
  const vx = (-sy * -my + cy * mx) * w.speed, vz = (-cy * -my - sy * mx) * w.speed;
  if (P.alive) { P.pos.x += vx * dt; P.pos.z += vz * dt; collide(P.pos); }
  if (P.moveAmt > 0.1) P.walkPh += dt * 9 * P.moveAmt;
  if (P.reloadEnd && time >= P.reloadEnd) {
    const g = P.guns[P.cur], need = w.mag - g.mag, take = Math.min(need, g.res);
    g.mag += take; g.res -= take; P.reloadEnd = 0;
  }
  if (input.fire) tryFire(); else P.semiReady = true;
  P.recoil = Math.max(0, P.recoil - dt * (input.fire ? 0.03 : 0.12));
  P.kickP = Math.max(0, P.kickP - dt * 0.25 - P.kickP * dt * 6);
}

function updateCamera() {
  if (P.alive || !spectate || !spectate.alive) {
    if (!P.alive) {
      spectate = units.find(u => u.team === 0 && u.alive && !u.isPlayer) || null;
      for (const u of units) if (u.mesh) u.mesh.visible = true;
      if (spectate) spectate.mesh.visible = false;
    }
  }
  if (P.alive || !spectate) {
    const bob = P.alive ? Math.sin(P.walkPh * 2) * 0.035 * P.moveAmt : -1.1;
    camera.position.set(P.pos.x, EYE + bob, P.pos.z);
    camera.rotation.set(P.pitch + P.kickP, P.yaw, 0);
  } else {
    camera.position.set(spectate.pos.x, EYE, spectate.pos.z);
    camera.rotation.set(0, spectate.yaw, 0);
  }
}

function updateViewGun(dt) {
  const g = viewGuns[P.cur], rest = g.userData.rest;
  const bobX = Math.sin(P.walkPh) * 0.012 * P.moveAmt, bobY = Math.abs(Math.cos(P.walkPh)) * 0.012 * P.moveAmt;
  let down = 0;
  if (P.reloadEnd > time) { const k = 1 - (P.reloadEnd - time) / W().reload; down = Math.sin(k * Math.PI) * 0.7; }
  if (time < P.switchEnd) down = Math.max(down, (P.switchEnd - time) / 0.45 * 0.9);
  holder.position.set(rest.x + bobX, rest.y - bobY - down * 0.15, rest.z + P.kickP * 3.2);
  holder.rotation.set(P.kickP * 6 - down, 0, 0);
  if (vFlash.userData.life > 0) {
    vFlash.userData.life -= dt; vFlash.visible = g.visible;
    vFlash.position.copy(g.userData.muzzle).applyMatrix4(holder.matrixWorld);
    vFlash.material.rotation = Math.random() * 6;
  } else vFlash.visible = false;
}

function updateEffects(dt) {
  for (const t of tracers) if (t.visible) { t.userData.life -= dt; t.material.opacity = Math.max(0, t.userData.life / 0.06) * 0.85; if (t.userData.life <= 0) t.visible = false; }
  for (const s of sparks) if (s.visible) {
    s.userData.life -= dt; s.userData.v.y -= 12 * dt; s.position.addScaledVector(s.userData.v, dt);
    if (s.userData.life <= 0 || s.position.y < 0) s.visible = false;
  }
  for (const f of botFlashes) if (f.visible) { f.userData.life -= dt; if (f.userData.life <= 0) f.visible = false; }
  hurtFlash = Math.max(0, hurtFlash - dt * 2.5);
  hitT = Math.max(0, hitT - dt);
  bannerT = Math.max(0, bannerT - dt);
}

function update(dt) {
  time += dt;
  if (R.phase === 'freeze') {
    R.t -= dt;
    if (R.t <= 0) { R.phase = 'live'; banner('BOSHLANDI!', 'Qizil jamoani yo\'q qiling', 1.2); sfx.start(); }
  } else if (R.phase === 'live') {
    R.timer -= dt;
    if (R.timer <= 0) endRound(null);
  } else if (R.phase === 'end') {
    R.t -= dt;
    if (R.t <= 0) { if (R.score[0] >= WIN_ROUNDS || R.score[1] >= WIN_ROUNDS) finishMatch(); else startRound(); }
  }
  updatePlayer(dt);
  if (R.phase === 'live' || R.phase === 'end') {
    for (const u of units) if (!u.isPlayer) botUpdate(u, dt);
  } else {
    for (const u of units) if (u.mesh) { u.mesh.position.set(u.pos.x, 0, u.pos.z); u.mesh.rotation.y = u.yaw; }
  }
  separate();
  for (const u of units) if (u.alive) collide(u.pos);
  updateEffects(dt);
}

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
  last = now;
  const portrait = checkOrientation();
  const active = P && !paused && !portrait && (R.phase === 'freeze' || R.phase === 'live' || R.phase === 'end');
  if (active) update(dt);
  if (P && R.phase !== 'menu') {
    updateCamera();
    updateViewGun(dt);
    updateHUD();
  } else {
    // menyu foni: xarita ustida sekin aylanish
    time += dt;
    const a = time * 0.06;
    camera.position.set(COLS * CELL / 2 + Math.cos(a) * 30, 22, ROWS * CELL / 2 + Math.sin(a) * 22);
    camera.lookAt(COLS * CELL / 2, 0, ROWS * CELL / 2);
  }
  renderer.clear();
  renderer.render(scene, camera);
  if (P && P.alive && R.phase !== 'menu') { renderer.clearDepth(); renderer.render(wScene, wCam); }
  requestAnimationFrame(frame);
}
$('loading').remove();
showScreen('menu');
R.phase = 'menu';
requestAnimationFrame(frame);
