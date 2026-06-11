# 18 — Voorraad product-detail `/voorraad/[id]`

**Type:** Product-detail met par-level + prijshistorie + leverancier-koppeling
**Source:** `src/app/voorraad/[id]/page.tsx`

## Wat het moet doen

Klik op een voorraad-item (e.g. "gerookte Bavette beef club 29") → ziet huidige stock, par-level (min/max), prijshistorie (last 12 prijzen via leverancier-importer), gekoppelde leveranciers + alternatieven, gebruikspatroon per gerecht.

## Componenten
- Stock-card (huidig vs par-level, kleur-coded)
- Prijshistorie-chart (Recharts line)
- Leverancier-tabel (met alternatieve aanbieders + prijsverschil)
- "Gebruikt in N gerechten"-back-link
- AI Substitution-advice button

## State
```
loading       → skeleton 3 cards
loaded        → data + chart
below-par     → rode CTA "Bestel nu via leverancier X"
no-history    → "Prijs van leveranciers nog niet gescand" + upload-flow
```

## Acceptance
1. ✅ Par-level rood als current < min
2. ✅ Prijshistorie min 6 punten anders empty-state
3. ✅ Substitution-advice (Haiku) toont 3 alternatieven met price-delta
4. ✅ Bestel-CTA opens /inkoop met item prefilled

## Bevindingen
- ✅ APK toont voorraad-card-pattern al
- ❌ Geen prijshistorie-chart zichtbaar in current UI (alleen "last_price")
- ❌ Geen "voorspelde behoefte komende 30d" (uit bestaande events × recipe-yield)

## Design-prompt

```
Bouw een voorraad-detail-pagina voor catering-software BBQ Architect.

CONTEXT
Sam klikt op voorraad-item, wil 360° info: hoeveel hebben we, wat kost het,
waar halen we het beste, waar gebruiken we het in. Plus AI-substitution.

LAYOUT
- Breadcrumb: Voorraad > Voorraad > {productnaam}
- Header: naam + categorie + bestel-CTA als below-par
- 3-koloms grid (desktop):

CARD 1: STOCK-STATUS
- Huidige stock (groot getal + eenheid)
- Par-level slider visualization (min---huidig---max)
- "Onder par-level" rode waarschuwing als toepasselijk
- Last counted (datum)
- Acties: "Tellen" / "Aanpassen par-level"

CARD 2: PRIJSHISTORIE
- Recharts line-chart (laatste 12 prijzen, per leverancier kleur)
- Hover tooltip: "€4.20/kg op 14 mei via Sligro"
- Trend-indicator: +12% in 3 maanden (kleur-coded)

CARD 3: LEVERANCIERS
- Hoofdleverancier (huidige)
- Alternatieve aanbieders met prijs-delta
- "AI Substitution-advice" knop → opens drawer met alternatieve producten
- Klik leverancier → /leveranciers/{id}

CARD 4: GEBRUIKT IN
- Lijst gerechten die dit product gebruiken (cascade-back-link)
- Per gerecht: aantal per portie + totale events-vraag komende 30d
- "Voorspelde behoefte" = sum(events × headcount × yield)

CARD 5: BESTELLEN (sticky bottom als below-par)
- "Bestel 25kg via Sligro voor €105"
- Klik = create concept_inkoop_order

ACTIONS-ROW
- Substitution-advice (Haiku)
- Bestel toevoegen
- Importeer prijslijst (per leverancier)
- Verwijder product

COMPONENTS
- shadcn/ui Card, Slider, Chart
- Recharts voor prijshistorie
- vaul voor substitution-drawer

ACCESSIBILITY
- Par-level-slider: aria-valuenow/min/max
- Chart: tabular alternative
- Below-par CTA: aria-live="assertive"

MOBILE
- 3-koloms → 1-kolom stack
- Stock-status sticky bovenaan

OUT OF SCOPE
- Geen real-time IoT scale-integratie (komt later)
- Geen multi-vestiging-stock (single-location voor v1)

CONNECTS TO
- POST /api/substitution-advice (Haiku)
- /leveranciers/{id} (klik leverancier)
- /inkoop (bestel-CTA)
- gerecht_components (back-link gebruik)
- supplier_prices + price_history (chart data)
```
