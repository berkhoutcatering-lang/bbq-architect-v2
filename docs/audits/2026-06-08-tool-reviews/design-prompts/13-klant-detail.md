# 13 — Klant-detail `/klanten/[id]`

**Type:** CRM-detail met klant-historie (offertes/events/facturen/leads)
**Source:** `src/app/klanten/page.tsx` (uses URL `?focus={naam}`)

## Wat het moet doen

Sam zoekt een klant in /klanten lijst, klikt → opent klant-detail (drawer of route). Ziet contact-info, type-tag (Particulier/Zakelijk/Festival/Horeca), totale waarde, en historie: laatste 5 offertes/events/facturen + "Alle N bekijken" links (na APK-fix #10).

## Componenten
- Klant-info-card (naam, contact, adres)
- KPI-strip (Offertes, Events, Totale waarde)
- 3 historie-blokken (Events / Offertes / Facturen) met "Alle N bekijken"-link
- AI-context: "Vorige catering: X met Y gasten — wil je dit voorstel doen?"

## State
```
loading       → skeleton 3 cards
loaded        → contact + stats + history
new-client    → empty-state met edit-form open
existing-link → cross-referenced events via client_naam match
```

## Acceptance
1. ✅ "Alle N bekijken"-links per categorie (APK-fix #10)
2. ✅ KPI-totaal-waarde = som factuur-totalen
3. ✅ Type-pill kleur-coded (particulier blue, zakelijk gold, etc.)
4. ✅ Mobile: drawer ipv route
5. ✅ Edit-inline of save-via-action

## Bevindingen
- ✅ APK toont 8 klanten + filter-types werkend
- ✅ Klant-historie laatste 5 + "alles zien"-tab (na #10)
- ⚠️ Klant-detail komt via drawer in /klanten?focus={naam} — niet een eigen route /klanten/[id]
- ❌ Geen email-thread-link (klant heeft mogelijk meerdere conversations)
- ❌ Geen "next-action"-suggestie (e.g. "Klant Hopp had 1 event in april — sturen we follow-up?")

## Design-prompt

```
Bouw een klant-detail CRM-view voor catering-software BBQ Architect.

CONTEXT
Sam wil 1 klik weg van: contact-info, totale waarde, alle history. Niet
een complete CRM, wel actionable: vorige events tonen + quick-actions
voor follow-up.

LAYOUT (route-deep OR drawer)
- Drawer rechts-slide-in op /klanten?focus={id}
- OF: route /klanten/[id] met breadcrumb

HERO-CARD
- Avatar (initiaal)
- Naam + bedrijf
- Type-pill (Particulier blue / Zakelijk gold / Festival purple / Horeca teal)
- "Klant sinds {datum}"

CONTACT-CARD
- Email | Telefoon | Adres
- Edit-pencil per veld (inline-edit) of "Bewerken" button
- "Bel" / "Mail" / "WhatsApp" quick-actions

KPI-STRIP (3 cards)
- Offertes: count + percentage geaccepteerd
- Events: count + totale gasten
- Totale waarde: € (sum factuur-totalen)

HISTORIE-BLOKKEN (3 secties)
- Events (laatste 5) — link "Alle {N} events bekijken" → /events?client={naam}
- Offertes (laatste 5) — link "Alle {N} offertes bekijken" → /offertes?client={naam}
- Facturen (laatste 5) — link "Alle {N} facturen bekijken" → /facturen?client={naam}

AI CONTEXT-CARD
- "Vorige catering: BBQ-feest voor 40 gasten in juni 2025"
- Suggestie: "Wil je dit jaar weer? Stuur follow-up template"
- Klik = open Vraag-Rook ChatPanel met prefill

NOTES-CARD
- BlockNote textarea voor vrije notities ("Vegetariër, geen pinda's")
- Auto-save

EDIT-DRAWER (nested)
- Modal of inline voor klant-data wijzigen
- Validatie: email-format, telefoon-NL-format

COMPONENTS
- vaul voor drawer
- shadcn/ui Card, Badge, Avatar, Button
- BlockNote voor notities

ACCESSIBILITY
- Drawer focus-trap + ESC-sluit
- Quick-actions met aria-label "Bel klant Hopp op 0612345678"

MOBILE
- Full-screen modal van onder
- Stacked secties

OUT OF SCOPE
- Geen marketing-segmentatie (komt in v2)
- Geen automatic birthday-trigger

CONNECTS TO
- /events?client= / /offertes?client= / /facturen?client= (alles-zien-links)
- /api/today-briefing (AI context)
- klant.naam-match cross-events (string match, future: klant_id FK)
```
