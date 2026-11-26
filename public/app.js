// Najava radova – klijent. Sav tekst iz izvora ispisuje se isključivo preko textContent.
const $ = (id) => document.getElementById(id);
const LS = {
  get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* privatni način */ } },
  del(k) { try { localStorage.removeItem(k); } catch { /* */ } },
};
const TYPE = { struja: ['Struja', 'var(--struja)'], voda: ['Voda', 'var(--voda)'], plin: ['Plin', 'var(--plin)'], grijanje: ['Grijanje', 'var(--grijanje)'], ceste: ['Promet', 'var(--muted)'] };
const REGIONS = { zagreb: 'Grad Zagreb / Zagrebačka', zabok: 'Krapinsko-zagorska', varazdin: 'Varaždinska', cakovec: 'Međimurska', koprivnica: 'Koprivničko-križevačka', bjelovar: 'Bjelovarsko-bilogorska', virovitica: 'Virovitičko-podravska', pozega: 'Požeško-slavonska', sbrod: 'Brodsko-posavska', osijek: 'Osječko-baranjska', vinkovci: 'Vukovarsko-srijemska', sisak: 'Sisačko-moslavačka', karlovac: 'Karlovačka', rijeka: 'Primorsko-goranska', gospic: 'Ličko-senjska', pula: 'Istarska', zadar: 'Zadarska', sibenik: 'Šibensko-kninska', split: 'Splitsko-dalmatinska', dubrovnik: 'Dubrovačko-neretvanska' };

let addresses = LS.get('nr.addresses', []);
let picked = null;
let deferredInstall = null;
let sw = null;

const isStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

async function api(path, body) {
  const res = await fetch(path, body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : undefined);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Greška na serveru');
  return data;
}

const uid = () => Math.random().toString(36).slice(2, 10);
const b64 = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(s.length / 4) * 4, '=')), (c) => c.charCodeAt(0));

/* ---------- status obavijesti ---------- */
async function currentSub() {
  if (!sw) return null;
  try { return await sw.pushManager.getSubscription(); } catch { return null; }
}

async function refreshStatus() {
  const pill = $('status'), on = $('push-on'), test = $('push-test'), help = $('push-help');
  const set = (cls, text) => { pill.className = `pill ${cls}`; pill.textContent = text; };
  test.hidden = true; on.disabled = false;
  if (isIOS() && !isStandalone()) {
    set('install', 'Treba instalirati'); on.disabled = true;
    help.textContent = 'Na iPhoneu najprije dodaj aplikaciju na početni zaslon (upute iznad), pa je otvori odande.';
    return;
  }
  if (!pushSupported()) { set('off', 'Nije podržano'); on.disabled = true; help.textContent = 'Ovaj preglednik ne podržava push obavijesti. Probaj Chrome, Edge ili Firefox.'; return; }
  if (Notification.permission === 'denied') {
    set('blocked', 'Blokirano'); on.disabled = true;
    help.textContent = 'Obavijesti su blokirane. Dopusti ih u postavkama stranice (ikona ključa/postavki uz adresu), pa osvježi.';
    return;
  }
  const sub = await currentSub();
  if (sub && Notification.permission === 'granted') {
    set('on', 'Uključeno'); on.textContent = 'Obavijesti su uključene'; on.disabled = true; test.hidden = false;
    help.textContent = 'Obavijest stiže i kad je aplikacija zatvorena.';
  } else {
    set('off', 'Isključeno'); on.textContent = 'Uključi obavijesti'; help.textContent = 'Obavijest stiže i kad je aplikacija zatvorena.';
  }
}

function msg(text, bad = false) {
  const m = $('push-msg'); m.hidden = !text; m.textContent = text || ''; m.style.color = bad ? 'var(--bad)' : 'var(--ok)';
}

async function enablePush() {
  msg('');
  if (!addresses.length) { msg('Najprije dodaj barem jednu adresu.', true); return; }
  try {
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') { await refreshStatus(); msg('Dozvola nije dana.', true); return; }
    const { vapidPublicKey } = await api('/api/config');
    let sub = await currentSub();
    if (!sub) sub = await sw.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64(vapidPublicKey) });
    await syncSubscription(sub);
    msg('Uključeno. Pošalji probnu obavijest da provjeriš.');
  } catch (e) { msg(e.message || 'Nije uspjelo uključiti obavijesti.', true); }
  await refreshStatus();
}

async function syncSubscription(sub) {
  sub ??= await currentSub();
  if (!sub || !addresses.length) return;
  await api('/api/subscribe', { subscription: sub.toJSON(), addresses });
}

async function sendTest() {
  msg('');
  try {
    const sub = await currentSub();
    if (!sub) throw new Error('Obavijesti nisu uključene.');
    await api('/api/test-push', { subscription: sub.toJSON() });
    msg('Probna obavijest poslana – trebala bi stići za nekoliko sekundi.');
  } catch (e) { msg(e.message, true); await refreshStatus(); }
}

/* ---------- adrese ---------- */
function renderAddresses() {
  const ul = $('addr-list'); ul.replaceChildren();
  $('addr-empty').hidden = addresses.length > 0;
  for (const a of addresses) {
    const li = document.createElement('li');
    const box = document.createElement('div');
    const t = document.createElement('div'); t.className = 't'; t.textContent = a.label;
    const s = document.createElement('div'); s.className = 's'; s.textContent = `${a.street}${a.number ? ' ' + a.number : ''}, ${a.city}`;
    box.append(t, s);
    const rm = document.createElement('button'); rm.className = 'link'; rm.type = 'button'; rm.textContent = 'Ukloni';
    rm.setAttribute('aria-label', `Ukloni adresu ${a.label}`);
    rm.addEventListener('click', async () => {
      addresses = addresses.filter((x) => x.id !== a.id); LS.set('nr.addresses', addresses); renderAddresses();
      const sub = await currentSub();
      if (addresses.length) { await syncSubscription(sub).catch(() => {}); } else if (sub) { await api('/api/unsubscribe', { endpoint: sub.endpoint }).catch(() => {}); await sub.unsubscribe().catch(() => {}); }
      await refreshStatus(); loadAnnouncements();
    });
    li.append(box, rm); ul.append(li);
  }
}

function showError(text) { const e = $('form-error'); e.hidden = !text; e.textContent = text || ''; }

let geoTimer, geoSeq = 0;
function onType() {
  picked = null; showError('');
  clearTimeout(geoTimer);
  const q = $('q').value.trim();
  const box = $('sugg'); box.hidden = true; box.replaceChildren(); $('q').setAttribute('aria-expanded', 'false');
  if (q.length < 4) return;
  // Nominatim nema pravi autocomplete: čekamo stanku u tipkanju (poštujemo njihova pravila, max 1 zahtjev/s na serveru).
  geoTimer = setTimeout(async () => {
    const seq = ++geoSeq;
    try {
      const data = await api(`/api/geocode?q=${encodeURIComponent(q)}`);
      if (seq !== geoSeq) return;
      const note = $('geo-note');
      note.hidden = !(data.unavailable || data.busy);
      note.textContent = data.unavailable || data.busy ? 'Provjera adrese trenutno nije dostupna. Možeš je upisati ručno.' : '';
      for (const r of data.results) {
        const li = document.createElement('li'); li.setAttribute('role', 'option'); li.textContent = r.label;
        li.addEventListener('click', () => { picked = r; $('q').value = r.label; box.hidden = true; $('q').setAttribute('aria-expanded', 'false'); });
        box.append(li);
      }
      box.hidden = !data.results.length; $('q').setAttribute('aria-expanded', String(!!data.results.length));
    } catch (e) { $('geo-note').hidden = false; $('geo-note').textContent = e.message; }
  }, 750);
}

function addAddress(ev) {
  ev.preventDefault(); showError('');
  if (addresses.length >= 5) return showError('Najviše 5 adresa.');
  let a;
  if (!$('manual').hidden) {
    const region = $('m-region').value;
    a = { street: $('m-street').value.trim(), number: $('m-number').value.trim(), city: $('m-city').value.trim(), places: [], region: region || null };
    if (!region) return showError('Odaberi županiju.');
  } else if (picked) {
    a = { street: picked.street, number: picked.number, city: picked.city, places: picked.places || [], region: picked.region };
    if (!a.number) { const m = $('q').value.match(/\b(\d{1,4}\s?[a-zA-Z]?)\b/); if (m) a.number = m[1].replace(/\s/g, ''); }
  } else return showError('Odaberi adresu iz prijedloga ili je upiši ručno.');
  if (a.street.length < 2 || a.city.length < 2) return showError('Upiši grad i ulicu.');
  if (!a.region) return showError('Za ovu adresu ne možemo odrediti područje. Upiši je ručno i odaberi županiju.');
  a.id = uid(); a.label = $('label').value.trim() || (addresses.length ? `Adresa ${addresses.length + 1}` : 'Dom');
  addresses.push(a); LS.set('nr.addresses', addresses);
  $('q').value = ''; $('label').value = ''; picked = null; $('sugg').hidden = true;
  renderAddresses(); syncSubscription().catch(() => {}); loadAnnouncements();
}

/* ---------- najave ---------- */
const fmt = new Intl.DateTimeFormat('hr-HR', { timeZone: 'Europe/Zagreb', weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const fmtDay = new Intl.DateTimeFormat('hr-HR', { timeZone: 'Europe/Zagreb', weekday: 'long', day: 'numeric', month: 'long' });
const fmtTime = new Intl.DateTimeFormat('hr-HR', { timeZone: 'Europe/Zagreb', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

function renderAnnouncements(items, offline) {
  const ul = $('ann-list'); ul.replaceChildren();
  const st = $('ann-state');
  if (!addresses.length) { st.textContent = 'Dodaj adresu da vidiš najave.'; return; }
  st.textContent = items.length ? `${offline ? 'Nema interneta – prikazane su zadnje poznate najave. ' : ''}Aktualne i nadolazeće najave za tvoje adrese:` : `${offline ? 'Nema interneta. ' : ''}Za tvoje adrese trenutno nema najava.`;
  for (const r of items) {
    const a = r.ann, [name, color] = TYPE[a.type] ?? ['Radovi', 'var(--muted)'];
    const li = document.createElement('li'); li.style.setProperty('--c', color);
    const type = document.createElement('div'); type.className = 'type'; type.textContent = `${name} · ${a.source}`;
    const when = document.createElement('div'); when.className = 'when';
    const s = new Date(a.start), e = new Date(a.end);
    when.textContent = a.allDay ? `${fmtDay.format(s)}, cijeli dan` : `${fmtDay.format(s)}, ${fmtTime.format(s)} – ${fmtTime.format(e)}`;
    const where = document.createElement('div'); where.className = 'where';
    const adr = addresses[r.addressIndex];
    where.textContent = `${a.streets}${a.place ? ' (' + a.place + ')' : ''}`;
    const mine = document.createElement('div'); mine.className = 'small muted'; mine.textContent = adr ? `Za adresu: ${adr.label}` : '';
    li.append(type, when, where, mine);
    if (r.quality !== 'exact') { const c = document.createElement('span'); c.className = 'check'; c.textContent = 'U tvojoj ulici – provjeri broj'; li.append(c); }
    if (/^https:\/\//.test(a.url)) { const p = document.createElement('div'); const l = document.createElement('a'); l.href = a.url; l.rel = 'noopener noreferrer'; l.target = '_blank'; l.textContent = 'Izvorna objava'; p.append(l); li.append(p); }
    ul.append(li);
  }
}

async function loadAnnouncements() {
  if (!addresses.length) return renderAnnouncements([], false);
  try {
    const { results } = await api('/api/match', { addresses });
    LS.set('nr.last', results); renderAnnouncements(results, false);
  } catch { renderAnnouncements(LS.get('nr.last', []), true); }
}

/* ---------- instalacija ---------- */
function setupInstall() {
  const card = $('install-card');
  if (isStandalone()) return;
  if (isIOS()) { card.hidden = false; $('ios-steps').hidden = false; $('install-text').textContent = 'Na iPhoneu se aplikacija instalira ručno, a obavijesti rade tek nakon toga.'; }
  addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferredInstall = e; card.hidden = false; $('install-btn').hidden = false; });
  $('install-btn').addEventListener('click', async () => { if (!deferredInstall) return; deferredInstall.prompt(); await deferredInstall.userChoice; deferredInstall = null; $('install-btn').hidden = true; });
  addEventListener('appinstalled', () => { card.hidden = true; });
}

async function wipe() {
  if (!confirm('Obrisati sve tvoje adrese i pretplatu na obavijesti s ovog uređaja i s našeg poslužitelja?')) return;
  const sub = await currentSub();
  try { if (sub) await api('/api/unsubscribe', { endpoint: sub.endpoint }); } catch { /* server će ukloniti mrtvu pretplatu */ }
  try { await sub?.unsubscribe(); } catch { /* */ }
  addresses = []; LS.del('nr.addresses'); LS.del('nr.last');
  renderAddresses(); renderAnnouncements([], false); await refreshStatus();
  msg('Svi podaci su obrisani.');
}

async function init() {
  const sel = $('m-region');
  for (const [k, v] of Object.entries(REGIONS)) { const o = document.createElement('option'); o.value = k; o.textContent = v; sel.append(o); }
  $('q').addEventListener('input', onType);
  $('addr-form').addEventListener('submit', addAddress);
  $('manual-toggle').addEventListener('click', () => { const m = $('manual'); m.hidden = !m.hidden; $('manual-toggle').textContent = m.hidden ? 'Upiši ručno' : 'Vrati pretraživanje'; });
  $('push-on').addEventListener('click', enablePush);
  $('push-test').addEventListener('click', sendTest);
  $('wipe').addEventListener('click', wipe);
  renderAddresses(); setupInstall(); loadAnnouncements();
  if ('serviceWorker' in navigator) {
    try { sw = await navigator.serviceWorker.register('/sw.js'); await navigator.serviceWorker.ready; sw = await navigator.serviceWorker.ready; } catch { /* nema SW */ }
  }
  await refreshStatus();
  // ako se pretplata promijenila na pregledniku, uskladi je s poslužiteljem
  const sub = await currentSub(); if (sub && addresses.length) syncSubscription(sub).catch(() => {});
  addEventListener('online', loadAnnouncements);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) loadAnnouncements(); });
}
init();
