-- KDS Service Mode — full-screen live service voor BBQ Architect
--
-- Toegevoegd: per-event live state-tracking (start/end, current course)
-- en een append-only audit-log voor allergeen-overrides en service-acties.
-- De `courses` tabel uit migration 009 heeft al de status-kolom (queued |
-- active | ready | served | recalled) — die blijft de single source of truth
-- voor gang-status. Deze migration voegt twee nieuwe tabellen toe:
--
--   1) service_state: 1 rij per event tijdens live service
--      - started_at/ended_at: wanneer de KDS is gestart/afgesloten
--      - current_course_idx: pointer naar courses[i] voor 'Now'-zone
--      - table_overrides: per tafel allergie-aanpassingen, notities
--
--   2) service_audit_logs: append-only event-log voor compliance
--      - elke status-change, recall, allergeen-override krijgt een entry
--      - GEEN delete-policy (RLS blokkeert delete) — KHN-hygiënecode-proof
--      - by_user FK naar auth.users zodat audit weet wie wat deed

-- ── 1. service_state ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS service_state (
    event_id BIGINT PRIMARY KEY REFERENCES events(id) ON DELETE CASCADE,
    org_id UUID,
    started_at TIMESTAMPTZ,
    ended_at TIMESTAMPTZ,
    current_course_idx INTEGER DEFAULT 0,
    /* Per tafel exception — allergeen-aanpassing, notitie, override-state */
    table_overrides JSONB NOT NULL DEFAULT '{}'::jsonb,
    /* Laatste Rook-suggestie die zichtbaar werd (max 1 actief) */
    rook_alert JSONB,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE service_state IS 'KDS Live state per event — 1 rij actief tijdens service, persistent voor recovery na crash/disconnect.';
COMMENT ON COLUMN service_state.current_course_idx IS '0-based pointer naar courses[i] die nu in Now-zone staat. Server Action update dit bij gang-overgang.';
COMMENT ON COLUMN service_state.table_overrides IS 'Map: tafel_id → { allergen_flags[], replacement_note, override_confirmed_by, override_reason }';

CREATE INDEX IF NOT EXISTS idx_service_state_org ON service_state(org_id);

-- ── 2. service_audit_logs ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS service_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID,
    event_id BIGINT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    course_id BIGINT REFERENCES courses(id) ON DELETE SET NULL,
    table_id TEXT,
    /* action: mark_in_prep | mark_ready | mark_served | recall |
       allergen_override | service_started | service_ended */
    action TEXT NOT NULL,
    allergen_flag BOOLEAN DEFAULT false,
    override_reason TEXT,
    by_user UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    at_time TIMESTAMPTZ NOT NULL DEFAULT now(),
    metadata JSONB DEFAULT '{}'::jsonb
);

COMMENT ON TABLE service_audit_logs IS 'Append-only log voor KHN-compliance — wie deed wat wanneer tijdens service. Geen delete-policy.';

CREATE INDEX IF NOT EXISTS idx_service_audit_event ON service_audit_logs(event_id, at_time DESC);
CREATE INDEX IF NOT EXISTS idx_service_audit_org ON service_audit_logs(org_id, at_time DESC);

-- ── 3. RLS ──────────────────────────────────────────────────────────
-- Hop & Bites werkt single-tenant nu, maar org_id staat al klaar voor
-- multi-tenant uitbreiding. RLS blokkeert cross-tenant lezen/schrijven.

ALTER TABLE service_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_audit_logs ENABLE ROW LEVEL SECURITY;

-- service_state: alle authenticated users binnen dezelfde org
DROP POLICY IF EXISTS "service_state_all_by_org" ON service_state;
CREATE POLICY "service_state_all_by_org" ON service_state
    FOR ALL TO authenticated
    USING (true)
    WITH CHECK (true);
-- ↑ Hop & Bites single-tenant: simple allow. Voor multi-tenant later vervangen
--   door: USING (org_id = (SELECT current_org_id FROM ...))

-- service_audit_logs: SELECT + INSERT, NOOIT UPDATE/DELETE (append-only)
DROP POLICY IF EXISTS "service_audit_logs_select" ON service_audit_logs;
CREATE POLICY "service_audit_logs_select" ON service_audit_logs
    FOR SELECT TO authenticated
    USING (true);

DROP POLICY IF EXISTS "service_audit_logs_insert" ON service_audit_logs;
CREATE POLICY "service_audit_logs_insert" ON service_audit_logs
    FOR INSERT TO authenticated
    WITH CHECK (true);
-- GEEN UPDATE/DELETE-policy → audit-log is append-only.

-- ── 4. updated_at trigger ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION trigger_service_state_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS service_state_updated_at_trg ON service_state;
CREATE TRIGGER service_state_updated_at_trg
    BEFORE UPDATE ON service_state
    FOR EACH ROW
    EXECUTE FUNCTION trigger_service_state_updated_at();
