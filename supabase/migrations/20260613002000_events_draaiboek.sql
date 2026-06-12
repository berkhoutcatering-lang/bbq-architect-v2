-- =============================================================
--  events.draaiboek — tijdslots/draaiboek per event
--
--  Zelfde spookveld-klasse als events.team: de EventEditor stuurde
--  `draaiboek` al mee in elke save, maar de kolom bestond niet —
--  waardoor ELKE editor-opslag faalde zodra het formulier compleet
--  meegestuurd werd (en het draaiboek-blok eeuwig leeg bleef).
-- =============================================================

ALTER TABLE events
    ADD COLUMN IF NOT EXISTS draaiboek jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN events.draaiboek IS
    'Tijdslots voor het event (array van {tijd, omschrijving}) — beheerd via DRAAIBOEK in de event-editor.';
