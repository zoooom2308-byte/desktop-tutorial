import { openStore, rateLimit } from '../../lib/store.js';
import { json, ipOf } from '../../lib/http.js';
import { InputError, readJson, validateAddresses } from '../../lib/validate.js';
import { loadActiveAnnouncements } from '../../lib/sync.js';
import { matchAnnouncement } from '../../lib/match.js';
import { recordVisit } from '../../lib/stats.js';

// Bezstanje: adrese se šalju samo radi usporedbe i ne spremaju (osim oznake da regija ima korisnike).
export default async (req, ctx) => {
  if (req.method !== 'POST') return json({ error: 'Metoda nije dopuštena' }, 405);
  const store = await openStore();
  if (!(await rateLimit(store, ipOf(req, ctx), 'match', 30))) return json({ error: 'Previše upita, pričekaj minutu.' }, 429);
  try {
    const addresses = validateAddresses((await readJson(req)).addresses);
    await recordVisit(store, ipOf(req, ctx));
    for (const r of new Set(addresses.map((a) => a.region).filter(Boolean))) await store.setJSON(`demand/${r}`, { at: new Date().toISOString() });
    const anns = await loadActiveAnnouncements(store, new Date());
    const results = [];
    for (const ann of anns) {
      for (const [i, addr] of addresses.entries()) {
        const q = matchAnnouncement(ann, addr);
        if (q) results.push({ addressIndex: i, quality: q, ann: { id: ann.id, type: ann.type, source: ann.sourceName, title: ann.title, place: ann.place, streets: ann.streets, start: ann.start, end: ann.end, allDay: !!ann.allDay, note: ann.note, url: ann.url, geo: ann.geo ?? [] } });
      }
    }
    return json({ results });
  } catch (e) {
    if (e instanceof InputError) return json({ error: e.message }, 400);
    console.error(e);
    return json({ error: 'Greška na serveru' }, 500);
  }
};
export const config = { path: '/api/match' };
