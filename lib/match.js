import { fold, tokens, stem, stems, sameStems, containsStems } from './text.js';

const KW = new Set(['br', 'kbr', 'broj', 'broja', 'brojeva', 'brojevi', 'kb', 'od', 'do', 'i', 'par', 'parni', 'parnih', 'nep', 'neparni', 'neparnih', 'obje', 'dio', 'bb', 'kraja', 'naselja', 'naselje', 'svi', 'cijela', 'cijelo', 'cijeli']);
const TOKEN = /(\d+(?:\s?\/\s?\d+|\/?[A-Za-z](?![\p{L}]))?)|([\p{L}][\p{L}.'’]*)|([,;:\n()\-–])/gu;
const kw = (w) => KW.has(fold(w).replace(/\./g, ''));
const parityOf = (w) => { const f = fold(w); return f.startsWith('par') ? 'even' : f.startsWith('nep') ? 'odd' : null; };

/**
 * Tokenizira slobodan tekst s popisom ulica i raspona. Podržava formate više elektri i komunalaca, npr.
 *   "JABLANOVEČKA 40, 47-57 nep, LOŠINJSKA 20-do kraja par, 23-33 nep"
 *   "- Braće Bačić br. 1 - 13 (neparni brojevi), 6, 8, 10"
 *   "TRG KRALJA TOMISLAVA, IVANA GORANA KOVAČIĆA par. od kbr. 2-8 i nep. od kbr. 1"
 *   "naselja: Sv.Petar,Pojane"  /  "BIJELA GORICA:\nBREGOVITA ULICA 1-20 obje"
 * Vraća { streets:[{street,stems,ranges|null}], settlements:[string] }. ranges === null = cijela ulica.
 */
export function parseTargets(raw) {
  const text = String(raw ?? '');
  const toks = [...text.matchAll(TOKEN)].map((m) => (m[1] ? { t: 'num', v: m[1] } : m[2] ? { t: 'word', v: m[2] } : { t: 'p', v: m[3] }));
  const streets = [], settlements = [];
  let cur = null, last = null, boundary = true, settleMode = false, pendRange = false, pendParity = null, openFrom = false, settleCur = null;
  const flushRange = () => { if (pendRange && last?.ranges) { last.to = Infinity; } pendRange = false; };
  let lastItem = null;
  const newStreet = (w) => { cur = { street: w, ranges: [] }; streets.push(cur); lastItem = null; };
  for (let i = 0; i < toks.length; i++) {
    const k = toks[i];
    if (k.t === 'num') {
      if (settleMode || !cur) continue;
      const n = parseInt(k.v, 10);
      if (pendRange && lastItem) { lastItem.to = n; delete lastItem.open; pendRange = false; openFrom = false; }
      else {
        lastItem = { from: n, to: n, parity: pendParity ?? 'both' };
        if (openFrom) { lastItem.open = true; }
        cur.ranges.push(lastItem); pendParity = null;
      }
      boundary = false; last = null; continue;
    }
    if (k.t === 'p') {
      if (k.v === '-' || k.v === '–') { if (lastItem && !settleMode && !boundary) pendRange = true; continue; }
      if (k.v === ':') {
        if (!settleMode && cur && !cur.ranges.length && !openFrom) { settlements.push(cur.street); streets.pop(); cur = null; }
        boundary = true; continue;
      }
      if (k.v === '(' || k.v === ')') continue;
      // , ; \n
      if (pendRange && lastItem) { lastItem.to = Infinity; lastItem.open = true; pendRange = false; }
      else if (lastItem?.open && lastItem.to === lastItem.from) lastItem.to = Infinity;
      openFrom = false; boundary = true; if (k.v === '\n') { settleCur = null; settleMode = false; } continue;
    }
    const w = k.v.replace(/\.$/, '');
    const f = fold(w);
    const prevWord = i > 0 && toks[i - 1].t === 'word' ? fold(toks[i - 1].v).replace(/\./g, '') : '';
    if (kw(w)) {
      if (f === 'naselja' || f === 'naselje') { if (prevWord !== 'cijela' && prevWord !== 'cijelo' && prevWord !== 'cijeli') { settleMode = true; boundary = true; } continue; }
      if (f === 'do') { if (lastItem && !boundary) pendRange = true; continue; }
      if (f === 'kraja') { if (pendRange && lastItem) { lastItem.to = Infinity; pendRange = false; } continue; }
      if (f === 'od') { openFrom = true; continue; }
      if (f === 'obje') { if (lastItem) lastItem.parity = 'both'; continue; }
      if (parityOf(f)) {
        const par = parityOf(f);
        let j = i + 1; while (j < toks.length && toks[j].t === 'word' && ['brojevi', 'brojeva', 'kbr', 'br'].includes(fold(toks[j].v).replace(/\./g, ''))) j++;
        const nx = toks[j];
        if (nx && (nx.t === 'num' || (nx.t === 'word' && fold(nx.v) === 'od'))) pendParity = par;
        else if (lastItem) lastItem.parity = par;
        continue;
      }
      if (f === 'i') {
        const nx = toks[i + 1];
        if (nx?.t === 'word' && !kw(nx.v)) boundary = true;
        continue;
      }
      continue; // br, kbr, broj, dio, bb, svi ...
    }
    // obična riječ: dio naziva ulice (ili naselja)
    if (settleMode) {
      if (boundary || !settleCur) { settleCur = { name: w }; settlements.push(settleCur); } else settleCur.name += ' ' + w;
      boundary = false; continue;
    }
    if (boundary || lastItem) { newStreet(w); } else cur.street += ' ' + w;
    boundary = false; pendRange = false; openFrom = false;
  }
  if (pendRange && lastItem) { lastItem.to = Infinity; lastItem.open = true; }
  else if (lastItem?.open && lastItem.to === lastItem.from) lastItem.to = Infinity;
  const out = streets
    .map((e) => ({ street: e.street.replace(/\s+/g, ' ').trim(), ranges: e.ranges.length ? e.ranges : null }))
    .map((e) => ({ ...e, stems: stems(e.street) }))
    .filter((e) => e.stems.length);
  return { streets: out, settlements: settlements.map((x) => (typeof x === 'string' ? x : x.name)).map((x) => x.trim()).filter(Boolean) };
}

export const parseStreetList = (raw) => parseTargets(raw).streets;

export function parseHouseNumber(s) {
  const m = String(s ?? '').trim().match(/^(\d+)\s*([a-zA-Z])?$/);
  return m ? { n: parseInt(m[1], 10), suffix: (m[2] || '').toLowerCase() } : null;
}

function rangeHit(ranges, n) {
  let hit = null;
  for (const r of ranges) {
    if (n < r.from || n > r.to) continue;
    if (r.parity === 'even' && n % 2 !== 0) continue;
    if (r.parity === 'odd' && n % 2 !== 1) continue;
    if (!r.open) return 'exact';
    hit = 'street'; // raspon bez izričite gornje granice: nesigurno
  }
  return hit;
}

const placeParts = (p) => String(p ?? '').split(/[,;]/).map((x) => x.replace(/[.]+$/, '').trim()).filter(Boolean);

// Nazivi naselja i četvrti dolaze u raznim padežima (Meja/Meje, Splita/Split): dopuštamo razliku u zadnjem slovu.
const looseWord = (x, y) => x === y || (x.length >= 4 && x.length === y.length && x.slice(0, -1) === y.slice(0, -1));
const looseSame = (a, b) => a.length === b.length && a.every((x, i) => looseWord(x, b[i]));
const looseContains = (hay, needle) => needle.length > 0 && hay.some((_, i) => i + needle.length <= hay.length && looseSame(hay.slice(i, i + needle.length), needle));

function nameMatches(name, addr) {
  const a = stems(name);
  if (!a.length) return false;
  return [addr.city, ...(addr.places || [])].filter(Boolean).some((c) => {
    const cs = stems(c);
    return cs.length && (sameStems(a, cs) || containsStems(a, cs) || containsStems(cs, a) || looseContains(a, cs) || looseContains(cs, a));
  });
}

const placeMatches = (announcePlace, addr) => {
  const parts = placeParts(announcePlace);
  return !parts.length || parts.some((p) => nameMatches(p, addr));
};

// U Zagrebu najave navode kvart/naselje (Špansko, Sesvete), a korisnik upisuje "Zagreb": tamo mjesto ne mora odgovarati.
const isZagrebCity = (addr) => fold(addr.city || '').replace(/^grad\s+/, '').trim() === 'zagreb';

/**
 * Usporedba jedne najave s popisom ulica s adresom korisnika.
 * Vraća 'exact' | 'street' | 'area' | null.
 *  - 'exact'  : ulica se podudara i kućni broj je unutar raspona (ili je cijela ulica)
 *  - 'street' : ulica se podudara, ali nismo sigurni za broj
 *  - 'area'   : najava navodi samo naselje u kojem živiš (bez ulica)
 */
export function matchStructured(ann, addr) {
  if (ann.region && addr.region && ann.region !== addr.region) return null;
  const { streets, settlements } = parseTargets(ann.streets);
  const placeOk = placeMatches(ann.place, addr);
  const want = stems(addr.street);
  const num = parseHouseNumber(addr.number);
  let best = null;
  for (const e of streets) {
    if (!want.length || !sameStems(e.stems, want)) continue;
    if (!placeOk) { if (isZagrebCity(addr)) best = 'street'; continue; }
    if (e.ranges === null) return 'exact';
    if (!num) { best = 'street'; continue; }
    const hit = rangeHit(e.ranges, num.n);
    if (hit === 'exact') return num.suffix ? 'street' : 'exact';
    if (hit) best = 'street';
  }
  if (best) return best;
  // ViK Split navodi u podnaslovu ulice ili četvrti: ime ulice koje se podudara, a broj je nepoznat
  if (ann.areaIsStreet && want.length && settlements.some((n) => looseContains(stems(n), want) || looseSame(stems(n), want))) return 'street';
  // popis naselja; cijele "ulice" bez brojeva i polje mjesta mogu zapravo biti nazivi naselja (Osijek, Zadar, Pula)
  const wholeNames = streets.filter((e) => e.ranges === null).map((e) => e.street);
  const areas = [...settlements, ...(placeOk ? wholeNames : []), ...(streets.length || settlements.length ? [] : placeParts(ann.place))];
  if (areas.some((n) => nameMatches(n, addr))) return 'area';
  return null;
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
