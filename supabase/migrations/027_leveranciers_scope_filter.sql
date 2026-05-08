-- ════════════════════════════════════════════════════════════════════════════
--  027 — Scope-filter per leverancier
--
--  Sam wil per leverancier kunnen aangeven welke producten relevant zijn:
--   - 'alles': scrape alles wat zichtbaar is
--   - 'food_drinks': skip non-food (schoonmaak, kantoor, gadgets, kleding, etc.)
--   - 'custom': alleen producten waar naam/categorie matched met scope_keywords
--
--  Default = 'alles' (backwards-compatible).
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE leveranciers
    ADD COLUMN IF NOT EXISTS scope_filter TEXT
        CHECK (scope_filter IN ('alles', 'food_drinks', 'custom'))
        DEFAULT 'alles',
    ADD COLUMN IF NOT EXISTS scope_keywords TEXT[];

CREATE INDEX IF NOT EXISTS idx_leveranciers_scope ON leveranciers(scope_filter);

COMMENT ON COLUMN leveranciers.scope_filter IS
    'alles | food_drinks | custom — bepaalt of de extensie-scan filtert op categorie';
COMMENT ON COLUMN leveranciers.scope_keywords IS
    'Alleen relevant bij scope_filter=custom. AI keept alleen producten waar naam OF categorie één van deze keywords bevat.';

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'audit_log') THEN
        INSERT INTO audit_log (entity_type, entity_id, action, metadata, created_at)
        VALUES ('migration', NULL, 'applied', jsonb_build_object('migration', '027_leveranciers_scope_filter'), now())
        ON CONFLICT DO NOTHING;
    END IF;
END $$;
