# BBQ Architect — UX Master Document

**Laatst bijgewerkt:** 2026-10-20
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
| **2 — Pro-tier onboarding** | PersonaQuiz + OnboardingChecklist + `/api/onboarding/seed-demo` (219r, idempotent, generiek) gewired in /onboarding/page.tsx | ✅ Volledig af | — |
| **3 — AI-inline** | /prep-counter echte AiStudio i.p.v. fake alert(); /gerechten allergenen-detect; create_klant + draft_email action_cards live (2026-06-01) | ✅ Af | AiAssistant 1865r → ~500r refactor; AI-context cross-page persist |
| **4 — HACCP field** | /haccp/field bestond al; "Open Veldmodus" knop op /haccp | ✅ Af (bestond) | Lars-test live op event-dag |
| **5A — KPI-spec** | 5 metrics + targets + funnel-stappen | ✅ Af | — |
| **5B — Tracking infra** | Migration `011_activation_events.sql` + helper `track.ts` + BEFORE-INSERT trigger auto-fillt org_id/user_id | ✅ Live sinds 2026-05-01 | 804 events totaal, 155 laatste 7d, 6 event-types actief |
| **5C — Admin dashboard** | /admin/funnel met alle 5 KPI's (Activation-rate, AI-adoptie, first_offerte_concept/sent, ai_wizard_used) + Pro-tier baseline-uitleg | ✅ Af | 447r live; data verzamelt sinds 2026-05-01 |
| **6 — Volledige app-test (2026-06-12)** | Hele app getest incl. Golden Flow end-to-end; **17 kapotte opslag-plekken gefixt** (RLS-klasse: insert zonder org-id — o.a. inklokken, AI-wizard, Nieuw event, onboarding, klanten, facturen); rapport [2026-06-12-test-campagne.md](audits/2026-06-12-test-campagne.md) | ✅ Af | Top-10 verbeterplan in rapport; #1 wizard-items[] ✅ zelfde dag gefixt; #2 = AI-menu naar <8s (71s na schema-fix) |
| **7 — Operatie Overzicht (gepland)** | App weer begrijpelijk: sidebar 26→8, één-deur-regel (bonnen ×3 → 1, marge ×3 → 1, gerechten+recepten merge), Team & Operatie-hub, anatomie-canon, nieuwe-persoon-test als meetlat — plan in [operatie-overzicht.md](operatie-overzicht.md) | 📋 Plan klaar | Uitvoering ná weekendtest 13-14 jun, 4 sessies; weekendtest levert zoek-momenten als munitie |
| **8 — Werkruimtes + snelheid (2026-10-20)** | Zijbalk vervangen door werkruimtebalk per onderdeel + tegelscherm (Odoo-model), één navigatiebron, onderdelen aan/uit per bedrijf; minder vaste vragen per pagina en geheugen tussen pagina's — plan + voor/na-meting in [werkruimtes-en-snelheid.md](werkruimtes-en-snelheid.md) | ✅ Gebouwd | Vandaag-overzicht in één servervraag (2–4 dagen) en servergegevens voor /offertes en /agenda staan open |

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

## 5. IA-overzicht (werkruimtes, sinds 2026-10-20)

Canonical bron is `src/lib/navigation.tsx` — de **enige** plek waar tabbladen staan. Werkruimtebalk, tegelscherm, onderbalk, kruimelpad, zoekvenster (⌘K) en sitemap lezen allemaal deze lijst. Plan en meting: [werkruimtes-en-snelheid.md](werkruimtes-en-snelheid.md).

Geen zijbalk meer. Elk onderdeel is een **werkruimte** (zoals een Odoo-app): bovenin een balk met alléén de tabbladen van dat onderdeel. Wisselen via het **tegelscherm** (⊞ linksboven, "Meer" in de onderbalk, gebruikersmenu) of ⌘K.

```
Vandaag            → /            (geen tabbladen)
Plannen            → /agenda      Agenda · Events                        (+ klantgesprek, prep-counter, haccp)
Verkoop            → /offertes    Aanvragen · Bestellingen · Webshop · Kerst · Arrangementen · Website · Offertes · Klanten
Keuken             → /gerechten   Gerechten · Componenten · Menukaarten · Kookbord · Keukenscherm · Analyse  (+ marges, ai-chat)
Inkoop & Voorraad  → /voorraad    Voorraad · Partijen · Winkel · Ontvangst · Inkoop · Leveranciers · Bonnen · Bonnenkistje · Inkoopprijzen
Geld               → /financien   Financiën · Facturen · Boekhouder
Team & Operatie    → /uren        Uren · Materieel · Ritten · Logistiek
Systeem            → /systeem     Instellingen · Gebruikers · Koppelingen · Mailbox · Website · Hulp · Platform Beheer (alleen platformbeheerders)
```

**Patroon**:
- `vindWerkruimte(pad)` bepaalt overal welk onderdeel en tabblad actief is (langste voorvoegsel wint; `ook`-routes horen bij een werkruimte zonder eigen tab).
- Kruimelpad alleen op pagina's díeper dan een tabblad (bv. een event).
- Pagina's zonder eigen zijmarge krijgen `.pagina-rand` (via hun layout).
- **Onderdelen aan/uit per bedrijf**: `/instellingen/onderdelen`, kolom `settings.verborgen_onderdelen`. Alleen rol Admin. Uitzetten verbergt — er wordt niets verwijderd en een directe link blijft werken. Vandaag en Instellingen kunnen niet uit.
- Bestaande URL's blijven canonical; routes zijn niet veranderd, alleen de indeling.

**Naam-historie** (voor wie oude docs leest):
- Zijbalk (hub-and-spoke, 2026-05-01 → 2026-06-12 ingeklapt tot 8) → vervangen door werkruimtebalk + tegelscherm (2026-10-20). De negen `*Tabs.tsx`-componenten zijn weg; alleen `UrenTabs` (Klok/Personeel) en `EventTabs` (binnen één event) bestaan nog.
- "Menu" → "Keuken" (2026-06-12; onderbalk volgt sinds 2026-10-20)
- "Integraties" → "Koppelingen" als tabnaam
- "Inspiratie Bibliotheek" → "Menu & Recepten" → "Menu" → "Keuken"

---

## 6. Component-inventaris

| Component | Locatie | Wat |
|---|---|---|
| `WerkruimteBalk` | `src/components/werkruimte/WerkruimteBalk.tsx` | Balk bovenin: ⊞, onderdeel, tabbladen, zoeken, nieuws, gebruikersmenu |
| `Tegelscherm` | `src/components/werkruimte/Tegelscherm.tsx` | Odoo-startscherm; geladen via `TegelschermHost` pas bij openen |
| `GebruikerMenu` | `src/components/werkruimte/GebruikerMenu.tsx` | Naam, bedrijf, AI-verbruik (pas bij openen), Instellingen, Onderdelen, Uitloggen |
| `HubTabs` | `src/components/HubTabs.tsx` | Generiek tab-bar; nog gebruikt door `UrenTabs` (derde niveau) |
| `BottomNav` | `src/components/BottomNav.tsx` | Mobile-only: Vandaag + 3 werkruimtes uit navigation.tsx + Meer (= tegelscherm) |
| `CommandPalette` | `src/components/CommandPalette.tsx` | ⌘K; pagina's uit navigation.tsx (+ een handvol extra's) + Supabase-search |
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
- ✅ ~~Generieke demo-data seed-API~~ — al gebouwd: `/api/onboarding/seed-demo` (219r idempotent, generiek: 10 klanten/15 gerechten/20 inventory/5 leveranciers/8 events/3 facturen) gewired in /onboarding/page.tsx:281
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
- ✅ ~~/admin/funnel + 5 KPI's~~ — al af (447r, live sinds 2026-05-01)
- ✅ ~~Tracking-events bedraden~~ — 6 types actief: ai_allergen_detect, checklist_item_done, first_gerecht_created, first_offerte_sent, quiz_completed, signup_completed
- ✅ ~~Migration 011 runnen~~ — al toegepast 2026-05-01 (trigger auto-fillt org_id/user_id)
- **Lars veld-test op event-dag** — laatste validatie vóór launch

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

Per 2026-06-01: alle voorheen-blokkerende items zijn af (tracking live, /admin/funnel
draait, seed-demo gewired, MenuComposer-redesign live, AI-acties + control-room live).
Wat resteert is validatie + polish.

1. **Lars veld-test op event-dag** — touch-targets met handschoenen, zonlicht-leesbaarheid,
   tablet-flow door HACCP. Geen code, wel laatste launch-validatie. (~2-3u veldwerk)
2. **AiAssistant + AIStudio refactor** — 3037 regels samen, vereenvoudigen tot ~1000 totaal.
   Opent ruimte voor AI-context-persist en betere onderhoudbaarheid. (~6-8u, eigen ronde)
3. **/pricing visuele polish + 313 hardcoded `borderRadius` → tokens** — beide tech debt,
   geen launch-blokkering. (~4-6u opgeteld)

---

## Persona-prompts (voor Claude bij toekomstig werk)

> **Bij elke design-beslissing**: stel jezelf 3 vragen:
> 1. *Werkt dit voor Lars met handschoenen onder fel zonlicht?* (touch-target ≥44px, geen klein schrift)
> 2. *Snapt een onbekende caterier dit zonder Sam te bellen?* (geen jargon, zelfverklarende UI)
> 3. *Maakt dit Mathijs sneller in z'n dagelijkse workflow?* (max 2 klikken voor top-12 taken)

Bij conflict: regel 1 wint van 2, 2 wint van 3.
