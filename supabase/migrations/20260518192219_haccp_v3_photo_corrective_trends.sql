-- ════════════════════════════════════════════════════════════════════════════
--  HACCP v3 — Photo evidence + Corrective action + Trend-review
--  Sluit drie SOTA-gaps die concurrenten (SafetyCulture/FoodReady/FoodDocs)
--  wel hebben en wij niet.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. photo evidence op haccp_records ─────────────────────────────────────
alter table public.haccp_records
    add column if not exists photo_url text;

comment on column public.haccp_records.photo_url is
    'Signed Supabase Storage URL naar bewijsfoto. Optioneel. NVWA-acceptance van foto-bewijs is hoger dan tekst-alleen.';

-- ── 2. DB-level invariant: human-confirmed of automatisch + audit ──────────
-- Pillar #3: nieuwe rijen moeten mens-bevestigd zijn. Bestaande rijen
-- (123 stuks) blijven NOT VALID zodat geen oude data wordt geblokkeerd.
alter table public.haccp_records
    drop constraint if exists ck_human_confirmed,
    add constraint ck_human_confirmed
        check (
            auto_logged = true                          -- legacy auto-imports
            or confirmed_by_user_id is not null         -- nieuwe v3-rijen
            or created_at < '2026-05-18'::timestamptz   -- pre-v3 grandfathered
        ) not valid;

-- ── 3. haccp_corrective_actions — guided herstelflow per afwijking ────────
create table public.haccp_corrective_actions (
    id                       bigserial primary key,
    organization_id          uuid not null references public.organizations(id) on delete cascade,
    haccp_record_id          integer references public.haccp_records(id) on delete cascade,
    anomaly_finding_id       bigint references public.haccp_anomaly_findings(id) on delete set null,
    action_type              text not null,
    description              text not null,
    steps_taken              jsonb not null default '[]'::jsonb,
    resolved_at              timestamptz,
    resolved_by_user_id      uuid references auth.users(id),
    outcome                  text,
    notes                    text,
    created_at               timestamptz not null default now(),
    updated_at               timestamptz not null default now()
);

alter table public.haccp_corrective_actions enable row level security;

create policy org_select on public.haccp_corrective_actions
    for select to authenticated
    using (organization_id in (select private.user_org_ids()));
create policy org_insert on public.haccp_corrective_actions
    for insert to authenticated
    with check (organization_id in (select private.user_org_ids()));
create policy org_update on public.haccp_corrective_actions
    for update to authenticated
    using (organization_id in (select private.user_org_ids()))
    with check (organization_id in (select private.user_org_ids()));

create index idx_corrective_org_record on public.haccp_corrective_actions(organization_id, haccp_record_id);
create index idx_corrective_org_unresolved on public.haccp_corrective_actions(organization_id) where resolved_at is null;

comment on table public.haccp_corrective_actions is
    'Guided corrective-action flow per afwijking. Industry-standard, sluit gat vs SafetyCulture/FoodReady. Pillar #3: append-only audit-trail, geen mutation op originele haccp_records.';

-- ── 4. pg-function: 90-day trends per gerecht × check_type ────────────────
create or replace function public.get_haccp_trends(
    p_org_id uuid,
    p_days int default 90
)
returns table (
    check_type text,
    wat text,
    total_checks bigint,
    ok_count bigint,
    deviation_count bigint,
    anomaly_count bigint,
    avg_temp numeric,
    min_temp numeric,
    max_temp numeric,
    last_check_at timestamptz,
    deviation_pct numeric
)
language sql
security invoker
stable
as $$
    select
        h.check_type,
        h.wat,
        count(*) as total_checks,
        count(*) filter (where h.status = 'ok') as ok_count,
        count(*) filter (where h.status in ('warn', 'danger', 'afwijking')) as deviation_count,
        count(a.id) as anomaly_count,
        avg(h.temp::numeric) as avg_temp,
        min(h.temp::numeric) as min_temp,
        max(h.temp::numeric) as max_temp,
        max(h.created_at) as last_check_at,
        case
            when count(*) = 0 then 0
            else round((count(*) filter (where h.status in ('warn', 'danger', 'afwijking')))::numeric / count(*)::numeric * 100, 1)
        end as deviation_pct
    from public.haccp_records h
    left join public.haccp_anomaly_findings a on a.haccp_record_id = h.id
    where h.organization_id = p_org_id
      and h.created_at >= now() - (p_days || ' days')::interval
    group by h.check_type, h.wat
    order by deviation_pct desc, total_checks desc;
$$;

comment on function public.get_haccp_trends is
    'Aggregaat per (check_type, wat) over N dagen. SOTA-feature: trend-review across recurring issues. Pillar #3: pure read.';

-- ── 5. Storage bucket: haccp-evidence ─────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
    'haccp-evidence',
    'haccp-evidence',
    false,
    5242880,
    array['image/jpeg', 'image/png', 'image/webp', 'image/heic']
)
on conflict (id) do nothing;

-- ── 6. Storage RLS — per-org folder isolation via path-prefix ─────────────
drop policy if exists "tenant_haccp_evidence_select" on storage.objects;
drop policy if exists "tenant_haccp_evidence_insert" on storage.objects;
drop policy if exists "tenant_haccp_evidence_delete" on storage.objects;

create policy "tenant_haccp_evidence_select"
    on storage.objects for select to authenticated
    using (
        bucket_id = 'haccp-evidence'
        and (storage.foldername(name))[1] in (select private.user_org_ids()::text)
    );
create policy "tenant_haccp_evidence_insert"
    on storage.objects for insert to authenticated
    with check (
        bucket_id = 'haccp-evidence'
        and (storage.foldername(name))[1] in (select private.user_org_ids()::text)
    );
create policy "tenant_haccp_evidence_delete"
    on storage.objects for delete to authenticated
    using (
        bucket_id = 'haccp-evidence'
        and (storage.foldername(name))[1] in (select private.user_org_ids()::text)
    );
