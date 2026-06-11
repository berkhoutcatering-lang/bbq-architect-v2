# 04 — Offerte-detail `/offertes/[id]/view`

**Type:** Operator-facing read-only offerte-overzicht
**Huidige route:** `/offertes/37/view` (test-offerte APK-TEST-001)
**Source-bestand:** `src/app/offertes/[id]/view/page.tsx`

---

## Wat het moet doen

Sam klikt vanaf de offertes-lijst op een specifieke offerte en ziet **alle informatie in één oogopslag** met directe acties: preview (publieke link openen), menukaart-editor, PDF-download, bewerken, dupliceren, nieuwe versie. Plus **klikbare relatie-pills** naar gekoppeld event + klant + factuur — de cohesie-glue van het hele ecosysteem.

Deze pagina is de **navigatie-hub voor één-deal-workflow**: vanaf hier verspringt Sam tussen klant-context, event-planning en factuur-status zonder ooit de offerte-context te verliezen.

## Componenten gebruikt

- **Breadcrumb** met active-resource-context ("[APK-TEST] Testklant BV")
- **Status-pill** (concept/verzonden/geaccepteerd/afgewezen/verlopen) met semantic kleur
- **Action-bar** met 4-5 primaire knoppen (Preview / Menukaart / PDF / Bewerken)
- **RelatedEntityPills** uit `src/components/RelatedEntityPills.tsx` (al gebouwd, gebruikt `getRelatedEntities`)
- **Items-tabel** (TanStack Table v8) met line-items + BTW-splits
- **Totaal-blok** rechts met subtotaal + BTW + totaal + marge
- **Activity-timeline** onderaan (created/sent/accepted timestamps)

## State machine

```
loading       → skeleton (3 cards placeholder)
loaded-data   → volledige read-only weergave
edit-mode     → klik "Bewerken" → redirect naar /offertes?id=X (wizard re-open)
preview-open  → klik "Preview" → nieuw tab /q/[token]
pdf-loading   → klik "PDF" → server-render PDF (5-8s) → download
duplicating   → "Dupliceer" → server-action createDuplicate → redirect naar nieuw concept
new-version   → "Nieuwe versie" → bewaar huidige als v1, maak v2 als concept
error         → toast "Kon offerte niet laden" + retry
not-found     → 404 als id ongeldig of niet binnen eigen org
```

## Interaction-patterns

- **Klik klant-pill** → drawer met klant-historie (events, offertes, facturen)
- **Klik event-pill** → `/events/[id]/hub` met breadcrumb-context behouden
- **Klik factuur-pill** → `/facturen?focus=[id]`
- **Preview-knop** opent `/q/[token]` in nieuw tab (`target="_blank"`)
- **Menukaart-knop** → `/offertes/[id]/menukaart-editor` (route-deep, eigen editor-UI)
- **Status-flip** via dropdown op pill (concept → verzonden → geaccepteerd) met confirm-dialog bij geaccepteerd (triggert acceptance-workflow)
- **"Copy link"-icoon** naast preview-knop voor delen-via-WhatsApp

## Acceptance criteria

1. ✅ RelatedEntityPills tonen alle gekoppelde entiteiten (klant / event / factuur) — werkt ✅
2. ✅ Breadcrumb toont klant-naam, niet alleen offerte-nummer (warmer)
3. ✅ Status-flip naar "geaccepteerd" triggert `runAcceptanceWorkflow` (event+factuur+prep+inkoop)
4. ✅ PDF-download <8s p95, met progress-indicator
5. ✅ "Nieuwe versie"-knop bewaart huidige als read-only revision, opent nieuwe concept-draft
6. ✅ Mobile 375px → action-bar collapsed in dropdown ("...") want 4 knoppen passen niet
7. ✅ Print-stylesheet — Sam print soms voor klant-meeting (oud-school)

## Bevindingen huidige versie

### Bugs
- (Geen kritieke gevonden in deze tool — RelatedEntityPills werken correct na APK-fix #1)

### UX-gaps
- **Geen "Verzend per mail"-knop** prominent — staat in /mailbox maar Sam moet 3 klikken om mail te sturen vanuit offerte-context
- **Geen revisie-historie** — als Sam offerte 3× aangepast heeft, geen view "wat veranderde ik op v2 vs v1"
- **Geen klant-reactie-track** — als klant via /q/[token] een vraag stelt (toekomstige feature), waar landt die?
- **"Geldig tot"-datum niet zichtbaar** in screenshot — countdown "Verloopt over 12 dagen" zou nuttig zijn
- **Saldo + betaal-status** niet hier zichtbaar — moet via factuur-pill klikken
- **Marge-info verstopt** — €654 totaal zichtbaar, marge in % en € absoluut zou prominent moeten zijn

### Visual
- **Action-bar 4 knoppen** is OK maar "Bewerken" als primary kleur (oranje) is goed; PDF/Menukaart/Preview zijn ghost-style — duidelijk hierarchy
- **"GEKOPPELD"-label** boven pills is goed voor scanbaarheid
- **Status-pill "CONCEPT"** kleine oranje pill — leesbaar maar zou meer aandacht kunnen trekken op een verzonden offerte (groen+huis-icoon "Klant heeft geopend" feature toekomst)
- **Breadcrumb "[APK-TEST] Testklant BV"** wordt lang met echte klanten — truncate met ellipsis op smal scherm
- **"Dupliceer" + "Nieuwe versie"** zijn 2 vergelijkbare features — naming-uitleg tooltip nuttig (dupliceer = nieuwe-offerte-zelfde-data, nieuwe-versie = revisie-binnen-deze-offerte)

### Cohesie
- ✅ RelatedEntityPills naar event + klant werken (na APK fix #1 lead.offerte_id writeback)
- ✅ Status-flip naar geaccepteerd triggert acceptance-workflow correct
- ❌ **Geen "ga naar /q/[token] preview-modus"** — Sam wil zien hoe klant het ziet, knop bestaat maar opent in nieuw tab; ingebouwde preview-modal zou sneller zijn
- ❌ **Geen lead-bron-pill** — als deze offerte uit lead is gemaakt, zou pill "←Lead #5 [APK-TEST] Test Lead" handig zijn voor history-context
- ⚠️ **Activity-timeline ontbreekt** — wanneer verzonden? wanneer accepteer-link geopend? wanneer betaald?

## Design-prompt voor externe builder

```
Bouw een offerte-detail-view voor catering-software BBQ Architect.

CONTEXT
Sam (cateraar, desktop+tablet) heeft net een offerte gemaakt of opent een
bestaande. Deze pagina is zijn workflow-hub: alle info, alle acties,
klikbare ecosystem-pills naar gekoppeld event/klant/factuur. Read-only +
quick-actions (geen editen hier — daarvoor terug naar wizard).

LAYOUT
- Breadcrumb: Verkoop > Offertes > {klant.naam} (ellipsis bij >40 chars)
- Header-row:
  - "← Terug naar offertes" link links
  - 4 action-buttons rechts: Preview (eye icon) / Menukaart / PDF / Bewerken (primary)
- Hero-section:
  - OFFERTE · {nummer} label
  - H1: klant.naam
  - Status-pill (concept/verzonden/geaccepteerd/afgewezen/verlopen) met dropdown om te flippen
  - Sub-info: "{gasten} gasten · {event_datum} · Geldig tot {verloop} ({days_left})"
- RelatedEntityPills row:
  - "GEKOPPELD" eyebrow
  - Pill per: Event / Klant / Factuur / Lead (als bron)
  - Klik pill → navigate naar entity-detail
- Body 2-koloms grid:
  - LEFT: Items-tabel (gerechten + qty + prijs + BTW-split) + custom-regels (transport, crew)
  - RIGHT: 
    - Totaal-blok (subtotaal / BTW 9% / BTW 21% / totaal)
    - Marge-blok (kostprijs / marge € + %)
    - Saldo-blok (betaald / openstaand / vervaldag)
- Action-bar bottom:
  - Dupliceer | Nieuwe versie | Verzend per mail | Archiveer
- Activity-timeline footer:
  - Created {date} door {user}
  - Sent {date}
  - Geopend door klant {date} (toekomst: tracking-pixel in /q/[token])
  - Geaccepteerd {date}
  - Betaald {date}

KEY FEATURES
- RelatedEntityPills hergebruik src/components/RelatedEntityPills.tsx (al gebouwd)
- Status-flip dropdown triggert acceptance-workflow bij "geaccepteerd"
- PDF-export via react-pdf met branded layout (settings.brand_theme)
- "Verzend per mail" → modal met Resend template-picker + preview
- Print-stylesheet: hide nav, full-width, brand-colors

COMPONENTS
- shadcn/ui Breadcrumb, Button, Badge, DropdownMenu, Tabs
- TanStack Table v8 voor items-tabel
- react-pdf voor PDF-generatie
- vaul voor right-drawer (klant-historie bij pill-click)

ACCESSIBILITY
- Action-bar: aria-label per knop
- Status-pill dropdown: aria-haspopup="menu"
- Pills: aria-label "Gekoppeld event: [APK-TEST] Event Golden Flow, bevestigd"
- Tabel: caption + scope op th

MOBILE (375-414px)
- Action-bar collapsed in "..." dropdown
- 2-koloms grid → 1-kolom stack
- Items-tabel → cards-list
- Activity-timeline accordion

OUT OF SCOPE
- Geen edit-in-place (alles via wizard re-open)
- Geen real-time tracking (Klant geopend? komt later)
- Geen e-sign flow hier (zit in /q/[token])

CONNECTS TO
- /q/[token] = publieke preview (Preview-knop)
- /offertes/[id]/menukaart-editor = menu-customization
- /events/[id]/hub = klik event-pill
- /klanten/[id] = klik klant-pill (drawer of nieuwe page)
- /facturen?focus={id} = klik factuur-pill
- Server action: updateOfferteStatus, duplicateOfferte, createNewVersion
```

## Files te wijzigen

- `src/app/offertes/[id]/view/page.tsx` (UI rewrite — meer aandacht voor activity-timeline + marge-prominent)
- `src/components/RelatedEntityPills.tsx` (uitbreiden met lead-pill als offerte.lead_id ≠ null)
- `src/components/StatusPillDropdown.tsx` (nieuw — extract status-flip-logic)
- `src/lib/acceptance-workflow.ts` (geen wijziging)
