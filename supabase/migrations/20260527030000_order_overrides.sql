-- ════════════════════════════════════════════════════════════════════════════
--  Migration — order_overrides (bucket D / P0-5)
--
--  Doel: gebruiker kan in /inkoop een qty bijschuiven, item verwijderen, of
--  een ander leverancier kiezen — die override moet persistent zijn zodat
--  refreshen de wijziging niet wegvaagt.
--
--  Strategie: niet de bestelvoorstel-output muteren maar een laag overheen.
--  bestelvoorstel.ts past overrides toe NÁ demand-calc, VÓÓR return. Voordeel:
--  als demand verandert (events verschuiven) blijft de override geldig op
--  inventory-niveau zonder we de cache moeten invalideren.
--
--  Scope: een override hangt aan één concept_inkoop_order. Bij send wordt
--  alles gesnapshot in concept_inkoop_orders.items en zijn de overrides niet
--  meer relevant voor die order (blijven wel staan voor audit).
-- ════════════════════════════════════════════════════════════════════════════

create table if not exists public.order_overrides (
    id                      uuid primary key default gen_random_uuid(),
    organization_id         uuid not null references public.organizations(id) on delete cascade,

    concept_order_id        uuid not null references public.concept_inkoop_orders(id) on delete cascade,
    inventory_id            integer not null references public.inventory(id) on delete cascade,

    -- NULL = geen qty-override (gebruik berekende shortfall).
    override_qty            numeric(10,3) check (override_qty is null or override_qty >= 0),
    -- NULL = blijft bij default-leverancier; gevuld = "verplaats item naar deze leverancier".
    override_leverancier_id integer references public.leveranciers(id) on delete set null,
    -- TRUE = item uit deze order weghalen. Andere velden mogen dan null zijn.
    removed                 boolean not null default false,

    note                    text,
    created_at              timestamptz not null default now(),
    updated_at              timestamptz not null default now(),
    created_by              uuid references auth.users(id) on delete set null,

    -- Eén override-rij per (order, inventory). UPSERT-friendly.
    unique (concept_order_id, inventory_id)
);

-- Updated_at trigger.
drop trigger if exists trg_order_overrides_updated_at on public.order_overrides;
create trigger trg_order_overrides_updated_at
    before update on public.order_overrides
    for each row execute function public.set_updated_at();

-- ── Indexes ────────────────────────────────────────────────────────────────
create index if not exists idx_order_overrides_org
    on public.order_overrides (organization_id);

create index if not exists idx_order_overrides_concept_order
    on public.order_overrides (concept_order_id);

-- Bij toepassen-fase in bestelvoorstel.ts hebben we vaak alle overrides voor
-- één org × window nodig — index hierop voor seq-scan voorkoming.
create index if not exists idx_order_overrides_org_inventory
    on public.order_overrides (organization_id, inventory_id);

-- ── RLS ────────────────────────────────────────────────────────────────────
alter table public.order_overrides enable row level security;

drop policy if exists order_overrides_select on public.order_overrides;
drop policy if exists order_overrides_insert on public.order_overrides;
drop policy if exists order_overrides_update on public.order_overrides;
drop policy if exists order_overrides_delete on public.order_overrides;

create policy order_overrides_select on public.order_overrides
    for select to authenticated
    using (organization_id in (select private.user_org_ids()));

create policy order_overrides_insert on public.order_overrides
    for insert to authenticated
    with check (organization_id in (select private.user_org_ids()));

create policy order_overrides_update on public.order_overrides
    for update to authenticated
    using (organization_id in (select private.user_org_ids()))
    with check (organization_id in (select private.user_org_ids()));

create policy order_overrides_delete on public.order_overrides
    for delete to authenticated
    using (organization_id in (select private.user_org_ids()));

comment on table public.order_overrides is
    'Per (concept_order, inventory) één override-rij. NULL-velden = "geen override op dit aspect". '
    'Toegepast in bestelvoorstel.ts NÁ demand-calc, VÓÓR return. Bij order-send worden de '
    'effectieve waarden gesnapshot in concept_inkoop_orders.items; deze rijen blijven voor audit.';
