# BBQ Architect v2 — Full UX Audit & Strategy Report

**Date:** 2026-04-07 (initial audit) · 2026-05-15 (mobile-sweep follow-up)
**Scope:** Full application responsive audit, competitive benchmarking, UX strategy
**Application:** BBQ Architect — Hop & Bites Command Center
**Stack:** Next.js 16, React 19, Tailwind CSS (CDN), Supabase

---

## 2026-05-15 — Mobile-sweep update

Brief: Sam's prompt "loop de app volledig langs dat alles op de telefoon klopt, letters, workflow, knoppen — meerdere pagina's niet handig op de telefoon, je ziet niet alles, afgesneden beeld als ware."

**Methode:** preview-tool viewport 390×844 (iPhone 14), elke hub langsgelopen. Plan in `~/.claude/plans/loop-de-app-volledig-resilient-sunset.md`.

**Wat is gefixed:**

| Laag | Fix | Bestand |
|---|---|---|
| Tokens | `min-h-touch` (44px) en `min-h-field` (56px) Tailwind utilities | [tailwind.config.ts](tailwind.config.ts) |
| Button | `sm` variant 36→44px globaal · nieuwe `touch` size (56px) voor Lars-context | [src/components/Button.tsx](src/components/Button.tsx) · `.btn-touch` in globals.css |
| Floor | `.btn-icon` expliciet 44×44 (was alleen aspect-ratio); icon-button min-width 44px op mobile (was 36) | [globals.css](src/app/globals.css) |
| BottomNav-clearance | `#main-content` padding-bottom 60→72px op mobile + edge-padding 12→16px | [globals.css](src/app/globals.css) |
| FAB | `display:none` op `max-width: 767px` (styled-jsx leak via Turbopack) | [globals.css](src/app/globals.css) |
| Breadcrumb | `padding-left: 68px` op mobile zodat tekst niet onder hamburger valt | [globals.css](src/app/globals.css) |
| EventHero (Vandaag) | Label-row wrap + grid 1-kolom stack op 390px (was "PARTICULI..." afgesneden) | [EventHero.tsx](src/components/dashboard/today/EventHero.tsx) + globals.css |
| Event stats (Events hub) | `.ev-next-stats` 4→2 kolommen op mobile ("DAGEN TE GAAN" was afgesneden) | [redesign.css](src/components/redesign/redesign.css) |
| Inspiratie / Hub-hero | `.eh-hero-content` 2-col → 1-col stack; stats-strip 5-col → 2-col met odd-border-right | [redesign.css](src/components/redesign/redesign.css) |
| Klanten lijst | Pill `flex-shrink: 0` + naam wrap zodat "ZAKELI[jk]" niet afgesneden bij lange klantnamen | [klanten/page.tsx](src/app/klanten/page.tsx) |
| Financiën year-nav | Inline-flex wrapper i.p.v. losse buttons (was elk op eigen regel via `.page-actions > button` 50%-rule) | [financien/page.tsx](src/app/financien/page.tsx) |
| Price-Intelligence inbox-banner | Email-block + Kopieer-knop stacken op mobile (was knop afgesneden rechts) | [FolderInbox.tsx](src/app/price-intelligence/_components/FolderInbox.tsx) + globals.css |
| Uren PunchPanel | Desktop 3-col grid stackt op mobile naar 1-col (Klok-knop / status-text / event-select) — fix voor woord-per-regel "Klaar / voor / service" bug | [PunchPanel.tsx](src/components/uren/PunchPanel.tsx) + globals.css |
| ScanFab | Verplaatst naar `left: 16` op mobile zodat hij niet overlapt met MobileCmdKTrigger rechts | [globals.css](src/app/globals.css) |
| Dashboard header | Spacer w-8→w-12 zodat hamburger (44px) niet onder titel duwt · datum compact (dd mmm) op mobile · Bell-button 44×44 met aria-label | [src/app/page.tsx](src/app/page.tsx) |
| BottomNav match | Klanten verwijderd uit Geld-tab (hoort onder Verkoop-hub, niet Geld) | [BottomNav.tsx](src/components/BottomNav.tsx) |

**Hubs doorgelopen op 390px:** Vandaag · Plannen (Agenda/Events) · Verkoop (Offertes/Facturen/Klanten) · Inspiratie (Hub/Componenten/Gerechten) · Voorraad (Voorraad/Leveranciers/Price-Intelligence) · Geld (Financiën/Uren) · Systeem (Instellingen) · Critical-path (HACCP/Menu-Engineering/AI-Chat).

**Verwachte effect:**
- Touch-target violations (was 81%) → < 5% op alle hub-pages
- Tekst-elementen < 12px (was 94) → grotendeels via `.text-xs { font-size: 12px }`-cascade in mobile media-query
- Horizontal-scroll bugs (afgesneden beeld) → 0 op hub-pages
- Lighthouse Mobile Accessibility verwacht > 85 (was ~30 in april)

**Niet opgelost (bewuste scope-grens):**
- 1230 inline `style={{fontSize}}` resterend in `/price-intelligence`, `/admin`, en sommige event-detail-pages — global mobile CSS overrides catchen ≥9px/10px/11px maar individuele page-rewrites zijn aparte ronde
- `.eh-countdown-ring` SVG-attrs nog inline (kan via viewBox scaleable maken, niet kritiek)
- `/q/[id]` klantportaal niet visueel gechecked (geen test-public_id beschikbaar; component gebruikt al `StickyMobileCTA` patroon)
- `/menu-engineering` (legacy /marges) hero op mobile niet volledig gecontroleerd

---

---

## Executive Summary

BBQ Architect has a visually polished dark-theme interface with strong desktop aesthetics, but the responsive audit reveals **systemic mobile/tablet usability failures** across all 15+ audited screens. The average touch target violation rate is **81%**, accessibility is near-zero (1 ARIA attribute on the entire dashboard), and 94 text elements are below 12px on mobile. These issues make the app effectively unusable for the field contexts (kitchen, events, delivery) that are critical for a catering business.

### Critical Numbers at a Glance

| Metric | Current | Target |
|--------|---------|--------|
| Average touch target violation rate (320px) | **81%** | < 5% |
| ARIA attributes on dashboard | **1** | 50+ |
| Role attributes | **0** | All interactive elements |
| Focus-visible indicators | **0** | All focusable elements |
| Text elements < 12px (mobile) | **94** | 0 |
| Skip navigation link | **No** | Yes |
| WCAG AA contrast failures | **1 pair** | 0 |
| Breakpoint system | **7 ad-hoc** | 4 systematic |
| Styling systems in use | **3 mixed** | 1 (Tailwind-first) |

---

## 1. Problem Framing

### The Challenge
How do we ensure UX quality across a complex 20+ screen enterprise app used by catering professionals in 5 distinct contexts with different devices, hand availability, and attention constraints?

### User Contexts

| Context | Device | Hands | Attention | Key Screens | Current Readiness |
|---------|--------|-------|-----------|-------------|-------------------|
| Office planning | Desktop/laptop | Both free | Full | Dashboard, offertes, financien | OK (desktop works) |
| Kitchen/prep | Tablet (mounted) | Gloved/wet | Split | Recepten, gerechten, HACCP | CRITICAL FAIL |
| Event on-site | Phone | One hand | Minimal | Events detail, uren, logistiek | CRITICAL FAIL |
| Delivery/van | Phone | One hand | Minimal | Logistiek, materieel | CRITICAL FAIL |
| Client meeting | Tablet/laptop | Both free | Shared | Offertes, menu-engineering | FAIL |

### Success Criteria
1. All touch targets >= 44px on mobile/tablet
2. Critical field tasks completable in <= 3 taps
3. WCAG 2.1 AA compliance (contrast, focus, ARIA)
4. Consistent responsive behavior across 4 systematic breakpoints
5. No layout breaks at any width 320px-1440px+
6. No text below 12px on any viewport
7. Proper heading hierarchy without skips

---

## 2. Competitive Benchmark

### Direct Catering SaaS Competitors

| Feature | CaterTrax | Total Party Planner | Better Cater | Flex Catering | CaterZen |
|---------|-----------|--------------------|--------------| --------------|----------|
| **Platform** | Web + mobile | Web only | Web + mobile | Web + mobile app | Web + mobile |
| **Mobile approach** | Responsive + native app | Desktop-focused | Responsive | Native iOS/Android | Responsive |
| **Navigation** | Top bar + sidebar | Sidebar | Top tabs | Bottom tab bar (mobile) | Sidebar |
| **Field features** | Event day-of tools | Limited | Real-time orders | Driver tracking, live orders | Kitchen display |
| **Touch optimization** | Good (44px+ targets) | Poor | Moderate | Good (native) | Moderate |
| **Offline support** | Partial | None | None | Yes (native app) | None |

### Key Competitive Gaps for BBQ Architect
1. **No native mobile app or PWA** — CaterTrax and Flex Catering offer dedicated mobile experiences
2. **No field-optimized views** — competitors offer day-of event tools, kitchen displays, driver views
3. **No offline capability** — critical for on-site events without reliable connectivity
4. **Touch targets far below industry standard** — even web-only competitors have better mobile usability
5. **No bottom navigation on mobile** — Flex Catering and modern apps use thumb-zone-friendly bottom nav

### Competitive Strengths of BBQ Architect
1. **Visual design quality** — dark theme, glass morphism, animations are best-in-class aesthetically
2. **Feature completeness** — most comprehensive single-app solution (menu engineering, HACCP, AI, financials)
3. **AI integration** — unique differentiator (Pitmaster Studio) vs all competitors
4. **Real-time sync** — Supabase real-time gives live updates across devices
5. **Custom quotation builder** — more sophisticated than most competitors

---

## 3. Responsive Audit Results

### Touch Target Violations by Page (320px Mobile)

| Page | Total Elements | Violations | Rate | Severity |
|------|---------------|------------|------|----------|
| HACCP | 164 | 154 | **94%** | CRITICAL |
| Menu Engineering | 91 | 81 | **89%** | CRITICAL |
| Events | 79 | 69 | **87%** | CRITICAL |
| Voorraad | 80 | 70 | **88%** | CRITICAL |
| Offertes | 58 | 48 | **83%** | CRITICAL |
| Uren | 58 | 48 | **83%** | CRITICAL |
| Facturen | 56 | 46 | **82%** | CRITICAL |
| Recepten | 55 | 45 | **82%** | CRITICAL |
| Klanten | 55 | 45 | **82%** | CRITICAL |
| Materieel | 53 | 43 | **81%** | CRITICAL |
| Gerechten | 55 | 42 | **76%** | HIGH |
| Agenda | 50 | 37 | **74%** | HIGH |
| Inkoop | 53 | 38 | **72%** | HIGH |
| AI Chat | 60 | 43 | **72%** | HIGH |
| Dashboard | 70 | 46 | **66%** | HIGH |

**Average violation rate: 81%**

### Touch Target Violations at Tablet (768px)

| Page | Violations | Rate |
|------|------------|------|
| HACCP | 154/164 | **94%** (no improvement) |
| Events | 68/78 | **87%** (no improvement) |
| Agenda | 41/51 | **80%** |
| Dashboard | 39/70 | **56%** (some improvement) |

### Breakpoint Behavior Summary

| Breakpoint | Sidebar | KPI Grid | Layout Issues |
|------------|---------|----------|---------------|
| 320px | Hidden (hamburger 34.5px) | 2-col (167px each) | H3 headings at 10.5px |
| 375px | Hidden (hamburger 34.5px) | 2-col (167px each) | H3 headings at 10.5px |
| 768px | Off-screen (x=-280) | 4-col (165px each) | Calendar grid 18px cols |
| 1024px | Off-screen (x=-280) | 4-col | Sidebar should show |
| 1280px | Off-screen (x=-280) | 4-col (293px each) | Sidebar should show |

**Key finding:** Sidebar is off-screen (x=-280) even at desktop widths, suggesting it defaults to collapsed state. At 1280px+, the sidebar should be visible by default.

### Typography Audit (320px Mobile)

| Font Size | Element Count | Assessment |
|-----------|--------------|------------|
| 14px | 101 | OK (most common) |
| 13px | 52 | Borderline |
| 10px | 53 | TOO SMALL |
| 11px | 28 | TOO SMALL |
| 9px | 12 | FAR TOO SMALL |
| 13.3333px | 18 | Non-standard scaling |

**94 text elements below 12px minimum** — including badge counts (9px), dates (10px), section headers (10.5px), and brand text (9px).

### Layout Grid Analysis

| Page | Grid Pattern | Mobile Behavior | Issue |
|------|-------------|-----------------|-------|
| Dashboard KPI | 4-col desktop | 2-col mobile | OK |
| Agenda | 87px + 380px at md | Calendar 7x18px cols | CRITICAL: unusable |
| Offertes | Inline form + list | Stacked | 661-line form needs extraction |
| HACCP | Multiple data grids | Stacked | 94% elements too small |

### Color Contrast Results

| Pair | Ratio | WCAG AA Normal | WCAG AA Large |
|------|-------|----------------|---------------|
| #f8f8f8 on #121214 (text on bg) | 17.62:1 | PASS | PASS |
| #f8f8f8 on #1e1e22 (text on card) | 15.64:1 | PASS | PASS |
| #828282 on #121214 (muted on bg) | 4.87:1 | PASS | PASS |
| #828282 on #1e1e22 (muted on card) | **4.32:1** | **FAIL** | PASS |
| #FFBF00 on #121214 (brand on bg) | 11.32:1 | PASS | PASS |
| #22c55e on #121214 (green on bg) | 8.21:1 | PASS | PASS |
| #ef4444 on #121214 (red on bg) | 4.97:1 | PASS | PASS |

**1 failure:** Muted text (#828282) on card background (#1e1e22) at 4.32:1 — needs to be >= 4.5:1. Fix: lighten muted to #8f8f8f (~4.7:1) or #949494 (~5.0:1).

---

## 4. Accessibility Audit

### Current State: CRITICAL

| Category | Finding | Severity |
|----------|---------|----------|
| ARIA attributes | 1 total (aria-label) on dashboard | CRITICAL |
| Role attributes | 0 across entire page | CRITICAL |
| Focus indicators | 0 focus-visible styles | CRITICAL |
| Skip navigation | Missing | HIGH |
| Heading hierarchy | No skips (h1>h2>h3) | PASS |
| Language attribute | `lang="nl"` set | PASS |
| Image alt text | 0 images (uses SVG icons) | N/A |
| Form labels | Most rely on placeholder only | HIGH |
| Keyboard navigation | No focus trap in modals | HIGH |
| Screen reader support | Effectively zero | CRITICAL |

### Required Remediation

1. **All interactive elements need ARIA labels** — buttons, links, inputs
2. **All expandable sections need aria-expanded** — sidebar folders, accordion panels
3. **Modal/slide-over panels need focus trap** — SlideOverPanel, EventWizard, dialogs
4. **Add role attributes** — navigation, main, complementary, dialog, alert
5. **Add skip link** — `<a href="#main" class="sr-only focus:not-sr-only">`
6. **Add focus-visible styles** — visible focus ring on all interactive elements
7. **Form inputs need associated labels** — not just placeholders
8. **Live regions for dynamic content** — toast notifications, real-time updates

---

## 5. UX Strategy — 6 Pillars

### Pillar 1: Responsive System (CRITICAL)

**Current:** 7 ad-hoc breakpoints (480, 600, 768, 900, 1024, 1200, 1280px)
**Target:** 4 systematic tiers

| Tier | Range | Columns | Sidebar | Content Width |
|------|-------|---------|---------|---------------|
| sm | 0-639px | 1 | Hidden (hamburger 44px+) | Full width, px-4 |
| md | 640-1023px | 2 | Collapsible overlay | Full width, px-6 |
| lg | 1024-1279px | 3 | Persistent, collapsed (icons) | calc(100% - 64px) |
| xl | 1280px+ | 4 | Persistent, expanded (240px) | calc(100% - 240px) |

**Implementation priority:**
1. Set minimum interactive element height to 44px globally
2. Consolidate breakpoints in globals.css
3. Add bottom navigation bar for mobile (sm tier)
4. Fix sidebar default state per breakpoint

### Pillar 2: Information Architecture

**Current:** 9 sections, 30+ pages, deep nesting
**Issues:**
- Too many top-level sections for mobile navigation
- Some redundant paths (Events + Event Planner + Agenda)
- Secondary sections (Systeem, Communicatie, Website, Hulp) clutter the sidebar

**Recommendations:**
1. Consolidate to 5 primary sections for mobile: Keuken, Operatie, Zaak, Beheer, AI
2. Move secondary sections to Settings/Profile
3. Add mobile bottom bar with 5 key destinations
4. Implement Command Palette (Cmd+K) as primary power-user navigation

### Pillar 3: Interaction Consistency

**Current:** Mixed CRUD patterns across pages
- Some use inline forms (Offertes — 661 lines inline)
- Some use SlideOverPanel
- Some use full-page forms
- Some use modal dialogs

**Standard pattern to adopt:**

| Action | Desktop | Mobile |
|--------|---------|--------|
| Create | SlideOverPanel (right) | Full-screen sheet (bottom) |
| Edit | SlideOverPanel (right) | Full-screen sheet (bottom) |
| Quick action | Popover/dropdown | Action sheet (bottom) |
| Delete | ConfirmDialog (center) | ConfirmDialog (center) |
| View detail | Side panel or inline expand | Full-screen page |

### Pillar 4: Accessibility Remediation

**Priority order:**
1. Add `role` and `aria-label` to all interactive elements
2. Add focus-visible ring styles globally (2px solid var(--brand), offset 2px)
3. Add skip navigation link
4. Add focus trap to SlideOverPanel and all modals
5. Add aria-expanded to all collapsible sections
6. Add aria-live="polite" to toast/notification containers
7. Associate all form labels with inputs (not placeholder-only)
8. Fix muted text contrast (#828282 -> #949494 on cards)

### Pillar 5: Performance

**Current issues:**
- Tailwind CSS loaded via CDN (no tree-shaking, ~300KB uncompressed)
- jsPDF loaded `beforeInteractive` in layout.tsx (blocks page load, used only for PDF generation)
- Font Awesome via CDN (loads entire icon set)
- No skeleton loading states

**Recommendations:**
1. Install Tailwind as dev dependency, configure PostCSS purging
2. Move jsPDF to dynamic `import()` — only load when generating PDFs
3. Replace Font Awesome CDN with Lucide React (already installed) for consistency
4. Add skeleton loading components for data-heavy pages
5. Implement `loading.tsx` files in Next.js App Router for route transitions

### Pillar 6: Visual Consistency

**Current:** 3 parallel styling systems intermixed
1. CSS custom classes in globals.css (.panel, .stat-card, .pill, .btn)
2. Tailwind utility classes (inline)
3. Inline `style={}` props

**Consolidation plan:**
1. Migrate custom CSS classes to Tailwind `@apply` or component-level classes
2. Remove inline styles — convert to Tailwind utilities
3. Extract design tokens into tailwind.config.ts:
   - Colors: brand, bg, card, border, text, muted, status colors
   - Spacing: sidebar-w (240px), header-h (56px)
   - Effects: glass-blur, glass-border, lift-shadow
4. Create shared component variants (Button, Card, Badge, Input) with consistent sizing

---

## 6. Screen-by-Screen Recommendations

### Severity Rating Scale
- **CRITICAL** — Unusable in target context, blocks core workflow
- **HIGH** — Significantly impairs usability, frequent user friction
- **MEDIUM** — Noticeable issue, workaround exists
- **LOW** — Minor polish, nice-to-have

### Priority 1 Screens

#### Dashboard (`src/app/page.tsx`)
| Issue | Severity | Fix |
|-------|----------|-----|
| H3 headings at 10.5px on mobile | HIGH | Min 14px for all headings |
| 66% touch target violations | HIGH | Set min-height: 44px on all interactive elements |
| KPI cards cramped at 320px | MEDIUM | Allow horizontal scroll or stack to 1-col below 375px |
| Sidebar defaults to collapsed even at xl | MEDIUM | Auto-expand sidebar at >= 1280px |

#### Agenda (`src/app/agenda/page.tsx`)
| Issue | Severity | Fix |
|-------|----------|-----|
| 7-col calendar grid 18px wide per col | CRITICAL | Add day/3-day/list view toggle for mobile |
| 74% touch target violations | CRITICAL | Minimum 44px tap targets for all calendar cells |
| No swipe gesture for week navigation | HIGH | Add touch swipe left/right for week nav |
| Calendar unusable below 768px | CRITICAL | Default to list view on sm breakpoint |

#### Events (`src/app/events/page.tsx`)
| Issue | Severity | Fix |
|-------|----------|-----|
| 87% touch target violations | CRITICAL | Increase all card/button heights to 44px+ |
| Event cards too dense for field use | HIGH | Simplified card with large status badge + key info only on mobile |
| No quick-action buttons for on-site use | HIGH | Add floating action buttons: "Log Hours", "Check In", "Call Client" |

#### Offertes (`src/app/offertes/page.tsx`)
| Issue | Severity | Fix |
|-------|----------|-----|
| 661-line inline form mixed with list | HIGH | Extract form to SlideOverPanel or separate page |
| 83% touch target violations | CRITICAL | Increase all input/button heights |
| Select dropdowns only 30px tall | HIGH | Minimum 44px height for all form controls |
| Form inputs 38px height | HIGH | Increase to 48px minimum on mobile |

#### Facturen (`src/app/facturen/page.tsx`)
| Issue | Severity | Fix |
|-------|----------|-----|
| 82% touch target violations | CRITICAL | Global 44px minimum height |
| Financial data dense on mobile | HIGH | Card-based view instead of table on mobile |
| Status actions too small | HIGH | Large status pills with tap action |

#### HACCP (`src/app/haccp/page.tsx`)
| Issue | Severity | Fix |
|-------|----------|-----|
| 94% touch target violations — WORST PAGE | CRITICAL | Complete mobile redesign needed |
| Median element height 31px | CRITICAL | All elements 48px+ for gloved-hand use |
| No large +/- stepper for temperature | CRITICAL | Add 64px +/- buttons for temperature input |
| 164 interactive elements at 320px | HIGH | Progressive disclosure — show only current task |
| No voice input for notes | MEDIUM | Add speech-to-text for HACCP notes |

#### Uren (`src/app/uren/page.tsx`)
| Issue | Severity | Fix |
|-------|----------|-----|
| 83% touch target violations | CRITICAL | 44px minimum for all time entry controls |
| Time logging needs one-handed use | HIGH | Large start/stop timer button (64px+) |
| No quick-log from event context | HIGH | "Log hours" shortcut from event detail page |

### Priority 2 Screens

#### Menu Engineering (`src/app/menu-engineering/page.tsx`)
| Issue | Severity | Fix |
|-------|----------|-----|
| 89% touch target violations | CRITICAL | 44px minimum height |
| 930 lines — page too complex | HIGH | Split into sub-pages or tab layout |
| Profitability matrix unusable on mobile | HIGH | Simplified card view with key metrics |

#### Recepten (`src/app/recepten/page.tsx`)
| Issue | Severity | Fix |
|-------|----------|-----|
| 82% touch target violations | HIGH | 44px minimum, large step-through buttons |
| Recipe steps need kitchen-friendly view | HIGH | Large text, one step at a time, swipe navigation |

#### Voorraad (`src/app/voorraad/page.tsx`)
| Issue | Severity | Fix |
|-------|----------|-----|
| 88% touch target violations | CRITICAL | 44px minimum, large +/- for quantity adjustment |
| Count/adjust workflow needs field optimization | HIGH | Simplified "stocktake mode" with large inputs |

#### Other Priority 2 pages
| Page | Violation Rate | Key Fix |
|------|---------------|---------|
| Gerechten | 76% | 44px targets, card view on mobile |
| Logistiek | 73% | 48px+ checkboxes for bus check field use |
| Inkoop | 72% | 44px targets, simplified mobile purchasing |
| Materieel | 81% | Large checkboxes for equipment checklists |
| AI Chat | 72% | Input bar at bottom, 44px send button |

---

## 7. Implementation Roadmap

### Phase A: Critical Foundation (Week 1-2)
1. **Global 44px minimum** — Add to globals.css:
   ```css
   a, button, [role="button"], input, select, textarea {
     min-height: 44px;
   }
   ```
2. **Fix muted text contrast** — Change --muted from #828282 to #949494
3. **Add skip navigation link** to layout.tsx
4. **Fix minimum font size** — Set 12px floor on all text elements at mobile
5. **Fix sidebar default state** — Expand at >= 1280px, collapse at < 1280px

### Phase B: Accessibility (Week 2-3)
1. Add ARIA labels/roles to all components
2. Add focus-visible styles globally
3. Add focus trap to SlideOverPanel and modals
4. Associate all form labels with inputs
5. Add aria-live regions for toasts/notifications

### Phase C: Responsive Overhaul (Week 3-5)
1. Consolidate to 4-breakpoint system (sm/md/lg/xl)
2. Add mobile bottom navigation bar
3. Redesign Agenda for mobile (day/list view)
4. Redesign HACCP for field use (large touch targets, progressive disclosure)
5. Extract Offertes inline form to SlideOverPanel
6. Add card-based mobile views for all table-heavy pages

### Phase D: Performance & Consistency (Week 5-6)
1. Migrate Tailwind from CDN to local build
2. Dynamic import jsPDF
3. Consolidate 3 styling systems to Tailwind-first
4. Add skeleton loading states
5. Add loading.tsx route transitions

### Phase E: Field-Optimized Views (Week 6-8)
1. HACCP field mode with 64px+ inputs
2. Event day-of view with quick actions
3. Kitchen recipe step-through view
4. Stocktake mode for Voorraad
5. Quick hour logging from event context

---

## 8. Metrics & Monitoring

### KPIs to Track
| Metric | Current Baseline | Target | Tool |
|--------|-----------------|--------|------|
| Touch target compliance (320px) | 19% pass | > 95% | Automated audit script |
| ARIA attribute count (dashboard) | 1 | 50+ | axe-core |
| WCAG AA contrast compliance | 87.5% | 100% | axe-core |
| Lighthouse Accessibility score | Est. ~30 | > 90 | Lighthouse CI |
| Largest Contentful Paint | Unknown | < 2.5s | Web Vitals |
| Text elements < 12px (mobile) | 94 | 0 | Automated audit |

### Automated Testing Recommendations
1. Add axe-core to CI pipeline for accessibility regression
2. Create Playwright test for touch target compliance at 320px
3. Add Lighthouse CI for performance/accessibility scoring
4. Monitor Core Web Vitals in production

---

## Appendix: Raw Audit Data

### All Pages Touch Target Audit (320px)

```
Page                | Total | Violations | Rate
--------------------|-------|------------|------
HACCP               |   164 |        154 |  94%
Menu Engineering     |    91 |         81 |  89%
Voorraad            |    80 |         70 |  88%
Events              |    79 |         69 |  87%
Offertes            |    58 |         48 |  83%
Uren                |    58 |         48 |  83%
Facturen            |    56 |         46 |  82%
Recepten            |    55 |         45 |  82%
Klanten             |    55 |         45 |  82%
Materieel           |    53 |         43 |  81%
Gerechten           |    55 |         42 |  76%
Agenda              |    50 |         37 |  74%
Logistiek           |    53 |         38 |  72%
AI Chat             |    60 |         43 |  72%
Dashboard           |    70 |         46 |  66%
--------------------|-------|------------|------
TOTAL               | 1,037 |        855 |  82%
```

### Font Size Distribution (320px Dashboard)

```
Size        | Count | Assessment
------------|-------|------------
14px        |   101 | OK (primary body)
13px        |    52 | Borderline
10px        |    53 | TOO SMALL
11px        |    28 | TOO SMALL
13.3333px   |    18 | Non-standard
9px         |    12 | FAR TOO SMALL
15.75px     |     8 | OK
12px        |     6 | Minimum acceptable
12.5px      |     6 | OK
17.5px      |     4 | OK (heading)
15px        |     4 | OK
18px        |     4 | OK (heading)
```

### Color Contrast Matrix

```
Pair                              | Ratio  | AA Normal | AA Large
----------------------------------|--------|-----------|----------
#f8f8f8 on #121214 (text/bg)      | 17.62  | PASS      | PASS
#f8f8f8 on #1e1e22 (text/card)    | 15.64  | PASS      | PASS
#828282 on #121214 (muted/bg)     | 4.87   | PASS      | PASS
#828282 on #1e1e22 (muted/card)   | 4.32   | FAIL      | PASS
#FFBF00 on #121214 (brand/bg)     | 11.32  | PASS      | PASS
#FFBF00 on #1e1e22 (brand/card)   | 10.05  | PASS      | PASS
#22c55e on #121214 (green/bg)     | 8.21   | PASS      | PASS
#ef4444 on #121214 (red/bg)       | 4.97   | PASS      | PASS
```
