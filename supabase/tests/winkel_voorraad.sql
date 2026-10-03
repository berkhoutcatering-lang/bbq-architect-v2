-- Handmatige test voor het winkel-logboek (W1). Draait in een transactie die
-- aan het eind wordt teruggedraaid: er blijft niets achter.
--
-- Alleen op de dev-database, nooit op live en nooit met --linked:
--
--   npx supabase db query --db-url "$DEV_DB_URL" -o table -f supabase/tests/winkel_voorraad.sql
--
-- Vereist de seed supabase/tests/seed_vier_naober.sql (organisatie
-- e2e-hop-en-bites); zonder die organisatie weigert de test te draaien.
--
-- Verwacht: "GESLAAGD: ..." als EXCEPTION (zie partij_afronden.sql). Elke
-- andere foutmelding is een echte fout.
--
-- Wat hij bewijst (opdracht W1 "klaar wanneer"):
--   - telling, ontvangst en overboeking geven elk één regel;
--   - het getal is de som van het logboek;
--   - een overboeking zet het in de keuken eraf en in de winkel erbij;
--   - onder nul wordt geweigerd (winkel én keuken), net als een getal buiten
--     het logboek om, een afwijking zonder reden en muteren vóór de eerste telling.

do $$
declare
    v_org      uuid;
    v_prod     uuid;
    v_inv      integer;
    v_r        jsonb;
    v_som      numeric;
    v_voorraad numeric;
    v_n        int;
    v_keuken   numeric;
    v_moves    int;
    v_waarde   int;
    v_tht      date;
    v_fouten   text := '';

begin
    -- Dev-only-guard: de e2e-organisatie bestaat alleen op de dev-database.
    select id into v_org from public.organizations where slug = 'e2e-hop-en-bites';
    if v_org is null then
        raise exception 'GEWEIGERD: organisatie e2e-hop-en-bites bestaat niet. Deze test draait alleen op de dev-database, na supabase/tests/seed_vier_naober.sql.';
    end if;

    insert into public.winkel_producten (organization_id, naam, type, eenheid, prijs_per, inkoop_excl_cents)
    values (v_org, 'TEST amandelen ' || gen_random_uuid(), 'amandelen', 'gram', 100, 138)
    returning id into v_prod;
    insert into public.inventory (organization_id, naam, unit, current_stock, last_price_eur)
    values (v_org, 'TEST amandelen keuken ' || gen_random_uuid(), 'kg', 5, 13.8)
    returning id into v_inv;

    -- 1. Vóór de eerste telling: alleen tellen mag.
    begin
        perform public.winkel_muteer_voorraad(v_org, v_prod, 'ontvangst', 500);
        v_fouten := v_fouten || 'ontvangst vóór telling niet geweigerd; ';
    exception when sqlstate 'WV002' then null;
    end;

    -- 2. Nulmeting 1000 g: geen manko, er was nog geen getal.
    v_r := public.winkel_muteer_voorraad(v_org, v_prod, 'telling', 1000);
    if v_r->'mutatie'->>'reden' is not null then v_fouten := v_fouten || 'nulmeting kreeg een reden; '; end if;

    -- 3. Ontvangst +500 g tegen 140 per 100 g, THT.
    v_r := public.winkel_muteer_voorraad(v_org, v_prod, 'ontvangst', 500, p_inkoop_excl_cents => 140, p_tht => current_date + 60);
    if (v_r->>'voorraad')::numeric <> 1500 then v_fouten := v_fouten || 'ontvangst gaf ' || (v_r->>'voorraad') || '; '; end if;
    if (v_r->'mutatie'->>'waarde_cents')::int <> 700 then v_fouten := v_fouten || 'waarde ontvangst ' || (v_r->'mutatie'->>'waarde_cents') || ' i.p.v. 700; '; end if;

    -- 4. Overboeken 450 g uit de keuken (kg): keuken 5 → 4,55, winkel 1500 → 1950.
    v_r := public.voorraad_overboeken(v_org, v_inv, v_prod, 450, 'naar_winkel', p_idempotency_key => 'test-overboeking-1');
    if (v_r->>'voorraad')::numeric <> 1950 then v_fouten := v_fouten || 'winkel na overboeking ' || (v_r->>'voorraad') || '; '; end if;
    if (v_r->>'keuken_voorraad')::numeric <> 4.55 then v_fouten := v_fouten || 'keuken na overboeking ' || (v_r->>'keuken_voorraad') || '; '; end if;

    -- 5. Dezelfde overboeking nog eens (dubbelklik): niets extra.
    v_r := public.voorraad_overboeken(v_org, v_inv, v_prod, 450, 'naar_winkel', p_idempotency_key => 'test-overboeking-1');
    if (v_r->>'bestond')::boolean is not true then v_fouten := v_fouten || 'dubbele overboeking niet herkend; '; end if;

    -- 6. Weigeringen.
    begin
        perform public.winkel_muteer_voorraad(v_org, v_prod, 'verkoop_online', -2000);
        v_fouten := v_fouten || 'onder nul (winkel) niet geweigerd; ';
    exception when sqlstate 'WV001' then null;
    end;
    begin
        perform public.voorraad_overboeken(v_org, v_inv, v_prod, 5000, 'naar_winkel');
        v_fouten := v_fouten || 'onder nul (keuken) niet geweigerd; ';
    exception when sqlstate 'WV001' then null;
    end;
    begin
        perform public.winkel_muteer_voorraad(v_org, v_prod, 'afwijking', -100);
        v_fouten := v_fouten || 'afwijking zonder reden niet geweigerd; ';
    exception when sqlstate 'WV005' then null;
    end;
    begin
        perform public.winkel_muteer_voorraad(v_org, v_prod, 'afwijking', -100, p_reden => 'manko');
        v_fouten := v_fouten || 'manko als afwijking niet geweigerd; ';
    exception when sqlstate 'WV005' then null;
    end;
    begin
        perform public.winkel_muteer_voorraad(v_org, v_prod, 'overboeking', 100);
        v_fouten := v_fouten || 'losse overboeking niet geweigerd; ';
    exception when sqlstate 'WV005' then null;
    end;
    begin
        update public.winkel_producten set voorraad = 9999 where id = v_prod;
        v_fouten := v_fouten || 'getal buiten het logboek om niet geweigerd; ';
    exception when sqlstate 'WV003' then null;
    end;

    -- 7. Telling 1900: 50 g manko.
    v_r := public.winkel_muteer_voorraad(v_org, v_prod, 'telling', 1900);
    if v_r->'mutatie'->>'reden' <> 'manko' or (v_r->'mutatie'->>'hoeveelheid')::numeric <> -50 then
        v_fouten := v_fouten || 'telling gaf ' || (v_r->'mutatie'->>'reden') || ' ' || (v_r->'mutatie'->>'hoeveelheid') || '; ';
    end if;

    -- 8. Het getal is de som.
    select sum(hoeveelheid), count(*) into v_som, v_n from public.winkel_voorraad_mutaties where winkel_product_id = v_prod;
    select voorraad, tht into v_voorraad, v_tht from public.winkel_producten where id = v_prod;
    select current_stock into v_keuken from public.inventory where id = v_inv;
    select count(*) into v_moves from public.stock_movements where inventory_id = v_inv and type = 'overboeking' and qty = -0.45;
    select coalesce(sum(waarde_cents), 0) into v_waarde from public.voorraad_logboek where item_id = v_prod::text and reden = 'manko';

    if v_som <> v_voorraad then v_fouten := v_fouten || 'som ' || v_som || ' ≠ voorraad ' || v_voorraad || '; '; end if;
    if v_n <> 4 then v_fouten := v_fouten || v_n || ' regels i.p.v. 4; '; end if;
    if v_keuken <> 4.55 then v_fouten := v_fouten || 'keuken ' || v_keuken || '; '; end if;
    if v_moves <> 1 then v_fouten := v_fouten || v_moves || ' keukenregels i.p.v. 1; '; end if;
    if v_waarde <> -70 then v_fouten := v_fouten || 'manko-waarde ' || v_waarde || ' i.p.v. -70; '; end if;
    if v_tht <> current_date + 60 then v_fouten := v_fouten || 'tht ' || v_tht || '; '; end if;

    if v_fouten <> '' then raise exception 'FOUT: %', v_fouten; end if;
    raise exception 'GESLAAGD: % regels, som % = voorraad %, keuken 5 → %, manko 50 g = € 0,70, onder nul / zonder reden / buiten het logboek geweigerd — alles teruggedraaid',
        v_n, v_som, v_voorraad, v_keuken;
end $$;
