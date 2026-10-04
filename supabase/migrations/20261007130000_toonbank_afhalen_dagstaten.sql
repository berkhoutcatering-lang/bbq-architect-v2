-- ════════════════════════════════════════════════════════════════════════════
--  BA-10 — Toonbank: ophalen (order en doos), de rest met org-check, en de
--  dagstaten met narekening
--  Plan v5 §M2 (BA-10) · Contract toonbank/v1 §1.2, §1.3 (de btw-regel), §1.5,
--  §2 (winkel_doos_ophalen, winkel_boek_rest), §3.3 (orders/{id}/ophalen,
--  dozen/{code}/ophalen, GET dagstaat, POST dagstaten), §4.1
--  Tests: supabase/tests/toonbank_ophalen.sql en toonbank_dagstaat.sql
--         (alleen op de dev-database)
-- ════════════════════════════════════════════════════════════════════════════
--
--  Ophalen (vragen, alleen online; contract §3.2: elke uitkomst is een 200)
--    toonbank_ophaal_vraag(…)  POST orders/{order_id}/ophalen via
--        winkel_order_ophalen (BA-2, bron 'toonbank', de medewerker), en
--        POST dozen/{code}/ophalen via de vernieuwde winkel_doos_ophalen.
--        Verzoek en uitkomst gaan in het journaal (soort ophalen of
--        doos_ophalen), idempotent op gebeurtenis_id. Review M7: het
--        restbedrag van de tablet wordt vóór de aanroep vergeleken met de open
--        rest; wijkt het af, dan wordt er niets geboekt en is de uitkomst
--        rest_nodig met het juiste bedrag. Stuurt de tablet een rest terwijl
--        er niets meer open staat, dan wordt er geen rest geboekt en komt de
--        bon met die order_rest-regel in "Te controleren" (dubbel betaald).
--    winkel_orders.rest_bon_id      met welke Toonbank-bon de rest betaald is
--    winkel_dozen.opgehaald_bon_id, opgehaald_medewerker_id
--
--  winkel_doos_ophalen, vernieuwd (DROP + CREATE, één versie)
--    + p_leeftijd (vastgesteld | geweigerd), p_medewerker_id, p_bon_id.
--    Uitkomsten, in deze volgorde: onbekend, al_opgehaald, niet_betaald,
--    geweigerd (alleen vastgelegd, zoals BA-2), rest_nodig, leeftijd_nodig
--    (alcohol in de regel van de doos en geen vaststelling),
--    te_weinig_voorraad (inpakken faalt op WV001: niets geboekt, ook geen
--    rest), opgehaald. Het inpakken gaat nu vóór de rest; zo boekt een
--    mislukte doos ook geen rest (contract §2, "besluit nodig": een doos met
--    te weinig voorraad wordt geweigerd, net als apart zetten).
--    Lockvolgorde behouden: order (NO KEY UPDATE) → regel → doos →
--    producten (via winkel_zet_klaargezet) → logboek.
--
--  winkel_boek_rest, vernieuwd: + p_org (vereis_org, alleen de eigen order),
--    + p_bon_id; SECURITY DEFINER; de order met FOR NO KEY UPDATE. De oude
--    (p_order_id, p_methode) bestaat daarna niet meer; de aanroeper in BA
--    (boekRestBetaling, src/lib/winkel/supabaseStore.ts) geeft p_org mee.
--
--  Dagstaten (contract §1.5)
--    toonbank_dagstaten           één rij per afgesloten dag per tablet; de
--                                 velden van de tablet veranderen nooit meer,
--                                 alleen status, narekening en goedkeuring.
--    toonbank_dagstaat_herberekenen(p_org, p_dagstaat_id)
--                                 de bonnen van die tablet en die dag (tot het
--                                 sluiten) krijgen dagstaat_id; BBQ Architect
--                                 rekent na: per tarief de som van de bon-btw,
--                                 zonder opnieuw af te ronden (de btw-regel),
--                                 en zet de verschillen met de tablet vast.
--                                 Verschillen → het journaal op conflict ("Te
--                                 controleren"); weg → weer verwerkt.
--    toonbank_dagstaat_overzicht  GET dagstaat?datum
--    toonbank_dagstaat_goedkeuren een groot verschil achteraf goedkeuren
--                                 (Admin); blokkeert het afsluiten nooit.
--    De verdeler (private.toonbank_verwerk_melding) verwerkt nu ook
--    'dagstaat'; de wachtrij rekent een dagstaat opnieuw na als er later nog
--    een bon van die dag binnenkomt (status 'aangevuld').
--
--  private.toonbank_controleer_order_rest kent nu winkel_orders.rest_bon_id:
--  een rest die met deze bon betaald is, is geen dubbele betaling.


-- ── 0. Pre-flight ───────────────────────────────────────────────────────────
DO $$
DECLARE
    v_sig       TEXT;
    v_def       TEXT;
    v_ontbreekt TEXT := '';
BEGIN
    FOREACH v_sig IN ARRAY ARRAY[
        'private.vereis_org(uuid)',
        'public.winkel_order_ophalen(uuid, bigint, text, text, text, uuid, uuid)',
        'public.winkel_zet_klaargezet(uuid, bigint, boolean)',
        'public.toonbank_boek_bon(bigint)',
        'public.toonbank_verwerk_wachtrij(uuid, uuid)',
        'private.toonbank_verwerk_melding(bigint, boolean)',
        'private.toonbank_controleer_order_rest(uuid, uuid)',
        'private.toonbank_btw_uit_incl(bigint, integer)',
        'private.toonbank_vergrendel_wachtrij(uuid, uuid)', 'private.toonbank_melding_mislukt(bigint, text, text)',
        'private.tb_uuid(text)', 'private.tb_int(jsonb)', 'private.tb_tijd(text)'
    ] LOOP
        IF to_regprocedure(v_sig) IS NULL THEN
            v_ontbreekt := v_ontbreekt || E'\n  functie ' || v_sig;
        END IF;
    END LOOP;
    FOREACH v_sig IN ARRAY ARRAY['public.toonbank_bonnen', 'public.toonbank_journaal', 'public.winkel_dozen', 'public.winkel_orders'] LOOP
        IF to_regclass(v_sig) IS NULL THEN
            v_ontbreekt := v_ontbreekt || E'\n  tabel ' || v_sig;
        END IF;
    END LOOP;
    IF v_ontbreekt <> '' THEN
        RAISE EXCEPTION 'toonbank_afhalen_dagstaten: dit ontbreekt (eerst BA-2 en BA-9):%', v_ontbreekt;
    END IF;

    -- Alleen de versies uit de repo vervangen.
    IF to_regprocedure('public.winkel_doos_ophalen(uuid, text, text)') IS NULL THEN
        RAISE EXCEPTION 'toonbank_afhalen_dagstaten: winkel_doos_ophalen(uuid, text, text) ontbreekt (20261005120100)';
    END IF;
    v_def := pg_get_functiondef('public.winkel_doos_ophalen(uuid, text, text)'::REGPROCEDURE);
    IF v_def NOT LIKE '%FOR NO KEY UPDATE%' OR v_def NOT LIKE '%regels_zonder_etiket%' OR v_def NOT LIKE '%rest_nodig%' THEN
        RAISE EXCEPTION 'toonbank_afhalen_dagstaten: winkel_doos_ophalen is niet de versie uit 20261005120100; eerst vergelijken';
    END IF;
    IF to_regprocedure('public.winkel_boek_rest(bigint, text)') IS NULL THEN
        RAISE EXCEPTION 'toonbank_afhalen_dagstaten: winkel_boek_rest(bigint, text) ontbreekt (20260927120000)';
    END IF;
    v_def := pg_get_functiondef('public.winkel_boek_rest(bigint, text)'::REGPROCEDURE);
    IF v_def NOT LIKE '%al_geboekt%' OR v_def NOT LIKE '%geen_rest%' THEN
        RAISE EXCEPTION 'toonbank_afhalen_dagstaten: winkel_boek_rest is niet de versie uit 20260927120000; eerst vergelijken';
    END IF;
    IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public' AND p.proname IN ('winkel_doos_ophalen', 'winkel_boek_rest')) <> 2 THEN
        RAISE EXCEPTION 'toonbank_afhalen_dagstaten: er bestaan meer versies van winkel_doos_ophalen of winkel_boek_rest; eerst opruimen';
    END IF;
    IF to_regclass('public.toonbank_dagstaten') IS NOT NULL THEN
        RAISE EXCEPTION 'toonbank_afhalen_dagstaten: toonbank_dagstaten bestaat al; eerst nakijken';
    END IF;
END $$;


-- ── 1. Kolommen ─────────────────────────────────────────────────────────────
-- Geen foreign key naar toonbank_bonnen: de rest wordt geboekt bij het
-- ophalen, en de bon met de order_rest-regel kan pas daarna binnenkomen.
ALTER TABLE public.winkel_orders
    ADD COLUMN IF NOT EXISTS rest_bon_id UUID;
COMMENT ON COLUMN public.winkel_orders.rest_bon_id IS
    'De Toonbank-bon waarop de rest betaald is (order_rest-regel). Leeg bij een rest die in BA is geboekt. De omzet blijft bij de order: de bon telt hem niet als omzet.';

ALTER TABLE public.winkel_dozen
    ADD COLUMN IF NOT EXISTS opgehaald_bon_id        UUID,
    ADD COLUMN IF NOT EXISTS opgehaald_medewerker_id UUID REFERENCES public.personeel(id) ON DELETE SET NULL;
COMMENT ON COLUMN public.winkel_dozen.opgehaald_bon_id IS 'De Toonbank-bon met de rest van deze order, als die bij deze doos betaald werd.';
COMMENT ON COLUMN public.winkel_dozen.opgehaald_medewerker_id IS 'Wie de doos aan de Toonbank meegaf (personeel).';


-- ── 2. winkel_boek_rest met p_org ───────────────────────────────────────────
DROP FUNCTION public.winkel_boek_rest(BIGINT, TEXT);

CREATE FUNCTION public.winkel_boek_rest(
    p_org       UUID,
    p_order_id  BIGINT,
    p_methode   TEXT,
    p_bon_id    UUID DEFAULT NULL
) RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_order public.winkel_orders%ROWTYPE;
BEGIN
    PERFORM private.vereis_org(p_org);

    -- Lockvolgorde (20261005120100): de order met NO KEY UPDATE.
    SELECT * INTO v_order FROM public.winkel_orders
     WHERE id = p_order_id AND organization_id = p_org
       FOR NO KEY UPDATE;
    IF NOT FOUND THEN RETURN 'onbekend'; END IF;
    IF v_order.status <> 'betaald' THEN RETURN 'niet_betaald'; END IF;
    IF v_order.rest_betaald_at IS NOT NULL THEN RETURN 'al_geboekt'; END IF;
    IF v_order.rest_cents = 0 THEN RETURN 'geen_rest'; END IF;
    IF p_methode IS NULL OR p_methode NOT IN ('contant', 'pin') THEN RETURN 'onbekende_methode'; END IF;
    UPDATE public.winkel_orders
       SET rest_betaald_at = now(), rest_betaalmethode = p_methode, rest_bon_id = p_bon_id
     WHERE id = v_order.id;
    RETURN 'geboekt';
END $$;
COMMENT ON FUNCTION public.winkel_boek_rest(UUID, BIGINT, TEXT, UUID) IS
    'De balie boekt het restbedrag (S5, BA-10): alleen een order van p_org (vereis_org), idempotent. Uitkomst: onbekend | niet_betaald | al_geboekt | geen_rest | onbekende_methode | geboekt.';
REVOKE ALL ON FUNCTION public.winkel_boek_rest(UUID, BIGINT, TEXT, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.winkel_boek_rest(UUID, BIGINT, TEXT, UUID) TO authenticated, service_role;


-- ── 3. winkel_doos_ophalen, vernieuwd ───────────────────────────────────────
DROP FUNCTION public.winkel_doos_ophalen(UUID, TEXT, TEXT);

CREATE FUNCTION public.winkel_doos_ophalen(
    p_org            UUID,
    p_code           TEXT,
    p_rest_methode   TEXT DEFAULT NULL,
    p_leeftijd       TEXT DEFAULT NULL,
    p_medewerker_id  UUID DEFAULT NULL,
    p_bon_id         UUID DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_uid       UUID := auth.uid();
    v_nu        TIMESTAMPTZ := now();
    v_order_id  BIGINT;
    v_regel_id  BIGINT;
    v_doos      public.winkel_dozen%ROWTYPE;
    v_order     public.winkel_orders%ROWTYPE;
    v_regel     public.winkel_order_regels%ROWTYPE;
    v_rest_open BOOLEAN;
    v_basis     JSONB;
    v_r         JSONB;
    v_boekingen JSONB := '[]'::JSONB;
    v_rest      TEXT;
    v_open      INTEGER;
    v_zonder    INTEGER;
BEGIN
    PERFORM private.vereis_org(p_org);

    IF p_rest_methode IS NOT NULL AND p_rest_methode NOT IN ('contant', 'pin') THEN
        RAISE EXCEPTION 'onbekende restbetaling "%": kies contant of pin', p_rest_methode USING ERRCODE = '22023';
    END IF;
    IF p_leeftijd IS NOT NULL AND p_leeftijd NOT IN ('vastgesteld', 'geweigerd') THEN
        RAISE EXCEPTION 'onbekende leeftijdsuitkomst "%": vastgesteld of geweigerd', p_leeftijd USING ERRCODE = '22023';
    END IF;
    IF p_medewerker_id IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM public.personeel WHERE id = p_medewerker_id AND organization_id = p_org) THEN
        RAISE EXCEPTION 'deze medewerker hoort niet bij deze organisatie' USING ERRCODE = '22023';
    END IF;

    -- Lockvolgorde (20261005120100): order, regel, doos (de sleutels veranderen nooit).
    SELECT order_id, order_regel_id INTO v_order_id, v_regel_id
      FROM public.winkel_dozen WHERE organization_id = p_org AND code = lower(btrim(p_code));
    IF NOT FOUND THEN
        RETURN jsonb_build_object('uitkomst', 'onbekend', 'code', left(btrim(COALESCE(p_code, '')), 200));
    END IF;
    SELECT * INTO v_order FROM public.winkel_orders WHERE id = v_order_id FOR NO KEY UPDATE;
    SELECT * INTO v_regel FROM public.winkel_order_regels WHERE id = v_regel_id FOR UPDATE;
    SELECT * INTO v_doos FROM public.winkel_dozen WHERE organization_id = p_org AND code = lower(btrim(p_code)) FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('uitkomst', 'onbekend', 'code', left(btrim(COALESCE(p_code, '')), 200));
    END IF;

    v_rest_open := v_order.betaalwijze = 'reservering' AND v_order.rest_cents > 0 AND v_order.rest_betaald_at IS NULL;
    SELECT count(*) INTO v_open FROM public.winkel_dozen WHERE order_id = v_order.id AND opgehaald_at IS NULL;
    v_basis := jsonb_build_object(
        'order_id', v_order.id, 'nummer', v_order.nummer, 'klant', v_order.contact_naam, 'code', v_doos.code,
        'doos', v_doos.omschrijving, 'volgnr', v_doos.volgnr, 'totaal', v_doos.totaal,
        'alcohol', COALESCE(v_regel.alcohol, false), 'nog_open', v_open,
        'rest_cents', CASE WHEN v_rest_open THEN v_order.rest_cents ELSE 0 END);

    IF v_doos.opgehaald_at IS NOT NULL THEN
        RETURN v_basis || jsonb_build_object('uitkomst', 'al_opgehaald', 'opgehaald_at', v_doos.opgehaald_at);
    END IF;
    IF v_order.status <> 'betaald' THEN
        RETURN v_basis || jsonb_build_object('uitkomst', 'niet_betaald', 'status', v_order.status);
    END IF;
    IF p_leeftijd = 'geweigerd' THEN
        -- Alleen vastleggen, zoals winkel_order_ophalen: geen voorraad, geen rest, niets mee.
        UPDATE public.winkel_orders SET leeftijd_geweigerd_at = v_nu, leeftijd_geweigerd_door = v_uid WHERE id = v_order.id;
        RETURN v_basis || jsonb_build_object('uitkomst', 'geweigerd', 'geweigerd_at', v_nu);
    END IF;
    IF v_rest_open AND p_rest_methode IS NULL THEN
        RETURN v_basis || jsonb_build_object('uitkomst', 'rest_nodig', 'reeds_cents', v_order.nu_te_betalen_cents);
    END IF;
    IF COALESCE(v_regel.alcohol, false) AND p_leeftijd IS NULL THEN
        RETURN v_basis || jsonb_build_object('uitkomst', 'leeftijd_nodig');
    END IF;

    -- Eerst inpakken (producten in id-volgorde, in winkel_zet_klaargezet). Te
    -- weinig voorraad: niets geboekt, ook geen rest.
    IF v_regel.klaargezet_at IS NULL THEN
        BEGIN
            v_r := public.winkel_zet_klaargezet(p_org, v_regel.id, true);
            v_boekingen := COALESCE(v_r->'boekingen', '[]'::JSONB);
        EXCEPTION WHEN SQLSTATE 'WV001' THEN
            RETURN v_basis || jsonb_build_object('uitkomst', 'te_weinig_voorraad', 'melding', SQLERRM);
        END;
    END IF;

    -- Dan de rest (met de bon, als die van de Toonbank komt).
    IF v_rest_open THEN
        UPDATE public.winkel_orders
           SET rest_betaald_at = v_nu, rest_betaalmethode = p_rest_methode, rest_bon_id = p_bon_id
         WHERE id = v_order.id;
        v_rest := p_rest_methode;
    END IF;

    UPDATE public.winkel_dozen
       SET opgehaald_at = v_nu, opgehaald_door = v_uid,
           opgehaald_bon_id = CASE WHEN v_rest IS NOT NULL THEN p_bon_id END,
           opgehaald_medewerker_id = p_medewerker_id
     WHERE id = v_doos.id;

    IF COALESCE(v_regel.alcohol, false) AND p_leeftijd = 'vastgesteld' THEN
        UPDATE public.winkel_order_regels SET leeftijd_vastgesteld_at = COALESCE(leeftijd_vastgesteld_at, v_nu) WHERE id = v_regel.id;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.winkel_dozen WHERE order_regel_id = v_regel.id AND opgehaald_at IS NULL) THEN
        UPDATE public.winkel_order_regels
           SET opgehaald_at = v_nu, opgehaald_door = v_uid,
               opgehaald_bron = CASE WHEN p_medewerker_id IS NOT NULL THEN 'toonbank' ELSE 'ba' END,
               opgehaald_medewerker_id = p_medewerker_id
         WHERE id = v_regel.id;
    END IF;

    -- Wat de balie nog mist van deze order: ongescande dozen, en regels
    -- waarvoor nog geen etiket (dus geen doos) is geprint.
    SELECT count(*) INTO v_open FROM public.winkel_dozen WHERE order_id = v_order.id AND opgehaald_at IS NULL;
    SELECT count(*) INTO v_zonder FROM public.winkel_order_regels r
     WHERE r.order_id = v_order.id AND NOT EXISTS (SELECT 1 FROM public.winkel_dozen d WHERE d.order_regel_id = r.id);

    RETURN v_basis || jsonb_build_object('uitkomst', 'opgehaald', 'opgehaald_at', v_nu,
        'nog_open', v_open, 'regels_zonder_etiket', v_zonder, 'rest_geboekt', v_rest,
        'leeftijd', CASE WHEN COALESCE(v_regel.alcohol, false) THEN p_leeftijd END, 'boekingen', v_boekingen);
END $$;
COMMENT ON FUNCTION public.winkel_doos_ophalen(UUID, TEXT, TEXT, TEXT, UUID, UUID) IS
    'Een doos meegeven (S7, BA-10): betaald, al opgehaald, 18+ (leeftijd_nodig/geweigerd), rest; pakt de regel in als dat nog niet gebeurd was (te_weinig_voorraad = niets geboekt), boekt de rest (met de bon) en zet de doos op opgehaald, met de medewerker. Lockvolgorde order → regel → doos → producten.';
REVOKE ALL ON FUNCTION public.winkel_doos_ophalen(UUID, TEXT, TEXT, TEXT, UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.winkel_doos_ophalen(UUID, TEXT, TEXT, TEXT, UUID, UUID) TO authenticated, service_role;


-- ── 4. order_rest op een bon kent nu rest_bon_id ────────────────────────────
CREATE OR REPLACE FUNCTION private.toonbank_controleer_order_rest(p_org UUID, p_bon_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
    v_r      RECORD;
    v_order  public.winkel_orders%ROWTYPE;
    v_uit    JSONB := '[]'::JSONB;
BEGIN
    FOR v_r IN SELECT regelnr, order_id, bedrag_cents FROM public.toonbank_bon_regels
                WHERE bon_id = p_bon_id AND soort = 'order_rest' ORDER BY regelnr LOOP
        SELECT * INTO v_order FROM public.winkel_orders WHERE id = v_r.order_id AND organization_id = p_org;
        IF NOT FOUND THEN
            v_uit := v_uit || jsonb_build_object('code', 'order_onbekend', 'melding', format('Regel %s: restbetaling op order %s, die niet bestaat.', v_r.regelnr, v_r.order_id));
        ELSIF v_order.rest_betaald_at IS NOT NULL AND v_order.rest_bon_id IS DISTINCT FROM p_bon_id THEN
            v_uit := v_uit || jsonb_build_object('code', 'rest_dubbel', 'melding', format('Regel %s: de rest van %s was al betaald (%s%s). Dubbel betaald?',
                v_r.regelnr, v_order.nummer, COALESCE(v_order.rest_betaalmethode, '?'), CASE WHEN v_order.rest_bon_id IS NULL THEN ', in BBQ Architect' ELSE ', op een andere bon' END));
        ELSIF v_order.rest_betaald_at IS NULL AND v_r.bedrag_cents <> v_order.rest_cents THEN
            v_uit := v_uit || jsonb_build_object('code', 'rest_bedrag', 'melding', format('Regel %s: rest %s ct op de bon, de order %s vraagt %s ct.', v_r.regelnr, v_r.bedrag_cents, v_order.nummer, v_order.rest_cents));
        END IF;
    END LOOP;
    RETURN v_uit;
END $$;
REVOKE ALL ON FUNCTION private.toonbank_controleer_order_rest(UUID, UUID) FROM PUBLIC, anon, authenticated, service_role;


-- ── 5. toonbank_ophaal_vraag ────────────────────────────────────────────────
-- p_soort 'order' (p_order_id) of 'doos' (p_code). p_rest_bedrag_cents: het
-- bedrag dat de tablet als rest op de bon zette (NULL = geen rest).
-- Geeft {journaal: nieuw|bestond, soort, payload, resultaat}; resultaat is
-- de uitkomst van winkel_order_ophalen of winkel_doos_ophalen, met
-- rest_dubbel = true als de tablet een rest stuurde die al betaald was.
CREATE OR REPLACE FUNCTION public.toonbank_ophaal_vraag(
    p_org                UUID,
    p_apparaat_id        UUID,
    p_soort              TEXT,
    p_order_id           BIGINT,
    p_code               TEXT,
    p_gebeurtenis_id     UUID,
    p_moment             TIMESTAMPTZ,
    p_medewerker_id      UUID,
    p_bon_id             UUID DEFAULT NULL,
    p_rest_methode       TEXT DEFAULT NULL,
    p_rest_bedrag_cents  INTEGER DEFAULT NULL,
    p_leeftijd           TEXT DEFAULT NULL,
    p_contract_versie    TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_oud       public.toonbank_journaal%ROWTYPE;
    v_soort     TEXT;
    v_order_id  BIGINT;
    v_order     public.winkel_orders%ROWTYPE;
    v_rest_open BOOLEAN := false;
    v_methode   TEXT := p_rest_methode;
    v_dubbel    BOOLEAN := false;
    v_payload   JSONB;
    v_res       JSONB;
    v_id        BIGINT;
    v_bon_j     BIGINT;
BEGIN
    PERFORM private.vereis_org(p_org);

    IF p_soort IS NULL OR p_soort NOT IN ('order', 'doos') THEN
        RAISE EXCEPTION 'ophalen: soort is order of doos' USING ERRCODE = '22023';
    END IF;
    IF p_gebeurtenis_id IS NULL THEN
        RAISE EXCEPTION 'ophalen: gebeurtenis_id ontbreekt' USING ERRCODE = '22023';
    END IF;
    IF p_rest_methode IS NOT NULL AND (p_rest_methode NOT IN ('contant', 'pin') OR p_bon_id IS NULL OR COALESCE(p_rest_bedrag_cents, 0) <= 0) THEN
        RAISE EXCEPTION 'ophalen: een rest heeft een methode (contant of pin), een bedrag en een bon' USING ERRCODE = '22023';
    END IF;
    PERFORM 1 FROM public.toonbank_apparaten a WHERE a.id = p_apparaat_id AND a.organization_id = p_org AND a.ingetrokken_at IS NULL;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'tablet % niet gevonden of ingetrokken', p_apparaat_id USING ERRCODE = 'P0002';
    END IF;
    v_soort := CASE WHEN p_soort = 'order' THEN 'ophalen' ELSE 'doos_ophalen' END;

    -- 1. Al eerder gevraagd? Dan hetzelfde antwoord, niets opnieuw.
    SELECT * INTO v_oud FROM public.toonbank_journaal j WHERE j.organization_id = p_org AND j.gebeurtenis_id = p_gebeurtenis_id;
    IF FOUND THEN
        RETURN jsonb_build_object('journaal', 'bestond', 'soort', v_oud.soort, 'payload', v_oud.payload, 'resultaat', v_oud.resultaat);
    END IF;

    v_payload := jsonb_build_object(
        'order_id', p_order_id, 'code', CASE WHEN p_soort = 'doos' THEN left(btrim(COALESCE(p_code, '')), 200) END,
        'bon_id', p_bon_id, 'medewerker_id', p_medewerker_id, 'moment', p_moment, 'leeftijd', p_leeftijd,
        'rest', CASE WHEN p_rest_methode IS NOT NULL THEN jsonb_build_object('methode', p_rest_methode, 'bedrag_cents', p_rest_bedrag_cents) END);

    -- 2. De order vergrendelen (eerst in de lockvolgorde) en het restbedrag vergelijken (review M7).
    IF p_soort = 'order' THEN
        v_order_id := p_order_id;
    ELSE
        SELECT d.order_id INTO v_order_id FROM public.winkel_dozen d WHERE d.organization_id = p_org AND d.code = lower(btrim(COALESCE(p_code, '')));
    END IF;
    IF v_order_id IS NOT NULL THEN
        SELECT * INTO v_order FROM public.winkel_orders WHERE id = v_order_id AND organization_id = p_org FOR NO KEY UPDATE;
        IF FOUND THEN
            v_rest_open := v_order.betaalwijze = 'reservering' AND v_order.rest_cents > 0 AND v_order.rest_betaald_at IS NULL;
            IF p_rest_methode IS NOT NULL AND v_rest_open AND p_rest_bedrag_cents <> v_order.rest_cents THEN
                -- Ander bedrag: niets boeken; de functie zegt dan rest_nodig met het juiste bedrag.
                v_methode := NULL;
            ELSIF p_rest_methode IS NOT NULL AND NOT v_rest_open THEN
                -- Er staat geen rest (meer) open: geen rest boeken. Was hij met een andere
                -- bon (of in BA) betaald, of was er nooit een, dan is deze bon dubbel.
                v_methode := NULL;
                v_dubbel := v_order.rest_bon_id IS DISTINCT FROM p_bon_id;
            END IF;
        END IF;
    END IF;

    -- 3. De vraag zelf (order → regels → dozen → producten → logboek).
    IF p_soort = 'order' THEN
        v_res := public.winkel_order_ophalen(p_org, p_order_id, v_methode, p_leeftijd, 'toonbank', NULL, p_medewerker_id);
        IF v_res->>'uitkomst' = 'opgehaald' AND v_res->>'rest_geboekt' IS NOT NULL THEN
            UPDATE public.winkel_orders SET rest_bon_id = p_bon_id WHERE id = p_order_id AND organization_id = p_org;
        END IF;
    ELSE
        v_res := public.winkel_doos_ophalen(p_org, p_code, v_methode, p_leeftijd, p_medewerker_id, p_bon_id);
    END IF;
    v_res := jsonb_build_object('ok', true) || v_res || jsonb_build_object('rest_dubbel', v_dubbel);

    -- 4. Dubbel betaald: de bon (als die er al is) naar "Te controleren".
    --    Komt de bon later, dan ziet toonbank_boek_bon het zelf (rest_bon_id).
    IF v_dubbel AND p_bon_id IS NOT NULL AND v_res->>'uitkomst' = 'opgehaald' THEN
        SELECT b.journaal_id INTO v_bon_j FROM public.toonbank_bonnen b WHERE b.id = p_bon_id AND b.organization_id = p_org;
        IF v_bon_j IS NOT NULL THEN
            UPDATE public.toonbank_journaal
               SET verwerk_status = 'conflict', fout_code = 'rest_dubbel',
                   fout_melding = left(COALESCE(fout_melding || ' ', '') || format('De rest van %s stond niet (meer) open toen de order werd meegegeven. Dubbel betaald?', v_order.nummer), 1000),
                   resultaat = COALESCE(resultaat, '{}'::JSONB) || jsonb_build_object('controles',
                       COALESCE(resultaat->'controles', '[]'::JSONB) || jsonb_build_array(jsonb_build_object('code', 'rest_dubbel',
                           'melding', format('De rest van %s stond niet (meer) open toen de order werd meegegeven. Dubbel betaald?', v_order.nummer))))
             WHERE id = v_bon_j AND verwerk_status IN ('verwerkt', 'conflict');
        END IF;
    END IF;

    -- 5. Verzoek en uitkomst in het journaal (na het logboek: de vaste lockvolgorde).
    INSERT INTO public.toonbank_journaal AS j (
        organization_id, apparaat_id, gebeurtenis_id, volgnummer, soort, contract_versie, payload, apparaat_tijd,
        verwerk_status, pogingen, verwerkt_at, resultaat)
    VALUES (
        p_org, p_apparaat_id, p_gebeurtenis_id, NULL, v_soort, left(p_contract_versie, 20), v_payload, p_moment,
        CASE WHEN v_res->>'uitkomst' IN ('opgehaald', 'geweigerd') THEN 'verwerkt' ELSE 'niet_nodig' END, 1, now(), v_res)
    ON CONFLICT (organization_id, gebeurtenis_id) DO NOTHING
    RETURNING j.id INTO v_id;
    IF v_id IS NULL THEN
        SELECT * INTO v_oud FROM public.toonbank_journaal j WHERE j.organization_id = p_org AND j.gebeurtenis_id = p_gebeurtenis_id;
        RETURN jsonb_build_object('journaal', 'bestond', 'soort', v_oud.soort, 'payload', v_oud.payload, 'resultaat', v_oud.resultaat);
    END IF;
    RETURN jsonb_build_object('journaal', 'nieuw', 'soort', v_soort, 'payload', v_payload, 'resultaat', v_res);
END $$;
COMMENT ON FUNCTION public.toonbank_ophaal_vraag(UUID, UUID, TEXT, BIGINT, TEXT, UUID, TIMESTAMPTZ, UUID, UUID, TEXT, INTEGER, TEXT, TEXT) IS
    'POST orders/{order_id}/ophalen en POST dozen/{code}/ophalen (BA-10): winkel_order_ophalen of winkel_doos_ophalen met bron toonbank en de medewerker, restbedrag vooraf vergeleken (M7), rest_bon_id, verzoek en uitkomst in het journaal; idempotent op gebeurtenis_id. Alleen service_role.';
REVOKE ALL ON FUNCTION public.toonbank_ophaal_vraag(UUID, UUID, TEXT, BIGINT, TEXT, UUID, TIMESTAMPTZ, UUID, UUID, TEXT, INTEGER, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.toonbank_ophaal_vraag(UUID, UUID, TEXT, BIGINT, TEXT, UUID, TIMESTAMPTZ, UUID, UUID, TEXT, INTEGER, TEXT, TEXT) TO service_role;


-- ── 6. toonbank_dagstaten ───────────────────────────────────────────────────
CREATE TABLE public.toonbank_dagstaten (
    -- Het dagstaat-ID van de tablet (= gebeurtenis_id in het journaal).
    id                       UUID        PRIMARY KEY,
    organization_id          UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
    apparaat_id              UUID        NOT NULL REFERENCES public.toonbank_apparaten(id) ON DELETE RESTRICT,
    journaal_id              BIGINT      NOT NULL UNIQUE REFERENCES public.toonbank_journaal(id) ON DELETE RESTRICT,
    dagstaatnummer           INTEGER     NOT NULL CHECK (dagstaatnummer > 0),
    bedrijfsdag              DATE        NOT NULL,
    geopend_at               TIMESTAMPTZ NOT NULL,
    gesloten_at              TIMESTAMPTZ NOT NULL,
    medewerker_id            UUID,
    eerste_bonnummer         TEXT,
    laatste_bonnummer        TEXT,
    aantal_bonnen            INTEGER     NOT NULL,
    aantal_tegenbonnen       INTEGER     NOT NULL,
    aantal_geannuleerd       INTEGER     NOT NULL,
    -- Zoals de tablet het zag: [{pct, incl_cents, grondslag_cents, btw_cents}].
    omzet                    JSONB       NOT NULL,
    statiegeld_cents         INTEGER     NOT NULL,
    order_rest_cents         INTEGER     NOT NULL,
    tegenbonnen_cents        INTEGER     NOT NULL,
    korting_cents            INTEGER     NOT NULL,
    afronding_cents          INTEGER     NOT NULL,
    pin_toonbank_cents       INTEGER     NOT NULL,
    pin_mypos_app_cents      INTEGER     NOT NULL,
    pin_verschil_cents       INTEGER     NOT NULL,
    pin_verschil_reden       TEXT,
    contant_begin_cents      INTEGER     NOT NULL CHECK (contant_begin_cents >= 0),
    contant_verwacht_cents   INTEGER     NOT NULL,
    contant_geteld_cents     INTEGER     NOT NULL,
    contant_telling          JSONB,
    contant_verschil_cents   INTEGER     NOT NULL,
    contant_verschil_reden   TEXT,
    afgeroomd_cents          INTEGER     NOT NULL CHECK (afgeroomd_cents >= 0),
    verzendbak_leeg          BOOLEAN     NOT NULL,
    ontvangen_at             TIMESTAMPTZ NOT NULL,
    -- Vanaf hier: van BBQ Architect, mag veranderen.
    status                   TEXT        NOT NULL DEFAULT 'voorlopig' CHECK (status IN ('voorlopig', 'definitief', 'aangevuld', 'goedgekeurd')),
    nagerekend_at            TIMESTAMPTZ,
    -- Wat BBQ Architect uit de bonnen narekende (zelfde vorm als de velden van de tablet).
    nagerekend               JSONB,
    -- [{veld, tablet_cents, ba_cents}]; leeg = klopt.
    verschillen              JSONB       NOT NULL DEFAULT '[]'::JSONB,
    goedgekeurd_door         UUID,
    goedgekeurd_at           TIMESTAMPTZ,
    goedkeur_reden           TEXT,
    export_at                TIMESTAMPTZ,
    CONSTRAINT toonbank_dagstaten_nummer_uniek UNIQUE (apparaat_id, dagstaatnummer),
    CONSTRAINT toonbank_dagstaten_open_dicht CHECK (gesloten_at >= geopend_at)
);
COMMENT ON TABLE public.toonbank_dagstaten IS
    'Afgesloten dagen van de Toonbank (contract §1.5). De velden van de tablet veranderen nooit; BBQ Architect rekent na uit toonbank_bonnen (som van de bon-btw per tarief, zonder opnieuw af te ronden) en legt de verschillen vast. Een groot verschil keurt een Admin achteraf goed.';
CREATE INDEX toonbank_dagstaten_dag_idx ON public.toonbank_dagstaten (organization_id, bedrijfsdag, apparaat_id);

-- De bon weet in welke dagstaat hij valt.
ALTER TABLE public.toonbank_bonnen
    ADD CONSTRAINT toonbank_bonnen_dagstaat_fk FOREIGN KEY (dagstaat_id) REFERENCES public.toonbank_dagstaten(id) ON DELETE RESTRICT;
CREATE INDEX toonbank_bonnen_dagstaat_idx ON public.toonbank_bonnen (dagstaat_id) WHERE dagstaat_id IS NOT NULL;

CREATE OR REPLACE FUNCTION private.toonbank_dagstaat_vast()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
    c_mag CONSTANT TEXT[] := ARRAY['status', 'nagerekend_at', 'nagerekend', 'verschillen', 'goedgekeurd_door', 'goedgekeurd_at', 'goedkeur_reden', 'export_at'];
BEGIN
    IF TG_OP = 'DELETE' OR TG_OP = 'TRUNCATE' THEN
        RAISE EXCEPTION 'TB003: een dagstaat is niet te verwijderen (7 jaar bewaren)' USING ERRCODE = 'TB003';
    END IF;
    IF (to_jsonb(OLD) - c_mag) IS DISTINCT FROM (to_jsonb(NEW) - c_mag) THEN
        RAISE EXCEPTION 'TB003: wat de tablet afsloot verandert niet; alleen status, narekening en goedkeuring' USING ERRCODE = 'TB003';
    END IF;
    RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.toonbank_dagstaat_vast() FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER trg_toonbank_dagstaten_vast BEFORE UPDATE OR DELETE ON public.toonbank_dagstaten
    FOR EACH ROW EXECUTE FUNCTION private.toonbank_dagstaat_vast();
CREATE TRIGGER trg_toonbank_dagstaten_geen_truncate BEFORE TRUNCATE ON public.toonbank_dagstaten
    FOR EACH STATEMENT EXECUTE FUNCTION private.toonbank_dagstaat_vast();

ALTER TABLE public.toonbank_dagstaten ENABLE ROW LEVEL SECURITY;
CREATE POLICY toonbank_dagstaten_select ON public.toonbank_dagstaten FOR SELECT TO authenticated
    USING (organization_id IN (SELECT private.user_org_ids()));
REVOKE ALL ON TABLE public.toonbank_dagstaten FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.toonbank_dagstaten TO authenticated, service_role;


-- ── 7. Narekenen ────────────────────────────────────────────────────────────
-- De bonnen van deze tablet en deze bedrijfsdag die vóór het sluiten gemaakt
-- zijn en nog bij geen dagstaat horen (of al bij deze), gaan naar deze
-- dagstaat; bij twee dagstaten op één dag krijgt de eerste die hem dekt hem.
-- Dan per tarief de som van de bon-btw (de btw-regel, contract §1.3),
-- nooit opnieuw afgerond; netto, dus met de tegenbonnen; zonder geannuleerde
-- bonnen. Verschillen met de tablet → het journaal op conflict.
-- p_aangevuld: er kwam na het afsluiten nog een bon binnen.
-- Geeft {dagstaat_id, status, verschillen, nagerekend}.
CREATE OR REPLACE FUNCTION public.toonbank_dagstaat_herberekenen(
    p_org          UUID,
    p_dagstaat_id  UUID,
    p_aangevuld    BOOLEAN DEFAULT false
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_d          public.toonbank_dagstaten%ROWTYPE;
    v_omzet      JSONB;
    v_s          RECORD;
    v_begin      INTEGER;
    v_na         JSONB;
    v_tablet     JSONB;
    v_verschil   JSONB := '[]'::JSONB;
    v_veld       TEXT;
    v_status     TEXT;
    v_j          public.toonbank_journaal%ROWTYPE;
BEGIN
    PERFORM private.vereis_org(p_org);

    SELECT * INTO v_d FROM public.toonbank_dagstaten WHERE id = p_dagstaat_id AND organization_id = p_org FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'dagstaat % niet in deze organisatie', p_dagstaat_id USING ERRCODE = 'P0002';
    END IF;

    -- 1. Welke bonnen horen erbij.
    UPDATE public.toonbank_bonnen b
       SET dagstaat_id = v_d.id
     WHERE b.organization_id = p_org AND b.apparaat_id = v_d.apparaat_id AND b.bedrijfsdag = v_d.bedrijfsdag
       AND b.dagstaat_id IS NULL AND b.gebeurd_at <= v_d.gesloten_at
       AND NOT EXISTS (SELECT 1 FROM public.toonbank_dagstaten d2
                        WHERE d2.apparaat_id = v_d.apparaat_id AND d2.bedrijfsdag = v_d.bedrijfsdag AND d2.id <> v_d.id
                          AND d2.gesloten_at < v_d.gesloten_at AND b.gebeurd_at <= d2.gesloten_at);

    -- 2. Narekenen: de som van de bon-btw per tarief, zonder opnieuw af te ronden.
    SELECT COALESCE(jsonb_agg(jsonb_build_object('pct', t.pct, 'incl_cents', t.incl, 'grondslag_cents', t.incl - t.btw, 'btw_cents', t.btw) ORDER BY t.pct DESC), '[]'::JSONB)
      INTO v_omzet
      FROM (SELECT e.key::INTEGER AS pct, sum((e.value->>'incl_cents')::BIGINT) AS incl, sum((e.value->>'btw_cents')::BIGINT) AS btw
              FROM public.toonbank_bonnen b, jsonb_each(b.btw) e
             WHERE b.dagstaat_id = v_d.id AND b.status = 'afgerond'
             GROUP BY 1) t;
    SELECT count(*) FILTER (WHERE status = 'afgerond' AND soort = 'verkoop')                          AS aantal_bonnen,
           count(*) FILTER (WHERE status = 'afgerond' AND soort = 'tegenbon')                         AS aantal_tegenbonnen,
           count(*) FILTER (WHERE status = 'geannuleerd')                                             AS aantal_geannuleerd,
           COALESCE(sum(statiegeld_cents) FILTER (WHERE status = 'afgerond'), 0)                      AS statiegeld,
           COALESCE(sum(order_rest_cents) FILTER (WHERE status = 'afgerond'), 0)                      AS order_rest,
           COALESCE(sum(omzet_incl_cents) FILTER (WHERE status = 'afgerond' AND soort = 'tegenbon'), 0) AS tegenbonnen,
           COALESCE(sum(korting_cents) FILTER (WHERE status = 'afgerond'), 0)                         AS korting,
           COALESCE(sum(afronding_cents) FILTER (WHERE status = 'afgerond'), 0)                       AS afronding,
           COALESCE(sum(pin_cents) FILTER (WHERE status = 'afgerond'), 0)                             AS pin,
           COALESCE(sum(contant_cents) FILTER (WHERE status = 'afgerond'), 0)                         AS contant,
           (array_agg(bonnummer ORDER BY bon_volgnummer DESC))[1]                                     AS laatste,
           (array_agg(bonnummer ORDER BY bon_volgnummer ASC))[1]                                      AS eerste_op_nummer
      INTO v_s
      FROM public.toonbank_bonnen
     WHERE dagstaat_id = v_d.id;

    -- Het wisselgeld van het begin: uit dag_openen van die dag (contract §1.5), anders van de tablet.
    SELECT private.tb_int(j.payload->'contant_begin_cents')::INTEGER INTO v_begin
      FROM public.toonbank_journaal j
     WHERE j.organization_id = p_org AND j.apparaat_id = v_d.apparaat_id AND j.soort = 'dag_openen'
       AND j.payload->>'bedrijfsdag' = to_char(v_d.bedrijfsdag, 'YYYY-MM-DD')
       AND j.verwerk_status IN ('niet_nodig', 'verwerkt', 'opgelost')
     ORDER BY j.volgnummer DESC NULLS LAST, j.id DESC
     LIMIT 1;

    v_na := jsonb_build_object(
        'omzet', v_omzet,
        'aantal_bonnen', v_s.aantal_bonnen, 'aantal_tegenbonnen', v_s.aantal_tegenbonnen, 'aantal_geannuleerd', v_s.aantal_geannuleerd,
        'eerste_bonnummer', v_s.eerste_op_nummer, 'laatste_bonnummer', v_s.laatste,
        'statiegeld_cents', v_s.statiegeld, 'order_rest_cents', v_s.order_rest, 'tegenbonnen_cents', v_s.tegenbonnen,
        'korting_cents', v_s.korting, 'afronding_cents', v_s.afronding,
        'pin_toonbank_cents', v_s.pin, 'contant_ontvangen_cents', v_s.contant,
        'contant_begin_cents', COALESCE(v_begin, v_d.contant_begin_cents),
        'contant_begin_bron', CASE WHEN v_begin IS NULL THEN 'dagstaat' ELSE 'dag_openen' END,
        'contant_verwacht_cents', COALESCE(v_begin, v_d.contant_begin_cents) + v_s.contant);

    -- 3. De verschillen met wat de tablet zei (alleen bedragen en aantallen).
    v_tablet := jsonb_build_object(
        'aantal_bonnen', v_d.aantal_bonnen, 'aantal_tegenbonnen', v_d.aantal_tegenbonnen, 'aantal_geannuleerd', v_d.aantal_geannuleerd,
        'statiegeld_cents', v_d.statiegeld_cents, 'order_rest_cents', v_d.order_rest_cents, 'tegenbonnen_cents', v_d.tegenbonnen_cents,
        'korting_cents', v_d.korting_cents, 'afronding_cents', v_d.afronding_cents, 'pin_toonbank_cents', v_d.pin_toonbank_cents,
        'contant_begin_cents', v_d.contant_begin_cents, 'contant_verwacht_cents', v_d.contant_verwacht_cents);
    FOREACH v_veld IN ARRAY ARRAY['aantal_bonnen', 'aantal_tegenbonnen', 'aantal_geannuleerd', 'statiegeld_cents', 'order_rest_cents',
                                  'tegenbonnen_cents', 'korting_cents', 'afronding_cents', 'pin_toonbank_cents', 'contant_begin_cents',
                                  'contant_verwacht_cents'] LOOP
        IF (v_tablet->>v_veld)::BIGINT IS DISTINCT FROM (v_na->>v_veld)::BIGINT THEN
            v_verschil := v_verschil || jsonb_build_object('veld', v_veld, 'tablet_cents', (v_tablet->>v_veld)::BIGINT, 'ba_cents', (v_na->>v_veld)::BIGINT);
        END IF;
    END LOOP;
    -- Per tarief: incl en btw (een tarief dat aan één kant ontbreekt telt als 0).
    v_verschil := v_verschil || COALESCE((
        SELECT jsonb_agg(x.v ORDER BY x.pct DESC, x.wat)
          FROM (
              SELECT t.pct, w.wat, jsonb_build_object('veld', format('omzet_%s_%s', t.pct, w.wat), 'tablet_cents', w.tablet, 'ba_cents', w.ba) AS v
                FROM (SELECT COALESCE(a.pct, b.pct) AS pct,
                             COALESCE(a.incl, 0) AS t_incl, COALESCE(a.btw, 0) AS t_btw,
                             COALESCE(b.incl, 0) AS b_incl, COALESCE(b.btw, 0) AS b_btw
                        FROM (SELECT (o->>'pct')::INTEGER AS pct, sum((o->>'incl_cents')::BIGINT) AS incl, sum((o->>'btw_cents')::BIGINT) AS btw
                                FROM jsonb_array_elements(v_d.omzet) o GROUP BY 1) a
                        FULL JOIN (SELECT (o->>'pct')::INTEGER AS pct, (o->>'incl_cents')::BIGINT AS incl, (o->>'btw_cents')::BIGINT AS btw
                                     FROM jsonb_array_elements(v_omzet) o) b ON b.pct = a.pct) t
                CROSS JOIN LATERAL (VALUES ('incl', t.t_incl, t.b_incl), ('btw', t.t_btw, t.b_btw)) AS w(wat, tablet, ba)
               WHERE w.tablet <> w.ba
          ) x), '[]'::JSONB);

    v_status := CASE WHEN v_d.status = 'goedgekeurd' AND NOT p_aangevuld THEN 'goedgekeurd'
                     WHEN p_aangevuld OR v_d.status = 'aangevuld' THEN 'aangevuld'
                     WHEN v_d.verzendbak_leeg THEN 'definitief'
                     ELSE 'voorlopig' END;
    UPDATE public.toonbank_dagstaten
       SET status = v_status, nagerekend_at = now(), nagerekend = v_na, verschillen = v_verschil
     WHERE id = v_d.id;

    -- 4. Het journaal van de dagstaat: verschillen → conflict; weg → verwerkt.
    SELECT * INTO v_j FROM public.toonbank_journaal WHERE id = v_d.journaal_id;
    IF jsonb_array_length(v_verschil) > 0 AND v_j.verwerk_status IN ('wacht', 'fout', 'verwerkt', 'conflict') AND v_status <> 'goedgekeurd' THEN
        UPDATE public.toonbank_journaal
           SET verwerk_status = 'conflict', fout_code = 'dagstaat_verschil', verwerkt_at = now(),
               fout_melding = left('De dagstaat wijkt af van de bonnen: ' || (SELECT string_agg(format('%s (tablet %s, BBQ Architect %s)', e->>'veld', e->>'tablet_cents', e->>'ba_cents'), ', ') FROM jsonb_array_elements(v_verschil) e), 1000),
               resultaat = jsonb_build_object('dagstaat_id', v_d.id, 'status', v_status, 'verschillen', v_verschil)
         WHERE id = v_j.id;
    ELSIF jsonb_array_length(v_verschil) = 0 AND (v_j.verwerk_status IN ('wacht', 'fout') OR (v_j.verwerk_status = 'conflict' AND v_j.fout_code = 'dagstaat_verschil')) THEN
        UPDATE public.toonbank_journaal
           SET verwerk_status = 'verwerkt', fout_code = NULL, fout_melding = NULL, verwerkt_at = now(),
               resultaat = jsonb_build_object('dagstaat_id', v_d.id, 'status', v_status, 'verschillen', v_verschil)
         WHERE id = v_j.id;
    END IF;

    RETURN jsonb_build_object('dagstaat_id', v_d.id, 'status', v_status, 'verschillen', v_verschil, 'nagerekend', v_na);
END $$;
COMMENT ON FUNCTION public.toonbank_dagstaat_herberekenen(UUID, UUID, BOOLEAN) IS
    'BA-10: koppelt de bonnen van die tablet en dag aan de dagstaat en rekent na (bon-btw per tarief opgeteld, nooit opnieuw afgerond), met de verschillen met de tablet. Verschillen → Te controleren.';
REVOKE ALL ON FUNCTION public.toonbank_dagstaat_herberekenen(UUID, UUID, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.toonbank_dagstaat_herberekenen(UUID, UUID, BOOLEAN) TO authenticated, service_role;


-- ── 8. Een dagstaat-melding verwerken ───────────────────────────────────────
CREATE OR REPLACE FUNCTION private.toonbank_verwerk_dagstaat(p_journaal_id BIGINT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_j       public.toonbank_journaal%ROWTYPE;
    v_p       JSONB;
    v_f       TEXT[] := '{}';
    v_veld    TEXT;
    v_id      UUID;
    v_r       JSONB;
BEGIN
    SELECT * INTO v_j FROM public.toonbank_journaal WHERE id = p_journaal_id;
    PERFORM private.vereis_org(v_j.organization_id);
    v_p := v_j.payload;

    -- De vorm (de API controleert vooraf ook met zod, DagstaatMelding).
    IF private.tb_uuid(v_p->>'dagstaat_id') IS DISTINCT FROM v_j.gebeurtenis_id THEN v_f := array_append(v_f, 'dagstaat_id is niet gelijk aan gebeurtenis_id'); END IF;
    IF COALESCE(private.tb_int(v_p->'dagstaatnummer'), 0) < 1 THEN v_f := array_append(v_f, 'dagstaatnummer'); END IF;
    IF COALESCE(v_p->>'bedrijfsdag', '') !~ '^\d{4}-\d{2}-\d{2}$' OR private.tb_tijd(v_p->>'bedrijfsdag' || 'T00:00:00Z') IS NULL THEN v_f := array_append(v_f, 'bedrijfsdag'); END IF;
    IF private.tb_tijd(v_p->>'geopend_at') IS NULL OR private.tb_tijd(v_p->>'gesloten_at') IS NULL THEN v_f := array_append(v_f, 'geopend_at en gesloten_at'); END IF;
    FOREACH v_veld IN ARRAY ARRAY['aantal_bonnen', 'aantal_tegenbonnen', 'aantal_geannuleerd', 'statiegeld_cents', 'order_rest_cents',
                                  'tegenbonnen_cents', 'korting_cents', 'afronding_cents', 'pin_toonbank_cents', 'pin_mypos_app_cents',
                                  'pin_verschil_cents', 'contant_begin_cents', 'contant_verwacht_cents', 'contant_geteld_cents',
                                  'contant_verschil_cents', 'afgeroomd_cents'] LOOP
        IF private.tb_int(v_p->v_veld) IS NULL THEN v_f := array_append(v_f, v_veld); END IF;
    END LOOP;
    IF jsonb_typeof(v_p->'omzet') IS DISTINCT FROM 'array'
       OR EXISTS (SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(v_p->'omzet') = 'array' THEN v_p->'omzet' ELSE '[]'::JSONB END) o
                   WHERE private.tb_int(o->'pct') IS NULL OR private.tb_int(o->'incl_cents') IS NULL OR private.tb_int(o->'btw_cents') IS NULL) THEN
        v_f := array_append(v_f, 'omzet is [{pct, incl_cents, grondslag_cents, btw_cents}]');
    END IF;
    IF jsonb_typeof(v_p->'verzendbak_leeg') IS DISTINCT FROM 'boolean' THEN v_f := array_append(v_f, 'verzendbak_leeg'); END IF;
    IF cardinality(v_f) > 0 THEN
        RAISE EXCEPTION 'dagstaat klopt niet: %', array_to_string(v_f, ', ') USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.toonbank_dagstaten (
        id, organization_id, apparaat_id, journaal_id, dagstaatnummer, bedrijfsdag, geopend_at, gesloten_at, medewerker_id,
        eerste_bonnummer, laatste_bonnummer, aantal_bonnen, aantal_tegenbonnen, aantal_geannuleerd, omzet,
        statiegeld_cents, order_rest_cents, tegenbonnen_cents, korting_cents, afronding_cents,
        pin_toonbank_cents, pin_mypos_app_cents, pin_verschil_cents, pin_verschil_reden,
        contant_begin_cents, contant_verwacht_cents, contant_geteld_cents, contant_telling, contant_verschil_cents, contant_verschil_reden,
        afgeroomd_cents, verzendbak_leeg, ontvangen_at, status)
    VALUES (
        v_j.gebeurtenis_id, v_j.organization_id, v_j.apparaat_id, v_j.id, private.tb_int(v_p->'dagstaatnummer'),
        (v_p->>'bedrijfsdag')::DATE, private.tb_tijd(v_p->>'geopend_at'), private.tb_tijd(v_p->>'gesloten_at'),
        private.tb_uuid(v_p->>'medewerker_id'), left(v_p->>'eerste_bonnummer', 40), left(v_p->>'laatste_bonnummer', 40),
        private.tb_int(v_p->'aantal_bonnen'), private.tb_int(v_p->'aantal_tegenbonnen'), private.tb_int(v_p->'aantal_geannuleerd'), v_p->'omzet',
        private.tb_int(v_p->'statiegeld_cents'), private.tb_int(v_p->'order_rest_cents'), private.tb_int(v_p->'tegenbonnen_cents'),
        private.tb_int(v_p->'korting_cents'), private.tb_int(v_p->'afronding_cents'),
        private.tb_int(v_p->'pin_toonbank_cents'), private.tb_int(v_p->'pin_mypos_app_cents'), private.tb_int(v_p->'pin_verschil_cents'),
        left(v_p->>'pin_verschil_reden', 500),
        private.tb_int(v_p->'contant_begin_cents'), private.tb_int(v_p->'contant_verwacht_cents'), private.tb_int(v_p->'contant_geteld_cents'),
        CASE WHEN jsonb_typeof(v_p->'contant_telling') = 'array' THEN v_p->'contant_telling' END,
        private.tb_int(v_p->'contant_verschil_cents'), left(v_p->>'contant_verschil_reden', 500),
        private.tb_int(v_p->'afgeroomd_cents'), (v_p->>'verzendbak_leeg')::BOOLEAN, v_j.ontvangen_at,
        CASE WHEN (v_p->>'verzendbak_leeg')::BOOLEAN THEN 'definitief' ELSE 'voorlopig' END)
    ON CONFLICT (id) DO NOTHING
    RETURNING id INTO v_id;

    -- Eerst opgeslagen (het journaal), nu narekenen; dat zet ook de journaalstatus.
    v_r := public.toonbank_dagstaat_herberekenen(v_j.organization_id, v_j.gebeurtenis_id);
    UPDATE public.toonbank_journaal SET pogingen = pogingen + 1, verwerkt_at = COALESCE(verwerkt_at, now()) WHERE id = v_j.id;
    RETURN jsonb_build_object('uitkomst', CASE WHEN v_id IS NULL THEN 'bestond' ELSE 'verwerkt' END) || v_r;
END $$;
REVOKE ALL ON FUNCTION private.toonbank_verwerk_dagstaat(BIGINT) FROM PUBLIC, anon, authenticated, service_role;


-- ── 9. De verdeler kent nu de dagstaat ──────────────────────────────────────
CREATE OR REPLACE FUNCTION private.toonbank_verwerk_melding(p_journaal_id BIGINT, p_opnieuw BOOLEAN DEFAULT false)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_j  public.toonbank_journaal%ROWTYPE;
    v_p  JSONB;
BEGIN
    SELECT * INTO v_j FROM public.toonbank_journaal WHERE id = p_journaal_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'journaalregel % bestaat niet', p_journaal_id USING ERRCODE = 'P0002';
    END IF;
    PERFORM private.vereis_org(v_j.organization_id);
    IF NOT (v_j.verwerk_status = 'wacht' OR (p_opnieuw AND v_j.verwerk_status = 'fout')) THEN
        RETURN jsonb_build_object('uitkomst', v_j.verwerk_status, 'overgeslagen', true);
    END IF;
    v_p := v_j.payload;

    IF v_j.soort IN ('bon', 'tegenbon') THEN
        RETURN public.toonbank_boek_bon(p_journaal_id);
    ELSIF v_j.soort = 'vrij_overschreden' THEN
        RETURN private.toonbank_verwerk_vrij_overschreden(p_journaal_id);
    ELSIF v_j.soort = 'dagstaat' THEN
        RETURN private.toonbank_verwerk_dagstaat(p_journaal_id);
    ELSIF v_j.soort IN ('pinpoging', 'inloggen', 'uitloggen', 'dag_openen') THEN
        IF COALESCE(jsonb_typeof(v_p->'medewerker_id'), 'null') <> 'null' AND private.tb_uuid(v_p->>'medewerker_id') IS NULL THEN
            RAISE EXCEPTION '%: medewerker_id is geen uuid', v_j.soort USING ERRCODE = '22023';
        END IF;
        IF v_j.soort = 'pinpoging' AND (private.tb_uuid(v_p->>'bon_id') IS NULL OR private.tb_int(v_p->'bedrag_cents') IS NULL
                                        OR COALESCE(v_p->>'uitkomst', '') NOT IN ('gelukt', 'mislukt')) THEN
            RAISE EXCEPTION 'pinpoging: bon_id, bedrag_cents en uitkomst (gelukt of mislukt)' USING ERRCODE = '22023';
        END IF;
        IF v_j.soort = 'uitloggen' AND COALESCE(v_p->>'reden', '') NOT IN ('zelf', 'time_out', 'wissel') THEN
            RAISE EXCEPTION 'uitloggen: reden is zelf, time_out of wissel' USING ERRCODE = '22023';
        END IF;
        IF v_j.soort = 'dag_openen' AND (COALESCE(v_p->>'bedrijfsdag', '') !~ '^\d{4}-\d{2}-\d{2}$' OR private.tb_tijd(v_p->>'bedrijfsdag' || 'T00:00:00Z') IS NULL
                                         OR COALESCE(private.tb_int(v_p->'contant_begin_cents'), -1) < 0) THEN
            RAISE EXCEPTION 'dag_openen: bedrijfsdag (jjjj-mm-dd) en contant_begin_cents ≥ 0' USING ERRCODE = '22023';
        END IF;
        UPDATE public.toonbank_journaal
           SET verwerk_status = 'niet_nodig', pogingen = pogingen + 1, fout_code = NULL, fout_melding = NULL, verwerkt_at = now()
         WHERE id = p_journaal_id;
        RETURN jsonb_build_object('uitkomst', 'niet_nodig');
    ELSE
        RAISE EXCEPTION 'soort "%" wordt niet via POST bonnen of POST dagstaten verwerkt', v_j.soort USING ERRCODE = '22023';
    END IF;
END $$;
REVOKE ALL ON FUNCTION private.toonbank_verwerk_melding(BIGINT, BOOLEAN) FROM PUBLIC, anon, authenticated, service_role;


-- ── 10. De wachtrij: een late bon vult een afgesloten dag aan ───────────────
CREATE OR REPLACE FUNCTION public.toonbank_verwerk_wachtrij(p_org UUID, p_apparaat UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_rij      RECORD;
    v_r        JSONB;
    v_state    TEXT;
    v_msg      TEXT;
    v_status   TEXT;
    v_ronde    INTEGER;
    v_wacht    BIGINT[] := '{}';
    v_gedaan   BOOLEAN := false;
    v_uit      JSONB := '{}'::JSONB;
    v_dag      UUID;
BEGIN
    PERFORM private.vereis_org(p_org);
    PERFORM 1 FROM public.toonbank_apparaten WHERE id = p_apparaat AND organization_id = p_org;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'tablet % niet in deze organisatie', p_apparaat USING ERRCODE = 'P0002';
    END IF;

    -- Eén verwerker tegelijk per tablet (vóór elke andere lock).
    PERFORM pg_advisory_xact_lock(hashtextextended('toonbank_wachtrij:' || p_apparaat::TEXT, 0));
    -- Dan alle producten van alle wachtende bonnen, in één keer, in id-volgorde
    -- (review M2 B1: anders zetten twee tablets elkaar vast).
    PERFORM private.toonbank_vergrendel_wachtrij(p_org, p_apparaat);

    -- Ronde 1: alles op wacht, op volgnummer. Ronde 2: alleen wat in ronde 1
    -- bleef wachten (een tegenbon waarvan de bon later in dezelfde batch zat),
    -- en alleen als ronde 1 iets verwerkte.
    FOR v_ronde IN 1..2 LOOP
        EXIT WHEN v_ronde = 2 AND (cardinality(v_wacht) = 0 OR NOT v_gedaan);
        FOR v_rij IN
            SELECT j.id, j.gebeurtenis_id, j.soort FROM public.toonbank_journaal j
             WHERE j.organization_id = p_org AND j.apparaat_id = p_apparaat AND j.verwerk_status = 'wacht'
               AND (v_ronde = 1 OR j.id = ANY (v_wacht))
             ORDER BY j.volgnummer NULLS LAST, j.id
             LIMIT 200
        LOOP
            BEGIN
                v_r := private.toonbank_verwerk_melding(v_rij.id);
            EXCEPTION WHEN OTHERS THEN
                -- Fout → 'fout'; tijdelijk (40P01, 40001, 55P03) → blijft 'wacht' (B1).
                GET STACKED DIAGNOSTICS v_state = RETURNED_SQLSTATE, v_msg = MESSAGE_TEXT;
                v_r := jsonb_build_object('uitkomst', private.toonbank_melding_mislukt(v_rij.id, v_state, v_msg), 'sqlstate', v_state);
            END;
            SELECT verwerk_status INTO v_status FROM public.toonbank_journaal WHERE id = v_rij.id;
            IF v_status = 'wacht' THEN
                IF v_ronde = 1 THEN v_wacht := array_append(v_wacht, v_rij.id); END IF;
            ELSE
                v_gedaan := true;
            END IF;
            v_uit := v_uit || jsonb_build_object(v_rij.id::TEXT, jsonb_build_object(
                'journaal_id', v_rij.id, 'gebeurtenis_id', v_rij.gebeurtenis_id, 'soort', v_rij.soort, 'status', v_status,
                'product_ids', COALESCE((SELECT jsonb_agg(DISTINCT b->'product_id') FROM jsonb_array_elements(COALESCE(v_r->'boekingen', '[]'::JSONB)) b), '[]'::JSONB)));
        END LOOP;
    END LOOP;

    -- Een bon van een dag die al is afgesloten (later binnengekomen): die dag
    -- opnieuw narekenen, status 'aangevuld'. Nooit blokkerend.
    FOR v_dag IN
        SELECT DISTINCT d.id
          FROM public.toonbank_dagstaten d
          JOIN public.toonbank_bonnen b ON b.apparaat_id = d.apparaat_id AND b.bedrijfsdag = d.bedrijfsdag AND b.gebeurd_at <= d.gesloten_at
         WHERE d.organization_id = p_org AND d.apparaat_id = p_apparaat AND b.dagstaat_id IS NULL
    LOOP
        BEGIN
            PERFORM public.toonbank_dagstaat_herberekenen(p_org, v_dag, true);
        EXCEPTION WHEN OTHERS THEN
            GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
            RAISE WARNING 'toonbank: dagstaat % aanvullen mislukt: %', v_dag, v_msg;
        END;
    END LOOP;

    RETURN jsonb_build_object('verwerkt', COALESCE((SELECT jsonb_agg(e.value ORDER BY e.key::BIGINT) FROM jsonb_each(v_uit) e), '[]'::JSONB));
END $$;
COMMENT ON FUNCTION public.toonbank_verwerk_wachtrij(UUID, UUID) IS
    'BA-9/BA-10: verwerkt de meldingen op wacht van één tablet, op volgnummer, elk in een eigen deeltransactie (fout → fout, de rest gaat door; 40P01/40001/55P03 → blijft wacht); vergrendelt eerst alle producten van de wachtende bonnen in id-volgorde (review M2 B1); een late bon vult de dagstaat van zijn dag aan. Alleen service_role.';
REVOKE ALL ON FUNCTION public.toonbank_verwerk_wachtrij(UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.toonbank_verwerk_wachtrij(UUID, UUID) TO service_role;


-- ── 11. GET dagstaat?datum ──────────────────────────────────────────────────
-- Wat BBQ Architect van die dag van deze tablet kent: alle bonnen (ook
-- tegenbonnen en geannuleerde), het hoogste bonnummer, de omzet per tarief
-- (afgeronde bonnen, de som van de bon-btw) en pin en contant.
CREATE OR REPLACE FUNCTION public.toonbank_dagstaat_overzicht(p_org UUID, p_apparaat_id UUID, p_datum DATE)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_code    TEXT;
    v_aantal  INTEGER;
    v_hoogste TEXT;
    v_pin     BIGINT;
    v_contant BIGINT;
    v_omzet   JSONB;
BEGIN
    PERFORM private.vereis_org(p_org);
    IF p_datum IS NULL THEN
        RAISE EXCEPTION 'dagstaat: datum ontbreekt' USING ERRCODE = '22023';
    END IF;
    SELECT code INTO v_code FROM public.toonbank_apparaten WHERE id = p_apparaat_id AND organization_id = p_org;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'tablet % niet in deze organisatie', p_apparaat_id USING ERRCODE = 'P0002';
    END IF;

    SELECT count(*),
           (array_agg(bonnummer ORDER BY bon_volgnummer DESC))[1],
           COALESCE(sum(pin_cents) FILTER (WHERE status = 'afgerond'), 0),
           COALESCE(sum(contant_cents) FILTER (WHERE status = 'afgerond'), 0)
      INTO v_aantal, v_hoogste, v_pin, v_contant
      FROM public.toonbank_bonnen
     WHERE organization_id = p_org AND apparaat_id = p_apparaat_id AND bedrijfsdag = p_datum;

    SELECT COALESCE(jsonb_agg(jsonb_build_object('pct', t.pct, 'incl_cents', t.incl, 'btw_cents', t.btw) ORDER BY t.pct DESC), '[]'::JSONB)
      INTO v_omzet
      FROM (SELECT e.key::INTEGER AS pct, sum((e.value->>'incl_cents')::BIGINT) AS incl, sum((e.value->>'btw_cents')::BIGINT) AS btw
              FROM public.toonbank_bonnen b, jsonb_each(b.btw) e
             WHERE b.organization_id = p_org AND b.apparaat_id = p_apparaat_id AND b.bedrijfsdag = p_datum AND b.status = 'afgerond'
             GROUP BY 1) t;

    RETURN jsonb_build_object('datum', to_char(p_datum, 'YYYY-MM-DD'), 'apparaat_code', v_code, 'aantal_bonnen', v_aantal,
                              'hoogste_bonnummer', v_hoogste, 'omzet', v_omzet, 'pin_cents', v_pin, 'contant_cents', v_contant);
END $$;
COMMENT ON FUNCTION public.toonbank_dagstaat_overzicht(UUID, UUID, DATE) IS
    'GET /api/toonbank/v1/dagstaat (BA-10): bonnen, hoogste bonnummer, omzet per tarief (som van de bon-btw), pin en contant van die dag van deze tablet. Alleen service_role.';
REVOKE ALL ON FUNCTION public.toonbank_dagstaat_overzicht(UUID, UUID, DATE) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.toonbank_dagstaat_overzicht(UUID, UUID, DATE) TO service_role;


-- ── 12. Een dagstaat goedkeuren (Admin) ─────────────────────────────────────
CREATE OR REPLACE FUNCTION public.toonbank_dagstaat_goedkeuren(
    p_org          UUID,
    p_dagstaat_id  UUID,
    p_reden        TEXT,
    p_door         UUID DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_d  public.toonbank_dagstaten%ROWTYPE;
BEGIN
    PERFORM private.vereis_org(p_org);
    IF auth.uid() IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.organization_members m
         WHERE m.organization_id = p_org AND m.user_id = auth.uid() AND m.status = 'active' AND m.role = 'Admin') THEN
        RAISE EXCEPTION 'alleen een beheerder (Admin) keurt een dagstaat goed' USING ERRCODE = '42501';
    END IF;
    IF NULLIF(btrim(COALESCE(p_reden, '')), '') IS NULL THEN
        RAISE EXCEPTION 'geef een reden bij het goedkeuren' USING ERRCODE = '22023';
    END IF;
    SELECT * INTO v_d FROM public.toonbank_dagstaten WHERE id = p_dagstaat_id AND organization_id = p_org FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'dagstaat % niet in deze organisatie', p_dagstaat_id USING ERRCODE = 'P0002';
    END IF;
    UPDATE public.toonbank_dagstaten
       SET status = 'goedgekeurd', goedgekeurd_door = COALESCE(auth.uid(), p_door), goedgekeurd_at = now(), goedkeur_reden = left(btrim(p_reden), 500)
     WHERE id = v_d.id;
    UPDATE public.toonbank_journaal
       SET verwerk_status = 'opgelost', opgelost_door = COALESCE(auth.uid(), p_door), opgelost_reden = left('Dagstaat goedgekeurd: ' || btrim(p_reden), 500), opgelost_at = now()
     WHERE id = v_d.journaal_id AND verwerk_status = 'conflict';
    RETURN jsonb_build_object('dagstaat_id', v_d.id, 'status', 'goedgekeurd');
END $$;
COMMENT ON FUNCTION public.toonbank_dagstaat_goedkeuren(UUID, UUID, TEXT, UUID) IS
    'BA-10: een dagstaat met verschillen achteraf goedkeuren (Admin, met reden); het journaal gaat op opgelost.';
REVOKE ALL ON FUNCTION public.toonbank_dagstaat_goedkeuren(UUID, UUID, TEXT, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.toonbank_dagstaat_goedkeuren(UUID, UUID, TEXT, UUID) TO authenticated, service_role;


-- ── 13. PostgREST kent de nieuwe handtekeningen ─────────────────────────────
NOTIFY pgrst, 'reload schema';


-- ── 14. Zelfcontrole ────────────────────────────────────────────────────────
DO $$
DECLARE
    v_sig    TEXT;
    v_fouten TEXT := '';
BEGIN
    IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public' AND p.proname = 'winkel_doos_ophalen') <> 1
       OR to_regprocedure('public.winkel_doos_ophalen(uuid, text, text, text, uuid, uuid)') IS NULL THEN
        v_fouten := v_fouten || E'\n  winkel_doos_ophalen: niet precies de nieuwe versie';
    END IF;
    IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public' AND p.proname = 'winkel_boek_rest') <> 1
       OR to_regprocedure('public.winkel_boek_rest(uuid, bigint, text, uuid)') IS NULL THEN
        v_fouten := v_fouten || E'\n  winkel_boek_rest: niet precies de nieuwe versie';
    END IF;
    IF pg_get_functiondef('public.winkel_doos_ophalen(uuid, text, text, text, uuid, uuid)'::REGPROCEDURE)
       NOT LIKE '%FROM public.winkel_orders%FOR NO KEY UPDATE%FROM public.winkel_order_regels%FOR UPDATE%FROM public.winkel_dozen%FOR UPDATE%' THEN
        v_fouten := v_fouten || E'\n  winkel_doos_ophalen houdt de lockvolgorde order → regel → doos niet aan';
    END IF;

    FOREACH v_sig IN ARRAY ARRAY[
        'public.winkel_doos_ophalen(uuid, text, text, text, uuid, uuid)',
        'public.winkel_boek_rest(uuid, bigint, text, uuid)',
        'public.toonbank_dagstaat_herberekenen(uuid, uuid, boolean)',
        'public.toonbank_dagstaat_goedkeuren(uuid, uuid, text, uuid)'
    ] LOOP
        IF has_function_privilege('anon', v_sig, 'EXECUTE') THEN v_fouten := v_fouten || E'\n  anon mag ' || v_sig; END IF;
        IF NOT has_function_privilege('authenticated', v_sig, 'EXECUTE') THEN v_fouten := v_fouten || E'\n  authenticated mist ' || v_sig; END IF;
        IF NOT has_function_privilege('service_role', v_sig, 'EXECUTE') THEN v_fouten := v_fouten || E'\n  service_role mist ' || v_sig; END IF;
    END LOOP;
    FOREACH v_sig IN ARRAY ARRAY[
        'public.toonbank_ophaal_vraag(uuid, uuid, text, bigint, text, uuid, timestamp with time zone, uuid, uuid, text, integer, text, text)',
        'public.toonbank_dagstaat_overzicht(uuid, uuid, date)',
        'public.toonbank_verwerk_wachtrij(uuid, uuid)'
    ] LOOP
        IF has_function_privilege('anon', v_sig, 'EXECUTE') OR has_function_privilege('authenticated', v_sig, 'EXECUTE') THEN
            v_fouten := v_fouten || E'\n  anon of authenticated mag ' || v_sig;
        END IF;
        IF NOT has_function_privilege('service_role', v_sig, 'EXECUTE') THEN v_fouten := v_fouten || E'\n  service_role mist ' || v_sig; END IF;
    END LOOP;
    FOREACH v_sig IN ARRAY ARRAY[
        'public.winkel_doos_ophalen(uuid, text, text, text, uuid, uuid)',
        'public.winkel_boek_rest(uuid, bigint, text, uuid)',
        'public.toonbank_ophaal_vraag(uuid, uuid, text, bigint, text, uuid, timestamp with time zone, uuid, uuid, text, integer, text, text)',
        'public.toonbank_dagstaat_herberekenen(uuid, uuid, boolean)',
        'public.toonbank_dagstaat_overzicht(uuid, uuid, date)',
        'public.toonbank_dagstaat_goedkeuren(uuid, uuid, text, uuid)',
        'public.toonbank_verwerk_wachtrij(uuid, uuid)'
    ] LOOP
        IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid = v_sig::REGPROCEDURE AND prosecdef AND proconfig @> ARRAY['search_path=public, pg_temp'])
           OR pg_get_functiondef(v_sig::REGPROCEDURE) NOT LIKE '%PERFORM private.vereis_org(p_org)%' THEN
            v_fouten := v_fouten || E'\n  geen SECURITY DEFINER met search_path en vereis_org: ' || v_sig;
        END IF;
    END LOOP;
    FOREACH v_sig IN ARRAY ARRAY['private.toonbank_verwerk_dagstaat(bigint)', 'private.toonbank_dagstaat_vast()', 'private.toonbank_verwerk_melding(bigint, boolean)'] LOOP
        IF has_function_privilege('anon', v_sig, 'EXECUTE') OR has_function_privilege('authenticated', v_sig, 'EXECUTE')
           OR has_function_privilege('service_role', v_sig, 'EXECUTE') THEN
            v_fouten := v_fouten || E'\n  een rol mag de interne functie ' || v_sig;
        END IF;
    END LOOP;

    IF NOT (SELECT c.relrowsecurity FROM pg_class c WHERE c.oid = 'public.toonbank_dagstaten'::REGCLASS) THEN
        v_fouten := v_fouten || E'\n  RLS staat uit op toonbank_dagstaten';
    END IF;
    IF has_table_privilege('anon', 'public.toonbank_dagstaten', 'SELECT')
       OR has_table_privilege('authenticated', 'public.toonbank_dagstaten', 'UPDATE') OR has_table_privilege('service_role', 'public.toonbank_dagstaten', 'INSERT') THEN
        v_fouten := v_fouten || E'\n  rechten op toonbank_dagstaten kloppen niet';
    END IF;
    IF (SELECT count(*) FROM pg_trigger WHERE tgrelid = 'public.toonbank_dagstaten'::REGCLASS AND NOT tgisinternal
          AND tgfoid = 'private.toonbank_dagstaat_vast()'::REGPROCEDURE) <> 2 THEN
        v_fouten := v_fouten || E'\n  de vast-triggers op toonbank_dagstaten ontbreken';
    END IF;
    IF pg_get_functiondef('private.toonbank_verwerk_melding(bigint, boolean)'::REGPROCEDURE) NOT LIKE '%toonbank_verwerk_dagstaat%' THEN
        v_fouten := v_fouten || E'\n  de verdeler verwerkt geen dagstaat';
    END IF;
    -- Review M2 B1: ook de vernieuwde wachtrij vergrendelt eerst alle producten.
    IF pg_get_functiondef('public.toonbank_verwerk_wachtrij(uuid, uuid)'::REGPROCEDURE)
       NOT LIKE '%pg_advisory_xact_lock%toonbank_vergrendel_wachtrij%toonbank_melding_mislukt%' THEN
        v_fouten := v_fouten || E'\n  de wachtrij vergrendelt niet eerst alle producten, of een tijdelijke fout wordt fout';
    END IF;

    IF v_fouten <> '' THEN
        RAISE EXCEPTION 'toonbank_afhalen_dagstaten: zelfcontrole mislukt, er is niets veranderd:%', v_fouten;
    END IF;
END $$;


-- ── 15. Verificatie ─────────────────────────────────────────────────────────
--   supabase/tests/toonbank_ophalen.sql en toonbank_dagstaat.sql   alleen op dev
--   supabase/checks/verify_winkel_live.sql                         objectproef, op live én dev
