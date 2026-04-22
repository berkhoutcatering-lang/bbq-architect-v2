# Implementation Notes — BBQ Architect v2

**Datum:** 2026-04-21
**Doel:** Snelle referentie van de actuele staat — wat is gebouwd, wat staat waar, wat is TODO. Vul dit bij na elke sprint.

---

## 1. Status-dashboard (per sub-frame)

| Frame | Status | Code / data | Gaps | Playbook-ref |
|---|---|---|---|---|
| SF-1 Offerte-wizard | ✅ Live | `src/components/AiOfferteWizard.tsx`, `src/app/api/recipe-generate/` | Accuracy-eval **scaffold klaar** (10 cases) | §I |
| SF-2 Menu engineering | ✅ Live | `src/app/menu-engineering/` | Empty-state onder 20 events | — |
| SF-3 HACCP mobile | ⚠️ Gap | `src/app/haccp/` (desktop) | Field-mode tablet | H1 W7–8 |
| SF-4 Event-day field | ⚠️ Gap | Verschillende pagina's | Bottom-nav, 48px+ targets | H1 W9–10 |
| SF-5 Fin. integraties | 🟡 Deels | `featureFlags.ts` flagt, OAuth ontbreekt | Moneybird app, Mollie iDEAL | §G, §H |
| SF-6 Onboarding | ✅ Wired | `/onboarding` + `activation.ts` + `demoData.ts` | `module_tour_completed` (in IntegratiesStep) ✅, alle 9 events nu fired | §B/C/D done |
| SF-7 RLS | ✅ 95% | `user_org_ids()`, `org_*` overal, 11 lege-tabellen-policies, bucket-listing weg, POS-constraints, search_path fix, view security_invoker | Auth leaked-pw (dashboard-actie) | §A done |
| SF-8 Commercie | 🟡 Scaffold | `/pricing`, `/welkom`, `signup` | Billing (Mollie), launch-checklist | §F, §H |
| SF-9 Email-deliverability | 🟡 Deels | Resend geïntegreerd | Per-tenant DNS | (H1-H2) |
| SF-10 Billing-infra | 🔴 Niet begonnen | `featureFlags.ts` heeft tier-config; org-kolommen voor Mollie ✅ klaar | Geen Mollie Subscriptions API-route | §H |
| SF-11 Data-export | ✅ Live | `/api/data-export`, `/instellingen/data-export` met JSON-download + demo-data-cleanup | (uitbreiden naar ZIP per kwartaal) | klaar |
| SF-12 AI-eval | ✅ Light klaar | `scripts/ai-eval.ts`, 10 cases recipe-generate, `npm run ai-eval`, GitHub Actions weekly | 30 cases full | §I uitbreiden |

Legende: ✅ live · 🟢 bijna klaar · 🟡 deels · ⚠️ gap maar niet blokkerend · 🔴 niet begonnen

---

## 2. Gebouwde infrastructuur (2026-04-21)

### 2.1 Multi-tenancy
- **`organizations`** tabel met 1 rij (Berkhout)
- **`organization_members`** met 1 rij (Sam als owner)
- **`profiles`** met 1 rij
- **PostgreSQL-helper** `user_org_ids()` returnt alle org-UUIDs waar `auth.uid()` lid van is
- **RLS-policy-pattern** op alle data-tabellen:
  ```sql
  org_select: organization_id IN (SELECT user_org_ids())
  org_insert: (WITH CHECK) zelfde
  org_update: zelfde
  org_delete: zelfde
  ```
- **Speciale policies** voor publieke routes:
  - `offertes.public_quote_view` — anon mag offertes lezen met `public_token`
  - `settings`, `gangen`, `website_*` — publieke read voor klant-website-rendering

### 2.2 AI-cost tracking
- **`ai_usage`** tabel met RLS (org-gefilterd)
- **`src/lib/aiUsageServer.ts`** — server-side logger + cap-check
  - `checkAiCapServer(orgId)` returnt `{allowed, used, cap, tier, reason}` — soft-throttle > 100%, hard-block > 150%
  - `logAiUsageServer({organization_id, action_type, tokens_*, cost_eur_cents, ...})` — append-only
- **In gebruik in:** `/api/chat`, `/api/parse-document`, `/api/recipe-generate`, `/api/supplier-analysis`
- **Client-side hook:** `src/lib/aiUsage.ts` → `useAiUsageThisMonth()` (gebruikt door `AiUsageMeter`)

### 2.3 Feature-tier + paywall
- **`src/lib/featureFlags.ts`**:
  - `TIER_LIMITS` (ai-caps, events/mnd, team, storage)
  - `TIER_PRICING` (€49/€99/€249)
  - `TIER_FEATURES` (welke features per tier)
  - `useTier()` hook → `{tier, limits, pricing, hasFeature, requiresUpgradeFor}`
- **`src/components/AiUsageMeter.tsx`** — toont gebruik, kleurcodes (neutraal < 80%, goud 80–100%, amber > 100%)
- **`src/components/PaywallPrompt.tsx`** — upgrade-CTA met feature-description + target-tier

### 2.4 Activation tracking
- **`activation_events`** tabel met RLS
- **`src/lib/activation.ts`** → `logActivationEvent(orgId, type, metadata)` fire-and-forget
- **Event-types gedefinieerd:** `signup_completed`, `company_profile_saved`, `demo_data_loaded`, `demo_data_skipped`, `first_quote_draft`, `first_quote_sent`, `module_tour_completed`, `integrations_visited`, `onboarding_completed`
- **In gebruik in (na 2026-04-21 wiring-pass):**
  - `src/app/signup/page.tsx` → `signup_completed`
  - `src/app/onboarding/page.tsx` → `company_profile_saved`, `demo_data_loaded`/`demo_data_skipped`, `first_quote_draft`, `module_tour_completed`, `onboarding_completed`
  - `src/app/offertes/page.tsx` → `first_quote_sent` (alleen bij eerste verzonden offerte per org)
- **`activation_funnel` view (PG, SECURITY INVOKER):** geeft per-org tijden tussen milestones + `activated_60min` flag

### 2.5 Theme-systeem (nieuwe USP)
- **`src/components/ThemeProvider.tsx`** — leest `settings.brand_*` en zet CSS-vars
- **5 kleuren per tenant:** primary, secondary, background, card, text
- **8 gecureerde presets:** recente commits — Hop & Bites signature, etc.
- **App-breed doorgezet:** app-shell, PDF-generators, klant-portal
- **Anchor voor Enterprise `white_label`** feature

### 2.6 Routes & pagina's (nieuw / geüpdatet)
| Route | Status | Doel |
|---|---|---|
| `/welkom` | 🟡 UI af, niet in productie | Landingspagina voor niet-ingelogde bezoekers |
| `/pricing` | 🟡 UI af met FAQ | Publieke prijspagina (opgenomen in `PUBLIC_ROUTES` van middleware) |
| `/signup` | 🟡 Werkend | 2-staps flow (email/pw → name/org) |
| `/onboarding` | 🟡 UI af, persistence gapt | 5-staps flow (bedrijf → data → offerte → tour → integraties) |

### 2.7 Middleware
- **`src/middleware.ts`** — public routes: `/login`, `/signup`, `/auth/callback`, `/q/` (klant-portal), `/invite`, `/api/accept-offerte`, `/api/webhooks`, `/welkom`, `/pricing`
- Alle andere routes vereisen auth-redirect naar `/login?redirect=...`

### 2.8 Data-staat productie (2026-04-21)
- **1 tenant:** Berkhout Catering
- **114 haccp_records** (actief gebruik — goede testcase voor SF-3)
- **919 activity_log rows** (triggers-gedreven)
- **8 changelog_entries** (product-updates voor Sam)
- **3 supplier_invoices**
- **0 rijen** in `ai_usage`, `activation_events`, `support_tickets`, `portal_berichten`, alle POS-tabellen

---

## 3. Geïnstalleerde integraties + env vars

| Service | Env var | Status | Usage |
|---|---|---|---|
| Supabase | `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | ✅ Live | DB + auth + storage + realtime |
| Anthropic | `ANTHROPIC_API_KEY` | ✅ Live | Claude Opus 4.7 voor wizard + chat + recept + analysis |
| Resend | — | ✅ Geïntegreerd | Transactional emails |
| Mollie | — | 🟡 Scaffold | Payment (feature-flagged, niet live) |
| Moneybird | — | 🟡 Scaffold | Boekhoud-sync (feature-flagged, niet live) |

---

## 4. Kritieke ontdekkingen sinds strategy-docs v1

| Ontdekking | Impact |
|---|---|
| RLS is grotendeels gebouwd (niet `USING (true)`) | SF-7 is polish, geen grote bouw. Versnelt H1 met ~1 week. |
| `aiUsageServer.ts` volledig operationeel | Pillar 1 (AI als vermenigvuldiger) bewezen. Cost-cap werkt al per tenant. |
| Theme-systeem met 8 presets + 5 kleuren | Nieuw anchor voor Enterprise white-label. Meenemen in pricing-copy. |
| `activation_events` + `activation.ts` gescaffold | SF-6 infra klaar, alleen wiring-gap. |
| `public_quote_view` policy al live | Klant-portal via token werkt al veilig. |
| `PaywallPrompt` + `AiUsageMeter` componenten | Commerciële UX al ingebouwd. |
| Welkom + Pricing + Signup UI af | Launch-ready qua frontend (middleware markeert ze als public). |
| Onboarding-flow UI af maar persistence = stub | Grootste wiring-taak voor H1. |

## 4b. Wijzigingen 2026-04-21 (autonomous fix-pass)

**Database (3 migrations):**
1. `rls_policies_restant_2026_04_21` — 11 tabellen kregen org-RLS-policies (`pdf_templates`, `support_tickets`, `pos_cash_sessions`, `portal_berichten`, `activity_log`, `changelog_entries`, `changelog_reads`, `help_articles`, `help_article_feedback`, `onboarding_events`); `error_logs` revoked → service-role-only
2. `security_hardening_2026_04_21` — 6 storage-bucket listing-policies gedropt (CDN-access intact); POS anon-INSERT geconstraind tot `source='online'`; search_path gefixt op `pos_deduct_inventory()` + `pos_estimate_wait_time(uuid)`
3. `organizations_biz_fields_and_funnel_view` — 7 nieuwe kolommen op `organizations` (`kvk_number, btw_number, address, trial_ends_at, mollie_customer_id, mollie_subscription_id, subscription_status`); `activation_funnel` view (SECURITY INVOKER)
4. `fix_view_security_and_feedback_constraint` — view security_invoker; `help_article_feedback` constrained op geldig `article_id`

**Supabase advisor:** 20 → 2 findings. Resterend:
- `error_logs` "no policy" = bewust (service-role-only via REVOKE)
- `auth_leaked_password_protection` = handmatige dashboard-actie voor Sam (Authentication → Providers → Email)

**Code (5 files gewijzigd, 2 nieuwe):**
- `src/lib/demoData.ts` (nieuw) — `insertDemoData()` + `removeDemoData()` met idempotency-check
- `src/app/onboarding/page.tsx` — `BedrijfStep` persist naar `organizations`; `DataStep` roept `insertDemoData()` aan
- `src/app/signup/page.tsx` — bug-fix dubbele `res.json()` + `signup_completed` event via helper
- `src/app/offertes/page.tsx` — `first_quote_sent` event + auto status='verzonden' bij Mail-button
- `scripts/ai-eval.ts` (nieuw) — generieke evaluatie-runner met 5 expectation-types
- `docs/ai-evals/recipe-generate/case-001..010.json` (10 nieuwe cases)
- `docs/ai-evals/README.md` (nieuw)
- `package.json` — `npm run ai-eval` script

**Niet aangeraakt (vereisen Sam-actie):**
- Mollie account verification + Subscriptions setup (§H)
- Moneybird OAuth-app registration (§G)
- Auth leaked-password-protection (vereist Pro Plan upgrade — uitgesteld)
- Domein-registratie + DNS
- SF-4 Event-day field view (volgens roadmap H1 W9-10)

## 4d. Derde fix-pass 2026-04-21 (alle nog-mogelijke gaps)

**Database (2 migrations):**
- `seed_help_articles_5_starters` (failed, geen unique constraint)
- `help_articles_slug_unique_and_seed` — UNIQUE op slug + 5 articles geseed (offerte-wizard, HACCP-veldmodus, eerste-offerte, menu-engineering, data-export)

**Code (10 nieuwe files):**
- `src/lib/mollie.ts` — Mollie wrapper (customer/payment/subscription)
- `src/app/api/billing/checkout/route.ts` — start checkout-flow (auth + create customer + first payment)
- `src/app/api/billing/webhook/route.ts` — handle status-updates, create recurring subscription bij paid
- `src/lib/moneybird.ts` — OAuth + invoice-push wrapper
- `src/app/api/integrations/moneybird/connect/route.ts` — OAuth-start met state-cookie
- `src/app/api/integrations/moneybird/callback/route.ts` — OAuth-exchange + token opslaan in `feature_flags.moneybird`
- `src/app/admin/funnel/page.tsx` — activation-funnel dashboard (per-week + per-org tabel + KPIs)
- `src/app/instellingen/referral/page.tsx` — referral-code generatie + lijst + copy-link
- `src/app/events/[id]/field/page.tsx` — SF-4 event-day mobile view (timer, packlist, maps, bel-klant)

**Code (1 wijziging):**
- `src/middleware.ts` — `/api/billing/webhook` toegevoegd aan PUBLIC_ROUTES

**Code (1 verwijderd):**
- `src/components/MobileBottomNav.tsx` — was duplicate van bestaande `BottomNav.tsx`

**Wat werkt nu zonder verdere actie:**
- ✅ AVG-data-export self-service
- ✅ Referral-codes aanmaken + delen
- ✅ HACCP-veldmodus op tablet (44-72px targets)
- ✅ Event-day mobile view met timer + packlist
- ✅ Funnel-dashboard voor admin
- ✅ Help-articles in DB (gebruikt door bestaande ContextualHelp-component)
- ✅ AI-eval pipeline + 10 cases + GitHub Actions workflow

**Wat werkt zodra Sam env-vars + accounts heeft:**
- 🔌 Billing — `MOLLIE_API_KEY` (Mollie account-verificatie)
- 🔌 Moneybird-sync — `MONEYBIRD_CLIENT_ID/SECRET/REDIRECT_URI` (developer-app registratie)
- 🔌 Leaked-password-protection — Supabase Pro Plan (`npm run enable-leaked-password-protection`)

**Advisor:** 1 finding (auth_leaked_password — Pro-only, blijft tot upgrade).
**TypeScript:** exit 0.

**Database (1 migration):**
- `referral_programme_table` — `public.referrals` met RLS + `generate_referral_code()` helper

**Code (10 nieuwe files):**
- `src/app/api/data-export/route.ts` — SF-11 GET endpoint (auth + membership check + service-role export)
- `src/app/instellingen/data-export/page.tsx` — UI met download-knop + demo-data-cleanup
- `src/app/legal/layout.tsx` + `voorwaarden/page.tsx` + `privacy/page.tsx` + `dpa/page.tsx` — juridische scaffolds (concept, te reviewen door jurist)
- `src/app/haccp/field/page.tsx` — SF-3 lite: 56-72px touch-targets, presets, +/- steppers, recent-logs sidebar
- `.github/workflows/ai-eval.yml` — weekly + manual CI-job
- `scripts/enable-leaked-password-protection.ts` — eenmalig setup-script (wacht op Pro Plan)

**Code (3 wijzigingen):**
- `src/app/pricing/page.tsx` — React-key warnings opgelost in COMPARISON-table
- `src/middleware.ts` — `/legal` toegevoegd aan PUBLIC_ROUTES
- `package.json` — `npm run enable-leaked-password-protection` script

**Advisor:** 1 → 1 finding (leaked-pw blijft Pro-only).

---

## 5. Code-kaart per frame

### SF-1 (AI wizard)
- API: `src/app/api/parse-document/route.ts`
- UI: `src/app/offerte-editor/page.tsx` (AiOfferteWizard component)
- Polish: prompt in de API-route

### SF-3 (HACCP field-mode)
- UI: `src/app/haccp/page.tsx` (desktop-first)
- **Nieuwe route nodig:** `src/app/haccp/field/page.tsx` — tablet-geoptimaliseerd
- CSS: globals.css min-height-targets zetten

### SF-4 (event-day)
- UI: `src/app/events/[id]/page.tsx` + `hub/page.tsx`
- **Nieuwe component:** `src/components/MobileBottomNav.tsx`

### SF-5 (Moneybird / Mollie)
- **Nieuwe routes:** `src/app/api/integrations/moneybird/connect/route.ts`, `callback/route.ts`
- **Nieuwe lib:** `src/lib/moneybird.ts` (pushInvoiceToMoneybird, etc.)
- **Mollie:** `src/app/api/billing/*`, `src/lib/mollie.ts`

### SF-6 (onboarding)
- UI: `src/app/onboarding/page.tsx` (5 stappen)
- Lib: `src/lib/activation.ts`
- **TODO:** `src/lib/demoData.ts` (insertDemoData helper)
- **TODO wiring:** signup/page.tsx, offertes/send-flow, IntegratiesStep

### SF-7 (RLS)
- SQL: `supabase-schema.sql` + `schema-migration.sql`
- Helper: `public.user_org_ids()`
- Policies: zie playbook §A

### SF-8 (commercie)
- UI: `/welkom`, `/pricing`, `/signup`
- Middleware: `src/middleware.ts` (public routes)
- **TODO:** legal pagina's, Loom-video's in onboarding

### SF-10 (billing)
- **Geen code nog.**
- Plan: `src/app/api/billing/{checkout,webhook,portal}/route.ts`
- Nieuw: `src/lib/mollie.ts`

### SF-12 (AI-eval)
- **Geen code nog.**
- Plan: `scripts/ai-eval.ts`, `docs/ai-evals/**/*.json`, CI-job

---

## 6. Sanity-checks om te draaien

### RLS-multi-tenant-test (nu kan worden uitgevoerd)
```sql
-- Log als Sam (tenant A)
SELECT COUNT(*) FROM events; -- expect 0 (want Berkhout heeft er geen events in)
-- Log als fictieve tenant B (via testen CI)
SELECT COUNT(*) FROM events; -- expect 0 (geen cross-tenant leak)
```

### AI-cost-cap werking
```sql
SELECT
  organization_id,
  action_type,
  COUNT(*),
  SUM(cost_eur_cents)/100.0 AS cost_eur
FROM public.ai_usage
WHERE created_at >= date_trunc('month', now())
GROUP BY 1, 2 ORDER BY 3 DESC;
```

### Activation-funnel (werkt na wiring §C, §D)
```sql
-- Zie playbook §E voor de SQL view activation_funnel
```

---

## 7. Open vragen voor Sam

1. **Moneybird-integratie:** OAuth-app registration is 2–3 werkdagen wachten op Moneybird's approval — begin je dit H1 of H2?
2. **Mollie KVK-verificatie:** kost 1–2 werkdagen — wanneer start je dit zodat billing niet op launch-day blokkeert?
3. **Domein:** `bbqarchitect.nl` nog beschikbaar? Anders alternatief overwegen.
4. **Eerste 5 trial-klanten:** uit Sam's netwerk of community? Nu al 3–5 kandidaten benoemen zodat je weet tegen wie je lanceert.
5. **Demo-data-scope:** hoe diep demo-data? (vandaag: 3 klanten, 5 gerechten, 2 menu's voorgesteld — genoeg?)
6. **White-label tier:** theme-systeem opvallend genoeg om als Enterprise-anchor te gebruiken in pricing-copy?
7. **AI-eval investment:** beginnen met 30-cases light versie of direct door naar 100-cases full H1?

---

## 8. Update-ritme van dit document

- Na elke sprint: werk de status-tabel (§1) bij
- Bij nieuwe componenten/routes: voeg toe aan §2 / §5
- Bij wijziging in strategie: wijzig `product-strategy.md`, niet dit document
- Bij wijziging in DB-schema: check `§2.8 data-staat` en update
