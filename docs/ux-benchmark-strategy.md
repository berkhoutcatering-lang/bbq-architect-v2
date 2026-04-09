# BBQ Architect v2 — UX Benchmark, Problem Framing & Strategy Report

**Datum:** 7 april 2026
**Product:** BBQ Architect v2 — Catering Business Management ERP
**Bedrijf:** Hop & Bites (BBQ Catering, Drenthe, Nederland)
**Stack:** Next.js 16 / React 19 / Supabase / Tailwind CSS

---

## Executive Summary

### Positie in de markt

BBQ Architect v2 is geëvalueerd tegen 8 concurrenten in de catering/horeca-management software markt: Caterease, CaterZen, Total Party Planner, FoodNotify, Horeko (Exact), DISH Horeca, Growzer, en Apicbase. Op basis van een gewogen 8-dimensie scoring (7-punts Baymard Institute methodologie) scoort BBQ Architect v2 **3.36/7** — de laagste totaalscore, maar met de **hoogste AI/Automation score (6/7)** van alle 9 producten.

### Drie kernbevindingen

**1. AI-first is de enige verdedigbare differentiator**
Geen concurrent komt in de buurt van BBQ Architect's AI-integratie: 16 pagina-specifieke contexten, 20+ database-tools, per-pagina suggestie-chips. De dichtstbijzijnde concurrent (Apicbase: 5/7) biedt voice input maar geen context-aware AI. Dit is het fundament waarop de strategie bouwt.

**2. Volledige golden path dekking is zeldzaam — en BBQ Architect heeft het**
Slechts 4 van de 9 producten dekken de volledige catering golden path (Event → Offerte → Prep → Service → Factuur). Horeko, DISH Horeca, Growzer, en Apicbase missen 2-5 stages. BBQ Architect's `syncEngine.ts` handelt de backend-cascade elegant af — het probleem zit volledig in de frontend-fragmentatie (5+ pagina's, ~15 klikken).

**3. Onboarding en integraties zijn de kritieke gaps**
BBQ Architect scoort **2/7** op zowel Onboarding als Integraties — respectievelijk 1.8 en 2.3 punten onder het marktgemiddelde. Geen onboarding-flow, geen empty states, geen boekhouding-export, geen kalender-sync. Dit zijn de twee dimensies waar verbetering de grootste impact heeft op de totaalscore.

### Strategisch antwoord (uit Part 2 & 3)

Het probleem is geframed als: *"BBQ Architect v2 is een krachtige backend met een fragmentarische frontend"*. Vijf strategische pijlers adresseren dit:

| Pijler | Kern | Eerste actie |
|--------|------|-------------|
| **1. Een stroom** | Consolideer golden path in wizards | QW-3: "Maak Offerte" vanuit event |
| **2. Mobiel waar het telt** | HACCP, service, logistiek mobile-first | QW-4: HACCP Quick-Log |
| **3. AI als co-piloot** | Van reactieve chat naar proactieve nudges | CI-3: Inline badges en toasts |
| **4. Progressieve onthulling** | Sidebar reduceren, empty states, onboarding | QW-1: Empty State Guides |
| **5. Verbinden** | Export-kwaliteit → API-integraties | SC-1: UBL 2.0 factuur-export |

### Aanbevolen startpunt

Begin met **QW-1 (Empty States) + QW-6 (Gedeeld MetallicCard)** als fundament, gevolgd door **QW-3 (Offerte vanuit Event) + QW-5 (Status Standaardisatie)** voor directe workflow-verbetering. Deze 4 quick wins zijn implementeerbaar binnen 2 weken en adresseren de twee laagst scorende dimensies (Onboarding en IA/Navigation).

### Gewogen totaalscore-projectie

| Scenario | Score | Verbetering | Rank |
|----------|-------|-------------|------|
| Huidige staat | 3.36 | — | 9/9 |
| Na Phase 1 (Quick Wins) | ~3.90 | +0.54 | 7/9 |
| Na Phase 2 (Core) | ~4.50 | +1.14 | 4/9 |
| Na Phase 3 (Strategic) | ~5.00 | +1.64 | 2/9 |

De AI-differentiator (score 6→7) gecombineerd met het dichten van de onboarding- en integratie-gaps zou BBQ Architect v2 positioneren als **#2 in de markt** — achter CaterZen op brede UX maar voorop in AI-intelligentie, BBQ-domeinspecificiteit, en Nederlandse marktfocus.

---

# Part 1: Competitive Benchmark

## 1.1 Methodology & Confidence Framework

### Approach
Dit benchmark-onderzoek gebruikt **secundaire onderzoeks-triangulatie** omdat directe hands-on toegang tot de meeste concurrerende producten niet beschikbaar is. Elke score wordt onderbouwd met bronvermelding en een betrouwbaarheidsindicator.

### Evidence Hierarchy (in volgorde van betrouwbaarheid)
1. **Hands-on trial** — Waar gratis proefversies beschikbaar zijn
2. **Video walkthroughs** — YouTube demo's, vendor webinars, klant-tutorials
3. **Help-documentatie met screenshots** — Knowledge bases met stap-voor-stap begeleiding
4. **Review platform UX-specifieke comments** — G2, Capterra, TrustRadius gefilterd op UX-keywords
5. **Marketing feature pages** — Nuttig voor feature aanwezigheid, onbetrouwbaar voor UX-kwaliteit
6. **API/integratie documentatie** — Onthult technische diepte

### Confidence Scoring
| Level | Betekenis |
|-------|-----------|
| **Hoog** | Hands-on evidence of uitgebreide video/documentatie |
| **Medium** | Redelijke documentatie + meerdere review-bevestigingen |
| **Laag** | Alleen marketing claims; score gemarkeerd met * |

### Scoring Schaal (7-punts, Baymard Institute methodologie)
| Score | Betekenis |
|-------|-----------|
| 7 | Exemplarisch — best-in-class implementatie |
| 6 | Sterk — overtreft verwachtingen |
| 5 | Competent — voldoet aan verwachtingen |
| 4 | Adequaat — acceptabel met kleine issues |
| 3 | Matig — significante gaps |
| 2 | Zeer matig — grote problemen |
| 1 | Afwezig / niet-functioneel |

### Evaluation Dimensions (Gewogen)
| # | Dimensie | Gewicht | Evaluatiecriteria |
|---|---------|---------|-------------------|
| 1 | Task Completion Efficiency | 25% | Klikken per workflow, automatisering, cross-module linking, batch operaties |
| 2 | Information Architecture & Navigation | 20% | Menu-diepte, label-helderheid, vindbaarheid, zoekfunctie, breadcrumbs |
| 3 | Data Visualization & Reporting | 15% | Dashboard compositie, chart types, drill-down, export mogelijkheden |
| 4 | Onboarding & Learnability | 15% | Eerste gebruik, contextual help, empty states, documentatie |
| 5 | Mobile Responsiveness | 10% | Touch-friendly, responsive layouts, field-use optimalisatie |
| 6 | Integration Capabilities | 10% | Native integraties, API kwaliteit, import/export formaten |
| 7 | AI/Automation Features | 3% | Slimme suggesties, predictieve features, workflow automatisering |
| 8 | Visual Design & Consistency | 2% | Design system maturity, componentconsistentie, visuele hierarchie |

---

## 1.2 Competitor Profiles

### Profile 1: Caterease

| Veld | Waarde |
|------|--------|
| **Product** | Caterease |
| **HQ** | Florida, VS |
| **Doelgroep** | Kleine tot grote cateringbedrijven (50.000+ gebruikers wereldwijd) |
| **Prijsmodel** | $68-132/maand (Express/Standard/Professional) + $200 setup + $28/extra gebruiker |
| **Platform** | Cloud-based, oorspronkelijk desktop-first |
| **Mobiele app** | Nee — responsive web, geen native app |
| **API** | Beperkt — via Zapier, geen open REST API |

**Feature Coverage:**

| Area | Dekking | Details |
|------|---------|---------|
| Kitchen/Menu | Sterk | Custom menu's met ingredient-level kosten/winstberekening |
| Operations/Events | Zeer sterk | 2D/3D/360° event layout visualisatie, automatische paklijsten |
| Business/Finance | Sterk | Contracten, facturen, financiele rapportage |
| Logistics/Staff | Sterk | Personeelsplanning, loonintegratie, automatische paklijsten |
| Inventory | Sterk | Voorraadbeheer gekoppeld aan recepten |

**Unieke sterke punten:**

1. **Marktleider qua features** — Meest uitgebreide featureset in de categorie met 50K+ gebruikers als validatie. Covers van 2D/3D event layouts tot automatische paklijsten.
2. **Event visualisatie** — Uniek: 2D/3D/360-graden layout-tools voor event-ruimtes. Geen concurrent biedt dit.
3. **Automatische paklijsten** — Equipment automatisch gekoppeld aan menu-items; paklijst genereert zichzelf per event.
4. **Breed integratie-ecosysteem** — QuickBooks, Outlook, Google Calendar, Mailchimp, Constant Contact, Salesforce, Zapier.

**UX-problemen (uit G2/Capterra reviews):**

1. **Verouderde, rommelige interface** — Meest genoemde klacht: "needs a facelift", "hasn't been updated in years". Kleine scrollbars, elementen worden afgesneden tenzij venster vergroot.
2. **Steile leercurve** — Significant setup- en trainingstijd vereist. Complexe menustructuur met lagen die op niet-intuïtieve wijze samenhangen.
3. **Instabiliteit** — Frequente crashes en bugs gemeld in recente reviews.
4. **Geen native mobiele app** — Alleen browser-based; niet geoptimaliseerd voor touch of veldgebruik.
5. **Legacy Windows-gevoel** — Scroll-functionaliteit en window-management voelen als een desktop-applicatie uit 2010.

**UX Scoring:**

| Dimensie | Score | Confidence | Toelichting |
|----------|-------|------------|-------------|
| Task Completion Efficiency | **5** | Medium | Uitgebreide automatisering (paklijsten, menu-kosten) maar veel klikken door rommelige UI |
| IA & Navigation | **3** | Medium | Complex, gelaagd menu dat op niet-intuïtieve wijze samenhangt. Slechte vindbaarheid |
| Data Visualization | **4** | Medium | Financiele rapportages aanwezig, geen geavanceerde dashboards gedocumenteerd |
| Onboarding & Learnability | **3** | Medium | Uitgebreide documentatie maar steile leercurve. Training nodig |
| Mobile Responsiveness | **2** | Medium | Browser-only, geen native app, geen touch-optimalisatie |
| Integration Capabilities | **5** | Hoog | QuickBooks, Google Cal, Outlook, Zapier, Salesforce, Mailchimp |
| AI/Automation Features | **2** | Medium | Automatische paklijsten en menu-berekeningen, geen AI/predictieve features |
| Visual Design & Consistency | **2** | Medium | Verouderd design, inconsistente componenten, legacy Windows-esthetiek |

**Evidence Inventory:**
- G2 reviews (47 reviews, 3.9/5 gemiddeld) — UX-klachten consistent over meerdere jaren
- Capterra reviews (130+ reviews) — Bevestiging van leercurve en verouderd design
- Software Advice profiel — Feature-overzicht en prijsinformatie
- Caterease.com — Marketing feature pages en prijspagina

---

### Profile 2: CaterZen

| Veld | Waarde |
|------|--------|
| **Product** | CaterZen |
| **HQ** | VS |
| **Doelgroep** | Drop-off, takeout, delivery, full-service catering (SMB tot mid-market) |
| **Prijsmodel** | $99-229/maand (4 tiers), gratis proefperiode, geen per-user kosten |
| **Platform** | Cloud-based SaaS |
| **Mobiele app** | Delivery Manager App (chauffeur-gericht) + responsive web |
| **API** | Beperkt — QuickBooks sync, geen open API |

**Feature Coverage:**

| Area | Dekking | Details |
|------|---------|---------|
| Kitchen/Menu | Sterk | Drag-and-drop keukenproductie-rapporten, menu-management |
| Operations/Events | Sterk | CRM, online bestelling, route-optimalisatie, bezorgbeheer |
| Business/Finance | Zeer sterk | Volledige boekhouding, creditcard-verwerking, facturen, aging reports |
| Logistics/Delivery | Zeer sterk | Interactieve mapping, route-optimalisatie, chauffeur-app |
| Marketing | Sterk | Branded online bestelportaal, CRM met groeps-contacten |

**Unieke sterke punten:**

1. **Beste UX in de categorie** — Consistent geprezen als intuïtief en gebruiksvriendelijk in reviews. Moderne interface met minimale leercurve.
2. **Delivery management** — Route-optimalisatie met interactieve kaarten en dedicated chauffeur-app. Uniek voor bezorgcatering.
3. **Online bestelportaal** — Custom-branded klantportaal voor online bestellen. Directe omzet-driver.
4. **Onbeperkte gebruikers** — Geen per-user kosten; schaalt zonder extra kosten voor personeel.
5. **Sterke CRM** — Groeps-contactbeheer, klantgeschiedenis, herhalingsbestellingen.

**UX-problemen (uit reviews):**

1. **Beperkte aanpasbaarheid** — Sommige gebruikers willen meer customization-opties voor workflows.
2. **Klantportaal verbeterbaar** — De klant-facing interface is functioneel maar niet visueel sterk.
3. **Alleen Authorize.net** — Geen Stripe-integratie beschikbaar voor betalingen.

**UX Scoring:**

| Dimensie | Score | Confidence | Toelichting |
|----------|-------|------------|-------------|
| Task Completion Efficiency | **6** | Medium | Gestroomlijnde workflows, minder klikken dan Caterease, goede automatisering |
| IA & Navigation | **5** | Medium | Heldere, logische menustructuur. Intuïtieve navigatie |
| Data Visualization | **4** | Laag* | Dashboard en rapporten aanwezig, details niet uitgebreid gedocumenteerd |
| Onboarding & Learnability | **5** | Medium | Minimale leercurve, intuïtief design, goede support |
| Mobile Responsiveness | **4** | Medium | Chauffeur-app goed, responsive web, maar geen volledige mobiele suite |
| Integration Capabilities | **4** | Hoog | QuickBooks Online, Google Calendar, POS sync, Authorize.net |
| AI/Automation Features | **2** | Laag* | Automatische route-planning, geen AI-features gedocumenteerd |
| Visual Design & Consistency | **5** | Medium | Modern, clean interface. Consistent design patronen |

**Evidence Inventory:**
- G2 reviews — Consistent positieve UX-feedback
- CaterZen.com — Feature pages, pricing, online bestelling demo
- GetApp vergelijkingen — Positionering vs. concurrenten

---

### Profile 3: Total Party Planner

| Veld | Waarde |
|------|--------|
| **Product** | Total Party Planner (TPP) |
| **HQ** | VS |
| **Doelgroep** | Full-service caterers, corporate event organizers (SMB tot groot) |
| **Prijsmodel** | Custom pricing (contact voor offerte), mobiele app inclusief |
| **Platform** | Cloud-based SaaS |
| **Mobiele app** | Ja — iOS, Android, iPad. Kalender, events, menu, financieel |
| **API** | Beperkt — ChefTec bidirectional import/export, Prismm export |

**Feature Coverage:**

| Area | Dekking | Details |
|------|---------|---------|
| Kitchen/Menu | Sterk | Receptkosten met nauwkeurige kostenverdeling |
| Operations/Events | Zeer sterk | Event & operations management, BEO's, kalenderintegratie |
| Business/Finance | Sterk | Winstanalyse (basis & gedetailleerd), betalingsbeheer, aanbetaling-tracking |
| Communication | Sterk | Klantportaal met chat en notificaties |
| Calendar | Sterk | Google/Outlook kalendersync, geïntegreerde contacten |

**Unieke sterke punten:**

1. **Event-centrisch design** — Alles draait om het event als kernentiteit. Natuurlijke workflow van event naar menu naar planning.
2. **Sterke mobiele app** — Native apps voor iOS/Android/iPad met kalender, event-zoek, menu/staffing/financieel detail.
3. **Klantportaal** — Klanten kunnen communiceren, documenten bekijken, en bevestigen via portaal.
4. **Receptkosten-integratie** — ChefTec bidirectional sync voor nauwkeurige ingrediëntkosten.
5. **BEO-generatie** — Banquet Event Orders automatisch gegenereerd uit eventgegevens.

**UX-problemen (uit reviews):**

1. **Recente systeemwijzigingen** — Gemengde reviews na recente updates die functionaliteit-zorgen veroorzaakten.
2. **Beperkte documentatie** — Minder uitgebreide kennisbank dan concurrenten.
3. **Ondoorzichtige pricing** — Geen gepubliceerde prijzen; vereist contact voor offerte.

**UX Scoring:**

| Dimensie | Score | Confidence | Toelichting |
|----------|-------|------------|-------------|
| Task Completion Efficiency | **5** | Laag* | Event-centrische workflow gestroomlijnd, maar beperkte review-data over klikken/stappen |
| IA & Navigation | **5** | Laag* | Kalender-centrische navigatie, event-gerichte menustructuur |
| Data Visualization | **4** | Laag* | Winstanalyse tools, maar visualisatie-details niet uitgebreid gedocumenteerd |
| Onboarding & Learnability | **4** | Laag* | Redelijke documentatie, maar weinig specifieke onboarding-informatie beschikbaar |
| Mobile Responsiveness | **5** | Medium | Native apps voor iOS/Android/iPad met uitgebreide functionaliteit |
| Integration Capabilities | **3** | Medium | ChefTec, Prismm, Google/Outlook Cal. Beperkt ecosysteem |
| AI/Automation Features | **1** | Laag* | Geen AI-features gedocumenteerd |
| Visual Design & Consistency | **4** | Laag* | Functioneel design, maar visuele kwaliteit niet uitgebreid beoordeelbaar |

**Evidence Inventory:**
- Software Advice profiel — Feature-overzicht en gebruikersreviews
- Capterra reviews — Gemengde feedback na recente updates
- TotalPartyPlanner.com — Feature pages en mobiele app documentatie

---

### Profile 4: FoodNotify

| Veld | Waarde |
|------|--------|
| **Product** | FoodNotify |
| **HQ** | Wenen, Oostenrijk |
| **Doelgroep** | Multi-locatie F&B, hospitality, catering (SMB tot enterprise) |
| **Prijsmodel** | Custom pricing per module-selectie, implementatie-doorlooptijd vereist |
| **Platform** | Cloud-based SaaS |
| **Mobiele app** | Ja — iOS & Android, tablet-geoptimaliseerd, zelfverklarend design |
| **API** | Open API's voor POS, boekhouding, leveranciers |

**Feature Coverage:**

| Area | Dekking | Details |
|------|---------|---------|
| Kitchen/Menu | Zeer sterk | Receptbeheer, menukaart-management, allergenen, Nutri-scores |
| Operations/Events | Sterk | Eventplanning met personeel, equipment, kostentracking |
| Business/Finance | Zeer sterk | Kostenberekening per event/gast/maaltijd, realtime KPI's |
| Procurement | Zeer sterk | Geautomatiseerde bestelvoorstellen, leveranciersintegratie |
| Compliance | Sterk | HACCP-compliance tracking, duurzaamheidsmetrics (Eaternity) |
| Multi-locatie | Zeer sterk | Centraal beheer voor meerdere vestigingen |

**Unieke sterke punten:**

1. **Europese marktleider** — Sterke aanwezigheid in DACH-regio (Duitsland, Oostenrijk, Zwitserland). Grote klanten: a&o Hostels, Concept Family (70+ locaties).
2. **Kostenberekening tot op gasten-niveau** — Per event, per gast, per maaltijd/drank. Realtime kosteninzicht.
3. **Open API-architectuur** — Integraties met elk POS-systeem, boekhoudsoftware, leveranciersplatforms.
4. **Duurzaamheidsmetrics** — Eaternity-integratie voor CO2-voetafdruk per gerecht. Uniek in de markt.
5. **Multi-locatie management** — HQ-dashboard voor centraal beheer van meerdere vestigingen.

**UX-problemen (uit reviews):**

1. **Implementatietijd** — Vereist doorlooptijd voor implementatie en testen. Niet plug-and-play.
2. **Ondoorzichtige pricing** — Custom pricing per module; moeilijk om kosten vooraf in te schatten.
3. **Beperkte Engelstalige reviews** — Lastig om UX-kwaliteit te beoordelen uit reviews.

**UX Scoring:**

| Dimensie | Score | Confidence | Toelichting |
|----------|-------|------------|-------------|
| Task Completion Efficiency | **5** | Medium | Gestroomlijnde event- en kostenworkflows, maar implementatie-complexity |
| IA & Navigation | **5** | Laag* | Modern, kosten-centrische module-organisatie. Beperkte UX-reviews beschikbaar |
| Data Visualization | **5** | Medium | Realtime KPI dashboards, kostenrapportages, multi-locatie overzichten |
| Onboarding & Learnability | **3** | Medium | Professionele implementatie vereist; niet zelf-service. Documentatie beschikbaar |
| Mobile Responsiveness | **5** | Medium | Native iOS/Android apps, tablet-geoptimaliseerd, zelfverklarend design |
| Integration Capabilities | **6** | Hoog | Open API's, POS-integraties, leveranciers, boekhouding, Eaternity |
| AI/Automation Features | **3** | Laag* | Geautomatiseerde bestelvoorstellen, maar geen AI-features specifiek gedocumenteerd |
| Visual Design & Consistency | **5** | Laag* | Modern, clean interface op basis van screenshots. Beperkt verifieerbaar |

**Evidence Inventory:**
- FoodNotify.com — Feature pages, klantcases, integratie-documentatie
- Software Advice profiel — Categorisering en feature-overzicht
- Capterra reviews — Beperkt aantal reviews, overwegend positief

### Profile 5: Horeko (Exact)

| Veld | Waarde |
|------|--------|
| **Product** | Horeko (onderdeel van Exact) |
| **HQ** | Nederland (Exact: Delft) |
| **Doelgroep** | Kleine tot middelgrote horecabedrijven (restaurants, cafetaria's, hotels, franchises) |
| **Prijsmodel** | Modulair, flexibele contracten (maandelijks of jaarlijks), geen langetermijnverplichtingen |
| **Platform** | Cloud-based SaaS |
| **Mobiele app** | Ja — iOS & Android (gratis). Roosters, in/uitklokken, verlofaanvragen, beschikbaarheid |
| **API** | Integraties met Aloha, Lightspeed, Nmbrs, Vectron, Bid Food, en meer |

**Feature Coverage:**

| Area | Dekking | Details |
|------|---------|---------|
| Kitchen/Menu | Sterk | Receptkosten, menu-engineering, bulk/conversie-recepten |
| Compliance | Zeer sterk | HACCP-registratie, houdbaarheidsLabels, allergenen, ontdooitracking |
| Staff Management | Zeer sterk | Roostering, tijdregistratie (biometrie/PIN/RFID), interne berichten |
| Inventory/Procurement | Sterk | Voorraadbeheer, inkoopbeheer, verspillingsregistratie |
| Business/Finance | Basis | Productiviteitsanalyse, documentopslag. Beperkte facturatie |
| Events/Catering | Zwak | Geen dedicated event- of offerte-management |

**Unieke sterke punten:**

1. **Nederlandse marktleider** — 1.500+ bedrijven in Nederland & België. Eigendom van Exact (groot Nederlands softwarebedrijf). Nederlandstalig support: +31 88 711 9711.
2. **HACCP-compliance** — Uitgebreide voedselveiligheid: houdbaarheidsLabels, ontdooitracking, verspillingsregistratie met historie. Sterker dan de meeste concurrenten.
3. **Personeelsbeheer** — Volledige HR-suite: roostering, tijdregistratie (biometrie/PIN/RFID), verlofbeheer, beschikbaarheidsbeheer, shift-swapping via app.
4. **Flexibele contracten** — Maandelijks opzegbaar, geen langetermijnverplichtingen. Laagdrempelig voor kleine horecazaken.
5. **Breed leveranciers-netwerk** — Integraties met Nederlandse hospitality-software en leveranciers (Bid Food, etc.).

**UX-problemen (uit reviews):**

1. **Niet catering-specifiek** — Gericht op restaurants/cafetaria's, niet op event-catering. Geen offerte- of event-workflow.
2. **Beperkte Engelstalige documentatie** — Primair Nederlandstalig; moeilijk te beoordelen voor internationale vergelijking.
3. **Beperkte financiële features** — Geen volledige boekhouding of factuur-generatie (verwijst naar Exact voor boekhouding).

**UX Scoring:**

| Dimensie | Score | Confidence | Toelichting |
|----------|-------|------------|-------------|
| Task Completion Efficiency | **4** | Medium | Goed voor restaurant-operaties maar ontbreekt catering-specifieke workflows (events, offertes) |
| IA & Navigation | **4** | Laag* | Praktisch en recht-toe-recht-aan. Beperkt verifieerbaar uit beschikbare bronnen |
| Data Visualization | **3** | Laag* | Productiviteitsanalyse en verspillingshistorie, maar geen geavanceerde dashboards gedocumenteerd |
| Onboarding & Learnability | **4** | Laag* | Flexibele onboarding met module-selectie, maar onboarding-kwaliteit niet specifiek beoordeeld |
| Mobile Responsiveness | **5** | Hoog | Sterke native app: roosters, klokken, verlof, shift-swap. Goed voor dagelijks personeel-gebruik |
| Integration Capabilities | **5** | Hoog | Uitgebreid Nederlands ecosysteem: Aloha, Lightspeed, Nmbrs, Vectron, Bid Food, Clixx |
| AI/Automation Features | **2** | Laag* | Geautomatiseerde houdbaarheidsberekeningen en verspillings-alerts, geen AI |
| Visual Design & Consistency | **4** | Laag* | Functioneel design. Beperkt verifieerbaar |

**Evidence Inventory:**
- Exact.com/nl/producten/exact-horeko — Officiële productpagina (NL)
- Horeko.com/en — Engelstalige feature-pagina's
- Capterra reviews — Beperkt aantal, overwegend positief voor HR/roostering

---

### Profile 6: DISH Horeca

| Veld | Waarde |
|------|--------|
| **Product** | DISH Horeca (by DISH / Sitedish) |
| **HQ** | Nederland |
| **Doelgroep** | Kleine tot middelgrote horecabedrijven (cafés, restaurants, ketens) |
| **Prijsmodel** | Niet gepubliceerd |
| **Platform** | Cloud-based POS + management systeem |
| **Mobiele app** | Primair web-based, geen dedicated native app bevestigd |
| **API** | Beperkt — website & Google My Business integratie |

**Feature Coverage:**

| Area | Dekking | Details |
|------|---------|---------|
| POS/Orders | Zeer sterk | Intuïtief kassasysteem, snelle orderinvoer, directe keuken-verbinding |
| Reserveringen | Sterk | Geïntegreerd reserveringssysteem via website & Google My Business |
| Inventory | Basis | Automatische voorraadniveaus met lage-voorraad alerts |
| Marketing | Sterk | Klantdata-verzameling, gepersonaliseerde aanbiedingen, loyaliteitsbeloningen |
| Online Bestellen | Sterk | Online bestelplatform geïntegreerd met POS |
| Events/Catering | Afwezig | Geen event-, offerte-, of catering-specifieke features |

**Unieke sterke punten:**

1. **All-in-one horeca POS** — Gecombineerd kassasysteem met reserveringen, online bestellen, en marketing in één platform.
2. **Snelle order-workflow** — POS geoptimaliseerd voor snelle orderinvoer met directe keuken-verbinding (foutenreductie).
3. **Google My Business integratie** — Reserveringen direct vanuit Google zoekresultaten.
4. **Klant-marketing tools** — Geïntegreerde loyaliteitsprogramma's en gepersonaliseerde aanbiedingen.

**UX-problemen (uit reviews):**

1. **Geen catering-functionaliteit** — Primair POS/restaurant-systeem. Geen event-management, offertes, of catering-workflows.
2. **Beperkte integraties** — Weinig third-party koppelingen gedocumenteerd.
3. **Beperkte informatie beschikbaar** — Weinig Engelstalige reviews of uitgebreide feature-documentatie.

**UX Scoring:**

| Dimensie | Score | Confidence | Toelichting |
|----------|-------|------------|-------------|
| Task Completion Efficiency | **4** | Laag* | POS-workflow geoptimaliseerd voor snelheid, maar niet relevant voor catering golden path |
| IA & Navigation | **4** | Laag* | Transactie-centrisch design, logisch voor POS. Beperkt verifieerbaar |
| Data Visualization | **3** | Laag* | Realtime transactie-overzicht en omzet-inzicht. Geen geavanceerde analytics gedocumenteerd |
| Onboarding & Learnability | **4** | Laag* | "Intuïtief" kassasysteem claimt lage leercurve. Marketing-claim, niet geverifieerd |
| Mobile Responsiveness | **3** | Laag* | Web-based, geen native app bevestigd. POS vermoedelijk tablet-geoptimaliseerd |
| Integration Capabilities | **3** | Medium | Website + Google My Business. Beperkt ecosysteem vergeleken met concurrenten |
| AI/Automation Features | **1** | Laag* | Geen AI-features gedocumenteerd. Automatische voorraad-alerts zijn regel-gebaseerd |
| Visual Design & Consistency | **4** | Laag* | Modern horeca-gericht design op basis van website. Beperkt verifieerbaar |

**Belangrijke kanttekening:** DISH Horeca is primair een POS/restaurant-managementsysteem, niet een catering-managementplatform. Het ondersteunt de catering golden path (Event → Offerte → Menu → Uitvoering → Facturatie) niet. Opgenomen voor vergelijking als Nederlands horeca-alternatief.

**Evidence Inventory:**
- nl.dish.co — Officiële website (NL)
- sitedish.nl — Feature-overzicht
- Beperkte review-data beschikbaar op Engelstalige platforms

---

### Profile 7: Growzer

| Veld | Waarde |
|------|--------|
| **Product** | Growzer |
| **HQ** | Antwerpen, België |
| **Doelgroep** | Middelgrote horecabedrijven (restaurants, catering) |
| **Prijsmodel** | Vanaf €100/maand, gratis versie beschikbaar, gratis proefperiode |
| **Platform** | Cloud-based SaaS met mobile-first design |
| **Mobiele app** | Ja — iOS & Android. Dashboard, bestellen, voorraad, foodcost |
| **API** | Geen native API — beperkt custom integraties |

**Feature Coverage:**

| Area | Dekking | Details |
|------|---------|---------|
| Kitchen/Menu | Sterk | Menu-engineering, gerechtenkosten, schotelprijs-berekening |
| Procurement | Zeer sterk | Bestelmanagement met realtime bevestiging, 2.000+ leveranciers |
| Business/Finance | Sterk | Dashboard met omzet/rendement, digitaal kasboek, F&B-verdeling |
| Inventory | Sterk | Voorraadbeheer, geautomatiseerde herbestelling |
| AI/Forecasting | Sterk | AI-gestuurde vraagvoorspelling |
| Multi-locatie | Sterk | HQ-dashboard voor meerdere vestigingen |
| Events/Catering | Zwak | Geen dedicated event- of offerte-management |

**Unieke sterke punten:**

1. **Foodcost-specialist** — Kernfocus op foodcost-management en schotelprijs-berekening. Snelle kostenberekening per gerecht.
2. **Leveranciersnetwerk** — 2.000+ aangesloten leveranciers voor directe bestelling vanuit het platform.
3. **AI-vraagvoorspelling** — Geautomatiseerde voorspelling van benodigde ingrediënten op basis van historische data.
4. **Benelux-focus** — Sterk in België en Nederland, lokale leveranciers-koppelingen.
5. **Laagdrempelige instap** — Gratis versie beschikbaar, vanaf €100/maand voor betaald.

**UX-problemen (uit Capterra/GetApp reviews):**

1. **Slechte zoekfunctionaliteit** — Zoekfunctie slecht gepositioneerd, geen terugknop, moeilijk om vergelijkbare items te vinden.
2. **App-instabiliteit** — Data verdwijnt bij sluiten van app, startscherm bevriest. Stabiliteit-issues gemeld.
3. **Geen native API** — Beperkt custom integraties. Alleen Lightspeed POS-koppeling.
4. **Niet catering-specifiek** — Geen event-management of offerte-workflows.

**UX Scoring:**

| Dimensie | Score | Confidence | Toelichting |
|----------|-------|------------|-------------|
| Task Completion Efficiency | **4** | Medium | Foodcost-workflows gestroomlijnd, maar navigatie-issues verminderen efficiëntie |
| IA & Navigation | **3** | Medium | Dashboard-centrisch maar slechte zoekfunctie en navigatie-problemen gemeld |
| Data Visualization | **5** | Medium | Dashboard met omzet/rendement/F&B-metrics, HQ multi-locatie overzicht |
| Onboarding & Learnability | **4** | Laag* | Gratis versie verlaagt drempel, maar onboarding-kwaliteit niet specifiek beoordeeld |
| Mobile Responsiveness | **3** | Medium | Native apps beschikbaar maar stabiliteit-issues gemeld (data-verlies, bevriezing) |
| Integration Capabilities | **3** | Hoog | Alleen Lightspeed POS, geen native API. Leveranciersnetwerk is sterk punt |
| AI/Automation Features | **4** | Medium | AI-vraagvoorspelling en geautomatiseerde herbestelling. Relevante automatisering |
| Visual Design & Consistency | **4** | Laag* | Modern design maar met usability-gaps. Beperkt verifieerbaar |

**Evidence Inventory:**
- Growzer.com — Feature pages, pricing, leveranciersnetwerk
- Capterra reviews — UX-klachten over zoekfunctie en app-stabiliteit
- GetApp reviews — Bevestiging van navigatie-problemen

---

### Profile 8: Apicbase

| Veld | Waarde |
|------|--------|
| **Product** | Apicbase |
| **HQ** | Nederland/België |
| **Doelgroep** | Multi-site restaurants, catering, hotels (SMB tot enterprise) |
| **Prijsmodel** | Vanaf ~$149-160/maand per locatie, 4 edities, kwantumkorting voor meerdere locaties |
| **Platform** | Cloud-based F&B management systeem |
| **Mobiele app** | Cloud-based responsive, iOS & Android toegang |
| **API** | Ja — Suppliers API met webhooks, POS-integraties, boekhouding |

**Feature Coverage:**

| Area | Dekking | Details |
|------|---------|---------|
| Kitchen/Menu | Zeer sterk | Gecentraliseerd receptbeheer, drag-and-drop menukaart, nauwkeurige kosten |
| Compliance | Zeer sterk | Voedselveiligheid, forward/backward traceability, allergenen op ingrediënt-niveau |
| Inventory | Zeer sterk | Realtime voorraad met AI voice input voor voorraadtelling |
| Procurement | Sterk | Leveranciers-API met webhooks, assortimentsynchronisatie |
| Business/Finance | Sterk | Kostencontrole, realtime marge-tracking, voedselverspilling-reductie |
| Production | Sterk | Productieplanning, batchproductie, bill of materials |
| Events/Catering | Basis | Productieplanning toepasbaar op catering maar geen dedicated event-workflow |

**Unieke sterke punten:**

1. **Europese F&B-leider** — Positioneert als "Europe's leading F&B management platform". Nederlandse/Belgische roots met Europese marktkennis.
2. **AI voice input** — Uniek: voorraadtelling via spraak. Relevant voor keuken/magazijn-gebruik met vuile handen.
3. **Ingredient-level traceability** — Forward en backward traceability voor voedselveiligheid. Allergenen op ingrediënt-niveau, niet alleen op gerecht-niveau.
4. **Drag-and-drop menukaart** — Intuïtieve menu-samenstelling met automatische kostenberekening.
5. **Realtime marge-tracking** — Automatische kostenupdates bij prijswijzigingen van leveranciers via webhooks.

**UX-problemen (uit reviews):**

1. **Enterprise pricing** — Kosten escaleren snel bij meerdere locaties. Minder geschikt voor solo-operators.
2. **Implementatie vereist** — Professionele implementatie nodig voor grotere setups. Niet instant plug-and-play.
3. **Catering-workflow beperkt** — Productietools zijn toepasbaar maar niet specifiek ontworpen voor event-catering flows.

**UX Scoring:**

| Dimensie | Score | Confidence | Toelichting |
|----------|-------|------------|-------------|
| Task Completion Efficiency | **5** | Medium | Recepten- en productie-workflows gestroomlijnd. Drag-and-drop menu intuïtief |
| IA & Navigation | **5** | Laag* | Recept- en kosten-centrische organisatie. Modern maar beperkt verifieerbaar |
| Data Visualization | **5** | Medium | Realtime marge-tracking, kostenrapportages, multi-site dashboards |
| Onboarding & Learnability | **3** | Medium | Professionele implementatie nodig voor enterprise. Drag-and-drop verlaagt drempel |
| Mobile Responsiveness | **4** | Laag* | Cloud-based access, AI voice input. Maar geen native app met offline-modus |
| Integration Capabilities | **6** | Hoog | Suppliers API met webhooks, POS-integraties, boekhouding, assortimentsync |
| AI/Automation Features | **5** | Medium | AI voice input, automatische kostenupdates via webhooks, marge-alerts |
| Visual Design & Consistency | **5** | Laag* | Modern, clean interface. Drag-and-drop patronen. Beperkt verifieerbaar |

**Evidence Inventory:**
- get.apicbase.com — Feature pages, pricing, API-documentatie
- G2 reviews — Overwegend positief, beperkt aantal reviews
- Apicbase blog/kennisbank — Productie-planning en traceability uitleg

### Profile 9: BBQ Architect v2 (Self-Assessment)

| Veld | Waarde |
|------|--------|
| **Product** | BBQ Architect v2 |
| **HQ** | Drenthe, Nederland |
| **Doelgroep** | Solo-pitmaster / klein cateringteam (1-3 personen) |
| **Prijsmodel** | Intern product (geen SaaS-pricing) |
| **Stack** | Next.js 16 / React 19 / Supabase / Tailwind CSS (CDN) |
| **Mobiele app** | Nee — responsive web, geen dedicated mobile views |
| **API** | Supabase REST/Realtime — geen externe API |

**Feature Coverage:**

| Area | Dekking | Modules |
|------|---------|---------|
| Kitchen/Menu | Sterk | Menu Engineering, Recepten, Gerechten (3 pagina's) |
| Operations/Events | Sterk | Agenda, Events, Event Planner, Service (4 pagina's) |
| Business/Finance | Uitgebreid | Offertes, Offerte-editor, Facturen, Klanten, Analytics, Boekhouding (6 pagina's) |
| Logistics/Procurement | Uitgebreid | Inkoop, Voorraad, Logistiek, Materieel, Uren, HACCP (6 pagina's) |
| AI/Intelligence | Zeer sterk | Pitmaster Studio (AI-chat met 20+ tools), Prijsintelligentie |

**Unieke sterke punten (uit codebase-analyse):**

1. **AI-infrastructuur** — `bbq-context.ts` laadt live Supabase-data voor 16 verschillende pagina-contexten. `AiAssistant.tsx` biedt per-pagina suggestie-chips (PAGE_CHIPS) voor alle 18 routes. De AI heeft 20+ tool-schemas voor directe database-operaties (event aanmaken, voorraad bijwerken, offerte genereren).

2. **Sync Engine** — `syncEngine.ts` automatiseert de volledige Offerte → Event → PrepTasks → Factuur pipeline. `acceptOfferte()` triggert in cascade: statusupdate, event aanmaken/bijwerken, 7 prep-taken genereren (D-3 tot D-0), en concept-factuur aanmaken.

3. **BBQ-domein specifiek** — Prep-taken zijn BBQ-specifiek ("Vlees marineren", "BBQ 2 uur voor service aansteken"). HACCP-logica kent BBQ-relevante drempels (kerntemperatuur >=75C, warmhoudtemperatuur >=60C). Menu is georganiseerd in gangen.

4. **Command Palette** — Cmd+K zoekfunctie voor snelle navigatie.

5. **Nederlands-native** — Volledige NL interface, BTW-berekening, KvK/IBAN-velden, betaaltermijnen in dagen.

**UX-problemen (uit codebase-analyse):**

1. **Navigatie-overload** — 9 sidebar-secties met 29 pagina's. Communicatie (berichten/mailbox), Website, en Hulp & Support zijn aparte secties voor waarschijnlijk minimale functionaliteit. `navigation.tsx` toont een vlakke structuur zonder prioritering.

2. **Geen onboarding** — Geen enkele onboarding-flow, tooltip-systeem, of empty-state begeleiding gevonden in de codebase. Nieuwe gebruiker ziet lege tabellen zonder uitleg.

3. **Workflow-fragmentatie** — Offertes hebben twee ingangen: `/offertes` (lijst) en `/offerte-editor` (aanmaken), plus `/event-planner` die ook offertes beheert. Gebruiker moet begrijpen wanneer welke te gebruiken.

4. **Status-inconsistentie** — Events: `pending|confirmed|completed|cancelled|optie`. Offertes: `concept|verzonden|geaccepteerd|afgewezen|akkoord|betaald|verlopen|geannuleerd|definitief|goedgekeurd` (10 statussen!). Facturen: `concept|verzonden|betaald|verlopen|vervallen|geannuleerd`.

5. **Geen integraties** — Alleen Supabase. Geen koppeling met boekhoudsoftware (Exact, Moneybird), leveranciers, kalender, of POS-systemen.

6. **MetallicCard herhaald** — Het MetallicCard-component is in minstens 3 pagina-bestanden opnieuw gedefinieerd in plaats van gedeeld vanuit `/components`.

7. **Technische schuld** — Tailwind via CDN script-tag (geen tree-shaking), jsPDF via externe CDN, `eslint-disable @typescript-eslint/no-explicit-any` in elk bestand, datums als TEXT strings, JSONB voor line-items zonder referentiele integriteit.

8. **Mobiel niet bruikbaar** — HACCP-formulier (`haccp/page.tsx`) gebruikt standaard desktop-formuliervelden. Geen mobiel-geoptimaliseerde temperatuur-invoer, geen grote touch-targets voor gebruik met handschoenen/vuile handen.

**UX Scoring (Self-Assessment):**

| Dimensie | Score | Confidence | Toelichting |
|----------|-------|------------|-------------|
| Task Completion Efficiency | **5** | Hoog | SyncEngine automatiseert de gouden weg uitstekend, maar UI fragmenteert over 5+ pagina's |
| IA & Navigation | **3** | Hoog | 9 secties / 29 pagina's is excessief voor 1-3 gebruikers. Command Palette helpt maar lost fundamenteel probleem niet op |
| Data Visualization | **3** | Hoog | Recharts bar/pie charts op dashboard en financien. Geen drill-down, geen export, geen trendanalyse |
| Onboarding & Learnability | **2** | Hoog | Volledig afwezig. Geen tooltips, geen empty states, geen documentatie, geen first-run experience |
| Mobile Responsiveness | **3** | Hoog | Basis `md:` breakpoints in Tailwind. Geen dedicated mobiele views voor veldwerk |
| Integration Capabilities | **2** | Hoog | Alleen Supabase. Geen externe API's, geen boekhouding-export, geen leverancier-koppelingen |
| AI/Automation Features | **6** | Hoog | Sterke differentiator: 16 page-contexten, 20+ tools, per-pagina chips, receipt scanning, brainstorm/QA modes |
| Visual Design & Consistency | **4** | Hoog | Consistente dark theme, MetallicCard pattern, Lucide icons. Maar geen design tokens, herhaalde componenten |

**Evidence Inventory:**
- `src/lib/navigation.tsx` — Volledige IA-structuur (9 secties, 29 pagina's)
- `src/lib/syncEngine.ts` — Offerte→Event→Prep→Factuur automatisering
- `src/lib/bbq-context.ts` — 16 pagina-context loaders voor AI
- `src/components/AiAssistant.tsx` — AI-widget met PAGE_CHIPS voor 18 routes
- `src/types/database.types.ts` — 20+ entity types met status-definities
- `src/app/page.tsx` — Dashboard met MetallicCard, KPIs, Recharts
- `src/app/haccp/page.tsx` — HACCP-formulier met getStatus() drempels

---

## 1.3 Weighted Scoring Matrix

### Raw Scores (7-punts schaal)

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
| **BBQ Architect v2** | **5** | **3** | **3** | **2** | **3** | **2** | **6** | **4** |

### Weighted Scores (score x gewicht)

| Product | TCE | IA&Nav | DataViz | Onboard | Mobile | Integ | AI | Design | **Totaal** | **Rank** |
|---------|-----|--------|---------|---------|--------|-------|----|--------|-----------|----------|
| Caterease | 1.25 | 0.60 | 0.60 | 0.45 | 0.20 | 0.50 | 0.06 | 0.04 | **3.70** | 8 |
| CaterZen | 1.50 | 1.00 | 0.60 | 0.75 | 0.40 | 0.40 | 0.06 | 0.10 | **4.81** | 1 |
| Total Party Planner | 1.25 | 1.00 | 0.60 | 0.60 | 0.50 | 0.30 | 0.03 | 0.08 | **4.36** | 4 |
| FoodNotify | 1.25 | 1.00 | 0.75 | 0.45 | 0.50 | 0.60 | 0.09 | 0.10 | **4.74** | 2 |
| Horeko (Exact) | 1.00 | 0.80 | 0.45 | 0.60 | 0.50 | 0.50 | 0.06 | 0.08 | **3.99** | 6 |
| DISH Horeca | 1.00 | 0.80 | 0.45 | 0.60 | 0.30 | 0.30 | 0.03 | 0.08 | **3.56** | 9 |
| Growzer | 1.00 | 0.60 | 0.75 | 0.60 | 0.30 | 0.30 | 0.12 | 0.08 | **3.75** | 7 |
| Apicbase | 1.25 | 1.00 | 0.75 | 0.45 | 0.40 | 0.60 | 0.15 | 0.10 | **4.70** | 3 |
| **BBQ Architect v2** | **1.25** | **0.60** | **0.45** | **0.30** | **0.30** | **0.20** | **0.18** | **0.08** | **3.36** | **10\*** |

*\*BBQ Architect v2 scoort laagste maar is een intern v0.1.0 product, niet een gevestigde SaaS.*

### Ranking Samenvatting

| Rank | Product | Score | Sterkte-profiel |
|------|---------|-------|-----------------|
| 1 | CaterZen | 4.81 | Beste UX + onboarding, sterk in sales-workflow |
| 2 | FoodNotify | 4.74 | Europese kosten-specialist, sterke integraties + mobiel |
| 3 | Apicbase | 4.70 | Recept/productie-leider, AI + integraties |
| 4 | Total Party Planner | 4.36 | Event-centrisch, sterke mobiele app |
| 5 | Horeko (Exact) | 3.99 | Nederlandse marktleider, HR/compliance sterk |
| 6 | Growzer | 3.75 | Foodcost-specialist, AI-voorspelling |
| 7 | Caterease | 3.70 | Meeste features, slechtste UX |
| 8 | DISH Horeca | 3.56 | POS-specialist, niet catering-gericht |
| 9 | BBQ Architect v2 | 3.36 | Sterkste AI, zwakste onboarding + integraties |

### Key Insight

BBQ Architect's **AI/Automation score (6)** is de hoogste van alle 9 producten — een echte differentiator. Maar de zwaktes in **Onboarding (2)** en **Integraties (2)** trekken het totaal omlaag. De strategie in Part 3 adresseert precies deze gaps.

---

## 1.4 Journey Comparison: Event -> Quote -> Menu -> Prep -> Invoice

### Stage-definitie

Het gouden pad van een catering-opdracht wordt vergeleken over 5 stages:

| Stage | Beschrijving | Key evaluatie-criteria |
|-------|-------------|----------------------|
| **1. Event Intake** | Klantvraag wordt een event-record | Stappen om aan te maken, verplichte velden, klanthergebruik, duplicatie |
| **2. Offerte Bouwen** | Menu-selectie, prijsberekening, PDF/mail naar klant | Menu-picker UX, kostenberekening transparantie, PDF-kwaliteit |
| **3. Menu & Prep Planning** | Recepten toegewezen, ingredienten berekend, prep-schema gegenereerd | Schaling automatisering, boodschappenlijst, tijdlijn-visualisatie |
| **4. Uitvoering** | Service-dag workflow, HACCP, teamcoordinatie | Mobiel bruikbaar, real-time status, temperatuurlogging snelheid |
| **5. Facturatie & Afsluiting** | Factuur generatie, betaling tracking, post-event evaluatie | Auto-generatie, betaalintegratie, reflectie/feedback |

---

### BBQ Architect v2 — Golden Path Detail

**Stage 1: Event Intake**
```
Route:    /events → "Nieuw Event" knop → formulier invullen
Stappen:  ~6 klikken (navigatie + formulier + opslaan)
Velden:   naam, datum, gasten, locatie, klant_naam, ppp, status
Klant:    Handmatige invoer of eerder ingevoerde klant (geen autocomplete in events)
Duplicatie: Niet mogelijk vanuit bestaand event
Alternatief: /event-planner biedt een meer visueel overzicht maar functioneert anders
Score:    3/7 — Werkt maar niet geoptimaliseerd. Geen klant-autocomplete, geen template.
```

**Stage 2: Offerte Bouwen**
```
Route:    /offerte-editor (apart van events — geen directe link)
Stappen:  ~10 klikken (navigatie + klantgegevens + menu selectie + berekening + opslaan)
Menu:     Selectie uit gerechten per gang (gangen-structuur)
Berekening: calcOfferteTotaal() in bbq-context.ts — gasten x ppp of line-items
            BTW per regelpost configureerbaar
            Korting en vaste kosten optioneel
PDF:      jsPDF via CDN — basic layout, geen branded template
Mail:     Niet ingebouwd — handmatig versturen
Score:    4/7 — Functioneel maar gefragmenteerd. Geen directe link vanuit event.
```

**Stage 3: Menu & Prep Planning**
```
Trigger:  acceptOfferte() in syncEngine.ts
Auto:     7 prep-taken aangemaakt (D-3 tot D-0) — BBQ-specifiek
          Concept-factuur aangemaakt met items gekopieerd uit offerte
Manueel:  Boodschappenlijst vereist AI-chat interactie of /inkoop pagina
Tijdlijn: Geen visuele tijdlijn — taken zijn tekstlijst gesorteerd op datum
Score:    5/7 — Sterke backend automatisering. Prep-taken zijn domain-specifiek en slim.
          Maar geen visuele tijdlijn en boodschappenlijst vereist extra stappen.
```

**Stage 4: Uitvoering**
```
Route:    /service (vandaag-events) + /haccp (temperatuurlogging)
Mobiel:   Niet geoptimaliseerd — desktop formulieren op beide pagina's
HACCP:    Volledige formulier: event selectie + product + temperatuur + type + notitie
          getStatus() geeft real-time feedback (groen/amber/rood)
          Maar: kleine velden, geen numpad, geen 1-tap workflow
Checklist: Prep-taken afvinken op /agenda pagina — niet op /service
Pack-lijst: /logistiek — aparte pagina, geen mobiele swipe-interface
Score:    3/7 — Functionaliteit aanwezig maar niet mobiel-geschikt.
          HACCP-logica is excellent, UI is desktop-first.
```

**Stage 5: Facturatie & Afsluiting**
```
Route:    /facturen (concept-factuur is al aangemaakt door syncEngine)
Actie:    Status wijzigen van 'concept' naar 'verzonden'
PDF:      jsPDF generatie beschikbaar
Betaling: Handmatige status-update naar 'betaald' — geen betaalintegratie
Export:   Geen export naar boekhoudsoftware
Reflectie: /events/[id]/reflectie — score, overschot/tekort, verbeterpunten, foto's
Score:    4/7 — Auto-generatie van concept is sterk (syncEngine).
          Maar geen betaalintegratie, geen export, handmatig versturen.
```

**Totale Golden Path Score BBQ Architect:**
- Stappen: ~15 klikken over 5+ pagina's
- Automatisering: Sterk in backend (syncEngine), zwak in UI-flow
- Sterkte: Prep-taken automatisch, factuur-concept automatisch
- Zwakte: Fragmentatie, geen directe links, geen mobiel

---

### Competitor Journey Analyses

#### Caterease — Golden Path

**Stage 1: Event Intake**
```
Route:    Dashboard → New Event wizard
Stappen:  ~8 klikken (navigatie door complexe menustructuur + formulier)
Klant:    CRM met klantgeschiedenis en herhalingsbestellingen
Duplicatie: Ja — events kunnen gedupliceerd worden
Score:    4/7 — Functionaliteit compleet maar complexe navigatie vertraagt intake
```

**Stage 2: Offerte Bouwen**
```
Route:    Event → Proposals/Contracts module
Stappen:  ~12 klikken (menu-selectie uit gedetailleerde recepten + berekening + PDF)
Menu:     Ingredient-level kostenberekening automatisch
Berekening: Gedetailleerde kostprijsberekening per ingredient
PDF:      Professionele templates met branding
Mail:     Directe e-mail integratie (Outlook)
Score:    5/7 — Krachtige berekeningen maar steile leercurve en rommelige UI
```

**Stage 3: Menu & Prep Planning**
```
Trigger:  Contract ondertekend
Auto:     Automatische paklijsten op basis van menu-equipment koppeling
Manueel:  Personeelsplanning handmatig + recepten raadplegen
Tijdlijn: Event layouts in 2D/3D voor ruimte-planning
Score:    5/7 — Paklijst-automatisering is sterk. 3D layout is uniek maar niche
```

**Stage 4: Uitvoering**
```
Mobiel:   Browser-only, niet touch-geoptimaliseerd
Checklist: Paklijsten raadpleegbaar maar niet mobiel-geoptimaliseerd
HACCP:    Niet ingebouwd — externe tools nodig
Score:    2/7 — Geen mobiele interface, geen HACCP. Desktop-only
```

**Stage 5: Facturatie & Afsluiting**
```
Route:    Event → Invoice generatie
Actie:    Factuur genereren vanuit contractgegevens
Betaling: Tracking van aanbetaling, restant, deposito
Export:   QuickBooks-integratie voor boekhouding
Score:    5/7 — Sterke facturatie met QuickBooks-sync. Geen directe betaalintegratie
```

**Totale Golden Path Score Caterease:** Features compleet maar UX-quality verslechtert de ervaring. Backend-kracht met frontend-schuld.

---

#### CaterZen — Golden Path

**Stage 1: Event Intake**
```
Route:    CRM → New Order/Event
Stappen:  ~5 klikken (CRM pre-fills klantdata + event aanmaken)
Klant:    Uitgebreid CRM met groeps-contacten en herhalingsbestellingen
Duplicatie: Herhalingsbestellingen vanuit klantprofiel
Score:    6/7 — CRM-driven intake, minimale handmatige invoer
```

**Stage 2: Offerte Bouwen**
```
Route:    Order → Proposal/Quote builder
Stappen:  ~7 klikken (menu-selectie + aanpassing + berekening + verzending)
Menu:     Menu-management met per-item prijzen
Berekening: Automatische totalen en belastingberekening
PDF:      Custom-branded proposals
Mail:     Directe e-mail verzending vanuit systeem
Score:    6/7 — Gestroomlijnde flow met branded output. E-signature beschikbaar
```

**Stage 3: Menu & Prep Planning**
```
Trigger:  Order bevestigd
Auto:     Keukenproductie-rapporten automatisch gegenereerd (drag-and-drop)
Manueel:  Route-planning voor bezorging
Tijdlijn: Drag-and-drop keukenproductie-ordening
Score:    5/7 — Productie-rapporten automatisch, maar geen ingredient-level prep-planning
```

**Stage 4: Uitvoering**
```
Mobiel:   Delivery Manager App voor chauffeurs (GPS, route, status)
Checklist: Order-checklist per bezorging in chauffeur-app
HACCP:    Niet ingebouwd
Score:    5/7 — Sterke bezorgingsflow. Maar gericht op delivery, niet on-site catering
```

**Stage 5: Facturatie & Afsluiting**
```
Route:    Order → Invoice
Actie:    Automatische factuur-generatie vanuit bevestigde order
Betaling: Creditcard-verwerking via Authorize.net, aging reports
Export:   QuickBooks Online sync (sales data + journal categories)
Score:    6/7 — Volledige boekhoudsuite met directe betalingverwerking
```

**Totale Golden Path Score CaterZen:** Beste end-to-end flow van alle concurrenten. Sterk CRM-gedreven, maar gericht op bezorgcatering — minder relevant voor on-site BBQ catering.

---

#### Total Party Planner — Golden Path

**Stage 1: Event Intake**
```
Route:    Calendar → New Event
Stappen:  ~5 klikken (kalender-klik + event-formulier)
Klant:    Geïntegreerde contacten met klant-portal
Duplicatie: Niet gedocumenteerd
Score:    5/7 — Kalender-centrische intake is intuïtief. Klant-portal is meerwaarde
```

**Stage 2: Offerte Bouwen**
```
Route:    Event → BEO (Banquet Event Order) generator
Stappen:  ~8 klikken (menu-selectie + BEO-generatie + verzending)
Menu:     Recepten met ChefTec kostenintegratie
Berekening: Winstanalyse (basis & gedetailleerd) per event
PDF:      BEO automatisch gegenereerd
Mail:     Klant-portal voor document-review en chat
Score:    5/7 — BEO-generatie is sterk. ChefTec-koppeling voor nauwkeurige kosten
```

**Stage 3: Menu & Prep Planning**
```
Trigger:  Event bevestigd via klant-portal of handmatig
Auto:     Beperkte automatisering gedocumenteerd
Manueel:  Recepten raadplegen, personeelsplanning
Tijdlijn: Kalender-view met event-details
Score:    3/7 — Beperkte prep-automatisering vergeleken met BBQ Architect's syncEngine
```

**Stage 4: Uitvoering**
```
Mobiel:   Native iOS/Android/iPad app — event-kalender, menu, staffing details
Checklist: Event-details mobiel raadpleegbaar
HACCP:    Niet ingebouwd
Score:    4/7 — Mobiele app is sterk punt, maar geen actieve executie-tools (HACCP, checklists)
```

**Stage 5: Facturatie & Afsluiting**
```
Route:    Event → Invoice/Payment
Actie:    Factuur-generatie met deposito/deelbetaling tracking
Betaling: Handmatige tracking, geen directe betalingverwerking
Export:   Beperkt (Prismm export)
Score:    4/7 — Basisvoorzienig. Geen boekhouding-integratie
```

**Totale Golden Path Score TPP:** Event-centrisch design is sterk in intake en planning, maar verliest kracht in prep-automatisering en facturatie.

---

#### FoodNotify — Golden Path

**Stage 1: Event Intake**
```
Route:    Events module → Nieuw event
Stappen:  ~6 klikken (event aanmaken met personeel + equipment + kosten)
Klant:    Klantbeheer beschikbaar, details beperkt gedocumenteerd
Score:    5/7 — Event-intake met personeel- en equipment-toewijzing in één stap
```

**Stage 2: Offerte Bouwen**
```
Route:    Event → Kostenberekening
Stappen:  ~8 klikken (menu-selectie + kostenberekening per gast)
Menu:     Receptbeheer met allergenen en Nutri-scores
Berekening: Per event, per gast, per maaltijd/drank — realtime
Score:    5/7 — Kosten tot op gast-niveau is zeer gedetailleerd. Maar geen offerte-PDF flow gedocumenteerd
```

**Stage 3: Menu & Prep Planning**
```
Trigger:  Event bevestigd
Auto:     Geautomatiseerde bestelvoorstellen bij leveranciers
Manueel:  Productieplanning, geen automatische prep-taken
Tijdlijn: Niet specifiek gedocumenteerd
Score:    5/7 — Leverancier-bestelling automatisch is sterk. Geen prep-taken zoals BBQ Architect
```

**Stage 4: Uitvoering**
```
Mobiel:   Native iOS/Android apps, tablet-geoptimaliseerd
Checklist: HACCP-compliance tracking ingebouwd
HACCP:    Ja — HACCP-registratie als module beschikbaar
Score:    5/7 — Sterke mobiele aanwezigheid + HACCP. Maar mobiele HACCP-UX niet specifiek beoordeeld
```

**Stage 5: Facturatie & Afsluiting**
```
Route:    Kosten → Rapportage
Actie:    Realtime KPI's en kostenrapportages
Betaling: Via boekhouding-integratie
Export:   Open API naar boekhoudsoftware
Score:    5/7 — Sterke rapportage en integratie-mogelijkheden. Minder focus op factuur-generatie zelf
```

**Totale Golden Path Score FoodNotify:** Consistent sterk over alle stages (5/7 gemiddeld). Geen uitschieters maar ook geen zwakke plekken.

---

#### Horeko (Exact) — Golden Path

**Stage 1-2: Event Intake & Offerte**
```
Score:    2/7 — Niet beschikbaar. Horeko is niet ontworpen voor event-catering
         of offerte-management. Geen event-intake of offerte-workflow.
```

**Stage 3: Menu & Prep Planning**
```
Route:    Kitchen Manager → Recepten → Productie
Stappen:  ~6 klikken (recept selecteren + schalen + productie starten)
Auto:     Houdbaarheidsberekeningen, ontdooitracking automatisch
Score:    4/7 — Receptbeheer en compliance sterk, maar niet event-gekoppeld
```

**Stage 4: Uitvoering**
```
Mobiel:   Native app voor roosters, in/uitklokken, shift-management
Checklist: HACCP-registratie met houdbaarheidslabels en verspillingslogging
HACCP:    Ja — Zeer uitgebreid. Labels, ontdooitracking, temperatuurregistratie
Score:    5/7 — HACCP en personeelsbeheer sterk. Gericht op dagelijkse restaurantoperatie
```

**Stage 5: Facturatie & Afsluiting**
```
Score:    2/7 — Geen facturatie-module. Verwijst naar Exact voor boekhouding.
         Productiviteitsanalyse beschikbaar maar geen event-specifieke financiën.
```

**Totale Golden Path Score Horeko:** Niet vergelijkbaar als catering-systeem. Excels in HACCP/compliance en personeelsbeheer, maar dekking van de catering golden path is 2/5 stages.

---

#### DISH Horeca — Golden Path

```
Score:    1/7 voor alle catering-stages — DISH Horeca is een POS/restaurant-
         managementsysteem zonder event-, offerte-, prep-, of catering-functionaliteit.

         Sterk in: realtime transacties, snelle orderverwerking, reserveringen.
         Niet relevant voor: de catering golden path.
```

**Totale Golden Path Score DISH Horeca:** Niet toepasbaar. POS-systeem zonder catering-capabilities.

---

#### Growzer — Golden Path

**Stage 1-2: Event Intake & Offerte**
```
Score:    1/7 — Niet beschikbaar. Growzer is een foodcost/inkoop-platform
         zonder event- of offerte-management.
```

**Stage 3: Menu & Prep Planning**
```
Route:    Dashboard → Menu Engineering → Ingrediënten
Stappen:  ~5 klikken (gerecht selecteren + kosten bekijken + bestelling plaatsen)
Auto:     AI-vraagvoorspelling, geautomatiseerde herbestelling bij 2.000+ leveranciers
Score:    5/7 — Sterke inkoop-automatisering en foodcost-berekening
```

**Stage 4: Uitvoering**
```
Mobiel:   Native app maar met stabiliteit-issues (data-verlies, bevriezing)
HACCP:    Niet ingebouwd
Score:    2/7 — App beschikbaar maar onbetrouwbaar. Geen veld-operatie tools
```

**Stage 5: Facturatie & Afsluiting**
```
Route:    Dashboard → Digitaal kasboek
Actie:    Kasboek-functionaliteit, omzet/rendement metrics
Export:   Beperkt (geen boekhouding-export gedocumenteerd)
Score:    3/7 — Basis financieel inzicht. Geen factuur-generatie of boekhouding-sync
```

**Totale Golden Path Score Growzer:** Sterk in Stage 3 (inkoop/foodcost) maar dekt slechts 2/5 stages van de catering golden path.

---

#### Apicbase — Golden Path

**Stage 1-2: Event Intake & Offerte**
```
Score:    2/7 — Beperkt. Apicbase heeft productieplanning die toepasbaar is op
         catering maar geen dedicated event-intake of offerte-workflow.
```

**Stage 3: Menu & Prep Planning**
```
Route:    Recepten → Menu → Productieplanning → Bill of Materials
Stappen:  ~6 klikken (drag-and-drop menu + schalen + productieplan genereren)
Auto:     Automatische bill of materials, batchproductie-schaling, leveranciers-bestelling via API
Tijdlijn: Productieplanning met consolidatie van bestellingen
Score:    6/7 — Best-in-class voor recept→productie→inkoop flow. Drag-and-drop intuïtief
```

**Stage 4: Uitvoering**
```
Mobiel:   Cloud-based access, AI voice input voor voorraadtelling
Checklist: Voedselveiligheid traceability (forward/backward)
HACCP:    Ingredient-level traceability, allergenen-management
Score:    5/7 — AI voice input is innovatief. Sterke compliance. Maar geen event-dag workflow
```

**Stage 5: Facturatie & Afsluiting**
```
Route:    Kosten → Marge-tracking → Export
Actie:    Realtime marge-tracking per gerecht/menu
Betaling: Via boekhouding-integratie (API)
Export:   Suppliers API + boekhouding-integratie
Score:    4/7 — Sterke kosten/marge-inzichten maar niet factuur-gefocust
```

**Totale Golden Path Score Apicbase:** Beste recept→productie→inkoop flow (Stage 3). Maar geen event-intake of offerte-workflow.

---

### Journey Comparison Samenvatting

| Product | Stage 1 | Stage 2 | Stage 3 | Stage 4 | Stage 5 | **Gem.** | **Dekking** |
|---------|---------|---------|---------|---------|---------|---------|-------------|
| CaterZen | 6 | 6 | 5 | 5 | 6 | **5.6** | 5/5 stages |
| Caterease | 4 | 5 | 5 | 2 | 5 | **4.2** | 5/5 stages |
| FoodNotify | 5 | 5 | 5 | 5 | 5 | **5.0** | 5/5 stages |
| Total Party Planner | 5 | 5 | 3 | 4 | 4 | **4.2** | 5/5 stages |
| BBQ Architect v2 | 3 | 4 | 5 | 3 | 4 | **3.8** | 5/5 stages |
| Apicbase | 2 | 2 | 6 | 5 | 4 | **3.8** | 3/5 stages |
| Horeko (Exact) | 2 | 2 | 4 | 5 | 2 | **3.0** | 2/5 stages |
| Growzer | 1 | 1 | 5 | 2 | 3 | **2.4** | 2/5 stages |
| DISH Horeca | 1 | 1 | 1 | 1 | 1 | **1.0** | 0/5 stages |

**Key Finding:** Slechts 4 van de 9 producten dekken de volledige catering golden path (5/5 stages). BBQ Architect v2 is een van die 4, samen met CaterZen, Caterease, en FoodNotify. Dit is een fundamenteel concurrentievoordeel ten opzichte van Apicbase, Horeko, Growzer, en DISH Horeca.

---

## 1.5 Radar Chart Data

```json
{
  "dimensions": [
    { "key": "tce", "label": "Task Completion", "fullMark": 7 },
    { "key": "ia", "label": "IA & Navigation", "fullMark": 7 },
    { "key": "dataviz", "label": "Data Visualization", "fullMark": 7 },
    { "key": "onboard", "label": "Onboarding", "fullMark": 7 },
    { "key": "mobile", "label": "Mobile", "fullMark": 7 },
    { "key": "integ", "label": "Integrations", "fullMark": 7 },
    { "key": "ai", "label": "AI/Automation", "fullMark": 7 },
    { "key": "design", "label": "Visual Design", "fullMark": 7 }
  ],
  "data": [
    {
      "subject": "Task Completion",
      "BBQ Architect v2": 5,
      "CaterZen": 6,
      "FoodNotify": 5,
      "Apicbase": 5,
      "Caterease": 5,
      "Total Party Planner": 5,
      "Horeko": 4,
      "Growzer": 4,
      "DISH Horeca": 4
    },
    {
      "subject": "IA & Navigation",
      "BBQ Architect v2": 3,
      "CaterZen": 5,
      "FoodNotify": 5,
      "Apicbase": 5,
      "Caterease": 3,
      "Total Party Planner": 5,
      "Horeko": 4,
      "Growzer": 3,
      "DISH Horeca": 4
    },
    {
      "subject": "Data Visualization",
      "BBQ Architect v2": 3,
      "CaterZen": 4,
      "FoodNotify": 5,
      "Apicbase": 5,
      "Caterease": 4,
      "Total Party Planner": 4,
      "Horeko": 3,
      "Growzer": 5,
      "DISH Horeca": 3
    },
    {
      "subject": "Onboarding",
      "BBQ Architect v2": 2,
      "CaterZen": 5,
      "FoodNotify": 3,
      "Apicbase": 3,
      "Caterease": 3,
      "Total Party Planner": 4,
      "Horeko": 4,
      "Growzer": 4,
      "DISH Horeca": 4
    },
    {
      "subject": "Mobile",
      "BBQ Architect v2": 3,
      "CaterZen": 4,
      "FoodNotify": 5,
      "Apicbase": 4,
      "Caterease": 2,
      "Total Party Planner": 5,
      "Horeko": 5,
      "Growzer": 3,
      "DISH Horeca": 3
    },
    {
      "subject": "Integrations",
      "BBQ Architect v2": 2,
      "CaterZen": 4,
      "FoodNotify": 6,
      "Apicbase": 6,
      "Caterease": 5,
      "Total Party Planner": 3,
      "Horeko": 5,
      "Growzer": 3,
      "DISH Horeca": 3
    },
    {
      "subject": "AI/Automation",
      "BBQ Architect v2": 6,
      "CaterZen": 2,
      "FoodNotify": 3,
      "Apicbase": 5,
      "Caterease": 2,
      "Total Party Planner": 1,
      "Horeko": 2,
      "Growzer": 4,
      "DISH Horeca": 1
    },
    {
      "subject": "Visual Design",
      "BBQ Architect v2": 4,
      "CaterZen": 5,
      "FoodNotify": 5,
      "Apicbase": 5,
      "Caterease": 2,
      "Total Party Planner": 4,
      "Horeko": 4,
      "Growzer": 4,
      "DISH Horeca": 4
    }
  ]
}
```

### Recharts Component Voorbeeld

```tsx
import { RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, Legend, ResponsiveContainer } from 'recharts';

// Top 4 + BBQ Architect voor leesbaarheid
const COLORS = {
  'BBQ Architect v2': '#c4a35a',  // goud — eigen product
  'CaterZen': '#4ade80',          // groen — #1 concurrent
  'FoodNotify': '#60a5fa',        // blauw — #2 concurrent
  'Apicbase': '#f472b6',          // roze — #3 concurrent
  'Caterease': '#94a3b8',         // grijs — feature-leider maar slechte UX
};
```

---

## 1.6 Gap Analysis & Unique Strengths

### Waar BBQ Architect v2 leidt

| Dimensie | BBQ Architect Score | Marktgemiddelde | Voorsprong | Toelichting |
|----------|-------------------|-----------------|------------|-------------|
| **AI/Automation** | **6** | 2.5 | **+3.5** | Grootste differentiator. 16 pagina-contexten, 20+ tools, per-pagina suggesties. Geen concurrent heeft dit niveau van AI-integratie in catering software |
| **BBQ-domein specificiteit** | N/A | N/A | **Uniek** | Prep-taken zijn BBQ-specifiek ("Vlees marineren", "BBQ aansteken"). HACCP-drempels zijn BBQ-relevant. Geen concurrent richt zich op BBQ-catering |
| **Backend-automatisering** | N/A | N/A | **Sterk** | `syncEngine.ts` cascade (offerte→event→7 prep-taken→factuur) in 1 functie. Alleen CaterZen benadert dit niveau |
| **Volledige golden path dekking** | 5/5 stages | 3.3/5 | **+1.7** | Slechts 3 concurrenten (CaterZen, Caterease, FoodNotify) dekken ook alle 5 stages |

### Waar BBQ Architect v2 achterloopt

| Dimensie | BBQ Architect Score | Marktgemiddelde | Achterstand | Kritisch? | Adressering in strategie |
|----------|-------------------|-----------------|-------------|-----------|-------------------------|
| **Onboarding** | **2** | 3.8 | **-1.8** | Ja | Pijler 4 (QW-1 empty states, CI-4 onboarding flow) |
| **Integraties** | **2** | 4.3 | **-2.3** | Ja | Pijler 5 (SC-1 boekhouding export, SC-3 kalender sync) |
| **IA & Navigation** | **3** | 4.3 | **-1.3** | Ja | Pijler 4 (QW-2 sidebar collapse, CI-6 navigatie redesign) |
| **Data Visualization** | **3** | 4.3 | **-1.3** | Medium | Pijler 1 (SC-6 advanced analytics) |
| **Mobile** | **3** | 3.8 | **-0.8** | Medium | Pijler 2 (QW-4 HACCP mobile, CI-2 mobile service mode) |

### Onbezette Marktposities

| Positie | Waarom onbezet | BBQ Architect kans | Effort |
|---------|---------------|--------------------|----|
| **AI-first catering management** | Geen concurrent heeft AI dieper dan basis-automatisering. Apicbase heeft voice input maar geen context-aware AI | BBQ Architect is al hier. Verstevig met proactieve AI (CI-3) | Laag — bouw voort op bestaande infra |
| **Nederlandse BBQ-niche** | Geen concurrent richt zich op BBQ-catering in NL. Horeko/DISH zijn restaurant-gericht | Volledig onbezet. BBQ-specifieke prep, recepten, HACCP | Geen — is al de positie |
| **Solo-pitmaster ERP** | Caterease/FoodNotify richten zich op teams/enterprise. CaterZen op bezorgcatering | Klein team (1-3) met lage-drempel ERP. Geen concurrent hier | Laag — simplificeer navigatie |
| **Mobiele HACCP voor catering** | Horeko heeft HACCP maar voor restaurants. Geen concurrent heeft mobiel-geoptimaliseerde HACCP voor catering | QW-4 (HACCP Quick-Log) lost dit direct op | Medium — QW-4 |
| **Offerte-naar-factuur in 1 flow** | CaterZen komt dichtbij maar over meerdere modules. Geen wizard-stijl flow | CI-1 (Event Wizard) zou uniek zijn in de markt | Hoog — CI-1 |

### Opportunity Map per Dimensie

**1. Task Completion Efficiency (25%)**
- *Gap:* BBQ Architect (5) vs. CaterZen (6). Verschil zit in UI-fragmentatie, niet in backend.
- *Opportunity:* Event Wizard (CI-1) zou score naar 6 kunnen brengen. "Maak Offerte" vanuit event (QW-3) is quick win.
- *Prioriteit:* **Hoog** — grootste gewicht in de matrix.

**2. Information Architecture (20%)**
- *Gap:* BBQ Architect (3) vs. marktgemiddelde (4.3). 29 pagina's in 9 secties is excessief.
- *Opportunity:* Sidebar collapse (QW-2) en navigatie redesign (CI-6) kunnen score naar 4-5 brengen.
- *Prioriteit:* **Hoog** — fundamenteel voor dagelijks gebruik.

**3. Data Visualization (15%)**
- *Gap:* BBQ Architect (3) vs. marktgemiddelde (4.3). Basis Recharts zonder drill-down.
- *Opportunity:* Geavanceerd analytics dashboard (SC-6) zou 5+ opleveren, maar is Phase 3.
- *Prioriteit:* **Medium** — dashboard kalenderstrip (QW-7) is quick win.

**4. Onboarding (15%)**
- *Gap:* BBQ Architect (2) vs. marktgemiddelde (3.8). Volledig afwezig.
- *Opportunity:* Empty states (QW-1) + onboarding flow (CI-4) zou score naar 4-5 brengen.
- *Prioriteit:* **Hoog** — laagst scorende dimensie na integraties.

**5. Mobile (10%)**
- *Gap:* BBQ Architect (3) vs. marktgemiddelde (3.8). Basis responsive, geen mobiele views.
- *Opportunity:* HACCP Quick-Log (QW-4) + Mobile Service Mode (CI-2) zou score naar 5 brengen.
- *Prioriteit:* **Hoog** — HACCP is wettelijke verplichting.

**6. Integrations (10%)**
- *Gap:* BBQ Architect (2) vs. marktgemiddelde (4.3). Grootste absolute achterstand.
- *Opportunity:* UBL-export (SC-1) + iCal (SC-3) zou score naar 4 brengen. Full API (SC-2) naar 5.
- *Prioriteit:* **Hoog** maar Phase 3 — start met export (laagste drempel).

**7. AI/Automation (3%)**
- *Positie:* BBQ Architect (6) vs. marktgemiddelde (2.5). **Marktleider.** Verstevig.
- *Opportunity:* Proactieve AI (CI-3) zou score naar 7 kunnen brengen — exemplarisch.
- *Prioriteit:* **Medium** — verstevig differentiator, maar laag gewicht.

**8. Visual Design (2%)**
- *Gap:* BBQ Architect (4) vs. marktgemiddelde (4.1). Op marktgemiddelde.
- *Opportunity:* Gedeeld MetallicCard component (QW-6) + design tokens zou score naar 5 brengen.
- *Prioriteit:* **Laag** — hygienefactor, geen differentiator.

---

# Part 2: Problem Framing

## 2.1 Evidence-Based Problem Discovery

Vijf categorien van UX-problemen, elk onderbouwd met codebase-evidence:

### Categorie 1: Navigatie & Informatie-Architectuur

**Probleem:** 9 sidebar-secties met 29 pagina's creeren cognitieve overbelasting voor wat een 1-3 persoons operatie is.

| Evidence | Bron |
|----------|------|
| 9 top-level secties in sidebar | `navigation.tsx` regel 27-138 |
| Secties met twijfelachtige waarde: Communicatie (2 pagina's), Website (1 pagina), Hulp & Support (2 pagina's) | `navigation.tsx` regel 106-138 |
| Dubbele paden: `/offertes` (lijst) vs `/offerte-editor` (aanmaken) vs `/event-planner` (ook offerte-management) | `navigation.tsx` regel 59-61, 48-49 |
| Breadcrumbs component biedt alleen vlakke sectie-context, geen diepe hierarchie | Geen breadcrumb-component in `/components` |
| Command Palette bestaat maar is basaal | Cmd+K functionaliteit in `CommandPalette.tsx` |

**Impact:** Gebruiker moet mentaal model opbouwen van 29 pagina's om te weten waar een taak begint. Gemiddeld 3-4 keer navigeren voor een eenvoudige workflow.

### Categorie 2: Workflow-Fragmentatie

**Probleem:** Het gouden pad (Event → Offerte → Prep → Service → Factuur) raakt 5+ pagina's ondanks dat de backend-automatisering dit elegant afhandelt.

| Evidence | Bron |
|----------|------|
| `acceptOfferte()` cascadeert in 1 functie-aanroep: offerte-status → event → 7 prep-taken → concept-factuur | `syncEngine.ts` regel 121-136 |
| Maar de UI vereist: `/events` → `/offerte-editor` → `/offertes` (accepteren) → `/service` → `/facturen` | Pagina-routes in `navigation.tsx` |
| Event en Offerte zijn los gekoppeld: `event.offerte_id` is optioneel, `offerte.event_id` is optioneel | `database.types.ts` regel 84, 111 |
| Menu-selectie tijdens offerte-aanmaak haalt uit `gerechten`, maar recept-details vereisen navigatie naar `/recepten` | Cross-module data dependencies |

**Impact:** De backend is elegant, de frontend niet. Gebruiker navigeert handmatig wat de sync engine automatisch doet.

### Categorie 3: Ontbrekende Gebruikersbegeleiding

**Probleem:** Nul onboarding, nul empty-state begeleiding, nul contextual help.

| Evidence | Bron |
|----------|------|
| Geen onboarding-flow of setup-wizard in enig bestand | Codebase-brede zoekactie |
| Geen tooltip-component of contextual help-systeem | Geen tooltip imports in enig pagina-bestand |
| Geen empty-state afhandeling — lege tabellen tonen blanco gebieden | `haccp/page.tsx`, `events/page.tsx` |
| Rol hardcoded naar `'planner'` — geen echt authenticatie/rollen-systeem | Hardcoded userRole in event-planner |
| AI-assistent is enige vorm van "help" maar vereist dat gebruiker weet wat te vragen | `AiAssistant.tsx` PAGE_CHIPS als impliciete begeleiding |

**Impact:** Nieuwe gebruiker of infrequente gebruiker is volledig verloren. Time-to-value is onbekend maar vermoedelijk hoog.

### Categorie 4: Mobiele Kloof

**Probleem:** Veldoperaties (HACCP, service, logistiek) hebben mobile-first design nodig maar zijn desktop-georienteerde formulieren.

| Evidence | Bron |
|----------|------|
| HACCP-formulier gebruikt standaard `<select>` en tekst-input voor temperatuur | `haccp/page.tsx` regel 38-42 |
| Geen numpad-optimalisatie voor temperatuur-invoer (BBQ-context: vaak met handschoenen) | HACCP form fields |
| Basis `md:` responsive breakpoints in Tailwind, geen dedicated mobiele views | Dashboard `page.tsx` CSS classes |
| Service-pagina toont vandaag-events maar zonder mobiel-geoptimaliseerde interface | `/service` route |
| Logistiek pack-lijsten zijn checkboxes in desktop-layout | Pack-list data model |

**Impact:** HACCP-registratie op locatie — een wettelijke verplichting — is niet praktisch uitvoerbaar op een telefoon.

### Categorie 5: Integratie-Isolatie

**Probleem:** Geen koppelingen met externe systemen die een Nederlandse catering-onderneming dagelijks gebruikt.

| Evidence | Bron |
|----------|------|
| Alleen Supabase als data-bron | `supabase.ts` is enige database client |
| PDF-generatie via externe CDN script tags — geen build-integratie | jsPDF CDN laden |
| Geen boekhouding-export (Exact Online, Moneybird, UBL-formaat) | Geen export-functionaliteit gevonden |
| Geen leverancier-catalogus integratie (Sligro, Hanos, Makro) | Leveranciers-tabel is handmatige invoer |
| Geen kalender-sync (Google Calendar, Outlook) | Events bestaan alleen in Supabase |
| Geen POS-integratie | Geen POS-gerelateerde code |

**Impact:** Dubbele invoer in boekhouding, handmatige inkoop-orders, geen agenda-synchronisatie met klanten.

---

## 2.2 Problem Statement

### Primaire Problem Statement

**VOOR** Cor en het Hop & Bites operatieteam (1-3 personen die end-to-end BBQ catering managen)

**DIE** de volledige levenscyclus moeten beheren van klantvraag tot post-event evaluatie, vaak fysiek op een eventlocatie

**IS** BBQ Architect v2 een krachtige backend met een fragmentarische frontend

**OMDAT** de UI 29 pagina's over 9 secties verspreidt wat de sync engine in een enkele functie-aanroep afhandelt, er geen begeleiding is voor nieuwe of infrequente gebruikers, veldwerk op mobiel niet praktisch is, en er geen verbinding is met de externe tools die het bedrijf dagelijks gebruikt.

### How Might We (HMW) Vragen

1. **HMW** de kracht van de sync engine zichtbaar maken in de UI, zodat het gouden pad even vloeiend aanvoelt als de backend het afhandelt?
2. **HMW** HACCP-registratie zo snel en eenvoudig maken dat het met een hand en vuile handschoenen op een telefoon kan?
3. **HMW** de AI-assistent transformeren van een reactief chatvenster naar een proactieve co-piloot die relevante informatie toont voordat de gebruiker erom vraagt?
4. **HMW** een nieuw teamlid productief maken zonder externe documentatie of training?
5. **HMW** BBQ Architect verbinden met het bestaande Nederlands horeca-ecosysteem (boekhouding, leveranciers, agenda)?

---

## 2.3 Constraints & Design Criteria

### Hard Constraints

| Constraint | Reden | Impact op oplossingen |
|-----------|-------|----------------------|
| Klein team (1-2 ontwikkelaars) | Beperkte development-capaciteit | Alles moet incrementeel implementeerbaar zijn |
| Next.js / Supabase stack | Bestaande investering, geen migratie | Oplossingen moeten binnen dit framework passen |
| Dark theme visuele identiteit | Brand identity Hop & Bites | Nieuwe componenten moeten het MetallicCard-patroon respecteren |
| Nederlands BBQ-niche | Beperkt budget, duidelijke ROI nodig | Elke verbetering moet meetbare waarde leveren |
| Bestaand datamodel | Schema-migraties moeten backward-compatible zijn | Geen breaking changes aan bestaande tabellen |
| AI-first filosofie | Strategische differentiator | AI-integratie versterken, niet vervangen door traditionele UI |

### Design Criteria (voor het evalueren van oplossingen)

| Criterium | Meetbaar doel |
|-----------|--------------|
| Golden-path klikken reduceren | Van ~15 klikken / 5 pagina's naar <8 klikken / max 2 paginatransities |
| Nieuwe gebruiker eerste taak | 80%+ first-attempt success rate zonder externe documentatie |
| HACCP mobiele registratie | <30 seconden per temperatuur-entry op mobiel |
| AI-interactierate | 30%+ van sessies gebruikt AI-suggesties |
| Wekelijks actief gebruik | 5+ sessies per week |

---

## 2.4 User Needs vs. Current State Matrix

| # | Gebruikersbehoefte | Prioriteit | Huidige staat | Gap Ernst (1-5) |
|---|-------------------|------------|---------------|-----------------|
| 1 | Event end-to-end plannen zonder context-switching | Kritiek | 3-5 pagina-navigaties vereist ondanks backend-automatisering | **4** |
| 2 | Week-overzicht met kalender-context | Hoog | KPI-dashboard bestaat maar geen kalender/timeline view | **3** |
| 3 | HACCP-temperaturen snel loggen op locatie met een hand | Hoog | Volledig desktop-formulier, geen mobiele optimalisatie | **4** |
| 4 | Weten welke offertes vandaag follow-up nodig hebben | Hoog | Status-filtering bestaat maar geen proactieve alerts | **3** |
| 5 | Winstmarges per event in context begrijpen | Medium | Financien-pagina heeft berekeningen maar niet per-event gesurface | **3** |
| 6 | Boodschappenlijsten automatisch genereren uit geplande menu's | Medium | AI-tools kunnen dit maar vereist chat-interactie | **2** |
| 7 | Direct bij leveranciers bestellen | Medium | Handmatig proces via inkooplijsten, geen leverancier-koppeling | **4** |
| 8 | Nieuw teamlid snel productief maken | Laag (nu) | Geen onboarding, hardcoded rol, geen documentatie | **5** |
| 9 | Facturen exporteren naar boekhoudsoftware | Hoog | Geen export-functionaliteit | **5** |
| 10 | Agenda synchroniseren met Google Calendar | Medium | Events bestaan alleen in Supabase | **4** |

**Prioriteitsberekening:** Ernst x Frequentie van behoefte. Items met gap 4-5 en prioriteit Hoog/Kritiek zijn eerste kandidaten.

---

## 2.5 Success Metrics & KPIs

| Metric | Huidige Baseline | Target | Meetmethode |
|--------|-----------------|--------|-------------|
| **Golden-path stappen** (event tot factuur) | ~15 klikken, 5 pagina's | <8 klikken, max 2 paginatransities | Task-analyse recording |
| **Tijd om offerte te maken** | ~5-8 min (geschat) | <3 minuten | Getimede gebruikerssessie |
| **HACCP temperatuurlog (mobiel)** | Niet haalbaar op mobiel | <30 sec per entry | Mobiele task timing |
| **Nieuwe gebruiker eerste taak** | Geen begeleiding = hoog faalpercentage | 80%+ first-attempt success | Onboarding funnel tracking |
| **AI-assistent interactierate** | Onbekend (geen tracking) | 30%+ van sessies | Chat API call logging in Supabase |
| **Wekelijks actief gebruik** | Onbekend | 5+ sessies/week | Supabase session analytics |
| **Pagina's bezocht per sessie** | Onbekend (vermoedelijk hoog door fragmentatie) | Dalend na workflow-consolidatie | Navigatie-event tracking |
| **Offerte-naar-event conversie snelheid** | Handmatig accepteren + navigeren | 1-klik acceptatie met automatische cascade | SyncEngine call logging |
| **Factuur-export frequentie** | 0 (niet mogelijk) | 100% van facturen exporteerbaar | Export-functie usage tracking |
| **Mobiele sessie-percentage** | Onbekend (vermoedelijk <10%) | 30%+ voor veldwerk-pagina's | User-agent tracking |

---

# Part 3: UX Strategy

## 3.1 Strategic Pillars

### Pijler 1: "Een stroom, niet twintig schermen"

**Kern:** Consolideer de gouden-pad workflow in begeleide, multi-stap flows binnen minder pagina-contexten. De `syncEngine.ts` handelt de backend-cascade prachtig af — de UI moet deze elegantie weerspiegelen.

**Rationale:** De sync engine doet in 1 functie-aanroep wat de gebruiker nu over 5 pagina's moet navigeren. Een Event Wizard die de hele flow van klantgegevens tot verzonden offerte binnen een pagina afhandelt, elimineert het navigatie-probleem bij de bron.

**Implementatie-richtingen:**
- Event Wizard: multi-stap flow (Klant → Menu → Datum/Logistiek → Offerte Preview → Verzenden)
- "Maak Offerte" knop direct op Event-kaarten
- Dashboard kalenderstrip voor week-overzicht
- Offerte-acceptatie met 1-klik cascade (UI die `acceptOfferte()` direct triggert)

### Pijler 2: "Mobiel waar het telt"

**Kern:** Niet de hele app — alleen de 3-4 workflows die in het veld plaatsvinden: HACCP-temperatuurlogging, service-dag checklists, logistiek pack-lijsten, en urenregistratie.

**Rationale:** HACCP-registratie is een wettelijke verplichting die op locatie moet plaatsvinden. De huidige desktop-formulieren zijn niet bruikbaar op een telefoon, laat staan met BBQ-handschoenen. Een numpad-stijl temperatuurinvoer met grote touch-targets en 1-tap opslaan lost het meest urgente mobiele probleem op.

**Implementatie-richtingen:**
- HACCP Quick-Log: groot product-selectie, numpad temperatuur, 1-tap save
- Service Mode: vandaag-events met prep-checklist en temperatuur-logging
- Logistiek Pack-lijst: swipe-to-check interface
- Touch targets minimaal 48px, essentiele info boven de fold

### Pijler 3: "De AI als co-piloot, niet alleen chat"

**Kern:** De AI-infrastructuur (`bbq-context.ts` met 16 pagina-contexten, `bbq-tools.ts` met 20+ tools, per-pagina suggestie-chips) is de sterkste differentiator van de applicatie. Evolueer van reactieve chat naar proactieve inline suggesties.

**Rationale:** De AI weet al wat er op elke pagina relevant is — dat is precies wat `loadPageContext()` doet. Maar deze kennis zit opgesloten in het chatvenster. Proactieve nudges (badge: "3 items onder par", toast: "Offerte vervalt morgen", dashboard-kaart: "Prep start vandaag voor weekend") verplaatsen AI-intelligentie naar waar de gebruiker al kijkt.

**Implementatie-richtingen:**
- Inline waarschuwings-badges op sidebar-items
- Proactieve toasts gebaseerd op pagina-context data
- Smart pre-fills in formulieren (AI-voorgestelde waarden)
- Dashboard-sectie "AI Aanbevelingen" met actie-knoppen

### Pijler 4: "Progressieve onthulling, niet feature dump"

**Kern:** Adresseer navigatie-overload met: vereenvoudigde standaard sidebar (5 kernregistraties, verplaats Systeem/Communicatie/Website naar secundair), empty-state begeleiding op elke pagina, contextual tooltips, en inklapbare complexiteit.

**Rationale:** Een pitmaster die 3 events per week doet heeft geen 29 pagina's nodig in zijn gezichtsveld. Door de sidebar te reduceren van 9 naar 5 primaire secties en empty states te voorzien van begeleiding + AI-suggestie-chips, wordt elke pagina een startpunt in plaats van een doodlopend eind.

**Implementatie-richtingen:**
- Sidebar reduceren: De Keuken, Operatie, De Zaak, Beheer & Logistiek, Digital Pitmaster (primair). Systeem → settings-icon. Communicatie/Website → sub-sectie of settings.
- Empty State component: illustratie + uitleg + primaire actie-knop + AI-chip
- First-run setup wizard: bedrijfsgegevens, eerste gerecht, eerste event
- Contextual tooltips bij eerste bezoek aan elke pagina

### Pijler 5: "Verbinden, niet isoleren"

**Kern:** Bouw integratie-gereedheid: begin met exportkwaliteit (goede PDF-generatie, CSV/UBL-export voor Nederlandse boekhouding), dan richting API-integraties (Exact Online, Moneybird, leverancier-catalogi, Google Calendar).

**Rationale:** Een Nederlandse cateraar gebruikt Exact Online of Moneybird voor boekhouding, Google Calendar voor planning, en bestelt bij Sligro/Hanos. Zonder deze koppelingen is dubbele invoer onvermijdelijk. Begin met export (laagste technische drempel) voordat je aan live-integraties begint.

**Implementatie-richtingen:**
- Factuur-export naar UBL 2.0 (Nederlandse standaard voor e-facturatie)
- CSV-export voor boekhouding-import
- iCal-feed voor kalender-synchronisatie
- Leverancier-bestelformulier met e-mail verzending

---

## 3.2 Design Principles

Zeven gerankte principes die elke design-beslissing begeleiden. **Gerangschikt op gewogen benchmark-impact** — bij conflicten wint het hoger gerankte principe. Elk principe is gekoppeld aan de specifieke dimensies die BBQ Architect van #9 (3.36) naar #1 (>5.00) brengen.

### Doelscore: van 3.36 naar 5.76

| Dimensie | Huidig | Doel | Principe dat dit drijft |
|----------|--------|------|------------------------|
| Task Completion (25%) | 5 | **7** | #1 Nul Navigatie |
| IA & Navigation (20%) | 3 | **6** | #1 Nul Navigatie |
| Data Visualization (15%) | 3 | **5** | #6 Dashboard = Antwoord |
| Onboarding (15%) | 2 | **5** | #4 Lege Pagina = Leraar |
| Mobile (10%) | 3 | **5** | #3 Eén Hand, Vuile Handschoenen |
| Integrations (10%) | 2 | **5** | #5 Export Eerst |
| AI/Automation (3%) | 6 | **7** | #2 AI Toont, Jij Bevestigt |
| Visual Design (2%) | 4 | **5** | #7 Cor's BBQ, Cor's Taal |
| **Gewogen totaal** | **3.36** | **5.76** | |

---

### #1. "Nul Navigatie" *(Rank 1 — drijft 45% van de score)*

**Statement:** Het gouden pad — van klantvraag tot betaalde factuur — verloopt zonder paginatransities. Elke workflow begint en eindigt waar de gebruiker al is.

**Rationale:** BBQ Architect scoort 5/7 op Task Completion en 3/7 op IA & Navigation. Samen wegen deze dimensies 45% van de totaalscore. De `syncEngine.ts` handelt de offerte→event→prep→factuur cascade in 1 functie-aanroep af, maar de UI verspreidt dit over 5+ pagina's en ~15 klikken. CaterZen (score 6/7) bewijst dat een gestroomlijnde flow mogelijk is — maar zelfs zij gebruiken meerdere pagina's. **Nul navigatie** betekent dat we niet matchen maar leapfroggen: wizards, slide-over panels, en inline expansie in plaats van `router.push()`.

**Voorbeeld — Toepassen:**
Cor klikt op een event in zijn dashboard kalenderstrip. Een slide-over panel opent met de Event Wizard: Klant (pre-filled) → Menu (selectie uit gerechten) → Details → Offerte Preview → "Verzend & Bevestig". De `acceptOfferte()` cascade triggert. Cor heeft het gouden pad afgelegd zonder het dashboard te verlaten.

**Voorbeeld — Schending:**
Een "Maak Offerte" knop die `router.push('/offerte-editor?client=...')` aanroept. De gebruiker verlaat zijn context, verliest overzicht, en moet terug navigeren. Zelfs met pre-filled parameters is dit een navigatie-breuk.

**Trade-off:** Slide-over panels en wizards verhogen component-complexiteit en vereisen zorgvuldig state management. Pagina's worden "dikker" met meer functionaliteit. **Dit is acceptabel** omdat de alternatieve kosten — context-verlies, navigatie-overhead, workflow-fragmentatie — zwaarder wegen voor een 1-3 persoons team dat snelheid nodig heeft.

**Testbaar criterium:**
- Golden path (event→factuur): **<5 klikken, 0 paginatransities**
- Elke top-3 workflow meetbaar via klik-tellingen in Supabase event logging
- Benchmark target: TCE van 5→7, IA&Nav van 3→6

**Wie dit verslaat:** CaterZen (TCE 6) gebruikt meerdere pagina's maar met goede flow. Caterease (TCE 5) heeft de features maar rommelige navigatie. **Geen concurrent biedt 0-navigatie workflows.** Dit is de positie die we claimen.

---

### #2. "AI Toont, Jij Bevestigt" *(Rank 2 — versterkt alle dimensies)*

**Statement:** De AI vult in, voorspelt, en surfacet. De gebruiker bevestigt of overschrijft. Elk leeg veld dat de AI had kunnen invullen is een ontwerpfout.

**Rationale:** BBQ Architect's AI-score (6/7) is al de hoogste in de markt — 3.5 punten boven het gemiddelde. Maar deze kracht zit opgesloten in het chatvenster. Door AI te verplaatsen van reactief (chat) naar proactief (inline pre-fills, badges, suggesties), versterkt het **elke andere dimensie**: snellere task completion (pre-fills), betere onboarding (AI begeleidt), slimmere dashboards (AI-inzichten). Het verschil tussen score 6 en 7 is het verschil tussen "AI is beschikbaar" en "AI is onzichtbaar geïntegreerd".

**Voorbeeld — Toepassen:**
Cor opent de Event Wizard. Het klantveld toont: "J. de Vries — 3x eerder, laatst 80 gasten, gemiddeld €42 p.p." met 1-klik selectie. Het menuaantal pre-filled op basis van historie. De marge-indicator kleurt automatisch groen/amber/rood. Cor klikt "Bevestig" — 4 velden waren al ingevuld door de AI.

**Voorbeeld — Schending:**
Een formulier dat `betaaltermijn` als leeg veld toont terwijl `syncEngine.ts` al weet dat de default 14 dagen is. Of een offerte-editor zonder marge-indicatie terwijl `calcOfferteTotaal()` de data heeft.

**Trade-off:** AI-suggesties kunnen fout zijn en vertrouwen schaden als ze niet transparant zijn. **Regel:** Elk AI-voorstel toont zijn bron ("op basis van 3 eerdere events") en is met 1 klik te overschrijven. Nooit auto-submitten — altijd menselijke bevestiging.

**Testbaar criterium:**
- 60%+ van formuliervelden pre-filled door AI bij terugkerende klanten
- AI-suggestie acceptatie-ratio: >75% (als <50%: suggesties zijn te onnauwkeurig)
- Benchmark target: AI van 6→7 (exemplarisch)

**Wie dit verslaat:** Apicbase (AI 5) heeft voice input maar geen context-aware pre-fills. Growzer (AI 4) heeft vraagvoorspelling maar niet per-formulier. **Geen concurrent integreert AI in de workflow zelf** — ze bieden het als aparte feature aan.

---

### #3. "Eén Hand, Vuile Handschoenen" *(Rank 3 — drijft 10% + wettelijke verplichting)*

**Statement:** Elke functie die op een eventlocatie wordt gebruikt, werkt met één hand op een telefoon in direct zonlicht, met BBQ-handschoenen aan. Touch targets minimaal 56px. Kritieke info boven de fold. Geen precisie-interacties.

**Rationale:** HACCP-registratie is een **wettelijke verplichting** die op locatie moet plaatsvinden — dit is niet optioneel. De huidige desktop-formulieren (standaard `<select>`, tekstvelden voor temperatuur) zijn niet bruikbaar op een telefoon, laat staan met handschoenen. Horeko (Mobile 5) bewijst dat mobiel kan voor hospitality, maar hun focus is roostering, niet veld-HACCP. FoodNotify (Mobile 5) heeft native apps maar geen gepubliceerde mobiele HACCP-UX.

**Voorbeeld — Toepassen:**
HACCP Quick-Log: groot product-grid (4 kolommen, 56px knoppen) → numpad-stijl temperatuurinvoer (grote cijfers, geen decimale punt — alleen gehele graden) → `getStatus()` kleurt direct groen/amber/rood → 1-tap "Registreer" (full-width, 64px hoog). Totale flow: <15 seconden met handschoenen.

**Voorbeeld — Schending:**
Een `<select>` dropdown voor product-selectie op mobiel. Of een tekstveld voor temperatuur dat het toetsenbord opent in plaats van een numpad. Of informatie die onder de fold zit en scrollen vereist.

**Trade-off:** Mobile-first design voor 3-4 pagina's (HACCP, Service, Logistiek, Uren) betekent **twee layouts onderhouden**: desktop voor planning, mobiel voor uitvoering. **Dit is acceptabel** omdat het slechts 4 van 29 pagina's betreft en de use cases fundamenteel anders zijn (bureau vs. veld).

**Testbaar criterium:**
- HACCP temperatuurlog: **<15 seconden per entry op mobiel**
- Touch target audit: 0 interactieve elementen <56px op mobiele veld-pagina's
- Alle kritieke info boven de fold op een 375px breed scherm (iPhone SE)
- Benchmark target: Mobile van 3→5

**Wie dit verslaat:** Total Party Planner (Mobile 5) heeft native apps maar voor event-kalender, niet voor veld-operaties. Horeko (Mobile 5) heeft HR/roostering mobiel. **Geen concurrent heeft mobiel-geoptimaliseerde HACCP voor catering.** Dit is onbezet terrein.

---

### #4. "Lege Pagina = Leraar" *(Rank 4 — drijft 15% van de score)*

**Statement:** Elke lege staat is een begeleid startpunt met drie elementen: (1) uitleg waarvoor deze pagina dient, (2) de eerste actie als primaire knop, en (3) een AI-suggestie die context-aware is. Geen blanco tabellen. Ooit.

**Rationale:** BBQ Architect scoort **2/7** op Onboarding — de laagste score op enige dimensie, en 1.8 punten onder het marktgemiddelde (3.8). Er is geen onboarding-flow, geen tooltip-systeem, geen empty-state afhandeling. Nieuwe gebruikers zien lege tabellen zonder uitleg. CaterZen (Onboarding 5) bereikt dit met een intuïtieve interface en minimale leercurve. BBQ Architect kan CaterZen verslaan door **AI-gestuurde onboarding** — iets dat geen concurrent biedt.

**Voorbeeld — Toepassen:**
Cor's medewerker opent voor het eerst de `/voorraad` pagina. In plaats van een lege tabel ziet hij:
```
🔥 Voorraad — Hou grip op je ingrediënten

Hier beheer je alle ingrediënten voor je BBQ events.
Voeg ze handmatig toe of laat de AI ze genereren uit je recepten.

[+ Eerste ingrediënt toevoegen]   [✨ Genereer uit recepten]

💡 "Welke ingrediënten heb ik nodig voor 80 gasten?"
```
De AI-chip (uit `PAGE_CHIPS['/voorraad']`) biedt direct een relevante startvraag.

**Voorbeeld — Schending:**
Een lege tabel met alleen kolomkoppen en een generieke "Geen resultaten" tekst. Of een "+" knop zonder context over wat de gebruiker zou moeten toevoegen.

**Trade-off:** Empty states ontwerpen voor 29 pagina's kost ontwikkeltijd, en de teksten moeten actueel blijven als features veranderen. **Mitigatie:** Gebruik een gedeeld `<EmptyState>` component met configuratie per pagina. PAGE_CHIPS data bestaat al in `AiAssistant.tsx` — hergebruik.

**Testbaar criterium:**
- Nieuwe gebruiker eerste taak: **80%+ first-attempt success rate zonder documentatie**
- 0 pagina's met blanco tabellen (automated test: elke pagina met 0 records rendert EmptyState)
- First-run wizard completion rate: >80%
- Benchmark target: Onboarding van 2→5

**Wie dit verslaat:** CaterZen (Onboarding 5) is intuïtief maar biedt geen AI-gestuurde begeleiding. Total Party Planner (Onboarding 4) heeft klant-portal maar geen first-run experience. **AI-powered onboarding is uniek** — combinatie van Principe #2 en #4.

---

### #5. "Export Eerst, API Later" *(Rank 5 — drijft 10% van de score)*

**Statement:** Elke data-entiteit (factuur, event, offerte, voorraad) is exporteerbaar in Nederlandse standaardformaten voordat we live integraties bouwen. Export is de minimale integratie. UBL 2.0 voor facturen, iCal voor events, CSV voor boekhouding.

**Rationale:** BBQ Architect scoort **2/7** op Integraties — de grootste absolute achterstand (2.3 punten onder gemiddelde). Alleen Supabase als databron. Geen boekhouding-export, geen kalender-sync, geen leverancier-koppeling. FoodNotify (6) en Apicbase (6) hebben open API's en uitgebreide leverancier-integraties. **Maar**: een solo-pitmaster heeft geen REST API nodig — hij heeft een CSV voor zijn boekhouder en een iCal-feed voor Google Calendar nodig. Begin met de export die vandaag waarde levert.

**Voorbeeld — Toepassen:**
Factuur detail-pagina toont drie exportknoppen: "Download PDF" (bestaand, verbeter template), "Exporteer UBL 2.0" (e-facturatie standaard die Exact Online/Moneybird importeert), "Kopieer naar klembord" (quick share). Cor's boekhouder importeert de UBL in Exact Online — klaar. Geen API-integratie nodig.

**Voorbeeld — Schending:**
Een "Exact Online integratie" project van 3 maanden bouwen terwijl Cor zijn facturen handmatig overtypt. Of een REST API openzetten die niemand consumeert. **Bouw pas een live integratie als de export-versie bewezen vraag heeft.**

**Trade-off:** Export-formaten (UBL, iCal, CSV) zijn minder elegant dan live-sync maar aanzienlijk sneller te bouwen en onafhankelijk van externe API-wijzigingen. **Accepteer de handmatige import-stap** — het elimineert dubbele invoer zonder de complexiteit van OAuth flows en webhook-management.

**Testbaar criterium:**
- 100% van facturen exporteerbaar in UBL 2.0 + PDF
- 100% van events beschikbaar via iCal-feed
- Gemeten reductie in handmatige boekhouding-invoer: **>50%**
- Benchmark target: Integration van 2→5

**Wie dit verslaat:** FoodNotify/Apicbase (beide 6) hebben live API's — maar die zijn enterprise-gericht. Horeko (5) leunt op Exact-ecosysteem. **Geen concurrent biedt specifiek UBL 2.0 e-facturatie voor Nederlandse kleine catering.** Dit is de snelste weg naar integratie-waarde.

---

### #6. "Dashboard = Antwoord, Niet Vraag" *(Rank 6 — drijft 15% van de score)*

**Statement:** Het dashboard beantwoordt drie vragen zonder klikken: (1) Wat heeft nu aandacht nodig? (2) Wat komt eraan deze week? (3) Hoe staat de zaak ervoor? Elke dashboard-kaart is een antwoord, niet een link naar het antwoord.

**Rationale:** BBQ Architect scoort **3/7** op Data Visualization. Het dashboard heeft KPI's en Recharts bar/pie charts, maar geen drill-down, geen trendanalyse, geen proactieve alerts. Growzer (5) en Apicbase (5) bieden realtime marge-tracking. FoodNotify (5) heeft multi-locatie KPI-dashboards. Het verschil: die tools **tonen** data; BBQ Architect moet data **interpreteren** — dankzij de AI-infrastructuur die al in `bbq-context.ts` staat.

**Voorbeeld — Toepassen:**
Dashboard toont drie zones:
1. **Aandacht Nu** (rood/amber): "Offerte OFF-2026-015 vervalt morgen" [Actie: Herinnering sturen], "Voorraad rundvlees onder par" [Actie: Bestellen], "HACCP-log ontbreekt voor gisteren" [Actie: Alsnog loggen]
2. **Deze Week** (kalenderstrip): Ma: prep voor De Vries (80p) | Di: inkoop Sligro | Do: Event De Vries | Vr: factuur verzenden
3. **Zaak-gezondheid**: Omzet deze maand vs. vorige maand, gemiddelde marge, open facturen

**Voorbeeld — Schending:**
Een dashboard met alleen "Omzet: €12.450" en "Events: 8" zonder context. Of een "Bekijk details →" link op elke kaart die naar een andere pagina leidt. Het antwoord moet **op het dashboard staan**, niet erachter.

**Trade-off:** Een informatierijk dashboard vereist meer data-loading en kan langzamer worden. **Mitigatie:** `loadDashboardContext()` uit `bbq-context.ts` laadt al events, voorraad, en offertes — hergebruik deze data. Lazy-load de "Zaak-gezondheid" sectie.

**Testbaar criterium:**
- Dashboard beantwoordt "wat moet ik nu doen?" zonder klikken: **ja/nee test**
- Kalenderstrip toont komende 7 dagen met event + prep markers
- Proactieve alerts tonen minimaal 3 categorieen (verval, voorraad, HACCP)
- Benchmark target: DataViz van 3→5

**Wie dit verslaat:** Growzer (DataViz 5) heeft omzet/rendement dashboards maar zonder proactieve AI-interpretatie. **Het combineren van data visualization met AI-inzichten (#2 + #6) is uniek** — geen concurrent biedt AI-geïnterpreteerde dashboards.

---

### #7. "Cor's BBQ, Cor's Taal" *(Rank 7 — drijft 2% + marktpositie)*

**Statement:** Het product denkt in BBQ-termen, spreekt Nederlands, en respecteert Nederlandse horeca-conventies. Prep-taken heten "Vlees marineren", niet "Prepare proteins". Financiën zijn in euro's met BTW-specificatie. Datums in dd-mm-jjjj. Dit is geen vertaald Amerikaans product.

**Rationale:** Geen concurrent combineert BBQ-domein specificiteit met Nederlandse marktfocus. Caterease/CaterZen/TPP zijn Amerikaans. FoodNotify is DACH. Horeko is Nederlands maar restaurant-gericht. **BBQ Architect is het enige product dat precies past bij een Nederlandse BBQ-cateraar** — en dit moet in elk detail voelbaar zijn. Visual Design weegt slechts 2%, maar marktpositionering is onmeetbaar in de benchmark-score en toch fundamenteel voor adoptie.

**Voorbeeld — Toepassen:**
- Prep-taken: "BBQ 2 uur voor service aansteken", "Kerntemperatuur meten (≥75°C)"
- HACCP-drempels: kerntemp ≥75°C, warmhoud ≥60°C, koeling ≤7°C (Nederlandse HACCP-normen)
- Offerte-velden: KvK-nummer, BTW-nummer, IBAN, betaaltermijn in dagen
- Status-labels: "concept", "verzonden", "geaccepteerd" (geen "draft", "sent", "accepted")

**Voorbeeld — Schending:**
Een mix van Nederlandse en Engelse termen in dezelfde interface. Of event-statussen die `pending` en `confirmed` gebruiken naast `concept` en `verzonden`. Of temperaturen in Fahrenheit.

**Trade-off:** Volledige Nederlandse specificiteit beperkt de markt tot Nederland/Vlaanderen. **Dit is bewust** — een product dat alles probeert te zijn voor iedereen, is niets voor iemand. De Nederlandse BBQ-catering niche is klein maar volledig onbezet.

**Testbaar criterium:**
- 0 Engelse UI-labels in de productie-interface (automated string scan)
- Alle financiële berekeningen in euro's met Nederlandse BTW-regels
- Alle datums in dd-mm-jjjj formaat
- Status-labels consistent Nederlands over alle entiteiten
- Benchmark target: Design van 4→5

**Wie dit verslaat:** Niemand. **Dit is de enig verdedigbare positie** — het snijvlak van BBQ-domein + Nederlands + solo-pitmaster dat geen concurrent kan of wil bezetten.

---

### Conflict-resolutie voorbeeld

**Scenario:** Het team wilt een mooie, geanimeerde page transition toevoegen bij het openen van een offerte vanuit het dashboard.

| Principe | Oordeel |
|----------|---------|
| #1 Nul Navigatie | **Wint** — de offerte moet openen in een slide-over panel, niet via page transition |
| #7 Cor's Taal | Neutraal — geen impact |

**Beslissing:** Geen page transition. Open de offerte in een in-context panel op het dashboard. Principe #1 (rank 1, 45% van de score) overschrijft een visueel design-wens (rank 7, 2% van de score).

---

### Principes → Score-projectie

| Principe | Target dimensie(s) | Score nu → doel | Gewogen impact |
|----------|--------------------|-----------------|----|
| #1 Nul Navigatie | TCE + IA&Nav | 5→7, 3→6 | +0.50 + 0.60 = **+1.10** |
| #2 AI Toont | AI + versterkt alle | 6→7 + indirect | +0.03 + ~0.30 indirect = **~+0.33** |
| #3 Eén Hand | Mobile | 3→5 | **+0.20** |
| #4 Lege Pagina | Onboarding | 2→5 | **+0.45** |
| #5 Export Eerst | Integrations | 2→5 | **+0.30** |
| #6 Dashboard = Antwoord | DataViz | 3→5 | **+0.30** |
| #7 Cor's Taal | Design + positie | 4→5 | **+0.02** |
| | | | **Totaal: +2.70** |
| | | | **Van 3.36 → ~5.76** |

**5.76 > CaterZen's 4.81.** Ruim #1 in de markt.

---

## 3.3 Phased Initiative Roadmap

### Phase 1: Quick Wins (0-4 weken)

Lage inspanning, hoge zichtbaarheid. Direct implementeerbaar zonder architectuurwijzigingen.

| ID | Initiatief | Pijler | Effort | Impact | Detail |
|----|-----------|--------|--------|--------|--------|
| QW-1 | Empty State Guides | P4 | S | Hoog | Elke pagina met Supabase-tabel detecteert 0 records → illustratie + uitleg + actie-knop + AI-chip (hergebruik PAGE_CHIPS) |
| QW-2 | Sidebar Smart Collapse | P1/P4 | S | Medium | Reduceer van 9 naar 5 primaire secties. Systeem → settings-icon. Communicatie/Website/Hulp → secundair |
| QW-3 | "Maak Offerte" vanuit Event | P1 | S | Hoog | Direct-actie knop op Event-kaarten die `/offerte-editor` opent pre-filled met klantdata, datum, gastenaantal |
| QW-4 | HACCP Mobile Quick-Log | P2 | M | Hoog | Conditionele mobiele layout op `/haccp`: grote product-selectie knoppen, numpad temperatuur-invoer, 1-tap save |
| QW-5 | Status Kleur/Label Standaardisatie | P4 | S | Medium | Unificeer status-kleuren in StatusDot component. Definieer kleurschema: groen/amber/rood/blauw/grijs |
| QW-6 | Gedeeld MetallicCard Component | P4 | S | Laag (intern) | Consolideer herhaalde MetallicCard definities naar `/components/MetallicCard.tsx` |
| QW-7 | Dashboard Kalenderstrip | P1 | M | Hoog | Horizontale week-kalender boven het dashboard met event-markers en quick-nav |

**QW-1 Detail:**
```
Component: <EmptyState page={pathname} />
Props: illustratie, titel, beschrijving, actie-knop, AI-chip
Data: PAGE_CHIPS[pathname] voor AI-suggesties
Locatie: Elk pagina-bestand met useSupabase() hook
Voorwaarde: data.length === 0 && !loading
```

**QW-3 Detail:**
```
Trigger: Knop op Event-kaart en Event-planner offerte-kaart
Actie: router.push('/offerte-editor?client=' + encodeURIComponent(event.client_naam) + '&datum=' + event.date + '&gasten=' + event.guests)
De offerte-editor leest query params als initialisatiewaarden
```

**QW-4 Detail:**
```
Detectie: window.innerWidth < 768 of user-agent check
Layout: Groot product-select grid (4 kolommen, 48px+ targets)
           → Numpad-stijl temperatuurinvoer (0-9, punt, backspace)
           → Type-selector (kern/koeling/warmhoud) als grote pills
           → getStatus() feedback (groen/amber/rood) in real-time
           → 1-tap "Registreer" knop (full-width, 56px hoog)
```

### Phase 2: Core Improvements (1-3 maanden)

Middelgrote tot grote inspanning, structurele verbeteringen.

| ID | Initiatief | Pijler | Effort | Impact | Detail |
|----|-----------|--------|--------|--------|--------|
| CI-1 | Event Wizard Flow | P1 | L | Zeer Hoog | Multi-stap wizard: Klant → Menu → Datum/Logistiek → Offerte Preview → Verzenden. Roept `acceptOfferte()` aan op bevestiging |
| CI-2 | Mobile Service Mode | P2 | L | Hoog | Dedicated mobiele interface voor event-dag: prep-checklist, HACCP-log, materieel-check, uren-start/stop |
| CI-3 | AI Proactieve Suggesties | P3 | M | Hoog | Inline badges, toasts, dashboard-kaart op basis van `bbq-context.ts` data. Voorraad-alarm, offerte-verval, prep-herinnering |
| CI-4 | Onboarding Flow | P4 | M | Hoog | First-run wizard: bedrijfsgegevens → eerste gerecht toevoegen → eerste event plannen → offerte demo |
| CI-5 | Enhanced Command Palette | P1/P4 | M | Medium | Acties naast navigatie: "Maak offerte", "Log temperatuur", "Start uren". Fuzzy search over alle entiteiten |
| CI-6 | Navigatie Redesign | P4 | M | Hoog | 5 primaire secties + context-aware "recent" items + favorieten-pinning |
| CI-7 | Prep Timeline Visualisatie | P1 | M | Medium | Gantt-achtige tijdlijn van D-3 tot D-0 prep-taken per event, gebaseerd op syncEngine prep-schema |

**CI-1 Detail (Event Wizard):**
```
Stap 1: Klant (KlantAutocomplete, bestaande klant of nieuw)
Stap 2: Menu (MenuBuilder component — selectie uit gangen/gerechten)
Stap 3: Details (datum, locatie, gastenaantal, bijzonderheden)
Stap 4: Offerte Preview (automatische berekening via calcOfferteTotaal)
        → Marge-indicator (kostprijs vs. verkoopprijs per gast)
        → BTW-specificatie per regelpost
Stap 5: Bevestig & Verzend
        → acceptOfferte() cascade: event + prep-taken + concept-factuur
        → Optional: PDF genereren en mailen naar klant

Route: /nieuw-event (nieuwe pagina) of modal over /events
Backend: Hergebruik syncEngine.ts volledig — geen nieuwe API
```

**CI-3 Detail (AI Proactieve Suggesties):**
```
Bron: bbq-context.ts loadPageContext() data
Kanalen:
  1. Sidebar badges (rood getal): "3 items onder par" op Voorraad
  2. Toast notificaties: "Offerte OFF-2026-012 vervalt morgen"
  3. Dashboard "AI Inzichten" kaart met actie-knoppen
  4. Inline form hints: "Vorige keer 80 gasten, gemiddeld 42/p.p."
Implementatie: useEffect op dashboard dat loadDashboardContext aanroept
              → evalueert regels (voorraad < par, offerte.geldig_tot < morgen)
              → rendert NotificationBadge components
```

### Phase 3: Strategic Capabilities (3-6 maanden)

Grote inspanning, strategische uitbreiding.

| ID | Initiatief | Pijler | Effort | Impact | Detail |
|----|-----------|--------|--------|--------|--------|
| SC-1 | Nederlandse Boekhouding Export | P5 | L | Hoog | UBL 2.0 e-facturatie, CSV voor Exact Online/Moneybird import, btw-rapportage |
| SC-2 | Leverancier Catalogus Integratie | P5 | XL | Medium | Sligro/Hanos/Makro productcatalogus koppeling voor directe bestelling |
| SC-3 | Kalender Sync | P5 | M | Medium | iCal feed generatie vanuit events-tabel voor Google Calendar/Outlook |
| SC-4 | Role-Based Access Control | P4 | L | Medium | Supabase RLS policies + gebruikersrollen (eigenaar/medewerker/klant) |
| SC-5 | Klantportaal | P5 | XL | Medium | Klant kan offerte bekijken, goedkeuren, menu-selectie bevestigen |
| SC-6 | Geavanceerd Analytics Dashboard | P1 | L | Hoog | Drill-down per event/periode, trendanalyse, seizoens-vergelijking, margin per gerecht |
| SC-7 | Offline Mode voor Veldoperaties | P2 | XL | Medium | Service Worker + IndexedDB voor HACCP/service/logistiek zonder internetverbinding |

---

## 3.4 Effort/Impact Matrix

```
                          IMPACT
                   Laag              Hoog
              +------------+------------------+
         Laag | QW-2       | QW-1  QW-3       |
              | QW-5       | QW-4  QW-7       |
   EFFORT     | QW-6       | CI-3             |
              +------------+------------------+
         Hoog | SC-2  SC-5 | CI-1  CI-2       |
              | SC-7       | SC-1  SC-6       |
              | SC-4       | CI-4  CI-6       |
              +------------+------------------+
```

**Top-right (doe eerst):** QW-1, QW-3, QW-4, QW-7, CI-3
**Top-left (doe wanneer handig):** QW-2, QW-5, QW-6, CI-5
**Bottom-right (plan zorgvuldig):** CI-1, CI-2, SC-1, SC-6, CI-4, CI-6
**Bottom-left (deprioriteer):** SC-2, SC-5, SC-7, SC-4

**Aanbevolen volgorde:**
1. QW-1 + QW-6 (fundament: gedeeld component + empty states)
2. QW-3 + QW-5 (flow: offerte-link + status-consistentie)
3. QW-4 + QW-7 (mobile + dashboard)
4. QW-2 (navigatie-vereenvoudiging)
5. CI-3 (AI proactief — bouwt voort op bestaande infra)
6. CI-1 (Event Wizard — grootste impact)
7. CI-4 + CI-6 (onboarding + navigatie redesign)
8. CI-2 (Mobile Service Mode)
9. SC-1 (boekhouding export)
10. SC-6 (advanced analytics)

---

## 3.5 Measurement & Validation Plan

### Per-fase validatie

**Phase 1 (Quick Wins) — Validatie na 4 weken:**

| Metric | Tool | Doel |
|--------|------|------|
| Empty state → eerste actie conversie | Click tracking op EmptyState actie-knop | 60%+ klikt door |
| HACCP mobiele log-snelheid | Timer in QW-4 component | <30 sec gemiddeld |
| Offerte-aanmaak vanuit event | Click tracking op QW-3 knop | 50%+ van offertes via deze route |
| Navigatie-diepte per sessie | Pagina-views per sessie | Dalend t.o.v. baseline |

**Phase 2 (Core Improvements) — Validatie na 3 maanden:**

| Metric | Tool | Doel |
|--------|------|------|
| Event Wizard doorlooptijd | Timed wizard completion | <3 min van start tot offerte verzonden |
| Event Wizard abandonment | Stap-voor-stap funnel | <20% drop-off na stap 1 |
| AI proactieve suggestie CTR | Click tracking op badges/toasts | 15%+ interactie |
| Onboarding completion rate | Wizard funnel | 80%+ voltooit alle stappen |
| Mobiele sessie-aandeel op veldwerk-pagina's | User-agent tracking | 30%+ op HACCP/service/logistiek |

**Phase 3 (Strategic Capabilities) — Validatie na 6 maanden:**

| Metric | Tool | Doel |
|--------|------|------|
| Factuur-export adoptie | Export-button click tracking | 80%+ van facturen geexporteerd |
| Kalender-sync actieve gebruikers | iCal feed subscriptions | 100% van actieve gebruikers |
| Dubbele invoer reductie | Gebruikersenquete | 50%+ reductie in handmatige boekhouding-invoer |

### Feedback-loop

Na elke fase: 15-minuten feedbacksessie met Cor (primaire gebruiker) om:
1. Meest en minst gebruikte nieuwe features te identificeren
2. Onverwachte workflows of workarounds te ontdekken
3. Prioriteiten voor de volgende fase bij te stellen

---

# Appendices

## A: Competitor Evidence Inventory

*(Wordt aangevuld per competitor profile — zie individuele evidence inventories in sectie 1.2)*

---

## B: BBQ Architect Current-State Audit Notes

### Codebase Structuur

| Aspect | Detail |
|--------|--------|
| **Pagina-routes** | 29 pagina's in `/src/app/` via Next.js App Router |
| **Sidebar-secties** | 9 secties gedefinieerd in `navigation.tsx` |
| **Shared components** | ~12 in `/src/components/` (Sidebar, CommandPalette, AiAssistant, Toast, etc.) |
| **Database types** | 20+ interfaces in `database.types.ts` |
| **AI context loaders** | 16 pagina-specifieke data-loaders in `bbq-context.ts` |
| **AI tool schemas** | 20+ tools in `bbq-tools.ts` |
| **Sync engine** | 4 functies in `syncEngine.ts` (offerte→event→prep→factuur) |

### Navigatie-Audit (uit `navigation.tsx`)

```
De Keuken (3 pagina's)
  ├── Menu Engineering    /menu-engineering
  ├── Recepten            /recepten
  └── Gerechten           /gerechten

Operatie (4 pagina's)
  ├── Agenda              /agenda
  ├── Events              /events
  ├── Event Planner       /event-planner
  └── Service             /service

De Zaak (6 pagina's)
  ├── Offertes            /offertes
  ├── Snel Aanmaken       /offerte-editor
  ├── Facturen            /facturen
  ├── Klanten             /klanten
  ├── Analytics           /financien
  └── Boekhouding         /boekhouding

Beheer & Logistiek (6 pagina's)
  ├── Inkoop              /inkoop
  ├── Voorraad            /voorraad
  ├── Logistiek           /logistiek
  ├── Materieel           /materieel
  ├── Uren                /uren
  └── HACCP               /haccp

Digital Pitmaster (2 pagina's)
  ├── Pitmaster Studio    /ai-chat
  └── Prijsintelligentie  /price-intelligence

Systeem (3 pagina's)
  ├── Foto-archief        /foto-archief
  ├── Gebruikers          /gebruikers
  └── Instellingen        /instellingen

Communicatie (2 pagina's)
  ├── Berichten           /berichten
  └── Mailbox             /mailbox

Website (1 pagina)
  └── Website Beheer      /website

Hulp & Support (2 pagina's)
  ├── FAQ                 /faq
  └── Contact             /contact
```

### Status-Waarden Audit (uit `database.types.ts`)

| Entiteit | Statussen | Inconsistentie |
|----------|-----------|----------------|
| Events | `pending, confirmed, completed, cancelled, optie` | 5 statussen, mix NL/EN |
| Offertes | `concept, verzonden, geaccepteerd, afgewezen, akkoord, betaald, verlopen, geannuleerd, definitief, goedgekeurd` | **10 statussen** — overlap: akkoord/geaccepteerd/goedgekeurd/definitief |
| Facturen | `concept, verzonden, betaald, verlopen, vervallen, geannuleerd` | 6 statussen, overlap: verlopen/vervallen |
| HACCP | `ok, warn, danger, afwijking` | 4 statussen, afwijking overlapt met danger |
| Materieel | `ok, onderhoud, defect` | 3 statussen — helder |
| TimeLog | `active, stopped, completed, signed` | 4 statussen — helder |

### Sync Engine Flow (uit `syncEngine.ts`)

```
acceptOfferte(offerte)
  │
  ├── 1. Update offerte.status → 'geaccepteerd'
  │
  ├── 2. syncOffertaToEvent(offerte)
  │      ├── Als event_id bestaat → update event
  │      └── Als geen event_id → insert nieuw event
  │          └── Link offerte.event_id ↔ event.offerte_id
  │
  ├── 3. autoCreatePrepTasks(event_id, eventDate, clientNaam)
  │      └── Insert 7 taken (als nog geen taken bestaan):
  │           D-3: Boodschappen + inkoop controleren
  │           D-3: Vlees marineren + voorbereidingen
  │           D-2: Mise-en-place (sauzen, bijgerechten, desserts)
  │           D-2: Materiaal & BBQ controleren
  │           D-1: Materiaal inladen in bus (RTR-checklist)
  │           D-1: Definitieve bevestiging met klant
  │           D-0: EVENT DAG — opstelling, BBQ aansteken
  │
  └── 4. autoCreateFactuurDraft(offerte + event_id)
         └── Insert concept-factuur met:
              nummer: F{jaar}-{volgnummer}
              items: offerte.items (gekopieerd)
              vervaldatum: vandaag + 14 dagen
```

### AI Context Coverage (uit `bbq-context.ts`)

| Pagina | Data geladen | Berekeningen |
|--------|-------------|--------------|
| Dashboard `/` | Events deze week, lage voorraad, recente offertes | — |
| Events | Aankomende events (10), recepten (50) | — |
| Agenda | Events (20), prep_tasks (20) | — |
| Offertes | Offertes (30) | Totale omzet, open bedrag, per-offerte totaal |
| Facturen | Facturen (30) | Open/betaald totaal, vervallen count |
| Gerechten | Gangen, gerechten | Per-gang groupering |
| Recepten | Recepten, inventory | — |
| Voorraad | Inventory | Lage voorraad filter |
| Inkoop | Inventory, gerechten | — |
| HACCP | HACCP logs (50), recent events | — |
| Service | Vandaag events, gerechten | — |
| Uren | Uren logs (30 dagen) | Totaal uren |
| Materieel | Materieel items | — |
| Logistiek | Komende events (5), materieel | — |
| Boekhouding | Offertes (100), facturen (100) | Kwartaal, offerte pipeline |
| Menu Engineering | Gerechten, offertes | — |

### Technische Schuld Observaties

| Issue | Ernst | Locatie |
|-------|-------|---------|
| Tailwind CSS via CDN `<script>` tag | Medium | `layout.tsx` of `_document` |
| jsPDF via externe CDN scripts | Medium | PDF-generatie modules |
| `eslint-disable @typescript-eslint/no-explicit-any` in elk bestand | Laag | Alle pagina-bestanden |
| Datums als TEXT strings (geen DATE type) | Medium | Events, facturen, offertes tabellen |
| JSONB voor line-items (geen referentiele integriteit) | Medium | Facturen.items, offertes.items |
| RLS policies "Allow all" | Hoog | Supabase security |
| MetallicCard herhaald in 3+ bestanden | Laag | Dashboard, events, andere pagina's |
| Hardcoded userRole `'planner'` | Hoog | Event-planner |

---

## C: Scoring Methodology Calibration Notes

### Kalibratie-aanpak

De 7-punts schaal is gekalibreerd met de volgende ankerpunten:

**Score 7 (Exemplarisch):** Het product definieert de standaard waartegen anderen worden gemeten in deze dimensie. Voorbeeld: Caterease voor task completion efficiency (50K+ tevreden gebruikers, uitgebreide automatisering).

**Score 4 (Adequaat):** Het product voldoet aan basale verwachtingen maar biedt geen onderscheidende ervaring. Dit is de "gemiddelde" score voor een functioneel maar ongepolijst product.

**Score 1 (Afwezig):** De functionaliteit of kwaliteit is volledig afwezig of zodanig gebroken dat het niet bruikbaar is.

### Weging rationale

| Dimensie | Gewicht | Rationale |
|----------|---------|-----------|
| Task Completion Efficiency | 25% | Directe impact op dagelijkse productiviteit van een klein team |
| IA & Navigation | 20% | Fundamenteel — als je het niet kunt vinden, kun je het niet gebruiken |
| Data Viz & Reporting | 15% | Cruciaal voor besluitvorming (marges, cashflow, seizoenspatronen) |
| Onboarding | 15% | Hoge impact op time-to-value, vooral voor solo-operators die zelf moeten ontdekken |
| Mobile | 10% | Secundair gebruik — veldwerk is belangrijk maar niet de primaire interface |
| Integrations | 10% | Strategisch — bepaalt of het product als eiland of als ecosysteem functioneert |
| AI/Automation | 3% | Opkomende differentiator maar nog niet universeel verwacht in deze markt |
| Visual Design | 2% | Hygienefactor — moet niet in de weg zitten maar is zelden een beslissingsfactor |

### Confidence-impact op scoring

Wanneer confidence Laag is (alleen marketing claims):
- Score wordt met * gemarkeerd
- Score vertegenwoordigt de *claim*, niet de geverifieerde kwaliteit
- Bij gelijke claims en onzekere evidence: default naar score 4 (adequaat)
- Scores worden nooit opwaarts aangepast op basis van marketing; wel neerwaarts op basis van negatieve reviews
