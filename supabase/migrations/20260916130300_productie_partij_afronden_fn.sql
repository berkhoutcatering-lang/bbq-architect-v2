-- productie_partij_afronden — de ene transactie die een productie afrondt (fase 1).
--
-- In één keer, of helemaal niet:
--   1. partij aanmaken (nummer PP-20260916-01);
--   2. exact N voorraadeenheden aanmaken (codes ...-001 t/m ...-0NN);
--   3. het eindproduct als voorraadproduct koppelen of aanmaken;
--   4. de hoeveelheid inboeken via increment_inventory_stock (type 'productie').
--
-- Idempotent: dezelfde idempotency_key, dezelfde prep_task of hetzelfde
-- mep_item geeft de bestaande partij terug, zonder iets te veranderen. Een
-- advisory lock op (org, key) zorgt dat twee gelijktijdige klikken elkaar
-- niet kruisen. Printen zit hier bewust niet in.
--
-- De eenheden komen als jsonb binnen ([{volgnummer, inhoud, eenheid}]):
-- het rekenwerk (12,4 kg ÷ 1 kg = 12 + rest) zit in src/lib/productie en is
-- daar getest; deze functie bewaakt alleen dat het klopt (>0, oplopend).

create or replace function public.eenheid_factor(p_van text, p_naar text)
returns numeric
language sql
immutable
as $$
    select case
        when p_van = p_naar then 1
        when p_van = 'g'  and p_naar = 'kg' then 0.001
        when p_van = 'kg' and p_naar = 'g'  then 1000
        when p_van = 'ml' and p_naar = 'l'  then 0.001
        when p_van = 'l'  and p_naar = 'ml' then 1000
        when p_van in ('stuk','stuks','st') and p_naar in ('stuk','stuks','st') then 1
        when p_van in ('portie','porties') and p_naar in ('portie','porties') then 1
        else null
    end;
$$;

create or replace function public.productie_partij_afronden(
    p_org                   uuid,
    p_idempotency_key       uuid,
    p_component_id          bigint,
    p_geproduceerde_hoeveelheid numeric,
    p_eenheid               text,
    p_verpakking_grootte    numeric,
    p_verpakking_eenheid    text,
    p_eenheden              jsonb,
    p_productiedatum        date    default current_date,
    p_tht                   date    default null,
    p_bewaarmethode         text    default null,
    p_bewaaradvies          text    default null,
    p_opslag_locatie_id     uuid    default null,
    p_personeel_id          uuid    default null,
    p_prep_task_id          integer default null,
    p_mep_item_id           bigint  default null,
    p_gerecht_id            uuid    default null,
    p_event_id              integer default null,
    p_geplande_hoeveelheid  numeric default null,
    p_haccp_snapshot        jsonb   default null,
    p_notitie               text    default null
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_uid          uuid := auth.uid();
    v_bestaand     public.productie_partijen%rowtype;
    v_comp         record;
    v_prefix       text;
    v_datum_tekst  text;
    v_volgnr       integer;
    v_nummer       text;
    v_partij_id    uuid;
    v_inv_id       integer;
    v_inv_unit     text;
    v_inv_naam     text;
    v_factor       numeric;
    v_som          numeric := 0;
    v_n            integer;
    v_e            jsonb;
    v_i            integer := 0;
    v_pad          integer;
    v_eenheden     jsonb;
begin
    -- tenant-guard, identiek aan increment_inventory_stock
    if v_uid is not null and p_org not in (select private.user_org_ids()) then
        raise exception 'forbidden' using errcode = '42501';
    end if;
    if p_geproduceerde_hoeveelheid is null or p_geproduceerde_hoeveelheid <= 0 then
        raise exception 'geproduceerde hoeveelheid moet > 0 zijn' using errcode = '22023';
    end if;
    if p_verpakking_grootte is null or p_verpakking_grootte <= 0 then
        raise exception 'verpakking moet > 0 zijn' using errcode = '22023';
    end if;
    if p_eenheden is null or jsonb_typeof(p_eenheden) <> 'array' or jsonb_array_length(p_eenheden) = 0 then
        raise exception 'minstens één eenheid verplicht' using errcode = '22023';
    end if;
    v_n := jsonb_array_length(p_eenheden);

    -- Dubbelklik-slot: twee gelijke verzoeken wachten op elkaar en de tweede
    -- vindt de partij van de eerste.
    perform pg_advisory_xact_lock(hashtext(p_org::text || ':' || p_idempotency_key::text));

    select * into v_bestaand from public.productie_partijen
     where organization_id = p_org
       and (idempotency_key = p_idempotency_key
            or (p_prep_task_id is not null and prep_task_id = p_prep_task_id)
            or (p_mep_item_id is not null and mep_item_id = p_mep_item_id))
     limit 1;
    if found then
        return public.partij_als_jsonb(v_bestaand.id, true);
    end if;

    select id, name, partij_prefix, voorraad_item_id
      into v_comp
      from public.components
     where id = p_component_id and organization_id = p_org;
    if not found then
        raise exception 'component % niet in org', p_component_id using errcode = 'P0002';
    end if;

    -- Partijnummer: PREFIX-JJJJMMDD-NN, volgnummer per org per dag.
    v_prefix := coalesce(v_comp.partij_prefix, public.partij_prefix_van(v_comp.name));
    v_datum_tekst := to_char(p_productiedatum, 'YYYYMMDD');
    perform pg_advisory_xact_lock(hashtext(p_org::text || ':partijnummer:' || v_datum_tekst));
    select coalesce(max(substring(partijnummer from '-(\d+)$')::integer), 0) + 1
      into v_volgnr
      from public.productie_partijen
     where organization_id = p_org and partijnummer like v_prefix || '-' || v_datum_tekst || '-%';
    v_nummer := v_prefix || '-' || v_datum_tekst || '-' || lpad(v_volgnr::text, 2, '0');

    -- Voorraadproduct van het eindproduct: gekoppeld, op naam gevonden, of nieuw.
    v_inv_id := v_comp.voorraad_item_id;
    if v_inv_id is not null then
        select unit into v_inv_unit from public.inventory where id = v_inv_id and organization_id = p_org;
        if not found then v_inv_id := null; end if;
    end if;
    if v_inv_id is null then
        select id, unit into v_inv_id, v_inv_unit
          from public.inventory
         where organization_id = p_org and lower(btrim(naam)) = lower(btrim(v_comp.name))
         limit 1;
        if found and public.eenheid_factor(p_verpakking_eenheid, coalesce(v_inv_unit, p_verpakking_eenheid)) is null then
            -- Zelfde naam, andere soort eenheid (bv. stuks vs kg): apart product.
            v_inv_id := null;
        end if;
    end if;
    if v_inv_id is null then
        v_inv_naam := v_comp.name;
        if exists (select 1 from public.inventory where organization_id = p_org and lower(btrim(naam)) = lower(btrim(v_inv_naam))) then
            v_inv_naam := v_comp.name || ' (bereid)';
        end if;
        insert into public.inventory (organization_id, naam, categorie, unit, current_stock, storage_type, supplier)
        values (p_org, v_inv_naam, 'Bereid', p_verpakking_eenheid, 0, p_bewaarmethode, 'Eigen productie')
        returning id, unit into v_inv_id, v_inv_unit;
    end if;
    update public.components set voorraad_item_id = v_inv_id
     where id = p_component_id and coalesce(voorraad_item_id, -1) <> v_inv_id;

    v_factor := public.eenheid_factor(p_verpakking_eenheid, coalesce(v_inv_unit, p_verpakking_eenheid));
    if v_factor is null then
        raise exception 'eenheid % past niet op voorraadproduct in %', p_verpakking_eenheid, v_inv_unit using errcode = '22023';
    end if;

    insert into public.productie_partijen (
        organization_id, partijnummer, component_id, gerecht_id, prep_task_id, mep_item_id, event_id,
        geplande_hoeveelheid, geproduceerde_hoeveelheid, eenheid, verpakking_grootte, verpakking_eenheid,
        aantal_eenheden, productiedatum, tht, bewaarmethode, bewaaradvies, opslag_locatie_id, inventory_id,
        personeel_id, by_user_id, status, idempotency_key, haccp_snapshot, notitie
    ) values (
        p_org, v_nummer, p_component_id, p_gerecht_id, p_prep_task_id, p_mep_item_id, p_event_id,
        p_geplande_hoeveelheid, p_geproduceerde_hoeveelheid, p_eenheid, p_verpakking_grootte, p_verpakking_eenheid,
        v_n, p_productiedatum, p_tht, p_bewaarmethode, p_bewaaradvies, p_opslag_locatie_id, v_inv_id,
        p_personeel_id, v_uid, 'vrijgegeven', p_idempotency_key, p_haccp_snapshot, p_notitie
    ) returning id into v_partij_id;

    v_pad := greatest(3, length(v_n::text));
    for v_e in select * from jsonb_array_elements(p_eenheden) loop
        v_i := v_i + 1;
        if coalesce((v_e->>'volgnummer')::integer, -1) <> v_i then
            raise exception 'eenheden moeten oplopend genummerd zijn vanaf 1' using errcode = '22023';
        end if;
        if coalesce((v_e->>'inhoud')::numeric, 0) <= 0 then
            raise exception 'inhoud van eenheid % moet > 0 zijn', v_i using errcode = '22023';
        end if;
        insert into public.voorraad_eenheden (organization_id, partij_id, volgnummer, code, inhoud, eenheid, opslag_locatie_id)
        values (p_org, v_partij_id, v_i, v_nummer || '-' || lpad(v_i::text, v_pad, '0'),
                (v_e->>'inhoud')::numeric, coalesce(v_e->>'eenheid', p_verpakking_eenheid), p_opslag_locatie_id);
        v_som := v_som + (v_e->>'inhoud')::numeric * public.eenheid_factor(coalesce(v_e->>'eenheid', p_verpakking_eenheid), coalesce(v_inv_unit, p_verpakking_eenheid));
    end loop;

    perform public.increment_inventory_stock(
        p_org, v_inv_id, v_som, 'productie',
        null, null, 'Partij ' || v_nummer || ' (' || v_n || ' eenheden)', null, v_partij_id
    );

    return public.partij_als_jsonb(v_partij_id, false);
end $$;

-- Eén vorm voor "geef me de partij met eenheden" — gebruikt door de functie
-- hierboven en door de API.
create or replace function public.partij_als_jsonb(p_partij_id uuid, p_bestond boolean)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
    select jsonb_build_object(
        'bestond', p_bestond,
        'partij', to_jsonb(p) - 'haccp_snapshot',
        'eenheden', coalesce((
            select jsonb_agg(to_jsonb(e) order by e.volgnummer)
            from public.voorraad_eenheden e where e.partij_id = p.id
        ), '[]'::jsonb)
    )
    from public.productie_partijen p
    where p.id = p_partij_id
      and (auth.uid() is null or p.organization_id in (select private.user_org_ids()));
$$;

revoke all on function public.productie_partij_afronden(uuid, uuid, bigint, numeric, text, numeric, text, jsonb, date, date, text, text, uuid, uuid, integer, bigint, uuid, integer, numeric, jsonb, text) from public;
grant execute on function public.productie_partij_afronden(uuid, uuid, bigint, numeric, text, numeric, text, jsonb, date, date, text, text, uuid, uuid, integer, bigint, uuid, integer, numeric, jsonb, text) to authenticated, service_role;
revoke all on function public.partij_als_jsonb(uuid, boolean) from public;
grant execute on function public.partij_als_jsonb(uuid, boolean) to authenticated, service_role;
