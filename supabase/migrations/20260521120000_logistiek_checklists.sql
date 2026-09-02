-- /logistiek auto-checklist per event. Sam: "als de offerte geaccepteerd word
-- moet de ai een vraag geven van hey zal ik een voorstel doen en dan kan ik
-- zelf aanpassen aanmeten hoe of wat. Top tier!"
--
-- Eén checklist per event. Items zitten in JSONB array zodat we makkelijk
-- categorieën (materieel/mensen/voorbereiding/transport) kunnen meegeven
-- zonder een aparte items-tabel. Doneer-state per item zit in dezelfde JSONB.

CREATE TABLE IF NOT EXISTS logistiek_checklists (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    event_id BIGINT NOT NULL REFERENCES events(id) ON DELETE CASCADE,

    -- AI-generated items: [{categorie, tekst, done, ai_suggested, hoeveelheid?, eenheid?}]
    items JSONB NOT NULL DEFAULT '[]'::JSONB,

    -- AI provenance — welke prompt-versie + model heeft dit gegenereerd?
    ai_model TEXT,
    ai_prompt_version TEXT,
    generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    accepted_at TIMESTAMPTZ,
    accepted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Eén checklist per event; user kan 'm regenereren maar UPDATE in-place
    CONSTRAINT logistiek_checklists_event_uq UNIQUE (event_id)
);

CREATE INDEX IF NOT EXISTS logistiek_checklists_org_idx
    ON logistiek_checklists (organization_id);
CREATE INDEX IF NOT EXISTS logistiek_checklists_event_idx
    ON logistiek_checklists (event_id);

ALTER TABLE logistiek_checklists ENABLE ROW LEVEL SECURITY;

CREATE POLICY "logistiek_checklists_select" ON logistiek_checklists
    FOR SELECT TO authenticated
    USING (
        organization_id IN (
            SELECT organization_id FROM organization_members
            WHERE user_id = (SELECT auth.uid()) AND status = 'active'
        )
    );

CREATE POLICY "logistiek_checklists_insert" ON logistiek_checklists
    FOR INSERT TO authenticated
    WITH CHECK (
        organization_id IN (
            SELECT organization_id FROM organization_members
            WHERE user_id = (SELECT auth.uid()) AND status = 'active'
        )
    );

CREATE POLICY "logistiek_checklists_update" ON logistiek_checklists
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

CREATE POLICY "logistiek_checklists_delete" ON logistiek_checklists
    FOR DELETE TO authenticated
    USING (
        organization_id IN (
            SELECT organization_id FROM organization_members
            WHERE user_id = (SELECT auth.uid()) AND status = 'active'
        )
    );

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION logistiek_checklists_touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS logistiek_checklists_touch ON logistiek_checklists;
CREATE TRIGGER logistiek_checklists_touch
    BEFORE UPDATE ON logistiek_checklists
    FOR EACH ROW EXECUTE FUNCTION logistiek_checklists_touch_updated_at();

ALTER PUBLICATION supabase_realtime ADD TABLE logistiek_checklists;
