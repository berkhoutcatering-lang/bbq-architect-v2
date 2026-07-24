-- ════════════════════════════════════════════════════════════════════════════
--  Migration — Leverancierssync v2: hervatbare runs, waarnemingen & prijshistorie
--
--  Additief + idempotent. Bouwt het serverzijdige fundament voor de nieuwe,
--  hervatbare leverancierssync (briefing §12):
--    • supplier_sync_tasks           — begrensde, claimbare taken per run
--    • supplier_product_observations — append-only ruwe waarnemingen (ADR-3)
--    • supplier_product_prices       — append-only prijshistorie (max 1 current)
--    • supplier_import_review_items  — quarantaine/review (laat PDF/email-flow heel)
--    • supplier_sync_checkpoints     — idempotente ACK-opslag (exactly-once)
--    • leverancier_sync_runs         — uitgebreid met runstate/tellers/checkpoints
--    • supplier_products             — uitgebreid tot canoniek leveranciersaanbod
--
--  Harde regels die dit bestand respecteert:
--    • master_products / supplier_prices / stock_movements worden NIET aangeraakt
--      (hun DDL staat niet in de repo — handmatig op prod aangemaakt).
--    • Catalogus A (master_products/supplier_prices) en B (supplier_products) zijn
--      aparte bigint-id-ruimtes en worden NOOIT op id gejoined (zie mig 20260722120000).
--    • RLS volgt het nieuwste patroon: TO authenticated + private.user_org_ids()
--      + index op organization_id. Extensie schrijft via service-role.
--    • organization_id UUID overal.
--
--  NB: pas dit toe op een Supabase-branch/staging vóór productie (geen prod-apply
--  zonder expliciete toestemming). Volledig idempotent → veilig te herhalen.
-- ════════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. leverancier_sync_runs — runstate, tellers, checkpoints, adapterherkomst
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.leverancier_sync_runs
  add column if not exists adapter_key            text,
  add column if not exists adapter_version        text,
  add column if not exists supplier_account_key   text,
  add column if not exists scope                  jsonb   not null default '{}'::jsonb,
  add column if not exists heartbeat_at           timestamptz,
  add column if not exists last_checkpoint_at     timestamptz,
  add column if not exists tasks_total            integer not null default 0,
  add column if not exists tasks_done             integer not null default 0,
  add column if not exists tasks_failed           integer not null default 0,
  add column if not exists observations_accepted    integer not null default 0,
  add column if not exists observations_quarantined integer not null default 0,
  add column if not exists observations_rejected     integer not null default 0,
  add column if not exists finish_reason          text,
  add column if not exists lease_owner            text;

-- status-CHECK uitbreiden met paused_needs_login / paused_rate_limited (§8.4).
alter table public.leverancier_sync_runs drop constraint if exists leverancier_sync_runs_status_check;
alter table public.leverancier_sync_runs
  add constraint leverancier_sync_runs_status_check
  check (status in (
    'running','completed','partial','failed','cancelled',
    'paused','paused_needs_login','paused_rate_limited'
  ));

create index if not exists idx_lsr_active_v2
  on public.leverancier_sync_runs (organization_id, leverancier_id, status)
  where status in ('running','paused_needs_login','paused_rate_limited');

create index if not exists idx_lsr_heartbeat
  on public.leverancier_sync_runs (heartbeat_at)
  where status = 'running';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. supplier_sync_tasks — begrensde, claimbare taken
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.supplier_sync_tasks (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  run_id           uuid not null references public.leverancier_sync_runs(id) on delete cascade,
  supplier_id      integer references public.leveranciers(id) on delete set null,
  idempotency_key  text not null,
  task_type        text not null check (task_type in ('api_cursor','category_page','product_detail','favorites','preflight')),
  source_url       text,
  source_cursor    text,
  payload          jsonb not null default '{}'::jsonb,
  priority         integer not null default 100,
  status           text not null default 'pending' check (status in ('pending','claimed','acked','failed','skipped')),
  attempt_count    integer not null default 0,
  max_attempts     integer not null default 5,
  claimed_at       timestamptz,
  claimed_by       text,
  lease_until      timestamptz,
  acked_at         timestamptz,
  retry_after      timestamptz,
  result_counts    jsonb not null default '{}'::jsonb,
  error_code       text,
  error_detail     text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create unique index if not exists uq_sst_org_idem
  on public.supplier_sync_tasks (organization_id, idempotency_key);
create index if not exists idx_sst_claim
  on public.supplier_sync_tasks (run_id, status, priority, created_at);
create index if not exists idx_sst_org_supplier_status
  on public.supplier_sync_tasks (organization_id, supplier_id, status);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. supplier_product_observations — append-only ruwe waarnemingen (ADR-3)
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.supplier_product_observations (
  id                       uuid primary key default gen_random_uuid(),
  organization_id          uuid not null references public.organizations(id) on delete cascade,
  run_id                   uuid not null references public.leverancier_sync_runs(id) on delete cascade,
  task_id                  uuid references public.supplier_sync_tasks(id) on delete set null,
  supplier_id              integer references public.leveranciers(id) on delete set null,
  supplier_account_key     text,

  supplier_sku             text,
  ean                      text,
  product_name             text not null,
  description              text,
  category                 text,
  product_url              text,

  currency                 text not null default 'EUR',
  tax_mode                 text not null default 'unknown' check (tax_mode in ('ex_vat','inc_vat','unknown')),
  vat_pct                  numeric(4,2),

  regular_price_ex_vat     numeric(12,2),
  promo_price_ex_vat       numeric(12,2),
  promo_valid_from         timestamptz,
  promo_valid_until        timestamptz,
  price_basis              text not null default 'unknown' check (price_basis in ('package','kg','liter','piece','unknown')),

  pack_count               numeric(12,3),
  content_per_item_quantity numeric(12,3),
  content_per_item_unit    text check (content_per_item_unit is null or content_per_item_unit in ('g','kg','ml','liter','piece')),
  total_base_quantity      numeric(14,3),
  base_unit                text check (base_unit is null or base_unit in ('g','ml','piece')),
  order_multiple           numeric(12,3),
  variable_weight          boolean not null default false,
  package_description_raw  text,

  captured_at              timestamptz not null default now(),
  extraction_method        text not null check (extraction_method in ('supplier_api','json_ld','dom_adapter','ai_assisted')),
  adapter_key              text not null,
  adapter_version          text not null,
  source_cursor            text,
  field_confidence         jsonb not null default '{}'::jsonb,
  raw_record               jsonb not null default '{}'::jsonb,
  raw_hash                 text not null,

  validation_status        text not null check (validation_status in ('accepted','quarantined','rejected')),
  validation_codes         text[] not null default '{}',
  pack_variant_key         text,
  identity_key             text,
  supersedes_observation_id uuid references public.supplier_product_observations(id) on delete set null,
  created_at               timestamptz not null default now()
);

-- Replay-bescherming: dezelfde waarneming in dezelfde taak niet dubbel.
create unique index if not exists uq_spo_task_rawhash
  on public.supplier_product_observations (organization_id, task_id, raw_hash);
create index if not exists idx_spo_sku
  on public.supplier_product_observations (organization_id, supplier_id, supplier_account_key, supplier_sku);
create index if not exists idx_spo_ean
  on public.supplier_product_observations (organization_id, ean) where ean is not null;
create index if not exists idx_spo_run
  on public.supplier_product_observations (run_id, validation_status);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. supplier_products — uitbreiden tot canoniek leveranciersaanbod (ADR-5)
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.supplier_products
  add column if not exists master_product_id        bigint,          -- soft-FK → master_products (Catalogus A); NOOIT op id joinen zonder mapping
  add column if not exists supplier_account_key     text,
  add column if not exists product_url              text,
  add column if not exists ean                      text,
  add column if not exists pack_count               numeric(12,3),
  add column if not exists content_per_item_quantity numeric(12,3),
  add column if not exists content_per_item_unit    text,
  add column if not exists total_base_quantity      numeric(14,3),
  add column if not exists base_unit                text,
  add column if not exists order_multiple           numeric(12,3),
  add column if not exists variable_weight          boolean not null default false,
  add column if not exists package_description_raw  text,
  add column if not exists current_price_id         bigint,          -- soft-FK → supplier_product_prices
  add column if not exists identity_key             text,
  add column if not exists active                   boolean not null default true,
  add column if not exists last_seen_at             timestamptz,
  add column if not exists source_adapter_key       text,
  add column if not exists source_adapter_version   text;

-- source-CHECK uitbreiden met extension / supplier_api.
alter table public.supplier_products drop constraint if exists supplier_products_source_check;
alter table public.supplier_products
  add constraint supplier_products_source_check
  check (source in ('manual_upload','order_xl','gs1','api','invoice_ocr','extension','supplier_api'));

-- Canonieke upsert-sleutel: de scope-gebonden identiteit (SKU/EAN/URL + verpakking).
create unique index if not exists uq_sp_identity
  on public.supplier_products (organization_id, identity_key)
  where identity_key is not null;
create index if not exists idx_sp_account
  on public.supplier_products (organization_id, supplier_id, supplier_account_key);

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. supplier_product_prices — append-only prijshistorie (max 1 current)
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.supplier_product_prices (
  id                    bigint generated by default as identity primary key,
  organization_id       uuid not null references public.organizations(id) on delete cascade,
  supplier_product_id   bigint not null references public.supplier_products(id) on delete cascade,
  observation_id        uuid references public.supplier_product_observations(id) on delete set null,
  supplier_account_key  text,
  currency              text not null default 'EUR',
  tax_mode              text not null default 'unknown' check (tax_mode in ('ex_vat','inc_vat','unknown')),
  vat_pct               numeric(4,2),
  regular_price_ex_vat  numeric(12,2),
  promo_price_ex_vat    numeric(12,2),
  effective_price_ex_vat numeric(12,2) not null check (effective_price_ex_vat > 0),
  price_basis           text not null check (price_basis in ('package','kg','liter','piece','unknown')),
  price_per_kg_ex_vat    numeric(14,6),
  price_per_liter_ex_vat numeric(14,6),
  price_per_piece_ex_vat numeric(14,6),
  promo_valid_from      timestamptz,
  promo_valid_until     timestamptz,
  captured_at           timestamptz not null default now(),
  approved_at           timestamptz,
  approved_by           uuid references auth.users(id) on delete set null,
  is_current            boolean not null default true,
  superseded_at         timestamptz,
  created_at            timestamptz not null default now()
);

-- Eén waarneming levert hooguit één prijsregel.
create unique index if not exists uq_spp_observation
  on public.supplier_product_prices (observation_id) where observation_id is not null;
-- Transactioneel gegarandeerd: max één huidige goedgekeurde prijs per product.
create unique index if not exists uq_spp_one_current
  on public.supplier_product_prices (supplier_product_id) where is_current;
create index if not exists idx_spp_product
  on public.supplier_product_prices (organization_id, supplier_product_id, created_at desc);

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. supplier_import_review_items — quarantaine/review (PDF/email-flow blijft heel)
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.supplier_import_review_items (
  id                   uuid primary key default gen_random_uuid(),
  organization_id      uuid not null references public.organizations(id) on delete cascade,
  run_id               uuid references public.leverancier_sync_runs(id) on delete set null,
  observation_id       uuid references public.supplier_product_observations(id) on delete cascade,
  supplier_product_id  bigint references public.supplier_products(id) on delete set null,
  supplier_id          integer references public.leveranciers(id) on delete set null,
  review_type          text not null default 'quarantine' check (review_type in ('quarantine','master_link','anomaly')),
  codes                text[] not null default '{}',
  reasons              text[] not null default '{}',
  payload              jsonb not null default '{}'::jsonb,
  status               text not null default 'pending' check (status in ('pending','resolved','dismissed')),
  resolved_by          uuid references auth.users(id) on delete set null,
  resolved_at          timestamptz,
  created_at           timestamptz not null default now()
);
create index if not exists idx_siri_pending
  on public.supplier_import_review_items (organization_id, status) where status = 'pending';
create index if not exists idx_siri_run
  on public.supplier_import_review_items (run_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. supplier_sync_checkpoints — idempotente ACK-opslag (exactly-once §8.5/§13.5)
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.supplier_sync_checkpoints (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  run_id           uuid not null references public.leverancier_sync_runs(id) on delete cascade,
  task_id          uuid references public.supplier_sync_tasks(id) on delete set null,
  idempotency_key  text not null,
  response         jsonb not null default '{}'::jsonb,
  created_at       timestamptz not null default now()
);
create unique index if not exists uq_ssc_org_idem
  on public.supplier_sync_checkpoints (organization_id, idempotency_key);

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. RLS — nieuwste patroon (TO authenticated + private.user_org_ids()).
--    Extensie schrijft via service-role (bypasst RLS); UI leest alleen.
-- ─────────────────────────────────────────────────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array[
    'supplier_sync_tasks','supplier_product_observations','supplier_product_prices',
    'supplier_import_review_items','supplier_sync_checkpoints'
  ] loop
    execute format('alter table public.%I enable row level security;', t);
    execute format('drop policy if exists %I on public.%I;', t||'_select_own_org', t);
    execute format(
      'create policy %I on public.%I for select to authenticated using (organization_id in (select private.user_org_ids()));',
      t||'_select_own_org', t
    );
  end loop;
end$$;

-- Review-items mogen door de eigenaar-org worden bijgewerkt (resolve/dismiss via UI mogelijk).
drop policy if exists supplier_import_review_items_update_own_org on public.supplier_import_review_items;
create policy supplier_import_review_items_update_own_org
  on public.supplier_import_review_items for update to authenticated
  using (organization_id in (select private.user_org_ids()))
  with check (organization_id in (select private.user_org_ids()));

-- ─────────────────────────────────────────────────────────────────────────────
-- 9. RPC — atomair taak claimen (FOR UPDATE SKIP LOCKED, lease-based)
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.extension_v2_claim_task(
  p_org uuid, p_run_id uuid, p_lease_seconds integer, p_claimed_by text
) returns jsonb
language plpgsql
as $$
declare
  v_task public.supplier_sync_tasks;
begin
  update public.supplier_sync_tasks t
     set status = 'claimed',
         claimed_at = now(),
         claimed_by = p_claimed_by,
         lease_until = now() + make_interval(secs => greatest(30, p_lease_seconds)),
         attempt_count = t.attempt_count + 1,
         updated_at = now()
   where t.id = (
     select id from public.supplier_sync_tasks
      where run_id = p_run_id
        and organization_id = p_org
        and (status = 'pending' or (status = 'claimed' and lease_until < now()))
        and (retry_after is null or retry_after <= now())
        and attempt_count < max_attempts
      order by priority asc, created_at asc
      for update skip locked
      limit 1
   )
   returning t.* into v_task;

  if v_task.id is null then
    return jsonb_build_object('task', null);
  end if;

  return jsonb_build_object(
    'task', jsonb_build_object(
      'id', v_task.id,
      'type', v_task.task_type,
      'sourceUrl', v_task.source_url,
      'sourceCursor', v_task.source_cursor,
      'payload', v_task.payload,
      'attempt', v_task.attempt_count,
      'idempotencyKey', v_task.idempotency_key
    ),
    'leaseUntil', v_task.lease_until
  );
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 10. RPC — transactioneel checkpoint (idempotent, exactly-once). De TS-laag
--     beslist accepted/quarantined/rejected + prijzen; deze RPC persisteert
--     alles atomair (briefing §13.5). Input al genormaliseerd/berekend.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.extension_v2_apply_checkpoint(
  p_org uuid,
  p_run_id uuid,
  p_task_id uuid,
  p_idempotency_key text,
  p_decisions jsonb,   -- array van beslissingen (zie TS checkpoint-route)
  p_next_tasks jsonb,  -- array van {idempotencyKey,taskType,sourceUrl,sourceCursor,payload,priority}
  p_diagnostics jsonb,
  p_approved_by uuid default null
) returns jsonb
language plpgsql
as $$
declare
  v_ack_id uuid;
  v_stored jsonb;
  d jsonb;
  o jsonb;
  pr jsonb;
  v_obs_id uuid;
  v_inserted boolean;
  v_sp_id bigint;
  v_sp_inserted boolean;
  v_price_id bigint;
  v_accepted int := 0;
  v_quarantined int := 0;
  v_rejected int := 0;
  v_new int := 0;
  v_updated int := 0;
  v_next_added int := 0;
  nt jsonb;
  v_response jsonb;
  v_run_status text;
begin
  -- (0) run hoort bij org?
  perform 1 from public.leverancier_sync_runs where id = p_run_id and organization_id = p_org;
  if not found then
    raise exception 'RUN_NOT_FOUND' using errcode = 'P0002';
  end if;

  -- (1) idempotentie: claim de checkpoint-sleutel. Bestaat 'ie al → replay.
  insert into public.supplier_sync_checkpoints (organization_id, run_id, task_id, idempotency_key, response)
  values (p_org, p_run_id, p_task_id, p_idempotency_key, '{}'::jsonb)
  on conflict (organization_id, idempotency_key) do nothing
  returning id into v_ack_id;

  if v_ack_id is null then
    select response into v_stored from public.supplier_sync_checkpoints
      where organization_id = p_org and idempotency_key = p_idempotency_key;
    return jsonb_set(coalesce(v_stored, '{}'::jsonb), '{duplicateReplay}', 'true'::jsonb);
  end if;

  -- (2) beslissingen verwerken
  for d in select * from jsonb_array_elements(coalesce(p_decisions, '[]'::jsonb))
  loop
    o := d->'observation';

    -- (2a) append-only observation; replay binnen taak → skip (geen dubbel)
    insert into public.supplier_product_observations (
      organization_id, run_id, task_id, supplier_id, supplier_account_key,
      supplier_sku, ean, product_name, description, category, product_url,
      currency, tax_mode, vat_pct, regular_price_ex_vat, promo_price_ex_vat,
      promo_valid_from, promo_valid_until, price_basis,
      pack_count, content_per_item_quantity, content_per_item_unit,
      total_base_quantity, base_unit, order_multiple, variable_weight, package_description_raw,
      captured_at, extraction_method, adapter_key, adapter_version, source_cursor,
      field_confidence, raw_record, raw_hash,
      validation_status, validation_codes, pack_variant_key, identity_key
    ) values (
      p_org, p_run_id, p_task_id, (o->>'supplier_id')::int, o->>'supplier_account_key',
      o->>'supplier_sku', o->>'ean', o->>'product_name', o->>'description', o->>'category', o->>'product_url',
      coalesce(o->>'currency','EUR'), o->>'tax_mode', (o->>'vat_pct')::numeric,
      (o->>'regular_price_ex_vat')::numeric, (o->>'promo_price_ex_vat')::numeric,
      (o->>'promo_valid_from')::timestamptz, (o->>'promo_valid_until')::timestamptz, o->>'price_basis',
      (o->>'pack_count')::numeric, (o->>'content_per_item_quantity')::numeric, o->>'content_per_item_unit',
      (o->>'total_base_quantity')::numeric, o->>'base_unit', (o->>'order_multiple')::numeric,
      coalesce((o->>'variable_weight')::boolean, false), o->>'package_description_raw',
      coalesce((o->>'captured_at')::timestamptz, now()), o->>'extraction_method', o->>'adapter_key', o->>'adapter_version', o->>'source_cursor',
      coalesce(o->'field_confidence','{}'::jsonb), coalesce(o->'raw_record','{}'::jsonb), d->>'raw_hash',
      d->>'validation_status',
      coalesce((select array_agg(x) from jsonb_array_elements_text(d->'validation_codes') x), '{}'::text[]),
      d->>'pack_variant_key', d->>'identity_key'
    )
    on conflict (organization_id, task_id, raw_hash) do nothing
    returning id into v_obs_id;

    v_inserted := v_obs_id is not null;
    if not v_inserted then
      continue; -- al verwerkt in eerdere (deel)poging
    end if;

    if d->>'validation_status' = 'accepted' then
      v_accepted := v_accepted + 1;
    elsif d->>'validation_status' = 'quarantined' then
      v_quarantined := v_quarantined + 1;
    else
      v_rejected := v_rejected + 1;
    end if;

    -- (2b) accepted + prijs + identiteit → upsert supplier_products + prijshistorie
    pr := d->'price';
    if d->>'validation_status' = 'accepted' and pr is not null and (d->>'identity_key') is not null then
      insert into public.supplier_products (
        organization_id, supplier_id, supplier_sku, name, description,
        price_cents, unit, package_size, package_unit,
        source, identity_key, supplier_account_key, product_url, ean, gtin,
        pack_count, content_per_item_quantity, content_per_item_unit,
        total_base_quantity, base_unit, order_multiple, variable_weight, package_description_raw,
        active, last_seen_at, source_adapter_key, source_adapter_version, last_updated_at
      ) values (
        p_org, (o->>'supplier_id')::int, o->>'supplier_sku', o->>'product_name', o->>'description',
        (pr->>'effective_price_cents')::int, coalesce(pr->>'unit', 'stuk'),
        (pr->>'total_base_quantity')::numeric, pr->>'base_unit',
        coalesce(o->>'source','extension'), d->>'identity_key', o->>'supplier_account_key', o->>'product_url', o->>'ean', o->>'ean',
        (o->>'pack_count')::numeric, (o->>'content_per_item_quantity')::numeric, o->>'content_per_item_unit',
        (pr->>'total_base_quantity')::numeric, pr->>'base_unit', (o->>'order_multiple')::numeric,
        coalesce((o->>'variable_weight')::boolean, false), o->>'package_description_raw',
        true, now(), o->>'adapter_key', o->>'adapter_version', now()
      )
      on conflict (organization_id, identity_key) where identity_key is not null
      do update set
        name = excluded.name,
        description = excluded.description,
        price_cents = excluded.price_cents,
        unit = excluded.unit,
        package_size = excluded.package_size,
        package_unit = excluded.package_unit,
        supplier_account_key = excluded.supplier_account_key,
        product_url = excluded.product_url,
        ean = excluded.ean,
        pack_count = excluded.pack_count,
        content_per_item_quantity = excluded.content_per_item_quantity,
        content_per_item_unit = excluded.content_per_item_unit,
        total_base_quantity = excluded.total_base_quantity,
        base_unit = excluded.base_unit,
        order_multiple = excluded.order_multiple,
        variable_weight = excluded.variable_weight,
        package_description_raw = excluded.package_description_raw,
        active = true,
        last_seen_at = now(),
        source_adapter_key = excluded.source_adapter_key,
        source_adapter_version = excluded.source_adapter_version,
        last_updated_at = now()
      returning id, (xmax = 0) into v_sp_id, v_sp_inserted;

      if v_sp_inserted then v_new := v_new + 1; else v_updated := v_updated + 1; end if;

      -- prijshistorie: huidige supersede, nieuwe current
      update public.supplier_product_prices
         set is_current = false, superseded_at = now()
       where supplier_product_id = v_sp_id and is_current;

      insert into public.supplier_product_prices (
        organization_id, supplier_product_id, observation_id, supplier_account_key,
        currency, tax_mode, vat_pct,
        regular_price_ex_vat, promo_price_ex_vat, effective_price_ex_vat, price_basis,
        price_per_kg_ex_vat, price_per_liter_ex_vat, price_per_piece_ex_vat,
        promo_valid_from, promo_valid_until, captured_at, approved_at, approved_by, is_current
      ) values (
        p_org, v_sp_id, v_obs_id, o->>'supplier_account_key',
        coalesce(o->>'currency','EUR'), o->>'tax_mode', (o->>'vat_pct')::numeric,
        (pr->>'regular_price_ex_vat')::numeric, (pr->>'promo_price_ex_vat')::numeric,
        (pr->>'effective_price_ex_vat')::numeric, pr->>'price_basis',
        (pr->>'price_per_kg_ex_vat')::numeric, (pr->>'price_per_liter_ex_vat')::numeric, (pr->>'price_per_piece_ex_vat')::numeric,
        (o->>'promo_valid_from')::timestamptz, (o->>'promo_valid_until')::timestamptz,
        coalesce((o->>'captured_at')::timestamptz, now()), now(), p_approved_by, true
      )
      returning id into v_price_id;

      update public.supplier_products set current_price_id = v_price_id where id = v_sp_id;

    elsif d->>'validation_status' = 'quarantined' then
      -- (2c) reviewtaak aanmaken
      insert into public.supplier_import_review_items (
        organization_id, run_id, observation_id, supplier_id, review_type, codes, reasons, payload
      ) values (
        p_org, p_run_id, v_obs_id, (o->>'supplier_id')::int, 'quarantine',
        coalesce((select array_agg(x) from jsonb_array_elements_text(d->'validation_codes') x), '{}'::text[]),
        coalesce((select array_agg(x) from jsonb_array_elements_text(d->'reasons') x), '{}'::text[]),
        coalesce(d->'review_payload','{}'::jsonb)
      );
    end if;
  end loop;

  -- (3) volgende taken idempotent toevoegen
  for nt in select * from jsonb_array_elements(coalesce(p_next_tasks, '[]'::jsonb))
  loop
    insert into public.supplier_sync_tasks (
      organization_id, run_id, supplier_id, idempotency_key, task_type,
      source_url, source_cursor, payload, priority
    )
    select
      p_org, p_run_id,
      (select leverancier_id from public.leverancier_sync_runs where id = p_run_id),
      nt->>'idempotencyKey', nt->>'taskType', nt->>'sourceUrl', nt->>'sourceCursor',
      coalesce(nt->'payload','{}'::jsonb), coalesce((nt->>'priority')::int, 100)
    on conflict (organization_id, idempotency_key) do nothing;
    if found then v_next_added := v_next_added + 1; end if;
  end loop;

  -- (4) taak ACK'en
  update public.supplier_sync_tasks
     set status = 'acked', acked_at = now(), updated_at = now(),
         result_counts = jsonb_build_object('accepted', v_accepted, 'quarantined', v_quarantined, 'rejected', v_rejected)
   where id = p_task_id and organization_id = p_org;

  -- (5) tellers atomair ophogen + tasks_total bijwerken
  update public.leverancier_sync_runs r
     set observations_accepted = r.observations_accepted + v_accepted,
         observations_quarantined = r.observations_quarantined + v_quarantined,
         observations_rejected = r.observations_rejected + v_rejected,
         products_new = coalesce(r.products_new,0) + v_new,
         products_updated = coalesce(r.products_updated,0) + v_updated,
         products_seen = coalesce(r.products_seen,0) + v_accepted + v_quarantined + v_rejected,
         tasks_done = (select count(*) from public.supplier_sync_tasks where run_id = p_run_id and status = 'acked'),
         tasks_failed = (select count(*) from public.supplier_sync_tasks where run_id = p_run_id and status = 'failed'),
         tasks_total = (select count(*) from public.supplier_sync_tasks where run_id = p_run_id),
         last_checkpoint_at = now(),
         heartbeat_at = now()
   where r.id = p_run_id
   returning status into v_run_status;

  -- (6) ACK-resultaat opslaan (idempotente replay geeft dit exact terug)
  v_response := jsonb_build_object(
    'ackId', v_ack_id,
    'duplicateReplay', false,
    'accepted', v_accepted,
    'quarantined', v_quarantined,
    'rejected', v_rejected,
    'nextTasksAdded', v_next_added,
    'runStatus', v_run_status
  );
  update public.supplier_sync_checkpoints set response = v_response where id = v_ack_id;

  return v_response;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 11. RPC — server bepaalt het eindresultaat (§13.8). Nooit 'completed' met
--     open taken of onverwacht nul producten.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.extension_v2_complete_run(
  p_org uuid, p_run_id uuid
) returns jsonb
language plpgsql
as $$
declare
  v_pending int; v_claimed int; v_failed int; v_skipped int; v_total int;
  v_accepted int; v_quarantined int;
  v_status text; v_reason text;
begin
  perform 1 from public.leverancier_sync_runs where id = p_run_id and organization_id = p_org;
  if not found then raise exception 'RUN_NOT_FOUND' using errcode = 'P0002'; end if;

  select count(*) filter (where status='pending'), count(*) filter (where status='claimed'),
         count(*) filter (where status='failed'), count(*) filter (where status='skipped'),
         count(*)
    into v_pending, v_claimed, v_failed, v_skipped, v_total
    from public.supplier_sync_tasks where run_id = p_run_id;

  select observations_accepted, observations_quarantined
    into v_accepted, v_quarantined
    from public.leverancier_sync_runs where id = p_run_id;

  if v_pending > 0 or v_claimed > 0 then
    -- Nog werk open → niet compleet; laat run 'running'.
    return jsonb_build_object('status', 'running', 'reason', 'RUN_INCOMPLETE',
      'pending', v_pending, 'claimed', v_claimed);
  end if;

  if v_total = 0 or (v_accepted = 0 and v_quarantined = 0) then
    v_status := 'failed'; v_reason := 'no_products';
  elsif v_failed > 0 or v_skipped > 0 or v_quarantined > 0 then
    v_status := 'partial'; v_reason := 'has_failed_or_quarantined';
  else
    v_status := 'completed'; v_reason := 'ok';
  end if;

  update public.leverancier_sync_runs
     set status = v_status, finish_reason = v_reason, finished_at = now()
   where id = p_run_id;

  return jsonb_build_object('status', v_status, 'reason', v_reason,
    'failed', v_failed, 'skipped', v_skipped, 'accepted', v_accepted, 'quarantined', v_quarantined);
end;
$$;

-- Alleen de service-role (server-API) mag deze RPC's uitvoeren.
revoke all on function public.extension_v2_claim_task(uuid,uuid,integer,text) from public;
revoke all on function public.extension_v2_apply_checkpoint(uuid,uuid,uuid,text,jsonb,jsonb,jsonb,uuid) from public;
revoke all on function public.extension_v2_complete_run(uuid,uuid) from public;
grant execute on function public.extension_v2_claim_task(uuid,uuid,integer,text) to service_role;
grant execute on function public.extension_v2_apply_checkpoint(uuid,uuid,uuid,text,jsonb,jsonb,jsonb,uuid) to service_role;
grant execute on function public.extension_v2_complete_run(uuid,uuid) to service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 12. Monitoring (§19) — reconciliatie per run + adapter-health per versie.
--     security_invoker=true → RLS van de base-tabellen geldt (org-isolatie).
-- ─────────────────────────────────────────────────────────────────────────────
create or replace view public.v_supplier_sync_run_reconciliation
with (security_invoker = true) as
select
  r.id as run_id,
  r.organization_id,
  r.leverancier_id,
  r.adapter_key,
  r.adapter_version,
  r.status,
  r.tasks_total, r.tasks_done, r.tasks_failed,
  r.observations_accepted, r.observations_quarantined, r.observations_rejected,
  r.products_seen,
  -- Invariant: seen = accepted + quarantined + rejected
  (coalesce(r.products_seen,0) = coalesce(r.observations_accepted,0)
     + coalesce(r.observations_quarantined,0) + coalesce(r.observations_rejected,0)) as observations_balanced,
  (select count(*) from public.supplier_sync_tasks t where t.run_id = r.id and t.status in ('pending','claimed')) as tasks_open,
  r.started_at, r.finished_at, r.heartbeat_at, r.last_checkpoint_at, r.finish_reason
from public.leverancier_sync_runs r;

create or replace view public.v_supplier_adapter_health
with (security_invoker = true) as
select
  o.organization_id,
  o.adapter_key,
  o.adapter_version,
  count(*) as observations,
  count(*) filter (where o.validation_status = 'accepted') as accepted,
  count(*) filter (where o.validation_status = 'quarantined') as quarantined,
  count(*) filter (where o.validation_status = 'rejected') as rejected,
  round(100.0 * count(*) filter (where o.validation_status = 'quarantined') / greatest(count(*),1), 1) as quarantine_pct,
  max(o.created_at) as last_seen
from public.supplier_product_observations o
group by o.organization_id, o.adapter_key, o.adapter_version;

grant select on public.v_supplier_sync_run_reconciliation to authenticated;
grant select on public.v_supplier_adapter_health to authenticated;

-- ════════════════════════════════════════════════════════════════════════════
--  Einde migratie leverancierssync v2.
-- ════════════════════════════════════════════════════════════════════════════
