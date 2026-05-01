# UX Strategy — BBQ Architect v2

**Datum:** 2026-04-28
**Horizon:** 12 maanden (tot 2027-04-28)
**Aansluiting:** [`product-strategy.md`](./product-strategy.md), [`competitor-benchmark.md`](./competitor-benchmark.md), [`problem-frames.md`](./problem-frames.md), [`UX-AUDIT-REPORT.md`](../UX-AUDIT-REPORT.md)

> Dit document is de **design-laag** boven de product-strategie. Product-strategy zegt *wat* we bouwen en *aan wie* we verkopen. UX-strategy zegt *hoe het voelt* en *waarom een ontwerper kiest A boven B*.

---

## 1. North-star vision

### Vision-statement

> **In 2027 voelt BBQ Architect voor een Nederlandse caterier als de stille co-piloot die zijn vrijdagavond, zaterdagochtend-keuken en maandag-administratie tegelijk verlicht — één app die meedenkt, geen handleiding nodig heeft, en op telefoon, tablet en laptop hetzelfde vertrouwen geeft.**

Dit is een **ervaringsdoel**, niet een feature-lijst. De product-strategy [`product-strategy.md`](./product-strategy.md) beschrijft de commerciële vision (1.500 NL-caterers, €5k MRR, 4 uur/week winst). De UX-vision hierboven beschrijft de **gevoels­standaard** waaraan elk ontwerp wordt afgemeten.

### Vision-scenarios — drie momenten in 2027

**Scenario A: Marieke, vrijdag 21:48 — keukentafel, telefoon in één hand**

> Klant stuurt WhatsApp: "BBQ voor 30 man, zaterdag de 14e, eigen tuin in Drenthe?". Marieke opent BBQ Architect, plakt de tekst in de offerte-wizard, kiest 2 menu-opties uit haar standaard-bibliotheek, swipet de marges naar 28%, drukt op "Stuur". Klant heeft binnen 4 minuten een PDF + iDEAL-link in de mailbox. Marieke legt haar telefoon weg en gaat door met haar serie.
> **UX-bewijs:** offerte-flow op mobiel ≤ 3 minuten, ≤ 8 taps, geen pinch-zoom.

**Scenario B: Jeroen, zaterdag 09:32 — natte handen, tablet aan rvs-werkblad**

> Tijdens prep voert Jeroen 3 koeltemps in op het HACCP-scherm. Knoppen zijn 64px hoog, hij raakt ze aan met de zijkant van zijn duim. App registreert tijdstip + medewerker automatisch. Eén afwijking → rood, modal "Actie ondernemen?". Hij kiest "Product weggooid", reden uit dropdown. NVWA-export staat klaar.
> **UX-bewijs:** kritieke kook-acties bedienbaar met handschoen of natte vinger; geen toetsenbord nodig.

**Scenario C: Lars, maandag 14:00 — laptop, manager-modus**

> Lars opent dashboard. Hij ziet de week-omzet per locatie, een rode badge bij locatie Zuid (marge < 25%), en één AI-hint: "3 menu's onder kostprijs — wil je price-suggest?". Eén klik → menu-engineering opent met de matrix gefilterd. Hij verhoogt de prijs van de duurste 3, publiceert. Klaar in 6 minuten.
> **UX-bewijs:** insight → actie → bevestiging in ≤ 3 schermen; AI is hint-niveau, nooit blokkerend.

### Design-pillars (UX-laag)

Deze pijlers vullen de 6 product-pijlers in [`product-strategy.md` §4](./product-strategy.md) aan. Product zegt *waarom*; UX zegt *waaraan herkenbaar*.

| # | UX-pijler | Wat het betekent voor design-keuzes |
|---|---|---|
| **UX-1** | **Field-first responsive** | Elk scherm gaat eerst door 320px-mobiel, dan 768px-tablet, dan desktop. Niet andersom. |
| **UX-2** | **Eén-tap-actie waar het ertoe doet** | Op event-dag, in keuken, in keten-vrachtwagen: max 1 tap voor de meest-frequente actie. Geen menu's. |
| **UX-3** | **AI als suggestie, mens als beslisser** | AI-output is altijd voorzien van bron, alternatief, en "afwijzen"-knop. Nooit auto-submit. |
| **UX-4** | **Stille a11y** | WCAG 2.1 AA is geen feature, het is een instaplevel. Focus-rings, ARIA, screenreader-flow zijn af vóór launch — niet retrofit. |
| **UX-5** | **Eén design-systeem, geen mengsel** | Tailwind-tokens als single source of truth. Geen inline `style=`, geen losse CSS-klassen, geen 3 button-varianten in 3 bestanden. |
| **UX-6** | **Snelheid is een gevoel** | Skeleton-loaders < 200 ms na klik, optimistic UI bij offerte-status, sub-1s pagewechsel. Geen spinners op acties die < 300 ms duren. |

### Time horizons

| Horizon | Periode | UX-thema | Concreet doel |
|---|---|---|---|
| **H1 — Field-readiness** | 2026-04 t/m 2026-07 | Mobiel/tablet bruikbaarheid wegwerken | Touch-target-violations < 5%, WCAG AA op 5 prio-schermen, bottom-nav live |
| **H2 — Differentiatie** | 2026-08 t/m 2026-12 | AI-flow + offline + branding voelt premium | Pitmaster-Studio-flow met < 3s latency, offline-event-dag, PDF-templates tweakbaar |
| **H3 — Schaal-experience** | 2027-01 t/m 2027-04 | Multi-location + white-label + admin-power | Tenant-switcher, eigen-domein-portal, command-palette overal |

---

## 2. Competitive landscape (UX-lens)

> Voor de **commerciële** scoring van 10 spelers: zie [`competitor-benchmark.md`](./competitor-benchmark.md). Deze sectie kijkt alleen naar **UX-patterns**: wat doen anderen goed/slecht qua interactie?

### UX-pattern-matrix

| Pattern | Tripleseat | Caterease | CaterTrax | Cateringpoint | Flex Catering | BBQ Architect (huidig) |
|---|---|---|---|---|---|---|
| **Mobiele navigatie** | Top-bar + sidebar | Sidebar (desktop-only voelend) | Top-bar | Sidebar | **Bottom-tab (native)** | Hamburger + sidebar (vibe-mismatch op mobiel) |
| **Offerte-flow** | Multi-step wizard | Lange form | Wizard met preview | Wizard | Single-page form | Inline 661-regelige form |
| **Touch-targets keuken** | 44px+ knoppen | Te klein | Goed | Onbekend | Native (auto goed) | **40% < 44px op HACCP** |
| **Empty-states** | Illustraties + CTA | Tekst-alleen | Voorbeelden | Tekst-alleen | Onbekend | Gemixt — soms afwezig |
| **Bevestigings-pattern** | Toast + undo | Modal-only | Toast | Toast | Toast | Toast (✅ goed) |
| **Bulk-acties** | Checkbox + action bar | Right-click menu | Checkbox + dropdown | Geen | Geen | Geen — ontbreekt |
| **Search/filter** | Top-bar global | Per-page | Top-bar global | Per-page | Per-page | Per-page (✅ Cmd+K kandidaat) |
| **Realtime updates** | Polling | Polling | Polling | Polling | Push | **Push (Supabase) ✅ uniek** |
| **AI-integratie UI** | Geen | Geen | Geen | Geen | Geen | **Pitmaster Studio ✅ uniek** |

### Aspirational benchmarks (buiten catering)

Deze zijn niet onze concurrenten — ze zetten de UX-lat voor "hoe goed kan het zijn":

| Tool | Wat ze briljant doen | Wat we ervan stelen |
|---|---|---|
| **Linear** | Command-palette als primaire navigatie, sub-100ms transitions | Cmd+K-pattern voor power-users (H2) |
| **Notion** | Inline editing, drag-and-drop blokken | Offerte-builder Q4: blokken-pattern voor menu-items |
| **Stripe Dashboard** | Data-density zonder rommel, micro-copy excellence | Dashboard-tegels-redesign (al gebeurd in laatste commit) |
| **Toast (POS)** | Tablet-keuken UI met 88px-knoppen, glove-friendly | HACCP en event-dag-modus |
| **Superhuman** | Keyboard-first + onboarding-coaching | H2 onboarding-flow met "command tour" |

### UX-gaten in de markt (kansen voor ons)

1. **Niemand heeft een BBQ-specifieke offerte-AI.** Pitmaster Studio is uniek — moet UX-prominent blijven, niet wegstoppen in submenu.
2. **Niemand heeft glove-friendly HACCP.** Onze H1-investering hierin is een directe moat tegen Cateringpoint.
3. **Niemand heeft realtime-multi-device-sync** met de fluidity van Supabase. UX-kans: laat dit *zien* (avatar-cursors, "Marieke is aan het bewerken"-badge).
4. **Niemand heeft Nederlandse iDEAL-aanbetaling in offerte.** UX-kans: maak de aanbetaal-knop in PDF visueel dominant.

---

## 3. Experience map

### Horizontale as: phases

```
ONTDEKKING → EVALUATIE → ONBOARDING → DAGELIJKS GEBRUIK → DIEP GEBRUIK → ADVOCACY
```

### Verticale lagen × kanaalmix

| Phase | User Actions | Touchpoints | Devices | Emoties (huidig) | Pain points (huidig) | Kansen |
|---|---|---|---|---|---|---|
| **Ontdekking** | Googled "cateringpoint alternatief", zag Insta-post, vroeg vriend | Marketing-site, Insta, mond-tot-mond | Desktop + mobiel | Nieuwsgierig, sceptisch ("alweer een tool?") | Geen marketing-site met sociale bewijslast | Bouw landing-page H1, video-tour, testimonial-cohort |
| **Evaluatie** | Vergelijkt features, prijst af tegen tijd Excel | Marketing-site, demo-data, prijspagina | Desktop primair | Voorzichtig optimistisch | Trial vereist nu credit-card? Demo-data ontbreekt | 2-mnd trial zonder CC, demo-data-knop in onboarding |
| **Onboarding** | Maakt account, voert eerste data in, stuurt eerste offerte | App, email-welcome, in-app tour | Desktop + mobiel | Hoop + frustratie bij elke kink | Onboarding-events nog niet gewired (zie SF-7), geen progress-bar | H1-prio: progress-checklist, "eerste offerte in 60 min"-doel |
| **Dagelijks gebruik** | Offerte → factuur → event-dag → bon scannen | App primair, email voor klant-comm | Mobiel + tablet + desktop | Drukke routine, ergernis bij wachttijden | 81% touch-violations, ad-hoc breakpoints | H1-prio: responsive system, bottom-nav |
| **Diep gebruik** | Menu-engineering, HACCP, voorraad, AI-Pitmaster | App, AI-chat, exports | Tablet (keuken) + desktop (analytics) | Trots als marges kloppen, gefrustreerd bij UI-friction | HACCP onbruikbaar met handschoen, menu-engineering te dicht | H1-prio: glove-mode HACCP, H2: menu-engineering UX-redesign |
| **Advocacy** | Verwijst collega's, plaatst Insta over zijn workflow | Mond-tot-mond, social, NL-catering-community | Mobiel | Trots, eigenaarschap | Geen referral-flow, geen "share my menu"-feature | H2: referral-programma, H3: public showcase-pagina's |

### Ecosysteem-relaties

```
WhatsApp/Email aanvraag ──┐
                          ├──> [BBQ Architect] ──> PDF + iDEAL-link ──> Klant
Telefoon-aanvraag ────────┘                  │
                                             ├──> Moneybird (factuur)
                                             ├──> Mollie (betaling)
                                             ├──> Resend (email)
                                             └──> Supabase Realtime (multi-device)
```

### Kritieke handoff-punten (waar UX kan breken)

| Handoff | Risico | UX-mitigatie |
|---|---|---|
| WhatsApp → offerte-wizard | Tekst plakken werkt niet of geeft slechte parse | AI-parser met "wat ik zag" preview vóór submit |
| Offerte-PDF → klant | Klant opent op telefoon, knop te klein | iDEAL-knop minimaal 56px, contrasterend brand-kleur |
| Event-dag mobiel → keuken-tablet | Realtime-update onzichtbaar | Toast op tablet "Marieke heeft uren toegevoegd" |
| Bon-foto → voorraad | OCR-fout silent | Confirm-stap met bewerk-mogelijkheid (al live in 7394d17) |
| Trial-eind → paid | Klant verliest data-zicht zonder waarschuwing | Email-cohort 7/3/1 dagen voor eind + read-only mode na vervalt |

---

## 4. Design principles

> Zes opinionated principes. Bij conflict wint het lagere nummer.

---

### P1 — Field beats fancy

**Statement.** Als een design-keuze conflicteert tussen "ziet er prachtig uit op desktop" en "werkt met handschoenen op tablet", winnen de handschoenen.

**Rationale.** Onze klanten verdienen geld in keuken, op events, in vrachtwagen. Een knop die op 1080p-monitor zalig oogt maar op 320px-mobiel niet aantikbaar is, kost ze een offerte.

**Toepassing.** HACCP-knop is 64px hoog, ook op desktop (lichte ergonomie-cost), niet 32px. Sidebar collapses naar bottom-nav < 1024px.

**Counter-example.** Glasmorph-overlay met 3 niveaus blur op offerte-list. Mooi op 5K, onleesbaar op iPhone-SE in zonlicht.

**Trade-off.** Sommige micro-interactions voelen op desktop "te basic". Acceptabel — desktop-power-users gebruiken Cmd+K (P3), ze hebben de oogstrelers niet nodig.

---

### P2 — De gebruiker is geen QA-tester

**Statement.** Geen onafgemaakte feature in productie. Geen "alpha"-badge die problemen excuseert. Geen "werkt soms" — werkt altijd of staat uit.

**Rationale.** Sam runt dit solo, kan geen bug-storm opvangen. Eén kapotte knop in HACCP en een Pro-klant vertrouwt het niet meer voor zijn NVWA-controle.

**Toepassing.** Feature-flag default = uit voor nieuwe features. Eerst Berkhout dogfood (zie [Pijler 5](./product-strategy.md)), dan beta-cohort, dan algemeen. Half-werkend = niet gemerged.

**Counter-example.** "Voorraad-AI staat in alpha, kan kleine glitches hebben." → Nee. Of het werkt en is live, of het is uit.

**Trade-off.** Trager publiceren. Acceptabel — het alternatief (refund-storm + reputatieschade in NL-niche) is duurder.

---

### P3 — Eén pad voor 80%, escape voor 20%

**Statement.** Voor elke kerntaak is er één duidelijke standaardroute (de happy-path) plus één keyboard-shortcut/power-route (Cmd+K, sneltoetsen). Geen tien manieren om hetzelfde te doen.

**Rationale.** Cognitive load = churn-bron-1. Marieke heeft geen energie voor "mag ik het zo of zo?". Jeroen wel — die geef je Cmd+K, maar versluierd, niet als hoofdpad.

**Toepassing.** "Nieuwe offerte" = altijd via dezelfde knop top-right. Cmd+K is power-shortcut, niet vervangend pattern.

**Counter-example.** "Nieuwe offerte" via dashboard-knop, sidebar-knop, agenda-rechtsklik, en email-bottom-link. Vier paths = vier onderhouds­locaties.

**Trade-off.** Power-users vinden het soms restrictief. Cmd+K is hun ontsnappingsroute.

---

### P4 — AI suggereert, mens beslist

**Statement.** Geen AI-actie wordt automatisch verstuurd, geboekt of gepubliceerd. Altijd een preview-stap met "akkoord" en "anders".

**Rationale.** Pitmaster Studio is uniek — maar één gehallucineerde offerte naar een klant is reputatie-eindspel. Bovendien: NL-caterers zijn hands-on, willen *zien* wat ze sturen.

**Toepassing.** Offerte-wizard toont concept-PDF en kostprijsmarge vóór "Stuur". Recipe-AI biedt 3 varianten, niet één. Allergeen-detectie geeft confidence-score + bron.

**Counter-example.** "AI heeft je offerte verzonden" als toast na sluiten van wizard. Nooit.

**Trade-off.** Eén extra confirmstap = ~5 seconden langer. Acceptabel — vertrouwenswinst overstijgt tijdverlies.

---

### P5 — Stilte op succes, luid op fout

**Statement.** Routine-acties (opslaan, status wijzigen, navigeren) geven minimale feedback (toast 2s, lichte animatie). Fouten en datakritische acties (verzenden, betalen, verwijderen) bevestigen expliciet.

**Rationale.** Een Pro-klant doet 50 saves per dag. Vijftig modals = onbruikbaar. Maar één foute factuur = klantverlies.

**Toepassing.** Save = toast bottom-right. Stuur factuur = inline preview + confirm-dialog. Verwijder klant = typ-bevestiging.

**Counter-example.** Modal "Offerte opgeslagen!" elke keer. Of: stille `DELETE` zonder bevestiging.

**Trade-off.** Inconsistente bevestigings-density. Acceptabel — proportioneel aan risico.

---

### P6 — Nederlands eerst, ook in micro-copy

**Statement.** Elk woord in de UI is Nederlands en past bij de toon van een NL-caterier (informeel, direct, geen jargon). "Klant" niet "customer", "verzonden" niet "verstuurd uitstaand".

**Rationale.** NL-fit is onze moat ([Pijler 2](./product-strategy.md)). Engelse buttons in een Nederlandse app voelen geleend.

**Toepassing.** Label-conventie: kort, imperatief ("Verstuur"), geen werkwoord-vorm ("Sending"), geen technische termen ("Submit"). Foutmeldingen: vriendelijk ("Hmm, dat lukte niet — probeer opnieuw of check je internet").

**Counter-example.** "Submit", "Cancel", "Loading…", "Error: validation failed".

**Trade-off.** Internationale uitbreiding wordt een i18n-project (H3+). Voor H1–H2 prima.

---

## 5. Opportunity framework

### Bron van opportunities

- **Research-findings:** [`UX-AUDIT-REPORT.md`](../UX-AUDIT-REPORT.md) — 81% touch-violations, 1 ARIA-attr
- **Competitive gaps:** [`competitor-benchmark.md`](./competitor-benchmark.md) — bottom-nav, glove-keuken, AI-flow
- **Problem frames:** [`problem-frames.md`](./problem-frames.md) — SF-1 t/m SF-12
- **Klant-feedback (intern, Berkhout):** UI-friction op event-dag, wens voor offline-modus

### Impact × Effort matrix (12 frames + UX-pillars)

```
HIGH IMPACT
   │
   │  STRATEGIC BETS              QUICK WINS
   │  ─────────────────           ─────────────────
   │  • SF-2 Field-modus HACCP     • UX-fix: 44px buttons globaal
   │  • SF-3 Event-dag bottom-nav  • UX-fix: muted contrast 4.32→4.7
   │  • SF-1 AI offerte-wizard v2  • UX-fix: focus-ring globaal
   │  • SF-7 Onboarding-flow       • Lokaal Tailwind ipv CDN
   │                               • aria-label op interactive
   │
   │  FILL-INS                    DEPRIORITIZE
   │  ─────────────────           ─────────────────
   │  • SF-9 Offline event-dag     • SF-12 White-label (H3)
   │  • SF-8 Eigen-domein portal   • Multi-language (H3+)
   │  • SF-10 Referral-programma   • API-public (H3)
   │  • Command-palette (Cmd+K)    • PWA install-prompt
   │
LOW IMPACT
   └────────────────────────────────────────────
       LOW EFFORT                HIGH EFFORT
```

### RICE-scoring (top 12 opportunities)

R = Reach (klanten/wk geraakt), I = Impact (1–3), C = Confidence (%), E = Effort (Sam-weken).
**Score = (R × I × C) / E**, hoger = beter.

| # | Opportunity | R | I | C | E | RICE | Horizon |
|---|---|---:|---:|---:|---:|---:|---|
| O1 | **44px-targets globaal + bottom-nav mobiel** | 50 | 3 | 95% | 2 | **71,3** | H1 |
| O2 | **A11y-bundle (ARIA, focus-ring, skip-link)** | 50 | 2 | 90% | 1,5 | **60** | H1 |
| O3 | **Tailwind lokaal + token-systeem** | 50 | 2 | 95% | 2 | **47,5** | H1 |
| O4 | **Onboarding-checklist (SF-7)** | 50 | 3 | 80% | 1,5 | **80** | H1 |
| O5 | **HACCP glove-modus (SF-2)** | 30 | 3 | 90% | 2 | **40,5** | H1 |
| O6 | **Offerte-wizard mobiel-redesign (SF-1)** | 50 | 3 | 80% | 3 | **40** | H1 |
| O7 | **Event-dag bottom-nav (SF-3)** | 30 | 3 | 85% | 2 | **38,3** | H1 |
| O8 | **Cmd+K command-palette** | 20 | 2 | 75% | 1 | **30** | H2 |
| O9 | **Offline event-dag (SF-9)** | 20 | 2 | 60% | 4 | **6** | H2 |
| O10 | **Referral-programma UI (SF-10)** | 50 | 1 | 70% | 1 | **35** | H2 |
| O11 | **Eigen-domein klant-portal (SF-8)** | 10 | 2 | 65% | 3 | **4,3** | H2 |
| O12 | **Multi-location-switcher (SF-12)** | 5 | 3 | 70% | 4 | **2,6** | H3 |

> Reach = aantal H1-klanten dat 1× per week impact ervaart (50 = alle H1-doel-klanten).

### Prioriteitsthema's

**Thema A — Field-readiness (H1, mei–juli 2026):** O1 + O2 + O5 + O7 = mobiel/tablet werkt eindelijk in keuken/event. Zonder dit geen Pro-tier-launch.

**Thema B — Onboarding-conversie (H1, mei–juni 2026):** O4 + O6 = trial-klant verstuurt eerste offerte < 60 min, voorspelt retentie.

**Thema C — Design-system fundering (H1, doorlopend):** O3 = removes technical debt, versnelt alle latere werk.

**Thema D — Power-user differentiation (H2, aug–okt 2026):** O8 + O10 = "deze app voelt premium".

**Thema E — Schaal-mogelijkheden (H3, 2027):** O11 + O12 = enterprise-tier rechtvaardigt €249.

### Dependencies

- **O3 (Tailwind lokaal) blokkeert O1+O2** — zonder token-systeem zijn 44px-fixes inconsistent.
- **O4 (onboarding) hangt af van demo-data-loader** (zie [`execution-playbook.md` §B](./execution-playbook.md)).
- **O7 (event-bottom-nav) hangt af van O1 (44px globaal)** — anders inconsistent.
- **O9 (offline) vereist Supabase-sync-strategie** — eerst R&D-spike (1 week) voordat we E inschatten.

---

## 6. Metrics — HEART-framework

> Deze sectie maakt de UX-meting expliciet. De **business north-star** ("offertes/klant/week") staat in [`product-strategy.md`](./product-strategy.md). Hieronder de UX-laag erboven: voelen onze ontwerpkeuzes goed, en hoe meten we dat?

### HEART-tabel

| Categorie | Metric | Definitie | Bron | Target H1 | Target H2 | Frequentie |
|---|---|---|---|---|---|---|
| **Happiness** | NPS (3-mnds cohort) | Klassieke NPS-vraag in-app | In-app survey | ≥ 30 | ≥ 40 | Maandelijks |
| **Happiness** | UI-friction-score | "Hoe makkelijk was deze taak?" 1–5 na top-3-flows | Micro-survey | ≥ 4,0 | ≥ 4,3 | Per flow per 50 events |
| **Engagement** | Avg sessies/week/klant | Unieke sessies in laatste 7 dagen | Activation-events | ≥ 4 | ≥ 6 | Wekelijks |
| **Engagement** | Top-feature adoption (HACCP) | % Pro-klanten die HACCP ≥ 1×/week gebruikt | activation_events | ≥ 50% | ≥ 70% | Wekelijks |
| **Adoption** | Activation rate (1e offerte < 60 min) | % nieuwe accounts die binnen 60 min een offerte verstuurt | onboarding_events | ≥ 40% | ≥ 60% | Per cohort |
| **Adoption** | Mobile-MAU / total-MAU | Aandeel klanten die ≥ 1×/maand mobiel inlogt | session-events | ≥ 50% | ≥ 70% | Maandelijks |
| **Retention** | Maand-2 retention | % klanten actief in maand 2 na sign-up | cohort-tabel | ≥ 70% | ≥ 80% | Per cohort |
| **Retention** | Churn (paid) | Maandelijkse churn van betalende klanten | billing-events | < 7% | < 5% | Maandelijks |
| **Task success** | Offerte-flow completion | % gestarte offertes dat verstuurd wordt | activation_events | ≥ 75% | ≥ 85% | Wekelijks |
| **Task success** | HACCP-log error-rate | % logs die corrigerend bewerkt moeten | logs-tabel | < 5% | < 2% | Wekelijks |

### Metric-template (per nieuwe feature)

```yaml
feature: <naam>
hypothesis: "<gebruiker> zal <gedrag> doen, omdat <reden>"
heart_categories: [Adoption, Task success]
metric_primary:
  name: <metric>
  baseline: <huidige waarde>
  target: <doelwaarde>
  measurement_window: <2 weken / 1 cohort / etc>
metric_secondary: [...]
counter_metric: <wat we niet kapot mogen maken>
data_source: <tabel / event / survey>
review_at: <YYYY-MM-DD>
```

**Voorbeeld — O1 (44px-targets):**

```yaml
feature: 44px-targets globaal + bottom-nav mobiel
hypothesis: Mobiele klanten zullen 30% vaker offertes vanaf telefoon versturen
            omdat tappen niet meer mist
heart_categories: [Engagement, Task success]
metric_primary:
  name: Mobile offertes/klant/week
  baseline: 0,3 (gemeten bij Berkhout, 2026-04)
  target: 1,0
  measurement_window: 4 weken na rollout
counter_metric: Desktop offertes/klant/week — mag niet dalen
data_source: activation_events.event_type='offerte_sent' + device-tag
review_at: 2026-07-01
```

### Welke we expliciet niet meten (en waarom)

| Metric | Waarom niet |
|---|---|
| Time-on-site | Hogere tijd ≠ betere UX. Bij ons: korter is beter. |
| Pageviews | Routine-werk genereert pageviews; geen kwaliteitssignaal. |
| Bounce-rate | Marketing-metric, niet productie-metric. |
| Click-through-rate | We hebben geen ads. |

### Instrumentatie — wat moet getrackt zijn

| Tabel | Wat | Status |
|---|---|---|
| `activation_events` | Event-driven (signup, first_offerte_started, first_offerte_sent, first_factuur, etc) | Schema bestaat, wiring 70% — zie [`execution-playbook.md` §B](./execution-playbook.md) |
| `onboarding_events` | Per-stap voortgang in onboarding-checklist | Schema TBD — H1-actie |
| `ai_usage` | Cost + latency + success per AI-call | ✅ Live |
| `error_logs` | Server- en client-errors | ✅ Live |
| (toe te voegen) `device_sessions` | Device-type per sessie voor mobile-MAU | H1-actie |

---

## 7. Design brief (consolidatie)

> Deze brief is het anker bij elk design-review en sprint-planning in H1. Zonder mismatches met deze brief: geen merge.

### 7.1 Project overview

**Project naam.** BBQ Architect v2 — UX-kwaliteitslaag H1.

**Summary.** Bring the existing feature-set tot WCAG 2.1 AA + field-readiness niveau, zodat 50 NL-BBQ-caterers de app op telefoon, tablet en desktop met vertrouwen kunnen gebruiken. Geen nieuwe features in scope; bestaande features op niveau brengen.

**Business context.** Product is feature-compleet op 90% van benchmark. UX-audit (2026-04-07) toont 81% touch-violations en 1 ARIA-attribuut. Zonder fixes geen Pro-tier-launch ([`product-strategy.md`](./product-strategy.md) M1: 10 betalende klanten in 6 mnd).

**Stakeholder.** Sam Berkhout (founder/dev). Berkhout Catering als test-tenant.

### 7.2 Problem statement

**Wat.** Mobiele en tablet-ervaring is onder werkbare standaard. Specifiek:
- 81% van interactieve elementen < 44px op 320px-mobiel
- 94 tekstelementen < 12px op mobiel
- 1 ARIA-attr op hele dashboard, 0 focus-rings
- 7 ad-hoc breakpoints, 3 styling-systemen door elkaar
- HACCP-scherm: 94% touch-violations — onbruikbaar in keuken

**Wie.** Marieke, Jeroen, Lars (zie [`product-strategy.md` §3](./product-strategy.md)). Jeroen meest geraakt (HACCP + tablet-keuken).

**Bewijs.** [`UX-AUDIT-REPORT.md`](../UX-AUDIT-REPORT.md) 2026-04-07 + responsive-screenshots.

**Gevolg.** Pro-klanten zien BBQ Architect als "mooi op laptop, klote in keuken" → trial-conversie blijft onder 30%, churn boven 10%.

### 7.3 Target audience

| Persona | Primaire context | Devices | UX-prioriteit |
|---|---|---|---|
| Marieke (Starter) | Vrijdagavond keukentafel | iPhone | Offerte-flow mobiel |
| Jeroen (Pro) | Zaterdag prep + maandag analytics | Tablet keuken + laptop kantoor | HACCP glove-modus + menu-engineering |
| Lars (Enterprise) | Multi-locatie kantoor | Laptop + tablet on-site | Dashboard + tenant-switch |

### 7.4 Goals & success criteria

| # | Doel | Metric | Baseline | Target | Bewijslast |
|---|---|---|---|---|---|
| G1 | Touch-targets compliant | % elementen ≥ 44px op 320px | 19% | ≥ 95% | Audit-rerun na elke prio-flow |
| G2 | WCAG 2.1 AA op kritieke flows | Pass-rate (axe-core) | < 30% | 100% op offerte/HACCP/event | axe-CI in workflow |
| G3 | Mobile activation | % accounts die mobiel 1e offerte verstuurt | 8% | ≥ 35% | activation_events |
| G4 | UI-friction-score top-3 flows | 1–5 schaal | TBD (baseline H1-week-1) | ≥ 4,0 | Micro-survey |
| G5 | Design-system consolidatie | # styling-systemen | 3 | 1 (Tailwind-tokens) | Code-audit |

**Qualitative indicators.**
- Berkhout-keuken-team rapporteert "het werkt nu met handschoenen" (zonder prompting).
- Eerste betalende klant zegt unprompted "voelt vlot op telefoon".
- Designer-screenshots laten zich vergelijken met Stripe/Linear zonder gêne.

### 7.5 Scope & constraints

**In scope (H1).**
- Token-systeem (Tailwind lokaal, single source of truth)
- 44px-globale-baseline + bottom-nav mobiel
- A11y-bundle (ARIA, focus, skip-link, contrast-fix)
- HACCP glove-modus + offerte-wizard mobile-redesign
- Onboarding-checklist + activation-instrumentatie
- Event-dag bottom-nav

**Out of scope (H1).**
- Nieuwe modules (alles wat niet in 12 SF-frames staat)
- Multi-language / i18n
- White-label / multi-location (H3)
- Native mobile app (PWA-only)
- Aspirational features uit benchmark (Cmd+K → H2)

**Constraints.**
- **Tijd:** Sam ~10–20 uur/week + Claude. Per O-item ≤ 2 weken realisatie.
- **Tech:** Next.js 16, React 19, Tailwind, Supabase. Geen platform-switch.
- **Brand:** Dark-theme + glass-morph blijft. Brand-kleur #FFBF00. Aesthetics zijn moat ([benchmark](./competitor-benchmark.md)).
- **Legaal:** WCAG 2.1 AA voor compliance + GDPR. NVWA-HACCP-compliance per HACCP-feature.
- **Budget:** Geen externe designers/dev in H1.

### 7.6 Context & inputs

**Research-base.**
- [UX-AUDIT-REPORT.md](../UX-AUDIT-REPORT.md) — 2026-04-07
- [competitor-benchmark.md](./competitor-benchmark.md) — 10 concurrenten
- [problem-frames.md](./problem-frames.md) — SF-1..12

**Competitieve referenties.**
- Best-in-class field UX: Toast POS, Square for Restaurants
- Best-in-class catering: Tripleseat (US) — feature-set, niet UX
- Aspirational: Linear, Stripe Dashboard, Notion

**Eerdere pogingen.** Dashboard-redesign (commit `10059d3`) is goed voorbeeld van direction; replicate quality op andere modules.

### 7.7 Deliverables & timeline

| Milestone | Deliverable | Deadline | Review |
|---|---|---|---|
| M0 — Tokens | Tailwind lokaal, design-tokens in `tailwind.config.ts`, snippet-bibliotheek | 2026-05-15 | Code-review + visual-diff op 3 schermen |
| M1 — A11y-bundle | ARIA + focus + skip-link + contrast-fix gemerged op alle schermen | 2026-05-31 | axe-CI groen + screen-reader-test (VoiceOver) |
| M2 — Mobile-baseline | 44px overal + bottom-nav + responsive-system 4 breakpoints | 2026-06-15 | Audit-rerun, target G1 ≥ 95% |
| M3 — Field-flows | HACCP glove-modus + event-dag bottom-nav + offerte mobile-wizard | 2026-07-01 | Berkhout-team feedback + UI-friction-score |
| M4 — Onboarding | Checklist + activation-events + demo-data-loader | 2026-07-15 | Eerste 3 externe testers, target G3 ≥ 35% |
| M5 — Launch-readiness | Alle G1–G5 op target, marketing-pagina live | 2026-07-31 | Go/no-go-meeting |

**Review-cadans.** Wekelijks tijdens sprint-end (vrijdag) — visual-walkthrough, metric-update, blokker-check.

### 7.8 Sign-off

Brief is leidend voor H1 (mei–juli 2026). Deviation vereist update aan dit document plus impact-analyse op M0–M5.

| Rol | Naam | Sign-off |
|---|---|---|
| Founder/PM/Dev | Sam Berkhout | _toegezegd_ |
| Designer-AI | Claude | _toegezegd_ |
| Test-tenant | Berkhout Catering keuken-team | _wekelijks via dogfooding_ |

---

## Bijlagen

### A. Mapping UX-pillars ↔ product-pillars

| UX-pillar (dit doc §1) | Product-pillar ([`product-strategy.md` §4](./product-strategy.md)) | Verband |
|---|---|---|
| UX-1 Field-first responsive | P4 Self-service als tijdsbescherming | Self-service eist mobile-first onboarding |
| UX-2 Eén-tap-actie | P3 Feature-breedte, geen explosie | Beperkte features ⇒ simpelere flows |
| UX-3 AI suggereert, mens beslist | P1 AI als vermenigvuldiger | Vertrouwen = adoptie |
| UX-4 Stille a11y | P6 Meten ≫ gokken | A11y-checks zijn meetbaar |
| UX-5 Eén design-systeem | P3 + P4 | Onderhoud = tijdsbescherming |
| UX-6 Snelheid is gevoel | P5 Eet je eigen hondenvoer | Sam voelt sloomheid eerst |

### B. Open vragen voor H1-kickoff

1. Bottom-nav = 4 of 5 destinations? (Voorstel: 5 — Dashboard, Events, Offertes, Inbox, Meer)
2. PWA-install-prompt H1 of H2? (Voorstel: H2 — eerst stable, dan installable)
3. Cmd+K — H1 als power-user-feature of H2? (Voorstel: H2 — wacht op IA-stabilisatie)
4. Wie test screen-reader-flow? (Voorstel: extern A11y-consultant 1× in M1, ~€500)
5. Hoe valideren we G4 (UI-friction-score)? Hoe roll-out micro-survey in-app? (Voorstel: 1 vraag, max 1×/week per gebruiker)

---

**Laatste update:** 2026-04-28
**Volgende review:** na M0 (2026-05-15) of bij koerswijziging in [`product-strategy.md`](./product-strategy.md).
