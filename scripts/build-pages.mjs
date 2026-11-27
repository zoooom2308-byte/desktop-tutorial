// Gradi statičnu stranicu za GitHub Pages u mapu docs/ (Pages: Deploy from a branch → /docs).
// Neobavezne varijable: NR_API, NR_SUPPORT_URL, NR_ADSENSE_CLIENT (ca-pub-...), NR_ADSENSE_SLOT (znamenke), NR_OUT.
import fs from 'node:fs';
import path from 'node:path';
const API = process.env.NR_API || 'https://dqfukfvhatuiaziviloc.supabase.co/functions/v1/api';
const OUT = process.env.NR_OUT || 'docs';
const CLIENT = process.env.NR_ADSENSE_CLIENT || '', SLOT = process.env.NR_ADSENSE_SLOT || '';
const ADS = /^ca-pub-\d{10,20}$/.test(CLIENT) && /^\d{6,20}$/.test(SLOT);
if ((CLIENT || SLOT) && !ADS) { console.error('NR_ADSENSE_CLIENT mora biti oblika ca-pub-1234567890123456 i NR_ADSENSE_SLOT broj.'); process.exit(1); }

fs.rmSync(OUT, { recursive: true, force: true });
fs.cpSync('public', OUT, { recursive: true });
for (const f of ['region.js', 'text.js', 'match.js', 'maps.js']) fs.copyFileSync(path.join('lib', f), path.join(OUT, f));
fs.writeFileSync(path.join(OUT, 'config.js'), `globalThis.NR_CONFIG = ${JSON.stringify({ api: API, supportUrl: process.env.NR_SUPPORT_URL || '', ...(ADS ? { adsense: { client: CLIENT, slot: SLOT } } : {}) })};\n`);
fs.writeFileSync(path.join(OUT, '.nojekyll'), '');

const adsCsp = {
  script: "https://pagead2.googlesyndication.com https://partner.googleadservices.com https://tpc.googlesyndication.com https://www.googletagservices.com https://fundingchoicesmessages.google.com 'unsafe-inline'",
  frame: 'https://googleads.g.doubleclick.net https://tpc.googlesyndication.com https://www.google.com https://fundingchoicesmessages.google.com',
  connect: 'https://pagead2.googlesyndication.com https://*.g.doubleclick.net https://fundingchoicesmessages.google.com https://ep1.adtrafficquality.google https://csi.gstatic.com',
};
const edit = (file, fn) => { const p = path.join(OUT, file); fs.writeFileSync(p, fn(fs.readFileSync(p, 'utf8'))); };

edit('index.html', (h) => {
  if (!ADS) return h.replace(/\s*<!--ADS-->/, '').replace('<!--ADS-LINK-->', '').replace('{{NO_TRACKING}}', 'Bez računa, lokacije, imena i praćenja.');
  h = h.replace('<!--ADS-->', '<section id="ad-wrap" class="ad-wrap" aria-label="Oglas" hidden><p class="ad-label">Oglas</p><div id="ad-slot"></div></section>\n      <script type="module" src="ads.js"></script>');
  h = h.replace('<!--ADS-LINK-->', '<a id="ads-settings" href="#" hidden>Postavke oglasa</a>');
  h = h.replace('{{NO_TRACKING}}', 'Bez računa, lokacije i imena. Reklame poslužuje Google.');
  return h.replace(/(<meta http-equiv="Content-Security-Policy" content=")([^"]*)"/, (m, a, csp) => a + csp
    .replace("script-src 'self'", `script-src 'self' ${adsCsp.script}`)
    .replace("style-src 'self'", "style-src 'self' 'unsafe-inline'")
    .replace("img-src 'self' data:", "img-src 'self' data: https:")
    .replace('connect-src', `connect-src ${adsCsp.connect}`)
    .replace('; manifest-src', `; frame-src ${adsCsp.frame}; manifest-src`) + '"');
});
edit('privacy.html', (h) => {
  if (!ADS) return h.replace(/\s*<!--ADS-PRIVACY-->/, '').replace('{{ADS_STATEMENT}}', 'Nema kolačića za praćenje, reklamnih identifikatora ni analitike trećih strana. Aplikacija nema reklama.');
  return h.replace('{{ADS_STATEMENT}}', 'Reklame su opisane niže.').replace('<!--ADS-PRIVACY-->', `<h2>Reklame</h2>
    <p>Aplikacija prikazuje reklame koje poslužuje <strong>Google AdSense</strong>. Google i njegovi partneri mogu koristiti kolačiće, reklamne identifikatore i podatke o uređaju (npr. IP adresu, vrstu preglednika) za prikaz i mjerenje oglasa, uz tvoju privolu u prozoru za privolu koji se prikazuje pri prvom otvaranju. Za te podatke Google je samostalni voditelj obrade. Privolu možeš promijeniti u bilo kojem trenutku poveznicom <strong>Postavke oglasa</strong> u podnožju stranice. Više: policies.google.com/technologies/ads.</p>
    <p>Reklame ne dobivaju tvoje gradove, adrese ni pretplatu na obavijesti.</p>`);
});
if (ADS) fs.writeFileSync(path.join(OUT, 'ads.txt'), `google.com, ${CLIENT.replace('ca-', '')}, DIRECT, f08c47fec0942fa0\n`);
else fs.rmSync(path.join(OUT, 'ads.js'), { force: true });
console.log(`${OUT}/ spreman, API = ${API}, reklame: ${ADS ? 'UKLJUČENE' : 'isključene'}`);
