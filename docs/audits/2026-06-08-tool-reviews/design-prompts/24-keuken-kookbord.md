# 24 — Keuken kookbord `/keuken/kookbord`

**Type:** Tablet drag-to-done prep-bord met real-time collaboration
**Source:** `src/app/keuken/kookbord/page.tsx`

## Wat het moet doen

Per kitchen-station (Pekel / Smoker / Cold / Plating) een kanban-kolom met prep-taken (dagen-vooraf). Lars swipe-to-done. Sam ziet real-time progress vanaf desktop. WebSocket-collab via Supabase realtime.

## Componenten
- Kolommen per station
- Task-cards met checkbox + tijd-estimate
- WebSocket realtime sync
- KDS device-session (per tablet)
- AI logistics-checklist generator

## Acceptance
1. ✅ Drag tussen stations (gerecht naar andere station = re-assign)
2. ✅ Swipe-to-done (rechts veeg = mark done)
3. ✅ Real-time sync via Supabase realtime channel
4. ✅ Per-device-session (kds_device_sessions) — tracks welk apparaat
5. ✅ AI checklist out-of-the-box per event-type

## Bevindingen
- ✅ KDS-architectuur bestaat (kds_device_sessions + kds_audit_logs in DB)
- ❌ AI logistics-checklist endpoint bestaat maar onbekend UX-flow
- ❌ Geen "audio-feedback" bij task-done (handig in lawaai)

## Design-prompt

```
Bouw een keuken-kookbord (KDS) voor catering-software BBQ Architect.

CONTEXT
Lars + sous-chef werken pre-event aan prep. Stations: Pekel, Smoker, Cold,
Plating. Per station kanban-kolom met taken sorted by dag (D-14 → D-day).
Real-time collab (Supabase realtime).

LAYOUT (landscape tablet, scrollable horizontal)
- Header: "Kookbord · {event.naam}" + KDS-session pill + device-name
- Horizontal scrollable: kolommen per station
- Per kolom (320px wide):
  - Station-header met icon + counter (5 taken, 2 done)
  - Filter "Alle / Vandaag / Komende 3 dagen"
  - Task-cards stacked verticaal
- Footer: "Logistics checklist genereren" (AI button)

TASK-CARD (192×120px)
- Gerecht-naam + qty
- "D-3" tijd-indicator
- Checkbox (groot, 56×56px)
- Beschrijving-line (e.g. "20kg Pulled Pork pekelen")
- Swipe-right = mark done (haptic + visual feedback)

INTERACTIONS
- Drag tussen stations (re-assign)
- Long-press = edit-modal (qty, notes)
- Tap = open detail-drawer (gerecht-recept)
- Swipe = mark done (geen confirm — undo-toast)

REAL-TIME SYNC
- Supabase realtime channel per event
- Andere KDS-sessies zien updates <500ms
- Conflict-resolution: server-time wins
- Toast bij verandering ander apparaat: "Lars markeerde 'Smoker pulled pork' als klaar"

KDS DEVICE-SESSION
- Eerste open: identify device (naam invoeren: "Smoker tablet")
- Session-token in localStorage
- Logging in kds_audit_logs (welk apparaat deed wat)

AI LOGISTICS-CHECKLIST
- POST /api/logistics-checklist met event-id
- Haiku genereert per station de standaard-taken
- Confirm-modal: "Voeg 12 prep-taken toe?"

COMPONENTS
- shadcn/ui Card, Checkbox (XL), Drawer
- @dnd-kit voor drag
- Supabase realtime via @supabase/supabase-js
- Vibration-API voor swipe-feedback

ACCESSIBILITY
- Drag-keyboard alternative
- Swipe heeft button-fallback "Mark done"
- Audio-cue toggle (handig in lawaai)

MOBILE PORTRAIT
- 1 station per scherm, horizontale swipe tussen
- Tasks full-width

HARD RULES
- prep_tasks.done-flag trigger sync_prep_tasks_done_flag (al in DB)
- KDS-session-token via kds_device_sessions (al gebouwd)
- Realtime channel met RLS-policies (server-side filter org_id)

CONNECTS TO
- prep_tasks (CRUD)
- kds_device_sessions (session-tracking)
- kds_audit_logs (audit-trail)
- POST /api/logistics-checklist (AI Haiku)
- POST /api/prep/complete-task + /api/prep/skip-task + /api/prep/snooze-task
- /events/{id}/hub Prep-tab (read-only mirror)
```
