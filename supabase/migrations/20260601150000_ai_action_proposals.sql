-- ============================================================
-- AI Action Proposals — chat-acties met confirm-flow
-- Date: 2026-06-01
--
-- Doel: de chat-AI moet kunnen "voorstellen" om een offerte, event,
-- klant of email-draft te maken — maar nooit zonder bevestiging.
-- Tools schrijven hier een rij; UI toont AiActionConfirm; gebruiker
-- bevestigt/wijzigt/annuleert; aparte Server Action voert de echte
-- mutatie uit en updatet de status.
--
-- Multi-tenant via organization_id + RLS (zelfde patroon als leads).
-- ============================================================

CREATE TABLE IF NOT EXISTS public.ai_action_proposals (
    id              UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID            NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    user_id         UUID            NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

    -- Welk type actie de AI voorstelt
    proposal_type   TEXT            NOT NULL CHECK (proposal_type IN (
                        'offerte_draft', 'event_draft', 'klant_upsert', 'email_draft'
                    )),

    -- Voorstel-data per type (flexibel, validated server-side bij confirm)
    payload         JSONB           NOT NULL,

    -- Lifecycle
    status          TEXT            NOT NULL DEFAULT 'pending' CHECK (status IN (
                        'pending', 'confirmed', 'edited', 'cancelled', 'expired'
                    )),

    -- Origin: welke chat-message triggerde dit (handig voor audit)
    chat_message_id TEXT,

    -- Resultaat na confirm: id van de gemaakte resource (offerte/event/klant/etc)
    result_id       TEXT,

    created_at      TIMESTAMPTZ     NOT NULL DEFAULT now(),
    expires_at      TIMESTAMPTZ     NOT NULL DEFAULT now() + interval '24 hours',
    confirmed_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_ai_action_proposals_org_status
    ON public.ai_action_proposals (organization_id, status);

CREATE INDEX IF NOT EXISTS idx_ai_action_proposals_expires
    ON public.ai_action_proposals (expires_at)
    WHERE status = 'pending';

-- ── RLS — multi-tenant ──────────────────────────────────────
ALTER TABLE public.ai_action_proposals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ai_action_proposals_select ON public.ai_action_proposals;
CREATE POLICY ai_action_proposals_select ON public.ai_action_proposals
    FOR SELECT TO authenticated
    USING (organization_id IN (SELECT private.user_org_ids()));

DROP POLICY IF EXISTS ai_action_proposals_insert ON public.ai_action_proposals;
CREATE POLICY ai_action_proposals_insert ON public.ai_action_proposals
    FOR INSERT TO authenticated
    WITH CHECK (organization_id IN (SELECT private.user_org_ids()));

DROP POLICY IF EXISTS ai_action_proposals_update ON public.ai_action_proposals;
CREATE POLICY ai_action_proposals_update ON public.ai_action_proposals
    FOR UPDATE TO authenticated
    USING      (organization_id IN (SELECT private.user_org_ids()))
    WITH CHECK (organization_id IN (SELECT private.user_org_ids()));

DROP POLICY IF EXISTS ai_action_proposals_delete ON public.ai_action_proposals;
CREATE POLICY ai_action_proposals_delete ON public.ai_action_proposals
    FOR DELETE TO authenticated
    USING (organization_id IN (SELECT private.user_org_ids()));

COMMENT ON TABLE public.ai_action_proposals IS
    'AI-voorgestelde mutations (offerte/event/klant/email-draft). '
    'Pending → user bevestigt via AiActionConfirm → status confirmed + result_id. '
    'Expired automatisch na 24u (zie cleanup-job).';

-- ============================================================
-- End migration
-- ============================================================
