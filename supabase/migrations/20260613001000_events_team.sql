-- =============================================================
--  events.team — crew-planning per event
--
--  De EventEditor (TEAMPLANNING-chips) schreef al naar `team` en
--  de event-hub las al `event.team`, maar de kolom bestond nooit:
--  het crew-blok bleef daardoor eeuwig "Nog geen crew ingepland"
--  en gekozen namen verdwenen stilletjes. Zelfde spookveld-klasse
--  als factuur.totaal (zie audits/2026-06-12-test-campagne.md).
-- =============================================================

ALTER TABLE events
    ADD COLUMN IF NOT EXISTS team jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN events.team IS
    'Crew-namen voor dit event (array van strings) — gekozen via TEAMPLANNING in de event-editor.';
