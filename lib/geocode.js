import { parseTargets } from './match.js';
import { sha } from './store.js';
import { titleCase, clean, rangeText } from './maps.js';
import { USER_AGENT } from './fetcher.js';

// Koordinate za kartu: jednom po ulici, s predmemorijom u bazi (Photon/OpenStreetMap). Samo pristojna, rijetka potražnja.
export const PHOTON = 'https://photon.komoot.io/api/';
const BBOX = { minLat: 42.3, maxLat: 46.7, minLon: 13.3, maxLon: 19.6 }; // Hrvatska
const TTL_MS = 60 * 86400_000, GAP_MS = 1100;
let lastCall = 0;

const inCroatia = (lat, lon) => lat >= BBOX.minLat && lat <= BBOX.maxLat && lon >= BBOX.minLon && lon <= BBOX.maxLon;

/** Što treba geokodirati za najavu: ulice (s prvim brojem iz raspona), naselja ili samo mjesto. */
export function targetsFor(ann, max = 6) {
  const place = clean(String(ann.place ?? '').split(/[,;]/)[0]);
  const where = [...new Set([place, ann.cityHint].filter(Boolean).map((x) => titleCase(clean(x))))].join(', ');
  const { streets, settlements } = parseTargets(ann.streets);
  const out = [];
  for (const s of streets.slice(0, max)) {
    const name = titleCase(s.street), num = s.ranges?.[0]?.from ?? '';
    out.push({ label: name + (s.ranges ? ' ' + s.ranges.slice(0, 2).map(rangeText).join(', ') : ''), query: `${name}${num !== '' ? ' ' + num : ''}${where ? ', ' + where : ''}`, fallback: `${name}${where ? ', ' + where : ''}` });
  }
  if (!streets.length) for (const n of (settlements.length ? settlements : [place]).filter(Boolean).slice(0, max)) { const nm = titleCase(clean(n)); out.push({ label: nm, query: `${nm}${where && !where.toLowerCase().includes(nm.toLowerCase()) ? ', ' + where : ''}`, area: true }); }
  return out;
}

async function lookup(store, q, { fetchImpl, now, counter }) {
  const key = `geo/${sha(q.toLowerCase(), 20)}`;
  const c = await store.getJSON(key);
  if (c && now - new Date(c.at) < TTL_MS) return c.none ? null : c;
  if (counter.left <= 0) return undefined; // nema više upita u ovom krugu
  counter.left -= 1;
  const wait = lastCall + GAP_MS - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastCall = Date.now();
  try {
    const url = `${PHOTON}?${new URLSearchParams({ q: `${q}, Hrvatska`, limit: '1' })}`;
    const res = await fetchImpl(url, { headers: { 'user-agent': USER_AGENT, accept: 'application/json' }, signal: AbortSignal.timeout(8000) });
    if (!res.ok) return undefined;
    const f = (await res.json()).features?.[0];
    const [lon, lat] = f?.geometry?.coordinates ?? [];
    if (typeof lat !== 'number' || !inCroatia(lat, lon)) { await store.setJSON(key, { at: now.toISOString(), none: true }); return null; }
    const rec = { at: now.toISOString(), lat: +lat.toFixed(5), lon: +lon.toFixed(5) };
    await store.setJSON(key, rec);
    return rec;
  } catch { return undefined; }
}

/** Dodaj `geo` svakoj najavi koja ga još nema. Vraća koliko je najava obrađeno. */
export async function geocodeAnnouncements(store, anns, { now = new Date(), maxLookups = 20, maxMs = 25000, fetchImpl = fetch } = {}) {
  const counter = { left: maxLookups }, deadline = Date.now() + maxMs;
  let done = 0;
  for (const ann of anns) {
    if (ann.geo || Date.now() > deadline) continue;
    const points = []; let incomplete = false;
    for (const t of targetsFor(ann)) {
      let r = await lookup(store, t.query, { fetchImpl, now, counter });
      if (r === null && t.fallback) r = await lookup(store, t.fallback, { fetchImpl, now, counter }); // bez kućnog broja
      if (r === undefined) { incomplete = true; break; }
      if (r) points.push({ label: t.label, lat: r.lat, lon: r.lon, area: !!t.area });
    }
    if (incomplete) continue; // nastavlja u sljedećem krugu (rezultati su već u predmemoriji)
    if (!points.length) { // nijedna ulica nije pronađena: barem središte mjesta
      const place = clean(String(ann.place ?? '').split(/[,;]/)[0]);
      if (place) { const r = await lookup(store, titleCase(place), { fetchImpl, now, counter }); if (r === undefined) continue; if (r) points.push({ label: titleCase(place), lat: r.lat, lon: r.lon, area: true }); }
    }
    ann.geo = points; ann.geoAt = now.toISOString();
    await store.setJSON(`ann/${ann.id}`, ann);
    done += 1;
  }
  return done;
}
