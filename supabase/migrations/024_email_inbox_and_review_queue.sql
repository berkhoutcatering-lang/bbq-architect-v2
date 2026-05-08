-- ════════════════════════════════════════════════════════════════════════════
--  024 — Email-inbox + review queue voor /price-intelligence
-- ════════════════════════════════════════════════════════════════════════════
--
--  Pillar #1 (Forward-and-Forget): leveranciersmail → Cloudflare Worker →
--    /api/email/inbound → org_email_inbox + org_email_attachments
--  Pillar #2 (Review-Before-Trust): geen prijsmutatie naar supplier_prices
--    zonder approved row in org_price_mutations
--  Pillar #3 (Universal Parser): één tabel-set ondersteunt PDF/JPG/XLS/CSV/text
--  Pillar #4 (Passive Invoice-Capture): supplier_invoices lines mogen óók
--    rijen in org_price_mutations seeden (source='invoice')
--  Pillar #5 (Cost-Bounded): ai_cost_cents per attachment vastgelegd
--
--  Patroon volgt bestaande migrations (010, 011): organization_id (UUID),
--  RLS via organization_members join, "IS NULL OR IN (...)" voor legacy-tolerance.
-- ════════════════════════════════════════════════════════════════════════════


-- ── 1. INBOX: ruwe inkomende mails per organisatie ────────────────────────
CREATE TABLE IF NOT EXISTS org_email_inbox (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id     UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    inbound_address     TEXT NOT NULL,                                 -- pl-{slug}@in.bbqarchitect.app
    from_email          TEXT NOT NULL,
    from_name           TEXT,
    subject             TEXT,
    received_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    raw_message_id      TEXT,                                          -- voor dedup
    body_excerpt        TEXT,                                          -- eerste ~500 chars, rest weg na 30d
    attachment_count    INT NOT NULL DEFAULT 0,
    spf_pass            BOOLEAN,
    dkim_pass           BOOLEAN,
    status              TEXT NOT NULL DEFAULT 'received'
                        CHECK (status IN ('received','parsing','parsed','failed','dismissed')),
    parse_error         TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_email_inbox_org_received
    ON org_email_inbox (organization_id, received_at DESC);

-- Idempotency-guard: zelfde messageId twee keer = dedup
CREATE UNIQUE INDEX IF NOT EXISTS ux_email_inbox_message_dedup
    ON org_email_inbox (organization_id, raw_message_id)
    WHERE raw_message_id IS NOT NULL;

ALTER TABLE org_email_inbox ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_org" ON org_email_inbox;
CREATE POLICY "select_own_org" ON org_email_inbox FOR SELECT
    USING (
        organization_id IS NULL
        OR organization_id IN (
            SELECT organization_id FROM organization_members
            WHERE user_id = auth.uid() AND status = 'active'
        )
    );

DROP POLICY IF EXISTS "update_own_org" ON org_email_inbox;
CREATE POLICY "update_own_org" ON org_email_inbox FOR UPDATE
    USING (
        organization_id IS NULL
        OR organization_id IN (
            SELECT organization_id FROM organization_members
            WHERE user_id = auth.uid() AND status = 'active'
        )
    )
    WITH CHECK (
        organization_id IN (
            SELECT organization_id FROM organization_members
            WHERE user_id = auth.uid() AND status = 'active'
        )
    );

-- INSERT alleen via service-role (webhook). Geen policy → enabled-RLS blokkeert default.
-- (Service-role bypass'ed RLS sowieso, dus geen policy nodig.)

-- updated_at-trigger
CREATE OR REPLACE FUNCTION set_email_inbox_updated() RETURNS trigger AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_email_inbox_updated ON org_email_inbox;
CREATE TRIGGER trg_email_inbox_updated
    BEFORE UPDATE ON org_email_inbox
    FOR EACH ROW EXECUTE FUNCTION set_email_inbox_updated();


-- ── 2. ATTACHMENTS: metadata over Storage-bestanden ───────────────────────
CREATE TABLE IF NOT EXISTS org_email_attachments (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    inbox_id            UUID NOT NULL REFERENCES org_email_inbox(id) ON DELETE CASCADE,
    organization_id     UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    filename            TEXT NOT NULL,
    mime_type           TEXT NOT NULL,
    storage_path        TEXT NOT NULL,                                 -- bucket: email-attachments
    size_bytes          BIGINT,
    parse_status        TEXT NOT NULL DEFAULT 'pending'
                        CHECK (parse_status IN ('pending','parsing','parsed','failed','skipped')),
    parsed_supplier     TEXT,
    parsed_count        INT,                                           -- aantal producten geparsed
    ai_cost_cents       INT,
    ai_model            TEXT,
    parse_error         TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_email_attach_inbox    ON org_email_attachments (inbox_id);
CREATE INDEX IF NOT EXISTS idx_email_attach_org      ON org_email_attachments (organization_id);
CREATE INDEX IF NOT EXISTS idx_email_attach_status   ON org_email_attachments (organization_id, parse_status);

ALTER TABLE org_email_attachments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_org" ON org_email_attachments;
CREATE POLICY "select_own_org" ON org_email_attachments FOR SELECT
    USING (
        organization_id IS NULL
        OR organization_id IN (
            SELECT organization_id FROM organization_members
            WHERE user_id = auth.uid() AND status = 'active'
        )
    );


-- ── 3. PRICE MUTATIONS: review queue (Pillar #2 + #4) ─────────────────────
--  Bron is 'email_inbox' (lane 4), 'pdf_upload' (lane 3 future), 'invoice'
--  (lane 1 passive capture), of 'manual' (Sam typt zelf bij).
--
--  Geen FK naar master_products op een NOT-NULL kolom, want fuzzy-match kan
--  ook missen — dan blijft master_product_id NULL en biedt UI een "match
--  een bestaand product OF maak nieuw" knop.
CREATE TABLE IF NOT EXISTS org_price_mutations (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id         UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    source                  TEXT NOT NULL
                            CHECK (source IN ('email_inbox','pdf_upload','invoice','manual')),
    source_ref_id           UUID,                                       -- inbox_id of supplier_invoice_id
    source_attachment_id    UUID,                                       -- nullable; voor email_inbox
    leverancier             TEXT,                                       -- AI-extracted, voor onboarding
    leverancier_id          BIGINT,                                     -- soft-FK naar leveranciers(id) (int); geen hard FK om migratie-issues te voorkomen
    parsed_naam             TEXT NOT NULL,
    parsed_eenheid          TEXT,
    parsed_categorie        TEXT,
    parsed_prijs            NUMERIC(10,2) NOT NULL CHECK (parsed_prijs >= 0 AND parsed_prijs <= 99999),
    parsed_btw_pct          NUMERIC(4,2),                               -- alleen als evident uit bron
    confidence              NUMERIC(3,2) DEFAULT 1.00 CHECK (confidence >= 0 AND confidence <= 1),

    -- Match-resultaat naar bestaand product (bigint omdat master_products.id bigserial is)
    master_product_id       BIGINT,                                     -- nullable, soft-FK
    match_confidence        NUMERIC(3,2),                               -- fuzzy-match score
    current_prijs           NUMERIC(10,2),                              -- snapshot uit supplier_prices vóór mutatie
    delta_pct               NUMERIC(7,2),                               -- berekend door trigger hieronder

    status                  TEXT NOT NULL DEFAULT 'pending'
                            CHECK (status IN ('pending','approved','dismissed','auto_committed','superseded')),
    reviewed_by             UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    reviewed_at             TIMESTAMPTZ,
    committed_supplier_price_id BIGINT,                                 -- soft-FK naar supplier_prices na approve
    notes                   TEXT,

    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Generated kolom voor delta_pct (oud → nieuw)
-- Niet als generated column geforceerd want oude/null current_prijs = NULL,
-- en sommige rows kunnen later geupdate worden — keep flexible.
-- Trigger vult automatisch in op INSERT/UPDATE als beide prijzen bekend zijn.
CREATE OR REPLACE FUNCTION calc_price_mutation_delta() RETURNS trigger AS $$
BEGIN
    IF NEW.current_prijs IS NOT NULL AND NEW.current_prijs > 0 THEN
        NEW.delta_pct := round(((NEW.parsed_prijs - NEW.current_prijs) / NEW.current_prijs) * 100, 2);
    END IF;
    NEW.updated_at := now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_price_mutation_delta ON org_price_mutations;
CREATE TRIGGER trg_price_mutation_delta
    BEFORE INSERT OR UPDATE ON org_price_mutations
    FOR EACH ROW EXECUTE FUNCTION calc_price_mutation_delta();

CREATE INDEX IF NOT EXISTS idx_mut_org_status      ON org_price_mutations (organization_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mut_source          ON org_price_mutations (source, source_ref_id);
CREATE INDEX IF NOT EXISTS idx_mut_master_product  ON org_price_mutations (master_product_id) WHERE master_product_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_mut_pending         ON org_price_mutations (organization_id) WHERE status = 'pending';

ALTER TABLE org_price_mutations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_org" ON org_price_mutations;
CREATE POLICY "select_own_org" ON org_price_mutations FOR SELECT
    USING (
        organization_id IS NULL
        OR organization_id IN (
            SELECT organization_id FROM organization_members
            WHERE user_id = auth.uid() AND status = 'active'
        )
    );

DROP POLICY IF EXISTS "update_own_org" ON org_price_mutations;
CREATE POLICY "update_own_org" ON org_price_mutations FOR UPDATE
    USING (
        organization_id IS NULL
        OR organization_id IN (
            SELECT organization_id FROM organization_members
            WHERE user_id = auth.uid() AND status = 'active'
        )
    )
    WITH CHECK (
        organization_id IN (
            SELECT organization_id FROM organization_members
            WHERE user_id = auth.uid() AND status = 'active'
        )
    );

-- INSERT/DELETE blijven service-role-only (webhook + scheduled cleanup).


-- ── 4. INBOX-ADRES per organisatie ────────────────────────────────────────
--  Slug uit organizations(slug) wordt gebruikt voor pl-{slug}@in.bbqarchitect.app
--  Er is geen aparte tabel nodig; de slug IS het adres. Wel een view voor UI.
CREATE OR REPLACE VIEW v_org_inbox_address AS
SELECT
    o.id                                                AS organization_id,
    o.name                                              AS organisatie_naam,
    -- Fallback op id-prefix als slug ontbreekt; alleen lower-alphanumeric
    'pl-' || COALESCE(NULLIF(regexp_replace(lower(o.slug), '[^a-z0-9]', '', 'g'), ''),
                       substr(o.id::text, 1, 8))         AS inbox_local,
    'pl-' || COALESCE(NULLIF(regexp_replace(lower(o.slug), '[^a-z0-9]', '', 'g'), ''),
                       substr(o.id::text, 1, 8))
                       || '@in.bbqarchitect.app'        AS inbox_address
FROM organizations o;

GRANT SELECT ON v_org_inbox_address TO authenticated;


-- ── 5. STORAGE BUCKET voor email-attachments ──────────────────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('email-attachments', 'email-attachments', false)
ON CONFLICT (id) DO NOTHING;

-- RLS op storage.objects voor deze bucket: leden van de org mogen alleen
-- hun eigen folder lezen. Folder-conventie: `email-attachments/{org_id}/{inbox_id}/{filename}`.
DROP POLICY IF EXISTS "email_attach_select_own_org" ON storage.objects;
CREATE POLICY "email_attach_select_own_org" ON storage.objects FOR SELECT
    TO authenticated
    USING (
        bucket_id = 'email-attachments'
        AND (storage.foldername(name))[1] IN (
            SELECT organization_id::text FROM organization_members
            WHERE user_id = auth.uid() AND status = 'active'
        )
    );

-- Service-role schrijft (webhook + parser); geen extra policy nodig.


-- ── 6. RETENTION-FUNCTIES (Pillar #2 + AVG) ──────────────────────────────
-- Raw email body's auto-expire na 30 dagen. Cron-job roept deze op (zie /api/cron).
CREATE OR REPLACE FUNCTION purge_old_email_inbox_bodies() RETURNS INT AS $$
DECLARE n INT;
BEGIN
    UPDATE org_email_inbox
       SET body_excerpt = NULL
     WHERE body_excerpt IS NOT NULL
       AND received_at < now() - interval '30 days';
    GET DIAGNOSTICS n = ROW_COUNT;
    RETURN n;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ── 7. UNIQUE-guard op price_history (uit plan, Pillar #2 dedup) ─────────
-- Voorkomt dat we bij re-import van dezelfde prijslijst dubbele history-rijen krijgen.
-- IF NOT EXISTS is bewust: bestaande migratie 010 had geen unique-constraint.
-- Note: dit faalt stil als price_history nog rijen heeft die niet uniek zijn.
-- In dat geval: handmatig de duplicates dedupen via SQL editor vóór deze migratie.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'price_history') THEN
        BEGIN
            CREATE UNIQUE INDEX IF NOT EXISTS ux_price_history_dedup
                ON price_history (organization_id, inventory_id, leverancier_id, datum, source);
        EXCEPTION WHEN unique_violation THEN
            RAISE NOTICE 'price_history bevat duplicates — UNIQUE-index niet aangemaakt. Dedup eerst.';
        END;
    END IF;
END $$;


-- ── 8. SEED: log-rij in audit_log voor traceability ──────────────────────
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'audit_log') THEN
        INSERT INTO audit_log (entity_type, entity_id, action, metadata, created_at)
        VALUES ('migration', NULL, 'applied', jsonb_build_object('migration', '024_email_inbox_and_review_queue'), now())
        ON CONFLICT DO NOTHING;
    END IF;
END $$;
