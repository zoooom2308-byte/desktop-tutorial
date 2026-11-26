const CACHE = 'najava-v2';
const SHELL = ['/', '/style.css', '/app.js', '/manifest.webmanifest', '/icons/icon.svg', '/icons/icon-192.png', '/bg-pebbles.svg', '/fonts/barlow-condensed-latin-800-normal.woff2', '/fonts/barlow-latin-500-normal.woff2'];

self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request; const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/')) return;
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
    body: String(d.body || '').slice(0, 300), tag: d.tag || undefined, icon: '/icons/icon-192.png', badge: '/icons/icon-192.png',
    data: { url: typeof d.url === 'string' && d.url.startsWith('/') ? d.url : '/' }, renotify: false,
  }));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const target = e.notification.data?.url || '/';
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((cs) => {
    for (const c of cs) if ('focus' in c) { c.navigate?.(target); return c.focus(); }
    return self.clients.openWindow(target);
  }));
});
