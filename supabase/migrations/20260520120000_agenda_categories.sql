-- Custom agenda-categorieën per organisatie. Voorheen waren de 3 calendar-types
-- (Events / Prep / Persoonlijk) hardcoded in src/app/agenda/page.tsx. Sam wil
-- als caterer eigen agenda's kunnen toevoegen — bijv. "Prive", "Inkoop",
-- "Personeel", "Showroom" — met eigen kleur en icon.
--
-- De 3 system-categorieën blijven hardcoded in de UI (read-only); deze tabel
-- bevat alleen user-defined categorieën die er BOVENOP komen.

CREATE TABLE IF NOT EXISTS agenda_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

    name TEXT NOT NULL,
    color TEXT NOT NULL DEFAULT '#a78bfa',
    icon TEXT NOT NULL DEFAULT 'Calendar',
    default_visible BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order INT NOT NULL DEFAULT 0,

    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT agenda_categories_name_per_org_uq UNIQUE (organization_id, name)
);

-- Policy-kolom heeft index — voorkomt seq-scan op org_id-check bij elke query.
CREATE INDEX IF NOT EXISTS agenda_categories_org_id_idx
    ON agenda_categories (organization_id);

CREATE INDEX IF NOT EXISTS agenda_categories_org_sort_idx
    ON agenda_categories (organization_id, sort_order);

ALTER TABLE agenda_categories ENABLE ROW LEVEL SECURITY;

-- Alle org-members zien dezelfde categorieën — categorieën zijn team-gedeeld,
-- niet user-specifiek (in tegenstelling tot agenda_personal).
CREATE POLICY "agenda_categories_select" ON agenda_categories
    FOR SELECT TO authenticated
    USING (
        organization_id IN (
            SELECT organization_id FROM organization_members
            WHERE user_id = (SELECT auth.uid()) AND status = 'active'
        )
    );

CREATE POLICY "agenda_categories_insert" ON agenda_categories
    FOR INSERT TO authenticated
    WITH CHECK (
        organization_id IN (
            SELECT organization_id FROM organization_members
            WHERE user_id = (SELECT auth.uid()) AND status = 'active'
        )
    );

CREATE POLICY "agenda_categories_update" ON agenda_categories
    FOR UPDATE TO authenticated
    USING (
        organization_id IN (
            SELECT organization_id FROM organization_members
            WHERE user_id = (SELECT auth.uid()) AND status = 'active'
        )
    )
    WITH CHECK (
        organization_id IN (
            SELECT organization_id FROM organization_members
            WHERE user_id = (SELECT auth.uid()) AND status = 'active'
        )
    );

CREATE POLICY "agenda_categories_delete" ON agenda_categories
    FOR DELETE TO authenticated
    USING (
        organization_id IN (
            SELECT organization_id FROM organization_members
            WHERE user_id = (SELECT auth.uid()) AND status = 'active'
        )
    );

-- Auto-update updated_at op elke change.
CREATE OR REPLACE FUNCTION agenda_categories_touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS agenda_categories_touch ON agenda_categories;
CREATE TRIGGER agenda_categories_touch
    BEFORE UPDATE ON agenda_categories
    FOR EACH ROW EXECUTE FUNCTION agenda_categories_touch_updated_at();

-- Realtime ondersteuning: useSupabase hook leest met realtime-channel.
ALTER PUBLICATION supabase_realtime ADD TABLE agenda_categories;

-- agenda_personal krijgt optioneel category_id zodat user-afspraken aan een
-- eigen agenda gekoppeld kunnen worden. NULL = system "Persoonlijk" cal.
-- ON DELETE SET NULL voorkomt dataverlies wanneer een categorie verwijderd
-- wordt — afspraken vallen terug op de system-cal.
ALTER TABLE agenda_personal
    ADD COLUMN IF NOT EXISTS category_id UUID
    REFERENCES agenda_categories(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS agenda_personal_category_idx
    ON agenda_personal (category_id);
