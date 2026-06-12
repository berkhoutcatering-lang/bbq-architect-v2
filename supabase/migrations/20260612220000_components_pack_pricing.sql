-- =============================================================
--  Components: pak-prijs velden (grootverpakking → eenheidsprijs)
--
--  Sam/Mathijs koopt bij de slager/Hanos in grootverpakking
--  ("doos 5 kg brisket €62,50") maar de bibliotheek rekent in
--  eenheidsprijzen (per 100 g / per stuk). Tot nu toe moest de
--  terugrekensom uit het hoofd; de oorspronkelijke pak-prijs ging
--  verloren en was nergens te herzien.
--
--  Deze kolommen bewaren wat er daadwerkelijk betaald is. De app
--  rekent server/client-side via src/lib/unitPrice.ts terug naar
--  base_quantity/base_unit/base_cost_cents (de bestaande kostprijs-
--  canon waar gerecht_components op doorrekent).
-- =============================================================

ALTER TABLE components
    ADD COLUMN IF NOT EXISTS pack_price_cents INTEGER NULL
        CHECK (pack_price_cents IS NULL OR pack_price_cents >= 0),
    ADD COLUMN IF NOT EXISTS pack_quantity NUMERIC(10,3) NULL
        CHECK (pack_quantity IS NULL OR pack_quantity > 0),
    ADD COLUMN IF NOT EXISTS pack_unit TEXT NULL
        CHECK (pack_unit IS NULL OR pack_unit IN ('g', 'kg', 'ml', 'liter', 'stuk', 'portie'));

COMMENT ON COLUMN components.pack_price_cents IS
    'Wat de cateraar betaalde voor één verpakking bij de leverancier (cents). '
    'Bron-administratie; base_cost_cents blijft de reken-canon voor gerechten.';
COMMENT ON COLUMN components.pack_quantity IS
    'Inhoud van die verpakking (bv. 5 bij "doos 5 kg", 12 bij "12 stuks").';
COMMENT ON COLUMN components.pack_unit IS
    'Eenheid van pack_quantity: g/kg/ml/liter/stuk/portie.';

-- Geen nieuwe index/RLS nodig: components heeft al org-scoped RLS en
-- deze kolommen worden nooit als filter in policies gebruikt.
