# 25 — Service plattegrond `/events/[id]/service/plattegrond`

**Type:** Visual venue-layout editor met guest-pins + zones
**Source:** `src/app/events/[id]/service/plattegrond/page.tsx`

## Wat het moet doen

Sam tekent venue-layout (tafels, bar, podium), wijst guest-pins toe per zone, AI suggesteert optimale seating (allergens-aware: vega-tafel bijeen). Live-preview voor klant na bevestiging.

## Componenten
- Canvas-editor (Konva / React-Konva — al in deps)
- Drag-and-drop tafels + bar + podium
- Guest-pin assignment (drag uit gasten-lijst)
- AI suggest-layout (Sonnet floor-plan-ai-suggest endpoint)
- Anonymous-after-event cron (privacy)

## Acceptance
1. ✅ Drag tafels (8 schemas: rond/lang/cocktail/bar)
2. ✅ Pin gast aan tafel (allergens kleur-coded)
3. ✅ AI optimaliseert: allergie-clusters bijeen, paren niet split
4. ✅ Anonimiseer guest-data 30d na event (privacy AVG cron)
5. ✅ Save canvas-state in floor_plans.canvas_json

## Bevindingen
- ✅ Konva + React-Konva in deps (al gebouwd)
- ✅ floor_plans + floor_plan_guests tabellen
- ✅ Cron anonymize-floor-plan-guests (in vercel.json)
- ❌ AI floor-plan-ai-suggest endpoint bestaat maar UX onbekend

## Design-prompt

```
Bouw een service plattegrond-editor voor catering-software BBQ Architect.

CONTEXT
Voor formelere events (bruiloft, gala): venue-layout tekenen + gasten 
plaatsen. Allergens kleur-coded zodat keuken weet welke tafel vega is.
AI suggesteert optimale seating.

LAYOUT
- Header: "Plattegrond · {event.naam}" + Save + Preview-voor-klant
- 2-koloms grid:
  LEFT (kantoor-stijl tools):
    - Tafel-types: Rond-6 / Rond-8 / Lang-10 / Cocktail / Bar / Podium
    - Zones: VIP / Algemeen / Bar / Buffet / Outside
    - Tools: Pan / Zoom / Reset / Grid-toggle
  CENTER (Konva canvas):
    - White canvas met grid
    - Drag tafels uit toolbox
    - Click tafel = edit (size, naam, capaciteit)
  RIGHT (gasten-lijst):
    - 40 gasten lijst
    - Per gast: naam + dieet-pill (vega/vegan/glutenvrij/allergie)
    - Drag gast naar tafel → assignment
    - Visual: gast krijgt kleur-dot op tafel
    - "Niet-toegewezen 12" counter

ACTIES
- AI Suggest Layout (POST /api/floor-plan/ai-suggest)
  - "Vega-cluster tafel 3, allergie-cluster tafel 5"
  - Preview-confirm: accept / aanpassen / reject
- Save Canvas (debounced 2s naar floor_plans.canvas_json)
- Preview voor klant (link in /q/[token]?plattegrond=1)

GUEST-PIN
- Per gast: kleur op tafel (max 8 pins per tafel)
- Hover: tooltip "Mariel Velema — vega, lactose-intolerant"
- Drag-tussen-tafels = re-assign

ANONIMISATIE (privacy AVG)
- 30d na event: cron anonymize-floor-plan-guests
- Naam → "Gast 1", "Gast 2"
- Allergens behouden voor learning
- Toast aan Sam: "Gasten-data van event X anoniem"

COMPONENTS
- React-Konva (al in deps)
- shadcn/ui Card, Badge, Tooltip
- vaul voor gast-edit-drawer

ACCESSIBILITY
- Canvas heeft tabular-alternative (lijst tafels + toegewezen gasten)
- Drag-keyboard alternative
- Allergens niet alleen kleur (ook icoon + label)

MOBILE
- Geen edit-mode (alleen view) — te complex voor mobiel
- Lijst tafels + assigned gasten

HARD RULES
- Guest-data privacy-cron actief (anonimiseer 30d post-event)
- Floor-plan AI is suggestie — Sam confirms
- Canvas-state JSON in floor_plans.canvas (max 100kb)

CONNECTS TO
- floor_plans + floor_plan_guests (canvas + assignments)
- service_zones (zone-types)
- POST /api/floor-plan/ai-suggest (Sonnet AI)
- POST /api/floor-plan/guest-pin (per-gast assignment)
- Cron /api/cron/anonymize-floor-plan-guests (privacy)
- /q/[token]?plattegrond=1 (klant-preview)
```
