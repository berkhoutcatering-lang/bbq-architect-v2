-- Recepten samenvouwen onder gerechten
--
-- Probleem: /recepten en /gerechten waren twee aparte hubs voor wat operationeel
-- hetzelfde concept is — een gerecht met ingrediënten + bereidingswijze. Mathijs
-- (eigenaar Hop & Bites) bevestigde 2026-04-30 dat hij ze als één ziet:
-- "alles mag onder gerechten — als je een gerecht aanklikt krijg je een modal
-- met receptuur, ingredients, allergenen, alles erin."
--
-- Deze migratie voegt de drie kolommen toe die `recepten` wel had en `gerechten`
-- niet, zodat de dish-modal op /gerechten kan tonen wat /recepten toonde:
--
--   - porties: referentie aantal porties voor de bereidingswijze (10/20/etc).
--             De wizard gebruikt dit straks om porties te schalen ("voor 50
--             gasten heb je X nodig").
--   - wijn_suggestie: serveer-tip voor wijnpairing.
--   - service_tip: serveer-tip / plating-instructie.
--
-- Wat NIET gebeurt in deze migratie:
--   - `recepten` tabel blijft bestaan (geen DROP) — bestaande data niet weg.
--   - Geen automatische data-kopie van recepten naar gerechten — zie file
--     `014b_recepten_data_migration.sql` voor optionele data-merge die Mathijs
--     handmatig kan draaien wanneer hij klaar is.
--   - `bereidingswijze` (al bestaand op gerechten) wordt hergebruikt voor de
--     stap-voor-stap recept-instructies — geen aparte `instructies` kolom.

ALTER TABLE gerechten
    ADD COLUMN IF NOT EXISTS porties INTEGER DEFAULT 10;

ALTER TABLE gerechten
    ADD COLUMN IF NOT EXISTS wijn_suggestie TEXT;

ALTER TABLE gerechten
    ADD COLUMN IF NOT EXISTS service_tip TEXT;

COMMENT ON COLUMN gerechten.porties IS 'Referentie aantal porties waarvoor de bereidingswijze geschreven is. Wizard kan hieruit schalen.';
COMMENT ON COLUMN gerechten.wijn_suggestie IS 'Vrije tekst — wijn-pairing suggestie voor service.';
COMMENT ON COLUMN gerechten.service_tip IS 'Vrije tekst — plating- of serveer-instructie voor de bediening.';
