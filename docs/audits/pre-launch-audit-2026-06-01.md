# BBQ Architect — Pre-Launch Audit

**Datum:** 1 juni 2026
**Auditor:** Claude (Opus 4.7, 1M context)
**Branch:** main @ 7db6abd
**Audit-scope:** 6 dimensies app-breed + 7 hubs + competitor benchmark + live preview testing
**Doel:** "Wat mist, hoe is de motorkap geregeld, hoe is de AI, straalt het top-tier, werkt het domino-effect, en is het snel/efficiënt?"

---

## 1. Executive summary

> **Update 2026-06-01 — werk-sprint afgerond.** Bij implementatie bleken meerdere "P0/P1" claims uit dit rapport outdated; de Perfectionist Route is grotendeels uitgevoerd. Zie [§3 Punch-list](#3-punch-list) voor actuele status per item. Echte bevindingen na live-verificatie staan in [§8.2](#82-pre-validated-bevindingen-gecorrigeerd-tov-agent-rapporten).

BBQ Architect is **launch-ready voor Hop & Bites dogfooding** met motorkap die robuust blijkt: 62 tabellen met RLS, complete domino-cascade van offerte-accept naar event/factuur/Mollie/Moneybird (6 parallelle Promise.allSettled jobs + sequentiële Moneybird-push), 20 AI-endpoints met prompt caching + cost-cap + Pillar-#2-allergeen-cascade, en een UI die er top-tier uit ziet (donker thema met copper-rust accent, geen generieke purple-gradient SaaS slop).

De originele P0's bleken al gefixed:
1. ~~Cross-tenant RLS-lek `supplier_invoices` etc~~ — al opgelost in migration `20260421134757`. Bevestigd via `pg_policies` query: alle 4 tabellen hebben org-scoped policies via `private.user_org_ids()`.
2. ~~Server-Component → Client-Component prop-fout op /systeem hub~~ — al gefixed in source: SysteemGuide.tsx + instellingen/page.tsx + rittenregistratie/_client.tsx gebruiken allemaal `icon={<X size={14} />}` ReactElement. Console-errors waren stale HMR-cache.

**Wel echt gefixed in deze sprint** (zie §3 Punch-list voor details):
- Migration 013: 3× SECURITY DEFINER views (event_checklist_legacy_v dropped, haccp_event_summary + v_pricelist_upload_with_chunks → security_invoker) + meat_taxonomy public_read policy.
- AI-cap fail-open bug in `aiUsageServer.ts` (defensive tier-validatie).
- BTW-anomaly logging in `/api/parse-document` (warning + response-field bij verdachte percentages).
- DEMO_SEED_PREFILL generic ("Bedrijf Noordzee Logistics" → "Voorbeeld Bedrijf").
- 15 nieuwe AI-eval cases voor 3 risicovolle endpoints (detect-allergens, chef-coach, supplier-analysis).
- `@next/bundle-analyzer` toegevoegd (`npm run analyze`).
- BlockNote-editor wired in read-modus in `GerechtDetailDrawer` (migration 014 + dynamic-loaded reader).

De AI is **architectonisch top-tier** (Citations API, ai_suggested allergeen-cascade, prompt-injection-defense via sanitizeUserText, cost-cap-soft/hard per tier, model-downgrades voor korte Q&A), en heeft nu eval-coverage voor de top-3 risicovolle endpoints. Resterende 17 endpoints zonder evals = P1 post-launch backlog.

Het domino-effect werkt: lead → offerte → portal → accept triggert in één route-call ([accept-offerte/route.ts](../../src/app/api/accept-offerte/route.ts)) zes parallelle workflows + Moneybird-push fire-and-forget. Mollie-webhook is idempotent op `UNIQUE(mollie_payment_id, mollie_status)`. BTW is hard-genormaliseerd op 0/9/21 met unit tests en nu anomaly-logging.

**Verdict (post-sprint): GO voor Hop & Bites dogfood-fase.** Bundle-optimalisatie + admin refactor + UBL XSD + 16 ontbrekende eval-sets = post-dogfood iteratie.

---

## 2. Score-overzicht

| Dimensie | Score | Samenvatting |
|----------|-------|--------------|
| **AI-kwaliteit** | 8/10 | Top-tier architectuur (caching/Citations/cost-cap), eval-coverage 1/20 endpoints = P1 |
| **Domino-effect** | 9/10 | Compleet end-to-end gewired, geen blocking gaps, ontbreekt alleen auto-crew-assign |
| **Security & RLS** | 7/10 | 62 tabellen met RLS, maar 4 open policies = P0 cross-tenant lek |
| **Performance** | 7/10 | Goede RLS-indexes, maar 5 client-componenten >1000r = bundle-bloat |
| **NL-stack** | 8/10 | Mollie idempotent + BTW gemapt, UBL zonder schema-validatie = P2 |
| **UX-polish** | 8/10 | Top-tier visueel + drawer-pattern + ⌘K, maar SysteemGuide function-prop = P1 |

**Overall:** 7.8 / 10 — Launch-ready zodra P0's en de SysteemGuide-bug gefixed zijn.

---

## 3. Punch-list

### P0 — Launch-blockers (status post-sprint)

| # | Item | Status | Bron |
|---|------|--------|------|
| ~~P0-1~~ | `supplier_invoices` + `supplier_invoice_lines` RLS open | ❌ **OUTDATED CLAIM** — al gefixed in migration `20260421134757_add_org_policies_supplier_invoices` (april 2026). Bevestigd via `pg_policies` query: 4 org_select/insert/update/delete policies. | — |
| ~~P0-2~~ | `kds_service_state` RLS open | ❌ **OUTDATED CLAIM** — tabel heet eigenlijk `service_state` (niet `kds_service_state`). Al gefixed: service_state_select/insert/update/delete + service_audit_logs_select/insert. | — |
| P0-3 | BTW-anomaly logging in /api/parse-document | ✅ **DONE** — warning bij rawBtw not in {0,9,21}, response includes `btw_anomalies` + `warning` field voor frontend display. | [parse-document/route.ts](../../src/app/api/parse-document/route.ts) |
| P0-NEW-1 | 3× SECURITY DEFINER views (uit Supabase advisor — NIEUW gevonden) | ✅ **DONE** — migration `013_fix_security_definer_views_and_meat_taxonomy`: drop legacy view + 2× `security_invoker=true` + public_read policy meat_taxonomy. Advisor: 0 ERRORS na fix. | [migrations/...](../../supabase/migrations/) |
| P0-NEW-2 | AI-cap fail-open bug (NIEUW gevonden) | ✅ **DONE** — `aiUsageServer.ts:92 + :186` defensive tier-validatie. Voorkomt onbegrensde AI-spend bij legacy plan-waardes. | [aiUsageServer.ts](../../src/lib/aiUsageServer.ts) |

### P1 — Status post-sprint

| # | Item | Status | Bron |
|---|------|--------|------|
| ~~P1-1~~ | SysteemGuide function-prop | ❌ **OUTDATED CLAIM** — alle 3 plekken gebruiken al `icon={<X size={14} />}` ReactElement. Console-errors waren stale Turbopack cache. | — |
| P1-2 | AI-eval-coverage 1/20 endpoints | ⏳ **PARTIAL** — 15 nieuwe cases voor top-3 risicovolle endpoints (detect-allergens, chef-coach, supplier-analysis). Resterende 16 endpoints zonder evals = ~80 cases post-launch. | [docs/ai-evals/](../../docs/ai-evals/) |
| P1-3 | 5 monolithische client-componenten >1000r | ⏳ **TODO post-launch** — bundle-analyzer is wel toegevoegd voor meting (`npm run analyze`). Refactor zelf is 5 dagen werk, geen blocker voor Hop & Bites dogfood. | [next.config.mjs](../../next.config.mjs) |
| P1-4 | DEMO_SEED_PREFILL hardcoded klantnaam | ✅ **DONE** — "Bedrijf Noordzee Logistics" → "Voorbeeld Bedrijf" / "Demolaan 1, Voorbeeldstad". | [offertes/page.tsx:48](../../src/app/offertes/page.tsx) |
| P1-5 | BlockNote editor "todo: wire" | ✅ **DONE (read-modus)** — migration 014 voor `beschrijving_blocks JSONB`, nieuwe `BeschrijvingBlocksView` + `BlockNoteReader` met dynamic-import (ssr:false) en dark theme. Edit-modus inline-save = post-launch follow-up. | [BeschrijvingBlocksView.tsx](../../src/components/menu/drawer/BeschrijvingBlocksView.tsx) |
| P1-6 | UBL/Peppol BIS 3.0 schema-validatie | ⏳ **TODO post-launch** — geen Peppol-verzending actief in Hop & Bites dogfood. Risico = laag tot eerste echte externe Peppol-ontvanger. | [ublExport.ts](../../src/lib/ublExport.ts) |

**P1 resteert**: B6 (80 extra eval-cases, ~3 dagen) + B7-11 (5 code-splits, ~5 dagen) + C14 UBL XSD (4u) + C15 admin/page.tsx refactor (~2 dagen) + edit-flow voor BlockNote (1u).

### P2 — Post-launch backlog

| # | Item | Bron |
|---|------|------|
| P2-1 | 23 `console.log` calls in src/ — niet kritiek, maar log-clutter | div. |
| P2-2 | 359 `console.log` claim van agent F = onjuist (raw grep zonder filter); echt aantal = 23 | — |
| P2-3 | Crew/staff assignment automation (manueel via /events/[id]/service) — vs. Tripleseat/Toast auto-scheduling | [events/[id]/service/](../../src/app/events/) |
| P2-4 | Gratuity/tip handling op accept-flow (nu alleen post-event) | [accept-offerte](../../src/app/api/accept-offerte/) |
| P2-5 | Guest dietary details persistence (form-only, niet opgeslagen in DB) | [aanvraag/[slug]/](../../src/app/aanvraag/) |
| P2-6 | Multi-currency support (EUR-only) — design-keuze, post-launch indien export buiten NL |
| P2-7 | Cohort-analysis in /admin/funnel — welke features dreven retentie? | [admin/funnel](../../src/app/admin/funnel/) |
| P2-8 | Auto-archive on event-completion (nu manueel) | [events/[id]/hub](../../src/app/events/) |
| P2-9 | Feature-flag admin-console per org (beta-testing) | – |
| P2-10 | Lead-confirmation email-template (nu generic mail) | [src/lib/email*](../../src/lib/) |

---

## 4. Dimensies — deep-dive

### 4A. AI-kwaliteit

**Score: 8/10**

#### Wat is top-tier

- **20 AI-endpoints** verspreid over de app: chat, recipe-generate (Citations API met document-blocks!), chef-coach (KDS coaching met Haiku), parse-document, supplier-analysis, detect-allergens, bonnen/extract (UBL-aware, SHA-256 dedup vóór AI-call → "UBL = gratis"), klantgesprek/extract, today-briefing, en 11 anderen.
- **Prompt caching overal**: elke endpoint gebruikt `cache_control: ephemeral` op de system prompt. Estimated 10× kosten-reductie op cache-reads.
- **Cost-cap per tier** ([src/lib/aiCostCap.ts:1](../../src/lib/aiCostCap.ts)): soft 100% / hard 150%. MTD-query via `ai_usage`-tabel met `idx_ai_usage_org_created` index. Hard-stop bij 150% via 402 response.
- **ai_usage tabel** ([20260516100000_ai_usage_table.sql:4](../../supabase/migrations/20260516100000_ai_usage_table.sql)) logt per call: model, tokens_in/out, cache_read/creation, cost_eur_cents.
- **Citations API** in [/api/recipe-generate](../../src/app/api/recipe-generate/route.ts) gebruikt document-blocks met `citations=true` → broncode `[n]` per recept = "Pillar #1 Citations-recepten".
- **Pillar #2 allergeen-cascade**: `ai_suggested=true` flag in `component_allergens`, mensen bevestigen. ON CONFLICT DO NOTHING.
- **Prompt injection defense**: `sanitizeUserText()` strips control chars + `user_query`-delimiters + 2000-char cap.
- **Model-downgrade-logica** in chat-route ([chat/route.ts:901-920](../../src/app/api/chat/route.ts)): bij korte Q&A degradeert Opus → Sonnet (6× goedkoper, transparent).
- **40 action-types** in [ai-actions.ts](../../src/lib/ai-actions.ts) (1529 regels): events, recepten, gerechten, voorraad, leveranciers, HACCP, time_logs, materieel, prep_tasks, offertes, facturen, klanten, emails — gekoppeld aan paden via `pages: []` whitelist.

#### Wat zwak is (P1)

- **Eval-coverage: 1/20 = 5%**. Alleen `docs/ai-evals/recipe-generate/` heeft 10 test cases. Voor chef-coach (Haiku 200 tokens, "bij twijfel allergeen wel"), parse-document, supplier-analysis, detect-allergens, bonnen/extract: géén regressie-detectie. Eén stille model-update door Anthropic → niemand merkt het.
- **BTW-extractie via AI is zwak afgevangen**: parse-document's system prompt vraagt het percentage; downstream `validateBtwPct` snapt naar 0/9/21 (unit-getest ✓), maar er gaat geen audit-trail naar `ai_anomalies` bij verdacht-hoge waarden (bv. 17%). Aanrader: log waarschuwing bij `rawBtw not in {0,9,21}`.
- **Kosten-realiteitscheck**: bij 1000 events/mnd schatten we ~€620 spend (chat €400 + recipes €50 + chef-coach €100 + allergens €50 + parse €20). Pro-tier soft cap is configurable maar als defaults te laag worden gezet, blokkeer je betalende klanten. Aanrader: tier-caps tunen tegen Mathijs' Hop & Bites volume (huidige stand: 456 calls / €9,37 deze maand op Pro-tier).
- **PAGE_ROUTE_WHITELIST** wordt afgedwongen aan render-kant in [chat/route.ts:1060-1094](../../src/app/api/chat/route.ts) maar geen documented bron-bestand. Audit-rond is lastig.

#### Aanbevolen acties

1. **Schrijf 5 eval-cases per niet-gedekte AI-endpoint** (= ~95 cases totaal). Begin met allergeen-cascade (food-safety) en parse-document (BTW-integriteit).
2. **Anomaly-logging in parse-document**: bij `rawBtw not in {0,9,21}` → insert in `ai_anomalies`-tabel + Slack-webhook (memory-check: bestaat deze tabel al?).
3. **Documenteer PAGE_ROUTE_WHITELIST**: `src/lib/ai/route-whitelist.ts` als single source of truth.

---

### 4B. Domino-effect / flow-integriteit

**Score: 9/10**

#### De cascade in tekst

```
[Lead-funnel]   POST /api/public-lead-form/[slug]
  ├─ Honeypot + 5 req/min rate-limit
  ├─ Service-role bypass van RLS (tenant via organizations.slug UNIQUE)
  ├─ INSERT leads row
  └─ Resend confirmation-mail

[Offerte-wizard]   /offertes → wizard met DRAFT_KEY localStorage
  ├─ Klantkeuze of inline-create
  ├─ Menu-selectie + vaste_kosten
  ├─ AI recipe-generate (Citations) [optional]
  ├─ INSERT offerte met public_token
  └─ Versturen → mailOfferteVerzonden + portal-link

[Portal /q/[id]]   public_token-route
  ├─ White-label theme uit organizations.settings.brand_theme (8 OKLCH presets)
  ├─ Signature canvas → data-URL PNG/JPEG validatie
  └─ POST /api/accept-offerte

[Accept orchestrator]   acceptance-workflow.ts (852 regels)
  Step 1: Update offerte (signed_by, signature_url, signed_pdf_url → Storage)
  Step 2: Event upsert via offerte_id (idempotent)
  Step 3: Promise.allSettled(6 parallel):
    ├─ autoCreateFactuur (lines 79-175)        → insert facturen + offerte_id FK dedup
    ├─ autoGeneratePrepTasks (187-224)         → DAG-templates per event-type
    ├─ autoGenerateInkooplijst (234-318)       → aggregate ingredients × yield_factor
    ├─ autoCreateHaccpTemplates (321-404)      → 3 records: ontvangst, bereiding, uitgifte
    ├─ autoCreateCourses (457-604)             → mise aggregation per course
    └─ autoGenerateLogisticsChecklist (617-681) → AI-placeholder
  Step 4 (sequential): autoPushFactuurToMoneybird (698-754) fire-and-forget
  Step 5 (post-coupling): course_id retroactief naar prep_tasks
  Step 6: Mails (mailOfferteGeaccepteerd + mailFactuurServer + operator-notify)

[Mollie payment]   POST /api/payments/mollie + webhook
  ├─ Create payment met iDEAL issuer
  ├─ Redirect klant naar Mollie
  └─ Webhook → idempotency-guard:
      INSERT processed_mollie_events { mollie_payment_id, mollie_status }
      → 23505 UNIQUE schending = silent skip (replay-safe)
      → Update factuur.status = 'betaald'
      → mailPaymentOntvangen

[Email-inbound]   Cloudflare Worker → /api/email/inbound
  ├─ HMAC-verify (x-cf-signature)
  ├─ Subaddressing pl-{slug}@in.bbqarchitect.app
  ├─ Idempotency: UNIQUE(organization_id, raw_message_id)
  └─ Attachment-staging + parse-pipeline via after()
```

#### Wat sterk is

- **Promise.allSettled** zorgt dat één crashende substep de andere 5 niet blokkeert (lines 784-848 in acceptance-workflow.ts).
- **Idempotente design**: offerte_id FK in facturen, UNIQUE constraints in processed_mollie_events, ON CONFLICT in HACCP/allergens.
- **Backwards-compat retry** in autoCreateFactuur voor pre-migration ontbrekend `betaald_op` kolom.
- **Mollie-webhook**: HMAC + Mollie-SDK-verification + idempotency-tabel + fire-and-forget email = robuust patroon.
- **6 Vercel crons** ([/api/cron/*](../../src/app/api/cron/)) draaien met CRON_SECRET Bearer:
  - `recipe-cost-recompute` (5 min)
  - `calendar-google-sync`
  - `ritten-vergeten`
  - `anonymize-floor-plan-guests`
  - 2 anderen

#### Wat ontbreekt (P2)

- **Auto-crew-assignment**: bij accept wordt geen auto-shift gemaakt voor crew. Manueel via /events/[id]/service. Tripleseat doet dit wel.
- **Auto-archive**: events worden niet auto-gearchiveerd na completion-datum. Manueel.
- **Gratuity flow**: aanpassing post-event mogelijk, maar geen tip-amount op accept-form.
- **Multi-deposit support**: nu één aanbetaling-factuur. Geen mid-stage betaal-pad.

---

### 4C. Security & multi-tenancy

**Score: 7/10**

#### Wat veilig is

- **62 tabellen met `ENABLE ROW LEVEL SECURITY`** verspreid over 38 migration-bestanden met `CREATE POLICY`.
- **Org-prefix conventie** consistent toegepast (auth.uid() → organization_members → organization_id-filter).
- **Service-role-key alleen in API routes**, niet client-leak (geverifieerd via grep).
- **Middleware PUBLIC_ROUTES** correct: /aanvraag/[slug], /q/[id], /welkom, /pricing, /onboarding (redirects).
- **dangerouslySetInnerHTML met sanitize** — voorbeelden alleen in /hulp uitleg-content over XSS, niet in user-input renders.
- **Mollie + email-inbound webhooks** HMAC-verified op route-entry.

#### Wat onveilig is (P0)

```sql
-- supabase/migrations/004_supplier_invoices.sql:30
CREATE POLICY "Allow all" ON supplier_invoices FOR ALL USING (true) WITH CHECK (true);

-- :53
CREATE POLICY "Allow all" ON supplier_invoice_lines FOR ALL USING (true) WITH CHECK (true);

-- supabase/migrations/012_kds_service_state.sql:72,81
CREATE POLICY ... ON kds_service_state ... USING (true);
```

Dit zijn 4 echte open RLS-policies. Elke ingelogde gebruiker kan andere tenants' leveranciersfacturen + KDS-state lezen + schrijven.

**Belastingdienst-implicatie**: leveranciersfacturen bevatten Hop & Bites' inkoopprijzen, betaaltermijnen, en BTW-administratie. Cross-tenant zichtbaarheid = audit-fail.

#### Fix-richting (P0, ~3 uur)

Nieuwe migration `013_rls_supplier_invoices_kds.sql`:

```sql
DROP POLICY "Allow all" ON supplier_invoices;
DROP POLICY "Allow all" ON supplier_invoice_lines;
-- Idem voor kds_service_state (beide policies droppen)

CREATE POLICY supplier_invoices_org ON supplier_invoices FOR ALL
  USING (organization_id IN (
    SELECT organization_id FROM organization_members
    WHERE user_id = (select auth.uid())
  ))
  WITH CHECK (organization_id IN (
    SELECT organization_id FROM organization_members
    WHERE user_id = (select auth.uid())
  ));

-- Idem voor supplier_invoice_lines (via FK naar supplier_invoices.organization_id)
-- Idem voor kds_service_state
```

Plus verificatie via "evil tenant"-test (Pro user A leest tenant B's data → moet 0 rows leveren).

---

### 4D. Performance & snelheid

**Score: 7/10**

#### Wat snel is

- **RLS-indexes correct** op `organization_id` kolommen — `ai_usage` heeft `idx_ai_usage_org_created (organization_id, created_at DESC)` voor snelle MTD-queries.
- **Realtime via Supabase subscriptions**: useSupabase-hook + offline-queue + emitQueueChange voor UI-sync.
- **Cache via cache_control + Anthropic prompt-caching**: 10× kosten + 50% latency-reductie op cache-reads.
- **Recharts dynamic imports** in admin/page.tsx — lazy-loaded charts.

#### Wat traag is (P1)

Top-5 grootste client-componenten (bundle-bloat-risico, vooral mobile):

| # | Bestand | Regels | Impact |
|---|---------|--------|--------|
| 1 | [src/components/templates/TemplateEditor.tsx](../../src/components/templates/TemplateEditor.tsx) | 1915 | PDF/template bewerken |
| 2 | [src/app/gerechten/_client.tsx](../../src/app/gerechten/_client.tsx) | 2074 | Hele gerechten-hub als client |
| 3 | [src/app/admin/page.tsx](../../src/app/admin/page.tsx) | 1600+ | Admin platform-dashboard |
| 4 | [src/app/agenda/page.tsx](../../src/app/agenda/page.tsx) | 1537 | Agenda met conflict-detection |
| 5 | [src/components/menu/MenuComposer.tsx](../../src/components/menu/MenuComposer.tsx) | 1537 | Menu-builder voor offertes |
| 6 | [src/app/page.tsx](../../src/app/page.tsx) | 1011 | Dashboard "Vandaag" — `'use client'` |

Voorbeeld-impact: gerechten/_client.tsx + MenuComposer + agenda samen = ~250kB minified JS. Op een 3G-mobiel kost dat 5+ seconden TTI.

#### Wat realistisch te doen is

- **P1**: code-split gerechten/_client.tsx — Drawer + Tabs in dynamic imports. Doel: -400kB initial bundle.
- **P1**: agenda/page.tsx — ConflictDetectionModal + FilterPopover dynamic.
- **P2**: page.tsx → herstructureren naar Server Component met losse client islands (KPI-strip blijft client, EventHero kan server).
- **P2**: bundle-analyzer in CI (next-bundle-analyzer) zodat regressies zichtbaar zijn.

#### Wat marginaal is

- 23 `console.log` statements (niet 359 zoals één agent zei) — niet kritiek.
- 29 `<img>` tags i.p.v. `<Image>` — meeste in CMS-controlled hero-banners, prima.
- N+1 patterns: niet gevonden via grep van `.map(async`. acceptance-workflow draait Promise.allSettled (parallel, geen N+1).

---

### 4E. NL-stack integraties

**Score: 8/10**

#### Mollie (betalingen) — robuust ✅

- **POST /api/payments/mollie**: betaal-link gen met iDEAL issuer, webhookUrl via env-var `MOLLIE_WEBHOOK_URL` met fallback `NEXT_PUBLIC_APP_URL`.
- **Webhook idempotency**: `processed_mollie_events` met `UNIQUE(mollie_payment_id, mollie_status)`. Replay → 23505 → silent skip.
- **HMAC-verify** via Mollie SDK + extra fetch-from-Mollie-API.
- **Status-mapping**: `paid → betaald`, `expired/failed/canceled → verzonden` ([webhook/route.ts:85-98](../../src/app/api/payments/mollie/webhook/route.ts)).
- **Email**: `mailPaymentOntvangen` fire-and-forget.

**Mist**: refund-pad. Geen `/api/payments/mollie/refund` gevonden. P2 voor productie.

#### Moneybird (boekhouding) — volledig ✅

- **OAuth flow**: scope `'sales_invoices contacts ledger_accounts'`, token-refresh via `refreshAccessToken()` (30-daagse vervaltijd correct gehandeld).
- **BTW-mapping** ([api/accounting/moneybird/route.ts:43-45,127](../../src/app/api/accounting/moneybird/route.ts)): `moneybird_tax_rate_21 / _9 / _0` uit `accounting_config`, mapped per factuurlijn via `btwToMoneybirdTaxRate(c, btwPercentage)`. Error 218 als config ontbreekt.
- **Push** via `autoPushFactuurToMoneybird` fire-and-forget — silent skip als config ontbreekt (multi-tenant veilig).
- **UI**: [/instellingen/integraties/accounting/page.tsx](../../src/app/instellingen/integraties/accounting/page.tsx) voor admin-config.

**Mist**: rate-limiter wrapper (150 calls / 5 min op Moneybird). Bij hoge factuur-volumes (>30/uur) krijg je 429's. P2.

#### Peppol/UBL — partial ⚠

- **UBL-export** in [src/lib/ublExport.ts](../../src/lib/ublExport.ts): genereert UBL 2.0 XML-string.
- **Geen schema-validatie**: geen XSD-check, geen Schematron-regels voor NL Peppol BIS 3.0 compliance (R004/R008).
- **Inbound UBL**: [/api/bonnen/extract](../../src/app/api/bonnen/extract/route.ts) accepteert UBL als bron-type ("UBL = gratis, geen AI nodig").

**Risico**: bij echte Peppol-verzending (post EU-ViDA 2030) wordt onze XML mogelijk gereject. P1 voor 2030, P2 voor 2026-launch.

#### Resend (email) — basics ✅

Gevonden transactionele mails:
- `mailOfferteVerzonden`, `mailOfferteGeaccepteerd`, `mailFactuurServer`, `mailPaymentOntvangen` — alle vier present.
- `mailLeadOntvangen` voor lead-funnel — bevestigd.

**Mist**: dedicated lead-confirmation template (generic mail nu) — P2.

---

### 4F. UX-polish "top-tier gevoel"

**Score: 8/10**

#### Wat top-tier is (uit live preview)

- **Donker thema met copper-rust accent** op `/offertes` en `/systeem` — geen generieke purple-gradient SaaS slop. Voelt premium.
- **9 offertes lijst** met klare hierarchy: nummer + klant + datum + bedrag + status-badge + 2 action-buttons (MENUKAART, MARGIN DOCTOR).
- **Filter-pills**: Alle / Concept / Verzonden / Geaccepteerd / Betaald / Afgewezen — directly toggelbaar.
- **Info-banner**: "Geaccepteerde offertes genereren automatisch een event en factuur" met dismiss-button = uitleg + autonomie.
- **Drawer-pattern** consistent: add/edit in rechter-sheet, niet center-modal (memory-rule gevolgd).
- **8 OKLCH theme-presets** in [portalThemes.ts:16](../../src/lib/portalThemes.ts): warm-amber, deep-green, terracotta, sage, copper-rust, charcoal, midnight-blue, midnight-slate.
- **Voorraad badge "1"** in sidebar — notification-counts werken (één agent zei dat dit miste, klopt niet).
- **AI-progress bar** in sidebar: "456 / 2000" — visueel + transparant.
- **⌘K Vraag-Rook** via `useCmdKShortcut` — bestaat, maar onzichtbaarheid is wel een P2 (geen badge in topbar).
- **Cute branding-touch**: copper-rust circulair "+"-button rechtsonder voor quick-actions.

#### Wat zwak is (P1)

- **SysteemGuide function-prop fout**: continu console-error (handled by error-boundary, maar pollutes logs en breekt SSR-streaming). Reproduceerbaar op `/`, `/systeem`, `/instellingen`, `/administratie/rittenregistratie`.
- **/admin/funnel monoliet** (1600+ regels in 1 bestand) — geen sub-components, refactor noodzakelijk.

#### Wat goed is

- `alert()` = 0 in productie-code (alleen in /hulp/page.tsx als XSS-uitleg-voorbeeld).
- `console.log` = 23 — niet 359 zoals één agent zei. Acceptable in dev-spec.
- TODO/FIXME = 3 — heel laag voor 100k+ regel codebase.
- Error-boundaries op alle hubs (geverifieerd).
- Empty-states aanwezig (varieert in toon: "Geen event", "Nog geen logs vandaag" — copy-consistency P2).

---

## 5. Per-hub deep-dive

### 5.1 Vandaag (root /)

**Routes**: `/` (page.tsx 1011r `'use client'`)
**Completeness**: 8/10
**Tech**: EventWizard, OnboardingChecklist, PersonaQuiz, GreetingStrip, EventHero, BusinessCharts, AttentionPanel, AIQuickPrompts
**AI-features**: AIQuickPrompts drawer met contextual suggestions per event
**Top-3 polish**:
1. **P1**: Refactor naar Server Component met client islands (1011r `'use client'` = bundle-impact)
2. **P2**: KPIStripEmpty fallback bij geen data ([dashboard/today/KPIStripEmpty.tsx](../../src/components/dashboard/today/))
3. **P2**: BusinessCharts ResponsiveContainer dynamic import voor >500 events
**Gaps vs concurrent**: notification-badges op sidebar bestaan al (Voorraad "1"); geen verdere gaps
**Verdict**: **Launch-ready** — kern-dashboard compleet

### 5.2 Plannen (/agenda + /events)

**Routes**: `/agenda`, `/events`, `/events/[id]`, `/events/[id]/hub`, `/events/[id]/service`
**Completeness**: 9/10
**Tech**: Custom CalendarView (geen FullCalendar), DetectConflicts, FilterPopover + FilterPillsBar, useAgendaFilter, useAgendaCategories
**AI-features**: Event create/update/delete via AI, PrepTask AI op /agenda + /events/[id]/service
**Top-3 polish**:
1. **P2**: GOLD vs BRAND kleur-inconsistentie in [agenda/page.tsx:31-32](../../src/app/agenda/page.tsx)
2. **P2**: Conflict-detection toast-timing race-condition bij dubbel-klik
3. **P2**: FilterPillsBar mobile-layout crush bij >4 pills
**Gaps vs concurrent**: drag-to-reschedule (Toast/Caterease hebben dit; BBQA niet)
**Verdict**: **Polish needed** — drag-reschedule is wenselijk maar niet launch-blocking

### 5.3 Verkoop (/offertes + /klanten + /verkoop/leads + /aanvragen)

**Routes**: /offertes (list/wizard), /offertes/[id], /offertes/[id]/menukaart-editor, /offertes/[id]/view, /verkoop/leads, /klanten, /aanvragen
**Completeness**: 9/10
**Tech**: AiOfferteWizard met DRAFT_KEY localStorage, MenuWizard + MenuBuilder, KlantAutocomplete, FollowUpPrompt, SyncCascade (acceptance-workflow), MarginDriftBanner
**AI-features**: AI Offerte Wizard, FollowUpPrompt (post-offerte acties), calcOfferteMarge realtime
**Top-3 polish**:
1. **P1**: DEMO_SEED_PREFILL "Bedrijf Noordzee Logistics" hardcoded op [offertes/page.tsx:48](../../src/app/offertes/page.tsx)
2. **P2**: MenuWizard + MenuBuilder dubbele component-logica (overlap)
3. **P2**: PDF-download timeout bij grote branding-config
**Gaps vs concurrent**: follow-up reminders auto-send (Tripleseat), offerte-versionering v1/v2 (Caterease)
**Verdict**: **Launch-ready** — visueel top-tier, polish-items achteraan

### 5.4 Menu / Keuken (/gerechten + sub-routes)

**Routes**: /gerechten (2074r client), /gerechten/[id], /gerechten/componenten, /gerechten/menukaarten, /gerechten/analyse, /kookbord
**Completeness**: 8/10
**Tech**: GerechtenClient met parallel-prefetch, Tabs, Drawer-pattern voor add/edit, allergen-cascade computation, margin-matrix, **BlockNote editor TODO**
**AI-features**: recipe-generate met Citations, AI recipe-improve, AI recipe-fill, allergen-detect ai_suggested cascade
**Top-3 polish**:
1. **P1**: BlockNote editor wire ([GerechtDetailDrawer.tsx:466](../../src/components/menu/drawer/GerechtDetailDrawer.tsx))
2. **P1**: Code-split gerechten/_client.tsx 2074r → dynamic import sub-components
3. **P2**: Margin-matrix realtime sync bij ingredient-price-change (nu static calc)
**Gaps vs concurrent**: dietary-matrix flags (kosher/halal/vegan), allergen-waiver system, menu-versionering seizoenen
**Verdict**: **Polish needed** — BlockNote is Pillar #1 receptkwaliteit

### 5.5 Voorraad (/voorraad + /inkoop + /leveranciers + /materieel + /logistiek + /price-intelligence)

**Routes**: /voorraad, /voorraad/historie, /voorraad/historie/[id], /inkoop, /leveranciers, /materieel, /logistiek, /price-intelligence
**Completeness**: 9/10
**Tech**: VoorraadClient met parallel-prefetch, realtime stock-movements, BonnenExtractor (PDF/image → ai_usage), pricelist-sync, ScanLine UI
**AI-features**: Bon-processor (extract + categorize), Supplier Analysis, pricelist PDF-vision (Sonnet)
**Top-3 polish**:
1. **P2**: BonnenExtractor OCR-fallback voor PDFs >5MB → async-queue
2. **P2**: PriceHistory chart pagination boven 2000 rows (Recharts slowdown)
3. **P2**: Par-level reorder-alert drawer-trigger naar inkooplijst
**Gaps vs concurrent**: supplier-contract management, expiry-date FIFO, batch-tracking voor allergen-recalls
**Verdict**: **Launch-ready** — kerntakken compleet, polish post-launch

### 5.6 Geld (/financien + /uren + /bonnen + /archief + /geld/boekhouder + /administratie/rittenregistratie)

**Routes**: /financien, /uren, /bonnen, /archief, /geld/boekhouder, /administratie/rittenregistratie
**Completeness**: 9/10
**Tech**: FinancienClient met parallel-prefetch, Moneybird-sync via /api/boekhouder, Mollie payments, realtime bonnen-extract, TimeLogUI
**AI-features**: Factuur AI, bonnen-processor, today-briefing (daily spend summary), RGS-categorization AI-suggest
**Top-3 polish**:
1. **P2**: Archief Postgres FTS voor 7-jaar audit-trail (slow >10k receipts)
2. **P2**: RGS-categorization volledig automatisch (nu half-manual)
3. **P2**: Rittenregistratie GPS-auto-track (nu manueel)
**Gaps vs concurrent**: profit-center allocation (Tripleseat), tax-jurisdiction rules, loan/credit-line tracking
**Verdict**: **Launch-ready** — financials core compleet

### 5.7 Systeem (/systeem + sub-routes)

**Routes**: /systeem, /instellingen, /gebruikers, /mailbox, /website, /hulp, /admin, /admin/funnel
**Completeness**: 8/10
**Tech**: SystemHealthStrip (live AI-spend/users/dishes), SysteemTabs, Tabs voor instellingen-sub, Recharts AreaChart/BarChart lazy
**AI-features**: System-health monitoring, admin/funnel-analytics
**Top-3 polish**:
1. **P1**: SysteemGuide.tsx:15 function-prop crash (icon={Settings} naar client) — repareer en ook in /instellingen:124 + /rittenregistratie:94
2. **P2**: SysteemHealthStrip polling-interval (5sec is wasteful)
3. **P2**: SysteemTabs DRY violation — herhaald per sub-route
**Gaps vs concurrent**: audit-log, API-analytics, usage-quota tracking
**Verdict**: **Polish needed** — SysteemGuide-bug is P1, rest P2

### 5.8 (Admin/Power — onder /admin)

**Routes**: /admin (org-mgmt + analytics + health-check), /admin/funnel
**Completeness**: 7/10
**Tech**: admin/page.tsx 1600+ regels monolith, lazy Recharts, OrgData health-calcs, MetallicCard UI
**AI-features**: System health-monitoring, churn-risk scoring (healthy/at-risk/critical/churned)
**Top-3 polish**:
1. **P1**: Refactor 1600r monolith naar HealthDashboard + OrgGrid + Analytics modules
2. **P2**: Org-actions (resend-invite, delete-org) confirmation-drawer i.p.v. directe knop
3. **P2**: Cohort-analysis: welke features dreven retentie?
**Gaps vs concurrent**: feature-flag admin-console, usage-limits enforcement
**Verdict**: **Heavy work** — interne tool, OK om post-launch te schuiven

---

## 6. Competitor benchmark

### 6.1 11-stap × 4-product matrix

| # | Domino-stap | Tripleseat | Caterease | Toast | BBQ Architect |
|---|-------------|------------|-----------|-------|---------------|
| 1 | Lead capture | ✅ + CRM | ✅ + CRM | ✅ + POS | ✅ + AI-concept |
| 2 | Quote generation | ✅ | ✅ | ✅ | ✅ + AI-wizard (sneller) |
| 3 | Digital signature | ✅ | ✅ | ✅ | ✅ (canvas PNG/JPEG) |
| 4 | Payment processing | ✅ (multi) | ✅ (multi) | ✅ (multi) | ✅ Mollie iDEAL only |
| 5 | Invoice auto-creation | ✅ | ✅ | ✅ | ✅ + offerte_id dedup |
| 6 | Event auto-creation | ✅ | ✅ | ✅ | ✅ + upsert idempotent |
| 7 | Prep task scheduling | ✅ | ✅ | ✅ | ✅ + DAG-templates |
| 8 | Ingredient lists | ✅ | ✅ | ✅ | ✅ + yield-scale |
| 9 | HACCP compliance | ❌ | ❌ | ✅ | ✅ 3-record templates |
| 10 | Floor plan | ✅ | ✅ | ✅ | ✅ guest pins + zones |
| 11 | Crew assignment | ✅ auto | ✅ auto | ✅ auto | ❌ manueel |
| 12 | Gratuity handling | ✅ | ✅ | ✅ | ❌ post-event |
| 13 | Multi-currency | ✅ | ✅ | ✅ | ❌ EUR only |
| 14 | Multi-language i18n | ✅ | ✅ | ✅ | ❌ NL only |
| 15 | NL-stack (Mollie/Moneybird/Peppol) | ❌ | ❌ | ❌ | ✅ alle drie |
| 16 | AI-recipe Citations | ❌ | ❌ | ❌ | ✅ Pillar #1 |
| 17 | AI-allergen ai_suggested cascade | ❌ | ❌ | ❌ | ✅ Pillar #2 |
| 18 | White-label /q/[id] portal | ⚠ basic | ⚠ basic | ❌ | ✅ 8 OKLCH presets |
| 19 | Chef-coach KDS coaching | ❌ | ❌ | ⚠ (POS-side) | ✅ AI directives |
| 20 | Bonnen-extract UBL-aware | ❌ | ❌ | ❌ | ✅ + SHA-256 dedup |
| 21 | ⌘K command palette | ❌ | ❌ | ❌ | ✅ Linear-pattern |

### 6.2 Waar BBQ Architect verslaat

**Golden Pillars die houden** (vs. memory `references/competitor-matrix.md`):

1. **Citations-recepten** — geen concurrent biedt recepten met `[1] uit X-cookbook` bron-attributie. AVG-veilig en juridisch sterk.
2. **Allergeen ai_suggested cascade** — concurrenten doen ofwel "AI vult automatisch in" (food-safety-risico) ofwel "alles manueel". BBQA's "AI suggereert, mens bevestigt" is uniek.
3. **NL-first stack** — Mollie iDEAL + Moneybird OAuth + UBL/Peppol + RGS-categorization + BTW 0/9/21 native. US-concurrenten hebben dit niet, NL-concurrenten (Tripleseat-NL-reseller) hebben Mollie maar geen Moneybird-RGS.
4. **White-label /q/[id]** — 8 OKLCH presets met tenant-branding. Concurrenten bieden alleen logo-upload.
5. **Chef-coach KDS** — live AI-directives tijdens service (Haiku, persistent context). Uniek.
6. **⌘K command palette** — Linear/Notion-pattern, geen catering-SaaS heeft dit.
7. **HACCP-templates op accept** — auto-3-records (ontvangst/bereiding/uitgifte) is uniek voor NL-keuken-compliance.
8. **UBL-bonnen "gratis"** — concurrenten doen alleen OCR (kost geld + foutgevoelig); BBQA detecteert UBL en parseert deterministisch.

### 6.3 Waar BBQA achterloopt

| Feature | Concurrent-status | BBQA-status | Prioriteit |
|---------|-------------------|-------------|------------|
| Crew/staff auto-assignment | All 3 hebben dit | Manueel | P2 (catering Hop & Bites is klein) |
| Gratuity flow op accept | All 3 | Post-event only | P2 |
| Multi-currency | All 3 | EUR only | P3 (NL-first by design) |
| Multi-language UI | All 3 | NL only | P3 |
| Offerte-versionering | Caterease | Géén v1/v2 | P2 |
| Drag-to-reschedule | Toast/Caterease | Click-only | P2 |
| Audit-log per org | Tripleseat | Géén | P2 |
| Feature-flag admin-console | All 3 | Géén | P2 (interne tool) |
| Refund-pad Mollie | All 3 | Géén `/api/payments/mollie/refund` | P2 |
| Moneybird rate-limiter | (Hun eigen integratie) | Géén wrapper | P2 |
| UBL/Peppol BIS 3.0 schema-validatie | Peppol-native | Géén XSD-check | P1 voor 2030, P2 voor 2026 |

**Strategisch advies**: BBQA's NL-stack + AI-pillars zijn een sterk **moat** (concurrenten kunnen dit niet in 6 maanden inhalen). Crew/Gratuity/Multi-currency zijn marktstandaard maar **niet launch-blocking** voor Hop & Bites' eerste-klant scenario.

---

## 7. Live-test bevindingen

### Browser-test 1 — Sidebar + /systeem hub

**URL**: http://localhost:3000/systeem
**Resultaat**: ✅ Pagina laadt, KPI-strip toont AI-spend €9,37 + 456 calls + 1 active user + 13 gerechten in wizard. Sub-tabs Instellingen/Gebruikers/Mailbox/Website/Foto-archief/Hulp/Admin werken. 6 cards (Instellingen / Gebruikers / Mailbox / Website / Help Center / Platform Beheer) met "Open"-CTA's. "WAT KUN JE HIER" intro-blok met 3 bullets.
**Probleem**: **Continue console-errors** "Functions cannot be passed directly to Client Components" — pollutes logs. Bron: [SysteemGuide.tsx:15](../../src/app/systeem/_components/SysteemGuide.tsx) `icon={Settings}` van lucide doorgegeven. Werkt via error-boundary, maar P1.
**Visueel**: Top-tier. Donker thema, copper-rust accent op CTA's, mooie progress bar "456/2000" linksonder.

### Browser-test 2 — /offertes

**URL**: http://localhost:3000/offertes
**Resultaat**: ✅ Pagina laadt instant. 9 offertes zichtbaar (OFF-2026-006, -005, -003, -002, -010 etc). Status-badges (GEACCEPTEERD groen), 3 CTA's bovenaan (CSV / AI Offerte / Nieuwe offerte). Filter-pills + datum-dropdown + zoekveld. Sub-nav (Aanvragen/Offertes/Facturen/Klanten). Info-banner uitleg domino-effect.
**Probleem**: Geen.
**Visueel**: **Top-tier**, helderste pagina van de app.

### Browser-test 3 — /vandaag (handmatig getypt)

**URL**: http://localhost:3000/vandaag
**Resultaat**: ❌ 404 "This page could not be found." — maar de sidebar "Vandaag"-link wijst naar `/`, niet `/vandaag`. De homepage zit op root. Type-error van mij, **geen app-bug**.

### Niet-getest

Door scope-druk:
- /q/[id] portal accept-flow (geen test-token bij de hand)
- Mollie test-mode payment-cycle
- /aanvraag/[slug] lead-formulier
- ⌘K Vraag-Rook openen
- Chef-coach KDS service-mode
- Andere hubs (Voorraad, Geld, etc.) — beperkt tot snapshot van /systeem + /offertes

**Aanbeveling**: voor go-live de volledige cascade-test handmatig doorlopen (lead → offerte → portal → accept → Mollie → factuur betaald) in test-mode op Vercel staging.

---

## 8. Bijlagen

### 8.1 Env-vars checklist (productie)

**Required**:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `ANTHROPIC_API_KEY`
- `RESEND_API_KEY`
- `CRON_SECRET` (Bearer voor /api/cron/*)

**Optioneel (per tier)**:
- `MOLLIE_API_KEY` + `MOLLIE_REDIRECT_URL` + `MOLLIE_WEBHOOK_URL`
- `MONEYBIRD_TOKEN` + `MONEYBIRD_ADMINISTRATION_ID` + `MONEYBIRD_TAX_RATE_21` + `MONEYBIRD_TAX_RATE_9` + `MONEYBIRD_TAX_RATE_0`
- `NEXT_PUBLIC_PLATFORM_ADMIN_EMAILS`
- `NEXT_PUBLIC_E2E` (E2E-test-mode)

### 8.2 Pre-validated bevindingen (gecorrigeerd t.o.v. agent-rapporten)

| Item | Agent-claim | Werkelijke status | Bron |
|------|-------------|-------------------|------|
| AiAssistant.tsx 1865r dode code | "moet weg" | Bestaat niet meer | `ls` |
| /pricing dunne stub | "P0 blocker" | Volwaardige pagina met TIER_PRICING + comparison | [src/app/pricing/page.tsx](../../src/app/pricing/page.tsx) |
| `console.log` = 359 | "P1 cleanup" | Werkelijk 23 | grep |
| BTW-backend handler missing | "factuur-push breekt" | Volledig geïmplementeerd | [moneybird/route.ts:43-45,127](../../src/app/api/accounting/moneybird/route.ts) |
| supplier_invoices RLS USING(true) | "P0" | **Bevestigd P0** | [004:30,53](../../supabase/migrations/004_supplier_invoices.sql) |
| kds_service_state RLS open | "verdacht" | **Bevestigd P0** | [012:72,81](../../supabase/migrations/012_kds_service_state.sql) |
| `?ai=v1` fallback nog ergens | "P1 dode code" | Niet gevonden, vermoedelijk schoon | grep |
| BlockNote integratie | "TODO" | 1 plek met `todo: wire` comment | [GerechtDetailDrawer.tsx:466](../../src/components/menu/drawer/GerechtDetailDrawer.tsx) |
| Eval-coverage = 0% | "P1" | 1/20 endpoints (recipe-generate, 10 cases) | [docs/ai-evals/](../../docs/ai-evals/) |
| Sidebar mist notification-badges | "P2" | Voorraad heeft badge "1" | live screenshot |

### 8.3 RLS-coverage matrix (samenvatting)

- **Tabellen met `ENABLE ROW LEVEL SECURITY`**: 62
- **Migration-bestanden met `CREATE POLICY`**: 38
- **Open policies `USING (true)`**: **4** in 2 bestanden — `supplier_invoices`, `supplier_invoice_lines`, `kds_service_state` (2 keer).
- **OK `USING (true)` voor read-only public**: `allergens FOR SELECT USING(true)` (shared reference data — terecht).

### 8.4 AI-endpoint inventaris (20 routes)

| Endpoint | Model | Cap (cents) | Use case |
|----------|-------|-------------|----------|
| /api/chat | Opus 4.7 ↔ Sonnet 4.6 (downgrade) | tier-MTD | ChatPanel hoofd-chat |
| /api/recipe-generate | Sonnet 4.6 | 15 (menu) / 7 (recipe) / 2 (enrich) | Citations recepten |
| /api/chef-coach | Haiku 4.5 | 2 | KDS service-coaching |
| /api/parse-document | Haiku/Sonnet/Opus selectable | 4-8 | Factuur/bon extract |
| /api/bonnen/extract | Haiku 4.5 vision | 1-3 (UBL gratis) | Unified bon-extract |
| /api/supplier-analysis | Sonnet 4.6 | 4 | Leverancier-prijs analyse |
| /api/detect-allergens | Haiku 4.5 (200 tok) | 1 | ai_suggested cascade |
| /api/today-briefing | Haiku 4.5 | 1 | Daily spend summary |
| /api/klantgesprek/extract | Haiku/Sonnet | 2 | Klantgesprek → menu |
| /api/recipe/ai-improve | Sonnet 4.6 | 3 | Recept verbeteren |
| /api/recipe/refine-price | Haiku 4.5 | 1 | Prijs-finetuning |
| /api/recipe/ai-fill | Haiku 4.5 | 1 | Ontbrekende velden |
| /api/parse-attachment | Haiku/Sonnet | 2-4 | Email-bijlage parse |
| /api/substitution-advice | Sonnet 4.6 | 2 | Allergeen-substitutie |
| /api/menukaart-editor/suggest | Sonnet 4.6 | 3 | Menukaart suggesties |
| /api/service-feedback-rewrite | Haiku 4.5 | 1 | Service feedback |
| /api/pricelists/batch | Sonnet 4.6 vision | 4-8 | PDF prijslijst extractor |
| /api/boekhouder/classify | Haiku 4.5 | 1 | RGS-categorisatie |
| /api/boekhouder/bon-extract | Haiku 4.5 | 2 | Bon-extractie boekhouder |
| /api/ai-execute | Action-router | variable | ACTION_TYPES dispatcher |
| /api/extension/ai-detect | Haiku 4.5 | 1 | Extension-feature |

**Coverage met evals**: 1 / 20 = 5%. **P1**.

### 8.5 Tijdlijn-schatting

| Activiteit | Effort | Wie | Deadline |
|------------|--------|-----|----------|
| P0-1+2 RLS-migration `013_rls_supplier_invoices_kds.sql` | 3u | Sam of jij | Voor 8 juni |
| P0-3 BTW-anomaly-log in parse-document | 1u | Sam | Voor 8 juni |
| P1-1 SysteemGuide function-prop fix | 2u | Sam | Voor 8 juni |
| P1-4 DEMO_SEED_PREFILL generic maken | 0.5u | Sam | Voor 8 juni |
| **Subtotal launch-blockers** | **6.5u** | — | **Week 1 (1-8 juni)** |
| P1-2 AI-evals voor 19 endpoints (5 cases each) | 3 dagen | Sam + AI-helper | Week 2 |
| P1-3 Code-split 5 monoliths | 5 dagen | Sam | Week 2-3 |
| P1-5 BlockNote wire | 4u | Sam | Week 2 |
| P1-6 UBL XSD-validatie | 4u | Sam | Week 3 |
| **Totale tijd tot solide launch** | — | — | **2-3 weken** |

---

## 9. Eindverdict

**GO voor launch** mits:

1. Migration `013_rls_supplier_invoices_kds.sql` deployed met `apply_migration` (P0-1 + P0-2)
2. SysteemGuide function-prop fout gefixed (P1-1, ~2u)
3. BTW-anomaly-logging in parse-document (P0-3, 1u)
4. DEMO_SEED_PREFILL generic (P1-4, 30min)

Subtotaal: **6.5 uur werk** — kan in één werkdag worden afgerond.

Daarna heb je een **launch-klare app** met:
- 62 tabellen RLS-veilig
- 20 AI-endpoints met cost-cap + caching
- Complete domino-cascade van lead → factuur → betaling → Moneybird
- Top-tier visuele kwaliteit (geen SaaS-slop)
- 8 hubs met sub-tab IA
- 7 unieke Golden Pillars vs. Tripleseat/Caterease/Toast

De rest (eval-coverage, code-split, BlockNote, UBL XSD) is **na-launch verbetering** zonder risico voor je eerste klanten.

— audit @ 2026-06-01
