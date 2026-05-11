-- ─────────────────────────────────────────────────────────────
--  Boekhouder-pakket — RGS-categorisering + AI-classify metadata
--
--  Pillar #1 — RGS-native categorisering: bonnen + verkoop-facturen
--    krijgen een rgs_code uit RGS-MKB-subset (zie src/lib/rgsCategories.ts).
--  Pillar #2 — Catering-context: event_id-koppeling op bonnen.
--  Pillar #3 — Twijfel-stapel: ai_classify_status='twijfel'.
--  Pillar #4 — Maand-vergrendeling: locked_at + locked_by_user_id.
--
--  Plan: ~/.claude/plans/we-hebben-het-goofy-coral.md (sectie Boekhouder)
-- ─────────────────────────────────────────────────────────────

-- ── 1. bonnen — RGS + AI-classify ─────────────────────────────
ALTER TABLE bonnen
    ADD COLUMN IF NOT EXISTS rgs_code TEXT,
    ADD COLUMN IF NOT EXISTS rgs_category_label TEXT,
    ADD COLUMN IF NOT EXISTS event_id INTEGER REFERENCES events(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS ai_classify_status TEXT
        DEFAULT 'pending'
        CHECK (ai_classify_status IN ('pending', 'auto_accepted', 'manual', 'twijfel', 'verified')),
    ADD COLUMN IF NOT EXISTS ai_classify_confidence NUMERIC(3,2),
    ADD COLUMN IF NOT EXISTS ai_classify_reasoning TEXT,
    ADD COLUMN IF NOT EXISTS classified_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS classified_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS locked_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS locked_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

COMMENT ON COLUMN bonnen.rgs_code IS
    'Pillar #1 — RGS-MKB-code voor boekhouder-export. Out of bbq-app: WKprIng, WBedAuBz, etc. Zie src/lib/rgsCategories.ts.';
COMMENT ON COLUMN bonnen.event_id IS
    'Pillar #2 — catering-context. Bon gekoppeld aan event = projectkost; null = vaste voorraad/algemene kost.';
COMMENT ON COLUMN bonnen.ai_classify_status IS
    'pending = nog te classificeren, auto_accepted = AI > confidence-threshold, manual = mens overschreef, twijfel = naar review-stapel, verified = vergrendeld.';
COMMENT ON COLUMN bonnen.locked_at IS
    'Pillar #4 — bon is opgenomen in een vergrendeld maandpakket. Daarna read-only voor 7-jaar bewaarplicht.';

CREATE INDEX IF NOT EXISTS bonnen_rgs_code_idx ON bonnen (rgs_code);
CREATE INDEX IF NOT EXISTS bonnen_event_id_idx ON bonnen (event_id);
CREATE INDEX IF NOT EXISTS bonnen_classify_status_idx ON bonnen (organization_id, ai_classify_status);
CREATE INDEX IF NOT EXISTS bonnen_locked_idx ON bonnen (organization_id, locked_at) WHERE locked_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS bonnen_datum_org_idx ON bonnen (organization_id, datum DESC);

-- ── 2. facturen (verkoop) — RGS-omzet-codes ───────────────────
-- Verkoop-facturen krijgen een RGS-opbrengst-code (WOpbCat, WOpbCatDrnk).
-- Default: WOpbCat (food 9%). Boekhouder kan herzien voor dranken-split.
ALTER TABLE facturen
    ADD COLUMN IF NOT EXISTS rgs_code TEXT DEFAULT 'WOpbCat',
    ADD COLUMN IF NOT EXISTS locked_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS locked_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

COMMENT ON COLUMN facturen.rgs_code IS
    'Pillar #1 — RGS-omzet-code (WOpbCat / WOpbCatDrnk). Default food; boekhouder kan splitsen.';

CREATE INDEX IF NOT EXISTS facturen_rgs_code_idx ON facturen (rgs_code);
CREATE INDEX IF NOT EXISTS facturen_locked_idx ON facturen (organization_id, locked_at) WHERE locked_at IS NOT NULL;

-- ── 3. boekhouder_pakketten — maandpakket-archief ─────────────
CREATE TABLE IF NOT EXISTS boekhouder_pakketten (
    id                      BIGSERIAL PRIMARY KEY,
    organization_id         UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    -- Periode (maand of kwartaal)
    period_type             TEXT NOT NULL DEFAULT 'maand' CHECK (period_type IN ('maand', 'kwartaal', 'jaar')),
    period_year             INTEGER NOT NULL,
    period_month            INTEGER CHECK (period_month IS NULL OR (period_month BETWEEN 1 AND 12)),
    period_quarter          INTEGER CHECK (period_quarter IS NULL OR (period_quarter BETWEEN 1 AND 4)),
    -- Wat zit erin (snapshot van tellingen op moment van vergrendeling)
    bonnen_count            INTEGER NOT NULL DEFAULT 0,
    facturen_count          INTEGER NOT NULL DEFAULT 0,
    total_purchases_eur     NUMERIC(12,2) NOT NULL DEFAULT 0,
    total_sales_eur         NUMERIC(12,2) NOT NULL DEFAULT 0,
    btw_voorbelasting_eur   NUMERIC(12,2) NOT NULL DEFAULT 0,
    btw_verschuldigd_eur    NUMERIC(12,2) NOT NULL DEFAULT 0,
    btw_af_te_dragen_eur    NUMERIC(12,2) NOT NULL DEFAULT 0,
    voorraadwaarde_eur      NUMERIC(12,2),
    -- Levering
    delivery_method         TEXT NOT NULL DEFAULT 'download' CHECK (delivery_method IN ('download', 'email', 'portal')),
    sent_to_email           TEXT,
    sent_at                 TIMESTAMPTZ,
    -- Workflow
    status                  TEXT NOT NULL DEFAULT 'concept' CHECK (status IN ('concept', 'locked', 'sent', 'archived')),
    locked_at               TIMESTAMPTZ,
    locked_by_user_id       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    notes                   TEXT,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE boekhouder_pakketten IS
    'Pillar #4 — maandelijks "Boekhouder-pakket" archief. 1 rij per periode, immutable na status=locked. 7-jaar bewaarplicht.';

-- Dedup: maximaal 1 maand-pakket per org per maand
CREATE UNIQUE INDEX IF NOT EXISTS boekhouder_pakketten_month_unique
    ON boekhouder_pakketten (organization_id, period_type, period_year, period_month)
    WHERE period_type = 'maand' AND period_month IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS boekhouder_pakketten_quarter_unique
    ON boekhouder_pakketten (organization_id, period_type, period_year, period_quarter)
    WHERE period_type = 'kwartaal' AND period_quarter IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS boekhouder_pakketten_year_unique
    ON boekhouder_pakketten (organization_id, period_type, period_year)
    WHERE period_type = 'jaar';

CREATE INDEX IF NOT EXISTS boekhouder_pakketten_org_idx
    ON boekhouder_pakketten (organization_id, period_year DESC, period_month DESC NULLS LAST);

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.set_boekhouder_pakketten_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS boekhouder_pakketten_updated_at ON boekhouder_pakketten;
CREATE TRIGGER boekhouder_pakketten_updated_at
    BEFORE UPDATE ON boekhouder_pakketten
    FOR EACH ROW EXECUTE FUNCTION public.set_boekhouder_pakketten_updated_at();

ALTER TABLE boekhouder_pakketten ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS boekhouder_pakketten_select ON boekhouder_pakketten;
CREATE POLICY boekhouder_pakketten_select ON boekhouder_pakketten
    FOR SELECT USING (organization_id IN (SELECT auth.user_org_ids()));

DROP POLICY IF EXISTS boekhouder_pakketten_insert ON boekhouder_pakketten;
CREATE POLICY boekhouder_pakketten_insert ON boekhouder_pakketten
    FOR INSERT WITH CHECK (organization_id IN (SELECT auth.user_org_ids()));

DROP POLICY IF EXISTS boekhouder_pakketten_update ON boekhouder_pakketten;
CREATE POLICY boekhouder_pakketten_update ON boekhouder_pakketten
    FOR UPDATE
    USING (organization_id IN (SELECT auth.user_org_ids()) AND status <> 'locked')  -- locked = immutable
    WITH CHECK (organization_id IN (SELECT auth.user_org_ids()));

DROP POLICY IF EXISTS boekhouder_pakketten_delete ON boekhouder_pakketten;
CREATE POLICY boekhouder_pakketten_delete ON boekhouder_pakketten
    FOR DELETE USING (organization_id IN (SELECT auth.user_org_ids()) AND status = 'concept');

-- ── 4. organizations — boekhouder-instellingen ────────────────
ALTER TABLE organizations
    ADD COLUMN IF NOT EXISTS boekhouder_email TEXT,
    ADD COLUMN IF NOT EXISTS boekhouder_naam TEXT,
    ADD COLUMN IF NOT EXISTS bonnen_retentie_jaar INTEGER NOT NULL DEFAULT 7 CHECK (bonnen_retentie_jaar BETWEEN 1 AND 30),
    ADD COLUMN IF NOT EXISTS ai_classify_threshold NUMERIC(3,2) NOT NULL DEFAULT 0.85 CHECK (ai_classify_threshold BETWEEN 0.50 AND 1.00);

COMMENT ON COLUMN organizations.bonnen_retentie_jaar IS
    'NL bewaarplicht 7 jaar (Art. 52 AWR). Bonnen mogen niet eerder gewist worden.';
COMMENT ON COLUMN organizations.ai_classify_threshold IS
    'Confidence-drempel waarboven AI-classificatie auto-geaccepteerd wordt. Default 0.85 = 85%.';
