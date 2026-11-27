import test from 'node:test';
import assert from 'node:assert/strict';
import { adminSetup, adminLogin, adminAuth, adminLogout, adminConfigured, computeStats, setupRecord, safeEqual } from '../lib/admin.js';
import { recordVisit, bump, dailySeries, freezeVisitors, cleanupStats } from '../lib/stats.js';
import { memoryStore } from '../lib/store.js';

const IP = '1.2.3.4';
const PW = 'ovo-je-dobra-lozinka-42';
async function ready() {
  const store = memoryStore(); const code = 'abcdef0123456789abcdef01';
  await store.setJSON('admin/setup', setupRecord(code));
  return { store, code };
}

test('safeEqual', () => { assert.ok(safeEqual('abc', 'abc')); assert.ok(!safeEqual('abc', 'abd')); assert.ok(!safeEqual('abc', 'abcd')); });

test('postavljanje: krivi kod i slaba lozinka se odbijaju, ispravno postavlja lozinku jednom', async () => {
  const { store, code } = await ready();
  assert.equal(await adminConfigured(store), false);
  assert.equal((await adminSetup(store, IP, { code: 'kriv', password: PW })).status, 403);
  assert.equal((await adminSetup(store, IP, { code, password: 'kratka' })).status, 400);
  assert.equal((await adminSetup(store, IP, { code, password: 'aaaaaaaaaaaaaaaa' })).status, 400);
  assert.deepEqual(await adminSetup(store, IP, { code, password: PW }), { ok: true });
  assert.equal(await adminConfigured(store), true);
  assert.equal((await adminSetup(store, IP, { code, password: 'neka-druga-lozinka-1' })).status, 403); // kod je potrošen
  const cred = JSON.stringify(await store.getJSON('admin/cred'));
  assert.ok(!cred.includes(PW)); // lozinka se ne sprema
});

test('kod za postavljanje istječe', async () => {
  const { store, code } = await ready();
  const later = new Date(Date.now() + 49 * 3600_000);
  assert.equal((await adminSetup(store, IP, { code, password: PW }, later)).status, 403);
});

test('prijava: ispravna lozinka daje sesiju, pogrešna ne; odjava poništava sesiju', async () => {
  const { store, code } = await ready(); await adminSetup(store, IP, { code, password: PW });
  assert.equal((await adminLogin(store, IP, { password: 'pogresno-pogresno-1' })).status, 401);
  const r = await adminLogin(store, IP, { password: PW });
  assert.ok(r.ok && /^[a-f0-9]{64}$/.test(r.token));
  assert.equal(await adminAuth(store, r.token), true);
  assert.equal(await adminAuth(store, 'x'.repeat(64)), false);
  assert.equal(await adminAuth(store, undefined), false);
  assert.equal(await adminAuth(store, r.token, new Date(Date.now() + 13 * 3600_000)), true); // ostaje prijavljen i nakon 13 sati
  assert.equal(await adminAuth(store, r.token, new Date(Date.now() + 31 * 86400_000)), false); // istječe nakon 30 dana
  await adminLogout(store, r.token); assert.equal(await adminAuth(store, r.token), false);
  assert.ok(!JSON.stringify([...store.m.entries()]).includes(r.token)); // sirovi token se ne sprema
});

test('ostani prijavljen: korištenje produljuje prijavu (klizni rok od 30 dana)', async () => {
  const { store, code } = await ready(); await adminSetup(store, IP, { code, password: PW });
  const t0 = new Date('2026-12-01T10:00:00Z');
  const r = await adminLogin(store, IP, { password: PW }, t0);
  const day = (n) => new Date(t0.getTime() + n * 86400_000);
  assert.equal(await adminAuth(store, r.token, day(20)), true);   // produljuje na 20. + 30 = 50. dan
  assert.equal(await adminAuth(store, r.token, day(45)), true);   // bez produljenja bi već isteklo (30. dan)
  assert.equal(await adminAuth(store, r.token, day(80)), false);  // 35 dana bez korištenja: istekla
});

test('zaštita od pogađanja: nakon 5 pogrešnih pokušaja prijava je blokirana i s ispravnom lozinkom', async () => {
  const { store, code } = await ready(); await adminSetup(store, IP, { code, password: PW });
  for (let i = 0; i < 5; i++) assert.equal((await adminLogin(store, IP, { password: `pogresno-${i}-pogresno` })).status, 401);
  assert.equal((await adminLogin(store, IP, { password: PW })).status, 429);
  assert.ok((await adminLogin(store, '9.9.9.9', { password: PW })).ok); // druga adresa nije blokirana
  const later = new Date(Date.now() + 16 * 60_000);
  assert.ok((await adminLogin(store, IP, { password: PW }, later)).ok); // blokada istječe
});

test('brojači: posjetitelji se broje jednom po danu, sirovi hashevi se brišu, broj ostaje', async () => {
  const store = memoryStore(); const now = new Date('2026-11-27T10:00:00Z');
  await recordVisit(store, '1.1.1.1', now); await recordVisit(store, '1.1.1.1', now); await recordVisit(store, '2.2.2.2', now);
  await bump(store, 'sent', 3, now);
  let d = (await dailySeries(store, 1, now))[0];
  assert.equal(d.opens, 3); assert.equal(d.visitors, 2); assert.equal(d.sent, 3);
  await freezeVisitors(store, now);
  await cleanupStats(store, new Date('2026-12-01T10:00:00Z'));
  assert.equal((await store.list('stats/uv/')).length, 0);
  d = (await dailySeries(store, 1, now))[0]; // 27.11.
  assert.equal(d.visitors, 2);
});

test('statistika: uređaji, gradovi, dijelovi, najave, zdravlje', async () => {
  const store = memoryStore(); const now = new Date('2026-11-27T10:00:00Z');
  const sub = (addresses, extra = {}) => ({ push: { endpoint: 'https://x/y', keys: {} }, digest: true, addresses, ...extra });
  await store.setJSON('sub/a', sub([{ kind: 'area', city: 'Rijeka', region: 'rijeka', parts: ['Trsat'] }, { kind: 'area', city: 'Zagreb', region: 'zagreb', parts: [] }]));
  await store.setJSON('sub/b', sub([{ kind: 'area', city: 'Rijeka', region: 'rijeka', parts: ['Trsat', 'Sušak'] }], { digest: false }));
  await store.setJSON('sub/c', sub([{ street: 'Ilica', number: '1', city: 'Zagreb', region: 'zagreb' }]));
  await store.setJSON('ann/1', { sourceName: 'HEP ODS', type: 'struja', end: '2026-11-28T10:00:00Z' });
  await store.setJSON('ann/2', { sourceName: 'HEP ODS', type: 'struja', end: '2026-11-20T10:00:00Z' }); // završena
  await store.setJSON('stats/tick', { at: now.toISOString(), ms: 900 });
  const s = await computeStats(store, now);
  assert.equal(s.devices.total, 3); assert.equal(s.devices.digestOn, 2); assert.equal(s.devices.areaEntries, 3); assert.equal(s.devices.addressEntries, 1);
  assert.deepEqual(s.cities[0], { city: 'Rijeka', region: 'rijeka', devices: 2 });
  assert.deepEqual(s.parts[0], { part: 'Trsat', city: 'Rijeka', devices: 2 });
  assert.deepEqual(s.regions.find((r) => r.region === 'zagreb'), { region: 'zagreb', devices: 2 });
  assert.equal(s.announcements.active, 1); assert.equal(s.announcements.bySource['HEP ODS'], 1);
  assert.equal(s.health.tick.ms, 900); assert.equal(s.daily.length, 14);
  assert.ok(!JSON.stringify(s).includes('https://x/y')); // statistika ne otkriva pretplate
});
