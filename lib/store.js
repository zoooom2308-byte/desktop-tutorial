import { createHash } from 'node:crypto';

/** Omotač oko Netlify Blobs s memorijskom zamjenom za lokalne testove. */
export async function openStore(name = 'najava') {
  if (process.env.NR_MEMORY === '1') return (globalThis.__nrMem ??= memoryStore());
  const { getStore } = await import('@netlify/blobs');
  const s = getStore({ name, consistency: 'strong' });
  return {
    getJSON: (k) => s.get(k, { type: 'json' }),
    setJSON: (k, v) => s.setJSON(k, v),
    del: (k) => s.delete(k),
    async list(prefix) {
      const out = [];
      let cursor;
      const { blobs } = await s.list({ prefix });
      for (const b of blobs) out.push(b.key);
      return out;
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
