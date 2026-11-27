import { sha } from './store.js';
import { dailySeries } from './stats.js';
import { zagrebYmd } from './time.js';

// Admin pristup bez računa u kodu: lozinku postavlja vlasnik jednokratnim kodom, na poslužitelju se čuva samo PBKDF2 sažetak.
const enc = new TextEncoder();
const ITER = 150_000;
const SESSION_MS = 12 * 3600_000;
const FAIL_WINDOW_MS = 15 * 60_000;
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
const randHex = (n) => hex(crypto.getRandomValues(new Uint8Array(n)));

export function safeEqual(a, b) {
  a = String(a); b = String(b);
  let d = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) d |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return d === 0;
}

async function pbkdf2(password, saltHex, iter = ITER) {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode(saltHex), iterations: iter }, key, 256);
  return hex(bits);
}

export const setupRecord = (code, now = new Date(), ttlMs = 48 * 3600_000) => ({ hash: sha(code, 64), exp: new Date(now.getTime() + ttlMs).toISOString() });
export const adminConfigured = async (store) => !!(await store.getJSON('admin/cred'));

async function failCount(store, key, now) {
  const f = await store.getJSON(key);
  return f && now - new Date(f.t) < FAIL_WINDOW_MS ? f.n : 0;
}
async function addFail(store, key, now) {
  const f = await store.getJSON(key);
  const fresh = !f || now - new Date(f.t) >= FAIL_WINDOW_MS;
  await store.setJSON(key, { t: fresh ? now.toISOString() : f.t, n: (fresh ? 0 : f.n) + 1 });
}
async function guard(store, ip, now, max = 5) {
  const ipKey = `admin/fail/${sha(ip || 'unknown', 12)}`;
  if ((await failCount(store, ipKey, now)) >= max || (await failCount(store, 'admin/fail/all', now)) >= max * 6) return { blocked: true, ipKey };
  return { blocked: false, ipKey };
}

export async function adminSetup(store, ip, { code, password }, now = new Date()) {
  const g = await guard(store, ip, now);
  if (g.blocked) return { ok: false, status: 429, error: 'Previše pokušaja. Pokušaj za 15 minuta.' };
  const rec = await store.getJSON('admin/setup');
  if (!rec || new Date(rec.exp) < now) return { ok: false, status: 403, error: 'Kod za postavljanje ne vrijedi ili je istekao.' };
  if (typeof code !== 'string' || !safeEqual(sha(code.trim(), 64), rec.hash)) {
    await addFail(store, g.ipKey, now); await addFail(store, 'admin/fail/all', now);
    return { ok: false, status: 403, error: 'Kod nije ispravan.' };
  }
  if (typeof password !== 'string' || password.length < 12 || password.length > 200 || /^(.)\1+$/.test(password)) return { ok: false, status: 400, error: 'Lozinka mora imati najmanje 12 znakova.' };
  const salt = randHex(16);
  await store.setJSON('admin/cred', { salt, iter: ITER, hash: await pbkdf2(password, salt), set: now.toISOString() });
  await store.del('admin/setup');
  return { ok: true };
}

export async function adminLogin(store, ip, { password }, now = new Date()) {
  const g = await guard(store, ip, now);
  if (g.blocked) return { ok: false, status: 429, error: 'Previše pokušaja. Pokušaj za 15 minuta.' };
  const cred = await store.getJSON('admin/cred');
  const good = cred && typeof password === 'string' && password.length <= 200 && safeEqual(await pbkdf2(password, cred.salt, cred.iter), cred.hash);
  if (!good) { await addFail(store, g.ipKey, now); await addFail(store, 'admin/fail/all', now); return { ok: false, status: 401, error: 'Pogrešna lozinka.' }; }
  const token = randHex(32);
  const exp = new Date(now.getTime() + SESSION_MS).toISOString();
  await store.setJSON(`admin/sess/${sha(token, 40)}`, { exp });
  for (const k of await store.list('admin/sess/')) { const s = await store.getJSON(k); if (s && new Date(s.exp) < now) await store.del(k); }
  return { ok: true, token, exp };
}

export async function adminAuth(store, token, now = new Date()) {
  if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) return false;
  const s = await store.getJSON(`admin/sess/${sha(token, 40)}`);
  return !!s && new Date(s.exp) > now;
}
export const adminLogout = (store, token) => store.del(`admin/sess/${sha(String(token), 40)}`);

const top = (map, n) => [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);

export async function computeStats(store, now = new Date()) {
  const subs = (await store.listValues('sub/')).map(([, v]) => v).filter(Boolean);
  const cities = new Map(), parts = new Map(), regions = new Map();
  let withPush = 0, digestOn = 0, areaEntries = 0, addressEntries = 0, withNtfy = 0;
  for (const s of subs) {
    if (s.push) withPush += 1; if (s.ntfy) withNtfy += 1; if (s.digest !== false) digestOn += 1;
    const devRegions = new Set();
    for (const a of s.addresses ?? []) {
      if (a.region) devRegions.add(a.region);
      if (a.kind === 'area') { areaEntries += 1; const k = `${a.city}|${a.region}`; cities.set(k, (cities.get(k) ?? 0) + 1); for (const p of a.parts ?? []) parts.set(`${p}|${a.city}`, (parts.get(`${p}|${a.city}`) ?? 0) + 1); }
      else addressEntries += 1;
    }
    for (const r of devRegions) regions.set(r, (regions.get(r) ?? 0) + 1);
  }
  const anns = (await store.listValues('ann/')).map(([, v]) => v).filter((a) => a && new Date(a.end) > now);
  const bySource = {}, byType = {};
  for (const a of anns) { bySource[a.sourceName ?? a.source] = (bySource[a.sourceName ?? a.source] ?? 0) + 1; byType[a.type] = (byType[a.type] ?? 0) + 1; }
  const series = await dailySeries(store, 14, now);
  const sum = (f, days) => series.slice(-days).reduce((t, d) => t + (d[f] ?? 0), 0);
  return {
    generated: now.toISOString(), today: zagrebYmd(now),
    devices: { total: subs.length, withPush, withNtfy, digestOn, areaEntries, addressEntries, avgEntries: subs.length ? +(((areaEntries + addressEntries) / subs.length).toFixed(1)) : 0 },
    regions: top(regions, 20).map(([region, devices]) => ({ region, devices })),
    cities: top(cities, 15).map(([k, devices]) => { const [city, region] = k.split('|'); return { city, region, devices }; }),
    parts: top(parts, 15).map(([k, devices]) => { const [part, city] = k.split('|'); return { part, city, devices }; }),
    announcements: { active: anns.length, bySource, byType },
    daily: series,
    totals: { sent7: sum('sent', 7), sent30: series.reduce((t, d) => t + d.sent, 0), newSubs7: sum('subsNew', 7), gone7: sum('subsGone', 7), removed7: sum('removed', 7), failed7: sum('failed', 7), visitors7: sum('visitors', 7), opens7: sum('opens', 7) },
    health: { tick: await store.getJSON('stats/tick'), sync: await store.getJSON('stats/sync') },
  };
}
