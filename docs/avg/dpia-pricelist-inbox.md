# DPIA — Price Intelligence Inbox

**Versie:** 0.1 · **Datum:** 2026-05-04 · **Status:** Draft

## Wat verwerken we

De `Inbox`-lane in `/price-intelligence` ontvangt e-mails (incl. attachments) van
externe leveranciers, op een per-organisatie inbox-adres
`pl-{slug}@in.bbqarchitect.app`. Doel: prijslijsten parsen en aan de
boekhouding van de tenant koppelen.

| Datatype | Voorbeeld | Bron |
|---|---|---|
| Verzender e-mailadres | `vlees@hanos.nl` | Externe leverancier |
| Verzender naam | "Jan de Vries — Hanos" | Externe leverancier |
| Onderwerp + body excerpt | "Prijslijst week 18" | Externe leverancier |
| Attachments (PDF/JPG/XLS) | prijslijst PDF | Externe leverancier |
| Geëxtracteerde producten | naam, prijs, eenheid | AI-extractie |

## Grondslag (AVG art. 6)

- **Uitvoering overeenkomst** (art. 6.1.b) — gebruiker (tenant) verwerkt zakelijke
  leveranciersmail in het kader van zijn eigen administratie.
- **Gerechtvaardigd belang** (art. 6.1.f) — wij als verwerker leveren een tool
  die deze mail efficient verwerkt; verzender is een zakelijke leverancier (geen
  consument), dus impact op privacy is laag.

## Verwerker-rol

BBQ Architect treedt op als **verwerker** voor de tenant. Verwerkersovereenkomst
(per tenant, in algemene voorwaarden) regelt:

- Subverwerkers: Anthropic (vision-OCR, EU-region waar mogelijk), Supabase
  (Storage + DB, EU-region), Cloudflare (email-routing, EU-pop).
- Geen verkoop of secundair gebruik van data.
- Tenant kan op elk moment zijn data verwijderen; cascade verwijdert
  `org_email_inbox`, `org_email_attachments` en gerelateerde
  `org_price_mutations`.

## Retentie

| Data | TTL | Mechanisme |
|---|---|---|
| `org_email_inbox.body_excerpt` | 30 dagen | `purge_old_email_inbox_bodies()` cron |
| `org_email_attachments` (Storage + metadata) | 90 dagen | nightly cron (TODO) |
| `org_price_mutations` (status=approved) | onbeperkt — onderdeel boekhouding | n/a |
| `org_price_mutations` (status=dismissed) | 30 dagen | nightly cron (TODO) |

## Risico's en mitigaties

| Risico | Kans | Impact | Mitigatie |
|---|---|---|---|
| Spoofed afzender met poisoned prijslijst | Mid | Mid | SPF/DKIM-check in Worker; review-queue voorkomt directe write naar `supplier_prices` |
| Per ongeluk een privé-mail forwarden | Laag | Mid | Body-excerpt max 500 chars + 30d TTL; geen full-body opslag |
| AI extraheert PII uit mail-body | Laag | Mid | System-prompt wijst op "alleen prijslijst-data extraheren"; output Zod-gevalideerd; PII in output → niet geinsert in mutations-tabel |
| Datalek via lekkend `INTERNAL_PARSE_TOKEN` | Laag | Hoog | Token in env, niet in repo; rotated per quarter |
| Tenant ontvangt geadresseerde mail van andere tenant | Zeer laag | Hoog | UNIQUE-constraint op org-slug; per-org inbox-adres |

## Rechten van betrokkenen

- **Inzage (art. 15) / Verwijdering (art. 17):** verzender (leverancier) kan
  via `privacy@bbqarchitect.app` verzoeken om verwijdering. Cascade-delete
  via `from_email`-filter binnen 30 dagen.
- **AVG export (art. 20):** tenant kan eigen `org_email_inbox` exporteren via
  `/api/data-export` (bestaande endpoint — uitbreiden met deze tabel).

## Open issues (P1)

- [ ] Cron-job opzetten voor `purge_old_email_inbox_bodies()` (Vercel Cron)
- [ ] Cron-job voor 90d storage-TTL
- [ ] Subverwerkers-lijst publiceren op `/legal/processors`
- [ ] AVG-export uitbreiden met de drie nieuwe tabellen
- [ ] DPIA-review met Sam tekenen vóór GA-launch
