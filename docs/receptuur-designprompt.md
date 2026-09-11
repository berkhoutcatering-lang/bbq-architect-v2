# Design-prompt: de receptuur in BBQ Architect

Voor Claude Design. Plak dit hele document als opdracht.

---

## Wat je ontwerpt

Twee schermen van een app die een BBQ-cateraar gebruikt om zijn productie te plannen.

1. **De receptuur** — hoe een gerecht gemaakt wordt, gelezen in de keuken.
2. **De goedkeur-lade** — het moment waarop een recept uit een kookboek wordt omgezet
   naar de eigen werkwijze, en de kok het goedkeurt of afwijst.

De app heet BBQ Architect en draait bij Hop & Bites, een Nederlandse BBQ-catering met één
eigenaar-kok (Mathijs) en wisselende hulp. Het is geen consumentenkookapp. Het is een
productiesysteem: het moet vertellen wát er wanneer moet gebeuren, op welk apparaat, en
hoe lang je dan niets kunt doen.

## Wie ernaar kijkt

- **Sam**, de eigenaar. Kent zijn keuken, heeft geen geduld voor uitleg. Wil in twee
  seconden zien of een recept klopt.
- **Lars**, de hulp van negentien. Leest het recept in de keuken, op een telefoon, met
  vette handen. Voor hem moet de volgende handeling altijd de grootste tekst op het scherm
  zijn.

Als iets voor Sam mooi is maar voor Lars onleesbaar, wint Lars.

---

## De inhoud is echt — dit is geen placeholder

Ontwerp met deze data. Verzin geen andere velden; deze bestaan.

### Een receptuur bestaat uit delen

Een gerecht valt uiteen in **onderdelen** (een saus, een kruidenmengsel, een pekel) en
**het gerecht zelf**. Onderdelen zijn los te maken — dagen eerder, of samen met hetzelfde
onderdeel in een ander gerecht. Dat is het belangrijkste dat dit scherm moet overbrengen.

Typisch zijn het er twee tot vier. Zes is het maximum dat je hoeft te ondersteunen.

**Echt voorbeeld — Smokey's Chicken Sandwich, 4 porties, 11 stappen:**

```
RANCHSAUS  ·  2 stappen  ·  mag vooruit
  1  Mayonaise, karnemelk en zure room met een garde glad mengen tot een saus
     zonder klontjes.                          Inomak koelwerkbank · tijd wordt gemeten
  2  Bieslook, dille, peterselie, uien- en knoflookgranulaat, zout, peper en
     citroensap erdoor roeren; afsmaken op fris-zuur.
                                               Inomak koelwerkbank · na stap 1

BLEEKSELDERIJSALSA  ·  4 stappen  ·  mag vooruit
  3  Bleekselderij in gelijke blokjes van 4 bij 4 mm snijden.
  4  Tomaat en komkommer ontzaden en in blokjes van 4 bij 4 mm snijden.
  5  Rode ui snipperen.
  6  Gesneden groenten met gehakte peterselie mengen en op smaak brengen met
     zout, peper en limoensap.                 na stap 5

HET GERECHT ZELF  ·  5 stappen
  7  Kippendijen aan alle kanten inwrijven met Chick Mix BBQ-kruiden.
  8  Kippendijen indirect roken op 125 °C.     Yoder YS1500s · 125 °C · 30 min wachten
  9  Ciabatta's afbakken en opensnijden.
 10  Kip kort direct grillen tot kerntemperatuur 75 °C.
                        Yoder houtskoolgrill · 220 °C · klaar bij kern 75 °C · na stap 8
 11  Broodjes beleggen: eerst veldsla, dan bleekselderijsalsa, dan de gegrilde
     kip; afwerken met een rijke dosis ranchsaus.
```

### Wat er per stap bekend kan zijn

Nooit alles tegelijk. Ontwerp voor de regel dat de helft leeg is.

| Veld | Voorbeeld | Betekenis |
|---|---|---|
| werk | `5 min werk` | de kok is bezig, kan niets anders doen |
| wachten | `4 uur wachten` · `7 dagen` | het staat te doen, de kok kan weglopen |
| apparaat | `Yoder YS1500s pelletgrill` | welk toestel bezet is |
| apparaatstand | `115 °C` | waar het toestel op staat |
| eindconditie | `klaar bij kern 88 °C` | eindigt op de meter, niet op de klok |
| herhaling | `elke 30 min iets doen` | je moet steeds terugkomen |
| volgorde | `na stap 8` | mag pas als die klaar is |
| onbekend | `tijd wordt gemeten` | er is geen tijd, en dat is eerlijk |

### Drie stresstests die je ontwerp moet aankunnen

1. **Bijna alles onbekend.** Een vers ingevoerd recept heeft vaak twintig van de tweeëntwintig
   stappen zonder tijd. De kop zegt dan letterlijk: *"Bekende tijd over 5 van de 22 stappen:
   13 min werk, 6 uur wachten · de andere 17 worden gemeten."* Dat mag niet lezen als een
   fout, maar ook niet worden weggepoetst.
2. **Negen dagen doorlooptijd.** De spiced maple bacon pekelt zeven dagen (10 080 minuten) en
   droogt er twee. Eén stap van zeven dagen naast een stap van drie minuten in dezelfde lijst.
3. **Twee tot zes delen** met heel ongelijke omvang: één deel van twee stappen naast een deel
   van vijftien.

---

## Wat het scherm moet doen

### Uitklappen: op deel-niveau, niet lager

- **Dicht:** één regel per deel — naam, aantal stappen, of het vooruit mag, en de tijd die
  bekend is.
- **Open:** de stappen erin.
- **Onder de stap zit niets.** Er is geen derde niveau. Een stap is de kleinste eenheid die
  gemeten wordt; moeten "leg op de smoker" en "rook vier uur" apart, dan zíjn dat twee
  stappen.

De details per stap (apparaat, temperatuur, volgorde) horen bij de stap zelf te staan, niet
achter nog een klik — in de keuken klik je niet.

### Wat je in twee seconden moet zien

1. Waar ben ik nu, en wat is de volgende handeling.
2. Welke delen vooruit kunnen — dat is het verschil tussen een rustige en een gekke dag.
3. Hoeveel er nog niet bekend is, zonder dat het alarmerend wordt.

---

## Huisstijl

Donker, rustig, professioneel keukengereedschap. **Niet** het grijze systeemvenster-gevoel
dat er nu is — dat komt doordat een vorig scherm kleurtokens gebruikte die niet gedefinieerd
waren en dus nergens op uitkwamen. Gebruik echte waardes.

```
achtergrond      #121214        de app-canvas
paneel           #1e1e22        kaarten, panelen, dialogen
diep             #0e0e10        gutter, ingedrukt
tekst            #f5f5f5
gedempt          #8a8f98        bijschriften, wat-je-niet-hoeft-te-lezen
lijn             rgba(245,245,245,.10)

accent (brand)   #FFBF00        amber — knoppen, actieve staat, het NU
accent zacht     rgba(255,191,0,.14)
waarschuwing     #C9A14A        iets klopt niet helemaal
alarm            #B4442F        dit gaat mis
```

De amber is spaarzaam: hij is voor wat nú moet gebeuren en voor de primaire knop. Als alles
amber is, is niets het.

Afgeronde hoeken 10–12 px. Eén schaduw-niveau, subtiel. Geen glas, geen gradiënten over
grote vlakken, geen iconenbibliotheek-explosie. Cijfers in een tabulaire variant zodat
kolommen uitlijnen.

Getallen die met tijd te maken hebben mag je typografisch laten spreken: `4 uur` is
belangrijker dan het woord "wachten" ernaast.

---

## De artboards

### 1 · Receptuur, delen dicht — de rustige toestand
De chicken sandwich met drie dichtgeklapte delen. Bovenaan de naam van het gerecht, het
aantal porties, en de eerlijke tijdsregel. Dit is wat je ziet als je de pagina opent.

### 2 · Receptuur, één deel open
Hetzelfde scherm met "Het gerecht zelf" uitgeklapt. Laat zien hoe een stap met veel bekend
(stap 10: apparaat, 220 °C, kern 75 °C, na stap 8) er staat náást een stap met bijna niets
(stap 9).

### 3 · Een recept met negen dagen doorlooptijd
De spiced maple bacon. Twee delen: de pekel en het spek zelf. Stappen: *7 dagen pekelen, elke
dag omdraaien* — *2 dagen drogen in de koeling* — *roken op 115 °C tot kern 65 °C*. Hoe maak
je zichtbaar dat dit gerecht negen dagen vóór het event begint, zonder dat het scherm in
paniek raakt?

### 4 · De goedkeur-lade, compleet
Het scherm na het lezen van een kookboekfoto. Vier blokken onder elkaar:

- **Vervallen op onze apparatuur** — wat het boek zei en hier niet geldt, met de reden.
  Bijvoorbeeld: *"Appelhoutchunks tussen de gloeiende kolen schikken"* → *"De pelletgrill
  maakt zijn eigen rook."* Doorgestreept, met de reden eronder.
- **Hier komt hij zelf niet uit** — keuzes met twee tot vier opties als knoppen.
  Bijvoorbeeld: *"Op welke pittemperatuur garen we de porchetta?"* met *130 °C · 150 °C ·
  180 °C*.
- **Onderdelen die je nog niet hebt** — per stuk: aanmaken of overslaan, en bij aanmaken een
  eenheid kiezen.
- **De stappen** — gegroepeerd per deel, zoals artboard 1 en 2.

Onderaan één primaire knop, en daaronder één regel die zegt wat er nog openstaat.

### 5 · De lade met de knop op slot
Dezelfde lade met vier openstaande beslissingen. De opslaan-knop is uit. Er staat één regel:
*"Nog 4 dingen te beslissen — bovenaan: Op welke pittemperatuur garen we de porchetta?"*
Ontwerp hoe een openstaande beslissing eruitziet naast een beantwoorde.

### 6 · Het uploadscherm
Leeg (sleepvlak) en gevuld (twee foto-miniaturen, een opmerkingveld, de knop *Lees het
recept*). Plus de wachtstand: het lezen duurt ongeveer een minuut, en er is niets te doen.

### 7 · Op de telefoon, 390 px breed
De receptuur zoals Lars hem in de keuken leest. Eén hand, vette vingers. Wat valt weg, wat
wordt groter.

### 8 · De beslissingen achteraf
Een klein blok dat op de gerechtpagina laat zien wat er ooit gekozen is:
*"Op welke pittemperatuur garen we de porchetta? → 150 °C — langere garing, zwoerd blijft
bleker."* Dit is bewijsmateriaal, geen instelling; het moet rustig en secundair zijn.

---

## Wat je niet moet doen

- **Geen voortgangsbalken over een recept.** Een recept is geen taak die voor 60 % af is.
- **Geen groen vinkje bij alles wat gelukt is.** Dan valt op wat er mis is niet meer op.
- **Geen tijd verzinnen waar er geen is.** Als er geen duur bekend is, staat er *tijd wordt
  gemeten* — niet een schatting, niet een streepje dat op nul lijkt.
- **Geen kooktimer-esthetiek.** Dit is geen recept-app voor thuis; er staat geen mooie foto
  van het eindresultaat en er is geen "start koken"-knop.
- **Niet alles amber.**

## Levering

SVG of HTML/CSS, donkere achtergrond, echte tekst uit dit document (geen lorem ipsum). Per
artboard één regel waarom je de belangrijkste keuze zo gemaakt hebt.
