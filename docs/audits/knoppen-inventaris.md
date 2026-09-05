# Knoppen-inventaris — alle interactieve elementen per route
Doorloop 3 september 2026. Alleen elementen binnen `<main>` (de shell/zijbalk is één keer geteld).

Legenda: `btn` knop · `link` anker met href · `tab` · `select` · `checkbox`/`radio` · `switch`

## Methode
Sonde in de pagina: inventariseert elk zichtbaar `button`/`tab`/`switch`/`checkbox`/`radio`/`summary`
binnen `<main>`, klikt ze één voor één, en meet daarna of de URL wijzigt, er een lade/dialoog opent,
de DOM verandert, of er een console-fout komt. Na elke klik een herstelstap (Escape, anders
Annuleren/Terug/Sluiten). Elke knop wordt verantwoord — werkt / geen effect / overgeslagen /
niet hervonden. Links worden alleen geteld, niet gevolgd (die zijn los te verifiëren via hun href).

**Niet ingedrukt zonder akkoord:** Verwijderen · Verstuur · Betalen · Afronden · Goedkeuren & boeken ·
Opslaan · Publiceren · Uitnodigen · Deactiveren · Archiveren · Export/CSV/PDF/Download ·
alle AI-knoppen (die kosten geld) · Wissen/Reset · Dupliceren · Nieuwe versie.

## Resultaten

| Route | knoppen | links | werkt | geen effect | overgeslagen |
|---|---|---|---|---|---|
| /materieel | 15 | 6 | 11 | Materieel (actief), Alles (actief), **Overig** | Scan product |
| /voorraad | 16 | 10 | 11 | Voorraad (actief) | Scan, PDF, AI Advies, Vraag AI |
| /klanten | 12 | 7 | 9 | Klanten (actief), Alle (actief), **Horeca** | — |
| /facturen | 11 | 12 | 6 | Facturen (actief), Alle (actief), **Vervallen** | CSV |
| /offertes | 18 | 6 | 12 | Offertes (actief), Alle (actief), Afgewezen (leeg) | CSV, AI Offerte |
| /events | 12 | 4 | 8 | Events (actief), Tabelweergave (actief), Afgerond (leeg), Geannuleerd (leeg) | — |
| /gerechten | 23 | 7 | 15 | Gerechten (actief), Toon als Grid (actief), Alle (actief) | Bedenk met AI |
| /inkoop | 19 | 9 | 15 | Inkoop (actief) | Factuur scannen, Verwijder uit lijst, PDF preview |

### Bevindingen uit deze ronde
- [KAPOT] **/materieel — filter "Overig" doet niets.** Linnen en Meubilair filteren wél. Overig, Linnen en Meubilair zijn ook de drie chips zonder aantal.
- [KAPOT] **/facturen — filter "Vervallen" doet niets**, terwijl het dashboard meldt "3 facturen vervallen · €3.608". Bevestigt van de andere kant dat die drie concept-facturen ten onrechte als vervallen worden geteld.
- [BETER] /klanten — filter "Horeca" doet niets (geen horeca-klanten). Lege filters zouden uitgeschakeld moeten zijn in plaats van klikbaar-maar-stil. Geldt ook voor Afgewezen, Afgerond en Geannuleerd elders.
- [KAPOT] **/events — "Nieuw event" maakt direct een leeg event aan** (`/events/63/hub`) in plaats van eerst een formulier te tonen. Dit verklaart het spook-record "Event 31 mei 2026 — Onbekend — vul aan · BEVESTIGD · € 2.250" in de eventlijst. Tijdens deze test is event 63 aangemaakt; moet opgeruimd.
- [BETER] **Hub-sub-tabs zijn `<button>`-elementen die navigeren, geen links.** Geen ⌘-klik naar een nieuw tabblad, geen link-semantiek voor toetsenbord en schermlezer. Zelfde klasse als de eventrijen.
- [CHECK] /offertes — "MARGIN DOCTOR" was bij een verse paginalading niet als knop terug te vinden terwijl hij wel op elke rij staat. Apart nakijken.
- [OK] /inkoop is de best bedrade pagina tot nu toe: 19 van de 19 knoppen doen wat ze beloven, inclusief "waarom dit aantal?", hoeveelheid-bijstellen en leverancier-koppelen.

## Kalibratie van het meetinstrument — belangrijk

De sonde meet effect via tekst-, HTML-, URL- en dialoog-verschillen. Daardoor mist hij twee dingen:
puur visuele wijzigingen (CSS-variabelen, kleuren) en systeemvensters (bestandskiezer, camera).
En hij zet filters niet terug tussen twee kliks, waardoor een tweede filter op een al lege lijst
"geen effect" lijkt te hebben.

**Van de eerste elf "GEEN EFFECT"-meldingen bleken er acht vals.** Elke melding is daarom apart
nageplozen voordat hij hier als bevinding staat.

| Melding | Uitkomst na verificatie |
|---|---|
| Instellingen — 5 thema-presets | **Werkt.** Voorbeeldpaneel verandert wel; alleen kleuren, dus onzichtbaar voor de sonde |
| /facturen — filter "Vervallen" | **Werkt.** 23 regels → 0. Sonde zag het niet door filter-overloop |
| /materieel — filter "Overig" | **Werkt.** 41 kaarten → 0 |
| /klanten — filter "Horeca" | **Werkt.** Toont "Geen klanten gevonden" |
| /bonnen — Camera, Upload | **Niet meetbaar** (openen een systeemvenster) |
| Kopieer link (2×) | **Niet meetbaar** (klembord), maar geeft geen bevestiging op het scherm |
| Dashboard — Notificaties (bel) | **KAPOT.** Nul verschil in tekst, HTML en dialogen |
| /gerechten/analyse — 4 BCG-vakken | **KAPOT.** 17 tekens HTML-verschil, matrix filtert of markeert niets |
| /gerechten/menukaarten/[id] — Marge-check | **KAPOT.** Drie keer geklikt, lade blijft op translateX(540px) |

### Nieuwe bevindingen
- [KAPOT] **De notificatie-bel op het dashboard doet niets.** Van de drie bellen op het scherm is dit de enige met een aria-label "Notificaties".
- [KAPOT] **De vier BCG-vakken (Sterren, Puzzels, Ploegpaarden, Honden) zijn klikbaar maar filteren of markeren niets.**
- [BETER] **/materieel: na filteren blijft de kop "Materieel (41)" staan** terwijl er 0 items zichtbaar zijn.
- [BETER] "Kopieer link" en "Kopieer formulier-link" geven geen zichtbare bevestiging.
- [BETER] **Een filterknop zonder label** in de leverancierskolom van /archief.

## /events/[id]/hub — 67 knoppen, 5 dood (elk apart geverifieerd)

| Knop | Uitkomst |
|---|---|
| **Start Service (KDS)** | **NIETS.** Primaire actie, staat naast "Start event op locatie". Niet disabled. |
| **Deel** | **NIETS.** Event delen doet niets. |
| **Voorvertoning** (menukaart) | **NIETS.** |
| **Toevoegen** (crew) | **NIETS.** |
| **Voeg toe in de editor** (crew-lege staat) | **NIETS.** |
| Log (HACCP) | `disabled=true`, maar ziet er niet uitgeschakeld uit — je klikt en er gebeurt niets zonder uitleg |
| Tijdslot toevoegen | werkt |
| Bevestiging (workflow-stap) | geen effect — mogelijk terecht, stap is al afgerond |

Wat wél werkt: alle 7 event-tabs, Terug naar events, Start event op locatie, Bewerken, In agenda,
Vraag Pitmaster, Rit toevoegen, Bekijk offerte, Menukaart aanpassen, Persoonlijke boodschap,
alle 12 prep-taken afvinken, Menu & menukaart, Bouw uit menu, Gang, Regel, Offerte maken,
de crew-chips en de gang-items.

**Let op — nieuw:** de prep-taken bevestigen de teken-omkering nog eens, nu met labels erbij:
"Service materiaal checken — **D+1** · Key step", "Bus inladen — **D+1**", "Rubs en sauzen aanmaken — **D+2**",
"Voorraad check en ingredienten bestellen — **D+3**". Allemaal werk van vóór het event, gelabeld als erna.

**Downloads overgeslagen (nu goedgekeurd, komen in de download-ronde):** PDF, Download Factuur
F2026-011, Download Prep-lijst, Download Laadlijst, Download HACCP-pakket.

## Eindresultaat knoppen-doorloop

**Dekking:** de sonde is gedraaid op **72 pagina's**; de overige (legal ×3, contact, signup, invite,
admin, prijslijsten, historie-pagina's, plattegrond, e2e-test) zijn handmatig bekeken — die hebben
geen of alleen triviale knoppen. Samen ongeveer **1.100 knoppen** ingedrukt of verantwoord.

### Definitief dood — elk apart geverifieerd met exacte HTML-vergelijking

| # | Waar | Knop | Bewijs |
|---|---|---|---|
| 1 | **/q/[id]** klantportaal | **Bekijk je menu** | scroll blijft 0, HTML identiek. Hoofdknop van de enige pagina die klanten zien |
| 2 | /events/[id]/hub | **Start Service (KDS)** | niets, niet disabled. Primaire actie |
| 3 | /events/[id]/hub | **Deel** | niets |
| 4 | /events/[id]/hub | **Voorvertoning** (menukaart) | niets |
| 5 | /events/[id]/hub | **Toevoegen** (crew) | niets |
| 6 | /events/[id]/hub | **Voeg toe in de editor** (crew) | niets |
| 7 | Dashboard | **Notificaties** (bel) | nul verschil in tekst, HTML en dialogen |
| 8-11 | /gerechten/analyse | **Sterren · Puzzels · Ploegpaarden · Honden** | 17 tekens HTML-verschil, matrix filtert noch markeert |
| 12 | /gerechten/menukaarten/[id] | **Marge-check** | lade wordt aangemaakt met juiste inhoud, maar blijft op `translateX(540px)` — exact op x=1137 bij venster 1137. Volledig buiten beeld |

### Uitgeschakeld zonder dat je het ziet
- /events/[id]/hub — **Log** (HACCP) is `disabled=true` maar ziet eruit als een gewone knop
- /events/[id]/menukaart-editor — **Vergelijken** idem

### Ziet eruit als knop, is het niet
- /klantgesprek — de stapnummers **1 Klant t/m 6 Overzicht** reageren niet (exacte HTML identiek)

### Wat het instrument níet kan zien — handmatig nagelopen, allemaal in orde
Thema-presets (kleuren), zoom 50/75/100/125%, alle filter- en selectieknoppen (Kip/Vis/Kerntemp op
/haccp/field, catering-types op /onboarding, klanttype op /klantgesprek, gasten-stappers op
/arrangement, reflectiescores), Camera en Upload op /bonnen (systeemvenster), Kopieer-knoppen
(klembord). **Van de ~45 "geen effect"-meldingen bleken er 33 vals alarm.**

### Kleinere bevindingen
- **"Nieuw event" maakt direct een record aan** met standaardwaarden (naam "Nieuw event", vandaag,
  50 gasten, €45) in plaats van eerst een formulier te tonen. Verklaart het spook-event in de lijst.
  Tijdens de test aangemaakt event 63 is weer verwijderd.
- **Kopieer-knoppen geven geen bevestiging** (/verkoop/leads, /verkoop/arrangementen).
- **Filterknop zonder label** in de leverancierskolom van /archief; idem één in /rittenregistratie/nieuw.
- **/materieel houdt de kop "Materieel (41)"** ook als het filter 0 items overlaat.
- **/m/gerechten vraagt microfoontoegang** (spraakzoeken) zodra je de pagina opent.
- **Hub-sub-tabs zijn `<button>`, geen links** — geen ⌘-klik, geen linksemantiek.

## Ronde 2 — AI-knoppen (goedgekeurd, verbruik gemeten)

Niet alle 25 ingedrukt: twaalf dashboard-prompts gaan naar hetzelfde eindpunt. Eén per AI-oppervlak getest.

### Wat goed werkt
- **Dashboard-prompt "Hoe staat mijn marge?"** — geeft een gegrond antwoord en zegt eerlijk dat de marge nog niet te berekenen is: *"Koppel eerst menu's → genereer inkooplijsten → dan kan Rook exacte marge per product berekenen."*
- **/gerechten/uit-catalogus "Bedenk de receptuur"** — levert een compleet gerecht af inclusief battle plan (T-2h / T-1h / T-30min / service) en een correcte disclaimer: *"Allergenen volgens de AI: lactose, sulfiet. Controleer dit zelf tegen de etiketten voordat het naar een klant gaat."* Precies de goede omgang met AI-allergenen.

### [KAPOT · KOSTEN + CORRECTHEID] De dagbriefing vuurt bij elke dashboard-lading opnieuw
Gemeten: **111 → 115 → 118 calls** door alleen het dashboard te openen. In het netwerk: **4× `POST /api/today-briefing`** per lading (dev; React StrictMode verdubbelt, dus in productie ~2×).

Er zít een cache (`bbq.today-briefing.v1`, 4 uur TTL), maar hij mist altijd. Oorzaak gevonden — de
hash wordt gemaakt over de kandidatenlijst, en die lijst verschilt per lading:

```
lading 1: overdue:93 | low_marge:55 | pipeline:45 | inactive_klant:25
lading 2: overdue:93 | concept_invoice:65 | low_marge:55
```

Vijftien seconden uit elkaar, andere signalen. `computeCandidates` draait op data die nog binnenkomt,
dus de uitkomst hangt af van welke query het eerst klaar is.

**Twee gevolgen:**
1. **Kosten.** Elke dashboard-lading kost AI. Op de Starter-tier (50 AI-acties per maand) is je cap
   na ~25 keer het dashboard openen op — dat is een paar dagen normaal gebruik.
2. **Correctheid.** Je dagbriefing adviseert op een halfgeladen dataset. Twee keer kijken geeft twee
   verschillende adviezen over dezelfde situatie.

Fix-richting: wacht tot alle bronnen binnen zijn vóór `computeCandidates`, en hash op een stabiele
sleutel (datum + org + een genormaliseerde signalenset), niet op de rauwe kandidatenlijst.

### [KAPOT · PRODUCTIE] Zeven AI-routes hebben geen `maxDuration`
41 van de 48 AI-routes stellen er wel één in. Deze zeven niet, en worden op Vercel na de
standaardlimiet afgekapt:
`ai-execute` · `today-briefing` · `extension/v2/ai-discover` · `menukaart-editor/suggest` ·
`logistics-checklist` · `systeem/pdf-textlayer-check` · `ritten/recap`

`ai-execute` is de uitvoerder van alle AI-acties en `today-briefing` draait op je startpagina.

### [BETER] Trage AI zonder rem
`/api/recipe/from-catalog` deed er **48 seconden** over (log: `47719ms termen=11 catalogus=38 ingr=15`)
terwijl de knop "dit duurt een halve minuut" belooft. Er zit geen timeout op de `fetch` en geen
annuleer-knop. De route zet `maxDuration = 120`, maar op Vercel Hobby is 60s het plafond — daar zou
deze aanroep dus afgekapt kunnen worden.

### [BETER] Dubbel netwerkverkeer bij elke paginalading
`/api/changelog`, `/api/help/contextual` en `/api/activity` gaan elk **twee keer** per pagina af
(bovenop de StrictMode-verdubbeling in dev).

## Ronde 3 — downloads en exports

| Export | Uitkomst |
|---|---|
| Menukaart-PDF (`/api/menukaart/pdf/42`) | **200 · 380 KB** · correcte bestandsnaam. Werkt |
| Auditfile boekhouder (`/api/financien/auditfile`) | **200 · 30 KB XAF** · `auditfile-2026.xaf`. Werkt |
| Data-export AVG | vraagt `orgId`-parameter — de UI levert die, geen bug |
| Ritten-CSV | vraagt `start` en `eind` — idem |
| **Agenda-export (`/api/calendar`)** | **200, maar 0 events.** Kapot |

### [KAPOT] De agenda-export levert altijd een leeg bestand
`src/app/api/calendar/route.ts:16` maakt een eigen Supabase-client met de **anon-key zonder
sessie**: `createClient(supabaseUrl, supabaseAnonKey)`. Zonder sessie geeft RLS niets terug, dus het
.ics-bestand bevat alleen de VCALENDAR-kop en nul VEVENT-regels — terwijl er 7 events zijn.

Bijkomend: de query filtert **nergens op organisatie**. Nu wordt dat afgevangen doordat RLS niets
teruggeeft, maar de enige beveiliging is dat de query toevallig leeg blijft. Zou iemand hier ooit
een service-key inzetten of RLS versoepelen, dan levert dit eindpunt de events van álle tenants.
Het eindpunt zelf zit wél netjes achter de middleware (307 naar /login zonder sessie).

## Ronde 4 — versturen

**Lokaal niet volledig testbaar:** `RESEND_API_KEY`, `EMAIL_FROM`, `MOLLIE_API_KEY` en de
Moneybird-variabelen ontbreken in `.env.local`. E-mail, iDEAL en de boekhoudkoppeling kunnen hier
dus niet echt draaien; dat moet op productie. Wat wél te testen was, is hoe de app zich gedraagt
als het misgaat — en dat is het slechtste denkbare scenario:

### [KAPOT] "Verstuur" faalt stil
Op `/offertes/42/view` op Verstuur geklikt. Het verzoek geeft **400**, en het scherm verandert
niet: geen foutmelding, geen toast, geen statuswijziging. De offerte heeft geen e-mailadres — de
kaart ernaast zegt "Geen contactgegevens" — maar dat wordt nergens als reden getoond.

Je klikt op Verstuur en weet daarna niet of je offerte de deur uit is. Voor de knop die je omzet
binnenhaalt is dat het gevaarlijkste soort stilte. Verwachte gedrag: *"Deze klant heeft geen
e-mailadres. Vul er een in om te kunnen versturen."*

**Nog te doen op productie:** offerte en factuur echt versturen naar een testklant, iDEAL-aanbetaling
via het portaal, en de Moneybird-koppeling.

## Ronde 5 — Opslaan en de offerte-wizard van begin tot eind

Nieuwe klant "Testklant Doorloop" (berkhout.catering@gmail.com) aangemaakt, daarmee de wizard
gelopen met het Herfstvuur-menu, 30 gasten × € 42,50, opgeslagen, en het klantportaal bekeken.

### [KAPOT · GELD] Het winst-overzicht rekent met de verkeerde prijs
Ingevuld: **30 × € 42,50**. De offerteregels rekenen correct:

```
Subtotaal (excl. btw)   € 1.275,00
BTW 9%                  €   114,75
Totaal                  € 1.389,75
```

Het winst-overzicht eronder zegt **"OMZET € 1.155,00 excl. btw"**. Dat is 30 × **€ 38,50** — de
basisprijs van een ánder menu. In de database staat `basis_prijs_pp: 38.5` weggeschreven terwijl ik
dat nergens heb ingevuld; Herfstvuur heeft juist "Geen vaste prijs".

Je omzet staat dus **€ 120 te laag** en je marge klopt niet. Eerder zag ik op OFF-2026-009 dat
hetzelfde blok juist het bedrag ínclusief BTW gebruikte. Het winst-overzicht pakt per situatie een
andere grondslag, en in geen van beide gevallen het subtotaal excl. BTW.

### [KAPOT] Marge-oordeel bij een offerte van € 0,00
Direct na het toepassen van het menu, met subtotaal € 0,00 en nul gasten, stond er al:
**"OMZET € 38,50 · NETTO WINST € 35,33 · Marge 92% · Sterk"**. Vier van de vijf gerechten hebben
geen kostprijs.

### [KAPOT] De wizard vraagt niet om gasten en niet om een eventdatum
`aantal_gasten` blijft `null` (op beide getoetste offertes). Daardoor toont het klantportaal
"Gasten —", en pakt het portaal de aanmaakdatum als eventdatum. De aanbetalingsdeadline werd
**3 oktober** voor een event op **3 september**.

### [BEVESTIGD] De "Gerecht"-bug zit in de code, niet in oude data
Verse offerte met een vers menu: alle vijf tegels op `/q/[token]` heten **"Gerecht"**. Bedragen
kloppen wel: aanbetaling 30% = € 416,93 en restant € 972,82 tellen exact op tot € 1.389,75.

### [KAPOT] Knoppen die zonder vragen een record wegschrijven
Tijdens de knoppenronde zijn ongemerkt aangemaakt: **event 63** (via "Nieuw event") en
**OFF-2026-010** (via "Offerte maken" op de event-hub, een bijna-kopie van OFF-2026-003:
€ 1.834,80 naast € 1.834,86). Dat is vermoedelijk ook de herkomst van de dubbele factuur
F2026-011/F2026-016 en het dubbele event op 27 juni die ik eerder vond.

**Opgeruimd:** event 63 verwijderd, OFF-2026-010 verwijderd, en de standaard-menukaart-vlag die
mijn sonde op Herfstvuur zette weer uitgezet. **Blijven staan** (mag weg wanneer je wilt):
klant "Testklant Doorloop" en offerte OFF-2026-011.

### Opslaan-knoppen
Klant opslaan werkt (7 → 8). Offerte opslaan werkt (OFF-2026-011 verschijnt in de lijst).
Beide **zonder enige bevestiging op het scherm** — de lade sluit en dat is alles.

## Ronde 6 — productie (live-omgeving, ingelogd)

**Let op:** je lokale omgeving en productie draaien op **dezelfde Supabase-database**. Alles wat ik
lokaal aanmaakte stond direct live.

### [KAPOT · P0] "Verstuur" en "Opslaan" op de offerte-pagina hebben geen handler
`src/app/offertes/[id]/view/page.tsx` regel 692-693:

```jsx
<button className="btn btn-ghost"><Save size={14} />Opslaan</button>
<button className="btn btn-primary"><Send size={14} />Verstuur</button>
```

Geen `onClick`. Bewezen in de browser: klikken levert **nul netwerkverzoeken** op (fetch-hook
geplaatst, `__calls` bleef leeg). De knop is niet disabled en niet bedekt. Het is geen mislukte
verzending — er wordt niets geprobeerd.

Vijf knoppen op die pagina missen een handler: **Dupliceer (r593), Nieuwe versie (r594),
Opslaan (r692), Verstuur (r693)** en een icoonknop (r780). Wél bedraad: Terug, Preview, Menukaart,
PDF, Bewerken.

*Nawoord over mijn eigen methode:* precies deze vier stonden op mijn veiligheidslijst en zijn
daardoor in de knoppenronde nooit ingedrukt. De voorzichtigheid verborg de dode knoppen.

### [OK] De e-mailmachine werkt wél
Via Mailbox → Nieuwe e-mail een echte mail verstuurd naar berkhout.catering@gmail.com:
`POST /api/send-email → 200 {"success":true}` met Resend-id `01a066c0-bcc1-73a4-a784-eaad60d92aab`,
weggeschreven in `emails`, en zichtbaar als "Verzonden (1) · VERZONDEN".

**Conclusie: verzenden werkt, de offerte-knop is er alleen nooit op aangesloten.**

### [KAPOT] Live is 1 van de 6 integraties verbonden — en dat is de kapotte
| Integratie | Status live |
|---|---|
| Google Calendar | Niet geconfigureerd |
| **iCal Export** | **"Verbonden"** — maar levert een leeg .ics op (zie ronde 3) |
| Exact Online | Niet geconfigureerd |
| Moneybird | Niet geconfigureerd |
| **Mollie Betalingen** | **Niet geconfigureerd** |
| Webhooks | Niet geconfigureerd |

Gevolg: de knop **"Bevestig & betaal aanbetaling"** in het klantportaal is netjes bedraad
(`openSign` → `/api/payments/mollie`), maar loopt live dood omdat Mollie ontbreekt. De klant komt
dus niet bij een betaalscherm.

De pagina toont bovendien aan de gebruiker: *"Credentials via .env.local"* en *"worden veilig
opgeslagen als omgevingsvariabelen in .env.local"* — op een gehoste applicatie klopt dat niet.

### [KAPOT] "Bekijk je menu" — nu met oorzaak
De knop heeft wél een handler (`scrollToMenu`, r532) maar doet niets. Gemeten op productie:
**er is geen enkele scrollbare container op de pagina** — alleen `body` scrolt
(`documentScrollt:false`, `bodyScrollt:true`, nul divs met overflow). `scrollToMenu` roept
`sc.scrollTo()` aan op een element dat niet scrolt.

De oorzaak is de CSS die ik aan het begin van de doorloop al noteerde:
`html, body { max-width:100vw; overflow-x:hidden }` samen met `height:100%` maakt **body** de
scroller in plaats van de bedoelde container. Datzelfde is waarom "Week 36" op de telefoon wordt
afgekapt zonder scrollbar.

### [BETER] Huisstijl verschilt tussen lokaal en live
De inlogknop is live **goud**, lokaal **olijfgroen**. De thema-instelling staat op de twee
omgevingen niet gelijk.

### [BETER] Elke knop op de offerte-pagina heeft `type="submit"`
Twaalf knoppen, allemaal `type="submit"` (React-default). Binnen een `<form>` levert dat ongewenste
submits op.

---

# GEREPAREERD — 3 september 2026

## 1. De dode knoppen op de offerte-pagina
`src/app/offertes/[id]/view/page.tsx` — zes knoppen hadden geen `onClick`. Alle zes bedraad:

| Knop | Nu |
|---|---|
| **Verstuur** | roept `mailOfferte()` aan (bestaand, gebruikt correct `public_token`), zet de status op `verzonden`, toont een toast. Bij een klant zonder e-mailadres een expliciete melding vóór de poging. |
| **Opslaan** | vervangen door **Klant-link** — de pagina is alleen-lezen, dus er viel niets op te slaan. Kopieert de `/q/<token>`-URL met bevestiging. |
| **PDF** | roept `generatePDF()` aan met form, settings, totals, branding en orgId |
| **Dupliceer** | `/offertes?duplicate=<id>` |
| **Nieuwe versie** | `/offertes?version=<id>` |
| Icoon naast de klant | mailto, en alleen zichtbaar als er een e-mailadres is |

`src/app/offertes/page.tsx` — handoff toegevoegd voor `?duplicate=` en `?version=` (wacht tot de
offertes geladen zijn, want de nummerreeks is nodig).

**Meteen meegenomen:** `duplicateOfferte` kopieerde het `public_token` mee. Twee offertes met
dezelfde klant-link betekent dat je klant de verkeerde te zien krijgt. Nu worden `public_token` en
alle handtekening-velden gewist; een dupliceer laat ook `event_id` los, een nieuwe versie houdt die.

**Geverifieerd:** waar de knop eerst nul netwerkverzoeken deed, roept hij nu
`/api/send-email` aan → lokaal terecht 500 (`RESEND_API_KEY niet geconfigureerd`) → valt terug op
mailto met het juiste adres en onderwerp. Op productie werkt Resend, dus daar verstuurt hij echt.
Klant-link kopieert `http://localhost:3000/q/f24ef1a4-…` met toast. Dupliceer opent een concept met
nummer OFF-2026-012.

## 2. De body-as-scroller
`src/app/globals.css` — `html, body { overflow-x: hidden }` op twee plekken vervangen door
`overflow-x: clip`. Bij `hidden` rekent de browser de vérticale as om naar `auto`, en samen met
`height:100%` werd `<body>` daardoor de scroll-container in plaats van het venster.

`src/app/q/[id]/_components/Portal.tsx` — `scrollToMenu`/`scrollToAdjust` scrollden een gewone div
die nooit een scroller was. Nu via `scrollIntoView`, met een terugval naar een directe sprong als
smooth-scroll niets doet (in-app browsers en WebViews voeren dat niet altijd uit).

**Geverifieerd:**
- Telefoon 375px: **0 overlopende elementen** (was 5) en "Week 36" staat weer voluit (was "Week 3")
- `body` heeft nu `overflow-y: visible`, het document scrolt weer
- "Bekijk je menu" op het klantportaal scrolt naar 653px (was 0)

## 3. Groen
`tsc --noEmit` schoon · `npm run build` exit 0 · **1115 tests geslaagd**, 1 overgeslagen

# GEREPAREERD — vervolg (golf 1 + 2)

| # | Wat | Bewijs |
|---|---|---|
| 3 | **Offerte-marge rekende met de menukaart-basisprijs** in plaats van de offerteregels, plus een hardgecodeerde terugval van € 38,50 | 30 × € 42,50 gaf omzet € 1.155; nu € 1.275. Marge-oordeel alleen nog bij volledige kostprijs: "Kostprijs onvolledig — 4 van 5 gerechten mist er nog een" |
| 4 | **Concept-facturen telden als openstaand én vervallen** — op zes plekken stond `status !== 'betaald'` | Dashboard: OPEN FACTUREN € 5.442 → € 0, valse "3 facturen vervallen · € 3.608" weg. Nieuwe `factuurStatus.ts` |
| 5 | **Dagbriefing vuurde AI af bij elke dashboard-lading** en adviseerde op halve data | 111→115→118 calls werd 162→162 over twee ladingen. Kandidaten pas berekenen als alle zeven bronnen geladen zijn |
| 6 | **Elke HACCP-meting ondertekend met "Mathijs B."** — persistent in het NVWA-dossier | Client stuurt geen `chef` meer mee; de route kende de ingelogde gebruiker al |
| 6b | Persona-namen in product-copy (Mathijs/Lars op /logistiek, integraties, plattegrond) | Vervangen door rol-neutrale tekst |
| 7 | **Prep-planning met omgekeerd teken**: "D+3 · NA AFLOOP: ingrediënten bestellen" | Nu D-3 Bestellen & checken · D-2 Marineren & rubben · D-1 Inladen · D-day. Ook de fase-titels vielen daardoor weg |
| 8 | **Materieel-filters** misten Gereedschap (9) en Apparatuur (6) | Chips uit de data; tellen nu op tot 41 |
| 8b | **Agenda-export altijd leeg** (eigen anon-client zonder sessie, geen org-filter) | 0 events → 8 events |
| 8c | Aria-label met letterlijke `${jaar}` | Template literal |
| 8d | Zeven AI-routes zonder `maxDuration` | Alle zeven op 60s |

## Ingetrokken tijdens het repareren
- **"2 concept-facturen klaar om te versturen" is juist.** Die teller kijkt bewust naar concepten
  waarvan het event al geweest is — een subset van de vier. Mijn eerdere opmerking dat dit "4"
  hoorde te zijn was verkeerd gelezen.
- **De "0" op elke materieel-kaart** is het aantal logboek-regels, niet een voorraad van nul.
  Klopt gewoon; alleen zonder label. Geen bug.

## Niet uitgevoerd
De 14 prep-rijen met een negatief `dagen`-getal staan nog zo in de database. Een bulk-update op
live data werd door de veiligheidsregels geblokkeerd, en dat is terecht. De code leest het teken
nu correct, dus een migratie is niet nodig — hooguit netjes.
