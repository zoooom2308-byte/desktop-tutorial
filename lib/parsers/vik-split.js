import { cleanText } from '../text.js';
import { zagrebToDate, addDaysYmd } from '../time.js';

export const VIK_SPLIT_LIST = 'https://www.vik-split.hr/korisne-informacije/aktualnosti/obavijesti-o-prekidu-vodoopskrbe';

export function parseVikSplitList(html) {
  const re = /href="(https:\/\/www\.vik-split\.hr\/korisne-informacije\/aktualnosti\/obavijesti-o-prekidu-vodoopskrbe\/obavijest-potrosacima-na-podrucju-[^"]+)"/g;
  return [...new Set([...html.matchAll(re)].map((m) => m[1]))];
}

/**
 * Obavijest ViK-a Split: "Obavještavaju se potrošači vode na području grada SPLITA, područje Meja da će im ...
 * danas 05.11.2026.god. u vremenu od 23:00 do 03:00 sati." Najave su po područjima/naseljima (bez ulica).
 * Vraća polje najava, po jednu za svaki datum; "odgođeno"/"završeno" se preskače.
 */
export function parseVikSplitNotice(html, url) {
  const title = cleanText(html.match(/<h2 class="o-title">([\s\S]*?)<\/h2>/)?.[1] ?? '');
  if (/odgo[đd]eno|otkazano|zavr[sš]eno/i.test(title)) return [];
  const sub = cleanText(html.match(/<h5 class="o-subtitle">([\s\S]*?)<\/h5>/)?.[1] ?? '').replace(/^podru[čc]je\s+/i, '').trim();
  const i = html.search(/Obavje[šs]tavaju se/i);
  if (i < 0) return [];
  const body = cleanText(html.slice(i, i + 2500).split(/Molimo|Za sve dodatne/)[0]).replace(/\s+/g, ' ');
  const city = body.match(/na podru[čc]ju\s+(?:grada|op[ćc]ine|naselja)?\s*([A-ZČĆŽŠĐ][\p{L}-]+(?:\s+[A-ZČĆŽŠĐ][\p{L}-]+)?)/u)?.[1] ?? '';
  const year = (body.match(/\d{1,2}\.\d{1,2}\.(\d{4})/) ?? title.match(/\d{1,2}\.\d{1,2}\.(\d{4})/))?.[1];
  if (!year) return [];
  const dates = [...body.matchAll(/(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})?/g)].map((m) => `${m[3] ?? year}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`);
  const uniq = [...new Set(dates)].filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d));
  const t = body.match(/od\s*(\d{1,2})[:.](\d{2})\s*(?:sati)?\s*do\s*(\d{1,2})[:.](\d{2})/i);
  const areas = sub ? sub.split(/\s*(?:,|;|\si\s)\s*/).filter(Boolean) : [city].filter(Boolean);
  if (!areas.length || !uniq.length) return [];
  return uniq.map((ymd) => {
    const start = zagrebToDate(ymd, t ? `${t[1].padStart(2, '0')}:${t[2]}` : '00:00');
    let end = zagrebToDate(ymd, t ? `${t[3].padStart(2, '0')}:${t[4]}` : '23:59');
    if (end <= start) end = zagrebToDate(addDaysYmd(ymd, 1), `${t[3].padStart(2, '0')}:${t[4]}`);
    return {
      source: 'vik-split', region: 'split', type: 'voda', sourceName: 'ViK Split', place: city,
      streets: `naselja: ${areas.join(', ')}`, areaIsStreet: true, start: start.toISOString(), end: end.toISOString(), allDay: !t,
      note: 'Najava vrijedi za područje, ne za pojedinu ulicu.', title, url,
    };
  });
}
