# BBQ Architect v2 — UX Benchmark, Problem Framing & Strategie

> **Datum:** 9 april 2026
> **Versie:** 3.0 (volledige heranalyse na grote UI/UX updates)
> **App:** BBQ Architect v2 (Hop & Bites) — Next.js 16, React 19, Supabase, PWA

---

## Inhoudsopgave

- [DEEL 1: Competitive Benchmark](#deel-1-competitive-benchmark)
- [DEEL 2: Problem Framing](#deel-2-problem-framing)
- [DEEL 3: UX Strategie](#deel-3-ux-strategie)

---

# DEEL 1: Competitive Benchmark

## 1.1 Concurrentprofielen

### Apicbase (EU)
| | |
|---|---|
| **Focus** | Back-of-house food management: food cost, HACCP, inventory, procurement |
| **Doelgroep** | Multi-unit restaurants, hotelketens, contract catering (1.000+ locaties) |
| **Prijs** | Vanaf EUR 60/mnd (Basic) tot EUR 160/mnd (Pro); Enterprise op maat |
| **Sterkte** | Diepste food cost control in de markt, EU-compliance (allergenen, voedingslabels), native iOS/Android app met barcode scanning |
| **Zwakte** | Geen catering-specifieke workflows (events, offertes, service), duur voor kleine bedrijven, steile leercurve, geen AI |
| **Mobile** | Native iOS + Android (voorraad, scan, waste registratie) |
| **AI** | Geen |
| **Review** | Capterra 4.6/5 (35 reviews) |

### CaterZen (US)
| | |
|---|---|
| **Focus** | All-in-one catering CRM met sales, delivery, marketing, accounting |
| **Doelgroep** | Kleine tot middelgrote caterers in de VS (drop-off, delivery, full-service) |
| **Prijs** | $99-$229/mnd; Enterprise tot 5 locaties |
| **Sterkte** | Ingebouwde VoIP, email marketing templates, driver app met foto/handtekening, snelle implementatie (3 weken) |
| **Zwakte** | Alleen US-markt, geen volledige mobile management app, beperkte aanpasbaarheid klantportaal |
| **Mobile** | Driver App (iOS/Android) met route, foto, handtekening, fooi |
| **AI** | In ontwikkeling: AI forecasting, smart rebooking, voice ordering, route-optimalisatie |
| **Review** | Capterra ~4.5/5 |

### Caterease (US)
| | |
|---|---|
| **Focus** | Event catering met diepe planning: plattegronden, stoelindeling, gastenlijsten |
| **Doelgroep** | Middelgrote tot grote event caterers, venues, hotels (50.000+ gebruikers wereldwijd) |
| **Prijs** | $85-$165/mnd + extra kosten per feature; training apart |
| **Sterkte** | Grootste gebruikersbestand, diepste event planning (plattegronden, BEOs), 200+ integraties |
| **Zwakte** | Verouderde UI ("antiquated"), geen Mac-support, veel verborgen kosten, geen AI, steile leercurve |
| **Mobile** | iOS + Android (beperkt: dashboard, kalender, contacten) |
| **AI** | Geen |
| **Review** | Capterra 4.3/5 (109 reviews) |

### Total Party Planner (US)
| | |
|---|---|
| **Focus** | Compleet cateringbeheer: events, menu's, recepten, proposals, CRM |
| **Doelgroep** | Kleine tot middelgrote caterers in de VS |
| **Prijs** | $65-$365/mnd + $500-$1.000 setup fee |
| **Sterkte** | Volwassen product, sterke rapportages (food cost, marge), goede klantenservice |
| **Zwakte** | Buggy mobiele app, verouderde UI, hoge setup-kosten, geen AI |
| **Mobile** | iOS + Android (maar buggy en onbetrouwbaar) |
| **AI** | Geen |
| **Review** | Capterra 4.8/5 (153 reviews) |

### Flex Catering (AU)
| | |
|---|---|
| **Focus** | Moderne catering platform: online bestellen, delivery, KDS, e-signature |
| **Doelgroep** | Corporate/event/drop-off caterers (2 personen tot 5.000+ medewerkers) |
| **Prijs** | ~$250-$450/mnd (niet publiek) |
| **Sterkte** | Modernste UI in de markt, eerste Catering KDS, driver app met proof-of-delivery, Zapier + open API |
| **Zwakte** | Mobile admin UX nog zwak, feature updates soms buggy, prijzen niet transparant |
| **Mobile** | Driver App (iOS/Android) + responsive web |
| **AI** | Geen native (3rd-party Goodcall beschikbaar) |
| **Review** | G2 4.3/5, Capterra ~4.5/5 |

### FoodStorm (Enterprise, Instacart)
| | |
|---|---|
| **Focus** | Order management voor supermarkt deli/prepared foods/bakkerij |
| **Doelgroep** | Grote supermarktketens (Albertsons, Ahold Delhaize) |
| **Prijs** | Vanaf ~$500/mnd (enterprise, niet publiek) |
| **Sterkte** | Instacart-ecosysteem, multi-channel ordering (web, kiosk, in-store), witte-label portalen |
| **Zwakte** | Kwaliteitsdaling na Instacart-overname, slechte mobile UX, gelimiteerde zoekfunctie, geen onafhankelijke caterers |
| **Mobile** | Android/iOS + Instacart App |
| **AI** | Instacart prijsoptimalisatie (indirect) |
| **Review** | Capterra 4.5-4.7/5 (19 reviews, dalend na overname) |

### CaterTrax (US)
| | |
|---|---|
| **Focus** | Self-service catering voor institutionele foodservice |
| **Doelgroep** | Universiteiten, ziekenhuizen, bedrijfskantines (20.000+ locaties, o.a. Sodexo) |
| **Prijs** | Niet publiek (enterprise contracten) |
| **Sterkte** | Marktleider institutioneel, 24/7 support, schaal (20k+ locaties) |
| **Zwakte** | Zelf-edit mogelijkheden verwijderd na update, verouderde UI, geen AI, alleen Noord-Amerika |
| **Mobile** | Responsive web only (geen native app) |
| **AI** | Geen |
| **Review** | Capterra 4.6/5 (132 reviews) |

### Better Cater (NZ)
| | |
|---|---|
| **Focus** | Betaalbare basics: events, menu's, proposals, facturen |
| **Doelgroep** | Kleine cateringteams en starters |
| **Prijs** | $69/mnd (geen setup fee); 30 dagen gratis trial |
| **Sterkte** | Laagste instapprijs, gebruiksvriendelijk, Zapier integratie, geen setup-kosten |
| **Zwakte** | Geen mobile app, beperkte rapportages, email deliverability problemen, geen batch-operaties |
| **Mobile** | Geen native app (alleen mobile web) |
| **AI** | Geen |
| **Review** | Capterra 4.8/5 (33 reviews) |

---

## 1.2 Feature Coverage Matrix

> Legenda: **S** = Superieur (best-in-class) | **V** = Volledig aanwezig | **B** = Beperkt | **-** = Afwezig

| Feature | BBQ Architect | Apicbase | CaterZen | Caterease | TPP | Flex | FoodStorm | CaterTrax | Better Cater |
|---------|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| **KEUKEN & MENU** | | | | | | | | | |
| Receptbeheer | S | S | B | B | V | V | B | - | B |
| Kostprijscalculatie | S | S | B | V | V | V | B | - | B |
| Menu Engineering (ABC) | S | V | - | - | B | - | - | - | - |
| Allergenenbeheer | V | S | B | B | B | V | - | - | - |
| Kitchen Mode/KDS | V | - | - | - | - | S | V | B | - |
| **OPERATIE** | | | | | | | | | |
| Event planning | S | - | V | S | V | V | B | V | V |
| Agenda/kalender | S | - | V | V | V | V | B | V | V |
| Prep tasks (auto) | S | - | B | - | V | B | - | V | - |
| Service mode (live) | S | - | - | - | - | - | - | - | - |
| Plattegronden | - | - | - | S | - | - | - | B | - |
| **SALES & FINANCIEEL** | | | | | | | | | |
| Offertes/proposals | V | - | V | V | V | V | - | - | V |
| E-signature | - | - | V | V | V | V | - | - | - |
| Facturen | V | - | V | V | V | V | B | - | V |
| Online betalingen | V | - | V | V | V | V | V | V | V |
| CRM/klantbeheer | V | - | V | V | V | V | B | B | V |
| Financiele rapportages | S | V | V | V | V | V | V | B | B |
| **VOORRAAD & LOGISTIEK** | | | | | | | | | |
| Voorraadbeheer | V | S | B | B | V | V | - | V | - |
| Inkoopbeheer | V | S | B | - | B | V | - | - | - |
| Pack lists | V | - | - | - | V | - | - | - | B |
| Materieelbeheer | V | - | - | B | - | - | - | - | - |
| Delivery management | - | - | S | - | - | S | - | - | - |
| **COMPLIANCE & HR** | | | | | | | | | |
| HACCP registratie | V | S | - | - | - | - | - | - | - |
| Urenregistratie | V | - | - | - | B | - | - | - | - |
| Personeelsbeheer | B | - | B | B | V | - | - | - | - |
| **TECHNOLOGIE** | | | | | | | | | |
| AI Assistant | S | - | B* | - | - | - | B* | - | - |
| Command Palette | S | - | - | - | - | - | - | - | - |
| Offline/PWA | V | V | - | - | - | - | - | - | - |
| Real-time sync | V | B | B | - | - | V | V | - | - |
| Webhooks/API | V | V | B | B | B | V | B | - | B |
| **COMMUNICATIE** | | | | | | | | | |
| Email systeem | V | - | S | B | B | V | - | - | B |
| Website CMS | V | - | - | - | - | B | V | B | - |
| Klantportaal | B | - | V | V | V | V | V | V | - |
| **INTEGRATIES** | | | | | | | | | |
| Boekhoudpakket | V | V | V | V | V | V | B | - | V |
| Kalender sync | V | - | V | V | V | V | - | - | V |
| Betalingsprovider | V | - | V | V | V | V | V | V | V |

*B\* = In ontwikkeling of via 3rd-party*

**Totaal features (V of S):**
| Platform | Score |
|----------|-------|
| **BBQ Architect** | **27/32** |
| Flex Catering | 19/32 |
| Apicbase | 14/32 |
| CaterZen | 17/32 |
| Caterease | 16/32 |
| TPP | 17/32 |
| FoodStorm | 10/32 |
| CaterTrax | 9/32 |
| Better Cater | 9/32 |

---

## 1.3 UX Kwaliteitsdimensies (Scoring 1-5)

| Dimensie | BBQ Architect | Apicbase | CaterZen | Caterease | TPP | Flex | FoodStorm | CaterTrax | Better Cater |
|----------|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| Onboarding | 4.0 | 3.0 | 4.5 | 2.5 | 3.0 | 3.5 | 3.0 | 2.5 | 4.0 |
| Navigatie | 4.5 | 3.5 | 4.0 | 3.0 | 3.5 | 4.0 | 3.0 | 2.5 | 3.5 |
| Mobile UX | 3.5 | 4.0 | 3.0 | 2.0 | 1.5 | 3.0 | 2.5 | 2.5 | 2.0 |
| AI & Automatisering | 5.0 | 1.0 | 2.5 | 1.0 | 1.0 | 1.0 | 1.5 | 1.0 | 1.0 |
| Workflow Efficiency | 4.5 | 3.5 | 4.0 | 3.0 | 3.5 | 4.0 | 3.0 | 3.0 | 3.0 |
| Visueel Design | 4.5 | 3.5 | 4.0 | 2.0 | 2.5 | 4.5 | 3.0 | 2.0 | 3.5 |
| Data & Rapportage | 4.5 | 4.5 | 4.0 | 3.5 | 4.0 | 3.5 | 3.5 | 3.0 | 2.0 |
| Integraties | 4.0 | 4.0 | 4.0 | 3.5 | 3.5 | 4.5 | 3.0 | 2.0 | 3.5 |
| **Gemiddeld** | **4.31** | **3.38** | **3.75** | **2.56** | **2.81** | **3.50** | **2.81** | **2.31** | **2.81** |
| **Ranking** | **#1** | **#4** | **#2** | **#7** | **#5** | **#3** | **#5** | **#8** | **#5** |

### Toelichting scores BBQ Architect:

- **Onboarding (4.0):** Onboarding wizard aanwezig, lege staten met AI-chips, PageHint tooltips. Mist nog guided tours per module en video tutorials.
- **Navigatie (4.5):** Command Palette (Cmd+K), collapsible sidebar met badges, breadcrumbs, bottom nav mobile, 6 primaire secties. Zeer sterk.
- **Mobile UX (3.5):** PWA met offline support, BottomNav, kitchen mode, service mode. Maar niet alle pagina's zijn volledig touch-geoptimaliseerd.
- **AI & Automatisering (5.0):** 40+ AI tools, page-contextual chips op 26+ pagina's, floating assistant, action execution (directe data-insertie), cross-module context. Ongeevenaaard in de markt.
- **Workflow Efficiency (4.5):** Offerte->Event->Prep->Service->Factuur->Betaling in een app. SyncEngine voor cross-module updates. Mist e-signature.
- **Visueel Design (4.5):** Donker thema met glassmorphisme, gouden accent, 4 fonts, consistent kleurensysteem. Professioneel en uniek.
- **Data & Rapportage (4.5):** Dashboard KPIs, DrillDownKPI, financiele maandanalyses, marge tracking, BTW overzicht. Sterk.
- **Integraties (4.0):** Mollie, Moneybird, Exact, Google Calendar, Resend, webhooks framework. OAuth nog niet overal live.

---

## 1.4 Scoring Matrix — Totaaloverzicht

```
Platform              | Features | UX Score | Totaal  | Rang
===================== | ======== | ======== | ======= | ====
BBQ Architect v2      |  27/32   |  4.31/5  |  8.75   |  #1
Flex Catering         |  19/32   |  3.50/5  |  6.47   |  #2
CaterZen              |  17/32   |  3.75/5  |  6.22   |  #3
Apicbase              |  14/32   |  3.38/5  |  5.10   |  #4
TPP                   |  17/32   |  2.81/5  |  4.85   |  #5
Caterease             |  16/32   |  2.56/5  |  4.38   |  #6
FoodStorm             |  10/32   |  2.81/5  |  3.56   |  #7
Better Cater          |   9/32   |  2.81/5  |  3.41   |  #8
CaterTrax             |   9/32   |  2.31/5  |  2.96   |  #9
```

*Totaal = (Features/32 * 5) + UX Score, gewogen gemiddelde*

---

## 1.5 Journey Vergelijking

### Journey 1: Offerte naar Factuur

| Stap | BBQ Architect | Flex Catering | CaterZen | Caterease | TPP |
|------|:---:|:---:|:---:|:---:|:---:|
| Klant selecteren/aanmaken | 1 klik (autocomplete) | 2-3 stappen | 2 stappen | 3-4 stappen | 2-3 stappen |
| Menu samenstellen | MenuWizard (3 stappen) | Menu builder | Menu selectie | Menu + plattegrond | Menu builder |
| Offerte versturen | 1 klik (email) | 1 klik | 1 klik | 2 stappen | 1 klik |
| Klant accepteert | Via /q/[id] link | E-signature | E-signature portal | E-signature (DocuSign) | E-signature |
| Event aanmaken | **Automatisch** (SyncEngine) | Handmatig | Semi-auto | Handmatig | Semi-auto |
| Prep tasks genereren | **Automatisch** (-3,-2,-1 dagen) | Handmatig | N.v.t. | N.v.t. | Handmatig |
| Service uitvoeren | **Service Mode** (live) | N.v.t. | N.v.t. | N.v.t. | N.v.t. |
| Factuur aanmaken | 1 klik vanuit event | 1 klik | Auto-optie | 2 stappen | 1 klik |
| Betaling ontvangen | Mollie betaallink | Stripe | Braintree/PayPal | HPay | TPP Pay |
| **Totaal stappen** | **~6 (meeste auto)** | ~10 | ~8 | ~12 | ~10 |
| **Uniek** | AI kan hele flow triggeren | KDS integratie | Driver app | Plattegronden | Food cost rapport |

### Journey 2: Recept naar Kostprijs

| Stap | BBQ Architect | Apicbase | Flex Catering | TPP |
|------|:---:|:---:|:---:|:---:|
| Recept aanmaken | Formulier + ingredienten | Uitgebreid formulier | Menu builder | Recipe builder |
| Ingredientkosten | Per ingredient met yield | Automatisch via leveranciers | Handmatig | Via ChefTec |
| Kostprijs per portie | **Automatisch berekend** | **Automatisch** | Handmatig | Semi-auto |
| Marge analyse | **Menu Engineering (ABC)** | Profit alerts | Basis rapport | Cost analysis |
| Schalen naar event | **AI tool** (auto-scaling) | Productie module | Handmatig | Handmatig |
| **Automatisering** | **Hoog** | **Hoog** | Laag | Medium |

---

## 1.6 Marktpositionering

```
                        Feature Diepte
                    Laag ◄───────────────► Hoog

              Hoog  │  Flex Catering    BBQ Architect v2
                    │                        ★
           UX      │  CaterZen
          Polish    │  Better Cater
                    │                   Apicbase
                    │
              Laag  │  CaterTrax        Caterease
                    │  FoodStorm        TPP
                    └────────────────────────────
```

### Unieke Differentiators per Speler

| Platform | Unieke Differentiator |
|----------|----------------------|
| **BBQ Architect** | AI-first met 40+ tools, donker cockpit design, Nederlandse markt, end-to-end workflow |
| **Apicbase** | Diepste food cost control, EU-compliance, multi-unit schaal |
| **CaterZen** | Ingebouwde VoIP + marketing, driver app met foto/handtekening |
| **Caterease** | Plattegronden + stoelindeling, 50K+ gebruikers, DocuSign |
| **TPP** | Sterke community reviews (4.8/5), food cost rapportages |
| **Flex Catering** | Eerste Catering KDS, modernste UI naast BBQ Architect |
| **FoodStorm** | Instacart-ecosysteem, multi-channel supermarkt ordering |
| **CaterTrax** | Institutionele schaal (20K+ locaties), Sodexo partnership |
| **Better Cater** | Laagste prijs, geen setup kosten, 30 dagen gratis |

---

# DEEL 2: Problem Framing

## 2.1 Probleemdefinitie

### Hoofdvraag
> Hoe kan BBQ Architect v2 de dominante positie in features en AI behouden, terwijl de laatste UX-gaps worden gedicht om een compleet, marktklaar product te worden?

### Context
Na uitgebreide updates scoort BBQ Architect #1 in zowel feature coverage (27/32) als UX kwaliteit (4.31/5). De app heeft een werkende end-to-end workflow, AI-integratie die geen concurrent kan matchen, en een visueel onderscheidend dark theme. De resterende problemen zijn **tactisch, niet structureel** — het fundament staat.

---

## 2.2 Resterende Problemen (Geprioriteerd)

### P1: Kritiek (Blokkeert marktlancering)

| # | Probleem | Impact | Root Cause | Effort |
|---|---------|--------|-----------|--------|
| 1 | **Geen e-signature op offertes** | Klanten moeten accepteren via link zonder juridische handtekening; elke concurrent biedt dit | Feature ontbreekt | Medium |
| 2 | **Client portal beperkt** | /q/[id] toont offerte maar klant kan niet reageren, wijzigen, of zelf betalen in een flow | Alleen read-only view gebouwd | Medium |

### P2: Belangrijk (Vermindert gebruikswaarde)

| # | Probleem | Impact | Root Cause | Effort |
|---|---------|--------|-----------|--------|
| 3 | **Integratie OAuth niet live** | Mollie/Moneybird/Google Calendar code bestaat maar env vars ontbreken in productie | Configuratie, geen code | Laag |
| 4 | **Geen guided tours per module** | Nieuwe gebruikers met 30+ pagina's raken verdwaald na onboarding wizard | Alleen initieel onboarding, geen per-module introductie | Medium |
| 5 | **Mobile touch niet overal optimaal** | Sommige pagina's (financien, boekhouding, instellingen) niet volledig touch-friendly | Desktop-first ontwikkeld | Medium |

### P3: Nice-to-have (Verbetert competitieve positie)

| # | Probleem | Impact | Root Cause | Effort |
|---|---------|--------|-----------|--------|
| 6 | **Geen video tutorials** | Gebruikers vragen om visuele hulp; PageHint is tekst-only | Content moet gemaakt worden | Laag-Medium |
| 7 | **Geen delivery management** | CaterZen en Flex hebben driver apps; BBQ Architect mist dit | Out of scope tot nu toe | Hoog |
| 8 | **Geen plattegrond/seating** | Caterease differentiator; relevant voor grote events | Nichefeature | Hoog |

---

## 2.3 Constraints

| Constraint | Impact | Mitigatie |
|-----------|--------|----------|
| **Solo developer** | Beperkte bandbreedte voor nieuwe features | Prioriteer quick wins, gebruik AI-tools voor development |
| **Nederlandse markt** | Kleinere markt dan US, maar minder concurrentie | Positioneer als "de Nederlandse catering-app" — geen concurrent biedt NL-native ervaring |
| **PWA (geen native app)** | Beperkingen in push notifications, camera, offline | PWA is steeds capabeler; focuseer op wat wel kan |
| **Supabase free tier** | Limieten op storage, bandwidth, realtime connections | Monitor usage; upgrade wanneer nodig |
| **Geen marketing budget** | Product moet zichzelf verkopen | AI-demo's, word-of-mouth, catering community |

---

## 2.4 Success Criteria

| Criterium | Meetbaar Doel | Huidige Status |
|-----------|--------------|----------------|
| Offerte-naar-betaling flow | Klant kan offerte ontvangen, accepteren met handtekening, en betalen zonder telefoontje | Deels (acceptatie via link, maar geen e-signature of betaalflow) |
| Nieuwe gebruiker productief | Eerste offerte verstuurd binnen 15 minuten na signup | Onboarding wizard aanwezig, maar geen module-specifieke guidance |
| Service mode bruikbaar | Chef kan volledige service draaien op tablet zonder training | Service mode werkt, maar nog niet getest op echte tablets |
| AI lost vragen op | 80%+ van gebruikersvragen beantwoord via AI zonder handmatige navigatie | AI heeft 40+ tools en page context; resolutie-rate onbekend |
| Integraties werkend | Mollie betaallinks, Moneybird sync, Google Calendar sync allemaal functioneel | Code bestaat, configuratie ontbreekt in productie |

---

## 2.5 Impact/Effort Prioritisatie

```
                        Impact
                    Laag ◄────────────────► Hoog

              Laag  │                    [3] OAuth config
                    │  [6] Video's       [4] Guided tours
           Effort   │
                    │                    [1] E-signature
              Hoog  │  [8] Plattegrond   [2] Client portal
                    │  [7] Delivery      [5] Mobile polish
                    └────────────────────────────
```

**Volgorde van aanpak:**
1. OAuth config activeren (laag effort, hoog impact)
2. E-signature + client portal (medium effort, hoogste impact)
3. Guided tours (medium effort, hoog impact)
4. Mobile polish (medium effort, hoog impact)
5. Video tutorials (laag effort, medium impact)
6. Delivery/plattegrond (hoog effort, optioneel)

---

# DEEL 3: UX Strategie

## 3.1 North Star Vision

> **"BBQ Architect is het donkere cockpit waar Nederlandse cateraars hun hele bedrijf runnen — van het eerste klantgesprek tot de laatste afwas — gestuurd door AI die meedenkt als een ervaren pitmaster."**

### Kernprincipes
1. **AI-first:** De AI-assistant is niet een feature maar de primaire interface
2. **Zero-friction:** Elke workflow moet in zo min mogelijk stappen
3. **Field-ready:** Bruikbaar op locatie met vuile handen en slecht internet
4. **Nederlandse DNA:** Gebouwd voor NL-markt met Mollie, Moneybird, BTW, NL taal

---

## 3.2 Strategische Pijlers

### Pijler 1: AI-First Operations (Core — Nu)
**Doel:** AI als de primaire manier om met het systeem te werken

| Wat | Status | Next Step |
|-----|--------|-----------|
| 40+ AI tools | Live | Uitbreiden met e-signature en client portal triggers |
| Page-contextual chips | Live (26 pagina's) | Toevoegen aan nieuwe pagina's |
| Floating assistant | Live | Conversation memory verbeteren |
| Cross-module context | Live | Financiele voorspellingen toevoegen |
| Command Palette | Live | Meer acties toevoegen |

**Competitive moat:** Geen enkele concurrent heeft vergelijkbare AI-diepte. CaterZen is de enige die AI ontwikkelt, maar focust op forecasting — niet op een volledige AI-assistent die het hele systeem kan bedienen.

### Pijler 2: Zero-Friction Workflow (Core — Nu)
**Doel:** Offerte -> Betaling in < 5 bewuste stappen

| Wat | Status | Next Step |
|-----|--------|-----------|
| SyncEngine (offerte->event->prep) | Live | Stabiliseren en testen |
| MenuWizard | Live | - |
| Auto prep tasks (-3,-2,-1) | Live | - |
| E-signature | Ontbreekt | **Implementeren (P1)** |
| Client self-service portal | Basis (/q/[id]) | **Uitbreiden met acceptatie + betaling (P1)** |
| Mollie betaallinks | Code klaar | **OAuth activeren (P1)** |

### Pijler 3: Field-Ready Mobile (Q2 2026)
**Doel:** Elke field-operatie (service, logistiek, HACCP) werkt foutloos op tablet/telefoon

| Wat | Status | Next Step |
|-----|--------|-----------|
| PWA + Service Worker | Live | - |
| BottomNav (mobile) | Live | - |
| Kitchen Mode | Live | - |
| Service Mode | Live | Tablet-optimalisatie testen |
| Offline indicator + sync | Live | - |
| Touch targets financien/boekhouding | Niet geoptimaliseerd | **Polish (P2)** |

### Pijler 4: Client Self-Service (Q2-Q3 2026)
**Doel:** Klanten kunnen zelf offertes bekijken, accepteren, en betalen

| Wat | Status | Next Step |
|-----|--------|-----------|
| Offerte-view (/q/[id]) | Live (read-only) | Uitbreiden met interactie |
| E-signature | Ontbreekt | Implementeren |
| Online betaling via link | Code klaar | Activeren met Mollie |
| Klantportaal (event details) | Ontbreekt | Overwegen voor Q3 |
| Feedback na event | Reflectie intern | Klant-facing versie overwegen |

### Pijler 5: Insight-Driven Growth (Q3-Q4 2026)
**Doel:** Automatische business intelligence die de cateraar slimmer maakt

| Wat | Status | Next Step |
|-----|--------|-----------|
| Dashboard KPIs | Live | AI-driven aanbevelingen uitbreiden |
| Financiele rapportages | Live | Trend voorspellingen toevoegen |
| Menu Engineering (ABC) | Live | AI-suggesties voor menu-optimalisatie |
| Seizoensanalyse | Basis nudges | Uitbreiden met historische data |
| Benchmarking | Ontbreekt | Anonieme branche-vergelijking |

---

## 3.3 Roadmap (Geprioriteerd)

### Sprint 1: Quick Wins (< 1 week per item)
- [ ] **Mollie OAuth activeren** — betaallinks functioneel maken
- [ ] **Moneybird OAuth activeren** — facturen automatisch syncen
- [ ] **Google Calendar OAuth activeren** — events naar agenda
- [ ] **Video tutorial links** toevoegen aan PageHint componenten (YouTube embeds)
- [ ] **/q/[id] route verbeteren** — duidelijkere offerte-presentatie voor klanten

### Sprint 2: Client Self-Service (2-4 weken)
- [ ] **E-signature component** — klant kan offerte digitaal ondertekenen
- [ ] **Betaalflow na acceptatie** — Mollie payment link automatisch na acceptatie
- [ ] **Klant notificaties** — email bevestiging bij acceptatie en betaling
- [ ] **Status tracking voor klant** — klant kan voortgang zien op /q/[id]

### Sprint 3: Onboarding & Guidance (1-2 weken)
- [ ] **Guided tour per module** — eerste keer dat gebruiker een pagina bezoekt
- [ ] **Contextual help uitbreiden** — meer PageHints op complexe pagina's
- [ ] **FAQ pagina uitbreiden** — veelgestelde vragen per module

### Sprint 4: Mobile Polish (2-3 weken)
- [ ] **Financien pagina** — responsive tabellen, touch-friendly filters
- [ ] **Boekhouding pagina** — kaarten in plaats van tabellen op mobile
- [ ] **Instellingen pagina** — mobile-friendly formulieren
- [ ] **Service mode** — tablet-specifieke optimalisaties testen

### Sprint 5: Intelligence (Doorlopend)
- [ ] **AI seizoensaanbevelingen** verbeteren met historische data
- [ ] **Financiele voorspellingen** op basis van confirmed events
- [ ] **Klant lifetime value** berekening in CRM
- [ ] **Automatische follow-up suggesties** voor herhaaldklanten

---

## 3.4 Competitive Moat Strategie

### Waar BBQ Architect onverslaanbaar is:

| Moat | Beschrijving | Hoe verdedigen |
|------|-------------|----------------|
| **AI-diepte** | 40+ tools, page-contextual chips, floating assistant met action execution | Blijven uitbreiden; geen concurrent kan dit inhalen zonder maanden werk |
| **Nederlandse DNA** | Mollie, Moneybird, BTW, NL taal, NL marktfocus | Geen internationale concurrent gaat zich op NL focussen |
| **End-to-end workflow** | Quote -> Event -> Prep -> Service -> Invoice -> Payment | SyncEngine verder automatiseren |
| **Dark cockpit design** | Uniek in catering markt; professionele uitstraling | Consistent doorvoeren in alle nieuwe features |
| **Vertical integration** | HACCP + uren + materieel + logistiek in dezelfde app | Concurrenten bieden dit alleen via externe tools |

### Waar concurrenten sterker zijn (en wat we ermee doen):

| Gap | Concurrent(en) | Actie |
|-----|----------------|-------|
| E-signature | CaterZen, Caterease, TPP, Flex | **Sprint 2: Implementeren** |
| Client portal | CaterZen, Caterease, Flex | **Sprint 2: Uitbreiden** |
| Driver app | CaterZen, Flex | **Parkeren** — niet core voor BBQ catering |
| Plattegronden | Caterease | **Parkeren** — niche feature |
| Native mobile app | Apicbase, Flex | **PWA verbeteren** — native niet nodig |
| Multi-unit management | Apicbase, CaterTrax | **Toekomst** — eerst single-unit perfectioneren |

---

## 3.5 Metrics & KPIs

### Product Metrics

| Metric | Doel | Baseline | Hoe Meten |
|--------|------|----------|-----------|
| Feature coverage score | 30/32 | 27/32 | Feature matrix review per kwartaal |
| UX quality score | 4.5/5 | 4.31/5 | Heuristic evaluation per kwartaal |
| Competitive ranking | #1 | #1 | Benchmark review per halfjaar |

### User Metrics (Na Lancering)

| Metric | Doel | Hoe Meten |
|--------|------|-----------|
| Time-to-first-quote | < 10 min | Supabase timestamp eerste offerte na signup |
| AI resolution rate | > 80% | % AI-chats die eindigen zonder page navigatie |
| Mobile task completion | > 90% | Service mode + logistiek tasks op tablet |
| Client self-service rate | > 60% | % offertes geaccepteerd via /q/[id] portal |
| Quote-to-invoice conversion | > 70% | Ratio geaccepteerde offertes / totaal |
| Weekly active usage | > 4 dagen/week | Supabase auth sessions per user |

### Business Metrics (Na Lancering)

| Metric | Doel | Hoe Meten |
|--------|------|-----------|
| Customer acquisition | 10 caterers in eerste 6 maanden | Signup tracking |
| Churn rate | < 5% per maand | Inactieve accounts na 30 dagen |
| NPS score | > 50 | In-app enquete per kwartaal |
| Feature request volume | Dalend over tijd | Support ticket analyse |

---

## 3.6 Markttrends & Aansluiting

### Trends 2025-2026 (Bron: marktonderzoek)

| Trend | Marktimpact | BBQ Architect Status |
|-------|------------|---------------------|
| **AI adoptie** | 78% restaurants plant AI voor 2027 (Deloitte) | **Voorloper** — 40+ AI tools live |
| **Cloud-first** | 68.5% marktaandeel cloud-based | **Volledig cloud** (Supabase + Vercel) |
| **Mobile-first** | Verwachting voor field operations | **PWA live** — polish nodig |
| **Self-service portals** | Klanten verwachten "Amazon-ervaring" | **Basis** — uitbreiding nodig |
| **E-signatures** | Post-COVID digitale workflows permanent | **Ontbreekt** — prioriteit |
| **Sustainability** | Waste tracking, portieoptimalisatie | **Deels** (voorraad + inkoop) |
| **Marktgroei** | 12-14% CAGR, $1B -> $2.8B tegen 2032 | **Goed gepositioneerd** |

### Conclusie

BBQ Architect v2 is het meest feature-complete en AI-geavanceerde catering management platform in de benchmark. De app scoort #1 op zowel feature coverage als UX kwaliteit. De resterende gaps zijn tactisch (e-signature, client portal, integratie-configuratie) en kunnen in 2-3 sprints worden opgelost. De AI-first strategie is de sterkste competitive moat — geen concurrent kan dit op korte termijn inhalen.

**Prioriteit 1:** Client self-service (e-signature + betaalflow)
**Prioriteit 2:** Integratie-activatie (OAuth config)
**Prioriteit 3:** Mobile polish + guided tours

Met deze drie priorities wordt BBQ Architect een volledig marktklaar product dat zich onderscheidt door AI-diepte, Nederlandse marktfocus, en een dark cockpit design dat geen concurrent biedt.
