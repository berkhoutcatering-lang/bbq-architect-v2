# BBQ Architect — UX Master Document

**Laatst bijgewerkt:** 2026-05-15
**Doel:** één plek waar status, principes, KPI's, personas en open items bij elkaar staan. Lees deze als eerste bij een nieuwe sessie.

---

## 1. Status overview

| Fase | Wat | Status | Open items |
|---|---|---|---|
| **IA-revisie** | Sidebar 28 → 7 hubs, hub-and-spoke met tabs, Vandaag-laag, sitemap, ⌘K | ✅ Af | — |
| **1A — Design-system tokens** | `--radius-*`, `--space-*`, `--brand-tint-*` in `globals.css`; HubTabs generiek | ✅ Af | 313 hardcoded `borderRadius` in 42 files buiten dashboard nog niet getokenized |
| **1B — WCAG 2.1 AA** | Contrast --muted-light, aria-current, touch-targets ≥44px, font-sizes ≥11px | ✅ Af | — |
| **1B-Mobile** | App-wide 390px audit + fixes: 44px floor in Button-tsx + tailwind tokens, EventHero+eh-hero stack op mobile, ev-next-stats 2-col, FAB hide phone, PunchPanel stack, breadcrumb 68px voor hamburger | ✅ Af | Polish per niet-hub page (price-intelligence body, factuur-lezer flow) bij gelegenheid |
| **1C — UX-copy** | Pitmaster Studio → AI Pitmaster, Menu Engineering → Menu-analyse, sentence-case, tone-of-voice principe | ✅ Af | — |
| **2 — Pro-tier onboarding** | PersonaQuiz + OnboardingChecklist + tracking | ✅ UI af | Generieke demo-data seed-API (technical debt) |
| **3 — AI-inline** | /prep-counter echte AiStudio i.p.v. fake alert(); /gerechten allergenen-detect bestond al | ✅ Af | AiAssistant 1865r → ~500r refactor; AI-context cross-page persist |
| **4 — HACCP field** | /haccp/field bestond al; "Open Veldmodus" knop op /haccp | ✅ Af (bestond) | Lars-test live op event-dag |
| **5A — KPI-spec** | 5 metrics + targets + funnel-stappen | ✅ Af | — |
| **5B — Tracking infra** | Migration `011_activation_events.sql` + helper `track.ts` + 3 events bedraad | ✅ Code af | Mathijs moet migration runnen in Supabase Studio |
| **5C — Admin dashboard** | /admin/funnel uitbreiden met de 5 nieuwe KPI's | 🟡 Open | ~1.5u werk, vereist live data |

---

## 2. Design principles (richtsnoer voor elke beslissing)

1. **Taak boven module** — Nav volgt wat de persona doet, niet hoe code is georganiseerd.
2. **Eén plek per concept** — Als event-data op 2 plekken editable is, kies één en redirect.
3. **Dagelijks zichtbaar, zeldzaam vindbaar** — Sidebar voor 7 hubs; ⌘K voor de rest.
4. **Vandaag-laag toont status, niet KPI's** — "Wat speelt er nu", niet "totaal-omzet-Q2".
5. **Hub-namen zijn taal-vrij van Hop & Bites** — Pro-tier-eis. "Voorraad", niet "Hop & Bites Stock".
6. **Field-context wint** — Lars met handschoenen > Mathijs op desktop > visuele esthetiek.
7. **AI suggereert, gebruiker beslist** — Geen auto-acties; altijd preview, altijd dismissable.

---

## 3. KPI's voor Pro-tier launch

| # | KPI | Target | Type | Hoe gemeten |
|---|---|---|---|---|
| 1 | Time-to-First-Offerte | <15 min | Leading | `signup_completed` → `first_offerte_concept` event |
| 2 | Activation-rate | ≥40% | Lagging (week 1) | % orgs met alle 4 checklist-items=true binnen 7d |
| 3 | D7-Retention | ≥50% | Lagging | login d1-d7 na signup |
| 4 | First Real Offerte Sent | ≥70% | Lagging | % activated orgs met `first_offerte_sent` in 30d |
| 5 | AI-adoptie-rate | ≥30% | Leading | `ai_wizard_used` events / total offertes |

**Gezondheidsscore-formule** (al in /admin):
```
health = activity*0.4 + dataRichness*0.3 + adoption*0.3
<30 = at-risk · <15 = critical
```

---

## 4. Personas en prioriteit

| # | Persona | Device | Frequentie | Wat ze willen |
|---|---|---|---|---|
| 1 | **Lars** (foodtruck-operator) | Tablet, handschoenen, fel zonlicht | Event-dagen | "3 grote knoppen voor de avond" |
| 2 | **Pro-tier tenant** (onbekende caterier) | Desktop bij setup, mobiel in field | Setup → daily | "Snap binnen 10 min wat ik moet doen, zonder Sam" |
| 3 | **Mathijs** (eigenaar/bouwer/admin) | Desktop + tablet + mobiel | 7d/wk | "Open app → zie wat speelt → ⌘K voor rest" |

**Bij conflict**: Lars > Pro-tier > Mathijs. Lars dwingt simpelheid (één-tap), Pro-tier dwingt taal-zuiverheid (geen jargon), Mathijs krijgt diepte (power-features achter ⌘K).

Vastgelegd in `~/.claude/projects/-Users-mathi-Documents-GitHub-bbq-architect-v2/memory/feedback_three_personas.md`.

---

## 5. IA-overzicht (sidebar + hub-and-spoke)

Canonical bron is `src/lib/navigation.tsx`. Update deze sectie bij elke wijziging daar.

```
🏠 Vandaag          → /          (hardcoded bovenaan Sidebar.tsx, control-tower)
📅 Plannen          → /agenda    (children: Agenda · Events)
🛒 Verkoop          → /offertes  (children: Offertes · Klanten)
🍳 Menu & Recepten  → /gerechten (children: Gerechten · Componenten · Ingrediënten · Kookbord)
                                  + sub-tabs in _client.tsx: AI Bedenker · AI Pitmaster · Menu-analyse · Insights · Allergen-queue
📦 Voorraad         → /voorraad  (children: Voorraad · Inkoop · Leveranciers)
💰 Geld             → /financien (children: Financiën · Uren · Bonnen & Facturen · Boekhouder · Rittenregistratie)
⚙️ Systeem          → /systeem   (secondary; children: Instellingen · Gebruikers · Integraties · Mailbox · Website · Foto-archief · Help Center · Platform Beheer)
```

**Naam-historie** (voor wie oude docs leest):
- "Inspiratie Bibliotheek" → vervangen door "Menu & Recepten" (2026-05-16, `/inspiratie` is dood-redirect)
- "Instellingen & Hulp" → vervangen door "Systeem"
- "Plannen & Events" / "Verkoop & Klanten" / "Geld & Boekhouding" / "Voorraad & Beheer" → ingekort
- Hub-URL `/sectie/systeem` (dynamic) → `/systeem` (statisch via navigation)

**Patroon**:
- Klik hub-naam in sidebar → ga naar `hubHref` (default tab van die hub)
- Tabs altijd zichtbaar boven elke sub-pagina via `layout.tsx` per folder
- Bestaande URLs blijven canonical (geen broken magic-links naar offertes)

**Configuratie**: `src/lib/navigation.tsx` (NavSection met `hubHref` + `tabs[]`).

---

## 6. Component-inventaris

| Component | Locatie | Wat |
|---|---|---|
| `HubTabs` | `src/components/HubTabs.tsx` | Generiek tab-bar; gebruikt door 6 wrappers (PlannenTabs, VerkoopTabs, KeukenTabs, VoorraadTabs, GeldTabs, SysteemTabs) |
| `Sidebar` | `src/components/Sidebar.tsx` | Hub-link mode (heeft `hubHref` ondersteuning + `min-h-[44px]`) |
| `BottomNav` | `src/components/BottomNav.tsx` | Mobile-only, 5 items (Vandaag · Plannen · Verkoop · Menu · Meer) — Meer triggert sidebar-overlay |
| `CommandPalette` | `src/components/CommandPalette.tsx` | ⌘K met 35+ routes + Supabase-search (events/offertes/etc.) |
| `Button` | `src/components/Button.tsx` | Variants: brand · ghost · red · green · cyan · gold · gold-outline; size: default/sm/icon |
| `EmptyState` | `src/components/EmptyState.tsx` | Per-page config in `EMPTY_STATE_CONFIG` (20 pages al gedekt) |
| `ActiveEventCard` | `src/components/dashboard/ActiveEventCard.tsx` | Vandaag-HERO; 5 actie-knoppen + empty-state CTA |
| `PendingActions` | `src/components/dashboard/PendingActions.tsx` | Vandaag-niveau-2 (urgent rode kaarten) |
| `StatusStrip` | `src/components/dashboard/StatusStrip.tsx` | Vandaag-niveau-3 (smalle status-tegels) |
| `OnboardingChecklist` | `src/components/onboarding/OnboardingChecklist.tsx` | 4-items dismissable + auto-progress + tracking |
| `PersonaQuiz` | `src/components/onboarding/PersonaQuiz.tsx` | 3-vragen modal post-signup |
| `track` / `trackOnce` | `src/lib/track.ts` | Fire-and-forget naar `activation_events` tabel |

---

## 7. Open items per categorie

### Visual / Design-system
- 313 hardcoded `borderRadius` in 42 files buiten dashboard — geleidelijk aan tokens converteren
- 3 styling-systemen door elkaar (Tailwind + custom CSS + inline) — UX-P1 in problem-frames

### Onboarding
- **Generieke demo-data seed-API** (`/api/onboarding/seed-demo`) zodat nieuwe Pro-tier tenants direct demo-data zien — bestaand `scripts/seed-demo-data.mjs` werkt alleen voor Hop & Bites
- Empty-states per hub-canvas (technisch al via `EMPTY_STATE_CONFIG` maar visueel polish)

### AI
- AiAssistant.tsx (1865 regels) → vereenvoudigen tot ~500 regels
- AIStudio.tsx (1172 regels) → idem
- AI-context cross-page persist (5-min TTL via localStorage in AiStudioContext)
- /klantgesprek AI-vraag-suggestie

### Field-readiness (Lars)
- **Lars-test live op event-dag** — touch-targets met handschoenen, zonlicht-leesbaarheid
- Auto-redirect /haccp → /haccp/field op tablet?
- /uren PunchPanel volledig mobile-ready (Play-knop bovenaan, status onder, event-select onderaan) — 2026-05-15

### Launch
- `/admin/funnel` uitbreiden met 5 nieuwe KPI's + funnel-grafiek
- Rest van tracking-events bedraden: `signup_completed`, `first_klant_created`, `first_gerecht_created`, `first_offerte_sent`, `ai_allergen_detect`
- Migration `011_activation_events.sql` runnen in Supabase Studio

---

## 8. Tone-of-voice + microcopy-regels

**Principe**: *"Schrijf zoals een chef tegen z'n team praat: kort, direct, actie-gericht. Werkwoord eerst, geen kantoorjargon. Bij twijfel: minder woorden."*

| Regel | Voorbeeld |
|---|---|
| Werkwoord-eerst CTA's | "Open agenda" niet "Naar agenda" |
| Sentence-case | "Nieuw event" niet "Nieuw Event" |
| Geen Engels | "logs" → "registraties", "page" → "pagina" |
| Max 4 woorden in CTA | "Stuur herinnering" — niet "Stuur een herinnering naar de klant" |
| Activerend bij empty-state | "Nog geen X" — niet "Geen X aanwezig" |

---

## 9. Bestaande UX-docs — geldigheid

| Document | Status | Wanneer raadplegen |
|---|---|---|
| `docs/ux-benchmark.md` | ✅ Geldig | Bij ontwerp-keuzes — concurrent-patterns van Toast/Tripleseat/Notion |
| `docs/ux-problem-frames.md` | 🟡 Deels gedaan | UX-P1 (tokens), P2 (44px), P3 (a11y), P5 (onboarding), P6 (AI) gedeeltelijk gefixed; UX-P4 (HACCP) en P7 (DoD) staan open |
| `docs/ux-strategy.md` | ✅ Geldig | 12-maand pillars + HEART-metrics — zie KPI's in sectie 3 |
| `docs/ux-workflow-audit.md` | 🟡 Deels gedaan | WF1-2 (event/offerte ingangen) opgelost via IA; WF3-10 staan open |
| `~/.claude/plans/loop-een-ronde-langs-peaceful-wilkinson.md` | 🟢 Stappen A-D af | Stap E (Pro-tier launch-test met 3 cateriers) staat open |
| `~/.claude/plans/perfectie-roadmap.md` | 🟢 Fase 1-5 grotendeels af | Zie sectie 1 voor specifieke open items |

---

## 10. Top-3 volgende stappen

1. **Mathijs runt migration** `011_activation_events.sql` in Supabase Studio → tracking begint daadwerkelijk events op te slaan. (1 min)
2. **Generieke demo-data seed-API** — zonder dit zien Pro-tier tenants een lege app. Hoogste user-value. (~4-6u werk, eigen ronde)
3. **AiAssistant + AIStudio refactor** — 3037 regels samen, vereenvoudigen tot ~1000 totaal opent ruimte voor AI-context-persist en betere onderhoudbaarheid. (~6-8u, eigen ronde)

---

## Persona-prompts (voor Claude bij toekomstig werk)

> **Bij elke design-beslissing**: stel jezelf 3 vragen:
> 1. *Werkt dit voor Lars met handschoenen onder fel zonlicht?* (touch-target ≥44px, geen klein schrift)
> 2. *Snapt een onbekende caterier dit zonder Sam te bellen?* (geen jargon, zelfverklarende UI)
> 3. *Maakt dit Mathijs sneller in z'n dagelijkse workflow?* (max 2 klikken voor top-12 taken)

Bij conflict: regel 1 wint van 2, 2 wint van 3.
