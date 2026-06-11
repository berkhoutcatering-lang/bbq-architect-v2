# 17 — Menukaart template-editor `/gerechten/menukaarten/[id]`

**Type:** Visual menu-template designer met PDF-render
**Source:** `src/app/gerechten/menukaarten/[id]/page.tsx` + e2e-test menukaart-templates

## Wat het moet doen

Sam ontwerpt een menukaart-template (BBQ Klassiek, Vega Feest, etc.). Drag-and-drop gerechten in gangen, kies layout (rustic/modern/elegant/minimal), preview PDF, save. Hergebruikbaar per offerte.

## Componenten
- Layout-picker (10 templates: duotone/invite/rustic/editorial/modern/square/minimal/etc.)
- Drag-reorder gerechten via @dnd-kit/sortable
- BlockNote voor introductie-tekst per gang
- react-pdf voor PDF-render

## State
```
loading       → skeleton
loaded        → template + gerechten
editing       → optimistic UI
preview       → PDF-render in iframe
saving        → server-action
```

## Acceptance
1. ✅ Visual-regression-tests bestaan voor 10 templates (Playwright snapshots)
2. ✅ PDF-render reproduceerbaar (deterministic fonts + colors)
3. ✅ Template re-usable per offerte (template_id FK)
4. ✅ Branding-tokens cascadet uit settings.brand_theme

## Bevindingen
- ✅ 10 template-snapshots in `tests/menukaart/__snapshots__/` (Playwright verified)
- ✅ Visual-regression CI alleen bij menukaart-changes (efficient)
- ❌ Geen "kopieer van vorige template"-quick-action
- ❌ Geen real-time preview tijdens edit (alleen save+open)

## Design-prompt

```
Bouw een menukaart-template-editor voor catering-software BBQ Architect.

CONTEXT
Sam ontwerpt herbruikbare menukaart-templates. Drag-and-drop gerechten in
gangen, kies 1 van 10 layouts, preview PDF, save. Per offerte hergebruikt
+ klant-data ingevuld.

LAYOUT
- Sub-tab nav: Gerechten | Componenten | Menukaarten (active) | Analyse
- Header: template-naam + status (concept/published) + Save / Preview / Delete
- 2-koloms grid:
  LEFT: Editor
    - Template-naam input
    - Layout-picker (carousel met 10 thumbnail-templates: rustic/modern/etc.)
    - Gangen-secties (Voorgerecht/Hoofdgerecht/Dessert)
    - Per gang: drag-reorder gerechten + "Voeg gerecht toe" cmdk-search
    - Per gerecht: omschrijving (BlockNote) + allergens-pills (read-only cascade)
    - Sectie-introductie (BlockNote) per gang ("Voor we beginnen met de bites...")
  RIGHT: Live preview
    - iframe naar /e2e-test/menukaart/[template-id]
    - PDF-mode toggle: A4 / A5 / Square
    - Branding-preview (theming cascadet)

ACTION-BAR
- Save (server-action)
- Preview (open in nieuw tab als PDF)
- Verwijder (confirm dialog)
- Dupliceer-template (voor variatie)
- "Pas toe op offerte X" → koppel template-id

LAYOUT-TEMPLATES (10)
- Rustic (warm bruin, serif, foto's per gerecht)
- Modern (sans-serif, minimal, no-foto)
- Elegant (gold accents, italic headers)
- Editorial (magazine-style, kolommen)
- Minimal (tekst-only, type-driven)
- Square (Instagram-formaat)
- Invite (uitnodiging-stijl, formele typografie)
- Duotone (2-kleur gradient)
- Festival (playful, kleur-blokken)
- Wedding (delicaat, bloemen-iconen)

INTERACTIONS
- Drag-tussen-gangen: @dnd-kit
- Klik gerecht: drawer met edit + ingredient-preview
- Save: optimistic + server confirm
- Preview-PDF: opens /api/menukaart/pdf/{template-id}

COMPONENTS
- shadcn/ui Tabs, Card, Carousel
- @dnd-kit voor drag-reorder
- BlockNote voor intro/omschrijving
- react-pdf voor preview-rendering

ACCESSIBILITY
- Drag-reorder: keyboard alternative (Cmd+Up/Down)
- Layout-picker: aria-label "Layout 3 van 10: Modern"
- Preview iframe: title-attr

MOBILE
- 2-koloms → 1-kolom stack
- Layout-picker horizontal scroll
- PDF preview: full-screen overlay

HARD RULES
- Allergens uit cascade (NOOIT inline-editen op template)
- Branding-tokens cascaden uit settings (geen hard-coded kleuren)
- PDF-fonts moeten beschikbaar zijn (public/fonts/menukaart/*)

CONNECTS TO
- /offertes wizard (template-picker)
- /api/menukaart/pdf/[offerId] (PDF-gen)
- Visual-regression test-baselines (10 templates)
```
