-- ════════════════════════════════════════════════════════════════════════════
--  Pakjes binnenmelden vanaf de Toonbank: idempotent op pakje_id
--  Contract toonbank/v1 (1.4, additief): POST pakjes en POST pakjes/{stuk_id}/weg
--  Test: supabase/tests/winkel_prijscode.sql · Vereist 20261119120000_winkel_prijscode_plu
-- ════════════════════════════════════════════════════════════════════════════
--
--  De Toonbank maakt per scan een pakje_id aan en stuurt dat mee. Valt de
--  verbinding weg en stuurt de tablet hetzelfde verzoek nog eens, dan mag er
--  geen tweede pakje op voorraad komen. Daarom krijgt
--  winkel_stuk_binnen_prijscode een vijfde, optionele parameter p_stuk_id: dat
--  wordt het id van het stuk. Bestaat dat stuk al in deze organisatie, dan komt
--  hetzelfde antwoord terug en gebeurt er niets.
--
--  Zonder p_stuk_id (zoals BBQ Architect zelf, Winkel → Leveringen) werkt alles
--  zoals in 20261119120000. De signatuur verandert: de oude functie met vier
--  parameters gaat weg, de nieuwe met vijf (de vijfde met DEFAULT NULL) vangt
--  dezelfde aanroepen op.
--
--  Toepassen: met de hand, één keer, in BEGIN/COMMIT; nooit db push. Na
--  20261119120000_winkel_prijscode_plu.
BEGIN;

-- ── 0. Pre-flight ───────────────────────────────────────────────────────────
DO $$
BEGIN
    IF to_regprocedure('private.prijscode_prijscontrole(text)') IS NULL THEN
        RAISE EXCEPTION 'winkel_pakje_id: eerst 20261119120000_winkel_prijscode_plu';
    END IF;
    IF to_regprocedure('public.winkel_stuk_binnen_prijscode(uuid,text,date,uuid,uuid)') IS NOT NULL THEN
        RAISE EXCEPTION 'winkel_pakje_id: deze migratie is al gedraaid';
    END IF;
END $$;

DROP FUNCTION public.winkel_stuk_binnen_prijscode(UUID, TEXT, DATE, UUID);

CREATE FUNCTION public.winkel_stuk_binnen_prijscode(p_org UUID, p_code TEXT, p_tht DATE, p_product UUID DEFAULT NULL, p_stuk_id UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_code    TEXT := btrim(COALESCE(p_code, ''));
    v_nr      TEXT;
    v_gedeeld BOOLEAN;
    v_prijs   INTEGER;
    v_product public.winkel_producten%ROWTYPE;
    v_ander   TEXT;
    v_artikel UUID;
    v_id      UUID;
    v_stuk    public.winkel_stuks%ROWTYPE;
BEGIN
    PERFORM private.vereis_org(p_org);

    -- Al binnengemeld met dit pakje_id: hetzelfde antwoord, niets nieuws.
    IF p_stuk_id IS NOT NULL THEN
        SELECT * INTO v_stuk FROM public.winkel_stuks WHERE id = p_stuk_id;
        IF FOUND THEN
            IF v_stuk.organization_id <> p_org OR v_stuk.bron <> 'prijscode' THEN
                RAISE EXCEPTION 'Dit pakje_id is al gebruikt' USING ERRCODE = '23505';
            END IF;
            RETURN jsonb_build_object('uitkomst', 'binnen', 'stuk_id', v_stuk.id, 'product_id', v_stuk.winkel_product_id,
                'naam', (SELECT naam FROM public.winkel_producten WHERE id = v_stuk.winkel_product_id),
                'nr', substr(v_stuk.code, 3, 4), 'prijs_cents', v_stuk.prijs_cents, 'tht', v_stuk.tht);
        END IF;
    END IF;

    IF v_code !~ '^21[0-9]{11}$' THEN
        RETURN jsonb_build_object('uitkomst', 'geen_prijscode');
    END IF;
    IF NOT private.prijscode_geldig(v_code) THEN
        RETURN jsonb_build_object('uitkomst', 'controlecijfer');
    END IF;
    IF p_tht IS NULL THEN
        RAISE EXCEPTION 'Vul de THT van de levering in' USING ERRCODE = '22023';
    END IF;
    v_nr := substr(v_code, 3, 4);          -- de PLU; positie 7 is het prijscontrolecijfer
    v_gedeeld := v_nr = '0000';            -- die PLU deelt de slager tussen producten
    v_prijs := substr(v_code, 8, 5)::INTEGER;

    IF p_product IS NOT NULL THEN
        SELECT * INTO v_product FROM public.winkel_producten WHERE id = p_product AND organization_id = p_org FOR UPDATE;
        IF NOT FOUND THEN RAISE EXCEPTION 'Dit product bestaat niet' USING ERRCODE = 'P0002'; END IF;
        IF NOT v_gedeeld THEN
            SELECT naam INTO v_ander FROM public.winkel_producten
             WHERE organization_id = p_org AND prijscode_nr = v_nr AND id <> p_product;
            IF FOUND THEN
                RAISE EXCEPTION 'Nummer % hoort al bij %', v_nr, v_ander USING ERRCODE = '23505';
            END IF;
            IF v_product.prijscode_nr IS DISTINCT FROM v_nr THEN
                UPDATE public.winkel_producten SET prijscode_nr = v_nr WHERE id = v_product.id;
            END IF;
        END IF;
    ELSIF v_gedeeld THEN
        RETURN jsonb_build_object('uitkomst', 'onbekend', 'nr', v_nr, 'gedeeld', true, 'prijs_cents', v_prijs);
    ELSE
        SELECT * INTO v_product FROM public.winkel_producten WHERE organization_id = p_org AND prijscode_nr = v_nr;
        IF NOT FOUND THEN
            RETURN jsonb_build_object('uitkomst', 'onbekend', 'nr', v_nr, 'gedeeld', false, 'prijs_cents', v_prijs);
        END IF;
    END IF;

    -- Het eigen artikel van het product (één vak), als dat er is.
    SELECT s.artikel_id INTO v_artikel FROM public.winkel_artikel_slots s
     WHERE s.organization_id = p_org AND s.standaard_product_id = v_product.id
       AND (SELECT count(*) FROM public.winkel_artikel_slots s2 WHERE s2.artikel_id = s.artikel_id) = 1
     LIMIT 1;

    INSERT INTO public.winkel_stuks (id, organization_id, winkel_product_id, artikel_id, code, bron, prijs_cents, tht, status, gestickerd_at)
    VALUES (COALESCE(p_stuk_id, gen_random_uuid()), p_org, v_product.id, v_artikel, v_code, 'prijscode', v_prijs, p_tht, 'op_voorraad', now())
    ON CONFLICT (id) DO NOTHING
    RETURNING id INTO v_id;
    IF v_id IS NULL THEN
        -- Tegelijk binnengekomen met hetzelfde pakje_id: het andere verzoek was eerst.
        RETURN public.winkel_stuk_binnen_prijscode(p_org, p_code, p_tht, p_product, p_stuk_id);
    END IF;
    RETURN jsonb_build_object('uitkomst', 'binnen', 'stuk_id', v_id, 'product_id', v_product.id, 'naam', v_product.naam,
                              'nr', v_nr, 'prijs_cents', v_prijs, 'tht', p_tht);
END $$;
COMMENT ON FUNCTION public.winkel_stuk_binnen_prijscode(UUID, TEXT, DATE, UUID, UUID) IS
    'Een gescand pakje met een prijscode (21 PPPP K CCCCC E) binnenmelden als stuk op voorraad, gezocht op de PLU. Uitkomst binnen | onbekend (PLU nog niet gekoppeld, of 0000 = gedeeld: geef p_product mee) | controlecijfer (EAN of K) | geen_prijscode. Met p_stuk_id (pakje_id van de Toonbank) idempotent: hetzelfde id geeft hetzelfde antwoord.';
REVOKE ALL ON FUNCTION public.winkel_stuk_binnen_prijscode(UUID, TEXT, DATE, UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.winkel_stuk_binnen_prijscode(UUID, TEXT, DATE, UUID, UUID) TO authenticated, service_role;

-- ── Nakijken ────────────────────────────────────────────────────────────────
DO $$
BEGIN
    IF to_regprocedure('public.winkel_stuk_binnen_prijscode(uuid,text,date,uuid)') IS NOT NULL THEN
        RAISE EXCEPTION 'winkel_pakje_id: de oude functie met vier parameters staat er nog';
    END IF;
    IF NOT has_function_privilege('service_role', 'public.winkel_stuk_binnen_prijscode(uuid,text,date,uuid,uuid)', 'EXECUTE')
       OR has_function_privilege('anon', 'public.winkel_stuk_binnen_prijscode(uuid,text,date,uuid,uuid)', 'EXECUTE') THEN
        RAISE EXCEPTION 'winkel_pakje_id: de rechten kloppen niet';
    END IF;
END $$;

COMMIT;
