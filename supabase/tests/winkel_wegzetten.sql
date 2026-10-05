-- Test voor BA-6: wegzet-taken (migratie 20261005140000_winkel_wegzetten).
-- Draait in een transactie die aan het eind wordt teruggedraaid: er blijft
-- niets achter, ook niet de tijdelijke testgebruiker.
--
-- ALLEEN op de dev-database, nooit op live en nooit met --linked:
--
--   npx supabase db query --db-url "$DEV_DB_URL" -o table -f supabase/tests/winkel_wegzetten.sql
--
-- Vereist de seed supabase/tests/seed_vier_naober.sql (organisatie
-- e2e-hop-en-bites); zonder die organisatie weigert de test te draaien.
--
-- Verwacht: "GESLAAGD: ..." als EXCEPTION (zie partij_afronden.sql). Elke
-- andere melding is een echte fout.
--
-- Het scenario (plan v5, de 4 Naober):
--   1. 6 liggen er, een betaalde order van 4: gereserveerd 4 en één
--      wegzet-taak (4 × Naober, ophalen over 3 dagen, niet rood). Een
--      pakketregel (inpakken) en een onbetaalde order geven geen taak.
--   2. Apart zetten: precies één verkoop_online −4, voorraad 2, gereserveerd 0,
--      de pakketregel blijft liggen, de taak is weg. Nog een keer: al_apart.
--   3. Niet betaald: WV006. Onbekende bron of medewerker: geweigerd.
--   4. Ongedaan (zelfde dag): retour +4, voorraad 6, gereserveerd 4, de taak
--      is terug. Nog een keer: niet_apart.
--   5. De toonbank verkocht er 3: 3 op het schap, 4 nodig → WV010 met de
--      details in DETAIL, en er is niets geboekt.
--   6. Opgehaald: terugdraaien geeft WV011, niets geboekt.
--   7. Apart gezet op een eerdere dag: niet_zelfde_dag, niets geboekt. Ophalen
--      vandaag zonder moment = rood. Via de toonbank met een medewerker: de
--      notitie in het logboek zegt het.
--   8. Rechten: anon niets, authenticated en service_role wel, de view is
--      security_invoker. In het echt: een lid ziet de taak en mag apart
--      zetten (door_user_id = het lid); een niet-lid ziet niets en krijgt 42501.

do $$
declare
    v_org       uuid;
    v_user      uuid := gen_random_uuid();
    v_naober    uuid;
    v_worst     uuid;
    v_art       uuid;
    v_pakket    uuid;
    v_moment    uuid;
    v_mw        uuid;
    v_los       jsonb;
    v_pak       jsonb;
    v_een       jsonb;
    v_o         public.winkel_orders%rowtype;
    v_a         bigint;
    v_b         bigint;
    v_d         bigint;
    v_r         jsonb;
    v_n         numeric;
    v_tel       bigint;
    v_mut       bigint;
    v_taak      record;
    v_detail    text;
    v_melding   text;
    v_dj        jsonb;
    v_sig       text;
    v_gebruiker_ok boolean := false;
    v_fouten    text := '';
begin
    -- ── Dev-only-guard: de e2e-organisatie bestaat alleen op de dev-database.
    select id into v_org from public.organizations where slug = 'e2e-hop-en-bites';
    if v_org is null then
        raise exception 'GEWEIGERD: organisatie e2e-hop-en-bites bestaat niet. Deze test draait alleen op de dev-database, na supabase/tests/seed_vier_naober.sql.';
    end if;
    if to_regprocedure('public.winkel_zet_order_apart(uuid, bigint, text, uuid, uuid)') is null then
        raise exception 'GEWEIGERD: migratie 20261005140000_winkel_wegzetten staat nog niet op deze database.';
    end if;

    -- ── Opzet: Naober (6 op het schap), worst, een los artikel en een pakket.
    insert into public.winkel_producten (organization_id, naam, type, eenheid, prijs_per, inkoop_excl_cents)
    values (v_org, 'TEST Naober', 'bier', 'stuk', 1, 150) returning id into v_naober;
    insert into public.winkel_producten (organization_id, naam, type, eenheid, prijs_per, inkoop_excl_cents)
    values (v_org, 'TEST worst', 'worst', 'stuk', 1, 246) returning id into v_worst;
    perform public.winkel_muteer_voorraad(v_org, v_naober, 'telling', 6);
    perform public.winkel_muteer_voorraad(v_org, v_worst,  'telling', 10);

    insert into public.winkel_artikelen (organization_id, slug, naam, actief, afhandeling)
    values (v_org, 'test-naober-' || substr(gen_random_uuid()::text, 1, 8), 'TEST Naober', true, 'wegzetten')
    returning id into v_art;
    insert into public.winkel_artikelen (organization_id, slug, naam, actief)
    values (v_org, 'test-pakket-' || substr(gen_random_uuid()::text, 1, 8), 'TEST pakket', true)
    returning id into v_pakket;

    if (select afhandeling from public.winkel_artikelen where id = v_pakket) is distinct from 'inpakken' then
        v_fouten := v_fouten || 'afhandeling is standaard niet inpakken; ';
    end if;
    begin
        update public.winkel_artikelen set afhandeling = 'iets' where id = v_pakket;
        v_fouten := v_fouten || 'afhandeling iets niet geweigerd; ';
    exception when check_violation then null;
    end;

    insert into public.winkel_momenten (organization_id, groep, datum, van, tot, capaciteit, actief)
    values (v_org, 'test-wegzet', (now() at time zone 'Europe/Amsterdam')::date + 3, '14:00', '17:00', null, true)
    returning id into v_moment;

    insert into public.personeel (organization_id, naam) values (v_org, 'TEST Sanne') returning id into v_mw;

    v_los := jsonb_build_object(
        'artikel_id', v_art, 'slug', 'test-naober', 'naam', 'TEST Naober', 'aantal', 4, 'eenheid', 'per stuk',
        'stuk_cents', 345, 'bedrag_cents', 1380, 'btw_pct', 21, 'eenheden', 1, 'voorraad_eenheden', 0, 'alcohol', true,
        'componenten', jsonb_build_array(
            jsonb_build_object('product_id', v_naober, 'slot_type', 'bier', 'naam', 'Naober', 'hoeveelheid', 4, 'eenheid', 'stuk')));
    v_pak := jsonb_build_object(
        'artikel_id', v_pakket, 'slug', 'test-pakket', 'naam', 'TEST pakket', 'aantal', 1, 'eenheid', 'per stuk',
        'stuk_cents', 1000, 'bedrag_cents', 1000, 'btw_pct', 9, 'eenheden', 1, 'voorraad_eenheden', 0,
        'componenten', jsonb_build_array(
            jsonb_build_object('product_id', v_worst, 'slot_type', 'worst', 'naam', 'Worst', 'hoeveelheid', 1, 'eenheid', 'stuk')));
    v_een := jsonb_set(jsonb_set(v_los, '{aantal}', '1'), '{componenten,0,hoeveelheid}', '1');

    -- Order A: Jansen, 4 × Naober en een pakket, ophalen over 3 dagen om 14:00. Betaald.
    v_o := public.winkel_plaats_order(v_org, 'test-sleutel-' || gen_random_uuid(), 'test-token-' || gen_random_uuid(), 'afhalen', v_moment,
        'Jansen', 'test@example.invalid', null, null, null, 2380, 0, 2380, '{}'::jsonb, 'https://example.invalid', jsonb_build_array(v_los, v_pak));
    update public.winkel_orders set status = 'betaald', betaald_at = now() where id = v_o.id;
    v_a := v_o.id;

    -- Order B: 1 × Naober, betaling afgebroken.
    v_o := public.winkel_plaats_order(v_org, 'test-sleutel-' || gen_random_uuid(), 'test-token-' || gen_random_uuid(), 'afhalen', null,
        'Pietersen', 'test@example.invalid', null, null, null, 345, 0, 345, '{}'::jsonb, 'https://example.invalid', jsonb_build_array(v_een));
    update public.winkel_orders set status = 'afgebroken' where id = v_o.id;
    v_b := v_o.id;

    -- ── 1. Gereserveerd 4, één taak.
    v_n := public.winkel_bezetting_product(v_naober);
    if v_n <> 4 then v_fouten := v_fouten || 'gereserveerd ' || v_n || ' i.p.v. 4; '; end if;

    select count(*) into v_tel from public.winkel_wegzet_taken where order_id = v_b;
    if v_tel <> 0 then v_fouten := v_fouten || 'onbetaalde order geeft een taak; '; end if;

    select * into v_taak from public.winkel_wegzet_taken where order_id = v_a;
    if not found then
        v_fouten := v_fouten || 'geen wegzet-taak voor de betaalde order; ';
    else
        if v_taak.id <> v_a or v_taak.organization_id <> v_org or v_taak.naam <> 'Jansen' then
            v_fouten := v_fouten || 'taak: id, organisatie of naam klopt niet; ';
        end if;
        if jsonb_array_length(v_taak.regels) <> 1 then
            v_fouten := v_fouten || 'taak heeft ' || jsonb_array_length(v_taak.regels) || ' regels i.p.v. 1 (de pakketregel hoort er niet in); ';
        elsif (v_taak.regels->0->>'aantal')::int <> 4
           or v_taak.regels->0->>'artikel' <> 'TEST Naober'
           or v_taak.regels->0->'producten'->0->>'naam' <> 'TEST Naober'
           or (v_taak.regels->0->'producten'->0->>'hoeveelheid')::numeric <> 4
           or (v_taak.regels->0->'producten'->0->>'product_id')::uuid <> v_naober then
            v_fouten := v_fouten || 'taakregel klopt niet: ' || v_taak.regels::text || '; ';
        end if;
        if v_taak.afhaalmoment <> ((((now() at time zone 'Europe/Amsterdam')::date + 3) + time '14:00') at time zone 'Europe/Amsterdam') then
            v_fouten := v_fouten || 'afhaalmoment ' || v_taak.afhaalmoment || ' i.p.v. over 3 dagen 14:00; ';
        end if;
        if v_taak.ophalen_binnen_24u then v_fouten := v_fouten || 'over 3 dagen telt als binnen 24 uur; '; end if;
    end if;

    -- ── 8a. In het echt, als lid en als niet-lid (teruggedraaid).
    begin
        insert into auth.users (id, aud, role, email)
        values (v_user, 'authenticated', 'authenticated', 'wegzetten-' || v_user || '@example.invalid');
        insert into public.organization_members (organization_id, user_id, role, status)
        values (v_org, v_user, 'Medewerker', 'active');
        v_gebruiker_ok := true;
    exception when others then
        v_fouten := v_fouten || 'tijdelijke testgebruiker niet aan te maken (' || sqlerrm || '); ';
    end;

    if v_gebruiker_ok then
        begin
            perform set_config('request.jwt.claims', json_build_object('sub', v_user, 'role', 'authenticated')::text, true);
            perform set_config('role', 'authenticated', true);

            select count(*) into v_tel from public.winkel_wegzet_taken where order_id = v_a;
            if v_tel <> 1 then v_fouten := v_fouten || 'lid ziet ' || v_tel || ' taken i.p.v. 1; '; end if;

            v_r := public.winkel_zet_order_apart(v_org, v_a);
            if v_r->>'uitkomst' <> 'apart' then v_fouten := v_fouten || 'lid: uitkomst ' || (v_r->>'uitkomst') || '; '; end if;
            if not exists (select 1 from public.winkel_voorraad_mutaties
                            where order_id = v_a and type = 'verkoop_online' and door_user_id = v_user) then
                v_fouten := v_fouten || 'lid: door_user_id niet het lid; ';
            end if;

            -- Een niet-lid: ziet niets en mag niets.
            perform set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid(), 'role', 'authenticated')::text, true);
            select count(*) into v_tel from public.winkel_wegzet_taken;
            if v_tel <> 0 then v_fouten := v_fouten || 'niet-lid ziet ' || v_tel || ' taken; '; end if;
            begin
                perform public.winkel_zet_order_apart_terug(v_org, v_a);
                v_fouten := v_fouten || 'niet-lid mocht terugdraaien; ';
            exception when insufficient_privilege then null;
            end;

            -- anon: geweigerd vóór de functie draait.
            perform set_config('request.jwt.claims', '{"role":"anon"}', true);
            perform set_config('role', 'anon', true);
            begin
                perform public.winkel_zet_order_apart(v_org, v_a);
                v_fouten := v_fouten || 'anon mocht apart zetten; ';
            exception when insufficient_privilege then
                if sqlerrm not like 'permission denied for function%' then
                    v_fouten := v_fouten || 'anon: verkeerde weigering (' || sqlerrm || '); ';
                end if;
            end;

            raise exception 'terug_naar_postgres';
        exception when others then
            if sqlerrm <> 'terug_naar_postgres' then
                v_fouten := v_fouten || 'als lid/niet-lid/anon: ' || sqlerrm || '; ';
            end if;
        end;
    end if;
    perform set_config('request.jwt.claims', '', true);

    -- Na het terugdraaien staat alles weer zoals in stap 1.
    select voorraad into v_n from public.winkel_producten where id = v_naober;
    if v_n <> 6 then v_fouten := v_fouten || 'na terugdraaien van de lid-test ligt er ' || v_n || '; '; end if;

    -- ── 2. Apart zetten.
    select count(*) into v_mut from public.winkel_voorraad_mutaties where winkel_product_id = v_naober;
    v_r := public.winkel_zet_order_apart(v_org, v_a);
    if v_r->>'uitkomst' <> 'apart' then v_fouten := v_fouten || 'uitkomst ' || coalesce(v_r->>'uitkomst', 'leeg') || ' i.p.v. apart; '; end if;
    if jsonb_array_length(v_r->'boekingen') <> 1
       or (v_r->'boekingen'->0->>'hoeveelheid')::numeric <> -4
       or (v_r->'boekingen'->0->>'voorraad')::numeric <> 2
       or v_r->'boekingen'->0->>'type' <> 'verkoop_online'
       or (v_r->'boekingen'->0->>'product_id')::uuid <> v_naober then
        v_fouten := v_fouten || 'boekingen ' || (v_r->'boekingen')::text || '; ';
    end if;
    select voorraad into v_n from public.winkel_producten where id = v_naober;
    if v_n <> 2 then v_fouten := v_fouten || 'na apart ligt er ' || v_n || ' i.p.v. 2; '; end if;
    v_n := public.winkel_bezetting_product(v_naober);
    if v_n <> 0 then v_fouten := v_fouten || 'na apart gereserveerd ' || v_n || ' i.p.v. 0; '; end if;
    select count(*) - v_mut into v_tel from public.winkel_voorraad_mutaties where winkel_product_id = v_naober;
    if v_tel <> 1 then v_fouten := v_fouten || v_tel || ' mutaties i.p.v. precies één; '; end if;
    if not exists (select 1 from public.winkel_voorraad_mutaties
                    where order_id = v_a and winkel_product_id = v_naober and type = 'verkoop_online' and hoeveelheid = -4
                      and notitie = 'Apart gezet in BBQ Architect') then
        v_fouten := v_fouten || 'geen verkoop_online −4 met notitie "Apart gezet in BBQ Architect"; ';
    end if;
    -- De pakketregel is iets voor de makerij: die blijft liggen.
    select voorraad into v_n from public.winkel_producten where id = v_worst;
    if v_n <> 10 then v_fouten := v_fouten || 'worst ' || v_n || ' i.p.v. 10: de pakketregel is mee ingepakt; '; end if;
    if exists (select 1 from public.winkel_order_regels where order_id = v_a and artikel_id = v_pakket and klaargezet_at is not null) then
        v_fouten := v_fouten || 'pakketregel klaargezet; ';
    end if;
    if exists (select 1 from public.winkel_wegzet_taken where order_id = v_a) then
        v_fouten := v_fouten || 'taak staat er na apart nog; ';
    end if;

    -- Nog een keer: al_apart, niets extra.
    select count(*) into v_mut from public.winkel_voorraad_mutaties where winkel_product_id = v_naober;
    v_r := public.winkel_zet_order_apart(v_org, v_a);
    if v_r->>'uitkomst' <> 'al_apart' then v_fouten := v_fouten || 'tweede keer: ' || coalesce(v_r->>'uitkomst', 'leeg') || ' i.p.v. al_apart; '; end if;
    select count(*) - v_mut into v_tel from public.winkel_voorraad_mutaties where winkel_product_id = v_naober;
    if v_tel <> 0 then v_fouten := v_fouten || 'tweede keer boekte ' || v_tel || ' mutaties; '; end if;

    -- ── 3. Weigeringen zonder boeking.
    begin
        perform public.winkel_zet_order_apart(v_org, v_b);
        v_fouten := v_fouten || 'onbetaalde order niet geweigerd; ';
    exception when sqlstate 'WV006' then
        if sqlerrm not like 'WV006%' then v_fouten := v_fouten || 'WV006-melding begint niet met de code: ' || sqlerrm || '; '; end if;
    end;
    begin
        perform public.winkel_zet_order_apart(v_org, v_a, 'kassa');
        v_fouten := v_fouten || 'bron kassa niet geweigerd; ';
    exception when sqlstate '22023' then null;
    end;
    begin
        perform public.winkel_zet_order_apart(v_org, v_a, 'toonbank', null, gen_random_uuid());
        v_fouten := v_fouten || 'onbekende medewerker niet geweigerd; ';
    exception when sqlstate 'P0002' then null;
    end;
    begin
        perform public.winkel_zet_order_apart(v_org, -1);
        v_fouten := v_fouten || 'onbekende order niet geweigerd; ';
    exception when sqlstate 'P0002' then null;
    end;
    v_r := public.winkel_zet_order_apart_terug(v_org, v_b);
    if v_r->>'uitkomst' <> 'niet_apart' then v_fouten := v_fouten || 'terug van een order die nooit apart stond: ' || coalesce(v_r->>'uitkomst', 'leeg') || '; '; end if;

    -- ── 4. Ongedaan, zelfde dag.
    v_r := public.winkel_zet_order_apart_terug(v_org, v_a);
    if v_r->>'uitkomst' <> 'ongedaan' then v_fouten := v_fouten || 'terug: ' || coalesce(v_r->>'uitkomst', 'leeg') || ' i.p.v. ongedaan; '; end if;
    if jsonb_array_length(v_r->'boekingen') <> 1 or (v_r->'boekingen'->0->>'hoeveelheid')::numeric <> 4 or v_r->'boekingen'->0->>'type' <> 'retour' then
        v_fouten := v_fouten || 'terug-boekingen ' || (v_r->'boekingen')::text || '; ';
    end if;
    select voorraad into v_n from public.winkel_producten where id = v_naober;
    if v_n <> 6 then v_fouten := v_fouten || 'na ongedaan ligt er ' || v_n || ' i.p.v. 6; '; end if;
    v_n := public.winkel_bezetting_product(v_naober);
    if v_n <> 4 then v_fouten := v_fouten || 'na ongedaan gereserveerd ' || v_n || ' i.p.v. 4; '; end if;
    if not exists (select 1 from public.winkel_wegzet_taken where order_id = v_a) then
        v_fouten := v_fouten || 'taak is na ongedaan niet terug; ';
    end if;
    if not exists (select 1 from public.winkel_voorraad_mutaties
                    where order_id = v_a and type = 'retour' and hoeveelheid = 4 and notitie = 'Apart zetten ongedaan in BBQ Architect') then
        v_fouten := v_fouten || 'geen retour +4 met notitie; ';
    end if;
    select count(*) into v_mut from public.winkel_voorraad_mutaties where winkel_product_id = v_naober;
    v_r := public.winkel_zet_order_apart_terug(v_org, v_a);
    if v_r->>'uitkomst' <> 'niet_apart' then v_fouten := v_fouten || 'tweede keer terug: ' || coalesce(v_r->>'uitkomst', 'leeg') || ' i.p.v. niet_apart; '; end if;
    select count(*) - v_mut into v_tel from public.winkel_voorraad_mutaties where winkel_product_id = v_naober;
    if v_tel <> 0 then v_fouten := v_fouten || 'tweede keer terug boekte ' || v_tel || ' mutaties; '; end if;

    -- ── 5. De toonbank verkocht er 3: 3 op het schap, 4 nodig → WV010.
    perform public.winkel_muteer_voorraad(v_org, v_naober, 'verkoop_kassa', -3);
    select count(*) into v_mut from public.winkel_voorraad_mutaties where winkel_product_id = v_naober;
    begin
        perform public.winkel_zet_order_apart(v_org, v_a);
        v_fouten := v_fouten || '3 op het schap en 4 nodig niet geweigerd; ';
    exception when sqlstate 'WV010' then
        get stacked diagnostics v_melding = message_text, v_detail = pg_exception_detail;
        if v_melding not like 'WV010%' then
            v_fouten := v_fouten || 'verkeerde melding bij te weinig voorraad: ' || v_melding || '; ';
        else
            v_dj := v_detail::jsonb;
            if v_dj->>'wv_code' <> 'WV010'
               or (v_dj->>'order_id')::bigint <> v_a
               or jsonb_array_length(v_dj->'tekorten') <> 1
               or (v_dj->'tekorten'->0->>'product_id')::uuid <> v_naober
               or v_dj->'tekorten'->0->>'naam' <> 'TEST Naober'
               or (v_dj->'tekorten'->0->>'ligt_er')::numeric <> 3
               or (v_dj->'tekorten'->0->>'nodig')::numeric <> 4 then
                v_fouten := v_fouten || 'WV010-details kloppen niet: ' || v_detail || '; ';
            end if;
        end if;
    end;
    select voorraad into v_n from public.winkel_producten where id = v_naober;
    if v_n <> 3 then v_fouten := v_fouten || 'na WV010 ligt er ' || v_n || ' i.p.v. 3; '; end if;
    select count(*) - v_mut into v_tel from public.winkel_voorraad_mutaties where winkel_product_id = v_naober;
    if v_tel <> 0 then v_fouten := v_fouten || 'WV010 boekte toch ' || v_tel || ' mutaties; '; end if;
    if exists (select 1 from public.winkel_order_regels where order_id = v_a and klaargezet_at is not null) then
        v_fouten := v_fouten || 'WV010 zette toch een regel klaar; ';
    end if;

    -- ── 6. Geteld (6), apart, opgehaald → terug geeft WV011.
    perform public.winkel_muteer_voorraad(v_org, v_naober, 'telling', 6);
    v_r := public.winkel_zet_order_apart(v_org, v_a);
    if v_r->>'uitkomst' <> 'apart' then v_fouten := v_fouten || 'na tellen niet apart: ' || coalesce(v_r->>'uitkomst', 'leeg') || '; '; end if;
    update public.winkel_order_regels set opgehaald_at = now() where order_id = v_a;
    select count(*) into v_mut from public.winkel_voorraad_mutaties where winkel_product_id = v_naober;
    begin
        perform public.winkel_zet_order_apart_terug(v_org, v_a);
        v_fouten := v_fouten || 'terug na ophalen niet geweigerd; ';
    exception when sqlstate 'WV011' then
        get stacked diagnostics v_melding = message_text, v_detail = pg_exception_detail;
        if v_melding not like 'WV011%' then
            v_fouten := v_fouten || 'verkeerde melding na ophalen: ' || v_melding || '; ';
        elsif (v_detail::jsonb)->>'wv_code' <> 'WV011' then
            v_fouten := v_fouten || 'WV011-details kloppen niet: ' || v_detail || '; ';
        end if;
    end;
    select voorraad into v_n from public.winkel_producten where id = v_naober;
    if v_n <> 2 then v_fouten := v_fouten || 'na WV011 ligt er ' || v_n || ' i.p.v. 2; '; end if;
    select count(*) - v_mut into v_tel from public.winkel_voorraad_mutaties where winkel_product_id = v_naober;
    if v_tel <> 0 then v_fouten := v_fouten || 'WV011 boekte toch ' || v_tel || ' mutaties; '; end if;

    -- ── 7. Order D: De Vries, 1 × Naober, geen moment (vandaag klaar) → rood.
    v_o := public.winkel_plaats_order(v_org, 'test-sleutel-' || gen_random_uuid(), 'test-token-' || gen_random_uuid(), 'afhalen', null,
        'De Vries', 'test@example.invalid', null, null, null, 345, 0, 345, '{}'::jsonb, 'https://example.invalid', jsonb_build_array(v_een));
    update public.winkel_orders set status = 'betaald', betaald_at = now() where id = v_o.id;
    v_d := v_o.id;
    select * into v_taak from public.winkel_wegzet_taken where order_id = v_d;
    if not found or not v_taak.ophalen_binnen_24u then
        v_fouten := v_fouten || 'ophalen vandaag (klaar_op) is niet rood; ';
    end if;

    -- Via de toonbank, met een medewerker.
    v_r := public.winkel_zet_order_apart(v_org, v_d, 'toonbank', null, v_mw);
    if v_r->>'uitkomst' <> 'apart' or v_r->>'bron' <> 'toonbank' then v_fouten := v_fouten || 'toonbank: ' || v_r::text || '; '; end if;
    if not exists (select 1 from public.winkel_voorraad_mutaties
                    where order_id = v_d and type = 'verkoop_online' and notitie = 'Apart gezet aan de toonbank door TEST Sanne') then
        v_fouten := v_fouten || 'notitie van de toonbank ontbreekt; ';
    end if;

    -- Apart gezet op een eerdere dag: niet_zelfde_dag, niets geboekt.
    update public.winkel_order_regels set klaargezet_at = klaargezet_at - interval '2 days' where order_id = v_d;
    select count(*) into v_mut from public.winkel_voorraad_mutaties where winkel_product_id = v_naober;
    v_r := public.winkel_zet_order_apart_terug(v_org, v_d);
    if v_r->>'uitkomst' <> 'niet_zelfde_dag' then v_fouten := v_fouten || 'eerdere dag: ' || coalesce(v_r->>'uitkomst', 'leeg') || ' i.p.v. niet_zelfde_dag; '; end if;
    select count(*) - v_mut into v_tel from public.winkel_voorraad_mutaties where winkel_product_id = v_naober;
    if v_tel <> 0 then v_fouten := v_fouten || 'niet_zelfde_dag boekte ' || v_tel || ' mutaties; '; end if;
    if not exists (select 1 from public.winkel_order_regels where order_id = v_d and klaargezet_at is not null) then
        v_fouten := v_fouten || 'niet_zelfde_dag haalde het vinkje weg; ';
    end if;

    -- ── 8b. Rechten.
    foreach v_sig in array array[
        'public.winkel_zet_order_apart(uuid, bigint, text, uuid, uuid)',
        'public.winkel_zet_order_apart_terug(uuid, bigint, text, uuid, uuid)'
    ] loop
        if has_function_privilege('anon', v_sig, 'EXECUTE') then v_fouten := v_fouten || 'anon mag ' || v_sig || '; '; end if;
        if not has_function_privilege('authenticated', v_sig, 'EXECUTE') then v_fouten := v_fouten || 'authenticated mist ' || v_sig || '; '; end if;
        if not has_function_privilege('service_role', v_sig, 'EXECUTE') then v_fouten := v_fouten || 'service_role mist ' || v_sig || '; '; end if;
    end loop;
    if has_table_privilege('anon', 'public.winkel_wegzet_taken', 'SELECT') then v_fouten := v_fouten || 'anon mag de view lezen; '; end if;
    if not has_table_privilege('authenticated', 'public.winkel_wegzet_taken', 'SELECT') then v_fouten := v_fouten || 'authenticated mag de view niet lezen; '; end if;
    if not exists (select 1 from pg_class where oid = 'public.winkel_wegzet_taken'::regclass and reloptions @> array['security_invoker=true']) then
        v_fouten := v_fouten || 'view is geen security_invoker; ';
    end if;

    if v_fouten <> '' then raise exception 'FOUT: %', v_fouten; end if;
    raise exception 'GESLAAGD: 6 liggen er, 4 gereserveerd, één taak; apart = één verkoop_online −4, ligt er 2, gereserveerd 0, pakketregel blijft; al_apart; WV006; ongedaan = retour +4 en de taak terug; niet_apart; 3 op het schap = WV010 met details en niets geboekt; na ophalen WV011; eerdere dag = niet_zelfde_dag; toonbank-notitie; lid ja, niet-lid en anon nee — alles teruggedraaid';
end $$;
