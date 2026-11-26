import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseRijekaNotices, parseScopeUnit, parseTimes } from '../lib/parsers/rijeka.js';
import { parseVikSplitNotice, parseVikSplitList } from '../lib/parsers/vik-split.js';
import { matchAnnouncement } from '../lib/match.js';

const f = (n) => fs.readFileSync(new URL(`./fixtures/${n}`, import.meta.url), 'utf8');
const addr = (street, number, city, region, places = []) => ({ street, number, city, places, region });

test('Rijeka RCC: vrijeme i područje interesa', () => {
  assert.deepEqual(parseTimes('8-12'), [8, 0, 12, 0]);
  assert.deepEqual(parseTimes('14:00-16:00'), [14, 0, 16, 0]);
  assert.deepEqual(parseTimes('08:00 - 11:00'), [8, 0, 11, 0]);
  assert.equal(parseTimes(null), null);
  assert.deepEqual(parseScopeUnit('JLS Rijeka, naselje Rijeka, ulica IVANA LENCA, k.br. 7,9'), { jls: 'Rijeka', naselje: 'Rijeka', ulica: 'IVANA LENCA', brojevi: '7,9' });
});

test('Rijeka RCC: čita stvarni snimak (voda, više općina)', () => {
  const a = parseRijekaNotices(f('rijeka-notices.json'));
  assert.ok(a.length >= 8);
  assert.ok(a.every((x) => x.region === 'rijeka' && ['voda', 'struja', 'plin', 'grijanje', 'ceste'].includes(x.type)));
  const lenca = a.find((x) => /IVANA LENCA/.test(x.streets));
  assert.equal(lenca.type, 'voda'); assert.equal(lenca.place, 'Rijeka');
  assert.ok(a.some((x) => x.place === 'Viškovo') && a.some((x) => x.place === 'Dražice'));
  assert.ok(!a.some((x) => /stajali/i.test(x.title))); // javni prijevoz se ne uključuje
});

test('Rijeka RCC: adresa u ulici s vodom – točan broj, tuđi broj, druga ulica', () => {
  const a = parseRijekaNotices(f('rijeka-notices.json'));
  const hit = (ad) => a.map((x) => matchAnnouncement(x, ad)).filter(Boolean);
  assert.deepEqual(hit(addr('Ivana Lenca', '7', 'Rijeka', 'rijeka')), ['exact']);
  assert.deepEqual(hit(addr('Ivana Lenca', '9', 'Rijeka', 'rijeka')), ['exact']);
  assert.deepEqual(hit(addr('Ivana Lenca', '8', 'Rijeka', 'rijeka')), []);
  assert.deepEqual(hit(addr('Ružićeva', '14', 'Rijeka', 'rijeka')), ['exact']); // k.br. SVI
  assert.deepEqual(hit(addr('Školjić', '15', 'Rijeka', 'rijeka')), ['exact']); // 13-16
  assert.deepEqual(hit(addr('Školjić', '5', 'Rijeka', 'rijeka')), []);
  assert.deepEqual(hit(addr('Ružićeva', '14', 'Zagreb', 'zagreb')), []);
});

test('ViK Split: obavijest po području (bez ulica) -> area', () => {
  const a = parseVikSplitNotice(f('vik-split-obavijest.html'), 'https://www.vik-split.hr/x');
  assert.equal(a.length, 1);
  assert.equal(a[0].type, 'voda'); assert.equal(a[0].region, 'split');
  assert.equal(a[0].place, 'SPLITA');
  assert.equal(a[0].start, '2026-11-05T22:00:00.000Z'); // 23:00 CET
  assert.equal(a[0].end, '2026-11-06T02:00:00.000Z');   // 03:00 sljedećeg dana
  assert.equal(matchAnnouncement(a[0], addr('Put Meja', '3', 'Split', 'split', ['Meje'])), 'area');
  assert.equal(matchAnnouncement(a[0], addr('Marmontova', '3', 'Split', 'split', ['Grad', 'Središte'])), null);
  assert.equal(matchAnnouncement(a[0], addr('Meja', '3', 'Zagreb', 'zagreb')), null);
});

test('ViK Split: popis obavijesti', () => {
  assert.ok(parseVikSplitList(f('vik-split-popis.html')).length >= 10);
});
