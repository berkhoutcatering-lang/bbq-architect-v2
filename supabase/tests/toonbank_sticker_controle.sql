-- Test voor 20261118120000_toonbank_sticker_controle: een stickerbon narekenen,
-- en de catalogusversie omhoog bij een gewijzigd etiket.
-- Draait in één transactie die aan het eind wordt teruggedraaid.
--
-- ALLEEN op de dev-database, nooit op live en nooit met --linked:
--   npm --prefix tools/testdb run test -- toonbank_sticker_controle
-- Vereist de seed supabase/tests/seed_vier_naober.sql.
--
-- Bewijst: een kloppende stickerbon = verwerkt en 412 g af; een cent te veel
-- = conflict sticker_prijs, toch geboekt; een halve cent gaat omhoog (599 goed,
-- 598 niet); onderdelen anders dan het gewicht = conflict sticker_gewicht;
-- een gewone catalogusregel blijft verwerkt; etiket, kiloprijs, allergenen en
-- ingrediënten zetten de catalogusversie omhoog; rechten.
--
-- Verwacht: "GESLAAGD: ..." als EXCEPTION.

create function pg_temp.code(p_plu int, p_gram int, p_kilo int, p_volg int)
returns text language sql as $$
    select '29' || lpad(p_plu::text, 5, '0') || lpad(p_gram::text, 5, '0') || lpad(p_kilo::text, 5, '0')
           || '261130' || lpad(p_volg::text, 4, '0') || '0'
$$;

-- Een stickerregel met een opgegeven stuk_cents (de Toonbank zou het zelf uitrekenen).
create function pg_temp.regel(p_nr int, p_artikel uuid, p_product uuid, p_gram int, p_kilo int, p_stuk int, p_code text, p_af numeric default null)
returns jsonb language sql as $$
    select jsonb_build_object('regelnr', p_nr, 'soort', 'verkoop', 'artikel_id', p_artikel, 'naam', 'TEST kaas', 'aantal', 1,
        'stuk_cents', p_stuk, 'korting_cents', 0, 'bedrag_cents', p_stuk,
        'btw', jsonb_build_array(jsonb_build_object('pct', 9, 'incl_cents', p_stuk)),
        'alcohol', false, 'onderdelen', jsonb_build_array(jsonb_build_object('product_id', p_product, 'hoeveelheid', coalesce(p_af, p_gram), 'eenheid', 'gram')),
        'scan_code', p_code, 'prijs_bron', 'sticker', 'gewicht_g', p_gram, 'kiloprijs_cents', p_kilo)
$$;

create function pg_temp.bon(p_gid uuid, p_volgnr bigint, p_bonnummer text, p_regels jsonb)
returns jsonb language sql as $$
    select jsonb_build_object('soort', 'bon', 'gebeurtenis_id', p_gid, 'volgnummer', p_volgnr, 'moment', now() - interval '1 hour',
        'medewerker_id', null, 'bon_id', p_gid, 'bonnummer', p_bonnummer, 'bon_volgnummer', split_part(p_bonnummer, '-', 2)::int,
        'status', 'afgerond', 'kanaal', 'winkel', 'catalogus_versie', 1, 'leeftijd', null,
        'regels', p_regels || jsonb_build_array(jsonb_build_object('regelnr', 99, 'soort', 'betaling', 'betaalmethode', 'pin',
            'betaal_bevestiging', 'handmatig', 'bedrag_cents', (select coalesce(sum((r->>'bedrag_cents')::int), 0) from jsonb_array_elements(p_regels) r))),
        'totaal_cents', (select coalesce(sum((r->>'bedrag_cents')::int), 0) from jsonb_array_elements(p_regels) r),
        'afronding_cents', 0)
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
    v_kaas    uuid;
    v_art     uuid;
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

    v_r := public.toonbank_apparaat_nieuw(v_org, 'TEST stickercontrole ' || v_sfx, 'winkel', v_hash);
    v_app := (v_r->>'apparaat_id')::uuid; v_code := v_r->>'code';

    insert into public.winkel_producten (organization_id, naam, type, eenheid, prijs_per, btw_pct, allergenen, ingredienten)
    values (v_org, 'TEST stickerkaas ' || v_sfx, 'kaas', 'gram', 1000, 9, array['melk'], array['*melk*', 'zout']) returning id into v_kaas;
    perform public.winkel_muteer_voorraad(v_org, v_kaas, 'telling', 5000, p_gebeurd_at => now() - interval '3 hours');
    insert into public.winkel_artikelen (organization_id, slug, naam, prijs_cents, btw_pct, actief, kanalen, toonbank_groep,
                                         verkoop_per, kiloprijs_cents, sticker_plu, etiket)
    values (v_org, 'test-stickerkaas-' || v_sfx, 'TEST Stickerkaas', 2495, 9, true, array['toonbank'], 'Kaas',
            'kg', 2495, 777, '{"houdbaar_dagen": 14, "rauwe_melk": false}') returning id into v_art;
    insert into public.winkel_artikel_slots (organization_id, artikel_id, volgorde, slot_type, naam, hoeveelheid, eenheid, per, standaard_product_id)
    values (v_org, v_art, 0, 'kaas', 'Stickerkaas', 1, 'gram', 'stuk', v_kaas);

    -- ── 1. De functie zelf: het voorbeeld uit het contract klopt.
    if jsonb_array_length(private.toonbank_controleer_sticker(jsonb_build_array(
            pg_temp.regel(1, v_art, v_kaas, 412, 2495, 1028, pg_temp.code(777, 412, 2495, 1))))) <> 0 then
        v_fouten := v_fouten || '412 g × 2495 = 1028 afgekeurd; ';
    end if;
    if jsonb_array_length(private.toonbank_controleer_sticker('null'::jsonb)) <> 0 then
        v_fouten := v_fouten || 'geen regels gaf een controle; ';
    end if;

    -- ── 2. Een kloppende stickerbon: verwerkt, 412 g af.
    v_vnr := v_vnr + 1; v_bnr := v_bnr + 1;
    v_j := pg_temp.stuur(v_org, v_app, pg_temp.bon(gen_random_uuid(), v_vnr, v_code || '-' || lpad(v_bnr::text, 6, '0'),
        jsonb_build_array(pg_temp.regel(1, v_art, v_kaas, 412, 2495, 1028, pg_temp.code(777, 412, 2495, 2)))));
    if v_j.verwerk_status <> 'verwerkt' then
        v_fouten := v_fouten || 'kloppende stickerbon niet verwerkt: ' || coalesce(v_j.fout_melding, v_j.verwerk_status) || '; ';
    end if;
    if (select voorraad from public.winkel_producten where id = v_kaas) <> 4588 then
        v_fouten := v_fouten || 'voorraad na 412 g niet 4588 maar ' || (select voorraad from public.winkel_producten where id = v_kaas) || '; ';
    end if;

    -- ── 3. Een cent te veel: toch geboekt, maar in Te controleren.
    v_vnr := v_vnr + 1; v_bnr := v_bnr + 1;
    v_j := pg_temp.stuur(v_org, v_app, pg_temp.bon(gen_random_uuid(), v_vnr, v_code || '-' || lpad(v_bnr::text, 6, '0'),
        jsonb_build_array(pg_temp.regel(1, v_art, v_kaas, 412, 2495, 1029, pg_temp.code(777, 412, 2495, 3)))));
    if v_j.verwerk_status <> 'conflict' or v_j.fout_code <> 'sticker_prijs' or position('1028' in v_j.fout_melding) = 0 then
        v_fouten := v_fouten || 'cent te veel niet sticker_prijs: ' || row_to_json(v_j)::text || '; ';
    end if;
    if (select voorraad from public.winkel_producten where id = v_kaas) <> 4176 then
        v_fouten := v_fouten || 'afwijkende bon niet geboekt; ';
    end if;

    -- ── 4. Een halve cent gaat omhoog: 300 g × 1995 = 598,5 → 599.
    v_vnr := v_vnr + 1; v_bnr := v_bnr + 1;
    v_j := pg_temp.stuur(v_org, v_app, pg_temp.bon(gen_random_uuid(), v_vnr, v_code || '-' || lpad(v_bnr::text, 6, '0'),
        jsonb_build_array(pg_temp.regel(1, v_art, v_kaas, 300, 1995, 599, pg_temp.code(777, 300, 1995, 4)))));
    if v_j.verwerk_status <> 'verwerkt' then
        v_fouten := v_fouten || 'halve cent omhoog (599) afgekeurd: ' || coalesce(v_j.fout_melding, '') || '; ';
    end if;
    v_vnr := v_vnr + 1; v_bnr := v_bnr + 1;
    v_j := pg_temp.stuur(v_org, v_app, pg_temp.bon(gen_random_uuid(), v_vnr, v_code || '-' || lpad(v_bnr::text, 6, '0'),
        jsonb_build_array(pg_temp.regel(1, v_art, v_kaas, 300, 1995, 598, pg_temp.code(777, 300, 1995, 5)))));
    if v_j.verwerk_status <> 'conflict' or v_j.fout_code <> 'sticker_prijs' then
        v_fouten := v_fouten || 'halve cent omlaag (598) niet afgekeurd; ';
    end if;

    -- ── 5. De bon boekt iets anders af dan het gewicht.
    v_vnr := v_vnr + 1; v_bnr := v_bnr + 1;
    v_j := pg_temp.stuur(v_org, v_app, pg_temp.bon(gen_random_uuid(), v_vnr, v_code || '-' || lpad(v_bnr::text, 6, '0'),
        jsonb_build_array(pg_temp.regel(1, v_art, v_kaas, 412, 2495, 1028, pg_temp.code(777, 412, 2495, 6), 1))));
    if v_j.verwerk_status <> 'conflict' or v_j.fout_code <> 'sticker_gewicht' then
        v_fouten := v_fouten || 'onderdeel 1 in plaats van 412 g niet sticker_gewicht: ' || row_to_json(v_j)::text || '; ';
    end if;

    -- ── 6. Een gewone regel (geen sticker) wordt niet nagerekend.
    if jsonb_array_length(private.toonbank_controleer_sticker(jsonb_build_array(
            pg_temp.regel(1, v_art, v_kaas, 412, 2495, 5, pg_temp.code(777, 412, 2495, 7)) || '{"prijs_bron": "catalogus"}'::jsonb))) <> 0 then
        v_fouten := v_fouten || 'catalogusregel nagerekend als sticker; ';
    end if;

    -- ── 7. De catalogusversie gaat omhoog bij etiket, kiloprijs, allergenen, ingrediënten.
    set constraints all immediate;
    perform set_config(v_vlag, '', true);
    select versie into v_v from public.winkel_catalogus_versie where organization_id = v_org;
    update public.winkel_artikelen set etiket = etiket || '{"rauwe_melk": true}' where id = v_art;
    select versie into v_v2 from public.winkel_catalogus_versie where organization_id = v_org;
    if v_v2 is distinct from v_v + 1 then v_fouten := v_fouten || 'etiket zet de versie niet omhoog; '; end if;

    perform set_config(v_vlag, '', true);
    update public.winkel_artikelen set kiloprijs_cents = 2595 where id = v_art;
    select versie into v_v from public.winkel_catalogus_versie where organization_id = v_org;
    if v_v is distinct from v_v2 + 1 then v_fouten := v_fouten || 'kiloprijs zet de versie niet omhoog; '; end if;

    perform set_config(v_vlag, '', true);
    update public.winkel_producten set allergenen = array['melk', 'mosterd'] where id = v_kaas;
    select versie into v_v2 from public.winkel_catalogus_versie where organization_id = v_org;
    if v_v2 is distinct from v_v + 1 then v_fouten := v_fouten || 'allergenen zetten de versie niet omhoog; '; end if;

    perform set_config(v_vlag, '', true);
    update public.winkel_producten set ingredienten = array['*melk*', 'zout', '*mosterd*'] where id = v_kaas;
    select versie into v_v from public.winkel_catalogus_versie where organization_id = v_org;
    if v_v is distinct from v_v2 + 1 then v_fouten := v_fouten || 'ingrediënten zetten de versie niet omhoog; '; end if;

    -- Iets wat de Toonbank niet ziet, zet de versie niet omhoog.
    perform set_config(v_vlag, '', true);
    update public.winkel_producten set tht = '2026-12-01' where id = v_kaas;
    select versie into v_v2 from public.winkel_catalogus_versie where organization_id = v_org;
    if v_v2 is distinct from v_v then v_fouten := v_fouten || 'tht zet de versie omhoog; '; end if;

    -- De catalogus geeft het nieuwe etiket.
    select e into v_r from jsonb_array_elements(public.toonbank_catalogus(v_org)->'artikelen') e where e->>'artikel_id' = v_art::text;
    if (v_r->'etiket'->>'rauwe_melk')::boolean is not true or (v_r->>'kiloprijs_cents')::int <> 2595
       or v_r->'etiket'->'allergenen' <> '["melk", "mosterd"]'::jsonb then
        v_fouten := v_fouten || 'catalogus geeft het nieuwe etiket niet: ' || coalesce(v_r::text, 'leeg') || '; ';
    end if;

    -- ── 8. Rechten.
    if has_function_privilege('authenticated', 'private.toonbank_controleer_sticker(jsonb)', 'EXECUTE')
       or has_function_privilege('anon', 'private.toonbank_controleer_sticker(jsonb)', 'EXECUTE') then
        v_fouten := v_fouten || 'rechten kloppen niet; ';
    end if;

    if v_fouten <> '' then raise exception 'FOUT: %', v_fouten; end if;
    raise exception 'GESLAAGD: 412 g × 2495 = 1028 verwerkt en 412 g af; 1029 = sticker_prijs maar geboekt; 300 g × 1995: 599 goed, 598 sticker_prijs; 1 g afgeboekt = sticker_gewicht; catalogusregel niet nagerekend; etiket, kiloprijs, allergenen en ingrediënten zetten de versie omhoog, tht niet; catalogus geeft het nieuwe etiket; rechten — alles teruggedraaid';
end $$;
