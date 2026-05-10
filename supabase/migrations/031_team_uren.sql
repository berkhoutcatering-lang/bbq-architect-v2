-- ============================================================
-- 031 — Team Uren-Klok Systeem
-- ============================================================
--
-- Verandert /uren van single-person punch-in naar een team-wallboard.
-- Wat hier in zit:
--   1. CREATE TABLE personeel — los van auth.users zodat gast-koks
--      zonder login ook ingeklokt kunnen worden.
--   2. ALTER time_logs — voeg personeel_id / event_id /
--      uurtarief_snapshot / clocked_in_by toe.
--   3. UNIQUE INDEX voorkomt dubbele actieve klok per persoon.
--   4. Backfill: maak personeel-record voor elke org-Admin en
--      koppel bestaande logs daaraan.
--   5. Trigger schrijft elke klok-actie naar audit_log met
--      leesbare metadata (voor de AuditBlock-feed op /uren).
--   6. RLS: alle org-leden zien alle logs (wallboard); INSERT
--      en UPDATE blijven org-scoped (huidig patroon werkt).

-- ── 1. Personeel-tabel ──────────────────────────────────────

CREATE TABLE IF NOT EXISTS personeel (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id         UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  naam            TEXT NOT NULL,
  email           TEXT,
  telefoon        TEXT,
  functie         TEXT NOT NULL DEFAULT 'Crew'
                    CHECK (functie IN ('Pitmaster', 'Sous-chef', 'Grill', 'Service', 'Bar', 'Crew')),
  uurtarief       NUMERIC(8,2) NOT NULL DEFAULT 35.00,
  contract_type   TEXT NOT NULL DEFAULT 'oproep'
                    CHECK (contract_type IN ('vast', 'oproep', 'freelance', 'stagiair')),
  actief          BOOLEAN NOT NULL DEFAULT true,
  notitie         TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE personeel IS 'Crew-leden per organisatie. user_id = NULL betekent gast-kok zonder login.';
COMMENT ON COLUMN personeel.uurtarief IS 'Default uurtarief; wordt gesnapshot in time_logs.uurtarief_snapshot bij elke klok-actie.';

CREATE INDEX IF NOT EXISTS idx_personeel_org ON personeel(organization_id);
CREATE INDEX IF NOT EXISTS idx_personeel_user ON personeel(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_personeel_org_actief ON personeel(organization_id) WHERE actief = true;

ALTER TABLE personeel ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "personeel_select" ON personeel;
DROP POLICY IF EXISTS "personeel_insert" ON personeel;
DROP POLICY IF EXISTS "personeel_update" ON personeel;
DROP POLICY IF EXISTS "personeel_delete" ON personeel;

CREATE POLICY "personeel_select" ON personeel
  FOR SELECT USING (organization_id IN (
    SELECT organization_id FROM organization_members
    WHERE user_id = auth.uid() AND status = 'active'
  ));
CREATE POLICY "personeel_insert" ON personeel
  FOR INSERT WITH CHECK (organization_id IN (
    SELECT organization_id FROM organization_members
    WHERE user_id = auth.uid() AND status = 'active'
  ));
CREATE POLICY "personeel_update" ON personeel
  FOR UPDATE USING (organization_id IN (
    SELECT organization_id FROM organization_members
    WHERE user_id = auth.uid() AND status = 'active'
  ));
CREATE POLICY "personeel_delete" ON personeel
  FOR DELETE USING (organization_id IN (
    SELECT organization_id FROM organization_members
    WHERE user_id = auth.uid() AND status = 'active'
  ));

-- ── 2. time_logs uitbreiden ─────────────────────────────────

ALTER TABLE time_logs
  ADD COLUMN IF NOT EXISTS personeel_id        UUID REFERENCES personeel(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS event_id            INT  REFERENCES events(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS uurtarief_snapshot  NUMERIC(8,2),
  ADD COLUMN IF NOT EXISTS clocked_in_by       UUID REFERENCES auth.users(id) ON DELETE SET NULL;

COMMENT ON COLUMN time_logs.personeel_id      IS 'Voor wie deze klok-actie is. NULL = legacy log van vóór team-systeem.';
COMMENT ON COLUMN time_logs.event_id          IS 'Optioneel — koppelt uren aan een event voor loonkost-rapportage.';
COMMENT ON COLUMN time_logs.uurtarief_snapshot IS 'Bevroren uurtarief op moment van punch-in. Wijzigt niet als personeel-tarief later verandert.';
COMMENT ON COLUMN time_logs.clocked_in_by     IS 'Welke ingelogde user heeft de klok-actie gedaan (jezelf of een manager).';

CREATE INDEX IF NOT EXISTS idx_time_logs_personeel ON time_logs(personeel_id);
CREATE INDEX IF NOT EXISTS idx_time_logs_event ON time_logs(event_id);
CREATE INDEX IF NOT EXISTS idx_time_logs_org_active
  ON time_logs(organization_id) WHERE end_time IS NULL;

-- Voorkom dubbele actieve klok per persoon (UI vangt dit ook af).
CREATE UNIQUE INDEX IF NOT EXISTS ux_time_logs_active_per_person
  ON time_logs(personeel_id) WHERE end_time IS NULL AND personeel_id IS NOT NULL;

-- ── 3. Backfill — koppel bestaande logs aan org-Admin ────────
--
-- 3a. Maak voor elke org-Admin (of eerste lid) een personeel-record
--     dat aan zijn user_id gekoppeld is, mits er nog geen bestaat.

INSERT INTO personeel (organization_id, user_id, naam, functie, uurtarief)
SELECT DISTINCT ON (om.organization_id, om.user_id)
       om.organization_id,
       om.user_id,
       COALESCE(p.naam, split_part(p.email, '@', 1), 'Eigenaar'),
       'Pitmaster',
       35.00
FROM organization_members om
LEFT JOIN profiles p ON p.user_id = om.user_id AND p.organization_id = om.organization_id
WHERE om.status = 'active'
  AND NOT EXISTS (
    SELECT 1 FROM personeel pe
    WHERE pe.user_id = om.user_id AND pe.organization_id = om.organization_id
  )
ORDER BY om.organization_id, om.user_id, om.role = 'Admin' DESC, om.joined_at;

-- 3b. Koppel bestaande time_logs zonder personeel_id aan de Admin
--     van hun organisatie.

UPDATE time_logs tl
SET personeel_id = (
      SELECT pe.id FROM personeel pe
      JOIN organization_members om
        ON om.user_id = pe.user_id
       AND om.organization_id = pe.organization_id
      WHERE pe.organization_id = tl.organization_id
      ORDER BY om.role = 'Admin' DESC, om.joined_at
      LIMIT 1
    ),
    uurtarief_snapshot = COALESCE(uurtarief_snapshot, 35.00)
WHERE personeel_id IS NULL
  AND organization_id IS NOT NULL;

-- ── 4. audit_log tabel + time_logs trigger voor activity feed ──
--
-- audit_log bestaat in sommige DBs al (migratie 017), in andere nog niet.
-- We zorgen er direct voor dat hij bestaat met de juiste CHECK-constraint
-- die ook 'time_logs' toelaat. Bestaande constraint wordt veilig vervangen.

CREATE TABLE IF NOT EXISTS audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    record_table TEXT NOT NULL,
    record_id BIGINT NOT NULL,
    action TEXT NOT NULL CHECK (action IN ('insert', 'update', 'delete')),
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    changed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    changes JSONB NOT NULL DEFAULT '{}'::jsonb,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_audit_log_record ON audit_log(record_table, record_id, changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_org ON audit_log(organization_id, changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_user ON audit_log(user_id, changed_at DESC);

-- (Her)zet de CHECK-constraint zodat 'time_logs' is toegestaan naast de
-- bestaande tabellen. Bestaande naam wordt eerst gedropt.
ALTER TABLE audit_log DROP CONSTRAINT IF EXISTS audit_log_record_table_check;
ALTER TABLE audit_log ADD CONSTRAINT audit_log_record_table_check
  CHECK (record_table IN ('gerechten', 'offertes', 'facturen', 'menu_templates', 'time_logs', 'personeel'));

ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "audit_log_select" ON audit_log;
DROP POLICY IF EXISTS "audit_log_insert" ON audit_log;

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

CREATE OR REPLACE FUNCTION log_time_log_action()
RETURNS TRIGGER AS $$
DECLARE
  v_personeel_naam TEXT;
  v_event_naam     TEXT;
  v_actor_naam     TEXT;
  v_duration_ms    BIGINT;
  v_event_kind     TEXT;
  v_uid            UUID;
BEGIN
  /* auth.uid() kan NULL zijn bij service-role calls. */
  BEGIN v_uid := auth.uid(); EXCEPTION WHEN OTHERS THEN v_uid := NULL; END;

  SELECT naam INTO v_personeel_naam FROM personeel
    WHERE id = COALESCE(NEW.personeel_id, OLD.personeel_id);
  SELECT name INTO v_event_naam FROM events
    WHERE id = COALESCE(NEW.event_id, OLD.event_id);
  SELECT naam INTO v_actor_naam FROM profiles
    WHERE user_id = v_uid LIMIT 1;

  IF TG_OP = 'INSERT' THEN
    v_event_kind := 'punch_in';
  ELSIF TG_OP = 'UPDATE' AND OLD.end_time IS NULL AND NEW.end_time IS NOT NULL THEN
    v_event_kind := 'punch_out';
    v_duration_ms := EXTRACT(EPOCH FROM (NEW.end_time - NEW.start_time)) * 1000;
  ELSIF TG_OP = 'UPDATE' THEN
    v_event_kind := 'manual_edit';
  ELSE
    v_event_kind := 'delete';
  END IF;

  INSERT INTO audit_log (organization_id, record_table, record_id, action, user_id, metadata)
  VALUES (
    COALESCE(NEW.organization_id, OLD.organization_id),
    'time_logs',
    COALESCE(NEW.id, OLD.id),
    CASE TG_OP WHEN 'DELETE' THEN 'delete' WHEN 'INSERT' THEN 'insert' ELSE 'update' END,
    v_uid,
    jsonb_build_object(
      'event_kind',     v_event_kind,
      'personeel_naam', v_personeel_naam,
      'event_naam',     v_event_naam,
      'actor_naam',     v_actor_naam,
      'duration_ms',    v_duration_ms
    )
  );

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION log_time_log_action IS 'Schrijft elke klok-actie naar audit_log met human-readable metadata voor AuditBlock op /uren.';

DROP TRIGGER IF EXISTS trg_time_log_audit ON time_logs;
CREATE TRIGGER trg_time_log_audit
  AFTER INSERT OR UPDATE OR DELETE ON time_logs
  FOR EACH ROW EXECUTE FUNCTION log_time_log_action();

-- ── 5. Auto-seed personeel bij nieuwe organization_members ──
--
-- Wanneer iemand wordt toegevoegd aan een organisatie krijgt hij
-- automatisch een personeel-record. Dat voorkomt dat nieuwe gebruikers
-- "verdwaald" raken — ze verschijnen direct in CrewBlock.

CREATE OR REPLACE FUNCTION seed_personeel_for_member()
RETURNS TRIGGER AS $$
DECLARE
  v_naam TEXT;
BEGIN
  IF EXISTS (
    SELECT 1 FROM personeel
    WHERE organization_id = NEW.organization_id AND user_id = NEW.user_id
  ) THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(naam, split_part(email, '@', 1), 'Crew')
    INTO v_naam
    FROM profiles
    WHERE user_id = NEW.user_id
    LIMIT 1;

  INSERT INTO personeel (organization_id, user_id, naam, functie)
  VALUES (
    NEW.organization_id,
    NEW.user_id,
    COALESCE(v_naam, 'Crew'),
    CASE NEW.role WHEN 'Admin' THEN 'Pitmaster' ELSE 'Crew' END
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_seed_personeel ON organization_members;
CREATE TRIGGER trg_seed_personeel
  AFTER INSERT ON organization_members
  FOR EACH ROW EXECUTE FUNCTION seed_personeel_for_member();

-- ── 6. Auto-stop actieve klok als personeel-lid wordt gedeactiveerd ─

CREATE OR REPLACE FUNCTION stop_active_clock_on_personeel_inactive()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.actief = true AND NEW.actief = false THEN
    UPDATE time_logs
    SET end_time = now(),
        status  = 'completed',
        notitie = COALESCE(NULLIF(notitie, ''), '') ||
                  CASE WHEN notitie IS NOT NULL AND notitie <> '' THEN ' · ' ELSE '' END ||
                  '(auto-uitgeklokt: lid gedeactiveerd)'
    WHERE personeel_id = NEW.id AND end_time IS NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_stop_clock_on_inactive ON personeel;
CREATE TRIGGER trg_stop_clock_on_inactive
  AFTER UPDATE OF actief ON personeel
  FOR EACH ROW EXECUTE FUNCTION stop_active_clock_on_personeel_inactive();
