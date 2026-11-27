import test from 'node:test';
import assert from 'node:assert/strict';
import { runNotifications, buildDigest, najavaWord } from '../lib/notify.js';
import { memoryStore } from '../lib/store.js';
import { zagrebToDate } from '../lib/time.js';
import { annId } from '../lib/sync.js';

const Z = (d, t) => zagrebToDate(d, t);
async function setup({ digest, anns = 2, region = 'rijeka', city = 'Rijeka' } = {}) {
  const store = memoryStore();
  for (let i = 0; i < anns; i++) {
    const a = { source: 'x', type: i % 2 ? 'struja' : 'voda', sourceName: 'Grad Rijeka (RCC)', region: 'rijeka', place: 'Rijeka', streets: `ALFA${'abcdef'[i]} 1-9`.replace(/\d/g, '').trim() + ' 1-9', title: 't', url: 'u', start: Z('2026-11-27', '09:00').toISOString(), end: Z('2026-11-27', '14:00').toISOString() };
    a.id = annId(a); a.firstSeen = Z('2026-11-26', '10:00').toISOString();
    await store.setJSON(`ann/${a.id}`, a);
  }
  await store.setJSON('sub/d1', { push: { endpoint: 'https://x/y', keys: { p256dh: 'p', auth: 'a' } }, ...(digest === undefined ? {} : { digest }), addresses: [{ id: 'g', kind: 'area', city, region, parts: [], strict: false }] });
  return store;
}
const collect = () => { const sent = []; return { sent, send: async (_s, p) => { sent.push(p); return { ok: true }; } }; };

test('hrvatski oblik riječi najava', () => { assert.deepEqual([1, 2, 4, 5, 11, 12, 21, 22, 25].map(najavaWord), ['najava', 'najave', 'najave', 'najava', 'najava', 'najava', 'najava', 'najave', 'najava']); });

test('sažetak: ne prije 7:00, jednom u 7:00, ne ponavlja se, sutradan opet', async () => {
  const store = await setup(); const { sent, send } = collect();
  // individualne obavijesti 'new' već su poslane u ranijem krugu
  await runNotifications(store, { now: Z('2026-11-26', '10:05'), send });
  await runNotifications(store, { now: Z('2026-11-26', '19:05'), send }); // večer prije
  const before = sent.length;
  await runNotifications(store, { now: Z('2026-11-27', '06:30'), send }); assert.equal(sent.length, before);
  await runNotifications(store, { now: Z('2026-11-27', '07:05'), send });
  const dg = sent.filter((p) => p.tag === 'digest'); assert.equal(dg.length, 1);
  assert.match(dg[0].title, /^Danas: 2 najave radova/); assert.equal(dg[0].count, 2); assert.match(dg[0].body, /Voda: Alfaa 1–9/);
  await runNotifications(store, { now: Z('2026-11-27', '07:15'), send }); assert.equal(sent.filter((p) => p.tag === 'digest').length, 1);
});

test('sažetak se ne šalje ako je isključen ili ako danas nema radova u njegovim gradovima', async () => {
  const off = await setup({ digest: false }); const a = collect();
  await runNotifications(off, { now: Z('2026-11-26', '10:05'), send: a.send }); await runNotifications(off, { now: Z('2026-11-26', '19:05'), send: a.send }); const n = a.sent.length;
  await runNotifications(off, { now: Z('2026-11-27', '07:05'), send: a.send }); assert.equal(a.sent.length, n);
  const other = await setup({ region: 'split', city: 'Split' }); const b = collect();
  await runNotifications(other, { now: Z('2026-11-27', '07:05'), send: b.send }); assert.equal(b.sent.length, 0);
});

test('sažetak: više od 3 stavke skraćeno uz "i još N"', () => {
  const items = Array.from({ length: 5 }, (_, i) => ({ ann: { type: 'voda', place: 'Rijeka', streets: `ULICA${String.fromCharCode(65 + i)} 1-9`.replace(/\d/g, '') + ' 1-9', start: Z('2026-11-27', '09:00').toISOString(), end: Z('2026-11-27', '14:00').toISOString() }, addr: { city: 'Rijeka' } }));
  const d = buildDigest(items); assert.match(d.title, /^Danas: 5 najava/); assert.match(d.body, /i još 2$/);
});
