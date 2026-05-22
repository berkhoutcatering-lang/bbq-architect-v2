-- Sprint 2 C4/C6 — theme_preset column op settings.
-- Slaat de PRESET-ID op (smokehouse-dark, linen, foundry, ...) zodat de picker
-- bij het herladen weet welke preset actief is. De daadwerkelijke kleuren
-- staan nog steeds in brand_* (hex), berekend uit OKLCH bij save-time.
--
-- Geen RLS-policy nodig — settings-tabel heeft al RLS via organization_id
-- (zie 003_branding_and_buckets.sql en latere policies).

alter table settings
    add column if not exists theme_preset text;

comment on column settings.theme_preset is
    'ID van een THEME_PRESETS entry (src/lib/branding.ts). NULL = legacy custom theme of nog niet gekozen.';
