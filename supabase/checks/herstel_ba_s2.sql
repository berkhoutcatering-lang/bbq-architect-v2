-- ════════════════════════════════════════════════════════════════════════════
--  HERSTEL BA-S2 — alleen voor noodgevallen
--  Draait 20261004120000_functies_niet_voor_anon_2 helemaal terug.
-- ════════════════════════════════════════════════════════════════════════════
--
--  Zet de EXECUTE-rechten en de drie functiedefinities terug zoals ze op
--  4 oktober 2026 op live stonden, vóór BA-S2 (bron: de live-stand die BA-S2
--  heeft vastgelegd: eigenaar, grants en pg_get_functiondef per functie).
--
--  LET OP: dit opent het lek weer. Daarna mag de publieke anon-sleutel weer
--  16 functies uitvoeren, waaronder drie die gegevens van elke organisatie
--  teruggeven (inkooplijst per event, leveranciersprijzen, kostprijsverloop).
--
--  Liever eerst dit: is er maar één functie stuk, geef dan alleen die terug
--  aan authenticated, nooit aan anon:
--    GRANT EXECUTE ON FUNCTION public.<functie>(<argumenttypes>) TO authenticated;
--  En als alleen de org-check in de weg zit: herstel alleen die ene
--  definitie uit stap 1 hieronder.
--
--  Draaien: alleen met go, als geheel (één transactie). Daarna laat
--  supabase/checks/verify_anon_rechten.sql bij deel 4 weer "LEK" zien.
--  BA-S2 kan daarna gewoon opnieuw: de pre-flight herkent deze definities.
--  BA-S en private.vereis_org blijven staan.

BEGIN;

-- ── 1. De drie definities zonder org-check (letterlijk live, 4 oktober) ─────
CREATE OR REPLACE FUNCTION public.explode_event_to_inkooplijst(p_org_id uuid, p_event_id integer)
 RETURNS TABLE(leverancier_id integer, leverancier_naam text, master_product_id bigint, product_naam text, qty_total numeric, unit text, prijs_per_eenheid numeric, btw_pct numeric, regel_totaal_excl numeric, source_gerecht_ids uuid[])
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
    v_guests integer; v_menu jsonb;
begin
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


-- ── 2. De rechten van 4 oktober ─────────────────────────────────────────────
-- Per functie eerst alles weg, dan precies de grants van toen. De eigenaar
-- (postgres) houdt zijn eigen recht. Een functie die er niet is (op dev
-- kunnen de live-only functies ontbreken) wordt overgeslagen.
DO $$
DECLARE
    r     RECORD;
    v_rol TEXT;
BEGIN
    FOR r IN
        SELECT * FROM (VALUES
            ('public.anonymize_old_floor_plan_guests()',                        ARRAY['PUBLIC', 'anon', 'authenticated', 'service_role']),
            ('public.backfill_ingredient_allergens()',                          ARRAY['PUBLIC', 'anon', 'authenticated', 'service_role']),
            ('public.current_role_in_org()',                                    ARRAY['PUBLIC', 'anon', 'authenticated', 'service_role']),
            ('public.current_venue_id()',                                       ARRAY['PUBLIC', 'anon', 'authenticated', 'service_role']),
            ('public.decrement_stock(uuid, integer)',                           ARRAY['anon', 'authenticated', 'service_role']),
            ('public.explode_event_to_inkooplijst(uuid, integer)',              ARRAY['PUBLIC', 'anon', 'authenticated', 'service_role']),
            ('public.find_cheaper_substitutes_same_cut(uuid, bigint, integer)', ARRAY['PUBLIC', 'anon', 'authenticated', 'service_role']),
            ('public.get_latest_gerecht_cost_delta(uuid, uuid)',                ARRAY['PUBLIC', 'anon', 'authenticated', 'service_role']),
            ('public.get_market_pulse(uuid)',                                   ARRAY['PUBLIC', 'anon', 'authenticated', 'service_role']),
            ('public.increment_share_access(bigint)',                           ARRAY['PUBLIC', 'anon', 'authenticated', 'service_role']),
            ('public.kds_cleanup_expired()',                                    ARRAY['PUBLIC', 'anon', 'authenticated', 'service_role']),
            ('public.log_bon_action(bigint, text, text, jsonb)',                ARRAY['anon', 'authenticated', 'service_role']),
            ('public.refresh_gerecht_allergens_mv()',                           ARRAY['PUBLIC', 'anon', 'authenticated', 'service_role']),
            ('public.set_session_venue(uuid)',                                  ARRAY['anon', 'authenticated', 'service_role']),
            ('public.unlock_bon(bigint)',                                       ARRAY['anon', 'authenticated', 'service_role']),
            ('public.voorstellen_verlopen_markeren()',                          ARRAY['anon', 'authenticated', 'service_role'])
        ) AS k(sig, rollen)
    LOOP
        IF to_regprocedure(r.sig) IS NULL THEN
            RAISE NOTICE 'herstel ba-s2: % bestaat niet; overgeslagen', r.sig;
            CONTINUE;
        END IF;
        EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated, service_role', r.sig);
        FOREACH v_rol IN ARRAY r.rollen
        LOOP
            EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO %s', r.sig,
                           CASE WHEN v_rol = 'PUBLIC' THEN 'PUBLIC' ELSE quote_ident(v_rol) END);
        END LOOP;
    END LOOP;
END $$;


-- ── 3. Controle: klopt het niet, dan draait het herstel terug ──────────────
DO $$
DECLARE
    v_fouten TEXT := '';
    v_lijst  TEXT;
BEGIN
    SELECT string_agg(s, ', ')
      INTO v_lijst
      FROM unnest(ARRAY[
          'public.anonymize_old_floor_plan_guests()', 'public.backfill_ingredient_allergens()',
          'public.current_role_in_org()', 'public.current_venue_id()', 'public.decrement_stock(uuid, integer)',
          'public.explode_event_to_inkooplijst(uuid, integer)', 'public.find_cheaper_substitutes_same_cut(uuid, bigint, integer)',
          'public.get_latest_gerecht_cost_delta(uuid, uuid)', 'public.get_market_pulse(uuid)',
          'public.increment_share_access(bigint)', 'public.kds_cleanup_expired()',
          'public.log_bon_action(bigint, text, text, jsonb)', 'public.refresh_gerecht_allergens_mv()',
          'public.set_session_venue(uuid)', 'public.unlock_bon(bigint)', 'public.voorstellen_verlopen_markeren()'
      ]) AS s
     WHERE to_regprocedure(s) IS NOT NULL
       AND NOT (has_function_privilege('anon', s, 'EXECUTE')
                AND has_function_privilege('authenticated', s, 'EXECUTE')
                AND has_function_privilege('service_role', s, 'EXECUTE'));
    IF v_lijst IS NOT NULL THEN
        v_fouten := v_fouten || E'\n  niet terug voor anon/authenticated/service_role: ' || v_lijst;
    END IF;

    SELECT string_agg(k.sig || ' (md5 ' || md5(p.prosrc) || ')', ', ')
      INTO v_lijst
      FROM (VALUES
          ('public.explode_event_to_inkooplijst(uuid, integer)',              '54f24c0c13e93ac3b55dd06b56968f2c'),
          ('public.find_cheaper_substitutes_same_cut(uuid, bigint, integer)', 'b1c21c50a6a3188c2e16959a5350ea00'),
          ('public.get_latest_gerecht_cost_delta(uuid, uuid)',                '7d6fabfbd06c8e5fa6d9af1a6103db85')
      ) AS k(sig, live_md5)
      JOIN pg_proc p ON p.oid = to_regprocedure(k.sig)
     WHERE md5(p.prosrc) <> k.live_md5;
    IF v_lijst IS NOT NULL THEN
        v_fouten := v_fouten || E'\n  definitie niet gelijk aan live (4 okt): ' || v_lijst;
    END IF;

    IF v_fouten <> '' THEN
        RAISE EXCEPTION 'herstel ba-s2: controle mislukt, er is niets veranderd:%', v_fouten;
    END IF;
    RAISE NOTICE 'herstel ba-s2: rechten en definities staan weer zoals op 4 oktober (anon-lek weer open)';
END $$;

COMMIT;
