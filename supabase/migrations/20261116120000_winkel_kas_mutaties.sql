-- ─────────────────────────────────────────────────────────────────────────
-- winkel_kas_mutaties — geld dat je zelf uit of in de kassala doet.
--
-- De Toonbank kent alleen verkoop, tellen en afromen. Een boodschap die je
-- contant uit de la betaalt staat nergens; bij het tellen wordt dat een
-- kasverschil. Met een regel hier verklaart Boekhouding winkel dat verschil.
-- De app werkt ook zonder deze tabel (dan toont het kasboek alleen kassaregels
-- en is de knop "Geld uit of in de la" uitgeschakeld).
--
-- RLS-patroon zoals de Toonbank-tabellen: private.user_org_ids(), in een
-- subselect zodat hij één keer per query draait. organization_id gaat altijd
-- expliciet mee bij insert.
--
-- De tabel bewaakt zelf wat de app ook bewaakt, voor wie de app omzeilt:
--   - een regel staat altijd op naam van wie hem invoert (created_by);
--   - in een afgesloten maand (maand_afsluitingen) komt er niets bij en gaat
--     er niets weg;
--   - een bedrag boven € 100.000 is een tikfout en wordt geweigerd.
--
-- Draaien: npx supabase db query --linked -f supabase/migrations/20261116120000_winkel_kas_mutaties.sql
-- ─────────────────────────────────────────────────────────────────────────

-- Vooraf: de maandafsluiting moet er zijn, anders is het maandslot hieronder leeg.
DO $$
BEGIN
    IF to_regclass('public.maand_afsluitingen') IS NULL THEN
        RAISE EXCEPTION 'public.maand_afsluitingen ontbreekt: draai eerst 20260701160000_maand_afsluitingen.sql';
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.winkel_kas_mutaties (
    id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id  UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
    datum            DATE        NOT NULL,
    -- Negatief = uit de la, positief = in de la.
    -- De grens van € 100.000 is dezelfde als KAS_MAX_CENTS in src/lib/winkelboek/kasInvoer.ts.
    bedrag_cents     INTEGER     NOT NULL CHECK (bedrag_cents <> 0 AND bedrag_cents BETWEEN -10000000 AND 10000000),
    reden            TEXT        NOT NULL CHECK (reden IN ('uitgave', 'prive', 'wisselgeld', 'overig')),
    omschrijving     TEXT        NOT NULL CHECK (length(btrim(omschrijving)) BETWEEN 2 AND 200),
    -- 'tijdens' = tussen openen en tellen; 'voor_openen' = vóór de eerste telling van die dag.
    moment           TEXT        NOT NULL DEFAULT 'tijdens' CHECK (moment IN ('voor_openen', 'tijdens')),
    created_by       UUID        DEFAULT auth.uid(),
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.winkel_kas_mutaties IS
    'Geld dat de ondernemer zelf uit of in de kassala doet (uitgave, privé, wisselgeld). Verklaart een kasverschil of een verschil tussen de dagen in Boekhouding winkel. 7 jaar bewaren.';
COMMENT ON COLUMN public.winkel_kas_mutaties.moment IS
    'tijdens = de kassa was open (verklaart het kasverschil van die dag); voor_openen = vóór de eerste telling van die dag (verklaart een verschil tussen de dagen).';

CREATE INDEX IF NOT EXISTS winkel_kas_mutaties_dag_idx ON public.winkel_kas_mutaties (organization_id, datum);

-- Is de boekhoudmaand van deze datum nog open? SECURITY DEFINER zodat het
-- antwoord niet afhangt van wat de gebruiker zelf in maand_afsluitingen mag
-- lezen; het schema private is niet via de API aan te roepen.
CREATE OR REPLACE FUNCTION private.winkel_kas_maand_open(p_org UUID, p_datum DATE)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT NOT EXISTS (
        SELECT 1 FROM public.maand_afsluitingen a
        WHERE a.organization_id = p_org
          AND a.jaar = EXTRACT(YEAR FROM p_datum)::int
          AND a.maand = EXTRACT(MONTH FROM p_datum)::int
    );
$$;
REVOKE ALL ON FUNCTION private.winkel_kas_maand_open(UUID, DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.winkel_kas_maand_open(UUID, DATE) TO authenticated, service_role;

ALTER TABLE public.winkel_kas_mutaties ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS winkel_kas_mutaties_select ON public.winkel_kas_mutaties;
CREATE POLICY winkel_kas_mutaties_select ON public.winkel_kas_mutaties FOR SELECT TO authenticated
    USING (organization_id IN (SELECT private.user_org_ids()));
DROP POLICY IF EXISTS winkel_kas_mutaties_insert ON public.winkel_kas_mutaties;
CREATE POLICY winkel_kas_mutaties_insert ON public.winkel_kas_mutaties FOR INSERT TO authenticated
    WITH CHECK (
        organization_id IN (SELECT private.user_org_ids())
        AND created_by = (SELECT auth.uid())
        AND private.winkel_kas_maand_open(organization_id, datum)
    );
DROP POLICY IF EXISTS winkel_kas_mutaties_delete ON public.winkel_kas_mutaties;
CREATE POLICY winkel_kas_mutaties_delete ON public.winkel_kas_mutaties FOR DELETE TO authenticated
    USING (
        organization_id IN (SELECT private.user_org_ids())
        AND private.winkel_kas_maand_open(organization_id, datum)
    );

REVOKE ALL ON TABLE public.winkel_kas_mutaties FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, DELETE ON TABLE public.winkel_kas_mutaties TO authenticated;
GRANT SELECT, INSERT, DELETE ON TABLE public.winkel_kas_mutaties TO service_role;

-- Controle: moet één rij geven.
SELECT to_regclass('public.winkel_kas_mutaties') AS tabel;
