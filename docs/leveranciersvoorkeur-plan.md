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

## Golf 2 — Geen Bidfood-treffer → 3 alternatieven

- **Route** `/api/recipe/alternatives`: ingrediënt + hoeveelheid → ruime zoekopdracht in de Bidfood-catalogus (per woord, ~40 kandidaten) → AI kiest de 3 dichtstbijzijnde met één regel waarom ("neutrale mayonaise, zelfde vetgehalte"). Levert niets op → AI stelt 3 zoektermen voor, zoek opnieuw. Prijs komt altijd uit de catalogusregel, nooit van de AI.
- **UI**: in de Bedenk-preview én in het gerecht-formulier krijgt een niet-gekoppelde regel een oranje chip "niet bij Bidfood" met de knop *3 alternatieven*. Kiezen pint het product vast; *Laat leeg* houdt de regel zonder kostprijs (eerlijk "nog geen kostprijs").
- Daarvoor moeten de AI-ingrediëntregels in het formulier **bewerkbaar** worden: per regel *kies ander product* (catalogus-zoek, alleen rang-1) en *verwijder*. Dat vervangt het alleen-lezen blok.

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
