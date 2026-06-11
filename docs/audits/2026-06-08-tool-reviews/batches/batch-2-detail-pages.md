Je bouwt 5 tools voor BBQ Architect Design System. Gebruik de bestaande BBQ Architect Design System tokens (`tokens.css`), brand-DNA (dark + gold + glass, Dutch casual-je, pitmaster metaphor, Lucide icons), 8 OKLCH-presets via Tweaks panel. Output: per tool een live mobile + desktop centerpiece + key states. Bouw als interconnected systeem — deze 5 zijn allemaal "detail-pagina's" (klant/gerecht/analyse/menukaart/boekhouder) met eigen layouts maar gedeelde modal-patterns.

Theme + look: dark near-black (#121214), brushed gold (#c4a35a) hairlines, amber (#FFBF00) CTA-buttons, glass-cards met blur(18px), DM Sans body + Outfit display, sentence-case labels, UPPERCASE eyebrow met wide tracking.

---

### Tool 13 — Klant-detail `/klanten/[id]`
Drawer of route. Hero met avatar (initiaal) + naam + bedrijf + type-pill kleur-coded (Particulier blue / Zakelijk gold / Festival purple / Horeca teal) + "Klant sinds {datum}". Contact-card (email/tel/adres) + Bel/Mail/WhatsApp quick-actions. KPI-strip 3 cards: Offertes (count + %geaccepteerd) / Events (count + totale gasten) / Totale waarde (€). Historie-blokken (Events/Offertes/Facturen, max 5 + "Alle {N} bekijken"-link per categorie). AI-context-card: "Vorige catering: BBQ-feest 40 gasten in juni 2025 — wil je dit jaar weer? Stuur follow-up template". Notes-card BlockNote auto-save.
**Acceptance:** "alles zien"-links per categorie, mobile = full-screen modal, edit-inline via pencil-icoon.

### Tool 14 — Gerecht-detail + 3 modals `/gerechten/[id]`
2-koloms: LEFT foto-card (upload + AI-vision-fill via Opus) + receptuur BlockNote met toolbar. RIGHT fields stacked (naam input / gang select voor-hoofd-dessert / categorie chips / yield-aantal-porties / bereidingstijd / allergens-pills READ-ONLY uit cascade / ingredient-tabel join / kostprijs auto-calc / verkoop-prijs input / marge-pill kleur-coded groen≥55%, oranje 35-55%, rood<35%). Action-bar 3 AI-modals: BEDENKER (Haiku 3s fill leeg, preview per veld confirm) / PITMASTER (Sonnet 8s streaming coaching met technique + cost-tip + actie-chips) / ALLERGEN QUEUE (per component AI-suggestie ✓accept/✗reject, hard-rule: allergens NOOIT auto-applied zonder Sam-OK). Plus "Preview op offerte" + Save/Verwijder.
**Acceptance:** Bedenker geen allergens, Pitmaster geen auto-apply, foto max 10MB, cost-cascade via DB-trigger.

### Tool 16 — Gerechten analyse `/gerechten/analyse`
View-toggle Performance/Health. PERFORMANCE: BCG-matrix scatter-chart Recharts, x-as=verkoop-volume (events × gasten × qty), y-as=brutomarge %, dots=gerechten (grootte=totale omzet). 4 kwadranten met labels: top-right STARS / bottom-right COWS / top-left QUESTIONS / bottom-left DOGS. Hover dot = tooltip met naam+cijfers, klik = drilldown gerecht-detail. HEALTH: tabel gerechten × allergens (gluten/lactose/nuts/vis/etc.) kleur-coded rood ongedekt / grijs niet-applicable / groen confirmed. Filter "Toon alleen ongedekte". INSIGHTS-SIDEBAR rechts: "Top 3 acties" met concrete CTAs ("Schrap [Salade] — 0 verkoop in 6mo" / "Verhoog [Tonijn-tataki] €15→€18 → marge 25→45%" / "Allergen-data voor [4 gerechten]").
**Acceptance:** werkt vanaf 5 events anders empty-state, mobile = stack 4 lijstjes (Stars/Cows/Questions/Dogs).

### Tool 17 — Menukaart-editor `/gerechten/menukaarten/[id]`
2-koloms split: LEFT editor (template-naam input / layout-picker carousel met 10 thumbnail-templates: Rustic/Modern/Elegant/Editorial/Minimal/Square/Invite/Duotone/Festival/Wedding / gangen-secties met drag-reorder gerechten + "Voeg gerecht toe" cmdk-search / sectie-introductie BlockNote per gang / per gerecht omschrijving + allergens-pills cascade). RIGHT live preview iframe naar /e2e-test/menukaart/[id] met PDF-mode toggle A4/A5/Square + branding-preview cascade. Action-bar: Save / Preview (open PDF nieuw tab) / Delete / Dupliceer / "Pas toe op offerte X" koppel template-id.
**Acceptance:** PDF deterministic fonts+colors, allergens cascade (NOOIT inline-edit), 10 visual-regression-baselines.

### Tool 21 — Boekhouder maandpakket `/geld/boekhouder`
Maand-selector "< April 2026 >". KPI-strip 4 cards: Omzet (€ + X facturen verzonden) / Uitgaven (€ + Y bonnen) / BTW saldo (€) / Tijd (X uren). 4 categorie-blokken accordion expanded: FACTUREN (lijst nummer/klant/datum/totaal/RGS-categorie default 8000 + "Verzonden"-pill + Lock-status) / BONNEN (lijst + AI-suggested RGS-categorie + "AI Classify"-bulk-button Haiku per 50 rows ~5s) / UREN (per personeel totaal × tarief + RGS 4000) / RITTEN (totaal km × €0.23 + RGS 4170). PAKKET-BUILDER sticky-rechts: "Pakket samenstellen" → 1 PDF + 1 ZIP + 1 CSV + Resend email-template preview + "Verstuur naar boekhouder@example.com" CTA + confirm "Lock alle facturen+bonnen voor deze maand?".
**Acceptance:** RGS Sam-confirms (geen auto-apply), lock-mechanism via locked_at, cron dag-3-na-maand.

---

Bouw deze 5 tools. Maak duidelijk welke shared modal-patterns je hergebruikt. Gebruik realistische BBQ-catering NL data (Hop & Bites context: pulled pork, brisket, ribs, Sligro-leverancier, Mariel Velema-klant, etc.). Eindig met index "Wat zit waar".
