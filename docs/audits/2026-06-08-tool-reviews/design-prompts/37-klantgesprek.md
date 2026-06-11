# 37 — Klantgesprek-extractor `/klantgesprek`

**Type:** Standalone intake-tool (AI extract uit notities)
**Source:** `src/app/klantgesprek/page.tsx` + `/api/klantgesprek/extract`

## Wat het moet doen

Sam belt met potentiële klant, opent /klantgesprek (apart van event-context), neemt notities of upload audio, AI structureert: contact-info, event-details, dieet-restricties, budget. Output → maak Lead OF Klant + Offerte-draft.

## Componenten
- BlockNote vrije notities-editor
- Audio-upload + transcribe (toekomst)
- AI extract-knop (Sonnet 4.6)
- Output preview met fields
- "Maak lead" / "Maak offerte" CTAs

## Acceptance
1. ✅ AI extract <10s p95
2. ✅ Output velden Sam-confirmable before save
3. ✅ Privacy: notities geen 30d na save bewaard (cron)
4. ✅ Linkt naar bestaande klant als email-match

## Bevindingen
- ✅ /api/klantgesprek/extract endpoint bestaat (Sonnet)
- ⚠️ Standalone vs event-hub-tab Klantgesprek = 2 ingangen, mogelijk verwarrend

## Design-prompt

```
Bouw een standalone klantgesprek-extractor voor catering-software BBQ Architect.

CONTEXT
Sam belt klant, neemt notities op telefoon/laptop. /klantgesprek is een
quick-intake-tool: typen of audio, AI structureert, output = lead of
direct offerte-draft. NIET gebonden aan bestaand event (dat zit in
/events/{id}/hub/klantgesprek).

LAYOUT
- Centraal-canvas (geen sidebar full-width focus)
- 2 zones:

ZONE 1: NOTITIES (groot, focus)
- BlockNote rich-text editor
- Toolbar minimaal (bold/italic/list)
- Voice-record button (MediaRecorder)
- Audio-upload drop-zone (mp3/m4a max 25MB)

ZONE 2: AI-OUTPUT (collapsible, rechts)
- "Extract met AI" CTA
- Loading: "Rook luistert... 8-12s"
- Streaming output toont parsed-fields:
  - Klant-naam + email + telefoon
  - Event-datum (datepicker geparsed)
  - Aantal gasten (number)
  - Locatie
  - Event-type (chips: bruiloft/bedrijfsfeest/etc.)
  - Dieet/allergieën
  - Budget
  - Bericht/wensen
- Edit per veld (Sam confirms)

ACTIES NA EXTRACT
- "Maak lead" → naar /verkoop/leads (POST /api/leads + redirect)
- "Maak offerte" → naar /offertes?wizard=true met prefill (localStorage)
- "Bestaande klant" → match op email → naar /klanten/{id} + nieuwe-offerte
- "Alleen bewaren" → save als gespreks-notitie (cross-event-history)

CROSS-EVENT-HISTORY
- Sidebar links toont laatste 5 gesprekken (klantgesprekken tabel)
- Per gesprek: klant + datum + outcome (lead/offerte/niets)

PRIVACY
- Audio max 25MB
- Audio + notities verwijderen 30d na save (cron)
- AI-extract alleen op opt-in user-toggle (NL AVG)
- Geen audio naar Anthropic zonder consent

COMPONENTS
- BlockNote voor notities
- MediaRecorder API voor voice-record
- shadcn/ui Card, Button, Dialog
- Streaming Anthropic SDK

ACCESSIBILITY
- Voice-record: aria-pressed state
- AI-loading: aria-live "Rook verwerkt notities..."
- Output-fields: edit-able met aria-described validation

MOBILE
- Notities full-width
- AI-output bottom-sheet
- Voice-record prominent button

HARD RULES
- Audio + notities cleanup-cron 30d (AVG)
- AI is suggestie — Sam confirmt elk veld
- Match op email vóór nieuwe klant aanmaken (anti-dup)

CONNECTS TO
- POST /api/klantgesprek/extract (Sonnet 4.6)
- klanten tabel (match op email)
- leads / offertes (output-targets)
- klantgesprekken tabel (history)
- Cron /api/cron/klantgesprek-cleanup (privacy)
```
