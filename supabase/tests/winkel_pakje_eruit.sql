-- Test voor 20261120130000_winkel_pakje_eruit: weggooien of invriezen aan de kassa
-- (Toonbank, POST pakjes/eruit en pakjes/{stuk_id}/terug) en de vriezerlijst.
-- Draait in één transactie die aan het eind wordt teruggedraaid.
--
-- ALLEEN op de dev-database, nooit op live en nooit met --linked:
--   npm --prefix tools/testdb run test -- winkel_pakje_eruit
-- Vereist de seed supabase/tests/seed_vier_naober.sql.
--
-- Bewijst: controlecijfers (prijscode en kaassticker); bij gelijke codes het pakje met
-- de vroegste THT; weggooien = afgeschreven, invriezen = naar_keuken met de dag;
-- hetzelfde verzoek_id = hetzelfde antwoord en nooit een tweede pakje; niet op voorraad
-- (met en zonder naam); kaas gaat in grammen van de voorraad af en komt terug;
-- terug alleen via de kassa, één keer, niet na gebruikt; vriezerlijst afvinken; rechten.
--
-- Verwacht: "GESLAAGD: ..." als EXCEPTION.

-- Een geldige prijscode: 21 + PLU (4) + prijscontrole K + prijs (5) + EAN-controlecijfer.
create function pg_temp.pc(p_plu text, p_cents int)
returns text language sql as $$
    with b as (select '21' || p_plu || private.prijscode_prijscontrole(lpad(p_cents::text, 5, '0'))::text || lpad(p_cents::text, 5, '0') as c)
    select c || ((10 - (select sum(substr(c, i, 1)::int * case when i % 2 = 0 then 3 else 1 end) from generate_series(1, 12) i) % 10) % 10)::text from b
$$;

-- Een geldige kaassticker uit de eerste 27 cijfers.
create function pg_temp.sc(p_27 text)
returns text language sql as $$
    select p_27 || ((10 - (select sum(substr(p_27, i, 1)::int * case when i % 2 = 1 then 3 else 1 end) from generate_series(1, 27) i) % 10) % 10)::text
$$;

do $$
declare
    v_org    uuid;
    v_sfx    text := substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);
    v_haas   uuid;
    v_kaas   uuid;
    v_c      text;
    v_sticker text;
    v_vroeg  uuid;
    v_laat   uuid;
    v_kaasstuk uuid;
    v_v1     uuid := gen_random_uuid();
    v_v2     uuid := gen_random_uuid();
    v_v3     uuid := gen_random_uuid();
    v_r      jsonb;
    v_r2     jsonb;
    v_n      int;
    v_fouten text := '';
begin
    select id into v_org from public.organizations where slug = 'e2e-hop-en-bites';
    if v_org is null then
        raise exception 'GEWEIGERD: organisatie e2e-hop-en-bites bestaat niet. Deze test draait alleen op de dev-database, na de seed.';
    end if;

    insert into public.winkel_producten (organization_id, naam, type, eenheid, prijs_per, winkelprijs_incl_cents, btw_pct, actief, prijscode_nr)
    values (v_org, 'TEST haasbiefstuk ' || v_sfx, 'vleeswaar', 'gram', 100, 899, 9, true, '9301') returning id into v_haas;
    insert into public.winkel_producten (organization_id, naam, type, eenheid, prijs_per, winkelprijs_incl_cents, btw_pct, actief)
    values (v_org, 'TEST oude kaas ' || v_sfx, 'kaas', 'gram', 1000, 2495, 9, true) returning id into v_kaas;
    perform public.winkel_muteer_voorraad(v_org, v_kaas, 'telling', 5000);

    -- Twee pakjes met dezelfde code (zelfde prijs): het latere eerst binnengemeld.
    v_c := pg_temp.pc('9301', 2823);
    v_laat  := (public.winkel_stuk_binnen_prijscode(v_org, v_c, current_date + 6)->>'stuk_id')::uuid;
    v_vroeg := (public.winkel_stuk_binnen_prijscode(v_org, v_c, current_date + 2)->>'stuk_id')::uuid;
    -- Een stuk kaas met een eigen sticker: 250 g.
    v_sticker := pg_temp.sc('29' || '93011' || '00250' || '02495' || to_char(current_date + 20, 'YYMMDD') || '0001');
    insert into public.winkel_stuks (organization_id, winkel_product_id, code, bron, plu, gewicht_g, kiloprijs_cents, prijs_cents, tht)
    values (v_org, v_kaas, v_sticker, 'sticker', 93011, 250, 2495, 624, current_date + 20) returning id into v_kaasstuk;

    -- ── 1. Controlecijfers.
    if public.winkel_stuk_eruit(v_org, gen_random_uuid(), left(v_c, 12) || ((substr(v_c, 13, 1)::int + 1) % 10)::text, 'weggooien')->>'uitkomst' <> 'controlecijfer'
       or public.winkel_stuk_eruit(v_org, gen_random_uuid(), left(v_sticker, 27) || ((substr(v_sticker, 28, 1)::int + 1) % 10)::text, 'weggooien')->>'uitkomst' <> 'controlecijfer'
       or not private.stickercode_geldig('2900002003040156226121001089') then
        v_fouten := v_fouten || 'controlecijfer; ';
    end if;

    -- ── 2. Weggooien: het pakje met de vroegste THT.
    v_r := public.winkel_stuk_eruit(v_org, v_v1, v_c, 'weggooien');
    if v_r->>'uitkomst' <> 'eruit' or (v_r->>'stuk_id')::uuid <> v_vroeg or v_r->>'wat' <> 'weggooien'
       or (v_r->>'prijs_cents')::int <> 2823 or (v_r->>'tht')::date <> current_date + 2 or v_r->'ingevroren_op' <> 'null'::jsonb
       or (select status from public.winkel_stuks where id = v_vroeg) <> 'afgeschreven' then
        v_fouten := v_fouten || 'weggooien: ' || v_r::text || '; ';
    end if;
    -- Hetzelfde verzoek nog eens: hetzelfde antwoord, het tweede pakje blijft liggen.
    v_r2 := public.winkel_stuk_eruit(v_org, v_v1, v_c, 'weggooien');
    if v_r2 <> v_r or (select status from public.winkel_stuks where id = v_laat) <> 'op_voorraad' then
        v_fouten := v_fouten || 'verzoek_id niet idempotent: ' || coalesce(v_r2::text, 'leeg') || '; ';
    end if;

    -- ── 3. Invriezen: het andere pakje, met de dag.
    v_r := public.winkel_stuk_eruit(v_org, v_v2, v_c, 'invriezen');
    if v_r->>'uitkomst' <> 'eruit' or (v_r->>'stuk_id')::uuid <> v_laat
       or (v_r->>'ingevroren_op')::date <> (now() at time zone 'Europe/Amsterdam')::date
       or (select status from public.winkel_stuks where id = v_laat) <> 'naar_keuken'
       or (select ingevroren_op from public.winkel_stuks where id = v_laat) <> (now() at time zone 'Europe/Amsterdam')::date then
        v_fouten := v_fouten || 'invriezen: ' || v_r::text || '; ';
    end if;

    -- ── 4. Niets meer op voorraad: met de naam; een onbekende code zonder naam.
    v_r := public.winkel_stuk_eruit(v_org, v_v3, v_c, 'weggooien');
    if v_r->>'uitkomst' <> 'niet_op_voorraad' or v_r->>'naam' <> 'TEST haasbiefstuk ' || v_sfx then
        v_fouten := v_fouten || 'niet op voorraad: ' || v_r::text || '; ';
    end if;
    -- Daarna toch een pakje binnen: hetzelfde verzoek blijft "niet op voorraad" en haalt niets eruit.
    perform public.winkel_stuk_binnen_prijscode(v_org, v_c, current_date + 9);
    v_r := public.winkel_stuk_eruit(v_org, v_v3, v_c, 'weggooien');
    if v_r->>'uitkomst' <> 'niet_op_voorraad'
       or (select count(*) from public.winkel_stuks where organization_id = v_org and code = v_c and status = 'op_voorraad') <> 1 then
        v_fouten := v_fouten || 'herhaald niet-op-voorraad haalde toch iets eruit; ';
    end if;
    v_r := public.winkel_stuk_eruit(v_org, gen_random_uuid(), pg_temp.pc('9399', 100), 'weggooien');
    if v_r->>'uitkomst' <> 'niet_op_voorraad' or v_r->'naam' <> 'null'::jsonb then
        v_fouten := v_fouten || 'onbekende code: ' || v_r::text || '; ';
    end if;

    -- ── 5. Kaas invriezen: 250 g van de voorraad; terug: er weer bij.
    v_r := public.winkel_stuk_eruit(v_org, gen_random_uuid(), v_sticker, 'invriezen');
    if v_r->>'uitkomst' <> 'eruit' or (v_r->>'stuk_id')::uuid <> v_kaasstuk
       or (select voorraad from public.winkel_producten where id = v_kaas) <> 4750 then
        v_fouten := v_fouten || 'kaas invriezen: ' || v_r::text || ' voorraad ' || (select voorraad from public.winkel_producten where id = v_kaas) || '; ';
    end if;
    v_r := public.winkel_stuk_terug(v_org, v_kaasstuk);
    if not (v_r->>'terug')::boolean or (select voorraad from public.winkel_producten where id = v_kaas) <> 5000
       or (select status from public.winkel_stuks where id = v_kaasstuk) <> 'op_voorraad'
       or (select ingevroren_op from public.winkel_stuks where id = v_kaasstuk) is not null then
        v_fouten := v_fouten || 'kaas terug: ' || v_r::text || '; ';
    end if;
    -- Nog een keer eruit en terug: de voorraad gaat er opnieuw af en weer bij.
    perform public.winkel_stuk_eruit(v_org, gen_random_uuid(), v_sticker, 'weggooien');
    if (select voorraad from public.winkel_producten where id = v_kaas) <> 4750 then
        v_fouten := v_fouten || 'tweede keer eruit boekte niet; ';
    end if;
    perform public.winkel_stuk_terug(v_org, v_kaasstuk);
    if (select voorraad from public.winkel_producten where id = v_kaas) <> 5000 then
        v_fouten := v_fouten || 'tweede keer terug boekte niet; ';
    end if;

    -- ── 6. Terug: één keer; niet als het niet via de kassa ging; niet na gebruikt.
    -- Eerst terugzetten, dan kijken: een losse subquery in dezelfde IF draait vóór de functie.
    v_r := public.winkel_stuk_terug(v_org, v_vroeg);
    if not (v_r->>'terug')::boolean or (select status from public.winkel_stuks where id = v_vroeg) <> 'op_voorraad' then
        v_fouten := v_fouten || 'weggegooid pakje terug; ';
    end if;
    if (public.winkel_stuk_terug(v_org, v_vroeg)->>'terug')::boolean then
        v_fouten := v_fouten || 'twee keer terug; ';
    end if;
    perform public.winkel_stuk_afboeken(v_org, v_vroeg, 'afgeschreven');
    if (public.winkel_stuk_terug(v_org, v_vroeg)->>'terug')::boolean then
        v_fouten := v_fouten || 'terug na afboeken in BBQ Architect; ';
    end if;

    -- ── 7. Vriezerlijst: afvinken, ongedaan maken, en dan kan het niet meer terug.
    if (select count(*) from public.winkel_stuks where organization_id = v_org and ingevroren_op is not null and opgebruikt_at is null and id = v_laat) <> 1 then
        v_fouten := v_fouten || 'niet in de vriezerlijst; ';
    end if;
    perform public.winkel_stuk_opgebruikt(v_org, v_laat, true);
    perform public.winkel_stuk_opgebruikt(v_org, v_laat, false);
    if (select opgebruikt_at from public.winkel_stuks where id = v_laat) is not null then
        v_fouten := v_fouten || 'gebruikt ongedaan maken; ';
    end if;
    perform public.winkel_stuk_opgebruikt(v_org, v_laat, true);
    if (public.winkel_stuk_terug(v_org, v_laat)->>'terug')::boolean
       or (select status from public.winkel_stuks where id = v_laat) <> 'naar_keuken' then
        v_fouten := v_fouten || 'terug na gebruikt; ';
    end if;
    begin
        perform public.winkel_stuk_opgebruikt(v_org, v_vroeg, true);
        v_fouten := v_fouten || 'afvinken van iets dat niet in de vriezer ligt; ';
    exception when no_data_found then null;
    end;
    begin
        update public.winkel_stuks set ingevroren_op = current_date where id = v_vroeg;
        v_fouten := v_fouten || 'invriesdatum op een weggegooid stuk; ';
    exception when check_violation then null;
    end;

    -- ── 8. Logboek en rechten.
    select count(*) into v_n from public.winkel_stuk_eruit where organization_id = v_org and code = v_c;
    if v_n <> 3 then v_fouten := v_fouten || 'logboek telt ' || v_n || '; '; end if;
    if has_function_privilege('anon', 'public.winkel_stuk_eruit(uuid, uuid, text, text, uuid, uuid)', 'EXECUTE')
       or has_function_privilege('authenticated', 'public.winkel_stuk_eruit(uuid, uuid, text, text, uuid, uuid)', 'EXECUTE')
       or has_function_privilege('authenticated', 'public.winkel_stuk_terug(uuid, uuid)', 'EXECUTE')
       or not has_function_privilege('authenticated', 'public.winkel_stuk_opgebruikt(uuid, uuid, boolean)', 'EXECUTE')
       or has_table_privilege('authenticated', 'public.winkel_stuk_eruit', 'INSERT') then
        v_fouten := v_fouten || 'rechten kloppen niet; ';
    end if;

    if v_fouten <> '' then raise exception 'FOUT: %', v_fouten; end if;
    raise exception 'GESLAAGD: controlecijfers (prijscode en sticker); vroegste THT eerst; weggooien = afgeschreven; invriezen = naar_keuken met de dag; verzoek_id idempotent, ook bij niet op voorraad; naam bij niet op voorraad; kaas in grammen eraf en terug (twee keer); terug één keer, niet na afboeken in BBQ Architect, niet na gebruikt; vriezerlijst afvinken en ongedaan; rechten — alles teruggedraaid';
end $$;
