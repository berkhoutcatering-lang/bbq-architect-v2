# 38 prompts voor Claude.ai Design System

Plak per tool het blok in Claude.ai Design System chat-vak (Opus 4.8). Tokens + brand-DNA komt uit je bestaande Skill, dus alleen functioneel + UX hoeft hier.

**Master-context** (eenmaal aan begin van elke nieuwe chat plakken):
> Je bouwt een tool voor BBQ Architect. Gebruik de bestaande BBQ Architect Design System tokens (`tokens.css`), brand-DNA (dark + gold + glass, Dutch casual-je, pitmaster metaphor, Lucide icons), 8 OKLCH-presets via Tweaks panel. Output: live mobile + desktop centerpiece + key states. Functional flow + acceptance hieronder.

---

## ✅ Al klaar — in je huidige Design System (skip)

- **01** Aanvraagpagina (`/aanvraag/[slug]`) — `lead-app.jsx` + `lead-form.jsx`
- **04** Offerte-detail (`/offertes/[id]/view`) — `offertes-detail.jsx`
- **05** Offerteportaal (`/q/[token]`) — `portal-app.jsx` + states
- **26** Workforce & Uren v3 (`/uren`) — `uren-v3.jsx`

---

## 🚧 Nog te bouwen — 34 prompts

### Tool 02 — Lead-pijplijn `/verkoop/leads`
> Kanban met 5 kolommen (Nieuw / In gesprek / Offerte / Gewonnen / Verloren). Per lead-card: naam + event-type + datum + gasten + locatie + budget + "X uur geleden". Drag-tussen-kolommen flipt status. Klik card → right-drawer met: contact, event-details, AI-concept (3 menu-suggesties via Claude), "Maak offerte"-CTA → handoff naar Tool 03 via localStorage. View-toggle Kanban/Lijst (TanStack Table). Search + filter. Bulk-acties via long-press. Empty-state: "Deel je aanvraag-link". Niet-gereageerd>24u = oranje pill op kolom Nieuw.
**Acceptance:** drag werkt op touch, drawer-open <100ms, AI-concept <5s, conversion-stats in header.

### Tool 03 — Offerte-wizard `/offertes?wizard=true`
> Modal (fullscreen mobile, 720px desktop), 4 stappen met step-indicator: (1) Klant-autocomplete + datum + gasten + waarvan vega + aantal gangen; (2) Genereer met AI / template / leeg; (3) Menu-canvas met Citation-pills per gerecht "[uit: Pulled Pork]" — drag-reorder, marge-pill live, edit-drawer per regel; (4) BTW-overzicht + persoonlijk bericht + 3 CTAs (concept/genereer link/mail direct). Cancel-X met "Concept opslaan?"-confirm.
**Acceptance:** AI ≤10s, Citation-pill verplicht per regel (geen hallucinatie), BTW server-side, marge kleur-coded ≥55%/35-55%/<35%, link-copy direct werkt.

### Tool 06 — Event-hub Overzicht `/events/[id]/hub`
> 7-tab nav binnen event-context (Overzicht / Klantgesprek / Prep / HACCP / Logistiek / Service / Reflectie). Hero met countdown-circle (rood <3d, geel <7d, groen >7d) + KPI-strip (gasten/omzet/marge/prep-ready/saldo). Action-row: "Start event op locatie" / "Start service" / "Bewerken". Documenten-grid 4-cards (Offerte/Factuur/Prep/HACCP — factuur subtitle "✨ Klaar om te versturen" als event=completed + reflectie ingevuld). AI quick-prompts contextueel naar event-fase. Voorbereiding-tracker 5 mijlpalen.
**Acceptance:** error-boundary catched date-parse-crash, 7-tabs stateful, prep-progress live, factuur-CTA flipt status bij click.

### Tool 07 — Klantgesprek-tab `/events/[id]/hub#klantgesprek`
> Sub-tab binnen event-hub. Twee-koloms: LEFT BlockNote rich-text editor met voice-record (MediaRecorder) + audio-upload drop-zone; RIGHT gestructureerde fields (sfeer-chips / allergieën-multiselect / dieet / drank-radio / levertijd / locatie / breakdown). Action: "AI-extract uit notities" → fields fill met preview-confirm. Cross-event-history sidebar: laatste 5 gesprekken met deze klant.
**Acceptance:** auto-save 30s, audio max 25MB, AI cost-indicator vooraf, geen PII zonder consent.

### Tool 08 — Event field-mode mobiel `/events/[id]/field`
> Lars-flow tablet/mobiel, "3 grote knoppen voor de avond". Header sticky met event + offline-pill. Hero 50vh: GROOT countdown "00:45:23 tot service" mono font 64px + progress-ring. 3-grid action-buttons: Punch in/out / HACCP-check / Prep-status. Secondary accordion: menu / klantgesprek-summary / logistiek. Bottom: "Event afgelopen" → markeert completed + opent Reflectie.
**Acceptance:** touch-targets ≥56px, font body ≥18px, WCAG AAA contrast 7:1, wake-lock active, IndexedDB write-queue offline, vibration-API feedback.

### Tool 09 — Finance Copilot `/financien`
> Tabs Financiën/Uren/Bonnen/Boekhoud-archief/Ritten + sub-tabs Dashboard/W&V/Uitgaven/BTW/Aangifte/Cashflow/Top-Klanten + jaar-selector. Hero: AI Copilot-card met streaming Sonnet-insight ("Je staat op €22.561 YTD met €0 foodcost — netto-marge 99,9% klopt niet, wil je dat ik kijk?") + 4 contextuele quick-prompt-chips. KPI-strip 5 cards. Bar/line-charts Recharts. Transport-widget + Markt-Pulse [PRO] paywall-card.
**Acceptance:** Copilot <8s p95 met cached prompt-prefix, AI rekent NOOIT BTW, AI-cost-cap zichtbaar.

### Tool 10 — Event-reflectie `/events/[id]/reflectie`
> Hero "Hoe ging het? 1-10" slider met smiley-emoji per stap + gradient rood→groen. Templated vragen: "Wat ging goed?" / "Wat kan beter?" / "Actie-items" (checklist). Klant-feedback section: vrij textarea + "Polish voor website"-button (Haiku rewrite met diff-view accept). History-sidebar laatste 5 reflecties + score-trend mini-chart. Triggert factuur-CTA op event-hub na invullen.
**Acceptance:** auto-save 30s, score<7 promptt voor oorzaak, AI rewrite preserves intent.

### Tool 11 — Agenda `/agenda`
> FullCalendar Maand/Week/Lijst-toggle met NL-locale, week-start maandag. Top-KPI-strip 5 cards: Komende 30d / Omzet pipeline / Prep open / Vrije weekends / Conflicten (rood). Sidebar "Mijn agenda's" toggleable (Events/Prep/Persoonlijk). Event-pins kleur-coded per status, hover tooltip, klik → event-hub. Drag-to-other-date update date. Conflict-pin rood bij overlap. AI Insights-knop opent drawer met today-briefing.
**Acceptance:** drag op touch werkt, mobile default Lijst-view, iCal-export future.

### Tool 12 — Events lijst `/events`
> Tabel + 5 status-filters (Concept/Optie/Bevestigd/Afgerond/Geannuleerd). Cols: Datum/Naam/Klant/Locatie/Gasten/Omzet/Status. Bulk-select + action-bar (archiveer/template-mail/CSV-export). Klik row → event-hub. "Naamloos event"-placeholder met warning-icoon bij lege name (data-hygiene). Search + sort.
**Acceptance:** sort default datum DESC, paginatie >50 events, mobile = kaart-list.

### Tool 13 — Klant-detail `/klanten/[id]`
> Drawer of route. Hero met avatar + naam + type-pill (Particulier/Zakelijk/Festival/Horeca) + "Klant sinds {datum}". Contact-card (email/tel/adres) + Bel/Mail/WhatsApp quick-actions. KPI-strip 3: Offertes/Events/Totale waarde. Historie-blokken (Events/Offertes/Facturen, max 5 + "Alle {N} bekijken"-link). AI-context-card: "Vorige catering: BBQ-feest 40 gasten — wil je follow-up?". Notes BlockNote auto-save.
**Acceptance:** "alles zien"-links per categorie, mobile = full-screen modal.

### Tool 14 — Gerecht-detail + 3 modals `/gerechten/[id]`
> 2-koloms: LEFT foto-upload + receptuur BlockNote; RIGHT fields (naam/gang/categorie/yield/bereidingstijd/allergens-pills/ingredient-tabel/kostprijs/verkoop/marge-pill). Action-bar: Bedenker (Haiku fill leeg) / Pitmaster (Sonnet coaching streaming) / Allergen Queue (cascade-detector) / Foto-AI (Opus vision). Marge-kleur: groen ≥55%, oranje 35-55%, rood <35%. Allergens uit join (NOOIT AI-text), cost via trigger cascade.
**Acceptance:** Bedenker geen allergens, Pitmaster geen auto-apply, foto max 10MB.

### Tool 15 — Componenten library `/gerechten/componenten`
> Sub-tab nav. 4 actions top: AI Genereer / Bedenker Studio / Nieuw / Importeer leverancier. Hero stat-circle "9 COMPONENTEN — 0% via AI". Tabel met filter-pills (Alle/Zelf-bereid/Inkoop/Per leverancier). Cols: Naam/Categorie/Cost/Allergens/Used-in-N/Bron. Edit-drawer met cascade-graph visualisatie + impact-preview "Wijzigt cost van 5 gerechten". Importeer-flow met AI parse-pricelist + Sam confirms bulk.
**Acceptance:** cascade trigger werkt, allergens human-confirm queue, pg_trgm search autocomplete.

### Tool 16 — Gerechten analyse `/gerechten/analyse`
> View-toggle Performance/Health. PERFORMANCE: BCG-matrix scatter-chart, x=verkoop-volume y=marge%, 4 kwadranten Stars/Cows/Questions/Dogs, dot=gerecht. Hover tooltip, klik = drilldown. HEALTH: allergen-heatmap tabel (gerechten × allergens) kleur-coded rood/grijs/groen. Insights-sidebar "Top 3 acties" met concrete CTAs (schrap/verhoog-prijs/vul-allergens).
**Acceptance:** werkt vanaf 5 events anders empty-state, mobile = stack lijstjes.

### Tool 17 — Menukaart-editor `/gerechten/menukaarten/[id]`
> 2-koloms: LEFT editor (template-naam / layout-picker carousel 10 templates / gangen-secties met drag-reorder gerechten / sectie-introductie BlockNote per gang). RIGHT live preview iframe naar /e2e-test/menukaart/[id] met PDF-mode toggle A4/A5/Square. Action-bar: Save/Preview/Delete/Dupliceer/Pas-toe-op-offerte. 10 layouts: Rustic/Modern/Elegant/Editorial/Minimal/Square/Invite/Duotone/Festival/Wedding.
**Acceptance:** PDF deterministic, allergens uit cascade, theming via tokens.

### Tool 18 — Voorraad-detail `/voorraad/[id]`
> 3-koloms grid: STOCK-CARD (huidig vs par-level slider, last counted, "Tellen" CTA). PRIJSHISTORIE (Recharts line 12 punten per leverancier kleur, trend-indicator). LEVERANCIERS (hoofd + alternatieven met price-delta, "AI Substitution-advice" knop). GEBRUIKT-IN (gerechten-cascade-back-link + voorspelde behoefte 30d). Sticky-bottom "Bestel"-CTA bij below-par.
**Acceptance:** par-level rood bij current<min, history min 6 punten anders empty.

### Tool 19 — Inkoop `/inkoop`
> Tabs: Open / Concept / Geleverd / Geannuleerd. Tabel-cols: Order# / Leverancier / Datum / Items / Totaal / Status. "Genereer voorstel"-button (AI berekent uit events × ingredients × yields). PO-detail drawer met items-tabel edit-able + "Verstuur naar leverancier" Resend mail + "Plaats via API" toekomst. Bon-match flow: drag bon → AI parse → diff-view PO vs bon → confirm = inventory + price_history update.
**Acceptance:** AI-voorstel met confirm vóór order, idempotent supplier-match.

### Tool 20 — Leverancier-detail `/leveranciers/[id]`
> Header met contact + sync-status pill. Tabs: Producten / Prijsmutaties / Aliassen / Sync-runs. PRODUCTEN tabel met "Used in N gerechten". MUTATIES chronologisch met >5% filter + AI-impact-analyse. ALIASSEN mapping leverancier-naam → component-id met AI-suggesties Sam confirms. SYNC-RUNS chronologisch met start-knop (Chrome extension trigger).
**Acceptance:** aliassen voorkomen dup-components, sync-runs detailed error-log.

### Tool 21 — Boekhouder maandpakket `/geld/boekhouder`
> Tabs in Geld-hub. Maand-selector. KPI-strip 4: Omzet/Uitgaven/BTW saldo/Tijd. 4 categorie-blokken accordion (Facturen/Bonnen/Uren/Ritten) elk met items-tabel + RGS-categorie-pill + "AI Classify"-button bulk-classify Haiku. Pakket-builder sticky-rechts: "Pakket samenstellen" → PDF+ZIP+CSV+Resend mail naar boekhouder-email + confirm-dialog "Lock alle facturen+bonnen?".
**Acceptance:** RGS Sam-confirms, lock-mechanism via locked_at, cron dag-3-na-maand.

### Tool 22 — Rittenregistratie `/administratie/rittenregistratie`
> Tabs in Geld-hub. Header "Rittenregistratie" + maand-selector + "Nieuwe rit". KPI-strip: Totaal km / Aftrekbaar / Aantal / Events gedekt (warn als 0/N met koppel-CTA). Tabel met Datum/Van/Naar/Km/Doel/Gekoppeld-event/Acties. Nieuwe-rit modal met event-dropdown (uit events.date matching ±3d) + "Scan dashboard-foto" (Opus vision). Moneybird-push sticky bottom (idempotent UNIQUE). Banner "Vergeten ritten" cron-detected.
**Acceptance:** €0.23/km server-side constant, AI-scan optioneel.

### Tool 23 — HACCP veldmode `/haccp/field`
> Landscape tablet primair. Header sticky met event + offline-pill + user-naam. Hub-grid: per CCP big card (Vlees kerntemp / Koel-traject 4°C / Hete-buffet 60°C+ / Reiniging). Per card: big temp-input numpad (60px touch) + tijd auto-prefill + camera-button voor evidence + groene "Log"-CTA + history laatste 3 entries. Anomaly-detect AI na save: toast met corrective-action-prompt verplicht.
**Acceptance:** WCAG AAA 7:1 contrast, touch ≥56px, foto verplicht voor critical CCP, records tamper-evident (geen edit na 1u).

### Tool 24 — Keuken kookbord `/keuken/kookbord`
> Landscape tablet, horizontal scrollable kolommen per station (Pekel/Smoker/Cold/Plating). Per kolom 320px wide met station-header + counter + filter Vandaag/Komende 3d. Task-cards 192×120 met gerecht-naam + qty + dagen-indicator + big checkbox 56×56 + beschrijving + swipe-right=done (haptic). Drag-tussen-stations re-assign. Real-time sync via Supabase realtime channel. AI logistics-checklist-generator.
**Acceptance:** real-time <500ms, KDS-session-token per device, drag-keyboard fallback.

### Tool 25 — Service plattegrond `/events/[id]/service/plattegrond`
> 2-koloms: LEFT tools (tafel-types Rond6/Rond8/Lang10/Cocktail/Bar/Podium + zones + pan/zoom/grid). CENTER Konva-canvas met grid + drag tafels. RIGHT gasten-lijst met dieet-pill per gast + drag-naar-tafel assignment. AI Suggest Layout: "Vega-cluster tafel 3, allergie-cluster tafel 5" preview-confirm. Save debounced 2s naar floor_plans.canvas_json. Privacy-cron anonimiseert guest-data 30d post-event.
**Acceptance:** canvas tabular-alternative (a11y), guest-data privacy-cron actief.

### Tool 27 — Bonnen camera-upload `/bonnen` (mobiel)
> Mobile-primary. Header "Bonnen scannen" + offline-pill. Hero full-width camera-preview 50vh met live edge-detection overlay + "Maak foto" centrale knop 80×80. Alternatieve inputs chips: Galerij / Paste UBL-XML (⌘V) / PDF. Na scan: preview croppable + "Verzend voor analyse" CTA → Rook leest 5s skeleton-fields preview (leverancier/datum/totaal/items/BTW-splits/RGS-categorie) → Sam edits → Save naar bonnen + inventory + price_history.
**Acceptance:** ⌘V werkt, UBL 0-cost direct parse, BTW server-side, bon-hash dedup.

### Tool 28 — BottomNav mobile-flow
> Fixed-bottom 60-72px met 5-grid horizontal: 🏠 Vandaag / 📅 Plannen / 🛒 Verkoop / 🍳 Menu / ⋯ Meer. Per tab icon top + label bottom 11px + counter-badge (Plannen=events vandaag, Verkoop=nieuwe leads). Active = kleur-coded background + filled-icon. "Meer"-overlay sheet rechts met Voorraad/Geld/Systeem + ⌘K + account. Hidden op /q/[token], /aanvraag/[slug], /arrangement/[slug], /login.
**Acceptance:** safe-area-bottom respect (notch), long-press = quick-actions, hidden >900px (sidebar takes over).

### Tool 29 — Instellingen `/instellingen`
> Sub-tab nav Systeem-hub. Sections (anchor-scroll links): Bedrijfsgegevens (KVK 8digits+validate / BTW NL-format / eigenaar / oprichtingsjaar) / Branding (logo-upload max5MB + tagline + 8-preset ThemePicker + AdvancedColorEditor met 5 OKLCH-sliders + APCA contrast-pills WCAG AA/AA+/Faal live) / Contact-SLA / Locatie (PostNL autocomplete + radius) / BTW-Financieel (IBAN mod-97 + read-only BTW-tarieven). "Preview op voorbeeld-offerte"-button.
**Acceptance:** theming cascadet zonder rebuild, alle validaties live, geen manual BTW-edit.

### Tool 30 — Integraties `/instellingen/integraties`
> Grid 3-koloms cards per service (Moneybird/Mollie/Google Calendar). Per card: logo + naam + 1-zin + status-pill (✅verbonden+timestamp / ⚠️verlopen+Reconnect / ❌niet-verbonden+Connect) + Config-knop → drawer met account-info + sync-historie laatste-10 + "Test verbinding"-ping + "Verwijder koppeling"-confirm. Chrome Extension API-keys aparte sectie met rotate-flow.
**Acceptance:** API-keys nooit in URL/localStorage, OAuth-redirect met confirm-toast, test-knop 1-shot ping.

### Tool 31 — Gebruikers `/gebruikers`
> Sub-tab Systeem-hub. Tabel met Naam/Email/Rol/Uurtarief/Status/Laatst-actief/Acties. 3 rol-pills kleur-coded: Admin gold / Pitmaster silver / Medewerker basic. Invite-modal: email-input multi + rol-dropdown + bericht + Resend-mail magic-link. Edit-drawer per user: rol-change Admin-only / uurtarief snapshot audit / disable-toggle (session-revoke). Pending invites lijst onder met re-send/cancel.
**Acceptance:** rol-change Admin-only (UI + RLS), uurtarief-snapshot via audit_log, inactive≠delete.

### Tool 32 — Mailbox `/mailbox`
> Sub-tab Systeem-hub. Sub-tabs Verzonden/Nieuwe/Templates. VERZONDEN: filter-pills + search + tabel Datum/Klant/Onderwerp/Categorie/Status (Verzonden/Bezorgd/Geopend/Gebounced via Resend webhook). NIEUWE composer: klant-cmdk + template-picker + variabelen `{{naam}}` `{{datum}}` Mustache-replace + BlockNote body + attachments auto-attach PDF + preview-before-send. TEMPLATES tabel + nieuw-button per categorie (Vrij/Offerte/Factuur/Herinnering).
**Acceptance:** Resend voor alle outbound, variabelen server-side replace (anti-XSS), audit-log per send.

### Tool 33 — Website-editor `/website`
> Sub-tab Systeem-hub. 2-koloms split: LEFT section-editor (Hero/Over-ons/Menu-preview/Galerij/FAQ/Contact); RIGHT live preview-iframe naar /{slug}?preview=1 met Desktop/Mobile-toggle. Per sectie: BlockNote-text + photo-upload. Publish-knop sticky met confirm "Live op {slug}.bbq-architect.nl". Domain-settings Enterprise-only met DNS-uitleg + SSL-status.
**Acceptance:** theming cascadet, foto max 10MB, publish triggert revalidation.

### Tool 34 — Help center `/hulp`
> Sub-tab Systeem-hub. Hero met grote search-bar + instant-results dropdown (max 8 hits). Homepage met "Meest gelezen" top-5 + categorie-grid per hub. Article-page /hulp/[slug] met BlockNote-content + screenshots + sidebar gerelateerde artikelen + "Was nuttig?"-feedback. AI-help drawer rechts: vraag-input → streaming Sonnet response + Citations "Pulled from: artikel X" + history laatste-5 + "Mail Sam"-fallback bij onbeantwoord.
**Acceptance:** AI streamt + Citations geen hallucinated steps, feedback in help_article_feedback, pg_trgm search.

### Tool 35 — Platform admin `/admin`
> ALLEEN PLATFORM_ADMIN_EMAILS env-check. Sub-pages: Overzicht/Organisaties/Health/Funnel/AI-cost/Feature-flags/Retention/Tickets. ORGANISATIES tabel: Naam/Tier/Sinds/Users/MRR/Health-score/Last-active/Acties. Per-org actions: Impersonate (cookie + redirect + banner + audit-log) / Suspend / Manual billing / AVG-export Article15 / AVG-delete Article17 cascading. AI-COST per-tenant + cap-violation-warning + "Suspend AI"-action.
**Acceptance:** Impersonate audit-log verplicht, AVG-delete crypto irreversible, cost-cap server-side enforced.

### Tool 36 — Onboarding `/onboarding`
> Full-page (geen sidebar). 3 fases: (1) PersonaQuiz modal 3 vragen + Overslaan saved in settings.persona_result; (2) Welkom-screen met loading-bar demo-seed POST /api/onboarding/seed-demo idempotent; (3) Checklist 4 items sticky-bar met progress (eerste-gerecht/eerste-offerte/eerste-klant/theming). 7-day check = "Activated"-KPI + Resend welkom-mail "3 power-tips".
**Acceptance:** persona-state cross-device (settings ipv localStorage), seed idempotent, track() fire-and-forget.

### Tool 37 — Klantgesprek-extractor `/klantgesprek`
> Centraal-canvas full-width focus. 2 zones: ZONE 1 notities groot (BlockNote + voice-record MediaRecorder + audio-upload max 25MB). ZONE 2 AI-output collapsible rechts: "Extract met AI"-CTA → loading 8-12s → streaming parsed-fields (klant/email/tel/datum/gasten/locatie/type/dieet/budget/bericht) edit-able. Acties: Maak lead / Maak offerte / Bestaande klant match-op-email / Alleen bewaren. Cross-event-history sidebar laatste 5 gesprekken.
**Acceptance:** audio+notities cleanup 30d (AVG), AI Sam-confirms, match-email vóór nieuwe klant.

### Tool 38 — AI Chat `/ai-chat`
> 3 entry-points: full-page /ai-chat + ChatPanel sidebar per-page block-first + ⌘K Vraag-Rook ephemeral. FULL-PAGE: sidebar thread-folders + main chat-stream met streaming-cursor + action-cards klikbaar + code-blocks. Footer input textarea auto-grow + model-picker (Haiku/Sonnet/Opus) + thinking-toggle + file-attach. CHATPANEL contextueel pre-filled questions per page. TOOL-USE: AI suggesteert action → audit-log in ai_action_proposals → Sam confirms → result-toast. RESPOND_WITH_BLOCKS rendert nav_card/action_card/info_block/metric_block.
**Acceptance:** customer-input delimiters (OWASP LLM01), cost-cap server-side, rate-limit 30/min/user, cached prompt-prefix 90% off cache-hits.

---

## Workflow per tool

1. Open nieuwe chat in Claude.ai Design System
2. Plak **master-context** (bovenaan dit doc) als eerste bericht
3. Plak het tool-blok als tweede bericht
4. Claude bouwt → review canvas → export ZIP
5. Hernoem ZIP naar bv. `tool-06-event-hub.zip` voor traceability

## Bundle-tip

Plak alle 34 in **één keer** in 1 chat als je wilt dat Claude een **interconnected systeem** maakt (knoppen tussen tools verwijzen naar elkaar). Beter resultaat dan 34 losse chats — kost wel meer tokens.

## Stop-criterium

Als Claude in een tool 3× achter elkaar dezelfde fout maakt (verkeerde tokens / geen brand-DNA): wissel naar nieuwe chat, plak master-context opnieuw. Cache-hit-rate herstelt zich daarna.
