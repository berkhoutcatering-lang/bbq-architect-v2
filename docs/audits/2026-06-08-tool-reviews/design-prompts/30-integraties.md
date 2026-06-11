# 30 — Integraties `/instellingen/integraties`

**Type:** OAuth-status board (Moneybird / Mollie / Google Calendar)
**Source:** `src/app/instellingen/integraties/page.tsx`

## Wat het moet doen

Sam ziet status van zijn 3 integraties (groen/grijs), klikt "Connect" voor OAuth-flow, ziet sync-historie (laatste 10 calls), kan disconnect. Plus extension API-keys.

## Componenten
- Status-board cards per integratie
- OAuth-connect-flow per service
- Last-sync timestamp + history
- API-key manager voor Chrome extension

## Acceptance
1. ✅ Status-pill auto-poll elke 60s
2. ✅ OAuth-redirect terug naar /instellingen/integraties met confirm-toast
3. ✅ Disconnect = revoke tokens + cleanup
4. ✅ Chrome extension API-keys met rotation

## Bevindingen
- ✅ APK confirmed Moneybird OAuth + Mollie webhook setup
- ⚠️ Google Calendar + Exact integratie status onbekend
- ❌ Geen "test connection"-knop per service (handig na config-wijziging)

## Design-prompt

```
Bouw een integratie-status-board voor catering-software BBQ Architect.

CONTEXT
Sam koppelt Moneybird (boekhouding), Mollie (iDEAL), Google Calendar.
Setup 1× via OAuth, monitor status, disconnect indien nodig.

LAYOUT
- Header: "Integraties" + "Bekijk alle koppelingen"
- Grid 3-koloms (desktop) / stack (mobile):

PER INTEGRATIE CARD
- Logo (Moneybird/Mollie/Google)
- Naam + 1-zin uitleg
- Status-pill:
  - ✅ Verbonden (groen) + laatst-sync timestamp
  - ⚠️ Token verlopen (oranje) + Reconnect-CTA
  - ❌ Niet verbonden (grijs) + Connect-CTA
- "Configuratie"-knop → drawer met:
  - Account-info (welke email/org gekoppeld)
  - Sync-historie (laatste 10 calls)
  - "Test verbinding" button (1-shot ping)
  - "Verwijder koppeling" (confirm dialog)

MONEYBIRD (NL boekhouding)
- OAuth-flow: /api/integrations/moneybird/connect
- Sync-acties: factuur-push, contact-sync
- Rate-limit awareness (150/5min)

MOLLIE (iDEAL betalingen)
- API-key input (geen OAuth)
- Webhook URL display: copy-to-clipboard
- Test-payment knop (€0.01 sandbox)

GOOGLE CALENDAR
- OAuth-flow: /api/calendar/google/connect
- Sync direction toggle (1-way / 2-way)
- Calendar-picker (welke kalender events naartoe)

CHROME EXTENSION API-KEYS (apart sectie)
- Lijst van API-keys met label + last-used
- "Genereer nieuwe key"-button
- "Roteer key" (oude blijft 48u geldig)
- Per key: scope (read-only / write)

ACTIES
- Connect / Disconnect per service
- Test-connection
- Rotate API-key

COMPONENTS
- shadcn/ui Card, Badge, Dialog, Drawer
- OAuth-flow handlers
- Copy-to-clipboard (Sonner toast)

ACCESSIBILITY
- Status-pill: aria-label "Moneybird verbonden sinds 14 mei"
- Test-knop: aria-busy tijdens ping
- API-key: aria-hidden default (toggle reveal)

MOBILE
- Cards 1-koloms
- Drawer full-screen

HARD RULES
- API-keys nooit in URL of localStorage (only HttpOnly cookies)
- Webhook-URL display met copy-only (geen edit)
- Disconnect = volledig revoke (no orphan tokens)

CONNECTS TO
- /api/integrations/moneybird/* (OAuth-flow)
- /api/calendar/google/connect
- extension_keys tabel
- /api/payments/mollie/webhook (status-check)
```
