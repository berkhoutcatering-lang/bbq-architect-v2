-- Pillar #2 (Verkoop) — Signed-PDF audit-trail voor B2B-events.
-- Voegt de kolommen toe die accept-offerte/route.ts al schrijft (signed_by,
-- signed_at, signature_url) plus de nieuwe signed_pdf_url voor het gegenereerde
-- handtekening-certificaat dat in Moneybird als attachment komt.

ALTER TABLE offertes
  ADD COLUMN IF NOT EXISTS signed_by TEXT,
  ADD COLUMN IF NOT EXISTS signed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS signature_url TEXT,
  ADD COLUMN IF NOT EXISTS signed_pdf_url TEXT,
  ADD COLUMN IF NOT EXISTS signed_ip TEXT,
  ADD COLUMN IF NOT EXISTS signed_user_agent TEXT;

CREATE INDEX IF NOT EXISTS idx_offertes_signed_at
  ON offertes (organization_id, signed_at DESC)
  WHERE signed_at IS NOT NULL;

-- Storage bucket voor handtekening-certificaten. Public read zodat de
-- Moneybird attachment-flow en de klant de PDF rechtstreeks kunnen
-- downloaden via de getPublicUrl-link; write alleen door service-role
-- (accept-offerte/route.ts).
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('signed-pdfs', 'signed-pdfs', true, 5242880, ARRAY['application/pdf'])
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "signed_pdfs_public_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'signed-pdfs');
