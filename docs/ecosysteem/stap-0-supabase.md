# Stap 0: Supabase, vanmiddag (za 3 okt)

**Plan:** plan v5, stap 0, met BA-S en E2E-0. **Branch:** `fix/ba-s-functierechten`
(basis `feat/winkelvoorraad`).

Op live doen we alleen lezen. De enige schrijfactie is de beveiligingsfix BA-S, en
die gaat er alleen op met jouw go. Alles wat test of seedt, draait op de
dev-database.

---

## Wat er klaarligt

| Bestand | Wat | Waar draaien |
| --- | --- | --- |
| `supabase/checks/verify_winkel_live.sql` | objectproef: tabellen, kolommen, functies, fixes, triggers. Per object OK of ONTBREEKT | live en dev (alleen lezen) |
| `supabase/checks/verify_anon_rechten.sql` | wie mag welke functie uitvoeren, standaardrechten, triagelijst | live en dev (alleen lezen) |
| `supabase/checks/verify_ophaallek.sql` | regels die opgehaald zijn maar nooit ingepakt | live (alleen lezen) |
| `supabase/migrations/20261003150000_winkel_functies_niet_voor_anon.sql` | de fix BA-S | eerst dev, daarna live met go |
| `supabase/migrations/20261004120000_functies_niet_voor_anon_2.sql` | de fix BA-S2 (rest van de triagelijst) | eerst dev, daarna live met go |
| `supabase/checks/herstel_ba_s2.sql` | BA-S2 helemaal terugdraaien (opent het lek weer) | alleen in nood, met go |
| `supabase/tests/seed_vier_naober.sql` | organisatie `e2e-hop-en-bites`, Naober geteld op 6, artikel `roeg-naober` | alleen dev |
| `supabase/tests/functie_rechten.sql` | bewijs dat BA-S werkt | alleen dev |
| `npm run dev:branch` | BA lokaal tegen dev; weigert als de URL naar live wijst | lokaal |

De SQL-tests weigeren zonder de organisatie `e2e-hop-en-bites`. Die maakt alleen de
seed, en de seed weigert als er winkelartikelen of events van een andere organisatie
staan. Zo draait er nooit per ongeluk iets op live. SQL-tests draaien ook nooit meer
met `--linked`.

---

## De volgorde

### 1. Toegang

1. Koppel de Supabase-connector opnieuw, met het account dat BA bezit.
2. Daarna toont `list_projects` het BA-project.
3. `get_organization` laat het abonnement zien. Branching kan alleen met een betaald plan.

### 2. Live naast de repo leggen (alleen lezen)

Draai de checks via de Supabase-MCP (`execute_sql` op het live-project) of in de SQL
Editor van het dashboard. Het zijn allemaal losse SELECT's.

1. **Migraties:** vergelijk `list_migrations` met `supabase/migrations` op
   `feat/winkelvoorraad`. Een deel van de winkelmigraties is met `db query` gedraaid
   en staat daardoor niet in die lijst. De objectproef is daarom de echte maat.
2. **Objectproef `verify_winkel_live.sql`:**
   - Alles OK, behalve `private.vereis_org`: dan is live gelijk aan de repo. Die ene
     functie komt pas met BA-S.
   - Iets anders staat op ONTBREEKT: de kolom `migratie` zegt welke migratie niet
     live staat. Noteer het, maar los het vandaag niet op. Ontbreekt een van de
     functies die BA-S noemt, dan weigert BA-S (pre-flight) en verandert er niets.
3. **Rechtencheck `verify_anon_rechten.sql`:**
   - Deel 0 en 1: staat er "ja" onder anon, dan is het lek bevestigd. "LEK
     (SECURITY DEFINER …)" is het ergste geval: met de publieke sleutel kan
     iedereen die functie aanroepen, voor elke organisatie.
   - Deel 2: standaardrechten. Daar staat "anon ja" bij `postgres` tot BA-S live is.
   - Deel 3, de triagelijst: alle andere SECURITY DEFINER-functies die anon mag
     uitvoeren. Die beoordelen we later, per functie. Vandaag niet aankomen.
4. **Ophaallek `verify_ophaallek.sql`:**
   - 0 rijen: geen lek.
   - Wel rijen: per regel kies je (a) alsnog afboeken of (b) alleen als ingepakt
     markeren. De kolom `hint` helpt: is het product ná het ophalen geteld, dan zit
     het ophalen al in het getal en is (b) waarschijnlijk. Uitvoeren doen we pas met
     BA-2.
5. **Data-checks:**
   - Artikelen zonder slot:
     ```sql
     select a.slug, a.naam, a.actief from public.winkel_artikelen a
      where not exists (select 1 from public.winkel_artikel_slots s where s.artikel_id = a.id)
      order by a.actief desc, a.slug;
     ```
   - De bijsturing geeft 200:
     `curl -s -o /dev/null -w "%{http_code}\n" https://<BA-domein>/api/public-bijsturing/<slug>`

### 3. De dev-database opzetten

1. **Branch (voorkeur):** `get_cost`, dan `confirm_cost`, dan `create_branch` met de
   naam `dev-ecosysteem`.
   - Een branch krijgt alleen de migraties die live in de migratielijst staan, en
     geen data. Wat ontbreekt, zet ik er in volgorde op met `apply_migration`.
   - Daarna draait de objectproef op dev, tot hij gelijk is aan live.
2. **Geen branching mogelijk:** dan een apart dev-project, gevuld met een schema-dump
   van live (alleen schema, geen data). De dump gaat niet in git.
3. **Seed:** `supabase/tests/seed_vier_naober.sql` op dev. De laatste regel van de
   uitvoer moet laten zien: geteld 6, gereserveerd 0, slots 1, en een afhaalmoment
   over 7 dagen. Nog een keer draaien mag: dan zet hij alles terug in dezelfde stand.
4. **Lokaal tegen dev:**
   - Zet in `.env.development.local` (git-ignored) de dev-waarden van
     `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` en
     `SUPABASE_SERVICE_ROLE_KEY`, plus `LIVE_SUPABASE_REF` (de project-ref van live).
   - Starten met `npm run dev:branch`. Ontbreekt `LIVE_SUPABASE_REF`, of wijst de URL
     naar live, dan start hij niet.
   - Voor de SQL-tests vanaf de terminal: zet `DEV_DB_URL` (de connection string
     van dev) alleen in je shell, nooit in een bestand in de repo.
5. **Vercel Preview:** de Preview-variabelen van BA wijzen pas naar dev na jouw go.

### 4. BA-S: eerst op dev, dan met go op live

**Wat de fix doet:**
- anon (de publieke sleutel) mag geen enkele `winkel_*`-, `voorraad_*`-functie of
  `keuken_afwijking` meer uitvoeren, en ook `productie_partij_afronden`,
  `partij_als_jsonb` en `increment_inventory_stock` niet (dezelfde open deur).
- Wat BA met de ingelogde gebruiker aanroept, blijft voor `authenticated`. Per
  functie staat de aanroeper in de migratie.
- De betaal- en plaatsfuncties en `partij_als_jsonb` zijn alleen nog voor
  `service_role`.
- Triggerfuncties (zoals `winkel_catalogus_poort`) gaan ook dicht; lukt dat niet
  omdat een andere rol eigenaar is, dan geeft de migratie alleen een WARNING (een
  triggerfunctie is niet los aan te roepen).
- Er komt `private.vereis_org(p_org)` bij, voor alle nieuwe functies.

**Gevolgen voor de app:** geen. De website roept nooit zelf een databasefunctie aan.

**Stappen:**
1. **Dev:** pas de migratie toe, via `apply_migration` met de inhoud van het bestand,
   of zo:
   `npx supabase db query --db-url "$DEV_DB_URL" -f supabase/migrations/20261003150000_winkel_functies_niet_voor_anon.sql`
2. **Dev:** draai `supabase/tests/functie_rechten.sql`. Dat moet "GESLAAGD: …" geven.
   Draai ook `winkel_voorraad.sql`, `winkel_inpakken.sql` en `voorraad_invoer.sql`:
   alle drie GESLAAGD.
3. **Dev:** draai `verify_anon_rechten.sql`. Deel 0 moet 0 geven, en deel 1 overal OK.
4. **Dev, als je wilt:** start `npm run dev:branch`, log in en loop dit na:
   - `/voorraad/winkel` (de bezetting);
   - het inpakvinkje;
   - een doosscan;
   - ontvangst boeken.
5. **Go, en dan live:**
   - Pas hetzelfde bestand toe op het live-project (`apply_migration`).
   - De migratie controleert zichzelf. Klopt er iets niet, dan breekt hij af en is
     er niets veranderd:
     - de pre-flight noemt ontbrekende functies;
     - de zelfcontrole noemt functies die anon nog mag. Dat gebeurt bijvoorbeeld als
       een functie een andere eigenaar heeft (zie de kolom `eigenaar` in de
       rechtencheck).
6. **Na live:**
   - `verify_anon_rechten.sql` op live geeft bij deel 0 als uitkomst 0.
   - Smoketest:
     - `/voorraad/winkel` laadt;
     - inpakken werkt;
     - de doosscan werkt;
     - ontvangst boeken werkt;
     - een webshop-offerte met de myPOS-testmodus werkt (dat is het service-pad).
7. **Terugdraaien, alleen als er toch iets stuk blijkt:** geef alleen die ene functie
   terug aan `authenticated`, nooit aan anon:
   `GRANT EXECUTE ON FUNCTION public.<functie>(<argumenttypes>) TO authenticated;`

### 5. BA-S2: de rest van de triagelijst (branch `fix/ba-s2-functierechten`)

**Wat de fix doet** (`supabase/migrations/20261004120000_functies_niet_voor_anon_2.sql`):
- Na BA-S mocht anon op live nog 36 SECURITY DEFINER-functies uitvoeren. Daarvan
  gaan er 16 dicht. De 17 triggerfuncties blijven (niet los aan te roepen), en
  de drie RLS-hulpfuncties `user_org_ids`, `is_member_with_role` en
  `pi_bridge_org_id` ook: policies roepen ze aan als anon. Die krijgen een eigen fix.
- Wat BA met de ingelogde gebruiker aanroept, blijft voor `authenticated`; de cron,
  de deellink-teller en functies zonder aanroeper alleen voor `service_role`. Per
  functie staat de aanroeper in de migratie.
- `explode_event_to_inkooplijst`, `find_cheaper_substitutes_same_cut` en
  `get_latest_gerecht_cost_delta` gaven gegevens van elke organisatie. Ze beginnen
  nu met `private.vereis_org(p_org_id)`; de rest is letterlijk de live-definitie.
- De pre-flight weigert als een van die drie definities op live anders is dan op
  4 oktober, of als een policy, view of andere functie de dichtgaande functies
  gebruikt.

**Stappen:**
1. **Dev:** migratie toepassen, dan `supabase/tests/functie_rechten.sql` ("GESLAAGD: …",
   met "BA-S2: … van de 16 functies") en `verify_anon_rechten.sql`: in deel 0 geven
   regel 2 en 4 een 0, en deel 4 staat overal op OK.
2. **Go, en dan live:** hetzelfde bestand via `apply_migration`.
3. **Na live:** `verify_anon_rechten.sql` deel 0: "BA-S2-functies die anon mag
   uitvoeren" 0, en in deel 3 alleen nog triggerfuncties en de drie RLS-hulpfuncties.
   Smoketest:
   - `/gerechten/<id>`: de kostprijskop met sparkline;
   - de substitutielade bij een ingrediënt (regels-tab);
   - `/financien`: de marktpuls-widget;
   - `/archief`: een bon ontgrendelen (Admin) en de Activiteit-tab;
   - een deellink `/share/<token>` openen.
4. **Noodherstel:** liever één functie terug aan `authenticated`. Alles terug kan met
   `supabase/checks/herstel_ba_s2.sql` (opent het lek weer; alleen met go).

---

## Goed om te weten

- **Nieuwe functies:** elke nieuwe functie houdt `REVOKE ALL … FROM PUBLIC, anon` met
  expliciete grants nodig.
  - Postgres geeft PUBLIC standaard EXECUTE op elke nieuwe functie. Dat haalt BA-S
    niet weg: het haalt alleen de eigen grant van anon weg.
  - `functie_rechten.sql` vangt het op voor `winkel_*` en `voorraad_*`, en sinds
    BA-S2 voor elke SECURITY DEFINER-functie in public die geen trigger- of
    RLS-hulpfunctie is.
- **Geen bewijs op live:** het bewijs dat de fix werkt, leveren we op dev. Op live
  kijken we alleen met `verify_anon_rechten.sql`.
- **Open na vandaag:**
  - de triagelijst (deel 3): na BA-S2 alleen nog de drie RLS-hulpfuncties;
  - per regel van het ophaallek een keuze, voor BA-2;
  - BA-1 (eerst #241, dan `feat/winkelvoorraad`; nooit #240 los).
