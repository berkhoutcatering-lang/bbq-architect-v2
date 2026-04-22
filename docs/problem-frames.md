# Problem Frames — BBQ Architect v2

**Datum:** 2026-04-21
**Doel:** De 17+ opportunities uit `competitor-benchmark.md` omzetten naar 12 scherpe probleem-definities met JTBD, stakeholders, user-scenarios, constraints, success-criteria en metingsplan, zodat elke frame los oppakbaar is in de roadmap.

---

## Meta-frame

### Het grotere probleem

> **Hoe maken we van BBQ Architect v2 — een feature-rijk persoonlijk ops-systeem voor Berkhout Catering — een verkoopbaar SaaS-product voor 50 Nederlandse BBQ-caterers binnen 12 maanden, zonder de diepte te verliezen en zonder dat de techniek onder 50 klanten bezwijkt?**

### Context

- **Uitgangspunt:** Product is al gebouwd en intensief in gebruik door één tenant (Berkhout Catering). Feature-oppervlak is 90% competitief (benchmark-scorematrix: doel 4,56 vs best competitor 3,05).
- **Kritieke zwakte:** Multi-tenancy werkt nog niet veilig (RLS-policies staan `USING (true)`). Zonder fix kunnen we geen 2e klant hebben.
- **Secundaire zwakte:** Mobile/field-UX scoort 2/5 terwijl de Pro-tier (HACCP, uren, logistiek) juist op de werkvloer moet draaien.
- **Commerciële realiteit:** Sam runt dit solo naast Berkhout Catering. Elke frame moet realiseerbaar zijn met ~10–20 ontwikkeluren/week plus Claude-assistentie.

### Stakeholders (meta)

| Rol | Wie | Belang |
|---|---|---|
| Founder / enige developer | Sam Berkhout | Bouwt, verkoopt, supportet; tijd is schaarste |
| Eerste klant (test-tenant) | Berkhout Catering | Eet eigen hondenvoer, testcase voor features |
| Horizon-1 klanten | 10–50 NL-BBQ-caterers (€49–€99) | Zoeken Excel-opvolger, prijsgevoelig, niet tech-savvy |
| Horizon-2 klanten | 50–200 full-service caterers (€99–€249) | Complexere ops, mogelijk out-growth naar Starter |
| Leveranciers | Supabase, Anthropic, Moneybird, Mollie, Resend | Kosten = AI-tokens + DB + domein + email |
| Compliance | NVWA (HACCP), AP (AVG), Peppol-netwerk (e-facturatie 2028) | Juridische verplichtingen |

### Constraints

- **Tijd:** Sam heeft naast Berkhout Catering ~10–20 uur/week. Grote features moeten in 1–2 weken opleveren, anders stallen ze.
- **Budget:** AI-kosten moeten passen binnen tier-opbrengst (zie `product-strategy.md` voor caps).
- **Tech-schuld:** RLS-audit staat open. Geen commerciële lancering zonder fix.
- **Taal/markt:** Alle UX Nederlandstalig, NL-conventies (BTW, iDEAL, Moneybird, NVWA).
- **Geen team:** Geen support- of sales-team. Onboarding moet self-service zijn.

### Success criteria (meta)

| # | Criterium | Meetbaar doel | Termijn |
|---|---|---|---|
| M1 | Betalende externe klanten | 10 | 6 mnd |
| M2 | MRR | €5.000 | 12 mnd |
| M3 | Onboarding-tijd sign-up → 1e offerte | Mediaan < 60 min | Altijd |
| M4 | NPS (3-mnds cohort) | ≥ 40 | Vanaf mnd 6 |
| M5 | Maandelijkse churn | < 5% | Vanaf mnd 3 |
| M6 | Tech-incidents | 0 RLS-lek, uptime ≥ 99,5% | Altijd |
| M7 | AI-cost / tier-opbrengst | < 25% | Altijd |

---

## SF-1 — AI offerte-wizard: van ruwe aanvraag naar verstuurbare offerte in < 3 minuten

### Jobs-to-be-done
> "Wanneer een klant mij via WhatsApp vraagt om een BBQ voor 30 man op zaterdag, wil ik binnen 5 minuten een professionele offerte sturen, zodat ik niet laat binnen druk in mijn weekend hoef te blijven werken."

### Probleem
Caterers krijgen aanvragen via WhatsApp, email of telefoon. Tekst omzetten naar gestructureerde offerte (klant, datum, gasten, menu, prijs) kost 30–60 min in Excel. Wizard moet dit tot <3 min brengen.

### Huidige staat
✅ Gebouwd (`/api/parse-document`, `/offerte-editor`). Sam gebruikt hem wekelijks met succes.

### User-scenario

> **Marieke, solo-catering, donderdagavond 21:30:**
> Marieke krijgt een WhatsApp van Tante Els: *"Hoi Marieke, zaterdag 14 juni BBQ voor 35 volwassenen + 8 kinderen, adres Zwolleweg 12 Assen, budget ca €1.500, geen varken (religieus), wel een paar vegetariërs. Kan jij nog?"*
>
> Marieke opent BBQ Architect, klikt "Nieuwe offerte via wizard", plakt de WhatsApp-tekst. Wizard herkent datum, gasten, adres, budget, diëten. Stelt menu voor: kip-satay, lam-brochette, 3 salades, halloumi voor vega, 2 kinderburgers per kind. Prijs: €1.425 incl BTW. Marieke past portie kip omhoog (5% marge-verbetering), stuurt offerte met 1 klik + iDEAL-aanbetaling-link.
>
> **Totaal: 2 min 40 sec. Marieke gaat om 21:33 naar bed.**

### Stakeholders
- **Primair:** Caterier die offerte opstelt
- **Secundair:** Eindklant (ontvangt offerte — moet professioneel ogen)
- **Intern:** AI-budget (wizard = 1 AI-actie uit tier-cap)

### Constraints
- Geen WhatsApp-API (copy-paste-flow). OK.
- Claude-tokens: 1 wizard-run = €0,02–€0,08 afhankelijk van complexiteit.
- Output moet altijd geldig JSON zijn (offerte-schema).
- Nederlands is primair; Engels als fallback voor internationale klanten (weekendgasten, bedrijven).

### Success criteria
| Metric | Doel | Meting |
|---|---|---|
| Mediane tijd wizard-start → verzonden | < 3 min | Timestamp-trail in DB |
| Verzend-ratio (geen verlaten concepten) | ≥ 80% | Funnel-query |
| Klantnaam/datum/gasten accuracy | ≥ 95% | Steekproef 50 runs/mnd |
| AI-cost per run | ≤ €0,08 | Anthropic-usage-log |

### Metings-instrumentatie
- Event `wizard_started` bij button-klik
- Event `wizard_parsed` met `confidence_score`, `duration_ms`, `tokens_used`
- Event `wizard_sent` bij verzenden + `time_from_start_ms`
- Event `wizard_abandoned` bij 10 min+ inactiviteit
- Dashboard: weekly `conversion_rate`, `median_time`, `accuracy_score`

### Edge-cases en risico's
- Aanvragen zonder datum ("binnenkort") → fallback naar default + UI-flag
- Dieetbeperkingen in informele taal ("m'n zus eet geen vis") → NLU-tolerantie
- Meertalige aanvragen (Engels/Nederlands mix) → auto-detect en dual-pass
- AI-hallucinaties ("35 gasten" → "350") → guardrail met plausibility-check

### Status & dependencies
✅ **Werkend. Dit is onze sterkste onderscheidende feature — alleen polijsten, niet uitbreiden.**
Dependencies: geen.

---

## SF-2 — Menu engineering: BCG-matrix + margevergelijking die caterers begrijpen

### Jobs-to-be-done
> "Wanneer ik m'n prijzen ga herzien voor komende seizoen, wil ik weten welke gerechten ster/paard/hond zijn, zodat ik de juiste schuifjes kan bijstellen zonder te gokken."

### Probleem
Caterers prijzen producten op gevoel. Ze weten niet welk gerecht marge opeet vs welke veel wordt besteld. Menu engineering (BCG-matrix: star/workhorse/puzzle/dog) is restauranttechniek, in catering zelden toegepast door versnipperde data.

### Huidige staat
✅ Gebouwd (`/menu-engineering`). Matrix + grafieken werken. Deel van Pro-tier.

### User-scenario

> **Jeroen, full-service cater, januari, quiet seizoen:**
> Jeroen opent Menu Engineering en ziet dat "Asado beef-rib" een paard is (hoge verkoop, lage marge) en "Vegan bowl" een puzzel (lage verkoop, hoge marge). Hij besluit:
> 1. Beef-rib 5% verhogen (paarden verdragen prijsverhoging)
> 2. Vegan bowl prominenter tonen in offerte-templates (puzzels willen volume)
> 3. "Kroketjes" (hond: lage verkoop, lage marge) schrappen uit standaard-menu
>
> Drie beslissingen die hem in Excel 4 uur hadden gekost, nu 15 min.

### Stakeholders
- **Primair:** Caterier-eigenaar (prijsbeslissingen)
- **Secundair:** Sous-chef (menu-samenstelling)
- **Tertiair:** Marketing (welke gerechten in social-posts?)

### Constraints
- Analytics vergt ≥ 20 events historiek. Nieuwe klanten zien leeg scherm.
- Desktop-feature — matrix niet usable op telefoon, OK (context = kantoor).
- Ingrediëntkostprijs moet up-to-date (link met inkoop-module).

### Success criteria
| Metric | Doel | Meting |
|---|---|---|
| Pro-klanten opent menu-eng ≥ 1x/mnd | ≥ 50% | Analytics |
| Klanten 3+ mnd actief: marge-verbetering | +5 pp (zelf-gerapporteerd) | Jaarlijkse survey |
| Empty-state (<20 events) geeft bruikbare suggestie | — | UX-review |

### Metings-instrumentatie
- Event `menu_eng_viewed` met `events_in_sample` count
- Event `menu_eng_action_taken` (prijs verhoogd, gerecht verwijderd)
- Dashboard: adoption rate per tier + action-rate

### Edge-cases en risico's
- Nieuwe klant met < 20 events → empty-state met branche-benchmark (anoniem-aggregated)
- Ingrediëntprijzen niet bijgehouden → matrix is misleidend → auto-warning
- Seizoensvariatie (BBQ-piek juli-augustus) → aparte zomer/winter-analyse

### Status & dependencies
✅ **Werkend.** Empty-state voor nieuwe klanten verdient betere UX.
Dependencies: inkoop-module voor ingrediëntkostprijs.

---

## SF-3 — HACCP op tablet in de keuken: handschoen-vriendelijk, 44px+

### Jobs-to-be-done
> "Wanneer ik in de keuken een kip uit de koeling haal en de kerntemperatuur meet, wil ik dat met één tap vastleggen terwijl mijn andere hand nat is en m'n telefoon op de plank ligt, zodat ik niet later moet reconstrueren wat ik wanneer heb gedaan."

### Probleem
HACCP is juridisch verplicht (NVWA-verordening EU 852/2004). Vaak op papier bijgehouden of achteraf gedigitaliseerd. Onze HACCP-module scoort **94% touch-target-violations op 320px** — onbruikbaar voor natte/handschoen-hand op gemonteerde tablet. Nu is het een desktop-afvink-taak in plaats van real-time keukenlog.

### User-scenario

> **Bas, sous-chef, vrijdag 15:30, keuken Berkhout:**
> Voorbereiding voor morgen-event. Bas haalt kippenborst uit koeling. Opent BBQ Architect-tablet (gemonteerd bij werkblad). Tapt grote 64px "+ Temp" knop. Kiest "Kip" uit presets. Tapt "+/-" steppers tot hij op 4,2°C staat. Tapt "Opslaan". Klaar in 8 sec. Handschoenen uit, door met werk.
>
> **Zonder field-mode:** Bas had naar z'n telefoon moeten grijpen, inloggen, door menu scrollen, tekstveld typen, vertrouwen dat decimaal-punt juist is, enter. 60+ sec. Of — realistischer — "doe ik straks wel" → papier → nooit gedigitaliseerd.

### Stakeholders
- **Primair:** Chef/kok (temperaturen, allergenen, bereidingslogs)
- **Secundair:** Eigenaar (NVWA-audit tonen)
- **Tertiair:** NVWA-inspecteur (compliance-oog)

### Constraints
- Keukencontext: tablet, 1 hand vrij, handschoenen of nat. Moet met duim werken.
- Offline-moment tijdens piek (slechte wifi). Lokaal bufferen + sync-on-reconnect.
- Data-integriteit: gewijzigde logs moeten audit-trail hebben (NVWA-vereiste).
- Tablet-viewports: 768px × 1024px (iPad) en 800px × 1280px (Samsung Tab).

### Success criteria
| Metric | Doel | Meting |
|---|---|---|
| Touch-targets ≥ 44px op HACCP-pagina | 100% | Auto-audit-script |
| Temperatuur loggen taps vanaf home | ≤ 3 | UX-test |
| 0% tekst-input nodig voor temperatuur | Presets + steppers only | Design-review |
| Klanten 100% digitaal (geen papier-schaduw) | 90% na 6 mnd | Survey |
| Offline-queue sync-success | ≥ 99% | Error-log |

### Metings-instrumentatie
- Event `haccp_log_created` met `device_type`, `viewport`, `duration_ms`
- Event `haccp_log_failed` met error-reden
- Dashboard: logs/dag per klant, avg-duration, papier-ratio (survey)

### Edge-cases en risico's
- Tablet offline middenin sessie → local IndexedDB queue
- Meerdere koks tegelijk op dezelfde tablet → user-switch binnen 2 taps
- Audit-wijziging vs nieuw log: altijd nieuwe rij, soft-delete + edit-reason
- Allergen-flagging op recept-niveau: preset-library per klant

### Status & dependencies
⚠️ **UX-gat.** Vereist field-mode-redesign.
Dependencies: geen. Parallel uit te voeren met SF-4.

---

## SF-4 — Event-day field view: telefoon-first, uren + check-in + logistiek in één scherm

### Jobs-to-be-done
> "Wanneer ik om 06:00 bij de Berkhout-vestiging ben om bus in te laden, wil ik met één hand in 2 taps zien wat erin moet en mijn start-uur loggen, terwijl ik koffie vasthoud en m'n collega's ondertussen bel."

### Probleem
Op event-dag gebruikt veldteam telefoons (1 hand, vluchtig, buiten, soms 4G). Nu moeten ze door dezelfde desktop-UI scrollen. Uren loggen, materieel-checklist, locatie bekijken — 5+ taps, stuurt frustratie terug naar kantoor.

### User-scenario

> **Patrick, chauffeur, zaterdag 06:15:**
> Patrick komt aan bij Berkhout. Opent BBQ Architect-telefoon. Bottom-nav toont: "Vandaag", "Klok", "Checklist", "Maps", "Meer". Tapt "Klok" → grote 80px "Start 06:15" knop. Klaar.
>
> Tapt "Checklist" → 10 items voor vandaag's BBQ: "2× gasfles", "1× grill", "2× tafels", enz. Tapt per item 56px checkbox tot alles groen. 45 sec. Rijdt naar locatie.
>
> Om 11:30 op locatie → tapt "Check-in" (bottom-nav "Vandaag" → "Aangekomen"). Kantoor ziet live dat Patrick er is. Patrick tapt "Keuken start". Begint met koken.

### Stakeholders
- **Primair:** Event-crew (kok, bediening, chauffeur)
- **Secundair:** Event-leider (overzicht houden)
- **Tertiair:** Kantoor (live zien wat er gebeurt)

### Constraints
- Telefoon-viewport: 320–420px, 1 hand, duim-zone.
- Mogelijk beperkte connectie: optimistic UI + sync-on-reconnect.
- Rollen hebben verschillende views (chauffeur ≠ kok ≠ bediening).
- Dark mode voor ochtend-vroeg en avond-laat.

### Success criteria
| Metric | Doel | Meting |
|---|---|---|
| Uren loggen in context ≤ 2 taps | 100% | UX-test |
| Materieel-checklist 48px+ checkboxes | 100% | Auto-audit |
| Sync veld ↔ kantoor | < 3 sec | Latency-log |
| Bottom-nav 5 hoofdbestemmingen | — | Design-review |
| Crew-uren gelogd op dezelfde dag | ≥ 90% | Timestamp-query |

### Metings-instrumentatie
- Event `shift_started` met GPS-coord (optional), `device_type`
- Event `checklist_completed` met `duration`, `item_count`
- Event `location_checkin` met `event_id`, `arrival_delta` (on-time/laat)
- Dashboard: % same-day uren, % complete checklists, avg-sync-latency

### Edge-cases en risico's
- GPS uit → fallback op manual-check-in met foto
- Telefoon battery dood → web-app moet snel herstarten zonder verlies
- Crew van andere org (freelance-inhuur) → tijdelijke tenant-access
- Verkeerde event-datum → "Vandaag" filter + handmatige override

### Status & dependencies
⚠️ **UX-gat.** Grootste mobile-gap in de app.
Dependencies: responsive redesign (4-breakpoint uit UX-audit) voor consistentie.

---

## SF-5 — Financiële integraties: Moneybird-sync, iDEAL-aanbetaling, e-facturatie

### Jobs-to-be-done
> "Wanneer ik einde maand m'n facturen verstuur, wil ik één klik in BBQ Architect zien worden in Moneybird zonder dat ik ooit dubbel hoef te tikken, en aanbetalingen via iDEAL zijn automatisch gematched met de offerte."

### Probleem
NL-caterers boeken in Moneybird of Exact. Dubbele invoer (offerte → factuur in Moneybird) is conversie-blokker. iDEAL via Mollie is standaard voor NL-events, ontbreekt nu. E-facturatie (UBL/Peppol) verplicht vanaf 2028 B2B.

### User-scenario

> **Lars, eigenaar, eind-maand:**
> Lars opent Facturen-tab. Ziet 12 events "gereed voor facturering". Selecteert alle 12. Klik "Factureren naar Moneybird". Progress-bar: 12/12 synced. Opent Moneybird → 12 concept-facturen klaar, BTW correct, klantgegevens correct, referentie naar offerte gekoppeld. Lars checkt visueel, klikt "Verzenden" in Moneybird. Klaar in 3 min.
>
> **Zonder sync:** Lars had in Moneybird 12× klant opnieuw geselecteerd, bedragen overgetypt, BTW-regel handmatig, referentie-nr onthouden. 90+ min, 2 typfouten.

### Stakeholders
- **Primair:** Eigenaar + boekhouder
- **Secundair:** Eindklant (iDEAL-betalings-ervaring)

### Constraints
- Moneybird API rate-limit: 150 calls/min per tenant.
- Mollie iDEAL: vraagt KVK + bankrekening-verificatie, onboarding-overhead.
- E-facturatie (Peppol/UBL) vanaf 2028 verplicht — nu voorbereiden.
- AVG: klantgegevens bij Moneybird = sub-processor, moet in DPA.

### Success criteria
| Metric | Doel | Meting |
|---|---|---|
| 1-klik factuur-Moneybird-sync | ≥ 95% succes | Error-log |
| iDEAL-aanbetaling flow < 30 sec | — | Mollie-analytics |
| Geen dubbele invoer MB ↔ BBQ Arch | 0% | Survey + workflow-audit |
| Peppol-ready vóór 2027-06 | — | Milestone-check |

### Metings-instrumentatie
- Event `invoice_synced_to_mb` met `success/fail`, `error_code`
- Event `ideal_payment_started`, `_completed`, `_abandoned`
- Dashboard: sync-success-rate, iDEAL-conversie, gemiddelde aanbetaling

### Edge-cases en risico's
- Moneybird-OAuth-token expired → re-authenticatie-flow
- Klant in MB al bestaat onder andere naam → dedup-logic
- iDEAL-bank down → fallback naar SEPA-overboeking
- BTW-verlegd (EU-export) → auto-detectie o.b.v. klant-land

### Status & dependencies
- Moneybird-sync: **deels gebouwd** (Pro-tier feature).
- iDEAL/Mollie: **scaffolded**, niet gelanceerd.
- E-facturatie: **niet begonnen**, plan H3.
Dependencies: OAuth-app-registratie in Moneybird-marketplace, Mollie-account per tenant.

---

## SF-6 — Onboarding in < 60 minuten: van sign-up tot verstuurde offerte

### Jobs-to-be-done
> "Wanneer ik besluit BBQ Architect uit te proberen, wil ik binnen een uur m'n eerste echte offerte verstuurd hebben naar een echte klant, zodat ik weet of deze tool mijn leven echt vereenvoudigt."

### Probleem
NL-caterier die Excel wil achterlaten moet in eerste uur waarde zien, anders terug naar sheet. Nu is er signup-flow maar geen gestructureerde eerste-uur-reis met milestones en celebration-momenten.

### User-scenario

> **Rianne, solo-cater, zondagmiddag, trial-sign-up:**
> Rianne signupt op zondagmiddag om 15:00 na een Instagram-post van Berkhout. Flow:
>
> - 15:00 — Sign-up (email, bedrijfsnaam, KVK) — 2 min
> - 15:02 — Welcome-screen, "Laten we samen je 1e offerte maken." Klik start.
> - 15:05 — Milestone 1: 1 klant toevoegen (via contact-import of handmatig) — 3 min
> - 15:10 — Milestone 2: 3 gerechten toevoegen (uit preset-library of eigen) — 5 min
> - 15:20 — Milestone 3: 1e wizard-run met echte WhatsApp-tekst die ze net ontving — 8 min
> - 15:35 — Milestone 4: Offerte-PDF bekijken, naam-branding aanpassen — 10 min
> - 15:50 — Milestone 5: Offerte verzenden naar echte klant. Celebration-confetti.
> - 15:52 — Rianne appt haar partner: "Wow, in een uur een offerte, m'n sheet is 10 jaar oud."

### Stakeholders
- **Primair:** Nieuwe caterier-user (niet tech-savvy)
- **Secundair:** Sam (elke extra support-call = tijd verloren)

### Constraints
- Self-service — geen persoonlijke onboarding per klant.
- 2-maanden trial: week 1 mag "leeg" aanvoelen als maand 1 productief is.
- Alles NL.
- Optioneel aan te zetten (gevorderde gebruikers mogen skippen).

### Success criteria
| Metric | Doel | Meting |
|---|---|---|
| Sign-ups met 1e offerte binnen 60 min | ≥ 50% | Funnel-query |
| Time-to-first-value (1e offerte verzonden) | Mediaan < 30 min | Timestamp-trail |
| 7-daagse retentie (3 klanten + 3 gerechten + 1 event) | ≥ 60% | DB-query |
| Trial → paid conversion na 60 dagen | ≥ 25% | Billing-data |

### Metings-instrumentatie
- Event `signup_completed`, `milestone_1_done`, ... `milestone_5_done`
- Event `onboarding_skipped`, `onboarding_abandoned_at_step_X`
- Dashboard: funnel-conversie per stap, median-time per milestone
- Instrumentatie via `src/lib/activation.ts` (reeds gescaffold)

### Edge-cases en risico's
- User skipt onboarding → checklist blijft beschikbaar op dashboard
- Step 3 (wizard) faalt op onzin-input → fallback naar handmatige offerte
- Celebration-moments te kinderachtig voor B2B → subtiele, professionele animaties
- Gebruiker heeft al bestaande klanten-database → CSV-import als shortcut

### Status & dependencies (update 2026-04-21)
- ✅ Route `/onboarding` met 5-stappen-flow gebouwd (bedrijf → data → offerte → tour → integraties)
- ✅ `src/lib/activation.ts` + `public.activation_events` tabel met RLS operationeel
- ✅ Events `company_profile_saved`, `demo_data_loaded`, `first_quote_draft`, `module_tour_completed` worden gefired vanuit onboarding-UI
- ❌ **Wiring-gap 1:** `signup_completed` event wordt niet gefired na registratie (zie `src/app/signup/page.tsx`)
- ❌ **Wiring-gap 2:** `first_quote_sent` event wordt niet gefired bij verzenden offerte
- ❌ **Wiring-gap 3:** `BedrijfStep` persist niet naar `organizations` tabel (UI-state gaat verloren)
- ❌ **Wiring-gap 4:** `DataStep` "demo-data laden" is stub — geen echte demo-inserts
- ❌ **Wiring-gap 5:** `onboarding_completed` event niet gefired aan einde flow
- ❌ **Gap 6:** Geen funnel-dashboard om conversie per milestone te meten
Details + SQL + snippets in `execution-playbook.md §B, §C, §D`.
Dependencies: SF-1 (wizard) ✅ klaar.

---

## SF-7 — Multi-tenancy RLS: veilige scheiding tussen organisaties

### Jobs-to-be-done
> "Wanneer ik mijn klanten hun data toevertrouw, wil ik 100% zeker weten dat geen andere caterier — laat staan een concurrent — ook maar één rij van mijn data kan zien, zodat ik AVG-proof én concurrerend kan blijven."

### Probleem
Huidige Supabase RLS-policies staan op `USING (true)` voor meeste tabellen. Élke ingelogde user kan élke andere tenant's data lezen. Voor 1 tenant (Berkhout) niet zichtbaar; zodra 2e klant erbij komt is dit **datalek + AVG-overtreding**.

### User-scenario (negatief)

> **Stel: we lanceren zonder fix.**
> Klant A (Lars' Catering, Utrecht) en Klant B (Bas' BBQ, Assen) zitten beiden op productie. Lars logt in, vraagt via API een klanten-lijst. Krijgt zijn én Bas' klanten. Bas' klanten zijn óók Utrechtse restaurants. Lars kan ze benaderen. **Einde BBQ Architect-merkvertrouwen.**

### User-scenario (positief, na fix)

> Lars probeert bewust via REST-call `GET /rest/v1/clients` (met zijn JWT). Krijgt alleen zijn eigen klanten terug. Penetratie-test door externe partij bevestigt: geen cross-tenant-data-leak. Security-page in product toont: "Elke organisatie is RLS-geïsoleerd. Externe audit juni 2026."

### Stakeholders
- **Primair:** Toekomstige klanten (data-veiligheid)
- **Secundair:** AP (Autoriteit Persoonsgegevens — AVG-handhaver)
- **Blokkerend:** Sam (kan niet verkopen zonder)

### Constraints
- Policies moeten per tabel `organization_id`-filter forceren.
- Migration-volgorde: audit → per tabel policy herschrijven → testen met 2e dummy-tenant.
- Geen downtime voor Berkhout.
- Realtime (Supabase) channels moeten ook RLS respecteren — niet alleen REST.

### Success criteria
| Metric | Doel | Meting |
|---|---|---|
| Alle CRUD-tabellen org-RLS-policy | 100% | Supabase-audit-script |
| Automated test: tenant-B leest 0 rijen tenant-A | Pass | Playwright-integratie-test |
| Externe penetratie-test passed | Ja | Rapport |
| RLS-incidents productie | 0 | Monitoring |

### Metings-instrumentatie
- Automated daily test: dummy-tenant-A queries alle tabellen met tenant-B-JWT → expect 0 rows
- Alert bij `organization_id` mismatch in server-logs
- Dashboard: audit-status per tabel (red/green)

### Edge-cases en risico's
- **Service-role key in client-code** → scan codebase vooraf (jetzt geen incident gezien)
- **Realtime subscriptions** lekken tenant-data → aparte RLS-policy op `realtime.messages`
- **Storage-buckets** (foto-archief) zonder RLS → per bucket policy zetten
- **Migration-safe rollout**: feature-flag per tabel i.p.v. big-bang

### Status & dependencies
🟡 **Voor ~80% klaar — niet langer kritieke blokker, wel polish.** Audit 2026-04-21: RLS staat aan op alle public-tabellen, `user_org_ids()` PostgreSQL-helper bestaat, en alle CRUD-tabellen (events, offertes, facturen, klanten, recepten, gerechten, haccp_records, materieel, inventory, enz.) hebben expliciete `org_select/insert/update/delete` policies met `organization_id IN (SELECT user_org_ids())` filter.
Dependencies: geen. **Restant per-tabel + bucket-listing is gedetailleerd in `execution-playbook.md §A`.**

### Acceptatie-checklist (actuele stand)
- [x] Alle tabellen in `public` schema hebben RLS enabled (Supabase-advisor bevestigd)
- [x] Alle **data**-CRUD-policies filteren op `organization_id` via `user_org_ids()`
- [x] `public_quote_view` policy op `offertes` voor klant-portal (anon met token)
- [ ] **Restant 1:** 12 tabellen met RLS-aan-maar-geen-policies (activity_log, changelog_*, error_logs, help_*, onboarding_events, pdf_templates, portal_berichten, pos_cash_sessions, support_tickets) → policies schrijven of bewust service-role-only markeren
- [ ] **Restant 2:** 5 storage-buckets (`bonnen`, `brand-assets`, `gerechten-fotos`, `photos`, `website-images`) laten listing toe voor anon → listing-policy intrekken, alleen object-GET toestaan
- [ ] **Restant 3:** 2 POS-tabellen (`pos_order_items`, `pos_order_item_modifiers`) hebben `WITH CHECK (true)` voor anon INSERT → constrainen tot `source='online'` match met parent-order
- [ ] **Restant 4:** Auth leaked-password-protection uit → aanzetten in Supabase dashboard
- [ ] **Restant 5:** 2 functies met mutable search_path (`pos_estimate_wait_time`, `pos_deduct_inventory`) → `SET search_path = public, pg_temp` toevoegen
- [ ] Realtime-channels RLS-compliant (SELECT-policy volstaat, te verifiëren met 2e-tenant-test)
- [ ] Service-role key alleen in server-side routes (te verifiëren met codebase-scan)
- [ ] Tweede dummy-tenant-test in Playwright CI
- [ ] Externe pen-test vóór commerciële launch

---

## SF-8 — Commercie: van solo-product naar SaaS met eerste 10 betalende klanten

### Jobs-to-be-done
> "Wanneer ik op LinkedIn zie dat een collega-caterier BBQ Architect gebruikt, wil ik binnen 5 minuten snappen wat het kost, of het bij mij past, en een trial starten zonder credit-card."

### Probleem
Product is er, we verkopen niets. Geen landingspagina, geen prijspagina in prod, geen lead-gen, geen eerste klanten. Elke uitgestelde dag = concurrent die inhaalt.

### User-scenario

> **Miranda, actieve cater, donderdag 20:00:**
> Ziet Instagram-reel van Berkhout over hun offerteflow. Klik link-in-bio → BBQ Architect landingspagina. 30 sec demo-video, 3 testimonials, prijs helder zichtbaar. Klik "Start gratis trial". Sign-up (email + bedrijfsnaam). Is binnen 15 min door onboarding-flow (SF-6). 2 weken later: eerste echte offerte verstuurd, 3 events in agenda, HACCP-logs lopen. Dag 45: upgrade-prompt. Dag 52: betaalt Pro €99.

### Stakeholders
- **Primair:** Sam (verkoper)
- **Primair:** Eerste 10 betalende klanten
- **Secundair:** Berkhout Catering (referentie-case)

### Constraints
- Geen sales-budget — organic + community.
- Geen dedicated PM, support, CS.
- Moeten RLS eerst fixen (SF-7).
- Sam's tijd: 5 uur/week naast bouw + support.

### Success criteria
| Metric | Doel | Termijn |
|---|---|---|
| Pricing + landingspagina live | — | H1 week 4 |
| Sign-up + billing werkt | — | H1 week 5 |
| Eerste externe klant | 1 | H1 week 8 |
| 10 betalende klanten | 10 | 6 mnd |
| 50 klanten | 50 | 12 mnd |
| MRR | €5.000 | 12 mnd |

### Metings-instrumentatie
- Event `landing_page_viewed`, `signup_clicked`
- Event `trial_started`, `payment_method_added`, `first_invoice_paid`
- Dashboard: CAC (spend / sign-ups), activation-rate, trial→paid

### Edge-cases en risico's
- Zonder SF-3/SF-4: negatieve NPS bij Pro-tier → mobile-fix H1 blokkerend
- Zonder SF-5 (Moneybird): boekhoud-serieuze caterers vallen af
- **Scheve cohort:** alleen Sam's netwerk → probeer 3 buiten-netwerk kanalen

### Status & dependencies
- `/pricing` en `/welkom` gescaffold (niet gelanceerd)
- **Afhankelijk van SF-7** (geen commerciële launch zonder veilige multi-tenancy)
- **Afhankelijk van SF-6** (onboarding moet werken)

---

## SF-9 — Email-deliverability: offertes en facturen die áánkomen

### Jobs-to-be-done
> "Wanneer ik een offerte stuur naar een nieuwe klant met een @gmail.com-adres, wil ik weten dat hij binnen 2 min in hun inbox staat — niet in spam, niet in quarantaine."

### Probleem
Offertes + facturen + aanbetaling-reminders gaan via email (Resend). Zonder domein-verificatie (SPF/DKIM/DMARC) landen ze in spam. Nieuwe domeinen moeten "warmen" — eerste 100 mails mogen niet als spam worden geflagged, anders reputatie-schade.

### User-scenario

> **Klant verstuurt offerte → mail komt in Gmail-spam → klant tekent niet → caterier verliest deal.**
> Fix: per klant-tenant auto-setup van custom-domain (bbq.berkhoutcatering.nl) met SPF/DKIM/DMARC records. Resend dashboard toont bounce-rate, spam-complaints, delivery-rate per tenant.

### Stakeholders
- **Primair:** Caterier (stuurt mails)
- **Secundair:** Eindklant (ontvangt mails)
- **Tertiair:** Resend (betaalde service), Gmail/Outlook (reputatie-beoordelaars)

### Constraints
- Resend-pricing: $20/mnd voor 50k emails (OK voor alle tiers).
- Domain-verificatie vereist DNS-toegang van klant — onboarding-wrijving.
- DMARC-beleid mag niet te streng (p=reject kan eigen mails blokkeren).

### Success criteria
| Metric | Doel | Meting |
|---|---|---|
| Delivery-rate | ≥ 98% | Resend-dashboard |
| Spam-complaint-rate | < 0,1% | Resend |
| Bounce-rate | < 2% | Resend |
| Onboarding-flow DNS-setup succes | ≥ 80% | Funnel |

### Metings-instrumentatie
- Event `domain_verification_started`, `_completed`, `_failed`
- Event `email_sent`, `_delivered`, `_bounced`, `_complained`
- Dashboard per tenant: deliverability-score

### Edge-cases en risico's
- Klant heeft geen DNS-toegang (shared hosting) → fallback: onze `mail.bbqarchitect.nl`
- Domain-reputatie kapot gemaakt door één klant → per-tenant IP-pools
- GDPR: unsubscribe-link verplicht op marketing-emails, niet op transactional

### Status & dependencies
🟡 **Niet begonnen.** Resend is geïntegreerd, maar per-tenant-domain-setup ontbreekt.
Dependencies: SF-8 (pas relevant bij meerdere klanten).

---

## SF-10 — Billing-infra: subscription-management, dunning, tier-wijzigingen

### Jobs-to-be-done
> "Wanneer een klant van Starter naar Pro wil upgraden, wil ik dat in 30 sec gebeurd is met correcte proratie, zonder dat ik handmatig Mollie-facturen moet aanpassen."

### Probleem
We hebben tier-features, maar geen subscription-engine. Nodig: recurring billing, proration bij tier-switch, dunning (failed-payment-flow), trial-expiratie, downgrades.

### User-scenario

> **Maand 3, klant upgradet van Starter naar Pro:**
> - Huidige periode: 15 dagen resterend op Starter (€49/mnd)
> - Upgrade-klik → auto-proration: €24,50 credit + €49,50 Pro-deel
> - Nieuwe factuur: €25 voor huidige maand
> - Volgende maand: €99 recurring
> - Geen handmatige Sam-interventie

### Stakeholders
- **Primair:** Klant (self-service upgrade/downgrade)
- **Secundair:** Sam (geen handmatig werk)
- **Tertiair:** Boekhouder (correcte BTW, declaraties)

### Constraints
- Mollie Subscriptions API of Stripe Billing (beide kunnen NL).
- Nederlandse BTW-regels: 21% op SaaS.
- Trial zonder credit-card = hoger activation maar lager trial→paid.
- Failed-payment-handling: 3x retry, dan soft-lock-account (read-only).

### Success criteria
| Metric | Doel | Meting |
|---|---|---|
| Self-service upgrade/downgrade | 100% zonder Sam | Support-tickets |
| Failed-payment-recovery | ≥ 70% | Dunning-stats |
| Subscription-cancel-reason gecapture | ≥ 80% | Exit-survey |
| Involuntary churn (failed payment) | < 2%/mnd | Billing |

### Metings-instrumentatie
- Event `subscription_upgraded`, `_downgraded`, `_cancelled` met reason
- Event `payment_failed`, `_retried`, `_recovered`
- Dashboard: MRR, ARPU, gross-churn, net-churn

### Edge-cases en risico's
- Klant downgradet van Pro naar Starter maar heeft 8 gebruikers → soft-block downgrade tot <= 2
- VAT-nummer voor B2B (reverse-charge EU) → Mollie valideert VIES
- Prorated refund bij jaar-abonnement → handmatig of automatisch?
- "Pauzeer abonnement" (winter-seizoen) — nog niet ondersteund, later overwegen

### Status & dependencies
🟡 **Niet begonnen.** Tier-config bestaat (in `featureFlags.ts`), geen billing-engine.
Dependencies: Mollie of Stripe-account, SF-8 (pas relevant bij launch).

---

## SF-11 — Data-export & portability: AVG-compliance + lock-in-reductie

### Jobs-to-be-done
> "Wanneer ik besluit van BBQ Architect weg te gaan, wil ik binnen 1 klik al mijn data in een leesbaar formaat krijgen, zodat ik niet gegijzeld ben door mijn eigen historie."

### Probleem
AVG-wetgeving (artikel 20): recht op dataportabiliteit. Moet: volledige data-export in machine-leesbaar formaat (CSV/JSON), binnen 30 dagen op verzoek. Nu: geen export-knop.

### User-scenario

> **Klant vraagt via support "mijn data ophalen". Nu: Sam moet handmatig Supabase dumpen. Straks: klant klikt "Download data" in instellingen → ZIP met alle tabellen in CSV + JSON + README. Klaar in 10 sec.**

### Stakeholders
- **Primair:** Klant (AVG-recht)
- **Secundair:** AP (handhaver)
- **Tertiair:** Sam (moet geen ticket-werk doen)

### Constraints
- Export binnen 30 dagen (AVG).
- Machine-leesbaar: CSV of JSON.
- Moet alle PII bevatten (klanten, medewerkers, logs).
- Mag alleen eigen tenant data bevatten (RLS, zie SF-7).

### Success criteria
| Metric | Doel | Meting |
|---|---|---|
| Self-service export-knop aanwezig | Ja | Feature-inspectie |
| Export bevat alle tenant-data | 100% | Audit |
| Export-tijd | < 60 sec voor 10k rows | Perf-test |
| AVG-compliance audit | Pass | Extern |

### Metings-instrumentatie
- Event `data_export_requested`, `_completed`, `_failed`
- Dashboard: exports/maand, gemiddelde rij-count

### Edge-cases en risico's
- Grote tenant (100k rows): async job + email-link ipv sync download
- Foto-archief bijvoegen? → ja (= AVG), maar zipt groot
- Format-versie: CSV-v1 (datum ISO8601, NL-decimaal)
- Klant kan niet downloaden (bv. ontslagen-werknemer-request) → admin-flow

### Status & dependencies
🟡 **Niet begonnen.**
Dependencies: SF-7 (RLS) — export mag alleen eigen tenant-data halen.

---

## SF-12 — AI-quality evaluation pipeline: voorkom regressie bij prompt/model-wissels

### Jobs-to-be-done
> "Wanneer Anthropic een nieuw model uitbrengt of ik m'n prompt aanpas, wil ik binnen 10 min weten of de wizard nog steeds ≥95% accuracy heeft op de 100 test-cases uit de afgelopen 6 maanden, zodat ik niet stilletjes regressie naar productie stuur."

### Probleem
AI is een zwart doos. Prompt-change of model-upgrade kan stilzwijgend accuracy laten zakken. Nu: we merken het pas als klant klaagt. Nodig: continue evaluatie-pijplijn met gouden test-set.

### User-scenario

> **Sam overweegt te upgraden van claude-opus-4-7 naar claude-opus-5.**
> Draait eval-script: 100 wizard-inputs uit productie-historie vs. verwachte output. Accuracy drop van 96% naar 91%. → terug naar 4-7. Zonder eval-pipeline had hij de upgrade uitgerold en had de eerste klanten-klacht 3 dagen later geweten.

### Stakeholders
- **Primair:** Sam (model/prompt-keuzes)
- **Secundair:** Klanten (zien hoge AI-kwaliteit)
- **Intern:** AI-budget (eval-runs = tokens)

### Constraints
- Test-set: 100+ representatieve cases, geanonimiseerd uit prod.
- Eval-frequentie: elke deploy + wekelijks autonomous.
- Golden-output per case handmatig vastgesteld (duur werk, doe 1x goed).
- Budget: ~€5 per eval-run.

### Success criteria
| Metric | Doel | Meting |
|---|---|---|
| Test-set ≥ 100 cases | — | Set-size |
| Accuracy per deploy gemeten | 100% | CI-logs |
| Regressie (>5pp drop) gedetecteerd | < 1u | Alert-log |
| False-negative-rate eval | < 5% | Jaarlijkse review |

### Metings-instrumentatie
- CI-job `ai-eval` per deploy
- Dashboard: accuracy-trend over tijd, per dimensie (parse, menu-suggest, prijs)
- Alert bij >5pp drop

### Edge-cases en risico's
- Test-set ouderwets: refresh elke kwartaal met nieuwe edge-cases
- PII in test-data: strikte anonimisatie voor push naar git
- Eval-kosten explosion bij grote runs: sampling-strategie (eerst 20, dan 100)

### Status & dependencies
🟡 **Niet begonnen.** Simpele versie haalbaar in 2 dagen.
Dependencies: SF-1 (wizard moet bestaan; ja ✅).

---

## Samenvatting & prioritering

### Status & dependencies

| Frame | Titel | Status | Blokker voor | Prioriteit |
|---|---|---|---|---|
| SF-1 | AI offerte-wizard | ✅ Done | — | Polish only |
| SF-2 | Menu engineering | ✅ Done | — | Empty-state |
| SF-3 | HACCP mobile field | ⚠️ Gap | Pro-tier bij keuken-klanten | H1 |
| SF-4 | Event-day field view | ⚠️ Gap | Pro-tier op event-dag | H1 |
| SF-5 | Financiële integraties | 🟡 Deels | Boekhoud-serieuze klanten | H1-H2 |
| SF-6 | Onboarding < 60 min | 🟡 Scaffold | Self-service verkoop | H1 |
| SF-7 | Multi-tenancy RLS | 🚨 Kritiek | **SF-8** (commercie) | **H1 blok 1** |
| SF-8 | Commercie | 🟡 Scaffold | Omzet | H1 blok 2 |
| SF-9 | Email-deliverability | 🔴 Niet begonnen | Trust (offertes komen aan) | H1-H2 |
| SF-10 | Billing-infra | 🔴 Niet begonnen | SF-8 (self-service) | H1 |
| SF-11 | Data-export / AVG | 🔴 Niet begonnen | AVG-compliance | H2 |
| SF-12 | AI-eval pipeline | 🔴 Niet begonnen | Kwaliteitsborging | H1 (light) / H2 (full) |

### Dependency-grafiek

```
SF-7 (RLS) ──┐
             ├──→ SF-8 (commercie) ──→ Omzet
SF-6 (onboard) ──┤
                 │
SF-10 (billing) ─┘
             
SF-9 (email) ─────→ SF-8 kwaliteit
SF-11 (export) ───→ SF-8 trust
SF-12 (AI-eval) ──→ SF-1 kwaliteit blijvend
```

### Impact × Effort matrix

| | **Laag effort** | **Hoog effort** |
|---|---|---|
| **Hoog impact** | SF-1 polish, SF-10 (als we Mollie Subs gebruiken), SF-12 light, SF-11 export | SF-3 HACCP mobile, SF-4 event-day, SF-7 RLS, SF-8 commercie |
| **Laag impact** | SF-2 empty-state, SF-9 DNS-onboarding | — (niet investeren) |

### Prioriteit-volgorde (6-maands)

| Week | Frame | Waarom nu |
|---|---|---|
| W1-2 | SF-7 | Blokkerend voor alles |
| W3-4 | SF-10 + SF-6 | Commerce-lancering nodig |
| W5-6 | SF-8 launch | Pricing + landing |
| W7-8 | SF-3 (HACCP mobile) | Field-gap dichten |
| W9-10 | SF-4 (event-day) | Field-gap dichten |
| W11-12 | SF-9 (email) + SF-12-light | Trust + kwaliteit |
| W13-20 | SF-5 (Moneybird + iDEAL) | Pro-waarde |
| W21-24 | SF-11 (export) + SF-12-full | AVG + kwaliteitsborging |

### Niet-doen

- Nieuwe feature-domeinen buiten deze 12 frames.
- Internationalisatie (EN, DE).
- White-label vóór 3e Enterprise-klant.
- Mobile native app (PWA is genoeg).
- API-ecosystem vóór 10 betalende klanten.

Vervolg met `/strategize` om dit om te zetten naar concrete sprint-scope met team/tijd/kosten.
