Je bouwt 8 tools voor BBQ Architect Design System. Gebruik de bestaande BBQ Architect Design System tokens (`tokens.css`), brand-DNA (dark + gold + glass, Dutch casual-je, pitmaster metaphor, Lucide icons), 8 OKLCH-presets via Tweaks panel. Output: per tool een live mobile + desktop centerpiece + key states. Bouw als interconnected systeem — 1 baseline lijst-pattern (tabel/kanban + filter-pills + search + drawer-detail + bulk-acties + empty-state + loading-skeleton) en 8 varianten met elk hun specifieke data + acties. Knoppen tussen tools verwijzen naar elkaar waar logisch (bv. lead-card → offerte-wizard handoff).

Theme + look: dark near-black (#121214), brushed gold (#c4a35a) hairlines, amber (#FFBF00) CTA-buttons, glass-cards met blur(18px), DM Sans body + Outfit display, sentence-case labels, UPPERCASE eyebrow met wide tracking.

---

### Tool 02 — Lead-pijplijn `/verkoop/leads`
Kanban met 5 kolommen (Nieuw / In gesprek / Offerte / Gewonnen / Verloren). Per lead-card: naam + event-type-pill + datum + gasten + locatie + budget + "X uur geleden". Drag-tussen-kolommen flipt status. Klik card → right-drawer met: contact, event-details, AI-concept (3 menu-suggesties), "Maak offerte"-CTA → handoff naar Tool 03 via localStorage. View-toggle Kanban/Lijst (TanStack Table). Search + filter. Bulk-acties via long-press. Empty-state: "Deel je aanvraag-link". Niet-gereageerd >24u = oranje pill op kolom Nieuw.
**Acceptance:** drag werkt op touch, drawer-open <100ms, AI-concept <5s, conversion-stats in header.

### Tool 11 — Agenda `/agenda`
FullCalendar Maand/Week/Lijst-toggle met NL-locale, week-start maandag. Top-KPI-strip 5 cards: Komende 30d / Omzet pipeline / Prep open / Vrije weekends / Conflicten (rood). Sidebar "Mijn agenda's" toggleable (Events/Prep/Persoonlijk). Event-pins kleur-coded per status, hover tooltip, klik → event-hub. Drag-to-other-date update date. Conflict-pin rood bij overlap. AI Insights-knop opent drawer met today-briefing.
**Acceptance:** drag op touch werkt, mobile default Lijst-view.

### Tool 12 — Events lijst `/events`
Tabel + 5 status-filters (Concept/Optie/Bevestigd/Afgerond/Geannuleerd). Cols: Datum/Naam/Klant/Locatie/Gasten/Omzet/Status. Bulk-select + action-bar (archiveer/template-mail/CSV-export). Klik row → event-hub. "Naamloos event"-placeholder met warning-icoon bij lege name. Search + sort.
**Acceptance:** sort default datum DESC, paginatie >50 events, mobile = kaart-list.

### Tool 15 — Componenten library `/gerechten/componenten`
4 actions top: AI Genereer / Bedenker Studio / Nieuw / Importeer leverancier. Hero stat-circle "9 COMPONENTEN — 0% via AI". Tabel met filter-pills (Alle/Zelf-bereid/Inkoop/Per leverancier). Cols: Naam/Categorie/Cost/Allergens/Used-in-N/Bron. Edit-drawer met cascade-graph visualisatie + impact-preview "Wijzigt cost van 5 gerechten". Importeer-flow met AI parse-pricelist + Sam confirms bulk.
**Acceptance:** cascade trigger werkt, allergens human-confirm queue, pg_trgm search autocomplete.

### Tool 18 — Voorraad-detail `/voorraad/[id]`
3-koloms grid: STOCK-CARD (huidig vs par-level slider, last counted, "Tellen" CTA). PRIJSHISTORIE (Recharts line 12 punten per leverancier kleur, trend-indicator). LEVERANCIERS (hoofd + alternatieven met price-delta, "AI Substitution-advice" knop). GEBRUIKT-IN (gerechten-cascade-back-link + voorspelde behoefte 30d). Sticky-bottom "Bestel"-CTA bij below-par.
**Acceptance:** par-level rood bij current<min, history min 6 punten anders empty.

### Tool 19 — Inkoop `/inkoop`
Tabs: Open / Concept / Geleverd / Geannuleerd. Tabel-cols: Order# / Leverancier / Datum / Items / Totaal / Status. "Genereer voorstel"-button (AI berekent uit events × ingredients × yields). PO-detail drawer met items-tabel edit-able + "Verstuur naar leverancier" Resend mail. Bon-match flow: drag bon → AI parse → diff-view PO vs bon → confirm = inventory + price_history update.
**Acceptance:** AI-voorstel met confirm vóór order, idempotent supplier-match.

### Tool 20 — Leverancier-detail `/leveranciers/[id]`
Header met contact + sync-status pill. Tabs: Producten / Prijsmutaties / Aliassen / Sync-runs. PRODUCTEN tabel met "Used in N gerechten". MUTATIES chronologisch met >5% filter + AI-impact-analyse. ALIASSEN mapping leverancier-naam → component-id met AI-suggesties Sam confirms. SYNC-RUNS chronologisch met start-knop (Chrome extension trigger).
**Acceptance:** aliassen voorkomen dup-components, sync-runs detailed error-log.

### Tool 22 — Rittenregistratie `/administratie/rittenregistratie`
Header "Rittenregistratie" + maand-selector + "Nieuwe rit". KPI-strip: Totaal km / Aftrekbaar / Aantal / Events gedekt (warn als 0/N met koppel-CTA). Tabel met Datum/Van/Naar/Km/Doel/Gekoppeld-event/Acties. Nieuwe-rit modal met event-dropdown (uit events.date matching ±3d) + "Scan dashboard-foto" (Opus vision). Moneybird-push sticky bottom (idempotent UNIQUE). Banner "Vergeten ritten" cron-detected.
**Acceptance:** €0.23/km server-side constant, AI-scan optioneel.

---

Bouw deze 8 tools. Maak duidelijk welke shared componenten je hergebruikt (Filter-pills, Drawer-pattern, Tabel-skeleton, etc.). Geen lorem-ipsum data — gebruik realistische BBQ-catering NL voorbeelden (Mariel Velema, Hopp, Bedrijfsfeest, gerookte Bavette beef club, Sligro, etc.). Eindig met een korte index "Wat zit waar in deze batch".
