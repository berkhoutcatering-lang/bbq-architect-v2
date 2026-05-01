# UX Problem Frames — BBQ Architect v2

**Datum:** 2026-04-28
**Scope:** Design-laag problem-framing — anders dan feature-laag
**Aansluiting:** [`problem-frames.md`](./problem-frames.md) framet 12 features (SF-1..12). Dit doc framet de **UX-uitdagingen** rond die features.

> **Verschil.** `problem-frames.md` zegt: "We moeten een AI offerte-wizard bouwen — wat moet die kunnen?". Dit doc zegt: "We moeten field-readiness van 19% naar 95% in 12 weken — hoe ontwerpen we daar omheen?". Feature-vraag vs. design-vraag.

---

## Meta — De grootste UX-vraag voor H1

> **Hoe brengen we BBQ Architect's mobiele/tablet-bruikbaarheid van "demonstrabel onbruikbaar in keuken" (81% touch-violations, 1 ARIA-attr, 94 sub-12px-tekstelementen) naar "Pro-tier-rechtvaardigend" (≥95% compliant, WCAG 2.1 AA op kritieke flows, glove-friendly HACCP) in 12 weken, met 10–20u/wk Sam + Claude, zonder feature-regressie en zonder dat de marketing-launch (juli 2026) verschuift?**

### Waarom dit dé vraag is

- **Commercieel.** Pro-tier is HACCP + menu-engineering + voorraad. Die staan op tablet/mobiel. Als die niet werken in keuken, verkoop je niks van Pro (€99). Zonder Pro: geen pad naar €5k MRR.
- **Bewijslast.** [`UX-AUDIT-REPORT.md` 2026-04-07](../UX-AUDIT-REPORT.md) — 81% violations gemiddeld, 94% op HACCP, 89% op menu-engineering.
- **Timing.** Marketing-launch staat op juli 2026 ([`product-strategy.md`](./product-strategy.md)). Als UX niet klaar is, kies je tussen uitstellen (cashflow-risico) of launchen-met-kritieke-bugs (reputatie-risico). Beide slecht.
- **Opportunity-cost.** Elke week na launch dat de UX niet field-ready is = ~1 churn van een Pro-prospect die de demo zag. Dat is direct gederfde MRR.

---

## Sub-problemen (UX-specifiek)

Deze 7 sub-problemen zijn **design-uitdagingen**, niet features. Ze raken de hele app, niet één scherm.

### UX-P1 — Hoe migreren we van 3 styling-systemen naar 1, zonder regressie?

**Probleem.** App heeft Tailwind (CDN) + custom CSS-classes (`.panel`, `.stat-card`) + inline `style={}` door elkaar. Drie systemen = drie waarheden. Wijziging in één breekt vaak iets in een ander.

**Stakeholders.** Sam (dev), Berkhout (gebruiker, mag geen visuele regressie zien).

**Constraints.**
- Geen big-bang-rewrite (te risicovol, te lang).
- Migratie moet feature-by-feature, met rollback per pagina.
- Eindstaat: Tailwind-tokens in `tailwind.config.ts`, geen inline styles, geen custom CSS-classes (m.u.v. utility-helpers).

**Success criteria.**
- 0 inline `style={}` in productie-componenten (whitelist alleen in `app/globals.css`).
- 0 custom `.panel`-achtige klassen (alle naar Tailwind-utilities of component-variants).
- Visual-diff per pagina ≤ 5% pixel-verschil tijdens migratie.
- Bundle-size −30% na CDN-removal en purging.

**Aanpak (denkrichting).**
1. **Token-extractie.** Lees alle inline styles + custom classes, extraheer tokens (kleuren, spacing, schaduwen, blur). Documenteer in `tailwind.config.ts`.
2. **Per-pagina-migratie.** Eén pagina per week. Na migratie: visual-diff + dogfood Berkhout 1 dag. Geen regressies → mergen.
3. **CDN-removal als laatste stap** — pas als alle pagina's pure Tailwind zijn.

**Risico's.**
- Visuele drift tijdens migratie (week 3 ziet er anders uit dan week 5).
- Sam wordt verleid om "ook even" iets te redesignen tijdens migratie. Discipline nodig.

**Decision-principles ([zie ux-strategy.md §4](./ux-strategy.md)).**
- **P5** (stilte op succes): geen modals "stylesheet bijgewerkt".
- **P3** (één pad): tijdens migratie: oude én nieuwe pad zou kunnen — kies oude tot pagina af is.

---

### UX-P2 — Hoe maken we 44px-targets de default, niet de uitzondering?

**Probleem.** 81% van interactieve elementen < 44px op 320px. Alleen knoppen "fixen" werkt niet — je moet de defaults aanpassen, anders blijven nieuwe features fout.

**Stakeholders.** Sam (dev), alle drie persona's (gebruikers).

**Constraints.**
- Desktop-density mag niet met 50% afnemen — anders voelt het "te basic" voor power-users.
- Geen kapotte spacing — als knoppen 44px worden, ontstaat er meer witruimte; layouts breken.
- Backward-compatible: bestaande screenshots/PDF's mogen niet veranderen.

**Success criteria.**
- Globale `Button`-component met variants `sm/md/lg` waarbij `md` = 44px op mobiel, 36px op desktop (responsive token).
- ≥ 95% van interactieve elementen ≥ 44px op 320px viewport.
- Per-pagina audit-rerun groen vóór merge.

**Aanpak (denkrichting).**
1. **Component-bibliotheek.** Eén `Button.tsx` met variants. Eén `IconButton`, één `LinkButton`. Vervang inline `<button className="…">` door imports.
2. **Linter/codemod.** ESLint-rule die `<button>` zonder import flag.
3. **Responsive tokens.** `min-h-touch` = `44px` op `sm`, `36px` op `md+`. Toepassen op alle interactive.

**Risico's.**
- Massale find-and-replace breekt edge-cases.
- Layout shifts in dichte tabellen (uren, voorraad) — moeten we density-toggle aanbieden?

**Decision-principles.**
- **P1** (field beats fancy): bij conflict winnen 44px-mobiel.
- **UX-1** (field-first): test mobile eerst.

---

### UX-P3 — Hoe brengen we WCAG 2.1 AA "stil" in, zonder feature-stop?

**Probleem.** 1 ARIA-attr op hele dashboard, 0 focus-rings, 1 contrast-failure. A11y is niet als feature te bouwen — het moet in elk component.

**Stakeholders.** Sam (dev), screen-reader-users, keyboard-users, Pro-klanten met grote teams (a11y kan compliance-eis zijn).

**Constraints.**
- Geen externe a11y-consultant in budget H1 (€500 max voor 1 audit-sessie).
- Zou liefst geen feature-werk stilleggen tijdens a11y-bundle.
- Tooling moet free/open-source zijn (axe-core, eslint-plugin-jsx-a11y).

**Success criteria.**
- 100% pass op axe-CI voor 5 prio-flows: dashboard, offerte-wizard, event-detail, HACCP, factuur.
- Volledige keyboard-navigatie (Tab/Shift-Tab/Enter/Escape) op alle modals.
- Skip-link werkend.
- Screen-reader-test (VoiceOver/TalkBack) op offerte-wizard ≥ 90% taken voltooibaar.
- Contrast-fix `#828282` → `#949494` op cards.

**Aanpak (denkrichting).**
1. **Bundle in 1 sprint** (M1 in [ux-strategy.md §7.7](./ux-strategy.md#77-deliverables--timeline)) — focus 2 weken alleen op a11y.
2. **Component-level fixes:** eens per `Button`/`Modal`/`SlideOverPanel`/`Input` aanpakken, dan rolt het door alle pagina's.
3. **CI-poort:** axe-core in Playwright, fail-build bij critical violations.
4. **External audit-sessie:** week M1+1, €500 voor 2u expert-review.

**Risico's.**
- ARIA-overdose: te veel labels → screen-reader noisy. Moet "stil" zijn, alleen waar nodig.
- Focus-ring conflicts met dark-theme styling — design-iteratie nodig.

**Decision-principles.**
- **UX-4** (stille a11y): instaplevel, niet feature.
- **P2** (geen QA-tester van klant): a11y mag niet "deels werken".

---

### UX-P4 — Hoe ontwerpen we keuken-UX (HACCP) voor handschoenen?

**Probleem.** Standaard SaaS-UX werkt niet in een keuken: handen zijn vies/nat/gehandschoen, attention is split (hete pannen), screen-time is < 5 sec per check. Onze huidige HACCP is een laptop-UI.

**Stakeholders.** Jeroen (Pro-persona, primair), Berkhout-keukenteam (test), NVWA-inspecteur (compliance-acceptant).

**Constraints.**
- Mag NVWA-data-vereisten niet versimpelen (temp + tijd + medewerker + product).
- Werkt op iPad-Air (10.9", primaire device) en op iPhone (mounted).
- Geen aanvullende hardware (geen barcode-scanner, geen RFID).
- Werkt offline (keuken-WiFi vaak slecht).

**Success criteria.**
- Eén temp-log invoeren in ≤ 3 taps, ≤ 8 seconden.
- Tap-zones ≥ 64px (preferred 88px) — Toast-niveau.
- 100% taak-completion-rate op `Berkhout` keuken-team in 1 week dogfooding.
- Audio/haptic feedback (V2) voor success-confirm.
- NVWA-export onveranderd.

**Aanpak (denkrichting).**
1. **Card-grid layout.** 2-kolom grid van 88×88-px cards per koeling/oven. Tik = open quick-input. Ander tik op `OK` of typ-temp.
2. **Smart-defaults.** Vorige temp + tijd voorgevuld; alleen aanpassen als anders.
3. **Bulk-mode.** "Alle koelingen OK?" → één tap accepteert allemaal (alleen beschikbaar als geen warnings).
4. **Offline-eerst.** IndexedDB voor logs, sync bij online.

**Risico's.**
- "Alles OK"-knop = NVWA-zorg (te makkelijk om te liegen). Mitigatie: temp-fields blijven verplicht, alleen het *bevestigen* gaat sneller.
- Audio-feedback hindert restaurant-gevoel. Optioneel maken.

**Decision-principles.**
- **P1** (field beats fancy).
- **UX-2** (één-tap-actie).
- **UX-3** (AI suggereert, mens beslist) — geen auto-fill van temps.

---

### UX-P5 — Hoe ontwerpen we onboarding zonder Sam-coach?

**Probleem.** Status quo: nieuwe account is een lege state. Geen demo-data, geen progress-checklist, geen wegwijzer. Activatie-events bestaan in DB-schema maar zijn niet gewired.

**Stakeholders.** Marieke (Starter, primair geraakt), Sam (zonder coach mogen klanten zelfstandig launchen).

**Constraints.**
- Self-service ([`product-strategy.md` Pijler 4](./product-strategy.md)) — geen mens in onboarding.
- Tijd-tot-eerste-offerte ≤ 60 min (M3 in [ux-strategy.md](./ux-strategy.md)).
- Demo-data moet *wegwerpbaar* zijn — niet vervuilen na productie-gebruik.
- Eén progress-pad, geen vertakkingen (P3).

**Success criteria.**
- ≥ 60% van trial-accounts verstuurt eerste offerte binnen 60 min (target H2; H1 = ≥ 40%).
- Onboarding-checklist 5 stappen: account-info, demo-data laden of importeren, eerste klant, eerste offerte, eerste verstuurd.
- Email-cohort 1/3/7-dag aangezet (Resend) bij stuck users.
- Activation-events gewired (sign-up, first_klant_added, first_offerte_started, first_offerte_sent).

**Aanpak (denkrichting).**
1. **Persona-quiz na sign-up.** "1–5 events/mnd" / "5–30" / "30+" → laad bijbehorende demo-data (Marieke/Jeroen/Lars-template).
2. **Progress-checklist.** Sticky bovenin dashboard, 5 stappen. Verdwijnt na voltooiing.
3. **AI-help inline.** Als gebruiker > 5 min stuck op offerte-form, popup "wil je hulp van Pitmaster?".
4. **Demo-mode-banner.** Paarse banner "demo-data — verwijder via instellingen".

**Risico's.**
- Demo-data vermengt met echte klant-data → privacy/AVG-zorg. Strikte tag in DB.
- Email-cohort kan irriteren — opt-out direct beschikbaar.

**Decision-principles.**
- **P3** (één pad voor 80%) — quiz vertakt naar persona, dan één pad per persona.
- **UX-3** (AI suggereert) — AI-help is opt-in.

---

### UX-P6 — Hoe positioneren we AI in de UI zonder dat het gimmick voelt?

**Probleem.** AI is onze moat ([benchmark](./ux-benchmark.md) — niemand anders heeft het). Maar AI-knoppen overal = "sparkles ✨ disease". Pitmaster Studio als losse pagina = je moet ernaartoe wandelen voor elke vraag.

**Stakeholders.** Alle persona's. Marieke wil snelheid, Jeroen wil controle, Lars wil consistentie over teamleden.

**Constraints.**
- AI-cap per tier ([Pijler 1](./product-strategy.md)) — kan niet onbeperkt suggereren.
- Latency Claude Opus ≥ 1s — voelt traag voor inline-suggesties.
- Cost-budget — kan geen voorspellende AI-call op elke keystroke.
- Gebruiker moet *altijd* zien wat AI doet (P4).

**Success criteria.**
- AI is **inline** in 3 flows: offerte-wizard (suggesties), recepten (allergeen-detectie), voorraad (bon-OCR).
- AI-suggestie kan in ≤ 1 klik geaccepteerd of afgewezen.
- Pitmaster Studio blijft als chat-pagina voor diepe vragen.
- Geen `✨`-icoon op routine-buttons (anti-gimmick).
- Cost-cap visible, niet zwijgend afgekapt.

**Aanpak (denkrichting).**
1. **Inline AI-zones.** In offerte-wizard: textarea "klant-omschrijving" → onder textarea een knop `AI: vul in op basis van WhatsApp-tekst`. Geen sparkles, gewoon werkende knop.
2. **Ghost-text-pattern.** In receptenwerker: type een ingredient, AI suggereert allergenen als grijs-text die je accepteert met Tab.
3. **Pitmaster Studio = exploratie**, niet werk-flow. Behoud aparte page voor "hoe maak ik X?", "welke menu-suggesties bij Y-thema?"
4. **Cost-bar.** Top-right pill `🪙 35/500 acties` — klik opent usage-detail. Geen mysterieuze "limiet bereikt"-modals.

**Risico's.**
- Inline-AI met latency 1s+ voelt sloom — mitigatie: skeleton + "AI denkt na…" max 3s, daarna inline-knop "stop".
- Ghost-text kan irriteren bij snel-typers — toggle in instellingen.

**Decision-principles.**
- **P4** (AI suggereert, mens beslist).
- **UX-3** (AI laag, geen page-magic).
- **UX-6** (snelheid is gevoel) — ghost-text < 200ms na blur.

---

### UX-P7 — Hoe definiëren we "klaar" voor een design-feature?

**Probleem.** Zonder definitie van done blijft elke design wel-of-niet-af. Sam moet alleen kunnen beslissen "dit kan naar Berkhout-dogfood, dit naar productie". Geen QA-team om te outsourcen.

**Stakeholders.** Sam (alleen-beslisser), Berkhout-team (dogfood), eerste klanten (publiek).

**Constraints.**
- Geen dedicated QA-fase mogelijk.
- Solo-founder kan niet 100% objectief op eigen werk.
- Berkhout-feedback komt 1× per week (na werk-week).

**Success criteria.**
- DoD-checklist (zie hieronder) gehanteerd op 100% merges van design-werk.
- Geen design-feature naar productie zonder ≥ 1 week dogfood bij Berkhout.
- Geen rollback in 4 weken na merge (target).

**Aanpak — Definition of Done voor design-features.**

```
Design-feature is DONE als:
[ ] Component-niveau:
    [ ] Tailwind-tokens, geen inline styles, geen custom CSS-class
    [ ] Min-h-touch op alle interactives (44px mobile)
    [ ] Component-test in Vitest (props, varianten)
[ ] Page-niveau:
    [ ] axe-CI groen (0 critical, 0 serious)
    [ ] Manual VoiceOver-test op happy-path
    [ ] Touch-target audit-rerun ≥ 95% compliant
    [ ] Visual-diff < 5% drift met designs
[ ] Flow-niveau:
    [ ] Mobiele 320px-test op iPhone (echt device)
    [ ] Tablet 768px-test op iPad (echt device)
    [ ] Desktop ≥ 1280px-test
[ ] Dogfood:
    [ ] 1 week live bij Berkhout, ≥ 0 kritieke bugs
    [ ] UI-friction-score ≥ 4,0 op micro-survey
[ ] Documentation:
    [ ] Storybook-entry of inline component-docs
    [ ] Update aan ux-benchmark.md cheatsheet (§3) als pattern nieuw is
```

**Risico's.**
- Checklist wordt theater (afgevinkt zonder echt testen). Mitigatie: link items aan CI/CD waar mogelijk (axe-CI is auto, niet self-attest).

**Decision-principles.**
- **P2** (geen QA-tester van klant).
- **P5** (dogfood Berkhout).

---

## Prioritering — RICE op de 7 sub-problemen

| # | Sub-probleem | R | I | C | E (weken) | RICE | H1-fase |
|---|---|---:|---:|---:|---:|---:|---|
| UX-P1 | 3 styling-systemen → 1 (Tailwind-tokens) | 50 | 2 | 95% | 2 | 47,5 | M0 |
| UX-P2 | 44px-targets default | 50 | 3 | 95% | 1,5 | **95** | M2 |
| UX-P3 | WCAG 2.1 AA-bundle | 50 | 2 | 90% | 1,5 | 60 | M1 |
| UX-P4 | Keuken-UX HACCP | 30 | 3 | 85% | 2 | **38,3** | M3 |
| UX-P5 | Onboarding-flow | 50 | 3 | 80% | 1,5 | **80** | M4 |
| UX-P6 | AI-positionering inline | 50 | 2 | 75% | 2 | 37,5 | M3 |
| UX-P7 | Definition of Done | 50 | 2 | 90% | 0,5 | **180** | M0 |

> Volgorde **M0 → M5** zoals in [ux-strategy.md §7.7](./ux-strategy.md#77-deliverables--timeline).

**Drie observaties.**

1. **UX-P7 (DoD) is de hoogste RICE** — niet omdat het glamoureus is, maar omdat het *al het andere werk versnelt*. Doe dit eerst.
2. **UX-P2 (44px) en UX-P5 (onboarding) zijn de twee duidelijke compounders** — ze verbeteren elke metric (G1, G3, G4 in [brief](./ux-strategy.md#74-goals--success-criteria)).
3. **UX-P4 (keuken) heeft kleinere reach maar hogere impact per gebruiker** — Pro-tier hangt ervan af. Kan niet uitgesteld.

---

## Constraints-spec voor H1 (samenvatting)

Wat tegen mag spreken aan elk design-voorstel:

- **Tijd:** Sam ≤ 20u/week. Geen sub-probleem mag > 2 weken dev-werk vragen zonder split.
- **Budget:** ≤ €500 externe consult, geen designer-uitbesteding.
- **Tech:** Next.js 16 / React 19 / Tailwind / Supabase. Geen platform-switch.
- **Markt:** NL-only. Geen i18n-werk, geen EN-translations.
- **Brand:** Dark-theme + glass-morph + #FFBF00. Niet wijzigen zonder grondige reden.
- **Compliance:** WCAG 2.1 AA + AVG + NVWA-HACCP. Niet onderhandelbaar.
- **Berkhout:** Productie-tenant — geen breaking changes zonder fall-back.

---

## Beslis-matrix — wanneer escaleren naar Sam?

| Situatie | Standalone-beslissing (Claude) | Sam-input nodig |
|---|---|---|
| Token-naam-conflict | Pak duidelijkste, doc in tokens.md | n.v.t. |
| Visuele drift > 5% bij migratie | Stop migratie, rapporteer | Sam beslist accept/iterate |
| A11y-fix verandert vibe | Voer fix door, ping Sam met screenshot | Sam kan terugdraaien als vibe-loss te groot |
| HACCP-design wijkt af van NVWA-eis | **Stop direct**, Sam moet NVWA checken | Sam |
| Dogfood Berkhout wijst af | Iterate 1× | Sam beslist tweede iterate of revert |
| Cost-impact AI-pattern > €5/klant/mnd | Stop design, rapport | Sam beslist tier-aanpassing |

---

## Conclusie

**Drie strategische take-aways voor H1.**

1. **Onbekendste sub-probleem is UX-P4 (keuken-UX)** — geen NL-precedent, Toast/Square-patterns moeten we vertalen naar HACCP-context. Risico op herwerk hoog. Plan **buffer** in M3.

2. **Hoogste-leverage sub-probleem is UX-P7 (Definition of Done)** — kost 0,5 week, versnelt al het andere. Doe **eerst, in week 1 van M0**.

3. **Grootste-risico-sub-probleem is UX-P3 (a11y)** — niet vanwege complexiteit, maar omdat het saai is en je het kan uitstellen. Discipline: **a11y-bundle is een geblokkeerde sprint, geen background-task**.

---

**Volgende update:** na M1 (2026-05-31) — herevalueer of de 7 sub-problemen nog steeds de juiste lens zijn.
