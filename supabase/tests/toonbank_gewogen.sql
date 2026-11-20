-- Test voor 20261120120000_winkel_wegen_bij_afrekenen: een bakje dat bij het afrekenen
-- gewogen wordt (olijven, tapenades, dips), zonder sticker.
-- Draait in één transactie die aan het eind wordt teruggedraaid.
--
-- ALLEEN op de dev-database, nooit op live en nooit met --linked:
--   npm --prefix tools/testdb run test -- toonbank_gewogen
-- Vereist de seed supabase/tests/seed_vier_naober.sql.
--
-- Bewijst: wegen_bij_afrekenen alleen bij verkoop_per kg; tarra_g 0–9999; de
-- catalogus geeft wegen_bij_afrekenen en tarra_g; beide zetten de catalogusversie
-- omhoog; een kloppend gewogen bakje = verwerkt, geen prijs_afwijking, 152 g af;
-- een cent te veel = gewogen_prijs maar geboekt; een andere kiloprijs dan in BBQ
-- Architect = gewogen_kiloprijs maar geboekt; onderdelen anders dan het gewicht =
-- gewogen_gewicht; een tegenbon zet het gewicht terug; een gewone catalogusregel
-- met een afwijkende prijs blijft prijs_afwijking; rechten.
--
-- Verwacht: "GESLAAGD: ..." als EXCEPTION.

-- Een gewogen regel: prijs_bron catalogus met gewicht_g en kiloprijs_cents, geen scan_code.
create function pg_temp.regel(p_nr int, p_artikel uuid, p_product uuid, p_gram int, p_kilo int, p_stuk int, p_af numeric default null, p_aantal int default 1)
returns jsonb language sql as $$
    select jsonb_build_object('regelnr', p_nr, 'soort', 'verkoop', 'artikel_id', p_artikel, 'naam', 'TEST olijven', 'aantal', p_aantal,
        'stuk_cents', p_stuk, 'korting_cents', 0, 'bedrag_cents', p_aantal * p_stuk,
        'btw', jsonb_build_array(jsonb_build_object('pct', 9, 'incl_cents', p_aantal * p_stuk)),
        'alcohol', false, 'onderdelen', jsonb_build_array(jsonb_build_object('product_id', p_product, 'hoeveelheid', coalesce(p_af, p_gram), 'eenheid', 'gram')),
        'prijs_bron', 'catalogus', 'gewicht_g', p_gram, 'kiloprijs_cents', p_kilo)
$$;

create function pg_temp.bon(p_soort text, p_gid uuid, p_volgnr bigint, p_bonnummer text, p_regels jsonb, p_extra jsonb default '{}')
returns jsonb language sql as $$
    select jsonb_build_object('soort', p_soort, 'gebeurtenis_id', p_gid, 'volgnummer', p_volgnr, 'moment', now() - interval '1 hour',
        'medewerker_id', null, 'bon_id', p_gid, 'bonnummer', p_bonnummer, 'bon_volgnummer', split_part(p_bonnummer, '-', 2)::int,
        'status', 'afgerond', 'kanaal', 'winkel', 'catalogus_versie', 1, 'leeftijd', null,
        'regels', p_regels || jsonb_build_array(jsonb_build_object('regelnr', 99, 'soort', 'betaling', 'betaalmethode', 'pin',
            'betaal_bevestiging', 'handmatig', 'bedrag_cents', (select coalesce(sum((r->>'bedrag_cents')::int), 0) from jsonb_array_elements(p_regels) r))),
        'totaal_cents', (select coalesce(sum((r->>'bedrag_cents')::int), 0) from jsonb_array_elements(p_regels) r),
        'afronding_cents', 0) || p_extra
$$;

create function pg_temp.stuur(p_org uuid, p_app uuid, p_m jsonb)
returns public.toonbank_journaal language plpgsql as $$
declare
    v public.toonbank_journaal;
begin
    perform public.toonbank_journaal_opslaan(p_org, p_app, jsonb_build_array(p_m), '1.4.0');
    perform public.toonbank_verwerk_wachtrij(p_org, p_app);
    select * into v from public.toonbank_journaal where organization_id = p_org and gebeurtenis_id = (p_m->>'gebeurtenis_id')::uuid;
    return v;
end $$;

do $$
declare
    v_org     uuid;
    v_sfx     text := substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);
    v_hash    text := repeat('a', 32) || ':' || repeat('b', 128);
    v_app     uuid;
    v_code    text;
    v_olijf   uuid;
    v_art     uuid;
    v_stuk_p  uuid;
    v_stuk_a  uuid;
    v_b1      uuid := gen_random_uuid();
    v_vnr     bigint := 0;
    v_bnr     int := 0;
    v_j       public.toonbank_journaal%rowtype;
    v_r       jsonb;
    v_v       bigint;
    v_v2      bigint;
    v_vlag    text;
    v_fouten  text := '';
begin
    select id into v_org from public.organizations where slug = 'e2e-hop-en-bites';
    if v_org is null then
        raise exception 'GEWEIGERD: organisatie e2e-hop-en-bites bestaat niet. Deze test draait alleen op de dev-database, na de seed.';
    end if;
    v_vlag := 'app.cv_' || replace(v_org::text, '-', '');

    v_r := public.toonbank_apparaat_nieuw(v_org, 'TEST gewogen ' || v_sfx, 'winkel', v_hash);
    v_app := (v_r->>'apparaat_id')::uuid; v_code := v_r->>'code';

    -- Olijven op gewicht, € 22,50 per kilo, bij het afrekenen gewogen.
    insert into public.winkel_producten (organization_id, naam, type, eenheid, prijs_per, btw_pct)
    values (v_org, 'TEST olijven ' || v_sfx, 'zuur', 'gram', 1000, 9) returning id into v_olijf;
    perform public.winkel_muteer_voorraad(v_org, v_olijf, 'telling', 2000, p_gebeurd_at => now() - interval '3 hours');
    insert into public.winkel_artikelen (organization_id, slug, naam, prijs_cents, btw_pct, actief, kanalen, toonbank_groep,
                                         verkoop_per, kiloprijs_cents, sticker_plu, wegen_bij_afrekenen, tarra_g)
    values (v_org, 'test-olijven-' || v_sfx, 'TEST Olijven', 2250, 9, true, array['toonbank'], 'Olijven',
            'kg', 2250, 909, true, null) returning id into v_art;
    insert into public.winkel_artikel_slots (organization_id, artikel_id, volgorde, slot_type, naam, hoeveelheid, eenheid, per, standaard_product_id)
    values (v_org, v_art, 0, 'zuur', 'Olijven', 1, 'gram', 'stuk', v_olijf);

    -- ── 1. Alleen op gewicht; tarra binnen de grenzen.
    insert into public.winkel_producten (organization_id, naam, type, eenheid, prijs_per, btw_pct)
    values (v_org, 'TEST pot ' || v_sfx, 'overig', 'stuk', 1, 9) returning id into v_stuk_p;
    begin
        insert into public.winkel_artikelen (organization_id, slug, naam, prijs_cents, btw_pct, actief, kanalen, wegen_bij_afrekenen)
        values (v_org, 'test-pot-' || v_sfx, 'TEST pot', 495, 9, true, array['toonbank'], true) returning id into v_stuk_a;
        v_fouten := v_fouten || 'wegen_bij_afrekenen per stuk toegestaan; ';
    exception when check_violation then null;
    end;
    begin
        update public.winkel_artikelen set tarra_g = 10000 where id = v_art;
        v_fouten := v_fouten || 'tarra van 10 kilo toegestaan; ';
    exception when check_violation then null;
    end;

    -- ── 2. De catalogus en de catalogusversie.
    select e into v_r from jsonb_array_elements(public.toonbank_catalogus(v_org)->'artikelen') e where e->>'artikel_id' = v_art::text;
    if (v_r->>'wegen_bij_afrekenen')::boolean is not true or v_r->'tarra_g' <> 'null'::jsonb or (v_r->>'kiloprijs_cents')::int <> 2250 then
        v_fouten := v_fouten || 'catalogus: ' || coalesce(v_r::text, 'leeg') || '; ';
    end if;
    set constraints all immediate;
    perform set_config(v_vlag, '', true);
    select versie into v_v from public.winkel_catalogus_versie where organization_id = v_org;
    update public.winkel_artikelen set tarra_g = 18 where id = v_art;
    select versie into v_v2 from public.winkel_catalogus_versie where organization_id = v_org;
    if v_v2 is distinct from v_v + 1 then v_fouten := v_fouten || 'tarra zet de versie niet omhoog; '; end if;
    perform set_config(v_vlag, '', true);
    update public.winkel_artikelen set wegen_bij_afrekenen = false where id = v_art;
    select versie into v_v from public.winkel_catalogus_versie where organization_id = v_org;
    if v_v is distinct from v_v2 + 1 then v_fouten := v_fouten || 'wegen_bij_afrekenen zet de versie niet omhoog; '; end if;
    select e into v_r from jsonb_array_elements(public.toonbank_catalogus(v_org)->'artikelen') e where e->>'artikel_id' = v_art::text;
    if (v_r->>'wegen_bij_afrekenen')::boolean or v_r->'tarra_g' <> 'null'::jsonb then
        v_fouten := v_fouten || 'catalogus uit: ' || coalesce(v_r::text, 'leeg') || '; ';
    end if;
    update public.winkel_artikelen set wegen_bij_afrekenen = true where id = v_art;
    select e into v_r from jsonb_array_elements(public.toonbank_catalogus(v_org)->'artikelen') e where e->>'artikel_id' = v_art::text;
    if (v_r->>'tarra_g')::int is distinct from 18 then v_fouten := v_fouten || 'catalogus tarra: ' || coalesce(v_r::text, 'leeg') || '; '; end if;

    -- ── 3. Een kloppend gewogen bakje: 152 g × 2250 = 342. Verwerkt, geen prijs_afwijking, 152 g af.
    v_vnr := v_vnr + 1; v_bnr := v_bnr + 1;
    v_j := pg_temp.stuur(v_org, v_app, pg_temp.bon('bon', v_b1, v_vnr, v_code || '-' || lpad(v_bnr::text, 6, '0'),
        jsonb_build_array(pg_temp.regel(1, v_art, v_olijf, 152, 2250, 342))));
    if v_j.verwerk_status <> 'verwerkt' then
        v_fouten := v_fouten || 'kloppend bakje niet verwerkt: ' || coalesce(v_j.fout_melding, v_j.verwerk_status) || '; ';
    end if;
    if (select prijs_afwijking from public.toonbank_bonnen where id = v_b1) then
        v_fouten := v_fouten || 'gewogen bakje telt als prijs_afwijking; ';
    end if;
    if (select voorraad from public.winkel_producten where id = v_olijf) <> 1848 then
        v_fouten := v_fouten || 'voorraad na 152 g niet 1848 maar ' || (select voorraad from public.winkel_producten where id = v_olijf) || '; ';
    end if;

    -- ── 4. Een cent te veel: geboekt, maar gewogen_prijs.
    v_vnr := v_vnr + 1; v_bnr := v_bnr + 1;
    v_j := pg_temp.stuur(v_org, v_app, pg_temp.bon('bon', gen_random_uuid(), v_vnr, v_code || '-' || lpad(v_bnr::text, 6, '0'),
        jsonb_build_array(pg_temp.regel(1, v_art, v_olijf, 152, 2250, 343))));
    if v_j.verwerk_status <> 'conflict' or v_j.fout_code <> 'gewogen_prijs' or position('342' in v_j.fout_melding) = 0 then
        v_fouten := v_fouten || 'cent te veel niet gewogen_prijs: ' || row_to_json(v_j)::text || '; ';
    end if;
    if (select voorraad from public.winkel_producten where id = v_olijf) <> 1696 then
        v_fouten := v_fouten || 'afwijkende bon niet geboekt; ';
    end if;

    -- ── 5. Een andere kiloprijs dan in BBQ Architect (de kassa had een oude catalogus).
    v_vnr := v_vnr + 1; v_bnr := v_bnr + 1;
    v_j := pg_temp.stuur(v_org, v_app, pg_temp.bon('bon', gen_random_uuid(), v_vnr, v_code || '-' || lpad(v_bnr::text, 6, '0'),
        jsonb_build_array(pg_temp.regel(1, v_art, v_olijf, 200, 1995, 399))));
    if v_j.verwerk_status <> 'conflict' or v_j.fout_code <> 'gewogen_kiloprijs' then
        v_fouten := v_fouten || 'andere kiloprijs niet gewogen_kiloprijs: ' || row_to_json(v_j)::text || '; ';
    end if;

    -- ── 6. De bon boekt iets anders af dan het gewicht.
    v_vnr := v_vnr + 1; v_bnr := v_bnr + 1;
    v_j := pg_temp.stuur(v_org, v_app, pg_temp.bon('bon', gen_random_uuid(), v_vnr, v_code || '-' || lpad(v_bnr::text, 6, '0'),
        jsonb_build_array(pg_temp.regel(1, v_art, v_olijf, 152, 2250, 342, 1))));
    if v_j.verwerk_status <> 'conflict' or v_j.fout_code <> 'gewogen_gewicht' then
        v_fouten := v_fouten || 'onderdeel 1 in plaats van 152 g niet gewogen_gewicht: ' || row_to_json(v_j)::text || '; ';
    end if;

    -- ── 7. Een tegenbon op het eerste bakje: het gewicht komt terug.
    select voorraad into v_v from public.winkel_producten where id = v_olijf;
    v_vnr := v_vnr + 1; v_bnr := v_bnr + 1;
    v_j := pg_temp.stuur(v_org, v_app, pg_temp.bon('tegenbon', gen_random_uuid(), v_vnr, v_code || '-' || lpad(v_bnr::text, 6, '0'),
        jsonb_build_array(pg_temp.regel(1, v_art, v_olijf, 152, 2250, 342, null, -1) || '{"verwijst_naar_regelnr": 1, "goederen_terug": true}'::jsonb),
        jsonb_build_object('verwijst_naar_bon_id', v_b1, 'reden', 'verkeerd gewogen')));
    if v_j.verwerk_status not in ('verwerkt', 'conflict') or (select voorraad from public.winkel_producten where id = v_olijf) <> v_v + 152 then
        v_fouten := v_fouten || 'tegenbon zet het gewicht niet terug: ' || row_to_json(v_j)::text || '; ';
    end if;
    if v_j.fout_code like 'gewogen_%' then
        v_fouten := v_fouten || 'tegenbon gaf ' || v_j.fout_code || '; ';
    end if;

    -- ── 8. Een gewone catalogusregel (geen gewicht) met een afwijkende prijs blijft prijs_afwijking.
    if jsonb_array_length(private.toonbank_controleer_gewogen(v_org, jsonb_build_array(
            pg_temp.regel(1, v_art, v_olijf, 152, 2250, 5) - 'gewicht_g' - 'kiloprijs_cents'))) <> 0 then
        v_fouten := v_fouten || 'regel zonder gewicht nagerekend als gewogen; ';
    end if;
    v_vnr := v_vnr + 1; v_bnr := v_bnr + 1; v_b1 := gen_random_uuid();
    v_j := pg_temp.stuur(v_org, v_app, pg_temp.bon('bon', v_b1, v_vnr, v_code || '-' || lpad(v_bnr::text, 6, '0'),
        jsonb_build_array(pg_temp.regel(1, v_art, v_olijf, 152, 2250, 500) - 'gewicht_g' - 'kiloprijs_cents')));
    if not coalesce((select prijs_afwijking from public.toonbank_bonnen where id = v_b1), false) then
        v_fouten := v_fouten || 'gewone afwijkende prijs is geen prijs_afwijking meer; ';
    end if;

    -- ── 9. Rechten.
    if has_function_privilege('authenticated', 'private.toonbank_controleer_gewogen(uuid, jsonb)', 'EXECUTE')
       or has_function_privilege('anon', 'private.toonbank_controleer_gewogen(uuid, jsonb)', 'EXECUTE') then
        v_fouten := v_fouten || 'rechten kloppen niet; ';
    end if;

    if v_fouten <> '' then raise exception 'FOUT: %', v_fouten; end if;
    raise exception 'GESLAAGD: alleen op gewicht, tarra 0–9999; catalogus en versie; 152 g × 2250 = 342 verwerkt, geen prijs_afwijking, 152 g af; 343 = gewogen_prijs maar geboekt; andere kiloprijs = gewogen_kiloprijs; 1 g afgeboekt = gewogen_gewicht; tegenbon zet 152 g terug; gewone regel blijft prijs_afwijking; rechten — alles teruggedraaid';
end $$;
