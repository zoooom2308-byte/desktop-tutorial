import test from 'node:test';
import assert from 'node:assert/strict';
import { matchAnnouncement } from '../lib/match.js';
import { validateAddresses, InputError } from '../lib/validate.js';
import { runNotifications, buildPayload, buildSummary } from '../lib/notify.js';
import { memoryStore } from '../lib/store.js';
import { zagrebToDate } from '../lib/time.js';
import { annId } from '../lib/sync.js';

const city = (name, region, parts = [], strict = false) => ({ kind: 'area', city: name, region, parts, strict });
const ann = (over) => ({ region: 'zagreb', type: 'voda', sourceName: 'ViO Zagreb', place: 'ŠPANSKO', streets: 'MILANA REŠETARA', ...over });

const CASES = [
  ['cijeli Zagreb: ViO najava za Špansko (cityHint)', ann({ cityHint: 'Zagreb' }), city('Zagreb', 'zagreb'), 'city'],
  ['cijeli Zagreb: HEP najava za ZAGREB', ann({ place: 'ZAGREB', source: 'hep-ods', streets: 'ILICA 1-9' }), city('Zagreb', 'zagreb'), 'city'],
  ['cijeli Zagreb: kvart SESVETE (poznati dio grada)', ann({ place: 'SESVETE', streets: 'BJELOVARSKA 2-32 par' }), city('Zagreb', 'zagreb'), 'city'],
  ['cijeli Zagreb: Samobor nije Zagreb', ann({ place: 'SAMOBOR', streets: 'ULICA 1' }), city('Zagreb', 'zagreb'), null],
  ['Zagreb, dio Špansko: pogodak', ann({ cityHint: 'Zagreb' }), city('Zagreb', 'zagreb', ['Špansko']), 'area'],
  ['Zagreb, dio Trnje: najava za Špansko, nije strogo', ann({ cityHint: 'Zagreb' }), city('Zagreb', 'zagreb', ['Trnje']), 'city'],
  ['Zagreb, dio Trnje: strogo – nema obavijesti', ann({ cityHint: 'Zagreb' }), city('Zagreb', 'zagreb', ['Trnje'], true), null],
  ['više dijelova: jedan se podudara', ann({ place: 'NOVI ZAGREB (SOPOT)', cityHint: 'Zagreb' }), city('Zagreb', 'zagreb', ['Trnje', 'Novi Zagreb'], true), 'area'],
  ['Rijeka, cijeli grad', { region: 'rijeka', place: 'Rijeka', streets: 'ŠKOLJIĆ 1, 13-16', type: 'voda', sourceName: 'Grad Rijeka (RCC)' }, city('Rijeka', 'rijeka'), 'city'],
  ['Rijeka: Kastav nije Rijeka', { region: 'rijeka', place: 'Kastav', streets: 'ĆIKOVIĆI 93-95/B', type: 'voda', sourceName: 'x' }, city('Rijeka', 'rijeka'), null],
  ['Kastav, cijelo mjesto', { region: 'rijeka', place: 'Kastav', streets: 'ĆIKOVIĆI 93-95/B', type: 'voda', sourceName: 'x' }, city('Kastav', 'rijeka'), 'city'],
  ['Rijeka, dio Trsat: najava za kvart Trsat', { region: 'rijeka', place: 'TRSAT', streets: 'X 1', type: 'struja', sourceName: 'x' }, city('Rijeka', 'rijeka', ['Trsat']), 'area'],
  ['Split, dio Meje: ViK po području (Meja/Meje)', { region: 'split', place: 'SPLITA', streets: 'naselja: Meja', areaIsStreet: true, type: 'voda', sourceName: 'ViK Split' }, city('Split', 'split', ['Meje']), 'area'],
  ['Split, cijeli grad: ViK najava (genitiv SPLITA)', { region: 'split', place: 'SPLITA', streets: 'naselja: Meja', areaIsStreet: true, type: 'voda', sourceName: 'ViK Split' }, city('Split', 'split'), 'city'],
  ['Cres: popis naselja, grad Cres', { region: 'rijeka', place: 'CRES', streets: 'naselja: Sv.Petar,Pojane', type: 'struja', sourceName: 'x' }, city('Cres', 'rijeka'), 'city'],
  ['druga regija se ne podudara', { region: 'split', place: 'RIJEKA', streets: 'X', type: 'struja', sourceName: 'x' }, city('Rijeka', 'rijeka'), null],
  ['naselje s malim slovima i dijakriticima', { region: 'osijek', place: 'KEŠINCI', streets: 'BALKANSKA 1-35', type: 'struja', sourceName: 'x' }, city('Kesinci', 'osijek'), 'city'],
];
for (const [name, a, entry, expected] of CASES) test(`grad/dio grada: ${name}`, () => assert.equal(matchAnnouncement(a, entry), expected));

test('validacija: grad bez područja se odbija, dijelovi se čiste i ograničavaju', () => {
  assert.throws(() => validateAddresses([{ kind: 'area', city: 'Rijeka' }]), InputError);
  const [a] = validateAddresses([{ kind: 'area', city: 'Rijeka', region: 'rijeka', parts: Array.from({ length: 60 }, (_, i) => `<b>Dio ${i}</b>`), strict: 1 }]);
  assert.equal(a.kind, 'area'); assert.equal(a.parts.length, 40); assert.ok(!a.parts[0].includes('<')); assert.equal(a.strict, true);
  assert.equal(validateAddresses(Array.from({ length: 12 }, () => ({ kind: 'area', city: 'Split', region: 'split' }))).length, 12);
  assert.throws(() => validateAddresses(Array.from({ length: 13 }, () => ({ kind: 'area', city: 'Split', region: 'split' }))), InputError);
});

const Z = (d, t) => zagrebToDate(d, t);
async function setup(n) {
  const store = memoryStore();
  for (let i = 0; i < n; i++) {
    const a = { source: 'hep-ods', type: i % 2 ? 'struja' : 'voda', sourceName: 'HEP ODS', region: 'zagreb', place: 'ZAGREB', streets: `ULICA${i} 1-9`, title: 't', url: 'u', start: Z('2026-11-27', '09:00').toISOString(), end: Z('2026-11-27', '14:00').toISOString() };
    a.id = annId(a); a.firstSeen = Z('2026-11-25', '10:00').toISOString();
    await store.setJSON(`ann/${a.id}`, a);
  }
  await store.setJSON('sub/abc', { push: { endpoint: 'https://x/y', keys: { p256dh: 'p', auth: 'a' } }, addresses: [{ id: 'g1', kind: 'area', city: 'Zagreb', region: 'zagreb', parts: [], strict: false }] });
  return store;
}

test('obavijesti za grad: do 3 najave idu pojedinačno', async () => {
  const store = await setup(3); const sent = [];
  const st = await runNotifications(store, { now: Z('2026-11-25', '10:05'), send: async (_s, p) => { sent.push(p); return { ok: true }; } });
  assert.equal(st.sent, 3); assert.ok(sent.every((p) => /Zagreb/.test(p.title) && /U tvom gradu/.test(p.body)));
});

test('obavijesti za grad: više od 3 najave = jedna zbirna obavijest, bez ponavljanja', async () => {
  const store = await setup(6); const sent = [];
  const send = async (_s, p) => { sent.push(p); return { ok: true }; };
  const st = await runNotifications(store, { now: Z('2026-11-25', '10:05'), send });
  assert.equal(st.sent, 1); assert.match(sent[0].title, /^6 najava/); assert.match(sent[0].body, /Struja 3/);
  await runNotifications(store, { now: Z('2026-11-25', '10:15'), send });
  assert.equal(sent.length, 1);
});

test('buildPayload/buildSummary', () => {
  const p = buildPayload({ id: 'x', type: 'voda', sourceName: 'ViO', start: Z('2026-11-27', '09:00').toISOString(), allDay: false }, { kind: 'area', city: 'Rijeka' }, 'eve', 'area');
  assert.match(p.title, /Voda: Sutra – Rijeka/); assert.match(p.body, /U tvom naselju/);
  assert.match(buildSummary([{ ann: { type: 'voda' } }, { ann: { type: 'voda' } }]).body, /Voda 2/);
});
