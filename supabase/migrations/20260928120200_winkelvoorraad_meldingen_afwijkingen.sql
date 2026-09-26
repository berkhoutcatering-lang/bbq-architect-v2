-- ════════════════════════════════════════════════════════════════════════════
--  Winkelvoorraad W4 + W5 — let op, bijna op · afwijkingen met een reden
--  Plan: docs/voorraad-bouwplan.md §3 · Opdracht: docs/OPDRACHT-BBQ-ARCHITECT-WINKELVOORRAAD.md
-- ════════════════════════════════════════════════════════════════════════════
--
--  W4: voorraad_melding_staat onthoudt per product en soort sinds wanneer het
--      eronder zit. Een melding komt er alleen als die rij nieuw is: één keer
--      per keer dat hij onder de drempel zakt. Weer erboven = rij weg.
--      Het mailadres staat in winkel_instellingen.melding_email.
--  W5: keuken_afwijking — zoals winkel_muteer_voorraad, maar voor de keuken:
--      weigert onder nul (WV001) in plaats van af te ronden, en legt de reden
--      vast in stock_movements.reden. voorraad_afwijkingen_maand telt per
--      maand, plek en reden op, in euro tegen inkoopprijs.


-- ── 0. Pre-flight ───────────────────────────────────────────────────────────
DO $$
BEGIN
    IF to_regclass('public.voorraad_logboek') IS NULL THEN
        RAISE EXCEPTION 'winkelvoorraad_meldingen: voorraad_logboek ontbreekt (migratie 20260928120000)';
    END IF;
    IF to_regclass('public.notifications') IS NULL THEN
        RAISE EXCEPTION 'winkelvoorraad_meldingen: notifications ontbreekt (migratie 20260527010000)';
    END IF;
END $$;


-- ── 1. W4: melding-staat ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.voorraad_melding_staat (
    organization_id  UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    -- winkel = winkel_producten.id, keuken = inventory.id, artikel = winkel_artikelen.id
    bron             TEXT        NOT NULL CHECK (bron IN ('winkel', 'keuken', 'artikel')),
    item_id          TEXT        NOT NULL,
    soort            TEXT        NOT NULL CHECK (soort IN ('voorraad_laag', 'voorraad_op', 'artikel_dicht', 'voorraad_tekort_vooruit')),
    sinds            TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- Gemaild? 'bijna op' gaat mee in het overzicht van 8:00, 'op' en 'dicht' direct.
    gemaild_at       TIMESTAMPTZ,
    notification_id  UUID,
    PRIMARY KEY (organization_id, bron, item_id, soort)
);
COMMENT ON TABLE public.voorraad_melding_staat IS
    'Welke voorraadmeldingen nu "aan" staan. Een nieuwe rij = een nieuwe melding; weer boven de drempel = rij weg. Zo komt er één melding per keer dat iets eronder zakt.';

ALTER TABLE public.voorraad_melding_staat ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS voorraad_melding_staat_select ON public.voorraad_melding_staat;
CREATE POLICY voorraad_melding_staat_select ON public.voorraad_melding_staat FOR SELECT TO authenticated
    USING (organization_id IN (SELECT private.user_org_ids()));

ALTER TABLE public.winkel_instellingen ADD COLUMN IF NOT EXISTS melding_email TEXT;
COMMENT ON COLUMN public.winkel_instellingen.melding_email IS
    'Waar de voorraadmeldingen heen gaan: "op" en "artikel dicht" direct, "bijna op" in het overzicht van 8:00. Leeg = alleen de bel.';

CREATE INDEX IF NOT EXISTS notifications_org_ongelezen_idx
    ON public.notifications (organization_id, created_at DESC) WHERE read_at IS NULL AND dismissed_at IS NULL;


-- ── 2. W5: keuken_afwijking ─────────────────────────────────────────────────
ALTER TABLE public.stock_movements ADD COLUMN IF NOT EXISTS idempotency_key TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS stock_movements_sleutel_uidx
    ON public.stock_movements (organization_id, idempotency_key) WHERE idempotency_key IS NOT NULL;

-- Geeft {voorraad, waarde_cents, stock_movement_id, bestond}.
CREATE OR REPLACE FUNCTION public.keuken_afwijking(
    p_org              UUID,
    p_inventory_id     INTEGER,
    p_hoeveelheid      NUMERIC,
    p_reden            TEXT,
    p_notitie          TEXT DEFAULT NULL,
    p_idempotency_key  TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_uid    UUID := auth.uid();
    v_inv    RECORD;
    v_prijs  NUMERIC;
    v_na     NUMERIC;
    v_move   public.stock_movements%ROWTYPE;
BEGIN
    IF v_uid IS NOT NULL AND p_org NOT IN (SELECT private.user_org_ids()) THEN
        RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
    END IF;
    IF p_hoeveelheid IS NULL OR p_hoeveelheid <= 0 THEN
        RAISE EXCEPTION 'hoeveelheid moet > 0 zijn' USING ERRCODE = 'WV005';
    END IF;
    IF p_reden IS NULL OR p_reden NOT IN ('eigen_gebruik', 'proeven', 'derving_breuk', 'derving_tht', 'keuken_verbruik') THEN
        RAISE EXCEPTION 'een afwijking heeft een reden (eigen gebruik, proeven, breuk, THT, keukenverbruik)' USING ERRCODE = 'WV005';
    END IF;

    IF p_idempotency_key IS NOT NULL THEN
        SELECT * INTO v_move FROM public.stock_movements WHERE organization_id = p_org AND idempotency_key = p_idempotency_key;
        IF FOUND THEN
            RETURN jsonb_build_object('voorraad', v_move.resulting_stock,
                'waarde_cents', CASE WHEN v_move.unit_price IS NULL THEN NULL ELSE round(v_move.qty * v_move.unit_price * 100)::INTEGER END,
                'stock_movement_id', v_move.id, 'bestond', true);
        END IF;
    END IF;

    SELECT id, naam, unit, current_stock, last_price_eur, purchase_price INTO v_inv
      FROM public.inventory
     WHERE id = p_inventory_id AND organization_id = p_org
     FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'keukenproduct % niet in deze organisatie', p_inventory_id USING ERRCODE = 'P0002';
    END IF;

    v_na := COALESCE(v_inv.current_stock, 0) - p_hoeveelheid;
    IF v_na < 0 THEN
        RAISE EXCEPTION 'onder nul in de keuken: % (er is % %, gevraagd %)', v_inv.naam, COALESCE(v_inv.current_stock, 0), COALESCE(v_inv.unit, ''), p_hoeveelheid
            USING ERRCODE = 'WV001';
    END IF;
    v_prijs := COALESCE(v_inv.last_price_eur, v_inv.purchase_price);

    UPDATE public.inventory SET current_stock = v_na WHERE id = p_inventory_id;
    INSERT INTO public.stock_movements
        (organization_id, inventory_id, type, reden, qty, resulting_stock, unit_price, by_user_id, note, idempotency_key)
    VALUES (p_org, p_inventory_id, 'afwijking', p_reden, -p_hoeveelheid, v_na, v_prijs, v_uid,
            NULLIF(btrim(COALESCE(p_notitie, '')), ''), p_idempotency_key)
    RETURNING * INTO v_move;

    RETURN jsonb_build_object('voorraad', v_na,
        'waarde_cents', CASE WHEN v_prijs IS NULL THEN NULL ELSE round(-p_hoeveelheid * v_prijs * 100)::INTEGER END,
        'stock_movement_id', v_move.id, 'bestond', false);
END $$;
REVOKE ALL ON FUNCTION public.keuken_afwijking(UUID, INTEGER, NUMERIC, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.keuken_afwijking(UUID, INTEGER, NUMERIC, TEXT, TEXT, TEXT) TO authenticated, service_role;


-- ── 3. W5: maandtotalen per reden ───────────────────────────────────────────
-- Waarde positief = wat weg is, in centen tegen inkoopprijs. zonder_prijs telt
-- de regels waarvan de inkoopprijs onbekend is (die tellen niet mee in euro's).
CREATE OR REPLACE VIEW public.voorraad_afwijkingen_maand
WITH (security_invoker = true) AS
SELECT
    organization_id,
    date_trunc('month', created_at AT TIME ZONE 'Europe/Amsterdam')::DATE AS maand,
    plek,
    reden,
    count(*)                                             AS regels,
    COALESCE(-SUM(waarde_cents), 0)::BIGINT              AS waarde_cents,
    count(*) FILTER (WHERE waarde_cents IS NULL)         AS zonder_prijs
FROM public.voorraad_logboek
WHERE (type = 'afwijking' AND reden IS NOT NULL)
   OR (type = 'telling' AND reden = 'manko')
GROUP BY 1, 2, 3, 4;
COMMENT ON VIEW public.voorraad_afwijkingen_maand IS
    'Afwijkingen en manko per maand (Europe/Amsterdam), plek en reden, in centen tegen inkoopprijs. Voor de voorraadkaart (W6) en het maandrapport (W11).';
