# Eén catalogus: toevoegen in BBQ Architect, de website gaat mee

**Datum:** 3 oktober 2026 · **Besluit Mathijs:** "1 plek toevoegen en de rest gaat dan ook mee" — website,
BBQ Architect en straks de kassa. Foto's blijven uit ChatGPT komen; bier, wijn en worst tegelijk.
**Staat in beide repo's:** hier (website) en in `bbq-architect-v2/docs/` (dezelfde tekst).

## Het idee in vier zinnen

1. **Eén product = één rij** in `winkel_producten`, met foto, tekst, proefkaart, allergenen, streepjescode,
   voorraad en prijs. Hetzelfde bier in een pakket, los online en straks aan de kassa is dezelfde rij.
2. **Toevoegen gebeurt in BBQ Architect** (Verkoop → Webshop → Producten → *Nieuw op de site*), op de laptop,
   de telefoon of straks de kassatablet. De website houdt geen eigen lijst meer.
3. **De AI zoekt op, jij keurt:** naam of etiketfoto erin, de AI vult brouwerij, stijl, alcohol, proefkaart
   en teksten in met bronnen. Prijs, btw, allergenen en ingrediënten vul je altijd zelf in (de AI toont wat
   er op het etiket staat en wat Mr. Hop vraagt, alleen als hint).
4. **"Zet op de site"** start een nieuwe build van de website (deploy hook, ± 2 minuten). Ligt BBQ Architect
   plat, dan faalt de build en blijft de vorige site gewoon staan.

**Op de site ≠ te koop** (regel 4 uit CLAUDE.md). *Op de site* vraagt een adres en drank onder de 15 %. *Te koop*
vraagt daarnaast een prijs en de allergenen (bij vlees ook ingrediënten en bewaren; bij alcoholvrij de
ingrediënten). Zonder foto staat het er met de kaart in letters.

## Wat er gebouwd is (blokken C1–C8)

| Blok | BBQ Architect (`feat/catalogus`) | Website (`catalogus`) |
| --- | --- | --- |
| C1 datamodel | migratie `20261003120000_winkel_catalogus.sql`: `slug`, `kenmerken`, `alcohol_pct`, `allergenen`, `ingredienten`, `bewaren`, `lekker_bij`, `foto` (jsonb met breedtes), `pagina_status` (geen · concept · live), `goedgekeurd`, `bronnen`; poort WC001/WC003; bucket `winkel-fotos`. Vorm per soort: `src/lib/winkel/productsoorten.ts` | — |
| C2 catalogus-route | `GET /api/public-winkel/{slug}/catalogus[?voorbeeld=<token>]` — alleen live, nooit inkoop/leverancier/marge; voorbeeldtoken HMAC 24 uur | `lib/content/catalogus-vorm.ts` (het contract) |
| C3 lezen | — | `scripts/haal-catalogus.mjs` vóór dev/build/test; `bier.ts`, `wijn.ts`, `vlees.ts` en de proefkaarten lezen `lib/content/catalogus.ts`; foto's uit de bucket als `CAT-<slug>` |
| C4 overzetten | `scripts/importeer-catalogus.ts` (droog; `--echt` schrijft) | `tests/fixtures/catalogus.json`: 32 bier, 20 wijn, 6 vlees |
| C5 productkaart | `PaginaKaart.tsx`: wat er mist, foto (ChatGPT → drie WebP-breedtes), *Kopieer de ChatGPT-opdracht*, velden per soort, proefkaart en druiven goedkeuren | — |
| C6 AI | `POST /api/winkel/product-invullen` (Claude Opus 5.5 + webzoeken + etiketfoto); schrijft niets | `POST /api/tekstcontrole` (de woordregels, `lib/tekstregels.ts`) |
| C7 nieuw | *Nieuw op de site*: soort + naam → product, artikel en slot samen | — |
| C8 site | *Bekijk op de site*, *Zet op de site*, *Haal van de site* (sein via deploy hook) | `/voorbeeld/<token>` (noindex, no-store) |

Alles staat **uit** tot de stappen hieronder gedaan zijn. Er is niets naar `main` of naar de live database.

## Livegang — in deze volgorde

1. **Migratie** `20261003120000_winkel_catalogus.sql` op Supabase (eerst op een branch, dan live). *Ja van Mathijs.*
2. **Import droog**, dan echt (vanuit de map van BBQ Architect):
   `npx tsx scripts/importeer-catalogus.ts <website>/tests/fixtures/catalogus.json <website>/public/beeld`
   en daarna hetzelfde met `--echt`. Bestaande prijzen en actief-standen blijven staan.
3. **Momenten** voor de groepen `bier`, `wijn` en `vlees` in Verkoop → Webshop → Momenten (woensdag, vrijdag,
   zaterdag 10:00–16:00, zoals de pakketten). Zonder momenten kan de klant geen afhaaldag kiezen.
4. **Env in BBQ Architect (Vercel):** `WEBSITE_DEPLOY_HOOK_URL` (Vercel → hop-en-bites-website → Settings → Git →
   Deploy Hooks, tak `main`) en `CATALOGUS_VOORBEELD_GEHEIM` (een lange willekeurige tekst).
5. **Env op de website (Vercel):** niets verplicht; de build haalt standaard uit BBQ Architect. Voor een
   proefversie zonder BBQ Architect: `HB_CATALOGUS_BRON=fixture`.
6. **Controle:** `npm run catalogus:controle` op de website (haalt de echte catalogus en draait alle tests), en
   schermafbeeldingen van `/bier`, `/wijn`, `/vlees` naast die van nu.
7. **Proef van begin tot eind:** *Nieuw op de site* → AI → foto → *Bekijk op de site* → *Zet op de site* → na
   ± 2 minuten op `/bier` → in de afhaaltas → *Haal van de site* → weg.

## Bewust anders

- **Build in plaats van live ophalen.** De site blijft ingebakken (snel, één bron per build); "zet live" start
  een build. Seconden werden ± 2 minuten, in ruil voor geen ombouw van de hele site en een veilige terugval.
- **Nieuwe bieren niet automatisch op echte hoogte.** `maak-bier-op-schaal.py` draait niet in BBQ Architect;
  de ChatGPT-opdracht vraagt om de echte verhouding. De 32 bestaande houden hun foto.
- **De tests op de oude lijsten** (bijv. wijntekst = `wijnen.json`) toetsen nu de fixture; de woordregels
  gelden voor alles wat binnenkomt, via `/api/tekstcontrole` en de tests.
- **Port en Amarone** komen niet meer in de catalogus: BBQ Architect zet 15 % of meer nooit op de site.

## Later (niet nu)

- Studiofoto ín BBQ Architect via de beeld-API van ChatGPT (OpenAI-sleutel, een paar cent per foto).
- Kaas en de borrelplank op hetzelfde model.
- De kassa in de winkel (W12, maart 2027) verkoopt dezelfde rijen via de streepjescode.
- De open vragen die bij de oude lijsten stonden: `lib/content/catalogus-open-vragen.ts` (`npm run vragen`).
