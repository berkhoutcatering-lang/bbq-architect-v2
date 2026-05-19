-- P0.11 — Mollie webhook idempotency.
--
-- Hard rule 6 (BBQ Architect): Mollie + Moneybird webhooks ALTIJD idempotent
-- via UNIQUE constraint op processed-event-id table.
--
-- Mollie kan dezelfde payment-update meerdere keren posten (timeout +
-- automatic retries). Zonder guard:
--   - factuur.status wordt opnieuw bijgewerkt (harmless data, maar dubbel werk)
--   - notification-email wordt 2× verstuurd (klant verward)
--   - audit-log heeft duplicaten
--
-- Met deze tabel: eerste keer = INSERT slaagt + processing draait;
-- tweede keer = UNIQUE-violation = silent return 200 OK.

CREATE TABLE IF NOT EXISTS processed_mollie_events (
  id                  BIGSERIAL PRIMARY KEY,
  mollie_payment_id   TEXT NOT NULL,
  mollie_status       TEXT,
  factuur_id          UUID,
  organization_id     UUID REFERENCES organizations(id) ON DELETE CASCADE,
  payload             JSONB NOT NULL DEFAULT '{}',
  processed_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Eén payment-id × status mag maximaal één keer geprocessed worden.
  -- Mollie statussen wijzigen (open → paid), elk wordt apart geboekt.
  CONSTRAINT processed_mollie_events_unique UNIQUE (mollie_payment_id, mollie_status)
);

-- Index voor het admin-dashboard (toon recent verwerkte payments per tenant).
CREATE INDEX IF NOT EXISTS idx_processed_mollie_events_org_time
  ON processed_mollie_events (organization_id, processed_at DESC);

-- Index voor lookup tijdens replay-check (de UNIQUE staat al op (id,status)).
CREATE INDEX IF NOT EXISTS idx_processed_mollie_events_payment
  ON processed_mollie_events (mollie_payment_id);

ALTER TABLE processed_mollie_events ENABLE ROW LEVEL SECURITY;

-- RLS: tenant-members kunnen hun eigen processed events zien (audit-log
-- transparantie). Service-role schrijft via de webhook (bypassed RLS).
DROP POLICY IF EXISTS "processed_mollie_events_select_own_org" ON processed_mollie_events;
CREATE POLICY "processed_mollie_events_select_own_org" ON processed_mollie_events
  FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = (select auth.uid()) AND status = 'active'
    )
  );

COMMENT ON TABLE processed_mollie_events IS
  'Mollie webhook idempotency-guard (P0.11). Eén payment_id × status = max 1 verwerking, ook bij replay/retry door Mollie. Service-role schrijft, tenant-members lezen voor audit.';
