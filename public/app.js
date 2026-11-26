// Najava radova – klijent. Sav tekst iz izvora ispisuje se isključivo preko textContent.
import { regionFromAddress } from './region.js';
const API = (globalThis.NR_CONFIG?.api ?? '/api').replace(/\/$/, '');
const $ = (id) => document.getElementById(id);
const LS = {
  get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* privatni način */ } },
  del(k) { try { localStorage.removeItem(k); } catch { /* */ } },
};
const TYPE = { struja: ['Struja', 'var(--power)'], voda: ['Voda', 'var(--water)'], plin: ['Plin', 'var(--gas)'], grijanje: ['Grijanje', 'var(--heat)'], ceste: ['Promet', 'var(--orange)'] };
const REGIONS = { zagreb: 'Grad Zagreb / Zagrebačka', zabok: 'Krapinsko-zagorska', varazdin: 'Varaždinska', cakovec: 'Međimurska', koprivnica: 'Koprivničko-križevačka', bjelovar: 'Bjelovarsko-bilogorska', virovitica: 'Virovitičko-podravska', pozega: 'Požeško-slavonska', sbrod: 'Brodsko-posavska', osijek: 'Osječko-baranjska', vinkovci: 'Vukovarsko-srijemska', sisak: 'Sisačko-moslavačka', karlovac: 'Karlovačka', rijeka: 'Primorsko-goranska', gospic: 'Ličko-senjska', pula: 'Istarska', zadar: 'Zadarska', sibenik: 'Šibensko-kninska', split: 'Splitsko-dalmatinska', dubrovnik: 'Dubrovačko-neretvanska' };

let addresses = LS.get('nr.addresses', []);
let justAdded = null;
let picked = null;
let deferredInstall = null;
let sw = null;

const isStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

async function api(path, body) {
  const res = await fetch(API + path, body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : undefined);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { const err = new Error(data.error || 'Greška na serveru'); err.data = data; throw err; }
  return data;
}

const uid = () => Math.random().toString(36).slice(2, 10);
const b64 = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(s.length / 4) * 4, '=')), (c) => c.charCodeAt(0));


/* ---------- animacije i obavijest ---------- */
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
let toastTimer;
function toast(text) {
  const t = $('toast'); $('toast-text').textContent = text; t.hidden = false;
  t.classList.remove('show'); void t.offsetWidth; t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, 3200);
}
const BIT_COLORS = ['#ff6a13', '#ffd21a', '#1f7fd6', '#e23b2e', '#c63a8d', '#5b3d2a', '#8fd3f5'];
function burst(x, y) {
  if (reduced) return;
  for (let i = 0; i < 14; i++) {
    const b = document.createElement('i');
    b.className = 'bit ' + ['sq', 'ci', 'tri'][i % 3];
    const a = Math.random() * Math.PI * 2, d = 40 + Math.random() * 70;
    b.style.setProperty('--dx', `${Math.cos(a) * d}px`);
    b.style.setProperty('--dy', `${Math.sin(a) * d + 34}px`);
    b.style.setProperty('--rot', `${(Math.random() - .5) * 720}deg`);
    b.style.setProperty('--s', `${6 + Math.random() * 8}px`);
    b.style.setProperty('--bc', BIT_COLORS[(Math.random() * BIT_COLORS.length) | 0]);
    b.style.left = `${x}px`; b.style.top = `${y}px`;
    document.body.append(b); setTimeout(() => b.remove(), 800);
  }
}
let busyTimer;
function digFaster() {
  const sc = $('scene'); sc.classList.add('busy');
  clearTimeout(busyTimer); busyTimer = setTimeout(() => sc.classList.remove('busy'), 2400);
}
document.addEventListener('click', (e) => {
  const b = e.target.closest('.btn');
  if (!b || b.disabled) return;
  const r = b.getBoundingClientRect();
  const x = e.detail === 0 ? r.left + r.width / 2 : e.clientX, y = e.detail === 0 ? r.top + r.height / 2 : e.clientY;
  burst(x, y); digFaster();
  if (!reduced) {
    const rip = document.createElement('span'); rip.className = 'rip'; rip.style.left = `${x - r.left}px`; rip.style.top = `${y - r.top}px`;
    b.append(rip); setTimeout(() => rip.remove(), 600);
    b.querySelector('.bell')?.classList.add('ring'); setTimeout(() => b.querySelector('.bell')?.classList.remove('ring'), 800);
  }
}, true);

/* ---------- status obavijesti ---------- */
async function currentSub() {
  if (!sw) return null;
  try { return await sw.pushManager.getSubscription(); } catch { return null; }
}

async function refreshStatus() {
  const pill = $('status'), on = $('push-on'), onText = $('push-on-text'), test = $('push-test'), help = $('push-help');
  const set = (cls, text) => { pill.className = `pill ${cls}`; $('status-text').textContent = text; };
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
    set('on', 'Uključeno'); onText.textContent = 'Obavijesti su uključene'; on.disabled = true; test.hidden = false;
    help.textContent = 'Obavijest stiže i kad je aplikacija zatvorena.';
  } else {
    set('off', 'Isključeno'); onText.textContent = 'Uključi obavijesti'; help.textContent = 'Obavijest stiže i kad je aplikacija zatvorena.';
  }
}

function msg(text, bad = false) {
  const m = $('push-msg'); m.hidden = !text; m.textContent = text || ''; m.style.color = bad ? 'var(--bad)' : 'var(--ok)';
}

async function enablePush() {
  msg('');
  if (!addresses.length) { msg('Najprije dodaj barem jedan grad.', true); return; }
  try {
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') { await refreshStatus(); msg('Dozvola nije dana.', true); return; }
    const { vapidPublicKey } = await api('/config');
    let sub = await currentSub();
    if (!sub) sub = await sw.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64(vapidPublicKey) });
    await syncSubscription(sub);
    msg('Uključeno. Pošalji probnu obavijest da provjeriš.'); toast('Obavijesti su uključene');
  } catch (e) { msg(e.message || 'Nije uspjelo uključiti obavijesti.', true); }
  await refreshStatus();
}

async function syncSubscription(sub) {
  sub ??= await currentSub();
  if (!sub || !addresses.length) return;
  await api('/subscribe', { subscription: sub.toJSON(), addresses });
}

async function sendTest() {
  msg('');
  try {
    const sub = await currentSub();
    if (!sub) throw new Error('Obavijesti nisu uključene.');
    await api('/test-push', { subscription: sub.toJSON() });
    msg('Probna obavijest poslana, trebala bi stići za nekoliko sekundi.'); toast('Probna obavijest je poslana');
  } catch (e) {
    if (e.data?.gone) {
      // Push servis kaže da je pretplata istekla: odjavi je lokalno pa korisnik može ponovno uključiti obavijesti
      try { await (await currentSub())?.unsubscribe(); } catch { /* */ }
      msg('Pretplata na obavijesti je istekla. Uključi obavijesti ponovno.', true);
    } else msg(e.message, true);
    await refreshStatus();
  }
}


/* ---------- geokodiranje: preglednik pita OpenStreetMap Nominatim izravno (najviše 1 upit u sekundi, s cacheom) ---------- */
let lastGeo = 0;
async function geocode(q) {
  const key = 'nr.geo.' + q.toLowerCase();
  const hit = LS.get(key, null);
  if (hit && Date.now() - hit.at < 7 * 864e5) return { results: hit.results };
  const wait = lastGeo + 1100 - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastGeo = Date.now();
  const url = new URL('https://nominatim.openstreetmap.org/search');
  url.search = new URLSearchParams({ q, format: 'jsonv2', addressdetails: '1', countrycodes: 'hr', limit: '6', 'accept-language': 'hr' });
  let data;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(String(res.status));
    data = await res.json();
  } catch { return { results: [], unavailable: true }; }
  const seen = new Set();
  const results = data.filter((r) => r.address?.road).map((r) => {
    const a = r.address;
    const city = (a.city || a.town || a.village || a.municipality || a.city_district || '').replace(/^Grad\s+/, '');
    const places = [a.suburb, a.city_district, a.neighbourhood, a.quarter, a.village, a.town, a.hamlet].filter(Boolean);
    return { street: a.road, number: a.house_number || '', city, places: [...new Set(places)], region: regionFromAddress({ ...a, city }), label: [a.road + (a.house_number ? ' ' + a.house_number : ''), city].filter(Boolean).join(', ') };
  }).filter((r) => !seen.has(r.label + r.region) && seen.add(r.label + r.region));
  // Lokacija (lat/lon) se namjerno ne sprema.
  LS.set(key, { at: Date.now(), results });
  return { results };
}

/* ---------- gradovi i dijelovi grada (glavni izbor) ---------- */
const MAX_ENTRIES = 12;
const openIds = new Set();   // gradovi s otvorenim izborom dijelova
const pickIds = new Set();   // gradovi gdje korisnik bira dijelove (nije "cijeli grad")
const partsCache = new Map();
let persistTimer;
function persist() {
  LS.set('nr.addresses', addresses);
  clearTimeout(persistTimer);
  persistTimer = setTimeout(async () => { await syncSubscription().catch(() => {}); loadAnnouncements(); }, 800);
}
async function removeEntry(a) {
  addresses = addresses.filter((x) => x.id !== a.id); LS.set('nr.addresses', addresses); renderAddresses();
  const sub = await currentSub();
  if (addresses.length) { await syncSubscription(sub).catch(() => {}); } else if (sub) { await api('/unsubscribe', { endpoint: sub.endpoint }).catch(() => {}); await sub.unsubscribe().catch(() => {}); }
  await refreshStatus(); loadAnnouncements();
}

const cleanPart = (n) => String(n).replace(/^(Gradska četvrt|Mjesni odbor|Četvrt|Kvart|Naselje|MO)\s+/i, '').replace(/\s+/g, ' ').trim();
async function overpassParts(osm) {
  if (osm?.type !== 'relation') return [];
  const q = `[out:json][timeout:20];area(id:${3600000000 + Number(osm.id)})->.a;(nwr[place~"^(suburb|quarter|neighbourhood|village|hamlet)$"][name](area.a);rel[boundary=administrative][admin_level~"^(9|10)$"][name](area.a););out tags 600;`;
  const res = await fetch('https://overpass-api.de/api/interpreter', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'data=' + encodeURIComponent(q), signal: AbortSignal.timeout(25000) });
  if (!res.ok) throw new Error(String(res.status));
  const names = (await res.json()).elements.map((e) => cleanPart(e.tags?.['name:hr'] || e.tags?.name || '')).filter((n) => n.length > 1 && n.length <= 50);
  return [...new Set(names)];
}
async function loadParts(a) {
  const key = `${a.region}|${a.city}`;
  if (partsCache.has(key)) return partsCache.get(key);
  const cached = LS.get('nr.parts.' + key, null);
  if (cached && Date.now() - cached.at < 7 * 864e5) { partsCache.set(key, cached.v); return cached.v; }
  const [osmParts, places] = await Promise.all([
    overpassParts(a.osm).catch(() => []),
    api(`/places?region=${encodeURIComponent(a.region)}`).then((d) => d.places.map(cleanPart)).catch(() => []),
  ]);
  const lc = new Set(osmParts.map((n) => n.toLowerCase()));
  const v = { main: osmParts.sort((x, y) => x.localeCompare(y, 'hr')), extra: [...new Set(places)].filter((n) => !lc.has(n.toLowerCase()) && n.toLowerCase() !== a.city.toLowerCase()) };
  partsCache.set(key, v); LS.set('nr.parts.' + key, { at: Date.now(), v });
  return v;
}

function buildPartsPanel(a) {
  const box = document.createElement('div'); box.className = 'parts'; box.hidden = !openIds.has(a.id);
  const whole = document.createElement('label'); whole.className = 'chk';
  const wi = document.createElement('input'); wi.type = 'checkbox'; wi.checked = !pickIds.has(a.id) && a.parts.length === 0;
  const wt = document.createElement('span'); wt.textContent = 'Cijeli grad'; whole.append(wi, wt);
  const pick = document.createElement('div'); pick.hidden = wi.checked;
  const filter = document.createElement('input'); filter.type = 'text'; filter.placeholder = 'Traži dio grada'; filter.maxLength = 40; filter.setAttribute('aria-label', 'Traži dio grada');
  const status = document.createElement('p'); status.className = 'muted small'; status.textContent = 'Učitavam dijelove grada…';
  const chips = document.createElement('div'); chips.className = 'chips';
  const manualRow = document.createElement('div'); manualRow.className = 'row';
  const mi = document.createElement('input'); mi.type = 'text'; mi.maxLength = 60; mi.placeholder = 'Upiši dio grada ručno'; mi.setAttribute('aria-label', 'Upiši dio grada ručno');
  const mb = document.createElement('button'); mb.type = 'button'; mb.className = 'btn sky'; mb.textContent = 'Dodaj dio';
  manualRow.append(mi, mb);
  pick.append(filter, status, chips, manualRow);
  const loose = document.createElement('label'); loose.className = 'chk';
  const li = document.createElement('input'); li.type = 'checkbox'; li.checked = !a.strict;
  const lt = document.createElement('span'); lt.textContent = 'Javi i kad izvor ne navodi dio grada'; loose.append(li, lt);
  const hint = document.createElement('p'); hint.className = 'muted small'; hint.textContent = 'Neki izvori navode samo grad, ne i dio grada. Tada je bolje dobiti obavijest viška nego propustiti radove.';
  box.append(whole, pick, loose, hint);

  let list = { main: [], extra: [] };
  const drawChips = () => {
    chips.replaceChildren();
    const q = filter.value.trim().toLowerCase();
    const all = [...new Set([...a.parts, ...list.main, ...list.extra])];
    for (const name of all) {
      if (q && !name.toLowerCase().includes(q) && !a.parts.includes(name)) continue;
      const c = document.createElement('label'); c.className = 'chip';
      const ci = document.createElement('input'); ci.type = 'checkbox'; ci.checked = a.parts.includes(name);
      ci.addEventListener('change', () => { a.parts = ci.checked ? [...a.parts, name].slice(0, 40) : a.parts.filter((x) => x !== name); persist(); renderSummary(); drawChips(); });
      const sp = document.createElement('span'); sp.textContent = name; c.append(ci, sp); chips.append(c);
    }
    if (!chips.children.length) status.textContent = q ? 'Nema takvog dijela. Možeš ga dodati ručno.' : 'Nema popisa dijelova za ovo mjesto. Upiši dio ručno ili ostavi cijeli grad.';
    else status.textContent = `Označi dijelove koji te zanimaju (${a.parts.length} odabrano).`;
  };
  const renderSummary = () => { const s = box.parentElement?.querySelector('.s'); if (s) s.textContent = summaryOf(a); };
  loadParts(a).then((v) => { list = v; drawChips(); }).catch(() => { status.textContent = 'Popis dijelova trenutno nije dostupan. Upiši dio ručno.'; });
  filter.addEventListener('input', drawChips);
  wi.addEventListener('change', () => {
    if (wi.checked) { pickIds.delete(a.id); a.parts = []; } else pickIds.add(a.id);
    pick.hidden = wi.checked; persist(); renderSummary(); drawChips();
  });
  li.addEventListener('change', () => { a.strict = !li.checked; persist(); });
  const addManual = () => { const n = cleanPart(mi.value); if (n.length < 2) return; if (!a.parts.includes(n)) a.parts = [...a.parts, n].slice(0, 40); mi.value = ''; persist(); renderSummary(); drawChips(); };
  mb.addEventListener('click', addManual);
  mi.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addManual(); } });
  return box;
}
const summaryOf = (a) => (a.parts.length ? a.parts.join(', ') : 'Cijeli grad');

async function searchCities(q) {
  const key = 'nr.city.' + q.toLowerCase();
  const hit = LS.get(key, null);
  if (hit && Date.now() - hit.at < 7 * 864e5) return { results: hit.results };
  const wait = lastGeo + 1100 - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastGeo = Date.now();
  const url = new URL('https://nominatim.openstreetmap.org/search');
  url.search = new URLSearchParams({ q, format: 'jsonv2', addressdetails: '1', countrycodes: 'hr', featuretype: 'settlement', limit: '8', 'accept-language': 'hr' });
  let data;
  try { const res = await fetch(url); if (!res.ok) throw new Error(String(res.status)); data = await res.json(); } catch { return { results: [], unavailable: true }; }
  const seen = new Set();
  const results = data.map((r) => {
    const a = r.address ?? {};
    const city = r.name || a.city || a.town || a.village || a.municipality || '';
    const region = regionFromAddress({ ...a, city });
    return { city, region, county: (a.county || a.state || '').replace(/\s*županija$/i, ' županija'), osm: { type: r.osm_type, id: r.osm_id } };
  }).filter((r) => r.city && r.region && !seen.has(r.city + r.region) && seen.add(r.city + r.region));
  LS.set(key, { at: Date.now(), results });
  return { results };
}

let cityTimer, citySeq = 0;
function onCityType() {
  clearTimeout(cityTimer);
  const q = $('city-q').value.trim(), box = $('city-sugg'), note = $('city-note');
  box.hidden = true; box.replaceChildren(); $('city-q').setAttribute('aria-expanded', 'false'); note.hidden = true;
  if (q.length < 2) return;
  cityTimer = setTimeout(async () => {
    const seq = ++citySeq;
    const data = await searchCities(q);
    if (seq !== citySeq) return;
    if (data.unavailable) { note.hidden = false; note.textContent = 'Pretraživanje mjesta trenutno nije dostupno. Pokušaj za minutu.'; return; }
    if (!data.results.length) { note.hidden = false; note.textContent = 'Nismo našli to mjesto u Hrvatskoj. Provjeri pisanje.'; return; }
    for (const r of data.results) {
      const li = document.createElement('li'); li.setAttribute('role', 'option'); li.textContent = r.county ? `${r.city}, ${r.county}` : r.city;
      li.addEventListener('click', () => addCity(r));
      box.append(li);
    }
    box.hidden = false; $('city-q').setAttribute('aria-expanded', 'true');
  }, 600);
}
function addCity(r) {
  $('city-sugg').hidden = true; $('city-q').value = '';
  if (addresses.length >= MAX_ENTRIES) return toast('Najviše 12 gradova i adresa');
  const dup = addresses.find((x) => x.kind === 'area' && x.region === r.region && x.city.toLowerCase() === r.city.toLowerCase());
  if (dup) { openIds.add(dup.id); renderAddresses(); return toast(`${r.city} je već dodan`); }
  const a = { id: uid(), kind: 'area', label: r.city, city: r.city, region: r.region, parts: [], strict: false, osm: r.osm };
  addresses.push(a); justAdded = a.id; openIds.add(a.id); LS.set('nr.addresses', addresses);
  renderAddresses(); toast(`${r.city} je dodan`); syncSubscription().catch(() => {}); loadAnnouncements();
}

function renderAddresses() {
  const ul = $('addr-list'); ul.replaceChildren();
  $('addr-empty').hidden = addresses.length > 0;
  for (const a of addresses) {
    const li = document.createElement('li'); li.className = (a.kind === 'area' ? 'city-li ' : '') + (a.id === justAdded ? 'drop' : '');
    const top = document.createElement('div'); top.className = 'top';
    const box = document.createElement('div');
    const t = document.createElement('div'); t.className = 't'; t.textContent = a.kind === 'area' ? a.city : a.label;
    const s = document.createElement('div'); s.className = 's';
    s.textContent = a.kind === 'area' ? summaryOf(a) : `${a.street}${a.number ? ' ' + a.number : ''}, ${a.city}`;
    box.append(t, s);
    const acts = document.createElement('div'); acts.className = 'acts';
    let panel = null;
    if (a.kind === 'area') {
      const ed = document.createElement('button'); ed.className = 'link'; ed.type = 'button'; ed.textContent = 'Dijelovi grada';
      ed.setAttribute('aria-label', `Odaberi dijelove grada ${a.city}`);
      ed.addEventListener('click', () => { if (openIds.has(a.id)) openIds.delete(a.id); else openIds.add(a.id); panel.hidden = !openIds.has(a.id); });
      acts.append(ed);
    }
    const rm = document.createElement('button'); rm.className = 'link'; rm.type = 'button'; rm.textContent = 'Ukloni';
    rm.setAttribute('aria-label', `Ukloni ${a.kind === 'area' ? a.city : 'adresu ' + a.label}`);
    rm.addEventListener('click', () => removeEntry(a));
    acts.append(rm); top.append(box, acts); li.append(top);
    if (a.kind === 'area') { panel = buildPartsPanel(a); li.append(panel); }
    ul.append(li);
  }
}

/* ---------- točna adresa (neobavezno) ---------- */
function showError(text) { const e = $('form-error'); e.hidden = !text; e.textContent = text || ''; }

let geoTimer, geoSeq = 0;
// Kućni broj koji je korisnik upisao (Nominatim ga često ne vrati): npr. "Portić 12, Rijeka" -> "12"
const typedNumber = (v) => (String(v).split(',')[0].match(/(?:^|\s)(\d{1,4}\s?[a-zA-Z]?)(?=\s|$)/)?.[1] ?? '').replace(/\s/g, '');
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
      const data = await geocode(q);
      if (seq !== geoSeq) return;
      const note = $('geo-note');
      note.hidden = !(data.unavailable || data.busy);
      note.textContent = data.unavailable || data.busy ? 'Provjera adrese trenutno nije dostupna. Možeš je upisati ručno.' : '';
      for (const r of data.results) {
        const li = document.createElement('li'); li.setAttribute('role', 'option'); li.textContent = r.label;
        li.addEventListener('click', () => { picked = { ...r, number: r.number || typedNumber($('q').value) }; $('q').value = picked.number && !/\d/.test(r.label) ? r.label.replace(/^([^,]+)/, `$1 ${picked.number}`) : r.label; box.hidden = true; $('q').setAttribute('aria-expanded', 'false'); });
        box.append(li);
      }
      box.hidden = !data.results.length; $('q').setAttribute('aria-expanded', String(!!data.results.length));
    } catch (e) { $('geo-note').hidden = false; $('geo-note').textContent = e.message; }
  }, 750);
}

function addAddress(ev) {
  ev.preventDefault(); showError('');
  if (addresses.length >= MAX_ENTRIES) return showError('Najviše 12 gradova i adresa.');
  let a;
  if (!$('manual').hidden) {
    const region = $('m-region').value;
    a = { street: $('m-street').value.trim(), number: $('m-number').value.trim(), city: $('m-city').value.trim(), places: [], region: region || null };
    if (!region) return showError('Odaberi županiju.');
  } else if (picked) {
    a = { street: picked.street, number: picked.number, city: picked.city, places: picked.places || [], region: picked.region };
    if (!a.number) a.number = typedNumber($('q').value);
  } else return showError('Odaberi adresu iz prijedloga ili je upiši ručno.');
  if (a.street.length < 2 || a.city.length < 2) return showError('Upiši grad i ulicu.');
  if (!a.region) return showError('Za ovu adresu ne možemo odrediti područje. Upiši je ručno i odaberi županiju.');
  a.id = uid(); a.label = $('label').value.trim() || (addresses.length ? `Adresa ${addresses.length + 1}` : 'Dom');
  addresses.push(a); justAdded = a.id; LS.set('nr.addresses', addresses);
  $('q').value = ''; $('label').value = ''; picked = null; $('sugg').hidden = true;
  renderAddresses(); toast('Adresa spremljena'); syncSubscription().catch(() => {}); loadAnnouncements();
}

/* ---------- najave ---------- */
const fmt = new Intl.DateTimeFormat('hr-HR', { timeZone: 'Europe/Zagreb', weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const fmtDay = new Intl.DateTimeFormat('hr-HR', { timeZone: 'Europe/Zagreb', weekday: 'long', day: 'numeric', month: 'long' });
const fmtTime = new Intl.DateTimeFormat('hr-HR', { timeZone: 'Europe/Zagreb', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

function renderAnnouncements(items, offline) {
  const ul = $('ann-list'); ul.replaceChildren();
  const st = $('ann-state');
  if (!addresses.length) { st.textContent = 'Dodaj grad da vidiš najave.'; return; }
  st.textContent = items.length ? `${offline ? 'Nema interneta – prikazane su zadnje poznate najave. ' : ''}Aktualne i nadolazeće najave za tvoje adrese:` : `${offline ? 'Nema interneta. ' : ''}Za tvoje adrese trenutno nema najava.`;
  for (const r of items) {
    const a = r.ann, [name, color] = TYPE[a.type] ?? ['Radovi', 'var(--muted)'];
    const li = document.createElement('li'); li.style.setProperty('--c', color);
    const head = document.createElement('div'); head.className = 'head';
    const type = document.createElement('span'); type.className = 'type'; type.textContent = name;
    const from = document.createElement('span'); from.className = 'from'; from.textContent = a.source; head.append(type, from);
    if (a.type === 'struja' || a.type === 'voda') type.style.color = '#fff';
    const when = document.createElement('div'); when.className = 'when';
    const s = new Date(a.start), e = new Date(a.end);
    when.textContent = a.allDay ? `${fmtDay.format(s)}, cijeli dan` : `${fmtDay.format(s)}, ${fmtTime.format(s)} – ${fmtTime.format(e)}`;
    const where = document.createElement('div'); where.className = 'where';
    const adr = addresses[r.addressIndex];
    where.textContent = `${a.streets.replace(/^\s*-\s*/gm, '').replace(/\n+/g, '; ').replace(/^naselja:\s*/i, 'Područje: ')}${a.place ? ' (' + a.place.replace(/\.$/, '') + ')' : ''}`;
    const mine = document.createElement('div'); mine.className = 'small muted'; mine.textContent = adr ? `Za adresu: ${adr.label}` : '';
    li.append(head, when, where, mine);
    if (r.quality !== 'exact') { const c = document.createElement('span'); c.className = 'check'; c.textContent = { area: 'U tvom naselju, provjeri ulicu', city: 'U tvom gradu, provjeri ulicu' }[r.quality] ?? 'U tvojoj ulici, provjeri broj'; li.append(c); }
    if (/^https:\/\//.test(a.url)) { const p = document.createElement('div'); const l = document.createElement('a'); l.href = a.url; l.rel = 'noopener noreferrer'; l.target = '_blank'; l.textContent = 'Izvorna objava'; p.append(l); li.append(p); }
    ul.append(li);
  }
}

async function loadAnnouncements() {
  if (!addresses.length) return renderAnnouncements([], false);
  $('ann-state').textContent = 'Tražim najave za tvoje adrese…';
  try {
    const { results } = await api('/match', { addresses });
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
  try { if (sub) await api('/unsubscribe', { endpoint: sub.endpoint }); } catch { /* server će ukloniti mrtvu pretplatu */ }
  try { await sub?.unsubscribe(); } catch { /* */ }
  addresses = []; LS.del('nr.addresses'); LS.del('nr.last');
  renderAddresses(); renderAnnouncements([], false); await refreshStatus();
  msg('Svi podaci su obrisani.'); toast('Podaci su obrisani');
}

async function init() {
  const sel = $('m-region');
  for (const [k, v] of Object.entries(REGIONS)) { const o = document.createElement('option'); o.value = k; o.textContent = v; sel.append(o); }
  $('q').addEventListener('input', onType);
  $('city-q').addEventListener('input', onCityType);
  $('city-form').addEventListener('submit', (e) => e.preventDefault());
  $('addr-form').addEventListener('submit', addAddress);
  $('manual-toggle').addEventListener('click', () => { const m = $('manual'); m.hidden = !m.hidden; $('manual-toggle').textContent = m.hidden ? 'Upiši ručno' : 'Vrati pretraživanje'; });
  $('push-on').addEventListener('click', enablePush);
  $('push-test').addEventListener('click', sendTest);
  $('wipe').addEventListener('click', wipe);
  renderAddresses(); setupInstall(); loadAnnouncements();
  if ('serviceWorker' in navigator) {
    try { sw = await navigator.serviceWorker.register('sw.js'); await navigator.serviceWorker.ready; sw = await navigator.serviceWorker.ready; } catch { /* nema SW */ }
  }
  await refreshStatus();
  // ako se pretplata promijenila na pregledniku, uskladi je s poslužiteljem
  const sub = await currentSub(); if (sub && addresses.length) syncSubscription(sub).catch(() => {});
  addEventListener('online', loadAnnouncements);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) loadAnnouncements(); });
}
init();
