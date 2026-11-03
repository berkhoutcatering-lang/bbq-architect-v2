-- Test voor 20261103120000_winkel_stuks: partijen, stickers en stuks.
-- Draait in één transactie die aan het eind wordt teruggedraaid.
--
-- ALLEEN op de dev-database, nooit op live en nooit met --linked:
--   npm --prefix tools/testdb run test -- winkel_stuks
-- Vereist de seed supabase/tests/seed_vier_naober.sql.
--
-- Bewijst: catalogus geeft verkoop_per/kiloprijs/etiket; open partijen;
-- sticker vlees = stuk + ontvangst in gram (begint bij nul); kopie = niets;
-- sticker kaas = stuk zonder ontvangst; stickerregel op een bon = stuk
-- verkocht en gram af; tegenbon met goederen terug = stuk terug; bon vóór
-- de stickermelding = stuk meteen verkocht; afboeken = derving_tht en één
-- keer; stickerregel zonder gewicht = fout; THT-meldingsoorten; rechten.
--
-- Verwacht: "GESLAAGD: ..." als EXCEPTION.

create function pg_temp.sticker_code(p_plu int, p_gram int, p_kilo int, p_tht date, p_volg int)
returns text language sql as $$
    select '29' || lpad(p_plu::text, 5, '0') || lpad(p_gram::text, 5, '0') || lpad(p_kilo::text, 5, '0')
           || to_char(p_tht, 'YYMMDD') || lpad(p_volg::text, 4, '0') || '0'
$$;

create function pg_temp.sticker(p_gid uuid, p_volgnr bigint, p_artikel uuid, p_plu int, p_gram int, p_kilo int, p_tht date, p_volg int,
                                p_partij uuid default null, p_kopie boolean default false)
returns jsonb language sql as $$
    select jsonb_build_object('soort', 'sticker', 'gebeurtenis_id', p_gid, 'volgnummer', p_volgnr, 'moment', now() - interval '2 hours',
        'medewerker_id', null, 'artikel_id', p_artikel, 'plu', p_plu, 'code', pg_temp.sticker_code(p_plu, p_gram, p_kilo, p_tht, p_volg),
        'gewicht_g', p_gram, 'kiloprijs_cents', p_kilo, 'prijs_cents', round(p_gram::numeric * p_kilo / 1000)::int,
        'tht', p_tht, 'tht_hele_kaas', p_tht, 'kopie', p_kopie)
        || CASE WHEN p_partij IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('partij_id', p_partij) END
$$;

create function pg_temp.sticker_regel(p_nr int, p_artikel uuid, p_product uuid, p_aantal int, p_gram int, p_kilo int, p_code text, p_extra jsonb default '{}')
returns jsonb language sql as $$
    select jsonb_build_object('regelnr', p_nr, 'soort', 'verkoop', 'artikel_id', p_artikel, 'naam', 'TEST sticker', 'aantal', p_aantal,
        'stuk_cents', round(p_gram::numeric * p_kilo / 1000)::int, 'korting_cents', 0,
        'bedrag_cents', p_aantal * round(p_gram::numeric * p_kilo / 1000)::int,
        'btw', jsonb_build_array(jsonb_build_object('pct', 9, 'incl_cents', p_aantal * round(p_gram::numeric * p_kilo / 1000)::int)),
        'alcohol', false, 'onderdelen', jsonb_build_array(jsonb_build_object('product_id', p_product, 'hoeveelheid', p_gram, 'eenheid', 'gram')),
        'scan_code', p_code, 'prijs_bron', 'sticker', 'gewicht_g', p_gram, 'kiloprijs_cents', p_kilo) || p_extra
$$;

create function pg_temp.tb_bon(p_soort text, p_gid uuid, p_volgnr bigint, p_bonnummer text, p_regels jsonb, p_extra jsonb default '{}')
returns jsonb language sql as $$
    select jsonb_build_object('soort', p_soort, 'gebeurtenis_id', p_gid, 'volgnummer', p_volgnr, 'moment', now() - interval '1 hour',
        'medewerker_id', null, 'bon_id', p_gid, 'bonnummer', p_bonnummer, 'bon_volgnummer', split_part(p_bonnummer, '-', 2)::int,
        'status', 'afgerond', 'kanaal', 'winkel', 'catalogus_versie', 1, 'leeftijd', null,
        'regels', p_regels || jsonb_build_array(jsonb_build_object('regelnr', 99, 'soort', 'betaling', 'betaalmethode', 'pin',
            'betaal_bevestiging', 'handmatig', 'bedrag_cents', (select coalesce(sum((r->>'bedrag_cents')::int), 0) from jsonb_array_elements(p_regels) r))),
        'totaal_cents', (select coalesce(sum((r->>'bedrag_cents')::int), 0) from jsonb_array_elements(p_regels) r),
        'afronding_cents', 0) || p_extra
$$;

create function pg_temp.tb_stuur(p_org uuid, p_app uuid, p_m jsonb)
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
    v_org      uuid;
    v_sfx      text := substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);
    v_hash     text := repeat('a', 32) || ':' || repeat('b', 128);
    v_app      uuid;
    v_code     text;
    v_vlees    uuid;
    v_kaas     uuid;
    v_a_vlees  uuid;
    v_a_kaas   uuid;
    v_partij   uuid;
    v_lev      int;
    v_tht      date := '2026-11-20';
    v_c1       text;
    v_c2       text;
    v_c3       text;
    v_vnr      bigint := 0;
    v_bnr      int := 0;
    v_b1       uuid := gen_random_uuid();
    v_t1       uuid := gen_random_uuid();
    v_b2       uuid := gen_random_uuid();
    v_b3       uuid := gen_random_uuid();
    v_j        public.toonbank_journaal%rowtype;
    v_stuk     public.winkel_stuks%rowtype;
    v_r        jsonb;
    v_art      jsonb;
    v_n        int;
    v_fouten   text := '';
begin
    select id into v_org from public.organizations where slug = 'e2e-hop-en-bites';
    if v_org is null then
        raise exception 'GEWEIGERD: organisatie e2e-hop-en-bites bestaat niet. Deze test draait alleen op de dev-database, na de seed.';
    end if;

    v_r := public.toonbank_apparaat_nieuw(v_org, 'TEST stuks ' || v_sfx, 'winkel', v_hash);
    v_app := (v_r->>'apparaat_id')::uuid; v_code := v_r->>'code';

    insert into public.leveranciers (organization_id, naam) values (v_org, 'TEST Veerbeek ' || v_sfx) returning id into v_lev;
    insert into public.winkel_producten (organization_id, naam, type, eenheid, prijs_per, btw_pct, binnen_per_sticker, allergenen)
    values (v_org, 'TEST nagelhout ' || v_sfx, 'vleeswaar', 'gram', 1000, 9, true, '{}') returning id into v_vlees;
    insert into public.winkel_producten (organization_id, naam, type, eenheid, prijs_per, btw_pct, allergenen, ingredienten)
    values (v_org, 'TEST oude kaas ' || v_sfx, 'kaas', 'gram', 1000, 9, array['melk'], array['*melk*', 'zout']) returning id into v_kaas;
    -- Geteld vóór de bonnen van een uur geleden (anders is het een bon van vóór de telling).
    perform public.winkel_muteer_voorraad(v_org, v_kaas, 'telling', 2000, p_gebeurd_at => now() - interval '3 hours');

    insert into public.winkel_artikelen (organization_id, slug, naam, prijs_cents, btw_pct, actief, kanalen, toonbank_groep,
                                         verkoop_per, kiloprijs_cents, sticker_plu, etiket)
    values (v_org, 'test-nagelhout-' || v_sfx, 'TEST Nagelhout', 5990, 9, true, array['toonbank'], 'Vlees',
            'kg', 5990, 624, '{"bewaren": "gekoeld bewaren (max. 7 °C)", "beschermende_atmosfeer": true}') returning id into v_a_vlees;
    insert into public.winkel_artikelen (organization_id, slug, naam, prijs_cents, btw_pct, actief, kanalen, toonbank_groep,
                                         verkoop_per, kiloprijs_cents, sticker_plu, etiket)
    values (v_org, 'test-oude-kaas-' || v_sfx, 'TEST Oude kaas', 2495, 9, true, array['toonbank'], 'Kaas',
            'kg', 2495, 101, '{"houdbaar_dagen": 14, "rauwe_melk": false}') returning id into v_a_kaas;
    insert into public.winkel_artikel_slots (organization_id, artikel_id, volgorde, slot_type, naam, hoeveelheid, eenheid, per, standaard_product_id) values
        (v_org, v_a_vlees, 0, 'vleeswaar', 'Nagelhout', 1, 'gram', 'stuk', v_vlees),
        (v_org, v_a_kaas, 0, 'kaas', 'Oude kaas', 1, 'gram', 'stuk', v_kaas);

    -- Een kg-artikel zonder kiloprijs of stickernummer kan niet.
    begin
        insert into public.winkel_artikelen (organization_id, slug, naam, prijs_cents, btw_pct, actief, kanalen, verkoop_per)
        values (v_org, 'test-kg-leeg-' || v_sfx, 'TEST kg leeg', 100, 9, true, array['toonbank'], 'kg');
        v_fouten := v_fouten || 'kg zonder kiloprijs toegestaan; ';
    exception when check_violation then null;
    end;

    insert into public.winkel_partijen (organization_id, winkel_product_id, leverancier_id, productiedatum, tht, bron)
    values (v_org, v_vlees, v_lev, '2026-11-10', v_tht, 'a4') returning id into v_partij;

    -- ── 1. Catalogus en partijen.
    select e into v_art from jsonb_array_elements(public.toonbank_catalogus(v_org)->'artikelen') e where e->>'artikel_id' = v_a_vlees::text;
    if v_art->>'verkoop_per' <> 'kg' or (v_art->>'kiloprijs_cents')::int <> 5990 or (v_art->'etiket'->>'plu')::int <> 624
       or (v_art->'etiket'->>'tht_uit_partij')::boolean is not true or (v_art->'etiket'->>'beschermende_atmosfeer')::boolean is not true then
        v_fouten := v_fouten || 'catalogus vlees: ' || coalesce(v_art::text, 'ontbreekt') || '; ';
    end if;
    select e into v_art from jsonb_array_elements(public.toonbank_catalogus(v_org)->'artikelen') e where e->>'artikel_id' = v_a_kaas::text;
    if v_art->'etiket'->'allergenen' <> '["melk"]'::jsonb or v_art->'etiket'->>'ingredienten' <> '*melk*, zout'
       or (v_art->'etiket'->>'houdbaar_dagen')::int <> 14 or (v_art->'etiket'->>'tht_uit_partij')::boolean then
        v_fouten := v_fouten || 'catalogus kaas: ' || coalesce(v_art::text, 'ontbreekt') || '; ';
    end if;
    v_r := public.toonbank_partijen(v_org);
    if not exists (select 1 from jsonb_array_elements(v_r->'partijen') p
                    where p->>'partij_id' = v_partij::text and p->>'tht' = v_tht::text and p->'artikel_ids' ? v_a_vlees::text
                      and p->>'leverancier' like 'TEST Veerbeek%') then
        v_fouten := v_fouten || 'partijen: ' || v_r::text || '; ';
    end if;

    -- ── 2. Sticker vlees: stuk + ontvangst, product begint bij nul.
    v_c1 := pg_temp.sticker_code(624, 116, 5990, v_tht, 1);
    v_vnr := v_vnr + 1;
    v_j := pg_temp.tb_stuur(v_org, v_app, pg_temp.sticker(gen_random_uuid(), v_vnr, v_a_vlees, 624, 116, 5990, v_tht, 1, v_partij));
    select * into v_stuk from public.winkel_stuks where organization_id = v_org and code = v_c1;
    if v_j.verwerk_status <> 'verwerkt' or v_stuk.id is null or v_stuk.status <> 'op_voorraad' or v_stuk.partij_id <> v_partij
       or v_stuk.prijs_cents <> 695 or v_stuk.plu <> 624 or v_stuk.volgnummer <> 1 or v_stuk.winkel_product_id <> v_vlees then
        v_fouten := v_fouten || 'sticker 1: ' || row_to_json(v_j)::text || ' / ' || coalesce(row_to_json(v_stuk)::text, 'geen stuk') || '; ';
    end if;
    if (select voorraad from public.winkel_producten where id = v_vlees) <> 116
       or (select tht from public.winkel_producten where id = v_vlees) <> v_tht then
        v_fouten := v_fouten || 'voorraad na sticker 1 niet 116 g; ';
    end if;

    -- Een kopie (zelfde code) en dezelfde melding nog eens: niets erbij.
    v_vnr := v_vnr + 1;
    v_j := pg_temp.tb_stuur(v_org, v_app, pg_temp.sticker(gen_random_uuid(), v_vnr, v_a_vlees, 624, 116, 5990, v_tht, 1, v_partij, true));
    select count(*) into v_n from public.winkel_stuks where organization_id = v_org and code = v_c1;
    if v_j.verwerk_status <> 'niet_nodig' or v_n <> 1 or (select voorraad from public.winkel_producten where id = v_vlees) <> 116 then
        v_fouten := v_fouten || format('kopie: %s, %s stuks; ', v_j.verwerk_status, v_n);
    end if;

    v_c2 := pg_temp.sticker_code(624, 130, 5990, v_tht, 2);
    v_vnr := v_vnr + 1;
    v_j := pg_temp.tb_stuur(v_org, v_app, pg_temp.sticker(gen_random_uuid(), v_vnr, v_a_vlees, 624, 130, 5990, v_tht, 2, v_partij));
    if (select voorraad from public.winkel_producten where id = v_vlees) <> 246 then
        v_fouten := v_fouten || 'voorraad na sticker 2 niet 246 g; ';
    end if;

    -- ── 3. Sticker kaas: stuk, geen ontvangst (de kaas was al binnen).
    v_vnr := v_vnr + 1;
    v_j := pg_temp.tb_stuur(v_org, v_app, pg_temp.sticker(gen_random_uuid(), v_vnr, v_a_kaas, 101, 412, 2495, v_tht, 3));
    if v_j.verwerk_status <> 'verwerkt' or (select voorraad from public.winkel_producten where id = v_kaas) <> 2000
       or not exists (select 1 from public.winkel_stuks where organization_id = v_org and winkel_product_id = v_kaas and status = 'op_voorraad') then
        v_fouten := v_fouten || 'sticker kaas: ' || row_to_json(v_j)::text || '; ';
    end if;

    -- ── 4. Bon met sticker 1: stuk verkocht, 116 g af.
    v_vnr := v_vnr + 1; v_bnr := v_bnr + 1;
    v_j := pg_temp.tb_stuur(v_org, v_app, pg_temp.tb_bon('bon', v_b1, v_vnr, v_code || '-' || lpad(v_bnr::text, 6, '0'),
        jsonb_build_array(pg_temp.sticker_regel(1, v_a_vlees, v_vlees, 1, 116, 5990, v_c1))));
    select * into v_stuk from public.winkel_stuks where organization_id = v_org and code = v_c1;
    if v_j.verwerk_status <> 'verwerkt' or v_stuk.status <> 'verkocht' or v_stuk.verkocht_cents <> 695 or v_stuk.bon_regel_id is null
       or (select voorraad from public.winkel_producten where id = v_vlees) <> 130 then
        v_fouten := v_fouten || 'bon sticker 1: ' || row_to_json(v_j)::text || ' / ' || row_to_json(v_stuk)::text || '; ';
    end if;

    -- ── 5. Tegenbon met goederen terug: het stuk ligt weer.
    v_vnr := v_vnr + 1; v_bnr := v_bnr + 1;
    v_j := pg_temp.tb_stuur(v_org, v_app, pg_temp.tb_bon('tegenbon', v_t1, v_vnr, v_code || '-' || lpad(v_bnr::text, 6, '0'),
        jsonb_build_array(pg_temp.sticker_regel(1, v_a_vlees, v_vlees, -1, 116, 5990, v_c1, '{"verwijst_naar_regelnr": 1, "goederen_terug": true}'::jsonb)),
        jsonb_build_object('verwijst_naar_bon_id', v_b1, 'reden', 'verkeerd gescand')));
    select * into v_stuk from public.winkel_stuks where organization_id = v_org and code = v_c1;
    if v_j.verwerk_status <> 'verwerkt' or v_stuk.status <> 'op_voorraad' or v_stuk.bon_regel_id is not null
       or (select voorraad from public.winkel_producten where id = v_vlees) <> 246 then
        v_fouten := v_fouten || 'tegenbon: ' || row_to_json(v_j)::text || ' / ' || row_to_json(v_stuk)::text || '; ';
    end if;

    -- ── 6. De bon komt vóór de stickermelding: het stuk is meteen verkocht.
    v_c3 := pg_temp.sticker_code(101, 250, 2495, v_tht, 4);
    v_vnr := v_vnr + 1; v_bnr := v_bnr + 1;
    v_j := pg_temp.tb_stuur(v_org, v_app, pg_temp.tb_bon('bon', v_b2, v_vnr, v_code || '-' || lpad(v_bnr::text, 6, '0'),
        jsonb_build_array(pg_temp.sticker_regel(1, v_a_kaas, v_kaas, 1, 250, 2495, v_c3))));
    v_vnr := v_vnr + 1;
    v_j := pg_temp.tb_stuur(v_org, v_app, pg_temp.sticker(gen_random_uuid(), v_vnr, v_a_kaas, 101, 250, 2495, v_tht, 4));
    select * into v_stuk from public.winkel_stuks where organization_id = v_org and code = v_c3;
    if v_j.verwerk_status <> 'verwerkt' or v_stuk.status <> 'verkocht' or v_stuk.bon_regel_id is null
       or (select voorraad from public.winkel_producten where id = v_kaas) <> 1750 then
        v_fouten := v_fouten || 'bon vóór sticker: ' || coalesce(row_to_json(v_stuk)::text, 'geen stuk') || '; ';
    end if;

    -- ── 7. Afboeken: sticker 2 weg (derving_tht), en één keer.
    select * into v_stuk from public.winkel_stuks where organization_id = v_org and code = v_c2;
    v_r := public.winkel_stuk_afboeken(v_org, v_stuk.id, 'afgeschreven', 'over de datum');
    if (v_r->>'bestond')::boolean or (select status from public.winkel_stuks where id = v_stuk.id) <> 'afgeschreven'
       or (select voorraad from public.winkel_producten where id = v_vlees) <> 116
       or not exists (select 1 from public.winkel_voorraad_mutaties where winkel_product_id = v_vlees and type = 'afwijking'
                       and reden = 'derving_tht' and hoeveelheid = -130) then
        v_fouten := v_fouten || 'afboeken: ' || v_r::text || '; ';
    end if;
    v_r := public.winkel_stuk_afboeken(v_org, v_stuk.id, 'afgeschreven');
    if not (v_r->>'bestond')::boolean or (select voorraad from public.winkel_producten where id = v_vlees) <> 116 then
        v_fouten := v_fouten || 'twee keer afboeken: ' || v_r::text || '; ';
    end if;

    -- ── 8. Een stickerregel zonder gewicht: fout (Te controleren), niets geboekt.
    v_vnr := v_vnr + 1; v_bnr := v_bnr + 1;
    v_j := pg_temp.tb_stuur(v_org, v_app, pg_temp.tb_bon('bon', v_b3, v_vnr, v_code || '-' || lpad(v_bnr::text, 6, '0'),
        jsonb_build_array(pg_temp.sticker_regel(1, v_a_vlees, v_vlees, 1, 116, 5990, v_c1) - 'gewicht_g')));
    if v_j.verwerk_status <> 'fout' or (select status from public.winkel_stuks where organization_id = v_org and code = v_c1 and status = 'op_voorraad') is null then
        v_fouten := v_fouten || 'sticker zonder gewicht: ' || row_to_json(v_j)::text || '; ';
    end if;

    -- ── 9. THT-meldingen mogen in de staat.
    begin
        insert into public.voorraad_melding_staat (organization_id, bron, item_id, soort) values (v_org, 'winkel', v_vlees::text, 'tht_bijna');
    exception when others then
        v_fouten := v_fouten || 'tht_bijna niet toegestaan: ' || sqlerrm || '; ';
    end;

    -- ── 10. Rechten.
    if has_table_privilege('anon', 'public.winkel_stuks', 'SELECT') or has_table_privilege('authenticated', 'public.winkel_stuks', 'INSERT')
       or has_table_privilege('authenticated', 'public.winkel_stuks', 'UPDATE')
       or not has_table_privilege('authenticated', 'public.winkel_partijen', 'INSERT')
       or has_function_privilege('authenticated', 'public.toonbank_partijen(uuid)', 'EXECUTE')
       or has_function_privilege('anon', 'public.winkel_stuk_afboeken(uuid, uuid, text, text)', 'EXECUTE') then
        v_fouten := v_fouten || 'rechten kloppen niet; ';
    end if;

    if v_fouten <> '' then raise exception 'FOUT: %', v_fouten; end if;
    raise exception 'GESLAAGD: catalogus kg/kiloprijs/etiket (allergenen en ingrediënten van het product, THT uit partij bij vlees); open partij met leverancier; kg zonder kiloprijs geweigerd; sticker vlees = stuk + 116 g ontvangst vanaf nul, kopie = niet_nodig, tweede = 246 g; sticker kaas zonder ontvangst; bon = stuk verkocht en 116 g af; tegenbon = stuk terug; bon vóór sticker = meteen verkocht; afboeken = derving_tht −130 g en één keer; stickerregel zonder gewicht = fout; tht_bijna in de meldingstaat; rechten — alles teruggedraaid';
end $$;
