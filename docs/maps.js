import { parseTargets } from './match.js';

export const titleCase = (s) => String(s ?? '').toLowerCase().replace(/(^|[\s\-–.(])(\p{L})/gu, (_, a, b) => a + b.toUpperCase());
export const clean = (p) => String(p ?? '').replace(/[.]+$/, '').replace(/\s+/g, ' ').trim();

/** Poveznica koja u Google Maps (ili aplikaciji Karte na mobitelu) traži adresu. */
export const mapsUrl = (q) => 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(`${q}, Hrvatska`);

export function rangeText(r) {
  const base = r.from === r.to ? `${r.from}` : r.to === Infinity ? `${r.from}–kraj` : `${r.from}–${r.to}`;
  return base + (r.parity === 'even' ? ' (parni)' : r.parity === 'odd' ? ' (neparni)' : '');
}

/**
 * Za najavu `ann` (i pretplatu `entry`) vraća popis poveznica na kartu: po jedna za svaku ulicu (s prvim kućnim brojem
 * iz raspona kad postoji), a ako najava navodi samo naselje ili područje, poveznica vodi na to područje.
 */
export function buildMapLinks(ann, entry, max = 8) {
  const place = clean(String(ann.place ?? '').split(/[,;]/)[0]);
  const city = clean(entry?.city ?? '');
  const where = [...new Set([place, city].filter(Boolean).map(titleCase))].join(', ');
  const { streets, settlements } = parseTargets(ann.streets);
  const links = [];
  for (const s of streets.slice(0, max)) {
    const name = titleCase(s.street);
    const num = s.ranges?.[0]?.from ?? '';
    links.push({
      label: name + (s.ranges ? ' ' + s.ranges.slice(0, 3).map(rangeText).join(', ') : ''),
      url: mapsUrl(`${name}${num !== '' ? ' ' + num : ''}${where ? ', ' + where : ''}`),
    });
  }
  if (!streets.length) {
    for (const n of (settlements.length ? settlements : [place]).filter(Boolean).slice(0, max)) {
      const name = titleCase(clean(n));
      const hasCity = city && name.toLowerCase().includes(city.toLowerCase());
      links.push({ label: name, url: mapsUrl(`${name}${city && !hasCity ? ', ' + titleCase(city) : ''}`) });
    }
  }
  if (!links.length && where) links.push({ label: where, url: mapsUrl(where) });
  return { links, more: Math.max(0, streets.length - max), area: where ? { label: where, url: mapsUrl(where) } : null };
}

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

