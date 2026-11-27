// Karta radova (Leaflet + OpenStreetMap). Sav tekst ide kroz textContent; Leaflet se učitava tek pri prvom otvaranju karte.
// Koordinate određuje preglednik (Nominatim: najviše 1 upit u sekundi, rezultati se pamte 30 dana), jer javni geokoderi blokiraju poslužiteljske adrese.
import { targetsFor } from './maps.js';
const COLORS = { struja: '#e23b2e', voda: '#1f7fd6', plin: '#f2b705', grijanje: '#c63a8d', ceste: '#ff6a13' };
const NAMES = { struja: 'Struja', voda: 'Voda', plin: 'Plin', grijanje: 'Grijanje', ceste: 'Promet' };
const dayFmt = new Intl.DateTimeFormat('hr-HR', { timeZone: 'Europe/Zagreb', weekday: 'long', day: 'numeric', month: 'long' });
const timeFmt = new Intl.DateTimeFormat('hr-HR', { timeZone: 'Europe/Zagreb', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const gmaps = (lat, lon) => `https://www.google.com/maps/search/?api=1&query=${lat},${lon}`;
let loading, map;

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
/** Točke za najavu: ulice (s brojem, a ako ne uspije bez broja), ili područje. onPoint se zove čim je točka poznata. */
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

/** items: najave s poljem geo [{label, lat, lon, area}]. focusId: najava koja se ističe. */
export async function openMap({ items, focusId = null, title = 'Radovi na karti' }) {
  const dlg = document.getElementById('map-dialog'), host = document.getElementById('map');
  document.getElementById('map-title').textContent = title;
  const note = document.getElementById('map-note'), legend = document.getElementById('map-legend'), only = document.getElementById('map-only'), onlyRow = document.getElementById('map-only-row');
  note.textContent = 'Učitavam kartu…'; legend.replaceChildren();
  if (!dlg.open) dlg.showModal();
  let L;
  try { L = await loadLeaflet(); } catch (e) { note.textContent = e.message; return; }
  map?.remove(); host.replaceChildren();
  map = L.map(host, { zoomControl: true, attributionControl: true });
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a>' }).addTo(map);
  const group = L.featureGroup().addTo(map);
  const types = new Set();
  const token = (openMap.token = (openMap.token ?? 0) + 1);
  const alive = () => openMap.token === token && dlg.open;
  // Pomak koji je napravio korisnik (ne mi) zaustavlja automatsko približavanje
  let userMoved = false, programmatic = false;
  const prog = (fn) => { programmatic = true; try { fn(); } finally { programmatic = false; } };
  map.on('dragstart zoomstart', () => { if (!programmatic) userMoved = true; });
  const markers = new Map(); // najava -> lista markera
  let focusLayer = null, shown = 0, total = items.length, onlyFocus = false;
  const addPoint = (it, pt) => {
    if (onlyFocus && focusId && it.id !== focusId) return;
    types.add(it.type);
    const focus = it.id === focusId;
    const m = L.circleMarker([pt.lat, pt.lon], { radius: focus ? 13 : 9, color: '#1b1b19', weight: focus ? 4 : 2.5, fillColor: COLORS[it.type] ?? '#555', fillOpacity: pt.area ? 0.45 : 0.95, dashArray: pt.area ? '4 3' : null });
    m.bindPopup(() => popupFor(it, pt), { maxWidth: 260 }); m.addTo(group);
    if (!markers.has(it.id)) markers.set(it.id, []);
    markers.get(it.id).push(m);
    if (focus && !focusLayer) focusLayer = m;
    legend.replaceChildren();
    for (const t of types) { const li = el('li'); const dot = el('i', 'dot'); dot.style.setProperty('--c', COLORS[t] ?? '#555'); li.append(dot, el('span', null, NAMES[t] ?? t)); legend.append(li); }
  };
  const fit = () => {
    const b = group.getBounds(); if (!b.isValid()) return;
    prog(() => { if (group.getLayers().length === 1) map.setView(b.getCenter(), 16, { animate: false }); else map.fitBounds(b, { padding: [36, 36], maxZoom: 16, animate: false }); });
  };
  const status = (extra = '') => { note.textContent = `${markers.size} od ${total} najava na karti.${extra}`; };
  prog(() => map.setView([44.5, 16.3], 7, { animate: false }));
  onlyRow.hidden = !focusId; only.checked = false;
  only.onchange = () => { onlyFocus = only.checked; for (const [id, list] of markers) for (const m of list) { if (onlyFocus && focusId && id !== focusId) group.removeLayer(m); else group.addLayer(m); } fit(); };

  // redoslijed: odabrana najava prvo (da je odmah vidiš), zatim ostale
  const order = [...items].sort((a, b) => (b.id === focusId) - (a.id === focusId));
  let missing = 0;
  for (const it of order) {
    if (!alive()) return;
    let pts = it.geo ?? [];
    if (pts.length) { for (const pt of pts) addPoint(it, pt); }
    else { status(' Određujem lokacije…'); pts = await resolveItem(it, (pt) => { if (alive()) addPoint(it, pt); }, alive); }
    if (!pts.length) missing += 1;
    if (!alive()) return;
    if (it.id === focusId && focusLayer && !userMoved) { prog(() => map.setView(focusLayer.getLatLng(), 15, { animate: false })); focusLayer.openPopup(); }
    else if (!focusId && !userMoved) fit();
  }
  if (!alive()) return;
  if (!userMoved && !focusId) fit(); else if (!userMoved && focusId) fit();
  if (focusLayer && !focusLayer.isPopupOpen()) focusLayer.openPopup();
  status(missing ? ` Za ${missing} lokacija nije pronađena.` : (items.length ? '' : ' Nema najava za prikaz.'));
  if (!items.length) note.textContent = 'Nema najava za prikaz.';
  setTimeout(() => map?.invalidateSize(), 150);
}

export function closeMap() { const d = document.getElementById('map-dialog'); if (d?.open) d.close(); }
document.getElementById('map-close')?.addEventListener('click', closeMap);
document.getElementById('map-dialog')?.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.preventDefault(); closeMap(); } });
document.getElementById('map-dialog')?.addEventListener('close', () => { openMap.token = (openMap.token ?? 0) + 1; map?.remove(); map = null; });
