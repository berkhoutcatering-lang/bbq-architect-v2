-- ════════════════════════════════════════════════════════════════════════════
--  Migration 016 — Event Checklist (logistiek)
--  Bestandsnaam-prefix volgt YYYYMMDDHHMMSS voor sortering in Supabase Studio,
--  "016" is de logische projectnummer (zie ux-master / handoff-7).
--
--  Doelen:
--   1. event_checklist_items — multi-categorie logistiek-checklist per event
--      (vervangt legacy pack_lists.items + offertes.bus_check.checked op
--      termijn; migratie schrijft daar nog 60d parallel naar toe via app-code).
--   2. notifications — lichte in-app toast/banner-tabel zodat acceptance-flow
--      "AI-voorstel klaar" kan dispatchen zonder externe service.
--   3. RLS via wrapped (select private.user_org_ids()) — index op
--      organization_id zodat de policy een index-scan doet i.p.v. seq-scan.
--   4. Backfill-view event_checklist_legacy_v zodat /logistiek tijdens de
--      60d cutover oude bus-check + paklijst-items kan blijven tonen via
--      dezelfde shape.
--
--  Defensive: alle DDL is idempotent — IF NOT EXISTS / DO-blocks rond enums /
--  information_schema.columns-checks vóór backfill (memory-rule:
--  feedback_migration_dependencies).
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. event_checklist_items ───────────────────────────────────────────────
create table if not exists public.event_checklist_items (
    id                       uuid primary key default gen_random_uuid(),
    event_id                 bigint not null references public.events(id) on delete cascade,
    organization_id          uuid   not null references public.organizations(id) on delete cascade,

    -- 6 categorieën uit Claude Design — zie src/lib/logistiek/sections.ts
    -- Constraint inline zodat seed/migration-replay deterministisch is.
    category                 text   not null
        check (category in ('materieel','menu_prep','personeel','route','locatie','klant')),

    label                    text   not null,
    qty                      integer,
    unit                     text,

    done                     boolean not null default false,
    -- assignee mag null zijn — niet alle checks worden 1-op-1 toegewezen.
    assignee_user_id         uuid references auth.users(id) on delete set null,

    -- T-x deadline t.o.v. event.date. -72 = T-3, 0 = op de dag, +1 = nazorg.
    deadline_offset_hours    integer,

    -- 'ai' (gegenereerd door /api/logistics-checklist) of 'user' (handmatig).
    source                   text not null default 'user'
        check (source in ('ai','user')),

    -- Citation per item bij AI-bron — { sum:'…', src:'gerecht|hardware_katalogus|gasten_calc|weer_api|klant_data|standaard', ref:'…' }
    ai_citation              jsonb,

    -- Voor sub-taken; parent_id verwijst naar dezelfde tabel.
    parent_id                uuid references public.event_checklist_items(id) on delete cascade,
    sort_order               integer not null default 0,

    -- Placeholder-flag: acceptance-workflow zet hier een leeg item neer met
    -- ai_pending=true zodat /logistiek meteen iets toont; de AI-call gebeurt
    -- pas bij modal-open (kosten-bewust). Zodra de echte checks binnen zijn
    -- verdwijnt de placeholder (DELETE WHERE ai_pending).
    ai_pending               boolean not null default false,

    created_at               timestamptz not null default now(),
    updated_at               timestamptz not null default now()
);

-- Trigger om updated_at te maintainen — herbruikbaar als public.set_updated_at()
-- al bestaat (zoals in bonnen-migratie); anders maken we 'm idempotent aan.
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

drop trigger if exists trg_event_checklist_items_updated_at on public.event_checklist_items;
create trigger trg_event_checklist_items_updated_at
    before update on public.event_checklist_items
    for each row execute function public.set_updated_at();

-- ── 2. Indexes ─────────────────────────────────────────────────────────────
-- Policy-column index (memory-rule: index on policy columns for fast scans).
create index if not exists idx_event_checklist_org
    on public.event_checklist_items (organization_id);

-- Hoofd-query van /logistiek + /events/[id]/logistiek + field-page.
create index if not exists idx_event_checklist_org_event_sort
    on public.event_checklist_items (organization_id, event_id, sort_order);

-- Assignee-filter voor "mijn open taken" in /vandaag.
create index if not exists idx_event_checklist_assignee_open
    on public.event_checklist_items (assignee_user_id)
    where done = false;

-- Pending-flag query in side-rail historie van /logistiek.
create index if not exists idx_event_checklist_ai_pending
    on public.event_checklist_items (organization_id, ai_pending)
    where ai_pending = true;

-- ── 3. RLS ─────────────────────────────────────────────────────────────────
alter table public.event_checklist_items enable row level security;

-- Drop-and-recreate pattern zodat opnieuw runnen geen "policy already exists"
-- gooit. Alle policies gebruiken de wrapped (select …) variant zodat Postgres
-- de helper als stable expression evalueert (1× per query i.p.v. per row).

drop policy if exists event_checklist_select on public.event_checklist_items;
drop policy if exists event_checklist_insert on public.event_checklist_items;
drop policy if exists event_checklist_update on public.event_checklist_items;
drop policy if exists event_checklist_delete on public.event_checklist_items;

create policy event_checklist_select on public.event_checklist_items
    for select to authenticated
    using (organization_id in (select private.user_org_ids()));

create policy event_checklist_insert on public.event_checklist_items
    for insert to authenticated
    with check (organization_id in (select private.user_org_ids()));

create policy event_checklist_update on public.event_checklist_items
    for update to authenticated
    using (organization_id in (select private.user_org_ids()))
    with check (organization_id in (select private.user_org_ids()));

create policy event_checklist_delete on public.event_checklist_items
    for delete to authenticated
    using (organization_id in (select private.user_org_ids()));

-- Service-role bypasst RLS sowieso, dus geen aparte policy nodig daarvoor.

-- ── 4. notifications (lichte in-app toast/banner-tabel) ────────────────────
-- Bestond niet voor handoff-7; we creëeren 'm hier omdat de
-- acceptance-workflow een dispatch nodig heeft. Bewust minimaal:
-- type/title/body/link + read-flag + dismiss-flag.
create table if not exists public.notifications (
    id                uuid primary key default gen_random_uuid(),
    organization_id   uuid not null references public.organizations(id) on delete cascade,
    -- Null = broadcast naar hele org; uuid = gericht aan één user.
    user_id           uuid references auth.users(id) on delete cascade,
    type              text not null,  -- bv. 'ai_proposal_ready', 'haccp_ready', ...
    title             text not null,
    body              text,
    link              text,           -- click-through URL, bv. '/logistiek?proposal=<event_id>'
    -- Bron-koppeling zodat we ai_pending-rij van event_checklist kunnen vinden.
    metadata          jsonb not null default '{}'::jsonb,
    read_at           timestamptz,
    dismissed_at      timestamptz,
    created_at        timestamptz not null default now()
);

create index if not exists idx_notifications_org_unread
    on public.notifications (organization_id, created_at desc)
    where read_at is null and dismissed_at is null;

create index if not exists idx_notifications_user
    on public.notifications (user_id, created_at desc)
    where user_id is not null;

alter table public.notifications enable row level security;

drop policy if exists notifications_select on public.notifications;
drop policy if exists notifications_insert on public.notifications;
drop policy if exists notifications_update on public.notifications;
drop policy if exists notifications_delete on public.notifications;

create policy notifications_select on public.notifications
    for select to authenticated
    using (organization_id in (select private.user_org_ids()));

create policy notifications_insert on public.notifications
    for insert to authenticated
    with check (organization_id in (select private.user_org_ids()));

-- Gebruiker kan z'n eigen notificatie als gelezen/gedismissed markeren.
create policy notifications_update on public.notifications
    for update to authenticated
    using (organization_id in (select private.user_org_ids()))
    with check (organization_id in (select private.user_org_ids()));

create policy notifications_delete on public.notifications
    for delete to authenticated
    using (organization_id in (select private.user_org_ids()));

-- ── 5. Backfill-view voor cutover ──────────────────────────────────────────
-- Doel: tijdens 60d transitie kan /logistiek nog de legacy bus_check items
-- inlezen via dezelfde shape als event_checklist_items. Acceptance-workflow
-- schrijft naar BEIDE locaties (event_checklist_items én pack_lists/bus_check)
-- gedurende de cutover-periode; deze view is de read-fallback.
--
-- Defensive: alleen renderen wanneer de bron-kolommen daadwerkelijk bestaan.
-- Migratie-replay op een verse omgeving (zonder pack_lists/offertes legacy
-- data) gooit hier nu géén error.
do $$
declare
    has_offerte_bus_check     boolean;
    has_pack_lists_items      boolean;
begin
    select exists (
        select 1 from information_schema.columns
         where table_schema = 'public'
           and table_name   = 'offertes'
           and column_name  = 'bus_check'
    ) into has_offerte_bus_check;

    select exists (
        select 1 from information_schema.columns
         where table_schema = 'public'
           and table_name   = 'pack_lists'
           and column_name  = 'items'
    ) into has_pack_lists_items;

    if has_offerte_bus_check or has_pack_lists_items then
        execute $view$
            create or replace view public.event_checklist_legacy_v as
            select
                /* deterministische pseudo-uuid (organization_id + 'legacy' +
                   event_id + label) zodat dezelfde legacy-rij elke read
                   dezelfde id krijgt → React keys blijven stabiel. */
                md5(coalesce(o.organization_id::text,'') || '|bus|' || coalesce(ev.id::text,'') || '|' || x.naam)::uuid as id,
                ev.id as event_id,
                o.organization_id,
                'materieel'::text as category,
                x.naam::text as label,
                null::integer as qty,
                null::text as unit,
                coalesce((o.bus_check->'checked' ? x.naam), false) as done,
                null::uuid as assignee_user_id,
                null::integer as deadline_offset_hours,
                'user'::text as source,
                null::jsonb as ai_citation,
                null::uuid as parent_id,
                0::integer as sort_order,
                false as ai_pending,
                o.created_at,
                o.created_at as updated_at
            from public.offertes o
            join public.events ev on ev.offerte_id = o.id
            cross join lateral jsonb_array_elements_text(
                coalesce(o.bus_check->'items', '[]'::jsonb)
            ) as x(naam)
            where o.bus_check is not null

            union all

            select
                md5(coalesce(p.organization_id::text,'') || '|pack|' || coalesce(p.event_id::text,'') || '|' || (it->>'text'))::uuid as id,
                p.event_id::bigint as event_id,
                p.organization_id,
                'materieel'::text as category,
                (it->>'text')::text as label,
                nullif((it->>'qty')::text,'')::integer as qty,
                null::text as unit,
                coalesce((it->>'done')::boolean, false) as done,
                null::uuid as assignee_user_id,
                null::integer as deadline_offset_hours,
                'user'::text as source,
                null::jsonb as ai_citation,
                null::uuid as parent_id,
                coalesce((it->>'sort_order')::int, 0) as sort_order,
                false as ai_pending,
                p.created_at,
                p.created_at as updated_at
            from public.pack_lists p
            cross join lateral jsonb_array_elements(
                coalesce(p.items, '[]'::jsonb)
            ) as it
            where p.event_id is not null and p.organization_id is not null;
        $view$;

        -- View deelt RLS via underlying tables — geen aparte policy nodig.
        comment on view public.event_checklist_legacy_v is
            'Read-only fallback tijdens cutover handoff-7: combineert legacy bus_check (offertes) en pack_lists.items in event_checklist_items-shape. Verwijder na 60d.';
    end if;
end$$;
