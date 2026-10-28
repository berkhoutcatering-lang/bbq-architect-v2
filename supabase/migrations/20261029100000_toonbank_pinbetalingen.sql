-- ════════════════════════════════════════════════════════════════════════════
--  Toonbank — pinnen via de koppeling met de myPOS (contract toonbank/v1 1.3)
--  Besluit Mathijs, 28 oktober 2026: de kassa zegt afrekenen en het bedrag
--  springt vanzelf op de myPOS Ultra. BBQ Architect stuurt de betaling via de
--  myPOS ePOS API (https://developers.mypos.com/apis/epos); de tablet praat
--  alleen met BBQ Architect. Handmatig pinnen blijft de terugval.
-- ════════════════════════════════════════════════════════════════════════════
--
--  Wat erbij komt
--    1. toonbank_apparaten.mypos_terminal_id: de terminal (8 cijfers, zoals in
--       de myPOS-account) die bij deze tablet hoort. Leeg = geen koppeling,
--       de tablet pint met de hand.
--    2. toonbank_pinbetalingen: per pinpoging van de tablet (poging_id = het
--       gebeurtenis_id van de melding pinpoging) hooguit één betaling bij
--       myPOS. De ePOS API weigert zelf geen dubbele betaling; deze tabel is
--       de bescherming (uniek op organisatie + poging_id). Alleen service_role.
--
--  Volgorde: eerst testen op een Supabase-branch, dan met de hand naar live,
--  vóór de code die het nodig heeft (CLAUDE.md van hopbites-toonbank §8). De
--  code werkt ook zonder deze migratie: dan staat de koppeling uit.
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.toonbank_apparaten
    ADD COLUMN IF NOT EXISTS mypos_terminal_id TEXT NULL;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'toonbank_apparaten_mypos_terminal_id_vorm') THEN
        ALTER TABLE public.toonbank_apparaten
            ADD CONSTRAINT toonbank_apparaten_mypos_terminal_id_vorm CHECK (mypos_terminal_id IS NULL OR mypos_terminal_id ~ '^[0-9]{8}$');
    END IF;
END $$;

-- Eén terminal hoort bij één tablet: twee kassa's op dezelfde myPOS geeft verwarring.
CREATE UNIQUE INDEX IF NOT EXISTS toonbank_apparaten_mypos_terminal_uniek
    ON public.toonbank_apparaten (organization_id, mypos_terminal_id)
    WHERE mypos_terminal_id IS NOT NULL AND ingetrokken_at IS NULL;

GRANT SELECT (mypos_terminal_id) ON TABLE public.toonbank_apparaten TO authenticated;

CREATE TABLE IF NOT EXISTS public.toonbank_pinbetalingen (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id     UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
    apparaat_id         UUID        NOT NULL REFERENCES public.toonbank_apparaten(id) ON DELETE RESTRICT,
    -- Het gebeurtenis_id van de melding pinpoging op de tablet.
    poging_id           UUID        NOT NULL,
    bon_id              UUID        NOT NULL,
    bonnummer           TEXT        NOT NULL,
    bedrag_cents        INTEGER     NOT NULL CHECK (bedrag_cents > 0),
    mypos_terminal_id   TEXT        NOT NULL,
    -- Gezet zodra myPOS de betaling aannam (POST /epos/v1/payments).
    mypos_payment_id    TEXT        NULL,
    -- wacht | gelukt | mislukt | geannuleerd (contract 1.3), en wat myPOS zei.
    stand               TEXT        NOT NULL DEFAULT 'wacht' CHECK (stand IN ('wacht', 'gelukt', 'mislukt', 'geannuleerd')),
    mypos_status        TEXT        NULL,
    mypos_referentie    TEXT        NULL,
    melding             TEXT        NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT toonbank_pinbetalingen_poging_uniek UNIQUE (organization_id, poging_id)
);

CREATE INDEX IF NOT EXISTS toonbank_pinbetalingen_apparaat_idx ON public.toonbank_pinbetalingen (apparaat_id, created_at DESC);
CREATE INDEX IF NOT EXISTS toonbank_pinbetalingen_bon_idx ON public.toonbank_pinbetalingen (organization_id, bon_id);

ALTER TABLE public.toonbank_pinbetalingen ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS toonbank_pinbetalingen_select ON public.toonbank_pinbetalingen;
CREATE POLICY toonbank_pinbetalingen_select ON public.toonbank_pinbetalingen FOR SELECT TO authenticated
    USING (organization_id IN (SELECT private.user_org_ids()));

REVOKE ALL ON TABLE public.toonbank_pinbetalingen FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.toonbank_pinbetalingen TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.toonbank_pinbetalingen TO service_role;

COMMENT ON TABLE public.toonbank_pinbetalingen IS
    'Toonbank contract 1.3: per pinpoging hooguit één betaling via de myPOS ePOS API. Alleen service_role schrijft.';

-- ── De terminal instellen (Instellingen → Toonbank, alleen een Admin) ────────
CREATE OR REPLACE FUNCTION public.toonbank_apparaat_mypos(
    p_org           UUID,
    p_apparaat_id   UUID,
    p_terminal_id   TEXT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_terminal TEXT := NULLIF(btrim(COALESCE(p_terminal_id, '')), '');
    v_rij      public.toonbank_apparaten%ROWTYPE;
BEGIN
    PERFORM private.vereis_org(p_org);
    PERFORM private.toonbank_vereis_admin(p_org);
    IF v_terminal IS NOT NULL AND v_terminal !~ '^[0-9]{8}$' THEN
        RAISE EXCEPTION 'een myPOS-terminal-ID is 8 cijfers' USING ERRCODE = '22023';
    END IF;

    UPDATE public.toonbank_apparaten
       SET mypos_terminal_id = v_terminal
     WHERE id = p_apparaat_id AND organization_id = p_org AND ingetrokken_at IS NULL
    RETURNING * INTO v_rij;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'tablet % niet in deze organisatie of ingetrokken', p_apparaat_id USING ERRCODE = 'P0002';
    END IF;
    RETURN jsonb_build_object('apparaat_id', v_rij.id, 'mypos_terminal_id', v_rij.mypos_terminal_id);
END $$;
COMMENT ON FUNCTION public.toonbank_apparaat_mypos(UUID, UUID, TEXT) IS
    'Contract 1.3: de myPOS-terminal (8 cijfers) van een tablet instellen of leegmaken (leeg = met de hand pinnen).';
REVOKE ALL ON FUNCTION public.toonbank_apparaat_mypos(UUID, UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.toonbank_apparaat_mypos(UUID, UUID, TEXT) TO authenticated, service_role;
