import { matchAnnouncement } from './match.js';
import { dueKinds, sentKey } from './schedule.js';
import { sendPush } from './push.js';
import { fmtHr } from './time.js';
import { loadActiveAnnouncements } from './sync.js';

const TYPE_HR = { struja: 'Struja', voda: 'Voda', plin: 'Plin', grijanje: 'Grijanje', ceste: 'Promet' };
const RANK = { exact: 4, street: 3, area: 2, city: 1 };
const CHECK = { exact: '', street: ' U tvojoj ulici – provjeri broj.', area: ' U tvom naselju – provjeri ulicu.', city: ' U tvom gradu – provjeri ulicu.' };
const MAX_SINGLE = 3; // više od toga u jednom krugu šaljemo kao jednu zbirnu obavijest

export function whereOf(addr) {
  return addr.kind === 'area' ? addr.city : `${addr.street}${addr.number ? ' ' + addr.number : ''}`;
}

export function buildPayload(ann, addr, kind, quality) {
  const lead = { new: 'Nova najava', eve: 'Sutra', hour: 'Za sat vremena' }[kind];
  const time = ann.allDay ? 'cijeli dan' : fmtHr(new Date(ann.start));
  return {
    title: `${TYPE_HR[ann.type] ?? 'Radovi'}: ${lead} – ${whereOf(addr)}`,
    body: `${ann.sourceName}: ${time}.${CHECK[quality] ?? CHECK.street}`,
    url: '/#najave',
    tag: `ann-${ann.id}`,
    annId: ann.id,
  };
}

export function buildSummary(items) {
  const counts = {};
  for (const it of items) counts[TYPE_HR[it.ann.type] ?? 'Radovi'] = (counts[TYPE_HR[it.ann.type] ?? 'Radovi'] ?? 0) + 1;
  const parts = Object.entries(counts).map(([k, v]) => `${k} ${v}`).join(', ');
  return { title: `${items.length} najava radova u tvojim gradovima`, body: `${parts}. Otvori aplikaciju za cijeli popis.`, url: '/#najave', tag: 'summary' };
}

/** Prođi sve pretplate, usporedi s aktivnim najavama i pošalji dospjele obavijesti (bez ponavljanja). */
export async function runNotifications(store, { now = new Date(), send = (sub, payload) => sendPush(store, sub, payload) } = {}) {
  const anns = await loadActiveAnnouncements(store, now);
  const stats = { subs: 0, sent: 0, removed: 0, failed: 0 };
  for (const key of await store.list('sub/')) {
    const sub = await store.getJSON(key);
    if (!sub) continue;
    stats.subs += 1;
    const subId = key.slice(4);
    // 1) što je dospjelo: po najavi najbolje podudaranje među adresama/gradovima
    const due = [];
    for (const ann of anns) {
      let best = null;
      for (const addr of sub.addresses) {
        const quality = matchAnnouncement(ann, addr);
        if (quality && (!best || RANK[quality] > RANK[best.quality])) best = { addr, quality };
      }
      if (!best) continue;
      const sentKeys = new Set();
      for (const k of ['new', 'eve', 'hour']) if (await store.getJSON(`sent/${sentKey(subId, ann.id, k)}`)) sentKeys.add(k);
      const kinds = dueKinds(now, ann, sentKeys, ann.firstSeen);
      if (kinds.length) due.push({ ann, addr: best.addr, quality: best.quality, kinds });
    }
    if (!due.length) continue;
    // 2) pošalji: pojedinačno ili zbirno
    const batches = due.length > MAX_SINGLE ? [{ items: due, payload: buildSummary(due) }] : due.map((d) => ({ items: [d], payload: buildPayload(d.ann, d.addr, d.kinds[0], d.quality) }));
    let gone = false;
    for (const b of batches) {
      if (gone) break;
      const res = await send(sub.push, b.payload);
      if (res.ok) {
        stats.sent += 1;
        for (const it of b.items) for (const k of it.kinds) await store.setJSON(`sent/${sentKey(subId, it.ann.id, k)}`, { at: now.toISOString(), end: it.ann.end });
      } else if (res.gone) { await store.del(key); stats.removed += 1; gone = true; }
      else stats.failed += 1;
    }
  }
  for (const k of await store.list('sent/')) {
    const s = await store.getJSON(k);
    if (s && now - new Date(s.end) > 3 * 86400_000) await store.del(k);
  }
  return stats;
}
