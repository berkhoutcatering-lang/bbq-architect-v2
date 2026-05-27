-- ─── Hub 6 follow-up — Moneybird factuur-tracking ──────────────────────
-- P1 voor Pro-tier-belofte: na factuur-creatie in acceptance-workflow doen
-- we een fire-and-forget push naar Moneybird. Voor idempotency hebben we
-- twee kolommen nodig:
--   moneybird_invoice_id  — externe ID, NULL betekent "nog niet gepushed"
--   moneybird_synced_at   — wanneer push slaagde (audit trail)
--
-- Idempotency-regel in acceptance-workflow: alleen pushen als
-- moneybird_invoice_id IS NULL. Voorkomt dubbele invoices bij retries.
--
-- Defensive: information_schema check zodat migratie idempotent is.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'facturen'
      AND column_name = 'moneybird_invoice_id'
  ) THEN
    ALTER TABLE public.facturen
      ADD COLUMN moneybird_invoice_id TEXT,
      ADD COLUMN moneybird_synced_at TIMESTAMPTZ;
  END IF;
END $$;

-- Index voor "welke facturen zijn nog niet gesynced" queries (Geld-dashboard).
CREATE INDEX IF NOT EXISTS idx_facturen_moneybird_pending
  ON public.facturen (organization_id, datum)
  WHERE moneybird_invoice_id IS NULL;

COMMENT ON COLUMN public.facturen.moneybird_invoice_id
  IS 'Externe Moneybird sales_invoice ID — NULL = nog niet gepushed. Idempotency-key voor auto-push uit acceptance-workflow.';

COMMENT ON COLUMN public.facturen.moneybird_synced_at
  IS 'Wanneer factuur succesvol naar Moneybird is gepushed.';
