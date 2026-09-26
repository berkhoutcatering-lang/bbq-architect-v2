-- ════════════════════════════════════════════════════════════════════════════
--  Winkelvoorraad W3 — afboeken bij inpakken
--  Plan: docs/voorraad-bouwplan.md §3 · Opdracht: docs/OPDRACHT-BBQ-ARCHITECT-WINKELVOORRAAD.md
-- ════════════════════════════════════════════════════════════════════════════
--
--  Besluit Mathijs (26 sep): afboeken bij inpakken.
--
--    1. Bestellen reserveert (winkel_bezetting_product, bestaat).
--    2. Het vinkje "klaargezet" boekt de componenten af als verkoop_online,
--       in dezelfde transactie als het vinkje zelf. Vinkje uit = retour.
--    3. Netto en idempotent: doel − wat al voor deze regel geboekt is. Twee
--       keer klikken doet niets extra.
--    4. Alleen op betaalde orders. Afgebroken of verlopen orders tellen al niet
--       mee in de bezetting; daar wordt niets geboekt.
--    5. Een klaargezette regel is al van het getal af, dus telt niet meer mee
--       in de bezetting — anders telt hij dubbel.
--    6. Opgehaald (opgehaald_at) is alleen status; de voorraad verandert niet.
--
--  Foutcode erbij:
--    WV006  inpakken kan alleen bij een betaalde order


-- ── 0. Pre-flight ───────────────────────────────────────────────────────────
DO $$
BEGIN
    IF to_regprocedure('public.winkel_muteer_voorraad(uuid, uuid, text, numeric, text, text, bigint, bigint, date, integer, uuid, text, integer, bigint, uuid)') IS NULL THEN
        RAISE EXCEPTION 'winkelvoorraad_inpakken: winkel_muteer_voorraad ontbreekt (migratie 20260928120000)';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'winkel_order_regels' AND column_name = 'klaargezet_at') THEN
        RAISE EXCEPTION 'winkelvoorraad_inpakken: winkel_order_regels.klaargezet_at ontbreekt (migratie 20260925120000)';
    END IF;
END $$;


-- ── 1. Opgehaald ────────────────────────────────────────────────────────────
ALTER TABLE public.winkel_order_regels
    ADD COLUMN IF NOT EXISTS opgehaald_at   TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS opgehaald_door UUID;
COMMENT ON COLUMN public.winkel_order_regels.opgehaald_at IS
    'Afgehaald aan de balie. Alleen status: de voorraad is bij het inpakken (klaargezet_at) al afgeboekt.';


-- ── 2. Bezetting: klaargezet is al afgeboekt ────────────────────────────────
CREATE OR REPLACE FUNCTION public.winkel_bezetting_product(p_product_id UUID, p_zonder_order BIGINT DEFAULT NULL)
RETURNS NUMERIC
LANGUAGE sql
STABLE
AS $$
    SELECT COALESCE(SUM(c.hoeveelheid), 0)::NUMERIC
    FROM public.winkel_order_regel_componenten c
    JOIN public.winkel_order_regels r ON r.id = c.order_regel_id
    JOIN public.winkel_orders o ON o.id = r.order_id
    WHERE c.product_id = p_product_id
      AND r.klaargezet_at IS NULL
      AND (p_zonder_order IS NULL OR o.id <> p_zonder_order)
      AND (o.status = 'betaald' OR (o.status = 'wacht' AND o.reservering_tot > now()));
$$;
COMMENT ON FUNCTION public.winkel_bezetting_product(UUID, BIGINT) IS
    'Gereserveerd = besteld (betaald of lopende reservering) en nog niet ingepakt. Ingepakte regels zijn al van winkel_producten.voorraad af.';


-- ── 3. Eén regel inpakken of uitpakken ──────────────────────────────────────
-- Geeft {klaargezet, boekingen: [{product_id, hoeveelheid, voorraad}]}.
CREATE OR REPLACE FUNCTION public.winkel_zet_klaargezet(
    p_org        UUID,
    p_regel_id   BIGINT,
    p_klaargezet BOOLEAN
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_regel     public.winkel_order_regels%ROWTYPE;
    v_status    TEXT;
    v_rij       RECORD;
    v_delta     NUMERIC;
    v_r         JSONB;
    v_boekingen JSONB := '[]'::JSONB;
BEGIN
    IF auth.uid() IS NOT NULL AND p_org NOT IN (SELECT private.user_org_ids()) THEN
        RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
    END IF;

    SELECT * INTO v_regel FROM public.winkel_order_regels
     WHERE id = p_regel_id AND organization_id = p_org
     FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'regel % niet in deze organisatie', p_regel_id USING ERRCODE = 'P0002';
    END IF;
    SELECT status INTO v_status FROM public.winkel_orders WHERE id = v_regel.order_id;

    IF p_klaargezet AND v_status <> 'betaald' THEN
        RAISE EXCEPTION 'deze order is niet betaald (%): niets inpakken', v_status USING ERRCODE = 'WV006';
    END IF;

    UPDATE public.winkel_order_regels
       SET klaargezet_at = CASE WHEN p_klaargezet THEN COALESCE(klaargezet_at, now()) ELSE NULL END
     WHERE id = p_regel_id;

    -- Per product: doel (− componenten als ingepakt én betaald, anders 0)
    -- min wat al geboekt is. In product-id-volgorde, net als de capaciteitscontrole.
    FOR v_rij IN
        WITH doel AS (
            SELECT c.product_id, -SUM(c.hoeveelheid) AS n
              FROM public.winkel_order_regel_componenten c
             WHERE c.order_regel_id = p_regel_id AND c.product_id IS NOT NULL
               AND p_klaargezet AND v_status = 'betaald'
             GROUP BY c.product_id
        ), geboekt AS (
            SELECT m.winkel_product_id AS product_id, SUM(m.hoeveelheid) AS n
              FROM public.winkel_voorraad_mutaties m
             WHERE m.order_regel_id = p_regel_id AND m.type IN ('verkoop_online', 'retour')
             GROUP BY m.winkel_product_id
        )
        SELECT COALESCE(d.product_id, g.product_id) AS product_id,
               COALESCE(d.n, 0) AS doel, COALESCE(g.n, 0) AS geboekt, p.voorraad
          FROM doel d
          FULL JOIN geboekt g ON g.product_id = d.product_id
          JOIN public.winkel_producten p ON p.id = COALESCE(d.product_id, g.product_id)
         ORDER BY 1
    LOOP
        v_delta := v_rij.doel - v_rij.geboekt;
        -- Niet bijgehouden en nooit geboekt: niets te doen (blokkeert nooit).
        CONTINUE WHEN v_delta = 0 OR (v_rij.voorraad IS NULL AND v_rij.geboekt = 0);
        v_r := public.winkel_muteer_voorraad(
            p_org, v_rij.product_id,
            CASE WHEN v_delta < 0 THEN 'verkoop_online' ELSE 'retour' END,
            v_delta,
            p_order_id => v_regel.order_id, p_order_regel_id => p_regel_id);
        v_boekingen := v_boekingen || jsonb_build_object('product_id', v_rij.product_id, 'hoeveelheid', v_delta, 'voorraad', v_r->'voorraad');
    END LOOP;

    RETURN jsonb_build_object('klaargezet', p_klaargezet, 'boekingen', v_boekingen);
END $$;
REVOKE ALL ON FUNCTION public.winkel_zet_klaargezet(UUID, BIGINT, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.winkel_zet_klaargezet(UUID, BIGINT, BOOLEAN) TO authenticated, service_role;
