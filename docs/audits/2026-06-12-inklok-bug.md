# Inklok-bug — opgelost ✅ (2026-06-12)

## Wat jij zag
Je drukte op de play-knop op de Uren-pagina (telefoon) en kreeg "Inklokken mislukt: …". De knop leek even te werken en sprong dan terug.

## Wat er echt aan de hand was (mensentaal)
Elke keer dat iemand in- of uitklokt, schrijft de app automatisch een regel in een intern logboek (`audit_log`) — wie, wanneer, hoe lang. Dat logboek heeft een bewakingsregel die bepaalt welke soorten regels erin mogen.

Die bewakingsregel is de afgelopen maanden door **vier verschillende database-wijzigingen telkens volledig overschreven**, en elke wijziging zette alleen z'n éígen lijstje terug. De bonnen-wijziging van eind mei gooide daarbij "inklok-regels" uit de toegestane lijst. Gevolg: het logboek weigerde de inklok-regel → de hele inklok-actie werd teruggedraaid → foutmelding. Niet alleen inklokken was kapot, ook uitklokken, uren corrigeren en verwijderen.

**Jouw account was helemaal in orde** (Admin, actief, personeels-record aanwezig). Je laatste gelukte inklok was 1 mei — sindsdien was de functie stilletjes kapot; jij was de eerste die het merkte.

## Het bewijs
- Live bewakingsregel vóór de fix: `concept_inkoop_orders, facturen, bonnen, menu_templates, offertes, gerechten` — **`time_logs` ontbrak**, terwijl de inklok-trigger (`trg_time_log_audit`) actief was op INSERT/UPDATE/DELETE.
- Aantal inklok-regels ooit in het logboek: **0** (de blokkade hield álles tegen).
- Na de fix: proef-inklok om 16:43 → `punch_in`-logboekregel, proef-uitklok om 16:44 → `punch_out`-regel, beide netjes geregistreerd. Getest op telefoonformaat (390px), precies jouw scenario. Proefregels daarna opgeruimd.

## De fix (2 delen)
1. **Database** — migratie [20260612150000_fix_audit_log_time_logs_constraint.sql](../../supabase/migrations/20260612150000_fix_audit_log_time_logs_constraint.sql), live toegepast. Herbouwt de bewakingsregel met een **union-patroon**: de volledige canonieke lijst (10 tabellen) ∪ alles wat al in het logboek staat. Met grote waarschuwing in het bestand: nooit meer hardcoded vervangen.
2. **Foutmelding** — [uren/page.tsx](../../src/app/uren/page.tsx) toonde rauwe database-tekst ("new row violates check constraint…"). Nu: "Inklokken is niet gelukt. Probeer het opnieuw of ververs de pagina." De technische details gaan naar de console voor debugging.

## Waarom dit niet nóg een keer mag gebeuren
Het onderliggende patroon (constraint hardcoded herbouwen) is 4× misgegaan: `017` → `020` (wiste niets) → `031` (wiste ritten/voertuigen) → `20260525136000` (wiste time_logs/personeel/ritten). Migratie `20260527020000` introduceerde het goede dynamische patroon — maar kon `time_logs` niet terugvinden omdat er door de blokkade nooit regels voor bestonden.

**Regel voor alle toekomstige migraties:** de `audit_log_record_table_check` alleen uitbreiden via het union-patroon uit de fix-migratie. Overweging voor later (P2): deze CHECK-constraint helemaal schrappen — hij heeft 6 weken lang een kernfunctie gebroken en beschermt vooral tegen typefouten.

## Status
- [x] Oorzaak bewezen met SQL-evidence
- [x] Database-fix live (12-06-2026, ~16:40)
- [x] UI-foutmelding mensentaal
- [x] In- én uitklokken geverifieerd op 390px
- [x] Testdata opgeruimd (time_log #28 + audit-regels weg, laatste echte log #24 intact)
