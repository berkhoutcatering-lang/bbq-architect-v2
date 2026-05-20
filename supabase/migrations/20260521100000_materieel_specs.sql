-- /materieel uitgebreid: foto's + AI-gescrapte specs van product-URL.
-- Sam: "voeg fotos toe en functie van hey laat ai zien wat het is zoals een
-- website met afmetingen, functies, specs fotos en de ai maakt er dan een
-- top materieel lijstje van".
--
-- Toegevoegd:
--   - foto_urls TEXT[]: één primaire + meerdere supporting fotos
--   - product_url TEXT: link naar productpagina van leverancier
--   - specs JSONB: gestructureerde specs (merk, model, afmetingen, gewicht,
--     vermogen, prijs, specs_bullets[]) gegenereerd door AI uit URL+image

ALTER TABLE materieel
    ADD COLUMN IF NOT EXISTS foto_urls TEXT[] DEFAULT ARRAY[]::TEXT[];

ALTER TABLE materieel
    ADD COLUMN IF NOT EXISTS product_url TEXT;

ALTER TABLE materieel
    ADD COLUMN IF NOT EXISTS specs JSONB DEFAULT '{}'::JSONB;

ALTER TABLE materieel
    ADD COLUMN IF NOT EXISTS specs_fetched_at TIMESTAMPTZ;

-- Indexen — primaire toegang is per org, dat zit al via RLS-policy.
-- Specs zelf indexeren we niet (zelden filtered, alleen full read per item).
