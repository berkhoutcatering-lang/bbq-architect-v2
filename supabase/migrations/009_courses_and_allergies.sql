-- Sprint #1: Service Mode courses-datamodel + allergies + diet-counts
--
-- Vóór deze migratie kon Service Mode alléén op hardcoded EVENT_BRUILOFT /
-- EVENT_BEDRIJFSFEEST / EVENT_VERJAARDAG mock-data draaien — een echt event
-- selecteren leverde een legen courses-array op en de KDS was onbruikbaar.
--
-- Drie wijzigingen:
--
-- 1) events: extra diet-count kolommen
--    veg_guests, vegan_guests, gluten_free_guests, allergy_count
--    Service Mode hub-card toont deze metrics; Rook AI gebruikt ze in
--    context-prompt. NULL = niet ingevuld.
--
-- 2) courses tabel — per event een geordende lijst gangen.
--    JSONB voor steps/mise/plating/quality_checks/items omdat:
--      - sub-tabellen voegen 4 extra JOINs toe per Service Mode load
--      - structuur is rich-but-rare-changes (dish-engineering, niet runtime)
--      - per-tafel item-status (served/ready/inProgress) verandert tijdens
--        service maar dat blijft localStorage tot er multi-user-sync nodig is
--    `num` is 1-based volgorde; CHECK > 0 zodat AI het altijd correct kan
--    interpreteren.
--
-- 3) event_allergies tabel — per gast (tafel + seat) allergie-info.
--    allergens TEXT[] omdat we presentation-codes (G/L/N/V/VE/E/S/F/M)
--    bewust generic willen houden. severity ENUM-achtig via CHECK.
--
-- Strategie voor backwards compat: alle nieuwe tabellen/kolommen zijn
-- nullable/optional. De service-mode page valt terug op mock data als een
-- gekozen event geen rows in courses heeft — dus dit ship-en zonder
-- gebruikers-impact tot er courses worden ingevoerd.

-- ── 1. Diet-counts op events ──────────────────────────────────────────
ALTER TABLE events
    ADD COLUMN IF NOT EXISTS veg_guests INTEGER,
    ADD COLUMN IF NOT EXISTS vegan_guests INTEGER,
    ADD COLUMN IF NOT EXISTS gluten_free_guests INTEGER;

COMMENT ON COLUMN events.veg_guests IS 'Aantal vegetarische gasten — gebruikt voor mise/portionering en AI context.';
COMMENT ON COLUMN events.vegan_guests IS 'Aantal vegan gasten.';
COMMENT ON COLUMN events.gluten_free_guests IS 'Aantal glutenvrije gasten.';

-- ── 2. courses tabel ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS courses (
    id BIGSERIAL PRIMARY KEY,
    event_id BIGINT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    num INTEGER NOT NULL CHECK (num > 0),
    title TEXT NOT NULL,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'queued'
        CHECK (status IN ('queued', 'active', 'ready', 'served', 'recalled')),
    emoji TEXT,
    image_gradient TEXT,
    prep_time_minutes INTEGER,
    serve_offset_minutes INTEGER,
    veg_option TEXT,
    ai_note TEXT,
    /* JSONB-velden — zie module-comment voor rationale. */
    steps JSONB DEFAULT '[]'::jsonb,         /* [{n, action, detail}] */
    mise JSONB DEFAULT '[]'::jsonb,          /* [{item, qty, source?, inventory_id?}] */
    plating JSONB DEFAULT '[]'::jsonb,       /* string[] */
    quality_checks JSONB DEFAULT '[]'::jsonb,/* string[] */
    items JSONB DEFAULT '[]'::jsonb,         /* [{table, count, served, ready, inProgress, special}] */
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (event_id, num)
);

CREATE INDEX IF NOT EXISTS courses_event_id_idx ON courses (event_id);
CREATE INDEX IF NOT EXISTS courses_organization_id_idx ON courses (organization_id);

COMMENT ON TABLE courses IS
    'Gangen per event — voedt Service Mode KDS. JSONB voor rich-but-stable structuur.';
COMMENT ON COLUMN courses.num IS '1-based volgorde van de gang in het menu.';
COMMENT ON COLUMN courses.steps IS 'Bereidingsstappen [{n, action, detail}].';
COMMENT ON COLUMN courses.mise IS 'Mise-en-place items [{item, qty, source?, inventory_id?}].';
COMMENT ON COLUMN courses.items IS 'Per-tafel portions [{table, count, served, ready, inProgress, special}].';

-- RLS — courses zichtbaar voor org-leden
ALTER TABLE courses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS courses_org_read ON courses;
CREATE POLICY courses_org_read ON courses FOR SELECT
    USING (
        organization_id IS NULL
        OR organization_id IN (
            SELECT organization_id FROM organization_members
            WHERE user_id = auth.uid() AND status = 'active'
        )
    );

DROP POLICY IF EXISTS courses_org_write ON courses;
CREATE POLICY courses_org_write ON courses FOR ALL
    USING (
        organization_id IS NULL
        OR organization_id IN (
            SELECT organization_id FROM organization_members
            WHERE user_id = auth.uid() AND status = 'active'
        )
    )
    WITH CHECK (
        organization_id IS NULL
        OR organization_id IN (
            SELECT organization_id FROM organization_members
            WHERE user_id = auth.uid() AND status = 'active'
        )
    );

-- ── 3. event_allergies tabel ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS event_allergies (
    id BIGSERIAL PRIMARY KEY,
    event_id BIGINT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    table_num INTEGER,
    seat_num INTEGER,
    name TEXT,
    allergens TEXT[] DEFAULT '{}'::text[],
    note TEXT,
    severity TEXT DEFAULT 'normal'
        CHECK (severity IN ('normal', 'high', 'critical')),
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS event_allergies_event_id_idx ON event_allergies (event_id);

COMMENT ON TABLE event_allergies IS
    'Per gast/tafel allergie-info; voedt Service Mode allergy-tabel + AI Rook context.';
COMMENT ON COLUMN event_allergies.allergens IS
    'Codes zoals G/L/N/V/VE/E/S/F/M (vrij invulbare strings).';
COMMENT ON COLUMN event_allergies.severity IS
    'normal | high | critical — Rook escaleert critical met aparte directive.';

ALTER TABLE event_allergies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS event_allergies_org_read ON event_allergies;
CREATE POLICY event_allergies_org_read ON event_allergies FOR SELECT
    USING (
        organization_id IS NULL
        OR organization_id IN (
            SELECT organization_id FROM organization_members
            WHERE user_id = auth.uid() AND status = 'active'
        )
    );

DROP POLICY IF EXISTS event_allergies_org_write ON event_allergies;
CREATE POLICY event_allergies_org_write ON event_allergies FOR ALL
    USING (
        organization_id IS NULL
        OR organization_id IN (
            SELECT organization_id FROM organization_members
            WHERE user_id = auth.uid() AND status = 'active'
        )
    )
    WITH CHECK (
        organization_id IS NULL
        OR organization_id IN (
            SELECT organization_id FROM organization_members
            WHERE user_id = auth.uid() AND status = 'active'
        )
    );

-- ── 4. updated_at trigger op courses ──────────────────────────────────
CREATE OR REPLACE FUNCTION set_courses_updated_at() RETURNS trigger AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS courses_set_updated_at ON courses;
CREATE TRIGGER courses_set_updated_at
    BEFORE UPDATE ON courses
    FOR EACH ROW
    EXECUTE FUNCTION set_courses_updated_at();
