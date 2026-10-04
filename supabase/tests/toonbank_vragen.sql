-- Test voor BA-8 (migratie 20261006150000_toonbank_vragen): toonbank_catalogus,
-- toonbank_vrij, toonbank_wegzet_vraag (met journaal en idempotentie),
-- toonbank_afhaallijst en scan_resolve. Draait in één transactie die aan het
-- eind wordt teruggedraaid.
--
-- ALLEEN op de dev-database, nooit op live en nooit met --linked:
--
--   npx supabase db query --db-url "$DEV_DB_URL" -o table -f supabase/tests/toonbank_vragen.sql
--
-- of lokaal: npm --prefix tools/testdb run test -- toonbank_vragen
-- Vereist de seed supabase/tests/seed_vier_naober.sql.
--
-- Verwacht: "GESLAAGD: ..." als EXCEPTION.

do $$
declare
    v_org       uuid;
    v_sfx       text := substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);
    v_hash      text := repeat('a', 32) || ':' || repeat('b', 128);
    v_ean       text := '21' || lpad((floor(random() * 1e10))::bigint::text, 10, '0') || '7';
    v_ean_web   text := '22' || lpad((floor(random() * 1e10))::bigint::text, 10, '0') || '7';
    v_app       uuid;
    v_mw        uuid;
    v_naober    uuid;
    v_worst     uuid;
    v_los       uuid;
    v_a_los     uuid;
    v_a_pak     uuid;
    v_a_web     uuid;
    v_a_leeg    uuid;
    v_a_geenprijs uuid;
    v_a_zonderslot uuid;
    v_moment    uuid;
    v_dag       date := (now() at time zone 'Europe/Amsterdam')::date + 2;
    v_o         public.winkel_orders%rowtype;
    v_a         bigint;
    v_b         bigint;
    v_c         bigint;
    v_regel_c   bigint;
    v_doos      text;
    v_cat       jsonb;
    v_art       jsonb;
    v_vrij      jsonb;
    v_p         jsonb;
    v_r         jsonb;
    v_r2        jsonb;
    v_lijst     jsonb;
    v_g1        uuid := gen_random_uuid();
    v_g2        uuid := gen_random_uuid();
    v_n         int;
    v_n2        int;
    v_fouten    text := '';
begin
    select id into v_org from public.organizations where slug = 'e2e-hop-en-bites';
    if v_org is null then
        raise exception 'GEWEIGERD: organisatie e2e-hop-en-bites bestaat niet. Deze test draait alleen op de dev-database, na supabase/tests/seed_vier_naober.sql.';
    end if;

    v_app := (public.toonbank_apparaat_nieuw(v_org, 'TEST vragen ' || v_sfx, 'winkel', v_hash)->>'apparaat_id')::uuid;
    insert into public.personeel (organization_id, naam, toonbank_rol) values (v_org, 'TEST Sanne', 'medewerker') returning id into v_mw;

    -- ── Opzet: producten, artikelen (los, pakket, alleen webshop, leeg slot, zonder prijs).
    insert into public.winkel_producten (organization_id, naam, type, eenheid, prijs_per, winkelprijs_incl_cents, btw_pct, alcohol, ean, statiegeld_cents)
    values (v_org, 'TEST Naober ' || v_sfx, 'bier', 'stuk', 1, 345, 21, true, v_ean, 15) returning id into v_naober;
    insert into public.winkel_producten (organization_id, naam, type, eenheid, prijs_per, winkelprijs_incl_cents, btw_pct, alcohol)
    values (v_org, 'TEST worst ' || v_sfx, 'worst', 'stuk', 1, 600, 9, false) returning id into v_worst;
    insert into public.winkel_producten (organization_id, naam, type, eenheid, prijs_per, btw_pct, alcohol, ean)
    values (v_org, 'TEST webshopwaar ' || v_sfx, 'overig', 'stuk', 1, 9, false, v_ean_web) returning id into v_los;
    perform public.winkel_muteer_voorraad(v_org, v_naober, 'telling', 6);
    perform public.winkel_muteer_voorraad(v_org, v_worst, 'telling', 10);

    insert into public.winkel_artikelen (organization_id, slug, naam, prijs_cents, btw_pct, actief, afhandeling, kanalen, toonbank_groep, toonbank_volgorde, toonbank_favoriet)
    values (v_org, 'test-tb-los-' || v_sfx, 'TEST Naober los', 345, 21, true, 'wegzetten', array['webshop', 'toonbank'], 'Bier', 2, true) returning id into v_a_los;
    insert into public.winkel_artikelen (organization_id, slug, naam, prijs_cents, btw_pct, actief, kanalen, toonbank_groep, toonbank_volgorde)
    values (v_org, 'test-tb-pak-' || v_sfx, 'TEST pakket', 1495, 21, true, array['toonbank'], 'Voor erbij!', 1) returning id into v_a_pak;
    insert into public.winkel_artikelen (organization_id, slug, naam, prijs_cents, btw_pct, actief, kanalen)
    values (v_org, 'test-tb-web-' || v_sfx, 'TEST alleen webshop', 500, 9, true, array['webshop']) returning id into v_a_web;
    insert into public.winkel_artikelen (organization_id, slug, naam, prijs_cents, btw_pct, actief, kanalen)
    values (v_org, 'test-tb-leeg-' || v_sfx, 'TEST leeg slot', 500, 9, true, array['toonbank']) returning id into v_a_leeg;
    insert into public.winkel_artikelen (organization_id, slug, naam, prijs_cents, btw_pct, actief, kanalen)
    values (v_org, 'test-tb-geenprijs-' || v_sfx, 'TEST prijs volgt', null, 9, true, array['toonbank']) returning id into v_a_geenprijs;
    -- Review M2 (klein 2): een toonbankartikel zonder enig slot boekt geen voorraad af; niet in de catalogus.
    insert into public.winkel_artikelen (organization_id, slug, naam, prijs_cents, btw_pct, actief, kanalen)
    values (v_org, 'test-tb-zonderslot-' || v_sfx, 'TEST zonder slot', 500, 9, true, array['toonbank']) returning id into v_a_zonderslot;

    insert into public.winkel_artikel_slots (organization_id, artikel_id, volgorde, slot_type, naam, hoeveelheid, eenheid, per, standaard_product_id) values
        (v_org, v_a_los, 0, 'bier', 'Naober', 1, 'stuk', 'stuk', v_naober),
        (v_org, v_a_pak, 0, 'bier', 'Naober', 3, 'stuk', 'stuk', v_naober),
        (v_org, v_a_pak, 1, 'worst', 'Worst', 1, 'stuk', 'stuk', v_worst),
        (v_org, v_a_web, 0, 'overig', 'Webshopwaar', 1, 'stuk', 'stuk', v_los),
        (v_org, v_a_leeg, 0, 'overig', 'Nog kiezen', 1, 'stuk', 'stuk', null),
        (v_org, v_a_geenprijs, 0, 'worst', 'Worst', 1, 'stuk', 'stuk', v_worst);

    -- ── 1. Catalogus.
    v_cat := public.toonbank_catalogus(v_org);
    if (v_cat->>'versie')::bigint is distinct from coalesce((select versie from public.winkel_catalogus_versie where organization_id = v_org), 0)
       or (v_cat->>'volledig')::boolean is not true then
        v_fouten := v_fouten || 'catalogus versie/volledig: ' || (v_cat->>'versie') || '; ';
    end if;
    select count(*) into v_n from jsonb_array_elements(v_cat->'artikelen') e
     where (e->>'artikel_id')::uuid in (v_a_web, v_a_leeg, v_a_geenprijs, v_a_zonderslot);
    if v_n <> 0 then v_fouten := v_fouten || 'webshop-artikel, leeg slot, zonder prijs of zonder slot staat in de catalogus; '; end if;

    select e into v_art from jsonb_array_elements(v_cat->'artikelen') e where (e->>'artikel_id')::uuid = v_a_los;
    if v_art is null then
        v_fouten := v_fouten || 'los artikel ontbreekt; ';
    elsif v_art->>'groep' <> 'bier' or (v_art->>'favoriet')::boolean is not true or (v_art->>'alcohol')::boolean is not true
          or v_art->'btw_verdeling' <> 'null'::jsonb or (v_art->>'prijs_cents')::int <> 345 or (v_art->>'volgorde')::int <> 2
          or v_art->'onderdelen' <> jsonb_build_array(jsonb_build_object('product_id', v_naober, 'hoeveelheid', 1, 'eenheid', 'stuk'))
          or v_art->'kanalen' <> '["webshop", "toonbank"]'::jsonb then
        v_fouten := v_fouten || 'los artikel: ' || v_art::text || '; ';
    end if;

    select e into v_art from jsonb_array_elements(v_cat->'artikelen') e where (e->>'artikel_id')::uuid = v_a_pak;
    if v_art is null then
        v_fouten := v_fouten || 'pakket ontbreekt; ';
    elsif v_art->'btw_verdeling' <> '[{"pct": 21, "gewicht": 1035}, {"pct": 9, "gewicht": 600}]'::jsonb
          or v_art->>'groep' <> 'voor-erbij' or (v_art->>'alcohol')::boolean is not true or jsonb_array_length(v_art->'onderdelen') <> 2
          or v_art->'foto' <> 'null'::jsonb then
        v_fouten := v_fouten || 'pakket: ' || v_art::text || '; ';
    end if;

    if not exists (select 1 from jsonb_array_elements(v_cat->'codes') e where e->>'code' = v_ean and (e->>'artikel_id')::uuid = v_a_los and e->>'soort' = 'ean') then
        v_fouten := v_fouten || 'EAN wijst niet naar het losse artikel: ' || (v_cat->'codes')::text || '; ';
    end if;
    if exists (select 1 from jsonb_array_elements(v_cat->'codes') e where e->>'code' = v_ean_web) then
        v_fouten := v_fouten || 'EAN van een webshop-artikel in de catalogus; ';
    end if;
    select e into v_p from jsonb_array_elements(v_cat->'producten') e where (e->>'product_id')::uuid = v_naober;
    if v_p is null or (v_p->>'statiegeld_cents')::int <> 15 or (v_p->>'voorraad_bijgehouden')::boolean is not true or (v_p->>'alcohol')::boolean is not true then
        v_fouten := v_fouten || 'product Naober: ' || coalesce(v_p::text, 'ontbreekt') || '; ';
    end if;
    if exists (select 1 from jsonb_array_elements(v_cat->'producten') e where (e->>'product_id')::uuid = v_los) then
        v_fouten := v_fouten || 'product van een webshop-artikel in de catalogus; ';
    end if;
    if not exists (select 1 from jsonb_array_elements(v_cat->'groepen') e where e->>'groep_id' = 'bier' and e->>'naam' = 'Bier' and (e->>'open_prijs')::boolean is false)
       or not exists (select 1 from jsonb_array_elements(v_cat->'groepen') e where e->>'groep_id' = 'voor-erbij' and e->>'naam' = 'Voor erbij!') then
        v_fouten := v_fouten || 'groepen: ' || (v_cat->'groepen')::text || '; ';
    end if;

    -- ── 2. Orders: A betaald (4 Naober, wegzetten) op dag D; B niet betaald; C betaald pakket met een doos.
    insert into public.winkel_momenten (organization_id, groep, datum, van, tot, capaciteit, actief)
    values (v_org, 'test-vragen', v_dag, '14:00', '17:00', null, true) returning id into v_moment;
    v_o := public.winkel_plaats_order(v_org, 'test-sleutel-' || gen_random_uuid(), 'test-token-' || gen_random_uuid(), 'afhalen', v_moment,
        'Jansen', 'jansen-' || v_sfx || '@example.invalid', '0612345678', null, null, 1380, 0, 1380, '{}'::jsonb, 'https://example.invalid',
        jsonb_build_array(jsonb_build_object('artikel_id', v_a_los, 'slug', 'test-tb-los', 'naam', 'TEST Naober los', 'aantal', 4, 'eenheid', 'per stuk',
            'stuk_cents', 345, 'bedrag_cents', 1380, 'btw_pct', 21, 'eenheden', 1, 'voorraad_eenheden', 0, 'alcohol', true,
            'componenten', jsonb_build_array(jsonb_build_object('product_id', v_naober, 'slot_type', 'bier', 'naam', 'Naober', 'hoeveelheid', 4, 'eenheid', 'stuk')))));
    update public.winkel_orders set status = 'betaald', betaald_at = now() where id = v_o.id;
    v_a := v_o.id;
    v_o := public.winkel_plaats_order(v_org, 'test-sleutel-' || gen_random_uuid(), 'test-token-' || gen_random_uuid(), 'afhalen', v_moment,
        'Pietersen', 'p@example.invalid', null, null, null, 345, 0, 345, '{}'::jsonb, 'https://example.invalid',
        jsonb_build_array(jsonb_build_object('artikel_id', v_a_los, 'slug', 'test-tb-los', 'naam', 'TEST Naober los', 'aantal', 1, 'eenheid', 'per stuk',
            'stuk_cents', 345, 'bedrag_cents', 345, 'btw_pct', 21, 'eenheden', 1, 'voorraad_eenheden', 0, 'alcohol', true,
            'componenten', jsonb_build_array(jsonb_build_object('product_id', v_naober, 'slot_type', 'bier', 'naam', 'Naober', 'hoeveelheid', 1, 'eenheid', 'stuk')))));
    v_b := v_o.id;   -- blijft 'wacht' met een lopende reservering
    v_o := public.winkel_plaats_order(v_org, 'test-sleutel-' || gen_random_uuid(), 'test-token-' || gen_random_uuid(), 'afhalen', v_moment,
        'De Vries', 'dv@example.invalid', null, null, null, 1495, 0, 1495, '{}'::jsonb, 'https://example.invalid',
        jsonb_build_array(jsonb_build_object('artikel_id', v_a_pak, 'slug', 'test-tb-pak', 'naam', 'TEST pakket', 'aantal', 1, 'eenheid', 'per stuk',
            'stuk_cents', 1495, 'bedrag_cents', 1495, 'btw_pct', 21, 'eenheden', 1, 'voorraad_eenheden', 0, 'alcohol', true,
            'componenten', jsonb_build_array(jsonb_build_object('product_id', v_worst, 'slot_type', 'worst', 'naam', 'Worst', 'hoeveelheid', 1, 'eenheid', 'stuk')))));
    update public.winkel_orders set status = 'betaald', betaald_at = now() where id = v_o.id;
    v_c := v_o.id;
    select id into v_regel_c from public.winkel_order_regels where order_id = v_c;
    v_r := public.winkel_dozen_voor_regel(v_org, v_regel_c, array['TEST pakket']);
    v_doos := v_r->0->>'code';

    -- ── 3. Vrij: Naober 6 / 5 (4 betaald + 1 lopende reservering) / 1, met reserveringen zonder contactgegevens.
    v_vrij := public.toonbank_vrij(v_org);
    select e into v_p from jsonb_array_elements(v_vrij->'producten') e where (e->>'product_id')::uuid = v_naober;
    if v_p is null or (v_p->>'ligt_er')::numeric <> 6 or (v_p->>'gereserveerd')::numeric <> 5 or (v_p->>'vrij')::numeric <> 1
       or v_p->>'eenheid' <> 'stuk' or (v_p->>'bijgehouden')::boolean is not true or jsonb_array_length(v_p->'reserveringen') <> 2 then
        v_fouten := v_fouten || 'vrij Naober: ' || coalesce(v_p::text, 'ontbreekt') || '; ';
    elsif not exists (select 1 from jsonb_array_elements(v_p->'reserveringen') r
                       where (r->>'order_id')::bigint = v_a and r->>'naam' = 'Jansen' and (r->>'aantal')::numeric = 4 and r->>'afhaalmoment' is not null) then
        v_fouten := v_fouten || 'reservering Jansen: ' || (v_p->'reserveringen')::text || '; ';
    end if;
    if v_vrij::text ~ '@example\.invalid|0612345678' then v_fouten := v_fouten || 'vrij bevat e-mail of telefoon; '; end if;
    if (v_vrij->>'versie')::bigint is distinct from (public.winkel_voorraad_stand(v_org)->>'versie')::bigint or v_vrij->>'vrij_verloopt_at' is null then
        v_fouten := v_fouten || 'vrij versie/verloopt: ' || (v_vrij->>'versie') || '/' || coalesce(v_vrij->>'vrij_verloopt_at', 'leeg') || '; ';
    end if;

    -- ── 4. Afhaallijst van dag D: A en C (betaald), niet B; alleen naam en nummer; de doos van C.
    v_lijst := public.toonbank_afhaallijst(v_org, v_dag);
    if v_lijst->>'datum' <> to_char(v_dag, 'YYYY-MM-DD') or (v_lijst->>'versie')::bigint <> public.toonbank_afhaallijst_versie(v_org) then
        v_fouten := v_fouten || 'afhaallijst kop: ' || (v_lijst - 'orders')::text || '; ';
    end if;
    select count(*) into v_n from jsonb_array_elements(v_lijst->'orders') e where (e->>'order_id')::bigint in (v_a, v_c);
    select count(*) into v_n2 from jsonb_array_elements(v_lijst->'orders') e where (e->>'order_id')::bigint = v_b;
    if v_n <> 2 or v_n2 <> 0 then v_fouten := v_fouten || format('afhaallijst: %s van A/C, %s van B; ', v_n, v_n2); end if;
    if v_lijst::text ~ '@example\.invalid|0612345678' then v_fouten := v_fouten || 'afhaallijst bevat e-mail of telefoon; '; end if;
    select e into v_p from jsonb_array_elements(v_lijst->'orders') e where (e->>'order_id')::bigint = v_a;
    if v_p->>'naam' <> 'Jansen' or (v_p->>'alcohol')::boolean is not true or (v_p->>'apart_gezet')::boolean is not false
       or v_p->>'status' <> 'betaald' or (v_p->>'rest_cents')::int <> 0 or v_p->>'afhaalmoment' is null or jsonb_array_length(v_p->'dozen') <> 0 then
        v_fouten := v_fouten || 'afhaalorder A: ' || coalesce(v_p::text, 'ontbreekt') || '; ';
    end if;
    select e into v_p from jsonb_array_elements(v_lijst->'orders') e where (e->>'order_id')::bigint = v_c;
    if jsonb_array_length(v_p->'dozen') <> 1 or v_p->'dozen'->0->>'code' <> v_doos or (v_p->'dozen'->0->>'volgnr')::int <> 1 then
        v_fouten := v_fouten || 'dozen C: ' || coalesce((v_p->'dozen')::text, 'ontbreekt') || '; ';
    end if;

    -- ── 5. Wegzetten vanaf de Toonbank.
    v_r := public.toonbank_wegzet_vraag(v_org, v_app, v_a, 'apart', v_g1, now(), v_mw, '1.1.0');
    if v_r->>'journaal' <> 'nieuw' or v_r->'resultaat'->>'uitkomst' <> 'apart' or (v_r->'resultaat'->>'ok')::boolean is not true
       or jsonb_array_length(v_r->'resultaat'->'boekingen') <> 1
       or (v_r->'resultaat'->'boekingen'->0->>'hoeveelheid')::numeric <> -4
       or v_r->'resultaat'->'boekingen'->0->>'type' <> 'verkoop_online' then
        v_fouten := v_fouten || 'apart: ' || v_r::text || '; ';
    end if;
    if not exists (select 1 from public.toonbank_journaal where organization_id = v_org and gebeurtenis_id = v_g1 and soort = 'wegzetten'
                     and volgnummer is null and verwerk_status = 'verwerkt' and apparaat_id = v_app
                     and payload->>'actie' = 'apart' and (payload->>'order_id')::bigint = v_a and (payload->>'medewerker_id')::uuid = v_mw) then
        v_fouten := v_fouten || 'journaalregel apart klopt niet; ';
    end if;
    if not exists (select 1 from public.winkel_voorraad_mutaties m join public.winkel_order_regels r on r.id = m.order_regel_id
                    where r.order_id = v_a and m.type = 'verkoop_online' and m.notitie like '%aan de toonbank door TEST Sanne%') then
        v_fouten := v_fouten || 'logboek zonder toonbank-notitie; ';
    end if;
    -- Herhaling met hetzelfde gebeurtenis_id: hetzelfde antwoord, niets geboekt.
    select count(*) into v_n from public.winkel_voorraad_mutaties where winkel_product_id = v_naober;
    v_r2 := public.toonbank_wegzet_vraag(v_org, v_app, v_a, 'apart', v_g1, now(), v_mw, '1.1.0');
    select count(*) into v_n2 from public.winkel_voorraad_mutaties where winkel_product_id = v_naober;
    if v_r2->>'journaal' <> 'bestond' or v_r2->'resultaat' <> v_r->'resultaat' or v_n2 <> v_n then
        v_fouten := v_fouten || format('herhaling: %s (mutaties %s → %s); ', v_r2->>'journaal', v_n, v_n2);
    end if;
    -- Een nieuw gebeurtenis_id: al_apart, niets geboekt, verwerk_status niet_nodig.
    v_r := public.toonbank_wegzet_vraag(v_org, v_app, v_a, 'apart', gen_random_uuid(), now(), v_mw);
    if v_r->'resultaat'->>'uitkomst' <> 'al_apart' then v_fouten := v_fouten || 'tweede afvinken: ' || v_r::text || '; '; end if;

    -- Afhaallijst: A staat nu apart.
    select e into v_p from jsonb_array_elements(public.toonbank_afhaallijst(v_org, v_dag)->'orders') e where (e->>'order_id')::bigint = v_a;
    if (v_p->>'apart_gezet')::boolean is not true then v_fouten := v_fouten || 'afhaallijst: A niet apart na afvinken; '; end if;

    -- Ongedaan (zelfde dag): retour +4.
    v_r := public.toonbank_wegzet_vraag(v_org, v_app, v_a, 'ongedaan', v_g2, now(), v_mw, '1.1.0', 'verkeerde krat');
    if v_r->'resultaat'->>'uitkomst' <> 'ongedaan' or (v_r->'resultaat'->'boekingen'->0->>'hoeveelheid')::numeric <> 4
       or v_r->'payload'->>'reden' <> 'verkeerde krat' then
        v_fouten := v_fouten || 'ongedaan: ' || v_r::text || '; ';
    end if;

    -- WV010: er liggen er 3 (telling), de order vraagt 4 → niets geboekt, uitkomst in het journaal.
    perform public.winkel_muteer_voorraad(v_org, v_naober, 'telling', 3);
    select count(*) into v_n from public.winkel_voorraad_mutaties where winkel_product_id = v_naober;
    v_r := public.toonbank_wegzet_vraag(v_org, v_app, v_a, 'apart', gen_random_uuid(), now(), v_mw);
    select count(*) into v_n2 from public.winkel_voorraad_mutaties where winkel_product_id = v_naober;
    if (v_r->'resultaat'->>'ok')::boolean is not false or v_r->'resultaat'->>'sqlstate' <> 'WV010'
       or v_r->'resultaat'->'detail'->>'wv_code' <> 'WV010'
       or (v_r->'resultaat'->'detail'->'tekorten'->0->>'ligt_er')::numeric <> 3
       or (v_r->'resultaat'->'detail'->'tekorten'->0->>'nodig')::numeric <> 4 or v_n2 <> v_n then
        v_fouten := v_fouten || 'WV010: ' || v_r::text || '; ';
    end if;
    if not exists (select 1 from public.toonbank_journaal where organization_id = v_org and soort = 'wegzetten' and fout_code = 'WV010' and verwerk_status = 'niet_nodig') then
        v_fouten := v_fouten || 'WV010 niet als niet_nodig in het journaal; ';
    end if;

    -- WV006 (B is niet betaald) en een onbekende order (P0002).
    v_r := public.toonbank_wegzet_vraag(v_org, v_app, v_b, 'apart', gen_random_uuid(), now(), v_mw);
    if v_r->'resultaat'->>'sqlstate' <> 'WV006' or v_r->'resultaat'->'detail'->>'status' <> 'wacht' then v_fouten := v_fouten || 'WV006: ' || v_r::text || '; '; end if;
    v_r := public.toonbank_wegzet_vraag(v_org, v_app, 999999999, 'apart', gen_random_uuid(), now(), v_mw);
    if v_r->'resultaat'->>'sqlstate' <> 'P0002' then v_fouten := v_fouten || 'onbekende order: ' || v_r::text || '; '; end if;
    begin
        perform public.toonbank_wegzet_vraag(v_org, v_app, v_a, 'weg', gen_random_uuid(), now(), v_mw);
        v_fouten := v_fouten || 'actie weg toegestaan; ';
    exception when invalid_parameter_value then null;
    end;

    -- Weigeringen tellen niet als "Te controleren".
    if (public.toonbank_status(v_org, v_app)->>'te_controleren')::int <> 0 then
        v_fouten := v_fouten || 'een weigering staat bij te controleren; ';
    end if;

    -- ── 6. Scannen.
    v_r := public.scan_resolve(v_org, v_ean);
    if v_r <> jsonb_build_object('soort', 'artikel', 'code', v_ean, 'artikel_id', v_a_los) then v_fouten := v_fouten || 'scan EAN: ' || v_r::text || '; '; end if;
    v_r := public.scan_resolve(v_org, upper(v_doos));
    if v_r <> jsonb_build_object('soort', 'doos', 'code', v_doos, 'order_id', v_c, 'nummer', (select nummer from public.winkel_orders where id = v_c)) then
        v_fouten := v_fouten || 'scan doos: ' || v_r::text || '; ';
    end if;
    if public.scan_resolve(v_org, v_ean_web)->>'soort' <> 'onbekend' then v_fouten := v_fouten || 'EAN van een webshop-artikel herkend; '; end if;
    if public.scan_resolve(v_org, 'kassabon') <> '{"soort": "onbekend", "code": "kassabon"}'::jsonb then v_fouten := v_fouten || 'onbekende code; '; end if;
    if public.scan_resolve(v_org, repeat('0', 64))->>'soort' <> 'onbekend' then v_fouten := v_fouten || 'onbekende dooscode; '; end if;

    -- ── 7. Rechten.
    if has_function_privilege('anon', 'public.scan_resolve(uuid, text)', 'EXECUTE')
       or has_function_privilege('authenticated', 'public.toonbank_catalogus(uuid)', 'EXECUTE')
       or has_function_privilege('authenticated', 'public.toonbank_wegzet_vraag(uuid, uuid, bigint, text, uuid, timestamp with time zone, uuid, text, text)', 'EXECUTE')
       or not has_function_privilege('service_role', 'public.toonbank_vrij(uuid)', 'EXECUTE') then
        v_fouten := v_fouten || 'rechten kloppen niet; ';
    end if;

    if v_fouten <> '' then raise exception 'FOUT: %', v_fouten; end if;
    raise exception 'GESLAAGD: catalogus alleen toonbank-artikelen met prijs, met minstens één slot en zonder leeg slot, groep-slug, pakket-btw-verdeling 1035/600, EAN → één-slot-artikel, statiegeld 15; vrij 6/5/1 met reserveringen zonder contactgegevens; afhaallijst A en C (niet B) met doos; apart = −4 met journaal, herhaling = zelfde antwoord zonder boeking, al_apart, ongedaan +4 met reden, WV010/WV006/P0002 vastgelegd als niet_nodig zonder boeking; scan EAN/doos/onbekend — alles teruggedraaid';
end $$;
