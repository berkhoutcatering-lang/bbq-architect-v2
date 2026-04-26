# Makro Scraper

Haalt prijzen + producten automatisch uit `producten.makro.nl` op, dezelfde data
die je als ingelogde klant in de webshop ziet. Output gaat via `/api/pricelist-sync`
rechtstreeks in je master_products + supplier_prices.

## Eénmalige setup

```bash
# 1. Dependencies (mocht Playwright nog niet volledig geïnstalleerd zijn)
npm install playwright
npx playwright install chromium

# 2. Login — opent Chromium, jij logt in, sessie wordt opgeslagen
npx tsx scripts/scrape-makro/login.ts
```

De `storage-state.json` die hierbij ontstaat bevat je sessie-cookie en staat in
`.gitignore` (nooit naar git, nooit delen). Geldig tot Makro de sessie verloopt
(meestal weken).

## Recon (1× om te kijken wat er gebeurt)

```bash
npx tsx scripts/scrape-makro/recon.ts
```

Opent een categorie-pagina, logt alle XHR-calls, dumpt een product-card HTML,
schrijft alles naar `recon-output.json`. Hieruit ontdekken we welke API Makro
zelf gebruikt — dan kan `scrape.ts` daar direct heen (betrouwbaarder dan DOM).

## Scrape (eindproduct, nog te bouwen)

```bash
npx tsx scripts/scrape-makro/scrape.ts
```

Werkt vervolgens volautomatisch:
- Loopt door alle categorieën
- Haalt per product: naam, prijs excl BTW, eenheid, bundel, categorie
- Pusht batches naar `/api/pricelist-sync` (zelfde endpoint als de PDF-upload)
- Respecteert rate-limits (1 req / 2-5s, random)

## Scheduled run (later)

Via `launchd` op je Mac: elke 2 weken op dinsdag 23:00. Details in
`schedule.plist` (volgt na recon + scrape-flow).

## Veiligheid

- `storage-state.json` — bevat je login-cookie. Niet delen, niet committen.
- Script draait op je eigen Mac, residential NL-IP. Lijkt 1-op-1 op een mens.
- Rate-limit: 1 request per 2-5 seconden, random pauzes. ~30-60 min voor
  volledig assortiment. Niks wat verdacht is.
