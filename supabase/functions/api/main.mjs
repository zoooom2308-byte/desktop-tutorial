import './env-shim.mjs';
import config from '../../../netlify/functions/config.mjs';
import geocode from '../../../netlify/functions/geocode.mjs';
import match from '../../../netlify/functions/match.mjs';
import subscribe from '../../../netlify/functions/subscribe.mjs';
import unsubscribe from '../../../netlify/functions/unsubscribe.mjs';
import testPush from '../../../netlify/functions/test-push.mjs';
import { openStore } from '../../../lib/store.js';
import { syncSources } from '../../../lib/sync.js';
import { runNotifications } from '../../../lib/notify.js';
import { loadActiveAnnouncements } from '../../../lib/sync.js';
import { isDp } from '../../../lib/region.js';
import { matchAnnouncement } from '../../../lib/match.js';
import { buildMapLinks } from '../../../lib/maps.js';
import { rateLimit } from '../../../lib/store.js';
import { zagrebYmd, addDaysYmd, zagrebToDate } from '../../../lib/time.js';

const ROUTES = { '/config': config, '/geocode': geocode, '/match': match, '/subscribe': subscribe, '/unsubscribe': unsubscribe, '/test-push': testPush };
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET, POST, OPTIONS', 'access-control-allow-headers': 'content-type', 'access-control-max-age': '86400' };

const withCors = (res) => { const h = new Headers(res.headers); for (const [k, v] of Object.entries(CORS)) h.set(k, v); return new Response(res.body, { status: res.status, headers: h }); };
const text = (s, status) => withCors(new Response(JSON.stringify({ error: s }), { status, headers: { 'content-type': 'application/json' } }));

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return withCors(new Response(null, { status: 204 }));
  const path = new URL(req.url).pathname.replace(/^\/(?:functions\/v1\/)?api/, '') || '/';
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('cf-connecting-ip') || 'unknown';
  try {
    if (path === '/tick') {
      const store = await openStore();
      const secret = (await store.getJSON('config/cron'))?.s;
      if (!secret || req.headers.get('x-cron-secret') !== secret) return text('Zabranjeno', 401);
      const sync = await syncSources(store, { maxRequests: 40, maxMs: 70000 });
      const notify = await runNotifications(store);
      console.log('tick', JSON.stringify({ sync, notify }));
      return withCors(new Response(JSON.stringify({ sync, notify }), { headers: { 'content-type': 'application/json' } }));
    }
    if (path === '/widget') {
      // Danas i sutra za jedan grad: za widget (Scriptable na iPhoneu) i druge male klijente
      const sp = new URL(req.url).searchParams;
      const region = sp.get('region'), city = (sp.get('city') ?? '').replace(/[\u0000-\u001f<>]/g, ' ').trim().slice(0, 60);
      const parts = (sp.get('parts') ?? '').split(',').map((x) => x.replace(/[\u0000-\u001f<>]/g, ' ').trim().slice(0, 60)).filter(Boolean).slice(0, 20);
      if (!isDp(region) || city.length < 2) return text('Neispravan upit', 400);
      const store = await openStore();
      if (!(await rateLimit(store, ip, 'widget', 40))) return text('Previše upita', 429);
      const now = new Date(), today = zagrebYmd(now), tomorrow = addDaysYmd(today, 1), limit = zagrebToDate(addDaysYmd(today, 2), '00:00');
      const entry = { kind: 'area', city, region, parts, strict: false };
      const hhmm = (d) => new Intl.DateTimeFormat('hr-HR', { timeZone: 'Europe/Zagreb', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(d);
      const items = (await loadActiveAnnouncements(store, now, [region])).filter((a) => new Date(a.start) < limit && matchAnnouncement(a, entry)).slice(0, 12).map((a) => {
        const l = buildMapLinks(a, entry).links[0], st = new Date(a.start), ymd = zagrebYmd(st);
        return { type: a.type, source: a.sourceName, day: ymd === today ? 'danas' : ymd === tomorrow ? 'sutra' : ymd, time: a.allDay ? 'cijeli dan' : `${hhmm(st)}–${hhmm(new Date(a.end))}`, where: l?.label ?? a.place ?? '', maps: l?.url ?? null };
      });
      await store.setJSON(`demand/${region}`, { at: now.toISOString() });
      return withCors(new Response(JSON.stringify({ updated: now.toISOString(), city, count: items.length, items }), { headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'public, max-age=300' } }));
    }
    if (path === '/places') {
      // Nazivi mjesta/dijelova grada koji se stvarno pojavljuju u aktualnim najavama regije (za izbor dijelova grada)
      const region = new URL(req.url).searchParams.get('region');
      if (!isDp(region)) return text('Nepoznato područje', 400);
      const store = await openStore();
      const names = new Set();
      for (const a of await loadActiveAnnouncements(store, new Date(Date.now() - 86400_000), [region])) {
        for (const n of String(a.place ?? '').split(/[,;]/)) { const t = n.replace(/[.]+$/, '').replace(/\s+/g, ' ').trim(); if (t && t.length <= 60) names.add(t); }
        if (a.areaIsStreet || /^naselja:/i.test(a.streets ?? '')) for (const n of String(a.streets).replace(/^naselja:\s*/i, '').split(/[,;]/)) { const t = n.trim(); if (t && t.length <= 60) names.add(t); }
      }
      return withCors(new Response(JSON.stringify({ places: [...names].sort((x, y) => x.localeCompare(y, 'hr')).slice(0, 200) }), { headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=300' } }));
    }
    const handler = ROUTES[path];
    if (!handler) return text('Nepoznata adresa', 404);
    return withCors(await handler(req, { ip }));
  } catch (e) {
    console.error('greška', e?.stack || e);
    return text('Greška na serveru', 500);
  }
});
