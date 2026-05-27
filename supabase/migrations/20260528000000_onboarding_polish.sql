-- ─── Hub 1 polish — persona-aware onboarding infrastructuur ────────────
-- Pillar #4 (persona-aware): we hebben business_type nodig om later de
-- Vandaag-widgets en empty-state-CTA's te kunnen vertakken per persona
-- (foodtruck / bedrijfsevents / bruiloften / mix).
--
-- onboarding_completed bestaat al via 030_webhooks_and_integration_tokens.sql.
--
-- Defensive: information_schema check zodat migratie idempotent is en niet
-- faalt als kolom al bestaat (feedback_migration_dependencies pattern).

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'organizations'
      AND column_name = 'business_type'
  ) THEN
    ALTER TABLE public.organizations
      ADD COLUMN business_type TEXT
        CHECK (business_type IN ('foodtruck','bedrijfsevents','bruiloften','mix','other'))
        DEFAULT NULL;
  END IF;
END $$;

-- Index voor analytics/segmentation queries
CREATE INDEX IF NOT EXISTS idx_organizations_business_type
  ON public.organizations (business_type)
  WHERE business_type IS NOT NULL;

COMMENT ON COLUMN public.organizations.business_type
  IS 'Pillar #4: persona-aware onboarding & dashboard-widget routing';
