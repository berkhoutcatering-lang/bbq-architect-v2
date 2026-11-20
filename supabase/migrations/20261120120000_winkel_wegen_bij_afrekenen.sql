-- ════════════════════════════════════════════════════════════════════════════
--  Wegen bij het afrekenen: olijven, tapenades en dips in bakjes zonder sticker
--  Contract toonbank/v1 (1.4, additief) · Test: supabase/tests/toonbank_gewogen.sql
-- ════════════════════════════════════════════════════════════════════════════
--
--  Het verhaal (besluit Mathijs, 20 november 2026)
--    De bakjes worden vooraf gevuld, maar zijn te klein voor een sticker. Bij
--    Verkopen zet de Toonbank het bakje op de geijkte weegschaal (met een vaste
--    tarra voor bakje en deksel, die de weegschaal zelf aftrekt) en de prijs
--    komt op de bon. De kaas blijft vooraf gestickerd.
--
--  Wat erbij komt
--    1. winkel_artikelen.wegen_bij_afrekenen (alleen bij verkoop_per 'kg') en
--       tarra_g (gram, 0–9999, leeg = nog niet bekend). De catalogusversie gaat
--       omhoog als een van beide verandert.
--    2. GET catalogus geeft per artikel wegen_bij_afrekenen en tarra_g.
--    3. De bonregel van een gewogen bakje: prijs_bron 'catalogus' met gewicht_g
--       en kiloprijs_cents (de TB-9-vorm), aantal 1 (−1 op een tegenbon),
--       onderdelen [{product_id, hoeveelheid: gewicht_g, eenheid: gram}], geen
--       scan_code. De bestaande boeking schrijft daarmee al gram af.
--       Nieuw: private.toonbank_controleer_gewogen rekent na
--         - stuk_cents = gewicht × kiloprijs, hele centen, halve cent omhoog
--           (prijsUitGewicht)                                 → 'gewogen_prijs'
--         - kiloprijs = die van het artikel in BBQ Architect   → 'gewogen_kiloprijs'
--         - de onderdelen boeken precies het gewicht af, één product → 'gewogen_gewicht'
--       Een afwijking komt in "Te controleren"; de bon wordt altijd geboekt.
--    4. toonbank_boek_bon: zo'n gewogen regel telt niet meer als
--       prijs_afwijking (de prijs hoort te verschillen van prijs_cents), en de
--       nieuwe controle draait na die van de stickers.
--
--  Gebouwd op de LIVE definities (pg_get_functiondef), op ankers; vindt een
--  vervanging haar anker niet precies één keer, dan stopt de migratie.
--  Toepassen: met de hand, één keer, in BEGIN/COMMIT; nooit db push. Eerst een
--  proefdraai met ROLLBACK.
BEGIN;

-- ── 0. Pre-flight ───────────────────────────────────────────────────────────
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'winkel_artikelen' AND column_name = 'wegen_bij_afrekenen') THEN
        RAISE EXCEPTION 'winkel_wegen_bij_afrekenen: deze migratie is al gedraaid';
    END IF;
    IF to_regprocedure('private.toonbank_controleer_sticker(jsonb)') IS NULL THEN
        RAISE EXCEPTION 'winkel_wegen_bij_afrekenen: eerst 20261118120000_toonbank_sticker_controle';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_winkel_cv_artikel' AND tgrelid = 'public.winkel_artikelen'::REGCLASS) THEN
        RAISE EXCEPTION 'winkel_wegen_bij_afrekenen: de catalogustrigger op winkel_artikelen ontbreekt';
    END IF;
END $$;

-- Vervang een stuk tekst in een functie, precies één keer, of stop.
CREATE OR REPLACE FUNCTION pg_temp.vervang(p_functie TEXT, p_oud TEXT, p_nieuw TEXT)
RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE
    v_def TEXT := pg_get_functiondef(p_functie::REGPROCEDURE);
    v_n   INTEGER := (length(v_def) - length(replace(v_def, p_oud, ''))) / length(p_oud);
BEGIN
    IF v_n <> 1 THEN
        RAISE EXCEPTION 'winkel_wegen_bij_afrekenen: % is anders dan verwacht (anker % keer gevonden): %', p_functie, v_n, left(p_oud, 80);
    END IF;
    EXECUTE replace(v_def, p_oud, p_nieuw);
END $$;

-- ── 1. De twee velden ───────────────────────────────────────────────────────
ALTER TABLE public.winkel_artikelen
    ADD COLUMN wegen_bij_afrekenen BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN tarra_g INTEGER CHECK (tarra_g IS NULL OR (tarra_g >= 0 AND tarra_g <= 9999));
ALTER TABLE public.winkel_artikelen ADD CONSTRAINT winkel_artikelen_wegen_bij_afrekenen_check
    CHECK (NOT wegen_bij_afrekenen OR verkoop_per = 'kg');
COMMENT ON COLUMN public.winkel_artikelen.wegen_bij_afrekenen IS
    'Op gewicht, maar zonder sticker: de Toonbank weegt het bakje bij het afrekenen (olijven, tapenades, dips). Alleen bij verkoop_per kg.';
COMMENT ON COLUMN public.winkel_artikelen.tarra_g IS
    'Gewicht van bakje plus deksel in gram. De Toonbank stuurt het als vaste tarra naar de geijkte weegschaal, die het zelf aftrekt. Leeg = nog niet bekend.';

DROP TRIGGER trg_winkel_cv_artikel ON public.winkel_artikelen;
CREATE CONSTRAINT TRIGGER trg_winkel_cv_artikel
    AFTER UPDATE OF naam, slug, prijs_cents, btw_pct, btw_verdeling, alcohol, actief,
                    kanalen, toonbank_groep, toonbank_volgorde, toonbank_favoriet,
                    verkoop_per, kiloprijs_cents, sticker_plu, etiket, wegen_bij_afrekenen, tarra_g
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
          OR OLD.etiket IS DISTINCT FROM NEW.etiket
          OR OLD.wegen_bij_afrekenen IS DISTINCT FROM NEW.wegen_bij_afrekenen
          OR OLD.tarra_g IS DISTINCT FROM NEW.tarra_g)
    EXECUTE FUNCTION private.winkel_catalogus_versie_omhoog('artikel');

-- ── 2. Catalogus ────────────────────────────────────────────────────────────
SELECT pg_temp.vervang('public.toonbank_catalogus(uuid)',
    $q$'kiloprijs_cents', CASE WHEN art.verkoop_per = 'kg' THEN art.kiloprijs_cents END,$q$,
    $q$'kiloprijs_cents', CASE WHEN art.verkoop_per = 'kg' THEN art.kiloprijs_cents END,
                   -- 20261120120000_winkel_wegen_bij_afrekenen: bakje zonder sticker, gewogen bij het afrekenen.
                   'wegen_bij_afrekenen', art.verkoop_per = 'kg' AND art.wegen_bij_afrekenen,
                   'tarra_g',         CASE WHEN art.verkoop_per = 'kg' AND art.wegen_bij_afrekenen THEN art.tarra_g END,$q$);

-- ── 3. De controle per gewogen regel ────────────────────────────────────────
CREATE FUNCTION private.toonbank_controleer_gewogen(p_org UUID, p_regels JSONB)
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
    v_art      RECORD;
BEGIN
    IF jsonb_typeof(p_regels) IS DISTINCT FROM 'array' THEN
        RETURN v_uit;
    END IF;
    FOR r IN SELECT e FROM jsonb_array_elements(p_regels) e
              WHERE e->>'soort' = 'verkoop' AND e->>'prijs_bron' = 'catalogus'
                AND COALESCE(jsonb_typeof(e->'gewicht_g'), 'null') <> 'null' LOOP
        v_nr   := private.tb_int(r->'regelnr');
        v_gram := private.tb_int(r->'gewicht_g');
        v_kilo := private.tb_int(r->'kiloprijs_cents');
        v_stuk := private.tb_int(r->'stuk_cents');
        SELECT a.naam, a.kiloprijs_cents INTO v_art
          FROM public.winkel_artikelen a
         WHERE a.id = private.tb_uuid(r->>'artikel_id') AND a.organization_id = p_org;

        IF v_gram IS NULL OR v_gram < 1 OR v_kilo IS NULL OR v_kilo < 0 THEN
            v_uit := v_uit || jsonb_build_object('code', 'gewogen_prijs', 'melding',
                format('Regel %s: een gewogen bakje zonder geldig gewicht of kiloprijs (%s g, %s ct per kilo).',
                       v_nr, COALESCE(v_gram::TEXT, 'niets'), COALESCE(v_kilo::TEXT, 'niets')));
            CONTINUE;
        END IF;

        -- prijsUitGewicht: hele centen, een halve cent omhoog. Alleen hele getallen.
        v_verwacht := (v_gram * v_kilo + 500) / 1000;
        IF v_stuk IS DISTINCT FROM v_verwacht THEN
            v_uit := v_uit || jsonb_build_object('code', 'gewogen_prijs', 'melding',
                format('Regel %s: gewogen %s g × %s ct per kilo is %s ct, op de bon staat %s ct.',
                       v_nr, v_gram, v_kilo, v_verwacht, COALESCE(v_stuk::TEXT, 'niets')));
        END IF;

        IF v_art.kiloprijs_cents IS DISTINCT FROM v_kilo THEN
            v_uit := v_uit || jsonb_build_object('code', 'gewogen_kiloprijs', 'melding',
                format('Regel %s: %s gewogen voor %s ct per kilo; in BBQ Architect staat %s.',
                       v_nr, COALESCE(v_art.naam, 'een onbekend artikel'), v_kilo, COALESCE(v_art.kiloprijs_cents::TEXT || ' ct per kilo', 'geen kiloprijs')));
        END IF;

        -- De voorraad gaat in gram af: precies het gewicht, één product.
        IF jsonb_typeof(r->'onderdelen') = 'array' THEN
            SELECT count(DISTINCT o->>'product_id'), sum(private.tb_getal(o->'hoeveelheid'))
              INTO v_prod, v_af
              FROM jsonb_array_elements(r->'onderdelen') o;
        ELSE
            v_prod := 0; v_af := NULL;
        END IF;
        IF v_prod <> 1 OR v_af IS DISTINCT FROM v_gram::NUMERIC THEN
            v_uit := v_uit || jsonb_build_object('code', 'gewogen_gewicht', 'melding',
                format('Regel %s: het bakje woog %s g, maar de bon boekt %s af (in %s product%s).',
                       v_nr, v_gram, COALESCE(v_af::TEXT, 'niets'), v_prod, CASE WHEN v_prod = 1 THEN '' ELSE 'en' END));
        END IF;
    END LOOP;
    RETURN v_uit;
END $$;
COMMENT ON FUNCTION private.toonbank_controleer_gewogen(UUID, JSONB) IS
    'Rekent elke bij het afrekenen gewogen regel na (prijs_bron catalogus met gewicht_g): stuk_cents = gewicht × kiloprijs, de kiloprijs zoals in BBQ Architect, de onderdelen = het gewicht. Geeft controles voor "Te controleren"; weigert nooit.';
REVOKE ALL ON FUNCTION private.toonbank_controleer_gewogen(UUID, JSONB) FROM PUBLIC, anon, authenticated, service_role;

-- ── 4. toonbank_boek_bon ────────────────────────────────────────────────────
-- Een gewogen regel hoort een andere prijs te hebben dan prijs_cents: geen prijs_afwijking.
SELECT pg_temp.vervang('public.toonbank_boek_bon(bigint)',
    $q$AND a.prijs_cents IS DISTINCT FROM private.tb_int(e->'stuk_cents')),$q$,
    $q$AND COALESCE(jsonb_typeof(e->'gewicht_g'), 'null') = 'null'
                   AND a.prijs_cents IS DISTINCT FROM private.tb_int(e->'stuk_cents')),$q$);
SELECT pg_temp.vervang('public.toonbank_boek_bon(bigint)',
    $q$v_controles := v_controles || private.toonbank_controleer_sticker(v_p->'regels');$q$,
    $q$v_controles := v_controles || private.toonbank_controleer_sticker(v_p->'regels');
    -- 20261120120000_winkel_wegen_bij_afrekenen: bakjes die bij het afrekenen gewogen zijn.
    v_controles := v_controles || private.toonbank_controleer_gewogen(v_org, v_p->'regels');$q$);

-- ── 5. Nakijken ─────────────────────────────────────────────────────────────
DO $$
BEGIN
    IF position('toonbank_controleer_gewogen' IN pg_get_functiondef('public.toonbank_boek_bon(bigint)'::REGPROCEDURE)) = 0
       OR position('wegen_bij_afrekenen' IN pg_get_functiondef('public.toonbank_catalogus(uuid)'::REGPROCEDURE)) = 0
       OR position('wegen_bij_afrekenen' IN (SELECT pg_get_triggerdef(oid) FROM pg_trigger WHERE tgname = 'trg_winkel_cv_artikel' AND tgrelid = 'public.winkel_artikelen'::REGCLASS)) = 0 THEN
        RAISE EXCEPTION 'winkel_wegen_bij_afrekenen: een functie of trigger is niet aangevuld';
    END IF;
END $$;

COMMIT;
