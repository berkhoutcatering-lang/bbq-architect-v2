-- ============================================================
-- BBQ Architect v2 — Remap oude theme-presets naar de 6 nieuwe
-- ============================================================
-- De themes-array in src/app/instellingen/page.tsx is teruggebracht van 9 naar
-- 6 zorgvuldig gecureerde presets (Smokehouse / Graphite / Cellar / Linen /
-- Studio / Garden). Tenants die een van de 9 oude presets exact gebruikten
-- worden automatisch overgezet naar de dichtstbijzijnde nieuwe variant.
--
-- Match-strategie: brand_primary + brand_accent samen. Als beide hex-waarden
-- van een oud preset matchen → tenant gebruikte exact dat preset → vul alle 6
-- nieuwe tokens in. Tenants met aangepaste kleuren (custom-mix die niet exact
-- een oud preset is) blijven ongemoeid — custom blijft custom.
--
-- Mapping:
--   hop-bites / dark-bbq / koper-rook  → Smokehouse
--   mat-zwart-goud / midnight-blauw    → Graphite
--   wijnrood                           → Cellar
--   licht-goud                         → Linen
--   mat-wit-zwart                      → Studio
--   bos-natuur                         → Garden

-- ── 1. hop-bites (#a89a5e + #6b6835) → Smokehouse ──
UPDATE settings SET
    brand_background = '#181412',
    brand_card       = '#2c241d',
    brand_text       = '#f4efe4',
    brand_primary    = '#d49b4d',
    brand_accent     = '#b3611f',
    brand_secondary  = '#100c0a'
WHERE brand_primary = '#a89a5e' AND brand_accent = '#6b6835';

-- ── 2. dark-bbq (#c4a35a + #a8893e) → Smokehouse ──
UPDATE settings SET
    brand_background = '#181412',
    brand_card       = '#2c241d',
    brand_text       = '#f4efe4',
    brand_primary    = '#d49b4d',
    brand_accent     = '#b3611f',
    brand_secondary  = '#100c0a'
WHERE brand_primary = '#c4a35a' AND brand_accent = '#a8893e';

-- ── 3. koper-rook (#c17e4a + #8b5a2b) → Smokehouse ──
UPDATE settings SET
    brand_background = '#181412',
    brand_card       = '#2c241d',
    brand_text       = '#f4efe4',
    brand_primary    = '#d49b4d',
    brand_accent     = '#b3611f',
    brand_secondary  = '#100c0a'
WHERE brand_primary = '#c17e4a' AND brand_accent = '#8b5a2b';

-- ── 4. mat-zwart-goud (#d4af37 + #b8942d) → Graphite ──
UPDATE settings SET
    brand_background = '#0e1014',
    brand_card       = '#1f2128',
    brand_text       = '#f4f5f7',
    brand_primary    = '#d8c277',
    brand_accent     = '#a89d83',
    brand_secondary  = '#08090d'
WHERE brand_primary = '#d4af37' AND brand_accent = '#b8942d';

-- ── 5. midnight-blauw (#60a5fa + #3b82f6) → Graphite ──
UPDATE settings SET
    brand_background = '#0e1014',
    brand_card       = '#1f2128',
    brand_text       = '#f4f5f7',
    brand_primary    = '#d8c277',
    brand_accent     = '#a89d83',
    brand_secondary  = '#08090d'
WHERE brand_primary = '#60a5fa' AND brand_accent = '#3b82f6';

-- ── 6. wijnrood (#c9a961 + #9f7e42) → Cellar ──
UPDATE settings SET
    brand_background = '#241015',
    brand_card       = '#4a1f2a',
    brand_text       = '#f1ead8',
    brand_primary    = '#dac786',
    brand_accent     = '#a96940',
    brand_secondary  = '#1a0a0d'
WHERE brand_primary = '#c9a961' AND brand_accent = '#9f7e42';

-- ── 7. licht-goud (#a8893e + #8b7355) → Linen ──
UPDATE settings SET
    brand_background = '#f4eed8',
    brand_card       = '#fcfaf3',
    brand_text       = '#1c1814',
    brand_primary    = '#9a6a3e',
    brand_accent     = '#6b4a30',
    brand_secondary  = '#e7dfc6'
WHERE brand_primary = '#a8893e' AND brand_accent = '#8b7355';

-- ── 8. mat-wit-zwart (#1a1a1a + #404040) → Studio ──
UPDATE settings SET
    brand_background = '#f6f6f6',
    brand_card       = '#ffffff',
    brand_text       = '#181818',
    brand_primary    = '#222222',
    brand_accent     = '#b73020',
    brand_secondary  = '#ebebeb'
WHERE brand_primary = '#1a1a1a' AND brand_accent = '#404040';

-- ── 9. bos-natuur (#8ab89c + #5c8875) → Garden ──
UPDATE settings SET
    brand_background = '#ece9d6',
    brand_card       = '#fbf9ef',
    brand_text       = '#1f2117',
    brand_primary    = '#6b7847',
    brand_accent     = '#a96b40',
    brand_secondary  = '#dad6b8'
WHERE brand_primary = '#8ab89c' AND brand_accent = '#5c8875';
