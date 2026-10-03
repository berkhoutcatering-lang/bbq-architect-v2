-- Test voor BA-5a (migratie 20261005130000_winkel_vrij): winkel_vrij_producten,
-- winkel_vrij_artikelen, winkel_reserveringen, winkel_voorraad_stand en de
-- teller winkel_voorraad_versie. Draait in één transactie die aan het eind
-- wordt teruggedraaid: er blijft niets achter.
--
-- ALLEEN op de dev-database, nooit op live en nooit met --linked:
--
--   npx supabase db query --db-url "$DEV_DB_URL" -o table -f supabase/tests/winkel_vrij.sql
--
-- of via de Supabase-MCP (execute_sql) op het dev-project / de dev-branch.
-- Vereist de seed supabase/tests/seed_vier_naober.sql (organisatie
-- e2e-hop-en-bites); zonder die organisatie weigert de test te draaien.
--
-- Verwacht: "GESLAAGD: ..." als EXCEPTION (zie partij_afronden.sql). Elke
-- andere foutmelding is een echte fout.
--
-- Wat hij bewijst (met eigen TEST-producten, dus los van restjes van eerdere
-- E2E-runs op de seed-Naober):
--   - pariteit: gereserveerd = winkel_bezetting_product, voor elk product van
--     de organisatie, op elk moment in het scenario;
--   - Vier Naober: 6 geteld + order van 4 → ligt er 6, gereserveerd 4, vrij 2;
--   - een verlopen reservering telt niet meer: vrij weer 6;
--   - ingepakt (klaargezet) is van ligt er af én niet meer gereserveerd;
--   - pakket = het minimum over de onderdelen, met het beperkende product;
--     een leeg slot = 0; geen slots en geen quotum = geen grens; het
--     artikelquotum begrenst ook;
--   - winkel_reserveringen: nummer, naam, afhaalmoment, aantal, betaald; geen
--     e-mail of telefoon;
--   - winkel_voorraad_stand: vrij_verloopt_at = de eerste lopende reservering;
--   - de teller gaat precies één keer omhoog per transactie, en de WHEN-filters
--     laten een update zonder echte wijziging liggen;
--   - rechten: niet voor anon; een niet-lid krijgt 42501 (vereis_org).
--
-- De triggers zijn DEFERRABLE INITIALLY DEFERRED: in een DO-blok dat met een
-- EXCEPTION eindigt komt er nooit een COMMIT. Daarom zet de test op het eind
-- SET CONSTRAINTS ALL IMMEDIATE (dan gaan de uitgestelde triggers af) en
-- bootst hij een volgende transactie na door de vlag app.vv_<org> te wissen.

do $$
declare
    v_org       uuid;
    v_suffix    text := substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);
    v_naober    uuid;
    v_worst     uuid;
    v_amandel   uuid;
    v_los       uuid;
    v_a_naober  uuid;
    v_a_pakket  uuid;
    v_a_leeg    uuid;
    v_a_vrij    uuid;
    v_a_quotum  uuid;
    v_moment    uuid;
    v_datum     date := (now() at time zone 'Europe/Amsterdam')::date + 3;
    v_regels    jsonb;
    v_a         public.winkel_orders%rowtype;
    v_q         public.winkel_orders%rowtype;
    v_regel     bigint;
    v_rij       record;
    v_sig       text;
    v_stand     jsonb;
    v_v0        bigint;
    v_v         bigint;
    v_vlag      text;
    v_n         int;
    v_fouten    text := '';
begin
    -- ── Dev-only-guard: de e2e-organisatie bestaat alleen op de dev-database.
    select id into v_org from public.organizations where slug = 'e2e-hop-en-bites';
    if v_org is null then
        raise exception 'GEWEIGERD: organisatie e2e-hop-en-bites bestaat niet. Deze test draait alleen op de dev-database, na supabase/tests/seed_vier_naober.sql.';
    end if;
    v_vlag := 'app.vv_' || replace(v_org::text, '-', '');

    -- De teller vóór dit scenario. Er hangen nog geen uitgestelde triggers:
    -- dit DO-blok is het begin van de transactie.
    select coalesce((select versie from public.winkel_voorraad_versie where organization_id = v_org), 0) into v_v0;

    -- ── 1. Rechten: niet voor anon, wel voor authenticated en service_role.
    foreach v_sig in array array[
        'public.winkel_vrij_producten(uuid)', 'public.winkel_vrij_artikelen(uuid)',
        'public.winkel_reserveringen(uuid, uuid)', 'public.winkel_voorraad_stand(uuid)'
    ] loop
        if to_regprocedure(v_sig) is null then
            v_fouten := v_fouten || v_sig || ' ontbreekt; ';
        else
            if has_function_privilege('anon', v_sig, 'EXECUTE') then v_fouten := v_fouten || 'anon mag ' || v_sig || '; '; end if;
            if not has_function_privilege('authenticated', v_sig, 'EXECUTE') then v_fouten := v_fouten || 'authenticated mist ' || v_sig || '; '; end if;
            if not has_function_privilege('service_role', v_sig, 'EXECUTE') then v_fouten := v_fouten || 'service_role mist ' || v_sig || '; '; end if;
        end if;
    end loop;
    if v_fouten <> '' then raise exception 'FOUT: %', v_fouten; end if;

    -- winkel_reserveringen geeft nooit e-mail of telefoon.
    if exists (select 1 from pg_proc
                where oid = 'public.winkel_reserveringen(uuid, uuid)'::regprocedure
                  and (array_to_string(proargnames, ',') ilike '%mail%' or array_to_string(proargnames, ',') ilike '%telefoon%')) then
        v_fouten := v_fouten || 'winkel_reserveringen geeft e-mail of telefoon; ';
    end if;

    -- ── 2. Producten: Naober 6, worst 10, amandelen 1000 g, en één los product
    --       dat niet wordt bijgehouden.
    insert into public.winkel_producten (organization_id, naam, type, eenheid, prijs_per)
    values (v_org, 'TEST Naober ' || v_suffix, 'bier', 'stuk', 1) returning id into v_naober;
    insert into public.winkel_producten (organization_id, naam, type, eenheid, prijs_per)
    values (v_org, 'TEST worst ' || v_suffix, 'worst', 'stuk', 1) returning id into v_worst;
    insert into public.winkel_producten (organization_id, naam, type, eenheid, prijs_per)
    values (v_org, 'TEST amandelen ' || v_suffix, 'amandelen', 'gram', 100) returning id into v_amandel;
    insert into public.winkel_producten (organization_id, naam, type, eenheid, prijs_per)
    values (v_org, 'TEST los ' || v_suffix, 'overig', 'stuk', 1) returning id into v_los;

    perform public.winkel_muteer_voorraad(v_org, v_naober,  'telling', 6);
    perform public.winkel_muteer_voorraad(v_org, v_worst,   'telling', 10);
    perform public.winkel_muteer_voorraad(v_org, v_amandel, 'telling', 1000);

    -- ── 3. Artikelen.
    --   naober: 1 × Naober;
    --   pakket: 2 × Naober, 1 × worst, 150 g amandelen;
    --   leeg:   1 × Naober en een slot zonder product;
    --   vrij:   geen slots, geen quotum;
    --   quotum: quotum 3, 1 × het losse product (niet bijgehouden).
    insert into public.winkel_artikelen (organization_id, slug, naam, actief)
    values (v_org, 'test-naober-' || v_suffix, 'TEST Naober', true) returning id into v_a_naober;
    insert into public.winkel_artikelen (organization_id, slug, naam, actief)
    values (v_org, 'test-pakket-' || v_suffix, 'TEST pakket', true) returning id into v_a_pakket;
    insert into public.winkel_artikelen (organization_id, slug, naam, actief)
    values (v_org, 'test-leeg-' || v_suffix, 'TEST leeg', true) returning id into v_a_leeg;
    insert into public.winkel_artikelen (organization_id, slug, naam, actief)
    values (v_org, 'test-vrij-' || v_suffix, 'TEST vrij', true) returning id into v_a_vrij;
    insert into public.winkel_artikelen (organization_id, slug, naam, actief, voorraad)
    values (v_org, 'test-quotum-' || v_suffix, 'TEST quotum', true, 3) returning id into v_a_quotum;

    insert into public.winkel_artikel_slots (organization_id, artikel_id, volgorde, slot_type, naam, hoeveelheid, eenheid, per, standaard_product_id) values
        (v_org, v_a_naober, 1, 'bier',      'Naober',    1,   'stuk', 'stuk', v_naober),
        (v_org, v_a_pakket, 1, 'bier',      'Naober',    2,   'stuk', 'stuk', v_naober),
        (v_org, v_a_pakket, 2, 'worst',     'Worst',     1,   'stuk', 'stuk', v_worst),
        (v_org, v_a_pakket, 3, 'amandelen', 'Amandelen', 150, 'gram', 'stuk', v_amandel),
        (v_org, v_a_leeg,   1, 'bier',      'Naober',    1,   'stuk', 'stuk', v_naober),
        (v_org, v_a_leeg,   2, 'overig',    'Nog leeg',  1,   'stuk', 'stuk', null),
        (v_org, v_a_quotum, 1, 'overig',    'Los',       1,   'stuk', 'stuk', v_los);

    -- Een afhaalmoment over drie dagen, 16:30.
    insert into public.winkel_momenten (organization_id, groep, datum, van, tot, capaciteit, actief)
    values (v_org, 'test-' || v_suffix, v_datum, '16:30', '17:30', null, true) returning id into v_moment;

    -- ── 4. Order A: 4 × Naober, nog niet betaald (wacht, reservering loopt).
    v_regels := jsonb_build_array(jsonb_build_object(
        'artikel_id', v_a_naober, 'slug', 'test-naober', 'naam', 'TEST Naober', 'aantal', 4, 'eenheid', 'per stuk',
        'stuk_cents', 345, 'bedrag_cents', 1380, 'btw_pct', 21, 'moment_id', v_moment, 'eenheden', 1, 'voorraad_eenheden', 0,
        'componenten', jsonb_build_array(
            jsonb_build_object('product_id', v_naober, 'slot_type', 'bier', 'naam', 'Naober', 'hoeveelheid', 4, 'eenheid', 'stuk'))));
    v_a := public.winkel_plaats_order(v_org, 'test-sleutel-' || gen_random_uuid(), 'test-token-' || gen_random_uuid(), 'afhalen', v_moment,
        'Jansen', 'jansen@example.invalid', '0600000000', null, null, 1380, 0, 1380, '{}'::jsonb, 'https://example.invalid', v_regels);

    select * into v_rij from public.winkel_vrij_producten(v_org) where product_id = v_naober;
    if v_rij.ligt_er is distinct from 6 or v_rij.gereserveerd is distinct from 4 or v_rij.vrij is distinct from 2 or v_rij.bijgehouden is distinct from true then
        v_fouten := v_fouten || format('wacht: Naober %s/%s/%s i.p.v. 6/4/2; ', v_rij.ligt_er, v_rij.gereserveerd, v_rij.vrij);
    end if;

    -- vrij_verloopt_at: de reservering van A (of een eerdere van een andere order).
    v_stand := public.winkel_voorraad_stand(v_org);
    if (v_stand->>'vrij_verloopt_at') is null or (v_stand->>'vrij_verloopt_at')::timestamptz > v_a.reservering_tot then
        v_fouten := v_fouten || 'vrij_verloopt_at ' || coalesce(v_stand->>'vrij_verloopt_at', 'leeg') || ' i.p.v. uiterlijk ' || v_a.reservering_tot || '; ';
    end if;

    -- ── 5. Verlopen: de reservering van A loopt af → vrij weer 6.
    update public.winkel_orders set reservering_tot = now() - interval '1 minute' where id = v_a.id;
    select * into v_rij from public.winkel_vrij_producten(v_org) where product_id = v_naober;
    if v_rij.ligt_er is distinct from 6 or v_rij.gereserveerd is distinct from 0 or v_rij.vrij is distinct from 6 then
        v_fouten := v_fouten || format('verlopen: Naober %s/%s/%s i.p.v. 6/0/6; ', v_rij.ligt_er, v_rij.gereserveerd, v_rij.vrij);
    end if;
    v_stand := public.winkel_voorraad_stand(v_org);
    if (v_stand->>'vrij_verloopt_at') is not null and (v_stand->>'vrij_verloopt_at')::timestamptz <= now() then
        v_fouten := v_fouten || 'vrij_verloopt_at ligt in het verleden; ';
    end if;
    if exists (select 1 from public.winkel_reserveringen(v_org, v_naober)) then
        v_fouten := v_fouten || 'verlopen order staat nog in winkel_reserveringen; ';
    end if;

    -- ── 6. Betaald (de Vier Naober): 6 geteld + 4 besteld → vrij 2.
    update public.winkel_orders set status = 'betaald', betaald_at = now() where id = v_a.id;
    select * into v_rij from public.winkel_vrij_producten(v_org) where product_id = v_naober;
    if v_rij.ligt_er is distinct from 6 or v_rij.gereserveerd is distinct from 4 or v_rij.vrij is distinct from 2 then
        v_fouten := v_fouten || format('betaald: Naober %s/%s/%s i.p.v. 6/4/2; ', v_rij.ligt_er, v_rij.gereserveerd, v_rij.vrij);
    end if;

    -- Reserveringen: één regel, alleen nummer/naam/moment/aantal/betaald.
    select count(*) into v_n from public.winkel_reserveringen(v_org, v_naober);
    select * into v_rij from public.winkel_reserveringen(v_org, v_naober);
    if v_n <> 1 or v_rij.order_id is distinct from v_a.id or v_rij.nummer is distinct from v_a.nummer
       or v_rij.naam is distinct from 'Jansen' or v_rij.aantal is distinct from 4 or v_rij.betaald is distinct from true
       or v_rij.afhaalmoment is distinct from ((v_datum + time '16:30') at time zone 'Europe/Amsterdam') then
        v_fouten := v_fouten || format('reserveringen: %s rij(en), %s/%s/%s/%s/%s; ', v_n, v_rij.nummer, v_rij.naam, v_rij.afhaalmoment, v_rij.aantal, v_rij.betaald);
    end if;
    -- Zonder product: dezelfde regel staat er ook in.
    if not exists (select 1 from public.winkel_reserveringen(v_org) r where r.product_id = v_naober and r.order_id = v_a.id) then
        v_fouten := v_fouten || 'winkel_reserveringen zonder product mist order A; ';
    end if;

    -- ── 7. Artikelen bij Naober vrij 2.
    for v_rij in select * from public.winkel_vrij_artikelen(v_org)
                  where artikel_id in (v_a_naober, v_a_pakket, v_a_leeg, v_a_vrij, v_a_quotum) loop
        if v_rij.artikel_id = v_a_naober
           and (v_rij.vrij is distinct from 2 or v_rij.beperkend_product_id is distinct from v_naober or not v_rij.bijgehouden) then
            v_fouten := v_fouten || format('artikel naober: %s / %s i.p.v. 2 / Naober; ', v_rij.vrij, v_rij.beperkend_product_id);
        end if;
        -- Pakket = het minimum: Naober 2 ÷ 2 = 1, worst 10, amandelen 1000 ÷ 150 = 6.
        if v_rij.artikel_id = v_a_pakket
           and (v_rij.vrij is distinct from 1 or v_rij.beperkend_product_id is distinct from v_naober or not v_rij.bijgehouden) then
            v_fouten := v_fouten || format('artikel pakket: %s / %s i.p.v. 1 / Naober; ', v_rij.vrij, v_rij.beperkend_product_id);
        end if;
        if v_rij.artikel_id = v_a_leeg
           and (v_rij.vrij is distinct from 0 or v_rij.beperkend_product_id is not null or not v_rij.bijgehouden) then
            v_fouten := v_fouten || format('artikel met leeg slot: %s / %s i.p.v. 0 / leeg; ', v_rij.vrij, v_rij.beperkend_product_id);
        end if;
        if v_rij.artikel_id = v_a_vrij
           and (v_rij.vrij is not null or v_rij.beperkend_product_id is not null or v_rij.bijgehouden) then
            v_fouten := v_fouten || format('artikel zonder grens: %s / %s i.p.v. leeg; ', v_rij.vrij, v_rij.bijgehouden);
        end if;
        if v_rij.artikel_id = v_a_quotum
           and (v_rij.vrij is distinct from 3 or v_rij.beperkend_product_id is not null or not v_rij.bijgehouden) then
            v_fouten := v_fouten || format('artikel quotum: %s / %s i.p.v. 3 / leeg; ', v_rij.vrij, v_rij.beperkend_product_id);
        end if;
    end loop;
    select count(*) into v_n from public.winkel_vrij_artikelen(v_org)
     where artikel_id in (v_a_naober, v_a_pakket, v_a_leeg, v_a_vrij, v_a_quotum);
    if v_n <> 5 then v_fouten := v_fouten || v_n || ' van de 5 testartikelen in winkel_vrij_artikelen; '; end if;

    -- Quotum: order Q van 2 op het quotumartikel (quotum 3) → nog 1.
    v_regels := jsonb_build_array(jsonb_build_object(
        'artikel_id', v_a_quotum, 'slug', 'test-quotum', 'naam', 'TEST quotum', 'aantal', 2, 'eenheid', 'per stuk',
        'stuk_cents', 100, 'bedrag_cents', 200, 'btw_pct', 9, 'eenheden', 1, 'voorraad_eenheden', 2,
        'componenten', jsonb_build_array(
            jsonb_build_object('product_id', v_los, 'slot_type', 'overig', 'naam', 'Los', 'hoeveelheid', 2, 'eenheid', 'stuk'))));
    v_q := public.winkel_plaats_order(v_org, 'test-sleutel-' || gen_random_uuid(), 'test-token-' || gen_random_uuid(), 'afhalen', null,
        'Pietersen', 'pietersen@example.invalid', null, null, null, 200, 0, 200, '{}'::jsonb, 'https://example.invalid', v_regels);
    update public.winkel_orders set status = 'betaald', betaald_at = now() where id = v_q.id;
    select * into v_rij from public.winkel_vrij_artikelen(v_org) where artikel_id = v_a_quotum;
    if v_rij.artikel_id is null or v_rij.vrij is distinct from 1 or v_rij.beperkend_product_id is not null then
        v_fouten := v_fouten || format('quotum na order van 2: %s i.p.v. 1; ', v_rij.vrij);
    end if;
    -- Het losse product wordt niet bijgehouden: ligt er leeg, vrij leeg, gereserveerd telt wel.
    select * into v_rij from public.winkel_vrij_producten(v_org) where product_id = v_los;
    if v_rij.product_id is null or v_rij.ligt_er is not null or v_rij.vrij is not null or v_rij.bijgehouden or v_rij.gereserveerd is distinct from 2 then
        v_fouten := v_fouten || format('los product: %s/%s/%s/%s i.p.v. leeg/2/leeg/niet bijgehouden; ', v_rij.ligt_er, v_rij.gereserveerd, v_rij.vrij, v_rij.bijgehouden);
    end if;

    -- ── 8. Pariteit met winkel_bezetting_product, voor elk product van de organisatie.
    for v_rij in select * from public.winkel_vrij_producten(v_org) loop
        if v_rij.gereserveerd is distinct from public.winkel_bezetting_product(v_rij.product_id, null) then
            v_fouten := v_fouten || format('pariteit %s: %s i.p.v. %s; ', v_rij.naam, v_rij.gereserveerd, public.winkel_bezetting_product(v_rij.product_id, null));
        end if;
        if v_rij.bijgehouden and v_rij.vrij is distinct from v_rij.ligt_er - v_rij.gereserveerd then
            v_fouten := v_fouten || format('vrij %s klopt niet; ', v_rij.naam);
        end if;
    end loop;
    select count(*) into v_n from public.winkel_vrij_producten(v_org);
    if v_n <> (select count(*) from public.winkel_producten where organization_id = v_org) then
        v_fouten := v_fouten || 'winkel_vrij_producten mist producten van de organisatie; ';
    end if;

    -- ── 9. Inpakken: ligt er 2, gereserveerd 0, vrij 2 (vrij verandert niet).
    select r.id into v_regel from public.winkel_order_regels r where r.order_id = v_a.id;
    perform public.winkel_zet_klaargezet(v_org, v_regel, true);
    select * into v_rij from public.winkel_vrij_producten(v_org) where product_id = v_naober;
    if v_rij.ligt_er is distinct from 2 or v_rij.gereserveerd is distinct from 0 or v_rij.vrij is distinct from 2 then
        v_fouten := v_fouten || format('ingepakt: Naober %s/%s/%s i.p.v. 2/0/2; ', v_rij.ligt_er, v_rij.gereserveerd, v_rij.vrij);
    end if;
    if exists (select 1 from public.winkel_reserveringen(v_org, v_naober)) then
        v_fouten := v_fouten || 'ingepakte order staat nog in winkel_reserveringen; ';
    end if;
    for v_rij in select * from public.winkel_vrij_producten(v_org) loop
        if v_rij.gereserveerd is distinct from public.winkel_bezetting_product(v_rij.product_id, null) then
            v_fouten := v_fouten || format('pariteit na inpakken %s; ', v_rij.naam);
        end if;
    end loop;

    -- ── 10. Een niet-lid krijgt 42501 (vereis_org), ook al is de functie INVOKER.
    begin
        perform set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid(), 'role', 'authenticated')::text, true);
        perform set_config('role', 'authenticated', true);
        perform public.winkel_vrij_producten(v_org);
        raise exception 'niet_lid_kwam_erdoor';
    exception
        when insufficient_privilege then null;
        when others then v_fouten := v_fouten || 'niet-lid op winkel_vrij_producten: ' || sqlerrm || '; ';
    end;
    perform set_config('request.jwt.claims', '', true);

    -- ── 11. De teller: precies één keer omhoog in deze transactie.
    -- Nog niets: de triggers zijn uitgesteld tot het committen.
    select coalesce((select versie from public.winkel_voorraad_versie where organization_id = v_org), 0) into v_v;
    if v_v <> v_v0 then v_fouten := v_fouten || format('teller ging al omhoog vóór het committen (%s → %s); ', v_v0, v_v); end if;

    set constraints all immediate;   -- de uitgestelde triggers gaan nu af
    select versie into v_v from public.winkel_voorraad_versie where organization_id = v_org;
    if v_v is distinct from v_v0 + 1 then
        v_fouten := v_fouten || format('teller na tientallen wijzigingen in één transactie %s i.p.v. %s; ', v_v, v_v0 + 1);
    end if;
    if coalesce(current_setting(v_vlag, true), '') <> 'ja' then
        v_fouten := v_fouten || 'vlag app.vv_<org> niet gezet; ';
    end if;

    -- Nog een mutatie in dezelfde transactie: blijft v0 + 1.
    perform public.winkel_muteer_voorraad(v_org, v_worst, 'telling', 9);
    select versie into v_v from public.winkel_voorraad_versie where organization_id = v_org;
    if v_v is distinct from v_v0 + 1 then v_fouten := v_fouten || format('tweede mutatie in dezelfde transactie: teller %s; ', v_v); end if;

    -- "Volgende transactie" (vlag gewist): een telling → v0 + 2.
    perform set_config(v_vlag, '', true);
    perform public.winkel_muteer_voorraad(v_org, v_worst, 'telling', 8);
    select versie into v_v from public.winkel_voorraad_versie where organization_id = v_org;
    if v_v is distinct from v_v0 + 2 then v_fouten := v_fouten || format('volgende transactie: teller %s i.p.v. %s; ', v_v, v_v0 + 2); end if;

    -- Een update zonder echte wijziging (WHEN-filter): blijft v0 + 2.
    perform set_config(v_vlag, '', true);
    update public.winkel_orders set status = status, reservering_tot = reservering_tot where id = v_a.id;
    update public.winkel_order_regels set klaargezet_at = klaargezet_at where id = v_regel;
    update public.winkel_artikelen set voorraad = voorraad where id = v_a_quotum;
    select versie into v_v from public.winkel_voorraad_versie where organization_id = v_org;
    if v_v is distinct from v_v0 + 2 then v_fouten := v_fouten || format('update zonder wijziging verhoogde de teller (%s); ', v_v); end if;

    -- Wel een echte wijziging per bron, telkens als nieuwe transactie: +1 per stuk.
    perform public.winkel_zet_klaargezet(v_org, v_regel, false);          -- regel (en mutatie retour)
    select versie into v_v from public.winkel_voorraad_versie where organization_id = v_org;
    if v_v is distinct from v_v0 + 3 then v_fouten := v_fouten || format('uitpakken: teller %s i.p.v. %s; ', v_v, v_v0 + 3); end if;

    perform set_config(v_vlag, '', true);
    update public.winkel_orders set status = 'afgebroken' where id = v_q.id;  -- order
    select versie into v_v from public.winkel_voorraad_versie where organization_id = v_org;
    if v_v is distinct from v_v0 + 4 then v_fouten := v_fouten || format('orderstatus: teller %s i.p.v. %s; ', v_v, v_v0 + 4); end if;

    perform set_config(v_vlag, '', true);
    delete from public.winkel_artikel_slots where artikel_id = v_a_leeg and standaard_product_id is null;  -- slot
    select versie into v_v from public.winkel_voorraad_versie where organization_id = v_org;
    if v_v is distinct from v_v0 + 5 then v_fouten := v_fouten || format('slot weg: teller %s i.p.v. %s; ', v_v, v_v0 + 5); end if;

    perform set_config(v_vlag, '', true);
    update public.winkel_artikelen set voorraad = 1 where id = v_a_quotum;   -- artikelquotum
    select versie into v_v from public.winkel_voorraad_versie where organization_id = v_org;
    if v_v is distinct from v_v0 + 6 then v_fouten := v_fouten || format('quotum: teller %s i.p.v. %s; ', v_v, v_v0 + 6); end if;

    -- De stand geeft dezelfde versie.
    v_stand := public.winkel_voorraad_stand(v_org);
    if (v_stand->>'versie')::bigint is distinct from v_v0 + 6 or (v_stand->>'gewijzigd_at') is null then
        v_fouten := v_fouten || 'winkel_voorraad_stand: ' || v_stand::text || '; ';
    end if;

    if v_fouten <> '' then raise exception 'FOUT: %', v_fouten; end if;
    raise exception 'GESLAAGD: Vier Naober 6/4/2, verlopen 6, ingepakt 2/0/2; pakket = minimum (1, Naober), leeg slot 0, zonder grens leeg, quotum 3 → 1; reserveringen zonder e-mail/telefoon; pariteit met winkel_bezetting_product; teller één keer per transactie (% → %), WHEN-filters werken; niet-lid 42501 — alles teruggedraaid', v_v0, v_v;
end $$;
