// Karta radova (Leaflet + OpenStreetMap). Sav tekst ide kroz textContent; Leaflet se učitava tek pri prvom otvaranju karte.
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
  let focusLayer = null;
  const draw = (onlyFocus) => {
    group.clearLayers(); focusLayer = null; types.clear();
    for (const it of items) {
      if (onlyFocus && focusId && it.id !== focusId) continue;
      for (const pt of it.geo ?? []) {
        types.add(it.type);
        const focus = it.id === focusId;
        const m = L.circleMarker([pt.lat, pt.lon], { radius: focus ? 13 : 9, color: '#1b1b19', weight: focus ? 4 : 2.5, fillColor: COLORS[it.type] ?? '#555', fillOpacity: pt.area ? 0.45 : 0.95, dashArray: pt.area ? '4 3' : null });
        m.bindPopup(() => popupFor(it, pt), { maxWidth: 260 }); m.addTo(group);
        if (focus && !focusLayer) focusLayer = m;
      }
    }
    legend.replaceChildren();
    for (const t of types) { const li = el('li'); const dot = el('i', 'dot'); dot.style.setProperty('--c', COLORS[t] ?? '#555'); li.append(dot, el('span', null, NAMES[t] ?? t)); legend.append(li); }
    const b = group.getBounds();
    if (b.isValid()) { if (group.getLayers().length === 1) map.setView(b.getCenter(), 16); else map.fitBounds(b, { padding: [36, 36], maxZoom: 16 }); }
    else map.setView([44.5, 16.3], 7);
    if (focusLayer) focusLayer.openPopup();
  };
  const mapped = items.filter((i) => i.geo?.length), missing = items.filter((i) => !i.geo?.length);
  onlyRow.hidden = !focusId; only.checked = false;
  only.onchange = () => draw(only.checked);
  draw(false);
  note.textContent = mapped.length ? `${mapped.length} ${mapped.length === 1 ? 'najava' : 'najave/najava'} na karti.${missing.length ? ` Još ${missing.length} nema lokaciju (traži se, osvježi za nekoliko minuta).` : ''}` : (items.length ? 'Lokacije se još određuju. Pokušaj za nekoliko minuta.' : 'Nema najava za prikaz.');
  setTimeout(() => map?.invalidateSize(), 150);
}

export function closeMap() { const d = document.getElementById('map-dialog'); if (d?.open) d.close(); }
document.getElementById('map-close')?.addEventListener('click', closeMap);
document.getElementById('map-dialog')?.addEventListener('close', () => { map?.remove(); map = null; });
