# Plan: pakjes van Veerbeek scannen, bij binnenkomst en aan de kassa

Stand: 18 november 2026. Besluit Mathijs: vlees van Veerbeek houdt de sticker van Veerbeek en
wordt verkocht tegen de prijs op die sticker. Elk pakje wordt bij binnenkomst gescand, en aan
de kassa nog een keer.

## In gewone taal

1. **Binnen.** Bij Winkel, Binnen scan je elk pakje met de scanner. BBQ Architect leest uit de
   streepjescode welk product het is en wat het kost. Kent hij het artikelnummer nog niet, dan
   kies je een keer het product; daarna weet hij het. Je vult de THT van het A4 een keer in
   voor de hele levering. Elk gescand pakje komt in de lijst "ligt in de winkel", met prijs en THT.
   Verkeerd gescand: met een tik haal je het weer weg.
2. **Kassa.** Je scant het pakje. De kassa herkent de code van Veerbeek, zoekt het product op en
   zet het op de bon voor de prijs uit de code. Elk pakje is een eigen regel.
3. **Daarna.** BBQ Architect zet dat pakje op verkocht (het oudste met die code eerst). Bij
   Datums zie je welke pakjes bijna over de datum zijn; naar de keuken of weggooien gaat zoals
   bij de kaasstickers.

Twee pakjes met dezelfde prijs hebben dezelfde code. Dat geeft niets: het zijn dan twee pakjes
met dezelfde code, en elke verkoop haalt er een af.

## De streepjescode van Veerbeek

EAN-13: `21 AAAAA PPPPP C`. `21` = winkelcode met prijs, `AAAAA` = artikelnummer van Veerbeek,
`PPPPP` = totaalprijs in centen, `C` = controlecijfer (EAN). Gewicht en THT staan er niet in.
Nagerekend op 38 stickers (foto's 18 november), bijvoorbeeld `2101015028237` = 01015
haasbiefstuk, € 28,23.

## Wat er verandert

### BBQ Architect (migratie + code)

| Stap | Wat | Test |
|---|---|---|
| B1 | `winkel_producten.prijscode_nr` (5 cijfers, uniek per organisatie): het artikelnummer van de leverancier in de prijscode. Gevuld voor de 38 producten van Veerbeek (tabel hieronder) | SQL-test: uniek, alleen 5 cijfers |
| B2 | `winkel_stuks` kent `bron` = `sticker` (zoals nu) of `prijscode`. Bij `prijscode`: geen gewicht, geen kiloprijs, geen stickernummer; wel code, prijs en THT | SQL-test |
| B3 | `winkel_stuk_binnen_prijscode(org, code, tht, partij)`: controleert het controlecijfer, zoekt het product op het artikelnummer, legt een stuk vast (op voorraad, prijs uit de code). `winkel_stuk_weg` om een verkeerde scan terug te draaien (alleen als hij nog ligt) | SQL-test: goede code, fout controlecijfer, onbekend nummer, terugdraaien |
| B4 | Scherm Winkel, Binnen: een scanveld (de scanner typt de code en drukt op Enter), de THT van de levering, de lijst gescande pakjes met "weg", en bij een onbekend nummer de vraag welk product het is | Vitest op het uit elkaar halen van de code |
| B5 | `GET catalogus`: per artikel optioneel `prijscode_nr` (alleen bij een artikel met een vak en een product met een prijscode). Een oudere kassa slaat het veld over | Contracttest |
| B6 | `POST bonnen`: nieuwe `prijs_bron: "prijscode"`. Controle: code met geldig controlecijfer, `stuk_cents` = prijs uit de code, anders melding in Te controleren (`prijscode_prijs`). De regel boekt geen grammen af; het stuk gaat op verkocht. Is er geen pakje binnengemeld met die code, dan wordt de bon toch geboekt en komt er een melding `prijscode_niet_binnen` | SQL-test; de bon wordt nooit geweigerd |

### Toonbank (andere repository)

| Stap | Wat | Test |
|---|---|---|
| T1 | Contract: `Artikel.prijscode_nr` (optioneel) en `prijs_bron: "prijscode"`, schema en voorbeeld `bon-prijscode.json` | Contracttest |
| T2 | `zoekOfScan`: een code van 13 cijfers die met `21` begint en een geldig controlecijfer heeft, is een prijscode. Artikel via `prijscode_nr`, prijs uit de code. Onbekend nummer: "Dit pakje kent de kassa niet" | Kern-tests |
| T3 | Op de bon: een eigen regel per pakje, prijs uit de code, geen plus of min (zoals bij een kaassticker); `scan_code` gaat mee | Kern-tests |

Contract toonbank/v1 blijft achterwaarts compatibel: alleen nieuwe, optionele velden en een
nieuwe waarde voor `prijs_bron` die BBQ Architect eerst moet kennen. Volgorde live: eerst
BBQ Architect (migratie, dan code), dan de Toonbank.

## Wat niet verandert

- De webshop: die verkoopt vlees per 100 gram en per stuk, met de prijzen van Veerbeek (op
  18 november gelijkgetrokken). Een pakje met een wisselend gewicht past niet bij de webshop;
  dat blijft zo tenzij Mathijs iets anders wil.
- De kaasstickers en wegen.
- Voorraad in grammen voor Veerbeek-vlees: die wordt niet bijgehouden; het tellen gaat per pakje.

## Open

- Live zetten valt in de bevriezing (14 november t/m 3 januari) en op een donderdag: alleen met
  `[noodfix]` en de go van Mathijs. Testen kan eerst op een voorbeeldversie (Vercel bouwt die
  altijd), maar de kassa praat met de echte BBQ Architect.
- Eén sticker op het eerste vel was gescheurd; dat product weten we niet.

## Artikelnummers van Veerbeek (van de stickers, 18 november 2026)

| Nr | Product in BBQ Architect | | Nr | Product in BBQ Architect |
|---|---|---|---|---|
| 00007 | Gekruid gehakt | | 05034 | Metschijf |
| 01015 | Haasbiefstuk | | 05042 | Katenvlinder |
| 01027 | Kogelbiefstuk | | 05064 | Zigeunerschijf |
| 01039 | Entrecote | | 05074 | Roomschijf |
| 01042 | Rib eye | | 05084 | Oma's gehaktbal |
| 01057 | Sucadelap | | 05132 | Beefburger small |
| 01163 | Half-om-half gehakt | | 05174 | Varkenssaucijs |
| 02013 | Schouderkarbonade | | 06016 | Boerenachterham |
| 02064 | Schnitzel, gepaneerd | | 06034 | Boterhamworst |
| 02140 | Speklap zonder zwoerd | | 06081 | Boerenmetworst |
| 02157 | Speklap, gekruid | | 06094 | Runderrookvlees |
| 02166 | Rolladelapjes | | 06106 | Gebraden rosbief |
| 02214 | Houthakkerssteak | | 06119 | Gebraden varkensrollade |
| 02248 | Vleesribben, dik | | 06138 | Gebraden kipfilet |
| 02276 | Verse worst, grof | | 06182 | Gedroogde schenke |
| 03016 | Scharrelkipfilet | | 06246 | Nagelhout, gesneden |
| 03035 | Scharrelkip schnitzel | | 07061 | Opa's droge worst |
| 05023 | Slavink | | 07154 | Grillworst ham-kaas |
| | | | 08020 | Meat & Meals middel |
| | | | 12104 | Kipfilet Indiana |
