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

// ---- stvarni zapisi iz primorja i otoka (HEP ODS, Elektroprimorje Rijeka, 26.–27.11.2026.)
const rij = (streets, place = 'RIJEKA') => ({ source: 'hep-ods', region: 'rijeka', place, streets });
const ra = (street, number = '', city = 'Rijeka', extra = {}) => ({ street, number, city, places: [], region: 'rijeka', ...extra });
const RIJEKA_CASES = [
  ['Rijeka: natuknice s crticom, br. i parni', rij('- Portić br. 1, 2, 3, 4, 5, 8 - 26 (parni brojevi)\n- Istarska br. BB'), ra('Portić', '12'), 'exact'],
  ['Rijeka: pojedinačni broj s popisa', rij('- Portić br. 1, 2, 3, 4, 5, 8 - 26 (parni brojevi)\n- Istarska br. BB'), ra('Portić', '3'), 'exact'],
  ['Rijeka: neparni broj unutar parnog raspona ne pogađa', rij('- Portić br. 1, 2, 3, 4, 5, 8 - 26 (parni brojevi)\n- Istarska br. BB'), ra('Portić', '9'), null],
  ['Rijeka: druga natuknica (BB = bez broja)', rij('- Portić br. 1, 2, 3, 4, 5, 8 - 26 (parni brojevi)\n- Istarska br. BB'), ra('Istarska', '7'), 'exact'],
  ['Rijeka: Petra Jurčića 24A (sufiks)', rij('- Petra Jurčića br. 24, 24A\n- Bože Vidasa br. 7 (neboder), 14\n- Ivana Lenca br. 2 - 12 (parni brojevi)'), ra('Petra Jurčića', '24'), 'exact'],
  ['Rijeka: Ivana Lenca parni raspon', rij('- Petra Jurčića br. 24, 24A\n- Bože Vidasa br. 7 (neboder), 14\n- Ivana Lenca br. 2 - 12 (parni brojevi)'), ra('Ivana Lenca', '8'), 'exact'],
  ['Rijeka: Ivana Lenca neparni ne pogađa', rij('- Petra Jurčića br. 24, 24A\n- Bože Vidasa br. 7 (neboder), 14\n- Ivana Lenca br. 2 - 12 (parni brojevi)'), ra('Ivana Lenca', '9'), null],
  ['Rijeka: Braće Bačić neparni + pojedinačni', rij('- Braće Bačić br. 1 - 13 (neparni brojevi), 6, 8, 10, 14'), ra('Braće Bačić', '10'), 'exact'],
  ['Rijeka: Braće Bačić 12 ne pogađa', rij('- Braće Bačić br. 1 - 13 (neparni brojevi), 6, 8, 10, 14'), ra('Braće Bačić', '12'), null],
  ['Rijeka: ista ulica, drugi grad (Lovran)', rij('šetalište Maršala Tita br. 19 - 27A (neparni brojevi), 31, 39, 46', 'LOVRAN'), ra('Šetalište Maršala Tita', '21', 'Rijeka'), null],
  ['Lovran: šetalište Maršala Tita 21', rij('šetalište Maršala Tita br. 19 - 27A (neparni brojevi), 31, 39, 46', 'LOVRAN'), ra('Šetalište Maršala Tita', '21', 'Lovran'), 'exact'],
  ['Lovran: 39 s popisa pojedinačnih', rij('šetalište Maršala Tita br. 19 - 27A (neparni brojevi), 31, 39, 46', 'LOVRAN'), ra('Šetalište Maršala Tita', '39', 'Lovran'), 'exact'],
  ['Lovran: 33 nije na popisu', rij('šetalište Maršala Tita br. 19 - 27A (neparni brojevi), 31, 39, 46', 'LOVRAN'), ra('Šetalište Maršala Tita', '33', 'Lovran'), null],
  ['Cres: popis naselja (Sv.Petar)', rij('naselja: Sv.Petar,Pojane,Ivanje', 'CRES'), ra('Glavna', '3', 'Sveti Petar', { places: ['Sveti Petar'] }), 'area'],
  ['Cres: naselje koje nije na popisu', rij('naselja: Sv.Petar,Pojane,Ivanje', 'CRES'), ra('Glavna', '3', 'Cres'), null],
  ['Naselja samo u polju mjesta (Vodice)', rij('.', 'Vodice,Predošćica.'), ra('Vodice 12', '', 'Vodice'), 'area'],
  ['Čabar: par. od kbr. 2-8, nep. od kbr. 1', rij('TRG KRALJA TOMISLAVA, ŽRTAVA FAŠIZMA, NARODNOG OSLOBOĐENJA,PETRA ZRINSKOG, TROPETI , IVANA GORANA KOVAČIĆA par. od kbr. 2-8 i nep. od kbr. 1', 'ČABAR'), ra('Ivana Gorana Kovačića', '4', 'Čabar'), 'exact'],
  ['Čabar: cijela ulica bez brojeva', rij('TRG KRALJA TOMISLAVA, ŽRTAVA FAŠIZMA, NARODNOG OSLOBOĐENJA,PETRA ZRINSKOG, TROPETI , IVANA GORANA KOVAČIĆA par. od kbr. 2-8 i nep. od kbr. 1', 'ČABAR'), ra('Petra Zrinskog', '5', 'Čabar'), 'exact'],
  ['Čabar: nep. bez gornje granice = nesigurno', rij('IVANA GORANA KOVAČIĆA par. od kbr. 2-8 i nep. od kbr. 1', 'ČABAR'), ra('Ivana Gorana Kovačića', '9', 'Čabar'), 'street'],
  ['Mali Lošinj: od broja 3 do 19', rij('Bože Milanovića od broja 3 do 19 i od broja 2-18,Benzinska postaja INA Zagazinjine,Veloselska br.18 i 20 i Osorska br 1.', 'Mali Lošinj.'), ra('Bože Milanovića', '15', 'Mali Lošinj'), 'exact'],
  ['Mali Lošinj: Veloselska 20 (i 20)', rij('Bože Milanovića od broja 3 do 19 i od broja 2-18,Benzinska postaja INA Zagazinjine,Veloselska br.18 i 20 i Osorska br 1.', 'Mali Lošinj.'), ra('Veloselska', '20', 'Mali Lošinj'), 'exact'],
  ['Mali Lošinj: Osorska 1 nakon "i"', rij('Bože Milanovića od broja 3 do 19 i od broja 2-18,Benzinska postaja INA Zagazinjine,Veloselska br.18 i 20 i Osorska br 1.', 'Mali Lošinj.'), ra('Osorska', '1', 'Mali Lošinj'), 'exact'],
  ['Mali Lošinj: Osorska 5 ne pogađa', rij('Bože Milanovića od broja 3 do 19 i od broja 2-18,Benzinska postaja INA Zagazinjine,Veloselska br.18 i 20 i Osorska br 1.', 'Mali Lošinj.'), ra('Osorska', '5', 'Mali Lošinj'), null],
  ['Zagreb s naslovom naselja (Bijela Gorica:)', { region: 'zagreb', place: 'BIJELA GORICA, MARIJA GORICA, OPLAZNIK', streets: 'BIJELA GORICA:\nBREGOVITA ULICA 1-20 obje, ULICA ANTE KOVAČIĆA 1-7 nep,\nMARIJA GORICA:\nGORIČKA ULICA 12-14 par' }, addr('Goričke', '12', 'Marija Gorica', { places: ['Marija Gorica'] }), 'exact'],
  ['Zagreb: sufiksi 2/A i 1/D', hep('KOLEDOVČINA 2/A-8 par, 1/D, SLAVONSKA AVENIJA 26/1'), addr('Slavonska avenija', '26'), 'exact'],
  ['Dugo Selo: više mjesta u polju mjesta', { region: 'zagreb', place: 'MARTIN BRIJEG ,DUGO SELO', streets: 'DOMOBRANSKA 88-130 , 77-105 , JAREK 1-17' }, addr('Domobranska', '90', 'Dugo Selo'), 'exact'],
];
for (const [name, ann, a, expected] of RIJEKA_CASES) {
  test(`usporedba (HR): ${name}`, () => assert.equal(matchAnnouncement(ann, a), expected));
}

// ---- ostali stvarni formati (Osijek, Zadar, Pula, Split)
const reg = (region, place, streets) => ({ source: 'hep-ods', region, place, streets });
const FMT = [
  ['Split/Gata: "od br.:" pa neparni/parni rasponi', reg('split', 'Gata', 'Poljička cesta od br.:\nneparni 47 - 73\nparni 38 - 42'), ra('Poljička cesta', '51', 'Gata', { region: 'split' }), 'exact'],
  ['Split/Gata: parni raspon', reg('split', 'Gata', 'Poljička cesta od br.:\nneparni 47 - 73\nparni 38 - 42'), ra('Poljička cesta', '40', 'Gata', { region: 'split' }), 'exact'],
  ['Split/Gata: izvan raspona', reg('split', 'Gata', 'Poljička cesta od br.:\nneparni 47 - 73\nparni 38 - 42'), ra('Poljička cesta', '44', 'Gata', { region: 'split' }), null],
  ['Pula: kbr.51,51A,52 i kbr.53', reg('pula', 'Viškovići(Koromačno)', 'Viškovići kbr.51,51A,52 i kbr.53'), ra('Viškovići', '53', 'Viškovići', { region: 'pula' }), 'exact'],
  ['Pula: k.b. 17.', reg('pula', 'Rovinj', 'Ulica Driovier, k.b. 17.'), ra('Driovier', '17', 'Rovinj', { region: 'pula' }), 'exact'],
  ['Pula: k.b. 17 – drugi broj', reg('pula', 'Rovinj', 'Ulica Driovier, k.b. 17.'), ra('Driovier', '19', 'Rovinj', { region: 'pula' }), null],
  ['Split: "Od broja 213 - 313" bez ulice → naselje', reg('split', 'Vinjani Donji.', 'Od broja 213 - 313.'), ra('Glavna', '250', 'Vinjani Donji', { region: 'split' }), 'area'],
  ['Zadar: nejasan naziv (naselje ili ulica?) ne šalje obavijest svima u mjestu – poznato ograničenje', reg('zadar', 'Vir', 'Miljkovica XIV'), ra('Obala', '5', 'Vir', { region: 'zadar' }), null],
  ['Zadar: grad s jednom "ulicom" ne daje obavijest cijelom gradu', reg('zadar', 'Zadar', 'Celestine Medovića'), ra('Voštarnica', '5', 'Zadar', { region: 'zadar' }), null],
  ['Zadar: ulice u mjestu (Sukošan)', reg('zadar', 'Sukošan', 'Put Jankovca,Put Dijanovih'), ra('Put Jankovca', '3', 'Sukošan', { region: 'zadar' }), 'exact'],
  ['Osijek: ulica s rasponima u naselju Našice', reg('osijek', 'KEŠINCI', 'BALKANSKA 1-35/A, I. L. RIBARA 6-100, 1-91 nep'), ra('Balkanska', '17', 'Kešinci', { region: 'osijek' }), 'exact'],
  ['Osijek: 1-91 nep ne pogađa paran', reg('osijek', 'KEŠINCI', 'BALKANSKA 1-35/A, I. L. RIBARA 6-100, 1-91 nep'), ra('I. L. Ribara', '103', 'Kešinci', { region: 'osijek' }), null],
  ['Osijek: cijela naselja pred popisom', reg('osijek', 'GRADAC NAŠIČKI, LONDŽICA, ZOLJAN, NAŠICE', 'GRADAC NAŠIČKI, LONDŽICA, ZOLJAN; CIJELA NASELJA , NAŠICE: GAJIĆ 6-76 par, 1-79 nep'), ra('Glavna', '3', 'Londžica', { region: 'osijek' }), 'area'],
  ['Osijek: ulica u Našicama', reg('osijek', 'GRADAC NAŠIČKI, LONDŽICA, ZOLJAN, NAŠICE', 'GRADAC NAŠIČKI, LONDŽICA, ZOLJAN; CIJELA NASELJA , NAŠICE: GAJIĆ 6-76 par, 1-79 nep'), ra('Gajić', '21', 'Našice', { region: 'osijek' }), 'exact'],
];
for (const [name, ann, a, expected] of FMT) test(`usporedba (HR): ${name}`, () => assert.equal(matchAnnouncement(ann, a), expected));

test('stvarni lažni pogodak: "Centar" u Pinezićima (Krk) ne pogađa adresu u Rijeci', () => {
  const ann = { region: 'rijeka', place: 'PINEZIĆI', streets: 'Pava Žužića, Za dolci, Torkul, Krč, Lokvić, Centar, Trg Borisa Mršića, Njivine, Stari put' };
  assert.equal(matchAnnouncement(ann, { street: 'Ružićeva', number: '3', city: 'Rijeka', places: ['Centar', 'Rijeka'], region: 'rijeka' }), null);
  assert.equal(matchAnnouncement(ann, { street: 'Njivine', number: '3', city: 'Pinezići', places: [], region: 'rijeka' }), 'exact');
});
