-- ─────────────────────────────────────────────────────────────────────────
-- maand_afsluitingen — een maand "op slot" zetten in de boekhouding.
--
-- Afsluiten = de bonnen + facturen van die maand vergrendelen (locked_at) zodat
-- ze niet meer wijzigen, en de afsluiting registreren. Het kwartaal-BTW-vastzetten
-- gebeurt apart via btw_aangiftes. Heropenen kan zolang het kwartaal nog niet
-- is vastgezet.
--
-- RLS-patroon spiegelt btw_aangiftes (user_org_ids()); org_id expliciet bij insert.
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS maand_afsluitingen (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id  UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    jaar             INT NOT NULL,
    maand            SMALLINT NOT NULL CHECK (maand BETWEEN 1 AND 12),
    afgesloten_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    afgesloten_by    UUID,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE maand_afsluitingen IS
    'Afgesloten (vergrendelde) boekhoud-maanden. Bonnen/facturen van de maand krijgen locked_at.';

CREATE UNIQUE INDEX IF NOT EXISTS maand_afsluitingen_period_unique
    ON maand_afsluitingen (organization_id, jaar, maand);
CREATE INDEX IF NOT EXISTS maand_afsluitingen_org_idx
    ON maand_afsluitingen (organization_id, jaar DESC, maand DESC);

ALTER TABLE maand_afsluitingen ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS maand_afsluitingen_select ON maand_afsluitingen;
CREATE POLICY maand_afsluitingen_select ON maand_afsluitingen
    FOR SELECT USING (organization_id IN (SELECT public.user_org_ids()));

DROP POLICY IF EXISTS maand_afsluitingen_insert ON maand_afsluitingen;
CREATE POLICY maand_afsluitingen_insert ON maand_afsluitingen
    FOR INSERT WITH CHECK (organization_id IN (SELECT public.user_org_ids()));

DROP POLICY IF EXISTS maand_afsluitingen_delete ON maand_afsluitingen;
CREATE POLICY maand_afsluitingen_delete ON maand_afsluitingen
    FOR DELETE USING (organization_id IN (SELECT public.user_org_ids()));
