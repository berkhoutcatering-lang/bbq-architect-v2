# De winkel aan de Tramstraat in BBQ Architect: aanbod-maker en digitale winkel

## Context

De catering stopt. Op 21 november 2026 gaat de winkel aan de Tramstraat 13 open. De achtergrond staat in `docs/context/winkel-tramstraat.md` (vóór de planmodus al in de repo gezet).

Mathijs wil:
1. **Een digitale winkel.** Een plattegrond van het pand. Je klikt op een vitrine of stelling en ziet de planken van voren, met productfoto's. Producten sleep je op hun plek.
2. **Het aanbod eerst.** Eerst de productkaart en de aanbod-maker. Vóór de opening een eenvoudige winkelvloer, de getekende plattegrond pas daarna.
3. **Alles zelf kunnen aanmaken in BBQ Architect, gekoppeld aan website én kassa.** Zijn voorbeeld: "een combideal van twee biertjes, twee soorten worst en een blokje kaas, en de klant mag zelf kiezen wat het wordt".

## Wat er al staat (gecontroleerd in de code)

| Onderdeel | Stand |
|---|---|
| Producten (`winkel_producten`) | Bestaat: prijs, btw, inkoop, foto_url, ean, tht, voorraad. Het **soort-veld is een vaste lijst** (bier, wijn, worst, kaas…): smoker-vlees, sauzen, rubs, noten en slagersbasis ontbreken. |
| Aanbod (`winkel_artikelen` + vakken) | Pakketten met vakken bestaan (Sinterklaas) en zijn te bewerken in `/verkoop/webshop` → Artikelen. Er zijn **geen keuzevakken**: `rekenen.ts:468` weigert keuzes met "kiezen kan nog niet". De velden `wisselbaar`/`alternatieven` bestaan maar zijn leeg. |
| Btw per onderdeel | Werkt al (`btwVerdeling`, naar rato van de onderdelen). Bier 21% + worst 9% splitst correct. |
| Website-koppeling | `/api/public-winkel/[slug]/*` (offerte, order, momenten, kerst…). De website stuurt nog géén keuzes. Het contract weigert een `keuzes`-veld als verdediging. De vorm (`keuzes: [{ slot, producten }]`, op id) leggen wij vast, en de website neemt die over via een overdrachtsdocument. |
| Catalogus (productkaart, foto's, allergenen, productpagina) | Gebouwd op tak `feat/catalogus`. **Staat alleen op deze laptop, nooit gepusht**, loopt 48 commits achter op main. De migratie is volgens de commit live gezet, en 58 producten + 348 foto's zijn geïmporteerd. Groot risico als de laptop iets overkomt. |
| Kassa aan de toonbank | **Niet in main, wel grotendeels gebouwd.** Main heeft alleen een koppeling die voorraad afboekt (`/api/kassa/[slug]/verkoop`). De kassa-koppeling, het kassajournaal, de bonnen en de dagafsluiting staan op de tak `feat/ecosysteem-m2` (stil sinds 8 oktober). De kassa-app zelf staat in de aparte repo `hopbites-toonbank`. Dat werk was gepland voor een opening op 1 maart 2027. Er komt een eigen kassaplan (`docs/context/kassa-plan.md`). |
| Locaties | `opslag_locaties` bestaat (plekken in een apparaat), maar zonder scherm en zonder koppeling aan producten. `voorraad_plekken` kent alleen "makerij" en "winkel". |
| Plattegrond tekenen | Een Konva-editor bestaat voor events (`src/app/keuken/board/_components/floor-plan/`), maar zit vast aan een event. Het vorm-patroon (x/y/breedte/hoogte in %) is herbruikbaar. |
| Onderdelen verbergen | `settings.verborgen_onderdelen` bestaat al, dus catering kan uit de navigatie zonder te slopen. |
| Btw-tarieven | Staan in `src/lib/btw-rules.ts` plus een controle op 0/9/21 in de tabellen. Er is geen tarieventabel, en het document vraagt daar wel om (§7.1). Dat komt bij de kassa aan bod, niet in dit plan. |

## Herziening 26 oktober, na een tweede controle over álle takken

De eerste versie keek alleen naar main. Er staan drie niet-samengevoegde takken die dit plan raken. Geen van hun migraties staat live, dus er is geen conflict in de database, wel in het plan.

| Tak | Wat erop staat | Gevolg voor dit plan |
|---|---|---|
| `feat/ecosysteem-m2` (41 commits, 8 okt) | De kassa-kant: Toonbank-API, apparaten en sessies, journaal, bonnen, dagstaten, afhalen. Bevat de hele catalogus al (samengevoegd op 4 okt). Voegt toe: `winkel_artikelen.kanalen` (`webshop`/`toonbank`/`event`), `toonbank_groep`, `toonbank_volgorde`, `toonbank_favoriet`, `winkel_producten.statiegeld_cents`, `winkel_catalogus_versie`. | **Kanalen worden niet opnieuw bedacht**: fase 1 neemt het m2-ontwerp over. De kassaknoppen-groep (`toonbank_groep`) bestaat al. Fase 1 voegt alleen toe wat ontbreekt: `geldig_van`/`geldig_tot`, en een productgroep voor rapportage en marge als `toonbank_groep` daar niet volstaat (eerst met Mathijs afstemmen). |
| `claude/focused-wright-xpvnrj` (24–26 okt) | Prijskaartjes voor de schaphouders (85 × 55 mm), kleur per lijn, statiegeld, acties. Nieuwe tabel `winkel_prijskaartjes` met een eigen `statiegeld_cents`. | Statiegeld staat dan op twee plekken (product én prijskaartje). Dat botst met "één bron per gegeven" en moet vóór het samenvoegen recht. "Kleur per lijn" overlapt met productgroepen. |
| `claude/kerst-balie-betalen-18plus` (13 okt) | Kerst-balie: betalen en 18+ afdwingen vóór meegeven. | Valt buiten dit plan, maar is nodig vóór 23 december. |

**Gevolgen:**
- **Fase 0:** PR #249 is veilig, maar m2 heeft dezelfde catalogus als eigen kopie. Bij het samenvoegen van m2 later geven de catalogusbestanden die m2 daarna nog aanpaste een conflict. Daar wint de m2-versie.
- **Volgorde:** eerst de kassa (m2 + `hopbites-toonbank`, zie het kassaplan), dan de keuzevakken, dan de winkelvloer. Het rekenwerk van de keuzevakken (`rekenen.ts`, `types.ts`) raakt m2 niet en kan al beginnen.
- **26 dagen** is te kort voor kassa, keuzevakken én een volledige winkelvloer. De winkelvloer vóór de opening wordt de kleinste versie (plekken + planken + tellen), of schuift naar na de opening.

## Het idee in één zin

**Eén product → één aanbod → één plek.** Het product (de kaart met foto, prijs, allergenen) bestaat één keer. Het aanbod bepaalt hoe je het verkoopt: los, als pakket, of als combideal met keuzevakken, per kanaal en eventueel tijdelijk. De winkelvloer laat zien waar het ligt. Website, kassa, etiket en voorraad lezen alle drie uit dezelfde rijen.

## Fase 0: de catalogus veiligstellen (dag 1–2)

1. Tak `feat/catalogus` pushen naar GitHub (alleen veiligstellen, nog niet samenvoegen).
2. Controleren of de live database klopt met `20261003120000_winkel_catalogus.sql`:
   - kolommen op `winkel_producten`;
   - slug-index;
   - trigger `trg_winkel_catalogus_poort`;
   - bucket `winkel-fotos` met de policies;
   - de 58 rijen.

   Wijkt iets af, dan komt er een kleine vervolgmigratie. Nooit het al-gedraaide bestand aanpassen.
3. Rebasen op main. Conflicten verwacht in `ProductenPaneel.tsx`, `actions.ts`, `vakjes.ts` en `kassa.ts`. Daarna tests, tsc en build, en een PR.
4. De verwijzing uit §0 van het contextdocument in `CLAUDE.md` zetten.

## Fase 1: productgroepen, kanalen, tijdelijke acties (week 1)

**Productgroepen.** Nieuwe tabel `winkel_productgroepen`: naam, volgorde, bewaren (diepvries/koel/droog/wijnkast), standaard-btw, `op_kassa`, actief.
- Gevuld met de 14 groepen uit §4.1, plus "Verpakking" (niet op de kassa).
- `winkel_producten.groep_id` wordt gevuld vanuit het oude soort-veld. Sinterklaas blijft ongemoeid.
- Het soort-veld blijft technisch en krijgt er `vlees`, `saus`, `rub` en `zoet` bij, ook op `winkel_artikel_slots.slot_type`.

**Kanalen.** Overnemen uit `feat/ecosysteem-m2` (`20261006120000_toonbank_catalogus.sql`), niet opnieuw bouwen: `winkel_artikelen.kanalen` met `webshop`, `toonbank` en `event`, plus `toonbank_groep`/`toonbank_volgorde`/`toonbank_favoriet`.
- "Alleen op bestelling" = een afhaalmoment nodig, niet direct aan te slaan.
- `berekenOfferte` eist dat `webshop` in de lijst staat (controleren of m2 dat al doet).

**Tijdelijke acties.** `geldig_van`/`geldig_tot` op `winkel_artikelen`, gecontroleerd naast `actief` (bijvoorbeeld vaderdag of de woensdagmarkt). De bestelsluiting blijft op `winkel_momenten.sluit_op` (Kerst: 10 december).

**Eigen tekst en foto per aanbod.** `omschrijving` en `foto` (zelfde vorm en bucket als de catalogus), zodat een combideal er op de website meteen goed uitziet.

## Fase 2: keuzevakken, de kern (week 1–2)

Een vak wordt **vast** (zoals nu) of **klant kiest**.

**Model.**
- `winkel_artikel_slots` krijgt `keuze` (`vast` | `kies`) en `keuzes` (hoeveel de klant kiest). De hoeveelheid blijft per keuze.
- Nieuwe tabel `winkel_slot_opties`: vak, product, `meerprijs_cents` (standaard 0), volgorde.
- `wisselbaar`/`alternatieven` worden niet gebruikt: een lijst id's zonder koppeling breekt als je een product weggooit, en een meerprijs past er niet in.

**Zijn voorbeeld** wordt drie vakken: Bier (kies 2), Worst (kies 2), Kaas (kies 1), elk met een lijst opties. In de editor komt een knop **"hele groep toevoegen"**: alle bieren in één tik als opties, daarna weghalen wat je niet wilt.

**Rekenwerk in `src/lib/winkel/rekenen.ts`** (code, geen AI):

| Functie | Wat er verandert |
|---|---|
| `verkoopbaar` | Een kies-vak heeft minstens één actieve optie nodig. |
| `valideerKeuzes` (nieuw) | Precies het juiste aantal keuzes, alleen uit de opties. Zo niet, dan een duidelijke melding ("Kies je 2 bieren"). |
| `componentenVan` | De gekozen producten worden de onderdelen. |
| Prijs | Pakketprijs + som van de meerprijzen. |
| `btwVerdeling` | Splitst op de écht gekozen producten. Een meerprijs krijgt het tarief van zijn eigen product. Een vaste btw-overschrijving wordt geweigerd als de opties in een vak verschillende tarieven hebben. |
| 18+ | Volgt de keuzes vanzelf. |

**Vastleggen bij bestellen.**
- `winkel_order_regel_componenten` krijgt `slot_id` en `gekozen`.
- `winkel_plaats_order` (laatste versie in `20261003150000`) wordt vervangen met een `CREATE OR REPLACE`.
- De inpaklijst en de doos-scan tonen "klant koos: …".

**Beschikbaarheid.** `winkel_vrij_artikelen` (`20261005130000_winkel_vrij.sql`) ziet een kies-vak zonder standaardproduct nu als "leeg", dus als uitverkocht. Dat wordt herschreven. Een kies-vak is beschikbaar zolang de opties samen genoeg voorraad hebben. Een optie zonder bijgehouden voorraad betekent onbeperkt.

**Website.**
- Nieuwe route `GET /api/public-winkel/[slug]/aanbod`: actieve webshop-artikelen met foto, prijs, geldigheid, vakken en opties (slug, naam, foto, meerprijs, beschikbaar).
- `MandRegel.keuzes` wordt geaccepteerd.
- Een overdrachtsdocument `docs/OPDRACHT-BBQ-ARCHITECT-AANBOD.md` voor de website-repo.

**Beheerscherm.** In `ArtikelenPaneel.tsx` krijgt elk vak een schakelaar "Klant kiest", een aantal-veld en een optielijst met foto's. De marge-hint toont de spreiding: goedkoopste en duurste keuze.

**Kassa.** De kassa wordt een apart traject (zie hieronder), maar gebruikt straks dezelfde `valideerKeuzes` en `componentenVan`. Tik op de deal en per vak opent een rij foto-tegels. Een gescande barcode vult de eerstvolgende keuze. Daarom wordt dit nu zo neergezet dat de kassa het alleen hoeft aan te roepen.

## Fase 3: winkelvloer, eerste versie vóór de opening (week 3)

**Plekken.** `opslag_locaties` wordt uitgebreid (`materieel_id` is al optioneel):
- `parent_id`, zodat je ruimte → meubel → plank krijgt;
- de soorten `ruimte`, `vitrine`, `stelling`, `kast` en `vrieskist`;
- `bewaren`, `foto_url`;
- een lege `plan`-kolom voor de latere tekening.

Gevuld met de Tramstraat-ruimtes uit §2: winkel, doorloopkoelcel, koelcel, vriescel, opslag 1 en 2, wijnkast, Foster-vriezer en twee vrieskisten. De vitrines en planken vult Mathijs zelf in.

**Plaatsing.** Nieuwe tabel `winkel_plaatsingen`: product, plek, rol (`verkoop` | `showmodel` | `reserve`), volgorde, facings.
- Dit is presentatie, geen voorraad. De voorraad blijft één getal via `winkel_muteer_voorraad`, en de bestaande beveiliging blijft heel.

**Scherm `/winkel/vloer`.**
- Kaarten per ruimte, dan per meubel, dan planken als rijen foto-tegels (hergebruik van de tegels uit `WinkelVoorraadClient.tsx`).
- Slepen met dnd-kit (al geïnstalleerd), op een plank en tussen planken.
- Een productkiezer op naam of groep.
- Een signaal "staat nergens" voor actieve producten zonder plek.

**Erbij.**
- Tellen per plank in `/voorraad/winkel/tellen`, in looproute-volgorde.
- Derving-reden "showmodel" (§7.3).

**Navigatie.** Een werkruimte **Winkel** in `src/lib/navigation.tsx` met Vloer, Aanbod (`/verkoop/webshop`), Voorraad winkel en Bestellingen. Let op `navigation.test.ts:26`.

## Na de opening

- Een getekende plattegrond per ruimte (Konva, het vorm-patroon uit `CanvasShapes.tsx`), opgeslagen in `opslag_locaties.plan`.
- Een vooraanzicht van een vitrine, en klikken van plattegrond naar vitrine.
- Voorraad per plek: `locatie_id` op `winkel_voorraad_mutaties` plus een overzicht.
- Een aanvullijst ("vitrine 2: pulled pork 2 van 6, haal 4 uit de doorloopkoelcel").
- "Kies uit de hele groep" als levende koppeling, zodat een nieuw bier vanzelf in de deal komt.

## Buiten dit plan, maar het grootste risico voor 21 november

**De kassa aan de toonbank.** Het werk bestaat al grotendeels (tak `feat/ecosysteem-m2` en repo `hopbites-toonbank`), maar was gepland voor 1 maart 2027 in plaats van 21 november. Het kassaplan zoekt uit wat er nog moet gebeuren om het samen te voegen en naar voren te halen. De kassa moet straks dezelfde `valideerKeuzes` en `componentenVan` gebruiken als de website. Open punten: welke myPOS-terminal, Epson-printen vanuit de browser en een btw-tarieventabel.

## Bestanden die het meest geraakt worden

- `src/lib/winkel/rekenen.ts`, `types.ts`, `kassa.ts`, `supabaseStore.ts`, `geheugenStore.ts`
- `supabase/migrations/`: nieuwe bestanden, één per onderwerp, met de hand en één voor één toegepast (nooit `db push`), defensieve controles vooraf
- `supabase/migrations/20261005130000_winkel_vrij.sql` en `20261003150000_winkel_functies_niet_voor_anon.sql`: vervangen via `CREATE OR REPLACE` in een nieuw bestand
- `src/app/verkoop/webshop/_components/ArtikelenPaneel.tsx`, `ProductenPaneel.tsx`
- `src/app/api/public-winkel/[slug]/aanbod/route.ts` (nieuw)
- `src/app/winkel/vloer/` (nieuw), `src/lib/navigation.tsx`

## Hoe we controleren dat het werkt

- **Tests** (`npm test`):
  - `rekenen.test.ts`: kies-vakken, keuzes valideren, btw met gemengde tarieven en meerprijs.
  - `kassa.test.ts`: offerte en order met keuzes.
  - `vrij.test.ts` en `beschikbaarheid.test.ts`: kies-vak-limiet.
  - `inpakken.test.ts`: gekozen producten op de inpaklijst.
  - `kassaVerkoop.test.ts`: een combideal boekt zijn onderdelen af.
  - `geschenkpakketten.test.ts` en `kerst.test.ts`: na **elke** fase ongewijzigd groen. De Kerst-Box sluit op 10 december en mag niet breken.
- **Database:** na elke migratie de kolommen en functies opvragen (live is de waarheid, niet het bestand).
- **In de browser:**
  1. de combideal "2 bier + 2 worst + 1 kaas" aanmaken in `/verkoop/webshop`;
  2. `/api/public-winkel/<slug>/aanbod` controleren;
  3. een offerte met keuzes doen op de preview;
  4. een testbetaling met de myPOS-testkaart;
  5. de inpaklijst toont de keuzes.
- **Winkelvloer:** de ruimtes aanmaken, drie producten op een plank slepen, herladen en zien dat de volgorde blijft. Daarna tellen per plank op telefoonbreedte.
- Elke fase is een eigen PR, en wordt pas samengevoegd na groene CI en een groene Vercel-preview.

## Nog te beslissen door Mathijs (niet invullen)

- Welke vakken van de BBQ-pakketten "klant kiest" worden, en welke meerprijzen.
- Of een combideal ook aan de toonbank samengesteld wordt (§4.2 bierpakketten): technisch kan het met hetzelfde model.
- De open punten uit §11 van het contextdocument: kaas, sauzen/NVWA, sterke drank, statiegeld, labelformaat.
