-- ════════════════════════════════════════════════════════════════════════════
--  Winkel bestelt zichzelf bij — minimum, aanvullen tot, besteleenheid, kassa
--  Plan: docs/voorraad-bouwplan.md "Winkel bestellen"
-- ════════════════════════════════════════════════════════════════════════════
--
--  Net als de keuken (min_stock + par_level):
--    drempel             = minimum: eronder = "tijd om bij te bestellen"
--    par_niveau          = aanvullen tot
--    bestel_hoeveelheid  = de besteleenheid in voorraad-eenheden (krat = 24)
--    bestel_eenheid_naam = hoe die heet ("krat", "wiel", "doos")
--    bestel_prijs_cents  = inkoop excl. btw per besteleenheid
--  Een winkelregel op de bestellijst krijgt winkel_product_id op
--  inkoop_order_lines; bij ontvangst gaat die regel naar de winkel.
--  De kassa meldt verkopen met een sleutel per organisatie (kassa_sleutel).

ALTER TABLE public.winkel_producten
    ADD COLUMN IF NOT EXISTS par_niveau          NUMERIC CHECK (par_niveau IS NULL OR par_niveau >= 0),
    ADD COLUMN IF NOT EXISTS bestel_eenheid_naam TEXT,
    ADD COLUMN IF NOT EXISTS bestel_prijs_cents  INTEGER CHECK (bestel_prijs_cents IS NULL OR bestel_prijs_cents >= 0);
COMMENT ON COLUMN public.winkel_producten.par_niveau IS
    'Aanvullen tot (par level). Onder het minimum (drempel) komt op de bestellijst: par_niveau − (beschikbaar + onderweg), omhoog afgerond op bestel_hoeveelheid.';
COMMENT ON COLUMN public.winkel_producten.bestel_hoeveelheid IS
    'Besteleenheid in voorraad-eenheden: krat = 24, wiel kaas = 4000 (gram). Er wordt altijd in hele besteleenheden besteld.';

ALTER TABLE public.inkoop_order_lines
    ADD COLUMN IF NOT EXISTS winkel_product_id UUID REFERENCES public.winkel_producten(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_iol_winkel_product ON public.inkoop_order_lines (winkel_product_id) WHERE winkel_product_id IS NOT NULL;
COMMENT ON COLUMN public.inkoop_order_lines.winkel_product_id IS
    'Gezet = winkelregel: bij ontvangst naar de winkelvoorraad (winkel_muteer_voorraad, ontvangst). Anders keuken (inventory_id).';

ALTER TABLE public.winkel_instellingen
    ADD COLUMN IF NOT EXISTS kassa_sleutel TEXT;
COMMENT ON COLUMN public.winkel_instellingen.kassa_sleutel IS
    'Geheime sleutel waarmee de winkelkassa verkopen meldt (POST /api/kassa/{slug}/verkoop, header Authorization: Bearer). Leeg = kassakoppeling uit.';
