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


-- ─── 0. Eenheid-conversie ────────────────────────────────────
-- De kostprijs-formule deelde quantity_used door base_quantity zonder naar de
-- eenheden te kijken. Een component per 100 g met "2,5 kg" in een gerecht gaf
-- 2,5/100 x prijs = EUR 0,00 i.p.v. EUR 1,50 — factor 1000, en stil.
-- Binnen een familie rekenen we exact om; tussen families (gram vs milliliter,
-- stuk vs gram) kan het niet zonder dichtheid/stukgewicht en laten we de
-- hoeveelheid staan (de UI hoort die combinatie te blokkeren).
-- TS-spiegel: convertQty() in src/lib/unitPrice.ts.
create or replace function public.unit_to_base_factor(p_unit text)
returns numeric
language sql
immutable
as $$
    select case lower(btrim(coalesce(p_unit, '')))
        when 'g'      then 1
        when 'gram'   then 1
        when 'kg'     then 1000
        when 'kilo'   then 1000
        when 'ml'     then 1
        when 'cl'     then 10
        when 'dl'     then 100
        when 'l'      then 1000
        when 'liter'  then 1000
        when 'stuk'   then 1
        when 'stuks'  then 1
        when 'portie' then 1
        else null
    end;
$$;

create or replace function public.unit_family(p_unit text)
returns text
language sql
immutable
as $$
    select case lower(btrim(coalesce(p_unit, '')))
        when 'g' then 'gewicht' when 'gram' then 'gewicht'
        when 'kg' then 'gewicht' when 'kilo' then 'gewicht'
        when 'ml' then 'volume' when 'cl' then 'volume' when 'dl' then 'volume'
        when 'l' then 'volume' when 'liter' then 'volume'
        when 'stuk' then 'stuk' when 'stuks' then 'stuk' when 'portie' then 'stuk'
        else null
    end;
$$;

-- Rekent p_qty van p_from naar p_to; geeft p_qty ONGEWIJZIGD terug als het niet
-- kan (andere familie / onbekend), zodat er nooit een verzonnen getal ontstaat.
create or replace function public.convert_qty(p_qty numeric, p_from text, p_to text)
returns numeric
language sql
immutable
as $$
    select case
        when public.unit_family(p_from) is null
          or public.unit_family(p_to) is null
          or public.unit_family(p_from) is distinct from public.unit_family(p_to)
        then p_qty
        else p_qty * public.unit_to_base_factor(p_from) / public.unit_to_base_factor(p_to)
    end;
$$;

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
                (public.convert_qty(gc.quantity_used, gc.unit, new.base_unit) / new.base_quantity)
                * new.base_cost_cents
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
        after update of base_quantity, base_unit, base_cost_cents, yield_factor
        on components
        for each row
        when (old.base_quantity   is distinct from new.base_quantity
           or old.base_unit       is distinct from new.base_unit
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
        component_base_unit text;
        component_base_cost integer;
        component_yield     numeric;
    begin
        if tg_op in ('INSERT', 'UPDATE') then
            select base_quantity, base_unit, base_cost_cents,
                   coalesce(nullif(yield_factor, 0), 1)
              into component_base_qty, component_base_unit, component_base_cost, component_yield
              from components
             where id = new.component_id;

            if component_base_qty is null or component_base_qty = 0 then
                new.cost_at_use_cents := 0;
            else
                new.cost_at_use_cents := greatest(0, round(
                    (public.convert_qty(new.quantity_used, new.unit, component_base_unit)
                     / component_base_qty) * component_base_cost
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
        before insert or update of quantity_used, unit, component_id
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

-- ─── 4. Bestaande koppelingen herberekenen ───────────────────
-- De eenheid-fix repareert alléén nieuwe/gewijzigde regels: bestaande rijen
-- houden hun foute cost_at_use_cents tot iemand ze aanraakt. In Sams data staat
-- bv. 2,5 kg kippendij op een 100 g-component als EUR 0,00 (moet EUR 1,50).
-- Daarom hier eenmalig herrekenen met de nieuwe formule, en de gerecht-totalen
-- opnieuw optellen.
--
-- Dit VERANDERT bestaande kostprijzen — dat is precies de bedoeling (ze waren
-- fout), maar het is geen stille wijziging: het staat in deze migratie en in de
-- PR-omschrijving. Alleen rijen waar de eenheid ECHT omgerekend kan worden
-- veranderen; een onmogelijke combinatie (gram vs milliliter) blijft zoals hij
-- was, want daar kunnen we niets zinnigs van maken.
do $recalc$
begin
    if to_regclass('public.components') is null
       or to_regclass('public.gerecht_components') is null then
        return;
    end if;

    update gerecht_components gc
    set cost_at_use_cents = greatest(0, round(
            (public.convert_qty(gc.quantity_used, gc.unit, c.base_unit) / c.base_quantity)
            * c.base_cost_cents
            / coalesce(nullif(c.yield_factor, 0), 1)
        )::integer)
    from components c
    where c.id = gc.component_id
      and c.base_quantity is not null
      and c.base_quantity <> 0;

    update gerechten g
    set total_cost_cents = coalesce((
        select sum(gc.cost_at_use_cents)
        from gerecht_components gc
        where gc.gerecht_id = g.id
    ), 0)
    where exists (select 1 from gerecht_components gc where gc.gerecht_id = g.id);

    raise notice 'gerecht_components herrekend met eenheid-conversie + snijverlies';
end
$recalc$;
