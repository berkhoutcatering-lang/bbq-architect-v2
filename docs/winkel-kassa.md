# Kassa voor de Hop & Bites-website — myPOS Checkout

**Gebouwd:** 13 september 2026. **Contract:** `OVERDRACHT-BBQ-ARCHITECT-WEBSHOP.md`
(website-repo, 11 september). **Routes:** `src/app/api/public-winkel/[slug]/*`.
**Logica:** `src/lib/winkel/` (rekenen, kassa, opslag) en `src/lib/mypos/` (IPC).

De website stuurt slugs, aantallen, een moment en contactgegevens. BBQ Architect is
de financiële autoriteit: prijs, btw, verzendkosten, reservering en betaalstatus staan
hier. Bedragen uit de browser zijn nooit waarheid; het enige bedrag dat de site
meestuurt is `verwachtTotaalCenten`, om een prijswijziging te ontdekken.

---

## De zes routes

Basis: `{BBQ Architect}/api/public-winkel/hop-en-bites`. Alle antwoorden JSON, fouten
overal in dezelfde vorm: `{ ok: false, soort, fouten? | melding? }`.

| Route | Doet | Bijzonderheden |
| --- | --- | --- |
| `GET momenten` | afhaalmomenten met `vrij` (besteleenheden) | standaard de agenda (planken); `?artikel=kerst-box` geeft de afhaaldagen van de Kerst-Box |
| `POST offerte` | mand herberekenen in hele centen | 400 `validatie` (alle regelfouten tegelijk), 409 `moment-vol` / `moment-verlopen`, 503 `niet-beschikbaar` |
| `POST order` | order aanmaken, plek reserveren (30 min), betaling klaarzetten | idempotent op `sleutel`; 409 `prijs-gewijzigd` met de nieuwe offerte; antwoord `{ token, betaalUrl }` |
| `GET order/{token}` | status op een 256-bit token | alleen de contractvelden; onbekend token 404; `betaalUrl` gevuld zolang opnieuw betalen kan |
| `GET betaal/{token}` | de `betaalUrl`: brug naar myPOS | zet de order (opnieuw) op wacht met verse reservering en post een ondertekend formulier naar de myPOS-betaalpagina |
| `POST mypos-webhook` | `URL_Notify` van myPOS | handtekening met het myPOS-certificaat; idempotent op transactiereferentie; antwoordt `OK` |

De klant keert van myPOS terug via `betaal/{token}/terug?uitkomst=ok|afgebroken`, dat
meteen door stuurt naar `{site}/bestelling/{token}`. Een bezoek daar is géén bewijs
van betaling; de site pollt de status.

## Zo werkt een order

1. **Offerte.** Prijs × aantal per regel, btw per tarief uit de prijs inclusief,
   verzendkosten uit de instellingen (gratis boven de grens). Capaciteit en voorraad
   worden informatief gecontroleerd.
2. **Order.** De database telt onder vergrendeling (`winkel_plaats_order`) of het
   past en schrijft order + regels; een order op `wacht` houdt zijn plek vast tot
   `reservering_tot` (30 minuten, instelbaar).
3. **Betalen.** `betaal/{token}` start een betaalpoging (`OrderID` richting myPOS is
   `HB-2026-0042-1`, `-2` bij opnieuw proberen) en stuurt de klant naar myPOS.
4. **Betaalbericht.** De webhook verifieert, registreert het bericht één keer, en
   roept `winkel_bevestig_betaling` aan: `betaald` → bevestigingsmail; `al_betaald` →
   niets; `vol` (reservering verlopen én de plek is vergeven) → status `mislukt`
   met reden `verlopen-en-vol` en een terugbetaling via `IPCRefund`.
5. **Uitblijvend bericht.** Bij terugkeer met `uitkomst=ok`, en daarna bij elke
   statusvraag (hooguit eens per tien seconden), vraagt de kassa het myPOS zelf via
   `IPCGetTxnStatus`. Betaald is alleen `OrderStatus.IPCmethod = IPCPurchaseNotify`
   met het juiste bedrag — `Status 0` betekent slechts "vraag beantwoord".
6. **Verlopen.** Een order die te lang op `wacht` staat wordt bij de eerstvolgende
   statusvraag `verlopen`; dezelfde `sleutel` mag daarna opnieuw (verse reservering).

Wat myPOS ons leerde tijdens het bouwen:

- `URL_Notify` moet https zijn zonder poortnummer, én moet synchroon `OK` antwoorden —
  anders keurt myPOS de betaling af ("onderbroken verbinding met de winkel").
- Met `PaymentParametersRequired = 1` zijn adres, postcode en plaats verplicht op de
  betaalpagina. Daarom sturen we géén klantgegevens (variant 3): de klant ziet alleen
  de betaalmethode. `PaymentMethod = 3` = kaart én iDEAL.
- Een JSON-antwoord van myPOS is ondertekend over alle waarden, geneste objecten
  platgeslagen (inclusief hún `Signature`), alleen de buitenste `Signature` erbuiten.

## Kerst-Box

- € 23,50 p.p., minimaal 2, **geen maximum**. Personen worden verdeeld over dozen:
  tot en met `doos_klein_max` één kleine doos, daarboven grote dozen van `doos_groot`
  (5) en de rest in een kleine als het past (4 → één grote; 7 → grote + kleine;
  9 → twee grote). Capaciteit per dag telt in dozen.
- De klant kiest een **dag** (23 of 24 december), geen tijdvak. De site haalt de dagen
  op met `GET momenten?artikel=kerst-box` en stuurt het dag-id mee als `moment` op de
  regel. Zonder dag: `validatie` "Kies een afhaaldag voor Kerst-Box (23 december of
  24 december)." Het regelveld `afhaalmoment` wordt dan "Afhalen op 23 december"; de
  bevestigingsmail zegt "Het tijdvak laten we je nog weten." zolang de dag geen tijd heeft.
- `kerst-box-vegetarisch`: zelfde prijs, `publiek = false`, deelt de dagen én de
  capaciteit van de Kerst-Box (`moment_groep = 'kerst-box'`).

## Instellen (nog zonder scherm)

De tabellen `winkel_instellingen`, `winkel_artikelen` en `winkel_momenten` hebben nog
geen beheerscherm. Wat Mathijs nu zet, gaat via de Supabase-tabel-editor:

| Wat | Waar |
| --- | --- |
| Prijs van een artikel, actief zetten, voorraad | `winkel_artikelen.prijs_cents` / `actief` / `voorraad` (leeg = onbeperkt) |
| Verzendtarief en gratis-grens | `winkel_instellingen.verzendkosten_cents` (leeg = verzenden uit), `gratis_verzenden_vanaf_cents` |
| Afhaalmomenten voor planken | `winkel_momenten` met `groep = 'agenda'`, datum, van/tot, `capaciteit` (planken) |
| Afhaaldagen en capaciteit Kerst-Box | `winkel_momenten` met `groep = 'kerst-box'`, `capaciteit` in dozen |
| Grens van de kleine doos | `winkel_artikelen.doos_klein_max` (nu 3, te bevestigen) |
| Reserveringsduur | `winkel_instellingen.reservering_minuten` (30) |
| Kassa dicht | `winkel_instellingen.kassa_open = false` |

`node scripts/winkel-seed-hop-en-bites.mjs` zet de catalogus opnieuw (idempotent;
ingevulde prijzen blijven staan).

## Testen

- `npm test` — 65 tests voor rekenen, myPOS-handtekeningen (ook op twee echte
  antwoorden van de testomgeving) en het hele contract tegen een geheugen-opslag.
- Testomgeving: `MYPOS_TEST_MODE=1` in `.env.local` en een https-webhook (zie
  `WINKEL_WEBHOOK_URL` in `.env.example`). Testkaart: `4006 0900 0000 0007`, 12/30,
  willekeurige CVC.
- Productie: `node scripts/mypos-config-naar-env.mjs` na het plaatsen van
  `.mypos/config.b64`; dezelfde vijf `MYPOS_`-waarden in Vercel. `MYPOS_TEST_MODE` leeg.
