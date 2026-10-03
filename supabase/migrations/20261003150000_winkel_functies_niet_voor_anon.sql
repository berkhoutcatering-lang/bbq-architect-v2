-- ════════════════════════════════════════════════════════════════════════════
--  BA-S — winkel- en voorraadfuncties niet voor anon   [noodfix]
--  Plan v5, stap 0.3 · Draaiboek: docs/ecosysteem/stap-0-supabase.md
--  Test: supabase/tests/functie_rechten.sql (alleen op de dev-database)
-- ════════════════════════════════════════════════════════════════════════════
--
--  Het lek
--    Supabase geeft elke nieuwe functie in public een eigen EXECUTE voor anon,
--    authenticated en service_role (standaardrechten van de rol postgres).
--    `REVOKE ALL … FROM PUBLIC` in de eerdere winkelmigraties haalt die grant
--    voor anon niet weg. Een aantal SECURITY DEFINER-functies controleert de
--    organisatie alleen als auth.uid() gevuld is; voor anon is auth.uid() NULL.
--    Met de publieke anon-sleutel kon je dus zonder in te loggen bijvoorbeeld
--    winkel_muteer_voorraad of voorraad_overboeken aanroepen voor elke
--    organisatie.
--
--    Hetzelfde lek zit in drie functies van de productie en de keukenvoorraad
--    (review 3 oktober): productie_partij_afronden (boekt productie voor elke
--    organisatie), partij_als_jsonb (leest elke partij) en
--    increment_inventory_stock (muteert de keukenvoorraad). Ook die hadden
--    alleen `revoke … from public`. Ze gaan hier mee.
--
--  De fix (alleen rechten, geen functie-inhoud verandert)
--    1. private.vereis_org(p_org): de org-check voor nieuwe functies.
--    2. REVOKE van PUBLIC en anon op ALLE overloads van winkel_%, voorraad_%,
--       keuken_afwijking, productie_partij_afronden, partij_als_jsonb en
--       increment_inventory_stock in public.
--    3. Expliciete grants: wat de BA-gebruikersclient aanroept → authenticated
--       en service_role; wat alleen via de service-client loopt → alleen
--       service_role (authenticated eraf).
--    4. Nieuwe functies van postgres in public krijgen geen grant voor anon
--       meer. Let op: Postgres geeft PUBLIC standaard EXECUTE op elke nieuwe
--       functie (globale standaard, per schema niet in te trekken). Een nieuwe
--       functie heeft dus nog steeds `REVOKE ALL … FROM PUBLIC, anon` nodig;
--       supabase/tests/functie_rechten.sql bewaakt dat voor winkel_/voorraad_.
--    5. Zelfcontrole aan het eind: klopt het niet, dan breekt de migratie af
--       en is er niets veranderd.
--
--  Gevolgen voor de app: geen. De website roept nooit zelf een databasefunctie
--  aan; BA gebruikt de gebruikersclient (authenticated) of de service-client.
--  Nagelopen op feat/winkelvoorraad én main: elke .rpc('winkel_…'),
--  .rpc('voorraad_…'), .rpc('keuken_afwijking'),
--  .rpc('productie_partij_afronden') en .rpc('increment_inventory_stock')
--  staat hieronder bij zijn aanroeper. partij_als_jsonb heeft geen .rpc().
--
--  Terugdraaien als er toch iets stuk blijkt (nooit naar anon):
--    GRANT EXECUTE ON FUNCTION public.<functie>(<argumenttypes>) TO authenticated;


-- ── 0. Pre-flight ───────────────────────────────────────────────────────────
DO $$
DECLARE
    v_sig       TEXT;
    v_ontbreekt TEXT := '';
BEGIN
    IF to_regprocedure('private.user_org_ids()') IS NULL THEN
        RAISE EXCEPTION 'ba-s: functie private.user_org_ids() ontbreekt (migratie 20260508084409)';
    END IF;
    IF (SELECT count(*) FROM pg_roles WHERE rolname IN ('anon', 'authenticated', 'service_role')) <> 3 THEN
        RAISE EXCEPTION 'ba-s: de Supabase-rollen anon, authenticated en service_role ontbreken';
    END IF;

    FOREACH v_sig IN ARRAY ARRAY[
        -- gebruikersclient
        'public.winkel_bezetting_product(uuid, bigint)',
        'public.winkel_zet_klaargezet(uuid, bigint, boolean)',
        'public.winkel_doos_ophalen(uuid, text, text)',
        'public.winkel_boek_rest(bigint, text)',
        'public.winkel_dozen_voor_regel(uuid, bigint, text[])',
        'public.winkel_muteer_voorraad(uuid, uuid, text, numeric, text, text, bigint, bigint, date, integer, uuid, text, integer, bigint, uuid)',
        'public.voorraad_overboeken(uuid, integer, uuid, numeric, text, text, text)',
        'public.keuken_afwijking(uuid, integer, numeric, text, text, text)',
        'public.voorraad_invoer_boeken(uuid, uuid)',
        'public.productie_partij_afronden(uuid, uuid, bigint, numeric, text, numeric, text, jsonb, date, date, text, text, uuid, uuid, integer, bigint, uuid, integer, numeric, jsonb, text)',
        -- alleen service_role
        'public.winkel_plaats_order(uuid, text, text, text, uuid, text, text, text, jsonb, text, integer, integer, integer, jsonb, text, jsonb, text, integer, integer)',
        'public.winkel_start_betaalpoging(bigint)',
        'public.winkel_bevestig_betaling(bigint, text, integer, text)',
        'public.winkel_controleer_capaciteit(uuid, jsonb, bigint)',
        'public.winkel_regels_json(bigint)',
        'public.winkel_bezetting_moment(uuid, bigint)',
        'public.winkel_bezetting_voorraad(uuid, bigint)',
        'public.winkel_keuken_factor(text, text)',
        'public.partij_als_jsonb(uuid, boolean)'
    ]
    LOOP
        IF to_regprocedure(v_sig) IS NULL THEN
            v_ontbreekt := v_ontbreekt || E'\n  ' || v_sig;
        END IF;
    END LOOP;

    IF v_ontbreekt <> '' THEN
        RAISE EXCEPTION 'ba-s: deze functies ontbreken (eerst de objectproef supabase/checks/verify_winkel_live.sql draaien):%', v_ontbreekt;
    END IF;

    -- increment_inventory_stock is geen voorwaarde: stap 2 en 3c slaan hem
    -- over als hij er niet is (hij komt uit 20260916130200, op live bestaat
    -- hij met deze signatuur).
    IF to_regprocedure('public.increment_inventory_stock(uuid, integer, numeric, text, numeric, uuid, text, bigint, uuid)') IS NULL THEN
        RAISE NOTICE 'ba-s: increment_inventory_stock(uuid, integer, numeric, text, numeric, uuid, text, bigint, uuid) bestaat niet; overgeslagen';
    END IF;
END $$;


-- ── 1. private.vereis_org ───────────────────────────────────────────────────
-- De org-check voor elke nieuwe SECURITY DEFINER-functie:
--     PERFORM private.vereis_org(p_org);
-- Laat door:
--   (i)   geen JWT-claims: een directe databaseverbinding (migratie, SQL-test,
--         psql, cron). PostgREST zet de claims altijd, ook voor anon. Wie met
--         SET ROLE anon/authenticated binnenkomt zonder claims, valt hier niet
--         onder.
--   (ii)  rol service_role in de claims;
--   (iii) rol authenticated en p_org hoort bij de gebruiker.
-- Anders 42501.
CREATE OR REPLACE FUNCTION private.vereis_org(p_org UUID)
RETURNS VOID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_claims TEXT := NULLIF(current_setting('request.jwt.claims', true), '');
    v_rol    TEXT;
BEGIN
    IF v_claims IS NULL THEN
        IF COALESCE(current_setting('role', true), 'none') IN ('anon', 'authenticated') THEN
            RAISE EXCEPTION 'geen toegang: geen sessie' USING ERRCODE = '42501';
        END IF;
        RETURN;
    END IF;

    v_rol := v_claims::JSONB ->> 'role';
    IF v_rol = 'service_role' THEN
        RETURN;
    END IF;
    IF v_rol = 'authenticated' AND p_org IS NOT NULL AND p_org IN (SELECT private.user_org_ids()) THEN
        RETURN;
    END IF;

    RAISE EXCEPTION 'geen toegang tot deze organisatie' USING ERRCODE = '42501';
END $$;
COMMENT ON FUNCTION private.vereis_org(UUID) IS
    'Org-check voor SECURITY DEFINER-functies: door bij een directe databaseverbinding (geen JWT-claims), service_role, of authenticated met lidmaatschap van p_org. Anders 42501.';
REVOKE ALL ON FUNCTION private.vereis_org(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.vereis_org(UUID) TO authenticated, service_role;


-- ── 2. Niet voor PUBLIC en anon: alle overloads ─────────────────────────────
-- Ook functies die alleen op live staan (live loopt voor op main) en de
-- triggerfuncties (winkel_regel_klaar_op, winkel_voorraad_bewaken,
-- voorraad_invoer_op_slot, en op live sinds 3 oktober winkel_catalogus_poort
-- van feat/catalogus): een trigger vraagt bij het afgaan geen EXECUTE.
-- De lus werkt op wat er is: een functie die (nog) niet bestaat, zoals
-- winkel_catalogus_poort op dev of increment_inventory_stock, slaat hij over.
DO $$
DECLARE
    v_f REGPROCEDURE;
BEGIN
    FOR v_f IN
        SELECT p.oid::REGPROCEDURE
          FROM pg_proc p
          JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public'
           AND (p.proname LIKE 'winkel\_%' OR p.proname LIKE 'voorraad\_%'
                OR p.proname IN ('keuken_afwijking', 'productie_partij_afronden', 'partij_als_jsonb', 'increment_inventory_stock'))
         ORDER BY p.oid
    LOOP
        EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', v_f);
    END LOOP;
END $$;


-- ── 3a. Gebruikersclient: authenticated en service_role ─────────────────────
-- src/app/voorraad/winkel/page.tsx:37 (gebruikersclient: createServerSupabase);
-- ook service: src/lib/winkel/supabaseStore.ts:120 en src/lib/voorraad/meldingen.ts:41.
-- Tot nu toe werkte dit stilzwijgend via de Supabase-standaardgrant.
GRANT EXECUTE ON FUNCTION public.winkel_bezetting_product(UUID, BIGINT) TO authenticated, service_role;
-- src/app/verkoop/webshop/actions.ts:468 (zetKlaargezet)
GRANT EXECUTE ON FUNCTION public.winkel_zet_klaargezet(UUID, BIGINT, BOOLEAN) TO authenticated, service_role;
-- src/app/verkoop/webshop/actions.ts:498 (doosscan aan de balie)
GRANT EXECUTE ON FUNCTION public.winkel_doos_ophalen(UUID, TEXT, TEXT) TO authenticated, service_role;
-- src/app/verkoop/webshop/actions.ts:662 (boekRestBetaling); ook service: src/lib/winkel/supabaseStore.ts:174
GRANT EXECUTE ON FUNCTION public.winkel_boek_rest(BIGINT, TEXT) TO authenticated, service_role;
-- src/lib/winkel/etiketten.ts:65, via src/app/api/labels/jobs/route.ts (withTenantAuth = gebruikersclient)
GRANT EXECUTE ON FUNCTION public.winkel_dozen_voor_regel(UUID, BIGINT, TEXT[]) TO authenticated, service_role;
-- src/app/voorraad/winkel/actions.ts:80, 107 en 173 (tellen, ontvangst, afwijking)
GRANT EXECUTE ON FUNCTION public.winkel_muteer_voorraad(UUID, UUID, TEXT, NUMERIC, TEXT, TEXT, BIGINT, BIGINT, DATE, INTEGER, UUID, TEXT, INTEGER, BIGINT, UUID) TO authenticated, service_role;
-- src/app/voorraad/winkel/actions.ts:134 (overboeken keuken ↔ winkel)
GRANT EXECUTE ON FUNCTION public.voorraad_overboeken(UUID, INTEGER, UUID, NUMERIC, TEXT, TEXT, TEXT) TO authenticated, service_role;
-- src/app/voorraad/winkel/actions.ts:185 (afwijking in de keuken)
GRANT EXECUTE ON FUNCTION public.keuken_afwijking(UUID, INTEGER, NUMERIC, TEXT, TEXT, TEXT) TO authenticated, service_role;
-- src/app/voorraad/ontvangst/actions.ts:361 ("Klopt, boeken")
GRANT EXECUTE ON FUNCTION public.voorraad_invoer_boeken(UUID, UUID) TO authenticated, service_role;


-- ── 3b. Alleen de service-client: alleen service_role ───────────────────────
-- maakSupabaseStore() zonder client = createServiceSupabase(); zo aangeroepen
-- vanuit de webshop-API (src/lib/winkel/context.ts:38) en de plaatsing
-- (src/app/verkoop/webshop/actions.ts:412 en 528).
-- src/lib/winkel/supabaseStore.ts:238
REVOKE ALL ON FUNCTION public.winkel_plaats_order(UUID, TEXT, TEXT, TEXT, UUID, TEXT, TEXT, TEXT, JSONB, TEXT, INTEGER, INTEGER, INTEGER, JSONB, TEXT, JSONB, TEXT, INTEGER, INTEGER) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.winkel_plaats_order(UUID, TEXT, TEXT, TEXT, UUID, TEXT, TEXT, TEXT, JSONB, TEXT, INTEGER, INTEGER, INTEGER, JSONB, TEXT, JSONB, TEXT, INTEGER, INTEGER) TO service_role;
-- src/lib/winkel/supabaseStore.ts:273
REVOKE ALL ON FUNCTION public.winkel_start_betaalpoging(BIGINT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.winkel_start_betaalpoging(BIGINT) TO service_role;
-- src/lib/winkel/supabaseStore.ts:283 (betaalbericht van myPOS)
REVOKE ALL ON FUNCTION public.winkel_bevestig_betaling(BIGINT, TEXT, INTEGER, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.winkel_bevestig_betaling(BIGINT, TEXT, INTEGER, TEXT) TO service_role;
-- alleen binnen plaats_order, start_betaalpoging en bevestig_betaling
REVOKE ALL ON FUNCTION public.winkel_controleer_capaciteit(UUID, JSONB, BIGINT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.winkel_controleer_capaciteit(UUID, JSONB, BIGINT) TO service_role;
-- alleen binnen start_betaalpoging en bevestig_betaling
REVOKE ALL ON FUNCTION public.winkel_regels_json(BIGINT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.winkel_regels_json(BIGINT) TO service_role;
-- src/lib/winkel/supabaseStore.ts:140; en binnen winkel_controleer_capaciteit
REVOKE ALL ON FUNCTION public.winkel_bezetting_moment(UUID, BIGINT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.winkel_bezetting_moment(UUID, BIGINT) TO service_role;
-- alleen binnen winkel_controleer_capaciteit
REVOKE ALL ON FUNCTION public.winkel_bezetting_voorraad(UUID, BIGINT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.winkel_bezetting_voorraad(UUID, BIGINT) TO service_role;
-- alleen binnen voorraad_overboeken (SECURITY DEFINER, draait als eigenaar)
REVOKE ALL ON FUNCTION public.winkel_keuken_factor(TEXT, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.winkel_keuken_factor(TEXT, TEXT) TO service_role;


-- ── 3c. Productie en keukenvoorraad ─────────────────────────────────────────
-- src/lib/productie/afronden.ts:176 (rondPartijAf), via
-- src/app/api/productie/partij-afronden/route.ts en
-- src/app/api/prep/complete-task/route.ts (withTenantAuth = gebruikersclient)
GRANT EXECUTE ON FUNCTION public.productie_partij_afronden(UUID, UUID, BIGINT, NUMERIC, TEXT, NUMERIC, TEXT, JSONB, DATE, DATE, TEXT, TEXT, UUID, UUID, INTEGER, BIGINT, UUID, INTEGER, NUMERIC, JSONB, TEXT) TO authenticated, service_role;
-- Geen .rpc() in de app: alleen binnen productie_partij_afronden (SECURITY
-- DEFINER, draait als eigenaar). Dus alleen service_role, net als
-- winkel_regels_json.
REVOKE ALL ON FUNCTION public.partij_als_jsonb(UUID, BOOLEAN) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.partij_als_jsonb(UUID, BOOLEAN) TO service_role;
-- src/lib/dal/stockMutation.ts:53 (applyStockDelta: voorraad, nulmeting,
-- bonnen, verbruik, events) en src/lib/dal/inkoopOrders.ts:200 (ontvangst
-- inkooporder), allemaal met de gebruikersclient; verder binnen
-- productie_partij_afronden en voorraad_invoer_boeken (SECURITY DEFINER).
-- Alleen als hij bestaat.
DO $$
BEGIN
    IF to_regprocedure('public.increment_inventory_stock(uuid, integer, numeric, text, numeric, uuid, text, bigint, uuid)') IS NOT NULL THEN
        EXECUTE 'GRANT EXECUTE ON FUNCTION public.increment_inventory_stock(UUID, INTEGER, NUMERIC, TEXT, NUMERIC, UUID, TEXT, BIGINT, UUID) TO authenticated, service_role';
    END IF;
END $$;


-- ── 4. Nieuwe functies: geen standaardgrant meer voor anon ──────────────────
-- Geldt voor de rol die deze migratie draait. Draait hij niet als postgres
-- (bijvoorbeeld via de Management API), dan ook expliciet voor postgres: dat
-- is de rol waarvan Supabase de standaardrechten in public zet.
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM anon;

DO $$
BEGIN
    IF current_user <> 'postgres'
       AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'postgres')
       AND pg_has_role(current_user, 'postgres', 'MEMBER') THEN
        EXECUTE 'ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM anon';
    END IF;
END $$;


-- ── 5. Zelfcontrole ─────────────────────────────────────────────────────────
-- Een REVOKE door iemand die geen eigenaar is geeft alleen een WARNING. Daarom
-- hier hard controleren; klopt iets niet, dan draait de hele migratie terug.
-- Triggerfuncties (RETURNS trigger) tellen hier niet als lek: die zijn niet
-- los aan te roepen ("trigger functions can only be called as triggers").
-- Lukte de REVOKE daar niet (eigenaar is een andere rol, bijvoorbeeld bij
-- winkel_catalogus_poort), dan alleen een WARNING; of hij bestaat maakt niet
-- uit.
DO $$
DECLARE
    v_lek    TEXT;
    v_sig    TEXT;
    v_fouten TEXT := '';
    v_iis    CONSTANT TEXT := 'public.increment_inventory_stock(uuid, integer, numeric, text, numeric, uuid, text, bigint, uuid)';
BEGIN
    SELECT string_agg(p.oid::REGPROCEDURE::TEXT || ' (eigenaar ' || p.proowner::REGROLE::TEXT || ')', ', ' ORDER BY p.oid)
      INTO v_lek
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND (p.proname LIKE 'winkel\_%' OR p.proname LIKE 'voorraad\_%'
            OR p.proname IN ('keuken_afwijking', 'productie_partij_afronden', 'partij_als_jsonb', 'increment_inventory_stock'))
       AND p.prorettype <> 'trigger'::REGTYPE
       AND has_function_privilege('anon', p.oid, 'EXECUTE');
    IF v_lek IS NOT NULL THEN
        v_fouten := v_fouten || E'\n  anon mag nog: ' || v_lek;
    END IF;

    SELECT string_agg(p.oid::REGPROCEDURE::TEXT || ' (eigenaar ' || p.proowner::REGROLE::TEXT || ')', ', ' ORDER BY p.oid)
      INTO v_lek
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND (p.proname LIKE 'winkel\_%' OR p.proname LIKE 'voorraad\_%')
       AND p.prorettype = 'trigger'::REGTYPE
       AND has_function_privilege('anon', p.oid, 'EXECUTE');
    IF v_lek IS NOT NULL THEN
        RAISE WARNING 'ba-s: triggerfuncties met EXECUTE voor anon (geen lek, niet los aan te roepen; REVOKE als eigenaar herhalen): %', v_lek;
    END IF;

    IF has_function_privilege('anon', 'private.vereis_org(uuid)', 'EXECUTE') THEN
        v_fouten := v_fouten || E'\n  anon mag private.vereis_org';
    END IF;

    FOREACH v_sig IN ARRAY ARRAY[
        'private.vereis_org(uuid)',
        'public.winkel_bezetting_product(uuid, bigint)',
        'public.winkel_zet_klaargezet(uuid, bigint, boolean)',
        'public.winkel_doos_ophalen(uuid, text, text)',
        'public.winkel_boek_rest(bigint, text)',
        'public.winkel_dozen_voor_regel(uuid, bigint, text[])',
        'public.winkel_muteer_voorraad(uuid, uuid, text, numeric, text, text, bigint, bigint, date, integer, uuid, text, integer, bigint, uuid)',
        'public.voorraad_overboeken(uuid, integer, uuid, numeric, text, text, text)',
        'public.keuken_afwijking(uuid, integer, numeric, text, text, text)',
        'public.voorraad_invoer_boeken(uuid, uuid)',
        'public.productie_partij_afronden(uuid, uuid, bigint, numeric, text, numeric, text, jsonb, date, date, text, text, uuid, uuid, integer, bigint, uuid, integer, numeric, jsonb, text)'
    ]
    LOOP
        IF NOT has_function_privilege('authenticated', v_sig, 'EXECUTE') THEN
            v_fouten := v_fouten || E'\n  authenticated mist ' || v_sig;
        END IF;
        IF NOT has_function_privilege('service_role', v_sig, 'EXECUTE') THEN
            v_fouten := v_fouten || E'\n  service_role mist ' || v_sig;
        END IF;
    END LOOP;

    IF to_regprocedure(v_iis) IS NOT NULL THEN
        IF NOT has_function_privilege('authenticated', v_iis, 'EXECUTE') THEN
            v_fouten := v_fouten || E'\n  authenticated mist ' || v_iis;
        END IF;
        IF NOT has_function_privilege('service_role', v_iis, 'EXECUTE') THEN
            v_fouten := v_fouten || E'\n  service_role mist ' || v_iis;
        END IF;
    END IF;

    FOREACH v_sig IN ARRAY ARRAY[
        'public.winkel_plaats_order(uuid, text, text, text, uuid, text, text, text, jsonb, text, integer, integer, integer, jsonb, text, jsonb, text, integer, integer)',
        'public.winkel_start_betaalpoging(bigint)',
        'public.winkel_bevestig_betaling(bigint, text, integer, text)',
        'public.winkel_controleer_capaciteit(uuid, jsonb, bigint)',
        'public.winkel_regels_json(bigint)',
        'public.winkel_bezetting_moment(uuid, bigint)',
        'public.winkel_bezetting_voorraad(uuid, bigint)',
        'public.winkel_keuken_factor(text, text)',
        'public.partij_als_jsonb(uuid, boolean)'
    ]
    LOOP
        IF NOT has_function_privilege('service_role', v_sig, 'EXECUTE') THEN
            v_fouten := v_fouten || E'\n  service_role mist ' || v_sig;
        END IF;
        IF has_function_privilege('authenticated', v_sig, 'EXECUTE') THEN
            v_fouten := v_fouten || E'\n  authenticated mag nog ' || v_sig;
        END IF;
    END LOOP;

    IF v_fouten <> '' THEN
        RAISE EXCEPTION 'ba-s: zelfcontrole mislukt, er is niets veranderd:%', v_fouten;
    END IF;
END $$;


-- ── 6. Verificatie ──────────────────────────────────────────────────────────
--   supabase/checks/verify_anon_rechten.sql    alleen lezen; op live én dev
--   supabase/tests/functie_rechten.sql         alleen op dev: "GESLAAGD: …"
