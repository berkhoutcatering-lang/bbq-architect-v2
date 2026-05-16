-- Pillar #5 (Systeem) — ai_usage tabel met indices voor het AI-cost-dashboard.
-- Idempotent: bestaat-al-check, voegt alleen ontbrekende kolommen of indices toe.

CREATE TABLE IF NOT EXISTS ai_usage (
  id                       BIGSERIAL PRIMARY KEY,
  organization_id          UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id                  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action_type              TEXT NOT NULL DEFAULT 'other',
  model                    TEXT,
  tokens_input             INTEGER NOT NULL DEFAULT 0,
  tokens_output            INTEGER NOT NULL DEFAULT 0,
  tokens_cache_read        INTEGER NOT NULL DEFAULT 0,
  tokens_cache_creation    INTEGER NOT NULL DEFAULT 0,
  cost_eur_cents           INTEGER NOT NULL DEFAULT 0,
  metadata                 JSONB NOT NULL DEFAULT '{}',
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index voor het dashboard: filter op org + sort op tijd.
CREATE INDEX IF NOT EXISTS idx_ai_usage_org_created
  ON ai_usage (organization_id, created_at DESC);

-- Index voor breakdowns per action_type per maand.
-- date_trunc(text, timestamptz) is STABLE, niet IMMUTABLE → mag niet in
-- een functional index. We gebruiken daarom een gewone btree-index op
-- created_at; het dashboard groepeert in de query met date_trunc.
CREATE INDEX IF NOT EXISTS idx_ai_usage_org_action_month
  ON ai_usage (organization_id, action_type, created_at DESC);

ALTER TABLE ai_usage ENABLE ROW LEVEL SECURITY;

-- RLS: alleen members van de org mogen hun eigen ai_usage zien.
-- Service-role bypassed dit (server-side logging via aiUsageServer.ts).
DROP POLICY IF EXISTS "ai_usage_select_own_org" ON ai_usage;
CREATE POLICY "ai_usage_select_own_org" ON ai_usage
  FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = (select auth.uid()) AND status = 'active'
    )
  );

COMMENT ON TABLE ai_usage IS
  'AI-call telemetrie per tenant: tokens, cost, cache-hit-ratio. Gebruikt door /instellingen/ai-usage dashboard (Pillar #5) en checkAiCapServer (rate-limit per tier).';
