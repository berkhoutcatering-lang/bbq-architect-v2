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
--  Een kolom met een standaardwaarde: bestaande rijen krijgen 5, er verandert
--  niets aan bestellen of betalen. Wie de grens wijzigt, verandert wat de
--  website toont ("ruim" of "nog n"); daarom gaat de voorraadversie dan ook
--  omhoog (zelfde deferred trigger als in 20261005130000).


-- ── 0. Pre-flight ───────────────────────────────────────────────────────────
DO $$
BEGIN
    IF to_regclass('public.winkel_instellingen') IS NULL THEN
        RAISE EXCEPTION 'winkel_beschikbaar_grens: winkel_instellingen ontbreekt (migratie 20260913120000_winkel_kassa)';
    END IF;
    IF to_regprocedure('public.winkel_vrij_artikelen(uuid)') IS NULL THEN
        RAISE EXCEPTION 'winkel_beschikbaar_grens: winkel_vrij_artikelen ontbreekt (migratie 20261005130000_winkel_vrij)';
    END IF;
    IF to_regprocedure('private.winkel_voorraad_versie_omhoog()') IS NULL THEN
        RAISE EXCEPTION 'winkel_beschikbaar_grens: private.winkel_voorraad_versie_omhoog ontbreekt (migratie 20261005130000_winkel_vrij)';
    END IF;
END $$;


-- ── 1. De grens ─────────────────────────────────────────────────────────────
ALTER TABLE public.winkel_instellingen
    ADD COLUMN IF NOT EXISTS beschikbaar_grens INTEGER NOT NULL DEFAULT 5
        CONSTRAINT winkel_instellingen_beschikbaar_grens_check CHECK (beschikbaar_grens BETWEEN 0 AND 999);
COMMENT ON COLUMN public.winkel_instellingen.beschikbaar_grens IS
    'Tot en met dit aantal vrij zegt de website "Nog n" en de Toonbank "nog n"; daarboven "ruim". 0 = nooit een getal tonen. Standaard 5.';


-- ── 2. Versie omhoog bij een andere grens ───────────────────────────────────
DROP TRIGGER IF EXISTS trg_winkel_vv_grens ON public.winkel_instellingen;
CREATE CONSTRAINT TRIGGER trg_winkel_vv_grens
    AFTER UPDATE OF beschikbaar_grens ON public.winkel_instellingen
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW
    WHEN (OLD.beschikbaar_grens IS DISTINCT FROM NEW.beschikbaar_grens)
    EXECUTE FUNCTION private.winkel_voorraad_versie_omhoog();


-- ── 3. Zelfcontrole ─────────────────────────────────────────────────────────
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger t
                    WHERE t.tgname = 'trg_winkel_vv_grens'
                      AND t.tgrelid = 'public.winkel_instellingen'::REGCLASS
                      AND t.tgconstraint <> 0 AND t.tgdeferrable AND t.tginitdeferred
                      AND t.tgfoid = 'private.winkel_voorraad_versie_omhoog()'::REGPROCEDURE) THEN
        RAISE EXCEPTION 'winkel_beschikbaar_grens: zelfcontrole mislukt, trg_winkel_vv_grens ontbreekt';
    END IF;
END $$;
