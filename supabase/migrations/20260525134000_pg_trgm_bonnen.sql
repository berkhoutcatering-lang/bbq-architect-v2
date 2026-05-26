-- ════════════════════════════════════════════════════════════════════════
-- P0.9 — pg_trgm extension + trigram-index op bonnen.extracted_text.
--
-- Doel: typo-tolerante search. "baktoaal" vindt "baktotaal".
--
-- Hoe het werkt:
--   - search_vec (full-text, exact match) blijft de hoofd-engine
--   - pg_trgm similarity() vangt typo's op (3-character n-grams)
--   - DAL combineert beide met: ts_rank * 0.7 + similarity * 0.3
--   - Resultaat: snelle exact-matches voorop, fuzzy-matches eronder
-- ════════════════════════════════════════════════════════════════════════

-- 1. Extension (idempotent — Supabase ondersteunt dit native).
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 2. GIN-index op extracted_text met trigram-operator class.
--    Zorgt dat similarity-queries op grote archieven sub-100ms blijven.
CREATE INDEX IF NOT EXISTS bonnen_extracted_trgm_idx
    ON bonnen USING gin (extracted_text gin_trgm_ops);

-- 3. Bonus: trigram-index op winkel (leverancier-naam) voor "slgro"→"sligro" matches.
CREATE INDEX IF NOT EXISTS bonnen_winkel_trgm_idx
    ON bonnen USING gin (winkel gin_trgm_ops);

-- 4. Verificatie-query (handmatig draaien na migratie):
--    EXPLAIN ANALYZE
--    SELECT id, winkel, similarity(extracted_text, 'baktoaal') AS score
--    FROM bonnen
--    WHERE extracted_text % 'baktoaal'    -- % = pg_trgm similarity-operator (default threshold 0.3)
--    ORDER BY score DESC
--    LIMIT 20;
--    Verwacht: Index Scan op bonnen_extracted_trgm_idx, < 50ms op 10k rows.

COMMENT ON INDEX bonnen_extracted_trgm_idx IS
    'Trigram-index voor fuzzy search via pg_trgm. Pillar #1: "baktoaal" vindt "baktotaal".';
