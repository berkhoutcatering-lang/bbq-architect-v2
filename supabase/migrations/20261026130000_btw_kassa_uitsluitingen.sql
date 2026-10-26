-- ─────────────────────────────────────────────────────────────────────────
-- btw_kassa_uitsluitingen — een kassadag bewust NIET meetellen in de aangifte.
--
-- De kassaverkoop telt mee in rubriek 1a/1b. Tussen de echte verkoop zitten
-- soms testbestellingen (bv. € 1,00 om de pin te proberen). Die worden niet
-- automatisch weggefilterd — dat zou een verzonnen regel zijn. In het
-- aangiftescherm zie je elke kassadag, en kies je zelf: "telt niet mee".
-- Die keuze staat hier, per organisatie per dag.
--
-- De app werkt ook zonder deze tabel (dan telt elke kassadag mee en is de
-- knop uitgeschakeld).
--
-- RLS-patroon spiegelt maand_afsluitingen (user_org_ids()); org_id expliciet
-- bij insert.
--
-- Draaien:  npx supabase db query --linked -f supabase/migrations/20261026130000_btw_kassa_uitsluitingen.sql
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS btw_kassa_uitsluitingen (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id  UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    datum            DATE NOT NULL,
    reden            TEXT,
    uitgesloten_by   UUID DEFAULT auth.uid(),
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE btw_kassa_uitsluitingen IS
    'Kassadagen die bewust niet meetellen in de BTW-aangifte (bv. testbestellingen). Gekozen in het aangiftescherm.';

CREATE UNIQUE INDEX IF NOT EXISTS btw_kassa_uitsluitingen_dag_unique
    ON btw_kassa_uitsluitingen (organization_id, datum);

ALTER TABLE btw_kassa_uitsluitingen ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS btw_kassa_uitsluitingen_select ON btw_kassa_uitsluitingen;
CREATE POLICY btw_kassa_uitsluitingen_select ON btw_kassa_uitsluitingen
    FOR SELECT USING (organization_id IN (SELECT public.user_org_ids()));

DROP POLICY IF EXISTS btw_kassa_uitsluitingen_insert ON btw_kassa_uitsluitingen;
CREATE POLICY btw_kassa_uitsluitingen_insert ON btw_kassa_uitsluitingen
    FOR INSERT WITH CHECK (organization_id IN (SELECT public.user_org_ids()));

DROP POLICY IF EXISTS btw_kassa_uitsluitingen_delete ON btw_kassa_uitsluitingen;
CREATE POLICY btw_kassa_uitsluitingen_delete ON btw_kassa_uitsluitingen
    FOR DELETE USING (organization_id IN (SELECT public.user_org_ids()));

-- Controle: moet één rij geven.
SELECT to_regclass('public.btw_kassa_uitsluitingen') AS tabel;
