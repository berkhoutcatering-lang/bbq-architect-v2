-- ═══════════════════════════════════════════════════════════════════════════
--  Rechtencheck BA-S en BA-S2 — wie mag welke functie uitvoeren?
--  Plan v5, stap 0.3 · Draaiboek: docs/ecosysteem/stap-0-supabase.md
--
--  ALLEEN LEZEN (één SELECT). Veilig op live en op dev, vóór en na de
--  migraties 20261003150000_winkel_functies_niet_voor_anon (BA-S) en
--  20261004120000_functies_niet_voor_anon_2 (BA-S2).
--
--  Vijf delen:
--    0 samenvatting     hoeveel functies anon mag uitvoeren
--    1 winkel/voorraad  elke winkel_%, voorraad_%, keuken_afwijking,
--                       productie_partij_afronden, partij_als_jsonb,
--                       increment_inventory_stock en private.vereis_org:
--                       anon / authenticated / service_role
--    2 standaardrechten pg_default_acl: wat krijgen NIEUWE functies?
--    3 triage           ALLE SECURITY DEFINER-functies in public die anon mag
--                       uitvoeren. Elke regel is een vraag: hoort dit publiek?
--    4 BA-S2            de 16 functies van BA-S2 met de verwachte rechten en,
--                       bij drie ervan, de org-check private.vereis_org
--
--  Vóór BA-S staat bij deel 1 "ja" onder anon (= LEK). Na BA-S overal "nee".
--  Vóór BA-S2 staat bij deel 4 "LEK"; na BA-S2 overal "OK", en blijven er in
--  deel 3 alleen triggerfuncties en de drie RLS-hulpfuncties over.
-- ═══════════════════════════════════════════════════════════════════════════

WITH fn AS (
    SELECT p.oid,
           n.nspname,
           p.proname,
           p.oid::regprocedure::text                 AS signatuur,
           p.proowner::regrole::text                 AS eigenaar,
           p.prosecdef                               AS definer,
           p.prorettype = 'trigger'::regtype         AS is_trigger,
           p.prosrc,
           has_function_privilege('anon',          p.oid, 'EXECUTE') AS anon,
           has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated,
           has_function_privilege('service_role',  p.oid, 'EXECUTE') AS service_role,
           (SELECT e.extname FROM pg_depend d JOIN pg_extension e ON e.oid = d.refobjid
             WHERE d.classid = 'pg_proc'::regclass AND d.objid = p.oid AND d.deptype = 'e' LIMIT 1) AS extensie
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname IN ('public', 'private')
       AND p.prokind IN ('f', 'p')
),
winkel AS (
    SELECT * FROM fn
     WHERE (nspname = 'public' AND (proname LIKE 'winkel\_%' OR proname LIKE 'voorraad\_%'
                                    OR proname IN ('keuken_afwijking', 'productie_partij_afronden', 'partij_als_jsonb', 'increment_inventory_stock')))
        OR (nspname = 'private' AND proname = 'vereis_org')
),
-- BA-S2: welke functie, voor wie (gebruikersclient = authenticated en
-- service_role; service = alleen service_role), en of de org-check erin hoort.
-- live_only: staat niet op main; op dev mag hij ontbreken.
ba_s2_lijst (sig, groep, org_check, live_only) AS (
    VALUES
        ('public.explode_event_to_inkooplijst(uuid, integer)',              'gebruikersclient', true,  false),
        ('public.find_cheaper_substitutes_same_cut(uuid, bigint, integer)', 'gebruikersclient', true,  false),
        ('public.get_latest_gerecht_cost_delta(uuid, uuid)',                'gebruikersclient', true,  false),
        ('public.get_market_pulse(uuid)',                                   'gebruikersclient', false, false),
        ('public.log_bon_action(bigint, text, text, jsonb)',                'gebruikersclient', false, false),
        ('public.unlock_bon(bigint)',                                       'gebruikersclient', false, false),
        ('public.voorstellen_verlopen_markeren()',                          'gebruikersclient', false, true),
        ('public.anonymize_old_floor_plan_guests()',                        'service',          false, false),
        ('public.increment_share_access(bigint)',                           'service',          false, false),
        ('public.refresh_gerecht_allergens_mv()',                           'service',          false, false),
        ('public.kds_cleanup_expired()',                                    'service',          false, false),
        ('public.backfill_ingredient_allergens()',                          'service',          false, false),
        ('public.current_role_in_org()',                                    'service',          false, true),
        ('public.current_venue_id()',                                       'service',          false, true),
        ('public.set_session_venue(uuid)',                                  'service',          false, true),
        ('public.decrement_stock(uuid, integer)',                           'service',          false, true)
),
ba_s2 AS (
    SELECT l.sig, l.groep, l.org_check, l.live_only, f.*,
           f.prosrc ~ 'private\.vereis_org\(p_org_id\)' AS heeft_org_check
      FROM ba_s2_lijst l
      LEFT JOIN fn f ON f.oid = to_regprocedure(l.sig)
),
-- RLS-hulpfuncties: policies roepen ze aan met de rechten van wie de query
-- doet (ook anon). Bewust buiten BA-S2 gehouden.
rls_hulp (proname) AS (
    VALUES ('user_org_ids'), ('is_member_with_role'), ('pi_bridge_org_id')
),
standaard AS (
    SELECT d.defaclrole::regrole::text AS rol,
           COALESCE(n.nspname, '(alle schema''s)') AS schema,
           d.defaclacl,
           EXISTS (SELECT 1 FROM aclexplode(d.defaclacl) a WHERE a.grantee = 'anon'::regrole          AND a.privilege_type = 'EXECUTE') AS anon,
           EXISTS (SELECT 1 FROM aclexplode(d.defaclacl) a WHERE a.grantee = 'authenticated'::regrole AND a.privilege_type = 'EXECUTE') AS authenticated,
           EXISTS (SELECT 1 FROM aclexplode(d.defaclacl) a WHERE a.grantee = 'service_role'::regrole  AND a.privilege_type = 'EXECUTE') AS service_role
      FROM pg_default_acl d
      LEFT JOIN pg_namespace n ON n.oid = d.defaclnamespace
     WHERE d.defaclobjtype = 'f'
       AND (d.defaclnamespace = 0 OR n.nspname = 'public')
),
-- Postgres geeft PUBLIC (dus ook anon) standaard EXECUTE op elke nieuwe
-- functie, tenzij een globale standaard (zonder schema) van die rol dat weghaalt.
public_standaard AS (
    SELECT r.rolname AS rol,
           NOT EXISTS (SELECT 1 FROM pg_default_acl d WHERE d.defaclrole = r.oid AND d.defaclnamespace = 0 AND d.defaclobjtype = 'f')
           OR EXISTS (SELECT 1 FROM pg_default_acl d, aclexplode(d.defaclacl) a
                       WHERE d.defaclrole = r.oid AND d.defaclnamespace = 0 AND d.defaclobjtype = 'f'
                         AND a.grantee = 0 AND a.privilege_type = 'EXECUTE') AS public_krijgt
      FROM pg_roles r
     WHERE r.rolname IN ('postgres', 'supabase_admin')
),
uitkomst AS (
    -- 0. Samenvatting
    SELECT 0 AS deel_nr, '0 samenvatting' AS deel, 1 AS volgorde,
           'winkel_/voorraad_-functies die anon mag uitvoeren' AS object,
           '' AS eigenaar, '' AS security_definer,
           (SELECT count(*) FROM winkel WHERE anon)::text AS anon, '' AS authenticated, '' AS service_role,
           CASE WHEN (SELECT count(*) FROM winkel WHERE anon) = 0 THEN 'OK' ELSE 'LEK: zie deel 1' END AS opmerking
    UNION ALL
    SELECT 0, '0 samenvatting', 2,
           'BA-S2-functies die anon mag uitvoeren',
           '', '', (SELECT count(*) FROM ba_s2 WHERE anon)::text, '', '',
           CASE WHEN (SELECT count(*) FROM ba_s2 WHERE anon) = 0 THEN 'OK' ELSE 'LEK: zie deel 4' END
    UNION ALL
    SELECT 0, '0 samenvatting', 3,
           'SECURITY DEFINER-functies in public die anon mag uitvoeren',
           '', '', (SELECT count(*) FROM fn WHERE nspname = 'public' AND definer AND anon)::text, '', '',
           'triagelijst: zie deel 3'
    UNION ALL
    SELECT 0, '0 samenvatting', 4,
           'waarvan geen triggerfunctie en geen RLS-hulpfunctie',
           '', '', (SELECT count(*) FROM fn
                     WHERE nspname = 'public' AND definer AND anon AND NOT is_trigger AND extensie IS NULL
                       AND proname NOT IN (SELECT proname FROM rls_hulp))::text, '', '',
           CASE WHEN (SELECT count(*) FROM fn
                       WHERE nspname = 'public' AND definer AND anon AND NOT is_trigger AND extensie IS NULL
                         AND proname NOT IN (SELECT proname FROM rls_hulp)) = 0
                THEN 'OK (na BA-S2)' ELSE 'beoordelen: zie deel 3' END
    UNION ALL
    SELECT 0, '0 samenvatting', 5,
           'alle functies in public die anon mag uitvoeren',
           '', '', (SELECT count(*) FROM fn WHERE nspname = 'public' AND anon)::text, '', '',
           'ter info; SECURITY INVOKER-functies lopen tegen RLS aan'

    -- 1. Winkel en voorraad
    UNION ALL
    SELECT 1, '1 winkel/voorraad', row_number() OVER (ORDER BY signatuur)::int,
           signatuur, eigenaar,
           CASE WHEN definer THEN 'ja' ELSE 'nee' END,
           CASE WHEN anon THEN 'ja' ELSE 'nee' END,
           CASE WHEN authenticated THEN 'ja' ELSE 'nee' END,
           CASE WHEN service_role THEN 'ja' ELSE 'nee' END,
           CASE WHEN anon AND is_trigger THEN 'triggerfunctie: niet los aan te roepen, wel intrekken (als eigenaar)'
                WHEN anon AND definer THEN 'LEK (SECURITY DEFINER, anon-sleutel volstaat)'
                WHEN anon THEN 'LEK (anon mag uitvoeren)'
                ELSE 'OK' END
      FROM winkel

    -- 2. Standaardrechten voor nieuwe functies
    UNION ALL
    SELECT 2, '2 standaardrechten', row_number() OVER (ORDER BY rol, schema)::int,
           'nieuwe functies in ' || schema, rol, '',
           CASE WHEN anon THEN 'ja' ELSE 'nee' END,
           CASE WHEN authenticated THEN 'ja' ELSE 'nee' END,
           CASE WHEN service_role THEN 'ja' ELSE 'nee' END,
           defaclacl::text
      FROM standaard
    UNION ALL
    SELECT 2, '2 standaardrechten', 100 + row_number() OVER (ORDER BY rol)::int,
           'PUBLIC krijgt EXECUTE op nieuwe functies (ingebouwd)', rol, '',
           CASE WHEN public_krijgt THEN 'ja (via PUBLIC)' ELSE 'nee' END, '', '',
           CASE WHEN public_krijgt
                THEN 'per functie REVOKE ALL … FROM PUBLIC, anon blijft nodig'
                ELSE 'globale standaard zonder PUBLIC' END
      FROM public_standaard

    -- 3. Triage: elke SECURITY DEFINER-functie in public die anon mag uitvoeren
    UNION ALL
    SELECT 3, '3 triage', row_number() OVER (ORDER BY signatuur)::int,
           signatuur, eigenaar, 'ja', 'ja',
           CASE WHEN authenticated THEN 'ja' ELSE 'nee' END,
           CASE WHEN service_role THEN 'ja' ELSE 'nee' END,
           CASE WHEN extensie IS NOT NULL THEN 'van extensie ' || extensie
                WHEN proname LIKE 'winkel\_%' OR proname LIKE 'voorraad\_%'
                     OR proname IN ('keuken_afwijking', 'productie_partij_afronden', 'partij_als_jsonb', 'increment_inventory_stock')
                THEN 'BA-S hoort dit te dichten'
                WHEN oid IN (SELECT b.oid FROM ba_s2 b WHERE b.oid IS NOT NULL)
                THEN 'BA-S2 hoort dit te dichten'
                WHEN is_trigger
                THEN 'triggerfunctie: niet los aan te roepen (geen lek)'
                WHEN proname IN (SELECT proname FROM rls_hulp)
                THEN 'RLS-hulpfunctie: bewust open (policies draaien als anon), aparte fix'
                ELSE 'beoordelen: hoort dit publiek?' END
      FROM fn
     WHERE nspname = 'public' AND definer AND anon

    -- 4. BA-S2: verwachte rechten en de org-check
    UNION ALL
    SELECT 4, '4 BA-S2', row_number() OVER (ORDER BY groep, sig)::int,
           COALESCE(signatuur, sig) || ' [' || groep || ']',
           COALESCE(eigenaar, ''),
           CASE WHEN oid IS NULL THEN '' WHEN definer THEN 'ja' ELSE 'nee' END,
           CASE WHEN oid IS NULL THEN '' WHEN anon THEN 'ja' ELSE 'nee' END,
           CASE WHEN oid IS NULL THEN '' WHEN authenticated THEN 'ja' ELSE 'nee' END,
           CASE WHEN oid IS NULL THEN '' WHEN service_role THEN 'ja' ELSE 'nee' END,
           CASE WHEN oid IS NULL AND live_only THEN 'bestaat niet (alleen op live); OK'
                WHEN oid IS NULL THEN 'ONTBREEKT'
                WHEN anon THEN 'LEK (SECURITY DEFINER, anon-sleutel volstaat)'
                WHEN NOT service_role THEN 'FOUT: service_role mist'
                WHEN groep = 'gebruikersclient' AND NOT authenticated THEN 'FOUT: authenticated mist (BA roept hem aan)'
                WHEN groep = 'service' AND authenticated THEN 'authenticated mag nog (hoort alleen service_role)'
                WHEN org_check AND NOT heeft_org_check THEN 'org-check private.vereis_org ontbreekt'
                WHEN org_check THEN 'OK, met org-check'
                ELSE 'OK' END
      FROM ba_s2
)
SELECT deel, object, eigenaar, security_definer, anon, authenticated, service_role, opmerking
  FROM uitkomst
 ORDER BY deel_nr, volgorde;
