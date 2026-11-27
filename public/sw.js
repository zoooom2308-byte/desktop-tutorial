const CACHE = 'najava-v10';
const DIAG = 'nr-diag';
const abs = (p) => new URL(p, self.registration.scope).href;
const SHELL = ['./', 'style.css', 'app.js', 'region.js', 'text.js', 'match.js', 'maps.js', 'mapview.js', 'parts.js', 'config.js', 'manifest.webmanifest', 'icons/icon.svg', 'icons/icon-192.png', 'bg-pebbles.svg', 'fonts/barlow-condensed-latin-800-normal.woff2', 'fonts/barlow-latin-500-normal.woff2'];

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

const note = async (rec) => { try { await (await caches.open(DIAG)).put('last', new Response(JSON.stringify(rec))); } catch { /* */ } };

self.addEventListener('push', (e) => {
  e.waitUntil((async () => {
    let d = {};
    try { d = e.data ? e.data.json() : {}; } catch { d = { title: 'Najava radova', body: e.data ? e.data.text() : '' }; }
    const title = String(d.title || 'Najava radova').slice(0, 120);
    const url = /^[a-f0-9]{8,32}$/.test(d.annId || '') ? abs('./?map=' + d.annId + '#najave') : abs(typeof d.url === 'string' && /^(\/|\.\/)/.test(d.url) ? d.url.replace(/^\//, './') : './');
    const opts = { body: String(d.body || '').slice(0, 300), tag: d.tag || undefined, icon: abs('icons/icon-192.png'), badge: abs('icons/icon-192.png'), lang: 'hr', vibrate: [200, 100, 200], data: { url } };
    const rec = { at: Date.now(), title, tag: d.tag || null, shown: false, error: null };
    try { await self.registration.showNotification(title, opts); rec.shown = true; }
    catch (err) {
      rec.error = String(err && err.message || err).slice(0, 160);
      try { await self.registration.showNotification(title, { body: opts.body, data: opts.data }); rec.shown = true; } catch (err2) { rec.error += ' / ' + String(err2 && err2.message || err2).slice(0, 80); }
    }
    if (typeof d.count === 'number' && self.navigator && self.navigator.setAppBadge) { try { await self.navigator.setAppBadge(d.count); } catch { /* */ } }
    await note(rec);
    // Obavijesti otvorenu stranicu da može prikazati poruku i ako je sustav sakrije
    for (const c of await self.clients.matchAll({ type: 'window', includeUncontrolled: true })) c.postMessage({ type: 'push', title, body: opts.body, tag: d.tag || null, shown: rec.shown, error: rec.error });
  })());
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const target = e.notification.data?.url || abs('./');
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((cs) => {
    for (const c of cs) if ('focus' in c) { c.navigate?.(target); return c.focus(); }
    return self.clients.openWindow(target);
  }));
});
