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
const order = await page.evaluate(() => [...document.querySelectorAll('main > section')].filter((s) => !s.hidden).map((s) => [s.getBoundingClientRect().top, s.querySelector('h3')?.textContent]).sort((a, b) => a[0] - b[0]).map((x) => x[1]).filter((t) => t !== 'Instaliraj aplikaciju'));
console.log('redoslijed odjeljaka:', JSON.stringify(order));
ok(order[0] === 'Gdje želiš obavijesti' && order[1] === 'Što se kopa kod tebe', 'grad je prvi, odmah ispod su najave');
await page.type('#city-q', 'Rijeka', { delay: 40 }); await page.keyboard.press('Enter'); // Enter bira prvi prijedlog
await page.waitForSelector('.city-li', { timeout: 30000 });
ok((await page.locator('.city-li .parts').first().isHidden()), 'dijelovi grada su zatvoreni dok ih ne zatražiš');
await page.waitForFunction(() => document.querySelectorAll('#ann-list > li').length > 0, null, { timeout: 60000 });
const n = await page.locator('#ann-list > li').count(); console.log('najave:', n);
// karta je odmah vidljiva (bez klika) i sadrži sve radove
await page.waitForSelector('#karta:not([hidden]) #map .leaflet-tile-loaded', { timeout: 40000 });
ok(await page.locator('#karta').isVisible(), 'karta se prikazuje odmah ispod grada, bez skočnog prozora');
await page.waitForFunction(() => document.querySelectorAll('#map path.leaflet-interactive').length >= 2, null, { timeout: 60000 }).catch(() => {});
const markers = await page.locator('#map path.leaflet-interactive').count();
console.log('markeri na karti:', markers, '| bilješka:', await page.textContent('#map-note'), '| legenda:', JSON.stringify(await page.locator('#map-legend li').allTextContents()));
ok(markers >= 2, 'na karti su prikazani radovi iz više najava odjednom');
ok(await page.locator('#map .leaflet-tile-loaded').count() > 0, 'pločice OpenStreetMapa se učitavaju');
// klik na najavu pomiče kartu na to mjesto i otvara skočni prozor
const target = page.locator('#ann-list > li').nth(Math.min(1, n - 1));
const targetText = (await target.locator('.maps a').first().innerText()).trim();
await target.click({ position: { x: 30, y: 30 } });
await page.waitForSelector('.leaflet-popup-content', { timeout: 30000 });
const popup = await page.locator('.leaflet-popup-content').first().innerText();
console.log('klik na najavu "' + targetText + '" -> skočni prozor:', JSON.stringify(popup.slice(0, 110)));
ok(popup.length > 0, 'klik na najavu otvara njezino mjesto na karti');
const z = await page.evaluate(() => document.querySelector('#map .leaflet-zoom-animated')?.style.transform?.length ?? 0);
await page.waitForTimeout(1200);
const inView = await page.evaluate(() => { const r = document.getElementById('map').getBoundingClientRect(); return r.top < innerHeight && r.bottom > 0; });
ok(inView, 'karta je skrolana u vidljivo područje nakon klika');
await page.screenshot({ path: 'notes/screens/map.png', fullPage: false });
await page.click('#map-all'); await page.waitForTimeout(500);
ok((await page.locator('.leaflet-popup').count()) === 0, '"Prikaži sve radove" vraća pregled svih radova');
console.log('greške:', errs.filter((e) => !/ERR_BLOCKED|Failed to load resource/.test(e)));
await ctx.close(); server.close(); process.exit(process.exitCode || 0);
