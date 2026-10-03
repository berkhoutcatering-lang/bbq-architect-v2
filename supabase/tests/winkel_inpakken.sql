-- Handmatige test voor afboeken bij inpakken (W3) en afwijkingen (W5).
-- Draait in een transactie die aan het eind wordt teruggedraaid.
--
-- Alleen op de dev-database, nooit op live en nooit met --linked:
--
--   npx supabase db query --db-url "$DEV_DB_URL" -o table -f supabase/tests/winkel_inpakken.sql
--
-- Vereist de seed supabase/tests/seed_vier_naober.sql (organisatie
-- e2e-hop-en-bites); zonder die organisatie weigert de test te draaien.
--
-- Verwacht: "GESLAAGD: ..." als EXCEPTION (zie partij_afronden.sql).
--
-- Het scenario uit de opdracht (W3 "klaar wanneer"):
--   - 3 × Bierpakket € 35 na inpakken: precies 15 bier, 3 worst, 450 g
--     amandelen, 3 crackers en 3 dozen af;
--   - bij 17 bier wordt een 4e bestelling geweigerd (WK009);
--   - een afgebroken betaling boekt niets af;
--   - twee keer inpakken boekt niets extra, uitpakken boekt retour.
-- En W5: "1 fles wijn eigen gebruik" = één regel, één fles minder, en de
-- maandtotalen per reden kloppen.

do $$
declare
    v_org     uuid;
    v_art     uuid;
    v_bier    uuid; v_worst uuid; v_amandel uuid; v_cracker uuid; v_doos uuid; v_wijn uuid;
    v_regels  jsonb;
    v_orders  bigint[] := '{}';
    v_o       public.winkel_orders%rowtype;
    v_regel   bigint;
    v_r       jsonb;
    v_i       int;
    v_n       numeric;
    v_maand   bigint;
    v_fouten  text := '';
begin
    -- Dev-only-guard: de e2e-organisatie bestaat alleen op de dev-database.
    select id into v_org from public.organizations where slug = 'e2e-hop-en-bites';
    if v_org is null then
        raise exception 'GEWEIGERD: organisatie e2e-hop-en-bites bestaat niet. Deze test draait alleen op de dev-database, na supabase/tests/seed_vier_naober.sql.';
    end if;

    -- Producten en het Bierpakket € 35 (zoals in de seed).
    insert into public.winkel_producten (organization_id, naam, type, eenheid, prijs_per, inkoop_excl_cents) values
        (v_org, 'TEST bier',      'bier',      'stuk', 1,   150) returning id into v_bier;
    insert into public.winkel_producten (organization_id, naam, type, eenheid, prijs_per, inkoop_excl_cents) values
        (v_org, 'TEST worst',     'worst',     'stuk', 1,   246) returning id into v_worst;
    insert into public.winkel_producten (organization_id, naam, type, eenheid, prijs_per, inkoop_excl_cents) values
        (v_org, 'TEST amandelen', 'amandelen', 'gram', 100, 138) returning id into v_amandel;
    insert into public.winkel_producten (organization_id, naam, type, eenheid, prijs_per, inkoop_excl_cents) values
        (v_org, 'TEST crackers',  'crackers',  'stuk', 1,   70)  returning id into v_cracker;
    insert into public.winkel_producten (organization_id, naam, type, eenheid, prijs_per, inkoop_excl_cents) values
        (v_org, 'TEST doos',      'doos',      'stuk', 1,   250) returning id into v_doos;
    insert into public.winkel_producten (organization_id, naam, type, eenheid, prijs_per, inkoop_excl_cents) values
        (v_org, 'TEST wijn',      'wijn',      'stuk', 1,   700) returning id into v_wijn;

    perform public.winkel_muteer_voorraad(v_org, v_bier,    'telling', 17);
    perform public.winkel_muteer_voorraad(v_org, v_worst,   'telling', 10);
    perform public.winkel_muteer_voorraad(v_org, v_amandel, 'telling', 1000);
    perform public.winkel_muteer_voorraad(v_org, v_cracker, 'telling', 8);
    perform public.winkel_muteer_voorraad(v_org, v_doos,    'telling', 12);
    perform public.winkel_muteer_voorraad(v_org, v_wijn,    'telling', 6);

    insert into public.winkel_artikelen (organization_id, slug, naam, actief)
    values (v_org, 'test-bier-35-' || substr(gen_random_uuid()::text, 1, 8), 'TEST Bierpakket € 35', true)
    returning id into v_art;

    v_regels := jsonb_build_array(jsonb_build_object(
        'artikel_id', v_art, 'slug', 'test-bier-35', 'naam', 'TEST Bierpakket € 35', 'aantal', 1, 'eenheid', 'per stuk',
        'stuk_cents', 3500, 'bedrag_cents', 3500, 'btw_pct', 21, 'eenheden', 1, 'voorraad_eenheden', 0,
        'componenten', jsonb_build_array(
            jsonb_build_object('product_id', v_bier,    'slot_type', 'bier',      'naam', 'Bier',      'hoeveelheid', 5,   'eenheid', 'stuk'),
            jsonb_build_object('product_id', v_worst,   'slot_type', 'worst',     'naam', 'Worst',     'hoeveelheid', 1,   'eenheid', 'stuk'),
            jsonb_build_object('product_id', v_amandel, 'slot_type', 'amandelen', 'naam', 'Amandelen', 'hoeveelheid', 150, 'eenheid', 'gram'),
            jsonb_build_object('product_id', v_cracker, 'slot_type', 'crackers',  'naam', 'Crackers',  'hoeveelheid', 1,   'eenheid', 'stuk'),
            jsonb_build_object('product_id', v_doos,    'slot_type', 'doos',      'naam', 'Doos',      'hoeveelheid', 1,   'eenheid', 'stuk'))));

    -- Drie bestellingen, betaald.
    for v_i in 1..3 loop
        v_o := public.winkel_plaats_order(v_org, 'test-sleutel-' || gen_random_uuid(), 'test-token-' || gen_random_uuid(), 'afhalen', null,
            'Test', 'test@example.invalid', null, null, null, 3500, 0, 3500, '{}'::jsonb, 'https://example.invalid', v_regels);
        update public.winkel_orders set status = 'betaald', betaald_at = now() where id = v_o.id;
        v_orders := v_orders || v_o.id;
    end loop;

    -- Een vierde: 20 bier nodig, er zijn er 17 → geweigerd.
    begin
        perform public.winkel_plaats_order(v_org, 'test-sleutel-' || gen_random_uuid(), 'test-token-' || gen_random_uuid(), 'afhalen', null,
            'Test', 'test@example.invalid', null, null, null, 3500, 0, 3500, '{}'::jsonb, 'https://example.invalid', v_regels);
        v_fouten := v_fouten || '4e bestelling bij 17 bier niet geweigerd; ';
    exception when sqlstate 'WK009' then null;
    end;

    -- Nog niets afgeboekt: bestellen reserveert alleen.
    select voorraad into v_n from public.winkel_producten where id = v_bier;
    if v_n <> 17 then v_fouten := v_fouten || 'bier na bestellen ' || v_n || ' i.p.v. 17; '; end if;

    -- Inpakken, en de eerste twee keer (dubbelklik).
    foreach v_regel in array (select array_agg(r.id) from public.winkel_order_regels r where r.order_id = any(v_orders)) loop
        perform public.winkel_zet_klaargezet(v_org, v_regel, true);
    end loop;
    select r.id into v_regel from public.winkel_order_regels r where r.order_id = v_orders[1];
    perform public.winkel_zet_klaargezet(v_org, v_regel, true);

    select voorraad into v_n from public.winkel_producten where id = v_bier;    if v_n <> 2    then v_fouten := v_fouten || 'bier ' || v_n || ' i.p.v. 2; '; end if;
    select voorraad into v_n from public.winkel_producten where id = v_worst;   if v_n <> 7    then v_fouten := v_fouten || 'worst ' || v_n || ' i.p.v. 7; '; end if;
    select voorraad into v_n from public.winkel_producten where id = v_amandel; if v_n <> 550  then v_fouten := v_fouten || 'amandelen ' || v_n || ' i.p.v. 550; '; end if;
    select voorraad into v_n from public.winkel_producten where id = v_cracker; if v_n <> 5    then v_fouten := v_fouten || 'crackers ' || v_n || ' i.p.v. 5; '; end if;
    select voorraad into v_n from public.winkel_producten where id = v_doos;    if v_n <> 9    then v_fouten := v_fouten || 'dozen ' || v_n || ' i.p.v. 9; '; end if;
    select -sum(hoeveelheid) into v_n from public.winkel_voorraad_mutaties where winkel_product_id = v_bier and type = 'verkoop_online';
    if v_n <> 15 then v_fouten := v_fouten || 'afgeboekt bier ' || v_n || ' i.p.v. 15; '; end if;

    -- Ingepakt telt niet meer als gereserveerd.
    if public.winkel_bezetting_product(v_bier) <> 0 then v_fouten := v_fouten || 'ingepakt telt nog als gereserveerd; '; end if;

    -- Uitpakken = retour.
    perform public.winkel_zet_klaargezet(v_org, v_regel, false);
    select voorraad into v_n from public.winkel_producten where id = v_bier;
    if v_n <> 7 then v_fouten := v_fouten || 'bier na uitpakken ' || v_n || ' i.p.v. 7; '; end if;

    -- Afgebroken betaling: niets afgeboekt, niets gereserveerd, inpakken geweigerd.
    v_o := public.winkel_plaats_order(v_org, 'test-sleutel-' || gen_random_uuid(), 'test-token-' || gen_random_uuid(), 'afhalen', null,
        'Test', 'test@example.invalid', null, null, null, 3500, 0, 3500, '{}'::jsonb, 'https://example.invalid', v_regels);
    update public.winkel_orders set status = 'afgebroken' where id = v_o.id;
    select r.id into v_regel from public.winkel_order_regels r where r.order_id = v_o.id;
    begin
        perform public.winkel_zet_klaargezet(v_org, v_regel, true);
        v_fouten := v_fouten || 'inpakken van een afgebroken order niet geweigerd; ';
    exception when sqlstate 'WV006' then null;
    end;
    if exists (select 1 from public.winkel_voorraad_mutaties where order_id = v_o.id) then
        v_fouten := v_fouten || 'afgebroken order boekte iets af; ';
    end if;

    -- W5: 1 fles wijn eigen gebruik.
    v_r := public.winkel_muteer_voorraad(v_org, v_wijn, 'afwijking', -1, p_reden => 'eigen_gebruik', p_notitie => '1 fles wijn eigen gebruik');
    if (v_r->>'voorraad')::numeric <> 5 then v_fouten := v_fouten || 'wijn na eigen gebruik ' || (v_r->>'voorraad') || '; '; end if;
    perform public.winkel_muteer_voorraad(v_org, v_wijn, 'afwijking', -2, p_reden => 'derving_breuk');
    select waarde_cents into v_maand from public.voorraad_afwijkingen_maand
     where organization_id = v_org and plek = 'winkel' and reden = 'eigen_gebruik'
       and maand = date_trunc('month', now() at time zone 'Europe/Amsterdam')::date;
    -- Alleen de testregels tellen niet los; de rest van de maand zit er ook in. Controleer via het verschil.
    if not exists (select 1 from public.winkel_voorraad_mutaties where winkel_product_id = v_wijn and reden = 'eigen_gebruik' and waarde_cents = -700) then
        v_fouten := v_fouten || 'eigen gebruik niet tegen € 7,00 vastgelegd; ';
    end if;
    if not exists (select 1 from public.winkel_voorraad_mutaties where winkel_product_id = v_wijn and reden = 'derving_breuk' and waarde_cents = -1400) then
        v_fouten := v_fouten || 'breuk niet tegen € 14,00 vastgelegd; ';
    end if;
    if v_maand is null or v_maand < 700 then v_fouten := v_fouten || 'maandtotaal eigen gebruik ' || coalesce(v_maand::text, 'leeg') || '; '; end if;

    if v_fouten <> '' then raise exception 'FOUT: %', v_fouten; end if;
    raise exception 'GESLAAGD: 3 pakketten = 15 bier, 3 worst, 450 g amandelen, 3 crackers, 3 dozen af; 4e bij 17 bier geweigerd; dubbel inpakken = niets extra; uitpakken = retour; afgebroken = niets; 1 fles eigen gebruik € 7,00 — alles teruggedraaid';
end $$;
