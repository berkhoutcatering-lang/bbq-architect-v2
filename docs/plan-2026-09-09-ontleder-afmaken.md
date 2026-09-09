# Plan voor 9 september 2026 — de receptlezer afmaken

Geschreven aan het eind van 8 september, na twaalf echte recepten door de ontleder.
Dit is geen overzichtsplan; het grote plan staat in `docs/keukenplanner-bouwplan.md`.
Dit is de lijst voor één dag, op volgorde van wat er stukgaat als je het overslaat.

---

## Waar we staan

**Bewezen.** Drie recepten zijn via `/gerechten/ontleden` ingevoerd, goedgekeurd en
opgeslagen: sherry glazed buikspek, oerham, pulled pork-terrine. Ze staan in het
gerechtenboek met stappen, apparaten, temperaturen en volgorde, en je leest ze terug op de
gerechtpagina onder **Zo maken we het**.

**Gelezen maar niet opgeslagen.** Negen andere recepten zijn alleen via
`scripts/test-ontleder.ts` beoordeeld — gebruikt om fouten te vinden, niet om de bibliotheek
te vullen. Ze staan dus nog nergens.

**Wat het kost.** €0,09 tot €0,18 per recept, gemiddeld rond de €0,14. Twaalf recepten plus
het herhaald testen kwam op ongeveer €2,90.

### De negen fouten die de twaalf recepten opleverden

Elke regel in de instructie is betaald met een echte fout. Voor het geval iemand zich later
afvraagt waarom een regel er staat:

| Wat er misging | Waar het vandaan kwam |
|---|---|
| Opwarmtijd werd **dubbel geteld** — de planner rekent hem al uit `materieel.opwarm_min`, het recept zette er nog een uur bij | Picanha-burger was de enige die het goed deed |
| Zeven dagen pekelen kwam terug als leeg veld — 10 080 minuten voelde te groot | Spiced maple bacon |
| "Piggy Mix (zie blz. 27)" maakte elke keer een nieuwe bouwsteen aan | Pulled pork + chicken sandwich |
| Een aftakking ("of doorgaren tot 87 °C") kwam als twee opeenvolgende stappen in de lijst — het vlees zou twee keer gegaard worden | Lechon Asado |
| Serveersuggestie stond tegelijk bij *vervallen* én bij *componenten* | Lechon Asado |
| Drie keer achter elkaar "hoe lang raakt de smoker bezet?" bij handelingen van twee minuten | Pulled pork |
| Kerntemperatuur stond in de zin maar niet in het veld | Bacon + burger |
| Apparaattemperatuur idem, gespiegeld | Pork pork pork burger |
| Dezelfde beslissing twee keer op de lijst: de AI vroeg het, en de controle vroeg het daarna nog eens | Porchetta |

**Regime, geen leren.** De AI wordt hier niet slimmer van — er is geen training. Wat groeit
is de werkinstructie (nu zeventien harde regels) en het net van code eromheen. De laatste
vier reparaties waren code, geen instructie: de taalkant raakt uitgeput.

---

## 0. Alles vastzetten — 10 minuten

Er staan 59 gewijzigde bestanden ongecommit, waarvan 46 nieuw. Een hele dag werk hangt aan
één map. Dit gaat vóór alles.

Eén commit voor de receptlezer (ontleder, scherm, opslagroute, `Receptuur.tsx`, de migratie
`20260908180000_kerntemperatuur_apart.sql`, de tests). De bestelstroom-bestanden die er al
lagen apart houden — die horen niet in dezelfde commit.

**Klaar als:** `git status` schoon is en de tests groen op de commit.

---

## 1. Het keuze-gat dichten — het ergste dat er ligt

**Wat er nu gebeurt.** Je kiest op de goedkeur-lade "150 °C" of "kant-en-klare pulled pork".
De controle rekent, de knop gaat open, je slaat op — en dat antwoord wordt **nergens
bewaard**. Het verdampt. `antwoorden.keuzes` komt in de opslagroute helemaal niet voor.

**Waarom dat erger is dan het lijkt.** De porchetta die je opslaat weet dan niet op welke
stand de Yoder moet. Het recept ziet er compleet uit en is het niet — precies het soort
stille leegte waar we het hele systeem tegen bouwen.

**Wat er moet komen.** De gemaakte keuzes horen bij het gerecht bewaard te worden, met de
vraag erbij, zodat je over een half jaar nog kunt zien wat je toen besloot en waarom een stap
op 150 °C staat. Dat vraagt een plek: een `keuzes` jsonb op `gerechten`, of een eigen tabel
als we ze later per event willen kunnen overrulen. **Eerst beslissen welke van de twee**, want
per-event overrulen is precies het soort ding waar de bestelstroom straks om gaat vragen.

**Klaar als:** een opgeslagen gerecht zijn eigen beslissingen terug kan tonen, en de test die
dat bewijst groen is.

---

## 2. Een beantwoorde keuze moet de stap ook echt vullen

Volgt direct uit 1, maar is een aparte handeling. Een stap met `wachtOpKeuze` wordt nu
opgeslagen zonder temperatuur. Antwoordt de kok "150 °C", dan hoort die 150 in `temp_doel_c`
van die stap te belanden — anders staat het antwoord wel in de database maar niet waar de
planner kijkt.

**Let op de valkuil:** de keuze-optie is vrije tekst ("150 °C indirect — vergelijkbaar met het
matig hete vuur"). Daar een getal uit vissen is hetzelfde soort werk als `kernUitTekst`, en
moet net zo voorzichtig: één ondubbelzinnige treffer of niets.

**Klaar als:** de porchetta na opslaan een stap heeft met de gekozen temperatuur erin.

---

## 3. Bouwstenen komen binnen op € 0,00

Elke aangemaakte bouwsteen (Piggy Mix, Pig Spray, Sherry glaze, Dukkah) heeft
`base_cost_cents = 0`. Zolang die leeg zijn is elk gerecht € 0,00 en liegt je marge — al is
het een eerlijke leugen, want de app toont € 0 als "nog geen kostprijs" en niet als 100 %
marge (dat is in juli al rechtgezet).

**De vraag die eerst beantwoord moet worden:** koopt Sam die Piggy Mix kant-en-klaar, of maakt
hij hem zelf uit losse specerijen? Bij het eerste is het een catalogusproduct met een
inkoopprijs; bij het tweede is het een receptje met eigen ingrediënten. Dat is geen technische
vraag maar een keukenvraag, en die moet Mathijs beantwoorden voordat er code komt.

**Niet doen:** een kostprijs schatten om het veld gevuld te krijgen.

---

## 4. De negen gelezen recepten er echt in

Pas nadat 1 en 2 af zijn — anders sla je negen keer een recept op waarvan de beslissingen
verdampen.

Dit is handwerk aan de goedkeur-lade en het hoort door Mathijs gedaan te worden, niet door
mij: bij elk recept staan keuzes die over zijn keuken gaan (welke pellets, centraal of op
locatie, welke gaarheid). Reken op vijf minuten per recept.

De negen: Festival Style Spareribs · Lechon Asado · Pulled Pork · Oosterse gegrilde eend ·
Spitroasted Porchetta · Smokey's Chicken Sandwich · Pulled Pork Sandwich · Chipotle-honey
chicken kebabs · Picanha Steak Burger · Pork Pork Pork Burger · Spiced Maple Bacon · Cuban
Sandwich. (Dat zijn er twaalf; drie ervan staan er al in, dus negen te gaan.)

---

## 5. Nieuwe boeken — zes à acht, niet vijftien

Smokey Goodness heeft één vorm: vlees, rub, roken, kerntemperatuur. Nog twintig recepten
daaruit leveren vooral dezelfde fouten nog een keer op.

Wat wél nieuwe fouten gaat opleveren, is een andere vorm:

- **Patisserie** — grammen, rijstijden, oventemperaturen, geen kerntemperatuur
- **Aziatisch** — fermenteren, weken, marineren over dagen, wokken op vuur dat wij niet hebben
- **Restaurantboek** — denkt in mise-en-place en componenten in plaats van in gangen
- **Vis of groente** — waar helemaal geen kerntemperatuur bestaat en garing op het oog gaat
- **Een boek met sauzen en fonds** — waar de opbrengst (yield) het onderwerp is

Werkwijze per recept: draaien via `scripts/test-ontleder.ts`, de volledige uitvoer lezen (niet
filteren — dat ging op 8 september mis), en pas een regel toevoegen als de fout een *soort* is
en niet een toevalligheid.

**De stopregel blijft van Mathijs:** drie recepten achter elkaar waar niets aan te repareren
valt. Op 8 september waren dat er twee van de drie.

---

## 6. De nachtelijke batch

Pas als 5 een paar keer schoon draait. Vijftien recepten die één voor één een minuut staan te
draaien is onwerkbaar; via de Batch API kost het bovendien de helft. Dat is de laatste stap,
niet de eerste — een batch die de verkeerde instructie uitvoert maakt vijftien keer dezelfde
fout terwijl je slaapt.

---

## Wat we morgen NIET doen

- De ochtendbriefing en de dagstart. Groot, en het leunt op werkende recepturen.
- Het wandscherm bedraden met apparaat-tokens. Bekend gat, maar niet dringend zolang er nog
  niets uit de keuken gestuurd wordt.
- De estafette daadwerkelijk inplannen (`laden.ts` wijst nu apparaten toe op kunde, maar de
  overdracht smoker → steamer wordt nog niet geroosterd).
- Week- en maandplanning.

---

## De grens die we morgen moeten onthouden

De receptlezer wordt niet beter van meer recepten — het regime wordt beter. Wat wél letterlijk
beter wordt van meer data is de **meting**: elke afgevinkte taak leert het systeem hoe lang
díe bewerking op dít materieel met deze handen duurt. Dat is de enige echte terugkoppellus in
het systeem, en die staat nog stil omdat er nog niet uit het systeem gekookt wordt.

Zolang dat zo is blijven alle duren `geschat`. Dat is geen fout, maar het is wel de reden dat
een recept met twintig stappen zonder tijd nog geen planning oplevert. Recepten invoeren vult
het boek; kóken vult de planning.
