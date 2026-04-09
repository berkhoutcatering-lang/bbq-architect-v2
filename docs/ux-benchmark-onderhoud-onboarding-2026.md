# UX Benchmark: Onderhoud & Nieuwe Klant Onboarding — BBQ Architect v2

**Datum:** 9 april 2026
**Focus:** Multi-tenant onboarding + platform maintenance
**Concurrenten:** 14 (7 catering-specifiek + 7 SaaS-leiders)

---

## Context

BBQ Architect is gegroeid van intern tool (Hop & Bites) naar een multi-tenant SaaS platform. Na tientallen feature-updates scoort het systeem #1 op feature coverage (27/32) en UX-kwaliteit (4.31/5) vs cateringconcurrenten. Maar twee operationele gebieden zijn nog niet gebenchmarked:

1. **Nieuwe klant onboarding** — hoe snel en zelfstandig kan een nieuw cateringbedrijf opstarten in eigen omgeving?
2. **Platform onderhoud** — hoe beheert de operator 5-20+ tenants zonder handmatig elk account te checken?

---

## 1. Competitieve Analyse

### 1.1 Onboarding — Catering SaaS Concurrenten

| Dimensie | BBQ Architect | Apicbase | CaterZen | Flex Catering | FoodStorm | Caterease |
|---|---|---|---|---|---|---|
| **Signup → productief** | 25+ stappen, ~30 min | 2-3 weken (begeleide setup) | Paar dagen (done-for-you) | Self-serve + templates | Guided enterprise | Training-based |
| **Self-serve capability** | 60% (admin nodig voor org) | 30% (demo-first sales) | 40% (assisted setup) | 70% (self-serve trial) | 20% (enterprise only) | 30% (training required) |
| **Template gallery** | Geen | Module templates, Academy | Quick-start menu packs | Pre-built order forms | White-label portals | BEO templates |
| **Data import** | Geen | CSV + API import | Done-for-you migratie | CSV + Zapier | API bulk import | Handmatig |
| **Branding** | Logo + 2 kleuren | Multi-unit branding | Logo + email branding | Full white-label | White-label portals | Basis logo |
| **Team provisioning** | Token invite, 3 rollen | SSO + role matrix | Email invite + roles | SSO + bulk invite | Enterprise SSO | Email invite |
| **Guided tours** | OnboardingWizard (eenmalig) | Per-module Academy | Per-tab video library | Interactive walkthroughs | Dedicated trainer | Live training |
| **Trial model** | Geen | Demo-aanvraag | Free trial + demo | 14-dag trial | Geen (enterprise) | Demo only |

**Key insight:** CaterZen's "done-for-you" model (klant gaat live binnen dagen, team helpt met data upload) is dominant in catering. Maar voor schaalbaarheid is Flex Catering's self-serve + templates model beter — BBQ Architect moet dit pad volgen.

### 1.2 Onboarding — SaaS Leiders (patronen om te kopiëren)

| Patroon | Notion | Slack | Linear | Vercel | Stripe |
|---|---|---|---|---|---|
| **Signup stappen** | 3 (email → workspace naam → use case) | 4 (email → workspace → channels → invite) | 3 (email → team → project) | 3 (email → team → deploy) | 5 (email → bedrijf → verificatie → API keys → first charge) |
| **Intent-based routing** | Vraagt "waarvoor gebruik je Notion?" → routeert naar specifieke templates en sidebar | Workspace type selectie | Team size → aangepaste setup | Framework detectie | Business type → aangepaste dashboard |
| **Template gallery** | 1000+ community templates | Channel templates per industry | Project templates | 40+ framework starters | Integration starters |
| **TTFV** | <2 min (eerste page aanmaken) | <3 min (eerste bericht sturen) | <2 min (eerste issue) | <5 min (eerste deploy) | ~15 min (eerste betaling) |
| **Progressive disclosure** | Sidebar past zich aan per use case | Channels geleidelijk ontdekken | Cycles/roadmaps pas later | Pro features achter upgrade | Advanced features achter verificatie |
| **Automation** | Custom Agents voor onboarding workflows | Slackbot tips | — | Auto-detect framework | Webhooks auto-suggest |

**Key insight:** Notion's intent-based routing (1 vraag → aangepaste ervaring) is het sterkste patroon. BBQ Architect kan dit kopiëren: "Wat voor catering doe je?" → BBQ / Bruiloft / Bedrijfscatering / Festival → specifieke templates + sidebar.

### 1.3 Maintenance & Customer Success

| Dimensie | BBQ Architect | Notion | Slack | Vercel | Stripe | Vitally/ChurnZero |
|---|---|---|---|---|---|---|
| **Admin dashboard** | Org-lijst met data counts | Admin console: seats, usage, billing | Admin dashboard: usage, compliance | Team dashboard: deploys, errors, usage | Dashboard: MRR, churn, health | Dedicated health dashboards |
| **Health score** | Geen | Geen (admin ziet seat usage) | Workspace analytics | Project health indicators | Customer health score | Multi-metric health scores |
| **Usage analytics** | Data counts only | Seat utilization, AI usage | Message volume, active users | Deploy frequency, build times | API usage, revenue metrics | Feature adoption, engagement |
| **Alerts** | Geen | Billing alerts | Compliance alerts | Deploy failure alerts | Fraud/churn alerts | Automated risk alerts |
| **Feature flags** | Geen | Plan-based features | Plan-based + admin toggles | Edge config flags | Feature gates per account | — |
| **Changelog** | Geen | notion.com/releases | Slack blog + in-app | Changelog page + in-app | Changelog + email | — |
| **Support** | Informeel (WhatsApp) | Help center + AI chat | Help center + tickets | Support tickets + docs | Docs + email + chat | — |
| **Backup/export** | Geen | Workspace export (HTML/MD/CSV) | Workspace export | — | Data export API | — |

---

## 2. Scoring Matrix

### 2.1 Onboarding Score

**Schaal:** 1-5 (1 = niet aanwezig, 3 = marktgemiddelde, 5 = best-in-class)

| Dimensie | Gewicht | BBQ Architect | Apicbase | CaterZen | Flex | Notion | Slack |
|---|---|---|---|---|---|---|---|
| Signup-to-workspace flow | 15% | **2.5** | 3.0 | 3.5 | 4.0 | 5.0 | 4.5 |
| Time-to-First-Value | 15% | **2.0** | 2.5 | 3.5 | 3.5 | 5.0 | 4.5 |
| Template/starter content | 12% | **1.5** | 3.5 | 3.0 | 3.5 | 5.0 | 3.5 |
| Data import/migratie | 10% | **1.0** | 3.5 | 4.0 | 4.0 | 4.0 | 3.0 |
| Branding customization | 10% | **3.0** | 3.5 | 2.5 | 4.5 | 2.0 | 3.0 |
| Progressive disclosure | 10% | **2.0** | 3.5 | 3.0 | 3.0 | 4.5 | 4.0 |
| Onboarding begeleiding | 10% | **3.0** | 4.0 | 4.5 | 3.5 | 3.5 | 4.0 |
| Team provisioning | 8% | **3.5** | 4.0 | 3.0 | 4.0 | 4.0 | 4.5 |
| Trial/pricing model | 5% | **1.0** | 2.0 | 3.5 | 4.0 | 4.5 | 4.0 |
| Onboarding metrics | 5% | **0.0** | 2.0 | 2.0 | 2.5 | 4.0 | 3.5 |
| **Gewogen totaal** | | **2.13** | **3.25** | **3.35** | **3.68** | **4.28** | **3.93** |

### 2.2 Maintenance Score

| Dimensie | Gewicht | BBQ Architect | Notion | Slack | Vercel | Stripe |
|---|---|---|---|---|---|---|
| Admin dashboard | 15% | **2.0** | 4.0 | 4.5 | 4.0 | 5.0 |
| Health monitoring | 15% | **0.0** | 2.0 | 3.0 | 4.0 | 5.0 |
| Geautomatiseerde alerts | 12% | **0.0** | 2.5 | 3.0 | 4.5 | 4.5 |
| Feature flags | 10% | **0.0** | 3.0 | 3.5 | 5.0 | 4.0 |
| Usage analytics | 12% | **0.5** | 3.5 | 4.0 | 4.5 | 5.0 |
| Support integratie | 10% | **0.0** | 4.0 | 4.0 | 3.5 | 4.5 |
| Self-service help | 8% | **1.5** | 4.0 | 3.5 | 4.0 | 4.5 |
| Changelog | 8% | **0.0** | 4.0 | 3.0 | 4.5 | 4.0 |
| Backup/export | 5% | **0.0** | 3.5 | 3.0 | 2.0 | 4.0 |
| Billing management | 5% | **0.0** | 4.0 | 4.0 | 4.5 | 5.0 |
| **Gewogen totaal** | | **0.58** | **3.35** | **3.55** | **4.05** | **4.65** |

### Samenvatting

| Gebied | BBQ Architect | Marktgemiddelde | Best-in-class | Gap |
|---|---|---|---|---|
| Onboarding | **2.13/5** | 3.30/5 | 4.28 (Notion) | -1.17 vs gemiddelde |
| Maintenance | **0.58/5** | 3.40/5 | 4.65 (Stripe) | -2.82 vs gemiddelde |

---

## 3. Journey Maps

### 3.1 Nieuwe Klant — Eerste 30 Dagen (huidige situatie)

| Dag | Fase | Wat gebeurt er | Emotie | Pijnpunten |
|---|---|---|---|---|
| 0 | Ontdekking | Demo/mond-tot-mond | Nieuwsgierig | Geen trial mogelijk |
| 0-1 | Registratie | Admin maakt org aan via `/admin` | Wachten op admin | Niet self-serve |
| 1 | Eerste inlog | OnboardingWizard, 30+ sidebar items | Overweldigd | Te veel opties tegelijk |
| 1-3 | Basissetup | Bedrijfsgegevens, logo, kleuren | Saai maar nodig | 9+ velden handmatig |
| 3-7 | Data invoer | Gerechten, recepten, voorraad | Vermoeid | Geen import, alles handmatig |
| 7-14 | Eerste workflow | Eerste klant + offerte + event | Tevreden | Workflow werkt goed |
| 14-30 | Adoptie | Team uitnodigen, HACCP loggen | Groeiend vertrouwen | Geen begeleiding per module |
| 30+ | Evaluatie | Doorgaan of stoppen? | Onbekend | Geen metrics of check-in |

### 3.2 Gewenste Journey (na verbeteringen)

| Dag | Fase | Wat gebeurt er | Emotie | Enablers |
|---|---|---|---|---|
| 0 | Ontdekking | Trial starten via website | Enthousiast | Self-serve trial |
| 0 | Registratie | Self-serve: naam → branding → type catering | Vlot | Intent-based routing |
| 0 | Eerste waarde | Templates geladen, eerste offerte in 5 min | **"Wow dit werkt"** | Template gallery + AI |
| 1-3 | Personalisatie | Eigen recepten importeren (CSV), team uitnodigen | Productief | CSV import + bulk invite |
| 3-7 | Verdieping | Per-module intro's bij eerste bezoek | Ontdekkend | Module intro modals |
| 7-14 | Adoptie | Eerste echte event draaien | Vertrouwen | Onboarding email drip |
| 14-30 | Optimalisatie | AI suggesties, menu engineering | Expert gevoel | Progressive feature unlock |
| 30+ | Succes | Health check, tips, changelog | Loyaal | Automated success metrics |

### 3.3 Maintenance Cyclus (gewenst)

| Frequentie | Activiteit | Automatisering |
|---|---|---|
| Realtime | Error monitoring per tenant | Auto-alert bij error spikes |
| Dagelijks | Login/activiteit check | Health score update, inactivity alert na 7 dagen |
| Wekelijks | Usage trends bekijken | Dashboard met grafieken |
| Maandelijks | Churn-risico evalueren | Rode/groene health scores |
| Per release | Changelog publiceren | In-app "Wat is nieuw" modal |
| Kwartaal | Feature adoption review | Analytics per feature per tenant |

---

## 4. Gap Analyse & Kansen

### Quick Wins (1-2 dagen per item, hoog impact)

| # | Verbetering | Huidige score | Verwachte score | Effort |
|---|---|---|---|---|
| QW-1 | **TTFV tracking** — log onboarding milestones naar DB | 0.0 → | 2.5 | 1 dag |
| QW-2 | **Changelog systeem** — in-app "Wat is nieuw" modal | 0.0 → | 3.0 | 1-2 dagen |
| QW-3 | **Inactivity alerts** — email bij >7 dagen geen login | 0.0 → | 2.5 | 1 dag |
| QW-4 | **Customer health score** — samengestelde metric in admin | 0.0 → | 3.0 | 2 dagen |

### Strategische Investeringen (3-5 dagen per item)

| # | Verbetering | Impact | Effort |
|---|---|---|---|
| SI-1 | **Template gallery** — 10 BBQ recepten, 15 gerechten, 5 menu's, 3 event-types | TTFV van 30→5 min | 3-4 dagen |
| SI-2 | **CSV Import** — drag-drop upload voor gerechten, recepten, klanten | Migratie-barriere weg | 3-4 dagen |
| SI-3 | **Self-serve org setup** — uitgebreide signup wizard (5 stappen) | Admin bottleneck weg | 2-3 dagen |
| SI-4 | **Admin Dashboard 2.0** — grafieken, health heatmap, trends | Maintenance schaalt | 3-4 dagen |
| SI-5 | **Per-module intro modals** — eerste bezoek uitleg + quick action | Adoptie versnelt | 2-3 dagen |

### Lange Termijn (week 6+)

| # | Verbetering | Effort |
|---|---|---|
| LT-1 | Feature flags per tenant (JSONB in organizations tabel) | 2-3 dagen |
| LT-2 | In-app help center met zoekbare artikelen | 3-4 dagen |
| LT-3 | Error tracking met tenant context | 2-3 dagen |
| LT-4 | Usage analytics (PostHog of custom) | 4-5 dagen |
| LT-5 | Onboarding email drip (dag 1, 3, 7, 14) | 2 dagen |
| LT-6 | Tenant data export (CSV/JSON per org) | 2 dagen |

---

## 5. Strategische Aanbevelingen — Gefaseerd Plan

### Fase 1: "Zichtbaarheid" (Week 1-2)
**Doel:** Zicht krijgen op klantgezondheid zonder handmatig te checken.

| Actie | Bestanden | Effort |
|---|---|---|
| Customer health score in admin portal | `src/app/admin/page.tsx`, `src/app/api/admin/organizations/route.ts`, nieuwe tabel `tenant_health_snapshots` | 2-3 d |
| Inactivity alerts (cron/edge function) | Nieuwe API route + Supabase Edge Function | 1-2 d |
| TTFV tracking in OnboardingProgress | `src/components/OnboardingProgress.tsx`, nieuwe tabel `onboarding_events` | 1 d |
| Changelog component | Nieuwe: `src/components/Changelog.tsx`, tabel `changelog_entries` | 1-2 d |

**Verwacht resultaat:** Maintenance score van **0.58 → ~2.0/5**

### Fase 2: "Onboarding Excellence" (Week 3-5)
**Doel:** Nieuwe klant productief (eerste offerte) binnen 15 minuten.

| Actie | Bestanden | Effort |
|---|---|---|
| Template gallery (BBQ starter packs) | Nieuwe page + seed data + import logic | 3-4 d |
| CSV import (gerechten, recepten, klanten) | Nieuwe: `CsvImporter.tsx`, API route | 3-4 d |
| Self-serve org setup (5-stap wizard) | `src/app/signup/page.tsx` uitbreiden | 2-3 d |
| Per-module intro modals | `src/components/PageHint.tsx` upgraden | 2-3 d |
| Intent-based routing ("Wat voor catering?") | Signup flow + template selectie | 1-2 d |

**Verwacht resultaat:** Onboarding score van **2.13 → ~3.5/5**

### Fase 3: "Platform Maturity" (Week 6-8)
**Doel:** 10+ tenants beheren zonder dagelijks handmatig checken.

| Actie | Bestanden | Effort |
|---|---|---|
| Admin Dashboard 2.0 (grafieken, trends) | `src/app/admin/page.tsx` + recharts | 3-4 d |
| Feature flags per tenant | Nieuwe: `src/lib/featureFlags.ts`, JSONB kolom | 2-3 d |
| In-app help center | Nieuwe page + tabel `help_articles` | 3-4 d |
| Error tracking met tenant context | ErrorBoundary + tabel `error_logs` | 2-3 d |
| Tenant data export | API route + download UI | 2 d |

**Verwacht resultaat:** Maintenance score van **~2.0 → ~3.5/5**

### Fase 4: "Schaal" (Week 9-12)
**Doel:** Klaar voor 20+ klanten.

- Usage analytics (PostHog of custom)
- Support ticketing
- Pricing page + trial model
- Onboarding email drip
- Video tutorial library (5 screencasts)

**Verwacht eindresultaat:** Onboarding **~4.0/5**, Maintenance **~4.0/5**

---

## Bronnen

- [Userpilot — Customer Health Score](https://userpilot.com/blog/customer-health-score/)
- [Vitally — How to Create a Customer Health Score](https://www.vitally.io/post/how-to-create-a-customer-health-score-with-four-metrics)
- [SaaSUI — Onboarding Flows That Convert 2026](https://www.saasui.design/blog/saas-onboarding-flows-that-actually-convert-2026)
- [CaterZen — Ultimate Catering Software FAQ](https://www.caterzen.com/blog/ultimate-catering-software-faq)
- [Apicbase — F&B Management](https://get.apicbase.com)
- [Software Advice — Best Catering Software 2026](https://www.softwareadvice.com/catering/)
- [Qrvey — Multi-Tenant Deployment Guide 2026](https://qrvey.com/blog/multi-tenant-deployment/)
- [Litmos — Top Onboarding Trends 2026](https://www.litmos.com/blog/articles/top-saas-onboarding-trends)
- [ChurnZero — Health Score](https://churnzero.com/churnopedia/health-score/)
- [UserLens — Health Score Dashboards B2B SaaS](https://userlens.io/blog/health-score-dashboards-for-b2b-saas)
