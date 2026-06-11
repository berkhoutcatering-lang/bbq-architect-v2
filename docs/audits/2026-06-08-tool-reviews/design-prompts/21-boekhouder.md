# 21 — Boekhouder maandpakket `/geld/boekhouder`

**Type:** Maandelijks accountant-bundel met RGS-categorisering
**Source:** `src/app/geld/boekhouder/page.tsx` + `/api/boekhouder/*`

## Wat het moet doen

Maandelijks: alle facturen + bonnen + uren + ritten van die maand gebundeld in 1 PDF/ZIP voor de boekhouder. RGS-categorisering (Referentie Grootboekschema) AI-classified + Sam confirms. Auto-mail naar boekhouder via Resend bij maand-end.

## Componenten
- Maand-selector
- KPI-strip (omzet/kosten/btw/saldo)
- Document-categorieën (Facturen / Bonnen / Uren / Ritten)
- AI Classify-button (RGS per row)
- Pakket-builder + email-flow

## State
```
loading             → skeleton
loaded              → data per maand
classifying         → AI denkt (Haiku per row, ~50 rows = ~5s)
classified-preview  → Sam confirms per category
building            → PDF/ZIP-gen
sent                → "Pakket verstuurd naar {email}" toast
locked              → maand-lock voorkomt wijzigingen na verzending
```

## Acceptance
1. ✅ AI Classify is **suggestie** — Sam confirms vóór final
2. ✅ Lock-mechanism (facturen.locked_at) na pakket-verzending
3. ✅ Boekhouder email-template via Resend
4. ✅ Cron auto-trigger op dag-3-na-maand-einde (APK-fix cron-schedule)

## Bevindingen
- ✅ Boekhouder-cron in vercel.json (APK-fix #19)
- ⚠️ Lock-mechanism werkt (facturen.locked_at + locked_by_user_id) — maar UI-feedback?
- ❌ Geen "verschil-tov-vorige-maand"-rapportage

## Design-prompt

```
Bouw een boekhouder-maandpakket tool voor catering-software BBQ Architect.

CONTEXT
Sam stuurt maandelijks bundel naar boekhouder. Doel: 5 minuten ipv 2 uur.
RGS-categorisering AI-suggested, Sam confirms, send-via-mail.

LAYOUT
- Tab nav: Financiën | Uren | Bonnen | Boekhoud-archief | Ritten | Boekhouder (active)
- Maand-selector: < April 2026 > | Vandaag

KPI-STRIP (4 cards)
- Omzet: € (X facturen verzonden)
- Uitgaven: € (Y bonnen geboekt)
- BTW saldo: € (te ontvangen / te betalen)
- Tijd: X uren geregistreerd

CATEGORIE-BLOKKEN (4 secties expanded)
1. FACTUREN (X verzonden)
   - Lijst: nummer | klant | datum | totaal | RGS-categorie (default 8000)
   - "Verzonden" pill als reeds verstuurd
   - Lock-status (na pakket-verzending = read-only)
2. BONNEN (Y geboekt)
   - Lijst: datum | leverancier | totaal | RGS-categorie (AI-suggested)
   - "AI Classify" knop bulk-classify
   - Per row Sam confirms / wijzigt categorie
3. UREN (Z geregistreerd)
   - Per personeel: totaal uren × tarief = loon-kost
   - RGS-categorie: 4000 (lonen)
4. RITTEN (N km)
   - Totaal km × €0.23 = aftrekbaar
   - RGS-categorie: 4170 (reiskosten)

PAKKET-BUILDER (sticky-rechts)
- "Pakket samenstellen"-button
- Toont: 1 PDF (facturen) + 1 ZIP (bonnen) + 1 CSV (uren) + 1 PDF (ritten)
- Email-template preview (Resend)
- "Verstuur naar boekhouder@example.com" CTA
- Confirm-dialog: "Lock alle facturen + bonnen voor deze maand?"

ACTIONS
- AI Classify (Haiku, ~50 rows ~5s)
- Lock maand (post-send)
- Download zonder mailen
- Resend mail naar boekhouder

COMPONENTS
- shadcn/ui Tabs, Card, Accordion, Table, Dialog
- TanStack Table v8
- Resend voor email
- react-pdf voor PDF-bundel

ACCESSIBILITY
- AI Classify: aria-live "Classificeren..."
- Lock-confirm: aria-modal
- RGS-suggesties: aria-described "AI denkt: RGS 4150"

MOBILE
- Categorie-blokken accordion
- Pakket-builder bottom-sheet

HARD RULES
- RGS-suggesties zijn AI maar Sam confirms (geen auto-apply)
- Lock-mechanism voorkomt edits na verzending (auditable)
- Email via Resend (geen direct SMTP)

CONNECTS TO
- /api/boekhouder/classify (Haiku per row)
- /api/boekhouder/pakket (PDF/ZIP-gen)
- /api/boekhouder/pakket/email (Resend mail)
- Cron: /api/cron/boekhouder-mail-monthly (APK-fix #19)
- facturen.locked_at + locked_by_user_id (lock-mechanism)
```
