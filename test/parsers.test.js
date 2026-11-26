import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseHepPage, parseHepUnits, parseHepAreas } from '../lib/parsers/hep-ods.js';
import { parseVioTable, parseVioArticle, parseVioList } from '../lib/parsers/vio.js';
import { parsePlinaraNotice } from '../lib/parsers/plinara.js';

const f = (n) => fs.readFileSync(new URL(`./fixtures/${n}`, import.meta.url), 'utf8');

test('HEP ODS: čita stvarne najave (stvarni snimak stranice)', () => {
  const a = parseHepPage(f('hep-ods-zagreb.html'), { dp: 'zagreb', el: 'ZG' });
  assert.ok(a.length >= 3);
  assert.equal(a[0].type, 'struja');
  assert.match(a[0].streets, /MERŠIĆA/);
  assert.equal(a[0].start, '2026-11-27T08:00:00.000Z'); // 09:00 CET
  assert.equal(a[0].end, '2026-11-27T13:00:00.000Z');
  assert.match(a[0].url, /^https:\/\/www\.hep\.hr\/ods\/bez-struje\/19\?dp=zagreb/);
});

test('HEP ODS: popis elektri i terenskih jedinica', () => {
  assert.equal(parseHepAreas(f('hep-ods-zagreb.html')).length, 20);
  assert.ok(parseHepUnits(f('hep-ods-zagreb.html')).some((u) => u.el === 'ZG'));
});

test('ViO: tablica prekida, završene se preskaču', () => {
  const a = parseVioTable(f('vio-1833.html'));
  assert.ok(a.length >= 1);
  assert.ok(a.every((x) => x.type === 'voda' && !/ZAVRŠENO/.test(x.note)));
  assert.equal(a[0].streets, 'MILANA REŠETARA');
});

test('ViO: članak s popisom ulica', () => {
  const a = parseVioArticle(f('vio-2338.html'), 'https://www.vio.hr/x');
  assert.equal(a.place, 'Cerje');
  assert.match(a.streets, /Stanka Šatovića/);
  assert.equal(a.start, '2026-11-27T07:00:00.000Z');
  assert.equal(a.end, '2026-11-27T10:00:00.000Z');
});

test('ViO: popis obavijesti', () => {
  assert.ok(parseVioList(f('vio-obavijesti.html')).length >= 3);
});

test('Plinara: obavijest o obustavi plina', () => {
  const a = parsePlinaraNotice(f('plinara-neboder.html'), 'https://www.plinara-zagreb.hr/x');
  assert.equal(a.type, 'plin');
  assert.equal(a.streets, 'RADNIČKA CESTA 1');
  assert.equal(a.place, 'ZAGREB');
  assert.equal(a.allDay, true);
});
