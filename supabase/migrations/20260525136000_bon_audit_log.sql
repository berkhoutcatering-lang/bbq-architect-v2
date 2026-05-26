-- ════════════════════════════════════════════════════════════════════════
-- P0.13 — Bonnen toevoegen aan generieke audit_log (uit 017).
--
-- HERGEBRUIKT bestaande infra:
--   - audit_log tabel             (polymorphic via record_table + record_id)
--   - audit_log_changes() trigger function (auto-diff op UPDATE)
--
-- Wat hier nieuw bij komt:
--   1. 'bonnen' toevoegen aan audit_log.record_table CHECK
--   2. Extra action-types: 'ai_scan', 'extract_pdf', 'share_created',
--      'share_revoked', 'bulk_export' — voor non-CRUD timeline-events
--   3. Trigger toepassen op bonnen tabel
--
-- De Activiteit-tab in BonPreview leest dan:
--   SELECT * FROM audit_log
--   WHERE record_table = 'bonnen' AND record_id = $bon_id
--   ORDER BY changed_at DESC;
-- ════════════════════════════════════════════════════════════════════════

-- 1. Update CHECK constraint op record_table om 'bonnen' toe te voegen.
ALTER TABLE audit_log DROP CONSTRAINT IF EXISTS audit_log_record_table_check;
ALTER TABLE audit_log
    ADD CONSTRAINT audit_log_record_table_check
    CHECK (record_table IN ('gerechten', 'offertes', 'facturen', 'menu_templates', 'bonnen'));

-- 2. Update CHECK constraint op action om non-CRUD events toe te voegen.
ALTER TABLE audit_log DROP CONSTRAINT IF EXISTS audit_log_action_check;
ALTER TABLE audit_log
    ADD CONSTRAINT audit_log_action_check
    CHECK (action IN (
        'insert', 'update', 'delete',
        -- Custom actions voor bonnen-timeline (en later andere tabellen):
        'ai_scan',         -- "AI heeft gescand en gecategoriseerd"
        'extract_pdf',     -- "Tekst uit PDF gehaald"
        'lock',            -- "Vergrendeld voor aangifte"
        'unlock',          -- "Vergrendeling opgeheven (Admin)"
        'share_created',   -- "Deellink aangemaakt voor boekhouder"
        'share_revoked',   -- "Deellink ingetrokken"
        'share_accessed',  -- "Boekhouder opende deellink"
        'bulk_export',     -- "Geëxporteerd in maandpakket"
        'moneybird_sync'   -- toekomst — Moneybird POST /documents
    ));

-- 3. Trigger toepassen op bonnen tabel.
--    Logt INSERT/UPDATE/DELETE met diff-only changes via bestaande
--    audit_log_changes() function uit 017_audit_log.sql.
DROP TRIGGER IF EXISTS trg_audit_bonnen ON bonnen;
CREATE TRIGGER trg_audit_bonnen
    AFTER INSERT OR UPDATE OR DELETE ON bonnen
    FOR EACH ROW EXECUTE FUNCTION audit_log_changes();

-- 4. Helper-functie voor Server Actions die non-DB events willen loggen.
--    Voorbeeld: na AI-scan in extractPdfText() roep logBonAction() aan
--    om "ai_scan" entry te maken zonder dat de bon zelf is ge-update.
CREATE OR REPLACE FUNCTION log_bon_action(
    p_bon_id BIGINT,
    p_action TEXT,
    p_detail TEXT DEFAULT NULL,
    p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_org_id UUID;
BEGIN
    SELECT organization_id INTO v_org_id FROM bonnen WHERE id = p_bon_id;
    IF v_org_id IS NULL THEN
        RAISE EXCEPTION 'Bon % not found', p_bon_id;
    END IF;

    INSERT INTO audit_log (
        organization_id, record_table, record_id, action, user_id, changes, metadata
    )
    VALUES (
        v_org_id, 'bonnen', p_bon_id, p_action, auth.uid(),
        CASE WHEN p_detail IS NOT NULL THEN jsonb_build_object('detail', p_detail) ELSE '{}'::jsonb END,
        p_metadata
    );
END;
$$;

COMMENT ON FUNCTION log_bon_action IS
    'Helper voor Server Actions om non-CRUD events te loggen in audit_log (ai_scan, share_created, etc.). Vermijd dat we het bonnen-record moeten muteren alleen om een log-entry te triggeren.';

REVOKE ALL ON FUNCTION log_bon_action FROM PUBLIC;
GRANT EXECUTE ON FUNCTION log_bon_action TO authenticated, service_role;
