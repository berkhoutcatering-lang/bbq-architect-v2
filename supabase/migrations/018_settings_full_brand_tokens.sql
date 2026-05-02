-- ============================================================
-- BBQ Architect v2 — Volledige brand-tokens op settings
-- ============================================================
-- Het theme-systeem in src/app/instellingen/page.tsx werkt met 6 kleur-tokens:
-- bg / card / text / primary / accent / secondary. Tot nu stonden alleen
-- brand_primary en brand_accent in de DB (zie 003_branding_and_buckets.sql).
-- De andere 4 vielen bij saveSettings() op de grond — het systeem werkte half.
--
-- Backfill: NULL toestaan. ThemeProvider.tsx (regels 17-23) heeft fallbacks per
-- token, dus bestaande tenants blijven probleemloos draaien tot ze een nieuwe
-- preset kiezen (of via 019_remap_legacy_themes.sql automatisch worden gemapped).

ALTER TABLE settings ADD COLUMN IF NOT EXISTS brand_background TEXT;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS brand_card       TEXT;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS brand_text       TEXT;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS brand_secondary  TEXT;
