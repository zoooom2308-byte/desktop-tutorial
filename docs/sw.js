const CACHE = 'najava-v3';
const abs = (p) => new URL(p, self.registration.scope).href;
const SHELL = ['./', 'style.css', 'app.js', 'region.js', 'text.js', 'config.js', 'manifest.webmanifest', 'icons/icon.svg', 'icons/icon-192.png', 'bg-pebbles.svg', 'fonts/barlow-condensed-latin-800-normal.woff2', 'fonts/barlow-latin-500-normal.woff2'];

self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL.map(abs))).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request; const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;
  // stale-while-revalidate za ljusku aplikacije; offline se služi iz cachea
  e.respondWith(caches.open(CACHE).then(async (c) => {
    const hit = await c.match(req, { ignoreSearch: true });
    const net = fetch(req).then((r) => { if (r.ok) c.put(req, r.clone()); return r; }).catch(() => hit);
    return hit || net;
  }));
});

self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { title: 'Najava radova', body: e.data?.text() }; }
  e.waitUntil(self.registration.showNotification(String(d.title || 'Najava radova').slice(0, 120), {
    body: String(d.body || '').slice(0, 300), tag: d.tag || undefined, icon: abs('icons/icon-192.png'), badge: abs('icons/icon-192.png'),
    data: { url: abs(typeof d.url === 'string' && /^(\/|\.\/)/.test(d.url) ? d.url.replace(/^\//, './') : './') }, renotify: false,
  }));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const target = e.notification.data?.url || abs('./');
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((cs) => {
    for (const c of cs) if ('focus' in c) { c.navigate?.(target); return c.focus(); }
    return self.clients.openWindow(target);
  }));
});
