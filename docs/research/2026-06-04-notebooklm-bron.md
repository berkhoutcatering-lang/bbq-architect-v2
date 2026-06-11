# BBQ Architect — Diepe research voor NotebookLM

**Datum:** 2026-06-04
**Auteur:** Mathijs Berkhout + Claude (research-assistent)
**Doel:** Eén complete, kopieerbare bron-tekst voor NotebookLM waarin elke functie, sub-pagina en menustructuur van BBQ Architect feitelijk is vastgelegd, samen met een live geverifieerd concurrentie-onderzoek (NL/BE catering + keuken-SaaS), de marktwaarde, de tekortkomingen en de echte USP's. Te gebruiken voor positionering, pricing en roadmap-beslissingen door zelf-ondervraging in NotebookLM.

**Gebruiksaanwijzing voor NotebookLM:** plak dit document als één bron in een nieuw notebook. Stel vragen als:
- "Wat zijn de USP's van BBQ Architect tegenover Catermonkey?"
- "Welke concurrent is het sterkst voor een 5-events-per-maand cateraar?"
- "Welke features ontbreken nog in BBQ Architect die EasyParty wel heeft?"
- "Wat doet de Geld-hub precies?"
- "Hoeveel mag een Pro-tier-klant aan AI verbruiken voordat het stopt?"

Het document is geschreven in feitelijk Nederlands, met technische termen in Engels. Externe claims hebben een bron + datum. Interne claims komen uit de code-base zelf en zijn waar mogelijk verwijzingen naar de exacte file.

---

# DEEL A — BBQ ARCHITECT INTERN

## 1. Wat is BBQ Architect

BBQ Architect is een B2B SaaS-platform voor BBQ- en event-cateraars in Nederland en België, met als doelgroep de operationele cateraar van 1 tot 30+ events per maand. Het is een single-purpose-product: niemand anders dan de cateraar zelf, zijn team en zijn klanten raken het ooit aan. De klanten zien maar één route — `/q/[id]` voor offerte-acceptatie, en optioneel `/aanvraag/[slug]` of `/arrangement/[slug]` als de cateraar dat publiek heeft gemaakt.

Het businessmodel is een drie-tier abonnement:

- **Starter** — €49/maand. Voor solo-cateraars die uit Excel komen.
- **Pro** — €99/maand. Voor cateraars met een keuken-medewerker en/of inhuur-crew. Meest gekozen.
- **Enterprise** — €249/maand. Voor cateraars met meerdere locaties, white-label-noodzaak (eigen domein op `/q/[id]`, eigen branding op PDF's en e-mail), of multi-brand-setup.

Het product wordt gebouwd én gebruikt door Mathijs Berkhout, eigenaar van BBQ-cateraar Hop & Bites uit Schoonoord (Drenthe). Hop & Bites is daarmee zowel klant nul als design-partner. Het levert het product een dogfood-loop die concurrenten niet hebben: elke feature wordt eerst gewogen tegen "is dit hoe wij vandaag werken bij Hop & Bites".

Drie persona's sturen alle design-keuzes:

- **Lars** (~80% van het gebruik) — een keuken-medewerker, geen IT-affiniteit, werkt op tablet in de keuken met handschoenen aan, niet-mathematisch geletterd. Lars dwingt simpelheid, grote touch-targets (≥44px), Nederlandse mensen-taal, geen jargon. Lars MOET de app foutloos kunnen bedienen.
- **Pro-tier-cateraar** (~15% van het gebruik) — eigenaar/bedrijfsleider met 5-30 events per maand, denkt in marges en pijplijn, gebruikt zowel desktop als mobiel. Pro-tier dwingt feature-diepte: filters, exports, bulk-acties, command-palette, snelheid.
- **Sam zelf** (~5% van het gebruik) — Mathijs zelf in zijn rol als eigenaar/bouwer. Power-user, sneller op het toetsenbord dan op de muis, gebruikt ⌘K voor alles. Sam mag krijgen wat hij wil, maar nooit als het Lars in de weg zit.

De prioriteit-regel is hard: **Lars > Pro > Sam**. Als Sam iets wil dat Lars verwart, wint Lars.

De positionering die uit deze persona-keuze en het businessmodel volgt is:

> *De enige Nederlandse catering-suite met AI-offerteflow, menu-engineering, tablet-HACCP en volledig white-label theming in één — voor de prijs van een Moneybird-abonnement.*

Die zin is geen marketing-leus maar een toetsbare claim. Elk woord erin verwijst naar een hard verifieerbare feature die in latere secties van dit document terugkomt.

## 2. Stack & architectuur

De technische stack is in juni 2026 als volgt vastgelegd in `package.json`:

**Framework laag:**
- Next.js 16.2.6 (App Router, Server Components, Server Actions)
- React 19.2.3 en React-DOM 19.2.3
- TypeScript 6.0.2 — let op: **`strict: false`** in tsconfig.json (gap; bewust uitgezet ivm legacy-code, type-veiligheid voor server-actions handmatig via Zod-validatie)
- Node.js runtime voor API-routes met Anthropic SDK

**UI & styling:**
- Tailwind CSS 3.4.19 (let op: nog géén v4 met CSS-first `@theme`)
- next-themes 0.4.6 voor light/dark switch
- lucide-react 0.476 voor icons (geen icon-lib in publieke `/aanvraag` route — daar staan inline SVG's)
- framer-motion 12.4.7 voor micro-interacties
- vaul 1.1.2 voor drawers (Apple-stijl bottom-sheets op mobiel)

**Data-view libraries:**
- @tanstack/react-table 8.21.3 — alle data-tabellen (offertes, klanten, gerechten, leveranciers, voorraad)
- nuqs 2.8.9 — URL-state-sync voor filters en sortering
- recharts 3.8.0 — grafieken in Geld-hub en Vandaag-hub
- @fullcalendar/* 6.1.20 — Plannen-hub (daygrid, timegrid, interaction, list)

**PDF & document:**
- @react-pdf/renderer 4.5.1 — branded offerte- en factuur-PDF's
- jspdf 4.2.1 + jspdf-autotable 5.0.7 — server-side bonnen-export en menukaart-pdfs
- pdf-lib 1.17.1 — PDF-manipulatie (e-sign, bijlagen)
- pdfjs-dist 5.6.205 + @react-pdf-viewer/* 3.12.0 — PDF-preview in browser (offerte-view, bonnen)

**Canvas & geo:**
- konva 10.3.0 + react-konva 19.2.4 — plattegrond-editor (`/events/[id]/service/plattegrond`)
- react-rnd 10.5.3 — drag/resize op plattegrond
- maplibre-gl 5.24.0 — locatie/route-kaarten (logistiek, ritten)
- @dnd-kit/* — kanban-style drag-drop in leads-pijplijn en kookbord

**Files & images:**
- archiver 8.0 — ZIP-export voor AVG-data-dump en bonnenkistje-bulk-download
- jszip 3.10 — client-side ZIP voor archief-downloads
- papaparse 5.5 — CSV-import/export
- fast-xml-parser 5.8 — UBL/Peppol parser
- browser-image-compression 2.0 — foto-compressie vóór upload
- heic2any 0.0.4 — iPhone HEIC → JPEG conversie
- sharp 0.34 — server-side image-processing
- qrcode.react 4.2 — QR-codes voor mobiele links en barcode-fallback

**Database & auth:**
- @supabase/ssr 0.10.2 + @supabase/supabase-js 2.97 — auth, database, storage
- supabase CLI 2.98 als dev-dependency

**AI & email:**
- @anthropic-ai/sdk 0.95.1 — Claude Haiku/Sonnet/Opus
- resend 6.10 — transactionele en branded e-mail

**Utility:**
- culori 4.0 — OKLCH-conversies voor theming
- date-fns 4.3 — Nederlandse locale, week-arithmetic
- nanoid 5.1 — UUID-light identifiers

**Tooling & test:**
- vitest 4.1 — unit-tests (`pnpm test`)
- @playwright/test 1.60 — visual regression op menukaart-templates (`pnpm test:visual`)
- @next/bundle-analyzer 16.2.7 — bundle-budget (`pnpm analyze`)
- eslint 9 + eslint-config-next 16.2.6
- tsx 4.21 — script-runner voor AI-evals (`pnpm ai-eval`)
- apca-w3 + pixelmatch + pngjs — contrast-audit (`pnpm lint:contrast`)

**Hosting:**
- Vercel (Next.js-native), Edge waar mogelijk, Node-runtime voor Anthropic-calls
- Supabase Pro (PostgreSQL 15+, RLS, Storage, Auth)
- Cloudflare Email Worker (extern, voor inbound email naar `/api/email/inbound`)

**Vercel cron-jobs in `vercel.json` (4 actief):**
- `0 3 * * *` → `/api/cron/anonymize-floor-plan-guests` (AVG-retentie)
- `0 4 * * *` → `/api/pricelists/batch/poll` (Anthropic Batch-polling)
- `0 6 * * *` → `/api/financien/summary` (KPI-herrekening)
- `15 4 * * *` → `/api/cron/recipe-cost-recompute` (recipe-cost-cascade)

Cron-jobs gerefereerd in dit document maar NIET geconfigureerd in vercel.json (gaps): google-calendar-sync, marge-alerts-scan, market-pulse, ritten-vergeten. Zie appendix A.

**`next.config.mjs` highlights:**
- `serverExternalPackages: ['archiver']` — Turbopack laat archiver als require() draaien (geen ESM default-export)
- Bundle analyzer via `ANALYZE=true pnpm build` → HTML-rapport in `.next/analyze/`

**Wat opvalt en wat dit betekent:**

1. **Tailwind 3.4, niet v4.** De CSS-first `@theme`-syntax met OKLCH-tokens van Tailwind v4 staat nog op de roadmap. Themas worden nu geïnjecteerd via inline CSS-vars (`themeStyleVars` uit `src/lib/portalThemes.ts`). Migration naar v4 is een open item.
2. **Geen BlockNote, geen cmdk dependency.** Het ⌘K Vraag-Rook-command-palette is een eigen build, niet de standaard cmdk-library. De Notion-stijl rich-text-editing (BlockNote) staat eveneens op de roadmap.
3. **Geen shadcn/ui als dependency.** Het project gebruikt het patroon "copy components in" — geen pakket-installatie. Componenten worden custom geschreven met Tailwind utility-classes.
4. **Geen native mobile app, alleen PWA.** Service-worker-version wordt geïnjecteerd via `scripts/inject-sw-version.mjs` bij elke build. Mobiele navigatie loopt via BottomNav, niet via app-store-binary.
5. **AI is een eerste-klas dependency.** Anthropic SDK 0.95.1, geen OpenAI, geen Groq, geen Mistral. Eén leverancier = eenvoud, maar ook concentratie-risico.

## 3. Multi-tenant model & RLS

BBQ Architect is multi-tenant op tabel-niveau. Elke productieve data-tabel heeft een `organization_id` foreign key en een Row-Level-Security-policy die ervoor zorgt dat een ingelogde gebruiker alleen rijen ziet van organisaties waarin hij of zij lid is.

De fundamenten zijn vastgelegd in `supabase/migrations/001_multi_tenant.sql`:

- **`organizations`** — `id UUID`, `slug UNIQUE`, `tier (starter|pro|enterprise)`, `created_at`. De `slug` wordt gebruikt voor publieke white-label URLs (`/aanvraag/{slug}`, `/arrangement/{slug}`).
- **`organization_members`** — `organization_id FK`, `user_id FK`, `role (Admin|Pitmaster|Medewerker)`. Eén gebruiker kan lid zijn van meerdere organisaties (gebruikt door Mathijs als hij Hop & Bites + test-tenants tegelijk wil zien).
- **Helper functions in `auth`-schema:**
  - `auth.user_org_ids() returns setof UUID` — alle org-id's waar de huidige `auth.uid()` lid is. SECURITY DEFINER zodat het door RLS-policies kan worden aangeroepen.
  - `auth.current_org_id() returns UUID` — de eerste actieve org (default). Wordt gebruikt voor INSERT-defaults.

**RLS-patroon per tabel:**

```sql
CREATE POLICY org_select ON gerechten FOR SELECT
  USING (organization_id IN (SELECT auth.user_org_ids()));

CREATE POLICY org_insert ON gerechten FOR INSERT
  WITH CHECK (organization_id IN (SELECT auth.user_org_ids()));

CREATE POLICY org_update ON gerechten FOR UPDATE
  USING (organization_id IN (SELECT auth.user_org_ids()))
  WITH CHECK (organization_id IN (SELECT auth.user_org_ids()));

CREATE POLICY org_delete ON gerechten FOR DELETE
  USING (organization_id IN (SELECT auth.user_org_ids()));
```

Op elke tabel met `organization_id` staat een index op die kolom — Postgres heeft die anders niet voor de RLS-filter-query.

**Service-role pad:**
- Publieke routes (`/q/[id]`, `/aanvraag/[slug]`, `/arrangement/[slug]`) hebben geen ingelogde gebruiker. Ze gebruiken de service-role-key (alleen server-side) om met expliciete tenant-resolution data te lezen en te schrijven.
- Voorbeeld: `/api/public-lead-form/[slug]` resolved de tenant via `organizations.slug` en doet `INSERT INTO leads (organization_id, ...)`.

**Belangrijke security-migraties:**
- `20260508084403_security_hardening_public_access.sql` — locked down de service-role-exposure
- `20260508084409_security_advisor_hardening.sql` — fix voor Supabase advisor-warnings
- `013_rls_supplier_invoices_kds.sql` — RLS op leveranciers-facturen en KDS-state

**Aantal tabellen:** 80+ in productieve schema's. Het migrations-archief telt 90 files in `supabase/migrations/` met in totaal meer dan 10.000 regels SQL. Belangrijke recente migrations:
- `011_activation_events.sql` (804 events live sinds 2026-05-01)
- `20260512100000_pricelist_pdf_extractor.sql` (PDF + alias-learning)
- `20260513120000_pricelist_chunked_uploads.sql`
- `20260513140000_suggested_aliases.sql`
- `20260515120000_offerte_signed_pdf.sql`
- `20260516100000_ai_usage_table.sql` (cost-tracking)
- `20260518192219_haccp_v3_photo_corrective_trends.sql`
- `20260601100000_price_intelligence_application_layer.sql`
- `20260601130000_leads.sql` (lead-funnel)
- `20260601150000_ai_action_proposals.sql` (klikbare AI-acties)
- `20260604140000_funnel_events.sql` (anonieme configurator-tracking)

**Postgres 15+ generated-columns:** vereisen IMMUTABLE expressions. Voor full-text search over Nederlands wordt `to_tsvector('dutch', ...)` gewrapped in een eigen IMMUTABLE-function — anders faalt de migration met "function is not immutable".

## 4. Informatie-architectuur & hub-overzicht

De IA-keuze is hub-and-spoke, vastgelegd op 2026-05-01. De sidebar bevat **7 hubs** (zie `src/lib/navigation.tsx` en `src/components/Sidebar.tsx`). De volgorde in de sidebar is bewust gekozen op gebruiks-frequentie van Lars en de Pro-tier-cateraar:

| # | Hub | Hub-href | Sidebar-icoon | Doel |
|---|-----|----------|---------------|------|
| 1 | **Vandaag** | `/` | LayoutDashboard | Hardcoded bovenaan. Operationeel dashboard: wat moet er vandaag gebeuren? |
| 2 | **Plannen** | `/agenda` | Calendar | Agenda + events. Sub-tabs: Agenda, Events. |
| 3 | **Verkoop** | `/offertes` | Receipt | Sub-tabs: Aanvragen, Arrangementen, Offertes, Klanten. |
| 4 | **Menu** | `/gerechten` | ChefHat | Sub-tabs: Gerechten, Componenten, Kookbord. (Menu en Keuken zijn samengevoegd in de hub-titel "Menu") |
| 5 | **Voorraad** | `/voorraad` | Package | Sub-tabs: Voorraad, Inkoop, Leveranciers, Materieel, Logistiek, Inkoopprijzen. |
| 6 | **Geld** | `/financien` | BarChart3 | Sub-tabs: Financiën, Uren, Bonnen scannen, Bonnenkistje, Boekhouder, Rittenregistratie. |
| 7 | **Systeem** | `/systeem` | Settings | Sub-tabs: Instellingen, Gebruikers, Integraties, Mailbox, Website, Help Center, Platform Beheer. |

**Hub-link-patroon:** een klik op de hub-titel zelf gaat naar de `hubHref` (de canvas-pagina van die hub). De children verschijnen altijd onder de hub-titel als sub-tabs (geen toggle nodig — het is geen klassieke folder). Dit is een bewuste afwijking van klassieke sidebars: een hub is zowel een page als een container.

**Mobile-IA — BottomNav (vastgesteld 2026-05-31):**
Op telefoon en kleine tablets verschijnt onderaan een BottomNav met 5 tabs:

1. Vandaag
2. Plannen
3. Verkoop
4. Menu
5. Meer (opent de volledige sidebar als overlay-drawer)

Geld viel buiten de BottomNav omdat persona-frequentie aantoonde dat Lars de Geld-hub vrijwel nooit aanraakt; Pro-tier-cateraar wel maar typisch op desktop. De keuze is consistent met de Lars > Pro > Sam-prioriteit.

**Sidebar-collapse-gedrag:**
- Touch-tablets (`pointer: coarse`): sidebar blijft uitgeklapt zodat Lars labels kan lezen.
- Desktop met klein window (1100-1280px): collapsed naar icon-rail voor Mathijs als muis-power-user.
- Tijdens event-runtime (`/events/[id]/service` of `/field`): auto-collapsed zodat Lars meer breedte heeft op de tablet.

**Redirect-stubs (bewust, niet dood):**
- `/berichten` → redirect naar Mailbox
- `/boekhouding` → redirect naar Geld
- `/faq` → redirect naar Hulp
- `/plannen` → alias naar `/agenda`
- `/verkoop` → alias naar `/offertes`

Deze blijven leven na de hub-merge zodat oude links blijven werken.

**Publieke marketing-pagina's:**
- `/welkom` — publieke landing (niet de onboarding-variant — dat zit op `/onboarding`)
- `/pricing` — nog niet af in juni 2026
- `/contact` — contactformulier
- `/legal/privacy`, `/legal/dpa`, `/legal/voorwaarden`

## 5. Hub Vandaag (`/`)

Vandaag is de hardcoded eerste link in de sidebar en standaard-landing na inloggen. De pagina (`src/app/page.tsx`) is opgebouwd uit **9 layout-secties** met code-splitting + lazy-load voor non-critical widgets.

**Persona-fit:** primair Sam + Pro-tier (eigenaar die 's ochtends checkt), secundair Lars (welk event draai ik vandaag?). Frequentie dagelijks, soms meerdere keren.

### 5.1 Layout-secties (in volgorde)

**1. Header (sticky)** — 44px, backdrop-blur-xl op 80% opacity.
- Links: logo (48px goud-vierkant met vlamuitje) + bedrijfsnaam
- Rechts: notificatie-bel (rode dot bij `verlopenFacturen.length > 0 || criticalConflicts.length > 0`) + datum/tijd
- Datum: volledige weekdagnaam op desktop (`donderdag, 4 juni`), afgekort op mobiel (`4 jun`)
- Tijd: tabular-nums HH:MM, minuut-getimerd via `setInterval(() => setCurrentTime(), 60000)`

**2. Greeting + CTA-strip**
- Dynamische groet obv uur: Goedenacht (<6) / Goedemorgen (6-12) / Goedemiddag (12-18) / Goedenavond (18+)
- Twee knoppen: "Rit registreren" (grijze ghost) + "Nieuw event" (brand goud)
- Mobiel: flexwrap met 8px gap

**3. OnboardingChecklist** (dynamisch verborgen)
- Zichtbaar zolang `!onboardingData.hasOwnGerecht || !hasRealOfferte || !hasSentOfferte`
- 5 stappen (logo, eigen gerecht, offerte gemaakt, offerte verzonden, demo-data)
- Auto-hide na 4/5 stappen voltooid

**4. EventHero**
- Toont volgende event (eerste van `nextEventsList` gesorteerd op datum)
- Velden: eventnaam, dagen-tot, gasten, locatie, status (confirmed / draft / verzonden)
- Revenue: `guests × ppp`
- CTA: "Open event" → `/events/[id]/hub`
- Empty-state: "Geen komende events"

**5. AIQuickPrompts** (rij van 12 prompts)
- 2 kolommen: **Keuken** (groen accent #86efac) en **Zaak** (goud accent)
- **8 generieke prompts:**
  - Keuken: "Meelijst volgende catering" (beef), "Wat kan ik prepen voor vriezer?" (snowflake), "Voorwerk deze week" (clipboard-list), "Wat is bijna op of THT?" (thermometer)
  - Zaak: "Hoe staat mijn marge?" (percent), "Wat moet ik vandaag bestellen?" (shopping-cart), "Welke facturen chasen?" (mail-warning), "Briefing voor morgen" (sparkles)
- **4 event-aware prompts** (alleen als heroEvent bestaat):
  - Briefing voor {naam}
  - Meelijst voor {naam}
  - Prep-planning {naam}
  - Herinner/bevestig klant {naam}
- Click → `setAiPrompt(qp)` → opent AIPromptDrawer (lazy-load)

**6. BusinessCharts** (3 grafieken, lazy-load)
- Alleen zichtbaar als `events.length > 0` (niet voor fresh tenants)

  **Grafiek 1 — Omzet-mix (donut)**
  - `computeRevenueMix(events)` → 4 categorieën: catering (oranje), verhuur (blauw), verkoop (paars), overig (grijs)
  - Alleen huidige-maand afgerond (`date ≤ today`)
  - Totaal getoond in donut-midden

  **Grafiek 2 — Maand-omzet trend (staaf)**
  - `compute6MonthRevenue(events)` → 6 maanden historisch
  - Delta WoW: `(cur - prev) / prev × 100`
  - Label: "OMZET TREND · AFGELOPEN 6 MAANDEN"

  **Grafiek 3 — Leverancier-spend (horizontale bars)**
  - `computeSupplierSpend(bonnen, leveranciers, top5)` → top 5 op bonnen-totaal
  - Link: "Bekijk pricelist-analyse" → `/price-intelligence`

**7. KPIStrip (6 KPI's)**
- Alleen zichtbaar als `!isFreshTenant`
- Header: "CIJFERS · LAATSTE 7 DAGEN"
- Tones: ok (groen), warn (oranje), bad (rood), default (goud)
- Sparkline (7-dag trend) per KPI

| KPI ID | Label | Berekening | Tone | Trend-functie |
|---|---|---|---|---|
| `days-next` | Tot volgend event | `heroEvent?.daysAway` | default | `trendDaysToNext(events)` |
| `events-week` | Events deze week | `COUNT WHERE date ≤ today+7d` | default | `trendEventsPerDay()` |
| `revenue` | Omzet deze maand | `Σ (guests × ppp) WHERE date startswith yyyy-mm AND date ≤ today AND status ≠ cancelled` | ok | `trendMonthRevenue()` (cumulatief) |
| `pipeline` | Pipeline offertes | `Σ calcLineTotals(offerte.items).totaal` (open) | default | `trendPipelineEuro()` |
| `open-inv` | Open facturen | `Σ bedrag WHERE status ≠ betaald/geannuleerd` | warn als overdues > 0 | `trendOpenInvoices()` (cumulatief) |
| `margin` | Marge gemiddeld | `Avg(margePct over all offertes)` | ok ≥60%, warn 40-60%, bad <40% | `trendMargin()` |

**8. CompactDagbriefing + AttentionPanel** (2-kolom grid 1.5fr/1fr; mobiel 1 kolom)

  **Dagbriefing** (`computeCandidates(briefingInput)`):
  - 3-5 suggesties obv data ("Verlopen facturen", "Events zonder menukaart")
  - Personalisatie: "Hoi {firstName}!"

  **AttentionPanel — 8 signalen:**

  | ID | Conditie | Severity | Icon | CTA |
  |---|---|---|---|---|
  | `att-leads` | `leadsFollowUp.length > 0` | medium | clock | "Open pijplijn" → `/verkoop/leads` |
  | `att-stock` | `lowStockItems.length > 0` | high (>3) / medium | alert-triangle | "Open bestelling" → `/voorraad?filter=below_min` |
  | `att-overdue` | `verlopenFacturen.length > 0` | high | mail-warning | "Stuur herinnering" → `/facturen?overdue=1` |
  | `att-marge` | `lowMargeOffertes.length > 0` | medium | percent | "Open offerte" → `/offertes?filter=lowmargin` |
  | `att-sug` | `pendingSuggestions.length > 0` | low | thermometer | "Bekijk" → `/agenda?suggestions=1` |
  | `att-menukaart` | `upcomingZonderMenukaart.length > 0` | ≤7d=high / ≤21d=med / else=low | palette | "Kies template" → `/offertes/{id}/menukaart-editor` |
  | `att-no-offerte` | `upcomingZonderOfferte.length > 0` | idem | palette | "Maak offerte" → `/offertes?new=1` |
  | `att-marge-alert` | `margeAlerts.length > 0` | ≥10%=high / else=medium | percent | "Bekijk impact" → `/price-intelligence?filter=alerts` |

**9. QuickActions** (4-knop strip onderaan) + **BriefingTimeline** (Gantt-achtig, alleen `!isFreshTenant`, uit `computeTimelineItems()`).

### 5.2 Dynamische state

- `currentTime` — minuut bijgewerkt
- `wizardOpen` — Event-wizard modal toggle
- `selectedEvent` — EventDetailDrawer state
- `aiPrompt` — QuickPrompt → AIPromptDrawer
- `isFreshTenant` — `events.length === 0 && offertes.length === 0 && klanten.length === 0`

### 5.3 EventDetailDrawer (modal-spec)

- Fixed inset, z-1000, 100% rechts schuiven (spring-animatie, damping 30, Framer Motion `initial={{ x: '100%' }} → animate={{ x: 0 }}`)
- Content: event-naam in artisan-font, datum/gasten/status in 3×1 grid, verwachte omzet in goud-box (`guests × ppp`), 2 knoppen ("Open event" brand, "Naar agenda" ghost)

### 5.4 Code-split lazy-loads (dynamic + ssr:false)

- EventWizard
- OnboardingChecklist
- PersonaQuiz
- BusinessCharts
- AIPromptDrawer

Impact: initial JS-bundle kleiner, interactieve content pas geladen na nodig.

### 5.5 `/onboarding` — 5-staps flow

**Stap 1 — Bedrijf (±10min):** naam, KvK, BTW, adres, **business_type radio (4 keuzes):**
- Foodtruck / mobiel (festivals, markten, evenementen)
- Bedrijfsevents (personeelsfeesten, lunches, borrels)
- Bruiloften & feesten (particulier met persoonlijke touch)
- Mix van alles
→ POST `/organizations` UPDATE

**Stap 2 — Data (±5min):** demo OF blank keuze → POST `/api/onboarding/seed-demo`

**Stap 3 — Offerte (±15min):** link naar wizard (`/offertes?wizard=true&seedEvent=demo`) → log `first_quote_draft` event

**Stap 4 — Tour (±5min):** module-overzicht (5 items) → log `module_tour_completed`

**Stap 5 — Integraties (±10min):** card-interface (Moneybird, Mollie, Google Calendar, Resend) → `onboarding_completed=true`

**Demo-data seed (`/api/onboarding/seed-demo`):**
- Max duration 30s, runtime nodejs
- **Idempotent** — check `events.length > 0 || klanten.length > 0` → return `{ status: 'already_seeded' }`
- **Data ingeladen:**
  - 10 klanten (NL-namen, e-mail, telefoon, adres)
  - 15 gerechten (BBQ: pulled pork, brisket, wings, vegan burger, sides)
  - 20 inventory-items (vlees, sauzen, groenten, disposables)
  - 5 leveranciers (Sligro, Slagerij Brink, Versmarkt, BBQ-Holland, Disposables NL)
  - 8 events (4 komende, 4 historisch)
  - 3 facturen (mix betaald/open)
  - 4 gangs

**Belangrijk:** seed is **generic** (geen Hop & Bites-variant ingebakken — bewuste design-keuze voor andere tenants).

**Activation-events gelogd** (`activation_events`-tabel, migratie `011`):
- `company_profile_saved` (stap 1)
- `demo_data_loaded` / `demo_data_skipped` (stap 2)
- `first_quote_draft` (stap 3)
- `module_tour_completed` (stap 4)
- `onboarding_completed` (stap 5)
- Trigger `set_activation_event_org_user()` auto-vult `organization_id` + `user_id` via `auth.uid()`

### 5.6 `/welkom` — publieke marketing-landingspagina

NIET onboarding-variant. Memory: `/welkom` is public marketing.

**Layout:**
- Header: Flame logo + "BBQ ARCHITECT"
- Hero: h1 "De catering-ondernemer uit de administratie bevrijden"
- 3-pilaren: AI offerte-wizard / HACCP / Food-cost-as-strategy
- Flow-showcase: 4-stap (lead → offerte → signature → betaling)
- AI-cost explainer: "Geen per-gebruik" met tier-caps (Starter 50/mnd, Pro 500/mnd, Enterprise 2000/mnd)
- Social proof: Berkhout-quote (Hop & Bites founder)
- CTA: "Plan een demo" (mailto), "Bekijk prijzen" (→ `/pricing`)

### 5.7 `/login`, `/signup`, `/auth/callback`, `/invite`

**`/login`:** email + password (minHeight 44px), `supabase.auth.signInWithPassword()`, error "Onjuiste email of wachtwoord", redirect via query-param (default `/`). **Dev quick-login** alleen als `NODE_ENV === 'development'` + beide `.env.local` vars gezet.

**`/signup`:** tabs "Start direct" (SignupForm) vs "Plan een demo" (mailto). Post-signup → `/onboarding`.

**`/invite`:** query-param `?token=...`. Lookup via `POST /api/invite/lookup` (rate-limit + constant-time response anti-timing-attack). Status: loading → ready / accepted / expired / error.
- Ingelogde user: `POST /api/org/accept-invite` → `/`
- Niet ingelogd: → `/signup?invite={token}`

### 5.8 Cron-jobs relevant voor Vandaag

**`/api/cron/marge-alerts-scan`** — 4×/dag (6h interval)
- Auth: `CRON_SECRET` header
- Scans inventory met `last_price_eur IS NOT NULL`
- Calls `scanMargeAlerts(orgId)` per org
- Writes naar `marge_alerts` (zie sectie 9.11)
- Output: `{ results: [{ orgId, inventory_items_checked, alerts_created, alerts_updated }] }`

### 5.9 State-machine + multi-tenant

**State:**
- Loading: skeleton-tegels, geen flash-of-empty
- Empty (fresh tenant): grote "Eerste event toevoegen" CTA in plaats van lege KPI's
- Loaded: zoals beschreven
- Error: fallback naar plain links naar hubs

**Multi-tenant:** alle KPI's en queries filteren op `organization_id` via RLS. Geen cross-tenant data zichtbaar.

### 5.10 Bekende gaps in Vandaag-hub

- **AI-acties** (`create_klant`, `draft_email`) pas toegevoegd op 2026-06-01; bestaande Vandaag-widgets verwijzen er nog niet altijd naar
- **Hero-event-kaart** toont niet welke crew-leden vandaag opdaagden (check-in-flow niet bedraad met events)
- **`crew-conflicten`-KPI in oudere docs** — feitelijke berekening zit in `detectAllConflicts()` (zie sectie 6.1)
- **`vrije weekends in 8 weken`** — niet op deze pagina maar in agenda-header (sectie 6.1)
- **QuickActions exacte knoppen** — file niet gelezen; vermoedelijk 4 vaste acties (event/offerte/inkoop/crew)
- **AIPromptDrawer streaming model** — `/api/chat` mode='general' (Sonnet 4.6 default per memo; Haiku fallback bij banale Q&A)
- **EventAllergy/DbEventAllergy** — gebruikt voor heroCompletion-check maar allergieën-input zit in Event-hub, niet hier
- **DEMO_SEED variatie** — geen tenant-specifieke variant (Hop & Bites had eigen verhaal kunnen krijgen)

## 6. Hub Plannen (`/agenda` + `/events`)

Plannen is de hub voor tijd. Het bevat de agenda (kalender), de events-lijst en de complete event-runtime (hub, service, plattegrond, field, logistiek, reflectie). Twee modi: planning-mode (desktop, vooruitkijken) en runtime-mode (tablet, live op locatie).

**Persona-fit:** Pro-tier-cateraar voor planning, Lars voor uitvoering op event-dag. Frequentie: dagelijks tijdens hoog-seizoen.

### 6.1 `/agenda` — de kalender (3 lagen + conflict-detectie)

**Layout-secties:**

1. **Hero + KPI-header** — gradient-kaart met live-badge, "AI Insights"-knop, 5 KPI-tiles. KPI's exact:
   - Komende 30d events: `COUNT(events WHERE date BETWEEN today AND today+30d AND status='confirmed')`
   - Omzet pipeline: `SUM(guests × ppp WHERE date BETWEEN today AND today+30d)`
   - Prep-taken (`COUNT(prep_tasks WHERE done=false AND event_id IN <komende>)`)
   - Vrije weekends in 8 weken (`COUNT(distinct weekends NOT IN <event dates>)`)
   - Conflicten (live via `detectAllConflicts()`)

2. **Month Navigation Bar** — Vorige/Volgende maand, "Vandaag"-pill, View-toggle (Maand/Week/Lijst), Filter-popover, "+ Afspraak"-knop.

3. **Mijn agenda's Legend** — 3 systeem-agenda's:
   - **Events** (#FFBF00 oranje) — uit `events`-tabel
   - **Prep deadlines** (#C4A35A warm goud) — uit `prep_tasks`-tabel
   - **Persoonlijk** (#888 grijs) — uit `agenda_personal` (migratie `029_agenda_personal.sql`, user_id-scoped)
   - Plus custom user-agendas; toggle per agenda, count per type. Filters persistent via `useAgendaFilter`-hook (localStorage).

4. **Calendar Grid (Maandweergave)** — 7×6 dayCell-raster, BRAND-highlight voor vandaag, weekend-achtergrond, max 3 events per dag, "+ meer"-indicator bij overflow.

5. **Upcoming Events List** — gegroepeerd in Vandaag / Morgen / Deze week / Volgende week / Later. Per rij: status-dot, dag-nummer, titel, klant, gasten, locatie-chip, omzet rechts.

6. **Event Detail Drawer** — drawer rechts (580px desktop) of bottom-sheet mobiel (90dvh). Bevat klant/gasten/locatie/omzet/pakket, conflict-waarschuwing, gerelateerde links (prep-counter, event-hub, voorraad).

**Modals (code-split, ssr:false):**
- **PersonalEventModal** — quick-add eigen afspraak: titel, tijd-range, kleur, notities; popeout-animatie
- **FilterPopover** — toggle agenda's zichtbaarheid + live status-count per type
- **AgendaCategoryModal** — CRUD eigen agendas

**Conflict-detectie:** `detectAllConflicts()` controleert smoker-capacity, team-overlap, locatie-availability, timing-overlap op dezelfde locatie. Output: `event.conflict = { note, severity }`. Visueel: rode rand + banner "X conflicten — bekijk".

**Keyboard-shortcuts:** `+e` (nieuw event), `⌘K` (Vraag-Rook), `t` (vandaag), `←` `→` (weken).

**Status-machines:**
- Event: `pending → option → confirmed → completed`
- Prep-task: `planned → queued → in_progress → done` (+ `skipped` / `blocked`)

**Multi-tenant:** alle tabellen org_id-gefilterd via RLS; persoonlijke items extra user_id-scoped.

### 6.2 `/events` — events-lijst (EventsListV2)

Live sinds 2026-06-01. Tabelview met inline-edit, status-visueel, bulk-acties.

**Kolommen:** event-naam (hyperlink naar hub), datum, gasten, status-badge + kleur, prep-progress-% bar, offerte-status, factuur-status, actie-knoppen.

**Filters:** status (pending/option/confirmed/completed), datum-range, event-type, klant-autocomplete.

**Knoppen:** "Nieuw event" → defaults (`name='Nieuw event'`, `date=vandaag`, `guests=50`, `ppp=45`, `status='pending'`) → direct naar `/events/[id]/hub`.

**State-machine:** Empty / Loading (TanStack Table skeleton) / Loaded / Error (retry).

### 6.3 `/events/[id]/hub` — event-canvas (BEO-equivalent, Nederlands)

De hoofdpagina per event. Server-component met 14+ parallel-prefetches.

**Header-nav:**
- Terug-link, EventTabs (Hub/Service/Field/Logistiek/Reflectie/HACCP/Klantgesprek)
- **MenukaartMissingNotice** — banner als offerte geen `menukaart_template_id` heeft

**Hero-sectie:**
- Links: event-naam, status-pill, gasten-count, datum, locatie, type
- Rechts: countdown-ring (SVG, gradient, dagen-teller)
- Stats-grid: Gasten, Omzet (`guests × ppp`), Marge (% bar), Prep-ready (% bar), Saldo

**Documents-kaart:**
- Primaire: Offerte (bekijk/PDF/bewerk), Menukaart (preview/PDF/print × aantal-gasten)
- Secundaire: Factuur, Prep-lijst, Laadlijst, HACCP-pakket — allemaal download-buttons

**Workflow-stappen (5 visuele dots):**
1. Offerte (uit `offerte.status`)
2. Acceptatie (`isConfirmed && factuur`)
3. Voorbereiding (`prep%`)
4. Event-dag (`service_logs` aanwezig)
5. Afronding (`factuur.paid && event_reflecties`)

Elke stap groen/brand/muted obv state. Cascade via `getTemplate(id)` → `resolveCascade()` → `flatten()` voor live menukaart-preview.

**Knoppen & acties:**
- "Markeer bevestigd" → status='confirmed' (vereist offerte 'geaccepteerd' eerst)
- "Start Service (KDS)" → fullscreen service-modus, confirm-dialog
- "In agenda" → `/agenda`
- "Ask Pitmaster" → AI-chat openen
- "Rit toevoegen" → `/administratie/rittenregistratie/nieuw?event=[id]`
- "Contact klant" → `mailto:`
- Toggle prep-task: optimistic update → `status='done'`

**Inline-edit-secties:** `EventEditor`, `CoursesEditor`, `AllergiesEditor` — direct editen zonder modal.

**Modal:** **MenukaartCanvas** (full-screen editor via `setShowCanvas`) — menu + menukaart-styling samen.

**Geprefetcht uit DB:** `events` (name, date, guests, ppp, status, location, client_naam, client_email, offerte_id, menu[], team[], draaiboek[], type), `offertes` (nummer, status, items[], menukaart_template_id, menukaart_overrides), `prep_tasks`, `facturen`, `gerechten`, `klanten`, `haccp_records`, `event_reflecties`, `service_logs`, `inkooplijsten`, `gangen`.

### 6.4 `/events/[id]/service` — runtime KDS (Kitchen Display System)

De pagina die op tablet of telefoon op de event-dag wordt gebruikt. Sidebar collapsed automatisch (>44px touch-targets overal).

**Layout — Gang-flow Kanban:**
- 3 status-kolommen per gang: **Prep** (geel) → **Ready** (groen) → **Served** (grijs)
- 4e kolom **Recalled** (rood) als chef terugroept
- Per gang horizontale rij; gangen verticaal gestapeld

**Hoofdcomponenten:**
- **Mise-bar** — `(dishes status='ready' || 'served') / total-dishes huidige gang`; kleur: rood <30%, oranje 30-70%, groen >70%
- **Allergen-banner** — fixed bovenaan, EU-14 lijst per gang met merged allergens uit dishes; kleur-ring per allergen; klik → allergie-override-dialog per tafel
- **Timer-widget** — countdown naar volgende gang (kleur: groen → oranje → rood)
- **Chef-Coach Rook Maart** — floating knop rechtsonder (Sparkles icon); zie sectie 12 voor Haiku 4.5 streaming-detail

**DB — `service_state`-tabel (1 rij per actief event):**
- `event_id` (PK), `started_at`, `ended_at`, `current_course_idx`, `table_overrides JSONB` (per tafel allergie-aanpassing + notes), `rook_alert JSONB`, `updated_at`

**Per gang (`courses`-tabel):**
- `id`, `event_id`, `gang_slug`, `status` (queued/active/ready/served/recalled), `position`
- Junction `dishes_per_course` voor dishes per course

**Append-only `service_logs`:**
- `offerte_id`, `course_id`, `action` (mark_ready/mark_served/recall), `at_time`, `by_user_id`

**Per-dish acties:**
- Radio-button of drag-drop tussen kolommen → toggle `dish.status`, append `service_audit_logs`
- Allergie-override per tafel
- Quality-flag (🔥 excellent, ⭐ good, 💭 needs-work)
- Recall-knop
- Extend-warning bij te lang in 'ready'

**Realtime:** Supabase realtime subscription op `service_state` + `service_logs` → live-sync tussen kook-tablet, expeditie-tablet en pitmaster-telefoon.

**Migratie:** `012_kds_service_state.sql` (heet historisch `kds_service_state`, in code nu `service_state`).

### 6.5 `/events/[id]/service/plattegrond` — Konva-floor-plan met AI-suggest

Volledig Konva-stage met drawing canvas (100% viewport).

**Shape-types:**
- `rect` — lange tafels, buffet, tent-wand, danger-zone
- `circle` — ronde tafels, smoker, grill, bar
- `image` — background-foto, custom icons
- `polygon` — service-zones
- `text` — labels

**Knoppen:**
- **Tafel-add** — round/long-table, drag-to-place
- **Zone-aanmaken** — polygon, assign personeel via dropdown
- **Foto-upload** — file-picker → upload naar storage bucket `floor-plans/[org_id]/[event_id]/[filename]`
- **AI-suggest-seating** — POST `/api/floor-plan/ai-suggest` → Claude **Haiku 4.5** → shapes-array → "Accept" of "Discard"
- **Guest-PIN-add** — dialog (full-name, allergens EU-14 select, severity, color, notes) → create `floor_plan_guest`
- **Save Canvas** — POST `/api/floor-plan/save-canvas` → update `canvas_json`, bump `canvas_version`
- **Lock/Unlock** — toggle `is_locked`, prevent edits

**Modals:** AI-suggest-seating modal, Guest-PIN modal, Zone-assign modal.

**AI-suggest detail:**
- **Model:** `claude-haiku-4-5-20251001`
- **Endpoint:** `POST /api/floor-plan/ai-suggest`
- **Input:** `{ eventId?, headcount, eventType?, venueNote?, canvasWidth?, canvasHeight? }`
- **System prompt:** "Event-floor-plan-designer, werk in 0-100% coördinaten, plaats tafels niet overlappend (min 8% gap), smoker altijd buiten, bar bij ingang, buffet centraal of langs wand"
- **Output:** `{ shapes[], reasoning }`
- **Cost:** ~€0,008 per request (Haiku + prompt-caching)
- **Logging:** `logAiUsageServer` → `ai_usage` met `action_type='other'`, `feature='floor_plan_ai_suggest'`, metadata `{ event_id, headcount, shape_count }`

**Tabellen:**
- **`floor_plans`:** `id`, `event_id`, `name`, `background_image_path`, `canvas_version`, `canvas_json`, `is_locked`, `last_edited_by_user_id`
- **`floor_plan_guests`:** `id`, `floor_plan_id`, `x_pct`, `y_pct`, `label`, `full_name` (PII, 30-dag retention!), `allergens[]` (EU-14), `dietary_restriction`, `severity`, `color`, `note` (PII), `pii_anonymized_at`
- **`service_zones`:** `id`, `floor_plan_id`, `name`, `geometry` (polygon JSONB), `assigned_personeel_id`, `color`

**Cron-job AVG-retention:** `/api/cron/anonymize-floor-plan-guests` — dagelijks 03:00 UTC (vercel.json).
- Auth: `CRON_SECRET` in Authorization header
- Logica: `UPDATE floor_plan_guests SET full_name=NULL, note=NULL, pii_anonymized_at=now() WHERE pii_anonymized_at IS NULL AND event_id IN (SELECT id FROM events WHERE date::date + 30 days < now()::date)`
- Idempotent (`WHERE pii_anonymized_at IS NULL`)
- Output: `{ ok: true, anonymized: INT }`

**Storage-bucket `floor-plans`:** PRIVATE, max 5MB, image/png|jpeg|webp only. RLS per org-member (read/write/delete restricted by folder-path). Background-foto's permanent, guest-data 30 dagen.

**Migratie:** `20260511150000_floor_plan_mapping.sql`.

### 6.6 `/events/[id]/field` — mobile-first field-ops

Mobile-first met 56px+ tap-targets en sticky header.

**Layout:**
- Sticky header: event-naam, datum, offline-toggle
- Info-kaart: gasten, status, locatie (Google Maps link via `href`), bel-klant-link (`tel:`)
- Timer: START / STOP buttons (5 min staat-opslag in `time_logs`-tabel)
- Materieel-checklist: pack-list per item, toggle status klaar/open
- Quick-links: HACCP-veldmodus, volledige hub-link

**Knoppen:**
- **Start Timer** → POST `/api/time-logs` INSERT → status='actief', live duration
- **Stop Timer** → PATCH → `end_time=now()`, status='afgerond'
- **Toggle pack-item** → PATCH `/api/pack-lists` → klaar/open, optimistic update

**State-machines:**
- `time_log`: `actief → afgerond`
- `pack_item`: `open → klaar`

**Tabellen:**
- `time_logs`: `id`, `start_time`, `end_time`, `status`, `user_id`, `organization_id`, `notitie`
- `pack_lists`: `id`, `naam`, `aantal`, `status`, `event_id`, `organization_id`

### 6.7 `/events/[id]/logistiek` — routes + AI-voorstel

Server-component met 6 collapsible accordions in `LogistiekPanel`:

1. Routekaart (MapLibre)
2. Inkooplijst
3. Voertuigzoeking
4. Inlading-checks
5. Montage-schema
6. Check-in-log

**Banner:** "AI-voorstel ready" badge wanneer `event_checklist_items.ai_pending=true`.

**Knoppen:**
- **AI-voorstel** → link naar `/logistiek?proposal=[event_id]` (opent modal)
- **Veldmodus** → `/logistiek/field`

**Modal:** **AiProposalModalAutoOpen** — auto-opent via `?proposal=[eventId]` query-param.

**Migratie:** `20260527010000_event_checklist_items.sql` of vergelijkbaar voor checklist-state.

### 6.8 `/events/[id]/reflectie` — post-event debrief

Vijf textarea-velden + score-slider.

**Velden:**
- Score (0-10, grote getal + slider + label "Slecht/Goed/Uitstekend")
- Overschot (wat was over?)
- Tekort (wat was te weinig?)
- Kwaliteit (wat was niet goed genoeg?)
- Verbeterpunten (lessons learned)
- Vrije notities

**Tabel `event_reflecties`:** `id`, `event_id`, `score`, `overschot`, `tekort`, `kwaliteit`, `verbeterpunten`, `notities`, `fotos[]`.

**Knoppen:**
- **Opslaan / Bijwerken** → INSERT of UPDATE + UPDATE `events.status='completed'`
- **Annuleer** → back

AI-aggregeert reflecties per kwartaal in recap-cards (Sonnet 4.6, zie sectie 12).

### 6.9 Samenvattings-tabel Plannen-hub

| Pagina | Hoofd-tabel(en) | AI-model | Cron | Status-machine |
|---|---|---|---|---|
| /agenda | events, prep_tasks, agenda_personal | — | google-calendar-sync (6u) | event: pending→option→confirmed→completed; prep: planned→done |
| /events | events, offertes, prep_tasks | — | — | event-status |
| /events/[id]/hub | 11+ tabellen | — (Ask-Pitmaster apart) | — | workflow 5-stappen |
| /events/[id]/service | service_state, courses, service_logs, service_audit_logs | Haiku 4.5 (Chef-coach, sectie 12) | — | dish: queued→ready→served; course: queued→active→ready→served |
| /service/plattegrond | floor_plans, floor_plan_guests, service_zones | **Haiku 4.5** (AI-suggest ~€0,008/call) | anonymize-floor-plan-guests (daily 03:00 UTC, AVG art.5(1)(e)) | guest: identified → anonymized |
| /events/[id]/field | events, time_logs, pack_lists | — | — | time_log: actief→afgerond; pack: open→klaar |
| /events/[id]/logistiek | event_checklist_items | Sonnet 4.6 (proposal-modal) | — | checklist-items |
| /events/[id]/reflectie | event_reflecties | Sonnet 4.6 (kwartaal-recap) | — | event→completed |

### 6.10 Bekende gaps in Plannen-hub

- **Geen Resource Timeline-view** — FullCalendar Premium niet ingezet; crew-planning gebeurt in event-detail-drawer, niet visueel op tijdlijn met crew als resources
- **Geen native iCal-export voor klanten** — alleen Google Calendar sync via `/api/cron/google-calendar-sync` (6u-cadence dus max 6u vertraging)
- **Geen drag-and-drop crew tussen events op kalender** — wel binnen event-drawer
- **HQ-fallback Borger hardcoded** ook in plattegrond/logistiek-kaarten — moet per tenant configureerbaar
- **Floor-plan geen real-time collaboration** — Konva-state is lokaal, save is manueel; meerdere editors veroorzaken conflict
- **Background-foto's geen auto-blur** — PRIVATE bucket vereist maar geen automatische gezichts-anonimisering
- **Logistiek heeft geen TSP/VRP-route-optimisatie** — alleen visueel plotten

## 7. Hub Verkoop (`/offertes` + `/klanten` + `/verkoop/*`)

Verkoop is de hub voor geld dat binnenkomt. De sidebar-volgorde van sub-tabs volgt de Golden Flow:

1. **Aanvragen** (`/verkoop/leads`) — wat binnenkomt
2. **Arrangementen** (`/verkoop/arrangementen`) — wat klanten zelf samenstellen
3. **Offertes** (`/offertes`) — wat de cateraar verstuurt
4. **Klanten** (`/klanten`) — wie er koopt

### 7.1 `/verkoop/leads` — pijplijn (dual-mode: Kanban + Lijst)

@dnd-kit Kanban met optimistic drag-to-status. Plus alternatieve lijst-modus voor data-werk.

**Status-enum (`leads.status`):**
```
nieuw (amber, inbox-icon) →
in_gesprek (blauw, message-circle) →
offerte (goud, file-text) →
gewonnen (groen, ✓) | verloren (rood, X)
```

**Source-enum (`leads.source`):**
- `public_form` — uit `/aanvraag/[slug]`
- `manual` — operator handmatig
- `klantgesprek` — uit AI-extractie WhatsApp/e-mail
- `arrangement` — uit `/arrangement/[slug]`

**Kaart per lead:**
- Naam, e-mail, telefoon
- event_datum, gasten, locatie, event_type, budget_indicatie
- Source-badge met icon
- Inactiviteit-badge (dagen sinds laatste status-update)

**Drawer (lead-detail, 4 tabs):**
1. **Contact** — naam, email, telefoon, event_datum, gasten, locatie, event_type, budget_indicatie, bericht
2. **Relatie-pills (ecosysteem)** — links naar offerte (offerte_id) en klant (client_naam)
3. **AI Concept** — `ai_concept` JSONB render: `menu_naam`, `thema`, `gerechten[]` (naam + gang), `adviesprijs_pp`, `totale_kostprijs_pp`. **Geen BTW of totalen** (hard rule: downstream server-side)
4. **Acties** — "Maak offerte" (opent wizard met prefill), "Maak klant", "Win/Verlies", mail

**Filter & sort:** source, event-type, datum-range, geschatte omzet (laag/midden/hoog), search (naam/email/locatie/event_type/client_naam).

**Schema (`20260601130000_leads.sql`):**
```sql
leads (
  id BIGSERIAL PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id),
  naam TEXT NOT NULL,
  email, telefoon, event_datum DATE, gasten INT, locatie, event_type, budget_indicatie, bericht,
  status TEXT CHECK (status IN ('nieuw','in_gesprek','offerte','gewonnen','verloren')) DEFAULT 'nieuw',
  source TEXT CHECK (source IN ('public_form','manual','klantgesprek','arrangement')) DEFAULT 'public_form',
  offerte_id INT REFERENCES offertes(id) ON DELETE SET NULL,
  client_naam TEXT,
  ai_concept JSONB,
  menu_selectie JSONB,
  menu_prijs_indicatie NUMERIC,
  follow_up_at TIMESTAMPTZ,
  created_at, updated_at
)
```

RLS: `organization_id IN (SELECT private.user_org_ids())`. Indices: org_id, org+status, offerte_id, org+follow_up_at.

**Funnel-events tracking:** beacon naar `POST /api/public-lead-form/[slug]/track` met session_id + event ('view'/'start'/'submit') voor anonieme trechter-analyse (`funnel_events`-tabel, service-role insert).

### 7.2 `/verkoop/arrangementen` — template-builder voor self-serve

Cateraar bouwt arrangement-templates voor publieke configurator op `/arrangement/[slug]`.

**Hiërarchie (3 niveaus):**

**`arrangementen` (per org, meerdere mogelijk):**
- `id` (UUID), `naam`, `gasten_default` (default 50), `min_gasten` (default 1), `actief`, `publiek`, `volgorde`

**`arrangement_categorieen` (slots, drag-to-reorder):**
- `id`, `arrangement_id` FK, `naam`, `icon` (choice uit `CONFIG_ICON_CHOICES`), `hint`, `volgorde`

**`categorie_niveaus` (Simpel/Medium/Best-of, max 3 per cat):**
- `id`, `categorie_id` FK, `naam`, `indicatie_prijs_pp NUMERIC(10,2)`, `items TEXT[]` (newline-delimited "Pulled pork", "Coleslaw", ...), `populair BOOLEAN`, `volgorde`

**Editor-features:**
- Drawer voor categorie-add/edit (naam, icon-picker, 3-niveau-slots)
- Per niveau: naam, prijs-pp, items-textarea, populair-toggle
- Reorder categorie (drag-to-move)
- Delete categorie
- Public URL kopiëren (`/arrangement/[slug]` uit organization.slug)
- Trechter-tellingen per arrangement (view/start/submit aggregaat uit `funnel_events`)

**Migratie:** `20260603120000_arrangementen.sql`.

### 7.3 `/offertes` — offertes-lijst + edit-drawer (Wie/Wat/Hoeveel/Eenmalig/Marge)

Lijst-view met inline-edit en filters. Drawer per offerte heeft 5 secties, GEEN tabs (anders dan ik eerder beschreef): één lange formulier-flow per stap.

**Lijst-kolommen:** Nummer (OFF-2026-xxx), Klant, Datum, Geldig tot, Status-badge, Omzet, Marge-%, Acties.

**Filters:** status (concept/verzonden/geaccepteerd/afgewezen/verlopen/geannuleerd), search (nummer/klant/adres), sort (datum/status/marge/omzet).

**Status-flow:**
```
concept → [mail] → verzonden → [klant accepteert] → geaccepteerd
  ↓ (reject)              ↓ (timeout)         ↓ (factuur)
  afgewezen          verlopen         (event status synced)

(operator cancel) → geannuleerd
```

**Edit-drawer — 5 secties (één form, geen tabs):**

1. **Wie (klant)** — `client_naam` (autocomplete uit klanten), `client_adres`, `client_email`, `datum`, `geldig_tot` (default 30 dagen via settings.offerte_geldig), `notitie` (interne/klant-facing)

2. **Wat (menu)** — `menu_selectie JSONB` (`{ gang_slug: [gerechtnamen] }`), `menukaart_template_id` (referentie naar layout-preset), `menukaart_overrides JSONB`. CTA opent **MenuMenukaartCanvas** (WYSIWYG, zie 7.5)

3. **Hoeveel (regels)** — tabel met `desc` (omschrijving), `qty` (couverts), `prijs` (€/covert), `btw` (0/9/21% custom dropdown), inline totaal. Subtotaal excl, per BTW-tarief, Grand Total incl

4. **Eenmalig (vaste kosten)** — collapsible: `vaste_kosten` array van `{naam, bedrag}`. Inline edit + delete per rij

5. **Marge (read-only)** — Omzet (excl), Foodcost (uit gerechten-ingrediënten × hoeveelheid), Vaste kosten, Netto winst, Marge-% visual bar (groen >70%, amber 60-70%, rood <60%). Basis: `calcOfferteMarge()` uit `/lib/costCalculations`. Live re-compute via `useMemo(margeMap)` per offerte-ID

**Knoppen & acties:**
- `+ Nieuwe offerte` — opent template-picker (handmatig / wizard blank / uit bestaande template)
- `Opslaan` — set form naar DB, berekent marge, synct naar `events` (offerte_id)
- Dropdown "..." (mail, PDF, klant-link kopiëren, naar factuur converteren, dupliceren, delete)
- Status-dropdown (6 statussen met kleur-dots)
- `AI Offerte` (sparkles) — opent **AiOfferteWizard** (zie 7.6)

**Margin-drift-banner:** prominent bovenaan als marge <40% of δmarge-trend negatief.

**Speciale workflows:**

- **`runAcceptanceWorkflow()`** — trigger bij `status='geaccepteerd'` na save: cascade accept → event bijwerken → factuur aanmaken → prep-taken → inkooplijst → service-gangen. Deep-links naar factuur (`?focus=id`) en event (`/events/[id]/hub`). Email-bevestiging via `mailOfferte()` (Resend)

- **`syncQuoteToEvent()`** — one-way sync offerte → events op offerte_id. Kopieert: naam ('Offerte: ' + client_naam), datum, guests (uit items qty), ppp, locatie, status. Status-mapping via `mapOfferteToEventStatus()` (legacy 'akkoord'/'goedgekeurd' → 'geaccepteerd'). Delete event als offerte rejected/expired

- **Demo Seed** (`?wizard=true&seedEvent=demo`) — localStorage writes `DEMO_SEED_PREFILL` (voorbeeld bedrijf, 60 gasten, 3 gangen). Pilot onboarding Pillar #1: ≤10 min naar eerste offerte

**Schema (`offertes`):**
```sql
offertes (
  id INTEGER PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id),
  nummer TEXT UNIQUE,
  status TEXT CHECK (...),
  client_naam, client_adres, client_email,
  datum DATE, geldig_tot DATE,
  items JSONB, -- array: {desc, qty, prijs, btw}
  menu_selectie JSONB, -- object: {gang_slug: [gerechtnamen]}
  menukaart_template_id TEXT,
  menukaart_overrides JSONB,
  vaste_kosten JSONB, -- array: {naam, bedrag}
  notitie TEXT,
  public_token UUID DEFAULT gen_random_uuid(),
  signed_at TIMESTAMPTZ,
  offerte_signed_pdf TEXT, -- base64 buffer (signed PDF)
  created_at, updated_at
)
```

Migratie `20260515120000_offerte_signed_pdf.sql` voegt `signed_at` + `offerte_signed_pdf` toe voor digitaal-ondertekende portal-flow.

### 7.4 `/offertes/[id]/view` — detail-view + InteractiveMarginDoctor

Read-only detail met interactieve margin-doctor (drag-able target-ring SVG) en scenario-simulator (twee sliders: prijs-uplift %, kosten-reductie %, live-update marge/delta).

**Cross-links via `RelatedEntityPills`** — klikbaar van offerte naar gerelateerde events, klant, facturen. Memory-pillar "ecosysteem-cohesie".

### 7.5 `/offertes/[id]/menukaart-editor` — Canva-style WYSIWYG

Editor voor visuele menukaart die met offerte meegestuurd wordt.

**Features:**
- Drag-drop van gerechten uit `menu_selectie`
- Font-presets (3): Klassiek serif, Modern sans, Hand-drawn
- Layout-presets: 1-column / 2-column / card-grid
- Theme-aware (gebruikt tenant `brand_theme` uit Systeem)
- **AI-suggest foto's** via `/api/menukaart/ai-photos` (LLM-prompt → image-API; placeholder)
- **PDF-gen** via `/api/menukaart/pdf` (server-side HTML → PDF)
- Visual-regression baselines (`pnpm test:visual`)

**DB:** `menu_templates` (`id, naam, beschrijving, menu_selectie, basis_prijs_pp, aantal_gasten, is_default`). `menukaart_template_id` + `menukaart_overrides` opgeslagen in offerte-row.

### 7.6 AI-offerte-wizard — chat-based offerte-creatie

Niet een aparte pagina maar een AI-flow via `/api/chat/route.ts` (zie sectie 12).

**Workflow:**
1. Operator klikt "AI Offerte" → drawer met chat-interface
2. Conversatie-turn 1: "Vertel me over je event"
3. AI vraagt geleide vragen (Sonnet 4.6 default)
4. Verzamelt: datum, gasten, event-type, allergenen, budget, voorkeur
5. AI genereert offerte-voorstel met menu-selectie (3-5 gerechten per gang), advies-prijs-pp, kostprijs-pp-schatting
6. Output via `respond_with_blocks` tool als `action_card` met confirm-button
7. Bij confirm: offerte ge-INSERT in `offertes`, BTW + marge server-side berekend, allergenen uit join-tabel

**Tools beschikbaar in wizard-context:** `search_gerechten` (query, gang_slug), `get_low_stock`, `get_event_margin` (event_id), `list_upcoming_events`.

**Prompt-caching:** statische gerechten-bibliotheek + system-prompt cached via `cache_control: ephemeral`. ~10% input-cost-reductie op vervolgvragen.

**Tier-cost-projection (Pro):** Sonnet 4.6 ~4000 input + 1500 output per wizard-call, met 90% cache hit op recipe-library → ~€0,04 per offerte. 20 offertes/maand = €0,80 (ruim binnen Pro soft-cap €15).

### 7.7 `/klanten` — klantenbestand (TanStack Table + Server Actions)

**Lijst-kolommen:** Naam, Bedrijf, Adres, Postcode, Plaats, Telefoon, E-mail, Type (Particulier/Zakelijk).

**Filters:** Type (alle/Particulier/Zakelijk), search (naam/adres/plaats/telefoon/email).

**Edit-drawer (4 tabs):**
1. **Contact** — naam, bedrijf, adres, postcode, plaats, telefoon, email, type
2. **Historie** — offertes-count + lijst, events-count + lijst, facturen-count + lijst (async `loadStats`)
3. **Notities** — interne opmerkingen
4. **Bijlagen** — placeholder UI

**Acties:**
- `+ Nieuwe klant` (auto-save naar localStorage `bbq_klanten_new_draft`)
- `Opslaan/Bijwerken` via `upsertKlant()` Server Action (Zod-validatie)
- `Samenvoegen` (design phase)
- `Anonymiseren` (AVG art. 17, design phase)
- `AVG-export per klant` (single-klant data-dump, ZIP)
- `Verwijderen` via `deleteKlant()` Server Action

**Schema (`klanten`):**
```sql
klanten (
  id INTEGER PRIMARY KEY,
  organization_id UUID NOT NULL,
  naam TEXT NOT NULL, bedrijf, adres, postcode, plaats, telefoon, email,
  type TEXT CHECK (type IN ('Particulier','Zakelijk')),
  notities TEXT, created_at, updated_at
)
```

**Cross-hub ecosysteem (soft-links via `client_naam`):** `offertes.client_naam`, `events.client_naam`, `facturen.client_naam`, `leads.client_naam`.

**Activation tracking:** `first_klant_created` (trackOnce) → `activation_events`.

### 7.8 `/klantgesprek` — 6-staps intake-wizard

ACTIEVE feature (in weekly use). Gestructureerde intake-wizard die in één flow een offerte + event + klant aanmaakt — met AI-extractie voor wie het hele gesprek in WhatsApp/email had en alleen wil plakken.

**Progress-bar:** 6 stappen, terug-klikbaar.

**Stap 0 — Klantgegevens:** naam (autocomplete uit `klanten`), bedrijf, telefoon, email, adres, type (Particulier / Zakelijk / Festival).

**Stap 1 — Eventdetails:** naam, datum, locatie, gasten, vega-gasten (auto-sync vooruit naar stap 2), binnen/buiten, starttijd/eindtijd.

**Stap 2 — Menu:** per-gang gerechtkiezer (dynamisch uit `gangen`-tabel) + allergie/dieet-tracking per gast (vega-toggle, 16× allergen-buttons).
- **"AI Menu-suggestie" knop** → `/api/recipe-generate` mode='menu', input = klanttype + gasten + binnen/buiten + budget
- Returns `{ data: { gerechten: [...] }, citations: [...] }`
- Smart matching van AI-namen tegen bestaande gerechten (geen duplicates)

**Stap 3 — Budget:** prijs-per-persoon (calculator), dranken-keuze (inclusief / eigen regeling / apart), serveerwijze (buffet / bediend / walking dinner / BBQ Live Cooking), extra benodigdheden (tafels / stoelen / materieel).

**Stap 4 — Notities:** vrijschrift opmerkingen, locatie-notities, concurrent-vragen ("zoeken ze nog elders?"), follow-up-datum.

**Stap 5 — Overzicht:** samenvattingskaarten per veld, split normale/vega-menu, dieet-breakdown.

**Sticky buttons onderaan:**
- **"Opslaan als Concept Offerte + Event"** → Supabase: INSERT klanten + offertes (status='concept') + events (status='pending') in één transactie
- **"Alleen Klant + Notitie"** → minimale opslag (lead binnen, nog geen offerte)

**LocalStorage auto-save** (debounced) ter voorkoming van dataverlies bij tab-close.

**AI-laag — twee modellen actief:**

1. **`POST /api/klantgesprek/extract`** — **Claude Haiku 4.5** (Pillar #6: snel + goedkoop)
   - Input: ruwe WhatsApp/email-tekst van het klantgesprek
   - Output: structured fields (datum, gasten, allergenen, budget, notities)
   - Tool-use: `extract_klantgesprek` (Anthropic tool-use format)
   - `cache_control: ephemeral` op system-prompt
   - Confidence-score per veld
   - Logged via `logAiUsageServer` met `action_type='klantgesprek_extract'`

2. **`/api/recipe-generate`** mode='menu' — **Sonnet 4.6** (default creative)
   - Voor de "Stel menu voor"-knop in stap 2
   - Output JSON-schema met Citations API

**Koppelingen:** `klanten` (insert/upsert), `offertes` (concept), `events` (schedule), `gerechten` (pool per gang), `gangen` (structuur).

**Gaps:**
- Geen validation dat klant.naam bestaat voordat stap 1→2
- Dieet-allergie-interface verbose (16× allergen-buttons → op mobiel crowded)
- Auto-sync vega-gasten stap 1→2 slim maar niet expliciet ge-UX'd (stappen-hint zou helpen)

### 7.9 `/q/[id]` — quote-portal (zie ook sectie 16)

Publieke offerte-portal. **Lookup via `offerte.public_token` (UUID), NOOIT `offerte.id`** (memory-pillar).

**States:** loading (skeleton) / 404 / expired (410, 48u-regel) / accepted / normal (interactief).

**Portal-features:** offerte-velden, bedrag-breakdown, **e-sign canvas** (handtekening-pad of akkoord-checkbox), **Mollie iDEAL 30% deposit**, **carbon-footprint badge** (ESG-trend 2026).

**API-routes (publiek):**
- `POST /api/public-offerte/[token]` — fetch (rate-limit 20 req/min per IP)
- `POST /api/accept-offerte` — confirm + signed_at
- `POST /api/payments/mollie` — create deposit-payment
- `POST /api/payments/mollie/webhook` — Mollie idempotent via UNIQUE `mollie_payment_id`

Zie sectie 14 voor Mollie webhook-detail en sectie 16 voor portal-states.

### 7.10 Bekende gaps in Verkoop-hub

- **Sales-pipeline-forecasting** (Tripleseat-stijl) bewust niet gebouwd — overkill voor 1-30 events/maand
- **Geen native lead-scoring** (waarschijnlijkheid van conversie) — ai_concept kan basis bieden maar geen scoring-model
- **E-sign is basis** (canvas of checkbox); geen DocuSign- of Signhost-integratie voor juridisch zwaardere offertes
- **Reminder-flows na verzending** zijn handmatig; AI-suggesties bestaan maar geen automatische cadens (cron-job ontbreekt)
- **PDF-download menukaart** — `/api/menukaart/pdf` endpoint expected maar implementatie WIP
- **AVG/Merge/Anonymize** in klanten — UI-design gestart, server actions niet geïmplementeerd
- **Email-tracking op `/q` portal** — status-history + open-tracking design phase
- **Menu-foto-suggest** in menukaart-editor — placeholder, niet actief
- **Conversion-attribution** lead→offerte→event — funnel_events logged maar geen lifetime-customer-value-rapport
- **Geen AI-action voor `create_offerte`** in registry — wizard werkt via conversatie-blocks, geen ingebouwde "1-klik offerte"-action

## 8. Hub Menu (`/gerechten` + `/keuken/kookbord`)

Menu is de hub voor wat de cateraar verkoopt: gerechten-bibliotheek, atomaire componenten, menukaart-templates, margin-dashboard, kookbord.

**Hub-titel "Menu" — bewust:** memory zegt dat Sam recepten en gerechten functioneel als hetzelfde ziet. Migraties `014_recepten_into_gerechten.sql`, `014b_recepten_data_migration.sql` en `015_drop_recepten_table.sql` hebben de oude `recepten`-tabel geconsolideerd in `gerechten`. De UI-term is "Gerechten" voor alles.

### 8.1 `/gerechten` — gerechten-bibliotheek

**Layout:**
- **Hero-sectie** — Eyebrow ("Inspiratie · Laag 1–3 · Bibliotheek") + titel + stat-pills (totaal count, gang-select, status-toggle)
- **KPI-tegels** — 4 live stats: totaal gerechten, in-wizard count, marge-coverage %, budget-impact
- **View-toggle** — Grid (default, cards) ↔ Tabel (naam/gang/marge/kostprijs/status/acties)
- **Filter-bar** — pill-buttons (All / Actief / Concept / Review-nodig / Inactief) + search-input + gang-filter
- **Card-grid** — responsief (1 mobiel, 2 tablet, 3+ desktop)

**Per kaart:** naam + gang-label, beschrijving (2-regel clamp), allergenen-badges (icons/letters G/L/N/V/E/S), kostprijs (cent-precision, mono font), marge-indicator (color-coded pill), context-menu (Bewerk/Verplaats/Verwijder).

**Knoppen & CTA's:**
- `+ Nieuw gerecht` — modal/drawer
- `AI Bedenker` — `/gerechten?modal=bedenker` (Studio met 3 modes)
- `Analyse` — `/gerechten/analyse`
- `Componenten` — `/gerechten/componenten`
- `Menukaarten` — `/gerechten/menukaarten`

**Modals:**
- **GerechtDetailDrawer** (5 tabs, zie 8.2)
- **BedenkerModal** — AI-genereer (3 modes × 3 flavours × 3 complexiteit-niveaus)
- **MenuCommandPalette** — ⌘K autocomplete (gerechten zoeken, direct-edit)
- **StatusTransitionConfirm** — Concept → Actief checklist (allergenen geverifieerd, kostprijs > 0, beschrijving ingevuld)

**Status-machine (`gerechten.status`):**
- `concept` — net aangemaakt (vooral AI), niet klant-klaar
- `review_nodig` — kostprijs/allergenen ontbreken; wizard verbergt
- `actief` — klaar voor offerte (default voor handmatige creaties)
- `inactief` — bewust uitgezet (blijft in bibliotheek zichtbaar, niet in wizard)

**Filters:** gang-pill (Voorgerecht/Hoofdgerecht/Bijgerecht/Dessert/Drank/Bites/Soep uit `gangen.slug`), status-pills (4 states), allergen-multiselect (G/L/N/V/VE/E/S/F/M), tag-search (gerechten.tags JSONB), marge-range slider, kostprijs-range.

**Triggers & computed fields:**
- `sync_gerechten_actief_with_status` — zet `actief = (status='actief')` voor backwards-compat
- RLS-policy: alleen org-leden zien eigen gerechten
- Cost-rollup via `recipe_costs.ts` (materialen × recipe_components × yield-ratio)

**Schema (`gerechten`):**
```sql
gerechten (
  id UUID PRIMARY KEY,
  organization_id UUID NOT NULL,
  naam TEXT, beschrijving, gang_slug TEXT FK,
  foto_url TEXT,
  kostprijs_pp NUMERIC(10,2), -- legacy
  total_cost_cents INT, -- preferred
  verkoopprijs NUMERIC(10,2),
  marge_pct INT,
  porties INT DEFAULT 10,
  allergenen TEXT[], tags JSONB,
  status ENUM ('concept','review_nodig','actief','inactief') DEFAULT 'actief',
  bron ENUM ('manual','ai') DEFAULT 'manual',
  wijn_suggestie, service_tip,
  is_in_wizard BOOLEAN DEFAULT false, -- curator flag
  created_at, updated_at
)
```

Indices: `(organization_id, status)`, `(gang_slug)`.

### 8.2 `/gerechten/[id]` — gerecht detail-drawer (5 tabs)

**Tab 1 — Wat:** naam, gang (dropdown), beschrijving (textarea), foto (upload → cloudinary), tags (multiselect: BBQ/vega/vegan/glutenvrij/signature/zomer/winter/comfort/rook), status-dropdown.

**Tab 2 — Bouw:** ingrediënten/componenten-tabel.
- Kolommen: Component (dropdown → /componenten), Hoeveelheid, Eenheid (g/kg/ml/l/stuk), Yield-ratio (%, default 100), Kostprijs/eenheid (readonly, uit `components.base_cost_cents`)
- Knoppen: + Rij, Verwijder per rij, AI-suggestie
- Totaal kostprijs-per-portie (auto)
- Porties-referentie (default 10), Preptime (minuten)
- Instructies-stappen (textarea-array, 6-12 stappen, chef-taal)
- **Battle-plan** (offset timeline: T-24h, T-4h, etc.) voor smoker/prep
- **AI Fine-tune knop** — `RecipeFineTuneButton` (Haiku: "maak smaken intenser" / "voeg smaak toe" / "maak vochtiger")

**Tab 3 — Compliance:** allergenen-grid (checkboxes G/L/N/V/VE/E/S/F/M).
- **AI-detectie via `/api/detect-allergens`** (Haiku 4.5 + cache_control ephemeral, ~€0,01/call)
- Source-labels: "AI-detected" / "Confirmed" / "Manual"
- Cascade: component-allergen wijziging → refresh grid
- **HACCP-punten tabel**: type (kerntemp/koeltemp/tijd-uit-koeling/handhygiene/kruisbesmetting/oppervlakte-reiniging/overig), threshold-value, threshold-unit (celsius/minutes), note
- Voedingsinformatie (JSONB: kcal, protein_g, fat_g, carbs_g, fiber_g per portie)
- Dieet-claims (vegetarisch/vegan/glutenvrij/lactosevrij)

**Tab 4 — Service:** wijn-suggestie, service-tip (plating/temperatuur/presentatie), speciaal-voorbereiding ("Rook 24u tevoren").

**Tab 5 — Communicatie:** menu-pitch (1-2 zinnen voor klant), `is_in_wizard` toggle, `inspired_by` (multi-select, voor Citations API).

**Knoppen & acties:**
- `Opslaan` — PATCH `/api/gerechten/[id]` met gevalideerde delta
- `Verwijder` — confirm, blocked als gerecht in actieve recipe/offerte
- `Dupliceer`, `Share` (QR-code), **AI-Foto vision-fill** (`/api/gerecht-vision-fill`, Sonnet 4.6 vision)

**Modals binnen drawer:**
- **AllergenConfirmModal** — bevestigt AI-suggesties permanent
- **ComponentCostBreakdown** — expandeerbare rijen per ingredient (bron van €)
- **SubstitutionDrawer** — "Suggesteer vervanging" (Pillar #3: cost-parity + taste-match)

**Join-tabellen:**
- **`gerecht_components`** — gerecht_id, component_id, qty, unit, yield_ratio. Cost = `component.base_cost_cents × (qty/base_quantity) × (yield_ratio/100)`
- **`recipe_allergens`** — gerecht_id, allergen_code, ai_suggested, confirmed_at, confirmed_by
- **`recipe_haccp`** — gerecht_id, type, threshold_value, threshold_unit, note, ai_suggested

### 8.3 `/gerechten/componenten` — atomaire bouwstenen

**Layout:**
- Hero met stat-pills (totaal, zelf-bereid vs inkoop split)
- KPI-tegels (totaal, zelf-bereid, inkoop, AI-suggesties %, gem. kostprijs)
- **AI-ringchart** (SVG cirkeldiagram, circumference = 2πr, r=86, gradient geel→oranje→rood)
- **FolderTree** (Drive-style sidebar, drag-drop activatie 5px) — root "__root__", subfolder-nodes met count, context-menu per folder (+ New folder / Rename / Delete)
- Filter-pills: All / Zelf-bereid (Package icon) / Inkoop (ShoppingBag icon) — live-counts
- Search-bar (⌘K shortcut)
- **Card-grid** met drag-handle (cursor: move), hover-actions (Delete), flavor-tags (max 4)

**Knoppen:**
- `AI Genereer` — form: prompt-textarea (max 500 chars) + type-select (prepared/bought_in) → callAI → JSON-voorstel
- `Bedenker Studio` — `/gerechten?modal=bedenker`
- `+ Nieuw component` — inline form: naam, type, basis-qty/unit, kostprijs (€), smaak-tags
- `Importeer leverancier` — SupplierImportDrawer (CSV → bulk-create bought_in components met externe product-IDs)

**AI-generatie-flow:**
1. **Input** — prompt (max 500 chars, sanitized) + type
2. **API** — POST `/api/ai/component-generate` → Sonnet 4.6 (prompt injection-safe, `<user_query>`-delimited)
3. **Output JSON:**
```json
{
  "name": "Bacon crumble met chili",
  "description": "...",
  "type": "prepared",
  "base_quantity": 100, "base_unit": "g", "base_cost_cents": 234,
  "flavor_tags": ["rokerig","pikant","umami"],
  "ingredients": [{"name":"speklap","qty":500,"unit":"g"}, ...],
  "preparation_steps": ["Snij bacon...", "Bak uit..."],
  "allergens": [{"allergen_code":"S","ai_suggested":true}],
  "haccp_points": [{"type":"kerntemp","threshold_value":75,"threshold_unit":"celsius","note":"...","ai_suggested":true}]
}
```
4. **Confirmatie-grid** — user ziet voorstel met toggle-buttons per allergen/HACCP (default alles AAN)
5. **Save** — POST `/api/components` met confirmed-items (HACCP/allergen niet-gekozen weggelaten)

**Edit-drawer (ComponentEditDrawer):**
- Tabs: Basis / Allergenen / HACCP
- Allergen-grid (G/L/N/V/VE/E/S/F/M), "AI suggested" label, "Bevestigd op" timestamp
- HACCP-tabel: type-dropdown, threshold-value, threshold-unit, note, delete
- Flavor-tags (comma-separated, parse on blur)
- PUT `/api/components/[id]` delta-update

**Drag-drop (@dnd-kit):**
- PointerSensor met **5px activation-distance** (onderscheid click van drag)
- Drop zones: FolderTree nodes (`folder_${folderUuid}` of `folder_root`)
- DragOverlay floating chip (type-icon + naam, max-width 280px, semi-transparent)
- Optimistic UI met rollback bij API-fout
- Persistence: PATCH `/api/components/[id]` → `{ folder_id }`

**Schema (`components`):**
```sql
components (
  id BIGSERIAL PRIMARY KEY,
  organization_id UUID,
  name, description,
  type ENUM ('prepared','bought_in'),
  base_quantity NUMERIC(10,3), base_unit TEXT,
  base_cost_cents INT CHECK (>= 0),
  flavor_tags TEXT[],
  supplier_product_id INT,
  ai_suggested BOOLEAN DEFAULT false,
  approved_at, approved_by,
  folder_id UUID FK component_folders, -- null = root
  created_at, updated_at
)
```

Join-tabellen: `component_allergens` (UNIQUE `(component_id, allergen_code)`, ON CONFLICT DO NOTHING bij AI-persist), `component_haccp`, `component_folders` (recursive parent_id).

### 8.4 `/gerechten/menukaarten` en `/gerechten/menukaarten/[id]` — templates + composer

**Lijst-tabel:** naam, gerechten-count, basis-prijs p.p., gasten, default-badge (Star), edit-icon. Default-template via partial unique index per org. Empty-state: "Maak een menukaart" knop.

**Composer (`MenuComposer`, wizard-interface):**
- **Stap 1** — basis (naam, beschrijving, gastenaantal, basis-prijs-pp)
- **Stap 2** — per gang gerecht-selector (multi-select chips, drag-drop reorder, search per gang, "AI suggestie" knop)
- **Stap 3** — preview (volledig menu, kostopbouw per gang, totaal p.p.)
- **Stap 4** — opslaan/publiceren

**Right panel (live-update):** geselecteerde gerechten per gang met verwijder-knop, berekende totaal-kostprijs p.p., AI-suggesties ("Deze gang is zwaar, voeg bijgerecht toe").

**AI-modellen:**
- `recipe-generate mode='menu'` — Sonnet 4.6, output 5-7-gang menu met kostprijzen en `inspired_by` citations
- **Menudensity-validator** — Haiku 4.5 veto bij ongebalanceerde gang-count

**Save-flow:** POST `/api/menu-templates` → INSERT in `menu_templates` met `menu_selectie JSONB`-snapshot. Edit: prefetch via `getMenuTemplate()`, PUT `/api/menu-templates/[id]` met delta.

**Schema (`menu_templates`):** `id BIGSERIAL`, `organization_id`, `naam`, `beschrijving`, `menu_selectie JSONB` (`{ gang_slug: string[] }`), `basis_prijs_pp NUMERIC(10,2) DEFAULT 0`, `aantal_gasten INT DEFAULT 40`, `is_default BOOLEAN`, `actief BOOLEAN`.

### 8.5 `/gerechten/analyse` — margin-dashboard (BCG + Health)

**View-toggle:** Performance (default) | Health (via `?view=health`).

**KPI-header:** totaal gerechten, totaal components, avg marge %, gang-verdeling.

**Performance-view — BCG-matrix:**
- X-as: Volume (× besteld in offerte/event)
- Y-as: Marge (%)
- Kwadranten: Stars / Cash Cows / Question Marks / Dogs
- Bubble-grootte: kostprijs
- Bubble-kleur: gang
- Hover: tooltip (naam, marge, volume, kostprijs)

**Health-view:**
- Tabel met status-kolommen per gerecht: kostprijs-status (✓/!/?), allergen-status (✓/⚠/!), foto-status (✓/!), HACCP-status (✓/!)
- Filterknoppen: Only Critical / Only Warnings / Only Missing

**Trend-analyse:**
- Wekelijkse sparkline per gang (12 weken)
- AI-suggesties: "Pulled Pork marge daalt — verhoog verkoopprijs of vind goedkoper ingredient"

**Tabel:** Top 10 marge / Top 10 volume met populariteit-score (volume × marge).

**AI-suggesties (Haiku 4.5):** batch input alle gerechten, output `{ target_gerecht_id, suggestion_text, priority (1-5) }`. RPC custom SQL voor volume-aggregatie per gerecht.

### 8.6 `/keuken/kookbord` en `/keuken/board` — KDS prep-board

Lars-friendly Kanban met grote tegels, swipe-to-done op tablet.

**Kolommen:** Vandaag / Morgen / Deze-week / Overdue / Done (archief).

**Per tegel:** gerecht-naam (bold), hoeveelheid (X kg / X portions uit `target_qty`), ingrediënt/component (subtitel), station-label (kleur-coded badge Smoker/Grill/Koud), deadline (tijd-label "10:30" of "D-1 08:00"), assignee-avatar, status-indicator (prep-icon / spinner / checkmark), priority-strip (visueel, 0-100 gradient).

**Interacties:**
- Tap/Click → detail-modal (full beschrijving, ingrediënten-checklist, instructies)
- **Swipe-to-done** (tablet) — visual feedback + archive
- Drag-drop → ander station-kolom (update `prep_tasks.station_id`)
- Long-press → context-menu (Start / Snooze 30min / Reassign / Skip / Notes)

**Real-time:** Supabase realtime subscription op `prep_tasks WHERE organization_id = user.org`.

**Schema (`prep_tasks`, migratie `20260511140000_prep_kds.sql`):**
```sql
prep_tasks (
  id INT PRIMARY KEY,
  organization_id UUID,
  event_id BIGINT FK,
  gerecht_id UUID FK, component_id BIGINT FK, course_id BIGINT FK,
  station_id BIGINT FK kitchen_stations,
  assignee_id UUID FK personeel,
  status ENUM ('planned','queued','in_progress','done','skipped','blocked'),
  scheduled_at TIMESTAMPTZ, -- backward-scheduled via prep-offset
  started_at, completed_at,
  target_qty NUMERIC(10,3), -- server-computed, NOOIT AI
  target_unit TEXT,
  actual_qty NUMERIC(10,3),
  qty_source ENUM ('server_recipe','manual','headcount_scaled'),
  phase ENUM ('inkoop','pekel','rub','marinade','smoke','grill','warm','koud','plate','service','other'),
  priority SMALLINT 0-100,
  notes, updated_at
)
```

**`kitchen_stations`:** `id`, `organization_id`, `name` (Smoker/Grill/Koud/Warm/Sauzen/Expeditie/Dessert/Bakkerij/Prep/Overig), `type`, `color`, `capacity_kg`, `capacity_concurrent`, `sort_order`, `archived`.

**`kds_device_sessions` (tablet/monitor-auth):**
- `id UUID`, `device_name`, `station_id FK`, `token_hash` (bcrypt), `scope` (`read_only_display`/`write`/`read`, default read-only), `pin_required`, `last_seen_at`, `revoked_at` (soft-delete)

**API-routes (`/api/prep/*`):**
- POST `/bulk-schedule` — init prep-tasks per event. Bereking: `event.guests × gerecht.porties ÷ yield_ratio = target_qty`. Backward offset op scheduled_at
- PATCH `/complete-task` — `status='done'`, `completed_at=NOW()`, audit `kds_audit_logs`
- PATCH `/start-task`, `/skip-task` (reason), `/snooze-task` (minutes, priority +5), `/reassign-task`
- POST `/device-verify` — PIN-bcrypt-match, fail × 5 → `kds_pin_lockout_until = NOW() + 5min`
- POST `/device-token` — genereer tablet-sessie-token + QR-code-SVG (Admin/Pitmaster only)

**Triggers:** `sync_prep_tasks_done_flag()` houdt legacy `done` boolean in sync met `status`.

### 8.7 `/prep-counter` — operator prep-workstation (alt voor /keuken/kookbord)

Operator-first prep-workstation met 4-stage timeline (D-3 / D-2 / D-1 / D-0). Master-detail UI met taken-checklist links en recipe-block met scaling rechts. Apart van `/keuken/kookbord` (KDS prep-board) — kookbord is real-time Kanban tijdens prep-shift, prep-counter is pre-event planning-view per dag-offset.

**Layout:**

**Header:** event-naam, datum, gasten-count, refresh-knop.

**Progress-strip:** "X van Y taken klaar" + "Y dagen tot event".

**4-Stage Timeline:**
- Dots met icons (ShoppingCart D-3 / Flame D-2 / ChefHat D-1 / Target D-0)
- Kleur-coded (paars / oranje / goud / rood) per stage
- Connector-lijn + progress-lijn (CSS animated)
- Datum-label per stage berekend uit eventDate (- 3 / - 2 / - 1 / 0)
- Per-stage progress (3/5 taken klaar)

**Master-list (links):** `groupByDagen()` → StageGroup per stage.
- Collapsible header per stage met done-count
- Task-items: checkbox, text, matched-gerecht-hint, chevron
- Task-toggle: celebrated met toast + visual highlight (1.5s peak-end)

**Detail-drawer (rechts):** sliding in bij task-click.
- Task-header + close-btn
- Stage-tip (context-box met kleur per stage)
- **Matched-gerecht block** — als prep-task.text fuzzy-matched op `gerechten.naam` (case-insensitive find, geen Levenshtein)
- **RecipeBlock** — ingrediënten scaled naar gast-aantal van het event
- Sticky footer: "Markeer klaar" button + "Volgende open taak"-hint

**Empty-state:** "Geen prep-taken — maak offerte aan" + link `/offertes`.

**Koppelingen:** `events` (next active event by date), `prep_tasks` (by event_id, ordered by dagen+id), `gerechten` (match task-text op naam).

**Geen AI** — pure operator-UI.

**Gap:** task-matching is fuzzy zonder Levenshtein → kan false-positive geven (acceptabel voor MVP).

### 8.8 `/marges` (Menu Engineering, Pro-tier) — BCG + drag-drop gang-mapping

Ander pagina dan `/gerechten/analyse` (8.5) — hergebrande van legacy `/menu-engineering`-redirect. Pro-tier gated (`RequireTier feature='menu_engineering'`).

**Layout:**
- **Background + Hero:** `MargesBackground`, `MargesPageHero` met KPI's
- **KPI-tiles:** totaalGerechten / metKostprijs / gemMarge / bcgStars / bcgDogs
- **Winner Spotlight:** gerecht met hoogste marge (geaccepteerde offertes context)
- **Toolbar:**
  - Search-input (fuzzy op naam + beschrijving)
  - Buttons: "Winnaars & Verliezers" (BCG Drawer), "Menukaart indelen" (Map Station Drawer), "Selecteer" (selection-mode toggle)
- **Gang-filter-pills:** "Alle" + per-gang met counts
- **Selection-bar:** "X geselecteerd" + buttons (Select Visible, Deselecteer, Verwijder)
- **Grid:** GerechtKaart × N

**BCG Drawer:**
- Stats: Totaal / ⭐ Stars / 🧩 Puzzles / 🐴 Plowhorses / 🐕 Dogs
- BCGMatrix component (scatterplot-like)
- QuadrantCards (per quadrant, clickable cards)

**Map Station Drawer:**
- 2-column: Pool (ongemapt gerechten, draggable) + Gang-stations (per gang, drop-zones)
- Buttons: **"AI auto-sort"** (keyword-matching, GEEN AI-call — pure heuristic via hardcoded JSON-keyword-map), Reset
- Publish-per-gang (bulk-update `gang_slug` + `actief: true`)

**GerechtDetailsModal:** per geselecteerd gerecht — edit name/beschrijving/kostprijs/verkoopprijs, calculate marge real-time.

**Koppelingen:** `gerechten` (bulk), `gangen` (structure), `events` (menu data → popularity via `CountDishPopularity`), `offertes` (basis_prijs_pp → gem. verkoopprijs), `inventory` (kostprijs-calc).

**Geen AI** — `aiAutoSort()` is pure keyword-heuristic, geen Claude-call.

**Gaps:**
- `AiMenuComposer` moved naar `/gerechten?view=menus`
- Geen real-time marge-update bij verkoopprijs-wijziging (manual refresh)
- BCG matrix scale-assen (popularity vs margin) hardcoded medians (geen adjustable thresholds)

### 8.9 Allergenen-cascade (4-niveau)

Pillar: ingredient → component → gerecht → event-gast.

**Niveau 1 — Ingredient (impliciet):** ingrediënt-naam → AI `detect-allergens` (Haiku) → allergen-codes → `component_allergens` (`ai_suggested=true`).

**Niveau 2 — Component-bevestiging:** user ziet AI-voorstel in /componenten detail. Click "Bevestig" → `UPDATE component_allergens SET confirmed_at, confirmed_by`. Trigger backfill: alle gerechten met deze component → refresh allergen-lijst.

**Niveau 3 — Gerecht (union van components):** wijzigt component-lijst → trigger `compute_gerecht_allergens(gerecht_id)` RPC → UNION alle component_allergens, dedupe, sort. Event-allergies kan tegen `gerechten.allergenen` valideren.

**Niveau 4 — Event-gast:** `event_allergies`-tabel (per gast: `table_num`, `seat_num`, `allergens TEXT[]`, `severity` ENUM). KDS-display: rood/oranje badge bij conflict met `gerecht.allergenen`.

**Hard rule:** allergenen NOOIT AI-text-generated; altijd via join-tabellen.

### 8.10 Yield-ratio en kostprijs-cascade

**Formule:** `cost_at_use = component.base_cost_cents × (qty_in_recipe / component.base_quantity) × (yield_ratio / 100)`

**Voorbeeld:** boter base €5/500g, recept 200g met yield 95% → `500 × (200/500) × (95/100) = 190 cent = €1,90`.

**Yield-ratio per ingredient:**
- Default 100% (geen verlies)
- 3 lagen: global default (admin-settings, typisch 90% voeding) → component-level (best-practice) → recipe-specific (chef override per gerecht)

**Cost-rollup-trigger:** wijzigt `components.base_cost_cents` → trigger `cascade_cost_to_gerechten(component_id)` → alle gerechten herrekenen `total_cost_cents` → klant ziet live-update op gerechten-kaart.

### 8.11 Bekende gaps in Menu-hub

- **Geen native voedingswaarde-database** (NEVO/NUBEL) — voedingsinformatie handmatig of via Sonnet, niet uit officiële bron
- **Menu-engineering BCG-suggesties rudimentair** — Apicbase doet constraint-based recipe-generation rijker
- **Recepten/gerechten-merge** doorgevoerd, oudere UI verwijst soms nog naar "recepten" (kleine bugjes)
- **Chef-coach alleen actief in /events/[id]/service**, niet op kookbord zelf
- **Geen capacity-warning** ("station X is vol")
- **Geen dependency-resolver** (pekel moet klaar zijn voor rub, UI toont niet waarom "rub" blocked is)
- **Geen guest-count dynamic rescale** — als event-gastenaantal verandert moet `target_qty` herschaald, dat gebeurt niet automatisch
- **Geen live-collaboration** op gerecht-edit (meerdere editors stuiteren via optimistic-UI)
- **Geen versioning/audit-trail** per detail-tab (alleen ai_usage logs)
- **Dieet-claims niet aan allergenen gekoppeld** (Vegan ≠ automatisch geen allergen-set)
- **Component-versioning** niet geïmplementeerd (update overschrijft)
- **Geen "usage statistics"** (hoeveel gerechten gebruiken deze component)

## 9. Hub Voorraad (`/voorraad` + `/leveranciers` + `/inkoop` + `/materieel` + `/logistiek` + `/price-intelligence`)

Voorraad is de hub voor fysieke spullen: inventory, leveranciers, inkoop, materieel, logistiek, price-intelligence (leverancier-prijswijzigingen via email-in).

### 9.1 `/voorraad` — inventory-stand met live KPI's

Server-side parallel prefetch van 5 tabellen (`inventory`, `recepten`, `supplier_prices`, `stock_movements`, `price_history`), client-side met `useSupabase` realtime fallback. RLS-isolatie per org. Limit 2000 items per query (guard tegen full-table-scans).

**KPI-strip (live):**
1. **Totale inventariswaarde** — `Σ (current_stock × last_price_eur)` over alle items
2. **Items onder minimum** — `COUNT WHERE current_stock < minimum_stock`
3. **Coverage-days** — per item `(current_stock / daily_demand) × days_ahead`; geaggregeerd worst-case of median
4. **Stock-value-trend** — laatste 7 dagen sparkline

**Status-badges:** voorradig / laag (70-100% van min) / kritiek (<70%) / opnieuw besteld / afgekeurd (discontinued flag) / absent.

**Barcode-scan FAB (`ScanFab.tsx`):**
- Camera input → barcode parser → `inventory_id` lookup
- +1 stock (one-tap) of opent modal met qty-adjust + leverancier-hint
- Triggers: `stock_movements` insert + `inventory` update + marge-alert-check

**Stock-movements log per item:**
- Datum, qty (+/-), leverancier (incoming), reason (par-fill / event-withdraw / manual-count / damage), user_id, source_bon_id
- Gesorteerd desc op datum

**Schema (`inventory`):**
```sql
inventory (
  id, organization_id, naam, categorie, unit,
  minimum_stock, par_level JSONB, -- per event-type
  current_stock,
  last_price_eur, last_price_at, last_price_leverancier_id -- cache
)
```

**Migratie:** `20260511120000_voorraad_topfier.sql` voegt top-tier features toe.

### 9.2 `/voorraad/historie/[id]` — stock + price-history per item

**Layout:** item-naam, soort, cut-classificatie (uit `meat_taxonomy`), leverancier.

**Grafieken:**
1. **Stock-trend (30d)** — line-chart van `stock_movements` aggregated per dag (last_value); x-markers voor event-withdrawal-pikes
2. **Price-history-trend (90d)** — line per leverancier (uit `supplier_prices` / `price_history`); color-coded per leverancier; avg per dag bij meerdere bronnen

**Log-tabel:** alle stock_movements, filter op leverancier/reason/datum-range.

**Schema (`price_history`):** `id`, `inventory_id`, `datum`, `unit_price`, `unit`, `source` (bon_id / manual / import), `leverancier_id`, `organization_id`. Index `(inventory_id, datum DESC)`.

### 9.3 `/inkoop` — bestelvoorstel + bon-scanner snelle flow

**A. Bestelvoorstel (`buildBestelvoorstel()`):**

Input: `org_id`, `days_window` (default 14), flags (`persistConcepts`).

**Demand-calc (`getInventoryWithDemand()`):**
1. Events in date-window → BOM explosion via `gerecht_components` + `component_ingredients`
2. Per gerecht × guests → `qty_per_guest` scaling
3. Current_stock check → par_level comparison
4. `suggested_qty = (par_level - current_stock + reserved_for_events)` rounded up per leverancier

**Output JSON:**
```json
{
  "totals": { "window_days", "event_count", "recipe_count", "total_qty_by_supplier" },
  "bySupplier": [{
    "supplier_id", "naam", "email", "type",
    "lines": [{
      "inventory_id", "naam", "qty", "unit", "unit_price", "est_total_eur",
      "suggested_min_qty", "par_qty", "on_order_qty"
    }]
  }]
}
```

**Acties:**
- Per-regel hoeveelheden aanpassen (optimistic override, persisted via Server Action)
- **"E-mail naar leverancier"** — Resend email-template met PDF-bijlage (invoice-styled)
- Leverancier-dropdown (geel alarm bij geen keuze = incomplete order)
- **"Vorig keer"-template-button** — load `order_templates` per event-type × guests-baseline-scaling

**Margins & alerts:**
- Geen kosten-berekening in /inkoop zelf (kostprijs read-only uit `recipe_cost_snapshots`)
- Margin-alerts als sticky banner bij leverancier-prijswijziging >2% of >€5/gerecht

**B. Bon-scanner:** zie sectie 10.7 (volledig in Geld-hub). Snelle inkoop-flow gebruikt zelfde Haiku 4.5 vision + LeverancierStep state-machine. Bij confirm: voorraad-update + `supplier_invoices` koppeling.

### 9.4 `/leveranciers` — supplier-beheer met add-wizard

**Lijst-view per leverancier:**
- Naam, type (slager/wholesaler/farmer/custom), portal-hint (sligro/makro/baktotaal/vuur-rook/hanos/bidfood/custom)
- Import-methode: extension/email_in/csv/manual (icoon + label)
- Products-count, `last_sync_at` (relatief: "2u geleden", "nooit")
- Scope-filter: alles / food_drinks / custom (keywords-hint)
- Pending mutations-count (geel badge "Review 3")
- Action-buttons: PDF (prijslijsten), Historie (bonnen + prijs-trends), Refresh (status), Archive

**Schema (`leveranciers`):**
```sql
leveranciers (
  id, organization_id, naam, type,
  contact, email, tel,
  import_method, portal_url, portal_hint,
  last_sync_at, last_sync_status ('never','running','completed','partial','failed'),
  products_count, notes,
  scope_filter ENUM ('alles','food_drinks','custom'),
  scope_keywords JSONB,
  factuur_cyclus ENUM ('bij_levering','week','maand','kwartaal'), -- voor slagers
  bon_invoer_methode ENUM ('portal','email','foto','handmatig'),
  kwaliteit_score 0-10,
  created_at
)
```

**Add-wizard flow:**
1. **URL-input → AI auto-detect** (Sonnet 4.6 vision op favicon + page snapshot) → naam + scope-suggestion + import-method-recommendation
2. **Quick-pick known-portals:** Sligro, Makro, Baktotaal, Hanos, Bidfood, Vuur-Rook (pre-fill modal)
3. **Scope-radio:** food_drinks (aanbevolen voor wholesalers) / alles / custom (keywords)
4. **Import-method 5-tier cards:** Extension (snel pad) / Email-in / PDF-upload (bulk) / CSV / Manual

### 9.5 `/leveranciers/[id]/prijslijsten` — PDF-extractor (realtime + Batch API)

**Upload-flow heeft twee modi naast elkaar:**

**Realtime (1e PDF, <30s):**
- Model: **Sonnet 4.6** met prompt-caching (system-prompt cached 1h TTL)
- Output-schema: `parsed_naam`, `parsed_eenheid`, `parsed_prijs` (EUR, no VAT), `parsed_categorie`, `detected_soort` (enum vlees-taxonomie), `detected_cut`, `bereiding_default`, `confidence` (0-1)
- `MAX_OUTPUT_TOKENS = 32k`, `MAX_LINES_PER_CHUNK = 800`
- Result → `org_pricelist_uploads.status='parsed'` → suggestions JSON → ready for review

**Batch API (PDFs 2-25):**
- Enqueue via `enqueueBatchExtraction()` (chunking logic)
- Polling every 60s via `/api/pricelists/batch/poll-mine` (cron fallback)
- Chunks created als PDF >10p (chunk = 10p window, overlaps handled per page-range)
- `org_pricelist_uploads.anthropic_batch_id` tracks batch-id; chunks stored per parent upload_id
- Max 24u delivery SLA (Anthropic; production usually 1-10min)

**Hard rule:** BTW NIET in AI-output; server-side derived uit `BTW_RULES_2026`.

**Schema (`org_pricelist_uploads`):**
```sql
org_pricelist_uploads (
  id UUID PRIMARY KEY,
  organization_id, leverancier_id, uploaded_by,
  filename, storage_path, size_bytes, page_count,
  content_hash, -- SHA-256 dedup
  status ENUM ('uploaded','queued','parsing','parsed','failed','dismissed'),
  processing_mode ENUM ('realtime','batch'),
  anthropic_batch_id, parse_started_at, parse_finished_at,
  parsed_product_count, new_count, updated_count,
  ai_cost_cents, ai_model, -- claude-sonnet-4-6
  parse_error
)
```

**Chunk-tabel (zelfde tabel als chunk_total > 1):** `parent_upload_id`, `chunk_index`, `chunk_total`, `page_start`, `page_end`, `status` (parsed/failed), `retry_count`, `ai_cost_cents`.

**UI status-machine:**
- `uploading → parsing/queued` (golden spinner) → `parsed` (green checkmark) + lineCount / newCount / updatedCount badges
- `partial` (orange) = some chunks failed, can retry individual chunks
- `failed` (red) = non-chunked failed, whole-upload retry button
- `duplicate` = dedup-detected (reassignable if no leverancier prior)
- Stuck-detection: sync >90s of chunked >10min → warning + annuleer-knop

**Alias-management:** leverancier-specifieke aliassen koppelen aan eigen componenten ("rib-eye" leverancier X = "entrecote" intern).

### 9.6 `/leveranciers/bulk-upload` — drag-drop max 25 PDFs

- Drag-drop up to 25 PDFs, max 32MB each
- Optional leverancier-dropdown (AI detection fallback)
- 1e PDF realtime (sync-mode), rest → batch-enqueue (async)
- Queue-display grid: filename, size, status, error-msg; sticky action-bar
- Est. cost: €0,20 heuristic per PDF (display only; actual from `ai_cost_cents` post-parse)

### 9.7 `/leveranciers/historie/[id]` — prijswijzigings-historie

- **Bonnen-historie** — `supplier_invoices` join leveranciers: datum, totaal_bedrag, artikel-count, status (paid/unpaid)
- **Per-leverancier prijs-trends** — `price_history` aggregated, line-chart per ingrediënt over tijd. Trend, gemiddelde, std-deviatie. Detect price-changes >5% week-over-week → notification

### 9.8 `/materieel` — equipment-inventory

Per materieel-stuk:
- Naam ("Yoder smoker YS640", "Branders Forge 12-pits", "Koelkast 200L")
- Categorie (Cooking / Cooling / Transport / Serveerwerk / Tafels & banken)
- Locatie (Schuur 1, Schuur 2, In transit)
- Status (beschikbaar / onderhoud / defect / in-gebruik bij event X)
- Aankoopdatum, aanschafprijs, afschrijvingstermijn
- Laatste onderhoud
- `next_event_id FK events` — welk event claim't dit materieel

**UI:** kaart-weergave + status-badges, event-assignment modal, conflict-detector (zelfde materieel toegewezen aan twee overlappende events).

### 9.9 `/logistiek` en `/logistiek/field` — routes + transport

- `/logistiek` — overture: route-planner (MapLibre), pack-list-gen (BOM-explosion uit `event.menu`, grouped by container/cooler/trip), driver-assignment
- `/logistiek/field` — live field-execution (GPS via MapLibre, check-off per item)

**Acties:**
- Route plannen (MapLibre)
- Driver toewijzen (dropdown per route, conflict-check op unavailable date)
- Vehicle toewijzen uit `voertuigen` (zie sectie 10.9)
- Field-checklist offline-tolerant
- Auto-export naar `/administratie/rittenregistratie` voor Belastingdienst

### 9.10 `/price-intelligence` — leverancier-prijswijzigingen via email-in

Email-inbound is in 2026-05-04 gekozen als hoofdroute (memory: scraper-route afgewezen).

**Inbound flow:**

1. Cateraar geeft leverancier het adres `pl-{org-slug}@in.bbqarchitect.app`
2. Cloudflare Email Worker ontvangt mail → POST naar `/api/email/inbound` met `x-cf-signature` (HMAC SHA256 timing-safe verify)
3. Payload: `to`, `from`, `messageId`, `attachments` (base64), `spfPass`, `dkimPass`
4. Service-role Supabase: insert in `org_email_inbox` (dedup via UNIQUE `(organization_id, raw_message_id)`)
5. `after()` trigger: `stageAttachment()` naar Storage → `/api/parse-attachment` (universal parser)
6. Sonnet 4.6 vision parseert PDF → kandidaat-rijen in `org_price_mutations`
7. Operator reviewt en bevestigt of corrigeert
8. Bij approve: `org_product_aliases` insert + trigger price-cascade (zie 9.12)

**Schema (`org_email_inbox`):**
```sql
org_email_inbox (
  id, organization_id,
  inbound_address, from_email, from_name,
  subject, raw_message_id, body_excerpt,
  attachment_count, spf_pass, dkim_pass,
  status ENUM ('received','parsing','parsed','failed'),
  category -- ai-classified
)
```

**Status-mutations (`org_price_mutations`):**
```sql
org_price_mutations (
  id UUID, organization_id, leverancier_id BIGINT,
  master_product_id,
  status ENUM ('pending','approved','rejected','dismissed'),
  parsed_naam, parsed_eenheid, parsed_prijs, parsed_categorie,
  detected_soort, detected_cut, confidence,
  suggested_aliases JSONB,
  reviewed_by, reviewed_at, created_at,
  committed_supplier_price_id FK supplier_prices, -- na approve
  source_ref_id, source_type ENUM ('pdf_upload','email_pricelist','bon_extract')
)
```

**Mutation-review UI (Review-sheet opent vanuit `/leveranciers?review={levId}`):**
- Pending mutations per leverancier
- Per mutation: parsed-naam + detected-cut (meat-taxonomy-colored), parsed-prijs, suggested-aliases (checkboxes voor auto-link), approve/reject
- Post-approve: `org_product_aliases` insert + trigger price-cascade

**Op de pagina:**
- Inbox: lijst binnengekomen e-mails (afzender, datum, status)
- Review-queue: kandidaat-prijswijzigingen wachtend
- Stats per leverancier: aantal items, ΔΔ-percentage week-over-week, top-stijgers, top-dalers

**Migratie:** `20260601100000_price_intelligence_application_layer.sql`.

### 9.11 Cron & background jobs (Voorraad)

**Marge-alerts (6h scheduled):**
- Scan `price_history` voor >5% shifts per leverancier × inventory
- Insert `marge_alerts` row, `affected_offertes` JSONB, `total_marge_impact_eur`
- Status: open / acknowledged / resolved / dismissed
- MargeAlertBanner sticky op `/vandaag` en `/leveranciers` bij open alerts

**Market-Pulse (daily, opt-in feature-flag):**
- Materialized view `market_pulse_30d` met **k-anonymity ≥5 orgs** (HAVING-clause SQL-enforced)
- Aggregates `supplier_prices` last 60d by `meat_taxonomy` bucket
- RPC `get_market_pulse(org_id)` → `bucket_id, cut_groep, soort, avg_price_now, avg_price_30d, delta_pct_30d, participant_min`
- Trigger: `organizations.feature_flags['market_pulse_opt_in'] = true`

**Recipe-Recompute Queue (cron-triggered):**
- Tabel `recipe_recompute_queue` (`component_id`, `new_cost_cents`, `source_mutation_id`, `processed_at`, `attempts`)
- Trigger: `UPDATE org_price_mutations SET status='approved'` → `enqueue_components_after_mutation_approve()`
- RPC `process_recipe_recompute_queue(batch_size=200)` updates `components.base_cost_cents` → cascades naar `gerecht_components.cost_at_use_cents` → `gerechten.total_cost_cents`
- Snapshots per affected gerecht (`recipe_cost_snapshots`-tabel)

### 9.12 Database-kernschema (Voorraad)

**`supplier_prices`** — `id, organization_id, master_product_id, leverancier TEXT, eenheid, prijs, prijs_per_kg, prijs_per_stuk, actief BOOL, created_at, updated_at`. Index `(master_product_id, organization_id, actief=true)`.

**`meat_taxonomy`** (global, no RLS) — `id, soort (varken/kip/rund/lam/geit/vis/gevogelte/worst), cut_groep (nek-borst/buik/rib/haas/etc), bereiding_default (low-slow/hot-fast/sous-vide), aliassen TEXT[] seed, color_hex, sort_order`. **29 entries** in seed (varken 8, kip 4, rund 5, lam 3, gevogelte 2, vis 3, worst 1, overig 1).

**`org_product_aliases`** (per-tenant learning) — `id, organization_id, master_product_id, alias, alias_normalized (GENERATED LOWER), source ('user_approved' | 'ai_suggested'), cut_taxonomy_id, confidence, created_by, created_at`. UNIQUE `(organization_id, alias_normalized)`.

**`marge_alerts`** — `id, organization_id, inventory_id, leverancier_id, old_price, new_price, pct_change, detected_at, affected_offertes JSONB, total_marge_impact_eur, status, resolved_at`.

**`order_templates`** — `id, organization_id, name, description, event_type, guests_baseline, items JSONB, source_event_id, last_used_at, use_count, created_by_user_id, created_at`.

### 9.13 Anthropic-modellen (Voorraad)

| Use-case | Model | Cost | Notes |
|---|---|---|---|
| PDF-extractie (pricelistPdfPrompt.ts) | **Sonnet 4.6** | input €0,028/M, output €0,138/M | Prompt-caching 1h TTL, max 32k output tokens, batch-25 |
| Alias-suggestion (aliasSuggester.ts) | **Haiku 4.5** | input ~€0,92/M, output ~€4,60/M | Post-insert mutation suggestions, max 100 producten/call, 3-5 aliases/product |
| Leverancier auto-detect (add-wizard) | **Sonnet 4.6 vision** | per favicon+snapshot | URL → naam + scope + import-method |
| Bonnen vision (`/api/bonnen/extract`) | **Haiku 4.5** | €0,002-€0,004/bon | Zie sectie 10.7 |

### 9.14 Integraties (Voorraad)

1. **Email-inbound (Cloudflare Worker)** — `pl-{org-slug}@in.bbqarchitect.app` → HMAC-verified POST → org-resolve via subaddressing
2. **PDF-storage (Supabase Storage)** — `pricelist-pdfs` bucket, content_hash dedup, georganiseerd per organization_id
3. **Chrome extension** — portal-scrape leverancier (`leverancier.portal_url`-hint), sync via `/api/extension/leveranciers/route.ts`
4. **Anthropic Batch API** — enqueue up to 25 PDFs, polling via batch_id

### 9.15 Bekende gaps in Voorraad-hub

- **Geen native digitale-catalogi-koppeling** met Hanos/Sligro/Bidfood (Catermonkey heeft die wel; relevant voor kostprijs-precisie)
- **Materieel-tabel mist asset-depreciation tax-impact** voor administratie (zou via Geld-hub kunnen maar nog losse koppeling)
- **Logistiek heeft geen TSP/VRP-route-optimisatie** (puur visuele plot)
- **Stock-take** (jaarlijkse fysieke telling) niet apart geïmplementeerd; loopt via stock_movements
- **Chrome extension flow-details** nog niet volledig gedocumenteerd
- **Market-pulse opt-in default false** — moet apart geactiveerd in `feature_flags`

## 10. Hub Geld (`/financien` + `/uren` + `/bonnen` + `/archief` + `/geld/boekhouder` + `/administratie/rittenregistratie`)

Geld is de hub voor financiën en administratie. Het bevat het dashboard met W&V, uitgaven, BTW, aangifte, cashflow en top-klanten. Daarnaast uren, bonnen-scanning, het archief, het boekhouder-pakket en de rittenregistratie.

### 10.1 `/financien` — financieel dashboard

Tabbed-page. Tabs via nuqs-state (URL-query `?tab=`):

**`?tab=dashboard` (default):**
- KPI-strip: open facturen (bedrag + aantal), margin-% deze maand, cost-of-goods-sold (COGS), omzet-maand
- Recente facturen-lijst
- Recente betalingen-lijst

**`?tab=wv` (winst & verlies):**
- Bar-chart omzet vs kosten per maand (12 maanden trailing)
- Lijn-grafiek margin-% over tijd
- Drilldown per maand naar transacties (offertes → events → facturen)

**`?tab=uitgaven`:**
- Pie-chart leverancier-spend-mix
- Tabel uitgaven per categorie (Vlees, Vis, Groenten, Drank, Materieel, Logistiek, Overig)
- Summable; click-through naar `/bonnen` of `/archief`

**`?tab=btw`:**
- Maandelijks BTW-overzicht
- Omzet @ 21% (alcohol, services, materiaal)
- Omzet @ 9% (voeding, regulier catering)
- Omzet @ 0% (B2B intra-EU reverse charge, export)
- Diff-berekening tegen kwartaal-aangiftequota
- BTW-anomaly logging (sinds 2026-06-01 audit-fix) — afwijkende patronen worden gelogd

**`?tab=aangifte`:**
- Jaarcijfers voor IB/Vpb-aangifte (jan-dec)
- Self-employed (eenmanszaak): zelfstandigenaftrek, MKB-winstvrijstelling, KIA
- BV: vennootschapsbelasting-berekening
- KiaScenarioModal — finance-copilot voor "Hoeveel mag ik investeren?" met KIA-berekening per sector

**`?tab=cashflow`:**
- Inflow vs outflow per maand
- Inflow = geaccepteerde offertes
- Outflow = bonnen + payroll + rentes
- Projected cashflow (3 maanden vooruit) op basis van pijplijn

**`?tab=clients`:**
- Top-klanten op all-time omzet
- Ranking, met growth-arrow
- Drilldown naar klant-detail in `/klanten/[id]`

### 10.2 `/geld` — redirect-page naar `/financien`

`/geld` is geen eigen content-page. Het is een server-side `redirect()` naar `/financien`, ingezet als backward-compat voor oude bookmarks en links uit eerdere IA-versies. Geen UI, geen flash.

### 10.3 `/facturen` en `/factuur-lezer` — facturen-flow

**`/facturen`** — verkoopfacturen-lijst (legacy-page, naast `/geld/boekhouder` tab "Verkoop-facturen"). Kolommen: factuurnummer, klant, datum, vervaldatum, totaal, BTW, status (concept / verzonden / betaald / overdue / gecrediteerd), Moneybird-sync-status. Acties: open detail, verstuur (Resend), markeer betaald, push naar Moneybird, creditfactuur aanmaken.

**`/factuur-lezer`** — losse standalone bon/factuur-reader (Sonnet vision); blijft als alt entry point naast `/bonnen`. Vooral voor wie één factuur snel wil parsen zonder de hele review-queue.

### 10.4 `/geld/boekhouder` — boekhouder-handoff (5-tab interface)

Veel rijker dan een simpele export. Eén live RGS-classificatie-werkplek waarmee een boekhouder eens per maand het pakket aanlevert.

**Tab 1 — Inkoop-bonnen (120-230 rijen per maand)**
- Status-filter pills: Alle / Wachtend / Auto-verified / Twijfel / Vergrendeld
- KPI-strip bovenaan: totaal bonnen, nog te classificeren (AI pending), auto-geaccepteerd (≥85% confidence), handmatig overschreven, in twijfel-stapel (60-85% confidence), vergrendeld voor 7-jaar bewaarplicht
- Bonnen-rij collapse/expand:
  - Header: datum, leverancier, totaal-bedrag, RGS-categorie + confidence-%-badge
  - Expanded: netto / BTW 9% / BTW 21% breakdown, type leverancier, AI-reasoning (Sonnet 4.6 output), inline RGS-category-picker (disabled als locked), actions
- Acties per rij: **Accepteer**, **Mark Twijfel**, **Open in archief**, koppel aan event (`event_id` FK)
- Locked-banner verschijnt zodra een maand is vergrendeld (status `locked`, lock heeft `locked_by_user_id`-FK voor audit)

**Tab 2 — Verkoop-facturen**
- Per factuur: RGS-omzet-code (default `WOpbCat`), aanpasbaar via inline-picker
- Updates via `PATCH /api/boekhouder/facturen { id, rgs_code }`

**Tab 3 — Pakket-generator**
- Toggle Maand / Kwartaal / Jaar (URL-state via nuqs)
- Pre-flight-banner: "Eerst X twijfels afhandelen voor je vergrendelt"
- Marge-leak-alerts: leverancier-prijsverschuivingen met impact-€
- **Vergrendel-knop** → genereert PDF + CSV + ZIP (foto's van alle bonnen) → INSERT in `boekhouder_pakketten` met status `locked`
- Download-buttons per format: PDF / CSV / ZIP met "(Y foto's)"-count

**Tab 4 — Twijfel-stapel** — alle bonnen met AI-confidence 60-85%, één-bij-één afhandelen (Accept / Override category / Mark als privé)

**Tab 5 — Archief** — historisch overzicht van vergrendelde pakketten per maand:
- Periode-label, bonnen-count, facturen-count, totaal-inkoop, af-te-dragen-BTW
- Acties: Regenereer PDF/CSV (disabled als niet monthly-level), sent-status-badge (verstuurd / vergrendeld)

**Settings-sidebar (altijd zichtbaar):**
- Boekhouder-naam, boekhouder-e-mail
- AI-classify-drempel-slider (0.50-1.00, default **0.85**)
- Opslaan via `PATCH /api/boekhouder/settings`

**E-mail-stap (Verstuur naar boekhouder):**
- Textbox override-e-mail (default uit settings)
- Textarea voor begeleidende boodschap (template-prefilled)
- Verstuur → `POST /api/boekhouder/pakket/email` → Resend met ZIP-attachment

**AI-classify-flow:**
- Batch tot 20 bonnen per `POST /api/boekhouder/classify`
- Sonnet 4.6, cost ~€0.05 per batch
- Status-machine per bon: `pending → auto_accepted (≥85%) | manual (mens overschreef) | twijfel (60-85%) | verified`
- Output bevat AI-reasoning, gestold in `bonnen.ai_classify_reasoning`

**Migratie `20260511130000_boekhouder_pakket.sql` voegt toe:**
- `bonnen.rgs_code`, `rgs_category_label`, `event_id` FK, `ai_classify_status` enum, `ai_classify_confidence NUMERIC(3,2)`, `ai_classify_reasoning TEXT`, `classified_at`, `locked_at`, `locked_by_user_id` FK
- `facturen.rgs_code` (default `WOpbCat`), `locked_at`, `locked_by_user_id`
- `boekhouder_pakketten`-tabel: `period_type` (maand/kwartaal/jaar), `period_year`, `period_month/quarter`, counts, totalen, `btw_voorbelasting_eur`, `btw_af_te_dragen_eur`, status, `locked_at`, `sent_to_email`
- UNIQUE constraint per org per periode (geen dubbele pakketten)

### 10.5 `/uren` — persoonlijke uren (Klok-tab)

Vier componenten op één pagina:

1. **PunchPanel** — eigen klok met live timer, jaarlijkse-uren-tracker (`MyYearTotalHours`)
2. **LiveRow** — real-time lijst van actieve klokken van team-leden
3. **CrewBlock** — manager bulk-inklokken/uitklokken per crew-lid
4. **MonthBlock** — printable maand-recap (`@media print` CSS, voor papieren tijdkaart-export)

**State-machine per `time_log`:**
- `active` (ingeklokt: `start_time` set, `end_time = NULL`)
- `completed` (uitgeklokt: beide set, duration berekend via `shiftDurationMs()`)

**Constraints:**
- 1 active-log per `personeel_id` tegelijk (UX-check + DB-constraint)
- UNIQUE `(org_id, personeel_id, start_time)` op active-log
- Uurtarief-snapshot wordt **bevroren** op inklokken (`time_logs.uurtarief_snapshot`) — wijziging van het personeels-tarief later raakt de oude logs niet

**Timer-gedrag:**
- Loopt door als gebruiker uitlogt (client-side stop-klok stopt, server houdt `start_time` aan)
- Bij terugkomst: live duration herberekend uit `start_time`

**Event-koppeling:** elke time_log kan optioneel een `event_id` FK hebben → uren per event aggregeerbaar voor margin-analyse.

**Error-toast meldingen:** "al ingeklokt", "personeelslid niet gevonden", "inklokken mislukt".

### 10.6 `/uren/personeel` — team-management

Personeels-tabel:

- Avatar (initialen in goud-circle), Naam, Functie, Contract-type (full-time / part-time / freelance), Uurtarief (€/u, decimal(8,2), rechts-uitgelijnd), E-mail, Status (Actief / Inactief badge)
- Filter-bar: 3 buttons (Alle / Actief / Inactief) met count-badges, live search-box (zoekt naam/functie/email)

**Drawer voor new/edit:** Naam, Functie, E-mail, Telefoon, Uurtarief, Contract-type (radio), Status (toggle). CRUD via `usePersoneel()`-hook → Supabase.

**Delete-confirm-dialog:** *"Crew-lid verwijderen? Bestaande klok-registraties blijven maar zijn losgekoppeld."* — uurtarief-snapshots blijven dus intact in oude logs.

**Workflow:** Manager voegt crew toe → verschijnt op Klok-tab → kan ingeklokt worden → tarief-snapshot bevroren bij inklokken → wijziging later raakt oude logs niet.

**Migratie `031_team_uren.sql`:** `personeel`-tabel (id, org_id FK, user_id FK→auth.users, naam, functie, email, telefoon, uurtarief decimal(8,2), contract_type enum, actief bool) + `time_logs`-tabel (id, org_id FK, personeel_id FK, event_id FK, start_time, end_time, status enum, locatie, notitie, uurtarief_snapshot, clocked_in_by FK).

### 10.7 `/bonnen` — bonnen-scanner (Haiku 4.5 vision, niet Sonnet)

Dedicated bon-scan-entry-point. Belangrijk: **bonnen gebruiken Claude Haiku 4.5 vision** voor extractie, niet Sonnet 4.6. Goedkoper (€0,002-€0,004 per scan) en sneller (<6 seconden per bon). UBL-XML uploads zijn **gratis** (geen AI-call, parser via fast-xml-parser).

**MultiFormatDropZone (unified):**
- Drag-drop, paste (Cmd+V), camera (smartphone-PWA), file-picker
- Ondersteund: PDF, HEIC (→ JPEG auto-convert via heic2any), JPG, PNG, UBL-XML
- Browser-image-compression vóór upload voor grote foto's

**Per gescande bon — extract-result:**
- Bon-preview: datum, leverancier-naam, totaal / netto / BTW 9% / BTW 21%
- Items-met-suggesties: OCR-rijen + inventory-match-suggestions
- Confidence-badge (0-100%)

**Leverancier-state-machine (`LeverancierStep`):**
1. **`auto_matched`** — groene "Gekoppeld"-badge, AI heeft KvK/BTW-nummer/naam gematched op bestaande leverancier
2. **`needs_approval`** — "AI denkt X" + candidate-list met score-%; gebruiker bevestigt
3. **`new_suggested`** — "Onbekende leverancier" + input "Maak nieuwe aan" (autofills KvK uit bon)
4. **`no_leverancier`** — rood "Geen leverancier" + handmatige input

**Duplicate-detect:**
- Image-hash check vóór scan
- Bij hit: toast met link "al in archief, scan opnieuw?"

**Batch-mode:**
- Sleep meerdere bonnen tegelijk
- Eén knop "Bevestig alle N → archief" → loop over `POST /api/bonnen/commit` per bon

**Attach-to-bon-flow:**
- Vanuit `/archief` met "Scan opnieuw"-link → nieuwe scan gekoppeld aan bestaande `bon_id` (overwrite datum/leverancier/bedrag), redirect naar `/archief?bon=X`

**Review-queue (migratie `024_email_inbox_and_review_queue.sql`):**
- Status per bon: `queued → extracted → review → confirmed | rejected`
- Bij confirm: koppelt aan leverancier (autocomplete + KvK-match), update voorraad indien voorraad-relevant, INSERT in `supplier_invoices`

### 10.8 `/archief` — 7-jaar doorzoekbaar bonnen-kistje

Server-component DAL-orchestrator. Bewaartermijn 7 jaar voor de Belastingdienst.

**Search-params (URL-state via nuqs):**
- `q` — tsvector full-text search (Postgres `dutch` config in eigen IMMUTABLE function-wrapper)
- Datum-range — maand / kwartaal / 2025 / all / custom
- Leverancier — name → id resolve
- Status-filter — display-level (review / processed / locked) → DB-aliases
- Tags
- RGS-codes
- Bedrag-range — `lt50` / `50-500` / `gt500` of `min-max` custom

**DAL-functies:**
- `searchBonnen()` — tsvector Postgres-zoeking
- `listLeveranciersWithCounts()` — leverancier-pills met count
- `listDistinctTags()` — tag-cloud
- `listDistinctRgs()` — RGS-codes-filter
- `listInboxFacturen()` — email-inbound bonnen-tab

**Client-component `ArchiefClient`:**
- Search-bar bovenaan
- Filter-sidebar (leverancier-pills, tag-cloud, RGS-codes, bedrag-sliders)
- Bon-resultatengrid of tabel-lijst
- Inbox-integration als separate tab (email-inkomende bonnen in review-queue)

**Bonpreview-modal — 4 tabs:**
- **Route** — locatie + GPS uit foto-EXIF (indien aanwezig)
- **Kosten** — netto / BTW / totaal breakdown
- **Fiscaal** — RGS-categorie, BTW-aftrekbaarheid, koppeling event/leverancier
- **Audit** — wijzigingslog (lazy-loaded via `loadAudit` server-action), stock-impact (`loadStock`)

**Bulk-actions:**
- ZIP-download via archiver (signed URLs voor storage-images, 7-year retention)
- Bulk-export per bedrag / leverancier / periode
- Single-download met signed URL (5 min TTL)

**Limits:** 200 resultaten per query, maar `totalCount` queryable voor pagination.

**Doelgroep-quote uit sidebar:** *"Sleep foto's, PDF's, screenshots of UBL-XML naar binnen — wij lezen ze uit"* en *"typ baktotaal, vind elke bon over 7 jaar heen tot op het woord"*.

### 10.9 `/administratie/rittenregistratie` — Belastingdienst-erkende kilometeradministratie

Hier zit substantieel meer dan een simpele km-lijst. Het is een complete sluitende rittenregistratie inclusief MapLibre-visualisatie, fiscale audit-tab en een AI-cron die vergeten ritten signaleert.

#### 10.9.1 Overzichts-page (`/administratie/rittenregistratie`)

**Layout (4 secties):**

1. **MapLibre-kaart** — alle ritten als gecurvde arcs (curvature 0.12-0.20 per index zodat overlappende routes visueel uit elkaar lopen). Markers op destinations (eerste 12, deduped op coördinaat). HQ-fallback: Borger (Drenthe) als home indien geen geocode beschikbaar. Klik op een arc opent de detail.
2. **TotalenStrip-KPI's:**
   - Zakelijke km YTD
   - Privé km YTD
   - Totaal-bedrag aftrek (€)
   - Tarief €0,23/km (jaartal 2026 — uit `tarief_per_jaar`-lookup)
3. **FilterChips:** Alle / Zakelijk / Privé / Met omleiding
4. **Ritten-tabel:**
   - Kolommen: datum, voertuig-kenteken, vertrek-adres, aankomst-adres, kilometers, aftrek-bedrag (€), doel-radio (zakelijk/privé), actions
   - Sortering: datum DESC, id ASC (stabiele ordering)
   - Klik op rij → detail-page (`/[id]`)
   - Period-toggle: Maand (default) / Kwartaal / Jaar via URL-param `?p=`

**Sidebar:** voertuig-cards (merk + type + kenteken + begin-km, actieve-ritten-count per voertuig).

**Export-knop:** Download CSV `/api/ritten/export?start=2026-01-01&eind=2026-12-31` — Belastingdienst-format met 7 verplichte velden (datum, kenteken, vertrek, aankomst, km, doel, zakelijk j/n).

**Empty-state:** *"Nog geen ritten — begin met je eerste rit"* + link naar `/nieuw`.

#### 10.9.2 Nieuwe rit (`/administratie/rittenregistratie/nieuw`)

`RitForm`-component (geen wizard-steps, één form).

**Velden:**
- Datum (date-picker, default vandaag, validatie: niet in toekomst)
- Voertuig-keuze (dropdown, alleen actieve voertuigen — `einddatum IS NULL OR einddatum > datum`)
- Vertrek-adres (text, optioneel geocodeable)
- Aankomst-adres (text, optioneel geocodeable)
- Km-begin (number, default = `voertuig.begin_km` of `vorige_rit.km_eind`)
- Km-eind (number, validatie: ≥ km_begin)
- Zakelijk-radio: Zakelijk / Privé / Gemengd (= zakelijk met privé-omleiding)
- Privé-omleiding-km (only als Gemengd, slider 0 tot km-totaal)
- Route-omleiding (textarea, optioneel)
- Doel (text, optioneel)
- Event-keuze (FK→events, optioneel, prefill via `?event=ID` query-param)

**Server-side berekening:**
- `kilometers = km_eind - km_begin` (auto, als GENERATED column in `ritten`-tabel)
- `aftrekbedrag = bedragAftrekbaar(kilometers, zakelijk, prive_omleiding_km, datum)` → tarief-jaar lookup (`€0,23/2026`)

**Actions:** Submit (INSERT rit) / Annuleer (back).

**Voertuig-validatie:** voertuig moet actief zijn op rit-datum (gebruiksperiode-check).

#### 10.9.3 Detail-page (`/administratie/rittenregistratie/[id]`)

Tabbed detail met vorige/volgende-navigatie en kopiëer-functie.

**Header-nav:**
- Terug-link
- Vorige rit / Volgende rit (chronologisch, persistent, quick-scan adjacent ritten)
- Rit-nummer (#123)
- Dag-van-de-week label

**Tabs:**
1. **Route** — `MapRoute`-component (MapLibre, gecurvde arc), vertrek/aankomst-adressen, km-totaal, stops-lijst
2. **Kosten** — km-display, tarief-jaar-lookup, aftrek-berekening, BTW-gevolgen, bedrag-breakdown
3. **Fiscaal** — Belastingdienst-compliancy-checks: 7-verplichte-velden ✓, zakelijk/privé-classificatie audit, omleiding-km-justification
4. **Audit** — wijzigingslog, `created_at` / `updated_at` / `user_id`

**KPI-cards:** Kilometers / Aftrek-€ / Voertuig-info / Event-link (indien gekoppeld).

**Actions-bar:**
- **Bewerken** → `/[id]/bewerken`
- **Kopieer-rit** (modal voor nieuwe datum-keuze, duplicate met andere datum)
- **Verwijder** (confirm-dialog)
- **Goedkeur** (rit als `verified` markeren)

**Bewerken-page (`/[id]/bewerken`):** RitForm in edit-mode, velden pre-filled, submit → PATCH.

#### 10.9.4 Cron `/api/cron/ritten-vergeten` — AI-helper voor vergeten ritten

Maandelijkse Vercel-cron die proactief Pro/Enterprise-tenants signaleert over ontbrekende ritten.

**Logica:**
- Fetch alle Pro/Enterprise orgs
- Per org: zoek confirmed events zonder gekoppelde rit waarvan datum ≥ 90 dagen geleden
- Claude **Haiku 4.5** classifier (system-prompt verplicht): welke events "waarschijnlijk een rit hadden" (locatie + datum heuristic)
- Negeer events met locatie "Online" / "Telefoon" / lege locatie
- Max 10 events per notificatie (Lars-vriendelijk)
- Output: vriendelijke NL-zin als notification-record
- Idempotent per org per run (geen duplo-notificaties via UNIQUE constraint)
- Cost: ephemeral cache-control (€0,00001 savings per token)

**Effect:** cateraar krijgt in `/systeem` of via push: *"Hé, ik zie dat de bruiloft van Berkhout in maart in Veendam was — daar zit geen rit voor in je administratie. Wil je hem alsnog toevoegen?"*

#### 10.9.5 Migraties (de echte kolommen)

**`020_voertuigen_ritten.sql`:**
- `voertuigen`-tabel: `id`, `org_id FK`, `kenteken` (UNIQUE per org + datum, niet platform-breed), `merk`, `type`, `ingangsdatum`, `einddatum`, `begin_km`, `actief BOOL`, audit-timestamps
- `ritten`-tabel: `id`, `org_id FK`, `voertuig_id FK`, `event_id FK→events` (optional), `datum`, `vertrek_adres`, `aankomst_adres`, `route_omleiding TEXT`, `km_begin`, `km_eind`, `kilometers GENERATED`, `zakelijk BOOL`, `prive_omleiding_km INT`, `doel TEXT`, `user_id FK`, audit-timestamps
- Constraints: `km_eind ≥ km_begin`, `prive_omleiding_km ∈ [0, km_totaal]`
- Indexes: `(org_id, datum)`, `(voertuig_id, datum)`, `(event_id)`, `(zakelijk)`
- RLS-policies op org-niveau

**`021_ritten_dedup.sql`** — dedup-constraint zodat een rit niet per ongeluk dubbel wordt ingevoerd (UNIQUE op org_id + voertuig + datum + km_begin).

**`022_ritten_tijd_duur_status.sql`** — voegt tijd/duur/status-velden toe voor latere features (rit-duur in minuten, status `pending`/`verified`).

**`ritten_moneybird_pushes`-tabel** — UNIQUE op `(org_id, jaar, kwartaal)` zodat Moneybird-push per kwartaal exact één keer gebeurt (idempotency).

#### 10.9.6 API-routes (rittenregistratie)

- `GET /api/ritten/export?start=DATE&eind=DATE` — CSV met 7 verplichte Belastingdienst-velden
- `POST /api/ritten/moneybird-push { jaar, kwartaal }` — idempotente push via `ritten_moneybird_pushes`-tabel
- `GET /api/ritten/scan-km` — hulproute (legacy of in onderhoud)
- `GET /api/cron/ritten-vergeten` — maandelijkse Haiku-cron (zie 10.9.4)

#### 10.9.7 Wat opvalt — bewuste design-keuzes

- **Geen MapBox routing-engine** — Belastingdienst-eisen zijn odometer-based (km-begin/km-eind), niet route-geocode-based. Kaart is alleen voor visualisatie, niet voor km-berekening.
- **HQ-fallback Borger** — als geocoding faalt, valt de map terug op Hop & Bites' werkelijke locatie (Drenthe). Voor andere tenants zou dit configureerbaar moeten zijn — open item.
- **Uurtarief-snapshot-patroon** komt ook hier terug: tarief €0,23/km is per-jaar bevroren via `tarief_per_jaar`-lookup zodat oude ritten hun aftrek behouden bij tariefwijziging.

### 10.10 Bekende gaps en open items in Geld-hub

- **Geen native Exact-koppeling** — alleen Moneybird (Catermonkey en EasyParty hebben Exact wel; cateraars met BV-administratie bij Exact vinden dit een blocker).
- **Geen native AFAS-koppeling** — EasyParty wel.
- **Geen kasregister-functionaliteit** — Lightspeed K-series wel; relevant voor cateraars met fysieke take-away-deli of pop-up-buffet-stand.
- **RGS-versie onduidelijk** — RGS 3.5 is de actuele standaard juni 2026; nog te valideren welke versie de Boekhouder-pakket-export gebruikt.
- **Cashflow-projection is lineair** — geen seasonality-model (mei-bruiloften piek, januari-dip). Pro-tier-cateraars vragen hier al naar.
- **HQ-fallback Borger is hardcoded** voor de map — moet configureerbaar per tenant.
- **MapLibre-kaart op Ritten kan zwaar laden** bij >500 ritten — open performance-item.
- **Moneybird credit-facturen** niet bidirectioneel — alleen handmatig in BBQ Architect aanmaken, daarna handmatig naar Moneybird.

## 11. Hub Systeem (`/systeem` + `/instellingen/*` + `/gebruikers` + `/mailbox` + `/website` + `/hulp` + `/admin`)

Systeem is de hub voor de cateraar als ondernemer: instellingen, team, integraties, mailbox, website, hulp en admin. 12 sub-pagina's.

### 11.1 `/systeem` — control-room

Server Component met 3 horizontale secties. Live sinds 2026-06-01.

**Componenten:**
- **`SystemHealthStrip`** — 4 KPI-kaarten: MTD AI-spend EUR, YTD AI-calls, actieve users, active dishes in menu
- **`SysteemHubCards`** — 12 snelle links + recent activity uit `audit_log` (migratie `017_audit_log.sql`)
- **`SysteemTabs`** — voorkeuze-switcher (intern geheugen)

**DB-queries (parallel):**
```sql
SELECT cost_eur_cents FROM ai_usage WHERE organization_id = $1 AND created_at >= MONTH_START
SELECT COUNT(*) FROM organization_members WHERE organization_id = $1 AND status = 'active'
SELECT COUNT(*) FROM gerechten WHERE organization_id = $1 AND is_in_wizard = true
```

**Open issues:** configuratie-tekorten, ontbrekende integraties.

### 11.2 `/instellingen` — bedrijfsprofiel + huisstijl (8 panels)

Eén grote pagina (968+ regels) met 8 secties + sticky-bottom "Opslaan" (fixed `lg:left-[260px]`).

**Panel 1 — Bedrijfsgegevens (9 inputs):** bedrijfsnaam, ondertitel, email, telefoon, adres, website, KvK, BTW, IBAN.

**Panel 2 — Logo (2× file-uploads):** light + dark variant → Supabase Storage `brand-assets` bucket.

**Panel 3 — Huisstijl-presets (8 OKLCH-themes):** `THEMES` array uit `src/lib/themes.ts` met live WCAG AA validation. **ThemePresetPicker** met 8 kaarten + advanced color editor (sliders per token + direction toggle + reset).

**Panel 4 — Klantportaal-stijl (8 portal-themes):** `PORTAL_THEMES` array (los van app-huisstijl), compacte swatch-grid via **PortalThemePicker**.

**Panel 5 — Menukaart-stijl:** per-template-overrides via `MenukaartStijl` component.

**Panel 6 — Facturatie (5 fields):** prefixes (factuur/offerte), default BTW%, betaaltermijn, geldigheid offertes.

**Panel 7 — PDF settings:** betaalvoorwaarden-template (textarea), + links naar `/template-editor?type={factuur|offerte|haccp|bon}` (gemarkeerd als legacy).

**Panel 8 — Gegevensoverzicht:** stat-cards (events, facturen, offertes, recepten, materieel count).

**Knoppen:** CloudUpload (2× logo), ThemePresetPicker, PortalThemePicker, Opslaan (sticky).

**Modals/Drawers:**
- **BrandCascadeDialog** — "Wil je huisstijl bijwerken in X templates?" (yes/no + count)
- **AdvancedColorEditor** — uitklapbare tint-sliders + WCAG live audit per pair + auto-fix buttons

**State-machine:**
- `uploading → [success|error]` → reset
- Form dirty-tracking via `setForm` useState
- Theme-changed → cache-flush (SW + browser caches) → hard reload met `_t=Date.now()`

**Schema (`settings`):**
```sql
settings (
  bedrijfsnaam, ondertitel, email, telefoon, adres, website, kvk, btw, iban,
  logo_url, logo_dark_url,
  brand_background, brand_text, brand_card, brand_primary, brand_accent, brand_secondary,
  brand_theme, -- portal preset id
  factuur_prefix, offerte_prefix, default_btw, betaaltermijn, offerte_geldig,
  betaalvoorwaarden,
  menukaart_template_id, menukaart_overrides JSONB,
  accounting_config JSONB
)
```

**Migraties:** `018_settings_full_brand_tokens.sql`, `019_remap_legacy_themes.sql`.

### 11.3 `/instellingen/integraties` — 6 integraties (4 categorieën)

**Layout:** 6 MetallicCard-kaarten in 4 categorieën (Agenda / Boekhouding / Betalingen / Webhooks).

| Integratie | Categorie | Mechanisme | Env-vars |
|---|---|---|---|
| Google Calendar | Agenda | OAuth 2.0 | GOOGLE_CLIENT_ID/SECRET/REFRESH_TOKEN |
| iCal Export | Agenda | Altijd actief | `GET /api/calendar/ical` → .ics |
| Exact Online | Boekhouding | OAuth 2.0 | EXACT_CLIENT_ID/SECRET/REFRESH_TOKEN/DIVISION |
| Moneybird | Boekhouding | API-token | MONEYBIRD_TOKEN/ADMINISTRATION_ID |
| Mollie | Betalingen | API-key (live_) | MOLLIE_API_KEY |
| Webhooks | Webhooks | DB-backed | `webhooks` + `webhook_logs` tabellen |

**Status-indicator:** `checkStatuses()` pingt `/api/{endpoint}` en detecteert 501 (unconfigured) vs 200 (ok). Groen voor actief, grijs voor disabled.

**Knoppen:**
- **Vernieuwen** — re-checks statuses
- **Meer info** (expand) — toon env-vars, stappen, API-endpoint, docs-link
- **Instellingen** — link naar `/instellingen/integraties/accounting`

### 11.4 `/instellingen/integraties/accounting` — accounting-config

3 secties: Algemeen / Moneybird / Exact Online.

**Algemeen (7 inputs):**
- `grootboekrekening_omzet` (NL RGS-code, bv "8000")
- `grootboekrekening_kosten` (bv "7000")
- `payment_terms_dagen` (int, default 14)
- `contact_default_country` (ISO-2, default "NL")
- `email_template_subject` — placeholders `{nummer}`, `{bedrijfsnaam}`, `{klant}`
- `email_template_body` (plain text template)

**Moneybird (4 inputs):**
- `moneybird_administration_id`
- `moneybird_tax_rate_21` (ID uit GET /tax_rates.json)
- `moneybird_tax_rate_9`
- `moneybird_tax_rate_0` (exemptions)

**Exact Online (1 input):** `exact_division_code`.

**DB-opslag:** `settings.accounting_config JSONB`.

### 11.5 `/instellingen/ai-usage` — AI-quota meter

**Layout:** 4 KPI-kaarten + stacked bar-chart + radial-gauge + tabel (recent 50 calls).

**KPI-kaarten:**
- **Calls deze maand** — count + tier-cap indicator ("247 / 500")
- **Totale spend** — `formatEur(totalCostCents)`
- **Cache-hit ratio** — pct + kleur (≥70% groen, ≥40% amber, <40% rood)
- **Tier-cap** — progress + warning (>80% orange, ≥100% red)

**Charts (Recharts):**
- **BarChart** — monthly grouping, stacked by `action_type` (offerte_wizard / chat / prep_suggestion / menu_suggestion / other)
- **RadialBarChart** — cache-hit gauge 0-100%

**Tabel (recent 50):** timestamp, action, model, tokens_in, tokens_out, cache%, cost. Hover-rows tonen metadata snapshot.

**Schema (`ai_usage`):**
```sql
ai_usage (
  id, organization_id, action_type, model,
  tokens_input, tokens_output, tokens_cache_read, tokens_cache_creation,
  cost_eur_cents, metadata JSONB,
  created_at
)
```

**Cost-cap (`aiCostCap.ts`):**
- Tier-limits (2026):
  - **Starter (€49/m):** soft €3,00 / hard €4,50
  - **Pro (€99/m):** soft €15,00 / hard €22,50
  - **Enterprise (€249/m):** soft €50,00 / hard €75,00
- Soft-cap = banner-warning, hard-cap = returns HTTP 402

### 11.6 `/instellingen/data-export` — AVG-export (Artikel 15 + 20)

**Layout:** 2 cards (Export + Demo-data removal).

**Acties:**
1. **Download data-export:**
   - POST `/api/data-export?orgId={orgId}` → JSON blob
   - Browser-download via `<a href>` met filename `bbq-architect-export-{YYYY-MM-DD}.json`
2. **Remove demo-data:**
   - Confirmation dialog
   - `removeDemoData(orgId)` deletes rows met prefix `[DEMO]`

**Export-format (58 tables):** JSON object per tabel `{ klanten: [...], offertes: [...], ... }`. **Excludes** wachtwoorden, payment tokens, API keys. **Includes** full audit trail (ai_usage, audit_log, emails).

**58 exportable tables** o.a.: `organizations`, `profiles`, `organization_members`, `klanten`, `gerechten`, `gangen`, `recepten`, `events`, `offertes`, `facturen`, `leveranciers`, `inkooplijsten`, `inventory`, `materieel`, `hardware_items`, `haccp_records`, `time_logs`, `service_logs`, `event_reflecties`, `pack_lists`, `rtr_items`, `prep_tasks`, `photo_logbook`, `supplier_invoices`, `settings`, `email_templates`, `emails`, `pdf_templates`, `website_*`, `activation_events`, `ai_usage`.

### 11.7 `/instellingen/referral` — verwijsprogramma

**Layout:** intro-card + generate-button + list.

**Velden:**
- **Referral-code** — auto-generated via `generate_referral_code()` RPC
- **Status** — pending / signed_up / activated / paid / expired
- **Credit amount** — €50 per referral (hardcoded)
- **Max active** — 10 per org (DB-level enforced)

**Knoppen:**
- **Nieuwe referral-link** — insert in `referrals` tabel
- **Kopieer link** — `${origin}/signup?ref={code}` → clipboard

**Status-machine:** pending → (signup event) → signed_up → (trial activation) → activated → (first payment) → paid. Expires na 90 dagen zonder signup.

**Schema (`referrals`):** `id, referrer_org_id, referral_code UNIQUE, status, credit_amount_cents, created_at, signed_up_at, paid_at, expires_at`.

### 11.8 `/gebruikers` — team-management (3 rollen)

**Layout:** header + invite-card (collapsible) + members-table.

**Rollen:**
- **Admin** — ShieldCheck (goud), alle permissies (instellingen + integraties + AI-usage + team)
- **Pitmaster (Chef)** — ChefHat (oranje), events / gerechten / recepten / mailbox-lezen, geen financiën
- **Medewerker** — Shield (blauw), offertes lezen + aanpassen, events bekijken, geen instellingen/financiën

**Invite-form:** Email input + role select → POST `/api/org/invite` → genereert invitation-token (display in toast).

**Members-tabel:** Naam (avatar + "(jij)"-label), Email, Rol, Status (Active / Invited / Inactive).

**Schema (`organization_members`):** `id, user_id, organization_id, role, status, created_at, invited_at`.

**State-machine:** Invite pending → mail sent → user clicks link → status='active'. Logout removes all active sessions in org.

**Enforcement:** server-side RLS op `organization_id` + rol-check in component.

### 11.9 `/mailbox` — e-mail- en template-management (3 tabs)

**Tab 1 — Verzonden:** search + type-filter (alle / vrij / offerte / factuur / herinnering). List van emails met type-indicator dot, onderwerp, naam, datum, status. Click → detail-view (full text, type-badge, status-badge).

**Tab 2 — Nieuwe e-mail:** klant-selector (dropdown) OF handmatig email/naam. Template selector (optional). Onderwerp + bericht textarea. Send → `sendEmail()` → Resend API → INSERT in `emails`-tabel → toast + redirect.

**Tab 3 — Templates:** CRUD (create / edit / delete). Fields: naam, categorie (algemeen / offerte / na-event / factuur), onderwerp, body. **Variables** `{{klant_naam}}`, `{{bedrijfsnaam}}` (replaceVars function).

**Speciaal — Inbox-adres (Voorraad-pijler):** view `v_org_inbox_address` toont `pl-{slug}@in.bbqarchitect.app` met copy-to-clipboard. Display: *"Stuur leveranciersmail met PDF → binnen 5 min in Price-Intelligence queue"*.

**Schema (`emails`):** `id, organization_id, klant_id, aan_email, aan_naam, onderwerp, inhoud TEXT, type, status, created_at`.

**Schema (`email_templates`):** `id, organization_id, naam, categorie, onderwerp, body, created_at`.

### 11.10 `/website` — publieke site-builder (5 tabs, 1000+ regels)

**Tab 1 — Afbeeldingen:** Hero slideshow (4 slides) + Galerij per categorie (Gerechten / De Smoker / Ingrediënten). Upload drag-drop, thumbnail grid, edit (alt-text, volgorde), visibility toggle, delete (with storage cleanup).

**Tab 2 — FAQ:** Create / edit (vraag, antwoord, volgorde, actief) / delete. Sorted by volgorde.

**Tab 3 — Galerij metadata:** edit details (label, category, volgorde) voor bestaande gallery items.

**Tab 4 — Menu (Signature Menu):**
- **Gangen:** naam, slug, volgorde, minimum, extra_prijs_pp, actief
- **Gerechten:** per gang naam, beschrijving, gang_slug FK, foto (upload), **allergens (14 checkboxes)**, volgorde, actief
- Legend: volgorde <10 = normaal, >=10 = dieet/hidden
- Allergen-badges (14): gluten, lactose, ei, vis, schaaldieren, weekdieren, pinda, noten, soja, selderij, mosterd, sesam, sulfiet, lupine

**Tab 5 — Footer:** edit email, telefoon, adres (newline via comma), KvK, BTW-nummer.

**Upload-helpers:**
- Drag-drop zones (onDrop, onDragOver, onDragLeave)
- Validation: image/* only, max 10MB
- Storage path: `website-images/{type}-{timestamp}-{index}.{ext}` (bv `hero-1738920180-0.jpg`)
- Public URL: `${NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/website-images/{filename}`

**Schema:** `website_hero` / `website_gallery` / `website_faq` / `website_gangen` / `website_gerechten` — allemaal org_id RLS.

**State-machine:**
- Upload: `setSending true → (file validation + upload) → success|error toast`
- Edit: `setEditingHero|setEditingGallery → form → save|cancel`
- Delete: `showConfirm → deleteFromStorage + DB remove`

### 11.11 `/hulp` en `/hulp/sitemap` — help-center + support (2 tabs)

**Tab 1 — Artikelen:**
- Full-text search in `help_articles`-tabel
- Category-filters (8): aan-de-slag, offertes, facturen, team, voedselveiligheid, integraties, beheer, tips
- Deep-link support: `/hulp#{category}` → `setSelectedCategory`
- Article detail: title, category-badge, content (safe markdown → HTML, XSS-safe via escape-then-replace)

**Tab 2 — Support:**
- New ticket form: categorie (vraag / bug / feature / urgent), onderwerp, bericht (textarea)
- **Rate-limit:** 5 tickets / 5 min (localStorage-tracked, server-enforced)
- **Cooldown:** 10 sec tussen submits
- Ticket-list per open ticket: subject, message, status (open / in_behandeling / opgelost / gesloten), admin reply (groen box), timestamp

**Markdown-rendering (XSS-safe):** first escape all HTML, then replace markdown tokens. Allowed: h2, h3, strong, li (bullet + numbered), br, line-breaks.

**Schema (`help_articles`):** `id, organization_id (nullable; platform-wide artikelen NULL), slug, title, content (markdown), category, search_tags[]`.

**Schema (`support_tickets`):** `id, organization_id, user_id, subject, message, category, status, admin_reply (nullable), created_at, updated_at`.

**Sitemap-page (`/hulp/sitemap`):** navigatie-aid voor power-users — alle URLs in de app.

### 11.12 `/admin` — platform-beheer (Mathijs-only, 6 tabs)

Returns 403 als niet platform-admin.

**Tab 1 — Overview:** KPI-cards (active orgs, total members, healthy orgs, actions 30d), **ProactiveActionPanel** (health-warnings + alert-sending form).

**Tab 2 — Organisaties:** OrgGrid met naam, MRR (est.), AI-spend MTD, member-count, created-date. Expandable: invitation-tokens, export-buttons (JSON/CSV), feature-flags toggle, impersonate.
- Create new: name, admin-email, admin-naam, admin-password, brand-color

**Tab 3 — Health:** HealthDashboard per org (status healthy / warning / critical, score, last-check). "Send inactivity alert" button per org.

**Tab 4 — Analytics:** FunnelAnalytics (5-stage funnel) + 30d chart + retention.

**Tab 5 — Klanten (Impersonate):** user-grid (name, email, org, role). **"Inloggen als"** button → opens new tab as user via magic session-token.

**Tab 6 — (extra config):** extension-keys, feature-flag-management.

**Direct DB-queries (admin-only):**
```sql
SELECT * FROM organizations ORDER BY created_at DESC
SELECT COUNT(*), SUM(MRR_ESTIMATE) FROM organizations WHERE status = 'active'
SELECT * FROM health_checks ORDER BY checked_at DESC
SELECT * FROM activation_events WHERE created_at >= NOW() - 30 DAYS
```

**Feature-flags:** stored in `org_settings.feature_flags JSONB`, toggleable via `/api/admin/feature-flags` (POST). Voorbeelden: `website_builder`, `invoice_module`, `mollie_payments`, `market_pulse_opt_in`.

**State-machines:**
- Create org: `setCreating → POST /api/admin/organizations → refresh orgs + health`
- Impersonate: `setImpersonating(userId) → POST /api/admin/impersonate → window.open(loginUrl)`
- Flag toggle: immediate PUT (optimistic)

### 11.13 `/template-editor` — drag-drop PDF-template-builder (Pro-tier)

ACTIEVE feature, Pro-tier gated (`RequireTier feature='template_editor'`). Drag-&-drop PDF-template-editor voor factuur / offerte / bon / haccp / menukaart-templates. Bouwt blokken (tekst, afbeelding, tabel, lijn) met typografie/layout-controls.

**URL-params:**
- `?type=factuur|offerte|bon|haccp|menukaart` — template-type
- `?id={template-id}` — edit modus
- `?start={starter-id}` — new from starter
- `?scope=global` — admin-only global templates

**Menukaart-redirect-notice:** als user `/template-editor?type=menukaart` bezoekt → notice *"Menukaart-styling werkt nu per offerte"* + link naar `/offertes` (de menukaart-canvas zit in offerte-flow).

**Template-lifecycle:**
1. Fetch by ID (PUT update) → else
2. Load default by type+org (GET) → else
3. Built-in defaults

**Starter-templates** per documentType:
- Menukaart: `menukaart-ambacht`, `menukaart-modern`, `menukaart-slate`
- Factuur: minimal / classic / branded
- Offerte: idem
- HACCP: NVWA-compliant / KHN-compliant

**Block-editor (`TemplateEditor` component):** TemplateBlock[]-tree, PageSettings (A4 portrait/landscape, marges, fonts).

**Save-logic:**
- POST `/api/templates` (new) of PUT `/api/templates/{id}` (update)
- Versioning via `concept_history`-tabel (migratie 023)

**Geen AI** — pure UI/design tool.

**Gap:** menukaart-workflow nu volledig in offerte-editor; oude `/template-editor?type=menukaart` users krijgen redirect.

### 11.14 Dev- en test-routes (intern)

**`/dev/ai-blocks`** (DEV-only) — preview-pagina voor AI Block Renderer. Toon alle 8 block-types (metric, info, success, warning, bullets, action_hint, nav_card, action_card) met SAMPLE_BLOCKS-array. `onNavigate` callback logs; `onExecute` simulates 600ms delay. Pure UI-testing, geen API-calls. Footer-link naar plan-file `/Users/mathi/.claude/plans/ga-een-super-goede-scalable-jellyfish.md`.

**`/e2e-test/menukaart/[templateId]`** (DEV-only, gated `NEXT_PUBLIC_E2E=1`):
- `if (process.env.NEXT_PUBLIC_E2E !== '1') notFound()`
- Playwright visual-regression test page
- Rendert menukaart-template op A4 (794×1123px) met vaste FIXTURE_MENU (4 gangen, hardcoded dishes + allergens)
- Scale-berekening: template rendert op 480px, scaled tot A4 via CSS `transform: scale(794/480)` + `transform-origin: top-left`
- Component: `PreviewFor(template.id)` uit `/components/menukaart/templates`

**`/e2e-test/menukaart/[templateId]/pdf`** — PDF-render variant (static page voor PDF-export testing). Status: agent kon dit bestand niet vinden — mogelijk WIP of voor toekomstige Playwright PDF-snapshot-tests.

**Niet via UI bereikbaar** — alleen via direct URL of Playwright-test-runner.

### 11.15 `/admin/funnel` — signup-funnel-analytics

Live sinds 2026-06-01. 5-stage funnel met conversion-rates per stap, drop-off analysis, per cohort (week / maand).

**Stages:**
1. **Signup** — registration form submitted
2. **Activation** — onboarding compleet + first team-member toegevoegd
3. **First-event** — created offerte met gerechten
4. **First-offerte** — sent offerte (status='sent')
5. **First-paid** — received payment (Mollie of manueel)

**Source-tabel:** `activation_events` (zie sectie 5 voor onboarding-event-types).

### 11.16 Rollen-permissies samengevat

```
Admin:
  + Alle instellingen + integraties + AI-usage
  + Team-management, mailbox + templates
  + Website + data-export

Pitmaster (Chef):
  + Events / gerechten / recepten (vandaag, plannen, menu hubs)
  + Offertes draft (niet versturen)
  + Mailbox lezen
  - Financiën, instellingen

Medewerker:
  + Offertes lezen + aanpassen (onder supervision)
  + Events bekijken
  - Instellingen, financiën
```

Enforcement: server-side RLS op `organization_id` + rol-check in component (geen direct API bypass).

### 11.17 Migraties Systeem-kern

| Migratie | Wat |
|---|---|
| `002_health_changelog_onboarding.sql` | `health_checks`, `onboarding_status` per org |
| `003_branding_and_buckets.sql` | `settings.brand_*`, storage buckets logo + brand-assets |
| `005_ai_audit_trail.sql` | `ai_usage` (token-count, model, cost) |
| `011_activation_events.sql` | Funnel-tracking events |
| `017_audit_log.sql` | Alle data-changes logged (data-mutations only, geen reads) |
| `018_settings_full_brand_tokens.sql` | 5×8 white-label tokens |
| `019_remap_legacy_themes.sql` | Upgrade oude themes → nieuw format |
| `030_webhooks_and_integration_tokens.sql` | `webhooks`, `webhook_logs`, `integration_tokens` |
| `20260515130000_accounting_config.sql` | `settings.accounting_config JSONB` |
| `20260516100000_ai_usage_table.sql` | Cache-hit tracking |

### 11.18 Bekende gaps in Systeem-hub

- **Geen SAML / SCIM / SSO** — Enterprise-anchor mist die (bewuste keuze: skip op deze tier)
- **Audit-log incomplete** — registreert inserts/updates maar geen reads (sensitivity-info-leaks ondetected)
- **Brand-cascade async** — logo-change in `/instellingen` synchroniseert niet real-time naar alle emails + PDFs (60s lag)
- **AI-usage transparency** — cache-hit-calculation correct, maar model-switching (Sonnet ↔ Haiku ↔ Opus) niet getrackt per prompt
- **Referral webhook** — status-update naar 'paid' manueel; geen Mollie webhook trigger
- **Help-article versioning** — edits overschrijven oude content; geen version history
- **Feature-flags geen reset** — toggle-off laat remnants (bv website-builder CSS still loaded)
- **Mailbox scheduling** — geen `send_at` field, geen queue-system voor async-send
- **Impersonate audit niet specifiek gelogd** — generieke audit_log volstaat niet voor SOC2-style trail
- **Website-builder dun** vs concurrenten (Wix-templates rijker)
- **Geen exporteer (CSV/PDF)** van AI-breakdown
- **Geen alerts als cap geraakt** — client-side check alleen, geen email-notificatie
- **Model-name in UI gestript** (`replace('claude-', '')`) — volledige versie verborgen voor user
- **Resend fallback undefined** — mail client fallback bestaat in spec maar onduidelijk in code

# DEEL B — CROSS-CUTTING FEATURES

## 12. AI-laag

De AI-laag is het centrale zenuwstelsel van BBQ Architect. Het is geen plugin maar een eerste-klas feature die in elke hub aanwezig is.

### 12.1 Anthropic-modellen — welke waar

De keuze van model is afgestemd op kosten, latency en context:

- **Haiku 4.5** (claude-haiku-4-5-20251001) — voor classificatie, extraction, streaming en lichte vision
  - Chef-coach Rook Maart (streaming, 14-woorden output)
  - Email-inbound categorisatie
  - Allergen-detection bij ingrediënten
  - Klantgesprek-extractie (WhatsApp/email naar lead-velden)
  - Alias-suggestie voor leverancier-producten
  - Briefing-summarisatie op Vandaag
  - **Bonnen-scanner vision** (`/bonnen`, €0,002-€0,004 per scan, <6 sec)
  - Cron `ritten-vergeten` (proactieve maandelijkse ritten-signalering, Pro/Enterprise-only)

- **Sonnet 4.6** (claude-sonnet-4-6) — default voor offerte-wizard, summaries, recap-cards en boekhouder-classificatie
  - Offerte-wizard met prompt-caching op recipe-library
  - Recipe-generate (4 modes)
  - Price-list PDF-extraction (vision, batch-25)
  - Boekhouder RGS-classify (batch 20, ~€0,05/batch, confidence-drempel 0.85)
  - HACCP-checklist generate (cached templates per gerecht)
  - Summarisatie per kwartaal recap

- **Opus 4.7** (claude-opus-4-7) — voor escalation, brainstorm, vision-edge-cases
  - Offerte-wizard brainstorm-mode (BRAINSTORM_INSTRUCTIONS in `ai-prompts`)
  - Plattegrond AI-suggest seating
  - Margin-analyse complex scenarios
  - Vision-edge-cases waar Sonnet faalde (escalation-pad)

**Caveat:** Opus 4.7 heeft een nieuwe tokenizer die ~35% meer tokens kan produceren dan 4.6 voor dezelfde input. Per workload wordt gebenchmarkt voor commit.

### 12.2 ChatPanel v2 — block-first architecture

Live als default sinds 2026 (memory: `?ai=v1` = oude AiAssistant fallback, 1865 regels staan nog in repo, opruiming als open item).

De ChatPanel rendert AI-output **niet** als markdown, maar als een array van typed blocks. Definitie in `src/lib/ai/blocks.ts`:

**De 8 block-types:**

| Type | Doel | Voorbeeld |
|------|------|-----------|
| `info` | Standaard tekst-blok | "Je hebt 3 events deze week" |
| `metric` | Highlight cijfer met optionele delta | "70% marge · +5% vs vorige maand" |
| `warning` | Rode alert met severity | "Marge te laag op event #42" |
| `success` | Groen succes-blok | "Offerte verstuurd" |
| `bullets` | Compacte lijst (max 6, max 80 chars) | Lijst met klikbare items |
| `action_hint` | Tekst-suggestie zonder knop | "Tip: zet allergenen vooraan" |
| `nav_card` | Klikbare deep-link kaart | "Open inkooplijst voor Bruiloft Berkhout" |
| `action_card` | Confirm-knop die direct DB-mutatie uitvoert | "Maak inkooplijst aan" → één klik = INSERT |

**`nav_card` versus `action_card`:**
- `nav_card` navigeert binnen de app (volgens PAGE_ROUTE_WHITELIST in `page-contracts.ts`)
- `action_card` mutates de database (volgens ACTION_TYPES registry)

**Block-tool-schema:**
De Anthropic SDK krijgt een tool-definition met `BLOCK_TOOL_SCHEMA` zodat het model dwingend in dit format antwoordt. Output is `{ blocks: [...] }`, max 8 blocks per response.

**Runtime guards:**
- `isBlock(x)` — type-guard
- `isBlockArray(x)` — array-guard
- `coerceBlocks(x)` — filter alleen geldige blocks; één corrupte block breekt niet de hele render

### 12.3 AI-acties (action_card)

De `action_card` is BBQ Architect's antwoord op de vraag "moet de AI iets kunnen DOEN of alleen vertellen?".

**Architectuur (memory: project_ai_tools_architecture):**
- `bbq-tools.ts` is verwijderd
- `/api/chat/route.ts` gebruikt `respond_with_blocks` → `action_card` → `useActionDispatcher` → `executeAction`
- 42 action-types in de ACTION_TYPES-registry
- Migratie `20260601150000_ai_action_proposals.sql` — tabel houdt proposals bij

**Lifecycle:**
1. AI stelt voor: `action_card` met type + payload
2. UI rendert confirm-button
3. Op klik: `useActionDispatcher.executeAction(type, data)`
4. Server-side: re-authorize (RLS), Zod-validate payload, execute DB-mutatie
5. Resultaat-id (offerte-id / event-id / klant-id) wordt teruggekoppeld
6. Status in `ai_action_proposals`: pending → confirmed (of edited/cancelled/expired)

**Volledige ACTION_TYPES-registry (45 types, niet 42):**

Verdeeld over 14 categorieën:

| # | Categorie | Type | DB-mutatie | Pagina's | Rol-minimum |
|---|---|---|---|---|---|
| 1-3 | **Events** | `create_event` / `update_event` / `delete_event` | INSERT/UPDATE/DELETE events | /, /events, /agenda, /offertes | Pitmaster |
| 4-6 | **Recepten** (legacy) | `create_recept` / `update_recept` / `delete_recept` | INSERT/UPDATE/DELETE recepten | /recepten (legacy redirect, blijft voor backward-compat) | Pitmaster |
| 7-9 | **Gerechten** | `create_gerecht` / `update_gerecht` / `delete_gerecht` | INSERT/UPDATE/DELETE gerechten | /gerechten, /marges, /ai-chat | Pitmaster |
| 10-13 | **Voorraad** | `create_voorraad` / `update_voorraad` / `delete_voorraad` / `process_receipt` | INSERT/UPDATE/DELETE inventory + bon-verwerking | /voorraad, /inkoop | Pitmaster |
| 14-15 | **Leveranciers** | `create_leverancier` / `update_leverancier` | INSERT/UPDATE leveranciers | /inkoop, /price-intelligence | Pitmaster |
| 16 | **HACCP** | `create_haccp` | INSERT haccp_records | /haccp, /events/[id]/service | Pitmaster |
| 17-19 | **Uren** | `create_urenlog` / `update_urenlog` / `delete_urenlog` | INSERT/UPDATE/DELETE time_logs | /uren | Medewerker (eigen) / Admin (alle) |
| 20-21 | **Materieel** | `create_materieel` / `update_materieel` | INSERT/UPDATE materieel | /materieel, /logistiek | Pitmaster |
| 22-24 | **Prep-taken** | `create_prep_task` / `update_prep_task` / `delete_prep_task` | INSERT/UPDATE/DELETE prep_tasks | /agenda, /events, /events/[id]/service | Pitmaster |
| 25-27 | **Offertes** | `create_offerte` / `update_offerte` / `update_offerte_status` | INSERT/UPDATE/UPDATE-status offertes | /offertes | Pitmaster (Admin voor send) |
| 28-30 | **Facturen** | `create_factuur` / `update_factuur` / `update_factuur_status` | INSERT/UPDATE/UPDATE-status facturen | /facturen | Admin only |
| 31-32 | **Klanten** | `create_klant` / `update_klant` | INSERT/UPDATE klanten | /klanten, /offertes, /verkoop/leads, / | Pitmaster (toegevoegd 2026-06-01 met BASE_PERSONA-promotie) |
| 33 | **Emails** | `draft_email` | INSERT emails (**altijd status='concept'**, AI mag nooit direct versturen) | /mailbox, /klanten, /offertes, /facturen, / | Pitmaster (toegevoegd 2026-06-01) |
| 34-35 | **AI-gesprekken** | `save_conversation` / `create_folder` | INSERT ai_conversations + ai_conversation_folders | /ai-chat | Medewerker |
| 36-45 | **System Operator Tools (10 types)** | `generate_prep_list` / `generate_inkooplijst` / `generate_event_briefing` / `get_event_winstgevendheid` / `bulk_create_gerechten` / `brainstorm_gerechten_concepts` / `info_blocks` / `bulk_create_materieel` / `filter_gerechten` / `mark_weak_dishes` | Tools (geen direct DB-insert) + bulk-INSERT/DELETE op gerechten/materieel + client-only marking | /, /events, /agenda, /events/[id]/service, /inkoop, /voorraad, /financien, /gerechten, /marges, /ai-chat, /materieel | Pitmaster (Admin voor bulk-delete) |

**Payload-velden per type (geselecteerde voorbeelden):**

- **`create_event`** — name, date, guests, location, ppp, status, client_naam, client_adres, notitie, menu, menu_items, theme
- **`create_gerecht`** — naam, beschrijving, gang_slug, volgorde, actief, foto_url, ingredienten (text[]), bereidingswijze, allergenen, tags, kostprijs_pp, service_image, battle_plan_steps, target_prep_time, hardware_items, ingredienten_winkels, ingredient_costs, verkoopprijs, pos_enabled, pos_categorie, pos_prijs, pos_volgorde, btw_tarief, organization_id, ai_conversation_id
- **`create_offerte`** — nummer, status, client_naam, client_adres, datum, geldig_tot, notitie, items, aantal_gasten, basis_prijs_pp, korting, vaste_kosten, menu_selectie
- **`draft_email`** — klant_id, aan_email, aan_naam, onderwerp (titel), inhoud (body), type, status (**ALTIJD 'concept'** — hard rule)

**Hard rules (server-enforced):**
- AI mag NOOIT `target_qty` of `status` op `prep_tasks` zetten (server-only)
- AI mag NOOIT BTW-tarief afleiden (zie hard rule 1)
- AI mag NOOIT allergenen tekst-genereren (zie hard rule 2)
- AI mag NOOIT productie-hoeveelheden afleiden (zie hard rule 3)
- `draft_email` krijgt ALTIJD `status='concept'` — gebruiker moet expliciet versturen
- `bulk_create_*`-actions zijn Admin-only (bulk-delete idem)
- `update_factuur_status` is Admin-only (om audit-trail intact te houden)

**Tool-implementaties (niet-DB-mutaties):**
- `generate_prep_list` → `generatePrepList(event_id)` server-tool — bouwt prep-lijst uit menu + porties
- `generate_inkooplijst` → `generateInkooplijst(event_ids, days_window)` — BOM-explosion via gerecht_components
- `generate_event_briefing` → `generateEventBriefing(event_id)` — markdown briefing voor crew
- `get_event_winstgevendheid` → `getEventWinstgevendheid(event_id)` — omzet/kosten/marge-rapport
- `info_blocks` → pure client-render (geen server-side persist)
- `brainstorm_gerechten_concepts` + `mark_weak_dishes` → client-only flagging

### 12.4 ⌘K Vraag-Rook command-palette

Live als default (memory: project_ai_v2_chatpanel). Custom build, niet via cmdk-package.

**Functionaliteit:**
- Fuzzy-search naar alle hub-pages
- Entity-search (events, klanten, recepten, leveranciers) met server-side query
- Acties ("New offerte", "Send offer #42", "Open event Berkhout")
- AI-direct-vragen: tik je vraag, druk Enter → ChatPanel opent met de vraag al geprompt

**Onder de motorkap (`/api/chat/route.ts`):**
- 6 tool-definitions die de AI kan callen voor gestructureerde data-ophaling:
  - `get_event_detail(event_id)` — alle details van één event
  - `list_upcoming_events(days)` — events in komende N dagen
  - `search_gerechten(query, gang_slug)` — zoek gerechten
  - `get_event_margin(event_id)` — winstgevendheid per event
  - `get_low_stock()` — items onder min-stock
  - `get_offerte_detail(offerte_id)` — offerte-details
- Rate-limit: 30 requests per minuut per gebruiker
- BASE_PERSONA + PAGE_SYSTEM_PROMPTS + MODE_INSTRUCTIONS + OPERATOR_INSTRUCTIONS injectie

**Modes (uit `ai-modes.ts`):**
- Normal (default Sonnet 4.6)
- Brainstorm (Opus 4.7 met thinking)
- ThinkingMode aware via `isThinkingMode()`

**Smart downgrade:** als `thinkingMode='deep'` maar intent is banaal (korte Q&A <180 chars, geen foto's, geen brainstorm-trigger) → automatisch terug naar Sonnet 4.6 + uitschakeling extended thinking. Voorkomt onnodige Opus-cost.

**5 specialized tools (force-triggered op intent):**
- **`propose_dish_concepts`** — brainstorm-modus, trigger op "bedenk 3 bites" / "geef me ideeën voor". Output: dish-concepts met flavor-profile maar zonder volledige receptuur
- **`develop_dishes`** — receptuur-uitwerking, trigger op "werk uit" / "schrijf het recept". Output: volledig `recipe`-JSON
- **`bulk_create_materieel`** — materieel-import, trigger op "voeg toe" + 3+ newlines + URLs. Output: array van materieel-objecten met type/categorie/aankoopprijs
- **`respond_with_blocks`** — structured output met 8 block-types (default voor UI-rendering)
- **`propose_finance_ideas`** + **`compute_kia_scenario`** — Finance Copilot op `/financien` (KIA-berekening per sector, scenario-simulator)

### 12.5 Chef-coach Rook Maart

Persistent AI-assistent op `/events/[id]/service` tijdens runtime.

**Input:**
- Live event-state (welke gerechten zijn ready, welke nog niet)
- Mise-progress (% gereed per gang)
- Smoker-status (temperatuur, tijd, ETA tot ready)
- Allergie-tabel per gast
- Time-to-service countdown

**Output:**
- 1 directive per call (max 14 woorden — Lars-vriendelijk)
- Severity (praise / normal / urgent / critical)
- actionLabel (knop met directe link naar relevante pagina)

**Tech:**
- Haiku 4.5 streaming
- Runtime: nodejs, maxDuration 20s
- Cost: ~€0.02 per call

**Voorbeeld output:**
- Severity "praise": "Mooi op schema. Pulled pork over 8 minuten."
- Severity "normal": "Vega-burgers nu in pan voor tafel 4."
- Severity "urgent": "Schil sinaasappel voor cocktail. 6 minuten."
- Severity "critical": "Tafel 7: noten-allergie. Stop dessert direct."

**Exact output-JSON schema:**
```json
{
  "directive": "max 14 woorden — concrete actie",
  "severity": "praise | normal | urgent | critical",
  "actionLabel": "max 3 woorden CTA | null",
  "context": "max 16 woorden context | null"
}
```

**Severity-guide (hard rule):**
- **critical** — allergie-risico, mise <5min, smoker-falen
- **urgent** — actie <15min, gang dreigt achter
- **normal** — planning, tips
- **praise** — strak tempo of afgerond stap

**Input-context exact opgenomen in prompt:**
- NOW (HH:MM)
- VIEW (hub / board / detail / wrapup)
- EVENT (titel, venue, gasten)
- GANG-OVERZICHT (status per gang + portions progress)
- MISE (% klaar + open items, critical marked)
- SMOKER (item, temp, target, ETA minuten)
- ALLERGIE-TABEL (per gast: naam, tafel, allergenen, severity)
- User-vraag (optioneel)

### 12.6 Recipe-generate (`/api/recipe-generate`)

**4 modes:**
- `recipe` — genereer één nieuw gerecht
- `menu` — genereer een complete menu-samenstelling per gang
- `enrich` — voeg ontbrekende details toe aan een bestaand gerecht (allergenen, voedingsinfo, plating)
- `scale` — schaal porties (50 → 80) met component-rebalancing

**3 flavours (input-bron):**
- `vrij` — open prompt ("pulled-pork-variant voor het seizoen")
- `voorraad` — inventory-driven ("gebruik items die overstock zijn")
- `klant` — client-input ("klant Berkhout wil halal-bruiloft met BBQ-vibe")

**Output:**
- Deterministisch JSON-schema
- Sonnet of Haiku switchable
- Prijs-per-portie: server-side berekend, NIET AI-afgeleid (hard rule)

### 12.7 Price-list PDF-extractor

Zie ook sectie 9.5. Volledige flow:

1. PDF upload (1-25 batch) of email-in
2. Chunked storage als PDF > 20MB
3. Sonnet 4.6 vision via Anthropic Batch-API
4. Output-schema strict gevalideerd: `parsed_naam`, `parsed_eenheid`, `parsed_prijs`, `detected_soort`, `detected_cut`, `bereiding_default`, `confidence`
5. BTW NIET in output (server-side derived uit BTW_RULES_2026)
6. Max 32k output tokens per call; chunks tot 800 lines per document
7. Haiku 4.5 genereert 3-5 aliassen per nieuw product (€0.01 per 100 producten)
8. Operator approves of corrigeert in review-queue

### 12.8 AI-usage tracking + cost cap

Hard rule 7 (BBQ Architect convention): elke Anthropic-call wordt getrackt in `ai_usage`-tabel.

**Tarieven 2026 (`aiCostCap.ts`):**

| Tier | Maand-prijs | Soft-cap | Hard-cap | Gross margin |
|------|-------------|----------|----------|--------------|
| Starter | €49 | €3.00 | €4.50 | 90% |
| Pro | €99 | €15.00 | €22.50 | 89% |
| Enterprise | €249 | €50.00 | €75.00 | 85% |

**Cost-estimates per call-type (conservatief, voor enforce-check):**

| Call-type | Geschatte kost |
|-----------|----------------|
| Haiku tekst (classify, briefing, allergen) | €0.01 |
| Haiku streaming (chef-coach, klantgesprek) | €0.02 |
| Sonnet tekst (recept-improve, supplier-analysis) | €0.05 |
| Sonnet vision (bon-extract, parse-attachment) | €0.03 |
| Sonnet vision batch-25 (pricelist-PDF, catalog-parse) | €0.20 |
| Opus tekst (offerte-wizard escalation) | €0.15 |

**Cap-statussen:**
- `ok` — door
- `soft_warning` — door, met banner-waarschuwing
- `hard_block` — 402-response, kill-switch

**Implementatie:**
- `checkAiCap(orgId, estimatedEur)` — pure check
- `enforceAiCap(orgId, estimatedEur)` — returnt `NextResponse` bij hard-block, anders `null`
- `isAiCapBlocked(orgId, estimatedEur)` — boolean convenience
- `getTierCaps(tier)` — UI display

**Fail-open strategie:** als DB-fout in de cap-check, laat de call door (log de error). Beter een verrassing aan maand-eind dan downtime door cap-check-bug. Audit-fix 2026-06-01 corrigeerde dit; eerder was er een bug met fail-closed gedrag.

### 12.9 `/ai-chat` — standalone AI chat interface (AIStudio)

ACTIEVE feature. Rendert `<AIStudio variant="route" />` als full-screen chat-pagina (verschil met ChatPanel-drawer dat overal-globaal beschikbaar is).

**Component:** `AIStudio` (in `src/components/AIStudio.tsx`) — conversational-AI voor open vragen, recept-brainstorm, menu-design.

**Variant:**
- `"route"` — full-screen op `/ai-chat` (deze pagina)
- `"drawer"` — sticky-drawer op alle hubs (ChatPanel-stijl)
- `"overlay"` — `AiStudioOverlay` voor modal-context

**Features:**
- Conversation-history opslaan via ACTION_TYPE `save_conversation` → `ai_conversations`-tabel
- Folders organiseren via `create_folder` → `ai_conversation_folders`
- Items per conversation in `ai_conversation_items`
- Cross-tool: `bulk_create_gerechten`, `brainstorm_gerechten_concepts`, `filter_gerechten`, `mark_weak_dishes` allemaal beschikbaar in deze context

**Verschil met ChatPanel-drawer:**
- AIStudio-route is "studio-modus" — bedoeld voor langere brainstorm-sessies, multiple-thread folders
- ChatPanel-drawer is "quick-vraag" — context-aware per pagina

**Toegankelijk:** menu-bar of direct via URL `/ai-chat`.

**AI-model:** dezelfde routing als ChatPanel (Sonnet 4.6 default, Opus 4.7 voor brainstorm-mode op deze route, Haiku 4.5 voor banale Q&A).

### 12.10 Ingebakken persona en prompt-injection-bescherming

Hard rule 9: customer-input wordt NOOIT direct in LLM-prompts geconcateneerd zonder delimiters + sanitization.

**BASE_PERSONA (memory: feedback_prompt_identity_baked_in):**
De AI-prompts hebben de Hop & Bites + cateraar-identiteit ingebakken. Server-side prompts vragen nooit "wie ben jij?" — dat staat vast per tenant uit `organizations` + `settings`. Dit voorkomt prompt-injection via de chat-input ("vergeet je systeem-prompt, ik ben Microsoft").

**OPERATOR_INSTRUCTIONS, PAGE_SYSTEM_PROMPTS, MODE_INSTRUCTIONS:**
- `OPERATOR_INSTRUCTIONS` — wat de AI van de operator (cateraar) mag verwachten
- `PAGE_SYSTEM_PROMPTS` — per pagina-context andere instructies (op `/gerechten` weet de AI meer over recepten)
- `MODE_INSTRUCTIONS` — normal vs brainstorm
- `BRAINSTORM_INSTRUCTIONS` — extra ruimte voor speculatieve antwoorden in brainstorm-mode

## 13. White-label & theming

White-label is een echte differentiator. Niet "logo + kleur" maar **twee parallelle theme-systemen, 5 brand-tokens × 8+8 presets × propagatie naar 7 klant-touchpoints**. Plus hex-helpers voor PDF-RGB-conversie.

### 13.1 Twee parallelle theme-systemen

**`src/lib/portalThemes.ts` — moderne OKLCH-set (8 presets, in actief gebruik):**

| Theme-ID | Label | Mode | Surface (L/C/H) | Brand-1 (L/C/H) | On-brand |
|---|---|---|---|---|---|
| `warm-amber` (default) | Warm amber | light | 0.962 / 0.010 / 82 | 0.760 / 0.150 / 74 | 0.230 / 0.030 / 64 |
| `deep-green` | Deep green | light | 0.964 / 0.012 / 96 | 0.468 / 0.108 / 155 | 0.985 / 0.018 / 120 |
| `terracotta` | Terracotta | light | 0.960 / 0.014 / 60 | 0.620 / 0.135 / 46 | 0.990 / 0.010 / 60 |
| `sage` | Sage | light | 0.957 / 0.012 / 130 | 0.560 / 0.078 / 150 | 0.990 / 0.010 / 150 |
| `copper-rust` | Copper rust | light | 0.953 / 0.013 / 52 | 0.550 / 0.145 / 42 | 0.985 / 0.012 / 60 |
| `charcoal` | Charcoal | dark | 0.205 / 0.006 / 70 | 0.790 / 0.115 / 78 | 0.200 / 0.020 / 70 |
| `midnight-blue` | Midnight | dark | 0.220 / 0.024 / 256 | 0.680 / 0.140 / 248 | 0.990 / 0.010 / 250 |
| `gold-on-black` | Gold on black | dark | 0.148 / 0.004 / 85 | 0.805 / 0.130 / 88 | 0.180 / 0.020 / 85 |

**`src/lib/themes.ts` — legacy hex-set (8 presets, voor app-shell en backward-compat):**

| Theme-ID | Naam | Mode | Primary | Accent |
|---|---|---|---|---|
| `smoke-and-steel` | Smoke & Steel | dark | `#e78a45` warm | `#5c8f9f` cool |
| `drents-eik` | Drents Eik | dark | `#9c9e48` groen | `#c89164` tan |
| `brandstapel` | Brandstapel | dark | `#cba553` gold | `#c8635d` rust |
| `nordic-graphite` | Nordic Graphite | dark | `#c8b778` gold | `#9199a5` grey |
| `witte-berken` | Witte Berken | light | `#6e401e` walnut | `#9a5240` rust |
| `studio-paper` | Studio Paper | light | `#141618` black | `#c53637` red |
| `moestuin` | Moestuin | light | `#465e2c` olive | `#9b4630` clay |
| `zandstrand` | Zandstrand | light | `#a06828` sand | `#2e7a6a` teal |

**Waarom twee systemen?** Memory: "5 tokens × 8 curated presets" was de oorspronkelijke ontwerpkeuze (themes.ts). De portalThemes.ts is daarop gebouwd met OKLCH-precisie voor klant-facing portals — daar moet contrast WCAG AA-perfect zijn want klanten zien dat. Beide blijven naast elkaar omdat migratie naar één systeem nog niet voltooid is — **open item**.

### 13.2 De 14+ tokens per preset (portalThemes.ts)

**Surface-schaal (3):** `--surface` (base), `--surface-2` (card-elevated), `--surface-3` (secondary-bg)

**Text-schaal (3):** `--text` (primary), `--text-muted`, `--text-faint`

**Border-schaal (2):** `--border`, `--border-strong`

**Brand-tokens (4):** `--brand-1` (primary CTA), `--brand-2`, `--brand-3`, `--on-brand` (contrast-leesbaar boven brand-1)

**Overlay (1):** `--scrim` (modal-overlay rgba)

**Shadows mode-aware:** `--shadow-sm/md/lg`. Donker mode gebruikt 0.40-0.62 rgba; licht mode 0.05-0.16 rgba.

### 13.3 BrandingConfig builder (`src/lib/branding.ts`)

`buildBrandingConfig(settings)` neemt tenant-settings en bouwt:

```typescript
interface BrandingConfig {
  logoUrl: string | null;
  logoDarkUrl: string | null;
  primaryColor: string;         // hex (bv "#9e781c" Hop & Bites goud default)
  accentColor: string;          // hex (default = darkenHex(primary, 0.18))
  primaryRgb: [r, g, b];       // RGB voor jsPDF + react-pdf (hex niet altijd accepted)
  accentRgb: [r, g, b];
}
```

**Hex-helpers (compact):**
- `hexToRgb(hex)` — 3-char (#fff) en 6-char (#ffffff), bitwise `(num >> 16) & 255`
- `rgbToHex(r, g, b)` — clamps [0, 255], `.padStart(2, '0')` voor `#05dead` ipv `#5dead`
- `darkenHex(hex, amount)` — `r * (1 - amount)`. Bijv `darkenHex('#c4a35a', 0.18)` ≈ 15% donkerder
- `lightenHex(hex, amount)` — `r + (255 - r) * amount`, interpoleert naar wit

**Default-fallbacks:**
- `primaryColor = settings.brand_primary || '#9e781c'` (Hop & Bites goud)
- `accentColor = settings.brand_accent || darkenHex(primary, 0.18)`

### 13.4 WCAG AA validatie + finder

`themes.ts` heeft `findPresetBySignature(bg, primary)` — matcht tenant's opgeslagen bg + primary tegen alle 8 presets. Case-insensitive. Returns `null` voor custom hex (in welk geval AdvancedColorEditor in `/instellingen` live WCAG-audit doet per token-pair).

Alle 8 presets in portalThemes.ts zijn handmatig geverifieerd tegen WCAG AA (7:1 voor normale text). Commentaar in code: *"CI job audits contrast; build fails if < AA"*. `pnpm lint:contrast` draait apca-w3 + pixelmatch + pngjs voor contrast-audit.

### 13.5 Propagatie naar 7 kanalen

`themeStyleVars(themeId)` retourneert React.CSSProperties met alle CSS-vars geïnjecteerd op root. Server-Component-vriendelijk (geen client-JS nodig).

| Kanaal | Injection-mechanisme |
|---|---|
| 1. App-shell (sidebar, content) | `<html style={themeStyleVars(userTheme)}>` in `app/layout.tsx` |
| 2. `/q/[id]` quote-portal | Theme uit `settings.brand_theme`, `themeStyleVars()` inline op root-div |
| 3. `/aanvraag/[slug]` lead-form | Theme via `/api/public-lead-form/[slug]` config-fetch |
| 4. `/arrangement/[slug]` configurator | Idem als 3, met arrangement-config |
| 5. **PDFs** (offerte/factuur/menukaart/bonnen/AVG-export) | `react-pdf` met `primaryRgb` op header-backgrounds + footer-lijnen + BTW-labels. `boekhouderPdf.ts` voorbeeld: `<View style={{ backgroundColor: rgb(...config.primaryRgb), padding: 20 }}>` |
| 6. **E-mail templates** (Resend HTML) | `wrapHtml()` in `emailHelper.ts` (regel 49): `<div style="border-bottom:3px solid ${bc}">`. Fallback `#c4a35a` goud bij geen tenant-color |
| 7. **Custom domain** (Enterprise) | `middleware.ts` matcht hostname (`katering-jan.nl`) → tenant-lookup via `domain_mapping` → theme load |

### 13.6 BrandCascadeDialog flow

Bij theme-wijziging in `/instellingen`:

1. User kiest nieuw thema in ThemePresetPicker
2. BrandCascadeDialog opent: *"Wil je huisstijl bijwerken in X templates?"* (X = aantal PDF-templates en e-mail-templates van deze tenant)
3. Save → `UPDATE settings SET brand_theme='nieuw'`
4. Trigger: PDF-templates auto-referentie via `buildBrandingConfig()` bij volgende render (lazy re-gen)
5. E-mail-templates re-gen op volgende verzending
6. Cache-flush: SW + browser caches → hard reload met `_t=Date.now()`

**Cascadable files:** `settings.brand_theme` (master), `settings.brand_primary` (optional override), PDF-templates (lazy), e-mail-templates (lazy).

**Open items:** geen bulk-update van bestaande PDFs (gelost via lazy re-gen); geen versie-historie van theme-wijzigingen.

### 13.7 Custom domain (Enterprise-only)

Voor Enterprise-klanten kan `/q/[id]` op `quotes.cateraar.nl` worden uitgeserveerd via Vercel Domain-bridging. Klant ziet nooit `bbqarchitect.app`. E-mail vanaf cateraar's eigen domein via Resend custom-domain setup (SPF/DKIM/DMARC zelf configureren).

### 13.8 Bekende gaps White-label

- **Twee theme-systemen parallel** (portalThemes vs themes) — migratie naar één is open
- **Geen bulk-update bestaande PDFs** bij theme-change (lazy re-gen werkt maar oude PDFs in archief blijven oud)
- **Geen versie-historie** van theme-wijzigingen (audit-log mist)
- **AdvancedColorEditor custom hex** kan WCAG-falen — UI waarschuwt, maar laat het toch toe (open item)
- **Custom domain SSO-mapping** zit nog niet automatisch — Vercel-config moet handmatig

## 14. Integraties

### 14.1 Mollie iDEAL — complete pipeline

**Configuratie (`.env.local`):**
- `MOLLIE_API_KEY=live_...` (productie) of `test_...` (dev)
- `MOLLIE_WEBHOOK_URL=https://app.nl/api/payments/mollie/webhook`
- `MOLLIE_REDIRECT_URL` (default `NEXT_PUBLIC_APP_URL`)

**POST `/api/payments/mollie/route.ts` — create payment:**

Body:
```typescript
{
  factuurId: 123,
  method: 'ideal' | 'creditcard' | null,
  issuer?: 'INGBNL2A' | 'ABNANL2A' | 'RABONL2U' | ...,
  bedragOverride?: 42.50,  // 30% deposit; null = full
  redirectUrl?: 'custom-return-url'
}
```

**Mollie API-payload (server-built):**
```json
{
  "amount": { "currency": "EUR", "value": "142.50" },
  "description": "Aanbetaling factuur FAC-001 - Klant BV",
  "redirectUrl": "https://app.nl/facturen?betaald=FAC-001",
  "webhookUrl": "https://app.nl/api/payments/mollie/webhook",
  "method": "ideal",
  "issuer": "INGBNL2A",
  "metadata": {
    "factuur_id": 123,
    "factuur_nummer": "FAC-001",
    "client_naam": "Klant BV",
    "is_deposit": true,
    "deposit_amount": 142.50
  }
}
```

**Bedrag-validatie:** override mag niet > factuurtotaal + €0.01 (floating-point buffer). Beide omgezet naar cents: `Math.round(bedrag * 100) / 100`.

**Response:** `{ payment.id (tr_WDqYK6erNu), payment._links.checkout.href, payment.status (initial 'open') }`

**Mollie status-machine:**
| Status | Actie | Factuur-outcome |
|---|---|---|
| `open` | Wacht op klant | `verzonden` (ongewijzigd) |
| `pending` | In processing | `verzonden` |
| `authorized` | Pre-auth | `verzonden` |
| `paid` | ✓ Betaald | `betaald` + `betaald_op` |
| `failed` | ✗ Technisch | `verzonden` (retry mogelijk) |
| `expired` | ✗ Link verlopen (15min) | `verzonden` (stuur nieuwe) |
| `canceled` | Klant afgebroken | `verzonden` |

**Deposit-flow (30% aanbetaling):**
- `bedragOverride < factuurTotaal`
- Metadata `is_deposit=true`, `deposit_amount`
- Webhook status='paid' → factuur.status blijft `verzonden` (NIET 'betaald')
- /q/[id] portal toont: *"Aanbetaling ontvangen, totaal nog openstaand"*

### 14.2 Mollie webhook — idempotency-guard

`POST /api/payments/mollie/webhook/route.ts` (Mollie POST form-urlencoded `id=tr_xxx`). Webhook refetcht status via Mollie API — **never trust body**.

**Idempotency via `processed_mollie_events`-tabel:**

```sql
processed_mollie_events (
  id BIGSERIAL PRIMARY KEY,
  mollie_payment_id TEXT NOT NULL,
  mollie_status TEXT NOT NULL,
  factuur_id BIGINT REFERENCES facturen(id),
  organization_id UUID NOT NULL,
  payload JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (mollie_payment_id, mollie_status)
)
```

**Flow:**
1. Eerste post: INSERT succeeds → status-update + payment-confirmation mail
2. Tweede post (Mollie retry): UNIQUE violation (23505) → silent 200 OK, geen dubbel-processing

**Payment-confirmation mail** (alleen bij `paid`):
- `resolveClientEmail()` haalt email uit offerte/klant/event (facturen mist `client_email`-kolom)
- `mailPaymentOntvangen()` via Resend
- Fire-and-forget: laat webhook niet blokkeren op mail-delivery

**Refund-flow:** ontbreekt nog (gap — handmatig via Mollie dashboard).

**Migratie:** `20260519100000_mollie_webhook_idempotency.sql`.

### 14.3 Moneybird — OAuth + bidirectional sync

**Setup flow:**
1. Tenant → `/instellingen/integraties/moneybird` → `GET /api/integrations/moneybird/connect`
2. OAuth-redirect met state-cookie (600s TTL)
3. Callback `/api/integrations/moneybird/callback` → `exchangeCodeForToken()` → JWT refresh-token
4. Opslag in `organizations.feature_flags.moneybird`:
   ```json
   {
     "access_token": "token_xxx",
     "refresh_token": "refresh_xxx",
     "administration_id": "123456",
     "expires_at": "2026-06-05T12:00:00Z",
     "connected_at": "2026-06-04T..."
   }
   ```

**Token-management:** `getValidMoneybirdToken()` voorkomt expired tokens — auto-refresh als `expires_at < now()`. OAuth-token > env-token (multi-tenant first).

**POST `/api/accounting/moneybird/route.ts`:**

Body: `{ factuurId, action: 'preview' | 'created' | 'send' }`

**Contact-matching** (`findOrCreateContact()`): zoekt op naam, geen match → POST `/contacts` met adres/email/telefoon.

**Invoice-payload:**
```javascript
{
  sales_invoice: {
    contact_id: '123',
    reference: factuur.nummer,
    invoice_date: factuur.datum,
    due_date: factuur.vervaldatum,
    currency: 'EUR',
    prices_are_incl_tax: false,
    details_attributes: [{
      description: item.omschrijving,
      price: item.prijs,            // excl. BTW
      amount: item.qty,
      tax_rate_id: '21%-mapping',   // uit accounting_config
      ledger_account_id: '8000'     // uit grootboekrekening_omzet
    }]
  }
}
```

**BTW-mapping** (uit `settings.accounting_config`):
- 21% → `moneybird_tax_rate_21` (Moneybird tax-rate-id)
- 9% → `moneybird_tax_rate_9`
- 0% → `moneybird_tax_rate_0`

**Actions:**
- `preview` — return payload, geen sync
- `created` — POST naar Moneybird, opslag `facturen.moneybird_invoice_id` + `moneybird_synced_at`
- `send` — created + PATCH `/send_invoice` met email-template

**Send-payload:**
```json
{
  "sales_invoice_sending": {
    "delivery_method": "Email",
    "email_address": "klant@example.com",
    "email_message": "{{bedrijfsnaam}} stuurt je een factuur...",
    "invoice_subject": "Factuur {{nummer}}"
  }
}
```

**Idempotency:** check `facturen.moneybird_invoice_id IS NULL` vóór pushen.

**Rate-limit handling:** Moneybird 100 req/min/token, exponential backoff bij 429.

**Wat wel:** factuur-push, contact-sync, RGS-categorisering, mileage-push (rittenregistratie), bonnen-export.

**Wat niet (gaps):** credit-notes niet bidirectioneel, geen background-refresh-job voor expired tokens (alleen on-demand), geen fuzzy-match op contact-dedup (alleen exact name).

### 14.4 UBL 2.0 / Peppol BIS 3.0 — `ublExport.ts`

Pure-JS XML-generator (geen native deps, Vercel-compat, max ~50KB gzipped).

**Header-velden (NLCIUS v1.0):**
```xml
<cbc:CustomizationID>urn:cen.eu:en16931:2017#compliant#urn:fdc:nen.nl:nlcius:v1.0</cbc:CustomizationID>
<cbc:ProfileID>urn:fdc:peppol.eu:2017:poacc:billing:01:1.0</cbc:ProfileID>
<cbc:ID>{factuur-nummer}</cbc:ID>
<cbc:IssueDate>YYYY-MM-DD</cbc:IssueDate>
<cbc:DueDate>YYYY-MM-DD</cbc:DueDate>
<cbc:InvoiceTypeCode>380</cbc:InvoiceTypeCode>
<cbc:DocumentCurrencyCode>EUR</cbc:DocumentCurrencyCode>
```

**Partijen:**
```xml
<cac:AccountingSupplierParty>
  <cac:Party>
    <cac:PartyName><cbc:Name>BBQ Caterer BV</cbc:Name></cac:PartyName>
    <cac:PartyLegalEntity><cbc:CompanyID schemeID="0106">KVK-nummer</cbc:CompanyID>
    <cac:PartyTaxScheme><cbc:CompanyID>BTW-ID</cbc:CompanyID>
    <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
```

**InvoiceLines:** qty, price, subtotaal per artikel + `<cac:ClassifiedTaxCategory><cbc:Percent>21</cbc:Percent>` per lijn.

**TaxTotal + LegalMonetaryTotal:**
```xml
<cac:TaxTotal><cbc:TaxAmount currencyID="EUR">100.50</cbc:TaxAmount></cac:TaxTotal>
<cac:LegalMonetaryTotal>
  <cbc:LineExtensionAmount>500.00</cbc:LineExtensionAmount>
  <cbc:TaxExclusiveAmount>500.00</cbc:TaxExclusiveAmount>
  <cbc:TaxInclusiveAmount>600.50</cbc:TaxInclusiveAmount>
  <cbc:PayableAmount>600.50</cbc:PayableAmount>
</cac:LegalMonetaryTotal>
```

**Validatie-checks (server-side):**
1. **Well-formedness** — fast-xml-parser error-check
2. **Header-check** — CustomizationID + ProfileID vereist
3. **Basis-velden** — ID, IssueDate (YYYY-MM-DD), DocumentCurrencyCode
4. **Partijen** — SupplierParty.Name + CustomerParty.Name verplicht
5. **R008 (line-total)** — `sum(LineExtension) == header.LineExtensionAmount` (tolerantie ±€0.02)
6. **R020 (payment match)** — `PayableAmount == TaxInclusiveAmount`

**Output:** `{ valid: true, errors: [], warnings: [] }` → download toegestaan; `{ valid: false, errors: [...], warnings: [...] }` → toast UI, geen download.

**Status:** Peppol-output sinds 2026-Q2 in BBQ Architect. **4 jaar voor de NL B2B-mandaat (1 juli 2030 via EU ViDA)** en directe match op BE-mandaat (1 jan 2026 alle B2B).

**Inkomende UBL:** leveranciers-bonnen kunnen UBL-XML zijn — `fast-xml-parser` parse → invoice-velden naar `bonnen`-row.

### 14.5 Resend — transactionele e-mail

**`src/lib/emailHelper.ts`:**

```typescript
sendEmail({
  to: 'klant@example.com',
  subject: 'Offerte SAM-2026-001',
  html: '<h1>Uw offerte</h1>...',
  text: 'Uw offerte...',
  replyTo: 'katering@bbqarchitect.nl',
  attachments: [{ filename: 'offerte.pdf', content: pdfBuffer, contentType: 'application/pdf' }]
})
```

**Templates:**
- `wrapHtml()` — HTML wrapper met bedrijfsnaam + brand-color border-bottom
- `mailOfferte()` — offerte-email met portal-link
- `mailFactuur()` — factuur-email met item-tabel
- `mailBetaalherinnering()` — payment-reminder
- `mailEventBevestiging()` — booking-confirmation
- `mailPaymentOntvangen()` — na Mollie webhook
- `mailBoekhouderPakket()` — maandelijks boekhouder-pakket met ZIP-attachment

**Fallback naar mailto:** als POST `/api/send-email` failed → `openMailtoFallback()` → user klikt mailclient-link om handmatig te verzenden.

**Custom domain (Enterprise):** SPF/DKIM/DMARC zelf configureren in Resend dashboard.

### 14.6 Cloudflare Email Worker — inbound

**Use case:** leverancier mailt prijslijst naar `pl-{org-slug}@in.bbqarchitect.app`.

**HMAC-SHA256 timing-safe verificatie** (`src/lib/emailInbound.ts`):
```typescript
const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
const headerSig = req.headers.get('x-cf-signature');
return timingSafeEqual(
  Buffer.from(expected, 'hex'),
  Buffer.from(headerSig, 'hex')
);
```

**Address-parsing:** regex `/^pl-([a-z0-9]+)$/` op local-part → org-slug → tenant-lookup.

**Attachment-staging:**
```typescript
const storagePath = `${orgId}/${inboxId}/${Date.now()}-${safeName}`;
await sb.storage.from('email-attachments').upload(storagePath, buf, {
  contentType: args.mimeType,
  cacheControl: '3600'
});
```

Path-convention matcht RLS-policy zodat orgs alleen eigen folder zien.

**Dedup:** UNIQUE `(organization_id, raw_message_id)` op `org_email_inbox` — voorkomt Cloudflare-retries dubbel-processing.

**Dispatch:** na staging → trigger `/api/parse-attachment` (Sonnet 4.6 vision voor PDF, `fast-xml-parser` voor UBL-XML).

### 14.7 Supabase Auth — multi-tenant

**Helper-functies (SQL):**

```sql
-- Set van alle org's waar user actief member is
CREATE FUNCTION auth.user_org_ids()
RETURNS uuid[] LANGUAGE sql STABLE AS $$
  SELECT ARRAY(
    SELECT organization_id FROM organization_members
    WHERE user_id = auth.uid() AND status = 'active'
  )::uuid[];
$$;

-- Eerste actieve org (fallback)
CREATE FUNCTION auth.current_org_id()
RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT organization_id FROM organization_members
  WHERE user_id = auth.uid() AND status = 'active'
  LIMIT 1;
$$;
```

**RLS-pattern (standaard op alle tenant-tabellen):**
```sql
CREATE POLICY "tenant_isolation" ON some_table
FOR ALL TO authenticated
USING (organization_id IN (SELECT private.user_org_ids()));
```

**Magic-link onboarding** via `/invite` route:
- E-mail-link → `/auth/callback?code=...&type=magiclink`
- Server-side swap code → session JWT
- JWT bevat `org_id`-claim (custom post-signup)

**JWT-claim flow:** bij login, custom hook in Supabase Auth voegt `org_id` toe als `app_metadata.org_id` — beschikbaar in alle RLS-policies via `auth.jwt() ->> 'org_id'`.

### 14.8 Google Calendar — bidirectional sync

**Setup:** OAuth 2.0 met `GOOGLE_CLIENT_ID`/`SECRET`/`REFRESH_TOKEN`. Calendar ID: `primary` (user's default).

**GET `/api/calendar/google`** — pull events uit Google → map naar BBQ Architect `events`-tabel.

**POST `/api/calendar/google`** — push events naar Google. Use `extendedProperties.private.bbq_architect_id` voor idempotency (voorkomt duplicates bij re-sync).

**Cron `/api/cron/calendar-google-sync`** — elke 6 uur:
- Twee-richtings-sync: pull changes, push new events
- Conflict-resolution: timestamp-based merge (latest-wins)

**Event-mapping:**
```javascript
{
  summary: 'BBQ Event - Jan BV',
  description: 'Klant: Jan BV\nGasten: 50\nPrijs pp: 25.00\n...',
  location: 'Amsterdam',
  start: { date: '2026-06-15' },
  end: { date: '2026-06-16' },
  extendedProperties: {
    private: {
      bbq_architect_id: '456',
      bbq_architect_status: 'bevestigd'
    }
  }
}
```

**iCal export:** `GET /api/calendar/ical` → `.ics`-feed. Public per tenant. Cateraar kan klant deze URL geven voor `webcal://` subscription.

**Gap:** geen conflict-UI bij timestamp-merge (silent overwrite — open item).

### 14.9 Bekende gaps Integraties

- **Mollie refund-flow ontbreekt** — handmatig via Mollie dashboard
- **Moneybird credit-notes niet bidirectioneel** — alleen handmatig in BBQ Architect, daarna handmatig naar Moneybird
- **Moneybird contact-dedup exact-only** — geen fuzzy-match (Levenshtein) op bedrijfsnaam
- **Moneybird token-refresh on-demand only** — geen background-job; expired tokens veroorzaken sync-fails
- **UBL validation-UI** — toast bij invalid, maar geen preview-mode in Moneybird-flow
- **Google Cal timestamp-conflict** — silent merge, geen UI om te kiezen
- **Cloudflare email retry-queue** — UNIQUE-constraint voorkomt dubbel-processing maar geen background-retry voor failed parses

# DEEL C — COMPLIANCE & PUBLIEKE ROUTES

## 15. Compliance & NL-stack

### 15.1 HACCP v3 — volledig schema

**Migratie:** `20260518192219_haccp_v3_photo_corrective_trends.sql`

**Tabel `haccp_records` (kolom-uitbreiding v2 → v3):**
```sql
ALTER TABLE haccp_records ADD photo_url TEXT;
-- Signed Supabase Storage URL; facultatief
-- NVWA accepteert foto-bewijs hoger dan text-only
```

**Constraint: human-confirmed (Pillar #3):**
```sql
CHECK (
  auto_logged = true
  OR confirmed_by_user_id IS NOT NULL
  OR created_at < '2026-05-18'::timestamptz
) NOT VALID
```

3 takken:
1. Legacy auto-imports (`auto_logged=true`)
2. Nieuwe v3-records moeten mens-bevestigd zijn (`confirmed_by_user_id NOT NULL`)
3. Pre-v3 rows grandfathered (NOT VALID — geen backfill vereist)

**Tabel `haccp_corrective_actions` (nieuw v3):**
```sql
CREATE TABLE haccp_corrective_actions (
  id BIGSERIAL PRIMARY KEY,
  organization_id UUID NOT NULL,
  haccp_record_id INTEGER REFERENCES haccp_records(id),
  anomaly_finding_id BIGINT,
  action_type TEXT NOT NULL,    -- 'immediate' | 'corrective' | 'preventive'
  description TEXT NOT NULL,
  steps_taken JSONB DEFAULT '[]'::jsonb,  -- append-only audit
  resolved_at TIMESTAMPTZ,
  resolved_by_user_id UUID,
  outcome TEXT,                  -- 'success' | 'partial' | 'failed'
  notes TEXT,
  created_at, updated_at TIMESTAMPTZ DEFAULT now()
);
```

RLS: org-leden zien eigen corrective-actions.

**Tabel `haccp_anomaly_findings` (linked voor trend-analyse) + `gerechten_haccp_templates` (template-cache per gerecht).**

**RPC `get_haccp_trends(p_org_id UUID, p_days INT = 90)`:**
```sql
SELECT
  check_type, wat,
  COUNT(*) AS total_checks,
  COUNT(*) FILTER (WHERE status = 'ok') AS ok_count,
  COUNT(*) FILTER (WHERE status IN ('warn','danger','afwijking')) AS deviation_count,
  COUNT(a.id) AS anomaly_count,
  AVG(temp::numeric) AS avg_temp,
  MIN(temp::numeric) AS min_temp,
  MAX(temp::numeric) AS max_temp,
  MAX(created_at) AS last_check_at,
  ROUND(... * 100, 1) AS deviation_pct
FROM haccp_records h
LEFT JOIN haccp_anomaly_findings a ON a.haccp_record_id = h.id
WHERE organization_id = p_org_id AND created_at >= now() - (p_days || ' days')::interval
GROUP BY check_type, wat
ORDER BY deviation_pct DESC;
```

→ High-risk items boven; 90-day trend per check-type.

**Storage bucket `haccp-evidence`:**
- PRIVATE, max 5MB/file
- Allowed: JPEG / PNG / WebP / HEIC
- Path: `{org_id}/{record_id}/{timestamp}.jpg`
- RLS: `(storage.foldername(name))[1] IN (user_org_ids()::text)`

**Template-caching:** Sonnet 4.6 genereert HACCP-template per gerecht één keer → cache in `gerechten_haccp_templates` → tweede gebruik = nul AI-call. **Citations API** pattern: bronnen opgeslagen in `citations_json` (welke regelgeving de AI heeft gebruikt — auditable).

### 15.2 AVG / GDPR — Artikel 15, 17, 20

**Artikel 15 (Inzagerecht):**
- Klant vraagt om data → cateraar opent `/klanten/[id]` → "Exporteer klantdossier" → ZIP met alle klant-specifieke data
- Per-klant single-dump (offertes, events, facturen, bonnen, e-mails)

**Artikel 20 (Data Portabiliteit) — `POST /api/data-export?orgId={uuid}`:**
- Auth-check + membership-verify
- Service-role dump van 58 exportable tables
- JSON-format (indent=2, human-readable)
- Filename: `bbq-architect-export-{org-8}-{datum}.json`
- Excludes: wachtwoorden, payment-tokens, API keys
- Includes: full audit trail (`ai_usage`, `audit_log`, `emails`)

**58 exportable tables (volledig):**
`organizations, profiles, organization_members, klanten, gerechten, gangen, recepten, events, offertes, facturen, leveranciers, inkooplijsten, inventory, materieel, hardware_items, haccp_records, time_logs, service_logs, event_reflecties, pack_lists, rtr_items, prep_tasks, photo_logbook, supplier_invoices, supplier_invoice_lines, supplier_prices, settings, email_templates, emails, pdf_templates, website_hero, website_gallery, website_faq, website_gangen, website_gerechten, activation_events, ai_usage, ai_conversations, ai_conversation_folders, ai_conversation_items, components, component_allergens, component_haccp, component_folders, gerecht_components, recipe_allergens, recipe_haccp, menu_templates, menu_template_items, courses, kitchen_stations, kds_audit_logs, service_audit_logs, service_state, voertuigen, ritten, agenda_personal, leads, arrangementen` (en gerelateerde join-tabellen).

**Artikel 17 (Right to Forgetting):**
- "Anonymiseer klant"-knop in `/klanten/[id]`
- Vervangt NAW-velden door pseudoniem (`klanten.naam := 'DELETED-' || id`)
- E-mails scrubbed
- Behoudt aggregate-statistiek voor margin-analyse
- **Status:** UI-design gestart, server actions niet volledig geïmplementeerd (gap — handmatig via support)

**Bewaartermijnen NL-specifiek:**
| Data-type | Termijn | Regel/bron |
|---|---|---|
| Bonnen/kassaboeken | 7 jaar | Belastingdienst |
| Facturen | 7 jaar | Boekhouding |
| Audit-logs | 2 jaar | Interne compliance |
| Gast-lijsten (floor-plan PII) | 30 dagen | GDPR minimalisatie (cron-anonymize-floor-plan-guests) |
| E-mails (klant) | 1 jaar | Redelijk doel |
| Event-foto's | 3 maanden | Verwijzingsrecht |

### 15.3 BTW NL 2026 — `BTW_RULES_2026`

**`src/lib/btw-rules.ts` (10 categorieën):**
```typescript
export const BTW_RULES_2026: BtwRule[] = [
  { category: 'food_catering',        rate: 0.09, rate_pct: 9 },
  { category: 'food_takeaway',        rate: 0.09, rate_pct: 9 },
  { category: 'service_personnel',    rate: 0.21, rate_pct: 21 },
  { category: 'alcohol',              rate: 0.21, rate_pct: 21 },
  { category: 'soft_drinks',          rate: 0.21, rate_pct: 21 },  // ⚠ sinds 1 jan 2026 (was 6%)
  { category: 'transport',            rate: 0.21, rate_pct: 21 },
  { category: 'equipment_rental',     rate: 0.21, rate_pct: 21 },
  { category: 'b2b_intra_eu_reverse', rate: 0.00, rate_pct: 0 },
  { category: 'export_non_eu',        rate: 0.00, rate_pct: 0 },
  { category: 'exempt',               rate: 0.00, rate_pct: 0 },
];
```

**Hard rule (Pillar #1):** AI mag categorie suggéreren ("dit is alcohol → 21%"), maar de **percentage komt ALTIJD uit deze tabel**, server-side.

**Edge cases met Belastingdienst-impact:**
| Case | Tarief | Notitie |
|---|---|---|
| Voeding catering ter plaatse | 9% | Eet ter plaatse = laag |
| Voeding afhalen/bezorgen | 9% | Meegenomen = laag |
| Alcohol | 21% | Alle alcoholische dranken |
| Frisdrank | 21% | Sinds 1 jan 2026 — WAS 6% |
| Bediening/serveerders | 21% | Diensten |
| Materieel-verhuur (BBQ, tent, banken) | 21% | Middelen |
| B2B intracommunautair (NL ↔ DE) | 0% | Reverse-charge |
| Export buiten EU | 0% | Geldige warenverkeer |
| Kleine-ondernemersregeling (KOR) | N.v.t. | Uitsluitingsgrond — open item: nog geen feature |

**Helpers:**
- `getBtwRate('food_catering')` → 0.09
- `getBtwPct('service_personnel')` → 21
- `validateBtwPct(8)` → 0 (ongeldig → fallback)
- `validateBtwPct(22)` → 21 (snap naar dichtstbijzijnde geldig)

**BTW-anomaly logging** (sinds 2026-06-01 audit-fix) — afwijkende patronen worden gelogd in `audit_log` met `record_table='facturen'` en `metadata.anomaly_type`.

### 15.4 Peppol BIS 3.0 / ViDA 2030

- **België:** alle B2B verplicht **1 januari 2026** → BBQ Architect klaar
- **Nederland:** B2G al jaren verplicht; **B2B-mandaat verwacht 1 juli 2030** via EU ViDA
- **ViDA (VAT In The Digital Age) 2030:** compleet overstap naar centraal e-invoicing-scherm
- BBQ Architect Peppol-output is dus 4 jaar voor de NL-mandaat
- BIS 3.0 = EN 16931-compliant, NLCIUS v1.0
- Workflow: tenant → UBL XML → Peppol-netwerk → klant-systeem. Of: via Moneybird's Peppol-connector.

### 15.5 KHN-Hygiënecode + NVWA-export

**KHN (Koninklijke Horeca Nederland) hygiënecode** vereist:
- Dagelijkse inspectie-logs (`check_type='temperature-check'`)
- Corrective-actions bij afwijking (`haccp_corrective_actions`)
- Foto-bewijs (v3 feature)
- Audit-trail (append-only `steps_taken JSONB`)

**NVWA-export:** `get_haccp_trends()` → PDF-rapport met 90-day trends per check-type + percentage afwijkingen + foto's.

**Gap:** geen geautomatiseerde NVWA-formulier-export — waarschijnlijk via `/api/data-export` + handmatige rapportage.

### 15.6 Bekende gaps Compliance

- **Artikel 17 anonymize-flow** — UI gestart, server actions niet compleet
- **KOR-support** (KMO turnover-gate) — geen feature
- **NVWA-export** — geen specifieke export, alleen generieke data-dump
- **PDF-export AVG-Artikel-15** — werkt als ZIP, maar geen mensleesbaar PDF-rapport
- **Email-inbound classify confidence** — geen drempel-flow ("if < 0.6 → human review")
- **GDPR cookie-banner** — niet zichtbaar in publieke routes (waarschijnlijk via Vercel Edge of niet)
- **BTW soft_drinks-wijziging 2026** — code bijgewerkt, maar bestaande oude offertes (vóór 1 jan 2026) houden 6% — handmatig migreren

## 16. Publieke routes & klant-portals

Drie publieke routes die klanten ooit zien (plus `/sectie/[slug]` en `/share/[token]` voor specialistische use-cases).

### 16.1 `/q/[id]` — quote-portal

De klant accepteert hier de offerte. **Belangrijk (memory: project_portal_public_token):** de URL gebruikt `public_token` (UUID), niet de `offertes.id` (int4). Klant-links MOETEN het token gebruiken anders 404.

**Components:**
- Header met cateraar-logo + bedrijfsnaam
- Offerte-samenvatting (event, datum, gasten, menu)
- Menu-detail (gerechten per gang, met foto's indien gevuld)
- Totalen (incl/excl BTW, BTW-bedrag, aanbetaling)
- Allergenen-overzicht
- Acties:
  - Accepteer (typed name als e-sign)
  - Verzoek wijziging (vrije tekst → e-mail naar cateraar)
  - Betaal aanbetaling via iDEAL (Mollie)
- Footer met algemene voorwaarden (link naar `/legal/voorwaarden`)

**States:**
- Loading (skeleton)
- 404 (token bestaat niet)
- Expired (offerte voorbij geldig-tot-datum)
- Already accepted (success-banner, geen acties meer)
- Cancelled (banner, geen acties)
- Portal-normal (alle acties beschikbaar)

**White-label:**
- Theme uit tenant's `brand_theme`
- Logo uit `settings.logo_url`
- Custom domain (Enterprise): `quotes.cateraar.nl`
- No-JS fallback: `<noscript>` waarschuwt dat e-sign + iDEAL JavaScript vereisen

**Migratie:** `20260515120000_offerte_signed_pdf.sql` — gegenereerde PDF van de geaccepteerde offerte wordt opgeslagen in Storage voor 7-jaar-archief.

### 16.2 `/aanvraag/[slug]` — lead-form

Publieke white-label aanvraag-pagina. Tenant via `organizations.slug` in URL.

**Layout (één doorlopende pagina):**
1. **Hero** — sfeerbeeld (uit `settings`) + bedrijfsnaam + ondertitel
2. **Zo werkt het** — 3 stappen ("Vertel over je event" → "Wij sturen voorstel op maat" → "Samen jullie event")
3. **Trust-blok** — drie generieke garanties (Vrijblijvend, Reactie binnen 24u, Voorstel op maat). **Géén verzonnen reviews per tenant** (white-label-eerlijk, memory: project_aanvraag_funnel)
4. **Formulier**:
   - Contactpersoon (verplicht): naam, e-mail, telefoon
   - Event-info (deels optioneel): aantal gasten, event-type (Bruiloft / Bedrijfsfeest / Verjaardag / Festival / Jubileum / Anders), datum, locatie/postcode
   - Bericht (optioneel): vrije tekst

**Submit:**
- POST `/api/public-lead-form/[slug]`
- Server-action validates met Zod
- INSERT in `leads`-tabel met `source = 'public_form'`
- Honeypot + rate-limit anti-spam
- Bevestigings-e-mail naar klant (template via Resend) en notificatie naar cateraar

**Tech:**
- Inline SVG icons (geen icon-lib dependency in de bundle voor publieke pagina's)
- Theme via `themeStyleVars` (Server-Component-vriendelijk)
- `--danger` per licht/donker inline
- Geen device-chrome / iframe-spoof

### 16.3 `/arrangement/[slug]` — self-serve configurator

Klant stelt zelf een arrangement samen.

**Layout:**
- Hero met arrangement-naam + bedrijfsnaam
- Per categorie (Voorgerecht, Hoofd, Bijgerecht, Dessert, Drank): kaart-grid met 3 niveaus (Simpel, Medium, Best-of) — radio-keuze
- Live indicatie-prijs (pp × gasten, deterministisch berekend, server-side)
- Budget-band slider (optioneel)
- Samenvatting onderaan: gekozen items, aantal gasten, totale indicatie-omzet
- Contact-form (naam, e-mail, telefoon, event-datum)
- Submit → `leads`-tabel met `source = 'arrangement'`, ai_concept = keuze-snapshot

**Responsive:**
- Mobile: één kolom met collapsible categorieën
- Desktop: 3 kaarten naast elkaar per categorie

**Tracking:**
- Anonieme funnel-events (`funnel_events`-tabel sinds 2026-06-04)
- Session-id client-generated (sessionStorage), geen PII
- Org-gescoped via RLS
- Publieke insert via service-role
- Track view / start / submit

### 16.4 `/sectie/[slug]` en `/share/[token]`

**`/sectie/[slug]`:**
- Publieke pagina die één arrangement-categorie toont (bv "Onze BBQ-buffets")
- White-label browsing voor klanten

**`/share/[token]`:**
- Tijdelijke read-only share-link met expires_at + revoked_at-monitoring
- Use cases: boekhouder krijgt read-access tot specifieke bonnen-snapshot, klant krijgt link naar concept-offerte vóór officiële verzending

**Token-eigenschappen:**
- 64-char hex (32 random bytes)
- `expires_at` strict checked
- `revoked_at` monitored (soft-delete)
- IP-logging via `last_accessed_ip`
- `access_count` incremented per view

**Wat de ontvanger ziet:**
- Filter-snapshot (bevroren bij aanmaak)
- Bonnen-lijst + totaal-bedrag + BTW-aggregaten
- Per bon: PDF-preview (signed URL via service-role)
- ZIP-download (bulk-export met token-auth)

**Wat de ontvanger NIET kan:**
- Editen, taggen, status wijzigen
- Filters wijzigen
- Andere orgs zien
- Authenticated routes openen

**Metadata-velden:** `recipient_name` (optioneel), `label` (optioneel, "Q2 invoices"), `created_at`, `expires_at`, `access_count`, `last_accessed_ip`, `last_accessed_at`.

**Sectie-route opmerking:** `/sectie/[slug]` is in juni 2026 niet meer in actieve gebruik volgens codebase-scan; mogelijk legacy of WIP (open item voor cleanup).

# DEEL D — MARKT & CONCURRENTEN

## 17. Marktcontext NL/BE catering-software

De NL/BE-cateringmarkt voor software is gefragmenteerd. Vier groepen spelers (zie ook `docs/competitor-benchmark.md`):

1. **Internationale catering-SaaS** — Tripleseat, Caterease, Total Party Planner, CaterZen, FoodStorm, Better Cater, Curate. Setten de globale verwachting, maar zelden Nederlandstalig of NL-boekhouding-vriendelijk.
2. **Nederlandse/Belgische catering-software** — Catermonkey (NL, Lemmer), EasyParty (KJ Software, Brabant), MICE Operations (Breda), CateringSoftware.nl, Cateringpoint (uit Mathijs' interne benchmark, mogelijk verouderd). Kennen de markt, maar vaak smaller in scope of zonder AI.
3. **Adjacent / kitchen-management** — Apicbase (BE-Gent), FoodNotify (DE-Wien), MEXT, CookConnect (niet duidelijk aanwezig in 2026). Sterk op recepten/voorraad/HACCP, niet event-shaped.
4. **De do-nothing baseline** — Excel + Moneybird + WhatsApp + Google Calendar. Wat 80% van NL-cateraars vandaag gebruikt. **De echte concurrent.**

**Marktomvang ruwe schatting:**
- Nederland heeft ~3.500 actieve cateringbedrijven (KvK SBI 56.21)
- Daarvan ~70% nano-cateraar (< 5 events/maand): doelgroep Starter
- ~25% actief (5-30 events/maand): doelgroep Pro
- ~5% groei-cateraar (>30 events/maand of multi-location): doelgroep Enterprise

**Adressable market (Total Addressable):**
- 3.500 × 30% kanszone × €99 × 12 = ~€1,25M ARR potentieel in NL alleen
- BE telt ~1.500 cateringbedrijven, voeg ~30% toe = ~€1,6M ARR NL+BE

**Sleutel-inzicht (do-nothing):** 80% van NL-cateraars in target-segment is nu nog NIET-software-klant. Het spel is conversion van Excel-stack, niet markt-aandeel van concurrenten afpakken.

## 18. NL/BE catering-concurrenten — live geverifieerd 2026-06-04

### 18.1 Catermonkey (NL, Lemmer)

**Bron:** [catermonkey.com/en/prices](https://catermonkey.com/en/prices/) (2026-06-04), [Capterra-listing](https://www.capterra.com/p/233143/Catermonkey/) (2026-06-04)

**Bedrijf:**
- HQ: Lemmer, Friesland
- Focus: corporate-catering en party-professionals in Benelux

**Pricing (juni 2026, geverifieerd):**

| Plan | Prijs/maand | Doel |
|------|-------------|------|
| Starter | €62,50 | Single-business basis |
| Fully Digital | €125 | + bestelmodule, personeelsplanning, herinneringen, dagelijkse prijsupdates |
| King | €246 | + websiteintegratie, contactformulier, aanvraagformulier, quotageringsindicator, tagging, voertuigplanner |
| Enterprise | €995 | + eigen accountmanager, implementatie, maatwerk, 15 beheeraccounts |

**Add-ons:**
- Extra beheeraccount: €37,50/mnd
- Meertaligheid: €95/mnd
- Extra merk: €95/mnd
- Integraties: €19,50/mnd
- Materiaal-inventaris: €20/mnd
- Carefree Package (eenmalig setup-fee): €995

**Features:**
- CRM, offertes, facturering, kalender, verkoopoverzicht
- Automatische keukenlijsten en paklijsten bij bevestiging
- Personeelsplanning, beschikbaarheid-controle
- Voertuigplanner, voorraad
- Websiteintegratie (formulier dat naar Catermonkey doorpost)
- **Peppol/e-invoicing ondersteund** (volgens features-page)
- Native koppelingen met Hanos, Sligro (leveranciers)
- Integraties met accounting (niet welke gespecificeerd op pricing-page)

**Sentiment:**
- Capterra: **GEEN reviews** (juni 2026). 0 sterren, 0 reviews. Vergelijk: Tripleseat 4.7/5 op 573 reviews.
- SoftwareWorld noemt het product zonder veel kritiek

**Sterktes:**
- NL/BE-fit (taal, Benelux-leveranciers, Peppol)
- Sterke productie-pipeline (offerte → keukenlijst automatisch)
- Pricing-niveau Starter € 62,50 ligt iets boven BBQ Architect Starter € 49

**Zwaktes:**
- Geen zichtbare AI-laag
- Pricing is verwarrend (veel modules, add-ons stapelen op)
- Enterprise-tier (€995) is fors duurder dan BBQ Architect Enterprise (€249)
- Geen Capterra-reviews = mogelijke marktadoptie-issue

**BBQ Architect-edge:**
- AI block-first met klikbare action_cards (Catermonkey heeft geen AI)
- Transparant 3-tier model (€49/€99/€249) vs Catermonkey's stapelende modules
- White-label diepte (Catermonkey heeft logo + kleur, niet 8 OKLCH-presets met PDF-propagatie)
- Chef-coach voor live keuken (Catermonkey niet)

### 18.2 EasyParty / KJ Software (NL, Brabant)

**Bron:** [easyparty.nl/tarieven](https://www.easyparty.nl/tarieven/) (2026-06-04)

**Bedrijf:**
- HQ: Noord-Brabant
- 20+ jaar ervaring, claimt marktleider NL+BE

**Pricing (juni 2026, geverifieerd):**
- **Vanaf €24,95/mnd**
- **Variabel: 0,025% van jaaromzet per maand**
- Onbeperkt aantal users included
- Geen setup-fee genoemd op tarieven-page
- (Concurrentie-matrix mei 2026 vermeldde "0,02%, min €150/mnd" — pricing-model is dus aangepast richting toegankelijker voor SMB)

**Voorbeeld-berekening:**
- Cateraar met €500K jaaromzet: €500.000 × 0,025% = €125/maand
- Cateraar met €1M jaaromzet: €250/maand
- Cateraar met €2M jaaromzet: €500/maand

**Features:**
- Offertes, kalender, keuken, magazijn, planning, facturering — all-in-one
- 100+ submodules (volgens eerder benchmark)
- Integraties: Exact, AFAS, Odoo (uit competitor-matrix mei 2026)
- 20 jaar feature-diepte (claim: meest complete NL-stack)

**Sterktes:**
- Diepste feature-set van NL-spelers
- Schaalt met de cateraar (omzet-gebaseerd)
- Bestaande klantenbasis: NL+BE cateraars groot en klein

**Zwaktes:**
- UX dated (volgens reviews oud-systeem)
- Geen AI
- Omzet-share-pricing kan psychologisch afschrikkend zijn voor groei-cateraars ("hoe meer ik verdien, hoe meer ik betaal")
- Modulair pricing-model opaak (welke modules zitten in start vs add-on?)
- Geen native Moneybird-integratie genoemd (wel Exact/AFAS/Odoo — Pro-tier NL-cateraars zijn vaker op Moneybird)

**BBQ Architect-edge:**
- Vlakke prijzen (€49/€99/€249) i.p.v. omzet-share
- Moderne UI/UX (Tailwind, React 19, lucide-icons)
- AI-native (EasyParty: geen)
- Moneybird native (EasyParty: niet primair)
- Note (uit competitor-matrix): "Sam's biggest direct NL competitor by depth. Beat them on UX and AI, not feature parity."

### 18.3 MICE Operations (NL, Breda)

**Bron:** [miceoperations.com/pricing](https://www.miceoperations.com/pricing) (2026-06-04)

**Bedrijf:**
- HQ: Breda
- Actief in 8 landen
- Klanten: NL-cateraars zoals Wijnstra en The Links Valley
- Positie: event-venues + caterers + meeting venues + wedding venues + hotels

**Pricing (juni 2026, geverifieerd):**

| Plan | Maandelijks | Jaarlijks | Users | Spaces/Rooms |
|------|-------------|-----------|-------|--------------|
| Start | €109/mnd | €99/mnd | 2 | 3 |
| Regular | €219/mnd | €199/mnd | 6 | 6 |
| Pro | €329/mnd | €299/mnd | 12 | 12 |

- 10% korting bij jaarlijkse betaling (al verwerkt in 'jaarlijks' kolom)
- 14-dagen gratis trial
- **Setup-fee: €1.350 excl. BTW** (optioneel, voor company-setup en team-training)
- Enterprise: op aanvraag, custom

**Features:**

| Feature | Start | Regular | Pro |
|---------|:-----:|:-------:|:---:|
| Online booking widget | ✓ | ✓ | ✓ |
| Proposal sending (eProposals) | ✓ | ✓ | ✓ |
| Invoicing basics | ✓ | ✓ | ✓ |
| Capacity planning | – | ✓ | ✓ |
| Multi-day events | – | ✓ | ✓ |
| Reports | – | ✓ | ✓ |
| Budget calculations | – | – | ✓ |
| Advanced planning | – | – | ✓ |
| Automated workflows | – | – | ✓ |
| Multilingual support | – | – | ✓ |

**Integraties:**
- Mailchimp
- Accounting: "upon request"
- (Niet expliciet: Moneybird, Mollie, Peppol)

**Sterktes:**
- Sterke proposal/eProposal-engine
- NL-native met klanten in catering- en venue-segment
- Capaciteit-planning voor multi-room venues (anders dan BBQ Architect)
- Multi-language support (Pro-tier)

**Zwaktes:**
- Hoge setup-fee (€1.350) — schrikt SMB af
- Geen AI
- Doelgroep mix (venues + catering) maakt UX minder catering-specifiek
- Klein team van 12 users in Pro-tier — niet geschikt voor cateraars met veel inhuur-crew

**BBQ Architect-edge:**
- Geen setup-fee
- AI-native
- Catering-shaped (niet venue-shaped) — Lars-friendly
- Goedkoper (€99 Pro vs MICE €199 Regular)
- Onbeperkt aantal users in Pro-tier (vs MICE max 6)

### 18.4 Cateringpoint (NL, Utrecht — status onzeker)

**Bron:** intern, [docs/competitor-benchmark.md](docs/competitor-benchmark.md) (2026-04-21), web-search 2026-06-04 vond geen actieve pricing-page

**Bedrijf:**
- HQ: Utrecht (volgens interne benchmark)
- Familiebedrijf, bootstrapped, opgericht 2015

**Pricing (uit interne benchmark, mogelijk verouderd):**
- Starter: €60/mnd
- Plus: €95/mnd
- Pro: €150/mnd
- Setup: €0

**Features (uit interne benchmark):**
- Snelle offertes via templates
- Klantenportaal
- Digitale ondertekening
- Mollie- en Moneybird-sync

**Status juni 2026:**
- Geen prominent Capterra-profiel meer vindbaar
- Geen actieve marketing-zichtbaarheid in zoekresultaten
- Mogelijk afgenomen marktaanwezigheid

**Conclusie:** Cateringpoint was Mathijs' meest directe Starter-tier-concurrent in 2026-Q1; juni 2026 is onduidelijk of het bedrijf nog actief in groei is. **Aanbeveling: verifieer voor pricing-beslissingen via direct contact.**

### 18.5 CateringSoftware.nl (NL)

**Bron:** [cateringsoftware.nl](https://www.cateringsoftware.nl/) (2026-06-04)

**Wat:**
- "Online cateringsoftware" voor offertes, facturen, keukenlijsten, boodschappenlijsten, personeelsplanning
- 2 maanden gratis trial, daarna maandelijks opzegbaar

**Pricing:**
- Niet publiek op de homepage — vereist contact/demo

**Positionering:**
- Een minder bekend NL-alternatief
- Beperkte zichtbaarheid op Capterra/G2

**BBQ Architect-edge:** modernere UI, AI, white-label, sterkere positionering.

### 18.6 Rentman (NL, Utrecht)

**Bron:** competitor-matrix + benchmark

**Wat:**
- HQ: Utrecht
- Focus: event-equipment-rental (licht, geluid, podium, stoelen)
- Catering is een toegevoegde module (+€30/mnd)

**Pricing:**
- Classic €45/mnd/user
- Lite €75/mnd/user
- Pro €129/mnd/user
- Catering-module +€30/mnd
- Free unlimited basic users

**Voor BBQ Architect:**
- Niet directe concurrent (rental-DNA)
- **Partnership-kandidaat** voor cateraars die ook AV verhuren

**Gap:** geen AI, geen Mollie/Moneybird native.

### 18.7 Vergelijking tabel — NL/BE catering-spelers

| Speler | Start-prijs | Top-tier | AI | Peppol | Moneybird | Mollie | White-label diep | Setup-fee |
|--------|-------------|----------|----|----|-----------|--------|------------------|-----------|
| BBQ Architect | €49 | €249 | **Ja** | **Ja** | **Ja** | **Ja** | **Ja (5×8 OKLCH)** | €0 |
| Catermonkey | €62,50 | €995 | Nee | Ja | Mogelijk | Mogelijk | Beperkt | €995 carefree |
| EasyParty | €24,95 (omzet-share) | uncapped | Nee | Onbekend | Beperkt | Onbekend | Beperkt | Onbekend |
| MICE Operations | €99 (jaar) | €299 (jaar) | Nee | Onbekend | Op aanvraag | Op aanvraag | Klantportaal | €1.350 |
| Cateringpoint | €60 (2026-Q1) | €150 | Nee | Onbekend | Ja | Ja | Logo+kleur | €0 |
| Rentman | €45/user | €129/user + module | Nee | Onbekend | Nee (Xero/QB) | Nee (Stripe) | Theme/PDF | Onbekend |

## 19. Keuken / food-prod SaaS — live geverifieerd 2026-06-04

### 19.1 Apicbase (BE, Gent)

**Bron:** [Capterra Apicbase-listing](https://www.capterra.com/p/171584/Apicbase-Restaurant-Management/) (2026-06-04), competitor-matrix

**Bedrijf:**
- HQ: Gent, België
- Focus: back-of-house F&B management voor multi-site restaurant brands
- Klanten: 1000+ sites, leading multi-outlet brands

**Pricing (juni 2026, Capterra-noteert):**
- **€249/maand** als anker (modulair: prijs hangt af van modules + sites)
- Geen gratis trial
- Quote-based voor enterprise

**Reviews (Capterra juni 2026):**
- Gemiddelde score: **4.6/5**
- Reviews: 35
- Sentiment: 94% positief, 6% neutraal, 0% negatief
- Gebruiksgemak: 4.4/5
- Klantenservice: 4.9/5
- Doelgroep volgens reviews: 69% kleine bedrijven

**Features:**
- Recepten- en menu-management
- Voorraadbeheer + vraagprognoses
- Kosttracking en voedingsanalyse
- Allergentracking + labeling
- Multi-locatie ondersteuning
- Real-time analytics
- **AI-native (recipe generation from photos/text, allergen auto-fill, voice counting, three-way invoice matching)** — best-in-class voor back-of-house AI
- 2025-launches: constraint-based recipe generation (dietary, allergen, target cost), role-based AI governance, Bmediagroep-integratie

**Positie versus BBQ Architect:**
- Apicbase is multi-site brand-shaped (Gent), BBQ Architect is single-cateraar event-shaped
- Apicbase prijs (€249) = BBQ Architect Enterprise-prijs
- Apicbase is **de bar te verslaan op AI voor back-of-house**
- Apicbase mist event-context (locatie-specifiek, eenmalig)
- Apicbase mist catering-specifieke offerte-flow

**BBQ Architect-edge:**
- 4× goedkoper voor SMB-cateraars (€49 vs Apicbase €249)
- Event-shaped i.p.v. site-shaped
- NL-event-context (BTW catering, KHN-HACCP)
- Lead-funnel + arrangement-configurator (Apicbase niet)

**Apicbase-edge over BBQ Architect:**
- Recipe-generation met constraint-based AI is verder
- Three-way invoice matching (inkoopfactuur + bon + leveranciersorder)
- Role-based AI governance (review-approve workflow voor AI-output) is mature

**Note (memory: feedback_concurrent_patterns):** watch Apicbase release-stream. Hun constraint-based recipe-gen kan een opportunity-counter zijn voor BBQ Architect's recipe-generate.

### 19.2 FoodNotify (DE, Wien)

**Bron:** [foodnotify.com/en/catering](https://www.foodnotify.com/en/catering) (2026-06-04), Capterra/GetApp

**Bedrijf:**
- HQ: Wien (Oostenrijk), klanten in DE + AT
- Klanten: Concept Family (70+ locaties DE), RITA bringt's (Wenen)

**Pricing (juni 2026):**
- Geen publieke prijzen
- Quote-based, geen free trial
- Demo op aanvraag

**Markt:**
- DACH (Duitsland, Oostenrijk, mogelijk Zwitserland)
- Talen: EN, DE, FR
- **Geen NL-aanwezigheid**

**Features:**
- Evenementplanning per project
- Kostenberekening per maaltijd en gast
- Personeelsmanagement met taak-toewijzing
- Automatische bestelvoorstellen
- Integratie met Procurement, Recipes, ERP-modules
- Recipe-management met FIC-labeling (EU voedingsinformatie-richtlijn)

**Positie versus BBQ Architect:**
- FoodNotify is DACH-shaped (FIC, DE-fiscaliteit), BBQ Architect is NL/BE-shaped (Peppol BIS 3.0, Moneybird)
- Geen overlap in primaire markt
- Apicbase is sterkere concurrent in BE; FoodNotify in DE

**BBQ Architect-edge in NL:**
- NL-stack diepte (Moneybird, Mollie, BTW NL, NLCIUS)
- AI-block-first
- Event-funnel (lead → arrangement → offerte → quote-portal)

### 19.3 MEXT — geen significante aanwezigheid

**Bron:** WebSearch 2026-06-04 vond geen actief MEXT-kitchen-management-product in NL.

**Conclusie:**
- Mogelijk verwarring met andere afkortingen (NEXT, MEAT, kleine NL-tooltjes)
- Geen evidente concurrent in juni 2026
- Aanbeveling: niet als hoofdspeler behandelen

### 19.4 CookConnect — geen significante aanwezigheid

**Bron:** WebSearch 2026-06-04

**Bevindingen:**
- "Siemens cookConnect" is een hardware-koppel-systeem voor Siemens-keukenapparatuur, niet SaaS
- "COOK Connect" (US) is een platform voor home-based culinary entrepreneurs
- Geen NL/EU kitchen-management-SaaS met deze naam

**Conclusie:** niet behandelen als concurrent.

### 19.5 Andere keuken-SaaS in NL/BE-segment (uit benchmark + zoekresultaten)

- **Exact Horeko** — Exact's hospitality-suite, includes recipe + scheduling. Sterk voor restaurant POS, beperkt event-catering. Quote-based.
- **kitchennmbrs** (NL) — recipe + foodcost-tool. Vooral restaurants, niet event.
- **Culinary Cloud** — recipe-management NL, kleinere speler.
- **Jelly** — voorraad + bestelling NL, geen event-context.

Geen van deze is een directe BBQ Architect-concurrent; het zijn alle restaurant-shaped tools.

### 19.6 Internationale context (US-spelers, voor pricing-anker)

Niet primair voor Mathijs' segment maar nuttig voor pricing-context (live geverifieerd 2026-06-04):

| Speler | Pricing | Notitie |
|--------|---------|---------|
| Tripleseat | vanaf $149/mnd, custom hoger | US, event-venues + catering |
| Caterease | $80-200/mnd/user + $200 setup | US, dated UI |
| Total Party Planner | $135-500/mnd | US, off-premise catering |
| CaterZen | $149-349/mnd | US, drop-off |
| Better Cater | $19-79/mnd | US, SMB |
| Curate | $160-295/mnd | US/UK, mooie UI maar 2024-2025 migratie-disaster |
| FoodStorm | vanaf $500/mnd | AU/global, grocery-hybrid |

Geen van deze is NL-native of heeft Moneybird/iDEAL.

## 20. Marktprijszetting — context voor BBQ Architect

Range catering-software in NL/BE-segment (juni 2026, alleen geverifieerde getallen):

| Tier-positie | Range | Spelers |
|--------------|-------|---------|
| Basis (<€50/mnd) | €24,95-49 | EasyParty (vanaf), BBQ Architect Starter |
| Mid (€50-150/mnd) | €60-150 | Cateringpoint, Catermonkey Starter, BBQ Architect Pro (€99), MICE Start (€99 jaar) |
| Hoog (€150-300/mnd) | €199-299 | MICE Regular/Pro, Apicbase, Catermonkey King (€246), BBQ Architect Enterprise (€249) |
| Premium (€300-1000+/mnd) | €329-995 | Catermonkey Enterprise, MICE Pro, enterprise-Apicbase |

**Hoe BBQ Architect zich positioneert:**
- **Starter €49** — exact Excel-killer. Onder Cateringpoint (€60), onder Catermonkey (€62,50). Boven EasyParty's vanaf-prijs maar EasyParty schaalt naar boven met omzet.
- **Pro €99** — onder MICE Regular (€199), onder Catermonkey Fully Digital (€125), boven Cateringpoint Plus (€95). Sweet spot voor 5-30 events/maand.
- **Enterprise €249** — exact gelijk aan Apicbase, ver onder Catermonkey Enterprise (€995). Concurrentievoordeel: Apicbase is multi-site brand-shaped, BBQ Architect is white-label-met-custom-domain-shaped.

**Setup-fee vergelijk:**
- BBQ Architect: €0
- Cateringpoint: €0
- Catermonkey: €995 (optioneel carefree-package)
- MICE Operations: €1.350 (optioneel)
- EasyParty: onbekend (gerucht: per module)

**Pricing-strategie-aanbeveling (uit interne benchmark):**
- Houd Starter laag (€49) als Excel-killer en lead-magnet
- Pro is de winstgevende tier
- Enterprise is een "trust badge" voor brand-eisen + custom domain — gepaard met SAML/SCIM ontbreekt het nog 1 enterprise-feature

# DEEL E — POSITIONERING

## 21. Echte USP's van BBQ Architect

Een USP is alleen echt als het toetsbaar is, niet alleen een claim. Per pijler hieronder: wat is het, waarom is het waar, en hoe kan een prospect het zelf verifiëren.

### USP 1 — Volledige white-label, ook in de PDF en e-mail

**Wat:** 5 design-tokens × 8 OKLCH-presets × propagatie naar app-shell, `/q`-portal, `/aanvraag`-form, `/arrangement`-configurator, PDFs (offerte, factuur, menukaart, AVG-export), e-mail-templates. Plus custom domain (Enterprise: `quotes.cateraar.nl`).

**Waarom waar:** in `src/lib/portalThemes.ts` staan 8 expliciet gedefinieerde presets met volledige token-sets. `themeStyleVars()` is Server-Component-vriendelijk; ze rendert dus in PDFs gegenereerd door `@react-pdf/renderer` én in e-mails via Resend HTML-templates.

**Concurrent-gap:** Catermonkey en MICE Operations bieden logo + kleur. Cateringpoint idem. Geen van hen propageert kleur-tokens naar PDFs of e-mail-templates. Custom domain (Enterprise) is uniek in dit prijssegment.

**Verifieerbaar:** maak twee tenants aan met verschillende `brand_theme`-keuzes en vergelijk de gegenereerde PDFs.

### USP 2 — AI block-first met klikbare action_cards

**Wat:** AI antwoordt niet in markdown-soup maar in een JSON-array van 8 typed blocks. `nav_card` navigeert binnen de app, `action_card` mutates de DB na één confirm-klik. 42 action-types in de ACTION_TYPES-registry.

**Waarom waar:** `BLOCK_TOOL_SCHEMA` in `src/lib/ai/blocks.ts` is de tool-definition die Anthropic dwingend gebruikt. De `useActionDispatcher` plus `ai_action_proposals`-tabel met confirm-flow zijn er.

**Concurrent-gap:** geen NL/BE-concurrent biedt klikbare AI-acties. Apicbase heeft AI-recipe-generation maar geen action_card-pattern (alleen tekst-output met handmatige toepassing).

**Verifieerbaar:** open ChatPanel, vraag "Maak inkooplijst voor de bruiloft van Berkhout", krijg een action_card, klik confirm → tabel-record in `inkooplijsten`.

### USP 3 — NL-stack diepte, 4 jaar voor ViDA 2030

**Wat:** Mollie iDEAL idempotent met `processed_mollie_events` UNIQUE constraint. Moneybird OAuth met fire-and-forget push en NULL-check. UBL/Peppol BIS 3.0 / NLCIUS v1.0 native. BTW 9/21/0 server-side derived (nooit AI). KHN-HACCP via HACCP v3 met photo-evidence.

**Waarom waar:** alle bovenstaande integraties zijn aanwezig in code (zie sectie 14). Peppol-export bestaat sinds 2026-Q2.

**Concurrent-gap:** NL-mandaat 1 juli 2030, BE-mandaat 1 januari 2026. Veel NL/BE-concurrenten hebben nog geen public Peppol-roadmap (zie competitor-matrix: Tripleseat, Caterease, Curate, FoodStorm, TPP allen niet). Catermonkey heeft Peppol, EasyParty/MICE Operations onbekend.

**Verifieerbaar:** genereer een factuur, exporteer UBL-XML, valideer tegen Peppol BIS 3.0 schema.

### USP 4 — Chef-coach als persistent KDS-copilot

**Wat:** Rook Maart, Haiku 4.5 streaming, max 14 woorden output, severity-niveaus (praise/normal/urgent/critical), allergie-aware, kostprijs ~€0.02 per directive.

**Waarom waar:** `/api/chef-coach`-route bestaat met runtime nodejs en maxDuration 20s. Input wordt opgebouwd uit `kds_service_state` + `event_allergens` + smoker-state.

**Concurrent-gap:** geen concurrent biedt een persistente AI-coach in de keuken tijdens runtime. Apicbase heeft AI-recipe-generation maar niet live-keukenexecution. FoodStorm heeft KDS-displays maar zonder AI-coaching.

**Verifieerbaar:** start een live event in `/events/[id]/service` met allergie-data; observeer chef-coach-directives die specifiek allergie-veilig zijn.

### USP 5 — Lead-funnel + Arrangement-configurator als publieke white-label binding

**Wat:** `/aanvraag/[slug]` (lead-form) + `/arrangement/[slug]` (self-serve configurator) + `/q/[id]` (quote-portal) — drie publieke routes die volledig white-label zijn, met anonieme funnel-events tracking (geen PII).

**Waarom waar:** drie routes met theme-propagatie, server-role inserts naar `leads`-tabel, funnel-events-tabel sinds 2026-06-04.

**Concurrent-gap:** Catermonkey heeft een lead-form via Catermonkey-domein (niet white-label). MICE Operations heeft eProposals maar geen self-serve arrangement-configurator. Apicbase richt zich op back-of-house, geen klant-facing flow.

**Verifieerbaar:** open `/arrangement/hopandbites` en stel een arrangement samen; check dat de pagina volledig gebrand is (geen "Powered by BBQ Architect"-watermark; alleen in `<noscript>`-fallback en footer-pagina's).

### USP 6 — Persona-driven simpliciteit (Lars > Pro > Sam)

**Wat:** alle UX-keuzes worden expliciet afgewogen tegen drie persona's, met Lars als hoogste prioriteit. Touch-targets ≥44px op tablet, mensentaal in alle labels, drawer over center-modal, BottomNav met 5 tabs gekozen op frequentie.

**Waarom waar:** Sidebar-collapse-logica detecteert `pointer: coarse` voor tablets en houdt expanded zodat Lars labels kan lezen. Memory bevat de feedback-rules expliciet.

**Concurrent-gap:** EasyParty staat bekend om UX uit 2010-2015. Catermonkey heeft een nettere UI maar geen expliciet persona-framework dat keuze-A-vs-B beslist. Apicbase is multi-site brand-shaped (UX voor centraal F&B-team, niet voor Lars met handschoenen).

**Verifieerbaar:** open de app op een 768px touch-tablet en navigeer Lars' typische dag (Service-tab op event-dag); meet welke functionaliteiten binnen 2 taps bereikbaar zijn.

### Samenvattende positionering-zin

> *BBQ Architect is de enige NL/BE-catering-suite met klikbare AI-acties, end-to-end Peppol BIS 3.0, persistent chef-coach KDS en volledig white-label van app tot PDF tot e-mail — voor €49-€249/maand, zonder setup-fee.*

Elk woord verwijst naar een hierboven onderbouwde USP.

## 22. Tekortkomingen / gaten in BBQ Architect

Eerlijke gap-analyse versus concurrenten.

### 22.1 Enterprise-features die ontbreken

- **Geen SAML / SCIM / SSO** — Enterprise-tier biedt white-label maar geen identity-federation. Voor cateraars met IT-afdeling (Compass Group-niveau) is dit een blocker. Concurrenten zoals MICE Operations leveren dit op aanvraag.
- **Geen API voor klanten** — Pro-tier kan niet zelf scripten of integraties bouwen via een gepubliceerde API.
- **Geen multi-currency** — alleen EUR. Cateraars met buitenlandse events (luxury yacht-catering, ambassade-events) hebben USD/GBP nodig.

### 22.2 UX-features die concurrenten goed hebben

- **Geen Resource Timeline-kalender** — FullCalendar Premium heeft Resource Timeline voor crew-planning op tijd-as. Tripleseat en MICE Operations hebben vergelijkbare views. BBQ Architect's crew-planning is nu tabel-based.
- **Geen native iCal-export** — alleen Google Calendar sync (eenrichting). Klanten van Pro-cateraars willen vaak hun iPhone-Agenda zien.
- **Geen offline-mode** — PWA is online-only. Voor cateraars die op locaties zonder dekking werken (festivals, agrarische bruiloften) is dit een gap.
- **Geen native mobile-app** — alleen PWA via BottomNav. Push-notificaties beperkter dan native iOS/Android.

### 22.3 Feature-gaten in vergelijking met Apicbase

- **Three-way invoice matching** — Apicbase matched inkooporder + leverancier-factuur + ontvangen-bon automatisch. BBQ Architect heeft alleen bonnen + inkoop, niet drie-weg.
- **Constraint-based recipe-generation** — Apicbase 2025-launch: AI bouwt recept binnen dietary/allergen/target-cost-constraints. BBQ Architect's recipe-generate is enkelvoudiger.
- **Role-based AI governance** — Apicbase heeft expliciete review-approve-workflow voor AI-output. BBQ Architect heeft action_card confirm-flow, maar geen multi-role-approval.

### 22.4 Feature-gaten in vergelijking met EasyParty

- **Voor diepe magazijn-beheer** — EasyParty heeft 20 jaar features ingebakken; BBQ Architect heeft de basis maar mist specialistische tools (bv. lot-tracking, FEFO, stock-take-workflow).
- **Native Exact-koppeling** — alleen Moneybird.
- **AFAS-koppeling** — geen.

### 22.5 Polish en open items in eigen codebase

- **AiAssistant v1 (oude versie) staat nog in de repo** — 1865 regels dode code rond v2-ChatPanel. Memory zegt nog niet opgeruimd.
- **`/pricing`-pagina nog niet af** — publieke pricing-page bestaat maar is leeg/placeholder per juni 2026.
- **Events-tabel mist tijd-kolommen tot recent** — pas via migratie `008` toegevoegd. Crew-koppeling zit in aparte tabel.
- **Tailwind 3.4 nog niet 4** — CSS-first `@theme`-syntax staat op de roadmap.
- **Border-radius tokens** — memory noemt dit als polish-open-item.
- **BlockNote** — Notion-stijl rich-text-editing voor offerte-notities staat op de wishlist.

### 22.6 Gaten in marktvalidatie

- **Capterra/G2-reviews ontbreken nog** — Catermonkey heeft 0 reviews (gap voor hen), maar BBQ Architect zelf nog niet op deze platforms gevestigd. Reviews = signal voor prospects.
- **Geen openbare klant-cases buiten Hop & Bites** — single design-partner risk.
- **Geen partnership-ecosystem** — geen Rentman-bundeling, geen accountant-network, geen koksopleiding-koppeling.

## 23. Conclusie & strategische opties

### 23.1 Wat BBQ Architect feitelijk IS

Een NL-native, AI-gedreven, white-label B2B SaaS voor BBQ- en event-cateraars van 1-30 events/maand. Gebouwd door een actieve cateraar (Hop & Bites) als dogfood. Drie-tier prijsmodel zonder setup-fee. Peppol-ready 4 jaar voor de NL-mandaat. AI-block-first met klikbare action_cards. Persona-driven (Lars > Pro > Sam).

### 23.2 Waar het uniek is

Drie pijlers waar de moat zit:

1. **AI als Multiplier** — block-first met klikbare acties, chef-coach voor live keuken, prompt-caching op recipe-library, hard cost-cap per tier.
2. **NL-Native Stack** — Mollie iDEAL idempotent, Moneybird OAuth, Peppol BIS 3.0, BTW 9/21/0 server-side, KHN-HACCP, AVG-export.
3. **White-label & Theming** — 5 tokens × 8 presets × PDF/email/portal-propagatie + custom domain (Enterprise).

### 23.3 Waar het tekortschiet

- Enterprise-tier mist SAML/SCIM/SSO en multi-currency
- Geen Resource Timeline-kalender, geen native iCal, geen offline-mode, geen native mobile-app
- Apicbase heeft hogere AI-rijpheid in back-of-house (three-way invoice matching, constraint-based recipe-gen, role-based AI governance)
- EasyParty heeft 20 jaar feature-diepte op magazijn-beheer en NL-ERP-integraties (Exact, AFAS)
- Eigen polish-open-items (AiAssistant v1, `/pricing`, Tailwind v4-migratie)

### 23.4 Strategische opties voor 2026-H2 / 2027-H1

**Optie A — Verdedig NL-markt op stack-moat (Recommended)**
- Lock de NL/BE-markt via Peppol-ready-positioning vóór 2030
- Marketing-as: "Klaar voor 2030 mandaat — vandaag al"
- Win conversions vanuit Cateringpoint, Catermonkey, EasyParty op deze tailwind
- Risico: Apicbase of Tripleseat lanceert Peppol in 2027 en haalt voorsprong in

**Optie B — Verdiep Enterprise-tier**
- Bouw SAML/SCIM, custom-domain (al af), multi-currency, audit-log voor superusers
- Targeting: cateraars met IT-afdeling, multi-location-spelers
- Bouwt rate die nu gemist wordt
- Risico: scope-creep, weg van persona Lars

**Optie C — Pro-tier kantelen op Chef-coach als hero**
- Marketing-as: "De enige catering-software met een AI-chef live in je keuken"
- Lift uit USP 4
- Lage marketing-kost (al gebouwd)
- Risico: chef-coach is sterk voor BBQ-specifiek maar niet voor cold-buffet-catering — segmentatie nauwer

**Optie D — Partnership-spel**
- Rentman (event-rental bundle)
- Moneybird (accountant-channel)
- KHN (catering-vereniging)
- Risico: partnerships kosten relatie-werk

**Optie E — Marktvalidatie consolideren**
- 20 Capterra/G2-reviews verzamelen
- 3 case-studies buiten Hop & Bites
- NL-catering-community penetratie (Facebook-groepen, brancheblad)
- Lage spend, hoog effect voor SEO en social proof
- Voorwaarde voor elke andere optie

### 23.5 Slotzin

BBQ Architect is per juni 2026 het meest moderne NL-cateringproduct in een dunne markt. De échte concurrent is Excel + Moneybird + WhatsApp + Google Calendar — niet Tripleseat of Catermonkey. De voorsprong op concurrenten houdt 12-18 maanden, mits Apicbase niet diep naar event-catering kantelt en EasyParty geen radicale UX-modernisering uitvoert. Het venster om de NL-markt te claimen is nu, niet in 2027.

---

# APPENDIX — TECHNISCHE REFERENTIE

## A. Vercel cron-jobs (`vercel.json` — actief)

| Schedule | Endpoint | Functie |
|---|---|---|
| `0 3 * * *` daily 03:00 UTC | `/api/cron/anonymize-floor-plan-guests` | AVG-cleanup floor-plan-gast PII (30-dag retentie) |
| `0 4 * * *` daily 04:00 UTC | `/api/pricelists/batch/poll` | Poll Anthropic Batch-API voor leveranciers-prijslijsten |
| `0 6 * * *` daily 06:00 UTC | `/api/financien/summary` | Herbereken financiële KPI's (omzet/marges/BTW) per org |
| `15 4 * * *` daily 04:15 UTC | `/api/cron/recipe-cost-recompute` | Herprijzen recepten obv ingredient-kosten-cascade |

**Cron-jobs vermeld in dit document maar NIET in vercel.json:**
- `/api/cron/google-calendar-sync` (6h cadence) — mogelijk GitHub Actions of nog niet bedraad → **gap**
- `/api/cron/marge-alerts-scan` (6h) — referenced in sectie 5.8 → **gap**
- `/api/cron/market-pulse` (daily, opt-in) — referenced in sectie 9.11 → **gap**
- `/api/cron/ritten-vergeten` (monthly Pro/Enterprise) — referenced in sectie 10.9.4 → **gap**

**Auth:** alle cron-routes verifiëren `CRON_SECRET` in Authorization header.

## B. Volledige migratie-lijst (92 bestanden)

**Old-numbering (001-031):**

| File | Wat |
|---|---|
| `001_multi_tenant.sql` | organizations, organization_members, RLS-foundation |
| `002_health_changelog_onboarding.sql` | onboarding-workflow, activity_log |
| `003_branding_and_buckets.sql` | Storage buckets (foto's, documenten, brand-assets) |
| `004_ai_fixes.sql` | AI-context verbeteringen |
| `004_supplier_invoices.sql` | supplier_invoices table (duplicaat-nummering!) |
| `005_ai_audit_trail.sql` | ai_conversations + folders + items |
| `005_pos_inventory_cascade.sql` | POS-system (pos_orders, pos_order_items) |
| `006_pos_order_items_nullable_product.sql` | Nullability fix |
| `007_facturen_fk_koppeling.sql` | FK facturen → events, cleanup |
| `008_events_start_end_time.sql` | events.start_time / end_time |
| `009_courses_and_allergies.sql` | courses (gangen), event_allergies |
| `010_bon_processing_loop.sql` | bonnen, bon_items, bon_audit |
| `011_activation_events.sql` | Auto-fill trigger + 5-stage funnel-tracking |
| `012_kds_service_state.sql` | service_state, service_audit_logs (KDS live) |
| `013_menu_templates.sql` | menu_templates + items |
| `013_rls_supplier_invoices_kds.sql` | RLS-hardening (duplicaat!) |
| `014_recepten_into_gerechten.sql` | gerechten-tabel (merge) |
| `014b_recepten_data_migration.sql` | recepten → gerechten data-migration |
| `015_drop_recepten_table.sql` | DROP TABLE recepten |
| `016_gerechten_status.sql` | gerechten.status enum |
| `017_audit_log.sql` | Polymorphic audit_log (compliance) |
| `018_settings_full_brand_tokens.sql` | settings white-label tokens |
| `019_remap_legacy_themes.sql` | Theme-data herkaarting |
| `020_voertuigen_ritten.sql` | voertuigen, ritten, ritten_moneybird_pushes |
| `021_ritten_dedup.sql` | UNIQUE-constraint herziening |
| `022_ritten_tijd_duur_status.sql` | tijd/duur/status-velden |
| `023_concept_history.sql` | concept_history (versioning) |
| `024_email_inbox_and_review_queue.sql` | org_email_inbox, org_email_attachments, org_price_mutations |
| `025_leveranciers_extension_sync.sql` | Exact Online extensie-sync |
| `026_fix_price_mutations_leverancier_id.sql` | leverancier_id FK-fix |
| `027_leveranciers_scope_filter.sql` | Scope-filtering per org |
| `028_dedup_constraints.sql` | UNIQUE-constraints hardening |
| `029_agenda_personal.sql` | agenda_personal (user-scoped) |
| `030_webhooks_and_integration_tokens.sql` | webhooks + webhook_logs + integration_tokens |
| `031_team_uren.sql` | time_logs team/crew-context |

**New-numbering (timestamps 20260508+, 58 bestanden):**

| File | Wat |
|---|---|
| `20260508084403_security_hardening_public_access.sql` | RLS public-anoniem blokken |
| `20260508084409_security_advisor_hardening.sql` | Security Advisor feedback |
| `20260510120000_inspiratie_bibliotheek_foundation.sql` | inspiratie-bibliotheek concept-library |
| `20260510130000_inspiratie_bibliotheek_schema.sql` | inspiratie-schema's |
| `20260511120000_voorraad_topfier.sql` | marge_alerts, inventory-demand views |
| `20260511130000_boekhouder_pakket.sql` | RGS-classify + boekhouder_pakketten |
| `20260511140000_prep_kds.sql` | kitchen_stations, prep_tasks uitbreiden, kds_audit_logs |
| `20260511150000_floor_plan_mapping.sql` | floor_plans, floor_plan_guests, service_zones |
| `20260511160000_courses_gerecht_link.sql` | Explicit FK courses → gerechten |
| `20260512100000_pricelist_pdf_extractor.sql` | PDF-extractor leveranciers-prijslijsten |
| `20260513120000_pricelist_chunked_uploads.sql` | org_pricelist_uploads chunk-fields |
| `20260513140000_suggested_aliases.sql` | AI-generated product-aliases |
| `20260515120000_offerte_signed_pdf.sql` | offertes.signed_pdf_url + signed_at |
| `20260515130000_accounting_config.sql` | settings.accounting_config |
| `20260516100000_ai_usage_table.sql` | ai_usage (token tracking, cost monitoring) |
| `20260516120000_email_inbox_category.sql` | org_email_inbox.category |
| `20260516130000_persona_result.sql` | klant-profiling table |
| `20260516180000_unify_gerechten_componenten.sql` | gerechten-componenten unificatie |
| `20260516190000_allergen_fk_constraints.sql` | FK-constraints allergeen-tabellen |
| `20260518123000_haccp_v2.sql` | haccp_records v2-schema |
| `20260518192219_haccp_v3_photo_corrective_trends.sql` | HACCP v3 met foto's + corrective + trends |
| `20260519100000_mollie_webhook_idempotency.sql` | processed_mollie_events (UNIQUE) |
| `20260520120000_agenda_categories.sql` | persoonlijke calendar-categorieën |
| `20260520200000_component_folders.sql` | Component-bibliotheek mappen-hierarchie |
| `20260520220000_bonnen_archief_search.sql` | Bonnen full-text search |
| `20260521150000_menukaart_overrides.sql` | menukaart-overrides per event |
| `20260523120000_remap_to_8_presets.sql` | 8 gangen → 8 presets |
| `20260525120000_menu_view_pref.sql` | User-preferences menu-display |
| `20260525130000_bonnen_pre_audit.sql` | Pre-audit checks |
| `20260525131000_bonnen_required_columns.sql` | Required-kolommen |
| `20260525132000_bonnen_bucket_private.sql` | Storage `bonnen` → private |
| `20260525133000_bonnen_rls_lockdown.sql` | RLS op bonnen-storage |
| `20260525134000_pg_trgm_bonnen.sql` | pg_trgm trigram index voor full-text |
| `20260525135000_bon_share_tokens.sql` | bon-share JWT-tokens (boekhouder-link) |
| `20260525136000_bon_audit_log.sql` | Bon-specifieke audit-log |
| `20260525137000_bonnen_rpcs.sql` | RPC-functies bonnen-verwerking |
| `20260525138000_audit_trigger_delete_safe.sql` | Audit-log trigger safe delete |
| `20260526120000_bonnen_hash_columns.sql` | Hash-kolommen voor bon-integriteit |
| `20260527010000_event_checklist.sql` | event_checklist_items (pre-event) |
| `20260527020000_inkoop_orders.sql` | inkoop-order tracking (PO's) |
| `20260527030000_order_overrides.sql` | Order-quantity overrides manueel |
| `20260527040000_finance_copilot.sql` | AI-copilot voor financiën (KIA-scenario) |
| `20260528000000_onboarding_polish.sql` | Onboarding UX-polish |
| `20260528010000_moneybird_invoice_tracking.sql` | Moneybird-invoice status-tracking |
| `20260528020000_fix_gerechten_setup.sql` | Gerechten-setup bugfixes |
| `20260601100000_price_intelligence_application_layer.sql` | Price-intelligence UI-layer |
| `20260601120000_menu_template_items.sql` | menu_template_items uitbreiden |
| `20260601130000_leads.sql` | leads-tabel sales-pipeline |
| `20260601140000_gerechten_default_in_wizard.sql` | Gerechten-defaults klantgesprek |
| `20260601150000_ai_action_proposals.sql` | AI-action-card proposals |
| `20260601194336_fix_security_definer_views_and_meat_taxonomy.sql` | Security.DEFINER fix + meat-taxonomy seed |
| `20260601195453_add_beschrijving_blocks_to_gerechten.sql` | gerechten.beschrijving_blocks (structured) |
| `20260603120000_arrangementen.sql` | Arrangementen/pakket-deals |
| `20260604120000_arrangement_min_gasten.sql` | Arrangement min-gasten regel |
| `20260604140000_funnel_events.sql` | Sales-funnel tracking per event-status |

**Totaal: 92 migratie-bestanden ≈ 10.500 SQL-regels.**

## C. Environment-variabelen overzicht

**Supabase (verplicht):**
- `NEXT_PUBLIC_SUPABASE_URL` — PostgreSQL instance URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — public JWT (client queries)
- `SUPABASE_SERVICE_ROLE_KEY` — privileged server-token (API + admin)

**Anthropic (verplicht):**
- `ANTHROPIC_API_KEY` — Claude v0.95.1 (format: `sk-ant-api03-*`)

**Mollie iDEAL (optioneel — alleen voor payment-features):**
- `MOLLIE_API_KEY` — `test_xxx` (dev) of `live_xxx` (prod)
- `MOLLIE_REDIRECT_URL` — callback na betaling

**Moneybird (optioneel):**
- `MONEYBIRD_CLIENT_ID` — OAuth app-ID
- `MONEYBIRD_CLIENT_SECRET` — OAuth secret
- `MONEYBIRD_REDIRECT_URI` — callback

**Email (verplicht voor verzending):**
- `RESEND_API_KEY` — transactional email

**Google Calendar (optioneel):**
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN`

**Security/Webhooks:**
- `CLOUDFLARE_HMAC_SECRET` — Cloudflare Email Worker signing
- `CRON_SECRET` — Vercel cron job-auth
- `NEXT_PUBLIC_SITE_URL` — frontend URL (SSR redirects, email templates)

**Dev/test:**
- `NEXT_PUBLIC_E2E=1` — unlock /e2e-test routes
- `PLAYWRIGHT_USE_DEV=1` — Playwright tegen dev-server ipv production-build
- `ANALYZE=true` — bundle-analyzer in build

## D. pnpm scripts

| Script | Functie |
|---|---|
| `pnpm dev` | Next.js dev-server (port 3000) |
| `pnpm build` | Inject SW-version + production-build |
| `pnpm analyze` | Build met @next/bundle-analyzer (`.next/analyze/{client,server,edge}.html`) |
| `pnpm start` | Production server (na build) |
| `pnpm lint` | ESLint 9 + eslint-config-next |
| `pnpm test` | Vitest one-shot (Node env, no DOM) |
| `pnpm test:watch` | Vitest watch-mode |
| `pnpm test:visual` | Playwright visual regression (menukaart-templates, Chromium 60s timeout) |
| `pnpm test:visual:update` | Update Playwright snapshots |
| `pnpm ai-eval` | Custom Promptfoo-stijl AI-eval (`tsx scripts/ai-eval.ts`) |
| `pnpm enable-leaked-password-protection` | OAuth credential security check |
| `pnpm lint:contrast` | WCAG contrast audit (apca-w3) |
| `pnpm seed-help` | Seed help-articles database |

## E. Custom hooks (25+ uit `src/hooks/` en `src/lib/`)

**Algemene utility:**
- `useAutoSave` — draft-save naar localStorage (debounced 30s)
- `useFormAutosave` — form-specific auto-save met cleanup on unmount
- `useFormValidation` — Zod-validatie met error-mapping
- `useFocusTrap` — keyboard focus-trapping voor modals
- `useFullscreen` — Fullscreen API wrapper
- `useIsMobile` — `isPhone` / `isTablet` / `isDesktop` breakpoints
- `useWakeLock` — Screen Wake Lock API (keep tablet awake tijdens prep)
- `useMenuView` — menu-navigation state (list/grid)

**Domein-specifiek:**
- `useSupabase` — Supabase client + RLS-tenant-setup
- `usePersoneel` — staff/team context
- `useBrandLogo` — org-specifiek logo resolver
- `useActiveOfflineEvent` — Service Worker cache fallback
- `useActivityTracker` — user-activity logging
- `useAgendaFilter` — calendar-filters (datum, categorie, status)
- `useAgendaView` — calendar-view-mode (day/week/month/list)
- `useAgendaPersonal` — persoonlijke calendar (birthdays etc.)
- `useAgendaCategories` — category-tags voor events
- `useComponentFolders` — gerechten-component folder-tree
- `useVoiceSearch` — voice-to-text input
- `useSnapGrid` — template-editor snap-alignment
- `useFitToPage` — menukaart-PDF page-fit logic
- `useTemplateBranding` — white-label token-injection

**UI/interaction:**
- `useActionDispatcher` — AI-action executor (UI + DB update)
- `useCmdKShortcut` — command-palette trigger
- `useConfirm` — confirm-dialog hook (returns ShowConfirmFn)
- `useToast` — toast-notification hook (returns ShowToastFn)

## F. Componenten-tree (190+ files, top-level)

**Shared/layout:**
- `AppShell.tsx`, `Sidebar.tsx`, `PageHeader.tsx`, `PageSection.tsx`
- `CommandPalette.tsx` (cmdk-stijl, custom-build)
- `Toast.tsx` / `GlobalToast.tsx`, `ConfirmDialog.tsx`
- `ErrorBoundaryLogger.tsx`
- `LoadingState.tsx`, `EmptyState.tsx`, `ErrorCard.tsx`

**AI/automation:**
- `AIStudio.tsx`, `AiStudioOverlay.tsx`
- `AiUsageMeter.tsx`
- `AiOfferteWizard.tsx`
- `RecipeAiButton.tsx`, `RecipeFineTuneButton.tsx`

**Hub-tabs:**
- `VandaagTabs.tsx`, `PlannenTabs.tsx`, `VerkoopTabs.tsx`
- `KeukenTabs.tsx`, `RichKeukenTabs.tsx`
- `VoorraadTabs.tsx`, `GeldTabs.tsx`, `UrenTabs.tsx`
- `SysteemTabs.tsx`

**Forms/data:**
- `EventWizard.tsx`, `DishQuickEditor.tsx`
- `InventoryAutocomplete.tsx`, `KlantAutocomplete.tsx`

**Specialized:**
- `BarcodeScanner.tsx` — camera-input bon-scanning
- `TransportBlock.tsx` — logistics-cards
- `CarbonScoreCard.tsx` — ESG-metrics (op /q portal)
- `EstimatedPriceFixButton.tsx`
- `AllergenBadges.tsx`, `AllergenQueueBanner.tsx`
- `AuditTrailTimeline.tsx`
- `Changelog.tsx` — release-notes

**Nested directories (170+ sub-components):**
- `ai/` — ActionDispatcher, chat-history
- `ask-pitmaster/` — Chef-coach UI
- `charts/` — Recharts-wrappers (MarginAnalysis, RevenueChart)
- `klantgesprek/` — intake-wizard sub-components
- `logistiek/` — route-planning, delivery-tracking
- `menu/` — menu-builder, dish-browser
- `menukaart/` — PDF-template-editor (smokehouse-01, farmhouse-02, etc.)
- `mobile/` — BottomNav, sheets
- `template-editor/` — visual-template-designer (drag-drop, snap-grid)
- `voorraad/` — inventory-management UI
- `events/` — event-details-drawer, guest-list

## G. API-routes inventory (groepen, ~100+ endpoints)

| Group | Endpoints (samenvatting) |
|---|---|
| `/api/chat` | Sonnet/Opus/Haiku met respond_with_blocks tool-use |
| `/api/ai-execute` | Action-card executor met re-authorize |
| `/api/recipe-generate` | 4 modes × 3 flavours, Sonnet/Haiku routing |
| `/api/chef-coach` | Haiku streaming, 14-woord directive |
| `/api/today-briefing` | Daily ops-summary |
| `/api/klantgesprek/extract` | Haiku transcript → structured fields |
| `/api/boekhouder/*` | RGS-classify, pakket, settings, facturen, bonnen |
| `/api/bonnen/*` | Extract (Haiku vision), commit, hash, share-token |
| `/api/ritten/*` | Export, moneybird-push, scan-km |
| `/api/voorraad/*` | Demand, alerts, bestel-voorstel |
| `/api/leveranciers/*` | CRUD, pricelist-upload, retry, aliases, mutations, historie |
| `/api/pricelists/batch/*` | Batch-processing, polling |
| `/api/gerechten/*` | CRUD, component-list, cost-rollup, prompt-regenerate |
| `/api/components/*` | Component CRUD met folder-tree |
| `/api/detect-allergens` | Haiku met cache-control |
| `/api/gerecht-vision-fill` | Sonnet vision foto → recipe-fields |
| `/api/prep/*` | bulk-schedule, complete, start, skip, snooze, reassign, device-verify, device-token |
| `/api/floor-plan/*` | AI-suggest (Haiku), save-canvas, zone, guest-pin |
| `/api/calendar/*` | Google, ical, root |
| `/api/cron/*` | anonymize-floor-plan-guests, recipe-cost-recompute, pricelists-batch-poll, financien-summary |
| `/api/payments/mollie/*` | Create-payment + webhook (idempotent) |
| `/api/integrations/moneybird/*` | Connect, callback, refresh-token |
| `/api/accounting/moneybird/*` | Sync-invoices |
| `/api/financien/*` | Summary, peppol-export |
| `/api/email/inbound` | Cloudflare HMAC-verified inbound |
| `/api/send-email` | Resend wrapper |
| `/api/parse-attachment` | Sonnet vision (PDF) of UBL-parser (XML) |
| `/api/data-export` | AVG Artikel 15/20 JSON-dump (58 tables) |
| `/api/invite/*` | Lookup + accept |
| `/api/admin/*` | Health, analytics, feature-flags, impersonate, inactivity-alerts |
| `/api/extension/*` | Chrome-extension leveranciers-sync |
| `/api/menukaart/pdf/*` | PDF-rendering menukaart-templates |
| `/api/help` | Knowledge-base + support |
| `/api/templates` | Menu/PDF-template CRUD |
| `/api/support` | Support-tickets met rate-limit |
| `/api/public-offerte/[token]` | Quote-portal fetch (rate-limit 20/min) |
| `/api/public-lead-form/[slug]` | Lead-form submit + track |
| `/api/public-arrangement/[slug]` | Configurator fetch + track |
| `/api/accept-offerte` | Signed_at + signed_pdf |
| `/api/haccp/*` | Records, corrective-actions, photo, event-plan, templates |

## H. Storage buckets (Supabase)

| Bucket | Visibility | Max size | Allowed types | RLS-pattern |
|---|---|---|---|---|
| `bonnen` | PRIVATE | — | image/*, pdf | per-org folder isolation |
| `brand-assets` | PUBLIC | 5MB | image/png, image/jpeg, image/webp | upload per-org |
| `floor-plans` | PRIVATE | 5MB | image/png, image/jpeg, image/webp | `(folder)[1] IN user_org_ids` |
| `haccp-evidence` | PRIVATE | 5MB | image/png, image/jpeg, image/webp, image/heic | per-org folder |
| `email-attachments` | PRIVATE | — | * | per-org folder |
| `pricelist-pdfs` | PRIVATE | — | application/pdf | per-org folder, content_hash dedup |
| `website-images` | PUBLIC | 10MB | image/* | per-org folder |

---

# BRONNEN GEBRUIKT

**Interne bronnen:**
- BBQ Architect codebase (`/Users/mathi/Documents/GitHub/bbq-architect-v2`)
- [src/lib/navigation.tsx](src/lib/navigation.tsx) — hub-structuur
- [src/components/Sidebar.tsx](src/components/Sidebar.tsx) — sidebar-gedrag
- [src/lib/portalThemes.ts](src/lib/portalThemes.ts) — 8 OKLCH-presets
- [src/lib/branding.ts](src/lib/branding.ts) — branding-config
- [src/lib/ai/blocks.ts](src/lib/ai/blocks.ts) — AI block-schema
- [src/lib/aiCostCap.ts](src/lib/aiCostCap.ts) — tier-caps en enforcement
- [src/app/api/chat/route.ts](src/app/api/chat/route.ts) — chat-tool-architectuur
- [src/app/aanvraag/[slug]/page.tsx](src/app/aanvraag/[slug]/page.tsx) — lead-form
- [package.json](package.json) — stack-versies
- Supabase migrations folder (90 files, ~10.500 regels SQL)
- [docs/competitor-benchmark.md](docs/competitor-benchmark.md) — interne benchmark 2026-04-21
- [docs/ux-master.md](docs/ux-master.md) — hoofdoverzicht
- `~/.claude/.../bbq-competitor-analysis/references/competitor-matrix.md` — verified May 2026

**Externe bronnen (live geverifieerd 2026-06-04):**
- [catermonkey.com/en/prices](https://catermonkey.com/en/prices/) — Catermonkey pricing
- [Catermonkey Capterra-listing](https://www.capterra.com/p/233143/Catermonkey/) — sentiment
- [easyparty.nl/tarieven](https://www.easyparty.nl/tarieven/) — EasyParty pricing
- [easyparty.nl/over-easyparty](https://www.easyparty.nl/over-easyparty) — 20-jaar-claim
- [miceoperations.com/pricing](https://www.miceoperations.com/pricing) — MICE Operations pricing
- [miceoperations.com/catering-software](https://www.miceoperations.com/catering-software) — features
- [Apicbase Capterra-listing](https://www.capterra.com/p/171584/Apicbase-Restaurant-Management/) — score, pricing, sentiment
- [get.apicbase.com](https://get.apicbase.com/) — Apicbase platform
- [foodnotify.com/en/catering](https://www.foodnotify.com/en/catering) — FoodNotify features
- [foodnotify.com/en/food-costing](https://www.foodnotify.com/en/food-costing) — recipe management
- [Tripleseat Capterra-listing](https://www.capterra.com/p/118047/Tripleseat/) — US-pricing anker
- [cateringsoftware.nl](https://www.cateringsoftware.nl/) — kleine NL-speler
- [Capterra.nl catering-software-directory](https://www.capterra.nl/directory/20023/catering/) — NL-overview

**Regulatoire bronnen:**
- EU ViDA (VAT in Digital Age) — 1 juli 2030 mandaat cross-border B2B e-invoicing
- Peppol BIS 3.0 / NLCIUS v1.0 — Nederlandse standaard
- KHN HACCP — Koninklijke Horeca Nederland hygiënecode
- Belastingdienst — €0,23/km zakelijk autogebruik 2026
- AVG / GDPR — Artikel 15, 17, 20

---

*Einde document. Plakken in NotebookLM als bron. Voor updates: pas dit bestand aan en uploadt opnieuw — NotebookLM herkent de update.*
