# 03 — Offerte-wizard `/offertes?wizard=true`

**Type:** Multi-step AI-assisted form (modal)
**Huidige route:** `/offertes?wizard=true` (modal-overlay op offertes-lijst)
**Source-bestand:** `src/app/offertes/page.tsx` (groot, 1300+ regels)

---

## Wat het moet doen

De **eerste interactie** waarvan onbekende cateraar onthoudt "deze app snapt me". Sam typt naam + datum + gasten + gangen, klikt "Genereer", en binnen 8-12s heeft Claude Sonnet 4.6 een menu opgesteld uit Sam's eigen 14 gerechten (Citations API toont per regel **"Pulled from: BBQ Pulled Pork"**). Sam past handmatig aan, marge wordt live berekend, verstuurt naar klant via `/q/[token]`.

Dit IS het Golden-Flow-startpunt voor desktop-tenants. **Time-to-First-Offerte <15 min** is een KPI (zie ux-master.md).

## Componenten gebruikt

- **Modal** — vaul of shadcn Dialog (fullscreen op mobile, centered op desktop)
- **Multi-step form** — geen aparte step-router, één-pagina-scroll met section-anchors
- **Klant-autocomplete** — combobox `cmdk` over bestaande klanten + "Maak nieuwe klant"
- **Datepicker** — native of react-day-picker
- **AI-generate** — POST `/api/recipe-generate?mode=menu&headcount=X&vega=Y`
- **Menu-canvas** — drag-to-reorder gangen + per-regel cost-edit
- **Cited gerechten** — Citation-pills toont source-gerecht uit library

## State machine

```
hidden            → wizard niet open
opening           → modal-fade-in + form leeg
input-collect     → user vult klant + datum + gasten + gangen
generating        → AI denkt (skeleton-menu, "Rook denkt na...")
generated         → menu zichtbaar, marge berekend, edit-modus
saving            → server-action upsertOfferte
saved             → modal sluit, redirect naar /offertes/[id]/view + toast
error             → toast met retry, form-data behouden
prefilled         → uit localStorage bbq_lead_convert → skip step 1
```

## Interaction-patterns

- **Klant-veld autocomplete** — typ "Mar" → toont [Mariel Velema, Marco Polo Catering, Maria Janssen]. Selecteer = prefill adres. Onbekende naam = "Maak nieuwe klant"
- **Aantal gangen dropdown** — 1 / 2 / 3 (voor+hoofd+dessert) / 4 (+ tussen-gerecht) / 5 (+ amuse)
- **WAARVAN VEGA** — number-input, gebruikt door AI om vega-variant per gerecht voor te stellen
- **"Genereer menu" button** — disabled tot required-fields ok, daarna spinner met "Rook stelt voor..."
- **Per gerecht-card** — uitklap voor ingredients + marge-detail + alternatief-suggestie
- **Cited source-gerecht-pill** — klik opent gerecht-detail in nieuw tab (alleen-lezen)
- **Live marge-berekening** — naast totaal-prijs: "Marge €450 (32%)" met groen/oranje/rood

## Acceptance criteria

1. ✅ Time-from-open-to-first-AI-output <10s op normale 4G
2. ✅ Per menu-regel een Citation-pill `[uit: BBQ Pulled Pork]` — anders is het hallucinatie
3. ✅ BTW-splits via `BTW_RULES_2026` server-side (NOOIT AI-derived) — 9% catering / 21% alcohol+service
4. ✅ Allergens worden NIET door AI getypt — komen uit `gerecht_allergens` join (read-only weergave)
5. ✅ Productie-hoeveelheden = `recipe.yield × headcount`, geen AI
6. ✅ Save geeft public_token UUID; copy-link knop kopieert `https://...nl/q/[token]` direct
7. ✅ Modal blijft gefilterd open bij netwerk-fout; geen verloren input

## Bevindingen huidige versie

### Bugs
- (Niet kunnen verifieren zonder AI-call doen — Promptfoo #34 nodig)

### UX-gaps
- **"Rook stelt menu samen"** — "Rook" als AI-naam is bewust maar onverklaard hier; tooltip "Rook = jouw AI-assistent" zou helpen voor onboarding
- **Klant-veld is plain input** — geen autocomplete zichtbaar in screenshot. Combobox met bestaande klanten zou dubbele records voorkomen
- **Geen "Gebruik laatste klant-template"** — als Sam 80% van offertes voor 1 klant maakt, prefill-shortcut nuttig
- **Geen step-progress-indicator** — gebruiker weet niet "stap 1 van 4" — 1 lange scroll
- **WAARVAN VEGA** = mooi feature maar geen tooltip wat AI er mee doet ("Genereert vega-variant per gerecht")
- **Datum-veld** native picker — voor cateraar handig zou "Beschikbaarheid-check" zijn (rood = al een event op die datum)

### Visual
- **Modal-header "AI Offerte Wizard"** met ✨-icon is goed; sub-tekst kan korter ("14 gerechten beschikbaar")
- **Form-field labels in caps** — leesbaar maar oogt formeel; sentence-case zou warmer voelen
- **Required-indicator** ontbreekt op verplichte velden (rood asterisk)
- **Marge-pill** te klein in huidige versie — €450 (32%) zou prominent moeten zijn naast totaal-prijs
- **Save-button-state** onduidelijk in screenshot — primary CTA "Genereer" mist visueel

### Cohesie
- ✅ Lead-handoff via localStorage werkt (na APK fix #1)
- ✅ Acceptance-workflow draait correct (factuur+event+prep+inkoop+haccp+courses)
- ❌ **Geen link naar /gerechten** om "ik mis gerecht X" snel toe te voegen zonder wizard te verliezen
- ❌ **Geen template-historie** — Sam heeft 50 offertes gemaakt, AI zou patronen moeten leren (cached prompt-prefix)

## Design-prompt voor externe builder

```
Bouw een AI-assisted offerte-wizard voor catering-software BBQ Architect.

CONTEXT
Sam (cateraar-eigenaar, desktop+tablet) krijgt een lead binnen, opent deze
wizard. Doel: binnen 5 minuten een complete offerte met menu, marge en
publieke link voor de klant. AI-assist (Claude Sonnet 4.6 via Citations API)
genereert menu uit Sam's eigen 14+ gerechten (RAG over eigen recept-library).

LAYOUT
- Modal centered (desktop 720px wide) / fullscreen (mobile)
- Header: "✨ AI Offerte Wizard" + close-X + step-indicator (1/4 active)
- Body: scroll-binnen-modal, 4 stappen:

STAP 1 — Klant + event
- Klant autocomplete (cmdk over bestaande klanten + "Nieuw")
- Klantadres (optioneel, voor offerte-PDF)
- Event-datum (datepicker, "Beschikbaarheid-check": rood als bezet)
- Aantal gasten (number, min 10)
- Waarvan vega (number, ≤ gasten)
- Aantal gangen (1-5)
- "Volgende" CTA

STAP 2 — Menu-bron
- Radio: "Genereer met AI" (default) | "Gebruik template" | "Lege offerte"
- Bij AI: vrij-tekst "Speciale wensen?" textarea ("Niet te pikant, allergens nuts vermelden")
- "Genereer menu" → AI-call (~8-10s) met progress-skeleton
- Skeleton toont 3-5 placeholder cards met shimmer

STAP 3 — Menu-canvas
- AI-output: gangen geordend (voor → hoofd → dessert)
- Per gerecht-card:
  - Naam + gang-pill
  - Citation-pill "[uit: BBQ Pulled Pork]" (verplicht — anders hallucinatie)
  - Aantal porties (auto-derived van recipe-yield × gasten)
  - Allergens-icons (vis, noten, etc.) — uit gerecht_allergens
  - Inkoop-kost + verkoop-prijs + marge-pill (groen ≥55%, oranje 35-55%, rood <35%)
  - Edit-icon → drawer met ingredient-substitution opties
- Drag-to-reorder tussen gangen
- "Voeg gerecht toe" → cmdk over alle gerechten
- Live totaal-prijs + marge sticky onderaan

STAP 4 — Overzicht + verstuur
- BTW-splits (9% catering / 21% alcohol/service — NOOIT AI, server-side)
- Vaste kosten (transport, crew) edit-bare
- Geldig tot (default +30 dagen)
- Persoonlijk bericht (textarea, BlockNote rich-text)
- 3 CTAs:
  - "Bewaar als concept" → /offertes/[id]
  - "Genereer link voor klant" → /q/[token] copy
  - "Stuur direct via mail" → Resend template

AI BEHAVIOR (HARD RULES — verboden zonder)
- Claude Sonnet 4.6 met Citations API enabled (per gerecht source-tag)
- Cache prompt-prefix (system + recipe-library) — Sonnet 4.6 90% off voor cache-hits
- max_tokens cap, cost-tracking in ai_usage tabel
- NOOIT AI: BTW-rate, allergens, productie-hoeveelheden
- Citation-pill verplicht per regel; anders display "⚠ Bron onduidelijk" als waarschuwing

INTERACTIONS
- Step-indicator: klikbaar terug, niet vooruit (vooruit = volgende-btn)
- Modal-close → "Concept opslaan?" dialog (geen verloren werk)
- Klant-veld typing → autocomplete dropdown <300ms
- AI-generate → cancel-knop tijdens denken
- Per-regel edit-drawer → save via debounced server-action

COMPONENTS
- shadcn/ui Dialog (modal), Form, Combobox, Stepper (custom)
- cmdk voor klant-autocomplete + gerecht-search
- BlockNote voor rich-text-bericht
- react-day-picker voor datum
- Sonner voor toasts

ACCESSIBILITY
- Modal: aria-modal, focus-trap, ESC-sluit
- Step-indicator: aria-current="step" op active
- AI-generate progress: aria-live="polite" "Rook stelt menu samen..."
- Citation-pills: aria-label "Bron: BBQ Pulled Pork, open in nieuw tabblad"

MOBILE
- Fullscreen modal (van onder slide-in)
- Steps stack verticaal, swipe-tussen-stappen
- AI-generate kan 10+ seconden duren; toon skeleton + percent-progress

OUT OF SCOPE
- Geen real-time multi-user-edit (single-author voor v1)
- Geen template-saving binnen wizard (komt in /gerechten/menukaarten)
- Geen Stripe-betaling-link (komt in /q/[token] portal)

CONNECTS TO
- POST /api/recipe-generate (AI menu)
- Server action upsertOfferte (save)
- runAcceptanceWorkflow bij status=accepteer (auto-event+factuur)
- /q/[token] = klant ziet output
- bbq_lead_convert localStorage (prefill van leads-drawer)
```

## Files te wijzigen

- `src/app/offertes/page.tsx` (huidige 1300r — splitsen naar offertes-list + wizard-modal)
- `src/app/api/recipe-generate/route.ts` (geen wijziging — bewezen contract)
- `src/lib/acceptance-workflow.ts` (geen wijziging)
- `src/components/AiOfferteWizard.tsx` (nieuw — extract uit page.tsx)
- Promptfoo eval `docs/ai-evals/recipe-generate-modes/` (uitbreiden met Citation-pill check)
