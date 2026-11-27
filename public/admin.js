// Admin nadzorna ploča. Sav tekst ide kroz textContent; token sesije se čuva samo u sessionStorage ovog taba.
const $ = (id) => document.getElementById(id);
const API = (globalThis.NR_CONFIG?.api ?? '/api').replace(/\/$/, '');
const REGIONS = { zagreb: 'Zagreb i okolica', zabok: 'Krapinsko-zagorska', varazdin: 'Varaždinska', cakovec: 'Međimurska', koprivnica: 'Koprivničko-križevačka', bjelovar: 'Bjelovarsko-bilogorska', virovitica: 'Virovitičko-podravska', pozega: 'Požeško-slavonska', sbrod: 'Brodsko-posavska', osijek: 'Osječko-baranjska', vinkovci: 'Vukovarsko-srijemska', sisak: 'Sisačko-moslavačka', karlovac: 'Karlovačka', rijeka: 'Primorsko-goranska', gospic: 'Ličko-senjska', pula: 'Istarska', zadar: 'Zadarska', sibenik: 'Šibensko-kninska', split: 'Splitsko-dalmatinska', dubrovnik: 'Dubrovačko-neretvanska' };
const store = { get() { try { return sessionStorage.getItem('nr.admin'); } catch { return null; } }, set(v) { try { sessionStorage.setItem('nr.admin', v); } catch { /* */ } }, del() { try { sessionStorage.removeItem('nr.admin'); } catch { /* */ } } };
let timer;

async function call(path, { method = 'GET', body, token } = {}) {
  const res = await fetch(API + path, { method, headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...(token ? { authorization: 'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { const e = new Error(data.error || 'Greška na serveru'); e.status = res.status; throw e; }
  return data;
}
const err = (t) => { const e = $('login-error'); e.hidden = !t; e.textContent = t || ''; };
const fmt = new Intl.NumberFormat('hr-HR');
const fdt = new Intl.DateTimeFormat('hr-HR', { timeZone: 'Europe/Zagreb', dateStyle: 'short', timeStyle: 'medium' });
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

function showLogin(configured) {
  $('dash').hidden = true; $('logout').hidden = true; $('login').hidden = false;
  $('code-row').hidden = $('pw2-row').hidden = $('setup-help').hidden = configured;
  $('login-title').textContent = configured ? 'Prijava' : 'Prvo postavljanje';
  $('login-btn').textContent = configured ? 'Prijavi se' : 'Postavi lozinku';
  $('pw').autocomplete = configured ? 'current-password' : 'new-password';
  clearInterval(timer);
}

function bars(ul, rows, label, valueKey = 'devices') {
  ul.replaceChildren();
  if (!rows.length) { ul.append(el('li', 'muted', 'Još nema podataka.')); return; }
  const max = Math.max(...rows.map((r) => r[valueKey]), 1);
  for (const r of rows) {
    const li = el('li', 'bar'); const l = el('span', 'bl', label(r)); const track = el('span', 'bt'); const fill = el('span', 'bf'); fill.style.setProperty('--w', `${Math.max(4, (r[valueKey] / max) * 100)}%`); track.append(fill);
    li.append(l, track, el('span', 'bv', fmt.format(r[valueKey]))); ul.append(li);
  }
}

function render(s) {
  $('updated').textContent = 'Osvježeno: ' + fdt.format(new Date(s.generated));
  const d = s.devices, t = s.totals;
  const cards = [
    ['Uređaji s obavijestima', d.total], ['Prosj. gradova/adresa po uređaju', d.avgEntries], ['Jutarnji sažetak uključen', d.digestOn],
    ['Posjetitelji (7 dana, zbroj dana)', t.visitors7], ['Obavijesti poslane (7 dana)', t.sent7], ['Novi uređaji (7 dana)', t.newSubs7],
    ['Odjave (7 dana)', t.gone7], ['Isteklih pretplata (7 dana)', t.removed7], ['Neuspjelih slanja (7 dana)', t.failed7], ['Aktivne najave', s.announcements.active],
  ];
  const ul = $('cards'); ul.replaceChildren();
  for (const [name, v] of cards) { const li = el('li', 'card'); li.append(el('strong', 'n', fmt.format(v)), el('span', 'k', name)); ul.append(li); }
  const tb = document.querySelector('#daily tbody'); tb.replaceChildren();
  for (const x of [...s.daily].reverse()) { const tr = el('tr'); for (const v of [x.date, x.visitors, x.opens, x.sent, x.failed, x.subsNew, x.subsGone]) tr.append(el('td', null, typeof v === 'number' ? fmt.format(v) : v)); tb.append(tr); }
  bars($('cities'), s.cities, (r) => `${r.city} (${REGIONS[r.region] ?? r.region})`);
  bars($('parts'), s.parts, (r) => `${r.part} (${r.city})`);
  bars($('regions'), s.regions, (r) => REGIONS[r.region] ?? r.region);
  bars($('sources'), Object.entries(s.announcements.bySource).map(([k, v]) => ({ name: k, devices: v })), (r) => r.name);
  const h = $('health'); h.replaceChildren();
  const row = (cls, text) => h.append(el('li', cls, text));
  const tick = s.health.tick, sync = s.health.sync, warn = [];
  if (!tick) { row('bad', 'Pozadinski posao još nije javio da je radio.'); warn.push('Pozadinski posao još nije radio.'); }
  else {
    const age = (Date.now() - new Date(tick.at)) / 60000;
    row(age > 25 ? 'bad' : 'ok', `Zadnji pozadinski krug: ${fdt.format(new Date(tick.at))} (prije ${Math.round(age)} min), trajanje ${fmt.format(tick.ms ?? 0)} ms.`);
    if (age > 25) warn.push(`Pozadinski posao nije radio ${Math.round(age)} minuta: obavijesti možda kasne.`);
  }
  if (sync) {
    row(sync.errors?.length ? 'bad' : 'ok', sync.errors?.length ? `Izvori su javili greške (${sync.errors.length}): ${sync.errors.slice(0, 3).join(' | ')}` : 'Svi izvori su se zadnji put uspješno pročitali.');
    if (sync.errors?.length) warn.push('Neki izvor podataka ne radi.');
  }
  const w = $('warn'); w.hidden = !warn.length; w.textContent = warn.join(' ');
}

async function load() {
  const token = store.get();
  if (!token) return showLogin((await call('/admin/status')).configured);
  try {
    const s = await call('/admin/stats', { token });
    $('login').hidden = true; $('dash').hidden = false; $('logout').hidden = false; render(s);
    clearInterval(timer); timer = setInterval(() => load().catch(() => {}), 60000);
  } catch (e) { if (e.status === 401) { store.del(); return showLogin(true); } $('updated').textContent = e.message; }
}

$('login-form').addEventListener('submit', async (ev) => {
  ev.preventDefault(); err('');
  const configured = $('code-row').hidden, pw = $('pw').value;
  try {
    if (!configured) {
      if (pw !== $('pw2').value) return err('Lozinke se ne podudaraju.');
      await call('/admin/setup', { method: 'POST', body: { code: $('code').value, password: pw } });
    }
    const r = await call('/admin/login', { method: 'POST', body: { password: pw } });
    store.set(r.token); $('pw').value = $('pw2').value = $('code').value = '';
    await load();
  } catch (e) { err(e.message); }
});
$('logout').addEventListener('click', async () => { const token = store.get(); store.del(); try { await call('/admin/logout', { method: 'POST', token }); } catch { /* */ } showLogin(true); });
load().catch((e) => { $('login').hidden = false; err(e.message); });
