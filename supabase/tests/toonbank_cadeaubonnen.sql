-- Test voor de cadeaubonnen (migratie 20261029120000_toonbank_cadeaubonnen,
-- contract toonbank/v1 1.2): opzoeken, reserveren, vrijgeven, afschrijven als
-- de bon binnenkomt, en het beheer. Draait in één transactie die aan het eind
-- wordt teruggedraaid.
--
-- ALLEEN op de dev-database, nooit op live en nooit met --linked:
--
--   npx supabase db query --db-url "$DEV_DB_URL" -o table -f supabase/tests/toonbank_cadeaubonnen.sql
--
-- Vereist de seed supabase/tests/seed_vier_naober.sql.
--
-- Bewijst onder meer: reserveren houdt vast (beschikbaar = saldo − lopende
-- reserveringen), is idempotent op reservering_id en weigert te weinig,
-- geblokkeerd en verlopen; vrijgeven twee keer kan geen kwaad; de bon schrijft
-- precies één keer af; een bon na een verlopen reservering wordt toch geboekt
-- en afgeschreven, en een saldo onder nul wordt Te controleren; een onbekende
-- code boekt de bon wel en schrijft niets af; mutaties zijn alleen toevoegen
-- en het saldo is altijd hun som.
--
-- Verwacht: "GESLAAGD: ..." als EXCEPTION.

create function pg_temp.cb_bon(p_gid uuid, p_volgnr bigint, p_bonnummer text, p_bedrag int, p_cadeaubon jsonb, p_extra jsonb default '{}')
returns jsonb language sql as $$
    -- Eén verkoopregel met open prijs (geen voorraad), een betaling met de
    -- cadeaubon en de rest met pin.
    select jsonb_build_object('soort', 'bon', 'gebeurtenis_id', p_gid, 'volgnummer', p_volgnr, 'moment', to_jsonb(now() - interval '1 minute'),
        'medewerker_id', null, 'bon_id', p_gid, 'bonnummer', p_bonnummer, 'bon_volgnummer', split_part(p_bonnummer, '-', 2)::int,
        'status', 'afgerond', 'kanaal', 'winkel', 'catalogus_versie', 1, 'leeftijd', null,
        'regels', jsonb_build_array(
            jsonb_build_object('regelnr', 1, 'soort', 'verkoop', 'artikel_id', null, 'open_prijs_groep', 'TEST', 'naam', 'TEST open prijs',
                'aantal', 1, 'stuk_cents', p_bedrag, 'korting_cents', 0, 'bedrag_cents', p_bedrag,
                'btw', jsonb_build_array(jsonb_build_object('pct', 9, 'incl_cents', p_bedrag)),
                'alcohol', false, 'onderdelen', '[]'::jsonb, 'prijs_bron', 'open_prijs'),
            jsonb_build_object('regelnr', 2, 'soort', 'betaling', 'betaalmethode', 'cadeaubon') || p_cadeaubon,
            jsonb_build_object('regelnr', 3, 'soort', 'betaling', 'betaalmethode', 'pin', 'betaal_bevestiging', 'handmatig',
                'bedrag_cents', p_bedrag - (p_cadeaubon->>'bedrag_cents')::int)),
        'totaal_cents', p_bedrag, 'afronding_cents', 0) || p_extra
$$;

-- Opslaan en de wachtrij van die tablet draaien; geeft de journaalregel.
create function pg_temp.cb_stuur(p_org uuid, p_app uuid, p_m jsonb)
returns public.toonbank_journaal language plpgsql as $$
declare
    v public.toonbank_journaal;
begin
    perform public.toonbank_journaal_opslaan(p_org, p_app, jsonb_build_array(p_m), '1.2.0');
    perform public.toonbank_verwerk_wachtrij(p_org, p_app);
    select * into v from public.toonbank_journaal where organization_id = p_org and gebeurtenis_id = (p_m->>'gebeurtenis_id')::uuid;
    return v;
end $$;

do $$
declare
    v_org     uuid;
    v_sfx     text := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
    v_hash    text := repeat('a', 32) || ':' || repeat('b', 128);
    v_app     uuid;
    v_code    text;
    v_cb      text;
    v_cb2     text;
    v_cb3     text;
    v_id      uuid;
    v_id2     uuid;
    v_id3     uuid;
    v_r       jsonb;
    v_j       public.toonbank_journaal%rowtype;
    v_bon     public.toonbank_bonnen%rowtype;
    v_vnr     bigint := 0;
    v_bnr     int := 0;
    v_r1      uuid := gen_random_uuid();
    v_r2      uuid := gen_random_uuid();
    v_r3      uuid := gen_random_uuid();
    v_r4      uuid := gen_random_uuid();
    v_r5      uuid := gen_random_uuid();
    v_r6      uuid := gen_random_uuid();
    v_b1      uuid := gen_random_uuid();
    v_b4      uuid := gen_random_uuid();
    v_b5      uuid := gen_random_uuid();
    v_b6      uuid := gen_random_uuid();
    v_b7      uuid := gen_random_uuid();
    v_n       int;
    v_fouten  text := '';
begin
    select id into v_org from public.organizations where slug = 'e2e-hop-en-bites';
    if v_org is null then
        raise exception 'GEWEIGERD: organisatie e2e-hop-en-bites bestaat niet. Deze test draait alleen op de dev-database, na supabase/tests/seed_vier_naober.sql.';
    end if;

    v_r := public.toonbank_apparaat_nieuw(v_org, 'TEST cadeaubon ' || v_sfx, 'winkel', v_hash);
    v_app := (v_r->>'apparaat_id')::uuid; v_code := v_r->>'code';
    v_cb := 'TEST-' || v_sfx || '-1'; v_cb2 := 'TEST-' || v_sfx || '-2'; v_cb3 := 'TEST-' || v_sfx || '-3';

    -- ── 0. Standaard staat cadeaubon_aan uit.
    if exists (select 1 from public.winkel_instellingen where organization_id = v_org and toonbank_cadeaubon_aan) then
        v_fouten := v_fouten || 'toonbank_cadeaubon_aan staat standaard aan; ';
    end if;

    -- ── 1. Uitgeven en opzoeken (ook met kleine letters en spaties).
    v_id := (public.cadeaubon_uitgeven(v_org, lower(v_cb), 2500, null, 'TEST notitie')->>'id')::uuid;
    v_id2 := (public.cadeaubon_uitgeven(v_org, v_cb2, 1000)->>'id')::uuid;
    v_id3 := (public.cadeaubon_uitgeven(v_org, v_cb3, 1000, ((now() at time zone 'Europe/Amsterdam')::date + 30))->>'id')::uuid;
    v_r := public.toonbank_cadeaubon_opzoeken(v_org, ' ' || lower(v_cb) || ' ');
    if v_r is distinct from jsonb_build_object('code', v_cb, 'status', 'actief', 'saldo_cents', 2500, 'gereserveerd_cents', 0,
                                               'beschikbaar_cents', 2500, 'waarde_cents', 2500, 'geldig_tot', null) then
        v_fouten := v_fouten || 'opzoeken na uitgeven: ' || coalesce(v_r::text, 'null') || '; ';
    end if;
    if public.toonbank_cadeaubon_opzoeken(v_org, 'TEST-BESTAAT-NIET') is not null then
        v_fouten := v_fouten || 'onbekende code gaf iets terug; ';
    end if;
    begin
        perform public.cadeaubon_uitgeven(v_org, v_cb, 500);
        v_fouten := v_fouten || 'dezelfde code twee keer uitgegeven; ';
    exception when unique_violation then null;
    end;

    -- ── 2. Reserveren: vasthouden, idempotent, te weinig, onbekend.
    v_r := public.toonbank_cadeaubon_reserveren(v_org, v_app, v_cb, v_r1, v_b1, 1000);
    if not (v_r->>'ok')::boolean or (v_r->>'beschikbaar_na_cents')::int <> 1500 or (v_r->>'verloopt_at')::timestamptz <> now() + interval '15 minutes' then
        v_fouten := v_fouten || 'reserveren 1000: ' || v_r::text || '; ';
    end if;
    v_r := public.toonbank_cadeaubon_reserveren(v_org, v_app, v_cb, v_r1, v_b1, 1000);
    select count(*) into v_n from public.cadeaubon_mutaties where cadeaubon_id = v_id and soort = 'reservering';
    if not (v_r->>'ok')::boolean or v_n <> 1 then
        v_fouten := v_fouten || 'reserveren twee keer is niet idempotent (' || v_n || '): ' || v_r::text || '; ';
    end if;
    v_r := public.toonbank_cadeaubon_reserveren(v_org, v_app, v_cb, v_r1, v_b1, 900);
    if v_r->>'fout' is distinct from 'reservering_anders' then
        v_fouten := v_fouten || 'zelfde reservering_id, ander bedrag: ' || v_r::text || '; ';
    end if;
    v_r := public.toonbank_cadeaubon_reserveren(v_org, v_app, v_cb, v_r2, v_b4, 2000);
    if v_r->>'fout' is distinct from 'cadeaubon_saldo_te_laag' or (v_r->>'beschikbaar_cents')::int <> 1500 then
        v_fouten := v_fouten || 'te weinig saldo: ' || v_r::text || '; ';
    end if;
    v_r := public.toonbank_cadeaubon_reserveren(v_org, v_app, 'TEST-BESTAAT-NIET', v_r2, v_b4, 100);
    if v_r->>'fout' is distinct from 'cadeaubon_onbekend' then
        v_fouten := v_fouten || 'onbekend reserveren: ' || v_r::text || '; ';
    end if;
    v_r := public.toonbank_cadeaubon_opzoeken(v_org, v_cb);
    if (v_r->>'gereserveerd_cents')::int <> 1000 or (v_r->>'beschikbaar_cents')::int <> 1500 or (v_r->>'saldo_cents')::int <> 2500 then
        v_fouten := v_fouten || 'opzoeken met reservering: ' || v_r::text || '; ';
    end if;

    -- ── 3. Vrijgeven: twee keer kan geen kwaad; een onbekende reservering is onwaar.
    v_r := public.toonbank_cadeaubon_reserveren(v_org, v_app, v_cb, v_r3, v_b4, 500);
    v_r := public.toonbank_cadeaubon_vrijgeven(v_org, v_app, v_cb, v_r3);
    if not (v_r->>'vrijgegeven')::boolean or (v_r->>'beschikbaar_cents')::int <> 1500 then
        v_fouten := v_fouten || 'vrijgeven: ' || v_r::text || '; ';
    end if;
    v_r := public.toonbank_cadeaubon_vrijgeven(v_org, v_app, v_cb, v_r3);
    if (v_r->>'vrijgegeven')::boolean or not (v_r->>'ok')::boolean then
        v_fouten := v_fouten || 'twee keer vrijgeven: ' || v_r::text || '; ';
    end if;
    v_r := public.toonbank_cadeaubon_vrijgeven(v_org, v_app, v_cb, gen_random_uuid());
    if (v_r->>'vrijgegeven')::boolean then
        v_fouten := v_fouten || 'onbekende reservering vrijgegeven; ';
    end if;

    -- ── 4. De bon komt binnen: afschrijven, precies één keer.
    v_vnr := v_vnr + 1; v_bnr := v_bnr + 1;
    v_j := pg_temp.cb_stuur(v_org, v_app, pg_temp.cb_bon(v_b1, v_vnr, v_code || '-' || lpad(v_bnr::text, 6, '0'), 1415,
        jsonb_build_object('bedrag_cents', 1000, 'cadeaubon_code', v_cb, 'reservering_id', v_r1)));
    select * into v_bon from public.toonbank_bonnen where id = v_b1;
    if v_j.verwerk_status <> 'verwerkt' or v_bon.cadeaubon_cents <> 1000 or v_bon.pin_cents <> 415 or v_bon.contant_cents <> 0 then
        v_fouten := v_fouten || 'bon met cadeaubon: ' || row_to_json(v_j)::text || ' / ' || coalesce(row_to_json(v_bon)::text, 'geen bon') || '; ';
    end if;
    if not exists (select 1 from public.toonbank_bon_regels where bon_id = v_b1 and regelnr = 2 and betaalmethode = 'cadeaubon'
                     and naam = 'Cadeaubon' and cadeaubon_code = v_cb and reservering_id = v_r1 and voorraad_status = 'nvt') then
        v_fouten := v_fouten || 'betaalregel cadeaubon niet zoals verwacht; ';
    end if;
    if (select saldo_cents from public.cadeaubonnen where id = v_id) <> 1500
       or (select status from public.cadeaubon_reserveringen where organization_id = v_org and reservering_id = v_r1) <> 'gebruikt' then
        v_fouten := v_fouten || 'na de bon: saldo of reservering klopt niet; ';
    end if;
    perform public.toonbank_journaal_opslaan(v_org, v_app, jsonb_build_array(pg_temp.cb_bon(v_b1, v_vnr, v_code || '-' || lpad(v_bnr::text, 6, '0'), 1415,
        jsonb_build_object('bedrag_cents', 1000, 'cadeaubon_code', v_cb, 'reservering_id', v_r1))), '1.2.0');
    perform public.toonbank_verwerk_wachtrij(v_org, v_app);
    select count(*) into v_n from public.cadeaubon_mutaties where cadeaubon_id = v_id and soort = 'afschrijving';
    if v_n <> 1 or (select saldo_cents from public.cadeaubonnen where id = v_id) <> 1500 then
        v_fouten := v_fouten || 'dezelfde bon twee keer schreef ' || v_n || ' keer af; ';
    end if;

    -- ── 5. Een reservering die verliep: een ander reserveert het saldo, de late bon wordt toch afgeschreven.
    v_r := public.toonbank_cadeaubon_reserveren(v_org, v_app, v_cb, v_r4, v_b4, 1500);
    update public.cadeaubon_reserveringen set verloopt_at = now() - interval '1 minute' where organization_id = v_org and reservering_id = v_r4;
    v_r := public.toonbank_cadeaubon_reserveren(v_org, v_app, v_cb, v_r5, v_b5, 1500);
    if not (v_r->>'ok')::boolean then
        v_fouten := v_fouten || 'na een verlopen reservering kon er niet opnieuw gereserveerd worden: ' || v_r::text || '; ';
    end if;
    v_vnr := v_vnr + 1; v_bnr := v_bnr + 1;
    v_j := pg_temp.cb_stuur(v_org, v_app, pg_temp.cb_bon(v_b5, v_vnr, v_code || '-' || lpad(v_bnr::text, 6, '0'), 1500,
        jsonb_build_object('bedrag_cents', 1500, 'cadeaubon_code', v_cb, 'reservering_id', v_r5)));
    if v_j.verwerk_status <> 'verwerkt' or (select saldo_cents from public.cadeaubonnen where id = v_id) <> 0 then
        v_fouten := v_fouten || 'bon 5: ' || row_to_json(v_j)::text || '; ';
    end if;
    v_vnr := v_vnr + 1; v_bnr := v_bnr + 1;
    v_j := pg_temp.cb_stuur(v_org, v_app, pg_temp.cb_bon(v_b4, v_vnr, v_code || '-' || lpad(v_bnr::text, 6, '0'), 1500,
        jsonb_build_object('bedrag_cents', 1500, 'cadeaubon_code', v_cb, 'reservering_id', v_r4)));
    if v_j.verwerk_status <> 'conflict' or v_j.fout_code <> 'cadeaubon_saldo_negatief' or v_j.fout_melding not like '%onder nul%'
       or not exists (select 1 from public.toonbank_bonnen where id = v_b4)
       or (select saldo_cents from public.cadeaubonnen where id = v_id) <> -1500 then
        v_fouten := v_fouten || 'late bon na verlopen reservering: ' || row_to_json(v_j)::text || '; ';
    end if;
    v_r := public.toonbank_cadeaubon_opzoeken(v_org, v_cb);
    if v_r->>'status' <> 'leeg' or (v_r->>'saldo_cents')::int <> 0 or (v_r->>'beschikbaar_cents')::int <> 0 then
        v_fouten := v_fouten || 'opzoeken onder nul: ' || v_r::text || '; ';
    end if;

    -- ── 6. Een onbekende code op de bon: de bon wel, niets afgeschreven.
    v_vnr := v_vnr + 1; v_bnr := v_bnr + 1;
    v_j := pg_temp.cb_stuur(v_org, v_app, pg_temp.cb_bon(v_b6, v_vnr, v_code || '-' || lpad(v_bnr::text, 6, '0'), 800,
        jsonb_build_object('bedrag_cents', 500, 'cadeaubon_code', 'TEST-BESTAAT-NIET', 'reservering_id', v_r6)));
    if v_j.verwerk_status <> 'conflict' or v_j.fout_code <> 'cadeaubon_onbekend' or not exists (select 1 from public.toonbank_bonnen where id = v_b6)
       or exists (select 1 from public.cadeaubon_mutaties where bon_id = v_b6) then
        v_fouten := v_fouten || 'onbekende code op de bon: ' || row_to_json(v_j)::text || '; ';
    end if;

    -- ── 7. Geblokkeerd en verlopen: reserveren weigert; een bon wordt toch afgeschreven (controle).
    v_r := public.toonbank_cadeaubon_reserveren(v_org, v_app, v_cb2, v_r6, v_b7, 400);
    perform public.cadeaubon_blokkeren(v_org, v_id2, true, 'TEST verloren');
    if public.toonbank_cadeaubon_reserveren(v_org, v_app, v_cb2, gen_random_uuid(), v_b7, 100)->>'fout' is distinct from 'cadeaubon_geblokkeerd'
       or public.toonbank_cadeaubon_opzoeken(v_org, v_cb2)->>'status' <> 'geblokkeerd'
       or (public.toonbank_cadeaubon_opzoeken(v_org, v_cb2)->>'beschikbaar_cents')::int <> 0 then
        v_fouten := v_fouten || 'geblokkeerd; ';
    end if;
    v_vnr := v_vnr + 1; v_bnr := v_bnr + 1;
    v_j := pg_temp.cb_stuur(v_org, v_app, pg_temp.cb_bon(v_b7, v_vnr, v_code || '-' || lpad(v_bnr::text, 6, '0'), 400,
        jsonb_build_object('bedrag_cents', 400, 'cadeaubon_code', v_cb2, 'reservering_id', v_r6)));
    if v_j.verwerk_status <> 'conflict' or v_j.fout_code <> 'cadeaubon_geblokkeerd' or (select saldo_cents from public.cadeaubonnen where id = v_id2) <> 600 then
        v_fouten := v_fouten || 'bon op een geblokkeerde cadeaubon: ' || row_to_json(v_j)::text || '; ';
    end if;
    update public.cadeaubonnen set geldig_tot = (now() at time zone 'Europe/Amsterdam')::date - 1 where id = v_id3;
    if public.toonbank_cadeaubon_reserveren(v_org, v_app, v_cb3, gen_random_uuid(), v_b7, 100)->>'fout' is distinct from 'cadeaubon_verlopen'
       or public.toonbank_cadeaubon_opzoeken(v_org, v_cb3)->>'status' <> 'verlopen' then
        v_fouten := v_fouten || 'verlopen; ';
    end if;

    -- ── 8. Corrigeren met reden; zonder reden niet.
    v_r := public.cadeaubon_corrigeren(v_org, v_id, 1500, 'TEST late bon rechtgezet');
    if (v_r->>'saldo_cents')::int <> 0 then
        v_fouten := v_fouten || 'corrigeren: ' || v_r::text || '; ';
    end if;
    begin
        perform public.cadeaubon_corrigeren(v_org, v_id, 100, ' ');
        v_fouten := v_fouten || 'corrigeren zonder reden kon; ';
    exception when sqlstate '22023' then null;
    end;

    -- ── 9. Mutaties alleen toevoegen; het saldo is altijd hun som.
    begin
        update public.cadeaubon_mutaties set notitie = 'x' where cadeaubon_id = v_id;
        v_fouten := v_fouten || 'mutatie te wijzigen; ';
    exception when sqlstate 'TB003' then null;
    end;
    begin
        delete from public.cadeaubon_mutaties where cadeaubon_id = v_id;
        v_fouten := v_fouten || 'mutatie te verwijderen; ';
    exception when sqlstate 'TB003' then null;
    end;
    begin
        update public.cadeaubonnen set saldo_cents = 99999 where id = v_id;
        set constraints trg_cadeaubon_saldo_klopt immediate;
        v_fouten := v_fouten || 'saldo zonder mutatie te wijzigen; ';
    exception when sqlstate 'TB003' then null;
    end;
    set constraints trg_cadeaubon_saldo_klopt deferred;
    if (select saldo_cents from public.cadeaubonnen where id = v_id)
       <> (select sum(saldo_wijziging_cents) from public.cadeaubon_mutaties where cadeaubon_id = v_id) then
        v_fouten := v_fouten || 'saldo is niet de som van de mutaties; ';
    end if;

    -- ── 10. Rechten.
    if has_table_privilege('anon', 'public.cadeaubonnen', 'SELECT') or has_table_privilege('authenticated', 'public.cadeaubonnen', 'UPDATE')
       or has_table_privilege('authenticated', 'public.cadeaubon_mutaties', 'INSERT')
       or has_function_privilege('authenticated', 'public.toonbank_cadeaubon_reserveren(uuid, uuid, text, uuid, uuid, integer, uuid)', 'EXECUTE')
       or has_function_privilege('anon', 'public.cadeaubon_uitgeven(uuid, text, integer, date, text, uuid)', 'EXECUTE') then
        v_fouten := v_fouten || 'rechten kloppen niet; ';
    end if;

    if v_fouten <> '' then raise exception 'FOUT: %', v_fouten; end if;
    raise exception 'GESLAAGD: uitgeven en opzoeken (code genormaliseerd, dubbel = 23505); reserveren houdt vast, idempotent, te weinig / onbekend / geblokkeerd / verlopen geweigerd; vrijgeven twee keer kan geen kwaad; de bon schrijft precies één keer af (cadeaubon_cents, regel Cadeaubon); een bon na een verlopen reservering toch afgeschreven en saldo onder nul = Te controleren; onbekende code = bon geboekt, niets afgeschreven; geblokkeerd = toch afgeschreven met controle; corrigeren met reden; mutaties alleen toevoegen (TB003), saldo altijd hun som — alles teruggedraaid';
end $$;
