-- ════════════════════════════════════════════════════════════════════════════
--  Een bestelling voor alleen één vakje — "Bestel alleen dit"
--  Plan: docs/webshop-beheer-bouwplan.md §2.5 en §4.5 (golf 3)
-- ════════════════════════════════════════════════════════════════════════════
--
--  Een concept-bestelling kan bij een webshop-vakje horen: dan telt hij alleen
--  de vraag van dat vakje. `vakje` is de sleutel zoals het scherm hem kent
--  ('moment:<uuid>' voor een afhaalmoment/-dag, 'dag:2026-09-25' voor de vaste
--  bak) en `vakje_label` de tekst voor op de lijst en in "Onderweg". Leeg =
--  de gewone lopende bestelling.
--
--  De unieke index op (organisatie, leverancier, venster-start) krijgt het
--  vakje erbij, zodat een gewone bestelling en een vakje-bestelling bij
--  dezelfde leverancier naast elkaar kunnen bestaan.

DO $$
BEGIN
    IF to_regclass('public.concept_inkoop_orders') IS NULL THEN
        RAISE EXCEPTION 'concept_inkoop_orders_vakje: tabel concept_inkoop_orders ontbreekt';
    END IF;
END $$;

ALTER TABLE public.concept_inkoop_orders
    ADD COLUMN IF NOT EXISTS vakje        TEXT,
    ADD COLUMN IF NOT EXISTS vakje_label  TEXT;

COMMENT ON COLUMN public.concept_inkoop_orders.vakje IS
    'Webshop-vakje waar deze bestelling alleen voor is (moment:<uuid> of dag:<datum>). NULL = de gewone lopende bestelling.';

DROP INDEX IF EXISTS public.ux_concept_inkoop_orders_active;
CREATE UNIQUE INDEX IF NOT EXISTS ux_concept_inkoop_orders_active
    ON public.concept_inkoop_orders (organization_id, leverancier_id, window_start, COALESCE(vakje, ''))
    WHERE status = 'concept' AND leverancier_id IS NOT NULL;
