// E2E izbora grada i dijelova grada (Nominatim + Overpass + Supabase pozadina)
import { createRequire } from 'node:module';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PW_PATH || 'playwright');
const ok = (c, m) => { console.log(c ? 'PASS' : 'FAIL', m); if (!c) process.exitCode = 1; };
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2' };
const root = path.resolve('docs'); const PREFIX = '/desktop-tutorial/';
const server = http.createServer((req, res) => { const u = new URL(req.url, 'http://x'); if (!u.pathname.startsWith(PREFIX)) { res.writeHead(404); return res.end(); } let p = path.join(root, u.pathname.slice(PREFIX.length) || 'index.html'); if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) p = path.join(root, 'index.html'); res.writeHead(200, { 'content-type': TYPES[path.extname(p)] ?? 'application/octet-stream' }); fs.createReadStream(p).pipe(res); }).listen(8893, '127.0.0.1');
const ctx = await chromium.launchPersistentContext(fs.mkdtempSync('/tmp/claude-0/pw-'), { headless: false, args: ['--no-sandbox'], viewport: { width: 1000, height: 1000 } });
await ctx.grantPermissions(['notifications'], { origin: 'http://127.0.0.1:8893' });
const page = await ctx.newPage(); const errs = []; page.on('pageerror', (e) => errs.push(e.message));
await page.goto('http://127.0.0.1:8893' + PREFIX); await page.waitForTimeout(1200);
ok(await page.locator('#city-q').isVisible(), 'glavni unos je izbor grada');
ok(!(await page.locator('#exact').evaluate((d) => d.open)), 'točna adresa je neobavezna (sklopljena)');
// 1) Rijeka
await page.type('#city-q', 'Rijeka', { delay: 50 });
await page.waitForSelector('#city-sugg li', { timeout: 25000 }).catch(() => {});
const s1 = await page.locator('#city-sugg li').allTextContents(); console.log('prijedlozi gradova:', JSON.stringify(s1));
ok(s1.some((t) => /^Rijeka/.test(t)), 'pretraga grada nudi Rijeku');
await page.locator('#city-sugg li', { hasText: /^Rijeka/ }).first().click();
await page.waitForSelector('.city-li .parts:not([hidden]) .chips .chip', { timeout: 40000 }).catch(() => {});
const chips = await page.locator('.city-li .chip span').allTextContents(); console.log('dijelovi Rijeke:', chips.length, JSON.stringify(chips.slice(0, 14)));
ok(chips.length >= 3, 'dijelovi grada Rijeke se učitavaju (OpenStreetMap + izvori)');
// odaberi dio
await page.locator('.city-li').first().locator('.parts input[type=checkbox]').first().uncheck().catch(() => {});
await page.waitForTimeout(300);
const first = page.locator('.city-li').first().locator('.chip').first();
const firstName = (await first.textContent()).trim(); await first.click();
await page.waitForTimeout(500);
console.log('sažetak:', await page.locator('.city-li').first().locator('.s').textContent());
ok((await page.locator('.city-li').first().locator('.s').textContent()).includes(firstName), 'odabrani dio se vidi u sažetku: ' + firstName);
// 2) Zagreb (više gradova)
await page.fill('#city-q', ''); await page.type('#city-q', 'Zagreb', { delay: 50 });
await page.waitForSelector('#city-sugg li', { timeout: 25000 }).catch(() => {});
await page.locator('#city-sugg li', { hasText: /^Zagreb/ }).first().click();
await page.waitForTimeout(800);
ok((await page.locator('.city-li').count()) === 2, 'moguće je dodati više gradova (Rijeka + Zagreb)');
await page.waitForSelector('.city-li:nth-child(2) .chips .chip', { timeout: 40000 }).catch(() => {});
console.log('dijelova Zagreba:', await page.locator('.city-li:nth-child(2) .chip').count());
// zagreb: cijeli grad
await page.locator('.city-li:nth-child(2) .parts input[type=checkbox]').first().check().catch(() => {});
// najave
await page.waitForFunction(() => { const t = document.getElementById('ann-state').textContent; return t.length > 3 && !/Tražim|Dodaj grad/.test(t); }, null, { timeout: 60000 }).catch(() => {});
const n = await page.locator('#ann-list li').count(); console.log('najave:', n, await page.textContent('#ann-state'));
ok(n >= 1, 'popis najava za odabrane gradove');
console.log((await page.locator('#ann-list li .check').allTextContents()).slice(0, 4));
await page.screenshot({ path: 'notes/screens/cities.png', fullPage: true });
// push se može uključiti samo uz odabran grad
await page.click('#push-on'); await page.waitForFunction(() => document.getElementById('status').textContent.includes('Uključeno'), null, { timeout: 20000 }).catch(() => {});
ok((await page.textContent('#status')).includes('Uključeno'), 'obavijesti se uključuju s gradovima');
// točna adresa i dalje radi
await page.click('#exact summary'); await page.type('#q', 'Školjić 14, Rijeka', { delay: 40 }); await page.waitForSelector('#sugg li', { timeout: 25000 }).catch(() => {});
await page.locator('#sugg li').first().click(); await page.click('#addr-form button[type=submit]'); await page.waitForTimeout(800);
ok((await page.locator('#addr-list > li').count()) === 3, 'točna adresa i dalje radi uz gradove');
// mobilno
const mp = await ctx.newPage(); await mp.setViewportSize({ width: 412, height: 915 }); await mp.goto('http://127.0.0.1:8893' + PREFIX); await mp.waitForTimeout(1500);
ok(await mp.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'nema vodoravnog skrolanja na mobitelu (s gradovima)');
await mp.screenshot({ path: 'notes/screens/cities-mobile.png', fullPage: true });
console.log('greške:', errs);
// čišćenje pretplate u bazi radi se zasebno
await ctx.close(); server.close(); process.exit(process.exitCode || 0);
