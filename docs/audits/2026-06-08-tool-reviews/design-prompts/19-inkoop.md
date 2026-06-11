# 19 — Inkoop `/inkoop`

**Type:** PO-lijst + bon-scanner-matching + leverancier-selectie
**Source:** `src/app/inkoop/page.tsx`

## Wat het moet doen

Sam genereert inkooporders (auto van events: "Voor BBQ-feest 40pp heb je 25kg flank steak nodig"), kiest leverancier, plaatst bestelling. Bij ontvangst: scan bon → AI matcht met PO → flag verschillen.

## Componenten
- PO-tabel (TanStack Table)
- "Genereer voorstel"-button (uit komende events)
- Leverancier-selectie per regel
- Bon-match-flow (drop-zone als /bonnen)

## State
```
empty         → "Geen open bestellingen — genereer voorstel"
loaded        → tabel met POs
generating    → AI denkt 5-10s (uit events × ingredients)
matching      → upload bon → AI match
mismatch      → diff-view (PO vs bon)
```

## Acceptance
1. ✅ Auto-voorstel uit komende-events × component-yields
2. ✅ Sam confirm vóór order-send
3. ✅ Bon-match toont diff: "Besteld 25kg, geleverd 24.5kg"
4. ✅ Auto-update inventory.current_stock bij confirm

## Bevindingen
- ⚠️ concept_inkoop_orders tabel bestaat (uit FK-index lijst APK)
- ❌ Geen UI gezien in APK rondes — onbekend hoe diep deze functie is
- ❌ Mogelijk te abstract voor Lars — sweet-spot voor Pro-tier eigenaar

## Design-prompt

```
Bouw een inkoop-workflow voor catering-software BBQ Architect.

CONTEXT
Sam plant 4 events komende week. Heeft 25kg vlees, 10kg groente, etc.
nodig. Wil 1-klik voorstel + leverancier-keuze + bon-match. Voorkomt
"oeps geen brood meer op donderdag".

LAYOUT
- Header: "Inkoop" + 2 buttons "Genereer voorstel" + "Handmatige order"
- Tabs: Open orders | Concept | Geleverd | Geannuleerd
- Tabel-cols: Order# | Leverancier | Datum | Items count | Totaal | Status | Acties

GENEREER-VOORSTEL FLOW
1. AI berekent uit `events.menu × gerechten.components × yields × dagen-vooruit`
2. Preview-modal: lijst components met qty per leverancier
3. Sam confirms / past aan
4. Per leverancier: 1 PO aanmaken in `concept_inkoop_orders`

PO-DETAIL DRAWER
- Header: Order# + leverancier + datum
- Items-tabel: component | qty | eenheid | prijs/eenheid | totaal
- Edit per regel (override leverancier, qty, prijs)
- "Verstuur naar leverancier" CTA (email-template via Resend)
- "Plaats via Sligro/Bidfood-API" (toekomst)

BON-MATCH FLOW (na ontvangst)
1. Sleep bon-foto/PDF naar drop-zone
2. AI parse via /api/bonnen/extract (Sonnet vision)
3. Auto-match items met PO via leverancier + naam-fuzzy
4. Diff-view: "Besteld 25kg, geleverd 24.5kg, prijs €5.10 ipv €5.00"
5. Sam confirms: update inventory + price_history
6. Save bon naar /archief

COMPONENTS
- TanStack Table v8 voor PO-lijst
- vaul voor PO-detail-drawer
- Drop-zone (zelfde pattern als /bonnen)
- shadcn/ui Dialog voor confirm-flows

ACCESSIBILITY
- Tabel: scope=col
- Diff-view: rol="alert" voor verschillen
- Drop-zone: aria-label "Sleep bon hier"

MOBILE
- Tabel → kaart-list per PO
- PO-detail full-screen
- Bon-match via camera

OUT OF SCOPE
- Geen direct Sligro/Bidfood-API (handmatig email voor v1)
- Geen multi-vestiging-PO (single-location)

CONNECTS TO
- events.menu + gerecht_components × yields voor voorstel
- /leveranciers/{id} (PO-leverancier-link)
- /api/bonnen/extract (Sonnet vision)
- inventory.current_stock (update bij ontvangst)
- price_history (track prijs-veranderingen)
```
