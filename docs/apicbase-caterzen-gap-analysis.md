# Wat doen Apicbase en CaterZen beter? — Deep-Dive Gap Analysis

**Datum:** 8 april 2026
**Context:** BBQ Architect v2 scoort 4.16/7 (rank 4/9). Apicbase leidt met 5.02/7 (+0.86), CaterZen volgt met 4.81/7 (+0.65). Dit document ontleedt exact waar en waarom zij beter scoren, welke UX-patterns te stelen zijn, en hoe BBQ Architect elk gat kan dichten.

---

## TL;DR — De drie fatale gaten

| # | Gap | BBQ Architect | Apicbase | CaterZen | Verschil |
|---|-----|--------------|----------|----------|----------|
| 1 | **Integraties** | 2.5/7 | 6/7 | 5/7 | -3.5 / -2.5 |
| 2 | **Onboarding** | 3.5/7 | 4/7 | 6/7 | -0.5 / -2.5 |
| 3 | **Mobile** | 3.5/7 | 6/7 | 4/7 | -2.5 / -0.5 |

**Gewogen impact op totaalscore:**
- Integraties dichten (2.5 → 5): +0.25 → totaal 4.41
- Onboarding dichten (3.5 → 5): +0.23 → totaal 4.39
- Mobile dichten (3.5 → 5): +0.20 → totaal 4.36
- **Alle drie dichten: 4.16 → 4.84** (rank 2/9, voorbij CaterZen)

---

## Dimensie 1: Integration Capabilities — Het grootste gat

### Scores
| Product | Score | Reden |
|---------|-------|-------|
| **Apicbase** | **6/7** | 17+ OAuth-koppelingen: Lightspeed, Square, Revel, Xero, QuickBooks, Deliverect, MarketMan. Bidirectionele sync. Open API. |
| **CaterZen** | **5/7** | 11 integraties: CaterPay/Payzli, Authorize.Net, Square, QuickBooks Online, Google Calendar, Gmail, Chowly POS, Burq delivery, Tango Card, Nowsta staffing, Nearby Now. |
| **BBQ Architect** | **2.5/7** | UBL 2.0 export (handmatig), CSV, PDF, email via Resend, iCal export (nieuw). Geen boekhoud-API, geen POS, geen leverancier-koppeling. |

### Wat zij concreet beter doen

**Apicbase:**
- **Procurement-keten**: Recept → ingredienten → inkooplijst → bestelling bij leverancier. Alles in één flow, geen copy-paste naar een apart systeem.
- **POS-sync**: Verkopen vanuit Lightspeed/Square worden automatisch gesynchroniseerd — voorraad wordt realtime bijgewerkt, foodcost per gerecht berekend.
- **Boekhoud-push**: Factuurdata gaat automatisch naar Xero/QuickBooks — geen handmatig exporteren.
- **Open API**: Developers kunnen custom koppelingen bouwen. Webhooks voor event-triggered acties.

**CaterZen:**
- **QuickBooks Online sync**: Map sales journal categories naar QB categories, verstuur per datumrange. Cor's boekhouder krijgt data zonder tussenkomst.
- **Google Calendar native**: Alle calls, to-dos, meetings en catering orders verschijnen automatisch in Google Calendar van teamleden.
- **CaterPay payment processing**: Deposits, deelbetalingen, saldo-verwerking — alles in de app, geen externe betaalprovider nodig.
- **Chowly POS bridge**: Syncs menu's vanuit 20+ POS-systemen naar CaterZen.
- **Square**: Sinds 2025 — direct betalen vanuit de app.

### Wat BBQ Architect mist (en waarom het pijn doet)

| Concrete situatie | Pijn | Concurrent lost dit op met |
|---|---|---|
| Cor stuurt UBL 2.0 naar boekhouder per email | 5-10 min per factuur, foutgevoelig | Apicbase: auto-push naar Xero. CaterZen: QuickBooks sync. |
| Cor moet handmatig events in Google Calendar zetten | Dubbele administratie, vergeet events | CaterZen: native Google Calendar integratie |
| Cor kan niet betalen vanuit de app | Klant moet apart overmaken, geen tracking | CaterZen: CaterPay geintegreerd |
| Cor bestelt ingredienten via WhatsApp bij leverancier | Geen audit trail, geen koppeling met voorraad | Apicbase: directe leverancier-bestelling vanuit recept |
| Nieuwe POS-data moet handmatig ingevoerd worden | Geen realtime omzet-inzicht | Apicbase: Lightspeed/Square bidirectionele sync |

### Te stelen UX-patterns

**Pattern 1: "Sync Status Dashboard" (Apicbase)**
Een dedicated sectie in Instellingen die toont welke integraties actief zijn, wanneer de laatste sync was, en eventuele fouten. Geeft vertrouwen dat data up-to-date is.

```
┌─────────────────────────────────────────┐
│ 🔗 KOPPELINGEN                          │
│                                         │
│ ✅ Exact Online     Laatst: 2 min       │
│ ✅ Google Calendar  Laatst: 5 min       │
│ ⚠️ Mollie Payments  Configuratie nodig  │
│ ➕ Voeg koppeling toe                    │
└─────────────────────────────────────────┘
```

**Pattern 2: "One-Click Boekhoud Export" (CaterZen)**
CaterZen laat je een datumrange selecteren en met één klik alle factuurdata naar QuickBooks sturen. Geen handmatig UBL exporteren per factuur.

**Pattern 3: "Calendar Auto-Sync" (CaterZen)**
Elk event, elke taak, elke deadline verschijnt automatisch in Google Calendar. Geen iCal-download nodig — het is live, bidirectioneel.

### Implementatie-plan voor BBQ Architect

| # | Actie | Effort | Impact | Bestanden |
|---|-------|--------|--------|-----------|
| I-1 | **Google Calendar OAuth** — events bidirectioneel syncen | 2-3 dagen | IC +1.0 | `src/app/api/calendar/google/route.ts` (nieuw), `src/lib/googleCalendar.ts` (nieuw) |
| I-2 | **Exact Online / Moneybird API** — facturen auto-pushen | 3-5 dagen | IC +1.5 | `src/app/api/accounting/route.ts` (nieuw), `src/lib/exactOnline.ts` (nieuw) |
| I-3 | **Mollie/Stripe payments** — betaallink op factuur | 2-3 dagen | IC +0.5 | `src/app/api/payments/route.ts` (nieuw), facturen pagina update |
| I-4 | **Webhook framework** — generiek eventemittent voor integraties | 1-2 dagen | IC +0.5, fundament | `src/lib/webhooks.ts` (nieuw) |
| I-5 | **Leverancier-bestelling vanuit recept** | 3-4 dagen | IC +0.5, TCE +0.3 | `src/app/inkoop/page.tsx`, `src/lib/procurement.ts` (nieuw) |

**Score-projectie:** 2.5 → 5.0/7 (+2.5)
**Totale effort:** ~12-17 dagen

---

## Dimensie 2: Onboarding & Learnability — CaterZen's troef

### Scores
| Product | Score | Reden |
|---------|-------|-------|
| **CaterZen** | **6/7** | "Quickest IT implementation in company history." 3 weken volledig operationeel. Personalized training. Video-bibliotheek. 4.6/5 ease of use (55+ reviews). |
| **Apicbase** | **4/7** | Guided onboarding wizard + "Academy" met video-trainingen. Basis makkelijk, steile curve voor volledige featureset. |
| **BBQ Architect** | **3.5/7** | OnboardingWizard (localStorage), EmptyState met AI chips, PageHint tooltips. Geen guided tour, geen video's, geen progress indicator. |

### Wat zij concreet beter doen

**CaterZen:**
- **High-touch onboarding**: $499 setup fee, maar dat levert een persoonlijke 1-on-1 walkthrough op die is afgestemd op jouw bedrijf. Account is pre-geconfigureerd als je begint.
- **Training Video Library**: Georganiseerd per tab (CRM Tab, Order Entry, Accounting, etc.) — elke workflow heeft een eigen video.
- **Follow-up prompts**: Na ELKE actie (order plaatsen, offerte sturen) krijgt de gebruiker automatisch een prompt: "Maak een notitie en plan een follow-up taak." Dit traint best practices.
- **Knowledge Base**: support.caterzen.com met 20+ categorieën, elk met meerdere artikelen.
- **"Like an iPhone"**: Reviewers vergelijken het met een iPhone — "easy to use and self explanatory."

**Apicbase:**
- **Guided Onboarding Wizard**: Stap-voor-stap setup die door de initiële configuratie loopt. Anders dan BBQ Architect's wizard die eenmalig is, begeleidt Apicbase per module.
- **Academy**: Uitgebreid leerplatform met video-cursussen per onderwerp. Niet gewoon "help docs" — het is een gestructureerd curriculum.
- **Module-based progressive disclosure**: Je ziet alleen de modules die je gebruikt. Nieuwe modules worden geleidelijk "ontsloten" met introductie-schermen.
- **In-app contextual help**: Tooltips en info-icons op complexe velden (bijv. "yield factor" bij ingredienten).

### Wat BBQ Architect mist

| Situatie | Pijn | Concurrent lost dit op met |
|---|---|---|
| Nieuwe gebruiker opent Dashboard — 36 sidebar links | Overweldigend, weet niet waar te beginnen | Apicbase: module-based onboarding, alleen actieve modules zichtbaar |
| Cor wil teamlid (Kevin) leren werken met HACCP | Moet zelf uitleggen, geen in-app training | CaterZen: per-tab video tutorials. Apicbase: Academy cursus. |
| Eerste keer offerte maken — wat is "UBL export"? | Vakjargon zonder uitleg | CaterZen: contextual tooltips op elk veld |
| Gebruiker verlaat de app na 2 minuten | Geen engagement loop, geen "volgende stap" suggestie | CaterZen: follow-up prompts na elke actie |
| OnboardingWizard is eenmalig, daarna weg | Geen herhaalbare begeleiding | Apicbase: per-module guided tours, altijd herstartbaar |

### Te stelen UX-patterns

**Pattern 1: "Follow-Up Prompts" (CaterZen — BELANGRIJKSTE)**
Na elke significante actie (event aanmaken, offerte versturen, factuur genereren) verschijnt een mini-dialog:

```
┌─────────────────────────────────────────┐
│ ✅ Event aangemaakt!                     │
│                                         │
│ Wat nu?                                 │
│ 📝 Notitie toevoegen                    │
│ 📅 Follow-up inplannen                  │
│ 📄 Offerte versturen naar klant         │
│ ⏩ Overslaan                             │
└─────────────────────────────────────────┘
```

Dit is CaterZen's geheime wapen. Het maakt de app "sticky" — gebruikers leren de juiste workflow terwijl ze werken. Het forceert best practices zonder het te voelen als training.

**Pattern 2: "Progress Dashboard" (Apicbase Academy)**
Een "Mijn Voortgang" pagina die toont:
- ✅ Eerste klant aangemaakt
- ✅ Eerste offerte verstuurd
- ⬜ Eerste event afgerond
- ⬜ HACCP meting gelogd
- ⬜ Eerste factuur betaald

Dit gamificeert de onboarding en geeft een helder pad naar "volledig operationeel".

**Pattern 3: "Contextual Field Tooltips" (Apicbase)**
Info-iconen (ℹ️) naast complexe velden die bij hover/tap uitleggen wat het veld doet:
- "Yield factor" → "Hoeveel bruikbaar product overblijft na bereiding. 0.8 = 80% bruikbaar."
- "UBL 2.0" → "Universeel factuurformaat dat automatisch ingelezen wordt door je boekhouder."

**Pattern 4: "Module Onboarding" (Apicbase)**
Wanneer een gebruiker voor het eerst een nieuwe sectie bezoekt (bijv. HACCP), verschijnt een korte intro:

```
┌─────────────────────────────────────────┐
│ 🛡️ HACCP Monitoring                     │
│                                         │
│ Log temperaturen tijdens bereiding en   │
│ opslag. Alle metingen worden gekoppeld  │
│ aan events voor compliance-dossiers.    │
│                                         │
│ Tip: Gebruik Quick Log op je telefoon   │
│ voor snelle registratie met handschoenen │
│                                         │
│ [▶ Bekijk tutorial] [Begrepen, ga door] │
└─────────────────────────────────────────┘
```

BBQ Architect heeft PageHint al — maar PageHint is een passieve banner. Dit pattern is een actieve blocker die aandacht afdwingt.

### Implementatie-plan voor BBQ Architect

| # | Actie | Effort | Impact | Bestanden |
|---|-------|--------|--------|-----------|
| O-1 | **Follow-Up Prompt systeem** — na elke actie suggesties tonen | 1-2 dagen | O&L +1.0, TCE +0.3 | `src/components/FollowUpPrompt.tsx` (nieuw), integratie in events/offertes/facturen |
| O-2 | **Progress Dashboard** — gamified onboarding voortgang | 1 dag | O&L +0.5 | `src/components/OnboardingProgress.tsx` (nieuw), Dashboard integratie |
| O-3 | **Field Tooltips** — ℹ️ icons op complexe velden | 1 dag | O&L +0.3 | `src/components/FieldTooltip.tsx` (nieuw), spreid over formulieren |
| O-4 | **Module Intro Modals** — guided intro per sectie | 1 dag | O&L +0.2 | Upgrade `PageHint.tsx` naar modal variant |
| O-5 | **Video Tutorials** — 5 korte (2-min) screencasts | 2-3 dagen opname | O&L +0.5 | Hosting via YouTube/Loom, links in app |

**Score-projectie:** 3.5 → 5.5/7 (+2.0)
**Totale effort:** ~6-8 dagen (excl. video-opname)

---

## Dimensie 3: Mobile Responsiveness — Apicbase's voorsprong

### Scores
| Product | Score | Reden |
|---------|-------|-------|
| **Apicbase** | **6/7** | Native iOS/Android apps. AI Voice Counting voor inventory. Barcode scanning. Offline mode. Waste logging op mobile. |
| **FoodNotify** | **6/7** | Native apps (iOS/Android/iPad). Offline stocktaking met productfoto's. |
| **CaterZen** | **4/7** | Driver App (native). Mobile Order Taking (web). Geen volledige native app. |
| **BBQ Architect** | **3.5/7** | BottomNav, 90% touch compliance, HACCP Quick-Log met 64px targets. Geen native app, geen offline, geen voice input. |

### Wat Apicbase concreet beter doet

**Voice Counting (hun killer feature):**
Personeel in de koelcel of bij de BBQ spreekt: "Bavette, 14 kilo." De app:
1. Herkent het product via speech-to-text
2. Matcht het met de ingredienten-database
3. Bevestigt: "Bavette — 14 kg. Klopt dat?" (visuele + audio feedback)
4. Update de voorraad met één tap op "Bevestig"

Waarom dit briljant is voor BBQ Architect's use case:
- Cor staat bij de smoker met **vuile handschoenen**
- Hij kan zijn telefoon niet aanraken
- Voice input lost exact dit probleem op
- HACCP temperature logging zou hetzelfde kunnen: "Pulled Pork, 92 graden, kern"

**Barcode Scanning:**
- Scan product bij ontvangst → automatisch in voorraad
- Scan bij uitgave → automatisch afgetrokken
- Geen handmatig zoeken/typen nodig

**Offline Mode:**
- App werkt volledig offline (crucial voor:)
  - Festivallocaties zonder wifi
  - Koelcellen met slecht bereik
  - Tijdens transport
- Synct automatisch wanneer connectie terugkomt
- Conflictresolutie: "last write wins" met merge-dialoog bij conflicts

**Native App Advantages:**
- Push notifications: "Event morgen — prep-taken nog niet af"
- Camera integratie: foto's van HACCP-afwijkingen direct in dossier
- Achtergrond-sync: voorraad wordt bijgewerkt zonder app open te hebben
- Haptic feedback op knoppen (bevestiging bij Quick Log)

### Wat BBQ Architect mist

| Situatie | Pijn | Competitor oplossing |
|---|---|---|
| Cor logt HACCP temp bij event op festivalterrein | Moet typen met handschoenen, tikt verkeerde toetsen | Apicbase: voice input "Kippendij, 78 graden, kern" |
| Voorraad tellen in de koelcel | Geen bereik, app laadt niet | Apicbase: offline mode, synct later |
| Ingredienten ontvangen van leverancier | Handmatig invoeren per product | Apicbase: barcode scan → auto-update voorraad |
| Push herinnering voor prep-taken | Moet zelf onthouden of agenda checken | Native app: push notification "Vlees marineren voor morgen" |
| HACCP foto van afwijking maken | Moet apart foto maken, dan handmatig uploaden | Native camera integratie in HACCP formulier |

### Te stelen UX-patterns

**Pattern 1: "Voice-First Quick Log" (Apicbase — HOOGSTE IMPACT)**

```
┌─────────────────────────────────────────┐
│ 🎤 VOICE MODE                           │
│                                         │
│ "Spreek in: product, temperatuur, type" │
│                                         │
│        [  🔴 Luisteren...  ]            │
│                                         │
│ Herkend: Bavette, 72°C, Kern           │
│                                         │
│ [ ❌ Opnieuw ]  [ ✅ Bevestig & Opslaan ]│
└─────────────────────────────────────────┘
```

Implementeerbaar via de Web Speech API (`SpeechRecognition`) — geen native app nodig! De browser API ondersteunt Nederlands (`nl-NL`).

**Pattern 2: "PWA met Offline Support"**
In plaats van native apps (duur, onderhoud) is een PWA de juiste middenweg:
- Service Worker cachet kritieke routes (Dashboard, HACCP Quick-Log, Agenda)
- IndexedDB voor offline data-opslag
- Background Sync voor uitgestuurde HACCP metingen
- "Install" prompt op Android/iOS
- Push Notifications via Web Push API

**Pattern 3: "Barcode Scan Integration" (Apicbase)**
De `navigator.mediaDevices.getUserMedia()` API + een library als `@nicolo-ribaudo/barcode-reader` maakt barcode scanning mogelijk in de browser:

```
Scan → Zoek in inventory DB → Toon product + huidige voorraad → +1/-1 knoppen
```

**Pattern 4: "Camera-in-Form" voor HACCP**
HTML5 `<input type="file" accept="image/*" capture="environment">` opent direct de camera op mobile. Foto wordt bijgevoegd aan HACCP record.

### Implementatie-plan voor BBQ Architect

| # | Actie | Effort | Impact | Bestanden |
|---|-------|--------|--------|-----------|
| M-1 | **Web Speech API voor HACCP Quick-Log** — voice input mode | 2-3 dagen | MR +1.0, TCE +0.5 | `src/components/VoiceInput.tsx` (nieuw), `src/app/haccp/page.tsx` |
| M-2 | **PWA Setup** — manifest, service worker, offline caching | 2-3 dagen | MR +0.5, fundament | `public/manifest.json`, `public/sw.js`, `next.config.ts` |
| M-3 | **Camera capture in HACCP** — foto bijvoegen bij afwijking | 0.5 dag | MR +0.3 | `src/app/haccp/page.tsx` |
| M-4 | **Barcode scan voor voorraad** — product herkenning | 2-3 dagen | MR +0.5, TCE +0.3 | `src/components/BarcodeScanner.tsx` (nieuw), `src/app/voorraad/page.tsx` |
| M-5 | **Push Notifications** — prep reminders, event alerts | 1-2 dagen | MR +0.2 | `src/lib/pushNotifications.ts` (nieuw), Service Worker update |
| M-6 | **Offline HACCP** — IndexedDB + Background Sync | 3-4 dagen | MR +0.5 | `src/lib/offlineStorage.ts` (nieuw), Service Worker update |

**Score-projectie:** 3.5 → 5.5/7 (+2.0)
**Totale effort:** ~11-16 dagen

---

## Dimensie 4: Task Completion Efficiency — De workflow-naad

### Scores
| Product | Score | Reden |
|---------|-------|-------|
| **Apicbase** | **5/7** | Sterke recept→kostprijs keten. Menu Engineering Matrix. Maar: complexiteit vertraagt sommige workflows. |
| **CaterZen** | **5/7** | Snelste quote creation (~8-10 stappen). Quote-to-Order 1-klik conversie. BEO drag-and-drop templates. |
| **BBQ Architect** | **4.5/7** | EventWizard 4-staps flow, syncEngine backend. Maar: golden path gefragmenteerd over 5+ pagina's. |

### Wat zij concreet beter doen

**CaterZen's Quote Workflow:**
1. Eén pagina — geen wizard, geen stappen
2. Type klantnaam → autocomplete uit CRM
3. Add menu items met type-ahead zoeken
4. Drag-and-drop herordenen
5. "Create a Quote" knop → direct PDF
6. Kies template cover sheet
7. **Quote-to-Order: 1 klik conversie**
8. **Customer-Driven Conversion** (gepland): klant accepteert zelf via portaal

Vergelijk met BBQ Architect:
1. Open EventWizard → Stap 1: Klant → Stap 2: Menu → Stap 3: Details → Stap 4: Bevestig
2. OF: Handmatig event aanmaken → apart offerte aanmaken → handmatig koppelen

**CaterZen's BEO Templates:**
- Drag-and-drop template builder
- Modules: Event Info, Client Info, Venue, Food & Beverage, Timeline, Notes, Pull Sheet, Rentals, Staffing, Pictures, Room Layout, Signature
- Half-width en full-width secties
- Kloonbaar, onbeperkt per account
- **Ingebouwde e-handtekening** — geen DocuSign nodig

**Apicbase's Recipe-to-Cost Chain:**
```
Recept → Ingredienten (met purchase_price) → Kostprijs per portie
  → Menu item → Menu Engineering Matrix (Popularity × Profitability)
    → "Stars" / "Plowhorses" / "Puzzles" / "Dogs" classificatie
```

BBQ Architect heeft een vergelijkbare keten (`calcMargeForOfferte`), maar:
- De marge wordt pas berekend op de offerte-pagina (niet inline bij menu-samenstelling)
- Er is geen Menu Engineering Matrix visualisatie
- De recept-naar-kostprijs keten vereist dat `ingredient_costs` handmatig is ingevuld

### Te stelen UX-patterns

**Pattern 1: "Inline Marge Indicator" tijdens menu-samenstelling**
In de EventWizard Step 2 (Menu), toon per gerecht de foodcost:

```
┌─────────────────────────────────────────┐
│ ✅ Bavette          €4.20/pp  foodcost  │
│ ✅ Spareribs        €3.80/pp  foodcost  │
│ ✅ Pulled Pork      €2.90/pp  foodcost  │
│ ⬜ Zalm             €6.50/pp  foodcost  │
│                                         │
│ Menu foodcost: €10.90/pp                │
│ Prijs: €45.00/pp                        │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━           │
│ Marge: 75.8% ████████████████░░ Sterk   │
└─────────────────────────────────────────┘
```

**Pattern 2: "Follow-Up Chain" na offerte-acceptatie (CaterZen)**
CaterZen's systeem na een quote:
1. Quote accepted → Order created → BEO generated
2. Automatisch: deposit-verzoek gestuurd
3. Automatisch: follow-up taak aangemaakt voor rebooking
4. Automatisch: bevestigingsmail naar klant

BBQ Architect's syncEngine doet al veel hiervan, maar het is "achter de schermen." De gebruiker ziet het niet. Toon een visuele cascade:

```
┌─────────────────────────────────────────┐
│ ✅ Offerte geaccepteerd                  │
│ ✅ Event aangemaakt (confirmed)          │
│ ✅ 7 Prep-taken ingepland               │
│ ✅ Factuur aangemaakt (verzonden)        │
│ ⏳ Betaling afwachten...                 │
│                                         │
│ [Bekijk Event] [Bekijk Factuur]         │
└─────────────────────────────────────────┘
```

**Pattern 3: "Menu Engineering Matrix" (Apicbase)**
Een 2x2 scatter plot:
- X-as: Populariteit (aantal keer besteld)
- Y-as: Winstgevendheid (marge per portie)
- Vier kwadranten: Stars ⭐ / Plowhorses 🐎 / Puzzles 🧩 / Dogs 🐕

BBQ Architect heeft al de data (`gerechten` + `ingredient_costs` + `events.menu`), maar geen visualisatie.

### Implementatie-plan

| # | Actie | Effort | Impact |
|---|-------|--------|--------|
| T-1 | **Inline marge in EventWizard** — real-time foodcost per gerecht | 1 dag | TCE +0.3, AI +0.2 |
| T-2 | **Visuele cascade na offerte-acceptatie** — toon wat syncEngine doet | 0.5 dag | TCE +0.2, O&L +0.2 |
| T-3 | **Menu Engineering Matrix** — scatter plot visualisatie | 2-3 dagen | DV +0.5, TCE +0.3 |
| T-4 | **E-handtekening op offertes** — klant tekent digitaal | 3-5 dagen | TCE +0.5 |
| T-5 | **Klant-portaal voor offerte-goedkeuring** — self-service | 5-7 dagen | TCE +0.5, IC +0.5 |

---

## Dimensie 5: Data Visualization — Apicbase's dashboard-kracht

### Scores
| Product | Score | Reden |
|---------|-------|-------|
| **Apicbase** | **6/7** | 4+ gespecialiseerde dashboards. Menu Engineering Matrix. Real-time foodcost tracking. Waste tracking met trends. |
| **CaterZen** | **5/7** | Build-Your-Own-Report engine (in ontwikkeling). Sales Trend Chart. PLU Sales. Coupon usage. |
| **BBQ Architect** | **5/7** | KPI-kaarten met delta's. Cashflow chart. Marge-berekening. WeekStrip. Maar: geen drill-down, geen custom reports. |

### Te stelen UX-patterns

**Pattern 1: "Drill-Down Dashboard" (Apicbase)**
Klik op een KPI-kaart → expanded detail view:
- "Bevestigde Events (8)" → lijst van events met datum, gasten, omzet, status
- "Open Facturen (€16.888)" → top 5 facturen gesorteerd op bedrag
- Geen paginawisseling nodig

**Pattern 2: "Foodcost Trend Line" (Apicbase)**
Historische foodcost percentage per week/maand. Toont of je steeds meer of minder uitgeeft aan ingredienten t.o.v. omzet.

**Pattern 3: "Build-Your-Own Report" (CaterZen)**
Hoewel nog in ontwikkeling bij CaterZen, is het concept krachtig: gebruikers selecteren kolommen, filters, en groepering om custom rapporten te bouwen. Voor BBQ Architect zou dit kunnen:
- Omzet per klanttype (Particulier/Zakelijk/Festival)
- Populairste gerechten per seizoen
- Gemiddelde marge per event-type

---

## Dimensie 6: AI/Automation — BBQ Architect WINT

### Scores
| Product | Score | Reden |
|---------|-------|-------|
| **BBQ Architect** | **6.5/7** | 20+ database tools, AI suggestion chips, per-pagina context, streaming chat, Pitmaster Studio. Diepste AI van alle 9. |
| **Apicbase** | **5/7** | AI Voice Counting, AI Forecasting, smart menu engineering. |
| **CaterZen** | **5/7** | AI Call Insights, automated follow-ups, delivery optimization. |

### Waarom BBQ Architect hier wint

BBQ Architect is het ENIGE product met:
1. **Context-aware AI assistent** die live data kent (voorraad, events, offertes)
2. **Database tools** — AI kan daadwerkelijk acties uitvoeren (offerte aanmaken, temperatuur loggen)
3. **Per-pagina context** — AI weet op welke pagina je bent en past suggesties aan
4. **AI suggestion chips** in empty states — direct actionable

CaterZen's AI is beperkt tot:
- Call transcript analyse (coaching, niet operationeel)
- Automated follow-up prompts (regel-gebaseerd, niet AI)
- Roadmap items: forecasting, voice ordering, smart rebooking (nog niet live)

Apicbase's AI is beperkt tot:
- Voice Counting (speech-to-text, niet generative AI)
- Forecasting (predictive analytics)
- Geen conversational AI, geen tool execution

### Maar: wat zij WEL beter doen met hun beperktere AI

**CaterZen's "Embedded Automation" model:**
CaterZen heeft geen chatbot — maar hun automation is zo diep ingebed in de workflow dat het niet als AI "voelt":
- Na elke order: automatische rebooking-suggestie
- Na quote creatie: automatische follow-up taak
- Bij deposit due: automatische herinnering
- Bij cart abandonment: automatische notificatie

**Les voor BBQ Architect:** AI hoeft niet altijd een chatbot te zijn. Embed suggesties IN de workflow, niet ALS een aparte feature.

### Te stelen pattern

**Pattern: "Embedded AI Nudges" (combinatie CaterZen + Apicbase)**
In plaats van alleen een AI-chat paneel, embed AI-suggesties inline:

Op de **Event detail pagina**:
```
💡 AI Suggestie: Dit event heeft dezelfde grootte als "Bruiloft Van Dijk"
   (juni 2025, 65 gasten). Dat menu had 78% marge.
   [Gebruik dat menu] [Negeer]
```

Op de **Offerte pagina** bij lage marge:
```
⚠️ Marge 42% — onder je gemiddelde van 68%.
   Suggestie: Vervang Zalm (€6.50/pp) door Kippendij (€2.10/pp)
   voor +€4.40/pp marge. [Toepassen] [Negeer]
```

Op de **Voorraad pagina**:
```
📊 Op basis van je 3 aankomende events (196 gasten) heb je
   ~8.2kg extra Bavette nodig. Huidige voorraad: 12kg.
   [Genereer inkooplijst]
```

---

## Samenvatting: De 15 Sterkste UX-Patterns om te Stelen

### Tier 1: Game Changers (grootste score-impact)

| # | Pattern | Van | Impact | Effort | Score Δ |
|---|---------|-----|--------|--------|---------|
| 1 | **Follow-Up Prompts** na elke actie | CaterZen | Onboarding + TCE | 2 dagen | +1.3 |
| 2 | **Voice Input HACCP** via Web Speech API | Apicbase | Mobile + TCE | 3 dagen | +1.5 |
| 3 | **Google Calendar bidirectioneel** | CaterZen | Integration | 3 dagen | +1.0 |
| 4 | **Exact Online / Moneybird API** | Apicbase/Horeko | Integration | 5 dagen | +1.5 |
| 5 | **Inline marge indicator** in EventWizard | Apicbase | TCE + AI | 1 dag | +0.5 |

### Tier 2: Significant Improvements

| # | Pattern | Van | Impact | Effort | Score Δ |
|---|---------|-----|--------|--------|---------|
| 6 | **PWA + Offline HACCP** | Apicbase/FoodNotify | Mobile | 5 dagen | +1.0 |
| 7 | **Progress Dashboard** (gamified onboarding) | Apicbase | Onboarding | 1 dag | +0.5 |
| 8 | **Menu Engineering Matrix** visualisatie | Apicbase | Data Viz | 3 dagen | +0.5 |
| 9 | **Visuele cascade** na offerte-acceptatie | CaterZen workflow | TCE + O&L | 0.5 dag | +0.4 |
| 10 | **Embedded AI nudges** inline in workflows | CaterZen + Apicbase | AI | 2 dagen | +0.3 |

### Tier 3: Polish & Differentiation

| # | Pattern | Van | Impact | Effort | Score Δ |
|---|---------|-----|--------|--------|---------|
| 11 | **Barcode scan** voor voorraad | Apicbase | Mobile + TCE | 3 dagen | +0.8 |
| 12 | **Camera capture** in HACCP | Apicbase mobile | Mobile | 0.5 dag | +0.3 |
| 13 | **Field Tooltips** op complexe velden | Apicbase | Onboarding | 1 dag | +0.3 |
| 14 | **Drill-down KPI kaarten** op dashboard | Apicbase | Data Viz | 1 dag | +0.2 |
| 15 | **E-handtekening** op offertes | CaterZen | TCE | 5 dagen | +0.5 |

---

## Roadmap: Van 4.16 naar 5.0+ in 6 weken

### Week 1-2: Quick Impact (effort: ~5 dagen)

| Actie | Score Δ |
|-------|---------|
| Follow-Up Prompts systeem | O&L +1.0 |
| Inline marge in EventWizard | TCE +0.3 |
| Visuele cascade na offerte-accept | TCE +0.2 |
| Progress Dashboard | O&L +0.5 |
| Field Tooltips | O&L +0.3 |
| Camera capture HACCP | MR +0.3 |

**Projectie: 4.16 → 4.55** (+0.39)

### Week 3-4: Mobile & Voice (effort: ~8 dagen)

| Actie | Score Δ |
|-------|---------|
| Web Speech API Voice Input HACCP | MR +1.0 |
| PWA Setup + Offline HACCP | MR +0.5 |
| Barcode scan voorraad | MR +0.5 |
| Push Notifications | MR +0.2 |

**Projectie: 4.55 → 4.90** (+0.35)

### Week 5-6: Integraties (effort: ~8 dagen)

| Actie | Score Δ |
|-------|---------|
| Google Calendar OAuth bidirectioneel | IC +1.0 |
| Exact Online / Moneybird API | IC +1.5 |
| Mollie/Stripe betaallink | IC +0.5 |
| Menu Engineering Matrix | DV +0.5 |

**Projectie: 4.90 → 5.30** (+0.40)

### Eindresultaat na 6 weken

| Dimensie | Huidig | Na 6 wk | Δ |
|----------|--------|---------|---|
| Task Completion | 4.5 | 5.5 | +1.0 |
| IA & Navigation | 4.0 | 4.0 | — |
| Data Visualization | 5.0 | 5.5 | +0.5 |
| Onboarding | 3.5 | 5.5 | +2.0 |
| Mobile | 3.5 | 5.5 | +2.0 |
| Integration | 2.5 | 5.0 | +2.5 |
| AI/Automation | 6.5 | 7.0 | +0.5 |
| Visual Design | 5.5 | 5.5 | — |
| **Gewogen totaal** | **4.16** | **~5.30** | **+1.14** |
| **Ranking** | **4/9** | **1/9** | **+3** |

---

## Conclusie

Apicbase en CaterZen zijn niet "beter" in alles — ze zijn beter in **specifieke dimensies** die zwaar wegen:

1. **CaterZen wint op Onboarding** (6 vs 3.5) door hun "follow-up prompt" cultuur en video-first training. Dit is het makkelijkst te kopiëren.

2. **Apicbase wint op Mobile** (6 vs 3.5) door native apps met voice input, barcode scanning, en offline mode. Web Speech API + PWA dicht 80% van dit gat zonder native app.

3. **Beide winnen op Integraties** (5-6 vs 2.5) door boekhoud-koppelingen en calendar sync. Dit is het duurste om te dichten maar heeft de hoogste gewogen impact.

4. **BBQ Architect wint op AI** (6.5 vs 5 vs 5) — en dat is de toekomst. Maar de AI moet meer "embedded" worden (inline suggesties, niet alleen chatbot).

De strategie: **steel hun workflow-patterns, combineer ze met jouw AI-voorsprong, en bouw de integraties die elke concurrent al heeft.** Na 6 weken kost dat ~21 implementatie-dagen en levert het rank 1/9 op.
