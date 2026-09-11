# Bouwplan — keukenplanner en microtaken

**Repo:** BBQ Architect. **Datum:** 8 september 2026 (versie 11).
**Hoort bij:** `prompt-claude-code-keukenplanner.md` — die geeft de bedoeling; dit geeft
datamodel, routes, botsingen en volgorde.

**Wat er in versie 2 is veranderd:** de bouwvolgorde begint niet meer bij de ruimte maar
bij de receptstappen, want de ruimte wacht op een huurcontract en de stappen niet; de
ontleder is terug en zit in dezelfde golf als het stappenscherm; passieve duur schaalt wél,
maar met het stukgewicht en niet met het aantal; en opwarmen is een eigen taak vóór het werk
geworden, want actief komt niet altijd eerst.

**Wat er in versie 3 is veranderd:** batchen kijkt naar de capaciteit van het apparaat en
splitst in ladingen — anders plant hij veertig kilo in een smoker die er twintig houdt; een
passieve gaarstap eindigt op kerntemperatuur en niet op de klok, dus de geplande duur is een
verwachting en de spreidingsbewaker gaat daar uit; opwarmen krijgt een actieve kop, want een
oven zet zichzelf niet aan; en `warm_blijft_min` staat per machine en standaard leeg, want de
Yoder aanhouden kost pellets.

**Wat er in versie 4 is veranderd:** een gesplitste batch meldt dat de eerste lading moet
terugkoelen en koelruimte kost — anders past het plan op papier en niet in de keuken; en een
herplanning die uit een waarneming volgt zegt in één regel wat er verschoof en of het nog
haalbaar is, want een dag die stilletjes een uur opschuift kost je het vertrouwen in het
scherm. Het ontwerp van dat scherm staat in `keukenscherm-designprompt.md`.

**Wat er in versie 5 is veranderd** — allemaal gevonden door vier echte recepten te ontleden,
niet door nadenken: batchen en meerijden blijken twee mechanismen (§2.4), en meerijden vraagt
een temperatuurtoets die batchen niet nodig heeft; passieve tijd kent een derde soort waarin
de kok in de buurt moet blijven omdat hij elk half uur moet natspuiten (§2.7); en een gaar
eind hoeft geen thermometer te zijn — een prikker met weerstand is net zo goed een
waarneming.

**Wat er in versie 6 is veranderd:** golf 0 tot en met een deel van golf 5 is gebouwd. Zie
§10 voor wat er staat, wat er nog niet in zit en wat er open blijft.

De prompt zegt: begin met lezen, niet met bouwen. Dat is gebeurd — op de live database
(`oheilybckvtsczmbczot`, Frankfurt) en op de code, niet op de migratie-map. Uitkomst in één
zin: **ongeveer de helft van wat de prompt vraagt staat er al, en op acht plekken botst de
prompt met wat er ligt of met hoe een keuken werkt.** Wie dit plan overslaat en de prompt
letterlijk uitvoert, bouwt een tweede stationstabel, een tweede apparatenlijst en een tweede
set start/klaar-knoppen naast de bestaande.

---

## 1 · Wat er al ligt

Geteld op de productiedatabase op 8 september 2026.

| Wat de prompt vraagt | Wat er al is | Rijen | Oordeel |
| --- | --- | --- | --- |
| `receptstappen` | **`recipe_steps`** — 23 kolommen: `step_order`, `tekst`, `actie`, `hoeveelheid`/`eenheid`, `duur_actief_min`, `duur_passief_min`, `station`, `apparaat`, `temp_doel_c`, `hangt_af_van_stap_id`, `bron` | 16 | Bestaat, dekt 80% van de gevraagde velden. **Uitbreiden, nooit vervangen.** |
| `productietaken` | **`prep_tasks`** — 32 kolommen: `scheduled_at`, `started_at`, `completed_at`, `status`, `duration_min`, `duur_actief_min`, `duur_passief_min`, `batch_key`, `station_id`, `component_id`, `recipe_step_id`, `target_qty` | 51 | Bestaat compleet. Nieuwe tabel is verboden. |
| `voorganger_stap_id` | **`prep_task_dependencies`** (task_id → depends_on_id) + `recipe_steps.hangt_af_van_stap_id` | 0 | Bestaat, staat leeg. |
| `apparaten` | **`materieel`** — 49 kolommen, waaronder `concurrent_jobs`, `capaciteit_waarde`/`-eenheid`, `capaciteit_per_uur`, `temp_min_c`/`temp_max_c`, `locatie`, `gn_compatibel`, `maakt_mogelijk` | 41 | De hele machinelijst staat er al, inclusief de Yoder. **Geen `apparaten`-tabel maken.** |
| `stations` (opslag) | **`opslag_locaties`** — `soort`, `temp_min_c`/`max`, `gn_capaciteit`, `max_belading_kg`, gekoppeld aan `materieel_id` | 14 | Koelcel en vriezer bestaan al als plek. |
| GN-rekentabel | **`gn_maten`** — `inhoud_liter` én `vulgraad` **per maat** (0,80–0,90, niet één vaste 0,8) | 23 | Nauwkeuriger dan de prompt. De tabel wint. |
| Terugrekenen | `src/lib/prep/prepTaskScheduler.ts` — backward-scheduling + topologische sortering | — | Bestaat, maar rekent met fase-forfaits (pekel = 36 u terug), niet met stap-duren. |
| Batchen | `src/lib/prep/werkvolgorde.ts` — bundelt op `batch_key`, telt hoeveelheden op | — | Bestaat in eerste vorm. Sleutel is `comp:<component>:<datum>`, niet bewerking + apparaat. |
| Gaten vullen | idem, regel 145 e.v. — zoekt actieve blokken die in een wachtblok passen, greedy op deadline, venster 4 uur | — | Bestaat. Passief wordt afgeleid uit een **hardgecodeerde fase-lijst**, niet uit de stap. |
| Start / Klaar | `/api/prep/start-task`, `/api/prep/complete-task`, plus skip, snooze, reassign | — | Bestaat, met tenant-auth, audit-log en voorraadaftrek. |
| Keukenscherm | `/keuken/kookbord` (MEP-scherm, Supabase realtime), `/keuken/board` (prep-KDS) | — | Bestaat. `/keuken` zelf is sinds mei een **redirect naar `/gerechten`**. |
| HACCP | `haccp_records` | 165 | Bestaat, met foto's en bevestiging. |

Verder van belang: `components` (48 rijen, met `prep_minutes` en `yield_factor`),
`technieken` (44 rijen), `kitchen_stations` (5 rijen), `time_logs` (14 rijen —
**dat is in- en uitklokken van personeel, geen taakmeting**).

### Drie dingen die je moet weten voor je iets aanraakt

1. **`recipe_steps` is een dode tabel.** Er staan 16 stappen in, over **2 van de 20
   gerechten** (de ananas 13, de gerookte bavette 3). Er is in de hele codebase **geen enkele
   regel die de tabel leest of schrijft** — de ontleder die hem vulde staat er niet meer.
   Het scherm dat de stappen toont bestaat niet. De planner erft dus een lege keuken.
2. **`recipe_steps`, `gn_maten` en `opslag_locaties` hebben geen DDL in de repo.** Ze zijn
   ooit rechtstreeks op de database gezet. `grep` op `supabase/migrations` vindt ze niet.
   Wie zijn migratie baseert op de migratie-map, mist ze en botst bij het toepassen.
   Golf 0 begint dus met het vastleggen van wat er al staat.
3. **`kitchen_stations` betekent iets anders dan wat de prompt bedoelt.** Zie §2.

---

## 2 · Acht botsingen, en hoe ik ze oplos

### 2.1 Station is nu een soort werk, niet een plek

De vijf rijen in `kitchen_stations` heten Koud, Smoker, Warm, Sauzen, Expeditie. Dat zijn
*soorten werk*; ze worden gebruikt om prep-taken over kolommen op het bord te verdelen. De
prompt bedoelt met station een **plek waar je staat**: werkbank 2, koelcel, spoelhoek — iets
waar meters tussen zitten.

Nog verwarrender: `recipe_steps.station` is vrije tekst met wéér andere woorden —
"snijstation", "kookstation", "grill", "pass". Drie woordenlijsten voor één begrip.

**Voorstel:** één tabel, twee soorten rijen. `kitchen_stations` krijgt er `is_fysiek`,
`nummer` en `exclusief` bij. De vijf bestaande rijen blijven staan en krijgen
`is_fysiek = false` — het bord blijft werken. De echte keuken komt erbij als fysieke rijen
zodra de slagerij is opgemeten. `station_afstanden` wijst naar deze tabel. `recipe_steps`
krijgt een echte `station_id` naast het oude tekstveld, en het tekstveld wordt in golf 10 met
de hand omgezet — 16 stappen, dat is een half uur werk, geen migratiescript.

*Alternatief dat ik afraad:* een aparte tabel `keuken_plekken`. Dan heb je twee
stationswerelden en elke query moet kiezen. Dat probleem hebben we al eens gehad met
gerechten en recepten.

### 2.2 De apparatenlijst bestaat al en heet materieel

41 rijen, 49 kolommen, met vervangingswaarde, capaciteit, temperatuurbereik en
`concurrent_jobs`. Wat er niet in staat is **opwarmtijd**, **schoonmaaktijd** en
**exclusief bezet tijdens gebruik** — plus twee die uit §2.5 volgen: `aanzet_min` en
`warm_blijft_min`. Vijf kolommen op `materieel`, geen nieuwe tabel.

Wat er wél al staat en gebruikt moet worden is de **capaciteit**: `concurrent_jobs`,
`capaciteit_waarde` en `capaciteit_eenheid`. Zie §2.4 — daar hangt meer aan dan het lijkt.

### 2.3 Het duurmodel botst half

De prompt wil `duur_vast_min` + `duur_per_eenheid_min` + `aandacht` (actief of passief).
`recipe_steps` heeft `duur_actief_min` + `duur_passief_min` — en dat is rijker, want een
stap kan allebei zijn: karamel koken is 15 minuten werk plus 5 minuten inkoken.

**Voorstel:** de actieve tijd wordt opgesplitst, de passieve schaalt met iets anders.

```
duur_actief_min  =  duur_vast_min + duur_per_eenheid_min × hoeveelheid
duur_passief_min =  referentieduur × (stukgewicht ÷ passief_ref_kg)   ← verwachting, zie §2.6
```

`aandacht` komt er dus **niet** als kolom bij: een stap is passief als `duur_actief_min = 0`
en `duur_passief_min > 0`. Eén waarheid, niet twee die uit elkaar kunnen lopen. Wel moet
`werkvolgorde.ts` af van zijn hardgecodeerde lijst `PASSIVE_PHASES` — passief wordt voortaan
uit de stap gelezen.

**Correctie op mijn eerste versie:** ik schreef dat passieve duur niet meeschaalt. Dat is
fout. Hij schaalt niet met het **aantal** — drie briskets naast elkaar in de smoker duren
samen niet langer dan één — maar wel met het **formaat van het stuk**: acht kilo rookt
langer dan vier. Daarom `passief_ref_kg` op de stap (bij welk stukgewicht hoort die duur) en
`stuk_gewicht_kg` op de taak (wat ligt er vandaag). Ontbreekt een van beide, dan blijft de
referentieduur staan met het etiket *geschat* — niet stilletjes vermenigvuldigd met een
aangenomen gewicht.

Dat heeft twee gevolgen die verderop terugkomen:

- **Batchen voegt de actieve tijd samen, niet de passieve** — en alleen als het past. Zie
  §2.4.
- **De meting moet het stukgewicht kennen.** `stuk_gewicht_kg` gaat daarom mee in
  `taakmetingen`. Maar leren op tijd is bij passieve gaarstappen sowieso de verkeerde
  gedachte; zie §2.6.

### 2.4 Batchen heeft een grovere sleutel dan nodig

De prompt wil batchen op `bewerking_code` zoals `snipperen_ui`. In `recipe_steps` staat
`actie` — maar dat is "snijden", "koken", "emulgeren": het werkwoord zonder het onderwerp.
Drie gerechten met ui leveren dan één batch op met ui, wortel én bosui erin.

**Voorstel:** de batchsleutel is **bewerking + component + apparaat**, niet één tekstveld
dat iemand consistent moet intikken. `prep_tasks.batch_key` bestaat al en heeft nu de vorm
`comp:5:2026-06-20`. Die wordt `snijden:comp5:app12:2026-06-20`. `recipe_steps` krijgt
`bewerking_code` als genormaliseerd werkwoord (met een korte vaste lijst, gevoed uit
`technieken`), en het onderwerp komt uit de `component_id` die er al is.

**Batchen en meerijden zijn twee verschillende dingen, en ik gooide ze op één hoop.**
Gevonden bij het ontleden van vier echte recepten (versie 5):

- **Batchen** is werk dat één handeling wordt. Drie gerechten met gesnipperde ui: één keer
  snipperen. De Piggy Mix die zowel onder de oerham als onder de spareribs gaat: één keer
  aanmaken. Sleutel: bewerking + component. Hoeveelheden tellen op, de duur is één keer vast
  plus de som maal per eenheid.
- **Meerijden** is werk dat tegelijk in hetzelfde apparaat past. Pulled beef en oerham draaien
  allebei op 120 °C en kunnen samen de smoker in. Het blijven twee taken met twee eigen
  eindes; ze delen alleen een venster en een apparaat.

Het verschil is niet academisch. Meerijden vraagt een **verenigbaarheidstoets** die batchen
niet nodig heeft: spareribs draaien op 110 °C en kunnen er dus **niet** bij, hoe veel plek er
ook over is. De sleutel voor meerijden is apparaat + temperatuur + venster; die voor batchen
is bewerking + component. Wie ze samenvoegt tot één regel plant vroeg of laat ribs van 110
mee in een pit van 120.

Mijn brisket-voorbeeld hieronder was dus eigenlijk meerijden, geen batchen. De
capaciteitsregel geldt voor allebei:

**Een batch mag nooit groter zijn dan het apparaat.** "Drie briskets is één keer inleggen"
klopt alleen als ze er alle drie tegelijk in passen. `materieel` heeft `concurrent_jobs` en
`capaciteit_waarde`/`capaciteit_eenheid` al staan; de batcher **moet** ze lezen. Doet hij dat
niet, dan plant hij veertig kilo in een smoker die er twintig houdt, en dat merk je pas als
je ervoor staat — op de ochtend zelf, met de klok tegen je.

De regel: een batch wordt gevuld tot de eerste grens raakt (aantal óf gewicht óf volume), en
wat overblijft wordt een **tweede lading** met een eigen tijdvak. Bij een exclusief apparaat
begint die lading pas als de eerste eruit is, inclusief eventuele schoonmaaktijd ertussen. Dat
schuift dus de hele keten: het terugrekenen moet dat meenemen, want twee ladingen brisket
betekent dat de eerste een halve dag eerder in moet.

Twee dingen die zichtbaar moeten zijn in plaats van weggerond:

- **Past één stuk al niet** (een brisket van 12 kg in een oven die 10 kg houdt), dan is dat
  geen batch-probleem maar een onmogelijk plan. Harde melding, geen stille afronding.
- **Ontbreekt de capaciteit** op het apparaat, dan wordt er niet gebatcht — niet "dan
  waarschijnlijk wel". Onbekende capaciteit betekent één taak per keer, met het etiket
  *capaciteit onbekend* erbij. Dat is de veilige kant van de fout.

**Een tweede lading kost koeling, niet alleen tijd.** Dit is het stuk dat je niet ziet
aankomen: de eerste lading komt er een halve dag eerder uit en moet dan ergens naartoe.
Terugkoelen, wegzetten, koelruimte in beslag nemen — HACCP-werk, op de dag dat de koeling
toch al het krapst zit. Verschuift het terugrekenen wel de tijdlijn maar niet de koeling, dan
plan je iets wat op papier past en in de keuken niet.

Zolang de koelcapaciteit niet echt is doorgerekend (dat is `opslag_locaties` met
`gn_capaciteit` en `max_belading_kg`, en dat hoort bij de paklijst-golf) doet de planner het
enige eerlijke: hij **meldt** het. Elke gesplitste batch levert een regel op — *tweede lading:
extra koelmoment, eerste lading moet terugkoelen en weggezet* — en die melding is niet weg te
klikken zolang de splitsing bestaat. Een gemiste koelplek is geen ongemak maar een
voedselveiligheidsprobleem, dus dit hoort bij het HACCP-werk en niet bij de tijdlijn.

### 2.5 Nee, actief komt niet altijd vóór passief — en dat was niet opgelost

Eerlijk antwoord op de vraag: mijn eerste versie **ging er wel van uit**. Een stap was
"eerst werken, dan wachten" — dichtschroeien en laten rusten, koken en laten afkoelen. Dat
de opwarmtijd op `materieel` staat lost dat niet op; het maakt het alleen mogelijk om het op
te lossen. Opwarmen is een derde soort tijd: **passief, en het komt ervóór.**

Zonder expliciete regel gaat het twee keer mis. De planner zet de actieve taak op het
moment dat de oven nog koud is, en het gatenvullen ziet de opwarmtijd niet als ruimte
terwijl je er juist prima een werkbank in kunt schoonmaken.

**De regel:** wordt een apparaat gebruikt terwijl het koud is, dan zet de planner er een
eigen taak `opwarmen` vóór, die eindigt op het moment dat de actieve stap begint.

Maar die taak is **niet puur passief** — een oven zet zichzelf niet aan. Er hoort een kop van
een halve minuut aan: iemand loopt erheen en drukt op de knop. Laat je die weg, dan staat het
werk om 10:00 gepland terwijl het ding om 09:40 koud bleef, en dat is precies het soort fout
dat pas 's ochtends zichtbaar wordt. Daarom krijgt `materieel` een kolom `aanzet_min` (default
1). Dat aanzetten is echt actief werk: het staat op een plek, dus er hoort looptijd bij, en het
bezet de kok even.

Een stap ziet er daarmee zo uit, en elk van de vier stukken kan nul zijn:

```
[ aanzetten ]  →  [ opwarmen ]  →  [ actief werk ]  →  [ passief wachten ]
   kok bezet       kok vrij          kok bezet           kok vrij
```

**`warm_blijft_min` krijgt geen vaste default van 90.** Dat was te ruim en te dom: hoe lang
een apparaat warm blijft verschilt per machine, en het geldt alleen als het ding aan blijft
staan. De Yoder aanhouden kost pellets — dat tweede gebruik is dus niet gratis. Het veld wordt
per machine ingevuld en staat standaard **leeg**, en leeg betekent: hij koelt af, dus opnieuw
opwarmen. Dat is de veilige kant, en het is ook meestal de goedkoopste: liever twintig minuten
opwarmen dan een uur stoken voor niets.

De planner overbrugt een gat dus alleen door aan te houden als het gat korter is dan de
ingevulde `warm_blijft_min` van díe machine. Bij twijfel of bij een leeg veld: uitzetten en
straks opnieuw aan.

### 2.6 Een passieve gaarstap eindigt op kerntemperatuur, niet op tijd

Hier ging mijn vorige versie de mist in met de mediaan per kilo. Roken schaalt niet lineair
met gewicht — het gaat om dikte en begintemperatuur, en een brisket van acht kilo duurt geen
twee keer zo lang als een van vier. Per kilo leren loopt daardoor **systematisch** scheef aan
de uiteinden: kleine stukken worden te ruim ingepland, grote te krap. En krap plannen stapelt
zich op tot de middag niet meer klopt.

Twee correcties.

**De spreidingsbewaker gaat uit voor passieve stappen.** Die kijkt of hoogste ÷ laagste
binnen de laatste tien metingen boven de twee komt en vlagt de stap dan als verkeerd
gedefinieerd. Bij roken haalt hij die factor bijna altijd — een halve en een hele brisket
zitten er zo overheen — en dan staat er straks een lijst met "opsplitsen" waar niets mis mee
is. Een lijst die altijd vol staat, wordt niet meer gelezen.

**De geplande duur is een verwachting, geen eind.** Een passieve gaarstap wordt in het
datamodel niet afgesloten door de klok maar door een waarneming. `prep_tasks` krijgt daarom
twee velden naast elkaar: `verwacht_eind` (gerekend, altijd gevuld, waar de planning op
draait) en `bevestigd_eind` (waargenomen, meestal leeg). Zolang het tweede leeg is, plant de
planner op het eerste maar zegt erbij dat het een verwachting is.

Dat maakt de bluetooth-thermometer straks een aansluiting in plaats van een verbouwing. Zodra
de curve zegt dat het later wordt, schrijft die het nieuwe verwachte eind en herplant de dag —
en dat is beter dan welke geleerde duur ook, want het is een meting aan dít stuk vlees in
plaats van een gemiddelde over tien andere. `recipe_steps.temp_doel_c` bestaat al en is het
doel waarop dat eindpunt bepaald wordt.

Tot die thermometer er is verandert er niets aan de werking: de kok drukt op Klaar en dat is
het bevestigde eind. Het model is er alleen alvast op gebouwd, zodat de thermometer geen
tweede waarheid wordt naast de eerste.

**Een herplanning moet zich melden.** Hier zit de keerzijde: zodra de waarneming van de
berekening wint, kan de dag midden in het werk een uur opschuiven omdat het vlees tegenvalt.
Dat is goed — dat is precies waarvoor het bedoeld is — maar niet als het scherm dan zonder
een woord een andere dag laat zien. Dan denkt de kok dat hij zich vergist heeft, en daarna
gelooft hij het scherm nooit meer.

Elke herplanning die uit een waarneming volgt levert daarom één regel op, in dezelfde vorm
als de meldingen in §6: wat er gebeurd is, wat het betekent, en of het nog haalbaar is.

> **Kern loopt achter — brisket zit op 68 °C, verwacht 40 minuten later**
> Drie taken verschoven. Uitlevering om 16:00 blijft haalbaar.

Wordt het níet haalbaar, dan staat dát er, met wat er sneuvelt. Een herplanning die stil
gebeurt is erger dan geen herplanning.

### 2.7 Passief betekent niet altijd weg kunnen lopen

Ook uit de vier ontlede recepten. Bij zowel de oerham als de spareribs staat: garen, en elk
half uur natspuiten. Dat is een passief blok van tweeënhalf uur met daarin elk halfuur een
handeling van een halve minuut.

In het model van nu is dat óf één passief blok — en dan stuurt de gaten-vuller hem naar de
andere kant van de keuken terwijl hij op minuut dertig bij de smoker moet staan — óf vijf
losse taken met vier stukjes wachten ertussen, en dan klopt de tijdlijn wel maar wordt het
scherm onleesbaar.

De oplossing is klein: twee kolommen op de stap, `herhaal_interval_min` en
`herhaal_duur_min`. Het blijft één taak op het scherm, maar de planner weet dat dit blok hem
**bindt aan de plek**. Zulke passieve tijd is geen vrije ruimte: er past alleen werk in dat
korter is dan het interval én op hetzelfde station staat. Een halfuur-interval betekent
praktisch dat je in de buurt blijft.

Dat is een derde soort passief, naast de twee die er al waren:

| Soort | Kok | Vulbaar met |
| --- | --- | --- |
| Vrij passief (rusten, marineren, opwarmen) | weg | alles wat past |
| Gebonden passief (elk half uur natspuiten) | in de buurt | kort werk op hetzelfde station |
| Bewaakt passief (`toezicht_nodig`) | erbij | niets |

`toezicht_nodig` bestaat al op `recipe_steps`; die derde rij is dus gratis. De middelste is
nieuw en komt uit de praktijk, niet uit een ontwerp.

**En niet elk eind is een temperatuur.** De spareribs zijn gaar als een prikker met een beetje
weerstand door het vlees gaat — een waarneming van een mens, geen meting van een sonde. Voor
het model maakt dat niets uit: `verwacht_eind` is gerekend, `bevestigd_eind` komt van buiten,
en of dat nu een thermometer is of een kok met een prikker is voor de planner hetzelfde.
Dat betekent wel dat de tablet die bevestiging moet kunnen aannemen zonder hardware.

### 2.8 Kleiner grut, voor de volledigheid

- **Vulgraad.** De prompt rekent overal met 0,8. `gn_maten` heeft een vulgraad **per maat**
  (0,90 voor een 20 mm bak, 0,80 voor een 200 mm bak — diep is instabieler). De tabel is de
  bron; het getal 0,8 komt nergens in code te staan. Ook de literinhouden staan er al en
  wijken op één plek af (1/3 · 100 mm is 3,9 L, niet 4).
- **`/keuken` is bezet.** Het is een redirect naar `/gerechten` voor oude bookmarks. Het
  wandscherm wordt **`/keuken/scherm`**, de tablet **`/keuken/tablet`**. De redirect blijft.
- **Eén gebruiker, maar niet één organisatie.** De prompt zegt "er is één gebruiker: de kok".
  De database is multi-tenant met RLS. Elke nieuwe tabel krijgt `organization_id NOT NULL`,
  expliciet meegestuurd bij elke insert — geen defaults, geen triggers.
- **Geen tweede set knoppen.** De prompt vraagt `/api/productie/taak/[id]/start` en
  `.../klaar`. Die bestaan als `/api/prep/start-task` en `/api/prep/complete-task`, mét
  auth, audit-log en voorraadaftrek. Die worden **uitgebreid**, niet gedupliceerd. Alleen
  wat echt nieuw is krijgt een nieuwe route.

---

## 3 · Het datamodel

Drie nieuwe tabellen. Vier tabellen krijgen kolommen erbij. Eén migratie die eerst
vastlegt wat er al staat.

### 3.1 `station_afstanden` — nieuw

| Kolom | Type | Opmerking |
| --- | --- | --- |
| `id` | bigint PK | |
| `organization_id` | uuid NOT NULL | |
| `van_station_id`, `naar_station_id` | bigint → `kitchen_stations` | uniek per paar |
| `meters` | numeric NULL | opgemeten; leeg = onbekend, niet 0 |
| `seconden` | integer NULL | opgemeten of gerekend |
| `bron` | text | `gemeten` of `geschat` — het scherm laat dit zien |

Zolang `meters` leeg is rekent de planner met `afstand ÷ 1,2 m/s + 3 s per deur`, en de
looptijd draagt het etiket *geschat*. Nooit stilletjes een getal invullen.

### 3.2 `schoonmaaktaken` — nieuw

Sjablonen, geen instanties. Per taak: `omschrijving`, `duur_min`, `station_id` of
`materieel_id`, `frequentie` (`per_gebruik`, `dagelijks`, `wekelijks`, `maandelijks`),
`haccp_vereist`, `actief`. De instanties zijn gewone `prep_tasks` met `schoonmaaktaak_id`
gevuld — één takenstroom, één bord, één set knoppen.

### 3.3 `taakmetingen` + `meethistorie_periodes` — nieuw

`taakmetingen`: `recipe_step_id` of `schoonmaaktaak_id`, `prep_task_id`, `werkelijke_min`,
`hoeveelheid`, `eenheid`, `stuk_gewicht_kg`, `tijdstip_van_dag` (smallint 0–23),
`onderbroken` (boolean), `periode_id`, `bron` (`gemeten` of `klopt_niet`).

`meethistorie_periodes`: `organization_id`, `gestart_op`, `afgesloten_op`, `reden`. Bij een
verhuizing of een nieuw apparaat sluit je de lopende periode af en begin je een nieuwe. De
schatter kijkt alleen naar de **lopende** periode. Zo kan oud en nieuw nooit door elkaar
gemiddeld worden, en is het toch één expliciete handeling met een reden erbij.

`onderbroken = true` telt niet mee in de schatting, maar wordt wél bewaard.

### 3.4 Uitbreidingen

**`recipe_steps`:** `bewerking_code` (text), `duur_vast_min`, `duur_per_eenheid_min` (int),
`passief_ref_kg` (numeric — bij welk stukgewicht hoort `duur_passief_min`),
`station_id` (bigint FK), `materieel_id` (int FK), `haccp_vereist` (bool),
`houdbaarheid_na_dagen` (int, default 3), `duur_bron` (`geschat` / `gemeten` / `handmatig`),
`herhaal_interval_min` en `herhaal_duur_min` (§2.7 — natspuiten elk half uur),
`splitsen_gevlagd` (bool, gezet door de spreidingsbewaker).

**`materieel`:** `aanzet_min` (default 1 — het lopen en drukken), `opwarm_min`,
`warm_blijft_min` (**leeg by default**; leeg = koelt af), `schoonmaak_min`,
`exclusief_bezet` (bool). Capaciteit staat er al: `concurrent_jobs`, `capaciteit_waarde`,
`capaciteit_eenheid`.

**`kitchen_stations`:** `is_fysiek`, `nummer`, `exclusief`.

**`components`:** `dichtheid_kg_per_liter`, `stuk_gewicht_kg`, `per_stuk_aantal_per_bak`,
`aandrukken`, `standaard_gn` (text → `gn_maten.code`), `serveertemperatuur`
(`warm` / `koud`), `houdbaarheid_na_bewerking_dagen`.

**`prep_tasks`:** `schoonmaaktaak_id`, `batch_id` (uuid, groepeert taken die samen één batch
zijn), `lading_nr` (smallint — welke lading binnen die batch, zie §2.4),
`stuk_gewicht_kg` (wat er vandaag ligt — overschrijft de component-default),
`verwacht_eind` en `bevestigd_eind` (§2.6 — gerekend naast waargenomen),
`looptijd_voor_min` (de gang naar dit station, apart zichtbaar).

Een aparte `batches`-tabel komt er niet: een `batch_id` op de taken doet hetzelfde en houdt
het herplannen simpel — een batch die uiteenvalt is dan gewoon een leeggelopen id.

---

## 4 · De planner

Eén module, `src/lib/keukenplanner/`, pure functies zonder database-toegang, net als
`prepTaskScheduler.ts` en `werkvolgorde.ts` nu al doen. De aanroeper haalt de data op en
geeft alles mee. Zo is elke stap in isolatie te testen — en dat is nodig, want dit is de
enige plek in de app waar een fout zich de hele dag opstapelt.

```
terugrekenen.ts   deadline per taak, marge per taak
batchen.ts        taken samenvoegen op bewerking + component + apparaat,
                  begrensd door capaciteit — splitst in ladingen
bezetting.ts      station en apparaat exclusief tijdens actieve stap
looptijd.ts       afstand tussen opeenvolgende stations, gangen bundelen
gatenvullen.ts    actieve taken in passieve blokken
prioriteit.ts     kleinste marge wint
plan.ts           voegt samen, levert NU + tijdlijn + percentage per klus
schatter.ts       mediaan, drempel, spreiding, monitorstand
```

De volgorde van redeneren is die van de prompt. Vier regels die niet in de prompt staan maar
er wel bij horen:

- **Een lopende taak verspringt nooit.** Bij herplannen is `status = in_progress` een anker.
- **Onbekend is geen nul.** Een stap zonder duur wordt niet als 0 minuten ingepland maar
  krijgt een zichtbare "duur onbekend" en valt buiten het gatenvullen. Dit is dezelfde regel
  als bij kostprijzen: een leeg veld verslaat een schatting die zich voordoet als feit.
- **Een batch deelt de actieve tijd, niet het klaar-moment.** `batchen.ts` telt hoeveelheden
  op voor het actieve deel en laat het passieve deel per taak staan, met een eigen eind.
- **Een batch past in het apparaat, of hij wordt gesplitst in ladingen** (§2.4). Onbekende
  capaciteit betekent niet batchen.
- **Opwarmen is een eigen taak vóór het werk** (§2.5): een korte actieve kop om aan te zetten,
  daarna passief opwarmen dat als vulbaar gat meetelt. Niet dubbel betaald binnen een
  ingevulde `warm_blijft_min`, en anders gewoon opnieuw.
- **Passieve gaarstappen plannen op `verwacht_eind`** (§2.6) en presenteren dat als
  verwachting. `bevestigd_eind` wint zodra het er is.

### De schatter, precies

- **Minder dan 5 bruikbare metingen** (`onderbroken = false`, lopende periode): de planner
  gebruikt de stap wél, maar rekent met de **hoogste** meting tot nu toe. Etiket: *monitor*.
- **Vanaf 5:** mediaan van de laatste 10. Etiket: *gemeten*.
- **Bijstellen:** wijkt de nieuwe mediaan minder dan 10% af van de opgeslagen schatting, dan
  verandert er niets.
- **Passieve gaarstappen leren niet op tijd** (§2.6). De duur per kilo blijft een grove
  verwachting voor de tijdlijn; hij wordt nooit tot *gemeten* gepromoveerd, want dikte en
  begintemperatuur bepalen het eindpunt en niet het gewicht. De kerntemperatuur is de
  waarheid.
- **Spreiding:** hoogste ÷ laagste binnen de laatste 10 > 2 → `splitsen_gevlagd = true`, en de
  stap komt op een lijst "verkeerd gedefinieerd". Doormeten heeft geen zin. **Deze bewaker
  staat uit voor passieve stappen** — daar haalt hij die factor bijna altijd, en een lijst die
  altijd vol staat wordt niet gelezen.
- **Vast en per eenheid scheiden:** pas fitten als er metingen zijn bij minstens twee
  hoeveelheden die meer dan een factor 1,5 uit elkaar liggen. Tot die tijd één duur voor de
  hele stap, met `duur_per_eenheid_min = 0`.
- **Tijdstip van de dag** wordt vastgelegd en verder niet gebruikt. Nu niet.

---

## 5 · Routes

| Route | Nieuw of bestaand |
| --- | --- |
| `GET /api/keukenscherm/vandaag` | **nieuw.** Levert kant-en-klare tekst. Het scherm rekent en formatteert niets. |
| `POST /api/prep/start-task` | bestaand — ongewijzigd |
| `POST /api/prep/complete-task` | bestaand — **uitbreiden** met `hoeveelheid` en `onderbroken`, schrijft een `taakmeting` |
| `POST /api/productie/klopt-niet` | **nieuw.** Taak-id + werkelijke duur. Schrijft een meting met `bron = klopt_niet` en herplant. |
| `POST /api/productie/verstoring` | **nieuw.** Apparaat X uit bedrijf. Herplant, geeft terug wat verschuift en wat kritiek wordt. |
| `POST /api/productie/meethistorie-reset` | **nieuw.** Sluit de lopende periode af met reden, zet betrokken stappen terug in monitorstand. |

Alles via `withTenantAuth`, validators in het bestaande patroon (`{ ok, data } | { ok, error }`,
geen Zod — dat is hier de huisstijl), audit-regel via `appendKdsAudit`.

---

## 6 · De schermen

**`/keuken/scherm`** — kiosk, 1920 × 1080 liggend, read-only, geen scroll, kleinste tekst
22 px. Vier vaste zones: NU (≈55%), STRAKS (5 regels), MELDINGEN (max 3), statusbalk.
Verversen via Supabase realtime — `KookbordClient.tsx` doet dat al met `postgres_changes`,
dat patroon wordt gekopieerd — met polling elke 30 s als terugval. Data ouder dan 90
seconden of verbinding weg: **zichtbaar melden, over het hele scherm.** Om 04:00 de dag
omzetten en herladen.

Read-only is hier een bouwregel, niet een gedragsregel: de pagina krijgt **geen enkele
POST-aanroep en geen formulier**. Niet een knop die verborgen is — helemaal geen knop.

**`/keuken/tablet`** — staand, dezelfde taak klein, drie knoppen: Start, Klaar, Loopt uit.
Raakvlakken minimaal 88 px, bedienbaar met een knokkel.

Naast elke duur staat waar hij vandaan komt: *geschat*, *monitor* of *gemeten*. Dat is niet
netjesheid maar de kern van het ontwerp — een scherm dat doet alsof het klopt terwijl het
dat niet doet, wordt binnen twee weken genegeerd.

---

## 7 · Bouwvolgorde

Elke golf levert iets werkends op. Niet vooruitbouwen.

**Gewijzigd ten opzichte van de eerste versie.** Daar was golf 1 "de ruimte", en die vraagt
om een opgemeten slagerij. Het huurcontract is nog niet rond, dus dat legt het hele project
stil op iets waar niemand iets aan kan doen. De ruimte is opgeknipt: de tien machines die je
al hebt staan kunnen vandaag ingevuld worden, de fysieke stations en de afstanden schuiven
naar achteren, vlak vóór de golf die ze als eerste nodig heeft. Alles ervóór draait zonder
sleutel van de Tramstraat.

| # | Golf | Klaar als |
| --- | --- | --- |
| 0 | **Drift wegwerken.** Migratie die `recipe_steps`, `gn_maten` en `opslag_locaties` vastlegt zoals ze live staan. Types genereren. | `supabase db diff` is schoon |
| 1 | **Stappen én de ontleder.** Kolommen op `recipe_steps`, een scherm om stappen te zien en te corrigeren, en de ontleder die ze schrijft (§7.1). | Twintig gerechten hebben stappen, door jou goedgekeurd |
| 2 | **Apparaten.** `opwarm_min`, `warm_blijft_min`, `schoonmaak_min`, `exclusief_bezet` op `materieel`, voor je tien belangrijkste machines. | De smoker weet dat hij moet opwarmen |
| 3 | **Planner v1.** Terugrekenen op stap-duren, bezetting, prioriteit, opwarmtaken. Levert NU + tijdlijn. | Een dag komt eruit die klopt |
| 4 | **Scherm.** `/keuken/scherm` met echte data, realtime, ouderdomsmelding. | Het hangt en het klopt |
| 5 | **Tablet + meten.** Start/Klaar/Loopt uit, `taakmetingen` schrijven, "klopt niet". **Vanaf hier draait het in monitorstand.** | Elke uitvoering laat een meting achter |
| 6 | **Batchen.** Batchsleutel om, `werkvolgorde.ts` erop aansluiten, actief samen en passief apart, **begrensd door `concurrent_jobs` en `capaciteit_waarde`**. | Drie gerechten met ui = één snippertaak, én veertig kilo in een smoker van twintig wordt twee ladingen |
| 7 | **Schoonmaak in de gaten.** `schoonmaaktaken`, gatenvullen leest passief uit de stap. | Een oventaak van 10 min krijgt een passende taak |
| 8 | **Verstoring.** Herplannen binnen een seconde, met wat kritiek wordt. | Smoker valt uit, plan staat er |
| 9 | **Paklijst.** Bakken en chafings uit `gn_maten` + componentdichtheid, plus de waarschuwing als twee klussen samen meer bakken nodig hebben dan er zijn. | De paklijst rolt eruit |
| 10 | **De ruimte.** *Wacht op de sleutel.* Kolommen op `kitchen_stations`, tabel `station_afstanden`, fysieke stations en opgemeten afstanden. | De keuken staat erin met echte meters |
| 11 | **Looptijd.** Afstanden meerekenen, gangen bundelen. | Twee haaltaken naar de koelcel worden één gang |
| 12 | **Thermometer.** *Wacht op de hardware.* De bluetooth-sonde schrijft `bevestigd_eind` en trapt een herplanning af. | De smoker zegt zelf dat het later wordt |

Golf 10 en 11 mogen naar voren zodra het contract rond is — niets ervóór hangt ervan af. Tot
die tijd rekent de planner met looptijd nul en zegt dat er ook bij: *afstanden nog niet
opgemeten*. Dat is eerlijker dan een matrix vol geschatte meters, en het scheelt straks een
opruimactie.

Golf 12 staat er los van en is klein, mits golf 3 de velden uit §2.6 meteen goed zet. Doe je
dat niet, dan is de thermometer geen aansluiting maar een verbouwing van de planner.

Golf 0 tot en met 5 is het echte werk. Daarna is elke golf op zichzelf nuttig en kun je
stoppen wanneer je wilt.

### 7.1 De ontleder hoort in golf 1, niet in een latere ronde

Twintig gerechten maal een stuk of vijftien stappen is driehonderd regels, elk met duur,
station, apparaat en afhankelijkheid. Dat tikt niemand in. Een invoerscherm zonder ontleder
is dus geen halve oplossing maar een lege huls — en dan blijft `recipe_steps` staan zoals hij
nu al maanden staat.

Wat er al ligt om op voort te bouwen: `/api/recipe-generate`, `/api/recipe/from-catalog` en
`/api/gerecht-vision-fill` draaien, met Anthropic-SDK, kostenplafond via `enforceAiCap`,
gebruikslogging en het `ai_suggested`-patroon waarbij jij per veld accepteert of
overschrijft. Ze schrijven alleen `preparation_steps` — een rijtje losse zinnen, zonder duur,
zonder station, zonder afhankelijkheid. Dat is precies het gat.

De ontleder wordt dus geen nieuwe machine maar een vierde route in hetzelfde patroon:
`POST /api/recipe/ontleed`. In: een gerecht met zijn componenten en zijn bestaande
`preparation_steps`. Uit: een voorstel voor `recipe_steps` met bewerking, hoeveelheid, vaste
en variabele duur, station, apparaat en voorganger — als **voorstel**, in een goedkeur-lade,
nooit rechtstreeks in de tabel. Jij keurt per stap goed; `bron` wordt `ontleder` bij
overnemen en `handmatig` zodra je iets wijzigt. De vaste regels blijven staan: geen
allergenen, geen kostprijs, geen productie-hoeveelheden uit het model.

Twee dingen die de ontleder **niet** mag invullen, omdat een plausibel getal hier erger is
dan een leeg veld: `passief_ref_kg` en de duren van stappen die hij niet uit de recepttekst
kan afleiden. Die blijven leeg en gaan in monitorstand — de eerste vijf keer dat je ze doet,
meet het systeem ze zelf.

---

## 8 · Wat we niet bouwen

Personeelsverdeling. Individuele GN-bakken volgen. Spraakbediening. Omzetgrafieken.
Recepturen bewerken op het wandscherm. Alles wat met de winkel te maken heeft. En: **geen
taalmodel in de planningslus.** AI blijft waar hij al zit — receptontleding (met goedkeuring
vooraf), aanvraag lezen, en later verstoring vertalen.

---

## 9 · Wat er nog van jou nodig is

**Beantwoord, dus geen blokkade meer:**

1. **De stationskeuze uit §2.1** — akkoord: fysieke rijen erbij in `kitchen_stations`, geen
   aparte tabel.
2. **Opwarm- en schoonmaaktijd van de tien belangrijkste machines** — komt in golf 2.
3. **Eén gerecht met een passieve stap erin** — komt in golf 1, als het gerecht waarop de
   ontleder wordt afgesteld voordat de andere negentien erdoorheen gaan.

**Blijft openstaan, en houdt niets tegen:**

4. **De opgemeten slagerij** — stations met nummers en de afstanden ertussen. Nodig voor golf
   10 en 11, en die staan achteraan omdat het huurcontract nog niet rond is. Zodra je de
   sleutel hebt: een rolmaat, een uurtje, en dan schuiven ze naar voren.


---

## 10 · Wat er gebouwd is (8 september 2026)

Golf 0 tot en met een deel van golf 5. Alles getypeerd, getest en gebouwd; nog niet
verantwoord aan echte productiedata, want die is er nog niet (zie "wat ontbreekt").

### Database

Twee migraties, allebei toegepast op productie. Data intact: `recipe_steps` 16,
`prep_tasks` 51, `materieel` 41.

| Migratie | Wat |
| --- | --- |
| `20260908120000_receptstappen_drift_vastleggen.sql` | Legt `recipe_steps`, `gn_maten` en `opslag_locaties` vast zoals ze live staan. Op productie een no-op. |
| `20260908130000_keukenplanner_golf1.sql` | Nieuwe kolommen op `recipe_steps`, `materieel`, `kitchen_stations`, `components` en `prep_tasks`; nieuwe tabellen `station_afstanden`, `schoonmaaktaken`, `meethistorie_periodes` en `taakmetingen`, elk met RLS. |

`recipe_steps` heeft nu ook een `updated_at`-trigger. Die ontbrak: de kolom bleef staan op
`created_at`.

### De planner — `src/lib/keukenplanner/`

Pure functies, geen database, `nu` wordt altijd meegegeven. **112 tests.**

| Module | Wat |
| --- | --- |
| `duur.ts` | Actief = vast + per eenheid × hoeveelheid. Passief schaalt met het stukgewicht. De vier soorten aandacht. |
| `schatter.ts` | Mediaan van tien, drempel van 10%, spreidingsbewaker (uit bij passief), monitorstand op de hoogste meting, vast/per-eenheid splitsen vanaf een verhouding van 1,5. |
| `batchen.ts` | Batchen op bewerking + component; meerijden op apparaat + temperatuur met een marge van 5 °C; splitsen in ladingen op aantal én gewicht. |
| `terugrekenen.ts` | Deadlines en marges via de afhankelijkheidsketen, inclusief aanzet- en opwarmtijd. Cykels lopen niet vast. |
| `gatenvullen.ts` | Werk in passieve blokken, met de drie soorten passief. |
| `plan.ts` | Voegt samen tot wat het scherm krijgt. |
| `laden.ts` · `meting.ts` · `meethistorie.ts` · `bijstellen.ts` | De databasekant: ophalen, meten, periodes, en de leerlus. |

### Routes

- `GET /api/keukenscherm/vandaag` — kant-en-klare tekst, `no-store`, schrijft niets.
- `POST /api/productie/klopt-niet` — afgekeurde schatting met de werkelijke duur.
- `POST /api/productie/verstoring` — apparaat weg; geeft terug wat verschuift en wat kritiek wordt.
- `POST /api/productie/meethistorie-reset` — periode afsluiten met verplichte reden.
- `POST /api/prep/complete-task` — **uitgebreid**: schrijft nu een `taakmeting` en stelt daarna
  de schatting bij. Geen tweede set knoppen naast de bestaande.

### Schermen

- `/keuken/scherm` — wandscherm, 1920 × 1080, vier vaste zones, donker palet uit het
  design-systeem. Realtime via `postgres_changes` met polling elke 30 s. Boven de 90 seconden
  oude data: rode rand, alarmbalk, het oude beeld op 18%. Om 04:00 herladen.
  **Geen enkele knop en geen POST in het bestand** — read-only is hier een bouwregel.
- `/keuken/tablet` — staand, drie knoppen van 150 px, en het onderbroken-vinkje als twee
  vlakken van 170 px in plaats van een vinkje dat je met een knokkel mist.
- `/keuken` blijft de redirect naar `/gerechten`.
- `/e2e-test/keukenscherm?stand=…` — testpagina achter `NEXT_PUBLIC_E2E=1` die elke toestand
  los rendert zonder database. Daar kwamen twee fouten uit die geen enkele test zag: de lege
  dag zei "JE BENT BEZIG" en toonde een GESCHAT-etiket bij een leeg streepje.

### Wat er nog niet in zit

- **Golf 6 en verder**: batchen is geschreven en getest maar wordt nog niet toegepast op de
  echte planning; het gatenvullen draait wel. Schoonmaaktaken hebben een tabel maar nog geen
  invoerscherm en worden nog niet ingepland.
- **Het stappenscherm en de ontleder** (de rest van golf 1). Zonder die twee blijft
  `recipe_steps` bijna leeg en heeft de planner weinig te plannen.
- **Verantwoording op echte data.** De planner is getest op verzonnen dagen, niet op een
  echte productiedag — die bestaat nog niet in de database.

### Twee dingen om over na te denken

**Het wandscherm heeft een sessie nodig.** `/keuken/scherm` draait op de gewone
tenant-auth, dus een scherm dat vierentwintig uur aan staat logt op enig moment uit. De
prep-KDS heeft daar al een oplossing voor (`/api/prep/device-token` en `device-verify`,
met apparaat-token en pincode). Dat moet hierop aangesloten worden voordat het ding echt aan
de muur hangt.

**Verantwoord in de browser.** Alle zes toestanden van het wandscherm plus de twee
tabletschermen zijn bekeken op ware grootte. Verder: 1360 tests groen, `tsc` schoon, lint
schoon op al het nieuwe werk, en de productiebuild slaagt.

**"Loopt uit" vraagt nu hoeveel het echt wordt** in plaats van er zelf een getal bij te
verzinnen. Dat was in de eerste versie anderhalf keer de geplande duur — precies waar dit
systeem tegen is: een systeem dat zijn eigen metingen invult, leert zijn eigen aannames.


---

## 11 · Een recept van iemand anders op eigen spullen

Toegevoegd 8 september 2026, na de vraag: als we een receptuur uit een boek nakopiëren, moet
het systeem hem omgooien naar wat hier staat.

Een kookboek beschrijft geen apparaat maar een **bereidingswijze** — "een BBQ voor indirect
grillen", "op heet vuur". Welk toestel dat wordt, verschilt per bedrijf. Bij Hop & Bites:

| Het boek zegt | Het wordt | Wat er verandert |
| --- | --- | --- |
| indirect · low-and-slow · roken | **Yoder YS1500s pelletgrill** (id 21) | Rookhout vervalt — pellets maken hun eigen rook. Geen toezicht: de ACS-controller houdt zelf temperatuur. |
| direct grillen · hoog vuur · plancha | **Yoder 24×48 houtskoolgrill** (id 1) | Rookhout blijft. Wél toezicht: een houtskoolvuur regelt zichzelf niet. |
| oven · fornuis · combisteamer | *vraag* | Te veel toestellen om te raden. |

Dat staat in `src/lib/keukenplanner/apparaatKeuze.ts` als data, niet als logica: bij een
andere tenant staan er andere apparaten en hoeft er geen regel code om.

Twee dingen die daarbij niet mogen gebeuren. Een stap die op dit toestel geen betekenis
heeft — "voeg de hickory chunks toe aan de gloeiende kolen" op een pelletgrill — gaat **eruit**
en niet als taak van nul minuten erin. En bij twijfel over de bereidingswijze raadt de ontleder
niet maar vraagt hij het: een verkeerd geraden toestel verschuift de hele tijdlijn zonder dat
iemand het merkt.

### Capaciteit is bij een barbecue een oppervlakte-vraag

Twee briskets van 6 kg passen op 60 kg belading ruim, en toch niet naast elkaar. Daarom
`materieel.kookoppervlak_cm2` als derde grens naast aantal en gewicht, en op `components`
een voetafdruk (`oppervlak_cm2_per_stuk` of `_per_kg`).

Wat de fabrikant opgeeft, is nu ingevuld (bbqeurope.com, 8 september 2026):

| | YS1500s | 24×48 houtskool |
| --- | --- | --- |
| Rooster | 9.677 cm² | 7.432 cm² |
| Belading | 60 kg varkensschouder | 40 kg varkensschouder |
| Temperatuur | 65–260 °C | *niet opgegeven — hangt af van brandstof en trek* |
| Gewicht | 303 kg | 200 kg |
| Verder | ACS-controller, FireBoard, wifi, **twee ingebouwde voedingssondes** | verstelbare kooltray (5 posities), 2 rookkanalen |

**Die twee sondes veranderen golf 12.** De thermometer waar `bevestigd_eind` op wacht, hangt
al aan de smoker. Het is geen hardware-aankoop maar een FireBoard-koppeling.

### Wat een productpagina níét kan zeggen — ingevuld door Mathijs

| | YS1500s | 24×48 houtskool |
| --- | --- | --- |
| Opwarmen tot bruikbaar | **60 min** | **20 min** |
| Schoonmaken na een cook | **20 min** | **20 min** |
| Hoe lang warm | *leeg* — aanhouden kost pellets, dus dat is een keuze | *leeg* |

`concurrent_jobs` stond op 1 en dat blokkeerde elke bundeling op een toestel dat achttien
kippen houdt. Nu leeg: plek en gewicht beslissen, niet een vast aantal klussen.

### De voetafdruk: waarom procureur 45 kg is en buikspek 15

Allebei op hetzelfde rooster van 9.677 cm². Het verschil is geen gewicht maar vorm — procureur
is een blok, buikspek ligt plat. Uit die twee getallen volgt de voetafdruk:

| Vorm | Voorbeeld | cm² per kilo | Op de YS1500s |
| --- | --- | --- | --- |
| Blok | procureur, pulled pork | **215** | 45 kg |
| Plat liggend | buikspek, chicken wings | **645** | 15 kg |

Het model reproduceert zijn twee getallen exact, en de 60 kg die de fabrikant opgeeft blijkt
de propvolle variant ("tegen elkaar") — daarom plant de planner op 45 en houdt 60 als plafond.

**Een extra rooster is bijna een tweede smoker voor plat werk.** Buikspek zou dan van 15 naar
25 kg gaan; dat is 6.450 cm² erbij, ruim twee derde meer plek. Nog niet als capaciteit
ingevuld, want het rooster bestaat nog niet — maar het is wel een aankoopbeslissing die het
systeem nu kan onderbouwen.


---

## 12 · Twee soorten deadline, en waarom schoonmaken er één heeft

Toegevoegd 8 september 2026. Tot nu toe kende de planner één soort deadline: de klant staat om
vier uur op de stoep. Maar er is een tweede, en die zat verstopt in de schoonmaak.

De Robot Coupe is acht minuten werk als je hem direct na gebruik doet, en een kwartier
schrobben als de mayonaise is ingedroogd. Schoonmaaktijd is dus geen constante maar een
aflopende zaak.

| Soort | Voorbeeld | Missen betekent |
| --- | --- | --- |
| **Hard** | uitlevering 16:00 | de klant wacht — kan niet |
| **Zacht** | Robot Coupe schoonmaken | het kost je meer tijd — kan wel |

**Een zachte deadline mag een harde nooit wegdrukken.** Wie zijn uitlevering mist omdat de
keukenmachine anders moeilijker schoon te maken was, heeft het verkeerde probleem opgelost.
Daarom wordt de zachte marge nooit negatief: hij telt af tot nul en blijft daar.

Maar hij wéégt wel mee, en dat is waar de winst zit. Het gat direct na het gebruik van een
machine is de goedkoopste plek om hem schoon te maken, en dat verschil is te rekenen:
acht minuten nu tegen twintig straks is geen mening maar een som. `schoonmaak.ts` doet die
som en geeft de reden in mensentaal terug — *"nu doen scheelt 12 min"*.

Drie kolommen op `materieel`: `schoonmaak_min` (vers), `schoonmaak_verval_na_min` (wanneer het
omslaat) en `schoonmaak_koud_min` (wat het dan is). Ontbreken de laatste twee, dan rekent de
planner met de vaste tijd en doet hij niet alsof hij meer weet.

En één regel die er los van staat: schoonmaken gebeurt niet als het apparaat straks alweer
nodig is. Een schone machine die je tien minuten later weer vies maakt is weggegooide tijd.

---

## 13 · Van een bult data naar een strakke briefing

De briefing-motor bestaat al (`today-briefing-rules.ts`): hij scoort signalen en een AI
schrijft er zinnen van. Het risico is niet dat hij te weinig weet maar te veel — en dan wordt
het een opsomming die niemand leest.

**De regel: elke zin in de briefing moet eindigen in iets wat je doet.**

| Dit is data | Dit is een briefing |
| --- | --- |
| "Je hebt 47 open taken" | "Vandaag is een MEP-dag; ik heb tien taken klaargezet. Klik op start." |
| "3 nieuwe leads" | "Drie aanvragen binnen, conceptantwoorden staan klaar op je telefoon." |
| "Bon van Beef Club, € 487,65" | "Beef Club stuurde een factuur van € 487,65. Akkoord? Dan verwerk ik hem." |

Kan een regel geen handeling noemen, dan hoort hij niet in de briefing maar op een hub waar
je hem opzoekt wanneer je hem nodig hebt. Dat is ook de enige eerlijke manier om de briefing
kort te houden: niet "de belangrijkste vijf" — dat is willekeur — maar "alles waar een
handeling aan hangt". Zijn dat er structureel meer dan vijf, dan is er iets anders aan de
hand dan een te volle briefing.

Twee dingen die daarbij vastliggen:

- **De AI schrijft, de code oordeelt.** "Vandaag is een MEP-dag" mag alleen op het scherm als
  code dat heeft vastgesteld uit agenda en openingstijden. Anders verzint hij binnen een maand
  dagsoorten die nergens op slaan, en dan is de briefing net zo dood als een scherm dat
  ernaast zit.
- **De briefing eindigt.** Hij is geen dashboard dat blijft staan maar een moment met een
  knop eronder. Wat je hebt gelezen komt niet terug.


---

## 14 · De estafette — twee ladingen door één smoker

Toegevoegd 8 september 2026, en het begon met een fout van mij. Ik stelde voor om voor twee
klussen in één keer negentig kilo te maken. Dat kan niet: de YS1500s houdt zestig.

Wat wél kan is een estafette. Vlees om 08:00 op de smoker, om 13:00 eraf in een gastronorm
met het deksel erop, verder garen in de steamer. Op dat moment is de smoker vrij en gaat
lading twee erop. Om 20:00 is alles klaar. **Je maakt de smoker niet groter, je haalt er
eerder iets af.**

### Waarom dat mag

Het verhaal dat vlees na drie uur geen rook meer opneemt is een broodje aap. Wat er echt
gebeurt is dat de opname terugloopt zodra het oppervlak droog en warm is — en het deksel
maakt het definitief, want daarna komt er geen rook meer bij. **De rookfase eindigt op een
handeling, niet op de klok.** Alles daarna is warmte, en warmte kan elk toestel leveren dat
de temperatuur haalt.

### Een stap vraagt een kunde, geen apparaat

Dat is de modelwijziging. Niet `materieel_id` op een stap, maar een eis: *"rookt"* of
*"houdt 110 °C"*. Welk apparaat dat wordt kiest de planner — en dan kan hij de flessenhals
ontzien. `materieel.maakt_mogelijk` is precies die lijst en staat al gevuld (smoker, grill,
oven, fornuis, koeling, werkbank, vacuümmachine…).

De regel die alles doet: **ontzie de flessenhals.** Kan iets zowel op de smoker als in de
oven, en loopt de dag vast op de smoker, dan gaat het in de oven. Niet omdat de oven beter
is, maar omdat elk uur dat de smoker vrij is een uur is waarin er een lading bij kan.

`estafette.ts` rekent uit hoeveel rondes er per dag door de flessenhals gaan — en daar zit
nog een winst in die makkelijk over het hoofd wordt gezien: **het opwarmen betaal je één
keer.** Een tweede ronde is daarom relatief goedkoop.

### Wat het vandaag zegt

Er staat geen oven of Rational in `materieel`. Het antwoord is dus eerlijk nul: *"er is geen
apparaat dat de gaarfase kan overnemen."* Dat is geen tekortkoming van het model maar de
opbrengst ervan — het rekent nu uit wat zo'n apparaat waard zou zijn vóórdat je hem koopt.
Op een dag van twaalf uur met vijf uur roken en vijf uur nagaren: één lading zonder, twee
met. Op een korte dag van zeven uur nog scherper: nul zonder, één met.

En het zegt ook wanneer het níét loont. Is de gaarfase maar tien minuten, dan wordt de cyclus
er nauwelijks korter van en levert overnemen niets op.

### Gelijkmatig beladen is kwaliteit, geen netjesheid

Negentig kilo wordt **twee keer vijfenveertig** en niet zestig plus dertig. Een volle en een
halfvolle smoker garen ongelijk, en dan smaakt de ene lading anders dan de andere. Mijn
verdeler vulde greedy tot de grens; dat is nu een verdeling die eerst uitrekent hoeveel
ladingen er minimaal nodig zijn en die dan zo gelijk mogelijk vult, grootste stukken eerst.

Perfect gelijk kan niet altijd: vijftien stukken van zes kilo worden 48 en 42, want een halve
procureur bestaat niet. Hooguit één stuk verschil is het doel.

### De planner kiest nu zelf (versie 11)

`recipe_steps` en `prep_tasks` hebben een `kunde`-veld. De planner werkt in twee ronden, en
die volgorde is niet vrijblijvend:

1. Taken met een **vast toestel** krijgen dat toestel. Soms hoort iets op één machine — de
   Bizerba is de Bizerba.
2. Uit die vaste bezetting volgt **wie de flessenhals is**.
3. Pas dan krijgen de taken met alleen een kunde hun toestel, mét de regel dat de flessenhals
   ontzien wordt. Elke keuze telt meteen mee, zodat niet alles op hetzelfde ding belandt.

Andersom zou de planner de smoker volplannen en daarna ontdekken dat hij hem had moeten
ontzien.

**De flessenhals wordt per dag bepaald**, niet vastgelegd: waar is de vraag het grootst ten
opzichte van wat er op een dag doorheen kan. Op een koude dag is dat de Robot Coupe en staat
de Yoder uit. Boven zeventig procent bezetting heet een dag krap — dan tikt elke uitloop door
naar het eind.

Kan geen enkel toestel de gevraagde kunde, dan zegt de planner dat en doet hij niet alsof.

**De YS1500s kan meer dan roken.** Hij houdt 65 tot 260 °C, dus hij is óók een oven. Dat staat
nu in `maakt_mogelijk` — en daardoor kan de planner vandaag het nagaren nog op de smoker
leggen, met als reden dat er niets anders is. Zodra er een Rational bij komt, verschuift die
keuze vanzelf.

De demo-dag draait er al op: de rookfase vraagt `smoker`, het nagaren vraagt `oven`. Vandaag
komen ze allebei bij de Yoder uit. Dat is precies de situatie die de estafette moet oplossen,
en nu zichtbaar in plaats van verstopt.
