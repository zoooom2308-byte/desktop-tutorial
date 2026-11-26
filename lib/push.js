import webpush from 'web-push';

/** VAPID ključevi: iz env varijabli ako postoje, inače se generiraju jednom na serveru i spremaju u Blobs (nikad u kodu). */
export async function getVapid(store) {
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    return { publicKey: process.env.VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY };
  }
  let keys = await store.getJSON('config/vapid');
  if (!keys) {
    keys = webpush.generateVAPIDKeys();
    await store.setJSON('config/vapid', keys);
  }
  return keys;
}

export async function sendPush(store, sub, payload) {
  const keys = await getVapid(store);
  const subject = process.env.VAPID_SUBJECT || process.env.SITE_URL || 'https://zoooom2308-byte.github.io/desktop-tutorial/';
  try {
    await webpush.sendNotification(sub, JSON.stringify(payload), {
      vapidDetails: { subject, publicKey: keys.publicKey, privateKey: keys.privateKey },
      TTL: 6 * 3600,
      urgency: 'high',
      ...(process.env.NR_PUSH_PROXY ? { proxy: process.env.NR_PUSH_PROXY } : {}),
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, gone: e.statusCode === 404 || e.statusCode === 410, status: e.statusCode, error: String(e.body || e.message).slice(0, 200) };
  }
}
