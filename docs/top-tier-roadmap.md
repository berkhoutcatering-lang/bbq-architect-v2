# BBQ Architect — Top-tier roadmap

**Laatst bijgewerkt:** 2026-05-18
**Doel:** één plek met de app-brede sweep — gaten dichten, USP maximaliseren, elke workflow naar 100%. Per hub: audit · concurrenten · Golden Pillars · gaps (P0/P1/P2) · ready-to-build code chunks met file:line. Cross-cutting: ⌘K · AI · theming · onboarding · CWV 2026 · security. Plus 8 workflow-audits, NL-stack risico's, Anthropic kosten per tier, en een 12-weken plan met Definition of Done per P0.
**Doelgroep lezer:** Mathijs (bouwer, geen coder) als beslisser; Claude (deze sessie) als uitvoerder; toekomstige tenants als impliciete getuige.
**Werkwijze:** dit document wordt incrementeel opgebouwd. Per turn voegen we één hub of laag toe. Sam mag onderbreken.

---

## Inhoudsopgave

> Status legenda: ⬜ nog niet geschreven · 🟦 in deze update toegevoegd · ✅ af in eerdere update

| § | Sectie | Status | Geschat |
|---|---|---|---|
| 0 | Executive summary (10 zinnen) | ⬜ → komt in turn 12 | ~50 regels |
| 1 | Wat is de app vandaag (één-pager) | 🟦 turn 1 | ~80 regels |
| 2 | Hub: Vandaag — `/` | 🟦 turn 1 | ~450 regels |
| 3 | Hub: Plannen — `/agenda` | ⬜ turn 2 | ~400 regels |
| 4 | Hub: Verkoop — `/offertes` | ⬜ turn 3 | ~400 regels |
| 5 | Hub: Menu & Recepten — `/gerechten` (bedoelde IA: "Inspiratie Bibliotheek") | ⬜ turn 4 | ~450 regels |
| 6 | Hub: Voorraad — `/voorraad` | ⬜ turn 5 | ~400 regels |
| 7 | Hub: Geld — `/financien` | ⬜ turn 6 | ~450 regels |
| 8 | Hub: Systeem — `/systeem` (bedoelde IA: "Instellingen & Hulp") | ⬜ turn 7 | ~400 regels |
| 9 | Cross-cutting: ⌘K command palette | ⬜ turn 8 | ~150 regels |
| 10 | Cross-cutting: AI ChatPanel + Vraag-Rook + AIStudio refactor | ⬜ turn 8 | ~200 regels |
| 11 | Cross-cutting: white-label theming 5×8 | ⬜ turn 8 | ~150 regels |
| 12 | Cross-cutting: onboarding + activation funnel | ⬜ turn 9 | ~200 regels |
| 13 | Cross-cutting: CWV 2026 performance + bundle | ⬜ turn 9 | ~150 regels |
| 14 | Cross-cutting: OWASP 2025 + LLM 2025 + RLS evil-tenant + ASVS v5 | ⬜ turn 9 | ~200 regels |
| 15 | Workflow-audit WF3-10 (offerte→akkoord→factuur, HACCP-dag, prep-week, bon-extract, pricelist-mutation, event-reflectie, boekhouder-maandpakket) | ⬜ turn 10 | ~500 regels |
| 16 | Anthropic kosten-projectie per tier | ⬜ turn 11 | ~120 regels |
| 17 | NL-stack risico-matrix (Mollie · Moneybird · Peppol · BTW · AVG · ViDA · HACCP) | ⬜ turn 11 | ~130 regels |
| 18 | 12-weken master-plan met DoD per P0 | ⬜ turn 12 | ~400 regels |

**Conventies in dit document:**
- File:line-refs zijn klikbaar: `src/app/page.tsx:42` opent direct die regel.
- P0 = blocker voor v1.0 launch · P1 = fix voor v1.0 · P2 = nice-to-have voor v1.1.
- Pillars hebben altijd: ERRC-class (eliminate/reduce/raise/create) · Kano-class (Must-be/Performance/Delighter) · Anti-Pillar · meetbare acceptance criterion.
- **Anti-Pillar = expres anders dan concurrenten** (we doen X niet hoewel Tripleseat/Caterease/Toast het wel doet, en hier is waarom). Een feature die concurrenten WEL hebben en wij niet = gewone gap (P1/P2), géén Anti-Pillar. Per feedback 2026-05-18: "doe wat de concurrentie ook doet, duidelijk en niet te moeilijk, heel logisch dat is belangrijkste".
- "PROPOSED — geen code-anchor" betekent dat de file/functie nog niet bestaat; we slaan een paal.
- Ready-to-build chunks zijn paste-ready Next.js 15+/React 19/Supabase/Anthropic SDK code, geen pseudocode.

---

## § 1. Wat is de app vandaag — één-pager

> **Voor wie 't te druk heeft om docs/ux-master.md te lezen.** 14 bullets, max 1 zin per stuk.

1. **BBQ Architect is een SaaS voor catering-eigenaren** (Pro-tier €99/mnd, Starter €49, Enterprise €249). Eén klant gebruikt 'm vol (Hop & Bites, Schoonoord); de Pro-tier launch met 3 externe cateriers staat gepland.
2. **7 hubs in de sidebar**: Vandaag (`/`), Plannen (`/agenda`), Verkoop (`/offertes`), Menu & Recepten (`/gerechten`), Voorraad (`/voorraad`), Geld (`/financien`), Systeem (`/systeem`). Plus een verborgen ⌘K palette met 35+ sneltoegangen.
3. **Multi-tenant met Supabase RLS** — elke tabel heeft `org_id`, policies wrappen rond `(select auth.uid())`. 50+ migraties tot 2026-05-18 (laatste: HACCP v3 met foto-evidence en correctieve maatregelen).
4. **AI is overal ingebed** in 18+ API-routes: offerte-wizard (Sonnet), allergen-detect (Sonnet), bon-extract (Sonnet vision), recept-generate (Sonnet), chef-coach (Haiku streaming), pricelist-extract (Sonnet vision batch-25), klantgesprek-summary (Haiku). Geen rechtstreekse Opus-calls.
5. **Stack**: Next.js 15+ App Router, React 19 (Client Components dominant), TypeScript (veel `any`), Tailwind v4 met `@theme`, shadcn/ui, BlockNote, cmdk, TanStack Table, FullCalendar, react-pdf. Vercel hosting, Mollie iDEAL, Moneybird OAuth, Resend voor email.
6. **Klant ziet alleen `/q/[id]`** — public offerte-portal met e-sign en iDEAL-aanbetaling. Custom branding via 5-tokens × 8-presets (logo, kleur, font, radius, accent).
7. **HACCP is uniek sterk** — `/haccp/field` is gebouwd voor Lars (chef, tablet, handschoenen, fel zonlicht). v3 heeft foto-evidence, correctieve maatregelen, trends. Geen concurrent in NL doet dit met deze diepte.
8. **Hub-and-spoke IA** — sidebar krimpt naar 7 hubs, elke hub-page heeft horizontale sub-tabs. Power-users gebruiken ⌘K. Onboarding zit als checklist in Vandaag (PersonaQuiz + 4 dismissable items).
9. **Activation tracking** met `track()` helper en migration `011_activation_events.sql`. 5 KPI-targets: Time-to-First-Offerte <15min, Activation-rate ≥40%, D7-retention ≥50%, First-Real-Offerte-Sent ≥70%, AI-adoptie ≥30%.
10. **Dood-en-levend gebied**: `/offerte-editor` is dood (gebruik wizard op `/offertes`); `/recepten` is gemergerd met `/gerechten` per migration 014; `/bedenker`, `/menu-engineering`, `/inspiratie`, `/marges`, `/materieel`, `/logistiek`, `/event-planner` bestaan als folders maar zijn niet in de sidebar.
11. **Pijnpunten die de Master noemt**: 313 hardcoded `borderRadius` in 42 files buiten dashboard · AIStudio.tsx (1172r) + ai/ChatPanel.tsx (668r) zouden samen naar ~1000r kunnen · AI-context cross-page persist (5-min localStorage TTL) is nog niet gebouwd · `/admin/funnel` mist 5 KPI's + funnel-grafiek · generieke demo-data seed-API ontbreekt.
12. **Drie personas** (in prio): Lars (chef, event-dag, tablet+handschoenen) → Pro-tier (onbekende caterier, mix desktop+mobiel) → Mathijs (eigenaar+bouwer+admin). Bij conflict wint Lars van Pro wint van Mathijs.
13. **NL-eisen**: BTW splits 9% (food) / 21% (service+alcohol) / 0% (B2B reverse) · UBL/Peppol BIS 3.0 voor B2G nu, voor B2B vanaf 1 juli 2030 via ViDA · KHN-HACCP met NVWA-aanlevering · AVG export (Article 15/20) via `/instellingen/data-export`.
14. **Wat ons blokkeert om top-tier te worden**: Vandaag-hub doet 13 client-side Supabase-queries in serie (waterfall = LCP-risico op trage netwerken); types zijn `any` over de hele app (geen Supabase-generated types overal in gebruik); RLS-policies zijn niet allemaal getest met evil-tenant scenarios; Anthropic cost-cap heeft alleen soft-cap geïmplementeerd (geen hard-cap kill-switch); en de meeste workflows lopen tegen "70%-af demo's" aan — UI bedraad, backend niet, of andersom.

---

## § 2. Hub: Vandaag — `/`

> **Wat is dit?** De control-tower. Eén-scherm-overzicht wat er vandaag speelt: volgend event, KPI's, aandachtspunten, AI-prompts, onboarding-checklist. Geen tab-bar — alles op één pagina.
> **Bedoelde IA-naam** (ux-master.md): "Vandaag". Geen rename nodig.
> **Persona-fit**: Mathijs daily check (desktop+tablet), Pro-tier eerste schermbeeld na login, Lars rare keer op desktop.

### § 2.a Audit — huidige staat

**Hoofd-file**: [src/app/page.tsx](src/app/page.tsx) — 885 regels, `'use client'` Client Component, geen Server Component split.

**Sub-componenten** (12 files in `src/components/dashboard/today/`, samen 2839r):

| Component | File | Regels | Wat doet 't |
|---|---|---|---|
| GreetingStrip | [today/GreetingStrip.tsx](src/components/dashboard/today/GreetingStrip.tsx) | 108 | "Goedemorgen Mathijs" + tijd + brand-logo |
| EventHero | [today/EventHero.tsx](src/components/dashboard/today/EventHero.tsx) | 475 | Volgend event-kaart: gasten, ppp, omzet, locatie, status, 5 actie-knoppen |
| AIQuickPrompts | [today/AIQuickPrompts.tsx](src/components/dashboard/today/AIQuickPrompts.tsx) | 152 | Knoppenrij voor recipe-generate, chef-coach, etc. |
| AIPromptDrawer | [today/AIPromptDrawer.tsx](src/components/dashboard/today/AIPromptDrawer.tsx) | 274 | Slide-out drawer met geselecteerde AI-prompt |
| BusinessCharts | [today/BusinessCharts.tsx](src/components/dashboard/today/BusinessCharts.tsx) | 341 | Revenue mix (pie) + 6-month bar + supplier-spend top-5 |
| KPIStrip | [today/KPIStrip.tsx](src/components/dashboard/today/KPIStrip.tsx) | 253 | 8 KPI-tiles met trend-pijlen en `href`-deeplinks |
| CompactDagbriefing | [today/CompactDagbriefing.tsx](src/components/dashboard/today/CompactDagbriefing.tsx) | 331 | Smalle status-tegels (vooral mobiel) |
| AttentionPanel | [today/AttentionPanel.tsx](src/components/dashboard/today/AttentionPanel.tsx) | 192 | Urgente rode kaarten: conflicten, verlopen facturen, lage marge |
| BriefingTimeline | [today/BriefingTimeline.tsx](src/components/dashboard/today/BriefingTimeline.tsx) | 317 | Tijdlijn met deadlines en kritieke events |
| QuickActions | [today/QuickActions.tsx](src/components/dashboard/today/QuickActions.tsx) | 148 | FAB-buttons: nieuw event, nieuwe offerte, AI |
| PromptChart | [today/PromptChart.tsx](src/components/dashboard/today/PromptChart.tsx) | 211 | Visualisatie binnen AIPromptDrawer |
| WeatherStrip | [today/WeatherStrip.tsx](src/components/dashboard/today/WeatherStrip.tsx) | 37 | **Niet geïmporteerd door page.tsx — dead code kandidaat** |

**Data helpers** (6 files in `src/lib/today/`, samen 635r):

| File | Regels | Wat |
|---|---|---|
| [today/kpi-trends.ts](src/lib/today/kpi-trends.ts) | 159 | 9 trend-functies (week-over-week deltas) |
| [today/revenue-mix.ts](src/lib/today/revenue-mix.ts) | 48 | Revenue per event-type (BBQ/buffet/diner) |
| [today/revenue-buckets.ts](src/lib/today/revenue-buckets.ts) | 75 | 6-month rolling revenue |
| [today/supplier-spend.ts](src/lib/today/supplier-spend.ts) | 81 | Top-N suppliers naar uitgaven |
| [today/timeline-items.ts](src/lib/today/timeline-items.ts) | 219 | Briefing-tijdlijn-rendering |
| [today/event-type-heuristic.ts](src/lib/today/event-type-heuristic.ts) | 53 | Type-detectie uit event-veld |

**Supabase-tabellen geraakt** (via 13 `useSupabase()` hooks in [page.tsx:45-57](src/app/page.tsx:45)):

`events` · `facturen` · `offertes` · `inventory` · `prep_suggestions` · `gerechten` · `prep_tasks` · `klanten` · `bonnen` · `leveranciers` · `courses` · `event_allergies` · `marge_alerts`

**Server Actions / API**: GEEN op deze pagina. Alle mutaties (event aanmaken, prompt openen) gaan via sub-componenten of het EventWizard. AI-routes worden vanuit AIPromptDrawer aangeroepen.

**AI-touchpoints**:
- AIQuickPrompts → opent AIPromptDrawer met een `QuickPrompt`
- AIPromptDrawer → `/api/chef-coach`, `/api/recipe-generate`, etc. (afhankelijk van prompt-type)
- AI-context **niet gepersisteerd** cross-page (memory `project_ai_v2_chatpanel.md` noemt dit als open)

**Activation tracking** ([page.tsx:91-96](src/app/page.tsx:91), [:213-217](src/app/page.tsx:213)):
- `trackOnce('signup_completed', ...)` bij eerste user-render
- `trackOnce('first_offerte_sent', ...)` als ≥1 offerte status `verzonden|geaccepteerd` heeft

**Onboarding integratie** ([page.tsx:205-210](src/app/page.tsx:205)):
- `OnboardingChecklist` met 4 items: heeft logo / heeft eigen gerecht / heeft echte offerte / heeft verstuurde offerte
- `PersonaQuiz` 3-vragen modal voor nieuwe users

**Conflict-detection** via `detectAllConflicts()` → toont in AttentionPanel.

**Code-rotting & status-flags**:

| Item | File:line | Status | Notitie |
|---|---|---|---|
| `/* eslint-disable @typescript-eslint/no-explicit-any */` | [page.tsx:1](src/app/page.tsx:1) | 🟡 | Type-safety opt-out — 100+ `any` casts in deze file |
| WeatherStrip.tsx geïmporteerd? | grep: nee | ❌ dead | 37r unused |
| Client-side data waterfall | [page.tsx:45-57](src/app/page.tsx:45) | 🟡 | 13 sequential queries, geen prefetch |
| Cache Components | n/a | ❌ | Next 16 feature niet geactiveerd |
| Suspense boundaries | n/a | ❌ | Hele pagina valt of staat met laatste query |
| Streaming UI | n/a | ❌ | Geen partial pre-render |
| Mobile audit `EventHero` | [today/EventHero.tsx](src/components/dashboard/today/EventHero.tsx) | 🟡 | ux-master.md zegt "stack op mobile" gedaan — handmatige Lars-test ontbreekt |

**Feature-matrix** voor Vandaag-hub:

| Feature | Status | Bewijs |
|---|---|---|
| Greeting + tijd | ✓ live | [page.tsx:80-89](src/app/page.tsx:80) |
| EventHero met 5 actie-knoppen | ✓ live | [today/EventHero.tsx](src/components/dashboard/today/EventHero.tsx) |
| 8 KPI-tiles met deeplink | ✓ live | [page.tsx:248-320](src/app/page.tsx:248) |
| Revenue mix + 6-month + supplier | ✓ live | [page.tsx:234-237](src/app/page.tsx:234) |
| AttentionPanel (conflicts, overdue invoices, lage marge) | ✓ live | [today/AttentionPanel.tsx](src/components/dashboard/today/AttentionPanel.tsx) |
| BriefingTimeline | ✓ live | [today/BriefingTimeline.tsx](src/components/dashboard/today/BriefingTimeline.tsx) |
| AIQuickPrompts + drawer | ✓ live | [today/AIPromptDrawer.tsx](src/components/dashboard/today/AIPromptDrawer.tsx) |
| QuickActions FAB | ✓ live | [today/QuickActions.tsx](src/components/dashboard/today/QuickActions.tsx) |
| OnboardingChecklist + PersonaQuiz | ✓ live | [page.tsx:205-210](src/app/page.tsx:205), modal in body |
| Activation tracking (2 events) | ✓ live | [page.tsx:91](src/app/page.tsx:91), [:213](src/app/page.tsx:213) |
| WeatherStrip integratie | ❌ ontbreekt | file bestaat, import niet |
| Server Component data fetching | ❌ ontbreekt | hele pagina is Client |
| Suspense streaming | ❌ ontbreekt | geen `<Suspense>` boundaries |
| Type-safety (geen `any`) | 🟡 half | `any`-cast everywhere |
| Cache Components (Next 16) | ❌ ontbreekt | `cacheComponents` flag niet aan |
| AI-context cross-page persist | ❌ ontbreekt | memory bevestigt |
| Conflict-deeplink (AttentionPanel → `/agenda?conflict=X`) | 🟡 half | toont conflict, klik gaat naar `/agenda` zonder filter |
| Mobile Lars-test event-dag | ❌ ontbreekt | ux-master.md noemt dit als open |

### § 2.b Competitor sweep — top-3 "dagelijks dashboard"

Bron: `docs/competitor-benchmark.md` + ux-benchmark.md.

| Concurrent | Killer-feature op Vandaag-laag | Wij vs hen |
|---|---|---|
| **Tripleseat** ("Mission Control") | Eén dashboard met: today's events + tasks-due + lead-velocity + revenue-snapshot. Strakke widget-bibliotheek, sleepbaar. | Wij: 8 KPI's + AI-prompts + onboarding ingebed. Tripleseat heeft GEEN AI-prompts en GEEN onboarding-checklist. **Wij winnen op AI + onboarding.** Zij winnen op widget-aanpasbaarheid. |
| **Toast POS** | Daily-sales hero op tablet: 88px-knoppen, één-tap actions, kitchen-view-toggle. Field-ready. | Wij: desktop-first hero, mobile-stack op 390px werkt maar niet getest met Lars. **Zij winnen op field-ready dashboard.** Hun model: bottom-nav 5 items + dashboard alleen sales-KPI's, geen onboarding. Wij hebben rijker dashboard maar minder field-fit. |
| **Linear** | ⌘K command palette + "My Cycle" dashboard met today's active issues + inbox + recent. Pure desktop-power-user-experience. Geen mobile-cruft. | Wij hebben ⌘K (CommandPalette.tsx, 35+ items) + Vandaag-laag. Linear's dashboard is leger maar sneller (server-rendered + streaming). **Zij winnen op LCP/INP.** Wij winnen op informatiedichtheid. |

**Onze unieke moats vs deze drie**:
1. Allergen-cascade in AttentionPanel (geen catering-SaaS doet dit goed)
2. Conflict-detection over events × prep × HACCP simultaan
3. AI-prompts ingebakken in dashboard zelf (niet als losse "AI Assistant"-knop)

**Waar ze ons verslaan**:
1. Toast: field-ready (Lars-fit op tablet onder zonlicht)
2. Linear: speed (LCP <1s, server-rendered)
3. Tripleseat: widget-aanpasbaarheid (wij hebben hardgecodeerde sectie-volgorde)

### § 2.c Golden Pillars — Vandaag-hub

> 5 pillars. Elk getoetst aan WHO/WHAT/WHEN/HOW-MUCH + ERRC + Kano + Anti-Pillar.

**Pillar 1 — "Open app → zie wat speelt in 2 seconden"** _(raise/Performance)_
- WHO: Pro-tier eigenaar, 1ste login van de dag, op laptop of tablet.
- WHAT: LCP <1.5s op simulated 4G (Lighthouse `Slow 4G + 4× CPU throttle`), INP <100ms (75e percentiel), CLS <0.05.
- WHEN: elke login, niet alleen de eerste.
- HOW-MUCH: SLO 95% van loads onder budget per Vercel Real User Metrics.
- **Anti-Pillar**: geen "skeleton-screen carrousel" die data simuleert — als data niet binnen 1.5s er is, FAIL en escalate.
- **Acceptance**: Lighthouse score ≥95 voor `/` op mobile, Vercel RUM toont p75 LCP <1500ms over 7 dagen.

**Pillar 2 — "AI-prompts zijn context-aware, niet generiek"** _(raise/Delighter)_
- WHO: Mathijs of Pro-tier owner met een actief event in EventHero.
- WHAT: AIQuickPrompts toont 3 prompts die bij het hero-event passen (bv "Maak briefing voor [Eventnaam]", "Bedenk vegetarische variant voor [Hoofdgerecht]", "Stuur klant herinnering voor [Datum]").
- WHEN: zodra heroEvent is geladen.
- HOW-MUCH: ≥40% van prompts wordt klik-doorgevoerd binnen 7 dagen (event-tracking).
- **Anti-Pillar**: geen "Schrijf een verhaaltje over BBQ" — alle prompts zijn workflow-actie-gericht.
- **Acceptance**: `ai_quick_prompt_clicked` event-rate ≥40% van prompt-impressies in `/admin/funnel`.

**Pillar 3 — "Activation-checklist staat in m'n workflow, niet in een aparte tour"** _(create/Delighter)_
- WHO: Pro-tier net-na-signup (dag 0-7).
- WHAT: OnboardingChecklist + PersonaQuiz visibel op Vandaag, dismissable, auto-progress.
- WHEN: tot alle 4 items af zijn óf user expliciet dismisst.
- HOW-MUCH: ≥40% activation-rate over 7 dagen.
- **Anti-Pillar**: geen modal-tour, geen "klik hier voor rondleiding"-CTA — ingebakken in dashboard.
- **Acceptance**: `activation_completed` events ≥40% van `signup_completed` events binnen 7d.

**Pillar 4 — "Conflict zien is conflict klikken — geen losse `/conflicts` pagina"** _(eliminate/Must-be)_
- WHO: Mathijs of Lars die conflict tegen het lijf loopt (overlap event-prep, dubbel-allergeen, materieel-tekort).
- WHAT: AttentionPanel rode kaart → één klik naar de plek waar conflict resolveerbaar is met deep-link query-param (bv `/agenda?conflict=ev42`).
- WHEN: zodra `detectAllConflicts()` iets vindt.
- HOW-MUCH: 100% van conflict-kaarten heeft een `href` met query-param die de filter activeert.
- **Anti-Pillar**: geen `/conflicts` route als losse pagina; geen modal-bevestiging.
- **Acceptance**: alle 7 conflict-types in `conflictDetection.ts` hebben `href + query` die de target-page direct laat focussen.

**Pillar 5 — "Vandaag toont status, niet KPI-totalen voor de kwartaalrapportage"** _(eliminate/Must-be)_
- WHO: dagelijkse gebruiker.
- WHAT: KPI's gaan over wat NU urgent is (volgend event, deze week, open offertes, lage stock). Q2-omzet hoort op `/financien/dashboard`, niet op `/`.
- WHEN: altijd.
- HOW-MUCH: max 8 KPI-tiles, elk met `trend` voor week-over-week. Niets met "YTD".
- **Anti-Pillar**: geen "totaal omzet sinds oprichting", geen heatmap over 12 maanden op `/`.
- **Acceptance**: code-review: geen YTD/Q* berekeningen in `src/app/page.tsx` of `src/lib/today/*`.

### § 2.d Gap-list met severity

**P0 — blocker voor v1.0 launch** (en/of "100%-af features"-regel):

| # | Gap | Impact | Uren | File:line |
|---|---|---|---|---|
| P0.1 | **Server Component split + 13-query waterfall opgelost** | LCP-risico op trage netwerken; Pillar 1 niet haalbaar zonder. | 6 | [src/app/page.tsx:42](src/app/page.tsx:42) → opsplitsen naar Server `page.tsx` + Client `_components/DashboardClient.tsx` |
| P0.2 | **AIQuickPrompts context-aware naar heroEvent maken** | Pillar 2 niet ingelost. Generieke prompts schaden adoption-rate. | 3 | [today/AIQuickPrompts.tsx](src/components/dashboard/today/AIQuickPrompts.tsx) — props verrijken met `heroEvent` en server-prompt-templates gebruiken |
| P0.3 | **Type-safety pass over `page.tsx` + sub-components** | `any` blokkeert auto-complete + introduceert runtime-bugs (zien we al bij `o.menu_selectie || []`-patronen). | 3 | [src/app/page.tsx:1](src/app/page.tsx:1) — eslint-disable weghalen, types uit Supabase-generated `database.types.ts` of `src/types/db.ts` |
| P0.4 | **AttentionPanel conflict-kaarten met query-param deep-link** | Pillar 4 niet ingelost — klik op conflict gaat naar `/agenda` zonder filter. | 2 | [today/AttentionPanel.tsx](src/components/dashboard/today/AttentionPanel.tsx) + [src/app/agenda/page.tsx](src/app/agenda/page.tsx) (query-param filter) |

**P1 — fix voor v1.0** (release-blocker zodra Pro-tier launch dichterbij komt):

| # | Gap | Impact | Uren |
|---|---|---|---|
| P1.1 | Suspense boundaries om KPIStrip, BusinessCharts, BriefingTimeline | KPI's renderen pas als laatste query klaar is. | 1 |
| P1.2 | WeatherStrip dead code verwijderen of integreren | 37r ongebruikte code. Memory-feedback "Sam wil 100%-af" zegt verwijder. | 0.5 |
| P1.3 | Mobile Lars-test event-dag op `/` | Pillar 1 voor field-context — ux-master.md noemt expliciet "Lars-test live op event-dag". | 4 (incl. fixes) |
| P1.4 | OnboardingChecklist auto-collapse na 100% complete | Anders blijft 'm groot ook als alles af is. | 0.5 |
| P1.5 | KPIStrip "tone-zwart" voor `default` tonen consistente design | Sommige cards hebben subtiele kleur-flickers per render. | 1 |
| P1.6 | `signup_completed` tracking deduplicaat — `trackOnce` met user-id-suffix moet voorkomen dat dezelfde user 2× tracked wordt na re-mount | Activation-funnel noise. | 0.5 |

**P2 — nice-to-have voor v1.1**:

| # | Gap | Impact | Uren |
|---|---|---|---|
| P2.1 | Cache Components migration (Next 16, `cacheComponents: true`) | Sub-1s LCP op herhaal-bezoeken. Wacht op Next 16 stable. | 8 |
| P2.2 | Widget-volgorde aanpasbaar per user (Tripleseat-pattern) | Power-user wens; weinig payoff voor Pro-tier-launch. | 8 |
| P2.3 | Vandaag-tour voor brand-new users (1× per signup, dismissable) | Of doen we via OnboardingChecklist alleen — overweeg. | 4 |

### § 2.e Ready-to-build chunks

> Paste-ready code, geen pseudocode. Hard rules toegepast.

#### Chunk P0.1 — Server Component split + parallel queries

**Doel**: `/` wordt Server Component die alle 13 queries `Promise.all`'d parallel doet, daarna doorgeeft aan een client-shell voor interactiviteit (drawer, wizard, FAB).

**Architectuur**:

```
src/app/
├── page.tsx                  ← Server Component (NEW: replaces current)
└── _components/
    └── DashboardClient.tsx   ← Client Component (NEW: pakt huidige inhoud minus de useSupabase-hooks)
```

**Nieuwe `src/app/page.tsx`** (Server Component, paste-ready):

```tsx
import { Suspense } from 'react';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import DashboardClient from './_components/DashboardClient';
import { DashboardSkeleton } from './_components/DashboardSkeleton';

export const dynamic = 'force-dynamic'; // Vandaag toont real-time data, geen ISR

export default async function DashboardPage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  // org_id uit JWT (zie hard rule 4 — RLS doet de tenant-isolatie)
  const orgId = user.app_metadata?.org_id as string | undefined;
  if (!orgId) redirect('/welkom?reason=no-org');

  // Parallel fetch — niet sequentieel, geen waterfall
  const [
    events, facturen, offertes, inventory, prepSuggestions, gerechten,
    prepTasks, klanten, bonnen, leveranciers, courses, eventAllergies, margeAlerts,
  ] = await Promise.all([
    supabase.from('events').select('*').limit(200),
    supabase.from('facturen').select('*').limit(200),
    supabase.from('offertes').select('*').limit(200),
    supabase.from('inventory').select('*').limit(500),
    supabase.from('prep_suggestions').select('*').eq('status', 'pending'),
    supabase.from('gerechten').select('*').limit(500),
    supabase.from('prep_tasks').select('*').limit(500),
    supabase.from('klanten').select('*').limit(500),
    supabase.from('bonnen').select('*').limit(200),
    supabase.from('leveranciers').select('*').limit(100),
    supabase.from('courses').select('*').limit(500),
    supabase.from('event_allergies').select('*').limit(200),
    supabase.from('marge_alerts').select('*').eq('status', 'open'),
  ]);

  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <DashboardClient
        userId={user.id}
        orgId={orgId}
        initialData={{
          events: events.data ?? [],
          facturen: facturen.data ?? [],
          offertes: offertes.data ?? [],
          inventory: inventory.data ?? [],
          prepSuggestions: prepSuggestions.data ?? [],
          gerechten: gerechten.data ?? [],
          prepTasks: prepTasks.data ?? [],
          klanten: klanten.data ?? [],
          bonnen: bonnen.data ?? [],
          leveranciers: leveranciers.data ?? [],
          courses: courses.data ?? [],
          eventAllergies: eventAllergies.data ?? [],
          margeAlerts: (margeAlerts.data ?? []).filter(a => a.status === 'open'),
        }}
      />
    </Suspense>
  );
}
```

**Nieuw `src/app/_components/DashboardClient.tsx`** (Client Component, paste-ready skelet):

```tsx
'use client';

import { useState, useEffect, useMemo } from 'react';
import type { Event, Offerte, Inventory, /* ... */ } from '@/types/db';
import { useSupabase } from '@/lib/useSupabase'; // alleen voor realtime-updates, niet voor initial-load
import GreetingStrip from '@/components/dashboard/today/GreetingStrip';
// ... rest van imports zoals nu

type Props = {
  userId: string;
  orgId: string;
  initialData: {
    events: Event[];
    facturen: Offerte[]; // etc — types uit @/types/db (P0.3)
    // ...
  };
};

export default function DashboardClient({ userId, orgId, initialData }: Props) {
  // useSupabase wordt nu géén initial-fetch maar realtime-subscriber:
  const events = useSupabase('events', initialData.events, { skipInitialFetch: true });
  // ... rest van de logica zoals nu

  return (
    <>
      <GreetingStrip /* ... */ />
      {/* ... */}
    </>
  );
}
```

**`src/lib/supabase/server.ts`** (als die nog niet bestaat — paste-ready):

```ts
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { cache } from 'react';

export const createSupabaseServerClient = cache(async () => {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name) { return cookieStore.get(name)?.value; },
        set(name, value, options: CookieOptions) {
          try { cookieStore.set({ name, value, ...options }); } catch { /* RSC ignore */ }
        },
        remove(name, options: CookieOptions) {
          try { cookieStore.set({ name, value: '', ...options }); } catch { /* RSC ignore */ }
        },
      },
    },
  );
});
```

**`useSupabase` extension** — voeg `skipInitialFetch?: boolean` toe aan [src/lib/useSupabase.ts](src/lib/useSupabase.ts) zodat client-hook alleen realtime-subscribet zonder onbedoeld dubbele fetch.

**Verwacht resultaat**: LCP daalt van ~3-4s (waterfall) naar <1.5s (parallel server-side fetch + streaming) op Slow 4G + 4× CPU throttle.

#### Chunk P0.2 — Context-aware AIQuickPrompts

**Doel**: prompts pakken `heroEvent` en genereren actie-prompts die bij dat event passen.

**Wijziging** in [src/components/dashboard/today/AIQuickPrompts.tsx](src/components/dashboard/today/AIQuickPrompts.tsx):

```tsx
type Props = {
  heroEvent: EventHeroEvent | null;
  onSelect: (prompt: QuickPrompt) => void;
};

export default function AIQuickPrompts({ heroEvent, onSelect }: Props) {
  // Pillar 5 (memory: AI-prompts ingebakken identity) — Hop & Bites context wordt
  // server-side toegevoegd in /api/chef-coach etc., NOOIT in user-facing prompt-tekst.
  const prompts = useMemo<QuickPrompt[]>(() => {
    if (!heroEvent) {
      return [
        { id: 'generic-recipe',   title: 'Bedenk nieuw gerecht',     route: '/bedenker' },
        { id: 'generic-checklist',title: 'Wat moet ik vandaag doen?', route: '/api/today-briefing' },
        { id: 'generic-margin',   title: 'Welke offerte heeft lage marge?', route: '/offertes?filter=lowmargin' },
      ];
    }
    return [
      {
        id: 'event-briefing',
        title: `Maak briefing voor ${heroEvent.name}`,
        route: '/api/today-briefing',
        payload: { eventId: heroEvent.id },
      },
      {
        id: 'event-veggie-variant',
        title: `Vegetarische variant voor hoofdgerecht`,
        route: '/api/recipe/ai-improve',
        payload: { eventId: heroEvent.id, constraint: 'vegetarian' },
      },
      {
        id: 'event-reminder',
        title: `Stuur klant herinnering — ${heroEvent.daysAway}d`,
        route: '/api/klant-reminder',
        payload: { eventId: heroEvent.id },
        cta: heroEvent.daysAway <= 7 ? 'urgent' : 'default',
      },
    ];
  }, [heroEvent]);

  return (
    <div className="grid gap-2 md:grid-cols-3">
      {prompts.map(p => (
        <button
          key={p.id}
          onClick={() => onSelect(p)}
          className="min-h-[44px] rounded-md border bg-white px-3 py-2 text-left text-sm hover:bg-stone-50"
        >
          {p.title}
        </button>
      ))}
    </div>
  );
}
```

**Server-side**: `/api/today-briefing` en `/api/recipe/ai-improve` moeten Hop & Bites context **ingebakken** hebben — geen "wie ben je?"-prompt (memory `feedback_prompt_identity_baked_in.md`).

Voor de API-route (PROPOSED — verifieer dat `/api/today-briefing/route.ts` bestaat voor uitvoering):

```ts
// app/api/today-briefing/route.ts (sample, controleer of dit overeenkomt met huidige route)
import { z } from 'zod';
import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import Anthropic from '@anthropic-ai/sdk';
import { trackAiUsage } from '@/lib/ai/track-usage';

const Schema = z.object({ eventId: z.string().uuid() });

export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const body = await req.json();
  const parsed = Schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error }, { status: 400 });

  // RLS doet tenant-isolatie — geen extra org-check nodig dankzij policies
  const { data: event } = await supabase.from('events').select('*').eq('id', parsed.data.eventId).single();
  if (!event) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
  const res = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 800,
    system: [
      {
        type: 'text',
        text: 'Je bent de keuken-co-piloot voor Hop & Bites, een NL BBQ-catering. Schrijf briefings kort, werkwoord-eerst, Nederlands. Sentence-case. Geen Engels.',
        cache_control: { type: 'ephemeral' as const },
      },
    ],
    messages: [{
      role: 'user',
      content: `Genereer event-briefing. Event-data: ${JSON.stringify(event)}`,
    }],
  });

  await trackAiUsage({
    orgId: user.app_metadata?.org_id,
    feature: 'today-briefing',
    model: 'claude-haiku-4-5-20251001',
    inputTokens: res.usage.input_tokens,
    outputTokens: res.usage.output_tokens,
    cacheReadInputTokens: res.usage.cache_read_input_tokens ?? 0,
    cacheCreationInputTokens: res.usage.cache_creation_input_tokens ?? 0,
  });

  return NextResponse.json({
    briefing: res.content[0]?.type === 'text' ? res.content[0].text : '',
  });
}
```

#### Chunk P0.3 — Type-safety pass

**Stap 1** — genereer/refresh Supabase types:
```bash
# alleen lokaal — geen migratie, geen prod-actie
npx supabase gen types typescript --project-id <project> --schema public > src/types/database.types.ts
```

**Stap 2** — maak `src/types/db.ts` als applicatie-facing aliases:

```ts
import type { Database } from './database.types';

type Tables = Database['public']['Tables'];

export type Event       = Tables['events']['Row'];
export type Offerte     = Tables['offertes']['Row'];
export type Factuur     = Tables['facturen']['Row'];
export type Inventory   = Tables['inventory']['Row'];
export type Gerecht     = Tables['gerechten']['Row'];
export type Klant       = Tables['klanten']['Row'];
export type Bon         = Tables['bonnen']['Row'];
export type Leverancier = Tables['leveranciers']['Row'];
export type Course      = Tables['courses']['Row'];
export type EventAllergy   = Tables['event_allergies']['Row'];
export type MargeAlert     = Tables['marge_alerts']['Row'];
export type PrepSuggestion = Tables['prep_suggestions']['Row'];
export type PrepTask       = Tables['prep_tasks']['Row'];
```

**Stap 3** — verwijder `/* eslint-disable @typescript-eslint/no-explicit-any */` uit [src/app/page.tsx:1](src/app/page.tsx:1) en vervang elke `: any` met de juiste type-import. Loop iteratief tot `pnpm typecheck` groen is.

#### Chunk P0.4 — Conflict-kaart deep-link met query-param

**Wijziging** in [src/components/dashboard/today/AttentionPanel.tsx](src/components/dashboard/today/AttentionPanel.tsx):

```tsx
// AttentionItem hrefBuilder helper
function buildConflictHref(item: AttentionItem): string {
  switch (item.type) {
    case 'event_conflict':   return `/agenda?conflict=${item.eventId}`;
    case 'overdue_invoice':  return `/financien?tab=facturen&overdue=${item.invoiceId}`;
    case 'low_margin':       return `/offertes?filter=lowmargin&id=${item.offerteId}`;
    case 'allergen_pending': return `/gerechten/allergen-queue?event=${item.eventId}`;
    case 'stock_low':        return `/voorraad?filter=below_min`;
    case 'unbooked_receipt': return `/factuur-lezer?status=pending`;
    case 'prep_overdue':     return `/keuken/kookbord?status=overdue`;
    default:                 return '#';
  }
}
```

In de target-pages (bv `app/agenda/page.tsx`) lees query-param met `useSearchParams()` en filter de view erop.

### § 2.f Verificatie-checklist Vandaag-hub

Bij merge van bovenstaande chunks:

- [ ] `pnpm typecheck` groen (P0.3 voltooid)
- [ ] `pnpm build` geen errors
- [ ] Lighthouse mobile op `/` ≥95 voor Performance + ≥95 voor Accessibility (P0.1, Pillar 1)
- [ ] Vercel RUM p75 LCP <1500ms over 7 dagen (Pillar 1 acceptance)
- [ ] Klik elke AttentionPanel-kaart → target-page focust direct op het juiste item (P0.4, Pillar 4)
- [ ] `ai_quick_prompt_clicked` event-rate ≥40% in `/admin/funnel` na 14 dagen (Pillar 2)
- [ ] `activation_completed` rate ≥40% (Pillar 3, vereist demo-data seed voor Pro-tier — zie Systeem-hub turn 7)
- [ ] RLS-test: maak test-tenant B aan, log in als B, open `/` — geen data van tenant A zichtbaar. **Evil-tenant-test**: probeer `eq('id', 'tenant-A-event-uuid').single()` vanuit tenant B → 0 rows. (Zie cross-cutting security § 14.)

---

> **Einde § 2 Vandaag-hub.** Volgende turn: § 3 Plannen-hub (`/agenda` + `/events/[id]/*`).

---

## § 3. Hub: Plannen — `/agenda` + `/events/*`

> **Wat is dit?** Het hart van de operatie. Agenda met events, prep-deadlines en persoonlijke afspraken; per event een command-center (`/events/[id]/hub`), een service-modus voor de keuken (KDS, `/events/[id]/service`), HACCP-veldmodus (`/events/[id]/field` of `/haccp/field`), en post-event reflectie. Plus een tweede prep-KDS via `/keuken/kookbord`.
> **Bedoelde IA-naam** (ux-master.md): "Plannen & Events". Sidebar zegt "Plannen". Sub-tabs op agenda-pagina: Agenda · Events · Klantgesprek · Prep · Service · HACCP.
> **Persona-fit**: Mathijs plant (desktop), Lars draait de service-modus (tablet, handschoenen, zonlicht), Pro-tier eigenaar combineert plannen + bezetting.

### § 3.a Audit — huidige staat

**Hoofd-pages**:

| Page | File | Regels | Type |
|---|---|---|---|
| Agenda-overzicht | [src/app/agenda/page.tsx](src/app/agenda/page.tsx) | 886 | Client (`'use client'`), custom calendar-render |
| Events-lijst | [src/app/events/page.tsx](src/app/events/page.tsx) | 70 | List-view |
| Event-detail (shell) | [src/app/events/\[id\]/page.tsx](src/app/events/[id]/page.tsx) | 21 | Redirect/shell |
| Event command-center | [src/app/events/\[id\]/hub/page.tsx](src/app/events/[id]/hub/page.tsx) | 1308 | Mega-orchestrator |
| Event service (KDS) | [src/app/events/\[id\]/service/page.tsx](src/app/events/[id]/service/page.tsx) | 1374 | Fullscreen kitchen display |
| Event service plattegrond | [src/app/events/\[id\]/service/plattegrond/page.tsx](src/app/events/[id]/service/plattegrond/page.tsx) | - | Floor-plan tab |
| Event veldmodus (HACCP per event) | [src/app/events/\[id\]/field/page.tsx](src/app/events/[id]/field/page.tsx) | 332 | HACCP scoped op event |
| Event reflectie | [src/app/events/\[id\]/reflectie/page.tsx](src/app/events/[id]/reflectie/page.tsx) | 254 | Post-event debrief |
| HACCP overzicht | [src/app/haccp/page.tsx](src/app/haccp/page.tsx) | - | HACCP records-overzicht |
| HACCP veldmodus (zelfstandig) | [src/app/haccp/field/page.tsx](src/app/haccp/field/page.tsx) | - | **DUBBELING met `/events/[id]/field`** |
| Keuken-overzicht | [src/app/keuken/page.tsx](src/app/keuken/page.tsx) | - | Prep-overzicht |
| Keuken kookbord (prep KDS) | [src/app/keuken/kookbord/page.tsx](src/app/keuken/kookbord/page.tsx) | - | Prep-station-display, ander dan service-KDS |

**Sub-componenten** (`src/components/events/`, `src/components/kds/`, `src/components/service/`):

| Component | File | Regels | Wat |
|---|---|---|---|
| EventEditor | [events/EventEditor.tsx](src/components/events/EventEditor.tsx) | 360 | Event-aanmaken/bewerken-form |
| CoursesEditor | [events/CoursesEditor.tsx](src/components/events/CoursesEditor.tsx) | 337 | Gangen + menu-selectie per event |
| AllergiesEditor | [events/AllergiesEditor.tsx](src/components/events/AllergiesEditor.tsx) | 209 | Per-event allergieën tag-editor |
| KdsTopStrip | [kds/KdsTopStrip.tsx](src/components/kds/KdsTopStrip.tsx) | - | KDS status-strip bovenaan |
| KdsAlertStrip | [kds/KdsAlertStrip.tsx](src/components/kds/KdsAlertStrip.tsx) | - | KDS urgente meldingen |
| KdsCourseCard | [kds/KdsCourseCard.tsx](src/components/kds/KdsCourseCard.tsx) | - | KDS per-gang kaart |
| KdsBottomBar | [kds/KdsBottomBar.tsx](src/components/kds/KdsBottomBar.tsx) | - | KDS onderbalk acties |
| AIChefAssistant | [service/AIChefAssistant.tsx](src/components/service/AIChefAssistant.tsx) | - | Streaming chef-coach binnen service-modus |
| ServiceTabBar | [service/ServiceTabBar.tsx](src/components/service/ServiceTabBar.tsx) | - | Tab-bar (service / plattegrond / etc) |

**Supabase-tabellen geraakt** (16 stuks): `events` · `agenda_personal` · `event_reflecties` · `facturen` · `gangen` · `gerechten` · `haccp_records` · `inkooplijsten` · `inventory` · `klanten` · `offertes` · `pack_lists` · `prep_tasks` · `service_logs` · `settings` · `time_logs`.

**Server Actions / API**: `useAgendaPersonal` hook ([agenda/_components/useAgendaPersonal.ts](src/app/agenda/_components/useAgendaPersonal.ts)) wraps CRUD voor `agenda_personal`. Server Actions voor event-CRUD via `EventEditor` → directe Supabase-mutaties vanuit Client Component (geen `'use server'` actie). Dat is een gap — Zod-validatie + re-auth gebeurt niet op een centraal Server Action niveau.

**AI-touchpoints**:
- AI Insights button op agenda-hero ([agenda/page.tsx:71-91](src/app/agenda/page.tsx:71))
- `AIChefAssistant` in service-modus — streaming Haiku chef-coach
- HACCP-veldmodus heeft GEEN AI (alleen registratie)

**Code-rotting & status-flags**:

| Item | File:line | Status | Notitie |
|---|---|---|---|
| `serviceMockData.ts` import | [events/\[id\]/service/_data/serviceMockData.ts](src/app/events/[id]/service/_data/serviceMockData.ts) | 🔴 | **Mock-data wordt actief gebruikt in 1374r service-pagina — niet 100%-af.** Verifieer: `grep -n "serviceMockData" src/app/events/[id]/service/page.tsx` |
| Custom calendar-render (geen FullCalendar) | [agenda/page.tsx](src/app/agenda/page.tsx) | 🟡 | Bewuste keuze (bundle-size) — maar Resource-Timeline ontbreekt (zie Pillar 2 hieronder) |
| Inline `style={{...}}` overal | [agenda/page.tsx:73-86](src/app/agenda/page.tsx:73) | 🟡 | UX-P1 (3 styling-systemen door elkaar) — moet naar Tailwind v4 tokens |
| HACCP dubbeling | `/haccp/field` + `/events/[id]/field` | 🔴 | 2 routes voor dezelfde functie — beslis welke canonical |
| `eslint-disable @typescript-eslint/no-explicit-any` | [agenda/page.tsx:1](src/app/agenda/page.tsx:1) | 🟡 | Idem als Vandaag — type-safety opt-out |
| Demo-fallback bewust verwijderd | [agenda/page.tsx:46-48](src/app/agenda/page.tsx:46) | ✓ | Goed — real-DB-only |
| Custom hex-colors hardcoded (`#FFBF00`, `#c4a35a`) | [agenda/page.tsx:20-21](src/app/agenda/page.tsx:20) | 🟡 | Brand-tokens niet gebruikt — theming-mismatch |
| Mega-orchestrator hub (1308r) | [events/\[id\]/hub/page.tsx](src/app/events/[id]/hub/page.tsx) | 🟡 | Refactor-kandidaat, split per tab |
| Mega-orchestrator service (1374r) | [events/\[id\]/service/page.tsx](src/app/events/[id]/service/page.tsx) | 🟡 | Refactor-kandidaat |

**Feature-matrix**:

| Feature | Status | Bewijs |
|---|---|---|
| Agenda 3-kalender-mix (events/prep/personal) | ✓ live | [agenda/page.tsx:32-36](src/app/agenda/page.tsx:32) |
| Maand/week/lijst view-toggle | ✓ live | `Grid3x3, Columns3, List` icons in agenda |
| KPI's: upcoming30d, pipeline, conflicts, vrije weekenden, open prep | ✓ live | [agenda/page.tsx:67-70](src/app/agenda/page.tsx:67) |
| Persoonlijke events (modal) | ✓ live | [agenda/_components/PersonalEventModal.tsx](src/app/agenda/_components/PersonalEventModal.tsx) |
| Conflict-detection (`detectAllConflicts`) | ✓ live | [agenda/page.tsx:7](src/app/agenda/page.tsx:7) |
| Event command-center (hub) | ✓ live | [events/\[id\]/hub/page.tsx](src/app/events/[id]/hub/page.tsx) |
| KDS service-modus fullscreen | 🟡 mock | service-pagina draait op `serviceMockData.ts`, niet 100%-af |
| KDS service plattegrond | 🟡 half | files staan, _components/PlattegrondClient bestaat — eindstaat onbekend |
| HACCP veldmodus (scoped op event) | ✓ live | [events/\[id\]/field/page.tsx](src/app/events/[id]/field/page.tsx) |
| HACCP veldmodus (zelfstandig) | ✓ live | [haccp/field/page.tsx](src/app/haccp/field/page.tsx) — **dubbeling** |
| HACCP v3 (foto + correctief + trends) | ✓ live | migration `20260518192219_haccp_v3_photo_corrective_trends.sql` |
| Event reflectie post-event | ✓ live | [events/\[id\]/reflectie/page.tsx](src/app/events/[id]/reflectie/page.tsx) |
| Keuken kookbord (prep KDS) | ✓ live | [keuken/kookbord/page.tsx](src/app/keuken/kookbord/page.tsx) |
| iCal export | ❌ | geen `.ics`-route gevonden |
| Google Calendar sync | ❌ | genoemd in instellingen-integraties als TODO, niet operationeel |
| Conflict deep-link uit Vandaag (?conflict=X filter) | ❌ | binnenkomende link werkt nog niet, zie P0.4 in Vandaag-hub |
| Drag-resize event in calendar | ❌ | concurrent-pattern (Tripleseat/Caterease) — gap, zie P1.25 |
| Type-safety (geen `any`) | 🟡 half | `eslint-disable` aan top |
| Server Actions met Zod + re-auth | ❌ | EventEditor mutates direct via Client → Supabase, geen central Server Action |
| Tailwind v4 tokens (vs inline-style) | ❌ | 80%+ van agenda-page is inline-style |
| `style jsx` template literals | n/a | nog niet gespot maar moet gecheckt (memory: Turbopack hangs) |

### § 3.b Competitor sweep — top-3 "events + calendar + KDS"

| Concurrent | Killer-feature | Wij vs hen |
|---|---|---|
| **Tripleseat** + **Caterease** | Multi-resource calendar (rooms + staff + equipment in één view), drag-to-book, conflict-pop-up bij overlap. Klant-portal voor event-confirm. | Wij: 3-kalender mix maar één resource (events). Geen multi-resource-view. **Zij winnen op resource-bezetting.** Wij winnen op HACCP-koppeling per event. |
| **Toast Tables** (POS+KDS) | KDS fullscreen met 88px course-cards, "bump"-knop, route-naar-station, ticket-timer. Tablet-fit. Field-tested in 80k+ restaurants. | Wij hebben KDS service-pagina (1374r) + KdsCourseCard/AlertStrip/BottomBar/TopStrip componenten + AIChefAssistant. MAAR draait op `serviceMockData.ts` — niet productie. **Zij winnen op operational maturity.** Onze AIChefAssistant is uniek. |
| **eitje** (NL personeels-planning) | Schedule-view met staff-bezetting, ziekteafwezigheid, shift-swap. Geïntegreerd met loonadministratie. | Wij hebben `time_logs` + `/uren` PunchPanel maar geen staff-bezetting in agenda. **Zij winnen op personeel-planning.** Wij hebben Mathijs-kant (event-planning) sterker. |

**Onze unieke moats**:
1. HACCP-veldmodus diep + foto-evidence + correctief + trends (v3) — niemand
2. AI chef-coach in service-modus — geen catering-KDS heeft dit
3. Allergen-cascade per event automatisch (`event_allergies` tabel + `AllergiesEditor`)

**Waar ze ons verslaan**:
1. Tripleseat: multi-resource scheduling (rooms, staff, equipment)
2. Toast: KDS production-readiness (wij draaien nog op mock)
3. eitje: staff-bezetting in calendar

### § 3.c Golden Pillars — Plannen-hub

**Pillar 1 — "Plan een event in <60 seconden, of leg uit waarom niet"** _(raise/Performance)_
- WHO: Mathijs of Pro-tier owner met inkomende lead.
- WHAT: Vanuit `/agenda` → "Nieuw event" knop → minimale form (datum, gasten, locatie) → 6 velden, AI-vult de rest (event-type, ppp-suggestie obv historie).
- WHEN: bij elke nieuwe boeking.
- HOW-MUCH: P50 time-to-event-saved <60s.
- **Anti-Pillar**: geen multi-step wizard met 8 pages — alles op één scherm.
- **Acceptance**: `event_created` tot `event_saved` p50 <60s in `activation_events`.

**Pillar 2 — "Resource-conflicten zichtbaar voor je 'opslaan' klikt"** _(create/Delighter)_
- WHO: planner bij dubbelboeking-risico.
- WHAT: `detectAllConflicts()` draait realtime tijdens het invullen van datum — toont waarschuwing-banner bovenaan EventEditor als datum/locatie/staff overlapt.
- WHEN: zodra datum gewijzigd wordt in form.
- HOW-MUCH: 100% van conflict-types in `conflictDetection.ts` worden gedetecteerd vóór save.
- **Anti-Pillar**: geen iCal-write-back (calendars uit Outlook/Google blijven read-only ingelezen) — onderhoud-cost en sync-conflicten zijn niet de moeite waard voor de doelgroep. Drag-resize, multi-resource view en staff-availability doen we WEL want Tripleseat/Caterease/eitje doen dit ook (zie gap-list).
- **Acceptance**: code-review: `EventEditor.tsx` heeft een `useEffect` op `[datum, locatie]` die `detectAllConflicts` aanroept.

**Pillar 3 — "Event-hub = command-center, niet 7 losse pages"** _(raise/Performance)_
- WHO: Mathijs of Lars die 2 dagen vóór event alles voorbereidt.
- WHAT: `/events/[id]/hub` toont in één view: gasten, gangen, allergieën, prep-tasks, packlist, materieel, locatie, klant, marges. Tabs naast elkaar of stacked.
- WHEN: dagelijks rondom event-datum.
- HOW-MUCH: 0 page-loads tussen hub-tabs, alles client-side state.
- **Anti-Pillar**: geen losse `/event-allergies`, `/event-courses`, `/event-packlist` pages.
- **Acceptance**: alle hub-tabs <100ms toggle-tijd, geen URL-route-change tussen tabs.

**Pillar 4 — "KDS service-modus is field-ready: 88px knoppen, geen sleep, geen sidebar"** _(raise/Must-be)_
- WHO: Lars (chef) tijdens dienst.
- WHAT: `/events/[id]/service` is fullscreen, geen sidebar (middleware excludeert deze route — verifieer in [src/middleware.ts](src/middleware.ts)), 88px-knoppen per gang, course-card "bump" met 1 tap, kleur-coded status, timer-overdue alert.
- WHEN: tijdens service.
- HOW-MUCH: touch-targets ≥88px (Toast-pattern), font ≥18px, contrast WCAG AAA.
- **Anti-Pillar**: geen "edit"-modi tijdens service — alleen status-tap. Edits gaan via `/events/[id]/hub` voor service start.
- **Acceptance**: visuele regression-test (Playwright) toont alle interactive elements ≥88px op iPad-resolution 1024×768.

**Pillar 5 — "HACCP-veldmodus is de NL competitive moat — diep + offline + foto"** _(create/Delighter)_
- WHO: Lars op event-dag, mogelijk slechte WiFi.
- WHAT: `/events/[id]/field` werkt offline (`useSupabase` offline-queue), foto-evidence per registratie, correctieve maatregel-form, trend-grafiek per CCP. NVWA-export.
- WHEN: tijdens elk event waar food-prep plaatsvindt.
- HOW-MUCH: 100% van 7 CCP-types (koeling, verhitting, kruisbesmetting, schoonmaak, herkomst, allergenen, plagen) loggable. Foto-upload tot 5MB per registratie.
- **Anti-Pillar**: geen losse "HACCP-coach"-AI — registratie is feiten, geen suggesties.
- **Acceptance**: end-to-end test: maak HACCP-record offline (uitschakelen WiFi), foto erin, queue-up, online gaan, sync ✓. NVWA-export `.csv` downloadbaar vanuit `/haccp/page.tsx`.

### § 3.d Gap-list

**P0 — blocker voor v1.0**:

| # | Gap | Impact | Uren | File:line |
|---|---|---|---|---|
| P0.5 | **`serviceMockData.ts` vervangen met echte event-data fetch** | KDS-modus draait nu deels op mock — schendt "100%-af features". | 6 | [events/\[id\]/service/page.tsx](src/app/events/[id]/service/page.tsx) + [_data/serviceMockData.ts](src/app/events/[id]/service/_data/serviceMockData.ts) |
| P0.6 | **HACCP-veldmodus deduplicatie**: `/haccp/field` ↔ `/events/[id]/field` | Twee routes voor dezelfde functie — Lars verward, code-rot. Beslis canonical (recommend: `/events/[id]/field` is canonical, `/haccp/field` redirect naar selector). | 2 | [haccp/field/page.tsx](src/app/haccp/field/page.tsx) |
| P0.7 | **Server Actions voor event-CRUD** | EventEditor muteert direct vanuit Client → geen Zod-validatie, geen re-auth in actie zelf. OWASP A01 risk. | 4 | nieuw `src/app/events/actions.ts` met `'use server'` |
| P0.8 | **Agenda conflict-deep-link `?conflict=X` honoreren** | Pillar 4 in Vandaag-hub vereist dit — chain. | 1 | [agenda/page.tsx](src/app/agenda/page.tsx) — `useSearchParams()` toevoegen + filter |
| P0.9 | **Type-safety pass agenda + events** | Eslint-disable wegnemen, gebruik `@/types/db` aliases uit P0.3. | 3 | [agenda/page.tsx:1](src/app/agenda/page.tsx:1), [events/\[id\]/hub/page.tsx](src/app/events/[id]/hub/page.tsx), [events/\[id\]/service/page.tsx](src/app/events/[id]/service/page.tsx) |

**P1 — fix voor v1.0**:

| # | Gap | Impact | Uren |
|---|---|---|---|
| P1.7 | Inline-style → Tailwind v4 tokens in agenda-page (80%+ van file is `style={{...}}`) | UX-P1 styling-fragmentatie | 6 |
| P1.8 | Event-hub 1308r refactor: split per tab (Allergies/Courses/Pack/Service/Reflectie naar eigen files) | Onderhoudbaarheid | 6 |
| P1.9 | Event-service 1374r refactor: split per state (pre/during/post) | Onderhoudbaarheid + testbaarheid | 6 |
| P1.10 | **FullCalendar Resource Timeline** (events + staff + equipment) — Tripleseat / Caterease standaard | Pro-tier competitive — staff-bezetting visueel + drag-resize ingebakken | 16 |
| P1.11 | Realtime conflict-banner in EventEditor (Pillar 2 acceptance) | Pillar 2 niet ingelost zonder | 2 |
| P1.12 | KDS visual regression Playwright-test (Pillar 4 acceptance) | Garantie 88px touch-targets | 3 |
| P1.13 | NVWA HACCP-export `.csv` button op `/haccp` | Pillar 5 acceptance | 2 |
| P1.14 | Hardcoded brand-hex `#FFBF00`, `#c4a35a` → `--brand-tint-*` tokens | Theming-mismatch | 1 |
| P1.15 | iCal export `.ics` per event of voor hele agenda | Standaard catering-SaaS feature | 4 |

**P2 — nice-to-have**:

| # | Gap | Impact | Uren |
|---|---|---|---|
| P2.4 | Google Calendar sync (OAuth) | Genoemd in `/instellingen/integraties` als TODO; pro-tier wens | 8 |
| P1.25 | Drag-resize event op calendar | Tripleseat / Caterease doen dit standaard — komt mee met FullCalendar Resource Timeline (P1.10) | inbegrepen P1.10 |
| P2.6 | Staff-availability in calendar (eitje-pattern, links naar `time_logs`) | Pro-tier wens | 16 |
| P2.7 | Plattegrond-mode multi-event (nu per event 1 floorplan) | Voor enterprise-venue klanten | 12 |

### § 3.e Ready-to-build chunks

#### Chunk P0.5 — `serviceMockData.ts` wegvegen

**Stap 1** — confirm waar mock wordt gebruikt:

```bash
grep -rn "serviceMockData" src/app/events/\[id\]/service/
```

**Stap 2** — vervang import in `service/page.tsx` met Server-side fetch + props-door-prop pattern (analoog aan Vandaag P0.1):

```tsx
// app/events/[id]/service/page.tsx (Server Component shell — replaces 1374r Client mega-file)
import { createSupabaseServerClient } from '@/lib/supabase/server';
import ServiceClient from './_components/ServiceClient';

export default async function EventServicePage({
  params,
}: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();

  const [event, gangen, gerechten, prepTasks, serviceLogs, allergies] = await Promise.all([
    supabase.from('events').select('*').eq('id', id).single(),
    supabase.from('gangen').select('*').eq('event_id', id),
    supabase.from('gerechten').select('*'),
    supabase.from('prep_tasks').select('*').eq('event_id', id),
    supabase.from('service_logs').select('*').eq('event_id', id),
    supabase.from('event_allergies').select('*').eq('event_id', id),
  ]);

  if (!event.data) {
    return <div className="p-8 text-center">Event niet gevonden</div>;
  }

  return (
    <ServiceClient
      event={event.data}
      gangen={gangen.data ?? []}
      gerechten={gerechten.data ?? []}
      prepTasks={prepTasks.data ?? []}
      initialServiceLogs={serviceLogs.data ?? []}
      allergies={allergies.data ?? []}
    />
  );
}
```

**Stap 3** — bouw `_components/ServiceClient.tsx` (uitsplitsing van huidige 1374r-bestand). De huidige inhoud moet:
- alle mock-imports vervangen door props
- `useSupabase('service_logs', initialServiceLogs, { skipInitialFetch: true })` voor realtime updates
- props doorgeven aan `KdsTopStrip`, `KdsAlertStrip`, `KdsCourseCard`, `KdsBottomBar`

**Stap 4** — verwijder [_data/serviceMockData.ts](src/app/events/[id]/service/_data/serviceMockData.ts).

**Verificatie**: open `/events/<echte-id>/service` → KDS toont werkelijk-event-data, niet mock.

#### Chunk P0.6 — HACCP-veldmodus deduplicatie

**Beslissing**: `/events/[id]/field` is canonical (per-event scoped). `/haccp/field` wordt een **selector-page**: "Welk event?" → redirect.

**Nieuw `src/app/haccp/field/page.tsx`** (Server Component, paste-ready):

```tsx
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';

export default async function HaccpFieldSelectorPage() {
  const supabase = await createSupabaseServerClient();
  const today = new Date().toISOString().slice(0, 10);
  const horizon = new Date();
  horizon.setDate(horizon.getDate() + 7);
  const horizonIso = horizon.toISOString().slice(0, 10);

  const { data: events } = await supabase
    .from('events')
    .select('id, name, date, location')
    .gte('date', today)
    .lte('date', horizonIso)
    .order('date', { ascending: true });

  // Als er maar 1 event in venster zit → direct door
  if (events && events.length === 1) {
    redirect(`/events/${events[0].id}/field`);
  }

  return (
    <main className="min-h-screen p-6">
      <h1 className="text-2xl font-light mb-4">Kies event voor HACCP-veldmodus</h1>
      {(!events || events.length === 0) ? (
        <p className="text-stone-600">Geen events in komende 7 dagen.</p>
      ) : (
        <ul className="space-y-2">
          {events.map(e => (
            <li key={e.id}>
              <Link
                href={`/events/${e.id}/field`}
                className="block min-h-[88px] rounded-lg border bg-white p-4 text-lg hover:bg-stone-50"
              >
                <div className="font-semibold">{e.name}</div>
                <div className="text-sm text-stone-600">{e.date} · {e.location}</div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
```

**Verwijder** de oude inhoud van `/haccp/field/page.tsx` (de daadwerkelijke veldmodus-logica) — die wordt 1-op-1 gedupliceerd door `/events/[id]/field/page.tsx`. Lars-test op tablet bevestigt dat redirect snel genoeg is (<300ms).

#### Chunk P0.7 — Server Actions voor event-CRUD

**Nieuw `src/app/events/actions.ts`** (paste-ready):

```ts
'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '@/lib/supabase/server';

const EventSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1).max(200),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  guests: z.coerce.number().int().min(0).max(10_000),
  location: z.string().max(500).optional(),
  client_naam: z.string().min(1).max(200),
  basis_prijs_pp: z.coerce.number().nonnegative().optional(),
  type: z.enum(['BBQ Catering', 'Buffet', 'Diner', 'Borrel', 'Overig']).optional(),
});

export async function upsertEvent(input: unknown) {
  // Hard rule 5: Zod + re-auth INSIDE action
  const parsed = EventSchema.safeParse(input);
  if (!parsed.success) {
    return { error: 'validation', fields: parsed.error.flatten() };
  }

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'unauthorized' };

  // RLS doet tenant-isolatie. We hoeven org_id niet expliciet te zetten als policies dat doen.
  const { data, error } = await supabase
    .from('events')
    .upsert({
      ...parsed.data,
      // Server berekent productie-hoeveelheden later — niet AI (hard rule 3)
    })
    .select()
    .single();

  if (error) return { error: error.message };

  revalidatePath('/agenda');
  revalidatePath(`/events/${data.id}/hub`);
  return { data };
}

export async function deleteEvent(id: string) {
  const parsed = z.string().uuid().safeParse(id);
  if (!parsed.success) return { error: 'validation' };

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'unauthorized' };

  const { error } = await supabase.from('events').delete().eq('id', parsed.data);
  if (error) return { error: error.message };

  revalidatePath('/agenda');
  return { ok: true };
}
```

**Gebruik vanuit `EventEditor.tsx`** (Client Component):

```tsx
import { upsertEvent } from '@/app/events/actions';
import { useTransition } from 'react';
import { toast } from '@/components/Toast';

const [isPending, startTransition] = useTransition();

function handleSubmit(formData: FormData) {
  startTransition(async () => {
    const result = await upsertEvent(Object.fromEntries(formData));
    if (result.error) toast.error(result.error);
    else toast.success('Event opgeslagen');
  });
}
```

**Promptfoo eval voor AI-suggestie van event-type** (PROPOSED — als `EventEditor` AI-gebruikt voor type-detectie):

```yaml
# evals/event-type-suggest.eval.yaml
description: AI moet event-type voorstellen op basis van klant-naam + locatie + gasten
prompts:
  - "Klant: {{client}}, locatie: {{location}}, gasten: {{guests}}. Stel event-type voor: BBQ Catering / Buffet / Diner / Borrel / Overig."
providers:
  - anthropic:messages:claude-haiku-4-5-20251001
tests:
  - vars: { client: "Boerderij De Klaver", location: "Buiten", guests: 80 }
    assert:
      - type: contains-any
        value: ["BBQ Catering", "Buffet"]
  - vars: { client: "Hotel ABC zakelijk", location: "Vergaderzaal", guests: 12 }
    assert:
      - type: contains-any
        value: ["Diner", "Borrel"]
```

#### Chunk P0.8 — Agenda conflict deep-link

**Wijziging** in [src/app/agenda/page.tsx](src/app/agenda/page.tsx):

```tsx
'use client';
import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
// ...

export default function AgendaPage() {
  const sp = useSearchParams();
  const conflictId = sp.get('conflict');

  const [focusedEventId, setFocusedEventId] = useState<string | null>(null);

  useEffect(() => {
    if (conflictId) {
      setFocusedEventId(conflictId);
      // Scroll naar event in calendar — implementeer in CalendarGrid component
      requestAnimationFrame(() => {
        document
          .querySelector(`[data-event-id="${conflictId}"]`)
          ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
    }
  }, [conflictId]);

  // ... rest
}
```

Voeg `data-event-id={event.id}` toe aan elke event-card in de calendar render zodat de scroll-into-view werkt.

#### Chunk P0.9 — Type-safety pass agenda + events

Volgt patroon van P0.3. Specifiek:

```tsx
// agenda/page.tsx — top regels vervangen
import type {
  Event, PrepTask, AgendaPersonal,
} from '@/types/db';

const events = useSupabase<Event>('events', []);
const prepTasks = useSupabase<PrepTask>('prep_tasks', []);
// ... etc
```

`useSupabase` moet generieke type-param ondersteunen — als hij dat nog niet doet, voeg toe in [src/lib/useSupabase.ts](src/lib/useSupabase.ts):

```ts
export function useSupabase<T = any>(table: string, defaultValue: T[] = [], opts?: SupabaseHookOptions): { data: T[]; ... } {
  // ...
}
```

### § 3.f Verificatie-checklist Plannen-hub

- [ ] `grep -rn "serviceMockData" src/app/events/` geeft 0 hits na P0.5 (alleen `_data/`-folder mag nog bestaan zolang niet verwijderd)
- [ ] `/haccp/field` → selector-page met klikbare events, redirect bij 1 event
- [ ] Vanuit Vandaag-AttentionPanel klikken op conflict-kaart → `/agenda?conflict=ev42` → calendar focust + scrollt naar event
- [ ] EventEditor save-knop roept `upsertEvent` Server Action aan; Network-tab toont geen direct-Supabase POST vanuit Client
- [ ] Zod-validatie zichtbaar: probeer event met `guests: -5` → Server Action returnt `{ error: 'validation' }`
- [ ] Pillar 4 (KDS field-ready): Playwright test op iPad-resolution toont alle KdsCourseCard ≥88px
- [ ] Pillar 5 (HACCP offline): handmatige Lars-test op event-dag — WiFi uit, foto-evidence, queue, sync
- [ ] RLS-test: tenant B kan geen tenant A events zien in `/agenda` zelfs met directe URL `/events/<A-uuid>/hub`

---

> **Einde § 3 Plannen-hub.** Volgende turn: § 4 Verkoop-hub (`/offertes` + `/klanten` + `/q/[id]` portal + `/facturen`).

---

## § 4. Hub: Verkoop — `/offertes` + `/klanten` + `/facturen` + `/q/[id]`

> **Wat is dit?** De omzet-engine. Offertes opstellen (handmatig, wizard, AI-wizard), klanten beheren, facturen versturen, en het publieke klantportal `/q/[id]` waar de klant offerte ziet, ondertekent, en aanbetaling doet via iDEAL. De enige plek waar een externe partij de app raakt.
> **Bedoelde IA-naam** (ux-master.md): "Verkoop & Klanten". Sidebar zegt "Verkoop". Sub-tabs op `/offertes`: Offertes · Facturen · Klanten.
> **Persona-fit**: Mathijs of Pro-tier eigenaar stelt offerte op (desktop); klant ontvangt link, opent `/q/[id]` op mobiel of laptop, tekent, betaalt.

### § 4.a Audit — huidige staat

**Hoofd-pages**:

| Page | File | Regels | Type |
|---|---|---|---|
| Offertes-lijst + editor | [src/app/offertes/page.tsx](src/app/offertes/page.tsx) | 874 | Client, single-page met list+editor modes |
| Offerte interne view | [src/app/offertes/\[id\]/view/page.tsx](src/app/offertes/[id]/view/page.tsx) | - | Detail-view (intern, met auth) |
| Klanten-lijst | [src/app/klanten/page.tsx](src/app/klanten/page.tsx) | 408 | Client, list+editor |
| Facturen-lijst | [src/app/facturen/page.tsx](src/app/facturen/page.tsx) | 382 | Client, list+editor |
| **Klantportal (PUBLIC)** | [src/app/q/\[id\]/page.tsx](src/app/q/[id]/page.tsx) | 580 | Client, fetcht via `/api/public-offerte/[token]` (token-based, geen auth) |
| **`/offerte-editor` (DOOD volgens memory, maar BESTAAT NOG)** | [src/app/offerte-editor/page.tsx](src/app/offerte-editor/page.tsx) | - | **Moet weg — memory `project_offerte_editor_dood.md`** |

**Sub-componenten** (top-level wizards en builders):

| Component | File | Wat |
|---|---|---|
| AiOfferteWizard | [src/components/AiOfferteWizard.tsx](src/components/AiOfferteWizard.tsx) | AI-genereert menu op basis van event-type + gasten + budget |
| MenuWizard | [src/components/MenuWizard.tsx](src/components/MenuWizard.tsx) | Step-by-step menu samenstellen vanuit gerechten-bibliotheek |
| MenuBuilder | [src/components/MenuBuilder.tsx](src/components/MenuBuilder.tsx) | Drag-drop menu-compositie |
| KlantAutocomplete | [src/components/KlantAutocomplete.tsx](src/components/KlantAutocomplete.tsx) | Klant-zoek + nieuw aanmaken inline |
| SignaturePad | [src/components/SignaturePad.tsx](src/components/SignaturePad.tsx) | E-sign canvas op `/q/[id]` |
| FollowUpPrompt + SyncCascade | [components/FollowUpPrompt.tsx](src/components/FollowUpPrompt.tsx), [components/SyncCascade.tsx](src/components/SyncCascade.tsx) | Multi-step UI orchestration na save/accept |
| StatusBadge | [src/components/StatusBadge.tsx](src/components/StatusBadge.tsx) | concept/verzonden/geaccepteerd/betaald visualisatie |
| StickyActionBar | [src/components/StickyActionBar.tsx](src/components/StickyActionBar.tsx) | Floating actie-bar onderaan editor |

**Lib-helpers**:

| File | Wat |
|---|---|
| [src/lib/pdfGenerator.ts](src/lib/pdfGenerator.ts) | Offerte → PDF (waarschijnlijk html2canvas of similar — verifieer voor react-pdf-migratie) |
| [src/lib/emailHelper.ts](src/lib/emailHelper.ts) | `mailOfferte()` — verstuurt offerte-link via email (Resend?) |
| [src/lib/branding.ts](src/lib/branding.ts) | `buildBrandingConfig()` voor PDF + portal |
| [src/lib/acceptance-workflow.ts](src/lib/acceptance-workflow.ts) | `runAcceptanceWorkflow()` — offerte-accept chain |
| [src/lib/costCalculations.ts](src/lib/costCalculations.ts) | `calcOfferteMarge()` — marge per offerte |
| [src/lib/carbonFootprint.ts](src/lib/carbonFootprint.ts) | Carbon-score voor `/q/[id]` (`formatCarbon`, `SCORE_LABELS`) |
| [src/lib/activation.ts](src/lib/activation.ts) | `logActivationEvent()` voor funnel |
| [src/lib/csvExport.ts](src/lib/csvExport.ts) | `offertesToCsv` + `downloadCsv` |

**API-routes**:

| Route | Wat | Auth? |
|---|---|---|
| [src/app/api/public-offerte/\[token\]/route.ts](src/app/api/public-offerte/[token]/route.ts) | Read-only fetch voor `/q/[id]` | Geen — token-based |
| [src/app/api/accept-offerte/route.ts](src/app/api/accept-offerte/route.ts) | Klant tekent + accepteert | Geen — token-based |
| [src/app/api/payments/mollie/route.ts](src/app/api/payments/mollie/route.ts) | iDEAL betaling starten | Geen — token-based |
| [src/app/api/payments/mollie/webhook/route.ts](src/app/api/payments/mollie/webhook/route.ts) | Mollie payment status callback | Mollie-signature verify |
| [src/app/api/billing/checkout/route.ts](src/app/api/billing/checkout/route.ts) | Mollie subscription checkout (Pro-tier) | Auth |
| [src/app/api/billing/webhook/route.ts](src/app/api/billing/webhook/route.ts) | Mollie subscription status | Mollie-signature verify |
| [src/app/api/accounting/moneybird/route.ts](src/app/api/accounting/moneybird/route.ts) | Push factuur naar Moneybird | Auth + OAuth token |
| [src/app/api/integrations/moneybird/connect/route.ts](src/app/api/integrations/moneybird/connect/route.ts) | OAuth-initiate | Auth |
| [src/app/api/integrations/moneybird/callback/route.ts](src/app/api/integrations/moneybird/callback/route.ts) | OAuth-callback | Auth |

**Supabase-tabellen geraakt**: `offertes` · `facturen` · `klanten` · `events` · `gerechten` · `inventory` · `menu_templates`.

**AI-touchpoints**:
- `AiOfferteWizard` → `/api/recipe-generate` of `/api/menu-suggest` (verifieer routes)
- Geen Citations-API gebruikt (we hebben geen `claude-citations` codepad in deze hub gegrep'd) — Pillar 3 gap
- Geen prompt caching expliciet gevonden in offerte-AI calls (verifieer in API-route source)

**Code-rotting & status-flags**:

| Item | File | Status | Notitie |
|---|---|---|---|
| `/offerte-editor` directory bestaat | [src/app/offerte-editor/](src/app/offerte-editor/) | 🔴 | Memory zegt dood — moet weg |
| `'use client'` 874r in `/offertes/page.tsx` | [offertes/page.tsx:2](src/app/offertes/page.tsx:2) | 🟡 | Hele lijst + editor in één Client Component |
| `eslint-disable @typescript-eslint/no-explicit-any` | [offertes/page.tsx:1](src/app/offertes/page.tsx:1), [q/\[id\]/page.tsx:1](src/app/q/[id]/page.tsx:1) | 🟡 | Idem |
| Carbon footprint berekening op klantportal | [q/\[id\]/page.tsx:8](src/app/q/[id]/page.tsx:8) | 🟢 | Niet AI-derived (uit `carbonFootprint.ts` lookup-table) ✓ hard rule respect |
| `mailOfferte()` zelf — onder de motor | [src/lib/emailHelper.ts](src/lib/emailHelper.ts) | ? | Verifieer of Resend gebruikt wordt of `mailto:` link |
| Webhook idempotency | [src/app/api/payments/mollie/webhook/route.ts](src/app/api/payments/mollie/webhook/route.ts) | ? | **Hard rule 6 — verifieer UNIQUE constraint op processed-event-id** |
| Moneybird OAuth refresh-token rotation | [src/app/api/integrations/moneybird/callback/route.ts](src/app/api/integrations/moneybird/callback/route.ts) | ? | Moet refresh-token rotation hebben (Moneybird best practice) |
| `acceptance-workflow.ts` BTW-berekening | [src/lib/acceptance-workflow.ts](src/lib/acceptance-workflow.ts) | ? | **Hard rule 1 — BTW NOOIT AI-derived; verifieer dat hier `BTW_RULES_2026` lookup gebruikt wordt** |
| Public `/api/public-offerte/[token]` rate limit | [src/app/api/public-offerte/\[token\]/route.ts](src/app/api/public-offerte/[token]/route.ts) | ? | Geen auth = rate-limit per token nodig (OWASP API4 anti-scraping) |
| Token entropy `/q/[id]` | n/a | ? | Verifieer dat `id` cryptographically random is, niet sequential int |

**Feature-matrix**:

| Feature | Status | Bewijs |
|---|---|---|
| Offerte-list met filter+sort+search | ✓ live | [offertes/page.tsx:56-59](src/app/offertes/page.tsx:56) |
| Marge-kolom per offerte (gecached) | ✓ live | [offertes/page.tsx:78-80](src/app/offertes/page.tsx:78), `calcOfferteMargeData` |
| Template-picker (handmatig / wizard / opgeslagen menu) | ✓ live | [offertes/page.tsx:50-54](src/app/offertes/page.tsx:50) |
| MenuWizard | ✓ live | [components/MenuWizard.tsx](src/components/MenuWizard.tsx) |
| MenuBuilder drag-drop | ✓ live | [components/MenuBuilder.tsx](src/components/MenuBuilder.tsx) |
| AiOfferteWizard | ✓ live | [components/AiOfferteWizard.tsx](src/components/AiOfferteWizard.tsx) |
| AiOfferteWizard met Citations | ❌ | geen Citations-API call gespot |
| AiOfferteWizard met prompt-caching | ❌? | verifieer in API-route, anders P0 |
| PDF-generatie + brand-config | ✓ live | [src/lib/pdfGenerator.ts](src/lib/pdfGenerator.ts) |
| Email versturen offerte | ✓ live | [src/lib/emailHelper.ts](src/lib/emailHelper.ts) |
| FollowUpPrompt + SyncCascade na save | ✓ live | imports in offertes/page.tsx |
| CSV-export | ✓ live | [src/lib/csvExport.ts](src/lib/csvExport.ts) |
| **Klantportal `/q/[id]`** | ✓ live | [q/\[id\]/page.tsx](src/app/q/[id]/page.tsx) |
| E-sign SignaturePad | ✓ live | [components/SignaturePad.tsx](src/components/SignaturePad.tsx) |
| Carbon-score op portal | ✓ live | [q/\[id\]/page.tsx:8](src/app/q/[id]/page.tsx:8) |
| iDEAL aanbetaling via Mollie | ✓ scaffold | [api/payments/mollie/route.ts](src/app/api/payments/mollie/route.ts) — verifieer end-to-end |
| Mollie subscription checkout (Pro-tier) | ✓ scaffold | [api/billing/checkout/route.ts](src/app/api/billing/checkout/route.ts) |
| Moneybird OAuth-flow | ✓ scaffold | [api/integrations/moneybird/connect/route.ts](src/app/api/integrations/moneybird/connect/route.ts) |
| Factuur naar Moneybird pushen | ✓ scaffold | [api/accounting/moneybird/route.ts](src/app/api/accounting/moneybird/route.ts) |
| UBL/Peppol BIS 3.0 export | ❌ | geen `ubl` of `peppol` in api-routes gespot |
| `/offerte-editor` route | 🔴 dood | moet weg |
| Acceptance-workflow (offerte→event+factuur) | ✓ live | [src/lib/acceptance-workflow.ts](src/lib/acceptance-workflow.ts) |
| Webhook idempotency Mollie | ? | verifieer code |
| Webhook idempotency Moneybird | ? | verifieer code |
| Server Actions voor offerte-CRUD | ❌ | direct Supabase mutate vanuit Client |
| Type-safety pass | 🟡 half | eslint-disable op top |
| Token entropy `/q/[token]` | ? | verifieer |
| Rate-limit op `/api/public-offerte/[token]` | ? | verifieer |

### § 4.b Competitor sweep — top-3 "offertes + klant-portal + betaling"

| Concurrent | Killer-feature | Wij vs hen |
|---|---|---|
| **Tripleseat** | BEQ-builder met drag-drop menu, room-rate calculator, automatic upsells, customer-portal voor sign-off + deposit. ~$200/mnd. | Wij hebben drag-drop menu (MenuBuilder), AI-wizard (AiOfferteWizard), e-sign, iDEAL deposit. **Wij winnen op AI-wizard + carbon-score.** Zij winnen op room/equipment-rate-rules. |
| **FoodStorm** | AI-prijst offertes obv historische sales, B2B online portal voor recurring orders, route-optimisatie voor levering. | Wij hebben AI-wizard maar prijst niet automatisch obv historie — moet handmatig. **Zij winnen op pricing-automation.** Wij hebben sterker brand-themed portal. |
| **Better Cater** | Quote → contract → invoice flow met e-sign, automatic deposit, Quickbooks-sync. UK-stack maar zelfde mechanica. | Wij hebben quote→event→factuur via runAcceptanceWorkflow + Moneybird-sync. **Gelijkwaardig op flow.** Zij winnen op contract-template-bibliotheek. |

**Onze unieke moats**:
1. **AiOfferteWizard met (toekomstige) Citations** — toont [Bron: BBQ Pulled Pork] chip — geen concurrent doet dit
2. **Carbon-score op klantportal** — uniek in NL catering-SaaS
3. **5-tokens × 8-presets white-label** — PDF + portal allebei brand-themed, geen concurrent doet dit zo configureerbaar
4. **iDEAL native** — Tripleseat + FoodStorm + Better Cater zijn allemaal Stripe-first; NL-klanten verwachten iDEAL

**Waar ze ons verslaan**:
1. FoodStorm: AI-pricing-automation obv historische marge-data
2. Tripleseat: room/equipment-rate-engine (multi-resource pricing)
3. Better Cater: contract-template-bibliotheek

### § 4.c Golden Pillars — Verkoop-hub

**Pillar 1 — "Offerte van lege state naar klant binnen 5 minuten"** _(raise/Performance)_
- WHO: Pro-tier eigenaar met inkomende lead (telefoon/whatsapp).
- WHAT: `/offertes` → "Nieuw" → template-picker → wizard of AI-wizard → menu samengesteld → klant geselecteerd → PDF gegenereerd → mail verstuurd.
- WHEN: bij elke nieuwe aanvraag.
- HOW-MUCH: P50 time-to-mail-sent <5min, P95 <10min.
- **Anti-Pillar**: geen verplichte CRM-stappen (lead-stage, scoring) — direct naar inhoud.
- **Acceptance**: `offerte_concept_created` → `offerte_verzonden` event in `activation_events`, P50 delta <300s.

**Pillar 2 — "Klant tekent + betaalt zonder login"** _(create/Delighter)_
- WHO: externe klant (B2B procurement of B2C consumer), mogelijk eerste keer.
- WHAT: `/q/[id]` opent → ziet offerte met brand-thema → bekijkt carbon-score → tekent met SignaturePad → kiest iDEAL → betaalt aanbetaling.
- WHEN: na ontvangst van offerte-link in email.
- HOW-MUCH: P95 time-from-portal-open-to-payment-done <120s, conversie offerte→akkoord ≥30% bij verzonden offertes.
- **Anti-Pillar**: geen account-aanmaken, geen e-mailverificatie tussen stap 1 en 2.
- **Acceptance**: 100% van `/q/[id]` werkt op mobile 390px; e-sign + iDEAL flow zonder page-reload tussen stappen.

**Pillar 3 — "AI citeert je eigen recepten, hallucineert nooit ingrediënten"** _(raise/Delighter)_
- WHO: Pro-tier eigenaar die AI-wizard gebruikt voor offerte-menu.
- WHAT: AiOfferteWizard gebruikt Anthropic Citations API met cached document-corpus van eigen `gerechten` + `componenten` + `ingredienten`. Output toont `[Bron: BBQ Pulled Pork]` chip per menu-regel.
- WHEN: bij elke AI-wizard run.
- HOW-MUCH: 100% van AI-voorgestelde menu-regels heeft minstens 1 citation naar tenant's eigen recepten. Geen hallucinated ingrediënt-namen die niet in `ingredienten`-tabel staan.
- **Anti-Pillar**: geen "vrij creatieve" mode waar AI nieuwe gerecht-namen verzint zonder bron.
- **Acceptance**: Promptfoo eval `evals/offerte-wizard-citations.eval.yaml` test 10 scenarios, faalt bij 0 citations of bij ingrediënten buiten corpus.

**Pillar 4 — "Acceptatie = automatisch event + factuur-concept + Moneybird"** _(create/Delighter)_
- WHO: Mathijs of automated systeem na klant-akkoord.
- WHAT: `runAcceptanceWorkflow()` chained: maak `events` rij, maak `facturen` rij (concept), push naar Moneybird, stuur klant-bevestiging-mail, log `first_offerte_accepted` activation event.
- WHEN: zodra `/q/[id]` accept-knop wordt geklikt.
- HOW-MUCH: 100% van geaccepteerde offertes hebben binnen 60s een gekoppeld event + factuur-concept. Moneybird-push p95 <5s.
- **Anti-Pillar**: geen handmatige stap tussen accept en event-creatie.
- **Acceptance**: SQL `SELECT COUNT(*) FROM offertes WHERE status='geaccepteerd' AND id NOT IN (SELECT offerte_id FROM events)` → 0 rows. Moneybird-push success-rate ≥98%.

**Pillar 5 — "Marge zien tijdens samenstellen, niet pas na save"** _(raise/Must-be)_
- WHO: Pro-tier eigenaar bouwt menu in MenuBuilder.
- WHAT: `calcOfferteMarge()` draait realtime bij elke item-add/remove/edit; toont marge% in `StickyActionBar`. Kleur: rood <30%, oranje 30-50%, groen ≥50%.
- WHEN: bij elke menu-mutatie.
- HOW-MUCH: marge-update binnen 150ms van item-change.
- **Anti-Pillar**: geen marge-modal — moet inline zichtbaar.
- **Acceptance**: React DevTools profiler: `calcOfferteMarge` call <50ms voor 30-line offerte; geen waarneembare UI-stutter.

### § 4.d Gap-list

**P0 — blocker voor v1.0**:

| # | Gap | Impact | Uren | File:line |
|---|---|---|---|---|
| P0.10 | **Verwijder `/offerte-editor` directory** | Memory zegt dood; gebruikers verward; route blijft accessible via direct URL. | 0.25 | [src/app/offerte-editor/](src/app/offerte-editor/) |
| P0.11 | **Mollie webhook idempotency verifiëren + implementeren** | Hard rule 6. Replay-attack of dubbel-callback kan dubbel-betaling registreren. | 3 | [api/payments/mollie/webhook/route.ts](src/app/api/payments/mollie/webhook/route.ts), [api/billing/webhook/route.ts](src/app/api/billing/webhook/route.ts) |
| P0.12 | **Moneybird webhook + OAuth refresh-token rotation verifiëren** | Token kan expiren mid-push; Moneybird stuurt soms ook webhooks (verifieer). | 3 | [api/integrations/moneybird/callback/route.ts](src/app/api/integrations/moneybird/callback/route.ts), [api/accounting/moneybird/route.ts](src/app/api/accounting/moneybird/route.ts) |
| P0.13 | **AiOfferteWizard Citations API + prompt-caching** | Pillar 3 niet ingelost. Tegelijk: prompt-cache hit ratio ondervindt corpus-size = hoge kosten. | 6 | [components/AiOfferteWizard.tsx](src/components/AiOfferteWizard.tsx) + bijbehorende API-route |
| P0.14 | **Server Actions voor offerte-CRUD met Zod + re-auth** | Idem als events. Mutaties via Client = OWASP A01. | 4 | nieuw `src/app/offertes/actions.ts` |
| P0.15 | **BTW-berekening verifiëren in `acceptance-workflow.ts`** | Hard rule 1. Catering = 9% food / 21% service+alcohol mix. Geen AI-derive. | 2 | [src/lib/acceptance-workflow.ts](src/lib/acceptance-workflow.ts) + check `btw_rates` tabel |
| P0.16 | **Token entropy + rate-limit voor `/q/[token]`** | Sequential id = enumeration attack; geen rate-limit = scraping risk. OWASP API4. | 3 | [api/public-offerte/\[token\]/route.ts](src/app/api/public-offerte/[token]/route.ts) |

**P1 — fix voor v1.0**:

| # | Gap | Impact | Uren |
|---|---|---|---|
| P1.16 | `/offertes/page.tsx` Server Component split (874r → server-shell + client-form) | LCP-risico + onderhoudbaarheid | 6 |
| P1.17 | `/q/[id]/page.tsx` Server Component (security: minder JS naar publieke route) | OWASP best practice + faster initial paint | 4 |
| P1.18 | Mail-flow via Resend met thread-tracking | huidige `mailOfferte()` mogelijk `mailto:` of basic SMTP | 4 |
| P1.19 | PDF via react-pdf in plaats van html2canvas (server-side render, brand-tokens) | huidige pdf-generator mogelijk client-side; theming-mismatch | 8 |
| P1.20 | UBL/Peppol BIS 3.0 export per factuur | NL B2G nu verplicht; B2B vanaf 2030 | 8 |
| P1.21 | Type-safety pass offertes + klanten + facturen + portal | eslint-disable wegnemen | 3 |
| P1.22 | Klantportal preview-mode voor Pro-tier (zonder echte offerte) | Onboarding: laat tenant zien hoe portal eruit ziet | 2 |
| P1.23 | Email-template bibliotheek (offerte/herinnering/factuur) editbaar in Systeem | Pro-tier wens; nu hardcoded? | 4 |
| P1.24 | Carbon-score onboarding-tooltip op portal ("Wat betekent dit?") | Trust-building; klant snapt label niet zonder context | 1 |

**P2 — nice-to-have**:

| # | Gap | Impact | Uren |
|---|---|---|---|
| P1.26 | AI-pricing-suggest obv historische marge (FoodStorm-pattern, basis-versie) | Concurrent-pattern — FoodStorm doet dit standaard. Wij: simpele heuristiek "laatste 5 vergelijkbare events, p.p. mediaan ±10%". | 6 |
| P2.9 | Contract-template-bibliotheek (Better Cater-pattern) | B2B-enterprise klanten | 8 |
| P2.10 | Room/equipment-rate-engine (Tripleseat-pattern) | Niet kern Hop & Bites — pas overwegen bij venue-klanten | 16 |
| P2.11 | Recurring orders (FoodStorm-pattern voor wekelijkse lunch-klanten) | B2B-specifiek | 8 |
| P2.12 | Multi-currency support | Wij doen NL/BE/DE — pas in 2027 | 12 |

### § 4.e Ready-to-build chunks

#### Chunk P0.10 — Verwijder `/offerte-editor`

```bash
git rm -r src/app/offerte-editor/
```

Verifieer dat geen interne links nog ernaar wijzen:
```bash
grep -rn "offerte-editor" src/ docs/ 2>/dev/null
```

Resterende verwijzingen → corrigeer of voorzie van redirect in [src/middleware.ts](src/middleware.ts):

```ts
// middleware.ts — voeg toe binnen de bestaande matcher logic
if (req.nextUrl.pathname.startsWith('/offerte-editor')) {
  return NextResponse.redirect(new URL('/offertes', req.url), 308);
}
```

#### Chunk P0.11 — Mollie webhook idempotency

**Doel**: elke Mollie-event maximaal 1× geprocessed, ook bij replay.

**Migration** (nieuw `supabase/migrations/20260519100000_mollie_webhook_idempotency.sql`):

```sql
create table if not exists processed_mollie_events (
  id uuid primary key default gen_random_uuid(),
  mollie_payment_id text not null,
  mollie_event_type text,
  payload jsonb,
  processed_at timestamptz not null default now(),
  org_id uuid references organizations(id) on delete cascade,
  unique(mollie_payment_id, mollie_event_type)
);

alter table processed_mollie_events enable row level security;

create policy "tenant reads own mollie events"
  on processed_mollie_events
  for select to authenticated
  using (org_id = (select auth.jwt() ->> 'org_id')::uuid);

create index idx_processed_mollie_events_org on processed_mollie_events(org_id);
```

**Webhook-route** [src/app/api/payments/mollie/webhook/route.ts](src/app/api/payments/mollie/webhook/route.ts) update (paste-ready):

```ts
import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { verifyMollieSignature } from '@/lib/mollie/verify';
import { createMollieClient } from '@mollie/api-client';

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signature = req.headers.get('mollie-signature');

  // 1. Signature verification (Mollie next-gen webhooks gebruiken HMAC)
  if (!signature || !verifyMollieSignature(rawBody, signature, process.env.MOLLIE_WEBHOOK_SECRET!)) {
    return NextResponse.json({ error: 'invalid_signature' }, { status: 401 });
  }

  // 2. Parse payment-id van body (Mollie POST stuurt id als form-data)
  const params = new URLSearchParams(rawBody);
  const paymentId = params.get('id');
  if (!paymentId) return NextResponse.json({ error: 'missing_id' }, { status: 400 });

  // 3. Idempotency-guard: UNIQUE constraint = upsert returns 0 rows on duplicate
  const admin = createSupabaseAdminClient();
  const { data: inserted, error: insertErr } = await admin
    .from('processed_mollie_events')
    .insert({
      mollie_payment_id: paymentId,
      mollie_event_type: 'payment.updated',
      payload: Object.fromEntries(params.entries()),
      // org_id wordt geresolveerd na payment fetch (zie 4)
    })
    .select()
    .maybeSingle();

  if (insertErr) {
    // Conflict op UNIQUE = already processed = idempotent return OK
    if (insertErr.code === '23505') return NextResponse.json({ status: 'already_processed' });
    return NextResponse.json({ error: insertErr.message }, { status: 500 });
  }

  // 4. Fetch payment van Mollie + update offerte/factuur status
  const mollie = createMollieClient({ apiKey: process.env.MOLLIE_API_KEY! });
  const payment = await mollie.payments.get(paymentId);

  // metadata.offerteId zou bij payment-creation meegegeven moeten zijn
  const offerteId = payment.metadata?.offerteId as string | undefined;
  if (offerteId && payment.status === 'paid') {
    await admin
      .from('offertes')
      .update({ status: 'betaald', betaald_op: new Date().toISOString() })
      .eq('id', offerteId);

    // Resolve org_id vanuit offerte voor idempotency-tabel
    const { data: offerte } = await admin.from('offertes').select('org_id').eq('id', offerteId).single();
    if (offerte) {
      await admin.from('processed_mollie_events').update({ org_id: offerte.org_id }).eq('id', inserted!.id);
    }
  }

  return NextResponse.json({ status: 'processed' });
}
```

**`src/lib/mollie/verify.ts`** (paste-ready):

```ts
import crypto from 'node:crypto';

export function verifyMollieSignature(payload: string, signature: string, secret: string): boolean {
  // Mollie next-gen: signature = HMAC-SHA256(secret, payload)
  const expected = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  // Constant-time compare
  return crypto.timingSafeEqual(
    Buffer.from(signature, 'hex'),
    Buffer.from(expected, 'hex'),
  );
}
```

#### Chunk P0.12 — Moneybird OAuth refresh + idempotency

**Migration** (nieuw `supabase/migrations/20260519110000_moneybird_oauth_state.sql`):

```sql
create table if not exists moneybird_connections (
  org_id uuid primary key references organizations(id) on delete cascade,
  administration_id text not null,
  access_token text not null,         -- versleuteld bewaren (zie note)
  refresh_token text not null,        -- idem
  expires_at timestamptz not null,
  scopes text[],
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Note: access_token + refresh_token zijn secret. Beheer ze NIET in plain text.
-- Optie A: kolommen versleutelen met pgcrypto (`pgp_sym_encrypt(token, vault_key)`).
-- Optie B: tokens in Vercel KV / Upstash, kolommen alleen pointer-keys.
-- Beslis nu A of B; codepad hieronder gaat uit van A.

alter table moneybird_connections enable row level security;
create policy "tenant_reads_own_moneybird"
  on moneybird_connections
  for select to authenticated
  using (org_id = (select auth.jwt() ->> 'org_id')::uuid);

create table if not exists processed_moneybird_events (
  id uuid primary key default gen_random_uuid(),
  moneybird_event_id text not null unique,
  payload jsonb,
  org_id uuid references organizations(id) on delete cascade,
  processed_at timestamptz not null default now()
);
alter table processed_moneybird_events enable row level security;
```

**Refresh-helper** `src/lib/moneybird/auth.ts` (paste-ready):

```ts
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

export async function getValidMoneybirdAccessToken(orgId: string): Promise<string> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from('moneybird_connections')
    .select('*')
    .eq('org_id', orgId)
    .single();
  if (error || !data) throw new Error('moneybird_not_connected');

  const now = new Date();
  const expiresAt = new Date(data.expires_at);
  // Refresh als token binnen 60s expireert
  if (expiresAt.getTime() - now.getTime() < 60_000) {
    const res = await fetch('https://moneybird.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: data.refresh_token,
        client_id: process.env.MONEYBIRD_CLIENT_ID!,
        client_secret: process.env.MONEYBIRD_CLIENT_SECRET!,
      }),
    });
    if (!res.ok) throw new Error('moneybird_refresh_failed');
    const tok = await res.json();

    const newExpires = new Date(Date.now() + tok.expires_in * 1000).toISOString();
    await admin.from('moneybird_connections').update({
      access_token: tok.access_token,
      refresh_token: tok.refresh_token ?? data.refresh_token, // rotation als Moneybird één stuurt
      expires_at: newExpires,
      updated_at: new Date().toISOString(),
    }).eq('org_id', orgId);

    return tok.access_token;
  }
  return data.access_token;
}
```

**Push-route** [api/accounting/moneybird/route.ts](src/app/api/accounting/moneybird/route.ts) gebruikt deze helper + retry op 401 met fresh refresh.

#### Chunk P0.13 — AiOfferteWizard Citations + prompt-caching

**API-route** (PROPOSED — bevestig of `src/app/api/offerte-wizard/route.ts` bestaat of vergelijkbaar) gewijzigd naar:

```ts
import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { trackAiUsage } from '@/lib/ai/track-usage';

const Schema = z.object({
  eventType: z.enum(['BBQ Catering', 'Buffet', 'Diner', 'Borrel']),
  guests: z.coerce.number().int().positive(),
  budgetPp: z.coerce.number().positive().optional(),
  dietary: z.array(z.enum(['vegan', 'vegetarian', 'gluten_free', 'lactose_free'])).default([]),
});

export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const parsed = Schema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error }, { status: 400 });

  // Build corpus van eigen gerechten + componenten (kandidaat voor cache prefix)
  const { data: gerechten } = await supabase
    .from('gerechten')
    .select('id, naam, beschrijving, allergenen, kosten_pp, status')
    .eq('status', 'actief')
    .limit(500);

  const corpusDoc = (gerechten ?? []).map(g => ({
    id: g.id,
    title: g.naam,
    body: `${g.beschrijving}\nAllergenen: ${(g.allergenen ?? []).join(', ')}\nKosten p.p.: €${g.kosten_pp}`,
  }));

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

  const res = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2000,
    system: [
      {
        type: 'text',
        text: 'Je bent menu-architect voor BBQ-cateringbedrijven in Nederland. Hop & Bites context is ingebakken — vraag NOOIT wie de gebruiker is. Stel menu samen, geef per regel een citation naar het bron-gerecht uit het corpus. Sentence-case Nederlands, werkwoord-eerst.',
        cache_control: { type: 'ephemeral' as const },
      },
    ],
    messages: [{
      role: 'user',
      content: [
        // Citations: structured documents
        {
          type: 'document',
          source: {
            type: 'content',
            content: corpusDoc.map(d => ({
              type: 'text',
              text: `## ${d.title}\n${d.body}`,
              citations: { enabled: true },
            })),
          },
          title: 'Eigen gerechten-bibliotheek',
          context: 'Tenant own recipe corpus — only suggest dishes from this list',
          cache_control: { type: 'ephemeral' as const },
        },
        {
          type: 'text',
          text: `Stel menu voor: event=${parsed.data.eventType}, ${parsed.data.guests} gasten${parsed.data.budgetPp ? `, budget €${parsed.data.budgetPp}/p.p.` : ''}. Dieet-eisen: ${parsed.data.dietary.join(', ') || 'geen'}.`,
        },
      ],
    }],
  });

  await trackAiUsage({
    orgId: user.app_metadata?.org_id,
    feature: 'offerte-wizard',
    model: 'claude-sonnet-4-6',
    inputTokens: res.usage.input_tokens,
    outputTokens: res.usage.output_tokens,
    cacheReadInputTokens: res.usage.cache_read_input_tokens ?? 0,
    cacheCreationInputTokens: res.usage.cache_creation_input_tokens ?? 0,
  });

  // Extract menu-regels + citations
  const blocks = res.content;
  const suggestions = blocks
    .filter(b => b.type === 'text')
    .flatMap(b => (b as any).citations ?? [])
    .map(c => ({
      gerechtId: c.document_index !== undefined ? corpusDoc[c.document_index]?.id : null,
      title: c.cited_text,
    }));

  return NextResponse.json({
    rawText: blocks.filter(b => b.type === 'text').map(b => (b as any).text).join(''),
    citations: suggestions,
    usage: res.usage,
  });
}
```

**Promptfoo eval** `evals/offerte-wizard-citations.eval.yaml`:

```yaml
description: AiOfferteWizard moet alleen gerechten uit eigen corpus voorstellen, met citation per regel
prompts: file://prompts/offerte-wizard.md
providers:
  - id: anthropic:messages:claude-sonnet-4-6
tests:
  - vars:
      eventType: "BBQ Catering"
      guests: 60
      budgetPp: 35
    assert:
      - type: javascript
        value: |
          // Citations >= 1 per menu-regel
          const lines = output.split('\n').filter(l => l.match(/^\d+\./));
          return output.citations && output.citations.length >= lines.length;
      - type: javascript
        value: |
          // Geen ingrediënten buiten corpus
          const corpusIds = context.corpus.map(c => c.id);
          return output.citations.every(c => corpusIds.includes(c.gerechtId));
  - vars:
      eventType: "Buffet"
      guests: 200
      dietary: ["vegan"]
    assert:
      - type: contains
        value: "vegetarisch"
        ignoreCase: true
```

#### Chunk P0.14 — Server Actions voor offerte-CRUD

Volgt patroon van P0.7 (Plannen). Nieuw `src/app/offertes/actions.ts`:

```ts
'use server';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { calcOfferteMarge } from '@/lib/costCalculations';

const ItemSchema = z.object({
  gerecht_id: z.string().uuid().nullable(),
  beschrijving: z.string().max(500),
  qty: z.coerce.number().nonnegative(),
  prijs: z.coerce.number().nonnegative(),
});

const OfferteSchema = z.object({
  id: z.string().uuid().optional(),
  client_naam: z.string().min(1).max(200),
  klant_id: z.string().uuid().nullable(),
  datum: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  aantal_gasten: z.coerce.number().int().nonnegative(),
  basis_prijs_pp: z.coerce.number().nonnegative(),
  status: z.enum(['concept', 'verzonden', 'geaccepteerd', 'betaald', 'geannuleerd']),
  items: z.array(ItemSchema).default([]),
  vaste_kosten: z.array(z.object({ naam: z.string(), bedrag: z.coerce.number() })).default([]),
  menu_selectie: z.unknown().optional(),
});

export async function upsertOfferte(input: unknown) {
  const parsed = OfferteSchema.safeParse(input);
  if (!parsed.success) return { error: 'validation', fields: parsed.error.flatten() };

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'unauthorized' };

  const { data, error } = await supabase
    .from('offertes')
    .upsert({ ...parsed.data, owner_id: user.id })
    .select()
    .single();

  if (error) return { error: error.message };

  revalidatePath('/offertes');
  return { data };
}
```

#### Chunk P0.15 — BTW-berekening verifiëren

Open [src/lib/acceptance-workflow.ts](src/lib/acceptance-workflow.ts) en zoek BTW-logica. Verwacht patroon:

```ts
// CORRECT — server-side lookup, NIET AI-derived
import { BTW_RULES_2026 } from './btw-rules';

function calcBtwSplit(items: OfferteItem[], catering: boolean) {
  return items.map(item => {
    const rule = BTW_RULES_2026.find(r =>
      r.category === (item.is_alcohol ? 'alcohol' : catering ? 'food_catering' : 'food_takeaway')
    );
    return { ...item, btw_pct: rule.rate };
  });
}
```

Als geen `BTW_RULES_2026` lookup, dan vervangen. Lookup-tabel `src/lib/btw-rules.ts`:

```ts
export const BTW_RULES_2026 = [
  { category: 'food_catering',   rate: 0.09,  label: 'Voedingsmiddelen, catering ter plaatse' },
  { category: 'food_takeaway',   rate: 0.09,  label: 'Voedingsmiddelen, afhalen' },
  { category: 'service_personnel', rate: 0.21, label: 'Bediening/personeel' },
  { category: 'alcohol',         rate: 0.21,  label: 'Alcoholische dranken' },
  { category: 'transport',       rate: 0.21,  label: 'Bezorging' },
  { category: 'equipment_rental',rate: 0.21,  label: 'Materieel-verhuur' },
  { category: 'b2b_intra_eu_reverse', rate: 0.00, label: 'B2B intracommunautair (reverse charge)' },
] as const;
```

**Belangrijk**: AI mag suggereren welke category een item is, maar de `rate` komt ALTIJD uit deze tabel.

#### Chunk P0.16 — Token entropy + rate-limit klantportal

**Migration** (als `offertes.id` is sequential int) — voeg een aparte `public_token` toe:

```sql
-- supabase/migrations/20260519120000_offerte_public_token.sql
alter table offertes
  add column if not exists public_token text unique
  default replace(encode(gen_random_bytes(32), 'base64'), '/', '_');

create index if not exists idx_offertes_public_token on offertes(public_token);
```

**Wijzig** `/q/[id]` → `/q/[token]` (route folder rename) en `/api/public-offerte/[id]` → `/api/public-offerte/[token]`. URLs worden:
`https://app.bbqarchitect.nl/q/aXR0aGlzaXMxMjg=...`

**Rate-limit** met Upstash / Vercel KV in [api/public-offerte/\[token\]/route.ts](src/app/api/public-offerte/[token]/route.ts):

```ts
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

const limiter = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(20, '1 m'), // 20 requests per minuut per IP
  analytics: true,
});

export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0] ?? 'unknown';
  const { success } = await limiter.limit(`public-offerte:${ip}`);
  if (!success) return NextResponse.json({ error: 'rate_limited' }, { status: 429 });

  const { token } = await params;
  // ... rest
}
```

### § 4.f Verificatie-checklist Verkoop-hub

- [ ] `find src/app/offerte-editor -type f` → 0 hits na P0.10
- [ ] Mollie webhook replay-test: stuur dezelfde POST 2× → eerste 200, tweede `already_processed` (P0.11)
- [ ] Moneybird mid-push 401 → automatisch refresh + retry → push slaagt (P0.12)
- [ ] AiOfferteWizard output bevat `citations` array met `gerechtId`-refs naar bestaande rows (P0.13)
- [ ] Promptfoo `evals/offerte-wizard-citations.eval.yaml` slaagt voor 10 scenarios
- [ ] Server Action `upsertOfferte` faalt met validation-error op negative `aantal_gasten` (P0.14)
- [ ] Acceptance-workflow met test-offerte: BTW splits zijn 9% food / 21% service in `facturen.btw_breakdown` (P0.15)
- [ ] `/q/[token]` met sequentiële id (oude vorm) → 404; `/q/[base64-token]` → 200 (P0.16)
- [ ] 21e request binnen 60s naar `/api/public-offerte/[token]` → 429
- [ ] Pillar 2 acceptance: open `/q/[token]` op iPhone 14 (390px) → tekenen + iDEAL flow zonder horizontal scroll
- [ ] AVG-check: offerte verwijderen → cascade naar `events`, `facturen`, `processed_mollie_events` (FK on delete cascade waar gepast)

---

> **Einde § 4 Verkoop-hub.** Volgende turn: § 5 Menu & Recepten-hub.

---

## § 5. Hub: Menu & Recepten — `/gerechten` + sub-tabs

> **Wat is dit?** Eén bibliotheek voor wat je verkoopt en hoe je het bereidt. Drie-laags: Ingrediënten → Componenten → Gerechten, met automatische cost-rollup en allergeen-cascade. Plus AI-bedenker, allergen-queue, insights, en menu-analyse (BCG).
> **Bedoelde IA-naam** (ux-master.md sectie 5): "Inspiratie Bibliotheek" — maar de canonical hub heet **"Menu & Recepten"** (sidebar `navigation.tsx:60`). `/inspiratie` is dood-redirect sinds 2026-05-16. ux-master.md is op dit punt verouderd; treat sidebar als waarheid.
> **Persona-fit**: Mathijs onderhoudt gerechten + componenten (desktop), Lars bekijkt recepten in keuken (tablet), Pro-tier eigenaar imports/edits zijn eigen bibliotheek.

### § 5.a Audit — huidige staat

**Hoofd-pages**:

| Page | File | Regels | Type |
|---|---|---|---|
| Gerechten-hub (Server wrapper) | [src/app/gerechten/page.tsx](src/app/gerechten/page.tsx) | 10 | ✅ Server Component shell |
| Gerechten-hub (Client body) | [src/app/gerechten/_client.tsx](src/app/gerechten/_client.tsx) | **1805** | Client mega-file |
| Componenten | [src/app/gerechten/componenten/page.tsx](src/app/gerechten/componenten/page.tsx) | 4 | Re-export — echte file ligt onder `/inspiratie/componenten/` (1595r) |
| Ingrediënten | [src/app/gerechten/ingredienten/page.tsx](src/app/gerechten/ingredienten/page.tsx) | 106 | Client list |
| Allergen-queue | [src/app/gerechten/allergen-queue/page.tsx](src/app/gerechten/allergen-queue/page.tsx) + [actions.ts](src/app/gerechten/allergen-queue/actions.ts) | 136 | Server Action ✓ |
| Insights | [src/app/gerechten/insights/page.tsx](src/app/gerechten/insights/page.tsx) | 414 | Analytics |
| AI Pitmaster | [src/app/gerechten/ai-pitmaster/page.tsx](src/app/gerechten/ai-pitmaster/page.tsx) | 29 | **STUB "Binnenkort"** |
| Menu-analyse | [src/app/gerechten/menu-analyse/page.tsx](src/app/gerechten/menu-analyse/page.tsx) | 37 | **STUB redirect naar /marges** |
| Bedenker (AI-recept-generator) | [src/app/bedenker/page.tsx](src/app/bedenker/page.tsx) | 781 | Client, niet in sidebar — kandidaat voor Menu-hub tab |
| Marges (BCG-matrix) | [src/app/marges/page.tsx](src/app/marges/page.tsx) | 734 | Client, niet in sidebar — werkende BCG die menu-analyse-stub naartoe redirect |

**Dood-en-leven**: `/inspiratie` (redirect 2026-05-16), `/inspiratie/gerechten` (redirect), `/recepten` (redirect 2026-05-01), `/menu-engineering` (redirect naar `/marges` 2026-05-01).

**DB-tabellen geraakt**: `gerechten` · `components` · `gerecht_components` · `ingredienten` (zie code: `inventory`) · `allergens` · `component_allergens` · `ingredient_allergens` · `menu_templates` · `gangen` · `offertes` · `service_logs` · `organization_members`.

**API-routes**:
- `/api/recipe-generate` · `/api/recipe/ai-improve` · `/api/recipe/refine-price` · `/api/recipe/ai-fill` — AI helpers
- `/api/gerechten/list` · `/api/gerechten/[id]` · `/api/gerechten/[id]/components` · `/api/gerechten/[id]/components/[componentId]` · `/api/gerechten/[id]/rollup` — CRUD
- `/api/gerechten/regenerate-prompt` · `/api/detect-allergens` — AI-cascade

**Feature-matrix**:

| Feature | Status | Bewijs |
|---|---|---|
| 3-laags cost-rollup (ingredient → component → dish) | ✓ live | `/api/gerechten/[id]/rollup`, tabellen `gerecht_components` + `components` |
| Allergeen-cascade vanuit DB-join | ✓ live | `ingredient_allergens` + `component_allergens` + `event_allergies` tabellen |
| Allergen-queue async detection | ✓ live | [allergen-queue/page.tsx](src/app/gerechten/allergen-queue/page.tsx) + actions.ts |
| Recipe-builder (steps, photo, yield) | 🟡 partial | `_client.tsx` heeft basis edit-modal — yield-scaling onbevestigd |
| AI-recept-generator | ✓ live op `/bedenker` | [bedenker/page.tsx](src/app/bedenker/page.tsx) — concept-history, klant-context, voorraad-context |
| AI Pitmaster (chef-coach context-aware) | 🔴 STUB | "Binnenkort" placeholder, 29r |
| Menu-analyse BCG-kwadrant | ✓ live op `/marges` (niet als Menu-tab!) | [marges/page.tsx](src/app/marges/page.tsx) + `BCGMatrix.tsx` |
| Nutritional info per dish (kcal/eiwit/vet/koolh) | ❌ | concurrent-pattern Apicbase/Foodnotify — ontbreekt |
| Recipe version-history | ❌ | `concept_history` tabel bestaat (migration 023) maar UI ontbreekt |
| Recipe yield-scaling (× 1.5) | ❌? | verifieer in _client.tsx edit-modal |
| Photo-per-step | ❌ | concurrent-pattern Apicbase — ontbreekt |
| Bulk-edit + duplicate dish | ❌? | verifieer |
| Print/export recipe-card | ❌? | verifieer |
| Server Component split | ✅ done | `page.tsx` 10r + `_client.tsx` 1805r |
| Componenten fysiek onder /gerechten/ | 🔴 tech-debt | re-export via `/inspiratie/componenten/` (1595r) — slice 2 nog niet uitgevoerd |
| /bedenker als Menu-hub tab | ❌ | `/bedenker` is losse route, niet onder `/gerechten/` |
| /marges integratie in Menu-hub | 🟡 half | menu-analyse-stub redirect naar /marges — werkt, niet ingebed |
| Type-safety | 🟡 half | verifieer `_client.tsx` (waarschijnlijk `any`) |
| Server Actions voor gerechten-CRUD | ❌ | direct mutate vanuit Client |

### § 5.b Competitor sweep — top-3 "recipe + costing + menu-engineering"

| Concurrent | Killer-feature | Wij vs hen |
|---|---|---|
| **Apicbase** | 3-laags recipe → component → dish, realtime cost-rollup, nutritional info, allergeen-cascade, photo-per-step, version-history, supplier-linked ingredient prices, recipe-yield-scaling | Wij: 3-laags ✓, cost-rollup ✓, allergeen-cascade ✓, **nutritional info ❌, photo-per-step ❌, version-history ❌, yield-scaling ❌**. Apicbase wint op recipe-depth. |
| **Foodnotify** (NL-veel-gebruikt) | Recept-management + allergeen + foodcost + BCG menu-engineering + portion-control + voedingswaarde, NL-conform | Wij hebben BCG (op /marges), allergeen ✓, foodcost ✓. **Voedingswaarde ❌.** Foodnotify wint op compleetheid. |
| **MEXT** (NL) | Recept-database + foodcost + voedingswaarde + allergeen-cascade + receptboek-export (PDF) | Wij missen voedingswaarde + receptboek-PDF. Wij hebben sterker: AI-bedenker. |

**Onze unieke moats** (volg de concurrent-patterns-regel: claim minder, alleen wat echt anders is):
1. **AI-bedenker** met klant-context + voorraad-context + concept-history — Apicbase heeft AI maar geen klant-specifieke prompts (`/bedenker/page.tsx:VERRAS_PROMPTS_KLANT`)
2. **Allergeen-event-cascade**: van ingredient via component via dish naar `event_allergies` per event automatisch — concurrenten doen dish-level, wij gaan door tot event

**Waar ze ons verslaan** (= gewone gaps, geen Anti-Pillars):
1. Apicbase: nutritional info, photo-per-step, version-history-UI, yield-scaling
2. Foodnotify: voedingswaarde-tabel, NL-conforme allergeen-labels
3. MEXT: receptboek-PDF-export

### § 5.c Golden Pillars — Menu & Recepten

**Pillar 1 — "3-laags cost-rollup: ingredient-prijs verandert, dish-marge herrekent automatisch"** _(raise/Must-be)_
- WHO: Mathijs of Pro-tier eigenaar past inkoopprijs aan.
- WHAT: `/api/gerechten/[id]/rollup` herberekent kosten via `ingredient → component → dish`, marge-alert triggered indien <30%.
- WHEN: bij elke `inventory.cost_per_unit` of `components.kost` mutatie.
- HOW-MUCH: P95 rollup-tijd <2s voor 500-dish bibliotheek.
- **Anti-Pillar**: geen multi-step prijs-historie animaties — directe update, log naar `audit_log`.
- **Acceptance**: integration-test `prijsverandering ingredient X → dish Y marge update binnen 2s`.

**Pillar 2 — "Allergenen worden NOOIT AI-getekst, altijd uit join-table"** _(raise/Must-be — hard rule 2)_
- WHO: elke gerecht-edit en elke event-allergie-toewijzing.
- WHAT: UI toont allergenen via `ingredient_allergens` join → `component_allergens` join → `gerecht_components`. AI mag suggereren welke allergen-tag, mens bevestigt, code schrijft.
- WHEN: altijd, op alle plekken waar allergenen tonen.
- HOW-MUCH: 100% van getoonde allergeen-strings komen uit `allergens.naam` kolom; geen LLM-output.
- **Anti-Pillar**: geen "natural language" allergeen-tekst zoals "Bevat mogelijk noten" — alleen exacte allergeen-codes (EU14).
- **Acceptance**: code-grep `[A-Z][a-z]+gen.*generate|prompt.*allergie` → 0 hits in productiecode.

**Pillar 3 — "Recipe-builder: stappen + foto's + yield-scaling — Apicbase-pattern"** _(raise/Performance)_
- WHO: Mathijs of Pro-tier eigenaar bouwt recept.
- WHAT: gerecht-edit-modal toont stappen (rich-text via BlockNote), foto-per-stap (Supabase Storage), yield-input ("voor X personen"), schaal-knop (× 1.5 / × 2).
- WHEN: bij elke gerecht-create/edit.
- HOW-MUCH: 100% van gerechten kan stappen + foto's + yield bevatten zonder JSON-edit. Schaal-knop herrekent component-qty's binnen 100ms.
- **Anti-Pillar**: geen externe recipe-import (BigOven, Yummly) — niet kern voor BBQ-catering.
- **Acceptance**: maak nieuw gerecht "Pulled Pork" met 5 stappen + 5 foto's + yield 60 → schaal naar 90 personen → alle component-qty's × 1.5.

**Pillar 4 — "AI-bedenker geeft varianten op basis van klant + voorraad + historie"** _(raise/Delighter)_
- WHO: Mathijs of Pro-tier eigenaar zoekt nieuwe gerecht-ideeën.
- WHAT: `/bedenker` neemt mode (vrij / voorraad-driven / klant-driven) en genereert 3-5 concept-cards met basis-recept + kosten-schatting + allergeen-suggestie. Concept → "Maak gerecht" knop → opent gerecht-edit-modal met pre-fill.
- WHEN: power-user-flow.
- HOW-MUCH: concept-generation <8s p95, prompt-cache hit ratio ≥60% voor recurring tenants.
- **Anti-Pillar**: AI **suggereert** allergeen-tag, code schrijft die naar de join-table (hard rule 2).
- **Acceptance**: maak 5 concepten in `vrij`-mode, klik "Maak gerecht" op 1 → gerecht-edit-modal opent met componenten al gevuld.

**Pillar 5 — "Menu-analyse BCG-kwadrant — Foodnotify/Apicbase-pattern"** _(raise/Performance)_
- WHO: Mathijs of Pro-tier eigenaar evalueert menu-mix kwartaal.
- WHAT: scatter-plot: x-as = populariteit (sales count laatste 90d), y-as = marge%. Quadranten: ster (hoog/hoog), puzzel (laag/hoog), runner (hoog/laag), bleeder (laag/laag).
- WHEN: maand/kwartaal-review.
- HOW-MUCH: laadt voor 100-dish bibliotheek binnen 1s. Sortable lijst onder plot.
- **Anti-Pillar**: geen voorspellende ML-modellen (LSTM forecasting) — alleen historische data uit `gangen` + `offertes`. Concurrenten doen hetzelfde, simpel houden.
- **Acceptance**: BCG werkt al op `/marges` — integreer als `/gerechten/menu-analyse` tab in plaats van redirect.

### § 5.d Gap-list

**P0 — blocker voor v1.0**:

| # | Gap | Impact | Uren |
|---|---|---|---|
| P0.17 | **`/gerechten/ai-pitmaster` stub-vullen** — concrete chef-coach context-aware (event-data → directives + kerntemp + allergie-cross-refs) | 70%-af demo schendt regel; concurrenten hebben "AI Recipe Assistant" actief | 8 |
| P0.18 | **`/gerechten/menu-analyse` stub vervangen door embedded BCG** (verplaats `/marges` BCG-matrix als tab onder Menu) | 70%-af demo + IA-helderheid (Menu-analyse hoort bij Menu) | 4 |
| P0.19 | **`_client.tsx` 1805r refactor naar tab-componenten** | Onderhoudbaarheid + LCP; ref [Vandaag P0.1](#chunk-p01-server-component-split-parallel-queries) patroon | 8 |
| P0.20 | **Slice 2: fysiek verplaats componenten van `/inspiratie/componenten/page.tsx` (1595r) naar `/gerechten/componenten/page.tsx`** | Tech-debt; re-export blokkeert refactor en file:line clarity | 3 |
| P0.21 | **Server Actions voor gerecht-CRUD** + type-safety pass | hard rule 5 + 1805r heeft `any` waarschijnlijk | 6 |
| P0.22 | **`/bedenker` integreren als sub-tab onder `/gerechten/bedenker`** (of redirect intact + zichtbaar in tab-bar) | IA-helderheid; concurrent-pattern (Apicbase heeft AI-Assist binnen recipe-hub) | 2 |
| P0.23 | **Allergeen-hard-rule code-review**: grep voor LLM-output die naar `allergens.naam` schrijft | hard rule 2 verificatie | 2 |

**P1 — fix voor v1.0** (concurrent-patterns):

| # | Gap | Impact | Uren |
|---|---|---|---|
| P1.27 | **Nutritional info per dish** (kcal/eiwit/vet/koolhydraten/zout, gerolld uit ingredients) — Apicbase/Foodnotify/MEXT standaard | NL-conform + B2B-procurement vraag | 12 |
| P1.28 | **Recipe yield-scaling**: input "voor X personen" + × 1.5 / × 2 knoppen | Apicbase standaard | 4 |
| P1.29 | **Photo-per-step** (Supabase Storage upload per recept-stap) | Apicbase standaard | 6 |
| P1.30 | **Recipe version-history UI** (uit bestaande `concept_history` tabel + audit-log) | Apicbase standaard | 4 |
| P1.31 | **Bulk-edit + duplicate gerecht** (selectie-modus → bulk-actions toolbar) | Apicbase + Foodnotify standaard | 3 |
| P1.32 | **Receptboek-PDF-export** (per gerecht of bulk, brand-themed) — MEXT-pattern | NL-conform | 6 |
| P1.33 | Migratie BlockNote voor recept-stappen rich-text | Notion-stijl, concurrent-pattern in nieuwe SaaS | 4 |

**P2 — nice-to-have**:

| # | Gap | Impact | Uren |
|---|---|---|---|
| P2.13 | Multi-foto per gerecht (gallery) | Marketing-fluff | 2 |
| P2.14 | Recipe-tagging (cuisine, season, dietary) — search-filter | Power-user wens | 4 |
| P2.15 | Recipe-rating + favorite-marking | Niet kern | 2 |

### § 5.e Ready-to-build chunks

> Standaard patronen (Server Component split, Server Action + Zod, type-safety) zie [Vandaag P0.1-P0.3](#§-2e-ready-to-build-chunks). Hieronder alleen menu-specifiek.

#### Chunk P0.17 — `/gerechten/ai-pitmaster` echte content

Vervang stub met chat-coach die event-context pakt:

```tsx
// app/gerechten/ai-pitmaster/page.tsx
import { createSupabaseServerClient } from '@/lib/supabase/server';
import AiPitmasterClient from './_components/AiPitmasterClient';

export const metadata = { title: 'AI Pitmaster — Menu & Recepten' };

export default async function AiPitmasterPage() {
  const supabase = await createSupabaseServerClient();
  const today = new Date().toISOString().slice(0, 10);

  // Pak komende 3 events als chat-context
  const { data: upcoming } = await supabase
    .from('events')
    .select('id, name, date, guests, type, location')
    .gte('date', today)
    .order('date')
    .limit(3);

  return <AiPitmasterClient upcomingEvents={upcoming ?? []} />;
}
```

`_components/AiPitmasterClient.tsx` (paste-ready, kort):

```tsx
'use client';
import { useState } from 'react';
import { ChatPanel } from '@/components/ai/ChatPanel'; // bestaande v2 chat

type Event = { id: string; name: string; date: string; guests: number; type: string };
type Props = { upcomingEvents: Event[] };

export default function AiPitmasterClient({ upcomingEvents }: Props) {
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(upcomingEvents[0] ?? null);

  return (
    <div className="grid lg:grid-cols-[280px_1fr] gap-4">
      <aside>
        <h3 className="text-sm font-semibold mb-2">Komende events</h3>
        {upcomingEvents.map(e => (
          <button
            key={e.id}
            onClick={() => setSelectedEvent(e)}
            className={`block w-full text-left p-3 rounded-md border min-h-[44px] ${selectedEvent?.id === e.id ? 'bg-stone-100' : 'bg-white'}`}
          >
            <div className="font-semibold">{e.name}</div>
            <div className="text-xs text-stone-600">{e.date} · {e.guests} gasten</div>
          </button>
        ))}
      </aside>
      <main>
        <ChatPanel
          contextLabel={selectedEvent ? `Coach voor ${selectedEvent.name}` : 'AI Pitmaster'}
          systemContext={selectedEvent ? `Event: ${selectedEvent.name}, ${selectedEvent.guests} gasten, type ${selectedEvent.type}. Geef directives, kerntemp-alerts, allergie-cross-refs. Hop & Bites context staat vast.` : 'BBQ-catering chef-coach. Hop & Bites context staat vast.'}
          apiRoute="/api/chef-coach"
          model="claude-haiku-4-5-20251001"
        />
      </main>
    </div>
  );
}
```

`ChatPanel` is de bestaande v2-component ([src/components/ai/ChatPanel.tsx](src/components/ai/ChatPanel.tsx), 668r) — verifieer of hij `contextLabel` + `systemContext` + `apiRoute` props ondersteunt; zo niet, voeg toe (zie cross-cutting § 10).

#### Chunk P0.18 — `/gerechten/menu-analyse` echte BCG-embed

Vervang stub-redirect met embedded BCG. Verplaats `BCGMatrix` component:

```bash
# verplaats component naar shared lib
mv src/app/marges/_components/BCGMatrix.tsx src/components/menu/BCGMatrix.tsx
```

Update [src/app/gerechten/menu-analyse/page.tsx](src/app/gerechten/menu-analyse/page.tsx):

```tsx
import { createSupabaseServerClient } from '@/lib/supabase/server';
import BCGMatrix from '@/components/menu/BCGMatrix';
import PageHeader from '@/components/PageHeader';

export const metadata = { title: 'Menu-analyse — Menu & Recepten' };

export default async function MenuAnalyseTab() {
  const supabase = await createSupabaseServerClient();
  // 90-dagen sales count uit gangen + marge uit gerechten
  const since = new Date(Date.now() - 90 * 86400_000).toISOString();

  const [{ data: gerechten }, { data: gangen }] = await Promise.all([
    supabase.from('gerechten').select('id, naam, kosten_pp, prijs_pp, marge_pct, populariteit_score'),
    supabase.from('gangen').select('gerecht_id, event_id').gte('created_at', since),
  ]);

  // sales-count per gerecht
  const salesCount = new Map<string, number>();
  (gangen ?? []).forEach(g => salesCount.set(g.gerecht_id, (salesCount.get(g.gerecht_id) ?? 0) + 1));

  const points = (gerechten ?? []).map(g => ({
    id: g.id,
    label: g.naam,
    x: salesCount.get(g.id) ?? 0,         // populariteit
    y: g.marge_pct ?? 0,                  // marge%
  }));

  return (
    <main className="p-4">
      <PageHeader title="Menu-analyse" description="Marge × populariteit per gerecht — sterren, puzzels, runners en bleeders." />
      <BCGMatrix points={points} />
    </main>
  );
}
```

`/marges/page.tsx` blijft bestaan voor Geld-hub context (marge over alle gerechten als KPI), maar de BCG-visualisatie wordt nu ook onder Menu-tab beschikbaar — geen duplicaat data, gedeelde component.

#### Chunk P0.19 — `_client.tsx` 1805r refactor

Doel: split per logische sub-area. Tab-componenten worden:

```
src/app/gerechten/
├── page.tsx              (✅ bestaat — Server wrapper)
├── _client.tsx           (REFACTOR: alleen tab-orchestrator, ~200r)
├── _tabs/
│   ├── DishList.tsx      (huidige lijst-rendering, ~400r)
│   ├── DishEditor.tsx    (huidige edit-modal, ~500r)
│   ├── DishBulkBar.tsx   (NEW P1.31)
│   └── DishFilters.tsx   (huidige filters, ~150r)
```

Patroon zoals Vandaag P0.1.

#### Chunk P0.20 — Componenten fysiek verplaatsen

```bash
mv src/app/inspiratie/componenten/page.tsx src/app/gerechten/componenten/page.tsx
# en update interne imports
```

Verifieer dat oude path-imports niet meer bestaan:

```bash
grep -rn "inspiratie/componenten" src/
```

`/inspiratie/componenten/` directory mag dan weg.

#### Chunk P0.21 — Server Actions voor gerecht-CRUD

Nieuw `src/app/gerechten/actions.ts` volgt patroon [Plannen P0.7](#chunk-p07-server-actions-voor-event-crud):

```ts
'use server';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '@/lib/supabase/server';

const GerechtSchema = z.object({
  id: z.string().uuid().optional(),
  naam: z.string().min(1).max(200),
  beschrijving: z.string().max(2000).optional(),
  kosten_pp: z.coerce.number().nonnegative(),
  prijs_pp: z.coerce.number().nonnegative(),
  yield_personen: z.coerce.number().int().positive().default(1),  // P1.28
  steps: z.array(z.object({
    nr: z.coerce.number().int().positive(),
    beschrijving: z.string(),
    photo_url: z.string().url().optional(),
  })).default([]),                                                  // P1.29
  // allergenen NIET in schema — die komen uit join-table (hard rule 2)
});

export async function upsertGerecht(input: unknown) {
  const parsed = GerechtSchema.safeParse(input);
  if (!parsed.success) return { error: 'validation', fields: parsed.error.flatten() };

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'unauthorized' };

  const { data, error } = await supabase.from('gerechten').upsert(parsed.data).select().single();
  if (error) return { error: error.message };

  revalidatePath('/gerechten');
  return { data };
}
```

#### Chunk P0.22 — `/bedenker` als sub-tab

Twee opties — kies #1:

**Optie 1 (recommend)**: laat `/bedenker` als route bestaan, voeg een tab toe in `_client.tsx`-tab-bar:

```tsx
// in tab-orchestrator van /gerechten
<HubTabs items={[
  { label: 'Gerechten',     href: '/gerechten' },
  { label: 'Componenten',   href: '/gerechten/componenten' },
  { label: 'Ingrediënten',  href: '/gerechten/ingredienten' },
  { label: 'Kookbord',      href: '/keuken/kookbord' },
  { label: 'AI Bedenker',   href: '/bedenker' },           // NEW
  { label: 'AI Pitmaster',  href: '/gerechten/ai-pitmaster' },
  { label: 'Menu-analyse',  href: '/gerechten/menu-analyse' },
  { label: 'Insights',      href: '/gerechten/insights' },
  { label: 'Allergen-queue',href: '/gerechten/allergen-queue' },
]} />
```

**Optie 2**: verplaats `/bedenker/` naar `/gerechten/bedenker/`. Meer werk, meer breaking-changes voor bookmarks. Niet aanbevolen.

#### Chunk P0.23 — Allergeen-hard-rule grep-audit

```bash
# zoek naar LLM-output die mogelijk allergeen-strings genereert
grep -rn "allerg" src/app/api/ | grep -iE "anthropic|messages.create|content\['text'\]"
grep -rn "allergens.naam\|allergens\\.\\(\\|insert.*allergens" src/ | head -20
```

Verifieer: AI mag classificeren naar allergen-`id`/`code`, code haalt `naam` op uit `allergens` tabel via lookup. Geen `INSERT INTO allergens(naam, ...)` met LLM-output.

### § 5.f Verificatie-checklist Menu & Recepten

- [ ] `/gerechten/ai-pitmaster` toont selecteerbare events + chat-stream (geen "Binnenkort" meer)
- [ ] `/gerechten/menu-analyse` toont BCG-quadrant met echte data — geen redirect
- [ ] `/inspiratie/componenten/page.tsx` bestaat niet meer; `/gerechten/componenten/page.tsx` is de echte file
- [ ] `_client.tsx` is <500r; tab-componenten staan in `_tabs/`
- [ ] `upsertGerecht` Server Action faalt op `prijs_pp: -5` met validation-error
- [ ] Allergeen-grep: 0 hits voor LLM-output → `allergens.naam`
- [ ] AI Pitmaster bookmark `?event=<id>` werkt → pre-selecteert event
- [ ] Pillar 1 acceptance: integration-test prijsverandering → marge-update <2s
- [ ] Pillar 3 acceptance: gerecht "Pulled Pork" met 5 stappen + foto's + yield 60 → schaal naar 90 → component-qty's × 1.5

---

> **Einde § 5 Menu & Recepten-hub.** Volgende turn: § 6 Voorraad-hub (`/voorraad` + `/inkoop` + `/leveranciers` + `/price-intelligence`).

---

## § 6. Hub: Voorraad — `/voorraad` + `/inkoop` + `/leveranciers` + `/price-intelligence`

> **Wat is dit?** Voorraadbeheer + inkoop + leveranciers + prijslijst-intelligentie. Bon-scanner OCR, par-levels met auto-reorder-suggesties, supplier-pricelist met alias-learning, en de unieke email-in route waar leveranciers PDFs naar `inbound@<tenant>.bbqarchitect.nl` sturen → AI extract → review queue.
> **Bedoelde IA-naam**: "Voorraad & Beheer". Sidebar: "Voorraad". Sub-tabs: Voorraad · Inkoop · Leveranciers · Prijzen.
> **Persona-fit**: Mathijs scant bonnen op de iPhone, beheert leveranciers op desktop. Pro-tier eigenaar: vergelijkbaar. Lars raakt deze hub niet.

### § 6.a Audit — huidige staat

**Hoofd-pages**:

| Page | File | Regels | Type |
|---|---|---|---|
| Voorraad-hub | [src/app/voorraad/page.tsx](src/app/voorraad/page.tsx) | **2037** | Client mega-file |
| Voorraad-historie per item | [src/app/voorraad/historie/\[id\]/page.tsx](src/app/voorraad/historie/[id]/page.tsx) | - | Detail |
| Inkoop | [src/app/inkoop/page.tsx](src/app/inkoop/page.tsx) | 449 | Client + `_components/BestelvoorstelLaan.tsx` |
| Leveranciers | [src/app/leveranciers/page.tsx](src/app/leveranciers/page.tsx) | 906 | Client |
| Leverancier-detail (prijslijsten) | [src/app/leveranciers/\[id\]/prijslijsten/page.tsx](src/app/leveranciers/[id]/prijslijsten/page.tsx) | - | Detail |
| Leverancier-historie | [src/app/leveranciers/historie/\[id\]/page.tsx](src/app/leveranciers/historie/[id]/page.tsx) | - | Audit |
| Bulk-upload prijslijsten | [src/app/leveranciers/bulk-upload/page.tsx](src/app/leveranciers/bulk-upload/page.tsx) | - | Bulk PDF/CSV |
| **Price-Intelligence** | [src/app/price-intelligence/page.tsx](src/app/price-intelligence/page.tsx) | **4600** | Client mega-file (grootste page in de app) |
| Extension-connect | [src/app/leveranciers/_components/ExtensionConnectPanel.tsx](src/app/leveranciers/_components/ExtensionConnectPanel.tsx) | - | Chrome-extensie panel — **memory `project_price_intelligence_email_in.md` zegt scraper-route AFGEWEZEN** — verifieer of dit dood is |

**DB-tabellen geraakt**: `inventory` · `bonnen` · `master_products` · `org_email_inbox` · `org_email_attachments` · `org_price_mutations` · `pricelists` · `supplier_prices` · `v_org_inbox_address` (view).

**API-routes**:
- Bonnen: `/api/bonnen` · `/api/bonnen/quick-upload` · `/api/bon-process` · `/api/boekhouder/bonnen` · `/api/boekhouder/bon-extract` · `/api/boekhouder/bon-commit`
- Pricelists: `/api/pricelists` · `/api/pricelists/uploads` · `/api/pricelists/batch` · `/api/pricelist-sync` · `/api/parse-pricelist`
- Suppliers: `/api/supplier-analysis` · `/api/supplier-products` · `/api/supplier-products/bulk` · `/api/ai/supplier-catalog-parse`
- Email-in: `/api/email/inbound` (de Cloudflare Email Worker target)
- Outgoing: `/api/send-email` (waarschijnlijk Resend)

**Feature-matrix**:

| Feature | Status | Bewijs |
|---|---|---|
| Voorraad-list met par/min levels | ✓ live | `voorraad/page.tsx` 2037r |
| Item-historie (movements) | ✓ live | `/voorraad/historie/[id]` |
| Manual stock adjustment | ✓ live | inferred uit page-size |
| Bon-scanner OCR (Sonnet vision) | ✓ live | `/api/boekhouder/bon-extract` |
| Bestelvoorstel (auto-reorder) | ✓ live | `inkoop/_components/BestelvoorstelLaan.tsx` |
| Leverancier CRUD | ✓ live | `leveranciers/page.tsx` 906r |
| Leverancier-prijslijsten | ✓ live | `[id]/prijslijsten/page.tsx` |
| Bulk-upload prijslijsten PDF/CSV | ✓ live | `leveranciers/bulk-upload/` |
| **Email-in route** voor pricelist PDF's | ✓ live | `/api/email/inbound` + `org_email_inbox` tabel |
| AI-extract PDF/scan naar pricelist | ✓ live | `/api/ai/supplier-catalog-parse` + memory: Sonnet 4.6 vision batch-25 |
| Alias-learning per tenant (CC 33CL = Coca-Cola 0.33L) | ✓ live | memory `project_pricelist_pdf_extractor.md` bevestigt |
| Review queue voor extracted mutaties | ✓ live | `org_price_mutations` tabel + UI in `/price-intelligence` |
| Price-mutation alerts (>5% verandering) | 🟡 partial | tabel bestaat, UI-alert onbevestigd |
| Supplier-pricelist comparison | ✓ live | `/api/supplier-analysis` + page in price-intelligence |
| Chrome-extensie scraper-route | 🔴 dood? | memory zegt afgewezen, maar `ExtensionConnectPanel.tsx` bestaat |
| Barcode-scanner mobile | ✓? | `BarcodeScanner.tsx` bestaat in `src/components/` |
| Multi-location inventory | ❌ | concurrent-pattern Apicbase — ontbreekt |
| CSV import/export voorraad | ❌ | concurrent-pattern Foodnotify — ontbreekt |
| Recipe-cost-impact bij prijsverandering | ✓ live | via `/api/gerechten/[id]/rollup` (Menu hub) |
| Server Component split | ❌ | `voorraad/page.tsx` 2037r is volledig Client |
| Server Actions voor voorraad-mutaties | ❌ | direct Supabase-mutate vanuit Client |
| Type-safety | 🟡 half | grote files = waarschijnlijk veel `any` |

### § 6.b Competitor sweep — top-3 "inventory + supplier + pricelist"

| Concurrent | Killer-feature | Wij vs hen |
|---|---|---|
| **Apicbase** | Realtime inventory + supplier-linked ingredient prices + auto-reorder + barcode-scan + multi-location + recipe-cost-impact alerts | Wij: inventory ✓, supplier-prices ✓, auto-reorder ✓, bon-OCR ✓, recipe-cost-impact ✓. **Multi-location ❌, barcode-scan-flow onbevestigd.** Apicbase wint op breedte, wij winnen op email-in. |
| **Foodnotify** (NL) | Inventory + supplier-pricelists + foodcost + CSV import/export + NL-conforme allergeen-codes + multi-vestiging | Wij missen CSV import/export + multi-vestiging. Wij winnen op AI-pricelist-extract uit PDF. |
| **Rentman** (NL evenement) | Materieel-voorraad + ge-koppelde offerte-cost-link + barcode + leverancier-portal | Wij hebben offerte-cost-link via `gerecht_components`. Wij missen materieel-voorraad-zicht (rentaal-equipment per event). |

**Onze unieke moats**:
1. **Email-in route voor leverancier-PDFs** — uniek in NL catering-SaaS. Cloudflare Email Worker → `/api/email/inbound` → AI-extract → review queue.
2. **Alias-learning per tenant** — herkent dat "CC 33CL" = "Coca-Cola 0.33L" voor jouw tenant, leert van jouw correcties.
3. **AI-extract uit foto + PDF + scan**: Sonnet 4.6 vision met batch-25 (memory `project_pricelist_pdf_extractor.md`).

**Waar ze ons verslaan** (= gaps, geen Anti-Pillars):
1. Apicbase: multi-location inventory, native barcode-scan-flow voor inkomende bestellingen
2. Foodnotify: CSV import/export, NL-conforme allergeen-tagging
3. Rentman: materieel/equipment-voorraad (rentaal-spullen per event)

### § 6.c Golden Pillars — Voorraad

**Pillar 1 — "Bon scannen op iPhone, voorraad bijgewerkt binnen 30s"** _(raise/Performance)_
- WHO: Mathijs of Pro-tier eigenaar net na boodschappen.
- WHAT: open `/factuur-lezer` → camera → foto bon → AI-extract → review-modal met geprefilde regels → bevestig → `inventory.current_stock += qty` per regel.
- WHEN: dagelijks tijdens inkoop-rondjes.
- HOW-MUCH: P50 tijd-tot-bevestigd <30s, P95 <60s. Sonnet vision extract <8s.
- **Anti-Pillar**: geen volledig-automatische-update zonder review — review-stap blijft (Apicbase doet dit ook met review).
- **Acceptance**: end-to-end test op iPhone Safari met 5-regel bon → 30s P50.

**Pillar 2 — "Email-in: leverancier mailt PDF naar je inbox-adres, prijswijzigingen staan klaar voor review"** _(create/Delighter — uniek)_
- WHO: Pro-tier eigenaar die leverancier-prijslijsten via mail krijgt.
- WHAT: Cloudflare Email Worker stuurt mail naar `/api/email/inbound` → opslag in `org_email_inbox` + `org_email_attachments` → trigger `/api/ai/supplier-catalog-parse` → extract met Sonnet vision batch-25 → review queue in `/price-intelligence`.
- WHEN: zodra mail binnenkomt (latency <5min).
- HOW-MUCH: extract-accuracy ≥90% van prijs-regels (alias-learning per tenant verbetert ratio).
- **Anti-Pillar**: geen scraper-route (memory: afgewezen). Geen automatische publish — review-queue verplicht.
- **Acceptance**: stuur test-PDF van Hop & Bites' leverancier → mail-inbox krijgt entry binnen 5min → review-queue toont N regels → klik "accepteer alle" → `supplier_prices` bijgewerkt.

**Pillar 3 — "Prijs ging >5% omhoog? Krijg een alert + lijst van geraakte gerechten"** _(raise/Must-be)_
- WHO: Mathijs of Pro-tier eigenaar wil marge bewaken.
- WHAT: bij elke `supplier_prices` mutatie waar nieuwe prijs >5% boven vorige is: insert in `marge_alerts` met `affected_gerechten` array.
- WHEN: bij elke pricelist-import of bon-scan.
- HOW-MUCH: 100% van >5% mutaties triggert alert binnen 60s na import.
- **Anti-Pillar**: geen e-mail of push-notificatie — alleen in-app banner op `/`. Concurrenten doen ook in-app.
- **Acceptance**: import test-pricelist met 1 product +10% prijs → `marge_alerts` rij verschijnt + `/` AttentionPanel toont kaart.

**Pillar 4 — "Auto-reorder-suggestie: par-level onder → BestelvoorstelLaan kan in 1 klik door"** _(raise/Performance)_
- WHO: Mathijs of Pro-tier eigenaar maakt weekelijkse inkooporder.
- WHAT: `/inkoop` toont `BestelvoorstelLaan` per leverancier met item × suggested-qty. 1-klik "Maak bestellijst" → exports per leverancier-mail/CSV.
- WHEN: weekelijks of triggered by `current_stock < par_level`.
- HOW-MUCH: 100% van items onder par krijgen suggestion. CSV-export <2s.
- **Anti-Pillar**: geen automatische bestelling-plaatsing zonder mensbevestiging (Apicbase doet ook review).
- **Acceptance**: Sam-test: voer 5 items onder par → `/inkoop` toont voorstel → exporteer → krijg per leverancier 1 CSV.

**Pillar 5 — "Supplier-pricelist met alias-learning: leert jouw afkortingen"** _(raise/Delighter)_
- WHO: tenant heeft eigen jargon voor producten ("CC 33CL", "Pulled X").
- WHAT: per tenant `supplier_alias` tabel met `(supplier_id, free_text, master_product_id)` — alias-learning bij review confirmeert mapping.
- WHEN: bij elke pricelist-import met onbekende product-string.
- HOW-MUCH: na 50 confirmed aliases per tenant ligt extract-accuracy ≥95%.
- **Anti-Pillar**: geen cross-tenant alias-sharing (privacy + brand-specific terms).
- **Acceptance**: import 2× zelfde leverancier-PDF; tweede keer 0 nieuwe aliases voor producten die ook in de eerste zaten.

### § 6.d Gap-list

**P0 — blocker voor v1.0**:

| # | Gap | Impact | Uren |
|---|---|---|---|
| P0.24 | **`voorraad/page.tsx` 2037r refactor + Server Component split** | LCP + onderhoudbaarheid (idem patroon Vandaag P0.1) | 10 |
| P0.25 | **`price-intelligence/page.tsx` 4600r refactor — split per tab** (inbox · review queue · prijsmutatie-historie · supplier-comparison) | 4600r is niet onderhoudbaar; risico per refactor; Sam's regel "100%-af" | 16 |
| P0.26 | **ExtensionConnectPanel dood-of-leven beslissen** — memory zegt scraper afgewezen | Code-rot of misleidende feature voor Pro-tier | 1 |
| P0.27 | **Server Actions voor voorraad-mutaties + bon-commit + pricelist-import** | hard rule 5 | 6 |
| P0.28 | **Price-mutation alert pipeline verifiëren** (Pillar 3) — `marge_alerts` insertion bij >5% mutaties | Pillar 3 niet ingelost zonder; concurrenten doen dit standaard | 4 |
| P0.29 | **Email-in flow end-to-end test** (Cloudflare Email Worker + `/api/email/inbound` + AI-extract + review queue) | Pillar 2 = onze grote moat — moet 100% werken | 3 (test) |
| P0.30 | **Type-safety pass voorraad + inkoop + leveranciers + price-intelligence** | 8000r totaal met `any` = bug-magnet | 8 |

**P1 — fix voor v1.0** (concurrent-patterns):

| # | Gap | Impact | Uren |
|---|---|---|---|
| P1.34 | **CSV import/export voor inventory** (Foodnotify standard) | NL Pro-tier wens; bulk-onboarding bij migratie van Excel | 4 |
| P1.35 | **Barcode-scan flow voor inkomende bestellingen** (Apicbase standard) — `BarcodeScanner` component bestaat, flow ontbreekt | NL Pro-tier wens | 6 |
| P1.36 | **Multi-location inventory** (Apicbase + Foodnotify) | Pro-tier met meer dan 1 opslag | 12 |
| P1.37 | Materieel/equipment inventory koppeling per event (Rentman-pattern, light versie) | Pro-tier event-catering wens | 8 |
| P1.38 | Supplier-portal: stuur bestellijst per email naar leverancier vanuit `/inkoop` | Concurrent-pattern Better Cater | 4 |
| P1.39 | Bon-OCR retry+queue voor failed extracts | Robustness | 3 |
| P1.40 | Pricelist version-diff visualisatie (wat is er veranderd t.o.v. vorige import) | Power-user wens | 4 |

**P2 — nice-to-have**:

| # | Gap | Impact | Uren |
|---|---|---|---|
| P2.16 | Voorraad-tellings-mode (handmatige tel-ronde op tablet) | Operations-detail | 6 |
| P2.17 | Voorraad-waarde-rapport per maand-eind (boekhouder) | Hoort eigenlijk bij Geld-hub | 3 |
| P2.18 | Voorspellings-model voor reorder-tijdstip (ML, simpele moving-average is genoeg) | Power-user analytics | 8 |

### § 6.e Ready-to-build chunks

#### Chunk P0.24+P0.25 — Server Component split voor mega-files

Standaard patroon (zie [Vandaag P0.1](#chunk-p01-server-component-split-parallel-queries)):

- `/voorraad/page.tsx` (2037r) → Server wrapper + `_components/VoorraadClient.tsx` (split per tab: items · historie · adjustments · suppliers-link)
- `/price-intelligence/page.tsx` (4600r) → Server wrapper + 4 tab-components (`_tabs/InboxTab.tsx` · `ReviewQueueTab.tsx` · `MutationHistoryTab.tsx` · `SupplierComparisonTab.tsx`)

Beide pakken initial-data via Server `Promise.all` met:

```ts
const [inventory, pricelists, mutations, suppliers, emailInbox] = await Promise.all([
  supabase.from('inventory').select('*').limit(1000),
  supabase.from('pricelists').select('*').order('created_at', { ascending: false }).limit(200),
  supabase.from('org_price_mutations').select('*').eq('status', 'pending'),
  supabase.from('master_products').select('*').limit(2000),
  supabase.from('org_email_inbox').select('*').order('received_at', { ascending: false }).limit(50),
]);
```

#### Chunk P0.26 — ExtensionConnectPanel dood-of-leven

Verifieer:

```bash
grep -rn "ExtensionConnectPanel" src/ | grep -v "_components/"
```

Als enkel import = direct vanuit `leveranciers/page.tsx` of dergelijk, en memory zegt scraper afgewezen, dan:

```bash
git rm src/app/leveranciers/_components/ExtensionConnectPanel.tsx
# remove import line in leveranciers/page.tsx
```

Alternatief: als de extensie iets ANDERS doet dan scrapen (bv "import van webshop-order"), behoud + documenteer scope expliciet als P1 follow-up.

#### Chunk P0.27 — Server Actions voor voorraad-mutaties

Nieuw `src/app/voorraad/actions.ts` (patroon zie Plannen P0.7):

```ts
'use server';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '@/lib/supabase/server';

const AdjustSchema = z.object({
  inventory_id: z.string().uuid(),
  delta: z.coerce.number(),
  reason: z.enum(['scan', 'manual', 'reconcile', 'bon', 'waste']),
  note: z.string().max(500).optional(),
});

export async function adjustInventory(input: unknown) {
  const parsed = AdjustSchema.safeParse(input);
  if (!parsed.success) return { error: 'validation', fields: parsed.error.flatten() };

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'unauthorized' };

  // Transactie: update inventory + insert movement (audit trail)
  const { data: item } = await supabase
    .from('inventory')
    .select('current_stock')
    .eq('id', parsed.data.inventory_id)
    .single();
  if (!item) return { error: 'not_found' };

  const newStock = (item.current_stock ?? 0) + parsed.data.delta;
  if (newStock < 0) return { error: 'negative_stock_not_allowed' };

  const { error: updateErr } = await supabase
    .from('inventory')
    .update({ current_stock: newStock })
    .eq('id', parsed.data.inventory_id);
  if (updateErr) return { error: updateErr.message };

  await supabase.from('inventory_movements').insert({
    inventory_id: parsed.data.inventory_id,
    delta: parsed.data.delta,
    reason: parsed.data.reason,
    note: parsed.data.note,
    user_id: user.id,
    new_stock: newStock,
  });

  revalidatePath('/voorraad');
  return { data: { newStock } };
}
```

#### Chunk P0.28 — Price-mutation alert pipeline

**Migration** (PROPOSED — verifieer eerst dat `marge_alerts` schema ondersteunt):

```sql
-- supabase/migrations/20260519130000_price_mutation_triggers.sql
create or replace function trg_pricelist_change_alert()
returns trigger
language plpgsql
security definer
as $$
declare
  v_old_price numeric;
  v_delta_pct numeric;
  v_org_id uuid;
  v_affected_gerechten uuid[];
begin
  -- vergelijk met vorige prijs voor dezelfde supplier-product combo
  select max(price) into v_old_price
    from supplier_prices
    where supplier_id = NEW.supplier_id
      and master_product_id = NEW.master_product_id
      and id <> NEW.id;

  if v_old_price is null or v_old_price = 0 then
    return NEW;
  end if;

  v_delta_pct := ((NEW.price - v_old_price) / v_old_price) * 100;

  if v_delta_pct >= 5 then
    -- vind alle gerechten die deze ingredient gebruiken
    select array_agg(distinct gc.gerecht_id) into v_affected_gerechten
      from gerecht_components gc
      join components c on c.id = gc.component_id
      where NEW.master_product_id = any(c.ingredient_ids);

    select org_id into v_org_id from supplier_prices where id = NEW.id;

    insert into marge_alerts (org_id, type, severity, payload, status)
    values (
      v_org_id,
      'price_increase',
      case when v_delta_pct >= 15 then 'high' when v_delta_pct >= 10 then 'medium' else 'low' end,
      jsonb_build_object(
        'master_product_id', NEW.master_product_id,
        'supplier_id', NEW.supplier_id,
        'old_price', v_old_price,
        'new_price', NEW.price,
        'delta_pct', v_delta_pct,
        'affected_gerechten', v_affected_gerechten
      ),
      'open'
    );
  end if;

  return NEW;
end;
$$;

create trigger after_supplier_prices_change
  after insert on supplier_prices
  for each row execute function trg_pricelist_change_alert();
```

**Belangrijk**: `security definer` betekent dat de trigger met owner-rechten draait — verifieer dat `marge_alerts.org_id` correct gezet wordt (RLS controle = via org_id-derivation uit `supplier_prices`).

#### Chunk P0.29 — Email-in flow test-script

Maak een handmatige test-runbook in [docs/runbooks/email-in-test.md](docs/runbooks/email-in-test.md):

1. Inbox-adres ophalen uit `v_org_inbox_address` view voor jouw tenant
2. Stuur PDF naar `inbox-<unique-id>@bbqarchitect.nl`
3. Wacht max 5min
4. Check `select * from org_email_inbox order by received_at desc limit 5` — entry zichtbaar
5. Check `select * from org_email_attachments where email_id = <id>` — PDF opgeslagen
6. Trigger handmatig of via cron: `/api/ai/supplier-catalog-parse` → AI-extract
7. Open `/price-intelligence` → review queue toont N regels
8. Klik "Accepteer" op 1 regel → `supplier_prices` rij toegevoegd

Geen code-wijziging, alleen runbook + manual-test. Als step 2-3 niet werkt: Cloudflare Email Worker config check.

#### Chunk P0.30 — Type-safety pass

Standaard patroon zie [Vandaag P0.3](#chunk-p03-type-safety-pass). Voorraad heeft de meeste `any`s — verwacht ~50-100 `any`-casts in voorraad/page.tsx en 200+ in price-intelligence/page.tsx. Mogelijk eerst Server Component splits (P0.24+P0.25) en daarna type-safety per kleine file.

### § 6.f Verificatie-checklist Voorraad

- [ ] `voorraad/page.tsx` <500r, tab-componenten in `_components/`
- [ ] `price-intelligence/page.tsx` <500r, 4 tabs in `_tabs/`
- [ ] `ExtensionConnectPanel` ofwel verwijderd ofwel met expliciete P1 follow-up
- [ ] `adjustInventory` Server Action faalt op negative-result-stock
- [ ] Price-mutation trigger: insert test-row in `supplier_prices` met +10% → `marge_alerts` row binnen 1s
- [ ] Email-in runbook stappen 1-8 succesvol uitgevoerd door Sam
- [ ] `pnpm typecheck` 0 errors voor `voorraad/`, `inkoop/`, `leveranciers/`, `price-intelligence/`
- [ ] Pillar 1 acceptance: iPhone-Safari-test bon → 30s P50 inventory-update
- [ ] Pillar 5 acceptance: tweede pricelist-import herkent ≥95% aliases

---

> **Einde § 6 Voorraad-hub.** Volgende turn: § 7 Geld-hub.

---

## § 7. Hub: Geld — `/financien` + `/uren` + `/factuur-lezer` + `/geld/boekhouder` + `/administratie/rittenregistratie`

> **Wat is dit?** Financiële command-center. Dashboard met omzet × marge × BTW, uren-registratie, bon-OCR met RGS-classificatie, maandpakket voor de boekhouder (RGS-CSV + UBL), en rittenregistratie sluitend voor de Belastingdienst (€0.23/km). Moneybird-koppeling pusht facturen door zonder dubbel-werk.
> **Bedoelde IA-naam**: "Geld & Boekhouding". Sidebar: "Geld". Sub-tabs: Financiën · Uren · Bonnen & Facturen · Boekhouder · Rittenregistratie.
> **Persona-fit**: Mathijs (eigenaar + admin) leeft hier maand-eind, Pro-tier eigenaar idem; Lars raakt deze hub nooit.

### § 7.a Audit — huidige staat

**Hoofd-pages**:

| Page | File | Regels | Type |
|---|---|---|---|
| Financiën-hub | [src/app/financien/page.tsx](src/app/financien/page.tsx) | 673 | Client, 5 tabs (dashboard · wv · uitgaven · btw · clients) |
| Uren | [src/app/uren/page.tsx](src/app/uren/page.tsx) | 215 | Client |
| Uren-personeel | `src/app/uren/personeel/page.tsx` | - | sub-tab |
| Bonnen & Facturen | [src/app/factuur-lezer/page.tsx](src/app/factuur-lezer/page.tsx) | 113 | Client hub-page (bonnen + photos + pricelists overzicht) |
| Boekhouder-export | [src/app/geld/boekhouder/page.tsx](src/app/geld/boekhouder/page.tsx) | 1019 | Client, RGS + UBL export |
| Rittenregistratie | [src/app/administratie/rittenregistratie/page.tsx](src/app/administratie/rittenregistratie/page.tsx) | 13 (Server wrapper) + `_client.tsx` | ✅ Server/Client split |
| Geld-hub-redirect | [src/app/geld/page.tsx](src/app/geld/page.tsx) | 5 | Redirect → `/financien` |

**DB-tabellen geraakt** (verwacht — verifieer): `offertes` · `facturen` · `bonnen` · `bon_items` · `events` · `inventory` · `time_logs` · `administratie_ritten` · `accounting_config` · `moneybird_connections` (P0.12).

**API-routes**:
- `/api/today-briefing` (gebruikt door Vandaag, niet Geld direct)
- `/api/boekhouder/bon-extract` — Sonnet vision OCR
- `/api/boekhouder/bon-commit` — bevestiging bon → `bon_items`
- `/api/boekhouder/classify` — Sonnet classification → RGS-code
- `/api/boekhouder/facturen` — push naar Moneybird
- `/api/accounting/moneybird` — generieke Moneybird OAuth-call
- `/api/ritten/moneybird-push` — ritten naar Moneybird

**Feature-matrix**:

| Feature | Status | Bewijs |
|---|---|---|
| Dashboard tab (omzet, food cost, labor, marge) | ✓ live | `financien/page.tsx` |
| 5-tab structuur (dashboard/wv/uitgaven/btw/clients) | ✓ live | uit eerdere agent-mapping |
| Maandelijkse W&V (omzet × COGS × labor × netto) | ✓ live | uit financien tabs |
| BTW-samenvatting per maand (incoming + outgoing) | ✓ live | btw-tab |
| Top-klanten ranking | ✓ live | clients-tab |
| 12-maand revenue forecast | ✓ live | uit eerdere mapping |
| Uren-registratie + punch clock | ✓ live | `uren/page.tsx` 215r |
| Uren personeel-summary | ✓ live | `uren/personeel/` |
| Bon-OCR (Sonnet vision) | ✓ live | `/api/boekhouder/bon-extract` |
| Bon RGS-classificatie | ✓ live | `/api/boekhouder/classify` |
| Bon-commit naar `bon_items` | ✓ live | `/api/boekhouder/bon-commit` |
| Boekhouder-maandpakket (RGS-CSV) | ✓ live | `geld/boekhouder/page.tsx` 1019r |
| UBL/Peppol export per factuur | ❌ | concurrent-pattern voor B2G nu / B2B 2030 — ontbreekt |
| Rittenregistratie €0.23/km 2026 | ✓ live | `administratie/rittenregistratie/` ✅ Server/Client split al |
| Rittenregistratie naar Moneybird push | ✓ live | `/api/ritten/moneybird-push` |
| Moneybird factuur-push | ✓ live | `/api/accounting/moneybird` |
| Foodcost-ratio (food/revenue) | ✓ live | uit wv-tab |
| Labor-ratio (labor cost / revenue) | 🟡 partial | hardcoded `LABOR_COST_PER_HOUR = €35` per agent-mapping; verifieer |
| Cashflow-statement | ❌ | concurrent-pattern Moneybird — niet kritiek (Moneybird heeft het al) |
| Foto-archief van bonnen | ✓ live | `/foto-archief` (apart in Systeem-hub) |
| Server Component split financien | ❌ | 673r Client |
| Server Component split boekhouder | ❌ | 1019r Client |
| Server Actions voor financiën-mutaties (manual W&V adjustments) | ❌ | direct mutate |
| Type-safety | 🟡 half | verifieer per file |

### § 7.b Competitor sweep — top-3 "financieel-zicht voor catering"

| Concurrent | Killer-feature | Wij vs hen |
|---|---|---|
| **Moneybird** (NL boekhouding) | Volledige boekhouding: facturen, bonnen, BTW-aangifte, rapportages, jaarafsluiting. €15-30/mnd. | Wij **vervangen Moneybird niet** — we koppelen ernaartoe. Wij zijn catering-specifieke laag erbovenop (food/labor-ratio, event-revenue, RGS-precomputed). Anti-Pillar: geen volledige boekhouding-features. |
| **Caterease** | Revenue per event-type, deposit-status, outstanding-balances, foodcost ratio. | Wij hebben dezelfde KPI's via financien-tabs + offertes-status. Wij winnen op NL-conform (BTW splits, RGS, UBL). |
| **Toast POS** | Daily-sales-report, labor-cost-tracking met live punch-clock, integration met payroll. | Wij hebben uren met punch-clock (`/uren`), labor-ratio in W&V. **Geen payroll-integration met NL-payroll-providers** (Nmbrs, AFAS, Loket). Dat is een gap (P1). |

**Onze unieke moats**:
1. **Catering-specifieke W&V**: food-cost komt automatisch uit gerecht-component-cascade (Menu-hub) — geen handmatige toewijzing nodig. Moneybird doet dit niet automatisch.
2. **RGS-precomputed met AI**: Sonnet classification op bon-regels → 8 RGS-codes — Moneybird laat je handmatig categoriseren.
3. **Rittenregistratie native met €0.23/km 2026** — geen aparte tool nodig.

**Waar ze ons verslaan** (gaps):
1. Moneybird: jaarafsluiting, BTW-aangifte direct vanuit app
2. Toast: payroll-export naar NL-providers
3. Caterease: deposit-tracking per event (wij hebben offerte-status maar geen aparte deposit-administratie)

### § 7.c Golden Pillars — Geld

**Pillar 1 — "Open `/financien`, weet binnen 10 seconden hoe deze maand staat"** _(raise/Performance)_
- WHO: Mathijs maand-eind, Pro-tier eigenaar idem.
- WHAT: dashboard-tab toont: omzet · COGS · labor · netto · marge% · BTW-balans. 6 KPI's + 2 charts (revenue per maand + uitgaven per categorie).
- WHEN: dagelijks of maand-eind.
- HOW-MUCH: LCP <1.5s, dashboard-tab interactief binnen 2s.
- **Anti-Pillar**: geen YTD-totalen vóór maand-totalen — focus op huidige maand bovenaan.
- **Acceptance**: Lighthouse op `/financien` mobile ≥90 Performance.

**Pillar 2 — "BTW-overzicht NL-conform, klaar voor aangifte"** _(raise/Must-be — hard rule 1)_
- WHO: Mathijs / Pro-tier eigenaar per kwartaal-aangifte.
- WHAT: btw-tab toont: per maand omzet × 9% / 21% / 0% splits, incoming-VAT uit bonnen × categorie, te-betalen / te-vorderen saldo. **Alle splits uit `BTW_RULES_2026` lookup, niet AI-derived.**
- WHEN: maand-eind + kwartaal-eind.
- HOW-MUCH: 100% van facturen + bonnen-regels heeft `btw_pct` uit lookup. Verschil incoming/outgoing klopt op de cent met Moneybird's saldo.
- **Anti-Pillar**: geen automatische aangifte-indiening — wij produceren bestand, mens dient in via Moneybird of belastingdienst-portaal.
- **Acceptance**: code-grep: `btw_pct.*from.*anthropic` = 0 hits. Test-tenant met 50 mock-facturen + 50 mock-bonnen → BTW-saldo correct.

**Pillar 3 — "Maandpakket boekhouder: 1 ZIP met RGS-CSV + UBL-XML's + PDF-facturen"** _(raise/Performance)_
- WHO: externe boekhouder, maand-eind.
- WHAT: `/geld/boekhouder` → kies maand → "Download maandpakket" → ZIP met `rgs_journaal.csv` + 1 UBL-XML per factuur + 1 PDF per factuur + `bonnen.csv`.
- WHEN: maandelijks.
- HOW-MUCH: ZIP-generatie <30s voor 200 facturen + 500 bonnen.
- **Anti-Pillar**: geen real-time-sync naar boekhouder-cloud — handmatige download is wat NL-boekhouders willen.
- **Acceptance**: Sam test: maandpakket maart 2026 → download → opent in Excel + iboekhouden ✓.

**Pillar 4 — "Bon scannen → AI classificeert → RGS-code voorgesteld, mens bevestigt"** _(raise/Delighter)_
- WHO: Mathijs of Pro-tier eigenaar dagelijks.
- WHAT: foto van bon → `/api/boekhouder/bon-extract` (Sonnet vision) → regels → `/api/boekhouder/classify` (Sonnet text) → voorgestelde RGS-code per regel → review-modal → `/api/boekhouder/bon-commit`.
- WHEN: dagelijks.
- HOW-MUCH: extract-accuracy ≥85%, classify-accuracy ≥80% (gemeten over 100 sample bonnen).
- **Anti-Pillar**: geen automatische commit zonder review (Moneybird laat het ook reviewen).
- **Acceptance**: Promptfoo eval `evals/bon-classify.eval.yaml` met 30 sample-bonnen → ≥24 correct.

**Pillar 5 — "Rittenregistratie sluitend voor Belastingdienst"** _(raise/Must-be — NL-compliance)_
- WHO: Mathijs / Pro-tier eigenaar met zakelijk-vervoer.
- WHAT: per rit: datum, van, naar, km, zakelijk-flag. Maand-overzicht met `km × €0.23 = aftrek`. Jaaroverzicht-export PDF.
- WHEN: dagelijks of weekelijks.
- HOW-MUCH: rit-invoer <30s, geen velden anders dan minimum-Belastingdienst-eisen.
- **Anti-Pillar**: geen GPS-tracking-automatisering — privacy-bezwaar + complexiteit > waarde.
- **Acceptance**: rit-export voor 2026 → klopt met Moneybird-ritten + Belastingdienst-jaaropgave-format.

### § 7.d Gap-list

**P0 — blocker voor v1.0**:

| # | Gap | Impact | Uren |
|---|---|---|---|
| P0.31 | **`financien/page.tsx` 673r Server Component split** | LCP + patroon-consistentie | 5 |
| P0.32 | **`geld/boekhouder/page.tsx` 1019r Server Component split** | Idem; maandpakket-generatie kan deels Server-side | 6 |
| P0.33 | **BTW-rules code-audit (hard rule 1)**: verifieer dat overal `BTW_RULES_2026` lookup gebruikt wordt, nergens AI-derived | hard rule 1 verificatie | 2 |
| P0.34 | **Labor-cost hardcoded €35/u uit `LABOR_COST_PER_HOUR`** vervangen door per-tenant config in `accounting_config` tabel | Pro-tier eigenaren hebben verschillende rates | 3 |
| P0.35 | **Server Actions voor manual W&V adjustments + bon-commit + ritten-CRUD** | hard rule 5 | 6 |
| P0.36 | **Type-safety pass `financien`, `boekhouder`, `uren`** | bug-magnet, complianced kritiek | 4 |
| P0.37 | **Bon-classify Promptfoo eval** (Pillar 4 acceptance) | LLM-quality verifieer voor ship | 3 |

**P1 — fix voor v1.0** (concurrent-patterns):

| # | Gap | Impact | Uren |
|---|---|---|---|
| P1.41 | **UBL/Peppol BIS 3.0 export per factuur** | Moet voor B2G nu + B2B 2030 — concurrent-pattern Moneybird heeft basis-UBL | 8 |
| P1.42 | **Payroll-export naar Nmbrs/AFAS/Loket** (CSV met uren × rate) | Pro-tier wens, Toast-pattern | 6 |
| P1.43 | **Deposit-tracking per event** (Caterease-pattern) — aanbetaling × event vs factuur-totaal | NL-conform, klant-vertrouwen | 4 |
| P1.44 | **Cashflow 12-maand-forecast** met confirmed offertes + recurring contracts | Moneybird heeft dit basis | 6 |
| P1.45 | **Foodcost-ratio realtime per event** (live van menu-engineering BCG) | Catering-specifieke moat | 3 |
| P1.46 | **BTW-aangifte-PDF-template** (NL-Belastingdienst-formaat) | Mathijs spaart 2u/kwartaal | 4 |
| P1.47 | **Bon-OCR confidence-score in review UI** — toon AI-zekerheid per regel | UX-clarity | 2 |

**P2 — nice-to-have**:

| # | Gap | Impact | Uren |
|---|---|---|---|
| P2.19 | Jaarafsluiting-workflow (Moneybird-pattern) | Moneybird doet dit beter — niet kritiek | 12 |
| P2.20 | Multi-currency support (BE/DE klanten in NL boekhouding) | Niet kern in 2026 | 12 |
| P2.21 | Voorraadwaarde-rapport voor balans (jaar-eind tellen) | Hoort gedeeld met Voorraad-hub P2.17 | 4 |

### § 7.e Ready-to-build chunks

#### Chunk P0.31+P0.32 — Server Component split financien + boekhouder

Patroon zie [Vandaag P0.1](#chunk-p01-server-component-split-parallel-queries). Specifiek voor `/geld/boekhouder`: de zware ZIP-generatie (PDFs + UBL-XMLs samenvoegen) moet Server-side draaien — niet client-zip.

```ts
// app/geld/boekhouder/actions.ts
'use server';
import { z } from 'zod';
import JSZip from 'jszip';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { generateInvoicePDF, generateInvoiceUBL, generateRgsJournaal } from '@/lib/boekhouder';

const Schema = z.object({
  year: z.coerce.number().int().min(2024).max(2030),
  month: z.coerce.number().int().min(1).max(12),
});

export async function downloadMaandpakket(input: unknown) {
  const parsed = Schema.safeParse(input);
  if (!parsed.success) return { error: 'validation' };

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'unauthorized' };

  const monthStart = new Date(parsed.data.year, parsed.data.month - 1, 1).toISOString();
  const monthEnd = new Date(parsed.data.year, parsed.data.month, 1).toISOString();

  const [{ data: facturen }, { data: bonnen }] = await Promise.all([
    supabase.from('facturen').select('*, klanten(*)').gte('datum', monthStart).lt('datum', monthEnd),
    supabase.from('bonnen').select('*, bon_items(*)').gte('datum', monthStart).lt('datum', monthEnd),
  ]);

  const zip = new JSZip();
  zip.file('rgs_journaal.csv', generateRgsJournaal(facturen ?? [], bonnen ?? []));
  zip.file('bonnen.csv', bonnenToCSV(bonnen ?? []));

  for (const f of facturen ?? []) {
    zip.file(`facturen/${f.factuurnummer}.pdf`, await generateInvoicePDF(f));
    zip.file(`facturen/${f.factuurnummer}.ubl.xml`, generateInvoiceUBL(f));
  }

  const buf = await zip.generateAsync({ type: 'nodebuffer' });
  // Return base64 of stream depending on Next.js Server Actions limits
  return { data: { zip: buf.toString('base64'), filename: `maandpakket-${parsed.data.year}-${String(parsed.data.month).padStart(2,'0')}.zip` } };
}
```

#### Chunk P0.33 — BTW-rules code-audit

```bash
# Zoek alle plekken waar BTW-percentage gezet wordt
grep -rn "btw_pct\|btw_rate\|btw\\.pct\|btw\\.rate" src/ | grep -v "BTW_RULES_2026\|btw_rates\\.from"

# Verwacht: alle hits gebruiken constante OF DB-lookup, nooit LLM-output
```

Per file: bevestig dat `btw_pct` waarde komt uit `BTW_RULES_2026.find(...)` of `supabase.from('btw_rates')`. Onbevestigde plekken → fix.

`src/lib/btw-rules.ts` (volg P0.15 in Verkoop-hub):

```ts
export const BTW_RULES_2026 = [
  { category: 'food_catering', rate: 0.09, label: 'Voedingsmiddelen catering' },
  { category: 'food_takeaway', rate: 0.09, label: 'Voedingsmiddelen afhalen' },
  { category: 'service_personnel', rate: 0.21, label: 'Bediening/personeel' },
  { category: 'alcohol', rate: 0.21, label: 'Alcoholische dranken' },
  { category: 'transport', rate: 0.21, label: 'Bezorging' },
  { category: 'equipment_rental', rate: 0.21, label: 'Materieel-verhuur' },
  { category: 'b2b_intra_eu_reverse', rate: 0.00, label: 'B2B intracommunautair (reverse charge)' },
] as const;

export type BtwCategory = typeof BTW_RULES_2026[number]['category'];
export function getBtwRate(category: BtwCategory): number {
  const rule = BTW_RULES_2026.find(r => r.category === category);
  if (!rule) throw new Error(`Unknown btw category: ${category}`);
  return rule.rate;
}
```

#### Chunk P0.34 — Per-tenant labor-rate config

**Migration** (PROPOSED):

```sql
-- supabase/migrations/20260519140000_tenant_labor_config.sql
alter table accounting_config
  add column if not exists labor_cost_per_hour numeric not null default 35.00,
  add column if not exists labor_cost_per_hour_weekend numeric not null default 42.00;

-- backfill bestaande tenants met €35
update accounting_config set labor_cost_per_hour = 35.00 where labor_cost_per_hour is null;
```

Lees in `/financien` via:

```ts
const { data: cfg } = await supabase.from('accounting_config').select('*').single();
const laborRate = cfg?.labor_cost_per_hour ?? 35;
```

Plus UI in `/instellingen` voor Pro-tier eigenaar om aan te passen.

#### Chunk P0.35 — Server Actions

Patroon zoals voorgaande hubs. Nieuw `src/app/uren/actions.ts` voor punch-in/punch-out + `src/app/administratie/rittenregistratie/actions.ts` voor rit-CRUD (waarschijnlijk al deels aanwezig — verifieer).

#### Chunk P0.36 — Type-safety pass

Specifiek voor Geld-hub: `Factuur`, `Bon`, `BonItem`, `Rit`, `TimeLog`, `AccountingConfig` types uit `database.types.ts`. Verwijder `eslint-disable` per file.

#### Chunk P0.37 — Bon-classify Promptfoo eval

```yaml
# evals/bon-classify.eval.yaml
description: AI moet bon-regels naar RGS-code classificeren (8 categorieën)
prompts:
  - file://prompts/bon-classify.md
providers:
  - anthropic:messages:claude-haiku-4-5-20251001
tests:
  - vars: { regel: "Albert Heijn — Pulled pork €18,99" }
    assert:
      - type: equals
        path: rgs_code
        value: "7000-ingredients"
  - vars: { regel: "Esso tankstation — €68,00" }
    assert:
      - type: equals
        path: rgs_code
        value: "7700-vehicle-fuel"
  - vars: { regel: "Booking.com hotel Amsterdam — €145,00" }
    assert:
      - type: equals
        path: rgs_code
        value: "7800-travel-accommodation"
  # ... 27 meer cases
```

Met de 30 cases: target accuracy ≥80% (Pillar 4 acceptance).

### § 7.f Verificatie-checklist Geld

- [ ] `financien/page.tsx` <300r, tabs in `_tabs/`
- [ ] `geld/boekhouder/page.tsx` <300r, ZIP-generatie via Server Action
- [ ] `grep -rn "btw_pct" src/` → alle hits via `BTW_RULES_2026` of `btw_rates`
- [ ] `accounting_config.labor_cost_per_hour` instelbaar; `/financien` gebruikt deze, niet hardcoded €35
- [ ] Promptfoo `evals/bon-classify.eval.yaml` ≥24/30 (80%)
- [ ] Pillar 3 acceptance: download maart-pakket → ZIP <30s, opent in Excel + iboekhouden
- [ ] Pillar 5 acceptance: jaar-export rittenregistratie 2026 → format-check Belastingdienst-OK
- [ ] RLS: test-tenant B kan tenant A's facturen niet zien in `/financien` of `/geld/boekhouder`

---

> **Einde § 7 Geld-hub.** Volgende turn: § 8 Systeem-hub.

---

## § 8. Hub: Systeem — `/systeem` + `/instellingen` + `/gebruikers` + `/mailbox` + `/website` + `/foto-archief` + `/hulp` + `/admin`

> **Wat is dit?** De back-office laag. Bedrijfsprofiel + integraties + gebruikers + email-templates + publieke website + foto-archief + help-center. Plus admin-tools voor platform-beheer (alleen platform-admins) en de activation-funnel.
> **Bedoelde IA-naam**: "Instellingen & Hulp". Sidebar: "Systeem" (secondary). Sub-tabs: Instellingen · Gebruikers · Integraties · Mailbox · Website · Foto-archief · Help · Platform Beheer.
> **Persona-fit**: Mathijs (eigenaar + admin) bezet deze hub vooral bij setup en maandelijks onderhoud, Pro-tier eigenaar idem; Lars nooit.

### § 8.a Audit — huidige staat

**Hoofd-pages**:

| Page | File | Regels | Status |
|---|---|---|---|
| Systeem-hub-landing | [src/app/systeem/page.tsx](src/app/systeem/page.tsx) | 141 | Client, hub-cards |
| Instellingen | [src/app/instellingen/page.tsx](src/app/instellingen/page.tsx) | 569 | Client, bedrijfsprofiel + voorkeuren |
| Integraties | [src/app/instellingen/integraties/page.tsx](src/app/instellingen/integraties/page.tsx) | 447 | Mollie + Moneybird + Google Cal config |
| Integraties — Accounting | [src/app/instellingen/integraties/accounting/page.tsx](src/app/instellingen/integraties/accounting/page.tsx) | 280 | Moneybird specifiek (RGS-config) |
| AI-usage-meter | [src/app/instellingen/ai-usage/page.tsx](src/app/instellingen/ai-usage/page.tsx) | 334 | Monthly Anthropic-spend per feature |
| Data-export (AVG) | [src/app/instellingen/data-export/page.tsx](src/app/instellingen/data-export/page.tsx) | 146 | Article 15/20 export |
| Referral | [src/app/instellingen/referral/page.tsx](src/app/instellingen/referral/page.tsx) | 177 | Invite-link + tracking |
| Gebruikers | [src/app/gebruikers/page.tsx](src/app/gebruikers/page.tsx) | 241 | Team + rollen |
| Mailbox | [src/app/mailbox/page.tsx](src/app/mailbox/page.tsx) | 577 | Email-templates + history |
| Website | [src/app/website/page.tsx](src/app/website/page.tsx) | 890 | Publieke-site branding |
| Foto-archief | [src/app/foto-archief/page.tsx](src/app/foto-archief/page.tsx) | 484 | Gescande bonnen + facturen + documenten |
| Hulp | [src/app/hulp/page.tsx](src/app/hulp/page.tsx) | 363 | Help-center + FAQ |
| Hulp-sitemap | `src/app/hulp/sitemap/page.tsx` | - | Doc-navigation-tree |
| Admin | [src/app/admin/page.tsx](src/app/admin/page.tsx) | 956 | Platform-admin only (orgs + users) |
| Admin-funnel | [src/app/admin/funnel/page.tsx](src/app/admin/funnel/page.tsx) | 376 | Activation-funnel; **mist 5 KPI's per ux-master.md** |

**DB-tabellen geraakt**: `organizations` · `settings` · `accounting_config` · `referrals` · `ai_usage` · `activation_events` · `activation_funnel` · `organization_members` · `email_templates` (verwacht) · `offertes` (in admin overview).

**API-routes voor Systeem**:
- `/api/org/` · `/api/org/accept-invite` — org CRUD
- `/api/data-export` — async AVG-export (verifieer)
- `/api/onboarding/seed-demo` — **bestaat dit?** ux-master.md zegt het ontbreekt
- `/api/admin/...` — platform-admin endpoints (verifieer)
- `/api/extension-keys` — API-keys voor Chrome-extensie (memory: extensie afgewezen?)
- `/api/email/...` — template CRUD + send

**Feature-matrix**:

| Feature | Status | Bewijs |
|---|---|---|
| Bedrijfsprofiel (naam/adres/logo) | ✓ live | `instellingen/page.tsx` |
| 5×8 brand-token-systeem | ✓ live | migration `018_settings_full_brand_tokens.sql` |
| Voorkeuren (default margin, labor cost, language) | ✓ live | `instellingen/page.tsx` |
| Integraties-overzicht (Moneybird/Mollie/Google) | ✓ live | `integraties/page.tsx` 447r |
| Moneybird RGS-config | ✓ live | `integraties/accounting/page.tsx` 280r |
| AI-usage-meter (per feature breakdown) | ✓ live | `ai-usage/page.tsx` 334r |
| AVG-export (Article 15/20) | ✓ live | `data-export/page.tsx` 146r |
| Referral-programma | ✓ live | `referral/page.tsx` 177r |
| Gebruikers + 4 rollen (Admin/Chef/Viewer/Accountant) | ✓ live | `gebruikers/page.tsx` |
| Email-templates editor | ✓ live | `mailbox/page.tsx` 577r |
| Publieke website-branding | ✓ live | `website/page.tsx` 890r |
| Foto-archief (bonnen+facturen+documenten) | ✓ live | `foto-archief/page.tsx` 484r |
| Help-center + FAQ | ✓ live | `hulp/page.tsx` 363r |
| Help-sitemap | ✓ live | `/hulp/sitemap/` |
| Platform-admin (orgs + users) | ✓ live | `admin/page.tsx` 956r |
| Activation-funnel (basic) | ✓ live | `admin/funnel/page.tsx` 376r |
| **5 KPI's + funnel-grafiek in /admin/funnel** | 🔴 incompleet | ux-master.md sectie 1 row 5C |
| **Generieke demo-data seed-API** | ❌ ontbreekt | ux-master.md sectie 7 + sectie 10 top-2 |
| AI-cost-cap soft 100% / hard 150% per tier | 🟡 partial | `ai_usage` tabel bestaat; hard-cap kill-switch onbevestigd |
| SAML/SSO Enterprise | ❌ | Anti-Pillar (orchestrator skill expliciet) |
| Audit-log UI (alleen tabel bestaat) | ❌ | `audit_log` tabel uit migration 017 — UI ontbreekt |
| Custom domain support per tenant (`<tenant>.bbqarchitect.nl`) | ❌? | Vercel Platforms feature; verifieer |
| Email-in-adres tonen aan tenant | ✓? | `v_org_inbox_address` view bestaat; UI in `/mailbox` verifieer |
| Server Component splits | ❌ | website 890r en admin 956r zijn Client |
| Type-safety | 🟡 half | verifieer |
| Server Actions voor settings-mutaties | ❌ | direct mutate vanuit Client |

### § 8.b Competitor sweep — top-3 "settings + admin + onboarding"

| Concurrent | Killer-feature | Wij vs hen |
|---|---|---|
| **Tripleseat** | Settings is een lange tree (~30 nodes); admin-dashboard met user-activity per tenant; demo-data wordt automatisch geseed bij nieuwe tenant; SSO Enterprise. | Wij hebben kortere flat IA (8 sub-pages onder Systeem). Wij missen demo-data + SSO. Wij winnen op AI-usage-meter en AVG-export. |
| **Linear** | Vlakke settings (max 2 levels deep), ⌘K voor zoeken, members + workspaces + integraties in 3 hoofdsecties. Geen onnodige settings. | Wij doen vergelijkbaar (hub + sub-tabs). Linear wint op pure-design eenvoud; wij hebben meer content nodig (NL-compliance, AVG, RGS-config). |
| **Notion** | Settings + members + plans in 3 hoofdsecties; helper-text overal; gradual feature-discovery. | Wij hebben `/hulp` + `/foto-archief` extra. Notion wint op onboarding-warmte; wij winnen op NL-compliance-diepte. |

**Onze unieke moats**:
1. **AI-usage-meter met per-feature breakdown** — `ai_usage` tabel + UI in `/instellingen/ai-usage`. Geen catering-SaaS doet dit native.
2. **AVG-export native** — `/instellingen/data-export` direct beschikbaar voor klanten. Tripleseat doet alleen op-aanvraag.
3. **NL-conforme integraties out-of-the-box** — Moneybird + iDEAL Mollie + RGS — concurrenten doen Quickbooks/Stripe.

**Waar ze ons verslaan** (gaps):
1. Tripleseat: demo-data seed bij nieuwe tenant (P0 — ux-master.md noemt dit)
2. Linear: settings-search met ⌘K (cross-cutting § 9)
3. Notion: in-app helper-text + tooltips

### § 8.c Golden Pillars — Systeem

**Pillar 1 — "Nieuwe tenant ziet binnen 30s een demo-app met echte data"** _(create/Delighter — onboarding-critical)_
- WHO: Pro-tier signup, eerste login.
- WHAT: `/api/onboarding/seed-demo` triggert bij eerste login → seedt 1 tenant met 20 events, 50 gerechten, 30 klanten, 50 bonnen, 5 leveranciers, 100 inventory-items, 10 facturen. Tenant ziet direct werkende app, geen lege pagina's.
- WHEN: bij first-login na signup.
- HOW-MUCH: seed <30s p95, idempotent (rerun overschrijft niet).
- **Anti-Pillar**: geen "klik om demo-data te krijgen"-button — automatisch zonder vraag.
- **Acceptance**: 5 verschillende Pro-tier signups → 5× werkende demo-app met data binnen 30s. `activation_events` toont `demo_seeded` per tenant.

**Pillar 2 — "AI-usage transparant + harde cap voorkomt verassings-facturen"** _(raise/Must-be — hard rule 7)_
- WHO: Pro-tier eigenaar bewaakt maandelijkse Anthropic-spend.
- WHAT: `/instellingen/ai-usage` toont MTD-spend per feature + tier-limit + cap-bar. Bij soft-cap (100%) waarschuwing-banner; bij hard-cap (150%) AI-features uitgeschakeld tot maand-eind.
- WHEN: continu (live update bij elke AI-call).
- HOW-MUCH: cap-check vóór elke Anthropic-call (<5ms latency-toevoeging). 0 onverwachte over-150% facturen.
- **Anti-Pillar**: geen pro-rata-billing — fixed tier-limit, hard kill bij 150%.
- **Acceptance**: simuleer 151% usage → volgende AI-call returnt `{error: 'tier_cap_exceeded'}` zonder Anthropic-call te doen.

**Pillar 3 — "Activation-funnel met 5 Pro-tier KPI's + grafiek"** _(raise/Must-be — launch-blocker)_
- WHO: Sam / platform-admin meet Pro-tier launch.
- WHAT: `/admin/funnel` toont per cohort: signup → onboarding-complete → first-offerte → first-sent → first-betaald, met drop-off-rates en mediaan-tijd per stap.
- WHEN: dagelijks tijdens Pro-tier launch-fase.
- HOW-MUCH: alle 5 KPI's uit ux-master.md sectie 3 dashboard-ready; grafiek-load <2s.
- **Anti-Pillar**: geen 100+ metrics — alleen de 5 KPI's bovenaan, rest in een tabel.
- **Acceptance**: ux-master.md sectie 1 row 5C verandert van 🟡 naar ✅.

**Pillar 4 — "AVG-export klaar in 60 seconden, machine-leesbare ZIP"** _(raise/Must-be — NL-compliance)_
- WHO: klant of medewerker doet GDPR-data-request.
- WHAT: `/instellingen/data-export` → klik "Genereer export" → async job → email-notificatie → download-link → ZIP met JSON-per-tabel + bijgevoegde bestanden.
- WHEN: op aanvraag (max 30 dagen wettelijk, wij doen <1u).
- HOW-MUCH: 100% van tenant's tabellen geëxporteerd (events, offertes, gerechten, klanten, facturen, ritten, etc.).
- **Anti-Pillar**: geen export via ondersteuning-mail — selfservice.
- **Acceptance**: test-export voor Hop & Bites → ZIP-grootte plausibel (>1MB), bevat 20+ JSON-files.

**Pillar 5 — "Settings is plat — gevonden binnen 5 klikken"** _(eliminate/Must-be)_
- WHO: Pro-tier eigenaar zoekt willekeurige setting.
- WHAT: Systeem-hub heeft 8 sub-pages flat (geen 3-laags deep). ⌘K search vindt elke setting in 1 query.
- WHEN: bij elke setting-edit.
- HOW-MUCH: P95 settings-lookup tijd <10s.
- **Anti-Pillar**: geen verborgen advanced-mode — alles direct zichtbaar voor admin-role.
- **Acceptance**: usability-test Sam: vind "BTW-percentage voor service-personeel" → <5 klikken.

### § 8.d Gap-list

**P0 — blocker voor v1.0**:

| # | Gap | Impact | Uren |
|---|---|---|---|
| P0.38 | **Generieke demo-data seed-API** `/api/onboarding/seed-demo` | Pillar 1; ux-master.md sectie 10 top-2; Pro-tier launch-blocker | 8 |
| P0.39 | **`/admin/funnel` 5 KPI's + funnel-grafiek** | Pillar 3; ux-master.md sectie 1 row 5C | 4 |
| P0.40 | **AI-cost hard-cap kill-switch** (vóór elke Anthropic-call check tegen tier-limit) | Pillar 2; hard rule 7 verificatie | 4 |
| P0.41 | **Server Component splits voor `website/page.tsx` (890r) en `admin/page.tsx` (956r)** | LCP + patroon-consistentie | 8 |
| P0.42 | **Server Actions voor settings-mutaties** | hard rule 5 | 4 |
| P0.43 | **AVG-export end-to-end test** + asyncJob progress UI | Pillar 4 acceptance | 4 |
| P0.44 | **Email-in-adres tonen aan tenant in `/mailbox`** (uit `v_org_inbox_address`) | Voorraad-hub Pillar 2 hangt hieraan — tenant moet weten waar leverancier-PDFs heen moeten | 1 |
| P0.45 | **Hub-naam-drift opruimen**: ux-master.md sectie 5 schrijft "Inspiratie Bibliotheek" + "Instellingen & Hulp"; navigation.tsx zegt "Menu & Recepten" + "Systeem". Beslis canonical + sync docs/code | UX-clarity + onboarding | 2 |

**P1 — fix voor v1.0** (concurrent-patterns):

| # | Gap | Impact | Uren |
|---|---|---|---|
| P1.48 | **Audit-log UI** (tabel bestaat sinds migration 017, UI ontbreekt) | NL-compliance + security-troubleshoot | 6 |
| P1.49 | **Custom domain support** per tenant (Vercel Platforms) | Enterprise-tier moat per orchestrator skill | 8 |
| P1.50 | **Email-template editor met BlockNote** (concurrent-pattern: Notion-blocks) | UX-modern | 6 |
| P1.51 | **Help-center search** (cmdk over `/hulp/sitemap`) | Pro-tier wens | 3 |
| P1.52 | **In-app helper-tooltips** (Notion-pattern) — vooral op moeilijke pages | UX | 4 |
| P1.53 | **Tenant-impersonation voor platform-admin** (lees-only) | Support-troubleshoot | 4 |
| P1.54 | **Feature-flags per org/tenant** | Pro-tier rollout control | 4 |

**P2 — nice-to-have**:

| # | Gap | Impact | Uren |
|---|---|---|---|
| P2.22 | SAML/SSO voor Enterprise | Orchestrator skill: skip for now | 24 |
| P2.23 | Multi-org admin (één account, meerdere orgs) | Niet kritiek 2026 | 16 |
| P2.24 | Webhooks-outgoing voor 3rd-party (Zapier/Make) | Power-user wens | 12 |
| P2.25 | SCIM voor Enterprise user-provisioning | Skip per orchestrator skill | 12 |

### § 8.e Ready-to-build chunks

#### Chunk P0.38 — Generieke demo-data seed-API

Nieuw `src/app/api/onboarding/seed-demo/route.ts` (paste-ready, idempotent):

```ts
import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { trackOnce } from '@/lib/track-server';

export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const orgId = user.app_metadata?.org_id as string | undefined;
  if (!orgId) return NextResponse.json({ error: 'no_org' }, { status: 400 });

  // Idempotency: check of er al data is
  const { count: existingEvents } = await supabase
    .from('events').select('*', { count: 'exact', head: true });
  if ((existingEvents ?? 0) > 0) {
    return NextResponse.json({ status: 'already_seeded', count: existingEvents });
  }

  // Seed batch — gebruik vaste templates die voor BBQ-catering passen
  const today = new Date();
  const seedKlanten = await supabase.from('klanten').insert([
    { naam: 'Boerderij De Klaver', email: 'boerderij@example.nl', telefoon: '0512-345678' },
    { naam: 'Hotel Drents Hart', email: 'events@drentshart.nl', telefoon: '0593-555200' },
    // ... 28 meer
  ]).select();

  const seedGerechten = await supabase.from('gerechten').insert([
    { naam: 'Pulled Pork', kosten_pp: 4.50, prijs_pp: 12.50, beschrijving: '...' },
    { naam: 'BBQ Brisket', kosten_pp: 6.20, prijs_pp: 16.50, beschrijving: '...' },
    // ... 48 meer
  ]).select();

  const seedEvents = await supabase.from('events').insert(
    Array.from({ length: 20 }, (_, i) => ({
      name: `Demo event ${i + 1}`,
      date: new Date(today.getTime() + (i - 10) * 86400_000 * 7).toISOString().slice(0, 10),
      guests: 30 + (i * 7) % 100,
      basis_prijs_pp: 35 + (i % 10),
      status: i < 5 ? 'concept' : i < 12 ? 'bevestigd' : 'voltooid',
      type: ['BBQ Catering', 'Buffet', 'Diner'][i % 3],
    }))
  ).select();

  // ... idem voor inventory (100 items), bonnen (50), leveranciers (5), facturen (10)

  await trackOnce('demo_seeded', `demo_${orgId}`, { orgId, scopes: ['klanten','gerechten','events','inventory','bonnen','leveranciers','facturen'] });

  return NextResponse.json({
    status: 'seeded',
    counts: {
      klanten: seedKlanten.data?.length ?? 0,
      gerechten: seedGerechten.data?.length ?? 0,
      events: seedEvents.data?.length ?? 0,
    },
  });
}
```

Trigger op first-login: in `app/page.tsx` Server Component check of tenant `demo_seeded` event heeft; zo nee, POST naar deze route in background. Of: trigger vanuit OnboardingChecklist als "Demo-data inladen"-button (laat user kiezen → minder magisch).

#### Chunk P0.39 — `/admin/funnel` 5 KPI's + grafiek

Update [src/app/admin/funnel/page.tsx](src/app/admin/funnel/page.tsx) — Server Component met 5 KPI-cards (uit ux-master.md sectie 3):

```tsx
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { FunnelChart } from '@/components/admin/FunnelChart';

export default async function FunnelDashboardPage() {
  const admin = createSupabaseAdminClient();

  // Pak laatste 30 dagen activation_events
  const since = new Date(Date.now() - 30 * 86400_000).toISOString();
  const { data: events } = await admin
    .from('activation_events')
    .select('event_name, org_id, created_at')
    .gte('created_at', since);

  // Compute funnel-steps
  const byOrg = new Map<string, Set<string>>();
  for (const e of events ?? []) {
    if (!byOrg.has(e.org_id)) byOrg.set(e.org_id, new Set());
    byOrg.get(e.org_id)!.add(e.event_name);
  }

  const totalSignups = [...byOrg.values()].filter(s => s.has('signup_completed')).length;
  const activated   = [...byOrg.values()].filter(s => s.has('activation_completed')).length;
  const firstQuote  = [...byOrg.values()].filter(s => s.has('first_offerte_concept')).length;
  const sentQuote   = [...byOrg.values()].filter(s => s.has('first_offerte_sent')).length;
  const paidQuote   = [...byOrg.values()].filter(s => s.has('first_offerte_paid')).length;

  const kpis = [
    { label: 'Time-to-First-Offerte (median)', value: '?', target: '<15min' },  // compute from event-timestamps
    { label: 'Activation-rate', value: `${(activated/totalSignups*100).toFixed(0)}%`, target: '≥40%' },
    { label: 'D7-Retention', value: '?', target: '≥50%' },                       // compute from login-events
    { label: 'First Real Offerte Sent', value: `${(sentQuote/activated*100).toFixed(0)}%`, target: '≥70%' },
    { label: 'AI-adoptie-rate', value: '?', target: '≥30%' },                    // compute from ai_wizard_used / total
  ];

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-light">Activation-funnel</h1>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {kpis.map(k => (
          <div key={k.label} className="rounded-lg border bg-white p-4">
            <div className="text-xs text-stone-600">{k.label}</div>
            <div className="text-2xl font-semibold">{k.value}</div>
            <div className="text-xs text-stone-500">Doel: {k.target}</div>
          </div>
        ))}
      </div>
      <FunnelChart steps={[
        { label: 'Signup', count: totalSignups },
        { label: 'Activated', count: activated },
        { label: 'First Quote', count: firstQuote },
        { label: 'Quote Sent', count: sentQuote },
        { label: 'Quote Paid', count: paidQuote },
      ]} />
    </div>
  );
}
```

`FunnelChart` component (paste-ready, bouw met Recharts of native SVG):

```tsx
'use client';
import { ResponsiveContainer, FunnelChart as RFunnelChart, Funnel, LabelList, Tooltip } from 'recharts';

export function FunnelChart({ steps }: { steps: { label: string; count: number }[] }) {
  return (
    <div className="h-[400px] rounded-lg border bg-white p-4">
      <ResponsiveContainer>
        <RFunnelChart>
          <Tooltip />
          <Funnel dataKey="count" data={steps} isAnimationActive>
            <LabelList position="right" fill="#000" stroke="none" dataKey="label" />
          </Funnel>
        </RFunnelChart>
      </ResponsiveContainer>
    </div>
  );
}
```

#### Chunk P0.40 — AI-cost hard-cap kill-switch

Centrale helper `src/lib/ai/check-cap.ts`:

```ts
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

const TIER_CAPS: Record<string, number> = {
  starter:    3.00,   // €/maand soft-cap
  pro:       15.00,
  enterprise: 50.00,
};

export async function checkAndReserveAiBudget(orgId: string, estimatedEur: number): Promise<{ ok: boolean; reason?: string; usedEur: number; capEur: number }> {
  const admin = createSupabaseAdminClient();

  const { data: org } = await admin.from('organizations').select('tier').eq('id', orgId).single();
  const tier = org?.tier ?? 'starter';
  const capEur = TIER_CAPS[tier];

  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
  const { data: usage } = await admin
    .from('ai_usage')
    .select('cost_eur')
    .eq('org_id', orgId)
    .gte('created_at', monthStart);

  const usedEur = (usage ?? []).reduce((s, u) => s + Number(u.cost_eur ?? 0), 0);
  const projectedEur = usedEur + estimatedEur;

  if (projectedEur > capEur * 1.5) {
    return { ok: false, reason: 'hard_cap_exceeded', usedEur, capEur };
  }

  return { ok: true, usedEur, capEur };
}
```

Gebruik in elke AI-route, vóór de Anthropic-call:

```ts
const budget = await checkAndReserveAiBudget(orgId, /* estimate */ 0.02);
if (!budget.ok) {
  return NextResponse.json({
    error: 'ai_budget_exceeded',
    usedEur: budget.usedEur,
    capEur: budget.capEur,
    message: `Je tier (${tier}) heeft hard-cap €${(budget.capEur * 1.5).toFixed(2)} bereikt. AI-features zijn pauzeerd tot maand-eind of upgrade.`,
  }, { status: 402 });  // 402 Payment Required
}
```

#### Chunk P0.41 — Server Component splits website + admin

Standaard patroon. Voor admin: split per sectie (orgs · users · feature-flags · funnel) onder `app/admin/_tabs/`.

#### Chunk P0.44 — Email-in-adres tonen in `/mailbox`

Lees view + render in mailbox-tab:

```tsx
// in mailbox/page.tsx — voeg sectie toe
const { data: addr } = await supabase.from('v_org_inbox_address').select('inbox_address').single();

<div className="rounded-lg border bg-amber-50 p-4">
  <div className="font-semibold mb-1">Stuur leverancier-PDFs naar:</div>
  <code className="text-lg">{addr?.inbox_address ?? 'inbox-...'}</code>
  <button onClick={() => navigator.clipboard.writeText(addr?.inbox_address ?? '')} className="ml-2">Kopieer</button>
  <p className="text-sm text-stone-600 mt-2">
    Mails worden binnen 5 min automatisch verwerkt; resultaten staan in Price-Intelligence review-queue.
  </p>
</div>
```

#### Chunk P0.45 — Hub-naam-drift opruimen

**Beslissing**: navigation.tsx is canonical (gebruiker ziet "Menu & Recepten" + "Systeem"). ux-master.md is verouderd op dit punt.

Update `docs/ux-master.md` sectie 5 — schrijf de huidige sidebar-tree opnieuw:

```diff
- 📚 Inspiratie Bibliotheek → /inspiratie  (sub-pages: Componenten · Gerechten) — v5 2026-05-10
-                                           (was: 🍳 Menu & Recepten → /gerechten met tabs Gerechten · Bedenker · Marges)
+ 🍳 Menu & Recepten → /gerechten (tabs: Gerechten · Componenten · Ingrediënten · Kookbord · AI Bedenker · AI Pitmaster · Menu-analyse · Insights · Allergen-queue)
- ⚙️ Instellingen & Hulp → /sectie/systeem (tabs: Instellingen · Gebruikers · Mailbox · Website · Foto-archief · Hulp · Admin)
+ ⚙️ Systeem → /systeem (tabs: Instellingen · Gebruikers · Integraties · Mailbox · Website · Foto-archief · Help Center · Platform Beheer)
```

Geen code-changes nodig. Code is canonical, doc volgt.

### § 8.f Verificatie-checklist Systeem

- [ ] `/api/onboarding/seed-demo` POST → werkt voor 5 verschillende test-tenants binnen 30s p95
- [ ] `/admin/funnel` toont 5 KPI's + funnel-grafiek met echte data
- [ ] Hard-cap kill-switch: simuleer 151% spend op test-tenant → volgende AI-call returnt 402 zonder Anthropic-call
- [ ] `website/page.tsx` <300r, admin/page.tsx <300r — splits gedaan
- [ ] `/mailbox` toont tenant's `inbox-<id>@bbqarchitect.nl` adres
- [ ] AVG-export ZIP bevat 20+ JSON-files met tenant's data
- [ ] `docs/ux-master.md` sectie 5 gesynced met sidebar
- [ ] Pillar 5 acceptance: usability-test Sam vindt "BTW service-personeel" <5 klikken

---

> **Einde § 8 Systeem-hub.** Alle 7 hubs zijn nu af. Volgende turn: § 9-14 Cross-cutting lagen.

---

## § 9. Cross-cutting: ⌘K command palette

**Audit**: [src/components/CommandPalette.tsx](src/components/CommandPalette.tsx) 520r — al gebouwd met `cmdk` (concurrent-pattern Linear/Notion ✓). Mobile-trigger via `src/components/mobile/MobileCmdKTrigger.tsx`. ux-master.md zegt "35+ routes + Supabase-search (events/offertes/etc.)".

**Top-3 patroon-benchmarks**:
- **Linear**: ⌘K opent palette, search over alles (issues, projects, settings), niet alleen routes; recente queries onthouden; AI-suggested commands.
- **Notion**: ⌘K cycle door 4 categorieën (pages · workspace · linear-actions · ai). Sticky search-tab.
- **Vercel-dashboard**: ⌘K met deeplink-jumps + entity-search (deployments, env-vars).

**Gaps**:
- P1: AI-suggestions binnen ⌘K ("Maak offerte voor [klant X]") — Linear-pattern
- P1: Recent-queries persistence per user (localStorage met TTL)
- P1: Settings-search in ⌘K (Linear-pattern, zie Systeem-hub Pillar 5)
- P2: Touch-zone: ⌘K op mobile niet alleen via floating-button maar ook via long-press

**Ready-to-build chunk**: enhance bestaande `CommandPalette.tsx` met `recentQueries` state (localStorage `cmdk_recent_v1` 5-min TTL, top-10):

```tsx
// CommandPalette.tsx — top
const [recentQueries, setRecentQueries] = useState<string[]>(() => {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem('cmdk_recent_v1');
    if (!raw) return [];
    const { items, savedAt } = JSON.parse(raw);
    if (Date.now() - savedAt > 5 * 60_000) return [];  // 5-min TTL per memory
    return items;
  } catch { return []; }
});

function recordQuery(q: string) {
  if (!q.trim() || q.length < 3) return;
  const next = [q, ...recentQueries.filter(r => r !== q)].slice(0, 10);
  setRecentQueries(next);
  localStorage.setItem('cmdk_recent_v1', JSON.stringify({ items: next, savedAt: Date.now() }));
}
```

**Acceptance**: 100% van ⌘K-zoekqueries die >3 chars zijn worden onthouden. Settings-search vindt elke setting <500ms.

---

## § 10. Cross-cutting: AI ChatPanel + Vraag-Rook + AIStudio refactor

**Audit**:
- [src/components/AIStudio.tsx](src/components/AIStudio.tsx) **1172r** — oude monolitische AI-launcher. ux-master.md zegt: refactor naar ~500r.
- [src/components/ai/ChatPanel.tsx](src/components/ai/ChatPanel.tsx) **668r** — v2 chat, "Vraag-Rook"-pattern, default volgens memory `project_ai_v2_chatpanel.md`. `?ai=v1` fallback naar AIStudio.
- ux-master.md noemde "AiAssistant 1865r" — die file **bestaat niet meer** (al deels gerefactord vóór deze sweep). De resterende 1172+668=1840r moet naar ~1000r totaal.
- **AI-context cross-page persist** (5-min TTL via localStorage in AiStudioContext) — niet gebouwd (memory).

**Top-3 patroon-benchmarks**:
- **Notion AI**: floating button rechtsonder → slide-in panel met page-context als systemPrompt. Vraag-stijl ("Schrijf een...", "Vat samen...").
- **Linear AI**: ⌘K opens AI-mode → suggest-commands op basis van current view. Geen aparte chat-paneel.
- **Vercel v0**: side-panel met thread-history per project. Wisselt context per page.

**Gaps**:
- P0: AIStudio.tsx (1172r) → ofwel volledig schrappen (als v2 ChatPanel alles dekt) ofwel splitsen in ~4 sub-components onder `src/components/ai/legacy/`
- P0: AI-context cross-page persist — implementeer (5-min TTL localStorage)
- P0: ChatPanel `systemContext` + `apiRoute` props formaliseren (al gebruikt in Menu-hub P0.17 voorbeeld)
- P1: Promptfoo eval-suite voor alle AI-touchpoints (orchestrator skill optional, maar nu wel verstandig)
- P1: AI-usage logging per call (vooraf, niet alleen na — voor hard-cap pre-check P0.40)
- P1: Streaming UI met server-sent events voor lange responses (chef-coach 30+ tokens)

**Ready-to-build chunks**:

#### Schrap of vervang AIStudio.tsx (P0)

```bash
# Bepaal of AIStudio nog gebruikt wordt
grep -rn "from '@/components/AIStudio'" src/ | wc -l
```

Als <5 imports: schrap + replace met ChatPanel. Als veel imports: split in `src/components/ai/legacy/AIStudio*.tsx` met deprecation-comment + migration-plan per page.

#### AI-context cross-page persist (P0)

`src/lib/ai/context-store.ts` (paste-ready):

```ts
type AiContext = {
  lastQuestion: string;
  lastAnswer: string;
  page: string;
  savedAt: number;
};

const KEY = 'bbqa_ai_ctx_v1';
const TTL_MS = 5 * 60_000;

export function saveAiContext(ctx: Omit<AiContext, 'savedAt'>) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(KEY, JSON.stringify({ ...ctx, savedAt: Date.now() }));
}

export function loadAiContext(): AiContext | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const ctx = JSON.parse(raw) as AiContext;
    if (Date.now() - ctx.savedAt > TTL_MS) { localStorage.removeItem(KEY); return null; }
    return ctx;
  } catch { return null; }
}
```

Hook `useAiContext` om ChatPanel automatisch te pre-fillen met laatste vraag bij page-change.

**Acceptance**: Stel vraag op `/agenda`, navigeer naar `/offertes` binnen 5 min → ChatPanel toont "Doorgaan met: [laatste vraag]" knop.

#### ChatPanel props formaliseren (P0)

```ts
// src/components/ai/ChatPanel.tsx — props type
type ChatPanelProps = {
  contextLabel?: string;
  systemContext?: string;           // server-side ingebakken, NIET user-input
  apiRoute: string;                  // bv '/api/chef-coach'
  model?: 'claude-haiku-4-5-20251001' | 'claude-sonnet-4-6';
  initialPrompt?: string;
  onResponse?: (text: string) => void;
};
```

---

## § 11. Cross-cutting: white-label theming 5×8 + CSS-opruim

**Audit**:
- [src/lib/branding.ts](src/lib/branding.ts) — `buildBrandingConfig()` per tenant
- Migration `018_settings_full_brand_tokens.sql` — 5 tokens × 8 presets (logo, kleur, font, radius, accent)
- [src/app/globals.css](src/app/globals.css) **10011 regels** — gigantisch CSS-bestand, zware bundle-size
- 313 hardcoded `borderRadius` in 42 files (ux-master.md sectie 7)
- 3 styling-systemen door elkaar (Tailwind + custom CSS + inline-style) — UX-P1

**Top-3 patroon-benchmarks**:
- **Stripe Dashboard**: 4 design-tokens (color/font/radius/spacing), CSS custom properties, theme-switch via root-class. Bundle <30KB CSS.
- **Linear**: 3 thema's (dark/light/system), CSS-vars, Tailwind als primary, geen aparte CSS-files per component. Bundle <50KB CSS.
- **Vercel**: design-system Geist als basis + theme-override via CSS-vars. Bundle <80KB CSS gzip.

**Gaps**:
- P0: **Verwijder ~80% van globals.css** — verplaats naar Tailwind utility-classes of component-CSS-modules. 10k regels naar <2k regels.
- P0: 313 hardcoded `borderRadius` migreren naar `var(--radius-md)` token
- P1: Inline-style elimineren in agenda/page.tsx + offertes/page.tsx (UX-P1)
- P1: Custom domain Vercel Platforms voor white-label `/q/[token]` (Enterprise-tier)
- P1: PDF + email theme propagatie volledig getest (react-pdf gebruikt brand-tokens P1.19)

**Ready-to-build chunk**:

#### globals.css opruimen (P0)

Drie-stappen migratie:

1. **Audit**: classificeer regels per type:
   ```bash
   grep -c "@media\|@keyframes\|@import\|:root\|--brand\|--radius\|--space" src/app/globals.css
   ```
   Verwacht ~10% utility-defs + 90% component-specifieke styling.

2. **Verplaats component-styling** naar CSS-modules per file:
   ```
   src/app/agenda/page.module.css         # nieuw, alleen agenda-specifieke regels
   src/app/offertes/page.module.css        # idem
   ```

3. **Behoud in globals.css**: alleen `:root` design-tokens, reset, body, en globale animaties. Target <2000 regels.

#### borderRadius-migratie (P0)

```bash
# Vind alle hardcoded borderRadius
grep -rn "borderRadius:" src/ | head -20
```

Search-replace per file met `var(--radius-md)`. Voor inline-styles `style={{ borderRadius: 14 }}` → vervang met className en bestaande tailwind-class `rounded-2xl` (= 1rem = 16px, close-genoeg).

#### Custom domain via Vercel Platforms (P1)

[Vercel Platforms-pattern](https://vercel.com/docs/platforms-starter-kit) — laat tenant zijn eigen subdomain claimen. `/q/[token]` rendert met de tenant's `brand_config` uit `settings` tabel. Implementeer via middleware:

```ts
// middleware.ts
const hostname = req.headers.get('host') ?? '';
const tenant = await resolveTenantByDomain(hostname);  // lookup settings.custom_domain
if (tenant && req.nextUrl.pathname.startsWith('/q/')) {
  // Rewrite met tenant-context (header doorgeven)
  const url = req.nextUrl.clone();
  url.headers.set('x-tenant-id', tenant.id);
  return NextResponse.rewrite(url);
}
```

---

> **Einde § 9-11 Cross-cutting 1-3.** Volgende turn: § 12 Onboarding-funnel · § 13 CWV 2026 · § 14 Security (OWASP 2025 + LLM + RLS + ASVS v5).

---

## § 12. Cross-cutting: onboarding + activation funnel

**Audit**:
- [src/components/onboarding/OnboardingChecklist.tsx](src/components/onboarding/OnboardingChecklist.tsx) — 4 dismissable items + auto-progress
- [src/components/onboarding/PersonaQuiz.tsx](src/components/onboarding/PersonaQuiz.tsx) — 3-vragen modal post-signup
- [src/lib/track.ts](src/lib/track.ts) — `track()` + `trackOnce()` fire-and-forget naar `activation_events`
- Migration `011_activation_events.sql` — al bestaand
- `/admin/funnel/page.tsx` — basic UI, mist 5 KPI's per ux-master.md
- `/api/onboarding/seed-demo` — ontbreekt (P0.38 in Systeem-hub)

**Top-3 patroon-benchmarks**:
- **Tripleseat**: nieuwe tenant krijgt automatisch demo-data + 5-stap-checklist op dashboard. Geen aparte tour.
- **Linear**: onboarding-tour 4 stappen (workspace · team · project · issue), inline op canvas. Persona-vraag bij signup.
- **Notion**: template-bibliotheek bij signup, "begin met deze template" → workspace al gevuld.

**Gaps**:
- P0: Demo-data seed (zie Systeem P0.38) — onboarding-blocker
- P0: 5 KPI's in /admin/funnel (zie Systeem P0.39)
- P0: Restant tracking-events bedraden (ux-master.md sectie 7): `first_klant_created`, `first_gerecht_created`, `first_offerte_sent` (al gedaan), `ai_allergen_detect`, `ai_wizard_used`
- P1: OnboardingChecklist auto-collapse na 100% complete (zie Vandaag P1.4)
- P1: PersonaQuiz-results gebruiken voor sidebar-personalisatie (Lars-flow vs admin-flow)
- P2: Template-bibliotheek bij signup ("Begin met BBQ-catering / Buffet / Borrel template")

**Ready-to-build chunk**: bedraad ontbrekende tracking-events op hun natuurlijke trigger-plaatsen:

```ts
// In klanten/page.tsx — bij eerste klant-create
import { trackOnce } from '@/lib/track';
const { error } = await supabase.from('klanten').insert(newKlant);
if (!error) trackOnce('first_klant_created', `first_klant_${user.id}`);

// In gerechten/_client.tsx — bij eerste gerecht-create
if (!error) trackOnce('first_gerecht_created', `first_gerecht_${user.id}`);

// In /api/detect-allergens — na succesvolle classification
await trackOnce('ai_allergen_detect', `ai_allergen_${orgId}_${Date.now()}`);

// In AiOfferteWizard — na succesvolle wizard-run
trackOnce('ai_wizard_used', `ai_wizard_${user.id}_${Date.now()}`);
```

**Acceptance**: na 1 nieuwe tenant + 7 dagen → `activation_events` heeft alle 9 event-types met counts.

---

## § 13. Cross-cutting: CWV 2026 performance + bundle

**Audit huidige staat**:
- Geen Lighthouse-CI of bundle-analyzer in CI gevonden
- `src/app/globals.css` 10011 regels = grote CSS-bundle
- Veel Client Components (memory + audit per hub: `'use client'` op pages tot 4600r)
- `next.config.*` — verifieer Turbopack flags, image opts, experimental

**Targets 2026** (Core Web Vitals + Cache Components):

| Metric | Target p75 | Wij nu (vermoedelijk) | Waar |
|---|---|---|---|
| LCP (Largest Contentful Paint) | <1500ms | 2-3s op `/`, `/agenda`, `/offertes` | Vandaag, Plannen, Verkoop (Client Components met 13+ queries) |
| INP (Interaction-to-Next-Paint) | <100ms | onbekend | Veel state-heavy Client Components |
| CLS (Cumulative Layout Shift) | <0.05 | onbekend | Brand-logo + dynamic data laden |
| TTFB (Time-to-First-Byte) | <600ms | OK (Vercel edge) | -- |
| Total Blocking Time | <200ms | onbekend | 1800r+ Client Components zijn risico |

**Top-3 patroon-benchmarks**:
- **Linear**: LCP ~600ms via Server Components + edge-runtime + minimal JS. Geen JS-router-switch tussen pages.
- **Vercel-dashboard**: LCP ~800ms via Server Components + Cache + partial pre-render. Bundle gzipped <150KB initial.
- **Notion**: LCP ~1.5s (zware Client-app), maar perfect INP <50ms door virtualization.

**Gaps**:
- P0: **Server Component splits voor alle 4+ mega-pages** (al benoemd per hub) — primary LCP-fix
- P0: **Bundle-analyzer in CI** (`@next/bundle-analyzer`) — meet huidige status
- P0: **Lighthouse-CI** voor `/`, `/agenda`, `/offertes`, `/gerechten`, `/voorraad`, `/financien` — performance-budgets per page
- P0: **globals.css opruim** (zie § 11) — bundle-shrink
- P1: **Suspense boundaries** per hub-tab (al in Vandaag P1.1)
- P1: **`next/image` overal** — verifieer dat alle img-tags vervangen zijn (placeholders, brand-logo, gerecht-photos)
- P1: **Font subsetting** voor Outfit + fallback-stack — alleen NL-glyph-subset
- P2: **Cache Components** (Next 16 `cacheComponents: true`) als experimenteel-veilig (memory: Turbopack 16+ heeft caveats)

**Ready-to-build chunks**:

#### Bundle-analyzer + Lighthouse-CI (P0)

```bash
pnpm add -D @next/bundle-analyzer @lhci/cli
```

`next.config.ts`:

```ts
import bundleAnalyzer from '@next/bundle-analyzer';

const withBundleAnalyzer = bundleAnalyzer({ enabled: process.env.ANALYZE === 'true' });

export default withBundleAnalyzer({
  // ... bestaande config
  images: {
    formats: ['image/avif', 'image/webp'],
    remotePatterns: [{ protocol: 'https', hostname: '**.supabase.co' }],
  },
  experimental: {
    // cacheComponents: true,  // Wacht tot Turbopack 16+ stabiel — memory caveat
    optimizePackageImports: ['lucide-react', 'date-fns'],
  },
});
```

`.lighthouserc.json`:

```json
{
  "ci": {
    "collect": {
      "url": [
        "http://localhost:3000/",
        "http://localhost:3000/agenda",
        "http://localhost:3000/offertes",
        "http://localhost:3000/gerechten",
        "http://localhost:3000/voorraad",
        "http://localhost:3000/financien"
      ],
      "settings": {
        "preset": "desktop",
        "throttlingMethod": "simulate"
      }
    },
    "assert": {
      "assertions": {
        "categories:performance": ["error", { "minScore": 0.9 }],
        "categories:accessibility": ["error", { "minScore": 0.95 }],
        "largest-contentful-paint": ["error", { "maxNumericValue": 1500 }],
        "cumulative-layout-shift": ["error", { "maxNumericValue": 0.05 }]
      }
    }
  }
}
```

CI workflow `.github/workflows/lighthouse.yml` triggert per PR.

#### Performance-budget per page (P0)

Plak budget-comments bovenaan elke kritieke page:

```tsx
// app/page.tsx — Vandaag-hub
// Performance-budget: LCP <1500ms p75, INP <100ms, CLS <0.05
// JS-bundle: <200KB gzipped voor deze route
// Faalt CI als budget overschreden
```

---

## § 14. Cross-cutting: OWASP 2025 + LLM 2025 + RLS evil-tenant + ASVS v5

**Audit**: gebaseerd op orchestrator skill's references/owasp-2025-checklist.md + LLM-top-10-2025 + Supabase RLS best practices.

### § 14.a OWASP Top 10:2025 — applicatie-status

| # | Categorie | Status nu | Wat te doen |
|---|---|---|---|
| A01 | Broken Access Control | 🟡 | Direct-Supabase-mutates vanuit Client = risico. Migreer naar Server Actions (alle hubs P0) |
| A02 | Cryptographic Failures | 🟡 | Moneybird access/refresh tokens in plain text in DB — encrypt met pgcrypto of move naar Vercel KV (Verkoop P0.12) |
| A03 | Injection | ✓ | Supabase client = parameterized; geen raw SQL. Verifieer dat `eq()`-args nooit user-input zonder validatie zijn |
| A04 | Insecure Design | 🟡 | Token entropy `/q/[id]` (Verkoop P0.16) + rate-limit (idem) |
| A05 | Security Misconfiguration | 🟡 | `eslint-disable` overal = dead-code-detectie uit; CSP headers verifieer |
| A06 | Vulnerable Components | ? | `pnpm audit` runnen + Dependabot in CI |
| A07 | Authentication Failures | ✓ | Supabase Auth + middleware; session timeout configureren |
| A08 | Software/Data Integrity | 🟡 | Webhook idempotency Mollie + Moneybird (Verkoop P0.11+P0.12) |
| A09 | Security Logging | 🟡 | `audit_log` tabel bestaat (migration 017), UI ontbreekt (Systeem P1.48) |
| A10 | SSRF | ✓ | Geen user-controlled URLs in server-fetch gevonden |

### § 14.b LLM Top 10:2025 — AI-specifiek

| # | Categorie | Status | Mitigatie |
|---|---|---|---|
| LLM01 | Prompt Injection | 🟡 | Customer-input concatenatie in offerte-wizard / chef-coach — gebruik delimiters + sanitization (hard rule 9) |
| LLM02 | Sensitive Info Disclosure | ✓ | `ingelegd Hop & Bites context` server-side, niet in user-prompt |
| LLM03 | Supply Chain | ✓ | Alleen Anthropic SDK + Supabase, geen vector-DB met externe data |
| LLM04 | Data Poisoning | n/a | We trainen geen model |
| LLM05 | Output Handling | 🟡 | AI mag GEEN BTW / allergeen / quantity bepalen (hard rules 1-3) — verifieer via greps (Verkoop P0.15, Menu P0.23) |
| LLM06 | Overreliance | ✓ | Human-in-the-loop pattern overal (review queue, accept-knop) |
| LLM07 | Insecure Plugin Design | n/a | Geen LLM-tools-met-write-acces vanuit user-input |
| LLM08 | Excessive Agency | ✓ | AI mag geen Server Actions triggeren — alleen suggesties retourneren |
| LLM09 | Misinformation | 🟡 | Citations API (Verkoop P0.13) + Promptfoo evals dekken een deel |
| LLM10 | Unbounded Consumption | 🟡 | Hard-cap kill-switch (Systeem P0.40) + rate-limit per IP voor publieke routes (Verkoop P0.16) |

### § 14.c Supabase RLS — evil-tenant-test

**Audit huidige policies**:

```bash
# In Supabase Studio of via CLI
supabase db dump --schema public --data-only=false | grep -A 3 "CREATE POLICY"
```

Verwacht patroon (Supabase 2025 best practice):

```sql
create policy "tenant_reads_own_X"
  on X
  for select
  to authenticated
  using ((select auth.jwt() ->> 'org_id')::uuid = org_id);
```

**Gaps**:
- P0: **Evil-tenant integration-test suite** — Playwright met 2 tenants, beide loggen in, tenant B probeert tenant A's data te lezen via directe URLs (`/events/<A-uuid>`, `/offertes/<A-uuid>`). Verwacht: 404 of empty-data overal.
- P0: **Index op `org_id` voor alle policy-tabellen** — verifieer per migration (zonder index → seq scan = traag bij grote tenants)
- P0: **`(select auth.uid())` of `(select auth.jwt())` wrapping** — Supabase 2025 vereist deze functie-wrapping voor query-plan-cache; check elke policy
- P1: **Functions met `security definer` audit** — bv P0.28 price-mutation trigger draait met owner-rechten

**Test-script** `tests/rls/evil-tenant.spec.ts`:

```ts
import { test, expect } from '@playwright/test';

const TENANT_A_USER = 'a@test.bbqarchitect.nl';
const TENANT_B_USER = 'b@test.bbqarchitect.nl';

test('tenant B kan tenant A events niet zien', async ({ page }) => {
  // Login als A, maak event
  await loginAs(page, TENANT_A_USER);
  await page.goto('/agenda');
  await createTestEvent(page, 'Tenant A only event');
  const eventUrl = page.url();  // bv /events/abc-123/hub

  // Logout, login als B, probeer direct A's event-URL
  await logout(page);
  await loginAs(page, TENANT_B_USER);
  await page.goto(eventUrl);

  // Verwacht: 404 of leeg-state
  await expect(page.getByText('Event niet gevonden')).toBeVisible();
});

test('tenant B agenda toont 0 tenant A events', async ({ page }) => {
  await loginAs(page, TENANT_B_USER);
  await page.goto('/agenda');
  await expect(page.getByText('Tenant A only event')).not.toBeVisible();
});

// Idem voor offertes, gerechten, klanten, voorraad, facturen, ritten, ai_usage
```

### § 14.d ASVS v5 — niveau-2-targets

Application Security Verification Standard v5.0 — wij target Level 2 (standard apps with data exposure risk).

Belangrijke ASVS-checks die nu open zijn:

- **V2.1 Authentication**: ✓ Supabase Auth, MFA opt-in beschikbaar
- **V3.4 Session Management**: 🟡 verifieer session timeout
- **V5.1 Input Validation**: 🟡 Zod overal in Server Actions (P0.7, P0.14, P0.21, P0.27, P0.35, P0.42)
- **V7.1 Logging**: 🟡 audit_log tabel + UI (Systeem P1.48)
- **V8.3 PII Protection**: ✓ AVG-export native (Pillar 4 Systeem)
- **V10.1 Code Integrity**: ✓ Vercel deployment + signed commits

**Ready-to-build chunk**: Playwright RLS-test-suite (P0) + audit-log-UI (P1.48 in Systeem) + dependabot.yml in `.github/`.

---

> **Einde § 12-14 Cross-cutting 4-6.** Alle 6 cross-cutting lagen af. Volgende turn: § 15 Workflow-audit WF3-10.

---

## § 15. Workflow-audit WF3-10

> WF1-2 (event-ingang · offerte-ingang) zijn al opgelost via hub-and-spoke IA (ux-master.md). WF3-10 = de Golden Flow + ondersteunende workflows. Format per workflow: doel · stappen · blockers · bediening · tijd-tot-klaar · foutmodi.

### WF3 — Offerte verzenden → klantportal → akkoord

**Doel**: van "offerte concept klaar" tot "klant heeft getekend".

**Stappen**:
1. `/offertes` → edit offerte tot status `concept`
2. Klik "Verstuur" → PDF gegenereerd ([pdfGenerator.ts](src/lib/pdfGenerator.ts)) → email via [emailHelper.ts](src/lib/emailHelper.ts)
3. Klant ontvangt email met link → `/q/<token>`
4. Klant ziet offerte-detail (brand-themed) + carbon-score + iDEAL-deposit-knop
5. Klant tekent met `SignaturePad` → POST `/api/accept-offerte`
6. Optioneel: iDEAL betaling → POST `/api/payments/mollie` → Mollie redirect
7. Webhook `/api/payments/mollie/webhook` (idempotent — P0.11) → offerte `status='betaald'`
8. `runAcceptanceWorkflow()` → maakt event + factuur-concept

**Blockers nu**:
- Token entropy + rate-limit (Verkoop P0.16)
- Mollie webhook idempotency (Verkoop P0.11)
- BTW correct in factuur-concept (Verkoop P0.15)

**Bediening**: toetsenbord (Enter = bevestig) + touch (SignaturePad). Mobile-eerste op `/q/<token>`.

**Tijd-tot-klaar (target)**: offerte verstuurd → akkoord <120s p95 (Pillar 2 in Verkoop).

**Foutmodi**:
- Email niet aangekomen → tenant kan link kopiëren via `/offertes/[id]/view`
- iDEAL faalt → klant kan tekenen-zonder-betaling (deposit later)
- Webhook gemist → handmatige sync-knop in `/offertes/[id]/view`

### WF4 — Akkoord → factuur → betaling → Moneybird

**Doel**: geaccepteerde offerte → klant betaalt → boekhouder ziet alles.

**Stappen**:
1. `runAcceptanceWorkflow` maakt `facturen` concept-rij
2. BTW splits berekend uit `BTW_RULES_2026` (hard rule 1, Verkoop P0.15)
3. Tenant reviewt factuur in `/facturen` → klik "Verstuur"
4. Push naar Moneybird via `/api/accounting/moneybird` (gebruikt OAuth refresh-token uit P0.12)
5. UBL-XML gegenereerd (Verkoop P1.20)
6. Klant ontvangt factuur per email (Resend)
7. Bij betaling: Mollie webhook → `facturen.status='betaald'`
8. Boekhouder krijgt maandpakket via `/geld/boekhouder` (Geld P0.32)

**Blockers nu**:
- Moneybird OAuth refresh-token rotation (Verkoop P0.12)
- UBL/Peppol BIS 3.0 export (Geld P1.41)
- Per-tenant labor-rate config (Geld P0.34) voor cost-side van W&V

**Bediening**: pure desktop-workflow (admin).

**Tijd-tot-klaar (target)**: offerte-betaald → Moneybird-zichtbaar <5min.

**Foutmodi**:
- Moneybird-push 401 → automatische refresh + retry (P0.12)
- Mollie webhook gemist → cron-job re-sync 1×/u
- UBL ongeldig → log naar `audit_log` + tenant-banner "Factuur kon niet als UBL → Moneybird"

### WF5 — HACCP-dag (Lars op tablet)

**Doel**: chef registreert HACCP-records op event-dag, offline-tolerant.

**Stappen**:
1. Lars opent app op tablet (PWA standalone)
2. Vanuit `/` of `/agenda` → tap event → `/events/[id]/field` (na deduplicatie P0.6)
3. 4 CCP-tabs: koeling · verhitting · kruisbesmetting · schoonmaak
4. Per registratie: foto-evidence (`<input type="file" capture="environment">`) + tijd + temperatuur
5. Offline: enqueue via `useSupabase` offline-queue (`offlineStorage.ts`)
6. Online: sync naar `haccp_records` tabel
7. Bij afwijking: correctieve maatregel-form opent (HACCP v3)
8. Trend-grafiek per CCP toont 30-dagen rolling

**Blockers nu**:
- HACCP-dedup `/haccp/field` ↔ `/events/[id]/field` (Plannen P0.6)
- Lars-test live op event-dag (Vandaag P1.3 + Plannen Pillar 5 acceptance)
- NVWA-export `.csv` button op `/haccp` (Plannen P1.13)

**Bediening**: alleen touch, ≥88px-knoppen, fel-zonlicht-leesbaar (WCAG AAA contrast).

**Tijd-tot-klaar (target)**: 1 registratie inclusief foto <20s.

**Foutmodi**:
- WiFi uit → queue, sync bij online
- Foto-upload faalt → retry-knop, eventueel local-storage tot success
- Geen events vandaag → "Geen events vandaag — selecteer toch een event?" picker

### WF6 — Prep-week (Kookbord)

**Doel**: chef plant prep-werk voor komende week, swipe-to-done op tablet.

**Stappen**:
1. `/keuken/kookbord` opent (route bestaat — geen sidebar-toggle, fullscreen-modus)
2. Toont 7 dagen × prep-tasks groeped per station (BBQ · sausen · veggies · packing)
3. Tap task → status-toggle (todo → doing → done)
4. Swipe-naar-rechts → "Klaar" (Toast-pattern)
5. Bij done: log naar `service_logs` voor traceback
6. Sync met `prep_tasks` tabel

**Blockers nu**:
- IA-keuze: `/keuken/kookbord` apart of als `/gerechten/kookbord` tab (al opgenomen in nav, zie navigation.tsx:70)?
- Multi-day-view performance bij 100+ tasks

**Bediening**: touch, fullscreen, geen sidebar.

**Tijd-tot-klaar (target)**: dag-prep-overview opent <1s, swipe-to-done <200ms.

**Foutmodi**:
- Conflicting status-update (twee chefs zelfde task) → realtime sync via Supabase channel
- Task verwijderd door admin tijdens prep → tonen "Deze task is verwijderd", chef bevestigt

### WF7 — Bon-extract → inventory cascade → marge-update

**Doel**: gescande bon werkt door naar voorraad én marge per gerecht.

**Stappen**:
1. `/factuur-lezer` → camera-foto bon
2. POST `/api/boekhouder/bon-extract` (Sonnet vision) → regels
3. Review-modal: classify per regel → RGS-code (P0.37 Promptfoo eval) + match met `master_products`
4. Confirm → POST `/api/boekhouder/bon-commit`
5. Per gematched product: `inventory.current_stock += qty` + `inventory_movements` audit
6. Per ingredient: trigger `/api/gerechten/[id]/rollup` voor gerechten die dit ingredient gebruiken
7. Marge verandert → indien <30% → `marge_alerts` insert

**Blockers nu**:
- Server Actions voor bon-commit (Geld P0.35)
- Voorraad-page 2037r refactor (Voorraad P0.24) — anders waterfall na update
- Price-mutation trigger (Voorraad P0.28) bij bon-prijs > pricelist-prijs

**Bediening**: iPhone camera, snel.

**Tijd-tot-klaar (target)**: foto → committed inventory <30s p95 (Voorraad Pillar 1).

**Foutmodi**:
- OCR-extract fout → manual edit per regel
- Geen match `master_products` → "Nieuw product?"-flow
- Negative-stock → blokkeer commit (Voorraad P0.27 server action validatie)

### WF8 — Pricelist-mutation → kosten herrekenen → marge-alerts

**Doel**: leverancier-prijswijziging propagheert door naar dish-marges + alert.

**Stappen**:
1. Email naar tenant-inbox → `/api/email/inbound` → opslag in `org_email_inbox`
2. Cron-job triggert `/api/ai/supplier-catalog-parse` (Sonnet vision batch-25)
3. Mutaties in `org_price_mutations` review queue
4. Tenant accepteert in `/price-intelligence` → `supplier_prices` update
5. Trigger `trg_pricelist_change_alert` (Voorraad P0.28) — bij >5% delta → `marge_alerts` insert
6. AttentionPanel op `/` toont alert (Vandaag Pillar 4 deep-link)
7. Affected gerechten lijst → tenant beslist menu-aanpassing

**Blockers nu**:
- Email-in flow end-to-end test (Voorraad P0.29)
- Price-mutation trigger (Voorraad P0.28)
- AttentionPanel deep-link uit Vandaag (P0.4)

**Bediening**: passief — alert komt naar de tenant.

**Tijd-tot-klaar (target)**: mail-binnenkomst → alert in app <10min p95.

**Foutmodi**:
- AI-extract laag-accuraat → handmatige correctie + alias-learning verbetert volgende keer
- Geen match `master_products` → alias-leer-prompt
- Cron-job faalt → backup-cron 4u later

### WF9 — Event-reflectie + carry-over

**Doel**: na event: leerpunten vastleggen, gerecht-populariteit updaten.

**Stappen**:
1. Event status = `voltooid` → toon "Reflectie" CTA in `/events/[id]/hub`
2. `/events/[id]/reflectie` opent
3. Velden: gerechten-feedback (5-sterren per gerecht) · personeel-feedback · klant-NPS · foto's · open notities
4. `populariteit_score` per gerecht herberekend obv NPS + verkoop-frequentie
5. Update `event_reflecties` tabel
6. Insights-tab onder `/gerechten/insights` toont rolling-trend

**Blockers nu**:
- `/events/[id]/reflectie/page.tsx` 254r — verifieer 100%-af-status
- `gerechten.populariteit_score` update-trigger of Server Action (verifieer)

**Bediening**: desktop (Mathijs analyseert), maar opent direct na event = mobile-mogelijk.

**Tijd-tot-klaar (target)**: reflectie invullen <5min voor 1 event.

**Foutmodi**:
- Reflectie vergeten → reminder-banner op Vandaag-AttentionPanel 24u post-event
- Geen NPS-score → optioneel veld, geen blocker

### WF10 — Maandpakket boekhouder

**Doel**: externe boekhouder krijgt maandelijks ZIP met alles wat hij nodig heeft.

**Stappen**:
1. `/geld/boekhouder` opent (1019r → na P0.32 refactored)
2. Kies maand
3. Klik "Download maandpakket" → Server Action `downloadMaandpakket` (Geld P0.32 chunk)
4. Server-side: parallel fetch facturen + bonnen + ritten voor die maand
5. Genereer per factuur: PDF + UBL-XML (P1.41)
6. Genereer `rgs_journaal.csv` + `bonnen.csv` + `ritten.csv`
7. JSZip pack → base64 → download trigger
8. Optioneel: cron-job maandelijks → email naar geconfigureerd boekhouder-adres

**Blockers nu**:
- UBL/Peppol BIS 3.0 export (Geld P1.41)
- BTW-rules code-audit voor zekerheid (Geld P0.33)

**Bediening**: pure desktop, één klik download.

**Tijd-tot-klaar (target)**: download voor 200 facturen + 500 bonnen <30s (Geld Pillar 3 acceptance).

**Foutmodi**:
- UBL-validatie faalt → log + waarschuwing in ZIP-readme.txt
- ZIP >100MB → split per type of streaming-download
- Boekhouder-email mislukt → fallback: tenant downloadt zelf

---

> **Einde § 15 Workflow-audit WF3-10.** Volgende turn: § 16-17 Anthropic kosten-projectie + NL-stack risico-matrix.

---

## § 16. Anthropic kosten-projectie per tier

**Model-tarieven 2026** (per 1M tokens, USD; reken €:USD = 0.92):

| Model | Input | Output | Cache read | Cache write 5min | Cache write 1u |
|---|---|---|---|---|---|
| Haiku 4.5 | $0.80 | $4.00 | $0.08 | $1.00 | $1.60 |
| Sonnet 4.6 | $3.00 | $15.00 | $0.30 | $3.75 | $6.00 |
| Opus 4.7 | $15.00 | $75.00 | $1.50 | $18.75 | $30.00 |

**Caveat Opus 4.7**: ~35% meer tokens dan 4.6 voor dezelfde input (nieuwe tokenizer) — benchmark per workload.

### Per-feature kosten-estimate (Pro-tier "normaal-gebruik")

| Feature | Model | Calls/mnd | Avg in-tokens | Avg out-tokens | Cache-hit% | Kosten €/mnd |
|---|---|---|---|---|---|---|
| Today-briefing | Haiku | 30 | 500 | 200 | 0% | €0.04 |
| Chef-coach (streaming) | Haiku | 100 | 1500 | 800 | 50% | €0.41 |
| AI Pitmaster chat | Haiku | 50 | 2000 | 1500 | 60% | €0.50 |
| AI Offerte-wizard | Sonnet | 40 | 5000 (corpus) | 1500 | **80% cache** | €1.84 |
| Recipe-generate | Sonnet | 20 | 2000 | 1200 | 30% | €0.55 |
| Recipe AI-improve | Sonnet | 30 | 1500 | 600 | 40% | €0.50 |
| Detect-allergens | Haiku | 100 (cascade) | 800 | 200 | 0% | €0.13 |
| Bon-extract (vision) | Sonnet | 50 (3 pages avg) | 4500 | 800 | 0% | €1.17 |
| Bon-classify | Haiku | 200 (lines) | 300 | 100 | 0% | €0.13 |
| Pricelist-extract (vision batch-25) | Sonnet | 10 (10 PDFs/mnd) | 8000 | 2500 | 0% | €0.65 |
| Supplier-catalog parse | Sonnet | 10 | 4000 | 1500 | 0% | €0.32 |
| Klantgesprek-summary | Haiku | 20 | 2500 | 500 | 0% | €0.07 |
| Service-feedback rewrite | Haiku | 10 | 800 | 400 | 0% | €0.02 |
| **Totaal Pro-tier normaal** | | | | | | **€6.33** |

Buffer voor zwaar-gebruik tenant (2× normaal): **€12.66**.

### Cost-cap per tier

| Tier | Maandprijs | Soft-cap | Hard-cap (150%) | Marge | Wanneer kill-switch |
|---|---|---|---|---|---|
| Starter | €49 | €3.00 | €4.50 | €44.50 | bij €4.50 — alle AI uit |
| Pro | €99 | €15.00 | €22.50 | €76.50 | bij €22.50 |
| Enterprise | €249 | €50.00 | €75.00 | €174 | bij €75.00 |

**Pro-tier marge-veiligheid**: gemiddeld gebruik €6.33 << €15 soft-cap, hard-cap €22.50 → comfortabele buffer. Heavy users (50% boven gemiddeld) blijven binnen €10/maand AI-cost — marge per Pro-tier user €89/maand (= 89% gross-margin).

### Cache-optimalisaties (P1)

1. **Recipe-corpus cache** (Offerte-wizard): system + tenant's recepten-bibliotheek = ephemeral cache 5min. Verwacht 80%+ hit-rate per tenant-session → €1.84 → €0.40/mnd per tenant.
2. **Brand-voice prefix cache** (alle AI-routes): "Hop & Bites context ingebakken"-prefix → ephemeral 5min cache. Saves ~30% input-tokens × alle features.
3. **Image-cache voor bon-extract**: nooit dezelfde foto 2× — geen cache nodig.
4. **Batch-API voor offline jobs** (price-list nightly extract): 50% korting via Anthropic Batch API → pricelist-extract €0.65 → €0.33/mnd.

### Projectie 12-maand (100 Pro-tier tenants)

- Maandelijkse AI-spend: 100 × €6.33 = €633/mnd
- Met cache-optimalisaties (P1): 100 × €4.00 = €400/mnd
- Jaarlijks: €7600 → €4800 met optimalisaties
- Per Pro-tier user revenue: 100 × €99 = €9900/mnd → AI-cost = 6.4% van MRR

**Gezond.**

---

## § 17. NL-stack risico-matrix

> Status-legenda: 🟢 in orde · 🟡 actie nodig · 🔴 blocker · ⚪ later

| # | Risico | Status | Impact | Mitigatie | Owner |
|---|---|---|---|---|---|
| **NL-1** | Mollie next-gen webhook idempotency | 🔴 onbevestigd | Dubbele betaling-registratie bij replay; revenue-leak | Verkoop P0.11 — `processed_mollie_events` UNIQUE constraint | Code |
| **NL-2** | Mollie webhook HMAC-signature verify | 🟡 verifieer | Spoofed webhook = false payment | Verkoop P0.11 — `verifyMollieSignature` helper | Code |
| **NL-3** | Moneybird OAuth refresh-token rotation | 🔴 onbevestigd | Token expiry mid-push → factuur niet synced | Verkoop P0.12 — `getValidMoneybirdAccessToken` helper | Code |
| **NL-4** | Moneybird rate-limit (100 req/min/admin) | 🟡 | Throttling bij maand-eind bulk-push | Backoff + queue in `/api/accounting/moneybird` | Code |
| **NL-5** | Peppol BIS 3.0 verplicht voor B2G nu, B2B 1 jul 2030 | 🟡 ontbreekt | NL B2G klanten kunnen geen UBL ontvangen; 2030-deadline | Geld P1.41 — UBL/Peppol export per factuur; build nu BIS 3.0-compliant zodat 2030-ready | Code |
| **NL-6** | BTW catering 9% food / 21% service+alcohol / 0% B2B reverse | 🟡 verifieer | Foute BTW = belastingdienst-fine | Verkoop P0.15 + Geld P0.33 — `BTW_RULES_2026` lookup verplicht, geen AI-derive | Code + Audit |
| **NL-7** | Catering vs takeaway BTW-onderscheid | 🟡 | Catering ter plaatse = 9% met dienstverlening, maar service-bedrag (bedienkost) = 21% — split correct? | Geld P0.33 — handmatige tag per offerte-regel; AI mag suggereren, code splits | Code |
| **NL-8** | AVG Article 15/20 export (recht op data-portabiliteit) | 🟢 | Niet-compliance = €20M fine of 4% omzet | Systeem `/instellingen/data-export` ✓ live; testen voor compleetheid (P0.43) | Bevestig |
| **NL-9** | AVG DPIA voor email-in pricelist-route | 🟡 draft | Email-content kan klantnamen / persoonsdata bevatten | `docs/avg/dpia-pricelist-inbox.md` is draft — finaliseer en signoff | Sam + DPO |
| **NL-10** | AVG retention `org_email_inbox` body 30d, attachments 90d | 🟡 verifieer | Retention-policy zonder cron = data-lake-growth | Cron-job nightly delete > retention; verifieer scheduling | Code |
| **NL-11** | AVG export bevat ALLE tenant-tabellen (test) | 🟡 | Onvolledig = compliance-fail | Systeem P0.43 acceptance | Code |
| **NL-12** | ViDA 2030 — EU-mandate B2B e-invoicing structured + reporting | ⚪ 2030 | Niet relevant nu; bouw nu UBL/Peppol zodat 2030-ready | Geld P1.41 dekt dit deels | Code |
| **NL-13** | HACCP NVWA-aanlevering (KHN-conform) | 🟡 | NVWA-inspectie zonder records = boete | Plannen Pillar 5 + P1.13 NVWA-export `.csv` | Code |
| **NL-14** | HACCP records 2 jaar bewaren | 🟢 | wettelijk | `haccp_records` tabel heeft geen delete-policy → bewaard | OK |
| **NL-15** | AI Act 2026 — limited-risk transparency disclosure | 🟡 | EU AI Act: alle AI-features moeten gelabeld zijn ("AI-gegenereerd") | UI: voeg "Door AI samengesteld" badge toe bij AI-output (offerte-wizard, chef-coach, bon-extract, AI-pitmaster, recept-generate) | Code |
| **NL-16** | AI Act 2026 — geen high-risk classificatie voor BBQ Architect | 🟢 | Geen biometric, geen credit-scoring, geen werknemers-management | OK |
| **NL-17** | Hosting privacy — Vercel = EU-region | 🟡 verifieer | AVG: persoonsdata moet binnen EER blijven | Vercel deployment-config: `frankfurt`/`amsterdam` regio's; Supabase: EU-Central | Bevestig |
| **NL-18** | Anthropic via EU-residency (Cloud-account) | 🟢 | Anthropic biedt EU-residency optie sinds 2026-Q1 | Verifieer in Anthropic console: EU-only routing aan | Sam |
| **NL-19** | Resend email EU-residency | 🟡 | Email-content bevat klantnaam + offerte-bedragen | Resend EU-region of Postmark-EU alternatief | Sam |
| **NL-20** | Bonnen + facturen bewaren 7 jaar | 🟢 | NL Belastingdienst-vereiste | `bonnen` en `facturen` tabellen hebben geen delete-policy | OK |

**Top-5 P0 NL-risks** (op te lossen vóór Pro-tier launch):
1. NL-1 Mollie idempotency (Verkoop P0.11)
2. NL-3 Moneybird OAuth refresh (Verkoop P0.12)
3. NL-6 BTW catering audit (Verkoop P0.15 + Geld P0.33)
4. NL-9 DPIA email-in signoff (Sam + DPO action)
5. NL-15 AI Act badge "Door AI samengesteld" overal (UI-toevoeging in elke AI-touchpoint)

---

> **Einde § 16-17 Kosten + NL-stack risico's.** Volgende turn: § 18 12-weken master-plan + Definition of Done per P0 + executive summary.

---

## § 18. 12-weken master-plan + Definition of Done per P0

> Inschatting: Sam 10-20u/week solo + Claude. Veronderstelt geen externe hire. Sam kan onderbreken / herprioriteren. Quick-wins eerst zodat momentum zichtbaar is binnen 14 dagen.

### Week 1 — Quick wins ronde 1 (~24u werk)

| P0 | Wat | Uren | File:line |
|---|---|---|---|
| P0.10 | `git rm -r src/app/offerte-editor/` + middleware redirect | 0.25 | [offerte-editor/](src/app/offerte-editor/) |
| P0.8 | Agenda `?conflict=X` deep-link honoreren | 1 | [agenda/page.tsx](src/app/agenda/page.tsx) |
| P0.44 | Email-in-adres tonen in `/mailbox` | 1 | [mailbox/page.tsx](src/app/mailbox/page.tsx) |
| P0.26 | ExtensionConnectPanel dood-of-leven beslissen | 1 | [leveranciers/_components/ExtensionConnectPanel.tsx](src/app/leveranciers/_components/ExtensionConnectPanel.tsx) |
| P0.45 | `docs/ux-master.md` sectie 5 sync met sidebar | 2 | [docs/ux-master.md](docs/ux-master.md) |
| P0.4 | Vandaag AttentionPanel deep-links | 2 | [today/AttentionPanel.tsx](src/components/dashboard/today/AttentionPanel.tsx) |
| P0.6 | HACCP-field dedup: `/haccp/field` → selector | 2 | [haccp/field/page.tsx](src/app/haccp/field/page.tsx) |
| P0.22 | `/bedenker` als Menu-hub tab | 2 | navigation + tab-bar in `_client.tsx` |
| P0.15 | BTW-audit `acceptance-workflow.ts` | 2 | [src/lib/acceptance-workflow.ts](src/lib/acceptance-workflow.ts) |
| P0.23 | Allergeen hard-rule grep + audit | 2 | code-grep + fix waar nodig |
| P0.33 | BTW-rules `BTW_RULES_2026` lookup verifieer in `/financien` | 2 | [financien/page.tsx](src/app/financien/page.tsx) |
| P0.2 | AIQuickPrompts context-aware naar `heroEvent` | 3 | [today/AIQuickPrompts.tsx](src/components/dashboard/today/AIQuickPrompts.tsx) |
| P0.3 | Type-safety Vandaag-hub | 3 | [src/app/page.tsx](src/app/page.tsx) |
| P0.34 | Per-tenant labor-rate config (migration + UI) | 3 | nieuwe migration + [instellingen/page.tsx](src/app/instellingen/page.tsx) |

**Eind van week 1**: 14 P0's gefixed, file `/offerte-editor` weg, Vandaag deep-links werken.

### Week 2 — Quick wins ronde 2 (~25u werk)

| P0 | Wat | Uren |
|---|---|---|
| P0.29 | Email-in flow end-to-end runbook + test (Voorraad Pillar 2) | 3 |
| P0.37 | Bon-classify Promptfoo eval-suite (30 cases) | 3 |
| P0.16 | Token entropy `/q/[token]` + rate-limit `/api/public-offerte` | 3 |
| P0.43 | AVG-export end-to-end test + progress UI | 4 |
| P0.39 | `/admin/funnel` 5 KPI's + funnel-grafiek (Recharts) | 4 |
| P0.40 | AI-cost hard-cap kill-switch in elke AI-route | 4 |
| P0.21-partial | Menu Server Actions skelet (verder in week 5) | 4 |

**Eind van week 2**: 21 P0's klaar, KPI-funnel live, hard-cap actief, email-in 100% verifieerd.

### Week 3-4 — Server Component splits ronde 1 (~42u)

| P0 | Wat | Uren |
|---|---|---|
| P0.1 | Vandaag-hub Server Component split | 6 |
| P0.31 | Financien-hub Server Component split | 5 |
| P0.18 | Menu-analyse BCG embed (gedeelde component) | 4 |
| P0.41 | Website + Admin Server Component splits | 8 |
| P0.32 | Boekhouder Server Component + ZIP-Server-Action | 6 |
| P0.5 | serviceMockData wegvegen + Server Component shell | 6 |
| P0.9 + P0.36 | Type-safety Plannen + Geld | 7 |

**Eind van week 4**: mega-pages onder controle, LCP-budget realistic op `/`, `/financien`, `/admin`.

### Week 5-6 — Server Actions overall (~30u)

| P0 | Wat | Uren |
|---|---|---|
| P0.7 | Plannen `actions.ts` (event CRUD) | 4 |
| P0.14 | Verkoop `actions.ts` (offerte CRUD) | 4 |
| P0.21 | Menu `actions.ts` (gerecht CRUD + cost-rollup) | 6 |
| P0.27 | Voorraad `actions.ts` (inventory mutate + bon-commit) | 6 |
| P0.35 | Geld `actions.ts` (manual W&V + ritten) | 6 |
| P0.42 | Systeem `actions.ts` (settings + members) | 4 |

**Eind van week 6**: alle direct-Client-Supabase-mutates vervangen door Server Actions met Zod + re-auth. OWASP A01-risico afgedekt.

### Week 7-8 — Webhooks + security + bundle (~34u)

| P0 | Wat | Uren |
|---|---|---|
| P0.11 | Mollie webhook idempotency + HMAC | 3 |
| P0.12 | Moneybird OAuth refresh-token rotation | 3 |
| P0.28 | Price-mutation trigger + `marge_alerts` | 4 |
| - | RLS evil-tenant Playwright test-suite | 8 |
| - | Bundle-analyzer + Lighthouse-CI in GitHub Actions | 4 |
| - | globals.css opruim slice 1 (10k → 5k regels) | 8 |
| P0.20 | Componenten slice 2 (fysiek move) | 3 |

**Eind van week 8**: webhooks idempotent, evil-tenant-test groen, Lighthouse-CI dichtspijkert performance per PR.

### Week 9-10 — AI 100%-af (~32u)

| P0 | Wat | Uren |
|---|---|---|
| P0.13 | AiOfferteWizard Citations API + prompt caching | 6 |
| P0.17 | AI Pitmaster echte content (Haiku streaming, event-context) | 8 |
| P0.19 | `gerechten/_client.tsx` 1805r refactor → tab-componenten | 8 |
| - | AIStudio.tsx (1172r) refactor of schrap | 6 |
| - | AI-context cross-page persist (5-min localStorage) | 4 |

**Eind van week 10**: Vraag-Rook chat overal, Citations zichtbaar in offerte-wizard output, AI-context overleeft tab-switch.

### Week 11-12 — Voorraad mega-refactor + demo-seed + launch-prep (~45u)

| P0 | Wat | Uren |
|---|---|---|
| P0.24 | `voorraad/page.tsx` 2037r → Server + tabs | 10 |
| P0.25 | `price-intelligence/page.tsx` 4600r → 4 tabs | 16 |
| P0.30 | Type-safety Voorraad (full pass) | 8 |
| P0.38 | Demo-data seed-API (Pillar 1 Systeem) | 8 |
| - | NL-15 AI Act "Door AI samengesteld"-badge in elke AI-output | 3 |

**Eind van week 12**: alle 50 P0's klaar. Pro-tier launch-ready.

### Quick-glance P0 telling per hub

| Hub / Cross-cutting | P0's | Geschat |
|---|---|---|
| Vandaag | 4 | 14u |
| Plannen | 5 | 16u |
| Verkoop | 7 | 25u |
| Menu & Recepten | 7 | 33u |
| Voorraad | 7 | 48u |
| Geld | 7 | 29u |
| Systeem | 8 | 35u |
| Cross-cutting (cmdK · AI · Theming · Onboarding · CWV · Security) | 5 | 33u |
| **Totaal** | **50** | **~233u** |

233u / (15u/week gemiddeld) = 15.5 weken. **12-weken-plan haalbaar als Sam 20u/week investeert** (= 240u over 12 wk) of als sommige P0's gedelegeerd / geknipt worden.

### Definition of Done per P0

Een P0 is pas "klaar" als alle 7 checkboxes groen zijn. Per P0 vul deze tabel in als PR-checklist:

| # | Check | Hoe |
|---|---|---|
| 1 | **Code merged** in `main` na PR + 1 review | GitHub PR-merge |
| 2 | **`pnpm typecheck` groen** | CI |
| 3 | **`pnpm test` groen** (Vitest unit + Playwright integration) | CI |
| 4 | **RLS-check**: evil-tenant test toont 0 cross-tenant leaks voor geraakte tabel(len) | Playwright `tests/rls/evil-tenant.spec.ts` |
| 5 | **CWV-budget**: Lighthouse-CI op geraakte page LCP <1500ms, INP <100ms, CLS <0.05 | `.lighthouserc.json` |
| 6 | **Cost-cap getest**: bij AI-feature, hard-cap-test simuleert 151% spend → 402 returned zonder Anthropic-call | Vitest mock-test op `checkAndReserveAiBudget` |
| 7 | **Visual-regression**: voor UI-changes, Playwright screenshot-diff < 5% | Playwright |

**Plus per P0 (in commit-message)**:
- Welke Pillar wordt ingelost (refer terug naar pillar-nummer in zijn hub)
- Hard-rule(s) gerespecteerd (1-10)
- File:line van de wijziging
- Monitor-link (Vercel RUM, Sentry of Supabase logs) waar deze feature gemonitord wordt

### Pillar-delivery-tracking

Houd onderstaande matrix bij — elke pillar uit § 2-8 moet ✅ zijn bij Pro-tier launch:

| Hub | Pillar | Status na 12w |
|---|---|---|
| Vandaag | 1 (2s overzicht) | ✅ na P0.1 |
| Vandaag | 2 (context-aware AI prompts) | ✅ na P0.2 |
| Vandaag | 3 (activation-checklist) | ✅ live + P0.38 demo-data |
| Vandaag | 4 (conflict-deep-links) | ✅ na P0.4 |
| Vandaag | 5 (status niet KPI) | ✅ huidig |
| Plannen | 1 (event <60s) | ✅ na P0.7 + Pillar 2 acceptance |
| Plannen | 2 (realtime conflict) | ✅ na P0.7 + P1.11 |
| Plannen | 3 (event-hub command-center) | ✅ huidig + P1.8 refactor |
| Plannen | 4 (KDS field-ready) | ✅ na P0.5 + P1.12 visual-regression |
| Plannen | 5 (HACCP moat) | ✅ na P0.6 + Lars-test |
| Verkoop | 1 (offerte <5min) | ✅ huidig + monitoring |
| Verkoop | 2 (klant tekent zonder login) | ✅ huidig + P0.16 security |
| Verkoop | 3 (AI met Citations) | ✅ na P0.13 |
| Verkoop | 4 (auto event+factuur+Moneybird) | ✅ na P0.11 + P0.12 + P0.15 |
| Verkoop | 5 (realtime marge) | ✅ huidig |
| Menu | 1 (3-laags cost-rollup) | ✅ huidig + P0.18 |
| Menu | 2 (allergenen uit DB) | ✅ na P0.23 audit |
| Menu | 3 (recipe-builder) | 🟡 P1.27-P1.32 nodig — schuift naar v1.1 indien tijdsdruk |
| Menu | 4 (AI-bedenker) | ✅ huidig + P0.22 IA-integratie |
| Menu | 5 (BCG-analyse) | ✅ na P0.18 |
| Voorraad | 1 (bon <30s) | ✅ na P0.24 + P0.27 |
| Voorraad | 2 (email-in) | ✅ na P0.29 + P0.44 |
| Voorraad | 3 (price-mutation alerts) | ✅ na P0.28 |
| Voorraad | 4 (auto-reorder) | ✅ huidig |
| Voorraad | 5 (alias-learning) | ✅ huidig |
| Geld | 1 (10s overzicht) | ✅ na P0.31 |
| Geld | 2 (BTW NL-conform) | ✅ na P0.15 + P0.33 |
| Geld | 3 (maandpakket) | ✅ na P0.32 + P1.41 UBL |
| Geld | 4 (bon-classify) | ✅ na P0.37 |
| Geld | 5 (rittenregistratie) | ✅ huidig |
| Systeem | 1 (demo-data) | ✅ na P0.38 |
| Systeem | 2 (AI-cost transparant + cap) | ✅ na P0.40 |
| Systeem | 3 (5 KPI's funnel) | ✅ na P0.39 |
| Systeem | 4 (AVG-export 60s) | ✅ na P0.43 |
| Systeem | 5 (settings plat) | ✅ huidig |

**35 pillars over 7 hubs, 33 ✅ na 12 weken, 2 schuiven naar v1.1** (Menu Pillar 3 recipe-builder hangt af van Sam's prio).

### Wat ná week 12

P1's en P2's verschoven naar v1.1 (zomer 2026):
- UBL/Peppol BIS 3.0 export per factuur (Geld P1.41) — wel doen, maar na launch
- FullCalendar Resource Timeline (Plannen P1.10)
- Nutritional info per gerecht (Menu P1.27)
- Multi-location inventory (Voorraad P1.36)
- Payroll-export NL (Geld P1.42)
- Recipe yield-scaling (Menu P1.28)
- Custom domain support (Systeem P1.49)

P2's voor 2027:
- SAML/SSO Enterprise
- Multi-currency
- Webhooks-outgoing (Zapier/Make)
- ML-forecasting voor reorder-tijdstip

---

## § 0. Executive summary

> Tien zinnen, mensentaal, voor wie alleen de samenvatting leest.

1. BBQ Architect is een volwassen catering-SaaS met 7 hubs, ~30 routes, 50+ Supabase-migraties, AI in 18+ routes, en één klant die 'm vol gebruikt (Hop & Bites Schoonoord). De Pro-tier launch met 3 externe cateriers staat gepland voor zomer 2026.
2. De grootste sterke punten: HACCP-veldmodus diep (uniek in NL), AI-bedenker met klant-context, email-in route voor leverancier-PDFs, een themable klant-portal met iDEAL.
3. De grootste zwakke punten: een handvol mega-files (`price-intelligence` 4600r, `voorraad` 2037r, `gerechten/_client` 1805r) die LCP en onderhoudbaarheid drukken, type-safety opt-out met `eslint-disable any`, Mollie + Moneybird webhooks zonder bevestigde idempotency, en twee AI-features die nog stub zijn (`/gerechten/ai-pitmaster`, `/gerechten/menu-analyse`).
4. Het hoofd-principe vanaf 2026-05-18: **doe wat de concurrentie ook doet** — Tripleseat, Caterease, Apicbase, Foodnotify, Toast. Geen exotische UX, alleen bewezen patterns. Anti-Pillars zijn alleen "wij doen X expres anders dan iedereen".
5. Per hub vier vragen beantwoord: wat is live, wat doen concurrenten anders, wat zijn onze Golden Pillars (3-5 meetbare claims), en welke gaps moeten weg vóór launch.
6. Totaal 50 P0's verspreid over 7 hubs en 6 cross-cutting lagen, totaal ~233u werk = ~12 weken bij 20u/week. Quick-wins eerst (week 1-2 = 21 P0's onder 4u/stuk).
7. Anthropic-kosten projectie: Pro-tier tenant gebruikt gemiddeld €6.33/maand AI, met cache-optimalisaties €4/maand. Bij €99/maand prijs blijft 89-94% gross-margin over. Hard-cap kill-switch op 150% per tier.
8. NL-stack risico's: top-5 zijn Mollie idempotency, Moneybird OAuth-refresh, BTW catering-audit, DPIA email-in signoff, en AI Act "Door AI samengesteld"-badge in elke AI-output. Allemaal P0.
9. CWV-budgetten 2026: LCP <1500ms, INP <100ms, CLS <0.05 — afgedwongen via Lighthouse-CI per PR. Bundle-analyzer in CI om de 10k regels globals.css naar <2k te krijgen.
10. **Wat doet de gebruiker NU**: lees week 1 (24u quick wins), beslis welke 14 P0's eerst, en commit hub-voor-hub. Geen 70%-demo's meer — elk P0 is pas klaar als alle 7 DoD-checkboxes groen zijn.

---

> **Einde document.** 18 secties, alle 7 hubs + 6 cross-cutting lagen + 8 workflows + Anthropic-kosten + NL-stack risico's + 12-weken plan + DoD-matrix. Volgende stap voor Sam: kies welke quick-wins in week 1 eerst — voorgesteld: P0.10 (rm offerte-editor 0.25u), P0.4 (conflict deep-links 2u), P0.39 (funnel 5 KPI's 4u).
