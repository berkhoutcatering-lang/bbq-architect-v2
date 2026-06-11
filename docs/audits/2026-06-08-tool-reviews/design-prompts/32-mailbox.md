# 32 — Mailbox `/mailbox`

**Type:** Send-only email-templates + verzendhistorie
**Source:** `src/app/mailbox/page.tsx`

## Wat het moet doen

Sam beheert templates voor klant-mails (offerte-verzonden, factuur-herinnering, bedankt-na-event, etc.). Past per offerte ad-hoc aan. Ziet historie van wat-naar-wie verzonden. Geen inbox (Cloudflare worker doet inkomende voor price-intelligence + leads).

## Componenten
- Verzonden-lijst (tabel met thread-naam, ontvanger, datum, status)
- Filter-pills (Alle / Vrij bericht / Offerte / Factuur / Herinnering)
- Templates-editor (BlockNote + variabelen-replacers `{{naam}}` `{{datum}}`)
- Nieuwe-email composer

## Acceptance
1. ✅ Resend webhook tracking (sent/delivered/opened/bounced)
2. ✅ Variabelen-replace via Mustache-stijl
3. ✅ Template per categorie (Offerte/Factuur/Herinnering/Vrij)
4. ✅ Send via Resend met retry on transient errors

## Bevindingen
- ✅ APK confirmed: send-only (geen inbox-tab)
- ❌ Geen "klant heeft geopend" tracking in UI (Resend webhook geen visualisatie)
- ❌ Geen "schedule send for later" optie

## Design-prompt

```
Bouw een email-templates-tool voor catering-software BBQ Architect.

CONTEXT
Sam stuurt klant-mails: offerte-verzonden, factuur-herinnering, na-event-
bedankt. Wil templates ipv elke keer typen. Wil zien wat-naar-wie wanneer.

LAYOUT
- Sub-tab nav: Instellingen | Gebruikers | Mailbox (active) | Website | Hulp | Admin
- Header: "Mailbox" + "Nieuwe e-mail"-CTA
- Sub-tabs: Verzonden (default) | Nieuwe e-mail | Templates

TAB 1: VERZONDEN
- Filter-pills: Alle / Vrij bericht / Offerte / Factuur / Herinnering
- Search-bar (op klant-naam, onderwerp, email)
- Tabel-cols: Datum | Klant | Onderwerp | Categorie | Status pill
- Status-pills: Verzonden / Bezorgd / Geopend / Gebounced
- Klik row → detail (sent-content + tracking-events)
- Bulk-acties: archiveer / resend

TAB 2: NIEUWE E-MAIL (composer)
- Ontvanger: combobox over klanten (cmdk)
- Template-picker (uit Templates-tab)
- Variabelen-replace: `{{klant.naam}}` `{{offerte.nummer}}` `{{event.datum}}`
- BlockNote rich-text body
- Attachments-upload (PDF van offerte/factuur auto-attach optie)
- Preview-modus (rendered HTML)
- Schedule-send (toekomst v2)
- "Verzenden" CTA → Resend mail

TAB 3: TEMPLATES
- Tabel: Naam | Categorie | Last gebruikt | Acties
- "Nieuw template"-button
- Per template: name + categorie + body (BlockNote) + variabelen-help
- Default-templates (uit migration): "Offerte verzonden" / "Factuur verzonden" / "Herinnering 30d"

INTERACTIONS
- Template-picker → vult body in composer
- Variabelen-tooltip: hover op `{{name}}` toont voorbeeld-data
- Preview before send (verplicht voor offerte/factuur)
- Resend webhook updates status-pills async

EMPTY-STATE
- "Nog geen e-mails verzonden" + CTA "Nieuwe e-mail"

COMPONENTS
- BlockNote rich-text (al in deps)
- shadcn/ui Tabs, Card, Table, Dialog
- cmdk voor klant-autocomplete
- Resend voor send + webhook
- Mustache.js voor template-rendering

ACCESSIBILITY
- Composer: form-validation aria-described
- Status-pills: aria-label "Email aan Hopp, bezorgd 14 mei"
- Preview-button: aria-haspopup="dialog"

MOBILE
- Composer full-screen
- Verzonden-tabel → kaart-list

HARD RULES
- Resend voor alle outbound (geen direct SMTP)
- Variables-replace server-side (anti-XSS)
- Audit-log per send (welke user, naar wie, body-hash)

CONNECTS TO
- emails tabel (sent history)
- email_templates tabel
- POST /api/send-email (Resend wrapper)
- Resend webhook → email status-updates
- klanten autocomplete
- offerte/factuur auto-attach
```
