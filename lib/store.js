import { createHash } from 'node:crypto';

/** Omotač oko Netlify Blobs s memorijskom zamjenom za lokalne testove. */
export async function openStore(name = 'najava') {
  if (process.env.NR_MEMORY === '1') return (globalThis.__nrMem ??= memoryStore());
  if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) return supabaseStore(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const { getStore } = await import('@netlify/blobs');
  const s = getStore({ name, consistency: 'strong' });
  return {
    getJSON: (k) => s.get(k, { type: 'json' }),
    setJSON: (k, v) => s.setJSON(k, v),
    del: (k) => s.delete(k),
    async listValues(prefix) { const out = []; for (const k of await this.list(prefix)) { const v = await this.getJSON(k); if (v != null) out.push([k, v]); } return out; },
    async list(prefix) {
      const out = [];
      let cursor;
      const { blobs } = await s.list({ prefix });
      for (const b of blobs) out.push(b.key);
      return out;
    },
  };
}

/** Pohrana u Postgresu (tablica public.kv, RLS uključen, pristup samo preko service role ključa na poslužitelju). */
export function supabaseStore(url, key) {
  const base = `${url}/rest/v1/kv`;
  const h = { apikey: key, authorization: `Bearer ${key}`, 'content-type': 'application/json' };
  const ok = async (r) => { if (!r.ok) throw new Error(`Baza: HTTP ${r.status} ${(await r.text()).slice(0, 120)}`); return r; };
  const q = encodeURIComponent;
  return {
    async getJSON(k) { const r = await ok(await fetch(`${base}?key=eq.${q(k)}&select=value`, { headers: h })); return (await r.json())[0]?.value ?? null; },
    async setJSON(k, v) { await ok(await fetch(`${base}?on_conflict=key`, { method: 'POST', headers: { ...h, prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify({ key: k, value: v, updated_at: new Date().toISOString() }) })); },
    async del(k) { await ok(await fetch(`${base}?key=eq.${q(k)}`, { method: 'DELETE', headers: h })); },
    async list(prefix) {
      const out = []; let from = 0;
      for (;;) {
        const r = await ok(await fetch(`${base}?select=key&key=like.${q(prefix + '*')}&order=key&limit=1000&offset=${from}`, { headers: h }));
        const rows = await r.json(); out.push(...rows.map((x) => x.key)); if (rows.length < 1000) return out; from += 1000;
      }
    },
    /** Svi parovi [ključ, vrijednost] s prefiksom u jednom (straničenom) upitu: puno brže od list + get za svaki. */
    async listValues(prefix) {
      const out = []; let from = 0;
      for (;;) {
        const r = await ok(await fetch(`${base}?select=key,value&key=like.${q(prefix + '*')}&order=key&limit=1000&offset=${from}`, { headers: h }));
        const rows = await r.json(); out.push(...rows.map((x) => [x.key, x.value])); if (rows.length < 1000) return out; from += 1000;
      }
    },
  };
}

export function memoryStore() {
  const m = new Map();
  return {
    m,
    async getJSON(k) { return m.has(k) ? structuredClone(m.get(k)) : null; },
    async setJSON(k, v) { m.set(k, structuredClone(v)); },
    async del(k) { m.delete(k); },
    async list(prefix) { return [...m.keys()].filter((k) => k.startsWith(prefix)); },
    async listValues(prefix) { return [...m.entries()].filter(([k]) => k.startsWith(prefix)).map(([k, v]) => [k, structuredClone(v)]); },
  };
}

export const sha = (s, n = 16) => createHash('sha256').update(s).digest('hex').slice(0, n);
export const subIdOf = (endpoint) => sha(endpoint, 24);

/** Jednostavno ograničenje broja upita po IP-u: najviše `max` u `windowMs`. */
export async function rateLimit(store, ip, bucket, max, windowMs = 60_000) {
  const key = `rl/${bucket}/${sha(ip || 'unknown', 12)}`;
  const now = Date.now();
  const cur = (await store.getJSON(key)) ?? { t: now, n: 0 };
  if (now - cur.t > windowMs) { cur.t = now; cur.n = 0; }
  cur.n += 1;
  await store.setJSON(key, cur);
  return cur.n <= max;
}
