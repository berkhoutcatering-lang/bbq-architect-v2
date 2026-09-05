# Design-brief — BBQ Architect huisstijl-chassis
Geschreven 3 september 2026, na een doorloop van alle 103 routes.
Bedoeld om integraal te plakken in een design-tool.

---

## De opdracht

Ontwerp het **pagina-chassis** voor BBQ Architect en pas het toe op drie schermen.
Dit is nadrukkelijk **geen nieuwe visuele identiteit** — het ontwerpsysteem bestaat al en werkt.
Het probleem is dat de terugkerende pagina-onderdelen nooit als component zijn gebouwd, waardoor
elke pagina zijn eigen versie heeft verzonnen.

## Wat het product is

BBQ Architect is Nederlandse B2B-software voor BBQ- en eventcateraars: offertes, events,
keuken/prep, HACCP, voorraad en inkoop, boekhouding. Eén eigenaar-gebruiker doet alles zelf
(offerte 's avonds op de bank, prep in de keuken, service in het veld op de telefoon).
Donker thema, warm, ambachtelijk — geen koele SaaS-look. Alle interfacetekst is Nederlands.

Acht hubs in de zijbalk: Vandaag · Plannen · Verkoop · Keuken · Inkoop & Voorraad · Geld ·
Team & Operatie · Systeem. Elke hub heeft sub-tabs.

## Het ontwerpsysteem dat er al is — respecteer dit

CSS-variabelen in `globals.css`, ruim 10.000 keer correct aangeroepen:

```
--bg: #121214          --text: #f8f8f8        --muted: #949494
--border: rgba(130,130,130,.15)
--brand: #FFBF00       (helder amber, primaire actie)
--brand-gold: #c4a35a  (gedempt goud, accenten en labels)
--brand-gold-deep: #9e781c
```

Iconen: lucide-react. Nooit emoji — die staan er nu op sommige pagina's tussen en moeten weg.

**Wat mis is en opgeruimd moet worden:** naast die tokens staan 2.053 hardgecodeerde
hex-kleuren in 372 varianten. Zes goudtinten leven door elkaar: `#FFBF00`, `#c4a35a`,
`#9e781c` (tokens) plus `#B48C14`, `#fbbf24`, `#f59e0b` (geen token). Geef die drie laatste
een plek in het systeem of laat ze vervallen, en geef de drie tokens een heldere rolverdeling.

## Referentiepagina

`/systeem` is de enige pagina die het al goed doet: nul inline styles, volledig opgebouwd uit
gedeelde componenten. Structuur daar: sub-tabbalk als één pillenrij → paginatitel links met
ondertitel → uitklapbaar uitleg-blok → rij van vier KPI-tegels → raster van gelijke kaarten.
Rustig, één accent, veel ademruimte.

**Neem die pagina als maat.** Wat je ontwerpt moet daar naadloos naast kunnen staan.

## De vijf componenten die ontbreken

Deze bestaan nu in nul bestanden en worden op elke hub opnieuw handmatig nagebouwd:

1. **HubHeader** — kruimelpad, paginatitel, ondertitel, rechts een actiezone voor 1 primaire
   knop plus een overloopmenu. Moet ook werken met een lange titel en zonder acties.
2. **SubTabs** — één horizontale tabbalk per hub. Nu bestaan er drie verschillende varianten
   binnen dezelfde hub (Keuken toont in de zijbalk "Kookbord", op de pagina "Menukaarten", en
   op weer een andere pagina "Bedenker"). Eén vorm, die overloopt of scrollt bij veel tabs.
3. **WatKunJeHier** — het uitleg-blok bovenaan elke pagina. Moet standaard inklapbaar zijn en
   een "niet meer tonen" hebben die onthouden wordt. Nu heeft /verkoop dat wel en /plannen niet.
4. **KpiStrip** — rij van 2 tot 6 tegels: label, groot getal, ondertitel, optioneel een trend.
   Moet een eerlijke lege staat kennen ("nog geen data") in plaats van een nul te tonen.
5. **Kaart-familie** — één kaart met varianten: statisch, klikbaar, met media, met statusbadge.
   Nu bestaan MetallicCard, `.panel` en tientallen handgemaakte varianten naast elkaar.

## Schermen om het op toe te passen

### 1. Event-hub — de grootste afwijker
`/events/[id]/hub`, 173 inline style-objecten (de service-pagina zelfs 239, tegenover 0 op
/systeem). Dit is de pagina waar de eigenaar het meest zit, en hij voelt als een andere app.

Wat er nu misgaat:
- **Vijf navigatierijen boven de inhoud**: kruimelpad → hub-tabs (Agenda/Events) → knop "Terug
  naar events" → een eyebrow "EVENT #10 · OFFERTE: COR BERKHOUT" → de eigen tabrij
  (Overzicht/Klantgesprek/Prep/HACCP/Logistiek/Service/Reflectie). Breng dat terug naar één
  kruimelpad en één tabrij.
- Een amberkleurig hero-paneel met gloed en een grote ringmeter waarin zes KPI's zijn verwerkt,
  terwijl de rest van de app KPI's als losse tegels toont.
- Acht actieknoppen in twee rijen in drie verschillende stijlen. Kies één primaire actie plus
  een menu.
- Daarna een tweekolomsindeling met een AI-kolom rechts die nergens anders voorkomt.

De inhoud moet blijven: eventgegevens, dagenteller, KPI's (gasten, omzet, marge, prep-gereed,
saldo), gekoppelde documenten, workflow-stappen, prep-agenda, menukaart-voorvertoning,
crew, locatie, inkoop, HACCP, draaiboek, en de AI-assistent.

### 2. Vandaag — het dashboard
Toont nu drie afzonderlijke blokken die grotendeels dezelfde taken vertellen:
"AI-dagbriefing" (3 items), "Aandacht nodig" (3 alerts) en "Shift-briefing" (7 taken).
"3 facturen vervallen" staat er drie keer, in drie bewoordingen. Daarnaast twaalf AI-prompts
in twee kolommen bovenaan, en een dagenteller-donut die 400 pixels hoog is voor één getal.

Ontwerp één takenlijst waarin die drie bronnen samenkomen, met de bron als klein label.
Niets weggooien, alleen samenvoegen. Denk aan: wat moet vandaag gebeuren, gesorteerd op
urgentie, met tijdsindicatie en één actieknop per regel.

### 3. Klantportaal `/q/[id]` — het enige wat klanten zien
Publieke pagina met het logo van de cateraar, in diens huisstijl (5 tokens, 8 presets).
Bevat: sfeerbeeld, klantnaam, datum/tijd/locatie/aantal gasten, het menu per gang,
een totaaloverzicht met BTW-uitsplitsing, aanbetaling, en twee acties
("Bevestig & betaal aanbetaling" en "Vraag aanpassing").

Wat nu misgaat en in het ontwerp opgelost moet worden:
- Alle gerecht-tegels zijn lege placeholders zonder foto, met een bijschrift
  ("BBQ-FEEST · SFEERFOTO VAN...") bij een foto die er niet is. Ontwerp een eerlijke
  staat zonder foto die er niet uitziet als een laadfout.
- Gangnummering springt (00, 01, 02, 04). Ontwerp een nummering die klopt bij elk
  aantal gangen, of laat nummers weg.
- Lege velden tonen een streepje ("Gasten —"). Bepaal per veld of het weggelaten
  mag worden in plaats van als leegte getoond.

## Randvoorwaarden

- **Donker thema is leidend**, licht mag maar is secundair.
- **Telefoon eerst voor het veld.** Op 375 px loopt de kop nu 4 px buiten beeld waardoor
  "Week 36" leest als "Week 3", staan er drie bel-iconen op één scherm, en staat datum en
  tijd drie keer in de bovenste 300 pixels. Ontwerp de kop opnieuw voor die breedte.
- **Alle bedragen Nederlands**: `€ 1.236,24`, percentages `91,8%`. Nooit een punt als
  decimaalteken. Getallen die in kolommen staan uitlijnen op cijferbreedte.
- **Toetsenbord en toegankelijkheid**: rijen in lijsten moeten echte links of knoppen zijn.
  Nu zijn het kale `div`'s met een klik-handler.
- **Eerlijkheid boven stelligheid.** Als data ontbreekt: geen oordeel tonen. De app zegt nu
  "Marge 97% · Sterk" terwijl zes van de acht gerechten geen kostprijs hebben. Ontwerp
  expliciet hoe een KPI eruitziet die zegt "kan nog niet berekend worden, en dit mist er".

## Wat ik terug wil zien

1. De vijf componenten met hun varianten en toestanden (leeg, ladend, gevuld, fout).
2. De drie schermen in donker thema, desktop 1440 en telefoon 375.
3. Een korte notitie over de rolverdeling van de drie goud-tokens.

Geen nieuwe kleuren of typografie bedenken tenzij het huidige systeem echt tekortschiet —
en zeg dan waarom.
