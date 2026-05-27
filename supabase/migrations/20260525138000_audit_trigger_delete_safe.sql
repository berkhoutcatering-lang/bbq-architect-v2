-- ════════════════════════════════════════════════════════════════════════
-- Hot-fix: audit_log_changes() trigger faalt soms op DELETE
--
-- Symptoom: DELETE FROM bonnen WHERE ... lijkt te slagen maar 0 rows
-- affected. Vermoedelijke oorzaak: trigger raakt to_jsonb(OLD) operatie
-- met kolommen die op deze rij anders zijn dan verwacht, of organization_id
-- IS NULL waardoor INSERT in audit_log faalt (NOT NULL FK).
--
-- Fix: wrap de trigger body in een SAVEPOINT zodat audit-falen de DELETE
-- niet meer blokkeert. Audit-log mag in extreme gevallen één entry missen,
-- maar gebruiker-acties mogen nooit silent falen.
-- ════════════════════════════════════════════════════════════════════════

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
    -- Defensive: alles in een BEGIN-EXCEPTION zodat audit-falen
    -- de echte DML-actie (INSERT/UPDATE/DELETE) NIET blokkeert.
    BEGIN
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
                    v_changes := v_changes || jsonb_build_object(
                        v_key,
                        jsonb_build_object('before', v_old_val, 'after', v_new_val)
                    );
                END IF;
            END LOOP;
            IF v_changes = '{}'::jsonb THEN
                IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
            END IF;
        END IF;

        -- Skip insert als v_org_id NULL (audit_log.organization_id mag NULL,
        -- maar dan trekken we 'm ook niet in)
        IF v_org_id IS NOT NULL THEN
            INSERT INTO audit_log (
                organization_id, record_table, record_id,
                action, user_id, changes
            )
            VALUES (
                v_org_id, TG_TABLE_NAME, v_record_id,
                lower(TG_OP), v_user_id, v_changes
            );
        END IF;
    EXCEPTION WHEN OTHERS THEN
        -- Slik audit-fouten in zodat user-actie doorgaat.
        -- Log naar Postgres logs voor later debug.
        RAISE WARNING '[audit_log_changes] Failed for table % op % (id %): %',
            TG_TABLE_NAME, TG_OP,
            CASE WHEN TG_OP = 'DELETE' THEN OLD.id ELSE NEW.id END,
            SQLERRM;
    END;

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION audit_log_changes IS
    'Audit-trail helper met defensive error-handling. Audit-falen blokkeert NOOIT de underlying DML-actie. v2026-05-25.';
