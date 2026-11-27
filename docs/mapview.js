// Karta radova ispod odabranog grada (Leaflet + OpenStreetMap). Sav tekst ide kroz textContent; Leaflet se učitava tek kad karta zatreba.
// Koordinate određuje preglednik (Nominatim: najviše 1 upit u sekundi, rezultati se pamte 30 dana), jer javni geokoderi blokiraju poslužiteljske adrese.
import { targetsFor } from './maps.js';

const COLORS = { struja: '#e23b2e', voda: '#1f7fd6', plin: '#f2b705', grijanje: '#c63a8d', ceste: '#ff6a13' };
const NAMES = { struja: 'Struja', voda: 'Voda', plin: 'Plin', grijanje: 'Grijanje', ceste: 'Promet (ceste)' };
const dayFmt = new Intl.DateTimeFormat('hr-HR', { timeZone: 'Europe/Zagreb', weekday: 'long', day: 'numeric', month: 'long' });
const timeFmt = new Intl.DateTimeFormat('hr-HR', { timeZone: 'Europe/Zagreb', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const gmaps = (lat, lon) => `https://www.google.com/maps/search/?api=1&query=${lat},${lon}`;
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

/* ---------- koordinate ---------- */
const BBOX = { minLat: 42.3, maxLat: 46.7, minLon: 13.3, maxLon: 19.6 };
let lastReq = 0;
const lsGet = (k) => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* */ } };
async function nominatim(q) {
  const key = 'nr.g.' + q.toLowerCase();
  const c = lsGet(key);
  if (c && Date.now() - c.at < 30 * 864e5) return c.none ? null : c;
  const wait = lastReq + 1100 - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastReq = Date.now();
  const url = new URL('https://nominatim.openstreetmap.org/search');
  url.search = new URLSearchParams({ q: `${q}, Hrvatska`, format: 'jsonv2', limit: '1', countrycodes: 'hr', 'accept-language': 'hr' });
  try {
    const res = await fetch(url); if (!res.ok) return undefined;
    const r = (await res.json())[0];
    const lat = r && +r.lat, lon = r && +r.lon;
    if (!r || !(lat >= BBOX.minLat && lat <= BBOX.maxLat && lon >= BBOX.minLon && lon <= BBOX.maxLon)) { lsSet(key, { at: Date.now(), none: true }); return null; }
    const rec = { at: Date.now(), lat: +lat.toFixed(5), lon: +lon.toFixed(5) }; lsSet(key, rec); return rec;
  } catch { return undefined; }
}
async function resolveItem(it, onPoint, alive) {
  const points = [];
  for (const t of targetsFor(it)) {
    if (!alive()) return points;
    let r = await nominatim(t.query);
    if (r === null && t.fallback && alive()) r = await nominatim(t.fallback);
    if (r) { const pt = { label: t.label, lat: r.lat, lon: r.lon, area: !!t.area }; points.push(pt); onPoint(pt); }
  }
  if (!points.length && alive()) { const place = String(it.place ?? '').split(/[,;]/)[0].replace(/[.]+$/, '').trim(); if (place) { const r = await nominatim(place); if (r) { const pt = { label: place, lat: r.lat, lon: r.lon, area: true }; points.push(pt); onPoint(pt); } } }
  return points;
}

/* ---------- Leaflet ---------- */
let loading;
function loadLeaflet() {
  if (globalThis.L) return Promise.resolve(globalThis.L);
  loading ??= new Promise((resolve, reject) => {
    const css = document.createElement('link'); css.rel = 'stylesheet'; css.href = 'vendor/leaflet/leaflet.css'; document.head.append(css);
    const s = document.createElement('script'); s.src = 'vendor/leaflet/leaflet.js';
    s.onload = () => resolve(globalThis.L); s.onerror = () => { loading = null; reject(new Error('Karta se nije uspjela učitati.')); };
    document.head.append(s);
  });
  return loading;
}
function popupFor(item, pt) {
  const box = el('div', 'mp');
  box.append(el('strong', null, `${NAMES[item.type] ?? 'Radovi'}: ${pt.label}`));
  const s = new Date(item.start), e = new Date(item.end);
  box.append(el('div', null, item.allDay ? `${dayFmt.format(s)}, cijeli dan` : `${dayFmt.format(s)}, ${timeFmt.format(s)}–${timeFmt.format(e)}`));
  if (pt.area) box.append(el('div', 'small', 'Približno: najava navodi područje, ne točnu ulicu.'));
  box.append(el('div', 'small', item.source));
  const links = el('div', 'mlinks');
  const g = el('a', null, 'Otvori u Google kartama'); g.href = gmaps(pt.lat, pt.lon); g.target = '_blank'; g.rel = 'noopener noreferrer'; links.append(g);
  if (/^https:\/\//.test(item.url ?? '')) { const o = el('a', null, 'Izvorna objava'); o.href = item.url; o.target = '_blank'; o.rel = 'noopener noreferrer'; links.append(o); }
  box.append(links);
  return box;
}

const S = { map: null, group: null, L: null, items: [], key: '', markers: new Map(), types: new Set(), token: 0, userMoved: false, programmatic: false, focusId: null, queue: [], running: false };
const $ = (id) => document.getElementById(id);
const prog = (fn) => { S.programmatic = true; try { fn(); } finally { S.programmatic = false; } };

function fitAll() {
  if (!S.group) return; const b = S.group.getBounds(); if (!b.isValid()) return;
  prog(() => { if (S.group.getLayers().length === 1) S.map.setView(b.getCenter(), 16, { animate: false }); else S.map.fitBounds(b, { padding: [36, 36], maxZoom: 16, animate: false }); });
}
function legend() {
  const ul = $('map-legend'); ul.replaceChildren();
  for (const t of S.types) { const li = el('li'); const dot = el('i', 'dot'); dot.style.setProperty('--c', COLORS[t] ?? '#555'); li.append(dot, el('span', null, NAMES[t] ?? t)); ul.append(li); }
}
function status(extra = '') { $('map-note').textContent = S.items.length ? `${S.markers.size} od ${S.items.length} najava prikazano na karti.${extra}` : 'Za odabrani grad trenutno nema najavljenih radova.'; }
function styleMarker(m, focus, type, area) { m.setStyle({ radius: focus ? 14 : 9, weight: focus ? 4 : 2.5, fillColor: COLORS[type] ?? '#555', fillOpacity: area ? 0.45 : 0.95 }); }

function addPoint(it, pt) {
  const m = S.L.circleMarker([pt.lat, pt.lon], { color: '#1b1b19', dashArray: pt.area ? '4 3' : null });
  styleMarker(m, it.id === S.focusId, it.type, pt.area);
  m.bindPopup(() => popupFor(it, pt), { maxWidth: 260 }); m.addTo(S.group);
  if (!S.markers.has(it.id)) S.markers.set(it.id, []);
  S.markers.get(it.id).push({ m, pt, type: it.type });
  S.types.add(it.type); legend();
}

async function run(token) {
  if (S.running) return; S.running = true;
  const alive = () => S.token === token;
  try {
    while (S.queue.length && alive()) {
      const it = S.queue.shift();
      let pts = it.geo ?? [];
      if (pts.length) pts.forEach((pt) => addPoint(it, pt));
      else { status(' Određujem lokacije…'); pts = await resolveItem(it, (pt) => { if (alive()) addPoint(it, pt); }, alive); }
      if (!alive()) return;
      if (it.id === S.focusId) focusNow(); else if (!S.userMoved && !S.focusId) fitAll();
    }
    if (alive()) { status(S.items.length - S.markers.size ? ` Za ${S.items.length - S.markers.size} lokacija nije pronađena.` : ''); if (!S.userMoved && !S.focusId) fitAll(); }
  } finally { S.running = false; }
}

function focusNow() {
  const list = S.markers.get(S.focusId); if (!list?.length) return;
  for (const [id, ms] of S.markers) for (const x of ms) styleMarker(x.m, id === S.focusId, x.type, x.pt.area);
  const m = list[0].m; list.forEach((x) => x.m.bringToFront());
  prog(() => S.map.setView(m.getLatLng(), 15, { animate: false })); m.openPopup();
}

/** Postavi najave koje se prikazuju na karti (zove se pri svakom osvježavanju popisa). */
export async function setMapItems(items) {
  const key = items.map((i) => i.id).join(',');
  await initMap();
  if (!S.map) return;
  $('map-all').hidden = false;
  S.items = items; S.key = key; S.token += 1; S.running = false;
  S.group.clearLayers(); S.markers.clear(); S.types.clear(); legend(); S.userMoved = false;
  S.queue = [...items];
  if (S.focusId) S.queue.sort((a, b) => (b.id === S.focusId) - (a.id === S.focusId));
  status(items.length ? ' Određujem lokacije…' : '');
  run(S.token);
  setTimeout(() => S.map?.invalidateSize(), 200);
}

/** Istakni najavu na karti (pomakni se na nju i otvori skočni prozor). */
export function focusMapItem(id, { scroll = true } = {}) {
  S.focusId = id; S.userMoved = false;
  if (scroll) $('karta')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  const idx = S.queue.findIndex((i) => i.id === id);
  if (idx > 0) S.queue.unshift(...S.queue.splice(idx, 1)); // još se određuje: prebaci na početak reda
  if (S.markers.has(id)) focusNow();
  setTimeout(() => S.map?.invalidateSize(), 250);
}

/** Karta se prikazuje tek kad korisnik klikne tab: učitaj Leaflet i napravi praznu kartu. */
export async function initMap() {
  if (S.map) { setTimeout(() => S.map.invalidateSize(), 50); return; }
  try { S.L = await loadLeaflet(); } catch (e) { $('map-note').textContent = e.message; return; }
  S.map = S.L.map($('map'), { zoomControl: true });
  S.L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a>' }).addTo(S.map);
  S.group = S.L.featureGroup().addTo(S.map);
  S.map.on('dragstart zoomstart', () => { if (!S.programmatic) S.userMoved = true; });
  prog(() => S.map.setView([44.5, 16.3], 7, { animate: false }));
  $('map-all').addEventListener('click', () => { S.focusId = null; S.userMoved = false; for (const [, ms] of S.markers) for (const x of ms) styleMarker(x.m, false, x.type, x.pt.area); S.map.closePopup(); fitAll(); });
  setTimeout(() => S.map.invalidateSize(), 100);
}
export function mapResize() { setTimeout(() => S.map?.invalidateSize(), 80); }
