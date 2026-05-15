-- ════════════════════════════════════════════════════════════════════════════
--  029 — Moneybird purchase-invoice ingestion (gouden route)
--
--  Doel: trek inkoopfacturen (Sligro/Makro/Bidfood/etc.) automatisch uit
--  Moneybird en seed ze in de bestaande org_price_mutations review-queue.
--  Geen scraper, geen API bij groothandel — Moneybird heeft ze al, want
--  daar gaan alle inkoopfacturen toch al heen voor de boekhouding.
--
--  Twee-paden-strategie:
--   (a) Moneybird-factuur heeft `details[]` met regels (UBL/Peppol-bron of
--       handmatig geboekt) → directe ingest, geen AI nodig.
--   (b) Alleen PDF → download document + bestaande PDF-extractor (Claude).
--
--  Tracking-tabel voorkomt dubbel-parsen + houdt cost/status bij.
--  Insert in org_price_mutations gebeurt met source='invoice' (al ondersteund
--  in 024) en source_ref_id = onze interne UUID (niet Moneybird's TEXT-id).
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS org_moneybird_invoices (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id     UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

    -- Moneybird identifiers
    mb_invoice_id       TEXT NOT NULL,            -- numeriek-als-string van Moneybird
    mb_administration_id TEXT NOT NULL,
    mb_contact_id       TEXT,                     -- voor leverancier-matching
    mb_contact_name     TEXT,                     -- snapshot leveranciers-naam

    -- Factuur-metadata (snapshot uit Moneybird-API)
    invoice_date        DATE,
    reference           TEXT,                     -- factuurnummer leverancier
    total_excl          NUMERIC(10,2),
    total_incl          NUMERIC(10,2),

    -- Onze koppeling
    leverancier_id      INTEGER,                  -- soft-FK naar leveranciers(id), kan NULL als geen match

    -- Parse-state
    has_details         BOOLEAN NOT NULL DEFAULT false,  -- true = Moneybird leverde line items, false = alleen PDF
    parse_status        TEXT NOT NULL DEFAULT 'pending'
                        CHECK (parse_status IN ('pending','parsing','parsed','skipped','failed')),
    parsed_count        INT,                       -- aantal regels geseed in price_mutations
    parsed_at           TIMESTAMPTZ,
    parse_error         TEXT,

    -- AI-cost tracking (alleen bij PDF-pad)
    ai_cost_cents       INT,
    ai_model            TEXT,

    -- Origin van de ingest
    source              TEXT NOT NULL DEFAULT 'backfill'
                        CHECK (source IN ('backfill','cron','webhook','manual')),

    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Idempotency-guard: zelfde Moneybird-factuur 2x importeren = no-op
CREATE UNIQUE INDEX IF NOT EXISTS ux_moneybird_invoices_dedup
    ON org_moneybird_invoices (organization_id, mb_invoice_id);

CREATE INDEX IF NOT EXISTS idx_moneybird_invoices_org_status
    ON org_moneybird_invoices (organization_id, parse_status);

CREATE INDEX IF NOT EXISTS idx_moneybird_invoices_org_date
    ON org_moneybird_invoices (organization_id, invoice_date DESC);

CREATE INDEX IF NOT EXISTS idx_moneybird_invoices_contact
    ON org_moneybird_invoices (organization_id, mb_contact_id)
    WHERE mb_contact_id IS NOT NULL;

ALTER TABLE org_moneybird_invoices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_org" ON org_moneybird_invoices;
CREATE POLICY "select_own_org" ON org_moneybird_invoices FOR SELECT
    USING (
        organization_id IS NULL
        OR organization_id IN (
            SELECT organization_id FROM organization_members
            WHERE user_id = auth.uid() AND status = 'active'
        )
    );

-- INSERT/UPDATE/DELETE: service-role only (backfill + cron + webhook).

CREATE OR REPLACE FUNCTION set_moneybird_invoices_updated() RETURNS trigger AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_moneybird_invoices_updated ON org_moneybird_invoices;
CREATE TRIGGER trg_moneybird_invoices_updated
    BEFORE UPDATE ON org_moneybird_invoices
    FOR EACH ROW EXECUTE FUNCTION set_moneybird_invoices_updated();


-- ── Audit-log entry ───────────────────────────────────────────────────────
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'audit_log') THEN
        INSERT INTO audit_log (entity_type, entity_id, action, metadata, created_at)
        VALUES ('migration', NULL, 'applied',
                jsonb_build_object('migration', '029_moneybird_purchase_invoices'),
                now())
        ON CONFLICT DO NOTHING;
    END IF;
END $$;
