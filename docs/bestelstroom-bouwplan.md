# Bouwplan — bestelstroom De Eettocht

**Repo:** BBQ Architect. **Datum:** 3 september 2026 (versie 4).
**Hoort bij:** `bestelstroom-briefing.md` — dat geeft toon, tekst en vorm; dit geeft
datamodel, routes, regels en volgorde.

Dit plan bouwt **alleen de BBQ Architect-kant**. De doospagina op `/k/:token` staat in de
Experience-app en wordt hier niet aangeraakt.

**Wat er in deze versie is veranderd:** de portiegetallen (8 personen per doos, 2 stuks per
gerecht) zijn eigenschappen van het doostype geworden en staan niet meer hier; de
samenstellingszin wordt gerekend in plaats van ingetikt; printen raakt de Experience-API
nooit aan; en er is een wachtlijst bijgekomen omdat de uitverkocht-tekst er een belooft.

---

## 1 · Wat er al ligt

| Wat | Waar | Gevolg |
| --- | --- | --- |
| Publieke routes | `src/proxy.ts:4` (`PUBLIC_ROUTES`) | Next 16 hernoemde `middleware.ts` naar `proxy.ts`. Vergeet je een route hier, dan komt een bestellende klant op het inlogscherm. |
| Publiek formulier-patroon | `src/app/aanvraag/[slug]/` + `src/app/api/public-lead-form/[slug]/route.ts` | Tenant via `organizations.slug`, service-role (geen `TO anon`-policy), Zod, honeypot, rate-limit per IP, `gdpr_consent`. Kopiëren, niet opnieuw bedenken. |
| Tabel-patroon | `supabase/migrations/20260601130000_leads.sql` | Org-gescoped, RLS via `private.user_org_ids()`, `set_updated_at`-trigger. |
| Mail | `src/lib/serverMail.ts` | `sendServerMail` heeft het `text`-veld al. `wrapHtml` niet aanpassen — dat raakt offertes, facturen en leads. |
| Bedrijfsgegevens | `settings` (`bedrijfsnaam`, `telefoon`, `email`) | Het nummer voor "bel ons even" en het adres voor "mail ons even" staan er al. Nooit hardcoden. |
| Stickers | `src/lib/printLabel.ts` | Canvas → PNG → Web Share. Maar vast 400×300 px, kapt titels af met `substring(0,18)`, gebruikt gevulde vlakken. Alle drie mogen hier niet. Nieuwe renderer ernaast; dit bestand blijft ongemoeid. |
| Dagelijkse cron | bestaande cron-route | Vercel Hobby staat alleen dagelijkse crons toe. Opnieuw koppelen (§3) en opruimen (§5) hangen hieraan. |
| Tests | `vitest.config.ts`, `src/lib/*.test.ts` | Node-omgeving, tests naast de source. De token-wachthond past hierin. |

---

## 2 · Het datamodel

Vier tabellen. Eén migratie: `supabase/migrations/2026090xxxxxxx_bestelstroom.sql`.

### 2.1 `doos_types` — alleen wat van Hop & Bites is, niet wat van het product is

De scheiding: **wat uit de bakjes volgt hoort bij het doostype en woont in de
Experience-app.** Wat uit Mathijs' agenda, koeling en prijslijst volgt, woont hier.

| Kolom | Type | Opmerking |
| --- | --- | --- |
| `id` | UUID PK | |
| `organization_id` | UUID NOT NULL → `organizations` | |
| `slug` | TEXT NOT NULL | uniek per org; de sleutel voor aanroep A |
| `prijs_cents` | INTEGER NULL | van hier — leeg tot hij vaststaat. Leeg = geen prijs tonen, niet €0,00. |
| `personen_min`, `personen_max` | INTEGER NULL | van hier — grenzen van de teller; hoe groot een bestelling hij aanneemt is zijn keuze, niet die van de verpakking |
| `max_dozen_totaal` | INTEGER NULL | van hier — dit begrenst zijn uren, niet de verpakking. **NULL betekent dicht, niet onbeperkt:** het formulier toont dan het vierde scherm en `plaats_bestelling` weigert met `BB007`. Een vergeten veld mag geen open kraan worden. |
| `actief` | BOOLEAN NOT NULL DEFAULT false | van hier |
| `experience_cache` | JSONB NULL | het laatste geslaagde antwoord van aanroep A |
| `experience_cache_at` | TIMESTAMPTZ NULL | |

`personen_per_doos`, `aantal_per_persoon`, de titel, de haltes en de onderdelen staan hier
**niet** als kolom. Ze komen uit aanroep A. Zet je die 8 en die 2 hier vast, dan moet BBQ
Architect aangepast worden zodra er een borrelbox komt met andere porties — en dat is
precies de verkeerde app om dan open te slaan.

**Over de cache.** Geen tweede waarheid en niets wat met de hand wordt bijgehouden: puur
het laatste geslaagde antwoord, ververst bij elke geslaagde A. Hij is er om twee redenen.
Het formulier moet blijven werken als de andere app even weg is, en het aantal dozen
(`ceil(personen / personen_per_doos)`) moet berekend kunnen worden op het moment van
bestellen — anders kan de capaciteit niet kloppen. Is de cache leeg én is A onbereikbaar,
dan neemt het formulier **geen** bestellingen aan en zegt dat ook. Liever dicht dan een
doosmaat raden.

### 2.2 Wat er in de doos zit — dat weet de andere app

Hier komt geen tabel voor. De onderdelen horen bij het doostype, en het doostype woont in de
Experience-app naast de dorpen en de voorraadkast. Zelfde principe als bij de token: de app
die het weet is de baas, de andere vraagt het op.

**De samenstellingszin wordt gerekend, nooit ingetikt.** Dat is de hele reden dat die
getallen daar horen: een zin die iemand overschrijft, kan iemand verkeerd overschrijven.

Om *"60 stukjes vlees en vis, drie sauzen, twee zuren en twee salades"* te kunnen rekenen,
moet elk onderdeel twee dingen erbij zeggen die nu nog niet in het contract staan — zie §3:

- **waar het bij hoort** (`soort`: proteïne, saus, zuur, salade), anders tellen de sauzen mee
  in de zestig
- **waarmee het meeschaalt** (`per`: persoon of doos), want twee stuks bavette is per
  persoon en drie sauzen is per doos

Met die twee erbij is de hele zin rekenwerk — het voorste deel én het achterste — en is er
geen `bijgerechten_tekst` meer nodig. Ontbreekt een van beide, dan valt dat deel van de zin
weg.

> **Let op de richting van de grens.** Het Experience-concept beschrijft een Box met
> "allergenen, per box overschrijfbaar". Dat gaat over de allergenen **in het eten** — een
> producteigenschap. De **allergienotitie van de klant** is iets anders: een
> gezondheidsgegeven over een persoon. Die blijft hier en gaat de grens niet over. Ze mogen
> nooit in hetzelfde veld belanden.

### 2.3 `afhaalmomenten`

| Kolom | Type | Opmerking |
| --- | --- | --- |
| `id` | UUID PK | |
| `organization_id` | UUID NOT NULL | |
| `doos_type_id` | UUID NOT NULL → `doos_types` | |
| `datum` | DATE NOT NULL | |
| `start_tijd` | TIME NOT NULL | |
| `eind_tijd` | TIME NULL | |
| `max_dozen` | INTEGER NOT NULL | |
| `actief` | BOOLEAN NOT NULL DEFAULT true | |

**Bezetting wordt geteld, nooit opgeslagen.** Vrij = `max_dozen` − de **som van `dozen`**
over de bestellingen op dat moment met status ≠ `geannuleerd`. Dozen, want dat is wat de
uren en de koeling begrenzen.

Verleden → weg. Vol → zichtbaar, doorgestreept, niet aanklikbaar. `actief = false` → weg.

**Twee soorten uitverkocht, twee verschillende schermen.**

*Alle momenten bezet, dozen niet op:*

> Alle afhaalmomenten zijn bezet. Mail ons even — kunnen er genoeg mensen op een ander
> moment, dan zetten we er een bij.

Een `mailto:` naar `settings.email`. Dit is geen beleefdheidsformule: in dit geval kan er
écht een moment bij, en die mails zijn het signaal dat er vraag is.

*Totaal uitverkocht:*

> De dozen zijn op. We maken er een vast aantal, want alles gaat door één paar handen. Laat
> je mailadres achter en je krijgt één bericht zodra de bestelling volgend jaar opengaat.
> Verder niets.

Dit scherm heeft een invoerveld en dus een tabel — zie §2.6. En dat "verder niets" is geen
tekst maar een belofte die afdwingbaar moet zijn.

### 2.4 `bestellingen`

| Kolom | Type | Opmerking |
| --- | --- | --- |
| `id` | BIGSERIAL PK | |
| `organization_id` | UUID NOT NULL | |
| `doos_type_id`, `afhaalmoment_id` | UUID NOT NULL, `ON DELETE RESTRICT` | |
| `personen` | INTEGER NOT NULL CHECK > 0 | |
| `dozen` | INTEGER NOT NULL CHECK > 0 | `ceil(personen / personen_per_doos)` uit de cache, daarna vast |
| `naam` | TEXT NOT NULL | volledige naam — dit komt op de sticker |
| `voornaam` | TEXT NOT NULL | het enige stuk naam dat de grens over gaat; corrigeerbaar in de hub |
| `email`, `telefoon` | TEXT | |
| `allergie_notitie` | TEXT NULL | lege string wordt NULL; wordt gewist, zie §5 |
| `allergie_gezien_at` / `allergie_gezien_door` | TIMESTAMPTZ / UUID NULL | |
| `avg_akkoord_at` | TIMESTAMPTZ NOT NULL | |
| `status` | TEXT NOT NULL DEFAULT `'nieuw'` | `nieuw` · `bevestigd` · `klaar` · `opgehaald` · `geannuleerd` |
| `prijs_cents` | INTEGER NULL | overgenomen bij het bestellen |
| `experience_token` | TEXT NULL | **komt van de andere app**, wordt hier nooit gemaakt |
| `experience_url` | TEXT NULL | letterlijk wat de API teruggeeft; niet zelf samenstellen |
| `doos_snapshot` | JSONB NULL | haltes + onderdelen zoals ze waren bij het koppelen — zie §8 |
| `koppel_status` | TEXT NOT NULL DEFAULT `'wacht'` | `wacht` · `gekoppeld` · `mislukt` |
| `koppel_fout`, `koppel_poging_at` | TEXT / TIMESTAMPTZ | |
| `mail_status` | TEXT NOT NULL DEFAULT `'niet_verstuurd'` | `niet_verstuurd` · `verstuurd` · `mislukt` |
| `mail_fout`, `mail_verstuurd_at` | TEXT / TIMESTAMPTZ | |
| `sticker_geprint_at` | TIMESTAMPTZ NULL | |
| `sticker_herprint_nodig` | BOOLEAN NOT NULL DEFAULT false | |
| `idempotency_key` | TEXT NOT NULL | UNIQUE samen met `organization_id` |
| `created_at`, `updated_at` | TIMESTAMPTZ | |

**Over `voornaam`.** Splitsen op de eerste spatie gaat vaak goed en soms pijnlijk mis: "Fam.
Berkhout" wordt *"Welkom Fam."*, groot in Cinzel, op tafel. De hub vult het eerste woord
automatisch in, laat het corrigeren, en toont het **naast de stickervoorbeeldweergave** —
zodat je ziet wat er straks op tafel staat vóórdat je print.

### 2.5 Drie regels die in de database staan, niet in de UI

**a. De allergie-poort.**

```
CHECK (
  status IN ('nieuw','geannuleerd')
  OR allergie_notitie IS NULL
  OR allergie_gezien_at IS NOT NULL
)
```

Een bestelling met een allergienotitie kán niet naar `bevestigd` zolang niemand erop
geklikt heeft. Niet "de knop is uitgeschakeld" — de database weigert het, ook voor een
bulkactie, een script of een toekomstige AI-actie. Een uitgeschakelde knop overleeft geen
refactor, een constraint wel.

**b. Sticker klopt niet meer.** Trigger `BEFORE UPDATE`: verandert `personen`, `dozen`,
`naam` of `afhaalmoment_id` terwijl `sticker_geprint_at` gevuld is, dan gaat
`sticker_herprint_nodig` op true.

**c. De laatste doos.** Twee mensen die tegelijk de laatste doos pakken is een echte race.
`plaats_bestelling(...)` vergrendelt de rij in `afhaalmomenten` (`SELECT ... FOR UPDATE`),
telt de dozen, weigert als het niet past, en voegt anders in — in één transactie. De tweede
krijgt een eerlijk *"dit moment is net volgeboekt"*.

### 2.6 `bestel_wachtlijst` — en waarom "verder niets" een tabel nodig heeft

| Kolom | Type |
| --- | --- |
| `id` | BIGSERIAL PK |
| `organization_id` | UUID NOT NULL |
| `doos_type_id` | UUID NOT NULL |
| `email` | TEXT NOT NULL — UNIQUE samen met `doos_type_id` |
| `created_at` | TIMESTAMPTZ |
| `bericht_verstuurd_at` | TIMESTAMPTZ NULL |

De uitverkocht-tekst belooft *"één bericht … verder niets"*. Dat is onder de AVG een
doelbinding, en die moet je kunnen waarmaken, niet alleen opschrijven. Drie regels:

- **Dit is geen lead.** De rij komt niet in `leads`, niet in de pijplijn, niet in een
  mailinglijst en niet in een AI-context. Een aparte tabel juist omdát het bijna-hetzelfde
  eruitziet als een lead: dat is hoe zo'n adres per ongeluk in een campagne belandt.
- **Eén bericht.** Is `bericht_verstuurd_at` gevuld, dan is deze rij op. Er is geen tweede.
- **Daarna weg.** De opruimtaak (§5) verwijdert rijen zodra het bericht verstuurd is, en
  rijen die na achttien maanden nog niets gekregen hebben — want dan is die belofte niet
  waargemaakt en heeft het adres hier niets meer te zoeken.

Geen naam, geen telefoon, geen aantal personen. Alleen een adres en waarvoor.

### 2.7 RLS

Zoals `leads`: vier policies `TO authenticated` met `organization_id IN (SELECT
private.user_org_ids())`, op alle vier de tabellen. **Geen `TO anon`-policy** — de publieke
inserts lopen via de service-role client. Indexen op `organization_id`, `(organization_id,
status)` en `afhaalmoment_id`.

---

## 3 · Het koppelvlak met de Experience-app

**BBQ Architect maakt nooit een token.** Ook niet tijdelijk, ook niet als placeholder.

**A · `GET /api/experience/box-types/:slug`** — vóór het bestellen, niet per bestelling.
Server-naar-server, zelfde sleutel, geen persoonsgegevens in beide richtingen. Cachebaar.

```
{ titel, seizoen, pitch[], stops[], personen_per_doos,
  onderdelen: [{ naam, aantal_per_persoon, bewaren, allergenen, houdbaarheid_dagen }] }
```

> **Twee velden erbij nodig, per onderdeel.** Met dit antwoord is *"60 stukjes vlees en vis,
> drie sauzen, twee zuren en twee salades"* nog niet te rekenen:
> - `soort` (proteïne · saus · zuur · salade) — zonder dit tellen de sauzen mee in de zestig
> - `per` (persoon · doos) — twee stuks bavette schaalt met de teller, drie sauzen niet
>
> Met die twee is de héle zin rekenwerk en verdwijnt het laatste met de hand ingetikte getal
> uit deze stroom. Zonder, blijft het achterste deel een zin die iemand moet overtypen — en
> dat is precies wat er hier al een keer misging.

**B · `POST /api/experience/boxes`** — per bestelling, ná het bestellen. Heen gaan **alleen
voornaam, aantal personen en de afhaaldatum**. Meer niet, en op één plek in de code, zodat
de grens uit briefing §0 op één plek te controleren is. Terug komen `token`, `url`,
`stops[]` en `onderdelen[]` — de stand op het moment van koppelen.

De stroom:

1. Bestelling wordt opgeslagen met `experience_token = NULL`, `koppel_status = 'wacht'`.
2. Lukt B → token, url, en `stops[]` + `onderdelen[]` gaan in `doos_snapshot`.
3. Lukt B niet, of bestaat de API nog niet → `koppel_status = 'mislukt'`, foutregel
   opgeslagen, bestelling staat in de hub als **wacht op koppeling**. De bestelling blijft
   gewoon bestaan.
4. Opnieuw uit te voeren, met de hand of via de dagelijkse cron. Idempotent: is er al een
   token, dan doet hij niets.

**De API hoeft alleen bereikbaar te zijn bij het bestellen, nooit bij het printen.** Dat is
een eis, geen bijkomstigheid. Na een geslaagde koppeling staat alles wat de sticker nodig
heeft lokaal: token, haltes, onderdelen. Zie §8.

### 3.1 Het contract

**Pad met versie:** `/api/experience/v1/...` — kost nu niets, scheelt straks een breuk.

**Legitimatie:** `Authorization: Bearer <sleutel>`, server-naar-server, altijd.

De omgevingsvariabele heet `EXPERIENCE_API_KEY`, **zonder `VITE_`-voorvoegsel**. Vite bakt
alles met dat voorvoegsel in de bundel die elke bezoeker binnenhaalt — dat is precies waarom
de anon-sleutel daar publiek is. Twee sleutels tegelijk geldig (`EXPERIENCE_API_KEY` en
`EXPERIENCE_API_KEY_VORIGE`) zodat wisselen geen downtime kost; vergelijken in constante
tijd; geweigerde verzoeken loggen met herkomst en **nooit** met de aangeboden sleutel erin.

Tweede wachthond, naast die van de token: een test die faalt zodra er een
`VITE_`-variabele verschijnt met `key` of `secret` in de naam.

**Foutantwoorden** — altijd een machineleesbare code plus een zin voor een mens. BBQ
Architect leidt uit de **code** af wat te doen, nooit uit het ontleden van een bericht.

```
{ "fout": "onbekend_doostype", "bericht": "..." }
```

| | |
| --- | --- |
| 401 `geen_toegang` | sleutel ontbreekt of klopt niet |
| 404 `onbekend_doostype` | |
| 400 `ongeldige_invoer` | + welk veld |
| 409 `andere_invoer_zelfde_sleutel` | zie hieronder |
| 422 `doostype_gesloten` | neemt geen bestellingen meer aan |
| 429 `te_veel_verzoeken` | |
| 500 `interne_fout` | |

**De idempotentieregel:**

- zelfde sleutel + **zelfde** invoer → 200, dezelfde doos. Geen fout.
- zelfde sleutel + **andere** invoer → 409. Nooit stilzwijgend de oude doos teruggeven.

Die tweede regel is het hele punt: een aanroep die met gewijzigde gegevens de oude doos
terugkrijgt, is een sticker met de verkeerde inhoud. Dezelfde regel geldt binnen BBQ
Architect zelf, in `plaats_bestelling` — zie `BB004` in de migratie.

**Opnieuw proberen:** netwerkfout of 5xx → opnieuw met **dezelfde** `Idempotency-Key`,
oplopende wachttijd, maximaal drie keer. Elke 4xx → nooit opnieuw, dat wordt niet beter.
Lukt het niet, dan blijft de bestelling op *wacht op koppeling* met een knop **opnieuw
koppelen** in de hub.

**Tijdslimieten:** A → 2 seconden, blokkeert een pagina en mag wegvallen. B → 10 seconden,
moet slagen.

**Zichtbaarheid.** "Wacht op koppeling" is alleen een vangnet als iemand ernaar kijkt.
Bovenaan de hub een teller — *"3 bestellingen wachten op koppeling"* — in vuur, en alleen
zichtbaar boven nul. Anders staat er op 22 december één bestelling zonder token en ontdekt
niemand dat tot de doos op de balie staat.

Beide kanten loggen met het **bestelnummer als koppelnummer**, zodat één bestelling door
twee apps heen te volgen is als er iets misgaat.

**De wachthond.** `src/lib/experienceKoppeling.test.ts` leest de bestanden onder `src/` en
faalt zodra een regel een waarde met `token` in de naam vult uit `randomUUID`, `nanoid`,
`Math.random` of een eigen genereer-functie. Uitzonderingslijst in het testbestand zelf,
zodat elke uitzondering in de diff zichtbaar wordt. Een touw, geen muur — maar genoeg om te
voorkomen dat er "even tijdelijk" een tweede generator ontstaat.

Een QR-code maken valt hier niet onder: dat is een URL die de andere app al gaf omzetten
naar zwart-witblokjes. Dat mag en moet hier, want de sticker wordt hier geprint.

**De eetdatum is voorlopig geschrapt.** In het Experience-concept draagt de Box één datum
(leverdatum) en loopt de avondflow op signalen, niet op de klok — de doneness-card vervangt
de timer. Ik vond geen gedrag dat op een tweede datum hangt. **Maar dat is gelezen in het
conceptdocument, niet in de code van die repo.** Zodra het werk naar de Experience-kant
verhuist, wordt dat daar gecontroleerd voordat we het definitief noemen. Blijkt er toch iets
op te hangen, dan komt er een veld bij op het formulier.

---

## 4 · Waar de allergiemarkering landt

**Plek:** `/verkoop/bestellingen`, als derde sub-tab naast Leads en Arrangementen.

1. **Bovenaan een tegel** die telt: *"3 bestellingen met een allergienotitie — nog niet
   gelezen"*. Klikken filtert. Is het nul, dan verdwijnt de tegel.
2. **In de rij** een merkteken bij de naam, in de bestaande waarschuwingsstijl — niet oranje,
   want vuur is op klantschermen gereserveerd voor de enige actie.
3. **In het detail** de notitie letterlijk, met één knop *"Gelezen"*, die
   `allergie_gezien_at` en `allergie_gezien_door` vult. Wie geklikt heeft blijft staan.

**Waarom er een poort omheen zit.** Het gevaar is niet dat de notitie ontbreekt — hij staat
er — maar dat de bestelling verder rolt zonder dat iemand hem opengeklikt heeft. Bevestigen
betekent voor de klant: *het is gezien en het komt goed*. Als dat niet waar is, is
"bevestigd" een leugen met een allergie eronder.

---

## 5 · Gezondheidsgegevens en opruimen

*"Mijn vrouw is allergisch voor noten"* is onder de AVG een bijzonder persoonsgegeven
(artikel 9). Dat mag, met uitdrukkelijke toestemming en een einde aan het bewaren.

- Het `gdpr_consent`-vinkje uit het aanvraagformulier wordt overgenomen, met een link naar
  `/legal`. Vandaar `avg_akkoord_at`.
- Het vinkje *"Ik wil iets doorgeven over allergieën"* is zelf de uitdrukkelijke toestemming,
  mits de zin eronder zegt waar het voor gebruikt wordt.

**Eén opruimtaak in de bestaande dagelijkse cron, drie regels:**

| Wat | Wanneer |
| --- | --- |
| `allergie_notitie` leegmaken | zes maanden na het afhaalmoment |
| wachtlijstrij verwijderen | zodra `bericht_verstuurd_at` gevuld is |
| wachtlijstrij verwijderen | achttien maanden zonder bericht |

De bestelling blijft, de gezondheidsnotitie niet. Een gezondheidsgegeven dat blijft staan
omdat niemand het opruimt, is precies waar dat artikel over gaat.

---

## 6 · Routes

| Route | Publiek? | Wat |
| --- | --- | --- |
| `/bestellen/[slug]` | **ja** | het bestelformulier, of een van de twee uitverkocht-schermen |
| `/bestellen/[slug]/gelukt` | **ja** | het bevestigingsscherm |
| `GET /api/public-bestelling/[slug]` | **ja** | doostype uit cache of aanroep A, afhaalmomenten met vrije dozen, prijs of niets, en welke van de drie schermen aan de beurt is |
| `POST /api/public-bestelling/[slug]` | **ja** | plaatst de bestelling via `plaats_bestelling(...)`. Zod, honeypot, rate-limit per IP, `idempotency_key` verplicht. |
| `POST /api/public-wachtlijst/[slug]` | **ja** | één mailadres, zelfde beveiliging |
| `/verkoop/bestellingen` | nee | de hub-lijst |
| `/verkoop/bestellingen/[id]` | nee | detail: allergie-poort, naam op de doospagina naast de stickervoorbeeldweergave, koppelstatus, mailstatus |
| `POST /api/bestellingen/[id]/koppel` | nee | aanroep B |
| `POST /api/bestellingen/[id]/mail` | nee | verstuurt of herverstuurt de bevestigingsmail |

**Publieke routes staan op twee plekken:** `PUBLIC_ROUTES` in `src/proxy.ts` (de auth-poort)
en `PUBLIC_PAGES` in `src/components/AppShell.tsx` (de chrome-poort). Vergeet je de eerste, dan
komt de klant op het inlogscherm; vergeet je de tweede, dan krijgt hij de operator-sidebar om
zijn bestelformulier. `src/lib/publicRoutes.test.ts` faalt zodra die twee uit elkaar lopen.

**Het bevestigingsscherm.** Kort: wat er besteld is, wanneer ophalen, dat de bevestigingsmail
onderweg is, en dat er een betaalverzoek volgt. **Geen link naar de doospagina** — die komt
in de mail, en op dit moment bestaat hij vaak nog niet.

**Betalen valt buiten scope.** De prijs staat op het formulier als informatie, want mensen
moeten weten wat het kost voordat ze bestellen. Het betaalverzoek is een handmatige stap van
Mathijs; scherm én mail zeggen dat, zodat niemand hoeft te bellen om te vragen hoe het moet.

---

## 7 · Kleur op het donkere formulier

Doorgemeten tegen matzwart `#141311`:

| | contrast | rol |
| --- | --- | --- |
| Crème `#EDE7D8` | 15,1 : 1 | leestekst |
| Vuur `#E86A2C` | 5,8 : 1 | de knop |
| Goud licht `#A88338` | 5,3 : 1 | de kleine mono-bovenschriften |
| Mat goud `#8D6712` | 3,6 : 1 | alleen lijnen, randen en vlakken — nooit tekst onder 14 px |

Op de vuurknop: **matzwart** (5,8 : 1). Crème op vuur haalt 2,6 : 1 en leest als een
uitgezette knop, terwijl het de enige actie op het scherm is.

**Fris en umami zijn kaartkleuren, geen UI-kleuren.** Ze kleuren de route op de kaart in de
Experience-app. Op het bestelformulier komen ze niet voor.

---

## 8 · De sticker

**Aanname: er is nog geen printer gekocht.** Daarom canvas, niet ZPL —
printeronafhankelijk, de kronkelweg met de haltes tekent zichzelf net als in de app, Cinzel
en accenten werken gewoon, en `^CI28` is niet nodig.

Nieuw bestand: `src/lib/printBoxLabel.ts`. Náást `printLabel.ts`, niet erin.

**Printen raakt de Experience-API nooit aan.** Dat is de eis. Op 22 december, honderd
stickers, mag een haperende andere app niet betekenen dat er niets uit de printer komt.
Alles wat de sticker nodig heeft staat sinds het koppelen in `doos_snapshot`: de haltes voor
de kronkelweg, en per onderdeel de naam, de allergenen en de houdbaarheid.

**En een herdruk leest diezelfde snapshot — nooit opnieuw ophalen.** Anders geeft een
herdruk in januari een andere sticker dan die op de doos zat, en dat is precies wat de
snapshot moest voorkomen. Er is geen pad van de printknop naar het netwerk.

**De gedeelde fixture.** `docs/contracten/experience-v1.md` plus de twee JSON-bestanden
ernaast zijn het contract in uitvoerbare vorm. `src/lib/boxLabel.test.ts` tekent ertegen;
de Experience-kant hoort ertegen te antwoorden. Loopt de vorm uit elkaar, dan wordt één van
de twee rood. `/dev/sticker` tekent de sticker uit diezelfde fixture, zodat je hem kunt
nakijken zonder printer en zonder data.

**Wat erop staat:** volledige naam · aantal personen · afhaalmoment · per onderdeel de THT
(`afhaaldatum + houdbaarheid_dagen`) · de allergenensamenvatting. Ontbreekt de data, dan
valt die regel weg — nooit een lege of geraden waarde.

**Regels voor de renderer:**

- **Formaat en dpi zijn parameters, geen constanten.**
  `renderBoxLabel({ breedte_mm, hoogte_mm, dpi, ... })`, altijd op de eigen resolutie van de
  doelprinter, nooit op een vaste maat die daarna geschaald wordt.

  | | 203 dpi | 300 dpi |
  | --- | --- | --- |
  | 4 × 6 inch (101,6 × 152,4 mm) | 812 × 1218 px | 1200 × 1800 px |

- **Lijnen en letters, geen gevulde vlakken.** Een thermische printer print één bit per punt;
  een grijsvlak wordt een rasterpatroon.
- **De naam wordt nooit afgekapt.** Krimpen tot een ondergrens, daarna twee regels. Afkappen
  betekent dat iemand de verkeerde doos meeneemt.
- **Lettertype eerst laden.** `document.fonts.load('...Cinzel')` en afwachten vóór de eerste
  `fillText` — anders valt canvas zonder foutmelding terug op een standaardletter en zie je
  het pas op papier.
- **Testen met een accent.** Renée, Björn, Ø — één keer echt printen voordat iemand zegt dat
  het werkt.

**Twee prints:** de sticker onderop de doos en het QR-label op het deksel. Allebei ná een
geslaagde koppeling, allebei uit de snapshot.

**Bij een andere printer** verandert alleen de drie getallen. Wil er alsnog ZPL op een Zebra,
dan komt er een tweede uitvoer naast de canvas-renderer, en pas dán is `^CI28` nodig plus een
lettertype in het printergeheugen. Die tweede uitvoer wordt nu niet gebouwd.

---

## 9 · De bevestigingsmail

- **Licht, niet donker.** Crème `#EDE7D8` ondergrond, zwarte tekst, 600 px, tabel-indeling,
  alle opmaak inline.
- **Eigen sjabloon:** `mailBestellingBevestiging` in `serverMail.ts`. `wrapHtml` blijft af.
- **Platte tekst is handgeschreven**, letterlijk de tekst uit briefing §4. Niet afgeleid uit
  de HTML.
- **De weekdag wordt gerekend, niet opgeslagen.** "Dinsdag 22 december" klopt voor 2026, maar
  zodra de datum verzet wordt en de weekdag als tekst vaststaat, liegt de mail.
- **De samenstellingszin komt uit `doos_snapshot`**, gerekend — net als op het formulier. Eén
  bron, twee schermen, geen kans op twee verschillende getallen.
- **Geen prijs in deze mail** — wel de regel dat er een betaalverzoek volgt.
- **Het telefoonnummer uit `settings`** hoort erin, want wijzigen en annuleren gaat
  telefonisch (randgeval 11).
- Faalt Resend, dan `mail_status = 'mislukt'` met de foutregel, zichtbaar in de hub. De
  bestelling verdwijnt niet.

**Geen mail zonder token.** De bevestiging bevat de persoonlijke link, dus hij mag pas uit
als de koppeling geslaagd is. Valt die op *mislukt*, dan blijft de mail vastgehouden en
toont de hub het dubbel: *wacht op koppeling* én *mail niet verstuurd*, met de reden erbij.
Zodra iemand op koppelen drukt en het lukt, gaat de mail alsnog. De poort staat los van het
versturen in `src/lib/mailPoort.ts`, met tests — zo is de regel te bewijzen zonder dat er
een mail hoeft te bestaan, en is er straks maar één plek die hem kan overtreden.

---

## 10 · Randgevallen — afvinklijst

| # | Geval | Hoe het wordt afgevangen |
| --- | --- | --- |
| 1 | Namen met tekens (Renée, Björn, Ø) | Canvas rendert Unicode zelf. Fontlaadcontrole vóór render. Handmatige printtest met een accent. |
| 2 | Lange namen | Krimpen tot een ondergrens, daarna twee regels. Nooit afkappen. Test met "Van der Meer-Hendriksen". |
| 3 | Bestelling wijzigt na printen | Trigger zet `sticker_herprint_nodig`; hub toont **opnieuw printen**. |
| 4 | Twee keer op bestellen drukken | Knop uit bij indrukken; `UNIQUE (organization_id, idempotency_key)` geeft de bestaande bestelling terug. |
| 5 | Mail komt niet aan | `mail_status = 'mislukt'` + foutregel, opnieuw te versturen. |
| 6 | Iemand deelt de link | Mag. Alleen voornaam, personen en de afhaaldatum gaan de grens over — op één plek te controleren. |
| 7 | Laatste doos, twee tegelijk | `plaats_bestelling(...)` met rijvergrendeling, telt dozen. |
| 8 | Experience-API weg tijdens bestellen | Cache dekt A. Is de cache leeg, dan neemt het formulier niets aan en zegt dat. B faalt naar `koppel_status = 'mislukt'`; de bestelling blijft. |
| 9 | **Experience-API weg tijdens printen** | Kan niet: printen leest alleen `doos_snapshot`. Geen pad van de printknop naar het netwerk. |
| 10 | Klant ververst en bestelt opnieuw | Nieuwe pagina = nieuwe `idempotency_key`, dus #4 vangt dit niet. De hub markeert twee bestellingen met hetzelfde mailadres op hetzelfde moment als *mogelijk dubbel*. Signaleren, niet blokkeren — twee dozen voor één gezin kan echt. |
| 11 | Afhaalmoment geschrapt met bestellingen eraan | `ON DELETE RESTRICT` weigert. Verplaatsen met de hand, en dan valt #3 aan. |
| 12 | Klant wil wijzigen of annuleren | Geen route; telefonisch. Het nummer staat in de mail, uit `settings`. |
| 13 | Teller van 8 naar 9 | Het aantal dozen springt van 1 naar 2; een moment met nog één doos vrij wordt op datzelfde scherm doorgestreept. Direct zichtbaar, niet pas bij het versturen. |
| 14 | Iemand zet zich twee keer op de wachtlijst | `UNIQUE (doos_type_id, email)`; tweede keer geeft dezelfde bevestiging, geen tweede rij. |
| 15 | Gedeelde link verbruikt het welkomstmoment | §5 zegt "bij de eerste opening", §6.6 zegt dat delen mag. Scant een gast eerder dan de besteller, dan ziet de besteller de stille versie. Experience-kant, maar een echte botsing tussen twee regels. |

---

## 11 · Volgorde van bouwen

1. **Migratie** — vier tabellen, RLS, de drie regels uit §2.5, `plaats_bestelling`. Zonder
   waarden erin. Mathijs draait hem zelf.
2. **Publiek formulier + bevestigingsscherm + de twee uitverkocht-schermen + wachtlijst** —
   routes in `PUBLIC_ROUTES`, AVG-vinkje, en de bestelling die echt wordt opgeslagen.
3. **Hub** — `/verkoop/bestellingen`: allergietegel, gelezen-knop, naam op de doospagina.
   Zonder dit is stap 2 een postbus die niemand leegt.
4. **Koppelstap + wachthond** — aanroepen A en B; faalt netjes zolang ze er niet zijn.
   Vult `experience_cache` en `doos_snapshot`.
5. **Sticker + QR-label** — `printBoxLabel.ts` met dpi-parameter, uit de snapshot, plus de
   printtest met een accent.
6. **Mail** — pas als er een token is.
7. **Opruimtaak** — de drie regels uit §5.

Stap 1 tot en met 3 en stap 7 hangen nergens van af. Stap 2 draait zonder A: dan toont het
formulier de samenstellingszin niet, en zolang er ook geen cache is neemt het geen
bestellingen aan.

**De mail gaat vanzelf.** Direct na een geslaagde koppeling — vanuit de knop in de hub én
vanuit de nachtelijke cron. De cron pakt daarnaast bestellingen op die wél een token hebben
maar waarvan de mail eerder strandde. Handmatig versturen kan vanuit de hub, voor als het
adres gecorrigeerd is.

**Bewaking die geen unit-test kan doen.** De bestelknop stond een dag onzichtbaar doordat
de reset `.hb button { background: none }` zwaarder woog dan `.hb-knop`. Alle tests groen,
`tsc` schoon, cascade kapot. Daarom `tests/bestelstroom/knop-kleuren.spec.ts`: Playwright
vraagt de browser om de berekende kleuren en eist vuur op matzwart, minstens 44 px hoog, en
precies één oranje ding op het scherm. Draait tegen `/e2e-test/bestelstroom` — geen
database, geen login, achter `NEXT_PUBLIC_E2E=1` zoals de menukaart-tests.

```bash
npx playwright test --project=bestelstroom
```

---

## 12 · Later — niet nu

Bekend, opgeschreven, en bewust blijven liggen tot de bestelstroom af is:

- **`/contact`: publiek, maar mét de app-schil eromheen.** Verscheen op 3 september in
  `PUBLIC_ROUTES` (niet vanuit deze stroom). De supportpagina werkt ingelogd én uitgelogd.
  In `PUBLIC_PAGES` zetten haalt de sidebar ook weg voor wie wél is ingelogd; eruit laten
  geeft een uitgelogde bezoeker de app-schil om een supportpagina. Staat nu als bekende
  uitzondering in `publicRoutes.test.ts`. Keuze aan Mathijs.

- **React-waarschuwing over shorthand-stijlen.** *"Removing borderColor border"* —
  verschijnt onder andere op `/verkoop/leads`, dus buiten deze stroom. Oorzaak: een
  inline-stijlobject dat `border` mengt met een losse `borderColor`, vermoedelijk in de
  badge-componenten (`LEAD_STATUS` geeft een `border`-waarde die elders als `borderColor`
  wordt gezet). Onschuldig ogend, maar het geeft bij een rerender de verkeerde rand.

---

## 13 · Wat er nog open staat

1. **Twee velden in aanroep A** — `soort` en `per` per onderdeel (§3). Zonder die twee blijft
   het achterste deel van de samenstellingszin met de hand ingetikt, en dat is de fout die
   deze ronde al een keer gemaakt is.
2. **De rest van het contract** — URL's staan vast, maar niet hoe de aanroepen zich
   legitimeren en wat er bij een fout terugkomt.
3. **De eetdatum** — voorlopig geschrapt; te bevestigen in de code van de Experience-repo,
   niet in het conceptdocument.

**Niet blokkerend** — gaat als lege configuratie de database in, het formulier laat weg wat
het niet weet: prijs, afhaaldatums en -tijden, maximum per moment, totaalmaximum,
afhaaladres, labelformaat en dpi.
