-- ════════════════════════════════════════════════════════════════════════
-- Bucket E P0-4 — Hash + source-tracking kolommen voor unified extract
--
-- Voegt toe aan bonnen:
--   - image_hash + content_hash    SHA-256 dedup (vóór AI-call)
--   - source_type                  photo|pdf|screenshot|clipboard|ubl_xml|email
--   - mime_type                    application/pdf, image/jpeg, application/xml, ...
--   - pages                        aantal PDF-pagina's (NULL voor images)
--   - ocr_engine                   haiku-text | sonnet-files | ubl-parse | none
--   - confidence                   0.00-1.00 — gemiddelde over geëxtraheerde velden
--   - original_storage_path        pad naar PRE-resize origineel (Moneybird-attach)
--   - processing_status            uploaded → extracting → extracted → committed
--
-- Defensive: alle ADD COLUMNs gebruiken IF NOT EXISTS zodat re-runs veilig zijn.
-- Pre-flight check via information_schema voor source_type, want CHECK-constraint
-- moet bestaande rows respecteren.
-- ════════════════════════════════════════════════════════════════════════

-- 1. image_hash + content_hash ───────────────────────────────────────────
ALTER TABLE bonnen
    ADD COLUMN IF NOT EXISTS image_hash TEXT,
    ADD COLUMN IF NOT EXISTS content_hash TEXT;

COMMENT ON COLUMN bonnen.image_hash IS
    'SHA-256 hex van de RAW bytes vóór resize/compressie. Gebruikt voor exact-duplicate-detectie (2x dezelfde foto upload) per organisatie.';
COMMENT ON COLUMN bonnen.content_hash IS
    'SHA-256 hex van genormaliseerde extractie-output (winkel+datum+totaal+items). Vangt visuele duplicaten (zelfde bon, andere foto-hoek).';

-- 2. source_type ─────────────────────────────────────────────────────────
-- NB: bestaande `source` kolom blijft (upload|email|scan|api) voor backwards-compat.
-- source_type is fijnmaziger en wordt door /api/bonnen/extract gezet.
ALTER TABLE bonnen
    ADD COLUMN IF NOT EXISTS source_type TEXT;

ALTER TABLE bonnen DROP CONSTRAINT IF EXISTS bonnen_source_type_check;
ALTER TABLE bonnen
    ADD CONSTRAINT bonnen_source_type_check
    CHECK (source_type IS NULL OR source_type IN (
        'photo', 'pdf', 'screenshot', 'clipboard', 'ubl_xml', 'email', 'camera'
    ));

COMMENT ON COLUMN bonnen.source_type IS
    'Fijnmazige bron-classificatie voor cost-tracking en routing. photo=foto, pdf=document, screenshot=desktop-capture, clipboard=Cmd+V, ubl_xml=e-factuur (gratis), camera=mobile-live, email=inbound.';

-- 3. mime_type ───────────────────────────────────────────────────────────
ALTER TABLE bonnen
    ADD COLUMN IF NOT EXISTS mime_type TEXT;

COMMENT ON COLUMN bonnen.mime_type IS
    'Original mime-type van de geüploade file. application/pdf, image/jpeg, image/heic, application/xml, text/xml. NULL voor legacy rows zonder file.';

-- 4. pages ───────────────────────────────────────────────────────────────
ALTER TABLE bonnen
    ADD COLUMN IF NOT EXISTS pages INT;

COMMENT ON COLUMN bonnen.pages IS
    'Aantal pagina''s in source-document (PDF). NULL voor enkelvoudige images en XML.';

-- 5. ocr_engine ──────────────────────────────────────────────────────────
ALTER TABLE bonnen
    ADD COLUMN IF NOT EXISTS ocr_engine TEXT;

COMMENT ON COLUMN bonnen.ocr_engine IS
    'Welke engine extraheerde dit bonnetje. haiku-text=Haiku 4.5 op embedded PDF-text, sonnet-files=Sonnet 4.6 multi-page via Files API, haiku-vision=Haiku 4.5 image vision, ubl-parse=fast-xml-parser geen AI, none=handmatig.';

-- 6. confidence ──────────────────────────────────────────────────────────
ALTER TABLE bonnen
    ADD COLUMN IF NOT EXISTS confidence NUMERIC(3,2);

ALTER TABLE bonnen DROP CONSTRAINT IF EXISTS bonnen_confidence_check;
ALTER TABLE bonnen
    ADD CONSTRAINT bonnen_confidence_check
    CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1));

COMMENT ON COLUMN bonnen.confidence IS
    'Gemiddelde confidence over geëxtraheerde top-level velden (winkel, datum, totaal). <0.6 => auto-naar twijfel-queue, ≥0.9 => groen check. 1.0 voor UBL-XML (deterministisch).';

-- 7. original_storage_path ───────────────────────────────────────────────
ALTER TABLE bonnen
    ADD COLUMN IF NOT EXISTS original_storage_path TEXT;

COMMENT ON COLUMN bonnen.original_storage_path IS
    'Pad in bucket bonnen-originals naar PRE-resize origineel (voor Moneybird purchase-invoice attachment + AVG-bewaarplicht). file_path is de werkversie, dit is het origineel.';

-- 8. processing_status ───────────────────────────────────────────────────
ALTER TABLE bonnen
    ADD COLUMN IF NOT EXISTS processing_status TEXT DEFAULT 'uploaded';

ALTER TABLE bonnen DROP CONSTRAINT IF EXISTS bonnen_processing_status_check;
ALTER TABLE bonnen
    ADD CONSTRAINT bonnen_processing_status_check
    CHECK (processing_status IN (
        'uploaded', 'extracting', 'extracted', 'committed', 'failed', 'duplicate'
    ));

COMMENT ON COLUMN bonnen.processing_status IS
    'Pipeline-fase: uploaded=in storage maar niet extracted, extracting=AI bezig, extracted=preview klaar voor user-review, committed=bevestigd door user (BTW+RGS vast), failed=AI-call mislukt, duplicate=image_hash hit op bestaande row.';

-- 9. moneybird_attachment_ids ────────────────────────────────────────────
-- Map { purchase_invoice_id: attachment_id } voor Moneybird idempotency.
-- Bij re-attach van dezelfde bon: check eerst of er al een ID staat;
-- skip de API-call (rate-limit 150/5min).
ALTER TABLE bonnen
    ADD COLUMN IF NOT EXISTS moneybird_attachment_ids JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN bonnen.moneybird_attachment_ids IS
    'Idempotency-state voor Moneybird purchase-invoice attachments. Key=purchase_invoice_id, value=attachment_id. Voorkomt dubbele uploads bij retry/refresh.';

-- 10. Indexes ────────────────────────────────────────────────────────────
-- Dedup-lookup: per-org image_hash check (P0-4 hard requirement)
CREATE INDEX IF NOT EXISTS bonnen_image_hash_idx
    ON bonnen(organization_id, image_hash)
    WHERE image_hash IS NOT NULL;

-- Content-hash dedup (semantisch identieke bonnen, andere foto)
CREATE INDEX IF NOT EXISTS bonnen_content_hash_idx
    ON bonnen(organization_id, content_hash)
    WHERE content_hash IS NOT NULL;

-- Processing-queue scan (in archief: "extracting" badge)
CREATE INDEX IF NOT EXISTS bonnen_processing_status_idx
    ON bonnen(organization_id, processing_status)
    WHERE processing_status NOT IN ('committed', 'duplicate');

-- Source-type filter in archief
CREATE INDEX IF NOT EXISTS bonnen_source_type_idx
    ON bonnen(organization_id, source_type)
    WHERE source_type IS NOT NULL;
