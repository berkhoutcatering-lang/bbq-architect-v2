-- ════════════════════════════════════════════════════════════════════════════
--  Bestelling invoeren: een bestelling per mail of telefoon zelf in de app zetten
--  Ontwerp: docs/superpowers/specs/2026-11-09-bestelling-invoeren-design.md
-- ════════════════════════════════════════════════════════════════════════════
--
--  Een zelf ingevoerde bestelling is een gewone winkel-order: zelfde vakjes,
--  zelfde agenda, zelfde afhaallijst van de kassa. Wat er bij komt:
--
--    1. winkel_orders.bron — waar de bestelling vandaan kwam. Leeg = de website
--       (alle bestaande orders); mail, telefoon, balie, anders = zelf ingevoerd.
--    2. winkel_order_regels.prijs_volgt — een regel op maat zonder prijs. Telt
--       niet mee in het totaal tot de prijs er is.
--    3. winkel_order_regels.toelichting — wat er bij een regel op maat hoort
--       ("vlees in ovenschaaltjes", "drie gangen, verrassing").
--
--  Alles additief. Bestaande orders veranderen niet.
--  Toepassen: npx supabase db query --linked -f <dit bestand> (nooit db push).

ALTER TABLE public.winkel_orders
    ADD COLUMN IF NOT EXISTS bron TEXT
        CONSTRAINT winkel_orders_bron_check CHECK (bron IS NULL OR bron IN ('website', 'mail', 'telefoon', 'balie', 'anders')),
    ADD COLUMN IF NOT EXISTS ingevoerd_door UUID REFERENCES auth.users(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.winkel_orders.bron IS
    'Waar de bestelling vandaan kwam. NULL of website = via de website; mail, telefoon, balie, anders = zelf ingevoerd in BBQ Architect (Verkoop → Webshop → Bestelling invoeren). Er gaat nooit vanzelf een mail naar de klant.';
COMMENT ON COLUMN public.winkel_orders.ingevoerd_door IS
    'Wie de bestelling zelf heeft ingevoerd. Leeg bij websitebestellingen.';

ALTER TABLE public.winkel_order_regels
    ADD COLUMN IF NOT EXISTS prijs_volgt BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS toelichting TEXT
        CONSTRAINT winkel_order_regels_toelichting_check CHECK (toelichting IS NULL OR length(toelichting) <= 2000);

COMMENT ON COLUMN public.winkel_order_regels.prijs_volgt IS
    'Regel op maat zonder afgesproken prijs: stuk_cents en bedrag_cents staan op 0 en tellen niet mee. Prijs invullen rekent de order opnieuw uit.';
COMMENT ON COLUMN public.winkel_order_regels.toelichting IS
    'Wat er bij deze regel hoort, in de woorden van wie hem invoerde. Komt in de agenda en de vakjes.';

-- Het weekseintje op Vandaag zoekt zelf ingevoerde orders per afhaaldag.
CREATE INDEX IF NOT EXISTS winkel_orders_bron_idx
    ON public.winkel_orders (organization_id) WHERE bron IS NOT NULL AND bron <> 'website';
