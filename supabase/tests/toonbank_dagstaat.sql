-- Test voor BA-10 (migratie 20261007130000_toonbank_afhalen_dagstaten): de
-- dagstaat. De herberekende dagstaat is de som van de bonnen (bon-btw per
-- tarief opgeteld, nooit opnieuw afgerond), een restbetaling via een bon telt
-- niet (dubbel) als omzet, verschillen gaan naar Te controleren, een late bon
-- vult aan, goedkeuren, GET dagstaat, en de dagstaat is vast. Draait in één
-- transactie die aan het eind wordt teruggedraaid.
--
-- ALLEEN op de dev-database, nooit op live en nooit met --linked:
--
--   npx supabase db query --db-url "$DEV_DB_URL" -o table -f supabase/tests/toonbank_dagstaat.sql
--
-- of lokaal: npm --prefix tools/testdb run test -- toonbank_dagstaat
-- Vereist de seed supabase/tests/seed_vier_naober.sql.
--
-- Verwacht: "GESLAAGD: ..." als EXCEPTION.

create function pg_temp.ond(p_product uuid)
returns jsonb language sql as $$
    select jsonb_build_array(jsonb_build_object('product_id', p_product, 'hoeveelheid', 1, 'eenheid', 'stuk'))
$$;

create function pg_temp.tb_regel(p_nr int, p_aantal int, p_stuk int, p_pct int, p_onderdelen jsonb, p_extra jsonb default '{}')
returns jsonb language sql as $$
    select jsonb_build_object('regelnr', p_nr, 'soort', 'verkoop', 'artikel_id', null, 'naam', 'TEST', 'aantal', p_aantal,
        'stuk_cents', p_stuk, 'korting_cents', 0, 'bedrag_cents', p_aantal * p_stuk,
        'btw', jsonb_build_array(jsonb_build_object('pct', p_pct, 'incl_cents', p_aantal * p_stuk)),
        'alcohol', false, 'onderdelen', p_onderdelen, 'prijs_bron', 'catalogus') || p_extra
$$;

-- Een bon met een betaalregel (pin of contant) voor het totaal van de regels.
create function pg_temp.tb_bon(p_soort text, p_gid uuid, p_volgnr bigint, p_bonnummer text, p_moment text, p_methode text, p_regels jsonb, p_extra jsonb default '{}')
returns jsonb language sql as $$
    select jsonb_build_object('soort', p_soort, 'gebeurtenis_id', p_gid, 'volgnummer', p_volgnr, 'moment', p_moment,
        'medewerker_id', null, 'bon_id', p_gid, 'bonnummer', p_bonnummer, 'bon_volgnummer', split_part(p_bonnummer, '-', 2)::int,
        'status', 'afgerond', 'kanaal', 'winkel', 'catalogus_versie', 1, 'leeftijd', null,
        'regels', p_regels || jsonb_build_array(jsonb_build_object('regelnr', 99, 'soort', 'betaling', 'betaalmethode', p_methode,
            'bedrag_cents', (select coalesce(sum((r->>'bedrag_cents')::int), 0) from jsonb_array_elements(p_regels) r))),
        'totaal_cents', (select coalesce(sum((r->>'bedrag_cents')::int), 0) from jsonb_array_elements(p_regels) r),
        'afronding_cents', 0) || p_extra
$$;

create function pg_temp.tb_stuur(p_org uuid, p_app uuid, p_m jsonb)
returns public.toonbank_journaal language plpgsql as $$
declare
    v public.toonbank_journaal;
begin
    perform public.toonbank_journaal_opslaan(p_org, p_app, jsonb_build_array(p_m), '1.1.0');
    perform public.toonbank_verwerk_wachtrij(p_org, p_app);
    select * into v from public.toonbank_journaal where organization_id = p_org and gebeurtenis_id = (p_m->>'gebeurtenis_id')::uuid;
    return v;
end $$;

-- Een dagstaat-melding zoals de tablet hem maakt; de getallen komen mee.
create function pg_temp.tb_dagstaat(p_gid uuid, p_volgnr bigint, p_nr int, p_eerste text, p_laatste text, p_getallen jsonb)
returns jsonb language sql as $$
    select jsonb_build_object('soort', 'dagstaat', 'gebeurtenis_id', p_gid, 'volgnummer', p_volgnr, 'moment', '2026-03-06T18:05:00+01:00',
        'medewerker_id', null, 'dagstaat_id', p_gid, 'dagstaatnummer', p_nr, 'bedrijfsdag', '2026-03-06',
        'geopend_at', '2026-03-06T09:55:00+01:00', 'gesloten_at', '2026-03-06T18:05:00+01:00',
        'eerste_bonnummer', p_eerste, 'laatste_bonnummer', p_laatste,
        'aantal_bonnen', 0, 'aantal_tegenbonnen', 0, 'aantal_geannuleerd', 0, 'omzet', '[]'::jsonb,
        'statiegeld_cents', 0, 'order_rest_cents', 0, 'tegenbonnen_cents', 0, 'korting_cents', 0, 'afronding_cents', 0,
        'pin_toonbank_cents', 0, 'pin_mypos_app_cents', 0, 'pin_verschil_cents', 0, 'pin_verschil_reden', null,
        'contant_begin_cents', 10000, 'contant_verwacht_cents', 10000, 'contant_geteld_cents', 10000, 'contant_telling', null,
        'contant_verschil_cents', 0, 'contant_verschil_reden', null, 'afgeroomd_cents', 0, 'verzendbak_leeg', true) || p_getallen
$$;

do $$
declare
    v_org      uuid;
    v_sfx      text := substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);
    v_hash     text := repeat('a', 32) || ':' || repeat('b', 128);
    v_app      uuid;
    v_code     text;
    v_app2     uuid;
    v_code2    text;
    v_bier     uuid;
    v_worst    uuid;
    v_art      uuid;
    v_o        public.winkel_orders%rowtype;
    v_order    bigint;
    v_mw       uuid;
    v_b1       uuid := gen_random_uuid();
    v_b2       uuid := gen_random_uuid();
    v_b3       uuid := gen_random_uuid();
    v_b4       uuid := gen_random_uuid();
    v_t1       uuid := gen_random_uuid();
    v_g1       uuid := gen_random_uuid();
    v_rb       uuid := gen_random_uuid();
    v_laat     uuid := gen_random_uuid();
    v_na       uuid := gen_random_uuid();
    v_d1       uuid := gen_random_uuid();
    v_x1       uuid := gen_random_uuid();
    v_d2       uuid := gen_random_uuid();
    v_app3     uuid;
    v_code3    text;
    v_b5       uuid := gen_random_uuid();
    v_t5       uuid := gen_random_uuid();
    v_d3       uuid := gen_random_uuid();
    v_app4     uuid;
    v_code4    text;
    v_app5     uuid;
    v_code5    text;
    v_c1       uuid := gen_random_uuid();
    v_c2       uuid := gen_random_uuid();
    v_c3       uuid := gen_random_uuid();
    v_c4       uuid := gen_random_uuid();
    v_c5       uuid := gen_random_uuid();
    v_d4       uuid := gen_random_uuid();
    v_app6     uuid;
    v_code6    text;
    v_e1       uuid := gen_random_uuid();
    v_e2       uuid := gen_random_uuid();
    v_d6       uuid := gen_random_uuid();
    v_d5       uuid := gen_random_uuid();
    v_k1       uuid := gen_random_uuid();
    v_laat2    uuid := gen_random_uuid();
    v_user     uuid := gen_random_uuid();
    v_getallen jsonb;
    v_j        public.toonbank_journaal%rowtype;
    v_d        public.toonbank_dagstaten%rowtype;
    v_r        jsonb;
    v_som      jsonb;
    v_fouten   text := '';
begin
    select id into v_org from public.organizations where slug = 'e2e-hop-en-bites';
    if v_org is null then
        raise exception 'GEWEIGERD: organisatie e2e-hop-en-bites bestaat niet. Deze test draait alleen op de dev-database, na supabase/tests/seed_vier_naober.sql.';
    end if;

    v_r := public.toonbank_apparaat_nieuw(v_org, 'TEST dagstaat ' || v_sfx, 'winkel', v_hash);
    v_app := (v_r->>'apparaat_id')::uuid; v_code := v_r->>'code';
    v_r := public.toonbank_apparaat_nieuw(v_org, 'TEST dagstaat 2 ' || v_sfx, 'winkel', v_hash);
    v_app2 := (v_r->>'apparaat_id')::uuid; v_code2 := v_r->>'code';
    insert into public.personeel (organization_id, naam, toonbank_rol) values (v_org, 'TEST Sanne', 'medewerker') returning id into v_mw;
    insert into public.winkel_producten (organization_id, naam, type, eenheid, prijs_per, btw_pct)
    values (v_org, 'TEST dagbier ' || v_sfx, 'bier', 'stuk', 1, 21) returning id into v_bier;
    insert into public.winkel_producten (organization_id, naam, type, eenheid, prijs_per, btw_pct)
    values (v_org, 'TEST dagworst ' || v_sfx, 'worst', 'stuk', 1, 9) returning id into v_worst;
    -- Geteld vóór de bonnen (een bon van vóór de laatste telling boekt niets: review M2 klein 3).
    perform public.winkel_muteer_voorraad(v_org, v_bier, 'telling', 50, p_gebeurd_at => '2026-03-01T08:00:00+01:00');
    perform public.winkel_muteer_voorraad(v_org, v_worst, 'telling', 50, p_gebeurd_at => '2026-03-01T08:00:00+01:00');

    -- Een webshoporder met een open rest van 450, die aan de Toonbank betaald wordt.
    insert into public.winkel_artikelen (organization_id, slug, naam, actief) values (v_org, 'test-dag-' || v_sfx, 'TEST pakket', true) returning id into v_art;
    v_o := public.winkel_plaats_order(v_org, 'test-sleutel-' || gen_random_uuid(), 'test-token-' || gen_random_uuid(), 'afhalen', null,
        'Jansen', 'j@example.invalid', null, null, null, 700, 0, 700, '{}'::jsonb, 'https://example.invalid',
        jsonb_build_array(jsonb_build_object('artikel_id', v_art, 'slug', 'test-dag', 'naam', 'TEST pakket', 'aantal', 1, 'eenheid', 'per stuk',
            'stuk_cents', 700, 'bedrag_cents', 700, 'btw_pct', 9, 'eenheden', 1, 'voorraad_eenheden', 0, 'alcohol', false,
            'componenten', jsonb_build_array(jsonb_build_object('product_id', v_worst, 'slot_type', 'worst', 'naam', 'Worst', 'hoeveelheid', 1, 'eenheid', 'stuk')))),
        p_betaalwijze => 'reservering', p_nu_te_betalen_cents => 250, p_rest_cents => 450);
    v_order := v_o.id;
    update public.winkel_orders set status = 'betaald', betaald_at = now() where id = v_order;

    -- ── Een dag op tablet 1: dag geopend met € 100, dan bonnen.
    perform pg_temp.tb_stuur(v_org, v_app, jsonb_build_object('soort', 'dag_openen', 'gebeurtenis_id', gen_random_uuid(), 'volgnummer', 1,
        'moment', '2026-03-06T09:55:00+01:00', 'medewerker_id', v_mw, 'bedrijfsdag', '2026-03-06', 'contant_begin_cents', 10000));
    -- b1, b2: elk 1 × € 3,95 (21%, btw 69). b3: 3 × € 3,95 (btw 206, niet 207). b4: worst 9% + statiegeld.
    perform pg_temp.tb_stuur(v_org, v_app, pg_temp.tb_bon('bon', v_b1, 2, v_code || '-000001', '2026-03-06T10:01:00+01:00', 'pin',
        jsonb_build_array(pg_temp.tb_regel(1, 1, 395, 21, pg_temp.ond(v_bier)))));
    perform pg_temp.tb_stuur(v_org, v_app, pg_temp.tb_bon('bon', v_b2, 3, v_code || '-000002', '2026-03-06T10:05:00+01:00', 'contant',
        jsonb_build_array(pg_temp.tb_regel(1, 1, 395, 21, pg_temp.ond(v_bier)))));
    perform pg_temp.tb_stuur(v_org, v_app, pg_temp.tb_bon('bon', v_b3, 4, v_code || '-000003', '2026-03-06T11:00:00+01:00', 'pin',
        jsonb_build_array(pg_temp.tb_regel(1, 3, 395, 21, pg_temp.ond(v_bier)))));
    perform pg_temp.tb_stuur(v_org, v_app, pg_temp.tb_bon('bon', v_b4, 5, v_code || '-000004', '2026-03-06T12:00:00+01:00', 'pin',
        jsonb_build_array(pg_temp.tb_regel(1, 1, 595, 9, pg_temp.ond(v_worst)),
            jsonb_build_object('regelnr', 2, 'soort', 'statiegeld', 'hoort_bij_regelnr', 1, 'product_id', v_worst, 'aantal', 1, 'stuk_cents', 15, 'bedrag_cents', 15))));
    -- Tegenbon op b1 (contant terug); een geannuleerde bon; een bon met alleen de rest van de webshoporder.
    perform pg_temp.tb_stuur(v_org, v_app, pg_temp.tb_bon('tegenbon', v_t1, 6, v_code || '-000005', '2026-03-06T13:00:00+01:00', 'contant',
        jsonb_build_array(pg_temp.tb_regel(1, -1, 395, 21, pg_temp.ond(v_bier), '{"verwijst_naar_regelnr": 1}'::jsonb)),
        jsonb_build_object('verwijst_naar_bon_id', v_b1, 'reden', 'test')));
    -- De geannuleerde bon zoals kern hem maakt (maakGeannuleerdeBon): regels, geen betaling, totaal 0.
    v_j := pg_temp.tb_stuur(v_org, v_app, pg_temp.tb_bon('bon', v_g1, 7, v_code || '-000006', '2026-03-06T14:00:00+01:00', 'pin',
        jsonb_build_array(pg_temp.tb_regel(1, 2, 1000, 21, pg_temp.ond(v_bier))),
        jsonb_build_object('status', 'geannuleerd', 'regels', jsonb_build_array(pg_temp.tb_regel(1, 2, 1000, 21, pg_temp.ond(v_bier))), 'totaal_cents', 0)));
    if v_j.verwerk_status <> 'verwerkt' then
        v_fouten := v_fouten || 'geannuleerde bon (kern-vorm) in Te controleren: ' || row_to_json(v_j)::text || '; ';
    end if;
    v_r := public.toonbank_ophaal_vraag(v_org, v_app, 'order', v_order, null, gen_random_uuid(), now(), v_mw, v_rb, 'pin', 450, null);
    if v_r->'resultaat'->>'uitkomst' <> 'opgehaald' then v_fouten := v_fouten || 'ophalen met rest: ' || v_r::text || '; '; end if;
    v_j := pg_temp.tb_stuur(v_org, v_app, pg_temp.tb_bon('bon', v_rb, 8, v_code || '-000007', '2026-03-06T16:32:00+01:00', 'pin',
        jsonb_build_array(jsonb_build_object('regelnr', 1, 'soort', 'order_rest', 'order_id', v_order, 'nummer', v_o.nummer, 'bedrag_cents', 450))));
    if v_j.verwerk_status <> 'verwerkt' then v_fouten := v_fouten || 'restbon: ' || row_to_json(v_j)::text || '; '; end if;

    -- Wat de tablet zegt (en wat ook klopt): 21% = 395 + 395 + 1185 − 395 = 1580, btw 69 + 69 + 206 − 69 = 275
    -- (opnieuw afgerond zou 274 zijn); 9% = 595, btw 49. Pin 395 + 1185 + 610 + 450 = 2640, contant 395 − 395 = 0.
    v_getallen := jsonb_build_object(
        'aantal_bonnen', 5, 'aantal_tegenbonnen', 1, 'aantal_geannuleerd', 1,
        'omzet', jsonb_build_array(jsonb_build_object('pct', 21, 'incl_cents', 1580, 'grondslag_cents', 1305, 'btw_cents', 275),
                                   jsonb_build_object('pct', 9, 'incl_cents', 595, 'grondslag_cents', 546, 'btw_cents', 49)),
        'statiegeld_cents', 15, 'order_rest_cents', 450, 'tegenbonnen_cents', -395,
        'pin_toonbank_cents', 2640, 'pin_mypos_app_cents', 2640, 'contant_begin_cents', 10000, 'contant_verwacht_cents', 10000, 'contant_geteld_cents', 10000);
    v_j := pg_temp.tb_stuur(v_org, v_app, pg_temp.tb_dagstaat(v_d1, 9, 1, v_code || '-000001', v_code || '-000007', v_getallen));
    select * into v_d from public.toonbank_dagstaten where id = v_d1;
    if v_j.verwerk_status <> 'verwerkt' or v_d.id is null or v_d.status <> 'definitief' or v_d.verschillen <> '[]'::jsonb then
        v_fouten := v_fouten || 'dagstaat 1: ' || row_to_json(v_j)::text || ' / ' || coalesce(row_to_json(v_d)::text, 'geen dagstaat') || '; ';
    end if;

    -- ── De herberekende dagstaat = de som van de bonnen (per tarief de bon-btw opgeteld).
    select jsonb_agg(jsonb_build_object('pct', t.pct, 'incl_cents', t.incl, 'grondslag_cents', t.incl - t.btw, 'btw_cents', t.btw) order by t.pct desc)
      into v_som
      from (select e.key::int as pct, sum((e.value->>'incl_cents')::bigint) as incl, sum((e.value->>'btw_cents')::bigint) as btw
              from public.toonbank_bonnen b, jsonb_each(b.btw) e
             where b.apparaat_id = v_app and b.bedrijfsdag = '2026-03-06' and b.status = 'afgerond' group by 1) t;
    if v_d.nagerekend->'omzet' <> v_som
       or v_d.nagerekend->'omzet' <> '[{"pct": 21, "btw_cents": 275, "incl_cents": 1580, "grondslag_cents": 1305}, {"pct": 9, "btw_cents": 49, "incl_cents": 595, "grondslag_cents": 546}]'::jsonb then
        v_fouten := v_fouten || 'narekening omzet: ' || coalesce((v_d.nagerekend->'omzet')::text, 'leeg') || ' / som bonnen ' || coalesce(v_som::text, 'leeg') || '; ';
    end if;
    -- De rest via de bon telt niet (dubbel) als omzet: alleen als order_rest en als pin.
    if (v_d.nagerekend->>'order_rest_cents')::int <> 450 or (v_d.nagerekend->>'pin_toonbank_cents')::int <> 2640
       or (select omzet_incl_cents from public.toonbank_bonnen where id = v_rb) <> 0
       or (select sum((x->>'incl_cents')::int) from jsonb_array_elements(v_d.nagerekend->'omzet') x) <> 2175 then
        v_fouten := v_fouten || 'rest via bon telt mee als omzet: ' || v_d.nagerekend::text || '; ';
    end if;
    if (v_d.nagerekend->>'aantal_bonnen')::int <> 5 or (v_d.nagerekend->>'aantal_tegenbonnen')::int <> 1 or (v_d.nagerekend->>'aantal_geannuleerd')::int <> 1
       or v_d.nagerekend->>'eerste_bonnummer' <> v_code || '-000001' or v_d.nagerekend->>'laatste_bonnummer' <> v_code || '-000007'
       or v_d.nagerekend->>'contant_begin_bron' <> 'dag_openen' or (v_d.nagerekend->>'contant_verwacht_cents')::int <> 10000 then
        v_fouten := v_fouten || 'narekening tellers: ' || v_d.nagerekend::text || '; ';
    end if;
    if exists (select 1 from public.toonbank_bonnen where apparaat_id = v_app and bedrijfsdag = '2026-03-06' and dagstaat_id is distinct from v_d1) then
        v_fouten := v_fouten || 'niet alle bonnen hangen aan de dagstaat; ';
    end if;

    -- ── GET dagstaat: alle bonnen, het hoogste bonnummer, omzet uit de bon-btw, pin en contant.
    v_r := public.toonbank_dagstaat_overzicht(v_org, v_app, '2026-03-06');
    if v_r <> jsonb_build_object('datum', '2026-03-06', 'apparaat_code', v_code, 'aantal_bonnen', 7, 'hoogste_bonnummer', v_code || '-000007',
                                 'omzet', '[{"pct": 21, "btw_cents": 275, "incl_cents": 1580}, {"pct": 9, "btw_cents": 49, "incl_cents": 595}]'::jsonb,
                                 'pin_cents', 2640, 'contant_cents', 0) then
        v_fouten := v_fouten || 'overzicht: ' || v_r::text || '; ';
    end if;

    -- ── Een late bon (vóór het sluiten gemaakt, na de dagstaat binnen): aangevuld, verschil → te controleren.
    perform pg_temp.tb_stuur(v_org, v_app, pg_temp.tb_bon('bon', v_laat, 10, v_code || '-000008', '2026-03-06T17:59:00+01:00', 'pin',
        jsonb_build_array(pg_temp.tb_regel(1, 1, 395, 21, pg_temp.ond(v_bier)))));
    select * into v_d from public.toonbank_dagstaten where id = v_d1;
    select * into v_j from public.toonbank_journaal where organization_id = v_org and gebeurtenis_id = v_d1;
    if v_d.status <> 'aangevuld' or (select dagstaat_id from public.toonbank_bonnen where id = v_laat) is distinct from v_d1
       or not v_d.verschillen @> '[{"veld": "aantal_bonnen", "tablet_cents": 5, "ba_cents": 6}]'::jsonb
       or not v_d.verschillen @> '[{"veld": "omzet_21_btw", "tablet_cents": 275, "ba_cents": 344}]'::jsonb
       or v_j.verwerk_status <> 'conflict' or v_j.fout_code <> 'dagstaat_verschil' then
        v_fouten := v_fouten || 'late bon: ' || row_to_json(v_d)::text || ' / ' || row_to_json(v_j)::text || '; ';
    end if;
    -- Een bon ná het sluiten hoort niet bij deze dagstaat.
    perform pg_temp.tb_stuur(v_org, v_app, pg_temp.tb_bon('bon', v_na, 11, v_code || '-000009', '2026-03-06T19:00:00+01:00', 'pin',
        jsonb_build_array(pg_temp.tb_regel(1, 1, 395, 21, pg_temp.ond(v_bier)))));
    if (select dagstaat_id from public.toonbank_bonnen where id = v_na) is not null then
        v_fouten := v_fouten || 'bon na het sluiten kreeg de dagstaat; ';
    end if;
    -- Goedkeuren: status goedgekeurd, het journaal opgelost.
    begin
        perform public.toonbank_dagstaat_goedkeuren(v_org, v_d1, ' ');
        v_fouten := v_fouten || 'goedkeuren zonder reden; ';
    exception when invalid_parameter_value then null;
    end;
    v_r := public.toonbank_dagstaat_goedkeuren(v_org, v_d1, 'late bon van 17:59, geteld en akkoord');
    if v_r->>'status' <> 'goedgekeurd' or (select status from public.toonbank_dagstaten where id = v_d1) <> 'goedgekeurd'
       or (select verwerk_status from public.toonbank_journaal where organization_id = v_org and gebeurtenis_id = v_d1) <> 'opgelost' then
        v_fouten := v_fouten || 'goedkeuren: ' || v_r::text || '; ';
    end if;

    -- ── Review M2 K5. "Opnieuw narekenen" (Admin) laat een goedgekeurde dagstaat goedgekeurd.
    v_r := public.toonbank_dagstaat_narekenen(v_org, v_d1);
    if v_r->>'status' <> 'goedgekeurd' or (select status from public.toonbank_dagstaten where id = v_d1) <> 'goedgekeurd'
       or (select verwerk_status from public.toonbank_journaal where organization_id = v_org and gebeurtenis_id = v_d1) <> 'opgelost' then
        v_fouten := v_fouten || 'narekenen na goedkeuren: ' || v_r::text || '; ';
    end if;
    -- Een gewoon lid (Medewerker) kan niet narekenen en herberekenen (met aangevuld) helemaal niet.
    insert into auth.users (id, aud, role, email) values (v_user, 'authenticated', 'authenticated', 'dagstaat-' || v_user || '@example.invalid');
    insert into public.organization_members (organization_id, user_id, role, status) values (v_org, v_user, 'Medewerker', 'active');
    begin
        perform set_config('request.jwt.claims', json_build_object('sub', v_user, 'role', 'authenticated')::text, true);
        perform set_config('role', 'authenticated', true);
        begin
            perform public.toonbank_dagstaat_herberekenen(v_org, v_d1, true);
            v_fouten := v_fouten || 'Medewerker zet een goedgekeurde dagstaat open via herberekenen; ';
        exception when insufficient_privilege then null;
        end;
        begin
            perform public.toonbank_dagstaat_narekenen(v_org, v_d1);
            v_fouten := v_fouten || 'Medewerker rekent een dagstaat na; ';
        exception when insufficient_privilege then null;
        end;
        raise exception 'terug_naar_postgres';
    exception when others then
        if sqlerrm <> 'terug_naar_postgres' then v_fouten := v_fouten || 'als Medewerker: ' || sqlerrm || '; '; end if;
    end;
    if (select status from public.toonbank_dagstaten where id = v_d1) <> 'goedgekeurd' then
        v_fouten := v_fouten || 'goedgekeurde dagstaat is door een Medewerker veranderd; ';
    end if;
    -- Een bon die ná de goedkeuring binnenkomt (gemaakt vóór het sluiten): aangevuld, en het
    -- journaal gaat van opgelost terug naar conflict (Te controleren), want de goedkeuring gold
    -- voor de oude cijfers.
    perform pg_temp.tb_stuur(v_org, v_app, pg_temp.tb_bon('bon', v_laat2, 12, v_code || '-000010', '2026-03-06T17:58:00+01:00', 'pin',
        jsonb_build_array(pg_temp.tb_regel(1, 1, 395, 21, pg_temp.ond(v_bier)))));
    select * into v_j from public.toonbank_journaal where organization_id = v_org and gebeurtenis_id = v_d1;
    if (select status from public.toonbank_dagstaten where id = v_d1) <> 'aangevuld'
       or (select dagstaat_id from public.toonbank_bonnen where id = v_laat2) is distinct from v_d1
       or v_j.verwerk_status <> 'conflict' or v_j.fout_code <> 'dagstaat_verschil' or v_j.fout_melding not like 'Na het afhandelen kwam er nog een bon binnen.%' then
        v_fouten := v_fouten || 'late bon na goedkeuren: ' || row_to_json(v_j)::text || '; ';
    end if;

    -- ── Hercontrole M2, K5-rand: een goedgekeurde dagstaat en dan een late bon zónder verschil.
    --    Tablet 6 sloot de dag met 2 bonnen, waarvan er 1 nog in de verzendbak zat: verschil, Te
    --    controleren, de beheerder keurt goed ("komt nog"). Dan komt die bon binnen: de cijfers
    --    kloppen nu precies. De dagstaat blijft goedgekeurd (niet 'aangevuld' bij een opgelost
    --    journaal), het journaal blijft opgelost en de bon hangt aan de dagstaat.
    v_r := public.toonbank_apparaat_nieuw(v_org, 'TEST dagstaat 6 ' || v_sfx, 'winkel', v_hash);
    v_app6 := (v_r->>'apparaat_id')::uuid; v_code6 := v_r->>'code';
    perform pg_temp.tb_stuur(v_org, v_app6, pg_temp.tb_bon('bon', v_e1, 1, v_code6 || '-000001', '2026-03-06T10:00:00+01:00', 'pin',
        jsonb_build_array(pg_temp.tb_regel(1, 1, 395, 21, pg_temp.ond(v_bier)))));
    v_j := pg_temp.tb_stuur(v_org, v_app6, pg_temp.tb_dagstaat(v_d6, 2, 1, v_code6 || '-000001', v_code6 || '-000002', jsonb_build_object(
        'aantal_bonnen', 2, 'omzet', jsonb_build_array(jsonb_build_object('pct', 21, 'incl_cents', 790, 'grondslag_cents', 652, 'btw_cents', 138)),
        'pin_toonbank_cents', 790, 'pin_mypos_app_cents', 790, 'verzendbak_leeg', false)));
    if v_j.verwerk_status <> 'conflict' or (select status from public.toonbank_dagstaten where id = v_d6) <> 'voorlopig' then
        v_fouten := v_fouten || 'K5-rand opzet (verschil verwacht): ' || row_to_json(v_j)::text || '; ';
    end if;
    perform public.toonbank_dagstaat_goedkeuren(v_org, v_d6, 'bon 2 zat nog in de verzendbak');
    perform pg_temp.tb_stuur(v_org, v_app6, pg_temp.tb_bon('bon', v_e2, 3, v_code6 || '-000002', '2026-03-06T17:30:00+01:00', 'pin',
        jsonb_build_array(pg_temp.tb_regel(1, 1, 395, 21, pg_temp.ond(v_bier)))));
    select * into v_d from public.toonbank_dagstaten where id = v_d6;
    select * into v_j from public.toonbank_journaal where organization_id = v_org and gebeurtenis_id = v_d6;
    if v_d.status <> 'goedgekeurd' or v_d.verschillen <> '[]'::jsonb or (v_d.nagerekend->>'aantal_bonnen')::int <> 2
       or (select dagstaat_id from public.toonbank_bonnen where id = v_e2) is distinct from v_d6
       or v_j.verwerk_status <> 'opgelost' or v_d.goedkeur_reden <> 'bon 2 zat nog in de verzendbak' then
        v_fouten := v_fouten || 'K5-rand: late bon zonder verschil na goedkeuren: ' || row_to_json(v_d)::text || ' / ' || row_to_json(v_j)::text || '; ';
    end if;

    -- ── Tablet 2 rekent zelf af en zegt btw 274 (opnieuw afgerond): verschil, te controleren.
    perform pg_temp.tb_stuur(v_org, v_app2, pg_temp.tb_bon('bon', v_x1, 1, v_code2 || '-000001', '2026-03-06T10:00:00+01:00', 'pin',
        jsonb_build_array(pg_temp.tb_regel(1, 1, 395, 21, pg_temp.ond(v_bier)), pg_temp.tb_regel(2, 3, 395, 21, pg_temp.ond(v_bier)))));
    -- Op de bon: 1580 in één keer afgerond = 274; zo rekent BBQ Architect ook (één bon). Het verschil zit in de dagstaat van de tablet: 275.
    v_j := pg_temp.tb_stuur(v_org, v_app2, pg_temp.tb_dagstaat(v_d2, 2, 1, v_code2 || '-000001', v_code2 || '-000001', jsonb_build_object(
        'aantal_bonnen', 1, 'omzet', jsonb_build_array(jsonb_build_object('pct', 21, 'incl_cents', 1580, 'grondslag_cents', 1305, 'btw_cents', 275)),
        'pin_toonbank_cents', 1580, 'pin_mypos_app_cents', 1580, 'verzendbak_leeg', false)));
    select * into v_d from public.toonbank_dagstaten where id = v_d2;
    if v_d.status <> 'voorlopig' or v_d.verschillen <> '[{"veld": "omzet_21_btw", "ba_cents": 274, "tablet_cents": 275}]'::jsonb
       or v_j.verwerk_status <> 'conflict' or v_j.fout_code <> 'dagstaat_verschil' then
        v_fouten := v_fouten || 'dagstaat tablet 2: ' || row_to_json(v_d)::text || ' / ' || row_to_json(v_j)::text || '; ';
    end if;
    -- Dezelfde dagstaat nog een keer: bestond, niets dubbel.
    v_r := public.toonbank_journaal_opslaan(v_org, v_app2, jsonb_build_array(pg_temp.tb_dagstaat(v_d2, 2, 1, v_code2 || '-000001', v_code2 || '-000001', '{}'::jsonb)));
    if v_r->'resultaten'->0->>'journaal' <> 'bestond' or (select count(*) from public.toonbank_dagstaten where apparaat_id = v_app2) <> 1 then
        v_fouten := v_fouten || 'dagstaat twee keer: ' || v_r::text || '; ';
    end if;

    -- ── Review M2 K2: een tegenbon met statiegeld. kern (dagCijfers) zet tegenbonnen_cents op het
    --    totaal van de tegenbon: −690 bier en −30 statiegeld = −720. BBQ Architect rekent hetzelfde.
    v_r := public.toonbank_apparaat_nieuw(v_org, 'TEST dagstaat 3 ' || v_sfx, 'winkel', v_hash);
    v_app3 := (v_r->>'apparaat_id')::uuid; v_code3 := v_r->>'code';
    perform pg_temp.tb_stuur(v_org, v_app3, pg_temp.tb_bon('bon', v_b5, 1, v_code3 || '-000001', '2026-03-06T11:00:00+01:00', 'pin', jsonb_build_array(
        pg_temp.tb_regel(1, 2, 345, 21, pg_temp.ond(v_bier)),
        jsonb_build_object('regelnr', 2, 'soort', 'statiegeld', 'hoort_bij_regelnr', 1, 'product_id', v_bier, 'aantal', 2, 'stuk_cents', 15, 'bedrag_cents', 30))));
    v_j := pg_temp.tb_stuur(v_org, v_app3, pg_temp.tb_bon('tegenbon', v_t5, 2, v_code3 || '-000002', '2026-03-06T11:30:00+01:00', 'pin', jsonb_build_array(
        pg_temp.tb_regel(1, -2, 345, 21, pg_temp.ond(v_bier), '{"verwijst_naar_regelnr": 1}'::jsonb),
        jsonb_build_object('regelnr', 2, 'soort', 'statiegeld', 'hoort_bij_regelnr', 1, 'product_id', v_bier, 'aantal', -2, 'stuk_cents', 15, 'bedrag_cents', -30)),
        jsonb_build_object('verwijst_naar_bon_id', v_b5, 'reden', 'retour')));
    v_j := pg_temp.tb_stuur(v_org, v_app3, pg_temp.tb_dagstaat(v_d3, 3, 1, v_code3 || '-000001', v_code3 || '-000002', jsonb_build_object(
        'aantal_bonnen', 1, 'aantal_tegenbonnen', 1, 'tegenbonnen_cents', -720)));
    select * into v_d from public.toonbank_dagstaten where id = v_d3;
    if v_d.verschillen <> '[]'::jsonb or (v_d.nagerekend->>'tegenbonnen_cents')::int <> -720 or v_j.verwerk_status <> 'verwerkt' then
        v_fouten := v_fouten || 'tegenbon met statiegeld: ' || row_to_json(v_d)::text || ' / ' || row_to_json(v_j)::text || '; ';
    end if;

    -- ── Review M2 K3: een evenement van 18:00 tot 01:00. Tablet 4 opent de dag (6 maart) om 18:00,
    --    bonnen om 22:00 en om 00:30 (7 maart), dicht om 01:00. De bon van 00:30 hoort bij
    --    bedrijfsdag 6 maart (de laatste dag_openen) en bij de dagstaat van 6 maart (tussen openen
    --    en sluiten): geen verschil in aantal, pin of omzet.
    v_r := public.toonbank_apparaat_nieuw(v_org, 'TEST dagstaat 4 ' || v_sfx, 'event', v_hash);
    v_app4 := (v_r->>'apparaat_id')::uuid; v_code4 := v_r->>'code';
    perform pg_temp.tb_stuur(v_org, v_app4, jsonb_build_object('soort', 'dag_openen', 'gebeurtenis_id', gen_random_uuid(), 'volgnummer', 1,
        'moment', '2026-03-06T18:00:00+01:00', 'medewerker_id', v_mw, 'bedrijfsdag', '2026-03-06', 'contant_begin_cents', 0));
    perform pg_temp.tb_stuur(v_org, v_app4, pg_temp.tb_bon('bon', v_c1, 2, v_code4 || '-000001', '2026-03-06T22:00:00+01:00', 'pin',
        jsonb_build_array(pg_temp.tb_regel(1, 2, 345, 21, pg_temp.ond(v_bier)))));
    perform pg_temp.tb_stuur(v_org, v_app4, pg_temp.tb_bon('bon', v_c2, 3, v_code4 || '-000002', '2026-03-07T00:30:00+01:00', 'pin',
        jsonb_build_array(pg_temp.tb_regel(1, 1, 345, 21, pg_temp.ond(v_bier)))));
    v_getallen := jsonb_build_object('moment', '2026-03-07T01:00:00+01:00', 'geopend_at', '2026-03-06T18:00:00+01:00', 'gesloten_at', '2026-03-07T01:00:00+01:00',
        'aantal_bonnen', 2, 'omzet', jsonb_build_array(jsonb_build_object('pct', 21, 'incl_cents', 1035, 'grondslag_cents', 855, 'btw_cents', 180)),
        'pin_toonbank_cents', 1035, 'pin_mypos_app_cents', 1035, 'contant_begin_cents', 0, 'contant_verwacht_cents', 0, 'contant_geteld_cents', 0);
    v_j := pg_temp.tb_stuur(v_org, v_app4, pg_temp.tb_dagstaat(v_d4, 4, 1, v_code4 || '-000001', v_code4 || '-000002', v_getallen));
    select * into v_d from public.toonbank_dagstaten where id = v_d4;
    if (select bedrijfsdag from public.toonbank_bonnen where id = v_c2) <> '2026-03-06'
       or (select dagstaat_id from public.toonbank_bonnen where id = v_c2) is distinct from v_d4
       or v_d.verschillen <> '[]'::jsonb or v_j.verwerk_status <> 'verwerkt'
       or (public.toonbank_dagstaat_overzicht(v_org, v_app4, '2026-03-06')->>'aantal_bonnen')::int <> 2 then
        v_fouten := v_fouten || 'na middernacht: bon 00:30 op ' || coalesce((select bedrijfsdag::text from public.toonbank_bonnen where id = v_c2), '?')
                    || ', dagstaat ' || row_to_json(v_d)::text || ' / ' || row_to_json(v_j)::text || '; ';
    end if;
    -- Hercontrole M2, N1 (de Toonbank opent na middernacht pas een nieuwe dag als de vorige is
    -- afgesloten): na de dagstaat van 01:00 opent tablet 4 de dag van 7 maart om 01:05 en verkoopt
    -- om 01:10. Die bon hoort bij 7 maart, niet bij de (gesloten) dagstaat van 6 maart; de dag van
    -- 6 maart blijft 2 bonnen zonder verschil.
    perform pg_temp.tb_stuur(v_org, v_app4, jsonb_build_object('soort', 'dag_openen', 'gebeurtenis_id', gen_random_uuid(), 'volgnummer', 5,
        'moment', '2026-03-07T01:05:00+01:00', 'medewerker_id', v_mw, 'bedrijfsdag', '2026-03-07', 'contant_begin_cents', 0));
    perform pg_temp.tb_stuur(v_org, v_app4, pg_temp.tb_bon('bon', v_c5, 6, v_code4 || '-000003', '2026-03-07T01:10:00+01:00', 'pin',
        jsonb_build_array(pg_temp.tb_regel(1, 1, 345, 21, pg_temp.ond(v_bier)))));
    select * into v_d from public.toonbank_dagstaten where id = v_d4;
    if (select bedrijfsdag from public.toonbank_bonnen where id = v_c5) <> '2026-03-07'
       or (select dagstaat_id from public.toonbank_bonnen where id = v_c5) is not null
       or v_d.status <> 'definitief' or v_d.verschillen <> '[]'::jsonb
       or (public.toonbank_dagstaat_overzicht(v_org, v_app4, '2026-03-06')->>'aantal_bonnen')::int <> 2
       or (public.toonbank_dagstaat_overzicht(v_org, v_app4, '2026-03-07')->>'aantal_bonnen')::int <> 1 then
        v_fouten := v_fouten || 'N1: nieuwe dag na de dagstaat van 01:00: bon 01:10 op '
                    || coalesce((select bedrijfsdag::text from public.toonbank_bonnen where id = v_c5), '?') || ', dagstaat ' || row_to_json(v_d)::text || '; ';
    end if;
    -- Zonder dag_openen (zoals in de review, V4): de bon van 00:30 krijgt de kalenderdag, maar valt
    -- toch in de dagstaat waarvan openen en sluiten hem dekken.
    v_r := public.toonbank_apparaat_nieuw(v_org, 'TEST dagstaat 5 ' || v_sfx, 'event', v_hash);
    v_app5 := (v_r->>'apparaat_id')::uuid; v_code5 := v_r->>'code';
    perform pg_temp.tb_stuur(v_org, v_app5, pg_temp.tb_bon('bon', v_c3, 1, v_code5 || '-000001', '2026-03-06T22:00:00+01:00', 'pin',
        jsonb_build_array(pg_temp.tb_regel(1, 2, 345, 21, pg_temp.ond(v_bier)))));
    perform pg_temp.tb_stuur(v_org, v_app5, pg_temp.tb_bon('bon', v_c4, 2, v_code5 || '-000002', '2026-03-07T00:30:00+01:00', 'pin',
        jsonb_build_array(pg_temp.tb_regel(1, 1, 345, 21, pg_temp.ond(v_bier)))));
    v_j := pg_temp.tb_stuur(v_org, v_app5, pg_temp.tb_dagstaat(v_d5, 3, 1, v_code5 || '-000001', v_code5 || '-000002', v_getallen));
    select * into v_d from public.toonbank_dagstaten where id = v_d5;
    if (select bedrijfsdag from public.toonbank_bonnen where id = v_c4) <> '2026-03-07'
       or (select dagstaat_id from public.toonbank_bonnen where id = v_c4) is distinct from v_d5
       or v_d.verschillen <> '[]'::jsonb or v_j.verwerk_status <> 'verwerkt' then
        v_fouten := v_fouten || 'na middernacht zonder dag_openen: ' || row_to_json(v_d)::text || ' / ' || row_to_json(v_j)::text || '; ';
    end if;

    -- ── Review M2 punt 8: een tabletklok die voorloopt (2030) zet een bon nooit in de toekomst:
    --    gebeurd_at, de bedrijfsdag en de voorraadmutatie worden begrensd op ontvangen_at.
    v_j := pg_temp.tb_stuur(v_org, v_app5, pg_temp.tb_bon('bon', v_k1, 4, v_code5 || '-000003', '2030-01-01T12:00:00+01:00', 'pin',
        jsonb_build_array(pg_temp.tb_regel(1, 1, 345, 21, pg_temp.ond(v_bier)))));
    if (select gebeurd_at from public.toonbank_bonnen where id = v_k1) <> v_j.ontvangen_at
       or (select bedrijfsdag from public.toonbank_bonnen where id = v_k1) <> (v_j.ontvangen_at at time zone 'Europe/Amsterdam')::date
       or v_j.apparaat_tijd <> '2030-01-01T11:00:00Z'::timestamptz
       or exists (select 1 from public.winkel_voorraad_mutaties m join public.toonbank_bon_regels r on r.id = m.toonbank_bon_regel_id
                   where r.bon_id = v_k1 and m.gebeurd_at is distinct from v_j.ontvangen_at) then
        v_fouten := v_fouten || 'klok in de toekomst niet begrensd: ' || (select row_to_json(b)::text from public.toonbank_bonnen b where id = v_k1) || '; ';
    end if;

    -- ── De dagstaat is vast: wat de tablet afsloot verandert niet en gaat nooit weg.
    begin
        update public.toonbank_dagstaten set pin_toonbank_cents = 0 where id = v_d2;
        v_fouten := v_fouten || 'dagstaat te wijzigen; ';
    exception when sqlstate 'TB003' then null;
    end;
    begin
        delete from public.toonbank_dagstaten where id = v_d2;
        v_fouten := v_fouten || 'dagstaat te verwijderen; ';
    exception when sqlstate 'TB003' then null;
    end;

    -- ── Rechten.
    if has_table_privilege('anon', 'public.toonbank_dagstaten', 'SELECT') or has_table_privilege('authenticated', 'public.toonbank_dagstaten', 'UPDATE')
       or has_function_privilege('authenticated', 'public.toonbank_dagstaat_overzicht(uuid, uuid, date)', 'EXECUTE')
       or has_function_privilege('anon', 'public.toonbank_dagstaat_goedkeuren(uuid, uuid, text, uuid)', 'EXECUTE')
       or not has_function_privilege('authenticated', 'public.toonbank_dagstaat_goedkeuren(uuid, uuid, text, uuid)', 'EXECUTE')
       or has_function_privilege('authenticated', 'public.toonbank_dagstaat_herberekenen(uuid, uuid, boolean)', 'EXECUTE')
       or not has_function_privilege('service_role', 'public.toonbank_dagstaat_herberekenen(uuid, uuid, boolean)', 'EXECUTE')
       or has_function_privilege('anon', 'public.toonbank_dagstaat_narekenen(uuid, uuid)', 'EXECUTE')
       or not has_function_privilege('authenticated', 'public.toonbank_dagstaat_narekenen(uuid, uuid)', 'EXECUTE') then
        v_fouten := v_fouten || 'rechten op de dagstaat kloppen niet; ';
    end if;

    if v_fouten <> '' then raise exception 'FOUT: %', v_fouten; end if;
    raise exception 'GESLAAGD: herberekende dagstaat = som van de bonnen (21%%: 1580 met btw 275 = 69 + 69 + 206 − 69, niet 274; 9%%: 595/49), netto met tegenbon, zonder geannuleerde; rest via bon 450 alleen als order_rest en pin, nooit als omzet; wisselgeld uit dag_openen; definitief zonder verschillen; GET dagstaat; late bon → aangevuld met verschil en te controleren, bon na sluiten niet; goedkeuren met reden → opgelost; narekenen (Admin) laat goedgekeurd staan, een Medewerker kan niet narekenen of herberekenen; bon na goedkeuring → aangevuld en journaal van opgelost terug naar conflict, zonder verschil blijft hij goedgekeurd en opgelost (K5-rand); tablet die 275 zegt bij een bon van 274 → verschil omzet_21_btw; tegenbon met statiegeld = tegenbonnen_cents −720 zoals kern, geen verschil; evenement 18:00–01:00: bon van 00:30 op bedrijfsdag 6 maart (dag_openen) en in de dagstaat van 6 maart, zonder dag_openen de kalenderdag maar toch in de dagstaat; na de dagstaat van 01:00 een nieuwe dag: bon 01:10 op 7 maart en niet in de dagstaat van 6 maart (N1); klok in 2030 begrensd op ontvangen; dubbel = bestond; dagstaat vast (TB003) — alles teruggedraaid';
end $$;
