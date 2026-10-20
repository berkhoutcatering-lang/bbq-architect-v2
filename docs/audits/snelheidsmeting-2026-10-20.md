# Snelheidsmeting BBQ Architect — 20 oktober 2026

**Vraag:** moet het platform opgedeeld worden in losse apps (zoals Odoo) omdat het dan sneller aanvoelt?
**Kort antwoord uit de metingen:** nee, dat lost het niet op. De traagheid zit in *hoe* pagina's hun gegevens ophalen en in wat de gedeelde app-schil op élke pagina meeneemt. Dat blijft precies hetzelfde als je de app in stukken knipt.

## Hoe er gemeten is

- Productieversie (`next build` + `next start`, launch-config "Next.js Productie (meten)"), commit `9c8e6431`. Niet de dev-server.
- Ingelogd als Mathijs (Hop & Bites, echte gegevens), in het browserpaneel van de Claude-app, op een Mac met een snelle verbinding. De database (Supabase, Frankfurt) is de echte.
- Elke pagina is minstens drie keer volledig geladen. Daarnaast is één ronde gedaan waarin via het menu van hub naar hub geklikt werd.
- **"Klaar"** = het moment waarop de tekst op de pagina niet meer verandert en er geen laadicoon meer staat (daarna 1,5 s stil). Daarmee telt een pagina die eerst leeg verschijnt en zich daarna vult pas als "klaar" zodra hij gevuld is.
- De JavaScript-omvang komt rechtstreeks uit de bouw. Het aandeel van de schil-onderdelen is bepaald met twee proefbouwen in een wegwerpkopie: één zonder AI-chat, één zonder alle acht extra's. Daarna is die kopie weggegooid. Er is geen code gewijzigd.

**Niet te meten (leeg gelaten):**
- Moment van eerste beeld en grootste beeld (FCP/LCP), en rekentijd in de browser. Het browserpaneel tekent op de achtergrond geen beeldjes, dus de browser rapporteert die cijfers niet.
- Telefoon of 4G.
- De live Vercel-omgeving.
- Hoeveel rijen per tabel binnenkomen. De databasevraag daarvoor werd geweigerd (geen rechten), en Supabase geeft de grootte van een antwoord niet aan de browser door.

Op een telefoon in de keuken zijn alle tijden hieronder dus *langer*, niet korter.

## Gemeten per pagina (volledig laden)

| Pagina | Klaar (mediaan) | Klaar (spreiding, 3 keer) | Serverantwoord | Verzoeken totaal | waarvan database (Supabase) | waarvan eigen `/api` | JS-bestanden |
|---|---|---|---|---|---|---|---|
| `/` Vandaag | 0,55 s | 0,43 – 1,12 s ¹ | 0,19 – 0,28 s | 70 | 29 | 4 (+1 serveractie) | 26 |
| `/agenda` | 0,48 s | 0,39 – 0,89 s | 0,18 – 0,60 s | 54 | 16 | 4 | 24 |
| `/offertes` | 0,69 s | 0,61 – 0,74 s | 0,14 – 0,24 s | 58 | 19 | 4 | 24 |
| `/gerechten` | 0,75 s | 0,65 – 0,82 s | 0,12 – 0,19 s | 55 | 13 | 4 | 27 |
| `/voorraad` | ≤ 0,63 s | ≤ 0,43 – 1,35 s ² | 0,11 – 0,17 s | 49 | 13 | 5 | 21 |

¹ De allereerste lading van de startpagina, vóór de drie metingen, duurde 1,8 s. Alle 29 databasevragen deden er toen 0,6–1,2 s over, in latere rondes 0,1–0,3 s. Na een pauze is de eerste lading dus merkbaar trager.
² De trage keer (1,35 s) wachtte de pagina met een laadicoon op `/api/voorraad/demand`, dat er 0,9 s over deed. "≤" betekent dat de pagina al klaar was toen de meting begon.

Daar komen in een zichtbaar venster nog bij: **35 achtergrondverzoeken** waarmee het menu alvast de andere hubs voorlaadt. Dat is één keer gemeten, op `/voorraad`: elke menulink twee keer, tussen 0,8 en 2,1 s na het laden.

### Welke pagina's eerst leeg verschijnen en dan pas data halen

| Pagina | Wat je ziet |
|---|---|
| Alle vijf | Eerst het laadscherm "Laden..." van de schil. Pas als de browser weet wie je bent en bij welk bedrijf je hoort (één databasevraag, 60–120 ms) gaat de pagina zelf iets ophalen. |
| `/` | Verschijnt direct, maar **met nullen en lege lijsten**, en vult zich daarna. Haalt zo'n 18 tabellen zelf op, waarvan 15 helemaal (`select *`, zonder grens). |
| `/agenda`, `/offertes` | Halen alles pas in de browser op. `/offertes` begint daar pas mee 0,3 s nadat de pagina al op het scherm staat. |
| `/gerechten` | De server haalt gangen en gerechten al op, maar de pagina **gooit dat weg**. Ze toont een laadicoon en haalt dezelfde twee tabellen opnieuw op, ook nog na elkaar in plaats van tegelijk (`src/app/gerechten/_client.tsx:122` en `:158`). |
| `/voorraad` | Goed voorbeeld: de server haalt de data op, de browser hoeft niet opnieuw. Alleen de vraag-berekening (`/api/voorraad/demand`) komt later. |

Over de hele app: 73 van de 128 pagina's zijn browser-pagina's (`'use client'`), 56 halen data op na het tonen (`useEffect`), en 19 halen iets op de server op.

### Vaste verzoeken die de schil op élke pagina doet

Op `/gerechten` doet de pagina zelf maar 2 databasevragen; de andere **11** komen van de schil. Samen met 4 eigen `/api`-verzoeken zijn dat **15 vaste verzoeken per pagina**, ongeacht welke pagina:

- 1× bedrijf opzoeken (`organization_members` + `organizations`)
- 4× globale gegevens (`AppContext`): `events`, `offertes`, de **hele** `inventory`, `facturen`
- 1× de **hele** `gerechten`-tabel, voor de rondleiding (`OnboardingWizard`), ook als die dicht is
- `ai_usage`, `organizations.feature_flags`, `settings` (`select *`), teamleden + profielen
- `/api/changelog`, `/api/help/contextual`, en 2× `/api/activity`

Dubbel opgehaald op de startpagina: `events`, `offertes`, `inventory`, `facturen` elk 2× (schil + pagina), en `settings` 3×.

## Klik van hub naar hub (de app blijft open)

Vertrek vanaf `/agenda` en dan via het menu verder:

| Klik naar | Adres verandert na | Klaar na | Verzoeken | Opmerking |
|---|---|---|---|---|
| `/offertes` | 0,18 s | 0,56 s | 19 | 8 tabellen opnieuw opgehaald, pas vanaf 0,48 s |
| `/gerechten` | 0,17 s | 0,64 s | 16 | laadicoon van 0,49 tot 0,64 s; 2 vragen na elkaar |
| `/voorraad` | 0,17 s | 0,57 s | 10 | server haalt op (0,32 s) |
| `/` | 0,14 s | 0,30 s | 33 | 20 tabellen opnieuw, ook al was je er net |
| `/agenda` | 0,13 s | 0,22 s | 7 | |

Er wordt niets onthouden tussen hubs: terug naar een pagina waar je net was, betekent alles opnieuw ophalen.

## JavaScript bij eerste keer laden

Gezipte omvang, uit de productiebouw:

| Pagina | Totaal | Next.js/React-basis | App-schil | Pagina zelf | In de browser binnengekomen ³ |
|---|---|---|---|---|---|
| `/` | 371 KB | 130 KB | 169 KB | 73 KB | 491 KB |
| `/agenda` | 384 KB | 130 KB | 169 KB | 85 KB | 393 KB |
| `/offertes` | 382 KB | 130 KB | 169 KB | 83 KB | 385 KB |
| `/gerechten` | 354 KB | 130 KB | 169 KB | 56 KB | 367 KB |
| `/voorraad` | 331 KB | 130 KB | 169 KB | 33 KB | 334 KB |

³ Inclusief stukken die pas na het laden worden opgehaald. Bij een volgend bezoek kwam er maar 0–92 KB over de lijn; de rest kwam uit de browsercache.

**Waar de 169 KB schil uit bestaat** (gemeten met de proefbouwen):
- AI-chat (`ChatPanel` + `AiStudioOverlay`): **14 KB**
- Alle acht extra's samen (AI-chat, commandopalet, rondleiding, nieuws, hulp, plusknop, mobiele ⌘K-knop): **43 KB**
- Supabase-client (het programmaatje dat met de database praat): 53 KB. Dat is nodig zolang pagina's in de browser data halen.
- De rest, zo'n 73 KB: menu, onderbalk, kruimelpad, meldingen, thema en de gedeelde gegevens.

## Top-3 oorzaken, op volgorde van impact

### 1. Gegevens komen pas laat binnen, in stapjes na elkaar, en bij elke klik opnieuw

Voorbeeld `/offertes`, gemeten:
- 0,24 s: de pagina komt binnen
- 0,27–0,34 s: wie ben je, welk bedrijf
- 0,36–0,51 s: de schil haalt zijn gegevens
- 0,66–0,80 s: pas nu de offertes zelf

Elke stap wacht op de vorige. De startpagina laat intussen nullen zien. `/gerechten` gooit de gegevens weg die de server al had. Tussen hubs wordt niets bewaard. Bij een trage database (eerste keer na een pauze) wordt dit 1,1–1,8 s, en op 4G telt elke stap zwaarder.

**Omvang van de fix:**
- `/gerechten` de servergegevens laten gebruiken: klein, een uur. Het patroon bestaat al op `/voorraad`.
- De vijf hoofdpagina's hun gegevens op de server laten ophalen zoals `/voorraad`: middel, ongeveer een halve tot hele dag per pagina, samen ongeveer een week.
- Gegevens tussen hubs onthouden (één centrale cache in `useSupabase`): groter, ongeveer 1–2 weken. Dit raakt elke pagina die `useSupabase` gebruikt, dus het moet goed getest worden.

### 2. Te veel en te grote databasevragen

- 15 vaste verzoeken per pagina uit de schil, waarvan twee hele tabellen (`inventory`, `gerechten`).
- De startpagina doet er 29, waarvan 15 hele tabellen zonder grens, met dubbelingen.

Dit is de oorzaak van de uitschieters: 29 vragen tegelijk bij een koude database duurden tot 1,2 s per stuk. En het groeit mee met de data. Hoe meer gerechten, klanten en bonnen, hoe trager, terwijl de app er maar een paar van toont.

**Omvang van de fix:**
- Rondleiding alleen laten laden als hij open is, en dubbele `settings`/`feature_flags` samenvoegen: klein, een paar uur.
- Schil en startpagina dezelfde gegevens laten delen in plaats van twee keer halen: klein tot middel, ongeveer 1 dag.
- De startpagina zijn overzicht in één servervraag laten krijgen in plaats van 18 hele tabellen: middel, ongeveer 2–4 dagen.

### 3. Zware app-schil op elke pagina (JavaScript)

- 331–384 KB per pagina bij eerste keer laden, waarvan 169 KB schil. Dat is meer dan elke pagina zelf (33–85 KB).
- **Maar:** de extra's waar het vermoeden op lag zijn samen maar 43 KB (12% van de totale JavaScript). De AI-chat is 14 KB.
- Bij dagelijks gebruik komt de JavaScript uit de browsercache (gemeten 0–92 KB over de lijn). Het speelt dus vooral bij het eerste bezoek na een nieuwe versie, en bij het rekenwerk op een telefoon. Dat laatste is hier niet te meten.

**Omvang van de fix:** klein, ongeveer een halve dag. De acht extra's pas laden als ze nodig zijn (`next/dynamic`) scheelt 43 KB op elke pagina. Meer winst zit pas in oorzaak 1: als pagina's hun data op de server halen, is ook minder Supabase-code in de browser nodig.

## Wat dit betekent voor "opdelen in losse apps"

- **Oorzaak 1** zit in de manier waarop elke pagina data ophaalt. Opdelen verandert dat niet.
- **Oorzaak 2** zit in de schil, die elke losse app opnieuw zou meenemen.
- **Oorzaak 3** zit in de schil: Next.js laadt nu al per pagina alleen de code van die pagina. Een losse "Keuken-app" zou dezelfde 169 KB schil nodig hebben.

Opdelen kan wel helpen voor *overzicht*, maar dat is een andere vraag dan snelheid. De snelste winst zit in oorzaak 2 (een paar uur tot een dag) en in `/gerechten` (een uur), daarna oorzaak 1.

## Kanttekeningen

- Snelle Mac met een snelle verbinding: echte keukenomstandigheden (telefoon, 4G) zijn trager.
- De server draaide lokaal. Op Vercel komt de servertijd er anders uit; de databasevragen vanuit de browser zijn wel gelijk.
- `next build` hangt binnen de Bash-sandbox van Claude zonder foutmelding. Buiten de sandbox is hij in 42 s klaar.
