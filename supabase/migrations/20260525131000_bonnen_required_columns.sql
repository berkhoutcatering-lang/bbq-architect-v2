-- ════════════════════════════════════════════════════════════════════════
-- P0.0.5 — Vereiste kolommen voor Bonnenkistje feature.
--
-- HERGEBRUIKT bestaande infra:
--   - organization_id UUID         (al toegevoegd door 001_multi_tenant.sql)
--   - bon_items JSONB              (al toegevoegd door 010_bon_processing_loop.sql)
--   - btw_laag_bedrag / btw_hoog_bedrag / netto_bedrag (al uit 010)
--   - tags / extracted_text / search_vec (al uit 20260520220000_bonnen_archief_search.sql)
--
-- Voegt NIEUW toe:
--   - locked_at + locked_by    (immutability na aangifte — Art. 52 AWR)
--   - source TEXT + CHECK      ('upload' | 'email' | 'scan' | 'api')
--   - rgs_categorie TEXT       (RGS-code voor maandpakket-export)
--   - file_path + file_mime    (Storage-pad ipv data-URL — voorbereiding P0.5)
--   - status CHECK             (enum-veilig: pending|bevestigd|twijfel|vergrendeld)
--   - updated_at trigger       (idempotent)
-- ════════════════════════════════════════════════════════════════════════

-- 1. locked_at + locked_by ───────────────────────────────────────────────
ALTER TABLE bonnen
    ADD COLUMN IF NOT EXISTS locked_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS locked_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

COMMENT ON COLUMN bonnen.locked_at IS
    'Wanneer de bon is vastgeklikt voor aangifte. Vergrendelde bonnen kunnen niet meer ge-updated of -deleted worden (RLS-policy in 133000).';

-- 2. source ──────────────────────────────────────────────────────────────
ALTER TABLE bonnen
    ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'upload';

ALTER TABLE bonnen DROP CONSTRAINT IF EXISTS bonnen_source_check;
ALTER TABLE bonnen
    ADD CONSTRAINT bonnen_source_check
    CHECK (source IN ('upload', 'email', 'scan', 'api'));

COMMENT ON COLUMN bonnen.source IS
    'upload = drag & drop, email = via org_email_inbox category=factuur, scan = camera-flow in EmptyKistje, api = externe POST.';

-- 3. rgs_code ────────────────────────────────────────────────────────────
-- NB: bonnen.rgs_code + rgs_category_label bestaan al via bon-commit-flow.
-- Geen nieuwe ALTER nodig — alleen index voor filter-performance.
CREATE INDEX IF NOT EXISTS bonnen_rgs_code_idx ON bonnen(organization_id, rgs_code);

-- 4. file_path + file_mime ───────────────────────────────────────────────
ALTER TABLE bonnen
    ADD COLUMN IF NOT EXISTS file_path TEXT,
    ADD COLUMN IF NOT EXISTS file_mime TEXT;

COMMENT ON COLUMN bonnen.file_path IS
    'Storage-pad in bucket bonnen: {organization_id}/{yyyy-mm}/{uuid}.{ext}. Lees via getSignedUrl(), nooit publiek serveren. Vervangt image_url voor nieuwe rows.';

-- 5. status CHECK ────────────────────────────────────────────────────────
-- BREED genoeg om bestaande writers (bon-commit 'processed', quick-upload
-- 'pending', 004 default 'review') NIET te breken. Plus design-toevoegingen
-- 'bevestigd' / 'twijfel' / 'vergrendeld' voor het nieuwe Bonnenkistje-UI.
--
-- UI mapping (zie src/app/archief/_lib/statusMap.ts):
--   'pending'      → Pending (geel)
--   'review'       → Twijfel (oranje)  ← legacy alias
--   'processed'    → Bevestigd (groen) ← legacy alias
--   'bevestigd'    → Bevestigd (groen)
--   'twijfel'      → Twijfel (oranje)
--   'vergrendeld'  → Vergrendeld (grijs + slot-icon)

-- Eerst NULL → 'pending' om CHECK te kunnen opleggen.
UPDATE bonnen SET status = 'pending' WHERE status IS NULL;

ALTER TABLE bonnen DROP CONSTRAINT IF EXISTS bonnen_status_check;
ALTER TABLE bonnen
    ADD CONSTRAINT bonnen_status_check
    CHECK (status IN ('pending', 'review', 'processed', 'bevestigd', 'twijfel', 'vergrendeld'));

ALTER TABLE bonnen ALTER COLUMN status SET DEFAULT 'pending';

-- 6. updated_at + trigger ────────────────────────────────────────────────
ALTER TABLE bonnen
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- Maak set_updated_at() als die nog niet bestaat (idempotent — kan ook al in andere migratie staan).
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS bonnen_set_updated_at ON bonnen;
CREATE TRIGGER bonnen_set_updated_at
    BEFORE UPDATE ON bonnen
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 7. Index voor org + datum filter (search-pad in DAL) ─────────────────
CREATE INDEX IF NOT EXISTS bonnen_org_datum_idx ON bonnen(organization_id, datum DESC);
CREATE INDEX IF NOT EXISTS bonnen_org_status_idx ON bonnen(organization_id, status);
CREATE INDEX IF NOT EXISTS bonnen_org_source_idx ON bonnen(organization_id, source);
