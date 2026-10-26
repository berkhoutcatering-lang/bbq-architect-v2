# De winkel in de btw-aangifte — onderzoek en plan

*26 oktober 2026. Alleen onderzoek en plan; er is nog geen code veranderd.*

## 0. In het kort

1. **Het probleem.** De btw-aangifte in BBQ Architect telt nu drie bronnen:
   - facturen (omzet);
   - inkoopbonnen (voorbelasting);
   - sinds PR #250 (nog niet samengevoegd) ook de oude kassa (`pos_orders`).

   De webshop telt niet mee. Sinterklaas en de Kerst-Box vallen allebei in het vierde kwartaal. De Toonbank (de nieuwe kassa) telt straks ook niet mee. Zonder aanpassing is de aangifte over Q4 2026 te laag. Die moet uiterlijk 31 januari 2027 binnen zijn.
2. **De regel die ik voorstel: de omzet volgt het geld.**
   - Een webshoporder telt als omzet op de dag dat er geld voor binnenkomt, en alleen voor het bedrag dat binnenkomt.
   - Een volledig online betaalde order telt in één keer, op de betaaldag.
   - Bij een reservering telt de € 2,50 op de dag van de online betaling. De rest telt op de dag dat hij aan de balie betaald wordt.
   - Bij 'betalen bij afhalen' (Kerst-Box) telt alles op de dag van afrekenen aan de balie.

   Zo lees ik de regels voor een vooruitbetaling en voor verkoop aan particulieren. **De boekhouder moet dit bevestigen** (§7, vraag B1).
3. **De btw per tarief staat al vast**, per order en per regel, in hele centen. Niets hoeft opnieuw uitgerekend te worden. Wordt een order in delen betaald, dan verdeelt de code de btw naar rato over de delen. De delen tellen daarbij altijd precies op tot de btw van de order.
4. **Niet dubbel tellen.** De omzet van een webshoporder komt altijd uit de order zelf, nooit uit de kassabon.
   - Op een Toonbank-bon is de restbetaling van een order (`order_rest`) alleen geld, geen omzet. Zo is de Toonbank al gebouwd.
   - De Toonbank levert alleen de gewone winkelverkoop, inclusief wat er "erbij" op dezelfde bon komt.
   - Er komen controles voor de plekken waar het tóch dubbel kan gaan (§5).
5. **Wanneer bouwen?** In de deploypoort staat een bevriezing van 14 november tot en met 3 januari.
   - Het webshopdeel (fase 1) moet dus live uiterlijk woensdag 11 november (live zetten mag alleen ma–wo), of in de eerste week van januari.
   - Mijn advies: vóór 11 november. Dan zie je in december al welke orders niet kloppen, terwijl je ze nog kunt herstellen.

---

## 1. Wat er nu staat

Gecontroleerd in de code op 26 oktober 2026. De live database heb ik niet gelezen.

| Onderdeel | Waar | Stand |
|---|---|---|
| Aangifte rekenen | `src/lib/financeAnalytics.ts` `computeBtwAangifte` | Facturen in 1a/1b, bonnen in 5b |
| Eén bron voor alle aangifteschermen | `src/lib/btwAangifteBronnen.ts` (PR #250, tak `claude/unruffled-cerf-96830a`) | **Open PR.** Haalt facturen, bonnen en de oude kassa op. Afsluiten, vastzetten, /financien en het boekhouderpakket gebruiken hem allemaal |
| Oude kassa | `pos_orders` + `pos_order_items` (uit de cateringtijd, andere app) | Telt mee in PR #250 |
| Webshoporders | `winkel_orders` + `winkel_order_regels` | **Telt niet mee** |
| Toonbank-bonnen en dagstaten | `toonbank_bonnen`, `toonbank_bon_regels`, `toonbank_dagstaten` (tak `feat/ecosysteem-m2`) | Niet samengevoegd, niet live. **Telt niet mee** |
| Controles "Klopt het?" | `computeBoekhoudChecks` | Kijkt alleen naar facturen en bonnen |

**Wat PR #250 al goed regelt, en waar dit plan op voortbouwt:**
- één laadfunctie voor alle schermen;
- een kassabedrag wordt overgenomen, niet herrekend;
- een kassafout is zichtbaar en blokkeert het vastzetten, in plaats van stil € 0 te geven;
- een regel zonder 9 of 21 % komt in de lijst "handmatig verwerken".

Dit plan voegt twee bronnen toe aan dezelfde laadfunctie, en nergens anders: de webshop en de Toonbank.

---

## 2. Vraag 1: wanneer telt een webshoporder als omzet?

### 2.1 Hoe een order nu door het systeem loopt

| Betaalwijze | Online | Aan de balie | Status van de order |
|---|---|---|---|
| `volledig` | alles (myPOS) | niets | `wacht` → `betaald` na de myPOS-melding (`betaald_at`, `betaald_cents`) |
| `reservering` | € 2,50 (`nu_te_betalen_cents`) | de rest (`rest_cents`), geboekt met `rest_betaald_at` + pin/contant | `betaald` na de € 2,50 |
| `bij_afhalen` (Kerst-Box) | niets | alles is rest | `betaald` **zodra hij geplaatst is**, ook al is er nog niets betaald |

Belangrijk: **de status `betaald` betekent "het online deel is rond"**. Bij de Kerst-Box is dat online deel nul. De status zegt dus niet dat er geld binnen is. De aangifte mag daarom niet op de status rekenen, maar alleen op de betaalmomenten.

Afhalen staat los van betalen. Een regel krijgt `opgehaald_at`. Een order kan ook over twee dagen worden afgehaald.

### 2.2 Drie mogelijke regels

| Regel | Wat telt wanneer | Nadeel |
|---|---|---|
| A. **Het geld** (voorstel) | elk bedrag op de dag dat het binnenkomt | De btw moet over de € 2,50 en de rest verdeeld worden. Dat is rekenwerk voor de code, niet voor jou |
| B. Het afhalen | de hele order op de afhaaldag | Een betaalde order die nooit is afgehaald, telt nooit mee. Een vooruitbetaling hoort volgens mij op het moment van ontvangst |
| C. De besteldag | de hele order bij het plaatsen | Een Kerst-Box zonder betaling telt dan al mee, en een geannuleerde moet weer terug |

**Waarom A.**
- Bij verkoop aan particulieren is de btw voor zover ik weet verschuldigd bij de levering (het afhalen). Een vooruitbetaling is volgens mij verschuldigd op het moment dat het geld binnenkomt.
- Aan de balie vallen betalen en afhalen samen. A geeft dan dezelfde uitkomst als "bij levering", plus de juiste behandeling van wat vooruit betaald is.
- A werkt bij het kasstelsel én bij het factuurstelsel. Alleen bij een order die is afgehaald zónder betaling verschillen ze. Dat mag niet gebeuren, en daar komt een controle voor (§5).

Dit is mijn lezing, geen advies. Daarom staat het als eerste vraag in de brief aan de boekhouder (§7).

### 2.3 Regel A per geval

| Geval | Telt als omzet | Op welke dag (Nederlandse tijd) |
|---|---|---|
| Volledig online betaald | het hele bedrag | `betaald_at` |
| Reservering: € 2,50 betaald | € 2,50, met zijn deel van de btw | `betaald_at` |
| Reservering: rest betaald aan de balie | de rest, met de rest van de btw | `rest_betaald_at` |
| Reservering: nooit afgehaald, rest nooit betaald | alleen de € 2,50 | — |
| Bij afhalen: afgerekend | het hele bedrag | `rest_betaald_at` |
| Bij afhalen: nooit gekomen | niets | — |
| `wacht`, `afgebroken`, `verlopen` | niets | — |
| `mislukt` (betaald, maar de plek was vol, geld moet terug) | niets, wel een controle zolang het terugbetalen niet gelukt is | — |
| `geannuleerd` | niets, wel een controle als er al geld binnen was | — |

**Een kwartaalgrens in het midden** (€ 2,50 op 30 september, rest op 2 oktober) gaat vanzelf goed. Elk deel valt in zijn eigen kwartaal, en samen zijn ze precies de order.

---

## 3. Vraag 2: waar staat de btw per tarief, en hoe voorkom je dubbeltellen?

### 3.1 Wat er per order vastligt

- **Per regel:** `winkel_order_regels.btw_cents`, bijvoorbeeld `{"9": 312, "21": 424}`. Dit wordt bij het plaatsen uitgerekend door `btwVerdeling`:
  - eerst het bedrag verdeeld over de tarieven, naar rato van de winkelprijs van de onderdelen, of zoals ingesteld op het artikel;
  - dan per deel de btw (`btwDeel`, afgerond op hele centen).

  Bij oude regels is dit veld leeg; dan staat alles op `btw_pct`.
- **Per order:** `winkel_orders.btw_cents`. Dit is de som van de regels plus de btw over de verzendkosten.
- **Verandert het nog?** Alleen bij de Kerst-Box, via "aantal aanpassen" (`wijzigKerstAantal`). Dat rekent de order opnieuw door met dezelfde code. Na betaling aan de balie of na inpakken weigert het scherm. Op het moment van betalen ligt het bedrag dus vast.

### 3.2 Wat ontbreekt

- **De omzet zonder btw per tarief** ligt niet vast, alleen de btw. Voor een regel met één tarief is dat geen probleem: bedrag min btw.
  - Bij een gemengd pakket (bier en worst) is de verdeling van het bedrag over 9 % en 21 % niet opgeslagen. Terugrekenen uit de btw kan, maar met een paar cent onzekerheid per regel. De btw zelf blijft exact.
  - Voorstel: een kolom erbij die bij het plaatsen meteen het bedrag per tarief bewaart (`btwVerdeling` rekent het al uit en gooit het nu weg). Voor oude orders rekent een script het éénmalig terug, met de herkomst erbij ("teruggerekend").
- **Het btw-tarief van de verzendkosten** staat niet op de order, alleen in de instellingen. Verzenden staat nu uit, dus dit speelt nog niet. Voorstel: het tarief bij het plaatsen op de order zetten. Een order met verzendkosten en zonder tarief komt in "handmatig verwerken".

### 3.3 De btw verdelen over de € 2,50 en de rest

Alles in hele centen, door de code:

1. Per tarief het deel van de order: het bedrag per tarief en de btw per tarief (§3.1).
2. Het online deel (de € 2,50) krijgt per tarief een evenredig deel, afgerond op hele centen.
3. **De rest is wat overblijft**: order min online deel, per tarief.

Zo tellen de twee delen samen altijd precies op tot de order, zonder centverschil. Het bedrag dat echt online binnenkwam, is `betaald_cents`. Wijkt dat af van `nu_te_betalen_cents`, dan volgt een controle.

### 3.4 Dubbeltellen voorkomen

De omzet van een webshoporder komt **alleen uit `winkel_orders`**, nooit uit een kassabon:

- **Toonbank:** de restbetaling staat op de bon als regel `order_rest`. Die regel zit niet in `omzet_incl_cents` en niet in de btw van de bon. Dat is al zo gebouwd (`toonbank_bonnen`, tak m2). Bij het afhalen zet de Toonbank `rest_betaald_at` en `rest_bon_id` op de order. Daaruit telt de aangifte de rest.
- **Rest geboekt in BBQ Architect** (knop "Rest boeken", `winkel_boek_rest`): zelfde kolom `rest_betaald_at`, geen bon. Ook één keer geteld.
- **Waar het tóch dubbel kan gaan**, en wat ertegen helpt:

| Risico | Tegenmaatregel |
|---|---|
| Iemand tikt de Kerst-Box aan de toonbank aan als gewone verkoop, in plaats van via "afhalen" | Controle: een Toonbank-verkoopregel van een artikel dat alleen vooruit besteld wordt (`kerst-box` e.d.) |
| De rest wordt afgerekend op de oude kassa (`pos_orders`) én in BA geboekt | Vraag M3: welke kassa gebruik je tot de Toonbank er is? Controle: een dag met bonnen in de oude kassa én in de Toonbank |
| Een zakelijke klant vraagt een factuur voor een webshoporder of een bon | Vraag M4. Zo'n factuur mag niet nóg eens als omzet tellen. Dan komt er een verwijzing van de factuur naar de order of bon, en de aangifte slaat hem over |
| De Toonbank meldt een restbetaling die BA al had (`rest_dubbel`) | Bestaat al: de bon komt in "Te controleren". De aangifte telt de order één keer; de controle blijft open tot hij is opgelost |

---

## 4. Vraag 3: de Toonbank-omzet erbij

### 4.1 Uit de bonnen, niet uit de dagstaat

Het kassaplan (§4.11) laat de keuze open en heeft een voorkeur voor de bonnen. Ik kies ook de bonnen:

- `toonbank_bonnen.btw` heeft per tarief `incl_cents` en `btw_cents`, afgerond per bon. De dagstaat telt die op zonder opnieuw af te ronden. De bonnen en een kloppende dagstaat geven dus hetzelfde.
- Een bon is nooit meer te wijzigen. Een dagstaat kan "voorlopig" zijn, of nog niet afgesloten.
- Een bon die ná de dagafsluiting binnenkomt (offline verzendbak), staat wel in de bonnen.

**Wat telt:**
- bonnen met status `afgerond`, soort `verkoop`, en ook `tegenbon` (een retour, met negatieve bedragen);
- per tarief de omzet zonder btw (`incl_cents − btw_cents`) en de btw;
- dag: `bedrijfsdag`. Een avond die na middernacht doorloopt, blijft dan één dag.

**Wat niet telt:** geannuleerde bonnen, statiegeld (buiten de btw), `order_rest` (zie §3.4) en, als hij er komt, de verkoop van een cadeaubon (kassaplan §4.7).

**De dagstaat wordt de controle:** zie §5.

### 4.2 Drie kassa's na elkaar

| Periode | Kassa | Bron in de aangifte |
|---|---|---|
| Cateringtijd tot nu | oude kassa | `pos_orders` (PR #250) |
| Vanaf 21 november | Toonbank (route B uit het kassaplan), of iets anders als dat niet lukt | `toonbank_bonnen` |
| Altijd | webshop | `winkel_orders` |

Ze worden gewoon opgeteld. Elke bron krijgt in het aangiftescherm een eigen regel, zodat je ziet waar de omzet vandaan komt.

### 4.3 Zolang de Toonbank niet live is

De Toonbank-tabellen bestaan op live nog niet. De laadfunctie onthoudt daarom twee dingen apart:
- **"Toonbank nog niet aangesloten"**: de tabel bestaat niet. Dat is geen fout.
- **"Toonbank niet te lezen"**: de tabel bestaat wel, maar het lezen faalt. Dat is een fout, en vastzetten wordt dan geweigerd.

Zo wordt een ontbrekende tabel nooit stil € 0 zodra de Toonbank wél draait.

---

## 5. Vraag 4: de controles in "Klopt het?"

### 5.1 Wat moet weten dat dagomzet geen factuur heeft

- De vier bestaande controles gaan **alleen over facturen en inkoopbonnen**. Zo blijft het:
  - btw-tarief op elke factuur;
  - unieke factuurnummers;
  - geen concepten;
  - bonnen gecategoriseerd.

  Webshoporders (`HB-2026-0001`) en kassabonnen (`T1-000123`) hebben geen factuurnummer, en dat hoeft ook niet bij particulieren. Ze komen dus niet in die controles. De teksten krijgen het woord "facturen" erbij, zodat niemand denkt dat de winkel ontbreekt.
- Er komt geen controle "omzet zonder factuur" voor winkel of webshop.
- Een factuur die naar een webshoporder of bon verwijst, telt niet als omzet (§3.4). Wel controleert de code of het bedrag gelijk is aan de order of de bon.

### 5.2 Nieuwe controles

"Fout" blokkeert het vastzetten tot jij het bewust accepteert, net als de open punten in PR #250. "Let op" blokkeert niets.

| Bron | Controle | Soort |
|---|---|---|
| Webshop | Afgehaald, maar de rest is niet betaald (dit kan nu bij de Kerst-Box: kassaplan §4.12, gat 1) | fout |
| Webshop | Geannuleerd of mislukt terwijl er geld binnen was, en niet (gelukt) terugbetaald | fout |
| Webshop | Online ontvangen (`betaald_cents`) wijkt af van wat er betaald moest worden | let op |
| Webshop | Btw van de order is niet gelijk aan de som van de regels (plus verzending) | fout |
| Webshop | Verzendkosten zonder vastgelegd btw-tarief | fout (handmatig) |
| Webshop | Gemengd pakket waarvan de omzet per tarief is teruggerekend (§3.2) | let op, eenmalig voor oude orders |
| Toonbank | Kassameldingen met `fout`, `conflict` of te lang `wacht` in de periode: bonnen zijn misschien niet verwerkt, dus omzet ontbreekt | fout |
| Toonbank | Een dag met bonnen maar zonder dagstaat, of een dagstaat die `voorlopig` of `aangevuld` is en niet goedgekeurd | let op; fout bij vastzetten |
| Toonbank | Dagstaat volgens de tablet wijkt af van de narekening uit de bonnen | let op (bestaat al in de dagstaat; hier alleen doorgeven) |
| Toonbank | `order_rest` op een bon zonder geboekte rest op de order, of andersom | fout |
| Toonbank | Gat in de bonnummering | let op |
| Toonbank | Verkoopregel van een artikel dat alleen vooruit besteld wordt | let op |
| Oude kassa + Toonbank | Dezelfde dag bonnen in allebei | let op |
| Alle | Een tarief dat niet 9 of 21 is | staat al in "handmatig verwerken" |

---

## 6. Wat er in de code verandert

### 6.1 Volgorde

| Fase | Wat | Wanneer | Hangt af van |
|---|---|---|---|
| 0 | PR #250 samenvoegen, de twee migraties daarvan draaien. PR #247 (Kerst-balie: betalen afdwingen) afmaken, ook voor de Toonbank-versie van `winkel_order_ophalen` | nu | jou |
| 1 | **Webshop in de aangifte** + de webshopcontroles + per bron op het scherm + tests | live uiterlijk wo 11 november, anders week 1 januari | fase 0 |
| 2 | **Toonbank in de aangifte** + de Toonbank-controles | zodra m2 samengevoegd is en de `toonbank_*`-tabellen live staan | kassaplan route B |
| 3 | Dezelfde bronnen ook in winst en verlies, de balans en het boekhouderpakket. Daarna de boekingen per dag, zodra de boekhouder het schema heeft bevestigd | januari | antwoord boekhouder |

Waarom fase 3 apart: `computeResultatenrekening` en `computeBalans` (scherm /financien) tellen nu ook alleen facturen. De winst en de btw-positie daar zijn dus ook te laag. Dat raakt de aangifte niet, maar het hoort er wel bij.

### 6.2 Voor de bouwer (fase 1 en 2)

- **`src/lib/btwAangifteBronnen.ts`:** `laadWebshop` en `laadToonbank` naast `laadKassa`. Alles in dezelfde `laadAangifteBronnen`, nooit in een losse route (afspraak uit PR #250).
  - Webshop: orders met `betaald_at` óf `rest_betaald_at` in een ruim venster ophalen, daarna per Nederlandse kalenderdag filteren (`nlDatum`).
  - Let op: `winkel_orders` heeft `organization_id`, de oude kassa `org_id`.
  - Alle pagina's ophalen (`alles`).
- **`src/lib/financeAnalytics.ts`:**
  - `KassaRegel` wordt een algemene `OmzetRegel` met `bron: 'kassa_oud' | 'webshop' | 'toonbank'`.
  - `rubrieken.kassa` wordt `rubrieken.per_bron`. `kassa` blijft bestaan voor de schermen en de vastgezette aangiftes van vóór deze wijziging.
  - `computeBoekhoudChecks` krijgt de extra bronnen mee als argument en blijft zuiver (geen database).
- **Verdeelfunctie voor deelbetalingen:** zuiver, in hele centen, naast `btwVerdeling` in `src/lib/winkel/rekenen.ts`, met tests.
- **Migratie (fase 1, klein):** bedrag per tarief op `winkel_order_regels`, en het verzendtarief op `winkel_orders`. Vullen in `winkel_plaats_order` en in `wijzigKerstAantal`. Een script dat oude orders terugrekent, met de herkomst erbij. Toepassen: één tegelijk met `npx supabase db query --linked -f`, nooit `db push`.
- **Vastzetten** (`/api/financien/btw-aangifte` POST): nieuwe open punten:
  - webshop of Toonbank niet te lezen;
  - onverwerkte kassameldingen;
  - niet-goedgekeurde dagstaten.

  `meta` krijgt het aantal orders en bonnen per bron.
- **`scripts/btw-kwartaal-controle.ts`** (`npm run btw:controle`): per bron de totalen. Daarnaast een SQL-narekening op live: per kwartaal de som van de btw van alle orders met geld binnen, tegen wat de code toerekent.
- **Tests:**
  1. volledig betaald;
  2. € 2,50 in november + rest in december;
  3. € 2,50 en nooit gekomen;
  4. Kerst-Box aan de Toonbank met "iets erbij" op de bon: order één keer, het extraatje één keer;
  5. gemengd pakket in twee delen: tot op de cent gelijk;
  6. kwartaalgrens in het midden;
  7. geannuleerd na betaling;
  8. tegenbon;
  9. Toonbank-tabel ontbreekt tegenover Toonbank-fout.

Alle bedragen en alle btw rekent de code. Er zit geen AI in deze keten.

---

## 7. De brief aan de boekhouder

Het concept staat in de bedrijfsmap: `10 Projecten digitaal/Kassa (Toonbank)/Correspondentie/2026-10-02 - concept - boekhouder - dagstaat en boekingsschema.md`. Hij is nooit verstuurd en loopt achter:
- er staat nog een opening op 1 maart in;
- de dagstaat staat erin voor februari;
- antwoord "vóór half januari" is te laat om nog iets in de Q4-aangifte te veranderen.

Vraag 2 in de brief ("wanneer is een webshoporder omzet?") is precies vraag B1 hieronder.

**Voorstel voor de bijgewerkte brief.** Ik heb het bestand niet aangepast; jij beslist (vraag M1).

- **B1. Moment van omzet.** Klopt "de omzet volgt het geld" (§2.2)? Zo telt een vooruitbetaling op de dag van ontvangst, en de rest op de dag van afrekenen aan de balie. Geldt dat ook voor ons stelsel? Werken wij met het factuurstelsel of het kasstelsel?
- **B2. De € 2,50 reservering.** Is dit een vooruitbetaling op de order (zo is hij gebouwd: hij gaat van het totaal af), met de btw naar rato van 9 % en 21 % van die order? En als de klant niet komt en de € 2,50 vervalt: blijft dat omzet?
- **B3. Pakketten met 9 % en 21 %.** Akkoord met de verdeling naar de winkelprijs van de onderdelen? Dit staat al in de brief.
- **B4. Restbetaling als geld, niet als omzet.** Staat al in de brief. Hoe boek je de ontvangst? Op een tussenrekening "vooruitontvangen", of rechtstreeks?
- **B5. Online betalingen via myPOS.** myPOS houdt kosten in vóór de uitbetaling. Boeken we de omzet op het bedrag dat de klant betaalde, en de kosten apart? Dat is de opzet in de code.
- **B6. Terugbetalen.** Als we geld terugbetalen voor een geannuleerde of dubbele order: in het kwartaal van terugbetalen corrigeren, of in het kwartaal van de oorspronkelijke omzet?
- **B7. Factuur voor een webshoporder of bon** aan een zakelijke klant: is dat een kopie bij de bestaande omzet, of moet de omzet dan via de factuur lopen?
- **B8. Cadeaubon als meervoudige waardebon:** geen btw bij verkopen, wel bij inwisselen. Dit staat in het kassaplan §4.7 en nog niet in de brief.
- **B9. Afronden in de aangifte.** Wij rekenen in centen. Is het goed als het scherm het totaal per rubriek laat zien en jij in de aangifte op hele euro's afrondt?

---

## 8. Vragen aan Mathijs

Niet ingevuld. M1 en M2 eerst, want de rest hangt eraan.

- **M1. Wie beantwoordt de brief?**
  - BBQ Architect vervangt de accountant. Q3 heb je zelf ingediend.
  - Is er nog een boekhouder of adviseur aan wie je de bijgewerkte brief stuurt? Of bel je zelf de BelastingTelefoon met B1 en B2?
  - Mag ik het concept in de bedrijfsmap bijwerken met de vragen uit §7? Versturen doe jij.
- **M2. Planning.**
  - Mag fase 1 nog vóór de bevriezing live, dus uiterlijk woensdag 11 november (deploydagen ma–wo)?
  - Of liever in de eerste week van januari? Dan zie je de webshopcontroles pas na de kerst.
- **M3. De kassa vóór de Toonbank.**
  - Welke kassa gebruik je aan de balie zolang de Toonbank niet live is: de oude kassa, alleen de myPOS los, of iets anders?
  - Waar boek je de restbetaling van een Sinterklaas- of Kerst-order: met "Rest boeken" in BBQ Architect, of óók op een kassa? Op een kassa erbij telt hij dubbel.
- **M4. Facturen voor winkelklanten.** Vragen zakelijke klanten om een factuur voor een webshoporder of een aankoop in de winkel? Zo ja, dan bouw ik de verwijzing van factuur naar order of bon (§3.4).
- **M5. Oude kassa.**
  - In de oude kassa bestaan ook orders met bron 'online'. Waren dat bestellingen via een oude webshop, en zijn die gestopt?
  - Komen ze ergens ook als `winkel_orders` voor? Dan tellen ze dubbel.
- **M6. Terugbetalen.** Betaal je bij een geannuleerde Sinterklaasorder het geld terug, of vervalt het? Moet de reservering van € 2,50 terug als de klant niet komt? De webshop heeft nu geen status "terugbetaald" na een gewone betaling.
- **M7. Live controleren.**
  - Mag ik `npm run btw:controle` en een alleen-lezen narekening op live laten draaien? Die wijzigt niets.
  - In een eerdere sessie werd lezen op productie geweigerd. Dan draai jij hem zelf in de terminal.
- **M8. Verzenden.** Verzenden staat uit. Blijft dat zo voor Sinterklaas en kerst? Dan hoeft het verzendtarief op de order (§3.2) niet vóór 11 november.

---

## 9. Bronnen

- **Code op `main` (26 oktober 2026):**
  - `src/lib/winkel/rekenen.ts` (`btwVerdeling`, `btwDeel`, `berekenOfferte`);
  - `src/lib/winkel/types.ts` (`Betaalwijze`);
  - `src/app/verkoop/kerst/actions.ts` (`wijzigKerstAantal`, `zetKerstGeannuleerd`);
  - `src/lib/financeAnalytics.ts`.
- **Migraties:**
  - `20260913120000_winkel_kassa.sql`;
  - `20260927120000_winkel_sinterklaas.sql` (btw per regel, betaalwijze, `winkel_boek_rest`);
  - `20261005110000_kerst_bestellingen.sql` (`bij_afhalen`, `geannuleerd`);
  - `20261005120000_winkel_order_ophalen.sql`.
- **PR #250**, tak `claude/unruffled-cerf-96830a`: `src/lib/btwAangifteBronnen.ts`, de afsluiten-route, de aangifte-route.
- **PR #247**, tak `claude/kerst-balie-betalen-18plus`: migratie `20261013120000_kerst_betalen_bij_afhalen.sql`.
- **Tak `feat/ecosysteem-m2`:** `20261007120000_toonbank_bonnen.sql`, `20261007130000_toonbank_afhalen_dagstaten.sql`.
- `scripts/deploypoort.mjs`: de bevriezing van 14 november tot en met 3 januari.
- **Plannen:**
  - `docs/context/kassa-plan.md` §4.11–4.12 en §9 (tak `docs/kassa-plan`, niet gepusht);
  - `docs/context/winkel-tramstraat.md` §6.2–6.3 en §7.11 (tak `feat/catalogus-op-main`).
- **Bedrijfsmap:** `Kassa (Toonbank)/Correspondentie/2026-10-02 - concept - boekhouder - dagstaat en boekingsschema.md`.
