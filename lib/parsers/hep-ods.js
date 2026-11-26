import { cleanText } from '../text.js';
import { dmyToYmd, zagrebToDate } from '../time.js';

export const HEP_BASE = 'https://www.hep.hr/ods/bez-struje/19';

export function hepUrl(dp, el, dmy) {
  const q = new URLSearchParams({ dp });
  if (el) q.set('el', el);
  if (dmy) q.set('datum', dmy);
  return `${HEP_BASE}?${q}`;
}

/** Popis elektri (dp) iz padajućeg izbornika. */
export function parseHepAreas(html) {
  const sel = html.match(/id="dp"[\s\S]*?<\/select>/i)?.[0] ?? '';
  return [...sel.matchAll(/<option value='([^']+)'>([^<]+)</g)].map((m) => ({ dp: m[1], name: cleanText(m[2]) }));
}

/** Terenske jedinice (el) iz drugog izbornika. */
export function parseHepUnits(html) {
  const sels = [...html.matchAll(/<select[^>]*>[\s\S]*?<\/select>/gi)].map((m) => m[0]);
  const sel = sels.find((s) => /el='/.test(s) || /value='ZG'|value='\d+'/.test(s)) ?? '';
  return [...sel.matchAll(/<option value='([^']+)'[^>]*>([^<]+)</g)].map((m) => ({ el: m[1], name: cleanText(m[2]) }));
}

/** Datumi koji imaju najave (klasa "broj ima" u traci dana). */
export function parseHepDays(html) {
  return [...html.matchAll(/datum=(\d{2}\.\d{2}\.\d{4})'[^>]*class='dan'>\s*[^<]*<div class='broj ima'/g)].map((m) => m[1]);
}

/**
 * Parsira jednu HEP ODS stranicu (jedan dan, jedna terenska jedinica) u najave.
 * Elementi su <div class="mjesto"> (Mjesto + Ulica) i <div class="vrijeme"> (vrijeme + tip).
 */
export function parseHepPage(html, { dp, el, sourceUrl } = {}) {
  const heading = html.match(/Terenska jedinica[^<]*?-\s*(\d{1,2}\.\d{2}\.\d{4})/);
  const ymd = heading ? dmyToYmd(heading[1]) : null;
  if (!ymd) return [];
  const out = [];
  const re = /<div class="mjesto[^"]*">([\s\S]*?)<div class="vrijeme[^"]*">([\s\S]*?)<div class="clear">/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    const place = cleanText(m[1].match(/class="grad">([\s\S]*?)<\/div>/)?.[1] ?? '').replace(/^Mjesto:\s*/i, '');
    const streets = cleanText(m[1].match(/class="ulica">([\s\S]*?)<\/div>/)?.[1] ?? '').replace(/^Ulica:\s*/i, '');
    const when = cleanText(m[2].match(/class="kada">([\s\S]*?)<\/div>/)?.[1] ?? '');
    const kind = cleanText(m[2].match(/class="tip">([\s\S]*?)<\/div>/)?.[1] ?? '').replace(/^Radovi:\s*/i, '');
    if (!streets) continue;
    const t = when.match(/(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})/);
    const start = zagrebToDate(ymd, t ? `${t[1].padStart(2, '0')}:${t[2]}` : '00:00');
    const end = zagrebToDate(ymd, t ? `${t[3].padStart(2, '0')}:${t[4]}` : '23:59');
    out.push({
      source: 'hep-ods',
      region: dp ?? 'zagreb',
      type: 'struja',
      sourceName: 'HEP ODS',
      place,
      streets,
      start: start.toISOString(),
      end: end.toISOString(),
      allDay: !t,
      note: kind,
      title: `Planirani radovi – ${place}`,
      url: sourceUrl ?? hepUrl(dp ?? 'zagreb', el, `${ymd.slice(8)}.${ymd.slice(5, 7)}.${ymd.slice(0, 4)}`),
    });
  }
  return out;
}
