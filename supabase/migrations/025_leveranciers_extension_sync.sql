-- ════════════════════════════════════════════════════════════════════════════
--  025 — Leveranciers extension-sync
--  • API-keys voor de Chrome-extensie (per user, gescoped op organization)
--  • Uitbreiding leveranciers met import_method + portal_url + sync-state
--  • leverancier_sync_runs voor audit + UI-status
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. API-KEYS voor Chrome-extensie ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS org_extension_api_keys (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    key_hash        TEXT NOT NULL,                                  -- SHA-256 hex; raw key alleen 1× getoond
    key_prefix      TEXT NOT NULL,                                  -- "ext_a3f4..." voor UI display
    label           TEXT NOT NULL DEFAULT 'Chrome extensie',
    last_used_at    TIMESTAMPTZ,
    use_count       INT NOT NULL DEFAULT 0,
    revoked_at      TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_extension_keys_hash ON org_extension_api_keys(key_hash);
CREATE INDEX IF NOT EXISTS idx_extension_keys_user      ON org_extension_api_keys(user_id);
CREATE INDEX IF NOT EXISTS idx_extension_keys_org       ON org_extension_api_keys(organization_id);

ALTER TABLE org_extension_api_keys ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_keys" ON org_extension_api_keys;
CREATE POLICY "select_own_keys" ON org_extension_api_keys FOR SELECT
    USING (user_id = auth.uid());

DROP POLICY IF EXISTS "insert_own_keys" ON org_extension_api_keys;
CREATE POLICY "insert_own_keys" ON org_extension_api_keys FOR INSERT
    WITH CHECK (
        user_id = auth.uid()
        AND organization_id IN (
            SELECT organization_id FROM organization_members
            WHERE user_id = auth.uid() AND status = 'active'
        )
    );

DROP POLICY IF EXISTS "update_own_keys" ON org_extension_api_keys;
CREATE POLICY "update_own_keys" ON org_extension_api_keys FOR UPDATE
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "delete_own_keys" ON org_extension_api_keys;
CREATE POLICY "delete_own_keys" ON org_extension_api_keys FOR DELETE
    USING (user_id = auth.uid());


-- ── 2. LEVERANCIERS uitbreiding ───────────────────────────────────────────
-- Extension-flow heeft nodig: import_method, portal_url (welke site), sync-state
-- Backwards-compatible: nullable, defaults zorgen dat oude rijen blijven werken.
ALTER TABLE leveranciers
    ADD COLUMN IF NOT EXISTS import_method TEXT
        CHECK (import_method IN ('extension','email_in','csv','manual')),
    ADD COLUMN IF NOT EXISTS portal_url TEXT,
    ADD COLUMN IF NOT EXISTS portal_hint TEXT,                      -- "sligro" / "makro" / "baktotaal" / "vuurenrook" / NULL
    ADD COLUMN IF NOT EXISTS last_sync_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS last_sync_status TEXT
        CHECK (last_sync_status IN ('never','running','completed','partial','failed')) DEFAULT 'never',
    ADD COLUMN IF NOT EXISTS products_count INT DEFAULT 0,
    ADD COLUMN IF NOT EXISTS notes TEXT,
    ADD COLUMN IF NOT EXISTS created_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_leveranciers_org_active
    ON leveranciers(organization_id) WHERE archived_at IS NULL;


-- ── 3. SYNC RUNS — audit + UI-status per scan ────────────────────────────
CREATE TABLE IF NOT EXISTS leverancier_sync_runs (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id     UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    leverancier_id      INTEGER NOT NULL REFERENCES leveranciers(id) ON DELETE CASCADE,
    started_by_user_id  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    extension_key_id    UUID REFERENCES org_extension_api_keys(id) ON DELETE SET NULL,
    started_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    finished_at         TIMESTAMPTZ,
    status              TEXT NOT NULL DEFAULT 'running'
                        CHECK (status IN ('running','completed','partial','failed','cancelled')),
    mode                TEXT NOT NULL DEFAULT 'full'                -- full | incremental | single-page
                        CHECK (mode IN ('full','incremental','single-page')),
    pages_scanned       INT NOT NULL DEFAULT 0,
    products_seen       INT NOT NULL DEFAULT 0,
    products_new        INT NOT NULL DEFAULT 0,
    products_updated    INT NOT NULL DEFAULT 0,
    products_skipped    INT NOT NULL DEFAULT 0,
    ai_calls            INT NOT NULL DEFAULT 0,
    ai_cost_cents       INT NOT NULL DEFAULT 0,
    error_text          TEXT,
    metadata            JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_sync_runs_lev          ON leverancier_sync_runs(leverancier_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_sync_runs_org          ON leverancier_sync_runs(organization_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_sync_runs_running      ON leverancier_sync_runs(organization_id) WHERE status = 'running';

ALTER TABLE leverancier_sync_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_org" ON leverancier_sync_runs;
CREATE POLICY "select_own_org" ON leverancier_sync_runs FOR SELECT
    USING (
        organization_id IS NULL
        OR organization_id IN (
            SELECT organization_id FROM organization_members
            WHERE user_id = auth.uid() AND status = 'active'
        )
    );

-- INSERT/UPDATE alleen via service_role (extension-API)


-- ── 4. PRICE MUTATIONS uitbreiding voor extension-source ─────────────────
-- Migration 024 had source check ('email_inbox','pdf_upload','invoice','manual')
-- Voeg 'extension' toe.
ALTER TABLE org_price_mutations
    DROP CONSTRAINT IF EXISTS org_price_mutations_source_check;
ALTER TABLE org_price_mutations
    ADD CONSTRAINT org_price_mutations_source_check
    CHECK (source IN ('email_inbox','pdf_upload','invoice','manual','extension'));


-- ── 5. SEED bekende portal-hints ─────────────────────────────────────────
-- Helper-functie zodat de wizard kan suggereren: "we kennen dit portal,
-- gebruik portal_hint='sligro' voor de snelle adapter".
CREATE OR REPLACE FUNCTION known_portals() RETURNS TABLE(hint TEXT, naam TEXT, portal_url TEXT) AS $$
    SELECT * FROM (VALUES
        ('sligro',     'Sligro',     'https://www.sligro.nl/'),
        ('makro',      'Makro',      'https://www.makro.nl/'),
        ('baktotaal',  'Baktotaal',  'https://www.baktotaal.nl/'),
        ('vuurenrook', 'Vuur & Rook','https://vuurenrook.nl/'),
        ('hanos',      'Hanos',      'https://www.hanos.nl/'),
        ('bidfood',    'Bidfood',    'https://www.bidfood.nl/')
    ) AS t(hint, naam, portal_url);
$$ LANGUAGE sql IMMUTABLE;

GRANT EXECUTE ON FUNCTION known_portals() TO authenticated;


-- ── 6. AUDIT LOG seed ────────────────────────────────────────────────────
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'audit_log') THEN
        INSERT INTO audit_log (entity_type, entity_id, action, metadata, created_at)
        VALUES ('migration', NULL, 'applied', jsonb_build_object('migration', '025_leveranciers_extension_sync'), now())
        ON CONFLICT DO NOTHING;
    END IF;
END $$;
