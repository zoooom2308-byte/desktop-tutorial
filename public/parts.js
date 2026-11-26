// Poznati dijelovi najvećih hrvatskih gradova (kvartovi, četvrti, veća naselja). Za ostala mjesta dijelovi se
// dohvaćaju iz OpenStreetMapa i iz najava koje izvori trenutno objavljuju.
const P = {
  zagreb: ['Donji grad', 'Gornji grad – Medveščak', 'Trnje', 'Maksimir', 'Peščenica – Žitnjak', 'Novi Zagreb – istok', 'Novi Zagreb – zapad', 'Trešnjevka – sjever', 'Trešnjevka – jug', 'Črnomerec', 'Gornja Dubrava', 'Donja Dubrava', 'Stenjevec', 'Podsused – Vrapče', 'Podsljeme', 'Sesvete', 'Brezovica', 'Špansko', 'Malešnica', 'Gajnice', 'Kustošija', 'Jarun', 'Savski gaj', 'Sopot', 'Dugave', 'Travno', 'Retkovec', 'Dubec', 'Cerje', 'Siget', 'Trnsko', 'Zapruđe', 'Folnegovićevo naselje', 'Knežija', 'Ferenščica', 'Volovčica', 'Remetinec', 'Jakuševec', 'Botinec', 'Lanište', 'Kajzerica', 'Vrbani', 'Bukovac', 'Rudeš', 'Prečko', 'Blato', 'Borongaj', 'Ravnice', 'Šestine', 'Gračani', 'Remete', 'Resnik', 'Odra', 'Lučko', 'Trnava', 'Sigečica', 'Staro Pešćenica'],
  rijeka: ['Centar', 'Sušak', 'Trsat', 'Pećine', 'Krnjevo', 'Kantrida', 'Turnić', 'Vojak', 'Zamet', 'Podmurvice', 'Škurinje', 'Kozala', 'Gornja Drenova', 'Donja Drenova', 'Srdoči', 'Pehlin', 'Martinkovac', 'Orehovica', 'Banderovo', 'Mlaka', 'Pulac', 'Sveti Kuzam', 'Belveder', 'Brajda', 'Rujevica', 'Pašac', 'Gornji Zamet'],
  split: ['Meje', 'Bačvice', 'Žnjan', 'Firule', 'Spinut', 'Veli Varoš', 'Lučac', 'Manuš', 'Dobri', 'Mejaši', 'Kman', 'Gripe', 'Varoš', 'Brda', 'Ravne njive', 'Visoka', 'Pazdigrad', 'Plokite', 'Neslanovac', 'Stobreč', 'Kila', 'Žrnovnica', 'Srinjine', 'Dračevac', 'Sirobuja', 'Mertojak', 'Sućidar', 'Skalice', 'Trstenik', 'Blatine', 'Škrape', 'Lovret', 'Radunica', 'Poljud', 'Kocunar', 'Vranjic', 'Duilovo', 'Dujmovača', 'Sukoišan'],
  osijek: ['Donji grad', 'Gornji grad', 'Tvrđa', 'Retfala', 'Josipovac', 'Sarvaš', 'Nemetin', 'Jug II', 'Novi grad', 'Višnjevac', 'Brijest', 'Industrijska četvrt', 'Zeleno polje', 'Cvjetno naselje', 'Vijenac', 'Podravlje'],
  zadar: ['Borik', 'Arbanasi', 'Bili brig', 'Brodarica', 'Diklo', 'Kolovare', 'Poluotok', 'Ričine', 'Višnjik', 'Voštarnica', 'Smiljevac', 'Stanovi', 'Puntamika', 'Vidikovac', 'Gaženica', 'Crvene kuće', 'Petrići', 'Ploča', 'Relja'],
  pula: ['Veruda', 'Stoja', 'Valdebek', 'Šijana', 'Monte Zaro', 'Kaštanjer', 'Vidikovac', 'Monvidal', 'Veli Vrh', 'Busoler', 'Šikići', 'Gregovica', 'Valkane', 'Štinjan', 'Premantura', 'Vintijan', 'Sveta Katarina', 'Kaštel'],
  karlovac: ['Banija', 'Dubovac', 'Gaza', 'Mala Švarča', 'Rakovac', 'Turanj', 'Zvijezda', 'Grabrik', 'Švarča', 'Novi centar', 'Mekušje', 'Hrnetić'],
  varazdin: ['Centar', 'Banfica', 'Biškupec', 'Jalkovec', 'Sračinec', 'Gojanec', 'Bilopolje', 'Zakičnica', 'Kolodvor', 'Optujska'],
  sibenik: ['Meterize', 'Baldekin', 'Crnica', 'Ražine', 'Šubićevac', 'Vidici', 'Dolac', 'Zablaće', 'Brodarica', 'Mandalina', 'Vrpolje'],
  dubrovnik: ['Lapad', 'Gruž', 'Ploče', 'Pile', 'Babin Kuk', 'Mokošica', 'Montovjerna', 'Boninovo', 'Komolac', 'Rožat', 'Orašac', 'Zaton'],
  'velika gorica': ['Kurilovec', 'Lukavec', 'Mičevec', 'Novo Čiče', 'Kobilić', 'Buševec', 'Ribnica', 'Donja Lomnica', 'Gornja Lomnica'],
  'slavonski brod': ['Podvinje', 'Brodsko Vinogorje', 'Gornja Vrba', 'Ruščica', 'Brodski Varoš', 'Bukovlje', 'Sibinj'],
};
export const staticParts = (city) => P[String(city).toLowerCase().normalize('NFC').trim()] ?? [];
