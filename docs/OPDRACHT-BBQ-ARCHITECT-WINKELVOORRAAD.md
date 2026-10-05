# Opdracht voor BBQ Architect — één voorraad voor het hele bedrijf

Datum: 26 september 2026. Van Mathijs, uitgewerkt in de website-repo.
**Dit werk hoort in `bbq-architect-v2`.** Kopieer dit bestand naar `docs/` en begin met
de prompt hieronder.

Bouwt voort op `docs/OVERDRACHT-BBQ-ARCHITECT-GESCHENKPAKKETTEN.md` (PR #240, S1–S7) —
die eerst af, inclusief de hernoemtabel in §0 en de QR per doos in S7.

---

## De prompt

> Lees `docs/OPDRACHT-BBQ-ARCHITECT-WINKELVOORRAAD.md`, `docs/winkel-kassa.md` en
> `docs/sinterklaas-bouwplan.md`. Controleer eerst of wat in §2 "Wat er al is" staat nog
> klopt — het is op 26 september gelezen. Schrijf daarna een bouwplan
> (`docs/voorraad-bouwplan.md`) met je keuzes per blok, stel mij de vragen uit §6 die je
> niet uit de code kunt beantwoorden, en bouw fase 1 (W1–W5) blok voor blok, elk met
> tests groen. Fase 2 en 3 daarna, in de volgorde van §5. Additieve migraties; de tabel
> `inventory` (met de hand aangemaakt, geen migratie) niet verbouwen. Gebruik de
> BBQ Architect-huisstijl en de bestaande componenten voor de schermen.

---

## 1. Wat Mathijs wil

**BBQ Architect weet alles wat er in het bedrijf met goederen gebeurt.** Wat binnenkomt,
wat in de keuken wordt gebruikt, wat naar de winkel gaat, wat verkocht wordt, wat kapot
gaat, wat Mathijs zelf meeneemt. Elk product dat het bedrijf verlaat is óf verkocht en
afgerekend, óf verklaard. Wat overblijft is manko, en dat is zichtbaar. Zo is de
boekhouding strak.

Concreet:

- **Een winkel in BBQ Architect** met wat er nu aan de Tramstraat staat.
- **Voorraad toevoegen op elke manier:** handmatig, foto van de factuur, pdf of doorgestuurde
  mail, barcode scannen, een inkooporder in één tik ontvangen — altijd eerst controleren.
- **De webshop verkoopt alleen wat er is.** Drie Bierpakketten € 35 halen vijftien bieren,
  drie worsten, 450 g amandelen, drie bakjes crackers en drie dozen van de winkelvoorraad.
- **Een melding als iets bijna op is**, ook vooruitkijkend op wat er besteld staat.
- **Afwijkingen vastleggen:** "1 fles wijn eigen gebruik" in twee tikken op de telefoon.
- **Een voorraadkaart:** links de keuken, rechts de winkel, erboven het overzicht van het
  hele bedrijf — geld in voorraad, THT, wat al maanden stil ligt.
- **Straks de kassa** in de winkel (maart 2027) op dezelfde voorraad.

## 2. Wat er al is (gelezen op 26 september — controleer)

| Wat | Waar | Stand |
| --- | --- | --- |
| Keukenvoorraad | `inventory` + logboek `stock_movements`, RPC `increment_inventory_stock` | Werkt: `min_stock`, `purchase_price`, `tht`, `lead_time_days`, `avg_daily`, bestelvoorstel. Geen locatie |
| Partijen | `productie_partijen`, `voorraad_eenheden` (met QR `scan_token`) | Werkt, voor eigen productie |
| Webshopproducten | `winkel_producten.voorraad` (NULL = niet bijgehouden) | **Een vast getal dat nooit omlaag gaat.** Reserveren live berekend, WK009 blokkeert bij op |
| Koppeling | `winkel_artikelen.inventory_id`; `winkel_producten` heeft géén `inventory_id` | Twee losse eilanden |
| Inpakken / ophalen | `winkel_order_regels.klaargezet_at`; geen "opgehaald" | Boekt niets af |
| Meldingen | tabel `notifications`, mail via Resend | Geen bel; "laag" is alleen een filter |
| Kassa | myPOS online, `winkel_boek_rest` aan de balie | Geen fysieke kassa, geen EAN-kolom |
| Boekhouding | Moneybird (`src/lib/moneybird.ts`) | **Webshoporders worden niet geboekt** |
| Bestelvoorstel | `api/voorraad/bestelvoorstel`, `concept_inkoop_orders` | Alleen voor de keuken |
| Bonnen inlezen | `/bonnen`, `/inkoop`, `api/bonnen/extract`, `api/bon-process`, `MultiFormatDropZone` (foto, meerdere foto's, camera, pdf, screenshot, klembord, UBL-XML) | Werkt: AI leest de regels, dan leverancier, `inventory` +, `stock_movements` `receive`, prijshistorie. **Alleen keuken, geen plek-keuze, en boekt direct zonder controle** (best-effort, fuzzy match) |
| Scannen | `BarcodeScanner.tsx` in de voorraad | Zoekt op naam, geen EAN |

## 3. Uitgangspunten

1. **Eén logboek, nooit een getal dat je overschrijft.** Elke verandering is een regel met
   type, aantal (+/−), resultaat, reden, wie, wanneer en welke order. Het getal is de som.
2. **Twee plekken, één bedrijf:** keuken/makerij en winkel. Wat van de een naar de ander
   gaat is een overboeking (eraf én erbij), geen verkoop.
3. **Beschikbaar = aanwezig − gereserveerd.** Gereserveerd = besteld en nog niet ingepakt.
4. **Nooit stil op nul afronden.** Onder nul is een fout die gemeld wordt.
5. **Elk product dat weggaat heeft een reden:** verkocht (online, kassa), verbruikt (keuken,
   catering), of een afwijking (§4, W5). Wat bij het tellen ontbreekt zonder reden is manko.
6. **Voorraad NULL = niet bijgehouden**, tot de eerste telling.
7. **Geen AI die voorraad, THT, allergenen of btw bepaalt.** Wel mag AI helpen invoeren
   ("1 fles wijn mee naar huis") — de mens bevestigt.

## 4. De blokken

### Fase 1 — vóór de eerste verkoop in december

#### W1 — Twee plekken, één logboek

- Een plek-begrip: `voorraad_plekken` (Keuken/makerij, Winkel Tramstraat).
- Tabel `winkel_voorraad_mutaties` (of een `plek_id` op een nieuw gezamenlijk logboek — kies
  en leg uit in het bouwplan): `organization_id`, `winkel_product_id`, `type`, `reden`,
  `hoeveelheid` (+/−), `resultaat`, `waarde_cents` (tegen inkoopprijs), `order_id`,
  `order_regel_id`, `inventory_id` (bij overboeking), `door_user_id`, `notitie`, `created_at`.
- Types: `telling` · `ontvangst` · `overboeking` · `verkoop_online` · `verkoop_kassa` ·
  `retour` · `afwijking` (met reden, zie W5).
- RPC `winkel_muteer_voorraad(...)` onder dezelfde vergrendeling als
  `winkel_controleer_capaciteit`, die onder nul weigert.
- `winkel_producten` erbij: `inventory_id`, `drempel`, `bestel_hoeveelheid`,
  `leverancier_id`, `ean` (kassa, nu leeg), `laatste_beweging_at`.

**Klaar wanneer** telling, ontvangst en overboeking elk een regel geven, het getal de som is,
een overboeking in de keuken eraf en in de winkel erbij zet, en onder nul geweigerd wordt.

#### W2 — De winkel vullen

- Scherm **Winkel**: per product aanwezig, gereserveerd, beschikbaar, drempel, THT, inkoop- en
  winkelprijs, en per artikel "nog X pakketten te maken" (het kleinste over de slots).
- **Nulmeting winkel** op de telefoon, zoals `/voorraad/nulmeting`: langs de schappen, tellen.
- **Ontvangst**: inkoop binnen → aantallen erbij, inkoopprijs en THT bijgewerkt, gekoppeld aan
  de inkooporder als die er is.
- **Overboeken** uit de makerij (amandelen, marmelades, eigen worst).

**Klaar wanneer** Mathijs de hele winkel op zijn telefoon kan tellen en daarna in één scherm
ziet wat er staat en hoeveel pakketten er nog te maken zijn.

#### W2b — Voorraad toevoegen, op elke manier

Mathijs moet voorraad kunnen toevoegen zoals het op dat moment uitkomt. Alle wegen komen uit
op **hetzelfde controlescherm** en daarna op dezelfde logboekregel (`ontvangst`). Niets gaat de
voorraad in voordat hij het gezien heeft.

| Manier | Hoe | Bouwt op |
| --- | --- | --- |
| **Handmatig** | Product zoeken, aantal, THT, inkoopprijs, plek. Onbekend product → ter plekke aanmaken | nieuw, klein |
| **Foto van de factuur, pakbon of kassabon** | Telefooncamera, ook meerdere foto's van één lange bon | de bonnen-straat (`api/bonnen/extract`) |
| **PDF of e-factuur** | Uploaden of delen vanuit de mail-app; UBL-XML van leveranciers die dat sturen | de bonnen-straat |
| **Factuur doorsturen per mail** | Een eigen adres (bijvoorbeeld `inkoop@…`) waar een factuur heen gemaild wordt; komt als bon binnen, wacht op controle | controleren of `api/email` inkomende mail al kan; anders later |
| **Barcode scannen** | Camera op de fles of doos: bekend product → aantal erbij; onbekend → nieuw product met die EAN | `BarcodeScanner`, plus de `ean`-kolom uit W1 |
| **Inkooporder ontvangen** | Bij een verstuurde bestelling: "alles binnen" in één tik, afwijkingen per regel | `concept_inkoop_orders`, `inkoop_order_lines` |
| **Foto van het schap of het product** | AI herkent het product en stelt een aantal voor; alleen als hulp bij tellen (`telling`), nooit zonder bevestiging | `/voorraad/nulmeting`, `api/voorraad-ai` |
| **Overboeken uit de keuken** | Zie W2 | W1 |

**Het controlescherm** (voor elke manier hetzelfde), per regel:

- het herkende product, of "nieuw product" — met één tik een ander product kiezen;
- aantal **én verpakkingseenheid**: "1 krat" op de factuur is 24 flesjes in de voorraad; de
  omrekening wordt per leverancier-product onthouden (`supplier_products`);
- inkoopprijs per stuk, btw, THT;
- **plek**: keuken of winkel (standaard wat dit product de vorige keer was);
- bovenaan: leverancier, factuurnummer, datum, totaal — en een waarschuwing als dezelfde factuur
  al eens is ingelezen (`image_hash`, factuurnummer).

Pas na "Klopt, boeken" ontstaan de logboekregels. De factuur zelf gaat, zoals nu, mee naar de
boekhouding (`bon-attach`) — één keer inlezen = voorraad, prijs én boekhouding bij.

Voor de keuken verandert er dit: de bestaande bonnen-straat krijgt dezelfde plek-keuze en
hetzelfde controlescherm, in plaats van direct te boeken. `[BEVESTIGEN bij Mathijs: ook voor
de keuken eerst controleren, of daar direct laten boeken zoals nu?]`

**Klaar wanneer** een foto van een Bidfood-factuur met "2 × krat bier (24)" als 48 flesjes in de
winkel voorgesteld wordt, pas na bevestigen geboekt wordt, dezelfde factuur een tweede keer een
waarschuwing geeft, en een onbekende EAN-scan een nieuw product aanmaakt.

#### W3 — Afboeken bij een bestelling

- **Bestellen** reserveert (bestaat, nu tegen het echte getal).
- **Inpakken** (`klaargezet_at` per doos/schaal) boekt de componenten af als `verkoop_online`.
  `[BEVESTIGEN bij Mathijs: bij inpakken — aanbevolen — of al bij betaling]`
- **Ophalen** (QR-scan uit S7): alleen status en boekhouding, geen voorraad meer.
- **Afgebroken/verlopen vóór inpakken:** reservering vrij. **Geannuleerd na inpakken:** `retour`.
- Idempotent.

**Klaar wanneer** drie Bierpakketten € 35 na inpakken precies 15 bieren, 3 worsten, 450 g
amandelen, 3 bakjes crackers en 3 dozen afboeken; een vierde bestelling geweigerd wordt als
er nog maar 17 bieren zijn; en een afgebroken betaling niets afboekt.

#### W4 — Let op, bijna op

- Melding als **beschikbaar ≤ drempel**, één keer per keer dat hij eronder zakt.
- **Vooruitkijken:** "Voor zaterdag staan 6 pakketten besteld; daar zijn 30 bieren voor nodig,
  er zijn er 24."
- **Artikel dicht:** "Bierpakket € 35 kan niet meer besteld worden: Mr. Hop is op."
- Voor keuken én winkel, in dezelfde vorm: een bel met teller op Vandaag en op de voorraadkaart
  (`notifications`, types `voorraad_laag` / `voorraad_op` / `artikel_dicht` /
  `voorraad_tekort_vooruit`), plus mail via Resend.
  `[BEVESTIGEN bij Mathijs: "op" direct mailen, "bijna op" in één overzicht om 8:00? Adres?]`

**Klaar wanneer** een bestelling die een product onder de drempel brengt precies één melding
geeft, met product, wat er nog is en wat er besteld staat.

#### W5 — Afwijkingen: eigen gebruik, derving, proeven, manko

Alles wat weggaat zonder verkoop, met een reden. Twee tikken op de telefoon: product, aantal,
reden, klaar. Plek en inkoopwaarde vult het systeem in.

| Reden | Wanneer | Voorbeeld |
| --- | --- | --- |
| `eigen_gebruik` | Mathijs of personeel neemt iets mee voor privé | "1 fles wijn eigen gebruik" |
| `proeven` | proeverij, monster, relatiegeschenk, social-foto | "2 bieren proeverij klant" |
| `derving_breuk` | kapot, gevallen, lekt | "1 fles wijn gebroken" |
| `derving_tht` | over datum, weggegooid | "3 worsten THT" |
| `keuken_verbruik` | winkelproduct gebruikt in de keuken of catering | "1 pot biermarmelade voor catering Jansen" |
| `manko` | alleen uit een telling: verschil zonder verklaring | automatisch |

- **Manko ontstaat alleen bij het tellen.** Wat je weet leg je vast als afwijking met een reden;
  wat bij de telling ontbreekt en niet verklaard is, wordt manko. Zo zie je het verschil tussen
  "ik weet waar het is" en "het is weg".
- Elke afwijking heeft een waarde tegen inkoopprijs en telt per maand op (W6, W11).
- Eigen gebruik heeft fiscale gevolgen (btw, privé-onttrekking). Het systeem legt vast; hoe het
  geboekt wordt bepaalt de boekhouder. `[BEVESTIGEN door de boekhouder]`

**Klaar wanneer** "1 fles wijn eigen gebruik" in twee tikken is vastgelegd, de winkel één
fles minder heeft, en de maandtotalen per reden in euro's kloppen.

### Fase 2 — december

#### W6 — De voorraadkaart: keuken links, winkel rechts, het bedrijf erboven

Eén scherm, `/voorraad/kaart`, voor wie in één blik wil zien hoe het ervoor staat.

```
┌─────────────────────────────── HET BEDRIJF ───────────────────────────────┐
│  € 4.820 in voorraad   │  € 310 THT < 30 dagen  │  € 640 ligt stil > 6 mnd  │
│  (inkoop) · € 7.900     │  12 producten           │  9 producten              │
│  verkoopwaarde          │                         │                           │
│  ─────────────────────────────────────────────────────────────────────────  │
│  Deze maand: verkocht € 2.150 · afwijkingen € 38 (eigen gebruik € 11,        │
│  derving € 19, proeven € 8) · manko € 0 · 3 × bijna op                       │
├───────────── KEUKEN / MAKERIJ ─────────────┬──────────────── WINKEL ─────────┤
│  € 3.100 · 64 producten                     │  € 1.720 · 38 producten          │
│  ▲ bijna op: pekelzout, brisket              │  ▲ bijna op: Mr. Hop, biermarm.  │
│  ⏱ THT: kip 29/9, room 1/10                   │  ⏱ THT: droge worst 14/10        │
│  💤 stil: truffelzout (9 mnd, € 42)           │  💤 stil: rode peper marm. (7 mnd)│
│  [tegels per categorie, kleur = status]      │  [tegels per schap/categorie]    │
│                ── overboeken →               │  ← terug naar keuken             │
└─────────────────────────────────────────────┴──────────────────────────────────┘
```

- **Bovenaan, het bedrijf:** geld in voorraad (inkoop, en de verkoopwaarde ernaast), wat binnen
  30 dagen over datum gaat (in euro en aantal), wat al lang stil ligt (in euro en aantal), en de
  maand: verkocht, afwijkingen per reden, manko, meldingen.
- **Links de keuken, rechts de winkel:** zelfde opbouw — waarde, bijna op, THT, stil — en tegels
  per categorie of schap, kleur naar status. Klik op een tegel: het product met zijn logboek.
- **Stil liggen ("winkeldochters"):** dagen sinds de laatste verkoop of het laatste verbruik
  (`laatste_beweging_at`). Grens instelbaar per plek (bijvoorbeeld 3, 6 of 9 maanden). Per
  product: sinds wanneer, hoeveel, hoeveel geld. Dit is de lijst voor een actie of een
  pakket-vulling.
- **Waarde** tegen de laatste inkoopprijs. `[BEVESTIGEN door de boekhouder: laatste, gemiddelde
  of FIFO-inkoopprijs voor de balanswaarde]`
- Op de telefoon: het overzicht bovenaan, daaronder keuken en winkel als twee tabs.

**Klaar wanneer** de drie bovenste getallen kloppen met de som van de producten eronder, een
product dat 9 maanden niet bewogen heeft in "stil" staat met zijn waarde, en een klik op een
tegel het logboek van dat product opent.

#### W7 — THT-bewaking en eerst-op-eerst-uit

- THT per ontvangst (niet één datum per product): bij ontvangst de datum, bij inpakken de
  oudste eerst.
- Melding als iets binnen 30 dagen (instelbaar) over datum gaat, met de suggestie het eerst in
  pakketten te gebruiken.
- Het logboek houdt bij welke partij in welke doos ging.

#### W8 — Bestelvoorstel voor de winkel

- Het bestaande bestelvoorstel (`api/voorraad/bestelvoorstel`, `concept_inkoop_orders`) ook voor
  de winkel: open bestellingen + drempel + levertijd − wat er is, afgerond op
  `bestel_hoeveelheid`, per leverancier.
- Precies de regel uit de bouwopdracht: inkopen op basis van bestellingen plus een kleine buffer.
- Mathijs keurt goed; niets gaat vanzelf de deur uit.

#### W9 — Dagstart op Vandaag

- Wat vandaag ingepakt moet worden, wat vandaag opgehaald wordt (met naam en tijdslot), wat
  gisteren niet is opgehaald, wat bijna op is, wat deze week over datum gaat.

#### W10 — "Nog 3 beschikbaar" naar de website

- De site heeft al een schakelaar `voorraad_tonen`. BBQ Architect levert het getal:
  `GET …/beschikbaarheid` → `{ "artikelen": [ { "slug": "bierpakket-35", "beschikbaar": 12 } ] }`
  (`null` = niet bijgehouden). Beschikbaar = hoeveel er nog gemaakt en verkocht kunnen worden.
- De website toont alleen iets onder een grens ("nog 3"), nooit "nog 212". De websitekant
  bouwen we daarna in de website-repo.

### Fase 3

#### W11 — De boekhouding strak

- **Verkopen** (online en straks kassa) naar Moneybird, met de btw-verdeling per regel (S6).
  Nu worden webshoporders niet geboekt — dit moet vóór de eerste december-verkoop.
  `[BEVESTIGEN door de boekhouder: omzet bij betaling of bij ophalen]`
- **Afwijkingen** per maand per reden als kostenpost (derving, proeven) of privé-onttrekking
  (eigen gebruik).
- **Maandafsluiting:** begin + ontvangst − verkoop − verbruik − afwijkingen = eind; het
  verschil met de telling is manko. Voorraadwaarde aan het eind van de maand als balanspost.
- Eén maandrapport dat de boekhouder zo kan gebruiken.

#### W12 — De kassa in de winkel (maart 2027)

- De fysieke kassa scant EAN-codes en boekt af als `verkoop_kassa`, op hetzelfde logboek.
- De QR per doos (S7) is de scan bij het ophalen.
- Losse verkoop van bier en wijn in de winkel pas bij de winkelopening (website: `bier_wijn`).

## 5. Volgorde

W1 → W2 → W2b → W3 → W4 → W5 (fase 1, vóór december) · W11 verkopen naar Moneybird zo snel de
boekhouder antwoordt · W6 → W7 → W8 → W9 → W10 (fase 2) · W11 rest · W12 (maart).

## 6. Vragen voor Mathijs

1. Afboeken bij inpakken of bij betaling? (Aanbevolen: inpakken.)
2. Drempel per product zelf invullen, of een standaard ("genoeg voor 5 pakketten")?
3. Meldingen: welk adres, en "op" direct en "bijna op" één keer per dag?
4. Amandelen, marmelades en eigen worst: eerst in de keuken en dan overboeken, of meteen in de winkel?
5. Wanneer ligt iets "stil": na 3, 6 of 9 maanden — per plek hetzelfde?
6. Wie mag een afwijking vastleggen: alleen Mathijs, of ook personeel (met naam in het logboek)?
7. Ook in de keuken eerst een controlescherm voordat een bon de voorraad in gaat, of daar direct boeken zoals nu?
8. Welk mailadres voor doorgestuurde facturen?

## 7. Vragen voor de boekhouder

1. Webshopomzet boeken bij betaling of bij ophalen?
2. Btw-verdeling van gemengde pakketten naar winkelwaarde — akkoord?
3. Eigen gebruik: hoe boeken (privé-onttrekking, btw-correctie)?
4. Voorraadwaarde op de balans: laatste, gemiddelde of FIFO-inkoopprijs?

## 8. Wat je nooit doet

- Geen voorraadgetal overschrijven zonder logboekregel.
- Geen stille afronding op nul.
- Niets afboeken op een onbevestigde betaling.
- Geen afwijking zonder reden; manko alleen uit een telling.
- Geen AI die voorraad, THT, allergenen of btw bepaalt: AI leest en stelt voor, Mathijs bevestigt.
- Niets de voorraad in zonder het controlescherm.
