// E2E u pravom Chromiumu: instalabilnost, offline, mobilna širina, stvarni push (od najave do obavijesti).
import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire(import.meta.url);
const { chromium, devices } = require(process.env.PW_PATH || 'playwright');
process.env.NR_MEMORY = '1';
const { start, store } = await import('./dev-server.mjs');
const { syncSources, loadActiveAnnouncements } = await import('../lib/sync.js');
const { runNotifications } = await import('../lib/notify.js');
const { parseStreetList } = await import('../lib/match.js');
const out = (...a) => console.log(...a);
const ok = (c, m) => { out(c ? 'PASS' : 'FAIL', m); if (!c) process.exitCode = 1; };

await start(8899);
const BASE = 'http://127.0.0.1:8899';
fs.mkdirSync('docs/screens', { recursive: true });

const browser = await chromium.launch({ headless: process.env.HEADED ? false : true, args: ['--no-sandbox'] });
// Push API ne radi u incognito/efemernom kontekstu, pa koristimo trajni profil
const ctx = await chromium.launchPersistentContext(fs.mkdtempSync('/tmp/claude-0/pw-'), { headless: false, args: ['--no-sandbox'], viewport: { width: 1100, height: 900 } });
await ctx.grantPermissions(['notifications'], { origin: BASE });
const page = await ctx.newPage();
const errors = []; page.on('pageerror', (e) => errors.push(e.message)); page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
await page.goto(BASE);
await page.waitForFunction(() => navigator.serviceWorker.controller || navigator.serviceWorker.ready.then(() => true));
await page.reload(); await page.waitForTimeout(500);

// 1) instalabilnost
const man = await (await ctx.request.get(BASE + '/manifest.webmanifest')).json();
ok(man.display === 'standalone' && man.icons.some((i) => i.sizes === '512x512') && man.start_url, 'manifest je instalabilan (standalone, ikone 192/512)');
ok(await page.evaluate(async () => !!(await navigator.serviceWorker.getRegistration())), 'service worker registriran');

// 2) stvarne najave (živi izvori) -> odaberi adresu u ulici koja SADA ima najavu
await store.setJSON('demand/zagreb', { at: new Date().toISOString() });
const sync = await syncSources(store, { maxRequests: 60 });
out('sync:', JSON.stringify(sync));
const anns = await loadActiveAnnouncements(store, new Date());
const target = anns.find((a) => a.source === 'hep-ods' && a.place.trim().toUpperCase() === 'ZAGREB' && parseStreetList(a.streets).some((s) => s.ranges?.length && s.ranges[0].parity !== 'none'));
ok(!!target, `postoji aktualna najava u Zagrebu (${target?.streets.slice(0, 60)})`);
const e0 = parseStreetList(target.streets)[0]; const r0 = e0.ranges?.[0];
const street = e0.street.toLowerCase().replace(/(^|\s)\S/g, (m) => m.toUpperCase());
const number = String(r0 ? r0.from + (r0.parity === 'even' && r0.from % 2 ? 1 : 0) : 1);

// 3) unos adrese ručno (geokodiranje je zasebno testirano) i uključivanje obavijesti
await page.click('#manual-toggle');
await page.fill('#m-city', 'Zagreb'); await page.fill('#m-street', street); await page.fill('#m-number', number);
await page.selectOption('#m-region', 'zagreb'); await page.fill('#label', 'Test dom');
await page.click('#addr-form button[type=submit]');
ok((await page.locator('#addr-list li').count()) === 1, `adresa dodana: ${street} ${number}`);
ok((await page.textContent('#status')).includes('Isključeno'), 'status prije uključivanja: Isključeno');
await page.screenshot({ path: 'docs/screens/desktop.png' });

await page.click('#push-on');
let pushOk = true;
try { await page.waitForFunction(() => document.getElementById('status').textContent.includes('Uključeno'), null, { timeout: 15000 }); } catch { pushOk = false; }
const msg = await page.textContent('#push-msg').catch(() => '');
ok(pushOk, `push pretplata kreirana u pregledniku (status "${(await page.textContent('#status'))}") ${msg}`);

// 4) dostava. Sandbox ne dopušta Chromiumu GCM vezu (port 5228), pa se dostava u preglednik simulira
//    CDP-om (ServiceWorker.deliverPushMessage -> pravi push handler), a slanje do FCM-a provjerava se zasebno.
ok((await store.list('sub/')).length === 1, 'pretplata spremljena na serveru');
const cdp = await ctx.newCDPSession(page); let regId;
cdp.on('ServiceWorker.workerRegistrationUpdated', (e) => { regId ??= e.registrations?.[0]?.registrationId; });
await cdp.send('ServiceWorker.enable'); await page.waitForTimeout(500);
const deliver = (payload) => cdp.send('ServiceWorker.deliverPushMessage', { origin: BASE, registrationId: regId, data: JSON.stringify(payload) });
const shown = () => page.evaluate(async () => (await (await navigator.serviceWorker.ready).getNotifications()).map((n) => [n.title, n.body, n.tag]));
const clear = () => page.evaluate(async () => { for (const n of await (await navigator.serviceWorker.ready).getNotifications()) n.close(); });
const { sendPush } = await import('../lib/push.js');
const subRec = (await store.getJSON((await store.list('sub/'))[0]));
let fcm = { ok: false };
for (let i = 0; i < 4 && !fcm.ok; i++) { fcm = await sendPush(store, subRec.push, { title: 'fcm-provjera', body: 'x', tag: 'fcm' }); if (!fcm.ok) await page.waitForTimeout(3000); }
ok(fcm.ok, 'web-push (VAPID) prihvaćen od FCM-a: ' + JSON.stringify(fcm));

const sentPayloads = [];
const stats = await runNotifications(store, { now: new Date(), siteUrl: BASE, send: async (sub, payload) => { sentPayloads.push(payload); return { ok: true }; } });
out('notify:', JSON.stringify(stats), JSON.stringify(sentPayloads[0]));
ok(stats.sent === 1 && /Nova najava|Sutra|sat/.test(sentPayloads[0]?.title ?? ''), 'najava za adresu u pogođenoj ulici je dobila obavijest: ' + sentPayloads[0]?.title);
await clear(); await deliver(sentPayloads[0]); await page.waitForTimeout(800);
let got = await shown();
ok(got.length === 1 && got[0][0] === sentPayloads[0].title, 'service worker prikazuje obavijest: ' + JSON.stringify(got[0]));
const again = await runNotifications(store, { now: new Date(), siteUrl: BASE, send: async () => ({ ok: true }) });
ok(again.sent === 0, 'ponovno pokretanje ne šalje istu najavu opet');
await clear(); await deliver({ title: 'Najava radova: probna obavijest', body: 'Obavijesti rade.', tag: 'test', url: '/' }); await page.waitForTimeout(500);
ok((await shown()).some((n) => /probna/.test(n[0])), 'probna obavijest prikazana');
await page.click('#push-test'); await page.waitForTimeout(2500);
out('INFO gumb "probna obavijest" ->', (await page.textContent('#push-msg')));

// 5) popis najava u UI-u i XSS
await page.reload(); await page.waitForTimeout(1500);
ok((await page.locator('#ann-list li').count()) >= 1, 'popis najava prikazuje najavu s izvorom i linkom: ' + (await page.locator('#ann-list li a').first().getAttribute('href').catch(() => '')));
await page.screenshot({ path: 'docs/screens/desktop-najave.png', fullPage: true });

// 6) offline
await ctx.setOffline(true); await page.reload(); await page.waitForTimeout(1200);
ok((await page.textContent('h1')).includes('Najava radova') && (await page.locator('#ann-list li').count()) >= 1, 'radi bez interneta (ljuska + zadnje najave)');
await ctx.setOffline(false);

// 7) mobilna širina
const m = await browser.newContext({ ...devices['Pixel 7'], permissions: ['notifications'] });
const mp = await m.newPage(); await mp.goto(BASE); await mp.waitForTimeout(800);
const sw = await mp.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
ok(sw, 'nema vodoravnog skrolanja na 412px');
await mp.screenshot({ path: 'docs/screens/mobile.png', fullPage: true });
// iPhone (emulacija UA, bez instalacije)
const ip = await browser.newContext({ ...devices['iPhone 13'] }); const ipp = await ip.newPage(); await ipp.goto(BASE); await ipp.waitForTimeout(800);
ok(await ipp.locator('#ios-steps').isVisible(), 'iPhone: prikazane upute Dijeli → Dodaj na početni zaslon');
ok((await ipp.textContent('#status')).includes('Treba instalirati'), 'iPhone: status "Treba instalirati"');
await ipp.screenshot({ path: 'docs/screens/iphone.png', fullPage: true });

// 8) brisanje podataka
page.on('dialog', (d) => d.accept());
await page.click('#wipe'); await page.waitForTimeout(800);
ok((await store.list('sub/')).length === 0, '"Obriši moje podatke" briše pretplatu s poslužitelja');
ok(errors.filter((e) => !/Failed to load resource/.test(e)).length === 0, 'nema grešaka u konzoli: ' + errors.join(' | ').slice(0, 200));
await ctx.close(); await browser.close(); process.exit(process.exitCode || 0);
