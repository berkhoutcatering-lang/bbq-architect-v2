# 15 — Componenten library `/gerechten/componenten`

**Type:** Atomic-recipe-library (bouwstenen) met cost+allergen-cascade
**Source:** `src/app/gerechten/componenten/page.tsx`

## Wat het moet doen

Bouwstenen voor gerechten. "Zelf-bereid" (Sam's gerookte ananas-salsa) + "Inkoop" (Sligro-product). Wijzig componenten éénmaal → ALLE gerechten met die component updaten cost + allergens. Auto-propagatie via DB-triggers.

## Componenten
- Component-lijst (tabel of grid)
- 4 actions top: AI Genereer / Bedenker Studio / Nieuw component / Importeer leverancier
- Hero stat-circle: "9 COMPONENTEN — 0% via AI"

## State
```
loading       → skeleton
loaded        → 9 componenten
ai-generating → AI Genereer modal (variatie-prompts)
importeren    → leverancier-catalogus import-flow
```

## Acceptance
1. ✅ Cost-cascade trigger werkt (gerecht-cost recompute on component change)
2. ✅ Allergen-cascade via MV (refresh_gerecht_allergens_mv trigger)
3. ✅ "0% via AI"-stat zichtbaar — Sam wil zien wat hij vs AI maakt
4. ✅ Importeer leverancier: bulk-add van Sligro/Bidfood catalogus

## Bevindingen
- ✅ Componenten-architectuur is solide (cascade werkt, MV verified)
- ⚠️ Allergen-adoptie laag (#32 — slechts deel ingevuld)
- ❌ Geen "welke gerechten gebruiken deze component"-back-link

## Design-prompt

```
Bouw een componenten-library (atomic recipes) voor BBQ Architect.

CONTEXT
Component = bouwsteen (gerookte ananas-salsa, BBQ-rub, pulled pork basis).
Wijzig ééns → alle gerechten met die component cascade-update qua cost +
allergens. Belangrijke "design-system" voor Sam's recept-database.

LAYOUT
- Sub-tab nav: Gerechten | Componenten (active) | Menukaarten | Analyse
- Header: "Componenten" + count + 4 actions
  - "AI Genereer" (variatie-prompts via Sonnet)
  - "Bedenker Studio" (handmatig)
  - "+ Nieuw component"
  - "Importeer leverancier" (catalogus-import)
- Hero stat: cirkel "9 COMPONENTEN — 0% via AI" (visualization of AI-adoption)
- Body:
  - Filter pills: Alle / Zelf-bereid / Inkoop / Per leverancier
  - Tabel-cols: Naam | Categorie | Cost €/eenheid | Allergens | "Used in N gerechten" | Bron
  - Klik row → drawer met edit + impact-preview

EDIT-DRAWER
- Component-fields: naam, categorie, eenheid (kg/L/stuk), basis-cost
- Allergens-pills (multi-select, confirmed-by-user)
- Bereidings-instructies (BlockNote, voor zelf-bereid)
- Leverancier-link (voor inkoop)
- "Impact-preview": "Wijzigt cost van 5 gerechten" + lijst

CASCADE-VISUAL
- Component A → 5 gerechten visualisatie (graph-mini)
- "Wijzig cost → +€0.30 per portie in:" lijst
- Vóór commit: confirm "Pas toe op 5 gerechten"

IMPORT-FLOW
- Upload CSV / paste tekst van leverancier-prijslijst
- AI parse via /api/parse-pricelist (Sonnet)
- Preview parsed-rows + Sam confirms
- Bulk INSERT components

COMPONENTS
- shadcn/ui Table, Drawer, Dialog
- TanStack Table v8 met filter/sort
- Cascade-graph: react-flow OR custom SVG mini-tree

ACCESSIBILITY
- Tabel: scope=col headers
- Impact-preview: aria-live alerts
- AI Genereer: aria-busy tijdens generation

MOBILE
- Tabel → kaart-list
- Drawer full-screen

HARD RULES
- Allergens via human-confirm queue (NOOIT auto-applied)
- Cost-trigger draait server-side (recipe_cost_snapshots)
- Search-index (pg_trgm) op naam voor snelle autocomplete

CONNECTS TO
- gerecht_components join (used-in lookup)
- recipe_cost_snapshots trigger
- component_allergens join (cascade naar gerechten via MV)
- /api/parse-pricelist (leverancier-import)
- /api/component-generate (Bedenker)
```
