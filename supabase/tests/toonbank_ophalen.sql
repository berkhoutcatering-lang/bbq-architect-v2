-- Test voor BA-10 (migratie 20261007130000_toonbank_afhalen_dagstaten): ophalen
-- vanaf de Toonbank. toonbank_ophaal_vraag (order en doos, idempotent,
-- restbedrag vooraf vergeleken, rest_bon_id, dubbel betaald → bon te
-- controleren), de vernieuwde winkel_doos_ophalen (leeftijd_nodig, geweigerd,
-- medewerker, bon, te_weinig_voorraad zonder boeking) en winkel_boek_rest
-- met p_org. Draait in één transactie die aan het eind wordt teruggedraaid.
--
-- ALLEEN op de dev-database, nooit op live en nooit met --linked:
--
--   npx supabase db query --db-url "$DEV_DB_URL" -o table -f supabase/tests/toonbank_ophalen.sql
--
-- of lokaal: npm --prefix tools/testdb run test -- toonbank_ophalen
-- Vereist de seed supabase/tests/seed_vier_naober.sql.
--
-- Verwacht: "GESLAAGD: ..." als EXCEPTION.

-- Een bon met alleen een restbetaling op een webshoporder (order_rest + pin).
create function pg_temp.tb_restbon(p_gid uuid, p_volgnr bigint, p_bonnummer text, p_order_id bigint, p_nummer text, p_bedrag int)
returns jsonb language sql as $$
    select jsonb_build_object('soort', 'bon', 'gebeurtenis_id', p_gid, 'volgnummer', p_volgnr, 'moment', '2026-03-06T16:32:00+01:00',
        'medewerker_id', null, 'bon_id', p_gid, 'bonnummer', p_bonnummer, 'bon_volgnummer', split_part(p_bonnummer, '-', 2)::int,
        'status', 'afgerond', 'kanaal', 'winkel', 'catalogus_versie', 1, 'leeftijd', null,
        'regels', jsonb_build_array(
            jsonb_build_object('regelnr', 1, 'soort', 'order_rest', 'order_id', p_order_id, 'nummer', p_nummer, 'bedrag_cents', p_bedrag),
            jsonb_build_object('regelnr', 2, 'soort', 'betaling', 'betaalmethode', 'pin', 'betaal_bevestiging', 'handmatig', 'bedrag_cents', p_bedrag)),
        'totaal_cents', p_bedrag, 'afronding_cents', 0)
$$;

do $$
declare
    v_org      uuid;
    v_sfx      text := substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);
    v_hash     text := repeat('a', 32) || ':' || repeat('b', 128);
    v_app      uuid;
    v_code     text;
    v_mw       uuid;
    v_bier     uuid;
    v_krap     uuid;
    v_art      uuid;
    v_art_krap uuid;
    v_regel    jsonb;
    v_regel_k  jsonb;
    v_o        public.winkel_orders%rowtype;
    v_a        bigint;  -- reservering met rest, losse winkelwaar (alcohol)
    v_c        bigint;  -- reservering, rest eerst in BA geboekt
    v_d        bigint;  -- reservering, rest in BA, bon komt later
    v_e        bigint;  -- volledig betaald, doos met alcohol
    v_f        bigint;  -- reservering met een doos
    v_g        bigint;  -- doos met te weinig voorraad
    v_rid      bigint;
    v_doos_e   text;
    v_doos_f   text;
    v_doos_g   text;
    v_b1       uuid := gen_random_uuid();
    v_b2       uuid := gen_random_uuid();
    v_b3       uuid := gen_random_uuid();
    v_bf       uuid := gen_random_uuid();
    v_g1       uuid := gen_random_uuid();
    v_r        jsonb;
    v_r2       jsonb;
    v_n        int;
    v_n2       int;
    v_vnr      bigint := 0;
    v_fouten   text := '';
begin
    select id into v_org from public.organizations where slug = 'e2e-hop-en-bites';
    if v_org is null then
        raise exception 'GEWEIGERD: organisatie e2e-hop-en-bites bestaat niet. Deze test draait alleen op de dev-database, na supabase/tests/seed_vier_naober.sql.';
    end if;

    v_r := public.toonbank_apparaat_nieuw(v_org, 'TEST ophalen ' || v_sfx, 'winkel', v_hash);
    v_app := (v_r->>'apparaat_id')::uuid; v_code := v_r->>'code';
    insert into public.personeel (organization_id, naam, toonbank_rol) values (v_org, 'TEST Sanne', 'medewerker') returning id into v_mw;

    insert into public.winkel_producten (organization_id, naam, type, eenheid, prijs_per, btw_pct, alcohol)
    values (v_org, 'TEST ophaalbier ' || v_sfx, 'bier', 'stuk', 1, 21, true) returning id into v_bier;
    insert into public.winkel_producten (organization_id, naam, type, eenheid, prijs_per, btw_pct, alcohol)
    values (v_org, 'TEST krap ' || v_sfx, 'bier', 'stuk', 1, 21, true) returning id into v_krap;
    perform public.winkel_muteer_voorraad(v_org, v_bier, 'telling', 40);
    perform public.winkel_muteer_voorraad(v_org, v_krap, 'telling', 2);
    insert into public.winkel_artikelen (organization_id, slug, naam, actief, alcohol)
    values (v_org, 'test-tbo-bier-' || v_sfx, 'TEST Bierpakket', true, true) returning id into v_art;
    insert into public.winkel_artikelen (organization_id, slug, naam, actief, alcohol)
    values (v_org, 'test-tbo-krap-' || v_sfx, 'TEST Krap pakket', true, true) returning id into v_art_krap;
    v_regel := jsonb_build_object('artikel_id', v_art, 'slug', 'test-tbo-bier', 'naam', 'TEST Bierpakket', 'aantal', 1, 'eenheid', 'per stuk',
        'stuk_cents', 1380, 'bedrag_cents', 1380, 'btw_pct', 21, 'eenheden', 1, 'voorraad_eenheden', 0, 'alcohol', true,
        'componenten', jsonb_build_array(jsonb_build_object('product_id', v_bier, 'slot_type', 'bier', 'naam', 'Bier', 'hoeveelheid', 4, 'eenheid', 'stuk')));
    v_regel_k := jsonb_build_object('artikel_id', v_art_krap, 'slug', 'test-tbo-krap', 'naam', 'TEST Krap pakket', 'aantal', 1, 'eenheid', 'per stuk',
        'stuk_cents', 1000, 'bedrag_cents', 1000, 'btw_pct', 21, 'eenheden', 1, 'voorraad_eenheden', 0, 'alcohol', true,
        'componenten', jsonb_build_array(jsonb_build_object('product_id', v_krap, 'slot_type', 'bier', 'naam', 'Krap', 'hoeveelheid', 2, 'eenheid', 'stuk')));

    -- Orders: A, C, D en F reservering (rest 1130), E volledig, G volledig (krap).
    v_o := public.winkel_plaats_order(v_org, 'test-sleutel-' || gen_random_uuid(), 'test-token-' || gen_random_uuid(), 'afhalen', null,
        'Jansen', 'j@example.invalid', null, null, null, 1380, 0, 1380, '{}'::jsonb, 'https://example.invalid', jsonb_build_array(v_regel),
        p_betaalwijze => 'reservering', p_nu_te_betalen_cents => 250, p_rest_cents => 1130);
    v_a := v_o.id;
    v_o := public.winkel_plaats_order(v_org, 'test-sleutel-' || gen_random_uuid(), 'test-token-' || gen_random_uuid(), 'afhalen', null,
        'De Vries', 'dv@example.invalid', null, null, null, 1380, 0, 1380, '{}'::jsonb, 'https://example.invalid', jsonb_build_array(v_regel),
        p_betaalwijze => 'reservering', p_nu_te_betalen_cents => 250, p_rest_cents => 1130);
    v_c := v_o.id;
    v_o := public.winkel_plaats_order(v_org, 'test-sleutel-' || gen_random_uuid(), 'test-token-' || gen_random_uuid(), 'afhalen', null,
        'Bakker', 'b@example.invalid', null, null, null, 1380, 0, 1380, '{}'::jsonb, 'https://example.invalid', jsonb_build_array(v_regel),
        p_betaalwijze => 'reservering', p_nu_te_betalen_cents => 250, p_rest_cents => 1130);
    v_d := v_o.id;
    v_o := public.winkel_plaats_order(v_org, 'test-sleutel-' || gen_random_uuid(), 'test-token-' || gen_random_uuid(), 'afhalen', null,
        'Visser', 'v@example.invalid', null, null, null, 1380, 0, 1380, '{}'::jsonb, 'https://example.invalid', jsonb_build_array(v_regel));
    v_e := v_o.id;
    v_o := public.winkel_plaats_order(v_org, 'test-sleutel-' || gen_random_uuid(), 'test-token-' || gen_random_uuid(), 'afhalen', null,
        'Smit', 's@example.invalid', null, null, null, 1380, 0, 1380, '{}'::jsonb, 'https://example.invalid', jsonb_build_array(v_regel),
        p_betaalwijze => 'reservering', p_nu_te_betalen_cents => 250, p_rest_cents => 1130);
    v_f := v_o.id;
    v_o := public.winkel_plaats_order(v_org, 'test-sleutel-' || gen_random_uuid(), 'test-token-' || gen_random_uuid(), 'afhalen', null,
        'Mulder', 'm@example.invalid', null, null, null, 1000, 0, 1000, '{}'::jsonb, 'https://example.invalid', jsonb_build_array(v_regel_k));
    v_g := v_o.id;
    update public.winkel_orders set status = 'betaald', betaald_at = now() where id in (v_a, v_c, v_d, v_e, v_f, v_g);
    select id into v_rid from public.winkel_order_regels where order_id = v_e;
    v_doos_e := public.winkel_dozen_voor_regel(v_org, v_rid, array['TEST Bierpakket'])->0->>'code';
    select id into v_rid from public.winkel_order_regels where order_id = v_f;
    v_doos_f := public.winkel_dozen_voor_regel(v_org, v_rid, array['TEST Bierpakket'])->0->>'code';
    select id into v_rid from public.winkel_order_regels where order_id = v_g;
    v_doos_g := public.winkel_dozen_voor_regel(v_org, v_rid, array['TEST Krap pakket'])->0->>'code';

    -- ── 1. Order A: eerst rest_nodig, met een herhaling die hetzelfde zegt.
    v_r := public.toonbank_ophaal_vraag(v_org, v_app, 'order', v_a, null, v_g1, now(), v_mw);
    if v_r->>'journaal' <> 'nieuw' or v_r->'resultaat'->>'uitkomst' <> 'rest_nodig' or (v_r->'resultaat'->>'rest_cents')::int <> 1130 then
        v_fouten := v_fouten || 'A zonder rest: ' || v_r::text || '; ';
    end if;
    if not exists (select 1 from public.toonbank_journaal where organization_id = v_org and gebeurtenis_id = v_g1 and soort = 'ophalen'
                     and volgnummer is null and verwerk_status = 'niet_nodig' and (payload->>'order_id')::bigint = v_a) then
        v_fouten := v_fouten || 'journaal ophalen A klopt niet; ';
    end if;
    v_r2 := public.toonbank_ophaal_vraag(v_org, v_app, 'order', v_a, null, v_g1, now(), v_mw, v_b1, 'pin', 1130, 'vastgesteld');
    if v_r2->>'journaal' <> 'bestond' or v_r2->'resultaat' <> v_r->'resultaat' then
        v_fouten := v_fouten || 'herhaling A: ' || v_r2::text || '; ';
    end if;
    -- Een ander bedrag dan de open rest (review M7): rest_nodig met het juiste bedrag, niets geboekt.
    v_r := public.toonbank_ophaal_vraag(v_org, v_app, 'order', v_a, null, gen_random_uuid(), now(), v_mw, v_b1, 'pin', 1000, 'vastgesteld');
    if v_r->'resultaat'->>'uitkomst' <> 'rest_nodig' or (v_r->'resultaat'->>'rest_cents')::int <> 1130
       or (select rest_betaald_at from public.winkel_orders where id = v_a) is not null then
        v_fouten := v_fouten || 'A ander bedrag: ' || v_r::text || '; ';
    end if;
    -- De rest klopt, de leeftijd ontbreekt: leeftijd_nodig, nog steeds niets geboekt.
    v_r := public.toonbank_ophaal_vraag(v_org, v_app, 'order', v_a, null, gen_random_uuid(), now(), v_mw, v_b1, 'pin', 1130, null);
    if v_r->'resultaat'->>'uitkomst' <> 'leeftijd_nodig' or (select rest_betaald_at from public.winkel_orders where id = v_a) is not null then
        v_fouten := v_fouten || 'A zonder leeftijd: ' || v_r::text || '; ';
    end if;
    -- Alles klopt: opgehaald, rest geboekt met de bon, regels via de toonbank met de medewerker.
    v_r := public.toonbank_ophaal_vraag(v_org, v_app, 'order', v_a, null, gen_random_uuid(), now(), v_mw, v_b1, 'pin', 1130, 'vastgesteld', '1.1.0');
    if v_r->'resultaat'->>'uitkomst' <> 'opgehaald' or v_r->'resultaat'->>'rest_geboekt' <> 'pin' or (v_r->'resultaat'->>'rest_dubbel')::boolean
       or not exists (select 1 from public.winkel_orders where id = v_a and rest_betaald_at is not null and rest_betaalmethode = 'pin' and rest_bon_id = v_b1)
       or not exists (select 1 from public.winkel_order_regels where order_id = v_a and opgehaald_bron = 'toonbank' and opgehaald_medewerker_id = v_mw and leeftijd_vastgesteld_at is not null) then
        v_fouten := v_fouten || 'A opgehaald: ' || v_r::text || '; ';
    end if;
    -- De bon met de rest komt daarna: geen conflict, en geen omzet (de omzet hoort bij de order).
    v_vnr := v_vnr + 1;
    perform public.toonbank_journaal_opslaan(v_org, v_app, jsonb_build_array(pg_temp.tb_restbon(v_b1, v_vnr, v_code || '-000001', v_a, 'A', 1130)));
    perform public.toonbank_verwerk_wachtrij(v_org, v_app);
    if (select verwerk_status from public.toonbank_journaal where organization_id = v_org and gebeurtenis_id = v_b1) <> 'verwerkt'
       or (select omzet_incl_cents from public.toonbank_bonnen where id = v_b1) <> 0
       or (select btw from public.toonbank_bonnen where id = v_b1) <> '{}'::jsonb
       or (select order_rest_cents from public.toonbank_bonnen where id = v_b1) <> 1130 then
        v_fouten := v_fouten || 'restbon A: ' || coalesce((select row_to_json(j)::text from public.toonbank_journaal j where gebeurtenis_id = v_b1), 'ontbreekt') || '; ';
    end if;

    -- ── 2. Dubbel betaald: order C. Bon B2 eerst (rest nog open: goed), dan boekt BA de rest,
    --       dan vraagt de Toonbank ophalen met rest op B2 → geen rest, B2 te controleren.
    v_vnr := v_vnr + 1;
    perform public.toonbank_journaal_opslaan(v_org, v_app, jsonb_build_array(pg_temp.tb_restbon(v_b2, v_vnr, v_code || '-000002', v_c, 'C', 1130)));
    perform public.toonbank_verwerk_wachtrij(v_org, v_app);
    if (select verwerk_status from public.toonbank_journaal where organization_id = v_org and gebeurtenis_id = v_b2) <> 'verwerkt' then
        v_fouten := v_fouten || 'restbon C vooraf niet verwerkt; ';
    end if;
    if public.winkel_boek_rest(v_org, v_c, 'contant') <> 'geboekt' then v_fouten := v_fouten || 'boek_rest C; '; end if;
    v_r := public.toonbank_ophaal_vraag(v_org, v_app, 'order', v_c, null, gen_random_uuid(), now(), v_mw, v_b2, 'pin', 1130, 'vastgesteld');
    if v_r->'resultaat'->>'uitkomst' <> 'opgehaald' or v_r->'resultaat'->>'rest_geboekt' is not null or not (v_r->'resultaat'->>'rest_dubbel')::boolean
       or (select rest_betaalmethode from public.winkel_orders where id = v_c) <> 'contant' then
        v_fouten := v_fouten || 'C dubbel: ' || v_r::text || '; ';
    end if;
    if (select verwerk_status || '/' || fout_code from public.toonbank_journaal where organization_id = v_org and gebeurtenis_id = v_b2) <> 'conflict/rest_dubbel' then
        v_fouten := v_fouten || 'restbon C niet te controleren na dubbel betalen; ';
    end if;
    -- Order D: rest in BA, de bon komt pas daarna → die bon ziet het zelf.
    if public.winkel_boek_rest(v_org, v_d, 'pin') <> 'geboekt' then v_fouten := v_fouten || 'boek_rest D; '; end if;
    v_vnr := v_vnr + 1;
    perform public.toonbank_journaal_opslaan(v_org, v_app, jsonb_build_array(pg_temp.tb_restbon(v_b3, v_vnr, v_code || '-000003', v_d, 'D', 1130)));
    perform public.toonbank_verwerk_wachtrij(v_org, v_app);
    if (select verwerk_status || '/' || fout_code from public.toonbank_journaal where organization_id = v_org and gebeurtenis_id = v_b3) <> 'conflict/rest_dubbel' then
        v_fouten := v_fouten || 'late restbon D niet te controleren; ';
    end if;

    -- ── 3. winkel_boek_rest met p_org: een andere organisatie ziet de order niet.
    if public.winkel_boek_rest(gen_random_uuid(), v_f, 'pin') <> 'onbekend'
       or (select rest_betaald_at from public.winkel_orders where id = v_f) is not null then
        v_fouten := v_fouten || 'boek_rest buiten de organisatie; ';
    end if;
    if public.winkel_boek_rest(v_org, v_c, 'pin') <> 'al_geboekt' then v_fouten := v_fouten || 'boek_rest twee keer; '; end if;

    -- ── 4. Doos E (alcohol): zonder leeftijd → leeftijd_nodig en er verandert niets.
    select count(*) into v_n from public.winkel_voorraad_mutaties where order_id = v_e;
    v_r := public.toonbank_ophaal_vraag(v_org, v_app, 'doos', null, v_doos_e, gen_random_uuid(), now(), v_mw);
    if v_r->>'soort' <> 'doos_ophalen' or v_r->'resultaat'->>'uitkomst' <> 'leeftijd_nodig' or (v_r->'resultaat'->>'order_id')::bigint <> v_e
       or (select opgehaald_at from public.winkel_dozen where code = v_doos_e) is not null
       or (select count(*) from public.winkel_voorraad_mutaties where order_id = v_e) <> v_n then
        v_fouten := v_fouten || 'doos E zonder leeftijd: ' || v_r::text || '; ';
    end if;
    -- Rechtstreeks (BA, scanDoos) net zo.
    if public.winkel_doos_ophalen(v_org, v_doos_e)->>'uitkomst' <> 'leeftijd_nodig' then v_fouten := v_fouten || 'scanDoos zonder leeftijd; '; end if;
    -- Geweigerd: alleen vastgelegd.
    v_r := public.toonbank_ophaal_vraag(v_org, v_app, 'doos', null, v_doos_e, gen_random_uuid(), now(), v_mw, null, null, null, 'geweigerd');
    if v_r->'resultaat'->>'uitkomst' <> 'geweigerd' or (select leeftijd_geweigerd_at from public.winkel_orders where id = v_e) is null
       or (select opgehaald_at from public.winkel_dozen where code = v_doos_e) is not null then
        v_fouten := v_fouten || 'doos E geweigerd: ' || v_r::text || '; ';
    end if;
    -- Vastgesteld: opgehaald, ingepakt (afgeboekt), met de medewerker.
    v_r := public.toonbank_ophaal_vraag(v_org, v_app, 'doos', null, upper(v_doos_e), gen_random_uuid(), now(), v_mw, null, null, null, 'vastgesteld');
    if v_r->'resultaat'->>'uitkomst' <> 'opgehaald' or (v_r->'resultaat'->>'nog_open')::int <> 0
       or not exists (select 1 from public.winkel_dozen where code = v_doos_e and opgehaald_at is not null and opgehaald_medewerker_id = v_mw)
       or not exists (select 1 from public.winkel_order_regels where order_id = v_e and opgehaald_at is not null and opgehaald_bron = 'toonbank' and leeftijd_vastgesteld_at is not null)
       or not exists (select 1 from public.winkel_voorraad_mutaties where order_id = v_e and type = 'verkoop_online' and hoeveelheid = -4) then
        v_fouten := v_fouten || 'doos E opgehaald: ' || v_r::text || '; ';
    end if;
    v_r := public.toonbank_ophaal_vraag(v_org, v_app, 'doos', null, v_doos_e, gen_random_uuid(), now(), v_mw, null, null, null, 'vastgesteld');
    if v_r->'resultaat'->>'uitkomst' <> 'al_opgehaald' then v_fouten := v_fouten || 'doos E twee keer: ' || v_r::text || '; '; end if;
    v_r := public.toonbank_ophaal_vraag(v_org, v_app, 'doos', null, repeat('0', 64), gen_random_uuid(), now(), v_mw);
    if v_r->'resultaat'->>'uitkomst' <> 'onbekend' then v_fouten := v_fouten || 'onbekende doos: ' || v_r::text || '; '; end if;

    -- ── 5. Doos F met rest: verkeerd bedrag → rest_nodig; goed → opgehaald met de bon op order en doos.
    v_r := public.toonbank_ophaal_vraag(v_org, v_app, 'doos', null, v_doos_f, gen_random_uuid(), now(), v_mw, v_bf, 'contant', 1100, 'vastgesteld');
    if v_r->'resultaat'->>'uitkomst' <> 'rest_nodig' or (v_r->'resultaat'->>'rest_cents')::int <> 1130 then
        v_fouten := v_fouten || 'doos F ander bedrag: ' || v_r::text || '; ';
    end if;
    v_r := public.toonbank_ophaal_vraag(v_org, v_app, 'doos', null, v_doos_f, gen_random_uuid(), now(), v_mw, v_bf, 'contant', 1130, 'vastgesteld');
    if v_r->'resultaat'->>'uitkomst' <> 'opgehaald' or v_r->'resultaat'->>'rest_geboekt' <> 'contant'
       or not exists (select 1 from public.winkel_orders where id = v_f and rest_bon_id = v_bf and rest_betaalmethode = 'contant')
       or not exists (select 1 from public.winkel_dozen where code = v_doos_f and opgehaald_bon_id = v_bf) then
        v_fouten := v_fouten || 'doos F met rest: ' || v_r::text || '; ';
    end if;

    -- ── 6. Doos G: te weinig voorraad → niets geboekt, niet opgehaald.
    perform public.winkel_muteer_voorraad(v_org, v_krap, 'telling', 1);
    select count(*) into v_n from public.winkel_voorraad_mutaties where winkel_product_id = v_krap;
    v_r := public.toonbank_ophaal_vraag(v_org, v_app, 'doos', null, v_doos_g, gen_random_uuid(), now(), v_mw, null, null, null, 'vastgesteld');
    select count(*) into v_n2 from public.winkel_voorraad_mutaties where winkel_product_id = v_krap;
    if v_r->'resultaat'->>'uitkomst' <> 'te_weinig_voorraad' or v_n2 <> v_n
       or (select opgehaald_at from public.winkel_dozen where code = v_doos_g) is not null
       or (select klaargezet_at from public.winkel_order_regels where order_id = v_g) is not null then
        v_fouten := v_fouten || 'doos G te weinig: ' || v_r::text || '; ';
    end if;

    -- ── 7. Ongeldig en rechten.
    begin
        perform public.toonbank_ophaal_vraag(v_org, v_app, 'order', v_a, null, gen_random_uuid(), now(), v_mw, null, 'pin', 1130, null);
        v_fouten := v_fouten || 'rest zonder bon toegestaan; ';
    exception when invalid_parameter_value then null;
    end;
    begin
        perform public.toonbank_ophaal_vraag(v_org, v_app, 'pakket', v_a, null, gen_random_uuid(), now(), v_mw);
        v_fouten := v_fouten || 'soort pakket toegestaan; ';
    exception when invalid_parameter_value then null;
    end;
    if has_function_privilege('anon', 'public.winkel_doos_ophalen(uuid, text, text, text, uuid, uuid)', 'EXECUTE')
       or has_function_privilege('anon', 'public.winkel_boek_rest(uuid, bigint, text, uuid)', 'EXECUTE')
       or has_function_privilege('authenticated', 'public.toonbank_ophaal_vraag(uuid, uuid, text, bigint, text, uuid, timestamp with time zone, uuid, uuid, text, integer, text, text)', 'EXECUTE')
       or not has_function_privilege('service_role', 'public.toonbank_ophaal_vraag(uuid, uuid, text, bigint, text, uuid, timestamp with time zone, uuid, uuid, text, integer, text, text)', 'EXECUTE')
       or to_regprocedure('public.winkel_doos_ophalen(uuid, text, text)') is not null
       or to_regprocedure('public.winkel_boek_rest(bigint, text)') is not null then
        v_fouten := v_fouten || 'rechten of oude handtekeningen kloppen niet; ';
    end if;

    if v_fouten <> '' then raise exception 'FOUT: %', v_fouten; end if;
    raise exception 'GESLAAGD: order ophalen rest_nodig (ook bij een ander bedrag, niets geboekt), leeftijd_nodig, opgehaald met rest_bon_id en medewerker, herhaling = zelfde antwoord; restbon zonder omzet en zonder conflict; dubbel betaald → geen rest en de bon te controleren (ook als de bon later komt); boek_rest alleen in de eigen organisatie; doos met alcohol zonder leeftijd → leeftijd_nodig, geweigerd vastgelegd, opgehaald met medewerker, al_opgehaald, onbekend; doos met rest op de bon; te weinig voorraad = niets geboekt — alles teruggedraaid';
end $$;
