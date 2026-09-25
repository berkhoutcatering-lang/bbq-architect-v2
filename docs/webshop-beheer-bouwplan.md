# Bouwplan — webshop-vakjes: elk bonnetje op de dag dat het klaar moet zijn

**Repo:** BBQ Architect. **Datum:** 25 september 2026 (versie 2 — na het gesprek over vakjes).
**Hoort bij:** `docs/winkel-kassa.md` (de kassa, 13 sep), `OVERDRACHT-BBQ-ARCHITECT-WEBSHOP.md`
(website-repo) en `docs/webshop-vakjes-designprompt.md` (de brief voor Claude Design).
De website wordt in een andere sessie gebouwd; **het contract met de site verandert hier niet.**

**Wat er in versie 2 is veranderd:** het scherm draait niet om artikelen maar om **vakjes** —
één per dag waarop iets klaar moet zijn. Vanuit een vakje open je het kookbord en de inkoop
van dat vakje. De inkoop kent twee knoppen: *mee met de volgende bestelling* of *bestel alleen
dit*. Losse producten krijgen een eigen inkoopketen (artikel → voorraad-item), want die lopen
niet via een gerecht. De AI kiest koppelingen en leest opmerkingen; **de getallen komen uit de
regels**, zoals overal in de app.

---

## 0 · Het idee in vier zinnen

1. Een betaald bonnetje krijgt een **klaar-op-datum**: het afhaalmoment (plank), de afhaaldag
   (Kerst-Box) of — zonder moment — vandaag. Een plank die vandaag besteld wordt voor over drie
   weken hoort bij die dag, niet bij vandaag; de datum staat erbij, in het scherm én in de data.
2. Elke klaar-op-datum is een **vakje**. Een vakje met een afhaalmoment is een **event** (dan
   ziet de keuken het op het kookbord en telt de inkoop het mee). Het vakje *Vandaag* voor losse
   producten en verzendorders is een vaste bak, geen event.
3. Per webshop-artikel staat één keer vast **wat de keuken ervoor maakt** (een gerecht) of **wat
   je ervoor inkoopt** (een voorraad-item). De AI stelt die koppeling voor, jij keurt goed. Daarna
   rekent de bestaande keten: 4 boxen → recept × 4 → tekort → bestelvoorstel bij de leverancier.
4. Uit een vakje bestel je op twee manieren: **mee met de volgende bestelling** (in het lopende
   concept bij die leverancier) of **bestel alleen dit** (een aparte bestelling voor dit vakje).

---

## 1 · Wat er al ligt

| Wat | Waar | Gevolg |
| --- | --- | --- |
| Winkel-tabellen | `winkel_instellingen`, `winkel_artikelen`, `winkel_momenten`, `winkel_orders`, `winkel_order_regels`, `winkel_betaalberichten` (migratie 20260913) | Live. 12 artikelen, 2 Kerst-Box-dagen (23/24 dec, 25 dozen), 0 orders. RLS via `private.user_org_ids()`. |
| Kassa | `src/lib/winkel/kassa.ts` → `verwerkBetaling()`; `store.ts` + `supabaseStore.ts` + `geheugenStore.ts`; 65 tests | Het punt waar een order `betaald` wordt. De `KassaContext` heeft een `mail`-haak; de plaatsing wordt een tweede haak, zodat de tests met de geheugen-opslag blijven draaien. |
| Orderscherm | `/verkoop/winkelorders` (290 r.) | Wordt het Orders-paneel in het nieuwe scherm; het pad blijft als redirect. |
| Momenten-beheer, ander product | `verkoop/bestellingen/_components/Afhaalmomenten.tsx` + `actions.ts` | Zelfde patroon (vak toevoegen, capaciteit verhogen, bezetting geteld). Kopiëren voor `winkel_momenten`. |
| Server-action-patroon | `verkoop/website/actions.ts` | Zod, re-auth ín de action, organisatie uit `organization_members`. |
| Keuken leest events | `/api/mep/[eventId]`, `KookbordClient`, `bulkSchedule.ts`: `gerecht_components.quantity_used × events.guests`; kookbord toont `confirmed`/`optie` binnen 14 dagen | Een event met `menu = [gerecht-uuid]` en `guests` is de plek waar de keuken kijkt. `extractDishNames` in `inventoryDemand.ts` leest uuid-strings al. |
| Inkoop | `/inkoop` = `buildBestelvoorstel` (deterministisch, per leverancier, 14 dagen, `DEMAND_STATUSES` bevat `confirmed`); `concept_inkoop_orders` = één concept per (org, leverancier, venster); elke regel weet bij welke events hij hoort (`events[]`) | **Twee gaten:** geen filter op één event/vakje, en Kerst (23 dec) valt pas op 9 december in het venster. De event-hub heeft daarnaast een los AI-tekstkaartje `inkooplijsten` — laten we met rust; het vakje wijst naar het bestelvoorstel. |
| Vraag zonder gerecht | `inventoryDemand.ts` rekent alleen events × gerechten | Losse producten (5 bier) hebben geen gerecht. Er komt een tweede vraagbron bij (§4.4). |
| Voorraad-items | `inventory`: **geen** bier, saus, amandelen, Alabama | De keten voor losse producten begint bij een leeg voorraad-item. Dat is de eerste koppelronde (§5). |
| Gerechten | 28; **geen** Kerst-Box, Borrel Journey of plank | Zonder gerecht ziet de keuken alleen aantallen. Het scherm zegt dat eerlijk. |
| AI-helper-patroon | `src/lib/ai/aliasSuggester.ts` (Haiku 4.5, Zod, kosten geteld, faalt stil) + `logAiUsageServer` + `checkAiCostCapServer` | Kopiëren voor de koppel-voorsteller en de opmerking-lezer. |
| Event-velden | `events.veg_guests`, `vegan_guests`, `gluten_free_guests`, `notitie`, `type`, `start_time`/`end_time`; `event_allergies` (normal/high/critical) | Gelezen wensen hebben al een plek. |
| Design-brief-patroon | `docs/keukenscherm-designprompt.md`, `docs/design-brief-chassis-2026-09-03.md` | Huisformat: situatie → harde eisen → artboards → echte inhoud → niet ontwerpen → wat ik terug wil. Zip komt in `.design-import/` (gitignored). |

---

## 2 · Het datamodel — één migratie, alles additief

`supabase/migrations/20260925120000_winkel_vakjes.sql`. Pre-flight controleert de winkel-tabellen,
`events`, `inventory`, `gerechten`, `concept_inkoop_orders`.

### 2.1 `winkel_artikelen` — wat de keuken maakt of wat je inkoopt

| Kolom | Type | Betekenis |
| --- | --- | --- |
| `gerecht_id` | `uuid null → gerechten(id) on delete set null` | "De keuken maakt dit." Kerst-Box, plank, Borrel Journey. |
| `inventory_id` | `integer null → inventory(id) on delete set null` | "Dit koop je in." Bier, saus, amandelen. |
| `inkoop_per_stuk` | `numeric null` | Hoeveel van het voorraad-item één besteld stuk kost, in de eenheid van dat item (1 fles = 1; een borrelbox met 3 bieren = 3 op het bier-item). Leeg = 1. |
| `dieet` | `text null check in ('vegetarisch','veganistisch')` | Vast kenmerk. `kerst-box-vegetarisch` krijgt `vegetarisch` in de migratie (feit, geen gok). |
| `koppel_voorstel` | `jsonb null` | Wat de AI voorstelde: `{ soort: 'gerecht'|'voorraad', id, naam, zekerheid, reden }`. Blijft staan tot Mathijs kiest. |

Constraint: hooguit één van `gerecht_id` / `inventory_id` gevuld. Geen van beide = "nog niet
gekoppeld" — het scherm laat dat zien, de plaatsing gaat gewoon door met aantallen.

### 2.2 `winkel_order_regels` — waar deze regel ligt

| Kolom | Type | Betekenis |
| --- | --- | --- |
| `klaar_op` | `date not null` (backfill: momentdatum, anders `created_at::date`) | De dag van het vakje. Altijd gevuld — ook voor losse producten. |
| `event_id` | `integer null → events(id) on delete set null` | Het event waarin deze regel is geplaatst. Leeg = vaste bak *Vandaag* of nog niet geplaatst. |
| `klaargezet_at` | `timestamptz null` | Voor de vaste bak: afgevinkt. |

### 2.3 `winkel_orders` — wat er gelezen is en hoe het ging

| Kolom | Type | Betekenis |
| --- | --- | --- |
| `wensen` | `jsonb null` | `{ vegetarisch, veganistisch, glutenvrij, allergenen[], overig[] }`. `null` = niets gelezen. |
| `wensen_bron` | `text null check in ('geen','ai','handmatig','mislukt')` | |
| `plaatsing_status` | `text null check in ('geplaatst','vaste_bak','mislukt')` | |
| `plaatsing_fout` | `text null` | In woorden. |
| `plaatsing_at` | `timestamptz null` | |

### 2.4 `events` — het event kent zijn moment

| Kolom | Type | Betekenis |
| --- | --- | --- |
| `winkel_moment_id` | `uuid null → winkel_momenten(id) on delete set null`, **unieke index** waar niet null | Dit event *is* het vakje voor dat moment. Twee betalingen tegelijk kunnen nooit twee events maken. |
| `menu_gasten` | `jsonb null` | Per gerecht het aantal: `{ "<kerst-uuid>": 17, "<vega-uuid>": 3 }`. Zie §4.3. |

### 2.5 `concept_inkoop_orders` — een bestelling voor alleen dit vakje

| Kolom | Type | Betekenis |
| --- | --- | --- |
| `vakje_datum` | `date null` | Gevuld = "bestel alleen dit": het concept telt alleen de vraag van dat vakje. Leeg = de gewone lopende bestelling. |
| `vakje_event_id` | `integer null → events(id)` | Idem, voor een event-vakje. |

De unieke sleutel (org, leverancier, venster) krijgt `vakje_datum` erbij, zodat de gewone
bestelling en een vakje-bestelling naast elkaar kunnen bestaan.

---

## 3 · Het scherm — `/verkoop/webshop`

Eén pagina in de Verkoop-hub (tab "Webshop"), vier panelen via een segment-knop: **Vakjes ·
Artikelen · Momenten · Instellingen**. Bewerken in een rechter-drawer. Stijl: de `bst-*`-klassen
van bestellingen. Het ontwerp komt uit Claude Design (brief: `docs/webshop-vakjes-designprompt.md`);
wat hieronder staat is wat het scherm *moet kunnen*, niet hoe het eruitziet.

### 3.1 Vakjes (het hoofdscherm)

Een lijst van vakjes op klaar-op-datum, vandaag bovenaan, daarna oplopend. Per vakje:

- **Kop:** datum in woorden + wat het is (*Vandaag · klaarzetten & verzenden*, *do 16 okt
  12:00–13:00 · planken*, *wo 23 dec · Kerst-Box*). Tellers: orders, personen/stuks, en per
  gekoppeld gerecht het aantal (17 Kerst-Box · 3 vegetarisch).
- **Merktekens** (alleen zichtbaar als ze gelden): *niet geplaatst* (vuur), *opmerking niet
  gelezen*, *allergie*, *nog geen gerecht/product gekoppeld*, *capaciteit vol*.
- **Knoppen:** **Kookbord** (naar `/keuken/kookbord?event=<id>` — het kookbord krijgt die
  parameter), **Inkoop** (naar `/inkoop?vakje=<datum|event>` — zie §4.5), en een **Bestel**-menu
  met *Mee met de volgende bestelling* en *Bestel alleen dit*. De vaste bak *Vandaag* heeft geen
  kookbord-knop; wel *Klaargezet*-vinkjes per regel.
- **Open:** de orders in dat vakje. Per order: naam, ordernummer, wat, gelezen wensen met bron,
  de originele opmerking, en de knop **Klopt niet** (wensen zelf zetten → opnieuw plaatsen).
  Bij `mislukt`: de fout in woorden + **Plaats opnieuw**.

Bovenaan één teller in vuur, alleen boven nul: *n orders niet geplaatst*.

### 3.2 Artikelen

Lijst: naam, prijs (of "prijs volgt"), btw, actief, publiek, voorraad, afhalen (geen/moment/dag +
groep), verzendbaar, gekoeld, **koppeling** (gerecht *Kerst-Box* / voorraad-item *bier Drenthe* /
"nog niet gekoppeld — voorstel: …" / "nog niet gekoppeld").

Drawer: alle velden van de tabel in de taal van de kassa (naam, slug alleen bij nieuw, eenheid,
telt, prijs incl. btw, btw, minimum/maximum, verzendbaar, gekoeld, afhalen + groep + tekst,
capaciteit + doosmaten, voorraad, actief, publiek, dieet) en het blok **Wat maakt of koopt je
hiervoor?** met zoeken in gerechten óf voorraad-items, de AI-suggestie als eerste keuze, en
`inkoop_per_stuk` bij een voorraad-item. Knop **Nieuw voorraad-item** als het er nog niet is
(naam + eenheid, meer niet — de rest vult je in /voorraad).

Server actions: `maakArtikel`, `werkArtikelBij`, `zetArtikelActief`, `koppelArtikel`,
`vraagKoppelVoorstel`. Nooit een prijs verzinnen: leeg blijft `null`.

### 3.3 Momenten

Per groep een blok (agenda = planken met tijdvak; kerst-box = dagen). Per moment: datum, tijdvak,
**bezetting / capaciteit** (via `winkel_bezetting_moment`, dezelfde telling als de kassa),
bestellen-tot, actief. Acties: `voegMomentToe`, `zetMomentCapaciteit`, `zetMomentActief`,
`zetMomentBestellenTot`. Verwijderen kan niet met regels erop (FK); de knop zegt dat.

### 3.4 Instellingen

**Kassa open / dicht** als grote schakelaar, verzendkosten (leeg = uit), gratis vanaf, btw op
verzendkosten, reserveringsduur, offerte geldig, nummer-voorvoegsel, site-URL. Eén action
`werkInstellingenBij`.

### 3.5 Routes

`/verkoop/webshop` (page + `actions.ts` + `_components/`), `/verkoop/winkelorders` → redirect,
`VerkoopTabs` → `/verkoop/webshop`. `/keuken/kookbord` leert `?event=`; `/inkoop` leert `?vakje=`.

---

## 4 · Plaatsing en inkoop — de regels

Module `src/lib/winkel/plaatsing.ts` (puur waar het kan) + store-methoden (Supabase én
geheugen). **Idempotent:** een regel met `event_id` wordt niet verplaatst; totalen worden elke
keer opnieuw geteld uit alle betaalde regels. Twee keer draaien = één keer draaien.

### 4.1 Wanneer

In `verwerkBetaling()` zodra `betaald` — ná de mail, in een eigen try/catch; uitkomst in
`plaatsing_status`/`plaatsing_fout`. Verder op **Plaats opnieuw**, op **Klopt niet**, en na
**koppelArtikel** (de artikelen die net een gerecht kregen worden in hun events bijgeteld).

### 4.2 Klaar-op en het vakje

Per regel: `klaar_op` = datum van het moment op de regel, anders van de order, anders vandaag
(Europe/Amsterdam). Regels mét moment: zoek het event met `winkel_moment_id`; bestaat het niet,
maak het: `name` = artikelnamen op dat moment (max 2, anders de groep) + " · afhalen", `date` =
momentdatum, `start_time`/`end_time` = tijdvak, `status = 'confirmed'`, `type = 'Webshop'`,
`organization_id` expliciet. Botsende webhooks vangt de unieke index; de tweede leest het
bestaande event. Regels zónder moment: `plaatsing_status = 'vaste_bak'`, geen event.

### 4.3 Wat de keuken ziet — tellen per gerecht

Na het plaatsen, uit alle betaalde regels op het event: `guests` = Σ aantal; `veg_guests` =
Σ aantal met `dieet = 'vegetarisch'` + Σ `wensen.vegetarisch` van orders zonder vega-artikel
(anders dubbel); `vegan_guests`, `gluten_free_guests` idem; `menu` = de gekoppelde
`gerecht_id`'s; `menu_gasten` = per gerecht de som; `notitie` = één regel per order, elke keer
herschreven (`HB-2026-0042 · Jan Jansen · 4× Kerst-Box · uit opmerking: 1 vegetarisch`);
`event_allergies` = één rij per order met allergenen (`severity = 'high'`), bestaande rij van
die order vervangen.

**Per gerecht rekenen.** MEP, kookbord en `bulkSchedule` vermenigvuldigen nu alles met
`events.guests`; bij 17 Kerst-Box + 3 vega zou de vega-variant ook ×20 gaan. Waar `menu_gasten`
een getal voor het gerecht heeft, gebruikt de keuken dát; anders `guests` zoals nu. Drie plekken,
elk een paar regels. `inventoryDemand.ts` idem (regel 351–399: `guests` per gerecht).

### 4.4 Losse producten — de tweede vraagbron

`inventoryDemand.ts` krijgt naast events × gerechten een tweede bron: betaalde
`winkel_order_regels` met `klaar_op` in het venster, `klaargezet_at` leeg, en een artikel met
`inventory_id`: vraag = `aantal × inkoop_per_stuk` op dat voorraad-item, toegeschreven aan
"Webshop · <klaar_op>" in de `events[]`-lijst van de regel (zonder event-id). Zo staan 5 bier op
het bestelvoorstel van vandaag, bij de leverancier van dat bier, met pakmaat en prijs — en ze
verdwijnen zodra ze klaargezet zijn. Geen AI, geen gok.

### 4.5 Inkoop voor dit vakje — de twee knoppen

`buildBestelvoorstel` krijgt een optie `vakje: { datum } | { eventId }`. Met die optie telt
alleen de vraag van dat vakje mee (één event, of de losse regels van die dag), **ongeacht het
14-dagen-venster** — Kerst is in september al te bekijken. `/inkoop?vakje=…` toont dan het
bestelvoorstel voor alleen dit vakje, met bovenaan: *Inkoop voor wo 23 dec · Kerst-Box · 17 + 3*.

- **Mee met de volgende bestelling:** niets bijzonders — het vakje telt al mee in het gewone
  bestelvoorstel zodra het in het venster valt. De knop opent `/inkoop` met het vakje uitgelicht
  en de regels ervan gemarkeerd. Buiten het venster: "komt vanaf 9 december vanzelf op de lijst"
  + de knop *Toch nu bestellen* → de andere weg.
- **Bestel alleen dit:** maakt per leverancier een concept met `vakje_datum`/`vakje_event_id`,
  gevuld uit het vakje-bestelvoorstel, en gaat verder zoals nu (`sendOrderToSupplierAction`
  krijgt het vakje-filter mee bij het herrekenen). Wat via zo'n vakje-concept verzonden is telt
  als `in_flight` en wordt dus niet nog eens in de gewone bestelling gevraagd — dat doet de
  bestaande in-flight-logica al op `inventory_id`.

### 4.6 Wat er níet gebeurt

Geen offerte, factuur of klant-record (het bonnetje ís de betaling). Geen event bij `wacht`,
`mislukt`, `verlopen`. Geen gerecht of voorraad-item verzinnen: ongekoppeld = aantallen + notitie,
en het scherm zegt het. Het AI-tekstkaartje `inkooplijsten` op de event-hub blijft ongemoeid.

---

## 5 · De twee AI-helpers

Beide naar het patroon van `aliasSuggester.ts`: Haiku 4.5, Zod op de uitvoer, kosten in
`ai_usage` (`metadata.feature`), kostenplafond via `checkAiCostCapServer`, falen stil met een
leesbare reden. **De AI kiest en leest; de regels rekenen.**

### 5.1 Koppel-voorsteller — `src/lib/ai/winkelKoppelVoorsteller.ts`

Invoer: het artikel (naam, eenheid, telt, moment-soort) + de lijst gerechten (id, naam) + de lijst
voorraad-items (id, naam, eenheid). Uitvoer: `{ soort: 'gerecht'|'voorraad'|'geen', id|null,
zekerheid: 'hoog'|'laag', reden }`. Regels: alleen kiezen uit de lijsten; een artikel dat de
keuken maakt (afhalen op een moment, telt in personen) → gerecht; een artikel dat je inkoopt
(stuks, verzendbaar) → voorraad; niets passends → `geen` met wat er dan aangemaakt moet worden
("een voorraad-item *bier Drenthe* bestaat nog niet"). Draait bij het openen van de artikel-drawer
zolang er geen koppeling is, en één keer als **koppelronde** over alle ongekoppelde artikelen
(knop bovenaan Artikelen). Het voorstel komt in `koppel_voorstel`; Mathijs klikt *Zo doen* of
kiest zelf.

### 5.2 Opmerking-lezer — `src/lib/ai/winkelWensenLezer.ts`

Alleen als `opmerking` niet leeg is. Invoer: opmerking + regels (naam, aantal, eenheid, dieet).
Uitvoer: `{ vegetarisch, veganistisch, glutenvrij, allergenen[], overig[] }`. Alleen wat er
letterlijk staat; getallen alleen als de klant ze noemt ("4 personen waarvan 1 vega" → 1);
allergenen in het Nederlands, kleine letters, gangbare namen; al het andere → `overig` als korte
zin; twijfel → `overig`. Faalt → `wensen_bron = 'mislukt'`, scherm zegt "lees zelf" met de
opmerking ernaast. Tests met een nep-client: "waarvan 1 vega" → 1; "geen noten aub" →
["noten"]; "bedankt!" → leeg; kapotte JSON → mislukt.

---

## 6 · Volgorde — vier golven, elk apart te mergen

**Stand 25 september 2026:** golf 1 en 2 gebouwd op branch `feat/webshop-vakjes` (migraties
`winkel_vakjes` + `winkel_regels_klaar_op_trigger` live; scherm naar het Claude Design-ontwerp
in `.design-import/webshop`; koppelronde live getest: 2 voorstellen, 10× eerlijk "geen").
Golf 3 (inkoop per vakje, de twee bestelknoppen) en golf 4 (opmerking-lezer) staan open —
*Bestel alleen dit* staat al in het menu maar is tot golf 3 uitgeschakeld met uitleg.

**Golf 1 — scherm en koppelingen.** Migratie (§2), `/verkoop/webshop` met vier panelen naar het
Claude Design-ontwerp, server actions, koppel-voorsteller + koppelronde, redirect, tab. Na golf 1
hoeft de Supabase-editor nooit meer open en heeft elk artikel een gerecht of voorraad-item.

**Golf 2 — plaatsing.** `plaatsing.ts`, store-methoden, haak in `verwerkBetaling`, per-gerecht
tellen (MEP/kookbord/bulkSchedule/inventoryDemand), `?event=` op het kookbord, vakjes gevuld met
echte orders, *Plaats opnieuw*. Tests: betaling → event; tweede betaling zelfde moment → zelfde
event; totalen tellen op; puur: naam, totalen, idempotentie.

**Golf 3 — inkoop.** Tweede vraagbron (§4.4), `vakje`-optie op `buildBestelvoorstel`,
`/inkoop?vakje=`, vakje-concepten en de twee knoppen (§4.5), *Klaargezet*-vinkjes.

**Golf 4 — de lezer.** `winkelWensenLezer.ts` + tests, aanroep vóór de plaatsing, wensen in het
vakje met *Klopt niet*, `event_allergies`.

Elke golf: `npx tsc --noEmit`, `npm test`, build, PR, CI groen, dan mergen. Migratie via de
Supabase-MCP (`apply_migration`), één tegelijk, daarna `list_migrations` als bewijs.

---

## 7 · Open punten

| # | Vraag | Voorstel |
| --- | --- | --- |
| 1 | Gerechten voor Kerst-Box (+ vegetarisch), Borrel Journey en plank bestaan nog niet. | Niet verzinnen. De koppelronde zegt "nog geen gerecht"; zodra ze in `/gerechten` staan pakt de plaatsing ze bij de eerstvolgende hertelling mee. |
| 2 | Voorraad-items voor bier, saus, amandelen, Alabama bestaan nog niet. | Knop *Nieuw voorraad-item* in de artikel-drawer (naam + eenheid); leverancier en prijs in `/voorraad`, zoals bij elk item. |
| 3 | Een Borrelbox bevat meerdere inkoopproducten (bier + saus + …). | Versie 1 koppelt aan één voorraad-item met `inkoop_per_stuk`. Meerdere onderdelen = een gerecht met componenten (dat is precies wat gerechten al kunnen) — dan koppel je de box als gerecht. |
| 4 | Kassa-voorraad (`winkel_artikelen.voorraad`) naast echte voorraad (`inventory.current_stock`). | Blijven twee dingen: de kassa-voorraad is "hoeveel mag de site nog verkopen", de echte voorraad is wat er in de koeling staat. Het artikel-paneel toont ze naast elkaar zodat het verschil opvalt. Automatisch gelijktrekken is een latere golf. |
| 5 | `severity` voor gelezen allergenen | `high`; `critical` nooit automatisch. |
