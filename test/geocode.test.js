import test from 'node:test';
import assert from 'node:assert/strict';
import { targetsFor, geocodeAnnouncements } from '../lib/geocode.js';
import { memoryStore } from '../lib/store.js';

const photon = (calls, map) => async (url) => {
  const q = decodeURIComponent(new URL(url).searchParams.get('q')); calls.push(q);
  const hit = Object.entries(map).find(([k]) => q.toLowerCase().startsWith(k.toLowerCase()));
  return new Response(JSON.stringify({ features: hit ? [{ geometry: { coordinates: hit[1] } }] : [] }), { status: 200 });
};
const mk = (over) => ({ id: 'a1', place: 'RIJEKA', streets: 'ŠKOLJIĆ 1, 13-16, VODOVODNA 10', ...over });

test('ciljevi: ulica s prvim brojem, grad, rezervni upit bez broja', () => {
  const t = targetsFor(mk());
  assert.equal(t.length, 2); assert.equal(t[0].query, 'Školjić 1, Rijeka'); assert.equal(t[0].fallback, 'Školjić, Rijeka'); assert.equal(t[1].query, 'Vodovodna 10, Rijeka');
  assert.equal(targetsFor(mk({ place: 'ŠPANSKO', cityHint: 'Zagreb', streets: 'MILANA REŠETARA' }))[0].query, 'Milana Rešetara, Špansko, Zagreb');
  assert.equal(targetsFor({ place: 'SPLITA', streets: 'naselja: Meja' })[0].query, 'Meja, Splita');
});

test('geokodiranje: koordinate se spremaju u najavu, a upiti u predmemoriju (drugi put bez mreže)', async () => {
  const store = memoryStore(); const calls = [];
  const f = photon(calls, { 'Školjić 1': [14.448, 45.327], 'Vodovodna 10': [14.44, 45.33] });
  const ann = mk(); await store.setJSON('ann/a1', ann);
  assert.equal(await geocodeAnnouncements(store, [ann], { fetchImpl: f }), 1);
  assert.deepEqual(ann.geo.map((g) => [g.label, g.lat, g.lon]), [['Školjić 1, 13–16', 45.327, 14.448], ['Vodovodna 10', 45.33, 14.44]]);
  assert.deepEqual((await store.getJSON('ann/a1')).geo.length, 2);
  const again = mk({ id: 'a2' }); const n = calls.length;
  await geocodeAnnouncements(store, [again], { fetchImpl: f }); assert.equal(calls.length, n); assert.equal(again.geo.length, 2);
});

test('izvan Hrvatske i nepoznato se odbacuje; ako ulica nije nađena, koristi se središte mjesta', async () => {
  const store = memoryStore(); const calls = [];
  const f = photon(calls, { 'Rijeka': [14.44, 45.33], 'Školjić': [2.35, 48.85] }); // Školjić "pronađen" u Parizu
  const ann = mk({ streets: 'ŠKOLJIĆ 1' }); await geocodeAnnouncements(store, [ann], { fetchImpl: f });
  assert.equal(ann.geo.length, 1); assert.equal(ann.geo[0].area, true); assert.equal(ann.geo[0].label, 'Rijeka');
});

test('ograničenje upita po krugu: nedovršena najava ostaje za sljedeći krug', async () => {
  const store = memoryStore(); const calls = [];
  const f = photon(calls, { 'Školjić 1': [14.448, 45.327], 'Vodovodna 10': [14.44, 45.33] });
  const ann = mk(); await geocodeAnnouncements(store, [ann], { fetchImpl: f, maxLookups: 1 });
  assert.equal(ann.geo, undefined);
  await geocodeAnnouncements(store, [ann], { fetchImpl: f, maxLookups: 5 });
  assert.equal(ann.geo.length, 2);
});

test('mrežna greška ne zapisuje prazan rezultat', async () => {
  const store = memoryStore(); const ann = mk();
  await geocodeAnnouncements(store, [ann], { fetchImpl: async () => { throw new Error('mreža'); } });
  assert.equal(ann.geo, undefined);
});
