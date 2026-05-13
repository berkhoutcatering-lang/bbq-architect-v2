-- ════════════════════════════════════════════════════════════════════════════
--  Pricelist PDF chunked uploads — robuust 35-100p PDFs
--
--  Pillar #1: AI loopt nooit vast op grote PDFs (chunks ≤25p)
--  Pillar #2: Per chunk retry, geen all-or-nothing
--  Pillar #4: Per-chunk LLM01 threshold, behoud globale safety
--  Pillar #5: Quota fair — parent telt als 1 PDF, chunks tellen niet mee
-- ════════════════════════════════════════════════════════════════════════════


-- ── 1. Status enum: voeg 'partial' toe (3 van 4 chunks gelukt) ─────────────

ALTER TABLE org_pricelist_uploads DROP CONSTRAINT IF EXISTS org_pricelist_uploads_status_check;
ALTER TABLE org_pricelist_uploads ADD CONSTRAINT org_pricelist_uploads_status_check
    CHECK (status IN ('uploaded','queued','parsing','parsed','partial','failed','dismissed'));


-- ── 2. Chunk-relatie kolommen ──────────────────────────────────────────────

ALTER TABLE org_pricelist_uploads
    ADD COLUMN IF NOT EXISTS parent_upload_id UUID REFERENCES org_pricelist_uploads(id) ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS chunk_index INT,
    ADD COLUMN IF NOT EXISTS chunk_total INT,
    ADD COLUMN IF NOT EXISTS page_start INT,
    ADD COLUMN IF NOT EXISTS page_end INT,
    ADD COLUMN IF NOT EXISTS aggregated_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS retry_count INT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS manual_review_required BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS extracted_lines JSONB;

COMMENT ON COLUMN org_pricelist_uploads.parent_upload_id IS
    'NULL = parent (echte PDF). Niet-NULL = chunk-rij die naar parent verwijst.';
COMMENT ON COLUMN org_pricelist_uploads.chunk_index IS
    '0..N-1 voor chunks, NULL voor parents.';
COMMENT ON COLUMN org_pricelist_uploads.chunk_total IS
    'Aantal chunks van de parent (denormalized voor snelle UI).';
COMMENT ON COLUMN org_pricelist_uploads.extracted_lines IS
    'Per chunk: AI extracted lines JSON; aggregator leest dit, dedupt, schrijft naar org_price_mutations op parent. NULL voor parents.';
COMMENT ON COLUMN org_pricelist_uploads.manual_review_required IS
    'Triggered wanneer geaggregeerd lijntotaal > 5000 (LLM01 backstop). UI markeert prominent.';


-- ── 3. Constraint-relaxering: chunks hebben geen content_hash/storage_path ─

-- chunks zitten niet in storage (alleen parent), dus storage_path mag NULL voor chunks
ALTER TABLE org_pricelist_uploads ALTER COLUMN storage_path DROP NOT NULL;
ALTER TABLE org_pricelist_uploads ALTER COLUMN content_hash DROP NOT NULL;
ALTER TABLE org_pricelist_uploads ALTER COLUMN size_bytes DROP NOT NULL;

-- Vervang dedup-index: alleen parents tellen voor content_hash uniqueness
DROP INDEX IF EXISTS ux_uploads_dedup;
CREATE UNIQUE INDEX IF NOT EXISTS ux_uploads_dedup_parents
    ON org_pricelist_uploads (organization_id, content_hash)
    WHERE parent_upload_id IS NULL AND content_hash IS NOT NULL;


-- ── 4. Indexen voor chunk-flows ────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_uploads_parent
    ON org_pricelist_uploads (parent_upload_id, chunk_index)
    WHERE parent_upload_id IS NOT NULL;

-- Poller filtert vaak op anthropic_batch_id + status; bestaat al maar zorgen dat
-- chunks niet onnodig in bestaande "leverancier list" query verschijnen via een
-- partial index die default chunks excludes.
CREATE INDEX IF NOT EXISTS idx_uploads_org_lev_parent
    ON org_pricelist_uploads (organization_id, leverancier_id, created_at DESC)
    WHERE parent_upload_id IS NULL;


-- ── 5. Validatie-constraints op chunk-shape ────────────────────────────────

-- Parent OR chunk: niet beide chunk-velden en content_hash kunnen mengen.
ALTER TABLE org_pricelist_uploads DROP CONSTRAINT IF EXISTS ck_uploads_parent_or_chunk;
ALTER TABLE org_pricelist_uploads ADD CONSTRAINT ck_uploads_parent_or_chunk
    CHECK (
        (parent_upload_id IS NULL AND chunk_index IS NULL AND page_start IS NULL AND page_end IS NULL
            AND content_hash IS NOT NULL AND storage_path IS NOT NULL)
        OR
        (parent_upload_id IS NOT NULL AND chunk_index IS NOT NULL
            AND page_start IS NOT NULL AND page_end IS NOT NULL
            AND content_hash IS NULL AND storage_path IS NULL)
    );

-- Chunk-index uniek binnen parent
CREATE UNIQUE INDEX IF NOT EXISTS ux_uploads_chunk_per_parent
    ON org_pricelist_uploads (parent_upload_id, chunk_index)
    WHERE parent_upload_id IS NOT NULL;


-- ── 6. RLS — chunks erven via parent's organization_id ─────────────────────

-- Bestaande policies werken al (chunks hebben hun eigen organization_id ingevuld),
-- maar voeg een policy toe die expliciet zegt dat chunk-rows met parent_upload_id
-- mee-zichtbaar zijn voor de eigenaar — geen extra logica nodig want we
-- denormalizen organization_id ook op chunk-rijen.

-- (Geen wijziging nodig; existing 'uploads_select_own' en 'uploads_insert_own'
--  dekken het. Service-role bypassed RLS voor poller/aggregator updates.)


-- ── 7. View: parent + chunks rollup voor UI ───────────────────────────────

CREATE OR REPLACE VIEW v_pricelist_upload_with_chunks AS
SELECT
    p.id,
    p.organization_id,
    p.leverancier_id,
    p.uploaded_by,
    p.filename,
    p.storage_path,
    p.size_bytes,
    p.page_count,
    p.content_hash,
    p.status,
    p.processing_mode,
    p.anthropic_batch_id,
    p.parse_started_at,
    p.parse_finished_at,
    p.parsed_product_count,
    p.new_count,
    p.updated_count,
    p.ai_cost_cents,
    p.ai_model,
    p.parse_error,
    p.manual_review_required,
    p.aggregated_at,
    p.created_at,
    -- Aggregaten van children
    COALESCE((SELECT COUNT(*)::INT FROM org_pricelist_uploads c
              WHERE c.parent_upload_id = p.id), 0) AS chunk_total,
    COALESCE((SELECT COUNT(*)::INT FROM org_pricelist_uploads c
              WHERE c.parent_upload_id = p.id AND c.status = 'parsed'), 0) AS chunks_done,
    COALESCE((SELECT COUNT(*)::INT FROM org_pricelist_uploads c
              WHERE c.parent_upload_id = p.id AND c.status = 'failed'), 0) AS chunks_failed
FROM org_pricelist_uploads p
WHERE p.parent_upload_id IS NULL;

GRANT SELECT ON v_pricelist_upload_with_chunks TO authenticated;
