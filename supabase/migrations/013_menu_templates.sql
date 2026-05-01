-- Menu Templates — herbruikbare menu's die op /gerechten samengesteld worden
-- en in /offertes als startpunt worden gebruikt.
--
-- Probleem voor deze migratie: menu-samenstelling leefde tot nu toe op drie
-- losse plekken (MenuWizard binnen offerte-flow, AiMenuComposer op
-- /menu-engineering, EventMenuKaartBuilder op event-hub). Geen daarvan kon
-- het resultaat opslaan voor hergebruik — elke offerte begon op nul.
--
-- Eén plek wint nu: /gerechten heeft een tab "Menu's" waar je een wizard
-- start, het resultaat als template opslaat, en die template later in een
-- offerte selecteert (zelfde wizard, mode 'offerte' i.p.v. 'template').
--
-- Structuur:
--   - menu_selectie (JSONB) is hetzelfde object dat offertes.menu_selectie
--     opslaat: { gang_slug: dish_naam[] }. Wizard kan dus 1-op-1 prefillen.
--   - basis_prijs_pp staat op de template zodat een "default-bruiloft" óók
--     z'n prijs onthoudt; offerte mag dat overschrijven.
--   - is_default: één template per org kan als default gemarkeerd zijn,
--     dan stelt de offerte-wizard die meteen voor.

CREATE TABLE IF NOT EXISTS menu_templates (
    id BIGSERIAL PRIMARY KEY,
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    naam TEXT NOT NULL,
    beschrijving TEXT,
    /* Identiek aan offertes.menu_selectie zodat wizard prefill triviaal is. */
    menu_selectie JSONB NOT NULL DEFAULT '{}'::jsonb,
    basis_prijs_pp NUMERIC(10,2) DEFAULT 0,
    aantal_gasten INTEGER DEFAULT 40,  /* referentie/voorbeeld, geen hard contract */
    is_default BOOLEAN NOT NULL DEFAULT false,
    actief BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE menu_templates IS 'Herbruikbare menu-samenstellingen — opgeslagen wizard-resultaten, gebruikt als startpunt voor nieuwe offertes.';
COMMENT ON COLUMN menu_templates.menu_selectie IS 'Object { gang_slug: string[] } — zelfde shape als offertes.menu_selectie zodat wizard prefill triviaal is.';
COMMENT ON COLUMN menu_templates.is_default IS 'Slechts één template per org mag default=true zijn — afgedwongen via partial unique index.';

CREATE INDEX IF NOT EXISTS idx_menu_templates_org ON menu_templates(organization_id);
CREATE INDEX IF NOT EXISTS idx_menu_templates_actief ON menu_templates(organization_id, actief);

/* Maximaal 1 default-template per org. Partial index zodat de constraint
   geldt op actieve defaults — verwijderde of niet-default rijen tellen niet. */
CREATE UNIQUE INDEX IF NOT EXISTS idx_menu_templates_one_default_per_org
    ON menu_templates(organization_id)
    WHERE is_default = true;

ALTER TABLE menu_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "menu_templates_select" ON menu_templates
    FOR SELECT USING (
        organization_id IS NULL
        OR organization_id IN (
            SELECT organization_id FROM organization_members
            WHERE user_id = auth.uid() AND status = 'active'
        )
    );

CREATE POLICY "menu_templates_insert" ON menu_templates
    FOR INSERT WITH CHECK (
        organization_id IS NULL
        OR organization_id IN (
            SELECT organization_id FROM organization_members
            WHERE user_id = auth.uid() AND status = 'active'
        )
    );

CREATE POLICY "menu_templates_update" ON menu_templates
    FOR UPDATE USING (
        organization_id IS NULL
        OR organization_id IN (
            SELECT organization_id FROM organization_members
            WHERE user_id = auth.uid() AND status = 'active'
        )
    );

CREATE POLICY "menu_templates_delete" ON menu_templates
    FOR DELETE USING (
        organization_id IS NULL
        OR organization_id IN (
            SELECT organization_id FROM organization_members
            WHERE user_id = auth.uid() AND status = 'active'
        )
    );

/* updated_at auto-bijwerken — triggers bestaan al voor andere tabellen,
   we hergebruiken het patroon hier. */
CREATE OR REPLACE FUNCTION update_menu_templates_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_menu_templates_updated_at ON menu_templates;
CREATE TRIGGER trg_menu_templates_updated_at
    BEFORE UPDATE ON menu_templates
    FOR EACH ROW
    EXECUTE FUNCTION update_menu_templates_updated_at();
