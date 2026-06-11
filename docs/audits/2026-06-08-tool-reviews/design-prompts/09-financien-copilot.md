# 09 — Finance Copilot `/financien`

**Type:** Finance-dashboard + AI-insights + 7 sub-tabs
**Source-bestand:** `src/app/financien/page.tsx` + `/api/financien/summary` + `/api/financien/idea`

---

## Wat het moet doen

Sam opent /financien en ziet binnen 3 seconden: omzet YTD, openstaande facturen, foodcost-ratio, BTW-aangifte-deadline, top-klanten. Plus: **Finance Copilot AI** (Sonnet 4.6, cached prompt-prefix) geeft pro-actief 1-3 insights ("Je staat op 99,9% marge omdat foodcost ontbreekt — wil je dat ik kijk?"). 

7 sub-tabs: Dashboard / Winst & Verlies / Uitgaven / BTW / Aangifte / Cashflow / Top Klanten. Plus jaar-selector, transport-widget, Markt-Pulse (Pro-tier paywall).

Dit is de **CFO-modus** voor Sam — wat anders een boekhouder elke maand had moeten doen, doet Copilot wekelijks.

## Componenten gebruikt

- **AI insight-card** met streaming output + dismiss-action
- **Quick-prompt-chips** ("Waar mist foodcost?", "Q1 BTW concept", "Kan ik investeren?")
- **Year-selector** met `<` `>` pijltjes
- **KPI-strip-cards** (omzet / openstaand / foodcost / BTW)
- **Transport-widget** (km / aftrekbaar / ritten / events gedekt)
- **Markt-Pulse [PRO]** paywall-card
- **Recharts** voor grafieken (al in deps)

## State machine

```
loading           → KPI-skeleton + AI-thinking shimmer
loaded            → KPIs + Copilot-insight zichtbaar
ai-streaming      → text typewriter-effect Sonnet output
ai-error          → toast "Copilot niet bereikbaar" + retry
sub-tab-active    → swap content zonder volledige page-reload
empty-data-period → "Nog geen data voor 2026" + CTA "Voer eerste factuur in"
budget-exceeded   → AI-cap-warning "Soft 100%, hard 150% hit binnen 3d"
```

## Acceptance criteria

1. ✅ Finance Copilot AI-call <8s p95 met cached prompt-prefix
2. ✅ AI insights tonen alleen calculated cijfers — NOOIT AI-rekent BTW (server-side via BTW_RULES_2026)
3. ✅ Year-selector preserves selected via nuqs URL-state
4. ✅ Quick-prompt-chips open Vraag-Rook ChatPanel met prefill
5. ✅ Markt-Pulse [PRO] paywall-respect: feature unavailable voor Starter-tenants
6. ✅ Charts werken offline (cached data ≤ 5min)
7. ✅ BTW-tab toont aangifte-deadline countdown + concept-button

## Bevindingen huidige versie

### Bugs
- (Geen kritieke — Finance Copilot werkt zoals beoogd)

### UX-gaps
- **Transport-widget** toont "Events gedekt 0/2" — geen direct CTA "Koppel rit aan event" (manual via /administratie/rittenregistratie)
- **Geen AI cost-cap-progress** zichtbaar voor Sam — €9,82/€15 soft-cap zou prominent moeten zijn (memory hint)
- **Geen "kies adviseur"-flow** — boekhouder-pakket gaat naar configured email, Sam ziet niet wie
- **Q1 BTW concept** als chip is goed, maar resultaat verschijnt waar? Dialog? Nieuwe page?
- **Top-klanten-tab** ontbreekt visueel "naar klant-detail" link per row

### Visual
- AI-insight-card mooi geïntegreerd; quote-style + chips eronder is goed patroon
- **7 sub-tabs is veel** — Cashflow + W&V + Uitgaven overlappen conceptueel
- Year-selector kan datum-range-picker zijn (custom-range "feb-apr 2026")
- Grafieken (Recharts) — kleur-coding niet consistent met brand-tokens

### Cohesie
- ✅ Linked to facturen + bonnen + uren + ritten data
- ✅ Boekhouder-pakket maandelijks (cron is APK-fixed in vercel.json)
- ❌ **Geen lead-funnel-stats** ("3 leads → 2 offertes → 1 won") — financiële kant van funnel
- ❌ **Geen MRR/ARR-projectie** voor SaaS-cateraars (sommige doen abonnementen)

## Design-prompt voor externe builder

```
Bouw een finance-dashboard met AI-copilot voor catering-software BBQ Architect.

CONTEXT
Sam is cateraar-eigenaar, geen boekhouder. Wil 1× per week binnen 60s zien
hoe het ervoor staat. Finance Copilot (Claude Sonnet 4.6) geeft pro-actief
1-3 insights die de cijfers samenvatten + actie suggereren. Geen jargon.

LAYOUT
- Sub-tab nav: Financiën | Uren | Boekhoud-archief | Ritten
- Hub-tab nav: Dashboard | W&V | Uitgaven | BTW | Aangifte | Cashflow | Top Klanten
- Year-selector "< 2026 >" links
- Body-grid (responsive):

AI COPILOT CARD (prominent, top)
- Avatar + "Ik denk mee"
- Streaming output (typewriter Sonnet 4.6):
  - "Je staat op €22.561 YTD met €0 foodcost — netto-marge 99,9% klopt niet
    zonder kosten-data. Wil je dat ik kijk waar de foodcost-koppeling mist?"
- Quick-prompt-chips eronder (4-5 contextuele):
  - "Waar mist foodcost?"
  - "Q1 BTW concept"
  - "Kan ik investeren?"
  - "Pakket voor boekhouder"
- Dismiss-X om insight te negeren

KPI-STRIP (4-6 stats, horizontal scrollable op mobile)
- Omzet YTD: €22.561
- Openstaand: €4.350 (3 facturen)
- Foodcost: 0% ⚠ (data ontbreekt)
- BTW aangifte: deadline 3 maart (over 14 dagen)
- AI-cost: €9,82 / €15 soft-cap

GRAFIEK-SECTIE
- Omzet per maand (bar-chart 12 maanden)
- Marge-trend (line-chart)
- Top 5 klanten (horizontal bar)

TRANSPORT-WIDGET
- Zakelijke km: 39
- Aftrekbaar: €8,97
- Ritten: 2
- Events gedekt: 0 van 2 ⚠ (CTA: "Koppel ritten" → /administratie)

MARKT-PULSE [PRO]
- Paywall-card als Starter-tier
- Bij Pro: aggregaten van anderen, opt-in toggle

COMPONENTS
- shadcn/ui Tabs, Card, Badge, Button, ChartContainer
- Recharts voor visualisaties
- AI-streaming: stream-text via Anthropic SDK
- nuqs voor year-selector URL-state

ACCESSIBILITY
- Charts hebben tabular alternative (`<table>` met data)
- Year-selector: aria-label "Jaar 2026, vorige jaar Pijl links"
- AI-streaming: aria-live="polite"

MOBILE
- Sub-tabs collapsen naar dropdown
- KPI-strip horizontaal scrollable
- Grafieken stack 1-koloms

OUT OF SCOPE
- Geen budgetten/forecasts (komt in v2)
- Geen multi-currency (NL EUR-only)
- Geen real-time bank-sync (data via Moneybird)

HARD-RULES
- BTW-rates uit BTW_RULES_2026 server-side (NOOIT AI)
- AI-cost tracking in ai_usage tabel
- Cached prompt-prefix (Sonnet 4.6, 90% off bij cache-hit)

CONNECTS TO
- /api/financien/summary (Copilot AI)
- /api/financien/idea (single insight)
- /facturen = openstaand-detail
- /bonnen = uitgaven-detail
- /administratie/rittenregistratie = transport-detail
- /geld/boekhouder = maandpakket-download
```
