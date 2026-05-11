-- ============================================================
-- Inspiratie Bibliotheek — PR1 Foundation
-- Date: 2026-05-10
--
-- Scope (FOUNDATION ONLY):
--   1. Add is_in_wizard boolean to gerechten (default false, backfilled
--      from status='actief' to keep current offerte-wizard working).
--   2. Add index for the wizard-filter query.
--
-- Out of scope (PR2 brings these):
--   - components table
--   - component_allergens / component_haccp_points tables
--   - gerecht_components join
--   - supplier_products table
--   - auto-cost-propagatie triggers
--
-- Safe to re-run (uses IF NOT EXISTS).
-- ============================================================

-- ─── 1. Add is_in_wizard flag to gerechten ────────────────────

ALTER TABLE gerechten
    ADD COLUMN IF NOT EXISTS is_in_wizard BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN gerechten.is_in_wizard IS
    'Inspiratie Bibliotheek (v5): true = verschijnt in offerte-wizard. '
    'Onafhankelijk van status. status=actief + is_in_wizard=true = volledig live. '
    'Hierdoor kan een gerecht "actief in bibliotheek" zijn maar nog niet "verkocht in wizard".';

-- ─── 2. Backfill: alle bestaande gerechten blijven in wizard zichtbaar
--       (anders breekt /offertes wizard direct na deploy).
--       We doen het defensief — als 'status' of 'actief' kolom bestaat
--       respecteren we die, anders gaan ALLE bestaande gerechten naar de wizard
--       (gebruiker filtert later zelf in PR2). ────

DO $backfill$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'gerechten'
          AND column_name = 'status'
    ) THEN
        EXECUTE 'UPDATE gerechten SET is_in_wizard = true WHERE status = ''actief'' AND is_in_wizard = false';
    ELSIF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'gerechten'
          AND column_name = 'actief'
    ) THEN
        EXECUTE 'UPDATE gerechten SET is_in_wizard = true WHERE actief = true AND is_in_wizard = false';
    ELSE
        -- Geen status/actief kolom: backfill alles (veilig, gebruiker filtert later)
        EXECUTE 'UPDATE gerechten SET is_in_wizard = true WHERE is_in_wizard = false';
    END IF;
END
$backfill$;

-- ─── 3. Index voor wizard-query (per organization) ───────────

CREATE INDEX IF NOT EXISTS idx_gerechten_org_wizard
    ON gerechten(organization_id, is_in_wizard)
    WHERE is_in_wizard = true;

-- ============================================================
-- End PR1 foundation migration
-- ============================================================
