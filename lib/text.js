// Normalizacija hrvatskog teksta za usporedbu adresa.

const NOISE = new Set(['ulica', 'ul', 'ulici', 'ulice', 'ulicu', 'ulicom']);
// Najčešći padežni nastavci (dulji prvi). Skidamo najviše jedan.
const ENDINGS = ['ovima', 'evima', 'ima', 'ama', 'oga', 'ega', 'ove', 'eve', 'oj', 'om', 'em', 'ih', 'im', 'og', 'eg', 'a', 'e', 'i', 'u', 'o'];

export function fold(s) {
  return String(s ?? '')
    .toLowerCase()
    .replace(/đ/g, 'd')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/&nbsp;/g, ' ');
}

export function tokens(s) {
  return fold(s)
    .replace(/\bsv\.\s*/g, 'sveti ')
    .replace(/\bbr\.\s*/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t && !NOISE.has(t));
}

export function stem(t) {
  if (/\d/.test(t) || t.length <= 4) return t;
  for (const e of ENDINGS) {
    if (t.endsWith(e) && t.length - e.length >= 3) return t.slice(0, -e.length);
  }
  return t;
}

export function stems(s) {
  return tokens(s).map(stem);
}

/** Jesu li dva niza stemova ista (uz toleranciju na sufiks duljine do 2 znaka). */
export function sameStems(a, b) {
  if (!a.length || a.length !== b.length) return false;
  return a.every((x, i) => {
    const y = b[i];
    if (x === y) return true;
    const [s, l] = x.length <= y.length ? [x, y] : [y, x];
    return s.length >= 6 && l.startsWith(s) && l.length - s.length <= 2;
  });
}

/** Je li niz `needle` podniz od `hay` (po stemovima). */
export function containsStems(hay, needle) {
  if (!needle.length) return false;
  for (let i = 0; i + needle.length <= hay.length; i++) {
    if (sameStems(hay.slice(i, i + needle.length), needle)) return true;
  }
  return false;
}

export function cleanText(html) {
  return String(html ?? '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|tr|h\d)>/gi, '\n')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&#8209;/g, '-')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n')
    .trim();
}
