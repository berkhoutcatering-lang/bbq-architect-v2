-- ════════════════════════════════════════════════════════════════════════════
--  klaar_op vullen bij het inschrijven van een regel
--  Plan: docs/webshop-beheer-bouwplan.md §2.2
-- ════════════════════════════════════════════════════════════════════════════
--
--  winkel_plaats_order (migratie 20260913) schrijft de regels en kent de
--  kolom klaar_op niet. Zonder dit zou elke nieuwe order op de NOT NULL
--  stuklopen. Dezelfde regel als de backfill: het moment op de regel, anders
--  het moment van de order, anders vandaag (Europe/Amsterdam). De plaatsing
--  zet hem daarna nog eens — dat geeft dezelfde uitkomst.

CREATE OR REPLACE FUNCTION public.winkel_regel_klaar_op()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.klaar_op IS NULL THEN
        NEW.klaar_op := COALESCE(
            (SELECT m.datum FROM public.winkel_momenten m WHERE m.id = NEW.moment_id),
            (SELECT m.datum FROM public.winkel_orders o JOIN public.winkel_momenten m ON m.id = o.moment_id WHERE o.id = NEW.order_id),
            (now() AT TIME ZONE 'Europe/Amsterdam')::date
        );
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_winkel_order_regels_klaar_op ON public.winkel_order_regels;
CREATE TRIGGER trg_winkel_order_regels_klaar_op
    BEFORE INSERT ON public.winkel_order_regels
    FOR EACH ROW EXECUTE FUNCTION public.winkel_regel_klaar_op();
