-- ════════════════════════════════════════════════════════════════════════
-- P0.0 — Pre-flight audit voor de Bonnenkistje migration batch.
--
-- DEFENSIVE versie: werkt op elke DB-staat, ook als oudere migraties
-- (zoals 20260520220000_bonnen_archief_search) nog niet zijn gerund.
--
-- Run dit MANUAL in Supabase Studio. NIET auto-apply in CI. Inspecteer
-- de output voordat je 20260525131000 → 20260525137000 toepast.
-- ════════════════════════════════════════════════════════════════════════

-- 1. Kolom-inventaris ───────────────────────────────────────────────────
-- Welke relevante kolommen bestaan al op de bonnen-tabel?
-- Helpt te zien of voorganger-migraties al gerund zijn.
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'bonnen'
  AND column_name IN (
    'id', 'organization_id', 'image_url', 'status', 'created_at', 'datum',
    'extracted_text', 'search_vec', 'tags', 'leverancier_id',
    'locked_at', 'source', 'rgs_categorie', 'rgs_code', 'file_path', 'file_mime',
    'bon_items', 'btw_laag_bedrag', 'btw_hoog_bedrag', 'netto_bedrag'
  )
ORDER BY column_name;

-- Verwacht NA migraties 131000-137000: alle bovenstaande kolommen aanwezig.
-- Als 'extracted_text' nu mist → oudere migratie 20260520220000 is niet gerund.
-- Geen blocker: mijn 131000-batch voegt zelf alle missende kolommen toe.

-- 2. Basis-counts ──────────────────────────────────────────────────────
-- Alleen kolommen die zeker bestaan in baseline (uit 001 + 004).
SELECT
    COUNT(*)                                                    AS totaal_bonnen,
    COUNT(organization_id)                                      AS met_org_id,
    COUNT(*) - COUNT(organization_id)                           AS zonder_org_id,
    COUNT(*) FILTER (WHERE image_url LIKE 'data:%')             AS met_data_url,
    COUNT(*) FILTER (WHERE image_url ILIKE 'http%')             AS met_storage_url,
    COUNT(*) FILTER (WHERE image_url IS NULL)                   AS zonder_image_url,
    pg_size_pretty(COALESCE(SUM(LENGTH(image_url::text)), 0))   AS image_url_totaal,
    MIN(created_at)                                             AS oudste_bon,
    MAX(created_at)                                             AS nieuwste_bon
FROM bonnen;

-- Verwacht voor productie (Hop & Bites):
--   zonder_org_id     = 0           (anders: aanpassen vóór RLS-lockdown)
--   met_data_url      < 1000        (anders: P0.5 background-migratie kritiek)
--   image_url_totaal  < 100 MB      (anders: DB-bloat blokkeert RLS-migratie)

-- 3. Status-distributie ────────────────────────────────────────────────
-- Welke status-waarden bestaan? CHECK constraint in 131000 accepteert:
-- pending, review, processed, bevestigd, twijfel, vergrendeld.
SELECT status, COUNT(*) AS aantal
FROM bonnen
GROUP BY status
ORDER BY aantal DESC;

-- Andere waarden? Map ze handmatig naar één van bovenstaande VOOR je 131000 runt.

-- 4. Bestaande indexes op bonnen ──────────────────────────────────────
-- Helpt te zien wat al is opgezet (search_vec gin-index, datum-index, etc.).
SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public' AND tablename = 'bonnen'
ORDER BY indexname;

-- 5. org_email_inbox sanity-check ─────────────────────────────────────
-- Inbox-tab (P0.10) gebruikt category='factuur' filter.
-- Alleen runnen als tabel bestaat (mocht 20260516120000 niet zijn gerund).
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'org_email_inbox'
    ) THEN
        RAISE NOTICE 'org_email_inbox bestaat — check category-distributie handmatig:';
        RAISE NOTICE '  SELECT category, COUNT(*) FROM org_email_inbox GROUP BY category;';
    ELSE
        RAISE NOTICE 'org_email_inbox tabel bestaat NIET — Inbox-tab blijft leeg.';
        RAISE NOTICE 'Geen blocker; later toevoegen via migratie 20260516120000.';
    END IF;
END $$;

-- 6. stock_movements.bon_id check ─────────────────────────────────────
-- Voorraad-tab in BonPreview (uit migratie 010_bon_processing_loop.sql).
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'stock_movements'
          AND column_name = 'bon_id'
    ) THEN
        RAISE NOTICE 'stock_movements.bon_id bestaat — Voorraad-tab kan koppeling tonen.';
    ELSE
        RAISE NOTICE 'stock_movements.bon_id MIST — Voorraad-tab toont altijd leeg.';
        RAISE NOTICE 'Geen blocker, maar overweeg migratie 010 te runnen.';
    END IF;
END $$;
