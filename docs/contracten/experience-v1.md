# Contract — Experience-app v1

Tussen **BBQ Architect** (aanroeper) en de **Hop & Bites Experience-app** (ontvanger).
Hoort bij `docs/bestelstroom-bouwplan.md` §3 en §3.1.

De twee JSON-bestanden naast dit document zijn **de gedeelde fixture**. BBQ Architect test
ertegen in `src/lib/boxLabel.test.ts`; de Experience-kant hoort ertegen te testen zodra hij
gebouwd wordt. Loopt de vorm uit elkaar, dan wordt één van de twee rood — dat is het hele
punt van een fixture in plaats van twee keer een voorbeeld in proza.

| | |
| --- | --- |
| `experience-v1-box-type.json` | antwoord op aanroep **A** |
| `experience-v1-box.json` | antwoord op aanroep **B** |

---

## Legitimatie

`Authorization: Bearer <sleutel>`, server-naar-server, altijd.

Aan de kant van BBQ Architect heet de variabele `EXPERIENCE_API_KEY` — **nooit met een
`VITE_`- of `NEXT_PUBLIC_`-voorvoegsel**, want beide bouwers bakken die in de bundel die
elke bezoeker binnenhaalt. Bewaakt door `src/lib/experienceKoppeling.test.ts`.

Aan de ontvangende kant, en dus **nog te bouwen**:

- `EXPERIENCE_API_KEY` en `EXPERIENCE_API_KEY_VORIGE` zijn tegelijk geldig, zodat rouleren
  geen downtime kost.
- Vergelijken in **constante tijd**.
- Geweigerde verzoeken loggen met herkomst, **nooit** met de aangeboden sleutel erin.

---

## A · `GET /api/experience/v1/box-types/:slug`

Wat er in de doos zit. Geen persoonsgegevens, in beide richtingen niet. Cachebaar; BBQ
Architect ververst hooguit eens per tien minuten.

Tijdslimiet **2 seconden**, één poging. Dit blokkeert het bestelformulier, dus het mag
wegvallen: dan toont dat formulier de samenstellingszin niet en werkt het door op de
laatst bekende cache.

Zie `experience-v1-box-type.json`.

Twee velden per onderdeel zijn niet vrijblijvend, want zonder allebei is de zin *"60
stukjes vlees en vis, drie sauzen, twee zuren en twee salades"* niet te rekenen:

- **`soort`** — `proteïne` · `saus` · `zuur` · `salade`. Zonder dit tellen de sauzen mee
  in de zestig.
- **`per`** — `persoon` of `doos`. Twee stuks bavette schaalt met de teller, drie sauzen
  niet.

`personen_per_doos` hoort hier en niet in BBQ Architect: dat getal volgt uit de bakjes
(het grote proteïnebakje is 1000 ml en gaat tot acht personen). Staat het in de andere
app, dan moet die worden aangepast zodra er een borrelbox met andere porties komt.

---

## B · `POST /api/experience/v1/boxes`

Maakt de doos aan. Tijdslimiet **10 seconden**. Dit moet slagen: zonder token geen mail en
geen sticker.

**Heen — dit is de volledige lijst.** Over de grens gaan alleen deze drie velden. Geen
achternaam, geen mailadres, geen telefoonnummer, geen bedrag, en niet de allergienotitie
van de klant: dat is een gezondheidsgegeven en het blijft aan de BBQ Architect-kant.

```json
{ "box_type": "de-eettocht", "voornaam": "Kasper", "personen": 6, "afhaaldatum": "2026-12-22" }
```

Plus de header `Idempotency-Key: bestelling-<nummer>` — stabiel over alle pogingen heen.

**Terug:** zie `experience-v1-box.json`.

### De idempotentieregel

- zelfde sleutel + **zelfde** invoer → `200`, dezelfde doos. Geen fout.
- zelfde sleutel + **andere** invoer → `409`. Nooit stilzwijgend de oude doos teruggeven.

Die tweede regel is het punt: een aanroep die met gewijzigde gegevens de oude doos
terugkrijgt, is een sticker met de verkeerde inhoud.

---

## Foutantwoorden

Altijd een machineleesbare code plus een zin voor een mens. BBQ Architect leidt uit de
**code** af wat te doen en ontleedt nooit een bericht.

```json
{ "fout": "onbekend_doostype", "bericht": "..." }
```

| | |
| --- | --- |
| 401 `geen_toegang` | sleutel ontbreekt of klopt niet |
| 404 `onbekend_doostype` | |
| 400 `ongeldige_invoer` | + welk veld |
| 409 `andere_invoer_zelfde_sleutel` | |
| 422 `doostype_gesloten` | neemt geen bestellingen meer aan |
| 429 `te_veel_verzoeken` | |
| 500 `interne_fout` | |

**Opnieuw proberen:** netwerkfout of 5xx → opnieuw met dezelfde `Idempotency-Key`,
oplopende wachttijd, maximaal drie keer. Elke 4xx → nooit opnieuw binnen hetzelfde
verzoek; `429` mag morgen wel weer via de nachtelijke cron.

---

## Wat er nog niet vaststaat

1. **De vorm van een `stops`-element.** Het contract noemt `stops[]` maar zegt niet wat
   erin zit. De sticker tekent de kronkelweg met de haltes uit dit veld, dus er is
   minstens een naam en een volgorde nodig. In de fixture staat nu `{ "naam": … }`; dat is
   een aanname, geen afspraak.
2. **De namen in de fixture zijn plaatshouders.** De *aantallen* komen uit de briefing
   (vijf gerechten van elk twee stuks per persoon, drie sauzen, twee zuren, twee salades)
   en de *vorm* uit dit contract. De gerechtnamen, de bewaartekst, de allergenen en de
   houdbaarheidsdagen heeft nog niemand geleverd — die staan er als `Gerecht 1` en
   dergelijke, zodat niemand ze voor echt aanziet.
