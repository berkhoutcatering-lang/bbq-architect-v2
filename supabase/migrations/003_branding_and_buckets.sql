-- ============================================================
-- BBQ Architect v2 — Branding Columns + Storage Buckets
-- Adds missing branding columns to settings table
-- and creates brand-assets + bonnen storage buckets
-- ============================================================

-- 1. Ontbrekende kolommen toevoegen aan settings
ALTER TABLE settings ADD COLUMN IF NOT EXISTS logo_url TEXT;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS logo_dark_url TEXT;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS brand_primary TEXT DEFAULT '#9e781c';
ALTER TABLE settings ADD COLUMN IF NOT EXISTS brand_accent TEXT;

-- 2. Storage buckets aanmaken
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('brand-assets', 'brand-assets', true, 5242880, ARRAY['image/png', 'image/jpeg', 'image/svg+xml', 'image/webp'])
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('bonnen', 'bonnen', true, 10485760, ARRAY['image/png', 'image/jpeg', 'image/webp', 'application/pdf'])
ON CONFLICT (id) DO NOTHING;

-- 3. Storage RLS policies voor brand-assets
CREATE POLICY "brand_assets_public_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'brand-assets');

CREATE POLICY "brand_assets_auth_upload" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'brand-assets' AND auth.role() = 'authenticated');

CREATE POLICY "brand_assets_auth_update" ON storage.objects
  FOR UPDATE USING (bucket_id = 'brand-assets' AND auth.role() = 'authenticated');

CREATE POLICY "brand_assets_auth_delete" ON storage.objects
  FOR DELETE USING (bucket_id = 'brand-assets' AND auth.role() = 'authenticated');

-- 4. Storage RLS policies voor bonnen
CREATE POLICY "bonnen_public_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'bonnen');

CREATE POLICY "bonnen_auth_upload" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'bonnen' AND auth.role() = 'authenticated');

CREATE POLICY "bonnen_auth_update" ON storage.objects
  FOR UPDATE USING (bucket_id = 'bonnen' AND auth.role() = 'authenticated');

CREATE POLICY "bonnen_auth_delete" ON storage.objects
  FOR DELETE USING (bucket_id = 'bonnen' AND auth.role() = 'authenticated');
