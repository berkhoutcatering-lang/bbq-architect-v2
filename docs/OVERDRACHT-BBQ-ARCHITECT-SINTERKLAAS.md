# Overdracht — wat BBQ Architect moet leveren voor Sinterklaas 2026

Datum: 26 september 2026. Hoort bij de bouwopdracht `sinterklaas-2026-bouwopdracht.md`
(besloten 26-09-2026) en bouwt voort op `OVERDRACHT-BBQ-ARCHITECT-WEBSHOP.md` en blok A7
in `BOUWBRIEF-BBQ-ARCHITECT.md`.

**Dit werk hoort in de repo `bbq-architect-v2`, niet hier.** Dit document is zelfstandig:
alles wat BBQ Architect nodig heeft staat erin. De website (deze repo) doet daarna alleen
de klantkant: acht artikelen in `content.ts`, de hub Geschenken in het menu, en één nieuw
veld in de adapter (`betaalwijze`).

## Zo geef je dit aan Claude in `bbq-architect-v2`

Kopieer dit bestand naar de root van `bbq-architect-v2` en open daar een sessie met:

> Lees `OVERDRACHT-BBQ-ARCHITECT-SINTERKLAAS.md` en `docs/winkel-kassa.md`. Controleer
> eerst wat er van blok A7 (Kerst-Box, branch `kerst-box-groepen`) al gemerged is — de
> Sinterklaas-artikelen gebruiken dezelfde mechanieken (`moment_groep`, groepsminimum,
> interne verdeling, productieoverzicht, QR per artikel). Bouw daarna de blokken S1 t/m S7
> in volgorde, één per keer, met tests groen. Publiceer niets waar `[BEVESTIGEN]` bij staat.

---

## De besluiten van 26 september waar dit op rust

1. **Alleen afhalen** aan de Tramstraat 13. Geen bezorging, geen verzending.
2. **Bier en wijn mogen online besteld worden voor afhaal, nu al.** Losse verkoop in de
   winkel (over de toonbank) begint pas in maart 2027. Dat zijn twee verschillende
   schakelaars; de website splitst `bier_wijn` daarvoor op. Voor BBQ Architect betekent
   het: artikelen met alcohol zijn gewoon verkoopbaar via de webshoproute, met btw 21 %
   op dat deel en een 18+-markering op order en etiket.
3. **De zeven geschenkpakketten zijn vast.** Geen wisselen, geen smaakwijzer, geen
   alternatieven — voor nu. Het datamodel wordt wél als template-met-slots gebouwd, zodat
   samenstellen later een uitbreiding is en geen verbouwing (§5 van de bouwopdracht,
   fase 2).
4. **Twee betaalwijzen:** volledig online, of € 2,50 reservering online en de rest in de
   winkel bij afhalen. De € 2,50 is geen toeslag: hij gaat van het totaal af.

Alle bedragen in **hele centen**. Tijdzone `Europe/Amsterdam`; datums ISO.

---

## Wat BBQ Architect al kan (contract van 13 september)

| Route | Bestaat | Wat Sinterklaas ervan gebruikt |
| --- | --- | --- |
| `GET …/momenten[?artikel=]` | ja | eigen afhaaldagen en tijdsloten per artikelgroep |
| `POST …/offerte` | ja | herberekening op slug + aantal; groepsminimum; **nieuw: `betaalwijze`** |
| `POST …/order` | ja | idempotent op `sleutel`, reservering, `betaalUrl` naar myPOS |
| `GET …/order/{token}` | ja | status; **nieuw: aanbetaling zichtbaar** |
| myPOS-webhook, bevestigingsmail | ja | ongewijzigd; mail noemt de betaalwijze |

De website stuurt, net als bij de Kerst-Box, alleen slugs, aantallen, een moment-id,
contactgegevens en een verwacht totaal. Niets uit de browser is waarheid.

---

## De artikelen

Acht artikelen, één `moment_groep` per soort. Prijzen zijn de startprijzen uit de
bouwopdracht; `[BEVESTIGEN]` waar de opdracht dat zelf zegt.

| slug | Naam | Eenheid | Prijs | Minimum | `moment_groep` | Alcohol |
| --- | --- | --- | --- | --- | --- | --- |
| `sinterklaas-borrelplank` | Sinterklaas-borrelplank | per persoon | € 14,95 `[BEVESTIGEN]` | 2 personen | `sint-plank` | nee |
| `sint-bier-20` | Bierpakket € 20 | per stuk | € 20,00 | 1 | `sint-pakket` | ja |
| `sint-bier-35` | Bierpakket € 35 | per stuk | € 35,00 | 1 | `sint-pakket` | ja |
| `sint-bier-50` | Bierpakket € 50 | per stuk | € 50,00 | 1 | `sint-pakket` | ja |
| `sint-wijn-35` | Wijnpakket € 35 | per stuk | € 35,00 | 1 | `sint-pakket` | ja |
| `sint-wijn-50` | Wijnpakket € 50 | per stuk | € 50,00 | 1 | `sint-pakket` | ja |
| `sint-bier-wijn-35` | Bier & wijn € 35 | per stuk | € 35,00 | 1 | `sint-pakket` | ja |
| `sint-bier-wijn-50` | Bier & wijn € 50 | per stuk | € 50,00 | 1 | `sint-pakket` | ja |

De namen op de site komen uit `content.ts` van de website; BBQ Architect is de bron voor
prijs, verkoopbaarheid, voorraad en capaciteit.

### Inhoud van de pakketten (vast)

| Pakket | Bier | Wijn | Worst | Amandelen | Crackers | Marmelade |
| --- | --- | --- | --- | --- | --- | --- |
| Bier € 20 | 1 groothandel + 1 H&B-advies + 1 lokaal | – | 1 | 100 g | – | – |
| Bier € 35 | 5 | – | 1 | 150 g | 1 bakje 60 g | – |
| Bier € 50 | 5, waarvan 1 Mr. Hop | – | 2 | 200 g | 1 bakje 60 g | Cerveza of rode peper `[BEVESTIGEN: welke van de twee — vast pakket, dus één soort]` |
| Wijn € 35 | – | 2 | 1 | 150 g | 1 bakje 60 g | – |
| Wijn € 50 | – | 2 | 3 (worstproeverij) | 200 g | 1 bakje 60 g | vijg of rode wijn `[BEVESTIGEN: welke]` |
| Bier & wijn € 35 | 3 lokaal | 1 | 1 | 150 g | 1 bakje 60 g | – |
| Bier & wijn € 50 | 3, waarvan 1 Mr. Hop | 1 | 2 | 200 g | 1 bakje 60 g | ui |

Elk pakket in een gesloten, stapelbare geschenkdoos met bescherming tussen de flessen;
amandelen en crackers in afsluitbare bakjes. Alles ongeopend buiten de koelkast houdbaar.

**Welke bieren, wijnen en worstsmaken precies** vult Mathijs zelf in via de data — niet
hardcoden. Tot die invulling er is, is een pakket wel aan te maken maar niet verkoopbaar
(zie S2).

### Inhoud van de borrelplank (per persoon, 250 g)

| Onderdeel | g p.p. |
| --- | --- |
| Pastrami (Beef Club 29) | 20 |
| Eigen grillworst | 40 |
| Droge worst, soort 1 | 10 |
| Droge worst, soort 2 | 10 |
| Droge worst, soort 3 | 10 |
| Coppa | 10 |
| Serranoham | 10 |
| Drentse hooikaas (of vergelijkbaar) | 30 |
| Spaanse schapenkaas | 25 |
| Amsterdamse uien, uitgelekt | 20 |
| Cornichons, uitgelekt | 20 |
| Pizza-dipcrackers | 10 |
| Chili-rijstcrackers | 10 |
| Mexicano's | 10 |
| Eigen BBQ-amandelen | 15 |

Verpakking: zwarte schaal met transparante kap (klein ca. 35 × 24 cm voor 2–3 personen,
groot ca. 45 × 30 cm voor 4–5), met zes zwarte afsluitbare bakjes per schaal (amandelen,
drie keer krokant, twee keer zuur). Vlees en kaas los op de schaal.

---

## Blokken

### S1 — Datamodel: pakket als template met slots

Bouw het pakket niet als los artikel met een omschrijving, maar als template:

```
pakket
  artikel_slug, segment (bier | wijn | combi), prijs_centen, vast (nu: true)
  slots[]: slot_type (bier | wijn | worst | amandelen | crackers | marmelade | doos),
           standaard_product_id, aantal, wisselbaar (nu: false), alternatieven[] (nu: leeg)

product
  id, naam, type, omschrijving, foto
  winkelprijs_incl_centen, inkoop_excl_centen, btw_tarief (9 | 21)
  herkomst (lokaal | groothandel | mr_hop | eigen)
  smaakprofiel (nu leeg; voor de latere smaakwijzer)
  hop_and_bites_tip (bool)
  voorraad, gereserveerd
```

- **`vast: true` en `wisselbaar: false` overal.** De offerte accepteert voor deze
  artikelen géén keuzes; komt er toch een `keuzes`-veld mee, dan `validatie`.
- De borrelplank is een artikel met een **receptuur per persoon** (de grammentabel), geen
  template. Bewaar de gramgewichten als data, niet in code.
- Het model is zo dat fase 2 (wisselen, smaakwijzer, zakelijke series) alleen
  `wisselbaar`, `alternatieven` en `smaakprofiel` hoeft te vullen.

**Klaar wanneer** de seed de acht artikelen aanmaakt, met de zeven pakketten als template
en de plank met receptuur, en `POST offerte` ze herberekent op slug + aantal.

### S2 — Verkoopbaarheid en voorraad per component

- Een pakket is pas **verkoopbaar** als elk slot een `standaard_product_id` heeft. Tot
  dan antwoordt de catalogus `niet-beschikbaar` en zegt de site "prijs volgt" of laat
  het artikel weg.
- **Voorraad reserveren op productniveau** bij het aanmaken van een order: één
  Bierpakket € 35 reserveert vijf bieren, één worst, 150 g amandelen, één bakje
  crackers, één doos. Onder dezelfde vergrendeling als de capaciteit
  (`winkel_plaats_order`). Is een component op, dan is het pakket `niet-beschikbaar`.
- Reservering vervalt met de order (30 minuten, zoals afgesproken); een betaling die na
  het verlopen alsnog binnenkomt volgt de Kerst-Box-regel (alsnog `betaald` als er nog
  voorraad en capaciteit is, anders terugbetalen en `mislukt` met reden).
- Amandelen en crackers voor de plank tellen in **grammen** mee op dezelfde voorraad als
  de pakketten. Doel: inkopen op basis van bestellingen plus een kleine buffer, dus de
  voorraad moet ook **negatief gepland** kunnen worden (besteld-maar-nog-niet-ingekocht)
  zonder dat de verkoop stopt. `[BEVESTIGEN: verkopen op inkoopplanning, of pas als de
  voorraad fysiek binnen is?]`

**Klaar wanneer** een pakket zonder ingevulde slots `niet-beschikbaar` geeft, een order
de componenten reserveert en het beheerscherm per product "besteld / gereserveerd /
voorraad" toont.

### S3 — Afhaalmomenten, capaciteit en deadline per groep

Zelfde mechaniek als de Kerst-Box (`?artikel=`), maar nu per `moment_groep`:

- **Ophaaldagen met tijdsloten** zijn configureerbaar in het beheerscherm, niet in de
  seed. Per slot een maximum, **apart voor `sint-plank` en `sint-pakket`**.
- **Besteldeadline per moment** (`sluit_op`, datum + tijd). Na de deadline komt het
  moment niet meer in `GET momenten` en geeft `POST order` `moment-verlopen`.
- `GET …/momenten?artikel=sinterklaas-borrelplank` geeft de plank-momenten met `vrij` in
  personen; `?artikel=sint-bier-35` de pakket-momenten met `vrij` in pakketten. Eén
  order met plank én pakketten reserveert in beide tellingen op hetzelfde moment.
- Dagen, sloten, maxima en deadline zijn nog open — bouw ze leeg, publiceer niets.
  `[BEVESTIGEN: ophaaldagen, tijdsloten, maximum per slot, deadline]`

**Klaar wanneer** een slot vol `moment-vol` geeft voor de ene groep en niet voor de andere,
en een order na de deadline `moment-verlopen`.

### S4 — Schaalverdeling en groepsminimum voor de plank

De klant kiest en betaalt **personen**; de schaal is intern, zoals de doos bij de Kerst-Box.

- Minimum 2 personen. `aantal: 1` → `validatie` "De borrelplank gaat vanaf 2 personen."
- Verdeling: zo veel mogelijk grote schalen (5), de rest op één kleine (2–3); een schaal
  met 1 persoon bestaat niet, dus bij rest 1 gaat er één persoon van de laatste grote
  schaal af.

| Personen | Verdeling |
| --- | --- |
| 2, 3 | 1 klein |
| 4, 5 | 1 groot |
| 6 | groot 4 + klein 2 `[BEVESTIGEN: de opdracht noemt 3 + 3, dat is twee kleine schalen — welke van de twee?]` |
| 7 | groot 5 + klein 2 |
| 8 | groot 5 + klein 3 |
| 9 | groot 5 + groot 4 |
| 10 | groot 5 + groot 5 |
| 11 | groot 5 + groot 4 + klein 2 |
| 12 | groot 5 + groot 5 + klein 2 |

- Per schaal zes bakjes. Verpakkingsbudget: € 2,25 klein, € 3,00 groot (incl. btw) —
  alleen voor de marge, nooit voor de klant.

**Klaar wanneer** `POST offerte` met 1 persoon `validatie` geeft, en het productieoverzicht
voor 11 personen "1 × groot (5), 1 × groot (4), 1 × klein (2)" laat zien.

### S5 — Twee betaalwijzen: volledig of € 2,50 reservering

Dit is de enige wijziging aan het contract met de website.

**Offerte en order** krijgen een veld:

```json
"betaalwijze": "volledig" | "reservering"
```

Response van de offerte, naast de bestaande velden:

```json
"nuTeBetalenCenten": 250,
"restInWinkelCenten": 3250,
"reserveringCenten": 250
```

Bij `volledig` is `nuTeBetalenCenten` gelijk aan `totaalCenten` en `restInWinkelCenten`
0. Bij `reservering` gaat **€ 2,50 per order** naar myPOS, niet per artikel.
`[BEVESTIGEN: per order, of per pakket/plank? De opdracht zegt "€ 2,50 reserveringsbedrag",
per order is het simpelst en het goedkoopst in iDEAL-kosten.]`

- **De reservering is geen toeslag.** `totaalCenten` verandert er niet door; de € 2,50
  wordt bij afhalen van het totaal afgetrokken. Op bevestigingsmail, statuspagina en
  kassabon: "reeds betaald: € 2,50 · te betalen in de winkel: € 32,50".
- Status `betaald` betekent bij `reservering`: de € 2,50 is binnen. Voeg een tweede
  toestand toe voor de kassa: `rest_betaald` (contant of pin, bij afhalen). De website
  toont alleen `betaald` en noemt het restbedrag.
- **Kassa:** de order moet aan de balie te vinden zijn op ordernummer of door de QR op
  het etiket te scannen; de kassa boekt dan het restbedrag en zet `rest_betaald`. De
  € 2,50 staat als aanbetaling op de bon.
- Niet afgehaald: de € 2,50 vervalt, de goederen gaan terug in de voorraad.
  `[BEVESTIGEN: klopt dat, en na hoeveel dagen?]`
- Btw op de aanbetaling: boek de € 2,50 als vooruitbetaling op de order, niet als apart
  product, zodat de btw-splitsing van de order (S6) klopt.

**Klaar wanneer** dezelfde mand twee offertes geeft (volledig en reservering) met hetzelfde
`totaalCenten` en een verschillend `nuTeBetalenCenten`; de myPOS-betaling bij
`reservering` € 2,50 int; de statusroute het restbedrag meegeeft; de kassa een order op
nummer opent en het rest afrekent.

### S6 — Btw-splitsing 9 / 21 per pakket

- Eten 9 %, bier en wijn 21 %. De pakketprijs wordt **naar rato van de winkelwaarde** van
  de componenten over beide tarieven gesplitst. Voorbeeld Bier & wijn € 35: winkelwaarde
  1 × € 11,50 wijn + 3 × € 4,95 bier = € 26,35 à 21 %, worst € 4,95 + amandelen € 3,95 +
  crackers € 2,50 = € 11,40 à 9 %; totaal € 37,75, dus 69,8 % van de € 35 tegen 21 % en
  30,2 % tegen 9 %.
- De splitsing is **configureerbaar** (verhouding per pakket overschrijfbaar), want:
  `[BEVESTIGEN door de boekhouder: naar-rato-splitsing van een gemengd pakket]`.
- De website toont alleen totalen inclusief; de splitsing staat op factuur en in de
  boekhouding.
- De borrelplank is volledig 9 %.

**Klaar wanneer** elke order per regel een btw-verdeling opslaat die optelt tot het
regelbedrag, en de factuur/export beide tarieven apart toont.

### S7 — Productie, inpakken en etiket

Uitbreiding van het productieoverzicht op `/verkoop/winkelorders` (blok A7, taak 3) en
van de QR-koppeling (A7, taak 4). Alleen **betaalde** orders tellen (bij `reservering`:
de aanbetaling is binnen).

**Productielijst borrelplank, per ophaalmoment**

- Totaal personen, daaruit per onderdeel de grammen (personen × g p.p.), aantal kleine
  en grote schalen, aantal bakjes (6 per schaal).
- **Snij-/opmaaklijst per bestelling:** naam, ordernummer, personen, schaalverdeling, en
  per schaal de grammen per onderdeel.

**Inpaklijst pakketten, per ophaalmoment, gegroepeerd per pakkettype**

- Zodat identieke pakketten in series gevuld worden (het € 20-pakket vooral). Vier
  inpakkers, alleen inpakken; doel is groei naar ~1.000 pakketten — de lijst moet dus
  ook bij 1.000 regels bruikbaar zijn (per type een totaal, dan de orders).
- Per bestelling: ordernummer, klantnaam, pakket, exacte inhoud (nu vast; later
  inclusief wissels), afvinkvakjes, controleveld.

**Etiket**

- Printer Zebra ZQ630. Etiketformaat nog open: maak de sjabloonmaat configureerbaar.
  `[BEVESTIGEN: etiketformaat]`
- Op het etiket: klantnaam, ordernummer, ophaalmoment (dag + slot), product of pakket,
  **QR-code**, Sinterklaas-opmaak, en bij alcohol een **18+**-markering voor de balie.
- Bij `reservering`: "reeds betaald € 2,50 · rest € …" op het etiket of de bon, zodat de
  balie het ziet zonder de kassa te openen.

**QR**

- Doel-URL configureerbaar, naar de Sinterklaas-editie van de Experience-app, met de
  artikel-slug én het ordernummer als parameter (zoals bij de Kerst-Box per variant):
  `{EXPERIENCE_URL}/sint?artikel=sint-bier-35&order=HB-2026-0042`. De app toont dan de
  uitleg over de vleeswaren en producten, serveertips, Instagram, website en de
  borrelspellen. Wat de app precies doet is werk in de Experience-app, niet hier.

**Klaar wanneer** het overzicht voor één ophaalmoment de grammen per onderdeel, de schalen
en bakjes toont; de inpaklijst per pakkettype groepeert; een etiket met QR uit de ZQ630
komt en de QR de juiste artikel-slug meegeeft.

---

## Wat er ná dit werk in de website-repo verandert

1. `lib/content/content.ts` — acht artikelen (plank per persoon vanaf 2, zeven pakketten
   per stuk), hub `geschenken`, 18+-tekst bij alcohol.
2. `config/schakelaars.ts` — `bier_wijn` opgesplitst in *online voor afhaal* (nu `aan`)
   en *winkelverkoop* (`aan` vanaf maart 2027); Sinterklaas als stap in `FASEN`.
3. `lib/winkel/adapter.ts` en `architect-adapter.ts` — `betaalwijze` mee in offerte en
   order; `nuTeBetalenCenten` en `restInWinkelCenten` in offerte en status.
4. Afrekenen — één keuze: "Nu alles betalen" of "€ 2,50 reserveren, rest in de winkel".

Verder niets: mand, checkout en statuspagina zijn adapter-onafhankelijk.

---

## Fase 2 — niet nu bouwen, wel ruimte voor laten

- Per fles wisselen uit maximaal drie alternatieven, worstsmaak en marmelade kiezen
  (bouwopdracht §4), met meerprijs uit de productdata ("+ € 2" / "zelfde prijs").
- Smaakwijzer "Help mij kiezen" (drie vragen, bier en wijn), nooit een fles adviseren
  die al in het pakket zit, altijd een "Hop & Bites tip" ernaast.
- Dubbele fles: bevestiging "Je hebt dit bier al gekozen. Wil je er nog één toevoegen?"
- Zakelijk: X stuks van één pakket of verdeeld over twee of drie vaste varianten.

---

## Bijlage — interne rekenbasis (nooit tonen aan klanten)

Voor het beheerscherm en het margeoverzicht. Excl. btw tenzij anders vermeld.

| Product | Inkoop excl. btw | Winkelprijs incl. btw | Btw |
| --- | --- | --- | --- |
| Lokaal bier | € 2,75 | € 4,95 | 21 % |
| Groothandel-bier (Bidfood) | ca. € 1,70 | ca. € 3,50 | 21 % |
| Hop & Bites-advies / Mr. Hop | ca. € 2,50 | ca. € 4,50 | 21 % |
| Wijn | € 7,00 | € 11,50 | 21 % |
| Droge worst 120 g (gewone smaken) | € 2,46 | € 4,95 | 9 % |
| Droge worst fazant / stier | € 2,59 | € 5,50 | 9 % |
| BBQ-amandelen | € 15/kg incl. btw | 100 g € 2,95 · 150 g € 3,95 · 200 g € 4,95 | 9 % |
| Pizza-dipcrackers 60 g | ca. € 0,55 + bakje € 0,15 | € 2,50 | 9 % |
| Marmelade (ui, dadel, mango, sinaasappel) | € 1,95 | € 4,95 | 9 % |
| Marmelade (rode peper, vijg, rode wijn) | € 2,25 | € 4,95 | 9 % |
| Geschenkdoos + vulling | € 2,00 (€ 20) · € 2,50 (€ 35) · € 3,00 (€ 50) | – | – |
| Borrelplank-verpakking (schaal, kap, bakjes, sticker) | € 2,25 klein · € 3,00 groot (incl. btw) | – | – |

Richtlijn: inkoop + verpakking ≤ ca. 65 % van de omzet excl. btw, én de losse
winkelwaarde van de inhoud ≥ de pakketprijs. Het beheerscherm mag dat per pakket
uitrekenen en rood kleuren als het niet klopt.

---

## Open punten in één lijst

- Definitieve prijs borrelplank (nu € 14,95).
- Welke bieren, wijnen en worstsmaken per slot (Mathijs vult in via de data).
- Marmeladesoort in Bier € 50 en Wijn € 50 (vast pakket, dus één soort kiezen).
- Ophaaldagen, tijdsloten, maximum per slot, besteldeadline.
- € 2,50 per order of per stuk; wat er gebeurt bij niet afhalen.
- Verkopen op inkoopplanning of pas op fysieke voorraad.
- Btw-splitsing gemengde pakketten (boekhouder).
- Etiketformaat Zebra ZQ630.
- Verdeling bij 6 personen (4 + 2 of 3 + 3).
