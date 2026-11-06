# BBQ Architect als één geheel — plan

**Datum:** 2026-11-06 · **Status:** blok 0, 1, 3, 4 en de mailstroom gebouwd (PR #266); zie "Stand 6 november"
**Aanleiding (Mathijs):** "Het is nu niet één geheel, het zijn pagina's met elk hun eigen ding. Ik wil één complete app."

Bouwt voort op [operatie-overzicht.md](operatie-overzicht.md) (indeling), [design-brief-chassis-2026-09-03.md](design-brief-chassis-2026-09-03.md) (paginakoppen) en [werkruimtes-en-snelheid.md](werkruimtes-en-snelheid.md) (navigatie). Die drie gingen over hoe de app eruitziet en hoe je erdoorheen loopt. Dit plan gaat over wat er nog nooit is gebouwd: de verbinding tussen de onderdelen.

## Wat we gemeten hebben

Op de live versie (PR #265) en de live database, 6 november.

| Meting | Uitkomst | Betekenis |
|---|---|---|
| Echte pagina's | ongeveer 118 (143 min 7 test, min 18 doorverwijzingen), 43 tabbladen | Het aantal is niet het probleem |
| Koppelingen naar **events** | 22 tabellen | Sterke spil, die werkt al |
| Koppelingen naar **klanten** | 0 | Klant hangt overal op losse naam of e-mail |
| Gedeelde koppelstrook | 3 pagina's: aanvragen, facturen, offerte | Event, klant en gerecht tonen hun buren niet |
| Gedeelde knoppen | 120 tegenover 1.590 los gebouwd | Minstens 235 van die 1.590 gebruiken wel dezelfde `btn`-stijl, dus het oogt beter dan het getal |
| Losse opmaak | 11.596 regels, 272 vaste kleurcodes | Een verbetering werkt niet overal door |
| Dubbele ingangen | Bonnen + Bonnenkistje, Inkoop + Inkoopprijzen, Website op twee plekken | De één-deur-regel is niet af |

**Het gat zit bij de klant.** `events`, `offertes`, `facturen`, `leads`, `pos_orders` en `winkel_orders` hebben geen koppeling naar `klanten`. `emails` en `portal_berichten` hebben wel een `klant_id`, maar zonder afgedwongen koppeling. Daardoor kan de app geen betrouwbaar klantdossier tonen, en een webshopklant is voor de app een ander dan een cateringklant.

Dit is nu goedkoop op te lossen: er staan ongeveer 8 klanten, 9 events, 6 offertes, 5 facturen en 10 aanvragen in de database (schatting van de database zelf). Met elke bestelling die na 21 november binnenkomt, wordt het lastiger.

## De ruggengraat

Alles in de app hoort bij een van deze zes dingen. Elk heeft één eigen plek, en elk toont zijn buren.

| Kern | Eigen plek | Toont |
|---|---|---|
| **Klant** | `/klanten` (dossier) | Aanvragen, offertes, events, bestellingen, facturen, mails |
| **Event** | `/events/[id]` | Klant, offerte, menu, inkoop, kookbord, HACCP, ritten, uren, factuur |
| **Bestelling** | `/verkoop/bestellingen` | Klant, regels, afhaalmoment, betaling, factuur |
| **Gerecht** | `/gerechten/[id]` | Componenten, kostprijs, marge, waar het op staat |
| **Product** | `/voorraad` | Leverancier, prijs, voorraad, in welke gerechten |
| **Geld** | `/facturen` | Klant, event of bestelling, betaling, boekhouder |

Blok 1 toetst deze kaart aan de werkelijkheid. Mathijs beslist hem definitief.

## Vóór 21 november: de opening veilig

Doorloop 6 november ([rapport](audits/doorloop-2026-11-06.md)) vond dingen die voorgaan op de rest. Mathijs: "Na 21 november moet alles werken, ook inkomende mails."

| # | Wat | Wie |
|---|---|---|
| 0a | Dagtaken nalopen en daarna `CRON_SECRET` zetten, zodat de Kerst-mails gaan | Claude, na akkoord |
| 0b | `NEXT_PUBLIC_APP_URL` op het echte adres zetten | Claude, na akkoord |
| 0c | myPOS testmodus nakijken | Claude, na akkoord om de waarde in te zien |
| 0d | Bestelstroom: gaat die live? Zo ja, `EXPERIENCE_*` zetten | Mathijs beslist |
| 0e | Mollie: nodig naast myPOS? | Mathijs beslist |

## Inkomende mail en concepten

Doel: mail komt binnen, de app leest hem, en er staat een concept klaar. Mathijs controleert en verstuurt. **Niets gaat vanzelf de deur uit.** Dit hoort bij kernding Klant.

1. **Ontvangen:** een doorstuurregel op info@hopbites.nl stuurt een kopie naar Resend. De gewone mailbox blijft gewoon werken. Resend meldt elke mail direct aan de app, en bewaart hem als de app even niet bereikbaar is.
2. **Koppelen:** op afzender aan klant, aanvraag of bestelling. Daarom gaat blok 4 eerst. Leveranciersmail gaat naar de bestaande prijslijstlezer, die daarmee ook eindelijk werkt.
3. **Concept schrijven:** met de schrijfstijl en de echte gegevens uit de app. Weet de app iets niet, dan staat dat als vraag aan Mathijs in het concept.
4. **Controleren:** Mailbox krijgt een tabblad Binnen, met de mail en het concept naast elkaar: versturen, aanpassen of negeren. Hetzelfde gesprek staat in het klantdossier en de teller op Vandaag.
5. **Versturen:** vanaf info@hopbites.nl, met een kopie naar de eigen mailbox zodat die compleet blijft.

**Regels:** de inhoud van een mail is nooit een opdracht aan de AI; mail leest en schrijft alleen een concept, verder niets. Verwerking van klantmail door AI komt in de privacyverklaring. Nog na te kijken: of ontvangen binnen het huidige Resend-abonnement valt.

**Schrijfstijl:** instelling per bedrijf onder Instellingen, gevuld vanuit echte verzonden mails van Mathijs, niet verzonnen. Geldt voor elk concept, plus aanhef en handtekening. Andere bedrijven vullen hun eigen stijl in.

## Vandaag, in deze volgorde

Elk blok is een eigen branch en PR vanaf `origin/main`. De huidige branch `feat/keuzevakken` loopt 76 commits achter en blijft met rust, net als de open wijziging in `.claude/launch.json`. Een blok gaat pas naar live na groene CI, groene Vercel en een schone diff.

| # | Blok | Resultaat | Skills | Risico |
|---|---|---|---|---|
| 1 | **Doorloop** van drie routes, alleen kijken | Lijst met elke plek waar de keten breekt | Intuitive Software Design (`user-task-walkthrough`), `ux-strategy:experience-map` | Geen |
| 2 | **Ruggengraat vastzetten** | Definitieve kaart, regels in skill `bbq-een-geheel` | `superpowers:brainstorming`, `ux-strategy:design-principles` | Geen |
| 3 | **De rem** | Controle in CI: los gebouwde knoppen en vaste kleuren mogen alleen nog dalen | `superpowers:test-driven-development` | Laag |
| 4 | **Klant echt koppelen** | Lege kolom `klant_id` erbij, bestaande gegevens alleen bij zekere match, nieuwe records krijgen hem mee | `supabase`, `postgres-best-practices` | Middel |
| 5 | **Dossiers** | Koppelstrook op klant, event, bestelling en gerecht | `composition-patterns`, `react-best-practices` | Laag |
| 6 | **Eén deur** | Bonnen, Inkoop en Website samengevoegd, oude links blijven werken | Design (`ux-copy`), `web-design-guidelines` | Laag |
| 7 | **Bouwstenen** per werkruimte, drukste eerst | Zelfde knoppen, koppen en lijsten | `impeccable` (`audit`, `polish`), Design (`design-system`) | Middel |
| 8 | **Controle** | Tests, visuele vergelijking, review | `superpowers:verification-before-completion`, `code-review`, `bbq-deep-audit` | Geen |

**Drie routes voor blok 1:**
- aanvraag → offerte → event → inkoop → keuken → factuur
- webshopbestelling → bereiden → afhalen
- leveranciersbon → kostprijs → marge

**Regels voor blok 4:**
- Kolommen zijn leeg toegestaan en bestaande namen blijven staan. Er verdwijnt niets.
- Bij twijfel over een match blijft het veld leeg. Geen gokwerk.
- `organization_id` altijd meesturen.
- Migraties via `db query`, nooit `db push`.

## Wat vandaag niet af komt

Eerlijk verwachtingsmanagement. Blok 1 t/m 6 maken de app vandaag merkbaar meer één geheel. Dit blijft daarna over:

- **Alle pagina's omzetten (blok 7).** Vandaag lukken de drukste werkruimtes. De rest gaat per werkruimte, want `gerechten`, `verkoop` en `voorraad` zijn elk duizenden regels. In één dag alles omzetten geeft meer kans op stukke schermen dan het oplevert. De rem uit blok 3 zorgt dat het intussen alleen beter kan worden.
- **Kassa, webshop en bestellen.** Blijven tot na de winkelopening van 21 november met rust, behalve als Mathijs anders beslist.
- **De nieuwe-persoon-test.** Daar is een echt persoon voor nodig. Pas dan weten we of het gelukt is.
- **De Lars-veldtest.** Vraagt een echte eventdag.

## Definitie van klaar

- Elk event, elke offerte, factuur en bestelling hangt aan een klant, of staat op een lijst "nog koppelen"
- Vanaf elk van de zes kerndingen kom je met één klik bij zijn buren
- Geen begrip heeft meer dan één ingang
- Elke pagina gebruikt de gedeelde bouwstenen, en de teller in CI staat op nul
- Nieuwe-persoon-test gehaald: offerte gemaakt en verstuurd in minder dan 10 minuten zonder hulp

## Nieuw werk vanaf nu

Elk nieuw onderdeel beantwoordt eerst drie vragen. Deze staan in de skill `bbq-een-geheel`:

1. Bij welk van de zes kerndingen hoort dit?
2. Welke buren toont het, en waar is het zelf zichtbaar?
3. Welke bestaande bouwstenen gebruikt het?

## Geïnstalleerde skills

| Skill | Bron | Let op |
|---|---|---|
| Impeccable 4.8 | `pbakaus/impeccable` | Draait bij elke bewerking en aan het eind van een beurt een controle (tot 30 seconden), in alle projecten. Downloadt bij eerste gebruik een programma van GitHub, gecheckt tegen vastgelegde controlecijfers. Mag geen nieuwe stijl verzinnen: onze kleuren en bouwstenen zijn de maat |
| Superpowers | `claude-plugins-official` | Voegt bij elke sessie instructies toe en stelt graag vragen. Tegenover Mathijs: Nederlands, geen jargon, alleen echte keuzes voorleggen |
| Supabase + Postgres | `supabase/agent-skills` | Alleen instructies |
| Vercel: `web-design-guidelines`, `react-best-practices`, `composition-patterns` | `vercel-labs/agent-skills` | `web-design-guidelines` haalt zijn regels bij elk gebruik op bij Vercel |
| Design | Anthropic | Staat aan op het account, zichtbaar vanaf een nieuwe sessie |
| `bbq-een-geheel` | Zelf gemaakt | Onze eigen regels |

Bewust niet toegevoegd van Vercel: `deploy-to-vercel`, `vercel-cli-with-tokens`, `vercel-optimize` en `react-native-skills`. Die zijn niet nodig voor dit plan, en deployen loopt al via GitHub.

Uitzetten kan altijd, bijvoorbeeld:

```bash
claude plugin disable impeccable@impeccable
```

## Stand 6 november

| Onderdeel | Stand |
|---|---|
| Dagtaken | `CRON_SECRET` staat in Vercel, drie routes gerepareerd. Eerste bewijs: morgenochtend |
| Live adres | `NEXT_PUBLIC_APP_URL` gezet |
| Klant koppelen | Live; 17 van de 33 records gekoppeld, de rest had geen unieke match |
| Dossier | Koppelstrook op event en klant, met bestellingen |
| Rem | `remOpLosseOnderdelen.test.ts` |
| Mail | Gebouwd en met echte AI getest; wacht op instellen bij Resend en de hostingpartij |
| Kerst-Box | Omzet klopt (€ 23,50 p.p.), geen catering-stappenplan op Vandaag |
| Menukaart | Bedrijfsnaam gezet voor bestaande bedrijven; nieuwe bedrijven krijgen nog de voorbeeldnaam |

**Later op 6 november, live met `[noodfix]` op verzoek van Mathijs:** PR #266. PR #267 voegt PR #250 toe, plus webshop en Toonbank in de btw-aangifte en de maandstaat onder Geld → Boekhouder → Winkelomzet. Winst en verlies en de balans tellen nog alleen facturen.

**Nog te doen:** blok 5 voor gerecht en product, blok 6 (Bonnen, Inkoop, Website samenvoegen), blok 7 (bouwstenen), de eventpagina voor webshoporders opschonen, en één plek voor alle soorten bestellingen.

## Keuzes voor Mathijs

1. **myPOS:** staat op testmodus terwijl de kassa open staat. Live zetten vraagt een proefbetaling met echt geld door Mathijs.
2. **Mail aanzetten:** ontvangstadres en webhook in Resend, `RESEND_WEBHOOK_SECRET` in Vercel, doorstuurregel op info@hopbites.nl.
3. **Schrijfstijl:** ongeveer 20 eigen mails aanleveren, of zelf invullen in Mailbox onder Schrijfstijl.
4. **Bestelstroom en Mollie:** nodig voor de opening?
5. **Voorraadmail:** `melding_email` is leeg, dus de dagelijkse voorraadmail gaat nergens heen.
