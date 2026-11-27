# Objava u trgovine: što je gotovo, što moraš ti

## Android (Google Play)
**Gotovo u kodu:** `android/` je Trusted Web Activity (prava aplikacija koja otvara našu stranicu u Chromeu; Web Push obavijesti rade preko Chromea). Na GitHubu se automatski gradi testni APK (Releases → `android-latest`) i AAB za Google Play (Actions → artifact `najava-radova-android`).

**Moraš ti (računi i ključevi, što ja ne smijem ni mogu):**
1. **Google Play Console račun:** play.google.com/console, jednokratno oko 25 USD, uz provjeru identiteta. Za nove osobne račune Google traži zatvoreno testiranje s najmanje 12 testera tijekom 14 dana prije objave u produkciju (provjeri aktualna pravila).
2. **Vlastiti ključ za potpisivanje** (jednom, na svom računalu, i dobro ga spremi; bez njega nema nadogradnji):
   ```bash
   keytool -genkeypair -v -keystore najava-radova.keystore -alias najava -keyalg RSA -keysize 2048 -validity 10000
   base64 -w0 najava-radova.keystore > keystore.b64
   ```
   Zatim u GitHub repozitoriju: Settings → Secrets and variables → Actions → dodaj `KEYSTORE_BASE64` (sadržaj `keystore.b64`), `KEYSTORE_PASSWORD`, `KEY_ALIAS` (`najava`) i `KEY_PASSWORD`. Sljedeća izgradnja daje **potpisani** `app-release.aab`. Preporuka: u Play Consoleu uključi "Play App Signing".
3. **Ispuni obrazac u Play Consoleu** po `store/listing-hr.md` (opis, grafike, sigurnost podataka, ocjena sadržaja, URL politike privatnosti, tvoja e-pošta).
4. **Vlastita domena (preporučeno, oko 10 EUR godišnje):** bez nje se aplikacija otvara s trakom adrese preglednika jer GitHub Pages ne dopušta `/.well-known/assetlinks.json` za projektne stranice. S domenom (npr. najavaradova.hr): GitHub Pages → Custom domain, pa u `docs/.well-known/assetlinks.json` upiši:
   ```json
   [{"relation":["delegate_permission/common.handle_all_urls"],"target":{"namespace":"android_app","package_name":"hr.najavaradova.app","sha256_cert_fingerprints":["<SHA-256 iz Play Console → App signing>"]}}]
   ```
   i u `android/app/src/main/res/values/strings.xml` (`default_url`, `asset_statements`) i `AndroidManifest.xml` (host) zamijeni adresu domenom.
5. **Prvo izdanje:** Internal testing → Closed testing → Production.

## iPhone (App Store)
iPhone ne podržava ovaj pristup. Aplikacija na iPhonu ostaje **web-aplikacija** (Safari → Dijeli → Dodaj na početni zaslon; obavijesti iOS 16.4+). Prava iOS aplikacija traži Mac, Apple Developer račun (99 USD godišnje) i nativne push obavijesti preko APNs-a, uz novi kod. Isplati se tek ako web-inačica na iPhoneu pokaže problem ili trebaš widget bez Scriptablea.

## Zarada (kad dođe vrijeme)
- Kod već podržava gumb **"Podrži razvoj"**: pri izgradnji postavi adresu (npr. Buy Me a Coffee) i vidjet će se: `NR_SUPPORT_URL=https://... node scripts/build-pages.mjs`.
- Reklame namjerno nisu ugrađene: u EU traže certificirani sustav privole (CMP) i kvare povjerenje u aplikaciji čija je vrijednost pouzdana obavijest.
- Naplata (pretplata, tvrtke) traži: Google Payments profil, registriran obrt ili tvrtku, porezne obveze, i prije toga dopuštenje izvora podataka.

## Prije zarade obavezno
- **Dopuštenje izvora podataka:** pošalji zahtjev po `notes/zahtjev-za-dopustenje.md` HEP-u ODS, Gradu Rijeci, ViO-u, ViK-u Split i Gradskoj plinari.
- **Adrese:** javni Nominatim ne smije se koristiti za veliki komercijalni promet; za više korisnika treba vlastiti ili plaćeni geokoder.
- **Kapacitet:** besplatne razine (Supabase, GitHub) imaju ograničenja; za tisuće korisnika treba plaćeni plan.
- **Identitet voditelja obrade** u politici privatnosti: dopuni stvarnim imenom/tvrtkom.

## Karta radova: ograničenja za veći promet
- Pločice karte dolaze s javnog OpenStreetMap poslužitelja (tile.openstreetmap.org). Njihova pravila dopuštaju umjerenu upotrebu uz navedeno autorstvo; za mnogo korisnika treba komercijalni davatelj pločica (npr. MapTiler, Stadia, Mapbox) s vlastitim ključem.
- Koordinate ulica određuje preglednik preko Nominatima (1 upit u sekundi po korisniku), jer javni geokoderi blokiraju poslužiteljske adrese. Za veći promet treba plaćeni geokoder na poslužitelju (kod je pripremljen u `lib/geocode.js`).
