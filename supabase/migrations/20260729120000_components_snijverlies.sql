-- =============================================================
--  Components: snijverlies (yield)
--
--  Sam koopt bavette voor €3,29/100 g, maar van 1 kg inkoop houdt hij ~700 g
--  bruikbaar over (vet, pees, bakverlies). 40 g op het bord kost dus geen
--  €1,32 maar €1,88. Zonder deze factor staat de hele menukaart structureel
--  te laag op de vleesregels — gemeten foodcost 18% waar 25-35% realistisch is.
--
--  base_cost_cents blijft ONGEWIJZIGD de inkoopprijs (dat staat op de factuur
--  en dat schrijft de prijs-verversing terug — zie lib/dal/priceRefresh.ts en
--  priceRefreshBoughtIn.ts). De deling gebeurt in de KOSTPRIJS-FORMULE, niet in
--  de opgeslagen prijs. Zou je 'm invouwen, dan ziet de override-guard van
--  priceRefresh het als handmatig gezet en ververst hij die component nooit meer.
--
--  Default 1.0 = geen verlies → er beweegt bij deploy geen cent.
--  De TS-spiegel van deze formule staat in src/lib/unitPrice.ts (costAtUseCents).
-- =============================================================

-- ─── 1. Kolom ────────────────────────────────────────────────
alter table if exists public.components
    add column if not exists yield_factor numeric(5,3) not null default 1.0;

-- ADD CONSTRAINT kent geen IF NOT EXISTS → guard via pg_constraint.
do $yc$
begin
    if to_regclass('public.components') is not null
       and not exists (
           select 1 from pg_constraint
           where conname = 'components_yield_factor_range'
             and conrelid = 'public.components'::regclass
       )
    then
        alter table public.components
            add constraint components_yield_factor_range
            check (yield_factor > 0 and yield_factor <= 1);
    end if;
end
$yc$;

comment on column public.components.yield_factor is
    'Snijverlies / opbrengst: de bruikbare fractie van wat je inkoopt (0 < y <= 1). '
    '0.700 = van 1 kg inkoop houd je 700 g over. Default 1.0 = geen verlies. '
    'base_cost_cents blijft de ONGECORRIGEERDE inkoopprijs; de deling gebeurt in de formule: '
    'cost_at_use_cents = ROUND(quantity_used / base_quantity * base_cost_cents / yield_factor). '
    'LET OP: dit is een KOSTPRIJS-hefboom. Bestel-hoeveelheden lopen via inventory.yield_factor '
    '(lib/dal/inventoryDemand.ts) — nooit allebei op dezelfde regel toepassen.';

-- ─── 2. Trigger-functies: yield in de formule ────────────────
-- Alleen als de tabellen bestaan; sommige omgevingen draaien op de app-level
-- recompute in /api/components/[id] (identieke formule).
do $tg$
begin
    if to_regclass('public.components') is null
       or to_regclass('public.gerecht_components') is null then
        raise notice 'components/gerecht_components ontbreekt — trigger-update overgeslagen';
        return;
    end if;

    -- 2a. Component wijzigt → alle gerecht_components herrekenen.
    execute $fn$
    create or replace function public.recompute_on_component_change()
    returns trigger
    language plpgsql
    security definer
    set search_path = public
    as $body$
    begin
        update gerecht_components gc
        set cost_at_use_cents = greatest(0, round(
                (gc.quantity_used / new.base_quantity) * new.base_cost_cents
                / coalesce(nullif(new.yield_factor, 0), 1)
            )::integer)
        where gc.component_id = new.id;

        update gerechten g
        set total_cost_cents = coalesce((
            select sum(cost_at_use_cents)
            from gerecht_components gc2
            where gc2.gerecht_id = g.id
        ), 0)
        where g.id in (
            select gerecht_id from gerecht_components where component_id = new.id
        );

        new.updated_at = now();
        return new;
    end;
    $body$;
    $fn$;

    -- Trigger opnieuw binden MET yield_factor, anders doet een snijverlies-
    -- wijziging niets en blijft de kostprijs stale.
    drop trigger if exists trg_component_cost_propagate on components;
    create trigger trg_component_cost_propagate
        after update of base_quantity, base_cost_cents, yield_factor
        on components
        for each row
        when (old.base_quantity   is distinct from new.base_quantity
           or old.base_cost_cents is distinct from new.base_cost_cents
           or old.yield_factor    is distinct from new.yield_factor)
        execute function recompute_on_component_change();

    -- 2b. gerecht_components INSERT/UPDATE → eigen kost herrekenen.
    execute $fn2$
    create or replace function public.recompute_on_gerecht_components_change()
    returns trigger
    language plpgsql
    security definer
    set search_path = public
    as $body2$
    declare
        component_base_qty  numeric;
        component_base_cost integer;
        component_yield     numeric;
    begin
        if tg_op in ('INSERT', 'UPDATE') then
            select base_quantity, base_cost_cents,
                   coalesce(nullif(yield_factor, 0), 1)
              into component_base_qty, component_base_cost, component_yield
              from components
             where id = new.component_id;

            if component_base_qty is null or component_base_qty = 0 then
                new.cost_at_use_cents := 0;
            else
                new.cost_at_use_cents := greatest(0, round(
                    (new.quantity_used / component_base_qty) * component_base_cost
                    / coalesce(component_yield, 1)
                )::integer);
            end if;
            return new;
        end if;
        return old;
    end;
    $body2$;
    $fn2$;

    drop trigger if exists trg_gc_compute_cost_before on gerecht_components;
    create trigger trg_gc_compute_cost_before
        before insert or update of quantity_used, component_id
        on gerecht_components
        for each row
        execute function recompute_on_gerecht_components_change();
end
$tg$;

-- ─── 3. GEEN backfill ────────────────────────────────────────
-- Alle bestaande componenten krijgen yield_factor = 1.0, wat de formule
-- identiek laat aan vandaag. Er beweegt bij deploy geen cent. Sam zet het per
-- component zelf aan; de FoodcostImpactModal laat eerst zien welke gerechten
-- daardoor verschuiven. Een gegokte yield is erger dan geen yield.
