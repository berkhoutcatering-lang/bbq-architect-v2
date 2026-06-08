-- Bon-scanner v2 — auto-escalatie ladder + reconciliation observability
--
-- Voegt drie kolommen toe aan bonnen voor pass-history en mismatch-flagging:
--
--   ai_raw_output         — raw AI-string per pass (debug + replay)
--   ai_passes             — JSONB array van pass-metadata (model, cost, mismatch)
--   reconciliation_status — 'ok' | 'minor_drift' | 'mismatch' | 'no_total'
--
-- Doel: kunnen debuggen waarom een Sligro/Hanos-bon slecht werd uitgelezen,
-- en in /systeem dashboard een lijst tonen van bonnen die menselijke review
-- behoeven (Σ items ≠ totaal_bedrag).
--
-- RLS: bonnen heeft al organization_id-policies (uit migration 004 / 010).
-- Nieuwe kolommen erven die scope, geen extra policies nodig.

ALTER TABLE bonnen
    ADD COLUMN IF NOT EXISTS ai_raw_output JSONB,
    ADD COLUMN IF NOT EXISTS ai_passes JSONB,
    ADD COLUMN IF NOT EXISTS reconciliation_status TEXT;

-- Hard-enum: alleen vier toegestane waarden. NULL is OK voor pre-v2 rijen.
ALTER TABLE bonnen DROP CONSTRAINT IF EXISTS bonnen_reconciliation_status_check;
ALTER TABLE bonnen
    ADD CONSTRAINT bonnen_reconciliation_status_check
    CHECK (
        reconciliation_status IS NULL
        OR reconciliation_status IN ('ok', 'minor_drift', 'mismatch', 'no_total')
    );

-- Documentatie
COMMENT ON COLUMN bonnen.ai_raw_output IS
    'Bon-scanner v2: raw text-output per AI-pass. Schema: { "passes": [{ "engine": "...", "raw": "..." }, ...] }. Voor debug + replay; niet UI-gerenderd.';
COMMENT ON COLUMN bonnen.ai_passes IS
    'Bon-scanner v2: array van pass-metadata per extractie. Schema: [{ "model", "engine", "confidence", "items_count", "reconciliation_status", "mismatch_eur", "cost_eur_cents", "duration_ms", "error" }]. Voor cost-attribution + diagnose.';
COMMENT ON COLUMN bonnen.reconciliation_status IS
    'Bon-scanner v2: vlag uit reconcileBon(). ''ok''=Σ items klopt met totaal, ''minor_drift''=≤€0.50 verschil, ''mismatch''=>€0.50 (review!), ''no_total''=AI vond geen totaal. NULL voor oude rijen.';

-- Index voor /systeem admin-dashboard "alle bonnen met mismatch"
-- en het potentiële /admin/bonnen-review queue.
CREATE INDEX IF NOT EXISTS idx_bonnen_reconciliation
    ON bonnen (organization_id, reconciliation_status)
    WHERE reconciliation_status IN ('mismatch', 'no_total');
