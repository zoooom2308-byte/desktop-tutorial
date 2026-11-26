# Izvori podataka (provjereno 26.11.2026.)

| Izvor | Format | Ažuriranje | robots.txt / uvjeti | Status |
|---|---|---|---|---|
| **HEP ODS – Bez struje** (`hep.hr/ods/bez-struje/19?dp=…&el=…&datum=…`), 20 distribucijskih područja | Server-renderirani HTML, po danu i terenskoj jedinici; ulice s rasponima ("JABLANOVEČKA 40, 47-57 nep") | tijekom dana, najave 1–6 dana unaprijed | robots.txt: `Disallow:` (sve dopušteno) | **Pouzdano, automatski (cijela Hrvatska)** |
| **ViO Zagreb** – tablica "Aktualne obavijesti" + članci | HTML tablica (datum, ulica, naselje, vrijeme, status) i članci s popisom ulica | tijekom dana | nema robots.txt (404) | **Pouzdano, automatski (Zagreb)** |
| **Gradska plinara Zagreb** – obavijesti | HTML članak ("ZONA OBUHVATA RADOVA"); točno vrijeme je u .doc privitku | povremeno | nema robots.txt (404) | **Djelomično** (datum i ulica da, sat ne – cijeli dan) |
| **HEP Toplinarstvo** | Nema strukturiranog popisa; obavijesti su vijesti/PDF, projekt vrelovoda je završen | – | – | **Preskočeno** (nepouzdano čitanje) |
| **Zagreb – regulacija prometa** (zagreb.hr) | Nije pronađen strukturirani izvor; robots.txt 404 | – | – | **Preskočeno** |
| **Vodovodi Split, Rijeka, Osijek; ostali plinski distributeri** | Nisu istraženi | – | – | **Nije pokriveno** |

Dohvaćanje: svakih 30 min (Netlify Scheduled Function), samo za regije u kojima postoje korisnici, najviše 30 zahtjeva po pokretanju, razmak ≥700 ms, ETag/If-Modified-Since, cache 45 min, User-Agent `NajavaRadova/1.0 (…)` bez osobnih podataka.
