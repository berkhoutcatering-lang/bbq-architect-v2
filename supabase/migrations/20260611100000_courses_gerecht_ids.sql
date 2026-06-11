-- =============================================================
--  Courses ↔ Gerechten meervoudige koppeling (gerecht_ids[])
-- =============================================================
--
--  Fase 1 KDS-menu-koppeling: een gang bevat meestal MEERDERE
--  gerechten ("Pulled pork, Brisket, Ribs met sides") maar had
--  hooguit één gerecht_id (eerste match — prep-koppeling).
--  Service Mode heeft alle gerechten nodig voor foto's, recepturen
--  (componenten → actieplan) en allergie-flagging via FK i.p.v.
--  fragiele string-match op description.
--
--  Defensief: pre-flight checks via information_schema zodat deze
--  migratie ook draait op databases waar eerdere migraties (009
--  courses, 20260511160000 gerecht_link) nog niet of in andere
--  volgorde zijn toegepast.
-- =============================================================

-- ── 1. Kolom ──────────────────────────────────────────────────
ALTER TABLE courses
    ADD COLUMN IF NOT EXISTS gerecht_ids UUID[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN courses.gerecht_ids IS
    'Alle gerecht-FKs van deze gang, in menu-volgorde. Bron voor KDS foto''s/recepturen/allergie-flags. gerecht_id (enkelvoud) blijft het representatieve gerecht voor prep-koppeling.';

-- ── 2. Backfill uit description (comma-separated dish-namen) ──
--  Org-scoped name-match, alleen voor rijen die nog leeg zijn.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'courses' AND column_name = 'organization_id'
    ) AND EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'gerechten' AND column_name = 'organization_id'
    ) THEN
        UPDATE courses c
        SET gerecht_ids = sub.ids
        FROM (
            SELECT c2.id, array_agg(g.id ORDER BY d.ord) AS ids
            FROM courses c2
            CROSS JOIN LATERAL unnest(string_to_array(COALESCE(c2.description, ''), ','))
                WITH ORDINALITY AS d(naam, ord)
            JOIN gerechten g
              ON LOWER(TRIM(g.naam)) = LOWER(TRIM(d.naam))
             AND g.organization_id = c2.organization_id
            GROUP BY c2.id
        ) sub
        WHERE c.id = sub.id
          AND (c.gerecht_ids IS NULL OR c.gerecht_ids = '{}');
    END IF;
END $$;

-- ── 3. gerecht_id (enkelvoud) bijvullen waar leeg ─────────────
--  Guard: kolom bestaat alleen als 20260511160000 al gedraaid is.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'courses' AND column_name = 'gerecht_id'
    ) THEN
        UPDATE courses
        SET gerecht_id = gerecht_ids[1]
        WHERE gerecht_id IS NULL
          AND COALESCE(array_length(gerecht_ids, 1), 0) >= 1;
    END IF;
END $$;

-- =============================================================
--  Einde 20260611100000_courses_gerecht_ids.sql
-- =============================================================
