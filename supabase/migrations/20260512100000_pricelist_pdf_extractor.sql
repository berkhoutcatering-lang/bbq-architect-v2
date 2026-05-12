-- ════════════════════════════════════════════════════════════════════════════
--  PDF Prijslijst Extractor — Sam's vlees-taxonomie + alias-learning
--
--  Pillar #1: vlees-cut-taxonomie (seedable, NOOIT AI-generated)
--  Pillar #3: alias-learning per tenant
--  Pillar #4: pricelist-upload tracking + status
--  Pillar #5: BTW server-derived (geen btw_pct in AI-output schema)
-- ════════════════════════════════════════════════════════════════════════════


-- ── 1. Global SEED: vlees-cut-taxonomie ───────────────────────────────────
-- Sam vult deze aan met zijn slager-jargon. Geen RLS — globaal lookup.

CREATE TABLE IF NOT EXISTS meat_taxonomy (
    id                BIGSERIAL PRIMARY KEY,
    soort             TEXT NOT NULL,            -- varken, kip, rund, lam, geit, vis, gevogelte, worst
    cut_groep         TEXT NOT NULL,            -- nek-borst, buik, bovenbil, bil-dij, schenkel, ...
    bereiding_default TEXT NOT NULL,            -- low-slow, hot-fast, sous-vide, braad
    aliassen          TEXT[] NOT NULL DEFAULT '{}',
    color_hex         TEXT NOT NULL DEFAULT '#7a7a7a',
    sort_order        INT NOT NULL DEFAULT 100,
    notes             TEXT,
    UNIQUE (soort, cut_groep)
);

GRANT SELECT ON meat_taxonomy TO authenticated, anon;

-- Seed met Sam's BBQ-vakkennis. Vul aan met JOUW slager-jargon.
INSERT INTO meat_taxonomy (soort, cut_groep, bereiding_default, aliassen, color_hex, sort_order) VALUES
  ('varken', 'nek-borst',  'low-slow', ARRAY['spiering','varkensnek','varkens nek','procureur','pork shoulder','shoulder','schouder','boston butt','pulled pork'], '#d4827a', 10),
  ('varken', 'buik',       'low-slow', ARRAY['buikspek','pork belly','speklap','bacon cut','varkensbuik','spek'], '#d4827a', 11),
  ('varken', 'bovenbil',   'hot-fast', ARRAY['ham','procureur bil','bovenham','varkensham'], '#d4827a', 12),
  ('varken', 'rib',        'low-slow', ARRAY['ribbetjes','spareribs','spare ribs','baby back','st louis','krabbetjes','varkensrib'], '#d4827a', 13),
  ('varken', 'haas',       'hot-fast', ARRAY['varkenshaas','tenderloin','pork tenderloin','filet pur'], '#d4827a', 14),
  ('varken', 'karbonade',  'hot-fast', ARRAY['karbonaden','pork chop','schouderkarbonade','haaskarbonade','speklap karbonade'], '#d4827a', 15),
  ('varken', 'secreto',    'hot-fast', ARRAY['secreto','iberico secreto','iberico spek'], '#d4827a', 16),
  ('varken', 'wang',       'low-slow', ARRAY['varkenswangen','varkenswang','wangetjes','pork cheek'], '#d4827a', 17),
  ('kip',    'bil-dij',    'hot-fast', ARRAY['kippendij','kippenbil','kippendijen','kippenbillen','chicken thigh','dij','poulet','kippedij','kippedijen'], '#e8c372', 20),
  ('kip',    'borst',      'hot-fast', ARRAY['kipfilet','kippenborst','chicken breast','breast','kipfilets'], '#e8c372', 21),
  ('kip',    'vleugel',    'hot-fast', ARRAY['kippenvleugels','wings','chicken wings','vleugeltjes','drumettes'], '#e8c372', 22),
  ('kip',    'heel',       'low-slow', ARRAY['hele kip','whole chicken','poulardes','poulard','grillkip'], '#e8c372', 23),
  ('kip',    'drumstick',  'hot-fast', ARRAY['drumstick','kippenpoot','kippenpoten','drumsticks','onderbout'], '#e8c372', 24),
  ('rund',   'borst',      'low-slow', ARRAY['brisket','runderborst','rinderbrust','beef brisket','runder borst'], '#a45050', 30),
  ('rund',   'rib',        'low-slow', ARRAY['runderribben','beef ribs','short ribs','plate ribs','ribstuk'], '#a45050', 31),
  ('rund',   'klapstuk',   'low-slow', ARRAY['chuck','klapstuk','runder schouder','beef shoulder','chuck roast'], '#a45050', 32),
  ('rund',   'bavette',    'hot-fast', ARRAY['bavette','flank steak','vinkje','vinkjes','flank','vang'], '#a45050', 33),
  ('rund',   'entrecote',  'hot-fast', ARRAY['entrecote','ribeye','rib eye','ribsteak','cote de boeuf','tomahawk'], '#a45050', 34),
  ('rund',   'haas',       'hot-fast', ARRAY['ossenhaas','beef tenderloin','runderhaas','filet mignon','filet'], '#a45050', 35),
  ('rund',   'picanha',    'hot-fast', ARRAY['picanha','staartstuk','top sirloin cap','culotte'], '#a45050', 36),
  ('lam',    'schouder',   'low-slow', ARRAY['lamsschouder','lamb shoulder','schouder lam'], '#8a5050', 40),
  ('lam',    'rack',       'hot-fast', ARRAY['lamsrack','rack of lamb','lamskotelet','lamskoteletten','frenched lamb'], '#8a5050', 41),
  ('lam',    'bout',       'low-slow', ARRAY['lamsbout','leg of lamb','gigot','lamsboutje'], '#8a5050', 42),
  ('gevogelte','eend',     'hot-fast', ARRAY['eendenborst','duck breast','magret','eendenbout','duck leg','eendenfilet'], '#b8845c', 50),
  ('gevogelte','kalkoen',  'low-slow', ARRAY['kalkoenfilet','kalkoenrollade','turkey breast','kalkoen','turkey'], '#b8845c', 51),
  ('vis',    'zalm',       'hot-fast', ARRAY['zalmfilet','zalm','salmon','zalm zijde','zalmmoot'], '#5a8a9a', 60),
  ('vis',    'tonijn',     'hot-fast', ARRAY['tonijnsteak','tuna','tonijn','yellowfin'], '#5a8a9a', 61),
  ('vis',    'kabeljauw',  'hot-fast', ARRAY['kabeljauwfilet','kabeljauw','cod','kabeljauw rug'], '#5a8a9a', 62),
  ('worst',  'worst',      'hot-fast', ARRAY['braadworst','rookworst','chorizo','bratwurst','knakworst','merguez','worstje','worstjes'], '#9a6a4a', 70),
  ('overig', 'overig',     'hot-fast', ARRAY[]::TEXT[], '#7a7a7a', 999)
ON CONFLICT (soort, cut_groep) DO NOTHING;


-- ── 2. Per-tenant aliassen die LEREN (Pillar #4) ──────────────────────────

CREATE TABLE IF NOT EXISTS org_product_aliases (
    id                  BIGSERIAL PRIMARY KEY,
    organization_id     UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    master_product_id   BIGINT NOT NULL,                            -- soft-FK
    alias               TEXT NOT NULL,
    alias_normalized    TEXT GENERATED ALWAYS AS (lower(trim(alias))) STORED,
    source              TEXT NOT NULL DEFAULT 'user_approved'
                        CHECK (source IN ('user_approved','ai_suggested','admin_seed')),
    cut_taxonomy_id     BIGINT REFERENCES meat_taxonomy(id) ON DELETE SET NULL,
    confidence          NUMERIC(3,2) DEFAULT 1.00,
    created_by          UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_aliases_org_norm
    ON org_product_aliases (organization_id, alias_normalized);
CREATE INDEX IF NOT EXISTS idx_aliases_org_master
    ON org_product_aliases (organization_id, master_product_id);
CREATE INDEX IF NOT EXISTS idx_aliases_cut
    ON org_product_aliases (cut_taxonomy_id) WHERE cut_taxonomy_id IS NOT NULL;

ALTER TABLE org_product_aliases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "aliases_select_own" ON org_product_aliases;
CREATE POLICY "aliases_select_own" ON org_product_aliases FOR SELECT TO authenticated
    USING (organization_id IN (
        SELECT organization_id FROM organization_members
        WHERE user_id = (select auth.uid()) AND status = 'active'
    ));

DROP POLICY IF EXISTS "aliases_insert_own" ON org_product_aliases;
CREATE POLICY "aliases_insert_own" ON org_product_aliases FOR INSERT TO authenticated
    WITH CHECK (organization_id IN (
        SELECT organization_id FROM organization_members
        WHERE user_id = (select auth.uid()) AND status = 'active'
    ));

DROP POLICY IF EXISTS "aliases_delete_own" ON org_product_aliases;
CREATE POLICY "aliases_delete_own" ON org_product_aliases FOR DELETE TO authenticated
    USING (organization_id IN (
        SELECT organization_id FROM organization_members
        WHERE user_id = (select auth.uid()) AND status = 'active'
    ));


-- ── 3. Pricelist-upload tracking ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS org_pricelist_uploads (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id       UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    leverancier_id        INTEGER REFERENCES leveranciers(id) ON DELETE SET NULL,
    uploaded_by           UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    filename              TEXT NOT NULL,
    storage_path          TEXT NOT NULL,
    size_bytes            BIGINT NOT NULL,
    page_count            INT,
    content_hash          TEXT NOT NULL,                            -- SHA-256 voor dedup
    status                TEXT NOT NULL DEFAULT 'uploaded'
                          CHECK (status IN ('uploaded','queued','parsing','parsed','failed','dismissed')),
    processing_mode       TEXT NOT NULL DEFAULT 'batch'
                          CHECK (processing_mode IN ('realtime','batch')),
    anthropic_batch_id    TEXT,
    parse_started_at      TIMESTAMPTZ,
    parse_finished_at     TIMESTAMPTZ,
    parsed_product_count  INT,
    new_count             INT,
    updated_count         INT,
    ai_cost_cents         INT,
    ai_model              TEXT,
    parse_error           TEXT,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_uploads_org_created
    ON org_pricelist_uploads (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_uploads_lev
    ON org_pricelist_uploads (leverancier_id, created_at DESC)
    WHERE leverancier_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_uploads_batch
    ON org_pricelist_uploads (anthropic_batch_id)
    WHERE anthropic_batch_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ux_uploads_dedup
    ON org_pricelist_uploads (organization_id, content_hash);

ALTER TABLE org_pricelist_uploads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "uploads_select_own" ON org_pricelist_uploads;
CREATE POLICY "uploads_select_own" ON org_pricelist_uploads FOR SELECT TO authenticated
    USING (organization_id IN (
        SELECT organization_id FROM organization_members
        WHERE user_id = (select auth.uid()) AND status = 'active'
    ));

DROP POLICY IF EXISTS "uploads_insert_own" ON org_pricelist_uploads;
CREATE POLICY "uploads_insert_own" ON org_pricelist_uploads FOR INSERT TO authenticated
    WITH CHECK (organization_id IN (
        SELECT organization_id FROM organization_members
        WHERE user_id = (select auth.uid()) AND status = 'active'
    ));

-- UPDATE alleen via service-role (parser-route). Geen authenticated UPDATE policy.


-- ── 4. Storage bucket voor PDF-bestanden ──────────────────────────────────

INSERT INTO storage.buckets (id, name, public)
VALUES ('pricelist-pdfs', 'pricelist-pdfs', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "pricelist_select_own_org" ON storage.objects;
CREATE POLICY "pricelist_select_own_org" ON storage.objects FOR SELECT TO authenticated
    USING (
        bucket_id = 'pricelist-pdfs'
        AND (storage.foldername(name))[1] IN (
            SELECT organization_id::text FROM organization_members
            WHERE user_id = (select auth.uid()) AND status = 'active'
        )
    );


-- ── 5. Audit log seed ─────────────────────────────────────────────────────

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'audit_log') THEN
        INSERT INTO audit_log (entity_type, entity_id, action, metadata, created_at)
        VALUES ('migration', NULL, 'applied',
                jsonb_build_object('migration', '20260512100000_pricelist_pdf_extractor'), now())
        ON CONFLICT DO NOTHING;
    END IF;
END $$;
