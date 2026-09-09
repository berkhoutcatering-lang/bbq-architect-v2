-- ════════════════════════════════════════════════════════════════════════
-- Golf 0 — vastleggen wat er al live staat maar niet in de repo
-- ════════════════════════════════════════════════════════════════════════
-- `recipe_steps`, `gn_maten` en `opslag_locaties` bestaan op productie, met
-- data erin (16 / 23 / 14 rijen op 8 september 2026), maar ze zijn ooit
-- rechtstreeks op de database gezet. Er is geen migratie die ze aanmaakt.
--
-- Deze migratie voegt NIETS toe en verandert NIETS. Hij schrijft alleen op wat
-- er al is, met `if not exists` overal, zodat hij op productie een no-op is.
-- Draai hem gerust twee keer.
--
-- ── Belangrijke nuance, gevonden tijdens het schrijven ──
-- Deze map is nooit een compleet schema geweest. Van de 111 tabellen op
-- productie hebben er 43 geen `create table` in de migraties — waaronder
-- `events`, `gerechten`, `offertes`, `klanten`, `inventory`, `settings`,
-- `prep_tasks`, `materieel` en `technieken`. De migraties zijn een logboek
-- bovenop een basis-schema dat ooit met de hand is neergezet (001_multi_tenant
-- voegt tenancy toe aan iets dat er al stond).
--
-- Een verse database opzetten uit deze map werkt dus sowieso niet, en deze
-- migratie verandert daar niets aan: de FK naar `technieken` hieronder zou op
-- een lege database net zo goed stuklopen. Op productie draait die regel nooit,
-- want de tabel bestaat al.
--
-- Waarom dit bestand er dan toch is: de drie tabellen hieronder zijn precies de
-- tabellen die de keukenplanner gaat uitbreiden. Wie straks kolommen toevoegt
-- aan `recipe_steps` moet in de repo kunnen zien wat daar al staat, inclusief de
-- checks en de policies, zonder eerst de productiedatabase te moeten bevragen.
-- Dit is documentatie die toevallig ook uitvoerbaar is.
--
-- Een echte baseline-dump van het hele schema is een aparte klus en een aparte
-- afweging. Die hoort niet bij de keukenplanner.
--
-- Bron: pg_catalog op oheilybckvtsczmbczot, 8 september 2026.
-- Zie docs/keukenplanner-bouwplan.md §1 en golf 0.

-- ─── 1. gn_maten — de bakken-rekentabel ────────────────────────────────
-- Referentiedata (geen organization_id): GN-formaten zijn een wereldwijde norm,
-- niet iets van een tenant. `vulgraad` staat PER MAAT en niet als één vaste
-- 0,8 — een diepe bak vult ongelijkmatiger dan een ondiepe. Deze tabel is de
-- enige bron voor het bakken-rekenwerk; nergens in code een hardgecodeerde 0,8.
create table if not exists public.gn_maten (
  code           text primary key,
  naam           text        not null,
  lengte_mm      integer     not null,
  breedte_mm     integer     not null,
  diepte_mm      integer     not null,
  inhoud_liter   numeric,
  vulgraad       numeric     default 0.85,
  stapelbaar     boolean     default true,
  bron           text,
  created_at     timestamptz not null default now()
);

comment on table public.gn_maten is
  'GN-formaten met inhoud en vulgraad. Referentiedata, niet org-gescoped. Enige bron voor bakken-berekeningen — vulgraad staat per maat.';

alter table public.gn_maten enable row level security;

drop policy if exists gn_maten_select on public.gn_maten;
create policy gn_maten_select on public.gn_maten
  for select to authenticated using (true);

-- ─── 2. opslag_locaties — waar iets ligt ───────────────────────────────
-- Een plek binnen een apparaat of ruimte: de tweede lade van de koelcel, een
-- plank in de droogopslag. Hangt aan `materieel` zodat een koeling zijn eigen
-- indeling heeft. `gn_capaciteit` en `max_belading_kg` zijn straks nodig om te
-- controleren of een tweede lading brisket überhaupt ergens terug kan koelen.
create table if not exists public.opslag_locaties (
  id               uuid        primary key default gen_random_uuid(),
  organization_id  uuid        not null references public.organizations(id) on delete cascade,
  materieel_id     integer     references public.materieel(id) on delete cascade,
  code             text        not null,
  naam             text        not null,
  volgorde         integer     not null default 0,
  soort            text        not null default 'lade',
  temp_min_c       numeric,
  temp_max_c       numeric,
  gn_capaciteit    jsonb,
  max_belading_kg  numeric,
  notitie          text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint opslag_locaties_organization_id_code_key unique (organization_id, code),
  constraint opslag_locaties_soort_geldig check (
    soort = any (array['lade', 'deurvak', 'plank', 'zone', 'rooster', 'bak'])
  )
);

comment on table public.opslag_locaties is
  'Opslagplek binnen een apparaat of ruimte (lade, plank, zone). Hangt aan materieel; draagt temperatuur en capaciteit.';

create index if not exists idx_opslag_locaties_materieel
  on public.opslag_locaties (organization_id, materieel_id, volgorde);

alter table public.opslag_locaties enable row level security;

drop policy if exists opslag_locaties_select on public.opslag_locaties;
drop policy if exists opslag_locaties_insert on public.opslag_locaties;
drop policy if exists opslag_locaties_update on public.opslag_locaties;
drop policy if exists opslag_locaties_delete on public.opslag_locaties;

create policy opslag_locaties_select on public.opslag_locaties
  for select to authenticated
  using (organization_id in (select private.user_org_ids()));

create policy opslag_locaties_insert on public.opslag_locaties
  for insert to authenticated
  with check (organization_id in (select private.user_org_ids()));

create policy opslag_locaties_update on public.opslag_locaties
  for update to authenticated
  using (organization_id in (select private.user_org_ids()))
  with check (organization_id in (select private.user_org_ids()));

create policy opslag_locaties_delete on public.opslag_locaties
  for delete to authenticated
  using (organization_id in (select private.user_org_ids()));

-- ─── 3. recipe_steps — de kern van de keukenplanner ────────────────────
-- Een stap hoort bij een gerecht OF bij een component (check hieronder), heeft
-- een volgnummer, en kan van een voorganger afhangen. `duur_actief_min` is tijd
-- dat de kok bezet is, `duur_passief_min` is tijd dat het ding staat te doen
-- zonder hem — dat onderscheid is waar de hele gaten-vullerij op draait.
--
-- Let op: `updated_at` heeft een default maar GEEN trigger. De kolom staat dus
-- gelijk aan created_at tenzij een schrijver hem meestuurt. Dat is bestaand
-- gedrag; hier niet stilzwijgend repareren, want dan wijkt de repo af van
-- productie. Hoort thuis in de golf-1-migratie, samen met de nieuwe kolommen.
create table if not exists public.recipe_steps (
  id                    uuid        primary key default gen_random_uuid(),
  organization_id       uuid        not null references public.organizations(id) on delete cascade,
  gerecht_id            uuid,
  component_id          bigint      references public.components(id) on delete cascade,
  step_order            integer     not null,
  actie                 text,
  tekst                 text        not null,
  ingredient_ref        text,
  hoeveelheid           numeric,
  eenheid               text,
  prep_group            text,
  duur_actief_min       integer,
  duur_passief_min      integer,
  plaats                text        not null default 'thuis',
  toezicht_nodig        boolean     not null default false,
  station               text,
  apparaat              text,
  techniek_slug         text        references public.technieken(slug) on delete set null,
  temp_doel_c           numeric,
  hangt_af_van_stap_id  uuid        references public.recipe_steps(id) on delete set null,
  bron                  text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint recipe_steps_hoort_ergens_bij check (
    gerecht_id is not null or component_id is not null
  ),
  constraint recipe_steps_plaats_geldig check (
    plaats = any (array['thuis', 'bus', 'locatie'])
  ),
  constraint recipe_steps_duur_niet_negatief check (
    coalesce(duur_actief_min, 0) >= 0 and coalesce(duur_passief_min, 0) >= 0
  )
);

comment on table public.recipe_steps is
  'Microstappen per gerecht of component. Actief = kok bezet, passief = kok vrij; dat onderscheid draagt het batchen en het gaten-vullen van de keukenplanner.';

create index if not exists idx_recipe_steps_gerecht
  on public.recipe_steps (organization_id, gerecht_id, step_order);

create index if not exists idx_recipe_steps_component
  on public.recipe_steps (organization_id, component_id, step_order);

create index if not exists idx_recipe_steps_prep_group
  on public.recipe_steps (organization_id, prep_group) where prep_group is not null;

alter table public.recipe_steps enable row level security;

drop policy if exists recipe_steps_select on public.recipe_steps;
drop policy if exists recipe_steps_insert on public.recipe_steps;
drop policy if exists recipe_steps_update on public.recipe_steps;
drop policy if exists recipe_steps_delete on public.recipe_steps;

create policy recipe_steps_select on public.recipe_steps
  for select to authenticated
  using (organization_id in (select private.user_org_ids()));

create policy recipe_steps_insert on public.recipe_steps
  for insert to authenticated
  with check (organization_id in (select private.user_org_ids()));

create policy recipe_steps_update on public.recipe_steps
  for update to authenticated
  using (organization_id in (select private.user_org_ids()))
  with check (organization_id in (select private.user_org_ids()));

create policy recipe_steps_delete on public.recipe_steps
  for delete to authenticated
  using (organization_id in (select private.user_org_ids()));
