import { openStore, subIdOf, rateLimit } from '../../lib/store.js';
import { json, ipOf } from '../../lib/http.js';
import { InputError, readJson, validateChannels } from '../../lib/validate.js';
import { sendPush } from '../../lib/push.js';
import { sendNtfy } from '../../lib/ntfy.js';

const PAYLOAD = { title: 'Najava radova: probna obavijest', body: 'Obavijesti rade. Javit ćemo ti kad se u tvojoj ulici najave radovi.', url: '/', tag: 'test' };

// Uvijek vraća HTTP 200 s pojedinostima po kanalu, da stranica može točno reći što nije uspjelo.
export default async (req, ctx) => {
  if (req.method !== 'POST') return json({ error: 'Metoda nije dopuštena' }, 405);
  const store = await openStore();
  if (!(await rateLimit(store, ipOf(req, ctx), 'test', 8))) return json({ error: 'Previše probnih obavijesti, pričekaj minutu.' }, 429);
  try {
    const ch = validateChannels(await readJson(req));
    const out = {};
    if (ch.push) {
      const r = await sendPush(store, ch.push, PAYLOAD);
      if (!r.ok) console.error('test-push neuspjeh', r.status, r.error);
      if (r.gone) await store.del(`sub/${subIdOf(ch.push.endpoint)}`);
      out.push = { ok: r.ok, gone: !!r.gone, status: r.status ?? null };
    }
    if (ch.ntfy) { const r = await sendNtfy(ch.ntfy, PAYLOAD); out.ntfy = { ok: r.ok, status: r.status ?? null }; }
    return json({ ok: Object.values(out).some((x) => x.ok), ...out });
  } catch (e) {
    if (e instanceof InputError) return json({ error: e.message }, 400);
    console.error(e);
    return json({ error: 'Greška na serveru' }, 500);
  }
};
export const config = { path: '/api/test-push' };
