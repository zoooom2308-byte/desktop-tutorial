// Živi test čitanja svih izvora (stvarni podaci). Ispisuje broj najava po izvoru.
import { memoryStore } from '../lib/store.js';
import { syncSources, loadActiveAnnouncements } from '../lib/sync.js';
const store = memoryStore();
await store.setJSON('demand/zagreb', { at: new Date().toISOString() });
const r = await syncSources(store, { maxRequests: 60, maxMs: 120000 });
console.log(JSON.stringify(r));
const a = await loadActiveAnnouncements(store, new Date(Date.now() - 86400_000));
const by = {}; for (const x of a) by[x.source] = (by[x.source] ?? 0) + 1;
console.log(by); console.log(a.slice(0, 3).map((x) => `${x.source} | ${x.place} | ${x.streets.slice(0, 80)} | ${x.start}`).join('\n'));
