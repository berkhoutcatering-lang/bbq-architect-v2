-- ─── Fix Hub 1 smoke-test issues — gerechten setup ────────────────────────
-- Sam meldt twee fouten bij gerecht toevoegen:
--   1. "Could not find the 'bron' column of 'gerechten'" — migratie 016 niet
--      gerund, gerechten-tabel mist status + bron kolommen
--   2. "Upload fout: new row violates row-level security policy" —
--      'gerechten-fotos' storage bucket bestaat niet (alleen brand-assets
--      en bonnen zijn aangemaakt in migratie 003)
--
-- Beide idempotent — veilig herhaald draaien.

-- ─── 1. Gerechten status + bron kolommen (van migratie 016) ───────────────

ALTER TABLE gerechten
    ADD COLUMN IF NOT EXISTS status TEXT;

ALTER TABLE gerechten
    ADD COLUMN IF NOT EXISTS bron TEXT DEFAULT 'manual';

-- Backfill bestaande rijen op basis van actief-kolom
UPDATE gerechten SET status = 'actief' WHERE status IS NULL AND actief = true;
UPDATE gerechten SET status = 'inactief' WHERE status IS NULL AND (actief = false OR actief IS NULL);
UPDATE gerechten SET bron = 'manual' WHERE bron IS NULL;

-- Status wordt verplicht met default
ALTER TABLE gerechten
    ALTER COLUMN status SET NOT NULL,
    ALTER COLUMN status SET DEFAULT 'actief';

-- Check-constraints
ALTER TABLE gerechten DROP CONSTRAINT IF EXISTS gerechten_status_check;
ALTER TABLE gerechten ADD CONSTRAINT gerechten_status_check
    CHECK (status IN ('concept', 'review_nodig', 'actief', 'inactief'));

ALTER TABLE gerechten DROP CONSTRAINT IF EXISTS gerechten_bron_check;
ALTER TABLE gerechten ADD CONSTRAINT gerechten_bron_check
    CHECK (bron IN ('manual', 'ai'));

COMMENT ON COLUMN gerechten.status IS 'Workflow-status: concept = niet klant-klaar; review_nodig = ontbrekende velden; actief = klaar voor offerte; inactief = bewust uitgezet.';
COMMENT ON COLUMN gerechten.bron IS 'Hoe gerecht in bibliotheek kwam. manual = user-input; ai = via AI-tool of recipe-generate.';

CREATE INDEX IF NOT EXISTS idx_gerechten_status_org ON gerechten(organization_id, status);

-- Trigger: actief in sync met status (backwards-compat voor oude queries)
CREATE OR REPLACE FUNCTION sync_gerechten_actief_with_status()
RETURNS TRIGGER AS $$
BEGIN
    NEW.actief := (NEW.status = 'actief');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_gerechten_sync_actief ON gerechten;
CREATE TRIGGER trg_gerechten_sync_actief
    BEFORE INSERT OR UPDATE OF status ON gerechten
    FOR EACH ROW
    EXECUTE FUNCTION sync_gerechten_actief_with_status();

-- ─── 2. Gerechten-fotos storage bucket + policies ─────────────────────────

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'gerechten-fotos',
    'gerechten-fotos',
    true,                                                    -- public read voor /q/[id] portal en menukaarten
    10485760,                                                -- 10 MB per foto
    ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO NOTHING;

-- Defensive: oude policies opruimen (idempotent)
DROP POLICY IF EXISTS gerechten_fotos_public_read    ON storage.objects;
DROP POLICY IF EXISTS gerechten_fotos_auth_upload    ON storage.objects;
DROP POLICY IF EXISTS gerechten_fotos_auth_update    ON storage.objects;
DROP POLICY IF EXISTS gerechten_fotos_auth_delete    ON storage.objects;

-- Public read: foto's moeten zichtbaar zijn op /q/[id] (anonymous quote-portal)
-- en op de publieke website-builder pages.
CREATE POLICY gerechten_fotos_public_read ON storage.objects
    FOR SELECT
    USING (bucket_id = 'gerechten-fotos');

-- Authenticated insert/update/delete: elke ingelogde tenant-user mag uploaden.
-- URL is onguessable (gerecht_<timestamp>.<ext>) en de foto_url is gekoppeld
-- aan de gerechten-row die org-scoped RLS heeft — andere tenants kunnen die
-- URL niet ontdekken zonder access tot de row.
CREATE POLICY gerechten_fotos_auth_upload ON storage.objects
    FOR INSERT
    WITH CHECK (
        bucket_id = 'gerechten-fotos'
        AND auth.role() = 'authenticated'
    );

CREATE POLICY gerechten_fotos_auth_update ON storage.objects
    FOR UPDATE
    USING (
        bucket_id = 'gerechten-fotos'
        AND auth.role() = 'authenticated'
    );

CREATE POLICY gerechten_fotos_auth_delete ON storage.objects
    FOR DELETE
    USING (
        bucket_id = 'gerechten-fotos'
        AND auth.role() = 'authenticated'
    );
