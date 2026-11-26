import { isDp } from './region.js';

const MAX_STR = 120;
const clean = (s, max = MAX_STR) => String(s ?? '').replace(/[\u0000-\u001f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

export class InputError extends Error {}

function validateArea(a) {
  const city = clean(a.city);
  if (city.length < 2) throw new InputError('Odaberi grad ili mjesto');
  const region = isDp(a.region) ? a.region : null;
  if (!region) throw new InputError('Za ovo mjesto ne možemo odrediti područje');
  const parts = (Array.isArray(a.parts) ? a.parts : []).slice(0, 40).map((p) => clean(p, 60)).filter(Boolean);
  const id = /^[a-z0-9]{6,24}$/.test(a.id ?? '') ? a.id : null;
  return { id, kind: 'area', label: clean(a.label, 40) || city, street: '', number: '', city, places: [], parts, strict: !!a.strict, region };
}

export function validateAddress(a) {
  if (!a || typeof a !== 'object') throw new InputError('Neispravna adresa');
  if (a.kind === 'area') return validateArea(a);
  const street = clean(a.street);
  const city = clean(a.city);
  if (street.length < 2 || city.length < 2) throw new InputError('Upiši grad i ulicu');
  const number = clean(a.number, 10);
  if (number && !/^\d{1,4}\s?[a-zA-Z]?$/.test(number)) throw new InputError('Kućni broj nije ispravan (npr. 12 ili 12a)');
  const places = Array.isArray(a.places) ? a.places.slice(0, 6).map((p) => clean(p, 60)).filter(Boolean) : [];
  const region = isDp(a.region) ? a.region : null;
  const id = /^[a-z0-9]{6,24}$/.test(a.id ?? '') ? a.id : null;
  return { id, label: clean(a.label, 40) || 'Adresa', street, number, city, places, region };
}

export function validateAddresses(list, max = 12) {
  if (!Array.isArray(list) || list.length === 0 || list.length > max) throw new InputError(`Moguće je spremiti 1–${max} gradova ili adresa`);
  return list.map(validateAddress);
}

export function validateSubscription(sub) {
  const ep = sub?.endpoint;
  if (typeof ep !== 'string' || ep.length > 600 || !/^https:\/\//.test(ep)) throw new InputError('Neispravna pretplata');
  const p256dh = sub?.keys?.p256dh;
  const auth = sub?.keys?.auth;
  if (typeof p256dh !== 'string' || typeof auth !== 'string' || p256dh.length > 200 || auth.length > 50) throw new InputError('Neispravna pretplata');
  return { endpoint: ep, keys: { p256dh, auth } };
}

export async function readJson(req, maxBytes = 8192) {
  const text = await req.text();
  if (text.length > maxBytes) throw new InputError('Zahtjev je prevelik');
  try { return JSON.parse(text); } catch { throw new InputError('Neispravan JSON'); }
}
