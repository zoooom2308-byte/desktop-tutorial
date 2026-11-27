import { sha } from './store.js';
import { zagrebYmd, addDaysYmd } from './time.js';

// Anonimni dnevni brojači (bez praćenja pojedinaca). Posjetitelji se broje preko hasha IP adrese i datuma koji se sutradan više ne može povezati.
const DAY = (ymd) => `stats/day/${ymd}`;
const EMPTY = () => ({ opens: 0, sent: 0, failed: 0, removed: 0, subsNew: 0, subsGone: 0, digests: 0 });

export async function bump(store, field, n = 1, now = new Date()) {
  const key = DAY(zagrebYmd(now));
  const cur = (await store.getJSON(key)) ?? EMPTY();
  cur[field] = (cur[field] ?? 0) + n;
  await store.setJSON(key, cur);
}

/** Zabilježi otvaranje aplikacije i (jednom dnevno) jedinstvenog posjetitelja. */
export async function recordVisit(store, ip, now = new Date()) {
  const ymd = zagrebYmd(now);
  await bump(store, 'opens', 1, now);
  const key = `stats/uv/${ymd}`;
  const h = sha(`${ip}|${ymd}`, 12);
  const set = (await store.getJSON(key)) ?? { h: [] };
  if (!set.h.includes(h) && set.h.length < 20000) { set.h.push(h); await store.setJSON(key, set); }
}

export async function recordTick(store, info, now = new Date()) {
  await store.setJSON('stats/tick', { at: now.toISOString(), ...info });
}
export async function recordSync(store, sync, now = new Date()) {
  await store.setJSON('stats/sync', { at: now.toISOString(), errors: sync.errors ?? [], added: sync.added ?? 0, regions: sync.regions ?? [] });
}

export async function cleanupStats(store, now = new Date()) {
  const today = zagrebYmd(now);
  const old = addDaysYmd(today, -120), oldUv = addDaysYmd(today, -2);
  for (const k of await store.list('stats/day/')) if (k.slice('stats/day/'.length) < old) await store.del(k);
  for (const k of await store.list('stats/uv/')) if (k.slice('stats/uv/'.length) < oldUv) await store.del(k); // jedinstveni posjetitelji: sirovi hashevi se čuvaju samo 2 dana
}

/** Zadnjih `days` dana kao niz, najstariji prvi. Jedinstveni posjetitelji ostaju kao broj i nakon brisanja sirovih hasheva. */
export async function dailySeries(store, days = 14, now = new Date()) {
  const today = zagrebYmd(now), out = [];
  for (let i = days - 1; i >= 0; i--) {
    const ymd = addDaysYmd(today, -i);
    const d = (await store.getJSON(DAY(ymd))) ?? EMPTY();
    const uv = await store.getJSON(`stats/uv/${ymd}`);
    out.push({ date: ymd, ...d, visitors: uv ? uv.h.length : (d.visitors ?? 0) });
  }
  return out;
}

/** Pretvori sirove hasheve u broj prije brisanja (poziva se iz tick-a). */
export async function freezeVisitors(store, now = new Date()) {
  for (const k of await store.list('stats/uv/')) {
    const ymd = k.slice('stats/uv/'.length);
    const uv = await store.getJSON(k);
    if (!uv) continue;
    const dk = DAY(ymd); const d = (await store.getJSON(dk)) ?? EMPTY();
    if (d.visitors !== uv.h.length) { d.visitors = uv.h.length; await store.setJSON(dk, d); }
  }
}
