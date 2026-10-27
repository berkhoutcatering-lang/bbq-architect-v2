# Werkruimtes en snelheid — plan

**Datum:** 2026-10-20 · **Branch:** `feat/werkruimtes-snelheid`
**Aanleiding (Mathijs):** "Is het niet handig om het platform op te delen zoals Odoo? Vooral voor overzicht, en dat de app sneller aanvoelt."
**Meting vooraf:** [audits/snelheidsmeting-2026-10-20.md](audits/snelheidsmeting-2026-10-20.md)

## Twee sporen, één verbouwing

Opdelen maakt de app niet sneller: de meting liet zien dat de traagheid zit in *hoe* pagina's gegevens ophalen en in wat de app-schil op elke pagina meeneemt. Opdelen geeft wél rust en focus. Daarom twee sporen:

- **Werkruimtes** (overzicht): elk onderdeel wordt een eigen werkruimte zoals een Odoo-app. Geen zijbalk met alles erin; bovenin alleen de tabbladen van het onderdeel waar je bent. Wisselen via een tegelscherm. Onderdelen die een bedrijf niet gebruikt kan het uitzetten.
- **Snelheid**: minder en kleinere vragen aan de database, niets dubbel ophalen, onthouden tussen pagina's, en zware extra's pas laden als ze nodig zijn.

## Spoor A — Snelheid

| # | Wat | Waarom (uit de meting) | Bestanden |
|---|---|---|---|
| A1 | `/gerechten` gebruikt de gegevens die de server al ophaalde; verversen doet beide tabellen tegelijk | pagina gooide servergegevens weg en vroeg alles na elkaar opnieuw | `gerechten/_client.tsx` |
| A2 | Rondleiding vraagt niet meer de hele gerechtentabel; eerst lokale "al gezien"-check, dan één tel-vraag | hele `gerechten`-tabel op elke pagina | `OnboardingWizard.tsx` |
| A3 | Teamleden + profielen alleen ophalen op `/gebruikers` | 2 vragen op elke pagina, alleen daar gebruikt | `OrgContext.tsx`, `gebruikers/page.tsx` |
| A4 | Feature-flags lezen uit de al geladen organisatie | dubbele `organizations`-vraag | `featureFlags.ts` |
| A5 | AI-verbruiksmeter alleen als het gebruikersmenu open is | `ai_usage`-vraag + elke 2 min opnieuw | nieuwe werkruimtebalk |
| A6 | Instellingen één keer per bedrijf ophalen, gedeeld | `settings` 3–4× per pagina | `useSupabase.ts` (`useSettings`), `useBrandLogo.ts`, `PersonaQuiz.tsx` |
| A7 | Gedeelde gegevens (badges, meldingen) pas ophalen als de pagina staat | concurreert met de vragen van de pagina zelf | `AppContext.tsx` |
| A8 | Geheugen tussen pagina's: wat je net zag staat er meteen weer, op de achtergrond ververst | bij elke klik alles opnieuw | `useSupabase.ts` |
| A9 | Afspraak-wizard op Vandaag pas laden als je hem opent | 5 hele tabellen terwijl hij dicht is | `app/page.tsx` |
| A10 | Extra's (AI-chat, zoekvenster, rondleiding, hulp, plusknop) apart laden, na de pagina | 43 KB op elke pagina | `AppShell.tsx` |
| A11 | Hulp-artikel pas ophalen als je de hulp opent | `/api/help/contextual` op elke pagina | `ContextualHelp.tsx` |
| A12 | Vandaag: alleen de kolommen en rijen die het scherm toont | 14 hele tabellen | `app/page.tsx`, `useSupabase.ts` (optie `columns`) |

## Spoor B — Werkruimtes

**Eén bron.** Tabbladen per onderdeel staan nu op 11 plekken die elkaar tegenspreken (navigation.tsx, negen `*Tabs.tsx`, zoekvenster, kruimelpad, sitemap). Alles komt in `src/lib/navigation.tsx`:

- per onderdeel: tabbladen in de volgorde die je nu op de pagina's ziet (incl. Bestellingen, Webshop, Kerst, Partijen, Winkel, Ontvangst die nu alleen in de pagina-tabs stonden);
- per onderdeel ook de routes die erbij horen zonder eigen tabblad (bv. `/klantgesprek`, `/haccp` → Plannen; `/marges`, `/ai-chat` → Keuken; `/scan` → Inkoop & Voorraad);
- `adminOnly` voor Platform Beheer (alleen platformbeheerders zien die nog).

Eén functie `vindWerkruimte(pad)` bepaalt overal welk onderdeel en welk tabblad actief is.

**Werkruimtebalk** (vervangt de zijbalk, alle schermen):
`[⊞ tegels] [icoon + naam onderdeel] [tabbladen …] ····· [actief item] [Zoeken ⌘K] [nieuws] [jij ▾]`
- Op de telefoon: bovenste regel met tegels/naam/zoeken/jij, eronder de tabbladen (horizontaal schuiven). De onderbalk blijft; "Meer" opent het tegelscherm.
- Het gebruikersmenu (jij ▾) bevat naam, bedrijf, AI-verbruik, Instellingen, Uitloggen.
- Kruimelpad alleen nog op detailpagina's (bv. een event), niet op tabblad-niveau — daar zegt de balk het al.

**Tegelscherm** (Odoo-startscherm): Vandaag + elk ingeschakeld onderdeel als grote tegel met icoon, naam, één zin uitleg en telling (bv. open facturen). Openen met de ⊞-knop of "Meer"; sluiten met Esc of een tik ernaast.

**Opruimen:** de tab-balken in de pagina-layouts verdwijnen (de werkruimtebalk toont ze). Wat blijft: tabbladen van één event (`EventTabs`), de Klok/Personeel-tabs binnen Uren (derde niveau), en de knoppen binnen een pagina (bv. W&V/BTW op Financiën). De zijbalk-component wordt verwijderd. Het zoekvenster haalt zijn navigatie uit dezelfde bron (nu staan Facturen/Uren/Logistiek er onder de verkeerde kop).

## Spoor C — Onderdelen aan/uit per bedrijf

- **Opslag:** nieuwe kolom `settings.verborgen_onderdelen text[]` (standaard leeg). Additieve migratie; de code werkt ook als de kolom er nog niet is. Instellingen worden al opgehaald, dus dit kost geen extra vraag.
- **Wie:** alleen de rol Admin van het bedrijf; de server-actie controleert dat opnieuw.
- **Vast aan:** Vandaag en Instellingen kunnen niet uit.
- **Effect:** uitgezette onderdelen/tabbladen verdwijnen uit het tegelscherm, de werkruimtebalk, de onderbalk en het zoekvenster. Niets wordt verwijderd: een directe link blijft werken, en aanzetten zet alles terug ("features blijven, deuren verdwijnen").
- **Waar:** Instellingen → nieuwe pagina `/instellingen/onderdelen`, per onderdeel een schakelaar met de tabbladen eronder.
- **Bijvangst:** de admin-route voor feature-flags overschrijft nu het hele `feature_flags`-object (en kan zo Moneybird-tokens wissen); die gaat alleen de eigen sleutels samenvoegen.

## Volgorde

1. A1–A7, A9–A11 (klein, los van elkaar) → typecheck + tests
2. B: navigation.tsx als bron → werkruimtebalk → tegelscherm → onderbalk/kruimelpad/zoekvenster → tab-balken uit de layouts → zijbalk weg → CSS
3. C: migratie → server-actie → instellingenpagina → filteren
4. A8 (geheugen) en A12 (Vandaag) als laatste, omdat die het meeste raken
5. Controle: typecheck, alle tests, productiebuild; doorlopen in de browser op computer/tablet/telefoon, licht en donker; dezelfde meting opnieuw → voor/na-tabel onderaan dit document

## Definitie van klaar

- Geen zijbalk meer; elk onderdeel heeft één werkruimtebalk met zijn tabbladen; tegelscherm werkt met muis, toetsenbord en aanraking.
- Navigatie komt uit één bestand; geen tabblad-lijst meer elders.
- Onderdelen aan/uit werkt end-to-end en overleeft herladen.
- Meting na afloop: minder verzoeken per pagina dan vooraf, tweede bezoek aan een pagina toont direct inhoud.
- Typecheck, tests en productiebuild groen.

---

## Uitvoering en meting na afloop (2026-10-20)

Gebouwd op `feat/werkruimtes-snelheid`. Gemeten op dezelfde manier als het rapport vooraf: productiebouw (`next build` + `next start`), ingelogd als Mathijs op de echte Hop & Bites-gegevens, zelfde Mac, browserpaneel 1280×820. Elke pagina drie keer volledig geladen; "klaar" = tekst verandert 1,5 s niet meer en er staat geen laadicoon.

### Volledig laden

| Pagina | Databasevragen voor → na | Klaar (mediaan) voor → na | Wat veranderde |
|---|---|---|---|
| `/` Vandaag | 29 → **22** | 0,55 → **0,39 s** | rondleiding, wizard en dubbele instellingen weg |
| `/agenda` | 16 → **11** | 0,48 → **0,49 s** | |
| `/offertes` | 19 → **7** | 0,69 → **0,66 s** | lijst komt mee met de pagina (server); tellers pas na 1,5 s |
| `/gerechten` | 13 → **6** | 0,75 → **0,65 s** | geen laadicoon meer, servergegevens gebruikt |
| `/voorraad` | 13 → **7** | ≤0,63 → **0,69 s** | alleen minder vragen; tijd binnen de meetruis |

De eerste keer na een pauze is nog steeds trager (1,3–1,5 s): dat is de database die "wakker" wordt, niet de app.

### Klikken tussen werkruimtes (app blijft open, via het tegelscherm)

| Klik naar | Databasevragen voor → na | Klaar voor → na |
|---|---|---|
| `/offertes` | 8 tabellen → **1** | 0,56 → **0,54 s** |
| `/gerechten` | 2 (na elkaar, met laadicoon) → **0** | 0,64 → **0,49 s** |
| `/voorraad` | → **2** | 0,57 → **0,50 s** |
| `/` (net geweest) | 20 → 15, **maar inhoud staat er meteen** (verversen gebeurt op de achtergrond) | 0,30 → 0,39 s |
| tweede keer `/offertes` | — → **2** | — → **0,43 s** |
| tweede keer `/gerechten` | — → **0** | — → **0,47 s** |

### Wat bewust niet gedaan is

- **A12 — kolommen op Vandaag inperken.** Gemeten in de database: alle veertien tabellen samen zijn voor Hop & Bites ongeveer 70 KB (gerechten 28 KB, de rest 1–7 KB). Kolommen schrappen levert hier bijna niets op, en een vergeten kolom breekt stilletjes een functie. De winst zat in het áántal vragen en het geheugen tussen pagina's.
- **Vandaag in één servervraag** (rapport: 2–4 dagen) en **servergegevens voor /agenda** — nu niet nodig: Vandaag en Agenda zijn klaar in ±0,4–0,5 s. Wordt interessant als de data groeit.
- **JavaScript-omvang vergelijken**: in deze meting op een andere manier geteld dan in het rapport (browser in plaats van bouwoverzicht), dus geen eerlijke voor/na. Wel zeker: AI-chat, AI-studio, zoekvenster, rondleiding, hulp, plusknop, tegelscherm en het nieuws-belletje zitten niet meer in de gedeelde bundel maar komen na de pagina.
