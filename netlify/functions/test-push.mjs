import { openStore, subIdOf, rateLimit } from '../../lib/store.js';
import { json, ipOf } from '../../lib/http.js';
import { InputError, readJson, validateSubscription } from '../../lib/validate.js';
import { sendPush } from '../../lib/push.js';

export default async (req, ctx) => {
  if (req.method !== 'POST') return json({ error: 'Metoda nije dopuštena' }, 405);
  const store = await openStore();
  if (!(await rateLimit(store, ipOf(req, ctx), 'test', 5))) return json({ error: 'Previše probnih obavijesti, pričekaj minutu.' }, 429);
  try {
    const sub = validateSubscription((await readJson(req)).subscription);
    const res = await sendPush(store, sub, { title: 'Najava radova: probna obavijest', body: 'Obavijesti rade. Javit ćemo ti kad se u tvojoj ulici najave radovi.', url: '/', tag: 'test' });
    if (!res.ok) console.error('test-push neuspjeh', res.status, res.error);
    if (res.gone) await store.del(`sub/${subIdOf(sub.endpoint)}`);
    return json({ ok: res.ok, gone: !!res.gone }, res.ok ? 200 : 502);
  } catch (e) {
    if (e instanceof InputError) return json({ error: e.message }, 400);
    return json({ error: 'Greška na serveru' }, 500);
  }
};
export const config = { path: '/api/test-push' };
