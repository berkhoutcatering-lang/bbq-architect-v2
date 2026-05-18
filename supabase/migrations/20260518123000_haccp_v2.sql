-- ════════════════════════════════════════════════════════════════════════════
--  HACCP v2 — Event-bound AI-checklist + post-hoc anomaly detection
--
--  Pillar #1 (Event-Bound AI HACCP-Plan): per-event bundled checklist
--  Pillar #2 (Citation-Grounded): citations_json verbatim opgeslagen
--  Pillar #3 (NVWA-Trail 100% Mens-Bevestigd): confirmed_by_user_id verplicht
--                                              op insert (via Server Action)
--  Pillar #4 (Glove-First): geen schema-impact (field-mode ongewijzigd)
--  Pillar #5 (Eén Flow): geen schema-impact
--
--  REVIEW VOOR PUSH:
--    - 3 nieuwe tables (gerecht_haccp_templates, event_haccp_plans, haccp_anomaly_findings)
--    - 3 nieuwe kolommen op haccp_records (plan_item_id, confirmed_by_user_id, gerecht_id)
--    - 1 nieuwe pg-function (detect_haccp_anomaly)
--    - 1 nieuwe view (haccp_event_summary)
--    - Geen destructive DROPs.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. gerecht_haccp_templates — per-gerecht AI-cache ──────────────────────
create table public.gerecht_haccp_templates (
    id                    uuid primary key default gen_random_uuid(),
    organization_id       uuid not null references public.organizations(id) on delete cascade,
    gerecht_id            uuid not null references public.gerechten(id) on delete cascade,
    check_items           jsonb not null,
    citations_json        jsonb,
    ai_usage_id           bigint references public.ai_usage(id),
    created_by_ai         boolean not null default true,
    edited_by_user_id     uuid references auth.users(id),
    edited_at             timestamptz,
    created_at            timestamptz not null default now(),
    updated_at            timestamptz not null default now(),
    unique (organization_id, gerecht_id)
);

alter table public.gerecht_haccp_templates enable row level security;

create policy org_select on public.gerecht_haccp_templates
    for select to authenticated
    using (organization_id in (select private.user_org_ids()));
create policy org_insert on public.gerecht_haccp_templates
    for insert to authenticated
    with check (organization_id in (select private.user_org_ids()));
create policy org_update on public.gerecht_haccp_templates
    for update to authenticated
    using (organization_id in (select private.user_org_ids()))
    with check (organization_id in (select private.user_org_ids()));
create policy org_delete on public.gerecht_haccp_templates
    for delete to authenticated
    using (organization_id in (select private.user_org_ids()));

create index idx_gerecht_haccp_templates_org on public.gerecht_haccp_templates(organization_id);
create index idx_gerecht_haccp_templates_gerecht on public.gerecht_haccp_templates(gerecht_id, organization_id);

comment on table public.gerecht_haccp_templates is
    'Per-gerecht HACCP-checklist cache. Pillar #1: tweede keer = 0 AI-call. AI-suggest + mens-edit pattern via created_by_ai/edited_by_user_id.';

-- ── 2. event_haccp_plans — bundled per-event ──────────────────────────────
create table public.event_haccp_plans (
    id                    uuid primary key default gen_random_uuid(),
    organization_id       uuid not null references public.organizations(id) on delete cascade,
    event_id              integer not null references public.events(id) on delete cascade,
    plan_items            jsonb not null,
    serving_hour          smallint,
    ai_usage_id           bigint references public.ai_usage(id),
    confirmed_by_user_id  uuid references auth.users(id),
    confirmed_at          timestamptz,
    created_at            timestamptz not null default now(),
    updated_at            timestamptz not null default now(),
    unique (organization_id, event_id)
);

alter table public.event_haccp_plans enable row level security;

create policy org_select on public.event_haccp_plans
    for select to authenticated
    using (organization_id in (select private.user_org_ids()));
create policy org_insert on public.event_haccp_plans
    for insert to authenticated
    with check (organization_id in (select private.user_org_ids()));
create policy org_update on public.event_haccp_plans
    for update to authenticated
    using (organization_id in (select private.user_org_ids()))
    with check (organization_id in (select private.user_org_ids()));
create policy org_delete on public.event_haccp_plans
    for delete to authenticated
    using (organization_id in (select private.user_org_ids()));

create index idx_event_haccp_plans_org_event on public.event_haccp_plans(organization_id, event_id);

comment on table public.event_haccp_plans is
    'Per-event gededupliceerde HACCP-checklist. Pillar #1: AI bundelt alle gerecht-templates en past dedup toe.';

-- ── 3. haccp_anomaly_findings — append-only post-hoc detection ────────────
create table public.haccp_anomaly_findings (
    id                      bigserial primary key,
    organization_id         uuid not null references public.organizations(id) on delete cascade,
    haccp_record_id         integer not null references public.haccp_records(id) on delete cascade,
    detected_at             timestamptz not null default now(),
    z_score                 numeric(6, 3) not null,
    baseline_mean           numeric(8, 3) not null,
    baseline_stddev         numeric(8, 3) not null,
    sample_size             integer not null,
    reason                  text not null,
    acknowledged_at         timestamptz,
    acknowledged_by_user_id uuid references auth.users(id),
    created_at              timestamptz not null default now()
);

alter table public.haccp_anomaly_findings enable row level security;

create policy org_select on public.haccp_anomaly_findings
    for select to authenticated
    using (organization_id in (select private.user_org_ids()));
create policy org_update on public.haccp_anomaly_findings
    for update to authenticated
    using (organization_id in (select private.user_org_ids()))
    with check (organization_id in (select private.user_org_ids()));

-- Inserts alleen via SECURITY DEFINER pg-function of service-role (edge function).
-- Geen org_insert policy = client kan zelf geen findings creëren.

create index idx_anomaly_findings_org_record on public.haccp_anomaly_findings(organization_id, haccp_record_id);
create index idx_anomaly_findings_org_unack on public.haccp_anomaly_findings(organization_id) where acknowledged_at is null;

comment on table public.haccp_anomaly_findings is
    'Post-hoc z-score outliers. Pillar #3: NOOIT mutation op haccp_records — anomaly = appendix, geen edit.';

-- ── 4. Extend haccp_records voor plan-link + human-confirmation ───────────
alter table public.haccp_records
    add column if not exists plan_item_id text,
    add column if not exists confirmed_by_user_id uuid references auth.users(id),
    add column if not exists gerecht_id uuid references public.gerechten(id);

create index if not exists idx_haccp_records_org_plan on public.haccp_records(organization_id, plan_item_id) where plan_item_id is not null;
create index if not exists idx_haccp_records_org_event on public.haccp_records(organization_id, event_id) where event_id is not null;
create index if not exists idx_haccp_records_org_created on public.haccp_records(organization_id, check_type, created_at desc);

-- ── 5. pg-function detect_haccp_anomaly ───────────────────────────────────
create or replace function public.detect_haccp_anomaly(p_record_id integer)
returns table (
    is_anomaly boolean,
    z_score numeric,
    mean numeric,
    stddev numeric,
    n integer
)
language plpgsql
security invoker
stable
as $$
declare
    v_org_id uuid;
    v_check_type text;
    v_temp numeric;
begin
    select organization_id, check_type, temp::numeric
        into v_org_id, v_check_type, v_temp
    from public.haccp_records where id = p_record_id;

    if v_temp is null or v_check_type is null then
        return query select false, 0::numeric, 0::numeric, 0::numeric, 0;
        return;
    end if;

    return query
    with baseline as (
        select
            avg(temp::numeric) as mean,
            coalesce(stddev_pop(temp::numeric), 0::numeric) as stddev,
            count(*)::int as n
        from public.haccp_records
        where organization_id = v_org_id
          and check_type = v_check_type
          and id <> p_record_id
          and created_at >= now() - interval '30 days'
    )
    select
        case
            when b.n < 10 then false
            when b.stddev = 0 then false
            else abs((v_temp - b.mean) / b.stddev) > 2.0
        end,
        case when b.stddev = 0 then 0::numeric else (v_temp - b.mean) / b.stddev end,
        b.mean,
        b.stddev,
        b.n
    from baseline b;
end;
$$;

comment on function public.detect_haccp_anomaly is
    'Rolling z-score per (org, check_type) over laatste 30 dagen. Pillar #3: pure read, geen mutation.';

-- ── 6. Helper view: anomaly summary per event ─────────────────────────────
create or replace view public.haccp_event_summary as
select
    h.organization_id,
    h.event_id,
    count(*)::int as total_checks,
    count(*) filter (where h.status = 'ok')::int as ok_count,
    count(*) filter (where h.status in ('afwijking', 'danger', 'warn'))::int as deviation_count,
    count(a.id)::int as anomaly_count
from public.haccp_records h
left join public.haccp_anomaly_findings a on a.haccp_record_id = h.id
where h.event_id is not null
group by h.organization_id, h.event_id;

comment on view public.haccp_event_summary is
    'Per-event aggregaat — gebruikt door DossierView voor compliance%. RLS erft van onderliggende tables.';
