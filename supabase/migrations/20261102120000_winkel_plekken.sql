-- ════════════════════════════════════════════════════════════════════════════
--  Winkelvloer, eerste stap: plekken in de winkel en wat daar staat
--  Plan: docs/context/winkel-aanbod-en-vloer-plan.md, fase 3 (tak feat/catalogus-op-main)
-- ════════════════════════════════════════════════════════════════════════════
--
--  Het verhaal
--    De winkel aan de Tramstraat krijgt afdelingen: Bier, Wijn, Nootjes,
--    Kazen en Vlees (slager). Elk product staat ergens; het bier staat bij
--    Bier. Later komen daar meubels en planken onder (ruimte → afdeling →
--    vitrine/stelling → plank), en nog later een getekende plattegrond.
--
--  Wat erbij komt
--    1. opslag_locaties (de koelkastlades van de makerij) krijgt een ouder
--       (parent_id), de soorten ruimte, afdeling, vitrine, stelling, kast en
--       vrieskist, en de velden bewaren, foto_url en een lege plan-kolom voor
--       de latere tekening. materieel_id was al optioneel.
--    2. winkel_plaatsingen: product × plek, met rol (verkoop | showmodel |
--       reserve), volgorde en facings. Dit is presentatie, geen voorraad: de
--       voorraad blijft één getal per product via winkel_muteer_voorraad.
--
--  Wat er niet verandert
--    Bestaande lades, deurvakken en zones houden hun soort en hebben geen
--    ouder. Niets in de code van de makerij leest parent_id.
--
--  Veiligheid
--    Zelfde RLS als opslag_locaties (private.user_org_ids()), alleen voor
--    authenticated. Een trigger bewaakt dat ouder, plek en product bij
--    dezelfde organisatie horen, en dat een plek niet onder zichzelf hangt.
--
--  Toepassen: met de hand, één keer, in BEGIN/COMMIT; nooit db push.

BEGIN;

-- ── 0. Pre-flight ───────────────────────────────────────────────────────────
DO $$
BEGIN
    IF to_regclass('public.opslag_locaties') IS NULL THEN
        RAISE EXCEPTION 'winkel_plekken: opslag_locaties ontbreekt';
    END IF;
    IF to_regclass('public.winkel_producten') IS NULL THEN
        RAISE EXCEPTION 'winkel_plekken: winkel_producten ontbreekt';
    END IF;
    IF to_regprocedure('private.user_org_ids()') IS NULL THEN
        RAISE EXCEPTION 'winkel_plekken: private.user_org_ids ontbreekt';
    END IF;
    IF to_regprocedure('public.set_updated_at()') IS NULL THEN
        RAISE EXCEPTION 'winkel_plekken: set_updated_at ontbreekt';
    END IF;
    IF to_regclass('public.winkel_plaatsingen') IS NOT NULL THEN
        RAISE EXCEPTION 'winkel_plekken: winkel_plaatsingen bestaat al; deze migratie is al gedraaid';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'opslag_locaties_soort_geldig') THEN
        RAISE EXCEPTION 'winkel_plekken: constraint opslag_locaties_soort_geldig niet gevonden (anders dan verwacht)';
    END IF;
END $$;

-- ── 1. opslag_locaties: ouder, meer soorten, winkelvelden ───────────────────
ALTER TABLE public.opslag_locaties
    ADD COLUMN parent_id UUID REFERENCES public.opslag_locaties(id) ON DELETE RESTRICT,
    ADD COLUMN bewaren   TEXT,
    ADD COLUMN foto_url  TEXT,
    ADD COLUMN plan      JSONB;

ALTER TABLE public.opslag_locaties DROP CONSTRAINT opslag_locaties_soort_geldig;
ALTER TABLE public.opslag_locaties ADD CONSTRAINT opslag_locaties_soort_geldig CHECK (soort = ANY (ARRAY[
    'lade', 'deurvak', 'plank', 'zone', 'rooster', 'bak',
    'ruimte', 'afdeling', 'vitrine', 'stelling', 'kast', 'vrieskist'
]));
ALTER TABLE public.opslag_locaties ADD CONSTRAINT opslag_locaties_bewaren_geldig
    CHECK (bewaren IS NULL OR bewaren = ANY (ARRAY['kamertemperatuur', 'koel', 'diepvries']));
ALTER TABLE public.opslag_locaties ADD CONSTRAINT opslag_locaties_niet_eigen_ouder
    CHECK (parent_id IS NULL OR parent_id <> id);

CREATE INDEX idx_opslag_locaties_ouder ON public.opslag_locaties (organization_id, parent_id, volgorde);

-- Ouder van dezelfde organisatie, en geen kring (a onder b onder a).
CREATE OR REPLACE FUNCTION private.opslag_locatie_ouder_bewaken()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_org  UUID;
    v_stap UUID := NEW.parent_id;
    v_n    INT := 0;
BEGIN
    IF NEW.parent_id IS NULL THEN
        RETURN NEW;
    END IF;
    SELECT organization_id INTO v_org FROM public.opslag_locaties WHERE id = NEW.parent_id;
    IF v_org IS DISTINCT FROM NEW.organization_id THEN
        RAISE EXCEPTION 'De bovenliggende plek hoort niet bij deze organisatie' USING ERRCODE = '23514';
    END IF;
    WHILE v_stap IS NOT NULL LOOP
        IF v_stap = NEW.id THEN
            RAISE EXCEPTION 'Een plek kan niet onder zichzelf hangen' USING ERRCODE = '23514';
        END IF;
        v_n := v_n + 1;
        IF v_n > 20 THEN
            RAISE EXCEPTION 'Plekken zijn te diep genest (meer dan 20 lagen)' USING ERRCODE = '23514';
        END IF;
        SELECT parent_id INTO v_stap FROM public.opslag_locaties WHERE id = v_stap;
    END LOOP;
    RETURN NEW;
END $$;

CREATE TRIGGER trg_opslag_locatie_ouder
    BEFORE INSERT OR UPDATE OF parent_id, organization_id ON public.opslag_locaties
    FOR EACH ROW EXECUTE FUNCTION private.opslag_locatie_ouder_bewaken();

-- ── 2. winkel_plaatsingen ───────────────────────────────────────────────────
CREATE TABLE public.winkel_plaatsingen (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    product_id      UUID NOT NULL REFERENCES public.winkel_producten(id) ON DELETE CASCADE,
    locatie_id      UUID NOT NULL REFERENCES public.opslag_locaties(id) ON DELETE CASCADE,
    rol             TEXT NOT NULL DEFAULT 'verkoop' CHECK (rol IN ('verkoop', 'showmodel', 'reserve')),
    volgorde        INTEGER NOT NULL DEFAULT 0,
    facings         INTEGER CHECK (facings IS NULL OR facings > 0),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (product_id, locatie_id, rol)
);

CREATE INDEX idx_winkel_plaatsingen_plek ON public.winkel_plaatsingen (organization_id, locatie_id, volgorde);
CREATE INDEX idx_winkel_plaatsingen_product ON public.winkel_plaatsingen (organization_id, product_id);

CREATE TRIGGER trg_winkel_plaatsingen_updated_at
    BEFORE UPDATE ON public.winkel_plaatsingen
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Product en plek van dezelfde organisatie als de plaatsing.
CREATE OR REPLACE FUNCTION private.winkel_plaatsing_bewaken()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.winkel_producten WHERE id = NEW.product_id AND organization_id = NEW.organization_id) THEN
        RAISE EXCEPTION 'Het product hoort niet bij deze organisatie' USING ERRCODE = '23514';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.opslag_locaties WHERE id = NEW.locatie_id AND organization_id = NEW.organization_id) THEN
        RAISE EXCEPTION 'De plek hoort niet bij deze organisatie' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END $$;

CREATE TRIGGER trg_winkel_plaatsing_bewaken
    BEFORE INSERT OR UPDATE OF organization_id, product_id, locatie_id ON public.winkel_plaatsingen
    FOR EACH ROW EXECUTE FUNCTION private.winkel_plaatsing_bewaken();

ALTER TABLE public.winkel_plaatsingen ENABLE ROW LEVEL SECURITY;

CREATE POLICY winkel_plaatsingen_select ON public.winkel_plaatsingen FOR SELECT TO authenticated
    USING (organization_id IN (SELECT private.user_org_ids()));
CREATE POLICY winkel_plaatsingen_insert ON public.winkel_plaatsingen FOR INSERT TO authenticated
    WITH CHECK (organization_id IN (SELECT private.user_org_ids()));
CREATE POLICY winkel_plaatsingen_update ON public.winkel_plaatsingen FOR UPDATE TO authenticated
    USING (organization_id IN (SELECT private.user_org_ids()))
    WITH CHECK (organization_id IN (SELECT private.user_org_ids()));
CREATE POLICY winkel_plaatsingen_delete ON public.winkel_plaatsingen FOR DELETE TO authenticated
    USING (organization_id IN (SELECT private.user_org_ids()));

REVOKE ALL ON public.winkel_plaatsingen FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.winkel_plaatsingen TO authenticated;
REVOKE ALL ON FUNCTION private.opslag_locatie_ouder_bewaken() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.winkel_plaatsing_bewaken() FROM PUBLIC, anon, authenticated;

COMMIT;
