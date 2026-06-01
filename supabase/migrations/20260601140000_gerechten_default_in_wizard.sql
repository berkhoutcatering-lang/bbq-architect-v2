-- ============================================================
-- Gerechten — default is_in_wizard = true
-- Date: 2026-06-01
--
-- Probleem: migration 20260510120000_inspiratie_bibliotheek_foundation.sql
-- introduceerde is_in_wizard BOOLEAN NOT NULL DEFAULT false. Nieuwe gerechten
-- belanden daardoor onzichtbaar in de Menu/Offerte-wizard tenzij de
-- creation-code expliciet is_in_wizard=true zet. Diverse insert-locaties
-- (gerechten/_client.tsx, DishQuickEditor.tsx, OnboardingWizard.tsx, AI-flows)
-- doen dat niet, met als gevolg "ik heb gerechten aangemaakt maar zie ze
-- nergens terug in de wizard".
--
-- Fix:
--   1. Backfill alle is_in_wizard=false naar true (we vertrouwen op de toggle
--      die we in /gerechten toevoegen om bewust verbergen mogelijk te maken).
--   2. Verander de kolom-default naar true zodat toekomstige inserts
--      automatisch zichtbaar zijn in de wizard.
--
-- Veilig her-uit te voeren.
-- ============================================================

-- 1. Backfill — alle false → true
UPDATE public.gerechten
SET is_in_wizard = true
WHERE is_in_wizard = false;

-- 2. Default omdraaien
ALTER TABLE public.gerechten
    ALTER COLUMN is_in_wizard SET DEFAULT true;

-- 3. Comment bijwerken zodat de nieuwe semantiek expliciet is
COMMENT ON COLUMN public.gerechten.is_in_wizard IS
    'true (default) = verschijnt in offerte- en menu-wizard. '
    'false = bewust verborgen (bv. seizoens-gerecht offline, of testdata). '
    'Onafhankelijk van status. Zet false via de toggle in /gerechten.';

-- ============================================================
-- End migration
-- ============================================================
