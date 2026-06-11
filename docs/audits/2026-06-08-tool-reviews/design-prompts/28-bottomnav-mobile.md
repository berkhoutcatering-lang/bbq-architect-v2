# 28 — BottomNav mobile-flow

**Type:** 5-tab mobile-bottom navigation pattern
**Source:** `src/components/BottomNav.tsx`

## Wat het moet doen

Op mobile (<900px): vervangt sidebar door 5-tab bottom-bar. Tabs: Vandaag / Plannen / Verkoop / Menu / Meer (laatste = sidebar-overlay). Active-tab kleur-coded, badge-indicator voor counts.

## Componenten
- Fixed bottom 60px bar
- 5 icon+label-buttons
- "Meer"-overlay sidebar van rechts
- Active-tab visual feedback

## Acceptance
1. ✅ Touch-targets 60×60px
2. ✅ Safe-area-bottom respect (notch iPhone)
3. ✅ Active-tab kleur+icon-fill
4. ✅ "Meer" toont overige 3 hubs (Voorraad / Geld / Systeem) + ⌘K + settings
5. ✅ Niet-visible op /q/[token], /aanvraag/[slug] (publieke routes)

## Bevindingen
- ✅ APK confirmed: 5-tabs Vandaag/Plannen/Verkoop/Menu/Meer
- ❌ Geen badges voor counts (e.g. "Verkoop 3" voor 3 nieuwe leads)
- ❌ "Meer"-overlay UX onduidelijk uit screenshot

## Design-prompt

```
Bouw een mobile bottom-navigation voor catering-software BBQ Architect.

CONTEXT
Op mobile vervangt deze de sidebar. Vijf hoofd-tabs voor 80% van Sam's
mobile-workflow + overflow naar "Meer". Lars gebruikt vooral Vandaag +
Plannen op event-dag.

LAYOUT (fixed-bottom, 60-72px hoog)
- 5-grid horizontal (equal-width)
- Per tab: icon (top) + label (bottom 11px) + counter-badge (rechts-boven)
- Active: kleur-coded background + filled-icon
- Inactive: muted-icon + grijze tekst

TABS
1. 🏠 Vandaag (default landing)
2. 📅 Plannen (events + agenda)
3. 🛒 Verkoop (offertes + klanten + leads)
4. 🍳 Menu (gerechten + componenten)
5. ⋯ Meer (sheet-overlay)

BADGES (auto-derive)
- Vandaag: 0 (geen badge — overview)
- Plannen: N als events vandaag/morgen
- Verkoop: N nieuwe leads (status='nieuw')
- Menu: 0 (geen badge — library)
- Meer: dot als items in overige hubs require action

"MEER"-OVERLAY (sheet van rechts)
- Header: "Meer modules" + close
- 3 hub-cards:
  - 📦 Voorraad (badge "1 onder par" als toepasselijk)
  - 💰 Geld (badge "X openstaand")
  - ⚙️ Systeem
- ⌘K palette-trigger
- Account: profile + logout

HIDDEN-ROUTES (no BottomNav)
- /q/[token] publiek portal
- /aanvraag/[slug] publiek formulier
- /arrangement/[slug] publiek arrangement
- /login, /signup
- /welkom marketing

INTERACTIONS
- Tap tab: navigate met page-transition
- Long-press tab: quick-actions (e.g. lang-druk Verkoop = "Nieuwe offerte")
- Swipe-up van bottom = ⌘K palette (toekomst)

SAFE-AREA
- env(safe-area-inset-bottom) padding
- iPhone notch + Android nav-bar respect

COMPONENTS
- shadcn/ui Sheet voor "Meer"-overlay
- lucide-react iconen (al in deps)
- Custom badge-component

ACCESSIBILITY
- Per tab aria-label: "Vandaag, geselecteerd"
- Aria-current="page" op active
- Touch-targets ≥56×56px (handschoenen op tablet)

HIDDEN OP DESKTOP (>900px)
- Sidebar-Layout overneemt
- BottomNav hidden via media-query

CONNECTS TO
- src/lib/navigation.tsx (canonical hub-list)
- Auth state (logout in "Meer")
- Per-hub counters voor badges (Supabase queries)
```
