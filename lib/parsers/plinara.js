import { cleanText } from '../text.js';
import { dmyToYmd, zagrebToDate } from '../time.js';

export function parsePlinaraList(html) {
  return [...new Set([...html.matchAll(/href='(\/novosti\/[a-z0-9-]+\/\d+)/g)].map((m) => 'https://www.plinara-zagreb.hr' + m[1]))];
}

/** Obavijest o obustavi plina: "dana 06.10.2026 … ZONA OBUHVATA RADOVA: ULICA RADNIČKA CESTA 1 , ZAGREB" */
export function parsePlinaraNotice(html, url) {
  const title = cleanText(html.match(/<h1 class="ss-title">([\s\S]*?)<\/h1>/)?.[1] ?? '');
  const body = html.match(/<div class="user-content">([\s\S]*?)<div class="clearfix">/)?.[1] ?? '';
  const text = cleanText(body);
  if (!/obustavlj|obustav|prekid/i.test(text + title)) return null;
  const d = text.match(/(\d{1,2}\.\d{1,2}\.\d{4})/);
  const ymd = d && dmyToYmd(d[1]);
  if (!ymd) return null;
  const zone = text.match(/ZONA OBUHVATA RADOVA\s*:\s*([^\n]+)/i)?.[1]?.trim() ?? '';
  if (!zone) return null;
  // "ULICA RADNIČKA CESTA 1 , ZAGREB" -> mjesto je zadnji dio iza zareza
  const parts = zone.split(/\s*,\s*/);
  const place = parts.length > 1 && !/\d/.test(parts[parts.length - 1]) ? parts.pop() : '';
  const streets = parts.join(', ').replace(/^ULICA\s+/i, '');
  const t = text.match(/od\s*(\d{1,2})[:.](\d{2})\s*(?:sati)?\s*do\s*(\d{1,2})[:.](\d{2})/i);
  return {
    source: 'plinara-zagreb', region: 'zagreb', type: 'plin', sourceName: 'Gradska plinara Zagreb', place, streets,
    start: zagrebToDate(ymd, t ? `${t[1].padStart(2, '0')}:${t[2]}` : '00:00').toISOString(),
    end: zagrebToDate(ymd, t ? `${t[3].padStart(2, '0')}:${t[4]}` : '23:59').toISOString(),
    allDay: !t, note: 'Točno vrijeme je u privitku izvorne obavijesti.', title, url,
  };
}
