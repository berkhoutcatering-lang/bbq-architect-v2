-- Voorraadmutatie 'productie' met verwijzing naar de partij (fase 1).
--
-- Een afgeronde partij boekt het eindproduct de voorraad in, via dezelfde
-- functie als bonnen en tellingen (increment_inventory_stock). Nieuw:
--   - type 'productie' (naast count/usage/receive/adjust/waste);
--   - stock_movements.partij_id, zodat "waar komt deze +12 kg vandaan" één
--     klik is en "wat is er met partij X gebeurd" ook.
--
-- De functie krijgt één extra parameter met default; alle bestaande
-- aanroepen gebruiken benoemde parameters en blijven werken. Omdat de
-- signatuur verandert, moet de oude versie expliciet weg (drop + create).
--
-- Pre-flight: stock_movements heeft geen CREATE TABLE in de repo. Alles
-- hieronder controleert eerst wat er live staat.

alter table public.stock_movements
    add column if not exists partij_id uuid references public.productie_partijen(id) on delete set null;

create index if not exists stock_movements_partij_idx
    on public.stock_movements (partij_id) where partij_id is not null;

-- Type-check uitbreiden: bestaande waarden behouden, 'productie' erbij.
do $$
declare
    v_def text;
begin
    select pg_get_constraintdef(oid) into v_def
    from pg_constraint
    where conrelid = 'public.stock_movements'::regclass and conname = 'stock_movements_type_check';

    if v_def is not null and position('productie' in v_def) = 0 then
        alter table public.stock_movements drop constraint stock_movements_type_check;
        alter table public.stock_movements
            add constraint stock_movements_type_check
            check (type in ('count', 'usage', 'receive', 'adjust', 'waste', 'productie'));
    elsif v_def is null then
        alter table public.stock_movements
            add constraint stock_movements_type_check
            check (type in ('count', 'usage', 'receive', 'adjust', 'waste', 'productie'));
    end if;
end $$;

drop function if exists public.increment_inventory_stock(uuid, integer, numeric, text, numeric, uuid, text, bigint);

create function public.increment_inventory_stock(
    p_org           uuid,
    p_inventory_id  integer,
    p_delta         numeric,
    p_type          text,
    p_unit_price    numeric default null,
    p_order_line_id uuid    default null,
    p_note          text    default null,
    p_bon_id        bigint  default null,
    p_partij_id     uuid    default null
) returns numeric
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_new numeric;
    v_uid uuid := auth.uid();
begin
    if p_type not in ('count','usage','receive','adjust','waste','productie') then
        raise exception 'invalid movement type: %', p_type using errcode = '22023';
    end if;

    -- tenant-guard: alleen skippen voor service_role (auth.uid() NULL).
    if v_uid is not null and p_org not in (select private.user_org_ids()) then
        raise exception 'forbidden' using errcode = '42501';
    end if;

    -- FLOOR op 0: verbruik kan de voorraad nooit onder nul duwen.
    update public.inventory
        set current_stock = greatest(0, coalesce(current_stock, 0) + p_delta)
        where id = p_inventory_id and organization_id = p_org
        returning current_stock into v_new;

    if not found then
        raise exception 'inventory % not in org %', p_inventory_id, p_org using errcode = 'P0002';
    end if;

    insert into public.stock_movements
        (organization_id, inventory_id, type, qty, resulting_stock, unit_price, by_user_id, note, order_line_id, bon_id, partij_id)
        values (p_org, p_inventory_id, p_type, p_delta, v_new, p_unit_price, v_uid, p_note, p_order_line_id, p_bon_id, p_partij_id);

    return v_new;
end $$;

revoke all on function public.increment_inventory_stock(uuid, integer, numeric, text, numeric, uuid, text, bigint, uuid) from public;
grant execute on function public.increment_inventory_stock(uuid, integer, numeric, text, numeric, uuid, text, bigint, uuid) to authenticated, service_role;
