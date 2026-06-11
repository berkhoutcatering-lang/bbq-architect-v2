# 01 — Publiek lead-formulier `/aanvraag/[slug]`

**Type:** Publieke landing-page + lead-capture form
**Huidige route:** `https://bbq-architect.nl/aanvraag/hop-en-bites`
**Source-bestand:** `src/app/aanvraag/[slug]/page.tsx` (~600 regels)

---

## Wat het moet doen

Een nieuwe potentiële klant landt hier vanaf de website van de cateraar (Hop & Bites, of welke tenant dan ook) en vraagt vrijblijvend een offerte aan. Geen login. Eén pagina, drie secties: **hero met sfeerbeeld → drie-stappen-uitleg → vertrouwen-strip → formulier**. Submit creëert een lead in `leads`-tabel + notificatie naar cateraar (Resend email).

Het is de **eerste indruk** die de klant heeft van de cateraar. Moet warm en professioneel voelen, niet als een SaaS-formulier.

## Componenten gebruikt

- **Pure CSS** (`aanvraag.css`) — geen framework, geen shadcn/ui. Bewust kale build voor laadsnelheid + brand-puurheid.
- **Inline SVG icon-set** (`QF_ICONS` — user/mail/phone/users/pin/shield/clock/sparkles/etc.) — `currentColor` voor theme-cascade.
- **Theme cascade** via `themeStyleVars()` uit `@/lib/portalThemes` — leest `settings.brand_theme` (8 OKLCH-presets) + custom `--brand-1` van tenant.

## State machine

```
loading      → fetch /api/public-arrangement/[slug] of settings  (skeleton)
loaded       → form leeg, klant kan invullen
submitting   → POST /api/public-lead-form/[slug] (button disabled, spinner)
success      → "Bedankt — je hoort binnen 24u van ons" + nieuwe lead-id
error        → toast met retry, form-data behouden
not-found    → tenant-slug bestaat niet → 404-pagina met "Verkeerde link?"
```

## Interaction-patterns

- **Click "Bekijk je opties"** → scroll smooth naar formulier (#form-anchor)
- **6 EVENT_TYPES** als chips/radio (Bruiloft, Bedrijfsfeest, Verjaardag, Festival, Jubileum, Anders) — single-select
- **Datepicker** voor `event_datum` — alleen toekomstige dates, min CURRENT_DATE + 7 dagen
- **Gasten-input** number, min=10 (cateraar werkt niet onder 10pp)
- **Submit-knop** disabled tot name + email + datum + gasten gevuld

## Acceptance criteria

1. ✅ Theming cascadet correct — verander `settings.brand_theme` van `warm-brown` naar `cool-blue` → kleuren updaten zonder code-deploy
2. ✅ Trust-badges tonen **alleen statische garanties** (Vrijblijvend / 24u reactie / Voorstel op maat). **NOOIT** verzonnen reviews of fictieve klant-tellingen
3. ✅ Submit met empty form → inline validation, geen 500-error
4. ✅ Submit met 1000-char `bericht` → werkt + getrimd op server
5. ✅ Mobile 375px → hero scaled goed, form-fields stack verticaal, touch-targets ≥44px
6. ✅ Klant met JS uit → SSR fallback toont minstens contact-email + telefoon van cateraar

## Bevindingen huidige versie

### Bugs
Geen kritieke gevonden in deze tool.

### UX-gaps
- **Geen progress-indicator** voor multi-step submit (jpegs uploaden kan 5-10s duren bij trage 4G)
- **Geen "save for later"** — als klant halverwege invult en pagina sluit, alles weg
- **Geen prefill via URL** — `/aanvraag/hop-en-bites?gasten=80&datum=2026-08-15` zou handig zijn voor cateraar om link te delen
- **Datum-veld niet smart** — biedt geen "binnen 2 weken / volgende maand / specifieke datum"-keuzes, alleen kale datepicker

### Visual
- **Hero gradient is mooi** maar over-saturated bij donker-modus tenant-themes — check OKLCH range per preset
- **Trust-badges** zijn 3-in-rij maar op tablet (768px) zou 2-in-rij + 1 onder beter werken
- **CTA-button "Bekijk je opties"** is fijn, maar als gebruiker al gescrolld is naar formulier, blijft hero in beeld te lang (sticky-effect zou helpen)
- **3-stappen-icons** in "Zo werkt het" zijn dezelfde currentColor — wat differentiatie zou het meer scanbaar maken

### Cohesie
- **Theming koppelt naar `/q/[token]` portal** ✅ — zelfde 8 OKLCH-presets, één bron van waarheid
- **Powered-by "BBQ Architect" footer ontbreekt** op aanvraag-pagina (staat wel op `/arrangement/[slug]`)
- **Geen link terug naar caterer-website** in nav. Klant zit "vast" op formulier-pagina. Zou `<a href={tenant.website_url}>← Terug naar website</a>` moeten hebben
- **Successcherm** na submit zou een **call-to-action** moeten hebben: "Bekijk vast onze menu's" → link naar `/arrangement/[slug]` of "Volg ons op Instagram"

## Design-prompt voor externe builder

```
Bouw een publieke lead-capture pagina voor catering-software BBQ Architect.

CONTEXT
Klanten van een cateraar (bv. Hop & Bites) landen op /aanvraag/[caterer-slug] 
vanaf de website van die cateraar. Geen login. Eén doel: vrijblijvend offerte
aanvragen. Tone: warm, professioneel, niet salesy.

LAYOUT (single-page, no nav)
1. HERO (60vh op desktop, 100vh op mobile)
   - Sfeerbeeld (BBQ-vuur, voedsel close-up) als background of left-50%
   - Logo + bedrijfsnaam tenant (uit settings.naam)
   - 1-zin tagline tenant (uit settings.ondertitel)
   - 2-3 trust-badges (Vrijblijvend / Reactie binnen 24u / Voorstel op maat)
   - Primary CTA "Bekijk je opties" scroll naar formulier
   
2. "ZO WERKT HET" (3 stappen)
   - Stap 1: Vertel ons over je event (datum, gasten, sfeer)
   - Stap 2: Wij sturen voorstel op maat (binnen 24u)
   - Stap 3: Jij beslist — vrijblijvend, geen verplichtingen
   - Elk stap: icon + titel + 1-zin uitleg
   
3. FORMULIER
   - Naam + Email + Telefoon (verplicht)
   - Event-datum (datepicker, min vandaag+7)
   - Aantal gasten (number, min 10)
   - Locatie (text)
   - Event-type chips (Bruiloft / Bedrijfsfeest / Verjaardag / Festival / Jubileum / Anders)
   - Budget-indicatie (optioneel slider €500-€10.000)
   - Vrij bericht (textarea)
   - Submit: "Verstuur aanvraag" → success-scherm
   
4. SUCCESS-SCHERM
   - "Bedankt {naam} — je aanvraag is verstuurd"
   - "Wij reageren binnen 24u op {email}"
   - CTA: "Bekijk vast onze menu's" → /arrangement/[slug]
   - Of: "Volg ons" → social-links (uit settings)

THEMING
- 5 design-tokens uit settings: --brand-1, --brand-2, --bg, --surface, --text
- 8 voorgedefinieerde OKLCH-presets (warm-brown, cool-blue, forest, charcoal, etc.)
- Wijzig settings.brand_theme → kleuren updaten zonder rebuild

INTERACTIONS
- Hero CTA "Bekijk je opties" → smooth scroll naar #form
- Event-type chips: single-select, kleur-fill bij active
- Submit: disable button bij empty required-fields, spinner bij submitting
- Server response success → animate naar success-scherm (slide-up)

ACCESSIBILITY
- WCAG 2.1 AA: contrast ≥4.5:1, touch-targets ≥44×44px, aria-labels, keyboard-nav
- Form-errors inline naast veld + aria-live announcement
- Datepicker: keyboard navigable
- Werkt zonder JS (SSR fallback met form-action POST)

MOBILE (375-414px)
- Hero stacked verticaal, badges 2-in-rij
- Form-fields full-width, met visuele groep-spacing
- Submit-button sticky-bottom als formulier > viewport

OUT OF SCOPE
- Geen multi-step wizard (alles op één pagina blijft)
- Geen verzonnen reviews/sterren (white-label-eerlijk)
- Geen tracking-pixels (privacy-first)
- Geen Stripe/iDEAL betaling (alleen lead-capture)

CONNECTS TO
- POST /api/public-lead-form/[slug] op submit
- GET settings via slug voor branding + tenant-info
- Lead verschijnt in /verkoop/leads dashboard van cateraar
```

## Files te wijzigen

- `src/app/aanvraag/[slug]/page.tsx` (UI complete rewrite)
- `src/app/aanvraag/[slug]/aanvraag.css` (theme-cascade behouden)
- `src/lib/portalThemes.ts` (geen wijziging — bron van waarheid)
- `src/app/api/public-lead-form/[slug]/route.ts` (geen wijziging — server contract stabiel)
