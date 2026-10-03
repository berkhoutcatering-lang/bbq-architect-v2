-- ════════════════════════════════════════════════════════════════════════════
--  BA-2 — één lockvolgorde voor alles wat een webshoporder raakt
--  Plan v5, M1 · Review 3 oktober (deadlock met de foreign key van het logboek)
--  Na: 20261005120000_winkel_order_ophalen.sql
-- ════════════════════════════════════════════════════════════════════════════
--
--  Het probleem
--    winkel_order_ophalen vergrendelde eerst de order (FOR UPDATE) en dan de
--    regels. Het losse vinkje winkel_zet_klaargezet deed het andersom: eerst
--    de regel, en daarna voegt winkel_muteer_voorraad een logboekregel toe
--    met order_id. Die foreign key vraagt een KEY SHARE op de order, en die
--    botst met FOR UPDATE: een cirkel, Postgres breekt af met 40P01.
--    winkel_doos_ophalen had hetzelfde met de doos: eerst de doos, dan de
--    order, terwijl winkel_order_ophalen de dozen pas na de order pakt.
--
--  De lockvolgorde (voor elke functie die een webshoporder wijzigt)
--    1. winkel_orders          FOR NO KEY UPDATE
--    2. winkel_order_regels    FOR UPDATE, in id-volgorde
--    3. winkel_dozen           FOR UPDATE
--    4. winkel_producten       FOR UPDATE, in id-volgorde
--                              (winkel_controleer_capaciteit, winkel_muteer_voorraad)
--    5. inserts in winkel_voorraad_mutaties: de foreign keys vragen KEY SHARE
--       op order, regel en product; KEY SHARE botst niet met NO KEY UPDATE
--    6. bij het committen: winkel_voorraad_versie (deferred trigger, BA-5)
--    Wie een rij van een eerdere stap nodig heeft, vergrendelt die eerst. Een
--    sleutel die niet verandert (de order_id van een regel of doos) mag je
--    vooraf zonder lock lezen.
--
--    Waarom NO KEY UPDATE op de order: dan kan een andere transactie nog wel
--    een logboekregel of doos met deze order_id toevoegen (KEY SHARE), maar
--    twee handelingen op dezelfde order (ophalen, apart zetten, inpakken,
--    doosscan) gaan nog steeds achter elkaar. FOR UPDATE is alleen nodig als
--    de sleutel zelf verandert, en dat gebeurt nergens.
--
--    Wie houdt zich eraan:
--      winkel_order_ophalen(_terug)       1 → 2 → 3 → 4   (20261005120000)
--      winkel_zet_klaargezet              1 → 2 → 4       (hier)
--      winkel_doos_ophalen                1 → 2 → 3 → 4   (hier)
--      winkel_zet_order_apart(_terug)     1 → 2 → 4       (BA-6, 20261005140000)
--      winkel_dozen_voor_regel            2 → 3           (geen orderlock nodig:
--                                         hij wijzigt de order niet, en zijn
--                                         KEY SHARE botst niet met stap 1)
--      winkel_boek_rest, betaalfuncties   1 (→ 4)
--
--  Deze migratie verandert alleen de volgorde van vergrendelen in
--  winkel_zet_klaargezet en winkel_doos_ophalen. De logica, de uitkomsten en
--  de rechten blijven gelijk aan 20260928120100 en 20260928130000.


-- ── 0. Pre-flight ───────────────────────────────────────────────────────────
-- Overschrijf alleen de versie uit de repo: staat er op deze database een
-- andere (bijvoorbeeld een hotfix die niet in de repo staat), dan stoppen.
DO $$
DECLARE
    v_def TEXT;
BEGIN
    IF to_regprocedure('public.winkel_order_ophalen(uuid, bigint, text, text, text, uuid, uuid)') IS NULL THEN
        RAISE EXCEPTION 'ba-2 lockvolgorde: winkel_order_ophalen ontbreekt (migratie 20261005120000)';
    END IF;

    IF to_regprocedure('public.winkel_zet_klaargezet(uuid, bigint, boolean)') IS NULL THEN
        RAISE EXCEPTION 'ba-2 lockvolgorde: winkel_zet_klaargezet ontbreekt (migratie 20260928120100)';
    END IF;
    v_def := pg_get_functiondef('public.winkel_zet_klaargezet(uuid, bigint, boolean)'::REGPROCEDURE);
    IF v_def NOT LIKE '%WV006%' OR v_def NOT LIKE '%FULL JOIN geboekt g%' OR v_def NOT LIKE '%winkel_muteer_voorraad%' THEN
        RAISE EXCEPTION 'ba-2 lockvolgorde: winkel_zet_klaargezet is niet de versie uit 20260928120100; eerst vergelijken';
    END IF;

    IF to_regprocedure('public.winkel_doos_ophalen(uuid, text, text)') IS NULL THEN
        RAISE EXCEPTION 'ba-2 lockvolgorde: winkel_doos_ophalen ontbreekt (migratie 20260928130000)';
    END IF;
    v_def := pg_get_functiondef('public.winkel_doos_ophalen(uuid, text, text)'::REGPROCEDURE);
    IF v_def NOT LIKE '%regels_zonder_etiket%' OR v_def NOT LIKE '%rest_nodig%' OR v_def NOT LIKE '%winkel_zet_klaargezet%' THEN
        RAISE EXCEPTION 'ba-2 lockvolgorde: winkel_doos_ophalen is niet de versie uit 20260928130000; eerst vergelijken';
    END IF;
END $$;


-- ── 1. winkel_zet_klaargezet: eerst de order, dan de regel ──────────────────
-- Gelijk aan 20260928120100 §3, behalve het begin: order_id zonder lock lezen
-- (verandert nooit), dan de order (NO KEY UPDATE, en meteen de status), dan
-- de regel (FOR UPDATE). Wordt hij aangeroepen vanuit winkel_order_ophalen,
-- winkel_doos_ophalen of winkel_zet_order_apart, dan heeft die transactie de
-- order en de regel al; dan wacht hier niets.
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
    v_order_id  BIGINT;
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

    -- Lockvolgorde (20261005120100): order, dan regel.
    SELECT order_id INTO v_order_id FROM public.winkel_order_regels
     WHERE id = p_regel_id AND organization_id = p_org;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'regel % niet in deze organisatie', p_regel_id USING ERRCODE = 'P0002';
    END IF;
    SELECT status INTO v_status FROM public.winkel_orders WHERE id = v_order_id FOR NO KEY UPDATE;

    SELECT * INTO v_regel FROM public.winkel_order_regels
     WHERE id = p_regel_id AND organization_id = p_org
     FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'regel % niet in deze organisatie', p_regel_id USING ERRCODE = 'P0002';
    END IF;

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
REVOKE ALL ON FUNCTION public.winkel_zet_klaargezet(UUID, BIGINT, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.winkel_zet_klaargezet(UUID, BIGINT, BOOLEAN) TO authenticated, service_role;


-- ── 2. winkel_doos_ophalen: eerst de order, dan regel en doos ───────────────
-- Gelijk aan 20260928130000 §3, behalve het begin: de doos zonder lock
-- opzoeken (order_id en order_regel_id veranderen nooit), dan de order (NO
-- KEY UPDATE), de regel (FOR UPDATE) en pas dan de doos (FOR UPDATE).
CREATE OR REPLACE FUNCTION public.winkel_doos_ophalen(p_org UUID, p_code TEXT, p_rest_methode TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_uid      UUID := auth.uid();
    v_order_id BIGINT;
    v_regel_id BIGINT;
    v_doos     public.winkel_dozen%ROWTYPE;
    v_order    public.winkel_orders%ROWTYPE;
    v_regel    public.winkel_order_regels%ROWTYPE;
    v_open     INTEGER;
    v_zonder   INTEGER;
BEGIN
    IF v_uid IS NOT NULL AND p_org NOT IN (SELECT private.user_org_ids()) THEN
        RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
    END IF;

    -- Lockvolgorde (20261005120100): order, regel, doos.
    SELECT order_id, order_regel_id INTO v_order_id, v_regel_id
      FROM public.winkel_dozen WHERE organization_id = p_org AND code = btrim(p_code);
    IF NOT FOUND THEN
        RETURN jsonb_build_object('uitkomst', 'onbekend');
    END IF;
    SELECT * INTO v_order FROM public.winkel_orders WHERE id = v_order_id FOR NO KEY UPDATE;
    SELECT * INTO v_regel FROM public.winkel_order_regels WHERE id = v_regel_id FOR UPDATE;
    SELECT * INTO v_doos FROM public.winkel_dozen WHERE organization_id = p_org AND code = btrim(p_code) FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('uitkomst', 'onbekend');
    END IF;

    IF v_doos.opgehaald_at IS NOT NULL THEN
        RETURN jsonb_build_object('uitkomst', 'al_opgehaald', 'opgehaald_at', v_doos.opgehaald_at,
            'nummer', v_order.nummer, 'klant', v_order.contact_naam, 'doos', v_doos.omschrijving);
    END IF;
    IF v_order.status <> 'betaald' THEN
        RETURN jsonb_build_object('uitkomst', 'niet_betaald', 'status', v_order.status, 'nummer', v_order.nummer);
    END IF;

    IF v_order.betaalwijze = 'reservering' AND v_order.rest_cents > 0 AND v_order.rest_betaald_at IS NULL THEN
        IF p_rest_methode IS NULL OR p_rest_methode NOT IN ('contant', 'pin') THEN
            RETURN jsonb_build_object('uitkomst', 'rest_nodig', 'rest_cents', v_order.rest_cents,
                'reeds_cents', v_order.nu_te_betalen_cents, 'nummer', v_order.nummer, 'klant', v_order.contact_naam, 'doos', v_doos.omschrijving);
        END IF;
        UPDATE public.winkel_orders SET rest_betaald_at = now(), rest_betaalmethode = p_rest_methode WHERE id = v_order.id;
    END IF;

    IF v_regel.klaargezet_at IS NULL THEN
        PERFORM public.winkel_zet_klaargezet(p_org, v_regel.id, true);
    END IF;

    UPDATE public.winkel_dozen SET opgehaald_at = now(), opgehaald_door = v_uid WHERE id = v_doos.id;

    IF NOT EXISTS (SELECT 1 FROM public.winkel_dozen WHERE order_regel_id = v_regel.id AND opgehaald_at IS NULL) THEN
        UPDATE public.winkel_order_regels SET opgehaald_at = now(), opgehaald_door = v_uid WHERE id = v_regel.id;
    END IF;

    -- Wat de balie nog mist van deze order: ongescande dozen, en regels
    -- waarvoor nog geen etiket (dus geen doos) is geprint.
    SELECT count(*) INTO v_open FROM public.winkel_dozen WHERE order_id = v_order.id AND opgehaald_at IS NULL;
    SELECT count(*) INTO v_zonder FROM public.winkel_order_regels r
     WHERE r.order_id = v_order.id AND NOT EXISTS (SELECT 1 FROM public.winkel_dozen d WHERE d.order_regel_id = r.id);

    RETURN jsonb_build_object('uitkomst', 'opgehaald', 'nummer', v_order.nummer, 'klant', v_order.contact_naam,
        'doos', v_doos.omschrijving, 'volgnr', v_doos.volgnr, 'totaal', v_doos.totaal,
        'nog_open', v_open, 'regels_zonder_etiket', v_zonder,
        'rest_geboekt', CASE WHEN p_rest_methode IS NOT NULL AND v_order.betaalwijze = 'reservering' AND v_order.rest_betaald_at IS NULL THEN p_rest_methode ELSE NULL END);
END $$;
REVOKE ALL ON FUNCTION public.winkel_doos_ophalen(UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.winkel_doos_ophalen(UUID, TEXT, TEXT) TO authenticated, service_role;


-- ── 3. Zelfcontrole ─────────────────────────────────────────────────────────
DO $$
DECLARE
    v_sig    TEXT;
    v_def    TEXT;
    v_fouten TEXT := '';
BEGIN
    FOREACH v_sig IN ARRAY ARRAY[
        'public.winkel_order_ophalen(uuid, bigint, text, text, text, uuid, uuid)',
        'public.winkel_order_ophalen_terug(uuid, bigint)',
        'public.winkel_zet_klaargezet(uuid, bigint, boolean)',
        'public.winkel_doos_ophalen(uuid, text, text)'
    ]
    LOOP
        v_def := pg_get_functiondef(v_sig::REGPROCEDURE);
        IF v_def NOT LIKE '%FROM public.winkel_orders%FOR NO KEY UPDATE%' THEN
            v_fouten := v_fouten || E'\n  ' || v_sig || ' vergrendelt de order niet met FOR NO KEY UPDATE';
        END IF;
        IF has_function_privilege('anon', v_sig, 'EXECUTE') THEN
            v_fouten := v_fouten || E'\n  anon mag ' || v_sig;
        END IF;
        IF NOT has_function_privilege('authenticated', v_sig, 'EXECUTE') THEN
            v_fouten := v_fouten || E'\n  authenticated mist ' || v_sig;
        END IF;
        IF NOT has_function_privilege('service_role', v_sig, 'EXECUTE') THEN
            v_fouten := v_fouten || E'\n  service_role mist ' || v_sig;
        END IF;
    END LOOP;

    -- winkel_zet_klaargezet: de order vóór de regel.
    v_def := pg_get_functiondef('public.winkel_zet_klaargezet(uuid, bigint, boolean)'::REGPROCEDURE);
    IF position('FOR NO KEY UPDATE' IN v_def) = 0
       OR position('FOR NO KEY UPDATE' IN v_def) > position('FOR UPDATE;' IN v_def) THEN
        v_fouten := v_fouten || E'\n  winkel_zet_klaargezet vergrendelt de regel vóór de order';
    END IF;

    IF v_fouten <> '' THEN
        RAISE EXCEPTION 'ba-2 lockvolgorde: zelfcontrole mislukt, er is niets veranderd:%', v_fouten;
    END IF;
END $$;
