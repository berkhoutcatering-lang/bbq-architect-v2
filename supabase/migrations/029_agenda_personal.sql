-- Persoonlijke agenda-items voor /agenda — losse afspraken die niet aan een
-- event of klant hangen (privé voor de gebruiker, niet org-breed zichtbaar).
--
-- RLS: alleen de creator ziet zijn eigen items, ook al delen team-leden
-- dezelfde organisatie. Org-id wordt wel meegeschreven voor consistentie en
-- om makkelijk te kunnen joinen/queryen wanneer nodig.

CREATE TABLE IF NOT EXISTS agenda_personal (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

    title TEXT NOT NULL,

    /* Datum + start/eind tijd — eind mag NULL zijn (default 1u na start). */
    date DATE NOT NULL,
    start_time TIME NOT NULL DEFAULT '09:00',
    end_time TIME,

    /* Vrije notitie + optionele kleur-tag (hex of var-naam). */
    notes TEXT,
    color TEXT DEFAULT '#888888',

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS agenda_personal_user_date_idx
    ON agenda_personal (user_id, date);

CREATE INDEX IF NOT EXISTS agenda_personal_org_id_idx
    ON agenda_personal (organization_id);

ALTER TABLE agenda_personal ENABLE ROW LEVEL SECURITY;

CREATE POLICY "agenda_personal_select" ON agenda_personal
    FOR SELECT TO authenticated
    USING (user_id = (SELECT auth.uid()));

CREATE POLICY "agenda_personal_insert" ON agenda_personal
    FOR INSERT TO authenticated
    WITH CHECK (
        user_id = (SELECT auth.uid())
        AND organization_id IN (
            SELECT organization_id FROM organization_members
            WHERE user_id = (SELECT auth.uid()) AND status = 'active'
        )
    );

CREATE POLICY "agenda_personal_update" ON agenda_personal
    FOR UPDATE TO authenticated
    USING (user_id = (SELECT auth.uid()))
    WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY "agenda_personal_delete" ON agenda_personal
    FOR DELETE TO authenticated
    USING (user_id = (SELECT auth.uid()));

/* Realtime-subscription support — useSupabase hook ent op pg_notify
   triggers via Supabase Realtime; tabel toevoegen aan publicatie. */
ALTER PUBLICATION supabase_realtime ADD TABLE agenda_personal;
