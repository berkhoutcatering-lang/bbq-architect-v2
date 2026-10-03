-- Test voor BA-2: ophaallek dichten (migratie 20261005120000_winkel_order_ophalen).
-- Draait in een transactie die aan het eind wordt teruggedraaid: er blijft
-- niets achter, ook niet de tijdelijke testgebruiker.
--
-- ALLEEN op de dev-database, nooit op live en nooit met --linked:
--
--   npx supabase db query --db-url "$DEV_DB_URL" -o table -f supabase/tests/winkel_ophalen.sql
--
-- Vereist de seed supabase/tests/seed_vier_naober.sql (organisatie
-- e2e-hop-en-bites); zonder die organisatie weigert de test te draaien.
--
-- Verwacht: "GESLAAGD: ..." als EXCEPTION (zie winkel_inpakken.sql). Elke
-- andere melding is een echte fout.
--
-- Wat hij bewijst (elke uitkomst van winkel_order_ophalen):
--   onbekend            onbekend ordernummer, en een order van een andere organisatie
--   niet_betaald        een order die nog op de betaling wacht; niets gewijzigd
--   leeftijd_nodig      alcohol zonder leeftijd; niets gewijzigd
--   geweigerd           niets gewijzigd, ook geen rest geboekt (ook bij open rest)
--   opgehaald           een niet-ingepakte regel wordt bij ophalen afgeboekt
--                       (verkoop_online), regels en dozen op opgehaald, bron
--                       en leeftijd vastgelegd
--   al_opgehaald        nog een keer: niets dubbel geboekt
--   rest_nodig          open rest zonder methode; niets gewijzigd
--   opgehaald + rest    de rest in dezelfde transactie geboekt
--   te_weinig_voorraad  inpakken faalt op WV001 → niets geboekt, ook niet de
--                       eerste regel en niet de rest
--   na een doosscan     de rest van de order mee, niets extra afgeboekt
-- En winkel_order_ophalen_terug: alleen de status terug (voorraad en rest
-- blijven), alleen op dezelfde dag; niet_opgehaald en onbekend.
-- En: ongeldige invoer = 22023; anon mag niet; een lid mag alleen de eigen
-- organisatie (42501 voor een vreemde).

do $$
declare
    v_org     uuid;
    v_ander   uuid := gen_random_uuid();
    v_user    uuid := gen_random_uuid();
    v_bier    uuid; v_doos uuid; v_kaas uuid;
    v_art_a   uuid; v_art_k uuid;
    v_regel_a jsonb; v_regel_k jsonb;
    v_o       public.winkel_orders%rowtype;
    v_wacht   bigint; v_o1 bigint; v_o2 bigint; v_o3 bigint; v_o4 bigint;
    v_r1      bigint;
    v_r       jsonb;
    v_n       numeric;
    v_i       int;
    v_mut     int;
    v_codes   jsonb;
    v_t       timestamptz;
    v_gebruiker_ok boolean := false;
    v_fouten  text := '';
begin
    -- ── Dev-only-guard: de e2e-organisatie bestaat alleen op de dev-database.
    select id into v_org from public.organizations where slug = 'e2e-hop-en-bites';
    if v_org is null then
        raise exception 'GEWEIGERD: organisatie e2e-hop-en-bites bestaat niet. Deze test draait alleen op de dev-database, na supabase/tests/seed_vier_naober.sql.';
    end if;

    -- ── Opzet: drie producten en twee artikelen (bierpakket met alcohol, kaasplankje zonder).
    insert into public.winkel_producten (organization_id, naam, type, eenheid, prijs_per, inkoop_excl_cents, alcohol)
    values (v_org, 'TEST ophalen bier', 'bier', 'stuk', 1, 150, true) returning id into v_bier;
    insert into public.winkel_producten (organization_id, naam, type, eenheid, prijs_per, inkoop_excl_cents)
    values (v_org, 'TEST ophalen doos', 'doos', 'stuk', 1, 250) returning id into v_doos;
    insert into public.winkel_producten (organization_id, naam, type, eenheid, prijs_per, inkoop_excl_cents)
    values (v_org, 'TEST ophalen kaas', 'kaas', 'stuk', 1, 300) returning id into v_kaas;
    perform public.winkel_muteer_voorraad(v_org, v_bier, 'telling', 20);
    perform public.winkel_muteer_voorraad(v_org, v_doos, 'telling', 10);
    perform public.winkel_muteer_voorraad(v_org, v_kaas, 'telling', 3);

    insert into public.winkel_artikelen (organization_id, slug, naam, actief, alcohol)
    values (v_org, 'test-ophalen-bier-' || substr(gen_random_uuid()::text, 1, 8), 'TEST Bierpakket', true, true)
    returning id into v_art_a;
    insert into public.winkel_artikelen (organization_id, slug, naam, actief, alcohol)
    values (v_org, 'test-ophalen-kaas-' || substr(gen_random_uuid()::text, 1, 8), 'TEST Kaasplankje', true, false)
    returning id into v_art_k;

    v_regel_a := jsonb_build_object(
        'artikel_id', v_art_a, 'slug', 'test-ophalen-bier', 'naam', 'TEST Bierpakket', 'aantal', 1, 'eenheid', 'per stuk',
        'stuk_cents', 3500, 'bedrag_cents', 3500, 'btw_pct', 21, 'eenheden', 1, 'voorraad_eenheden', 0, 'alcohol', true,
        'componenten', jsonb_build_array(
            jsonb_build_object('product_id', v_bier, 'slot_type', 'bier', 'naam', 'Bier', 'hoeveelheid', 4, 'eenheid', 'stuk'),
            jsonb_build_object('product_id', v_doos, 'slot_type', 'doos', 'naam', 'Doos', 'hoeveelheid', 1, 'eenheid', 'stuk')));
    v_regel_k := jsonb_build_object(
        'artikel_id', v_art_k, 'slug', 'test-ophalen-kaas', 'naam', 'TEST Kaasplankje', 'aantal', 1, 'eenheid', 'per stuk',
        'stuk_cents', 1500, 'bedrag_cents', 1500, 'btw_pct', 9, 'eenheden', 1, 'voorraad_eenheden', 0, 'alcohol', false,
        'componenten', jsonb_build_array(
            jsonb_build_object('product_id', v_kaas, 'slot_type', 'kaas', 'naam', 'Kaas', 'hoeveelheid', 2, 'eenheid', 'stuk')));

    -- ── onbekend ──────────────────────────────────────────────────────────────
    v_r := public.winkel_order_ophalen(v_org, -1);
    if v_r->>'uitkomst' is distinct from 'onbekend' then v_fouten := v_fouten || 'onbekende order gaf ' || (v_r->>'uitkomst') || '; '; end if;

    -- ── niet_betaald: een order die nog op de betaling wacht ──────────────────
    v_o := public.winkel_plaats_order(v_org, 'test-sleutel-' || gen_random_uuid(), 'test-token-' || gen_random_uuid(), 'afhalen', null,
        'Test', 'test@example.invalid', null, null, null, 3500, 0, 3500, '{}'::jsonb, 'https://example.invalid', jsonb_build_array(v_regel_a));
    v_wacht := v_o.id;
    v_r := public.winkel_order_ophalen(v_org, v_wacht, 'pin', 'vastgesteld');
    if v_r->>'uitkomst' is distinct from 'niet_betaald' or v_r->>'status' is distinct from 'wacht' then v_fouten := v_fouten || 'wachtende order gaf ' || v_r::text || '; '; end if;
    if exists (select 1 from public.winkel_order_regels where order_id = v_wacht and (opgehaald_at is not null or klaargezet_at is not null))
       or exists (select 1 from public.winkel_voorraad_mutaties where order_id = v_wacht) then
        v_fouten := v_fouten || 'niet_betaald wijzigde iets; ';
    end if;
    -- Daarna afgebroken, zodat hij niet meer reserveert.
    update public.winkel_orders set status = 'afgebroken' where id = v_wacht;

    -- ── O1: betaald, alcohol, nog niet ingepakt, met twee dozen ───────────────
    v_o := public.winkel_plaats_order(v_org, 'test-sleutel-' || gen_random_uuid(), 'test-token-' || gen_random_uuid(), 'afhalen', null,
        'Test', 'test@example.invalid', null, null, null, 3500, 0, 3500, '{}'::jsonb, 'https://example.invalid', jsonb_build_array(v_regel_a));
    v_o1 := v_o.id;
    update public.winkel_orders set status = 'betaald', betaald_at = now() where id = v_o1;
    select id into v_r1 from public.winkel_order_regels where order_id = v_o1;
    perform public.winkel_dozen_voor_regel(v_org, v_r1, array['TEST doos 1', 'TEST doos 2']);

    -- Een andere organisatie: de order bestaat daar niet.
    v_r := public.winkel_order_ophalen(v_ander, v_o1, null, 'vastgesteld');
    if v_r->>'uitkomst' is distinct from 'onbekend' then v_fouten := v_fouten || 'order via een andere organisatie gaf ' || (v_r->>'uitkomst') || '; '; end if;

    -- leeftijd_nodig
    v_r := public.winkel_order_ophalen(v_org, v_o1);
    if v_r->>'uitkomst' is distinct from 'leeftijd_nodig' or (v_r->>'alcohol')::boolean is not true then v_fouten := v_fouten || 'alcohol zonder leeftijd gaf ' || v_r::text || '; '; end if;

    -- geweigerd: niets gewijzigd
    v_r := public.winkel_order_ophalen(v_org, v_o1, null, 'geweigerd');
    if v_r->>'uitkomst' is distinct from 'geweigerd' then v_fouten := v_fouten || 'geweigerd gaf ' || (v_r->>'uitkomst') || '; '; end if;
    if exists (select 1 from public.winkel_order_regels where order_id = v_o1 and (opgehaald_at is not null or klaargezet_at is not null or leeftijd_vastgesteld_at is not null))
       or exists (select 1 from public.winkel_dozen where order_id = v_o1 and opgehaald_at is not null)
       or exists (select 1 from public.winkel_voorraad_mutaties where order_id = v_o1) then
        v_fouten := v_fouten || 'leeftijd_nodig of geweigerd wijzigde iets; ';
    end if;
    select voorraad into v_n from public.winkel_producten where id = v_bier;
    if v_n <> 20 then v_fouten := v_fouten || 'bier na geweigerd ' || v_n || ' i.p.v. 20; '; end if;
    if public.winkel_bezetting_product(v_bier) <> 4 then v_fouten := v_fouten || 'O1 telt niet als gereserveerd vóór ophalen; '; end if;

    -- opgehaald: de niet-ingepakte regel wordt bij het ophalen afgeboekt.
    v_r := public.winkel_order_ophalen(v_org, v_o1, null, 'vastgesteld');
    if v_r->>'uitkomst' is distinct from 'opgehaald' then v_fouten := v_fouten || 'O1 ophalen gaf ' || v_r::text || '; '; end if;
    if jsonb_array_length(coalesce(v_r->'boekingen', '[]'::jsonb)) <> 2 then v_fouten := v_fouten || 'O1 boekingen ' || coalesce(v_r->>'boekingen', 'leeg') || ' i.p.v. 2; '; end if;
    if (v_r->>'nog_open')::int is distinct from 0 or (v_r->>'regels')::int is distinct from 1 or v_r->>'leeftijd' is distinct from 'vastgesteld' then v_fouten := v_fouten || 'O1 teruggave ' || v_r::text || '; '; end if;
    select voorraad into v_n from public.winkel_producten where id = v_bier;
    if v_n <> 16 then v_fouten := v_fouten || 'bier na ophalen ' || v_n || ' i.p.v. 16; '; end if;
    select voorraad into v_n from public.winkel_producten where id = v_doos;
    if v_n <> 9 then v_fouten := v_fouten || 'doos na ophalen ' || v_n || ' i.p.v. 9; '; end if;
    select -sum(hoeveelheid) into v_n from public.winkel_voorraad_mutaties where order_regel_id = v_r1 and type = 'verkoop_online';
    if v_n is distinct from 5 then v_fouten := v_fouten || 'O1 verkoop_online ' || coalesce(v_n::text, 'geen') || ' i.p.v. 5 (4 bier + 1 doos); '; end if;
    if not exists (select 1 from public.winkel_order_regels
                    where id = v_r1 and klaargezet_at is not null and opgehaald_at is not null
                      and opgehaald_bron = 'ba' and leeftijd_vastgesteld_at is not null and opgehaald_medewerker_id is null) then
        v_fouten := v_fouten || 'O1 regel niet ingepakt + opgehaald met bron en leeftijd; ';
    end if;
    if exists (select 1 from public.winkel_dozen where order_id = v_o1 and opgehaald_at is null) then
        v_fouten := v_fouten || 'O1 dozen niet op opgehaald; ';
    end if;
    if public.winkel_bezetting_product(v_bier) <> 0 then v_fouten := v_fouten || 'O1 telt na ophalen nog als gereserveerd; '; end if;

    -- al_opgehaald: niets dubbel.
    select count(*) into v_mut from public.winkel_voorraad_mutaties where order_id = v_o1;
    v_r := public.winkel_order_ophalen(v_org, v_o1, 'pin', 'vastgesteld');
    if v_r->>'uitkomst' is distinct from 'al_opgehaald' or v_r->>'opgehaald_at' is null then v_fouten := v_fouten || 'tweede keer O1 gaf ' || v_r::text || '; '; end if;
    if (select count(*) from public.winkel_voorraad_mutaties where order_id = v_o1) <> v_mut then v_fouten := v_fouten || 'tweede keer O1 boekte iets; '; end if;

    -- ── O2: kaasplankje, reservering met open rest ────────────────────────────
    v_o := public.winkel_plaats_order(v_org, 'test-sleutel-' || gen_random_uuid(), 'test-token-' || gen_random_uuid(), 'afhalen', null,
        'Test', 'test@example.invalid', null, null, null, 1500, 0, 1500, '{}'::jsonb, 'https://example.invalid', jsonb_build_array(v_regel_k),
        p_betaalwijze => 'reservering', p_nu_te_betalen_cents => 250, p_rest_cents => 1250);
    v_o2 := v_o.id;
    update public.winkel_orders set status = 'betaald', betaald_at = now() where id = v_o2;

    -- rest_nodig: niets gewijzigd.
    v_r := public.winkel_order_ophalen(v_org, v_o2);
    if v_r->>'uitkomst' is distinct from 'rest_nodig' or (v_r->>'rest_cents')::int is distinct from 1250 or (v_r->>'reeds_cents')::int is distinct from 250 then
        v_fouten := v_fouten || 'open rest gaf ' || v_r::text || '; ';
    end if;
    -- geweigerd bij open rest: ook geen rest geboekt.
    v_r := public.winkel_order_ophalen(v_org, v_o2, 'contant', 'geweigerd');
    if v_r->>'uitkomst' is distinct from 'geweigerd' then v_fouten := v_fouten || 'geweigerd bij open rest gaf ' || (v_r->>'uitkomst') || '; '; end if;
    if exists (select 1 from public.winkel_orders where id = v_o2 and rest_betaald_at is not null)
       or exists (select 1 from public.winkel_order_regels where order_id = v_o2 and (opgehaald_at is not null or klaargezet_at is not null))
       or exists (select 1 from public.winkel_voorraad_mutaties where order_id = v_o2) then
        v_fouten := v_fouten || 'rest_nodig of geweigerd wijzigde O2; ';
    end if;

    -- opgehaald met rest: rest, inpakken en status in één keer.
    v_r := public.winkel_order_ophalen(v_org, v_o2, 'contant');
    if v_r->>'uitkomst' is distinct from 'opgehaald' or v_r->>'rest_geboekt' is distinct from 'contant' or (v_r->>'rest_cents')::int is distinct from 1250 then
        v_fouten := v_fouten || 'O2 met rest gaf ' || v_r::text || '; ';
    end if;
    if not exists (select 1 from public.winkel_orders where id = v_o2 and rest_betaald_at is not null and rest_betaalmethode = 'contant') then
        v_fouten := v_fouten || 'O2 rest niet geboekt; ';
    end if;
    select voorraad into v_n from public.winkel_producten where id = v_kaas;
    if v_n <> 1 then v_fouten := v_fouten || 'kaas na O2 ' || v_n || ' i.p.v. 1; '; end if;
    if exists (select 1 from public.winkel_order_regels where order_id = v_o2 and leeftijd_vastgesteld_at is not null) then
        v_fouten := v_fouten || 'O2 zonder alcohol kreeg leeftijd_vastgesteld_at; ';
    end if;

    -- ── O3: twee regels; de tweede past niet meer → te_weinig_voorraad ────────
    perform public.winkel_muteer_voorraad(v_org, v_kaas, 'telling', 3);
    v_o := public.winkel_plaats_order(v_org, 'test-sleutel-' || gen_random_uuid(), 'test-token-' || gen_random_uuid(), 'afhalen', null,
        'Test', 'test@example.invalid', null, null, null, 5000, 0, 5000, '{}'::jsonb, 'https://example.invalid', jsonb_build_array(v_regel_a, v_regel_k),
        p_betaalwijze => 'reservering', p_nu_te_betalen_cents => 250, p_rest_cents => 4750);
    v_o3 := v_o.id;
    update public.winkel_orders set status = 'betaald', betaald_at = now() where id = v_o3;
    -- Na het bestellen geteld: er ligt nog maar 1 kaas (de order vraagt er 2).
    perform public.winkel_muteer_voorraad(v_org, v_kaas, 'telling', 1);

    v_r := public.winkel_order_ophalen(v_org, v_o3, 'pin', 'vastgesteld');
    if v_r->>'uitkomst' is distinct from 'te_weinig_voorraad' or coalesce(v_r->>'melding', '') not like '%onder nul%' then
        v_fouten := v_fouten || 'te weinig kaas gaf ' || v_r::text || '; ';
    end if;
    if exists (select 1 from public.winkel_voorraad_mutaties where order_id = v_o3) then v_fouten := v_fouten || 'te_weinig_voorraad boekte toch iets; '; end if;
    if exists (select 1 from public.winkel_order_regels where order_id = v_o3 and (klaargezet_at is not null or opgehaald_at is not null)) then
        v_fouten := v_fouten || 'te_weinig_voorraad liet een regel ingepakt of opgehaald; ';
    end if;
    if exists (select 1 from public.winkel_orders where id = v_o3 and rest_betaald_at is not null) then v_fouten := v_fouten || 'te_weinig_voorraad boekte de rest; '; end if;
    select voorraad into v_n from public.winkel_producten where id = v_bier;
    if v_n <> 16 then v_fouten := v_fouten || 'bier na te_weinig_voorraad ' || v_n || ' i.p.v. 16; '; end if;

    -- ── O4: één doos al gescand, de rest van de order mee via ophalen ─────────
    v_o := public.winkel_plaats_order(v_org, 'test-sleutel-' || gen_random_uuid(), 'test-token-' || gen_random_uuid(), 'afhalen', null,
        'Test', 'test@example.invalid', null, null, null, 3500, 0, 3500, '{}'::jsonb, 'https://example.invalid', jsonb_build_array(v_regel_a));
    v_o4 := v_o.id;
    update public.winkel_orders set status = 'betaald', betaald_at = now() where id = v_o4;
    select id into v_r1 from public.winkel_order_regels where order_id = v_o4;
    v_codes := public.winkel_dozen_voor_regel(v_org, v_r1, array['TEST doos 1', 'TEST doos 2']);
    v_r := public.winkel_doos_ophalen(v_org, v_codes->0->>'code');
    if v_r->>'uitkomst' is distinct from 'opgehaald' then v_fouten := v_fouten || 'doosscan O4 gaf ' || v_r::text || '; '; end if;
    select count(*) into v_mut from public.winkel_voorraad_mutaties where order_id = v_o4;
    v_r := public.winkel_order_ophalen(v_org, v_o4);
    if v_r->>'uitkomst' is distinct from 'leeftijd_nodig' then v_fouten := v_fouten || 'O4 na doosscan zonder leeftijd gaf ' || (v_r->>'uitkomst') || '; '; end if;
    v_r := public.winkel_order_ophalen(v_org, v_o4, null, 'vastgesteld', 'toonbank');
    if v_r->>'uitkomst' is distinct from 'opgehaald' or coalesce(jsonb_array_length(v_r->'boekingen'), -1) <> 0 then v_fouten := v_fouten || 'O4 na doosscan gaf ' || v_r::text || '; '; end if;
    if (select count(*) from public.winkel_voorraad_mutaties where order_id = v_o4) <> v_mut then v_fouten := v_fouten || 'O4 boekte na de doosscan nog eens af; '; end if;
    if exists (select 1 from public.winkel_dozen where order_id = v_o4 and opgehaald_at is null) then v_fouten := v_fouten || 'O4 tweede doos niet op opgehaald; '; end if;
    if not exists (select 1 from public.winkel_order_regels where order_id = v_o4 and opgehaald_bron = 'toonbank') then v_fouten := v_fouten || 'O4 bron niet toonbank; '; end if;

    -- ── winkel_order_ophalen_terug ────────────────────────────────────────────
    select count(*) into v_mut from public.winkel_voorraad_mutaties where order_id = v_o1;
    v_r := public.winkel_order_ophalen_terug(v_org, v_o1);
    if v_r->>'uitkomst' is distinct from 'teruggezet' or (v_r->>'regels')::int is distinct from 1 or (v_r->>'dozen')::int is distinct from 2 then v_fouten := v_fouten || 'terug O1 gaf ' || v_r::text || '; '; end if;
    if not exists (select 1 from public.winkel_order_regels
                    where order_id = v_o1 and opgehaald_at is null and opgehaald_door is null and opgehaald_bron is null
                      and leeftijd_vastgesteld_at is null and klaargezet_at is not null) then
        v_fouten := v_fouten || 'terug O1: status niet terug of inpakken ongedaan; ';
    end if;
    if exists (select 1 from public.winkel_dozen where order_id = v_o1 and opgehaald_at is not null) then v_fouten := v_fouten || 'terug O1: dozen nog opgehaald; '; end if;
    if (select count(*) from public.winkel_voorraad_mutaties where order_id = v_o1) <> v_mut then v_fouten := v_fouten || 'terug O1 boekte voorraad; '; end if;
    select voorraad into v_n from public.winkel_producten where id = v_bier;
    if v_n <> 12 then v_fouten := v_fouten || 'bier na terug ' || v_n || ' i.p.v. 12 (16 − 4 van O4); '; end if;
    -- Weer ophalen: geen tweede afboeking.
    v_r := public.winkel_order_ophalen(v_org, v_o1, null, 'vastgesteld');
    if v_r->>'uitkomst' is distinct from 'opgehaald' or coalesce(jsonb_array_length(v_r->'boekingen'), -1) <> 0 then v_fouten := v_fouten || 'O1 na terug opnieuw ophalen gaf ' || v_r::text || '; '; end if;

    -- Op een eerdere dag opgehaald: niet meer terug, niets gewijzigd.
    v_t := now() - interval '2 days';
    update public.winkel_order_regels set opgehaald_at = v_t where order_id = v_o2;
    v_r := public.winkel_order_ophalen_terug(v_org, v_o2);
    if v_r->>'uitkomst' is distinct from 'niet_zelfde_dag' then v_fouten := v_fouten || 'terug na 2 dagen gaf ' || (v_r->>'uitkomst') || '; '; end if;
    if exists (select 1 from public.winkel_order_regels where order_id = v_o2 and opgehaald_at is distinct from v_t) then v_fouten := v_fouten || 'niet_zelfde_dag wijzigde O2; '; end if;
    -- De rest van O2 blijft geboekt.
    if not exists (select 1 from public.winkel_orders where id = v_o2 and rest_betaald_at is not null) then v_fouten := v_fouten || 'O2 rest verdwenen; '; end if;

    v_r := public.winkel_order_ophalen_terug(v_org, v_o3);
    if v_r->>'uitkomst' is distinct from 'niet_opgehaald' then v_fouten := v_fouten || 'terug van niet-opgehaalde order gaf ' || (v_r->>'uitkomst') || '; '; end if;
    v_r := public.winkel_order_ophalen_terug(v_org, -1);
    if v_r->>'uitkomst' is distinct from 'onbekend' then v_fouten := v_fouten || 'terug van onbekende order gaf ' || (v_r->>'uitkomst') || '; '; end if;
    v_r := public.winkel_order_ophalen_terug(v_ander, v_o1);
    if v_r->>'uitkomst' is distinct from 'onbekend' then v_fouten := v_fouten || 'terug via andere organisatie gaf ' || (v_r->>'uitkomst') || '; '; end if;

    -- ── Ongeldige invoer: 22023, niets gewijzigd ──────────────────────────────
    for v_i in 1..4 loop
        begin
            case v_i
                when 1 then perform public.winkel_order_ophalen(v_org, v_o3, 'bitcoin', 'vastgesteld');
                when 2 then perform public.winkel_order_ophalen(v_org, v_o3, 'pin', 'misschien');
                when 3 then perform public.winkel_order_ophalen(v_org, v_o3, 'pin', 'vastgesteld', 'website');
                else        perform public.winkel_order_ophalen(v_org, v_o3, 'pin', 'vastgesteld', 'toonbank', null, gen_random_uuid());
            end case;
            v_fouten := v_fouten || 'ongeldige invoer ' || v_i || ' niet geweigerd; ';
        exception when sqlstate '22023' then null;
        end;
    end loop;

    -- ── Rechten ───────────────────────────────────────────────────────────────
    if has_function_privilege('anon', 'public.winkel_order_ophalen(uuid, bigint, text, text, text, uuid, uuid)', 'EXECUTE')
       or has_function_privilege('anon', 'public.winkel_order_ophalen_terug(uuid, bigint)', 'EXECUTE') then
        v_fouten := v_fouten || 'anon mag winkel_order_ophalen(_terug); ';
    end if;
    if not has_function_privilege('authenticated', 'public.winkel_order_ophalen(uuid, bigint, text, text, text, uuid, uuid)', 'EXECUTE')
       or not has_function_privilege('service_role', 'public.winkel_order_ophalen(uuid, bigint, text, text, text, uuid, uuid)', 'EXECUTE')
       or not has_function_privilege('authenticated', 'public.winkel_order_ophalen_terug(uuid, bigint)', 'EXECUTE')
       or not has_function_privilege('service_role', 'public.winkel_order_ophalen_terug(uuid, bigint)', 'EXECUTE') then
        v_fouten := v_fouten || 'authenticated of service_role mist winkel_order_ophalen(_terug); ';
    end if;

    -- In het echt: anon wordt geweigerd vóór de functie draait.
    begin
        perform set_config('request.jwt.claims', '{"role":"anon"}', true);
        perform set_config('role', 'anon', true);
        perform public.winkel_order_ophalen(v_org, v_o3, 'pin', 'vastgesteld');
        raise exception 'anon_kwam_erdoor';
    exception
        when insufficient_privilege then null;
        when others then v_fouten := v_fouten || 'anon op winkel_order_ophalen: ' || sqlerrm || '; ';
    end;

    -- Een lid van e2e-hop-en-bites: eigen organisatie ja, een vreemde 42501.
    begin
        insert into auth.users (id, aud, role, email)
        values (v_user, 'authenticated', 'authenticated', 'winkel-ophalen-' || v_user || '@example.invalid');
        insert into public.organization_members (organization_id, user_id, role, status)
        values (v_org, v_user, 'Medewerker', 'active');
        v_gebruiker_ok := true;
    exception when others then
        v_fouten := v_fouten || 'tijdelijke testgebruiker niet aan te maken (' || sqlerrm || '); ';
    end;
    if v_gebruiker_ok then
        begin
            perform set_config('request.jwt.claims', json_build_object('sub', v_user, 'role', 'authenticated')::text, true);
            perform set_config('role', 'authenticated', true);
            v_r := public.winkel_order_ophalen(v_org, -1);
            if v_r->>'uitkomst' is distinct from 'onbekend' then v_fouten := v_fouten || 'lid kreeg ' || v_r::text || '; '; end if;
            begin
                perform public.winkel_order_ophalen(v_ander, -1);
                v_fouten := v_fouten || 'lid kwam binnen bij een vreemde organisatie; ';
            exception when insufficient_privilege then null;
            end;
            begin
                perform public.winkel_order_ophalen_terug(v_ander, -1);
                v_fouten := v_fouten || 'lid kwam binnen bij terug van een vreemde organisatie; ';
            exception when insufficient_privilege then null;
            end;
            raise exception 'terug_naar_postgres';
        exception when others then
            if sqlerrm <> 'terug_naar_postgres' then
                v_fouten := v_fouten || 'als lid van e2e: ' || sqlerrm || '; ';
            end if;
        end;
    end if;
    perform set_config('request.jwt.claims', '', true);

    if v_fouten <> '' then raise exception 'FOUT: %', v_fouten; end if;
    raise exception 'GESLAAGD: onbekend, niet_betaald, leeftijd_nodig, geweigerd (niets gewijzigd, ook geen rest), opgehaald met afboeken van de niet-ingepakte regel en dozen, al_opgehaald zonder dubbele boeking, rest_nodig, rest in dezelfde transactie, te_weinig_voorraad zonder enige boeking, ophalen na doosscan, terug alleen status en alleen dezelfde dag, 22023 bij ongeldige invoer, anon geweigerd, lid alleen eigen organisatie — alles teruggedraaid';
end $$;
