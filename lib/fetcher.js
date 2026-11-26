// Pristojno dohvaćanje izvora: opisni User-Agent bez osobnih podataka, razmak između zahtjeva, uvjetni GET (ETag).
export const USER_AGENT = 'NajavaRadova/1.0 (obavijesti o planiranim radovima; neprofitno; +https://najava-radova.netlify.app)';
const MIN_GAP_MS = 700;
let last = 0;

export async function politeFetch(url, { etag, lastModified, timeoutMs = 12000, accept = 'text/html,application/xhtml+xml' } = {}) {
  const wait = last + MIN_GAP_MS - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  last = Date.now();
  const headers = { 'User-Agent': USER_AGENT, 'Accept': accept, 'Accept-Language': 'hr' };
  if (etag) headers['If-None-Match'] = etag;
  if (lastModified) headers['If-Modified-Since'] = lastModified;
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(timeoutMs), redirect: 'follow' });
  if (res.status === 304) return { notModified: true };
  if (!res.ok) throw new Error(`HTTP ${res.status} za ${url}`);
  const buf = await res.arrayBuffer();
  if (buf.byteLength > 2_000_000) throw new Error('Odgovor prevelik');
  return {
    html: new TextDecoder('utf-8').decode(buf),
    etag: res.headers.get('etag') ?? undefined,
    lastModified: res.headers.get('last-modified') ?? undefined,
  };
}
