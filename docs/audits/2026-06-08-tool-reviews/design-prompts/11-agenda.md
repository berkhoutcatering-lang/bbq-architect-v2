# 11 — Agenda `/agenda`

**Type:** Multi-view kalender + KPI-strip + AI Insights
**Source:** `src/app/agenda/page.tsx` (FullCalendar)

## Wat het moet doen

Sam ziet maand-overzicht van events + prep-deadlines. Vijf KPIs bovenaan (Komende 30d, Omzet pipeline, Prep open, Vrije weekends, Conflicten). FullCalendar Maand/Week/Lijst-toggle. AI Insights button.

## Componenten
- FullCalendar React (al in deps: dayGrid + timeGrid + interaction + list)
- KPI-strip 5 cards (custom)
- AI Insights button → opens drawer met today-briefing summary

## State
```
loading        → calendar-skeleton
loaded         → events op grid
conflict-flag  → events overlappen = rode pin (uit conflictDetection.ts)
filter-active  → URL preserved via nuqs (?cat=events,prep)
```

## Acceptance
1. ✅ FullCalendar paid plugin (Resource Timeline) als Pro-feature
2. ✅ Conflict-detectie tussen prep-deadline + event-uur
3. ✅ Drag-event-to-other-date → server-action updateEventDate (optimistic)
4. ✅ Filter "Mijn agenda's" links toggleert events/prep/persoonlijk
5. ✅ Mobile: Lijst-view default

## Bevindingen
- ✅ 5 KPIs werken (3 events 30d, €4.954 pipeline, 46 prep, 3 vrije weekends, 2 conflicten — zichtbaar in APK)
- ⚠️ AI Insights button: wat doet 'ie? Onduidelijk in screenshot
- ❌ Geen "Vandaag"-quick-jump-knop in mobile (alleen in week-toggle)
- ❌ Geen iCal-export (handig voor crew die in eigen app planning bekijkt)

## Design-prompt

```
Bouw een agenda-pagina voor catering-software BBQ Architect.

CONTEXT
Sam bekijkt z'n 30-90 dagen-vooruit-blik. Wil overlap zien tussen events,
prep-deadlines en persoonlijke afspraken. FullCalendar als basis.

LAYOUT
- Header: "Agenda" + sub-tab "Events" + KPI-strip 5 stats
- Toolbar: < Juni 2026 > | Vandaag | Maand/Week/Lijst | Filter | + Afspraak | AI Insights
- Main grid: FullCalendar (week-start maandag, NL-locale)
- Sidebar links: "Mijn agenda's" toggleable (Events / Prep deadlines / Persoonlijk)

KPI-STRIP (5 cards horizontal)
- Komende 30d: count events bevestigd
- Omzet pipeline: € totaal (kleur-coded confirmed vs concept)
- Prep open: count taken to-do
- Vrije weekends: count in deze maand
- Conflicten: count met rode pill (klik = drilldown lijst)

EVENT-PINS
- Per event: kleur per status (concept/confirmed/completed)
- Hover: tooltip met klant, gasten, omzet
- Klik: navigate /events/{id}/hub
- Drag-to-other-date: update event.date + toast bevestiging

PREP-DEADLINES
- Mini-icons op kalender-dagen (D-14, D-7, D-2)
- Click: opens prep-detail drawer

CONFLICT-DETECTION
- Wanneer 2 events overlappen of prep clash met event-uur
- Rode pin + tooltip "Conflict: Event X en Y overlappen"
- KPI "Conflicten 2" → klik = lijst met fix-acties

AI INSIGHTS BUTTON
- Opens right-drawer met today-briefing (Sonnet 4.6)
- "Volgende week 3 events, 1 zonder bevestiging"
- "Conflict tussen Hopp + Bedrijfsfeest op 22 juni — schuif 1 of split crew"

COMPONENTS
- @fullcalendar/react + dayGrid + timeGrid + list + interaction
- shadcn/ui Card, Badge, Button, Drawer
- nuqs voor filter-state

ACCESSIBILITY
- FullCalendar heeft aria-built-in; verifieer keyboard-navigatie
- KPI-cards: aria-label "Komende 30 dagen, 3 events"
- Conflict-pin: rol="alert"

MOBILE
- Default Lijst-view (kalender te smal)
- Toolbar collapsed in dropdown
- Pull-to-refresh

OUT OF SCOPE
- Geen multi-cateraar-shared-agenda (single-tenant view)
- Geen 6-maanden-vooruit (focus op 30-90d)

CONNECTS TO
- /events/{id}/hub op event-click
- prep_tasks gerelateerd aan events
- /api/today-briefing voor AI Insights
- iCal feed (toekomst)
```
