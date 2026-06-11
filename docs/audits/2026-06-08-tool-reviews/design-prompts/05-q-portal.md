# 05 — Publiek offerte-portal `/q/[token]`

**Type:** Klant-facing white-label single-page portal
**Huidige route:** `/q/c4ea40e1-6d52-4811-bf49-ee1359cdb8f7` (test-token)
**Source-bestand:** `src/app/q/[id]/page.tsx`

---

## Wat het moet doen

De **enige interactie** die de klant ooit heeft met BBQ Architect. Klant ontvangt een whatsapp/email "hier is je offerte" → opent deze pagina → ziet **professional themed offerte** met sfeerbeeld, menu, prijs → klikt "Bevestig & betaal" → iDEAL-betaling van de aanbetaling → datum staat vast.

Dit is de **hoogste-stakes UI in het hele product**. Als deze pagina niet vertrouwen wekt verliest Sam een deal van €500-€3000. Mag NOOIT voelen als een SaaS-formulier — moet voelen als persoonlijke pitch.

## Componenten gebruikt

- **Pure CSS** (`q.css`) — geen framework, snelheid prio
- **Theme cascade** via `themeStyleVars()` uit `@/lib/portalThemes` — 8 OKLCH-presets
- **Sticky footer** met aanbetaling + CTA
- **Mollie iDEAL widget** voor betaling
- **react-pdf** voor offerte-PDF download
- **e-Sign** via canvas/signature-pad voor "Bevestig zonder betalen" path

## State machine (CRITISCH — meerdere views)

```
not-found        → token bestaat niet of expired → "Offerte niet gevonden, neem contact op met {cateraar}"
loading          → skeleton (1.5s)
concept          → offerte is nog niet verzonden (zou niet zichtbaar moeten zijn — redirect naar 404)
verzonden        → "Bevestig & betaal" CTA actief; "Vraag aanpassing" alternatief
geaccepteerd     → "Al geaccepteerd" view + "Bekijk bevestiging"
betaald          → "Betaald + bevestigd" + factuur-link + countdown naar event-datum
afgewezen        → "Offerte ingetrokken — neem contact op"
verlopen         → "Offerte verlopen op {datum} — vraag verlenging"
paying-loading   → klik "Bevestig & betaal" → Mollie iframe loading
paid-redirect    → Mollie redirect terug → bevestigings-scherm
question-mode    → klik "Vraag aanpassing" → message-form → submit naar cateraar mailbox
```

## Interaction-patterns

- **Klik "Bevestig & betaal"** → Mollie iDEAL widget overlay → bank-selectie → betaal-redirect
- **Klik "Vraag aanpassing"** → simple message-form (max 500 chars) → POST `/api/q/[token]/message` → email naar cateraar
- **Scroll** toont sfeerbeeld → klant-info → datum/gasten/locatie → menu (gangen) → totaal + BTW → fine-print
- **Mobile-first** — meeste klanten openen op telefoon vanaf whatsapp-link
- **Zonder JS** — minstens info-only view werkt (SSR)

## Acceptance criteria

1. ✅ Theming cascadet correct uit `settings.brand_theme` — geen handmatige CSS-overrides
2. ✅ State-aware view (geaccepteerd → andere UI dan verzonden) ✅ werkt
3. ✅ Aanbetaling-bedrag pre-calculated server-side (geen client-trust)
4. ✅ Mollie webhook idempotent via `processed_mollie_events` UNIQUE constraint ✅
5. ✅ Rate-limit 20 req/min/IP op `/api/public-offerte/[token]` ✅
6. ✅ "Vraag aanpassing" feature werkt (bevestigd in screenshot — was false alarm in v1 audit)
7. ✅ Mobile 375px → sticky CTA-footer altijd zichtbaar tijdens scroll
8. ✅ Print/PDF-versie consistent met scherm

## Bevindingen huidige versie

### Bugs
- Geen kritieke gevonden — portal is robuust, white-label-cascade werkt, state-machine correct

### UX-gaps
- **"Tijd —" en "Locatie —"** tonen mute placeholder in screenshot — als die data ontbreekt zou je deze velden moeten **verbergen** ipv leeg tonen (oogt als bug)
- **"BBQ-feest · sfeerfoto van Hop & Bites"** eyebrow is nice maar kan sfeerbeeld zelf prominenter (hero-image breed ipv padded)
- **Geen "Geldig tot {datum}"-countdown** zichtbaar — urgentie ontbreekt
- **Geen "menu-preview-collapsed"** — klant moet scrollen om menu te zien; expand-from-summary zou eleganter zijn
- **Geen agenda-toevoeg-knop** ("Add to Google Calendar / iCal / Outlook") na bevestiging
- **Aanbetaling €217,80** — geen uitleg waarom precies dat bedrag (33% van totaal?). Tooltip "= 33% van totaal" zou vertrouwen wekken
- **Geen "Stuur bevestiging per email"** opt-in checkbox — klant wil bewijs in inbox

### Visual
- **Logo + bedrijfsnaam top-left** klein — sommige tenants willen logo prominent (cap-toggle in settings?)
- **Sfeerbeeld op desktop** vult breedte goed; **op mobile** wordt het te smal — zou full-bleed moeten zijn
- **Datum-card** "wo 8 juli 2026" — voor klant zou "Volgende week vrijdag" extra warm zijn (relative formatting)
- **Footer CTA** "Bevestig & betaal" met edit-icon is duidelijk; **"Vraag aanpassing"** is secundair-style, perfect
- **Geen testimonial-strip** — sommige cateraars willen "Wat klanten zeggen" tonen (Sam koos bewust niet voor verzonnen reviews — goed)

### Cohesie
- ✅ White-label theming cascadet vanuit `settings.brand_theme` perfect — Hop & Bites warm-brown is consistent
- ✅ State-aware UI ✅ werkt (al-geaccepteerd toont juist andere view)
- ✅ Mollie idempotency + UUID-token + rate-limit allemaal correct
- ❌ **Geen "powered by BBQ Architect"** footer (zoals op /arrangement/[slug] wel staat) — branding-eerlijkheid wel waardevol
- ❌ **Geen tracking pixel** of analytics (privacy-eerlijk maar Sam weet niet of klant pagina opende)
- ❌ **Bij geaccepteerd: geen klant-facing event-prep-tracker** ("Je BBQ is over 12 dagen, hier is wat we doen")

## Design-prompt voor externe builder

```
Bouw een klant-facing offerte-portal voor catering-software BBQ Architect.

CONTEXT
Hoogst-belangrijke UI in het product. Klant van cateraar (Hop & Bites e.a.)
opent via /q/[token]-link vanuit WhatsApp of email. Moet vertrouwen wekken
binnen 5 seconden. Wit-label per tenant (geen "BBQ Architect" branding 
zichtbaar — alleen subtle "powered by" in footer).

LAYOUT (mobile-first, 375-1024px)
1. HERO
   - Sfeerbeeld full-bleed top (16:9 op desktop, 4:5 op mobile)
   - Eyebrow: "BBQ-FEEST · SFEERFOTO VAN [CATERAAR]"
   - Tenant-logo + naam top-left chip
   - H1: "Offerte voor [klant.naam]"
   - Geldig tot {datum} ({days_left} dagen) — urgentie-pill
   
2. INFO-CARDS (2x2 grid → 1x4 mobile)
   - Datum: "wo 8 juli 2026" (+ relatief "over 4 weken")
   - Tijd: "17:00 - 22:00" (hide als leeg, niet "—" tonen)
   - Locatie: "{adres}" (hide als leeg, niet "—")
   - Gasten: "40 personen (waarvan 2 vegetarisch)"
   
3. MENU PREVIEW (gangen-grouped)
   - Section per gang (Voorgerecht / Hoofd / Dessert)
   - Per gerecht: foto-thumbnail + naam + korte omschrijving + allergens-icons
   - Geen prijs-per-gerecht (alleen totaal) — voorkomt onderhandel-druk
   
4. PRIJS-SAMENVATTING
   - Subtotaal eten + drank
   - BTW-splits (9% catering / 21% alcohol)
   - "Vaste kosten" (transport + crew + materieel)
   - TOTAAL groot prominent
   - Aanbetaling: "{bedrag} = {percentage}% van totaal nu, rest na event"
   
5. PERSOONLIJK BERICHT (uit offerte)
   - "Beste {klant.naam}, ..." (BlockNote rendered)
   - Footer: "{cateraar.naam}, {cateraar.functie}"
   
6. PROCES-OVERVIEW ("Wat gebeurt er na bevestiging?")
   - Stap 1: Aanbetaling via iDEAL (vandaag)
   - Stap 2: Wij prep'en de week ervoor
   - Stap 3: We bouwen op + serveren op locatie
   - Stap 4: Eind-factuur 7 dagen na event
   
7. STICKY FOOTER (altijd zichtbaar tijdens scroll)
   - Links: "Aanbetaling nu €{bedrag}"
   - Centraal: PRIMARY "Bevestig & betaal" → Mollie iDEAL
   - Secondary: "Vraag aanpassing" → message-form
   - Tertiary mini-link: "Stuur ons een vraag" → email-thread

STATE VARIANTEN
- concept → niet tonen (404 redirect — concepten zijn intern)
- verzonden → bovenstaande flow
- geaccepteerd → "Al geaccepteerd op {datum}" + countdown naar event + "Toon bevestiging" PDF
- betaald → "Bevestigd + betaald" + factuur-PDF + agenda-toevoeg-knoppen
- afgewezen → "Offerte ingetrokken — neem contact op met {tenant}"
- verlopen → "Offerte verlopen op {datum}. Wil je een nieuwe ontvangen?" + button

THEMING (cascadet uit settings.brand_theme)
- 5 OKLCH-tokens: --brand-1, --brand-2, --surface, --text, --shadow
- 8 voorgedefinieerde presets (warm-brown, cool-blue, forest-green, charcoal, etc.)
- Tenant kan custom theme aanmaken in /instellingen

INTERACTIONS
- Mollie iDEAL widget overlay bij "Bevestig & betaal"
- "Vraag aanpassing" → modal met message-form (max 500 chars)
- e-Sign optie als alternatief voor iDEAL (bij B2B-klant)
- "Stuur bevestiging per email" checkbox (default checked)
- Mobile: pinch-zoom op menu-foto's

ACCESSIBILITY
- Sticky footer: aria-label "Bevestig en betaal aanbetaling van €217,80"
- Status-aware aria-live: "Betaling wordt verwerkt..."
- Color-contrast WCAG 2.1 AA voor alle themes (geverifieerd via APCA)
- Touch-targets ≥44px in footer

MOBILE (primair gebruik)
- Hero 4:5 aspect
- Cards stack 1-koloms
- Sticky CTA altijd zichtbaar (geen overlap met menu)
- Bottom-sheet voor Mollie-betaling (ipv overlay)

OUT OF SCOPE
- Geen tracking pixels (privacy-first)
- Geen "powered by"-popup (subtle footer-tekst alleen)
- Geen multi-user (single klant-perspectief)
- Geen chat-widget (vraag-aanpassing volstaat)
- Geen account-aanmaken (anonymous flow)

HARD-RULES
- BTW-splits SERVER-SIDE uit BTW_RULES_2026 (NOOIT client-rekenen)
- Mollie webhook idempotent (processed_mollie_events UNIQUE)
- Public_token = UUID v4 (122 bits entropie) — geen sequential ID
- Rate-limit 20 req/min/IP op /api/public-offerte/[token]
- Geen klant-data in URL-params (alleen token)

CONNECTS TO
- GET /api/public-offerte/[token] = offerte-data + settings (service-role)
- POST /api/q/[token]/message = vraag-aanpassing handler
- POST /api/payments/mollie = create payment + redirect
- POST /api/payments/mollie/webhook = idempotent payment-confirm
- runAcceptanceWorkflow bij status=geaccepteerd
```

## Files te wijzigen

- `src/app/q/[id]/page.tsx` (UI rewrite met meer hero-impact + relative-date-formatting)
- `src/app/q/[id]/_components/Portal.tsx` (alle state-views — verzonden/geaccepteerd/betaald/verlopen)
- `src/app/q/[id]/q.css` (theme-cascade behouden + mobile-first refactor)
- `src/app/api/public-offerte/[token]/route.ts` (geen wijziging — server stabiel)
- `src/app/api/q/[token]/message/route.ts` (toevoegen als nog niet bestaat — voor "Vraag aanpassing")
