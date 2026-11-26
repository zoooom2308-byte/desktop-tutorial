import { zagrebToDate, zagrebYmd, addDaysYmd } from './time.js';

/**
 * Koje obavijesti za najavu `ann` (s `start` kao ISO string) treba poslati u trenutku `now`.
 * Vrste: 'new' (čim se pojavi), 'eve' (večer prije u 19:00), 'hour' (sat prije početka).
 * `sent` je Set ključeva već poslanih vrsta za tu najavu i pretplatu.
 * `firstSeen` je ISO vrijeme kad je najava prvi put viđena.
 * Vraća popis vrsta koje su dospjele; pošalje se JEDNA obavijest (prva vrsta), a sve se označe kao poslane,
 * tako da se ista najava ne ponavlja (npr. nova najava sat vremena prije početka).
 */
export function dueKinds(now, ann, sent, firstSeen) {
  const start = new Date(ann.start);
  const end = ann.end ? new Date(ann.end) : start;
  if (Number.isNaN(start.getTime()) || now >= end) return [];
  const due = [];
  if (!sent.has('new')) due.push('new');
  const eveAt = zagrebToDate(addDaysYmd(zagrebYmd(start), -1), '19:00');
  // 'eve': od 19:00 prethodne večeri do početka radova; ako je najava viđena nakon 19:00, 'new' već pokriva večer
  if (!sent.has('eve') && now >= eveAt && now < start && new Date(firstSeen) < eveAt) due.push('eve');
  const hourAt = new Date(start.getTime() - 60 * 60 * 1000);
  if (!sent.has('hour') && now >= hourAt && now < start && !ann.allDay) due.push('hour');
  return due;
}

export function sentKey(subId, annId, kind) {
  return `${subId}.${annId}.${kind}`;
}
