# BBQ Architect v2 — Comprehensive UX Strategy

**Datum:** 8 april 2026
**Scope:** Extended Benchmark + Stakeholder Map + North Star + Experience Map + Design Brief
**Relatie:** Vult de gaps in `docs/ux-benchmark-strategy.md` (7 apr 2026) en `UX-AUDIT-REPORT.md` (7 apr 2026)

---

## Executive Summary

Dit document breidt de bestaande UX-strategie uit met vier ontbrekende deliverables:

1. **Extended Benchmark** — 4 nieuwe concurrenten (Toast, Lightspeed, Excel/Sheets, Canva) brengen het totaal op 12 producten. BBQ Architect's positie verschuift van rank 9/9 naar **rank 10/13**, maar de strategische conclusies versterken: de AI-differentiator is nog unieker en de "generieke tools" valideren de kern-propositie.

2. **Stakeholder Map & Persona's** — Geformaliseerde persona-kaarten voor Cor (eigenaar-pitmaster) en zijn medewerker, plus perifere stakeholders. Elk gemapped naar device-context en key screens.

3. **North-Star Vision** — Een testbare visie voor 12-18 maanden: *"BBQ Architect is de enige tool die een Nederlandse pitmaster nodig heeft — van de eerste klantvraag tot de laatste factuur, bedienbaar met een hand en vuile handschoenen."*

4. **Experience Map** — Multi-channel kaart die 6 kanalen (Desktop, Mobiel, Tablet, Email, PDF, AI) en 5 externe touchpoints overspant, met emotionele journey overlay.

5. **Design Brief** — Het actionable bouwdocument voor Phase 1 implementatie.

### Updated Marktpositie (12 concurrenten)

| Rang | Product | Score | Categorie |
|------|---------|-------|-----------|
| 1 | CaterZen | 4.81 | Catering SaaS |
| 2 | Lightspeed | 4.77 | Hospitality POS |
| 3 | FoodNotify | 4.74 | Catering SaaS |
| 4 | Apicbase | 4.70 | Catering SaaS |
| 5 | Total Party Planner | 4.36 | Catering SaaS |
| 6 | Toast | 4.32 | Hospitality POS |
| 7 | Horeko (Exact) | 3.99 | Hospitality POS |
| 8 | Growzer | 3.75 | Catering SaaS |
| 9 | Caterease | 3.70 | Catering SaaS |
| 10 | DISH Horeca | 3.56 | Hospitality POS |
| 11 | **BBQ Architect v2** | **3.36** | **Niche SaaS** |
| 12 | Canva | 3.31 | Generieke Tool |
| 13 | Excel/Google Sheets | 2.72 | Generieke Tool |

**Key insight:** De hospitality POS-systemen (Toast 4.32, Lightspeed 4.77) scoren hoog op algemene UX maar missen catering-specifieke workflows volledig. Lightspeed's golden path score is 1/7 voor catering. Dit bevestigt dat BBQ Architect's volledige golden path (5/5 stages) een echte differentiator is — niet slechts table stakes.

---

# Part 1: Extended Competitive Benchmark

## 1.1 Nieuwe Concurrent: Toast POS

| Veld | Waarde |
|------|--------|
| **Product** | Toast POS + Catering & Events add-on |
| **HQ** | Boston, Massachusetts, VS |
| **Doelgroep** | Full-service restaurants, fast-casual, bars — catering is add-on voor bestaande restaurantklanten |
| **Prijsmodel** | SaaS + verplichte payment processing. Core: $0-69+/mnd. Catering add-on: ~$100/mnd. Processing: 2.49-3.50% + $0.15 |
| **Platform** | Cloud SaaS, proprietary hardware (geen iPad), web admin backend |
| **Mobiele app** | Toast Now (iOS/Android) management app. Toast Go handhelds voor tableside. Geen catering field-app |
| **API** | REST API beschikbaar, write-access goedkeuring duurt 12-36 maanden |

**Feature Coverage:**

| Area | Dekking | Details |
|------|---------|---------|
| Kitchen/Menu | Sterk | Hierarchisch menusysteem, KDS, realtime updates. Basisrecepten, geen volledig receptenbeheer |
| Operations/Events | Sterk (add-on) | Catering & Events module: kalender, BEO's, lead management, quotes met contractvoorwaarden |
| Business/Finance | Sterk | Geintegreerd met POS-betalingen, QuickBooks/Xero, Toast IQ AI-analytics |
| Logistics/Staff | Sterk | Sling scheduling (overgenomen), shift management, payroll add-on ($69/mnd + $9/medewerker) |
| Inventory | Matig | Realtime tracking, low-stock alerts. Geavanceerder via MarketMan/WISK integraties |

**Unieke sterke punten:**
1. **Volledig restaurant-ecosysteem** — POS, KDS, online ordering, payroll, scheduling, marketing, loyaliteit en catering in een platform
2. **Toast IQ (AI-assistent)** — Natural-language queries, proactieve aanbevelingen, gebouwd op data van 130.000+ locaties
3. **Robuuste catering-output** — BEO's, prep lists, pack sheets, kitchen sheets, labels automatisch gegenereerd
4. **Hardware-ecosysteem** — Restaurant-grade hardware bestand tegen keukenomstandigheden

**UX-problemen (uit G2/Capterra reviews):**
1. **Vendor lock-in** — Verplicht Toast Payments, proprietary hardware, 2-3 jaar contracten
2. **Catering-module is lichtgewicht** — Beschreven als "fairly lightweight event management solution", ongeschikt voor dedicated cateringbedrijven
3. **Geen in-app catering-communicatie** — Geen email templates, geen geautomatiseerde herinneringen
4. **Geen beschikbaarheidsbeheer** — Risico op dubbele boekingen
5. **Internetafhankelijkheid** — Problematisch voor off-site catering locaties

**UX Scoring:**

| Dimensie | Score | Confidence | Toelichting |
|----------|-------|------------|-------------|
| Task Completion Efficiency | 4 | Medium | Sterke POS-workflows, maar catering golden path gefragmenteerd |
| IA & Navigation | 5 | Hoog | Context-gevoelige organisatie, maar catering voelt als apart eiland |
| Data Visualization | 4 | Medium | Operationele rapporten + Toast IQ, beperkte export |
| Onboarding & Learnability | 4 | Hoog | 4-6 weken onboarding met consultant. Breed maar overweldigend |
| Mobile Responsiveness | 4 | Medium | Toast Now + Go handhelds, maar geen catering field-app |
| Integration Capabilities | 5 | Hoog | 200+ partners, maar write-access duurt 12-36 maanden |
| AI/Automation Features | 4 | Medium | Toast IQ serieus, maar restaurant-gericht, niet catering-specifiek |
| Visual Design & Consistency | 5 | Medium | Touch-optimized, consistent, maar feature-diepte vs simpliciteit spanning |

**Gewogen totaal: 4.32/7** — Rank 6/13

**Golden Path Assessment:**

| Stage | Score | Toelichting |
|-------|-------|-------------|
| Event Intake | 5 | Lead management, online formulieren, Google Calendar sync |
| Offerte | 4 | Quotes met contractvoorwaarden, klantgoedkeuring. Geen ACH, beperkte templates |
| Menu Configuratie | 5 | Aanpasbaar per event, automatische BEO-populatie |
| Prep & Logistiek | 3 | Downloadbare prep/pack sheets. Geen productiesysteem, geen routeplanning |
| Facturatie | 4 | Geintegreerd met POS-betalingen. Beperkte customisatie |

**Verdict:** Toast dekt de basisflow maar de keten is niet naadloos. Zwakste schakel is Prep & Logistiek. Voor dedicated catering significant gaps.

---

## 1.2 Nieuwe Concurrent: Lightspeed Hospitality

| Veld | Waarde |
|------|--------|
| **Product** | Lightspeed Restaurant / Hospitality (K-Series, L-Series, O-Series) |
| **HQ** | Montreal, Canada. NL-kantoor: Amsterdam (sinds 2012) |
| **Doelgroep** | Breed horeca: fine dining, cafes, pubs, fast casual, hotels, QSR. 200+ Michelin-sterren als klant |
| **Prijsmodel** | Basic: EUR 89/mnd (1 licentie), Core: EUR 159 (2 licenties), Pro: EUR 249 (3 licenties). Extra licentie: EUR 49. KDS add-on: ~EUR 30/scherm/mnd |
| **Platform** | Cloud-native SaaS POS, iPad-first |
| **Mobiele app** | Lightspeed Pulse (rapportage), Mobile Tap device (tableside), POS apps (iOS) |
| **API** | REST API op Premium tier. Uitgebreid partner-ecosysteem |

**Feature Coverage:**

| Area | Dekking | Details |
|------|---------|---------|
| Kitchen/Menu | Sterk | Menumanagement, receptkostencalculatie, KDS, Tempo (service pacing — uniek) |
| Operations/Events | Zwak | GEEN native catering/events. Alleen via EventPro360 integratie |
| Business/Finance | Sterk | Rapporten, Advanced Insights, Benchmarks & Trends. Facturatie via TheNextInvoice |
| Logistics/Staff | Sterk | In-/uitklokken, prestatierapporten, via 7shifts integratie |
| Inventory | Sterk | Realtime tracking, low-stock alerts, herbestel-suggesties, food cost tracking |

**Unieke sterke punten:**
1. **Diepste analytics** — Upserve-overname (2020): menu-item winstgevendheid, serverprestaties, benchmarks
2. **Tempo (service pacing)** — Uniek: real-time dining flow begeleiding voor servers en managers
3. **Sterkste NL-positie** — Amsterdam kantoor, 1.600+ klanten via POSsystems.nl, volledig Nederlandstalig
4. **iPad-first design** — 40% sneller dan andere POS-systemen (eigen claim)
5. **Lightspeed AI** (januari 2026) — Conversational AI voor business insights

**UX-problemen (uit Capterra 214+ reviews, 4.4/5):**
1. **Back office complexiteit** — Voorraad en financiele afstemming te ingewikkeld
2. **Verwarrende kasrapporten** — Einde-dag kassarapportage "extremely confusing"
3. **Trage support** — Implementatie "slow and difficult", e-mail respons 1-2 dagen
4. **Connectiviteitsproblemen** — Lag en crashes bij trage internetverbindingen

**UX Scoring:**

| Dimensie | Score | Confidence | Toelichting |
|----------|-------|------------|-------------|
| Task Completion Efficiency | 5 | Hoog | iPad-first POS efficiënt, maar back-office taken complex |
| IA & Navigation | 4 | Medium | POS intuïtief, back office "clunky". Meerdere productversies verwarren |
| Data Visualization | 5 | Hoog | Sterkste analytics in de markt (Upserve). Advanced Insights, Benchmarks |
| Onboarding & Learnability | 5 | Hoog | Trainingsmodus, 24/7 support, community forum. Maar initieel overweldigend |
| Mobile Responsiveness | 5 | Hoog | iPad-first IS mobiel. Mobile Tap, offline modus. Maar Apple-only |
| Integration Capabilities | 5 | Hoog | Exact Online, Twinfield, Zettle, Thuisbezorgd. API op Premium tier |
| AI/Automation Features | 4 | Medium | Lightspeed AI (jan 2026), Tempo. Vroeg stadium, primair analytisch |
| Visual Design & Consistency | 5 | Medium | Modern, clean. Maar inconsistentie tussen K/L/O-Series |

**Gewogen totaal: 4.77/7** — Rank 2/13

**Golden Path: NIET TOEPASBAAR (1/7)**
Lightspeed heeft geen native catering-workflow. Elk stage vereist externe tools. Event: 1/7, Offerte: 0/7, Menu (per event): 2/7, Prep: 1/7, Facturatie: 2/7.

**Verdict:** Lightspeed is de NL-marktleider voor restaurant-POS maar geen concurrent voor catering-specifieke workflows. Relevantie is indirect: het definieert de UX-kwaliteitsstandaard die Nederlandse horeca-ondernemers verwachten.

---

## 1.3 Nieuwe Concurrent: Excel / Google Sheets

| Veld | Waarde |
|------|--------|
| **Product** | Microsoft Excel / Google Sheets (generieke spreadsheet) |
| **Doelgroep** | De "niet-kiezende" cateraar — iedereen die nog geen dedicated software heeft |
| **Prijsmodel** | Sheets: gratis. Excel: onderdeel van Microsoft 365 (typisch al aanwezig) |
| **Platform** | Web + desktop + mobiel |
| **API** | Google Sheets API, Excel via Power Automate/Zapier |

**Typische Catering-Workflow:**

De workflow is inherent gefragmenteerd: 5+ losse bestanden zonder dataflow.
- Bestand 1: Klantenlijst (contactgegevens)
- Bestand 2: Offertes per event (handmatig gekopieerd uit template)
- Bestand 3: Recepten en kostprijscalcualtie
- Bestand 4: Voorraad/inkooplijst
- Bestand 5: Facturen (apart bestand of tab)

**Sterktes:**
1. **Universele bekendheid** — Bijna geen leercurve voor basisfuncties
2. **Flexibiliteit** — Volledig aanpasbaar aan eigen werkwijze
3. **Kosten** — Gratis (Sheets) of al beschikbaar (M365)
4. **Formule-engine** — Krachtig voor kostprijscalculaties, BTW, marges

**Zwaktes:**
1. **Geen dataflow** — Elke stap is een eiland; offerte-naar-factuur = handmatig kopieren
2. **Foutgevoelig** — Typefouten, verkeerde formules, verouderde data. Kost caterers duizenden per jaar
3. **Slechte mobiele UX** — Knijpen/zoomen, "View Only" bugs, onhandig voor data-invoer op locatie
4. **Geen automatisering** — 10-15 uur/week aan handmatige administratie (bron: CaterZen)
5. **Geen compliance-validatie** — Geen automatische BTW-controle, factuurnummering, KvK-compliance

**UX Scoring:**

| Dimensie | Score | Confidence | Toelichting |
|----------|-------|------------|-------------|
| Task Completion Efficiency | 2 | Hoog | 5+ bestanden, geen dataflow, 10-15 uur/week handmatig |
| IA & Navigation | 2 | Hoog | Geen structuur — gebruiker bouwt zelf mappenstructuur |
| Data Visualization | 4 | Medium | Sterke charts/pivots, maar zelf bouwen |
| Onboarding & Learnability | 5 | Hoog | Universele bekendheid met spreadsheets |
| Mobile Responsiveness | 2 | Hoog | Onhandig, knijpen/zoomen, ongeschikt voor veldinvoer |
| Integration Capabilities | 4 | Medium | Via Zapier, Google Workspace. Maar setup vereist technische kennis |
| AI/Automation Features | 3 | Medium | Gemini/Copilot voor formules, geen catering-specifieke AI |
| Visual Design & Consistency | 2 | Hoog | Functioneel maar onprofessioneel naar klanten |

**Gewogen totaal: 2.72/7** — Rank 13/13

**Golden Path: FRAGMENTARISCH**
Elke stage werkt als losse bestanden. Geen automatische cascade. Breekpunt: kostprijzen niet live gekoppeld aan receptsheet; menu-wijziging vereist handmatige update in offerte; factuurnummering handmatig.

**Strategische relevantie:** Excel/Sheets is de **echte concurrent** — niet CaterZen of Apicbase. De meeste kleine Nederlandse cateraars gebruiken spreadsheets. Het verschil in Task Completion Efficiency (2 vs 5) valideert BBQ Architect's kern-propositie.

---

## 1.4 Nieuwe Concurrent: Canva

| Veld | Waarde |
|------|--------|
| **Product** | Canva (generiek ontwerp-platform) |
| **Doelgroep** | Cateraars die professionele menukaarten en offertes willen zonder ontwerper |
| **Prijsmodel** | Free: EUR 0. Pro: ~EUR 13/mnd. Business: ~EUR 20/gebruiker/mnd |
| **Platform** | Web + iOS + Android |
| **Positie in workflow** | Uitsluitend de visuele outputlaag |

**Wat Canva biedt voor catering:**
- Honderden catering-specifieke menutemplates (buffet, a la carte, bruiloft, seizoens)
- Business proposal templates met interactieve elementen (Canva Docs)
- Brand Kit (Pro) voor consistente huisstijl
- Magic Studio: 25+ AI-tools (Magic Design, Magic Write, Magic Resize)

**Wat Canva NIET biedt:**
- Geen berekeningen (prijzen, BTW, totalen handmatig invullen)
- Geen datakoppeling tussen documenten
- Geen workflow-automatisering
- Geen voorraad-/recept-/eventbeheer
- Geen factureringslogica of compliance

**UX Scoring:**

| Dimensie | Score | Confidence | Toelichting |
|----------|-------|------------|-------------|
| Task Completion Efficiency | 2 | Hoog | Dekt slechts 1 stap (visuele output). 90% van het werk buiten Canva |
| IA & Navigation | 5 | Hoog | Uitstekende template-categorisering en zoekfunctie |
| Data Visualization | 2 | Medium | Canva Sheets (2025) biedt basis charts, maar geen catering-KPI's |
| Onboarding & Learnability | 6 | Hoog | Extreem lage drempel, drag-and-drop intuitief |
| Mobile Responsiveness | 5 | Medium | Goede mobiele app, touch-geoptimaliseerd |
| Integration Capabilities | 3 | Medium | Canva Connect API, Zapier. Geen catering/boekhoudsoftware koppelingen |
| AI/Automation Features | 5 | Hoog | Magic Studio sterk, maar geen catering-specifieke AI |
| Visual Design & Consistency | 7 | Hoog | Kerncompetentie. Professionele output, beste visuele kwaliteit |

**Gewogen totaal: 3.31/7** — Rank 12/13

**Strategische relevantie:** Canva is de visuele output-partner van Excel. Samen vormen ze de "DIY-stack": Excel voor berekeningen + Canva voor presentatie. BBQ Architect moet **beide vervangen** door kostprijscalculaties die automatisch doorstromen naar visueel aantrekkelijke offertes en menukaarten.

---

## 1.5 Updated Weighted Scoring Matrix (12 + 1 = 13 producten)

### Raw Scores

| Product | TCE (25%) | IA&Nav (20%) | DataViz (15%) | Onboard (15%) | Mobile (10%) | Integ (10%) | AI (3%) | Design (2%) |
|---------|-----------|-------------|---------------|---------------|-------------|-------------|---------|-------------|
| Caterease | 5 | 3 | 4 | 3 | 2 | 5 | 2 | 2 |
| CaterZen | 6 | 5 | 4 | 5 | 4 | 4 | 2 | 5 |
| Total Party Planner | 5 | 5 | 4 | 4 | 5 | 3 | 1 | 4 |
| FoodNotify | 5 | 5 | 5 | 3 | 5 | 6 | 3 | 5 |
| Horeko (Exact) | 4 | 4 | 3 | 4 | 5 | 5 | 2 | 4 |
| DISH Horeca | 4 | 4 | 3 | 4 | 3 | 3 | 1 | 4 |
| Growzer | 4 | 3 | 5 | 4 | 3 | 3 | 4 | 4 |
| Apicbase | 5 | 5 | 5 | 3 | 4 | 6 | 5 | 5 |
| **Toast** | **4** | **5** | **4** | **4** | **4** | **5** | **4** | **5** |
| **Lightspeed** | **5** | **4** | **5** | **5** | **5** | **5** | **4** | **5** |
| **Excel/Sheets** | **2** | **2** | **4** | **5** | **2** | **4** | **3** | **2** |
| **Canva** | **2** | **5** | **2** | **6** | **5** | **3** | **5** | **7** |
| **BBQ Architect v2** | **5** | **3** | **3** | **2** | **3** | **2** | **6** | **4** |

### Weighted Scores

| Product | TCE | IA&Nav | DataViz | Onboard | Mobile | Integ | AI | Design | **Totaal** | **Rank** |
|---------|-----|--------|---------|---------|--------|-------|----|--------|-----------|----------|
| CaterZen | 1.50 | 1.00 | 0.60 | 0.75 | 0.40 | 0.40 | 0.06 | 0.10 | **4.81** | 1 |
| Lightspeed | 1.25 | 0.80 | 0.75 | 0.75 | 0.50 | 0.50 | 0.12 | 0.10 | **4.77** | 2 |
| FoodNotify | 1.25 | 1.00 | 0.75 | 0.45 | 0.50 | 0.60 | 0.09 | 0.10 | **4.74** | 3 |
| Apicbase | 1.25 | 1.00 | 0.75 | 0.45 | 0.40 | 0.60 | 0.15 | 0.10 | **4.70** | 4 |
| Total Party Planner | 1.25 | 1.00 | 0.60 | 0.60 | 0.50 | 0.30 | 0.03 | 0.08 | **4.36** | 5 |
| Toast | 1.00 | 1.00 | 0.60 | 0.60 | 0.40 | 0.50 | 0.12 | 0.10 | **4.32** | 6 |
| Horeko (Exact) | 1.00 | 0.80 | 0.45 | 0.60 | 0.50 | 0.50 | 0.06 | 0.08 | **3.99** | 7 |
| Growzer | 1.00 | 0.60 | 0.75 | 0.60 | 0.30 | 0.30 | 0.12 | 0.08 | **3.75** | 8 |
| Caterease | 1.25 | 0.60 | 0.60 | 0.45 | 0.20 | 0.50 | 0.06 | 0.04 | **3.70** | 9 |
| DISH Horeca | 1.00 | 0.80 | 0.45 | 0.60 | 0.30 | 0.30 | 0.03 | 0.08 | **3.56** | 10 |
| **BBQ Architect v2** | **1.25** | **0.60** | **0.45** | **0.30** | **0.30** | **0.20** | **0.18** | **0.08** | **3.36** | **11** |
| Canva | 0.50 | 1.00 | 0.30 | 0.90 | 0.50 | 0.30 | 0.15 | 0.14 | **3.31** | 12 |
| Excel/Sheets | 0.50 | 0.40 | 0.60 | 0.75 | 0.20 | 0.40 | 0.09 | 0.04 | **2.72** | 13 |

### Updated Marktgemiddelden (12 concurrenten, excl. BBQ Architect)

| Dimensie | Oud gemiddelde (8) | Nieuw gemiddelde (12) | Verschil |
|----------|-------------------|-----------------------|----------|
| Task Completion Efficiency | 4.3 | 3.8 | -0.5 |
| IA & Navigation | 4.3 | 4.2 | -0.1 |
| Data Visualization | 4.3 | 3.9 | -0.4 |
| Onboarding & Learnability | 3.8 | 4.3 | +0.5 |
| Mobile Responsiveness | 3.8 | 3.9 | +0.1 |
| Integration Capabilities | 4.3 | 4.3 | 0 |
| AI/Automation | 2.5 | 3.0 | +0.5 |
| Visual Design | 4.1 | 4.3 | +0.2 |

**Key shifts:** De generieke tools (Excel, Canva) trekken TCE en DataViz gemiddelden omlaag, en Onboarding + AI omhoog (Canva's onboarding 6, AI 5). BBQ Architect's AI-voorsprong (6 vs nieuw gemiddelde 3.0) is nog steeds de grootste differentiator, nu met **+3.0 punten** voorsprong.

### Updated Gap Analysis

| Dimensie | BBQ Architect | Nieuw gemiddelde | Gap | Positie-shift |
|----------|--------------|-------------------|-----|---------------|
| **AI/Automation** | **6** | 3.0 | **+3.0** | Grootste voorsprong (was +3.5 bij 8 concurrenten) |
| **Onboarding** | **2** | 4.3 | **-2.3** | Verergerd — Canva (6) en Lightspeed (5) trekken gemiddelde omhoog |
| **Integraties** | **2** | 4.3 | **-2.3** | Onveranderd |
| **IA & Navigation** | **3** | 4.2 | **-1.2** | Licht verbeterd (Excel 2 trekt gemiddelde omlaag) |
| **DataViz** | **3** | 3.9 | **-0.9** | Verbeterd (Canva 2 trekt gemiddelde omlaag) |
| **Mobile** | **3** | 3.9 | **-0.9** | Verslechterd (Lightspeed 5, Canva 5 trekken omhoog) |

### Strategische Implicatie van Extended Benchmark

**De "echte concurrentie" is niet CaterZen — het is Excel + Canva.**

De meeste kleine Nederlandse cateraars gebruiken geen dedicated SaaS. Ze gebruiken Excel voor berekeningen en Canva voor visuele output. BBQ Architect's propositie is niet "beter dan CaterZen" maar "beter dan je spreadsheet". Dit betekent:

1. **Onboarding is nog kritischer** — Excel-gebruikers verwachten een tool die even makkelijk start als een spreadsheet (maar dan met automatisering)
2. **Visuele output moet Canva-niveau bereiken** — PDF-offertes en menukaarten moeten er professioneel genoeg uitzien om Canva overbodig te maken
3. **De golden path automatisering is de killer feature** — Het verschil tussen 5+ bestanden zonder dataflow en een 1-klik cascade

---

# Part 2: Stakeholder Map & Persona's

## 2.1 Primaire Persona: Cor — Eigenaar-Pitmaster

| Aspect | Detail |
|--------|--------|
| **Naam** | Cor (archetype, niet persoongebonden) |
| **Rol** | Eigenaar-operator, Pitmaster, Sales, Admin — alles in een persoon |
| **Bedrijf** | Hop & Bites BBQ Catering, Drenthe, Nederland |
| **Team** | Solo of 1-2 medewerkers bij grotere events |
| **Ervaring** | Vakman in BBQ/koken, beperkte tot gemiddelde digitale vaardigheden |
| **Leeftijd** | 30-55 |
| **Omzet** | 10-50 events/jaar, gemiddeld 40-100 gasten, EUR 30-50 p.p. |

### Context-Profielen

| Context | Device | Handen | Aandacht | Frequentie | Key Screens |
|---------|--------|--------|----------|------------|-------------|
| **Kantoor (avond)** | Laptop/desktop | Beide vrij | Volledig | 3-5x/week | Dashboard, Offertes, Financien, Klanten |
| **Keuken (prep)** | Tablet (gemonteerd) | Handschoenen/nat | Verdeeld | 2-3x/week bij events | Recepten, Gerechten, Voorraad |
| **Event (on-site)** | Telefoon | Een hand | Minimaal | 1-2x/week | HACCP, Service, Uren, Logistiek |
| **Onderweg (bus/auto)** | Telefoon | Een hand | Minimaal | Dagelijks | Dashboard, Agenda, Berichten |
| **Klantgesprek** | Tablet/laptop | Beide vrij | Gedeeld | 1-2x/maand | Offertes, Menu-engineering, Klantgesprek |

### Doelen & Frustraties

| Doel | Huidige frustratie |
|------|--------------------|
| "Ik wil in 2 minuten een offerte maken voor een klant die belt" | Offerte-editor is los van events. 10+ klikken, 5+ minuten |
| "Ik wil HACCP-temp loggen terwijl ik bij de smoker sta" | Desktop-formulier, kleine velden, geen numpad. Niet haalbaar met handschoenen |
| "Ik wil weten wat ik deze week moet doen als ik 's ochtends mijn app open" | Dashboard toont KPI's maar geen agenda/taken. Geen proactieve alerts |
| "Ik wil mijn boekhouder facturen sturen zonder overtikken" | Geen export naar Exact Online, Moneybird of UBL. Alleen PDF |
| "Ik wil dat een nieuw teamlid zelf kan werken zonder dat ik alles uitleg" | Geen onboarding, geen empty states, hardcoded rollen |

### Technologieprofiel

- **Dagelijks:** WhatsApp (klantcommunicatie), Google Calendar (persoonlijke agenda), Excel/Sheets (oude gewoontes)
- **Wekelijks:** Sligro/Hanos (inkoop, fysiek), Exact Online/Moneybird (boekhouding, via boekhouder)
- **Incidenteel:** Canva (menukaarten), social media (marketing), email (offertes naar klanten)

---

## 2.2 Secundaire Persona: Medewerker — Teamlid

| Aspect | Detail |
|--------|--------|
| **Naam** | Jesse (archetype) |
| **Rol** | Medewerker, assistent-kok, runner, logistiek |
| **Relatie tot Cor** | Parttime, ingehuurd per event of vaste kern |
| **Ervaring** | Horeca-ervaring, digitaal vaardig (jonger), maar kent het systeem niet |
| **Leeftijd** | 18-35 |
| **Gebruik** | Alleen op event-dagen en prep-dagen |

### Context-Profielen

| Context | Device | Handen | Aandacht | Key Screens |
|---------|--------|--------|----------|-------------|
| **Prep (keuken)** | Telefoon | Handschoenen/nat | Verdeeld | Recepten (lezen), Voorraad (afvinken) |
| **Event (on-site)** | Telefoon | Een hand | Minimaal | HACCP (temperatuur loggen), Uren (in-/uitklokken) |
| **Transport** | Telefoon | Niet beschikbaar | Minimaal | Logistiek (paklijst checken) |

### Doelen & Frustraties

| Doel | Huidige frustratie |
|------|--------------------|
| "Ik wil snel inklokken als ik aankom bij een event" | Uren-pagina is niet mobiel-geoptimaliseerd |
| "Ik wil weten welke gerechten ik moet preppen en in welke volgorde" | Prep-taken staan op /agenda, niet bij recepten. Geen mobiele weergave |
| "Ik wil HACCP-temp loggen zonder Cor lastig te vallen" | Systeem kent geen rollen — alles is toegankelijk, niets is begeleid |

---

## 2.3 Perifere Stakeholders

| Stakeholder | Relatie | Touchpoint met BBQ Architect | Behoefte |
|-------------|---------|------------------------------|----------|
| **Klant** (opdrachtgever) | Ontvangt offerte, menukaart, factuur | PDF (offerte, menukaart), Email | Professionele uitstraling, snelle reactie, duidelijke prijzen |
| **Boekhouder** | Ontvangt facturen voor administratie | PDF facturen (nu), UBL-export (gewenst) | Gestructureerde facturen in standaardformaat, geen handmatig overtikken |
| **Leverancier** (Sligro, Hanos) | Ontvangt bestellingen | Geen touchpoint (nu), inkoop-export (gewenst) | Digitale bestellijst, geen telefonische/WhatsApp orders |
| **NVWA/inspectie** | Controleert HACCP-compliance | HACCP-rapporten (PDF export) | Complete, leesbare temperatuurlogs per event |

---

## 2.4 Stakeholder Invloedsmatrix

```
                          HOOG INVLOED
                              |
                    Cor       |  Boekhouder
                  (beslisser, |  (blokkeert als
                   dagelijks) |   export ontbreekt)
                              |
    LAAG BELANG ──────────────┼────────────── HOOG BELANG
                              |
                    NVWA      |  Klant
                  (incidenteel|  (betaalt, bepaalt
                   maar       |   conversie offerte→event)
                   wettelijk) |
                              |
                          LAAG INVLOED
```

**Implicaties voor design-prioriteiten:**
- **Cor:** Elke feature moet door zijn lens passen (Principe #7)
- **Klant:** PDF-output kwaliteit is direct omzet-relevant (offerte-conversie)
- **Boekhouder:** UBL-export is de snelste weg naar concrete waarde (Principe #5)
- **Medewerker:** Pas relevant als team groeit — ontwerp alvast voor, bouw later

---

# Part 3: North-Star Vision

## 3.1 Vision Statement

> **BBQ Architect is de enige tool die een Nederlandse pitmaster nodig heeft — van de eerste klantvraag tot de laatste factuur, bedienbaar met een hand en vuile handschoenen.**

### Decompositie

| Element | Betekenis | Testbaar? |
|---------|-----------|-----------|
| "de enige tool" | Vervangt Excel + Canva + Google Calendar + losse HACCP-formulieren | Ja: meet hoeveel externe tools Cor nog gebruikt na 3 maanden |
| "Nederlandse pitmaster" | Niet vertaald Amerikaans. BTW, KvK, HACCP NL-normen, Nederlandse taal | Ja: 0 Engelse UI-labels, correcte BTW-berekening |
| "eerste klantvraag tot laatste factuur" | Volledige golden path zonder gaten | Ja: golden path in <8 klikken, 0 handmatige data-overdracht |
| "bedienbaar met een hand en vuile handschoenen" | Mobiel-first voor veldwerk, 56px touch targets | Ja: HACCP-log <15 sec, 0 touch targets <56px op veldpagina's |

### Decision Test

Bij elke design-beslissing, vraag:

1. **Brengt dit Cor dichter bij "de enige tool"?** — Als het een feature toevoegt die nog een externe tool vervangt: ja. Als het een feature toevoegt die complex toevoegt zonder iets te vervangen: nee.

2. **Werkt dit met een hand en vuile handschoenen?** — Als het op een telefoon met handschoenen werkt: ja. Als het desktop-precisie vereist voor iets dat op een event-locatie gebeurt: nee.

3. **Spreekt dit Cor's taal?** — Als het Nederlandse BBQ-termen gebruikt en Nederlandse horeca-conventies respecteert: ja. Als het generieke SaaS-termen of Engelse labels introduceert: nee.

### Marktpositie (12-18 maanden)

```
                    BREED (restaurant + catering + retail)
                              |
            Lightspeed        |         Toast
            (NL marktleider)  |         (US ecosysteem)
                              |
    GENERIEK ─────────────────┼───────────────── GESPECIALISEERD
                              |
            Excel+Canva       |     BBQ Architect ← DOEL
            (de DIY-stack)    |     (AI-first, BBQ-niche,
                              |      NL-specifiek)
                              |
                    SMAL (BBQ catering only)
```

BBQ Architect claimt de rechterbenedenhoek: **smal en gespecialiseerd**. Geen concurrent wil of kan hier zitten. De verdedigbaarheid zit in drie lagen:
1. **Domein-specificiteit** — BBQ-prep taken, HACCP-drempels, seizoensgebonden menukaarten
2. **NL-compliance** — UBL-facturatie, KvK, BTW-regels, Nederlandse taal
3. **AI-integratie** — 16 pagina-contexten, per-formulier pre-fills, proactieve nudges

---

# Part 4: Multi-Channel Experience Map

## 4.1 Kanalen

| Kanaal | Device | Wie | Wanneer | Huidige staat |
|--------|--------|-----|---------|---------------|
| **Desktop** | Laptop/PC | Cor | Avond/kantoor: planning, offertes, financien | Sterk (desktop-first design) |
| **Mobiel** | Telefoon | Cor + Jesse | Event, onderweg, keuken | Kritiek falen (81% touch violation) |
| **Tablet** | iPad/Android | Cor | Keuken (gemonteerd), klantgesprek | Niet geoptimaliseerd |
| **Email** | Resend/mailto | Cor → Klant | Offerte versturen, factuur sturen | Basis (via API of mailto fallback) |
| **PDF** | jsPDF | Cor → Klant, Boekhouder, NVWA | Offerte, factuur, menukaart, HACCP | Functioneel maar visueel basis |
| **AI Chat** | In-app | Cor | Overal, context-afhankelijk | Sterk (16 paginacontexten) |

## 4.2 Externe Touchpoints

| Touchpoint | Huidige integratie | Gewenste integratie | Prioriteit |
|------------|-------------------|---------------------|------------|
| **Google Calendar** | Geen | iCal-feed export (SC-3) | Hoog |
| **WhatsApp** | Handmatig | Offerte-link delen, bevestiging | Medium |
| **Sligro/Hanos** | Handmatig | Inkoop-export CSV | Laag |
| **Exact Online / Moneybird** | Geen | UBL 2.0 factuur-export (SC-1) | Hoog |
| **Belastingdienst** | Handmatig | BTW-aangifte data export | Laag |

## 4.3 Experience Map: Golden Path

```
FASE          │ 1. KLANTVRAAG      │ 2. OFFERTE          │ 3. PREP & INKOOP     │ 4. EVENT-DAG        │ 5. AFRONDING
──────────────┼────────────────────┼──────────────────────┼──────────────────────┼─────────────────────┼──────────────
KANAAL        │ Telefoon/WhatsApp  │ Desktop              │ Desktop + Tablet     │ Mobiel              │ Desktop
              │ → Desktop          │                      │                      │                     │
──────────────┼────────────────────┼──────────────────────┼──────────────────────┼─────────────────────┼──────────────
ACTIES COR    │ Notities maken     │ Menu selecteren      │ Inkooplijst maken    │ HACCP loggen        │ Factuur maken
              │ Event aanmaken     │ Prijs berekenen      │ Recepten schalen     │ Service coordineren │ Evaluatie invullen
              │ Klant invoeren     │ PDF genereren        │ Voorraad bestellen   │ Uren bijhouden      │ Betaling tracken
              │                    │ Email versturen      │ Logistiek checken    │ Team aansturen      │ Export naar boekhouder
──────────────┼────────────────────┼──────────────────────┼──────────────────────┼─────────────────────┼──────────────
ACTIES JESSE  │ —                  │ —                    │ Recepten lezen       │ HACCP loggen        │ —
              │                    │                      │ Prep-taken afvinken  │ In-/uitklokken      │
──────────────┼────────────────────┼──────────────────────┼──────────────────────┼─────────────────────┼──────────────
TOUCHPOINTS   │ WhatsApp           │ BBQ Architect        │ BBQ Architect        │ BBQ Architect       │ BBQ Architect
              │ Telefoon           │ Email (Resend)       │ Sligro (fysiek)      │ (mobiel)            │ Exact Online
              │ BBQ Architect      │ PDF                  │                      │                     │ PDF
──────────────┼────────────────────┼──────────────────────┼──────────────────────┼─────────────────────┼──────────────
EMOTIE COR    │ ⚡ Opgewonden      │ 😤 Gefrustreerd      │ 😐 Neutraal          │ 😰 Gestrest          │ 😊 Voldaan
              │ (nieuwe klant!)    │ (te veel klikken,    │ (routine maar        │ (druk, handen vol,  │ (event geslaagd,
              │                    │  niet snel genoeg)   │  handmatig werk)     │  app werkt niet     │  factuur klaar)
              │                    │                      │                      │  goed op telefoon)  │
──────────────┼────────────────────┼──────────────────────┼──────────────────────┼─────────────────────┼──────────────
PIJNPUNTEN    │ • Klantgegevens    │ • Offerte los van    │ • Inkoop handmatig   │ • HACCP onbruikbaar │ • Factuur niet
              │   handmatig        │   event              │ • Recepten niet      │   op mobiel         │   exporteerbaar
              │ • Geen klant-      │ • 10+ klikken        │   gekoppeld aan      │ • Touch targets     │ • Handmatig naar
              │   autocomplete     │ • PDF visueel basis  │   voorraad           │   te klein          │   boekhouder
              │                    │ • Marge niet direct  │ • Geen schaling      │ • Geen offline      │
              │                    │   zichtbaar          │   per gastenaantal   │                     │
──────────────┼────────────────────┼──────────────────────┼──────────────────────┼─────────────────────┼──────────────
KANSEN        │ QW-3: "Maak       │ CI-1: Event Wizard   │ CI-5: Auto prep      │ QW-4: HACCP         │ SC-1: UBL export
              │ Offerte" vanuit    │ met inline offerte   │ lists uit menu       │ Quick-Log           │ SC-3: iCal feed
              │ event              │                      │                      │ CI-2: Mobile        │
              │                    │                      │                      │ Service Mode        │
```

## 4.4 Emotionele Journey — Samenvatting

| Fase | Emotie | Oorzaak | Design-respons |
|------|--------|---------|----------------|
| 1. Klantvraag | Opwinding → Lichte frustratie | Nieuwe business! Maar handmatig invoeren | AI pre-fill klantgegevens uit historie |
| 2. Offerte | Frustratie | Te veel navigatie, geen directe koppeling event→offerte | Event Wizard (CI-1), "Maak Offerte" knop (QW-3) |
| 3. Prep | Neutraal → Onzekerheid | Routine werk, maar handmatige berekeningen onzeker | Auto-schaling recepten, gekoppelde inkooplijst |
| 4. Event-dag | Stress → Paniek | Druk, handen vol, app werkt niet op telefoon | HACCP Quick-Log (QW-4), Mobile Service Mode (CI-2) |
| 5. Afronding | Voldoening → Ergernis | Event geslaagd! Maar factuur handmatig exporteren | UBL-export (SC-1), 1-klik factuur vanuit event |

**Design-doel:** Elimineer de twee negatieve pieken (Fase 2: frustratie, Fase 4: stress) door respectievelijk workflow-consolidatie en mobile-first veldpagina's.

---

# Part 5: Design Brief

## 5.1 Opdracht

**Wat:** BBQ Architect v2 transformeren van een krachtige backend met fragmentarische frontend naar een geintegreerde, mobiel-bruikbare tool die de volledige catering-levenscyclus dekt.

**Waarom:** Huidige score 3.36/7 (rank 11/13). Doelscore na volledige implementatie: 5.76/7 (rank 1). De echte concurrent (Excel + Canva) scoort 2.72-3.31 — BBQ Architect moet het verschil onmiskenbaar maken.

**Voor wie:** Cor (eigenaar-pitmaster, solo tot 3-persoons team) in 5 device-contexten.

## 5.2 Scope — Phase 1 (Quick Wins, 0-4 weken)

### IN scope

| ID | Wat | Component/Bestand | Doel |
|----|-----|-------------------|------|
| QW-1 | Empty State Guides | Nieuw: `<EmptyState>` component, hergebruik `PAGE_CHIPS` uit `src/components/AiAssistant.tsx` | Onboarding 2→3 |
| QW-2 | Sidebar Smart Collapse | `src/components/Sidebar.tsx` | IA&Nav 3→4 |
| QW-3 | "Maak Offerte" vanuit Event | `src/app/events/page.tsx` + `src/components/SlideOverPanel.tsx` | TCE 5→5.5 |
| QW-4 | HACCP Mobile Quick-Log | `src/app/haccp/page.tsx` | Mobile 3→4 |
| QW-5 | Status Kleur Standaardisatie | `src/components/StatusBadge.tsx` | Design 4→4.5 |
| QW-6 | Gedeeld MetallicCard | `src/components/MetallicCard.tsx` (consolidatie) | Design intern |
| QW-7 | Dashboard Kalenderstrip | `src/app/page.tsx` + `src/components/WeekStrip.tsx` | DataViz 3→3.5 |

### NIET in scope (Phase 1)

- Event Wizard (CI-1) — te complex voor quick wins
- Mobile Service Mode (CI-2) — vereist apart layout-systeem
- UBL-export (SC-1) — vereist UBL-spec implementatie
- Proactieve AI nudges (CI-3) — vereist AI-architectuur wijziging
- Navigatie redesign (CI-6) — vereist IA-herstructurering

## 5.3 Constraints

| Type | Constraint | Impact |
|------|-----------|--------|
| **Technisch** | Next.js 16 / React 19 / Supabase / Tailwind CDN | Alle oplossingen binnen dit framework |
| **Technisch** | Dark theme met MetallicCard patroon | Nieuwe componenten respecteren bestaande design tokens |
| **Technisch** | jsPDF via CDN voor PDF-generatie | PDF-verbeteringen binnen jsPDF mogelijkheden |
| **Capaciteit** | Solo developer (Sam) | Incrementeel implementeerbaar, max 1-2 dagen per initiatief |
| **Business** | Hop & Bites als launch customer | Cor's feedback is de validatie |
| **Regulatoir** | HACCP NL-normen | Kerntemp >=75C, warmhoud >=60C, koeling <=7C |
| **UX** | 44px touch targets alleen op mobile/tablet, desktop blijft compact | Per bestaande feedback-memory |

## 5.4 Design Principles (gevalideerd — uit bestaand rapport)

1. **Nul Navigatie** — Golden path zonder paginatransities (rank 1, drijft 45% score)
2. **AI Toont, Jij Bevestigt** — AI vult in, gebruiker bevestigt (rank 2)
3. **Een Hand, Vuile Handschoenen** — Veldpagina's met 56px targets, numpad, geen precisie (rank 3)
4. **Lege Pagina = Leraar** — Elke lege staat begeleidt naar eerste actie (rank 4)
5. **Export Eerst, API Later** — UBL, iCal, CSV voor directe integratie-waarde (rank 5)
6. **Dashboard = Antwoord** — Dashboard beantwoordt "wat moet ik nu doen?" zonder klikken (rank 6)
7. **Cor's BBQ, Cor's Taal** — Nederlands, BBQ-termen, NL-conventies (rank 7)

Bij conflict wint het hoger gerankte principe.

## 5.5 Referentieontwerpen (uit concurrentie-analyse)

| Aspect | Referentie | Wat overnemen |
|--------|-----------|---------------|
| **Onboarding** | CaterZen (Onboarding 5) | Intuïtieve eerste-gebruik ervaring, minimale leercurve |
| **Mobile field UX** | Toast Go handhelds | Grote touch targets, high-contrast, keukenbestendig design |
| **Analytics dashboard** | Lightspeed Advanced Insights | Menu-item winstgevendheid, trend-visualisaties |
| **Visual output** | Canva templates (Design 7) | Professionele uitstraling van PDF-offertes en menukaarten |
| **Workflow wizard** | Total Party Planner event flow | Stap-voor-stap met progress indicator |

## 5.6 Technische Implementatie-Notities

### EmptyState Component (QW-1)
- Hergebruik `PAGE_CHIPS` uit `src/components/AiAssistant.tsx` — bevat al per-pagina suggesties
- Pattern: detecteer 0 records in Supabase query → render `<EmptyState>` i.p.v. lege tabel
- Props: `title`, `description`, `actionLabel`, `onAction`, `aiChips[]`

### Sidebar Collapse (QW-2)
- Huidige structuur: 9 secties in `src/components/Sidebar.tsx`
- Doel: reduceer naar 5 primaire secties
- Strategie: Communicatie + Website + Hulp → verplaats naar instellingen/footer
- Bestaand collapse-mechanisme (260px→80px) hergebruiken

### HACCP Quick-Log (QW-4)
- Bestaand: `src/app/haccp/page.tsx` met standaard `<select>` en text inputs
- Doel: conditionele mobiele layout met grote knoppen (product-grid, numpad)
- Bestaande HACCP-logica (`getStatus()`) hergebruiken — alleen UI vervangen
- Constraint: 44px touch targets op mobile/tablet, desktop compact (per memory)

### MetallicCard Consolidatie (QW-6)
- Bestaand: `src/components/MetallicCard.tsx` al aanwezig
- Audit: zoek naar inline MetallicCard-achtige styling in page components
- Vervang door gedeeld component met consistente props

## 5.7 Definition of Done per Phase 1 Initiatief

| ID | Klaar wanneer... |
|----|-------------------|
| QW-1 | Elke pagina met Supabase-tabel toont `<EmptyState>` bij 0 records. Bevat uitleg + actieknop + AI-chip |
| QW-2 | Sidebar toont 5 primaire secties. Systeem/Communicatie/Website/Hulp verplaatst naar secondair |
| QW-3 | Event-kaart heeft "Maak Offerte" knop. Opent offerte-editor pre-filled met klant, datum, gasten |
| QW-4 | HACCP-pagina toont mobiele layout op <768px: product-grid (56px knoppen), numpad temp-invoer, 1-tap save |
| QW-5 | Alle status-kleuren geunificeerd via `StatusBadge` component. Groen/amber/rood/blauw/grijs consistent |
| QW-6 | Alle MetallicCard-achtige styling vervangt door gedeeld component |
| QW-7 | Dashboard toont horizontale week-kalender met event-markers boven KPI-kaarten |

## 5.8 Scoreprojectie

| Scenario | Score | Verbetering | Rank (van 13) |
|----------|-------|-------------|---------------|
| **Huidige staat** | 3.36 | — | 11 |
| **Na Phase 1 (Quick Wins)** | ~3.90 | +0.54 | 9 (voorbij DISH, Caterease) |
| **Na Phase 2 (Core Improvements)** | ~4.50 | +1.14 | 6 (voorbij Toast, Horeko) |
| **Na Phase 3 (Strategic)** | ~5.76 | +2.40 | 1 (voorbij CaterZen) |

---

# Appendix: Bronnen Nieuwe Concurrenten

## Toast
- Toast Catering & Events product page (pos.toasttab.com)
- Toast IQ AI launch announcement (Jan 2026)
- G2 reviews (198 reviews, 4.5/5), Capterra reviews (300+, 4.1/5)
- Perfect Venue competitive analysis
- Toast API documentation (doc.toasttab.com)
- Toast Central help documentation

## Lightspeed
- Lightspeed NL pricing (lightspeedhq.nl, EUR 89-249/mnd)
- Capterra reviews (214+, 4.4/5)
- POSsystems.nl (1.600+ NL klanten)
- Lightspeed AI launch (PRNewswire, januari 2026)
- Kassazaak.nl comparison
- Lightspeed Twinfield/Exact Online integratie-documentatie

## Excel / Google Sheets
- Apicbase food cost spreadsheet template
- CaterZen "Ditch Excel" article (10-15 uur/week besparing)
- IndiCater "Spreadsheet mistakes costing caterers thousands"
- Belastingdienst factuureisen (btw-identificatienummer, KvK, oplopende nummering)
- Voorbeeld-Office.com NL factuur-templates

## Canva
- Canva catering menu templates (canva.com/menus/templates/catering)
- Canva Magic Studio (25+ AI-tools)
- Canva Sheets (2025, 60+ formules)
- Canva pricing 2026 (UserJot, GetAIPerks): Free/Pro EUR 13/mnd/Business EUR 20/gebruiker
- Canva Connect API documentatie
