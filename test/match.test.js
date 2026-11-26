import test from 'node:test';
import assert from 'node:assert/strict';
import { matchAnnouncement, parseStreetList } from '../lib/match.js';

const hep = (streets, place = 'ZAGREB') => ({ source: 'hep-ods', region: 'zagreb', place, streets });
const addr = (street, number = '', city = 'Zagreb', extra = {}) => ({ street, number, city, places: [], region: 'zagreb', ...extra });

// [naslov, najava, adresa, očekivano]  ('exact' | 'street' | null)
const CASES = [
  // --- stvarne najave HEP ODS (Zagreb, 27.11.2026.) ---
  ['raspon obje: unutar', hep('ULICA MATE MERŠIĆA 1-8 obje'), addr('Mate Meršića', '5'), 'exact'],
  ['raspon obje: izvan', hep('ULICA MATE MERŠIĆA 1-8 obje'), addr('Mate Meršića', '12'), null],
  ['bez diakritika u upitu', hep('ULICA MATE MERŠIĆA 1-8 obje'), addr('Mate Mersica', '3'), 'exact'],
  ['prefiks "Ulica" u upitu', hep('ULICA MATE MERŠIĆA 1-8 obje'), addr('Ulica Mate Meršića', '3'), 'exact'],
  ['kratica "Ul."', hep('ULICA MATE MERŠIĆA 1-8 obje'), addr('Ul. Mate Meršića', '3'), 'exact'],
  ['do kraja: broj iznad', hep('OREŠIĆI 9-do kraja obje'), addr('Orešići', '30'), 'exact'],
  ['do kraja: broj ispod', hep('OREŠIĆI 9-do kraja obje'), addr('Orešići', '7'), null],
  ['neparni: pogodak', hep('JABLANOVEČKA 40, 47-57 nep, LABINSKA 2-12 par'), addr('Jablanovečka', '51'), 'exact'],
  ['neparni: paran broj ne pogađa', hep('JABLANOVEČKA 40, 47-57 nep, LABINSKA 2-12 par'), addr('Jablanovečka', '50'), null],
  ['pojedinačni broj 40', hep('JABLANOVEČKA 40, 47-57 nep'), addr('Jablanovečka', '40'), 'exact'],
  ['pojedinačni broj 42 ne pogađa', hep('JABLANOVEČKA 40, 47-57 nep'), addr('Jablanovečka', '42'), null],
  ['druga ulica na popisu: parni', hep('JABLANOVEČKA 40, LABINSKA 2-12 par, LOŠINJSKA 20-do kraja par, 23-33 nep'), addr('Labinska', '8'), 'exact'],
  ['druga ulica: neparni izvan', hep('JABLANOVEČKA 40, LABINSKA 2-12 par, LOŠINJSKA 20-do kraja par, 23-33 nep'), addr('Labinska', '7'), null],
  ['više raspona iste ulice (nep)', hep('LOŠINJSKA 20-do kraja par, 23-33 nep'), addr('Lošinjska', '25'), 'exact'],
  ['više raspona iste ulice (par)', hep('LOŠINJSKA 20-do kraja par, 23-33 nep'), addr('Lošinjska', '100'), 'exact'],
  ['više raspona: nep izvan', hep('LOŠINJSKA 20-do kraja par, 23-33 nep'), addr('Lošinjska', '35'), null],
  ['dvočlani naziv + parni/neparni', hep('VJEKOSLAVA SPINČIĆA 34-42 par, 31-41 nep'), addr('Vjekoslava Spinčića', '33'), 'exact'],
  ['dvočlani naziv: izvan', hep('VJEKOSLAVA SPINČIĆA 34-42 par, 31-41 nep'), addr('Vjekoslava Spinčića', '44'), null],
  ['Vladimira Gortana nep', hep('VLADIMIRA GORTANA 22-36 par, 21-33 nep'), addr('Vladimira Gortana', '21'), 'exact'],
  // --- ne treba pogodak ---
  ['druga ulica', hep('ILICA 1-55 nep'), addr('Vlaška', '5'), null],
  ['slična ulica (Ilica vs Ilička)', hep('ILICA 1-55 nep'), addr('Ilička', '5'), null],
  ['drugi grad, druga regija', { ...hep('ILICA 1-55 nep'), place: 'ZAGREB' }, addr('Ilica', '5', 'Split', { region: 'split' }), null],
  ['isti naziv, druga regija (Osijek)', hep('ILICA 1-55 nep'), addr('Ilica', '5', 'Osijek', { region: 'osijek' }), null],
  ['prazna ulica', hep('ILICA 1-55 nep'), addr('', '5'), null],
  // --- nesigurno: ipak javi ("provjeri broj") ---
  ['bez kućnog broja u adresi', hep('ILICA 1-55 nep'), addr('Ilica'), 'street'],
  ['kućni broj sa slovom (12a)', hep('ILICA 1-55 nep'), addr('Ilica', '13a'), 'street'],
  ['mjesto u najavi je kvart, regija ista', { ...hep('MILANA REŠETARA'), place: 'ŠPANSKO' }, addr('Milana Rešetara', '4'), 'street'],
  ['cijela ulica (bez brojeva)', hep('GLAVNIČICA'), addr('Glavničica', '17'), 'exact'],
  // --- padeži i kratice ---
  ['lokativ (u Ilici)', hep('ILICA 1-55 nep'), addr('Ilici', '5'), 'exact'],
  ['genitiv ženski (Radničke ceste)', hep('RADNIČKA CESTA 1'), addr('Radničke ceste', '1'), 'exact'],
  ['Trg (kratica i veličina slova)', hep('TRG BANA JOSIPA JELAČIĆA 1-10'), addr('TRG BANA JOSIPA JELAČIĆA', '4'), 'exact'],
  ['Kneza Branimira (genitiv)', hep('KNEZA BRANIMIRA 3-9 nep'), addr('Kneza Branimira', '7'), 'exact'],
  ['Sv. -> sveti', hep('SVETI MARTIN POD OKIĆEM'), addr('Sv. Martin pod Okićem'), 'exact'],
  ['đ/dj: Đorđićeva', hep('ĐORĐIĆEVA 2-20 par'), addr('Dordiceva', '10'), 'exact'],
  ['č/ć/ž/š/đ: Otona Župančića', hep('OTONA ŽUPANČIĆA'), addr('Otona Zupancica', '3'), 'exact'],
  ['množina: Cerska', hep('CERSKA, PODOLNICA'), addr('Podolnica', '3', 'Zagreb', { places: ['Cerje'] }), 'exact'],
  ['ime mjesta kao dodatak (Sesvete)', { ...hep('STANKA ŠATOVIĆA', 'CERJE'), region: 'zagreb' }, addr('Stanka Šatovića', '2', 'Zagreb', { places: ['Cerje', 'Sesvete'] }), 'exact'],
];

for (const [name, ann, a, expected] of CASES) {
  test(`usporedba: ${name}`, () => {
    assert.equal(matchAnnouncement(ann, a), expected);
  });
}

test('parseStreetList razdvaja ulice i raspone', () => {
  const r = parseStreetList('JABLANOVEČKA 40, 47-57 nep, LABINSKA 2-12 par, LOŠINJSKA 20-do kraja par, 23-33 nep');
  assert.equal(r.length, 3);
  assert.deepEqual(r[0].ranges, [{ from: 40, to: 40, parity: 'both' }, { from: 47, to: 57, parity: 'odd' }]);
  assert.deepEqual(r[2].ranges, [{ from: 20, to: Infinity, parity: 'even' }, { from: 23, to: 33, parity: 'odd' }]);
});

test('najmanje 30 primjera usporedbe', () => assert.ok(CASES.length >= 30));
