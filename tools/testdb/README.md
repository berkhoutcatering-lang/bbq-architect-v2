# Lokale testdatabase

Een echte Postgres 17 op je eigen Mac, zonder Docker en zonder Supabase-account,
om de migraties en de SQL-tests in `supabase/tests` te draaien. De binaries komen
uit het npm-pakket `embedded-postgres`; de client is `pg`. Alles staat in deze map
met een eigen `package.json`, zodat de dependencies van BBQ Architect niet
veranderen. Live wordt nooit aangeraakt: de database luistert alleen op
`127.0.0.1` en kent geen andere verbinding.

## Eenmalig

```sh
npm --prefix tools/testdb install
```

## Commando's (vanuit de repo-root)

| Commando | Wat het doet |
| --- | --- |
| `npm --prefix tools/testdb run start` | Start de database (maakt het cluster aan in `tools/testdb/.data` als dat er nog niet is). Poort 54329, of de eerstvolgende vrije. |
| `npm --prefix tools/testdb run stop` | Stopt de database; de gegevens blijven staan. |
| `npm --prefix tools/testdb run opnieuw` | Wist alles en bouwt het opnieuw op: nieuw cluster, starten, `migreer`. |
| `npm --prefix tools/testdb run migreer` | Bootst Supabase na en past alle migraties toe die er nog niet op staan. |
| `npm --prefix tools/testdb run seed` | Draait `supabase/tests/seed_vier_naober.sql` (organisatie e2e-hop-en-bites). |
| `npm --prefix tools/testdb run test` | Draait elke `supabase/tests/*.sql` (behalve de seed) en meldt per bestand GESLAAGD of FOUT met de melding. `-- winkel_vrij` draait alleen die. |
| `npm --prefix tools/testdb run proef` | Draait de objectproef `supabase/checks/verify_winkel_live.sql`. Met `-- --vergelijk=<bestand>` legt hij de uitkomst naast een uitvoer van live (`supabase db query -o table`) en toont alleen de verschillen. |
| `npm --prefix tools/testdb run proef:twee-tablets` | Twee tablets verwerken tegelijk hun wachtrij met producten in gekruiste volgorde (review M2, B1). Geslaagd = alle zes de bonnen `verwerkt`, geen deadlock. Zet data in de e2e-organisatie: draai hem ná `test`. |
| `npm --prefix tools/testdb run sql -- <bestand.sql>` | Draait een willekeurig SQL-bestand en toont de uitkomst. |
| `npm --prefix tools/testdb run api` | De api-stand: PostgREST plus een voordeur op `/rest/v1`, zodat BBQ Architect lokaal tegen deze database draait. Zie hieronder. |
| `npm --prefix tools/testdb run api:proef` | Start de api-stand, controleert sleutels, rechten, `/auth/v1` en CORS, en stopt weer. |

De gewone ronde na een wijziging aan een migratie of test:

```sh
npm --prefix tools/testdb run opnieuw && npm --prefix tools/testdb run seed && npm --prefix tools/testdb run test
npm --prefix tools/testdb run proef && npm --prefix tools/testdb run proef:twee-tablets
```

Verbinden met een eigen client: `postgresql://postgres:postgres@127.0.0.1:54329/postgres`
(de echte poort staat in `tools/testdb/.data/poort`). Een andere worktree testen,
bijvoorbeeld een lagere branch van de stapel: zet `TESTDB_REPO=<pad naar die worktree>`
voor het commando; migraties, seed en tests komen dan daarvandaan.

Een tweede database naast de gewone (een agent die parallel werkt, of de E2E-keten
"Vier Naober" in de Toonbank-repo): zet `TESTDB_DATA=<eigen map>` en
`TESTDB_POORT=<eigen poort>` voor elk commando. `opnieuw` wist alleen een map die
echt een testdatabase is (of leeg is).

## De api-stand: BBQ Architect tegen deze database

BBQ Architect praat via supabase-js met PostgREST op `/rest/v1`. De api-stand
zet dat lokaal neer, zonder Docker en zonder Supabase-account:

```sh
npm --prefix tools/testdb run opnieuw && npm --prefix tools/testdb run seed
npm --prefix tools/testdb run api        # op de voorgrond; Ctrl+C stopt hem
```

Wat er gebeurt:

1. De database start als hij nog niet draait (er moeten migraties op staan).
2. PostgREST (officiële release van GitHub, vastgepind op versie en SHA-256 in
   `postgrest.mjs`) wordt één keer gedownload naar `tools/testdb/.bin`. De
   macOS-build zoekt libpq van Homebrew; die hoeft er niet te zijn, hij krijgt
   de libpq van embedded-postgres mee.
3. Eén keer een eigen JWT-geheim, en daarmee een anon- en een service_role-sleutel
   (JWT's met de role-claim, zoals Supabase), in `tools/testdb/.api/geheim.json`.
   Ze blijven dezelfde na `opnieuw`. `.bin` en `.api` staan in `.gitignore`.
4. De rol `authenticator` mag inloggen met een eigen wachtwoord (alleen deze
   wegwerpdatabase); PostgREST draait op een interne poort.
5. De voordeur (`api-proxy.mjs`) luistert op `http://127.0.0.1:54321` (of
   `TESTDB_API_POORT`, of de eerstvolgende vrije) en doet wat Kong bij Supabase doet:
   - `/rest/v1/*` naar PostgREST; zonder of met een onbekende `apikey` 401;
   - `/auth/v1/user` 401 (er is geen GoTrue: niemand is ingelogd), de rest van
     `/auth`, `/storage`, `/realtime`, `/functions` 501;
   - CORS voor elke origin, zoals Supabase.
6. `tools/testdb/.api/ba.env` krijgt `NEXT_PUBLIC_SUPABASE_URL`,
   `NEXT_PUBLIC_SUPABASE_ANON_KEY` en `SUPABASE_SERVICE_ROLE_KEY`. De waarden worden
   nooit geprint.

BBQ Architect ertegen starten: zet die drie regels in `.env.development.local` (of
geef ze mee in de omgeving) en start met `npm run dev:branch`. Die weigert een
URL naar live, en laat een lokale URL (`127.0.0.1`, `localhost`, `::1`) ook zonder
`LIVE_SUPABASE_REF` door. Wat werkt: de publieke winkel-routes
(`/api/public-winkel/...`) en de Toonbank-API (`/api/toonbank/v1/...`). Wat niet
werkt: alles achter de login (Vandaag, Instellingen, Verkoop), want er is geen
GoTrue. Zet verder niets van live in die omgeving (mail, myPOS-productie, AI):
`MYPOS_TEST_MODE=1` is genoeg om een order te plaatsen; een betaling boots je na
met `winkel_start_betaalpoging` en `winkel_bevestig_betaling` via `/rest/v1/rpc`
met de service_role-sleutel.

Met `TESTDB_DATA` staan de sleutels in `<TESTDB_DATA>/api`, met `TESTDB_API_MAP`
in een eigen map (dan overleven ze ook `opnieuw` van die database).

## Hoe `migreer` werkt

Elke stap draait in een eigen transactie en wordt vastgelegd in `testdb.migraties`.
Bij een fout stopt hij met bestand, regel en melding; er blijft dan niets half staan.

1. `supabase-stub.sql` — Supabase nabootsen: de rollen `anon`, `authenticated`,
   `service_role` (NOLOGIN), `authenticator`, `supabase_admin` en de beheerders van
   auth/storage; schema `auth` met `auth.users` en `auth.uid()`, `auth.role()`,
   `auth.jwt()`, `auth.email()` die `request.jwt.claims` lezen zoals Supabase;
   schema `storage` met `buckets`, `objects` en `foldername()`/`filename()`/
   `extension()`; schema `extensions` met `pgcrypto` en `uuid-ossp`; lege schema's
   voor wat hier niet bestaat (`graphql`, `net`, `cron`, `vault`, `pgsodium`);
   de publicatie `supabase_realtime`; zoekpad `"$user", public, extensions`; en de
   standaardrechten van Supabase (alles wat postgres in `public` maakt is voor
   anon, authenticated en service_role, en EXECUTE voor PUBLIC zoals Postgres zelf).
2. `supabase-schema.sql` en `schema-migration.sql` uit de repo-root: het
   beginschema dat ooit in de SQL-editor is geplakt.
3. `voorgeschiedenis.sql` — tabellen en kolommen die op live buiten de migraties om
   zijn ontstaan (onder andere `profiles`, `gerechten`, `stock_movements`,
   `master_products`, `technieken`). Minimaal: alleen wat de migraties aanraken.
4. `supabase/migrations/*.sql` op bestandsnaam, zonder `_draft*`. Een paar oude
   migraties staan in de repo anders dan ze op live zijn gedraaid; die krijgen in het
   geheugen een aanpassing uit `afwijkingen.mjs` (met reden). De bestanden zelf
   blijven ongemoeid. Nieuwe migraties horen daar nooit in: een fout in een nieuwe
   migratie repareer je in de migratie.

## Verschillen met Supabase

- `postgres` is hier superuser (op Supabase niet). De tests wisselen zelf naar
  `anon` of `authenticated` met `set_config('role', …, true)` en zetten
  `request.jwt.claims`, net als PostgREST; rechten worden dus echt gecontroleerd.
  Een test die helemaal als één rol moet draaien, zet bovenin
  `-- testdb-rol: authenticated` (en eventueel `-- testdb-claims: {...}`); de runner
  doet dan `SET LOCAL ROLE` en zet de claims, zoals PostgREST per verzoek.
- Geen GoTrue, Storage-API, Realtime, pg_net, pg_cron of Vault; PostgREST alleen
  in de api-stand. Wat alleen op live staat (tabellen of functies die nooit in een
  migratie zijn gezet) bestaat hier niet, tenzij een migratie erop rekent.
- De database is Postgres 17 met `C.UTF-8` en tijdzone UTC, zoals Supabase.
