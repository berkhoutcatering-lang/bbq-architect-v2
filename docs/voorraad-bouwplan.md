# Bouwplan — één voorraad voor het hele bedrijf

Opdracht: `docs/OPDRACHT-BBQ-ARCHITECT-WINKELVOORRAAD.md` (26 sep 2026).
Branch: `feat/winkelvoorraad`, gestapeld op `feat/sinterklaas-2026`. **Stacked PR: nooit mergen met `--delete-branch`.**

## 0. Stand

| Blok | Stand |
|---|---|
| W1 Twee plekken, één logboek | gebouwd, migratie live (`20260928120000`) |
| W2 De winkel vullen | gebouwd: `/voorraad/winkel`, `/voorraad/winkel/tellen` |
| W2b Voorraad toevoegen op elke manier | gebouwd: `/voorraad/ontvangst`, migraties live (`20260928140000`, `20260928140100`); mail-in wacht op het adres |
| W3 Afboeken bij inpakken | gebouwd, migratie live (`20260928120100`) |
| W4 Let op, bijna op | gebouwd, migratie live (`20260928120200`) |
| W5 Afwijkingen | gebouwd: `/voorraad/afwijking` |
| Geschenkpakketten §0, S4, S7 | gebouwd, migratie live (`20260928130000`) |
| Fase 2 en 3 | na fase 1 |

**Niet in productie tellen vóór PR #240 én deze branch gemerged zijn** (kort na elkaar).
De SQL-tests (`supabase/tests/winkel_voorraad.sql`, `winkel_inpakken.sql`) draaien op een
Supabase-branch, niet op live (besluit Mathijs, 26 sep).

## 1. Controle van §2 "Wat er al is" (26 sep)

Wat klopt: de keukenvoorraad met `stock_movements` en `increment_inventory_stock`, partijen met een QR per eenheid, de webshop die reserveert tegen `winkel_producten.voorraad` (WK009), `klaargezet_at` dat niets afboekt, Moneybird die geen webshoporders boekt, en het bestelvoorstel dat alleen voor de keuken werkt.

Wat anders is:

1. **Deze sessie begon met verouderde opdrachten** (26 sep). De actuele versies staan nu in
   `docs/`: `OVERDRACHT-BBQ-ARCHITECT-GESCHENKPAKKETTEN.md` (vervangt de Sinterklaas-versie)
   en `OPDRACHT-BBQ-ARCHITECT-WINKELVOORRAAD.md` (met W2b). De hernoeming uit §0, 6 = 3 + 3,
   de QR per doos, twee marmelades en Pizzacrackers zijn op 28 sep bijgebouwd.
2. **QR per doos (S7):** `winkel_dozen`, één rij en één onraadbare code per etiket. De QR is
   `{qr_basis_url}/g/{code}` (S7 van de overdracht; de §0-tabel noemt nog
   `/geschenk?artikel=…`, maar S7 vervangt de artikel-URL door een code per doos).
   Aan de balie: scan = opgehaald (`winkel_doos_ophalen`); de Experience-app leest met
   `GET /api/public-winkel/{slug}/doos/{code}` alleen artikel en inhoud.
3. **`winkel_order_regels` kende geen "opgehaald"**; nu `opgehaald_at` per regel (gezet als
   alle dozen gescand zijn) en per doos. `winkel_orders` kent geen `geannuleerd`: uitpakken
   (vinkje klaargezet uit) boekt retour.
4. **`voorraad_tonen` is een schakelaar op de website**, geen onderdeel van BBQ Architect.
   Voor W10 levert BBQ Architect alleen `GET …/beschikbaarheid`.
5. **De keuken rondt stil af op nul.** `increment_inventory_stock` doet `greatest(0, …)` en logt het gevraagde getal, niet wat er werkelijk afging. Dat botst met "nooit stil op nul". De keuken verbouwen we niet; overboekingen en keuken-afwijkingen krijgen een eigen functie die weigert in plaats van afrondt.
6. **Er is geen bel voor `notifications`.** De bel in `Changelog.tsx` telt nieuwe app-versies.
7. **`inventory` heeft geen `tht`, `avg_daily` of `lead_time_days` in een migratie.** De levertijd staat op `leveranciers`; `tht` en `avg_daily` bestaan live maar staan in geen SQL-bestand.
8. **Bijvangst.** De cron `ritten-vergeten` schrijft `titel` in plaats van `title` (losse taak).
9. **myPOS-ordernummer (opgelost 28 sep).** De Sinterklaas-migratie had het achtervoegsel
   van het ordernummer richting myPOS weggehaald: `HB-2026-0001-1` in plaats van
   `HB-2026-0001-1-a3f9c2`. myPOS weigert een ordernummer dat hij al kent. Zonder
   achtervoegsel botst het zodra de nummerteller opnieuw bij 1 begint, zoals op 13 sep
   gebeurde, en preview en productie delen dezelfde myPOS-testwinkel. Op live stond de teller
   op 0, er waren nog geen orders, en de Kerst-Box stond aan: de eerste Kerst-Box-betaling
   had `HB-2026-0001-1` gekregen, een nummer dat myPOS van de tests op 13 sep al kan
   kennen. Hersteld in `20260928130000`; er is in de tussentijd niets betaald.

## 2. Antwoorden van Mathijs (26 sep)

| Vraag | Antwoord |
|---|---|
| Afboeken bij inpakken of betaling | **Bij inpakken.** Vinkje "klaargezet" aan = eraf, vinkje uit = retour. |
| Drempel | **Standaard met overschrijven**: genoeg voor 5 pakketten van het artikel dat het meeste van dit product vraagt. Een eigen getal per product wint. |
| Meldingen | **"Op" en "artikel dicht" direct mailen; "bijna op" en vooruit-tekorten in één overzicht om 8:00.** Altijd ook de bel. Het adres is een nieuw veld in de webshop-instellingen. |
| Keukenbonnen (W2b) | **Ook de keuken eerst langs het controlescherm**, niet meer direct boeken. |
| Mailadres voor facturen (W2b) | Later; mail-in wordt gekoppeld zodra het adres er is. |
| Eigen maak (amandelen, marmelade, worst) | Mathijs: "keuken en winkel is eigenlijk 1, catering is een andere tak, maar ook weer niet". Zie hieronder. |
| Stil liggen | Nog niet gevraagd; standaard **180 dagen**, per plek in te stellen. |
| Wie mag een afwijking vastleggen | Nog niet gevraagd; standaard **iedereen met een login**, en de naam staat in het logboek. |

**Eigen maak — de keuze.** Er is één bedrijf met twee plekken waar spullen liggen:

- **De makerij** is waar gemaakt en bewaard wordt, voor catering én winkel. Eigen maak ontstaat daar als partij, met THT en kostprijs; dat bestaat al.
- **De winkel** is de plank waar klanten van kopen.

Wat van de makerij naar de plank gaat, is een overboeking. Catering is geen derde plek: het is een reden om uit de makerij te verbruiken, net als een event nu al. Het overzicht bovenaan de voorraadkaart (W6) telt beide plekken op, zodat Mathijs het als één bedrijf ziet.

## 3. Keuzes per blok

### W1 — Twee plekken, één logboek

**Een eigen winkel-logboek naast `stock_movements`, en voor het lezen één view die ze samenvoegt.** Een nieuw gezamenlijk logboek zou betekenen dat de keuken erop overstapt, en dat raakt `inventory` en `stock_movements`, die met de hand zijn aangemaakt en blijven zoals ze zijn. Twee tabellen, één view `voorraad_logboek` met een kolom `plek`: de voorraadkaart, het logboek per product en de maandtotalen lezen alleen die view.

- **`voorraad_plekken`:** Keuken/makerij en Winkel Tramstraat, met `stil_na_dagen` (standaard 180).
- **`winkel_voorraad_mutaties`:** de kolommen uit de opdracht, plus `tht`, `inkoop_order_id` en een unieke `idempotency_key`.
  - Types: telling, ontvangst, overboeking, verkoop_online, verkoop_kassa, retour, afwijking.
  - Redenen: eigen_gebruik, proeven, derving_breuk, derving_tht, keuken_verbruik, manko, telling_meer.
  - Een afwijking heeft altijd een reden. Manko en telling_meer komen alleen uit een telling.
- **`winkel_producten.voorraad` blijft het getal waar de webshop tegen reserveert**, maar is voortaan de som van het logboek.
  - Een trigger weigert elke wijziging van dat getal die niet uit de logboekfunctie komt. Het productformulier kan de voorraad dus niet meer overschrijven; het verwijst naar tellen.
  - De test controleert dat het getal gelijk is aan de som van de regels.
- **`winkel_muteer_voorraad`:**
  - Vergrendelt het product met `FOR UPDATE`, dezelfde rij-lock die `winkel_controleer_capaciteit` neemt.
  - Een telling krijgt het getelde getal en rekent het verschil binnen de lock uit, zodat een verkoop tijdens het tellen niet verloren gaat.
  - Onder nul geeft `WV001`. Een product dat nog niet wordt bijgehouden accepteert alleen een telling (`WV002`).
  - De waarde is `hoeveelheid × inkoop_excl_cents ÷ prijs_per`, dezelfde som als `inkoopwaardeCenten`.
- **`voorraad_overboeken`:** één transactie die de keuken zonder afronden controleert, er een `stock_movements`-regel (type `overboeking`) en een winkelregel van maakt, en de eenheden omrekent met de bestaande `eenheid_factor` (kg → gram). Kan hij niet omrekenen, dan weigert hij.

### W2 — De winkel vullen

- **`/voorraad/winkel`:** per product aanwezig, gereserveerd, beschikbaar, drempel, THT, inkoop- en winkelprijs, en per artikel "nog X pakketten te maken".
  - Een drawer per product toont het logboek en de knoppen tellen, ontvangst, overboeken en afwijking.
- **`/voorraad/winkel/tellen`:** tellen op de telefoon per schap (producttype), naar het patroon van de nulmeting.
- **Ontvangst:** aantal, inkoopprijs en THT, met een optionele koppeling aan een inkooporder.
- **Overboeken:** een keukenproduct kiezen, het aantal invullen, klaar. De koppeling blijft bewaard voor de volgende keer.

### W2b — Voorraad toevoegen op elke manier

Alle manieren maken eerst een **concept** (`voorraad_invoer` + `voorraad_invoer_regels`) en komen uit op één controlescherm, `/voorraad/ontvangst/[id]`. Pas bij **"Klopt, boeken"** boekt `voorraad_invoer_boeken` alles in één transactie: winkelregels als `ontvangst` via `winkel_muteer_voorraad`, makerijregels als `receive` via `increment_inventory_stock`. Een geboekt concept zit op slot (`WV008`); een regel zonder product of aantal houdt het boeken tegen (`WV009`).

| Manier | Hoe |
|---|---|
| Foto, meerdere foto's, pdf, e-factuur (UBL) | De bestaande bonnen-straat (`MultiFormatDropZone` → `api/bonnen/extract`). Het bestand gaat naar het bonnenarchief (voor de boekhouding), daarna ontstaat het concept. Een bestand dat al eens is ingelezen houdt de bonnen-straat tegen. |
| Barcode | Handscanner (veld) of camera (`BarcodeScanner`). Een bekende EAN telt +1; een onbekende wordt een regel zonder product, en in het scherm maak je het product aan (de EAN gaat mee). |
| Inkooporder | Bij een verstuurde bestelling: "Binnen" maakt een concept met de open aantallen. Na boeken staan de ontvangen aantallen ook op de orderregels. |
| Handmatig | Regel toevoegen op naam; het voorstel zoekt het product. |
| Doorgestuurde mail | Nog niet: wacht op het adres (vraag 8). |
| Foto van het schap | Niet in W2b: hoort bij tellen. `api/voorraad-ai` kan geen foto's lezen, dus dit wordt nieuw werk. |

**Het voorstel** (`src/lib/voorraad/invoer.ts`, puur en getest): eerst wat eerder bevestigd is (`voorraad_invoer_koppelingen`, per leverancier + regelnaam of per EAN), dan de EAN, dan de naam. Geen AI. De omrekening ("krat (24)" = 24, kg = 1000 g) leest het uit de tekst en staat zichtbaar in het scherm; bij boeken wordt de bevestigde omrekening onthouden.

**Btw:** een foto is meestal een kassabon (prijzen incl. btw), een pdf of e-factuur meestal excl. Het concept heeft daar een schakelaar voor; bij boeken wordt de inkoop excl. btw.

**Dubbel:** het scherm waarschuwt als hetzelfde factuurnummer of hetzelfde bestand al in een ander concept zit.

**De keuken** (besluit 26 sep): het bonnenvenster in de boekhouder boekt geen voorraad meer direct. De regels die "ook voor voorraad" zijn, worden een concept met een link naar het controlescherm. De knop "Factuur scannen → voorraad" op `/inkoop` opent Ontvangst.

**Niet veranderd:** de snelle aanpassing per product in `/voorraad` en de ontvangst in de lade van `/voorraad/winkel` boeken nog direct. Dat is invoer van één regel waarvan je het getal zelf typt en ziet. Moet dat ook via het concept, dan is dat een kleine aanpassing.

### W3 — Afboeken bij inpakken

- Het vinkje "klaargezet" roept `winkel_boek_regel` aan. Die boekt **netto**: doel min wat al geboekt is. Twee keer klikken doet dus niets extra, en het vinkje uitzetten boekt retour.
- Alleen op orders met status `betaald`.
- De bezetting (reservering) telt klaargezette regels niet meer mee, want die zijn al van het getal af. Niets telt dubbel.
- Afgebroken en verlopen orders tellen nu al niet mee in de bezetting; er wordt niets geboekt.
- "Opgehaald" (`opgehaald_at`) is een knop aan de balie en raakt de voorraad niet.

### W4 — Let op, bijna op

- **`voorraad_melding_staat`** onthoudt per product en soort sinds wanneer het eronder zit. Een melding komt er alleen als die rij nieuw is: één keer per keer dat het product onder de drempel zakt. De rij wordt gewist zodra het product er weer boven zit.
- **Soorten:** `voorraad_laag`, `voorraad_op`, `artikel_dicht`, `voorraad_tekort_vooruit`.
- **Kanalen:** de bel (op Vandaag en op het winkelscherm), direct mail bij "op" en "artikel dicht", en één overzicht om 8:00 via een dagelijkse cron.
- **Tijdstip van de cron (bewust gekozen):** `0 7 * * *` is UTC. Tot 25 oktober (zomertijd) is dat 09:00, daarna 08:00. De meldingen zijn vooral nodig in november en december, als er besteld en ingepakt wordt, en dan is het 08:00. Vercel Hobby rekent alleen in UTC en staat één run per dag toe.
- **Let op:** `RESEND_FROM_EMAIL` is leeg. Tot er een eigen verzenddomein is, komt mail alleen aan op het adres van het Resend-account.

### W5 — Afwijkingen

- **`/voorraad/afwijking`:** bovenaan de laatst gebruikte producten van winkel en keuken, dan zoeken. Tik op een product, tik op een reden, klaar. Het aantal staat op 1 en kan met plus en min worden aangepast.
- **Winkelproduct:** gaat via `winkel_muteer_voorraad`.
- **Keukenproduct:** gaat via `keuken_afwijking`, die weigert in plaats van afrondt en de reden in `stock_movements.reden` vastlegt.
- **Maandtotalen:** per reden in euro, uit de view `voorraad_afwijkingen_maand`.

## 4. Vragen voor de boekhouder (open)

1. Webshopomzet boeken bij betaling of bij ophalen?
2. Btw-verdeling van gemengde pakketten naar winkelwaarde — akkoord?
3. Eigen gebruik: hoe boeken (privé-onttrekking, btw-correctie)?
4. Voorraadwaarde op de balans: laatste, gemiddelde of FIFO-inkoopprijs? Tot het antwoord er is: de laatste inkoopprijs.

## 5. Werkwijze

- Per blok: migratie, dan de SQL-test in `supabase/tests/` (draait op live en draait zichzelf terug), dan pure TypeScript met vitest, dan het scherm.
- `npx tsc --noEmit`, `npm test` en `npm run build` moeten groen zijn vóór elke commit.
- Migraties draaien één voor één via `npx supabase db query --linked -f`, nooit via `db push`.
