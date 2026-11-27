import { openStore, subIdOf, rateLimit, sha } from '../../lib/store.js';
import { json, ipOf } from '../../lib/http.js';
import { InputError, readJson, validateAddresses, validateChannels } from '../../lib/validate.js';

export default async (req, ctx) => {
  if (req.method !== 'POST') return json({ error: 'Metoda nije dopuštena' }, 405);
  const store = await openStore();
  if (!(await rateLimit(store, ipOf(req, ctx), 'sub', 15))) return json({ error: 'Previše upita, pričekaj minutu.' }, 429);
  try {
    const body = await readJson(req);
    const ch = validateChannels(body);
    const addresses = validateAddresses(body.addresses);
    // Jedan uređaj = jedan zapis: s ntfy temom ključ je tema, inače krajnja točka push pretplate.
    const id = ch.ntfy ? 'n' + sha(ch.ntfy, 23) : subIdOf(ch.push.endpoint);
    if (ch.ntfy && ch.push) await store.del(`sub/${subIdOf(ch.push.endpoint)}`); // preseljenje starijeg zapisa
    addresses.forEach((a, i) => { a.id ??= `a${i}${id.slice(0, 5)}`; });
    await store.setJSON(`sub/${id}`, { ...(ch.push ? { push: ch.push } : {}), ...(ch.ntfy ? { ntfy: ch.ntfy } : {}), digest: body.digest !== false, addresses, updated: new Date().toISOString() });
    for (const r of new Set(addresses.map((a) => a.region).filter(Boolean))) await store.setJSON(`demand/${r}`, { at: new Date().toISOString() });
    return json({ ok: true });
  } catch (e) {
    if (e instanceof InputError) return json({ error: e.message }, 400);
    console.error(e);
    return json({ error: 'Greška na serveru' }, 500);
  }
};
export const config = { path: '/api/subscribe' };
