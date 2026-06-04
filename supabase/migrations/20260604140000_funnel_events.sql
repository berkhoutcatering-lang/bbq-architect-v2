-- ════════════════════════════════════════════════════════════════════════════
--  Migration — funnel_events (configurator-trechter)
--
--  Anonieme trechter-events voor de publieke arrangement-configurator:
--    view   = configurator geopend
--    start  = klant klikte "Begin met samenstellen"
--    submit = aanvraag verstuurd
--
--  Geen PII: session_id is een client-gegenereerde anonieme id (sessionStorage,
--  geen cookie) puur om unieke sessies te tellen. Org-gescoped met RLS; de
--  publieke insert gaat via de SERVICE-ROLE client (beacon-endpoint), net als
--  /api/public-arrangement en /aanvraag — geen anon-policy.
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.funnel_events (
    id              BIGSERIAL   PRIMARY KEY,
    organization_id UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    arrangement_id  UUID        REFERENCES public.arrangementen(id) ON DELETE SET NULL,
    event           TEXT        NOT NULL CHECK (event IN ('view','start','submit')),
    session_id      TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.funnel_events IS 'Anonieme configurator-trechter-events (view/start/submit) per arrangement. Geen PII; session_id = anonieme client-id voor unieke-sessie-telling.';

CREATE INDEX IF NOT EXISTS funnel_events_org_idx ON public.funnel_events(organization_id, arrangement_id, event);

ALTER TABLE public.funnel_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS funnel_events_select ON public.funnel_events;
CREATE POLICY funnel_events_select ON public.funnel_events
    FOR SELECT TO authenticated
    USING (organization_id IN (SELECT private.user_org_ids()));
