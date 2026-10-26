-- Test voor migratie 20261013120000_kerst_betalen_bij_afhalen: een Kerst-Box
-- (betaalwijze 'bij_afhalen') gaat aan de balie niet mee zonder betaling.
-- Draait in een transactie die aan het eind wordt teruggedraaid.
--
-- ALLEEN op de dev-database of de lokale testdatabase, nooit op live:
--
--   npm --prefix tools/testdb run test
--   npx supabase db query --db-url "$DEV_DB_URL" -o table -f supabase/tests/kerst_betalen.sql
--
-- Vereist de seed supabase/tests/seed_vier_naober.sql (organisatie
-- e2e-hop-en-bites).
--
-- Wat hij bewijst:
--   winkel_order_ophalen   bij_afhalen zonder methode = rest_nodig (hele bedrag,
--                          reeds 0), niets gewijzigd; met pin = opgehaald en de
--                          rest in dezelfde transactie geboekt; met alcohol
--                          eerst leeftijd_nodig, ook als er al betaald is
--   al betaald             na winkel_boek_rest (Kerst-scherm: Pin/Contant) geen
--                          rest_nodig meer en niets dubbel geboekt
--   winkel_doos_ophalen    bij_afhalen zonder methode = rest_nodig, doos niet
--                          opgehaald; met contant = opgehaald en rest geboekt
--   volledig               ongewijzigd: geen rest-stap

do $$
declare
    v_org     uuid;
    v_kaas    uuid; v_bier uuid;
    v_art_k   uuid; v_art_b uuid;
    v_regel_k jsonb; v_regel_b jsonb;
    v_o       public.winkel_orders%rowtype;
    v_k1      bigint; v_k2 bigint; v_k3 bigint; v_k4 bigint; v_v1 bigint;
    v_r1      bigint;
    v_codes   jsonb;
    v_r       jsonb;
    v_fouten  text := '';
begin
    select id into v_org from public.organizations where slug = 'e2e-hop-en-bites';
    if v_org is null then
        raise exception 'GEWEIGERD: organisatie e2e-hop-en-bites bestaat niet. Deze test draait alleen op de dev-database, na supabase/tests/seed_vier_naober.sql.';
    end if;

    insert into public.winkel_producten (organization_id, naam, type, eenheid, prijs_per, inkoop_excl_cents)
    values (v_org, 'TEST kerst kaas', 'kaas', 'stuk', 1, 300) returning id into v_kaas;
    insert into public.winkel_producten (organization_id, naam, type, eenheid, prijs_per, inkoop_excl_cents, alcohol)
    values (v_org, 'TEST kerst bubbels', 'wijn', 'stuk', 1, 900, true) returning id into v_bier;
    perform public.winkel_muteer_voorraad(v_org, v_kaas, 'telling', 20);
    perform public.winkel_muteer_voorraad(v_org, v_bier, 'telling', 20);

    insert into public.winkel_artikelen (organization_id, slug, naam, actief, alcohol)
    values (v_org, 'test-kerst-box-' || substr(gen_random_uuid()::text, 1, 8), 'TEST Kerst-Box', true, false)
    returning id into v_art_k;
    insert into public.winkel_artikelen (organization_id, slug, naam, actief, alcohol)
    values (v_org, 'test-kerst-bubbels-' || substr(gen_random_uuid()::text, 1, 8), 'TEST Crémant', true, true)
    returning id into v_art_b;

    v_regel_k := jsonb_build_object(
        'artikel_id', v_art_k, 'slug', 'test-kerst-box', 'naam', 'TEST Kerst-Box', 'aantal', 2, 'eenheid', 'per persoon',
        'stuk_cents', 4500, 'bedrag_cents', 9000, 'btw_pct', 9, 'eenheden', 2, 'voorraad_eenheden', 0, 'alcohol', false,
        'componenten', jsonb_build_array(
            jsonb_build_object('product_id', v_kaas, 'slot_type', 'kaas', 'naam', 'Kaas', 'hoeveelheid', 2, 'eenheid', 'stuk')));
    v_regel_b := jsonb_build_object(
        'artikel_id', v_art_b, 'slug', 'test-kerst-bubbels', 'naam', 'TEST Crémant', 'aantal', 1, 'eenheid', 'per fles',
        'stuk_cents', 2200, 'bedrag_cents', 2200, 'btw_pct', 21, 'eenheden', 1, 'voorraad_eenheden', 0, 'alcohol', true,
        'componenten', jsonb_build_array(
            jsonb_build_object('product_id', v_bier, 'slot_type', 'wijn', 'naam', 'Crémant', 'hoeveelheid', 1, 'eenheid', 'stuk')));

    -- ── K1: Kerst-Box zonder alcohol, niets betaald ───────────────────────────
    v_o := public.winkel_plaats_order(v_org, 'test-sleutel-' || gen_random_uuid(), 'test-token-' || gen_random_uuid(), 'afhalen', null,
        'Test', 'test@example.invalid', null, null, null, 9000, 0, 9000, '{}'::jsonb, 'https://example.invalid', jsonb_build_array(v_regel_k),
        p_betaalwijze => 'bij_afhalen', p_nu_te_betalen_cents => 0, p_rest_cents => 9000);
    v_k1 := v_o.id;
    update public.winkel_orders set status = 'betaald', betaald_at = now() where id = v_k1;

    v_r := public.winkel_order_ophalen(v_org, v_k1);
    if v_r->>'uitkomst' is distinct from 'rest_nodig' or (v_r->>'rest_cents')::int is distinct from 9000 or (v_r->>'reeds_cents')::int is distinct from 0 then
        v_fouten := v_fouten || 'K1 zonder betaling gaf ' || v_r::text || '; ';
    end if;
    if exists (select 1 from public.winkel_orders where id = v_k1 and rest_betaald_at is not null)
       or exists (select 1 from public.winkel_order_regels where order_id = v_k1 and (opgehaald_at is not null or klaargezet_at is not null))
       or exists (select 1 from public.winkel_voorraad_mutaties where order_id = v_k1) then
        v_fouten := v_fouten || 'K1 rest_nodig wijzigde iets; ';
    end if;

    v_r := public.winkel_order_ophalen(v_org, v_k1, 'pin');
    if v_r->>'uitkomst' is distinct from 'opgehaald' or v_r->>'rest_geboekt' is distinct from 'pin' or (v_r->>'rest_cents')::int is distinct from 9000 then
        v_fouten := v_fouten || 'K1 met pin gaf ' || v_r::text || '; ';
    end if;
    if not exists (select 1 from public.winkel_orders where id = v_k1 and rest_betaald_at is not null and rest_betaalmethode = 'pin') then
        v_fouten := v_fouten || 'K1 rest niet geboekt; ';
    end if;

    -- ── K2: met crémant, al betaald op het Kerst-scherm (winkel_boek_rest) ────
    v_o := public.winkel_plaats_order(v_org, 'test-sleutel-' || gen_random_uuid(), 'test-token-' || gen_random_uuid(), 'afhalen', null,
        'Test', 'test@example.invalid', null, null, null, 11200, 0, 11200, '{}'::jsonb, 'https://example.invalid', jsonb_build_array(v_regel_k, v_regel_b),
        p_betaalwijze => 'bij_afhalen', p_nu_te_betalen_cents => 0, p_rest_cents => 11200);
    v_k2 := v_o.id;
    update public.winkel_orders set status = 'betaald', betaald_at = now() where id = v_k2;

    -- Niets betaald en geen leeftijd: eerst de rest (zelfde volgorde als bij een reservering).
    v_r := public.winkel_order_ophalen(v_org, v_k2);
    if v_r->>'uitkomst' is distinct from 'rest_nodig' then v_fouten := v_fouten || 'K2 zonder alles gaf ' || (v_r->>'uitkomst') || '; '; end if;
    if public.winkel_boek_rest(v_k2, 'contant') is distinct from 'geboekt' then v_fouten := v_fouten || 'K2 winkel_boek_rest boekte niet; '; end if;
    -- Betaald, maar alcohol: nu de leeftijd.
    v_r := public.winkel_order_ophalen(v_org, v_k2);
    if v_r->>'uitkomst' is distinct from 'leeftijd_nodig' or (v_r->>'rest_cents')::int is distinct from 0 then
        v_fouten := v_fouten || 'K2 betaald zonder leeftijd gaf ' || v_r::text || '; ';
    end if;
    v_r := public.winkel_order_ophalen(v_org, v_k2, null, 'vastgesteld');
    if v_r->>'uitkomst' is distinct from 'opgehaald' or v_r->>'rest_geboekt' is not null or v_r->>'leeftijd' is distinct from 'vastgesteld' then
        v_fouten := v_fouten || 'K2 ophalen gaf ' || v_r::text || '; ';
    end if;
    if not exists (select 1 from public.winkel_orders where id = v_k2 and rest_betaalmethode = 'contant') then
        v_fouten := v_fouten || 'K2 betaalmethode overschreven; ';
    end if;

    -- ── K3: doosscan zonder betaling ──────────────────────────────────────────
    v_o := public.winkel_plaats_order(v_org, 'test-sleutel-' || gen_random_uuid(), 'test-token-' || gen_random_uuid(), 'afhalen', null,
        'Test', 'test@example.invalid', null, null, null, 9000, 0, 9000, '{}'::jsonb, 'https://example.invalid', jsonb_build_array(v_regel_k),
        p_betaalwijze => 'bij_afhalen', p_nu_te_betalen_cents => 0, p_rest_cents => 9000);
    v_k3 := v_o.id;
    update public.winkel_orders set status = 'betaald', betaald_at = now() where id = v_k3;
    select id into v_r1 from public.winkel_order_regels where order_id = v_k3;
    v_codes := public.winkel_dozen_voor_regel(v_org, v_r1, array['TEST kerstdoos']);

    v_r := public.winkel_doos_ophalen(v_org, v_codes->0->>'code');
    if v_r->>'uitkomst' is distinct from 'rest_nodig' or (v_r->>'rest_cents')::int is distinct from 9000 then
        v_fouten := v_fouten || 'K3 doosscan zonder betaling gaf ' || v_r::text || '; ';
    end if;
    if exists (select 1 from public.winkel_dozen where order_id = v_k3 and opgehaald_at is not null)
       or exists (select 1 from public.winkel_orders where id = v_k3 and rest_betaald_at is not null) then
        v_fouten := v_fouten || 'K3 rest_nodig wijzigde iets; ';
    end if;
    v_r := public.winkel_doos_ophalen(v_org, v_codes->0->>'code', 'contant');
    if v_r->>'uitkomst' is distinct from 'opgehaald' or v_r->>'rest_geboekt' is distinct from 'contant' then
        v_fouten := v_fouten || 'K3 doosscan met contant gaf ' || v_r::text || '; ';
    end if;
    if not exists (select 1 from public.winkel_orders where id = v_k3 and rest_betaald_at is not null and rest_betaalmethode = 'contant') then
        v_fouten := v_fouten || 'K3 rest niet geboekt bij doosscan; ';
    end if;

    -- ── K4: geweigerd bij een Kerst-Box met alcohol: geen rest geboekt ────────
    v_o := public.winkel_plaats_order(v_org, 'test-sleutel-' || gen_random_uuid(), 'test-token-' || gen_random_uuid(), 'afhalen', null,
        'Test', 'test@example.invalid', null, null, null, 2200, 0, 2200, '{}'::jsonb, 'https://example.invalid', jsonb_build_array(v_regel_b),
        p_betaalwijze => 'bij_afhalen', p_nu_te_betalen_cents => 0, p_rest_cents => 2200);
    v_k4 := v_o.id;
    update public.winkel_orders set status = 'betaald', betaald_at = now() where id = v_k4;
    v_r := public.winkel_order_ophalen(v_org, v_k4, 'pin', 'geweigerd');
    if v_r->>'uitkomst' is distinct from 'geweigerd'
       or exists (select 1 from public.winkel_orders where id = v_k4 and rest_betaald_at is not null) then
        v_fouten := v_fouten || 'K4 geweigerd gaf ' || v_r::text || ' of boekte de rest; ';
    end if;

    -- ── V1: volledig online betaald: geen rest-stap ───────────────────────────
    v_o := public.winkel_plaats_order(v_org, 'test-sleutel-' || gen_random_uuid(), 'test-token-' || gen_random_uuid(), 'afhalen', null,
        'Test', 'test@example.invalid', null, null, null, 9000, 0, 9000, '{}'::jsonb, 'https://example.invalid', jsonb_build_array(v_regel_k));
    v_v1 := v_o.id;
    update public.winkel_orders set status = 'betaald', betaald_at = now() where id = v_v1;
    v_r := public.winkel_order_ophalen(v_org, v_v1);
    if v_r->>'uitkomst' is distinct from 'opgehaald' or v_r->>'rest_geboekt' is not null then
        v_fouten := v_fouten || 'volledig betaald gaf ' || v_r::text || '; ';
    end if;

    if v_fouten <> '' then raise exception 'FOUT: %', v_fouten; end if;
    raise exception 'GESLAAGD: Kerst-Box bij_afhalen zonder betaling = rest_nodig (balie en doosscan, niets gewijzigd); met pin of contant opgehaald en rest geboekt in één transactie; al betaald via winkel_boek_rest = geen dubbele rest, wel 18+; geweigerd boekt geen rest; volledig ongewijzigd — alles teruggedraaid';
end $$;
