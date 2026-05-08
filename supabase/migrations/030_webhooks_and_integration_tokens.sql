-- ─── 030: Webhooks framework + integration tokens ───────────────────────────
-- Webhooks: per-org registraties voor event-driven notificaties naar externe systemen
-- Integration tokens: persistentie van OAuth tokens die kunnen roteren (bijv. Exact Online)

-- ─── org_webhooks ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS org_webhooks (
  id          SERIAL PRIMARY KEY,
  org_id      UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  url         TEXT NOT NULL,
  events      TEXT[] NOT NULL DEFAULT '{}',
  secret      TEXT,
  active      BOOLEAN NOT NULL DEFAULT true,
  description TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE org_webhooks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org owns webhooks"
  ON org_webhooks
  FOR ALL
  USING ((select auth.jwt() ->> 'org_id')::uuid = org_id)
  WITH CHECK ((select auth.jwt() ->> 'org_id')::uuid = org_id);

CREATE INDEX IF NOT EXISTS org_webhooks_org_id_idx ON org_webhooks (org_id);

-- ─── org_webhook_logs ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS org_webhook_logs (
  id            SERIAL PRIMARY KEY,
  webhook_id    INT NOT NULL REFERENCES org_webhooks(id) ON DELETE CASCADE,
  event         TEXT NOT NULL,
  payload       JSONB,
  status_code   INT,
  response_body TEXT,
  success       BOOLEAN NOT NULL DEFAULT false,
  attempt       INT NOT NULL DEFAULT 1,
  error         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE org_webhook_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org owns webhook logs"
  ON org_webhook_logs
  FOR ALL
  USING (
    webhook_id IN (
      SELECT id FROM org_webhooks
      WHERE org_id = (select auth.jwt() ->> 'org_id')::uuid
    )
  );

CREATE INDEX IF NOT EXISTS org_webhook_logs_webhook_id_idx ON org_webhook_logs (webhook_id);

-- ─── integration_tokens ───────────────────────────────────────────────────────
-- Slaat roterende OAuth tokens op (bijv. Exact Online refresh_token).
-- Schrijven gaat via service-role (API route); lezen ook via service-role.
-- Geen RLS-policy → service-role omzeilt RLS; directe user-toegang is niet nodig.
CREATE TABLE IF NOT EXISTS integration_tokens (
  integration_key TEXT PRIMARY KEY,
  token_value     TEXT NOT NULL,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE integration_tokens ENABLE ROW LEVEL SECURITY;
-- Geen SELECT/INSERT/UPDATE policy: alleen service-role heeft toegang.

-- ─── organizations: ontbrekende kolommen voor onboarding + profiel ────────────
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS kvk_number         TEXT,
  ADD COLUMN IF NOT EXISTS btw_number         TEXT,
  ADD COLUMN IF NOT EXISTS address            TEXT,
  ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN NOT NULL DEFAULT false;
