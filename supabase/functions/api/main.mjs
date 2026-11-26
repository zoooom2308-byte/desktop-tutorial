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
      const notify = await runNotifications(store, { siteUrl: './' });
      console.log('tick', JSON.stringify({ sync, notify }));
      return withCors(new Response(JSON.stringify({ sync, notify }), { headers: { 'content-type': 'application/json' } }));
    }
    const handler = ROUTES[path];
    if (!handler) return text('Nepoznata adresa', 404);
    return withCors(await handler(req, { ip }));
  } catch (e) {
    console.error('greška', e?.stack || e);
    return text('Greška na serveru', 500);
  }
});
