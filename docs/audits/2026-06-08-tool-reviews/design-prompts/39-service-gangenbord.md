# 39 — Service gangenbord (KDS) `/events/[id]/service`

**Type:** Tablet event-day service-bord — gangen-flow met kookkaart per gang + plattegrond-koppeling
**Source:** `src/app/events/[id]/service/page.tsx` (~1400 r, board/detail/wrap-up in één bestand)

## Wat het moet doen

Lars of Mathijs staat om 17:00 op locatie met 44 gasten en 3-6 gangen. Het bord toont in één oogopslag: wat doe ik NU, wat komt er STRAKS, en lig ik op schema. Eén tap op een gang opent de kookkaart: grote gerecht-foto + actieplan (componenten, stappen, hoeveelheden geschaald naar gastenaantal) + mise-checklist + per-tafel uitgifte met allergie/dieet-zones uit de plattegrond. Rook (AI-coach) fluistert één regel advies, geen schreeuwend paneel.

## Componenten
- Gangen-rail (chronologisch) + focus-kaart actieve gang — vervangt 4-koloms kanban
- Kookkaart fullscreen-sheet per gang (foto, actieplan, mise, per-tafel, kwaliteit)
- Mini-plattegrond strip (read-only, dieet-zones) → tap door naar plattegrond-tab
- Per-tafel grid met zone-label + allergie-flag per tafel
- Rook-coach als 1-regel directive-strip, uitklapbaar naar chat
- ServiceTabBar (Gangen ⇄ Plattegrond) — bestaat al, nu alleen op plattegrond-pagina

## Acceptance
1. ✅ Bij service-start geen lege kolommen/lege vlakken — bord is meteen gevuld en rustig
2. ✅ Elke gang toont echte gerecht-foto (`gerechten.foto_url`); emoji alléén als fallback
3. ✅ Gang-tap → kookkaart met actieplan in 1 tap (componenten + stappen, geschaald naar portions)
4. ✅ Glutenvrij/vega-zone uit plattegrond zichtbaar op tafel-grid ("T4 · glutenvrij")
5. ✅ Rook default ingeklapt tot één directive-regel; chat opt-in
6. ✅ Alle kleuren via theme-CSS-vars — werkt op alle 8 white-label presets
7. ✅ Touch-targets ≥56px (handschoenen), leesbaar op 3m afstand in avondlicht

## Bevindingen
- ✅ Courses worden al auto-aangemaakt uit `offerte.menu_selectie` bij acceptatie (acceptance-workflow stap 5) — titels + mise komen mee
- ❌ `courses.steps` blijft leeg ("Geen stappen voor deze gang"), plating-foto is placeholder, BRON-kolom toont "—"
- ❌ Slechts één `gerecht_id` per course (eerste match) — geen koppeling per gerecht, geen foto's op het bord
- ✅ Plattegrond bestaat al (`/events/[id]/service/plattegrond`, Konva, zones + guest-pins) maar is onvindbaar vanaf het bord (ServiceTabBar staat alleen óp de plattegrond-pagina)
- ❌ Per-tafel grid (1-6) kent de plattegrond-zones niet
- ⚠️ Huidig bord oogt druk: permanente uitleg-banner, 3 lege kolommen, dubbele Rook-berichten, emoji-art i.p.v. foto's

## Design-prompt

```
Bouw het event-day service-bord (KDS) voor catering-software BBQ Architect.

CONTEXT
Een pitmaster draait 's avonds een BBQ-event op locatie: 30-80 gasten,
3-6 gangen, tablet op het werkblad, soms handschoenen, avondlicht.
Hij heeft drie vragen: wat doe ik NU, wat komt STRAKS, lig ik op schema?
Dit is een professioneel werkinstrument — rustig, duidelijk, nul franje.
Geen kanban met lege kolommen, geen uitleg-banners, geen emoji-confetti.

STIJL & TOKENS (verplicht)
- Alle kleuren via CSS-variabelen: --bg, --card, --text, --primary
  (brand-amber), --accent, --secondary. Moet op 8 themes werken.
- Preview-thema "Smoke & Steel" (donker): bg #110c0a, card #221b18,
  text #f3f2ee, primary #e78a45, accent #5c8f9f, secondary #050302.
- Fonts: DM Sans (UI 14px), Outfit (display, gang-titels), IBM Plex Mono
  (tijden, hoeveelheden, counters — tabular-nums), Playfair Display
  italic (alleen event-naam, spaarzaam).
- Borders: hairline rgba(130,130,130,.15). Radii: 10/12/16px.
- Signatuur-motief: subtiele "ember glow" (24px inset aura in brand-kleur)
  alléén op de actieve gang-kaart — nergens anders.
- Motion: 150ms feedback, 300ms kaart-transities. Geen bounce.

LAYOUT — BORD (landscape tablet, 100vh, geen page-scroll)
- Topbar (56px): ← terug · event-naam + locatie + gasten ·
  voortgang "2/4 gangen" (mono) · servicetijd-klok (mono, groot) ·
  status-pill "Op schema" / "+8 min achter" (groen/amber).
- Rook directive-strip (40px, direct onder topbar): één regel laatste
  advies + ernst-kleur links als 3px rand. Tap = klapt chat-paneel uit
  (rechts, 380px overlay). Sluiten onthouden. Nooit twee berichten
  tegelijk zichtbaar.
- ServiceTabBar: "Gangen | Plattegrond" — zelfde component als op de
  plattegrond-pagina, nu óók hier.
- Hoofdvlak, 3 zones (geen kanban):
  LINKS (rail, 280px): alle gangen chronologisch als compacte rijen —
    nummer, gerecht-thumbnail (echte foto, 48px rond), titel,
    geplande tijd (mono), status-dot (grijs wachtend / amber bezig /
    groen klaar / vinkje geserveerd). Geserveerde gangen dimmen.
    Actieve gang gemarkeerd met brand-rand.
  CENTRUM (focus-kaart): de actieve gang groot —
    hero-foto van het gerecht (geen emoji; gradient-fallback alleen
    zonder foto), gang-titel (Outfit), gerechten-namen, portions +
    preptijd (mono), per-tafel grid (zie onder), één primaire actie
    onderaan full-width 64px: "Start bereiding" → "Markeer klaar" →
    "Uitgifte gestart" → "Geserveerd". Status bepaalt het label —
    één knop, nooit drie.
  RECHTS (smal, 240px): "Straks"-kaartje volgende gang (klein, foto +
    tijd + countdown "over 24 min") + mini-plattegrond (read-only
    thumbnail van de zaal met dieet-zones ingekleurd; tap → Plattegrond-
    tab). Daaronder rust: lege ruimte is oké.
- Is er nog geen actieve gang: focus-kaart toont gang 1 met "Start
  bereiding" als primaire actie — bord is nooit leeg.

PER-TAFEL GRID (in focus-kaart + kookkaart)
- Cellen per tafel: tafelnummer (mono), portie-count, statuskleur
  (vul-animatie grijs→amber→groen), allergie/dieet als icoon + rode
  rand (nooit alleen kleur), zone-label uit plattegrond als micro-tekst
  ("achterin · glutenvrij").
- Tap cel = popover: gasten van die tafel met allergieën (uit
  event_allergies), zone, knoppen "Klaar" / "Geserveerd" per tafel.

KOOKKAART (tap op gang in rail of focus-kaart → fullscreen sheet)
- Slide-up sheet over het bord (geen aparte route, ESC/swipe-down terug).
- Hero: gerecht-foto groot (40% hoogte), gang-titel, portions/preptijd/
  geserveerd-counters (mono), status-pill.
- Tabs (4, onderstreept, geen blokken): Actieplan · Mise en place ·
  Per tafel · Kwaliteit.
- ACTIEPLAN: per gerecht van deze gang een sectie — gerecht-naam +
  foto-thumb, daaronder de componenten (bijv. "Pulled pork", "Coleslaw")
  elk met afvinkbare stappen + hoeveelheden geschaald naar dit event
  ("8kg voor 44p", mono). Voortgangsbalk bovenaan loopt mee met
  afgevinkte stappen. Service-tip van het gerecht als quote-regel.
  Leeg? Dan één duidelijke CTA: "Actieplan genereren uit receptuur"
  (AI-voorstel, gebruiker bevestigt) — geen kale "geen stappen"-tekst.
- MISE EN PLACE: checklist met hoeveelheid (mono) + BRON (voorraad-
  locatie of leverancier); afgevinkt = doorgestreept. Kritieke items
  (nog niet klaar + gang start <15 min) bovenaan met amber accent.
- PER TAFEL: zelfde grid als bord, groter, met gasten-popover.
- KWALITEIT: checklist + "Vraag Rook om laatste check" (bestaande
  chef-coach call) — antwoord verschijnt inline, niet als toast.

PLATTEGROND-KOPPELING
- Zones uit floor_plans/service_zones (bijv. "glutenvrij", "vega",
  "VIP") kleuren de mini-plattegrond en leveren het zone-label per
  tafel in alle tafel-grids.
- Geen plattegrond getekend? Mini-kaart toont rustige empty-state
  "Plattegrond intekenen" → /events/[id]/service/plattegrond.

GEEN UITLEG-BANNER
- De "Zo werkt het bord"-banner vervalt. Eerste gebruik: 3 korte
  coach-marks (eenmalig, dismissable). Daarna een klein "?"-icoon
  in de topbar.

MOBIEL (portrait, telefoon)
- Rail wordt horizontale strip bovenaan, focus-kaart full-width,
  kookkaart full-screen. Zelfde één-knop-flow. Rook alleen als strip.

WRAP-UP (bestaande view, alleen re-skin)
- Zelfde tokens/typografie; checklist + feedback-veld + PDF-knop.

ACCESSIBILITY
- Touch ≥56px, primaire actie 64px. Contrast WCAG AA op alle themes.
- Status nooit alleen kleur: dot + label/icoon.
- Klok en counters in tabular-nums zodat niets verspringt.

HARD RULES
- Echte gerecht-foto's uit gerechten.foto_url; emoji alleen fallback.
- AI (Rook, actieplan-generator) stelt voor — gebruiker bevestigt.
- Allergie-info: icoon + label + rode rand, nooit alleen kleur.
- Moet werken met 3 én met 7 gangen zonder layout-breuk.
- Eén primaire actie per gang tegelijk; statusflow Wachtend → Bezig →
  Klaar → Geserveerd blijft de onderliggende logica.
- Geen hardcoded kleuren — alles via de 6 theme-vars.

CONNECTS TO
- courses (status-flow, steps/mise/plating/quality_checks JSONB,
  items per tafel, gerecht_id + nieuw gerecht_ids[])
- gerechten (foto_url, bereidingswijze, service_tip, porties)
- components + gerecht_components (preparation_steps, ingredients —
  bron van het actieplan, geschaald naar event-portions)
- event_allergies (per-tafel allergie-flags, severity)
- floor_plans + service_zones (mini-kaart + zone-labels per tafel)
- POST /api/chef-coach (Rook directives + kwaliteit-check, Haiku)
- POST /api/recipe-generate (actieplan-voorstel als steps leeg zijn)
- src/lib/serviceState.ts (status-persistentie)
- /events/[id]/service/plattegrond (ServiceTabBar-zuster-tab)
```
