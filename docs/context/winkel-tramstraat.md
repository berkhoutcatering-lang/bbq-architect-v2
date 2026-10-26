# Hop & Bites — De winkel aan de Tramstraat

**Contextdocument voor Claude Code — BBQ Architect ombouwen naar winkelsoftware**
Versie 1.0 · 26 oktober 2026 · opgesteld door Mathijs Berkhout (eigenaar)

---

## 0. Instructie aan Claude Code — lees dit eerst

1. **Sla dit bestand op als `docs/context/winkel-tramstraat.md`** in de repo van BBQ Architect.
2. **Zet in `CLAUDE.md` een vaste verwijzing**, bijvoorbeeld:
   > Het bedrijf draait vanaf november 2026 primair op de winkel aan de Tramstraat 13 in Schoonoord. Lees `docs/context/winkel-tramstraat.md` vóór elke taak die raakt aan producten, voorraad, kassa, bestellingen, inkoop, mail of rapportage. Bij twijfel gaat dit document vóór oudere catering-aannames in de code.
3. **Dit document beschrijft het bedrijf, niet de code.** Check altijd eerst wat er in de codebase al bestaat (tabellen, hubs, API-routes) voordat je iets nieuws bouwt. Hergebruik waar het kan, en zeg het als iets uit dit document botst met wat er al staat.
4. **Catering niet slopen.** De cateringmodules blijven bestaan maar gaan naar de achtergrond. Catering komt later terug als uitbreiding (zie §9).
5. **Bouw in kleine stappen.** Mathijs bouwt stukje bij beetje. Stel per module een plan voor, laat het goedkeuren, bouw dan pas.
6. **Wanneer iets in dit document als "open punt" of "aanname" staat: niet invullen, maar vragen.**

---

## 1. Wat er verandert

Hop & Bites begon in april 2026 als premium cateringbedrijf (bruiloften, 50e verjaardagen, grotere familiefeesten, live cooking op de Yoder). BBQ Architect is daarvoor gebouwd: aanvraag → offerte → event → menu → bestellijst → kookplanning → servicebord → factuur → bon → btw-aangifte.

**Op 5 oktober 2026 is besloten:** de catering gaat 100% uit, alle focus gaat naar de winkel. Mathijs doet het zelf, zonder mede-eigenaar. Catering komt pas terug als uitbreiding zodra de winkel loopt.

Daarmee verandert de kern van de software:

| Was (catering) | Wordt (winkel) |
|---|---|
| Eén klant, één event, één factuur | Veel kleine verkopen per dag aan de toonbank |
| Menu per event, inkoop per klus | Vast assortiment, doorlopende voorraad |
| Productie voor een datum | Productie in weekbatches voor de vriezer |
| Offerte en akkoord | Kassabon, pin, contant, pre-orders |
| Gasten per klus | Bonnen per dag, omzet per openingsuur |

**Kernzin van het bedrijf:** het pand is geen winkel die toevallig een keuken heeft, maar een productiebedrijf met een winkel ervoor.

---

## 2. Het pand — Tramstraat 13, Schoonoord

Voormalige slagerij (eerst van oud-slager Jan Knol, daarna van Iwan Veerbeek, eigenaar van Veerbeek Uw Slager in Emmen, nu verhuurder). Ligt in het dorpscentrum tussen PLUS Boezen (nr. 17), Jor's Molenzicht (19) en Pizzeria Napoli (21). Grote PLUS-parkeerplaats op een paar meter.

**Ruimtes (relevant als vaste locaties in de software):**

| Ruimte | Afmeting / inhoud | Gebruik |
|---|---|---|
| Winkel | meerdere grote gekoelde vitrines, ruimte voor droge stellingen | verkoop, toonbank, kassa |
| Doorloopkoelcel | 2,50 × 1,20 m, twee deuren (winkel én productie) | aanvullen zonder door de winkel te lopen |
| Koelcel | 2,20 × 3,15 m, h 2,05 m | koelvoorraad |
| Vriescel | 1,85 × 2,45 m, h 2,05 m, stellingen | diepvriesvoorraad (was defect, reparatie door verhuurder) |
| Productiekeuken | Rational, oven, vaatwasser, vacumeermachine, werkbanken, slagerij-apparatuur | eigen productie |
| Kantine (~16 m²) | kantoor, administratie, vaste fotohoek | laptopwerk, foto's |
| Opslag 1 | ca. 2,5 × 6 m met stellingen | droge voorraad |
| Opslag 2 | ca. 2 × 3,5 m | droge voorraad / verpakking |
| Twee garageboxen, schuurtjes | — | o.a. Kopa-smoker op wielen |

Extra vriescapaciteit: een Foster-vriezer en twee eigen vrieskisten van 500 liter. Wijn komt in een aparte klimaatkast in de winkel.

**Gedeeld gebruik:** de verhuurder gebruikt eens per twee weken één dagdeel de kookketel en klimaatkast (gehaktballen). Hij heeft daarnaast op vrijdagmiddag de winkel open voor afhaalklanten die in Emmen bestelden. Houd hier rekening mee in de planning van de keuken en de winkel.

---

## 3. De winkel

**Opening:** zaterdag 21 november 2026, 10:00–16:00.
**Vaste openingstijden daarna:** woensdag, vrijdag en zaterdag, 8:30–16:30. Op woensdag is er markt in Schoonoord; plan is een kippengrill buiten voor de deur.
**De rest van de week:** produceren, inkopen, administratie, content, pre-orders klaarzetten.

**Bezetting:** Mathijs alleen, ongeveer 60 uur per week in de opstart. Later mogelijk iemand op zaterdag, en bij pieken (kerst) familie die meehelpt. **De kassa moet daarom te bedienen zijn door iemand die er één dag staat** — geen training nodig.

**Concept:** een moderne foodshop rond de vraag *"iets lekkers voor vanavond"*. De usp is **kant-en-klaar BBQ-vlees van de smoker**, plus advies over bier en wijn, een beetje kaas, borrel en slagersbasis. Concurreert niet op prijs maar op kwaliteit en beleving. Grootste concurrent: de supermarkt.

**Leidend principe:** de winkel draait op **diepvries en lang houdbaar**. Echt vers doet hij in de opstart bijna niet (dat vraagt vaste handen die er nu niet zijn). Groot aanbod online, relatief klein aanbod fysiek in de winkel, vanwege derving.

**Toonbank als showmodel:** in de vitrine ligt één showexemplaar of een beeld met uitleg; de klant krijgt een bevroren, gevacumeerd pakket mee met een sticker (product, gewicht, THT). Er wordt vooraf verteld dat het diepvries is en waarom.

**Belangrijk voor de software:** er komt **geen geijkte weegschaal** bij de kassa. Alles wordt verkocht **per stuk of per vast pakket** met een vaste prijs. Er zijn dus geen weegartikelen aan de kassa. (Open punt: kaas — zie §11.)

**Referentie uit het verleden (aannames van de vorige slager, geen kassadata):** 35–50 bonnen op een doordeweekse dag, 75–150 op zaterdag, in de zomer meer; gemiddelde bon ca. €22; 50–80 maaltijden per week. Dit is **niet betrouwbaar** en dient alleen als orde van grootte.

**Seizoenen:** zomer (april–september) draait op broodjes, kip, BBQ-pakketten, passanten, campinggasten, fietsers en Pieterpad-wandelaars. Winter (oktober–maart) op diepvries, pakketten, kerst en cadeaus.

---

## 4. Het assortiment

Elk product ligt er om een reden. Niets is ingekocht omdat het goedkoop was.

### 4.1 Productgroepen

| Groep | Voorbeelden | Herkomst | Opslag | Indicatie marge |
|---|---|---|---|---|
| **BBQ-vlees van de smoker** (kern) | pulled pork, pulled chicken, buikspek, spareribs per rack, rendang, pastrami, smokey chicken, wings, pulled brisket, burnt ends | eigen productie | diepvries, vacuüm | ruim boven 50% |
| **Stoofproducten** | rendang (alleen vlees), mogelijk stoofvlees met ~30% groente | eigen productie | diepvries | — |
| **Diepvriessauzen** (idee) | pastasaus/bolognese voor 4 personen, alleen saus | eigen productie | diepvries | nog uit te werken |
| **Worst en charcuterie** | droge worst appel & calvados, peper & jeneverbes, bockbier & mosterd; nagelhout; grillworst, rookworst; ingekochte hammetjes | grotendeels eigen productie; hammetjes ingekocht | koel / deels diepvries | worst ~80% |
| **Slagersbasis** | slavinken, gehaktballen, verse worst, burgers, schnitzels, gehakt, broodbeleg, en zijn maaltijden | Iwan Veerbeek, MAP-verpakt per 2 of 4 | koel | ~20% |
| **Kaas** | een paar soorten; later mogelijk eigen gerookte kaas | Kaaspakhuis Emmen (beoogd) | koel | ~30% (schatting) |
| **Noten** | een paar mixen, BBQ-amandelen | NOIX Notenatelier | droog | — |
| **Rubs & salts** | Down Under Rubs & Salts | ingekocht | droog | 31% op hun webshopprijs |
| **Eigen sauzen** | BBQ-saus (zonder worcestershire, dus vegetarisch), White Alabama | eigen productie | koel/diepvries | open punt: pH/NVWA bij verkoop |
| **Crackers, zuren, droog** | "leuke crackers, geen supermarktbende", zuur (mogelijk Kesbeke) | ingekocht | droog | — |
| **Speciaalbier** | 20–30 vaste bieren + wisselaars; ca. 3 alcoholvrij/-arm waaronder één 0.0 | diverse brouwerijen/groothandels | droog | richting 60% |
| **Wijn** | huiswijn wit/rood ~€8, flessen €10–12, €20, €30, één of twee uitschieters ~€50 (champagne, port) | Well of Wine e.a. | wijnklimaatkast | ~25% |
| **Zoetlijn** (later) | cookie (mini/medium/big uit hetzelfde deeg), brownie, salted caramel | eigen productie, rauw ingevroren deeg, kleine bakmomenten | diepvries | — |
| **Koffie** (later, open) | klein assortiment | — | — | machine nog niet gekozen |

**Wat er bewust níet in komt:** losse salades (alleen als component in pakketten), bitterballen, burgers als los artikel, amuses, gesneden brisket, brood (behalve iets heel speciaals zoals lángos — de bakker naast de winkel blijft een vriend). Maaltijdboxen pas in jaar 2.

**Twijfelgevallen testen met samples:** bijvoorbeeld smoked meatloaf — wie bestelt krijgt een plak mee; bij goede reacties komt het op de kaart.

### 4.2 Samengestelde producten (stuklijsten)

Deze producten bestaan uit componenten uit de eigen voorraad. De software moet ze als **samengesteld product** kunnen voeren, met afboeking van de componenten.

- **Drie BBQ-pakketten:** het Hop & Bites-pakket, het Texas-pakket, en een basis vegapakket (nog te bedenken).
- **Eén borrelplank:** de Hop & Bites-plank, vast assortiment, schaalbaar, met vega-opties.
- **Drie hapjes-/borrelconcepten voor afhaal (zonder kok), op afspraak, een week vooraf:** uitgebreid warm & koud, simpeler warm & koud, alleen koud.
- **Boxen:** geschenkbox (kan alles uit de winkel bevatten), borrelbox (grondstoffen om zelf planken te maken), Pit & Rook (sauzen en rubs, ook als uitbreiding op een BBQ-pakket), Drenthe-bieravond (lokaal bier en eten), vaderdagbox met QR.
- **Bierpakketten:** op afspraak, maar ook direct aan de toonbank samen te stellen met producten uit de winkel (bijvoorbeeld twee droge worsten erbij), in een Hop & Bites-doos.
- **Seizoen:** Kerst-Box (§6.3), Sinterklaas-pakketten (zeven pakketten: bier €20/€35/€50, wijn en bier & wijn €35/€50, alleen ophalen aan de Tramstraat).

**Combideals zijn geen korting op bier**, maar een samengestelde combinatie met een eigen prijs. Zo moeten ze ook in de software staan.

### 4.3 Productregel: wanneer is een product "af"?

Elk belangrijk eigen winkelproduct heeft tien onderdelen. De software moet per product kunnen laten zien wat er nog ontbreekt:

1. receptuur
2. gramgewicht en verpakking
3. kostprijs
4. bereidingsinstructie
5. productfoto
6. minimaal drie thuisgerechten (kookboek)
7. receptfoto's
8. QR-code (naar de productpagina in het kookboek, niet naar de homepage)
9. gedrukt receptkaartje
10. winkelpresentatie

**Bereidingsregel voor vacuüm diepvriesvlees:** nooit in water ontdooien of warm maken, alleen ontdooien in de koelkast, warm maken in oven of pan. Mathijs noemt het "warm maken", niet "opwarmen". Deze tekst komt op labels en kaartjes.

### 4.4 Selectiecriteria voor nieuwe producten

In batches produceerbaar · houdbaar of invriesbaar · past binnen de bestaande productie · herkenbare Hop & Bites-signatuur · bij voorkeur op meerdere plekken verkoopbaar (winkel, pakket, plank, box, webshop).

---

## 5. Leveranciers en inkoop

| Leverancier | Wat | Ritme / voorwaarden |
|---|---|---|
| **Iwan Veerbeek** (Uw Slager, Emmen) | slagersbasis, broodbeleg, zijn maaltijden, MAP per 2/4 | levert zelf; inkoop ca. 20% onder zijn winkelverkoopprijs (incl. btw); THT en bereiddag via factuur/leverbon |
| **Van Engelandt** (Anderlecht) | vlees, deelstukken | gratis levering boven €300; maandag bestellen, donderdag leveren |
| **Kroon Vlees** (Groningen) | vlees | kan 4 dagen per week leveren |
| **Elings Craftbeer** (Diessen) | speciaalbier | eerste winkelbestelling 20-10-2026 |
| **Brouwerij De Meteoor** (Vriezenveen) | bier, ~10 wisselplekken, elke maand iets nieuws | levert uit voorraad |
| **Brouwerij de Smokkelaar** (Overdinkel) | bier | gemengd bestellen per 12 of 24 |
| **Beer Republic** (Breda), **Interbeer** (Nijmegen) | Amerikaans/Canadees craft | accounts aangevraagd |
| **Well of Wine** | wijn | — |
| **Kaaspakhuis Emmen** (beoogd) | kaas | inkoop rond €9/kg |
| **NOIX Notenatelier** | noten | franco vanaf €350 per bestelling |
| **Down Under Rubs & Salts** | rubs, salts, grote zakken voor eigen pulled pork | geen minimum, wel elke maand een reële order |
| **Packhelp** | zwarte klapdozen (kerst/geschenk) | ±500 stuks |

Inkoopprincipe: horeca-achtige inkoop (deelstukken bij de groothandel), geen hele of halve dieren. Bij bier wint niet de laagste prijs maar wie de bierkant structureel sterker maakt.

---

## 6. Verkoopkanalen en stromen

### 6.1 Toonbank (kassa)
Directe verkoop tijdens openingstijden. Pin via **myPOS** (bestaande koppeling met de eigen kassa), contant via de kassalade.

### 6.2 Vooruitbestellen / afhalen
- Webshop op hopbites.nl (bestaande site, aparte repo) en verkooppagina's met deelbare link uit BBQ Architect.
- Bestellingen via mail, telefoon, WhatsApp of aan de toonbank.
- De klant kiest een **afhaaldag/afhaalmoment**. Afhalen in de winkel, **geen bezorging**.
- Schoonoord is gewend te **betalen bij het afhalen** (zo deed Jan Knol het). Betalen vooraf moet mogelijk zijn, maar is niet verplicht.
- Producten die op bestelling gaan: BBQ-pakketten, borrelplank, hapjesconcepten (een week vooraf), boxen, bierpakketten, cadeaupakketten.
- **Bier op verzoek:** klanten kunnen een specifiek bier vragen dat Mathijs voor ze bestelt.

### 6.3 Kerst-Box 2026 — de eerste grote test
Dit is de generale repetitie voor het hele bestel- en afhaalproces.
- Gourmetbox met vijf vleescomponenten van de smoker plus sides, sauzen, boter en lángos; €23,50 p.p., samengesteld uit twee bakjesformaten en twee doosformaten (2- en 5-persoons) waarbij de grammen verschillen, niet het aantal bakjes.
- **Bestellen tot 10 december.** Geen limiet op aantallen.
- **Afhalen 23 en 24 december**; 25 en 26 december beperkt open (ca. 10:00–14:00), puur afhaal. De klant kiest zelf de afhaaldag.
- Bestellen via verkooppagina uit BBQ Architect; **betalen met myPOS aan de eigen kassa** bij afhalen. Geen pre-sale-korting.
- Productie ver vooruit op receptuur, gevacumeerd ingevroren; overschot stroomt door naar de toonbank.
- Labelprinters aangestuurd vanuit BBQ Architect: alle bestellingen in één keer printen, elk etiket op naam van de klant.
- Maplijst voor de keuken met aantallen per bakje ("48 bakjes van 80 g aardappelsalade").
- De QR-app (experience.hop-bites.nl) hoort erbij; bestellingen gaan heen en weer via de bestaande import/export met token en QR.
- **Deze flow moet ruim vóór de marketing en vóór 10 december betrouwbaar werken.**

### 6.4 Cadeaubonnen
Er is al cadeaubon-drukwerk. Verkopen en inwisselen moet via de kassa kunnen.

### 6.5 Kookboek en QR
Het digitale kookboek (recepten per product, porties omrekenen) is de digitale laag boven het diepvriesassortiment. Elk product verwijst via QR naar zijn eigen productpagina. Productdata en receptdata moeten uit **één bron** komen.

---

## 7. Wat ik nodig heb in de software

Volgorde = volgorde van belangrijkheid. Hoe het technisch wordt opgezet beslist Claude Code samen met Mathijs, op basis van wat er al bestaat.

### 7.1 Productcatalogus — de basis van alles
Eén productbestand dat kassa, webshop, labels, kookboek, voorraad en rapportage allemaal gebruiken.

Per product minimaal:
- naam, korte omschrijving, productgroep, actief/inactief
- type: **eigen productie**, **doorverkoop** (ingekocht en zo verkocht), **samengesteld** (stuklijst), **dienst/op afspraak**
- verkoopprijs incl. btw, **btw-tarief** (uit een tabel, niet hardcoded)
- inhoud/vast gewicht en verpakkingseenheid
- inkoopprijs en leverancier (bij doorverkoop), kostprijs uit receptuur (bij eigen productie) → **marge zichtbaar**
- barcode/EAN (vooral bier, wijn, ingekochte producten) en een eigen interne code
- opslaglocatie en bewaarconditie (diepvries / koel / droog / wijnkast)
- houdbaarheid na productie of ontdooien
- allergenen — **alleen handmatig ingevoerd, nooit door AI afgeleid**; leeg is leeg, niet geraden
- alcoholpercentage (voor leeftijdscheck en vergunningsgrens)
- statiegeld (bijvoorbeeld blik) als aparte regel
- bereidingsinstructie, QR-link naar kookboek, foto
- kanalen: winkel / webshop / alleen op bestelling
- de tien-puntenstatus uit §4.3

### 7.2 Kassa (POS)
Draait als web-app op een touchscreen-kassa (tweedehands, met Epson-bonprinter en kassalade; mogelijk later Sunmi-terminals). Pin via myPOS.

Moet kunnen:
- **snel aanslaan** via grote knoppen per productgroep, plus barcode scannen en zoeken
- bon met regels, aantallen, totaal, **btw uitgesplitst per tarief**
- **samengestelde producten** en combideals met hun eigen prijs, maar intern **btw per component** splitsen (bierpakket met worst = alcohol 21% + voedsel 9%)
- betalen: pin (myPOS), contant (wisselgeld, kassalade open), gemengd, cadeaubon
- **leeftijdscheck** bij alcohol: een verplichte bevestiging van de medewerker voordat de bon door kan
- pre-order ophalen en afrekenen: bestelling opzoeken op naam/nummer, één tik om af te rekenen
- **cadeaubon verkopen en inwisselen** met code en saldo (btw pas bij inwisselen)
- korting met reden, retour/correctie met reden — nooit stil verwijderen
- bon printen op de Epson, of overslaan
- **dagafsluiting** (Z-rapport): omzet per btw-tarief, per betaalwijze, kasverschil, aantal bonnen; doorgezet naar de boekhouding
- een **onveranderbaar kassajournaal**: elke verkoop, correctie en annulering blijft bewaard (fiscale bewaarplicht)
- knop **"klant vraagt naar …"**: één tik om vragen te turven naar producten die er niet zijn (bijvoorbeeld kant-en-klare maaltijden) — dat is marktonderzoek voor jaar 1
- blijven werken als het internet even wegvalt, en daarna synchroniseren
- zo simpel dat een vervanger op zaterdag het zonder uitleg kan

### 7.3 Voorraad
- voorraad **per locatie** (vriescel, koelcel, doorloopkoelcel, vitrine, droge opslag, wijnkast, vrieskisten)
- **batches met productiedatum en THT**, uitgifte op FEFO (eerst wat het eerst verloopt)
- automatisch afboeken bij verkoop; samengestelde producten boeken hun componenten af
- **ontvangst inkoop**: leverbon of factuur boeken → voorraad erbij, inkoopprijs bijgewerkt
- eigen productie boeken: grondstof in → aantal pakketten uit (met rendement, bijvoorbeeld pulled pork rond 65% na de cook)
- **derving registreren met reden** (THT verlopen, beschadigd, sample, eigen gebruik, showmodel)
- minimum- en streefvoorraad per product
- **inventarisatie/telling** op telefoon of tablet, per locatie
- signalen: bijna op, THT binnen X dagen, vriescel vol

### 7.4 Inkoop
- **bestelvoorstel per leverancier** op basis van voorraad, verkoopsnelheid en openstaande pre-orders
- per leverancier: besteldagen, leverdagen, franco-drempel, minimumorder, verpakkingseenheid (bier per doos/12/24)
- melding als een bestelling net onder de franco-drempel zit
- inkoopprijshistorie en margebewaking: waarschuwing als een inkoopprijs stijgt en de marge onder een grens zakt
- concept-bestelmail per leverancier opstellen — **versturen doet alleen Mathijs**

### 7.5 Productie (keukenkant)
- **weekbatchplanning**: liever elke week een batch dan eens per twee weken; voorstel op basis van voorraad, verkoop en pre-orders
- koppeling met het bestaande keukenscherm/dagstart en de microtaak-planning (Hermes-gedachte): batches worden opgeknipt in stappen
- **HACCP-registratie**: terugkoelen met de bluetooth-thermometer, vitrine- en celtemperaturen, schoonmaaktaken — aftikken voor de NVWA
- bekende bug uit de cateringtijd: HACCP-registraties worden aangemaakt op 0 °C met status "ok" → moet "open" zijn; normwaarden horen in een tabel, niet in een prompt

### 7.6 Labels en etiketten
Belangrijk: Mathijs wil **eigen Hop & Bites-stickers op alle producten**, ook op die van Iwan Veerbeek.
- productetiket: naam, gewicht/inhoud, prijs, productiedatum of bereiddag, THT, allergenen, bewaar- en bereidingsinstructie, QR naar kookboek
- voor Iwans producten: THT en bereiddag overnemen van zijn leverbon/factuur
- bestellingsetiket: naam klant, afhaaldag, inhoud (kerst: per doos)
- **batchgewijs printen** vanuit een productiebatch of een lijst bestellingen
- labelprinters moeten nog gekozen worden — houd het printerformaat configureerbaar

### 7.7 Bestellingen en afhalen
- één overzicht voor **alle pre-orders**, ongeacht kanaal (webshop, mail, telefoon, toonbank, WhatsApp)
- per bestelling: klant, contact, producten, afhaaldag en -moment, betaald vooraf ja/nee, opmerkingen (allergie, vega)
- **bestelsluitingen** per product of actie (kerst: 10 december; hapjes: een week vooraf)
- capaciteit per afhaalmoment (optioneel, zodat 23 december niet om 10:00 vastloopt)
- statusflow: nieuw → bevestigd → in productie → klaar → afgehaald (of niet afgehaald)
- **maplijst voor de keuken**: totalen per component over alle bestellingen
- **picklijst/inpaklijst** per bestelling
- bevestigings- en herinneringsmail als concept (Mathijs keurt goed)
- koppeling met de kassa: bij afhalen opzoeken en afrekenen

### 7.8 Inkomende mail
Alle mail komt binnen op **info@hop-bites.nl** (met streepje), dat doorloopt naar dezelfde Gmail; daarvandaan wordt ook verstuurd.

Wat binnenkomt:
- klantbestellingen en -vragen (pre-orders, borrelplanken, "hebben jullie …?")
- orderbevestigingen, leverbonnen en facturen van leveranciers (§5)
- offertes en prijslijsten
- overig (nieuwsbrieven, spam)

Wat de software ermee moet:
- **lezen en indelen** in categorieën
- bij een klantbestelling: een **conceptbestelling** klaarzetten om goed te keuren
- bij een leveranciersfactuur: **conceptinkoopboeking** klaarzetten (koppelen aan de bestelling, voorraadontvangst voorbereiden, door naar de boekhouding)
- bij een vraag: een **conceptantwoord** in Mathijs' toon (je-vorm, nuchter, geen salespraat)
- nachecken of iets haalbaar is (voorraad, afhaaldag, bestelsluiting) en dat erbij zetten
- **AI verstuurt nooit zelf en boekt nooit zelf** — alles is een concept dat Mathijs met één tik goedkeurt of aanpast

### 7.9 Klanten
Licht houden. Geen verplicht account.
- naam, telefoon, mail, eerdere bestellingen, voorkeuren (bijv. bier-op-verzoek-wensen)
- woonplaats bij een bestelling registreren (hoeveel klanten komen uit Schoonoord zelf, hoeveel van de campings)
- toestemming voor de mailinglijst apart en expliciet (AVG), voor de cadeaumomenten (vaderdag, kerst, ongeveer twee weken vooraf)

### 7.10 Rapportage — jaar 1 is marktonderzoek
- omzet per dag, per dagdeel/uur, per productgroep, per product
- **omzet per openingsuur** (doel: hoge omzet per uur, niet zoveel mogelijk uren)
- marge per productgroep, derving per product
- welke producten samen gekocht worden
- terugkerende klanten, pre-order versus toonbank
- de getelde klantvragen ("vraag naar …")
- seizoenspatronen, structureel over meerdere maanden gemeten
- verkoopcijfers per bier, zodat de wisselplekken onderbouwd kunnen worden

### 7.11 Boekhouding
De eigen boekhouding bestaat al in BBQ Architect. Nieuw is de stroom uit de winkel:
- dagomzet per btw-tarief en per betaalwijze uit de dagafsluiting
- kasstortingen en kasverschillen
- myPOS-afrekeningen koppelen aan de dagomzet
- inkoopfacturen uit de mailstroom
- cadeaubonnen als verplichting tot ze ingewisseld zijn

### 7.12 Winkeltaken
- checklist openen en sluiten (vitrines, temperaturen, kassa tellen)
- vitrines aanvullen vanuit de doorloopkoelcel
- schoonmaak winkel, oprit, ramen

---

## 8. Ontwerpregels die blijven gelden

- **D/A/H:** deterministisch rekenwerk (prijzen, btw, voorraad, hoeveelheden, temperaturen, allergenen) door code. AI alleen voor oordeel en taal. Hybride altijd met menselijke goedkeuring.
- **Allergenen nooit door AI.** Niet in het uitvoerschema van de AI, niet geraden, leeg tot het bevestigd is.
- **AI verstuurt, boekt en betaalt nooit zelf.** Alleen concepten.
- **Handwerk wint van de kopie:** een handmatige aanpassing wordt nooit overschreven door een automatische run. Automatische acties zijn idempotent.
- **De winkel houdt ambacht.** In de keuken mag het systeem sturen (Mathijs is daar de enige kok). In de winkel ondersteunt het systeem, maar mensen helpen en meedenken gaat voor. Geen schermen die tussen Mathijs en de klant in staan.
- **Eén bron per gegeven.** Product, prijs, allergenen en recept staan op één plek en worden overal hergebruikt.
- **Stukje bij beetje.** Eerst op papier, dan bouwen. Een kleinere werkende versie is beter dan een grote halve.
- **Huisstijl in schermen** (waar relevant): olijfgroen, mat goud, mat zwart — dof, niet blinkend; ruig en strak, niet strak wit.

---

## 9. Catering: niet weg, wel naar de achtergrond

- De cateringketen (aanvraag → factuur), de acceptatiemotor en de arrangementen blijven in de code.
- Ze verdwijnen uit de hoofdnavigatie of komen achter een schakelaar.
- Data die beide gebruiken (gerechten, recepturen, kostprijzen, allergenen, apparatuur, voorraad) wordt **gedeeld**, niet gedupliceerd.
- Later komt catering terug als uitbreiding vanuit de winkel (eerst borrel, hapjes op afspraak en B2B-lunch, daarna mogelijk weer events). Bouw de winkel zo dat dat er later weer bij kan.

---

## 10. Prioriteit en tijdlijn

| Wanneer | Wat moet werken |
|---|---|
| **Vóór 21 november** (opening) | productcatalogus · kassa met btw-split, myPOS, contant, dagafsluiting en journaal · labels printen · basisvoorraad per locatie en batches |
| **Vóór de kerstmarketing / ruim vóór 10 december** | pre-orders met afhaaldag en bestelsluiting · maplijst en etiketten per klant · afrekenen bij afhalen · koppeling met de QR-app |
| **December–januari** | inkoopvoorstellen per leverancier · inkomende mail indelen en concepten · derving en telling |
| **Doorlopend jaar 1** | rapportage en marktonderzoek · kookboek-koppeling per product · productietijden meten |

Vooraf aan elke stap: laat zien wat er al bestaat en wat je wilt veranderen. Pas daarna bouwen.

---

## 11. Open punten — niet invullen, maar vragen

- **Kaas:** voorverpakt op vast gewicht, of later toch een geijkte weegschaal?
- **Eigen sauzen verkopen:** pH en NVWA-eisen nog uitzoeken. Rubs kunnen wel.
- **Sterke drank:** port of andere drank boven 15% vraagt mogelijk een aparte vergunning — eerst nagaan voordat zulke producten in de catalogus actief worden.
- **Statiegeld** op blik en flessen: welke producten, welk bedrag, innamebeleid.
- **Labelprinters:** merk en formaat nog niet gekozen.
- **Kassahardware:** tweedehands touch-kassa met Epson; Sunmi-terminals mogelijk. Hoe de Epson vanuit de browser printen moet, nog uitzoeken.
- **Zoetlijn en koffie:** nog niet gestart; koffiemachine nog niet gekozen.
- **Maaltijdenlijn:** van Iwan Veerbeek wel in de winkel; eigen maaltijden pas later. Diepvriessauzen nog een idee.
- **Vriescel:** werkt pas na reparatie door de verhuurder.
- **Openingstijden in de zomer:** kunnen anders worden.
- **Prijzen:** worden per product door Mathijs vastgesteld; nooit zelf verzinnen.

---

*Dit document is de stand van zaken op 26 oktober 2026. Plannen veranderen; bij tegenstrijdigheid geldt het meest recente besluit van Mathijs. Werk dit bestand bij als hij een besluit wijzigt, en zet de datum erbij.*
