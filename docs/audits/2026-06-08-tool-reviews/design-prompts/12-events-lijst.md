# 12 — Events lijst `/events`

**Type:** Tabel + filters + bulk-acties
**Source:** `src/app/events/page.tsx`

## Wat het moet doen

Sam ziet alle events sorted by datum (default desc). 5 status-filters (CONCEPT/OPTIE/BEVESTIGD/AFGEROND/GEANNULEERD). Klik row = naar `/events/[id]/hub`. Bulk: archive multiple, send-template-reminder.

## Componenten
- TanStack Table v8 met sortable/filterable columns
- 5 status-filter-pills
- Search-input (full-text op name + client_naam)
- Bulk-action-bar (verschijnt bij selection)

## State
```
loading       → skeleton-rows
loaded-data   → tabel met events
filter-active → URL via nuqs (?status=confirmed)
empty         → "Nog geen events — maak je eerste via /agenda"
naamloos      → "[Naamloos event]" placeholder + warning-icon
```

## Acceptance
1. ✅ "Naamloos event" toont placeholder (NIET lege string) — APK-fix #29 verified
2. ✅ Status-filter URL-preserved
3. ✅ Bulk-archive: confirm-dialog + bulk-update
4. ✅ Mobile: kaarten ipv tabel-rows
5. ✅ Default sort: date DESC

## Bevindingen
- ✅ APK zag 10 events met 5-status filters werkend
- ⚠️ "10 van 10 events" — paginatie niet zichtbaar; bij >100 events?
- ❌ Geen "exporteer naar CSV"-knop
- ❌ Geen "kopieer event" voor terugkerende klant

## Design-prompt

```
Bouw een events-lijst voor catering-software BBQ Architect.

CONTEXT
Operationele lijst voor Sam om events te bekijken/filteren/bulk-acties.
Niet de detail-werkruimte (die is /events/{id}/hub) — dit is overview.

LAYOUT
- Header: "Events" + count + "Nieuw event"-knop
- Status-pills filter: Alle / Concept / Optie / Bevestigd / Afgerond / Geannuleerd
- Search-bar: zoek op naam, klant, locatie
- Tabel-columns: Datum | Naam | Klant | Locatie | Gasten | Omzet | Status
- Sort: datum DESC default; klik header om te switchen
- Bulk-select checkbox per row; action-bar slide-in als selected

ROW INTERACTION
- Klik row → /events/{id}/hub
- Right-click → context menu (Bewerken, Dupliceren, Archiveren)
- Status-flip dropdown direct op pill

BULK ACTIONS
- "Archive 3 events" (confirm dialog)
- "Send template reminder" (Resend mail-flow)
- "Export CSV"

EMPTY-STATE
- "Nog geen events" + CTA "Begin met /agenda" of "Importeer iCal"

NAAMLOZE EVENTS
- Toon "[Naamloos event] — vul aan" met warning-icoon
- Klik → /events/{id}/hub voor invullen

COMPONENTS
- TanStack Table v8 + nuqs voor URL-state
- shadcn/ui Checkbox, DropdownMenu, Dialog
- Sonner voor bulk-action toasts

MOBILE
- Tabel → kaart-list (1 card per event)
- Filter-pills horizontal scrollable

OUT OF SCOPE
- Geen Gantt-chart (separate /agenda-page)
- Geen team-collab-pijlers (single-author voor v1)

CONNECTS TO
- /events/{id}/hub op row-click
- /agenda voor calendar-view
- Server actions: archiveEvents, duplicateEvent, bulkSend
```
