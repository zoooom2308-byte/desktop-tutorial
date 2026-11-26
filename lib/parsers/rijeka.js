import { cleanText } from '../text.js';
import { zagrebToDate, zagrebYmd, addDaysYmd } from '../time.js';

export const RIJEKA_URL = 'https://info.rijekacitycard.hr/hr/get-notices';
export const RIJEKA_PAGE = 'https://info.rijekacitycard.hr/hr/radovi';
const TYPES = { Water: 'voda', ElectricPower: 'struja', Gas: 'plin', ThermalPower: 'grijanje', Traffic: 'ceste' };
const NAMES = { voda: 'Prekid vodoopskrbe', struja: 'Isključenje struje', plin: 'Isključenje plina', grijanje: 'Prekid grijanja', ceste: 'Regulacija prometa' };

/** "8-12", "08:00 - 11:00", "14:00-16:00" -> [h1,m1,h2,m2] ili null */
export function parseTimes(s) {
  const m = String(s ?? '').match(/(\d{1,2})(?::(\d{2}))?\s*[-–]\s*(\d{1,2})(?::(\d{2}))?/);
  return m ? [+m[1], +(m[2] ?? 0), +m[3], +(m[4] ?? 0)] : null;
}
const hm = (h, m) => `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;

/** "JLS Rijeka, naselje Rijeka, ulica IVANA LENCA, k.br. 7,9" -> { jls, naselje, ulica, brojevi } */
export function parseScopeUnit(u) {
  const m = String(u).match(/^JLS\s+(.+?),\s*naselje\s+(.+?),\s*ulica\s+(.+?),\s*k\.?\s*br\.?\s*(.*)$/i);
  if (!m) return { jls: '', naselje: '', ulica: String(u).trim(), brojevi: '' };
  return { jls: m[1].trim(), naselje: m[2].trim(), ulica: m[3].trim(), brojevi: m[4].trim() };
}

function numbersOf(spec) {
  const s = String(spec).trim();
  if (!s || /^svi$/i.test(s)) return '';
  // zadrži samo brojeve i raspone: "93-95/B, 101-103/C" ili "7,9"
  const parts = s.split(/\s*,\s*/).filter((p) => /^\d/.test(p));
  return parts.join(', ');
}

/** Pretvara odgovor /hr/get-notices u najave, po jedna za svaku kombinaciju (obavijest, naselje). */
export function parseRijekaNotices(json) {
  const groups = typeof json === 'string' ? JSON.parse(json) : json;
  const out = [];
  for (const g of groups ?? []) {
    const type = TYPES[g.Id];
    if (!type) continue; // gradski prijevoz i čistoća nisu radovi na instalacijama/cestama
    for (const n of g.Notices ?? []) {
      const sd = (n.StartsOn ?? '').slice(0, 10), ed = (n.EndsOn ?? n.StartsOn ?? '').slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(sd)) continue;
      const t = parseTimes(n.TimesWithinDay);
      let start, end;
      if (t) {
        start = zagrebToDate(sd, hm(t[0], t[1]));
        const endYmd = ed > sd ? ed : sd;
        end = zagrebToDate(endYmd, hm(t[2], t[3]));
        if (end <= start) end = zagrebToDate(addDaysYmd(endYmd, 1), hm(t[2], t[3]));
      } else { start = zagrebToDate(sd, '00:00'); end = zagrebToDate(ed >= sd ? ed : sd, '23:59'); }
      const byPlace = new Map();
      for (const raw of n.ScopeUnits ?? []) {
        const u = parseScopeUnit(raw);
        const key = u.naselje || u.jls || '';
        if (!byPlace.has(key)) byPlace.set(key, new Map());
        const streets = byPlace.get(key);
        const nums = numbersOf(u.brojevi);
        const prev = streets.get(u.ulica);
        if (prev === undefined) streets.set(u.ulica, nums);
        else if (prev !== '' && nums !== '') streets.set(u.ulica, `${prev}, ${nums}`);
        else streets.set(u.ulica, '');
      }
      const note = cleanText(n.Notes ?? '').replace(/\s+/g, ' ').slice(0, 200);
      for (const [place, streets] of byPlace) {
        const list = [...streets].map(([name, nums]) => (nums ? `${name} ${nums}` : name)).join(', ');
        out.push({
          source: 'rijeka-rcc', region: 'rijeka', type, sourceName: 'Grad Rijeka (RCC)', place, streets: list,
          start: start.toISOString(), end: end.toISOString(), allDay: !t,
          note, title: `${NAMES[type]} – ${place}`, url: RIJEKA_PAGE,
        });
      }
    }
  }
  return out;
}
