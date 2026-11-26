import { politeFetch } from './fetcher.js';
import { sha } from './store.js';
import { zagrebYmd } from './time.js';
import { hepUrl, parseHepPage, parseHepUnits, parseHepDays } from './parsers/hep-ods.js';
import { VIO_URL, parseVioTable, parseVioList, parseVioArticle } from './parsers/vio.js';
import { parsePlinaraList, parsePlinaraNotice } from './parsers/plinara.js';

const REFRESH_MS = 45 * 60 * 1000;

export const annId = (a) => sha(`${a.source}|${a.place}|${a.streets}|${a.start}`, 20);

/** Dohvati URL uz cache (ETag + vrijeme zadnjeg dohvata). Vraća html ili null ako je svježe/nepromijenjeno. */
async function cachedGet(store, url, { ttl = REFRESH_MS, budget }) {
  const key = `fs/${sha(url)}`;
  const st = (await store.getJSON(key)) ?? {};
  if (st.at && Date.now() - st.at < ttl) return null;
  if (budget.left <= 0) return null;
  budget.left -= 1;
  const r = await politeFetch(url, { etag: st.etag, lastModified: st.lastModified });
  await store.setJSON(key, { at: Date.now(), etag: r.etag ?? st.etag, lastModified: r.lastModified ?? st.lastModified });
  return r.notModified ? null : r.html;
}

async function upsert(store, anns, now) {
  let added = 0;
  for (const a of anns) {
    const id = annId(a);
    const key = `ann/${id}`;
    const old = await store.getJSON(key);
    await store.setJSON(key, { ...a, id, firstSeen: old?.firstSeen ?? now.toISOString(), seen: now.toISOString() });
    if (!old) added += 1;
  }
  return added;
}

async function syncHep(store, dp, now, budget) {
  const today = zagrebYmd(now);
  const dmy = `${today.slice(8)}.${today.slice(5, 7)}.${today.slice(0, 4)}`;
  const base = await cachedGet(store, hepUrl(dp, null, dmy), { ttl: 20 * 60 * 1000, budget });
  const units = base ? parseHepUnits(base) : (await store.getJSON(`hepunits/${dp}`)) ?? [];
  if (base) await store.setJSON(`hepunits/${dp}`, units);
  const list = units.length ? units : [{ el: null }];
  let found = [];
  for (const u of list) {
    const first = await cachedGet(store, hepUrl(dp, u.el, dmy), { budget });
    let days = [dmy];
    if (first) {
      found.push(...parseHepPage(first, { dp, el: u.el }));
      days = parseHepDays(first).filter((d) => d !== dmy);
      await store.setJSON(`hepdays/${dp}/${u.el}`, days);
    } else {
      days = ((await store.getJSON(`hepdays/${dp}/${u.el}`)) ?? []).filter((d) => d !== dmy);
    }
    for (const d of days) {
      const html = await cachedGet(store, hepUrl(dp, u.el, d), { budget });
      if (html) found.push(...parseHepPage(html, { dp, el: u.el }));
    }
  }
  return found;
}

async function syncVio(store, now, budget) {
  const out = [];
  const t = await cachedGet(store, VIO_URL, { budget });
  if (t) out.push(...parseVioTable(t));
  const list = await cachedGet(store, 'https://www.vio.hr/obavijesti/', { budget });
  for (const url of list ? parseVioList(list).slice(0, 12) : []) {
    const html = await cachedGet(store, url, { ttl: 6 * 3600 * 1000, budget });
    const a = html && parseVioArticle(html, url);
    if (a) out.push(a);
  }
  return out;
}

async function syncPlinara(store, now, budget) {
  const out = [];
  const list = await cachedGet(store, 'https://www.plinara-zagreb.hr/novosti/50', { budget });
  for (const url of list ? parsePlinaraList(list).slice(0, 12) : []) {
    const html = await cachedGet(store, url, { ttl: 6 * 3600 * 1000, budget });
    const a = html && parsePlinaraNotice(html, url);
    if (a) out.push(a);
  }
  return out;
}

/**
 * Dohvati izvore za regije koje su u zadnjih 14 dana tražili korisnici.
 * `budget` ograničava broj HTTP zahtjeva po pokretanju (prijateljski prema izvorima).
 */
export async function syncSources(store, { now = new Date(), maxRequests = 30 } = {}) {
  const budget = { left: maxRequests };
  const demand = await store.list('demand/');
  const regions = [];
  for (const k of demand) {
    const d = await store.getJSON(k);
    if (d && now - new Date(d.at) < 14 * 86400_000) regions.push(k.slice('demand/'.length));
  }
  const errors = [];
  let added = 0;
  const run = async (name, fn) => {
    try { added += await upsert(store, await fn(), now); } catch (e) { errors.push(`${name}: ${e.message}`); }
  };
  for (const dp of regions) await run(`hep:${dp}`, () => syncHep(store, dp, now, budget));
  if (regions.includes('zagreb')) {
    await run('vio', () => syncVio(store, now, budget));
    await run('plinara', () => syncPlinara(store, now, budget));
  }
  // čišćenje najava koje su završile prije više od 2 dana
  for (const k of await store.list('ann/')) {
    const a = await store.getJSON(k);
    if (a && now - new Date(a.end) > 2 * 86400_000) await store.del(k);
  }
  return { regions, added, errors, requestsLeft: budget.left };
}

export async function loadActiveAnnouncements(store, now = new Date(), regions = null) {
  const out = [];
  for (const k of await store.list('ann/')) {
    const a = await store.getJSON(k);
    if (!a || new Date(a.end) < now) continue;
    if (regions && a.region && !regions.includes(a.region)) continue;
    out.push(a);
  }
  return out.sort((x, y) => new Date(x.start) - new Date(y.start));
}
