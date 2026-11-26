import { openStore } from '../../lib/store.js';
import { runNotifications } from '../../lib/notify.js';

export default async () => {
  const store = await openStore();
  const r = await runNotifications(store, { siteUrl: process.env.URL || '/' });
  console.log('notify', JSON.stringify(r));
};
export const config = { schedule: '*/10 * * * *' };
