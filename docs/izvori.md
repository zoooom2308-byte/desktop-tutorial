# Izvori podataka (provjereno 26.11.2026.)

Sve se čita automatski, pristojno: opisni User-Agent bez osobnih podataka, razmak ≥700 ms, ETag/If-Modified-Since, cache 20–45 min, najviše 24 zahtjeva i 22 s po pokretanju (Netlify scheduled function svakih 15 min), i to samo za regije u kojima postoje korisnici.

| Izvor | Pokriva | Format | robots.txt | Status |
|---|---|---|---|---|
| **HEP ODS – Bez struje** (`hep.hr/ods/bez-struje/19`) | struja, **cijela Hrvatska** (20 područja, sve terenske jedinice) | HTML po danu i jedinici; slobodan tekst ulica i raspona (formati se razlikuju po elektri) | sve dopušteno | **Pouzdano** |
| **Grad Rijeka – RCC info** (`info.rijekacitycard.hr/hr/get-notices`) | voda, struja, plin, grijanje, regulacija prometa za Rijeku, Kastav, Viškovo, Jelenje i okolicu | **JSON** (JLS, naselje, ulica, k.br.) | nema robots.txt (404) | **Pouzdano** |
| **ViO Zagreb** | voda, Zagreb | HTML tablica + članci s popisom ulica | nema robots.txt (404) | **Pouzdano** |
| **ViK Split** | voda, Split, Kaštela, Solin, Trogir… | HTML članci po području (ne po ulici) | priložen predložak bez zabrana | **Djelomično** (područje, ne ulica) |
| **Gradska plinara Zagreb** | plin, Zagreb | HTML; točan sat je u .doc privitku | nema robots.txt (404) | **Djelomično** (cijeli dan) |

## Nije pokriveno (reci to vlasniku)
- **HEP Toplinarstvo**: nema strukturiranog popisa (samo vijesti); gdje postoji, grijanje dolazi preko Rijeke (RCC).
- **Vodovodi Osijek, Zadar, Pula, Varaždin i ostali**: stranice se otvaraju, ali nisu napisani čitači (Osijek se ne može dohvatiti).
- **Plin izvan Zagreba** i **radovi na cestama izvan Rijeke** (HAK/HAC, gradski prometni centri): nisu povezani; na autocestama nema adresa, pa nisu ni cilj aplikacije.
- Uvjete korištenja nisam pronašao ni za jedan izvor; osim robots.txt-a HEP-a nema izričitih zabrana.
