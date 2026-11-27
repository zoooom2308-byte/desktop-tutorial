import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const build = (env) => {
  const out = fs.mkdtempSync('/tmp/nr-build-');
  execFileSync('node', ['scripts/build-pages.mjs'], { env: { ...process.env, NR_OUT: out, ...env }, stdio: 'pipe' });
  const read = (f) => fs.readFileSync(`${out}/${f}`, 'utf8');
  return { out, read, has: (f) => fs.existsSync(`${out}/${f}`) };
};
const csp = (html) => html.match(/Content-Security-Policy" content="([^"]*)"/)[1];

test('bez reklama: stroga zaštita (CSP), tekst "bez praćenja", nema oglasnih datoteka', () => {
  const b = build({ NR_ADSENSE_CLIENT: '', NR_ADSENSE_SLOT: '' });
  const html = b.read('index.html');
  assert.ok(!/googlesyndication|unsafe-inline|ad-wrap|ads\.js/.test(html));
  assert.match(csp(html), /script-src 'self';/);
  assert.match(html, /Bez računa, lokacije, imena i praćenja\./);
  assert.ok(!b.has('ads.js') && !b.has('ads.txt'));
  assert.match(b.read('privacy.html'), /Aplikacija nema reklama/);
  assert.ok(!/\{\{|<!--ADS/.test(html + b.read('privacy.html')));
  assert.ok(!JSON.stringify(b.read('config.js')).includes('adsense'));
});

test('s reklamama: AdSense u CSP-u, oglas odvojen od kontrola, ads.txt, politika privatnosti navodi reklame', () => {
  const b = build({ NR_ADSENSE_CLIENT: 'ca-pub-1234567890123456', NR_ADSENSE_SLOT: '1234567890' });
  const html = b.read('index.html');
  assert.match(csp(html), /script-src 'self' https:\/\/pagead2\.googlesyndication\.com/);
  assert.match(csp(html), /frame-src https:\/\/googleads\.g\.doubleclick\.net/);
  assert.match(html, /id="ad-wrap"/); assert.match(html, /src="ads\.js"/); assert.match(html, /Postavke oglasa/);
  assert.match(html, /Reklame poslužuje Google/); assert.ok(!/imena i praćenja/.test(html));
  assert.ok(html.indexOf('id="ad-wrap"') > html.indexOf('id="najave"')); // oglas je ispod najava, daleko od gumba za obavijesti
  assert.equal(b.read('ads.txt'), 'google.com, pub-1234567890123456, DIRECT, f08c47fec0942fa0\n');
  assert.match(b.read('privacy.html'), /Google AdSense/); assert.ok(!/Aplikacija nema reklama/.test(b.read('privacy.html')));
  assert.match(b.read('config.js'), /"client":"ca-pub-1234567890123456"/);
  // glavna aplikacija i dalje ne dobiva podatke o gradovima za reklame
  assert.ok(!/unsafe-eval/.test(csp(html)));
});

test('neispravan AdSense ID prekida izgradnju', () => {
  assert.throws(() => build({ NR_ADSENSE_CLIENT: 'nesto', NR_ADSENSE_SLOT: '12' }));
});

test('admin stranica: noindex, stroga zaštita, bez ugrađene tajne', () => {
  const b = build({});
  const a = b.read('admin.html');
  assert.match(a, /noindex/); assert.match(csp(a), /script-src 'self';/); assert.ok(!/unsafe-inline/.test(csp(a)));
  assert.ok(!/password\s*[:=]\s*['"]/.test(b.read('admin.js')));
  assert.ok(!/admin\.html/.test(b.read('index.html') + b.read('uvjeti.html') + b.read('privacy.html'))); // nije povezana s javnih stranica
});
