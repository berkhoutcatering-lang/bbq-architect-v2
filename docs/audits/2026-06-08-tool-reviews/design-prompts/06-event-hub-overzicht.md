# 06 — Event-hub Overzicht-tab `/events/[id]/hub`

**Type:** Operator-facing event-command-center (1 van 7 sub-tabs)
**Huidige route:** `/events/17/hub`
**Source-bestand:** `src/app/events/[id]/hub/page.tsx` (~1300 regels)

---

## Wat het moet doen

Een event is bevestigd. Sam komt hier vanaf /agenda of vanaf een event-pill op offerte-detail. Het Overzicht-tab is de **operationele command-center**: alle relevante info in 1 oogopslag (gasten, omzet, marge, prep-ready %, saldo), gekoppelde documenten (offerte, factuur, prep-lijst, laadlijst, HACCP-pakket), en quick-actions (start event-modus, start service, bewerken, in agenda, vraag Pitmaster, rit toevoegen, deel).

Plus: **7 sub-tabs binnen event-context** (Overzicht / Klantgesprek / Prep / HACCP / Logistiek / Service / Reflectie) zodat alles rond dit event 1-klik weg is.

## Componenten gebruikt

- **7-tab nav** binnen event-context (tabs visible on alle event-sub-pages)
- **Hero met countdown-circle** (cirkel om "12 dagen" met progress-strikes)
- **KPI-strip** (5 stats: gasten/omzet/marge/prep-ready/saldo)
- **Documenten-card** met 4-6 sub-cards (offerte/factuur/prep/laadlijst/HACCP/menukaart)
- **Voorbereiding-tracker** (5 mijlpalen: Hout bestellen / Pekelen / Rub aanbrengen / Smoken / Service)
- **AI quick-prompts** ("Briefing voor offerte X", "Bevestig met klant X", "Hoe staat marge?", etc.)
- **Action-row** met 4-6 primary CTAs

## State machine

```
loading            → skeleton voor alle cards
loaded-confirmed   → standaard view, alle data zichtbaar
loaded-completed   → toon reflectie-CTA + factuur "klaar om te versturen" (APK-fix #7)
loaded-archived    → read-only view, geen action-buttons
loading-failed     → "Event niet geladen" + retry (BUT FIX: errors-boundary tot toUpperCase) — APK-bug #45
partial-data       → graceful degradation: één query faalt, andere cards renderen door (Promise.allSettled)
```

## Interaction-patterns

- **Klik 7 sub-tabs** → switch zonder volledige page-reload (transitions via Next router)
- **Klik documenten-card** → respective detail (offerte/factuur/prep-lijst download)
- **Klik prep-stappen-mijlpaal** → mark-done met optimistic UI
- **Klik AI-prompt** → opens Vraag-Rook ChatPanel met pre-filled query
- **"Start event op locatie"** → redirect naar `/events/[id]/field` (mobile-mode)
- **"Start Service (KDS)"** → redirect naar `/events/[id]/service`
- **"In agenda"** → `/agenda?event=[id]&focus=1`

## Acceptance criteria

1. ✅ Promise.allSettled — 1 query faalt = andere cards rendereren door (bewezen op event #17)
2. ❌ **CRASH op missing date** — line 568 `moNamesShort[evDate.getMonth()].toUpperCase()` faalt bij Invalid Date (APK-bug #45)
3. ✅ Prep-ready widget toont X/Y taken + percentage (na APK-fix #8 false-alarm bevestiging)
4. ✅ service_logs UUID-mismatch stub voorkomt console-spam (APK-fix #27)
5. ⚠️ Factuur-card subtitle toont "✨ Klaar om te versturen" als status='concept' + reflectie aanwezig (APK-fix #7)
6. ✅ 7 sub-tabs render correct (zichtbaar in screenshot)
7. ❌ **Geen error-boundary rondom event-data render** — single crash = volle page error

## Bevindingen huidige versie

### Bugs
- **P1 #45**: line 568 toUpperCase op undefined als event.date Invalid Date wordt — fix nodig
- **Geen error-boundary** rondom main render — 1 ondersteboven veld crasht de hele page

### UX-gaps
- **AI-prompts in hero** ("Briefing voor offerte X") zijn nice maar **niet contextueel** — toont voor ELK event dezelfde 4-5 prompts; zou per event-status/tijd-tot-event andere moeten zijn
- **Voorbereiding-tracker** toont stappen "Hout bestellen / Pekelen / Smoken" — generic BBQ-flow, niet aanpasbaar per event-type (festival vs bruiloft hebben andere flow)
- **Countdown-circle** is mooi maar zou bij <3 dagen prominenter moeten zijn (animation + waarschuwing)
- **Geen "Dagen geleden" voor afgelopen events** — Hopp event was 22 april (langs gegaan), wordt nu nog steeds als "huidig" gepresenteerd
- **Geen klant-contact-info** prominent — Sam moet door naar /klanten/[id] voor telefoonnummer
- **Geen weather-forecast** voor event-dag (outdoor BBQ context)

### Visual
- **Hero typografie** is goed (grote H1 "Hopp", BEVESTIGD pill)
- **7-tab nav** is duidelijk maar wordt smal op tablet — "Klantgesprek/HACCP/Logistiek" tekst-truncate-issue
- **EV-0017** event-nummer is een toevoeging die ik niet eerder zag — naast OFFERTE: HOPP duidelijke unique-key
- **"dddd · Zakelijk"** info wordt door comma's gescheiden — onduidelijk wat is locatie vs type
- **AI-prompt-cards** in hero zijn goed maar krijgen weinig visuele hierarchy — 8 cards × 2 kolommen wordt rommelig
- **Documenten-grid** is goed maar **status-onduidelijk** — factuur "concept" pill is klein, "klaar te versturen" CTA na APK-fix #7 prominenter

### Cohesie
- ✅ RelatedEntityPills werken (offerte/factuur/klant)
- ✅ acceptance-workflow auto-create event+factuur+prep+inkoop (zichtbaar)
- ✅ Service→Factuur CTA na completed (APK-fix #7 verified in code)
- ❌ **Geen lead-bron-pill** (als event uit lead → offerte → event chain)
- ❌ **Geen menu-preview** in Overzicht-tab — moet naar Klantgesprek-tab voor menu-context
- ❌ **Geen mailbox-thread-link** als klant via /q/[token] vraag stelde

## Design-prompt voor externe builder

```
Bouw een event-command-center voor catering-software BBQ Architect.

CONTEXT
Sam (cateraar) heeft een event bevestigd. Deze pagina is zijn werkruimte
totdat het event over is. Doel: alle relevante info en acties in 1 view
zodat hij niet hoeft te switchen tussen 5 schermen. 7 sub-tabs binnen
event-context — alle event-data is hier dichtbij.

LAYOUT
- Breadcrumb: Plannen > Events > {event.name}
- "← Terug naar events"-link
- Event-header: "EVENT · EV-{id}" + H1 event-name
- 7-tab nav: Overzicht (default) | Klantgesprek | Prep | HACCP | Logistiek | Service | Reflectie
- OVERZICHT-CONTENT:

HERO-SECTION (countdown + info)
- Links: countdown-circle "X dagen" (rood <3, geel <7, groen >7)
  - Bij afgelopen event: "X dagen geleden — Reflectie?"
- Rechts: event-essentials
  - Status-pill (Bevestigd / Optie / Afgerond / Geannuleerd)
  - {gasten} gasten · {datum} · {locatie} · {type}
  - Hero-actie-row: "Start event op locatie" | "Start service" | "Bewerken"
  - Secondary: "In agenda" | "Vraag Pitmaster" | "Rit toevoegen" | "Deel"
- Onder: AI quick-prompts (4 cards, contextueel naar event-fase)
  - Bij 14d weg: "Briefing voor klant" / "Meelijst genereren"
  - Bij 2d weg: "Prep-planning samenvatten" / "Crew-bevestiging mailen"
  - Bij dag-erna: "Reflectie schrijven" / "Factuur klaarzetten"

KPI-STRIP (5 stats inline)
- Gasten (40)
- Omzet (€1.400) + percentage van offerte-totaal als progress
- Marge (€450 / 32%) — kleur-coded
- Prep-ready (12/15 = 80%) — kleur-coded
- Saldo (€217 open / €1.183 betaald) — link naar factuur

DOCUMENTEN-GRID (4-6 cards)
- Offerte: nummer + status + Preview/PDF/Bewerken
- Factuur: nummer + status (CTA "✨ Klaar om te versturen" bij completed+reflectie)
- Prep-lijst: {N taken} + Download
- Laadlijst: Ingredients + crew + tijden + Download
- HACCP-pakket: Records + audit + Download
- Menukaart: Print 1× / PDF / Voorvertoning

VOORBEREIDING-TRACKER (5 mijlpalen — aanpasbaar per event-type)
- Hout bestellen (D-14)
- Pekelen (D-3)
- Rub aanbrengen (D-2)
- Smoken (D-1)
- Service (D-day)
- Per stap: ✓ done / actieve / upcoming + manual check-off

NAVIGATION
- Sub-tabs onthouden state (URL ?tab=overzicht)
- Cross-event: "← Terug naar events" of pijl-toets-shortcut

COMPONENTS
- shadcn/ui Tabs, Card, Badge, Button, DropdownMenu
- Custom countdown-circle (SVG)
- AI-prompts: Vraag-Rook ChatPanel met prefill
- Documenten-card: clickable + download

ERROR HANDLING (CRITICAL — APK-bug #45)
- Wrap main-render in <ErrorBoundary> die toont "Kon dit event niet laden"
- Date-parsing guard: `Number.isNaN(evDate.getTime()) ? 'Ongeldige datum' : ...`
- Promise.allSettled houdt cards renderen zelfs als 1 query faalt (al gebouwd)

ACCESSIBILITY
- Sub-tabs: role="tablist", aria-current="page"
- Countdown: aria-label "Nog 12 dagen tot event op {datum}"
- KPI-strip: gestructureerde aria-labels per stat
- Action-row: aria-label per knop

MOBILE
- 7-tab nav → horizontal scroll
- Documenten-grid → 1-koloms
- AI-prompts → 1-koloms
- Hero countdown-circle smaller (140×140)

OUT OF SCOPE
- Geen real-time multi-user-edit (single-author voor v1)
- Geen offline-mode (zie /events/[id]/field voor field-mode)
- Geen Stripe-betaling-flow hier (zit in /facturen)

CONNECTS TO
- 6 andere sub-tabs (Klantgesprek/Prep/HACCP/Logistiek/Service/Reflectie)
- /agenda?event={id} = "In agenda"
- /events/{id}/field = "Start event op locatie"
- /events/{id}/service = "Start service"
- /offertes/{id}/view = offerte-link
- /facturen?focus={id} = factuur-link
- /api/today-briefing = AI-prompts contextueel
```

## Files te wijzigen

- `src/app/events/[id]/hub/page.tsx` (UI rewrite — splits componenten + fix #45 + error-boundary)
- `src/app/events/[id]/hub/_components/` (nieuw — extract Hero, Documenten, Voorbereiding, KPIStrip)
- `src/app/events/[id]/hub/error.tsx` (nieuw — error-boundary met "Probeer opnieuw")
