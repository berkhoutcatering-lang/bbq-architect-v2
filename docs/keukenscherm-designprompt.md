# Design-prompt — keukenscherm en tablet

Plak alles onder de streep in Claude Design. Het hoort bij
`docs/keukenplanner-bouwplan.md` (versie 4); als je iets wilt wijzigen, wijzig het dáár en
pas deze prompt aan — niet andersom.

---

Ontwerp een wandscherm en een tablet voor de keuken van een BBQ-cateringbedrijf. Eén
canvas, acht artboards. Geen code, geen interactie — statische schermen die alle toestanden
laten zien waarin dit ding kan staan.

## De situatie

Er is één kok. Hij werkt alleen, staat de hele dag met zijn handen in het werk, en heeft
geen tijd om iets te lezen dat langer is dan een regel. Het wandscherm hangt aan de muur van
een voormalige slagerij en staat altijd aan. Hij kijkt er vanaf **drie meter** naar, in het
voorbijgaan, met vette handen en meestal terwijl hij al ergens mee bezig is.

Het scherm vertelt hem wat hij nu moet doen. Meer niet. Het is geen dashboard.

## Harde eisen — hier valt niet mee te schuiven

- **1920 × 1080, liggend, kioskmodus.** Alles past op één beeld. **Geen scroll.** Past het
  niet, dan is het te veel informatie en moet er iets weg.
- **Read-only.** Er staat geen enkele knop op. Niets kan vanaf dit scherm verstuurd,
  bevestigd, afgevinkt of gewijzigd worden. Alle echte acties gebeuren op de tablet.
- **Kleinste tekst 22 px.** De actieve taak fors groter — reken op 120 px en hoger. Als je
  het van drie meter niet kunt lezen, is het te klein.
- **Vier zones die nooit van plek wisselen.** Hij moet blind weten waar hij moet kijken:
  - **NU** — ongeveer 55% van het beeld, linksboven beginnend
  - **STRAKS** — de eerstvolgende vijf regels, waarbij tijdkritisch werk er zichtbaar anders
    uitziet dan werk dat kan schuiven
  - **MELDINGEN** — maximaal drie, nooit meer
  - **Statusbalk** — dun, onderaan: tijd, open taken, open HACCP-registraties, en wanneer
    het scherm voor het laatst ververst is
- **Donkere ondergrond.** Dit ding staat vierentwintig uur per dag aan in een werkruimte; een
  wit vlak van 1920 × 1080 is dan een lamp. Bijna-zwart met hoog contrast, één accentkleur.
- Accentkleur: olijfgroen **#6B7A3F** (huisstijl Hop & Bites). Gebruik daarnaast hooguit een
  waarschuwingskleur en een alarmkleur. Niet meer.

## De vier soorten tijd

Dit is het hart van het ontwerp en het moet in één oogopslag te zien zijn. Een taak bestaat
uit vier stukken, en elk stuk kan nul zijn:

```
[ aanzetten ]  →  [ opwarmen ]  →  [ werk ]  →  [ wachten ]
   kok bezet       kok vrij       kok bezet     kok vrij
```

De vraag die het scherm elke seconde beantwoordt is: **ben ik nu bezig, of ben ik vrij?**
Bij "vrij" hoort er iets in dat gat gepland te staan — dat is precies waar dit systeem zijn
winst haalt. Ontwerp dat verschil sterk. Een kok die vrij is en dat niet weet, staat te
wachten.

## Elke duur draagt zijn herkomst

Overal waar een tijd staat, staat erbij waar die vandaan komt. Dit is geen detail maar de
kern: een scherm dat doet alsof het klopt terwijl het dat niet doet, wordt binnen twee weken
genegeerd.

- **geschat** — nog nooit gemeten, dit is een gok
- **monitor** — minder dan vijf metingen, het systeem kijkt nog mee
- **gemeten** — dit weet het systeem inmiddels
- **verwacht** — bij vlees dat op kerntemperatuur gaar is; de klok is hier een schatting en
  de thermometer heeft het laatste woord

Vier etiketten, rustig vormgegeven. Ze mogen niet schreeuwen, maar ze moeten van drie meter
leesbaar zijn.

## De acht artboards

**1 · Wandscherm — actief werk.** NU toont "Bavette trimmen — 8 kg", het station, de
verstreken en resterende tijd. Bij een kooktaak staat de kerntemperatuur erbij, en verder
alleen de actieve receptuurstap — **nooit het hele recept**.

**2 · Wandscherm — passief, met werk in het gat.** De smoker draait. NU toont niet het
wachten maar **de taak die je in die wachttijd doet**, met klein daarnaast hoeveel tijd de
smoker nog heeft. Dit is het belangrijkste artboard: laat zien hoe je twee dingen tegelijk
toont zonder dat het een dashboard wordt.

**3 · Wandscherm — opwarmen loopt.** De oven is aangezet en komt op temperatuur. De kok is
vrij, dus ook hier staat er ander werk in het gat. Laat het verschil zien met artboard 2 —
opwarmen is korter en het werk erna hangt eraan vast.

**4 · Wandscherm — er is zojuist herplant.** Het vlees valt tegen, de dag schuift op. De
melding is één regel, in deze vorm:

> **Kern loopt achter — brisket zit op 68 °C, verwacht 40 minuten later**
> Drie taken verschoven. Uitlevering om 16:00 blijft haalbaar.

Wat er gebeurd is, wat het betekent, en of het nog haalbaar is. Ontwerp ook de variant waarin
het **niet** haalbaar blijft, want dat is de melding die er het meest toe doet.

**5 · Wandscherm — verbinding kwijt.** De data is ouder dan negentig seconden. Dit moet over
het hele beeld zichtbaar zijn, niet als icoontje in een hoek. Een keukenscherm dat stilletjes
oude taken toont is erger dan een zwart scherm — ontwerp het alsof dat waar is.

**6 · Wandscherm — niets te doen.** De dag is klaar, of er staat vandaag niets gepland.
Geen leeg raster en geen aanmoediging. Wat staat er dan wél, en hoe voorkom je dat het lijkt
alsof het scherm kapot is?

**7 · Tablet — de taak.** Staand, in de hand. Dezelfde taak in het klein, met **precies drie
knoppen: Start, Klaar, Loopt uit.** Raakvlakken groot genoeg om met een knokkel te bedienen —
de handen zijn vies, hij gebruikt geen vingertop. Verder niets op dit scherm.

**8 · Tablet — Klaar bevestigen.** Twee dingen worden gevraagd: **hoeveel** het geworden is,
en of hij **onderbroken** is. Dat vinkje is essentieel — zonder dat komt er straks een meting
van 24 minuten in omdat de leverancier langskwam. Ontwerp het zo dat hij het vinkje zet
zonder erover na te denken, met een knokkel, in twee seconden.

## Gebruik echte inhoud

Geen lorem, geen "Taak 1". Dit staat echt in het systeem:

- Gerechten: Gerookte bavette · Gegrilde ananas met spiced rum karamel · Pulled pork
- Stappen: bavette trimmen · sriracha mayo mengen · bosui flinterdun snijden · karamel
  passeren en koelen · ananas grillen, 2–3 min op de suikerkant
- Stations: Koud · Smoker · Warm · Sauzen · Expeditie
- Apparatuur: Yoder 1500 · Rational combisteamer · Robot Coupe CL50 · flat top
- Schoonmaak is volwaardig werk, geen bijzaak: "Robot Coupe schoonmaken — 8 min" hoort
  gewoon in het gat naast het rooktijd-blok te staan.

Nederlands, in de taal van de keuken. Kort, gebiedend, zonder uitroeptekens.

## Niet ontwerpen

Geen knoppen op het wandscherm. Geen scroll. Geen recepturen op het wandscherm. Geen
omzetgrafieken, voortgangsdonuts of sierstatistieken. Geen tabs of navigatie — dit scherm
kent maar één weergave. Geen personeelsverdeling: er is één kok.

## Wat ik terug wil zien

De acht artboards naast elkaar op één canvas, in deze volgorde. Zet bij elk artboard in twee
regels waarom je de keuze gemaakt hebt die je gemaakt hebt — vooral bij 2, 4 en 5, want daar
zit het echte ontwerpprobleem.
