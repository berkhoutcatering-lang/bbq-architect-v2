-- Generic audit-log voor compliance + dispute-resolution
--
-- Pillar #5 uit Phase 2 audit (2026-05-01): "Audit-trail op alles wat geld of
-- compliance raakt" — dit is wat een Pro-tier-cateraar overtuigt om €99/maand
-- te betalen. Bij dispuut "wie heeft op 3 mei de prijs aangepast" moet je
-- antwoord kunnen geven.
--
-- Bestaande logs:
--   - service_audit_logs (012): per-event KHN-hygiënecode acties
--   - activity_log (002): generieke onboarding-events
--
-- Wat hier nieuw bij komt: een polymorphic audit-log die wijzigingen op
-- gerechten, offertes en facturen append-only registreert. Geen FK naar de
-- oorspronkelijke tabel — bewust polymorphic met `record_table` + `record_id`
-- zodat we later andere tabellen kunnen toevoegen zonder schema-migratie.
--
-- Append-only door RLS: SELECT + INSERT, geen UPDATE/DELETE.

CREATE TABLE IF NOT EXISTS audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    record_table TEXT NOT NULL CHECK (record_table IN ('gerechten', 'offertes', 'facturen', 'menu_templates')),
    record_id BIGINT NOT NULL,
    /* action: insert | update | delete — past bij Postgres TG_OP. */
    action TEXT NOT NULL CHECK (action IN ('insert', 'update', 'delete')),
    /* user_id is nullable: bij service-role insert (acceptance-workflow,
       AI-tool) kan er geen auth.uid() zijn. Dan wint metadata.bron. */
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    changed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    /* before / after: alleen de gewijzigde velden, niet de hele rij — scheelt
       storage en is leesbaarder voor de UI ("naam: X → Y"). */
    changes JSONB NOT NULL DEFAULT '{}'::jsonb,
    /* metadata: bron-tag (manual/ai/api), notitie, ip-adres optioneel later. */
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

COMMENT ON TABLE audit_log IS 'Append-only log voor compliance + dispute-resolution. Wie wijzigde wat wanneer op gerechten/offertes/facturen/menu_templates.';
COMMENT ON COLUMN audit_log.record_table IS 'Bron-tabel — polymorphic FK via (record_table, record_id).';
COMMENT ON COLUMN audit_log.changes IS 'JSON object { veld: { before, after } } — alleen gewijzigde velden, niet de hele rij.';

CREATE INDEX IF NOT EXISTS idx_audit_log_record ON audit_log(record_table, record_id, changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_org ON audit_log(organization_id, changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_user ON audit_log(user_id, changed_at DESC);

ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "audit_log_select" ON audit_log
    FOR SELECT TO authenticated
    USING (
        organization_id IS NULL
        OR organization_id IN (
            SELECT organization_id FROM organization_members
            WHERE user_id = auth.uid() AND status = 'active'
        )
    );

CREATE POLICY "audit_log_insert" ON audit_log
    FOR INSERT TO authenticated
    WITH CHECK (
        organization_id IS NULL
        OR organization_id IN (
            SELECT organization_id FROM organization_members
            WHERE user_id = auth.uid() AND status = 'active'
        )
    );

-- GEEN UPDATE/DELETE-policy → append-only (compliance-vereiste).
-- Service-role kan via supabase.from('audit_log').insert() uit Server Actions
-- en Server Components, anon-clients kunnen niet inserten zonder auth.

-- ── Trigger function ─────────────────────────────────────────────────
--
-- Gebruikt PG's TG_OP + OLD/NEW om changes-diff te berekenen. Voor INSERT:
-- alleen NEW velden. Voor UPDATE: alleen velden die veranderd zijn (vermijdt
-- ruis bij saves die alle velden re-schrijven). Voor DELETE: snapshot OLD.
--
-- Velden die we NIET in changes zetten: created_at, updated_at, id (die staan
-- al in de columns van audit_log zelf).

CREATE OR REPLACE FUNCTION audit_log_changes()
RETURNS TRIGGER AS $$
DECLARE
    v_changes JSONB := '{}'::jsonb;
    v_org_id UUID;
    v_user_id UUID;
    v_record_id BIGINT;
    v_key TEXT;
    v_old_val JSONB;
    v_new_val JSONB;
BEGIN
    /* Resolve user via auth.uid() — kan NULL zijn bij service-role calls. */
    BEGIN
        v_user_id := auth.uid();
    EXCEPTION WHEN OTHERS THEN
        v_user_id := NULL;
    END;

    IF TG_OP = 'DELETE' THEN
        v_record_id := OLD.id;
        v_org_id := OLD.organization_id;
        v_changes := to_jsonb(OLD) - 'created_at' - 'updated_at' - 'id';
    ELSIF TG_OP = 'INSERT' THEN
        v_record_id := NEW.id;
        v_org_id := NEW.organization_id;
        v_changes := to_jsonb(NEW) - 'created_at' - 'updated_at' - 'id';
    ELSE  /* UPDATE — alleen veranderde velden */
        v_record_id := NEW.id;
        v_org_id := NEW.organization_id;
        FOR v_key IN SELECT jsonb_object_keys(to_jsonb(NEW)) LOOP
            IF v_key IN ('created_at', 'updated_at', 'id') THEN
                CONTINUE;
            END IF;
            v_old_val := to_jsonb(OLD) -> v_key;
            v_new_val := to_jsonb(NEW) -> v_key;
            IF v_old_val IS DISTINCT FROM v_new_val THEN
                v_changes := v_changes || jsonb_build_object(v_key, jsonb_build_object('before', v_old_val, 'after', v_new_val));
            END IF;
        END LOOP;
        /* Skip insert als er niets is veranderd (e.g. user klikte 'Opslaan'
           zonder wijziging) — voorkomt log-spam. */
        IF v_changes = '{}'::jsonb THEN
            RETURN NEW;
        END IF;
    END IF;

    INSERT INTO audit_log (organization_id, record_table, record_id, action, user_id, changes)
    VALUES (v_org_id, TG_TABLE_NAME, v_record_id, lower(TG_OP), v_user_id, v_changes);

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION audit_log_changes IS 'Generic trigger function — log INSERT/UPDATE/DELETE naar audit_log met diff-only changes voor UPDATE.';

-- ── Apply triggers per kritieke tabel ─────────────────────────────────

-- Gerechten: prijs/allergenen-changes zijn audit-relevant.
DROP TRIGGER IF EXISTS trg_audit_gerechten ON gerechten;
CREATE TRIGGER trg_audit_gerechten
    AFTER INSERT OR UPDATE OR DELETE ON gerechten
    FOR EACH ROW EXECUTE FUNCTION audit_log_changes();

-- Offertes: line-items + status-changes zijn dispuut-gevoelig.
DROP TRIGGER IF EXISTS trg_audit_offertes ON offertes;
CREATE TRIGGER trg_audit_offertes
    AFTER INSERT OR UPDATE OR DELETE ON offertes
    FOR EACH ROW EXECUTE FUNCTION audit_log_changes();

-- Facturen: status-changes (concept → verzonden → betaald) en bedrag-edits.
DROP TRIGGER IF EXISTS trg_audit_facturen ON facturen;
CREATE TRIGGER trg_audit_facturen
    AFTER INSERT OR UPDATE OR DELETE ON facturen
    FOR EACH ROW EXECUTE FUNCTION audit_log_changes();

-- Menu-templates: minder kritisch maar handig voor "wie heeft het zomer-menu
-- aangepast vlak voor het bruidspaar-event".
DROP TRIGGER IF EXISTS trg_audit_menu_templates ON menu_templates;
CREATE TRIGGER trg_audit_menu_templates
    AFTER INSERT OR UPDATE OR DELETE ON menu_templates
    FOR EACH ROW EXECUTE FUNCTION audit_log_changes();
