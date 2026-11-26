import { openStore, rateLimit, sha } from '../../lib/store.js';
import { json, ipOf } from '../../lib/http.js';
import { regionFromAddress } from '../../lib/region.js';
import { USER_AGENT } from '../../lib/fetcher.js';

// Nominatim: najviše 1 zahtjev u sekundi (globalno), obavezan opisni User-Agent, cache rezultata.
// Napomena: javni Nominatim ne podržava pravi autocomplete; klijent šalje upit tek nakon stanke u tipkanju.
export default async (req, ctx) => {
  const store = await openStore();
  if (!(await rateLimit(store, ipOf(req, ctx), 'geo', 20))) return json({ error: 'Previše upita, pričekaj minutu.' }, 429);
  const q = (new URL(req.url).searchParams.get('q') || '').replace(/[\u0000-\u001f<>]/g, ' ').trim().slice(0, 100);
  if (q.length < 4) return json({ results: [] });
  const key = `geo/${sha(q.toLowerCase())}`;
  const cached = await store.getJSON(key);
  if (cached && Date.now() - cached.at < 7 * 86400_000) return json({ results: cached.results, cached: true });

  const gate = (await store.getJSON('geo-gate')) ?? { at: 0 };
  const wait = gate.at + 1100 - Date.now();
  if (wait > 3000) return json({ results: [], busy: true });
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  await store.setJSON('geo-gate', { at: Date.now() });

  const url = new URL('https://nominatim.openstreetmap.org/search');
  url.search = new URLSearchParams({ q, format: 'jsonv2', addressdetails: '1', countrycodes: 'hr', limit: '6', 'accept-language': 'hr' });
  let data;
  try {
    const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(String(res.status));
    data = await res.json();
  } catch {
    return json({ results: [], unavailable: true });
  }
  const results = data
    .filter((r) => r.address?.road)
    .map((r) => {
      const a = r.address;
      const city = (a.city || a.town || a.village || a.municipality || a.city_district || '').replace(/^Grad\s+/, '');
      const places = [a.suburb, a.city_district, a.neighbourhood, a.quarter, a.village, a.town, a.hamlet].filter(Boolean);
      return {
        street: a.road, number: a.house_number || '', city, places: [...new Set(places)],
        region: regionFromAddress({ ...a, city }),
        label: [a.road + (a.house_number ? ' ' + a.house_number : ''), city].filter(Boolean).join(', '),
      };
    });
  const seen = new Set();
  const uniq = results.filter((r) => !seen.has(r.label + r.region) && seen.add(r.label + r.region));
  // Lokacija (lat/lon) se namjerno ne vraća niti sprema.
  await store.setJSON(key, { at: Date.now(), results: uniq });
  return json({ results: uniq });
};
export const config = { path: '/api/geocode' };
