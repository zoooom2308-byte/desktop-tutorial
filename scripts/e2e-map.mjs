// E2E: kartice Radovi/Karta, izbor grada, "Pretraži odabrani grad", klik na najavu otvara ulicu u Google kartama
import { createRequire } from 'node:module';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PW_PATH || 'playwright');
const ok = (c, m) => { console.log(c ? 'PASS' : 'FAIL', m); if (!c) process.exitCode = 1; };
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2' };
const root = path.resolve('docs'); const PREFIX = '/desktop-tutorial/';
const server = http.createServer((req, res) => { const u = new URL(req.url, 'http://x'); if (!u.pathname.startsWith(PREFIX)) { res.writeHead(404); return res.end(); } let p = path.join(root, u.pathname.slice(PREFIX.length) || 'index.html'); if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) p = path.join(root, 'index.html'); res.writeHead(200, { 'content-type': TYPES[path.extname(p)] ?? 'application/octet-stream' }); fs.createReadStream(p).pipe(res); }).listen(8889, '127.0.0.1');
const BASE = 'http://127.0.0.1:8889' + PREFIX;
const ctx = await chromium.launchPersistentContext(fs.mkdtempSync('/tmp/claude-0/pw-'), { headless: false, args: ['--no-sandbox'], viewport: { width: 420, height: 900 } });
const page = await ctx.newPage(); const errs = []; page.on('pageerror', (e) => errs.push(e.message));
await page.goto(BASE); await page.waitForTimeout(1200);
ok((await page.locator('#tab-main').textContent()) === 'Radovi' && (await page.locator('#tab-map').textContent()) === 'Karta', 'na vrhu su kartice "Radovi" i "Karta"');
// karta bez unesenog grada
await page.click('#tab-map');
ok(await page.locator('#map-empty').isVisible() && !(await page.locator('#map-controls').isVisible()), 'bez unesenog grada karta traži da se najprije upiše grad');
await page.click('#map-go-main');
// unesi Rijeku i Zagreb
for (const g of ['Rijeka', 'Zagreb']) {
  await page.fill('#city-q', ''); await page.type('#city-q', g, { delay: 40 }); await page.keyboard.press('Enter');
  await page.waitForFunction((n) => [...document.querySelectorAll('.city-li .t')].some((x) => x.textContent === n), g, { timeout: 30000 });
}
await page.waitForFunction(() => document.querySelectorAll('#ann-list > li').length > 0, null, { timeout: 60000 });
// otvori kartu: nudi samo unesene gradove, karta je prazna
await page.click('#tab-map'); await page.waitForTimeout(800);
const opts = await page.locator('#map-city option').allTextContents();
console.log('ponuđeni gradovi:', JSON.stringify(opts));
ok(opts.length === 2 && opts.includes('Rijeka') && opts.includes('Zagreb'), 'karta nudi samo gradove koje si unio (Rijeka i Zagreb)');
ok((await page.locator('#map path.leaflet-interactive').count()) === 0, 'karta je prazna dok ne klikneš "Pretraži odabrani grad"');
// pretraži Rijeku
await page.selectOption('#map-city', { label: 'Rijeka' });
await page.click('#map-search');
await page.waitForFunction(() => document.querySelectorAll('#map path.leaflet-interactive').length > 0, null, { timeout: 90000 }).catch(() => {});
const rijeka = await page.locator('#map path.leaflet-interactive').count();
console.log('Rijeka: markeri', rijeka, '|', await page.textContent('#map-note'));
ok(rijeka > 0, 'nakon "Pretraži odabrani grad" na karti su radovi za Rijeku');
ok(await page.locator('#map .leaflet-tile-loaded').count() > 0, 'pločice karte se učitavaju');
await page.screenshot({ path: 'notes/screens/map.png' });
// pretraži Zagreb: karta se zamijeni
await page.selectOption('#map-city', { label: 'Zagreb' });
await page.click('#map-search');
await page.waitForFunction((n) => !document.getElementById('map-note').textContent.includes('Tražim'), null, { timeout: 30000 }).catch(() => {});
await page.waitForTimeout(6000);
console.log('Zagreb: markeri', await page.locator('#map path.leaflet-interactive').count(), '|', await page.textContent('#map-note'));
// klik na najavu: otvara samo tu ulicu u Google kartama
await page.click('#tab-main'); await page.waitForTimeout(500);
await page.selectOption && null;
const card = page.locator('#ann-list > li').first();
const label = (await card.locator('.maps a').first().innerText()).trim();
const popupPromise = ctx.waitForEvent('page', { timeout: 15000 });
await card.click({ position: { x: 30, y: 30 } });
const np = await popupPromise;
const url = decodeURIComponent(np.url());
console.log('klik na najavu "' + label + '" otvara:', url);
ok(url.startsWith('https://www.google.com/maps/search/?api=1&query='), 'klik na najavu otvara Google karte');
ok(url.toLowerCase().includes(label.split(' ')[0].toLowerCase()), 'u Google kartama je ulica iz najave');
await np.close();
console.log('greške:', errs);
await ctx.close(); server.close(); process.exit(process.exitCode || 0);
