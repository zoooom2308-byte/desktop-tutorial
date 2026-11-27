// E2E karte: upiši grad, vidi najave, klikni najavu, provjeri da se karta otvara s markerima (stvarna pozadina, stvarne pločice)
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
const page = await ctx.newPage(); const errs = []; page.on('pageerror', (e) => errs.push(e.message)); page.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
await page.goto(BASE); await page.waitForTimeout(1200);
const order = await page.evaluate(() => [...document.querySelectorAll('main > section')].filter((s) => !s.hidden).map((s) => s.querySelector('h3')?.textContent));
console.log('redoslijed odjeljaka:', JSON.stringify(order));
ok(order[0] === 'Gdje želiš obavijesti' && order[1] === 'Što se kopa kod tebe', 'grad je prvi, odmah ispod su najave');
await page.type('#city-q', 'Rijeka', { delay: 40 }); await page.keyboard.press('Enter'); // Enter bira prvi prijedlog
await page.waitForSelector('.city-li', { timeout: 30000 });
ok((await page.locator('.city-li .parts').first().isHidden()), 'dijelovi grada su zatvoreni dok ih ne zatražiš');
await page.waitForFunction(() => document.querySelectorAll('#ann-list li').length > 0, null, { timeout: 60000 });
const n = await page.locator('#ann-list li').count(); console.log('najave:', n);
ok(await page.locator('#ann-map-all').isVisible(), 'gumb "Karta svih radova" postoji');
await page.locator('#ann-list li').nth(1).click({ position: { x: 30, y: 30 } });
await page.waitForSelector('#map-dialog[open]', { timeout: 10000 });
await page.waitForSelector('#map .leaflet-tile-loaded', { timeout: 30000 }).catch(() => {});
await page.waitForTimeout(1500);
const markers = await page.locator('#map path.leaflet-interactive').count();
console.log('markeri:', markers, '| bilješka:', await page.textContent('#map-note'), '| legenda:', JSON.stringify(await page.locator('#map-legend li').allTextContents()));
ok(await page.locator('#map .leaflet-tile-loaded').count() > 0, 'pločice OpenStreetMapa se učitavaju');
ok(markers > 0, 'na karti ima markera radova');
if (markers) { await page.locator('#map path.leaflet-interactive').first().click({ force: true }); await page.waitForTimeout(500); console.log('skočni prozor:', JSON.stringify((await page.locator('.leaflet-popup-content').first().innerText().catch(() => '')).slice(0, 160))); }
await page.screenshot({ path: 'notes/screens/map.png' });
await page.keyboard.press('Escape'); await page.waitForTimeout(300);
ok(!(await page.locator('#map-dialog').evaluate((d) => d.open)), 'karta se zatvara (Esc)');
console.log('greške:', errs.filter((e) => !/ERR_BLOCKED|Failed to load resource/.test(e)));
await ctx.close(); server.close(); process.exit(process.exitCode || 0);
