-- ════════════════════════════════════════════════════════════════════════════
--  Kerst-Box-bestellingen zonder online betalen — betalen bij het afhalen
--  Opdracht: OPDRACHT-BBQ-ARCHITECT-KERSTBOX-BESTELLINGEN.md (website-repo,
--  5 oktober 2026) + de keuzes van Mathijs van dezelfde dag.
-- ════════════════════════════════════════════════════════════════════════════
--
--  De site stuurt een Kerst-Box-bestelling als lead naar /api/public-lead-form.
--  BBQ Architect maakt er een gewone winkel-order van, zodat hij meetelt in de
--  vakjes, de productie- en inpaklijsten en de balie. Geen tweede bestelmodel.
--
--    1. Betaalwijze 'bij_afhalen': niets online, het hele bedrag is rest en
--       wordt aan de balie geboekt (winkel_boek_rest, pin of contant). De order
--       staat op 'betaald' zodra hij geplaatst is, net als een reservering na
--       de € 2,50: 'betaald' = het online deel is rond, en dat is hier nul.
--    2. Status 'geannuleerd': Mathijs annuleert in het Kerst-scherm. Telt
--       nergens meer mee (alle tellingen filteren al op 'betaald' of 'wacht').
--    3. Op de order: de lead waar hij vandaan komt, of de klant het aantal nog
--       niet precies wist, en wanneer de navraag- en herinneringsmail gingen.
--    4. kerst_onderdelen: wat er per persoon in de doos zit, in grammen (of
--       stuks), gewoon en vegetarisch apart. Daaruit rekent het Kerst-scherm
--       hoeveel er gemaakt moet worden.
--
--  Alles additief. Bestaande orders veranderen niet.
--  Toepassen: npx supabase db query --linked -f <dit bestand> (nooit db push).
--
--  Eén data-wijziging, op verzoek van Mathijs (5 oktober 2026): de Kerst-Box
--  heeft geen maximum per afhaaldag. De 25 dozen per dag uit de seed waren
--  nooit bevestigd; capaciteit gaat naar NULL (= onbeperkt) voor de groep
--  'kerst-box' (§5). De afhaaldagen 25 en 26 december en de proeverij-
--  artikelen maakt de code zelf aan als ze ontbreken (src/lib/winkel/kerst.ts),
--  en staan ook in scripts/winkel-seed-hop-en-bites.mjs.

-- ── 1 + 2. Betaalwijze en status ────────────────────────────────────────────
-- De CHECK-namen zijn door Postgres gekozen (inline bij ADD COLUMN / CREATE
-- TABLE). Opzoeken in plaats van raden, zodat dit ook werkt als ze ooit anders
-- heten.
DO $$
DECLARE
    c TEXT;
BEGIN
    FOR c IN
        SELECT con.conname FROM pg_constraint con
          JOIN pg_class rel ON rel.oid = con.conrelid
         WHERE rel.relname = 'winkel_orders' AND con.contype = 'c'
           AND (pg_get_constraintdef(con.oid) LIKE '%betaalwijze%'
             OR pg_get_constraintdef(con.oid) LIKE '%''afgebroken''%')
    LOOP
        EXECUTE format('ALTER TABLE public.winkel_orders DROP CONSTRAINT %I', c);
    END LOOP;
END $$;

ALTER TABLE public.winkel_orders
    ADD CONSTRAINT winkel_orders_betaalwijze_check
        CHECK (betaalwijze IN ('volledig', 'reservering', 'bij_afhalen')),
    ADD CONSTRAINT winkel_orders_status_check
        CHECK (status IN ('wacht', 'betaald', 'afgebroken', 'mislukt', 'verlopen', 'geannuleerd'));

COMMENT ON COLUMN public.winkel_orders.betaalwijze IS
    'volledig = alles online; reservering = € 2,50 online, rest aan de balie; bij_afhalen = niets online, alles aan de balie (Kerst-Box zonder myPOS, oktober 2026).';

-- ── 3. Wat de Kerst-order extra weet ────────────────────────────────────────
ALTER TABLE public.winkel_orders
    ADD COLUMN IF NOT EXISTS lead_id                  BIGINT      REFERENCES public.leads(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS aantal_onzeker           BOOLEAN     NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS navraag_verstuurd_at     TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS herinnering_verstuurd_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS geannuleerd_at           TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS winkel_orders_lead_uniek
    ON public.winkel_orders(lead_id) WHERE lead_id IS NOT NULL;

COMMENT ON COLUMN public.winkel_orders.lead_id IS
    'De lead van het websiteformulier waaruit deze order is gemaakt (Kerst-Box zonder online betalen). Eén order per lead.';
COMMENT ON COLUMN public.winkel_orders.aantal_onzeker IS
    'De klant vinkte "Weet ik nog niet precies" aan. Telt mee; een paar dagen voor het afhalen gaat een navraagmail.';

-- Aan welke lead hangt de omzetting, en waarom mislukte hij? Zonder order
-- staat de bestelling nog als lead in het Kerst-scherm, met de reden.
ALTER TABLE public.leads
    ADD COLUMN IF NOT EXISTS omzet_fout TEXT;
COMMENT ON COLUMN public.leads.omzet_fout IS
    'Kerst-Box-bestelling die niet in een winkel-order kon (dag vol, artikel uit, …). Leeg = gelukt of niet van toepassing.';

-- ── 4. Wat er per persoon in de doos zit ────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.kerst_onderdelen (
    id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id  UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    naam             TEXT        NOT NULL CHECK (length(btrim(naam)) > 0),
    -- Alleen voor het groeperen in het scherm: vlees/vis, saus, side, …
    soort            TEXT        NOT NULL DEFAULT 'overig',
    eenheid          TEXT        NOT NULL DEFAULT 'gram' CHECK (eenheid IN ('gram', 'stuk', 'ml')),
    -- Per persoon. NULL of 0 = zit niet in die variant.
    per_persoon      NUMERIC     CHECK (per_persoon IS NULL OR per_persoon >= 0),
    per_persoon_vega NUMERIC     CHECK (per_persoon_vega IS NULL OR per_persoon_vega >= 0),
    volgorde         INTEGER     NOT NULL DEFAULT 0,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS kerst_onderdelen_org_idx ON public.kerst_onderdelen(organization_id, volgorde);

COMMENT ON TABLE public.kerst_onderdelen IS
    'De inhoud van de Kerst-Box per persoon, gewoon en vegetarisch. Het Kerst-scherm rekent: per_persoon × (personen − vega) + per_persoon_vega × vega.';

DROP TRIGGER IF EXISTS kerst_onderdelen_updated_at ON public.kerst_onderdelen;
CREATE TRIGGER kerst_onderdelen_updated_at
    BEFORE UPDATE ON public.kerst_onderdelen
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.kerst_onderdelen ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS kerst_onderdelen_select ON public.kerst_onderdelen;
CREATE POLICY kerst_onderdelen_select ON public.kerst_onderdelen FOR SELECT TO authenticated
    USING (organization_id IN (SELECT private.user_org_ids()));
DROP POLICY IF EXISTS kerst_onderdelen_insert ON public.kerst_onderdelen;
CREATE POLICY kerst_onderdelen_insert ON public.kerst_onderdelen FOR INSERT TO authenticated
    WITH CHECK (organization_id IN (SELECT private.user_org_ids()));
DROP POLICY IF EXISTS kerst_onderdelen_update ON public.kerst_onderdelen;
CREATE POLICY kerst_onderdelen_update ON public.kerst_onderdelen FOR UPDATE TO authenticated
    USING      (organization_id IN (SELECT private.user_org_ids()))
    WITH CHECK (organization_id IN (SELECT private.user_org_ids()));
DROP POLICY IF EXISTS kerst_onderdelen_delete ON public.kerst_onderdelen;
CREATE POLICY kerst_onderdelen_delete ON public.kerst_onderdelen FOR DELETE TO authenticated
    USING (organization_id IN (SELECT private.user_org_ids()));

-- ── 5. Geen maximum per afhaaldag voor de Kerst-Box ─────────────────────────
-- Besluit Mathijs, 5 oktober 2026: onbeperkt. Wie later toch een grens wil,
-- zet die per dag in Webshop → Momenten.
UPDATE public.winkel_momenten SET capaciteit = NULL WHERE groep = 'kerst-box' AND capaciteit IS NOT NULL;

-- ── 6. Verificatie ──────────────────────────────────────────────────────────
--   SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname IN ('winkel_orders_betaalwijze_check','winkel_orders_status_check');
--   SELECT column_name FROM information_schema.columns WHERE table_name = 'winkel_orders' AND column_name IN ('lead_id','aantal_onzeker','navraag_verstuurd_at','herinnering_verstuurd_at','geannuleerd_at');  -- 5
--   SELECT count(*) FROM pg_policies WHERE tablename = 'kerst_onderdelen';  -- 4
--   SELECT datum, capaciteit FROM winkel_momenten WHERE groep = 'kerst-box' ORDER BY datum;  -- capaciteit leeg
