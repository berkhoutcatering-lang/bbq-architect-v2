-- ════════════════════════════════════════════════════════════════════════════
--  Migration — voorraad-besteloptimalisatie (foundation schema)
--
--  Doel: het fundament onder de geünificeerde, event-aware bestellijst.
--   - vaste leverancier-product per voorraad-item (leverancier + pak + prijs in
--     één koppeling) → order-groepering, pak-afronding en prijs komen hieruit;
--   - derving-buffer per item (Sam: "× gasten plus altijd 10% derving");
--   - bewaartype (vers/vries/houdbaar) → stuurt besteltiming + bestel-melding;
--   - lead-time per leverancier → bepaalt WANNEER besteld moet worden;
--   - durable orderregels (inkoop_order_lines) met nodig/besteld/ontvangen zodat
--     in-flight-verrekening en deel-ontvangst kloppen (sluit de ontvangst-loop).
--
--  Sam-beslissingen (vastgelegd):
--   - Binding op PRODUCT-niveau; GEEN recept-override. Kwaliteitsvariatie loopt
--     via een ander COMPONENT (black angus i.p.v. dubbeldoekoei) → ander
--     inventory-item → eigen vaste leverancier. Daarom hier geen override-tabel.
--
--  Defensief conform projectconventie: idempotent (IF NOT EXISTS / guarded DO),
--  private.user_org_ids()-helper (zoals concept_inkoop_orders/order_overrides),
--  organization_id + policy-index op elke nieuwe tabel. Geen table-rewrite op de
--  grote tabellen (alleen nullable ADD COLUMN = metadata-only in PG11+).
--  Sectie 7 bevat de atomaire stock-RPC increment_inventory_stock; de gebruikte
--  stock_movements-kolommen (resulting_stock/by_user_id/unit_price/note/
--  order_line_id) zijn op prod geverifieerd te bestaan.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. Vaste leverancier-product per voorraad-item ──────────────────────────
alter table public.inventory
  add column if not exists preferred_supplier_product_id bigint
    references public.supplier_products(id) on delete set null;

create index if not exists idx_inventory_preferred_sp
  on public.inventory (preferred_supplier_product_id)
  where preferred_supplier_product_id is not null;

-- ── 2. Derving-buffer (per item optioneel; null = org-default, code = 10%) ───
alter table public.inventory
  add column if not exists derving_pct numeric(5,2)
    check (derving_pct is null or (derving_pct >= 0 and derving_pct <= 100));

-- ── 3. Bewaartype — stuurt besteltiming + "over een week heb je event"-melding ─
alter table public.inventory
  add column if not exists storage_type text
    check (storage_type is null or storage_type in ('vers','vries','houdbaar'));

-- ── 4. Lead-time per leverancier ────────────────────────────────────────────
alter table public.leveranciers
  add column if not exists lead_time_days integer
    check (lead_time_days is null or lead_time_days >= 0);
alter table public.leveranciers
  add column if not exists order_cutoff text;   -- vrij: bv. 'do 16:00'

-- ── 5. Durable orderregels ──────────────────────────────────────────────────
--  Vervangt de items-JSONB-snapshot als bron van waarheid. Draagt nodig én
--  besteld (pak-afgerond) én ontvangen, zodat de motor kan aftrekken wat al
--  onderweg is en een deel-ontvangst kan verwerken.
create table if not exists public.inkoop_order_lines (
    id                  uuid primary key default gen_random_uuid(),
    organization_id     uuid    not null references public.organizations(id) on delete cascade,
    concept_order_id    uuid    not null references public.concept_inkoop_orders(id) on delete cascade,
    inventory_id        integer references public.inventory(id) on delete set null,
    supplier_product_id bigint  references public.supplier_products(id) on delete set null,

    naam                text    not null,
    qty_needed          numeric(12,3) not null,   -- kale demand: events × derving − stock − onderweg
    qty_ordered         numeric(12,3) not null,   -- afgerond op hele pakken
    qty_received        numeric(12,3),            -- null = nog niet ontvangen (in-flight)
    unit                text    not null,
    unit_price_eur      numeric(12,4),
    btw_pct             smallint check (btw_pct is null or btw_pct in (9, 21)),
    categorie           text,

    created_at          timestamptz not null default now(),
    updated_at          timestamptz not null default now()
);

create index if not exists idx_iol_org      on public.inkoop_order_lines (organization_id);
create index if not exists idx_iol_order     on public.inkoop_order_lines (concept_order_id);
create index if not exists idx_iol_org_inv   on public.inkoop_order_lines (organization_id, inventory_id);
-- Snelle "wat is er onderweg per product"-query (verzonden-niet-ontvangen).
create index if not exists idx_iol_inflight  on public.inkoop_order_lines (organization_id, inventory_id)
  where qty_received is null;

-- Updated_at trigger — hergebruik de bestaande projecthelper.
drop trigger if exists trg_iol_updated_at on public.inkoop_order_lines;
create trigger trg_iol_updated_at
    before update on public.inkoop_order_lines
    for each row execute function public.set_updated_at();

-- RLS — zelfde helper als de tabellen waaraan dit hangt (concept_inkoop_orders/order_overrides).
alter table public.inkoop_order_lines enable row level security;

do $$
begin
    if not exists (select 1 from pg_policies where tablename='inkoop_order_lines' and policyname='iol_select') then
        create policy iol_select on public.inkoop_order_lines
            for select to authenticated
            using (organization_id in (select private.user_org_ids()));
    end if;
    if not exists (select 1 from pg_policies where tablename='inkoop_order_lines' and policyname='iol_insert') then
        create policy iol_insert on public.inkoop_order_lines
            for insert to authenticated
            with check (organization_id in (select private.user_org_ids()));
    end if;
    if not exists (select 1 from pg_policies where tablename='inkoop_order_lines' and policyname='iol_update') then
        create policy iol_update on public.inkoop_order_lines
            for update to authenticated
            using  (organization_id in (select private.user_org_ids()))
            with check (organization_id in (select private.user_org_ids()));
    end if;
    -- DELETE-policy nodig: sendOrderToSupplierAction doet wis-en-herschrijf van de
    -- regels; zonder deze policy is die delete een stille no-op → stale regels →
    -- dubbele in-flight-telling → onderbestelling.
    if not exists (select 1 from pg_policies where tablename='inkoop_order_lines' and policyname='iol_delete') then
        create policy iol_delete on public.inkoop_order_lines
            for delete to authenticated
            using (organization_id in (select private.user_org_ids()));
    end if;
end $$;

-- ── 6. stock_movements: koppel-kolom naar de orderregel (ontvangst-audit) ────
--  Geverifieerd op prod: stock_movements heeft resulting_stock/by_user_id/note/
--  unit_price/bon_id/type/qty; order_line_id ontbrak nog.
alter table public.stock_movements
  add column if not exists order_line_id uuid
    references public.inkoop_order_lines(id) on delete set null;

-- ── 7. Atomaire voorraad-mutatie ────────────────────────────────────────────
--  ALLE current_stock-wijzigingen horen hierlangs te lopen (race-vrij: één
--  UPDATE onder row-lock die de auditrij meteen wegschrijft). Sluit P0-4 uit de
--  review: geen client-berekende current_stock-overschrijving meer.
--  service_role (auth.uid() NULL) = trusted (webhooks/RPC-chains); een ingelogde
--  caller moet lid van de org zijn, anders 42501.
create or replace function public.increment_inventory_stock(
    p_org           uuid,
    p_inventory_id  integer,
    p_delta         numeric,
    p_type          text,
    p_unit_price    numeric default null,
    p_order_line_id uuid    default null,
    p_note          text    default null
) returns numeric
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_new numeric;
    v_uid uuid := auth.uid();
begin
    if p_type not in ('count','usage','receive','adjust','waste') then
        raise exception 'invalid movement type: %', p_type using errcode = '22023';
    end if;

    -- tenant-guard: alleen skippen voor service_role (auth.uid() NULL).
    if v_uid is not null and p_org not in (select private.user_org_ids()) then
        raise exception 'forbidden' using errcode = '42501';
    end if;

    update public.inventory
        set current_stock = coalesce(current_stock, 0) + p_delta
        where id = p_inventory_id and organization_id = p_org
        returning current_stock into v_new;

    if not found then
        raise exception 'inventory % not in org %', p_inventory_id, p_org using errcode = 'P0002';
    end if;

    insert into public.stock_movements
        (organization_id, inventory_id, type, qty, resulting_stock, unit_price, by_user_id, note, order_line_id)
        values (p_org, p_inventory_id, p_type, p_delta, v_new, p_unit_price, v_uid, p_note, p_order_line_id);

    return v_new;
end $$;

revoke all on function public.increment_inventory_stock(uuid, integer, numeric, text, numeric, uuid, text) from public;
grant execute on function public.increment_inventory_stock(uuid, integer, numeric, text, numeric, uuid, text) to authenticated, service_role;
