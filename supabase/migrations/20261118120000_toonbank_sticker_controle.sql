-- ════════════════════════════════════════════════════════════════════════════
--  Toonbank contract 1.4 — een stickerbon narekenen, en de catalogusversie
--  omhoog als het etiket verandert
--  Test: supabase/tests/toonbank_sticker_controle.sql (alleen op de dev-database)
-- ════════════════════════════════════════════════════════════════════════════
--
--  Waarom
--    Een bonregel met prijs_bron 'sticker' werd geboekt (voorraad in gram af,
--    stuk verkocht), maar niet nagerekend. En een gewijzigde kiloprijs of een
--    gewijzigd etiket (allergenen, ingrediënten, rauwe melk, houdbaarheid)
--    zette de catalogusversie niet omhoog, zodat de Toonbank een oud etiket
--    bleef printen.
--
--  Wat erbij komt
--    1. private.toonbank_controleer_sticker(regels): per stickerregel
--         - stuk_cents = gewicht × kiloprijs in hele centen, halve cent omhoog
--           (prijsUitGewicht, dezelfde regel als de Toonbank en
--           src/lib/winkel/opGewicht.ts) → anders 'sticker_prijs';
--         - de onderdelen boeken precies het gewicht af, in één product
--           → anders 'sticker_gewicht'.
--       Geeft controles terug, net als toonbank_controleer_order_rest. De bon
--       wordt wél geboekt; een afwijking zet de melding op 'conflict' en
--       komt in "Te controleren". Een bon wordt nooit geweigerd.
--    2. toonbank_boek_bon roept hem aan, direct na de order-rest-controle.
--       Gebouwd op de LIVE definitie (pg_get_functiondef), op één anker; vindt
--       de vervanging het anker niet precies één keer, dan stopt de migratie.
--    3. De catalogustriggers kennen ook verkoop_per, kiloprijs_cents,
--       sticker_plu en etiket (artikel) en ingredienten, allergenen en
--       binnen_per_sticker (product): precies wat toonbank_catalogus in het
--       etiket meegeeft.
--
--  Wat er niet verandert
--    Het contract toonbank/v1 (geen nieuw veld), de boeking zelf, de
--    verwerking van de melding sticker.
--
--  Toepassen: met de hand, één keer, in BEGIN/COMMIT; nooit db push.

BEGIN;

-- ── 0. Pre-flight ───────────────────────────────────────────────────────────
DO $$
BEGIN
    IF to_regprocedure('private.toonbank_controleer_sticker(jsonb)') IS NOT NULL THEN
        RAISE EXCEPTION 'toonbank_sticker_controle: deze migratie is al gedraaid';
    END IF;
    IF to_regclass('public.winkel_stuks') IS NULL THEN
        RAISE EXCEPTION 'toonbank_sticker_controle: eerst 20261103120000_winkel_stuks';
    END IF;
    IF to_regprocedure('public.toonbank_boek_bon(bigint)') IS NULL
       OR to_regprocedure('private.toonbank_controleer_order_rest(uuid,uuid)') IS NULL
       OR to_regprocedure('private.tb_int(jsonb)') IS NULL
       OR to_regprocedure('private.tb_getal(jsonb)') IS NULL
       OR to_regprocedure('private.winkel_catalogus_versie_omhoog()') IS NULL THEN
        RAISE EXCEPTION 'toonbank_sticker_controle: een Toonbank-functie ontbreekt';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_winkel_cv_artikel' AND tgrelid = 'public.winkel_artikelen'::REGCLASS)
       OR NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_winkel_cv_product' AND tgrelid = 'public.winkel_producten'::REGCLASS) THEN
        RAISE EXCEPTION 'toonbank_sticker_controle: de catalogustriggers ontbreken';
    END IF;
END $$;

-- ── 1. De controle per stickerregel ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION private.toonbank_controleer_sticker(p_regels JSONB)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
    r          JSONB;
    v_uit      JSONB := '[]'::JSONB;
    v_nr       INTEGER;
    v_gram     BIGINT;
    v_kilo     BIGINT;
    v_stuk     BIGINT;
    v_verwacht BIGINT;
    v_af       NUMERIC;
    v_prod     INTEGER;
BEGIN
    IF jsonb_typeof(p_regels) IS DISTINCT FROM 'array' THEN
        RETURN v_uit;
    END IF;
    FOR r IN SELECT e FROM jsonb_array_elements(p_regels) e
              WHERE e->>'soort' = 'verkoop' AND e->>'prijs_bron' = 'sticker' LOOP
        v_nr   := private.tb_int(r->'regelnr');
        v_gram := private.tb_int(r->'gewicht_g');
        v_kilo := private.tb_int(r->'kiloprijs_cents');
        v_stuk := private.tb_int(r->'stuk_cents');
        -- Zonder gewicht of kiloprijs is het al een vormfout (toonbank_bon_fouten).
        CONTINUE WHEN v_gram IS NULL OR v_gram < 1 OR v_kilo IS NULL OR v_kilo < 0;

        -- prijsUitGewicht: hele centen, een halve cent omhoog. Alleen hele getallen.
        v_verwacht := (v_gram * v_kilo + 500) / 1000;
        IF v_stuk IS DISTINCT FROM v_verwacht THEN
            v_uit := v_uit || jsonb_build_object('code', 'sticker_prijs', 'melding',
                format('Regel %s: sticker %s g × %s ct per kilo is %s ct, op de bon staat %s ct.',
                       v_nr, v_gram, v_kilo, v_verwacht, COALESCE(v_stuk::TEXT, 'niets')));
        END IF;

        -- De voorraad gaat in gram af: precies het gewicht van de sticker, één product.
        IF jsonb_typeof(r->'onderdelen') = 'array' THEN
            SELECT count(DISTINCT o->>'product_id'), sum(private.tb_getal(o->'hoeveelheid'))
              INTO v_prod, v_af
              FROM jsonb_array_elements(r->'onderdelen') o;
        ELSE
            v_prod := 0; v_af := NULL;
        END IF;
        IF v_prod <> 1 OR v_af IS DISTINCT FROM v_gram::NUMERIC THEN
            v_uit := v_uit || jsonb_build_object('code', 'sticker_gewicht', 'melding',
                format('Regel %s: de sticker weegt %s g, maar de bon boekt %s af (in %s product%s).',
                       v_nr, v_gram, COALESCE(v_af::TEXT, 'niets'), v_prod, CASE WHEN v_prod = 1 THEN '' ELSE 'en' END));
        END IF;
    END LOOP;
    RETURN v_uit;
END $$;
COMMENT ON FUNCTION private.toonbank_controleer_sticker(JSONB) IS
    'Contract 1.4: rekent elke stickerregel van een bon na (stuk_cents = gewicht × kiloprijs, hele centen, halve cent omhoog; onderdelen = het gewicht). Geeft controles voor "Te controleren"; weigert nooit.';
REVOKE ALL ON FUNCTION private.toonbank_controleer_sticker(JSONB) FROM PUBLIC, anon, authenticated, service_role;

-- ── 2. toonbank_boek_bon roept de controle aan ──────────────────────────────
DO $$
DECLARE
    v_def   TEXT := pg_get_functiondef('public.toonbank_boek_bon(bigint)'::REGPROCEDURE);
    v_oud   TEXT := $q$v_controles := v_controles || private.toonbank_controleer_order_rest(v_org, v_bon_id);$q$;
    v_nieuw TEXT := $q$v_controles := v_controles || private.toonbank_controleer_order_rest(v_org, v_bon_id);
    -- Contract 1.4 (20261118120000_toonbank_sticker_controle): stickerregels narekenen.
    v_controles := v_controles || private.toonbank_controleer_sticker(v_p->'regels');$q$;
    v_aantal INTEGER;
BEGIN
    v_aantal := (length(v_def) - length(replace(v_def, v_oud, ''))) / length(v_oud);
    IF v_aantal <> 1 THEN
        RAISE EXCEPTION 'toonbank_sticker_controle: toonbank_boek_bon is anders dan verwacht (anker order_rest % keer gevonden)', v_aantal;
    END IF;
    EXECUTE replace(v_def, v_oud, v_nieuw);
END $$;

-- ── 3. De catalogusversie omhoog als het etiket verandert ───────────────────
DROP TRIGGER trg_winkel_cv_artikel ON public.winkel_artikelen;
CREATE CONSTRAINT TRIGGER trg_winkel_cv_artikel
    AFTER UPDATE OF naam, slug, prijs_cents, btw_pct, btw_verdeling, alcohol, actief,
                    kanalen, toonbank_groep, toonbank_volgorde, toonbank_favoriet,
                    verkoop_per, kiloprijs_cents, sticker_plu, etiket
    ON public.winkel_artikelen
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW
    WHEN (OLD.naam IS DISTINCT FROM NEW.naam OR OLD.slug IS DISTINCT FROM NEW.slug
          OR OLD.prijs_cents IS DISTINCT FROM NEW.prijs_cents OR OLD.btw_pct IS DISTINCT FROM NEW.btw_pct
          OR OLD.btw_verdeling IS DISTINCT FROM NEW.btw_verdeling OR OLD.alcohol IS DISTINCT FROM NEW.alcohol
          OR OLD.actief IS DISTINCT FROM NEW.actief OR OLD.kanalen IS DISTINCT FROM NEW.kanalen
          OR OLD.toonbank_groep IS DISTINCT FROM NEW.toonbank_groep
          OR OLD.toonbank_volgorde IS DISTINCT FROM NEW.toonbank_volgorde
          OR OLD.toonbank_favoriet IS DISTINCT FROM NEW.toonbank_favoriet
          OR OLD.verkoop_per IS DISTINCT FROM NEW.verkoop_per
          OR OLD.kiloprijs_cents IS DISTINCT FROM NEW.kiloprijs_cents
          OR OLD.sticker_plu IS DISTINCT FROM NEW.sticker_plu
          OR OLD.etiket IS DISTINCT FROM NEW.etiket)
    EXECUTE FUNCTION private.winkel_catalogus_versie_omhoog('artikel');

DROP TRIGGER trg_winkel_cv_product ON public.winkel_producten;
CREATE CONSTRAINT TRIGGER trg_winkel_cv_product
    AFTER UPDATE OF naam, eenheid, statiegeld_cents, alcohol, ean, foto, foto_url, winkelprijs_incl_cents,
                    prijs_per, btw_pct, actief, voorraad, ingredienten, allergenen, binnen_per_sticker
    ON public.winkel_producten
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW
    WHEN (OLD.naam IS DISTINCT FROM NEW.naam OR OLD.eenheid IS DISTINCT FROM NEW.eenheid
          OR OLD.statiegeld_cents IS DISTINCT FROM NEW.statiegeld_cents OR OLD.alcohol IS DISTINCT FROM NEW.alcohol
          OR OLD.ean IS DISTINCT FROM NEW.ean OR OLD.foto IS DISTINCT FROM NEW.foto OR OLD.foto_url IS DISTINCT FROM NEW.foto_url
          OR OLD.winkelprijs_incl_cents IS DISTINCT FROM NEW.winkelprijs_incl_cents
          OR OLD.prijs_per IS DISTINCT FROM NEW.prijs_per OR OLD.btw_pct IS DISTINCT FROM NEW.btw_pct
          OR OLD.actief IS DISTINCT FROM NEW.actief
          OR (OLD.voorraad IS NULL) IS DISTINCT FROM (NEW.voorraad IS NULL)
          OR OLD.ingredienten IS DISTINCT FROM NEW.ingredienten
          OR OLD.allergenen IS DISTINCT FROM NEW.allergenen
          OR OLD.binnen_per_sticker IS DISTINCT FROM NEW.binnen_per_sticker)
    EXECUTE FUNCTION private.winkel_catalogus_versie_omhoog('product');

-- ── 4. Nakijken ─────────────────────────────────────────────────────────────
DO $$
BEGIN
    IF position('toonbank_controleer_sticker' IN pg_get_functiondef('public.toonbank_boek_bon(bigint)'::REGPROCEDURE)) = 0 THEN
        RAISE EXCEPTION 'toonbank_sticker_controle: toonbank_boek_bon is niet aangevuld';
    END IF;
    IF position('etiket' IN (SELECT pg_get_triggerdef(oid) FROM pg_trigger WHERE tgname = 'trg_winkel_cv_artikel' AND tgrelid = 'public.winkel_artikelen'::REGCLASS)) = 0
       OR position('allergenen' IN (SELECT pg_get_triggerdef(oid) FROM pg_trigger WHERE tgname = 'trg_winkel_cv_product' AND tgrelid = 'public.winkel_producten'::REGCLASS)) = 0 THEN
        RAISE EXCEPTION 'toonbank_sticker_controle: een catalogustrigger is niet aangevuld';
    END IF;
END $$;

COMMIT;
