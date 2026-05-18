-- Pillar #2 — Email-in AI-classify (S3.1).
-- Haiku categoriseert inkomende mails in 4 klassen zodat het mailbox-UI
-- ze kan groeperen en de juiste flow kan triggeren (pricelist → batch-job,
-- klant-aanvraag → draft offerte, factuur → inkoop, overig → handmatig).

ALTER TABLE org_email_inbox
  ADD COLUMN IF NOT EXISTS category TEXT,
  ADD COLUMN IF NOT EXISTS category_confidence NUMERIC(3,2),
  ADD COLUMN IF NOT EXISTS category_set_at TIMESTAMPTZ;

ALTER TABLE org_email_inbox
  DROP CONSTRAINT IF EXISTS org_email_inbox_category_check;

ALTER TABLE org_email_inbox
  ADD CONSTRAINT org_email_inbox_category_check
  CHECK (category IS NULL OR category IN ('pricelist', 'klant_aanvraag', 'factuur', 'overig', 'onbekend'));

CREATE INDEX IF NOT EXISTS idx_org_email_inbox_category
  ON org_email_inbox (organization_id, category, received_at DESC)
  WHERE category IS NOT NULL;
