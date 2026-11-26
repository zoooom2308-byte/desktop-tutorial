import { openStore } from '../../lib/store.js';
import { syncSources } from '../../lib/sync.js';

export default async () => {
  const store = await openStore();
  const r = await syncSources(store);
  console.log('sync', JSON.stringify(r));
};
export const config = { schedule: '*/30 * * * *' };
