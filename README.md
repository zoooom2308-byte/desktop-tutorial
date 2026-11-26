# Najava radova

PWA koja javlja Web Push obavijest kad su u tvojoj ulici najavljeni radovi (struja, voda, plin, grijanje, promet).

- **Stranica:** GitHub Pages iz mape `docs/` (generira se naredbom `node scripts/build-pages.mjs`).
- **Pozadina:** Supabase (Edge Function `api` + Postgres tablica `kv` + `pg_cron` svakih 10 min). Paket funkcije gradi `node scripts/build-api.mjs` (`dist/api.mjs`).
- **Izvori:** vidi `notes/izvori.md`. Testovi: `npm test`.

## Uključivanje GitHub Pages (jednom)
1. Repozitorij mora biti javan (Settings → General → Danger Zone → Change visibility → Public).
2. Settings → Pages → Build and deployment → Source: **Deploy from a branch** → Branch: `claude/pensive-wozniak-pbkv7p` (ili `main` nakon spajanja), mapa **/docs** → Save.
3. Adresa: https://zoooom2308-byte.github.io/desktop-tutorial/
