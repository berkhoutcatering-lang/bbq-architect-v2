# Volledige app-test BBQ Architect — campagnerapport (2026-06-12)

> Status: **in uitvoering** — wordt per fase aangevuld. Bevindingen-IDs: P0 = dagelijks werk geblokkeerd of geld-fout, P1 = werkt-maar-frustreert, P2 = polish.
> Testomgeving: lokale dev-server tegen live Supabase, ingelogd als berkhout.catering@gmail.com (afgesproken met Mathijs). Alle testdata met `[TEST]`-prefix, opruimregister onderaan.

## Fase 0 — Baseline ✅
- `npm test`: **540/540 groen** (27 bestanden, 760ms)
- Dev-server + login werken

## Fase 1 — Inklok-bug ✅ OPGELOST
Zie [2026-06-12-inklok-bug.md](2026-06-12-inklok-bug.md). Kern: audit-logboek-constraint blokkeerde elke inklok/uitklok sinds eind mei; 4 migraties overschreven elkaars waardenlijst. Live gefixt + geverifieerd op telefoonformaat. UI-foutmelding nu mensentaal.

## Fase 2 — Golden Flow (lead → offerte → portal → event → KDS → factuur) ✅ doorlopen, 2 P0's onderweg gefixt

### Wat werkt (geverifieerd met database-bewijs)
- Publiek aanvraagformulier `/aanvraag/hop-en-bites`: white-label, honeypot-spambeveiliging, nette bevestiging → lead #12 in pijplijn-kanban met juiste KPI's
- Lead-drawer (rechts, consistent patroon) met AI-concept-menu: **inhoudelijk sterk** — gegrond in eigen gerechten, respecteerde "3x vegetarisch" uit het klantbericht, adviesprijs €41,70 pp
- Lead → wizard-handoff: velden voor-ingevuld, leadstatus auto naar "offerte"
- AI Offerte Wizard → offerte OFF-2026-011 opgeslagen (na fixes hieronder)
- Klantportal `/q/[token]`: koud bereikbaar zonder login (geverifieerd met curl), prachtig vormgegeven, e-sign met handtekening-canvas + akkoord + iDEAL-bankkeuze
- Acceptatie-keten vuurt volledig automatisch: offerte → geaccepteerd, event #53 aangemaakt (juiste datum/gasten/status), factuur F2026-015 aangemaakt
- KDS service-bord V2 rendert: 6 tafels auto uit 60 gasten, gangen-tijdlijn, kookkaarten, console schoon

### P0's GEVONDEN ÉN GEFIXT tijdens de test
| ID | Wat | Oorzaak | Fix |
|---|---|---|---|
| P0-WIZARD-01 | AI-wizard faalde met "AI antwoord te lang" na 2 min wachten | `max_tokens` 8000 te krap: menu-antwoord is 7-10k tokens (gemeten 7442) | [recipe-generate/route.ts](../../src/app/api/recipe-generate/route.ts): limiet → 16000, eerlijke foutmelding, AI-cap-schatting €0,15 → €0,25 |
| P0-WIZARD-02 | Wizard-opslaan stilletjes geweigerd: "row-level security" | Insert zónder `organization_id` (offerte én nieuwe gerechten) | [AiOfferteWizard.tsx](../../src/components/AiOfferteWizard.tsx): `useOrg()` + organization_id in beide payloads + nette guard |
| P0-WIZARD-03 | Daarna: "duplicate key offertes_org_nummer_unique" | Nummer = count+1 → botst zodra ooit een offerte is verwijderd (verklaart ook bestaande "OFF-2026-002 (dup-4)" duplicaten) | Zelfde bestand: hoogste bestaand volgnummer + 1 i.p.v. tellen |
| P0-HELP-01 | `/api/help/contextual` deed op **elke pagina-load** een query op niet-bestaande kolom `related_pages` → continue Postgres-errors sinds launch; feature werkte nooit | Code/schema-drift: live tabel heet `page_path` | [help/contextual/route.ts](../../src/app/api/help/contextual/route.ts) omgezet naar `page_path` (15 artikelen, 4 met pad) |

### ⚠️ HET structurele probleem (P0-DATA-01, nog te fixen — ontwerp-ingreep)
**Wizard-offertes hebben lege `items[]`** (menu zit alleen in `menu_selectie` als tekst, prijs alleen in `basis_prijs_pp`). Eén oorzaak, vier schades:
1. Portal rekent aanbetaling uit items → klant zag **"Aanbetaling (30%): € 0,00"** en kon accepteren zonder te betalen ("je datum staat vast")
2. Event-hub toont **OMZET € 0** en **"SALDO € 0 — Volledig betaald"** voor een offerte van ~€2.190 (gevaarlijk misleidend)
3. Menu komt niet door naar keuken: hub zegt "geen menukaart / nog geen menu", prep 0 taken
4. Factuur F2026-015 zal ook 0 regels hebben
**Richting fix:** wizard moet volwaardige offerte-regels (`items[]` met naam/aantal/prijs/btw-categorie per gang) wegschrijven, niet alleen `menu_selectie`. Portal/hub/factuur lezen dan vanzelf de juiste bedragen. Geschat: M (1 dagdeel, raakt wizard-payload + niets anders — consumers lezen items al).

### P1-bevindingen Golden Flow
| ID | Wat | Bewijs |
|---|---|---|
| P1-AI-01 | AI-menu-generatie duurt **108–130 seconden** (doel <8s); twee keer hetzelfde werk: lead-drawer genereert menu, wizard genereert opnieuw (dubbele kosten + wachttijd); "Gebruik in offerte" neemt het menu niet mee | Server-log: `total=108225ms tokens=2270in/7442out`; UI belooft "30–60 seconden" |
| P1-AI-02 | Schema eist volledige receptuur (ingrediënten + 6-12 stappen) per menugerecht terwijl gerechten al in de bibliotheek staan → antwoord 5× groter dan nodig = 5× trager | MENU_SCHEMA_PROMPT in recipe-generate/route.ts:78 |
| P1-ECO-01 | Eco-score factor ~100 te hoog: "374,7 kg CO₂e per portie / 22.479 kg totaal" voor 60-persoons BBQ (realistisch: 3-5 kg pp) — ondermijnt datavertrouwen | Wizard stap 2, CarbonScoreCard |
| P1-KDS-01 | Rook pitmaster-coach op het service-bord krijgt geen event-context ("Geen event-data ontvangen — selecteer event in hub-view") terwijl je óp het bord van event #53 staat | Screenshot KDS, 3 coach-berichten |
| P1-NUM-01 | Bestaande data heeft al dubbele offertenummers (2× OFF-2026-002, "(dup-4)"-suffix) — opschonen + uniciteit bewaken | Offerte-lijst + DB |
| P1-LEAD-01 | Wizard-handoff neemt "waarvan vega" niet over uit lead (bericht zei 3x vega; veld bleef 0) | Wizard stap 1 na handoff |

### P2-bevindingen Golden Flow
- P2-LEAD-02: leadformulier scrollt niet naar de foutmelding bij mislukte verzending (akkoord-checkbox onder de vouw → "knop doet niks"-gevoel)
- P2-PORTAL-01: handtekening-canvas meet alleen bij openen; bij draaien/resizen van het scherm klopt het tekenvlak niet meer
- P2-PORTAL-02: `/api/q/[id]` bestaat maar is niet publiek én wordt nergens gebruikt (portal gebruikt `/api/public-offerte/[token]`) — dode route, verwarrend
- P2-KDS-02: coach behandelt event over 64 dagen alsof het vandaag draait ("starttijd 17:00 was 17 min geleden — start mise nu") — tijdslogica negeert event-datum
- P2-AI-03: Citations staan aan op menu-mode maar leveren 0 citaties (wel latency/kosten); `inspired_by`-veld doet het werk al
- P2-LOG-01: floor-plan get-or-create racet bewust (23505 + refetch, werkt) maar vervuilt de Postgres-error-logs — overweeg upsert
- P2-PERF-01: ai_usage-cap-check (HEAD-query) vuurt meermaals per pagina en wordt steeds afgebroken (ERR_ABORTED) — ruis + onnodige queries

## Opruimregister (test-data in live org)
| Tabel | ID | Omschrijving | Status |
|---|---|---|---|
| time_logs | 28 | proef-inklok | ✅ verwijderd |
| audit_log | record_table='time_logs' | proef-audit-regels | ✅ verwijderd |
| leads | 12 | [TEST] Golden Flow Tester | ⏳ opruimen in Fase 7 |
| offertes | 40 | OFF-2026-011 [TEST] | ⏳ opruimen in Fase 7 |
| events | 53 | Offerte: [TEST] Golden Flow Tester | ⏳ opruimen in Fase 7 |
| facturen | 38 | F2026-015 | ⏳ opruimen in Fase 7 |
| gerechten | — | geen nieuwe aangemaakt (alles matchte bibliotheek) | n.v.t. |
| klanten | — | geen aangemaakt door lead | n.v.t. |

## AI-verbruik tijdens test
4× recipe-generate (menu-modus, Sonnet 4.6): 1× lead-menu ✅, 1× wizard-fail, 2× wizard ✅ — ±€0,90 totaal.

## Fase 3 — Hub-voor-hub DEEP ✅ (Vandaag, Klanten, Gerechten, Agenda, Financiën; Offertes/Events/KDS/Uren in F1-F2)

### P0 GEVONDEN ÉN GEFIXT
| ID | Wat | Fix |
|---|---|---|
| P0-KLANT-01 | **Nieuwe klant aanmaken was kapot**: Server Action insert zonder `organization_id` → RLS-weigering. Toast toonde rauwe Engelse DB-tekst, kort. | [klanten/actions.ts](../../src/app/klanten/actions.ts): membership-lookup + organization_id in insert. CRUD-cyclus (maken → lijst → verwijderen mét bevestigdialoog) daarna groen geverifieerd. |

⚠️ Dit is de **derde** RLS-insert-bug vandaag (wizard-offertes, wizard-gerechten, klanten). Achtergrond-sweep over alle insert/upsert-plekken loopt — resultaat in Fase 4-sectie.

### Het rode draad-thema: vier schermen, vier omzetcijfers (P1-DATA-02)
| Scherm | Cijfer |
|---|---|
| Vandaag · omzet-mix juni | "Nog geen omzet deze maand" |
| Vandaag · 6-maands-grafiek | JUN € 2.250 |
| Agenda · pipeline 30d | € 4.954,08 |
| Financiën · Copilot | € 22.561 YTD (kan kloppen, maar met "€0 foodcost / 99,9% marge" erbij) |
Elke widget rekent zelf (facturen vs offertes vs events, betaald vs bevestigd). Sam/Lars kan nergens op vertrouwen. **Fix-richting:** één omzet-definitie-helper (bevestigd/gefactureerd/betaald als expliciete labels) die álle widgets gebruiken — en label het cijfer ("bevestigde omzet", "betaalde omzet").

### Overige bevindingen Fase 3
| ID | Sev | Wat |
|---|---|---|
| P1-GERECHT-01 | P1 | Gerechten-lijst toont per gerecht "€ 0,00 / 0%" (verkoopprijs die niemand invult) terwijl kostprijs wél bestaat — kolom is nu ruis; toon kostprijs of verberg lege kolom |
| P2-VANDAAG-02 | P2 | Status-badge "CONFIRMED" (Engels) op volgend-event-kaart in verder NL scherm |
| — | ✅ | Dagbriefing is kosten-bewust gebouwd: Haiku + prompt-cache + client-cache op inhoud-hash (compliment, geen finding) |
| — | ✅ | Financiën: AI-budgetmeter zichtbaar (€10,29/€15), BTW-doorverwijs-regel expliciet, Copilot signaleert zelf data-gaten |
| — | ✅ | Klanten: verwijderen heeft nette bevestigingsdialoog; follow-up-acties na aanmaken (offerte/event) zijn goed UX-patroon |
| — | ✅ | Agenda: live KPI's + conflict-detectie renderen; [TEST]-event verschijnt correct in kalender |

## Fase 4 — Smoke-test long tail ✅ + DE GROTE VONDST

### Route-sweep
**44 routes getest, allemaal HTTP 200**, geen 500-ers: bonnen, archief, facturen, leveranciers, haccp, prep-counter, logistiek, marges, materieel, mailbox, price-intelligence, klantgesprek, instellingen (+ai-usage/integraties), hulp, gebruikers, systeem, admin, administratie (+rittenregistratie), verkoop/leads, gerechten/componenten+analyse, geld/boekhouder, voorraad, uren/personeel, factuur-lezer, menu-engineering, recepten, event-planner, ai-chat. Redirect-stubs werken client-side (browser-geverifieerd: /geld → /financien). Bonnen-pagina heeft voorbeeldig duidelijke upload-UX.

### P0-RLS-KLASSE: het systeembrede patroon (sweep over 204 insert/upsert-plekken)
De klanten-bug bleek de derde van een **bevestigde klasse van 16 kapotte opslag-plekken**: insert zonder `organization_id` → stille RLS-weigering. Live geverifieerd dat er géén database-default of vul-trigger bestaat voor deze tabellen (wel voor `courses` + `event_allergies` — die twee zijn veilig).

**Kapot bevonden en gefixt (2026-06-12):**
| Plek | Tabel(len) | Impact |
|---|---|---|
| AiOfferteWizard | offertes, gerechten | wizard kon nooit opslaan (Fase 2) |
| klanten/actions.ts | klanten | nieuwe klant aanmaken kapot (Fase 3) |
| EventWizard | offertes, events, klanten | **"Nieuw event" hoofdflow kapot** |
| events/page.tsx | events | "Nieuw event" op events-lijst kapot |
| OnboardingWizard | settings, gerechten, events | **onboarding van nieuwe tenants kapot** (Pro-tier funnel!) |
| klantgesprek/page.tsx | offertes, events | klantgesprek-afronding kapot |
| DishQuickEditor | gerechten | snel gerecht toevoegen kapot |
| reflectie/page.tsx | event_reflecties | reflectie opslaan kapot |
| facturen/actions.ts | facturen | nieuwe factuur (handmatig) kapot |
| voorraad/actions.ts | inventory | nieuw voorraad-item kapot |
| materieel/actions.ts | materieel | nieuw materieel kapot |
| offertes/actions.ts | offertes | handmatige offerte-opslag kapot |

**Waarom dit zo lang onopgemerkt bleef:** de RLS-policies zijn in april aangescherpt; daarvóór werkten deze schermen. Fouten waren stil of vluchtig (toast met rauwe Engelse DB-tekst). Mathijs's dagelijkse flows liepen via paden die wél werkten (acceptatie-keten = service-role, uren = useSupabase-hook die org-id injecteert).

**Structurele aanbeveling (P1):** één gedeelde `insertWithOrg()`-helper of een database-trigger per org-tabel die `organization_id` uit de sessie vult (zoals `courses_fill_org_id` al doet) — dan kán deze klasse niet meer ontstaan. Plus een lint-regel/test die `.insert(` zonder organization_id flagt.

## Fase 5 — Mobiel-pass ✅
- **Vandaag 390px**: geen horizontale scroll, BottomNav aanwezig, countdown-ring + realtime acceptatie-melding — sterk scherm
- **Offertes 390px**: schoon, geen te kleine knoppen
- **Klantportal 390px**: geen h-scroll; "Al geaccepteerd"-state correct
- **Uren 390px**: inklokken/uitklokken geverifieerd (Fase 1)
- **P1-KDS-03**: KDS-bord op tablet 1024×768 — **14 van 25 zichtbare knoppen < 44px**; met handschoenen (Lars) is dat mis-tikken in de hitte van service

## Fase 6 — Publieke schil ✅
- 8 publieke routes koud bereikbaar zonder login (200, geen redirect): welkom, pricing, login, signup, invite, aanvraag, q/[token], legal
- Omgekeerd: beschermde routes (/financien /uren /klanten /admin) sturen anoniem netjes naar `/login?redirect=…`
- Portal-API `/api/public-offerte/[token]` koud bereikbaar; `/api/q/[id]` is dood (P2, eerder genoteerd)

## Fase 7 — Afronding ✅

### UX-rubric per scherm (8 checks × 0/1/2, max 16)
| Scherm | Score | Grootste aftrek |
|---|---|---|
| Klantportal /q/[token] | 15 | aanbetaling €0-bug (items[]) |
| Bonnen-scanner | 15 | — (uitleg-copy is voorbeeldig) |
| Vandaag | 14 | omzet-tegenspraak, "CONFIRMED" Engels |
| Aanvraag-formulier | 14 | geen scroll-naar-fout |
| Agenda | 14 | — |
| Financiën | 14 | — (copilot + BTW-bewaking sterk) |
| Uren (na fix) | 14 | — (grote play-knop = goed Lars-design) |
| Leads-pijplijn | 14 | — |
| Klanten | 13 | veldlabels alleen als placeholder |
| Offertes | 12 | nummer-duplicaten, lijst-dichtheid |
| KDS service-bord | 12 | touch-targets, coach-context |
| Gerechten | 11 | lege €0,00/0%-kolommen overal |

**Gemiddeld ~13,5/16.** Conclusie: het *ontwerp* is goed — consistent drawer-patroon, sterke states, NL-copy grotendeels op orde. De pijn zat in **werkt-het** (16 stille opslag-breuken) en **datavertrouwen** (zelfde getal ≠ zelfde getal), niet in schoonheid.

### Vandaag gefixt (samenvatting: 17 reparaties, alle geverifieerd)
1. **Inklokken/uitklokken** — database-constraint + migratie + NL-foutmelding (live getest op telefoonformaat)
2. **AI Offerte Wizard** — 3 opeengestapelde bugs (token-limiet, org-id, nummer-botsing); werkt nu end-to-end (OFF-2026-011 als bewijs, daarna opgeruimd)
3. **14 opslag-plekken org-id-klasse** — EventWizard, Nieuw event (live herverifieerd: event #54), OnboardingWizard, klantgesprek, gangen, DishQuickEditor, reflectie, klanten-, facturen-, voorraad-, materieel-, offertes-actions
4. **Contextuele hulp** — query op niet-bestaande kolom (elke pagina-load een DB-error sinds launch) → werkt nu met bestaande artikelen
- Eindstand: `npm test` 540/540 groen · `tsc --noEmit` 0 fouten · testdata 0 rijen over (8 tabellen gecontroleerd)

### 🎯 Top-10 — dit moeten we anders doen (pijn × moeite)
1. **Geef wizard-offertes echte regels.** De AI-wizard slaat het menu alleen als tekst op; daardoor rekent álles daarna €0 (aanbetaling klant, omzet op hub, "volledig betaald", lege keuken-lijst). Eén fix, vier schades weg. *(M — hoogste prioriteit)*
2. **Maak het AI-menu 5× sneller en goedkoper.** Vraag de AI niet om complete recepturen die al in je bibliotheek staan — alleen naam/gang/prijs/bron. En neem het concept-menu uit de lead-drawer mee de wizard in, nu wordt twee keer hetzelfde gegenereerd (2×108 sec, 2× kosten). *(M)*
3. **Eén omzet-waarheid.** Vier schermen tonen vier verschillende omzetcijfers. Eén gedeelde berekening met expliciete labels ("bevestigd" / "gefactureerd" / "betaald"). *(M)*
4. **Maak de org-id-klasse onmogelijk.** Database-vultrigger per tabel (zoals courses al heeft) of één verplichte opslag-helper — anders sluipt deze bug er bij elk nieuw scherm weer in. *(S/M)*
5. **Nooit meer rauwe database-taal in beeld.** Centrale vertaling van fouten naar mensentaal; de "stille mislukking" is je grootste vertrouwens-killer. *(S)*
6. **KDS Lars-proof.** Knoppen ≥44px op het service-bord en de Rook-coach moet de event-context gewoon meekrijgen (staat nu blind naast een bord vol data). *(S/M)*
7. **Eco-score repareren of verbergen.** 374 kg CO₂ per portie is factor 100 te hoog — zoiets ondermijnt het vertrouwen in álle andere cijfers. *(S)*
8. **Eén offertenummer-generator.** Er bestaan er nu minstens drie; duplicaten als "OFF-2026-002 (dup-4)" staan al in je administratie. Centraliseren + bestaande duplicaten hernummeren. *(S)*
9. **Gerechten-lijst: toon wat gevuld is.** Een muur van "€ 0,00 / 0%" zegt niks; toon kostprijs (die er wél is) en verberg lege kolommen. *(S)*
10. **Ruim de losse eindjes op.** Dode route /api/q/[id], ongebruikt DishQuickEditor-component, en het gevaarlijke scripts/seed-demo-data.mjs dat hardcoded in je échte organisatie schrijft. *(S)*

### AI-verbruik test-campagne
±€0,91: 4× menu-generatie Sonnet (~€0,90) + 1× dagbriefing Haiku (~€0,01). Zichtbaar in /instellingen/ai-usage.

### Opruimregister — eindstand
Alle testdata verwijderd en nagecontroleerd (0 rijen over in offertes/events/leads/facturen/klanten/inventory/gerechten/time_logs/audit_log). Jouw echte data: niets gewijzigd, niets verwijderd. De enige blijvende wijzigingen zijn de bug-fixes in code + de audit_log-migratie.

---

## Weekend-klaar-ronde (2026-06-12, avond) — top-10 #1, #2 (deels), #7 + extra's ✅

Mathijs test in het weekend van 13-14 juni; deze ronde maakte de geld-keten écht bruikbaar. Volledige verse keten doorlopen als bewijs: publieke lead → AI-menu → wizard → portal → acceptatie → event-hub.

| # | Fix | Bewijs |
|---|---|---|
| 1 | **Wizard-offertes krijgen echte prijsregels** (`items[]`: menuprijs p.p. × gasten, btw-categorie food) — [AiOfferteWizard.tsx](../../src/components/AiOfferteWizard.tsx) | Offerte #41: 40 × €51,60 = €2.064 in items; **factuur erft dezelfde regels** |
| 2 | **Portal rekent juiste BTW**: btw_category → 9% via centrale [btw-rules.ts](../../src/lib/btw-rules.ts) (eten kreeg eerst 21% door settings-default) + eerlijk %-label — [Portal.tsx](../../src/app/q/[id]/_components/Portal.tsx) | Subtotaal €2.064 · BTW 9% €185,76 · totaal €2.249,76 · **aanbetaling €674,93** (was €0,00) |
| 3 | **Lead-menu gaat mee de wizard in** — wizard opent direct op controle-scherm, geen tweede generatie van ~2 min — [leads/page.tsx](../../src/app/verkoop/leads/page.tsx) + wizard-restore | "Gebruik in offerte" → direct "Menu bedacht", 0 extra AI-calls |
| 4 | **Menu-generatie ~33% sneller**: schema zonder receptuur per gerecht (bestaat al in bibliotheek) — [recipe-generate/route.ts](../../src/app/api/recipe-generate/route.ts) | Gemeten 71,6s / 6.029 tokens (was 106-131s / 7.071-8.815) |
| 5 | **Eco-score ~×60 gefixt**: batch-hoeveelheden gedeeld door porties vóór CO₂-berekening — wizard | Was "374,7 kg CO₂e per portie" |
| 6 | **"Volledig betaald"-misleiding weg**: alleen bij echt betaald bedrag; lege factuur → "Nog geen bedrag · F…" — [hub/page.tsx](../../src/app/events/[id]/hub/page.tsx) | Hub event 55: **OMZET €2.064** (was €0) · saldo "Nog geen bedrag" |
| 7 | **Acceptatie zonder Mollie is veilig** (bestond al, nu geverifieerd): eerst accept+event+factuur, dán betaalpoging; geen sleutel → nette terugval, datum staat vast | Acceptatie lokaal volledig doorlopen zonder Mollie-sleutel |

**Poortwachters:** `npm run build` (productie) exit 0 · `tsc --noEmit` 0 fouten · alle [TEST]-data opgeruimd (nacontrole 0 rijen).

**Nog open (geen weekend-blokkades):** menu-generatie naar <8s vraagt de grotere ontwerp-ingreep (top-10 #2); hub-MARGE toont "geen cost per regel" voor wizard-offertes (P2); hub-SALDO rekent met niet-bestaand `totaal`-veld (nu eerlijk gelabeld; later uit items rekenen, P2); facturen-nummering hergebruikt nummers van verwijderde facturen (zelfde count+1-patroon, top-10 #8).

