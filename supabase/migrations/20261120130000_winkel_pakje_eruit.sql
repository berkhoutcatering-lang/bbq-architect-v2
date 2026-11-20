-- ════════════════════════════════════════════════════════════════════════════
--  Weggooien of invriezen vanaf de Toonbank, en de vriezerlijst
--  Contract toonbank/v1 (1.4, additief): POST pakjes/eruit en POST pakjes/{stuk_id}/terug
--  Test: supabase/tests/winkel_pakje_eruit.sql · Vereist 20261119130000_winkel_pakje_id
-- ════════════════════════════════════════════════════════════════════════════
--
--  Besluit Mathijs (20 november 2026): een pakje van de slager (21…) of een
--  gestickerd stuk kaas (29…) dat niet meer verkocht wordt, gaat met één scan
--  aan de kassa uit de winkelvoorraad.
--    weggooien → status afgeschreven (derving_tht), zoals winkel_stuk_afboeken;
--    invriezen → status naar_keuken (keuken_verbruik) met de invriesdatum.
--  Ingevroren vlees is voor eigen gebruik, niet om weer te verkopen. De
--  vriezerlijst (Keuken → Vriezer) toont alles wat ingevroren is en nog niet
--  als gebruikt is afgevinkt, oudste bovenaan.
--
--  Wat erbij komt
--    1. private.stickercode_geldig: het controlecijfer van een kaassticker.
--    2. winkel_stuks: ingevroren_op, opgebruikt_at, opgebruikt_door.
--    3. winkel_stuk_eruit: één rij per verzoek van de kassa (verzoek_id), met
--       het antwoord. Hetzelfde verzoek nog eens geeft hetzelfde antwoord en
--       haalt nooit een tweede pakje eruit. Wie het deed (personeel) staat erbij.
--    4. public.winkel_stuk_eruit: kiest het stuk (bij gelijke codes de vroegste
--       THT, dan het eerst binnengemelde) en haalt het eruit.
--    5. public.winkel_stuk_terug: een vergissing terugdraaien, alleen als het
--       via de kassa eruit ging en (bij invriezen) nog niet gebruikt is.
--    6. public.winkel_stuk_opgebruikt: afvinken in de vriezerlijst (en terug).
--
--  Toepassen: met de hand, één keer, in BEGIN/COMMIT; nooit db push. Eerst een
--  kopie die eindigt op ROLLBACK.
BEGIN;

-- ── 0. Pre-flight ───────────────────────────────────────────────────────────
DO $$
BEGIN
    IF to_regprocedure('public.winkel_stuk_binnen_prijscode(uuid,text,date,uuid,uuid)') IS NULL THEN
        RAISE EXCEPTION 'winkel_pakje_eruit: eerst 20261119130000_winkel_pakje_id';
    END IF;
    IF to_regclass('public.winkel_stuk_eruit') IS NOT NULL THEN
        RAISE EXCEPTION 'winkel_pakje_eruit: deze migratie is al gedraaid';
    END IF;
    IF to_regclass('public.personeel') IS NULL THEN
        RAISE EXCEPTION 'winkel_pakje_eruit: tabel personeel ontbreekt';
    END IF;
END $$;

-- ── 1. Het controlecijfer van een kaassticker ───────────────────────────────
-- 29 PPPPP GGGGG KKKKK JJMMDD VVVV C (Toonbank, packages/kern/src/sticker.ts):
-- van rechts af om en om ×3 en ×1 over de eerste 27 cijfers, aanvullen tot een tiental.
CREATE FUNCTION private.stickercode_geldig(p_code TEXT)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, pg_temp
AS $$
    SELECT COALESCE(p_code, '') ~ '^29[0-9]{26}$'
       AND (10 - (SELECT sum(substr(p_code, i, 1)::INTEGER * CASE WHEN i % 2 = 1 THEN 3 ELSE 1 END)
                    FROM generate_series(1, 27) i) % 10) % 10 = substr(p_code, 28, 1)::INTEGER
$$;
COMMENT ON FUNCTION private.stickercode_geldig(TEXT) IS
    'Een kaassticker van de Toonbank (29…, 28 cijfers) met een kloppend controlecijfer.';
REVOKE ALL ON FUNCTION private.stickercode_geldig(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.stickercode_geldig(TEXT) TO authenticated, service_role;

-- ── 2. Stuks: invriesdatum en gebruikt ──────────────────────────────────────
ALTER TABLE public.winkel_stuks
    ADD COLUMN ingevroren_op   DATE,
    ADD COLUMN opgebruikt_at   TIMESTAMPTZ,
    ADD COLUMN opgebruikt_door UUID;
ALTER TABLE public.winkel_stuks ADD CONSTRAINT winkel_stuks_ingevroren_check
    CHECK (ingevroren_op IS NULL OR status = 'naar_keuken');
ALTER TABLE public.winkel_stuks ADD CONSTRAINT winkel_stuks_opgebruikt_check
    CHECK (opgebruikt_at IS NULL OR ingevroren_op IS NOT NULL);
COMMENT ON COLUMN public.winkel_stuks.ingevroren_op IS
    'De dag (Europe/Amsterdam) waarop het stuk aan de kassa is ingevroren (pakjes/eruit, invriezen). Alleen bij naar_keuken.';
COMMENT ON COLUMN public.winkel_stuks.opgebruikt_at IS
    'Afgevinkt in de vriezerlijst: het ingevroren stuk is gebruikt. Daarna kan het niet meer terug in de winkel.';
CREATE INDEX idx_winkel_stuks_vriezer ON public.winkel_stuks (organization_id, ingevroren_op)
    WHERE ingevroren_op IS NOT NULL AND opgebruikt_at IS NULL;

-- ── 3. Eén rij per verzoek van de kassa ─────────────────────────────────────
CREATE TABLE public.winkel_stuk_eruit (
    verzoek_id      UUID        PRIMARY KEY,
    organization_id UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    stuk_id         UUID        REFERENCES public.winkel_stuks(id) ON DELETE CASCADE,
    code            TEXT        NOT NULL,
    wat             TEXT        NOT NULL CHECK (wat IN ('weggooien', 'invriezen')),
    antwoord        JSONB       NOT NULL,
    -- Wat er van de voorraad af ging (in de eenheid van het product), om het terug te kunnen zetten.
    geboekt         NUMERIC,
    medewerker_id   UUID        REFERENCES public.personeel(id) ON DELETE SET NULL,
    apparaat_id     UUID,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    teruggezet_at   TIMESTAMPTZ
);
COMMENT ON TABLE public.winkel_stuk_eruit IS
    'Weggooien of invriezen aan de kassa (Toonbank, pakjes/eruit): per verzoek_id het antwoord, zodat hetzelfde verzoek nooit een tweede stuk eruit haalt. teruggezet_at: via pakjes/{stuk_id}/terug weer op voorraad. Alleen via winkel_stuk_eruit en winkel_stuk_terug.';
CREATE INDEX idx_winkel_stuk_eruit_stuk ON public.winkel_stuk_eruit (stuk_id) WHERE stuk_id IS NOT NULL;
CREATE INDEX idx_winkel_stuk_eruit_org ON public.winkel_stuk_eruit (organization_id, created_at);

ALTER TABLE public.winkel_stuk_eruit ENABLE ROW LEVEL SECURITY;
CREATE POLICY winkel_stuk_eruit_select ON public.winkel_stuk_eruit FOR SELECT TO authenticated
    USING (organization_id IN (SELECT private.user_org_ids()));
REVOKE ALL ON public.winkel_stuk_eruit FROM anon, authenticated;
GRANT SELECT ON public.winkel_stuk_eruit TO authenticated, service_role;

-- ── 4. Eruit: weggooien of invriezen ────────────────────────────────────────
CREATE FUNCTION public.winkel_stuk_eruit(p_org UUID, p_verzoek_id UUID, p_code TEXT, p_wat TEXT,
                                         p_medewerker_id UUID DEFAULT NULL, p_apparaat_id UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_code    TEXT := btrim(COALESCE(p_code, ''));
    v_al      public.winkel_stuk_eruit%ROWTYPE;
    v_stuk    public.winkel_stuks%ROWTYPE;
    v_product public.winkel_producten%ROWTYPE;
    v_status  TEXT;
    v_reden   TEXT;
    v_dag     DATE;
    v_naam    TEXT;
    v_geboekt NUMERIC;
    v_antw    JSONB;
BEGIN
    PERFORM private.vereis_org(p_org);
    IF p_verzoek_id IS NULL THEN
        RAISE EXCEPTION 'eruit: verzoek_id ontbreekt' USING ERRCODE = '22023';
    END IF;
    IF p_wat IS NULL OR p_wat NOT IN ('weggooien', 'invriezen') THEN
        RAISE EXCEPTION 'eruit: weggooien of invriezen' USING ERRCODE = '22023';
    END IF;

    -- Twee keer hetzelfde verzoek tegelijk: het tweede wacht op het eerste.
    PERFORM pg_advisory_xact_lock(hashtextextended('winkel_stuk_eruit:' || p_verzoek_id::TEXT, 0));
    SELECT * INTO v_al FROM public.winkel_stuk_eruit WHERE verzoek_id = p_verzoek_id;
    IF FOUND THEN
        IF v_al.organization_id <> p_org THEN
            RAISE EXCEPTION 'Dit verzoek_id is al gebruikt' USING ERRCODE = '23505';
        END IF;
        RETURN v_al.antwoord;
    END IF;

    -- Het controlecijfer: opnieuw scannen. Er verandert niets, dus niets te onthouden.
    IF NOT ((v_code ~ '^21[0-9]{11}$' AND private.prijscode_geldig(v_code))
            OR (v_code ~ '^29[0-9]{26}$' AND private.stickercode_geldig(v_code))) THEN
        RETURN jsonb_build_object('uitkomst', 'controlecijfer');
    END IF;

    -- Welk stuk: bij gelijke codes (pakjes met dezelfde prijs) de vroegste THT, dan het eerst
    -- binnengemelde. Een stuk dat een ander verzoek op dit moment vastheeft, slaan we over.
    SELECT * INTO v_stuk FROM public.winkel_stuks
     WHERE organization_id = p_org AND code = v_code AND status = 'op_voorraad'
     ORDER BY tht NULLS LAST, created_at, id
     LIMIT 1
     FOR UPDATE SKIP LOCKED;

    IF NOT FOUND THEN
        -- De naam als BBQ Architect het product kent: van een eerder stuk met deze code, of de PLU.
        SELECT p.naam INTO v_naam FROM public.winkel_stuks s JOIN public.winkel_producten p ON p.id = s.winkel_product_id
         WHERE s.organization_id = p_org AND s.code = v_code
         ORDER BY s.created_at DESC LIMIT 1;
        IF v_naam IS NULL AND v_code ~ '^21' AND substr(v_code, 3, 4) <> '0000' THEN
            SELECT naam INTO v_naam FROM public.winkel_producten
             WHERE organization_id = p_org AND prijscode_nr = substr(v_code, 3, 4);
        END IF;
        v_antw := jsonb_build_object('uitkomst', 'niet_op_voorraad', 'naam', NULLIF(btrim(COALESCE(v_naam, '')), ''));
        INSERT INTO public.winkel_stuk_eruit (verzoek_id, organization_id, stuk_id, code, wat, antwoord, medewerker_id, apparaat_id)
        VALUES (p_verzoek_id, p_org, NULL, v_code, p_wat, v_antw, p_medewerker_id, p_apparaat_id);
        RETURN v_antw;
    END IF;

    v_status := CASE p_wat WHEN 'invriezen' THEN 'naar_keuken' ELSE 'afgeschreven' END;
    v_reden  := CASE p_wat WHEN 'invriezen' THEN 'keuken_verbruik' ELSE 'derving_tht' END;
    v_dag    := CASE WHEN p_wat = 'invriezen' THEN (now() AT TIME ZONE 'Europe/Amsterdam')::DATE END;
    SELECT * INTO v_product FROM public.winkel_producten WHERE id = v_stuk.winkel_product_id;

    -- Zoals winkel_stuk_afboeken: alleen een eigen sticker (kaas) gaat in grammen of stuks van de
    -- voorraad af, en alleen als het product wordt bijgehouden. Een pakje van de slager niet.
    IF v_stuk.bron = 'sticker' AND v_product.voorraad IS NOT NULL THEN
        v_geboekt := LEAST(CASE WHEN v_product.eenheid = 'gram' THEN v_stuk.gewicht_g ELSE 1 END, v_product.voorraad);
        IF v_geboekt > 0 THEN
            PERFORM public.winkel_muteer_voorraad(p_org, v_stuk.winkel_product_id, 'afwijking', -v_geboekt, v_reden,
                left(CASE p_wat WHEN 'invriezen' THEN 'Ingevroren aan de kassa' ELSE 'Weggegooid aan de kassa' END || ' · Sticker ' || v_stuk.code, 500),
                NULL, NULL, NULL, NULL, NULL, 'stuk:' || v_stuk.id::TEXT || ':eruit:' || p_verzoek_id::TEXT);
        ELSE
            v_geboekt := NULL;
        END IF;
    END IF;

    UPDATE public.winkel_stuks
       SET status = v_status, afgeboekt_at = now(), afgeboekt_door = NULL,
           ingevroren_op = v_dag, opgebruikt_at = NULL, opgebruikt_door = NULL,
           notitie = left(concat_ws(' · ', notitie,
               CASE p_wat WHEN 'invriezen' THEN 'Ingevroren aan de kassa' ELSE 'Weggegooid aan de kassa' END), 500)
     WHERE id = v_stuk.id;

    v_antw := jsonb_build_object('uitkomst', 'eruit', 'stuk_id', v_stuk.id, 'naam', v_product.naam,
        'prijs_cents', v_stuk.prijs_cents, 'tht', v_stuk.tht, 'wat', p_wat, 'ingevroren_op', v_dag);
    INSERT INTO public.winkel_stuk_eruit (verzoek_id, organization_id, stuk_id, code, wat, antwoord, geboekt, medewerker_id, apparaat_id)
    VALUES (p_verzoek_id, p_org, v_stuk.id, v_code, p_wat, v_antw, v_geboekt, p_medewerker_id, p_apparaat_id);
    RETURN v_antw;
END $$;
COMMENT ON FUNCTION public.winkel_stuk_eruit(UUID, UUID, TEXT, TEXT, UUID, UUID) IS
    'Weggooien (afgeschreven, derving_tht) of invriezen (naar_keuken, keuken_verbruik, ingevroren_op) aan de kassa. Uitkomst eruit | niet_op_voorraad | controlecijfer. Bij gelijke codes het stuk met de vroegste THT. Idempotent op verzoek_id.';
REVOKE ALL ON FUNCTION public.winkel_stuk_eruit(UUID, UUID, TEXT, TEXT, UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.winkel_stuk_eruit(UUID, UUID, TEXT, TEXT, UUID, UUID) TO service_role;

-- ── 5. Terug: een vergissing aan de kassa terugdraaien ──────────────────────
CREATE FUNCTION public.winkel_stuk_terug(p_org UUID, p_stuk_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_stuk    public.winkel_stuks%ROWTYPE;
    v_eruit   public.winkel_stuk_eruit%ROWTYPE;
    v_product public.winkel_producten%ROWTYPE;
BEGIN
    PERFORM private.vereis_org(p_org);
    SELECT * INTO v_stuk FROM public.winkel_stuks WHERE id = p_stuk_id AND organization_id = p_org FOR UPDATE;
    IF NOT FOUND OR v_stuk.status NOT IN ('afgeschreven', 'naar_keuken') THEN
        RETURN jsonb_build_object('terug', false);
    END IF;
    -- Alleen wat via de kassa eruit ging en nog niet terug is gezet.
    SELECT * INTO v_eruit FROM public.winkel_stuk_eruit
     WHERE stuk_id = v_stuk.id AND organization_id = p_org AND teruggezet_at IS NULL
     ORDER BY created_at DESC LIMIT 1
     FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('terug', false);
    END IF;
    -- Een ingevroren stuk dat in de vriezerlijst als gebruikt is afgevinkt, ligt er niet meer.
    IF v_stuk.opgebruikt_at IS NOT NULL THEN
        RETURN jsonb_build_object('terug', false);
    END IF;
    -- Een eigen sticker is uniek zolang hij ligt.
    IF v_stuk.bron = 'sticker' AND EXISTS (
        SELECT 1 FROM public.winkel_stuks
         WHERE organization_id = p_org AND code = v_stuk.code AND bron = 'sticker' AND status = 'op_voorraad') THEN
        RETURN jsonb_build_object('terug', false);
    END IF;

    SELECT * INTO v_product FROM public.winkel_producten WHERE id = v_stuk.winkel_product_id;
    IF COALESCE(v_eruit.geboekt, 0) > 0 AND v_product.voorraad IS NOT NULL THEN
        PERFORM public.winkel_muteer_voorraad(p_org, v_stuk.winkel_product_id, 'retour', v_eruit.geboekt, NULL,
            left('Terug in de winkel na ' || CASE v_eruit.wat WHEN 'invriezen' THEN 'invriezen' ELSE 'weggooien' END
                 || ' aan de kassa · Sticker ' || v_stuk.code, 500),
            NULL, NULL, NULL, NULL, NULL, 'stuk:' || v_stuk.id::TEXT || ':terug:' || v_eruit.verzoek_id::TEXT);
    END IF;

    UPDATE public.winkel_stuks
       SET status = 'op_voorraad', afgeboekt_at = NULL, afgeboekt_door = NULL,
           ingevroren_op = NULL, opgebruikt_at = NULL, opgebruikt_door = NULL,
           notitie = left(concat_ws(' · ', notitie, 'Terug in de winkel'), 500)
     WHERE id = v_stuk.id;
    UPDATE public.winkel_stuk_eruit SET teruggezet_at = now() WHERE verzoek_id = v_eruit.verzoek_id;
    RETURN jsonb_build_object('terug', true);
END $$;
COMMENT ON FUNCTION public.winkel_stuk_terug(UUID, UUID) IS
    'Een stuk dat aan de kassa is weggegooid of ingevroren weer op voorraad zetten (pakjes/{stuk_id}/terug). Alleen als het via winkel_stuk_eruit eruit ging en, bij invriezen, nog niet als gebruikt is afgevinkt. Bij een sticker gaat de voorraad er weer bij.';
REVOKE ALL ON FUNCTION public.winkel_stuk_terug(UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.winkel_stuk_terug(UUID, UUID) TO service_role;

-- ── 6. Vriezerlijst: gebruikt afvinken ──────────────────────────────────────
CREATE FUNCTION public.winkel_stuk_opgebruikt(p_org UUID, p_stuk_id UUID, p_gebruikt BOOLEAN DEFAULT true)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_stuk public.winkel_stuks%ROWTYPE;
BEGIN
    PERFORM private.vereis_org(p_org);
    SELECT * INTO v_stuk FROM public.winkel_stuks WHERE id = p_stuk_id AND organization_id = p_org FOR UPDATE;
    IF NOT FOUND OR v_stuk.ingevroren_op IS NULL THEN
        RAISE EXCEPTION 'Dit stuk ligt niet in de vriezer' USING ERRCODE = 'P0002';
    END IF;
    UPDATE public.winkel_stuks
       SET opgebruikt_at   = CASE WHEN COALESCE(p_gebruikt, true) THEN COALESCE(opgebruikt_at, now()) END,
           opgebruikt_door = CASE WHEN COALESCE(p_gebruikt, true) THEN COALESCE(opgebruikt_door, auth.uid()) END
     WHERE id = v_stuk.id
    RETURNING * INTO v_stuk;
    RETURN jsonb_build_object('stuk_id', v_stuk.id, 'opgebruikt_at', v_stuk.opgebruikt_at);
END $$;
COMMENT ON FUNCTION public.winkel_stuk_opgebruikt(UUID, UUID, BOOLEAN) IS
    'Vriezerlijst: een ingevroren stuk als gebruikt afvinken (p_gebruikt true) of dat ongedaan maken (false).';
REVOKE ALL ON FUNCTION public.winkel_stuk_opgebruikt(UUID, UUID, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.winkel_stuk_opgebruikt(UUID, UUID, BOOLEAN) TO authenticated, service_role;

-- ── 7. Nakijken ─────────────────────────────────────────────────────────────
DO $$
DECLARE
    -- Kaas 7, 250 g, € 24,95 per kg, THT 1 december 2026, volgnummer 1.
    v_27 TEXT := '290000700250024952612010001';
    v_c  INTEGER := (10 - (SELECT sum(substr('290000700250024952612010001', i, 1)::INTEGER * CASE WHEN i % 2 = 1 THEN 3 ELSE 1 END)
                             FROM generate_series(1, 27) i) % 10) % 10;
BEGIN
    IF NOT private.stickercode_geldig(v_27 || v_c::TEXT)
       OR private.stickercode_geldig(v_27 || ((v_c + 1) % 10)::TEXT)
       OR private.stickercode_geldig('21' || substr(v_27, 3) || v_c::TEXT) THEN
        RAISE EXCEPTION 'winkel_pakje_eruit: het stickercontrolecijfer rekent verkeerd';
    END IF;
    IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.winkel_stuk_eruit'::REGCLASS) THEN
        RAISE EXCEPTION 'winkel_pakje_eruit: RLS staat uit';
    END IF;
    IF has_function_privilege('anon', 'public.winkel_stuk_eruit(uuid,uuid,text,text,uuid,uuid)', 'EXECUTE')
       OR has_function_privilege('authenticated', 'public.winkel_stuk_eruit(uuid,uuid,text,text,uuid,uuid)', 'EXECUTE')
       OR has_function_privilege('authenticated', 'public.winkel_stuk_terug(uuid,uuid)', 'EXECUTE')
       OR NOT has_function_privilege('service_role', 'public.winkel_stuk_terug(uuid,uuid)', 'EXECUTE')
       OR NOT has_function_privilege('authenticated', 'public.winkel_stuk_opgebruikt(uuid,uuid,boolean)', 'EXECUTE')
       OR has_function_privilege('anon', 'public.winkel_stuk_opgebruikt(uuid,uuid,boolean)', 'EXECUTE') THEN
        RAISE EXCEPTION 'winkel_pakje_eruit: de rechten kloppen niet';
    END IF;
END $$;

COMMIT;
