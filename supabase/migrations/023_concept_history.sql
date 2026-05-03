-- Concept history voor /bedenker — vervangt localStorage zodat:
--   1. Team-leden elkaars concepten zien (multi-tenant via RLS)
--   2. KPI-tiles op echte data draaien (totaal-bedacht, totaal-bewaard, gem-confidence)
--   3. Concepten kunnen worden teruggevonden + later alsnog opgeslagen
--
-- Een concept-rij representeert ÉÉN AI-output (1 van de 3 varianten per ronde).
-- De volledige API-respons leeft in `body` (jsonb) zodat we niet bij elke
-- schema-wijziging hoeven te migreren.

CREATE TABLE IF NOT EXISTS concept_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,

    /* prompt = de tekst die gebruiker invoerde (origineel, niet de variant-twist) */
    prompt TEXT NOT NULL,

    /* mode: 'vrij' = open brainstorm, 'voorraad' = uit-restjes, 'klant' = klant-input */
    mode TEXT NOT NULL DEFAULT 'vrij' CHECK (mode IN ('vrij', 'voorraad', 'klant')),

    /* mode_context: extra invoer per mode — voor 'voorraad' bv. {ingredienten: "2kg kip..."},
       voor 'klant' bv. {dieet: ["glutenvrij"], gasten: 25, budget_pp: 18}. */
    mode_context JSONB NOT NULL DEFAULT '{}'::jsonb,

    /* Display-fields — gedupliceerd uit body voor snelle list-rendering zonder
       full jsonb scan. */
    naam TEXT NOT NULL,
    tagline TEXT,
    glyph TEXT,
    categorie TEXT,
    cuisine TEXT,

    /* Stats — voor KPI-tiles + sortering */
    kostprijs_pp NUMERIC(8,2),
    marge_pct NUMERIC(5,2),
    confidence NUMERIC(4,3) CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),

    /* Volledige AI-output zoals door API teruggegeven (ingredienten, instructies,
       allergenen, battle_plan, wijn_suggestie, etc). */
    body JSONB NOT NULL DEFAULT '{}'::jsonb,

    /* Inspiraties: { name, category?, glyph? }[] — welke bestaande gerechten
       als stijlbron dienden. Voor KPI "unieke inspiraties gebruikt". */
    inspiraties JSONB NOT NULL DEFAULT '[]'::jsonb,

    /* Status-tracking: 'nieuw' (just gen'd, op scherm), 'bewaard' (in /gerechten),
       'afgewezen' (gebruiker klikte "niets bevalt"), 'verlopen' (auto-cleanup > 30d). */
    status TEXT NOT NULL DEFAULT 'nieuw' CHECK (status IN ('nieuw', 'bewaard', 'afgewezen', 'verlopen')),

    /* Bij 'bewaard': koppeling naar gerechten.id (UUID). NULL anders. */
    saved_gerecht_id UUID REFERENCES gerechten(id) ON DELETE SET NULL,
    saved_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE concept_history IS 'AI-concept history voor /bedenker — vervangt localStorage met multi-tenant Supabase + RLS.';
COMMENT ON COLUMN concept_history.mode IS 'vrij = open brainstorm; voorraad = uit-restjes (Lars); klant = klant-input wizard-feeder.';
COMMENT ON COLUMN concept_history.body IS 'Volledige AI-output JSON — toekomstige schema-wijzigingen zonder migratie.';

CREATE INDEX IF NOT EXISTS idx_concept_history_org_created
    ON concept_history(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_concept_history_status
    ON concept_history(organization_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_concept_history_mode
    ON concept_history(organization_id, mode, created_at DESC);

ALTER TABLE concept_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "concept_history_select" ON concept_history
    FOR SELECT TO authenticated
    USING (
        organization_id IN (
            SELECT organization_id FROM organization_members
            WHERE user_id = (SELECT auth.uid()) AND status = 'active'
        )
    );

CREATE POLICY "concept_history_insert" ON concept_history
    FOR INSERT TO authenticated
    WITH CHECK (
        organization_id IN (
            SELECT organization_id FROM organization_members
            WHERE user_id = (SELECT auth.uid()) AND status = 'active'
        )
    );

CREATE POLICY "concept_history_update" ON concept_history
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

CREATE POLICY "concept_history_delete" ON concept_history
    FOR DELETE TO authenticated
    USING (
        organization_id IN (
            SELECT organization_id FROM organization_members
            WHERE user_id = (SELECT auth.uid()) AND status = 'active'
        )
    );
