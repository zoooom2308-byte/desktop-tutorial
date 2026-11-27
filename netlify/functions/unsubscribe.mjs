import { openStore, subIdOf, rateLimit, sha } from '../../lib/store.js';
import { json, ipOf } from '../../lib/http.js';
import { InputError, readJson } from '../../lib/validate.js';
import { validTopic } from '../../lib/ntfy.js';

// "Obriši moje podatke": briše pretplatu, adrese i evidenciju poslanih obavijesti za taj uređaj.
export default async (req, ctx) => {
  if (req.method !== 'POST') return json({ error: 'Metoda nije dopuštena' }, 405);
  const store = await openStore();
  if (!(await rateLimit(store, ipOf(req, ctx), 'unsub', 15))) return json({ error: 'Previše upita' }, 429);
  try {
    const { endpoint, ntfy } = await readJson(req);
    const ids = [];
    if (typeof endpoint === 'string' && endpoint.length <= 600) ids.push(subIdOf(endpoint));
    if (ntfy) { if (!validTopic(ntfy)) throw new InputError('Neispravan zahtjev'); ids.push('n' + sha(ntfy, 23)); }
    if (!ids.length) throw new InputError('Neispravan zahtjev');
    for (const id of ids) {
      await store.del(`sub/${id}`);
      for (const k of await store.list('sent/')) if (k.startsWith(`sent/${id}.`)) await store.del(k);
    }
    return json({ ok: true });
  } catch (e) {
    if (e instanceof InputError) return json({ error: e.message }, 400);
    return json({ error: 'Greška na serveru' }, 500);
  }
};
export const config = { path: '/api/unsubscribe' };
