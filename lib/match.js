import { tokens, stem, stems, sameStems, containsStems } from './text.js';

/**
 * Parsira popis ulica iz najave, npr.
 *  "JABLANOVEČKA 40, 47-57 nep, LABINSKA 2-12 par, LOŠINJSKA 20-do kraja par, 23-33 nep"
 * u [{ street, stems, ranges:[{from,to,parity}]|null }]
 * ranges === null znači "cijela ulica" (nema brojeva).
 */
export function parseStreetList(raw) {
  const out = [];
  let cur = null;
  const pieces = String(raw ?? '').split(/[,;\n]+/).map((p) => p.trim()).filter(Boolean);
  for (const piece of pieces) {
    const m = piece.match(/^(\d+\s*[a-zA-Z]?\s*(?:[-–]\s*(?:\d+\s*[a-zA-Z]?|do\s+kraja))?.*)$/i);
    if (m && cur) {
      addRanges(cur, m[1]);
      continue;
    }
    // novi naziv ulice, eventualno s brojevima na kraju
    const idx = piece.search(/\s\d/);
    let name = piece;
    let rest = '';
    if (idx > 0) {
      name = piece.slice(0, idx).trim();
      rest = piece.slice(idx).trim();
    }
    name = name.replace(/\s*[-–]\s*dio\s*$/i, '').replace(/\s+(obje|par|nep|neparni|parni)\s*$/i, '').trim();
    if (!name) continue;
    cur = { street: name, stems: stems(name), ranges: null };
    out.push(cur);
    if (rest) addRanges(cur, rest);
  }
  return out;
}

function addRanges(entry, spec) {
  spec = spec.replace(/\s*[-–]+\s*/g, '-').replace(/\s+\./g, '');
  // spec može sadržavati više raspona razdvojenih razmakom: "47-57 nep" ili "1-8 obje"
  const re = /(\d+)\s*([a-zA-Z](?![a-zA-Z]))?\s*(?:[-–]\s*(\d+|do\s+kraja)\s*([a-zA-Z](?![a-zA-Z]))?)?\s*(par\w*|nep\w*|obje|sve)?/gi;
  let m;
  entry.ranges ??= [];
  while ((m = re.exec(spec)) !== null) {
    if (!m[0].trim()) { re.lastIndex++; continue; }
    const from = parseInt(m[1], 10);
    const to = m[3] ? (/kraja/i.test(m[3]) ? Infinity : parseInt(m[3], 10)) : from;
    const p = (m[5] || '').toLowerCase();
    const parity = p.startsWith('par') ? 'even' : p.startsWith('nep') ? 'odd' : 'both';
    entry.ranges.push({ from, to, parity });
  }
}

export function parseHouseNumber(s) {
  const m = String(s ?? '').trim().match(/^(\d+)\s*([a-zA-Z])?$/);
  return m ? { n: parseInt(m[1], 10), suffix: (m[2] || '').toLowerCase() } : null;
}

function inRanges(ranges, n) {
  return ranges.some((r) => {
    if (n < r.from || n > r.to) return false;
    if (r.parity === 'even') return n % 2 === 0;
    if (r.parity === 'odd') return n % 2 === 1;
    return true;
  });
}

function placeMatches(announcePlace, addr) {
  if (!announcePlace) return true;
  const a = stems(announcePlace);
  const cands = [addr.city, ...(addr.places || [])].filter(Boolean);
  return cands.some((c) => {
    const cs = stems(c);
    return sameStems(a, cs) || containsStems(a, cs) || containsStems(cs, a);
  });
}

/**
 * Usporedba jedne najave sa strukturiranim popisom ulica s adresom korisnika.
 * Vraća 'exact' | 'street' | null.
 *  - 'exact'  : ulica se podudara i kućni broj je unutar raspona (ili je cijela ulica)
 *  - 'street' : ulica se podudara, ali ne možemo biti sigurni za broj
 */
export function matchStructured(ann, addr) {
  let placeOk = placeMatches(ann.place, addr);
  // Mjesto ne mora odgovarati (kvart/naselje u najavi, grad u adresi): u istoj regiji ipak javljamo, uz "provjeri".
  if (!placeOk && !(ann.region && addr.region && ann.region === addr.region)) return null;
  const want = stems(addr.street);
  if (!want.length) return null;
  const num = parseHouseNumber(addr.number);
  let best = null;
  for (const e of parseStreetList(ann.streets)) {
    if (!sameStems(e.stems, want)) continue;
    if (!placeOk) { best = 'street'; continue; }
    if (e.ranges === null) return 'exact';
    if (!num) { best = 'street'; continue; }
    if (inRanges(e.ranges, num.n)) return num.suffix ? 'street' : 'exact';
    // broj izvan raspona: sigurno ne, osim ako raspon ima sufikse ili je neobičan
  }
  return best;
}

/**
 * Usporedba slobodnog teksta (npr. članak ViO/plinare) s adresom.
 * Ulica mora biti spomenuta; broj se provjerava samo ako se nalazi odmah iza naziva.
 */
export function matchText(ann, addr) {
  const hay = stems(ann.text || '');
  const want = stems(addr.street);
  if (!want.length || !containsStems(hay, want)) return null;
  if (ann.region && addr.region && ann.region !== addr.region) return null;
  const num = parseHouseNumber(addr.number);
  if (!num) return 'street';
  // pokušaj naći "<ulica> <broj>" u izvornom tekstu
  const folded = tokens(ann.text);
  const fs = folded.map(stem);
  for (let i = 0; i + want.length < fs.length; i++) {
    if (sameStems(fs.slice(i, i + want.length), want)) {
      const next = folded[i + want.length];
      if (/^\d+$/.test(next)) {
        return Number(next) === num.n ? 'exact' : 'street';
      }
    }
  }
  return 'street';
}

export function matchAnnouncement(ann, addr) {
  return ann.streets ? matchStructured(ann, addr) : matchText(ann, addr);
}
