-- ════════════════════════════════════════════════════════════════════════════
--  Migration — arrangementen (Zelf offerte samenstellen)
--
--  De Lead Funnel had tot nu toe één publieke ingang: het korte
--  aanvraagformulier (/aanvraag/[slug] → leads, source='public_form'). Dat is
--  "snelcontact": gegevens achterlaten, wachten op reactie.
--
--  Deze migratie introduceert de TWEEDE ingang — "Zelf offerte samenstellen":
--  een publieke arrangement-configurator waar de klant zelf per categorie een
--  niveau kiest (Simpel / Medium / Best-of) en DIRECT een indicatieprijs ziet.
--  De cateraar bezit de inhoud; het systeem bezit de lay-out.
--
--    arrangement   (cateraar heeft er ≥1, publiek)  naam, gasten_default, actief, publiek
--      └─ categorie (vrij benoembaar)                naam, icon, hint, volgorde
--           └─ niveau (max 3; medium = populair)     naam, indicatie_prijs_pp, items[], volgorde
--
--    klant kiest → lead (source='arrangement')
--      leads.menu_selectie        = zelfstandige snapshot van de keuze
--      leads.menu_prijs_indicatie = pp × gasten  (potentiële omzet voor triage)
--
--  Multi-tenant: élke tabel org-gescoped met RLS (private.user_org_ids()) + index
--  op organization_id. De cateraar beheert via authenticated-policies; de PUBLIEKE
--  lees-/schrijfkant gaat via de SERVICE-ROLE client (zie
--  src/app/api/public-arrangement/[slug]) — net als /aanvraag, /q en de bon-share.
--  Daarom GEEN `TO anon`-policy (anon-policies zijn hier anti-patroon).
--
--  Hard rules:
--   • Prijs is DETERMINISTISCH, nooit AI-afgeleid: pp = Σ gekozen_niveau.prijs_pp,
--     richtprijs = pp × gasten. indicatie_prijs_pp is door de cateraar ingesteld
--     en aanpasbaar; de ECHTE prijs blijft mensenwerk in de offerte.
--   • organization_id is op alle drie de tabellen gedenormaliseerd zodat de
--     RLS-policy + index op één kolom werken (consistent met de "index op de
--     policy-kolom"-regel) — i.p.v. recursieve joins naar de ouder.
--   • RLS via private.user_org_ids() — exact gespiegeld van 20260601130000_leads.sql.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. arrangementen ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.arrangementen (
    id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id   UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,

    naam              TEXT        NOT NULL,
    slug              TEXT,                 -- optioneel: per-arrangement deep-link / embed (toekomst)
    gasten_default    INTEGER     NOT NULL DEFAULT 50 CHECK (gasten_default >= 1),
    actief            BOOLEAN     NOT NULL DEFAULT true,
    publiek           BOOLEAN     NOT NULL DEFAULT true,
    volgorde          INTEGER     NOT NULL DEFAULT 0,

    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE  public.arrangementen IS 'Publieke arrangement-configurator ("Zelf offerte samenstellen"). Cateraar heeft er ≥1; de publieke pagina /arrangement/[org-slug] toont het primaire actieve+publieke arrangement.';
COMMENT ON COLUMN public.arrangementen.slug IS 'Optionele per-arrangement slug voor toekomstige deep-links/embed. Publieke resolve gaat v1 via organizations.slug → primair arrangement.';

CREATE INDEX IF NOT EXISTS arrangementen_org_idx        ON public.arrangementen(organization_id);
CREATE INDEX IF NOT EXISTS arrangementen_org_actief_idx ON public.arrangementen(organization_id, actief, publiek, volgorde);
CREATE UNIQUE INDEX IF NOT EXISTS arrangementen_org_slug_uidx ON public.arrangementen(organization_id, slug) WHERE slug IS NOT NULL;

-- ── 2. arrangement_categorieen ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.arrangement_categorieen (
    id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    arrangement_id    UUID        NOT NULL REFERENCES public.arrangementen(id) ON DELETE CASCADE,
    organization_id   UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,

    naam              TEXT        NOT NULL,
    icon              TEXT        NOT NULL DEFAULT 'utensils',  -- icoon-naam uit de page-icon-set
    hint              TEXT,
    volgorde          INTEGER     NOT NULL DEFAULT 0,

    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE  public.arrangement_categorieen IS 'Vrij benoembare categorie binnen een arrangement ("Borrelhapjes", "Hoofdgerecht", "Dranken", "Dessert"). Eén categorie = één stap in de configurator.';
COMMENT ON COLUMN public.arrangement_categorieen.icon IS 'Icoon-naam uit de configurator-icon-set (sparkles/flame/glass/cake/utensils/...).';

CREATE INDEX IF NOT EXISTS arr_cat_org_idx ON public.arrangement_categorieen(organization_id);
CREATE INDEX IF NOT EXISTS arr_cat_arr_idx ON public.arrangement_categorieen(arrangement_id, volgorde);

-- ── 3. categorie_niveaus ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.categorie_niveaus (
    id                  UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    categorie_id        UUID          NOT NULL REFERENCES public.arrangement_categorieen(id) ON DELETE CASCADE,
    organization_id     UUID          NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,

    naam                TEXT          NOT NULL,                       -- Simpel / Medium / Best-of (vrij)
    indicatie_prijs_pp  NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (indicatie_prijs_pp >= 0),
    items               JSONB         NOT NULL DEFAULT '[]'::jsonb,   -- array vrije-tekst regels ("5× frisdrank, 1 pils")
    populair            BOOLEAN       NOT NULL DEFAULT false,         -- middelste niveau = "Populairst"
    volgorde            INTEGER       NOT NULL DEFAULT 0,

    created_at          TIMESTAMPTZ   NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ   NOT NULL DEFAULT now()
);

COMMENT ON TABLE  public.categorie_niveaus IS 'Niveau binnen een categorie (max 3 in de UI). indicatie_prijs_pp is door de cateraar ingesteld + aanpasbaar; NOOIT AI-afgeleid. De echte prijs blijft mensenwerk in de offerte.';
COMMENT ON COLUMN public.categorie_niveaus.items IS 'JSONB-array vrije-tekst regels die tonen wat het niveau inhoudt. Geen allergenen/BTW/hoeveelheden — puur presentatie.';

CREATE INDEX IF NOT EXISTS niveau_org_idx ON public.categorie_niveaus(organization_id);
CREATE INDEX IF NOT EXISTS niveau_cat_idx ON public.categorie_niveaus(categorie_id, volgorde);

-- ── 4. RLS — operator-CRUD (publiek gaat via service-role, geen anon) ─────────
ALTER TABLE public.arrangementen           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.arrangement_categorieen ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categorie_niveaus       ENABLE ROW LEVEL SECURITY;

-- arrangementen
DROP POLICY IF EXISTS arrangementen_select ON public.arrangementen;
CREATE POLICY arrangementen_select ON public.arrangementen
    FOR SELECT TO authenticated
    USING (organization_id IN (SELECT private.user_org_ids()));
DROP POLICY IF EXISTS arrangementen_insert ON public.arrangementen;
CREATE POLICY arrangementen_insert ON public.arrangementen
    FOR INSERT TO authenticated
    WITH CHECK (organization_id IN (SELECT private.user_org_ids()));
DROP POLICY IF EXISTS arrangementen_update ON public.arrangementen;
CREATE POLICY arrangementen_update ON public.arrangementen
    FOR UPDATE TO authenticated
    USING      (organization_id IN (SELECT private.user_org_ids()))
    WITH CHECK (organization_id IN (SELECT private.user_org_ids()));
DROP POLICY IF EXISTS arrangementen_delete ON public.arrangementen;
CREATE POLICY arrangementen_delete ON public.arrangementen
    FOR DELETE TO authenticated
    USING (organization_id IN (SELECT private.user_org_ids()));

-- arrangement_categorieen
DROP POLICY IF EXISTS arr_cat_select ON public.arrangement_categorieen;
CREATE POLICY arr_cat_select ON public.arrangement_categorieen
    FOR SELECT TO authenticated
    USING (organization_id IN (SELECT private.user_org_ids()));
DROP POLICY IF EXISTS arr_cat_insert ON public.arrangement_categorieen;
CREATE POLICY arr_cat_insert ON public.arrangement_categorieen
    FOR INSERT TO authenticated
    WITH CHECK (organization_id IN (SELECT private.user_org_ids()));
DROP POLICY IF EXISTS arr_cat_update ON public.arrangement_categorieen;
CREATE POLICY arr_cat_update ON public.arrangement_categorieen
    FOR UPDATE TO authenticated
    USING      (organization_id IN (SELECT private.user_org_ids()))
    WITH CHECK (organization_id IN (SELECT private.user_org_ids()));
DROP POLICY IF EXISTS arr_cat_delete ON public.arrangement_categorieen;
CREATE POLICY arr_cat_delete ON public.arrangement_categorieen
    FOR DELETE TO authenticated
    USING (organization_id IN (SELECT private.user_org_ids()));

-- categorie_niveaus
DROP POLICY IF EXISTS niveau_select ON public.categorie_niveaus;
CREATE POLICY niveau_select ON public.categorie_niveaus
    FOR SELECT TO authenticated
    USING (organization_id IN (SELECT private.user_org_ids()));
DROP POLICY IF EXISTS niveau_insert ON public.categorie_niveaus;
CREATE POLICY niveau_insert ON public.categorie_niveaus
    FOR INSERT TO authenticated
    WITH CHECK (organization_id IN (SELECT private.user_org_ids()));
DROP POLICY IF EXISTS niveau_update ON public.categorie_niveaus;
CREATE POLICY niveau_update ON public.categorie_niveaus
    FOR UPDATE TO authenticated
    USING      (organization_id IN (SELECT private.user_org_ids()))
    WITH CHECK (organization_id IN (SELECT private.user_org_ids()));
DROP POLICY IF EXISTS niveau_delete ON public.categorie_niveaus;
CREATE POLICY niveau_delete ON public.categorie_niveaus
    FOR DELETE TO authenticated
    USING (organization_id IN (SELECT private.user_org_ids()));

-- ── 5. updated_at triggers (hergebruik public.set_updated_at) ─────────────────
DROP TRIGGER IF EXISTS trg_arrangementen_updated_at ON public.arrangementen;
CREATE TRIGGER trg_arrangementen_updated_at
    BEFORE UPDATE ON public.arrangementen
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_arr_cat_updated_at ON public.arrangement_categorieen;
CREATE TRIGGER trg_arr_cat_updated_at
    BEFORE UPDATE ON public.arrangement_categorieen
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_niveau_updated_at ON public.categorie_niveaus;
CREATE TRIGGER trg_niveau_updated_at
    BEFORE UPDATE ON public.categorie_niveaus
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── 6. leads — keuze-snapshot + indicatie-omzet (additief, nullable) ──────────
ALTER TABLE public.leads
    ADD COLUMN IF NOT EXISTS menu_selectie        JSONB,
    ADD COLUMN IF NOT EXISTS menu_prijs_indicatie NUMERIC(10,2);

COMMENT ON COLUMN public.leads.menu_selectie IS 'Zelfstandige snapshot van de configurator-keuze: {arrangement_naam, gasten, pp, regels:[{categorie, niveau, prijs_pp, items[]}]}. Bewust gedenormaliseerd (audit-trail van wat de klant zag) — geen FK naar arrangementen.';
COMMENT ON COLUMN public.leads.menu_prijs_indicatie IS 'Indicatie-omzet = pp × gasten op het moment van aanvragen. Voor triage in /verkoop/leads. Niet bindend; de echte prijs volgt in de offerte.';

-- bron='arrangement' toelaten naast public_form/manual/klantgesprek
ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_source_check;
ALTER TABLE public.leads ADD  CONSTRAINT leads_source_check
    CHECK (source IN ('public_form','manual','klantgesprek','arrangement'));

-- ── 7. Seed — Hop & Bites demo-arrangement (idempotent, slug-guarded) ─────────
--   Uitsluitend voor de demo-tenant en alleen als die nog géén arrangement heeft.
--   Inhoud 1-op-1 uit het v3-ontwerp (cfg-data.jsx).
DO $seed$
DECLARE
    v_org UUID;
    v_arr UUID;
    v_cat UUID;
BEGIN
    SELECT id INTO v_org FROM public.organizations WHERE slug = 'hop-en-bites' LIMIT 1;
    IF v_org IS NULL THEN RETURN; END IF;
    IF EXISTS (SELECT 1 FROM public.arrangementen WHERE organization_id = v_org) THEN RETURN; END IF;

    INSERT INTO public.arrangementen (organization_id, naam, slug, gasten_default, actief, publiek, volgorde)
    VALUES (v_org, 'BBQ Arrangement', 'bbq-arrangement', 80, true, true, 0)
    RETURNING id INTO v_arr;

    -- Borrelhapjes
    INSERT INTO public.arrangement_categorieen (arrangement_id, organization_id, naam, icon, hint, volgorde)
    VALUES (v_arr, v_org, 'Borrelhapjes', 'sparkles', 'Voor de ontvangst — terwijl de smoker op temperatuur komt.', 0)
    RETURNING id INTO v_cat;
    INSERT INTO public.categorie_niveaus (categorie_id, organization_id, naam, indicatie_prijs_pp, items, populair, volgorde) VALUES
        (v_cat, v_org, 'Simpel',  4.5,  '["Olijven, noten & zoutjes","Stokbrood met kruidenboter","2 warme hapjes p.p."]'::jsonb, false, 0),
        (v_cat, v_org, 'Medium',  7.5,  '["4 warm & koud hapjes p.p.","Plank met kaas & worst","Gerookte makreel-dip","Bruschetta van het huis"]'::jsonb, true, 1),
        (v_cat, v_org, 'Best-of', 11.5, '["6 chef-hapjes p.p.","Oester- & ceviche-bar","Gerookte zalm van de smoker","Luxe charcuterieplank","Warme bitterballen"]'::jsonb, false, 2);

    -- Hoofdgerecht
    INSERT INTO public.arrangement_categorieen (arrangement_id, organization_id, naam, icon, hint, volgorde)
    VALUES (v_arr, v_org, 'Hoofdgerecht', 'flame', 'Het hart van de BBQ — low & slow, langzaam gerookt.', 1)
    RETURNING id INTO v_cat;
    INSERT INTO public.categorie_niveaus (categorie_id, organization_id, naam, indicatie_prijs_pp, items, populair, volgorde) VALUES
        (v_cat, v_org, 'Simpel',  13.5, '["Pulled pork van de smoker","Verse broodjes & coleslaw","2 huisgemaakte sauzen"]'::jsonb, false, 0),
        (v_cat, v_org, 'Medium',  19.5, '["3 soorten low & slow vlees","Brisket, pulled pork & worst","Warme & koude salades","Gepofte aardappel met kruidenboter","Vega-optie: gegrilde halloumi"]'::jsonb, true, 1),
        (v_cat, v_org, 'Best-of', 27.5, '["Chef aan de smoker, live","Beef short rib & tomahawk","Gerookte zalmzijde","Seizoensgroenten van de grill","Luxe salade-buffet","Vega-special op maat"]'::jsonb, false, 2);

    -- Dranken
    INSERT INTO public.arrangement_categorieen (arrangement_id, organization_id, naam, icon, hint, volgorde)
    VALUES (v_arr, v_org, 'Dranken', 'glass', 'Onbeperkt schenken gedurende het event.', 2)
    RETURNING id INTO v_cat;
    INSERT INTO public.categorie_niveaus (categorie_id, organization_id, naam, indicatie_prijs_pp, items, populair, volgorde) VALUES
        (v_cat, v_org, 'Simpel',  6,    '["Frisdrank & water onbeperkt","Koffie & thee","Huiswijn & tapbier (3 uur)"]'::jsonb, false, 0),
        (v_cat, v_org, 'Medium',  9.5,  '["Fris, water, sappen","Wijn, tapbier & speciaalbier","Koffie, thee & frisdrank (5 uur)","Welkomstdrankje bij aankomst"]'::jsonb, true, 1),
        (v_cat, v_org, 'Best-of', 14.5, '["Volledig open bar","Wijnselectie & speciaalbieren","2 signature cocktails","Barista-koffie & verse sappen","Eigen barman ter plaatse"]'::jsonb, false, 2);

    -- Dessert
    INSERT INTO public.arrangement_categorieen (arrangement_id, organization_id, naam, icon, hint, volgorde)
    VALUES (v_arr, v_org, 'Dessert', 'cake', 'Zoete afsluiter — optioneel, maar geliefd.', 3)
    RETURNING id INTO v_cat;
    INSERT INTO public.categorie_niveaus (categorie_id, organization_id, naam, indicatie_prijs_pp, items, populair, volgorde) VALUES
        (v_cat, v_org, 'Simpel',  3.5, '["Huisgemaakte brownie","Vers seizoensfruit"]'::jsonb, false, 0),
        (v_cat, v_org, 'Medium',  6,   '["Dessertbar met 3 zoetigheden","Cheesecake & chocolademousse","Vers fruit & slagroom"]'::jsonb, true, 1),
        (v_cat, v_org, 'Best-of', 9,   '["Uitgebreide dessert-tafel","Gerookte ananas van de BBQ","Mini-patisserie & macarons","S''mores-station bij het vuur"]'::jsonb, false, 2);
END
$seed$;
