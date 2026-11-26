import { openStore, subIdOf, rateLimit } from '../../lib/store.js';
import { json, ipOf } from '../../lib/http.js';
import { InputError, readJson } from '../../lib/validate.js';

// "Obriši moje podatke": briše pretplatu, adrese i evidenciju poslanih obavijesti za taj uređaj.
export default async (req, ctx) => {
  if (req.method !== 'POST') return json({ error: 'Metoda nije dopuštena' }, 405);
  const store = await openStore();
  if (!(await rateLimit(store, ipOf(req, ctx), 'unsub', 15))) return json({ error: 'Previše upita' }, 429);
  try {
    const { endpoint } = await readJson(req);
    if (typeof endpoint !== 'string' || endpoint.length > 600) throw new InputError('Neispravan zahtjev');
    const id = subIdOf(endpoint);
    await store.del(`sub/${id}`);
    for (const k of await store.list('sent/')) if (k.startsWith(`sent/${id}.`)) await store.del(k);
    return json({ ok: true });
  } catch (e) {
    if (e instanceof InputError) return json({ error: e.message }, 400);
    return json({ error: 'Greška na serveru' }, 500);
  }
};
export const config = { path: '/api/unsubscribe' };
