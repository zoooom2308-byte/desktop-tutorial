// E2E za GitHub Pages inačicu: statika pod /desktop-tutorial/, stvarna pozadina (Supabase) i stvarni Nominatim.
import { createRequire } from 'node:module';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
const require = createRequire(import.meta.url);
const { chromium, devices } = require(process.env.PW_PATH || 'playwright');
const ok = (c, m) => { console.log(c ? 'PASS' : 'FAIL', m); if (!c) process.exitCode = 1; };
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2' };
const root = path.resolve('docs'); const PREFIX = '/desktop-tutorial/';
const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  if (!u.pathname.startsWith(PREFIX)) { res.writeHead(404); return res.end('404'); }
  let p = path.join(root, u.pathname.slice(PREFIX.length) || 'index.html'); if (p.endsWith(path.sep)) p += 'index.html';
  if (!p.startsWith(root) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end('404'); }
  res.writeHead(200, { 'content-type': TYPES[path.extname(p)] ?? 'application/octet-stream' }); fs.createReadStream(p).pipe(res);
}).listen(8894, '127.0.0.1');
const BASE = 'http://127.0.0.1:8894' + PREFIX;
const ctx = await chromium.launchPersistentContext(fs.mkdtempSync('/tmp/claude-0/pw-'), { headless: false, args: ['--no-sandbox'], viewport: { width: 1000, height: 900 } });
await ctx.grantPermissions(['notifications'], { origin: 'http://127.0.0.1:8894' });
const page = await ctx.newPage(); const errs = []; page.on('pageerror', (e) => errs.push(e.message)); page.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
await page.goto(BASE); await page.waitForTimeout(1500);
ok((await page.textContent('h1')).includes('Najava radova'), 'stranica se otvara pod podputanjom /desktop-tutorial/');
ok(await page.evaluate(async () => !!(await navigator.serviceWorker.getRegistration())), 'service worker registriran (scope pod podputanjom)');
const man = await (await ctx.request.get(BASE + 'manifest.webmanifest')).json();
ok(man.start_url === './?src=pwa' && man.scope === './', 'manifest ima relativne putanje');
// adresa u Rijeci kroz stvarne prijedloge
await page.type('#q', 'Školjić 14, Rijeka', { delay: 40 });
await page.waitForSelector('#sugg li', { timeout: 25000 }).catch(() => {});
const sugg = await page.locator('#sugg li').allTextContents(); console.log('prijedlozi:', JSON.stringify(sugg));
ok(sugg.length > 0, 'prijedlozi adrese dolaze izravno iz Nominatima (preglednik)');
if (sugg.length) { await page.locator('#sugg li').first().click(); await page.fill('#label', 'Rijeka test'); await page.click('#addr-form button[type=submit]'); }
await page.waitForTimeout(800);
console.log('adrese:', await page.locator('#addr-list .s').allTextContents());
await page.waitForFunction(() => { const t = document.getElementById('ann-state').textContent; return t.length > 3 && !/Tražim|Dodaj adresu/.test(t); }, null, { timeout: 45000 }).catch(() => {});
console.log('stanje najava:', await page.textContent('#ann-state'), '| stavki:', await page.locator('#ann-list li').count());
ok((await page.locator('#ann-list li').count()) >= 1, 'popis najava za riječku adresu dolazi iz Supabase pozadine');
// push
await page.click('#push-on');
await page.waitForFunction(() => document.getElementById('status').textContent.includes('Uključeno'), null, { timeout: 20000 }).catch(() => {});
ok((await page.textContent('#status')).includes('Uključeno'), 'push pretplata kreirana: ' + (await page.textContent('#push-msg').catch(() => '')));
await page.click('#push-test'); await page.waitForTimeout(6000);
const tmsg = await page.textContent('#push-msg').catch(() => ''); console.log('probna obavijest ->', tmsg);
ok(/poslana/i.test(tmsg), 'poslužitelj (Deno web-push) predao probnu obavijest FCM-u');
await page.screenshot({ path: 'notes/screens/pages-desktop.png', fullPage: true });
// offline
await ctx.setOffline(true); await page.reload(); await page.waitForTimeout(1500);
ok((await page.textContent('h1')).includes('Najava radova'), 'radi bez interneta pod podputanjom');
await ctx.setOffline(false);
// mobilni
const mp = await ctx.newPage(); await mp.setViewportSize({ width: 412, height: 915 }); await mp.goto(BASE); await mp.waitForTimeout(1200);
ok(await mp.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'nema vodoravnog skrolanja na 412px');
console.log('console errors:', errs.filter((e) => !/ERR_INTERNET_DISCONNECTED/.test(e)));
await ctx.close(); server.close(); process.exit(process.exitCode || 0);
