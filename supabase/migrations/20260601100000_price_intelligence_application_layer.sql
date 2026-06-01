-- ════════════════════════════════════════════════════════════════════════════
--  Migration — Price Intelligence Application Layer
--
--  Doel: maak de verzamelde leveranciers-data operationeel via vijf pillars:
--    #1 Live recipe cost            — recipe_cost_snapshots + cascade trigger
--    #2 Margin-Drift alerts         — offerte_margin_alerts + RPC
--    #3 Substitutie-suggesties      — RPC find_cheaper_substitutes_same_cut
--    #4 Inkooplijst-uit-event       — RPC explode_event_to_inkooplijst
--    #5 Markt-Pulse (opt-in)        — market_pulse_30d MV + RPC + feature_flag
--
--  Hard rules:
--   • RLS overal, policy via private.user_org_ids() (idem aan rest van repo).
--   • BTW NOOIT AI-derived — server-side via parsed_btw_pct of vaste tarieven.
--   • Allergenen NIET in deze migration — staat al in component_allergens.
--   • k-anonymity k≥5 in market_pulse_30d (HAVING count(distinct org) ≥ 5).
--   • Cost-cascade hangt aan bestaande triggers:
--       components.base_cost_cents → gerecht_components.cost_at_use_cents
--       → gerechten.total_cost_cents (al aanwezig).
--     Onze trigger update components.base_cost_cents wanneer een
--     org_price_mutation approved wordt — bestaande triggers doen de rest.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. recipe_cost_snapshots ────────────────────────────────────────────────
create table if not exists public.recipe_cost_snapshots (
    id                  bigserial primary key,
    organization_id     uuid    not null references public.organizations(id) on delete cascade,
    gerecht_id          uuid    not null references public.gerechten(id)     on delete cascade,
    kostprijs_cents     integer not null,
    porties_at_snapshot integer not null,
    source_mutation_id  uuid    references public.org_price_mutations(id) on delete set null,
    computed_at         timestamptz not null default now()
);

create index if not exists idx_rcs_org_gerecht_time
    on public.recipe_cost_snapshots (organization_id, gerecht_id, computed_at desc);

alter table public.recipe_cost_snapshots enable row level security;

drop policy if exists recipe_cost_snapshots_select on public.recipe_cost_snapshots;
create policy recipe_cost_snapshots_select on public.recipe_cost_snapshots
    for select to authenticated
    using (organization_id in (select private.user_org_ids()));

-- INSERT blokkeren voor client — alleen service-role / cron via security-definer fn
drop policy if exists recipe_cost_snapshots_insert on public.recipe_cost_snapshots;
create policy recipe_cost_snapshots_insert on public.recipe_cost_snapshots
    for insert to authenticated
    with check (false);

-- ── 2. offerte_margin_alerts (Pillar #2) ───────────────────────────────────
create table if not exists public.offerte_margin_alerts (
    id                   bigserial primary key,
    organization_id      uuid    not null references public.organizations(id) on delete cascade,
    offerte_id           integer not null references public.offertes(id) on delete cascade,
    delta_cents          integer not null,                  -- negatief = marge gedaald (kostprijs ↑)
    delta_pct            numeric(6,2) not null,
    affected_gerechten   jsonb not null default '[]'::jsonb, -- [{ gerecht_id, kost_oud, kost_nieuw }]
    status               text  not null default 'open'
        check (status in ('open','snoozed','resolved','dismissed')),
    snoozed_until        timestamptz,
    created_at           timestamptz not null default now(),
    resolved_at          timestamptz
);

-- Eén open alert per offerte tegelijk — voorkomt dubbel-tellen bij meerdere muta's per dag
create unique index if not exists uniq_offerte_open_alert
    on public.offerte_margin_alerts (offerte_id) where status = 'open';

create index if not exists idx_oma_org_status_time
    on public.offerte_margin_alerts (organization_id, status, created_at desc);

alter table public.offerte_margin_alerts enable row level security;

drop policy if exists offerte_margin_alerts_select on public.offerte_margin_alerts;
create policy offerte_margin_alerts_select on public.offerte_margin_alerts
    for select to authenticated
    using (organization_id in (select private.user_org_ids()));

drop policy if exists offerte_margin_alerts_update on public.offerte_margin_alerts;
create policy offerte_margin_alerts_update on public.offerte_margin_alerts
    for update to authenticated
    using (organization_id in (select private.user_org_ids()))
    with check (organization_id in (select private.user_org_ids()));

-- INSERT alleen via security-definer RPC's
drop policy if exists offerte_margin_alerts_insert on public.offerte_margin_alerts;
create policy offerte_margin_alerts_insert on public.offerte_margin_alerts
    for insert to authenticated
    with check (false);

-- ── 3. recipe_recompute_queue (async cascade) ───────────────────────────────
create table if not exists public.recipe_recompute_queue (
    id                 bigserial primary key,
    organization_id    uuid not null,
    component_id       bigint not null references public.components(id) on delete cascade,
    source_mutation_id uuid references public.org_price_mutations(id) on delete set null,
    new_cost_cents     integer not null,
    enqueued_at        timestamptz not null default now(),
    processed_at       timestamptz,
    attempts           integer not null default 0,
    last_error         text
);

create index if not exists idx_rrq_pending
    on public.recipe_recompute_queue (enqueued_at)
    where processed_at is null;

alter table public.recipe_recompute_queue enable row level security;

drop policy if exists rrq_select on public.recipe_recompute_queue;
create policy rrq_select on public.recipe_recompute_queue
    for select to authenticated
    using (organization_id in (select private.user_org_ids()));

-- Geen client INSERT/UPDATE — alleen via service-role
drop policy if exists rrq_insert on public.recipe_recompute_queue;
create policy rrq_insert on public.recipe_recompute_queue
    for insert to authenticated
    with check (false);

-- ── 4. Trigger: approved mutation → enqueue affected components ─────────────
create or replace function public.enqueue_components_after_mutation_approve()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_new_cost_cents integer;
    v_supplier_price record;
begin
    -- Alleen reageren op status-transitie naar 'approved' met master_product_id gezet
    if not (new.status = 'approved'
            and (old.status is distinct from 'approved')
            and new.master_product_id is not null) then
        return new;
    end if;

    -- Reconstrueer nieuwe kost in cents per base-unit. We hangen aan
    -- committed_supplier_price_id als die set is; anders parsed_prijs (in EUR).
    if new.committed_supplier_price_id is not null then
        select sp.prijs, sp.eenheid, sp.prijs_per_kg, sp.prijs_per_stuk
          into v_supplier_price
          from public.supplier_prices sp
         where sp.id = new.committed_supplier_price_id;
        -- Prefer prijs_per_kg voor MVP (vlees-cuts in kg)
        v_new_cost_cents := round(coalesce(v_supplier_price.prijs_per_kg, v_supplier_price.prijs) * 100);
    else
        v_new_cost_cents := round(coalesce(new.parsed_prijs, 0) * 100);
    end if;

    if v_new_cost_cents is null or v_new_cost_cents <= 0 then
        return new;  -- niets bruikbaars te updaten
    end if;

    -- Enqueue ALL affected components voor deze org. Primary link: supplier_product_id.
    -- Secundair pad (ingredients jsonb contains master_product_id) overgeslagen
    -- in deze migration — kan later via 'jsonb ?| ARRAY' worden uitgebreid.
    insert into public.recipe_recompute_queue
        (organization_id, component_id, source_mutation_id, new_cost_cents)
    select c.organization_id, c.id, new.id, v_new_cost_cents
      from public.components c
     where c.organization_id = new.organization_id
       and c.supplier_product_id = new.master_product_id;

    return new;
end;
$$;

drop trigger if exists trg_mutation_approved_enqueue on public.org_price_mutations;
create trigger trg_mutation_approved_enqueue
    after update of status on public.org_price_mutations
    for each row execute function public.enqueue_components_after_mutation_approve();

-- ── 5. RPC: process_recipe_recompute_queue (cron-getriggerd) ───────────────
create or replace function public.process_recipe_recompute_queue(p_batch_size integer default 200)
returns table (processed_count integer, error_count integer)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_row    record;
    v_proc   integer := 0;
    v_err    integer := 0;
    v_gerecht_id uuid;
begin
    for v_row in
        select id, organization_id, component_id, source_mutation_id, new_cost_cents
          from public.recipe_recompute_queue
         where processed_at is null
           and attempts < 3
         order by enqueued_at asc
         limit p_batch_size
         for update skip locked
    loop
        begin
            -- 1. Update component.base_cost_cents → bestaande triggers cascaden
            --    naar gerecht_components.cost_at_use_cents en gerechten.total_cost_cents.
            update public.components
               set base_cost_cents = v_row.new_cost_cents,
                   updated_at      = now()
             where id = v_row.component_id
               and organization_id = v_row.organization_id;

            -- 2. Per geraakt gerecht een snapshot maken na recompute
            for v_gerecht_id in
                select distinct gc.gerecht_id
                  from public.gerecht_components gc
                 where gc.component_id = v_row.component_id
            loop
                insert into public.recipe_cost_snapshots
                    (organization_id, gerecht_id, kostprijs_cents, porties_at_snapshot, source_mutation_id)
                select g.organization_id,
                       g.id,
                       g.total_cost_cents,
                       coalesce(g.porties, 10),
                       v_row.source_mutation_id
                  from public.gerechten g
                 where g.id = v_gerecht_id
                   and g.organization_id = v_row.organization_id;
            end loop;

            -- 3. Mark queue row done
            update public.recipe_recompute_queue
               set processed_at = now()
             where id = v_row.id;
            v_proc := v_proc + 1;

        exception when others then
            update public.recipe_recompute_queue
               set attempts   = attempts + 1,
                   last_error = sqlerrm
             where id = v_row.id;
            v_err := v_err + 1;
        end;
    end loop;

    return query select v_proc, v_err;
end;
$$;

revoke all on function public.process_recipe_recompute_queue(integer) from public, anon, authenticated;
-- service-role bypasses RLS; cron runs als service-role.

-- ── 6. RPC: check_open_offerte_margins (Pillar #2) ─────────────────────────
-- Voor één gerecht: vind alle open offertes (status concept/sent/viewed) waar
-- dit gerecht in zit, en maak (of update) een margin-alert.
create or replace function public.check_open_offerte_margins(
    p_org_id     uuid,
    p_gerecht_id uuid
) returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_count integer := 0;
    v_offerte record;
    v_kost_oud integer;
    v_kost_nieuw integer;
    v_delta_cents integer;
    v_delta_pct numeric(6,2);
begin
    -- Pak vorige + huidige kost via snapshots
    select kostprijs_cents into v_kost_nieuw
      from public.recipe_cost_snapshots
     where gerecht_id = p_gerecht_id
       and organization_id = p_org_id
     order by computed_at desc
     limit 1;

    select kostprijs_cents into v_kost_oud
      from public.recipe_cost_snapshots
     where gerecht_id = p_gerecht_id
       and organization_id = p_org_id
     order by computed_at desc
     offset 1 limit 1;

    if v_kost_oud is null or v_kost_nieuw is null then
        return 0;
    end if;

    v_delta_cents := v_kost_nieuw - v_kost_oud;

    if v_kost_oud = 0 then
        v_delta_pct := 0;
    else
        v_delta_pct := round((v_delta_cents::numeric / v_kost_oud) * 100, 2);
    end if;

    -- Alleen alerts bij significante stijging (>2% of >€5/gerecht)
    if abs(v_delta_pct) < 2 and abs(v_delta_cents) < 500 then
        return 0;
    end if;

    -- Vind open offertes waar dit gerecht in menu_selectie of items voorkomt
    for v_offerte in
        select id, aantal_gasten, menu_selectie, items
          from public.offertes
         where organization_id = p_org_id
           and status in ('concept','verstuurd','sent','viewed','draft')
           and signed_at is null
           and (
                (menu_selectie::text ilike '%' || p_gerecht_id::text || '%')
             or (items::text         ilike '%' || p_gerecht_id::text || '%')
           )
    loop
        -- Upsert alert per offerte. Bij bestaande open: cumulatieve delta optellen.
        insert into public.offerte_margin_alerts
            (organization_id, offerte_id, delta_cents, delta_pct, affected_gerechten, status)
        values
            (p_org_id,
             v_offerte.id,
             v_delta_cents * coalesce(v_offerte.aantal_gasten, 1),
             v_delta_pct,
             jsonb_build_array(jsonb_build_object(
                 'gerecht_id', p_gerecht_id,
                 'kost_oud',  v_kost_oud,
                 'kost_nieuw', v_kost_nieuw
             )),
             'open')
        on conflict (offerte_id) where status = 'open'
        do update set
            delta_cents = offerte_margin_alerts.delta_cents + excluded.delta_cents,
            affected_gerechten = offerte_margin_alerts.affected_gerechten
                || excluded.affected_gerechten;

        v_count := v_count + 1;
    end loop;

    -- Notificatie aanmaken voor de eigenaar (broadcast naar org)
    if v_count > 0 then
        insert into public.notifications
            (organization_id, user_id, type, title, body, link, metadata)
        values
            (p_org_id, null, 'margin_drift',
             'Marge gewijzigd op ' || v_count || ' open offertes',
             'Kostprijs van een gerecht is gewijzigd. Bekijk de impact op je open offertes.',
             '/offertes?filter=margin_drift',
             jsonb_build_object('gerecht_id', p_gerecht_id, 'delta_pct', v_delta_pct));
    end if;

    return v_count;
end;
$$;

revoke all on function public.check_open_offerte_margins(uuid, uuid) from public, anon, authenticated;

-- ── 7. RPC: find_cheaper_substitutes_same_cut (Pillar #3) ──────────────────
-- Rules-based: zelfde meat_taxonomy bucket, andere supplier_prices entry,
-- lagere prijs_per_kg. Retourneert top-3.
create or replace function public.find_cheaper_substitutes_same_cut(
    p_org_id            uuid,
    p_master_product_id bigint,
    p_limit             integer default 3
) returns table (
    candidate_id        bigint,
    candidate_naam      text,
    leverancier         text,
    prijs_per_kg        numeric,
    savings_pct         numeric,
    cut_groep           text,
    soort               text
)
language sql
security definer
stable
set search_path = public, pg_temp
as $$
    with current_product as (
        select mp.id, mp.categorie, mp.naam, ali.cut_taxonomy_id
          from public.master_products mp
          left join lateral (
              select cut_taxonomy_id
                from public.org_product_aliases
               where organization_id = p_org_id
                 and master_product_id = mp.id
                 and cut_taxonomy_id is not null
               order by confidence desc
               limit 1
          ) ali on true
         where mp.id = p_master_product_id
           and mp.organization_id = p_org_id
    ),
    current_price as (
        select avg(prijs_per_kg) as p
          from public.supplier_prices
         where master_product_id = p_master_product_id
           and organization_id   = p_org_id
           and prijs_per_kg      is not null
           and actief            = true
    ),
    candidates as (
        select distinct on (mp.id)
               mp.id,
               mp.naam,
               sp.leverancier,
               sp.prijs_per_kg,
               t.cut_groep,
               t.soort,
               cp.p as cur_price
          from current_product cur
          join public.org_product_aliases ali2
                on ali2.organization_id = p_org_id
               and ali2.cut_taxonomy_id  = cur.cut_taxonomy_id
          join public.master_products mp
                on mp.id              = ali2.master_product_id
               and mp.organization_id = p_org_id
               and mp.id              <> cur.id
               and mp.uit_assortiment is not true
          join public.supplier_prices sp
                on sp.master_product_id = mp.id
               and sp.organization_id   = p_org_id
               and sp.actief            = true
               and sp.prijs_per_kg      is not null
          join public.meat_taxonomy t on t.id = cur.cut_taxonomy_id
          cross join current_price cp
         where cp.p is not null
           and sp.prijs_per_kg < cp.p
         order by mp.id, sp.prijs_per_kg asc
    )
    select id,
           naam,
           leverancier,
           prijs_per_kg,
           round(((cur_price - prijs_per_kg) / cur_price) * 100, 1) as savings_pct,
           cut_groep,
           soort
      from candidates
     order by prijs_per_kg asc
     limit p_limit;
$$;

revoke all on function public.find_cheaper_substitutes_same_cut(uuid, bigint, integer) from public;
grant execute on function public.find_cheaper_substitutes_same_cut(uuid, bigint, integer)
    to authenticated;

-- ── 8. RPC: explode_event_to_inkooplijst (Pillar #4) ───────────────────────
-- BOM-explosion: event.menu (jsonb) × event.guests = grouped ingredient totals
-- per leverancier. Retourneert rijen klaar voor concept_inkoop_orders.items.
create or replace function public.explode_event_to_inkooplijst(
    p_org_id   uuid,
    p_event_id integer
) returns table (
    leverancier_id      integer,
    leverancier_naam    text,
    master_product_id   bigint,
    product_naam        text,
    qty_total           numeric,
    unit                text,
    prijs_per_eenheid   numeric,
    btw_pct             numeric,
    regel_totaal_excl   numeric,
    source_gerecht_ids  uuid[]
)
language plpgsql
security definer
stable
set search_path = public, pg_temp
as $$
declare
    v_guests integer;
    v_menu   jsonb;
begin
    select coalesce(guests, 0), coalesce(menu, '[]'::jsonb)
      into v_guests, v_menu
      from public.events
     where id = p_event_id
       and organization_id = p_org_id;

    if v_guests is null or v_guests = 0 then
        return;
    end if;

    return query
    with menu_items as (
        select (m->>'gerecht_id')::uuid as gerecht_id,
               coalesce((m->>'qty_per_guest')::numeric, 1) as qty_per_guest
          from jsonb_array_elements(v_menu) as m
         where (m ? 'gerecht_id')
    ),
    -- BOM via gerecht_components → components → component_ingredients
    bom as (
        select gc.gerecht_id,
               ci.inventory_id,
               ci.fallback_name,
               (ci.quantity * gc.quantity_used
                / nullif(c.base_quantity, 0)
                / nullif(coalesce(g.porties, 10), 0)
                * v_guests
                * coalesce(mi.qty_per_guest, 1))     as qty_needed,
               ci.unit,
               c.supplier_product_id                  as cmp_supplier_product_id
          from menu_items mi
          join public.gerecht_components gc on gc.gerecht_id = mi.gerecht_id
          join public.components c          on c.id          = gc.component_id
          join public.component_ingredients ci on ci.component_id = c.id
          left join public.gerechten g on g.id = mi.gerecht_id
    ),
    matched as (
        -- Resolve naar master_products + huidige supplier_price.
        -- supplier_prices.leverancier is text (geen FK) → match via lower(naam).
        select b.*,
               mp.id              as mp_id,
               mp.naam            as mp_naam,
               sp.leverancier     as sup_naam_text,
               sp.prijs_per_kg,
               sp.prijs_per_stuk,
               sp.prijs,
               sp.eenheid         as sup_eenheid,
               l.id               as resolved_sup_id,
               l.naam             as resolved_sup_naam
          from bom b
          left join public.master_products mp
                 on mp.id = b.cmp_supplier_product_id
                and mp.organization_id = p_org_id
          left join lateral (
              select sp.*
                from public.supplier_prices sp
               where sp.master_product_id = mp.id
                 and sp.organization_id   = p_org_id
                 and sp.actief            = true
               order by sp.created_at desc
               limit 1
          ) sp on true
          left join public.leveranciers l
                on l.organization_id = p_org_id
               and lower(l.naam) = lower(sp.leverancier)
               and l.archived_at is null
    )
    select m.resolved_sup_id::integer as leverancier_id,
           coalesce(m.resolved_sup_naam, m.sup_naam_text, 'Onbekend')::text as leverancier_naam,
           m.mp_id,
           coalesce(m.mp_naam, m.fallback_name, 'Onbekend product')::text,
           round(sum(m.qty_needed)::numeric, 3) as qty_total,
           coalesce(m.unit, m.sup_eenheid, 'stuks')::text,
           coalesce(m.prijs_per_kg, m.prijs_per_stuk, m.prijs, 0)::numeric,
           9::numeric,
           round(sum(m.qty_needed * coalesce(m.prijs_per_kg, m.prijs_per_stuk, m.prijs, 0))::numeric, 2),
           array_agg(distinct m.gerecht_id)
      from matched m
     group by m.resolved_sup_id, m.resolved_sup_naam, m.sup_naam_text,
              m.mp_id, m.mp_naam, m.fallback_name,
              m.unit, m.sup_eenheid, m.prijs_per_kg, m.prijs_per_stuk, m.prijs
     order by leverancier_naam, m.mp_naam;
end;
$$;

revoke all on function public.explode_event_to_inkooplijst(uuid, integer) from public;
grant execute on function public.explode_event_to_inkooplijst(uuid, integer)
    to authenticated;

-- Refresh helper voor materialized view (cron-getriggerd)
create or replace function public.refresh_market_pulse_30d()
returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
    refresh materialized view concurrently public.market_pulse_30d;
exception when feature_not_supported then
    refresh materialized view public.market_pulse_30d;
when others then
    null;
end;
$$;
revoke all on function public.refresh_market_pulse_30d() from public, anon, authenticated;

-- ── 9. Market Pulse (Pillar #5) — feature-flag default OFF ─────────────────
-- Opt-in zit in organizations.feature_flags JSONB (already exists).
-- Aggregaat materialized view met k-anonymity ≥ 5 (hard rule).

create materialized view if not exists public.market_pulse_30d as
with opted_in as (
    select id
      from public.organizations
     where coalesce((feature_flags ->> 'market_pulse_opt_in')::boolean, false) = true
),
contrib as (
    select coalesce(ali.cut_taxonomy_id, mp.id::bigint) as bucket_id,
           ali.cut_taxonomy_id is not null              as has_taxonomy,
           date_trunc('day', sp.created_at)::date       as bucket_day,
           sp.organization_id,
           avg(coalesce(sp.prijs_per_kg, sp.prijs_per_stuk, sp.prijs)) as avg_unit_price
      from public.supplier_prices sp
      join opted_in oi on oi.id = sp.organization_id
      join public.master_products mp on mp.id = sp.master_product_id
      left join lateral (
          select cut_taxonomy_id
            from public.org_product_aliases
           where organization_id   = sp.organization_id
             and master_product_id = mp.id
             and cut_taxonomy_id   is not null
           limit 1
      ) ali on true
     where sp.created_at >= now() - interval '60 days'
       and sp.actief     = true
       and coalesce(sp.prijs_per_kg, sp.prijs_per_stuk, sp.prijs) > 0
     group by bucket_id, has_taxonomy, bucket_day, sp.organization_id
)
select bucket_id,
       has_taxonomy,
       bucket_day,
       avg(avg_unit_price)::numeric(10,4)        as agg_avg_price,
       count(distinct organization_id)::integer  as participant_count
  from contrib
 group by bucket_id, has_taxonomy, bucket_day
having count(distinct organization_id) >= 5     -- k-anonymity hard rule (Pillar #5)
with no data;

create unique index if not exists uniq_mp_bucket_day
    on public.market_pulse_30d (bucket_id, has_taxonomy, bucket_day);

create index if not exists idx_mp_day
    on public.market_pulse_30d (bucket_day desc);

-- RPC die alleen werkt als de aanroepende org opted-in is
create or replace function public.get_market_pulse(p_org_id uuid)
returns table (
    bucket_id        bigint,
    cut_groep        text,
    soort            text,
    avg_price_now    numeric,
    avg_price_30d    numeric,
    delta_pct_30d    numeric,
    participant_min  integer
)
language plpgsql
security definer
stable
set search_path = public, pg_temp
as $$
declare
    v_opt_in boolean;
begin
    -- Re-authoriseer in de RPC (defense-in-depth — niet alleen op middleware vertrouwen)
    if not exists (
        select 1 from public.organization_members
         where organization_id = p_org_id
           and user_id         = auth.uid()
           and status          = 'active'
    ) then
        raise exception 'unauthorized';
    end if;

    select coalesce((feature_flags ->> 'market_pulse_opt_in')::boolean, false)
      into v_opt_in
      from public.organizations
     where id = p_org_id;

    if not v_opt_in then
        return;   -- niet geopted-in = lege resultaten
    end if;

    return query
    with latest as (
        select bucket_id,
               agg_avg_price as price_now,
               participant_count
          from public.market_pulse_30d
         where bucket_day >= current_date - interval '3 days'
         order by bucket_day desc
    ),
    avg_30d as (
        select bucket_id,
               avg(agg_avg_price) as p30,
               min(participant_count) as min_part
          from public.market_pulse_30d
         where bucket_day >= current_date - interval '30 days'
         group by bucket_id
    )
    select l.bucket_id,
           t.cut_groep,
           t.soort,
           l.price_now,
           a.p30,
           round(((l.price_now - a.p30) / nullif(a.p30, 0)) * 100, 1) as delta_pct,
           a.min_part
      from latest l
      join avg_30d a on a.bucket_id = l.bucket_id
      left join public.meat_taxonomy t on t.id = l.bucket_id
     order by abs(((l.price_now - a.p30) / nullif(a.p30, 0)) * 100) desc nulls last
     limit 10;
end;
$$;

revoke all on function public.get_market_pulse(uuid) from public, anon;
grant execute on function public.get_market_pulse(uuid) to authenticated;

-- ── 10. Helper: get_latest_gerecht_cost_delta voor UI ─────────────────────
create or replace function public.get_latest_gerecht_cost_delta(
    p_org_id     uuid,
    p_gerecht_id uuid
) returns table (
    kost_now_cents      integer,
    kost_7d_cents       integer,
    delta_7d_pct        numeric,
    last_change_at      timestamptz,
    sparkline_30d       jsonb     -- [{ day, kost_cents }]
)
language sql
security definer
stable
set search_path = public, pg_temp
as $$
    with snaps as (
        select kostprijs_cents, computed_at
          from public.recipe_cost_snapshots
         where organization_id = p_org_id
           and gerecht_id      = p_gerecht_id
         order by computed_at desc
    ),
    latest as (
        select kostprijs_cents, computed_at
          from snaps limit 1
    ),
    week_old as (
        select kostprijs_cents
          from snaps
         where computed_at <= now() - interval '7 days'
         order by computed_at desc
         limit 1
    ),
    spark as (
        select jsonb_agg(jsonb_build_object('day', day_bucket, 'kost_cents', kost_cents) order by day_bucket)
                  as data
          from (
              select date_trunc('day', computed_at)::date as day_bucket,
                     last_value(kostprijs_cents) over (
                         partition by date_trunc('day', computed_at)
                         order by computed_at asc
                         rows between unbounded preceding and unbounded following
                     ) as kost_cents
                from public.recipe_cost_snapshots
               where organization_id = p_org_id
                 and gerecht_id      = p_gerecht_id
                 and computed_at >= now() - interval '30 days'
          ) d
    )
    select l.kostprijs_cents,
           w.kostprijs_cents,
           case when w.kostprijs_cents is null or w.kostprijs_cents = 0 then null
                else round(((l.kostprijs_cents - w.kostprijs_cents)::numeric / w.kostprijs_cents) * 100, 1)
           end as delta_7d_pct,
           l.computed_at,
           coalesce(s.data, '[]'::jsonb)
      from latest l
      left join week_old w on true
      left join spark s on true;
$$;

grant execute on function public.get_latest_gerecht_cost_delta(uuid, uuid) to authenticated;

-- ── 11. Compatibility: zorg dat private.user_org_ids() ook publiek toegankelijk is ──
-- (Sommige RPC's hierboven gebruiken het al via search_path; expliciet grant)
grant execute on function private.user_org_ids() to authenticated;
