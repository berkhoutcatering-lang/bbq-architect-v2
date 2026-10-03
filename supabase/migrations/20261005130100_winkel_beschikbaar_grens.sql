-- ════════════════════════════════════════════════════════════════════════════
--  BA-5b — de grens voor "nog n" op de website en de Toonbank-pil
--  Plan v5, M1 · Route: GET /api/public-winkel/{slug}/beschikbaarheid
--  Contract: hopbites-toonbank/docs/datacontract-toonbank-v1.md §1.9
-- ════════════════════════════════════════════════════════════════════════════
--
--  Tot en met deze grens zegt de website "Nog n"; daarboven "ruim" (zonder
--  getal). De Toonbank gebruikt dezelfde grens voor de pil "nog n"
--  (GET status → instellingen.beschikbaar_grens). Standaard 5, zoals de
--  kassapil uit prototype v4.
--
--  Alleen een kolom met een standaardwaarde: bestaande rijen krijgen 5, er
--  verandert niets aan bestellen of betalen.


-- ── 0. Pre-flight ───────────────────────────────────────────────────────────
DO $$
BEGIN
    IF to_regclass('public.winkel_instellingen') IS NULL THEN
        RAISE EXCEPTION 'winkel_beschikbaar_grens: winkel_instellingen ontbreekt (migratie 20260913120000_winkel_kassa)';
    END IF;
    IF to_regprocedure('public.winkel_vrij_artikelen(uuid)') IS NULL THEN
        RAISE EXCEPTION 'winkel_beschikbaar_grens: winkel_vrij_artikelen ontbreekt (migratie 20261005130000_winkel_vrij)';
    END IF;
END $$;


-- ── 1. De grens ─────────────────────────────────────────────────────────────
ALTER TABLE public.winkel_instellingen
    ADD COLUMN IF NOT EXISTS beschikbaar_grens INTEGER NOT NULL DEFAULT 5
        CONSTRAINT winkel_instellingen_beschikbaar_grens_check CHECK (beschikbaar_grens BETWEEN 0 AND 999);
COMMENT ON COLUMN public.winkel_instellingen.beschikbaar_grens IS
    'Tot en met dit aantal vrij zegt de website "Nog n" en de Toonbank "nog n"; daarboven "ruim". 0 = nooit een getal tonen. Standaard 5.';
