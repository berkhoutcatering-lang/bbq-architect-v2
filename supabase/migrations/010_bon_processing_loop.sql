-- Sprint Bon-loop: factuur/bon-input automatisch alle systemen updaten
--
-- Vóór deze migratie was bon-scan een eenrichting: AI parsed → user keurde
-- per item handmatig goed → blinde insert in inventory (met duplicaten als
-- de naam al bestond). Geen koppeling met leverancier-FK, geen prijs-historie,
-- geen BTW-splitsing, en boekhouding zag de uitgave niet.
--
-- Met deze wijzigingen sluit de loop:
--   bon-foto → leverancier upsert → inventory upsert → stock_movement (receive)
--           → price_history snapshot → bonnen-rij gekoppeld
--           → boekhouding rapporteert uitgave + voorbelasting BTW
--
-- Concrete kolommen:
--
-- 1) bonnen
--    + leverancier_id  → FK naar leveranciers (winkel-string blijft als
--      fallback voor pre-FK rijen).
--    + bon_items       → JSONB lijst van geparseerde regels:
--      [{naam, aantal, unit, prijs, btw_pct, totaal}]. Querybaar voor reports.
--    + btw_laag_bedrag, btw_hoog_bedrag → uitgesplitste voorbelasting per
--      tarief (9% food / 21% non-food). Boekhouding sommeert deze per maand
--      voor BTW-aangifte.
--    + netto_bedrag    → totaal_bedrag − totale btw, voor cashflow-analyse.
--
-- 2) inventory
--    + leverancier_id  → FK; vervangt op termijn de text-string `supplier`.
--      Beide naast elkaar tijdens transitie zodat bestaande UI niet breekt.
--
-- 3) stock_movements
--    + unit_price      → snapshot van inkoopprijs op moment van movement.
--      Maakt margecalc reproducibel — als we 6 mnd later kijken wat een
--      geserveerde portie écht kostte, klopt dat met de prijs van toen.
--    + bon_id          → FK naar bonnen (NULL voor service/usage movements).
--      Audit-trail: van uitgave naar voorraadtoename naar serveerafname.
--
-- 4) price_history (nieuwe tabel)
--    Per inventory_id + datum + source de inkoopprijs. Voedt prijs-trend
--    grafiek + anomaly-detection ("Sligro brisket steeg 30% sinds vorige
--    maand"). source: 'bon' | 'manual' | 'sync' (toekomstige scraper).
--
-- 5) Auto-fill triggers
--    bonnen + stock_movements + price_history krijgen organization_id
--    automatisch via vergelijkbaar patroon als courses/event_allergies.

-- ── 1. bonnen kolommen ──────────────────────────────────────────────────
ALTER TABLE bonnen
    ADD COLUMN IF NOT EXISTS leverancier_id INTEGER REFERENCES leveranciers(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS bon_items JSONB DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS btw_laag_bedrag NUMERIC,
    ADD COLUMN IF NOT EXISTS btw_hoog_bedrag NUMERIC,
    ADD COLUMN IF NOT EXISTS netto_bedrag NUMERIC,
    ADD COLUMN IF NOT EXISTS processed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS bonnen_leverancier_id_idx ON bonnen (leverancier_id);
CREATE INDEX IF NOT EXISTS bonnen_datum_idx ON bonnen (datum);

COMMENT ON COLUMN bonnen.leverancier_id IS 'FK naar leveranciers; auto-koppeling via fuzzy match op winkel-string in bon-process API.';
COMMENT ON COLUMN bonnen.bon_items IS 'Genormaliseerde regel-array [{naam,aantal,unit,prijs,btw_pct,totaal}]. Querybaar voor uitgaven-rapportage.';
COMMENT ON COLUMN bonnen.btw_laag_bedrag IS 'Voorbelasting 9% (food) — sommeerbaar per maand voor BTW-aangifte.';
COMMENT ON COLUMN bonnen.btw_hoog_bedrag IS 'Voorbelasting 21% (non-food).';
COMMENT ON COLUMN bonnen.processed_at IS 'NULL = nog niet automatisch verwerkt; gevuld bij /api/bon-process call.';

-- ── 2. inventory.leverancier_id ─────────────────────────────────────────
ALTER TABLE inventory
    ADD COLUMN IF NOT EXISTS leverancier_id INTEGER REFERENCES leveranciers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS inventory_leverancier_id_idx ON inventory (leverancier_id);

COMMENT ON COLUMN inventory.leverancier_id IS
    'FK naar leveranciers. Auto-gevuld bij eerste bon-import van een nieuw item. text-kolom `supplier` blijft tijdens transitie als fallback voor handmatig ingevoerde items.';

-- ── 3. stock_movements kolommen ─────────────────────────────────────────
ALTER TABLE stock_movements
    ADD COLUMN IF NOT EXISTS unit_price NUMERIC,
    ADD COLUMN IF NOT EXISTS bon_id BIGINT REFERENCES bonnen(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS stock_movements_bon_id_idx ON stock_movements (bon_id);

COMMENT ON COLUMN stock_movements.unit_price IS
    'Inkoopprijs per unit op moment van movement. Niet null voor type=receive; reproduceerbare margecalc.';
COMMENT ON COLUMN stock_movements.bon_id IS
    'FK naar bron-bon (NULL voor service/usage). Audit: van bon → voorraadtoename → serveerafname.';

-- ── 4. price_history tabel ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS price_history (
    id BIGSERIAL PRIMARY KEY,
    inventory_id INTEGER NOT NULL REFERENCES inventory(id) ON DELETE CASCADE,
    leverancier_id INTEGER REFERENCES leveranciers(id) ON DELETE SET NULL,
    bon_id BIGINT REFERENCES bonnen(id) ON DELETE SET NULL,
    datum DATE NOT NULL,
    unit_price NUMERIC NOT NULL CHECK (unit_price >= 0),
    unit TEXT,
    source TEXT NOT NULL DEFAULT 'manual'
        CHECK (source IN ('bon', 'manual', 'sync', 'estimate')),
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS price_history_inventory_idx ON price_history (inventory_id, datum DESC);
CREATE INDEX IF NOT EXISTS price_history_leverancier_idx ON price_history (leverancier_id, datum DESC);
CREATE INDEX IF NOT EXISTS price_history_organization_idx ON price_history (organization_id);

COMMENT ON TABLE price_history IS
    'Prijs-tijdlijn per inventory-item × leverancier × datum. Voedt prijs-trend grafiek + anomaly-detection (>10% stijging triggert AI-warning).';

ALTER TABLE price_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS price_history_org_read ON price_history;
CREATE POLICY price_history_org_read ON price_history FOR SELECT
    USING (
        organization_id IS NULL
        OR organization_id IN (
            SELECT organization_id FROM organization_members
            WHERE user_id = auth.uid() AND status = 'active'
        )
    );

DROP POLICY IF EXISTS price_history_org_write ON price_history;
CREATE POLICY price_history_org_write ON price_history FOR ALL
    USING (
        organization_id IS NULL
        OR organization_id IN (
            SELECT organization_id FROM organization_members
            WHERE user_id = auth.uid() AND status = 'active'
        )
    )
    WITH CHECK (
        organization_id IS NULL
        OR organization_id IN (
            SELECT organization_id FROM organization_members
            WHERE user_id = auth.uid() AND status = 'active'
        )
    );

-- ── 5. Auto-fill organization_id triggers ───────────────────────────────
-- Hergebruik fill_org_id_from_event-pattern, maar resolve via inventory.

CREATE OR REPLACE FUNCTION fill_org_id_from_inventory() RETURNS trigger AS $$
BEGIN
    IF NEW.organization_id IS NULL AND NEW.inventory_id IS NOT NULL THEN
        SELECT organization_id INTO NEW.organization_id FROM inventory WHERE id = NEW.inventory_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS price_history_fill_org_id ON price_history;
CREATE TRIGGER price_history_fill_org_id
    BEFORE INSERT OR UPDATE ON price_history
    FOR EACH ROW
    EXECUTE FUNCTION fill_org_id_from_inventory();
