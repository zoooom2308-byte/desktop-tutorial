import { openStore } from '../../lib/store.js';
import { syncSources } from '../../lib/sync.js';

export default async () => {
  const store = await openStore();
  const r = await syncSources(store, { maxRequests: 24, maxMs: 22000 });
  console.log('sync', JSON.stringify(r));
};
export const config = { schedule: '*/15 * * * *' };
