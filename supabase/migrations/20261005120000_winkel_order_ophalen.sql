-- ════════════════════════════════════════════════════════════════════════════
--  BA-2 — ophaallek dichten: een order ophalen gaat via één databasefunctie
--  Plan v5, M1 · Contract: hopbites-toonbank/docs/datacontract-toonbank-v1.md
--  (§1.2 soort `ophalen`, §3.3 `POST orders/{order_id}/ophalen`)
--  Test: supabase/tests/winkel_ophalen.sql (alleen op de dev-database)
-- ════════════════════════════════════════════════════════════════════════════
--
--  Het lek
--    zetOpgehaald (src/app/verkoop/webshop/actions.ts) zette opgehaald_at met
--    twee losse UPDATEs, zonder te controleren of de order betaald was, of er
--    een rest openstond, of hij ingepakt was en of de 18+-check gedaan was.
--    Een regel die nooit ingepakt is, is nooit afgeboekt en blijft daardoor
--    voor altijd als gereserveerd meetellen in winkel_bezetting_product.
--
--  De fix
--    winkel_order_ophalen doet alles in één transactie, onder vergrendeling
--    (eerst de order, dan de regels, dan de producten in id-volgorde):
--      1. controleren, en bij een "nee" niets wijzigen maar een uitkomst
--         teruggeven, zodat het scherm (BA of de Toonbank) de volgende stap
--         kan tonen;
--      2. elke regel die nog niet ingepakt is alsnog inpakken via
--         winkel_zet_klaargezet (boekt verkoop_online, netto en idempotent);
--         te weinig voorraad (WV001) = uitkomst te_weinig_voorraad, en er is
--         niets geboekt;
--      3. de rest boeken (zelfde regel als winkel_boek_rest, maar binnen de
--         organisatie en in dezelfde transactie);
--      4. de regels en de dozen van de order op opgehaald zetten, met wie,
--         via welk scherm, welke medewerker en wanneer de leeftijd is
--         vastgesteld.
--
--    Uitkomsten, in deze volgorde gecontroleerd:
--      onbekend            order bestaat niet (in deze organisatie)
--      niet_betaald        status is niet betaald
--      al_opgehaald        alle regels zijn al opgehaald (idempotent)
--      geweigerd           p_leeftijd = 'geweigerd': niets gewijzigd; de
--                          klant krijgt de order niet mee (en betaalt dus
--                          ook geen rest). Daarom vóór rest_nodig.
--      rest_nodig          reservering met open rest en geen p_rest_methode
--      leeftijd_nodig      een regel met alcohol en geen p_leeftijd
--      te_weinig_voorraad  inpakken faalt op WV001; niets geboekt
--      opgehaald           meegegeven
--
--    winkel_order_ophalen_terug zet alleen de opgehaald-status terug, alleen
--    op dezelfde dag (Europe/Amsterdam) als het ophalen. De voorraad blijft
--    afgeboekt (het pakket is ingepakt) en een geboekte rest blijft geboekt
--    (het geld is ontvangen). Uitpakken gaat apart, via het vinkje.
--
--  Foutcodes: geen nieuwe. Ongeldige invoer (rest-methode, leeftijd, bron,
--  medewerker van een andere organisatie) = 22023.
--
--  Rechten: REVOKE van PUBLIC en anon, GRANT aan authenticated (BA-scherm,
--  zetOpgehaald) en service_role (straks de Toonbank-API, BA-10). De
--  org-check is private.vereis_org (migratie 20261003150000).


-- ── 0. Pre-flight ───────────────────────────────────────────────────────────
DO $$
BEGIN
    IF to_regprocedure('private.vereis_org(uuid)') IS NULL THEN
        RAISE EXCEPTION 'ba-2: private.vereis_org ontbreekt (migratie 20261003150000_winkel_functies_niet_voor_anon)';
    END IF;
    IF to_regprocedure('public.winkel_zet_klaargezet(uuid, bigint, boolean)') IS NULL THEN
        RAISE EXCEPTION 'ba-2: winkel_zet_klaargezet ontbreekt (migratie 20260928120100)';
    END IF;
    IF to_regclass('public.winkel_dozen') IS NULL THEN
        RAISE EXCEPTION 'ba-2: winkel_dozen ontbreekt (migratie 20260928130000)';
    END IF;
    IF to_regclass('public.personeel') IS NULL THEN
        RAISE EXCEPTION 'ba-2: personeel ontbreekt (migratie 031_team_uren)';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'winkel_order_regels' AND column_name = 'opgehaald_at') THEN
        RAISE EXCEPTION 'ba-2: winkel_order_regels.opgehaald_at ontbreekt (migratie 20260928120100)';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'winkel_order_regels' AND column_name = 'alcohol') THEN
        RAISE EXCEPTION 'ba-2: winkel_order_regels.alcohol ontbreekt (migratie 20260927120000)';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'winkel_orders' AND column_name = 'rest_betaald_at') THEN
        RAISE EXCEPTION 'ba-2: winkel_orders.rest_betaald_at ontbreekt (migratie 20260927120000)';
    END IF;
END $$;


-- ── 1. Kolommen op winkel_order_regels ──────────────────────────────────────
ALTER TABLE public.winkel_order_regels
    ADD COLUMN IF NOT EXISTS leeftijd_vastgesteld_at  TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS opgehaald_bron           TEXT,
    ADD COLUMN IF NOT EXISTS opgehaald_medewerker_id  UUID REFERENCES public.personeel(id) ON DELETE SET NULL;

ALTER TABLE public.winkel_order_regels DROP CONSTRAINT IF EXISTS winkel_order_regels_opgehaald_bron_check;
ALTER TABLE public.winkel_order_regels ADD CONSTRAINT winkel_order_regels_opgehaald_bron_check
    CHECK (opgehaald_bron IS NULL OR opgehaald_bron IN ('ba', 'toonbank'));

CREATE INDEX IF NOT EXISTS winkel_order_regels_opgehaald_medewerker_idx
    ON public.winkel_order_regels(opgehaald_medewerker_id) WHERE opgehaald_medewerker_id IS NOT NULL;

COMMENT ON COLUMN public.winkel_order_regels.leeftijd_vastgesteld_at IS
    '18+: wanneer aan de balie de leeftijd is vastgesteld ("ID gezien"). Alleen bij regels met alcohol, gezet door winkel_order_ophalen.';
COMMENT ON COLUMN public.winkel_order_regels.opgehaald_bron IS
    'Via welk scherm de regel is meegegeven: ba (webshopbeheer) of toonbank. Leeg bij een doosscan of bij oude regels.';
COMMENT ON COLUMN public.winkel_order_regels.opgehaald_medewerker_id IS
    'De medewerker (personeel) die de order meegaf. Op de Toonbank de ingelogde medewerker; in BA leeg (dan staat de gebruiker in opgehaald_door).';


-- ── 2. winkel_order_ophalen ─────────────────────────────────────────────────
-- p_rest_methode   contant | pin; alleen nodig bij een reservering met open rest
-- p_leeftijd       vastgesteld | geweigerd; alleen nodig als er alcohol in zit
-- p_bron           ba | toonbank
-- p_door_user_id   wie, als er geen ingelogde gebruiker is (service_role)
-- p_medewerker_id  personeel.id van wie het meegaf (Toonbank)
--
-- Geeft altijd {uitkomst, order_id, nummer, ...}; alleen bij 'opgehaald' is
-- er iets gewijzigd. Bij 'opgehaald' ook {opgehaald_at, rest_geboekt,
-- boekingen: [{product_id, hoeveelheid, voorraad}]}.
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

    -- Vergrendelen: eerst de order, dan de regels (id-volgorde), straks de producten.
    SELECT * INTO v_order FROM public.winkel_orders
     WHERE id = p_order_id AND organization_id = p_org
     FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('uitkomst', 'onbekend', 'order_id', p_order_id);
    END IF;
    PERFORM 1 FROM public.winkel_order_regels WHERE order_id = v_order.id ORDER BY id FOR UPDATE;

    -- Wat nog mee moet: de regels die nog niet zijn opgehaald (een deel kan al
    -- via een doosscan zijn meegegeven).
    SELECT count(*) FILTER (WHERE opgehaald_at IS NULL),
           COALESCE(bool_or(alcohol) FILTER (WHERE opgehaald_at IS NULL), false)
      INTO v_open, v_alcohol
      FROM public.winkel_order_regels
     WHERE order_id = v_order.id;
    v_rest_open := v_order.betaalwijze = 'reservering' AND v_order.rest_cents > 0 AND v_order.rest_betaald_at IS NULL;

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
        RETURN v_basis || jsonb_build_object('uitkomst', 'geweigerd');
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
    'BA-2: een webshoporder meegeven. Controleert betaald, al opgehaald, 18+ en rest; pakt in wat nog niet ingepakt is (verkoop_online), boekt de rest en zet regels en dozen op opgehaald, alles in één transactie. Uitkomst: onbekend | niet_betaald | al_opgehaald | geweigerd | rest_nodig | leeftijd_nodig | te_weinig_voorraad | opgehaald.';
REVOKE ALL ON FUNCTION public.winkel_order_ophalen(UUID, BIGINT, TEXT, TEXT, TEXT, UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.winkel_order_ophalen(UUID, BIGINT, TEXT, TEXT, TEXT, UUID, UUID) TO authenticated, service_role;


-- ── 3. winkel_order_ophalen_terug ───────────────────────────────────────────
-- Een vergissing aan de balie herstellen: alleen de opgehaald-status terug,
-- alleen op dezelfde dag (Europe/Amsterdam). Geen voorraadwijziging; de rest
-- blijft geboekt.
-- Uitkomst: onbekend | niet_opgehaald | niet_zelfde_dag | teruggezet.
CREATE OR REPLACE FUNCTION public.winkel_order_ophalen_terug(
    p_org       UUID,
    p_order_id  BIGINT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_order    public.winkel_orders%ROWTYPE;
    v_vandaag  DATE := (now() AT TIME ZONE 'Europe/Amsterdam')::DATE;
    v_aantal   INTEGER;
    v_eerder   INTEGER;
    v_dozen    INTEGER;
BEGIN
    PERFORM private.vereis_org(p_org);

    SELECT * INTO v_order FROM public.winkel_orders
     WHERE id = p_order_id AND organization_id = p_org
     FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('uitkomst', 'onbekend', 'order_id', p_order_id);
    END IF;
    PERFORM 1 FROM public.winkel_order_regels WHERE order_id = v_order.id ORDER BY id FOR UPDATE;

    SELECT count(*) FILTER (WHERE opgehaald_at IS NOT NULL),
           count(*) FILTER (WHERE opgehaald_at IS NOT NULL AND (opgehaald_at AT TIME ZONE 'Europe/Amsterdam')::DATE <> v_vandaag)
      INTO v_aantal, v_eerder
      FROM public.winkel_order_regels
     WHERE order_id = v_order.id;

    IF v_aantal = 0 THEN
        RETURN jsonb_build_object('uitkomst', 'niet_opgehaald', 'order_id', v_order.id, 'nummer', v_order.nummer);
    END IF;
    IF v_eerder > 0 THEN
        RETURN jsonb_build_object('uitkomst', 'niet_zelfde_dag', 'order_id', v_order.id, 'nummer', v_order.nummer,
            'opgehaald_at', (SELECT max(opgehaald_at) FROM public.winkel_order_regels WHERE order_id = v_order.id));
    END IF;

    UPDATE public.winkel_order_regels
       SET opgehaald_at = NULL, opgehaald_door = NULL, opgehaald_bron = NULL,
           opgehaald_medewerker_id = NULL, leeftijd_vastgesteld_at = NULL
     WHERE order_id = v_order.id AND opgehaald_at IS NOT NULL;

    UPDATE public.winkel_dozen
       SET opgehaald_at = NULL, opgehaald_door = NULL
     WHERE order_id = v_order.id AND organization_id = p_org
       AND opgehaald_at IS NOT NULL
       AND (opgehaald_at AT TIME ZONE 'Europe/Amsterdam')::DATE = v_vandaag;
    GET DIAGNOSTICS v_dozen = ROW_COUNT;

    RETURN jsonb_build_object('uitkomst', 'teruggezet', 'order_id', v_order.id, 'nummer', v_order.nummer,
        'regels', v_aantal, 'dozen', v_dozen);
END $$;
COMMENT ON FUNCTION public.winkel_order_ophalen_terug(UUID, BIGINT) IS
    'BA-2: opgehaald ongedaan maken, alleen op dezelfde dag (Europe/Amsterdam). Alleen status: voorraad en rest blijven staan. Uitkomst: onbekend | niet_opgehaald | niet_zelfde_dag | teruggezet.';
REVOKE ALL ON FUNCTION public.winkel_order_ophalen_terug(UUID, BIGINT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.winkel_order_ophalen_terug(UUID, BIGINT) TO authenticated, service_role;


-- ── 4. Zelfcontrole ─────────────────────────────────────────────────────────
DO $$
DECLARE
    v_sig    TEXT;
    v_fouten TEXT := '';
BEGIN
    FOREACH v_sig IN ARRAY ARRAY[
        'public.winkel_order_ophalen(uuid, bigint, text, text, text, uuid, uuid)',
        'public.winkel_order_ophalen_terug(uuid, bigint)'
    ]
    LOOP
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
        RAISE EXCEPTION 'ba-2: zelfcontrole mislukt, er is niets veranderd:%', v_fouten;
    END IF;
END $$;
