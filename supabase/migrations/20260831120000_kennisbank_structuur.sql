-- ════════════════════════════════════════════════════════════════════════
-- Kennisbank — de laag waar de AI-kok zijn kennis vandaan haalt
-- ════════════════════════════════════════════════════════════════════════
-- Zie docs/agent-architectuur-plan.md hoofdstuk 5 en 6.
--
-- Drie soorten kennis, en ze horen strikt gescheiden te blijven:
--
--   1. Samenstelling en aroma  — natuurkunde en scheikunde. Verandert niet per
--      cateraar. Komt uit NEVO (RIVM) en FlavorDB2, wordt geïmporteerd.
--   2. Functie en vakkennis    — wat bindt, wat schift, welke dosering. Wordt
--      door de AI voorgesteld en door de kok goedgekeurd, per productgroep.
--   3. Prijs en bestelbaarheid — komt NOOIT hier maar altijd uit de eigen
--      leverancierscatalogus. Anders wordt de kennisbank een echo van zichzelf.
--
-- Daarom staan de eerste twee in tabellen ZONDER organization_id: het is
-- naslag, geen bedrijfsdata — zelfde keuze als gn_sizes in het plan. Een
-- tweede cateraar kan dezelfde kennisbank gebruiken. Alleen het profiel van
-- een eigen gerecht is per tenant, en dat staat onderaan.
--
-- Wat deze migratie toevoegt:
--   1. smaak_assen        — de zes assen met hun waarnemingsdrempels (feiten)
--   2. ingredient_profielen — per ingrediënt-soort, niet per artikelnummer
--   3. technieken         — schuim, gel, karamel: wat een techniek nodig heeft
--   4. balans_correcties  — "te zoet → zuur erbij" als opzoektabel
--   5. gerecht_profielen  — het profiel van één eigen gerecht (wél per tenant)
--
-- Schrijven doet alleen de import (service-role). Lezen mag iedereen die is
-- ingelogd — het is naslag, er zit niets gevoeligs in.

-- ─── 1. De zes smaakassen ──────────────────────────────────────────────
-- Wageningen traint sensorische panels op precies deze zes. We nemen die
-- indeling over zodat onze bibliotheek aansluit op bestaand onderzoek in
-- plaats van op een eigen bedenksel.
--
-- Waarom drempelwaarden erbij: smaken worden niet op dezelfde schaal
-- waargenomen. Bitter is bij 0,1% al vol aanwezig terwijl zoet daar nog niet
-- eens begint — een factor 400. Een balans-balk in gewichtsprocent vergelijkt
-- dus appels met peren. Delen door de drempel maakt ze pas vergelijkbaar.
create table if not exists public.smaak_assen (
  code            text primary key,
  naam            text        not null,
  referentiestof  text,
  drempel_pct     numeric,
  sterk_pct       numeric,
  bron            text,
  created_at      timestamptz not null default now()
);

comment on table public.smaak_assen is
  'De zes assen uit Nederlands sensorisch onderzoek, met de concentratie waarbij '
  'een smaak nog nét waarneembaar is en waarbij hij vol aanwezig is. Intensiteit '
  '= concentratie / drempel_pct — pas dán zijn assen onderling vergelijkbaar.';

insert into public.smaak_assen (code, naam, referentiestof, drempel_pct, sterk_pct, bron) values
  ('zoet',       'Zoet',       'sucrose',          0.0098,  40.0,  'drempelonderzoek basissmaken'),
  ('zout',       'Zout',       'natriumchloride',  0.0049,  20.0,  'drempelonderzoek basissmaken'),
  ('umami',      'Umami',      'mononatriumglutamaat', 0.00049, 2.0, 'drempelonderzoek basissmaken'),
  ('zuur',       'Zuur',       'wijnsteenzuur',    0.00039,  1.6,  'drempelonderzoek basissmaken'),
  ('bitter',     'Bitter',     'kinine',           0.00002,  0.1,  'drempelonderzoek basissmaken'),
  ('vetgevoel',  'Vetgevoel',  null,               null,     null, 'mondgevoel — geen opgeloste stof, dus geen drempel')
on conflict (code) do nothing;

-- ─── 2. Ingrediënt-profielen ───────────────────────────────────────────
-- Op SOORT, niet op artikelnummer. Vijfduizend catalogusartikelen hangen aan
-- een paar honderd soorten; een profiel per artikel bijhouden is niet vol te
-- houden en levert niets extra's op.
--
-- Twee drempels in plaats van één "intensiteit 1-5": een chili-krokantje kan
-- naar chili smaken zonder pittig te zijn. Smaak-identiteit en prikkel zijn
-- twee losse dingen, en juist daar zit het vakmanschap.
create table if not exists public.ingredient_profielen (
  slug              text primary key,
  naam              text        not null,
  productgroep      text,

  -- Geïmporteerd (NEVO). Geen AI komt hieraan.
  vet_pct           numeric,
  vocht_pct         numeric,
  eiwit_pct         numeric,
  zout_pct          numeric,
  suiker_pct        numeric,
  ph                numeric,
  dichtheid_g_per_ml numeric,

  -- Voorgesteld door AI, goedgekeurd door de kok.
  rol               text,          -- basis | bindmiddel | zuur | zout | vet | umami | aroma | hitte | textuur | kleur
  smaakpalet        text[],        -- fris, citrus, rokerig
  smaakregister     text[],        -- Mexicaans, mediterraan, Frans-klassiek
  aroma_drempel_pct numeric,       -- vanaf hier próéf je het
  prikkel_drempel_pct numeric,     -- vanaf hier gaat het prikken
  dosering_min_pct  numeric,
  dosering_max_pct  numeric,
  hitte_gedrag      text,          -- smelt glad | schift | verdampt | stabiel
  structuur_effect  text,          -- bindt | verdunt | verdikt | schift-risico
  textuur_eind      text,
  kleur             text,
  stappen_kosten    int,

  -- Aroma-laag (FlavorDB2) — later, daarom nu nullable.
  aroma_componenten text[],

  bron              text,
  goedgekeurd_op    timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

comment on table public.ingredient_profielen is
  'Naslag per ingrediënt-SOORT. Bewust zonder organization_id: dit zijn '
  'culinaire feiten, geen bedrijfsdata. Prijs en bestelbaarheid horen hier '
  'NIET — die komen uit de leverancierscatalogus.';

comment on column public.ingredient_profielen.aroma_drempel_pct is
  'Vanaf welk percentage van de basis je het ingrediënt proeft. Chili ~0,2%.';
comment on column public.ingredient_profielen.prikkel_drempel_pct is
  'Vanaf welk percentage de prikkel erbij komt. Chili ~1,5% — daaronder wel '
  'chili-smaak, geen hitte.';

create index if not exists idx_ingredient_profielen_groep
  on public.ingredient_profielen (productgroep);

-- ─── 3. Technieken ─────────────────────────────────────────────────────
-- De ingrediëntenbibliotheek kent kokos. Hij weet niet wat een schuim is.
-- Zonder deze tabel moet het model de methode verzinnen, en dat is precies
-- waar het overtuigend de mist in gaat.
--
-- `vereist_eigenschap` maakt van "kan kokos schuimen?" een som in plaats van
-- een mening: kokosmelk heeft vet én eiwit dus schuimt, een waterig sap niet.
create table if not exists public.technieken (
  slug                text primary key,
  naam                text        not null,
  omschrijving        text,
  vereist_basis       text,        -- vloeistof | puree | vast
  vereist_eigenschap  jsonb,       -- {"vet_pct_min": 15} of {"eiwit_pct_min": 2}
  hulpmiddel          text,        -- lecithine | gelatine | agar | room | eiwit
  dosering_min_pct    numeric,
  dosering_max_pct    numeric,
  eindtextuur         text,
  apparaat            text,        -- koppelt straks aan de apparatuur-lijst
  standtijd_min       int,         -- hoe lang blijft het goed op de uitgifte
  transport_bestendig boolean,
  stappen             int,
  bron                text,
  goedgekeurd_op      timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

comment on table public.technieken is
  'Wat een techniek nodig heeft en wat hij oplevert. standtijd_min en '
  'transport_bestendig zijn de cateringgrens: een schuim dat na vier minuten '
  'inzakt is prachtig in een restaurant en waardeloos op de uitgifte.';

-- ─── 4. Balans-correcties ──────────────────────────────────────────────
-- "Te zoet → zuur, zout of bitter erbij." Een opzoektabel, geen oordeel.
-- Hiermee zegt het systeem niet alleen dát iets scheef zit maar ook wat
-- eraan te doen is — precies wat je aan het fornuis doet.
create table if not exists public.balans_correcties (
  klacht        text primary key,   -- te_zoet | te_zuur | te_zout | te_bitter | vlak | te_vet
  omschrijving  text not null,
  voeg_toe      text[] not null,    -- rollen die het rechttrekken, op volgorde
  toelichting   text,
  created_at    timestamptz not null default now()
);

comment on table public.balans_correcties is
  'Correctiematrix. Volgorde in voeg_toe is de volgorde waarin een kok het '
  'probeert — bij "vlak" eerst zout, dan pas zuur.';

-- ─── 5. Profiel van een eigen gerecht ──────────────────────────────────
-- Dit is wél per tenant: het gaat over jouw gerecht, niet over een ingrediënt.
-- Voedt het componentprofiel (de PDF) en straks de receptuur-ontwerper.
--
-- gerechten.id is een uuid. Let op: src/types/database.types.ts zegt `number`
-- en dat klopt niet — dat bestand wordt met de hand bijgehouden en is gedrift.
-- De migraties zijn de waarheid.
create table if not exists public.gerecht_profielen (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid        not null references public.organizations(id) on delete cascade,
  gerecht_id        uuid        not null,

  -- De zes assen, als waargenomen intensiteit (0-100), niet als gewichtsprocent.
  as_zoet           numeric,
  as_zuur           numeric,
  as_bitter         numeric,
  as_umami          numeric,
  as_zout           numeric,
  as_vetgevoel      numeric,

  smaakpalet        text[],
  smaakregister     text[],
  textuur_eind      text,
  luidheid          text,        -- hoofdrol | ondersteunend | accent | correctie
  serveertemp_c     numeric,
  standtijd_min     int,
  transport_bestendig boolean,

  -- Balans-uitkomst, herrekend door code — nooit met de hand ingevuld.
  zout_pct_berekend numeric,
  balans_notitie    text,

  status            text        not null default 'voorstel'
                    check (status in ('voorstel', 'getest', 'vrijgegeven')),

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  unique (organization_id, gerecht_id)
);

comment on table public.gerecht_profielen is
  'Het smaak- en structuurprofiel van één eigen gerecht. Status vrijgegeven is '
  'voorwaarde om aan een menu gekoppeld te worden: een doseringsvoorstel dat '
  'ongetest op een bord belandt is een gok met de reputatie.';

comment on column public.gerecht_profielen.luidheid is
  'Precies één component in een gerecht mag hoofdrol zijn. Drie uitgesproken '
  'elementen naast elkaar is de meest gemaakte fout, en die is te tellen.';

create index if not exists idx_gerecht_profielen_org
  on public.gerecht_profielen (organization_id, gerecht_id);

-- ─── RLS ───────────────────────────────────────────────────────────────
-- Naslag: iedereen die is ingelogd mag lezen, niemand mag schrijven via de
-- app. De import draait met de service-role en gaat langs RLS heen.
alter table public.smaak_assen          enable row level security;
alter table public.ingredient_profielen enable row level security;
alter table public.technieken           enable row level security;
alter table public.balans_correcties    enable row level security;

drop policy if exists smaak_assen_select on public.smaak_assen;
create policy smaak_assen_select on public.smaak_assen
  for select to authenticated using (true);

drop policy if exists ingredient_profielen_select on public.ingredient_profielen;
create policy ingredient_profielen_select on public.ingredient_profielen
  for select to authenticated using (true);

drop policy if exists technieken_select on public.technieken;
create policy technieken_select on public.technieken
  for select to authenticated using (true);

drop policy if exists balans_correcties_select on public.balans_correcties;
create policy balans_correcties_select on public.balans_correcties
  for select to authenticated using (true);

-- Gerecht-profielen zijn wél bedrijfsdata: zelfde org-patroon als de rest.
alter table public.gerecht_profielen enable row level security;

drop policy if exists gerecht_profielen_select on public.gerecht_profielen;
create policy gerecht_profielen_select on public.gerecht_profielen
  for select to authenticated
  using (organization_id in (select private.user_org_ids()));

drop policy if exists gerecht_profielen_insert on public.gerecht_profielen;
create policy gerecht_profielen_insert on public.gerecht_profielen
  for insert to authenticated
  with check (organization_id in (select private.user_org_ids()));

drop policy if exists gerecht_profielen_update on public.gerecht_profielen;
create policy gerecht_profielen_update on public.gerecht_profielen
  for update to authenticated
  using      (organization_id in (select private.user_org_ids()))
  with check (organization_id in (select private.user_org_ids()));

drop policy if exists gerecht_profielen_delete on public.gerecht_profielen;
create policy gerecht_profielen_delete on public.gerecht_profielen
  for delete to authenticated
  using (organization_id in (select private.user_org_ids()));

-- ════════════════════════════════════════════════════════════════════════
-- Einde migratie
-- ════════════════════════════════════════════════════════════════════════
