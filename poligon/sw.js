// Nishon Poligoni — internetsiz ishlash: har bir fayl birinchi yuklanganda saqlanadi
const CACHE = 'poligon-v1';
const CORE = ['./', './index.html', './game.js', './three.module.min.js', './manifest.webmanifest', './icons/icon-180.png', './icons/icon-192.png', './icons/icon-512.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(caches.open(CACHE).then(cache => cache.match(e.request, { ignoreSearch: true }).then(hit => {
    const isAsset = e.request.url.includes('/assets/') || e.request.url.includes('/jsm/');
    const net = fetch(e.request).then(res => { if (res && res.ok) cache.put(e.request, res.clone()); return res; }).catch(() => hit);
    if (hit && isAsset) return hit;          // og'ir fayllar: keshdan
    return hit || net;                       // qolganlari: keshdan, orqada yangilanadi
  })));
});
