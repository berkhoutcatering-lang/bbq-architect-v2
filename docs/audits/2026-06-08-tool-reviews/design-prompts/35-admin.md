# 35 — Platform admin `/admin`

**Type:** Multi-tenant super-admin dashboard (Sam-only)
**Source:** `src/app/admin/page.tsx` + `/api/admin/*`

## Wat het moet doen

Alleen Sam (platform-admin uit `PLATFORM_ADMIN_EMAILS` env) ziet dit. Beheert alle tenants: org-lijst, abonnementen, AI-spend per tenant, gezondheidsscores, impersonate, retention-tools.

## Componenten
- Organizations-tabel (alle tenants)
- KPI-strip (totaal MRR, totaal AI-spend, actieve users)
- Per-org actions (impersonate, suspend, manual-billing, AVG-export)
- Feature-flags toggle
- Health/Funnel/Activity views

## Acceptance
1. ✅ PLATFORM_ADMIN_EMAILS env-check gated (APK confirmed: "Toegang geweigerd" voor non-admins)
2. ✅ Impersonate = audit-logged + cookie banner "Je bent ingelogd als X"
3. ✅ AI-cost-cap warning per tenant (soft 100% / hard 150%)
4. ✅ AVG-export complete dataset per tenant (Article 15/20)

## Bevindingen
- ✅ /admin/health + /admin/analytics + /admin/feature-flags + /admin/retention bestaan
- ✅ APK confirmed: tier-restriction werkt correct ("Toegang geweigerd")
- ❌ Mogelijk veel sub-routes onbekend — diepe audit vereist apart

## Design-prompt

```
Bouw een platform-admin dashboard voor multi-tenant BBQ Architect.

CONTEXT
Alleen Sam (PLATFORM_ADMIN_EMAILS env-check). Beheert alle ~15-50 tenants:
abonnementen, AI-spend, health-scores, support-tickets. Impersonate-flow
voor support.

LAYOUT
- Sub-tab nav: Instellingen | ... | Admin (active)
- Sub-pages: Overzicht | Organisaties | Health | Funnel | AI-cost | Feature-flags | Retention | Tickets

OVERZICHT (homepage)
- KPI-strip: Totaal tenants | MRR (€) | Actieve users | AI-spend deze maand
- Alerts: "3 tenants over cost-cap" / "2 tickets open" / "1 AVG-request pending"
- Recent activity feed

ORGANISATIES (tabel)
- Cols: Naam | Tier (Starter/Pro/Enterprise) | Sinds | Users | MRR | Health-score | Last active | Acties
- Per-org actions:
  - Impersonate (cookie + redirect /vandaag)
  - View details (drawer met al tabs)
  - Suspend (status='suspended', read-only voor tenant)
  - Manual billing (override Mollie)
  - AVG-export (Article 15: dataset download)
  - AVG-delete (Article 17: right-to-be-forgotten)

HEALTH
- Per tenant health-score (activity*0.4 + dataRichness*0.3 + adoption*0.3)
- Lijst at-risk (<30) + critical (<15)
- "Send re-onboarding email" bulk-action

FUNNEL
- KPI per stap: signup → quiz_completed → first_offerte → first_offerte_sent
- Per-tenant breakdown
- Trends-chart over tijd

AI-COST
- Per-tenant + per-endpoint AI-spend
- Cap-violation warnings (soft 100% / hard 150%)
- "Suspend AI voor tenant" action

FEATURE-FLAGS
- Per-feature toggle per tenant (markt-pulse / chrome-extension / etc.)
- Global default + per-tenant override
- Audit-log van wijzigingen

RETENTION
- Inactive >30d lijst
- Auto-anonymize na 12 maanden (privacy)
- Manual cleanup tools

TICKETS
- Support-ticket lijst (support_tickets tabel)
- Per-ticket reply + close

IMPERSONATE FLOW
- Klik "Impersonate" op tenant
- Cookie set: bbq_impersonate_org={tenant_id}
- Redirect /vandaag
- Banner "🛠 Je bent ingelogd als {tenant.naam} — Stop impersonate"
- Audit-log entry: who impersonated who when
- Stop-impersonate = clear cookie + redirect /admin

COMPONENTS
- shadcn/ui Tabs, Table, Dialog, Drawer
- TanStack Table met sortable cols
- Recharts voor trend-charts

ACCESSIBILITY
- Impersonate-banner: aria-live="assertive"
- Actions per row: aria-label "Impersonate Hop & Bites"

HARD RULES (kritiek)
- Alleen email in PLATFORM_ADMIN_EMAILS heeft toegang (server-side check)
- Impersonate = audit-log VERPLICHT
- AVG-export volledig (geen velden missen)
- AVG-delete = cascading + cryptografisch (geen restore mogelijk)
- Cost-cap-suspend = AI-routes blocken via server-action

CONNECTS TO
- organizations + organization_members
- ai_usage (aggregaten per tenant)
- activation_events (funnel)
- support_tickets
- Cron /api/admin/inactivity-check
- POST /api/admin/impersonate
- POST /api/admin/export (AVG)
- POST /api/admin/retention (anonymize)
```
