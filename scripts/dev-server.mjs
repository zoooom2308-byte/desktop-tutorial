// Lokalni poslužitelj za testiranje: statične datoteke + Netlify funkcije (memorijska pohrana).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
process.env.NR_MEMORY ??= '1';
const root = path.resolve('public');
const mods = {};
for (const f of fs.readdirSync('netlify/functions')) {
  const m = await import(path.resolve('netlify/functions', f));
  if (m.config?.path) mods[m.config.path] = m;
}
export const store = await (await import('../lib/store.js')).openStore();
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://localhost');
  if (mods[u.pathname]) {
    const chunks = []; for await (const c of req) chunks.push(c);
    const r = await mods[u.pathname].default(new Request(u, { method: req.method, headers: req.headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : Buffer.concat(chunks) }), { ip: '127.0.0.1' });
    res.writeHead(r.status, Object.fromEntries(r.headers)); return res.end(Buffer.from(await r.arrayBuffer()));
  }
  let p = path.join(root, u.pathname === '/' ? 'index.html' : u.pathname);
  if (!p.startsWith(root) || !fs.existsSync(p)) { res.writeHead(404); return res.end('404'); }
  res.writeHead(200, { 'content-type': TYPES[path.extname(p)] ?? 'application/octet-stream', 'content-security-policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; manifest-src 'self'; worker-src 'self'; object-src 'none'; base-uri 'none'" });
  fs.createReadStream(p).pipe(res);
});
export const start = (port = 8899) => new Promise((r) => server.listen(port, '127.0.0.1', () => r(server)));
if (process.argv[1].endsWith('dev-server.mjs')) { await start(); console.log('http://127.0.0.1:8899'); }
