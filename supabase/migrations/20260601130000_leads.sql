-- ════════════════════════════════════════════════════════════════════════════
--  Migration — leads (Lead Funnel)
--
--  De Golden Flow (offerte → /q portal → event → factuur) startte tot nu toe
--  altijd BINNEN de app: een operator maakte handmatig een klantgesprek of
--  offerte. Er was geen inbound, publieke ingang. Deze migratie introduceert
--  een `leads`-tabel die de funnel áán de voorkant verlengt:
--
--    publiek aanvraagformulier (/aanvraag/[slug])  →  lead (source='public_form')
--    handmatig toegevoegd in de pijplijn            →  lead (source='manual')
--    → operator volgt op, AI maakt concept          →  lead.ai_concept
--    → "Maak offerte"                                →  lead.offerte_id + status='offerte'
--    → offerte geaccepteerd                          →  status='gewonnen'
--
--  Multi-tenant: org-gescoped met RLS. Operator-CRUD via authenticated-policies
--  (private.user_org_ids()). De PUBLIEKE insert vanaf het aanvraagformulier
--  gaat via de SERVICE-ROLE client (zie src/app/api/public-lead-form/[slug]) —
--  net als /q/[id] en de bon-share-flow. Daarom GEEN `TO anon`-policy
--  (consistent met de rest van de repo; anon-policies zijn hier anti-patroon).
--
--  Hard rules:
--   • BTW/hoeveelheden NOOIT hier en NOOIT AI-afgeleid — ai_concept bevat enkel
--     een menu-voorstel (gerechten + advies-prijs-pp). Regeltotalen/BTW worden
--     downstream in de offerte/factuur-laag berekend (calcLineTotals).
--   • RLS via private.user_org_ids() — consistent met o.a.
--     20260601120000_menu_template_items.sql.
--   • offerte_id als INTEGER REFERENCES offertes(id) — offertes.id is int4
--     (geverifieerd via information_schema); exact-type-match, geen cross-type FK.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. leads tabel ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.leads (
    id                BIGSERIAL PRIMARY KEY,
    organization_id   UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,

    -- Contact + aanvraag-velden (publiek formulier)
    naam              TEXT        NOT NULL,
    email             TEXT,
    telefoon          TEXT,
    event_datum       DATE,
    gasten            INTEGER,
    locatie           TEXT,
    event_type        TEXT,
    budget_indicatie  TEXT,
    bericht           TEXT,

    -- Pijplijn-status
    status            TEXT        NOT NULL DEFAULT 'nieuw'
                          CHECK (status IN ('nieuw','in_gesprek','offerte','gewonnen','verloren')),
    source            TEXT        NOT NULL DEFAULT 'public_form'
                          CHECK (source IN ('public_form','manual','klantgesprek')),

    -- Ecosysteem-koppelingen
    offerte_id        INTEGER     REFERENCES public.offertes(id) ON DELETE SET NULL,
    client_naam       TEXT,       -- canonieke klant-link (zelfde conventie als offertes/events/facturen)

    -- AI-concept (menu-voorstel uit recipe-generate; GEEN BTW/totalen)
    ai_concept        JSONB,

    -- Opvolging
    follow_up_at      TIMESTAMPTZ,

    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE  public.leads IS 'Lead Funnel: inbound aanvragen (publiek formulier of handmatig) + pijplijn nieuw→in_gesprek→offerte→gewonnen/verloren. Converteert naar de bestaande offerte-flow via offerte_id.';
COMMENT ON COLUMN public.leads.ai_concept IS 'AI-gegenereerd menu-voorstel (recipe-generate output). Bevat NOOIT BTW/regeltotalen — die worden downstream berekend.';
COMMENT ON COLUMN public.leads.client_naam IS 'Canonieke klant-link (geen FK, zelfde naam-conventie als offertes/events/facturen). Default = naam; operator kan corrigeren.';
COMMENT ON COLUMN public.leads.source IS 'Herkomst: public_form (aanvraagformulier), manual (operator), klantgesprek.';

CREATE INDEX IF NOT EXISTS leads_org_idx        ON public.leads(organization_id);
CREATE INDEX IF NOT EXISTS leads_org_status_idx ON public.leads(organization_id, status);
CREATE INDEX IF NOT EXISTS leads_offerte_idx    ON public.leads(offerte_id) WHERE offerte_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS leads_followup_idx   ON public.leads(organization_id, follow_up_at) WHERE follow_up_at IS NOT NULL;

-- ── 2. RLS — operator-CRUD (publieke insert gaat via service-role, geen anon) ─
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS leads_select ON public.leads;
CREATE POLICY leads_select ON public.leads
    FOR SELECT TO authenticated
    USING (organization_id IN (SELECT private.user_org_ids()));

DROP POLICY IF EXISTS leads_insert ON public.leads;
CREATE POLICY leads_insert ON public.leads
    FOR INSERT TO authenticated
    WITH CHECK (organization_id IN (SELECT private.user_org_ids()));

DROP POLICY IF EXISTS leads_update ON public.leads;
CREATE POLICY leads_update ON public.leads
    FOR UPDATE TO authenticated
    USING      (organization_id IN (SELECT private.user_org_ids()))
    WITH CHECK (organization_id IN (SELECT private.user_org_ids()));

DROP POLICY IF EXISTS leads_delete ON public.leads;
CREATE POLICY leads_delete ON public.leads
    FOR DELETE TO authenticated
    USING (organization_id IN (SELECT private.user_org_ids()));

-- ── 3. updated_at trigger (hergebruik bestaande public.set_updated_at) ────────
DROP TRIGGER IF EXISTS trg_leads_updated_at ON public.leads;
CREATE TRIGGER trg_leads_updated_at
    BEFORE UPDATE ON public.leads
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();
