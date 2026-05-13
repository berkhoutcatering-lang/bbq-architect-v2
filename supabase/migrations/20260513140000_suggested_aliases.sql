-- ════════════════════════════════════════════════════════════════════════════
--  AI-suggested aliases — overkoepelende namen per product-regel
--
--  Pillar #3 (uit pricelist-feature): alias-learning per tenant — uitbreiding
--  Pillar #4: 1 product = N gangbare namen (slager-jargon, EN/NL synoniemen)
--
--  Na PDF-extractie roept de processor 1× Haiku 4.5 aan voor alle nieuwe regels;
--  AI suggereert 3-5 synoniemen per product (alleen geijkte cut-namen, geen
--  verzinnen). User accepteert/verwijdert in review-sheet; bij approve gaan
--  de toggled aliassen naar org_product_aliases.
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE org_price_mutations
    ADD COLUMN IF NOT EXISTS suggested_aliases JSONB;

COMMENT ON COLUMN org_price_mutations.suggested_aliases IS
    'Door Haiku 4.5 voorgestelde overkoepelende namen (3-5 synoniemen per product). User accept/reject in review-sheet; bij approve naar org_product_aliases met source=ai_suggested.';

-- Geen index — kolom is alleen voor UI-rendering, niet gequeried.
