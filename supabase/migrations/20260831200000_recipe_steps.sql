-- ════════════════════════════════════════════════════════════════════════
-- Receptstappen — één rij is één handeling
-- ════════════════════════════════════════════════════════════════════════
-- Zie docs/agent-architectuur-plan.md hoofdstuk 4.1.
--
-- Dit is een UITBREIDING, geen nieuwbouw. In src/lib/prep/ draait al ruim 3.800
-- regels prep-planning met tien fase-schema's (recipeTemplates.ts), tests en een
-- scherm. Dat blijft staan. Wat daar ontbreekt zijn precies drie dingen, en die
-- drie maken het verschil tussen een lijstje en een planning:
--
--   1. handtijd en wachttijd apart. Nu is er één `duration_minutes`. Zonder dat
--      onderscheid kan geen enkele planner handwerk in de wachttijd van een
--      apparaat schuiven, want hij weet niet wát wachttijd is.
--   2. prep_group. Drie recepten die alle drie sjalot snipperen blijven nu drie
--      losse taken. Met een groepeersleutel worden het er één.
--   3. plaats. Voorbereiden gebeurt thuis met al je spullen op een moment dat
--      jij kiest; afwerken gebeurt op locatie met een fractie ervan terwijl
--      tachtig mensen wachten. Dat zijn twee budgetten, geen één.
--
-- gerechten.id is een uuid. src/types/database.types.ts zegt `number` en dat
-- klopt niet — dat bestand wordt met de hand bijgehouden en is gedrift. Geen
-- foreign key naar gerechten: die tabel staat nergens in versiebeheer (ooit met
-- de hand aangemaakt), dus een FK zou een verse omgeving laten struikelen op
-- iets wat niets met deze migratie te maken heeft.

create table if not exists public.recipe_steps (
  id                    uuid primary key default gen_random_uuid(),
  organization_id       uuid not null references public.organizations(id) on delete cascade,

  -- Naar welk gerecht of welke component de stap hoort. Eén van beide is
  -- gevuld, niet allebei.
  gerecht_id            uuid,
  component_id          bigint references public.components(id) on delete cascade,

  step_order            integer not null,
  actie                 text,
  tekst                 text not null,

  -- Hoeveelheid PER GAST, zelfde canon als quantity_used elders in de app.
  -- Niet per portie en niet per recept: dat verschil is eerder de bron van een
  -- factor-tien-fout geweest.
  ingredient_ref        text,
  hoeveelheid           numeric,
  eenheid               text,

  -- De drie velden waar het om gaat.
  prep_group            text,
  duur_actief_min       integer,
  duur_passief_min      integer,
  plaats                text not null default 'thuis',

  toezicht_nodig        boolean not null default false,
  station               text,
  apparaat              text,
  techniek_slug         text references public.technieken(slug) on delete set null,

  -- Alleen invullen als het een PROCEStemperatuur is. Wettelijke grenswaarden
  -- horen in de HACCP-normtabel, niet hier — anders staan dezelfde normen op
  -- twee plekken en lopen ze uit elkaar.
  temp_doel_c           numeric,

  hangt_af_van_stap_id  uuid references public.recipe_steps(id) on delete set null,

  bron                  text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  constraint recipe_steps_hoort_ergens_bij
    check (gerecht_id is not null or component_id is not null),
  constraint recipe_steps_plaats_geldig
    check (plaats in ('thuis', 'bus', 'locatie')),
  constraint recipe_steps_duur_niet_negatief
    check (coalesce(duur_actief_min, 0) >= 0 and coalesce(duur_passief_min, 0) >= 0)
);

comment on table public.recipe_steps is
  'Eén rij is één handeling die één persoon op één werkplek doet. Vult de '
  'prep-planning aan die al in src/lib/prep/ draait.';

comment on column public.recipe_steps.duur_actief_min is
  'Handtijd — kost een persoon. Samen met duur_passief_min het belangrijkste '
  'onderscheid in de hele tabel: zonder dit verschil kan batching geen wachttijd '
  'vullen en kan geen planner een kritiek pad berekenen.';

comment on column public.recipe_steps.duur_passief_min is
  'Wachttijd — kost een apparaat, geen persoon. Denk aan twaalf uur op de '
  'smoker: die tijd is er wel, maar jij staat er niet bij.';

comment on column public.recipe_steps.prep_group is
  'Batching-sleutel, bijvoorbeeld sjalot-brunoise. Twee stappen met dezelfde '
  'sleutel zijn samen te voegen tot één handeling over recepten heen.';

comment on column public.recipe_steps.plaats is
  'thuis | bus | locatie. Voorbereiden en afwerken zijn twee verschillende '
  'budgetten: op locatie heb je minder spullen, minder handen en wachtende gasten.';

comment on column public.recipe_steps.hoeveelheid is
  'PER GAST. Niet per portie, niet per recept — dat verschil is eerder goed '
  'misgegaan.';

create index if not exists idx_recipe_steps_gerecht
  on public.recipe_steps (organization_id, gerecht_id, step_order);

create index if not exists idx_recipe_steps_component
  on public.recipe_steps (organization_id, component_id, step_order);

-- Batching zoekt over recepten heen op deze sleutel; zonder index wordt dat een
-- volledige tabelscan zodra er een paar honderd stappen staan.
create index if not exists idx_recipe_steps_prep_group
  on public.recipe_steps (organization_id, prep_group)
  where prep_group is not null;

-- ─── RLS ───────────────────────────────────────────────────────────────
alter table public.recipe_steps enable row level security;

drop policy if exists recipe_steps_select on public.recipe_steps;
create policy recipe_steps_select on public.recipe_steps
  for select to authenticated
  using (organization_id in (select private.user_org_ids()));

drop policy if exists recipe_steps_insert on public.recipe_steps;
create policy recipe_steps_insert on public.recipe_steps
  for insert to authenticated
  with check (organization_id in (select private.user_org_ids()));

drop policy if exists recipe_steps_update on public.recipe_steps;
create policy recipe_steps_update on public.recipe_steps
  for update to authenticated
  using      (organization_id in (select private.user_org_ids()))
  with check (organization_id in (select private.user_org_ids()));

drop policy if exists recipe_steps_delete on public.recipe_steps;
create policy recipe_steps_delete on public.recipe_steps
  for delete to authenticated
  using (organization_id in (select private.user_org_ids()));

-- ════════════════════════════════════════════════════════════════════════
-- Einde migratie
-- ════════════════════════════════════════════════════════════════════════
