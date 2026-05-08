-- ════════════════════════════════════════════════════════════════════════════
--  026 — Fix org_price_mutations.leverancier_id type
--
--  Bug: in migration 024 stond leverancier_id als UUID, maar leveranciers.id
--  is INTEGER. Extension/batch crashte met:
--    ERROR: invalid input syntax for type uuid: "24"
--
--  Tabel is net aangemaakt en (vrijwel) leeg, dus DROP+ADD is veilig.
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE org_price_mutations DROP COLUMN IF EXISTS leverancier_id;
ALTER TABLE org_price_mutations ADD COLUMN IF NOT EXISTS leverancier_id BIGINT;

CREATE INDEX IF NOT EXISTS idx_mut_leverancier
    ON org_price_mutations(leverancier_id)
    WHERE leverancier_id IS NOT NULL;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'audit_log') THEN
        INSERT INTO audit_log (entity_type, entity_id, action, metadata, created_at)
        VALUES ('migration', NULL, 'applied',
                jsonb_build_object('migration', '026_fix_price_mutations_leverancier_id'),
                now())
        ON CONFLICT DO NOTHING;
    END IF;
END $$;
