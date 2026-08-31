-- ════════════════════════════════════════════════════════════════════════
-- mep_items koppelen aan gerechten — de blokker uit hoofdstuk 3
-- ════════════════════════════════════════════════════════════════════════
-- Het plandocument noemde dit een typefout: `mep_items.gerecht_id` zou INTEGER
-- zijn terwijl `gerechten.id` een uuid is, waardoor koppelen onmogelijk was.
--
-- Bij nameten op de live database blijkt dat maar half te kloppen, en dat is
-- een correctie waard:
--
--   * Het TYPE is gewoon uuid. De migratie 20260621120000_create_mep_items.sql
--     zegt INTEGER, maar de kolom is later buiten de migraties om aangepast.
--     Weer schema-drift, net als bij `gerechten` zelf.
--   * Wat er écht ontbreekt is de FOREIGN KEY. Zonder die sleutel bewaakt de
--     database niets en kan PostgREST de relatie niet inbedden — een query als
--     `select('id, gerechten(naam)')` geeft "could not find a relationship".
--
-- Les voor de volgende keer: een migratiebestand beschrijft wat er ooit is
-- gevraagd, niet wat er nu staat. Nameten in de database is de enige waarheid.
--
-- Vooraf gecontroleerd: alle negen bestaande rijen verwijzen naar bestaande
-- gerechten en componenten, dus de sleutel kan er zonder opschonen op.
--
-- LET OP: dit legt een harde afhankelijkheid op `gerechten`, en die tabel heeft
-- nog steeds geen CREATE TABLE in versiebeheer. Op een verse omgeving faalt
-- deze migratie daarom. Dat is de tweede blokker uit hoofdstuk 3 en die staat
-- nog open — vandaar de guard hieronder, zodat een verse omgeving doorloopt in
-- plaats van te struikelen.

do $$
begin
  -- Alleen aanbrengen als gerechten bestaat, de kolom uuid is, en de sleutel er
  -- nog niet op zit. Elke aanname expliciet controleren in plaats van hopen.
  if not exists (select 1 from information_schema.tables
                 where table_schema = 'public' and table_name = 'gerechten') then
    raise notice 'gerechten bestaat niet in dit schema — foreign key overgeslagen';
    return;
  end if;

  if not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'mep_items'
                   and column_name = 'gerecht_id' and data_type = 'uuid') then
    raise notice 'mep_items.gerecht_id is geen uuid — foreign key overgeslagen, eerst het type rechtzetten';
    return;
  end if;

  if exists (select 1 from pg_constraint where conname = 'mep_items_gerecht_id_fkey') then
    raise notice 'foreign key bestaat al';
    return;
  end if;

  -- Verweesde verwijzingen eerst op null zetten: liever een lege koppeling dan
  -- een migratie die halverwege afbreekt op data van maanden geleden.
  update public.mep_items m
     set gerecht_id = null
   where m.gerecht_id is not null
     and not exists (select 1 from public.gerechten g where g.id = m.gerecht_id);

  alter table public.mep_items
    add constraint mep_items_gerecht_id_fkey
    foreign key (gerecht_id) references public.gerechten(id) on delete set null;

  raise notice 'foreign key mep_items -> gerechten aangebracht';
end $$;

comment on column public.mep_items.gerecht_id is
  'Verwijst naar gerechten.id (uuid). De aanmaakmigratie zegt INTEGER; dat is '
  'achterhaald — de kolom is later buiten de migraties om naar uuid gezet.';

-- Zoeken op gerecht binnen een event is de vraag die de prep-planning stelt.
create index if not exists idx_mep_items_gerecht
  on public.mep_items (organization_id, gerecht_id);

-- ════════════════════════════════════════════════════════════════════════
-- Einde migratie
-- ════════════════════════════════════════════════════════════════════════
