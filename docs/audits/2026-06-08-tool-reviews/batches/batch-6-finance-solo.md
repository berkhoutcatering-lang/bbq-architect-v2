Je bouwt 1 zware tool voor BBQ Architect Design System: Finance Copilot. Eigen chat omdat 'ie complex is (7 sub-tabs + AI-streaming + Recharts visualisaties + transport-widget + Pro-paywall). Gebruik de bestaande BBQ Architect Design System tokens (`tokens.css`), brand-DNA (dark + gold + glass, Dutch casual-je, pitmaster metaphor, Lucide icons), 8 OKLCH-presets via Tweaks panel. Output: live mobile + desktop centerpiece + alle 7 sub-tabs gemockt + states (loading/streaming/cap-exceeded/empty-data).

Theme + look: dark near-black (#121214), brushed gold (#c4a35a) hairlines, amber (#FFBF00) CTA-buttons, glass-cards met blur(18px), DM Sans body + Outfit display.

---

### Tool 09 — Finance Copilot `/financien`

Sub-tab nav binnen Geld-hub: Financiën (active) | Uren | Boekhoud-archief | Ritten. Hub-tab nav: Dashboard | Winst & Verlies | Uitgaven | BTW | Aangifte | Cashflow | Top Klanten (7 sub-tabs!). Year-selector "< 2026 >" links + "Vandaag"-quick-jump.

**AI COPILOT CARD (prominent, top)** — dit is de hero van de pagina:
- Avatar Lucide Sparkles + "Ik denk mee" label
- Streaming output typewriter-effect Sonnet 4.6:
  > "Je staat op €22.561 omzet YTD met €0 foodcost — netto-marge 99,9% klopt niet zonder kosten-data. Wil je dat ik kijk waar de foodcost-koppeling mist?"
- Quick-prompt-chips eronder (4-5 contextuele):
  - "Waar mist foodcost?"
  - "Q1 BTW concept"
  - "Kan ik investeren?"
  - "Pakket voor boekhouder"
- Dismiss-X om insight te negeren
- AI-cost-indicator footer: "€9,82 / €15 soft-cap deze maand"

**KPI-STRIP (4-6 stats, horizontal scrollable op mobile)**
- Omzet YTD: €22.561
- Openstaand: €4.350 (3 facturen)
- Foodcost: 0% ⚠ (data ontbreekt) — kleur rood
- BTW aangifte: deadline 3 maart (over 14 dagen)
- AI-cost: €9,82 / €15 soft-cap

**GRAFIEK-SECTIE (Recharts)**
- Omzet per maand (bar-chart 12 maanden)
- Marge-trend (line-chart)
- Top 5 klanten (horizontal bar)

**TRANSPORT-WIDGET**
- Zakelijke km: 39
- Aftrekbaar: €8,97
- Ritten: 2
- Events gedekt: 0 van 2 ⚠ (CTA "Koppel ritten" → /administratie)

**MARKT-PULSE [PRO]**
- Paywall-card bij Starter-tier (blur + "Upgrade naar Pro €99/mo")
- Bij Pro: aggregaten van anderen ("Jij betaalt €4.20/kg voor pulled pork, gemiddelde is €3.85"), opt-in toggle

**7 SUB-TABS GEMOCKT**
1. Dashboard (default): hierboven beschreven
2. Winst & Verlies: P&L-statement met categorieën inkomsten/uitgaven/winst
3. Uitgaven: tabel met categorieën + trends + AI-classified
4. BTW: per-kwartaal opbouw + concept-aangifte-button
5. Aangifte: history van ingediende aangiftes + concept-button
6. Cashflow: 30-90 dagen forecast lijn-chart
7. Top Klanten: tabel met omzet + facturen + last-active

**STATES**
- loading: KPI-skeleton + AI-thinking shimmer
- loaded: KPIs + Copilot-insight zichtbaar
- ai-streaming: typewriter-effect Sonnet output, cancel-knop tijdens
- ai-error: toast "Copilot niet bereikbaar" + retry
- sub-tab-active: swap content zonder volledige page-reload
- empty-data-period: "Nog geen data voor 2026" + CTA "Voer eerste factuur in"
- budget-exceeded: AI-cap-warning banner "Soft 100%, hard 150% hit binnen 3d"

**INTERACTIONS**
- Year-selector: nuqs URL-state preserve
- Quick-prompt-chips: opens Vraag-Rook ChatPanel met prefill
- AI insight dismiss: localStorage 24u-snooze
- Grafiek-bars: hover tooltip met exacte cijfers
- Transport-widget "Koppel ritten" → /administratie/rittenregistratie

**COMPONENTS**
- shadcn/ui Tabs, Card, Badge, Button, ChartContainer
- Recharts voor visualisaties (BarChart, LineChart)
- AI-streaming: stream-text via Anthropic SDK pattern
- nuqs voor year-selector URL-state

**HARD-RULES**
- BTW-rates uit BTW_RULES_2026 server-side (NOOIT AI)
- AI-cost tracking in ai_usage tabel
- Cached prompt-prefix (Sonnet 4.6, 90% off bij cache-hit)

**ACCEPTANCE**
- Copilot AI-call <8s p95 met cached prompt-prefix
- AI insights tonen alleen calculated cijfers — NOOIT AI-rekent BTW
- Year-selector preserves selected via nuqs URL-state
- Quick-prompt-chips open Vraag-Rook ChatPanel met prefill
- Markt-Pulse [PRO] paywall-respect: feature unavailable voor Starter-tenants
- Charts werken offline (cached data ≤ 5min)
- BTW-tab toont aangifte-deadline countdown + concept-button

**MOBILE (375-414px)**
- Sub-tabs collapsen naar dropdown
- KPI-strip horizontaal scrollable
- Grafieken stack 1-koloms
- AI insight-card blijft prominent bovenaan

**OUT OF SCOPE**
- Geen budgetten/forecasts (komt in v2)
- Geen multi-currency (NL EUR-only)
- Geen real-time bank-sync (data via Moneybird)

---

Bouw alle 7 sub-tabs met realistische data (Hop & Bites context: €22.561 YTD, 14 facturen, 39 km transport). Toon de AI Copilot streaming-state goed (typewriter effect). Toon de Markt-Pulse paywall-state als Starter en Pro variant.
