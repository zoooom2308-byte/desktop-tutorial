// Napravi jednokratni kod za postavljanje admin lozinke i ispiši SQL koji ga sprema (spremaju se samo sažetak i rok).
import { randomBytes } from 'node:crypto';
import { setupRecord } from '../lib/admin.js';
const code = randomBytes(12).toString('hex');
const rec = setupRecord(code);
console.log('KOD:', code);
console.log(`SQL: insert into public.kv (key, value) values ('admin/setup', '${JSON.stringify(rec)}'::jsonb) on conflict (key) do update set value = excluded.value, updated_at = now();`);
