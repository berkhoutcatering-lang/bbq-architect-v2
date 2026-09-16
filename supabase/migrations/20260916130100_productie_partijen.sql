-- Productiepartijen en fysieke voorraadeenheden (plan glistening-brewing-heron, fase 1).
--
-- Waarom "partij" en niet "batch": in de keukenplanner betekent batch al
-- "werk samenvoegen" (prep_tasks.batch_id, src/lib/keukenplanner/batchen.ts).
-- Een partij is iets anders: één productierun die N fysieke eenheden
-- oplevert. Op het label staat wél "Batch PP-20260916-01", dat is de taal
-- van de keuken.
--
--   productie_partijen   1 rij per afgeronde productie: wat, hoeveel, wanneer,
--                        THT, wie. Idempotent op prep_task_id, mep_item_id en
--                        idempotency_key: dubbelklik = zelfde partij.
--   voorraad_eenheden    exact N rijen per partij, elk met eigen code en
--                        scan_token (QR). Printen verandert hier niets aan;
--                        alleen label_geprint_at wordt gezet.
--
-- De hoeveelheid in `inventory` blijft de som-waarheid voor de bestellijst;
-- deze tabellen zijn de traceerbare laag eronder. De mutatie zelf loopt via
-- increment_inventory_stock (zie 20260916130200).

create table if not exists public.productie_partijen (
    id                      uuid primary key default gen_random_uuid(),
    organization_id         uuid not null references public.organizations(id) on delete cascade,
    partijnummer            text not null,
    component_id            bigint not null references public.components(id) on delete restrict,
    gerecht_id              uuid,
    prep_task_id            integer references public.prep_tasks(id) on delete set null,
    mep_item_id             bigint references public.mep_items(id) on delete set null,
    event_id                integer references public.events(id) on delete set null,
    geplande_hoeveelheid    numeric(12,3),
    geproduceerde_hoeveelheid numeric(12,3) not null check (geproduceerde_hoeveelheid > 0),
    eenheid                 text not null,
    verpakking_grootte      numeric(10,3) not null check (verpakking_grootte > 0),
    verpakking_eenheid      text not null check (verpakking_eenheid in ('g', 'kg', 'ml', 'l', 'stuk', 'portie')),
    aantal_eenheden         integer not null check (aantal_eenheden > 0),
    productiedatum          date not null default current_date,
    tht                     date,
    bewaarmethode           text check (bewaarmethode is null or bewaarmethode in ('vers', 'vries', 'houdbaar')),
    bewaaradvies            text,
    opslag_locatie_id       uuid references public.opslag_locaties(id) on delete set null,
    inventory_id            integer references public.inventory(id) on delete set null,
    personeel_id            uuid references public.personeel(id) on delete set null,
    by_user_id              uuid,
    status                  text not null default 'vrijgegeven' check (status in ('vrijgegeven', 'geblokkeerd')),
    idempotency_key         uuid not null,
    haccp_snapshot          jsonb,
    notitie                 text,
    created_at              timestamptz not null default now()
);

comment on table public.productie_partijen is
    'Eén afgeronde productierun. Het aantal eenheden is productiewaarheid (hoeveelheid ÷ verpakking, eventueel door de kok gecorrigeerd) en bepaalt het aantal labels. Nooit een los labelaantal.';

create unique index if not exists productie_partijen_nummer_per_org
    on public.productie_partijen (organization_id, partijnummer);
create unique index if not exists productie_partijen_idempotency
    on public.productie_partijen (organization_id, idempotency_key);
create unique index if not exists productie_partijen_prep_task
    on public.productie_partijen (prep_task_id) where prep_task_id is not null;
create unique index if not exists productie_partijen_mep_item
    on public.productie_partijen (mep_item_id) where mep_item_id is not null;
create index if not exists productie_partijen_org_datum
    on public.productie_partijen (organization_id, productiedatum desc);
create index if not exists productie_partijen_component
    on public.productie_partijen (component_id);

create table if not exists public.voorraad_eenheden (
    id                    uuid primary key default gen_random_uuid(),
    organization_id       uuid not null references public.organizations(id) on delete cascade,
    partij_id             uuid not null references public.productie_partijen(id) on delete cascade,
    volgnummer            integer not null check (volgnummer > 0),
    code                  text not null,
    scan_token            uuid not null default gen_random_uuid(),
    inhoud                numeric(10,3) not null check (inhoud > 0),
    eenheid               text not null,
    status                text not null default 'op_voorraad'
                          check (status in ('op_voorraad', 'verbruikt', 'afgeschreven', 'verkocht')),
    opslag_locatie_id     uuid references public.opslag_locaties(id) on delete set null,
    label_geprint_at      timestamptz,
    label_print_count     integer not null default 0,
    laatste_print_job_id  uuid references public.print_jobs(id) on delete set null,
    verbruikt_at          timestamptz,
    verbruikt_event_id    integer references public.events(id) on delete set null,
    verbruikt_by_user_id  uuid,
    verbruikt_notitie     text,
    created_at            timestamptz not null default now()
);

comment on table public.voorraad_eenheden is
    'Eén fysieke zak/bak/pot uit een partij. scan_token staat in de QR op het label; code (PP-20260916-01-007) staat er leesbaar op. Herprint verhoogt alleen label_print_count.';

create unique index if not exists voorraad_eenheden_volgnummer
    on public.voorraad_eenheden (partij_id, volgnummer);
create unique index if not exists voorraad_eenheden_code_per_org
    on public.voorraad_eenheden (organization_id, code);
create unique index if not exists voorraad_eenheden_scan_token
    on public.voorraad_eenheden (scan_token);
create index if not exists voorraad_eenheden_org_status
    on public.voorraad_eenheden (organization_id, status);

-- print_jobs.partij_id krijgt nu pas zijn FK (de tabel bestond eerder).
do $$
begin
    if not exists (select 1 from pg_constraint where conname = 'print_jobs_partij_id_fkey') then
        alter table public.print_jobs
            add constraint print_jobs_partij_id_fkey
            foreign key (partij_id) references public.productie_partijen(id) on delete set null;
    end if;
end $$;

-- RLS
alter table public.productie_partijen enable row level security;
alter table public.voorraad_eenheden enable row level security;

drop policy if exists productie_partijen_select on public.productie_partijen;
create policy productie_partijen_select on public.productie_partijen
    for select to authenticated using (organization_id in (select private.user_org_ids()));
drop policy if exists productie_partijen_update on public.productie_partijen;
create policy productie_partijen_update on public.productie_partijen
    for update to authenticated
    using (organization_id in (select private.user_org_ids()))
    with check (organization_id in (select private.user_org_ids()));
-- Aanmaken gaat uitsluitend via de functie productie_partij_afronden
-- (security definer); geen insert-policy voor de client.

drop policy if exists voorraad_eenheden_select on public.voorraad_eenheden;
create policy voorraad_eenheden_select on public.voorraad_eenheden
    for select to authenticated using (organization_id in (select private.user_org_ids()));
drop policy if exists voorraad_eenheden_update on public.voorraad_eenheden;
create policy voorraad_eenheden_update on public.voorraad_eenheden
    for update to authenticated
    using (organization_id in (select private.user_org_ids()))
    with check (organization_id in (select private.user_org_ids()));

-- Partijprefix uit een naam: beginletters van de woorden, max 4, hoofdletters.
-- "Pulled pork" → PP, "Saus" → SA, "Gerookte procureur met koffierub" → GPMK.
create or replace function public.partij_prefix_van(p_naam text)
returns text
language sql
immutable
as $$
    select case
        when p_naam is null or btrim(p_naam) = '' then 'XX'
        when array_length(w, 1) = 1 then upper(left(regexp_replace(w[1], '[^A-Za-z0-9]', '', 'g') || 'X', 2))
        else upper(left((select string_agg(left(regexp_replace(x, '[^A-Za-z0-9]', '', 'g'), 1), '') from unnest(w) as x where regexp_replace(x, '[^A-Za-z0-9]', '', 'g') <> ''), 4))
    end
    from (select regexp_split_to_array(btrim(p_naam), '\s+') as w) s;
$$;
