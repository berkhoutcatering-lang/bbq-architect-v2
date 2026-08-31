-- ════════════════════════════════════════════════════════════════════════
-- Opslaglocaties — "pak de pulled pork uit PN229-L2"
-- ════════════════════════════════════════════════════════════════════════
-- Een machine is geen doos maar een verzameling plekken. Een gekoelde
-- werkbank met vier laden en een deurvak is vijf verschillende bewaarplaatsen,
-- elk met een eigen inhoud en soms een eigen temperatuur.
--
-- Waarom dit náást `inventory.storage_type` staat en er niet in past: dat veld
-- zegt wát voor bewaring een product nódig heeft (vers, vries, houdbaar). Dit
-- zegt wáár het feitelijk ligt. Een pak boter is 'vers' én ligt in PN229-L2 —
-- twee verschillende dingen, allebei waar.
--
-- Wat het mogelijk maakt zodra het gevuld is:
--   - de mise-en-place kan zeggen waar iets vandaan moet komen
--   - de capaciteitscheck weet hoeveel GN-bakken er nog in passen
--   - een telling loopt langs plekken in plaats van langs een lijst
--
-- Bewust GEEN koppeling naar producten in deze migratie. Eerst de plekken
-- laten bestaan en laten kloppen; wat er in ligt is de volgende stap. Een lege
-- structuur die klopt is meer waard dan een gevulde die niet klopt.

create table if not exists public.opslag_locaties (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations(id) on delete cascade,

  -- In welk apparaat of meubel deze plek zit. Leeg mag: een stelling in de
  -- droogopslag is ook een plek, en die staat niet per se in de materieel-lijst.
  materieel_id      integer references public.materieel(id) on delete cascade,

  -- Wat je intikt of inspreekt. Kort en uitspreekbaar: PN229-L2.
  code              text not null,
  naam              text not null,
  volgorde          integer not null default 0,

  soort             text not null default 'lade',

  -- Eigen temperatuurzone. Een deurvak is doorgaans warmer dan een lade; als
  -- dat verschil ertoe doet, staat het hier en niet op de machine.
  temp_min_c        numeric,
  temp_max_c        numeric,

  -- Wat er fysiek in past. gn_capaciteit is hoeveel bakken van dat formaat er
  -- naast elkaar in gaan: {"1/1-65": 1, "1/2-65": 2}.
  gn_capaciteit     jsonb,
  max_belading_kg   numeric,

  notitie           text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint opslag_locaties_soort_geldig
    check (soort in ('lade', 'deurvak', 'plank', 'zone', 'rooster', 'bak')),
  unique (organization_id, code)
);

comment on table public.opslag_locaties is
  'Bewaarplekken binnen een apparaat of ruimte. Een gekoelde werkbank met vier '
  'laden en een deurvak is vijf locaties, niet één. Maakt uitspraken mogelijk '
  'als "pak de pulled pork uit PN229-L2".';

comment on column public.opslag_locaties.code is
  'Korte, uitspreekbare aanduiding zoals PN229-L2. Uniek per organisatie, want '
  'hij wordt gebruikt om naar te verwijzen — dubbele codes maken dat onbruikbaar.';

comment on column public.opslag_locaties.gn_capaciteit is
  'Hoeveel gastronorm-bakken van welk formaat erin passen: {"1/1-65": 1}. '
  'Codes verwijzen naar gn_maten. Leeg laten als je het niet zeker weet — een '
  'geraden capaciteit laat later een bak niet passen.';

create index if not exists idx_opslag_locaties_materieel
  on public.opslag_locaties (organization_id, materieel_id, volgorde);

-- ─── RLS ───────────────────────────────────────────────────────────────
alter table public.opslag_locaties enable row level security;

drop policy if exists opslag_locaties_select on public.opslag_locaties;
create policy opslag_locaties_select on public.opslag_locaties
  for select to authenticated
  using (organization_id in (select private.user_org_ids()));

drop policy if exists opslag_locaties_insert on public.opslag_locaties;
create policy opslag_locaties_insert on public.opslag_locaties
  for insert to authenticated
  with check (organization_id in (select private.user_org_ids()));

drop policy if exists opslag_locaties_update on public.opslag_locaties;
create policy opslag_locaties_update on public.opslag_locaties
  for update to authenticated
  using      (organization_id in (select private.user_org_ids()))
  with check (organization_id in (select private.user_org_ids()));

drop policy if exists opslag_locaties_delete on public.opslag_locaties;
create policy opslag_locaties_delete on public.opslag_locaties
  for delete to authenticated
  using (organization_id in (select private.user_org_ids()));

-- ════════════════════════════════════════════════════════════════════════
-- Einde migratie
-- ════════════════════════════════════════════════════════════════════════
