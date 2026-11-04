-- Winkel: een product zelf op de bestellijst zetten, in de eenheid van de
-- voorraad. Leeg = alleen de automatische regel (onder het minimum). Gaat weer
-- op leeg zodra de bestelling de deur uit is.
ALTER TABLE public.winkel_producten
    ADD COLUMN IF NOT EXISTS bestel_handmatig numeric
    CHECK (bestel_handmatig IS NULL OR bestel_handmatig > 0);
