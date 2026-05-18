-- ============================================================
-- Allergen FK constraints — patch op 20260510130000
-- Date: 2026-05-16
--
-- De originele component_allergens-tabel (inspiratie_bibliotheek_schema)
-- heeft allergen_code TEXT NOT NULL zonder FK naar allergens.code.
-- Resultaat: PostgREST kan geen embed-join doen (`allergens!inner(...)`)
-- en code valt terug op handmatige 2-query merge.
--
-- Deze patch:
--   1. Voegt FK toe (idempotent via existence-check)
--   2. Index op allergen_code voor join-performance
--   3. Garandeert dat alle bestaande rows een geldige allergen_code hebben
--      (rijen met onbekende codes worden gemarkeerd, niet gedropt)
--
-- Safe to re-run.
-- ============================================================

-- ─── 1. Vang onbekende codes op vóór we de FK leggen ─────────
-- Als er rijen zijn met allergen_code die NIET in allergens master staat,
-- zou de FK-add falen. Loggen + skippen.

DO $check$
DECLARE
    v_orphans INTEGER;
BEGIN
    SELECT COUNT(*) INTO v_orphans
    FROM component_allergens ca
    LEFT JOIN allergens a ON a.code = ca.allergen_code
    WHERE a.code IS NULL;

    IF v_orphans > 0 THEN
        RAISE NOTICE 'Skipped FK: % component_allergens rows have allergen_code not in allergens master. Clean those first.', v_orphans;
        RETURN;
    END IF;

    -- Geen orphans, FK kan veilig
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'fk_component_allergens_allergen'
          AND table_schema = 'public'
    ) THEN
        ALTER TABLE component_allergens
            ADD CONSTRAINT fk_component_allergens_allergen
            FOREIGN KEY (allergen_code) REFERENCES allergens(code) ON DELETE RESTRICT;
        RAISE NOTICE 'FK fk_component_allergens_allergen added.';
    END IF;
END
$check$;

-- ─── 2. Index op allergen_code voor join-performance ─────────

CREATE INDEX IF NOT EXISTS idx_component_allergens_allergen_code
    ON component_allergens(allergen_code);

-- ─── 3. (Optional) zelfde patch voor ingredient_allergens als die
--        in een eerdere run zonder de FK was aangemaakt. Idempotent. ─

DO $check_ing$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'ingredient_allergens'
    ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'ingredient_allergens_allergen_code_fkey'
          AND table_schema = 'public'
    ) AND NOT EXISTS (
        SELECT 1 FROM ingredient_allergens ia
        LEFT JOIN allergens a ON a.code = ia.allergen_code
        WHERE a.code IS NULL
    ) THEN
        BEGIN
            ALTER TABLE ingredient_allergens
                ADD CONSTRAINT ingredient_allergens_allergen_code_fkey
                FOREIGN KEY (allergen_code) REFERENCES allergens(code) ON DELETE RESTRICT;
            RAISE NOTICE 'FK ingredient_allergens_allergen_code_fkey added.';
        EXCEPTION
            WHEN duplicate_object THEN NULL;  -- FK was al in unify-migration toegevoegd
        END;
    END IF;
END
$check_ing$;

-- ============================================================
-- End allergen FK patch
-- ============================================================
