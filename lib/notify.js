import { matchAnnouncement } from './match.js';
import { dueKinds, sentKey } from './schedule.js';
import { sendPush } from './push.js';
import { fmtHr } from './time.js';
import { loadActiveAnnouncements } from './sync.js';

const TYPE_HR = { struja: 'Struja', voda: 'Voda', plin: 'Plin', grijanje: 'Grijanje', ceste: 'Promet' };

export function buildPayload(ann, addr, kind, quality, siteUrl = '/') {
  const when = fmtHr(new Date(ann.start));
  const lead = { new: 'Nova najava', eve: 'Sutra', hour: 'Za sat vremena' }[kind];
  const where = `${addr.street}${addr.number ? ' ' + addr.number : ''}`;
  const check = quality === 'exact' ? '' : ' U tvojoj ulici – provjeri broj.';
  const time = ann.allDay ? 'cijeli dan' : when;
  return {
    title: `${TYPE_HR[ann.type] ?? 'Radovi'}: ${lead} – ${where}`,
    body: `${ann.sourceName}: ${time}.${check}`,
    url: '/#najave',
    tag: `ann-${ann.id}`,
    annId: ann.id,
  };
}

/** Prođi sve pretplate, usporedi s aktivnim najavama i pošalji dospjele obavijesti (bez ponavljanja). */
export async function runNotifications(store, { now = new Date(), siteUrl = '/', send = (sub, payload) => sendPush(store, sub, payload) } = {}) {
  const anns = await loadActiveAnnouncements(store, now);
  const stats = { subs: 0, sent: 0, removed: 0, failed: 0 };
  for (const key of await store.list('sub/')) {
    const sub = await store.getJSON(key);
    if (!sub) continue;
    stats.subs += 1;
    const subId = key.slice(4);
    let gone = false;
    for (const ann of anns) {
      if (gone) break;
      for (const addr of sub.addresses) {
        const quality = matchAnnouncement(ann, addr);
        if (!quality) continue;
        // Jedna najava može pogoditi više adresa istog uređaja; dedup po najavi (ne po adresi).
        const sentKeys = new Set();
        for (const k of ['new', 'eve', 'hour']) if (await store.getJSON(`sent/${sentKey(subId, ann.id, k)}`)) sentKeys.add(k);
        const kinds = dueKinds(now, ann, sentKeys, ann.firstSeen);
        if (!kinds.length) continue;
        const res = await send(sub.push, buildPayload(ann, addr, kinds[0], quality, siteUrl));
        if (res.ok) {
          stats.sent += 1;
          for (const k of kinds) await store.setJSON(`sent/${sentKey(subId, ann.id, k)}`, { at: now.toISOString(), end: ann.end });
        } else if (res.gone) {
          await store.del(key);
          stats.removed += 1;
          gone = true;
        } else {
          stats.failed += 1;
        }
        break; // jedna obavijest po najavi i pretplati
      }
    }
  }
  // čišćenje evidencije poslanog za završene najave
  for (const k of await store.list('sent/')) {
    const s = await store.getJSON(k);
    if (s && now - new Date(s.end) > 3 * 86400_000) await store.del(k);
  }
  return stats;
}
