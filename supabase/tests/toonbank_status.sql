-- Test voor BA-7b (migratie 20261006140000_toonbank_status): de instellingen
-- voor de Toonbank en toonbank_status (GET /api/toonbank/v1/status). Draait in
-- één transactie die aan het eind wordt teruggedraaid.
--
-- ALLEEN op de dev-database, nooit op live en nooit met --linked:
--
--   npx supabase db query --db-url "$DEV_DB_URL" -o table -f supabase/tests/toonbank_status.sql
--
-- of lokaal: npm --prefix tools/testdb run test -- toonbank_status
-- Vereist de seed supabase/tests/seed_vier_naober.sql.
--
-- Verwacht: "GESLAAGD: ..." als EXCEPTION.

do $$
declare
    v_org      uuid;
    v_ander    uuid;
    v_suffix   text := substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);
    v_hash     text := repeat('a', 32) || ':' || repeat('b', 128);
    v_app      uuid;
    v_app_x    uuid;
    v_prod     uuid;
    v_art      uuid;
    v_moment   uuid;
    v_o        public.winkel_orders%rowtype;
    v_s        jsonb;
    v_s2       jsonb;
    v_open0    int;
    v_verwacht bigint;
    v_fouten   text := '';
begin
    select id into v_org from public.organizations where slug = 'e2e-hop-en-bites';
    if v_org is null then
        raise exception 'GEWEIGERD: organisatie e2e-hop-en-bites bestaat niet. Deze test draait alleen op de dev-database, na supabase/tests/seed_vier_naober.sql.';
    end if;
    insert into public.organizations (name, slug) values ('Test ander ' || v_suffix, 'test-ander-' || v_suffix) returning id into v_ander;

    v_app := (public.toonbank_apparaat_nieuw(v_org, 'TEST status ' || v_suffix, 'winkel', v_hash)->>'apparaat_id')::uuid;
    v_app_x := (public.toonbank_apparaat_nieuw(v_ander, 'TEST ander', 'winkel', v_hash)->>'apparaat_id')::uuid;

    -- ── 1. Standaardinstellingen en de vorm van het antwoord.
    v_s := public.toonbank_status(v_org, v_app, 12, '0.1.0', '1.1.0');
    if not (v_s ?& array['servertijd', 'apparaat', 'catalogus_versie', 'voorraad_versie', 'vrij_verloopt_at', 'afhaallijst_versie',
                        'wegzetten_open', 'wegzetten_binnen_24u', 'hoogste_volgnummer_gemeld', 'bevestigd_tot_volgnummer',
                        'hoogste_bon_volgnummer', 'instellingen', 'te_controleren']) then
        v_fouten := v_fouten || 'velden ontbreken: ' || v_s::text || '; ';
    end if;
    if (v_s->'apparaat'->>'apparaat_id')::uuid <> v_app or v_s->'apparaat'->>'code' !~ '^T[0-9]+$' then
        v_fouten := v_fouten || 'apparaat: ' || (v_s->'apparaat')::text || '; ';
    end if;
    -- De instellingen zijn die van winkel_instellingen (de seed zet alcohol aan voor e2e).
    if v_s->'instellingen' <> (select jsonb_build_object('alcohol_toegestaan', toonbank_alcohol_toegestaan, 'contant_aan', toonbank_contant_aan,
                                                         'contant_limiet_cents', toonbank_contant_limiet_cents, 'beschikbaar_grens', beschikbaar_grens)
                                 from public.winkel_instellingen where organization_id = v_org) then
        v_fouten := v_fouten || 'instellingen: ' || (v_s->'instellingen')::text || '; ';
    end if;
    -- De standaard bij een nieuwe winkel: alcohol uit, contant aan, € 3.000.
    insert into public.winkel_instellingen (organization_id) values (v_ander);
    v_s2 := public.toonbank_status(v_ander, v_app_x);
    if v_s2->'instellingen' <> jsonb_build_object('alcohol_toegestaan', false, 'contant_aan', true, 'contant_limiet_cents', 300000,
                                                  'beschikbaar_grens', (select beschikbaar_grens from public.winkel_instellingen where organization_id = v_ander)) then
        v_fouten := v_fouten || 'standaardinstellingen: ' || (v_s2->'instellingen')::text || '; ';
    end if;
    if (v_s->>'catalogus_versie')::bigint is distinct from coalesce((select versie from public.winkel_catalogus_versie where organization_id = v_org), 0)
       or (v_s->>'voorraad_versie')::bigint is distinct from (public.winkel_voorraad_stand(v_org)->>'versie')::bigint then
        v_fouten := v_fouten || 'versies kloppen niet: ' || v_s::text || '; ';
    end if;
    if (v_s->>'hoogste_volgnummer_gemeld')::bigint <> 12 then v_fouten := v_fouten || 'volgnummer niet vastgelegd; '; end if;
    v_open0 := (v_s->>'wegzetten_open')::int;

    -- Het volgnummer gaat nooit omlaag; app-versie blijft als er geen nieuwe komt.
    v_s := public.toonbank_status(v_org, v_app, 3, null, null);
    if (v_s->>'hoogste_volgnummer_gemeld')::bigint <> 12 then v_fouten := v_fouten || 'volgnummer ging omlaag; '; end if;
    if (select app_versie from public.toonbank_apparaten where id = v_app) <> '0.1.0' then v_fouten := v_fouten || 'app_versie gewist; '; end if;

    -- ── 2. Instellingen: limiet nooit boven € 3.000.
    begin
        update public.winkel_instellingen set toonbank_contant_limiet_cents = 300001 where organization_id = v_org;
        v_fouten := v_fouten || 'contantlimiet boven 300000 toegestaan; ';
    exception when check_violation then null;
    end;
    update public.winkel_instellingen
       set toonbank_alcohol_toegestaan = true, toonbank_contant_aan = false, toonbank_contant_limiet_cents = 100000
     where organization_id = v_org;
    v_s := public.toonbank_status(v_org, v_app);
    if v_s->'instellingen'->>'alcohol_toegestaan' <> 'true' or v_s->'instellingen'->>'contant_aan' <> 'false'
       or (v_s->'instellingen'->>'contant_limiet_cents')::int <> 100000 then
        v_fouten := v_fouten || 'gewijzigde instellingen: ' || (v_s->'instellingen')::text || '; ';
    end if;

    -- ── 3. Badge: een betaalde order met losse winkelwaar telt mee.
    insert into public.winkel_producten (organization_id, naam, type, eenheid, prijs_per)
    values (v_org, 'TEST status bier', 'bier', 'stuk', 1) returning id into v_prod;
    perform public.winkel_muteer_voorraad(v_org, v_prod, 'telling', 6);
    insert into public.winkel_artikelen (organization_id, slug, naam, actief, afhandeling)
    values (v_org, 'test-status-' || v_suffix, 'TEST status bier', true, 'wegzetten') returning id into v_art;
    insert into public.winkel_momenten (organization_id, groep, datum, van, tot, capaciteit, actief)
    values (v_org, 'test-status', (now() at time zone 'Europe/Amsterdam')::date, '23:30', '23:59', null, true) returning id into v_moment;
    v_o := public.winkel_plaats_order(v_org, 'test-sleutel-' || gen_random_uuid(), 'test-token-' || gen_random_uuid(), 'afhalen', v_moment,
        'Jansen', 'test@example.invalid', null, null, null, 690, 0, 690, '{}'::jsonb, 'https://example.invalid',
        jsonb_build_array(jsonb_build_object(
            'artikel_id', v_art, 'slug', 'test-status', 'naam', 'TEST status bier', 'aantal', 2, 'eenheid', 'per stuk',
            'stuk_cents', 345, 'bedrag_cents', 690, 'btw_pct', 21, 'eenheden', 1, 'voorraad_eenheden', 0,
            'componenten', jsonb_build_array(jsonb_build_object('product_id', v_prod, 'slot_type', 'bier', 'naam', 'TEST', 'hoeveelheid', 2, 'eenheid', 'stuk')))));
    update public.winkel_orders set status = 'betaald', betaald_at = now() where id = v_o.id;
    v_s := public.toonbank_status(v_org, v_app);
    if (v_s->>'wegzetten_open')::int <> v_open0 + 1 or (v_s->>'wegzetten_binnen_24u')::int < 1 then
        v_fouten := v_fouten || format('badge %s/%s i.p.v. %s+1 en ≥ 1 binnen 24 uur; ', v_s->>'wegzetten_open', v_s->>'wegzetten_binnen_24u', v_open0);
    end if;

    -- ── 4. Afhaallijstversie = het laatste moment (ms) van order, doos of voorraadteller.
    set constraints all immediate;   -- de voorraadteller (deferred) gaat nu af
    v_s := public.toonbank_status(v_org, v_app);
    select floor(extract(epoch from greatest(
               (select max(updated_at) from public.winkel_orders where organization_id = v_org),
               (select max(opgehaald_at) from public.winkel_dozen where organization_id = v_org),
               (select gewijzigd_at from public.winkel_voorraad_versie where organization_id = v_org))) * 1000)::bigint
      into v_verwacht;
    if (v_s->>'afhaallijst_versie')::bigint is distinct from v_verwacht or v_verwacht <= 0 then
        v_fouten := v_fouten || format('afhaallijst_versie %s i.p.v. %s; ', v_s->>'afhaallijst_versie', v_verwacht);
    end if;

    -- ── 5. Te controleren en het hoogste bonnummer, alleen van dit apparaat.
    insert into public.toonbank_journaal (organization_id, apparaat_id, gebeurtenis_id, volgnummer, soort, payload, verwerk_status) values
        (v_org, v_app, gen_random_uuid(), 1, 'bon', '{"bon_volgnummer": 411}', 'verwerkt'),
        (v_org, v_app, gen_random_uuid(), 2, 'bon', '{"bon_volgnummer": 412}', 'fout'),
        (v_org, v_app, gen_random_uuid(), 3, 'tegenbon', '{"bon_volgnummer": 413}', 'conflict'),
        (v_org, v_app, gen_random_uuid(), 4, 'pinpoging', '{"bon_volgnummer": 999}', 'niet_nodig'),
        (v_ander, v_app_x, gen_random_uuid(), 1, 'bon', '{"bon_volgnummer": 5000}', 'fout');
    v_s := public.toonbank_status(v_org, v_app);
    if (v_s->>'te_controleren')::int <> 2 then v_fouten := v_fouten || 'te_controleren ' || (v_s->>'te_controleren') || ' i.p.v. 2; '; end if;
    if (v_s->>'hoogste_bon_volgnummer')::bigint <> 413 then v_fouten := v_fouten || 'hoogste_bon_volgnummer ' || (v_s->>'hoogste_bon_volgnummer') || ' i.p.v. 413; '; end if;

    -- ── 6. Een tablet van een andere organisatie of een ingetrokken tablet: P0002.
    begin
        perform public.toonbank_status(v_org, v_app_x);
        v_fouten := v_fouten || 'status van een tablet van een andere organisatie; ';
    exception when no_data_found then null;
    end;
    perform public.toonbank_apparaat_intrekken(v_org, v_app, 'test');
    begin
        perform public.toonbank_status(v_org, v_app);
        v_fouten := v_fouten || 'status van een ingetrokken tablet; ';
    exception when no_data_found then null;
    end;

    -- ── 7. Rechten: alleen service_role.
    if has_function_privilege('anon', 'public.toonbank_status(uuid, uuid, bigint, text, text)', 'EXECUTE')
       or has_function_privilege('authenticated', 'public.toonbank_status(uuid, uuid, bigint, text, text)', 'EXECUTE') then
        v_fouten := v_fouten || 'toonbank_status voor anon of authenticated; ';
    end if;
    if not has_function_privilege('service_role', 'public.toonbank_status(uuid, uuid, bigint, text, text)', 'EXECUTE') then
        v_fouten := v_fouten || 'service_role mist toonbank_status; ';
    end if;

    if v_fouten <> '' then raise exception 'FOUT: %', v_fouten; end if;
    raise exception 'GESLAAGD: status met alle velden, standaard alcohol uit / contant aan / € 3.000 (hoger geweigerd), volgnummer nooit omlaag, badge +1 voor een betaalde wegzet-order, afhaallijstversie = laatste wijziging in ms, te controleren 2 en hoogste bon 413 alleen van dit apparaat, andere org en ingetrokken P0002, alleen service_role — alles teruggedraaid';
end $$;
