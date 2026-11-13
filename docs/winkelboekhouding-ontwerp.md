# Boekhouding winkel: ontwerp

Stand: 13 november 2026. Schermontwerp: https://claude.ai/artifact/WmZkgz2g4FcnKueDMG8VTm (voorbeeldcijfers).
Bouwplan: `docs/winkelboekhouding-bouwplan.md`.

## Waarom

Mathijs wil een eigen tegel voor de boekhouding van de winkel aan de Tramstraat. Zijn eis, letterlijk:
"ik sluit kassa af einde dag dan gaat systeem alles in de juiste hokjes plaatsen" en "visueel top, gewoon
lekker duidelijk". Hij noemde: kasboek, inkoop- en verkooptabellen, hardlopers en trage lopers, alles gekoppeld
aan de kassa.

De kassa (de Toonbank) schrijft al alles terug: elke bon met regels en betaalwijze, en per dag een dagstaat met
kastelling. Wat ontbreekt is het scherm dat daar boekhouding van maakt.

## Doelen

1. Na het afsluiten van de kassa staat de dag zonder handwerk in hokjes: omzet en btw per tarief, statiegeld,
   afgehaalde webshoporders, afronding. Het totaal van de hokjes is gelijk aan wat er binnenkwam.
2. Een kasboek dat de dagen aan elkaar rijgt: wat erbij kwam, wat eraf ging, wat er in de la ligt.
3. Per artikel zien wat het opbracht en wat het kostte.
4. Per levering zien wat er binnenkwam, van wie, en of de bon erbij is.
5. Zien welke producten hard lopen, traag lopen of stilliggen, met een vervolgstap.
6. Een melding en een telefoonscherm "Dag geboekt" zodra de dagstaat binnen is.

## Niet in deze ronde

- **Aansluiting met de bank** (pin-uitbetaling van myPOS en gestort kasgeld afvinken tegen het bankafschrift).
  Eerst moet op een echt afschrift te zien zijn hoe myPOS uitbetaalt. Het derde vakje op Overzicht toont daarom
  "Afgeroomd deze week", niet "Onderweg naar de bank". Dit wordt een eigen plan.
- Webshopomzet. De tegel gaat over de winkelkassa. Een afgehaalde webshoporder verschijnt alleen als het hokje
  "Webshop afgehaald". De maandstaat onder Geld → Boekhouder blijft het overzicht van alle bronnen samen.
- Winst en verlies of balans van de winkel, prijshistorie, een bon koppelen aan een uitgave uit de la.
- Iets veranderen aan de Toonbank-app of aan wat de tablet stuurt.

## Wat het nooit mag doen

- Een getal tonen dat verzonnen is. Onbekende inkoopprijs heet "Nog geen inkoopprijs"; te weinig verkoopdagen
  wordt gemeld. Een geschatte inkoopwaarde draagt zijn herkomst.
- Een groen vinkje tonen bij een dag die niet is afgesloten of niet sluit.
- Een ander getal geven dan de btw-aangifte en de maandstaat voor dezelfde dag.
- De kassa laten wachten of laten mislukken.

## Aanpakken

**A. Afleiden bij het lezen (gekozen).** De schermen rekenen elke keer uit de bonnen, de dagstaten en het
voorraadlogboek, met zuivere functies. Er komt geen tweede opslag van dezelfde cijfers. Dit is het patroon van
`src/lib/omzetMaandstaat.ts` en `src/lib/btwAangifteBronnen.ts`: één laadfunctie, dus overal hetzelfde getal.
"Automatisch" betekent dan: zodra de dagstaat binnen is, klopt het scherm; er is niets dat nog geboekt moet worden.

**B. Journaalposten wegschrijven bij het afsluiten.** Een grootboektabel die bij elke dagstaat regels krijgt,
zoals Odoo doet. Geeft een echt grootboek, maar ook een tweede waarheid naast de bonnen: komt er later een bon
binnen (status `aangevuld`), dan moet de boeking teruggedraaid en opnieuw gemaakt worden. De bonnen zijn al
onwijzigbaar en zeven jaar bewaard; een kopie voegt niets toe.

**C. Nachtelijke taak die de dag verwerkt.** Zelfde nadeel als B, plus een dag vertraging. Op Vercel Hobby
draaien geplande taken hooguit dagelijks.

Gekozen: A. Nieuwe opslag komt er alleen voor wat nog nergens staat: geld dat je zelf uit of in de la doet.

## Hoe het in de app komt

- **Werkruimte** `winkelboek` in `src/lib/navigation.tsx`, direct na Winkel. Titel "Boekhouding winkel".
  Tabbladen: Overzicht `/winkelboek`, Kasboek `/winkelboek/kasboek`, Verkoop `/winkelboek/verkoop`,
  Inkoop `/winkelboek/inkoop`, Hardlopers `/winkelboek/lopers`. Detail: `/winkelboek/dag/[datum]`.
- **Kernding:** Geld, met Product als buur. Een dag linkt naar zijn bonnen (Verkoop → Toonbank), een artikel naar
  het product in Assortiment, een levering naar de leverancier en de bon in het Bonnenkistje.
- **Eén deur:** de tegel leest en verwijst. Een kasverschil goedkeuren blijft op Verkoop → Toonbank → Dagstaten.
  De maandstaat (PDF) blijft de route `/api/boekhouder/maandstaat`; de knop "Maandstaat downloaden" roept die aan.
  Bijbestellen gaat naar de Bestellijst, afprijzen en uit het assortiment halen naar Assortiment.
- **Uiterlijk:** de rustige lijsten van de werkruimte Winkel (`src/styles/winkel.css`, `wk-*`), `HubHeader`,
  `Panel`, `KpiTegel` en `Button`. Geen nieuwe losse knoppen of vaste kleuren.
- **Periode:** één gedeelde kiezer, week of maand, in het adres (`?p=2026-W48` of `?p=2026-11`). Standaard de
  lopende week. Hardlopers kijkt altijd naar de laatste 28 dagen.

## Rekenregels

Alle bedragen in hele centen. Proefdagen (`btw_kassa_uitsluitingen`) tellen nergens mee.

### R1. De dag in hokjes

Invoer: de afgeronde bonnen van één bedrijfsdag (verkoop en tegenbon, alle tablets) en de dagstaten van die dag.

- Binnen: pin = som `pin_cents`, contant = som `contant_cents`, cadeaubon = som `cadeaubon_cents`.
- Per btw-tarief: btw = som van `btw[pct].btw_cents` (de bon-btw, nooit opnieuw afgerond);
  omzet = som `btw[pct].incl_cents` min die btw.
- Statiegeld = som `statiegeld_cents`. Webshop afgehaald = som `order_rest_cents`. Afronding = som `afronding_cents`.
- De dag **sluit** als binnen gelijk is aan de som van alle hokjes.
- Stand van de dag:
  - `geen_verkoop`: geen bonnen en geen dagstaat.
  - `open`: wel bonnen, geen dagstaat.
  - `te_controleren`: een dagstaat met status `voorlopig`; of een kas- of pinverschil zonder `goedgekeurd_at`;
    of een niet-lege `verschillen` terwijl de status niet `goedgekeurd` is; of de dag sluit niet; of er is een
    dagstaat maar een afgeronde bon valt in geen enkele dagafsluiting (`dagstaat_id` leeg).
  - `geboekt`: al het andere.

### R2. Kasboek

Het kasboek rekent met één la en loopt per dagafsluiting, op volgorde van bedrijfsdag en sluittijd. Dezelfde
kassa kan op één dag twee keer afsluiten; dan rijgen die afsluitingen aan elkaar. Per afsluiting:

- contante verkoop = `contant_verwacht_cents` − `contant_begin_cents`
- afgeroomd = `afgeroomd_cents`
- in de la erna = `contant_geteld_cents` − `afgeroomd_cents`

Een eigen regel (geld dat je zelf uit of in de la doet) heeft een moment:

- **tijdens de dag** (de kassa was open): hij verklaart het kasverschil. Onverklaard verschil =
  `contant_verschil_cents` − de som van deze regels; ze horen bij de laatste afsluiting van die dag.
- **vóór het openen**: hij komt vóór de eerste afsluiting van die dag en verklaart een verschil tussen de dagen.

Regels in het boek: beginstand (eerste afsluiting), dan per afsluiting "Contante verkoop", de eigen regels,
"Kasverschil" (alleen als het onverklaarde verschil niet nul is), "Afgeroomd" (alleen als groter dan nul). Wijkt de
beginstand van een afsluiting af van het saldo, dan komt er een regel "Tussen de dagen" met het verschil, en een
aandachtspunt. Het saldo na een afsluiting is altijd gelijk aan "in de la erna".

Aandachtspunten: een onverklaard verschil zonder goedkeuring; een verschil tussen de dagen; dagafsluitingen van
meer dan één kassa (het kasboek kent maar één la).

Het boek van een periode begint op wat er na de laatste afsluiting vóór die periode in de la lag, plus de eigen
regels sindsdien. Zo wordt ook een verschil over een week- of maandgrens heen gemeld. Is er nog nooit eerder
afgesloten, dan is de eerste telling het begin. Elke eigen regel staat in het boek, ook een van vóór de eerste
afsluiting: anders is hij bewaard maar nergens te zien of weg te halen.

Een kasverschil dat een eigen regel precies verklaart, blijft "te controleren" tot het is goedgekeurd (zelfde
regel als de maandstaat); het punt zegt er dan bij dat het verklaard is.

Konden de bonnen of dagstaten niet geladen worden, dan toont een scherm dat, en geen stand, vinkje of melding.

### R3. Verkoop per artikel

Invoer: verkoopregels (`toonbank_bon_regels.soort = 'verkoop'`) van afgeronde bonnen in de periode. Een tegenbon
telt negatief mee.

- Sleutel: `artikel_id`; bij een open prijs `open:<groep>`.
- Omzet excl. btw per artikel: per tarief de `incl_cents` optellen en één keer omrekenen:
  `incl − round(incl × pct / (100 + pct))`.
- Inkoopwaarde van een regel, per onderdeel (product) bepaald, want de kassa boekt per regel en per product:
  1. Geen onderdelen (open prijs): onbekend.
  2. Een tegenbonregel waarvan de goederen niet terugkwamen: 0. De inkoop blijft staan, alleen de omzet gaat eraf.
  3. Per onderdeel `logboek`: min de som van `waarde_cents` van de voorraadmutaties met deze
     `toonbank_bon_regel_id` en dit product, van type `verkoop_kassa` of `retour`. Is er één leeg: onbekend.
  4. Per onderdeel zonder mutatie (product nog niet geteld, of al meegeteld in een telling) `prijs_nu`:
     `aantal × hoeveelheid × inkoop_excl_cents ÷ prijs_per`. Geen inkoopprijs: onbekend.
  5. De regel is de som van zijn onderdelen. Is één onderdeel onbekend, dan de hele regel.
- Een artikel heeft een marge als al zijn regels een inkoopwaarde hebben. Marge = omzet excl. − inkoopwaarde.
  Is één regel `prijs_nu`, dan heet het artikel "geschat".
- Afdeling: het product van het artikel via `winkel_plaatsingen`; meer dan één product = "Pakketten";
  open prijs = "Open prijs"; geen plek = "Zonder afdeling".
- Periodecijfers: marge alleen over artikelen met een marge; dekking = hun omzet ÷ alle omzet.
- De officiële omzet en btw van de periode komen uit `laadToonbank` (zelfde bron als de btw-aangifte). De som
  van de artikelen kan daar enkele centen van afwijken door afronding per bon; het scherm zegt dat.

### R4. Inkoop

Invoer: voorraadmutaties van type `ontvangst` in de periode. Groeperen op dag (Nederlandse tijd van
`COALESCE(gebeurd_at, created_at)`) en leverancier (`winkel_producten.leverancier_id`; geen = "Onbekend").

- Een ontvangst ontstaat als je in Assortiment een ontvangst boekt of een levering stickert; de datum is de dag
  van inboeken. "Levering binnenmelden" alleen (een partij zonder aantal of waarde) telt niet mee.
- Bedrag = som `waarde_cents`; is er één leeg, dan is het bedrag van de levering onbekend.
- Btw is een schatting: som per regel `round(waarde × btw_pct / 100)`, en heet op het scherm "Btw, geschat".
  De echte voorbelasting komt van de bonnen en staat in de btw-aangifte; de tegel toont die niet als eigen getal.
- Bon: bonnen van dezelfde leverancier met een datum van één dag vóór tot zeven dagen na de levering.
  Eén = "Bon gevonden" met het bedrag van de bon ernaast; meer = "Meerdere bonnen"; geen = "Bon ontbreekt".
  Er wordt niets opgeslagen.

### R5. Hardlopers en trage lopers

Venster: de laatste 28 kalenderdagen. Verkoopdagen = het aantal verschillende bedrijfsdagen met verkoop daarin.
De indeling is "voorlopig" zolang de winkel nog geen 28 dagen verkoopt (geteld vanaf de eerste verkoopdag, dus
ook met sluitingsdagen wordt hij na vier weken definitief). Alleen actieve producten die los te koop zijn. Omzet en
verkocht per product alleen uit regels met precies één product (regel uit `src/lib/winkel/afdelingen.ts`).

- Een product zonder verkoop en zonder voorraad (nul, of nog niet geteld) staat in geen enkele groep.
- Ligt stil: niets verkocht en voorraad groter dan nul.
- De rest, aflopend op omzet: zolang het opgetelde aandeel vóór het product onder 80% ligt = hardloper;
  onder 95% = middenmoot; daarna = trage loper.
- Genoeg voor = voorraad ÷ (verkocht ÷ verkoopdagen), alleen bij producten per stuk. Krap = minder dan 3 dagen.
- Vervolgstap: hardloper of middenmoot en krap → Bijbestellen; trage loper → Afprijzen; ligt stil → Uit assortiment.

### R6. Melding "Dag geboekt"

Zodra een dagstaat is verwerkt, komt er hooguit één melding per bedrijfsdag in `notifications` met een link naar
`/winkelboek/dag/<datum>`. Hij verschijnt in de bel van de app. Tekst volgt de stand uit R1 op dat moment: "Alles
klopt, je hoeft niets te doen" of het aantal punten. De melding wordt ná het antwoord aan de tablet gemaakt en
mag nooit een fout geven. Geen mail en geen pushbericht in deze ronde.

## Nieuwe opslag

Eén tabel, `winkel_kas_mutaties`: organisatie, datum, bedrag in centen (niet nul; negatief = uit de la), reden
(`uitgave`, `prive`, `wisselgeld`, `overig`), omschrijving, moment (`tijdens` of `voor_openen`), wie, wanneer. Rechten zoals de Toonbank-tabellen
(`private.user_org_ids()`). De schermen werken ook als de tabel er nog niet is.

## Randvoorwaarden

- Tak `feat/winkelboekhouding` vanaf `origin/main`, in een eigen werkmap. De map waar dit document in ontstond
  stond op een oude tak.
- Bevriezing: live kan pas vanaf maandag 4 januari 2027. Geen `[noodfix]`.
- Migraties nooit met `db push`; toepassen alleen op uitdrukkelijk akkoord van Mathijs.
- De melding raakt de route van de kassakoppeling. Die stap komt als laatste, in een eigen wijziging.

## Keuzes van de schrijver, niet van Mathijs

Bij het nakijken tegen de code zijn deze keuzes gemaakt. Mathijs kan ze terugdraaien.

- Eén kassala. Bij meer dan één kassa waarschuwt het kasboek in plaats van te gokken.
- Een eigen kasregel krijgt een moment (tijdens de dag of vóór het openen), anders is wisselgeld bijleggen niet
  te onderscheiden van een kasverschil.
- Een bedrag met een punt als decimaalteken ("9.50") wordt geweigerd; bij kasgeld gokken we niet.
- Een retour zonder goederen terug laat de inkoop staan.
- De melding "Dag geboekt" komt alleen in de bel, niet per mail.
- Geen eigen getal "Voorbelasting" op Inkoop; de btw per levering heet "geschat".
- Zoeken en filteren op Verkoop lopen via het adres, zonder knoppen: het aantal losse knoppen in de app staat
  precies op het afgesproken plafond.

## Aan de bouwer

Indeling van componenten binnen `src/app/winkelboek/_components`, de precieze kolombreedtes, lege staten en
laadstaten binnen de bestaande bouwstenen, en de teksten van foutmeldingen in de toon van de app.
