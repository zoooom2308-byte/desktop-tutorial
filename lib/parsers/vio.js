import { cleanText } from '../text.js';
import { dmyToYmd, zagrebToDate } from '../time.js';

export const VIO_URL = 'https://www.vio.hr/obavijesti/privremeni-prekid-u-opskrbi-vodom-zbog-radova/1833';

/** Tablica "Aktualne obavijesti" na ViO stranici (DATUM, ULICA, NASELJE, AUTOCISTERNA, VRIJEME, STATUS). */
export function parseVioTable(html, sourceUrl = VIO_URL) {
  const out = [];
  for (const row of html.match(/<tr>[\s\S]*?<\/tr>/g) ?? []) {
    const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((c) => cleanText(c[1]).replace(/\s+/g, ' '));
    if (cells.length < 6) continue;
    const ymd = dmyToYmd(cells[0]);
    if (!ymd) continue;
    const status = cells[5].toUpperCase();
    if (status.includes('ZAVRŠENO')) continue; // završeno ne treba javljati
    const t = cells[4].match(/(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})/);
    out.push({
      source: 'vio-zagreb',
      region: 'zagreb',
      cityHint: 'Zagreb',
      type: 'voda',
      sourceName: 'ViO Zagreb',
      place: cells[2].replace(/\s+/g, ' '),
      streets: cells[1].replace(/\s*-\s*dio\s*$/i, ''),
      start: zagrebToDate(ymd, t ? `${t[1].padStart(2, '0')}:${t[2]}` : '00:00').toISOString(),
      end: zagrebToDate(ymd, t ? `${t[3].padStart(2, '0')}:${t[4]}` : '23:59').toISOString(),
      allDay: !t,
      note: `Status: ${cells[5]}${/^DA$/i.test(cells[3]) ? ' · autocisterna' : ''}`,
      title: `Prekid opskrbe vodom – ${cells[1]}`,
      url: sourceUrl,
    });
  }
  return out;
}

/** Popis poveznica na pojedinačne obavijesti ViO-a. */
export function parseVioList(html) {
  return [...new Set([...html.matchAll(/href='(\/obavijesti\/[a-z0-9-]+\/\d+)'/g)].map((m) => 'https://www.vio.hr' + m[1]))];
}

const MONTHS = { siječnja: 1, veljače: 2, ožujka: 3, travnja: 4, svibnja: 5, lipnja: 6, srpnja: 7, kolovoza: 8, rujna: 9, listopada: 10, studenog: 11, prosinca: 12 };

/** Članak tipa "Dana 27. studenog 2026 … bez vode … Ulice obuhvaćene prekidom: <li>…" */
export function parseVioArticle(html, url) {
  const title = cleanText(html.match(/<h1>([\s\S]*?)<\/h1>/)?.[1] ?? '');
  const body = html.match(/<div class="content-main-inner">([\s\S]*?)<div class="clear">/)?.[1] ?? '';
  const text = cleanText(body).replace(/\s+/g, ' ');
  const d = text.match(/(\d{1,2})\.\s*(siječnja|veljače|ožujka|travnja|svibnja|lipnja|srpnja|kolovoza|rujna|listopada|studenog|prosinca)\s*(\d{4})/i);
  if (!d || !/bez vode|prekid/i.test(title + text)) return null;
  const ymd = `${d[3]}-${String(MONTHS[d[2].toLowerCase()]).padStart(2, '0')}-${d[1].padStart(2, '0')}`;
  const t = text.match(/od\s*(\d{1,2})\s*:\s*(\d{2})\s*sati\s*do\s*(\d{1,2})\s*:\s*(\d{2})/i);
  const streets = [...body.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/g)].map((m) => cleanText(m[1])).filter(Boolean).join(', ');
  const place = text.match(/u naselju\s+([A-ZČĆŽŠĐ][\p{L} -]+?)(?:\s+na području|\.|,)/u)?.[1] ?? '';
  if (!streets) return null;
  return {
    source: 'vio-zagreb', region: 'zagreb', cityHint: 'Zagreb', type: 'voda', sourceName: 'ViO Zagreb', place, streets,
    start: zagrebToDate(ymd, t ? `${t[1].padStart(2, '0')}:${t[2]}` : '00:00').toISOString(),
    end: zagrebToDate(ymd, t ? `${t[3].padStart(2, '0')}:${t[4]}` : '23:59').toISOString(),
    allDay: !t, note: '', title, url,
  };
}
