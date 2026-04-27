-- Sprint #2: events.start_time + events.end_time
--
-- Vóór deze migratie had events alleen `date` (DATE). De Agenda + Service Mode
-- hardcodeerden 17:00 als start; smoker/team conflict-detectie kon alleen op
-- dag-grain werken. Met start_time + end_time:
--   - Agenda toont per event de echte tijd
--   - conflictDetection kan tijd-overlap meten i.p.v. dag-overlap
--   - Service Mode countdown gebruikt event-start
--
-- TIME zonder timezone — locatie-tijd; bij multi-tz events later evt. naar
-- timestamptz upgraden. Beide kolommen NULL toegestaan voor legacy events.

ALTER TABLE events
    ADD COLUMN IF NOT EXISTS start_time TIME,
    ADD COLUMN IF NOT EXISTS end_time TIME;

COMMENT ON COLUMN events.start_time IS
    'Lokale starttijd van het event (HH:MM). NULL = onbekend; UI toont default placeholder.';
COMMENT ON COLUMN events.end_time IS
    'Lokale eindtijd. NULL = open einde. Gebruikt voor tijd-conflict detectie.';
