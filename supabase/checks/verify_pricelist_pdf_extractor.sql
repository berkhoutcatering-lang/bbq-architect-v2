-- ═══════════════════════════════════════════════════════════════════════════
--  SANITY-CHECK voor migration 20260512100000_pricelist_pdf_extractor
--
--  Run dit NA de migration. Elke regel returnt ✓ of ✗ + uitleg.
--  Niet als migration runnen — alleen handmatig in SQL Editor.
-- ═══════════════════════════════════════════════════════════════════════════

WITH checks AS (

  -- ── 1. Tables exist ────────────────────────────────────────────────────
  SELECT 1 AS sort_order, 'Tables' AS sectie,
         'meat_taxonomy bestaat' AS check_naam,
         CASE WHEN EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'meat_taxonomy')
              THEN '✓ OK' ELSE '✗ ONTBREEKT' END AS status,
         '' AS detail
  UNION ALL SELECT 2, 'Tables', 'org_product_aliases bestaat',
         CASE WHEN EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'org_product_aliases')
              THEN '✓ OK' ELSE '✗ ONTBREEKT' END,
         ''
  UNION ALL SELECT 3, 'Tables', 'org_pricelist_uploads bestaat',
         CASE WHEN EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'org_pricelist_uploads')
              THEN '✓ OK' ELSE '✗ ONTBREEKT' END,
         ''

  -- ── 2. meat_taxonomy seed (30+ rijen) ──────────────────────────────────
  UNION ALL SELECT 10, 'Seed', 'meat_taxonomy heeft seed-rijen',
         CASE WHEN (SELECT count(*) FROM meat_taxonomy) >= 30 THEN '✓ OK' ELSE '✗ TE WEINIG' END,
         (SELECT count(*)::text || ' rijen (verwacht ≥30)' FROM meat_taxonomy)

  -- ── 3. Sam's voorbeelden: spiering, kippendij, brisket ─────────────────
  UNION ALL SELECT 11, 'Seed', 'spiering → varken/nek-borst',
         CASE WHEN EXISTS (
             SELECT 1 FROM meat_taxonomy
             WHERE soort = 'varken' AND cut_groep = 'nek-borst'
               AND 'spiering' = ANY(aliassen)
         ) THEN '✓ OK' ELSE '✗ MIST' END,
         (SELECT bereiding_default FROM meat_taxonomy
          WHERE soort='varken' AND cut_groep='nek-borst' LIMIT 1)
  UNION ALL SELECT 12, 'Seed', 'kippendij + kippenbillen → kip/bil-dij',
         CASE WHEN (
             SELECT 'kippendij' = ANY(aliassen) AND 'kippenbillen' = ANY(aliassen)
             FROM meat_taxonomy WHERE soort='kip' AND cut_groep='bil-dij' LIMIT 1
         ) THEN '✓ OK' ELSE '✗ MIST' END,
         'beide moeten in dezelfde rij staan'
  UNION ALL SELECT 13, 'Seed', 'brisket → rund/borst',
         CASE WHEN EXISTS (
             SELECT 1 FROM meat_taxonomy
             WHERE soort='rund' AND cut_groep='borst' AND 'brisket' = ANY(aliassen)
         ) THEN '✓ OK' ELSE '✗ MIST' END,
         ''
  UNION ALL SELECT 14, 'Seed', 'pulled-pork (varken/nek-borst) is low-slow',
         CASE WHEN (
             SELECT bereiding_default = 'low-slow' FROM meat_taxonomy
             WHERE soort='varken' AND cut_groep='nek-borst' LIMIT 1
         ) THEN '✓ OK' ELSE '✗ FOUTE BEREIDING' END,
         ''

  -- ── 4. RLS aan op tenant-tables ────────────────────────────────────────
  UNION ALL SELECT 20, 'RLS', 'org_product_aliases RLS enabled',
         CASE WHEN (
             SELECT relrowsecurity FROM pg_class
             WHERE relname='org_product_aliases'
         ) THEN '✓ OK' ELSE '✗ RLS UIT' END,
         ''
  UNION ALL SELECT 21, 'RLS', 'org_pricelist_uploads RLS enabled',
         CASE WHEN (
             SELECT relrowsecurity FROM pg_class
             WHERE relname='org_pricelist_uploads'
         ) THEN '✓ OK' ELSE '✗ RLS UIT' END,
         ''
  UNION ALL SELECT 22, 'RLS', 'org_product_aliases heeft policies',
         CASE WHEN (
             SELECT count(*) FROM pg_policies WHERE tablename='org_product_aliases'
         ) >= 3 THEN '✓ OK' ELSE '✗ MIST POLICIES' END,
         (SELECT count(*)::text || ' policies' FROM pg_policies WHERE tablename='org_product_aliases')
  UNION ALL SELECT 23, 'RLS', 'org_pricelist_uploads heeft policies',
         CASE WHEN (
             SELECT count(*) FROM pg_policies WHERE tablename='org_pricelist_uploads'
         ) >= 2 THEN '✓ OK' ELSE '✗ MIST POLICIES' END,
         (SELECT count(*)::text || ' policies' FROM pg_policies WHERE tablename='org_pricelist_uploads')

  -- ── 5. Indexes (RLS-performance) ───────────────────────────────────────
  UNION ALL SELECT 30, 'Indexes', 'idx ux_aliases_org_norm bestaat',
         CASE WHEN EXISTS (SELECT 1 FROM pg_indexes WHERE indexname='ux_aliases_org_norm')
              THEN '✓ OK' ELSE '✗ MIST' END,
         ''
  UNION ALL SELECT 31, 'Indexes', 'idx ux_uploads_dedup (content_hash) bestaat',
         CASE WHEN EXISTS (SELECT 1 FROM pg_indexes WHERE indexname='ux_uploads_dedup')
              THEN '✓ OK' ELSE '✗ MIST' END,
         ''
  UNION ALL SELECT 32, 'Indexes', 'idx idx_uploads_batch bestaat',
         CASE WHEN EXISTS (SELECT 1 FROM pg_indexes WHERE indexname='idx_uploads_batch')
              THEN '✓ OK' ELSE '✗ MIST' END,
         ''

  -- ── 6. Storage bucket ──────────────────────────────────────────────────
  UNION ALL SELECT 40, 'Storage', 'bucket pricelist-pdfs bestaat',
         CASE WHEN EXISTS (SELECT 1 FROM storage.buckets WHERE id='pricelist-pdfs')
              THEN '✓ OK' ELSE '✗ MIST' END,
         ''
  UNION ALL SELECT 41, 'Storage', 'bucket pricelist-pdfs is private',
         CASE WHEN (SELECT public = false FROM storage.buckets WHERE id='pricelist-pdfs')
              THEN '✓ OK' ELSE '✗ PUBLIEK!' END,
         ''
  UNION ALL SELECT 42, 'Storage', 'storage-policy pricelist_select_own_org bestaat',
         CASE WHEN EXISTS (
             SELECT 1 FROM pg_policies
             WHERE schemaname='storage' AND tablename='objects'
               AND policyname='pricelist_select_own_org'
         ) THEN '✓ OK' ELSE '✗ MIST' END,
         ''

  -- ── 7. Schema-contract: BTW NOOIT in een AI-output kolom ───────────────
  UNION ALL SELECT 50, 'Hard rules', 'meat_taxonomy heeft GEEN btw-kolom',
         CASE WHEN NOT EXISTS (
             SELECT 1 FROM information_schema.columns
             WHERE table_name='meat_taxonomy'
               AND column_name ILIKE '%btw%'
         ) THEN '✓ OK' ELSE '✗ BTW KOLOM AANWEZIG' END,
         ''
  UNION ALL SELECT 51, 'Hard rules', 'org_product_aliases heeft GEEN btw-kolom',
         CASE WHEN NOT EXISTS (
             SELECT 1 FROM information_schema.columns
             WHERE table_name='org_product_aliases'
               AND column_name ILIKE '%btw%'
         ) THEN '✓ OK' ELSE '✗ BTW KOLOM AANWEZIG' END,
         ''
)
SELECT sectie, check_naam, status, detail
FROM checks
ORDER BY sort_order;
