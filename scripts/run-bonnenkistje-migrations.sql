-- ════════════════════════════════════════════════════════════════════════
-- BONNENKISTJE — ALL-IN-ONE MIGRATION SCRIPT
--
-- Eén-shot SQL voor Supabase Studio. Bevat 8 migraties in correcte volgorde,
-- gewikkeld in BEGIN/COMMIT zodat een fout in het midden ALLES terugrolt.
--
-- Vereist (zou al moeten bestaan in productie):
--   - public.organizations + organization_members (uit 001)
--   - public.bonnen (uit 004 supplier_invoices, hernoemd naar bonnen)
--   - public.leveranciers
--   - public.stock_movements met bon_id FK (uit 010)
--   - public.audit_log + audit_log_changes() trigger function (uit 017)
--   - public.org_email_inbox + category kolom (uit 20260516120000)
--   - auth.user_org_ids() helper (uit 001)
--
-- Pre-check verifieert deze dependencies vooraf.
-- ════════════════════════════════════════════════════════════════════════

-- ── PRE-CHECK: alle dependencies aanwezig? ─────────────────────────────
DO $$
DECLARE
    v_missing TEXT[] := ARRAY[]::TEXT[];
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='organizations') THEN
        v_missing := array_append(v_missing, 'organizations (uit 001_multi_tenant)');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='organization_members') THEN
        v_missing := array_append(v_missing, 'organization_members (uit 001_multi_tenant)');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='bonnen') THEN
        v_missing := array_append(v_missing, 'bonnen (uit 004_supplier_invoices)');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='leveranciers') THEN
        v_missing := array_append(v_missing, 'leveranciers');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='audit_log') THEN
        v_missing := array_append(v_missing, 'audit_log (uit 017_audit_log)');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname='audit_log_changes' AND pronamespace=(SELECT oid FROM pg_namespace WHERE nspname='public')) THEN
        v_missing := array_append(v_missing, 'audit_log_changes() function (uit 017_audit_log)');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname='user_org_ids' AND pronamespace=(SELECT oid FROM pg_namespace WHERE nspname='auth')) THEN
        v_missing := array_append(v_missing, 'auth.user_org_ids() helper (uit 001_multi_tenant)');
    END IF;

    IF array_length(v_missing, 1) > 0 THEN
        RAISE EXCEPTION 'Ontbrekende dependencies — run eerst: %', array_to_string(v_missing, ', ');
    END IF;

    RAISE NOTICE '✅ Alle dependencies aanwezig — door met migraties...';
END $$;

-- ════════════════════════════════════════════════════════════════════════
-- ALLES IN 1 TRANSACTIE — fout = alles terugrollen, geen halve staat.
-- ════════════════════════════════════════════════════════════════════════
BEGIN;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- DEEL 1/8 — uit 20260520220000_bonnen_archief_search.sql
-- Voegt tags, leverancier_id FK, extracted_text en search_vec toe.
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

ALTER TABLE bonnen
    ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT ARRAY[]::TEXT[];

ALTER TABLE bonnen
    ADD COLUMN IF NOT EXISTS leverancier_id_temp BIGINT;

-- Als leverancier_id bestaat als integer, behoud die — anders maak nieuw.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema='public' AND table_name='bonnen' AND column_name='leverancier_id'
    ) THEN
        ALTER TABLE bonnen ADD COLUMN leverancier_id BIGINT REFERENCES leveranciers(id) ON DELETE SET NULL;
    END IF;
END $$;
ALTER TABLE bonnen DROP COLUMN IF EXISTS leverancier_id_temp;

ALTER TABLE bonnen
    ADD COLUMN IF NOT EXISTS extracted_text TEXT;

ALTER TABLE bonnen
    ADD COLUMN IF NOT EXISTS search_vec tsvector
    GENERATED ALWAYS AS (
        setweight(to_tsvector('dutch',
            coalesce(winkel, '') || ' ' ||
            coalesce(categorie, '')
        ), 'A') ||
        setweight(to_tsvector('dutch',
            coalesce(notities, '') || ' ' ||
            coalesce(array_to_string(tags, ' '), '')
        ), 'B') ||
        setweight(to_tsvector('dutch',
            coalesce(extracted_text, '')
        ), 'C')
    ) STORED;

CREATE INDEX IF NOT EXISTS bonnen_search_idx ON bonnen USING gin(search_vec);
CREATE INDEX IF NOT EXISTS bonnen_datum_idx ON bonnen (datum DESC);
CREATE INDEX IF NOT EXISTS bonnen_leverancier_idx ON bonnen (leverancier_id);
CREATE INDEX IF NOT EXISTS bonnen_status_idx ON bonnen (status);
CREATE INDEX IF NOT EXISTS bonnen_tags_idx ON bonnen USING gin(tags);

-- Backfill (best-effort, geen issue bij lege tabel).
UPDATE bonnen
SET extracted_text = (
    SELECT string_agg(
        coalesce(item->>'naam', '') || ' ' ||
        coalesce(item->>'eenheid', '') || ' ' ||
        coalesce(item->>'prijs', ''),
        ' '
    )
    FROM jsonb_array_elements(raw_analysis) AS action,
         jsonb_array_elements(action->'data'->'items') AS item
)
WHERE extracted_text IS NULL
  AND raw_analysis IS NOT NULL
  AND jsonb_typeof(raw_analysis) = 'array';

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- DEEL 2/8 — 20260525131000 — locked_at, source, file_path, status CHECK
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

ALTER TABLE bonnen
    ADD COLUMN IF NOT EXISTS locked_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS locked_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE bonnen
    ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'upload';
ALTER TABLE bonnen DROP CONSTRAINT IF EXISTS bonnen_source_check;
ALTER TABLE bonnen
    ADD CONSTRAINT bonnen_source_check
    CHECK (source IN ('upload', 'email', 'scan', 'api'));

CREATE INDEX IF NOT EXISTS bonnen_rgs_code_idx ON bonnen(organization_id, rgs_code);

ALTER TABLE bonnen
    ADD COLUMN IF NOT EXISTS file_path TEXT,
    ADD COLUMN IF NOT EXISTS file_mime TEXT;

UPDATE bonnen SET status = 'pending' WHERE status IS NULL;
ALTER TABLE bonnen DROP CONSTRAINT IF EXISTS bonnen_status_check;
ALTER TABLE bonnen
    ADD CONSTRAINT bonnen_status_check
    CHECK (status IN ('pending', 'review', 'processed', 'bevestigd', 'twijfel', 'vergrendeld'));
ALTER TABLE bonnen ALTER COLUMN status SET DEFAULT 'pending';

ALTER TABLE bonnen
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS bonnen_set_updated_at ON bonnen;
CREATE TRIGGER bonnen_set_updated_at
    BEFORE UPDATE ON bonnen
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX IF NOT EXISTS bonnen_org_datum_idx ON bonnen(organization_id, datum DESC);
CREATE INDEX IF NOT EXISTS bonnen_org_status_idx ON bonnen(organization_id, status);
CREATE INDEX IF NOT EXISTS bonnen_org_source_idx ON bonnen(organization_id, source);

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- DEEL 3/8 — 20260525132000 — Bucket private + storage policies
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

UPDATE storage.buckets SET public = false WHERE id = 'bonnen';

DROP POLICY IF EXISTS bonnen_public_read           ON storage.objects;
DROP POLICY IF EXISTS "Bonnen public read"         ON storage.objects;
DROP POLICY IF EXISTS "Anyone can read bonnen"     ON storage.objects;
DROP POLICY IF EXISTS "Public read access bonnen"  ON storage.objects;
DROP POLICY IF EXISTS bonnen_storage_select_own_org ON storage.objects;
DROP POLICY IF EXISTS bonnen_storage_insert_own_org ON storage.objects;
DROP POLICY IF EXISTS bonnen_storage_update_own_org ON storage.objects;
DROP POLICY IF EXISTS bonnen_storage_delete_own_org ON storage.objects;

CREATE POLICY bonnen_storage_select_own_org ON storage.objects
    FOR SELECT TO authenticated
    USING (
        bucket_id = 'bonnen'
        AND (storage.foldername(name))[1]::uuid IN (SELECT auth.user_org_ids())
    );

CREATE POLICY bonnen_storage_insert_own_org ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (
        bucket_id = 'bonnen'
        AND (storage.foldername(name))[1]::uuid IN (SELECT auth.user_org_ids())
    );

CREATE POLICY bonnen_storage_update_own_org ON storage.objects
    FOR UPDATE TO authenticated
    USING (
        bucket_id = 'bonnen'
        AND (storage.foldername(name))[1]::uuid IN (SELECT auth.user_org_ids())
    )
    WITH CHECK (
        bucket_id = 'bonnen'
        AND (storage.foldername(name))[1]::uuid IN (SELECT auth.user_org_ids())
    );

CREATE POLICY bonnen_storage_delete_own_org ON storage.objects
    FOR DELETE TO authenticated
    USING (
        bucket_id = 'bonnen'
        AND (storage.foldername(name))[1]::uuid IN (SELECT auth.user_org_ids())
    );

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- DEEL 4/8 — 20260525133000 — RLS lockdown met locked_at bescherming
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- Zorg dat RLS aan staat (was waarschijnlijk al via 001)
ALTER TABLE bonnen ENABLE ROW LEVEL SECURITY;

-- Drop ALLE bestaande policies — slate clean
DROP POLICY IF EXISTS "Allow all"           ON bonnen;
DROP POLICY IF EXISTS "Allow all access"    ON bonnen;
DROP POLICY IF EXISTS "org_select"          ON bonnen;
DROP POLICY IF EXISTS "org_insert"          ON bonnen;
DROP POLICY IF EXISTS "org_update"          ON bonnen;
DROP POLICY IF EXISTS "org_delete"          ON bonnen;

-- SELECT — eigen org
CREATE POLICY "org_select" ON bonnen
    FOR SELECT TO authenticated
    USING (organization_id IN (SELECT auth.user_org_ids()));

-- INSERT — eigen org
CREATE POLICY "org_insert" ON bonnen
    FOR INSERT TO authenticated
    WITH CHECK (organization_id IN (SELECT auth.user_org_ids()));

-- UPDATE — eigen org EN niet vergrendeld
CREATE POLICY "org_update" ON bonnen
    FOR UPDATE TO authenticated
    USING (
        organization_id IN (SELECT auth.user_org_ids())
        AND locked_at IS NULL
    )
    WITH CHECK (organization_id IN (SELECT auth.user_org_ids()));

-- DELETE — eigen org EN niet vergrendeld
CREATE POLICY "org_delete" ON bonnen
    FOR DELETE TO authenticated
    USING (
        organization_id IN (SELECT auth.user_org_ids())
        AND locked_at IS NULL
    );

-- Admin-only unlock helper
CREATE OR REPLACE FUNCTION unlock_bon(p_bon_id BIGINT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_bon_org UUID;
    v_user_role TEXT;
BEGIN
    SELECT organization_id INTO v_bon_org FROM bonnen WHERE id = p_bon_id;
    IF v_bon_org IS NULL THEN
        RAISE EXCEPTION 'Bon % not found', p_bon_id;
    END IF;

    SELECT role INTO v_user_role
    FROM organization_members
    WHERE organization_id = v_bon_org
      AND user_id = auth.uid()
      AND status = 'active';

    IF v_user_role IS DISTINCT FROM 'Admin' THEN
        RAISE EXCEPTION 'Alleen Admin kan een vergrendelde bon ontgrendelen';
    END IF;

    UPDATE bonnen
    SET locked_at = NULL, locked_by = NULL
    WHERE id = p_bon_id;

    RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION unlock_bon FROM PUBLIC;
GRANT EXECUTE ON FUNCTION unlock_bon TO authenticated;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- DEEL 5/8 — 20260525134000 — pg_trgm extension + trigram-indexes
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS bonnen_extracted_trgm_idx
    ON bonnen USING gin (extracted_text gin_trgm_ops);

CREATE INDEX IF NOT EXISTS bonnen_winkel_trgm_idx
    ON bonnen USING gin (winkel gin_trgm_ops);

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- DEEL 6/8 — 20260525135000 — bon_share_tokens (deellinks boekhouder)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE TABLE IF NOT EXISTS bon_share_tokens (
    id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    token TEXT NOT NULL UNIQUE,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    filter_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    recipient_name TEXT,
    recipient_email TEXT,
    label TEXT,
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ,
    access_count INTEGER NOT NULL DEFAULT 0,
    last_accessed_at TIMESTAMPTZ,
    last_accessed_ip INET,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS bon_share_tokens_token_idx ON bon_share_tokens(token);
CREATE INDEX IF NOT EXISTS bon_share_tokens_org_idx   ON bon_share_tokens(organization_id);
CREATE INDEX IF NOT EXISTS bon_share_tokens_active_idx
    ON bon_share_tokens(organization_id, expires_at)
    WHERE revoked_at IS NULL;

ALTER TABLE bon_share_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS share_tokens_select ON bon_share_tokens;
DROP POLICY IF EXISTS share_tokens_insert ON bon_share_tokens;
DROP POLICY IF EXISTS share_tokens_update ON bon_share_tokens;
DROP POLICY IF EXISTS share_tokens_delete ON bon_share_tokens;

CREATE POLICY share_tokens_select ON bon_share_tokens
    FOR SELECT TO authenticated
    USING (organization_id IN (SELECT auth.user_org_ids()));

CREATE POLICY share_tokens_insert ON bon_share_tokens
    FOR INSERT TO authenticated
    WITH CHECK (
        organization_id IN (SELECT auth.user_org_ids())
        AND created_by = auth.uid()
    );

CREATE POLICY share_tokens_update ON bon_share_tokens
    FOR UPDATE TO authenticated
    USING (organization_id IN (SELECT auth.user_org_ids()))
    WITH CHECK (organization_id IN (SELECT auth.user_org_ids()));

CREATE POLICY share_tokens_delete ON bon_share_tokens
    FOR DELETE TO authenticated
    USING (
        organization_id IN (SELECT auth.user_org_ids())
        AND access_count = 0
    );

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- DEEL 7/8 — 20260525136000 — audit_log extension voor bonnen
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

ALTER TABLE audit_log DROP CONSTRAINT IF EXISTS audit_log_record_table_check;
ALTER TABLE audit_log
    ADD CONSTRAINT audit_log_record_table_check
    CHECK (record_table IN ('gerechten', 'offertes', 'facturen', 'menu_templates', 'bonnen'));

ALTER TABLE audit_log DROP CONSTRAINT IF EXISTS audit_log_action_check;
ALTER TABLE audit_log
    ADD CONSTRAINT audit_log_action_check
    CHECK (action IN (
        'insert', 'update', 'delete',
        'ai_scan', 'extract_pdf', 'lock', 'unlock',
        'share_created', 'share_revoked', 'share_accessed',
        'bulk_export', 'moneybird_sync'
    ));

DROP TRIGGER IF EXISTS trg_audit_bonnen ON bonnen;
CREATE TRIGGER trg_audit_bonnen
    AFTER INSERT OR UPDATE OR DELETE ON bonnen
    FOR EACH ROW EXECUTE FUNCTION audit_log_changes();

CREATE OR REPLACE FUNCTION log_bon_action(
    p_bon_id BIGINT,
    p_action TEXT,
    p_detail TEXT DEFAULT NULL,
    p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_org_id UUID;
BEGIN
    SELECT organization_id INTO v_org_id FROM bonnen WHERE id = p_bon_id;
    IF v_org_id IS NULL AND p_bon_id <> 0 THEN
        RAISE EXCEPTION 'Bon % not found', p_bon_id;
    END IF;

    INSERT INTO audit_log (
        organization_id, record_table, record_id, action, user_id, changes, metadata
    )
    VALUES (
        v_org_id, 'bonnen', p_bon_id, p_action, auth.uid(),
        CASE WHEN p_detail IS NOT NULL THEN jsonb_build_object('detail', p_detail) ELSE '{}'::jsonb END,
        p_metadata
    );
END;
$$;

REVOKE ALL ON FUNCTION log_bon_action FROM PUBLIC;
GRANT EXECUTE ON FUNCTION log_bon_action TO authenticated, service_role;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- DEEL 8/8 — 20260525137000 — RPC's voor DAL
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE OR REPLACE FUNCTION search_bonnen_ranked(
    p_org_id UUID,
    p_query TEXT,
    p_status TEXT[] DEFAULT NULL,
    p_leverancier_ids INTEGER[] DEFAULT NULL,
    p_tags TEXT[] DEFAULT NULL,
    p_source TEXT[] DEFAULT NULL,
    p_rgs TEXT[] DEFAULT NULL,
    p_from DATE DEFAULT NULL,
    p_to DATE DEFAULT NULL,
    p_bedrag_min NUMERIC DEFAULT NULL,
    p_bedrag_max NUMERIC DEFAULT NULL,
    p_limit INTEGER DEFAULT 50,
    p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
    id BIGINT,
    organization_id UUID,
    leverancier_id INTEGER,
    leverancier_naam TEXT,
    winkel TEXT,
    datum DATE,
    totaal_bedrag NUMERIC,
    btw_laag_bedrag NUMERIC,
    btw_hoog_bedrag NUMERIC,
    netto_bedrag NUMERIC,
    status TEXT,
    source TEXT,
    categorie TEXT,
    rgs_code TEXT,
    rgs_category_label TEXT,
    tags TEXT[],
    notities TEXT,
    image_url TEXT,
    file_path TEXT,
    file_mime TEXT,
    locked_at TIMESTAMPTZ,
    locked_by UUID,
    extracted_text TEXT,
    bon_items JSONB,
    snippet TEXT,
    score REAL,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY INVOKER
STABLE
SET search_path = public
AS $$
DECLARE
    v_tsq tsquery;
BEGIN
    v_tsq := CASE
        WHEN p_query IS NULL OR length(trim(p_query)) = 0
        THEN NULL
        ELSE websearch_to_tsquery('dutch', p_query)
    END;

    RETURN QUERY
    SELECT
        b.id, b.organization_id, b.leverancier_id::INTEGER, l.naam AS leverancier_naam,
        b.winkel, b.datum, b.totaal_bedrag, b.btw_laag_bedrag, b.btw_hoog_bedrag, b.netto_bedrag,
        b.status, b.source, b.categorie, b.rgs_code, b.rgs_category_label, b.tags, b.notities,
        b.image_url, b.file_path, b.file_mime, b.locked_at, b.locked_by,
        b.extracted_text, b.bon_items,
        CASE
            WHEN v_tsq IS NULL OR b.extracted_text IS NULL THEN NULL
            ELSE ts_headline(
                'dutch',
                b.extracted_text,
                v_tsq,
                'StartSel=<mark>,StopSel=</mark>,MaxFragments=2,MinWords=3,MaxWords=14'
            )
        END AS snippet,
        CASE
            WHEN v_tsq IS NULL THEN 0::REAL
            ELSE (
                ts_rank(b.search_vec, v_tsq) * 0.7
                + COALESCE(similarity(b.extracted_text, p_query), 0) * 0.3
            )::REAL
        END AS score,
        b.created_at, b.updated_at
    FROM bonnen b
    LEFT JOIN leveranciers l ON l.id = b.leverancier_id
    WHERE b.organization_id = p_org_id
      AND (
          v_tsq IS NULL
          OR b.search_vec @@ v_tsq
          OR b.extracted_text % p_query
          OR b.winkel % p_query
      )
      AND (p_status IS NULL OR b.status = ANY(p_status))
      AND (p_leverancier_ids IS NULL OR b.leverancier_id = ANY(p_leverancier_ids))
      AND (p_tags IS NULL OR b.tags && p_tags)
      AND (p_source IS NULL OR b.source = ANY(p_source))
      AND (p_rgs IS NULL OR b.rgs_code = ANY(p_rgs))
      AND (p_from IS NULL OR b.datum >= p_from)
      AND (p_to IS NULL OR b.datum <= p_to)
      AND (p_bedrag_min IS NULL OR b.totaal_bedrag >= p_bedrag_min)
      AND (p_bedrag_max IS NULL OR b.totaal_bedrag <= p_bedrag_max)
    ORDER BY
        score DESC NULLS LAST,
        b.datum DESC NULLS LAST,
        b.id DESC
    LIMIT p_limit
    OFFSET p_offset;
END;
$$;

GRANT EXECUTE ON FUNCTION search_bonnen_ranked TO authenticated;

CREATE OR REPLACE FUNCTION leveranciers_with_bon_counts(p_org_id UUID)
RETURNS TABLE (id INTEGER, naam TEXT, count BIGINT, total NUMERIC)
LANGUAGE sql
SECURITY INVOKER
STABLE
SET search_path = public
AS $$
    SELECT
        l.id,
        l.naam,
        COUNT(b.id) AS count,
        COALESCE(SUM(b.totaal_bedrag), 0)::NUMERIC AS total
    FROM leveranciers l
    LEFT JOIN bonnen b ON b.leverancier_id = l.id AND b.organization_id = p_org_id
    WHERE l.organization_id = p_org_id
    GROUP BY l.id, l.naam
    HAVING COUNT(b.id) > 0
    ORDER BY count DESC, l.naam ASC;
$$;

GRANT EXECUTE ON FUNCTION leveranciers_with_bon_counts TO authenticated;

CREATE OR REPLACE FUNCTION distinct_bon_tags(p_org_id UUID)
RETURNS TABLE (tag TEXT, count BIGINT)
LANGUAGE sql
SECURITY INVOKER
STABLE
SET search_path = public
AS $$
    SELECT t.tag, COUNT(*) AS count
    FROM bonnen b, unnest(b.tags) AS t(tag)
    WHERE b.organization_id = p_org_id
      AND b.tags IS NOT NULL
    GROUP BY t.tag
    ORDER BY count DESC, t.tag ASC
    LIMIT 50;
$$;

GRANT EXECUTE ON FUNCTION distinct_bon_tags TO authenticated;

CREATE OR REPLACE FUNCTION distinct_bon_rgs(p_org_id UUID)
RETURNS TABLE (code TEXT, label TEXT, count BIGINT)
LANGUAGE sql
SECURITY INVOKER
STABLE
SET search_path = public
AS $$
    SELECT
        rgs_code AS code,
        MIN(rgs_category_label) AS label,
        COUNT(*) AS count
    FROM bonnen
    WHERE organization_id = p_org_id
      AND rgs_code IS NOT NULL
    GROUP BY rgs_code
    ORDER BY count DESC, rgs_code ASC;
$$;

GRANT EXECUTE ON FUNCTION distinct_bon_rgs TO authenticated;

CREATE OR REPLACE FUNCTION increment_share_access(p_token_id BIGINT)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    UPDATE bon_share_tokens
    SET access_count = access_count + 1,
        last_accessed_at = now()
    WHERE id = p_token_id;
$$;

GRANT EXECUTE ON FUNCTION increment_share_access TO service_role, anon, authenticated;

-- ════════════════════════════════════════════════════════════════════════
COMMIT;

-- ── POST-CHECK: alles aanwezig? ────────────────────────────────────────
DO $$
DECLARE
    v_kolommen INTEGER;
    v_policies INTEGER;
    v_functions INTEGER;
BEGIN
    SELECT COUNT(*) INTO v_kolommen
    FROM information_schema.columns
    WHERE table_schema='public' AND table_name='bonnen'
      AND column_name IN ('extracted_text', 'search_vec', 'tags', 'locked_at', 'source', 'file_path', 'updated_at');

    SELECT COUNT(*) INTO v_policies
    FROM pg_policies
    WHERE schemaname='public' AND tablename='bonnen';

    SELECT COUNT(*) INTO v_functions
    FROM pg_proc
    WHERE pronamespace=(SELECT oid FROM pg_namespace WHERE nspname='public')
      AND proname IN ('search_bonnen_ranked', 'leveranciers_with_bon_counts', 'distinct_bon_tags', 'distinct_bon_rgs', 'unlock_bon', 'log_bon_action', 'increment_share_access');

    RAISE NOTICE '✅ Migratie compleet:';
    RAISE NOTICE '   - % nieuwe kolommen op bonnen (verwacht 7)', v_kolommen;
    RAISE NOTICE '   - % RLS policies op bonnen (verwacht 4)', v_policies;
    RAISE NOTICE '   - % RPC functies (verwacht 7)', v_functions;

    IF v_kolommen < 7 OR v_policies < 4 OR v_functions < 7 THEN
        RAISE WARNING 'Niet alles is aangemaakt — check de errors hierboven';
    ELSE
        RAISE NOTICE '🎉 Bonnenkistje klaar voor gebruik. Reload /archief om te checken.';
    END IF;
END $$;
