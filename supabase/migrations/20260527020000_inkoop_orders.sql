-- ════════════════════════════════════════════════════════════════════════════
--  Migration — concept_inkoop_orders (bucket D / P0-3)
--
--  Doel: persisteer concept-bestellingen die in /inkoop staan zodat we
--   (a) overrides ergens aan kunnen hangen (zie 20260527030000_order_overrides),
--   (b) "Verstuur naar Sligro" een audit-trail krijgt (sent_at, sent_to_email,
--       pdf_url),
--   (c) een UNIQUE-constraint hebben op één open concept per leverancier per
--       window — voorkomt dubbele orders bij parallelle scherm-sessies.
--
--  Status-flow: concept → sent → received (laatste wordt later via bon-match
--  ingevuld; in deze migratie alleen schema, geen workflow).
--
--  Defensive: alle DDL idempotent; CHECK-constraint op audit_log uitbreiden met
--  'concept_inkoop_orders' zodat audit-entries vanuit sendOrderToSupplier
--  geaccepteerd worden (memory-rule: feedback_migration_dependencies — eerst
--  checken of de oude constraint überhaupt bestaat).
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. concept_inkoop_orders ───────────────────────────────────────────────
create table if not exists public.concept_inkoop_orders (
    id                uuid primary key default gen_random_uuid(),
    organization_id   uuid   not null references public.organizations(id) on delete cascade,
    leverancier_id    integer references public.leveranciers(id) on delete set null,

    -- Window waarin demand is berekend. Per-leverancier per-window één concept
    -- toegestaan (zie partial unique index hieronder).
    window_start      date   not null,
    window_end        date   not null,

    status            text   not null default 'concept'
        check (status in ('concept','sent','received','cancelled')),

    -- Verstuur-metadata (gevuld door sendOrderToSupplier server action).
    sent_at           timestamptz,
    sent_to_email     text,
    pdf_url           text,
    -- Optionele notitie bij verzending (uit PDF preview-modal textarea).
    send_note         text,

    -- Snapshot van de items op het moment van verzenden zodat we niet
    -- afhankelijk zijn van demand-recomputes (events kunnen verschuiven).
    -- Tijdens concept-fase mag dit leeg blijven; bij send wordt het ingevuld.
    items             jsonb  not null default '[]'::jsonb,

    -- Berekende totalen op send-moment (zelfde reden als items).
    subtotal_eur      numeric(10,2),
    btw_laag_eur      numeric(10,2),   -- 9% (voedsel)
    btw_hoog_eur      numeric(10,2),   -- 21% (non-food, rookhout, services)
    total_eur         numeric(10,2),

    created_at        timestamptz not null default now(),
    updated_at        timestamptz not null default now(),
    created_by        uuid references auth.users(id) on delete set null
);

-- Updated_at trigger — hergebruik bestaande helper.
do $$
begin
    if not exists (select 1 from pg_proc where proname = 'set_updated_at' and pronamespace = 'public'::regnamespace) then
        create or replace function public.set_updated_at()
        returns trigger language plpgsql as $fn$
        begin
            new.updated_at := now();
            return new;
        end;
        $fn$;
    end if;
end$$;

drop trigger if exists trg_concept_inkoop_orders_updated_at on public.concept_inkoop_orders;
create trigger trg_concept_inkoop_orders_updated_at
    before update on public.concept_inkoop_orders
    for each row execute function public.set_updated_at();

-- ── 2. Indexes ─────────────────────────────────────────────────────────────
-- Policy-column index (memory-rule).
create index if not exists idx_concept_inkoop_orders_org
    on public.concept_inkoop_orders (organization_id);

-- Hoofd-query van /inkoop: alle concept orders van deze org, gesorteerd op
-- window_start (oudste eerst — naderbij deadlines bovenaan).
create index if not exists idx_concept_inkoop_orders_org_status_window
    on public.concept_inkoop_orders (organization_id, status, window_start);

-- Eén open concept per leverancier per window. Partial: alleen op status=concept,
-- zodat sent/received-orders niet de unique blokkeren.
-- NB: leverancier_id mag null zijn (unknown bucket) → die rijen blijven
-- ongedwongen (een partial unique index doet sowieso geen check op NULL).
create unique index if not exists ux_concept_inkoop_orders_active
    on public.concept_inkoop_orders (organization_id, leverancier_id, window_start)
    where status = 'concept' and leverancier_id is not null;

-- ── 3. RLS ─────────────────────────────────────────────────────────────────
alter table public.concept_inkoop_orders enable row level security;

drop policy if exists concept_inkoop_orders_select on public.concept_inkoop_orders;
drop policy if exists concept_inkoop_orders_insert on public.concept_inkoop_orders;
drop policy if exists concept_inkoop_orders_update on public.concept_inkoop_orders;
drop policy if exists concept_inkoop_orders_delete on public.concept_inkoop_orders;

create policy concept_inkoop_orders_select on public.concept_inkoop_orders
    for select to authenticated
    using (organization_id in (select private.user_org_ids()));

create policy concept_inkoop_orders_insert on public.concept_inkoop_orders
    for insert to authenticated
    with check (organization_id in (select private.user_org_ids()));

create policy concept_inkoop_orders_update on public.concept_inkoop_orders
    for update to authenticated
    using (organization_id in (select private.user_org_ids()))
    with check (organization_id in (select private.user_org_ids()));

create policy concept_inkoop_orders_delete on public.concept_inkoop_orders
    for delete to authenticated
    using (organization_id in (select private.user_org_ids()));

-- ── 4. audit_log CHECK uitbreiden ──────────────────────────────────────────
-- audit_log.record_table heeft een hardcoded CHECK (zie 017_audit_log.sql).
-- We breiden 'm uit met 'concept_inkoop_orders' zodat sendOrderToSupplier een
-- audit-entry kan schrijven. Defensive:
--   1. alleen vervangen als audit_log überhaupt bestaat (anders is 017 niet
--      gerund en hoort dit hier niet),
--   2. alle bestaande distinct record_table-waarden meenemen in de nieuwe
--      lijst — sommige projecten hebben de CHECK historisch versoepeld
--      (bv. service-role inserts) en die rijen mogen niet alsnog faillen,
--   3. NOT VALID gebruiken zodat Postgres niet over de hele tabel scant en
--      ook eventuele future-edge-case-rijen niet alsnog blokkeert (audit_log
--      is append-only, dus achteraf valideren is veilig maar niet vereist).
do $audit$
declare
    has_audit_table boolean;
    cur_def         text;
    existing_vals   text;
    full_list       text;
begin
    select exists (
        select 1 from information_schema.tables
         where table_schema = 'public' and table_name = 'audit_log'
    ) into has_audit_table;

    if not has_audit_table then
        raise notice '[concept_inkoop_orders] audit_log table not found — skipping CHECK extension';
        return;
    end if;

    -- Distinct bestaande record_table-waarden uit audit_log (mogen leeg zijn).
    select string_agg(distinct quote_literal(record_table), ',')
      into existing_vals
      from public.audit_log;

    -- Combineer bestaand + canon-lijst + concept_inkoop_orders. Daarna dedupe
    -- via string_to_array → distinct → array_to_string.
    full_list := array_to_string(array(
        select distinct trim(v)
          from unnest(string_to_array(
              coalesce(existing_vals || ',', '')
                  || '''gerechten'',''offertes'',''facturen'',''menu_templates'',''concept_inkoop_orders''',
              ','
          )) as v
         where trim(v) <> ''
    ), ',');

    -- Naam van de bestaande CHECK opzoeken (kan auto-gegenereerd zijn).
    select conname into cur_def
    from pg_constraint
    where conrelid = 'public.audit_log'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) like '%record_table%';

    if cur_def is not null then
        execute format('alter table public.audit_log drop constraint %I', cur_def);
    end if;

    -- NOT VALID: bestaande rijen worden niet hercontroleerd. Nieuwe inserts
    -- moeten wel binnen de lijst vallen.
    execute format(
        'alter table public.audit_log add constraint audit_log_record_table_check check (record_table in (%s)) not valid',
        full_list
    );
end
$audit$;

-- ── 5. Storage bucket voor verzonden order-PDF's ───────────────────────────
-- Bewust private; toegang via signed-URL gegenereerd door sendOrderToSupplier.
do $$
begin
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('inkoop-orders','inkoop-orders', false, 10485760, ARRAY['application/pdf'])
    on conflict (id) do nothing;
exception
    when others then
        raise notice '[concept_inkoop_orders] kon storage bucket niet aanmaken: %', SQLERRM;
end$$;

-- Bucket RLS: alleen members van de org mogen lezen/schrijven.
-- Folder-conventie: {organization_id}/{uuid}.pdf
drop policy if exists "inkoop_orders_select_own" on storage.objects;
create policy "inkoop_orders_select_own" on storage.objects
    for select to authenticated
    using (
        bucket_id = 'inkoop-orders'
        and (storage.foldername(name))[1] in (select private.user_org_ids()::text)
    );

drop policy if exists "inkoop_orders_insert_own" on storage.objects;
create policy "inkoop_orders_insert_own" on storage.objects
    for insert to authenticated
    with check (
        bucket_id = 'inkoop-orders'
        and (storage.foldername(name))[1] in (select private.user_org_ids()::text)
    );

drop policy if exists "inkoop_orders_delete_own" on storage.objects;
create policy "inkoop_orders_delete_own" on storage.objects
    for delete to authenticated
    using (
        bucket_id = 'inkoop-orders'
        and (storage.foldername(name))[1] in (select private.user_org_ids()::text)
    );

comment on table public.concept_inkoop_orders is
    'Per leverancier × window één open concept-bestelling. Status concept → sent → received. Items/totalen worden gesnapshot bij send (sendOrderToSupplier action).';
