-- ════════════════════════════════════════════════════════════════════════════
--  Bestelstroom — NULL op max_dozen_totaal betekent DICHT, niet onbeperkt
--  Plan: docs/bestelstroom-bouwplan.md §2.1
-- ════════════════════════════════════════════════════════════════════════════
--
--  De eerste migratie (20260903120000) legde NULL op max_dozen_totaal uit als
--  "geen totaalgrens". Dat is een open kraan: een vergeten veld wordt dan een
--  onbeperkte verkoop. Zelfde regel als bij de doosmaat in de cache — weten we
--  het niet, dan nemen we geen bestelling aan. Liever dicht dan raden.
--
--  Deze migratie doet twee dingen:
--    1. de kolomcommentaar rechtzetten, zodat de database zelf het goede zegt
--    2. plaats_bestelling weigert met BB007 zodra het totaal onbekend is
--
--  De API-route zet het formulier bij NULL op het vierde scherm ("er staat nu
--  geen bestelling open"); BB007 is de achtervang voor als er tóch een POST
--  binnenkomt.
-- ════════════════════════════════════════════════════════════════════════════

COMMENT ON COLUMN public.doos_types.max_dozen_totaal IS
    'Hoeveel dozen er in totaal gemaakt worden. Dit begrenst zijn uren en zijn koeling, niet de verpakking — daarom staat het hier en niet in de Experience-app. NULL betekent DICHT: het formulier neemt geen bestellingen aan tot het getal er staat. Nooit "onbeperkt".';

-- Foutcodes (aanvulling op de lijst in 20260903120000):
--   BB007  totaal aantal dozen onbekend (max_dozen_totaal IS NULL)
CREATE OR REPLACE FUNCTION public.plaats_bestelling(
    p_organization_id   UUID,
    p_doos_type_id      UUID,
    p_afhaalmoment_id   UUID,
    p_personen          INTEGER,
    p_naam              TEXT,
    p_voornaam          TEXT,
    p_email             TEXT,
    p_telefoon          TEXT,
    p_allergie_notitie  TEXT,
    p_idempotency_key   TEXT
)
RETURNS public.bestellingen
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
    v_type              public.doos_types%ROWTYPE;
    v_moment            public.afhaalmomenten%ROWTYPE;
    v_bestaand          public.bestellingen%ROWTYPE;
    v_nieuw             public.bestellingen%ROWTYPE;
    v_personen_per_doos INTEGER;
    v_dozen             INTEGER;
    v_bezet_moment      INTEGER;
    v_bezet_totaal      INTEGER;
    v_allergie          TEXT;
BEGIN
    v_allergie := NULLIF(btrim(COALESCE(p_allergie_notitie, '')), '');

    -- ── Idempotentie ────────────────────────────────────────────────────────
    SELECT * INTO v_bestaand
    FROM public.bestellingen
    WHERE organization_id = p_organization_id
      AND idempotency_key = p_idempotency_key;

    IF FOUND THEN
        IF v_bestaand.doos_type_id     = p_doos_type_id
           AND v_bestaand.afhaalmoment_id = p_afhaalmoment_id
           AND v_bestaand.personen        = p_personen
           AND v_bestaand.naam            = p_naam
           AND v_bestaand.email           = p_email
           AND v_bestaand.allergie_notitie IS NOT DISTINCT FROM v_allergie
        THEN
            RETURN v_bestaand;
        END IF;
        RAISE EXCEPTION 'zelfde sleutel, andere invoer'
            USING ERRCODE = 'BB004';
    END IF;

    -- ── Doostype vergrendelen (eerst, altijd) ───────────────────────────────
    SELECT * INTO v_type
    FROM public.doos_types
    WHERE id = p_doos_type_id
      AND organization_id = p_organization_id
      AND actief
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'doostype onbekend of niet actief'
            USING ERRCODE = 'BB002';
    END IF;

    -- Nieuw: onbekend totaal is dicht, niet onbeperkt.
    IF v_type.max_dozen_totaal IS NULL THEN
        RAISE EXCEPTION 'totaal aantal dozen onbekend'
            USING ERRCODE = 'BB007';
    END IF;

    IF (v_type.personen_min IS NOT NULL AND p_personen < v_type.personen_min)
       OR (v_type.personen_max IS NOT NULL AND p_personen > v_type.personen_max)
    THEN
        RAISE EXCEPTION 'aantal personen valt buiten de grenzen'
            USING ERRCODE = 'BB006';
    END IF;

    -- ── Hoeveel dozen is dit? ───────────────────────────────────────────────
    v_personen_per_doos := CASE
        WHEN v_type.experience_cache->>'personen_per_doos' ~ '^[0-9]+$'
        THEN (v_type.experience_cache->>'personen_per_doos')::INTEGER
        ELSE NULL
    END;

    IF v_personen_per_doos IS NULL OR v_personen_per_doos <= 0 THEN
        RAISE EXCEPTION 'doosmaat onbekend'
            USING ERRCODE = 'BB005';
    END IF;

    v_dozen := CEIL(p_personen::NUMERIC / v_personen_per_doos)::INTEGER;

    -- ── Afhaalmoment vergrendelen ───────────────────────────────────────────
    SELECT * INTO v_moment
    FROM public.afhaalmomenten
    WHERE id = p_afhaalmoment_id
      AND organization_id = p_organization_id
      AND doos_type_id = p_doos_type_id
      AND actief
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'afhaalmoment onbekend of niet actief'
            USING ERRCODE = 'BB002';
    END IF;

    SELECT COALESCE(SUM(dozen), 0) INTO v_bezet_moment
    FROM public.bestellingen
    WHERE afhaalmoment_id = p_afhaalmoment_id
      AND status <> 'geannuleerd';

    IF v_bezet_moment + v_dozen > v_moment.max_dozen THEN
        RAISE EXCEPTION 'moment vol'
            USING ERRCODE = 'BB001';
    END IF;

    SELECT COALESCE(SUM(dozen), 0) INTO v_bezet_totaal
    FROM public.bestellingen
    WHERE doos_type_id = p_doos_type_id
      AND status <> 'geannuleerd';

    IF v_bezet_totaal + v_dozen > v_type.max_dozen_totaal THEN
        RAISE EXCEPTION 'totaal uitverkocht'
            USING ERRCODE = 'BB003';
    END IF;

    -- ── Opslaan ─────────────────────────────────────────────────────────────
    INSERT INTO public.bestellingen (
        organization_id, doos_type_id, afhaalmoment_id,
        personen, dozen,
        naam, voornaam, email, telefoon,
        allergie_notitie, prijs_cents, idempotency_key
    ) VALUES (
        p_organization_id, p_doos_type_id, p_afhaalmoment_id,
        p_personen, v_dozen,
        p_naam, p_voornaam, p_email, NULLIF(btrim(COALESCE(p_telefoon, '')), ''),
        v_allergie, v_type.prijs_cents, p_idempotency_key
    )
    RETURNING * INTO v_nieuw;

    RETURN v_nieuw;
END $$;

COMMENT ON FUNCTION public.plaats_bestelling IS
    'Neemt één bestelling aan, met doos_type en afhaalmoment vergrendeld zodat twee mensen niet allebei de laatste doos krijgen. Foutcodes BB001..BB007 — zie de commentaarkoppen van 20260903120000 en 20260903130000.';

-- Rechten ongewijzigd: alleen service_role. CREATE OR REPLACE behoudt bestaande
-- grants, maar expliciet is hier beter dan impliciet.
REVOKE ALL ON FUNCTION public.plaats_bestelling(UUID, UUID, UUID, INTEGER, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.plaats_bestelling(UUID, UUID, UUID, INTEGER, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO service_role;
