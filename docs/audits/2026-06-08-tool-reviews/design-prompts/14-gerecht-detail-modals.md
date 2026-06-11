# 14 — Gerecht-detail + Bedenker + Pitmaster modals `/gerechten/[id]`

**Type:** Recipe editor + 3 AI-modals (Bedenker, Pitmaster, Allergen Queue)
**Source:** `src/app/gerechten/[id]/page.tsx` + `/api/recipe-ai-fill` + `/api/recipe-ai-improve` + `/api/detect-allergens`

## Wat het moet doen

Gerecht-detail toont: foto, naam, gang, allergenen (cascade van componenten), kostprijs (cascade), verkoop-prijs, marge. Sam kan editen + 3 AI-helpers triggeren:
- **Bedenker** (Haiku) — vult lege velden in op basis van naam
- **Pitmaster** (Sonnet) — coaching-feedback over technique + cost
- **Allergen Queue** — confirm/wijs gedetecteerde allergens

## Componenten
- Foto-upload + crop (browser-image-compression)
- BlockNote voor receptuur-tekst
- Ingredient-tabel (gerecht_components join)
- 3 AI-modals via shadcn Dialog
- Marge-pill kleur-coded

## State
```
loading            → skeleton
loaded             → data + edit-buttons
editing            → field-by-field optimistic update
ai-bedenker-run    → Haiku ~3s, fills fields
ai-pitmaster-run   → Sonnet ~8s, streams advice
allergen-detecting → Haiku per component, ~10s
cost-recalc-trigger → na ingredient-change, MV refresh
```

## Acceptance
1. ✅ Bedenker mag GEEN allergens AI-genereren — alleen "Wij denken vis, klopt?" + Sam confirmt
2. ✅ Pitmaster levert technique + cost-tip, geen automatic-apply
3. ✅ Cost-cascade trigger werkt (gerechten.total_cost_cents auto-update)
4. ✅ Foto-upload max 10MB (bucket-limit)
5. ✅ Marge-kleur: groen ≥55%, oranje 35-55%, rood <35%

## Bevindingen
- ✅ /gerechten KPI "Allergenen 2/13" (low coverage — actionable via #32 fix)
- ⚠️ Allergens-queue modal: bestaat als route-redirect (?queue=allergens) maar UX onbekend
- ❌ Geen "Hoe ziet dit gerecht eruit op de offerte?"-preview-knop
- ❌ Geen photo-AI-recognition (Opus vision) trigger vanaf detail-page

## Design-prompt

```
Bouw een gerecht-detail editor met 3 AI-modals voor BBQ Architect.

CONTEXT
Sam beheert recept-library. Per gerecht: alle data (naam, foto, gang,
allergenen, kostprijs, verkoop, marge, receptuur). 3 AI-helpers maken
data-entry sneller maar Sam blijft eind-decider.

LAYOUT (route /gerechten/[id])
- Breadcrumb: Menu > Gerechten > {naam}
- 2-koloms grid:
  LEFT: Foto-card (upload + AI-vision-fill) + Receptuur-text (BlockNote)
  RIGHT: Detail-fields stacked
    - Naam (input)
    - Gang (select: voor/hoofd/dessert/etc.)
    - Categorie (chips)
    - Aantal porties yield (number)
    - Bereidingstijd
    - Allergenen-pills (read-only, uit cascade)
    - Ingredient-tabel (gerecht_components join)
    - Kostprijs (auto-calc cascade)
    - Verkoop-prijs (input)
    - Marge-pill (kleur-coded)

ACTION-BAR
- "Bedenker" → modal (Haiku fill ontbrekende velden)
- "Pitmaster" → modal (Sonnet coaching)
- "Allergen Queue" → modal (cascade-detector)
- "Foto-AI" → Opus vision dish-recognition
- "Preview op offerte" → render-preview
- Save / Verwijder

BEDENKER MODAL
- Input: huidig gerecht-data
- AI: "Vul leeg gevonden velden in (Haiku ~3s)"
- Preview-confirm: "Bereidingstijd? Wij denken 90 min. Klopt?"
- Sam confirms field-by-field

PITMASTER MODAL
- Streaming Sonnet output:
  "Cost is €4.20/porties. Vergelijk je marge van 32% vs branche 40%.
   Suggesties: vervang knolselderij door pastinaak (-€0.30) of 
   verhoog prijs naar €15 (45% marge)."
- Actie-chips: "Toepassen ingredient-swap" / "Update verkoop-prijs"

ALLERGEN QUEUE
- Lijst components zonder allergen-confirm
- Per component: AI-suggestie (gluten/lactose/nuts/etc.) + ✓ accept / ✗ reject / typen
- Bulk-confirm "Pas allemaal toe"
- Hard-rule: allergens NOOIT auto-applied zonder Sam-OK

INTERACTIONS
- Inline-edit per field (debounced 1s auto-save)
- Foto-upload via drop-zone (10MB max)
- Marge live-update bij prijs-change

COMPONENTS
- shadcn/ui Dialog, Tabs, Card, Combobox
- BlockNote voor receptuur
- browser-image-compression voor foto-upload
- Streaming Anthropic SDK voor Pitmaster

ACCESSIBILITY
- 3 AI-modals: aria-labelledby + focus-trap
- Marge-pill: aria-label "Marge 32% — actie nodig"
- Streaming output: aria-live="polite"

MOBILE
- 2-koloms → 1-kolom stack
- AI-modals fullscreen

HARD RULES (kritiek)
- BTW per gerecht uit BTW_RULES_2026 (NOOIT AI)
- Allergens uit recipe_allergens join (NOOIT AI-text-genereren)
- Productie-qty = yield × headcount (NOOIT AI)

CONNECTS TO
- POST /api/recipe-ai-fill (Bedenker)
- POST /api/recipe-ai-improve (Pitmaster)
- POST /api/detect-allergens (Queue)
- POST /api/gerecht-vision-fill (Foto-AI)
- gerecht_components join voor ingredients
- recipe_cost_snapshots trigger
```
