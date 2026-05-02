-- 020_voertuigen_ritten.sql
--
-- Rittenregistratie voor BBQ Architect — Pro-tier feature.
--
-- Pillars uit Phase 2 (2026-05-02):
--   #1 Eén-klik rit-uit-event (event_id FK + onboarding via Plannen)
--   #2 CSV/PDF-export Belastingdienst-velden (alle 7 verplichte velden hier)
--   #3 First-class objects met audit-log (audit_log triggers hieronder)
--   #4 €0,23/km NOOIT AI — hard-coded in src/lib/ritten-tarieven.ts (NIET hier!)
--   #5 Optionele kwartaal-Moneybird-push (ritten_moneybird_pushes log voor idempotency)
--
-- Belastingdienst-eisen sluitende rittenregistratie 2026:
--   Per voertuig: merk, type, kenteken, gebruiksperiode
--   Per rit: datum, begin/eind km-stand, vertrek/aankomst-adres, route bij afwijking,
--            zakelijk/privé classificatie, privé-omleiding bij gemengde ritten
--   Bewaarplicht: 7 jaar (gedekt door Supabase Pro retentie)

-- ── Voertuigen ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS voertuigen (
    id BIGSERIAL PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    kenteken TEXT NOT NULL,
    merk TEXT,
    type TEXT,
    ingangsdatum DATE NOT NULL,
    einddatum DATE,
    begin_km INTEGER NOT NULL DEFAULT 0,
    actief BOOLEAN NOT NULL DEFAULT true,
    notitie TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (begin_km >= 0),
    CHECK (einddatum IS NULL OR einddatum >= ingangsdatum),
    UNIQUE (organization_id, kenteken, ingangsdatum)
);

COMMENT ON TABLE voertuigen IS 'Auto/bus per cateraar. Belastingdienst-eisen: merk + type + kenteken + gebruiksperiode (ingangsdatum-einddatum).';

CREATE INDEX IF NOT EXISTS idx_voertuigen_org ON voertuigen(organization_id) WHERE actief = true;

ALTER TABLE voertuigen ENABLE ROW LEVEL SECURITY;

CREATE POLICY voertuigen_select ON voertuigen FOR SELECT TO authenticated
    USING (organization_id IN (
        SELECT organization_id FROM organization_members
        WHERE user_id = auth.uid() AND status = 'active'
    ));

CREATE POLICY voertuigen_insert ON voertuigen FOR INSERT TO authenticated
    WITH CHECK (organization_id IN (
        SELECT organization_id FROM organization_members
        WHERE user_id = auth.uid() AND status = 'active'
    ));

CREATE POLICY voertuigen_update ON voertuigen FOR UPDATE TO authenticated
    USING (organization_id IN (
        SELECT organization_id FROM organization_members
        WHERE user_id = auth.uid() AND status = 'active'
    ))
    WITH CHECK (organization_id IN (   -- belt + braces tegen tenant-escape
        SELECT organization_id FROM organization_members
        WHERE user_id = auth.uid() AND status = 'active'
    ));

CREATE POLICY voertuigen_delete ON voertuigen FOR DELETE TO authenticated
    USING (organization_id IN (
        SELECT organization_id FROM organization_members
        WHERE user_id = auth.uid() AND status = 'active'
    ));

-- ── Ritten ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ritten (
    id BIGSERIAL PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    voertuig_id BIGINT NOT NULL REFERENCES voertuigen(id) ON DELETE RESTRICT,
    event_id BIGINT REFERENCES events(id) ON DELETE SET NULL,
    datum DATE NOT NULL,
    vertrek_adres TEXT NOT NULL,
    aankomst_adres TEXT NOT NULL,
    route_omleiding TEXT,
    km_begin INTEGER NOT NULL,
    km_eind INTEGER NOT NULL,
    kilometers INTEGER GENERATED ALWAYS AS (km_eind - km_begin) STORED,
    zakelijk BOOLEAN NOT NULL DEFAULT true,
    prive_omleiding_km INTEGER NOT NULL DEFAULT 0,
    doel TEXT,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (km_eind >= km_begin),
    CHECK (prive_omleiding_km >= 0),
    CHECK (prive_omleiding_km <= (km_eind - km_begin))
);

COMMENT ON TABLE ritten IS 'Sluitende rittenregistratie. Velden voldoen aan Belastingdienst-eisen 2026.';

CREATE INDEX IF NOT EXISTS idx_ritten_org_datum ON ritten(organization_id, datum DESC);
CREATE INDEX IF NOT EXISTS idx_ritten_voertuig ON ritten(voertuig_id, datum DESC);
CREATE INDEX IF NOT EXISTS idx_ritten_event ON ritten(event_id) WHERE event_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ritten_org_zakelijk ON ritten(organization_id, zakelijk, datum DESC);

ALTER TABLE ritten ENABLE ROW LEVEL SECURITY;

CREATE POLICY ritten_select ON ritten FOR SELECT TO authenticated
    USING (organization_id IN (
        SELECT organization_id FROM organization_members
        WHERE user_id = auth.uid() AND status = 'active'
    ));

CREATE POLICY ritten_insert ON ritten FOR INSERT TO authenticated
    WITH CHECK (organization_id IN (
        SELECT organization_id FROM organization_members
        WHERE user_id = auth.uid() AND status = 'active'
    ));

CREATE POLICY ritten_update ON ritten FOR UPDATE TO authenticated
    USING (organization_id IN (
        SELECT organization_id FROM organization_members
        WHERE user_id = auth.uid() AND status = 'active'
    ))
    WITH CHECK (organization_id IN (
        SELECT organization_id FROM organization_members
        WHERE user_id = auth.uid() AND status = 'active'
    ));

CREATE POLICY ritten_delete ON ritten FOR DELETE TO authenticated
    USING (organization_id IN (
        SELECT organization_id FROM organization_members
        WHERE user_id = auth.uid() AND status = 'active'
    ));

-- ── Moneybird-push log (idempotency anchor) ──────────────────────────
CREATE TABLE IF NOT EXISTS ritten_moneybird_pushes (
    id BIGSERIAL PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    jaar INTEGER NOT NULL,
    kwartaal INTEGER NOT NULL CHECK (kwartaal BETWEEN 1 AND 4),
    moneybird_invoice_id TEXT NOT NULL,
    totaal_km INTEGER NOT NULL,
    totaal_bedrag NUMERIC(10,2) NOT NULL,
    pushed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    pushed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (organization_id, jaar, kwartaal)  -- 2× pushen Q2 = unique violation
);

CREATE INDEX IF NOT EXISTS idx_rmp_org ON ritten_moneybird_pushes(organization_id, jaar DESC, kwartaal DESC);

ALTER TABLE ritten_moneybird_pushes ENABLE ROW LEVEL SECURITY;

CREATE POLICY rmp_select ON ritten_moneybird_pushes FOR SELECT TO authenticated
    USING (organization_id IN (
        SELECT organization_id FROM organization_members
        WHERE user_id = auth.uid() AND status = 'active'
    ));

CREATE POLICY rmp_insert ON ritten_moneybird_pushes FOR INSERT TO authenticated
    WITH CHECK (organization_id IN (
        SELECT organization_id FROM organization_members
        WHERE user_id = auth.uid() AND status = 'active'
    ));
-- Geen UPDATE/DELETE — append-only voor compliance.

-- ── Audit-log uitbreiden ─────────────────────────────────────────────
ALTER TABLE audit_log DROP CONSTRAINT IF EXISTS audit_log_record_table_check;
ALTER TABLE audit_log ADD CONSTRAINT audit_log_record_table_check
    CHECK (record_table IN ('gerechten', 'offertes', 'facturen', 'menu_templates', 'ritten', 'voertuigen'));

DROP TRIGGER IF EXISTS trg_audit_ritten ON ritten;
CREATE TRIGGER trg_audit_ritten
    AFTER INSERT OR UPDATE OR DELETE ON ritten
    FOR EACH ROW EXECUTE FUNCTION audit_log_changes();

DROP TRIGGER IF EXISTS trg_audit_voertuigen ON voertuigen;
CREATE TRIGGER trg_audit_voertuigen
    AFTER INSERT OR UPDATE OR DELETE ON voertuigen
    FOR EACH ROW EXECUTE FUNCTION audit_log_changes();

-- ── updated_at trigger (herbruikbaar) ────────────────────────────────
CREATE OR REPLACE FUNCTION set_updated_at_v2()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_voertuigen_updated_at ON voertuigen;
CREATE TRIGGER trg_voertuigen_updated_at
    BEFORE UPDATE ON voertuigen
    FOR EACH ROW EXECUTE FUNCTION set_updated_at_v2();

DROP TRIGGER IF EXISTS trg_ritten_updated_at ON ritten;
CREATE TRIGGER trg_ritten_updated_at
    BEFORE UPDATE ON ritten
    FOR EACH ROW EXECUTE FUNCTION set_updated_at_v2();
