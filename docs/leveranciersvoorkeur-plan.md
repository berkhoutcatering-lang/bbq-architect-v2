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

## Wat we bewust níet doen

- Geen "goedkoopste wint": levert het verkeerde merk en een kostprijs die je niet haalt.
- Geen aparte AI die per gerecht bepaalt welke mayonaise "past": dat staat al in de recepttekst en Mathijs kiest zelf als hij het anders wil.
- Geen automatisch overschrijven van een product dat Mathijs zelf heeft aangewezen.

## Volgorde

Golf 1 → Golf 2 → Golf 3, elk een eigen PR, elk 100% af inclusief UI. Golf 1 raakt alleen de matcher + één veld en is direct meetbaar op de twee testgerechten van vandaag (Alabama White Sauce: 7 van 12 gekoppeld; aioli: 4 van 11).
