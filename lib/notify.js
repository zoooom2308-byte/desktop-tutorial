import { matchAnnouncement } from './match.js';
import { dueKinds, sentKey } from './schedule.js';
import { sendPush } from './push.js';
import { sendNtfy } from './ntfy.js';
import { fmtHr } from './time.js';
import { loadActiveAnnouncements } from './sync.js';
import { buildMapLinks } from './maps.js';
import { zagrebToDate, zagrebYmd, addDaysYmd } from './time.js';
import { bump } from './stats.js';

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

const hhmm = (d) => new Intl.DateTimeFormat('hr-HR', { timeZone: 'Europe/Zagreb', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(d);
export const najavaWord = (n) => (n % 10 === 1 && n % 100 !== 11 ? 'najava' : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? 'najave' : 'najava');

/** Jutarnji sažetak: što se danas radi u gradovima/na adresama uređaja. Šalje se jednom dnevno između 7:00 i 12:00. */
export function buildDigest(items) {
  const lines = items.slice(0, 3).map(({ ann, addr }) => {
    const label = buildMapLinks(ann, addr).links[0]?.label ?? ann.place ?? '';
    return `${TYPE_HR[ann.type] ?? 'Radovi'}: ${label} ${ann.allDay ? '(cijeli dan)' : `(${hhmm(new Date(ann.start))}–${hhmm(new Date(ann.end))})`}`;
  });
  const more = items.length > 3 ? ` i još ${items.length - 3}` : '';
  return { title: `Danas: ${items.length} ${najavaWord(items.length)} radova kod tebe`, body: lines.join('\n') + more, url: '/#najave', tag: 'digest', count: items.length };
}

/** Prođi sve pretplate, usporedi s aktivnim najavama i pošalji dospjele obavijesti (bez ponavljanja). */
/** Pošalji na sve kanale uređaja (Web Push i/ili ntfy). ok = barem jedan kanal je prihvatio; gone = push pretplata više ne postoji. */
export async function deliver(store, sub, payload) {
  const out = { ok: false, gone: false };
  if (sub.push) { const r = await sendPush(store, sub.push, payload); out.ok = out.ok || r.ok; out.gone = !!r.gone; }
  if (sub.ntfy) { const r = await sendNtfy(sub.ntfy, payload); out.ok = out.ok || r.ok; }
  return out;
}

export async function runNotifications(store, { now = new Date(), send = (sub, payload) => deliver(store, sub, payload) } = {}) {
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
    // 1b) jutarnji sažetak (jednom dnevno, ako se danas nešto radi)
    const today = zagrebYmd(now);
    const digestKey = `sent/${sentKey(subId, 'digest', today)}`;
    if (sub.digest !== false && now >= zagrebToDate(today, '07:00') && now < zagrebToDate(today, '12:00') && !(await store.getJSON(digestKey))) {
      const endOfDay = zagrebToDate(addDaysYmd(today, 1), '00:00');
      const items = [];
      for (const ann of anns) {
        if (new Date(ann.end) <= now || new Date(ann.start) >= endOfDay) continue;
        let best = null;
        for (const addr of sub.addresses) { const q = matchAnnouncement(ann, addr); if (q && (!best || RANK[q] > RANK[best.quality])) best = { addr, quality: q }; }
        if (best) items.push({ ann, addr: best.addr });
      }
      if (items.length) {
        const res = await send(sub, buildDigest(items));
        if (res.ok) { stats.sent += 1; stats.digests = (stats.digests ?? 0) + 1; await store.setJSON(digestKey, { at: now.toISOString(), end: endOfDay.toISOString() }); }
        else if (res.gone) { await store.del(key); stats.removed += 1; continue; }
        else stats.failed += 1;
      } else await store.setJSON(digestKey, { at: now.toISOString(), end: endOfDay.toISOString() });
    }
    if (!due.length) continue;
    // 2) pošalji: pojedinačno ili zbirno
    const batches = due.length > MAX_SINGLE ? [{ items: due, payload: buildSummary(due) }] : due.map((d) => ({ items: [d], payload: buildPayload(d.ann, d.addr, d.kinds[0], d.quality) }));
    let gone = false;
    for (const b of batches) {
      if (gone) break;
      const res = await send(sub, b.payload);
      if (res.ok) {
        stats.sent += 1;
        for (const it of b.items) for (const k of it.kinds) await store.setJSON(`sent/${sentKey(subId, it.ann.id, k)}`, { at: now.toISOString(), end: it.ann.end });
      } else if (res.gone && !sub.ntfy) { await store.del(key); stats.removed += 1; gone = true; }
      else stats.failed += 1;
      if (res.gone && sub.ntfy && sub.push) { delete sub.push; await store.setJSON(key, sub); } // push istekao, ntfy ostaje
    }
  }
  for (const k of await store.list('sent/')) {
    const s = await store.getJSON(k);
    if (s && now - new Date(s.end) > 3 * 86400_000) await store.del(k);
  }
  if (stats.sent) await bump(store, 'sent', stats.sent, now);
  if (stats.failed) await bump(store, 'failed', stats.failed, now);
  if (stats.removed) await bump(store, 'removed', stats.removed, now);
  if (stats.digests) await bump(store, 'digests', stats.digests, now);
  return stats;
}
