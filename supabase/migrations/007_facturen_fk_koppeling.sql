-- Sprint B.3: FK-koppeling Offertes ↔ Events ↔ Facturen
--
-- Voor deze migratie zaten facturen los van offertes/events. De
-- acceptance-workflow zocht "bestaat al"-facturen via fragiele
-- client_naam + JSON-stringify(items) match — bij minimale wijziging
-- (extra item, gewijzigde notitie) werd dezelfde factuur opnieuw
-- aangemaakt → dubbele facturen voor 1 event.
--
-- Deze migratie:
--   1. Voegt facturen.offerte_id en facturen.event_id toe (nullable; legacy
--      facturen zonder bron-offerte blijven geldig).
--   2. UNIQUE-constraint op offerte_id zodat per offerte maximaal 1 factuur
--      kan bestaan (NULL toegestaan voor handmatig aangemaakte facturen).
--   3. Indexen voor de twee meest-gebruikte queries (per event lookup,
--      per offerte lookup).
--
-- ON DELETE SET NULL: als een offerte/event verwijderd wordt blijft de
-- factuur staan maar verliest de link. Veiliger dan CASCADE want facturen
-- zijn juridisch verplichte documenten die niet zomaar mogen verdwijnen.

ALTER TABLE facturen
    ADD COLUMN IF NOT EXISTS offerte_id BIGINT REFERENCES offertes(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS event_id BIGINT REFERENCES events(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS facturen_offerte_id_unique
    ON facturen (offerte_id)
    WHERE offerte_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS facturen_event_id_idx ON facturen (event_id);

COMMENT ON COLUMN facturen.offerte_id IS
    'FK naar offertes.id — gevuld door auto-create bij offerte-acceptatie. '
    'Maximaal 1 factuur per offerte (UNIQUE partial index).';
COMMENT ON COLUMN facturen.event_id IS
    'FK naar events.id — handig voor event-overzicht ("openstaande factuur").';
