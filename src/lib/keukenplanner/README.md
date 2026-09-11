# Keukenplanner

De planner die een productiedag omzet in microtaken. Hoort bij
`docs/keukenplanner-bouwplan.md` — dat legt uit *waarom*; dit legt uit *waar wat staat*.

## De regel die alles bij elkaar houdt

**Deterministisch rekenwerk door code, AI alleen voor oordeel en taal.** Er zit geen
taalmodel in deze map en dat blijft zo. Elke module hier is puur: geen database, geen
`Date.now()` — `nu` wordt altijd meegegeven. Dat is de reden dat dit te testen is, en dit is
de enige plek in de app waar een fout zich de hele dag opstapelt.

## Wat waar staat

| Bestand | Wat het doet |
| --- | --- |
| `types.ts` | Het vocabulaire. Geen logica. |
| `duur.ts` | Actieve tijd (vast + per eenheid), passieve tijd (schaalt met het stukgewicht), en welke van de vier soorten aandacht een blok vraagt. |
| `schatter.ts` | Leren van de werkelijkheid: mediaan, drempel van 10%, spreidingsbewaker, monitorstand. |
| `batchen.ts` | Batchen (bewerking + component) én meerijden (apparaat + temperatuur), begrensd door capaciteit. |
| `terugrekenen.ts` | Van uitlevermoment terug naar uiterste starttijd; marge per taak. |
| `gatenvullen.ts` | Werk in passieve blokken, met de drie soorten passief. |
| `plan.ts` | Voegt alles samen tot wat het scherm krijgt. |
| `laden.ts` | De brug naar de database. De enige module hier die Supabase kent. |
| `meting.ts` | Een meting wegschrijven bij klaar melden. |
| `meethistorie.ts` | Periodes openen, afsluiten en teruglezen. |
| `validators.ts` | Invoercontrole voor de `/api/productie/*`-routes. |

## Vier dingen die je makkelijk fout doet

**1 · Onbekend is geen nul.** Een stap zonder duur krijgt `null`, niet `0`. Hij wordt getoond
maar valt buiten het gatenvullen. Een leeg veld verslaat een schatting die zich voordoet als
feit — dezelfde regel als bij kostprijzen.

**2 · Batchen is niet hetzelfde als meerijden.** Batchen maakt van drie handelingen één (ui
snipperen voor drie gerechten). Meerijden zet twee dingen tegelijk in één apparaat (pulled
beef en oerham op 120 °C). Alleen meerijden heeft een temperatuurtoets nodig — spareribs
draaien op 110 en horen er niet bij, hoeveel plek er ook over is.

**3 · Passief betekent niet altijd weglopen.** Drie soorten: vrij (rusten, marineren),
gebonden (elk half uur natspuiten — je blijft in de buurt) en bewaakt (`toezicht_nodig`).
Alleen bij vrij past er willekeurig werk in het gat.

**4 · Leren gebeurt op de bewerking, niet op de receptstap.** Bij duizend gerechten haalt een
losse stap nooit vijf metingen. "Ui snipperen" haalt ze binnen een week, of het nu in gerecht
12 of gerecht 840 zit. Zie de index `idx_taakmetingen_bewerking`.

## Wat het scherm krijgt

`GET /api/keukenscherm/vandaag` levert een `Keukenscherm`-object met kant-en-klare tekst.
Het scherm rekent en formatteert niets. Dat is geen luiheid: zodra het scherm zelf gaat
rekenen kunnen scherm en planner uit elkaar lopen, en dan hangt er een ding aan de muur dat
iets anders beweert dan het systeem denkt.

## Tests

`npx vitest run src/lib/keukenplanner` — 105 tests. Elke test die een grens bewaakt heeft de
reden in zijn naam staan, zodat je bij een rode test weet of je een fout hebt gemaakt of een
regel hebt veranderd.
