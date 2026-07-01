-- ─────────────────────────────────────────────────────────────────────────
-- bank_transacties — geïmporteerde bankafschrift-regels + afletter-status
--
-- Bron: CAMT.053 / MT940 upload. dedup_key maakt her-import idempotent
-- (dezelfde regel twee keer importeren = geen dubbele boeking). Bij een match
-- wordt de gekoppelde factuur op 'betaald' gezet (in de API, niet hier).
--
-- RLS-patroon spiegelt btw_aangiftes / boekhouder_pakketten (user_org_ids()).
-- organization_id wordt ALTIJD expliciet meegestuurd bij insert.
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS bank_transacties (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id     UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    datum               DATE NOT NULL,
    bedrag              NUMERIC(12,2) NOT NULL,   -- + = bij (binnenkomend), - = af (uitgaand)
    tegenrekening       TEXT,
    tegennaam           TEXT,
    omschrijving        TEXT,
    bank_ref            TEXT,
    dedup_key           TEXT NOT NULL,
    status              TEXT NOT NULL DEFAULT 'ongematcht'
                          CHECK (status IN ('ongematcht', 'gematcht', 'genegeerd')),
    matched_factuur_id  BIGINT,                   -- gekoppelde verkoopfactuur (facturen.id)
    imported_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE bank_transacties IS
    'Geïmporteerde bankafschrift-regels (CAMT.053/MT940) met afletter-status tegen facturen.';

-- Idempotente her-import: dezelfde regel niet twee keer.
CREATE UNIQUE INDEX IF NOT EXISTS bank_transacties_dedup_unique
    ON bank_transacties (organization_id, dedup_key);

CREATE INDEX IF NOT EXISTS bank_transacties_org_datum_idx
    ON bank_transacties (organization_id, datum DESC);
CREATE INDEX IF NOT EXISTS bank_transacties_org_status_idx
    ON bank_transacties (organization_id, status);

CREATE OR REPLACE FUNCTION public.set_bank_transacties_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS bank_transacties_updated_at ON bank_transacties;
CREATE TRIGGER bank_transacties_updated_at
    BEFORE UPDATE ON bank_transacties
    FOR EACH ROW EXECUTE FUNCTION public.set_bank_transacties_updated_at();

ALTER TABLE bank_transacties ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS bank_transacties_select ON bank_transacties;
CREATE POLICY bank_transacties_select ON bank_transacties
    FOR SELECT USING (organization_id IN (SELECT public.user_org_ids()));

DROP POLICY IF EXISTS bank_transacties_insert ON bank_transacties;
CREATE POLICY bank_transacties_insert ON bank_transacties
    FOR INSERT WITH CHECK (organization_id IN (SELECT public.user_org_ids()));

DROP POLICY IF EXISTS bank_transacties_update ON bank_transacties;
CREATE POLICY bank_transacties_update ON bank_transacties
    FOR UPDATE USING (organization_id IN (SELECT public.user_org_ids()))
    WITH CHECK (organization_id IN (SELECT public.user_org_ids()));

DROP POLICY IF EXISTS bank_transacties_delete ON bank_transacties;
CREATE POLICY bank_transacties_delete ON bank_transacties
    FOR DELETE USING (organization_id IN (SELECT public.user_org_ids()));
