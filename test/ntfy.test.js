import test from 'node:test';
import assert from 'node:assert/strict';
import { validTopic, sendNtfy } from '../lib/ntfy.js';
import { validateChannels, InputError } from '../lib/validate.js';
import { runNotifications, deliver } from '../lib/notify.js';
import { memoryStore } from '../lib/store.js';
import { zagrebToDate } from '../lib/time.js';
import { annId } from '../lib/sync.js';

const Z = (d, t) => zagrebToDate(d, t);
const TOPIC = 'najava-abcdefghij0123456789';

test('ntfy tema: dopuštene i nedopuštene vrijednosti', () => {
  assert.ok(validTopic(TOPIC));
  for (const bad of ['', 'kratko', 'ima razmak ima razmak', 'x'.repeat(65), '../../etc/passwd/xx', null, 12]) assert.equal(validTopic(bad), false);
});

test('kanali: barem jedan je obavezan, ntfy se provjerava', () => {
  assert.throws(() => validateChannels({}), InputError);
  assert.throws(() => validateChannels({ ntfy: 'a b' }), InputError);
  assert.deepEqual(validateChannels({ ntfy: TOPIC }), { ntfy: TOPIC });
  const push = { endpoint: 'https://fcm.googleapis.com/fcm/send/x', keys: { p256dh: 'p', auth: 'a' } };
  assert.equal(validateChannels({ subscription: push, ntfy: TOPIC }).push.endpoint, push.endpoint);
});

test('sendNtfy šalje JSON na ntfy.sh s temom, naslovom i poveznicom', async () => {
  const real = globalThis.fetch; let seen;
  globalThis.fetch = async (url, init) => { seen = { url, init, body: JSON.parse(init.body) }; return new Response('{}', { status: 200 }); };
  try {
    const r = await sendNtfy(TOPIC, { title: 'Voda: Nova najava – Rijeka', body: 'ViK: sutra 08:00.' });
    assert.equal(r.ok, true); assert.equal(seen.url, 'https://ntfy.sh');
    assert.equal(seen.body.topic, TOPIC); assert.match(seen.body.click, /^https:\/\/zoooom2308-byte\.github\.io\/desktop-tutorial\//); assert.equal(seen.body.title, 'Voda: Nova najava – Rijeka');
    globalThis.fetch = async () => new Response('x', { status: 429 });
    assert.deepEqual(await sendNtfy(TOPIC, { title: 't', body: 'b' }), { ok: false, status: 429 });
    assert.equal((await sendNtfy('loše', { title: 't', body: 'b' })).ok, false);
  } finally { globalThis.fetch = real; }
});

async function setupSub(sub) {
  const store = memoryStore();
  const a = { source: 'hep-ods', type: 'struja', sourceName: 'HEP ODS', region: 'rijeka', place: 'RIJEKA', streets: 'PORTIĆ 1-9', title: 't', url: 'u', start: Z('2026-11-27', '09:00').toISOString(), end: Z('2026-11-27', '14:00').toISOString() };
  a.id = annId(a); a.firstSeen = Z('2026-11-25', '10:00').toISOString();
  await store.setJSON(`ann/${a.id}`, a);
  await store.setJSON('sub/x1', { ...sub, addresses: [{ id: 'g', kind: 'area', city: 'Rijeka', region: 'rijeka', parts: [], strict: false }] });
  return store;
}

test('obavijest samo preko ntfy (bez Web Pusha) stiže i ne ponavlja se', async () => {
  const store = await setupSub({ ntfy: TOPIC });
  const real = globalThis.fetch; const calls = [];
  globalThis.fetch = async (url, init) => { calls.push(JSON.parse(init.body)); return new Response('{}', { status: 200 }); };
  try {
    const st = await runNotifications(store, { now: Z('2026-11-25', '10:05') });
    assert.equal(st.sent, 1); assert.equal(calls.length, 1); assert.match(calls[0].title, /Struja: Nova najava – Rijeka/);
    await runNotifications(store, { now: Z('2026-11-25', '10:15') });
    assert.equal(calls.length, 1);
  } finally { globalThis.fetch = real; }
});

test('istekao push uz ntfy: pretplata ostaje, push se uklanja, obavijest ide preko ntfy', async () => {
  const store = await setupSub({ push: { endpoint: 'https://x/y', keys: { p256dh: 'p', auth: 'a' } }, ntfy: TOPIC });
  const real = globalThis.fetch; globalThis.fetch = async () => new Response('{}', { status: 200 });
  try {
    const st = await runNotifications(store, { now: Z('2026-11-25', '10:05'), send: async (sub, p) => { const r = await deliver(store, { ...sub, push: undefined }, p); return { ok: r.ok, gone: true }; } });
    assert.equal(st.sent, 1);
    const sub = await store.getJSON('sub/x1'); assert.ok(sub && sub.ntfy && !sub.push);
  } finally { globalThis.fetch = real; }
});
