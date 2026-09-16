-- Handmatige test voor productie_partij_afronden. Draait in een transactie
-- die aan het eind wordt teruggedraaid: er blijft niets achter.
--
--   npx supabase db query --linked -o table -f supabase/tests/partij_afronden.sql
--
-- Verwacht: 1 partij, 12 eenheden, 1 stock_movement van +12, en de tweede
-- aanroep met dezelfde sleutel geeft bestond=true zonder tweede partij.
--
-- De uitkomst komt als een EXCEPTION terug ("GESLAAGD: ..."): dat is de
-- enige manier om via de Management API iets te zien én alles terug te
-- draaien. Elke andere foutmelding is een echte fout.

do $$
declare
    v_org  uuid;
    v_comp bigint;
    v_key  uuid := gen_random_uuid();
    v_r1   jsonb;
    v_r2   jsonb;
    v_r3   jsonb;
    v_partij uuid;
    v_n_partijen int;
    v_n_eenheden int;
    v_n_moves int;
    v_delta numeric;
    v_eenheden jsonb;
begin
    select organization_id, id into v_org, v_comp
      from public.components
     where organization_id is not null
     order by created_at desc limit 1;
    if v_org is null then raise exception 'geen component gevonden om mee te testen'; end if;

    select jsonb_agg(jsonb_build_object('volgnummer', i, 'inhoud', 1, 'eenheid', 'kg'))
      into v_eenheden from generate_series(1, 12) i;

    v_r1 := public.productie_partij_afronden(
        v_org, v_key, v_comp, 12, 'kg', 1, 'kg', v_eenheden,
        p_tht => current_date + 90, p_bewaarmethode => 'vries', p_bewaaradvies => 'max. -18 °C');
    v_partij := (v_r1->'partij'->>'id')::uuid;

    -- Tweede klik: zelfde sleutel.
    v_r2 := public.productie_partij_afronden(
        v_org, v_key, v_comp, 12, 'kg', 1, 'kg', v_eenheden);
    -- Derde klik: andere sleutel maar zelfde prep_task zou ook moeten botsen;
    -- hier geen prep_task, dus nieuwe partij met volgnummer 02.
    v_r3 := public.productie_partij_afronden(
        v_org, gen_random_uuid(), v_comp, 3.4, 'kg', 1, 'kg',
        '[{"volgnummer":1,"inhoud":1,"eenheid":"kg"},{"volgnummer":2,"inhoud":1,"eenheid":"kg"},{"volgnummer":3,"inhoud":1,"eenheid":"kg"},{"volgnummer":4,"inhoud":0.4,"eenheid":"kg"}]'::jsonb);

    select count(*) into v_n_partijen from public.productie_partijen where idempotency_key = v_key;
    select count(*) into v_n_eenheden from public.voorraad_eenheden where partij_id = v_partij;
    select count(*), sum(qty) into v_n_moves, v_delta from public.stock_movements where partij_id = v_partij;


    if v_n_partijen <> 1 then raise exception 'FOUT: % partijen voor één sleutel', v_n_partijen; end if;
    if (v_r2->>'bestond')::boolean is not true then raise exception 'FOUT: tweede aanroep maakte iets nieuws'; end if;
    if v_r1->'partij'->>'id' <> v_r2->'partij'->>'id' then raise exception 'FOUT: tweede aanroep gaf andere partij'; end if;
    if v_n_eenheden <> 12 then raise exception 'FOUT: % eenheden i.p.v. 12', v_n_eenheden; end if;
    if v_n_moves <> 1 or v_delta <> 12 then raise exception 'FOUT: % mutaties, delta %', v_n_moves, v_delta; end if;
    if (v_r3->'partij'->>'aantal_eenheden')::int <> 4 then raise exception 'FOUT: restpartij'; end if;
    raise exception 'GESLAAGD: partij % (bestond1=%, bestond2=%), % eenheden, % mutatie van +%; restpartij % met % eenheden, laatste code % — alles teruggedraaid',
        v_r1->'partij'->>'partijnummer', v_r1->>'bestond', v_r2->>'bestond', v_n_eenheden, v_n_moves, v_delta,
        v_r3->'partij'->>'partijnummer', v_r3->'partij'->>'aantal_eenheden', (v_r3->'eenheden'->3->>'code');
end $$;
