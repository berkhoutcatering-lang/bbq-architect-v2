-- Labelprinter (Zebra ZQ630 Plus) — fase 0 van het plan
-- ~/.claude/plans/glistening-brewing-heron.md.
--
-- Twee tabellen, allebei zonder enige koppeling aan voorraad. Dat is bewust:
-- printen maakt nooit voorraad, en een printjob is alleen het bewijs dat er
-- iets naar een printer is gestuurd. De partij- en eenheden-tabellen komen in
-- fase 1 en verwijzen dán naar print_jobs, niet andersom.
--
--   label_printers  welke printers deze organisatie kent (Browser Print-uid,
--                   labelmaat, dpi). Niet hardcoded in de app.
--   print_jobs      elke printactie: wat, waarheen, door wie, gelukt of niet,
--                   en de ZPL die is verstuurd (reproduceerbaar, auditbaar).

create table if not exists public.label_printers (
    id                uuid primary key default gen_random_uuid(),
    organization_id   uuid not null references public.organizations(id) on delete cascade,
    naam              text not null,
    transport         text not null default 'browser_print'
                      check (transport in ('browser_print', 'web_bluetooth', 'mock')),
    device_uid        text,
    model             text,
    dpi               integer not null default 203 check (dpi in (203, 300)),
    label_breedte_mm  numeric(6,1) not null default 60,
    label_hoogte_mm   numeric(6,1) not null default 40,
    actief            boolean not null default true,
    laatst_gezien_at  timestamptz,
    laatste_status    jsonb,
    created_at        timestamptz not null default now(),
    updated_at        timestamptz not null default now()
);

comment on table public.label_printers is
    'Bekende labelprinters per organisatie. device_uid = de uid die Zebra Browser Print teruggeeft (Bluetooth-adres of netwerkadres). Labelmaat en dpi bepalen de ZPL-maten.';
comment on column public.label_printers.laatste_status is
    'Laatst opgevraagde printerstatus (~HQES geparsed): {online, papierOp, klepOpen, ...}. Alleen informatief.';

create index if not exists label_printers_org_idx
    on public.label_printers (organization_id, actief);

create table if not exists public.print_jobs (
    id                  uuid primary key default gen_random_uuid(),
    organization_id     uuid not null references public.organizations(id) on delete cascade,
    soort               text not null
                        check (soort in ('partij_labels', 'herprint', 'los_label', 'testlabel', 'doos_sticker', 'haccp_sticker')),
    partij_id           uuid,
    eenheid_ids         uuid[] not null default '{}',
    template_code       text not null,
    template_versie     integer not null,
    printer_id          uuid references public.label_printers(id) on delete set null,
    transport           text not null
                        check (transport in ('browser_print', 'web_bluetooth', 'mock')),
    aantal_labels       integer not null check (aantal_labels >= 0),
    status              text not null default 'pending'
                        check (status in ('pending', 'preparing', 'connecting', 'sent', 'success', 'failed', 'cancelled')),
    geprint_eenheid_ids uuid[] not null default '{}',
    onzeker_eenheid_ids uuid[] not null default '{}',
    geprint_aantal      integer not null default 0,
    foutmelding         text,
    printer_status      jsonb,
    label_data          jsonb,
    zpl                 text,
    by_user_id          uuid,
    device_naam         text,
    created_at          timestamptz not null default now(),
    sent_at             timestamptz,
    finished_at         timestamptz
);

comment on table public.print_jobs is
    'Elke printactie. Append-only vanuit de app (status wordt bijgewerkt, nooit verwijderd). partij_id en eenheid_ids wijzen vooruit naar fase 1; een herprint is een nieuwe rij met soort=herprint en verandert nooit voorraad.';
comment on column public.print_jobs.onzeker_eenheid_ids is
    'Eenheden in de laatste bundel waarvan de printer daarna een fout meldde: mogelijk wel, mogelijk niet geprint. De keuken controleert en print ze desnoods opnieuw.';
comment on column public.print_jobs.label_data is
    'De invoer van de template (naam, datum, ...) zoals gebruikt bij het renderen. Los label bewaart hier wat erop stond.';

create index if not exists print_jobs_org_status_idx
    on public.print_jobs (organization_id, status, created_at desc);
create index if not exists print_jobs_partij_idx
    on public.print_jobs (partij_id) where partij_id is not null;

-- updated_at op label_printers
create or replace function public.label_printers_touch()
returns trigger language plpgsql as $$
begin
    new.updated_at := now();
    return new;
end $$;

drop trigger if exists label_printers_touch on public.label_printers;
create trigger label_printers_touch
    before update on public.label_printers
    for each row execute function public.label_printers_touch();

-- RLS: per organisatie, zelfde patroon als de keukenplanner-tabellen.
alter table public.label_printers enable row level security;
alter table public.print_jobs enable row level security;

drop policy if exists label_printers_tenant on public.label_printers;
create policy label_printers_tenant on public.label_printers
    for all
    using (organization_id in (select private.user_org_ids()))
    with check (organization_id in (select private.user_org_ids()));

-- print_jobs: lezen, aanmaken en bijwerken; nooit verwijderen (audit).
drop policy if exists print_jobs_select on public.print_jobs;
create policy print_jobs_select on public.print_jobs
    for select using (organization_id in (select private.user_org_ids()));

drop policy if exists print_jobs_insert on public.print_jobs;
create policy print_jobs_insert on public.print_jobs
    for insert with check (organization_id in (select private.user_org_ids()));

drop policy if exists print_jobs_update on public.print_jobs;
create policy print_jobs_update on public.print_jobs
    for update
    using (organization_id in (select private.user_org_ids()))
    with check (organization_id in (select private.user_org_ids()));
