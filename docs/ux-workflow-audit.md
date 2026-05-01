# UX Workflow Audit — BBQ Architect v2

**Datum:** 2026-04-29
**Scope:** Flow-laag — anders dan visuele/touch-laag uit `ux-strategy.md`
**Aansluiting:** [`ux-strategy.md`](./ux-strategy.md), [`ux-benchmark.md`](./ux-benchmark.md), [`ux-problem-frames.md`](./ux-problem-frames.md)
**Status:** Onderzoek (geen implementatie)

> Dit document beantwoordt de vraag: *"Wat zit er in de huidige workflow dat een caterier dagelijks ergert, vóór we het over knop-formaat hebben?"* — niet de pixels, maar de paden.

---

## 1. Wat dit document toevoegt

UX is in dit project een drielagensaus:

| Laag | Voorbeeld | Gedekt door |
|---|---|---|
| **L1 — Visueel/Touch** | 44px-knoppen, contrast, focus-rings, dark-theme-tokens | `ux-strategy.md`, `UX-AUDIT-REPORT.md` |
| **L2 — Flow** | Hoeveel klikken, waar val ik uit context, dubbele entries | **dit document** |
| **L3 — Content** | Tone-of-voice in micro-copy, foutmeldingen, AI-formulering | `ux-strategy.md` §P6 (deels) |

L1 en L3 zijn al goed in beeld. L2 is de blinde vlek: een 44px-knop helpt niet als de gebruiker bij elke pagina-wissel z'n event-context kwijt is. Een caterier voelt L2-frictie eerder dan L1-frictie — L1 went, L2 blijft schuren.

---

## 2. Methodologie

| Methode | Wat | Beperkingen |
|---|---|---|
| **File:line scan** | Per flow het hoofdcomponent gelezen, kritieke regels gemarkeerd | Geen runtime-meting |
| **Click-path tellen** | Vanaf entry-point tot succes-state taps geteld | Variant-flows niet uitputtend |
| **LOC als proxy** | Componenten >800 LOC = onderhoudslast-flag | LOC ≠ kwaliteit, maar wel signaal |
| **Cross-route grep** | Welke pagina's importeren elkaars data | Statisch, mist runtime-context-leaks |
| **Commit-archeologie** | Recente AI-rondes (3 commits) bekeken — wat is intent? | Auteur-perspectief, geen user-perspectief |

Niet meegenomen: real-user-monitoring, session-replays, externe testers. Berkhout-dogfood-feedback is verwerkt zoals het in `ux-problem-frames.md` staat.

---

## 3. Huidige hoofdflows in kaart

### Flow A — Klantgesprek → Offerte → Event (happy path)

```
┌───────────────┐                                           ┌──────────────┐
│ /klantgesprek │ ─── 6-staps wizard ────► offerte-concept │  /offertes   │
└───────────────┘                                           └──────┬───────┘
                                                                   │
                  ┌────────────────────────────────────────────────┤
                  │                                                │
   [F1] 4 ingangen voor "nieuwe offerte":                          │
        1. "Nieuwe Offerte"   → offerte-editor (manual, 718 LOC)   │
        2. "Stel Menu Samen"  → MenuWizard (4 stappen)             │
        3. "AI Offerte"       → AiOfferteWizard (350 LOC)          │
        4. /klantgesprek      → resulteert ook in offerte          │
                                                                   ▼
                                          runAcceptanceWorkflow ──► /events/[id]/hub
                                                                       (1264 LOC)
```

**Frictie-markers.** F1 (4 ingangen), F2 (AI-prijs hardcoded), F8 (context reset bij navigatie).

---

### Flow B — Event-dag uitvoering

```
/events/[id]/hub  (planning)
        │
        ├─ [F3] 1264 LOC monoliet — 13+ useState, één Promise.all-fetch
        ├─ [F4] prep-checkboxen wachten op Supabase round-trip
        ├─ [F7] menukaart-edit forceert nav naar template-editor
        │
        ▼  (handmatig URL typen — [F6] geen knop)
/events/[id]/field  (uitvoering, KDS, courses, allergies)
        │
        ▼  (event done, status='completed' — [F5] inventory pas hier afgetrokken)
/events/[id]/reflectie  →  /facturen
```

**Frictie-markers.** F3 (monoliet), F4 (lag), F5 (geen preview), F6 (geen "Ga live"), F7 (template weg-nav).

---

### Flow C — Inkoop met `volgendEvent`-context

```
/events/[id]/hub  ─── user denkt: "nog inkopen!" ────►  /inkoop
                          (event-context blijft alleen
                           als volgendEvent toevallig
                           hetzelfde event is — anders weg)
                                          │
                                          ▼
                              AI: respond_with_blocks
                                  + volgendEvent injectie
                                          │
                                          ▼
                                  inkooplijst per leverancier
```

**Frictie-markers.** F8 (context reset behalve volgendEvent — fragiel).

---

### Flow D — Menu-engineering ↔ recepten ↔ gerechten

```
/menu-engineering ───► /recepten ───► /gerechten
        ▲                                  │
        │                                  │
        └─────────── geen back-channel ────┘
        (wijziging in gerechten triggert geen alert in menu-engineering)
```

**Frictie-markers.** F9 (AI-baseline ontbreekt op sommige views — inconsistent).

---

## 4. 10 frictiepunten — uitgewerkt

### F1 — Vier ingangen voor "nieuwe offerte"

**Bewijs.** [`src/app/offertes/page.tsx:599-601`](../src/app/offertes/page.tsx) toont drie knoppen (`Stel Menu Samen`, `AI Offerte`, `Nieuwe Offerte`) plus een vierde route via [`src/app/klantgesprek/page.tsx`](../src/app/klantgesprek/page.tsx) die ook in offerte eindigt.

**Impact.** Marieke (Starter): "welke moet ik?" — beslis-paralysis bij eerste gebruik. Jeroen (Pro): kies ad-hoc, krijgt soms andere defaults bij andere route → inconsistente offertes uit eigen huis.

**Persona.** Vooral Marieke (onboarding-friction).

**Pillar-conflict.** Schendt **P3 — één pad voor 80%, escape voor 20%** (`ux-strategy.md` §4).

---

### F2 — AiOfferteWizard mist prijs-input

**Bewijs.** [`src/components/AiOfferteWizard.tsx:112`](../src/components/AiOfferteWizard.tsx) — `basis_prijs_pp: generated.adviesprijs_pp || Math.ceil((generated.totale_kostprijs_pp || 35) * 2)`. Geen input-veld in de preview-stap.

**Impact.** Caterier moet ná opslaan terug naar offerte-editor om prijs te corrigeren. Twee schermen voor één beslissing. Schendt het kern-belofte van AI-as-suggest.

**Persona.** Iedereen die AI-route kiest.

**Pillar-conflict.** Schendt **P4 — AI suggereert, mens beslist**. Mens kan nu niet beslissen op het moment dat het ertoe doet.

---

### F3 — Event-hub is 1264 LOC monoliet

**Bewijs.** [`src/app/events/[id]/hub/page.tsx`](../src/app/events/[id]/hub/page.tsx) — 1264 regels, 13+ `useState`-calls, één `Promise.all` voor alle fetches (recepten, gerechten, klant, haccp, serviceLogs, reflectie, inkooplijst, gangen, templates, prepState, factuur).

**Impact.** Initiale page-load wacht op trage fetch. Elke nieuwe sectie verergert dit. Voor Sam (solo-dev): nieuwe feature toevoegen = risico op state-bug elders in het bestand.

**Persona.** Allen — dit is dé event-pagina.

**Pillar-conflict.** Schendt **UX-6 — snelheid is gevoel**. Onder de motorkap: technical debt die toekomst blokkeert.

---

### F4 — Prep-task checkbox = round-trip

**Bewijs.** [`src/app/events/[id]/hub/page.tsx:863`](../src/app/events/[id]/hub/page.tsx) — `onChange={() => togglePrep(c.id)}` waar `togglePrep` direct Supabase-update aanroept zonder local optimistic state.

**Impact.** 18 prep-stappen × event = 18 zichtbare lag-momenten per event. Op event-dag in de keuken (slecht WiFi) voelt dit traag. UX-6 (snelheid is gevoel) wordt direct geschonden.

**Persona.** Jeroen (event-dag, meest geraakt).

**Pillar-conflict.** **UX-6** + **P1 — field beats fancy** (keuken moet snel zijn).

---

### F5 — Inventory-drain pas bij `status='completed'`

**Bewijs.** [`src/components/events/EventEditor.tsx:76-88`](../src/components/events/EventEditor.tsx) — `justCompleted = freshStatus !== 'completed' && form.status === 'completed'` triggert `drainInventoryForEvent`. Tot dat moment: geen voorraad-impact zichtbaar.

**Impact.** Je weet pas na het event dat je iets tekort kwam. Geen "preview" van stock-impact bij menu-toevoegen. Inkoop wordt reactief in plaats van proactief.

**Persona.** Lars (Enterprise, multi-event-planning), Jeroen (Pro, voorraad-bewust).

**Pillar-conflict.** **P5 — luid op fout** mist hier, want fout (tekort) verschijnt te laat.

---

### F6 — Geen "Ga live"-knop

**Bewijs.** Geen entry-point in `events/[id]/hub` naar `events/[id]/field`. User moet handmatig URL aanpassen of via menu navigeren.

**Impact.** Op event-dag (drukste moment) extra cognitive load om de juiste modus te vinden. Field-modus is gemaakt voor één-hand-bediening, maar je moet er met twee handen heen.

**Persona.** Jeroen (event-dag).

**Pillar-conflict.** **UX-2 — eén-tap-actie waar het ertoe doet**.

---

### F7 — Template-edit forceert weg-navigatie

**Bewijs.** Menukaart-link in event-hub wijst naar `/template-editor`. Bij terug-navigatie verliest user scroll-positie en open-state in hub.

**Impact.** Jeroen wil snel "krijg het BBQ-icon weg uit deze menukaart" en moet daarvoor 4 schermen lopen. Past niet bij P3 (één pad voor 80%).

**Persona.** Jeroen, Lars (visueel-bewust).

**Pillar-conflict.** **P3** + **UX-2**.

---

### F8 — AI-context reset per pagina

**Bewijs.** [`src/lib/ai-actions.ts`](../src/lib/ai-actions.ts) bouwt context per `getContextFor*()` functie bij pagina-mount. Alleen `volgendEvent` is cross-page persistent. Andere context (huidige offerte, actief klantgesprek, geselecteerd event) verdampt bij navigatie.

**Impact.** Caterier zit in `/klantgesprek` met een klant aan tafel, navigeert naar `/offertes` om iets op te zoeken, AI weet niet meer over welke klant het ging. AI-as-moat-positie wordt ondergegraven door eigen architectuur.

**Persona.** Allen die AI gebruiken (steeds meer).

**Pillar-conflict.** **UX-3 — AI als suggestie**: suggestie zonder geheugen voelt niet als co-piloot maar als verstrooide stagiair.

---

### F9 — AI-helpers inconsistent aanwezig

**Bewijs.** [`src/lib/ai-prompts.ts`](../src/lib/ai-prompts.ts) — `PAGE_SYSTEM_PROMPTS` dekt 24 routes. Maar pagina's als `/offertes` (lijst), `/logistiek`, `/boekhouding` hebben geen forceBlocks-pad. Gebruiker leert "soms is AI nuttig hier, soms niet" — willekeurig.

**Impact.** Vertrouwens-erosie: feature voelt niet "af". User verliest de gewoonte AI te raadplegen omdat het soms gewoon niets doet.

**Persona.** Power-users (Lars, Jeroen).

**Pillar-conflict.** **P2 — gebruiker is geen QA-tester**: half-werkend = niet werkend.

---

### F10 — Geen bulk-acties op lijst-pagina's

**Bewijs.** `ux-benchmark.md` noemt het al expliciet als gat (sectie 2, "Bulk-acties"). Tripleseat heeft `Checkbox + action bar`, wij niet.

**Impact.** Lars (Enterprise) wil 8 oude offertes archiveren — moet er 8× in. Voor schaal-tier later (H3) blokkerend.

**Persona.** Lars (Enterprise, grootste lijst-volumes).

**Pillar-conflict.** **UX-2** (één-tap-actie waar het ertoe doet — bulk is dé multiplier).

---

## 5. 10 workflow-kansen — RICE-gescoord

R = Reach (klanten/wk geraakt), I = Impact (1–3), C = Confidence (%), E = Effort (Sam-weken). Score = (R × I × C) / E.

| # | Kans | Frictie | R | I | C | E | RICE | Horizon | Pillars |
|---|---|---|---:|---:|---:|---:|---:|---|---|
| **WF8** | AiOfferteWizard prijs-slider in preview-stap | F2 | 50 | 2 | 95% | 0,5 | **190** | H1 | P4 |
| **WF4** | Optimistic UI op prep/status-toggles | F4 | 40 | 2 | 95% | 0,5 | **152** | H1 | UX-6, P1 |
| **WF1** | Active-resource pill (event/klant/offerte) in topbar | F8 | 50 | 3 | 75% | 1 | **112,5** | H1 | UX-3, P3 |
| **WF5** | "Ga live"-knop + auto-detectie op event-dag | F6 | 30 | 2 | 90% | 0,5 | **108** | H1 | UX-2 |
| **WF2** | Eén unified "Nieuwe offerte"-CTA met smart-routing | F1 | 50 | 3 | 80% | 1,5 | **80** | H1 | P3 |
| **WF7** | Inventory-impact preview bij menu-toevoegen | F5 | 30 | 3 | 70% | 2 | **31,5** | H2 | P5 |
| **WF3** | Event-hub decompositie naar sub-routes/components | F3 | 30 | 3 | 85% | 3 | **25,5** | H1-late | UX-6 |
| **WF9** | AI-baseline (info_blocks) op alle lijst-pagina's | F9 | 30 | 1 | 85% | 1 | **25,5** | H2 | P2 |
| **WF6** | Template-editor als slide-over in event-hub | F7 | 25 | 2 | 75% | 1,5 | **25** | H2 | P3 |
| **WF10** | Bulk-acties op offertes/klanten/materieel | F10 | 30 | 2 | 80% | 2 | **24** | H2 | UX-2 |

---

## 6. Top-3 workflow-bets voor H1

### Bet 1 — WF8: prijs-slider in AiOfferteWizard (RICE 190)

**Wat.** Voeg in de preview-stap van [`AiOfferteWizard.tsx`](../src/components/AiOfferteWizard.tsx) één slider/input voor `basis_prijs_pp`. Default uit AI-suggestie of `kostprijs * 2`. Show marge-percentage live ernaast.

**Waarom hoogste.** Halve dag werk, geraakt elke AI-offerte (de pitch-feature van H1), lost direct het P4-gat (AI suggereert, mens beslist). Zonder dit voelt de AI-route gevaarlijk — *dit moet in H1*.

**Klaar als.** Prijs aanpasbaar in preview, marge-% live zichtbaar, opslaan gebruikt aangepaste waarde, mobile-friendly slider met 44px-handle.

---

### Bet 2 — WF4: optimistic UI op routine-toggles (RICE 152)

**Wat.** In [`events/[id]/hub/page.tsx`](../src/app/events/[id]/hub/page.tsx) en [`EventEditor.tsx`](../src/components/events/EventEditor.tsx): local state-update direct, dan async sync. Bij sync-fail → rollback + toast.

**Waarom tweede.** Halve dag werk, voelt magisch (UX-6: snelheid is gevoel), test-tenant Berkhout merkt dit per event 18× (prep-stappen). Backend ongewijzigd, dus laag risico.

**Klaar als.** Prep-checkbox togglet < 50ms, status-change idem, fout-rollback toont toast, geen race-conditions bij snel klikken.

---

### Bet 3 — WF1: active-resource pill (RICE 112,5)

**Wat.** Topbar (of bovenkant content-area): pill `🎉 Bruiloft Familie Jansen — 14/06`. Klik = terug naar event-hub. Pill blijft zichtbaar zolang user binnen event-context werkt (inkoop, materieel, recepten met intent "voor dit event"). AI-context bevat deze pill als prefix.

**Waarom derde.** Eén week werk, lost de grootste UX-architectuur-fout op (F8) zonder dat we cross-page memory in AI moeten bouwen (te duur, AVG-risico). Maakt de hele app "samenhangend" voor het eerst.

**Klaar als.** Pill verschijnt na openen van event-hub, blijft tot user expliciet "verlaat context" of naar onverwante module gaat (instellingen, gebruikers), AI-prompts injecteren `actieveBron` in PAGE_SYSTEM_PROMPTS.

**Aandachtspunt.** Definieer scherp wanneer pill verdwijnt — anders krijg je "klever-context" die juist verwarrend is.

---

## 7. Wat we expliciet NIET doen (en waarom)

| Niet doen | Waarom niet |
|---|---|
| Native iOS/Android-app | PWA dekt 80% (al uitgesloten in `ux-benchmark.md` §6) |
| Volledige rewrite event-hub | Te risicovol in H1; WF3 doet decompositie incrementeel |
| Cross-page AI-memory met persistent geheugen over uren | AVG-risico (gesprek-data persistent), cost-impact niet getoetst, vervangbaar door active-resource pill (WF1) |
| AI-suggesties die auto-uitvoeren | Schendt P4 — blijft handmatige preview-stap |
| Cmd+K command-palette | H2-feature uit `ux-strategy.md` §1, niet workflow-blokker |
| Multi-language UI | NL-fit is moat, H3+ |

---

## 8. Mapping op design-pillars

Sprint-planning kan kiezen op pillar-thema:

| Pillar | Aansluitende kansen | Sprint-thema |
|---|---|---|
| **UX-2** (één-tap-actie) | WF5, WF10 | "Field-actions sprint" |
| **UX-3** (AI als suggestie) | WF1, WF8, WF9 | "AI-trust sprint" |
| **UX-6** (snelheid is gevoel) | WF3, WF4 | "Speed-perception sprint" |
| **P3** (één pad voor 80%) | WF2, WF6 | "Path-clarity sprint" |
| **P4** (AI suggereert, mens beslist) | WF8 | (in AI-trust sprint) |
| **P5** (luid op fout) | WF7 | (in AI-trust sprint, randje) |

Een typische H1-sprint kan zijn: **AI-trust sprint** (WF8 + WF1 + start WF9) — 2 weken, raakt elke AI-offerte, lost P4-gat én cross-page-context tegelijk op.

---

## 9. Conclusie

**Drie strategische take-aways.**

1. **De grootste workflow-winst zit in cross-page-context, niet in micro-interacties.** WF1 (active-resource pill) lost meer ergernis op dan tien micro-fixes. De architectuur-keuze "AI-context per pagina-mount" was efficiënt voor implementatie, maar voelt voor de gebruiker als "AI heeft kort geheugen". Eerst dit, dan rest.

2. **Optimistic UI is een gratis upgrade.** WF4 + WF8 samen = 1 week werk, raakt elke gebruiker per dag, geen backend-wijzigingen, voelt premium. Dit zou eigenlijk al gebeurd moeten zijn — het is een no-brainer waar L1 (visueel) niet bij helpt.

3. **De event-hub is het volgende risico.** 1264 LOC, 13 useStates, één Promise.all. Elke nieuwe feature verergert dit. WF3 (decompositie) is geen glamour-werk maar voorkomt een halt over 6 maanden. Plan dit in de zomer, niet in oktober.

**Volgende stappen.**

1. Lees dit document samen met `ux-strategy.md` — bevestig geen overlap, wel aanvulling.
2. Kies 1-3 kansen voor de eerstvolgende sprint (suggestie: WF8 + WF4 als low-risk-warmup, daarna WF1).
3. Per gekozen kans: maak een implementatie-plan met affected files, migratie-strategie, DoD-checklist (zie `ux-problem-frames.md` UX-P7).

---

**Volgende review:** na M2 (2026-06-15) of bij wijziging in `ux-strategy.md`.
