# UX Benchmark — BBQ Architect v2

**Datum:** 2026-04-28
**Scope:** UX-pattern-analyse op specifieke flows, niet commerciële vergelijking
**Aansluiting:** [`competitor-benchmark.md`](./competitor-benchmark.md) doet de commerciële scoring; dit doc gaat de diepte in op interactie-patterns

> Dit is een **UX-lens** benchmark. We kijken niet of een tool features X heeft — dat doet `competitor-benchmark.md` al. We kijken **hoe** de top-spelers hun UI bouwen voor de 4 flows die voor BBQ Architect het meest tellen: offerte, event-dag, keuken/HACCP, AI.

---

## 1. Methodologie

### Selectie van vergelijkingen

| Categorie | Spelers | Waarom |
|---|---|---|
| **Direct (catering SaaS)** | Tripleseat, Caterease, CaterTrax, Cateringpoint | Onze frontale concurrentie |
| **Adjacent (POS/restaurant)** | Toast, Square for Restaurants, Lightspeed | Beste keuken-UX in de markt |
| **Aspirational (B2B SaaS)** | Linear, Stripe Dashboard, Notion, Superhuman | Beste algemene productivity-UX |

### Onderzochte flows

1. **Offerte van leeg-naar-verstuurd** — 3-min-test
2. **Event-dag mobile** — bottom-nav + quick-actions
3. **Keuken/HACCP-equivalent** — touch-targets met handschoenen
4. **AI-integratie** — hoe staat AI in de UI?
5. **Onboarding** — eerste 60 min na sign-up

### Bron van bevindingen

- Screenshots van publieke marketing-pagina's en demo-video's
- Reviews op G2, Capterra, GetApp (Q1 2026)
- Eigen trial-tests waar mogelijk (Cateringpoint, Tripleseat-demo)
- UX-AUDIT-REPORT.md voor BBQ Architect-baseline

---

## 2. Flow-vergelijking

### Flow 1 — Offerte van leeg naar verstuurd

| Tool | Stappen | Tijd | UX-pattern | Sterk | Zwak |
|---|---:|---|---|---|---|
| **Tripleseat** | 7 | ~5 min | Multi-step wizard met preview-pane | Real-time menu-prijsupdate | EN-only, dichte form-density |
| **Caterease** | 12+ | ~12 min | Lange single-page form | Zeer flexibel | Overweldigend voor nieuwe user |
| **CaterTrax** | 8 | ~6 min | Wizard zonder preview | Mobile-werkbaar | Geen AI-suggestie |
| **Cateringpoint** | 9 | ~8 min | Sidebar-driven multi-pane | NL-native, vertrouwd | Dated, geen mobile |
| **BBQ Architect (huidig)** | 10 | ~7 min | Inline 661-regelige form op detail-page | Veel power, 1 scherm | Te lang, mobiel onbruikbaar |
| **BBQ Architect (target H1)** | 4 | **≤ 3 min** | AI-wizard: paste → preview → tweak → send | Pitmaster-uniek, mobiel-first | n.v.t. — design-doel |

**Wat we lenen.**
- **Tripleseat** real-time prijsupdate-pattern → toepassen in onze marge-display naast offerte-builder
- **Notion** block-based content → menu-items als drag-blokken in offerte (H2)
- **Linear** keyboard-shortcuts in form (Cmd+Enter = send) → H2

**Wat we vermijden.**
- **Caterease** alles-op-één-page → onze huidige fout, fix in H1
- Multi-step zonder back-button (verloren state)

---

### Flow 2 — Event-dag mobile

| Tool | Mobile-UX | Touch-targets | Bottom-nav? | Offline? | Score (1–5) |
|---|---|---|---|---|---:|
| **Tripleseat** | Responsive web | Goed (≥ 44px) | Nee, top-bar | Nee | 3 |
| **Caterease** | Niet-responsive | Te klein | Nee | Nee | 1 |
| **CaterTrax** | Responsive + mobile-friendly | Goed | Top-tab | Nee | 4 |
| **Cateringpoint** | Beperkt responsive | Wisselend | Nee | Nee | 2 |
| **Flex Catering** | Native iOS/Android | **Native (auto goed)** | **Bottom-tab** | **Ja** | **5** |
| **Toast (POS)** | Native + tablet-design | **88px keuken-knoppen** | Bottom-tab | Ja | **5** |
| **BBQ Architect (huidig)** | Responsive web | **40% < 44px** | Nee, hamburger | Nee | **1** |
| **BBQ Architect (target H1)** | Responsive web + PWA-ready | ≥ 44px overal | **Bottom-nav 5 dest** | H2 | **4** |

**Wat we lenen.**
- **Toast** keuken-knoppen 88px voor gloved-use → onze HACCP-doelmaat
- **Flex Catering** bottom-tab met 5 destinations → onze H1-implementatie
- **Linear** thumb-zone-vriendelijke action-bar → H1 mobile-event-screen

**Wat we vermijden.**
- Hamburger-only navigation op mobile (Caterease, ons huidig) — onbruikbaar in keuken
- Top-tab op telefoon-met-één-hand (te ver weg voor duim)

---

### Flow 3 — Keuken/HACCP-equivalent

> De directe catering-concurrenten hebben **geen echte keuken-UX**. Hieronder wat we leren van POS-tools die wél in keukens leven.

| Tool | Keuken-UX-aanpak | Knop-grootte | Glove-friendly? | Audio-feedback? |
|---|---|---|---|---|
| **Toast Kitchen Display** | Order-tickets met grote knoppen, timer-kleuren | 88px+ | Ja | Ja (timers) |
| **Square Kitchen** | Card-stack, swipe-to-complete | 64px | Beperkt | Nee |
| **Lightspeed Kitchen** | Grid-view met status-kleuren | 56px | Ja | Optioneel |
| **NVWA-papier (status quo)** | Kladblok + pen | n.v.t. | Ja | n.v.t. |
| **BBQ Architect HACCP (huidig)** | Tabel-based form-input | **94% < 44px** | **Nee** | Nee |
| **BBQ Architect HACCP (target H1)** | Card-grid 64px + swipe-confirm | **≥ 64px** | **Ja** | Optioneel (V2) |

**Toast-pattern dat we kopiëren (target H1):**

```
┌──────────────────────────────┐
│  KOELING 4°C                 │  ← 64px header
│                              │
│   ┌──────────┐  ┌──────────┐ │
│   │   3°C    │  │   OK     │ │  ← 88×88px tap-zones
│   │  ↻       │  │   ✓      │ │
│   └──────────┘  └──────────┘ │
│                              │
│  Laatste check: 06:45 ✓     │  ← 14px subtext
└──────────────────────────────┘
```

**Audio-feedback (optioneel V2).** Korte haptische tik op confirm — Toast-ervaring leert: gloved-users vertrouwen visuele feedback minder, dus voeg vibratie of korte tone toe.

---

### Flow 4 — AI-integratie UI

> **Geen** directe catering-concurrent heeft AI-integratie. Dit is onze moat. Hieronder leren we van non-catering AI-tools hoe AI er goed uitziet in een professional-tool.

| Tool | AI-positie in UI | Modaliteit | Gebruiker-controle | Cost-transparency |
|---|---|---|---|---|
| **Notion AI** | Sidebar + inline `/ai`-command | Inline-blokken | Accept/regenerate/discard | Nee |
| **Linear AI** | Smart-summary in issue-detail | Inline-toelichting | Toggle on/off | Nee |
| **GitHub Copilot** | Ghost-text in editor | Inline ghost-suggestion | Tab/escape | Soft-cap |
| **Cursor** | Cmd+K omni-input | Modal-overlay | Stream + edit + accept | Toon usage |
| **Stripe Tax-AI** | Quiet-default (geen sterren-icoon) | Achtergrond, geen UI | Audit-trail | Onzichtbaar |
| **BBQ Architect Pitmaster (huidig)** | Aparte chat-pagina | Conversational | Send/discard | Cap-bar |
| **BBQ Architect (target H1)** | Inline in flows + sidebar Pitmaster | Hybride | Preview-stap altijd | Cap-bar **+** kosten/actie |

**Patterns die we kopiëren.**
- **Cursor Cmd+K** → onze H2 command-palette met AI-acties
- **GitHub Copilot ghost-text** → in offerte-wizard: AI suggereert beschrijving, gebruiker accepteert of typt over
- **Notion `/ai` inline-command** → in receptenwerker: type `/ai` voor allergeen-detectie

**Patterns die we vermijden.**
- **Magic-button-overal** (de "sparkles ✨ icon disease") — voelt gimmick. Plaats AI alleen waar relevant.
- **Black-box** (Stripe Tax-stijl) — onze gebruikers willen *zien* wat AI doet (zie [P4 in ux-strategy.md](./ux-strategy.md))

**Pitmaster Studio-positionering (H1).** Behoud aparte chat-pagina voor exploratory AI ("hoe maak ik mac-and-cheese voor 80 man?"), maar integreer AI-suggesties **binnen** de werk-flows (offerte-wizard, recepten, voorraad). Pitmaster wordt het diepe-gesprek-podium, niet de enige plek voor AI.

---

### Flow 5 — Onboarding

| Tool | Tijd tot 1e succes | Mechaniek | Demo-data? | Activation-meting |
|---|---|---|---|---|
| **Linear** | ~5 min | Templates + sample-data | Ja, projecten-template | Nee |
| **Notion** | ~10 min | Persona-quiz → template | Ja, workspace-template | Ja |
| **Superhuman** | 30 min | **Persoonlijke onboarding-call** | Niet nodig | Ja, retentie-driver |
| **Stripe** | ~20 min | Test-mode + docs-driven | Ja, test-cards | Ja, 7-dag-flow |
| **Tripleseat** | ~2 uur | "Done-with-you" via support | Beperkt | Onbekend |
| **Cateringpoint** | ~3 uur | Manual + tutorial-video's | Nee | Nee |
| **BBQ Architect (huidig)** | ~∞ (geen flow) | Lege state | Nee | Schema bestaat, niet gewired |
| **BBQ Architect (target H1)** | **≤ 60 min** | Checklist + demo-data + AI-help | **Ja, 1 klik** | activation_events live |

**Wat we lenen (target H1).**
- **Notion** persona-quiz → "Wat voor caterier ben je?" → Marieke/Jeroen/Lars-template
- **Linear** sample-data dat je kan **wissen** wanneer je klaar bent — niet permanent, niet onsight
- **Stripe** "test-mode" badge → wij: "demo-modus aan" met paarse banner
- **Superhuman** retentie-driver — maar wij doen self-service: AI-chat ipv mens-coach

---

## 3. Pattern-cheatsheet (single source of truth)

Voor elk repeat-patroon: één keuze, gedocumenteerd.

| Pattern | Keuze | Reden | Bron-inspiratie |
|---|---|---|---|
| Primaire CTA-positie | Top-right (desktop), bottom-floating (mobile) | Thumb-zone | Linear, Toast |
| Bevestiging na save | Toast 2s rechtsonder | Niet-blokkerend | [P5 ux-strategy](./ux-strategy.md) |
| Bevestiging na destructive | Modal + typ-bevestiging | Risico-evenredig | Stripe |
| Empty-state | Illustratie + 1 actie + 1 skip | Onboarding-vriendelijk | Linear, Notion |
| AI-output | Preview-stap altijd | Trust + GDPR | Cursor |
| Loading | Skeleton ≥ 200ms, spinner alleen ≥ 1s | "Snelheid is gevoel" [UX-6](./ux-strategy.md) | Stripe |
| Form-validation | Inline + on-blur, niet on-keystroke | Niet-irriterend | Stripe |
| Modal vs slide-over | Slide-over voor edit, modal voor confirm | Context-behoud | Linear |
| Mobile nav | Bottom-tab 5 destinations | Thumb-zone | Toast, Flex Catering |
| Desktop nav | Sidebar-icons (collapsed) of sidebar-text (expanded) | Density-flexibility | Linear |
| Power-user | Cmd+K palette (H2) | Snelheid voor experts | Linear, Cursor |
| Realtime-multi-user | Avatar-cursor + "X is editing"-badge | Maak Supabase-superpower zichtbaar | Notion, Figma |

---

## 4. Top-3 lessons voor BBQ Architect

### Lesson 1 — Kopieer Toast voor keuken, niet Tripleseat

Tripleseat is onze commerciële benchmark, maar zijn keuken-UX is matig — ze zijn een sales-tool, geen kook-tool. Voor HACCP/event-dag is **Toast** het ankerpunt: 88px-knoppen, timers met kleur-status, optionele audio-feedback. Onze Pro-tier rechtvaardigt zich pas als de keuken-UX op Toast-niveau zit.

### Lesson 2 — AI is niet een page, het is een laag

Pitmaster Studio als aparte pagina is goed voor exploratory chat, maar de echte UX-winst zit in **AI inline in werk-flows**. Notion's `/ai`-command, Cursor's Cmd+K, GitHub Copilot's ghost-text — patterns waar AI hulp aanbiedt waar je al bent, niet "ga naar AI-pagina, kom terug, plak resultaat". H1 actie: AI-suggestion-knop in offerte-wizard, allergeen-flag in recepten, voorraad-anomaly-warning.

### Lesson 3 — Realtime is een feature die je moet **laten zien**

Supabase Realtime geeft ons gratis multi-device-sync — maar onze UI laat dat niet zien. Notion en Figma maken hun realtime-superpower zichtbaar met avatar-cursors en "X is editing"-badges. Voor BBQ Architect (Q3 2026): toon op event-detail wie er nu kijkt/bewerkt; toast bij keuken-tablet als kantoor-medewerker iets wijzigt.

---

## 5. Opportunity-map (UX-specifiek)

> Aanvullend op de [opportunity-matrix in ux-strategy.md §5](./ux-strategy.md#5-opportunity-framework). Hier focus op patterns we van benchmarks lenen.

| # | Opportunity | Bron | RICE | Horizon |
|---|---|---|---|---|
| UX-O1 | Keuken-knoppen 64–88px (Toast-pattern) | Toast | hoog | H1 |
| UX-O2 | Bottom-tab 5 destinations (Flex Catering) | Flex | hoog | H1 |
| UX-O3 | AI-inline in offerte-wizard (Cursor/Copilot) | Cursor | hoog | H1 |
| UX-O4 | Demo-data 1-klik-loader (Linear) | Linear | hoog | H1 |
| UX-O5 | Skeleton-loaders + sub-1s pagewechsel (Stripe) | Stripe | mid | H1 |
| UX-O6 | Cmd+K command-palette (Linear/Cursor) | Linear | mid | H2 |
| UX-O7 | Avatar-cursor multi-device (Notion/Figma) | Notion | mid | H2 |
| UX-O8 | Persona-quiz onboarding (Notion) | Notion | mid | H2 |
| UX-O9 | Block-based offerte-builder (Notion) | Notion | mid | H2 |
| UX-O10 | Audio/haptic feedback HACCP (Toast) | Toast | laag | H3 |

---

## 6. Wat verfrissend uit de markt blijft (en waarom)

| Pattern | Wie doet het | Waarom wij niet (nu) |
|---|---|---|
| **Native iOS/Android-app** | Flex Catering | PWA dekt 80% behoefte, native = duur onderhoud (H3 misschien) |
| **Spraak-input bij events** | sommige niche | Privacy-vraag NL, accuracy nog onvoldoende, weinig vraag in interviews |
| **AR-menu-preview** | none yet | Gimmick, niet workflow |
| **Geo-tracked drivers** | Flex Catering | Onze klanten leveren <30 events/mnd, manual is OK |
| **Multi-language i18n** | Tripleseat, Caterease | NL-fit is moat, ondoel-uitbreiding |

---

## 7. Conclusie

**Drie strategische take-aways.**

1. **Onze commerciële differentiatie (NL-fit, AI, prijs) is geanalyseerd in [`competitor-benchmark.md`](./competitor-benchmark.md). Deze UX-benchmark voegt toe: onze interactie-quality moet ook op niveau** — anders verliezen we klanten aan minder-functionele-maar-prettiger-tools.

2. **De grootste UX-gaps zitten op mobile/keuken** — daar zijn onze concurrenten ook zwak (behalve Toast/Flex), dus dit is **dubbel kansrijk**: door beter te zijn op de plek waar iedereen slecht is, winnen we klant + reputatie.

3. **AI-positionering is unieke gunst** — niemand heeft het. Maar we moeten niet "AI-page" doen (zoals chatbot-tools doen); we moeten "AI als laag" doen (zoals Notion/Cursor). Dat is een design-strategy-keuze, geen feature-keuze.

---

**Volgende update:** Q3 2026 — herzie als top-spelers grote redesigns lanceren.
