-- /archief = doorzoekbaar boekhoud-bonnenkistje. Sam wil zoeken op woord ("baktotaal"),
-- filteren op leverancier/datum/categorie, en alle gescande bonnen op één plek terugvinden.
--
-- bonnen-tabel bestaat al sinds migration 004 (supplier_invoices). We voegen toe:
--   - tags JSONB[] zodat user vrije labels kan zetten
--   - search_vec tsvector (gegenereerd) voor full-text-zoek
--   - GIN-index op search_vec voor sub-100ms search
--   - secondary indexes op datum + leverancier_id + status (filters)
--
-- NB: bonnen-tabel heeft RLS "Allow all" (pre-existing). Dat is een aparte
-- security-issue die in een eigen migration moet (multi-tenant lockdown via
-- organization_id). Niet hier — out of scope voor /archief redesign.

-- 1. Tags-kolom — vrije labels per bon ("event-bruiloft-juni", "baktotaal", "investering")
ALTER TABLE bonnen
    ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT ARRAY[]::TEXT[];

-- 2. Leverancier-FK — koppeling aan bestaande leveranciers-tabel.
--    Was tot nu toe alleen text-veld 'winkel'. Voor filter op leverancier moeten
--    we een echte FK hebben. Nullable: oude rijen hebben geen leverancier_id.
ALTER TABLE bonnen
    ADD COLUMN IF NOT EXISTS leverancier_id BIGINT
    REFERENCES leveranciers(id) ON DELETE SET NULL;

-- 3. Extracted-text kolom — voor full-text search. We slaan een platte tekst-
--    versie van de raw_analysis op (per regel: naam, prijs, totaal). Wordt
--    door de scanner-server-action gevuld bij insert/update.
ALTER TABLE bonnen
    ADD COLUMN IF NOT EXISTS extracted_text TEXT;

-- 4. Search vector — Dutch text-search, samengevoegd uit alle searchable velden.
--    Generated column → automatic update bij elke insert/update, geen trigger nodig.
--
--    Postgres 15+ vereist een IMMUTABLE expression voor STORED generated columns.
--    `to_tsvector('dutch', ...)` wordt als STABLE gezien (impliciete regconfig-cast),
--    dus we wrappen in een eigen IMMUTABLE function met expliciete `::regconfig`-cast.

CREATE OR REPLACE FUNCTION bonnen_compute_search_vec(
    p_winkel TEXT,
    p_categorie TEXT,
    p_notities TEXT,
    p_tags TEXT[],
    p_extracted_text TEXT
)
RETURNS tsvector
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
    SELECT
        setweight(to_tsvector('dutch'::regconfig,
            coalesce(p_winkel, '') || ' ' || coalesce(p_categorie, '')
        ), 'A') ||
        setweight(to_tsvector('dutch'::regconfig,
            coalesce(p_notities, '') || ' ' || coalesce(array_to_string(p_tags, ' '), '')
        ), 'B') ||
        setweight(to_tsvector('dutch'::regconfig,
            coalesce(p_extracted_text, '')
        ), 'C')
$$;

ALTER TABLE bonnen
    ADD COLUMN IF NOT EXISTS search_vec tsvector
    GENERATED ALWAYS AS (
        bonnen_compute_search_vec(winkel, categorie, notities, tags, extracted_text)
    ) STORED;

-- 5. Indexes voor sub-100ms zoek + filter
CREATE INDEX IF NOT EXISTS bonnen_search_idx ON bonnen USING gin(search_vec);
CREATE INDEX IF NOT EXISTS bonnen_datum_idx ON bonnen (datum DESC);
CREATE INDEX IF NOT EXISTS bonnen_leverancier_idx ON bonnen (leverancier_id);
CREATE INDEX IF NOT EXISTS bonnen_status_idx ON bonnen (status);
CREATE INDEX IF NOT EXISTS bonnen_tags_idx ON bonnen USING gin(tags);

-- 6. Backfill: voor oude rows zonder extracted_text proberen we het uit
--    raw_analysis te halen. Eén-shot best-effort — niet-fataal als shape afwijkt.
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
