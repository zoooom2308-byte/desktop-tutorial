import { openStore, subIdOf, rateLimit } from '../../lib/store.js';
import { json, ipOf } from '../../lib/http.js';
import { InputError, readJson, validateAddresses, validateSubscription } from '../../lib/validate.js';

export default async (req, ctx) => {
  if (req.method !== 'POST') return json({ error: 'Metoda nije dopuštena' }, 405);
  const store = await openStore();
  if (!(await rateLimit(store, ipOf(req, ctx), 'sub', 15))) return json({ error: 'Previše upita, pričekaj minutu.' }, 429);
  try {
    const body = await readJson(req);
    const push = validateSubscription(body.subscription);
    const addresses = validateAddresses(body.addresses);
    const id = subIdOf(push.endpoint);
    addresses.forEach((a, i) => { a.id ??= `a${i}${id.slice(0, 5)}`; });
    await store.setJSON(`sub/${id}`, { push, addresses, updated: new Date().toISOString() });
    for (const r of new Set(addresses.map((a) => a.region).filter(Boolean))) await store.setJSON(`demand/${r}`, { at: new Date().toISOString() });
    return json({ ok: true });
  } catch (e) {
    if (e instanceof InputError) return json({ error: e.message }, 400);
    console.error(e);
    return json({ error: 'Greška na serveru' }, 500);
  }
};
export const config = { path: '/api/subscribe' };
