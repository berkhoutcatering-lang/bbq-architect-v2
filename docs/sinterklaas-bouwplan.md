# Bouwplan — Sinterklaas 2026: borrelplank en zeven geschenkpakketten

**Repo:** BBQ Architect. **Datum:** 26 september 2026. **Branch:** `feat/sinterklaas-2026`.
**Opdracht:** `docs/OVERDRACHT-BBQ-ARCHITECT-SINTERKLAAS.md` (kopie uit de website-repo, 26 sep) — blokken S1–S7.
**Hoort bij:** `docs/winkel-kassa.md` (de kassa), `docs/webshop-beheer-bouwplan.md` (de vakjes, golf 1–3 live).

Het contract met de website verandert op één punt: `betaalwijze` in offerte en order, met
`nuTeBetalenCenten` / `restInWinkelCenten` / `reserveringCenten` erbij (S5). Al het andere is
intern: producten, slots, componenten, btw-verdeling, productie- en inpaklijsten, etiket.

---

## 0 · Wat er van blok A7 (Kerst-Box) al ligt — en wat we ervan gebruiken

Blok A7 staat op branch `kerst-box-groepen` (2 commits, 14 september) en is **niet gemerged**,
niet gemigreerd, en inmiddels 55 commits achter op main (de vakjes-golven raakten dezelfde
bestanden). Wat erin zit: `winkel_groepen` (minimum per order + maximum over de hele verkoop
per groep, WK008), dagcapaciteit NULL = onbeperkt, Experience-token per orderregel, een
productieoverzicht op de oude `/verkoop/winkelorders` (die pagina is sinds 25 september een
redirect).

Sinterklaas heeft hiervan nodig:

| Mechaniek uit A7 | Sinterklaas | Hier |
| --- | --- | --- |
| `moment_groep` per artikel | ja: `sint-plank` en `sint-pakket` | bestaat al op main |
| Groepsminimum (2 samen) | nee — de plank heeft een gewoon artikelminimum van 2, pakketten minimum 1 | niet nodig |
| Dagcapaciteit NULL = onbeperkt | ja: "bouw de momenten leeg" | overgenomen (zelfde `DROP NOT NULL`, idempotent) |
| Interne verdeling (dozen) | ja, maar anders: schalen 2–3 / 4–5, nooit 1 | eigen functie `verdeelSchalen` |
| Productieoverzicht | ja, uitgebreider (grammen, schalen, bakjes, inpaklijst) | in het vakje op `/verkoop/webshop` |
| QR per regel via Experience-token | **nee**: de Sinterklaas-QR is een gewone URL met artikel-slug en ordernummer als parameters, geen token | `qr_basis_url` in de instellingen; BBQ Architect maakt nog steeds nooit een token |

De capaciteitsfunctie wordt hier opnieuw gedefinieerd (productvoorraad erbij). Ze bevat het
groepstotaal van A7 ook, maar alleen als `winkel_groepen` bestaat (dynamisch gecontroleerd),
zodat de A7-migratie er later zonder verlies overheen kan. A7 zelf mergen is een aparte stap
voor de kerstlancering; dit plan wacht er niet op.

---

## 1 · Het datamodel — één additieve migratie

`supabase/migrations/20260927120000_winkel_sinterklaas.sql`. Pre-flight controleert de
winkel-tabellen en de vakjes-kolommen.

### 1.1 `winkel_producten` — wat er in een pakket of op een plank ligt

| Kolom | Betekenis |
| --- | --- |
| `naam`, `type` | type ∈ bier · wijn · worst · amandelen · crackers · marmelade · doos · vleeswaar · kaas · zuur · krokant · verpakking · overig |
| `eenheid` (`stuk` \| `gram`), `prijs_per` | prijzen gelden per `prijs_per` eenheden (amandelen: per 100 g) |
| `winkelprijs_incl_cents`, `inkoop_excl_cents`, `btw_pct` | leeg = onbekend; nooit 0 als gok |
| `herkomst` (lokaal · groothandel · mr_hop · eigen), `alcohol` | 18+ op order en etiket |
| `smaakprofiel` jsonb, `hop_and_bites_tip` | nu leeg / false — voor de smaakwijzer (fase 2) |
| `voorraad` numeric | **NULL = niet bijgehouden, blokkeert nooit.** Een getal = harde grens op gereserveerd + besteld. Dat is de `[BEVESTIGEN]`-vraag "verkopen op inkoopplanning of op fysieke voorraad": tot Mathijs kiest staat alles op NULL en verkoopt de site door. |
| `actief` | uit = niet meer kiesbaar in slots |

### 1.2 `winkel_artikel_slots` — het template

Eén rij per slot van een artikel. `slot_type` (zelfde lijst als producttype), `naam` ("Droge worst, soort 1"),
`hoeveelheid` + `eenheid` (5 stuk, 150 gram), `per` (`stuk` = per besteld pakket, `persoon` = per persoon —
de plank), `standaard_product_id` (leeg = nog niet ingevuld), `wisselbaar` (nu false),
`alternatieven` uuid[] (nu leeg), `volgorde`.

De **plank is hetzelfde model** met `per = 'persoon'`: vijftien slots met grammen. Zo rekent
één functie de componenten van elke regel: Σ slot.hoeveelheid × aantal.

### 1.3 `winkel_artikelen` — erbij

`segment` (bier · wijn · combi), `vast` (true), `alcohol` (18+), `schaal_verdeling` (plank:
personen over schalen 2–3 / 4–5), `btw_verdeling` jsonb (`{"9": 30.2, "21": 69.8}` als
overschrijving van de naar-rato-splitsing), `verpakking_klein_cents` / `verpakking_groot_cents`
(alleen marge, nooit voor de klant).

### 1.4 `winkel_order_regel_componenten` — de inhoud van een regel, vastgelegd bij het plaatsen

Per regel per slot: `product_id`, `naam`, `slot_type`, `hoeveelheid`, `eenheid`. Dit is wat
gereserveerd wordt (S2), wat op de inpaklijst staat (S7, "exacte inhoud inclusief wissels") en
wat ná een productwissel in het template níét meer verandert voor bestaande orders.

### 1.5 `winkel_order_regels` — erbij

`btw_cents` jsonb: de btw-verdeling van deze regel per tarief, telt op tot het btw-deel van het regelbedrag (S6).

### 1.6 `winkel_orders` — twee betaalwijzen

`betaalwijze` (`volledig` \| `reservering`), `nu_te_betalen_cents` (wat naar myPOS gaat),
`rest_cents` (in de winkel), `rest_betaald_at`, `rest_betaalmethode` (contant · pin).
**Status blijft `betaald`** zodra de online betaling binnen is — alles wat op status filtert
(capaciteit, vakjes, keuken) blijft werken. De tweede toestand "rest betaald" is
`rest_betaald_at`; de website ziet alleen `betaald` plus het restbedrag.

### 1.7 `winkel_momenten` en `winkel_instellingen`

Momenten: `capaciteit` mag NULL (onbeperkt), `sluit_op` timestamptz = besteldeadline met tijd
(naast het bestaande `bestellen_tot` als dag). Instellingen: `reservering_bedrag_cents`
(NULL = reservering uit; seed 250), `qr_basis_url` (de Sinterklaas-editie van de Experience-app).

### 1.8 Functies

- `winkel_bezetting_product(product_id, zonder_order)` — Σ hoeveelheid uit componenten van betaalde + lopende orders.
- `winkel_controleer_capaciteit` — opnieuw: dagcapaciteit alleen als er een grens is; **WK009 = product op**;
  groepstotaal (WK008) alleen als `winkel_groepen` bestaat.
- `winkel_plaats_order` — oude signatuur weg, nieuwe met `p_betaalwijze`, `p_nu_te_betalen_cents`,
  `p_rest_cents`; per regel `componenten[]` en `btw_cents` in de JSON.
- `winkel_start_betaalpoging` / `winkel_bevestig_betaling` — de hercontrole neemt de componenten mee.
- `winkel_boek_rest(order_id, methode)` — de balie: zet `rest_betaald_at`; idempotent.

---

## 2 · Rekenlaag (`src/lib/winkel/rekenen.ts`)

- `verdeelSchalen(personen)` → `[{ maat: 'groot', personen: 5 }, { maat: 'klein', personen: 2 }]`:
  zo veel mogelijk grote (5), rest 2–3 klein, rest 4 groot(4), rest 1 → laatste grote wordt 4 + klein 2.
  Tabel uit de opdracht: 6 → 4 + 2 `[BEVESTIGEN: of 3 + 3]`, 9 → 5 + 4, 11 → 5 + 4 + 2.
- `verkoopbaar(artikel, slots)`: elk slot heeft een product. Anders `validatie` "… kan op dit moment niet besteld worden" (dezelfde zin als prijs volgt).
- `componentenVan(artikel, slots, aantal)`: Σ per slot; `per = 'persoon'` × personen.
- `btwVerdeling(artikel, slots, producten, bedragCenten)`: overschrijving uit `btw_verdeling`, anders naar rato van de winkelwaarde van de componenten, anders alles op `btw_pct`. Restcent naar het grootste deel; telt altijd op.
- `berekenOfferte(..., betaalwijze)`: `nuTeBetalenCenten`, `restInWinkelCenten`, `reserveringCenten`.
  Meerdere agenda-momenten in één order mogen als ze **hetzelfde tijdvak** zijn (zelfde datum, van, tot) — één afhaalmoment, twee tellingen (plank + pakket).
- `momentOpen`: ook `sluit_op` (met tijd) tegen `nu`.
- `keuzes` op een regel → `validatie` (het pakket is vast).

## 3 · Kassa en contract

- Offerte/Order: `betaalwijze` optioneel, standaard `volledig`. Bij `reservering` zonder ingesteld bedrag → `validatie`.
- myPOS int `nu_te_betalen_cents`; webhook en statuscontrole vergelijken daarmee, niet met `totaal_cents`.
- Status: `betaalwijze`, `nuTeBetalenCenten`, `restInWinkelCenten`, `restBetaald`.
- Mail: "Reeds betaald: € 2,50 · te betalen in de winkel: € 32,50" en 18+ bij alcohol.

## 4 · Beheer (`/verkoop/webshop`)

- **Producten** (nieuw paneel): lijst met type, prijs, btw, voorraad · gereserveerd · besteld; drawer om te bewerken. Marge-hint per pakket in Artikelen (inkoop + verpakking ≤ 65 % van omzet excl. btw, winkelwaarde ≥ prijs) — rood als het niet klopt, alleen met ingevulde prijzen.
- **Artikelen**: segment, 18+, schaalverdeling, btw-verdeling, verpakkingsbudget; slots-editor (type, naam, hoeveelheid, per, product kiezen).
- **Momenten**: capaciteit leeg = onbeperkt; besteldeadline met tijd.
- **Instellingen**: reserveringsbedrag, QR-basis-URL.
- **Vakje**: zoek op ordernummer; per order de betaalwijze, restbedrag en de knop *Rest betaald (contant / pin)*; drawer **Productie & inpakken** (S7); **Etiketten printen** per order via de Zebra.

## 5 · Productie, inpakken, etiket (S7)

Zuiver in `src/lib/winkel/productie.ts` (getest), scherm in `_components/ProductiePaneel.tsx`:
- Plank per moment: personen → grammen per onderdeel, schalen klein/groot, bakjes (6 per schaal); snij-/opmaaklijst per order met de grammen per schaal.
- Pakketten per moment, gegroepeerd per artikel: totaal, dan de orders met inhoud (uit de componenten), afvinkvakjes en controleveld — print-vriendelijk.
- Etiket: template `winkeletiket` (klantnaam, ordernummer, moment, artikel, QR, 18+, "reeds betaald / rest"). Labelmaat komt van de printerinstelling (`/instellingen/printers`), dus configureerbaar. QR-URL: `{qr_basis_url}/sint?artikel={slug}&order={nummer}`.

## 6 · Volgorde

S1 datamodel + rekenen + seed → S2 verkoopbaarheid + reservering → S3 momenten → S4 schalen → S5 betaalwijze → S6 btw → S7 productie/etiket. Elk blok: `npx tsc --noEmit`, `npm test`. Eén PR. Migratie via `npx supabase db query --linked -f …` (buiten de sandbox; nooit `db push`), daarna de seed.

## 7 · Open punten — niets hiervan is gepubliceerd

Zie de lijst onderaan de overdracht. Wat dit plan er nu mee doet: plankprijs € 14,95 in de seed maar
`actief = false`; slots zonder product (pakketten dus niet verkoopbaar); geen momenten;
reservering € 2,50 per **order**; marmelade-slots leeg; productvoorraad NULL (verkoopt door);
btw naar rato met overschrijving; 6 personen = 4 + 2; niet-afgehaald = handmatig (geen automatiek).
