# Agent-architectuur & Kennisbibliotheek — BBQ Architect / Hop & Bites

| | |
|---|---|
| **Versie** | 2.0 |
| **Datum** | 2026-08-31 |
| **Status** | Plan — geverifieerd tegen de codebase, klaar om te bouwen |
| **Scope** | Single-tenant: Hop & Bites (Schoonoord, Drenthe) |
| **Stack** | Next.js 16.2, React 19, Supabase (multi-tenant, RLS), Anthropic SDK 0.95, Tailwind v3.4, Vitest, Vercel (fra1) |

---

## Wat er veranderd is ten opzichte van versie 1.0

Versie 1.0 is nagelopen tegen de echte codebase: 115 migraties, 74 API-routes, 151 modules in `src/lib`. Het denkraam bleek te kloppen — het D/A/H-principe is niet alleen verdedigbaar, het is de regel die deze codebase in de praktijk al hanteert. `src/lib/prep/bulkSchedule.ts` opent letterlijk met "target_qty NOOIT AI-derived".

De inventaris klopte niet, en er ontbrak een hele laag.

**Correcties**

| Was | Is |
|---|---|
| "`ai_action_proposals` bestaat al als primitief" | Tabel bestaat, maar **nul code gebruikt hem**. Golf 3/4 zijn de eerste gebruiker, niet de tweede. |
| "Zonder atomaire stappen bestaat prep-batching niet" | Bestaat al: ~3.800 regels in `src/lib/prep/`, met tests en een scherm. Alleen handtijd/wachttijd en de groepeersleutel ontbreken. |
| "Mail-intake moet gebouwd worden" | Classificatie draait al in `src/lib/emailInbound.ts`, inclusief automatisch een concept-klant. |
| "QA/HACCP is D en blijft D" | `src/lib/ai/haccpChecklist.ts` laat een model **nu al de wettelijke normwaarden produceren**. Klasse-creep is geen risico maar bestaande situatie. |
| Tailwind v4 | Tailwind v3.4.19 |
| Sonnet 5 / Opus 5 als vanzelfsprekend | De app draait op haiku-4-5 / sonnet-4-6 / opus-4-7. De upgrade is een besluit, geen detail. |
| "Recepten omzetten is handwerk, één avond per tien" | De AI ontleedt, Mathijs keurt goed. Zie hoofdstuk 6. |

**Toegevoegd**

- **Hoofdstuk 5 — De kennisbibliotheek.** Waar de AI-kok zijn kennis vandaan haalt: samenstelling, aroma, functie, balans en het Nederlandse smaakprofiel.
- **Hoofdstuk 6 — De receptuur-motor.** Hoe een gerecht wordt opgebouwd: denken als een kok in plaats van als een controleur, structuur en rolverdeling, het gerechtenboek en de verbindende component, technieken, de cateringgrens, machines en investeringsadvies.
- **Agent 11 (receptuur-ontleder) en agent 12 (receptuur-ontwerper)**, met vier standen.
- **Hoofdstuk 9 — Kosten en haalbaarheid**, doorgerekend met actuele prijzen.

---

## 1. Visie & scope

BBQ Architect draait voor één bedrijf, met één operator die de keuken vaak solo runt. Dat verandert de architectuur fundamenteel ten opzichte van een SaaS-product met onbekende klanten: geen agent-registry, want het aantal agents is bekend en eindig; geen cost-cap-tiering, want er is één rekening; geen approval-UI met rollen en delegatie, want er is één goedkeurder; geen prompt-versionering per tenant, want de identiteit staat vast en mag ingebakken zijn.

Agents mogen hardcoded zijn — een TypeScript-module per agent met een expliciet contract, aangeroepen vanuit een cron of een Server Action, is hier de juiste abstractie en niet een generieke orchestration-laag.

Wat zwaarder weegt dan bij SaaS: één fout raakt direct de enige klant die er is, en er kijkt niemand mee. De architectuur koopt dus geen flexibiliteit maar betrouwbaarheid, en de valuta daarvoor is de D/A/H-classificatie in hoofdstuk 2.

**Buiten scope:** UI-ontwerp, promptteksten, migratie-SQL, bordopmaak, wijncombinaties.

---

## 2. Het D/A/H-principe

Elke AI-gerelateerde functie krijgt vóór het ontwerp een klasse. Een feature die "een beetje AI gebruikt" bestaat niet; een feature wordt ontleed in taken, en elke taak krijgt een klasse.

| Klasse | Definitie | Wie beslist | Rol van het model | Testvorm |
|---|---|---|---|---|
| **D — Deterministisch** | Berekenbaar uit data en regels. Precies één juist antwoord. | Code. Altijd. | Alleen presenteren en uitleggen. Het model mag het getal **nooit produceren**. | Unit tests met vaste in- en uitvoer. |
| **A — AI-geredeneerd** | Oordeel, taal, prioritering, creativiteit. Geen enkel juist antwoord. | Model, binnen een prompt-contract. | Volledig producerend. | Evals plus steekproef door mens. |
| **H — Hybride** | Model stelt voor, code valideert tegen een harde grens, mens bevestigt vóór de actie. | Model stelt op, code keurt, mens tekent. | Voorstel binnen door code afgebakende ruimte. | Contract tests op de validator, evals op het voorstel, audit-log op de bevestiging. |

### De harde regel

> **Extern (klant, leverancier) of onomkeerbaar (geld, voedselveiligheid, wet) → nooit autonoom, altijd approval.**
> **Intern en omkeerbaar → mag volledig autonoom.**

Deze regel bepaalt of een agent een `pending`-rij schrijft of een echte mutatie doet.

**Let op — het primitief is nog leeg.** `ai_action_proposals` bestaat (`supabase/migrations/20260601150000_ai_action_proposals.sql`) met de juiste levenscyclus, maar er is geen enkele `.from('ai_action_proposals')` in `src/`. Drie dingen volgen daaruit:

1. De eerste H-agent bouwt het gedrag, hij erft het niet.
2. `proposal_type` staat op vier waarden vast: `offerte_draft`, `event_draft`, `klant_upsert`, `email_draft`. Elke nieuwe soort voorstel vraagt eerst een migratie.
3. De opruimtaak voor verlopen voorstellen bestaat niet — `expires_at` is vandaag decoratie.

### Beslisboom

1. Berekenbaar uit data die we hebben? → **D**. Het model komt er niet aan.
2. Verlaat het het bedrijf, of is het onomkeerbaar? → **H** met verplichte approval, ook als het model het zeker weet.
3. Blijft het binnen en is het terug te draaien? → **A**, mag autonoom.
4. Twijfel? De zwaardere klasse wint.

### Voorbeelden

**D — code beslist**

| Taak | Waarom |
|---|---|
| Recept schalen van 40 naar 65 gasten | Vermenigvuldiging over `quantity_used`. Afronding is een regel. |
| GN-volume en aantal bakken | Volume gedeeld door capaciteit met vulgraad-marge. |
| Kerntemperatuur en koeltijden | Wettelijke grenswaarden. Een gehallucineerde 63 °C in plaats van 75 °C is een incident. |
| Foodcost en marge | `src/lib/menuMargin.ts` is de kanon. |
| BTW-split | `src/lib/btw-rules.ts` beslist. |
| Allergenen | Afgeleid uit de koppeltabellen. Nooit uit modelkennis. |
| Deadline-terugrekening | Optellen van doorlooptijden. |

**A — model produceert**

Chef-coach die uitlegt waarom een hollandaise schift. Toon van een offerte-concept. Prioritering in de dagsamenvatting. Social-content. Menu-suggestie bij een aanvraag.

**H — voorstel, grens, handtekening**

| Taak | Grens die code bewaakt | Wie tekent |
|---|---|---|
| Receptuur ontleden in micro-stappen | Ingrediënten matchen op catalogus of componenten | Mathijs, per recept |
| Receptuur ontwerpen | Sjabloon, bestelbaarheid, doseerbereik, allergenen, afwerktijd | Mathijs, dan proeftest |
| Ingrediëntprofiel vullen | Harde getallen geïmporteerd, prijs uit catalogus | Mathijs, per productgroep |
| Conceptbestelling | Alleen catalogusproducten, hoeveelheden uit de D-berekening, bedrag-plafond | Mathijs, vóór verzenden |
| E-mail naar een klant | Bedragen uit de offerte-record, niet uit de tekst | Mathijs, vóór verzenden |

### Klasse-creep is geen risico maar de huidige stand

`src/lib/ai/haccpChecklist.ts` laat het model de wettelijke norm zélf in het doel-veld zetten ("Pulled Pork ≥93°C ≠ Brisket ≥90°C"), omdat de normtabel niet bestaat. Het bestand is zorgvuldig gebouwd — het model mag expliciet géén gemeten waarden of allergenen verzinnen, en er is bronvermelding — maar de grens ligt aan de verkeerde kant.

Daarom is de HACCP-agent in dit plan een **verhuizing**, geen nieuwbouw: normen naar de tabel, normgeneratie uit de prompt.

Bijvangst: dat bestand pint `claude-sonnet-4-5-20250929` terwijl de toelichting "Sonnet 4.6" zegt. Idem in `src/lib/ai/logisticsChecklist.ts`.

---

## 3. Blokkers — eerst repareren

Drie dingen hielden golf 1 tegen. Eén is opgelost, twee staan open.

| Blokker | Stand | Wat er is | Waarom het telt |
|---|---|---|---|
| **`mep_items` kon niet aan gerechten koppelen** | **Opgelost — 2026-08-31** | De foreign key ontbrak. Aangebracht met `supabase/migrations/20260901020000_mep_items_koppeling.sql`. | De prep-agent sluit hierop aan. |
| **`gerechten` staat nergens in versiebeheer** | **Open** | Geen enkele migratie maakt de tabel aan; hij is met de hand gemaakt en migraties doen alleen `ALTER`. | Zes nieuwe tabellen bouwen hierop. Een verse omgeving struikelt meteen. |
| **`prep_task_dependencies` is leeg** | **Open** | Bestaat sinds mei, nul gebruik in `src/`. Nagemeten: nul rijen. | Wordt opgevoerd als bestaande aansluiting. |

### 3.1 Correctie op de eerste blokker

Versie 2.0 schreef dat `mep_items.gerecht_id` een `INTEGER` was terwijl `gerechten.id` een UUID is, en dat koppelen daarom onmogelijk was. Dat klopte maar half, en de helft die niet klopte is leerzamer dan de helft die wel klopte.

**Het type was nooit het probleem.** De kolom ís `uuid` en staat vol geldige verwijzingen. De aanmaakmigratie `20260621120000_create_mep_items.sql` zegt `INTEGER`, maar de kolom is later buiten de migraties om aangepast. Het plan is geschreven op wat het migratiebestand beweerde, niet op wat de database bevatte.

**Wat écht ontbrak was de foreign key.** Zonder sleutel bewaakt de database niets, en — belangrijker voor deze app — kan PostgREST de relatie niet inbedden. Een query als `select('id, gerechten(naam)')` gaf `could not find a relationship`. Dat is precies de vorm die de prep-planning nodig heeft, dus de blokker was echt; alleen de diagnose was verkeerd.

De migratie controleert elke aanname apart (bestaat `gerechten`, is de kolom `uuid`, ligt de sleutel er al) in plaats van ze aan te nemen. Alle negen bestaande rijen wezen al naar bestaande gerechten, dus opschonen was niet nodig. Omdat `gerechten` nog steeds geen `CREATE TABLE` heeft, slaat de migratie zichzelf op een verse omgeving over met een notice — de tweede blokker mag de eerste niet meeslepen.

**De les, en die geldt breder dan deze tabel:** een migratiebestand beschrijft wat er ooit is gevraagd, niet wat er nu staat. Deze codebase is op meer plekken met de hand aangepast — `gerechten` zelf is er het grootste voorbeeld van. Nameten in de database is de enige waarheid; dit plan is op dat punt één keer de mist in gegaan en dat kostte een verkeerd geformuleerde blokker.

Kleinere waarschuwing van dezelfde soort: `src/types/database.types.ts` wordt met de hand bijgehouden en is gedrift — het zegt dat een gerecht een genummerd id heeft, terwijl het een UUID is. Niet de migraties en niet dat bestand zijn hier de waarheid, maar de database.

---

## 4. Datafundament

Geen enkele agent wordt beter dan de data eronder. Recepten staan vandaag als tekst en als `components` / `component_ingredients` in de database — genoeg om kostprijs te berekenen, te weinig om over tijd, volgorde, apparatuur en toezicht te redeneren.

### 4.1 `recipe_steps` — atomaire receptstappen

**Dit is een uitbreiding, geen nieuwbouw.** `src/lib/prep/recipeTemplates.ts` bevat al tien fase-schema's met `phase`, `text`, offset, duur, `station_type` en `dependsOnPhase`, en het bestand plant zelf al een `recipe_templates`-tabel. Wat ontbreekt is het onderstaande.

| Veld | Type | Betekenis |
|---|---|---|
| `id` | uuid | PK |
| `organization_id` | uuid | RLS — altijd expliciet meesturen bij insert |
| `recipe_id` | uuid | FK naar gerecht of component |
| `step_order` | int | Volgorde |
| `action` | enum | snijden, mise-en-place, marineren, smoken, sous-vide, bakken, koken, blenden, emulgeren, koelen, portioneren, afwerken |
| `ingredient_ref` | uuid \| null | Catalogusproduct of component; null bij pure handelingen |
| `quantity` | numeric | **Per gast**, zelfde canon als `quantity_used` |
| `unit` | text | Basis-eenheid, niet pak-eenheid |
| `prep_group` | text | **Nieuw en cruciaal.** Batching-sleutel: `sjalot-brunoise`. Twee stappen met dezelfde sleutel zijn samen te voegen. |
| `duration_active_min` | int | **Nieuw en cruciaal.** Handtijd — kost een persoon. |
| `duration_passive_min` | int | **Nieuw en cruciaal.** Wachttijd — kost een apparaat, geen persoon. |
| `needs_supervision` | bool | Moet er iemand bij blijven |
| `equipment_ref` | uuid \| null | Benodigd apparaat |
| `station` | uuid \| null | FK naar `kitchen_stations` |
| `plaats` | enum | **Nieuw.** thuis / bus / locatie — zie 6.7 |
| `temp_target_c` | numeric \| null | Alleen procestemperatuur; grenswaarden komen uit 4.5 |
| `depends_on_step_id` | uuid \| null | Harde volgorde-afhankelijkheid |

Zonder het verschil tussen `duration_active_min` en `duration_passive_min` kan prep-batching geen wachttijd vullen en kan geen enkele planner een kritiek pad berekenen. Zonder `prep_group` blijft drie keer sjalot snipperen drie taken.

### 4.2 `gn_sizes` — Gastronorm-referentie

Universeel, niet tenant-gebonden. Eenmalig vullen, daarna read-only. Velden: `code` (PK), `length_mm`/`width_mm`/`depth_mm`, `volume_liter`, `usable_fill_ratio`, `stackable`.

### 4.3 `equipment` — apparatuur, opslag en werkplekken

**Let op de naamsverwarring:** er bestaat al een `materieel`-tabel, maar dat is servies en tafelgerei (porselein, kleur, geschikt voor gangen). Dit is iets anders: koelingen, vriezers, smoker, sous-vide-bad, cambro's, werkbanken, de Robot Coupe, de snijmachine, de vacuümmachine.

| Veld | Betekenis |
|---|---|
| `id`, `organization_id` | PK, RLS |
| `name`, `kind` | `Yoder`, `Vriezer keuken`; koeling / vriezer / oven / smoker / sous-vide / werkbank / transport / stelling / snijden / mengen / vacuüm |
| `capacity_unit`, `capacity_value` | liter, gn_slots, kg, m2 |
| `gn_compatible` | text[] — welke `gn_sizes.code` erin passen |
| `temp_range_c` | numrange \| null |
| `concurrent_jobs` | Hoeveel processen tegelijk |
| `location` | Keuken, bus, opslag |
| `gaat_mee_op_locatie` | bool — bepaalt wat er op locatie kan (6.7) |
| `maakt_mogelijk` | **Nieuw.** Welke bewerkingen: brunoise 3 mm, julienne, flinterdun schaven (6.8) |
| `hulpstukken_aanwezig` | **Nieuw.** Welke bladen en opzetstukken je écht hebt |
| `hulpstukken_beschikbaar` | **Nieuw.** Wat er te koop is, met prijs — voor het investeringsadvies (6.9) |
| `versnelling`, `gelijkmatigheid` | **Nieuw.** Hoeveel sneller dan met de hand, en of het uniform is |
| `capaciteit_per_uur`, `benodigde_hoeveelheid` | **Nieuw.** Vanaf hoeveel porties het opbouwen en schoonmaken loont |
| `aanschafprijs`, `aanschafdatum` | **Nieuw.** Voor de terugverdiensom |

### 4.4 `ingredient_profiles` — zie hoofdstuk 5

Dit is uitgegroeid tot een eigen hoofdstuk.

### 4.5 HACCP-grenswaarden — nooit AI-afgeleid

Aparte tabel, read-only voor elke agent. De bestaande structuren (`component_haccp_points`, `event_haccp_plans`, `haccp_anomaly_findings`) blijven de registratiekant; deze tabel is de normkant.

| Veld | Betekenis |
|---|---|
| `code` | `kern-gevogelte`, `koelketen-warm-naar-koud`, `warmhoud-min` |
| `product_class` | Gevogelte, gehakt, hele spierstukken, vis, zuivel |
| `limit_type` | min_temp / max_temp / max_duration / temp_over_time |
| `value`, `unit` | De grenswaarde |
| `source` | NVWA-richtsnoer, hygiënecode |
| `valid_from` | Normen veranderen |

**Regel:** geen enkele agent mag een waarde uit deze tabel afleiden, interpoleren of herformuleren tot een ander getal. Lezen en tonen mag; rekenen doet code.

### 4.6 `production_measurements` — met een vulmechanisme

Levert op dag één geen feature op en moet daarom juist vroeg bestaan: hij is de voorwaarde voor de R&D-agent.

Velden: `event_id` / `recipe_id`, `measured_at`, `metric` (kerntemp, warmhoudduur_min, restgewicht_g, yield_pct, smaak_score, textuur_score), `value`, `context_note`, `outcome_flag`.

**Hoe hij gevuld raakt — dit ontbrak in versie 1.0.** Dezelfde vraag die om een kerntemperatuur vraagt, vangt de meting op. Eén handeling, twee tabellen: het HACCP-boek én de metingen. De HACCP-agent vraagt actief ("meet dit punt even, dan werk ik het boek bij") in plaats van achteraf te signaleren.

---

## 5. De kennisbibliotheek

Versie 1.0 noemde vet%, vocht% en pH. Dat is genoeg om een saus te laten binden, niet om hem te laten smaken. Dit hoofdstuk vult dat gat.

### 5.1 Drie soorten kennis, drie bronnen

| Soort | Voorbeeld | Waar het vandaan komt | Verandert het? |
|---|---|---|---|
| **Samenstelling** | "Welke kaas bindt én smaakt" | Vet, vocht, eiwit — import uit NEVO | Nee, natuurkunde |
| **Aroma** | "Wat zit er in limoen" | Smaakmoleculen — import uit FlavorDB2 | Nee, scheikunde |
| **Oordeel** | "Is dit lekker" | Alleen uit de eigen keuken | Ja, en het is persoonlijk |

Ze door elkaar halen levert een AI op die klinkt als een kok en kookt als een gokker. Gescheiden houden is wat blindelings vertrouwen mogelijk maakt.

**De feiten bestaan al als openbare bestanden:**

- **NEVO 2025/9.0** (RIVM) — 2.328 voedingsmiddelen, circa 130 voedingsstoffen elk, gratis te downloaden als CSV na akkoord op de gebruiksvoorwaarden. Geen koppeling, dus eenmalige import.
- **FlavorDB2** (2024) — 25.595 smaakmoleculen, gebouwd voor food-pairing; bundelt FooDB, Flavornet, SuperSweet en BitterDB.

**Licenties eerst controleren**, vóór import. Dat is een stap in golf 0, geen formaliteit.

### 5.2 De cirkel die doorbroken moet worden

De AI stelt de bibliotheek samen. Dat is de juiste aanpak, maar er zit een valstrik in: **als de AI de bibliotheek vult en er daarna uit put, is het hallucinatie met een extra stap.** De bibliotheek voelt dan als bron, maar is een echo.

De cirkel breekt op drie plekken, en alleen als alle drie kloppen:

1. **De harde getallen worden geïmporteerd, niet gegenereerd.** Het model raakt die velden niet aan.
2. **Verkrijgbaarheid en prijs komen uit de eigen catalogus.** Nooit uit modelkennis.
3. **Het oordeelsdeel wordt één keer goedgekeurd** voordat het de bibliotheek in gaat.

Daarom kan er blindelings op vertrouwd worden: niet omdat het model gelijk heeft, maar omdat het één keer gezien is en daarna nooit meer.

### 5.3 Per productgroep tegelijk

Acht citrussen naast elkaar zijn beoordeelbaar, één citroen in isolatie niet. Fouten vallen op door vergelijking. De AI vult een hele groep, Mathijs scant en corrigeert, en tekent voor de groep.

Groepen: citrussen, uien en look, kolen, kruiden, zuren, oliën en vetten, kazen, mosterden en pasta's, sojaproducten, noten, zoetmakers, specerijen.

### 5.4 Wat er in de bibliotheek staat

**Geïmporteerd — code, geen AI**
`vet_pct`, `vocht_pct`, `eiwit_pct`, `zout_pct`, `suiker_pct`, `ph`, `dichtheid_g_per_ml`, later `aroma_componenten`.

**Voorgesteld door AI, goedgekeurd door Mathijs**

| Veld | Waarvoor | Voorbeeld |
|---|---|---|
| `rol` | basis, bindmiddel, zuur, zout, vet, umami, aroma, hitte, textuur, kleur | mayonaise = basis, wasabi = hitte |
| `smaakpalet` | trefwoorden | limoen: fris, citrus, bitter (zeste), bloemig |
| `smaakregister` | Mexicaans, mediterraan, Aziatisch, Frans-klassiek, Midden-Oosters, Noord-Europees | nodig voor de verbindende component (6.4) |
| `aroma_drempel_pct` | vanaf hier próéf je het | chili vanaf circa 0,2%: herkenbaar chili |
| `prikkel_drempel_pct` | vanaf hier gaat het prikken | chili vanaf circa 1,5%: nu wordt het pittig |
| `dosering_min_pct` / `max_pct` | bandbreedte t.o.v. de basis | wasabi 1–3%, miso 5–10% |
| `hitte_gedrag` | smelt glad / schift / verdampt / stabiel | beantwoordt de kaas-vraag |
| `structuur_effect` | bindt, verdunt, verdikt, schift-risico | smeltkaas bindt, oude kaas schift |
| `textuur_eind` | luchtig, romig, plakkerig, krokant, knapperig, smeuïg, vast, poederig | hoe het in de mond voelt (6.3) |
| `uiterlijk` | eigen kleur en effect op het geheel | miso maakt mayonaise beige |
| `stappen_kosten` | hoeveel handelingen het toevoegt | zest raspen = 1 stap |

**Waarom twee drempels en niet één intensiteit.** Een chili-krokantje dat naar chili smaakt maar niet pittig is, en een sriracha-mayonaise die licht blijft: smaak-identiteit en prikkel zijn twee losse dingen. Eén getal "intensiteit 1–5" kan dat verschil niet vasthouden, en juist daar zit het vakmanschap. Met twee drempels kan het systeem sturen op "geef me chili-smaak, geen hitte" en zelf de dosering uitrekenen. Geldt net zo voor knoflook, mosterd, wasabi, gember, peper, rook en zuur.

**Afgeleid uit de eigen app — code, geen AI**
`in_catalogus` plus leverancier, kostprijs per basis-eenheid via de bestaande genormaliseerde velden, allergenen via de bestaande koppeling.

### 5.5 De verkrijgbaarheids-grens

**Een product dat niet te bestellen is, mag nooit in een receptuur.** Geen prompt-instructie maar een grens die code afdwingt: elk voorgesteld ingrediënt wordt getoetst aan de leverancierscatalogus. Wat er niet in staat wordt geweigerd of expliciet gemarkeerd.

Sluit aan op wat er al is: de zoekbalk over de prijslijst-catalogus en `/gerechten/uit-catalogus`, waar catalogusproducten al vastgepind worden. Bijkomend voordeel: de kostprijs is dan meteen echt in plaats van geschat.

### 5.6 Het balansmodel

Bestaat er een basismodel dat zegt wanneer iets in balans is? Het idee klopt, de eenheid niet. Smaken worden niet op dezelfde schaal waargenomen:

| Smaak | Sterk aanwezig bij | Nog net waarneembaar bij |
|---|---|---|
| Zoet (sucrose) | 40% | 0,0098% |
| Zout (NaCl) | 20% | 0,0049% |
| Umami (MSG) | 2% | 0,00049% |
| Zuur (wijnsteenzuur) | 1,6% | 0,00039% |
| Bitter (kinine) | 0,1% | 0,00002% |

Bitter is bij 0,1% al vol aanwezig terwijl zoet daar nog niet begint — een factor 400. Umami wordt circa 15× gevoeliger waargenomen dan suiker. Een balk in gewichtsprocent vergelijkt appels met peren.

**De omrekening die het wél laat werken:** deel de concentratie door de drempelwaarde van díé smaak. Dan krijg je "hoeveel keer boven de drempel", en dat zijn wél vergelijkbare getallen.

**Vier lagen met verschillende hardheid**

*1. Harde grenzen — meetbaar*
- Zoutvenster: **0,8–1,2%** van het totaalgewicht, oplopend tot circa 2% bij rijke gerechten. Onder circa 0,6% smaakt het vlak.
- Droogpekel op vlees: **0,75–1,25%** van het vleesgewicht.
- Drempelwaarden per smaak (tabel hierboven).

Hiermee kan het systeem zeggen: *"deze saus zit op 0,4% zout, hij gaat vlak smaken."* Dat is geen mening.

*2. Vaste vakregels*
Vinaigrette 3 delen olie op 1 deel zuur. Gastrique ongeveer 1 op 1 suiker op azijn. Doseerbereiken per accent uit 5.4.

*3. De correctiematrix*

| Klacht | Wat erbij kan |
|---|---|
| Te zoet | zuur, zout, bitter |
| Te zuur | vet, zoet |
| Te zout | zuur, vet, meer volume |
| Te bitter | vet, zoet, zout |
| Vlak | zout eerst, dan zuur |
| Te vet | zuur |

Een opzoektabel, geen oordeel. Daarmee zegt het systeem niet alleen dát iets uit balans is maar ook wat eraan te doen.

*4. Per gang — vakkennis, geen wetenschap*
Een amuse mag scherper en zouter om de eetlust te openen. Een vet hoofdgerecht heeft zuur nodig om door het vet te snijden. Een dessert leunt zoet maar heeft zuur nodig om niet te plakken. Deze regels horen in de laag die Mathijs goedkeurt.

**Kalibreren op de eigen recepten.** Reken het balansprofiel uit van de gerechten die al jaren goed verkopen. Clusteren ze in een band, dan is dát de huisbalans — afgeleid uit de eigen keuken, niet uit een boek. Kost geen enkele nieuwe meting.

**De eerlijke grens:** er bestaat geen gepubliceerde formule die voorspelt of iets lekker is. Wat wel bestaat: harde grenzen, vaste verhoudingen, correcties, en de eigen band. Samen vangen die de fouten af. Ze garanderen geen genot.

### 5.7 Het Nederlandse smaakprofiel

**De zes assen liggen vast.** Wageningen traint sensorische panels op precies zes schalen: **zoet, zuur, bitter, umami, zout en vetgevoel**, en bouwde een smaakdatabase met die zes waarden voor 476 voedingsmiddelen, gekoppeld aan de Nederlandse voedselconsumptiepeiling. Neem die as-indeling over — dan sluit de bibliotheek aan op bestaand onderzoek.

**Nederlanders zijn gewend aan veel zout en veel zoet.** Uit de Voedselconsumptiepeiling 2019–2021 (RIVM, circa 3.500 mensen): gemiddeld **8,7 gram zout** per dag tegen een advies van 6, en **114 gram suiker**. Dat is wat men eet, niet per se wat men lekker vindt — maar gewenning verschuift de voorkeur wel.

Praktisch: koken aan de onderkant van het zoutvenster smaakt de gasten vlak. **Maar het doel is een band, geen richting.** "Boven gemiddeld" betekent het bovenste derde van het venster, niet erbuiten. Een stamppot zonder zout is fout; een stamppot die zout ís, ook.

**Voor Nederlandse gasten geldt: gedeelde aroma's passen bij elkaar.** Uit het onderzoek naar smaaknetwerken (Ahn e.a., *Nature Scientific Reports*): West-Europese en Noord-Amerikaanse keukens combineren juist ingrediënten die smaakmoleculen delen; Oost-Aziatische keukens vermijden overlap. De vuistregel voor deze gasten is dus "deze twee delen aroma's, dus ze passen". Dat maakt de aroma-laag hier waardevoller dan voor een willekeurige cateraar.

**Maar de eigen gasten verslaan elk landelijk gemiddelde.** Bruiloften en bedrijfsfeesten in Drenthe zijn een specifieke groep die betaalt voor iets bijzonders. Het landelijke profiel is de koude start; de eigen verkoop is de waarheid, en die data zit al in de app.

**Eén hypothese, expliciet als hypothese:** op umami en zuur waarschijnlijk iets bóven het Nederlandse gemiddelde — umami omdat het indruk maakt zonder scherpte, zuur omdat het voorkomt dat eten na een kwartier op de uitgifte vlak wordt. Beredeneerd, niet bewezen. Hoort in de goed te keuren laag.

**Bronnen:** [NEVO — RIVM](https://www.rivm.nl/nederlands-voedingsstoffenbestand), [FlavorDB2](https://ift.onlinelibrary.wiley.com/doi/10.1111/1750-3841.17298), [Flavor network and the principles of food pairing](https://www.nature.com/articles/srep00196), [Matters of taste — WUR](https://research.wur.nl/en/publications/matters-of-taste-dietary-taste-patterns-in-the-netherlands/), [Taste detection threshold](https://en.wikipedia.org/wiki/Taste_detection_threshold)

---

## 6. De receptuur-motor

### 6.1 Denken als een kok, niet als een controleur

Dit is de crux. Zonder deze paragraaf wordt de rest een portier in plaats van een kok.

**Twee manieren om het te bouwen, en maar één werkt.** De verkeerde: het model verzint vrij iets en wordt daarna aan twaalf regels getoetst. Dan valt het telkens ergens op om, óf er komt alleen het allerveiligste doorheen. In beide gevallen wordt het na twee weken niet meer gebruikt.

De goede: **de regels zitten in de vorm, niet in de controle erna.** Een kok verzint geen gerecht om het daarna te keuren. Een kok denkt "dit wordt iets tartaar-achtigs" en weet dan al dat daar zuur bij hoort, iets krokants bovenop, iets kouds, en zout op het laatst. De vorm draagt de lessen; wie binnen de vorm werkt kan de meeste fouten niet eens maken.

**Een sjabloon is samengeperste ervaring.** Dat maakt de sjablonen uit 6.2 en 6.3 het hart van de motor, geen hulpmiddel.

**Grenzen tegenhouden, lessen sturen**

| | Wat het is | Waar het hoort |
|---|---|---|
| **Grenzen** | Maakt het onmogelijk, onveilig of onverkoopbaar | Een poort. Blokkeert. Hooguit een stuk of zes. |
| **Lessen** | Maakt het beter | In de vorm. Stuurt, blokkeert nooit. |

Die twee verwarren is precies hoe een kok in een controleur verandert.

**De lessen van een kok — en hoe we eraan komen.** NEVO kent geen vuistregels, FlavorDB kent geen vakmanschap. Het gaat om dingen als: vet heeft zuur nodig; smaakt het vlak dan mist er zout en geen kruiden; iets krokants bij iets zachts; rook is een smaakmaker en geen basis; zuur gaat er op het laatst in; een beetje bitter maakt zoet interessanter; textuur verveelt sneller dan smaak; een gerecht heeft één hap die je onthoudt. Het zijn er veertig à zestig, en dan is het op.

**Ze staan al in de eigen recepten.** Dus draaien we het om: het systeem zoekt het patroon en legt het voor. *"In negen van je twaalf sausen zit zuur bij iets vets. Is dat een regel?"* — *"Je zet nooit twee gerookte dingen in één menu. Bewust?"* Ja, nee, of "meestal wel maar niet hierbij". Zo komen de lessen erin op de enige manier die werkt: niet bedacht, maar afgeleid uit eigen werk en bevestigd.

### 6.2 De kookfilosofie als ontwerpeis

"Complex proeven, simpel maken." Basis mag kant-en-klaar (Zaanse mayonaise), de smaakmaker nooit — je koopt geen tube wasabi-mayonaise, je maakt hem.

| Saus | Basis | Accent | Balans |
|---|---|---|---|
| Limoenmayonaise | mayonaise | limoen | zout |
| Wasabimayonaise | mayonaise | wasabi | zuur + zout |
| Misomayonaise | mayonaise | miso + sesam | limoen |

**Basis + accent + balans**, drie tot vijf ingrediënten, één of twee handelingen. Vast te leggen als **smaaksjablonen**: koude saus op basis, warme saus, marinade, rub, dressing, salade. Per sjabloon: welke rollen erin mogen, hoeveel ingrediënten en stappen maximaal, en het doseerbereik per rol. Daarmee kán de motor geen saus met veertig ingrediënten voorstellen.

### 6.3 Structuur is het skelet

| Component | Structuur | Temperatuur | Smaakrol |
|---|---|---|---|
| Gegrilde ananas | vast, sappig | warm | zuur en zoet, rook |
| Karamel-dotjes | plakkerig, dik | kamer | zoet, bitter-diep, rum |
| Kokosschuim | luchtig, zacht | koud | vet, zacht, romig |

Drie structuren, twee temperaturen. Dát is waarom het werkt — niet de smaakcombinatie alleen. Een bord waarin alles zacht is, is saai ook al klopt elke smaak.

**Gerechtsjablonen** leggen vast welke structuren aanwezig moeten zijn. Voor een dessert: een dragend element, een saus of gel, iets luchtigs, iets krokants, en minstens één temperatuurverschil. Toets het ananas-dessert daaraan: vast ✓, saus ✓, luchtig ✓, temperatuurverschil ✓, **krokant ontbreekt**. Dát moet het systeem melden.

**Eén hoofdrol, de rest ondersteunt.** Uit de amuse met gerookte bavette: *"het vlees wordt uitgesproken, alleen de saus ondersteunt het."*

| Component | Rol |
|---|---|
| Gerookte bavette | **hoofdrol** — vol, rond |
| Sriracha-mayonaise | ondersteunend — licht, niet pittig |
| Chili-krokantje | accent — smaak en textuur, geen hitte |
| Citrus in de saus | correctie — houdt het fris |

Elke component krijgt dus een **luidheid**: hoofdrol, ondersteunend, accent of correctie. De regel: één hoofdrol, hooguit twee accenten, minstens één correctie zodra er iets vets of zwaars in zit. Drie uitgesproken elementen naast elkaar is de meest gemaakte fout, en hij is te tellen.

### 6.4 Het gerechtenboek en de verbindende component

**Het boek.** De referentie is [Gastronomixs](https://www.gastronomixs.com/en/components) — ruim 41.000 koks, meer dan 6.200 *componenten* die je combineert tot eigen gerechten. Het fundament ligt er al: de `components`-tabel bestaat, met `base_cost_cents`, `flavor_tags`, `preparation_steps` en een allergenen-koppeling.

**Wat dit boek anders maakt:** Gastronomixs geeft je componenten van andere koks, zonder te weten wat ze bij jóuw leverancier kosten, of ze op jouw machines passen, of ze de foodcost halen, of ze de busrit overleven. Dit boek weet dat, want het hangt aan de eigen catalogus, machines en events.

Elke component krijgt het volledige profiel uit hoofdstuk 5. Daarmee is het geen recept meer maar een **bouwsteen met bekend gedrag**.

**De verbindende component.** Knolselderijtartaar staat in het boek. Procureursteak van de smoker staat in het boek. Wat ontbreekt is de saus — de verbindende factor, want niet elke jus past bij die combinatie.

Dat is een ander soort vraag dan "ontwerp een gerecht", en het derde is grotendeels **uit te rekenen**:

| Wat de brug moet doen | Hoe code het bepaalt |
|---|---|
| **Overlap** — bij beide horen | Gedeeld register of gedeelde aroma's met A én B |
| **Het gat vullen** | Tel de zes assen van A en B op; wat laag blijft, moet de brug leveren |
| **Niet botsen** | Uitsluitingen per ingrediënt, los van het register |

**Code stelt de eis, het model vult hem in.**

*Uitgewerkt.* Tartaar: fris, zuur, koud, romig — zuur hoog, umami laag, zout laag. Procureur: vlezig, komijn, licht pittig, rook, warm — vet hoog, umami midden. **Het gat:** allebei laag in umami en diepte. **Register:** aards en gerookt met een frisse bovenlaag. **Verbod:** geen extra zuur, geen extra pit. De opdracht: *hoog in zout, umami-rijk, diep en gerond, zonder eigen zuur of hitte* — een miso-achtige jus. Dat is exact waar de kok zelf op uitkwam, en dat de rekensom dat reproduceert is het bewijs dat het mechanisme klopt.

*Tweede voorbeeld.* Salade van maïs, sjalot en rode peper (zoetig, scherp, koud) plus gamba's met knoflook in chimichurri-stijl (kruidig, fris, warm). **Het gat:** nergens vet of rondheid; beide mager en scherp. **Register:** Latijns-Amerikaans, fris, geroosterd. **Verbod:** niets dat met schaaldier vecht. Kokos valt af — register klopt, maar botst. Het antwoord: **schuim van geroosterde maïs** — het herhaalt een ingrediënt uit de salade (echo-principe), het roosteren geeft de ontbrekende diepte, het brengt vet en rondheid, en maïs en schaaldier vechten nergens. Alternatief: avocado-schuim, puur vet en neutraal.

### 6.5 De techniek-bibliotheek

De ingrediënten-bibliotheek kent kokos. Hij weet niet wat een schuim ís. En "spuitbare karamel in dotjes" is geen ingrediënt maar een techniek met een dikte-eis. Zonder techniek-bibliotheek moet het model de methode verzinnen, en dat is waar het overtuigend de mist in gaat.

Dertig à veertig stuks, en ze veranderen nooit: schuim, gel, crème, coulis, karamel, crumble, tuile, poeder, ijs, gelei, marinade, pekel, rook, gril, confijt.

| Veld | Waarvoor |
|---|---|
| `vereist_basis` | vloeistof, puree, vast product |
| `vereist_eigenschap` | de voorwaarde waar het ingrediënt aan moet voldoen |
| `hulpmiddel` + `doseerbereik` | lecithine, gelatine, agar, room, eiwit — en hoeveel |
| `eindtextuur` | wat het oplevert |
| `apparaat` | koppelt aan 4.3 |
| `standtijd_min` | hoe lang het goed blijft op de uitgifte |
| `transport_bestendig` | overleeft het de bus |
| `stappen` | hoeveel handelingen |

**De sterkste eigenschap:** de voorwaarde-velden maken van "kan kokos schuimen?" een som in plaats van een mening. Kokosmelk heeft vet én eiwit, dus schuimt; een waterig sap niet, dus daar moet een bindmiddel bij. Code rekent dat uit met profielen die er al staan.

### 6.6 De cateringgrens

Een sterrenzaak plateert één bord, à la minute, drie meter van de gast. Hier gaat het om tachtig borden of een buffet, buiten, met een busrit ertussen. Een schuim dat na vier minuten inzakt is briljant in een restaurant en waardeloos op de uitgifte.

Vier dingen die code bewaakt: **schaalbaarheid** (kan dit voor 80?), **standtijd**, **transport**, en **handelingen per portie**. Niet als waarschuwing achteraf maar als grens vooraf — met de aanpassing die het wél haalbaar maakt.

### 6.7 De locatie is een andere keuken

"Niet het voorbereiden, maar het afpresenteren." Voorbereiden gebeurt thuis met alle apparatuur op een zelfgekozen moment; afwerken op locatie met een fractie ervan terwijl tachtig mensen wachten. Twee verschillende budgetten.

Elke stap krijgt daarom een `plaats`: thuis, bus of locatie. Dat maakt drie dingen mogelijk:

**De afwerk-begroting.** Beschikbare minuten × handen op locatie, tegen seconden per bord × aantal gasten. Een dessert van 90 seconden per bord is bij tachtig gasten twee uur werk — het verschil tussen een geslaagde en een mislukte avond. Dezelfde rekensom als de prep-planning, maar voor de locatie.

**Serveervorm als ontwerp-input.** Bord uitserveren, buffet, walking dinner en family style stellen totaal andere eisen. Het systeem moet de vorm kennen vóórdat het iets voorstelt.

**Warmteverlies op het bord.** Wat dun, nat en groot van oppervlak is, koelt in seconden af. Een warm bord koopt minuten. Af te leiden uit gegevens die de bibliotheek al heeft.

### 6.8 Machines zijn een motor, geen filter

Apparatuur stond in versie 1.0 als controle achteraf. De echte vraag is een ontwerpvraag: *"ik heb een Robot Coupe die ik weinig gebruik — hoe gaan we die méér gebruiken?"* Een machine die stilstaat is betaald en levert niets op.

| Handeling | Met de hand | Met machine |
|---|---|---|
| Knolselderij in fijne brunoise, 80 porties | Uren snijwerk, ongelijk | Robot Coupe CL50 — brunoise 3×3×3 mm, 250 kg/uur — **mits het juiste blad aanwezig is** |
| Pastrami flinterdun, 80 porties | Niet gelijkmatig te krijgen | Snijmachine, dikte instelbaar |

Zonder die machines is dat gerecht economisch onmogelijk; ermee is het een van de goedkoopste indrukwekkende dingen op de kaart. **De machine maakt het gerecht.** En bij tachtig borden is gelijkmatigheid ook de visuele kwaliteit: tachtig identieke blokjes zien er professioneel uit, tachtig handgesneden huiselijk.

**De onderschatte machine:** de grote vacuümmachine. Sous-vide is het bekende gebruik, maar voor een cateraar zit de winst elders — vacuüm geportioneerde componenten reizen goed en blijven langer goed, wat direct de bus, de standtijd en de afwerking op locatie raakt. Compressie van fruit en groente is bovendien een sterrenzaak-techniek die vrijwel niets extra kost.

### 6.9 Investeringsadvies met terugverdientijd

Een machine kan alleen wat zijn hulpstukken kunnen. De CL50 kán brunoise; met drie bladen waar dat er niet bij zit, kan hij het niet. De apparatuur-lijst legt vast wat er daadwerkelijk in de kast ligt.

**Het advies valt gratis uit de techniek-bibliotheek.** Elke techniek noemt het benodigde apparaat; de apparatuur-lijst noemt wat er is. Het verschil is het gemiste repertoire:

> *"Zeven technieken zijn gesloten — gel, coulis, fijne puree, emulsie, fijne pasta, schuim en poeder. Zes gaan open met één blender."*

**Drie soorten opbrengst, niet één**

| Soort | Hoe hard | Rekenwijze |
|---|---|---|
| **Bespaarde tijd** | Hard | Uren × uurtarief × hoe vaak dat gerecht per jaar op een menu staat. Alle drie staan al in de app. |
| **Nieuw repertoire** | Zacht | Wat je ermee kúnt verkopen. Aanname, geen feit — moet als aanname gelabeld zijn. |
| **Gelijkmatigheid** | Niet in euro's | Wel echt bij tachtig borden. Noemen, niet verrekenen. |

Een systeem dat die twee optelt tot één mooi getal, liegt.

**De maat is terugverdientijd, niet rendement.** Een brunoise-blad van een paar honderd euro, bij een amuse die acht keer per jaar op een menu staat en drie uur snijwerk scheelt, is na het eerste of tweede event terugverdiend.

**Twee regels die het eerlijk houden:** eerst afmaken wat je hebt (een blad voor een machine die je bezit verslaat vrijwel altijd een nieuwe machine), en een aanschaf telt pas als er menu's zijn die hem gebruiken — anders staat er straks een tweede apparaat stof te vangen naast de eerste.

### 6.10 De motor draait vier kanten op

1. **Van gerecht naar haalbaarheid** — "ik wil dit; kan het, is het bestelbaar, past het in de tijd, houdt het stand?"
2. **Van middelen naar gerecht** — "dit zijn mijn machines, handen, bus, tachtig gasten, veertig minuten afwerktijd; wat kan ik hiermee briljant maken?"
3. **Van gerecht naar ontbrekend middel** — "dit kan niet met wat je hebt; dit mist, zoveel kost het, zo snel heb je het terug."
4. **Van twee componenten naar de brug** — 6.4.

Vier standen van één agent, geen vier agents. Zelfde bibliotheken, zelfde grenzen, andere vraag.

### 6.11 De criteria

**De zes poorten — hier houdt het systeem écht tegen**

| Grens | Waarom hard |
|---|---|
| Voedselveiligheid en allergenen | Wet en veiligheid |
| Bestelbaar | Niet te krijgen is niet te maken |
| Foodcost | Buiten de menuprijs is het onverkoopbaar |
| Afwerktijd op locatie | Seconden per bord × gasten tegen minuten en handen |
| Techniek uitvoerbaar | Zonder apparaat of eigenschap kán het niet |
| Standtijd en transport | Valt het uit elkaar vóór het gegeten wordt |

**De lessen — deze sturen, en je mag er overheen**

Rolverdeling · compositie · balans · simpelheid · menu-samenhang · machine-inzet · uiterlijk.

**Wat oordeel blijft**

Smaakpalet (model stelt voor met uitleg, mens tekent) en beleving (mens, via de proeftest).

Zes poorten, zeven sturende lessen, twee dingen die van de kok blijven. Niet honderdduizend criteria — en het overgrote deel houdt niets tegen.

### 6.12 Nooit "kan niet"

Met twaalf toetsen dreigt een motor die alles afwijst. Daarom één harde regel over hoe het systeem faalt: **het antwoord is nooit "dat kan niet"**, maar altijd het dichtstbijzijnde dat wél kan, plus wat eraan in de weg stond.

Geen blender en dus geen lavas-gel? Fout antwoord: "kan niet." Goed antwoord: hier is een variant met ingekookte lavas-olie die wél kan; wil je de gel echt, dan is dit de blender en dit de terugverdientijd.

Hoe strenger de grenzen, hoe belangrijker dat elke afwijzing een alternatief meebrengt.

### 6.13 Het menu-niveau

Op menu-niveau ontstaan fouten die per gerecht onzichtbaar zijn: drie keer iets romigs achter elkaar, rook in elke gang omdat de smoker toch aanstaat, vier keer hetzelfde ingrediënt in een ander jasje. Controle over het hele menu op **herhaling van ingrediënten, technieken en structuren**, plus **de opbouw van intensiteit over de gangen** — een menu bouwt op en zakt aan het eind af; een dessert dat harder schreeuwt dan het hoofdgerecht is een fout.

### 6.14 Prijs en dieet zijn ontwerp-grenzen

Een ontwerper die iets moois bedenkt en dán vertelt dat het te duur is, laat het werk aan de kok. Hij moet vanaf het begin binnen een foodcost-doel werken. En bij tachtig gasten zijn er altijd vega's en meestal iemand met gluten of lactose: de variant hoort meteen mee te komen, of eerlijk gemeld te worden dat het niet kan — nu, niet op de ochtend van het feest.

---

## 7. Agent-catalogus

| # | Agent | Klasse | Golf | Model | Trigger |
|---|---|---|---|---|---|
| 1 | Chef-coach | A | 3 | Haiku 4.5, escalatie Opus 5 | Gebruiker |
| 2 | Mail-intake & offerte-reminder | H | 5 | Sonnet 5 | Inbound mail + cron |
| 3 | Operations↔purchasing | D → H | 2 (D) / 6 (H) | Geen (D) / Sonnet 5 (tekst) | Headcount-wijziging |
| 4 | QA/HACCP-signalering | D | 3 | Geen | Cron + registratie |
| 5 | Dagregisseur | D + A | 3 | Haiku 4.5 | Cron |
| 6 | Prep-batching | D | 2 | Geen | Openen kookbord/MEP |
| 7 | GN/equipment-capaciteit | D | 2 | Geen | Plannen/schalen |
| 8 | Scheikunde / R&D | A → H | Uitgesteld | Opus 5 | Na afwijking |
| 9 | Live microsturing | D (solver) | Uitgesteld | **Geen LLM** — CP-SAT | Tijdens productie |
| 10 | Social-planner | A | Uitgesteld | Sonnet 5 | Per kwartaal |
| **11** | **Receptuur-ontleder** | **H** | **1** | **Sonnet 5** | **Bij opslaan recept** |
| **12** | **Receptuur-ontwerper** (4 standen) | **H** | **4** | **Sonnet 5, Opus 5 bij de brug** | **Gebruiker** |

### 7.1 Agent 11 — Receptuur-ontleder (nieuw, en de eerste die gebouwd wordt)

**Doel.** Mathijs zet zijn eigen receptuur erin met een korte bereidingswijze. De AI leest na, kijkt naar de manier van koken en opmaken, en hakt het op in micro-stappen. Hij keurt goed per recept, in een lade naast het recept.

**Grens die code bewaakt.** Ingrediënten matchen op de catalogus of bestaande componenten; hoeveelheden per gast; temperaturen uit de normtabel en niet uit de tekst; allergenen afgeleid uit de koppeling.

**Waarom eerst.** Hij is intern en volledig terug te draaien — het perfecte proefkonijn voor het goedkeur-patroon dat agent 12, de bestellingen en de mail later hergebruiken. En zonder hem blijft hoofdstuk 4 handwerk.

**Gratis ijkmaat.** De tien fase-schema's in `src/lib/prep/recipeTemplates.ts` zijn bewezen goed. Laat pulled pork en brisket ontleden en leg het ernaast. Komt het niet overeen, dan deugt de ontleder nog niet.

### 7.2 Agent 12 — Receptuur-ontwerper (nieuw)

Vier standen (6.10). Code bewaakt sjabloon-grenzen, compositie, rolverdeling, techniek-haalbaarheid, verkrijgbaarheid, doseerbereik, standtijd, afwerktijd, prijs, dieet en allergenen. Mathijs proeft en tekent; pas in de status *vrijgegeven* mag het aan een menu.

Afwijzingen worden vastgelegd met reden — vier knoppen: te zwaar, smaken passen niet, te veel werk, past niet bij mijn gasten. Twee tellen werk, en het is de goedkoopste leerbron in het plan.

### 7.3 Wijzigingen aan de bestaande agents

**Agent 1 — Chef-coach.** Bestaat als `/api/chef-coach` (Haiku 4.5). Elke vraag over temperatuur, tijd, allergeen of kostprijs wordt beantwoord uit de database, niet uit modelkennis. De router kiest op intentie: *"hoe lang moet de brisket nog?"* is een opzoekvraag zonder model; *"waarom is mijn brisket droog terwijl de kerntemperatuur klopte?"* gaat naar Opus 5.

**Agent 2 — Mail-intake.** Classificatie bestaat al in `src/lib/emailInbound.ts` (vijf categorieën, zekerheidsscore, kostenregistratie, automatisch concept-klant boven 0,6). Resteert: het offerte-concept en de opvolging — 3 dagen stilte na verzenden, en een aparte toon en termijn (6 dagen) bij "we vergelijken nog". Prompt-injectie is hier reëel: het model levert alleen gestructureerde velden, alle bedragen komen uit de eigen database, en er is altijd bevestiging vóór verzending.

**Agent 3 — Operations↔purchasing.** D voor de hele keten, H alleen voor de laatste stap. Pak-prijs is geen eenheidsprijs: terugrekenen uitsluitend via `src/lib/unitPrice.ts`; een agent mag nooit zelf een pakgrootte afleiden uit een productnaam.

**Agent 4 — QA/HACCP.** Van signaleren naar vrágen: het systeem vraagt per receptuur op het juiste moment om te meten, zodat het boek automatisch bijgewerkt wordt én `production_measurements` gevuld raakt. Blijft klasse D; de normen verhuizen naar de tabel uit 4.5.

**Agent 6 — Prep-batching.** Uitbreiding van `src/lib/prep/`, geen nieuwbouw. Toe te voegen: handtijd/wachttijd, `prep_group`, `plaats`. Blokker: `mep_items` (hoofdstuk 3).

**Agent 9 — Live microsturing.** Blijft uitgesteld en blijft zonder taalmodel. Dit is resource-constrained scheduling met een kritiek pad en hoort op een solver (OR-Tools CP-SAT), niet op tool-use. Een LLM dat een planning "uitrekent" levert een schema dat plausibel oogt en niet haalbaar is. **Aanvulling op v1.0:** er zit vandaag geen rekenmotor in de app en zo'n motor draait niet op Vercel — dat is een aparte server, zwaar voor één keuken. Extra reden om te wachten. Eerst een periode met alleen statusmeldingen om te meten of de discipline er is.

---

## 8. Bouwvolgorde

| Stuk | Inhoud | Waarom hier |
|---|---|---|
| **0a** | Drie blokkers uit hoofdstuk 3 repareren. Licenties NEVO en FlavorDB2 controleren. Prijstabel in `src/lib/aiCost.ts` corrigeren (9.4). | Anders loopt alles vast op schema-fouten en klopt het kostenplafond niet. |
| **0b** | Goedkeur-lade bouwen — eerste gebruiker van `ai_action_proposals`, soorten uitbreiden, verlopen laten werken. | Elke H-agent hierna hergebruikt dit. Eén keer goed bouwen. |
| **0c** | NEVO importeren. Bibliotheek-tabel aanleggen met alle drie de blokken uit 5.4. | Harde getallen eerst; ze zijn af zodra ze binnen zijn. |
| **0d** | Groepsgewijs vullen (5.3), inclusief eindtextuur en smaakregister. | Begin bij de meest gebruikte groepen. |
| **0e** | Techniek-bibliotheek (6.5), **direct gevolgd door het gemis-rapport (6.9)**. | Klein en stabiel. Het gemis-rapport is het eerste zichtbare resultaat. |
| **0f** | Balansmodel (5.6): drempels en zoutvenster, correctiematrix, vakregels. Zes assen conform 5.7. | Maakt van "uit balans" een som. |
| **0g** | Nederlands profiel (5.7): pairing op gedeelde aroma's, zoutdoel in het bovenste derde. | Eén keer instellen; bepaalt hoe elk voorstel uitpakt. |
| **1** | Agent 11, **alleen de recepten op actieve menu's** (9.5). IJkmaat-test vóór de rest. | Nu pas heeft ontleden zin. Zestig à tachtig in plaats van alles. |
| **1b** | Kalibratie: balansprofiel van de bestsellers → huisbalans, afgezet tegen het Nederlandse gemiddelde. | Kost geen nieuwe metingen. |
| **1c** | Lessen afleiden uit eigen recepten (6.1) en ter bevestiging voorleggen. Sjablonen eruit opbouwen. | Dit maakt de motor een kok in plaats van een controleur. |
| **1d** | Het gerechtenboek (6.4): elke ontlede bereiding wordt een herbruikbare component met vol profiel. | Valt vanzelf uit golf 1; de `components`-tabel bestaat al. |
| **2** | Handtijd/wachttijd, `prep_group` en `plaats` in de prep-planning. GN- en apparatuurcheck. Apparatuur-tabel uitgebreid (6.8). | Uitbreiding van wat draait. **Deels gebouwd 2026-08-31** — zie 8.1. GN- en apparatuurcheck staan nog open. |
| **3** | Keuken-modus: één scherm met receptuur, planning en HACCP. Normen naar de tabel, HACCP gaat vragen. | Hier komt het samen in de keuken. |
| **4** | Agent 12, stand 1: ontwerpen op aanvraag. Saus- en gerechtsjablonen, compositie, cateringgrens, proeftest-status, afwijzingsredenen. | Vraagt beide bibliotheken en een bewezen goedkeur-flow. |
| **4b** | Menu-brede controle (6.13). | Kan pas als losse gerechten kloppen. |
| **4c** | Stand 2 (vanuit middelen) en stand 3 (investeringsadvies). | Zelfde motor, vraag omgedraaid. |
| **4d** | Stand 4: de verbindende component (6.4). | Wordt sterker met elke component in het boek. |
| **5** | Mail-intake afmaken: offerte-concept en opvolging. | Losgekoppeld van al het bovenstaande — **mag naar voren** als het seizoen aantrekt. |
| **6** | Conceptbestellingen met goedkeuring. | Externe, onomkeerbare stap — laatst, op een bewezen patroon. |
| **Later** | Aroma-laag (FlavorDB2), R&D (8), microsturing (9), social (10). | Zie 7.3 en hoofdstuk 11. |

### 8.1 Wat golf 2 heeft opgeleverd (2026-08-31)

`recipe_steps` bestond al met handtijd, wachttijd, `prep_group` en `plaats`, maar stond los van de planning die draait. Die brug ligt er nu.

| Wat | Waar |
|---|---|
| `prep_tasks` draagt de vijf velden plus `toezicht_nodig` en een verwijzing terug naar de stap | `supabase/migrations/20260901030000_prep_tasks_stappen.sql` |
| Terugrekenen over de kéten van dít recept in plaats van vaste lead-times per fase | `src/lib/prep/stapPlanning.ts` |
| Een ontleed gerecht krijgt stap-taken en slaat het sjabloon over; niet-ontlede gerechten houden het sjabloon | `src/lib/prep/bulkSchedule.ts` |
| Wachttijd is niet langer een lijst van drie fase-namen maar een getal op de taak; gat-vulling meet de hándtijd van de kandidaat | `src/lib/prep/werkvolgorde.ts` |
| Budget per plaats, en bundels van dezelfde bewerking over recepten heen | `WerklijstView.tsx`, aangesloten op `/keuken/kookbord` |

Drie dingen die bij het bouwen boven kwamen en het vastleggen waard zijn:

1. **De werkvolgorde-motor rendeerde nergens.** `WerklijstView` en `PlanTakenSheet` stonden in de map van `/keuken/board`, en die route is sinds de kookbord-splitsing een doorverwijzing. De motor was getest en werkte, maar geen scherm gebruikte hem. Nu hangt hij als tweede tabblad in het kookbord.
2. **Een geschatte duur mag niet in een kolom belanden.** Waar de ontleder geen minuten heeft opgeschreven, blijven `duur_actief_min` en `duur_passief_min` leeg en zegt het scherm "duur onbekend". Er is wél een plaatsingsduur nodig om een stap op de tijdlijn te zetten — die leeft alleen in `scheduled_at` en nergens anders.
3. **De duren komen niet uit de lucht, en dat is precies goed.** De drie `recipe_steps` die er staan (de gerookte bavette) hebben `prep_group` en `plaats`, maar geen minuten. Nagemeten waarom: de `bereidingswijze` van dat gerecht is drie regels zonder één tijd erin, en de ontleder meldt dat zelf — "geen hoeveelheden of tijden vermeld in de bron, dus deze velden zijn leeg gelaten". Opnieuw ontleden helpt dus niet; hetzelfde recept levert hetzelfde niets op. Dat de aardbeienquenelle wél 62 tegen 720 minuten gaf komt doordat díe bron tijden noemt.

   Daaruit volgt een gat dat golf 2 niet dicht en dat de moeite van benoemen waard is: **er is geen enkele plek waar je een receptstap met de hand kunt aanvullen.** `bewaarReceptStappen` accepteert alleen wat de ontleder oplevert, en geen scherm tóónt de opgeslagen stappen — `recipe_steps` wordt buiten het schrijfpad en `bulkSchedule` nergens gelezen. Zolang dat zo is kan handtijd alleen ontstaan als hij toevallig in de recepttekst staat. De keuze is: recepturen aanvullen aan de bron, of de stappenlijst bewerkbaar maken. Dat laatste hoort bij golf 3, de keuken-modus.

---

**Waarom mail-intake niet vooraan staat.** Op zakelijke impact hoort agent 2 eerst: een gemiste aanvraag kost direct omzet. Hij staat later omdat de volgorde ook risico weegt, en dit de eerste agent is die naar buiten praat. De eerdere golven bouwen het patroon — D-berekening onder, model erboven, goedkeuring ertussen — waarna agent 2 dat patroon toepast in plaats van uitvindt. **Maar hij hangt van niets uit hoofdstuk 4 of 5 af en is volledig parallel te bouwen.** Naar voren halen is een toegestane afwijking, geen improvisatie. Enige harde voorwaarde: de goedkeur-lade (0b) moet de externe stap afdekken.

---

## 9. Kosten en haalbaarheid

### 9.1 Doorgerekend

Prijzen per miljoen tokens: **Haiku 4.5** $1 / $5, **Sonnet 5** $2 / $10, **Sonnet 4.6** $3 / $15, **Opus 5** $5 / $25. Cache-lezen kost circa een tiende van de invoerprijs; de Batch-API is de helft.

Eén receptuur ontleden of ontwerpen is grofweg 4.000 tokens in en 2.000 uit — op Sonnet 5 circa **2,6 eurocent per gerecht**.

| Scenario | Zonder trucs | Met caching + Batch |
|---|---|---|
| Alle bestaande recepten ontleden (±300) | ± €8 | ± €4 |
| 1.400 gerechten | ± €37 | ± €18 |
| 1.400 op Opus 5 | ± €92 | ± €46 |
| Hele ingrediënten-bibliotheek (±15 groepsrondes) | ± €2 | ± €1 |
| Techniek-bibliotheek (40 stuks) | < €1 | < €1 |

Tientallen euro's, geen duizenden. Eenmalig werk aan een fundament dat blijft liggen.

### 9.2 Waar de kosten wél ontsporen

Niet in het aantal gerechten, maar in **hoeveel context per vraag wordt meegestuurd**. De hele bibliotheek meesturen — 500 ingrediënten × 400 tokens is 200.000 tokens — maakt van een vraag van 3 cent een vraag van 40 cent. Bij twintig vragen per week het verschil tussen €3 en €35 per maand.

De oplossing zit al in het plan: code filtert eerst op rol, bestelbaarheid, foodcost en seizoen en levert vijftien kandidaten in plaats van vijfhonderd. Het model kiest daaruit.

> **Elke controle die code doet, is een token die je niet betaalt.**

Het veiligheidsprincipe en het kostenprincipe zijn dus hetzelfde principe.

### 9.3 Vier besparingen, drie ervan bestaan al

| Maatregel | Winst | Status |
|---|---|---|
| Alleen een voorselectie meesturen | ~40× op invoer | **Nieuw** — het belangrijkste ontwerpbesluit |
| Prompt-caching op het vaste deel | ~10× op dat deel | Al in 44 bestanden |
| Batch-API voor eenmalig werk | 50% | Al in gebruik bij de prijslijsten |
| Model per taak (Haiku / Sonnet 5 / Opus 5) | 3–5× | `src/lib/ai-modes.ts` bestaat |

### 9.4 Twee fouten in de huidige kostenberekening

1. **`src/lib/aiCost.ts` rekent Opus drie keer te duur** — er staat $15 / $75 voor `claude-opus-4-7`; werkelijk is $5 / $25. Het kostenplafond slaat te vroeg dicht en Opus lijkt onbetaalbaar.
2. **Sonnet 5 is goedkoper dan wat er draait** — `claude-sonnet-4-6` staat op 41 plekken tegen $3 / $15; Sonnet 5 is $2 / $10. Nieuwer én een derde goedkoper.

### 9.5 De echte bottleneck is tijd, niet geld

De AI-kosten zijn verwaarloosbaar. **De schaarse hulpbron is de goedkeuring.** Vijftien groepsschermen, veertig technieken, vijftig lessen, en een ontleding per recept — die laatste is de grote: bij tweehonderd recepten en twee minuten per stuk is dat ruim zes uur.

Daarom: **ontleed alleen de recepten op actieve menu's** — realistisch zestig à tachtig. Dan is het twee à drie avonden en werkt het systeem voor alles wat daadwerkelijk verkocht wordt.

---

## 10. Risico's

### 10.1 Klasse-creep

Op een drukke dag een D-taak "even door het model doen omdat het sneller gaat". Het werkt de eerste tien keer; de elfde is het een incident, en geen test vangt het omdat er nooit een test voor bestond. De verleiding is structureel: een D-implementatie kost meer werk dan een prompt.

**Mitigatie als architectuurregel:** de classificatie staat vast per feature; D-berekeningen leven in `src/lib/`-modules met unit tests (`menuMargin.ts`, `btw-rules.ts`, `unitPrice.ts` zijn het precedent); model-output die een getal bevat op D-terrein wordt niet vertrouwd maar vervángen; elke agent-PR benoemt zijn klasse.

**Aanvulling op v1.0 — maak het mechanisch.** "Elke PR benoemt zijn klasse" is een afspraak, en afspraken slijten. In de stijl van `scripts/schema-audit.mjs` is een controle te schrijven die afdwingt dat een D-module de AI-koppeling niet importeert. En omdat de creep er al ín zit (2.4), hoort daar een eenmalige retro-classificatie bij van de bestaande 42 AI-routes.

### 10.2 De bibliotheek wordt een echo

Zie 5.2. Als de AI vult en er daarna uit put zonder de drie breekpunten, is de bibliotheek geen bron maar een echo — en dan is hij gevaarlijker dan geen bibliotheek, want hij oogt betrouwbaar.

### 10.3 Te snel goedkeuren

Groepsgewijs vullen is efficiënt en juist daardoor riskant. Begin met drie groepen, meet hoeveel er gecorrigeerd wordt, en bepaal dan het tempo.

### 10.4 De motor wijst alles af

Zie 6.12. Met twaalf toetsen is een portier het waarschijnlijkste faalscenario. Nooit "kan niet" zonder alternatief.

### 10.5 Discipline bij microsturing

Solo in de keuken, natte handen, lopende deadline: "even afvinken" is precies wat niet gebeurt. Test de discipline vóór de techniek — eerst een periode met alleen statusmeldingen zonder herplanning. Ontwerp het systeem zó dat het degradeert in plaats van omvalt: zonder meldingen terugvallen op de statische planning, en dat zeggen.

### 10.6 "AI trainen" is niet van toepassing

Er wordt niets getraind. **Fine-tuning** past gewichten aan met duizenden voorbeelden: duur, traag, niet inspecteerbaar, en een fout is niet terug te draaien zonder opnieuw te trainen. **RAG** haalt de juiste feiten uit de eigen database en geeft ze mee; het model redeneert erover maar bezit ze niet. Een fout in de data is één UPDATE verwijderd van gecorrigeerd.

De leercurve zit dus niet in het model maar in de bibliotheek, `production_measurements` en de bevestigde lessen — die groeien, en de antwoorden worden beter zonder dat er ooit een model wordt aangeraakt.

### 10.7 Reputatie bij recepten zonder proeftest

Bij emulsies en sauzen is de faalmodus niet subtiel: het schift, het bindt niet, het is te zout. En bij een verkeerd ingeschatte vervanging kan er een allergeen in zitten dat niet op de kaart staat — dan is het geen reputatieprobleem meer maar een veiligheidsprobleem.

**Proeftest is een verplichte stap, geen advies.** Status `voorstel → getest → vrijgegeven`; koppelen aan een menu kan alleen in de laatste. Allergenen worden altijd door code afgeleid uit de ingrediëntenkoppeling, nooit uit gegenereerde tekst.

### 10.8 Overige

| Risico | Mitigatie |
|---|---|
| **Prompt-injectie via inkomende mail** | Model levert alleen gestructureerde velden; bedragen en voorwaarden uit de eigen database; verplichte bevestiging. Nooit een tool-call laten aansturen door mailinhoud. |
| **Stille cron-failures** | Elke run schrijft een heartbeat; de dagregisseur meldt een ontbrekende run. Op Vercel Hobby moeten crons dagelijks zijn — er draaien er al acht. |
| **Modelnamen lopen uiteen** | 51 bestanden roepen de koppeling los aan, met minstens één stale pin. Centraliseren via `ai-modes.ts`. |
| **Schema-drift** | `scripts/schema-audit.mjs` in de pipeline houden; agent-queries vallen onder dezelfde audit. |
| **Overtuigende leegte** | Elke agent kent een expliciete "onvoldoende data"-uitkomst en gebruikt die. |
| **Context zwelt op** | `cache_read_input_tokens` en invoertokens per call meten; slaat de cache niet aan, dan zit er een stille verstoorder in. |

---

## 11. Succescriteria

| Golf | Criterium | Doel |
|---|---|---|
| 0 | Aandeel goedgekeurde ingrediëntprofielen zonder correctie | Stijgt na de eerste drie groepen — anders gaat het tempo omlaag |
| 0 | Gemis-rapport opgeleverd | In week één, vóór de rest van het fundament |
| 1 | **De ijkmaat-test**: pulled pork en brisket ontleed en naast de bestaande fase-schema's gelegd | Komt overeen, anders deugt de ontleder niet |
| 1 | Aandeel ontledingen dat zonder wijziging wordt goedgekeurd | Dít meet of de ontleder deugt — niet "hoeveel recepten omgezet" |
| 1 | Recepten op actieve menu's volledig als `recipe_steps` | 100% van de top-10 meest gebruikte menu's |
| 1 | Metingen worden vastgelegd | ≥ 1 per productiedag |
| 2 | Dubbel prepwerk verdwijnt | Geen enkele `prep_group` meer dan één keer op de dagplanning |
| 2 | Geen capaciteitsverrassingen op de dag zelf | Nul per kwartaal |
| 3 | Ontbrekende HACCP-registratie op de dag zelf gesignaleerd | 100% |
| 3 | Chef-coach houdt gebruik vast na week 4 | Geen nieuwigheidspiek die wegzakt |
| 4 | **De ananas-test**: dessert intypen | Uitvoerbare receptuur mét de melding dat een krokant element mist |
| 4 | **De amuse-test**: bestaande amuse laten ontleden | Ziet zelf dat de bavette de hoofdrol heeft en chili ónder de prikkeldrempel zit |
| 4 | **De brug-test**: knolselderijtartaar + procureur, vraag de saus | Komt uit op hoog zout, umami-rijk, diep, zonder eigen zuur of hitte |
| 4 | **De saus-test**: limoen-, wasabi- en misomayonaise laten voorstellen | Komt uit op de eigen ingrediënten en verhoudingen |
| 5 | Elke herkende aanvraag heeft binnen 24 uur een status | 100% |
| 5 | Geen offerte staat > 3 dagen stil zonder melding | Nul |
| 6 | Nul externe acties buiten de goedkeur-queue om | Nul |

---

## 12. Wat expliciet niet gebouwd wordt

Een keuze, geen gat. Elk onderdeel is voorwaardelijk op een tweede tenant die het product echt gebruikt.

| Niet bouwen | Waarom niet | Wanneer wél |
|---|---|---|
| **Multi-tenant agent-registry** | Twaalf agents en één tenant. Een registry lost niets op en maakt elke wijziging duurder. | Bij de tweede betalende tenant met afwijkende behoefte. |
| **Cost-cap per tier** | Eén rekening, één persoon die hem ziet. `ai_usage` volstaat. | Zodra er betaalde plannen met verschillende limieten zijn. |
| **Approval-UI voor meerdere gebruikers** | Eén goedkeurder. De datalaag heeft al `user_id` en `organization_id`. | Bij meerdere medewerkers met verschillende bevoegdheden. |
| **Generieke orchestration-laag** | Bekende agents met bekende triggers. Crons en Server Actions zijn de orchestrator. | Wanneer agents elkaar dynamisch in onvoorspelbare ketens aanroepen. |
| **Fine-tuning** | Zie 10.6. RAG plus een groeiende bibliotheek lost hetzelfde op, goedkoper en inspecteerbaar. | Praktisch: nooit voor dit probleem. |

**Ook bewust buiten scope, maar wel genoemd:** seizoensvensters per ingrediënt, bordopmaak en presentatie, wijn- en drankcombinaties. En hoeveel voorstellen er nodig zijn voordat het systeem de kok kent — dat weet niemand vooraf; reken op een seizoen en meet het aan het aandeel voorstellen dat zonder wijziging wordt goedgekeurd.

De datalaag houdt wél rekening met een SaaS-fase: `organization_id` staat overal expliciet in, RLS is per tabel geregeld, en `gn_sizes` is bewust universeel. De *architectuur* is multi-tenant; de *infrastructuur eromheen* wordt pas gebouwd wanneer er een tweede tenant is die ervoor betaalt.
