# 08 — Event field-mode mobiel `/events/[id]/field`

**Type:** Lars-flow tablet/mobile event-day operatie
**Source-bestand:** `src/app/events/[id]/field/page.tsx`

---

## Wat het moet doen

Het is event-dag. Lars staat met handschoenen aan bij de smoker, geen tijd voor multi-step UIs. Deze pagina is **3 grote knoppen + minimal info**: huidige tijd-tot-service, prep-status, "punch in/out" voor uren, en HACCP-veldmodus-link. Offline-capable (IndexedDB snapshot van event-data + write-queue voor punch-ins die syncen zodra wifi).

Persona #1 in UX-master: **"3 grote knoppen voor de avond"**. Geen jargon, geen instellingen, alleen actie.

## Componenten gebruikt

- **Offline-toggle** met IndexedDB-snapshot (write-queue voor offline punch)
- **PunchPanel** (gebruikt door /uren ook) — Play/Stop knop + event-selectie
- **Time-till-service** countdown (groot, scherp leesbaar in fel zonlicht)
- **Prep-status-bar** "12/15 taken klaar"
- **HACCP-quick-actions** (temp-check, allergen-confirm)
- **PWA-install-prompt** voor home-screen-icoon (Safari/Chrome)

## State machine

```
online           → real-time sync, alle queries live
offline          → cached snapshot zichtbaar, write-queue lokaal
syncing          → bij wifi-terug: queue flushen, conflict-detectie
sync-error       → "1 actie kon niet syncen — probeer opnieuw" toast
no-event         → "Geen event vandaag — open /agenda"
```

## Acceptance criteria

1. ✅ Touch-targets minimum 56×56px (handschoenen-vriendelijk, groter dan WCAG 44)
2. ✅ Font-size body ≥18px (zonlicht-leesbaar)
3. ✅ Hoog contrast (zwart-op-wit voor outdoor)
4. ✅ Offline-snapshot werkt 4h zonder netwerk
5. ✅ Write-queue garandeert 0 verlies van punch-ins bij sync-conflict
6. ✅ Geen "echte-tijd-required" features (timer-based ipv real-time)
7. ✅ Battery-optimized: geen polling, geen lokale animaties

## Bevindingen huidige versie

### UX-gaps
- **Geen wake-lock** — scherm gaat na 30s in slaap, Lars moet opnieuw inloggen
- **Geen één-knop-noodtoegang naar HACCP** (kritieke veiligheids-record bij overschrijding)
- **PunchPanel werkt op desktop perfect** maar mobile-touch-feedback ontbreekt (zware tap-delay)

### Visual
- Mogelijk te veel info als event 12u duurt — alleen "wat nu" tonen, alle rest verbergen
- Dark-mode default voor avond-events (anders fel licht in donker)

### Cohesie
- ✅ time_logs.event_id koppeling werkt (na APK false-alarm #1 confirmed)
- ❌ Geen rechtstreekse link naar /haccp/field van field-mode (moet via menu)

## Design-prompt voor externe builder

```
Bouw een event-field-mobile-mode voor catering-software BBQ Architect.

CONTEXT
Lars (foodtruck-operator, tablet 768-1024px, handschoenen aan, fel zonlicht
of donker buiten) start dag op event-locatie. Doel: 3 dingen ZIEN + DOEN:
1) wanneer service-start, 2) prep-progress, 3) punch in/out voor uren.
Alles offline-capable (IndexedDB).

LAYOUT (mobile-first, 375-1024px, hold-portrait én landscape)
- HEADER (compact, sticky top)
  - Event-naam + datum/tijd
  - Offline-indicator pill (online/offline/syncing)
  - Battery + wifi-status (optional)
- HERO (50vh)
  - GROOT countdown: "00:45:23 tot service" (font 64px, mono)
  - Subline: "Prep 12/15 klaar (80%)"
  - Progress-ring rondom countdown
- ACTION-GRID (3 grote knoppen, 1/3 width each)
  - 🕐 "Punch in/out" → PunchPanel modal
  - 🌡️ "HACCP-check" → /haccp/field
  - 📋 "Prep-status" → drilldown lijst
- SECONDARY (collapsed accordion)
  - "Menu vandaag" (gerecht-lijst)
  - "Klantgesprek samenvatting"
  - "Logistiek (laadlijst + crew)"
- BOTTOM (sticky)
  - "Event afgelopen" → markeert status=completed + opens Reflectie

CRITICAL UX
- Touch-targets ≥56px (handschoenen)
- Font body ≥18px
- Hoog contrast (WCAG AAA voor zonlicht)
- Dark-mode automatisch na 18:00 (avond)
- Wake-lock active tijdens app-gebruik
- Geen swipe-gestures (té snel triggered)
- Tap-feedback haptisch (Vibration API)

OFFLINE-MODE
- IndexedDB snapshot bij entry (event + crew + prep_tasks)
- Service Worker met cache-first strategy
- Write-queue voor punch-ins, HACCP-records
- Auto-sync zodra wifi terug (toast: "12 acties gesynchroniseerd")
- Conflict-detectie: server-time wint

COMPONENTS
- shadcn/ui Button (XL variant), Card, Badge
- React-use Vibration API
- IndexedDB via idb library (al in deps?)
- Service Worker registratie (al in app voor PWA)

ACCESSIBILITY
- WCAG AAA contrast (7:1 voor body)
- Screen-reader: countdown via aria-live="polite" elke minuut
- Lokaal-NL only (geen taal-switch needed voor Lars)

OUT OF SCOPE
- Geen chat-functionaliteit (Sam belt direct)
- Geen video-streaming
- Geen 3D plattegrond (zit in /service/plattegrond)

CONNECTS TO
- /uren PunchPanel (zelfde component)
- /haccp/field tablet-mode
- /events/[id]/reflectie (na "Event afgelopen")
- time_logs INSERT met event_id (Lars-tracking)
```
