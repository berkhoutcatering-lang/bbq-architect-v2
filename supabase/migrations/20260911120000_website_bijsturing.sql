-- ════════════════════════════════════════════════════════════════════════════
--  Website bijsturen — blok B1 uit BOUWBRIEF-BEHEERSCHERM.md (website-repo)
-- ════════════════════════════════════════════════════════════════════════════
--
--  Vier dingen die per dag of per week wisselen en dus niet in een commit van
--  hopbites.nl thuishoren: de winkel vandaag dicht, afwijkende openingstijden,
--  het weekaanbod, en welke producten tijdelijk op zijn. Mathijs zet ze hier
--  om, vanaf zijn telefoon; de site leest ze via /api/public-bijsturing/{slug}.
--
--  Twee tabellen:
--    website_bijsturing      één rij per organisatie: sluiting, weekaanbod,
--                            uitverkocht. Een lege rij is de normale toestand.
--    website_openingstijden  één rij per afwijkende dag. Wat er niet in staat
--                            is "niets bijzonders", niet "dicht".
--
--  Wat hier NIET staat, met opzet:
--    • geen fasen (winkel open, alcohol vrij, webshop aan). Die zijn besluiten
--      en staan in git, aan de kant van de site — met een test op bier_wijn.
--      De bijsturing kan alleen dichtdoen, nooit opendoen.
--    • geen productlijnen. De site kent haar eigen slugs; hier staan ze als
--      tekst en de site filtert wat ze niet kent of wat niet op 'aan' staat.
--    • geen verlopen-opruiming. Een sluiting die voorbij is blijft staan tot
--      hij vervangen wordt; de route geeft hem niet meer door en de site
--      negeert hem óók. Twee keer wantrouwen is hier de bedoeling.
-- ════════════════════════════════════════════════════════════════════════════


-- ── 0. Pre-flight ───────────────────────────────────────────────────────────
DO $$
BEGIN
    IF to_regclass('public.organizations') IS NULL THEN
        RAISE EXCEPTION 'website_bijsturing: tabel public.organizations ontbreekt';
    END IF;
    IF to_regprocedure('private.user_org_ids()') IS NULL THEN
        RAISE EXCEPTION 'website_bijsturing: functie private.user_org_ids() ontbreekt';
    END IF;
    IF to_regprocedure('public.set_updated_at()') IS NULL THEN
        RAISE EXCEPTION 'website_bijsturing: functie public.set_updated_at() ontbreekt';
    END IF;
END $$;


-- ── 1. website_bijsturing ───────────────────────────────────────────────────
-- Een CHECK mag geen subquery bevatten; een IMMUTABLE functie wel.
CREATE OR REPLACE FUNCTION public.website_slugs_geldig(slugs TEXT[])
RETURNS BOOLEAN
LANGUAGE sql IMMUTABLE STRICT
AS $$
    SELECT COALESCE(bool_and(s ~ '^[a-z0-9-]{1,60}$'), true) FROM unnest(slugs) AS s;
$$;

-- De maxima op de teksten zijn dezelfde als die de site hanteert bij het
-- schoonmaken (lib/bijsturing.ts daar): 160, 80 en 400. Een reden van drie
-- alinea's past niet in een balk bovenaan de pagina.
CREATE TABLE IF NOT EXISTS public.website_bijsturing (
    organization_id       UUID        PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,

    -- Vandaag dicht. Beide leeg = niet dicht.
    sluiting_reden        TEXT        CHECK (sluiting_reden IS NULL OR char_length(sluiting_reden) <= 160),
    sluiting_tot          TIMESTAMPTZ,
    sluiting_actief       BOOLEAN     NOT NULL DEFAULT false,

    -- Het weekaanbod. Zonder periode is er geen aanbod.
    weekaanbod_van        DATE,
    weekaanbod_tot        DATE,
    weekaanbod_titel      TEXT        CHECK (weekaanbod_titel IS NULL OR char_length(weekaanbod_titel) <= 80),
    weekaanbod_tekst      TEXT        CHECK (weekaanbod_tekst IS NULL OR char_length(weekaanbod_tekst) <= 400),
    weekaanbod_producten  TEXT[]      NOT NULL DEFAULT '{}',

    -- Slugs van productlijnen op de site die tijdelijk op zijn.
    uitverkocht           TEXT[]      NOT NULL DEFAULT '{}',

    updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT website_bijsturing_weekaanbod_periode CHECK (
        (weekaanbod_van IS NULL AND weekaanbod_tot IS NULL)
        OR (weekaanbod_van IS NOT NULL AND weekaanbod_tot IS NOT NULL AND weekaanbod_van <= weekaanbod_tot)
    ),
    -- Slugs zoals de site ze kent: kleine letters, cijfers en koppeltekens.
    CONSTRAINT website_bijsturing_slugs CHECK (
        public.website_slugs_geldig(weekaanbod_producten) AND public.website_slugs_geldig(uitverkocht)
    )
);

DROP TRIGGER IF EXISTS website_bijsturing_updated_at ON public.website_bijsturing;
CREATE TRIGGER website_bijsturing_updated_at
    BEFORE UPDATE ON public.website_bijsturing
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- ── 2. website_openingstijden ───────────────────────────────────────────────
-- Eén rij per dag die afwijkt van het normale rooster. Gesloten = geen tijden;
-- open = beide tijden. Een halve invoer bestaat niet.
CREATE TABLE IF NOT EXISTS public.website_openingstijden (
    id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id       UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    datum                 DATE        NOT NULL,
    van                   TIME,
    tot                   TIME,
    gesloten              BOOLEAN     NOT NULL DEFAULT false,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT website_openingstijden_dag_uniek UNIQUE (organization_id, datum),
    CONSTRAINT website_openingstijden_heel CHECK (
        (gesloten AND van IS NULL AND tot IS NULL)
        OR (NOT gesloten AND van IS NOT NULL AND tot IS NOT NULL AND van < tot)
    )
);

CREATE INDEX IF NOT EXISTS website_openingstijden_org_datum
    ON public.website_openingstijden (organization_id, datum);


-- ── 3. RLS ──────────────────────────────────────────────────────────────────
-- Zelfde patroon als de bestelstroom: ingelogde leden van de organisatie mogen
-- alles; de publieke route leest met de service-role en heeft geen policy
-- nodig. Anon-policies zijn in deze repo een anti-patroon.
ALTER TABLE public.website_bijsturing     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.website_openingstijden ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
    t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY['website_bijsturing','website_openingstijden']
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_select', t);
        EXECUTE format(
            'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated
             USING (organization_id IN (SELECT private.user_org_ids()))', t || '_select', t);

        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_insert', t);
        EXECUTE format(
            'CREATE POLICY %I ON public.%I FOR INSERT TO authenticated
             WITH CHECK (organization_id IN (SELECT private.user_org_ids()))', t || '_insert', t);

        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_update', t);
        EXECUTE format(
            'CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated
             USING      (organization_id IN (SELECT private.user_org_ids()))
             WITH CHECK (organization_id IN (SELECT private.user_org_ids()))', t || '_update', t);

        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_delete', t);
        EXECUTE format(
            'CREATE POLICY %I ON public.%I FOR DELETE TO authenticated
             USING (organization_id IN (SELECT private.user_org_ids()))', t || '_delete', t);
    END LOOP;
END $$;


-- ── 4. Verificatie na het draaien ───────────────────────────────────────────
--
--   SELECT tablename, count(*) FROM pg_policies
--    WHERE schemaname='public'
--      AND tablename IN ('website_bijsturing','website_openingstijden')
--    GROUP BY tablename;
--   -- Verwacht: 4 per tabel.
