-- Test voor BA-9 (migratie 20261007120000_toonbank_bonnen): het journaal.
-- toonbank_journaal_opslaan (nieuw/bestond, gat_voor, bevestigd_tot,
-- nooit weigeren op inhoud), toonbank_verwerk_wachtrij (elke melding apart:
-- een fout blokkeert de rest niet), toonbank_journaal_markeer,
-- toonbank_journaal_afhandelen en de append-only-trigger. Draait in één
-- transactie die aan het eind wordt teruggedraaid.
--
-- ALLEEN op de dev-database, nooit op live en nooit met --linked:
--
--   npx supabase db query --db-url "$DEV_DB_URL" -o table -f supabase/tests/toonbank_journaal.sql
--
-- of lokaal: npm --prefix tools/testdb run test -- toonbank_journaal
-- Vereist de seed supabase/tests/seed_vier_naober.sql.
--
-- Verwacht: "GESLAAGD: ..." als EXCEPTION.

-- Hulpjes voor deze test (pg_temp: verdwijnen met de sessie).
create function pg_temp.tb_regel(p_nr int, p_naam text, p_aantal int, p_stuk int, p_pct int, p_onderdelen jsonb)
returns jsonb language sql as $$
    select jsonb_build_object('regelnr', p_nr, 'soort', 'verkoop', 'artikel_id', null, 'naam', p_naam, 'aantal', p_aantal,
        'stuk_cents', p_stuk, 'korting_cents', 0, 'bedrag_cents', p_aantal * p_stuk,
        'btw', jsonb_build_array(jsonb_build_object('pct', p_pct, 'incl_cents', p_aantal * p_stuk)),
        'alcohol', false, 'onderdelen', p_onderdelen, 'prijs_bron', 'catalogus')
$$;

create function pg_temp.tb_bon(p_gid uuid, p_volgnr bigint, p_bonnummer text, p_regels jsonb)
returns jsonb language sql as $$
    select jsonb_build_object('soort', 'bon', 'gebeurtenis_id', p_gid, 'volgnummer', p_volgnr, 'moment', '2027-03-06T11:12:08+01:00',
        'medewerker_id', null, 'bon_id', p_gid, 'bonnummer', p_bonnummer, 'bon_volgnummer', split_part(p_bonnummer, '-', 2)::int,
        'status', 'afgerond', 'kanaal', 'winkel', 'catalogus_versie', 1, 'leeftijd', null,
        'regels', p_regels || jsonb_build_array(jsonb_build_object('regelnr', 99, 'soort', 'betaling', 'betaalmethode', 'pin',
            'betaal_bevestiging', 'handmatig', 'bedrag_cents', (select coalesce(sum((r->>'bedrag_cents')::int), 0) from jsonb_array_elements(p_regels) r))),
        'totaal_cents', (select coalesce(sum((r->>'bedrag_cents')::int), 0) from jsonb_array_elements(p_regels) r),
        'afronding_cents', 0)
$$;

create function pg_temp.tb_klein(p_gid uuid, p_volgnr bigint, p_soort text)
returns jsonb language sql as $$
    select jsonb_build_object('soort', p_soort, 'gebeurtenis_id', p_gid, 'volgnummer', p_volgnr, 'moment', '2027-03-06T09:55:00+01:00', 'medewerker_id', null)
$$;

do $$
declare
    v_org       uuid;
    v_sfx       text := substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);
    v_hash      text := repeat('a', 32) || ':' || repeat('b', 128);
    v_app       uuid;
    v_code      text;
    v_prod      uuid;
    v_onderdeel jsonb;
    v_g1        uuid := gen_random_uuid();
    v_g2        uuid := gen_random_uuid();
    v_g3        uuid := gen_random_uuid();
    v_g4        uuid := gen_random_uuid();
    v_g5        uuid := gen_random_uuid();
    v_g6        uuid := gen_random_uuid();
    v_g7        uuid := gen_random_uuid();
    v_g8        uuid := gen_random_uuid();
    v_g9        uuid := gen_random_uuid();
    v_g10       uuid := gen_random_uuid();
    v_g11       uuid := gen_random_uuid();
    v_g12       uuid := gen_random_uuid();
    v_g13       uuid := gen_random_uuid();
    v_user      uuid := gen_random_uuid();
    v_r         jsonb;
    v_w         jsonb;
    v_j         public.toonbank_journaal%rowtype;
    v_n         int;
    v_n2        int;
    v_id        bigint;
    v_fouten    text := '';
begin
    select id into v_org from public.organizations where slug = 'e2e-hop-en-bites';
    if v_org is null then
        raise exception 'GEWEIGERD: organisatie e2e-hop-en-bites bestaat niet. Deze test draait alleen op de dev-database, na supabase/tests/seed_vier_naober.sql.';
    end if;

    v_r := public.toonbank_apparaat_nieuw(v_org, 'TEST journaal ' || v_sfx, 'winkel', v_hash);
    v_app := (v_r->>'apparaat_id')::uuid;
    v_code := v_r->>'code';
    insert into public.winkel_producten (organization_id, naam, type, eenheid, prijs_per, btw_pct)
    values (v_org, 'TEST journaalbier ' || v_sfx, 'bier', 'stuk', 1, 21) returning id into v_prod;
    perform public.winkel_muteer_voorraad(v_org, v_prod, 'telling', 10);
    v_onderdeel := jsonb_build_array(jsonb_build_object('product_id', v_prod, 'hoeveelheid', 1, 'eenheid', 'stuk'));

    -- ── 1. Opslaan: een bon (1) en inloggen (2) zijn nieuw en wachten; ongewijzigd bewaard.
    v_r := public.toonbank_journaal_opslaan(v_org, v_app, jsonb_build_array(
        pg_temp.tb_bon(v_g1, 1, v_code || '-000001', jsonb_build_array(pg_temp.tb_regel(1, 'TEST bier', 2, 300, 21, v_onderdeel))),
        pg_temp.tb_klein(v_g2, 2, 'inloggen')), '1.1.0');
    if jsonb_array_length(v_r->'resultaten') <> 2
       or exists (select 1 from jsonb_array_elements(v_r->'resultaten') e where e->>'journaal' <> 'nieuw' or e->>'verwerking' <> 'wacht')
       or (v_r->>'bevestigd_tot_volgnummer')::bigint <> 2 then
        v_fouten := v_fouten || 'eerste opslag: ' || v_r::text || '; ';
    end if;
    select * into v_j from public.toonbank_journaal where organization_id = v_org and gebeurtenis_id = v_g1;
    if v_j.payload <> pg_temp.tb_bon(v_g1, 1, v_code || '-000001', jsonb_build_array(pg_temp.tb_regel(1, 'TEST bier', 2, 300, 21, v_onderdeel)))
       or v_j.soort <> 'bon' or v_j.volgnummer <> 1 or v_j.gat_voor or v_j.contract_versie <> '1.1.0'
       or v_j.apparaat_tijd <> '2027-03-06T10:12:08Z'::timestamptz then
        v_fouten := v_fouten || 'journaalregel bon niet ongewijzigd: ' || row_to_json(v_j)::text || '; ';
    end if;
    if (select bevestigd_tot_volgnummer from public.toonbank_apparaten where id = v_app) <> 2
       or (select hoogste_volgnummer_gemeld from public.toonbank_apparaten where id = v_app) <> 2 then
        v_fouten := v_fouten || 'apparaat bevestigd/hoogste niet 2; ';
    end if;

    -- Dezelfde twee nog een keer: bestond, niets dubbel.
    v_r := public.toonbank_journaal_opslaan(v_org, v_app, jsonb_build_array(
        pg_temp.tb_bon(v_g1, 1, v_code || '-000001', jsonb_build_array(pg_temp.tb_regel(1, 'TEST bier', 2, 300, 21, v_onderdeel))),
        pg_temp.tb_klein(v_g2, 2, 'inloggen')), '1.1.0');
    select count(*) into v_n from public.toonbank_journaal where apparaat_id = v_app;
    if exists (select 1 from jsonb_array_elements(v_r->'resultaten') e where e->>'journaal' <> 'bestond') or v_n <> 2 then
        v_fouten := v_fouten || format('herhaling: %s (journaal %s rijen); ', v_r, v_n);
    end if;

    -- ── 2. Verwerken: bon verwerkt (één verkoop_kassa), inloggen niet_nodig.
    v_w := public.toonbank_verwerk_wachtrij(v_org, v_app);
    if (select verwerk_status from public.toonbank_journaal where gebeurtenis_id = v_g1 and organization_id = v_org) <> 'verwerkt'
       or (select verwerk_status from public.toonbank_journaal where gebeurtenis_id = v_g2 and organization_id = v_org) <> 'niet_nodig'
       or jsonb_array_length(v_w->'verwerkt') <> 2 then
        v_fouten := v_fouten || 'wachtrij 1: ' || v_w::text || '; ';
    end if;
    if not exists (select 1 from jsonb_array_elements(v_w->'verwerkt') e where (e->>'gebeurtenis_id')::uuid = v_g1 and e->'product_ids' = jsonb_build_array(v_prod)) then
        v_fouten := v_fouten || 'wachtrij geeft de geraakte producten niet: ' || v_w::text || '; ';
    end if;
    -- Nog een keer opslaan + verwerken: bestond/verwerkt, nog steeds één mutatie.
    v_r := public.toonbank_journaal_opslaan(v_org, v_app, jsonb_build_array(
        pg_temp.tb_bon(v_g1, 1, v_code || '-000001', jsonb_build_array(pg_temp.tb_regel(1, 'TEST bier', 2, 300, 21, v_onderdeel)))));
    v_w := public.toonbank_verwerk_wachtrij(v_org, v_app);
    select count(*) into v_n from public.winkel_voorraad_mutaties where winkel_product_id = v_prod and type = 'verkoop_kassa';
    if v_r->'resultaten'->0->>'journaal' <> 'bestond' or v_r->'resultaten'->0->>'verwerking' <> 'verwerkt'
       or jsonb_array_length(v_w->'verwerkt') <> 0 or v_n <> 1 then
        v_fouten := v_fouten || format('bon opnieuw: %s, wachtrij %s, %s verkoopmutaties; ', v_r, v_w, v_n);
    end if;

    -- ── 3. Een gat: 5 komt vóór 3 en 4. gat_voor bij 5; bevestigd blijft 2 tot 3 en 4 er zijn.
    v_r := public.toonbank_journaal_opslaan(v_org, v_app, jsonb_build_array(pg_temp.tb_klein(v_g5, 5, 'uitloggen') || '{"reden": "zelf"}'::jsonb));
    if not (select gat_voor from public.toonbank_journaal where organization_id = v_org and gebeurtenis_id = v_g5)
       or (v_r->>'bevestigd_tot_volgnummer')::bigint <> 2
       or (select hoogste_volgnummer_gemeld from public.toonbank_apparaten where id = v_app) <> 5 then
        v_fouten := v_fouten || 'gat bij 5: ' || v_r::text || '; ';
    end if;
    v_r := public.toonbank_journaal_opslaan(v_org, v_app, jsonb_build_array(
        pg_temp.tb_klein(v_g4, 4, 'inloggen'), pg_temp.tb_klein(v_g3, 3, 'inloggen')));
    if (v_r->>'bevestigd_tot_volgnummer')::bigint <> 5
       or (select gat_voor from public.toonbank_journaal where organization_id = v_org and gebeurtenis_id = v_g3)
       or (select gat_voor from public.toonbank_journaal where organization_id = v_org and gebeurtenis_id = v_g4) then
        v_fouten := v_fouten || 'gat gedicht: ' || v_r::text || '; ';
    end if;

    -- ── 4. Nooit weigeren op inhoud.
    -- Volgnummer 1 nog een keer, ander id (een gewiste tablet): bewaard zonder volgnummer, fout.
    v_r := public.toonbank_journaal_opslaan(v_org, v_app, jsonb_build_array(pg_temp.tb_klein(v_g6, 1, 'inloggen')));
    select * into v_j from public.toonbank_journaal where organization_id = v_org and gebeurtenis_id = v_g6;
    if v_r->'resultaten'->0->>'journaal' <> 'nieuw' or v_j.volgnummer is not null or v_j.verwerk_status <> 'fout' or v_j.fout_code <> 'volgnummer_dubbel' then
        v_fouten := v_fouten || 'volgnummer dubbel: ' || row_to_json(v_j)::text || '; ';
    end if;
    -- Een rare soort en een moment dat geen tijd is: bewaard, fout.
    v_r := public.toonbank_journaal_opslaan(v_org, v_app, jsonb_build_array(
        jsonb_build_object('soort', 'Kassa!', 'gebeurtenis_id', v_g7, 'volgnummer', 6, 'moment', '2027-03-06T10:00:00+01:00'),
        jsonb_build_object('soort', 'inloggen', 'gebeurtenis_id', v_g8, 'volgnummer', 7, 'moment', 'gisteren')));
    if (select soort || '/' || verwerk_status || '/' || fout_code from public.toonbank_journaal where organization_id = v_org and gebeurtenis_id = v_g7) <> 'onbekend/fout/soort_onbekend'
       or (select verwerk_status || '/' || fout_code from public.toonbank_journaal where organization_id = v_org and gebeurtenis_id = v_g8) <> 'fout/moment_ongeldig'
       or (select payload->>'soort' from public.toonbank_journaal where organization_id = v_org and gebeurtenis_id = v_g7) <> 'Kassa!' then
        v_fouten := v_fouten || 'rare soort of moment niet als fout bewaard; ';
    end if;
    -- Een kapotte envelop: 22023 en er is niets bewaard (ook de goede niet).
    select count(*) into v_n from public.toonbank_journaal where apparaat_id = v_app;
    begin
        perform public.toonbank_journaal_opslaan(v_org, v_app, jsonb_build_array(
            pg_temp.tb_klein(gen_random_uuid(), 8, 'inloggen'),
            jsonb_build_object('soort', 'bon', 'gebeurtenis_id', 'geen-uuid', 'volgnummer', 9, 'moment', '2027-03-06T10:00:00+01:00')));
        v_fouten := v_fouten || 'kapotte envelop opgeslagen; ';
    exception when invalid_parameter_value then null;
    end;
    begin
        perform public.toonbank_journaal_opslaan(v_org, v_app, jsonb_build_array(jsonb_build_object('soort', 'inloggen', 'gebeurtenis_id', gen_random_uuid(), 'volgnummer', 1.5, 'moment', 'x')));
        v_fouten := v_fouten || 'volgnummer 1.5 opgeslagen; ';
    exception when invalid_parameter_value then null;
    end;
    select count(*) into v_n2 from public.toonbank_journaal where apparaat_id = v_app;
    if v_n2 <> v_n then v_fouten := v_fouten || 'na een kapotte envelop toch iets opgeslagen; '; end if;

    -- ── 5. De wachtrij blokkeert nooit: een kapotte bon (8) wordt fout, de goede bon erna (9) verwerkt.
    perform public.toonbank_journaal_opslaan(v_org, v_app, jsonb_build_array(
        jsonb_build_object('soort', 'bon', 'gebeurtenis_id', v_g9, 'volgnummer', 8, 'moment', '2027-03-06T11:20:00+01:00', 'bon_id', v_g9),
        pg_temp.tb_bon(v_g10, 9, v_code || '-000002', jsonb_build_array(pg_temp.tb_regel(1, 'TEST bier', 1, 300, 21, v_onderdeel)))));
    v_w := public.toonbank_verwerk_wachtrij(v_org, v_app);
    select * into v_j from public.toonbank_journaal where organization_id = v_org and gebeurtenis_id = v_g9;
    if v_j.verwerk_status <> 'fout' or v_j.fout_code <> 'ongeldig' or v_j.fout_melding not like '%bonnummer%' or v_j.pogingen <> 1 then
        v_fouten := v_fouten || 'kapotte bon: ' || row_to_json(v_j)::text || '; ';
    end if;
    if (select verwerk_status from public.toonbank_journaal where organization_id = v_org and gebeurtenis_id = v_g10) <> 'verwerkt'
       or not exists (select 1 from public.toonbank_bonnen where id = v_g10) then
        v_fouten := v_fouten || 'de bon na een kapotte bon is niet verwerkt: ' || v_w::text || '; ';
    end if;
    -- Een onbekende maar nette soort (10): opgeslagen, bij verwerken fout.
    perform public.toonbank_journaal_opslaan(v_org, v_app, jsonb_build_array(pg_temp.tb_klein(v_g11, 10, 'iets_nieuws')));
    perform public.toonbank_verwerk_wachtrij(v_org, v_app);
    if (select verwerk_status || '/' || fout_code from public.toonbank_journaal where organization_id = v_org and gebeurtenis_id = v_g11) <> 'fout/ongeldig' then
        v_fouten := v_fouten || 'onbekende soort bij verwerken niet fout; ';
    end if;

    -- ── 6. Te oude app (contract §6.6): bewaard als fout; de bijgewerkte app stuurt hem opnieuw → wacht → verwerkt.
    v_r := public.toonbank_journaal_opslaan(v_org, v_app, jsonb_build_array(pg_temp.tb_klein(v_g12, 11, 'inloggen')), '0.9.0', true);
    if v_r->'resultaten'->0->>'verwerking' <> 'fout'
       or (select fout_code from public.toonbank_journaal where organization_id = v_org and gebeurtenis_id = v_g12) <> 'contract_verouderd' then
        v_fouten := v_fouten || 'contract_verouderd: ' || v_r::text || '; ';
    end if;
    v_r := public.toonbank_journaal_opslaan(v_org, v_app, jsonb_build_array(pg_temp.tb_klein(v_g12, 11, 'inloggen')), '1.1.0', false);
    perform public.toonbank_verwerk_wachtrij(v_org, v_app);
    if v_r->'resultaten'->0->>'journaal' <> 'bestond' or v_r->'resultaten'->0->>'verwerking' <> 'wacht'
       or (select verwerk_status from public.toonbank_journaal where organization_id = v_org and gebeurtenis_id = v_g12) <> 'niet_nodig' then
        v_fouten := v_fouten || 'na update niet verwerkt: ' || v_r::text || '; ';
    end if;

    -- ── 7. markeer (de strenge controle van de API): alleen wacht → fout.
    perform public.toonbank_journaal_opslaan(v_org, v_app, jsonb_build_array(pg_temp.tb_klein(v_g13, 12, 'pinpoging')));
    select id into v_id from public.toonbank_journaal where organization_id = v_org and gebeurtenis_id = v_g13;
    if public.toonbank_journaal_markeer(v_org, v_id, 'schema', 'bon_id ontbreekt') <> 'fout'
       or (select fout_code from public.toonbank_journaal where id = v_id) <> 'schema' then
        v_fouten := v_fouten || 'markeer wacht → fout; ';
    end if;
    if public.toonbank_journaal_markeer(v_org, (select id from public.toonbank_journaal where organization_id = v_org and gebeurtenis_id = v_g1), 'schema', 'x') <> 'verwerkt' then
        v_fouten := v_fouten || 'markeer veranderde een verwerkte melding; ';
    end if;

    -- ── 8. Te controleren: telt fout en conflict van dit apparaat; afhandelen.
    select count(*) into v_n from public.toonbank_journaal where apparaat_id = v_app and verwerk_status in ('fout', 'conflict');
    if (public.toonbank_status(v_org, v_app)->>'te_controleren')::int <> v_n or v_n < 5 then
        v_fouten := v_fouten || format('te_controleren %s, verwacht %s; ', public.toonbank_status(v_org, v_app)->>'te_controleren', v_n);
    end if;
    begin
        perform public.toonbank_journaal_afhandelen(v_org, v_id, 'opgelost', '  ');
        v_fouten := v_fouten || 'afgehandeld zonder reden; ';
    exception when invalid_parameter_value then null;
    end;
    v_r := public.toonbank_journaal_afhandelen(v_org, v_id, 'opgelost', 'pinpoging zonder bon, niets aan de hand');
    select * into v_j from public.toonbank_journaal where id = v_id;
    if v_r->>'status' <> 'opgelost' or v_j.verwerk_status <> 'opgelost' or v_j.opgelost_reden <> 'pinpoging zonder bon, niets aan de hand' or v_j.opgelost_at is null then
        v_fouten := v_fouten || 'opgelost: ' || v_r::text || '; ';
    end if;
    -- Opnieuw verwerken van de kapotte bon: blijft fout, met een poging erbij.
    select id into v_id from public.toonbank_journaal where organization_id = v_org and gebeurtenis_id = v_g9;
    v_r := public.toonbank_journaal_afhandelen(v_org, v_id, 'opnieuw');
    if v_r->>'status' <> 'fout' or (select pogingen from public.toonbank_journaal where id = v_id) <> 2 then
        v_fouten := v_fouten || 'opnieuw kapotte bon: ' || v_r::text || '; ';
    end if;
    -- Opnieuw een volgnummer-dubbel kan niet: met de hand.
    select id into v_id from public.toonbank_journaal where organization_id = v_org and gebeurtenis_id = v_g6;
    if public.toonbank_journaal_afhandelen(v_org, v_id, 'opnieuw')->>'uitkomst' <> 'kan_niet' then
        v_fouten := v_fouten || 'opnieuw bij volgnummer_dubbel; ';
    end if;

    -- ── 9. Append-only: geen payload-wijziging, geen DELETE.
    select id into v_id from public.toonbank_journaal where organization_id = v_org and gebeurtenis_id = v_g1;
    begin
        update public.toonbank_journaal set payload = '{"anders": true}' where id = v_id;
        v_fouten := v_fouten || 'journaal-payload te wijzigen; ';
    exception when sqlstate 'TB001' then null;
    end;
    begin
        update public.toonbank_journaal set volgnummer = 99 where id = v_id;
        v_fouten := v_fouten || 'journaal-volgnummer te wijzigen; ';
    exception when sqlstate 'TB001' then null;
    end;
    begin
        delete from public.toonbank_journaal where id = v_id;
        v_fouten := v_fouten || 'journaal te verwijderen; ';
    exception when sqlstate 'TB001' then null;
    end;

    -- ── 10. Rechten.
    if has_function_privilege('anon', 'public.toonbank_journaal_opslaan(uuid, uuid, jsonb, text, boolean)', 'EXECUTE')
       or has_function_privilege('authenticated', 'public.toonbank_journaal_opslaan(uuid, uuid, jsonb, text, boolean)', 'EXECUTE')
       or has_function_privilege('authenticated', 'public.toonbank_verwerk_wachtrij(uuid, uuid)', 'EXECUTE')
       or has_function_privilege('authenticated', 'public.toonbank_boek_bon(bigint)', 'EXECUTE')
       or has_function_privilege('authenticated', 'public.toonbank_journaal_markeer(uuid, bigint, text, text)', 'EXECUTE')
       or has_function_privilege('anon', 'public.toonbank_journaal_afhandelen(uuid, bigint, text, text, uuid)', 'EXECUTE')
       or not has_function_privilege('service_role', 'public.toonbank_verwerk_wachtrij(uuid, uuid)', 'EXECUTE')
       or not has_function_privilege('authenticated', 'public.toonbank_journaal_afhandelen(uuid, bigint, text, text, uuid)', 'EXECUTE') then
        v_fouten := v_fouten || 'rechten op de journaalfuncties kloppen niet; ';
    end if;
    -- Een gewoon lid (Medewerker) mag niet afhandelen; alleen een Admin.
    insert into auth.users (id, aud, role, email) values (v_user, 'authenticated', 'authenticated', 'journaal-' || v_user || '@example.invalid');
    insert into public.organization_members (organization_id, user_id, role, status) values (v_org, v_user, 'Medewerker', 'active');
    begin
        perform set_config('request.jwt.claims', json_build_object('sub', v_user, 'role', 'authenticated')::text, true);
        perform set_config('role', 'authenticated', true);
        begin
            perform public.toonbank_journaal_afhandelen(v_org, v_id, 'opgelost', 'mag niet');
            raise exception 'medewerker_mocht';
        exception when insufficient_privilege then null;
        end;
        raise exception 'terug_naar_postgres';
    exception when others then
        if sqlerrm <> 'terug_naar_postgres' then v_fouten := v_fouten || 'als medewerker: ' || sqlerrm || '; '; end if;
    end;

    if v_fouten <> '' then raise exception 'FOUT: %', v_fouten; end if;
    raise exception 'GESLAAGD: opslaan nieuw/bestond en ongewijzigd, bevestigd_tot zonder gat (2 → 5), gat_voor, dubbel volgnummer/rare soort/geen tijd toch bewaard als fout, kapotte envelop = 22023 zonder opslag; wachtrij: bon verwerkt (één mutatie, ook bij herhaling), kleine melding niet_nodig, kapotte bon fout zonder de volgende te blokkeren; contract_verouderd → na update verwerkt; markeer alleen wacht → fout; afhandelen opgelost met reden, opnieuw, kan_niet, alleen Admin; journaal append-only — alles teruggedraaid';
end $$;
