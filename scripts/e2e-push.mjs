// E2E obavijesti: provjera korak po korak, prijem u service workeru, prikaz, poruka u stranici (simulirana dostava CDP-om)
import { createRequire } from 'node:module';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PW_PATH || 'playwright');
const ok = (c, m) => { console.log(c ? 'PASS' : 'FAIL', m); if (!c) process.exitCode = 1; };
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2' };
const root = path.resolve('docs'); const PREFIX = '/desktop-tutorial/';
const server = http.createServer((req, res) => { const u = new URL(req.url, 'http://x'); if (!u.pathname.startsWith(PREFIX)) { res.writeHead(404); return res.end(); } let p = path.join(root, u.pathname.slice(PREFIX.length) || 'index.html'); if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) p = path.join(root, 'index.html'); res.writeHead(200, { 'content-type': TYPES[path.extname(p)] ?? 'application/octet-stream' }); fs.createReadStream(p).pipe(res); }).listen(8892, '127.0.0.1');
const BASE = 'http://127.0.0.1:8892' + PREFIX;
const ctx = await chromium.launchPersistentContext(fs.mkdtempSync('/tmp/claude-0/pw-'), { headless: false, args: ['--no-sandbox'], viewport: { width: 1000, height: 1100 } });
await ctx.grantPermissions(['notifications'], { origin: 'http://127.0.0.1:8892' });
const page = await ctx.newPage(); const errs = []; page.on('pageerror', (e) => errs.push(e.message));
await page.goto(BASE); await page.waitForTimeout(1500);
ok(await page.locator('#diag-btn').isVisible(), 'gumb "Provjeri obavijesti" postoji');
ok((await page.locator('#phone-guide summary').textContent()).includes('instalirati na mobitel'), 'upute za instalaciju na mobitel postoje');
// 1) bez grada i bez pretplate: provjera mora jasno reći što nedostaje
await page.click('#diag-btn'); await page.waitForTimeout(1500);
console.log(JSON.stringify(await page.locator('#diag li').allTextContents()));
ok((await page.locator('#diag li.bad').count()) >= 1, 'provjera bez pretplate jasno javlja problem');
// 2) dodaj grad, uključi obavijesti
await page.type('#city-q', 'Rijeka', { delay: 40 }); await page.waitForSelector('#city-sugg li', { timeout: 25000 });
await page.locator('#city-sugg li', { hasText: /^Rijeka/ }).first().click(); await page.waitForTimeout(800);
await page.click('#push-on'); await page.waitForFunction(() => document.getElementById('status').textContent.includes('Uključeno'), null, { timeout: 20000 }).catch(() => {});
ok((await page.textContent('#status')).includes('Uključeno'), 'obavijesti uključene');
// 3) simulirana dostava push poruke u pravi service worker (Chromium sandbox ne smije do Googleovog push kanala)
const cdp = await ctx.newCDPSession(page); let regId;
cdp.on('ServiceWorker.workerRegistrationUpdated', (e) => { regId ??= e.registrations?.find((r) => r.scopeURL.includes('8892'))?.registrationId; });
await cdp.send('ServiceWorker.enable'); await page.waitForTimeout(800);
await cdp.send('ServiceWorker.deliverPushMessage', { origin: 'http://127.0.0.1:8892', registrationId: regId, data: JSON.stringify({ title: 'Voda: Nova najava – Rijeka', body: 'Grad Rijeka (RCC): sutra 08:00.', tag: 'ann-1', url: '/#najave' }) });
await page.waitForTimeout(1200);
const shown = await page.evaluate(async () => (await (await navigator.serviceWorker.ready).getNotifications()).map((n) => [n.title, n.body, n.tag, n.data?.url]));
console.log('prikazane obavijesti:', JSON.stringify(shown));
ok(shown.some((n) => n[0].startsWith('Voda: Nova najava') && /desktop-tutorial\/#najave$/.test(n[3] ?? '')), 'service worker prikazuje obavijest i ispravnu poveznicu pod /desktop-tutorial/');
ok((await page.locator('#toast').isVisible()) && (await page.textContent('#toast-text')).includes('Nova najava'), 'stranica pokazuje poruku i kad sustav sakrije obavijest');
const diagRec = await page.evaluate(async () => (await (await (await caches.open('nr-diag')).match('last'))?.json()));
console.log('zapis prijema:', JSON.stringify(diagRec));
ok(diagRec?.shown === true, 'service worker bilježi da je obavijest prikazana');
// 4) cijela provjera s pravim poslužiteljem: simuliraj dolazak kad poslužitelj preda poruku
const diagP = page.click('#diag-btn');
await page.waitForFunction(() => /Poslužitelj je predao|istekla|nije uspio/.test(document.getElementById('diag').textContent), null, { timeout: 30000 }).catch(() => {});
await cdp.send('ServiceWorker.deliverPushMessage', { origin: 'http://127.0.0.1:8892', registrationId: regId, data: JSON.stringify({ title: 'Najava radova: probna obavijest', body: 'Obavijesti rade.', tag: 'test', url: '/' }) }).catch(() => {});
await diagP; await page.waitForTimeout(4000);
console.log(JSON.stringify(await page.locator('#diag li').allTextContents()));
const txt = await page.textContent('#diag');
ok(/Poslužitelj je predao|istekla/.test(txt), 'provjera dolazi do koraka poslužitelja (Google prihvaća ili javlja da je pretplata istekla)');
await page.screenshot({ path: 'notes/screens/diag.png', fullPage: true });
const mp = await ctx.newPage(); await mp.setViewportSize({ width: 412, height: 915 }); await mp.goto(BASE); await mp.waitForTimeout(1200);
ok(await mp.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'nema vodoravnog skrolanja na mobitelu');
console.log('greške:', errs);
await ctx.close(); server.close(); process.exit(process.exitCode || 0);
