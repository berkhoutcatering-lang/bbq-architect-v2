-- ════════════════════════════════════════════════════════════════════════════
--  DRAFT (review M2 K6) — de tijdelijke oude winkel_boek_rest weer weg
--
--  Nog NIET draaien. Pas als de BBQ Architect-code van BA-10 (winkel_boek_rest
--  met p_org) live staat en er geen oude deploy meer draait. Dan hernoemen
--  naar <tijdstempel na de laatste migratie op live>_winkel_boek_rest_compat_weg.sql
--  en als gewone migratie meenemen (eerst dev, dan live).
--  Bestanden die met _draft beginnen slaan tools/testdb en de Supabase-CLI over.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 0. Pre-flight ───────────────────────────────────────────────────────────
DO $$
BEGIN
    IF to_regprocedure('public.winkel_boek_rest(uuid, bigint, text, uuid)') IS NULL THEN
        RAISE EXCEPTION 'compat_weg: de nieuwe winkel_boek_rest(uuid, bigint, text, uuid) ontbreekt; eerst 20261007130000 (BA-10)';
    END IF;
    IF to_regprocedure('public.winkel_boek_rest(bigint, text)') IS NOT NULL
       AND pg_get_functiondef('public.winkel_boek_rest(bigint, text)'::REGPROCEDURE) NOT LIKE '%winkel_boek_rest(v_org, p_order_id, p_methode%' THEN
        RAISE EXCEPTION 'compat_weg: winkel_boek_rest(bigint, text) is niet het doorgeefluik uit BA-10; eerst nakijken';
    END IF;
END $$;

-- ── 1. Weg ──────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.winkel_boek_rest(BIGINT, TEXT);

NOTIFY pgrst, 'reload schema';

-- ── 2. Zelfcontrole ─────────────────────────────────────────────────────────
DO $$
BEGIN
    IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public' AND p.proname = 'winkel_boek_rest') <> 1 THEN
        RAISE EXCEPTION 'compat_weg: er is niet precies één winkel_boek_rest over';
    END IF;
END $$;

-- Daarna in supabase/checks/verify_winkel_live.sql de uitzondering voor
-- winkel_boek_rest (twee versies) en de regel voor winkel_boek_rest(bigint, text)
-- weer weghalen.
