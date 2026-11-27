// Materijali za Google Play: ikona 512, naslovna grafika 1024x500, snimke zaslona telefona
import { createRequire } from 'node:module';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PW_PATH || 'playwright');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2' };
const root = path.resolve('docs'); const PREFIX = '/desktop-tutorial/';
const server = http.createServer((req, res) => { const u = new URL(req.url, 'http://x'); if (!u.pathname.startsWith(PREFIX)) { res.writeHead(404); return res.end(); } let p = path.join(root, u.pathname.slice(PREFIX.length) || 'index.html'); if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) p = path.join(root, 'index.html'); res.writeHead(200, { 'content-type': TYPES[path.extname(p)] ?? 'application/octet-stream' }); fs.createReadStream(p).pipe(res); }).listen(8890, '127.0.0.1');
const BASE = 'http://127.0.0.1:8890' + PREFIX;
fs.copyFileSync('public/icons/icon-512.png', 'store/icon-512.png');

const ctx = await chromium.launchPersistentContext(fs.mkdtempSync('/tmp/claude-0/pw-'), { headless: false, args: ['--no-sandbox'], viewport: { width: 412, height: 915 }, deviceScaleFactor: 2.625, isMobile: true, hasTouch: true });
const page = await ctx.newPage();

// naslovna grafika 1024x500 iz iste scene
const html = fs.readFileSync('docs/index.html', 'utf8');
const scene = html.match(/<div class="scene"[\s\S]*?<\/svg>/)[0].replace('<div class="scene" id="scene" aria-hidden="true">', '');
const css = fs.readFileSync('docs/style.css', 'utf8').replace(/url\(fonts\//g, `url(${BASE}fonts/`).replace(/url\(bg-pebbles/g, `url(${BASE}bg-pebbles`);
await page.setViewportSize({ width: 1024, height: 500 });
await page.setContent(`<style>${css}
body{margin:0;overflow:hidden}.fg{position:relative;width:1024px;height:500px;background:linear-gradient(#6ec3e8,#bfe6f4);overflow:hidden}
.fg h2{position:absolute;left:48px;top:44px;margin:0;font:800 64px/.95 var(--display);max-width:620px;color:#1b1b19}
.fg .sc{position:absolute;left:0;right:0;bottom:0;height:250px}.fg svg{width:100%;height:100%}
.fg .badge{position:absolute;right:40px;top:40px;width:110px;height:110px}</style>
<div class="fg"><h2>Znaj dan prije kad ti kopaju ispred kuće</h2><svg class="badge" viewBox="0 0 40 40"><path d="M20 2 38 20 20 38 2 20Z" fill="#ff6a13" stroke="#1b1b19" stroke-width="2.4" stroke-linejoin="round"/><rect x="18" y="10" width="4" height="13" rx="2" fill="#1b1b19"/><circle cx="20" cy="28" r="2.6" fill="#1b1b19"/></svg><div class="sc">${scene}</div></div>`, { waitUntil: 'networkidle' });
await page.screenshot({ path: 'store/feature-graphic-1024x500.png' });

// snimke zaslona telefona
await page.setViewportSize({ width: 412, height: 820 });
await ctx.grantPermissions(['notifications'], { origin: 'http://127.0.0.1:8890' });
await page.goto(BASE); await page.waitForTimeout(1500);
await page.screenshot({ path: 'store/screenshots/1-naslovna.png' });
await page.type('#city-q', 'Rijeka', { delay: 40 }); await page.waitForSelector('#city-sugg li', { timeout: 25000 });
await page.locator('#city-sugg li', { hasText: /^Rijeka/ }).first().click();
await page.waitForSelector('.city-li .chips .chip', { timeout: 40000 }).catch(() => {});
await page.locator('.city-li').first().locator('.parts input[type=checkbox]').first().uncheck().catch(() => {});
for (const n of ['Trsat', 'Sušak']) await page.locator('.chip', { hasText: new RegExp(`^${n}$`) }).first().click().catch(() => {});
await page.evaluate(() => document.getElementById('h-addr').scrollIntoView({ block: 'start' })); await page.waitForTimeout(600);
await page.screenshot({ path: 'store/screenshots/2-gradovi-i-dijelovi.png' });
await page.waitForFunction(() => document.querySelectorAll('#ann-list li').length > 0, null, { timeout: 60000 }).catch(() => {});
await page.evaluate(() => document.getElementById('h-ann').scrollIntoView({ block: 'start' })); await page.waitForTimeout(800);
await page.screenshot({ path: 'store/screenshots/3-najave-i-karta.png' });
await page.evaluate(() => document.getElementById('h-push').scrollIntoView({ block: 'start' })); await page.waitForTimeout(600);
await page.screenshot({ path: 'store/screenshots/4-obavijesti.png' });
await ctx.close(); server.close(); process.exit(0);
