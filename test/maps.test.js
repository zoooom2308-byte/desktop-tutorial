import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMapLinks, mapsUrl } from '../lib/maps.js';

const q = (url) => decodeURIComponent(new URL(url).searchParams.get('query'));

test('mapsUrl: ispravna Google Maps poveznica s hrvatskim slovima', () => {
  const u = mapsUrl('Školjić 13, Rijeka');
  assert.match(u, /^https:\/\/www\.google\.com\/maps\/search\/\?api=1&query=/);
  assert.equal(q(u), 'Školjić 13, Rijeka, Hrvatska');
});

test('HEP popis ulica: po jedna poveznica, prvi broj iz raspona, grad i mjesto', () => {
  const r = buildMapLinks({ place: 'ZAGREB', streets: 'JABLANOVEČKA 40, 47-57 nep, LABINSKA 2-12 par' }, { city: 'Zagreb' });
  assert.equal(r.links.length, 2);
  assert.equal(r.links[0].label, 'Jablanovečka 40, 47–57 (neparni)');
  assert.equal(q(r.links[0].url), 'Jablanovečka 40, Zagreb, Hrvatska');
  assert.equal(q(r.links[1].url), 'Labinska 2, Zagreb, Hrvatska');
});

test('Rijeka natuknice s "br." i parnim rasponom', () => {
  const r = buildMapLinks({ place: 'RIJEKA', streets: '- Portić br. 1, 2, 3, 8 - 26 (parni brojevi)\n- Istarska br. BB' }, { city: 'Rijeka' });
  assert.equal(r.links.length, 2);
  assert.equal(q(r.links[0].url), 'Portić 1, Rijeka, Hrvatska');
  assert.equal(q(r.links[1].url), 'Istarska, Rijeka, Hrvatska');
});

test('kvart + grad: Špansko, Zagreb; cijela ulica bez broja', () => {
  const r = buildMapLinks({ place: 'ŠPANSKO', streets: 'MILANA REŠETARA' }, { city: 'Zagreb' });
  assert.equal(q(r.links[0].url), 'Milana Rešetara, Špansko, Zagreb, Hrvatska');
});

test('samo područje (ViK Split): poveznica na područje i grad', () => {
  const r = buildMapLinks({ place: 'SPLITA', streets: 'naselja: Meja' }, { city: 'Split' });
  assert.equal(r.links.length, 1); assert.equal(q(r.links[0].url), 'Meja, Split, Hrvatska');
});

test('prazna ulica: vodi na mjesto; puno ulica se ograničava', () => {
  assert.equal(q(buildMapLinks({ place: 'Vodice,Predošćica.', streets: '.' }, { city: 'Rijeka' }).links[0].url), 'Vodice, Rijeka, Hrvatska');
  const many = buildMapLinks({ place: 'ZAGREB', streets: ['ALFA','BRAVO','CHARLIE','DELTA','ECHO','FOXTROT','GOLF','HOTEL','INDIA','JULIET','KILO','LIMA'].map((n) => `${n} 1-9`).join(', ') }, { city: 'Zagreb' }, 8);
  assert.equal(many.links.length, 8); assert.equal(many.more, 4);
});

test('zlonamjerni tekst iz izvora ostaje samo parametar upita (nema umetanja)', () => {
  const r = buildMapLinks({ place: 'X', streets: 'A&query=evil#frag <script>1</script> 5' }, { city: 'Zagreb' });
  for (const l of r.links) { const u = new URL(l.url); assert.equal(u.hostname, 'www.google.com'); assert.equal([...u.searchParams.keys()].join(), 'api,query'); assert.equal(u.hash, ''); }
});
