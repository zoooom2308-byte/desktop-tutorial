import test from 'node:test';
import assert from 'node:assert/strict';
import { dueKinds } from '../lib/schedule.js';
import { zagrebToDate } from '../lib/time.js';
import { runNotifications } from '../lib/notify.js';
import { memoryStore } from '../lib/store.js';
import { annId } from '../lib/sync.js';

const Z = (d, t) => zagrebToDate(d, t);
const ann = (over = {}) => ({ start: Z('2026-11-27', '09:00').toISOString(), end: Z('2026-11-27', '14:00').toISOString(), ...over });

test('zagrebToDate poštuje zimsko i ljetno vrijeme', () => {
  assert.equal(Z('2026-11-27', '09:00').toISOString(), '2026-11-27T08:00:00.000Z');
  assert.equal(Z('2026-07-15', '09:00').toISOString(), '2026-07-15T07:00:00.000Z');
});

test('nova najava: odmah "new", ništa drugo prije vremena', () => {
  const now = Z('2026-11-25', '10:00');
  assert.deepEqual(dueKinds(now, ann(), new Set(), now.toISOString()), ['new']);
  assert.deepEqual(dueKinds(now, ann(), new Set(['new']), now.toISOString()), []);
});

test('večer prije u 19:00 (ne ranije)', () => {
  const first = Z('2026-11-25', '10:00').toISOString();
  assert.deepEqual(dueKinds(Z('2026-11-26', '18:59'), ann(), new Set(['new']), first), []);
  assert.deepEqual(dueKinds(Z('2026-11-26', '19:00'), ann(), new Set(['new']), first), ['eve']);
  assert.deepEqual(dueKinds(Z('2026-11-26', '19:05'), ann(), new Set(['new', 'eve']), first), []);
});

test('sat prije početka na dan radova', () => {
  const first = Z('2026-11-25', '10:00').toISOString();
  const sent = new Set(['new', 'eve']);
  assert.deepEqual(dueKinds(Z('2026-11-27', '07:59'), ann(), sent, first), []);
  assert.deepEqual(dueKinds(Z('2026-11-27', '08:00'), ann(), sent, first), ['hour']);
  assert.deepEqual(dueKinds(Z('2026-11-27', '09:30'), ann(), sent, first), []); // radovi su već počeli
});

test('najava viđena tek navečer prije: samo "new", bez dupliciranja "eve"', () => {
  const now = Z('2026-11-26', '20:00');
  assert.deepEqual(dueKinds(now, ann(), new Set(), now.toISOString()), ['new']);
});

test('najava viđena sat vremena prije početka: jedna obavijest, pokriva i "hour"', () => {
  const now = Z('2026-11-27', '08:10');
  assert.deepEqual(dueKinds(now, ann(), new Set(), now.toISOString()), ['new', 'hour']);
});

test('cjelodnevne najave nemaju "sat prije"', () => {
  const a = ann({ allDay: true, start: Z('2026-11-27', '00:00').toISOString(), end: Z('2026-11-27', '23:59').toISOString() });
  const first = Z('2026-11-25', '10:00').toISOString();
  assert.deepEqual(dueKinds(Z('2026-11-26', '23:30'), a, new Set(['new', 'eve']), first), []);
});

test('završene najave se ne javljaju', () => {
  assert.deepEqual(dueKinds(Z('2026-11-27', '15:00'), ann(), new Set(), Z('2026-11-27', '15:00').toISOString()), []);
});

// ---- cjelovit tok: pretplata + najava + raspored + dedup + brisanje mrtvih pretplata
async function setup() {
  const store = memoryStore();
  const a = { source: 'hep-ods', type: 'struja', sourceName: 'HEP ODS', region: 'zagreb', place: 'ZAGREB', streets: 'MATE MERŠIĆA 1-8 obje', title: 't', url: 'u', ...ann() };
  a.id = annId(a);
  a.firstSeen = Z('2026-11-25', '10:00').toISOString();
  await store.setJSON(`ann/${a.id}`, a);
  const addr = { id: 'a1', label: 'Dom', street: 'Mate Meršića', number: '5', city: 'Zagreb', places: [], region: 'zagreb' };
  await store.setJSON('sub/abc', { push: { endpoint: 'https://x/y', keys: { p256dh: 'p', auth: 'a' } }, addresses: [addr] });
  return { store, a };
}

test('tok: nova najava, večer prije, sat prije – svaka točno jednom', async () => {
  const { store } = await setup();
  const sent = [];
  const send = async (_s, p) => { sent.push(p); return { ok: true }; };
  const run = (t) => runNotifications(store, { now: Z(...t), send });
  await run(['2026-11-25', '10:05']); await run(['2026-11-25', '10:15']); // ponovno pokretanje ne smije duplicirati
  await run(['2026-11-26', '19:00']); await run(['2026-11-26', '19:10']);
  await run(['2026-11-27', '08:00']); await run(['2026-11-27', '08:10']);
  assert.equal(sent.length, 3);
  assert.match(sent[0].title, /Nova najava/);
  assert.match(sent[1].title, /Sutra/);
  assert.match(sent[2].title, /Za sat vremena/);
  assert.equal(new Set(sent.map((s) => s.tag)).size, 1);
});

test('tok: pretplata koja vrati 410 se briše', async () => {
  const { store } = await setup();
  const stats = await runNotifications(store, { now: Z('2026-11-25', '10:05'), send: async () => ({ ok: false, gone: true, status: 410 }) });
  assert.equal(stats.removed, 1);
  assert.equal(await store.getJSON('sub/abc'), null);
});

test('tok: adresa u drugoj ulici ne dobiva obavijest', async () => {
  const { store } = await setup();
  const s = await store.getJSON('sub/abc');
  s.addresses[0].street = 'Vlaška';
  await store.setJSON('sub/abc', s);
  const sent = [];
  await runNotifications(store, { now: Z('2026-11-25', '10:05'), send: async (_s, p) => { sent.push(p); return { ok: true }; } });
  assert.equal(sent.length, 0);
});

test('tok: ista najava na dvije adrese istog uređaja = jedna obavijest', async () => {
  const { store } = await setup();
  const s = await store.getJSON('sub/abc');
  s.addresses.push({ ...s.addresses[0], id: 'a2', label: 'Posao', number: '7' });
  await store.setJSON('sub/abc', s);
  const sent = [];
  await runNotifications(store, { now: Z('2026-11-25', '10:05'), send: async (_s, p) => { sent.push(p); return { ok: true }; } });
  assert.equal(sent.length, 1);
});
