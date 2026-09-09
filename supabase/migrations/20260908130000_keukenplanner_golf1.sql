-- ════════════════════════════════════════════════════════════════════════
-- Keukenplanner golf 1 — het skelet
-- ════════════════════════════════════════════════════════════════════════
-- Zie docs/keukenplanner-bouwplan.md (versie 5). Deze migratie voegt toe wat
-- de planner nodig heeft en verandert niets aan wat er staat. Alles additief:
-- nieuwe kolommen zijn NULL-baar, nieuwe tabellen zijn leeg. Bestaande code
-- die `recipe_steps` of `prep_tasks` leest merkt er niets van.
--
-- Vier ideeën die je in de kolomnamen terugziet:
--   1. Duur is opgesplitst in vast + per eenheid (actief) en een referentie-
--      duur bij een referentie-stukgewicht (passief). §2.3
--   2. Een apparaat moet aangezet worden en heeft opwarmtijd. §2.5
--   3. Passief betekent niet altijd weglopen — natspuiten elk half uur bindt
--      je aan de plek. §2.7
--   4. Een gaarstap eindigt op een waarneming, niet op de klok. §2.6

-- ─── 1. Receptstappen — de kern ────────────────────────────────────────

alter table public.recipe_steps
  -- Genormaliseerd werkwoord. Samen met component_id de batchsleutel:
  -- "snijden" alleen is te grof (ui, wortel en bosui worden dan één batch).
  add column if not exists bewerking_code        text,
  -- Actieve tijd = vast + per eenheid × hoeveelheid. Het klaarzetten van de
  -- machine schaalt niet mee met de kilo's, het snijden wel.
  add column if not exists duur_vast_min         integer,
  add column if not exists duur_per_eenheid_min  numeric,
  -- Bij welk stukgewicht hoort duur_passief_min. Roken schaalt met het
  -- formaat van het stuk, niet met het aantal. Leeg = niet schalen.
  add column if not exists passief_ref_kg        numeric,
  -- Echte verwijzingen naast de bestaande vrije tekst in station/apparaat.
  add column if not exists station_id            bigint,
  add column if not exists materieel_id          integer,
  add column if not exists haccp_vereist         boolean not null default false,
  -- Bepaalt hoe ver vooruit gebatcht mag worden.
  add column if not exists houdbaarheid_na_dagen integer default 3,
  -- Waar de duur vandaan komt. Het scherm laat dit zien; een schatting die
  -- doorgaat voor een meting is de fout die dit systeem doodmaakt.
  add column if not exists duur_bron             text not null default 'geschat',
  -- Gezet door de spreidingsbewaker: er zit iets in deze stap verstopt dat
  -- varieert. Staat uit voor passieve stappen (die halen die factor altijd).
  add column if not exists splitsen_gevlagd      boolean not null default false,
  -- Gebonden passief: elk `interval` minuten `duur` minuten werk. Natspuiten.
  add column if not exists herhaal_interval_min  integer,
  add column if not exists herhaal_duur_min      integer;

do $$ begin
  alter table public.recipe_steps
    add constraint recipe_steps_station_fk
    foreign key (station_id) references public.kitchen_stations(id) on delete set null;
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.recipe_steps
    add constraint recipe_steps_materieel_fk
    foreign key (materieel_id) references public.materieel(id) on delete set null;
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.recipe_steps
    add constraint recipe_steps_duur_bron_geldig
    check (duur_bron = any (array['geschat', 'monitor', 'gemeten', 'handmatig', 'verwacht']));
exception when duplicate_object then null; end $$;

-- Herhaling is alleen zinnig als beide velden gevuld zijn en de handeling
-- binnen het interval past. Elk half uur twintig minuten spuiten is geen
-- gebonden passief meer maar gewoon werk.
do $$ begin
  alter table public.recipe_steps
    add constraint recipe_steps_herhaling_compleet
    check (
      (herhaal_interval_min is null and herhaal_duur_min is null)
      or (herhaal_interval_min > 0 and herhaal_duur_min > 0
          and herhaal_duur_min < herhaal_interval_min)
    );
exception when duplicate_object then null; end $$;

create index if not exists idx_recipe_steps_bewerking
  on public.recipe_steps (organization_id, bewerking_code, component_id)
  where bewerking_code is not null;

comment on column public.recipe_steps.bewerking_code is
  'Genormaliseerd werkwoord. Batchsleutel is bewerking_code + component_id + materieel_id — het werkwoord alleen is te grof.';
comment on column public.recipe_steps.passief_ref_kg is
  'Stukgewicht waarbij duur_passief_min hoort. Passief schaalt met het formaat van het stuk, niet met het aantal.';
comment on column public.recipe_steps.herhaal_interval_min is
  'Gebonden passief: elk zoveel minuten een korte handeling (natspuiten). Bindt de kok aan de plek — het gat is dan alleen vulbaar met kort werk op hetzelfde station.';

-- updated_at had wel een default maar geen trigger; de kolom bleef dus staan
-- op created_at. Hier gerepareerd, want vanaf nu wordt er echt geschreven.
--
-- public.set_updated_at() bestaat al en is SECURITY DEFINER met een lege
-- search_path. Die NIET opnieuw definiëren: een `create or replace` zou die
-- instellingen stilletjes weggooien voor elke andere tabel die hem gebruikt.
drop trigger if exists recipe_steps_set_updated_at on public.recipe_steps;
create trigger recipe_steps_set_updated_at
  before update on public.recipe_steps
  for each row execute function public.set_updated_at();

-- ─── 2. Apparaten ──────────────────────────────────────────────────────
-- De machinelijst bestaat al (41 rijen). Alleen wat de planner mist.

alter table public.materieel
  -- Het lopen en op de knop drukken. Echt actief werk, met looptijd eraan.
  add column if not exists aanzet_min       integer default 1,
  add column if not exists opwarm_min       integer,
  add column if not exists schoonmaak_min   integer,
  -- Hoe lang hij warm blijft ALS hij aan blijft. Leeg = koelt af, dus opnieuw
  -- opwarmen. Bewust geen default: de Yoder aanhouden kost pellets, dus
  -- aanhouden is een keuze per machine en niet iets om aan te nemen.
  add column if not exists warm_blijft_min  integer,
  add column if not exists exclusief_bezet  boolean not null default true;

comment on column public.materieel.warm_blijft_min is
  'Hoe lang dit apparaat warm blijft als het aan blijft staan. LEEG = koelt af en moet opnieuw opwarmen — de veilige en meestal goedkoopste kant.';

-- ─── 3. Stations: soorten werk én plekken in één tabel ─────────────────
-- De vijf bestaande rijen (Koud, Smoker, Warm, Sauzen, Expeditie) zijn
-- soorten werk en blijven staan als niet-fysiek. De echte keuken komt erbij
-- als fysieke rijen zodra de slagerij is opgemeten.

alter table public.kitchen_stations
  add column if not exists is_fysiek  boolean not null default false,
  add column if not exists nummer     integer,
  add column if not exists exclusief  boolean not null default false;

create table if not exists public.station_afstanden (
  id               bigserial primary key,
  organization_id  uuid    not null references public.organizations(id) on delete cascade,
  van_station_id   bigint  not null references public.kitchen_stations(id) on delete cascade,
  naar_station_id  bigint  not null references public.kitchen_stations(id) on delete cascade,
  -- Leeg is onbekend, niet nul. De planner rekent dan met looptijd nul en
  -- zegt erbij dat de afstanden nog niet opgemeten zijn.
  meters           numeric,
  seconden         integer,
  bron             text    not null default 'geschat',
  created_at       timestamptz not null default now(),
  constraint station_afstanden_uniek unique (organization_id, van_station_id, naar_station_id),
  constraint station_afstanden_niet_zichzelf check (van_station_id <> naar_station_id),
  constraint station_afstanden_bron_geldig check (bron = any (array['gemeten', 'geschat']))
);

comment on table public.station_afstanden is
  'Opgemeten loopafstanden tussen fysieke stations. Leeg veld = onbekend; nooit een geschatte matrix invullen die eruitziet als meting.';

alter table public.station_afstanden enable row level security;

drop policy if exists station_afstanden_select on public.station_afstanden;
drop policy if exists station_afstanden_insert on public.station_afstanden;
drop policy if exists station_afstanden_update on public.station_afstanden;
drop policy if exists station_afstanden_delete on public.station_afstanden;

create policy station_afstanden_select on public.station_afstanden
  for select to authenticated using (organization_id in (select private.user_org_ids()));
create policy station_afstanden_insert on public.station_afstanden
  for insert to authenticated with check (organization_id in (select private.user_org_ids()));
create policy station_afstanden_update on public.station_afstanden
  for update to authenticated
  using (organization_id in (select private.user_org_ids()))
  with check (organization_id in (select private.user_org_ids()));
create policy station_afstanden_delete on public.station_afstanden
  for delete to authenticated using (organization_id in (select private.user_org_ids()));

-- ─── 4. Componenten: wat er in een bak gaat ────────────────────────────

alter table public.components
  add column if not exists dichtheid_kg_per_liter          numeric,
  -- Gewicht van één stuk. Bepaalt hoe lang een passieve gaarstap duurt.
  add column if not exists stuk_gewicht_kg                 numeric,
  add column if not exists per_stuk_aantal_per_bak         integer,
  add column if not exists aandrukken                      boolean,
  add column if not exists standaard_gn                    text,
  add column if not exists serveertemperatuur              text,
  add column if not exists houdbaarheid_na_bewerking_dagen integer;

do $$ begin
  alter table public.components
    add constraint components_standaard_gn_fk
    foreign key (standaard_gn) references public.gn_maten(code) on delete set null;
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.components
    add constraint components_serveertemp_geldig
    check (serveertemperatuur is null or serveertemperatuur = any (array['warm', 'koud']));
exception when duplicate_object then null; end $$;

-- ─── 5. Schoonmaaktaken — volwaardig planbaar werk ─────────────────────
-- Sjablonen. De instanties zijn gewone prep_tasks met schoonmaaktaak_id
-- gevuld: één takenstroom, één bord, één set knoppen.

create table if not exists public.schoonmaaktaken (
  id               bigserial primary key,
  organization_id  uuid    not null references public.organizations(id) on delete cascade,
  omschrijving     text    not null,
  duur_min         integer not null,
  station_id       bigint  references public.kitchen_stations(id) on delete set null,
  materieel_id     integer references public.materieel(id) on delete cascade,
  frequentie       text    not null default 'dagelijks',
  haccp_vereist    boolean not null default false,
  actief           boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint schoonmaaktaken_frequentie_geldig check (
    frequentie = any (array['per_gebruik', 'dagelijks', 'wekelijks', 'maandelijks'])
  ),
  constraint schoonmaaktaken_duur_positief check (duur_min > 0)
);

comment on table public.schoonmaaktaken is
  'Sjablonen voor schoonmaakwerk. Geen bijzaak: dit is het werk dat de passieve gaten vult. Instanties leven als prep_tasks.';

create index if not exists idx_schoonmaaktaken_org
  on public.schoonmaaktaken (organization_id, actief, frequentie);

alter table public.schoonmaaktaken enable row level security;

drop policy if exists schoonmaaktaken_select on public.schoonmaaktaken;
drop policy if exists schoonmaaktaken_insert on public.schoonmaaktaken;
drop policy if exists schoonmaaktaken_update on public.schoonmaaktaken;
drop policy if exists schoonmaaktaken_delete on public.schoonmaaktaken;

create policy schoonmaaktaken_select on public.schoonmaaktaken
  for select to authenticated using (organization_id in (select private.user_org_ids()));
create policy schoonmaaktaken_insert on public.schoonmaaktaken
  for insert to authenticated with check (organization_id in (select private.user_org_ids()));
create policy schoonmaaktaken_update on public.schoonmaaktaken
  for update to authenticated
  using (organization_id in (select private.user_org_ids()))
  with check (organization_id in (select private.user_org_ids()));
create policy schoonmaaktaken_delete on public.schoonmaaktaken
  for delete to authenticated using (organization_id in (select private.user_org_ids()));

drop trigger if exists schoonmaaktaken_set_updated_at on public.schoonmaaktaken;
create trigger schoonmaaktaken_set_updated_at
  before update on public.schoonmaaktaken
  for each row execute function public.set_updated_at();

-- ─── 6. Meethistorie: periodes en metingen ─────────────────────────────
-- Bij een verhuizing of een nieuw apparaat verandert de werkelijkheid in één
-- keer. Dan sluit je de periode af en begin je opnieuw. De schatter kijkt
-- alleen naar de lopende periode, dus oud en nieuw kunnen nooit door elkaar
-- gemiddeld worden.

create table if not exists public.meethistorie_periodes (
  id               bigserial primary key,
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  gestart_op       timestamptz not null default now(),
  afgesloten_op    timestamptz,
  reden            text,
  created_at       timestamptz not null default now()
);

comment on table public.meethistorie_periodes is
  'Een aaneengesloten stuk werkelijkheid. Sluit af bij verhuizing of nieuw apparaat; de schatter leest alleen de lopende periode.';

-- Eén lopende periode per organisatie.
create unique index if not exists idx_meethistorie_een_lopende
  on public.meethistorie_periodes (organization_id)
  where afgesloten_op is null;

create table if not exists public.taakmetingen (
  id                 bigserial primary key,
  organization_id    uuid    not null references public.organizations(id) on delete cascade,
  periode_id         bigint  not null references public.meethistorie_periodes(id) on delete cascade,
  recipe_step_id     uuid    references public.recipe_steps(id) on delete cascade,
  schoonmaaktaak_id  bigint  references public.schoonmaaktaken(id) on delete cascade,
  prep_task_id       integer references public.prep_tasks(id) on delete set null,
  -- Waarop geleerd wordt. Bij duizend gerechten haalt een losse receptstap
  -- nooit vijf metingen; dezelfde bewerking op hetzelfde component wel.
  bewerking_code     text,
  component_id       bigint  references public.components(id) on delete set null,
  werkelijke_min     numeric not null,
  hoeveelheid        numeric,
  eenheid            text,
  stuk_gewicht_kg    numeric,
  tijdstip_van_dag   smallint,
  -- Onderbroken metingen tellen niet mee, maar worden wel bewaard.
  onderbroken        boolean not null default false,
  bron               text    not null default 'gemeten',
  created_at         timestamptz not null default now(),
  constraint taakmetingen_hoort_ergens_bij check (
    recipe_step_id is not null or schoonmaaktaak_id is not null or bewerking_code is not null
  ),
  constraint taakmetingen_duur_positief check (werkelijke_min > 0),
  constraint taakmetingen_uur_geldig check (
    tijdstip_van_dag is null or (tijdstip_van_dag >= 0 and tijdstip_van_dag <= 23)
  ),
  constraint taakmetingen_bron_geldig check (bron = any (array['gemeten', 'klopt_niet']))
);

comment on table public.taakmetingen is
  'Eén rij per uitvoering. tijdstip_van_dag wordt vastgelegd maar nog niet gebruikt — later kan blijken dat dezelfde stap s middags langer duurt.';

create index if not exists idx_taakmetingen_stap
  on public.taakmetingen (organization_id, periode_id, recipe_step_id)
  where onderbroken = false;

-- De index waar de schatter echt op draait: leren gebeurt op de bewerking,
-- niet op de receptstap. Zie het gesprek over duizend gerechten.
create index if not exists idx_taakmetingen_bewerking
  on public.taakmetingen (organization_id, periode_id, bewerking_code, component_id)
  where onderbroken = false;

alter table public.meethistorie_periodes enable row level security;
alter table public.taakmetingen enable row level security;

drop policy if exists meethistorie_periodes_select on public.meethistorie_periodes;
drop policy if exists meethistorie_periodes_insert on public.meethistorie_periodes;
drop policy if exists meethistorie_periodes_update on public.meethistorie_periodes;

create policy meethistorie_periodes_select on public.meethistorie_periodes
  for select to authenticated using (organization_id in (select private.user_org_ids()));
create policy meethistorie_periodes_insert on public.meethistorie_periodes
  for insert to authenticated with check (organization_id in (select private.user_org_ids()));
create policy meethistorie_periodes_update on public.meethistorie_periodes
  for update to authenticated
  using (organization_id in (select private.user_org_ids()))
  with check (organization_id in (select private.user_org_ids()));

drop policy if exists taakmetingen_select on public.taakmetingen;
drop policy if exists taakmetingen_insert on public.taakmetingen;

-- Bewust geen update- of delete-policy: een meting is een waarneming.
-- Corrigeren gebeurt door een nieuwe meting met bron 'klopt_niet'.
create policy taakmetingen_select on public.taakmetingen
  for select to authenticated using (organization_id in (select private.user_org_ids()));
create policy taakmetingen_insert on public.taakmetingen
  for insert to authenticated with check (organization_id in (select private.user_org_ids()));

-- ─── 7. Productietaken ─────────────────────────────────────────────────

alter table public.prep_tasks
  add column if not exists schoonmaaktaak_id  bigint,
  add column if not exists materieel_id       integer,
  add column if not exists bewerking_code     text,
  -- Groepeert taken die samen één batch zijn; lading_nr splitst die batch
  -- als hij niet in één keer in het apparaat past.
  add column if not exists batch_id           uuid,
  add column if not exists lading_nr          smallint,
  add column if not exists stuk_gewicht_kg    numeric,
  -- Gerekend naast waargenomen. Zolang bevestigd_eind leeg is plant de
  -- planner op verwacht_eind en zegt erbij dat het een verwachting is.
  add column if not exists verwacht_eind      timestamptz,
  add column if not exists bevestigd_eind     timestamptz,
  add column if not exists looptijd_voor_min  integer;

do $$ begin
  alter table public.prep_tasks
    add constraint prep_tasks_schoonmaaktaak_fk
    foreign key (schoonmaaktaak_id) references public.schoonmaaktaken(id) on delete cascade;
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.prep_tasks
    add constraint prep_tasks_materieel_fk
    foreign key (materieel_id) references public.materieel(id) on delete set null;
exception when duplicate_object then null; end $$;

create index if not exists idx_prep_tasks_batch
  on public.prep_tasks (organization_id, batch_id) where batch_id is not null;

create index if not exists idx_prep_tasks_dag
  on public.prep_tasks (organization_id, scheduled_at)
  where status <> 'done';
