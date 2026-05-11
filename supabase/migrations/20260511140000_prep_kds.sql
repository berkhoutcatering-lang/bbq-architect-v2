-- =============================================================
--  Prep-KDS — Productieplanning + Station-Board voor BBQ-keuken
-- =============================================================
--
--  Bouwt voort op service-mode KDS (migration 012) maar lost een
--  ander probleem op: niet à-la-minute uitgifte, maar multi-event
--  prep-orkestratie met BBQ-specifieke long-prep-chains
--  (pekel D-3 → rub D-2 → smoke D-1 → rust D0).
--
--  Drie Golden Pillars (zie plan):
--    1) Backward-scheduled Smoker Timeline (CREATE)
--    2) Multi-Event Aggregated Station Board (RAISE)
--    3) Gloved-Hand-First UI (REDUCE+CREATE)
--
--  Wijzigingen:
--    1. kitchen_stations — fysieke werkplekken (smoker/grill/koud/...)
--    2. prep_tasks — uitbreiding met status/assignee/station/phase/qty
--    3. prep_task_dependencies — DAG voor "pekel komt voor rub"
--    4. kds_device_sessions — tablet-tokens voor display-mode
--    5. kds_audit_logs — append-only voor HACCP/KHN + PIN-pogingen
--    6. personeel.kds_pin_hash — 4-digit PIN per crew-lid
--    7. RLS + indexen + triggers
--
--  Hard rule: target_qty NOOIT AI-derived → server-only
--  via productionQty.ts (formule guests × qty_pp / yield).
-- =============================================================

-- ── 1. kitchen_stations ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS kitchen_stations (
    id                  BIGSERIAL PRIMARY KEY,
    organization_id     UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name                TEXT NOT NULL,
    type                TEXT NOT NULL DEFAULT 'prep'
                          CHECK (type IN ('smoker','grill','koud','warm','sauzen','expeditie','dessert','bakkerij','prep','overig')),
    color               TEXT NOT NULL DEFAULT '#FFBF00',
    capacity_kg         NUMERIC(8,2),
    capacity_concurrent INT DEFAULT 1 CHECK (capacity_concurrent >= 1),
    sort_order          INT NOT NULL DEFAULT 0,
    archived            BOOLEAN NOT NULL DEFAULT false,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE kitchen_stations IS
    'Fysieke werkplekken in de keuken. Per org configurabel (5 BBQ-defaults seed).';
COMMENT ON COLUMN kitchen_stations.capacity_concurrent IS
    'Aantal taken die parallel kunnen lopen op deze station. Smoker = 1, prep-tafel = 6.';
COMMENT ON COLUMN kitchen_stations.capacity_kg IS
    'Max kg in één batch (smoker rooster, koelkast plank). NULL = onbekend.';

CREATE INDEX IF NOT EXISTS kitchen_stations_org_idx
    ON kitchen_stations(organization_id, sort_order)
    WHERE archived = false;

ALTER TABLE kitchen_stations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS kitchen_stations_select ON kitchen_stations;
DROP POLICY IF EXISTS kitchen_stations_insert ON kitchen_stations;
DROP POLICY IF EXISTS kitchen_stations_update ON kitchen_stations;
DROP POLICY IF EXISTS kitchen_stations_delete ON kitchen_stations;

CREATE POLICY kitchen_stations_select ON kitchen_stations
    FOR SELECT USING (organization_id IN (
        SELECT organization_id FROM organization_members
        WHERE user_id = auth.uid() AND status = 'active'
    ));
CREATE POLICY kitchen_stations_insert ON kitchen_stations
    FOR INSERT WITH CHECK (organization_id IN (
        SELECT organization_id FROM organization_members
        WHERE user_id = auth.uid() AND status = 'active'
    ));
CREATE POLICY kitchen_stations_update ON kitchen_stations
    FOR UPDATE USING (organization_id IN (
        SELECT organization_id FROM organization_members
        WHERE user_id = auth.uid() AND status = 'active'
    ));
CREATE POLICY kitchen_stations_delete ON kitchen_stations
    FOR DELETE USING (organization_id IN (
        SELECT organization_id FROM organization_members
        WHERE user_id = auth.uid() AND status = 'active'
    ));

-- Seed 5 default BBQ-stations voor bestaande organisaties die er nog
-- geen hebben (en voor toekomstige orgs via separate trigger hieronder).
INSERT INTO kitchen_stations (organization_id, name, type, color, capacity_concurrent, sort_order)
SELECT o.id, s.name, s.type, s.color, s.cap, s.ord
FROM organizations o
CROSS JOIN (
    VALUES
        ('Koud',       'koud',       '#3b82f6', 6, 10),
        ('Smoker',     'smoker',     '#ef4444', 1, 20),
        ('Warm',       'warm',       '#f59e0b', 4, 30),
        ('Sauzen',     'sauzen',     '#a855f7', 4, 40),
        ('Expeditie',  'expeditie',  '#22c55e', 8, 50)
) AS s(name, type, color, cap, ord)
WHERE NOT EXISTS (
    SELECT 1 FROM kitchen_stations ks WHERE ks.organization_id = o.id
);

-- Auto-seed voor nieuwe organisaties
CREATE OR REPLACE FUNCTION seed_default_kitchen_stations()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO kitchen_stations (organization_id, name, type, color, capacity_concurrent, sort_order)
    VALUES
        (NEW.id, 'Koud',      'koud',      '#3b82f6', 6, 10),
        (NEW.id, 'Smoker',    'smoker',    '#ef4444', 1, 20),
        (NEW.id, 'Warm',      'warm',      '#f59e0b', 4, 30),
        (NEW.id, 'Sauzen',    'sauzen',    '#a855f7', 4, 40),
        (NEW.id, 'Expeditie', 'expeditie', '#22c55e', 8, 50);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_seed_kitchen_stations ON organizations;
CREATE TRIGGER trg_seed_kitchen_stations
    AFTER INSERT ON organizations
    FOR EACH ROW EXECUTE FUNCTION seed_default_kitchen_stations();

-- ── 2. prep_tasks uitbreiden (non-breaking ADD COLUMN) ─────────
ALTER TABLE prep_tasks
    ADD COLUMN IF NOT EXISTS status TEXT
        CHECK (status IN ('planned','queued','in_progress','done','skipped','blocked'))
        DEFAULT 'planned',
    ADD COLUMN IF NOT EXISTS assignee_id UUID REFERENCES personeel(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS station_id  BIGINT REFERENCES kitchen_stations(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS course_id   BIGINT REFERENCES courses(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS gerecht_id  UUID REFERENCES gerechten(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS scheduled_at  TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS started_at    TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS completed_at  TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS priority SMALLINT NOT NULL DEFAULT 50
        CHECK (priority BETWEEN 0 AND 100),
    ADD COLUMN IF NOT EXISTS notes TEXT,
    ADD COLUMN IF NOT EXISTS target_qty   NUMERIC(10,3),
    ADD COLUMN IF NOT EXISTS target_unit  TEXT,
    ADD COLUMN IF NOT EXISTS actual_qty   NUMERIC(10,3),
    ADD COLUMN IF NOT EXISTS qty_source TEXT
        CHECK (qty_source IN ('server_recipe','manual','headcount_scaled'))
        DEFAULT 'manual',
    ADD COLUMN IF NOT EXISTS phase TEXT
        CHECK (phase IN ('inkoop','pekel','rub','marinade','smoke','grill','warm','koud','plate','service','other'))
        DEFAULT 'other',
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

COMMENT ON COLUMN prep_tasks.status IS
    'planned = ingepland; queued = klaar voor pickup; in_progress = chef bezig; done = klaar; skipped = niet uitgevoerd; blocked = wacht op upstream-task of ingrediënt.';
COMMENT ON COLUMN prep_tasks.target_qty IS
    'Hoeveelheid die nodig is — ALTIJD server-berekend uit recept × headcount. AI mag dit NOOIT zetten.';
COMMENT ON COLUMN prep_tasks.qty_source IS
    'server_recipe = berekend uit recipe×headcount via productionQty.ts; manual = chef ingevuld; headcount_scaled = rescaled na guest-count update.';
COMMENT ON COLUMN prep_tasks.phase IS
    'BBQ-keten: inkoop → pekel → rub/marinade → smoke/grill/koud → plate → service. Bepaalt scheduling-offset.';
COMMENT ON COLUMN prep_tasks.scheduled_at IS
    'Wanneer deze taak moet beginnen — backward-scheduled vanaf event.start − phase-offset.';

-- Backfill: zet status op basis van done-flag voor bestaande rows
UPDATE prep_tasks SET status = 'done' WHERE done = true AND status = 'planned';

-- Indexen voor board-query patterns
CREATE INDEX IF NOT EXISTS prep_tasks_org_sched_idx
    ON prep_tasks(organization_id, scheduled_at);
CREATE INDEX IF NOT EXISTS prep_tasks_station_status_idx
    ON prep_tasks(station_id, status)
    WHERE status IN ('queued','in_progress','planned');
CREATE INDEX IF NOT EXISTS prep_tasks_assignee_active_idx
    ON prep_tasks(assignee_id)
    WHERE status IN ('queued','in_progress');
CREATE INDEX IF NOT EXISTS prep_tasks_event_phase_idx
    ON prep_tasks(event_id, phase);

-- updated_at trigger zodat realtime/optimistic-UI versie-conflicts kan detecteren
CREATE OR REPLACE FUNCTION trigger_prep_tasks_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS prep_tasks_updated_at_trg ON prep_tasks;
CREATE TRIGGER prep_tasks_updated_at_trg
    BEFORE UPDATE ON prep_tasks
    FOR EACH ROW EXECUTE FUNCTION trigger_prep_tasks_updated_at();

-- Houd done-flag synchroon met status zodat oude UI-componenten blijven werken
CREATE OR REPLACE FUNCTION sync_prep_tasks_done_flag()
RETURNS TRIGGER AS $$
BEGIN
    NEW.done = (NEW.status = 'done');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS prep_tasks_sync_done_trg ON prep_tasks;
CREATE TRIGGER prep_tasks_sync_done_trg
    BEFORE INSERT OR UPDATE OF status ON prep_tasks
    FOR EACH ROW EXECUTE FUNCTION sync_prep_tasks_done_flag();

-- ── 3. prep_task_dependencies — DAG ───────────────────────────
CREATE TABLE IF NOT EXISTS prep_task_dependencies (
    id              BIGSERIAL PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    task_id         INT NOT NULL REFERENCES prep_tasks(id) ON DELETE CASCADE,
    depends_on_id   INT NOT NULL REFERENCES prep_tasks(id) ON DELETE CASCADE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(task_id, depends_on_id),
    CHECK (task_id <> depends_on_id)
);

COMMENT ON TABLE prep_task_dependencies IS
    'DAG voor "pekel moet klaar zijn voor rub start". Niet lineair — sommige gerechten hebben parallelle phases.';

CREATE INDEX IF NOT EXISTS ptd_task_idx
    ON prep_task_dependencies(task_id);
CREATE INDEX IF NOT EXISTS ptd_depends_idx
    ON prep_task_dependencies(depends_on_id);
CREATE INDEX IF NOT EXISTS ptd_org_idx
    ON prep_task_dependencies(organization_id);

ALTER TABLE prep_task_dependencies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ptd_select ON prep_task_dependencies;
DROP POLICY IF EXISTS ptd_insert ON prep_task_dependencies;
DROP POLICY IF EXISTS ptd_update ON prep_task_dependencies;
DROP POLICY IF EXISTS ptd_delete ON prep_task_dependencies;

CREATE POLICY ptd_select ON prep_task_dependencies
    FOR SELECT USING (organization_id IN (
        SELECT organization_id FROM organization_members
        WHERE user_id = auth.uid() AND status = 'active'
    ));
CREATE POLICY ptd_insert ON prep_task_dependencies
    FOR INSERT WITH CHECK (organization_id IN (
        SELECT organization_id FROM organization_members
        WHERE user_id = auth.uid() AND status = 'active'
    ));
CREATE POLICY ptd_update ON prep_task_dependencies
    FOR UPDATE USING (organization_id IN (
        SELECT organization_id FROM organization_members
        WHERE user_id = auth.uid() AND status = 'active'
    ));
CREATE POLICY ptd_delete ON prep_task_dependencies
    FOR DELETE USING (organization_id IN (
        SELECT organization_id FROM organization_members
        WHERE user_id = auth.uid() AND status = 'active'
    ));

-- ── 4. kds_device_sessions — tablet/monitor tokens ────────────
CREATE TABLE IF NOT EXISTS kds_device_sessions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    device_name     TEXT NOT NULL,
    station_id      BIGINT REFERENCES kitchen_stations(id) ON DELETE SET NULL,
    token_hash      TEXT NOT NULL,
    scope           TEXT NOT NULL DEFAULT 'read_only_display'
                      CHECK (scope IN ('read_only_display','write','read')),
    pin_required    BOOLEAN NOT NULL DEFAULT true,
    last_seen_at    TIMESTAMPTZ,
    revoked_at      TIMESTAMPTZ,
    created_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (organization_id, device_name)
);

COMMENT ON TABLE kds_device_sessions IS
    'Persistente tablet/monitor-sessies voor display-mode. Token-hash = bcrypt, plaintext alleen op moment van aanmaken zichtbaar.';
COMMENT ON COLUMN kds_device_sessions.scope IS
    'read_only_display = monitor (default); write = volledige interactie na PIN; read = inspector zonder writes.';

CREATE INDEX IF NOT EXISTS kds_dev_org_active_idx
    ON kds_device_sessions(organization_id)
    WHERE revoked_at IS NULL;

ALTER TABLE kds_device_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS kds_dev_select ON kds_device_sessions;
DROP POLICY IF EXISTS kds_dev_insert ON kds_device_sessions;
DROP POLICY IF EXISTS kds_dev_update ON kds_device_sessions;
DROP POLICY IF EXISTS kds_dev_delete ON kds_device_sessions;

-- Alleen Admin/Pitmaster mogen device-sessions zien/maken/intrekken
CREATE POLICY kds_dev_select ON kds_device_sessions
    FOR SELECT USING (organization_id IN (
        SELECT organization_id FROM organization_members
        WHERE user_id = auth.uid() AND status = 'active'
          AND role IN ('Admin','Pitmaster')
    ));
CREATE POLICY kds_dev_insert ON kds_device_sessions
    FOR INSERT WITH CHECK (organization_id IN (
        SELECT organization_id FROM organization_members
        WHERE user_id = auth.uid() AND status = 'active'
          AND role IN ('Admin','Pitmaster')
    ));
CREATE POLICY kds_dev_update ON kds_device_sessions
    FOR UPDATE USING (organization_id IN (
        SELECT organization_id FROM organization_members
        WHERE user_id = auth.uid() AND status = 'active'
          AND role IN ('Admin','Pitmaster')
    ));
CREATE POLICY kds_dev_delete ON kds_device_sessions
    FOR DELETE USING (organization_id IN (
        SELECT organization_id FROM organization_members
        WHERE user_id = auth.uid() AND status = 'active'
          AND role = 'Admin'
    ));

-- ── 5. kds_audit_logs — append-only voor HACCP + PIN-pogingen ─
CREATE TABLE IF NOT EXISTS kds_audit_logs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    task_id         INT REFERENCES prep_tasks(id) ON DELETE SET NULL,
    device_session_id UUID REFERENCES kds_device_sessions(id) ON DELETE SET NULL,
    personeel_id    UUID REFERENCES personeel(id) ON DELETE SET NULL,
    /* action: task_started | task_completed | task_skipped | task_reassigned |
       pin_failed | pin_locked | device_token_created | device_token_revoked |
       bulk_scheduled | bulk_rescaled */
    action          TEXT NOT NULL,
    metadata        JSONB NOT NULL DEFAULT '{}'::jsonb,
    at_time         TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE kds_audit_logs IS
    'Append-only audit voor Prep-KDS — HACCP-compliance + PIN-brute-force-detectie. GEEN delete-policy.';

CREATE INDEX IF NOT EXISTS kds_audit_org_time_idx
    ON kds_audit_logs(organization_id, at_time DESC);
CREATE INDEX IF NOT EXISTS kds_audit_task_idx
    ON kds_audit_logs(task_id);
CREATE INDEX IF NOT EXISTS kds_audit_pin_failed_idx
    ON kds_audit_logs(organization_id, personeel_id, at_time DESC)
    WHERE action = 'pin_failed';

ALTER TABLE kds_audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS kds_audit_select ON kds_audit_logs;
DROP POLICY IF EXISTS kds_audit_insert ON kds_audit_logs;

CREATE POLICY kds_audit_select ON kds_audit_logs
    FOR SELECT USING (organization_id IN (
        SELECT organization_id FROM organization_members
        WHERE user_id = auth.uid() AND status = 'active'
    ));
CREATE POLICY kds_audit_insert ON kds_audit_logs
    FOR INSERT WITH CHECK (organization_id IN (
        SELECT organization_id FROM organization_members
        WHERE user_id = auth.uid() AND status = 'active'
    ));
-- GEEN UPDATE/DELETE policy → append-only.

-- ── 6. personeel.kds_pin_hash + lockout_until ─────────────────
ALTER TABLE personeel
    ADD COLUMN IF NOT EXISTS kds_pin_hash TEXT,
    ADD COLUMN IF NOT EXISTS kds_pin_lockout_until TIMESTAMPTZ;

COMMENT ON COLUMN personeel.kds_pin_hash IS
    '4-digit bcrypt-hash. NULL = nog niet ingesteld; chef-de-partie kan dan geen writes doen in display-mode.';
COMMENT ON COLUMN personeel.kds_pin_lockout_until IS
    'Gezet door /api/prep/device-verify na 5 mislukte pogingen. Verloopt na 5 min.';

CREATE INDEX IF NOT EXISTS personeel_kds_lockout_idx
    ON personeel(kds_pin_lockout_until)
    WHERE kds_pin_lockout_until IS NOT NULL;

-- ── 7. Cron: cleanup oude device-sessions + lockouts ──────────
-- Verwijder revoked device-sessies ouder dan 90 dagen (AVG retention)
-- en oude lockouts. Wordt door externe cron getriggerd via /api/cron/kds-cleanup.

CREATE OR REPLACE FUNCTION kds_cleanup_expired()
RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
    purged INT := 0;
BEGIN
    -- Verwijder revoked device-sessies ouder dan 90 dagen
    DELETE FROM kds_device_sessions
    WHERE revoked_at IS NOT NULL
      AND revoked_at < now() - INTERVAL '90 days';
    GET DIAGNOSTICS purged = ROW_COUNT;

    -- Reset verlopen PIN-lockouts (cosmetisch — verify-functie checkt zelf ook)
    UPDATE personeel
    SET kds_pin_lockout_until = NULL
    WHERE kds_pin_lockout_until < now();

    RETURN purged;
END;
$$;

COMMENT ON FUNCTION kds_cleanup_expired IS
    'Roep periodiek (dagelijks) aan via /api/cron/kds-cleanup. Returnt aantal verwijderde device-sessions.';

-- =============================================================
--  Einde 20260511140000_prep_kds.sql
-- =============================================================
