# 02 — Lead-pijplijn `/verkoop/leads` + drawer

**Type:** Operator-facing kanban + lead-detail drawer met AI-concept
**Huidige route:** `/verkoop/leads`
**Source-bestand:** `src/app/verkoop/leads/page.tsx` + actions.ts

---

## Wat het moet doen

Sam (of zijn team) ziet binnenkomende aanvragen als kanban-cards en sleept ze door 4 statussen: **Nieuw → In gesprek → Offerte → Gewonnen/Verloren**. Klik op een card opent een drawer rechts met details + AI-concept-knop die binnen 5 seconden 3 menu-voorstellen genereert (Claude Sonnet 4.6 via recipe-generate). "Maak offerte" knop transformeert de lead naar een offerte-wizard prefill.

Lars zelf gebruikt dit niet (komt nooit in office) — dit is Mathijs- en Pro-tier-eigenaar werk.

## Componenten gebruikt

- **Kanban view** — `@dnd-kit/core` + `@dnd-kit/sortable` (al in package.json) voor drag-tussen-kolommen
- **Lijst view toggle** — `TanStack Table v8` (al in deps)
- **Drawer** — vaul (al in deps) voor rechter slide-in drawer
- **AI-concept generate** — POST `/api/recipe-generate` met `mode: 'menu'`, `event_type`, `gasten`, `budget_indicatie`
- **Status-flip** — server action `updateLeadStatus(id, status)` met optimistic UI

## State machine

```
loading       → skeleton-cards (3 kolommen, 2 placeholder-cards elk)
loaded-empty  → "Nog geen aanvragen" + CTA "Deel je aanvraag-link"
loaded-data   → kanban met cards per status
dragging      → ghost-card volgt cursor, target-kolom highlight
flipping      → optimistic update + server confirm + toast
drawer-open   → rechts slide-in, focus-trap, ESC sluit
ai-generating → drawer toont skeleton-menu + progress (Sonnet ~5s)
ai-error      → "AI is even niet beschikbaar" + retry-knop
offerte-handoff → localStorage write + redirect naar /offertes?wizard=true
```

## Interaction-patterns

- **Drag-tussen-kolommen** verandert lead.status; auto-track `track('lead_status_changed', { from, to })`
- **Klik op card** opens drawer met: contact, datum, gasten, locatie, event-type, budget, vrij bericht, AI-concept (als gegenereerd), history-timeline
- **AI-concept knop in drawer** → 3 cards: "Klassiek BBQ", "Vegan-friendly", "High-end". Per card: 3 gerechten + indicatieprijs/pp. Klant kan kiezen of nieuwe ronde
- **"Maak offerte" knop** → localStorage `bbq_lead_convert = { leadId, ai_concept }` + redirect `/offertes?wizard=true`. De wizard prefilled de lead-data
- **Kanban → Lijst toggle** preserves filter+search via nuqs URL-state
- **⌘K** opens command palette met "Nieuwe aanvraag" + "Open lead [naam]"

## Acceptance criteria

1. ✅ Card toont essentiele info op 1 blik: naam, type, datum, gasten, locatie, budget, "X min geleden"
2. ✅ Drag-and-drop heeft visuele feedback (ghost + drop-zone highlight) + werkt op touch (Lars met tablet)
3. ✅ Drawer-open snelheid <100ms na click
4. ✅ AI-concept generate <5s p95, met progress-feedback
5. ✅ "Maak offerte" handoff slaagt 100% — geen verloren lead-data
6. ✅ Empty-state heeft duidelijke first-action ("Deel je publieke aanvraag-link")
7. ✅ Filter "Niet gereageerd >24u" zichtbaar als rood badge in NIEUW-kolom

## Bevindingen huidige versie

### Bugs
- **Geen bug, maar:** AI-concept generate vereist Promptfoo eval fix (#34) voordat we 100% zeker zijn van kwaliteit per lead-type

### UX-gaps
- **Geen "Niet gereageerd"-tijd-warning** — lead die 48u in NIEUW staat zou orange-pill moeten krijgen
- **Geen bulk-acties** — selecteer 3 leads en send-mail-template = niet mogelijk
- **Geen "lead-bron" zichtbaar** op kanban-card (manual / public-form / klantgesprek / arrangement). Belangrijk voor funnel-analyse
- **Conversie-stats ontbreken** — geen "Win rate 32%" of "Avg time-to-quote 18u" in header
- **Email-sync** ontbreekt — als klant antwoordt op je offerte-mail komt dat niet automatisch terug bij de lead

### Visual
- **Card-density is fijn** maar 5+ leads per kolom = veel scroll. Compact-view-toggle zou helpen
- **Status-kolom-headers** zijn klein, kleur-dot is duidelijk maar de gele/blauwe/oranje zijn niet semantically duidelijk genoeg
- **Lege kolommen** ("Sleep een aanvraag hierheen") is een gemiste kans voor dragging-affordance pijlen
- **+ FAB** is dezelfde icon als overal — zou "Nieuwe aanvraag" tekst-label moeten hebben op hover

### Cohesie
- ✅ Lead-status sync naar /vandaag AttentionPanel (zichtbaar)
- ✅ "Maak offerte" handoff via localStorage werkt + lead.offerte_id schrijft terug (APK-fix #1 verified)
- ❌ **Klant-detail koppeling ontbreekt** — als deze lead al een bestaande klant is (op email-match), zou er een "Bestaande klant: Jan Jansen — 3 vorige events" pill moeten zijn
- ❌ **Mail-flow ontbreekt** — geen "Stuur reactie-mail" knop in drawer
- ❌ **/aanvraag/[slug]-share-link** ontbreekt prominent op deze page — Sam moet manueel naar /instellingen om link te vinden

## Design-prompt voor externe builder

```
Bouw een sales-pipeline kanban voor catering-software BBQ Architect.

CONTEXT
B2B-cateraar (Pro-tier) krijgt 5-30 aanvragen/maand via publiek formulier
(/aanvraag/[slug]). Deze pagina is de werkruimte: leads sorteren, AI-menu
generen, omzetten naar offerte. Persona: Mathijs (eigenaar, desktop+tablet).
Lars (foodtruck-operator) gebruikt dit niet.

LAYOUT
- Sidebar links (BBQ Architect 7-hub nav blijft)
- Header: "Aanvragen {count}" + "Nieuwe aanvraag"-knop + Kanban/Lijst-toggle
- Sub-header: search + filter (status, datum-range, budget, event-type)
- Hoofdpaneel: 4-koloms kanban OF tabel-lijst
  - Kolommen: Nieuw / In gesprek / Offerte / Gewonnen / Verloren (5)
  - Lead-card: naam, event-type pill, datum, gasten, locatie, budget, "X uur geleden"
  - Drag-tussen-kolommen verandert status
- Rechts slide-drawer bij click:
  - Header: lead-naam + bron-badge (publiek-form/manual/klantgesprek)
  - Section 1: Contact (email, tel, "Bestaande klant?" link)
  - Section 2: Event-details (datum, gasten, locatie, type, budget)
  - Section 3: AI-concept-menu (3 cards: Klassiek / Vegan / Premium)
  - Section 4: History-timeline (status-flips, emails, notes)
  - Footer: "Maak offerte" CTA + "Stuur reactie" + "Archiveer"

KEY FEATURES
- Drag-and-drop tussen kolommen (touch-friendly voor tablet)
- AI-concept generate (POST /api/recipe-generate mode=menu, ~5s)
  - Progress-skeleton, error-retry
  - 3 menu-opties met indicatieprijs per persoon
- Klik "Maak offerte" → wizard-prefill via localStorage
- "Niet-gereageerd > 24u" badge op kolom NIEUW (auto-derived)
- Conversion-stats in header: "Win rate 32%, avg time-to-quote 18u"
- Bulk-acties: selecteer meerdere → send-template / archiveer / verplaats

COMPONENTS
- shadcn/ui: Card, Badge, Button, Dialog (drawer mode), DropdownMenu
- @dnd-kit/sortable voor kanban
- TanStack Table v8 voor lijst-view
- vaul voor right-drawer
- cmdk voor ⌘K palette

ACCESSIBILITY
- Drag-and-drop: keyboard alternative (Cmd+Up/Down om status te flippen)
- Kolom-headers: aria-label "Status: Nieuw, 3 aanvragen"
- Drawer focus-trap + ESC-sluit
- High-contrast modus: status-kolommen niet alleen kleur, ook iconen

MOBILE (375-414px)
- Kanban → single-column accordion (NIEUW expanded, rest collapsed)
- Drawer → full-screen modal van onder
- Bulk-acties via long-press

OUT OF SCOPE
- Geen email-client-integratie in deze pagina (alleen "stuur template" knop)
- Geen LinkedIn-enrich (privacy)
- Geen Stripe-integratie (komt in offerte/portal-flow)

CONNECTS TO
- /aanvraag/[slug] = bron van leads
- /offertes?wizard=true = handoff via localStorage
- /klanten = match op email voor "bestaande klant?"
- /mailbox = send-template flow
```

## Files te wijzigen

- `src/app/verkoop/leads/page.tsx` (UI rewrite)
- `src/app/verkoop/leads/actions.ts` (server actions, behoud server-contract)
- `src/lib/related-entities.ts` (uitbreiden met lead → bestaande-klant match op email)
- `src/app/api/recipe-generate/route.ts` (geen wijziging — server stabiel)
