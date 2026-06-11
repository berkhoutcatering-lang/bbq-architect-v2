# 07 — Event-hub Klantgesprek-tab `/events/[id]/hub` (Klantgesprek)

**Type:** Intake-form + AI-extract uit audio/notities
**Source-bestand:** `src/app/events/[id]/hub/page.tsx` (Klantgesprek-tab) + `/api/klantgesprek/extract`

---

## Wat het moet doen

Sam belt met een klant of meet met ze, neemt notities (typed of audio), en de Klantgesprek-tab structureert die in: gewenste sfeer, allergieën, speciale wensen, dieet-restricties, drank-voorkeuren, locatie-details, levertijd, breakdown. Plus: AI-extract (Claude Sonnet) kan ruwe notities omzetten naar gestructureerde velden.

Dit is **Sam's "second brain"** per event — zodat hij maandag niet hoeft te onthouden wat klant op donderdag zei.

## Componenten gebruikt

- **BlockNote** rich-text-editor voor vrije notities
- **Structured-fields** form (sfeer, allergieën, dieet, drank, levertijd, locatie-info)
- **Audio-upload** drop-zone (mp3/m4a, max 25MB)
- **AI-extract** button: POST `/api/klantgesprek/extract` met ruwe tekst of audio-URL
- **History-list** van eerdere gesprekken met deze klant (cross-event referentie)

## State machine

```
empty           → "Geen klantgesprek opgeslagen — typ of plak notities, of upload audio"
typing          → BlockNote in edit-mode, auto-save debounced 2s
extracting      → AI denkt 8-15s (audio = duurder), skeleton-fields zichtbaar
extracted       → fields gevuld, user confirms/edits
saved           → "Bewaard" toast + activity-timeline-entry
audio-uploading → upload progress 0-100%
audio-transcribing → Anthropic + Whisper combo
```

## Acceptance criteria

1. ✅ BlockNote auto-saves elke 2s (geen verloren werk bij browser-crash)
2. ✅ AI-extract toont preview before save (user kan corrigeren)
3. ✅ Audio-upload max 25MB (consistent met `email-attachments` bucket limit)
4. ✅ Cross-event-history toont laatste 5 gesprekken met deze klant
5. ✅ Geen PII naar Anthropic zonder explicit consent toggle
6. ✅ Mobile 375px → editor full-width, audio-upload via camera-microfoon-direct

## Bevindingen huidige versie

### UX-gaps
- **Geen voice-recording in-browser** — Sam moet apart opnemen + uploaden (waarom geen MediaRecorder API)
- **Geen "kopiëren van vorige offerte"** — als terugkerende klant, prefill met laatste gesprek-data
- **AI-extract kost-indicatie ontbreekt** ("Dit AI-extract kost €0.15") — Pro-tier transparency
- **Geen template-vragen** ("Vragen je zou moeten stellen": dieet/allergie/drank/sfeer/budget)

### Visual
- BlockNote editor heeft niet altijd theme-cascade (mogelijk wit-on-wit in donker-mode)
- Audio-waveform-preview na upload zou nuttig zijn

### Cohesie
- ✅ Linked to klant.history (alle eerdere gesprekken)
- ❌ Geen "stuur samenvatting naar klant ter bevestiging" workflow

## Design-prompt voor externe builder

```
Bouw een klantgesprek-intake-tool als sub-tab binnen event-hub.

CONTEXT
Sam belt/meet klanten, neemt notities, wil ze AI-structureren. Notities
worden referentie tijdens hele event-flow (offerte, prep, service).
Voorkomt "wat zei klant ook al weer?" 3 weken later.

LAYOUT
- Sub-tab header: "Klantgesprek" + status-pill (geen / concept / ingevuld)
- Body 2-koloms (desktop) / 1-kolom (mobile):
  - LEFT: BlockNote rich-text editor (groot, focus)
    - Toolbar: bold/italic/list/checkbox
    - Voice-record button (MediaRecorder API)
    - Audio-upload drop-zone
  - RIGHT: Gestructureerde fields
    - Sfeer (chips: zakelijk / feestelijk / informeel / chic / familiair)
    - Allergieën (multi-select uit standaard-lijst + vrije input)
    - Dieet-restricties (vega / vegan / halal / glutenvrij / lactose)
    - Drank-voorkeuren (radio: alleen non-alc / wijn-bier / cocktails / open-bar)
    - Levertijd-info (textarea + time-pickers)
    - Locatie-details (textarea: opstelling, parkeer, stroom)
    - Breakdown-tijden (textarea)
- Footer-actie-row:
  - "AI-extract uit notities" → fields auto-fill met preview-confirm
  - "Bewaar" (primary, default)
  - "Stuur samenvatting naar klant" → Resend template-mail

CROSS-EVENT HISTORY (sidebar)
- "Eerdere gesprekken met {klant.naam}"
- Lijst laatste 5 events met snippet + datum
- Klik = laad oude notities als referentie (read-only side-by-side)

AI-EXTRACT
- POST /api/klantgesprek/extract {text, audio_url}
- Cost-indicator vooraf: "€0.15 (Sonnet 4.6, ~8s)"
- Streaming output zichtbaar tijdens denken
- Preview-confirm dialog: "AI denkt: sfeer=feestelijk, dieet=vega 2pp — accept?"

COMPONENTS
- BlockNote rich-text-editor (al in deps)
- MediaRecorder API voor in-browser voice-record
- shadcn/ui Combobox voor allergie-multi-select
- File-upload drop-zone (al pattern uit /bonnen)

ACCESSIBILITY
- Editor: aria-label "Klantgesprek notities"
- Voice-record: aria-pressed state
- AI-extract: aria-live "AI verwerkt..."

OUT OF SCOPE
- Geen real-time transcription tijdens opname (alleen na save)
- Geen multi-participant tracking
- Geen video (alleen audio + text)

CONNECTS TO
- POST /api/klantgesprek/extract (AI Sonnet)
- klanten.history cross-event referentie
- /mailbox = "Stuur samenvatting" flow
```
