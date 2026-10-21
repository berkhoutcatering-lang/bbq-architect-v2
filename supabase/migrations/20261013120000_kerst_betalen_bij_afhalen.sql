-- ════════════════════════════════════════════════════════════════════════════
--  Kerst-Box: betalen bij afhalen ook echt afdwingen aan de balie
-- ════════════════════════════════════════════════════════════════════════════
--
--  Een Kerst-Box-order heeft betaalwijze 'bij_afhalen' (20261005110000): er
--  is online niets betaald, het hele bedrag staat als rest open. Maar
--  winkel_order_ophalen (BA-2) en winkel_doos_ophalen keken alleen naar
--  'reservering' als ze de rest controleerden. Een Kerst-Box kon dus via de
--  webshop-balie of een doosscan mee zonder dat iemand om geld vroeg.
--
--  Hier: dezelfde twee functies, met één verschil: de rest-controle geldt
--  voor 'reservering' én 'bij_afhalen'. Zonder p_rest_methode (contant of
--  pin) is de uitkomst dan 'rest_nodig' en gaat er niets mee; met een methode
--  wordt de rest in dezelfde transactie geboekt, net als bij een reservering.
--  Verder alles gelijk aan 20261005120000 §2 en 20261005120100 §2 (lock-
--  volgorde, uitkomsten, rechten).
--
--  src/lib/winkel/ophalen.ts (restOpen) volgt dezelfde regel, zodat het
--  scherm de stap "contant of pin" toont vóór het de database vraagt.
--
--  Let op voor M2 (feat/ecosysteem-m2, 20261007130000): die vervangt
--  winkel_doos_ophalen en heeft in toonbank_ophalen dezelfde
--  'reservering'-regel. Daar moet 'bij_afhalen' ook bij.
--
--  Toepassen: npx supabase db query --linked -f <dit bestand> (nooit db push).
--  Terugdraaien: 20261005120000 §2 en 20261005120100 §2 opnieuw draaien.


-- ── 0. Pre-flight ───────────────────────────────────────────────────────────
-- Alleen overschrijven wat we kennen: de versies uit M1. Staat er iets
-- anders (bijvoorbeeld al de M2-versie van winkel_doos_ophalen met een andere
-- handtekening), dan eerst vergelijken.
DO $$
DECLARE
    v_def TEXT;
BEGIN
    IF to_regprocedure('public.winkel_order_ophalen(uuid, bigint, text, text, text, uuid, uuid)') IS NULL THEN
        RAISE EXCEPTION 'kerst betalen: winkel_order_ophalen ontbreekt (20261005120000)';
    END IF;
    IF to_regprocedure('public.winkel_doos_ophalen(uuid, text, text)') IS NULL THEN
        RAISE EXCEPTION 'kerst betalen: winkel_doos_ophalen(uuid, text, text) ontbreekt (20261005120100)';
    END IF;
    IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public' AND p.proname IN ('winkel_order_ophalen', 'winkel_doos_ophalen')) <> 2 THEN
        RAISE EXCEPTION 'kerst betalen: er staat meer dan één versie van winkel_order_ophalen of winkel_doos_ophalen; eerst vergelijken';
    END IF;
    v_def := pg_get_functiondef('public.winkel_order_ophalen(uuid, bigint, text, text, text, uuid, uuid)'::REGPROCEDURE);
    IF v_def NOT LIKE '%v_rest_open := v_order.betaalwijze%' OR v_def NOT LIKE '%leeftijd_nodig%' OR v_def NOT LIKE '%winkel_zet_klaargezet%' THEN
        RAISE EXCEPTION 'kerst betalen: winkel_order_ophalen is niet de versie uit 20261005120000; eerst vergelijken';
    END IF;
    v_def := pg_get_functiondef('public.winkel_doos_ophalen(uuid, text, text)'::REGPROCEDURE);
    IF v_def NOT LIKE '%FOR NO KEY UPDATE%' OR v_def NOT LIKE '%regels_zonder_etiket%' OR v_def NOT LIKE '%rest_nodig%' THEN
        RAISE EXCEPTION 'kerst betalen: winkel_doos_ophalen is niet de versie uit 20261005120100; eerst vergelijken';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint con JOIN pg_class rel ON rel.oid = con.conrelid
                    WHERE rel.relname = 'winkel_orders' AND con.contype = 'c'
                      AND pg_get_constraintdef(con.oid) LIKE '%bij_afhalen%') THEN
        RAISE EXCEPTION 'kerst betalen: betaalwijze bij_afhalen bestaat niet (20261005110000)';
    END IF;
END $$;


-- ── 1. winkel_order_ophalen ─────────────────────────────────────────────────
-- Gelijk aan 20261005120000 §2, behalve v_rest_open: ook 'bij_afhalen'.
CREATE OR REPLACE FUNCTION public.winkel_order_ophalen(
    p_org            UUID,
    p_order_id       BIGINT,
    p_rest_methode   TEXT DEFAULT NULL,
    p_leeftijd       TEXT DEFAULT NULL,
    p_bron           TEXT DEFAULT 'ba',
    p_door_user_id   UUID DEFAULT NULL,
    p_medewerker_id  UUID DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_uid        UUID := COALESCE(auth.uid(), p_door_user_id);
    v_nu         TIMESTAMPTZ := now();
    v_order      public.winkel_orders%ROWTYPE;
    v_open       INTEGER;
    v_alcohol    BOOLEAN;
    v_rest_open  BOOLEAN;
    v_basis      JSONB;
    v_regel      BIGINT;
    v_r          JSONB;
    v_boekingen  JSONB := '[]'::JSONB;
    v_rest_geboekt TEXT;
BEGIN
    PERFORM private.vereis_org(p_org);

    IF p_rest_methode IS NOT NULL AND p_rest_methode NOT IN ('contant', 'pin') THEN
        RAISE EXCEPTION 'onbekende restbetaling "%": kies contant of pin', p_rest_methode USING ERRCODE = '22023';
    END IF;
    IF p_leeftijd IS NOT NULL AND p_leeftijd NOT IN ('vastgesteld', 'geweigerd') THEN
        RAISE EXCEPTION 'onbekende leeftijdsuitkomst "%": vastgesteld of geweigerd', p_leeftijd USING ERRCODE = '22023';
    END IF;
    IF p_bron IS NULL OR p_bron NOT IN ('ba', 'toonbank') THEN
        RAISE EXCEPTION 'onbekende bron "%": ba of toonbank', p_bron USING ERRCODE = '22023';
    END IF;
    IF p_medewerker_id IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM public.personeel WHERE id = p_medewerker_id AND organization_id = p_org) THEN
        RAISE EXCEPTION 'deze medewerker hoort niet bij deze organisatie' USING ERRCODE = '22023';
    END IF;

    -- Vergrendelen: eerst de order, dan de regels (id-volgorde), straks de
    -- producten (id-volgorde). Zie de lockvolgorde in
    -- 20261005120100_winkel_lockvolgorde.sql. FOR NO KEY UPDATE en niet
    -- FOR UPDATE: een logboekregel (winkel_voorraad_mutaties.order_id) of een
    -- doos die naar deze order verwijst, vraagt bij de insert een KEY SHARE
    -- op de order; die botst niet met NO KEY UPDATE, wel met FOR UPDATE.
    SELECT * INTO v_order FROM public.winkel_orders
     WHERE id = p_order_id AND organization_id = p_org
     FOR NO KEY UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('uitkomst', 'onbekend', 'order_id', p_order_id);
    END IF;
    PERFORM 1 FROM public.winkel_order_regels WHERE order_id = v_order.id ORDER BY id FOR UPDATE;
    PERFORM 1 FROM public.winkel_dozen WHERE order_id = v_order.id ORDER BY id FOR UPDATE;

    -- Wat nog mee moet: de regels die nog niet zijn opgehaald (een deel kan al
    -- via een doosscan zijn meegegeven).
    SELECT count(*) FILTER (WHERE opgehaald_at IS NULL),
           COALESCE(bool_or(alcohol) FILTER (WHERE opgehaald_at IS NULL), false)
      INTO v_open, v_alcohol
      FROM public.winkel_order_regels
     WHERE order_id = v_order.id;
    v_rest_open := v_order.betaalwijze IN ('reservering', 'bij_afhalen') AND v_order.rest_cents > 0 AND v_order.rest_betaald_at IS NULL;

    v_basis := jsonb_build_object(
        'order_id', v_order.id, 'nummer', v_order.nummer, 'klant', v_order.contact_naam,
        'nog_open', v_open, 'alcohol', v_alcohol,
        'rest_cents', CASE WHEN v_rest_open THEN v_order.rest_cents ELSE 0 END);

    IF v_order.status <> 'betaald' THEN
        RETURN v_basis || jsonb_build_object('uitkomst', 'niet_betaald', 'status', v_order.status);
    END IF;
    IF v_open = 0 THEN
        RETURN v_basis || jsonb_build_object('uitkomst', 'al_opgehaald',
            'opgehaald_at', (SELECT max(opgehaald_at) FROM public.winkel_order_regels WHERE order_id = v_order.id));
    END IF;
    IF p_leeftijd = 'geweigerd' THEN
        -- Alleen de weigering vastleggen: geen voorraad, geen rest, niet opgehaald.
        UPDATE public.winkel_orders
           SET leeftijd_geweigerd_at = v_nu, leeftijd_geweigerd_door = v_uid
         WHERE id = v_order.id AND organization_id = p_org;
        RETURN v_basis || jsonb_build_object('uitkomst', 'geweigerd', 'geweigerd_at', v_nu);
    END IF;
    IF v_rest_open AND p_rest_methode IS NULL THEN
        RETURN v_basis || jsonb_build_object('uitkomst', 'rest_nodig', 'reeds_cents', v_order.nu_te_betalen_cents);
    END IF;
    IF v_alcohol AND p_leeftijd IS NULL THEN
        RETURN v_basis || jsonb_build_object('uitkomst', 'leeftijd_nodig');
    END IF;

    -- De producten van wat nog ingepakt moet worden, in id-volgorde (zelfde
    -- volgorde als winkel_controleer_capaciteit en winkel_muteer_voorraad).
    PERFORM 1 FROM public.winkel_producten p
     WHERE p.id IN (SELECT c.product_id
                      FROM public.winkel_order_regel_componenten c
                      JOIN public.winkel_order_regels r ON r.id = c.order_regel_id
                     WHERE r.order_id = v_order.id
                       AND r.opgehaald_at IS NULL
                       AND r.klaargezet_at IS NULL
                       AND c.product_id IS NOT NULL)
     ORDER BY p.id
     FOR UPDATE OF p;

    -- Inpakken wat nog niet ingepakt is. Alles of niets: faalt één regel op
    -- WV001, dan draait dit blok terug en is er niets geboekt.
    BEGIN
        FOR v_regel IN
            SELECT id FROM public.winkel_order_regels
             WHERE order_id = v_order.id AND opgehaald_at IS NULL AND klaargezet_at IS NULL
             ORDER BY id
        LOOP
            v_r := public.winkel_zet_klaargezet(p_org, v_regel, true);
            v_boekingen := v_boekingen || COALESCE(v_r->'boekingen', '[]'::JSONB);
        END LOOP;
    EXCEPTION WHEN SQLSTATE 'WV001' THEN
        RETURN v_basis || jsonb_build_object('uitkomst', 'te_weinig_voorraad', 'melding', SQLERRM);
    END;

    -- De rest: zelfde regel als winkel_boek_rest, binnen deze organisatie.
    IF v_rest_open THEN
        UPDATE public.winkel_orders
           SET rest_betaald_at = v_nu, rest_betaalmethode = p_rest_methode
         WHERE id = v_order.id AND organization_id = p_org;
        v_rest_geboekt := p_rest_methode;
    END IF;

    UPDATE public.winkel_order_regels
       SET opgehaald_at            = v_nu,
           opgehaald_door          = v_uid,
           opgehaald_bron          = p_bron,
           opgehaald_medewerker_id = p_medewerker_id,
           leeftijd_vastgesteld_at = CASE WHEN alcohol AND p_leeftijd = 'vastgesteld' THEN v_nu ELSE leeftijd_vastgesteld_at END
     WHERE order_id = v_order.id AND opgehaald_at IS NULL;

    UPDATE public.winkel_dozen
       SET opgehaald_at = v_nu, opgehaald_door = v_uid
     WHERE order_id = v_order.id AND organization_id = p_org AND opgehaald_at IS NULL;

    RETURN v_basis || jsonb_build_object(
        'uitkomst', 'opgehaald',
        'opgehaald_at', v_nu,
        'nog_open', 0,
        'regels', v_open,
        'rest_geboekt', v_rest_geboekt,
        'leeftijd', CASE WHEN v_alcohol THEN p_leeftijd END,
        'boekingen', v_boekingen);
END $$;
COMMENT ON FUNCTION public.winkel_order_ophalen(UUID, BIGINT, TEXT, TEXT, TEXT, UUID, UUID) IS
    'BA-2: een webshoporder meegeven. Controleert betaald, al opgehaald, 18+ en rest (reservering en bij_afhalen, 20261013120000); pakt in wat nog niet ingepakt is (verkoop_online), boekt de rest en zet regels en dozen op opgehaald, alles in één transactie. Uitkomst: onbekend | niet_betaald | al_opgehaald | geweigerd | rest_nodig | leeftijd_nodig | te_weinig_voorraad | opgehaald.';
REVOKE ALL ON FUNCTION public.winkel_order_ophalen(UUID, BIGINT, TEXT, TEXT, TEXT, UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.winkel_order_ophalen(UUID, BIGINT, TEXT, TEXT, TEXT, UUID, UUID) TO authenticated, service_role;


-- ── 2. winkel_doos_ophalen ──────────────────────────────────────────────────
-- Gelijk aan 20261005120100 §2, behalve de rest-controle: ook 'bij_afhalen'.
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

    IF v_order.betaalwijze IN ('reservering', 'bij_afhalen') AND v_order.rest_cents > 0 AND v_order.rest_betaald_at IS NULL THEN
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
        'rest_geboekt', CASE WHEN p_rest_methode IS NOT NULL AND v_order.betaalwijze IN ('reservering', 'bij_afhalen') AND v_order.rest_betaald_at IS NULL THEN p_rest_methode ELSE NULL END);
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
        'public.winkel_doos_ophalen(uuid, text, text)'
    ]
    LOOP
        v_def := pg_get_functiondef(v_sig::REGPROCEDURE);
        IF v_def NOT LIKE '%''reservering'', ''bij_afhalen''%' THEN
            v_fouten := v_fouten || E'\n  ' || v_sig || ' controleert de rest niet bij bij_afhalen';
        END IF;
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
    IF v_fouten <> '' THEN
        RAISE EXCEPTION 'kerst betalen: zelfcontrole mislukt, er is niets veranderd:%', v_fouten;
    END IF;
END $$;
