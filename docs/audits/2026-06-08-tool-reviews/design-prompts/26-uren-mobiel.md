# 26 — Uren PunchPanel mobiel `/uren`

**Type:** Mobile clock-in/out + crew-management
**Source:** `src/app/uren/page.tsx` + `_components/PunchPanel.tsx`

## Wat het moet doen

Lars opent /uren op telefoon, punch-in voor event, klok-tijd loopt, punch-out. Plus: manager (Sam) kan crew-klokken vanaf zijn telefoon ("Punch Sander voor BBQ-feest"). Op event-mode field-page is dit een 1-knop-flow.

## Componenten
- PunchPanel: big play-button + status + event-select
- Crew-klokken-section voor managers
- Maand-overzicht (collapsible)
- IBA-balance (ingekochte beschikbare arbeidsuren?)

## Acceptance
1. ✅ time_logs.event_id koppeling (APK-bevestigd in migration 031)
2. ✅ Mobile-touch-target 60px voor play-button
3. ✅ Audit-trail in audit_log via trigger
4. ✅ Snapshot uurtarief bij punch (later loonsverandering ≠ historisch tarief)

## Bevindingen
- ✅ PunchPanel bestaat (APK gezien op /uren)
- ✅ Event-select dropdown werkt (false-alarm-1 bevestigd)
- ❌ Geen "vorige sessie automatisch herstellen" als app gecrashed (write-queue)
- ❌ "IBA: 1/1225u" onverklaard — wat betekent dit?

## Design-prompt

```
Bouw een mobile-first urenpunch tool voor catering-software BBQ Architect.

CONTEXT
Lars + sous-chef + Sam punchen in/out per event. Real-time loon-cost.
Mobiel-primary (telefoon in zak). Manager ziet crew status op desktop.

LAYOUT MOBILE (375-414px)
- Header: "Uren · {personeel.naam}" + offline-pill
- HERO: big play-button (200×200px) midden
  - NIET INGEKLOKT: groene play-icon "Start dienst"
  - INGEKLOKT: rode stop-icon "Stop dienst" + live-timer
- Sub-info onder:
  - "Op event: {event.naam ?? '— Geen event}" — dropdown om te wijzigen
  - "Pitmaster · €35/u" (rol + tarief)
  - "Jouw IBA: 1/1225u · 1224u te gaan" (jaarlijkse target?)
- Crew-section (alleen managers zichtbaar):
  - "Crew klokken"
  - Per crew-lid: row met naam + status + Inklok-button
- Maand-overzicht (collapsed):
  - Totaal uren / Loonkost / Diensten / Crew actief

INTERACTIONS
- Tap play-button → start punch (haptic feedback)
- Tap stop-button → confirm dialog "Sluit dienst van 4u 23min?"
- Event-dropdown wijzigt event_id van actieve dienst
- Crew-inklok = manager doet voor andere

LIVE-TIMER
- Update elke 60s (battery-friendly)
- Format: 4h 23min (geen seconden)
- Achtergrond-runtime (geen alert als app gesloten)

OFFLINE-MODE
- IndexedDB write-queue
- Punch lokaal saved tot wifi terug
- "1 punch wacht op sync" pill bovenaan

UURTARIEF-SNAPSHOT
- Bij punch-in: snapshot personeel.uurtarief naar time_logs.uurtarief_snapshot
- Later wijziging in personeel-tarief verandert historische records NIET
- Loonkosten = som(uurtarief_snapshot × uren)

CREW-KLOKKEN (managers)
- Lijst van actieve crew (binnen org)
- Per persoon: laatst-actief / huidige-status / Punch-in/uit button
- Bulk-acties: "Sluit alle open diensten" (eind van event)

DESKTOP VARIANT
- Wallboard-view voor manager (10+ crew)
- Real-time updates van mobile-punches

COMPONENTS
- shadcn/ui Button (XL), Card, Select, Dialog
- IndexedDB via idb voor offline
- Vibration-API voor punch-feedback

ACCESSIBILITY
- Play-button: aria-label "Start dienst" met live announcement
- Live-timer: aria-live="polite" elke 5min
- Crew-list: scope=col

HARD RULES
- Uurtarief-snapshot bij punch (anti-fraud, audit-bestendig)
- audit_log trigger op time_logs (al in DB)
- Event-koppeling via time_logs.event_id (APK-fix)

CONNECTS TO
- time_logs (CRUD)
- personeel (uurtarief lookup)
- events (event-dropdown)
- audit_log (auto-trigger)
- /financien/uren (manager wallboard)
- /events/{id}/field (event-context punch)
```
