-- ─────────────────────────────────────────────────────────────
--  Voorraad top-tier — foundation tabellen voor:
--  • Pillar #1: Event-aware voorraad (reserveringen, demand-view)
--  • Pillar #2: BBQ-yields ingebakken (order_templates per event-type)
--  • Pillar #4: Marge-alert bij prijsstijging (marge_alerts)
--
--  Plan: ~/.claude/plans/we-hebben-het-goofy-coral.md
--
--  Wat NIET hier:
--   - recipe_yields tabel — niet nodig, gerechten.ingredient_costs heeft al
--     qty_pp per ingredient. Geen duplicatie.
--   - inventory.reserved_for_events kolom — niet nodig, berekenen we
--     server-side in src/lib/dal/inventoryDemand.ts via events × gerechten ×
--     ingredient_costs. Geen trigger-hel.
--   - inventory_locations — single-koelcel-realiteit, niet bouwen.
-- ─────────────────────────────────────────────────────────────

-- ── 1. marge_alerts ───────────────────────────────────────────
-- Detecteert leverancier-prijsschommelingen >5% en linkt naar offertes
-- met dat ingredient, zodat we de "stille margelek" kunnen stoppen.
-- Engine: scheduled task elke 6u (zie src/lib/jobs/margeAlertScan.ts later).

CREATE TABLE IF NOT EXISTS marge_alerts (
    id                       BIGSERIAL PRIMARY KEY,
    organization_id          UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    inventory_id             INTEGER REFERENCES inventory(id) ON DELETE CASCADE,
    leverancier_id           INTEGER REFERENCES leveranciers(id) ON DELETE SET NULL,
    -- Wat is er veranderd
    old_price                NUMERIC(10,4) NOT NULL,
    new_price                NUMERIC(10,4) NOT NULL,
    pct_change               NUMERIC(6,2)  NOT NULL,             -- positief = stijging, negatief = daling
    detected_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- Welke offertes worden geraakt
    affected_offertes        JSONB DEFAULT '[]'::jsonb,          -- [{offerte_id, klant, marge_delta_eur}]
    total_marge_impact_eur   NUMERIC(10,2) DEFAULT 0,
    -- Workflow
    status                   TEXT NOT NULL DEFAULT 'open'
                             CHECK (status IN ('open', 'acknowledged', 'resolved', 'dismissed')),
    notes                    TEXT,
    resolved_at              TIMESTAMPTZ,
    resolved_by_user_id      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE marge_alerts IS
    'Pillar #4 — prijs-shift detection per leverancier × ingredient. Engine vult dit periodiek, UI rendert sticky banner op /leveranciers en /vandaag.';
COMMENT ON COLUMN marge_alerts.affected_offertes IS
    'JSONB array van offertes geraakt door de prijs-verandering: [{offerte_id, klant_naam, marge_delta_eur, datum}].';
COMMENT ON COLUMN marge_alerts.pct_change IS
    'Positief = prijs is omhoog gegaan (slecht), negatief = prijs is omlaag gegaan (kan een kans zijn).';

-- Indexes — RLS-kolom + lookup-patronen
CREATE INDEX IF NOT EXISTS marge_alerts_org_idx
    ON marge_alerts (organization_id, status, detected_at DESC);
CREATE INDEX IF NOT EXISTS marge_alerts_inventory_idx
    ON marge_alerts (inventory_id);
CREATE INDEX IF NOT EXISTS marge_alerts_leverancier_idx
    ON marge_alerts (leverancier_id);
CREATE INDEX IF NOT EXISTS marge_alerts_open_idx
    ON marge_alerts (organization_id, detected_at DESC)
    WHERE status = 'open';

-- Idempotency: maximaal 1 open alert per org+inventory+leverancier.
-- Partial-index op WHERE status='open' is genoeg — resolved/dismissed alerts
-- voor zelfde item mogen wel naast elkaar bestaan (historie).
-- DATE_TRUNC kan niet in index-expression (functions must be IMMUTABLE).
CREATE UNIQUE INDEX IF NOT EXISTS marge_alerts_dedup_idx
    ON marge_alerts (organization_id, inventory_id, leverancier_id)
    WHERE status = 'open';

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.set_marge_alerts_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS marge_alerts_updated_at ON marge_alerts;
CREATE TRIGGER marge_alerts_updated_at
    BEFORE UPDATE ON marge_alerts
    FOR EACH ROW EXECUTE FUNCTION public.set_marge_alerts_updated_at();

ALTER TABLE marge_alerts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS marge_alerts_select ON marge_alerts;
CREATE POLICY marge_alerts_select ON marge_alerts
    FOR SELECT USING (organization_id IN (SELECT public.user_org_ids()));

DROP POLICY IF EXISTS marge_alerts_insert ON marge_alerts;
CREATE POLICY marge_alerts_insert ON marge_alerts
    FOR INSERT WITH CHECK (organization_id IN (SELECT public.user_org_ids()));

DROP POLICY IF EXISTS marge_alerts_update ON marge_alerts;
CREATE POLICY marge_alerts_update ON marge_alerts
    FOR UPDATE
    USING (organization_id IN (SELECT public.user_org_ids()))
    WITH CHECK (organization_id IN (SELECT public.user_org_ids()));

DROP POLICY IF EXISTS marge_alerts_delete ON marge_alerts;
CREATE POLICY marge_alerts_delete ON marge_alerts
    FOR DELETE USING (organization_id IN (SELECT public.user_org_ids()));

-- ── 2. order_templates ────────────────────────────────────────
-- "Vorige keer voor 80 gasten" — bewaard bestelvoorstel uit prakritjk-brainstorm.
-- Wordt opgeslagen vanuit /inkoop als de cateraar tevreden was over de bestelling.

CREATE TABLE IF NOT EXISTS order_templates (
    id                  BIGSERIAL PRIMARY KEY,
    organization_id     UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name                TEXT NOT NULL DEFAULT '',         -- bv. "Bruiloft 80 pax — standaard"
    description         TEXT,
    event_type          TEXT,                              -- bv. "Bruiloft", "Bedrijfsfeest"
    guests_baseline     INTEGER NOT NULL DEFAULT 50 CHECK (guests_baseline > 0),
    items               JSONB NOT NULL DEFAULT '[]'::jsonb, -- [{inventory_id, naam, qty, unit, leverancier_id, est_price_eur}]
    source_event_id     INTEGER REFERENCES events(id) ON DELETE SET NULL,
    last_used_at        TIMESTAMPTZ,
    use_count           INTEGER NOT NULL DEFAULT 0,
    created_by_user_id  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE order_templates IS
    'Pillar #1+#2 — "vorige keer voor 80 gasten" templates. Skaalbaar naar nieuwe event-grootte via guests_baseline.';
COMMENT ON COLUMN order_templates.guests_baseline IS
    'Aantal gasten waarvoor de template oorspronkelijk gold. Bij hergebruik: qty × (new_guests / guests_baseline).';
COMMENT ON COLUMN order_templates.items IS
    'JSONB array — [{inventory_id, naam, qty, unit, leverancier_id, est_price_eur}]. naam blijft denormalized voor display als inventory_id geen match meer is.';

CREATE INDEX IF NOT EXISTS order_templates_org_idx
    ON order_templates (organization_id, last_used_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS order_templates_event_type_idx
    ON order_templates (organization_id, event_type);

CREATE OR REPLACE FUNCTION public.set_order_templates_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS order_templates_updated_at ON order_templates;
CREATE TRIGGER order_templates_updated_at
    BEFORE UPDATE ON order_templates
    FOR EACH ROW EXECUTE FUNCTION public.set_order_templates_updated_at();

ALTER TABLE order_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS order_templates_select ON order_templates;
CREATE POLICY order_templates_select ON order_templates
    FOR SELECT USING (organization_id IN (SELECT public.user_org_ids()));

DROP POLICY IF EXISTS order_templates_insert ON order_templates;
CREATE POLICY order_templates_insert ON order_templates
    FOR INSERT WITH CHECK (organization_id IN (SELECT public.user_org_ids()));

DROP POLICY IF EXISTS order_templates_update ON order_templates;
CREATE POLICY order_templates_update ON order_templates
    FOR UPDATE
    USING (organization_id IN (SELECT public.user_org_ids()))
    WITH CHECK (organization_id IN (SELECT public.user_org_ids()));

DROP POLICY IF EXISTS order_templates_delete ON order_templates;
CREATE POLICY order_templates_delete ON order_templates
    FOR DELETE USING (organization_id IN (SELECT public.user_org_ids()));

-- ── 3. inventory.last_price_eur (cache van meest recente leverancier-prijs) ─
-- Niet kritisch maar maakt offerte-cost-calc real-time zonder JOIN op price_history.
-- Wordt bijgewerkt door bon-process trigger of margeAlertScan.

ALTER TABLE inventory
    ADD COLUMN IF NOT EXISTS last_price_eur NUMERIC(10,4),
    ADD COLUMN IF NOT EXISTS last_price_at  TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS last_price_leverancier_id INTEGER
        REFERENCES leveranciers(id) ON DELETE SET NULL;

COMMENT ON COLUMN inventory.last_price_eur IS
    'Pillar #4 — meest recente leverancier-prijs (cache uit price_history). costCalculations.ts gebruikt dit ipv stale purchase_price.';

CREATE INDEX IF NOT EXISTS inventory_last_price_lev_idx
    ON inventory (last_price_leverancier_id)
    WHERE last_price_leverancier_id IS NOT NULL;

-- Vul initieel uit price_history (meest recent per inventory)
UPDATE inventory inv
SET last_price_eur = ph.unit_price,
    last_price_at = ph.datum,
    last_price_leverancier_id = ph.leverancier_id
FROM (
    SELECT DISTINCT ON (inventory_id)
        inventory_id, unit_price, datum, leverancier_id
    FROM price_history
    WHERE unit_price IS NOT NULL AND unit_price > 0
    ORDER BY inventory_id, datum DESC, id DESC
) ph
WHERE inv.id = ph.inventory_id
  AND (inv.last_price_eur IS NULL OR inv.last_price_at IS NULL);

-- ── 4. Auto-update last_price uit price_history bij INSERT ───────
CREATE OR REPLACE FUNCTION public.sync_inventory_last_price()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.unit_price IS NULL OR NEW.unit_price <= 0 THEN RETURN NEW; END IF;
    -- Alleen vooruit-schrijven: bestaande last_price_at later dan deze rij? laat staan.
    UPDATE inventory
    SET last_price_eur = NEW.unit_price,
        last_price_at = NEW.datum,
        last_price_leverancier_id = NEW.leverancier_id
    WHERE id = NEW.inventory_id
      AND (last_price_at IS NULL OR last_price_at <= NEW.datum);
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS price_history_sync_inventory ON price_history;
CREATE TRIGGER price_history_sync_inventory
    AFTER INSERT ON price_history
    FOR EACH ROW EXECUTE FUNCTION public.sync_inventory_last_price();

-- ── 5. leveranciers.factuur_cyclus — Pillar #5 (slager-flow) ────────
-- BBQ-cateraar werkt anders met slager dan met Sligro: slager geeft een
-- papieren bonnetje, factureert week- of maandelijks. Sligro = direct
-- digitaal. Deze tag onderscheidt die twee werelden.

ALTER TABLE leveranciers
    ADD COLUMN IF NOT EXISTS factuur_cyclus TEXT
        CHECK (factuur_cyclus IS NULL OR factuur_cyclus IN ('bij_levering', 'week', 'maand', 'kwartaal'));

ALTER TABLE leveranciers
    ADD COLUMN IF NOT EXISTS bon_invoer_methode TEXT
        DEFAULT 'portal'
        CHECK (bon_invoer_methode IN ('portal', 'email', 'foto', 'handmatig'));

ALTER TABLE leveranciers
    ADD COLUMN IF NOT EXISTS kwaliteit_score NUMERIC(3,1)
        CHECK (kwaliteit_score IS NULL OR (kwaliteit_score >= 0 AND kwaliteit_score <= 10));

COMMENT ON COLUMN leveranciers.factuur_cyclus IS
    'Pillar #5 (slager-flow) — bij_levering = direct contant/pin/factuur, week/maand/kwartaal = verzamelfactuur. Helpt cashflow plannen.';
COMMENT ON COLUMN leveranciers.bon_invoer_methode IS
    'Hoe komen bonnen binnen: portal (Sligro/Makro sync), email (PDF inbox), foto (FAB-scan), handmatig.';
COMMENT ON COLUMN leveranciers.kwaliteit_score IS
    'Cateraar-subjectieve score 0-10 (kwaliteit + betrouwbaarheid). Voor leverancier-vergelijking.';

-- Default voor bestaande slager-typen
UPDATE leveranciers
SET factuur_cyclus = 'week',
    bon_invoer_methode = 'foto'
WHERE LOWER(type) LIKE '%slager%'
  AND factuur_cyclus IS NULL;
