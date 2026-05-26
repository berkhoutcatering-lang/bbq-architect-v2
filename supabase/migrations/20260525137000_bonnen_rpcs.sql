-- ════════════════════════════════════════════════════════════════════════
-- P0.1/P0.7/P0.9 — RPC's voor de Bonnenkistje DAL.
--
-- Combineert tsvector (search_vec) + pg_trgm (similarity) tot één rank-query
-- met ts_headline-snippets voor UI. Deze RPC is de "hot path" voor het
-- Bonnenkistje — alles wat de zoekbalk doet komt hier langs.
--
-- Plus hulp-RPCs voor filter-sidebar (leveranciers met counts, distinct
-- tags, distinct RGS), share-token access counter, en move-inbox-to-archive.
-- ════════════════════════════════════════════════════════════════════════

-- ── search_bonnen_ranked ──────────────────────────────────────────────
-- Pillar #1 + #2: combineert exact-match (search_vec) en fuzzy (pg_trgm)
-- met ts_headline-snippet voor UI <mark>-rendering.

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
SECURITY INVOKER    -- respecteer RLS van caller (auth.uid bewaard)
STABLE
SET search_path = public
AS $$
DECLARE
    v_tsq tsquery;
BEGIN
    -- websearch_to_tsquery accepteert user-input safely (geen tsquery-syntax
    -- escape nodig). NULL voor lege query.
    v_tsq := CASE
        WHEN p_query IS NULL OR length(trim(p_query)) = 0
        THEN NULL
        ELSE websearch_to_tsquery('dutch', p_query)
    END;

    RETURN QUERY
    SELECT
        b.id, b.organization_id, b.leverancier_id, l.naam AS leverancier_naam,
        b.winkel, b.datum, b.totaal_bedrag, b.btw_laag_bedrag, b.btw_hoog_bedrag, b.netto_bedrag,
        b.status, b.source, b.categorie, b.rgs_code, b.rgs_category_label, b.tags, b.notities,
        b.image_url, b.file_path, b.file_mime, b.locked_at, b.locked_by,
        b.extracted_text, b.bon_items,
        /* Snippet voor zoekresultaat-row. ts_headline produceert <mark>-tags
           rondom matchende termen. Voor lege query: NULL (geen snippet nodig). */
        CASE
            WHEN v_tsq IS NULL OR b.extracted_text IS NULL THEN NULL
            ELSE ts_headline(
                'dutch',
                b.extracted_text,
                v_tsq,
                'StartSel=<mark>,StopSel=</mark>,MaxFragments=2,MinWords=3,MaxWords=14'
            )
        END AS snippet,
        /* Score: ts_rank voor exact-match (70%) + similarity voor fuzzy (30%). */
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

-- ── leveranciers_with_bon_counts ──────────────────────────────────────
-- Voor de filter-sidebar (Sligro 6 · Hanos 5 · ...).

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

-- ── distinct_bon_tags ─────────────────────────────────────────────────
-- Voor tag-filter chips. Returnt unieke tags + frequentie.

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

-- ── distinct_bon_rgs ──────────────────────────────────────────────────

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

-- ── increment_share_access ────────────────────────────────────────────
-- Atomische increment om lost-update race te vermijden.

CREATE OR REPLACE FUNCTION increment_share_access(p_token_id BIGINT)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER   -- moet werken vanuit service-role op publieke route
SET search_path = public
AS $$
    UPDATE bon_share_tokens
    SET access_count = access_count + 1,
        last_accessed_at = now()
    WHERE id = p_token_id;
$$;

GRANT EXECUTE ON FUNCTION increment_share_access TO service_role, anon, authenticated;
