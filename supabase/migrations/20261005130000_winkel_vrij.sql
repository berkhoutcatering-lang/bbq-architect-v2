-- ════════════════════════════════════════════════════════════════════════════
--  BA-5a — "BA weet wat vrij is": winkel_vrij en voorraad_versie
--  Plan v5, M1 · Contract: hopbites-toonbank/docs/datacontract-toonbank-v1.md §1.8, §1.9
--  Test: supabase/tests/winkel_vrij.sql (alleen op de dev-database)
-- ════════════════════════════════════════════════════════════════════════════
--
--  Vier ideeën:
--    1. Vrij wordt nooit opgeslagen. Per product: ligt er (winkel_producten.
--       voorraad), gereserveerd (precies de regel van winkel_bezetting_product:
--       betaald, of wacht met reservering_tot > now(), en nog niet ingepakt)
--       en vrij = ligt er − gereserveerd. Vrij mag onder nul (dan komt een
--       order tekort, contract §1.9); NULL = niet bijgehouden.
--    2. Per artikel: het kleinste aantal dat uit de onderdelen te maken is
--       (de regel van pakkettenTeMaken in src/lib/winkel/voorraad.ts), en
--       begrensd door het artikelquotum (winkel_artikelen.voorraad minus de
--       regel van winkel_bezetting_voorraad). Een onderdeel dat niet wordt
--       bijgehouden begrenst niets; een slot zonder product maakt vrij 0.
--    3. Eén teller per organisatie (winkel_voorraad_versie). Deferred
--       constraint-triggers verhogen hem bij het committen, hooguit één keer
--       per transactie en organisatie. Zo is de teller de laatste lock in elke
--       transactie (geen deadlock met de vaste lockvolgorde uit
--       20261005120100_winkel_lockvolgorde) en zien lezers de nieuwe versie
--       pas samen met de wijziging. De triggers zitten op alles wat ligt er,
--       gereserveerd of vrij raakt: het logboek, orders (nieuw, status,
--       verwijderd), regels (ingepakt, opgehaald), slots, artikelen (nieuw,
--       verwijderd, quotum, te koop, slug), producten (nieuw, verwijderd,
--       voorraad, naam, eenheid) en de grens (20261005130100).
--    4. Een verlopen reservering verandert vrij zonder dat er iets geschreven
--       wordt. Daarom geeft winkel_voorraad_stand ook vrij_verloopt_at: het
--       eerste reservering_tot in de toekomst van een wachtende order. Na dat
--       moment haalt een lezer vrij opnieuw op. Geen cron nodig.
--
--  Rechten: de vier leesfuncties zijn SECURITY INVOKER (RLS geldt) en
--  beginnen toch met private.vereis_org(p_org), zodat een vreemde organisatie
--  een 42501 krijgt in plaats van een stil lege lijst. Niet voor PUBLIC en
--  anon; wel voor authenticated (BA-schermen) en service_role (webshop-API,
--  Toonbank-API). winkel_reserveringen geeft nooit e-mail of telefoon.
--
--  De triggerfunctie is SECURITY DEFINER (authenticated mag de teller alleen
--  lezen) maar heeft geen p_org en geen vereis_org: hij schrijft alleen de
--  teller van de organisatie van de rij die de transactie zelf al mocht
--  wijzigen (RLS of een functie die zelf de org controleert). Een trigger
--  vraagt bij het afgaan geen EXECUTE, dus niemand krijgt EXECUTE.


-- ── 0. Pre-flight ───────────────────────────────────────────────────────────
DO $$
DECLARE
    v_sig       TEXT;
    v_ontbreekt TEXT := '';
BEGIN
    IF (SELECT count(*) FROM pg_roles WHERE rolname IN ('anon', 'authenticated', 'service_role')) <> 3 THEN
        RAISE EXCEPTION 'winkel_vrij: de Supabase-rollen anon, authenticated en service_role ontbreken';
    END IF;

    FOREACH v_sig IN ARRAY ARRAY[
        'private.user_org_ids()',
        'private.vereis_org(uuid)',
        'public.winkel_bezetting_product(uuid, bigint)',
        'public.winkel_bezetting_voorraad(uuid, bigint)',
        'public.winkel_zet_klaargezet(uuid, bigint, boolean)'
    ]
    LOOP
        IF to_regprocedure(v_sig) IS NULL THEN
            v_ontbreekt := v_ontbreekt || E'\n  functie ' || v_sig;
        END IF;
    END LOOP;

    FOREACH v_sig IN ARRAY ARRAY[
        'public.organizations',
        'public.winkel_instellingen',
        'public.winkel_artikelen',
        'public.winkel_artikel_slots',
        'public.winkel_producten',
        'public.winkel_momenten',
        'public.winkel_orders',
        'public.winkel_order_regels',
        'public.winkel_order_regel_componenten',
        'public.winkel_voorraad_mutaties'
    ]
    LOOP
        IF to_regclass(v_sig) IS NULL THEN
            v_ontbreekt := v_ontbreekt || E'\n  tabel ' || v_sig;
        END IF;
    END LOOP;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'winkel_order_regels' AND column_name = 'opgehaald_at') THEN
        v_ontbreekt := v_ontbreekt || E'\n  kolom winkel_order_regels.opgehaald_at (migratie 20260928120100)';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'winkel_order_regels' AND column_name = 'klaar_op') THEN
        v_ontbreekt := v_ontbreekt || E'\n  kolom winkel_order_regels.klaar_op (migratie 20260925120000)';
    END IF;

    IF v_ontbreekt <> '' THEN
        RAISE EXCEPTION 'winkel_vrij: dit ontbreekt (eerst BA-S 20261003150000 en de winkelmigraties; objectproef supabase/checks/verify_winkel_live.sql):%', v_ontbreekt;
    END IF;
END $$;


-- ── 1. winkel_voorraad_versie ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.winkel_voorraad_versie (
    organization_id  UUID        PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
    versie           BIGINT      NOT NULL DEFAULT 0 CHECK (versie >= 0),
    gewijzigd_at     TIMESTAMPTZ
);
COMMENT ON TABLE public.winkel_voorraad_versie IS
    'Eén teller per organisatie: gaat één omhoog per transactie die ligt er, gereserveerd of vrij raakt (deferred constraint-triggers, private.winkel_voorraad_versie_omhoog). Alleen te lezen; schrijven doet alleen de trigger.';
COMMENT ON COLUMN public.winkel_voorraad_versie.gewijzigd_at IS
    'Klokmoment van de laatste verhoging (bij het committen van die transactie).';

ALTER TABLE public.winkel_voorraad_versie ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS winkel_voorraad_versie_select ON public.winkel_voorraad_versie;
CREATE POLICY winkel_voorraad_versie_select ON public.winkel_voorraad_versie FOR SELECT TO authenticated
    USING (organization_id IN (SELECT private.user_org_ids()));

-- Geen schrijfrechten buiten de trigger om (RLS weigert al; dit is de tweede deur).
REVOKE ALL ON TABLE public.winkel_voorraad_versie FROM PUBLIC, anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public.winkel_voorraad_versie FROM authenticated;
GRANT SELECT ON TABLE public.winkel_voorraad_versie TO authenticated, service_role;

-- Een rij voor elke organisatie met een kassa; de trigger maakt de rest aan.
INSERT INTO public.winkel_voorraad_versie (organization_id, versie)
SELECT i.organization_id, 0 FROM public.winkel_instellingen i
ON CONFLICT (organization_id) DO NOTHING;


-- ── 2. De teller omhoog: hooguit één keer per transactie en organisatie ────
-- Draait als deferred constraint-trigger, dus bij het committen. De vlag
-- app.vv_<org zonder streepjes> (set_config met is_local = true) leeft precies
-- één transactie; volgende rijen in dezelfde transactie doen niets meer.
-- Faalt het ophogen toch (bijvoorbeeld een deadlock tussen twee transacties
-- die meerdere organisaties raken), dan alleen een WARNING: de teller mag een
-- betaling of telling nooit laten mislukken. De lezer valt dan terug op
-- vrij_verloopt_at of de volgende wijziging.
CREATE OR REPLACE FUNCTION private.winkel_voorraad_versie_omhoog()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_org  UUID;
    v_vlag TEXT;
BEGIN
    IF TG_OP = 'DELETE' THEN
        v_org := OLD.organization_id;
    ELSE
        v_org := NEW.organization_id;
    END IF;
    IF v_org IS NULL THEN
        RETURN NULL;
    END IF;

    v_vlag := 'app.vv_' || replace(v_org::TEXT, '-', '');
    IF COALESCE(current_setting(v_vlag, true), '') = 'ja' THEN
        RETURN NULL;
    END IF;
    PERFORM set_config(v_vlag, 'ja', true);

    BEGIN
        -- Bestaat de organisatie niet meer (verwijderd in deze transactie,
        -- cascade), dan geen rij: anders breekt de foreign key het verwijderen.
        INSERT INTO public.winkel_voorraad_versie AS v (organization_id, versie, gewijzigd_at)
        SELECT v_org, 1, clock_timestamp()
         WHERE EXISTS (SELECT 1 FROM public.organizations o WHERE o.id = v_org)
        ON CONFLICT (organization_id) DO UPDATE
           SET versie = v.versie + 1,
               gewijzigd_at = EXCLUDED.gewijzigd_at;
    EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'winkel_voorraad_versie niet opgehoogd voor %: % (%)', v_org, SQLERRM, SQLSTATE;
    END;

    RETURN NULL;
END $$;
COMMENT ON FUNCTION private.winkel_voorraad_versie_omhoog() IS
    'Deferred constraint-trigger: verhoogt winkel_voorraad_versie hooguit één keer per transactie en organisatie (vlag app.vv_<org>). Faalt nooit hard.';
REVOKE ALL ON FUNCTION private.winkel_voorraad_versie_omhoog() FROM PUBLIC, anon, authenticated, service_role;

-- CREATE OR REPLACE kan niet voor een constraint-trigger: eerst weg, dan opnieuw.
DROP TRIGGER IF EXISTS trg_winkel_vv_mutaties        ON public.winkel_voorraad_mutaties;
DROP TRIGGER IF EXISTS trg_winkel_vv_order_nieuw     ON public.winkel_orders;
DROP TRIGGER IF EXISTS trg_winkel_vv_order_status    ON public.winkel_orders;
DROP TRIGGER IF EXISTS trg_winkel_vv_order_weg       ON public.winkel_orders;
DROP TRIGGER IF EXISTS trg_winkel_vv_regel_status    ON public.winkel_order_regels;
DROP TRIGGER IF EXISTS trg_winkel_vv_slots           ON public.winkel_artikel_slots;
DROP TRIGGER IF EXISTS trg_winkel_vv_artikel_quotum  ON public.winkel_artikelen;
DROP TRIGGER IF EXISTS trg_winkel_vv_artikel_erbij   ON public.winkel_artikelen;
DROP TRIGGER IF EXISTS trg_winkel_vv_product_erbij   ON public.winkel_producten;
DROP TRIGGER IF EXISTS trg_winkel_vv_product         ON public.winkel_producten;

-- Elke regel in het logboek (telling, ontvangst, verkoop, retour, afwijking, overboeking).
CREATE CONSTRAINT TRIGGER trg_winkel_vv_mutaties
    AFTER INSERT ON public.winkel_voorraad_mutaties
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW EXECUTE FUNCTION private.winkel_voorraad_versie_omhoog();

-- Een nieuwe order (wacht = reservering).
CREATE CONSTRAINT TRIGGER trg_winkel_vv_order_nieuw
    AFTER INSERT ON public.winkel_orders
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW EXECUTE FUNCTION private.winkel_voorraad_versie_omhoog();

-- Een verwijderde order (zijn regels tellen niet meer als gereserveerd).
CREATE CONSTRAINT TRIGGER trg_winkel_vv_order_weg
    AFTER DELETE ON public.winkel_orders
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW EXECUTE FUNCTION private.winkel_voorraad_versie_omhoog();

-- Betaald, verlopen, afgebroken, mislukt, of een verse reservering.
CREATE CONSTRAINT TRIGGER trg_winkel_vv_order_status
    AFTER UPDATE OF status, reservering_tot ON public.winkel_orders
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW
    WHEN (OLD.status IS DISTINCT FROM NEW.status OR OLD.reservering_tot IS DISTINCT FROM NEW.reservering_tot)
    EXECUTE FUNCTION private.winkel_voorraad_versie_omhoog();

-- Ingepakt (klaargezet) of opgehaald.
CREATE CONSTRAINT TRIGGER trg_winkel_vv_regel_status
    AFTER UPDATE OF klaargezet_at, opgehaald_at ON public.winkel_order_regels
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW
    WHEN (OLD.klaargezet_at IS DISTINCT FROM NEW.klaargezet_at OR OLD.opgehaald_at IS DISTINCT FROM NEW.opgehaald_at)
    EXECUTE FUNCTION private.winkel_voorraad_versie_omhoog();

-- Het template: welk product, hoeveel per pakket.
CREATE CONSTRAINT TRIGGER trg_winkel_vv_slots
    AFTER INSERT OR UPDATE OR DELETE ON public.winkel_artikel_slots
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW EXECUTE FUNCTION private.winkel_voorraad_versie_omhoog();

-- Het artikelquotum, of het artikel te koop is en onder welke slug
-- (winkel_vrij_artikelen en de beschikbaarheid voor de website hangen ervan af).
CREATE CONSTRAINT TRIGGER trg_winkel_vv_artikel_quotum
    AFTER UPDATE OF voorraad, actief, publiek, slug ON public.winkel_artikelen
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW
    WHEN (OLD.voorraad IS DISTINCT FROM NEW.voorraad OR OLD.actief IS DISTINCT FROM NEW.actief
          OR OLD.publiek IS DISTINCT FROM NEW.publiek OR OLD.slug IS DISTINCT FROM NEW.slug)
    EXECUTE FUNCTION private.winkel_voorraad_versie_omhoog();

-- Een nieuw of verwijderd artikel (een regel meer of minder in winkel_vrij_artikelen).
CREATE CONSTRAINT TRIGGER trg_winkel_vv_artikel_erbij
    AFTER INSERT OR DELETE ON public.winkel_artikelen
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW EXECUTE FUNCTION private.winkel_voorraad_versie_omhoog();

-- Een nieuw of verwijderd product (een regel meer of minder in winkel_vrij_producten).
CREATE CONSTRAINT TRIGGER trg_winkel_vv_product_erbij
    AFTER INSERT OR DELETE ON public.winkel_producten
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW EXECUTE FUNCTION private.winkel_voorraad_versie_omhoog();

-- Een product wijzigt in wat winkel_vrij_producten laat zien: naam, eenheid
-- of ligt er. De voorraad verandert alleen via het logboek (WV003 bewaakt
-- dat) en telt daar al mee; in dezelfde transactie blijft het één keer.
-- Andere kolommen (prijs, foto, drempel, …) raken vrij niet.
CREATE CONSTRAINT TRIGGER trg_winkel_vv_product
    AFTER UPDATE OF voorraad, naam, eenheid ON public.winkel_producten
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW
    WHEN (OLD.voorraad IS DISTINCT FROM NEW.voorraad OR OLD.naam IS DISTINCT FROM NEW.naam OR OLD.eenheid IS DISTINCT FROM NEW.eenheid)
    EXECUTE FUNCTION private.winkel_voorraad_versie_omhoog();


-- ── 3. winkel_vrij_producten ────────────────────────────────────────────────
-- Set-gebaseerd: één query voor de hele organisatie, in plaats van een
-- aanroep van winkel_bezetting_product per product. "gereserveerd" is
-- letterlijk dezelfde regel (supabase/tests/winkel_vrij.sql bewaakt dat).
CREATE OR REPLACE FUNCTION public.winkel_vrij_producten(p_org UUID)
RETURNS TABLE (
    product_id    UUID,
    naam          TEXT,
    eenheid       TEXT,
    ligt_er       NUMERIC,
    gereserveerd  NUMERIC,
    vrij          NUMERIC,
    bijgehouden   BOOLEAN
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
    PERFORM private.vereis_org(p_org);

    RETURN QUERY
    WITH bezet AS (
        SELECT c.product_id AS pid, SUM(c.hoeveelheid)::NUMERIC AS n
          FROM public.winkel_order_regel_componenten c
          JOIN public.winkel_order_regels r ON r.id = c.order_regel_id
          JOIN public.winkel_orders o ON o.id = r.order_id
         WHERE c.product_id IN (SELECT wp.id FROM public.winkel_producten wp WHERE wp.organization_id = p_org)
           AND r.klaargezet_at IS NULL
           AND (o.status = 'betaald' OR (o.status = 'wacht' AND o.reservering_tot > now()))
         GROUP BY c.product_id
    )
    SELECT p.id,
           p.naam,
           p.eenheid,
           p.voorraad,
           COALESCE(b.n, 0)::NUMERIC,
           CASE WHEN p.voorraad IS NULL THEN NULL ELSE p.voorraad - COALESCE(b.n, 0) END,
           p.voorraad IS NOT NULL
      FROM public.winkel_producten p
      LEFT JOIN bezet b ON b.pid = p.id
     WHERE p.organization_id = p_org
     ORDER BY p.naam, p.id;
END $$;
COMMENT ON FUNCTION public.winkel_vrij_producten(UUID) IS
    'Per product: ligt er (voorraad), gereserveerd (= winkel_bezetting_product), vrij = ligt er − gereserveerd (mag onder nul; NULL = niet bijgehouden). Eén query voor de hele organisatie.';
REVOKE ALL ON FUNCTION public.winkel_vrij_producten(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.winkel_vrij_producten(UUID) TO authenticated, service_role;


-- ── 4. winkel_vrij_artikelen ────────────────────────────────────────────────
-- vrij = het kleinste van:
--   uit de onderdelen  floor(vrij product ÷ wat één stuk vraagt), ≥ 0, het
--                      kleinste over de bijgehouden producten in de slots
--                      (geen slots of niets bijgehouden: geen grens; een slot
--                      zonder product: 0);
--   het quotum         winkel_artikelen.voorraad − (betaald + lopende
--                      reserveringen, ook ingepakt), ≥ 0 (NULL: geen grens).
-- NULL = geen enkele grens bekend (bijgehouden = false).
-- beperkend_product_id: het product dat het eerst op is, als de onderdelen de
-- grens zijn (bij gelijkstand het eerste slot); NULL als het quotum strenger
-- is, als een slot leeg is, of als er geen grens is.
CREATE OR REPLACE FUNCTION public.winkel_vrij_artikelen(p_org UUID)
RETURNS TABLE (
    artikel_id            UUID,
    slug                  TEXT,
    vrij                  INTEGER,
    beperkend_product_id  UUID,
    bijgehouden           BOOLEAN
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
    PERFORM private.vereis_org(p_org);

    RETURN QUERY
    WITH art AS (
        SELECT a.id AS aid, a.slug AS aslug, a.voorraad AS quotum
          FROM public.winkel_artikelen a
         WHERE a.organization_id = p_org
    ),
    prod AS (
        SELECT vp.product_id AS pid, vp.vrij AS pvrij
          FROM public.winkel_vrij_producten(p_org) vp
    ),
    leeg AS (
        SELECT DISTINCT s.artikel_id AS aid
          FROM public.winkel_artikel_slots s
          JOIN art ON art.aid = s.artikel_id
         WHERE s.standaard_product_id IS NULL
    ),
    vraag AS (
        SELECT s.artikel_id AS aid, s.standaard_product_id AS pid,
               SUM(s.hoeveelheid) AS per_stuk, MIN(s.volgorde) AS eerste
          FROM public.winkel_artikel_slots s
          JOIN art ON art.aid = s.artikel_id
         WHERE s.standaard_product_id IS NOT NULL
         GROUP BY s.artikel_id, s.standaard_product_id
    ),
    per_product AS (
        SELECT q.aid, q.pid, q.eerste,
               floor(round(pr.pvrij / q.per_stuk, 3)) AS n
          FROM vraag q
          JOIN prod pr ON pr.pid = q.pid
         WHERE pr.pvrij IS NOT NULL
    ),
    onderdelen AS (
        SELECT DISTINCT ON (pp.aid) pp.aid, pp.pid, pp.n
          FROM per_product pp
         ORDER BY pp.aid, pp.n, pp.eerste, pp.pid
    ),
    quotum_bezet AS (
        SELECT r.artikel_id AS aid, SUM(r.voorraad_eenheden)::NUMERIC AS n
          FROM public.winkel_order_regels r
          JOIN public.winkel_orders o ON o.id = r.order_id
         WHERE r.artikel_id IN (SELECT art.aid FROM art WHERE art.quotum IS NOT NULL)
           AND (o.status = 'betaald' OR (o.status = 'wacht' AND o.reservering_tot > now()))
         GROUP BY r.artikel_id
    ),
    grenzen AS (
        SELECT art.aid, art.aslug,
               CASE WHEN l.aid IS NOT NULL THEN 0::NUMERIC
                    WHEN od.aid IS NULL THEN NULL
                    ELSE GREATEST(od.n, 0) END                                   AS uit_onderdelen,
               CASE WHEN art.quotum IS NULL THEN NULL
                    ELSE GREATEST(art.quotum - COALESCE(qb.n, 0), 0) END          AS uit_quotum,
               CASE WHEN l.aid IS NULL THEN od.pid END                           AS kandidaat
          FROM art
          LEFT JOIN leeg l          ON l.aid = art.aid
          LEFT JOIN onderdelen od   ON od.aid = art.aid
          LEFT JOIN quotum_bezet qb ON qb.aid = art.aid
    )
    SELECT g.aid,
           g.aslug,
           LEAST(g.uit_onderdelen, g.uit_quotum)::INTEGER,
           CASE WHEN g.kandidaat IS NOT NULL AND (g.uit_quotum IS NULL OR g.uit_onderdelen <= g.uit_quotum)
                THEN g.kandidaat END,
           (g.uit_onderdelen IS NOT NULL OR g.uit_quotum IS NOT NULL)
      FROM grenzen g
     ORDER BY g.aslug, g.aid;
END $$;
COMMENT ON FUNCTION public.winkel_vrij_artikelen(UUID) IS
    'Per artikel: hoeveel er nog te verkopen is = het kleinste van de onderdelen (pakkettenTeMaken) en het artikelquotum. NULL = geen grens (bijgehouden = false). beperkend_product_id = het product dat het eerst op is.';
REVOKE ALL ON FUNCTION public.winkel_vrij_artikelen(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.winkel_vrij_artikelen(UUID) TO authenticated, service_role;


-- ── 5. winkel_reserveringen ─────────────────────────────────────────────────
-- Per product en order wat meetelt in "gereserveerd": ordernummer, alleen de
-- naam, het afhaalmoment en het aantal. Nooit e-mail of telefoon (contract
-- §1.9). afhaalmoment = het vroegste moment van de regels met dit product
-- (moment van de regel, anders van de order; zonder tijdvak 00:00 die dag;
-- zonder moment de klaar_op-dag), in Europe/Amsterdam.
CREATE OR REPLACE FUNCTION public.winkel_reserveringen(p_org UUID, p_product_id UUID DEFAULT NULL)
RETURNS TABLE (
    product_id    UUID,
    order_id      BIGINT,
    nummer        TEXT,
    naam          TEXT,
    afhaalmoment  TIMESTAMPTZ,
    aantal        NUMERIC,
    betaald       BOOLEAN
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
    PERFORM private.vereis_org(p_org);

    RETURN QUERY
    SELECT c.product_id,
           o.id,
           o.nummer,
           o.contact_naam,
           MIN(CASE WHEN m.id IS NOT NULL
                    THEN (m.datum + COALESCE(m.van, TIME '00:00')) AT TIME ZONE 'Europe/Amsterdam'
                    ELSE r.klaar_op::TIMESTAMP AT TIME ZONE 'Europe/Amsterdam' END),
           SUM(c.hoeveelheid)::NUMERIC,
           o.status = 'betaald'
      FROM public.winkel_order_regel_componenten c
      JOIN public.winkel_order_regels r ON r.id = c.order_regel_id
      JOIN public.winkel_orders o ON o.id = r.order_id
      LEFT JOIN public.winkel_momenten m ON m.id = COALESCE(r.moment_id, o.moment_id)
     WHERE c.product_id IN (SELECT wp.id FROM public.winkel_producten wp
                             WHERE wp.organization_id = p_org
                               AND (p_product_id IS NULL OR wp.id = p_product_id))
       AND r.klaargezet_at IS NULL
       AND (o.status = 'betaald' OR (o.status = 'wacht' AND o.reservering_tot > now()))
     GROUP BY c.product_id, o.id, o.nummer, o.contact_naam, o.status
     ORDER BY c.product_id, o.id;
END $$;
COMMENT ON FUNCTION public.winkel_reserveringen(UUID, UUID) IS
    'Per product en order wat meetelt in gereserveerd: nummer, naam, afhaalmoment, aantal, betaald. Nooit e-mail of telefoon.';
REVOKE ALL ON FUNCTION public.winkel_reserveringen(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.winkel_reserveringen(UUID, UUID) TO authenticated, service_role;


-- ── 6. winkel_voorraad_stand ────────────────────────────────────────────────
-- {versie, gewijzigd_at, vrij_verloopt_at}. Lees dit vóór vrij: dan hoort een
-- antwoord nooit bij een oudere versie dan de getallen die erbij komen.
CREATE OR REPLACE FUNCTION public.winkel_voorraad_stand(p_org UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_versie    BIGINT;
    v_gewijzigd TIMESTAMPTZ;
    v_verloopt  TIMESTAMPTZ;
BEGIN
    PERFORM private.vereis_org(p_org);

    SELECT v.versie, v.gewijzigd_at INTO v_versie, v_gewijzigd
      FROM public.winkel_voorraad_versie v
     WHERE v.organization_id = p_org;

    SELECT min(o.reservering_tot) INTO v_verloopt
      FROM public.winkel_orders o
     WHERE o.organization_id = p_org
       AND o.status = 'wacht'
       AND o.reservering_tot > now();

    RETURN jsonb_build_object(
        'versie', COALESCE(v_versie, 0),
        'gewijzigd_at', v_gewijzigd,
        'vrij_verloopt_at', v_verloopt);
END $$;
COMMENT ON FUNCTION public.winkel_voorraad_stand(UUID) IS
    '{versie, gewijzigd_at, vrij_verloopt_at}: de voorraadversie van de organisatie en het eerste moment waarop een lopende reservering verloopt (daarna vrij opnieuw ophalen).';
REVOKE ALL ON FUNCTION public.winkel_voorraad_stand(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.winkel_voorraad_stand(UUID) TO authenticated, service_role;


-- ── 7. Zelfcontrole ─────────────────────────────────────────────────────────
DO $$
DECLARE
    v_sig    TEXT;
    v_n      INTEGER;
    v_fouten TEXT := '';
BEGIN
    FOREACH v_sig IN ARRAY ARRAY[
        'public.winkel_vrij_producten(uuid)',
        'public.winkel_vrij_artikelen(uuid)',
        'public.winkel_reserveringen(uuid, uuid)',
        'public.winkel_voorraad_stand(uuid)'
    ]
    LOOP
        IF has_function_privilege('anon', v_sig, 'EXECUTE') THEN
            v_fouten := v_fouten || E'\n  anon mag ' || v_sig;
        END IF;
        IF NOT has_function_privilege('authenticated', v_sig, 'EXECUTE') THEN
            v_fouten := v_fouten || E'\n  authenticated mist ' || v_sig;
        END IF;
        IF NOT has_function_privilege('service_role', v_sig, 'EXECUTE') THEN
            v_fouten := v_fouten || E'\n  service_role mist ' || v_sig;
        END IF;
    END LOOP;

    IF has_function_privilege('authenticated', 'private.winkel_voorraad_versie_omhoog()', 'EXECUTE')
       OR has_function_privilege('anon', 'private.winkel_voorraad_versie_omhoog()', 'EXECUTE') THEN
        v_fouten := v_fouten || E'\n  de triggerfunctie is aan te roepen door anon of authenticated';
    END IF;

    -- Elke trigger bij naam (een latere migratie mag er een bij zetten, zoals
    -- 20261005130100 op winkel_instellingen).
    FOREACH v_sig IN ARRAY ARRAY[
        'trg_winkel_vv_mutaties', 'trg_winkel_vv_order_nieuw', 'trg_winkel_vv_order_status',
        'trg_winkel_vv_order_weg', 'trg_winkel_vv_regel_status', 'trg_winkel_vv_slots',
        'trg_winkel_vv_artikel_quotum', 'trg_winkel_vv_artikel_erbij',
        'trg_winkel_vv_product_erbij', 'trg_winkel_vv_product'
    ]
    LOOP
        SELECT count(*) INTO v_n
          FROM pg_trigger t
         WHERE t.tgname = v_sig
           AND t.tgconstraint <> 0
           AND t.tgdeferrable
           AND t.tginitdeferred
           AND t.tgfoid = 'private.winkel_voorraad_versie_omhoog()'::REGPROCEDURE;
        IF v_n <> 1 THEN
            v_fouten := v_fouten || E'\n  deferred constraint-trigger ' || v_sig || ' ontbreekt';
        END IF;
    END LOOP;

    IF NOT (SELECT c.relrowsecurity FROM pg_class c WHERE c.oid = 'public.winkel_voorraad_versie'::REGCLASS) THEN
        v_fouten := v_fouten || E'\n  RLS staat uit op winkel_voorraad_versie';
    END IF;
    IF has_table_privilege('authenticated', 'public.winkel_voorraad_versie', 'INSERT')
       OR has_table_privilege('authenticated', 'public.winkel_voorraad_versie', 'UPDATE')
       OR has_table_privilege('anon', 'public.winkel_voorraad_versie', 'SELECT') THEN
        v_fouten := v_fouten || E'\n  winkel_voorraad_versie is te beschrijven door authenticated of te lezen door anon';
    END IF;

    IF v_fouten <> '' THEN
        RAISE EXCEPTION 'winkel_vrij: zelfcontrole mislukt, er is niets veranderd:%', v_fouten;
    END IF;
END $$;
