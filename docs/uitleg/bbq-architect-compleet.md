# BBQ Architect — volledig handboek

> **Wat dit bestand is.** Een compleet naslagwerk over BBQ Architect: een Nederlandse B2B-SaaS voor cateringbedrijven. Het beschrijft waarvoor de app bestaat, hoe hij technisch in elkaar zit, en wat elk van de 103 pagina's doet. Geschreven op 2026-09-01, rechtstreeks vanaf de code op branch `feat/kennisbank-en-keuken`.
>
> **Voor Claude:** gebruik dit als de bron van waarheid over deze app. Alle getallen komen uit de code of uit een meting die in de projectdocumenten staat — nergens uit een schatting. Waar iets ontbreekt of onzeker is, staat dat er expliciet bij. De gebruiker is Mathijs Berkhout: eigenaar, bouwer en enige gebruiker van de productie-installatie, geen programmeur — schrijf uitleg in mensentaal en vermijd code-jargon tenzij hij er zelf om vraagt.

**Omvang:** 103 pagina's · 198 API-routes · 126 database-migraties · ~110 tabellen · ~229.000 regels code · 8 hubs

---

## Inhoud

1. [Wat het is](#1-wat-het-is)
2. [Voor wie, en waarom](#2-voor-wie-en-waarom)
3. [De regels eronder](#3-de-regels-eronder)
4. [Hoe het gebouwd is](#4-hoe-het-gebouwd-is)
5. [De navigatie](#5-de-navigatie)
6. [Elke pagina, één voor één](#6-elke-pagina-één-voor-één)
7. [De klantkant](#7-de-klantkant)
8. [De AI-laag](#8-de-ai-laag)
9. [De achterkant](#9-de-achterkant)
10. [Waar het nu staat](#10-waar-het-nu-staat)
11. [Woordenlijst](#11-woordenlijst)

---

# 1. Wat het is

**BBQ Architect is het commandocentrum van een cateringbedrijf.** Een aanvraag komt binnen, wordt een offerte, de offerte wordt een event, het event wordt een menu, het menu wordt een bestellijst en een kookplanning, de dag zelf wordt een servicebord, en achteraf wordt het een factuur, een bon-archief en een BTW-aangifte. Al die stappen leefden vroeger in Excel, WhatsApp, een papieren map en het hoofd van de eigenaar. Hier leven ze in één keten, waarin elke stap de volgende voedt.

Het is geen boekhoudpakket met een agenda erbij, en ook geen planner met facturen erbij. Het bijzondere zit in de **doorrekening**: als een leverancier de prijs van bavette verhoogt, dan verandert de kostprijs van het component, dan de kostprijs van het gerecht, dan de marge van het menu, dan de marge van elke open offerte waar dat menu in zit — en dan verschijnt er een melding op de startpagina dat er offertes zijn die je niet meer wilt versturen zoals ze zijn.

### De vijf dingen die hij echt doet

- **Verkopen** — aanvraagformulier, leadpijplijn, offerte-wizard, opgemaakte menukaart, klantportaal met handtekening en iDEAL-aanbetaling, factuur.
- **Plannen** — agenda met conflictdetectie, event-hub per opdracht, draaiboek, logistiek-checklists, crew-uren, materieel, rittenregistratie.
- **Koken** — gerechten opgebouwd uit componenten, receptuur, allergenen, kookbord met prep-taken per station, servicebord op de dag zelf, HACCP-registratie.
- **Inkopen** — leverancierscatalogi, prijslijsten uit PDF en e-mail, bestelvoorstel op basis van events én minimumvoorraad, ontvangst boeken, bonnen scannen.
- **Verantwoorden** — winst & verlies, cashflow-prognose, BTW-aangifte, RGS-categorisering, maandpakket voor de boekhouder, doorzoekbaar bonnenkistje met bewaarplicht van zeven jaar.
- **En overal: meedenken** — AI die de bon leest, het recept ontleedt, het menu voorstelt, de dagbriefing schrijft en de vraag beantwoordt, maar nooit zelf een bedrag, een BTW-tarief of een allergeen verzint.

> **De zin die alles samenvat:** van aanvraag tot factuur in één flow, met de keuken erin — voor de prijs van een boekhoudabonnement, in het Nederlands.

---

# 2. Voor wie, en waarom

## Het probleem

De echte concurrent is geen software maar een stapel: **Excel + WhatsApp + Moneybird + Google Agenda + Canva.** Zo werkt naar schatting tachtig procent van de kleine Nederlandse caterers. Dat werkt, tot het niet meer werkt: de offerte kent de kostprijs niet, de kostprijs kent de leverancier niet, de bestellijst kent het event niet, en de boekhouder krijgt in januari een schoenendoos.

De internationale catering-SaaS (Tripleseat, Caterease, CaterZen, FoodStorm, Total Party Planner, Better Cater, Curate) is volwassen maar Engelstalig, duur, en kent geen Nederlandse BTW, geen iDEAL, geen Moneybird en geen NVWA-HACCP. De Nederlandse spelers (Cateringpoint, Fjild, Rentman, Eventplanner.nl) kennen de markt maar dekken één stuk van de keten. Niemand doet de keuken erbij.

## De doelgroep

| Laag | Wie | Aantal |
|---|---|---|
| Totale markt | NL-bedrijven met SBI 56.21 (event-catering) | ~4.500 |
| Bereikbare markt | NL-caterers met 1–30 events per maand, primair BBQ/event | ~1.500 |
| Doel binnen 12 maanden | Betalende klanten | 50 |

**Bewust niet bediend:** hotels en congreslocaties met meer dan honderd events per maand (ander werkproces, Tripleseat-speelveld), internationale markten (de Nederlandse pasvorm ís de voorsprong), restaurants (kassa en reserveringen zijn een ander product), dark kitchens en food-delivery (geen event-context), en eenproducts-bedrijven zoals koffiebars (te simpel voor de diepere waarde).

## De drie mensen voor wie elk ontwerp getoetst wordt

| Persona | Apparaat en situatie | Wat die wil |
|---|---|---|
| **Lars** — operator op locatie | Tablet, handschoenen aan, fel zonlicht, event-dag | Drie grote knoppen voor de hele avond |
| **Pro-tier** — onbekende caterer | Laptop bij de installatie, telefoon in het veld | Binnen tien minuten snappen wat te doen, zonder iemand te bellen |
| **Mathijs** — eigenaar, bouwer, beheerder | Alles, zeven dagen per week | App open, meteen zien wat speelt, ⌘K voor de rest |

Bij een conflict wint **Lars van Pro-tier, en Pro-tier van Mathijs.** Lars dwingt eenvoud af (aanraakvlakken van minstens 44 pixels, één tik per handeling). Pro-tier dwingt zuivere taal af (geen jargon, geen bedrijfsnamen in menu-items). Mathijs krijgt zijn diepte, maar verstopt achter het commandopalet.

## Wat het kost

| Pakket | Prijs | Grenzen | Wat erbij komt |
|---|---|---|---|
| **Starter** | €49 p/m · €490 p/j | 50 AI-acties · 10 events · 2 teamleden · 1 GB | Events, offertes, facturen, klanten, gerechten, agenda, AI-assistent en offerte-wizard |
| **Pro** | €99 p/m · €990 p/j | 500 AI-acties · 50 events · 5 teamleden · 10 GB | Menu-analyse, HACCP, voorraad, inkoop, uren, materieel, logistiek, Moneybird, iDEAL, digitale handtekening, geavanceerde analyse, inkoopprijzen, foto-archief, sjablooneditor, website-beheer, CSV-import |
| **Enterprise** | €249 p/m · €2.490 p/j | 2.000 AI-acties · onbeperkt events en teamleden · 100 GB | Lead-widget, bestelportaal, API-toegang, white-label, meerdere locaties, voorrangssupport, eigen branding |

AI zit in het abonnement. Er is geen doorbelasting per gebruik — wel een plafond per pakket, zie deel 8.

## Waaraan het succes gemeten wordt

| # | Meetpunt | Doel | Hoe gemeten |
|---|---|---|---|
| 1 | Tijd tot de eerste offerte | < 15 min | Van `signup_completed` naar `first_offerte_concept` |
| 2 | Activatiegraad | ≥ 40% | Alle vier checklist-items af binnen zeven dagen |
| 3 | Terugkeer na een week | ≥ 50% | Inlog op dag 1 t/m 7 na aanmelding |
| 4 | Eerste échte offerte verstuurd | ≥ 70% | `first_offerte_sent` binnen 30 dagen |
| 5 | AI-gebruik | ≥ 30% | `ai_wizard_used` gedeeld door alle offertes |

De **north-star-metric** is het aantal verstuurde offertes per actieve klant per week — de handeling waar klanten de meeste tijdwinst voelen. Daalt hij, dan zie je churn twee tot drie weken vóór hij betaalt.

Die gebeurtenissen worden echt weggeschreven — naar de tabel `activation_events`, met een trigger die de organisatie en gebruiker automatisch invult — en zijn te zien op `/admin/funnel`.

**Gezondheidsscore per klant** (in `/admin`): `activiteit × 0,4 + datarijkdom × 0,3 + adoptie × 0,3`. Onder de 30 is risico, onder de 15 kritiek.

---

# 3. De regels eronder

## De zeven ontwerpprincipes

1. **Taak boven module.** De navigatie volgt wat iemand doet, niet hoe de code is ingedeeld.
2. **Eén plek per begrip.** Als event-gegevens op twee plekken te wijzigen zijn, kiest de app er één en stuurt de andere door.
3. **Dagelijks zichtbaar, zeldzaam vindbaar.** Acht hubs in de zijbalk; al het overige achter ⌘K.
4. **De Vandaag-laag toont stand van zaken, geen kengetallen.** "Wat speelt er nu", niet "totale omzet Q2".
5. **Hub-namen zijn vrij van de eigen bedrijfsnaam.** "Voorraad", niet "Hop & Bites Stock" — anders werkt het nooit voor een andere caterer.
6. **De veldsituatie wint.** Lars met handschoenen gaat vóór Mathijs op een laptop, en die gaat vóór visuele schoonheid.
7. **AI stelt voor, de mens beslist.** Geen automatische acties; altijd een voorbeeld vooraf, altijd weg te klikken.

## D, A en H — de belangrijkste afspraak in de hele app

Elke functie waar AI bij komt kijken wordt eerst uit elkaar getrokken in taken, en elke taak krijgt een klasse. "Een beetje AI gebruiken" bestaat niet.

| Klasse | Wat het is | Wie beslist | Rol van het model | Testvorm |
|---|---|---|---|---|
| **D — Deterministisch** | Uit te rekenen uit data en regels. Precies één juist antwoord. | Code. Altijd. | Alleen tonen en uitleggen. Het model mag het getal **nooit** maken. | Unit tests met vaste in- en uitvoer |
| **A — AI-geredeneerd** | Oordeel, taal, prioritering, creativiteit. Geen enkel juist antwoord. | Het model, binnen een prompt-contract. | Volledig producerend. | Evals plus steekproef door mens |
| **H — Hybride** | Model stelt voor, code toetst aan een harde grens, mens tekent. | Alle drie, in die volgorde. | Voorstel binnen een door code afgebakende ruimte. | Contract tests op de validator, evals op het voorstel, audit-log op de bevestiging |

> **De harde regel**
> Gaat het naar buiten (klant, leverancier) of is het onomkeerbaar (geld, voedselveiligheid, wet)? → **nooit vanzelf, altijd goedkeuring.**
> Blijft het binnen en is het terug te draaien? → **mag zelfstandig.**

**Beslisboom:** (1) berekenbaar uit data die we hebben? → D, het model komt er niet aan. (2) verlaat het het bedrijf of is het onomkeerbaar? → H met verplichte goedkeuring, ook als het model het zeker weet. (3) blijft het binnen en is het terug te draaien? → A, mag zelfstandig. (4) twijfel? De zwaardere klasse wint.

**Voorbeelden van D** — een recept opschalen van 40 naar 65 gasten, gastronorm-volume en aantal bakken, kerntemperaturen en koeltijden, foodcost en marge, de BTW-splitsing, allergenen (afgeleid uit koppeltabellen, nooit uit modelkennis), en het terugrekenen van een deadline.

**Voorbeelden van A** — de kok-coach die uitlegt waarom een hollandaise schift, de toon van een offerteconcept, de volgorde in de dagbriefing, social-content, een menusuggestie bij een aanvraag.

**Voorbeelden van H** — receptuur ontleden (grens: ingrediënten moeten matchen op catalogus of componenten), receptuur ontwerpen (grens: sjabloon, bestelbaarheid, doseerbereik, allergenen, afwerktijd), ingrediëntprofiel vullen, een conceptbestelling (grens: alleen catalogusproducten, hoeveelheden uit de D-berekening, bedrag-plafond), een e-mail aan een klant (grens: bedragen uit de offerte-record, niet uit de tekst).

## De rekenmodules waar niets omheen mag

Voor elke som die geld raakt is er precies één module. Alle schermen gebruiken die, en niets anders.

| Module | Waarvoor | De regel |
|---|---|---|
| `lib/format.ts` | Elk bedrag op het scherm | Nederlandse notatie: punt als duizendtal, komma als decimaal, spatie na het euroteken |
| `lib/menuMargin.ts` | Marge op menuniveau | (menuprijs − som van gerechtkostprijzen) ÷ menuprijs. Het gerecht is een signaal, het menu is het oordeel |
| `lib/unitPrice.ts` | Grootverpakking → eenheidsprijs | Genormaliseerd naar per 100 g, per 100 ml of per stuk. Nooit AI-rekenwerk |
| `lib/btw-rules.ts` | BTW-tarief | AI mag de categorie voorstellen, het percentage komt altijd uit deze tabel — en is datumgebonden aan de factuurdatum, niet aan "vandaag" |
| `lib/costCalculations.ts` | Kostprijs per gerecht | Uit componenten en doseringen, niet uit een schatting |
| `lib/prijsControle.ts` | Verdachte inkoopprijzen | Wijst aan en stelt de vraag — verandert nooit zelf een bedrag |
| `lib/statuses.ts` | Statussen en hun kleuren | Eén woordenlijst voor offerte, event, factuur en order |
| `lib/related-entities.ts` | De verbindingen tussen entiteiten | offerte ↔ event ↔ factuur ↔ klant, zodat detailpagina's geen doodlopende weg zijn |

> **Geleerd, met schade:** een leeg veld verslaat een schatting die zich voordoet als feit. Waar een duur, een prijs of een hoeveelheid niet in de bron staat, blijft het veld leeg en zegt het scherm "onbekend". Ooit telde een onbekende kostprijs stilletjes als nul mee, waardoor marges er prachtig uitzagen. Sindsdien: per regel vastleggen waar het getal vandaan komt.

## Twee fouten die de app nu actief tegenhoudt

Beide zijn echt gebeurd, in echte data, en kosten geld:

- **De pakgrootte als dosering.** Gegrilde kippendij stond op 2,5 kg per gast — dat is de inhoud van het pak. Voor 35 gasten rekende de app 87,5 kilo kip uit, en zo kwam het op de bestellijst. Nu vraagt een dosering boven een halve kilo per gast: *bedoel je het pak?*
- **De pakprijs als eenheidsprijs.** Diezelfde kip kwam uit op €0,60 per kilo omdat €5,99 met eenheid "kg" gelezen werd als de prijs voor de hele doos van tien kilo. De controle vindt dit nu: van 5.238 producten met een pakinhoud zijn er 182 verdacht. De grootste groep is één import-fout: soep- en sausconcentraten waar de parser de opbrengst uit de naam ("opbrengst 38 ltr, bus 1,52 kg") als pakinhoud nam.

## Nog een paar vaste afspraken

- **Catalogusprijs is de basis, niet de factuur.** Een leverancier die ~10% opslag rekent is akkoord; bonnen worden vergeleken, prijzen worden nooit overschreven.
- **Inkoop-invoer begint bij de groothandel.** Een zoekbalk over de prijslijst-catalogus, nooit een vrij naamveld waar je maar wat intypt.
- **Behoud functies voor andere klanten.** Wat Mathijs zelf niet gebruikt maar een andere caterer wél kan gebruiken, blijft staan.
- **Toevoegen en bewerken horen in een rechter lade**, niet in een gecentreerde modal.

---

# 4. Hoe het gebouwd is

## Het fundament

| Onderdeel | Keuze | Waarvoor |
|---|---|---|
| Raamwerk | Next.js 16.2 met React 19.2 (App Router) | Pagina's die deels op de server en deels in de browser draaien — snel eerste beeld, toch levendig |
| Taal | TypeScript 6 | Fouten die anders pas bij een klant opvallen, vallen al bij het opslaan op |
| Database | Supabase (PostgreSQL) in Frankfurt | ~110 tabellen, rijbeveiliging per organisatie, opslag voor foto's en PDF's, inloggen |
| AI | Anthropic SDK 0.95 — Haiku 4.5, Sonnet 4.6, Opus 4.7 | Goedkoop model voor eenvoudig werk, duur model alleen waar het loont |
| Uiterlijk | Tailwind 3.4 plus eigen CSS-variabelen | Acht kleurstellingen, per klant om te zetten |
| Hosting | Vercel, regio `fra1` | Frankfurt — naast de database. Stond het in Washington, dan kostte elke vraag ~140 ms extra |
| Betalen | Mollie (iDEAL) | Aanbetaling door de klant én het abonnement zelf |
| Boekhouden | Moneybird (OAuth) en Exact Online | Facturen en bonnen doorzetten |
| E-mail | Resend | Offertes, facturen, herinneringen, boekhouderpakket |
| PDF | react-pdf en jsPDF | Offertes, facturen, menukaarten, HACCP-rapporten |
| Kalender | FullCalendar | Agenda-weergaven |
| Tabellen | TanStack Table v8 | Sorteerbare datalijsten |
| Kaarten | MapLibre GL | Routes bij de rittenregistratie |
| Tekenen | Konva / react-konva | De plattegrond-editor |
| Testen | Vitest (73 testbestanden), Playwright, Promptfoo | Rekenwerk, schermen én de AI zelf |

## De lagen, van buiten naar binnen

1. **De poort** — `src/proxy.ts`. Controleert bij elk verzoek of je ingelogd bent, laat publieke routes door (klantportaal, aanvraagformulier, webhooks, cron) en handelt oude adressen af met een doorverwijzing.
2. **De schil** — `AppShell`. Beslist welke omlijsting je krijgt: geen enkele op inlog- en klantpagina's, volledig scherm op de kookborden, en de gewone app met zijbalk daarbuiten.
3. **De pagina's** — 103 stuks, waarvan de zwaarste hun gegevens op de server ophalen en alleen de interactie aan de browser overlaten.
4. **Serveracties** — 20 `actions.ts`-bestanden. Opslaan en wijzigen gaat hierlangs, met validatie en een controlespoor, in plaats van rechtstreeks vanuit de browser.
5. **De data-toegangslaag** — `src/lib/dal/`. Alle sommen die geld raken (bestelvoorstel, vraagberekening, pakafronding, prijsverversing, componentingrediënten, menusjablonen) staan hier, apart en getest.
6. **De API** — 198 routes. Alles wat AI aanroept, wat een externe partij aanroept, of wat te zwaar is voor de browser.

`src/lib` telt 255 modules; `src/components` telt 198 componenten.

## Meerdere bedrijven in één app

Elke rij in elke tabel draagt een `organization_id`. De database zelf weigert rijen van een andere organisatie te tonen — niet de app, de *database*. Dat heet rijbeveiliging (RLS), en het is de reden dat één installatie veilig meerdere caterers kan bedienen.

> **De valkuil daarbij:** bij het *opslaan* van een nieuwe rij moet de organisatie altijd expliciet worden meegestuurd. Er zijn geen standaardwaarden of triggers die dat stiekem doen (op `courses` en `event_allergies` na). Een hele testronde bracht 17 plekken aan het licht waar dat ontbrak — inklokken, de AI-wizard, nieuw event, onboarding, klanten, facturen — en waar opslaan dus stil mislukte.

Serverroutes gebruiken één wikkel, `withTenantAuth`, die inlog en lidmaatschap controleert vóór de route zelf iets doet. Platformbeheerders worden apart herkend aan hun e-mailadres in een omgevingsvariabele.

## Het uiterlijk: acht kleurstellingen uit zes tokens

Een thema is niet een stapel CSS maar zes waarden — achtergrond, tekst, kaart, primair, accent, secundair — plus of het licht of donker is. Daaruit rekent `themeTokens.ts` de tientallen afgeleide kleuren uit, inclusief een correctie zodat gedempte tekst op lichte thema's leesbaar blijft (die kwam op één thema uit op 3,2:1 en moest naar de WCAG-norm).

De acht: **Smoke & Steel, Drents Eik, Brandstapel, Nordic Graphite** (donker) en **Witte Berken, Studio Paper, Moestuin, Zandstrand** (licht). De keuze staat in een cookie, zodat de eerste weergave meteen goed is en er geen flits van het verkeerde thema komt.

Lettertypen komen via `next/font` van het eigen domein — DM Sans voor tekst, Outfit voor koppen, IBM Plex Mono voor getallen, Playfair en Oswald voor menukaarten. Eerder werden ze bij Google opgehaald, wat een DNS-, TLS- en downloadronde vóór het eerste beeld kostte.

> **Let op bij kleuren:** de standaard shadcn-tokens (`bg-primary`, `bg-background`, `text-muted-foreground`) zijn in dit project **niet gedefinieerd** en doen dus niets — gebruik `var(--brand)`, de `kf-`-klassen of het `mr-drawer`-patroon.

## Werkt ook zonder internet

De app is installeerbaar als telefoon-app (PWA) en heeft een service-worker. Voor een event kun je *offline-modus* aanzetten: er wordt een momentopname van dat ene event in de browser-database (IndexedDB) gezet, en alles wat je daarna wijzigt komt in een wachtrij die bij herstel van de verbinding wordt weggeschreven. HACCP-registraties werken sowieso offline — een keuken op een weiland heeft zelden bereik.

## Zes manieren waarop gegevens naar binnen komen

- **Foto of PDF van een bon** — slepen, plakken, camera of bestandskiezer. Wordt gelezen door een model met beeldherkenning, waarna jij de regels bevestigt.
- **E-mail** — een Cloudflare Email Worker vangt post op `pl-{naam}@in.bbqarchitect.app`, controleert de HMAC-ondertekening en zet bijlagen klaar in een staging-bucket. Leveranciers kunnen hun prijslijst dus gewoon mailen.
- **Browser-uitbreiding** — een Chrome-extensie (Manifest V3, Chrome/Edge 120+) haalt prijzen op vanaf de ingelogde leverancierssite. Hervatbaar: valt hij uit, dan pakt hij de draad op waar hij was. Geen `<all_urls>`-permissie maar per-leverancier host-toestemming. Het rekenwerk leeft server-side; de extensie leest alleen bronvelden en ruwe tekst.
- **Prijslijst-PDF's in bulk** — tot 25 tegelijk. De eerste realtime binnen 30 seconden, de rest via de goedkope Batch API die 's nachts wordt opgehaald.
- **UBL en bankafschriften** — elektronische facturen (UBL-XML) en MT940-afschriften worden gelezen en tegen je facturen afgeletterd.
- **Gewoon typen** — overal met een zoekveld dat in de leverancierscatalogus zoekt.

## Wat er 's nachts vanzelf gebeurt

| Tijd | Wat | Waarom |
|---|---|---|
| 03:00 | Gastnamen op plattegronden anonimiseren | Privacy — namen hoeven na het event niet te blijven staan |
| 04:00 | Batch-prijslijsten ophalen | De goedkope verwerking van de vorige dag binnenhalen |
| 04:00 | Markt-pulse verversen | Anonieme prijstrend over meerdere klanten heen (minimaal 5 deelnemers) |
| 04:15 | Receptkostprijzen herberekenen | Nieuwe inkoopprijzen doorrekenen naar componenten en gerechten |
| 05:30 | Google Agenda synchroniseren | Events in je eigen agenda |
| 06:00 | Financiële samenvatting | Zodat het dashboard 's ochtends klaar staat |
| 07:00 | Marge-alarm scannen | Prijsstijgingen die open offertes raken |
| 1e v/d maand | Vergeten ritten signaleren | Kilometeradministratie sluitend houden |

> **Een les die geld kostte:** op het gratis Vercel-pakket mag een taak hooguit één keer per dag draaien. Stond er één op "elk uur", dan mislukte *elke* publicatie stil. Vandaar dat alles hierboven dagelijks is.

---

# 5. De navigatie

De zijbalk toont alleen hub-titels; de onderdelen klappen uit voor de hub waar je in zit. De routes zelf zijn nooit veranderd bij een herindeling — alleen de groepering. Oude adressen blijven werken via doorverwijzingen. De enige echte bron is `src/lib/navigation.tsx`.

| Hub | Deur | Wat eronder hangt |
|---|---|---|
| **Vandaag** | `/` | Vast bovenaan. De verkeerstoren |
| **Plannen** | `/agenda` | Agenda · Events |
| **Verkoop** | `/offertes` | Aanvragen · Arrangementen · Offertes · Klanten |
| **Keuken** | `/gerechten` | Gerechten · Componenten · Kookbord · Menu-analyse |
| **Inkoop & Voorraad** | `/voorraad` | Voorraad · Inkoop · Leveranciers · Bonnen scannen · Bonnenkistje · Inkoopprijzen |
| **Geld** | `/financien` | Financiën · Facturen · Boekhouder |
| **Team & Operatie** | `/uren` | Uren · Materieel · Rittenregistratie · Logistiek |
| **Systeem** | `/systeem` | Instellingen · Gebruikers · Integraties · Mailbox · Website · Help · Platformbeheer |

## De vier ingangen

- **Zijbalk** — op laptop. Acht hubs, aanraakvlakken van minstens 44 pixels, de actieve hub klapt open.
- **Onderbalk** — alleen op telefoon. Vijf tabs: Vandaag · Plannen · Verkoop · Menu · Meer. "Geld" viel eraf zodat "Verkoop" erin paste — dat is dagelijks werk, geld is wekelijks.
- **⌘K — het commandopalet** — ruim 35 vaste bestemmingen plus live zoeken door events, offertes, facturen, gerechten, voorraad en klanten. Ook de plek waar je de AI direct een vraag stelt.
- **De zwevende knop** — rechtsonder op tablet en laptop: snel naar een bestellijst of een nieuw event. Verdwijnt op telefoon.

Daarnaast: **broodkruimels** bovenaan elke pagina, een **actieve-bron-pil** die onthoudt met welk event of welke offerte je bezig bent zodat de AI dat weet, en **relatie-pillen** op detailpagina's waarmee je van offerte naar event naar factuur naar klant kunt doorklikken.

---

# 6. Elke pagina, één voor één

Alle 103 routes, gegroepeerd per hub. Doorverwijzingen — oude adressen die nog leven voor bestaande bladwijzers — staan als *(redirect)*.

## Vandaag

### `/` — Vandaag
De startpagina, en het drukst bezochte scherm van de app. Hij haalt dertien tabellen tegelijk op en zet die om in één beeld: wat speelt er nu, wat vraagt aandacht, en wat kan ik in één klik doen. Bewust géén kwartaalcijfers — dat is de taak van Geld.

- **Begroeting** die meebeweegt met het uur, plus je voornaam.
- **Event-held** — het eerstvolgende event groot in beeld: dagen te gaan, gasten, omzet, locatie, status, en of gangen, allergieën en prep al ingevuld zijn.
- **AI-snelvragen** — vier knoppen die een vraag met de context van dat event openen in een zijlade, met grafiek.
- **Negen kengetallen** met trendpijl en doorklik: dagen tot het volgende event, events deze week, omzet deze maand, pijplijn aan offertes, openstaande facturen, gemiddelde marge (doel ≥ 60%), voorraadwaarde, items onder minimum, bonnen te boeken.
- **Bedrijfsgrafieken** — omzetverdeling per eventtype, zes maanden omzet, top-5 uitgaven per leverancier.
- **Dagbriefing** — een korte tekst die uit ruim twintig regels de belangrijkste punten kiest.
- **Aandachtspaneel** — rode en oranje kaarten met een concrete knop: bestellen voor events binnen de levertijd van je traagste leverancier (minimaal 8 dagen), bestellingen die verzonden maar niet geleverd zijn, aanvragen die op opvolging wachten, voorraad onder minimum, facturen ouder dan 30 dagen, offertes met marge onder 40%, ontbrekende menukaarten, events zonder offerte, en prijsschommelingen die open offertes raken.
- **Tijdlijn** van komende verplichtingen, inclusief de BTW-deadline.
- **Onboarding-checklist** en de **persona-quiz** voor nieuwe gebruikers, allebei weg te klikken.
- **Nieuw event** en **Rit registreren** als vaste knoppen bovenaan.

*Data: events, facturen, offertes, inventory, prep_suggestions, gerechten, prep_tasks, klanten, bonnen, leveranciers, concept_inkoop_orders, courses, event_allergies, marge_alerts, leads.*

## Plannen — `/agenda`

### `/agenda` — Agenda
Vier kalenders over elkaar: events, prep-deadlines, bestelmomenten en persoonlijke afspraken. Elk met eigen kleur en aan- of uit te zetten.
- Drie weergaven: **maand, week en lijst** — de keuze staat in het adres, dus een link is deelbaar.
- Filters op kalender, status en categorie, met pillen die tonen wat er actief staat.
- **Conflictdetectie** — twee events op één dag, te weinig tijd ertussen, dubbele bezetting.
- Persoonlijke afspraken toevoegen, en eigen categorieën beheren.
- Knop om vanaf hier meteen een inkooplijst te genereren.
- Kengetallen bovenaan en een detailkaart per event bij aanklikken.
- Google Agenda-koppeling en iCal-export.

### `/events` — Events
De lijst van alle opdrachten, als tabel of als kaartenraster. Kolommen: event, datum, klant, gasten, locatie, omzet, status. Vijf statussen met eigen kleur: concept, optie, bevestigd, afgerond, geannuleerd. Zoeken en filteren; klik gaat naar de event-hub.

### `/events/[id]/hub` — Event-hub
Het hart van één opdracht — met ruim 1.500 regels het grootste scherm van de app. Bovenaan een tabbalk naar de zeven gezichten van hetzelfde event (Overzicht · Klantgesprek · Prep · HACCP · Logistiek · Service · Reflectie).

- **Werkstroom in vijf fasen**: Offerte → Acceptatie → Voorbereiding → Eventdag → Afronding, met per fase of hij af, actief of nog te doen is.
- **Voortgangsring** die de tijd tot het event toont over een vaste horizon, zodat een vers event geen leeg rondje is.
- **Menu-overzicht** per gang, opgehaald uit de gekoppelde offerte, met allergenen per gerecht.
- **Menukaart**: kies een sjabloon en open de opmaak-editor — het tweede toegangspunt naast de offerte.
- **Klantblok**: bellen, mailen, route in Google Maps, contactgegevens.
- **Financieel**: offertebedrag, factuurstand, openstaand saldo (uit de factuurregels).
- **Inkooplijst-kaart**: wat dit event aan producten vraagt.
- **HACCP-kaart**: staat er al een plan voor deze dag.
- **Draaiboek**: tijdlijn met eigen regels, bewerkbaar en op te slaan.
- **Prep-fasen** gegroepeerd per dag vóór het event (T-5 tot T-0).
- **Kok-coach-kaart** per fase met advies voor die dag.
- Status omzetten met directe terugkoppeling, en terugdraaien als het opslaan mislukt.

### `/events/[id]/field` — Veldweergave
Hetzelfde event, maar voor één hand op een telefoon met vluchtige aandacht. Alle knoppen minstens 56 pixels. Naam/datum/locatie/gasten groot, route met één tik, klant bellen met één tik, mijn uren starten of stoppen in twee tikken, materieel-checklist uit de paklijst, doorsteek naar de HACCP-veldmodus.

### `/events/[id]/service` — Servicebord
De avond zelf, op volledig scherm zonder app-omlijsting.
- **Gangenrail** links, **focuskaart** in het midden met de gang die nu draait, **straks** en een mini-plattegrond rechts.
- Vier statussen per gang: wachtend → in bereiding → klaar voor uitgifte → geserveerd.
- **Rook-strip** bovenaan: korte instructies over wat er op de smoker moet gebeuren.
- **Kookkaart** als schuiflade over het hele scherm, met vier tabbladen: Actieplan · Mise en place · Per tafel · Kwaliteit. Per gerecht de bereidingswijze stap voor stap, de plating, de vegetarische variant, en per tafel wie wat krijgt.
- Verbruik wordt bij het afmelden van een gang **server-zijdig van de voorraad afgeboekt**, met eenheidsomrekening en één keer per gang (geen dubbeltelling).
- **Opruim-checklist** aan het eind: smokers uit en dom afgekoeld, as koud in metalen bak, bain-maries leeg, cambros spoelen, inox/GN-trays inpakken, snijplanken en slicers wassen, service-line afbreken, restanten apart voor verspillingsregistratie, vuil naar de container, locatie-eindcheck, catering-truck inladen, klant bedanken.
- **Feedback-dump** — ruwe aantekeningen die de AI omzet in kernpunten en actiepunten voor de volgende keer, plus een PDF-rapport.
- Instructiepijlen bij het eerste gebruik, afvinklijstjes bewaard in de browser.

### `/events/[id]/service/plattegrond` — Plattegrond
Het tweede tabblad van het servicebord: de zaal van bovenaf. Tafels en zones tekenen en verslepen, **gast-pins met allergeenring** (je ziet aan de tafel wie wat niet mag), servicezones toewijzen aan medewerkers, rookpluim van de smoker als oriëntatiepunt, en een AI-voorstel voor de indeling dat jij bevestigt. Gastnamen worden 's nachts geanonimiseerd.

### `/events/[id]/logistiek` — Logistiek per event
Zes uitklapbare kaarten met de checklists voor dit event: wat mee moet, wie rijdt, wat er op locatie moet staan.

### `/events/[id]/menukaart-editor` — Menukaart vanuit het event
Spiegelbeeld van de editor bij de offerte: je begint bij het event, de app zoekt de gekoppelde offerte erbij. De menukaart woont in de offerte — één bron, twee deuren. Geen offerte gekoppeld? Dan een lege staat met de weg terug.

### `/events/[id]/reflectie` — Reflectie
Opent pas ná het event. Vier vragen die samen bepalen of de terugblik compleet is: een cijfer, wat ging goed, wat kan beter, en bij een cijfer onder de zeven ook de oorzaak.

### `/klantgesprek` — Klantgesprek
Het intake-formulier dat je invult terwijl je bij de klant zit. Verschijnt met een event-tabbalk als je hem vanaf een event opent.
- Klantgegevens, type klant, eventdetails, locatie-aantekeningen, start- en eindtijd.
- Aantal gasten, waarvan vegetarisch, **allergieën en dieetwensen per gast**.
- Menuwensen, serveerwijze, dranken, extra materieel, tafels en stoelen.
- Budget en prijs per persoon, met een geschat totaal.
- **Claude stelt een menu voor** op basis van wat je hebt opgeschreven.
- Vrije gespreksnotities die de AI omzet naar gestructureerde velden.
- Opvolgdatum en vastgelegde toestemming.

### `/prep-counter` — Prep-teller
De takenlijst voor één event: links de taken, rechts de gekozen taak met het gekoppelde gerecht, de ingrediënten en de hoeveelheden. Toont de tijd tot het event. Met een inline AI-studio.

### `/haccp` — HACCP
Voedselveiligheid in vijf stappen: **Kies → AI-plan → Aanpassen → Loggen → Dossier.** Werkt door als de verbinding wegvalt of een migratie ontbreekt: dan draait hij op voorbeelddata met een duidelijk merkteken.
- Kies een event; de AI schrijft binnen enkele seconden een controlelijst, stromend meegetypt (SSE).
- Pas het plan aan naar je eigen keuken.
- Registreer metingen: kerntemperatuur, koeling, vriezer, serveren, handhygiëne, oppervlaktereiniging, kruisbesmetting, tijd uit koeling.
- **Corrigerende actie** bij een afwijking — vijf vaste sjablonen (opnieuw verwarmen, extra koelen, weggooien, sensor controleren, keuken-chef inschakelen), met begeleide stappen en aftekening. Registraties worden nooit gewijzigd, er komt altijd een regel bij (append-only).
- **Dossier**: alles op datum, met norm, waarde, uitvoerder en status, exporteerbaar als PDF voor de NVWA.
- **Trends** en een tijdlijn over de middelen heen.
- Chatvenster om een vraag over de voedselveiligheid van dit event te stellen.

### `/haccp/field` — HACCP veldmodus
Temperatuur registreren in drie tikken, met knoppen van minstens 56 pixels. Kies het type (kip, rundvlees, varkensvlees, vis, salade, dessert, koeling, vriezer, serveren, anders), tik de temperatuur, klaar. Toont de laatste vijf registraties.

### Doorverwijzingen
- `/events/[id]` *(redirect)* → `/events/[id]/hub`
- `/plannen`, `/event-planner` *(redirect)* → `/agenda`

## Verkoop — `/offertes`

### `/verkoop/leads` — Aanvragen
De pijplijn van binnengekomen aanvragen, met vijf stadia: nieuw → in gesprek → offerte → gewonnen of verloren. Bovenaan: open leads, gewonnen waarde, win-ratio, en hoeveel er te lang stilliggen.
- Elke aanvraag met naam, datum, gasten, budget, indicatie-omzet en herkomst (formulier of zelf samengesteld arrangement).
- **AI-conceptmenu** per aanvraag, te gebruiken in de offerte.
- Doorzetten naar een offerte — de wizard neemt de gegevens over via een concept in de browser-opslag.
- Publieke formulierlink kopiëren om te delen of op de site te zetten.
- Aanvragen die te lang stilliggen komen ook op de startpagina terecht.

### `/verkoop/arrangementen` — Arrangementen
De bouwer achter *"stel zelf je offerte samen"*. Jij bepaalt de categorieën en de niveaus, de klant kiest en ziet een indicatieprijs.
- Naam, korte uitleg, icoon, minimum en standaard aantal gasten.
- Categorieën (gangen) met per categorie meerdere niveaus en prijzen.
- Eén niveau markeren als *populairst*.
- **Trechter**: hoeveel mensen het formulier openden, startten en verstuurden (bekeken / gestart / aangevraagd).
- Publieke link, en een waarschuwing bij niet-opgeslagen wijzigingen.

### `/offertes` — Offertes
Het commerciële hart. Links de lijst, rechts de bewerker met vijf stappen: **Wie · Wat · Hoeveel · Eenmalig · Marge.**
- **Wie** — klant kiezen of nieuw aanmaken, adres, e-mail, datum, geldig tot (standaard 30 dagen).
- **Wat** — menu samenstellen via de menukiezer, een opgeslagen menu ophalen, of direct regels typen.
- **Hoeveel** — regels met aantal, omschrijving en prijs; kortingsregels krijgen een eigen pil.
- **Eenmalig** — vaste kosten los van het aantal gasten (reiskosten, huur, crew).
- **Marge** — foodcost, omzet, nettowinst en marge live meerekenend terwijl je typt.
- **AI-offerte-wizard** — klantnaam, datum, gasten, waarvan vegetarisch, aantal gangen en prijs per persoon; de AI stelt een menu voor. Alleen gerechten die als "beschikbaar in wizard" zijn aangevinkt doen mee. De wizard bewaart je concept zeven dagen in de browser.
- **Marge-drift-banner** — verschijnt als inkoopprijzen zijn gestegen sinds je de offerte opstelde, met de grootste impact eerst; te snoozen of af te handelen.
- Na acceptatie als vervolgstap in beeld: event bijwerken naar bevestigd, factuur aanmaken, prep-taken inplannen, servicegangen aanmaken, inkooplijst genereren, bevestiging sturen.
- Zes statussen: concept, verzonden, geaccepteerd, afgewezen, verlopen, geannuleerd.
- Een offerte vanuit een actief event adopteert dat event (geen duplicaat) en erft gasten × prijs.

### `/offertes/[id]/view` — Offerte-detail
De offerte als document, met de commerciële analyse ernaast. Regels gegroepeerd (smoker-hoofdgerechten, bijgerechten en sauzen, crew en logistiek, overig), **brutomarge, inkoopratio en marge per hoofd**, **vergelijking met eerdere offertes** van dezelfde klant, en **Pitmaster-suggesties** (bijvoorbeeld: schrap de zwakste regel of maak hem optioneel). Bewerken, dupliceren, nieuwe versie maken, versturen.

### `/offertes/[id]/menukaart-editor` — Menukaart-editor
De opmaak van de menukaart die de klant krijgt. Tien sjablonen in het register: Restaurant, Smokehouse, Modern, Minimal, Rustic, Duotone, Editorial, Tasting, Foodtruck (21×21) en Uitnodiging (21×21).
- Sjabloon kiezen, kleuren aanpassen, teksten per gang bewerken (met AI-suggesties).
- De stijl valt van je bedrijfsinstellingen naar de offerte: standaard erft elke nieuwe offerte je huisstijl, maar een offerte met eigen aanpassingen houdt die.
- Direct als PDF te openen en te printen.
- Elk sjabloon heeft een vastgelegde referentie-afbeelding in de tests, zodat een wijziging in de opmaak zichtbaar wordt vóór hij bij een klant belandt.

### `/klanten` — Klanten
Het klantenbestand met de historie erbij: per klant het aantal offertes, events en facturen, en de totale waarde. Contactgegevens, bedrijf, adres, type klant, notities. Vanaf de klantkaart direct een offerte opstellen of een event aanmaken. Opslaan gaat via serveracties met veldvalidatie — een fout verschijnt onder het veld zelf.

### `/facturen` — Facturen
Facturen opstellen, versturen en innen. Regels met aantal, omschrijving, prijs en BTW-percentage, plus vervaldatum en betalingsregistratie. Factuurnummer met eigen voorvoegsel, PDF downloaden of per e-mail versturen, betalingen bijhouden, doorzetten naar Moneybird. Concepten worden automatisch bewaard terwijl je typt.

### Doorverwijzingen
- `/verkoop` *(redirect)* → `/offertes`
- `/offerte-editor` *(redirect)* → `/offertes` — de losse editor is uitgefaseerd, de wizard is de enige route

## Keuken — `/gerechten`

### `/gerechten` — Gerechten
De bibliotheek van wat je verkoopt. Elk gerecht is opgebouwd uit componenten en draagt zijn eigen kostprijs, allergenen en receptuur. Vier tabbladen bovenaan: Gerechten · Componenten · Menukaarten · Analyse.
- Per gerecht een lade met tabbladen: **Wat** (naam, gang, beschrijving, foto), **Bouw** (componenten en doseringen), **Kostprijs**, **Receptuur** (bereidingswijze en stappenlijst), **Allergenen**, **Service** (servicetip, wijnsuggestie, serveerfoto) en **Statistieken**.
- **Compleetheidsmeter** per gerecht en over de hele bibliotheek — bijvoorbeeld de allergenen-dekking.
- **Beschikbaar in wizard** — alleen aangevinkte gerechten verschijnen in de offerte-wizard.
- **Signature-uitlichting** voor je paradepaardjes.
- **Allergenen laten detecteren** door de AI, met bevestiging per gerecht.
- **Vervangingsadvies** — bij een duur of onverkrijgbaar ingrediënt een alternatief met prijsverschil.
- **Prijstrend** als minigrafiek per ingrediënt.
- Twee AI-lades: de **Bedenker** (vrij brainstormen) en de **Pitmaster** (gerichte vragen), allebei via de knop of via een adres met `?modal=`.
- Een menu samenstellen en opslaan als sjabloon.

### `/gerechten/[id]` — Gerecht-detail
Eén gerecht op een eigen pagina, met de kostprijs live berekend op de server en een uitsplitsing per ingrediënt. Per regel is te zien waar de prijs vandaan komt en of hij vertrouwd mag worden. Naast elke regel een knop voor vervangingsadvies.

### `/gerechten/componenten` — Componenten
Met bijna 3.800 regels het grootste losse scherm. Componenten zijn de bouwstenen: wijzig er één, en elk gerecht waar hij in zit past mee. Twee soorten: **zelf bereid** (met eigen receptuur en onderliggende ingrediënten) en **ingekocht product** (rechtstreeks uit een leverancierscatalogus).
- **Mappenboom** in Drive-stijl, met slepen tussen mappen.
- Per component: naam, categorie (food of non-food), basis-hoeveelheid en eenheid, kosten, allergenen, beschrijving.
- **Terugrekenen vanaf een grootverpakking** naar een eenheidsprijs — met de rekenhulp die de pakprijs-valkuil dichtzet.
- **Snijverlies** als keuze in gewone taal: alles (100%), beetje bijsnijden (90%), vet en pees eraf (75%), flink bijsnijden (65%).
- **Koppeling aan een leveranciersproduct**, zodat de prijs meebeweegt met de catalogus.
- **Live impact-voorbeeld**: verander je de prijs, dan zie je meteen wat dat met de foodcost van de betrokken gerechten doet.
- **"Er zit in" en "wordt gebruikt in"** — beide kanten van de keten zichtbaar.
- **HACCP-punten** per component: handhygiëne, kerntemperatuur, koeltemperatuur, kruisbesmetting, oppervlaktereiniging, tijd uit koeling.
- Scannen van een kant-en-klaar product met de camera, prijslijst importeren, of tekst plakken uit een bestellijst.
- Sorteren op meest gebruikt, laatst toegevoegd, of nergens gebruikt bovenaan.

### `/gerechten/uit-catalogus` — Receptuur uit de groothandel
*"Kip van Beef Club, de marinade maak jij."* Je pint echte catalogusproducten vast, de AI bouwt het gerecht daaromheen en kiest de rest bij voorkeur uit wat er bij jouw leveranciers te koop is.
- Producten aanwijzen die erin moeten.
- De AI levert ingrediënten, bereiding en stappen voor de planning.
- **De kostprijs komt niet van de AI** maar wordt achteraf uit de echte catalogus afgeleid.
- Het scherm zegt eerlijk hoeveel regels wél en niet een prijs kregen — een som die vijf van de twaalf regels als nul meetelt is geen kostprijs maar een ondergrens, en zo staat hij er ook.
- **Dit wordt de standaardroute voor nieuwe gerechten** (zie deel 10).

### `/gerechten/menukaarten` — Menukaarten
De lijst van opgeslagen menu-sjablonen: naam, aantal gangen, aantal gerechten, basisprijs per persoon, of hij de standaard is, en wanneer hij voor het laatst wijzigde.

### `/gerechten/menukaarten/[id]` — Menu samenstellen
De samensteller. Adres `nieuw` begint leeg, een nummer opent een bestaand menu. Gangen en gerechten worden vooraf op de server opgehaald zodat het scherm meteen staat.

### `/gerechten/analyse` — Menu-analyse
Welke gerechten verdienen hun plek. Twee weergaven in één pagina, te kiezen in het adres: `?view=performance` toont de BCG-matrix, `?view=health` het gezondheidsraster.

### `/marges` — Marges
De kostprijs- en winstanalyse over de hele kaart heen, in de bekende vier vakken: **⭐ Stars** (populair en winstgevend), **🐴 Plowhorses** (populair, dunne marge), **🧩 Puzzles** (winstgevend, weinig verkocht) en **🐕 Dogs** (geen van beide). Winnaars en verliezers naast elkaar, gerechten selecteren en een menukaart indelen op basis van de matrix, detaillade per gerecht.

### `/keuken/kookbord` — Kookbord
Het prep-scherm voor de dagen vóór een event, op volledig scherm zonder app-omlijsting. Twee gezichten van dezelfde gegevens.
- **Mise-en-place** — per gerecht gegroepeerd, met per component wat er te maken is, de hoeveelheid (dosering per gast × aantal gasten), allergenen, bereidingswijze, HACCP-punten, smaakprofiel en notities. Afvinken met een veeg.
- **Werklijst** — de beste route door de prep. Bundelt dezelfde bewerking over recepten heen, toont handtijd naast wachttijd, geeft per plaats een budget (thuis is een ochtend, op locatie zijn het de minuten waarin tachtig mensen wachten), en vult dode tijd met wat je ondertussen kunt doen. Elke suggestie draagt zijn reden.
- **Taken plannen** — voor een bestaand event alsnog prep-taken laten genereren; hetzelfde codepad als bij offerte-acceptatie.
- Waar een duur nergens is opgeschreven staat er *duur onbekend*, geen geschat getal.

### `/m/gerechten` — Gerechten op de telefoon
Een uitgeklede mobiele weergave van de gerechtenlijst voor de operator op locatie (Lars-modus).

### Doorverwijzingen
- `/keuken/board` *(redirect)* → kookbord of service-plattegrond, afhankelijk van de modus
- `/recepten` *(redirect)* → `/gerechten` — recepten en gerechten zijn samengevoegd
- `/keuken`, `/inspiratie`, `/inspiratie/gerechten` *(redirect)* → `/gerechten`
- `/menu-engineering` *(redirect)* → `/marges` — "menu engineering" was te abstract als label
- `/bedenker`, `/gerechten/ai-pitmaster`, `/gerechten/allergen-queue`, `/gerechten/menu-analyse`, `/gerechten/insights`, `/gerechten/ingredienten` *(redirects)* → naar de bijbehorende modal of tab

## Inkoop & Voorraad — `/voorraad`

### `/voorraad` — Voorraad
Wat er in huis is, wat het waard is, en wat op raakt. Bijna 2.000 regels aan scherm.
- Voorraadstand per product met eenheid, categorie en waarde; totale voorraadwaarde bovenaan.
- **Par-niveau en bestelpunt** per product, met vier standen: op peil, voldoende, laag, op.
- **Dekking** — hoe lang je nog vooruit kunt gezien de geplande events.
- **THT-alarm** bij houdbaarheid binnen drie dagen.
- **Leveranciersvergelijking** per product, met "goedkoopst" gemarkeerd.
- **Prijshistorie** uit de inkoopprijzen-module, als grafiek.
- **Controlespoor** van elke voorraadmutatie: ontvangst, verbruik, telling, correctie, verspilling.
- **AI-voorraadadvies** met vaste vragen: wat is bijna op, wat bederft eerst, welke dure langzaamlopers heb ik. Antwoord op basis van de echte stand, als rapport te bewaren.
- Product toevoegen met AI-invulhulp, scannen, of handmatig; voorraadlijst als PDF.

### `/voorraad/nulmeting` — Keuken tellen
De looproute met je telefoon langs drie zones, om voor het eerst of opnieuw te tellen wat er staat. Per product: aantal pakken × pakinhoud, met rekenhulp. Foto erbij (de bucket is privé, dus de links worden in één keer ondertekend afgegeven). Toont wat je al geteld hebt, zodat je verder kunt waar je gebleven was; bestaat het product al, dan werkt hij bij in plaats van dubbel aanmaken.

### `/voorraad/historie/[id]` — Historie van één product
Het volledige spoor van één voorraaditem: alle mutaties, de prijsontwikkeling en de openstaande marge-alarmen. Beantwoordt vragen als *welke bon dronk deze voorraad op* en *hoe heeft de prijs zich ontwikkeld*.

### `/inkoop` — Inkoop
Eén vraag, één antwoord: *wat moet ik vandaag bestellen, per leverancier, om mijn minimumvoorraad op peil te houden én de events van de komende veertien dagen te kunnen koken?* De rekensom draait op de server en is volledig deterministisch — geen AI.
- Kaart per leverancier: naam, type, aantal regels, totaalbedrag, uiterste besteldatum, belknop.
- Per regel: product, hoeveelheid (direct aan te passen, met vertraagde opslag), prijs per eenheid, totaal, verwijderen, of overstappen naar een andere leverancier.
- **Ontbrekende leverancier** — een vastgezette balk bovenaan voor producten die nog nergens aan hangen, met een keuzelijst per regel.
- **Onderweg** — verzonden bestellingen, met een lade om per regel te bevestigen wat er werkelijk kwam. De voorraad gaat dan automatisch omhoog. Zolang niet alles binnen is blijft de bestelling openstaan voor het restant.
- **Factuur scannen naar voorraad** — één foto die tegelijk de boekhouding én de voorraad bijwerkt.
- Drie lege staten die elk iets anders zeggen: geen events gepland, wel events maar geen menu gekoppeld, of de voorraad dekt alles al.

### `/leveranciers` — Leveranciers
Wie je leveranciers zijn, wat ze verkopen en wanneer de prijzen voor het laatst zijn opgehaald. Met een toevoeg-wizard die vier importroutes kent, zodat een onbekende leverancier geen bouwwerk vraagt.
- Herkende portalen: Bidfood, Sligro, Hanos, Makro, Vuur & Rook, Baktotaal.
- Per leverancier: status, aantal producten, laatste synchronisatie, knop "sync nu".
- **Factuurvergelijking** — wijkt de factuur af van de catalogusprijs? Een opslag van rond de tien procent is normaal en akkoord; het gaat om het zichtbaar maken, niet om overschrijven.
- **Beoordelingslade** voor voorgestelde prijsmutaties: goedkeuren of afwijzen per regel.
- **Extensie-koppelpaneel** om de browser-uitbreiding aan te sluiten.

### `/leveranciers/[id]/producten` — Catalogus van één leverancier
De gesynchroniseerde producten met huidige prijs, verpakking en de **prijs per kilo, liter of stuk**. Zoeken gebeurt op de server, over alle producten — niet over de eerste honderd die toevallig binnen waren.

### `/leveranciers/[id]/prijslijsten` — Prijslijsten
De PDF's van deze leverancier, met slepen-en-neerzetten voor nieuwe. Per upload de status; klaar? Dan opent de beoordelingslade. Uploads zijn te annuleren, opnieuw te proberen of te verwijderen.

### `/leveranciers/bulk-upload` — Prijslijsten in bulk
Tot 25 PDF's tegelijk. De eerste wordt meteen verwerkt zodat je binnen dertig seconden ziet dat het werkt; de rest gaat via de goedkope Batch API die 's nachts wordt opgehaald. Alias-leren per klant.

### `/leveranciers/historie/[id]` — Leveranciershistorie
Wat je bij deze leverancier hebt uitgegeven: aantal bonnen, totaal, en de BTW gesplitst naar 9% en 21%. Vergrendelde maanden zijn als zodanig gemarkeerd.

### `/bonnen` — Bonnen scannen
Eén deur voor alle bonnen, die drie oude flows vervangt. Slepen, plakken uit het klembord, camera of bestandskiezer — foto, PDF, schermafbeelding of elektronische factuur (UBL-XML).
- Het model leest leverancier, datum, bedragen, BTW-splitsing en de regels.
- **Dubbelherkenning**: "deze bon staat al" of "lijkt op een bestaande factuur".
- Ontbreekt de leverancier, dan vraagt hij erom in plaats van te gokken.
- Jij bevestigt; pas dan wordt er weggeschreven.

### `/archief` — Bonnenkistje
Het doorzoekbare boekhoudarchief, gebouwd op zeven jaar bewaarplicht. Twee weergaven: kistje (kaarten) en tabel.
- **Zoeken tot op het woord** in de tekst van elke bon, met een fragment dat de gevonden term toont.
- Filters op periode, bedrag, soort (foto, PDF, e-mail), status en leverancier — allemaal in het adres, dus deelbaar.
- Voorbeeldweergave met ingebouwde PDF-lezer.
- **Boekhouderpakket exporteren** als ZIP, met BTW-samenvatting.
- **Deellink** voor je boekhouder: een adres met een sleutel erin, dat een bevroren selectie toont zonder dat hij hoeft in te loggen.
- Aparte inbox-lijst voor bonnen die per e-mail binnenkwamen.

### `/price-intelligence` — Inkoopprijzen
Met ruim 4.300 regels het op één na grootste scherm. Vier lanen.
- **Inbox** — de hoofdroute. Leveranciers mailen hun prijslijst naar jouw eigen adres `pl-{naam}@in.bbqarchitect.app`; de app leest hem uit en zet een beoordeling klaar. Per verwerking staat de kostprijs eronder.
- **Bonnen en facturen** — gescande documenten met controle of de regels optellen tot het totaal, of de BTW klopt, en of het factuurnummer aanwezig is. Waarschuwt bij dubbel ingeboekte facturen.
- **Prijslijsten** — mappen per leverancier, CSV-import, bestandsarchief.
- **Prijsbibliotheek** — prijsontwikkeling per categorie, leveranciersvergelijking, concrete besparingen, "elders kopen"-advies, en een AI-leveranciersanalyse.
- Elke uitlezing is te herzien vóór hij telt — nooit blind vertrouwen.

### Doorverwijzingen
- `/factuur-lezer` *(redirect)* → `/archief` — was een tussenpagina met drie links waarvan er één kapot was
- `/foto-archief` *(redirect)* → `/archief`

## Geld — `/financien`

### `/financien` — Financiën
Het financiële dashboard met de tabbladen die vroeger een aparte boekhoudpagina waren.
- **Winst & verlies**: netto omzet, totale kosten, personeelskosten, resultaat, theoretische foodcost.
- **BTW-overzicht**: af te dragen, terug te vorderen, saldo, voorbelasting gesplitst naar 9% en 21%.
- **Debiteuren en crediteuren**: nog te ontvangen, nog te betalen, netto positie, betaalratio.
- **Cashflow-prognose** over vier en dertien weken, met huidig banksaldo, vaste maandlasten, buffergrens en de week waarin het risico zit.
- **Aangifte**: BTW-concept voor de boekhouder, een "klopt het?"-controle vóór verzending, en een kwartaal vastzetten.
- **Bank**: MT940-afschrift importeren en afletteren tegen je facturen.
- **Verouderingsoverzicht** van openstaande posten en een waarschuwing bij te grote afhankelijkheid van één klant.
- **Kosten-afwijkingsdonut** die uitschieters aanwijst.
- **Markt-pulse** — anonieme prijstrend over meerdere klanten heen. Alleen zichtbaar als je zelf meedoet, alleen als er minstens vijf deelnemers zijn, alleen als percentage, nooit met leveranciersnaam.
- **Pitmaster Copilot**-kaart met het AI-budget van deze maand.
- XAF-auditbestand en UBL-export.

### `/geld/boekhouder` — Boekhouder
Het doel is groot: *de maandelijkse boekhouder vervangen.* Dagelijkse verwerking en de BTW-aangifte gebeuren in de app; alleen de jaarrekening en de IB blijven jaarlijks eigen werk. Vier tabbladen plus afsluiten.
- **Bonnen-stapel** — inkoopbonnen met een AI-voorstel voor de RGS-categorie en één tik om het over te nemen.
- **Verkoop** — verkoopfacturen met hun RGS-code.
- **Pakket** — genereer het maandpakket: PDF met de BTW-uitsplitsing per RGS, CSV met codes, ZIP met alle bonnen, en direct e-mailen naar je boekhouder.
- **Twijfel** — de gemarkeerde gevallen apart, zodat ze niet tussen de rest verdwijnen.
- **Afsluiten** — een maand vergrendelen en per kwartaal de exacte cijfers vastzetten.
- **Bon toevoegen**-lade: foto → uitlezen → per regel bevestigen of het ook naar de voorraad moet → wegschrijven als bon, voorraadmutatie én prijshistorie in één keer.

### `/administratie` — Administratie-overzicht
Een verzamelscherm met de administratieve kengetallen: omzet deze maand, openstaand, open lijsten, voorraadwaarde, items onder minimum, nieuwe klanten deze maand, de aftrek tot nu toe dit jaar en de urennorm van 1.225 uur.

### Doorverwijzingen
- `/boekhouding` *(redirect)* → `/financien` — twee financiële pagina's zijn er één geworden
- `/geld` *(redirect)* → `/financien`

## Team & Operatie — `/uren`

### `/uren` — Uren
In- en uitklokken, crew-uren en het maandoverzicht. Op de telefoon staat de klok-knop bovenaan, de status eronder en de eventkeuze onderaan — de volgorde waarin je ze op een eventdag nodig hebt.
- **Klokpaneel** voor jezelf, met de melding "aan het werk" als je loopt.
- **Crew klokken** — meerdere mensen tegelijk in- en uitklokken.
- **Maandoverzicht** per persoon: functie, tarief, diensten, uren, totaal.
- **Controlespoor** van alle klokhandelingen.

### `/uren/personeel` — Personeel
Het personeelsbestand: naam, functie, e-mail, tarief, contractvorm (vast contract, oproepkracht, freelance/zzp, stagiair) en of iemand actief is. Alleen actieve mensen verschijnen in het crew-blok.

### `/materieel` — Materieel
Begonnen als paklijst, uitgegroeid tot de hele keukeninventaris — smoker, pannen, machines, opslag. De geïnventariseerde vervangingswaarde ligt rond de €58.600.
- Per stuk: naam, categorie, aantal, status (in gebruik, aandacht nodig, defect), locatie, aanschafdatum, nieuwwaarde en valuta, afmetingen, materiaal, kleur, notitie.
- **Specificaties** als vrij veld, zodat een machine zijn eigen eigenschappen kan dragen.
- **Onderhoudslogboek** per stuk.
- **Product scannen** — foto of productlink erin, het model leest merk, type en specificaties eruit (drie tot acht seconden), jij keurt goed vóór het wordt opgeslagen.
- **Gastronorm tellen** — de maten van GN-bakken liggen wereldwijd vast (EN 631-1) en staan al in de kennisbank, dus je hoeft alleen te zeggen hoevéél je er hebt en waar ze liggen. Een teller naast een lijstje, geen formulier per bak.
- **Opslaglocaties** als eigen begrip.
- **"Wat kan ik niet"** — het gemis-rapport. Elke techniek noemt zijn apparaat, de materieellijst noemt wat er staat, en het verschil is je gemiste repertoire. Het rapport zegt bewust *niet* "je kunt dit niet" maar *"dit staat niet in je lijst"* — bij de eerste meting bleken 36 van de 44 technieken gesloten terwijl de oven, het fornuis en de vacuümmachine gewoon in de keuken staan, alleen nog niet ingevoerd. Een rapport dat dat verzwijgt, liegt over je keuken.

### `/administratie/rittenregistratie` — Rittenregistratie
Een sluitende kilometeradministratie, met de bewaarplicht van zeven jaar in het achterhoofd. €0,23 per kilometer volgens de Belastingdienst. Sub-routes: `/nieuw`, `/[id]`, `/[id]/bewerken`.
- Ritten vanuit een event overnemen, of los aanmaken.
- Per rit: voertuig, activiteit, kilometerstand voor en na, afstand, doorgaande route, route-stappen en kaart.
- **Foto van de kilometerstand** die door het model wordt uitgelezen.
- Kosten en bonnen: brandstof (of geschat), tol en parkeren, slijtage en onderhoud, totaal werkelijke kosten tegenover de vergoeding.
- Fiscale verwerking, aftrekbaarheid, export, en doorzetten naar Moneybird.
- Eens per maand een controle op vergeten ritten.

### `/logistiek` — Logistiek
Wat er mee moet en hoe het er komt. Drie kolommen: kengetallen (events deze week, open controles vandaag, bus gereed), een tijdlijn van events met zes voortgangsbalkjes per categorie, en een zijrail met recente AI-voorstellen. Per event een checklist die door de AI wordt voorgesteld zodra een offerte is geaccepteerd, en die jij aanpast. Vaste knop onderaan: "Open veldmodus".

### `/logistiek/field` — Logistiek veldmodus
De inpaklijst voor de dag zelf, gebouwd voor handschoenen: knoppen van 72 pixels, geen enkel tekstveld, alleen schakelaars en een bulk-actie, trilling bij elke tik, en hoog contrast (geel is te doen, groen is klaar).

## Systeem — `/systeem`

### `/systeem` — Controlekamer
De ingang tot alle beheerschermen, met bovenaan vier statuschips: AI-kosten deze maand, AI-aanroepen deze maand, actieve gebruikers en gerechten die in de wizard staan. Daaronder zes kaarten naar de onderdelen. Valt een query uit, dan toont hij nul in plaats van te breken.

### `/instellingen` — Instellingen
Het langste instellingenscherm van de app, en de plek waar de huisstijl van een klant wordt bepaald.
- **Bedrijfsgegevens**: naam, adres, telefoon, e-mail, website, KVK, BTW-nummer, IBAN.
- **Facturatie**: voorvoegsel voor offerte- en factuurnummers, betalingsvoorwaarden.
- **Huisstijl**: kleuren voor primair, secundair, accent, achtergrond, kaarten en tekst — met een contrastcontrole per combinatie, zodat je geen onleesbare knop kunt maken.
- **Klantportaal-stijl**: hoe de offerte er voor de klant uitziet.
- **PDF-sjablonen** voor offerte, factuur, bon en HACCP-rapport, met voorbeeld en download.
- **Menukaart-stijl**: tien miniaturen, twee kleurkiezers, en de keuze om alle sjablonen bij te werken of alleen de geselecteerde. Wat je hier kiest wordt de standaard voor elke nieuwe offerte; offertes met eigen aanpassingen houden die.
- Voorkeuren voor events, facturen, recepten, materieel, filters en opvolging.

### `/instellingen/ai-usage` — AI-gebruik en kosten
Volledige inzage in wat de AI kost: per maand, per soort actie, met de trefkans van de prompt-cache, de voortgang tegen het plafond van je pakket, en de laatste vijftig aanroepen met model, actie, tijd en kosten.

### `/instellingen/data-export` — Data-export
Twee knoppen, allebei voor de AVG: je volledige gegevensexport downloaden (artikel 20) en demo-data verwijderen na de kennismaking.

### `/instellingen/integraties` — Integraties
Vijf koppelingen met hun status (verbonden of niet geconfigureerd): **Moneybird** en **Exact Online** voor de boekhouding, **Mollie** voor betalingen, **Google Agenda** en **iCal-export** voor de planning, en **webhooks** voor eigen automatisering.

### `/instellingen/integraties/accounting` — Boekhoud-instellingen
Drie kolommen: algemeen (grootboekrekening, termijnen, e-mailsjabloon), Moneybird (administratie-nummer en drie BTW-tarief-verwijzingen) en Exact Online (divisiecode).

### `/instellingen/referral` — Referral
Eén actieve verwijslink per organisatie plus de historie: wacht op aanmelding, aangemeld, proefperiode actief, uitbetaald, verlopen. Maximaal tien actieve verwijzingen.

### `/gebruikers` — Gebruikers
Teambeheer: wie heeft toegang, met welke rol, en uitnodigingen versturen. Een uitnodiging wordt via een aparte, snelheidsbegrensde route opgezocht, zodat niemand kan raden welke codes bestaan.

### `/mailbox` — Mailbox
E-mail en sjablonen op één plek. Per categorie een sjabloon (algemeen, offerte, factuur, na event) met onderwerp en inhoud, plus een opstelvenster om direct te mailen. Toont ook je eigen inkomende adres voor leveranciers-PDF's, met een kopieerknop.

### `/website` — Website-beheer
De publieke site van de caterer wordt vanuit de app gevuld — zonder een tweede systeem.
- **Hero-diavoorstelling** en **galerij** met eigen bijschriften en volgorde.
- **Signature Menu**: gangen en gerechten met beschrijving, foto, minimum aantal, allergenen (de veertien wettelijke) en dieet-informatie, elk zichtbaar of verborgen.
- **Veelgestelde vragen** met eigen volgorde.
- **Voettekst en contactgegevens**: adres, telefoon, e-mail, KvK, BTW.
- Afbeeldingen tot 10 MB, JPG/PNG/WebP.

### `/hulp` — Help Center
Artikelen doorzoeken, en als het antwoord er niet bij staat een ticket aanmaken: vraag, bug of feature-verzoek, met urgentie. Antwoorden van support komen op dezelfde plek terug.

### `/hulp/sitemap` — Sitemap
Alle pagina's op één lijst, gegroepeerd per hub. Bedoeld voor wie iets kwijt is.

### `/admin` — Platformbeheer
Alleen voor platformbeheerders (herkend aan hun e-mailadres). Vijf tabbladen: overzicht, organisaties, klanten, health en analytics. Organisaties aanmaken, functievlaggen zetten, huisstijlkleur instellen; gezondheidsscore per organisatie; dagelijks/wekelijks/maandelijks actieve gebruikers, kleefkracht, fouten, tickets, teamgrootte; waarschuwing sturen, tijdelijk inloggen als een klant, gegevens exporteren, bewaartermijnen.

### `/admin/funnel` — Activatietrechter
De vijf meetpunten uit deel 2, echt gemeten: aanmeldingen per week over twaalf weken, conversie per mijlpaal (aanmelding → quiz voltooid → eerste offerte concept → eerste offerte verstuurd → geactiveerd), en de mediane tijd tot de eerste offerte. Plus de laatste tien gebeurtenissen met hun gegevens.

### `/onboarding` — Onboarding
De weg van aanmelding naar de eerste verstuurde offerte, met als doel: binnen een uur. Stappen: bedrijfsgegevens (KVK, BTW, adres), wat voor caterer je bent (bruiloften & feesten, bedrijfsevents, foodtruck/mobiel, mix van alles), demo-data inladen, integraties, rondleiding, en de eerste offerte.
- De demo-data-vulling is generiek en herhaalbaar: 10 klanten, 15 gerechten, 20 voorraaditems, 5 leveranciers, 8 events, 3 facturen — met een knop om ze later weer weg te halen.
- Elke stap wordt geregistreerd, zodat de trechter klopt. Alles overslaanbaar.

### `/ai-chat` — AI Pitmaster
Het volledige chatscherm, voor wie liever een gesprek voert dan een formulier invult. Dezelfde motor als het zijpaneel, maar met alle ruimte.

### `/template-editor` — Sjablooneditor
De editor voor PDF-sjablonen (offerte, factuur, bon, HACCP). De menukaart-opmaak is hier weggehaald en zit nu per offerte.

### `/sectie/[slug]` — Sectie-overzicht
Een generieke hub-pagina die op basis van de navigatieconfiguratie kengetallen en doorklikkaarten toont voor één sectie.

### `/dev/ai-blocks` — Blokken-etalage
Ontwikkelaarspagina zonder aanroepen naar buiten: alle acht AI-antwoordblokken naast elkaar, om visueel te controleren of ze goed weergeven.

### Doorverwijzingen
- `/berichten` *(redirect)* → `/mailbox` — de interne berichtenmodule is opgegaan in de mailbox
- `/faq` *(redirect)* → `/hulp`

---

# 7. De klantkant

Zes schermen die geen inlog vragen. Ze dragen het logo en de kleuren van de caterer, niet die van ons — dat is het verschil tussen software die je gebruikt en software die je verkoopt.

### `/q/[token]` — Klantportaal, de offerte
Wat je klant ziet als hij op de link in je mail klikt. Het adres draagt een **public_token** (UUID), geen offertenummer — niemand kan door andermans offertes bladeren.
- Menu per gang met omschrijvingen, opgemaakt in jouw huisstijl.
- Totaaloverzicht met BTW inbegrepen, berekend over het hele menu.
- **CO₂-voetafdruk** van het menu.
- **Digitaal ondertekenen**: naam invullen, met de vinger tekenen, wissen en opnieuw als het misgaat.
- **Aanbetaling via iDEAL** direct na ondertekening (Mollie).
- **Bericht sturen** zonder te mailen — het komt binnen in jouw mailbox.
- Na tekenen een bedankscherm met een agenda-bestand (.ics) om de datum op te slaan.
- Eigen toestanden voor "verlopen" (404 vs 410) en "niet gevonden".
- Iconen zijn inline getekend, geen icon-bibliotheek — de pagina laadt daardoor snel.

### `/aanvraag/[slug]` — Publiek aanvraagformulier
Het formulier dat je op je site of in je Instagram-bio zet. Drie stappen: je event, jouw gegevens, versturen. Type event kiezen, datum, aantal gasten, wensen. Belofte van reactie binnen 24 uur, vrijblijvend, met een persoonlijke reactie van de eigenaar. Bevestiging per e-mail naar de aanvrager. Doorsteek naar de arrangement-configurator. Link naar de privacyverklaring; volledig in jouw huisstijl met "mogelijk gemaakt door" onderaan. Landt in `/verkoop/leads`.

### `/arrangement/[slug]` — Zelf je arrangement samenstellen
De klant kiest per gang een niveau en ziet de indicatieprijs meebewegen. Het populairste niveau is gemarkeerd, sommige gangen zijn optioneel. Aantal gasten instellen met een minimum dat jij bepaalt. Budget-indicatie tijdens het samenstellen; het genoemde bedrag is nadrukkelijk een indicatie, geen offerte. Eindigt in een aanvraag met de samenstelling erbij. Elke stap wordt geteld voor de trechter in het beheerscherm.

### `/share/[token]` — Boekhouder-deellink
Geen inlog voor je boekhouder. Het adres met de sleutel toont een **bevroren selectie**: de datumrange en de leveranciers zoals ze waren toen jij de link maakte. De bonnenlijst met totaalbedrag en BTW-samenvatting; klik op een bon opent de PDF via een ondertekende link; het hele pakket als ZIP te downloaden. Draait via de service-role client omdat de bezoeker anoniem is.

### `/welkom` — Marketingpagina
De publieke voorkant: "van lead tot factuur — in één flow", drie pijlers waar de concurrentie tekortschiet, een voorbeeld van een event, en de belofte dat AI in het abonnement zit zonder facturering per gebruik.

### `/pricing` — Prijzen
De drie pakketten naast elkaar plus de volledige vergelijkingstabel over zes groepen: basis, AI, commercieel, operatie, groei en grenzen. Zesentwintig functieregels, en veelgestelde vragen eronder.

### `/login`, `/signup`, `/invite`, `/contact` — Toegang
Inloggen, aanmelden, een uitnodiging accepteren, en een contactformulier waarvan het support-adres en telefoonnummer uit de omgeving komen — zodat een andere klant zijn eigen gegevens kan tonen. De uitnodigingspagina kent drie eindstanden: geldig, al geaccepteerd, verlopen.

### `/legal/privacy`, `/legal/voorwaarden`, `/legal/dpa` — Juridisch
Privacyverklaring, algemene voorwaarden en verwerkersovereenkomst. Publiek toegankelijk omdat het aanvraagformulier ernaar verwijst.

### `/e2e-test/menukaart/[templateId]` — Testroute
Alleen bereikbaar als de testvlag `NEXT_PUBLIC_E2E=1` aan staat. Rendert een menukaart-sjabloon zonder inlog of database, zodat de beeldvergelijkingstests kunnen draaien.

---

# 8. De AI-laag

Geen chatbot in een hoekje, maar een laag die overal doorheen loopt — met een riem en bretels eromheen.

## Hoe het gesprek werkt

Er is één chatroute (`/api/chat`, ~1.250 regels), die per pagina een andere systeeminstructie meekrijgt. De AI weet dus waar je staat, met welke offerte of welk event je bezig bent, en welke handelingen op die pagina zinvol zijn. Wie je bent is **ingebakken**: de instructie vraagt nooit "voor welk bedrijf werk je" — dat staat vast.

### Drie denkstanden

| Stand | Wat het doet | Waarvoor |
|---|---|---|
| **Snel** | Korte, directe antwoorden, hooguit drie zinnen | Operator op locatie, of een vlugge vraag |
| **Standaard** | Kort en krachtig, rond de tweehonderd woorden | Dagelijks werk |
| **Diep** | Uitgebreide analyse mét het denkproces zichtbaar | Strategie, brainstorm, bulkwerk zoals receptenmatrices |

De stand bepaalt zowel het model als de antwoordlengte — één plek (`lib/ai-modes.ts`), geen verspreide instellingen. Elke pagina heeft een verstandige beginstand.

**Modellen in gebruik:** `claude-haiku-4-5` (het meest, voor eenvoudig werk), `claude-sonnet-4-6` (het werkpaard), `claude-opus-4-7` (de diepe stand). Het vaste deel van de systeeminstructie draagt een cache-markering, zodat je er niet elke keer voor betaalt.

### Antwoorden in blokken, niet in lappen tekst

De AI antwoordt niet met proza maar met acht soorten blokken, die als echte UI verschijnen: **metriek, opsomming, informatie, waarschuwing, succes, actiehint, navigatiekaart** en — de belangrijkste — de **actiekaart**.

### De actiekaart: 45 handelingen

Een actiekaart is een voorstel met een knop. Er zijn 45 geregistreerde soorten in `lib/ai-actions.ts`, elk met een label, de tabel die hij raakt, de bewerking (insert/update/delete/bulk/tool/client_only) en de pagina's waar hij mag verschijnen:

`create_event` · `update_event` · `delete_event` · `create_recept` · `update_recept` · `delete_recept` · `create_gerecht` · `update_gerecht` · `delete_gerecht` · `create_voorraad` · `update_voorraad` · `delete_voorraad` · `process_receipt` · `create_leverancier` · `update_leverancier` · `create_haccp` · `create_urenlog` · `update_urenlog` · `delete_urenlog` · `create_materieel` · `update_materieel` · `create_prep_task` · `update_prep_task` · `delete_prep_task` · `create_offerte` · `update_offerte` · `update_offerte_status` · `create_factuur` · `update_factuur` · `update_factuur_status` · `create_klant` · `update_klant` · `draft_email` · `save_conversation` · `create_folder` · `generate_prep_list` · `generate_inkooplijst` · `generate_event_briefing` · `get_event_winstgevendheid` · `bulk_create_gerechten` · `brainstorm_gerechten_concepts` · `info_blocks` · `bulk_create_materieel` · `filter_gerechten` · `mark_weak_dishes`

> **De grens:** een actiekaart voert nooit vanzelf iets uit. Je ziet wat er gaat gebeuren, en pas als jij op de knop drukt gebeurt het — en dan nog via dezelfde gevalideerde route als wanneer je het met de hand had gedaan.

## Waar de AI nog meer zit

| Plek | Wat het doet | Klasse |
|---|---|---|
| Offerte-wizard | Menu voorstellen bij gasten, gangen en prijs | A + D voor de prijs |
| Bonnen en facturen | Leverancier, datum, bedragen, BTW en regels uit een foto of PDF lezen | H — jij bevestigt |
| Boekhouder | RGS-categorie voorstellen per bon | H — één tik om over te nemen |
| Prijslijsten | PDF's van leveranciers uitlezen, met alias-leren per klant | H — beoordelingslade |
| Receptuur-ontleder | Een recept in micro-stappen uit elkaar halen, met handtijd en wachttijd | H — per recept goedkeuren |
| Receptuur uit catalogus | Gerecht bouwen rond aangewezen catalogusproducten | H — kostprijs komt uit de catalogus |
| Kok-coach | Uitleggen waarom iets misgaat in de keuken | A |
| Allergenen-detectie | Voorstellen welke allergenen in een gerecht zitten | H — bevestigen per gerecht |
| Vervangingsadvies | Alternatief ingrediënt met prijsverschil | H |
| Dagbriefing | De ochtendtekst op de startpagina | A |
| HACCP-plan | Controlelijst per event, stromend meegetypt | H — normen horen uit de tabel te komen |
| Logistiek-checklist | Inpaklijst voorstellen na acceptatie van een offerte | H |
| Plattegrond | Zaalindeling voorstellen | H |
| Klantgesprek | Losse notities omzetten naar gestructureerde velden | H |
| Materieel- en productscan | Merk, type en specificaties uit een foto of link | H |
| Kilometerstand | De stand van de teller uit een foto lezen | H |
| Service-feedback | Ruwe aantekeningen omzetten naar kernpunten en actiepunten | A |
| Menukaart-opmaak | Tekstsuggesties per gang | A |
| Leveranciersanalyse | Waar je te duur uit bent en wat het alternatief is | A op basis van D-cijfers |
| Kostprijs-engineering | Waar de marge lekt en wat eraan te doen is | A op basis van D-cijfers |
| Combinatie-ontdekking | Welke gerechten goed samen gaan | A |

## De rem: wat de AI mag kosten

Elke aanroep wordt geregistreerd in `ai_usage` met model, actiesoort, tokens en kosten. Daarboven staat een tweetrapsplafond per pakket:

| Pakket | Waarschuwing bij | Blokkade bij | Brutomarge |
|---|---|---|---|
| Starter | €3,00 | €4,50 | 90% |
| Pro | €15,00 | €22,50 | 89% |
| Enterprise | €50,00 | €75,00 | 85% |

Bij de waarschuwing verschijnt een balk. Bij de blokkade worden nieuwe aanroepen geweigerd (HTTP 402) *vóórdat* ze Anthropic raken.

## De AI wordt zelf getest

Twee testsystemen naast elkaar:
- **Twintig eigen testsets** in `docs/ai-evals/`, met vijf gevallen per eindpunt, gedraaid tegen een lopende server via `npx tsx scripts/ai-eval.ts`. Onder de negentig procent nauwkeurigheid faalt de test.
- **Elf Promptfoo-testbestanden** voor de zwaarste prompts: HACCP-checklist, prijslijst-uitlezen, offerte-wizard-verankering, prep-planning, kilometerstand, vervangingsadvies, PDF-tekstlaag-fallback.
- **Acht extra eval-bestanden** in `evals/` voor allergenen, bonnen-scanner, menu-suggesties, receptvulling en prijsverfijning.

---

# 9. De achterkant

## De serverroutes, gegroepeerd

| Groep | Aantal | Wat erin zit |
|---|---|---|
| **AI en chat** | ~14 | Chat, actie-uitvoering, kok-coach, receptgeneratie en -verbetering, prijsverfijning, allergenendetectie, vervangingsadvies, kostprijs-engineering, combinatie-ontdekking, dagbriefing |
| **Recepten en gerechten** | ~14 | Gerechten en hun componenten, doorrekening, ontleden in stappen, uit de catalogus bouwen, ingrediënten matchen, promptregeneratie |
| **Leveranciers en prijslijsten** | ~24 | Catalogus, producten, prijslijsten uploaden en beoordelen, aliassen leren, prijsmutaties goedkeuren, factuurvergelijking, batchverwerking |
| **Browser-uitbreiding** | ~16 | Aanmelden, sleutels, taken claimen, controlepunten, hartslag, pauzeren, hervatten, annuleren — de hele hervatbare synchronisatie |
| **Bonnen en boekhouder** | ~14 | Uitlezen, wegschrijven, classificeren, maandpakket genereren en mailen, afsluiten, margelek |
| **Financiën** | ~9 | Samenvatting, BTW-aangifte en concept, bank, XAF-auditbestand, transport, investeringsaftrek-scenario, naar de boekhouder sturen |
| **Voorraad en inkoop** | ~8 | Bestelvoorstel, vraagberekening, verbruik, herberekening, marge-alarmen, mutaties |
| **Prep en keuken** | ~10 | Taken bulk-inplannen, starten, afronden, overslaan, uitstellen, herverdelen, apparaat-koppeling; mise-en-place |
| **HACCP** | ~8 | Plan genereren, sjabloon, registratie, corrigerende actie, foto, trends |
| **Events en service** | ~8 | Plattegrond ophalen en opslaan, zones, gast-pins, AI-voorstel, logistiek-checklist |
| **Verkoop** | ~9 | Publieke offerte, offerte accepteren, publiek leadformulier, publiek arrangement met telling, menukaart-PDF, menu-suggesties |
| **Integraties** | ~12 | Moneybird (koppelen, terugkoppeling, factuur, bon), Exact, Mollie (betaling en webhook), Google Agenda, iCal, webhooks, Resend |
| **Beheer** | ~10 | Organisaties, analytics, health, functievlaggen, tijdelijk inloggen, waarschuwing sturen, tickets, export, bewaartermijnen, inactiviteitscontrole |
| **Nachtelijke taken** | 8 | Zie het schema in deel 4 |
| **Overig** | ~34 | Organisatie en uitnodigingen, hulpartikelen, archief-export en ondertekende links, foutregistratie, wijzigingslogboek, activiteit, ritten, materieelscan, documenten lezen, sjablonen, onboarding-vulling, facturering |

## De database, per domein

| Domein | Belangrijkste tabellen |
|---|---|
| Organisatie | `organizations` · `organization_members` · `invitations` · `settings` · `user_settings` · `personeel` |
| Verkoop | `leads` · `offertes` · `facturen` · `klanten` · `arrangementen` · `arrangement_categorieen` · `categorie_niveaus` · `offerte_margin_alerts` |
| Planning | `events` · `courses` · `event_allergies` · `event_checklist_items` · `event_haccp_plans` · `agenda_categories` · `agenda_personal` |
| Keuken | `gerechten` · `components` · `component_ingredients` · `gerecht_components` · `recepten` · `recipe_steps` · `recipe_cost_snapshots` · `recipe_recompute_queue` · `menu_templates` · `menu_template_items` · `technieken` · `smaak_assen` · `gerecht_profielen` · `ingredient_profielen` |
| Allergenen en HACCP | `allergens` · `component_allergens` · `ingredient_allergens` · `haccp_records` · `haccp_corrective_actions` · `haccp_anomaly_findings` · `gerecht_haccp_templates` · `component_haccp_points` |
| Prep en service | `prep_tasks` · `prep_task_dependencies` · `mep_items` · `kitchen_stations` · `service_state` · `service_zones` · `floor_plans` · `floor_plan_guests` · `kds_device_sessions` · `kds_audit_logs` |
| Voorraad en inkoop | `inventory` · `stock_movements` · `price_history` · `marge_alerts` · `inkooplijsten` · `concept_inkoop_orders` · `inkoop_order_lines` · `order_overrides` · `order_templates` |
| Leveranciers | `leveranciers` · `supplier_products` · `supplier_product_prices` · `supplier_product_observations` · `supplier_invoices` · `supplier_invoice_lines` · `leverancier_sync_runs` · `supplier_sync_tasks` · `supplier_sync_checkpoints` · `org_product_aliases` · `org_price_mutations` · `org_pricelist_uploads` · `meat_taxonomy` |
| Bonnen en geld | `bonnen` · `bon_share_tokens` · `bon_audit_log` · `btw_aangiftes` · `bank_transacties` · `maand_afsluitingen` · `boekhouder_pakketten` · `balans_correcties` |
| Operatie | `materieel` · `gn_maten` · `opslag_locaties` · `pack_lists` · `ritten` · `voertuigen` · `rtr_items` · `ritten_moneybird_pushes` |
| AI en systeem | `ai_usage` · `ai_action_proposals` · `activity_log` · `audit_log` · `funnel_events` · `onboarding_events` · `notifications` · `changelog_entries` · `org_webhooks` · `org_email_inbox` · `org_email_attachments` · `org_extension_api_keys` · `integration_tokens` |

## Eigenaardigheden om te onthouden

- **Twee catalogi die je nooit mag samenvoegen op nummer.** Catalogus A is jouw eigen bibliotheek (componenten, voorraad); catalogus B is wat de leverancier verkoopt. Ze koppelen via een expliciete verwijzing, nooit via een gedeeld id.
- **Gemengde sleutel-typen.** Gerechten hebben een UUID, offertes een `int4`. Historisch, en niet erg — zolang je het weet als je twee tabellen aan elkaar knoopt.
- **`quantity_used` is per gast**, `total_cost_cents` is per portie. Het veld `porties` raakt alleen de recepttekst.
- **PostgreSQL 15+ generated columns vereisen een IMMUTABLE expressie** — `to_tsvector('dutch', …)` faalt daarin en moet in een eigen functie.
- **Pre-flight-queries in migraties moeten defensief zijn**: eerst `information_schema.columns` controleren in plaats van aannemen dat eerdere migraties al gedraaid zijn.

## Er wordt op gelet

- `node scripts/schema-audit.mjs` vindt queries die kolommen opvragen die niet bestaan. Zulke queries mislukken namelijk *helemaal* — één verkeerde kolomnaam en de hele vraag komt leeg terug.
- `npm run lint:contrast` controleert of elke kleurcombinatie leesbaar blijft.
- `npm run btw:afwijkingen` zoekt BTW-splitsingen die niet kloppen.
- 73 testbestanden met Vitest voor het rekenwerk; Playwright voor de tien menukaart-sjablonen (beeldvergelijking).
- `npm run analyze` meet de omvang van de JavaScript-bundel. **Meet prestaties altijd op een productiebuild** — in ontwikkelmodus deed één pagina 80 verzoeken tegen 38 in productie.

---

# 10. Waar het nu staat

## Wat er staat

De keten werkt end-to-end: aanvraag → offerte → event → menu → bestellijst → kookbord → servicebord → factuur → bon → aangifte. De informatiestructuur is opgeruimd (van 26 zijbalk-items naar acht hubs), de toegankelijkheid getoetst (WCAG 2.1 AA), de activatiemeting draait sinds mei 2026, het beheerdersdashboard leeft, en de zeventien plekken waar opslaan stil mislukte zijn dicht.

## De grootste blokkade — gemeten op 2026-09-01

Het gerechtenboek is leeg. Van de vijftien actieve gerechten:

| | |
|---|---|
| Zonder één gekoppeld ingrediënt | 9 van 15 |
| Met een kostprijs | 4 van 15 |
| Met allergenen | 3 van 15 |
| Met receptstappen | 1 van 15 |
| Met handtijd | 0 van 15 |
| **Volledig op alle vijf** | **0 van 15** |

**De oorzaak is niet luiheid maar de vorm van het scherm.** Toevoegen en afmaken zijn dezelfde handeling: je maakt een gerecht aan met een naam, het staat meteen op actief, en niets brengt je ooit terug. Er bestaat geen begrip van *"af"*. Een half gerecht ziet er precies zo uit als een heel gerecht.

Dit blokkeert alles wat erboven hangt: golf 2 rekent met handtijd die nergens staat, de receptuur-motor wil sjablonen afleiden uit eigen recepten die geen stappen hebben, en de marge-schermen delen door een kostprijs die bij elf van de vijftien ontbreekt.

## De vijf stappen die daaruit volgen

1. **De prijsafleiding repareren.** ✅ Gedaan op 2026-09-01. De afleiding bleek niet stuk — de canon staat vast in de tests: staat er een pakinhoud bij, dan is `price_cents` de prijs van het héle pak. Wat ontbrak was een controle op de *invoer*. Die staat er nu (`src/lib/prijsControle.ts`) met twee regels: prijs gelijk aan het pakgewicht, en goedkoper dan een levensmiddel kan zijn (ondergrens €0,75 per kilo — een gekozen drempel, want budget-appels zitten op €0,90 en dat is echt). Hij verandert nooit een bedrag, hij wijst aan en stelt de vraag.
2. **"Af" zichtbaar maken.** Vijf eisen per gerecht — ingrediënten uit de catalogus, dosering per gast, afgeleide kostprijs, allergenen, stappen met handtijd — met een balk per gerecht en één werklijst met wat ontbreekt.
3. **Eén deur in plaats van vier.** Er zijn nu vier ingangen (*Nieuw gerecht*, *Bedenk met AI*, *Uit de groothandel*, de ontleder) en alle vier leveren ze een ánder half gerecht op. *Uit de groothandel* wordt de standaardroute, want die pint echte producten vast en leidt de kostprijs af in plaats van hem te schatten. Bijvangst die zwaarder weegt dan hij lijkt: allergenen hoeven dan niet meer getypt te worden — die volgen uit de aangewezen producten, en dat is ook de enige toegestane herkomst.
4. **Vangnetten op de twee fouten die geld kosten.** Deterministisch, geen model: een dosering boven een halve kilo per gast vraagt *bedoel je het pak?*, en een kostprijs onder een ondergrens per productgroep piept.
5. **Pas dán de AI.** De bedenker werkt nu buiten de catalogus om, dus zijn kostprijs is een schatting en zijn marge is geen berekening maar een constante: de verkoopprijs wordt in de client gemaakt als kostprijs × 2,5, waardoor élk voorstel op 60% uitkomt. Laat hem kiezen uit wat er besteld kan worden, dan valt de kostprijs eruit.

**De omvang is bewust klein:** beginnen bij de acht gerechten van het event van 18 september. Die klus is echt, levert direct een kloppende bestellijst en een werkend kookbord op, en pas daarna is bekend wat één gerecht aan tijd kost — en of de rest het waard is.

## De golven

| Golf | Wat | Stand |
|---|---|---|
| 0 | Kennisbank, goedkeur-lade, receptuur-ontleder, gemis-rapport | ✅ Draait |
| 1 | Recepten van actieve menu's ontleden; lessen en sjablonen eruit afleiden; het gerechtenboek vullen | Nu aan de beurt |
| 2 | Handtijd en wachttijd los van elkaar in de prep-planning; plaats en groepering | ✅ Grotendeels — GN- en apparatuurcheck open |
| 3 | Keuken-modus: receptuur, planning en HACCP op één scherm; normen naar de tabel | Gepland |
| 4 | Receptuur-ontwerper in vier standen: op aanvraag, vanuit middelen, investeringsadvies, verbindende component | Gepland |
| 5 | Mail-intake afmaken: offerteconcept en opvolging — mag naar voren als het seizoen aantrekt | Gepland |
| 6 | Conceptbestellingen met goedkeuring — de eerste stap die naar buiten praat, dus als laatste | Gepland |

## Wat er nog open staat aan afwerking

- Een veldtest met Lars op een echte eventdag — handschoenen, zonlicht, tablet. Geen code, wel de laatste toets vóór lancering.
- Twee AI-schermcomponenten van samen ruim drieduizend regels vereenvoudigen (`AiAssistant.tsx` 1.865 regels, `AIStudio.tsx` 1.172 regels).
- 313 hardgecodeerde afrondingen in 42 bestanden omzetten naar de vormtokens.
- **De HACCP-normwaarden verhuizen van de prompt naar een tabel.** Nu mag het model de wettelijke grens zélf invullen ("Pulled Pork ≥93°C ≠ Brisket ≥90°C") omdat de normtabel niet bestaat. Het bestand is zorgvuldig gebouwd — het model mag expliciet géén gemeten waarden of allergenen verzinnen, en er is bronvermelding — maar de grens ligt aan de verkeerde kant van de regel uit deel 3.
- **Er is nog geen enkele plek waar je een receptstap met de hand kunt aanvullen.** `recipe_steps` wordt buiten het schrijfpad van de ontleder nergens gelezen of getoond. Zolang dat zo is kan handtijd alleen ontstaan als hij toevallig in de recepttekst staat. De keuze is: recepturen aanvullen aan de bron, of de stappenlijst bewerkbaar maken — dat laatste hoort bij golf 3.
- Twee bestanden pinnen `claude-sonnet-4-5-20250929` terwijl de toelichting "Sonnet 4.6" zegt (`lib/ai/haccpChecklist.ts` en `lib/ai/logisticsChecklist.ts`).

---

# 11. Woordenlijst

| Term | Wat het is |
|---|---|
| **Component** | Een bouwsteen van een gerecht — zelf bereid of ingekocht. Wijzig er één en elk gerecht waar hij in zit past mee. |
| **Gerecht** | Wat je verkoopt. Opgebouwd uit componenten, met eigen kostprijs, allergenen en receptuur. |
| **Catalogus A / B** | A is jouw eigen bibliotheek, B is wat de leverancier verkoopt. Nooit samenvoegen op nummer. |
| **Foodcost** | Wat de inkoop van het eten kost, als bedrag of als percentage van de verkoopprijs. |
| **Menu-marge** | (menuprijs − som van de gerechtkostprijzen) ÷ menuprijs. Het gerecht is een signaal, het menu is het oordeel. |
| **Par-niveau** | De voorraad die je minimaal wilt hebben staan. Kom je eronder, dan verschijnt het op de bestellijst. |
| **Snijverlies** | Wat er van een product overblijft na schoonmaken. Bepaalt hoeveel je écht moet inkopen. |
| **Mise en place** | Alles wat vóór de service klaargemaakt moet zijn. |
| **Prep** | Het voorbereidende werk in de dagen vóór een event. |
| **Handtijd / wachttijd** | Handtijd is de tijd dat jij bezig bent; wachttijd is de tijd dat het vanzelf gaat (marineren, roken, koelen). Voor de planning zijn dat twee verschillende dingen. |
| **Gastronorm (GN)** | De wereldwijd vastgelegde maat van keukenbakken (EN 631-1). Bepaalt hoeveel bakken je nodig hebt voor een hoeveelheid. |
| **HACCP** | Het voedselveiligheidssysteem waar de NVWA op controleert: metingen, normen en corrigerende acties, bewijsbaar vastgelegd. |
| **RGS** | Het Referentie Grootboekschema — de standaardcodes waarmee Nederlandse boekhouders kosten indelen. |
| **UBL / Peppol** | Het bestandsformaat en netwerk voor elektronische facturen. |
| **MT940** | Het bestandsformaat waarmee banken afschriften exporteren. |
| **XAF** | Het auditbestand dat de Belastingdienst kan opvragen. |
| **Rijbeveiliging (RLS)** | De database weigert zelf rijen van een andere organisatie te tonen. De reden dat één installatie meerdere klanten kan bedienen. |
| **D / A / H** | De klasse van een taak: door code berekend, door AI geredeneerd, of hybride met goedkeuring. Zie deel 3. |
| **Serveractie** | Een opslag- of wijzigingsroute die op de server draait, met validatie en controlespoor — in plaats van rechtstreeks vanuit de browser. |
| **Prompt-caching** | Het vaste deel van een AI-instructie hergebruiken, zodat je er niet elke keer voor betaalt. |
| **White-label** | De app draagt het logo en de kleuren van de caterer, niet die van ons. Vooral zichtbaar op alles wat de klant ziet. |
| **KDS** | Kitchen Display System — de schermen in de keuken (kookbord en servicebord), altijd volledig scherm zonder app-omlijsting. |

## Waar je verder kunt lezen

| Document | Waarvoor |
|---|---|
| `docs/ux-master.md` | Status, principes, meetpunten, personas en open punten — het startdocument |
| `docs/agent-architectuur-plan.md` | Het AI- en kennisbankplan v2.0: D/A/H, de kennisbibliotheek, de receptuur-motor, de golven |
| `docs/product-strategy.md` | Markt, positionering, personas, prijsstelling, twaalfmaands-horizon |
| `docs/competitor-benchmark.md` | Tien concurrenten op veertien dimensies |
| `docs/operatie-overzicht.md` | De informatiestructuur-vereenvoudiging en de één-deur-regel |
| `docs/ux-strategy.md` | De ervaringsdoelen en de drie scenario's voor 2027 |
| `src/lib/navigation.tsx` | De enige echte bron voor de hub-indeling |
| `chrome-extension/README.md` | De leverancierssynchronisatie in detail |

---

*Geschreven op 2026-09-01 vanaf de code op branch `feat/kennisbank-en-keuken`. Waar dit document een getal noemt, komt dat uit de code of uit een meting die in de projectdocumenten staat — nergens uit een schatting.*
