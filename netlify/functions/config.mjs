import { openStore } from '../../lib/store.js';
import { getVapid } from '../../lib/push.js';
import { json } from '../../lib/http.js';

export default async () => {
  const store = await openStore();
  const { publicKey } = await getVapid(store);
  return json({ vapidPublicKey: publicKey });
};
export const config = { path: '/api/config' };
