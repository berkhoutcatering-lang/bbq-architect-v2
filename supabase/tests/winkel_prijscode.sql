-- Test voor 20261118130000_winkel_prijscode en 20261119120000_winkel_prijscode_plu:
-- pakjes met de prijs in de code (Veerbeek, 21 PPPP K CCCCC E) binnenmelden en verkopen.
-- Draait in één transactie die aan het eind wordt teruggedraaid.
--
-- ALLEEN op de dev-database, nooit op live en nooit met --linked:
--   npm --prefix tools/testdb run test -- winkel_prijscode
-- Vereist de seed supabase/tests/seed_vier_naober.sql.
--
-- Bewijst: controlecijfers (EAN en prijscontrole K); binnenmelden onbekend → met
-- product = PLU gekoppeld; een andere prijs (andere K) vindt hetzelfde product;
-- PLU 0000 vraagt altijd en wordt nooit gekoppeld;
-- dezelfde code twee keer = twee pakjes; nummer van een ander product geweigerd;
-- catalogus geeft prijscode_nr; bon = oudste pakje (THT) verkocht, geen grammen;
-- prijs anders dan de code = prijscode_prijs maar geboekt; niet binnengemeld =
-- prijscode_niet_binnen; tegenbon met goederen terug = pakje terug; een
-- verkeerde scan weghalen; afboeken boekt geen voorraad; sticker blijft uniek; rechten.
--
-- Verwacht: "GESLAAGD: ..." als EXCEPTION.

-- Een geldige prijscode: 21 + PLU (4) + prijscontrole K + prijs (5) + EAN-controlecijfer.
create function pg_temp.pc(p_plu text, p_cents int)
returns text language sql as $$
    with b as (select '21' || p_plu || private.prijscode_prijscontrole(lpad(p_cents::text, 5, '0'))::text || lpad(p_cents::text, 5, '0') as c)
    select c || ((10 - (select sum(substr(c, i, 1)::int * case when i % 2 = 0 then 3 else 1 end) from generate_series(1, 12) i) % 10) % 10)::text from b
$$;

create function pg_temp.regel(p_nr int, p_artikel uuid, p_aantal int, p_stuk int, p_code text, p_extra jsonb default '{}')
returns jsonb language sql as $$
    select jsonb_build_object('regelnr', p_nr, 'soort', 'verkoop', 'artikel_id', p_artikel, 'naam', 'TEST pakje', 'aantal', p_aantal,
        'stuk_cents', p_stuk, 'korting_cents', 0, 'bedrag_cents', p_aantal * p_stuk,
        'btw', jsonb_build_array(jsonb_build_object('pct', 9, 'incl_cents', p_aantal * p_stuk)),
        'alcohol', false, 'onderdelen', '[]'::jsonb, 'scan_code', p_code, 'prijs_bron', 'prijscode') || p_extra
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
    v_org    uuid;
    v_sfx    text := substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);
    v_hash   text := repeat('a', 32) || ':' || repeat('b', 128);
    v_app    uuid;
    v_code   text;
    v_haas   uuid;
    v_ander  uuid;
    v_art    uuid;
    v_c      text;
    v_c2     text;
    v_twaalf text;
    v_vnr    bigint := 0;
    v_bnr    int := 0;
    v_b1     uuid := gen_random_uuid();
    v_j      public.toonbank_journaal%rowtype;
    v_r      jsonb;
    v_w      jsonb;
    v_stuk   public.winkel_stuks%rowtype;
    v_n      int;
    v_fouten text := '';
begin
    select id into v_org from public.organizations where slug = 'e2e-hop-en-bites';
    if v_org is null then
        raise exception 'GEWEIGERD: organisatie e2e-hop-en-bites bestaat niet. Deze test draait alleen op de dev-database, na de seed.';
    end if;
    v_r := public.toonbank_apparaat_nieuw(v_org, 'TEST prijscode ' || v_sfx, 'winkel', v_hash);
    v_app := (v_r->>'apparaat_id')::uuid; v_code := v_r->>'code';

    -- Haasbiefstuk zoals het in de winkel staat: per 100 gram, voorraad niet bijgehouden.
    insert into public.winkel_producten (organization_id, naam, type, eenheid, prijs_per, winkelprijs_incl_cents, btw_pct, actief)
    values (v_org, 'TEST haasbiefstuk ' || v_sfx, 'vleeswaar', 'gram', 100, 899, 9, true) returning id into v_haas;
    insert into public.winkel_producten (organization_id, naam, type, eenheid, prijs_per, winkelprijs_incl_cents, btw_pct, actief, prijscode_nr)
    values (v_org, 'TEST kogelbiefstuk ' || v_sfx, 'vleeswaar', 'gram', 100, 425, 9, true, '9102') returning id into v_ander;
    insert into public.winkel_artikelen (organization_id, slug, naam, eenheid, prijs_cents, btw_pct, actief, publiek, kanalen, toonbank_groep)
    values (v_org, 'test-haas-' || v_sfx, 'TEST Haasbiefstuk', 'per 100 gram', 899, 9, true, false, array['toonbank'], 'Vers vlees') returning id into v_art;
    insert into public.winkel_artikel_slots (organization_id, artikel_id, volgorde, slot_type, naam, hoeveelheid, eenheid, per, standaard_product_id)
    values (v_org, v_art, 1, 'vleeswaar', 'Haasbiefstuk', 100, 'gram', 'stuk', v_haas);

    -- ── 1. De controlecijfers (echte stickers: haasbiefstuk pakje en krat, gekruid gehakt).
    if not private.prijscode_geldig('2101015028237') or not private.prijscode_geldig('2101012076774')
       or not private.prijscode_geldig('2100007066967') or private.prijscode_geldig('2101015028230')
       or private.prijscode_geldig('2901015028237') or private.prijscode_geldig('210101502823') then
        v_fouten := v_fouten || 'controlecijfer; ';
    end if;
    -- K 4 in plaats van 5, met een EAN-controlecijfer dat wel klopt: toch ongeldig.
    v_twaalf := '210101402823';
    if private.prijscode_geldig(v_twaalf || ((10 - (select sum(substr(v_twaalf, i, 1)::int * case when i % 2 = 0 then 3 else 1 end) from generate_series(1, 12) i) % 10) % 10)::text) then
        v_fouten := v_fouten || 'prijscontrolecijfer niet gecontroleerd; ';
    end if;

    -- ── 2. Binnenmelden.
    v_c := pg_temp.pc('9101', 2823);
    v_r := public.winkel_stuk_binnen_prijscode(v_org, v_c, current_date + 3);
    if v_r->>'uitkomst' <> 'onbekend' or v_r->>'nr' <> '9101' or (v_r->>'gedeeld')::boolean then v_fouten := v_fouten || 'onbekend nummer: ' || v_r::text || '; '; end if;
    v_r := public.winkel_stuk_binnen_prijscode(v_org, v_c, current_date + 3, v_haas);
    if v_r->>'uitkomst' <> 'binnen' or (v_r->>'prijs_cents')::int <> 2823
       or (select prijscode_nr from public.winkel_producten where id = v_haas) <> '9101' then
        v_fouten := v_fouten || 'binnen met product: ' || v_r::text || '; ';
    end if;
    -- Dezelfde code nog eens (pakje met dezelfde prijs, latere THT) = een tweede pakje, nu zonder product te kiezen.
    v_r := public.winkel_stuk_binnen_prijscode(v_org, v_c, current_date + 6);
    select count(*) into v_n from public.winkel_stuks where organization_id = v_org and code = v_c and status = 'op_voorraad';
    if v_r->>'uitkomst' <> 'binnen' or v_n <> 2 then v_fouten := v_fouten || 'tweede pakje: ' || v_n || '; '; end if;
    -- Een ander pakje van hetzelfde product met een andere prijs (dus een andere K): op de PLU gevonden.
    v_c2 := pg_temp.pc('9101', 7677);
    v_r := public.winkel_stuk_binnen_prijscode(v_org, v_c2, current_date + 3);
    if v_r->>'uitkomst' <> 'binnen' or (v_r->>'product_id')::uuid <> v_haas or (v_r->>'prijs_cents')::int <> 7677 then
        v_fouten := v_fouten || 'andere prijs niet op de PLU gevonden: ' || v_r::text || '; ';
    end if;
    if public.winkel_stuk_binnen_prijscode(v_org, '2101015028230', current_date)->>'uitkomst' <> 'controlecijfer' then
        v_fouten := v_fouten || 'fout controlecijfer binnen; ';
    end if;
    -- PLU 0000 deelt de slager: altijd vragen, met product binnen, maar nooit onthouden.
    v_r := public.winkel_stuk_binnen_prijscode(v_org, pg_temp.pc('0000', 6696), current_date + 3);
    if v_r->>'uitkomst' <> 'onbekend' or not (v_r->>'gedeeld')::boolean then v_fouten := v_fouten || '0000 niet gevraagd: ' || v_r::text || '; '; end if;
    v_r := public.winkel_stuk_binnen_prijscode(v_org, pg_temp.pc('0000', 6696), current_date + 3, v_ander);
    if v_r->>'uitkomst' <> 'binnen' or (select prijscode_nr from public.winkel_producten where id = v_ander) <> '9102' then
        v_fouten := v_fouten || '0000 gekoppeld of niet binnen: ' || v_r::text || '; ';
    end if;
    if public.winkel_stuk_binnen_prijscode(v_org, pg_temp.pc('0000', 5489), current_date + 3)->>'uitkomst' <> 'onbekend' then
        v_fouten := v_fouten || '0000 de tweede keer niet gevraagd; ';
    end if;
    begin
        update public.winkel_producten set prijscode_nr = '0000' where id = v_ander;
        v_fouten := v_fouten || 'prijscode_nr 0000 toegestaan; ';
    exception when check_violation then null;
    end;
    begin
        update public.winkel_producten set prijscode_nr = '91027' where id = v_ander;
        v_fouten := v_fouten || 'prijscode_nr van 5 cijfers toegestaan; ';
    exception when check_violation then null;
    end;
    begin
        perform public.winkel_stuk_binnen_prijscode(v_org, pg_temp.pc('9102', 500), current_date, v_haas);
        v_fouten := v_fouten || 'nummer van een ander product toegestaan; ';
    exception when unique_violation then null;
    end;

    -- ── 3. Catalogus.
    select e into v_r from jsonb_array_elements(public.toonbank_catalogus(v_org)->'artikelen') e where e->>'artikel_id' = v_art::text;
    if v_r->>'prijscode_nr' is distinct from '9101' then v_fouten := v_fouten || 'catalogus: ' || coalesce(v_r::text, 'leeg') || '; '; end if;

    -- ── 4. Verkocht: het pakje met de oudste THT, geen grammen.
    v_vnr := v_vnr + 1; v_bnr := v_bnr + 1;
    v_j := pg_temp.stuur(v_org, v_app, pg_temp.bon('bon', v_b1, v_vnr, v_code || '-' || lpad(v_bnr::text, 6, '0'),
        jsonb_build_array(pg_temp.regel(1, v_art, 1, 2823, v_c))));
    select * into v_stuk from public.winkel_stuks where organization_id = v_org and code = v_c and status = 'verkocht';
    if v_j.verwerk_status <> 'verwerkt' or v_stuk.id is null or v_stuk.tht <> current_date + 3 or v_stuk.verkocht_cents <> 2823
       or (select voorraad from public.winkel_producten where id = v_haas) is not null then
        v_fouten := v_fouten || 'verkoop: ' || coalesce(v_j.fout_melding, v_j.verwerk_status) || ' / ' || coalesce(row_to_json(v_stuk)::text, 'geen stuk') || '; ';
    end if;

    -- ── 5. Een andere prijs dan de code: geboekt, maar Te controleren.
    v_vnr := v_vnr + 1; v_bnr := v_bnr + 1;
    v_j := pg_temp.stuur(v_org, v_app, pg_temp.bon('bon', gen_random_uuid(), v_vnr, v_code || '-' || lpad(v_bnr::text, 6, '0'),
        jsonb_build_array(pg_temp.regel(1, v_art, 1, 2800, v_c))));
    if v_j.verwerk_status <> 'conflict' or v_j.fout_code <> 'prijscode_prijs'
       or exists (select 1 from public.winkel_stuks where organization_id = v_org and code = v_c and status = 'op_voorraad') then
        v_fouten := v_fouten || 'andere prijs: ' || row_to_json(v_j)::text || '; ';
    end if;

    -- ── 6. Niet binnengemeld: geboekt, maar Te controleren.
    v_vnr := v_vnr + 1; v_bnr := v_bnr + 1;
    v_j := pg_temp.stuur(v_org, v_app, pg_temp.bon('bon', gen_random_uuid(), v_vnr, v_code || '-' || lpad(v_bnr::text, 6, '0'),
        jsonb_build_array(pg_temp.regel(1, v_art, 1, 1999, pg_temp.pc('9101', 1999)))));
    if v_j.verwerk_status <> 'conflict' or v_j.fout_code <> 'prijscode_niet_binnen' then
        v_fouten := v_fouten || 'niet binnen: ' || row_to_json(v_j)::text || '; ';
    end if;

    -- ── 7. Vormfout: prijscode zonder 21-code = fout, niets geboekt.
    v_vnr := v_vnr + 1; v_bnr := v_bnr + 1;
    v_j := pg_temp.stuur(v_org, v_app, pg_temp.bon('bon', gen_random_uuid(), v_vnr, v_code || '-' || lpad(v_bnr::text, 6, '0'),
        jsonb_build_array(pg_temp.regel(1, v_art, 1, 500, '8712345678906'))));
    if v_j.verwerk_status <> 'fout' then v_fouten := v_fouten || 'vormfout: ' || v_j.verwerk_status || '; '; end if;

    -- ── 8. Tegenbon met goederen terug: het pakje ligt weer.
    v_vnr := v_vnr + 1; v_bnr := v_bnr + 1;
    v_j := pg_temp.stuur(v_org, v_app, pg_temp.bon('tegenbon', gen_random_uuid(), v_vnr, v_code || '-' || lpad(v_bnr::text, 6, '0'),
        jsonb_build_array(pg_temp.regel(1, v_art, -1, 2823, v_c, '{"verwijst_naar_regelnr": 1, "goederen_terug": true}'::jsonb)),
        jsonb_build_object('verwijst_naar_bon_id', v_b1, 'reden', 'verkeerd gescand')));
    select count(*) into v_n from public.winkel_stuks where organization_id = v_org and code = v_c and status = 'op_voorraad';
    if v_j.verwerk_status not in ('verwerkt', 'conflict') or v_n <> 1 then
        v_fouten := v_fouten || 'tegenbon: ' || v_n || ' / ' || row_to_json(v_j)::text || '; ';
    end if;

    -- ── 9. Een verkeerde scan weghalen; afboeken raakt de productvoorraad niet.
    v_r := public.winkel_stuk_binnen_prijscode(v_org, pg_temp.pc('9101', 3100), current_date + 2);
    v_w := public.winkel_stuk_weg(v_org, (v_r->>'stuk_id')::uuid);
    if (v_w->>'weg')::boolean is not true or exists (select 1 from public.winkel_stuks where id = (v_r->>'stuk_id')::uuid) then
        v_fouten := v_fouten || 'weghalen: ' || v_r::text || ' / ' || v_w::text || '; ';
    end if;
    perform public.winkel_muteer_voorraad(v_org, v_haas, 'telling', 5000);
    select id into v_stuk.id from public.winkel_stuks where organization_id = v_org and code = v_c and status = 'op_voorraad';
    perform public.winkel_stuk_afboeken(v_org, v_stuk.id, 'naar_keuken');
    if (select voorraad from public.winkel_producten where id = v_haas) <> 5000
       or (select status from public.winkel_stuks where id = v_stuk.id) <> 'naar_keuken' then
        v_fouten := v_fouten || 'afboeken boekte grammen; ';
    end if;
    if (public.winkel_stuk_weg(v_org, v_stuk.id)->>'weg')::boolean then
        v_fouten := v_fouten || 'een afgeboekt pakje mocht weg; ';
    end if;

    -- ── 10. Een eigen sticker blijft uniek zolang hij ligt; rechten.
    begin
        insert into public.winkel_stuks (organization_id, winkel_product_id, code, bron, prijs_cents, tht)
        values (v_org, v_haas, '2100000000000', 'sticker', 100, current_date);
        v_fouten := v_fouten || 'sticker zonder gewicht toegestaan; ';
    exception when check_violation then null;
    end;
    if has_function_privilege('anon', 'public.winkel_stuk_binnen_prijscode(uuid, text, date, uuid)', 'EXECUTE')
       or has_function_privilege('anon', 'public.winkel_stuk_weg(uuid, uuid)', 'EXECUTE')
       or not has_function_privilege('authenticated', 'public.winkel_stuk_binnen_prijscode(uuid, text, date, uuid)', 'EXECUTE')
       or has_function_privilege('authenticated', 'private.toonbank_controleer_prijscode(uuid, uuid)', 'EXECUTE') then
        v_fouten := v_fouten || 'rechten kloppen niet; ';
    end if;

    if v_fouten <> '' then raise exception 'FOUT: %', v_fouten; end if;
    raise exception 'GESLAAGD: controlecijfers (EAN en K); onbekend nummer → met product gekoppeld; andere prijs op de PLU gevonden; 0000 altijd gevraagd, nooit gekoppeld; alleen 4 cijfers; zelfde code = twee pakjes; nummer van ander product geweigerd; catalogus prijscode_nr; verkoop = oudste THT, geen grammen; andere prijs = prijscode_prijs; niet binnen = prijscode_niet_binnen; vormfout = fout; tegenbon = pakje terug; verkeerde scan weg; afboeken zonder grammen; sticker zonder gewicht geweigerd; rechten — alles teruggedraaid';
end $$;
