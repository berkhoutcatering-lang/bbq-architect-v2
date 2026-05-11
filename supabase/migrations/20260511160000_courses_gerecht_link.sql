-- =============================================================
--  Courses ↔ Gerechten FK koppeling
-- =============================================================
--
--  P0-3 integration-fix: prep_tasks krijgen course_id via gerecht_id
--  match, maar courses heeft (vóór deze migration) alleen 'title' (text).
--  Zonder FK is matching fragiel ("Pulled Pork" vs "pulled pork" vs
--  "Pulled-Pork"). Met expliciete `gerecht_id` op courses kan
--  bulkScheduleEventPrep zonder twijfel de juiste rij koppelen.
--
--  Backfill via case-insensitive name-match — best-effort voor
--  bestaande data; chef kan handmatig corrigeren via UI.
-- =============================================================

-- ── 1. Add column ─────────────────────────────────────────────
ALTER TABLE courses
    ADD COLUMN IF NOT EXISTS gerecht_id UUID REFERENCES gerechten(id) ON DELETE SET NULL;

COMMENT ON COLUMN courses.gerecht_id IS
    'Optionele FK naar gerecht — vult voor prep_tasks.course_id koppeling. Best-effort name-match bij course-aanmaak.';

CREATE INDEX IF NOT EXISTS courses_gerecht_id_idx ON courses(gerecht_id)
    WHERE gerecht_id IS NOT NULL;

-- ── 2. Backfill — name-match (case-insensitive, trim) ─────────
UPDATE courses c
SET gerecht_id = g.id
FROM gerechten g
WHERE c.gerecht_id IS NULL
  AND g.organization_id = c.organization_id
  AND LOWER(TRIM(g.naam)) = LOWER(TRIM(c.title));

-- =============================================================
--  Einde 20260511160000_courses_gerecht_link.sql
-- =============================================================
