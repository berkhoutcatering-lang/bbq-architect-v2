# 16 — Gerechten analyse `/gerechten/analyse`

**Type:** Menu-performance dashboard (BCG-matrix + allergen-heatmap)
**Source:** `src/app/marges/page.tsx` (?view=performance) + `?view=health`

## Wat het moet doen

Sam ziet welke gerechten **goed verkopen + hoge marge** (Stars), welke **veel verkopen maar lage marge** (Cows), welke **lage verkoop hoge marge** (Question marks), welke **lage beide** (Dogs). Plus allergen-heatmap voor health-check per gerecht.

## Componenten
- BCG-matrix (4 kwadranten, gerechten als dots)
- Allergen-heatmap (gerechten × allergen-types)
- View-toggle: performance / health
- Filter: gang, datum-range

## State
```
loading           → skeleton matrix + heatmap
loaded-performance → BCG met dots placed
loaded-health     → allergen-coverage heatmap
empty-data        → "Nog te weinig verkoop-data — kom terug na 5 events"
```

## Acceptance
1. ✅ BCG x-as = verkoop-volume, y-as = marge%
2. ✅ Heatmap kleur-gradient: rood = ongedekt, groen = gedekt
3. ✅ Klik dot/cell → drilldown naar gerecht-detail
4. ✅ Werkt vanaf 5 events (anders empty-state)

## Bevindingen
- ✅ /marges bestaat live met BCGMatrix.tsx + GerechtKaart.tsx + MapStation.tsx (APK confirmed — was false alarm in v1)
- ❌ Onderscheid `/marges` vs `/gerechten/analyse` onduidelijk (twee routes, één concept?)
- ❌ Geen "Pak deze 3 acties" suggesties (BCG zonder advice = grafiek-zonder-actie)

## Design-prompt

```
Bouw een menu-performance dashboard voor catering-software BBQ Architect.

CONTEXT
Sam wil zien welke gerechten Star/Cow/Question/Dog zijn (BCG-matrix:
volume × marge) en welke allergen-gaps zijn. Helpt beslissen wat te
schrappen, prijsverhogen, of promoten.

LAYOUT
- Sub-tab nav: Gerechten | Componenten | Menukaarten | Analyse (active)
- View-toggle: Performance | Health
- Filter-bar: Gang | Datum-range | Min-events

PERFORMANCE-VIEW (BCG)
- 4-kwadranten chart
- X-as: verkoop-volume (events × gasten × qty)
- Y-as: brutomarge %
- Dots = gerechten, grootte = totale omzet
- Quadrant-labels:
  - Top-right: STARS (high volume, high marge)
  - Bottom-right: COWS (high volume, low marge)
  - Top-left: QUESTION (low volume, high marge)
  - Bottom-left: DOGS (low both)
- Hover dot: tooltip met gerecht-naam + cijfers
- Klik dot: drilldown naar gerecht-detail

HEALTH-VIEW (Allergen heatmap)
- Tabel: gerechten × allergens (gluten/lactose/nuts/vis/etc.)
- Kleur per cel: rood ongedekt / grijs niet-applicable / groen confirmed
- Filter "Toon alleen ongedekte"
- Bulk-action "Open allergen-queue voor 5 gerechten"

INSIGHTS-SIDEBAR (rechts)
- "Top 3 acties":
  - "Schrap [Salade van zonbloemen] — 0 verkoop in 6mo"
  - "Verhoog prijs [Tonijn-tataki] van €15 naar €18 → marge 25→45%"
  - "Allergen-data ontbreekt voor [4 gerechten] — vul aan"

COMPONENTS
- Recharts ScatterPlot voor BCG
- Custom table voor heatmap
- shadcn/ui Tabs, Card, Tooltip

ACCESSIBILITY
- BCG: tabular alternative (table met x/y/grootte)
- Heatmap: cell-kleur + tekst (geen color-only)
- Tooltip: aria-described

MOBILE
- BCG → stack 4 lijstjes (Stars/Cows/Questions/Dogs)
- Heatmap → 1-gerecht-per-card view

OUT OF SCOPE
- Geen cross-season-trends (komt in v2)
- Geen price-optimization-AI (komt in v2)

CONNECTS TO
- gerechten + factuur.items aggregaten
- /gerechten/[id] op dot-click
- /gerechten?queue=allergens voor health-actions
```
