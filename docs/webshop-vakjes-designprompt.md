# Design-prompt — webshop-vakjes

Plak alles onder de streep in Claude Design. Het hoort bij
`docs/webshop-beheer-bouwplan.md` (versie 2); als je iets wilt wijzigen, wijzig het dáár en
pas deze prompt aan — niet andersom. De zip die terugkomt gaat in `.design-import/webshop/`.

---

Ontwerp het webshop-scherm van BBQ Architect: de plek waar de bestellingen van de
Hop & Bites-website binnenkomen en op de juiste dag terechtkomen. Eén canvas, negen artboards.
Geen code, geen interactie — statische schermen die alle toestanden laten zien.

## De situatie

Hop & Bites is een BBQ-cateraar in Drenthe met één eigenaar die alles zelf doet. Op zijn website
kun je sinds kort afrekenen: borrelplanken die je op een gekozen moment ophaalt, een Kerst-Box
die je op 23 of 24 december ophaalt, en losse producten (flessen saus, zakken BBQ-amandelen,
speciaalbier, geschenkboxen) die je meteen meeneemt of laat verzenden.

Elke betaalde bestelling is een **bonnetje**. Dit scherm doet één ding met dat bonnetje: het
in het juiste **vakje** leggen — het vakje van de dag waarop het klaar moet zijn. Een plank die
vandaag besteld wordt voor over drie weken ligt in het vakje van die dag, niet in "vandaag".
Vijf bier zonder afhaalmoment liggen in het vakje *Vandaag*. Alle Kerst-Boxen voor de 23e
liggen in het vakje *woensdag 23 december*.

Vanuit een vakje doet hij twee dingen: hij opent het **kookbord** (wat moet de keuken maken
voor dit vakje) en de **inkoop** (wat moet ik hiervoor bestellen). Bij de inkoop kiest hij:
*mee met de volgende bestelling* bij de leverancier, of *bestel alleen dit*.

De rest van het scherm is beheer: de artikelen van de webshop (prijs, btw, aan/uit, en vooral:
**wat maakt de keuken hiervoor** of **wat koop je hiervoor in**), de afhaalmomenten met hun
capaciteit, en de kassa-instellingen met één grote schakelaar: open of dicht.

## Wat het product is — respecteer dit

BBQ Architect is Nederlandse B2B-software voor BBQ- en eventcateraars. Donker thema, warm,
ambachtelijk — geen koele SaaS-look. Alle tekst Nederlands. Iconen lucide-react, nooit emoji.

CSS-variabelen die al bestaan en die jij gebruikt:

```
--bg: #121214          --card-solid: #1e1e22    --text: #f8f8f8     --muted: #949494
--border: rgba(130,130,130,.15)
--brand: #FFBF00       (helder amber — de primaire actie, spaarzaam)
--brand-gold: #c4a35a  (gedempt goud — accenten, eyebrows, labels)
--font-display: Outfit (dunne titels)   lopende tekst: DM Sans
```

Twee signaalkleuren, elk voor precies één ding:
- **vuur `#E86A2C`** — alleen voor "niet geplaatst": een betaald bonnetje dat nergens ligt. Dat
  is de fout die je op 22 december ontdekt. Alleen zichtbaar als het voorkomt.
- **amber `#f59e0b`** — waarschuwing: opmerking niet gelezen, allergie, nog niet gekoppeld.

**Referentie voor de vorm:** het scherm `/verkoop/bestellingen` (de gourmetbox-bestellingen)
en de event-hub. Daar staat al: een eyebrow in kleine kapitalen, tellers bovenaan die geen
sier-statistiek zijn maar een **filter** (klikken filtert de lijst; alleen zichtbaar boven
nul), rijen in een paneel, en een **drawer die van rechts inschuift** voor details en bewerken.
Nooit een modal in het midden. Dit scherm moet daar naadloos naast kunnen staan.

## Harde eisen

- **Vakjes zijn dagen.** De lijst is gesorteerd op klaar-op-datum, *Vandaag* bovenaan, de rest
  oplopend. Een vakje heeft altijd zijn datum voluit in woorden (*woensdag 23 december*), ook
  als het ver weg is. Dat is de hele reden van het scherm.
- **Eén primaire knop per plek.** Op een vakje is dat *Kookbord*. *Inkoop* is secundair;
  *Bestel* is een menu met twee keuzes. Niet vier knoppen naast elkaar.
- **Tellingen moeten optellen.** Wat bovenaan staat (17 Kerst-Box · 3 vegetarisch) is de som van
  de orders eronder. Als een order "4 personen waarvan 1 vega" zegt, staat die 1 bij de 3.
- **Wat de AI gelezen heeft staat altijd naast het origineel.** "Uit de opmerking: 1
  vegetarisch — gelezen door AI" met de originele zin van de klant er direct onder, en een
  knop *Klopt niet*. Nooit alleen de conclusie.
- **Leeg is leeg.** Een artikel zonder prijs toont "prijs volgt", niet € 0,00. Een artikel zonder
  koppeling toont "nog geen gerecht of product gekoppeld", niet een gok.
- **Werkt op de telefoon.** Hij staat vaak in de keuken. Eén kolom, drawer wordt full-screen,
  knoppen minstens 44 px hoog.

## De negen artboards

**1. Vakjes — overzicht, desktop (1440 breed).** Sub-tabbalk van de Verkoop-hub bovenaan
(Aanvragen · Bestellingen · **Webshop** · Arrangementen · Website · Offertes · Klanten).
Paginatitel *Webshop*, ondertitel één regel. Segment-knop: **Vakjes** · Artikelen · Momenten ·
Instellingen. Teller in vuur: *2 orders niet geplaatst*. Dan de vakjes als kaarten onder elkaar:

- *Vandaag · klaarzetten & verzenden* — 3 orders · 5× speciaalbier, 2× barbecuesaus, 1×
  geschenkbox (verzenden). Knoppen: Inkoop · Bestel ▾. Geen kookbord.
- *donderdag 16 oktober · 12:00–13:00 · planken* — 2 orders · 2 planken · 24 personen.
  Merkteken amber: *1 opmerking niet gelezen*. Knoppen: **Kookbord** · Inkoop · Bestel ▾.
- *woensdag 23 december · Kerst-Box* — 6 orders · 20 personen · **17 Kerst-Box · 3
  vegetarisch** · 5 dozen van 5 · capaciteit 5 / 25. Merkteken amber: *allergie: noten (1)*.
- *donderdag 24 december · Kerst-Box* — 1 order · 4 personen · merkteken vuur: *niet geplaatst
  — gerecht Kerst-Box bestaat nog niet*.

**2. Vakje open — de drawer van rechts.** Het vakje van 23 december. Kop: datum, wat, totalen.
Knoppenrij: Kookbord · Inkoop · Bestel ▾ (open getekend: *Mee met de volgende bestelling* /
*Bestel alleen dit*). Daaronder de orders als rijen: naam, ordernummer HB-2026-0042, *4× Kerst-Box
· wo 23 dec*, € 94,00, en waar van toepassing een regel *Uit de opmerking: 1 vegetarisch —
gelezen door AI* met de originele zin eronder in een stil blok ("4 personen waarvan 1 vega, en
graag geen noten") en de knop *Klopt niet*. Eén order met *opmerking niet gelezen — lees zelf*.

**3. Vakje open — Vandaag.** Zelfde drawer, de vaste bak. Per regel een vinkje *Klaargezet*; een
verzendorder toont het adres en *Verzonden*. Twee regels al afgevinkt (doorgestreept, gedempt).

**4. Inkoop voor dit vakje.** Het bestelvoorstel op `/inkoop`, maar gefilterd: bovenaan een
strook *Inkoop voor woensdag 23 december · Kerst-Box · 17 + 3* met *terug naar het vakje*.
Daaronder per leverancier een blok (Beef Club, Bidfood, Slager Emmen) met regels: naam,
nodig (2,4 kg), besteld (3 × pak 1 kg), prijs, en per regel klein "voor: Kerst-Box 17×".
Eén regel met *prijs onbekend* (telt niet mee). Onderaan de twee knoppen als bevestiging:
*Mee met de volgende bestelling* (uitleg: "staat vanaf 9 december vanzelf op de lijst") en
*Bestel alleen dit* (primair).

**5. Artikelen — lijst.** Rijen: naam, prijs of *prijs volgt*, btw, aan/uit, afhalen (geen /
moment / dag), en de kolom **Koppeling**: *gerecht Kerst-Box* · *voorraad bier Drenthe (1 fles
per stuk)* · *voorstel: gerecht Borrel Journey — zo doen?* (amber) · *nog niet gekoppeld*.
Bovenaan de knop *Koppelronde* (AI stelt voor alle ongekoppelde artikelen een koppeling voor).

**6. Artikel — drawer.** Alle velden, in de taal van de kassa: naam, eenheid (per persoon / per
fles), telt (personen / stuks), prijs incl. btw, btw 9/21, minimum/maximum, verzendbaar,
gekoeld, afhalen (geen / moment uit de agenda / dag) + groep + tekst op de bon, capaciteit (per
regel / per aantal / in dozen: kleine doos t/m 3, grote doos 5), kassa-voorraad (leeg =
onbeperkt), actief, publiek, dieet. Onderaan het blok **Wat maakt of koopt je hiervoor?** met
twee keuzes (*de keuken maakt dit* → zoek gerecht / *dit koop je in* → zoek voorraad-item + "per
besteld stuk: 1 fles"), de AI-suggestie als eerste, aangevinkte optie met reden in één zin, en
de knop *Nieuw voorraad-item* voor als het er nog niet is.

**7. Momenten.** Twee blokken: *Agenda · planken* (momenten met tijdvak, bezetting 1 / 4
planken, bestellen tot) en *Kerst-Box · afhaaldagen* (23 dec 5 / 25 dozen, 24 dec 1 / 25). Per rij
capaciteit direct bewerkbaar, *uit de lijst halen*. Knop *Vak toevoegen* met het formuliertje
open getekend. Eén vol vak (25 / 25) in amber.

**8. Instellingen.** Bovenaan de grote schakelaar **Kassa open** (aan, met "de site neemt
orders aan"), daaronder: verzendkosten (€ 6,95, leeg = verzenden uit), gratis verzenden vanaf
(€ 50), btw op verzendkosten, reserveringsduur 30 min, offerte geldig 15 min, ordernummer
HB-2026-…, site-URL. Rustig, één kolom, één *Opslaan*.

**9. Telefoon (390 breed).** Het vakjes-overzicht (artboard 1) en één vakje open (artboard 2)
als full-screen. Segment-knop wordt een scrollende pillenrij; knoppen vol breed.

## Gebruik echte inhoud

Namen en getallen hierboven zijn echt (uit de kassa-catalogus en de seed). Artikelen: Kerst-Box
€ 23,50 p.p. · Kerst-Box vegetarisch · Borrel Journey € 14,95 p.p. · Hop & Bites plank ·
BBQ-amandelen · Barbecuesaus · White Alabama · Geschenkbox · Borrelbox · Pit & Rook · Drenthe
bieravond · Voor papa. Ordernummers HB-2026-0041 t/m -0052. Klantnamen mogen verzonnen, gewoon
Nederlands (Jan Jansen, Fam. de Vries, Bakkerij Smit). Geen lorem ipsum.

## Niet ontwerpen

Geen nieuwe huisstijl, geen lichte modus, geen dashboard-grafieken, geen landingspagina. Geen
klantkant (de website is een ander project). Geen betaalscherm — betalen gebeurt bij myPOS.
Geen lege-staat-illustraties; een leeg vakje is één zin: "Nog geen orders. Zodra iemand op de
website afrekent, staat hij hier."

## Wat ik terug wil zien

De negen artboards als handoff (HTML/React met de bestaande CSS-variabelen), plus één pagina
met de componenten die je hebt toegevoegd bovenop wat er al is: de vakje-kaart, het
merkteken, de koppeling-kiezer, de bestel-keuze. Per component de toestanden: normaal, leeg,
waarschuwing, vuur.
