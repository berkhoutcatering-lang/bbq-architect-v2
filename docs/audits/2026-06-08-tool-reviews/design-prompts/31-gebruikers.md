# 31 — Gebruikers (team) `/gebruikers`

**Type:** Team-management + rol-toewijzing + invite-flow
**Source:** `src/app/gebruikers/page.tsx`

## Wat het moet doen

Sam beheert zijn team (Lars, sous-chef, manager). Per gebruiker: rol (Admin/Pitmaster/Medewerker), uurtarief, status (active/inactive). Invite via email — magic-link via Supabase Auth.

## Componenten
- Team-tabel met rol-pills
- Invite-modal (email + rol)
- Per-gebruiker drawer (edit rol/tarief/permissies)
- Personeel-koppeling (organization_members.user_id → personeel record)

## Acceptance
1. ✅ Alleen Admin mag rollen wijzigen (RLS rol-gating uit #4 design-doc)
2. ✅ Invite-email via Resend (template + magic-link)
3. ✅ Inactive-toggle voorkomt login zonder revoke
4. ✅ Uurtarief-history bewaard (audit-log)

## Bevindingen
- ✅ Personeel-tabel + organization_members + uurtarief-snapshot in time_logs
- ❌ APK constateerde: rol-gating ONLY in UI, niet RLS (zie #4 design-doc, draft migration)

## Design-prompt

```
Bouw een team-management-tool voor catering-software BBQ Architect.

CONTEXT
Sam (Admin) heeft team van 2-15 mensen. Wil rol-toewijzing, uurtarieven
tracken, invite-link sturen. Lars hoeft niet alle hubs te zien — alleen
Vandaag + Plannen + Uren (rol-based visibility).

LAYOUT
- Sub-tab nav: Instellingen | Gebruikers (active) | Mailbox | Website | Hulp | Admin
- Header: "Team" + invite-CTA + "Export uren"-knop
- Tabel-cols: Naam | Email | Rol | Uurtarief | Status | Laatst actief | Acties

ROL-PILLS (3 enum)
- Admin (kleur-coded gold) — alle hubs + alle acties
- Pitmaster (silver) — Vandaag + Plannen + Keuken + Voorraad (read)
- Medewerker (basic) — Vandaag + Uren only

TABEL-ACTIES (per row)
- Edit (drawer: rol/tarief/permissies)
- Disable account (status='inactive')
- Send password-reset (Resend mail)
- Delete (alleen Admin + confirm met "DELETE typen")

INVITE-MODAL
- Email-input (multi: bulk-invite)
- Rol-dropdown (default Medewerker)
- Optional: uurtarief
- Optional: persoonlijk bericht
- "Verstuur uitnodigingen" → Resend mail met magic-link
- Pending invites lijst onder (re-send / cancel)

EDIT-DRAWER (per gebruiker)
- Naam (edit)
- Email (read-only, change via Supabase Auth flow)
- Rol-dropdown (alleen Admin kan wijzigen)
- Uurtarief (number, snapshot bij wijziging in audit-log)
- Permissies-matrix (toekomst v2)
- Activity-tab: laatste 10 acties van deze user

INACTIVE-FLOW
- Toggle "Actief" → status='inactive'
- Session-revoke + redirect /login
- Auto-stop-clock op time_logs (al SECDEF function)
- Data behoudt (audit-log dependency)

COMPONENTS
- shadcn/ui Table, Dialog, Drawer, Badge
- TanStack Table v8
- Resend voor invite-mail
- Supabase Auth voor magic-link

ACCESSIBILITY
- Tabel: scope=col
- Rol-pill: aria-label "Pitmaster, kan keuken en plannen beheren"
- Invite-modal: focus-trap

MOBILE
- Tabel → kaart-list
- Invite-modal full-screen

HARD RULES (kritiek)
- Alleen Admin kan rol wijzigen (UI + RLS gegated via #4 design-doc)
- Uurtarief-wijziging triggert audit-log entry
- Inactive ≠ Delete (data behouden voor uren-history)
- Magic-link expires na 24u (Supabase default)

CONNECTS TO
- organization_members tabel
- personeel tabel (uurtarief, koppeling)
- invitations tabel (pending invites)
- Supabase Auth (magic-link)
- /api/org/invite (server action)
- audit_log (alle changes auto-logged)
```
