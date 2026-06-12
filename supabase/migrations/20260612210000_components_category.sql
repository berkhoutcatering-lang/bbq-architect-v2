-- =============================================================
--  Components: food vs non-food scheiding
--
--  De bibliotheek mengt menu-bouwstenen (roomboter, kippendij)
--  met verpakking/materieel (vacuumzakken, braadpan, snijplank),
--  waardoor "gem. kostprijs per basis-eenheid" betekenisloos is.
--  Nieuwe kolom `category` scheidt ze; UI filtert en rekent
--  gemiddelden alleen over food.
-- =============================================================

ALTER TABLE components
    ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'food'
    CHECK (category IN ('food', 'non_food'));

COMMENT ON COLUMN components.category IS
    'food = menu-bouwsteen (telt mee in kostprijs-statistieken); non_food = verpakking/materieel/disposables.';

-- Eenmalige backfill: overduidelijke non-food op naam-heuristiek.
-- Bewust smal (alleen ondubbelzinnige termen) — twijfelgevallen blijven
-- food en kunnen in de UI per kaart omgezet worden.
UPDATE components SET category = 'non_food'
WHERE category = 'food' AND (
       name ILIKE '%vacuumzak%'
    OR name ILIKE '%folie%'
    OR name ILIKE '%snijplank%'
    OR name ILIKE '%braadpan%'
    OR name ILIKE '%servet%'
    OR name ILIKE '%beker%'
    OR name ILIKE '%handschoen%'
    OR name ILIKE '%krat%'
);
