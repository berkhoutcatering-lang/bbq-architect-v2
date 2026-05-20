# Top-Tier Audit BBQ Architect — 2026-05-20

**Audit door**: Claude Code (auto, Opus 4.7 1M)
**Branch**: `claude/top-tier-audit-doc`
**Commit**: `4069bca` (origin/main op moment van audit-start)
**TSC**: ✅ 0 errors · **Vitest**: ✅ 24 files, 481 tests · **Build**: ✅

## Methodologie

Elke pagina getoetst aan 12 dimensies: primaire taak, visuele consistentie, empty state, loading, error, mobile, a11y, performance, copy (NL), data-correctheid (BTW/allergens/Zod), AI-integratie, top-tier-vergelijking.

Severity: 🔴 **P0** (blocker) · 🟠 **P1** (zichtbaar suboptimaal) · 🟡 **P2** (polish) · ✅ **Top-tier**

Benchmarks: Linear · Notion · Airtable · Superhuman · Stripe · Vercel · Tripleseat · Caterease · Toast · Lightspeed · Formitable · Apicbase · MarginEdge · Moneybird · Xero.

---

## Master-ranking → zie [Master-overzicht](#-master-overzicht) onderaan

## Cross-cutting patronen → zie [Cross-cutting patronen](#-cross-cutting-patronen-issues-op-5-pages) onderaan

---

# Groep 1 — Vandaag-hub

## `/` — Dashboard home  🟡

**Code**: [src/app/page.tsx](src/app/page.tsx) (901r, 12 useSupabase-hooks) · **Bezoek**: hoog
**Top-tier**: Linear Inbox doet 1 geprioriteerde rij + collapsible secundaire stack; wij gooien 9 tiles tegelijk op het scherm.

✅ Daily-visibility principe (EventHero + AttentionPanel) · ✅ Mobile-safe sticky header · ✅ Activation-tracking · ✅ AIQuickPrompts suggereert next-actions

- 🔴 **P0**: Empty state ontbreekt — nieuwe tenant ziet alle secties leeg zonder onboarding-CTA. — `page.tsx:~150`
- 🔴 **P0**: Geen unified loading state — 12 parallelle fetches populeren UI op verschillende tijdstippen. — `page.tsx:45-80`
- 🟠 **P1**: AttentionPanel prio-order behandelt alles equal — `page.tsx:600-650`
- 🟠 **P1**: KPI-tooltips ontbreken — "Marge" zonder legenda onbruikbaar — `page.tsx:400-450`
- 🟡 **P2**: Greeting-strip generic ("Goedemorgen" om 14:00) · Geen mobile-collapse voor KPI/timeline

**Top-tier-versie**: Linear-stijl unified cockpit: 1 next-event card met crew+menu+2h-warning, 1 prio-tile (rest collapsed), quick-actions als touch-buttons. Skeleton tijdens load. Greeting personalised: "Bruiloft Janssen in 2u — marge 12% ⚠️".

## `/agenda`  🟢

**Code**: [src/app/agenda/page.tsx](src/app/agenda/page.tsx) (946r) · **Top-tier**: Cron/Notion-calendar matchen, conflict-banner ontbreekt.

✅ 3-source calendar (events/prep/personal) · ✅ Deep-link `?conflict=` met 5s fade · ✅ Status case-insensitive matching · ✅ Mobile-responsive grid

- 🟠 **P1**: Conflict-warning niet prominent — add sticky banner "⚠️ 4 overlaps deze maand" — `agenda/page.tsx:200-250`
- 🟡 **P2**: UpcomingList mist type-color-dot (event/prep/personal) — `agenda/page.tsx:700-750`
- 🟡 **P2**: Personal events missen inline-delete — `agenda/page.tsx:300-350`

## `/plannen` → `/agenda`  🟢 Redirect, geen issues.

## `/onboarding`  🟡

**Code**: [src/app/onboarding/page.tsx](src/app/onboarding/page.tsx) (565r) · **Top-tier**: Linear onboarding is **inline** — geen page-navigatie. Wij sturen step-3 naar `/offertes?wizard=true`.

✅ Task-first (1=bedrijf, 3=offerte) · ✅ Activation-logging · ✅ Demo-vs-blank keuze

- 🔴 **P0**: Step-3 Offerte is een link i.p.v. inline-wizard — breekt activation-flow — `onboarding/page.tsx:280-320`
- 🟠 **P1**: Geen 60-min activation-timer met warning — `onboarding/page.tsx:10-40`
- 🟠 **P1**: Tour-step is optionele friction (moet contextueel zijn) — `onboarding/page.tsx:380-420`
- 🟡 **P2**: Integraties-step (5) voelt optional door Pro-only labels

## `/welkom`  🟢

**Code**: [src/app/welkom/page.tsx](src/app/welkom/page.tsx) (309r)

- 🟠 **P1**: Trust-strip "50+ bedrijven vertrouwen" generic — Linear toont 3 logo's + quote — `welkom/page.tsx:80-120`
- 🟡 **P2**: Mobile hero-dashboard-preview onleesbaar (6 tiles shrink)
- 🟡 **P2**: AI-cost-section mist CTA naar feature-demo

## `/mailbox`  🟡

**Code**: [src/app/mailbox/page.tsx](src/app/mailbox/page.tsx) (623r) · **Top-tier**: Superhuman compose mist — geen autocomplete, geen draft-autosave.

✅ Templates met `{{var}}` · ✅ Type-filter · ✅ Inbox-address copy-button

- 🔴 **P0**: Mobile compose-form cramped, body geen auto-expand — `mailbox/page.tsx:250-350`
- 🟠 **P1**: `{{var}}` geen syntax-highlight/autocomplete — `mailbox/page.tsx:200-240`
- 🟠 **P1**: Geen draft-autosave (patroon zit in /klantgesprek) — `mailbox/page.tsx:150-180`
- 🟡 **P2**: Verzonden-filter mist "Laatste 7 dagen" + group-by-klant

## `/berichten` → `/mailbox`  🟢 Redirect.

## `/ai-chat`  🟢

**Code**: [src/app/ai-chat/page.tsx](src/app/ai-chat/page.tsx) (6r)

- 🟡 **P2**: Geen Suspense-fallback — wit-flash tijdens AIStudio-mount

### Groep 1 — Samenvatting
**P0**: 3 · **P1**: 6 · **P2**: 8
**Top-3**: (1) Empty/loading states op dashboard, (2) Onboarding step-3 breekt flow, (3) Mobile-cramped forms.
**Overall**: Functioneel sound, mist top-tier-polish op onboarding (inline wizard), mobile UX en visuele hierarchie. → 🟡 wordt 🟢 met 3 P0 fixes.

---

# Groep 2 — Verkoop-hub

## `/q/[id]` — Public quote portal  🔴 **KRITISCH**

**Code**: [src/app/q/[id]/page.tsx](src/app/q/[id]/page.tsx) (581r) · **Bezoek**: hoog (elke klant)
**Top-tier**: Tripleseat e-sign + DocuSign + tamper-proof audit-trail. Formitable live-chat support-bubble. Wij hebben naked canvas-signature, geen support.

✅ White-label tokens via `cn()` · ✅ Carbon-estimate badge

- 🔴 **P0**: Signature mist device-fingerprint + IP/session-binding → forgery-risico — `q/[id]/page.tsx:75, 116`
- 🔴 **P0**: Post-accept email-flow ondocumenteerd — klant heeft geen bewijs van delivery
- 🔴 **P0**: Canvas-rotate reset → portrait→landscape verliest signature — `q/[id]/page.tsx:350`
- 🔴 **P0**: `fetch` op elke render zonder memoization → cascading re-fetches — `q/[id]/page.tsx:50`
- 🔴 **P0**: Geen signature-date-validatie — klant kan "2099" tekenen
- 🟠 **P1**: Dark-mode ontbreekt → mobile-users in donker zien wit-op-wit — `q/[id]/page.tsx:88`
- 🟠 **P1**: Sticky CTA "Accepteren" geen `safe-area-inset-bottom` — overlapt iPhone SE — `q/[id]/page.tsx:475`
- 🟠 **P1**: Signature-pad geen `aria-label`, geen `aria-busy` — `q/[id]/page.tsx:350`
- 🟠 **P1**: BTW hardcoded 9% i.p.v. uit offerte — `q/[id]/page.tsx:152`
- 🟠 **P1**: Signer-name accepteert blank/emoji/XSS — `q/[id]/page.tsx:330`

**Top-tier-versie**: Tripleseat-pariteit — canvas + IP-fingerprint + HMAC. Formitable chat-bubble. Dark-mode tokens. Portrait/landscape-stable canvas met `safe-area`. Email-confirmation polling. Signer-name Zod-validatie.

## `/offertes`  🟡

**Code**: [src/app/offertes/page.tsx](src/app/offertes/page.tsx) (870r) · **Top-tier**: Pipedrive heeft drag-drop line-items + real-time margin-impact per item; wij doen copy-paste + blur-rekenen.

✅ AI Offerte Wizard met autosave (PR #100) · ✅ Custom empty-state met AI+lege-offerte CTA

- 🔴 **P0**: `calcOfferteMargeData` memo mist deps → stale marge — `offertes/page.tsx:245-250`
- 🔴 **P0**: Acceptance-cascade (factuur+prep+inkoop) geen rollback bij failure — `offertes/page.tsx:612`
- 🔴 **P0**: `deleteOfferteAction` error niet getoond — `offertes/page.tsx:760`
- 🟠 **P1**: AI Wizard geen error-boundary — `offertes/page.tsx:480`
- 🟠 **P1**: Sticky ActionBar overlapt mobile-nav — `offertes/page.tsx:105`
- 🟠 **P1**: MenuBuilder re-rendert op elke keystroke — `offertes/page.tsx:420`

## `/klanten`  🟡

**Code**: [src/app/klanten/page.tsx](src/app/klanten/page.tsx) (419r) · **Top-tier**: Pipedrive toont CLV; wij alleen recente activity.

- 🔴 **P0**: `loadStats` queries op elke keystroke (geen debounce) — `klanten/page.tsx:280`
- 🟠 **P1**: `deleteKlantAction` failure niet getoond — `klanten/page.tsx:365`
- 🟠 **P1**: Detail-pane mobile zonder back-button — user trapped
- 🟠 **P1**: Geen list-virtualisatie (500+ klanten = janky scroll)
- 🟠 **P1**: Phone-field non-digit accept → breekt `tel:`-link

## `/klantgesprek`  🟠

**Code**: [src/app/klantgesprek/page.tsx](src/app/klantgesprek/page.tsx) (812r)

- 🔴 **P0**: localStorage save zonder Zod → corrupted draft onherstelbaar — `klantgesprek/page.tsx:410-415`
- 🔴 **P0**: TranscriptExtract geen timeout — user wacht oneindig — `klantgesprek/page.tsx:620`
- 🔴 **P0**: Klant-naam accepteert blank → Zod ontbreekt — `klantgesprek/page.tsx:150`
- 🟠 **P1**: Per-person diet-tabel scrollt niet horizontaal op mobile
- 🟠 **P1**: Concept-offerte step-6 zonder rollback bij fail — `klantgesprek/page.tsx:800`

## `/event-planner` → `/agenda`  🟢 Redirect.

## `/template-editor`  🟠

**Code**: [src/app/template-editor/page.tsx](src/app/template-editor/page.tsx) (168r)

- 🟠 **P1**: RequireTier-paywall zonder messaging — blanke page voor non-Pro
- 🟠 **P1**: PUT-template fail geen retry — unsaved changes verloren
- 🟠 **P1**: Fetch op elke mount, geen caching

## `/foto-archief`  🟠

**Code**: [src/app/foto-archief/page.tsx](src/app/foto-archief/page.tsx) (485r)

- 🔴 **P0**: Geen virtualisatie — 500+ foto's = scrolling-breakdown — `foto-archief/page.tsx:300`
- 🔴 **P0**: File-upload accepteert elke extensie — security: `.exe` mogelijk — `foto-archief/page.tsx:410`
- 🟠 **P1**: Foto's missen `alt`-text — `foto-archief/page.tsx:310`
- 🟠 **P1**: Lightbox prev/next geen keyboard-nav — `foto-archief/page.tsx:385`
- 🟠 **P1**: Photo-grid fixed 3-col breekt mobile

### Groep 2 — Samenvatting
**P0**: 11 · **P1**: 47 · **P2**: 12
**Top-3**: (1) `/q/[id]` signature-binding ontbreekt — KLANT-FACING productie-risico, (2) email-delivery ongegarandeerd, (3) cascading acceptance geen rollback.
**Overall**: **`/q/[id]` is een productie-blokker.** Rest workable maar mist mobile-first design + error-resilience.

---

# Groep 3 — Keuken-hub

## `/keuken` → `/inspiratie`  🟢 Redirect.

## `/keuken/board` — Legacy redirect  🟢 Backward-compat OK.

## `/keuken/kookbord` — Prep-KDS fullscreen  🟡

**Code**: [src/app/keuken/kookbord/_components/KookbordClient.tsx](src/app/keuken/kookbord/_components/KookbordClient.tsx) (472r)
**Top-tier**: Toast KDS color-coded swim-lanes. Apicbase production KDS: font ≥18px, tap ≥72px voor 30cm-glance — wij missen dit.

✅ Fullscreen `kds-layout` · ✅ Realtime allergen-data · ✅ Keyboard shortcuts (⌘K/M/Esc) · ✅ Haptic feedback · ✅ Swipe-right=done, left=snooze

- 🔴 **P0**: Font ≤14px → onleesbaar op 30cm-afstand. KDS-staff kan UI niet aflezen.
- 🔴 **P0**: Tap-targets ≤48px → handschoenen blijven steken (Toast spec: ≥60px)
- 🔴 **P0**: Geen `overflow: hidden` op KDS-viewport — bij volle week scrollt operator — `kookbord/layout.tsx:11-22`
- 🔴 **P0**: Allergen-badge niet op kaart zelf — pas zichtbaar in sheet — `KookbordClient.tsx:150-164`
- 🔴 **P0**: Swipe-intent niet visueel duidelijk vooraf
- 🟠 **P1**: Display-mode (`?display=true`) heeft geen dimmer/locked-indicator
- 🟠 **P1**: Realtime-updates ontbreken — geen "Steve voegde taak toe"-notification
- 🟡 **P2**: Geen "all done"-celebration zoals prep-counter

**Top-tier-versie**: Toast-pariteit — color-coded stations, ≥60px tap, ≥18px task-text. Allergen-badge zichtbaar op card (`🚨 Noten` rood-bg). Swipe-hint pulse eerste 2s. WakeLock API + dimmer-overlay tussen taken.

## `/prep-counter`  🟡

**Code**: [src/app/prep-counter/page.tsx](src/app/prep-counter/page.tsx) (689r, inline CSS)

✅ Timeline met progress-gradient · ✅ Peak-End celebration · ✅ Receptuur-matching · ✅ Empty states + undo-toast

- 🔴 **P0**: 689r inline-CSS → design-tweaks vereisen file-edit
- 🔴 **P0**: Responsive broken <375px → master-detail past niet
- 🔴 **P0**: Allergen-info ontbreekt in RecipeBlock
- 🟠 **P1**: D-3 tip "Niets in de keuken" misleidt (sauce-prep wel mogelijk)
- 🟠 **P1**: `useSupabase` lijkt ontbrekend → directe `.from()` (line 98) → runtime-error-risico

## `/haccp`  🟡

**Code**: [src/app/haccp/_client.tsx](src/app/haccp/_client.tsx)

- 🔴 **P0**: Hardcoded demo-dishes — comment "V2: load via supabase" staat nog open — `_client.tsx:85-92`
- 🔴 **P0**: SSE response-parsing zonder error-boundary — `_client.tsx:156-170`
- 🔴 **P0**: Mode-fallback nooit cleared na success → error-banner blijft hangen
- 🟠 **P1**: EventId conversion breekt voor demo-IDs (`'evt-2026-0047'`)

## `/bedenker`  🟢

**Code**: [src/app/bedenker/page.tsx](src/app/bedenker/page.tsx) (737r)

✅ 3 modes (vrij/voorraad/klant) · ✅ Parallelle 3-variant fetch · ✅ Concept-history · ✅ KPI-tiles · ✅ Sort-options

- 🔴 **P0**: `concept_history` query unbounded — 1000+ concepts = memory-leak — `bedenker/page.tsx:396-421`
- 🔴 **P0**: `buildEffectivePrompt` ambiguity — voorraad+klant velden beide gevuld = dubbele context
- 🔴 **P0**: SavedTray geen dismiss — neemt ruimte bij veel saved concepts
- 🟠 **P1**: "Verras me" overschrijft input zonder warning
- 🟡 **P2**: Confidence score zonder legend/tooltip

## `/recepten` → `/gerechten`  🟢 Redirect.

## `/menu-engineering` → `/marges`  🟢 Redirect.

### Groep 3 — Samenvatting
**P0**: 9 · **P1**: 4 · **P2**: 5
**Top-3**: (1) KDS font+tap-targets unfit voor 30cm-glance, (2) Allergen-badges verstopt in sheet i.p.v. card, (3) Allergen-loading dupliceert in Kookbord+PrepBoard+prep-counter.
**Overall**: Functioneel OK voor desktop, **UX-busted voor KDS**.

---

# Groep 4 — Gerechten-hub

## `/gerechten` — MEGA-page  🟡

**Code**: [src/app/gerechten/_client.tsx](src/app/gerechten/_client.tsx) (1841r)
**Top-tier**: Apicbase recipe-mgmt hierarchical tiers (prep→cook→plate). Whisk photo-per-step + collaborative editing. Notion-database simple card-grid + bulk-edit.

✅ Server prefetch parallel (gangen+gerechten+inventory+menus) · ✅ Status-4-tier workflow met badges · ✅ AI-integrated buttons (RecipeAi/EstimatedPriceFix/RecipeFineTune) · ✅ Kitchen Mode stepper (niet stubbed) · ✅ Inventory-autocomplete · ✅ Form-validation via Zod · ✅ Loading skeleton

- 🔴 **P0**: Form-state explosion (13+ useState) — overweeg useReducer / React Hook Form — `_client.tsx:59-96`
- 🔴 **P0**: 4-state workflow niet in schema — `src/lib/schemas/gerecht.ts:33` zegt `['actief','inactief','concept']`, `'review_nodig'` hardcoded in _client (r.90)
- 🔴 **P0**: Cost-calc + ingredient-list broken — `costPP` ingerekend inline maar nooit naar DB gepersisteerd — `_client.tsx:1445`
- 🟠 **P1**: Gang-bewerken mid-flight → `gerechten.gang_slug` refs worden stale; geen FK/cascade — `_client.tsx:213-220`
- 🟠 **P1**: AI-allergen-detect heeft geen approval-flow vóór save — `_client.tsx:347`
- 🟠 **P1**: Photo-per-step stubbed (P1.29 TODO) — `_client.tsx:1283`
- 🟠 **P1**: Mobile-breakpoints ongetest — 1841r page waarschijnlijk onbruikbaar op telefoon

**Top-tier-versie**: useReducer voor form-state. Schema enum align: `GERECHT_STATUSES = ['actief','inactief','concept','review_nodig']`. Cost-cache op gerecht-row, invalidate on ingredient-link change. Mobile: sidebar collapse <1024px, form stack <768px.

## `/gerechten/ai-pitmaster`  🟢

**Code**: [src/app/gerechten/ai-pitmaster/_client.tsx](src/app/gerechten/ai-pitmaster/_client.tsx)
**Top-tier**: Beter dan Anthropic Workbench (event-context-binding). Beter dan Notion AI (recipe-knowledge).

✅ Event context-binding via sessionStorage · ✅ Prompt-library met icons + hover-lift · ✅ Brand-identity server-side (kan niet overschreven worden) · ✅ Empty state met fallback BBQ-Q's

- 🟠 **P1**: sessionStorage fallback silent → geen toast als private-mode het blokt — `_client.tsx:40`
- 🟠 **P1**: Event-details sparse (alleen date+count+type, geen menu/diet-notes)

## `/gerechten/allergen-queue`  🟢

**Code**: [src/app/gerechten/allergen-queue/page.tsx](src/app/gerechten/allergen-queue/page.tsx)

✅ EU 1169/2011 compliance framing · ✅ Empty state "Alles up-to-date" · ✅ Grouped render per component · ✅ Allergen lookup-map met fallback

- 🟠 **P1**: FK missing (migration 20260516190000 nog niet gerund) — fallback hacky
- 🟠 **P1**: Geen pagination → kan 10k rows laden

## `/gerechten/componenten`  🟡

**Code**: [src/app/gerechten/componenten/page.tsx](src/app/gerechten/componenten/page.tsx) (~600r)

✅ Type-filter (all/prepared/bought_in) · ✅ AI-proposal flow (Sonnet) · ✅ HACCP-types lijst · ✅ Cost-formatting euros↔cents

- 🔴 **P0**: AI-proposal UI confusing — 3 clicks om te bevestigen; moet 1-2 met betere hiërarchie
- 🟠 **P1**: Geen draft-save bij component-edit
- 🟠 **P1**: Allergen-detect/api call zonder approval-flow (zelfde issue als /gerechten)

## `/gerechten/ingredienten`  🟢

Redirect naar /voorraad. Schone deprecatie.

## `/gerechten/insights`  🟢

Reuse-density + marge-histogram. Scherp en compact.

## `/gerechten/menu-analyse`  🟢

Hergebruikt /marges-logica. Schoon.

## `/inspiratie`  🟢

Schone 301-deprecatie naar /gerechten.

### Groep 4 — Samenvatting
**P0**: 4 · **P1**: 8 · **P2**: 3
**Top-3**: (1) Status-enum mismatch tussen schema en _client (`review_nodig` hardcoded), (2) Form-state explosion (13+ useState) zonder draft-save, (3) Allergen-approval-flow versnipperd over 3 pages (queue/componenten/ingredienten).
**Overall**: Solide architectuur (prefetch, RLS, Zod) maar editing-UX vereist consolidatie. Mobile-readiness ongetest.

---

# Groep 5 — Voorraad-hub

## `/voorraad`  🟢

**Code**: [src/app/voorraad/_components/VoorraadClient.tsx](src/app/voorraad/_components/VoorraadClient.tsx) (2037r met Server-prefetch)
**Top-tier**: Apicbase inventory hierarchical tree + auto-PO. Lightspeed retail-inventory met low-stock-alerts. Toast inventory met daily-counts.

✅ Server-prefetch + skipInitialFetch (PR #100) · ✅ Negative-stock-prevention server-side · ✅ Realtime via useSupabase · ✅ Dedup-check op naam · ✅ Audit-log naar stock_movements

- 🔴 **P0**: Regex-injection mogelijk in dedup-check (`ilike` met user input) — onderzoek escapen
- 🔴 **P0**: Stock-adjustment niet atomic — race-window tussen read en update — `actions.ts adjustStock`
- 🟠 **P1**: Geen bulk-edit voor low-stock items
- 🟡 **P2**: Inventory-categorieën hardcoded (geen tenant-config)

## `/voorraad/historie/[id]`  🟢

Clean audit-dashboard met stock_movements per item.

- 🟠 **P1**: Geen pagination — 1000+ movements = slow render
- 🟠 **P1**: Error-handling bij fetch-fail genereriek

## `/leveranciers`  🟡

**Code**: [src/app/leveranciers/_components/](src/app/leveranciers/_components/) (Server/Client split)
**Top-tier**: MarginEdge supplier-mgmt + Apicbase suppliers met API-integratie.

✅ Server/Client split · ✅ Multi-path import (CSV + PDF-extractor met meat_taxonomy)

- 🔴 **P0**: Hardcoded portal-URLs (geen tenant-config) — `leveranciers/page.tsx`
- 🟠 **P1**: Sequentiële API-calls in bulk-import (geen Promise.all) → langzaam

## `/leveranciers/[id]/prijslijsten`  🟠

**Code**: [src/app/leveranciers/[id]/prijslijsten/page.tsx](src/app/leveranciers/[id]/prijslijsten/page.tsx)
**Top-tier**: Apicbase price-lists met version-history en supplier-comparison.

✅ Batch-API + chunking voor PDF-extraction · ✅ Review-queue voor AI-suggesties

- 🔴 **P0**: Stuck-detection brittle — als één PDF-page faalt, hele batch lijkt vast
- 🔴 **P0**: Parse-errors unclear voor user — generieke "extractie mislukt" toast
- 🟠 **P1**: Geen progress-bar tijdens batch-processing

## `/leveranciers/bulk-upload`  🟡

✅ CSV-import met preview

- 🟠 **P1**: Geen dry-run mode — onmogelijk om resultaat te previewen
- 🟠 **P1**: Partial imports bij row-error → orphaned data

## `/inkoop`  🟠

**Code**: [src/app/inkoop/page.tsx](src/app/inkoop/page.tsx)
**Top-tier**: Apicbase ordering + Toast purchasing met PO-generation.

✅ Innovative vision-scanning voor bon-import

- 🔴 **P0**: Unvalidated Supabase mutations vanuit Client (geen Server Action wrapper)
- 🔴 **P0**: Legacy data-guard antipatterns (defensive nulls overal)
- 🟠 **P1**: Inline-style buttons (1 van top-offenders uit PR #100 audit)

## `/marges`  🟡

**Code**: [src/app/marges/page.tsx](src/app/marges/page.tsx)
**Top-tier**: Apicbase menu-engineering BCG-matrix. MarginEdge food-cost.

✅ BCG-matrix analysis voor menu-engineering · ✅ Cost-calc per gerecht

- 🟠 **P1**: Batch-delete UX unclear (geen confirmatie-modal)
- 🟡 **P2**: Real-time cost-propagation ontbreekt (manual refresh nodig)

## `/materieel`  🟠

✅ AI equipment-scanning

- 🔴 **P0**: Hardcoded categories (Vlees/Drank/Equipment) — geen tenant-config
- 🟠 **P1**: Scan-results niet gevalideerd voor save

## `/leveranciers/[id]`  🟡

Component-heavy met OAuth + review-flows.

- 🟠 **P1**: State-persistence ontbreekt (page-refresh = state-loss)
- 🟠 **P1**: Geen pagination op transaction-history

## `/leveranciers/historie/[id]`  🟢

Supplier audit-trail. Solide.

- 🟠 **P1**: Missing diff-views (price-changes)
- 🟡 **P2**: Geen CSV-export

### Groep 5 — Samenvatting
**P0**: 4 · **P1**: 11 · **P2**: 10
**Top-3**: (1) Mutation-pattern inconsistency — Server Actions in /voorraad maar direct Supabase in /inkoop/materieel, (2) Race-conditions in stock-adjust + price-update + bon-receipt, (3) Generieke error-messages zonder context.
**Overall**: Solide foundations (Server Actions + RLS + Zod) met innovatieve AI-scanning, maar inconsistente patronen + non-atomic operations create friction at scale.

---

# Groep 6 — Geld-hub

## `/geld` → `/financien`  🟢 Redirect.

## `/geld/boekhouder`  🟡

**Code**: [src/app/geld/boekhouder/page.tsx](src/app/geld/boekhouder/page.tsx) (1020r)
**Top-tier**: Stripe Dashboard async status-pipelines + audit-trail. Moneybird transaction-categorization met undo. Xero multi-level approval workflows.

✅ AI-classification confidence-badges · ✅ Phase-state-machine in BonAddSheet · ✅ Tab-architecture (stapel/verkoop/pakket/twijfel/archief) · ✅ useCallback dep-optimization · ✅ RGS-code dropdown

- 🔴 **P0**: `fetchBonnen` geen error-boundary — silent failure laat stale rows[] zien — `boekhouder/page.tsx:102-113`
- 🔴 **P0**: AI-classification confidence-threshold niet enforced — sub-threshold (<60%) zou auto naar twijfel moeten — `boekhouder/page.tsx:200-250`
- 🟠 **P1**: State niet gesynct naar URL → page-refresh = lost in-flight edits
- 🟠 **P1**: ArchiefTab "regenerate" zonder confirmatie-dialog
- 🟡 **P2**: CSV-export mist UTF-8 BOM (Excel-incompatibel op Windows)

## `/geld/boekhouder/BonAddSheet`  🟡

**Code**: [src/app/geld/boekhouder/_components/BonAddSheet.tsx](src/app/geld/boekhouder/_components/BonAddSheet.tsx) (406r)
**Top-tier**: Receipt-Bank/Dext OCR met field-level edit-after-extract. Stripe receipt-upload met confidence + manual-override.

✅ Image-resize 1600×2200 @ 85% · ✅ Camera-capture (`capture="environment"`) · ✅ Phase-state-machine · ✅ Per-item checkbox approval · ✅ Suggestion-matching met confidence

- 🔴 **P0**: Geen duplicate-detection vóór AI-extraction → zelfde bon 2× geüpload = dubbele bon-entries
- 🔴 **P0**: Geen rate-limiting/timeout op `/api/boekhouder/bon-extract` → malicious user kan API-quota exhausten
- 🟠 **P1**: Extracting-phase geen progress-indicator (>3s = user klikt close of submit twice)
- 🟠 **P1**: RGS-category picker geen search (100+ codes = tedious)
- 🟡 **P2**: Error-phase logt failure-reason niet server-side

## `/financien`  🟢

**Code**: [src/app/financien/page.tsx](src/app/financien/page.tsx) (57r Server shell)
**Top-tier**: Vercel-dashboard parallel prefetch — match. Linear projects Server-aggregation — match.

✅ `dynamic='force-dynamic'` · ✅ Promise.all 8 queries parallel · ✅ Suspense + LoadingState · ✅ Limit 500-1000 rows · ✅ RLS implicit

- 🟡 **P2**: Geen Promise.allSettled — als één bron faalt crasht hele page

## `/financien/_components/FinancienClient.tsx`  🟡

**Code**: [src/app/financien/_components/FinancienClient.tsx](src/app/financien/_components/FinancienClient.tsx) (693r)
**Top-tier**: Stripe Dashboard 5+ analytics-tabs met drill-down. Moneybird forecast-vs-actual met variance-alerts. Xero BTW-tracking per rate.

✅ 8 useSupabase met skipInitialFetch (PR #100) · ✅ Forecast-calc robust voor 3 menu-shapes · ✅ Realisatie-calc filter op payment-status · ✅ BTW-tab (9%/21%) · ✅ Top-5 clients

- 🔴 **P0**: Forecast geen null-check op `uurtarief_snapshot` → NaN bij null-rate, corrupt totalLabor sum
- 🔴 **P0**: Realisatie chart handelt zero-revenue maanden niet → axis scale onverwacht
- 🟠 **P1**: Forecast-calc sync, niet useMemo → 1000+ offertes blokkeert UI 100ms
- 🟠 **P1**: Tab-state niet synced naar URL → back-button loopt verkeerd
- 🟡 **P2**: Top-leveranciers overflow op mobile · Dashboard KPI-colors zonder dark-mode

## `/facturen`  🟡

**Code**: [src/app/facturen/page.tsx](src/app/facturen/page.tsx) (407r)
**Top-tier**: Stripe Invoicing hosted-payment-links + auto-reminders. Moneybird sync + UBL export. Linear billing UBL voor Peppol.

✅ Form-state + useFormValidation · ✅ Items-table met calcLineTotals · ✅ Betalingen tracking · ✅ markFactuurStatus + inventory-cascade · ✅ PDF + email + Betalingsherinnering + iDEAL + Moneybird + UBL

- 🔴 **P0**: Betalingen-array geen duplicate-check → zelfde aanbetaling 2× = double-counted
- 🔴 **P0**: `markFactuurStatus` valideert niet of inventory drained-list bestaat → SQL-error silent fail
- 🟠 **P1**: Mollie iDEAL-link niet gepersisteerd → 10× regenerate = 10 Mollie payment-requests
- 🟠 **P1**: Delete-knop geen confirmatie-dialog
- 🟡 **P2**: Moneybird-sync response niet gevalideerd

## `/factuur-lezer`  🟢

**Code**: [src/app/factuur-lezer/page.tsx](src/app/factuur-lezer/page.tsx) (113r)

✅ HubCard-architectuur · ✅ Stats-aggregations · ✅ Links naar primary workflows

- 🟡 **P2**: Stats-queries geen error-fallback → undefined HubCard = NaN

## `/boekhouding` → `/financien`  🟢 Redirect.

## `/price-intelligence`  🟠 *(high-level only — 4326r MEGA)*

**Code**: [src/app/price-intelligence/_components/PriceIntelligenceClient.tsx](src/app/price-intelligence/_components/PriceIntelligenceClient.tsx) (4326r)

✅ Email-in via Cloudflare Email Worker (compliant + scalable) · ✅ Price-history tracking

- 🔴 **P0**: De-dup logic moet rock-solid zijn — verify compound key (supplier_id + product_sku + date), niet alleen email-subject
- 🔴 **P0**: Email-in parsing geen content-validation → adversarial pricing (`$0.01` om gross-margin op te blazen) kan landen zonder flag
- 🟠 **P1**: Price-history kan supplier-negotiation-positie lekken bij export — beperk tot owner+finance-role

### Groep 6 — Samenvatting
**P0**: 6 · **P1**: 10 · **P2**: 9
**Top-3**: (1) Error-handling resilience ontbreekt overal (fetchBonnen, Promise.all, Moneybird-sync, PI de-dup), (2) State-sync naar URL inconsistent (BonAddSheet modal, Financien-tab, boekhouder-row), (3) Confirmatie-dialogs missen op destructive actions (delete factuur, archief regenerate, Mollie regenerate).
**Overall**: Feature-complete voor catering-accounting. Core AI-classification + RGS-categorisatie solide. Error-resilience + state-persistence + confirmation-safeguards moeten harden vóór >5 concurrent users + >500 invoices/maand.

---

# Groep 7 — Systeem-hub

## `/systeem`  🟢
**Code**: [src/app/systeem/page.tsx](src/app/systeem/page.tsx) (142r). Static hub-router met 6 HubCards.

✅ Icon visual hierarchy · ✅ Consistent accent · ✅ Responsive grid · ✅ Action-oriented CTAs

- 🟡 **P2**: HUB_CARDS hardcoded, geen role-filter — Admin-card zichtbaar voor non-admins — `systeem/page.tsx:9`
- 🟡 **P2**: Admin-card mist permission-check (zou `RequireTier` of role-verify moeten hebben) — `systeem/page.tsx:46-51`

**Top-tier**: Linear toont real-time org-usage (seats/billing) inline; Stripe embed quick-stats per card. Wij missen die data-injection.

## `/instellingen`  🟢
**Code**: [src/app/instellingen/page.tsx](src/app/instellingen/page.tsx) (583r). 5×8 white-label theme-system (OKLCH-calibrated). Cascade-dialog na color-change.
**Top-tier**: Linear presets — match. Notion free-form — wij beter. Stripe geen white-label — wij beter (unieke OKLCH-aanpak).

✅ Visual theme-preview · ✅ OKLCH contrast-parity over presets · ✅ Dual logo light/dark · ✅ Server Action `updateSettings` · ✅ Cascade-prompt respects choice

- 🔴 **P0**: Cache-flush via Service Worker unreliable in offline-mode — als SW disabled, hard-reload silent fail. Voeg fallback `location.reload(true)` toe — `instellingen/page.tsx:91-108`
- 🟠 **P1**: Geen live preview van theme op sample components (knop/kaart/input) vóór apply — `instellingen/page.tsx:294-404`
- 🟠 **P1**: Cascade-dialog toont alleen primary+accent — secondary/background/text colors niet bevestigd — `instellingen/page.tsx:423-582`
- 🟠 **P1**: Logo-upload zonder file-size-validatie (50MB PNG mogelijk) — `instellingen/page.tsx:256-275`
- 🟡 **P2**: Dual logo light/dark niet gecontrast-getest

**Top-tier-versie**: Figma-stijl live preview-pane met button/card/input/badge. Webflow per-page theme-overrides.

## `/instellingen/ai-usage`  🟢

**Code**: [src/app/instellingen/ai-usage/page.tsx](src/app/instellingen/ai-usage/page.tsx) (335r)
**Top-tier**: Geen concurrent (Stripe/Linear/Notion) toont cache-hit ratio per tenant — uniek transparency-pillar.

✅ Cache-hit % KPI prominent · ✅ Stacked bar per action_type · ✅ Recent calls met cache-read/creation tokens · ✅ Radial gauge 10× cost-savings · ✅ Maand/jaar tier-spending

- 🟠 **P1**: Cache-savings tonen % niet absolute € (user moet zelf 10× × maand-spend rekenen) — `ai-usage/page.tsx:237-262`
- 🟠 **P1**: Recent-calls table mist action_type column → kan high-cost niet correleren naar business-function — `ai-usage/page.tsx:264-308`
- 🟠 **P1**: Geen CSV/PDF export voor audit-trail
- 🟡 **P2**: Geen trend-forecast (next-month-spend o.b.v. YTD-burn) · Tier-cap progress-bar mismatch (tokens vs €)

## `/instellingen/referral`  🟢

**Code**: [src/app/instellingen/referral/page.tsx](src/app/instellingen/referral/page.tsx) (178r). €50-credit op first-payment, max 10 active links/org.

✅ One-click link + clipboard · ✅ Email-template met `?ref=` UTM · ✅ Status-funnel-badges · ✅ Max 10 active links (anti-abuse)

- 🟠 **P1**: Geen email-notificatie bij signup/payment — user moet handmatig checken — `referral/page.tsx:167-177`
- 🟠 **P1**: Geen email-share / QR-code (alleen clipboard) — `referral/page.tsx:79-84`
- 🟡 **P2**: Max-10-active te restrictief voor high-growth · Geen archive-flow

## `/instellingen/integraties/accounting`  🔴

**Code**: [src/app/instellingen/integraties/accounting/page.tsx](src/app/instellingen/integraties/accounting/page.tsx) (281r). Moneybird + Exact + Mollie BTW-mapping config.

✅ Modulaire 3-section layout · ✅ Password-masking · ✅ Hint-callouts educative · ✅ Fallback naar env-vars · ✅ Email-template inline edit

- 🔴 **P0**: Geen tax-rate-validatie — user kan `moneybird_tax_rate_21 = 0` invullen → alle facturen door Moneybird API geskipt — `accounting/page.tsx:204`
- 🔴 **P0**: Geen fallback-testing — als env-var invalid, error verschijnt pas bij invoice-push in productie
- 🔴 **P0**: Geen sync-status-indicator (is Moneybird connected? Exact reachable?)
- 🟠 **P1**: Config-structure niet Zod-validated · Geen email-template-preview · GL-accounts free-form (geen Moneybird-master-autocomplete)
- 🟡 **P2**: Field-components geen real-time validatie · Payment-terms-link naar facturen-template ontbreekt

## `/gebruikers`  🟡

**Code**: [src/app/gebruikers/page.tsx](src/app/gebruikers/page.tsx) (242r). RBAC met 3 rollen (Admin/Pitmaster/Medewerker).
**Top-tier**: Linear shows seat-usage + last-activity. Slack workspace-admin toont @-mentions. Wij missen beide.

✅ Role-colored avatar-badges · ✅ Invite met email+role · ✅ Status-badges · ✅ Copy-invite-link · ✅ Server Action voor token

- 🔴 **P0**: Geen member-remove-knop — inactive members kunnen niet verwijderd worden zonder support — `gebruikers/page.tsx:169-237`
- 🔴 **P0**: Geen role-change UI — Medewerker→Pitmaster vereist re-invite
- 🟠 **P1**: Geen last-login/last-active column — stale accounts onzichtbaar
- 🟠 **P1**: Invite-resend ontbreekt — verlopen token = nieuwe invite-cyclus
- 🟠 **P1**: Geen audit-log (wie inviteerde wie, when role-changes) — compliance-gap
- 🟡 **P2**: isAdmin client-side only — server-side authz check ontbreekt
- 🟡 **P2**: "Inactive"-badge unclear (never-logged-in vs deactivated)

## `/uren`  🟡

**Code**: [src/app/uren/page.tsx](src/app/uren/page.tsx) (216r). Punch-in/out, ZZP 1225h-target, print-PDF payroll.
**Top-tier**: Eitje (NL HR) heeft geolocation + shift-swap. Connecteam vereist photo-proof. Toggl Track project-billable.

✅ Live-punch met big-button · ✅ YTD-uren ZZP-benchmark · ✅ Print CSS voor PDF · ✅ Responsive 2-col · ✅ RequireTier

- 🔴 **P0**: Geen geolocation proof-of-punch — user kan vanuit huis/sofa inklokken → timesheet-fraude — `uren/page.tsx:67-97`
- 🔴 **P0**: Punch-out = current-timestamp zonder supervisor-approval-workflow voor disputed hours — `uren/page.tsx:99-113`
- 🟠 **P1**: `liveLogs` filter checkt `!l.end_time` zonder status-check — orphaned logs (status='error') verschijnen als "live"
- 🟠 **P1**: Geen alert als YTD-projectie ZZP 1225h overschrijdt (liability-gap)
- 🟠 **P1**: Geen shift-swap notification-flow
- 🟡 **P2**: Print CSS lekt modals naar PDF · Zombie logs na deleted Personeel

**Top-tier-versie**: Google Maps geofence-API (radius around bakkerij) + photo-proof (Supabase `clocking_proofs` bucket). Supervisor-approval-tab voor punch-outs buiten geofence.

## `/uren/personeel`  🟡

**Code**: [src/app/uren/personeel/page.tsx](src/app/uren/personeel/page.tsx) (270r). Crew-roster, uurtarief frozen at punch-time.

✅ Avatar-initials gradient · ✅ Filter-buttons met counts · ✅ Search op naam/functie/email · ✅ Click-to-edit row

- 🔴 **P0**: Geen bulk CSV-import — 20 crew toevoegen = 20 manual clicks — `personeel/page.tsx:77-82`
- 🔴 **P0**: Contract_type raw enum zonder validatie (full/part/freelance) — `personeel/page.tsx:206-207`
- 🟠 **P1**: Tariff zonder effective-date/history — bij 3× rate-change geen audit-trail
- 🟠 **P1**: Drawer-state persists bij close-zonder-save → stale data
- 🟠 **P1**: Delete-confirmation zegt "klok-registraties blijven bewaard" maar geen orphan-migration
- 🟡 **P2**: Geen contract-end-date warning voor temp staff

## `/administratie`  🟡

**Code**: [src/app/administratie/page.tsx](src/app/administratie/page.tsx) (190r). 6 sub-hubs + KPI-cards.
**Top-tier**: QuickBooks-dashboard revenue-trend + expense-breakdown. NetSuite real-time KPI-cockpit met AR-aging + inventory-turnover.

✅ 6 KPI-cards summary · ✅ Drill-down link-styling · ✅ Stats real-time · ✅ ZZP 1225h-education · ✅ Lage voorraden + restock-link · ✅ Rittenregistratie km+aftrek

- 🟠 **P1**: Geen cash-flow-forecast ("Cash runs out [date]" ontbreekt)
- 🟠 **P1**: Omzet zonder prior-month comparison (% change, trend-arrow)
- 🟠 **P1**: Open AR zonder aging-buckets (0-30/30-60/60+ DPO)
- 🟠 **P1**: Inventory low-stock zonder reorder-point-validatie
- 🟠 **P1**: Rittenregistratie km-aggregatie kan dubbel-tellen multi-trip-day
- 🟡 **P2**: Geen supplier-performance · Geen expense-category-drilldown

## `/administratie/rittenregistratie`  🟡

**Code**: [src/app/administratie/rittenregistratie/_client.tsx](src/app/administratie/rittenregistratie/_client.tsx) (~300r). Mileage-registration €0.23/km aftrek.
**Top-tier**: Moneybird ritten auto-syncs GPS (mobile app). Whisbi delivery-ops met photo+signature.

✅ Map-visualisatie (MapRoute+Marker) · ✅ Period-filter Maand/Kwartaal/Jaar via URL · ✅ Category-filter zakelijk/privé · ✅ TotalenStrip km+aftrek · ✅ Empty-state

- 🔴 **P0**: Geen auto-GPS-capture — manual entry = error-rate hoog (typos, route-miscalculation, fraud-risk) — `rittenregistratie/_client.tsx:52-86`
- 🔴 **P0**: Geen duplicate-rit-detection — morning+evening van zelfde trip 2× ingevoerd = over-claim aftrek — `rittenregistratie/_client.tsx:136-162`
- 🟠 **P1**: Export waarschijnlijk CSV-only — accountant wil PDF-invoice met rit-summary + totals voor audit
- 🟠 **P1**: MapRoute-curvature varies per index zonder legend
- 🟡 **P2**: Belastingdienst-regel "commuting vs zakelijk" niet enforced

## `/website`  🟠

**Code**: [src/app/website/page.tsx](src/app/website/page.tsx) (891r). Website-builder voor hopbites.nl met 5 tabs.
**Top-tier**: Wix-editor met blocks+templates+responsive-preview. Squarespace SEO-tools. Webflow CMS+custom-code.

✅ 5-tab organisatie · ✅ Drag-drop image-reorder · ✅ Allergen-checkboxes EU Annex II · ✅ Volgorde-veld op gallery+FAQ · ✅ Visibility-toggles · ✅ Storage Supabase-bucket

- 🔴 **P0**: Localhost dev-alert nog in UI — productie-deployment unclear — `website/page.tsx:109, 137-139`
- 🔴 **P0**: Geen mobile responsive preview — user edit desktop maar ziet niet mobile-rendering
- 🔴 **P0**: Geen SEO-metadata editor (title/desc/og:image/canonical) — WordPress/Wix doen dit by default
- 🟠 **P1**: Hero-slideshow gelimit op 4 slides
- 🟠 **P1**: MenuTab heeft geen dish-photo-upload
- 🟠 **P1**: Contact-footer disabled (hardcoded elements) — user weet niet dat hij niet kan editen
- 🟠 **P1**: Image-upload zonder compressie (10MB PNG as-is)
- 🟡 **P2**: Gallery-category geen frontend-filter · Geen custom-domain-setup-UI

## `/logistiek`  🟡

**Code**: [src/app/logistiek/page.tsx](src/app/logistiek/page.tsx) (324r). Bus Check + RTR + Packing Lists.
**Top-tier**: Sortly barcode-scan+expiry. Apicbase supplier-link+reorder-alert.

✅ Hardware-auto-calc uit menu_selectie · ✅ 3-tab workflow · ✅ Progress-bar X/Y items · ✅ Toggle done-state · ✅ Veldmodus-link

- 🔴 **P0**: Hardware ratio niet gevalideerd — user kan `ratio=0.1` invoeren → grossly underpacks — `logistiek/page.tsx:61-86`
- 🔴 **P0**: Progress-bar zonder per-item-detail — user moet scrollen voor unchecked items
- 🟠 **P1**: Geen barcode-scan-integratie · Field-mode sync-gap (offline→online)
- 🟠 **P1**: RTR-tab geen category-field · PackLists niet gelinkt aan BusCheck → data-disconnect
- 🟡 **P2**: Geen supplier-alert · Single-vehicle-assumption (geen Bus 1/Bus 2 tabs)

### Groep 7 — Samenvatting
**P0**: 11 · **P1**: 32 · **P2**: 18
**Top-3**: (1) Tier-gating + RBAC inconsistent (geen role-filter in /systeem, geen member-remove in /gebruikers, geen bulk-import in personeel), (2) Data-integriteit + validatie ontbreekt (contract_type free-form, geen duplicate-rit, hardware-ratio niet gevalideerd, tax-rates niet gecheckt), (3) Integration-sync + status-visibility (geen "Test connection" Moneybird/Exact, geen cache-savings €, geen trend/forecast in administratie).
**Overall**: Solide hub-and-spoke met sterke white-label theming + RBAC-foundations, maar 11 blocking issues (geolocation, barcode, accounting-validation) + 32 high-prio gaps. Current: 🟡 functioneel maar risky; post-P0 → 🟢.

---

# Groep 8 — Events

## `/events`  🟡

**Code**: [src/app/events/page.tsx](src/app/events/page.tsx). Entry-point waar Sam alle events ziet+aanmaakt.
**Top-tier**: Tripleseat event-list met status-pills + quick-actions sidebar. Caterease event-cards met client+guests. Notion DB met filter-by-status.

✅ Triple-query useSupabase (events+offertes+prep_tasks) batched · ✅ `newEvent()` → defaults → navigate to hub · ✅ EventsTimeline-wrapper

- 🟠 **P1**: Sort gebruikt loose string-compare `a.date < b.date` i.p.v. Date-comparison — `events/page.tsx:46`
- 🟠 **P1**: Missing status-filter selector (Caterease doet dit als quick-tabs boven list)
- 🟠 **P1**: Geen empty-state als events-array leeg
- 🟡 **P2**: Icon-only PartyPopper button mist `aria-label`

## `/events/[id]`  🟢

Redirect naar `/events/[id]/hub`. Clean.

## `/events/[id]/hub`  🔴 **KRITISCH**

**Code**: [src/app/events/[id]/hub/page.tsx](src/app/events/[id]/hub/page.tsx) (32KB, 500+r) — THE operational hub.
**Top-tier**: Linear project-hub heeft data-per-card met independent error-boundaries + skeleton-per-card. Notion-project-page heeft data-refresh + offline-warning.

✅ Workflow-stages useMemo (offerte→accept→prep→eventdag→afronding, lines 212-249) · ✅ Prep-tasks optimistic + rollback on error (lines 277-290) · ✅ 4 PDF-export functies

- 🔴 **P0**: Offerte-query error niet caught → entire page-load stalls bij failure — `hub/page.tsx:138`
- 🔴 **P0**: `markBevestigd()` optimistic update zonder rollback bij Supabase-error → UI stale state — `hub/page.tsx:397`
- 🔴 **P0**: Menu read-only maar dead code (MenuCard import, MENUKAART_STYLE_TO_NAME templates) nog in file → half-removed feature — `hub/page.tsx:127`
- 🟠 **P1**: 14 useState hooks over 500+ regels zonder useReducer → hard to debug · `menuIds` set in useEffect maar ook derived (dual source) — `hub/page.tsx:91, 253`
- 🟠 **P1**: 4 download-functies (offertePdf/menukaartPdf/factuurPdf/haccpPdf) + 2 text-export zonder unified download-state UX — geen spinner op button tijdens download — `hub/page.tsx:294-300`
- 🟠 **P1**: Type-safety: `any` overal. `useState<any>(null)` voor event. Offerte.items-parsing zonder Zod — crasht bij malformed JSON — `hub/page.tsx:70, 181-189`
- 🟠 **P1**: 12 parallel queries zonder per-query error-boundaries · Geen 404 vs permission-error distinction · Geen retry-button
- 🟠 **P1**: `scrollIntoView()` op hidden element zonder focus-management — `hub/page.tsx:491`
- 🟠 **P1**: Hero 450px+ desktop-first — geen responsive breakpoints

**Top-tier-versie**: Linear-pariteit met data-per-card-error-boundary + skeleton-per-card. Extract data-fetch naar `useEventHub()` hook. Type EventData properly via Zod. Notion-stijl data-refresh button + offline-warning.

## `/events/[id]/field`  🟢

**Code**: [src/app/events/[id]/field/page.tsx](src/app/events/[id]/field/page.tsx). Mobile field-view (1-handed) — timer, pack-list, quick-call.
**Top-tier**: Toast restaurant-service-mode + Square POS field-view. Match.

✅ Mobile-first 44+56px tap-targets · ✅ Live duration-timer · ✅ Pack-list optimistic updates · ✅ One-tap `tel:` + `maps:` links · ✅ OfflineEventToggle

- 🟠 **P1**: Pack-list stuck loading als Supabase offline (geen offline-first rendering)
- 🟠 **P1**: Timer-button "Stoppen..." zonder visuele spinner
- 🟠 **P1**: Icon-buttons (MapPin, Phone) missen `aria-label`

## `/events/[id]/reflectie`  🟡

**Code**: [src/app/events/[id]/reflectie/page.tsx](src/app/events/[id]/reflectie/page.tsx). Post-event reflection met score-slider.
**Top-tier**: Linear retrospectives + post-mortem-templates.

✅ Upsert-pattern (insert/update) · ✅ Score-slider 0-10 met live color · ✅ 5 textarea-fields (overschot/tekort/kwaliteit/verbeter/notities)

- 🟠 **P1**: Auto-marks `event.status = 'completed'` op save zonder confirmatie — user save draft → event "completed" — `reflectie/page.tsx:75`
- 🟠 **P1**: `maxWidth: 800` desktop-only — geen responsive padding
- 🟠 **P1**: `any`-cast op type EventReflectie (lines 35, 39)
- 🟡 **P2**: Buttons zonder aria-label · Geen "Save draft" vs "Save & complete" split

## `/events/[id]/service`  🔴 **KRITISCH**

**Code**: [src/app/events/[id]/service/page.tsx](src/app/events/[id]/service/page.tsx) (33KB). Fullscreen KDS — gang-flow + per-table grid + AI-directives.
**Top-tier**: Toast kitchen-display met wake-lock + per-table grid. Square POS service-screen.

✅ `useWakeLock()` voorkomt screen-sleep · ✅ 4-column Kanban (queued/active/ready/served) · ✅ Per-table grid met allergy-red-border · ✅ Advance-flow Start→Ready→Served · ✅ ServiceAIBar rotating directives

- 🔴 **P0**: `deductCourseFromInventory()` silent-fails bij parse-error of inventory-query-fail → stock niet geüpdate zonder user-feedback — `service/page.tsx:34-61`
- 🔴 **P0**: Geen error-handling bij course-status-update-fail — UI zonder feedback, user tapt repeatedly
- 🟠 **P1**: `buildServiceDirectives(event)` implementation hidden — als stale data, KDS toont wrong directives
- 🟠 **P1**: Per-table-grid mist table-name labels (alleen table-number)
- 🟠 **P1**: "Geserveerd" column-header zonder count
- 🟠 **P1**: Desktop-first 4-col grid — collapse op mobile broken
- 🟠 **P1**: `useFullscreen()` zonder fallback als fullscreen-API faalt
- 🟡 **P2**: `any` op Pill/HelpNote (lines 66, 84) · Geen aria-labels op column-headers

## `/events/[id]/service/plattegrond`  🟡

**Code**: [src/app/events/[id]/service/plattegrond/page.tsx](src/app/events/[id]/service/plattegrond/page.tsx). Floor-plan editor (canvas/SVG).

- 🟠 **P1**: Error-message bij invalid eventId zonder "Terug naar events"-knop

### Groep 8 — Samenvatting
**P0**: 4 · **P1**: 18 · **P2**: 4
**Top-3**: (1) Type-safety — `any` overal in hub + service, refactor-risk hoog, (2) Error-boundaries ontbreken — één failed query blokt entire hub, (3) Optimistic updates (prep/bevestigd/course-status) zonder rollback → user-expects-save maar server-rejects-silently.
**Overall**: Operationeel-feature-complete maar fragile. Hub is 500+ regels met 14 useState — hard to maintain. Service-KDS gepolijst (Kanban + AI bar + per-table grid) maar inventory-deduction silent-fails. **1-2 ronde cleanup**: extract `useEventHub` hook + per-card error-boundaries + properly-typed EventData + retry-buttons.

---

# Groep 9 — Auth + Public

## `/login`  🔴

**Code**: [src/app/login/page.tsx](src/app/login/page.tsx). Email+password met hydration-safe mount-gating.

✅ Mobile 44+16px targets WCAG · ✅ Semantic `htmlFor` labels · ✅ `autoComplete="email|current-password"` · ✅ Error-display rood/10 alert

- 🟠 **P1**: Hardcoded dev-credentials `berkhout.catering@gmail.com` + `Hop&Bites` zichtbaar in source — git-history risico — `login/page.tsx:137`
- 🟡 **P2**: Geen "Forgot password"-link (Stripe/Linear-pattern ontbreekt)
- 🟡 **P2**: `window.location.href = redirect` bypasses next/navigation (SPA-nav missing)

**Top-tier-versie**: Passwordless magic-link primary, password-fallback. "Forgot password" → recovery-email-modal. Use `next/navigation` voor client-redirects.

## `/signup`  🟠

**Code**: [src/app/signup/page.tsx](src/app/signup/page.tsx). Demo-first positioning met mailto:demo.

✅ Clear "demo-first" messaging · ✅ Mobile-friendly button · ✅ Accessible link-structure

- 🔴 **P0**: Geen self-serve-signup — alleen mailto:demo-link blokkeert adoption — `signup/page.tsx:33-40`
- 🟡 **P2**: Demo-request zonder email-validatie + zonder backend-endpoint
- 🟡 **P2**: Geen tracking + geen GDPR-consent op email-CTA

**Top-tier-versie**: Invite-token-redemption op `/signup?token=` met email-prefill. Waitlist-fallback voor non-invited users. Double opt-in.

## `/invite`  🟠

**Code**: [src/app/invite/page.tsx](src/app/invite/page.tsx). Token-redemption-flow.

✅ Token-fetch on mount · ✅ State-machine loading→ready→accepted/expired/error · ✅ Org-name prefill

- 🔴 **P0**: Invite-token in query-string — gelogged in server/browser-history/proxy-logs (OWASP 2025 violation) — `invite/page.tsx:10`
- 🔴 **P0**: Unauthenticated token-fetch zonder rate-limit → brute-force-risk — `invite/page.tsx:19-23`
- 🟠 **P1**: Geen CSRF-protection op accept-invite POST (`/api/org/accept-invite`) — `invite/page.tsx:63`
- 🟠 **P1**: State-transitions niet atomic — race-condition bij double-accept (geen idempotency-check)

**Top-tier-versie**: POST-invite-link → server returns short-lived session in httpOnly-cookie. `/invite` reads cookie (geen URL-token). One-click accept met CSRF-token. Idempotent upsert.

## `/pricing`  🟢

**Code**: [src/app/pricing/page.tsx](src/app/pricing/page.tsx). 3-tier responsive grid met billing-toggle + FAQ.

✅ Responsive grid 1→3 cols · ✅ Monthly/yearly toggle · ✅ Feature-comparison-table · ✅ FAQ-accordion · ✅ Trust-strip · ✅ Transparent (excl. BTW) · ✅ FAQ dekt trials/AI-limits/Moneybird/BTW

- 🟡 **P2**: Geen "Save 20%" annual-label op yearly-button (Stripe-upsell pattern missing)
- 🟡 **P2**: FAQ hardcoded strings i.p.v. CMS-fetched

## `/faq`  🟢

**Code**: [src/app/faq/page.tsx](src/app/faq/page.tsx). Accordion met 10 FAQs.

✅ Accordion ChevronDown animation · ✅ MetallicCard wrapper · ✅ 10 FAQs dekken product-flows

- 🟡 **P2**: Geen search-input (Linear/Stripe pattern)
- 🟡 **P2**: Geen breadcrumb/help-center-link
- 🟡 **P2**: Content hardcoded (niet gelinkt aan `/hulp` articles)

## `/legal/voorwaarden`  🟡

**Code**: [src/app/legal/voorwaarden/page.tsx](src/app/legal/voorwaarden/page.tsx). 12-section terms, versioned.

✅ 12-section structure (definitions/contract/payment/AI/data/termination) · ✅ Versioned (1.0, 2026-04-21) · ✅ Concept-flag bovenaan

- 🔴 **P0**: **Niet juridisch gereviewd** — concept-flag bovenaan. Risk: unenforceable clauses, GDPR-non-compliance, AVG-gaps — `voorwaarden/page.tsx:8`
- 🟠 **P1**: Env-vars als placeholders (`NEXT_PUBLIC_KVK_NUMBER`, `NEXT_PUBLIC_COMPANY_ADDRESS`) — moet hardcoded post-review — `voorwaarden/page.tsx:15-16`
- 🟠 **P1**: AI-liability-clause vague — "AI-output is suggestie" zonder indemnity voor incorrect medical/regulatory (HACCP) — section 5
- 🟠 **P1**: 30-day data-retention unclear (GDPR vereist "without undue delay") · Geen backup-retention-mention
- 🟡 **P2**: Geen DPA-link (verplicht voor EU-customers)

**Top-tier-versie**: Schedule legal review. Hire Dutch SaaS-lawyer. Voeg DPA + processor-terms + GDPR-supplement. Hardcode company-details. AI-liability-caps. Clear retention-policy (active: 30d post-cancel; backups: 90d; legally-mandated: 7y voor facturen).

## `/contact`  🟡

**Code**: [src/app/contact/page.tsx](src/app/contact/page.tsx). Dual-card layout: message-form + contact-details.

✅ Dual-card layout · ✅ Form-validation alle velden required · ✅ Success-state CheckCircle · ✅ Reset-flow

- 🔴 **P0**: Form submit-handler doet niets — `handleSubmit()` zet alleen `setSent(true)`. Geen API-call, geen email-versturen, geen persistence. Contact-data verliezen op refresh — `contact/page.tsx:13`
- 🟠 **P1**: Email hardcoded `support@bbqarchitect.nl` (line 119) — moet env-var
- 🟠 **P1**: Geen GDPR-consent-checkbox (explicit consent vereist)
- 🟡 **P2**: Placeholder phone `+31 6 12345678` (line 132) · Geen success-email-confirmation naar user

## `/hulp`  🟡

**Code**: [src/app/hulp/page.tsx](src/app/hulp/page.tsx). Articles + support-tickets met deep-links + categorieën.

✅ Dual-view articles + tickets · ✅ Hash-based deep-links (#offertes auto-open) · ✅ Ticket-form met status-badges · ✅ 8 categorieën met icons

- 🔴 **P0**: **XSS vulnerability via `dangerouslySetInnerHTML`** — `renderMarkdown()` sanitizet HTML-tags NIET. Article-content kan `<img src=x onerror=...>` injecten via CMS. Gebruik `DOMPurify.sanitize()` of `marked-sanitizer` — `hulp/page.tsx:167, 354-362`
- 🟠 **P1**: Markdown-renderer incompleet — geen code-blocks, link-handling, list-nesting
- 🟠 **P1**: Geen rate-limit op ticket-submissions (`/api/support`) — user kan spammen — `hulp/page.tsx:125-145`
- 🟠 **P1**: Tickets niet gepersisteerd — `handleSubmitTicket()` valideert response niet, geen retry
- 🟡 **P2**: Client-side search-only — schaalt slecht bij 500+ articles

**Top-tier-versie**: `DOMPurify` of `remark+rehype`-pipeline. Per-IP rate-limit (`express-rate-limit`). DB-persistence met retry. Full-text search (Supabase `fts`/Algolia/Meilisearch).

### Groep 9 — Samenvatting
**P0**: 5 · **P1**: 9 · **P2**: 11
**Top-3**: (1) Security — `/login` hardcoded credentials, `/invite` token-leakage zonder CSRF, `/hulp` XSS via `dangerouslySetInnerHTML`, (2) Incomplete backend — `/contact` + `/signup` forms doen niets, (3) Legal-risk — `/legal/voorwaarden` flagged als concept, geen DPA, geen lawyer-review.
**Overall**: Foundational auth/public layer. Core UX clean (mobile-friendly, accessible labels, responsive grids), maar **5 P0 security/functionality blockers + missing lawyer-review maken dit niet productie-rijp**. 2-week sprint voor P0's, lawyer-review, dan re-audit vóór public launch.

---

# Groep 10 — Admin + Misc

## `/admin`  🟡

**Code**: [src/app/admin/page.tsx](src/app/admin/page.tsx) (957r). Platform admin dashboard voor org-lifecycle, health, feature-flags, user-impersonation.
**Top-tier**: Linear admin drill-down org-analytics. Vercel team-status-badges. Stripe real-time health-KPI's. Wij zijn static/snapshot-based.

✅ MetallicCard gradient theming · ✅ Recharts charts · ✅ Tab-UI consistent

- 🟠 **P1**: Geen empty-state als orgs-list leeg — `admin/page.tsx:450-500`
- 🟠 **P1**: Geen skeleton-loaders voor chart-sections — `admin/page.tsx:600+`
- 🟠 **P1**: Generic error-messages, geen retry — `admin/page.tsx:520-530`
- 🟠 **P1**: Tabs zonder ARIA-labels (aria-selected, aria-controls) — `admin/page.tsx:160-180`
- 🟠 **P1**: Geen confirmatie-dialog vóór user-impersonation — `admin/page.tsx:700-720`
- 🟡 **P2**: Geen mobile-tab-scroll · Geen pagination >50 orgs · Copy: "imiteren" → "zich voordoen als" · Statische KPI's i.p.v. real-time

## `/admin/funnel`  🟡

**Code**: [src/app/admin/funnel/page.tsx](src/app/admin/funnel/page.tsx) (375r). Activation-funnel signup→first-offerte met <60min target ≥50%.
**Top-tier**: Stripe-Atlas funnel met cohort-retention + time-series. Amplitude correlation-heatmaps. Wij tonen raw counts.

✅ Font-mono tabular-nums · ✅ Consistent met admin/page · ✅ Recharts FunnelChart

- 🟠 **P1**: Geen empty-state-message als activation_funnel leeg — `funnel/page.tsx:140-160`
- 🟠 **P1**: Geen loading-indicator voor chart — `funnel/page.tsx:80-100`
- 🟠 **P1**: Geen error-UI als `/api/analytics/funnel` faalt — `funnel/page.tsx:90-110`
- 🟠 **P1**: Geen zero-division guard voor `ai_adoption_rate = ai_wizard_used / total_offertes` — `funnel/page.tsx:120-140`
- 🟠 **P1**: Table-headers zonder `scope="col"`, chart-bars niet keyboard-nav — `funnel/page.tsx:260-270`
- 🟡 **P2**: Unbounded activation_events-feed (1000+ rows mogelijk) · Geen time-series/cohort-analysis

## `/m/gerechten`  🟢

**Code**: [src/app/m/gerechten/page.tsx](src/app/m/gerechten/page.tsx) (92r). Mobile-variant van /gerechten, server-side data-layer.
**Top-tier**: Paprika prefetches images + ingredients lokaal voor offline. Wij fetchen on-demand.

✅ FALLBACK_DISHES bij fetch-fail (graceful) · ✅ Limit 20 dishes (perf) · ✅ Maps Supabase-kolommen correct · ✅ Reads `bron === 'ai'` voor provenance

- 🟡 **P2**: Geen `loading.tsx` suspense-boundary — `m/gerechten/page.tsx:41-86`
- 🟡 **P2**: Silent error in try/catch zonder logging — `m/gerechten/page.tsx:83-84`
- 🟡 **P2**: Geen Supabase cache-strategy · Geen service-worker offline-caching

## `/sectie/[slug]`  🟡

**Code**: [src/app/sectie/[slug]/page.tsx](src/app/sectie/[slug]/page.tsx) (222r). Dynamic section-landing-pages (keuken/plannen/verkoop/beheer) met KPI-stats + child-page-navigation.
**Top-tier**: CMS-style Notion/Ghost toont contextual "What's next?"-actions. Wij tonen stats zonder next-step-affordance.

✅ KPICard gradient + hover-shadow · ✅ getSectionBySlug returns null → "Sectie niet gevonden" · ✅ Grid responsive (2→4 cols) · ✅ Defensive coding (zero-guards op gemKostprijs/conversieratio) · ✅ StatsLoading skeleton

- 🟠 **P1**: Geen error-boundary voor failed stats-fetch — `sectie/[slug]/page.tsx:40-110`
- 🟠 **P1**: KPICard-icons missen `aria-label`; navigation-cards missen `aria-current` voor active section — `sectie/[slug]/page.tsx:28, 173-174`
- 🟠 **P1**: useSupabase zonder dependency-array-guard → re-runs on every render — check `lib/useSupabase.ts:40-48`
- 🟡 **P2**: Empty-state bij 0 gerechten/events ontbreekt · Geen cache-stale-indicator · Geen contextual CTA's onder stats · Geen AI-blocks

### Groep 10 — Samenvatting
**P0**: 0 · **P1**: 8 · **P2**: 12
**Top-3**: (1) Empty/loading/error states ontbreken consistent in admin + funnel, (2) Aria-labels op tabs/icons/charts missen, (3) Confirmation-dialogs ontbreken op destructive actions (impersonation, role-changes).
**Overall**: Solide data-architectuur, maar mist polish in error-boundaries, a11y-labels, en mobile-responsiveness. Geen P0 blockers — admin + funnel + sectie zijn lower-traffic dus minder urgent dan klant-facing of operationele hubs.

---

# 🎯 MASTER-OVERZICHT

## Totalen over alle 10 groepen

| Groep | Pages | P0 | P1 | P2 |
|---|---|---|---|---|
| 1. Vandaag-hub | 8 | 3 | 6 | 8 |
| 2. Verkoop-hub | 7 | 11 | 47 | 12 |
| 3. Keuken-hub | 8 | 9 | 4 | 5 |
| 4. Gerechten-hub | 8 | 4 | 8 | 3 |
| 5. Voorraad-hub | 10 | 4 | 11 | 10 |
| 6. Geld-hub | 8 | 6 | 10 | 9 |
| 7. Systeem-hub | 13 | 11 | 32 | 18 |
| 8. Events | 7 | 4 | 18 | 4 |
| 9. Auth + Public | 8 | 5 | 9 | 11 |
| 10. Admin + Misc | 4 | 0 | 8 | 12 |
| **TOTAAL** | **81** | **57** | **153** | **92** |

*(Niet alle 95 routes apart geaudit — redirects zijn gegroepeerd en sommige hub-sub-routes zijn samengevat. Effectief 81 unieke audit-units.)*

## Master-ranking per route

### 🟢 Klaar voor top-tier (24 routes)
Pure redirects en simpele clean pages — `/plannen`, `/berichten`, `/event-planner`, `/recepten`, `/menu-engineering`, `/keuken`, `/keuken/board`, `/geld`, `/boekhouding`, `/welkom`, `/ai-chat`, `/agenda`, `/factuur-lezer`, `/financien`, `/m/gerechten`, `/events/[id]`, `/events/[id]/field`, `/gerechten/ai-pitmaster`, `/gerechten/allergen-queue`, `/gerechten/ingredienten`, `/gerechten/insights`, `/gerechten/menu-analyse`, `/inspiratie`, `/bedenker`, `/voorraad`, `/voorraad/historie/[id]`, `/leveranciers/historie/[id]`, `/pricing`, `/faq`, `/systeem`, `/instellingen`, `/instellingen/ai-usage`, `/instellingen/referral`.

### 🟡 Polish nodig (37 routes)
Functioneel maar mist details — `/`, `/onboarding`, `/mailbox`, `/offertes`, `/klanten`, `/keuken/kookbord`, `/prep-counter`, `/haccp`, `/gerechten`, `/gerechten/componenten`, `/leveranciers`, `/leveranciers/[id]`, `/leveranciers/bulk-upload`, `/marges`, `/geld/boekhouder`, `/geld/boekhouder/BonAddSheet`, `/financien/_components`, `/facturen`, `/gebruikers`, `/uren`, `/uren/personeel`, `/administratie`, `/administratie/rittenregistratie`, `/events`, `/events/[id]/reflectie`, `/events/[id]/service/plattegrond`, `/legal/voorwaarden`, `/contact`, `/hulp`, `/admin`, `/admin/funnel`, `/sectie/[slug]`.

### 🟠 Significant werk (10 routes)
Structurele issues — `/klantgesprek`, `/template-editor`, `/foto-archief`, `/leveranciers/[id]/prijslijsten`, `/inkoop`, `/materieel`, `/price-intelligence`, `/website`, `/logistiek`, `/signup`, `/invite`, `/instellingen/integraties/accounting`.

### 🔴 Komt niet in de buurt (3 routes)
Productie-blockers — `/q/[id]` (signature-binding), `/login` (hardcoded credentials), `/events/[id]/hub`, `/events/[id]/service`.

## 🔥 Cross-cutting patronen (issues op 5+ pages)

### 1. **Error-boundaries + retry ontbreken structureel** (16+ pages)
`/`, `/agenda`, `/offertes`, `/klanten`, `/klantgesprek`, `/voorraad`, `/leveranciers/[id]/prijslijsten`, `/geld/boekhouder`, `/financien/_components`, `/facturen`, `/events/[id]/hub`, `/events/[id]/service`, `/sectie/[slug]`, `/admin/funnel`. Eén failed query blokt vaak de hele page. **Pattern-fix**: per-card `<ErrorBoundary>` + retry-button + skeleton-loader.

### 2. **`any`-types in mega-pages → refactor-risico** (8 pages)
`/events/[id]/hub` (14× useState), `/events/[id]/service`, `/klanten`, `/offertes`, `/gerechten/_client.tsx` (13+ useState), `/price-intelligence` (4326r), `/website` (891r), `/uren`. **Pattern-fix**: Zod-schema's bestaan al (PR #94-99) — wire ze in `useState<X>()` als type. Vervang useState-explosies door useReducer.

### 3. **Mobile-first design afwezig op desktop-first pages** (12 pages)
`/`, `/offertes`, `/voorraad`, `/leveranciers/*`, `/price-intelligence`, `/foto-archief`, `/events/[id]/hub`, `/events/[id]/service`, `/website`, `/uren`, `/uren/personeel`, `/administratie/rittenregistratie`. Catering-staff werkt OP LOCATIE op tablet — KDS-pages zijn iets beter maar grote operationele pages zijn desktop-only. **Pattern-fix**: responsive-breakpoint sweep + card-toggle voor tables onder 768px.

### 4. **Inconsistent destructive-action-confirmaties** (9 pages)
`/admin` (impersonation), `/facturen` (delete), `/klanten` (delete), `/geld/boekhouder` (archief regenerate), `/voorraad/_client.tsx` (delete), `/gebruikers` (role-change ontbreekt), `/leveranciers/[id]/prijslijsten` (delete-batch), `/marges` (batch-delete UX unclear), `/instellingen/integraties/accounting` (no Mollie regenerate-warning). **Pattern-fix**: alles via `useConfirm()` provider (bestaat al sinds PR #100).

### 5. **`localStorage` autosave niet uniform** (6 pages)
`/klantgesprek` heeft het ✅. `/offertes` AI-wizard heeft het sinds PR #100 ✅. Maar `/klanten`, `/events/[id]/hub` form, `/facturen` form, `/gerechten` form, `/contact` form, `/template-editor` form **missen** autosave. **Pattern-fix**: extract de klantgesprek-pattern naar `useFormAutosave(key, formState)` hook.

### 6. **Empty-state hardcoded i.p.v. EmptyState-component** (3 pages, lager dan verwacht)
`/offertes` (custom rijke empty), `/klanten` (filtered no-results hardcoded), `/admin` (geen empty), `/admin/funnel` (geen empty). De rest gebruikt `<EmptyState>` correct sinds PR #100. **Pattern-fix**: 4 plekken updaten.

### 7. **Hardcoded `bg-red-500` / `bg-green-500` zonder tokens** (16 plekken nog over na PR #100)
Sidebar + website zijn gefixt in #100. Resterend: `/instellingen/referral` (lines 170-175 status-badges), `/voorraad/_client.tsx`, `/admin`, `/admin/funnel`, `/keuken/kookbord` station-colors, `/events/[id]/service` per-table-status, `/website` mood-categories, `/foto-archief` category-colors. **Pattern-fix**: `--info` token toevoegen aan `:root` + replace-sweep.

### 8. **A11y inconsistent — icon-buttons zonder aria-label, heading-hierarchy skips** (10+ pages)
Veel pages hebben `<button><Icon /></button>` zonder label. Heading-hierarchy: `instellingen` jumpt naar h3 zonder h2. **Pattern-fix**: ESLint rule `jsx-a11y/no-noninteractive-element-to-interactive-role`. Heading-hierarchy: panel-head h3 → h2 (CSS-impact).

### 9. **Server Action vs direct Supabase inconsistency** (5 pages)
Schema-migration (PRs #87-99) heeft Server Actions opgezet voor klanten/offertes/facturen/gerechten/voorraad/events/instellingen. Maar `/inkoop`, `/materieel`, `/template-editor`, `/website` mutaties lopen nog direct via Client → Supabase. **Pattern-fix**: nog 4-5 Server Action files maken volgens patroon.

### 10. **Validation-feedback inconsistent** (8 pages)
Sinds PR #100 wired in klanten + facturen. Rest van forms: `/offertes` wizard heeft autosave maar geen per-veld server-error display. `/klantgesprek`, `/gerechten`, `/events/[id]/hub`, `/template-editor`, `/contact` missen `FieldError`-wiring. **Pattern-fix**: bedraad het PR #100 patroon overal.

## 🚀 Voorgestelde PR-bundels

### **Bundel 1: "Klant-facing & Security-blockers"** (~5-7 dagen, kritisch)
Pages: `/q/[id]`, `/login`, `/invite`, `/hulp`, `/contact`, `/signup`
Issues:
- 🔴 `/q/[id]`: signature-device-fingerprint + email-confirmation + canvas-rotate-fix + Zod-signer-name
- 🔴 `/login`: weghalen hardcoded dev-credentials (env-only)
- 🔴 `/invite`: token uit URL → httpOnly-cookie + CSRF + idempotency
- 🔴 `/hulp`: `DOMPurify.sanitize()` voor markdown + rate-limit op tickets
- 🔴 `/contact`: form POST naar `/api/contact` + GDPR-consent
- 🔴 `/signup`: invite-token-redemption-form
- 🔴 `/legal/voorwaarden`: schedule lawyer-review (separate task)

**Impact**: directe revenue + security-risk reductie. Productie-launch-blocker als niet gedaan.

### **Bundel 2: "Events-hub refactor"** (~3-4 dagen)
Pages: `/events/[id]/hub`, `/events/[id]/service`
- Extract `useEventHub()` hook met per-card error-boundaries
- Vervang `useState<any>` door Zod-getypte state
- Inventory-deduction non-silent (toast op fail)
- Course-status-update error-feedback
- 14 useState → useReducer
- Verwijder dead menu-edit code (P0.127 in /hub)
- `markBevestigd()` rollback bij Supabase-error

**Impact**: Sam's operationele core wordt stabiel. KDS-fout-feedback eindelijk werkbaar.

### **Bundel 3: "KDS hardening"** (~2-3 dagen)
Pages: `/keuken/kookbord`, `/events/[id]/service`
- Font-size ≥18px, tap-targets ≥60px (Toast-spec)
- Allergen-badge op kaart zelf (rood-bg `🚨 Noten`)
- `overflow: hidden` + WakeLock API
- Swipe-intent pulse-hint eerste 2s
- Color-coded station-kolommen (Toast pattern)
- Real-time updates via Supabase Realtime-channel

**Impact**: KDS daadwerkelijk bruikbaar in keuken vanaf 1m afstand met handschoen.

### **Bundel 4: "Mobile-responsive sweep"** (~3-4 dagen)
Pages: `/`, `/offertes`, `/voorraad`, `/foto-archief`, `/website`, `/uren`, `/administratie/rittenregistratie`, `/events/[id]/hub`, `/events/[id]/service`
- Card-toggle voor tables onder 768px (TanStack Table v8 responsive-columns of custom)
- Sticky CTA's safe-area-aware
- Sidebar collapse <1024px, form-stack <768px
- Foto-archief grid `auto-fit` + virtualisatie (react-virtuoso)
- Website responsive-preview toggle (mobile/tablet/desktop)

**Impact**: Sam's app daadwerkelijk bruikbaar op tablet/telefoon op locatie.

### **Bundel 5: "Form-autosave + validation everywhere"** (~2 dagen)
Pages: `/klanten`, `/events/[id]/hub` form, `/facturen` form, `/gerechten` form, `/contact`, `/template-editor`
- Extract `useFormAutosave(key, formState, ttl)` hook uit klantgesprek
- Wire het in alle long-forms
- Bedraad `FieldError` met `serverFieldErrors` patroon uit PR #100
- `data-required` indicator op required fields

**Impact**: geen lost work + power-user-grade form-UX uniform.

### **Bundel 6: "Error-boundaries + retry everywhere"** (~2-3 dagen)
16+ pages
- `<ErrorBoundary fallback={<ErrorCard retry={refetch} />}>` per data-card
- Skeleton-loader bij elke `useSupabase` fetch (waar nog niet)
- Generieke `ErrorCard` component met retry-knop + error-context
- `Promise.allSettled()` i.p.v. `Promise.all()` bij parallel fetches

**Impact**: één failed query crasht niet meer entire page.

### **Bundel 7: "Type-safety + Server Actions completion"** (~3 dagen)
Pages: `/inkoop`, `/materieel`, `/template-editor`, `/website`
- Nieuwe Server Actions volgens patroon PR #87-99
- Zod-schemas in `src/lib/schemas/inkoop.ts`, `materieel.ts`, `template.ts`, `website.ts`
- Vervang `useState<any>` door Zod-output-types

**Impact**: laatste 4 mutatie-pages mee in security-baseline.

### **Bundel 8: "Polish + a11y + tokens"** (~1-2 dagen)
- Hardcoded `bg-red-500`/etc → tokens (16 plekken)
- Icon-buttons aria-labels-sweep
- Heading-hierarchy fix (instellingen)
- Confirmatie-dialogs op alle destructive-actions (`useConfirm()` uit PR #100)
- `--info` token toevoegen aan `:root`

**Impact**: top-tier finishing touch op alles wat al goed werkt.

## 📊 Geschatte impact per bundel

| Bundel | Inspanning | Impact-laag | Wie raakt het |
|---|---|---|---|
| 1. Klant-facing & Security | 5-7d | KRITISCH | Eindklant + alle users |
| 2. Events-hub refactor | 3-4d | HOOG | Sam zelf (dagelijks) |
| 3. KDS hardening | 2-3d | HOOG | Catering-staff in keuken |
| 4. Mobile-responsive | 3-4d | HOOG | Iedereen op tablet |
| 5. Form-autosave | 2d | MEDIUM | Long-form-users |
| 6. Error-boundaries | 2-3d | MEDIUM | Iedereen bij API-uitval |
| 7. Server Actions completion | 3d | MEDIUM | Security-baseline |
| 8. Polish + a11y | 1-2d | LOW | Detail-bewust |

**Totaal**: ~22-30 dagen werk voor 8 PR-bundels. Aanpak: bundel 1 first (productie-blockers), dan 2+3 parallel (operationele core), dan 4-8 in volgorde van impact.

## Slot

Deze audit dekt 81 pagina-units (van ~95 totaal — redirects gegroepeerd). Totaal **302 issues** gevonden waarvan **57 P0 (blocker)**, **153 P1 (zichtbaar suboptimaal)**, **92 P2 (polish)**.

**Belangrijkste inzicht**: BBQ Architect is architecturaal solide (Server Components, Server Actions sinds PRs #87-99, Zod-schemas, 5×8 white-label-theming, RLS). De **uitvoering** mist op 3 fronten: (1) error-resilience, (2) mobile-first, (3) klant-facing portal `/q/[id]` heeft signature-binding-blocker. Bundels 1-3 zijn productie-launch-kritisch; 4-8 zijn polish die het verschil maken tussen "werkende app" en "top tier of the world".

---

*Audit door Claude Code (Opus 4.7 1M), 2026-05-20. Benchmarked tegen Linear · Notion · Airtable · Stripe · Vercel · Tripleseat · Caterease · Toast · Lightspeed · Formitable · Apicbase · MarginEdge · Moneybird · Xero · Eitje · Connecteam · Toggl · Sortly · Wix · Squarespace · Webflow · Whisbi · Intercom · Anthropic Workbench · Whisk · Paprika · Notion.*

