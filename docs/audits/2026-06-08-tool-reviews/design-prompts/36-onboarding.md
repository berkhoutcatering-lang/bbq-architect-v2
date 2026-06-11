# 36 — Onboarding `/onboarding`

**Type:** First-run wizard met PersonaQuiz + demo-seed + checklist
**Source:** `src/app/onboarding/page.tsx` + `src/components/onboarding/*`

## Wat het moet doen

Nieuwe Pro-tier tenant signupt → /onboarding. PersonaQuiz (3 vragen) → tenant-naam → demo-data-seed (10 klanten/15 gerechten/etc.) → 4-step checklist (eerste gerecht / eerste offerte / eerste klant / theming). Activation-KPI: alle 4 done = "Activated" binnen 7d.

## Componenten
- PersonaQuiz modal (3 vragen, dismiss-skippable)
- Bedrijfsnaam-input
- Demo-seed trigger (/api/onboarding/seed-demo)
- 4-step checklist (OnboardingChecklist component)
- Activation-tracking (track('first_*'))

## Acceptance
1. ✅ Quiz state in settings.persona_result (APK-fix #30 — cross-device persistent)
2. ✅ Demo-seed idempotent (re-run veilig)
3. ✅ Checklist auto-progress bij echte actie (eerste echte offerte = step done)
4. ✅ "Activated" tracking: alle 4 checklist-items=true binnen 7d

## Bevindingen
- ✅ PersonaQuiz cross-device-bug gefixed (APK #30)
- ✅ Demo-seed werkt (219r idempotent)
- ❌ Geen "skip onboarding" voor returning-users (handig voor test-tenants)

## Design-prompt

```
Bouw een onboarding-wizard voor catering-software BBQ Architect.

CONTEXT
Nieuwe Pro-tier tenant signupt. /onboarding is hun eerste indruk. Doel:
binnen 15 min een eerste-offerte gemaakt (KPI: Time-to-First-Offerte <15min).
Persona-detect + demo-seed + 4-step checklist.

LAYOUT
- Full-page (geen sidebar, geen nav)
- 3 fases:

FASE 1: PERSONA QUIZ (modal, 3 vragen)
1. "Hoeveel events plan je per jaar?" (chips: <10 / 10-50 / 50+)
2. "Wat is je grootste pijn nu?" (chips: offertes / event-dag / boekhouding / klantcomm)
3. "Wat is je bedrijfsnaam?" (text-input)
- "Overslaan" optie (set settings.persona_result = {skipped_at})

FASE 2: WELKOM-SCHERM (na quiz)
- "Welkom {bedrijfsnaam}!"
- "We hebben de app voor jou ingericht:"
  - 10 demo-klanten
  - 15 demo-gerechten
  - 8 demo-events (laatste 3 maanden + 5 vooruit)
  - 3 demo-facturen
- Loading-bar "Demo data wordt geseed... 30s"
- POST /api/onboarding/seed-demo (idempotent)

FASE 3: CHECKLIST (4 stappen)
- Sticky-bar bovenaan met progress
- 4 items:
  1. "Maak je eerste echte gerecht" → /gerechten (track first_gerecht_created)
  2. "Stuur je eerste offerte" → /offertes (track first_offerte_sent)
  3. "Voeg een echte klant toe" → /klanten (track first_klant_created)
  4. "Personaliseer je branding" → /instellingen?focus=theming (track first_theming_changed)
- Per item: ✓ done / 🚧 in-progress / ⏳ to-do
- "Activated" badge bij alle 4 done

DISMISS-FLOW
- "Sluit deze rondleiding" → settings.onboarding_dismissed=true
- Checklist verschijnt niet meer (kan via /admin re-enabled)

POST-ACTIVATION
- 7-day check: alle 4 done? = "Activated" KPI
- Send "Welkom! Hier zijn 3 power-tips" mail
- Activation-rate measured in /admin/funnel

COMPONENTS
- shadcn/ui Dialog, Card, Progress, Badge
- Custom multi-step-wizard
- Resend voor welkom-mail
- track('activation_*') events naar activation_events tabel

ACCESSIBILITY
- Quiz: aria-modal + focus-trap
- Progress-bar: aria-valuenow + valuemin/max
- Checklist-items: aria-pressed = done-state

MOBILE
- Quiz fullscreen
- Welkom-screen scrollable
- Checklist accordion

HARD RULES
- Persona-state persistent in settings.persona_result (NIET localStorage-only — APK-fix #30)
- Demo-seed idempotent (re-run veilig, geen duplicate-rows)
- track() fire-and-forget (geen blokkering bij error)
- "Activated" KPI berekend in /admin/funnel server-side

CONNECTS TO
- POST /api/onboarding/seed-demo (idempotent seed)
- track() + trackOnce() naar activation_events
- settings.persona_result + onboarding_completed + onboarding_dismissed
- /admin/funnel (KPI-tracking)
```
