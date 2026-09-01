-- ════════════════════════════════════════════════════════════════════════
-- gerechten — de tabel die nooit in versiebeheer stond
-- ════════════════════════════════════════════════════════════════════════
-- Blokker 2 uit docs/agent-architectuur-plan.md hoofdstuk 3, open sinds het
-- begin. `gerechten` is ooit met de hand in Supabase aangemaakt; alle 126
-- migraties doen er alleen `ALTER` op. Een verse omgeving heeft die tabel dus
-- niet, en struikelt op de eerste ALTER — dat is 005_ai_audit_trail.sql.
--
-- Vandaar de naam. Bestandsnamen bepalen de volgorde, en deze moet dus vóór 005
-- draaien maar ná 001 (daar worden `organizations` en `private.user_org_ids()`
-- aangemaakt, en die heeft hij allebei nodig). "001a" sorteert precies daar:
-- ná "001_" en vóór "002_".
--
-- Op de bestaande productie-database verandert deze migratie NIETS. Elke stap
-- staat onder een `if not exists`, en de tabel bestaat daar al sinds maart.
--
-- De definitie is uitgelezen uit de draaiende database op 2026-09-01, niet
-- gereconstrueerd uit wat de migraties beweren. Dat onderscheid is vandaag al
-- twee keer duur geweest: een migratiebestand beschrijft wat er ooit is
-- gevraagd, niet wat er nu staat.
--
-- LET OP — twee tabellen hebben hetzelfde probleem en zijn hier NIET opgelost:
-- `gangen` en `ai_conversations` staan evenmin in versiebeheer. De foreign keys
-- daarnaartoe staan daarom onder een voorwaarde: bestaat de doeltabel niet, dan
-- wordt de sleutel overgeslagen met een melding in plaats van de hele migratie
-- te laten klappen. Zolang die twee ontbreken is een verse omgeving nog steeds
-- niet compleet — maar wel een stuk verder dan nu.

create table if not exists public.gerechten (
    id                    uuid primary key default gen_random_uuid(),
    naam                  text not null,
    beschrijving          text default ''::text,
    gang_slug             text,
    volgorde              integer default 0,
    actief                boolean default true,
    created_at            timestamptz default now(),
    foto_url              text,
    ingredienten          text[] default '{}'::text[],
    bereidingswijze       text default ''::text,
    allergenen            text[] default '{}'::text[],
    tags                  text[] default '{}'::text[],
    kostprijs_pp          numeric default 0,
    service_image         text,
    battle_plan_steps     jsonb default '[]'::jsonb,
    target_prep_time      integer default 0,
    hardware_items        jsonb default '[]'::jsonb,
    ingredienten_winkels  jsonb default '{}'::jsonb,
    ingredient_costs      jsonb default '[]'::jsonb,
    verkoopprijs          numeric default 0,
    pos_enabled           boolean default false,
    pos_categorie         text default 'main'::text,
    pos_prijs             numeric,
    pos_volgorde          integer default 0,
    btw_tarief            numeric default 9,
    organization_id       uuid,
    ai_conversation_id    bigint,
    pijnpunten            text[] not null default '{}'::text[],
    toppunten             text[] not null default '{}'::text[],
    marge_pct             numeric,
    foto_prompt           text,
    porties               integer default 10,
    wijn_suggestie        text,
    service_tip           text,
    is_in_wizard          boolean not null default true,
    total_cost_cents      integer not null default 0,
    status                text not null default 'actief'::text,
    bron                  text default 'manual'::text,
    beschrijving_blocks   jsonb,
    doel_marge_pct        numeric,

    constraint gerechten_status_check
        check (status = any (array['concept'::text, 'review_nodig'::text, 'actief'::text, 'inactief'::text])),
    constraint gerechten_bron_check
        check (bron = any (array['manual'::text, 'ai'::text]))
);

comment on table public.gerechten is
  'De gerechtenkaart. Deze CREATE TABLE is op 2026-09-01 uit de draaiende '
  'database gelezen en toegevoegd omdat de tabel tot dan toe alleen met de hand '
  'bestond; alle eerdere migraties deden er uitsluitend ALTER op.';

-- ─── Foreign keys ──────────────────────────────────────────────────────
-- organizations komt uit 001 en is er dus altijd.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'gerechten_organization_id_fkey')
     and exists (select 1 from information_schema.tables
                 where table_schema = 'public' and table_name = 'organizations') then
    alter table public.gerechten
      add constraint gerechten_organization_id_fkey
      foreign key (organization_id) references public.organizations(id) on delete cascade;
  end if;
end $$;

-- gangen staat zelf niet in versiebeheer — zie de kop van dit bestand.
do $$
begin
  if not exists (select 1 from information_schema.tables
                 where table_schema = 'public' and table_name = 'gangen') then
    raise notice 'gangen bestaat niet — foreign key gerechten.gang_slug overgeslagen';
  elsif not exists (select 1 from pg_constraint where conname = 'gerechten_gang_slug_fkey') then
    alter table public.gerechten
      add constraint gerechten_gang_slug_fkey
      foreign key (gang_slug) references public.gangen(slug);
  end if;
end $$;

-- ai_conversations idem.
do $$
begin
  if not exists (select 1 from information_schema.tables
                 where table_schema = 'public' and table_name = 'ai_conversations') then
    raise notice 'ai_conversations bestaat niet — foreign key gerechten.ai_conversation_id overgeslagen';
  elsif not exists (select 1 from pg_constraint where conname = 'gerechten_ai_conversation_id_fkey') then
    alter table public.gerechten
      add constraint gerechten_ai_conversation_id_fkey
      foreign key (ai_conversation_id) references public.ai_conversations(id) on delete set null;
  end if;
end $$;

-- ─── Indexen ───────────────────────────────────────────────────────────
-- De unieke index op de primaire sleutel maakt Postgres zelf; die staat hier
-- bewust niet, anders botst hij met de constraint hierboven.
create index if not exists idx_gerechten_org
  on public.gerechten using btree (organization_id);

create index if not exists idx_gerechten_gang_slug
  on public.gerechten using btree (gang_slug);

create index if not exists idx_gerechten_status_org
  on public.gerechten using btree (organization_id, status);

create index if not exists idx_gerechten_org_wizard
  on public.gerechten using btree (organization_id, is_in_wizard)
  where (is_in_wizard = true);

create index if not exists gerechten_ai_conv_idx
  on public.gerechten using btree (ai_conversation_id)
  where (ai_conversation_id is not null);

-- ─── RLS ───────────────────────────────────────────────────────────────
-- Alleen aanmaken wat er nog niet is. Bestaande policies laten we met rust:
-- een drop-and-recreate op productie zou een tenant-scheiding heel even
-- openzetten, en daar is geen enkele reden voor.
alter table public.gerechten enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies
                 where schemaname = 'public' and tablename = 'gerechten' and policyname = 'org_select') then
    create policy org_select on public.gerechten
      for select to authenticated
      using (organization_id in (select private.user_org_ids()));
  end if;

  if not exists (select 1 from pg_policies
                 where schemaname = 'public' and tablename = 'gerechten' and policyname = 'org_insert') then
    create policy org_insert on public.gerechten
      for insert to authenticated
      with check (organization_id in (select private.user_org_ids()));
  end if;

  if not exists (select 1 from pg_policies
                 where schemaname = 'public' and tablename = 'gerechten' and policyname = 'org_update') then
    create policy org_update on public.gerechten
      for update to authenticated
      using (organization_id in (select private.user_org_ids()));
  end if;

  if not exists (select 1 from pg_policies
                 where schemaname = 'public' and tablename = 'gerechten' and policyname = 'org_delete') then
    create policy org_delete on public.gerechten
      for delete to authenticated
      using (organization_id in (select private.user_org_ids()));
  end if;
end $$;

-- ════════════════════════════════════════════════════════════════════════
-- Einde migratie
-- ════════════════════════════════════════════════════════════════════════
