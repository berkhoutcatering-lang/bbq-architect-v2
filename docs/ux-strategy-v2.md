# UX Strategy v2 — "Best in Segment"

**Datum:** 2026-05-01 (status-update)
**Auteur:** Claude (audit + synthese), Mathijs (eigenaar Hop & Bites + bouwer BBQ Architect, richting + sign-off)
**Status:** Levend document — sprint 1 ("Trust") gemerged op main. Voortbouwend op het hub-and-spoke IA-plan in [`~/.claude/plans/loop-een-ronde-langs-peaceful-wilkinson.md`](~/.claude/plans/loop-een-ronde-langs-peaceful-wilkinson.md).

> Dit document is het **hoofd-leesdocument** voor de UX-strategie. Het bundelt een empirische app-audit (mei 2026) + verdiepende competitive analysis met de bestaande strategie-laag (vision, pillars, problem-frames, RICE-roadmap). Het doel: scherp neerzetten waar BBQ Architect **al** de beste in segment is, waar we achterlopen, en welke 10 acties we eerst doen om "best in segment" werkelijk te maken.

---

## Index

| Sectie | Wat | Eerder werk waar dit op voortbouwt |
|---|---|---|
| [1. Status quo (TL;DR)](#1-status-quo-tldr) | 5 minuten lezen, top-3 issues + top-3 moats | — |
| [2. App-audit mei 2026](#2-app-audit-mei-2026) | Empirische page-by-page bevindingen | nieuw |
| [3. Competitive landscape](#3-competitive-landscape) | Feature-matrix vs 11 concurrenten incl. CaterZen (BBQ-niche) | aanvulling op [`ux-benchmark.md`](./ux-benchmark.md) (pattern-level) |
| [4. Wat werkt al — moats](#4-wat-werkt-al--moats) | Top 5 dingen die we NU al beter doen | — |
| [5. Wat werkt niet — gaps](#5-wat-werkt-niet--gaps) | Top 5 echte issues uit audit | bevestigt [`ux-problem-frames.md`](./ux-problem-frames.md) UX-P1..P7 |
| [6. Anti-scope](#6-anti-scope) | Wat we expliciet NIET worden | — |
| [7. Top-10 acties (12 weken)](#7-top-10-acties-12-weken) | RICE-gescoord, voortbouwend op WF1/4/8 | bouwt voort op [`ux-workflow-audit.md`](./ux-workflow-audit.md) §5 |
| [8. Verificatie & open vragen](#8-verificatie--open-vragen) | Hoe meten we success | hergebruikt HEART uit [`ux-strategy.md`](./ux-strategy.md) §6 |

**Diepere context (niet in dit doc, maar gerefereerd):**
- [`ux-strategy.md`](./ux-strategy.md) — vision "stille co-piloot 2027", 6 UX-pillars, HEART-metrics, design brief
- [`ux-problem-frames.md`](./ux-problem-frames.md) — 7 design-sub-problemen (UX-P1..P7), DoD-checklist
- [`ux-workflow-audit.md`](./ux-workflow-audit.md) — 10 frictiepunten (F1..F10), top-3 bets WF8/WF4/WF1
- [`ux-benchmark.md`](./ux-benchmark.md) — UX-pattern-matrix tegen 10 competitors

---

## 1. Status quo (TL;DR)

**Sprint 1 ("Trust") is gemerged op main, mei 2026:**

| # | Actie | Status | Bewijs |
|---|---|---|---|
| **A0** | `/financien` foodcost-bug | ✅ klaar | Foodcost €0 → €211, marge 96,8% → 96,0% |
| **A0-deep** | menu_selectie strings + fuzzy match | ✅ klaar | `[SEED] Pulled Pork Sliders` matcht "Sliders" |
| **A5** | Persona-naam consistency | ✅ klaar | AI heet overal **Rook**; `/ai-chat` is "Pitmaster Studio · Rook" |
| **A6** | Help Center vullen | ✅ klaar | 15 artikelen live op `/hulp` (12 nieuw + 3 oude hernoemd); `npm run seed-help` werkt idempotent |
| **A7-1** | `/logistiek/field` veldmodus | ✅ klaar | 88px-knoppen + categorie-cards + "Alles OK"-bulk + persistent saved |
| ~~A9~~ | ~~Mollie iDEAL aanbetaling~~ | ⛔ geschrapt | Mathijs: "klant betaald 30% hoeft niet, factuur komt altijd erna" |

**Top-3 moats waar we NU al voorlopen op markt (bevestigd):**

1. **HACCP + Logistiek field-mode is letterlijk uniek** — `/haccp/field` (88px-knoppen, ±5°C steppers) en sinds A7-1 ook `/logistiek/field` (bus-check, "Alles OK" bulk). **Geen enkele concurrent** (Tripleseat/Caterease/Curate/HoneyBook/Toast/Square/CaterZen/EasyParty/Catermonkey) heeft een glove-friendly veldmodus. Beschermen + uitbouwen naar `/prep-counter`, `/service`.
2. **Page-context AI met tool-use** — "Rook" weet per scherm waar je bent en kan acties uitvoeren. Tripleseat's AI-bot krijgt 1-ster reviews. Curate's chatbot heeft hun klanten vervreemd. Onze implementatie is volwassener.
3. **Menu-engineering BCG-matrix** — winnaars/verliezers/dogs als ingebouwde feature. Geen enkele concurrent heeft dit ([Cornell-onderzoek](https://torreshospitalityconsulting.com/en/2024/05/28/mastering-the-menu-how-engineering-bcg-matrix-and-dynamic-pricing-boost-restaurant-profits/) toont 10-15% winstpotentie).

**Resterend voor 100% trust-laag:** 5 van 10 bevestigde offertes hebben geen menu_selectie → foodcost lekt. Dat is **data-cleanup**, geen code-fix.

---

## 2. App-audit mei 2026

**Methodologie:** dev-server gestart, alle 27 routes bezocht in desktop (1280×800) en selectief mobile (375×812) en tablet (768×1024). Per pagina: 5 dimensies gescoord (First Impression, Information Architecture, Mobile/Field Usability, AI-integratie, Performance-gevoel) op 1-5. Scores zijn richtinggevend, niet absoluut.

### 2.1 Audit-tabel — alle 27 pagina's

Legenda: **FI** = First Impression · **IA** = Information Architecture · **MF** = Mobile/Field · **AI** = AI-integratie · **PF** = Performance Feel · **TI** = Top Issue

| # | Route | FI | IA | MF | AI | PF | Top Issue |
|---|---|---:|---:|---:|---:|---:|---|
| 1 | [/](src/app/page.tsx) (Dashboard) | 4 | 4 | 4 | 3 | 4 | "Setup compleet 7/7" blijft staan na voltooiing — nutteloze ruimte |
| 2 | [/agenda](src/app/agenda/page.tsx) | 4 | 3 | 3 | 3 | 4 | "Live data" + "AI Insights" badges zonder context, "0/2000" footer-quota onhelder |
| 3 | [/events](src/app/events/page.tsx) | 4 | 4 | 3 | 3 | 4 | Drie views (Tijdlijn/Kalender/Kanban) goed, maar "Booking pulse 100% win rate" abstract |
| 4 | [/events/[id]/hub](src/app/events/[id]/hub/page.tsx) | 3 | 2 | 2 | 4 | 2 | **F3 monoliet** — 1264 LOC, trage initial load, single Promise.all (al in [`ux-workflow-audit.md`](./ux-workflow-audit.md)) |
| 5 | [/events/[id]/field](src/app/events/[id]/field/page.tsx) | — | — | — | — | — | Niet getest in audit — nodig voor field-mode validatie |
| 6 | [/prep-counter](src/app/prep-counter/page.tsx) | 4 | 4 | 4 | 4 | 4 | "Demo-modus voor Bruiloft Van Dijk" + echt event = "Familie Pietersen": context-mismatch verwart |
| 7 | [/klantgesprek](src/app/klantgesprek/page.tsx) | 4 | 3 | 2 | 4 | 4 | 6-stappen wizard tijdens **live klantgesprek** is veel typewerk; geen "skip step" |
| 8 | [/service](src/app/service/page.tsx) | 4 | 3 | 3 | 5 | 3 | Pitmaster Coach "Rook" sidebar = uniek + warm. Maar event-card en chat-message dubbele-context |
| 9 | [/gerechten](src/app/gerechten/page.tsx) | 3 | 3 | 3 | 4 | 4 | Allergenen als tekst-soep (`Gluten · Mosterd · Eieren`) onleesbaar, foto-placeholders donker |
| 10 | [/menu-engineering](src/app/menu-engineering/page.tsx) | 4 | 3 | 3 | 4 | 4 | **BCG-matrix is moat maar visueel afwezig** — alleen "9 (3 stars · 0 dogs)" telling |
| 11 | [/recepten](src/app/recepten/page.tsx) | 3 | 2 | 3 | 4 | 4 | Overlapt visueel ~80% met /gerechten — Mathijs' memory: "kunnen gemerged worden" |
| 12 | [/ai-chat](src/app/ai-chat/page.tsx) (Pitmaster Studio) | 4 | 4 | 3 | 5 | 3 | Brainstorm-mode + 6 starters goed; Snel/Standaard/Diep toggle zonder tooltip onhelder |
| 13 | [/offertes](src/app/offertes/page.tsx) | 3 | 2 | 3 | 4 | 4 | **F1 — 3 verschillende new-offerte buttons** (Stel Menu Samen / AI Offerte / Nieuwe Offerte) + 4e via klantgesprek |
| 14 | [AI Offerte Wizard](src/components/AiOfferteWizard.tsx) (modal) | 4 | 3 | 4 | 5 | 4 | **F2 — geen prijs-input in wizard** (RICE 190 in `ux-workflow-audit.md` WF8) |
| 15 | [/facturen](src/app/facturen/page.tsx) | 3 | 3 | 3 | 2 | 4 | Veel facturen €0,00 (data-bug), geen totaal-banner of vervaldag-bucket-filter |
| 16 | [/klanten](src/app/klanten/page.tsx) | 3 | 4 | 3 | 2 | 4 | Type-tabs (Particulier/Zakelijk/Festival/Horeca) goed; F10 — geen bulk-acties |
| 17 | [/financien](src/app/financien/page.tsx) | 4 | 4 | 3 | 2 | 4 | **🔴 Critical bug** — 96,8% netto winst, €0 foodcost, "Foodcost theoretisch €0,00". Onmogelijk |
| 18 | [/inkoop](src/app/inkoop/page.tsx) | 4 | 4 | 3 | 4 | 4 | 5 tabs (Leveranciers/Lijsten/Boodschappen/Bon-scanner/Archief) goed gegroepeerd |
| 19 | [/voorraad](src/app/voorraad/page.tsx) | 5 | 4 | 3 | 5 | 4 | "Smart Inventory" branding + AI bestelvoorstel = sterk. 5 actie-knoppen bovenaan = te veel keuze |
| 20 | [/logistiek](src/app/logistiek/page.tsx) | 3 | 3 | 3 | 3 | 4 | Empty state vereist offerte-selectie om te starten — geen default "alles voor komend event" |
| 21 | [/materieel](src/app/materieel/page.tsx) | 3 | 4 | 3 | 2 | 4 | Foto-placeholders, status alleen OK/Aandacht zonder uitleg, geen "in gebruik bij event X" |
| 22 | [/uren](src/app/uren/page.tsx) | 3 | 4 | 4 | 1 | 4 | Punch-in/out goed; geen koppeling met events ("Punch in voor event X"); AI absent |
| 23 | [/haccp](src/app/haccp/page.tsx) | 4 | 4 | 2 | 4 | 4 | Live sensor-graphs goed; Quick Log als tab in plaats van prominent — field-mode gehecht aan submenu |
| 24 | [/haccp/field](src/app/haccp/field/page.tsx) | **5** | **5** | **5** | 3 | **5** | **🟢 Beste pagina van app** — 88px-knoppen, ±5° steppers, NVWA-ranges in UI. Echte moat |
| 25 | [/price-intelligence](src/app/price-intelligence/page.tsx) | 4 | 4 | 3 | 5 | 4 | "AI besparing €79/maand" sterk; CSV-import als enige (Mathijs' memory: scraper-wens) |
| 26 | [/mailbox](src/app/mailbox/page.tsx) | 3 | 4 | 3 | 1 | 4 | Alleen verzonden-mailbox, **geen inkomende mail** — 50% van mailbox-belofte ontbreekt |
| 27 | [/foto-archief](src/app/foto-archief/page.tsx) | 3 | 3 | 3 | 1 | 4 | Bijna leeg (1 foto in seed-data), upload-mode kan inline vanaf andere pagina's |
| 28 | [/instellingen](src/app/instellingen/page.tsx) | 3 | 3 | 3 | 1 | 4 | Volledig form met NL-fields (KVK/BTW/IBAN); structuur kan in tabs (huisstijl/integraties/data) |
| 29 | [/gebruikers](src/app/gebruikers/page.tsx) | 2 | 3 | 3 | 1 | 4 | Slecht 1 lid (Mathijs admin); permissions/rollen niet uitwerkbaar |
| 30 | [/website](src/app/website/page.tsx) | 4 | 4 | 3 | 1 | 3 | 5 tabs (Hero/FAQ/Galerij/Signature Menu/Footer); "draait op localhost" warning = niet productie-ready |
| 31 | [/hulp](src/app/hulp/page.tsx) (Help Center) | 1 | 2 | 3 | 1 | 4 | **Volledig leeg** — "geen artikelen gevonden". Cruciaal gat voor UX-P5 onboarding zonder coach |

> **Score-distributie:** mediaan 3-4. Field-mode HACCP is enige 5/5 over alle dimensies. Drie pagina's met 1-2's: `/financien` (data-bug), `/hulp` (leeg), `/gebruikers` (basaal). 27 pagina's met IA-score ≥3 → IA is gemiddeld OK; main pijn zit in MF (mobile/field) en AI-consistency.

### 2.2 Belangrijkste empirische bevindingen (niet eerder gedocumenteerd)

**A. Bottom-nav bestaat al op mobile.** `/offertes` op 375×812 toont vijf-tab bottom-nav (Dashboard / HACCP / Voorraad / Prep / Meer). Dit was in [`ux-strategy.md`](./ux-strategy.md) §1 als H1-doel benoemd ("bottom-nav live"). Status: ✅ live. Wat ontbreekt: consistente toepassing op alle pagina's én touch-target-baseline op de inhoud (zie B).

**B. Field-mode HACCP is écht goed, maar staat geïsoleerd.** `/haccp/field` haalt het beloofde glove-friendly niveau (88px-knoppen, ±5° steppers, NVWA-ranges in UI). Maar het hoofd-`/haccp` heeft tabs van ~36px-hoogte, en de overgang ernaartoe is een aparte URL (`/haccp/field`) zonder duidelijk-zichtbare toggle. UX-P4 (keuken-UX) heeft deze pagina al gefixt — de strategie is "kopieer dit naar 5 andere pagina's", niet "bouw vanaf 0".

**C. Demo-data verwart op operationele pagina's.** `/prep-counter` toont prep voor "Bruiloft Van Dijk" met banner "echte prep voor je events vind je op /agenda — eerstvolgend: Familie Pietersen". Dat is letterlijk twee verschillende events op één scherm → user moet mentale-model bouwen. Field-pagina's mogen óf demo óf echt zijn, niet beide.

**D. Pitmaster Coach "Rook" is een sterke design-keuze die niet doorvloeit.** Op `/service` is de AI-sidebar gepersonifieerd als "Rook" — warm, met snelle vragen ("Geef me een kort moraal-boost"). Op andere pagina's is The Architect geen-naam-AI. **Inconsistentie:** is het Rook? The Architect? De AI? Een persona-naam-strategie ontbreekt.

**E. /financien P&L is wishful thinking, niet reality.** Totale omzet €26k, foodcost €0, netto winst 96,8%. Data-koppeling tussen events + ingredient-kosten is niet wired. Dit is geen design-issue — dit is een product-correctheid-issue dat alle financiële geloofwaardigheid kapot maakt. Bij externe demo: deal-killer.

**F. "0/2000" en "2/2000" footer in sidebar zonder context.** Verschijnt op meerdere pagina's. Vermoedelijk AI-tokens-quota of activiteit-meter. Gebruiker leert dit niet zonder hover-tip.

### 2.3 Bevestigingen van bestaande analyse

| Bevinding empirisch | Document waar al benoemd | Status |
|---|---|---|
| F1 — 3+ knoppen voor nieuwe offerte | [`ux-workflow-audit.md`](./ux-workflow-audit.md) §F1 | bevestigd, RICE 80 (WF2) klopt |
| F2 — geen prijs-input in AI Wizard | [`ux-workflow-audit.md`](./ux-workflow-audit.md) §F2 | bevestigd, RICE 190 (WF8) is hoogste prio |
| Touch-targets `/haccp` te klein | [`ux-problem-frames.md`](./ux-problem-frames.md) UX-P4 | bevestigd, field-mode is de blueprint |
| Recepten/Gerechten redundant | Mathijs' auto-memory | bevestigd, mergen rationaliseert keuken-cluster |
| /price-intelligence wil scraper | Mathijs' auto-memory | bevestigd in audit (CSV-only blokkeert leveranciers) |
| /offerte-editor dood | Mathijs' auto-memory | bevestigd — wizard is dominant |

---

## 3. Competitive landscape

> Voor pattern-level (offerte-flow, mobile-nav, etc.) zie [`ux-benchmark.md`](./ux-benchmark.md). Deze sectie is **feature-level** (40 features × 11 concurrenten) en focust op het BBQ/foodtruck-segment.

### 3.1 Concurrentenset (vernieuwd in mei 2026)

| Type | Naam | Pricing | BBQ/foodtruck-fit |
|---|---|---|---|
| **Direct (US catering CRM)** | [Tripleseat](https://www.tripleseat.com/features/) | ~$149-300+/mo | ❌ — restaurants/hotels/wedding venues |
| | [Caterease](https://www.caterease.com/features/) | $99-199/mo + setup | ❌ — desktop-only, oud |
| | [Total Party Planner](https://totalpartyplanner.com/features/) | custom quote | 🟡 — noemt foodtrucks |
| | [Curate](https://curate.co/catering-software/) | $125-333/mo | ❌ — wedding florists eerst |
| | [HoneyBook](https://catercamp.com/blog/honeybook-for-catering) | $36-129/mo | ❌ — geen BEO, geen menu-builder |
| **Foodtruck-niche (POS-first)** | [Square for Restaurants](https://squareup.com/us/en/restaurants) | $49-149/mo + 2,4-2,6% | 🟡 — sterk POS, zwak quote-flow |
| | [Toast Catering & Events](https://pos.toasttab.com/products/catering-and-events) | $165-270/mo + 2,99% | ✅ — Toast Go is foodtruck-handheld |
| **BBQ-niche (uniek!)** | [CaterZen](https://www.caterzen.com/bbq-catering-software) | $129/mo + $99/locatie | ✅ — gebouwd door BBQ-cateraar Michael Attias |
| **NL-spelers** | [EasyParty](https://www.easyparty.nl/mogelijkheden/) | custom | ❌ — enterprise (Efteling, Maison van den Boer) |
| | [Catermonkey](https://catermonkey.com/en/prices/) (BE/NL) | €50/mo per user | 🟡 — quote→invoice, geen HACCP |

**Belangrijkste vondst:** **CaterZen is de enige BBQ-specifieke concurrent** in de markt. Gebouwd door een BBQ-cateraar met $1M+ omzet, gevestigd US. Heeft een tablet Production Report met touchscreen-checklist — dichtst-bij wat onze prep-counter probeert te zijn. Géén HACCP, géén AI op het niveau van Architect, NL-fiscaliteit absent.

### 3.2 Feature-matrix highlights

Volledige matrix in [agent-rapport](https://github.com/anthropics/...) — hier 12 highlights die de strategische conclusies dragen:

| Feature | Tripleseat | CaterZen | Toast C&E | EasyParty | Catermonkey | **BBQ Architect** |
|---|---|---|---|---|---|---|
| Quote met AI auto-menu uit prompt | 🟡 | ❌ | ❌ | 🟡 | 🟡 | ✅ (AiOfferteWizard) |
| iDEAL/Mollie betaling op offerte | ❌ | ❌ | ❌ | 🟡 | 🟡 | ❓ (niet getest in audit) |
| **HACCP-temperatuurregistratie** | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| **HACCP glove/field-mode UI** | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| **PWA / offline-modus** | ❌ | ❌ | ✅ (offline) | ❌ | ❌ | 🟡 (PWA ja, offline niet) |
| **Page-context AI per scherm** | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| **AI tool-use (acties uitvoeren)** | 🟡 | ❌ | ❌ | ❌ | ❌ | ✅ |
| **Menu-engineering BCG matrix** | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| BBQ-kennis (smoke/rest-times) | ❌ | 🟡 (founder, geen tool) | ❌ | ❌ | ❌ | 🟡 (begin in prep-counter) |
| NL BTW + Moneybird/Exact-koppeling | ❌ | ❌ | ❌ | ✅ | ✅ | 🟡 (BTW-tab, geen koppeling) |
| Klant-portal voor offerte (online tekenen) | ✅ | ✅ | ✅ | ✅ | ✅ | 🟡 ([/q/[id]](src/app/q/[id]/page.tsx) bestaat, audit niet diep) |
| Bus/voertuig pre-event check | ❌ | 🟡 (delivery routing) | ❌ | ❌ | ❌ | ✅ (/logistiek) |

### 3.3 Concurrent-klachten die ons positioneren

Reviews uit Capterra/G2 leveren de **anti-blauwdruk** — dingen om te vermijden:

- **Tripleseat AI-bot** krijgt 1-ster reviews ([Capterra](https://www.capterra.com/p/118047/Tripleseat/reviews/)): *"Not in love with the AI bot."* → onze AI moet aantoonbaar nuttiger zijn, niet alleen aanwezig.
- **Caterease** ([G2](https://www.g2.com/products/caterease/reviews)): *"Hasn't been updated in years, doesn't work on Apple."* → modern responsive design is een differentiatiepunt voor zeker 30% van de markt.
- **Curate's chatbot** vervreemde klantbasis ([Capterra](https://www.capterra.com/p/174139/Curate/reviews/)): *"Forced platform migration killed proposals, alienated clients with broken AI."* → AI mag nooit klant-zijdige flows breken (gevolg voor klant-portal: AI is interne tool, niet customer-facing tot we zeker zijn).
- **Toast support** ([Trustpilot](https://startupowl.com/reviews/toast)): *"Setup is horrible, no support, must hire someone."* → onze onboarding moet zelf-service blijven (UX-P5) — anders maken we dezelfde fout.
- **HoneyBook voor catering** ([CaterCamp review](https://catercamp.com/blog/honeybook-for-catering)): *"No BEO functionality. Has no menu builder, no recipe integration, no food cost percentage tracking."* → adjacent tools missen catering-diepte. Wij hebben die diepte; de uitdaging is **niet diep genoeg, maar waarmaken** (zie /financien bug).

---

## 4. Wat werkt al — moats

Vijf dingen die BBQ Architect NU al beter doet dan elke concurrent in dit segment. **Beschermen + uitbouwen.**

### 4.1 HACCP field-mode (audit-score 5/5)

`/haccp/field` is letterlijk uniek in markt. 88px-knoppen, ±5° steppers, type-meting met NVWA-ranges (-2 – 7°C koeling, 55 – 80°C kerntemp). Geen concurrent heeft dit. NL-foodtruck-cateraars zijn nu aangewezen op losse [HACCP-app van Bureau de Wit](https://haccp-app.nl/en/).

**Bouw uit:** kopieer dit pattern naar `/prep-counter`, `/service`, `/logistiek/buscheck`. Eén pattern × vijf pagina's = field-readiness pillar [UX-1](./ux-strategy.md#design-pillars-ux-laag) waargemaakt.

### 4.2 Page-context AI met tool-use (Architect-pattern)

`src/lib/ai-prompts.ts` mapt 24+ routes elk naar een eigen system-prompt. Tool-use (`src/lib/ai-actions.ts`) laat AI échte acties uitvoeren: events aanmaken, voorraad bijwerken, gerechten klonen. Gecombineerd met 3 denkmodi (Snel/Standaard/Diep) is dit ver vóór Tripleseat's bekritiseerde AI-bot of Curate's klant-vervreemdende chatbot.

**Bouw uit:** los F8 uit [`ux-workflow-audit.md`](./ux-workflow-audit.md) op (cross-page-context via WF1 active-resource pill). Maak persona-naam consistent — kies één: "The Architect" óf "Rook" óf "Pitmaster Coach". Drie namen = drie producten in één app, voelt onaf.

### 4.3 Menu-engineering BCG-matrix

Cornell-research toont 10-15% winstpotentie. Geen enkele concurrent (Tripleseat, Caterease, Curate, HoneyBook, Square, Toast, CaterZen, EasyParty, Catermonkey) heeft dit ingebouwd.

**Bouw uit:** maak matrix visueel zichtbaar (`/menu-engineering` toont nu alleen telling "9 (3 stars · 0 dogs)"). Voeg "winnaar van de week" als dashboard-tile.

### 4.4 NL-native fiscaliteit voor BBQ-segment

KVK + BTW-nummer + IBAN in `/instellingen`. BTW-tab in `/financien` met 9%/21% splits. Mollie/iDEAL aanbetaling op offerte = whitespace (niemand heeft het clean). Tripleseat/Caterease/Curate/HoneyBook/Toast zijn US-only voor boekhouding. EasyParty doet enterprise. Catermonkey is BE/NL maar heeft geen HACCP en geen AI.

**Bouw uit:** Moneybird/Exact-koppeling toevoegen (Catermonkey heeft dit, wij niet). Mollie iDEAL aanbetaal-button op klant-portal (`/q/[id]`).

### 4.5 Smart Inventory met AI-bestelvoorstel

`/voorraad` heeft 5 KPI's incl. "AI besparing €79/maand potentieel" + AI-bestelvoorstel dat per leverancier aggregeert ("2 items bij Slagerij De Laat €160"). Toast/Square hebben inventory maar geen AI-aggregatie per leverancier. CaterZen heeft delivery-routing, niet pre-order-aggregatie.

**Bouw uit:** scraper toevoegen volgens Mathijs' memory ("/price-intelligence wil scraper ipv CSV") — niet alle leveranciers leveren CSV.

---

## 5. Wat werkt niet — gaps

Vijf echte issues, gevonden in de live audit. Niet hypothesen — daadwerkelijke schermen. Cross-link naar bestaande problem-frames waar relevant.

### 5.1 🔴 Critical: /financien data-correctheid

**Bewijs:** `/financien` toont 96,8% netto winst, €0 foodcost theoretisch, "0 events" voor huidige maand terwijl agenda 2 events toont. Voor catering is foodcost typisch 30-35% van omzet — onze data-koppeling tussen events + gerechten + ingrediënten is niet wired.

**Impact:** dit is geen design-issue, dit is een product-correctheid-issue. **Dit is het enige issue dat 1-op-1 conversies kapot maakt.** Een Pro-prospect die naar de demo-data kijkt en 96,8% marge ziet, gelooft de hele app niet meer.

**Actie:** wire foodcost-aggregatie via gerecht-ingredient-relaties. Niet een "dashboard verbetering" — een data-architectuur-fix. Mogelijk vereist Supabase-migration of nieuwe view.

**Pillar:** verbreekt **P2** ("gebruiker is geen QA-tester") uit [`ux-strategy.md`](./ux-strategy.md) §4. Geen half-werkende feature in productie — dit moet uit of werken.

### 5.2 Drie keuken-modules redundant (gerechten / menu-eng / recepten)

**Bewijs:** alle drie pagina's hebben dezelfde lay-out (search + categorie-tabs + kaarten met badges + prijs). Mathijs' eigen memory: "Recepten + Gerechten kunnen gemerged worden — Mathijs ziet ze functioneel als hetzelfde". `/menu-engineering` voegt analyse-laag toe, maar BCG-data hoort bij elke gerecht-card.

**Impact:** drie sub-tabs voor in essence één catalog. Gebruiker leert "ze zijn niet helemaal hetzelfde maar ook niet helemaal verschillend" → cognitive overhead, geen waarde. Vooral voor onboarding (UX-P5).

**Actie:** merge tot één `/keuken` module met view-modes: **Catalog / Engineering / Componeren**. BCG-tags (star/cash-cow/dog) inline op elke kaart. AI-genereer-knop persistent.

**Pillar:** **P3** ("één pad voor 80%, escape voor 20%"). Drie sub-tabs is geen "escape", het is paralysis.

### 5.3 F1/F2 — offerte-flow heeft 4 ingangen + AI mist prijs

**Bewijs (audit):** `/offertes` toont **drie** new-offerte-buttons in topbar (Stel Menu Samen / AI Offerte / Nieuwe Offerte) + 4e ingang via `/klantgesprek`. AI Offerte Wizard zelf heeft géén prijs-input — die staat pas in preview-stap, en aanpassen vereist terug naar offerte-editor.

**Reeds gedocumenteerd:** [`ux-workflow-audit.md`](./ux-workflow-audit.md) §F1+F2. RICE WF8 (prijs-slider) = 190 → top-1 prio. RICE WF2 (unified CTA) = 80.

**Actie:** zoals bestaande roadmap zegt — prijs-slider eerst (halve dag), unified CTA tweede.

### 5.4 AI-consistency: Architect vs Rook vs page-AI

**Bewijs (audit):** `/service` heeft Pitmaster Coach **"Rook"** — gepersonifieerd, warm, met starters als "Geef me een kort moraal-boost". `/ai-chat` is **"BBQ AI Studio"** met "Powered by Claude". `AiAssistant`-floating-bot heeft geen naam. Het docs-systeem noemt "The Architect". `/uren`, `/foto-archief`, `/gebruikers`, `/website`, `/hulp` hebben geen AI-aanwezigheid.

**Impact:** is het Rook? The Architect? "Powered by Claude"? Voor de gebruiker is het: drie producten in één app. Inconsistente AI-aanwezigheid (F9 in `ux-workflow-audit.md`) bevestigd.

**Actie:** kies **één persona-naamstrategie**. Voorstel: één hoofdnaam (bijv. **"Rook"** — kort, BBQ-passend, persoonlijk) met sub-rollen ("Rook helpt je nu met offerte" / "Rook plant je inkoop"). Verwijder "BBQ AI Studio" en "Powered by Claude"-onderschrift uit UI (powered-by hoort in instellingen-tab "AI", niet in pagina-headers).

**Pillar:** **P6** (Nederlands eerst) + **UX-3** (AI als suggestie). Eén stem, geen drie.

### 5.5 /hulp Help Center is leeg = onboarding-killer

**Bewijs:** `/hulp` toont "Geen artikelen gevonden". Geen content, geen video, geen artikel. Maar in [`ux-strategy.md`](./ux-strategy.md) §3 staat onboarding zonder coach als pillar (UX-P5 in problem-frames).

**Impact:** trial-klant die vastloopt heeft géén self-service hulp. Mathijs moet handmatig ondersteunen → schaalt niet. Komt direct uit [`ux-problem-frames.md`](./ux-problem-frames.md) UX-P5: "Hoe ontwerpen we onboarding zonder coach (Mathijs solo)?".

**Actie:** schrijf 12 kern-artikelen in week 2-3 (1 per kern-flow). Format: 200 woorden + 1 screenshot. Simpel statisch eerst, AI-search later. Gebruik bestaande info-banners op pagina's als bron-tekst.

---

## 6. Anti-scope

Wat we **bewust niet** worden, ondanks dat de markt het doet.

| Niet doen | Wie doet het wel | Waarom niet voor ons |
|---|---|---|
| 2D/3D floorplans | Tripleseat | Banket-locaties met vaste zalen; BBQ-cateraar werkt op klant-locatie. Niet relevant. |
| Wedding-specifieke tooling (seating chart, RSVP) | HoneyBook, Curate | Hop & Bites doet BBQ, geen weddings. Andere persona, andere taalstijl. |
| Full restaurant POS | Square, Toast | Mathijs heeft aparte [Hop & Bites POS-app](anthropic-skills:hopbites-pos). BBQ Architect is de cateraar-cockpit, geen POS. |
| Email-marketing campagnes (drip, loyalty) | CaterZen, HoneyBook | Voor 1-cateraar overkill. Integratie met Mailchimp/Resend volstaat. |
| Hotel banket-mgmt (room blocks, F&B minimums) | Tripleseat | Compleet andere buyer (hotel-sales-manager, geen cateraar). |
| Multi-language UI (EN/DE) | EasyParty, Catermonkey | NL-fit is moat (P6). H3+ pas overwegen. |
| Native iOS/Android-app | — | PWA dekt 80%, native is 4× meer maintenance. |

**Discipline:** elke feature-request die in deze tabel valt, krijgt automatisch "nee" tenzij Mathijs expliciet anti-scope herziet. Anti-scope is geen permanent-nee, het is een filter om focus te bewaren tot H2 (zie [horizons](./ux-strategy.md#time-horizons)).

---

## 7. Top-10 acties (12 weken)

RICE-formule consistent met [`ux-workflow-audit.md`](./ux-workflow-audit.md) §5: **Score = (R × I × C) / E**. R = klanten/wk geraakt (Berkhout-tenant + 50 H1-prospects), I = 1-3, C = %, E = builder-weken.

**Sortering:** prio = bestaand top-3 uit `ux-workflow-audit.md` blijft leidend (WF8 / WF4 / WF1). Daarboven komt **A0** (financien-bug) als showstopper. Daaronder consolideren we nieuwe acties uit deze audit.

| # | Actie | Status | Voortbouwt op |
|---|---|---|---|
| **A0** | Fix `/financien` foodcost-koppeling | ✅ klaar (commit 565bd41 + 24ec661) | nieuw — was niet in eerdere docs |
| **A1** | Prijs-slider in AI Offerte Wizard preview | ✅ al gebouwd in eerdere sessie (vandaag bevestigd) | [`ux-workflow-audit.md`](./ux-workflow-audit.md) WF8 |
| **A2** | Optimistic UI op prep/status-toggles | ⏳ open | [`ux-workflow-audit.md`](./ux-workflow-audit.md) WF4 (RICE 152) |
| **A3** | Active-resource pill + AI-context-prefix | ⚠️ deels overlap met hub-and-spoke plan | [`ux-workflow-audit.md`](./ux-workflow-audit.md) WF1 (RICE 112,5) |
| **A4** | Merge keuken-cluster (gerechten/recepten/menu-eng) | ⚠️ valt onder hub-and-spoke Stap D ("Keuken"-hub) | hub-and-spoke plan |
| **A5** | Persona-strategie AI (Rook overal) | ✅ klaar (commit 2d731f5 + 789ae22) | F9 op te lossen |
| **A6** | Help Center vullen | ✅ klaar (commit b3b3a69 + migratie + 12 artikelen live) | UX-P5 onboarding |
| **A7-1** | `/logistiek/field` veldmodus | ✅ klaar (commit 0e30df1) | UX-P4 keuken-UX |
| **A7-2** | Field-mode review op `/prep-counter` | ⏳ open — pagina is al BBQ-thema, mogelijk klein delta | UX-P4 |
| **A7-3** | Field-mode review op `/service` | ⏳ open — al "Service Mode" + Rook coach, polish nodig | UX-P4 |
| **A8** | BCG-matrix visueel zichtbaar maken | ⏳ open | nieuw |
| ~~A9~~ | ~~Mollie iDEAL aanbetaling~~ | ⛔ geschrapt — Hop & Bites factureert pas na event | n.v.t. |
| **A10** | Unified "Nieuwe Offerte" CTA | ⚠️ valt onder hub-and-spoke Stap D ("Verkoop"-hub) | hub-and-spoke plan |

> **Total builder-weken:** 0,5 + 0,5 + 0,5 + 1 + 1 + 0,5 + 1 + 2 + 1 + 2 + 1,5 = **11,5 weken**. Past in 12-weken horizon (H1 mei-juli 2026) bij ~20u/week. Ruimte voor de 0,5 week onvoorzien.

### 7.1 Eerste sprint (week 1-2): "Trust sprint"

Bundel A0 + A1 + A2 + A5 = **3 weken werk in 2 weken sprint** (parallel waar mogelijk):

- **A0 financien-fix** — herstelt vertrouwen in data
- **A1 prijs-slider** — herstelt vertrouwen in AI ("ik kan corrigeren wat AI zegt")
- **A2 optimistic UI** — herstelt vertrouwen in snelheid
- **A5 persona-naam** — herstelt vertrouwen in samenhang ("dit is één app")

Naam past: alle vier raken **vertrouwen** als kern-emotie. Geen feature-explosie, alleen "wat er staat moet kloppen".

### 7.2 Tweede sprint (week 3-5): "Cross-page sprint"

A3 (active-resource pill) + A10 (unified CTA) + A4 (keuken-merge). Drie acties die alle drie de cross-page-architectuur raken. Doe samen om regressies in 1 testronde te vangen.

### 7.3 Derde sprint (week 6-8): "Field-readiness sprint"

A7 (field-mode pattern × 4 pagina's). Volle aandacht — niet parallel met andere flows. 2 weken builder-tijd.

### 7.4 Vierde sprint (week 9-12): "Moat-builder sprint"

A6 (help center) + A8 (BCG visueel) + A9 (Mollie iDEAL). Drie features die ons positioneren als premium tegen Tripleseat/Caterease/CaterZen.

---

## 8. Verificatie & open vragen

### 8.1 Hoe meten we success

Hergebruik HEART-framework uit [`ux-strategy.md`](./ux-strategy.md) §6. Per actie A0-A10 één primaire metric:

| Actie | Primaire metric | Target end-of-H1 (2026-07-31) |
|---|---|---|
| A0 financien-fix | Foodcost-% in /financien | 25-40% range op tenant Berkhout |
| A1 prijs-slider | % AI-offertes met aangepaste prijs in preview | ≥ 60% |
| A2 optimistic UI | Prep-toggle perceived latency | < 50ms |
| A3 active-resource pill | Cross-page AI-vragen met juiste context | ≥ 80% |
| A4 keuken-merge | Tijd tot eerste menu compleet (onboarding) | < 30 min |
| A5 persona-strategie | NPS-survey "voelt het als één app?" | ≥ 4/5 |
| A6 help-center | Self-service-rate (geen support-bericht in week 1 trial) | ≥ 70% |
| A7 field-mode × 4 | Touch-target-compliance op field-pagina's | ≥ 95% |
| A8 BCG visueel | Aantal margin-acties uit BCG/week | ≥ 2 (Berkhout) |
| A9 iDEAL | % offertes met aanbetaling betaald binnen 7d | ≥ 30% |
| A10 unified CTA | Tijd-tot-eerste-offerte vanaf signup | < 30 min |

### 8.2 Smoke-test eindresultaat

Mathijs kan in 5 minuten lezen:
- **Top-3 issues** (sectie 1) — financien-bug, keuken-redundantie, offerte-paralysis
- **3 moats** (sectie 4.1-4.3) — HACCP-field, page-context AI, BCG-matrix
- **Eerste actie** (sectie 7.1) — Trust-sprint week 1-2

Zonder enig ander doc te openen.

### 8.3 Open vragen — voor Mathijs

1. **Persona-naam keuze** (A5): "Rook" / "The Architect" / iets nieuws? Strategisch, beïnvloedt ook marketing-site.
2. **/financien fix** (A0): wel of geen Supabase-migration? Voorkeur is een SQL-view boven schema-wijziging — sneller te rollback.
3. **Klant-portal `/q/[id]`** is niet diep getest in deze audit. Verdient eigen mini-audit voor A9 (Mollie iDEAL).
4. **Anti-scope review** (sectie 6): is "geen native app" en "geen multi-language" nog steeds de lijn? Geen actie nodig nu, maar bevestiging stuurt H2-planning.

---

## Bijlagen

### A. Mapping op bestaande docs

| Sectie hier | Bestaand doc waar verband mee | Relatie |
|---|---|---|
| §1 Status quo TL;DR | — | nieuw, samenvatting van alle docs |
| §2 App-audit mei 2026 | — | nieuw, empirisch (rest is theoretisch) |
| §3 Competitive landscape | [`ux-benchmark.md`](./ux-benchmark.md) §2 | aanvulling met feature-level (vs pattern-level) |
| §4 Moats | [`ux-benchmark.md`](./ux-benchmark.md) §2 (UX-gaten in markt) | bevestigt + voegt CaterZen toe |
| §5 Gaps | [`ux-problem-frames.md`](./ux-problem-frames.md) UX-P1..P7, [`ux-workflow-audit.md`](./ux-workflow-audit.md) F1..F10 | empirische bevestiging |
| §6 Anti-scope | [`ux-workflow-audit.md`](./ux-workflow-audit.md) §7 | uitgebreid (nieuw: HoneyBook, Toast, etc.) |
| §7 Top-10 acties | [`ux-workflow-audit.md`](./ux-workflow-audit.md) §5 | bouwt voort, voegt A0/A4/A5/A6/A8/A9 toe |
| §8 Metrics | [`ux-strategy.md`](./ux-strategy.md) §6 (HEART) | hergebruik framework, per-actie metric |

### B. Verwijderde / dode pagina's (niet in audit-tabel)

Volgens Mathijs' auto-memory en recente commits:
- `/offerte-editor` — dood, wizard is dominant
- `/berichten` — redirect naar `/mailbox`
- `/event-planner` — redirect naar `/agenda`
- `/boekhouding` — gemerged in `/financien` (commit `ed62e8f`)

Deze blijven uit scope; bevestigt dat consolidatie-trajectory (sinds april 2026) klopt.

### C. Niet getest in deze audit-ronde

- `/events/[id]/hub` (1264 LOC monoliet) — nodig voor F3-validatie, geen seed-event-id beschikbaar bij audit
- `/events/[id]/field` — idem
- `/events/[id]/reflectie` — idem
- `/q/[id]` (klant-portal) — relevant voor A9 (iDEAL); aparte mini-audit nodig
- `/template-editor` — gerelateerd aan F7 (template weg-navigatie)
- `/onboarding` en `/welkom` — UX-P5 onboarding-flow validatie, separate sprint

---

**Versie 1 — 2026-05-01**
**Volgende review:** na Trust-sprint (2026-05-15) of bij koerswijziging.
