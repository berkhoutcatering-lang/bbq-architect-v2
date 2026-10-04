-- Test voor BA-7a (migratie 20261006130000_toonbank_apparaten): apparaten,
-- koppelen, intrekken, sessies, de inlogteller, het journaal (append-only en
-- uniek) en RLS. Draait in één transactie die aan het eind wordt
-- teruggedraaid: er blijft niets achter.
--
-- ALLEEN op de dev-database, nooit op live en nooit met --linked:
--
--   npx supabase db query --db-url "$DEV_DB_URL" -o table -f supabase/tests/toonbank_apparaten.sql
--
-- of lokaal: npm --prefix tools/testdb run test -- toonbank_apparaten
-- Vereist de seed supabase/tests/seed_vier_naober.sql (organisatie
-- e2e-hop-en-bites); zonder die organisatie weigert de test te draaien.
--
-- Verwacht: "GESLAAGD: ..." als EXCEPTION. Elke andere foutmelding is een
-- echte fout.

do $$
declare
    v_org       uuid;
    v_ander     uuid;
    v_suffix    text := substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);
    v_hash      text := repeat('a', 32) || ':' || repeat('b', 128);
    v_sleutel   text := encode(sha256(convert_to('tb_test_' || gen_random_uuid()::text, 'UTF8')), 'hex');
    v_user      uuid := gen_random_uuid();
    v_user2     uuid := gen_random_uuid();
    v_user3     uuid := gen_random_uuid();
    v_r         jsonb;
    v_a1        uuid;
    v_a2        uuid;
    v_ax        uuid;
    v_code1     text;
    v_code2     text;
    v_p_mw      uuid;
    v_p_eig     uuid;
    v_p_ander   uuid;
    v_n         int;
    v_j1        bigint;
    v_jx        bigint;
    v_tekst     text;
    v_fouten    text := '';
begin
    -- ── Dev-only-guard.
    select id into v_org from public.organizations where slug = 'e2e-hop-en-bites';
    if v_org is null then
        raise exception 'GEWEIGERD: organisatie e2e-hop-en-bites bestaat niet. Deze test draait alleen op de dev-database, na supabase/tests/seed_vier_naober.sql.';
    end if;
    insert into public.organizations (name, slug) values ('Test ander ' || v_suffix, 'test-ander-' || v_suffix) returning id into v_ander;

    -- ── 1. Apparaat nieuw: T<n> per organisatie, koppelcode 5 minuten.
    v_r := public.toonbank_apparaat_nieuw(v_org, 'TEST winkel ' || v_suffix, 'winkel', v_hash);
    v_a1 := (v_r->>'apparaat_id')::uuid;
    v_code1 := v_r->>'code';
    v_r := public.toonbank_apparaat_nieuw(v_org, 'TEST reserve ' || v_suffix, 'event', v_hash);
    v_a2 := (v_r->>'apparaat_id')::uuid;
    v_code2 := v_r->>'code';
    if substr(v_code2, 2)::int <> substr(v_code1, 2)::int + 1 then
        v_fouten := v_fouten || format('codes %s en %s lopen niet door; ', v_code1, v_code2);
    end if;
    v_r := public.toonbank_apparaat_nieuw(v_ander, 'TEST ander', 'winkel', v_hash);
    v_ax := (v_r->>'apparaat_id')::uuid;
    if v_r->>'code' <> 'T1' then v_fouten := v_fouten || 'eerste tablet van een nieuwe organisatie is ' || (v_r->>'code') || ' i.p.v. T1; '; end if;
    if (v_r->>'koppelcode_geldig_tot')::timestamptz not between now() + interval '4 minutes 59 seconds' and now() + interval '5 minutes 1 second' then
        v_fouten := v_fouten || 'koppelcode niet 5 minuten geldig; ';
    end if;
    begin
        perform public.toonbank_apparaat_nieuw(v_org, 'TEST', 'winkel', 'geen-hash');
        v_fouten := v_fouten || 'koppelcode zonder scrypt-formaat geaccepteerd; ';
    exception when invalid_parameter_value then null;
    end;

    -- ── 2. Koppelen: kandidaten, 5 foute pogingen, afronden, race.
    select count(*) into v_n from public.toonbank_koppel_kandidaten() k where k.apparaat_id in (v_a1, v_a2, v_ax);
    if v_n <> 3 then v_fouten := v_fouten || v_n || ' open koppelcodes i.p.v. 3; '; end if;
    for i in 1..4 loop perform public.toonbank_koppel_mislukt(); end loop;
    select count(*) into v_n from public.toonbank_koppel_kandidaten() k where k.apparaat_id in (v_a1, v_a2, v_ax);
    if v_n <> 3 then v_fouten := v_fouten || 'na 4 foute pogingen al codes vervallen; '; end if;
    v_n := public.toonbank_koppel_mislukt();
    if v_n < 3 then v_fouten := v_fouten || 'de 5e foute poging liet ' || v_n || ' codes vervallen i.p.v. alle; '; end if;
    select count(*) into v_n from public.toonbank_koppel_kandidaten() k where k.apparaat_id in (v_a1, v_a2, v_ax);
    if v_n <> 0 then v_fouten := v_fouten || 'na 5 foute pogingen nog open codes; '; end if;
    if public.toonbank_koppel_af(v_a1, v_sleutel, 'tb_abcdef…') is not null then
        v_fouten := v_fouten || 'koppelen met een vervallen code lukte; ';
    end if;
    -- Nieuwe code (pogingen weer 0), dan koppelen: één keer.
    v_r := public.toonbank_apparaat_koppelcode(v_org, v_a1, v_hash);
    if not exists (select 1 from public.toonbank_apparaten where id = v_a1 and koppelpogingen = 0 and koppelcode_hash is not null) then
        v_fouten := v_fouten || 'nieuwe koppelcode zet de pogingen niet op 0; ';
    end if;
    v_r := public.toonbank_koppel_af(v_a1, v_sleutel, 'tb_abcdef…');
    if v_r is null or (v_r->>'organization_id')::uuid <> v_org or v_r->>'code' <> v_code1 then
        v_fouten := v_fouten || 'koppelen: ' || coalesce(v_r::text, 'null') || '; ';
    end if;
    if public.toonbank_koppel_af(v_a1, v_sleutel, 'tb_abcdef…') is not null then
        v_fouten := v_fouten || 'dezelfde code werkte twee keer; ';
    end if;
    if not exists (select 1 from public.toonbank_apparaten where id = v_a1 and sleutel_hash = v_sleutel and koppelcode_hash is null and gekoppeld_at is not null) then
        v_fouten := v_fouten || 'na koppelen: sleutel niet vast of code niet gewist; ';
    end if;
    -- Een sleutel is uniek.
    perform public.toonbank_apparaat_koppelcode(v_org, v_a2, v_hash);
    begin
        perform public.toonbank_koppel_af(v_a2, v_sleutel, 'tb_abcdef…');
        v_fouten := v_fouten || 'twee tablets met dezelfde sleutel; ';
    exception when unique_violation then null;
    end;

    -- ── 3. Medewerkers, rol en sessies.
    insert into public.personeel (organization_id, naam, actief, toonbank_rol)
    values (v_org, 'TEST Mw ' || v_suffix, true, 'medewerker') returning id into v_p_mw;
    insert into public.personeel (organization_id, naam, actief, toonbank_rol)
    values (v_org, 'TEST Eigenaar ' || v_suffix, true, 'eigenaar') returning id into v_p_eig;
    insert into public.personeel (organization_id, naam, actief, toonbank_rol)
    values (v_ander, 'TEST Ander', true, 'medewerker') returning id into v_p_ander;
    begin
        update public.personeel set toonbank_rol = 'kassier' where id = v_p_mw;
        v_fouten := v_fouten || 'toonbank_rol kassier toegestaan; ';
    exception when check_violation then null;
    end;
    insert into public.toonbank_sessies (organization_id, apparaat_id, medewerker_id, token_hash, rol, doel, geldig_tot)
    values (v_org, v_a1, v_p_mw, encode(sha256('sessie1'::bytea), 'hex'), 'medewerker', 'dienst', now() + interval '12 hours');
    begin
        insert into public.toonbank_sessies (organization_id, apparaat_id, medewerker_id, token_hash, rol, doel, geldig_tot)
        values (v_org, v_a1, v_p_mw, encode(sha256('sessie2'::bytea), 'hex'), 'medewerker', 'vrij_overschrijden', now() + interval '60 seconds');
        v_fouten := v_fouten || 'goedkeuring boven vrij door een medewerker; ';
    exception when check_violation then null;
    end;
    insert into public.toonbank_sessies (organization_id, apparaat_id, medewerker_id, token_hash, rol, doel, geldig_tot)
    values (v_org, v_a1, v_p_eig, encode(sha256('sessie3'::bytea), 'hex'), 'eigenaar', 'vrij_overschrijden', now() + interval '60 seconds');
    begin
        insert into public.toonbank_sessies (organization_id, apparaat_id, medewerker_id, token_hash, rol, doel, geldig_tot)
        values (v_org, v_a1, v_p_eig, encode(sha256('sessie3'::bytea), 'hex'), 'eigenaar', 'dienst', now() + interval '1 hour');
        v_fouten := v_fouten || 'twee sessies met hetzelfde token; ';
    exception when unique_violation then null;
    end;

    -- ── 4. Inlogteller: 4 keer fout = nog niet geblokkeerd, de 5e wel.
    --    Telt alleen sinds de laatste sessie: v_p_eig heeft er net een, dus
    --    de teller begint daar.
    for i in 1..4 loop
        v_r := public.toonbank_inlogcode_mislukt(v_org, v_p_eig, v_a1);
    end loop;
    if (v_r->>'mislukt')::int <> 4 or (v_r->>'over')::int <> 1 or v_r->>'geblokkeerd_tot' is not null then
        v_fouten := v_fouten || 'na 4 fouten: ' || v_r::text || '; ';
    end if;
    v_r := public.toonbank_inlogcode_mislukt(v_org, v_p_eig, v_a1);
    if (v_r->>'mislukt')::int <> 5 or v_r->>'geblokkeerd_tot' is null
       or not exists (select 1 from public.personeel where id = v_p_eig and kds_pin_lockout_until > now() + interval '4 minutes') then
        v_fouten := v_fouten || 'na 5 fouten niet geblokkeerd: ' || v_r::text || '; ';
    end if;
    if not exists (select 1 from public.kds_audit_logs where personeel_id = v_p_eig and action = 'pin_locked' and metadata->>'bron' = 'toonbank') then
        v_fouten := v_fouten || 'geen pin_locked in kds_audit_logs; ';
    end if;
    begin
        perform public.toonbank_inlogcode_mislukt(v_org, v_p_ander, v_a1);
        v_fouten := v_fouten || 'inlogteller voor een medewerker van een andere organisatie; ';
    exception when no_data_found then null;
    end;

    -- ── 5. Journaal: uniek, append-only.
    insert into public.toonbank_journaal (organization_id, apparaat_id, gebeurtenis_id, volgnummer, soort, contract_versie, payload, apparaat_tijd)
    values (v_org, v_a1, '11111111-1111-4111-8111-111111111111', 1, 'inloggen', '1.1.0', '{"soort":"inloggen"}', now())
    returning id into v_j1;
    insert into public.toonbank_journaal (organization_id, apparaat_id, gebeurtenis_id, volgnummer, soort, payload)
    values (v_org, v_a1, gen_random_uuid(), null, 'wegzetten', '{}'),
           (v_org, v_a1, gen_random_uuid(), null, 'wegzetten', '{}');    -- vragen zonder volgnummer: mag vaker
    begin
        insert into public.toonbank_journaal (organization_id, apparaat_id, gebeurtenis_id, volgnummer, soort, payload)
        values (v_org, v_a1, '11111111-1111-4111-8111-111111111111', 2, 'bon', '{}');
        v_fouten := v_fouten || 'dubbel gebeurtenis_id in dezelfde organisatie; ';
    exception when unique_violation then null;
    end;
    begin
        insert into public.toonbank_journaal (organization_id, apparaat_id, gebeurtenis_id, volgnummer, soort, payload)
        values (v_org, v_a1, gen_random_uuid(), 1, 'bon', '{}');
        v_fouten := v_fouten || 'dubbel volgnummer op hetzelfde apparaat; ';
    exception when unique_violation then null;
    end;
    -- Hetzelfde gebeurtenis_id in een andere organisatie mag (de sleutel is per organisatie).
    insert into public.toonbank_journaal (organization_id, apparaat_id, gebeurtenis_id, volgnummer, soort, payload)
    values (v_ander, v_ax, '11111111-1111-4111-8111-111111111111', 1, 'inloggen', '{}')
    returning id into v_jx;

    update public.toonbank_journaal
       set verwerk_status = 'niet_nodig', verwerkt_at = now(), pogingen = 1, resultaat = '{"ok":true}'
     where id = v_j1;
    begin
        update public.toonbank_journaal set payload = '{"anders":true}' where id = v_j1;
        v_fouten := v_fouten || 'payload te wijzigen; ';
    exception when sqlstate 'TB001' then null;
    end;
    begin
        update public.toonbank_journaal set soort = 'bon', verwerk_status = 'fout' where id = v_j1;
        v_fouten := v_fouten || 'soort te wijzigen samen met de verwerking; ';
    exception when sqlstate 'TB001' then null;
    end;
    begin
        delete from public.toonbank_journaal where id = v_j1;
        v_fouten := v_fouten || 'journaal te verwijderen; ';
    exception when sqlstate 'TB001' then null;
    end;
    begin
        -- CASCADE: sinds BA-9 verwijzen de bonnen naar het journaal; ook dan
        -- houdt een trigger het tegen (TB001 journaal, TB002 bonnen).
        execute 'truncate public.toonbank_journaal cascade';
        v_fouten := v_fouten || 'journaal te legen met TRUNCATE; ';
    exception when sqlstate 'TB001' or sqlstate 'TB002' then null;
    end;
    begin
        delete from public.organizations where id = v_ander;
        v_fouten := v_fouten || 'organisatie met journaal te verwijderen; ';
    exception when foreign_key_violation then null;
    end;

    -- ── 6. Intrekken: sleutel weg, sessies beëindigd, tweede keer niets nieuws.
    v_r := public.toonbank_apparaat_intrekken(v_org, v_a1, 'TEST verloren');
    if v_r->>'uitkomst' <> 'ingetrokken' then v_fouten := v_fouten || 'intrekken: ' || v_r::text || '; '; end if;
    if exists (select 1 from public.toonbank_sessies where apparaat_id = v_a1 and beeindigd_at is null) then
        v_fouten := v_fouten || 'sessies lopen door na intrekken; ';
    end if;
    v_r := public.toonbank_apparaat_intrekken(v_org, v_a1, 'nog eens');
    if v_r->>'uitkomst' <> 'al_ingetrokken' then v_fouten := v_fouten || 'tweede keer intrekken: ' || v_r::text || '; '; end if;
    begin
        perform public.toonbank_apparaat_koppelcode(v_org, v_a1, v_hash);
        v_fouten := v_fouten || 'nieuwe koppelcode voor een ingetrokken tablet; ';
    exception when no_data_found then null;
    end;
    begin
        perform public.toonbank_apparaat_intrekken(v_org, v_ax, 'vreemd');
        v_fouten := v_fouten || 'tablet van een andere organisatie in te trekken; ';
    exception when no_data_found then null;
    end;
    v_r := public.toonbank_apparaat_gezien(v_org, v_a2, 7, '0.1.0', '1.1.0');
    v_r := public.toonbank_apparaat_gezien(v_org, v_a2, 3, null, null);
    if (v_r->>'hoogste_volgnummer_gemeld')::int <> 7 or v_r->>'app_versie' <> '0.1.0' or v_r ? 'sleutel_hash' then
        v_fouten := v_fouten || 'apparaat gezien: ' || v_r::text || '; ';
    end if;

    -- ── 7. RLS en rechten in het echt (teruggedraaid door de afsluitende EXCEPTION).
    begin
        insert into auth.users (id, aud, role, email) values
            (v_user,  'authenticated', 'authenticated', 'toonbank-' || v_user  || '@example.invalid'),
            (v_user2, 'authenticated', 'authenticated', 'toonbank-' || v_user2 || '@example.invalid'),
            (v_user3, 'authenticated', 'authenticated', 'toonbank-' || v_user3 || '@example.invalid');
        insert into public.organization_members (organization_id, user_id, role, status) values
            (v_org, v_user, 'Admin', 'active'),
            (v_ander, v_user2, 'Admin', 'active'),
            (v_org, v_user3, 'Medewerker', 'active');

        -- Lid van e2e: ziet alleen de eigen tablets en het eigen journaal.
        perform set_config('request.jwt.claims', json_build_object('sub', v_user, 'role', 'authenticated')::text, true);
        perform set_config('role', 'authenticated', true);
        select count(*) into v_n from public.toonbank_apparaten where id in (v_a1, v_a2, v_ax);
        if v_n <> 2 then v_fouten := v_fouten || 'lid e2e ziet ' || v_n || ' van de 3 tablets i.p.v. 2; '; end if;
        select count(*) into v_n from public.toonbank_journaal where id in (v_j1, v_jx);
        if v_n <> 1 then v_fouten := v_fouten || 'lid e2e ziet ' || v_n || ' journaalregels i.p.v. 1; '; end if;
        begin
            perform sleutel_hash from public.toonbank_apparaten limit 1;
            v_fouten := v_fouten || 'lid leest de sleutel-hash; ';
        exception when insufficient_privilege then null;
        end;
        begin
            perform 1 from public.toonbank_sessies limit 1;
            v_fouten := v_fouten || 'lid leest toonbank_sessies; ';
        exception when insufficient_privilege then null;
        end;
        begin
            update public.toonbank_journaal set verwerk_status = 'opgelost' where id = v_j1;
            v_fouten := v_fouten || 'lid wijzigt het journaal; ';
        exception when insufficient_privilege then null;
        end;
        begin
            perform public.toonbank_apparaat_nieuw(v_ander, 'indringer', 'winkel', v_hash);
            v_fouten := v_fouten || 'lid maakt een tablet in een andere organisatie; ';
        exception when insufficient_privilege then null;
        end;
        begin
            perform * from public.toonbank_koppel_kandidaten();
            v_fouten := v_fouten || 'lid leest de koppelcodes; ';
        exception when insufficient_privilege then null;
        end;
        -- Beheer in de eigen organisatie mag wel (als Admin).
        v_r := public.toonbank_apparaat_nieuw(v_org, 'TEST via lid', 'winkel', v_hash);
        if not exists (select 1 from public.toonbank_apparaten where id = (v_r->>'apparaat_id')::uuid and aangemaakt_door = v_user) then
            v_fouten := v_fouten || 'aangemaakt_door is niet het lid; ';
        end if;

        -- Review M2 K4: een gewoon lid (Medewerker) beheert geen tablets.
        perform set_config('request.jwt.claims', json_build_object('sub', v_user3, 'role', 'authenticated')::text, true);
        begin
            perform public.toonbank_apparaat_nieuw(v_org, 'TEST door Medewerker', 'winkel', v_hash);
            v_fouten := v_fouten || 'Medewerker maakt een tablet met een eigen koppelcode-hash; ';
        exception when insufficient_privilege then null;
        end;
        begin
            perform public.toonbank_apparaat_koppelcode(v_org, v_a2, v_hash);
            v_fouten := v_fouten || 'Medewerker zet een nieuwe koppelcode; ';
        exception when insufficient_privilege then null;
        end;
        begin
            perform public.toonbank_apparaat_intrekken(v_org, v_a2, 'mag niet');
            v_fouten := v_fouten || 'Medewerker trekt een tablet in; ';
        exception when insufficient_privilege then null;
        end;
        -- personeel: rol, inlogcode en blokkade alleen via een Admin; de hash niet leesbaar.
        -- (Op de testdb loopt de RLS van personeel via organization_members in een lus;
        -- daarom staat RLS op personeel hier even uit. Getest worden de kolomrechten en de trigger.)
        perform set_config('role', 'postgres', true);
        execute 'alter table public.personeel disable row level security';
        perform set_config('role', 'authenticated', true);
        begin
            perform kds_pin_hash from public.personeel where id = v_p_mw;
            v_fouten := v_fouten || 'Medewerker leest kds_pin_hash; ';
        exception when insufficient_privilege then null;
        end;
        select count(*) into v_n from public.personeel where id = v_p_mw and naam like 'TEST Mw%' and kds_pin_lockout_until is null;
        if v_n <> 1 then v_fouten := v_fouten || 'Medewerker leest de gewone kolommen van personeel niet; '; end if;
        begin
            update public.personeel set toonbank_rol = 'eigenaar' where id = v_p_mw;
            v_fouten := v_fouten || 'Medewerker maakt zichzelf eigenaar; ';
        exception when insufficient_privilege then null;
        end;
        begin
            update public.personeel set kds_pin_hash = v_hash where id = v_p_mw;
            v_fouten := v_fouten || 'Medewerker zet een eigen inlogcode-hash; ';
        exception when insufficient_privilege then null;
        end;
        begin
            update public.personeel set kds_pin_lockout_until = null where id = v_p_eig;
            v_fouten := v_fouten || 'Medewerker heft een blokkade op; ';
        exception when insufficient_privilege then null;
        end;
        begin
            insert into public.personeel (organization_id, naam, toonbank_rol, kds_pin_hash) values (v_org, 'TEST stiekem', 'eigenaar', v_hash);
            v_fouten := v_fouten || 'Medewerker maakt een nieuwe eigenaar met inlogcode; ';
        exception when insufficient_privilege then null;
        end;
        update public.personeel set notitie = 'gewone kolom' where id = v_p_mw;
        insert into public.personeel (organization_id, naam) values (v_org, 'TEST gewoon nieuw');
        if (select count(*) from public.toonbank_inlogcodes_ingesteld(v_org) i where i.personeel_id in (v_p_mw, v_p_eig)) <> 2 then
            v_fouten := v_fouten || 'toonbank_inlogcodes_ingesteld voor een lid; ';
        end if;
        -- Een Admin mag het wel.
        perform set_config('request.jwt.claims', json_build_object('sub', v_user, 'role', 'authenticated')::text, true);
        update public.personeel set toonbank_rol = 'eigenaar', kds_pin_hash = v_hash, kds_pin_lockout_until = null where id = v_p_mw;
        if (select ingesteld from public.toonbank_inlogcodes_ingesteld(v_org) where personeel_id = v_p_mw) is not true then
            v_fouten := v_fouten || 'Admin zet rol en inlogcode niet; ';
        end if;
        perform set_config('role', 'postgres', true);
        execute 'alter table public.personeel enable row level security';
        perform set_config('role', 'authenticated', true);

        -- Lid van de andere organisatie: ziet alleen die tablet.
        perform set_config('request.jwt.claims', json_build_object('sub', v_user2, 'role', 'authenticated')::text, true);
        select string_agg(id::text, ',') into v_tekst from public.toonbank_apparaten where id in (v_a1, v_a2, v_ax);
        if v_tekst is distinct from v_ax::text then v_fouten := v_fouten || 'lid andere org ziet ' || coalesce(v_tekst, 'niets') || '; '; end if;
        select count(*) into v_n from public.toonbank_journaal where id in (v_j1, v_jx);
        if v_n <> 1 then v_fouten := v_fouten || 'lid andere org ziet ' || v_n || ' journaalregels; '; end if;

        -- anon: niets.
        perform set_config('request.jwt.claims', '{"role":"anon"}', true);
        perform set_config('role', 'anon', true);
        begin
            perform 1 from public.toonbank_apparaten limit 1;
            v_fouten := v_fouten || 'anon leest toonbank_apparaten; ';
        exception when insufficient_privilege then null;
        end;
        begin
            perform 1 from public.toonbank_journaal limit 1;
            v_fouten := v_fouten || 'anon leest toonbank_journaal; ';
        exception when insufficient_privilege then null;
        end;
        begin
            perform public.toonbank_apparaat_nieuw(v_org, 'anon', 'winkel', v_hash);
            v_fouten := v_fouten || 'anon maakt een tablet; ';
        exception when insufficient_privilege then null;
        end;

        raise exception 'rls_klaar';
    exception when raise_exception then
        if sqlerrm <> 'rls_klaar' then v_fouten := v_fouten || 'RLS-blok: ' || sqlerrm || '; '; end if;
    end;

    if v_fouten <> '' then raise exception 'FOUT: %', v_fouten; end if;
    raise exception 'GESLAAGD: tablets % en % (andere org T1), koppelcode 5 min, 5 foute pogingen = code vervallen, koppelen één keer, sleutel uniek; rol kassier geweigerd, goedkeuring alleen door eigenaar; inlogteller 4 = nog niet, 5 = 5 min geblokkeerd; journaal uniek op gebeurtenis (per org) en volgnummer, payload/soort/DELETE/TRUNCATE geweigerd (TB001), verwerking wel, organisatie met journaal niet te verwijderen; intrekken beëindigt sessies; volgnummer nooit omlaag; RLS: andere org ziet niets, geen hashes of sessies voor leden, anon niets; een Medewerker maakt, koppelt of trekt geen tablet in, leest kds_pin_hash niet en zet geen rol, inlogcode of blokkade (ook niet bij een nieuwe rij), gewone kolommen wel; een Admin wel — alles teruggedraaid', v_code1, v_code2;
end $$;
