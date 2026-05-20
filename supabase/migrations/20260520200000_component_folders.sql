-- Google-Drive-style folders voor /gerechten/componenten. Sam wil "sub-pages"
-- in /componenten zodat 100+ items niet één doorlopende lijst zijn. Folders
-- zijn een organisatorische laag; één component zit in 0 of 1 folder.
--
-- Recursive: een folder kan een sub-folder hebben. Diepte is open (geen hard
-- limit) maar UI hint op max ~3 niveaus voor wayfinding.

CREATE TABLE IF NOT EXISTS component_folders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

    parent_id UUID REFERENCES component_folders(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    icon TEXT NOT NULL DEFAULT 'Folder',
    color TEXT,
    sort_order INT NOT NULL DEFAULT 0,

    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Naam moet uniek zijn binnen dezelfde parent + org.
    -- NULL parent_id wordt apart afgevangen via UNIQUE index hieronder.
    CONSTRAINT component_folders_name_per_parent_uq UNIQUE (organization_id, parent_id, name)
);

-- Voor root-folders (parent_id IS NULL) doet UNIQUE NULL niet wat we willen
-- (NULL telt als niet-gelijk). Aparte partial unique index forceert uniek
-- bij root-niveau.
CREATE UNIQUE INDEX IF NOT EXISTS component_folders_root_name_uq
    ON component_folders (organization_id, name)
    WHERE parent_id IS NULL;

CREATE INDEX IF NOT EXISTS component_folders_org_idx
    ON component_folders (organization_id);

CREATE INDEX IF NOT EXISTS component_folders_parent_idx
    ON component_folders (parent_id);

ALTER TABLE component_folders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "component_folders_select" ON component_folders
    FOR SELECT TO authenticated
    USING (
        organization_id IN (
            SELECT organization_id FROM organization_members
            WHERE user_id = (SELECT auth.uid()) AND status = 'active'
        )
    );

CREATE POLICY "component_folders_insert" ON component_folders
    FOR INSERT TO authenticated
    WITH CHECK (
        organization_id IN (
            SELECT organization_id FROM organization_members
            WHERE user_id = (SELECT auth.uid()) AND status = 'active'
        )
    );

CREATE POLICY "component_folders_update" ON component_folders
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

CREATE POLICY "component_folders_delete" ON component_folders
    FOR DELETE TO authenticated
    USING (
        organization_id IN (
            SELECT organization_id FROM organization_members
            WHERE user_id = (SELECT auth.uid()) AND status = 'active'
        )
    );

-- Auto-update updated_at op elke change.
CREATE OR REPLACE FUNCTION component_folders_touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS component_folders_touch ON component_folders;
CREATE TRIGGER component_folders_touch
    BEFORE UPDATE ON component_folders
    FOR EACH ROW EXECUTE FUNCTION component_folders_touch_updated_at();

-- Realtime support.
ALTER PUBLICATION supabase_realtime ADD TABLE component_folders;

-- Components krijgen optioneel folder_id. NULL = staat in root.
-- ON DELETE SET NULL: als folder verwijderd wordt, vallen z'n componenten
-- terug naar root — geen dataverlies.
ALTER TABLE components
    ADD COLUMN IF NOT EXISTS folder_id UUID
    REFERENCES component_folders(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS components_folder_idx
    ON components (folder_id);
