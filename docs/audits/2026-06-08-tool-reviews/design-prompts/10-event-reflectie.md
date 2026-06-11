# 10 — Event-reflectie `/events/[id]/reflectie`

**Type:** Post-event self-evaluatie + AI-rewrite voor klant-feedback
**Source-bestand:** `src/app/events/[id]/reflectie/page.tsx` + `/api/service-feedback-rewrite`

---

## Wat het moet doen

Event is afgelopen. Binnen 7 dagen vult Sam een reflectie in: **score 1-10**, wat ging goed, wat kon beter, actie-items voor volgend event. Plus: optionele **klant-feedback-input** + AI-rewrite (Haiku) die ruwe klant-quotes polisht voor case-studies of website-content.

Triggert: **Service→Factuur status-flip CTA** op event-hub Overzicht-tab (APK-fix #7). Reflectie ingevuld = factuur kan verstuurd worden.

## Componenten gebruikt

- **Score-slider** 1-10 (smiley-emoji per niveau)
- **Wat-goed / Wat-beter textarea** (BlockNote rich-text)
- **Actie-items** (checklist met add-button)
- **Klant-feedback-section** (optional, rauwe quotes)
- **AI-rewrite-knop** "Polish dit voor website" → POST `/api/service-feedback-rewrite`
- **History-link** naar laatste 5 reflecties voor patroon-herkenning

## State machine

```
empty           → "Reflectie nog niet ingevuld" + form
draft           → save-as-draft elke 30s
saved           → ✅ "Reflectie ingevuld + factuur kan worden verzonden"
rewriting       → AI denkt 5s
rewritten       → diff zichtbaar (origineel vs gepolisht), accept/edit
```

## Acceptance criteria

1. ✅ Auto-save draft elke 30s
2. ✅ Score < 7 → AI-prompt "Wil je oorzaak/actie loggen?"
3. ✅ AI-rewrite preserves intent (Haiku ≈ €0.005/call)
4. ✅ Reflectie-status triggert factuur-CTA op event-hub (APK-fix #7)
5. ✅ Score-historie zichtbaar in /financien Top-klanten

## Bevindingen huidige versie

### UX-gaps
- **Geen reminder-cron** — Sam vergeet reflectie 7 dagen na event (memory zegt "binnen een week")
- **Geen team-input** — Lars + sous-chef kunnen niet apart score-en
- **Geen audio-reflectie** ("dicteer 2 minuten") — Sam typt liever niet na lange event-dag
- **Geen template-vragen** ("Wat was de bottleneck?") — leeg vrije-tekst veld

### Visual
- Score-slider zou meer karakter mogen (smiley emoji per niveau, kleur-gradient van rood naar groen)

### Cohesie
- ✅ Triggert factuur-CTA na invullen (APK-fix #7)
- ❌ Geen automatische "Pulled from previous reflecties" suggesties bij volgend event

## Design-prompt voor externe builder

```
Bouw een post-event reflectie-tool voor catering-software BBQ Architect.

CONTEXT
Event is afgelopen. Sam vult binnen 7 dagen 1-pager reflectie in:
score, leerpunten, actie-items. Dit sluit het loop: factuur kan
worden verzonden, klant-feedback wordt gepolisht voor website.

LAYOUT
- Header: "Reflectie · {event.name}" + datum + score-pill (als ingevuld)
- Hero-question: "Hoe ging het? (1-10)"
  - Slider met smiley-emoji per stap (😞 1 → 🤩 10)
  - Kleur-gradient rood → groen
  - "Onder 7" toont waarschuwing "Wil je oorzaak loggen?"
- Templated vragen:
  - "Wat ging goed?" (BlockNote textarea, 200-500 chars)
  - "Wat kan beter?" (BlockNote textarea)
  - "Actie-items voor volgend event" (checklist, add-button)
- Optional KLANT-FEEDBACK section:
  - "Wat zei de klant?" (vrij textarea)
  - AI-rewrite-knop "Polish voor website" → toont preview-diff
- History-sidebar: "Laatste 5 reflecties"
  - Score-trend mini-chart
  - Klikbaar naar oude reflectie (read-only)
- Footer-actie:
  - "Bewaar reflectie" → status='completed' + trigger factuur-CTA
  - "Bewaar als concept" → status='draft'

INTERACTIONS
- Auto-save draft elke 30s
- Score < 7 → modal "Wil je oorzaak loggen?" met dropdown (locatie / crew / klant / weer / supply)
- AI-rewrite: diff-view origineel vs gepolisht, accept/edit/keep-original
- Submit → triggert /events/{id}/hub factuur-CTA prominent

COMPONENTS
- BlockNote rich-text-editor
- shadcn/ui Slider, Button, Card, Dialog
- Recharts mini-line voor score-trend

ACCESSIBILITY
- Slider: aria-valuenow + valuemin/max + valuetext "8 uit 10, zeer goed"
- AI-rewrite: aria-live "AI polisht tekst..."
- Auto-save toast: aria-live "polite"

MOBILE
- 1-koloms stack
- Slider met grote tap-targets (60px hoogte)
- History-sidebar onder ipv naast

OUT OF SCOPE
- Geen NPS-survey naar klant (apart endpoint)
- Geen video-reflectie
- Geen team-aggregate-scoring (single-author voor v1)

CONNECTS TO
- /api/service-feedback-rewrite (Haiku ~5s)
- /events/{id}/hub Overzicht-tab (triggert factuur-CTA via APK-fix #7)
- /financien Top-klanten (score-trend per klant)
- /klanten/{id} reflectie-historie
```
