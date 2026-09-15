# Leveranciersvoorkeur: Bidfood rekent, jij kiest de winkel

*Plan, 14 september 2026. Volgt op PR #226 (Bedenk met AI zet echte receptuur door).*

## Wat Mathijs wil

1. **Kostprijs altijd op Bidfood.** Bidfood is nummer 1, Sligro nummer 2. In de kostprijs van een recept doet Sligro niet mee.
2. **Merk en soort staan in het recept**, niet in een aparte AI-laag. "Hellmann's Real", "Dijon", "Maldon" — de matcher zoekt precies dát bij Bidfood.
3. **Meerdere Bidfood-producten die even goed passen → de middelste prijs.** Niet de goedkoopste, niet de duurste; uitwijkruimte naar beide kanten.
4. **Heeft Bidfood het niet → de AI geeft 3 gerichte alternatieven** (≈90% in de buurt) uit de Bidfood-catalogus. Mathijs accepteert er één, of laat de regel leeg en vult zelf in.
5. **Bestellijst: per ronde de winkel kiezen.** "Vandaag naar de Sligro" → elke regel wordt omgezet naar het Sligro-product; wat Sligro niet heeft staat apart. Bidfood = online, Sligro = fysiek ophalen.

## Hoe het nu werkt (gemeten 14 sep)

- De matcher (`src/lib/recipeMatch.ts` + `src/lib/ingredientMatchDb.ts`) kiest op **naam-overlap**; prijs speelt geen rol. Bij gelijke naam wint de bron: eigen bibliotheek → eigen voorraad → prijslijst (Catalogus A) → gescande catalogus (Catalogus B).
- **Bidfood staat vrijwel volledig in Catalogus B** (10.125 producten, laagste prioriteit); Sligro in Catalogus A (2.833, hogere prioriteit). Bij gelijke naam wint Sligro dus van Bidfood — het omgekeerde van de wens.
- De bestellijst (`src/lib/dal/bestelvoorstel.ts`) groepeert op de vaste koppeling per voorraad-item (`inventory.preferred_supplier_product_id`). Er is geen "vandaag Sligro"-schakelaar.
- In het gerecht-formulier zijn de AI-ingrediëntregels alleen-lezen ("Oude kostprijsberekening"); je kunt er nog geen ander product bij aanwijzen.

## Golf 1 — Bidfood rekent

- **Veld** `leveranciers.voorkeur_rang` (1 = Bidfood, 2 = Sligro, leeg = doet niet mee). Instelbaar op de leverancierskaart. Andere cateraars zetten hun eigen groothandel op 1.
- **Matcher**: eigen bibliotheek en eigen voorraad blijven vooraan (dat is wat je al hebt). Daarna alléén producten van de rang-1-leverancier, uit beide catalogi. Geen rang-1 ingesteld → gedrag van nu.
- **Middelste prijs**: kandidaten die op naam binnen 0,05 van de beste zitten en dezelfde basis-eenheid hebben, sorteren op prijs per eenheid; de middelste wint.
- **Zichtbaar**: elke chip toont de leverancier ("mayonaise · 30 g · Bidfood").
- **Tests** in `recipeMatch.test.ts`: rang-1 filter, middelste prijs, terugval bij geen instelling.

### Golf 1 — gebouwd en gemeten (14 sep, PR volgt op #226)

Gemeten op 22 echte regels tegen de live Bidfood-catalogus. Wat de meting blootlegde en wat er daardoor extra in zit:

- **De zoekgreep kapte af op 25 zonder volgorde.** Bidfood heeft 58 mayonaises en 108 pepers; "Fijn zeezout, bus 500 gr" bestond maar viel buiten de greep. Nu 150 per bron en zoeken op de drie langste woorden i.p.v. alleen het langste ("versgemalen" vond geen enkele peper).
- **Verpakkingswoorden en getallen tellen niet meer mee** in de naam-score. "Appelazijn, fles 500 ml" won van "Appelazijn, can 5 ltr" omdat "can 5 ltr" één woord langer was — factor 8 in prijs.
- **"Even goed" = exact dezelfde naam-score.** Een ruimere marge liet "Truffel mayonaise" in de groep en dan koos de middenprijs een smaakvariant.
- **Hoofdwoord vooraan gaat vóór**: "Roomboter ongezouten" is boter, "Croissant roomboter" een croissant.
- **Uitschieter-rem**: "Zwarte peper, pot 47 gr" stond voor € 18,13 (€ 386/kg, een doos-prijs als potje ingelezen) en won op exacte naam. Is de winnaar > 3× de middenprijs van zijn productfamilie, dan neemt het beste normaal geprijsde familielid het over, zekerheid "middel". Eigen bibliotheek en voorraad blijven ongemoeid.
- **Gram ≈ milliliter** voor sauzen, zuivel, olie: de AI schrijft "40 g mayonaise", Bidfood verkoopt per ml. Wordt 1:1 gerekend, zichtbaar als "≈", nooit "hoog".
- **Eén kort gedeeld woord is geen match**: "Basterdsuiker (wit)" koppelde aan "Molenaarsbrood wit".

Bekende gevallen die golf 1 níet oplost (bewust — dit is semantiek, dus golf 2):

- **"roomboter" → "Roomboter apfelstrudel"**: Bidfood's gewone boter heet "Roomboter ongezouten kluit, doos 5 kg"; op woorden alleen is niet te zien dat de strudel iets *met* boter is.
- **Merknaam in het recept** ("Hellmann's Real Mayonaise") maakt de vergelijkingsgroep leeg; de uitschieter-rem kan dan niet ingrijpen.
- **Synoniemen**: "appelciderazijn" ↔ "appelazijn", "Worcestershiresaus" ↔ "Worcestershire saus".

## Golf 2 — Geen Bidfood-treffer → 3 alternatieven

- **Route** `/api/recipe/alternatives`: ingrediënt + hoeveelheid → ruime zoekopdracht in de Bidfood-catalogus (per woord, ~40 kandidaten) → AI kiest de 3 dichtstbijzijnde met één regel waarom ("neutrale mayonaise, zelfde vetgehalte"). Levert niets op → AI stelt 3 zoektermen voor, zoek opnieuw. Prijs komt altijd uit de catalogusregel, nooit van de AI.
- **Dezelfde AI-stap als controle bij twijfel**: bij een match met zekerheid "middel" of "laag" (roomboter → apfelstrudel) vraagt dezelfde route "is dit het ingrediënt, of iets dat ermee gemaakt is?" en biedt anders de 3 alternatieven aan.
- **UI**: in de Bedenk-preview én in het gerecht-formulier krijgt een niet-gekoppelde regel een oranje chip "niet bij Bidfood" met de knop *3 alternatieven*. Kiezen pint het product vast; *Laat leeg* houdt de regel zonder kostprijs (eerlijk "nog geen kostprijs").
- Daarvoor moeten de AI-ingrediëntregels in het formulier **bewerkbaar** worden: per regel *kies ander product* (catalogus-zoek, alleen rang-1) en *verwijder*. Dat vervangt het alleen-lezen blok.

### Golf 2 — gebouwd en gemeten (15 sep)

- Route `/api/recipe/alternatives` (Opus, lage inspanning, ~1–2 ct per vraag, 4–8 s): ruime greep op alle woorden → bij minder dan 5 kandidaten eerst zoekwoorden van de AI (synoniemen) → AI beoordeelt de huidige koppeling en kiest max. 3 nummers uit de lijst → prijs uit de catalogusregel.
- Gemeten: "roomboter" met apfelstrudel gekoppeld → *"Een apfelstrudel gemaakt met roomboter is geen roomboter als ingrediënt"* + kluit 5 kg en rol 1 kg. "appelciderazijn" → Appelazijn can 5 ltr. "Worcestershiresaus" → Worcestersaus. "kersenhoutsnippers" → eerlijk niets.
- Valkuil onderweg: de 60 kandidaten voor het model waren alfabetisch gesorteerd, en bij "koude ongezouten roomboter, in blokjes" viel de kluit buiten de 60. Nu gesorteerd op naam-gelijkenis.
- Zelfde kluit staat twee keer in Catalogus B (twee regels, iets andere prijs) → ontdubbeld op naam.
- UI: chips in Bedenk met AI zijn klikbaar (groen = prijs, ? = twijfel, kies = niets gevonden); het gerecht-formulier heeft nu bewerkbare regels (`IngredientRegels`) met product, leverancier, prijs p.p., zekerheid, "ander product" en verwijderen. Kostprijs p.p. telt opnieuw op na elke wijziging. Een keuze van de kok wordt "hoog".
- Meegenomen: de allergeencheck sloeg lettercodes op (E, M) naast woorden (ei); nu één taal, datamigratie gedraaid.

## Golf 3 — Bestellijst: kies de winkel

- Bovenaan het bestelvoorstel: *Bestellen bij: Bidfood (online) · Sligro (ophalen)*. Standaard = rang 1.
- Kies je Sligro: elke regel wordt opnieuw gekoppeld met de matcher beperkt tot Sligro. Wat niet gevonden wordt staat in een apart blok "Niet bij Sligro (n)" met de knop *toch bij Bidfood*.
- De keuze geldt voor die ronde; de vaste koppeling per voorraad-item blijft de Bidfood-standaard.

### Golf 3 — gebouwd en gemeten (15 sep)

- Balk bovenaan /inkoop: *Bestellen bij — Zoals gekoppeld · Bidfood · Sligro* (de leveranciers met een rang). Keuze in de URL (`?winkel=<id>`), dus herladen en delen werkt. "Verstuur" stuurt dezelfde winkel mee, anders verzond je de andere lijst.
- Winkel gekozen → elk tekort-item wordt op naam gezocht in de catalogus van die winkel (zelfde matcher als de receptuur). Gevonden → in de winkel-bucket met productnaam, zekerheidsstip, pakmaat en **catalogusprijs** van die winkel (gaat vóór de laatste bonprijs). Niet gevonden → blok "Niet bij … (n)" met de vaste leverancier erachter.
- Twee lessen uit de meting: voorraad-items heten naar de winkel ("kippendij makro", "bavette beef club 29") — die woorden gaan uit de zoeknaam; en "hop&bites pulled pork" is eigen productie → nooit naar een winkel (op bedrijfsnaam herkend).
- Strenger dan bij een recept: alleen een treffer als álle woorden van het item in het product zitten en de zekerheid niet "laag" is. "hotdog broodjes" landde anders op *Hotdog halal, blik 32 stuks*. Gevolg: "gerookte bavette" en "pastrami" komen in "niet bij Bidfood" — één keer *Koppel aan Bidfood* op de regel en ze staan er voortaan.
- Meting: Bidfood 3 zekere treffers + 6 niet-bij (2 eigen productie); Sligro 2 + 7.

## Golf 4 — Koppelronde + leren (gepland 15 sep)

Waarom: de woord-matcher kent geen synoniemen ("appelciderazijn" ↔ "Appelazijn"); golf 2 lost dat op, maar alleen op klik. En wat Mathijs één keer bevestigt, moet de app daarna gewoon wéten.

Twee gevallen, één harde regel:
- **Andere naam voor hetzelfde** (appelciderazijn = appelazijn = ciderazijn) → ja, automatisch.
- **Ander product dat erop lijkt** (frietsaus naast mayonaise, 70% naast 80%) → nooit zonder Mathijs; de AI mag het voorstellen mét reden, niet kiezen.

1. **Eenmalige koppelronde vanaf Mathijs' kant** — de bestaande gerechten tellen mee (Mathijs, 15 sep: "die moet je wel meedoen"). Alle ingrediëntnamen die al in de app staan (gemeten 15 sep: 51 uit gerechten, 63 componenten, 28 voorraad-items, ~150 uniek) → per naam het Bidfood-product via de alternatieven-route → **goedkeur-lijst** (patroon van de prijslijst-lezer): ingrediënt → voorgesteld product → prijs → reden; per regel *goed* / *ander product* / *laat leeg*. Kosten: enkele euro's, eenmalig.
2. **Alias per bedrijf.** Wat Mathijs goedkeurt landt in `org_product_aliases` (bestaat al voor de prijslijst-lezer; de receptuur-matcher kijkt er nog niet in). Alias = genormaliseerde ingrediëntnaam → product (id + naam, zodat hij na een nieuwe prijslijst op naam terug te vinden is). De matcher kijkt eerst in de aliassen, dan pas in de catalogus.
3. **Automatisch leren.** Vindt de woord-matcher niets (of alleen "laag"), dan draait de synoniemen-stap meteen mee bij het maken van het recept — niet pas op klik. Resultaat krijgt "?"; na een ja van Mathijs wordt het een alias. Een bekend ingrediënt is daarna direct goed, zonder AI.

Niet: alle 10.125 Bidfood-producten door de AI benoemen (benoemt 9.900 producten die nooit in een recept komen; helpt bij vinden, niet bij kiezen; elke nieuwe prijslijst maakt het weer onvolledig).

### Golf 4 — gebouwd en gemeten (15 sep)

- **Tabel `ingredient_aliases`** (migratie `20260915110000`, live): naam-sleutel → bron + id + productnaam, uniek per organisatie. Eigen tabel naast `org_product_aliases` (die hangt aan master_products/Catalogus A; Bidfood zit in B en een alias mag ook naar bibliotheek/voorraad wijzen). Sleutel = naam zonder hoeveelheid en eenheid ("0,05 stuks kaneelstokje" → "kaneelstokje"); beschrijvende woorden blijven ("fijn zeezout" ≠ "grof zeezout").
- **Matcher kijkt eerst in de aliassen** → `via_alias`, zekerheid hoog, geen AI. Is de rij weg (nieuwe prijslijst) → op productnaam in dezelfde bron, anders gewoon zoeken.
- **AI-synoniemenstap automatisch** in `/api/recipe/match-ingredients` met `ai: true` (Bedenk met AI en foto-flow sturen dat mee): max. 8 regels per aanroep, vier tegelijk. Alleen `zelfde_product: true` wordt gekozen (zekerheid middel, "?"); een ánder product komt terug als `ai_voorstel` en wacht op de kok. Fouten worden geteld en gelogd, niet stil geslikt.
- **Leren op bevestiging**: keuze in het alternatieven-paneel → alias; opslaan van een gerecht → alle regels met zekerheid hoog worden alias (een "?" niet).
- **Koppelronde** op `/gerechten/koppelronde` (knop in de gerechten-kop): alle ingrediënten uit de gerechten (bibliotheek en voorraad niet — die koppelen alleen aan zichzelf), per acht door de matcher, goedkeur-lijst met *goed* / *ander product* / *laat leeg* en "n groene goedkeuren" in één keer. Voorstellen overleven een herlaad in de browser.
- Gemeten: 51 ingrediënten in 70 s voor € 0,17 — 17 exact, 4 via AI ("appelciderazijn = appelazijn", "frietsaus = fritessaus 25%"), 7 AI-voorstellen met eerlijke reden ("ananas op sap in blik is geen verse ananas", "piripirisaus is een saus, geen marinade"), 1 niets, 22 ter beoordeling. Leer-lus bewezen: na één "goed" komt "knoflook" terug als via_alias.
- Bekend gat dat blijft: een woord-treffer met zekerheid hoog op een ánder product ("roomboter" → "Roomboter apfelstrudel") gaat niet langs de AI; de koppelronde is precies de plek waar dat één keer rechtgezet wordt.

**Eindtest "American Barbecue Saus" (15 sep, op verzoek van Mathijs)** — één gerecht van idee tot database. Eerste ronde: 7 van 16 goed, en vijf fout mét prijs ("bruine basterdsuiker" → *Bruine bonen*, "Worcestershire sauce" → *Hemp sauce*, "water" → *Coconut Water*, "melasse" → *Granaatappelmelasse*, "droge mosterd" → natte mosterd). Oorzaken en fixes:
- een gedeeltelijke naam-treffer moet het **hoofdwoord** (langste woord, haakjes tellen niet) bevatten — "bruine" of "sauce" alleen is niets;
- de AI controleert nu **ook de twijfelgevallen** ("?"), niet alleen de lege: klopt het niet → hetzelfde product onder een andere naam, of leeg met een voorstel ("vloeibare rook" → *Softijsmix* werd afgekeurd);
- **water is gratis**;
- de synoniemenstap draait ook als er wél kandidaten zijn maar niets écht lijkt, en zoekt **per woord apart** (één OR-greep met gedeelde limiet liet "Worcestersaus" weer buiten de 150 vallen); via synoniemen gevonden producten gaan vooraan, gewogen naar hoe specifiek het synoniem is ("worcestersaus" wint van "saus");
- **dieetclaims** (vegan, glutenvrij, …) uit de AI-tags gehaald — hij zette "vegan" op een saus met Worcestersaus (ansjovis);
- gang nooit leeg (viel op null terwijl het formulier "Bites" toonde), en een bedacht gerecht komt als **concept** binnen.
Tweede ronde: 13 van 15 met prijs en reden, 2 eerlijk leeg (basterdsuiker, melasse — Bidfood heeft ze niet), allergenen *mosterd, gluten* in één taal, 9 aliassen geleerd bij opslaan. ~15 ct AI per gerecht, ~30 s. Micro-stappen: 0 — dat is golf 5.

## Golf 5 — Eén receptuur-pijplijn (gepland 15 sep)

Mathijs, 15 sep: *"Ik wil alles met AI gaan bedenken, en die AI moet dan uit zichzelf die micro-stappen erin zetten."*

Nu zijn er twee werelden:
- **Receptlezer / ontleder** (`/api/recipe/ontleed`, ook zonder foto: "bedenk dit gerecht op onze werkwijze") → `recipe_steps` met bewerking, handtijd, wachttijd, "hoort bij onderdeel". Hier werken kookbord, planner en batchen op (ui snipperen ×3 = één keer).
- **Bedenk met AI** en **AI: vul recept in** (`/api/recipe-generate`, `/api/recipe/ai-fill`) → `bereidingswijze` als platte tekst. Onzichtbaar voor de keuken.

Golf 5 maakt daar één pijplijn van:
1. **Bedenk met AI gaat door de ontleder.** Idee → gerecht → onderdelen → micro-stappen op onze werkwijze → ingrediënten, meteen gekoppeld via golf 1–4. Geen tekst-recept meer; de stappen zijn het formaat. "AI: vul recept in" gaat dezelfde weg.
2. **De bestaande gerechten** (26, met alleen tekst-bereiding) gaan één keer door de ontleder, met een goedkeur-lijst per gerecht zoals bij de receptlezer, zodat ook die op het bord komen en gebatcht kunnen worden.
3. **Opslaan via de bestaande ontleed-opslagroute** — één plek voor gerecht + componenten + stappen + ingrediëntkoppelingen.

Eerst controleren, niet aannemen (uit een eerdere sessie): vult de ontleder al een eerste schatting van de duren in (het bord kan niet plannen op "onbekend"), en verdampen de keuze-antwoorden van de kok nog bij opslaan.

Volgorde: golf 4 → golf 5, na merge van #226 en #227.

## Wat we bewust níet doen

- Geen "goedkoopste wint": levert het verkeerde merk en een kostprijs die je niet haalt.
- Geen aparte AI die per gerecht bepaalt welke mayonaise "past": dat staat al in de recepttekst en Mathijs kiest zelf als hij het anders wil.
- Geen automatisch overschrijven van een product dat Mathijs zelf heeft aangewezen.

## Volgorde

Golf 1 → Golf 2 → Golf 3, elk een eigen PR, elk 100% af inclusief UI. Golf 1 raakt alleen de matcher + één veld en is direct meetbaar op de twee testgerechten van vandaag (Alabama White Sauce: 7 van 12 gekoppeld; aioli: 4 van 11).
