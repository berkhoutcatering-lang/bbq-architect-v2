-- ════════════════════════════════════════════════════════════════════════
-- P0.4 — Strict RLS op bonnen met locked_at bescherming.
--
-- De basis-RLS op bonnen is al gezet in 001_multi_tenant.sql:
--   - org_select  (eigen org leest)
--   - org_insert  (eigen org schrijft)
--   - org_update  (eigen org muteert)
--   - org_delete  (eigen org verwijdert)
--
-- Wat hier nieuw bij komt: UPDATE en DELETE worden geblokkeerd zodra
-- locked_at NIET NULL is. Dit is de hoeksteen van Pillar #4
-- (immutable archief voor 7-jaar bewaarplicht Art. 52 AWR).
--
-- AFHANKELIJK VAN: 20260525131000 (locked_at kolom).
-- ════════════════════════════════════════════════════════════════════════

-- 1. Drop bestaande UPDATE-policy (uit 001) en vervang met locked-check.
DROP POLICY IF EXISTS "org_update" ON bonnen;

CREATE POLICY "org_update" ON bonnen
    FOR UPDATE
    USING (
        organization_id IN (SELECT auth.user_org_ids())
        AND locked_at IS NULL
    )
    WITH CHECK (
        organization_id IN (SELECT auth.user_org_ids())
    );

-- 2. Drop bestaande DELETE-policy en vervang met locked-check.
DROP POLICY IF EXISTS "org_delete" ON bonnen;

CREATE POLICY "org_delete" ON bonnen
    FOR DELETE
    USING (
        organization_id IN (SELECT auth.user_org_ids())
        AND locked_at IS NULL
    );

-- 3. Special escape-hatch: alleen Admin-role kan een locked bon unlocken.
--    Dat doen we via een aparte SECURITY DEFINER functie ipv UPDATE-policy
--    (anders zou Admin elke locked bon kunnen muteren). Functie returnt
--    success/failure zodat de UI duidelijk maakt waarom de actie lukte of niet.
CREATE OR REPLACE FUNCTION unlock_bon(p_bon_id BIGINT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_bon_org UUID;
    v_user_role TEXT;
BEGIN
    -- Haal bon's org_id op
    SELECT organization_id INTO v_bon_org FROM bonnen WHERE id = p_bon_id;
    IF v_bon_org IS NULL THEN
        RAISE EXCEPTION 'Bon % not found', p_bon_id;
    END IF;

    -- Check of huidige user Admin is in die org
    SELECT role INTO v_user_role
    FROM organization_members
    WHERE organization_id = v_bon_org
      AND user_id = auth.uid()
      AND status = 'active';

    IF v_user_role IS DISTINCT FROM 'Admin' THEN
        RAISE EXCEPTION 'Alleen Admin kan een vergrendelde bon ontgrendelen';
    END IF;

    -- Tijdelijk de locked-check omzeilen door direct UPDATE
    -- via SECURITY DEFINER (draait als postgres role, omzeilt RLS).
    UPDATE bonnen
    SET locked_at = NULL, locked_by = NULL
    WHERE id = p_bon_id;

    RETURN TRUE;
END;
$$;

COMMENT ON FUNCTION unlock_bon IS
    'Admin-only escape-hatch om een vergrendelde bon te ontgrendelen. Triggert audit_log entry via trigger op bonnen UPDATE.';

REVOKE ALL ON FUNCTION unlock_bon FROM PUBLIC;
GRANT EXECUTE ON FUNCTION unlock_bon TO authenticated;

-- 4. Audit-test (handmatig draaien na deploy):
--    -- Als user A (lid van org X), lock een bon van org X:
--    UPDATE bonnen SET locked_at = now(), locked_by = auth.uid() WHERE id = <X-bon-id>;
--    -- Probeer 'm nu nog te updaten als user A:
--    UPDATE bonnen SET status = 'twijfel' WHERE id = <X-bon-id>;
--    -- Verwacht: 0 rows affected (RLS blokkeert via locked_at IS NULL).
--
--    -- Probeer 'm te deleten:
--    DELETE FROM bonnen WHERE id = <X-bon-id>;
--    -- Verwacht: 0 rows affected.
--
--    -- Unlock via Admin:
--    SELECT unlock_bon(<X-bon-id>);
--    -- Verwacht: TRUE.
