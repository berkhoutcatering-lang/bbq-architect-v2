-- ════════════════════════════════════════════════════════════════════════════
--  BA-S2 — de overige SECURITY DEFINER-functies niet meer voor anon
--  Plan v5, vervolg op BA-S (20261003150000, live sinds 3 oktober)
--  Test: supabase/tests/functie_rechten.sql (alleen op de dev-database)
--  Rechtencheck: supabase/checks/verify_anon_rechten.sql (live en dev)
--  Noodherstel: supabase/checks/herstel_ba_s2.sql
-- ════════════════════════════════════════════════════════════════════════════
--
--  Uitgangspunt
--    De live-stand van 4 oktober: na BA-S mag anon (de publieke sleutel) nog
--    36 SECURITY DEFINER-functies in public uitvoeren. Zo verdeeld:
--    - 17 triggerfuncties: niet los aan te roepen ("trigger functions can only
--      be called as triggers"). Niet aangeraakt.
--    - 3 RLS-hulpfuncties: user_org_ids(), is_member_with_role(uuid, text) en
--      pi_bridge_org_id(). Niet aangeraakt: een policy roept ze aan met de
--      rechten van wie de query doet, ook anon. Intrekken kan policies (ook op
--      storage.objects) laten falen met "permission denied for function" in
--      plaats van 0 rijen. Eerst een policy-inventaris; aparte fix.
--    - 16 functies: deze migratie.
--
--  Wat er gebeurt
--    1. REVOKE ALL … FROM PUBLIC, anon op alle 16, en per functie een
--       expliciete grant voor wie hem nodig heeft. Per functie staat de
--       aanroeper erbij (nagelopen op deze branch, main en feat/catalogus).
--    2. Drie functies met p_org_id en zonder lidmaatschapscheck gaven aan
--       iedereen gegevens van elke organisatie: inkooplijst per event,
--       goedkopere alternatieven met leveranciersprijzen, kostprijsverloop per
--       gerecht. Die krijgen private.vereis_org(p_org_id) als eerste regel. De
--       rest van de definitie is letterlijk die van live (4 oktober);
--       SECURITY DEFINER, search_path, STABLE en het returntype blijven.
--       Live en repo (20260601100000) zijn semantisch gelijk; live is een
--       compacte versie zonder commentaar.
--       get_market_pulse controleert het lidmaatschap al zelf: alleen rechten.
--    3. Zelfcontrole: klopt het niet, dan draait de hele migratie terug.
--
--  ALTER DEFAULT PRIVILEGES is niet opnieuw nodig: BA-S (stap 4) haalde anon
--  al uit de standaardrechten van postgres in public. PUBLIC krijgt nog wel
--  EXECUTE op elke nieuwe functie; daarom blijft per functie
--  `REVOKE ALL … FROM PUBLIC, anon` nodig.
--
--  Gevolgen voor de app: geen. Elke .rpc() hieronder loopt via de
--  gebruikersclient (authenticated) of de service-client. De drie functies
--  met de org-check krijgen van BA altijd de eigen organisatie van de
--  ingelogde gebruiker (requireOrgId / organization_members).
--
--  Terugdraaien voor één functie (nooit naar anon):
--    GRANT EXECUTE ON FUNCTION public.<functie>(<argumenttypes>) TO authenticated;


-- ── 0. Pre-flight ───────────────────────────────────────────────────────────
DO $$
DECLARE
    v_sig       TEXT;
    v_ontbreekt TEXT := '';
    v_lijst     TEXT;
BEGIN
    IF to_regprocedure('private.vereis_org(uuid)') IS NULL THEN
        RAISE EXCEPTION 'ba-s2: private.vereis_org(uuid) ontbreekt; eerst BA-S (20261003150000)';
    END IF;
    IF (SELECT count(*) FROM pg_roles WHERE rolname IN ('anon', 'authenticated', 'service_role')) <> 3 THEN
        RAISE EXCEPTION 'ba-s2: de Supabase-rollen anon, authenticated en service_role ontbreken';
    END IF;

    -- Uit de repo-migraties: moeten er zijn.
    FOREACH v_sig IN ARRAY ARRAY[
        'public.explode_event_to_inkooplijst(uuid, integer)',
        'public.find_cheaper_substitutes_same_cut(uuid, bigint, integer)',
        'public.get_latest_gerecht_cost_delta(uuid, uuid)',
        'public.get_market_pulse(uuid)',
        'public.log_bon_action(bigint, text, text, jsonb)',
        'public.unlock_bon(bigint)',
        'public.anonymize_old_floor_plan_guests()',
        'public.increment_share_access(bigint)',
        'public.refresh_gerecht_allergens_mv()',
        'public.kds_cleanup_expired()',
        'public.backfill_ingredient_allergens()'
    ]
    LOOP
        IF to_regprocedure(v_sig) IS NULL THEN
            v_ontbreekt := v_ontbreekt || E'\n  ' || v_sig;
        END IF;
    END LOOP;
    IF v_ontbreekt <> '' THEN
        RAISE EXCEPTION 'ba-s2: deze functies ontbreken (eerst supabase/checks/verify_anon_rechten.sql draaien):%', v_ontbreekt;
    END IF;

    -- Alleen op live (geen bron op main): overslaan als ze er niet zijn.
    FOREACH v_sig IN ARRAY ARRAY[
        'public.voorstellen_verlopen_markeren()',
        'public.current_role_in_org()',
        'public.current_venue_id()',
        'public.set_session_venue(uuid)',
        'public.decrement_stock(uuid, integer)'
    ]
    LOOP
        IF to_regprocedure(v_sig) IS NULL THEN
            RAISE NOTICE 'ba-s2: % bestaat niet; overgeslagen', v_sig;
        END IF;
    END LOOP;

    -- De drie definities worden vervangen. Alleen als ze nog zijn wat we
    -- kennen: md5 van de body op live (4 okt), in de repo (20260601100000) of
    -- na deze migratie (opnieuw draaien). Anders is er iets veranderd dat we
    -- niet zouden willen overschrijven.
    SELECT string_agg(k.sig || ' (md5 ' || md5(p.prosrc) || ')', ', ')
      INTO v_lijst
      FROM (VALUES
          ('public.explode_event_to_inkooplijst(uuid, integer)',
           ARRAY['54f24c0c13e93ac3b55dd06b56968f2c', '8db48b387d03be3f11de35f2a10687af', '32d9d08d14fd04671c46ee6e29140b6e']),
          ('public.find_cheaper_substitutes_same_cut(uuid, bigint, integer)',
           ARRAY['b1c21c50a6a3188c2e16959a5350ea00', '84baae91f741bb91122af2f16320df56', 'cf8d31ca68d01ac7947486f10b320740']),
          ('public.get_latest_gerecht_cost_delta(uuid, uuid)',
           ARRAY['7d6fabfbd06c8e5fa6d9af1a6103db85', 'fb0c252199e504395dbcbed872d5111f', '487c71a8eaea417139e961090dcc966c'])
      ) AS k(sig, bekend)
      JOIN pg_proc p ON p.oid = to_regprocedure(k.sig)
     WHERE md5(p.prosrc) <> ALL (k.bekend);
    IF v_lijst IS NOT NULL THEN
        RAISE EXCEPTION 'ba-s2: definitie wijkt af van live (4 okt) en van de repo; eerst opnieuw vergelijken: %', v_lijst;
    END IF;

    -- Wie gebruikt deze functies nog, buiten de app om? Een policy, view,
    -- standaardwaarde of check-constraint draait met de rechten van wie de
    -- query doet; een functie die SECURITY INVOKER is (of een andere
    -- eigenaar heeft) ook. Die zouden na de REVOKE "permission denied"
    -- geven. Op 4 oktober was er niets; staat er nu iets, dan eerst kijken.
    WITH doel AS (
        SELECT p.oid, p.proname, p.proowner
          FROM unnest(ARRAY[
              'public.explode_event_to_inkooplijst(uuid, integer)',
              'public.find_cheaper_substitutes_same_cut(uuid, bigint, integer)',
              'public.get_latest_gerecht_cost_delta(uuid, uuid)',
              'public.get_market_pulse(uuid)',
              'public.log_bon_action(bigint, text, text, jsonb)',
              'public.unlock_bon(bigint)',
              'public.voorstellen_verlopen_markeren()',
              'public.anonymize_old_floor_plan_guests()',
              'public.increment_share_access(bigint)',
              'public.refresh_gerecht_allergens_mv()',
              'public.kds_cleanup_expired()',
              'public.backfill_ingredient_allergens()',
              'public.current_role_in_org()',
              'public.current_venue_id()',
              'public.set_session_venue(uuid)',
              'public.decrement_stock(uuid, integer)'
          ]) AS s
          JOIN pg_proc p ON p.oid = to_regprocedure(s)
    ),
    afhankelijk AS (
        SELECT pg_describe_object(d.classid, d.objid, d.objsubid) || ' → ' || t.oid::regprocedure::text AS wat
          FROM pg_depend d
          JOIN doel t ON d.refclassid = 'pg_proc'::regclass AND d.refobjid = t.oid
         WHERE d.classid IN ('pg_policy'::regclass, 'pg_attrdef'::regclass, 'pg_rewrite'::regclass, 'pg_constraint'::regclass)
    ),
    aanroeper AS (
        SELECT 'functie ' || f.oid::regprocedure::text || ' → ' || t.oid::regprocedure::text AS wat
          FROM pg_proc f
          JOIN pg_namespace fn ON fn.oid = f.pronamespace
          JOIN doel t ON t.oid <> f.oid
         WHERE fn.nspname NOT IN ('pg_catalog', 'information_schema')
           AND (f.prosrc ~ ('\m' || t.proname || '\M')
                OR EXISTS (SELECT 1 FROM pg_depend d
                            WHERE d.classid = 'pg_proc'::regclass AND d.objid = f.oid
                              AND d.refclassid = 'pg_proc'::regclass AND d.refobjid = t.oid))
           AND (NOT f.prosecdef
                OR (f.proowner <> t.proowner
                    AND NOT COALESCE((SELECT r.rolsuper FROM pg_roles r WHERE r.oid = f.proowner), false)))
    )
    SELECT string_agg(wat, E'\n  ' ORDER BY wat)
      INTO v_lijst
      FROM (SELECT wat FROM afhankelijk UNION ALL SELECT wat FROM aanroeper) x;
    IF v_lijst IS NOT NULL THEN
        RAISE EXCEPTION 'ba-s2: deze objecten gebruiken een functie die dichtgaat; eerst beoordelen:%', E'\n  ' || v_lijst;
    END IF;
END $$;


-- ── 1. Gebruikersclient: authenticated en service_role ─────────────────────
-- src/app/price-intelligence/_actions/index.ts:342 (generateInkooplijstFromEvent;
-- createServerSupabase, p_org_id uit requireOrgId). Org-check: stap 3.
REVOKE ALL ON FUNCTION public.explode_event_to_inkooplijst(UUID, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.explode_event_to_inkooplijst(UUID, INTEGER) TO authenticated, service_role;
-- src/app/price-intelligence/_actions/index.ts:152 (suggestSubstitutions, via
-- src/app/gerechten/_components/SubstitutionDrawer.tsx). Org-check: stap 3.
REVOKE ALL ON FUNCTION public.find_cheaper_substitutes_same_cut(UUID, BIGINT, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.find_cheaper_substitutes_same_cut(UUID, BIGINT, INTEGER) TO authenticated, service_role;
-- src/app/gerechten/_components/LiveCostHeader.tsx:40 (createServerSupabase;
-- orgId uit src/app/gerechten/[id]/page.tsx:48). Org-check: stap 3.
REVOKE ALL ON FUNCTION public.get_latest_gerecht_cost_delta(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_latest_gerecht_cost_delta(UUID, UUID) TO authenticated, service_role;
-- src/app/financien/_components/MarktPulseWidget.tsx:50 en 68 (browserclient).
-- Controleert zelf het lidmaatschap; definitie blijft.
REVOKE ALL ON FUNCTION public.get_market_pulse(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_market_pulse(UUID) TO authenticated, service_role;
-- src/lib/dal/bonnen.ts:372 (logBonAction), via src/app/archief/actions.ts
-- (gebruikersclient) en src/app/api/archief/bulk-export/route.ts:156 (service).
REVOKE ALL ON FUNCTION public.log_bon_action(BIGINT, TEXT, TEXT, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.log_bon_action(BIGINT, TEXT, TEXT, JSONB) TO authenticated, service_role;
-- src/lib/dal/bonnen.ts:321 (unlockBon), via src/app/archief/actions.ts:68
-- (gebruikersclient). Controleert zelf de Admin-rol.
REVOKE ALL ON FUNCTION public.unlock_bon(BIGINT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.unlock_bon(BIGINT) TO authenticated, service_role;
-- Niet op main of feat/catalogus, wel op feat/kennisbank-en-keuken:
-- src/app/voorstellen/actions.ts:107, 128 en 159 (createServerSupabase).
-- Migratie 20260831180000 staat op live. Alleen als hij bestaat.
DO $$
BEGIN
    IF to_regprocedure('public.voorstellen_verlopen_markeren()') IS NOT NULL THEN
        EXECUTE 'REVOKE ALL ON FUNCTION public.voorstellen_verlopen_markeren() FROM PUBLIC, anon';
        EXECUTE 'GRANT EXECUTE ON FUNCTION public.voorstellen_verlopen_markeren() TO authenticated, service_role';
    END IF;
END $$;


-- ── 2. Alleen de service-client of geen aanroeper: alleen service_role ─────
-- src/app/api/cron/anonymize-floor-plan-guests/route.ts:26 (createServiceSupabase;
-- Vercel-cron dagelijks 03:00 UTC)
REVOKE ALL ON FUNCTION public.anonymize_old_floor_plan_guests() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.anonymize_old_floor_plan_guests() TO service_role;
-- src/lib/archief/shareTokens.ts:139 (recordShareAccess), via
-- src/app/share/[token]/page.tsx:70 (service-client). De grant aan anon uit
-- 20260525137000 was nooit nodig.
REVOKE ALL ON FUNCTION public.increment_share_access(BIGINT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.increment_share_access(BIGINT) TO service_role;
-- Geen .rpc(): alleen binnen trigger_refresh_gerecht_allergens (SECURITY
-- DEFINER, draait als eigenaar).
REVOKE ALL ON FUNCTION public.refresh_gerecht_allergens_mv() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_gerecht_allergens_mv() TO service_role;
-- Geen aanroeper: geen cron-route en geen pg_cron. Lijkt dode code (bedoeld
-- voor een opruimcron die nooit is ingepland).
REVOKE ALL ON FUNCTION public.kds_cleanup_expired() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.kds_cleanup_expired() TO service_role;
-- Geen aanroeper: eenmalige backfill uit 20260516180000. Dode code na gebruik.
REVOKE ALL ON FUNCTION public.backfill_ingredient_allergens() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.backfill_ingredient_allergens() TO service_role;
-- Geen aanroeper en geen bron in git: de oude kassa (pos_menu_items, venues).
-- current_role_in_org, current_venue_id, set_session_venue en decrement_stock
-- lijken dode code. Alleen als ze bestaan.
DO $$
DECLARE
    v_sig TEXT;
BEGIN
    FOREACH v_sig IN ARRAY ARRAY[
        'public.current_role_in_org()',
        'public.current_venue_id()',
        'public.set_session_venue(uuid)',
        'public.decrement_stock(uuid, integer)'
    ]
    LOOP
        IF to_regprocedure(v_sig) IS NOT NULL THEN
            EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', to_regprocedure(v_sig));
            EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', to_regprocedure(v_sig));
        END IF;
    END LOOP;
END $$;


-- ── 3. Org-check in de drie functies met p_org_id ──────────────────────────
-- Letterlijk de live-definitie (pg_get_functiondef, 4 oktober) met als eerste
-- regel de org-check. In de SQL-functies is dat een SELECT (PERFORM bestaat
-- daar niet); het resultaat van die eerste regel wordt weggegooid.
CREATE OR REPLACE FUNCTION public.explode_event_to_inkooplijst(p_org_id uuid, p_event_id integer)
 RETURNS TABLE(leverancier_id integer, leverancier_naam text, master_product_id bigint, product_naam text, qty_total numeric, unit text, prijs_per_eenheid numeric, btw_pct numeric, regel_totaal_excl numeric, source_gerecht_ids uuid[])
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
    v_guests integer; v_menu jsonb;
begin
    perform private.vereis_org(p_org_id);
    select coalesce(guests, 0), coalesce(menu, '[]'::jsonb)
      into v_guests, v_menu
      from public.events
     where id = p_event_id and organization_id = p_org_id;
    if v_guests is null or v_guests = 0 then return; end if;
    return query
    with menu_items as (
        select (m->>'gerecht_id')::uuid as gerecht_id,
               coalesce((m->>'qty_per_guest')::numeric, 1) as qty_per_guest
          from jsonb_array_elements(v_menu) as m
         where (m ? 'gerecht_id')
    ),
    bom as (
        select gc.gerecht_id,
               ci.inventory_id, ci.fallback_name,
               (ci.quantity * gc.quantity_used
                / nullif(c.base_quantity, 0)
                / nullif(coalesce(g.porties, 10), 0)
                * v_guests * coalesce(mi.qty_per_guest, 1)) as qty_needed,
               ci.unit, c.supplier_product_id as cmp_supplier_product_id
          from menu_items mi
          join public.gerecht_components gc on gc.gerecht_id = mi.gerecht_id
          join public.components c on c.id = gc.component_id
          join public.component_ingredients ci on ci.component_id = c.id
          left join public.gerechten g on g.id = mi.gerecht_id
    ),
    matched as (
        select b.*,
               mp.id as mp_id, mp.naam as mp_naam,
               -- supplier_prices.leverancier is text, geen FK — match via lower(naam)
               sp.leverancier as sup_naam_text,
               sp.prijs_per_kg, sp.prijs_per_stuk, sp.prijs, sp.eenheid as sup_eenheid,
               l.id as resolved_sup_id, l.naam as resolved_sup_naam
          from bom b
          left join public.master_products mp
                 on mp.id = b.cmp_supplier_product_id and mp.organization_id = p_org_id
          left join lateral (
              select sp.* from public.supplier_prices sp
               where sp.master_product_id = mp.id
                 and sp.organization_id   = p_org_id
                 and sp.actief = true
               order by sp.created_at desc limit 1
          ) sp on true
          left join public.leveranciers l
                on l.organization_id = p_org_id
               and lower(l.naam) = lower(sp.leverancier)
               and l.archived_at is null
    )
    select m.resolved_sup_id::integer as leverancier_id,
           coalesce(m.resolved_sup_naam, m.sup_naam_text, 'Onbekend')::text as leverancier_naam,
           m.mp_id, coalesce(m.mp_naam, m.fallback_name, 'Onbekend product')::text,
           round(sum(m.qty_needed)::numeric, 3) as qty_total,
           coalesce(m.unit, m.sup_eenheid, 'stuks')::text,
           coalesce(m.prijs_per_kg, m.prijs_per_stuk, m.prijs, 0)::numeric,
           9::numeric,
           round(sum(m.qty_needed * coalesce(m.prijs_per_kg, m.prijs_per_stuk, m.prijs, 0))::numeric, 2),
           array_agg(distinct m.gerecht_id)
      from matched m
     group by m.resolved_sup_id, m.resolved_sup_naam, m.sup_naam_text,
              m.mp_id, m.mp_naam, m.fallback_name,
              m.unit, m.sup_eenheid, m.prijs_per_kg, m.prijs_per_stuk, m.prijs
     order by leverancier_naam, m.mp_naam;
end;
$function$;

CREATE OR REPLACE FUNCTION public.find_cheaper_substitutes_same_cut(p_org_id uuid, p_master_product_id bigint, p_limit integer DEFAULT 3)
 RETURNS TABLE(candidate_id bigint, candidate_naam text, leverancier text, prijs_per_kg numeric, savings_pct numeric, cut_groep text, soort text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
    select private.vereis_org(p_org_id);
    with current_product as (
        select mp.id, mp.categorie, mp.naam, ali.cut_taxonomy_id
          from public.master_products mp
          left join lateral (
              select cut_taxonomy_id
                from public.org_product_aliases
               where organization_id = p_org_id
                 and master_product_id = mp.id
                 and cut_taxonomy_id is not null
               order by confidence desc limit 1
          ) ali on true
         where mp.id = p_master_product_id
           and mp.organization_id = p_org_id
    ),
    current_price as (
        select avg(prijs_per_kg) as p
          from public.supplier_prices
         where master_product_id = p_master_product_id
           and organization_id   = p_org_id
           and prijs_per_kg      is not null
           and actief            = true
    ),
    candidates as (
        select distinct on (mp.id)
               mp.id, mp.naam, sp.leverancier, sp.prijs_per_kg,
               t.cut_groep, t.soort, cp.p as cur_price
          from current_product cur
          join public.org_product_aliases ali2
                on ali2.organization_id = p_org_id
               and ali2.cut_taxonomy_id  = cur.cut_taxonomy_id
          join public.master_products mp
                on mp.id              = ali2.master_product_id
               and mp.organization_id = p_org_id
               and mp.id              <> cur.id
               and mp.uit_assortiment is not true
          join public.supplier_prices sp
                on sp.master_product_id = mp.id
               and sp.organization_id   = p_org_id
               and sp.actief            = true
               and sp.prijs_per_kg      is not null
          join public.meat_taxonomy t on t.id = cur.cut_taxonomy_id
          cross join current_price cp
         where cp.p is not null and sp.prijs_per_kg < cp.p
         order by mp.id, sp.prijs_per_kg asc
    )
    select id, naam, leverancier, prijs_per_kg,
           round(((cur_price - prijs_per_kg) / cur_price) * 100, 1) as savings_pct,
           cut_groep, soort
      from candidates
     order by prijs_per_kg asc
     limit p_limit;
$function$;

CREATE OR REPLACE FUNCTION public.get_latest_gerecht_cost_delta(p_org_id uuid, p_gerecht_id uuid)
 RETURNS TABLE(kost_now_cents integer, kost_7d_cents integer, delta_7d_pct numeric, last_change_at timestamp with time zone, sparkline_30d jsonb)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
    select private.vereis_org(p_org_id);
    with snaps as (
        select kostprijs_cents, computed_at
          from public.recipe_cost_snapshots
         where organization_id = p_org_id and gerecht_id = p_gerecht_id
         order by computed_at desc
    ),
    latest as (select kostprijs_cents, computed_at from snaps limit 1),
    week_old as (
        select kostprijs_cents from snaps
         where computed_at <= now() - interval '7 days'
         order by computed_at desc limit 1
    ),
    spark as (
        select jsonb_agg(jsonb_build_object('day', day_bucket, 'kost_cents', kost_cents) order by day_bucket) as data
          from (
              select date_trunc('day', computed_at)::date as day_bucket,
                     last_value(kostprijs_cents) over (
                         partition by date_trunc('day', computed_at)
                         order by computed_at asc
                         rows between unbounded preceding and unbounded following
                     ) as kost_cents
                from public.recipe_cost_snapshots
               where organization_id = p_org_id
                 and gerecht_id = p_gerecht_id
                 and computed_at >= now() - interval '30 days'
          ) d
    )
    select l.kostprijs_cents, w.kostprijs_cents,
           case when w.kostprijs_cents is null or w.kostprijs_cents = 0 then null
                else round(((l.kostprijs_cents - w.kostprijs_cents)::numeric / w.kostprijs_cents) * 100, 1)
           end as delta_7d_pct,
           l.computed_at, coalesce(s.data, '[]'::jsonb)
      from latest l
      left join week_old w on true
      left join spark s on true;
$function$;


-- ── 4. Zelfcontrole ─────────────────────────────────────────────────────────
-- Een REVOKE door iemand die geen eigenaar is geeft alleen een WARNING. Daarom
-- hier hard controleren; klopt iets niet, dan draait de hele migratie terug.
DO $$
DECLARE
    v_sig    TEXT;
    v_lijst  TEXT;
    v_n      INT := 0;
    v_fouten TEXT := '';
    r        RECORD;
BEGIN
    -- (a) anon (ook via PUBLIC) mag geen van de behandelde functies uitvoeren.
    SELECT string_agg(s, ', ')
      INTO v_lijst
      FROM unnest(ARRAY[
          'public.explode_event_to_inkooplijst(uuid, integer)',
          'public.find_cheaper_substitutes_same_cut(uuid, bigint, integer)',
          'public.get_latest_gerecht_cost_delta(uuid, uuid)',
          'public.get_market_pulse(uuid)',
          'public.log_bon_action(bigint, text, text, jsonb)',
          'public.unlock_bon(bigint)',
          'public.voorstellen_verlopen_markeren()',
          'public.anonymize_old_floor_plan_guests()',
          'public.increment_share_access(bigint)',
          'public.refresh_gerecht_allergens_mv()',
          'public.kds_cleanup_expired()',
          'public.backfill_ingredient_allergens()',
          'public.current_role_in_org()',
          'public.current_venue_id()',
          'public.set_session_venue(uuid)',
          'public.decrement_stock(uuid, integer)'
      ]) AS s
     WHERE to_regprocedure(s) IS NOT NULL
       AND has_function_privilege('anon', s, 'EXECUTE');
    IF v_lijst IS NOT NULL THEN
        v_fouten := v_fouten || E'\n  anon mag nog: ' || v_lijst;
    END IF;

    -- (b) De grants. Gebruikersclient: authenticated én service_role.
    FOREACH v_sig IN ARRAY ARRAY[
        'public.explode_event_to_inkooplijst(uuid, integer)',
        'public.find_cheaper_substitutes_same_cut(uuid, bigint, integer)',
        'public.get_latest_gerecht_cost_delta(uuid, uuid)',
        'public.get_market_pulse(uuid)',
        'public.log_bon_action(bigint, text, text, jsonb)',
        'public.unlock_bon(bigint)',
        'public.voorstellen_verlopen_markeren()'
    ]
    LOOP
        CONTINUE WHEN to_regprocedure(v_sig) IS NULL;
        IF NOT has_function_privilege('authenticated', v_sig, 'EXECUTE') THEN
            v_fouten := v_fouten || E'\n  authenticated mist ' || v_sig;
        END IF;
        IF NOT has_function_privilege('service_role', v_sig, 'EXECUTE') THEN
            v_fouten := v_fouten || E'\n  service_role mist ' || v_sig;
        END IF;
    END LOOP;

    -- Alleen service_role: service_role ja, authenticated nee.
    FOREACH v_sig IN ARRAY ARRAY[
        'public.anonymize_old_floor_plan_guests()',
        'public.increment_share_access(bigint)',
        'public.refresh_gerecht_allergens_mv()',
        'public.kds_cleanup_expired()',
        'public.backfill_ingredient_allergens()',
        'public.current_role_in_org()',
        'public.current_venue_id()',
        'public.set_session_venue(uuid)',
        'public.decrement_stock(uuid, integer)'
    ]
    LOOP
        CONTINUE WHEN to_regprocedure(v_sig) IS NULL;
        IF NOT has_function_privilege('service_role', v_sig, 'EXECUTE') THEN
            v_fouten := v_fouten || E'\n  service_role mist ' || v_sig;
        END IF;
        IF has_function_privilege('authenticated', v_sig, 'EXECUTE') THEN
            v_fouten := v_fouten || E'\n  authenticated mag nog ' || v_sig;
        END IF;
    END LOOP;

    -- (c) De org-check staat als eerste regel in de drie functies, en
    --     SECURITY DEFINER, search_path, STABLE en het returntype zijn gebleven.
    FOR r IN
        SELECT k.sig, k.taal, k.resultaat,
               p.prosrc, p.prosecdef, p.proconfig, p.provolatile, l.lanname,
               pg_get_function_result(p.oid) AS res
          FROM (VALUES
              ('public.explode_event_to_inkooplijst(uuid, integer)', 'plpgsql',
               'TABLE(leverancier_id integer, leverancier_naam text, master_product_id bigint, product_naam text, qty_total numeric, unit text, prijs_per_eenheid numeric, btw_pct numeric, regel_totaal_excl numeric, source_gerecht_ids uuid[])'),
              ('public.find_cheaper_substitutes_same_cut(uuid, bigint, integer)', 'sql',
               'TABLE(candidate_id bigint, candidate_naam text, leverancier text, prijs_per_kg numeric, savings_pct numeric, cut_groep text, soort text)'),
              ('public.get_latest_gerecht_cost_delta(uuid, uuid)', 'sql',
               'TABLE(kost_now_cents integer, kost_7d_cents integer, delta_7d_pct numeric, last_change_at timestamp with time zone, sparkline_30d jsonb)')
          ) AS k(sig, taal, resultaat)
          JOIN pg_proc p ON p.oid = to_regprocedure(k.sig)
          JOIN pg_language l ON l.oid = p.prolang
    LOOP
        v_n := v_n + 1;
        IF r.lanname <> r.taal THEN
            v_fouten := v_fouten || E'\n  ' || r.sig || ' is geen ' || r.taal || ' meer';
        ELSIF r.taal = 'sql' AND r.prosrc !~ '^\s*select private\.vereis_org\(p_org_id\);' THEN
            v_fouten := v_fouten || E'\n  ' || r.sig || ' begint niet met de org-check';
        ELSIF r.taal = 'plpgsql' AND r.prosrc !~ '\mbegin\s+perform private\.vereis_org\(p_org_id\);' THEN
            v_fouten := v_fouten || E'\n  ' || r.sig || ' begint niet met de org-check';
        END IF;
        IF NOT r.prosecdef THEN
            v_fouten := v_fouten || E'\n  ' || r.sig || ' is geen SECURITY DEFINER meer';
        END IF;
        IF r.proconfig IS DISTINCT FROM ARRAY['search_path=public, pg_temp']::TEXT[] THEN
            v_fouten := v_fouten || E'\n  ' || r.sig || ' heeft een ander search_path: ' || COALESCE(r.proconfig::TEXT, 'geen');
        END IF;
        IF r.provolatile <> 's' THEN
            v_fouten := v_fouten || E'\n  ' || r.sig || ' is niet meer STABLE';
        END IF;
        IF r.res <> r.resultaat THEN
            v_fouten := v_fouten || E'\n  ' || r.sig || ' heeft een ander returntype: ' || r.res;
        END IF;
    END LOOP;
    IF v_n <> 3 THEN
        v_fouten := v_fouten || E'\n  maar ' || v_n || ' van de 3 functies met de org-check gevonden';
    END IF;

    IF has_function_privilege('anon', 'private.vereis_org(uuid)', 'EXECUTE') THEN
        v_fouten := v_fouten || E'\n  anon mag private.vereis_org';
    END IF;

    -- Ter info: wat anon daarna nog mag, buiten triggerfuncties en de drie
    -- RLS-hulpfuncties. Op 4 oktober niets; iets nieuws hoort in de triage.
    SELECT string_agg(p.oid::REGPROCEDURE::TEXT, ', ' ORDER BY p.oid::REGPROCEDURE::TEXT)
      INTO v_lijst
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.prosecdef
       AND p.prorettype <> 'trigger'::REGTYPE
       AND p.proname NOT IN ('user_org_ids', 'is_member_with_role', 'pi_bridge_org_id')
       AND NOT EXISTS (SELECT 1 FROM pg_depend d
                        WHERE d.classid = 'pg_proc'::REGCLASS AND d.objid = p.oid AND d.deptype = 'e')
       AND has_function_privilege('anon', p.oid, 'EXECUTE');
    IF v_lijst IS NOT NULL THEN
        RAISE WARNING 'ba-s2: anon mag nog deze SECURITY DEFINER-functies (nieuw sinds 4 okt? zie verify_anon_rechten.sql deel 3): %', v_lijst;
    END IF;

    IF v_fouten <> '' THEN
        RAISE EXCEPTION 'ba-s2: zelfcontrole mislukt, er is niets veranderd:%', v_fouten;
    END IF;
END $$;


-- ── 5. Verificatie ──────────────────────────────────────────────────────────
--   supabase/checks/verify_anon_rechten.sql    alleen lezen; op live én dev
--   supabase/tests/functie_rechten.sql         alleen op dev: "GESLAAGD: …"
