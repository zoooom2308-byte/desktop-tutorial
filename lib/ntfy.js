import { USER_AGENT } from './fetcher.js';

// Rezervni kanal: besplatna usluga ntfy.sh (bez računa). Korisnik instalira aplikaciju ntfy i pretplati se na svoju tajnu temu.
export const NTFY_URL = 'https://ntfy.sh';
export const SITE_URL = 'https://zoooom2308-byte.github.io/desktop-tutorial/';
export const validTopic = (t) => typeof t === 'string' && /^[A-Za-z0-9_-]{16,64}$/.test(t);

export async function sendNtfy(topic, { title, body, url = SITE_URL + '#najave' }) {
  if (!validTopic(topic)) return { ok: false, error: 'neispravna tema' };
  try {
    const res = await fetch(NTFY_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'user-agent': USER_AGENT },
      body: JSON.stringify({ topic, title: String(title).slice(0, 200), message: String(body).slice(0, 500), click: url, priority: 4, tags: ['construction'] }),
      signal: AbortSignal.timeout(8000),
    });
    return res.ok ? { ok: true } : { ok: false, status: res.status };
  } catch (e) {
    return { ok: false, error: String(e.message).slice(0, 120) };
  }
}
