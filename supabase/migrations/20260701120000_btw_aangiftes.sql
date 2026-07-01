-- ─────────────────────────────────────────────────────────────────────────
-- btw_aangiftes — vastgelegde BTW-aangiftes per kwartaal (snapshot + historie)
--
-- Doel: een afgeronde kwartaalaangifte "vastzetten" zodat de ingediende cijfers
-- onveranderlijk bewaard blijven, óók als onderliggende facturen/bonnen later
-- muteren. De rubrieken worden als snapshot opgeslagen (niet hergerekend).
--
-- RLS-patroon spiegelt boekhouder_pakketten: org-isolation via user_org_ids().
-- Insert stuurt organization_id ALTIJD expliciet mee (geen trigger/default).
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS btw_aangiftes (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id  UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    jaar             INT NOT NULL,
    kwartaal         SMALLINT NOT NULL CHECK (kwartaal BETWEEN 1 AND 4),
    periode_start    DATE NOT NULL,
    periode_eind     DATE NOT NULL,
    rubrieken        JSONB NOT NULL,                       -- snapshot van computeBtwAangifte()
    saldo            NUMERIC(12,2) NOT NULL DEFAULT 0,     -- + = te betalen, - = terug te vorderen
    meta             JSONB NOT NULL DEFAULT '{}'::jsonb,   -- facturen_count, bonnen_count, open_issues
    vastgezet_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    vastgezet_by     UUID,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE btw_aangiftes IS
    'Vastgezette kwartaal-BTW-aangiftes. Rubrieken = onveranderlijke snapshot op moment van vastzetten.';

-- Één aangifte per kwartaal per organisatie.
CREATE UNIQUE INDEX IF NOT EXISTS btw_aangiftes_period_unique
    ON btw_aangiftes (organization_id, jaar, kwartaal);

-- Historie-lijst: nieuwste eerst.
CREATE INDEX IF NOT EXISTS btw_aangiftes_org_idx
    ON btw_aangiftes (organization_id, jaar DESC, kwartaal DESC);

CREATE OR REPLACE FUNCTION public.set_btw_aangiftes_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql
SET search_path = ''                       -- hardening: geen mutable search_path
AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS btw_aangiftes_updated_at ON btw_aangiftes;
CREATE TRIGGER btw_aangiftes_updated_at
    BEFORE UPDATE ON btw_aangiftes
    FOR EACH ROW EXECUTE FUNCTION public.set_btw_aangiftes_updated_at();

ALTER TABLE btw_aangiftes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS btw_aangiftes_select ON btw_aangiftes;
CREATE POLICY btw_aangiftes_select ON btw_aangiftes
    FOR SELECT USING (organization_id IN (SELECT public.user_org_ids()));

DROP POLICY IF EXISTS btw_aangiftes_insert ON btw_aangiftes;
CREATE POLICY btw_aangiftes_insert ON btw_aangiftes
    FOR INSERT WITH CHECK (organization_id IN (SELECT public.user_org_ids()));

-- Geen UPDATE-policy: een vastgezette aangifte is onveranderlijk. Corrigeren =
-- ontgrendelen (DELETE) en opnieuw vastzetten, zodat de historie eerlijk blijft.
DROP POLICY IF EXISTS btw_aangiftes_delete ON btw_aangiftes;
CREATE POLICY btw_aangiftes_delete ON btw_aangiftes
    FOR DELETE USING (organization_id IN (SELECT public.user_org_ids()));
