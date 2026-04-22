# Product Strategy — BBQ Architect v2

**Datum:** 2026-04-21
**Horizon:** 12 maanden (tot 2027-04-21)
**Gebaseerd op:** `competitor-benchmark.md` (10 concurrenten) en `problem-frames.md` (SF-1 t/m SF-12)

---

## 1. North-star

### Vision-statement

> **In 2027 is BBQ Architect hét digitale commandocentrum voor de 1.500 Nederlandse BBQ- en event-caterers onder 30 events per maand, zó dat de gemiddelde klant zijn Excel-sheet, WhatsApp-chaos en dubbel-invoer in 3 maanden vervangt en 4 uur per week wint.**

### North-star metric
**Aantal verstuurde offertes per actieve klant per week.**
De handeling waar klanten de meeste tijdwinst voelen. Stijgt → platform leeft, klant ziet waarde. Daalt → we zien churn aankomen 2–3 weken voor hij betaalt.

### Secundaire metrics
| Metric | Waarom |
|---|---|
| Activation rate (1e offerte < 60 min) | Voorspelt retentie beter dan elk ander signaal |
| Pro-tier % | Indicator of we diepe waarde leveren, niet alleen oppervlak |
| HACCP-logs/week/klant | Sign of Pro-klanten hun keuken echt meenemen → sticky |
| NPS 3-mnds cohort | Health-check vóór churn |
| MRR | Business-gezondheid |

### TAM / SAM / SOM

| Laag | Definitie | Aantal | Potentieel MRR |
|---|---|---:|---:|
| TAM (Total) | NL-bedrijven met SBI 56.21 (event-catering) | ~4.500 | ~€450k |
| SAM (Serviceable) | NL-caterers 1–30 events/mnd, primair BBQ/event | ~1.500 | ~€150k |
| **SOM (12 mnd)** | Realistisch binnen bereik met solo-founder + organic | **50 klanten** | **€5k/mnd** |
| SOM (24 mnd) | Met bewezen model + part-time support | 200 klanten | €20k/mnd |
| SOM (36 mnd) | Met klein team (2–3 FTE) | 500 klanten | €50k/mnd |

**3% penetratie in SAM na 12 maanden** is realistisch. Zelfs op 10% (150 klanten) halen we €15k MRR — een Sam-sustainable sidebusiness.

---

## 2. Positionering

### Single-sentence statement
> Eén Nederlandse AI-suite voor BBQ-caterers die de hele keten — aanvraag, offerte, event-dag, factuur, HACCP — in één flow afhandelt, voor de prijs van een Moneybird-abonnement.

### Positionering-matrix

| Dimensie | BBQ Architect | Cateringpoint | Tripleseat | Excel-stack |
|---|---|---|---|---|
| Taal | NL-native | NL-native | EN | NL |
| Diepte | Hoog | Middel | Hoog | Laag |
| AI | Hoog | Laag | Laag | Geen |
| Prijs | €49–€249 | €60–€150 | €200+ | €20–€40 |
| Doelgroep | 1–30 events/mnd | 1–15 events/mnd | 20+ events/mnd | 1–10 events/mnd |
| Keuken/HACCP | Ja (doel) | Nee | Nee | Nee |
| Financiën NL | Moneybird + iDEAL | Moneybird | Geen | Moneybird |

### Anti-positionering — wie we bewust NIET bedienen

| Segment | Waarom niet |
|---|---|
| Hotel/conference venues (>100 events/mnd) | Tripleseat-speelveld, andere workflow (banquet-staffing) |
| Internationale markten | NL-fit is onze moat; uitbreiden verwatert |
| Pure restaurants | POS + reservations = ander product |
| Food-delivery/dark-kitchens | Geen event-context |
| Single-product businesses (koffiebars) | Te simpel voor Pro-waarde |

---

## 3. Persona's

### Persona 1: Marieke — nano-cater (Starter €49)
- **Profiel:** 32 jaar, gestart als hobby-BBQ'er, nu 3 events/mnd naast dagbaan
- **Tools:** Excel + WhatsApp Business + Moneybird + Canva
- **JTBD:** "Help me op vrijdagavond nog snel een professionele offerte sturen zodat ik in het weekend niet moet stressen."
- **Keuzedrijvers:** Tijd > Prijs > Features
- **Acquisitie-kanaal:** Instagram, mond-tot-mond, NL-catering-community
- **Success-signaal:** ≥ 1 offerte/week verstuurd na 30 dagen
- **Risico:** Churn als volume laag blijft; probeer-tarief moet activatie genereren

### Persona 2: Jeroen — actieve cater (Pro €99)
- **Profiel:** 42 jaar, catering is zijn full-time bedrijf, 15 events/mnd, 3 medewerkers
- **Tools:** Cateringpoint of oudere NL-tool + Moneybird + Google Sheets voor keuken
- **JTBD:** "Geef me overzicht over marges per gerecht en houd m'n HACCP bij zonder papier."
- **Keuzedrijvers:** Diepte > NL-fit > Prijs
- **Acquisitie-kanaal:** SEO ("cateringpoint alternatief"), LinkedIn, referral
- **Success-signaal:** Menu-engineering opent 1x/mnd, HACCP-logs dagelijks
- **Risico:** Nostalgie voor oude tool + data-lock-in; mitigatie via CSV-import

### Persona 3: Lars — groei-cater (Enterprise €249)
- **Profiel:** 48 jaar, 3 vestigingen, 50 events/mnd, 15+ medewerkers
- **Tools:** Caterease of intern-gebouwd systeem + Exact + eigen website
- **JTBD:** "Laat me multi-location runnen met white-label voor grote corporate klanten."
- **Keuzedrijvers:** Schaal + API + service-level
- **Acquisitie-kanaal:** Direct outreach, referenties
- **Success-signaal:** API-gebruik, 3+ locations
- **Risico:** Migratie-cost van incumbent te hoog; bied done-with-you onboarding

---

## 4. Strategische pijlers

### Pijler 1 — AI als vermenigvuldiger, niet als speeltje
Elke AI-feature moet 10× sneller zijn dan de handmatige alternatief. Anders: uit de UI. Cost-model per tier:

| Tier | Prijs | AI-cap | Max AI-cost (Claude Opus) | % van tier |
|---|---:|---:|---:|---:|
| Starter | €49 | 50 acties | ~€2,50 | 5% |
| Pro | €99 | 500 acties | ~€25 | 25% |
| Enterprise | €249 | 2.000 acties | ~€100 | 40% |

**Regel:** In Pro en Enterprise moet non-AI-waarde (HACCP, menu-engineering, integraties) de tier-prijs al rechtvaardigen; AI is de kers.

**Infrastructuur-staat (2026-04-21):** ✅ Operationeel. `src/lib/aiUsageServer.ts` implementeert `checkAiCapServer()` + `logAiUsageServer()` met soft-throttle (>100% cap) en hard-block (>150% cap). Wordt aangeroepen in alle 4 AI-routes (`/api/chat`, `/api/parse-document`, `/api/recipe-generate`, `/api/supplier-analysis`). Cost per actie (input/output/cache-read/cache-write tokens) wordt in cents bij elke call opgeslagen in `public.ai_usage`.

### Pijler 2 — NL-fit als moat
Taal, Moneybird, iDEAL, BTW, NVWA-HACCP, NL-horeca-begrippen. Elk voorstel dat deze moat verzwakt ("ook in het Engels aanbieden") → uitstellen naar horizon 3.

### Pijler 3 — Feature-breedte, geen feature-explosie
Feature-oppervlak is al 90% competitief. Nieuwe features alleen als ze een bestaande frame uit SF-1..12 dienen. Geen speculatieve modules.

### Pijler 4 — Self-service als tijdsbescherming voor Sam
Geen persoonlijke onboarding, geen support-tickets die Sam oplost. Alles in-product (onboarding-wizard, help-center, Loom-video's). Elke support-call = falende UX.

### Pijler 5 — Eet-je-eigen-hondenvoer als QA
Berkhout Catering gebruikt elk feature vóór het naar externe klanten mag. Als het bij Berkhout niet werkt, is het niet klaar.

### Pijler 6 — Meten ≫ gokken
Elk feature krijgt vooraf success-criteria en instrumentatie (SF-1..12). Zonder metrics geen launch. Zonder review geen keep-building.

---

## 5. Tier-model

### Pricing-tabel

| Tier | Prijs/mnd | Jaarprijs | Target | AI-cap | Events/mnd | Teamleden | Opslag |
|---|---:|---:|---|---:|---:|---:|---:|
| **Starter** | €49 | €490 | Nano-cater (1–5 events) | 50 | 10 | 2 | 1 GB |
| **Pro** | €99 | €990 | Actieve cater (5–30) | 500 | 50 | 5 | 10 GB |
| **Enterprise** | €249 | €2.490 | Groei-cater (30+) | 2.000 | ∞ | ∞ | 100 GB |

Jaarprijs = 10× maandprijs (2 mnd gratis).

### Trial-model
- **2 maanden gratis zonder creditcard**
- Volledige Pro-functionaliteit tijdens trial
- Dag 1–30: onbeperkte AI (toon kracht)
- Dag 31–60: Starter-cap (toon grens, stimuleer paid)
- Dag 61: kies tier of downgrade naar read-only

### Feature-matrix

| Feature | Starter | Pro | Enterprise |
|---|:-:|:-:|:-:|
| Events, offertes, facturen, klanten | ✅ | ✅ | ✅ |
| Recepten, gerechten, agenda | ✅ | ✅ | ✅ |
| AI offerte-wizard (capped) | ✅ | ✅ | ✅ |
| AI assistant chat (capped) | ✅ | ✅ | ✅ |
| Menu-engineering | — | ✅ | ✅ |
| HACCP | — | ✅ | ✅ |
| Voorraad, inkoop | — | ✅ | ✅ |
| Crew uren, materieel, logistiek | — | ✅ | ✅ |
| Moneybird-sync, Mollie iDEAL, e-signature | — | ✅ | ✅ |
| Advanced analytics, price intelligence | — | ✅ | ✅ |
| Foto-archief, template-editor, website-builder | — | ✅ | ✅ |
| Lead-capture widget, dropoff-portal | — | — | ✅ |
| API-access, white-label, multi-location | — | — | ✅ |

### Pricing-sensitivity

| Prijspunt | Reactie bij NL-caterers (schatting) |
|---|---|
| Starter €29 | "Te goedkoop, ik vraag me af wat erin zit." Minder geloofwaardig. |
| Starter €49 | "Minder dan 1 uur eigen tijd. Waard om te proberen." Sweet spot. |
| Starter €69 | "Hmm, moet minstens 2 events/mnd opbrengen." Starter-klant haakt af. |
| Pro €79 | "Goedkoop! Concurreer scherp met Cateringpoint." Goed alternatief. |
| Pro €99 | "Goed tarief voor 5–30 events/mnd." Sweet spot. |
| Pro €149 | "Duur, moet extra diepte hebben dan Cateringpoint." Enterprise-terrein. |
| Enterprise €199 | Mogelijk, maar te dicht op Pro. |
| Enterprise €249 | "Duidelijk premium, ik heb multi-location nodig." Sweet spot. |
| Enterprise €399 | Geloofwaardig als we done-with-you onboarding doen. |

**Conclusie:** €49/€99/€249 is de sweet spot. Niet bewegen zonder data.

### Prijsankers (framing)
- **Moneybird:** €18/mnd — wij 2,7× duurder, vervangen 3 tools.
- **Cateringpoint:** €60–150/mnd — onze Starter goedkoper, Pro gelijkwaardig met meer diepte.
- **Tripleseat:** ~$300/mnd — onze Enterprise 25% goedkoper met NL-fit.
- **Excel + WhatsApp:** ~€20/mnd — wij 2,5× duurder maar besparen 4 uur/week = ~€200.

---

## 6. Unit economics

### Aannames
- **CAC (Customer Acquisition Cost):** €100–€150 (organic-gedreven, minimale paid-ads)
- **Gross margin:** 70% (30% AI-kosten + Supabase + domein + email)
- **Churn:** 5% maandelijks H1, 3% H2+ (NL-caterers zijn loyaal als de tool werkt)
- **ARPU (Average Revenue Per User):** €85/mnd gewogen (mix Starter/Pro/Enterprise)

### LTV-berekening

Mediaan klant-leven bij 3% mnd-churn = 1 / 0,03 = 33 maanden ≈ 2,75 jaar.

| Scenario | ARPU | Churn/mnd | Leeftijd | LTV | LTV/CAC |
|---|---:|---:|---:|---:|---:|
| Conservatief | €70 | 8% | 12 mnd | €588 | 4× |
| Base | €85 | 5% | 20 mnd | €1.190 | 8× |
| Optimistisch | €100 | 3% | 33 mnd | €2.310 | 15× |

**Gezonde ratio (>3×) zelfs in conservatief scenario.** Ruimte voor paid-ads bij bewezen funnel.

### Payback-periode

Bij ARPU €85 en 70% margin → €59,5/mnd contribution. CAC €150 → payback in 2,5 maand. Onder 12 mnd = top-SaaS-performance.

### Revenue-scenario's (12 maanden)

| Scenario | Klanten M12 | MRR M12 | ARR | Assumption |
|---|---:|---:|---:|---|
| **Pessimistisch** | 15 | €1.300 | €15.600 | Alleen eigen netwerk, geen productmarket-fit-signaal |
| **Base** | 50 | €4.250 | €51.000 | Community + SEO werken, 25% trial→paid |
| **Optimistisch** | 100 | €8.500 | €102.000 | Referral-vlieg + partnership met Moneybird |

Sam-break-even (op 15 uur/week investment à notionaal €75/uur): ~€4.500 MRR. **Base scenario haalt dit eind H2.**

---

## 7. Go-to-market playbook

### Acquisitie-kanalen (geprioriteerd)

#### Kanaal 1: NL-catering-community (organic)
- **Waar:** Facebook-groep "Nederlandse Caterers", "BBQ Nederland", LinkedIn-pagina's
- **Tactiek:** Waardevolle content (benchmark-insights, HACCP-templates, margerapport) delen, geen hard-selling
- **Eigen product-demo:** Berkhout Catering als case
- **Doel H1:** 20 sign-ups, 5 betalende klanten
- **Kosten:** €0 (Sam's tijd, ~3 uur/week)

#### Kanaal 2: SEO op long-tail NL-catering-keywords
- **Targets:** "cateringpoint alternatief", "BBQ offerte template", "HACCP digitaal catering"
- **Content:** 20 blog-posts H1 (oneindig herbruikbaar)
- **Doel H1:** 500 organic visitors/mnd
- **Kosten:** Sam's schrijftijd + €50 SEO-tool

#### Kanaal 3: Mond-tot-mond (Berkhout referrals)
- **Tactiek:** Sam spreekt in NL-catering-events over "hoe hij z'n eigen bedrijf runt"; referral-programma met €50 credit per verwijzing
- **Doel H1:** 5 verwijzingen
- **Kosten:** €250 in credits (5 × €50)

#### Kanaal 4: Instagram (Berkhout-content, BBQ Architect subtly)
- **Tactiek:** Reels met workflow-demos, stories met "zo doe ik mijn offertes in 2 min"
- **Doel H1:** 200 nieuwe volgers, 2 klant-conversies
- **Kosten:** €0

#### Kanaal 5: Partnership-leads
- **Moneybird-marketplace:** BBQ Architect als catering-vertical in MB-app-store. Vereist OAuth-app-registratie (SF-5).
- **NL-catering-events** (HorecaVa, VIV Horeca): bezoeken + praten met caterers, niet booth huren
- **Rentman** (zie benchmark O-N5): cross-refer equipment-rental
- **Doel H1:** 3 partnership-gesprekken, Moneybird-listing live
- **Kosten:** Event-tickets €200

#### Kanaal 6: Content-marketing via gasting
- **Tactiek:** Gast-blogs op HorecaVa.nl, Miele-catering-blog, schrijf artikelen
- **Doel H1:** 2 gepubliceerde artikelen
- **Kosten:** €0

#### Kanaal 7 (H2+): Paid ads
- Niet nu. Start wanneer base-conversie bewezen is (minstens 10 klanten via organic).
- Eerste test: Google Ads op "cateringpoint alternatief", €500 budget.

### Content-kalender H1

| Maand | Topic | Type | Kanaal |
|---|---|---|---|
| M1 | "Wat kost het als je offertes in Excel blijft maken?" | Blog + Instagram-reel | Web + social |
| M2 | "5 BBQ-gerechten met hoogste marge" | Blog + reel | Web + social |
| M3 | "HACCP digitaal: wat de NVWA écht wil zien" | Blog + webinar | Web + community |
| M4 | "Van Cateringpoint naar BBQ Architect: data-migratie in 30 min" | Tutorial + video | Web + Moneybird |
| M5 | "Hoe ik als solo-cater 8 events/mnd doe zonder burn-out" | Case-study (Berkhout) | Web + LinkedIn |
| M6 | "De eerste 10 klanten: wat we leerden" | Founder-story | Web + community |

---

## 8. Partnership-strategie

### Tier 1 (prioriteit H1)

| Partner | Type | Waarde | Moeite | Status |
|---|---|---|---|---|
| **Moneybird** | Integratie + marketplace-listing | Directe lead-funnel uit MB-app-store | Middel (OAuth-app) | Plannen |
| **Mollie** | Payment-partner + iDEAL | iDEAL-aanbetaling = NL-standaard | Laag | Scaffold done |
| **Resend** | Email-delivery | Betrouwbare mails | Laag | Geïntegreerd |

### Tier 2 (overwegen H2)

| Partner | Type | Waarde | Moeite | Status |
|---|---|---|---|---|
| **Rentman** | Cross-refer | Caterers met equipment-rental | Laag | Outreach |
| **Exact Online** | Accounting (alternatief voor MB) | Groei-caterers gebruiken Exact | Middel | Overwegen H3 |
| **KVK** | Open-data API | Auto-fill bij signup | Laag | H2 |
| **Peppol-netwerk** | E-facturatie | Wettelijk vereist 2028 | Hoog | H3 voorbereiden |

### Tier 3 (later)

| Partner | Type | Status |
|---|---|---|
| Grote NL-caterers als reseller | Channel | H3+ |
| Horeca-opleidingen | Awareness + junior-pijplijn | H3+ |
| BBQ-leveranciers (grill-merken) | Co-branded content | H3+ |

---

## 9. Roadmap — 3 horizons met sprint-detail

### Horizon 1 (0–3 maanden, 2026-04-21 → 2026-07-21) — "Commerciële basis"

**Thema:** Maak het verkoopbaar.

#### Sprint 1 (W1–2): RLS-restant + onboarding-wiring
**Herijkt 2026-04-21:** RLS-fundament staat al (zie audit in `execution-playbook.md §A`). Focus verschuift naar het afronden van 5 restanten + onboarding-wiring.

- **RLS-restant §A** (2 dagen):
  - Policies schrijven voor 12 tabellen zonder policy (of `GRANT`-review als service-role-only)
  - Storage-bucket listing-policies intrekken (5 buckets)
  - POS-tabellen `WITH CHECK (true)` constrainen
  - Auth leaked-password-protection aanzetten
  - 2 functies `SET search_path` fixen
- **Onboarding-wiring §B/C/D** (5 dagen):
  - `signup_completed` event bij auth-signup
  - `BedrijfStep` persist naar `organizations.settings`
  - `DataStep` demo-data echte inserts (3 klanten, 5 gerechten, 2 menu's)
  - `first_quote_sent` event bij offerte-verzenden
  - `onboarding_completed` event aan einde flow
- **2e-tenant-test** (1 dag): Playwright-CI-test die cross-tenant-data-lek zou opvangen
- **Deliverable:** Supabase-advisor 0 kritieke warnings; activation-funnel meet 5 milestones; 2e-tenant-test groen in CI

#### Sprint 2 (W3–4): Billing + funnel-dashboard
- **SF-10:** Mollie Subscriptions (of Stripe Billing) in `app/api/billing/*`:
  - 3 tiers als Mollie Product, trial 60 dagen, proration bij upgrade
  - Webhook op `subscription.updated` → `organizations.plan` sync
  - Failed-payment dunning (3x retry → soft-lock-tenant)
- **Funnel-dashboard** in `/admin` (of `/insights`): activation-conversie per milestone, AI-cost per org
- **Deliverable:** Self-service sign-up → trial → upgrade-flow werkt; admin ziet funnel-drop-off
- **Dependency:** Sprint 1 klaar

#### Sprint 3 (W5–6): Launch-klaar
- SF-8: Landingspagina publiek, pricing-pagina live, legal (T&C, AVG, DPA)
- Externe penetratie-test op RLS-fix
- Eerste 3 echte trial-klanten uit Sam's netwerk
- **Deliverable:** 3 externe trials actief
- **Risk:** Pen-test vindt bug → extra week nodig

#### Sprint 4 (W7–8): HACCP field-mode
- SF-3: HACCP-pagina volledig herontwerp, 44px+ targets, 64px steppers, tablet-viewport-geoptimaliseerd
- Offline-sync via IndexedDB
- **Deliverable:** HACCP werkt op iPad met handschoenen (user-test met Bas uit Berkhout-keuken)

#### Sprint 5 (W9–10): Event-day field view
- SF-4: Mobile bottom-nav, 48px+ targets overal, uren-2-tap-flow
- Responsive redesign volgens 4-breakpoint-systeem (uit UX-audit)
- **Deliverable:** Field-use-test op echt Berkhout-event

#### Sprint 6 (W11–12): Launch + quality
- SF-9: Domain-verification-flow, Resend-DNS-setup-guide
- SF-12-light: 30 AI-eval-cases, CI-job bij deploy
- **Launch:** Publieke lancering in NL-catering-community
- **Doel:** 10 betalende klanten eind H1

**H1-einddoel:** 10 betalende klanten, €500–€750 MRR, RLS veilig, mobile-UX 4/5.

### Horizon 2 (3–9 maanden, 2026-07-21 → 2026-10-21) — "Differentiatie & retentie"

**Thema:** Maak het plakkerig.

| Maand | Frame | Deliverable |
|---|---|---|
| M4 | SF-5 | Moneybird OAuth-app gepubliceerd; 1-klik factuur-sync in prod |
| M5 | SF-5 | Mollie iDEAL-aanbetaling-flow, iDEAL-link in offerte-PDF |
| M6 | SF-1 polish | Wizard-accuracy dashboard, prompt-tuning per segment |
| M7 | SF-2 polish | Menu-engineering empty-state + branche-benchmark (anoniem) |
| M8 | SF-4 polish | Offline-sync event-dag, realtime-updates <3 sec |
| M9 | SF-11 + groei | Data-export-self-service (AVG); referral-programma live |

**H2-einddoel:** 30 klanten, €3k MRR, NPS ≥40, churn <5%/mnd.

### Horizon 3 (9–12 maanden, 2026-10-21 → 2027-04-21) — "Schaal & optionele upside"

**Thema:** Maak het schaalbaar.

| Maand | Frame | Deliverable |
|---|---|---|
| M10 | Enterprise | Multi-location + white-label voor eerste Enterprise-klant |
| M11 | SF-12-full | Volle AI-eval-pipeline, 100+ test-cases, wekelijks CI |
| M11 | Compliance | Peppol-UBL voorbereiding (2028 verplicht) |
| M12 | Experiments | Lead-capture widget, dropoff-portal voor eindklanten |
| M12 | Evaluatie | Strategy-review voor 2027 op basis van data |

**H3-einddoel:** 50 klanten, €5k MRR, 3+ Enterprise-klanten, 2027-plan op basis van data.

---

## 10. Success-criteria per kwartaal

| Kwartaal | Klanten | MRR | Kern-outcome |
|---|---:|---:|---|
| Q1 (M1–3) | 10 | €500 | Launch klaar, eerste externe klanten |
| Q2 (M4–6) | 20 | €1.500 | Moneybird-sync live, churn onder 5% |
| Q3 (M7–9) | 35 | €3.000 | Referral-vlieg, NPS ≥40 |
| Q4 (M10–12) | 50 | €5.000 | Enterprise-bewijs, 2027-roadmap |

---

## 11. Operating cadence

### Wekelijks (1 uur)
- Metrics-review: nieuwe signups, activation, churn, AI-cost
- Support-tickets → SF-terugkoppeling
- Sprint-planning volgende week (2 uur op vrijdag)

### Maandelijks (3 uur)
- Cohort-analyse (trial → paid, retentie per maand-cohort)
- Prompt-review wizard (kwaliteit steekproef 50 runs)
- Concurrent-scan: nieuwe Cateringpoint/Fjild-features?
- Partnership-check-in (Moneybird, Mollie)

### Kwartaal (1 dag)
- Strategy-review: zijn SF-1..12 nog relevant?
- Pricing-review: prijspunten nog juist?
- Persona-validatie: klopt Marieke/Jeroen/Lars nog?
- Roadmap update volgende kwartaal

### Jaarlijks
- Complete benchmark-hernieuwing
- NPS-survey 3+mnd-cohort
- AVG-audit intern
- Externe pen-test RLS

---

## 12. Risk register

| # | Risico | Kans | Impact | Mitigatie |
|---|---|:-:|:-:|---|
| R1 | RLS-lek tijdens lancering | M | Kritiek | H1-W1 blokkerend; externe pen-test vóór launch |
| R2 | Concurrent (Fjild/Cateringpoint) bouwt AI | M | Hoog | Moat op diepte + NL-fit; 12 mnd voorsprong benutten |
| R3 | Sam's bandbreedte solo-founder | H | Hoog | Scope-bewaking; geen nieuwe modules buiten SF-1..12; Claude voor velocity |
| R4 | AI-kosten explodieren bij misbruik | L | Middel | Harde cap per tenant; monitoring; auto-alert > 150% cap |
| R5 | NPS laag door mobile-gap | M | Hoog | SF-3 + SF-4 in H1 vóór commerciële launch |
| R6 | NL-markt te klein | L | Kritiek | TAM ~1.500 × €100 = €150k potentieel; 3% = realistisch |
| R7 | E-facturatie (2028) komt eerder | M | Middel | Voorbereiden H3; niet uitstellen |
| R8 | Berkhout-feature-bias | M | Middel | 2e tenant in H1; externe beta-feedback |
| R9 | Moneybird launcht eigen catering-module | L | Hoog | Diepte + catering-specifieke features moat; Moneybird is focus-boekhouden |
| R10 | Anthropic prijst prompt-cost op | M | Middel | Switch-optie GPT-4 / Gemini via abstractie-laag (niet nu, wel voorbereiden) |
| R11 | Klant weigert DNS-setup (SF-9) | H | Middel | Fallback op shared domain `mail.bbqarchitect.nl` |
| R12 | Kritische bug in productie | M | Hoog | Staging-env; feature-flags per tier; rollback-playbook |

---

## 13. Beslissingsregels (voor toekomstige keuzes)

Bij conflicterende paden, gebruik deze regels in volgorde:

1. **Blokkeert het SF-7 (RLS) of SF-10 (billing)?** Ja → eerst die fixen.
2. **Versterkt het de moat (AI + NL-fit + diepte)?** Ja → voorrang. Nee → uitstellen.
3. **Is het reeds gebouwd en 80% af?** Ja → afmaken.
4. **Lost het een top-3 frame op (SF-7, SF-8, SF-3)?** Ja → prioriteit.
5. **Is Sam persoonlijk enige user?** Ja → niet bouwen, los handmatig op.
6. **Retentie vs acquisitie?** <20 klanten: retentie voor. >20 klanten: mix.
7. **Bij twijfel:** bouw niet. Scope-bescherming > feature-uitbreiding.

### Anti-doelen (Definition of not-doing)
- Geen internationalisatie H1-H2
- Geen mobile native app (PWA is genoeg)
- Geen white-label vóór 3e Enterprise-klant
- Geen API-ecosystem vóór 10 betalende klanten
- Geen sales-team vóór €10k MRR
- Geen feature-uitbreiding buiten SF-1..12 zonder strategy-review-onderbouwing

---

## 14. Volgende acties (eerste 7 dagen, 2026-04-21 → 2026-04-28)

1. **Commit alle 3 strategy-docs** naar git (zodat ze niet opnieuw verloren gaan zoals eerder).
2. **Start SF-7 audit**: loop alle tabellen in `public` af, documenteer huidige policies, begin met herschrijven.
3. **Check activation-tracking** (`src/lib/activation.ts`): welke events worden al geïnstrumenteerd, welke ontbreken voor SF-6-funnel?
4. **Moneybird-marketplace-requirements ophalen** — app-registratie-proces documenteren.
5. **Eet-je-eigen-hondenvoer-moment plannen:** 1 echt BBQ-event volledig via BBQ Architect draaien om field-UX-pijn direct te voelen.
6. **Pricing-pagina draft:** copy-basis schrijven voor publieke launch.
7. **Content-kalender M1 plannen:** eerste blog-post ("Wat kost het als je offertes in Excel blijft maken?") beginnen.

Bij conflicten tussen deze docs en toekomstige feature-verzoeken: **documenten bijwerken**, niet omzeilen.
