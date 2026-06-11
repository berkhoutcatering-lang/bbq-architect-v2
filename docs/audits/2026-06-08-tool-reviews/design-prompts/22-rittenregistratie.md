# 22 — Rittenregistratie `/administratie/rittenregistratie`

**Type:** Sluitende kilometeradministratie + Moneybird-push
**Source:** `src/app/administratie/rittenregistratie/` + `_client.tsx` + `RitForm.tsx`

## Wat het moet doen

Sluitende km-administratie voor Belastingdienst (€0,23/km aftrekbaar). Per rit: datum, kilometers, bestemming, doel, gekoppeld event (optional). AI scan-km (Opus vision uit dashboard-foto). Maandelijks: Moneybird-push.

## Componenten
- RitForm met event-koppeling field (al gebouwd)
- Ritten-lijst (TanStack Table)
- AI scan-km (Opus vision)
- Moneybird-push CTA
- "Vergeten ritten" reminder (cron-job)

## State
```
empty           → "Geen ritten — voeg eerste toe"
loaded          → tabel met ritten
adding          → RitForm modal
scanning        → Opus vision (~10s) parses dashboard
moneybird-pushing → API call (~5s)
sent            → "X ritten gesynchroniseerd" toast
```

## Acceptance
1. ✅ Event-koppeling UI bestaat (RitForm.tsx:383 "Gekoppeld event optioneel") — APK confirmed
2. ✅ Belasting €0,23/km auto-berekend
3. ✅ Moneybird-push idempotent (ritten_moneybird_pushes tabel)
4. ✅ "Vergeten ritten"-cron-mail werkt (in vercel.json)
5. ✅ Opus vision parses dashboard-foto naar km-stand

## Bevindingen
- ✅ RitForm volledig — name velden, datum, event-koppel
- ✅ /financien toont transport-widget "Events gedekt 0/2" (zichtbaar maar manueel koppelen)
- ❌ Geen GPS-track-modus (handmatig + AI-scan only)
- ❌ Geen "kopieer rit van vorige week" voor recurring routes

## Design-prompt

```
Bouw een kilometeradministratie-tool voor catering-software BBQ Architect.

CONTEXT
Sam rijdt naar event-locaties. Belasting accepteert €0.23/km mits sluitend
gelogd. AI scan-km uit dashboard-foto bespaart typen.

LAYOUT
- Header: "Rittenregistratie" + "Nieuwe rit"-button + maand-selector
- KPI-strip:
  - Totaal km deze maand: 39
  - Aftrekbaar: €8,97
  - Aantal ritten: 2
  - Events gedekt: 0/2 ⚠ (CTA "Koppel" → bulk-modal)
- Tabel: Datum | Van | Naar | Km | Doel | Gekoppeld event | Acties

NIEUWE RIT MODAL (RitForm bestaande)
- Datum (datepicker)
- Vertrekpunt + Bestemming (autocomplete uit eerdere ritten)
- Km (number) of "Scan dashboard-foto" (Opus vision)
- Doel (chips: catering / inkoop / vergader / overig)
- "Gekoppeld event"-dropdown (uit events.date matching ±3d)
- Notes (optional)

AI SCAN-KM
- Camera/upload dashboard-foto
- Opus vision parse km-stand
- Sam confirms before save

ACTIONS-PER-RIT
- Edit | Dupliceer | Verwijder
- "Koppel aan event"-quick-select

MOANEYBIRD-PUSH (sticky bottom)
- "Push X ritten naar Moneybird" (alleen ongepushte)
- Confirm: "Marked als gepusht, geen edit meer"
- Idempotency via ritten_moneybird_pushes UNIQUE

VERGETEN-RITTEN-BANNER (top)
- Cron-job vindt events zonder rit
- Banner: "We zagen 3 events deze week zonder rit — wil je ze loggen?"
- Klik = pre-fill modal per event

COMPONENTS
- TanStack Table v8 voor ritten-lijst
- shadcn/ui Dialog voor RitForm
- Camera-API + drop-zone voor scan-km
- Cron AI voor reminder

ACCESSIBILITY
- Tabel: scope=col
- Scan-modus: aria-live "Camera actief, lijn dashboard uit"
- Moneybird-push: aria-busy

MOBILE
- Tabel → kaart-list
- RitForm full-screen
- Camera-scan in-app (geen URL upload)

HARD RULES
- €0.23/km is fiscale rate — server-side constant (NIET AI)
- Moneybird-push idempotent (UNIQUE constraint)
- Event-koppeling via event.date ± 3 dagen heuristic

CONNECTS TO
- POST /api/ritten/scan-km (Opus vision)
- POST /api/ritten/moneybird-push (idempotent)
- POST /api/ritten/recap (AI samenvatting per maand)
- Cron /api/cron/ritten-vergeten (in vercel.json, APK-fix #19)
- events.date voor koppel-heuristic
```
