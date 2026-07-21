-- Voorraad-mutatie unificatie (fix #1 uit het diepe onderzoek 2026-07-21).
--
-- Aanleiding: current_stock werd door 6 verschillende, niet-atomaire schrijvers
-- gemuteerd (serve/prep/bon/factuur/handmatig/EventEditor) terwijl alleen de
-- ontvangst-loop de atomaire RPC gebruikte. Gevolg: lost-updates + drift, en de
-- bestellijst leunt juist op current_stock. Alles gaat nu door deze ene RPC.
--
-- Twee wijzigingen aan increment_inventory_stock:
--   1. FLOOR op 0 (greatest) — negative-stock-prevention centraal, zodat de
--      Server Action adjustStock zijn Math.max(0,…) niet verliest bij overzetten.
--   2. p_bon_id toegevoegd — zodat de bon-scan-paden dezelfde RPC kunnen
--      gebruiken én de bon-koppeling op stock_movements behouden.
-- Signatuur verandert (extra param) → drop + recreate i.p.v. create-or-replace.

-- Defensief: stock_movements.bon_id moet bestaan (migratie 010 maakt 'm als
-- BIGINT FK naar bonnen(id) — geen uuid). Niet aannemen dat 010 liep.
alter table public.stock_movements add column if not exists bon_id bigint;

drop function if exists public.increment_inventory_stock(uuid, integer, numeric, text, numeric, uuid, text);

create function public.increment_inventory_stock(
    p_org           uuid,
    p_inventory_id  integer,
    p_delta         numeric,
    p_type          text,
    p_unit_price    numeric default null,
    p_order_line_id uuid    default null,
    p_note          text    default null,
    p_bon_id        bigint  default null
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

    -- FLOOR op 0: verbruik kan de voorraad nooit onder nul duwen. Voor receive
    -- (positieve delta) is greatest() een no-op, dus veilig voor alle types.
    update public.inventory
        set current_stock = greatest(0, coalesce(current_stock, 0) + p_delta)
        where id = p_inventory_id and organization_id = p_org
        returning current_stock into v_new;

    if not found then
        raise exception 'inventory % not in org %', p_inventory_id, p_org using errcode = 'P0002';
    end if;

    insert into public.stock_movements
        (organization_id, inventory_id, type, qty, resulting_stock, unit_price, by_user_id, note, order_line_id, bon_id)
        values (p_org, p_inventory_id, p_type, p_delta, v_new, p_unit_price, v_uid, p_note, p_order_line_id, p_bon_id);

    return v_new;
end $$;

revoke all on function public.increment_inventory_stock(uuid, integer, numeric, text, numeric, uuid, text, bigint) from public;
grant execute on function public.increment_inventory_stock(uuid, integer, numeric, text, numeric, uuid, text, bigint) to authenticated, service_role;
