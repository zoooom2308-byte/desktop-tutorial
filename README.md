# Najava radova

Aplikacija koja javlja obavijest kad su u tvom gradu ili ulici najavljeni radovi (struja, voda, plin, grijanje, promet).

| Dio | Gdje |
|---|---|
| Web-aplikacija (PWA) | https://zoooom2308-byte.github.io/desktop-tutorial/ (GitHub Pages, mapa `docs/`) |
| Android aplikacija | `android/` (Trusted Web Activity). Testni APK: [Releases → android-latest](https://github.com/zoooom2308-byte/desktop-tutorial/releases/tag/android-latest) |
| Pozadina | Supabase: Edge Function `api` + Postgres `kv` + `pg_cron` (svakih 10 min); kod u `lib/`, paket `dist/api.mjs` |
| Trgovina i pravno | `store/` (opis, grafike), `notes/objava-u-trgovine.md`, `notes/zahtjev-za-dopustenje.md`, `public/privacy.html`, `public/uvjeti.html` |

## Naredbe
```bash
npm test                      # jedinični testovi
node scripts/build-pages.mjs  # izgradi stranicu u docs/ (NR_SUPPORT_URL=... za gumb "Podrži razvoj")
node scripts/build-api.mjs    # izgradi paket pozadine dist/api.mjs
```
Izvori podataka: `notes/izvori.md`.

## GitHub Pages (jednom)
Settings → Pages → Deploy from a branch → ova grana, mapa `/docs`.
