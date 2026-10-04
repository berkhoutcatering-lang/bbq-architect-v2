-- ════════════════════════════════════════════════════════════════════════════
--  BA-4a — minimale catalogus voor de Toonbank
--  Plan v5 §M2 (BA-4a) · Contract toonbank/v1 §1.6, §2 (winkel_artikelen,
--  winkel_producten), §3.3 (GET catalogus)
--  Test: supabase/tests/toonbank_catalogus.sql (alleen op de dev-database)
-- ════════════════════════════════════════════════════════════════════════════
--
--  Wat erbij komt (alles additief; de webshop merkt er niets van)
--    1. winkel_producten.statiegeld_cents: statiegeld per stuk, buiten de btw.
--       Standaard 0. De Toonbank maakt er per verkoopregel een eigen
--       statiegeldregel van (contract §1.4); niet meer de vaste 15 ct van het
--       prototype.
--    2. Eén EAN per product binnen een organisatie: unieke index op
--       (organization_id, ean) WHERE ean IS NOT NULL. De pre-flight meldt
--       bestaande dubbelen en breekt dan af (er wordt niets aangepast); los ze
--       eerst op in BBQ Architect (Webshop → Producten of de productkaart).
--    3. winkel_artikelen.kanalen: waar het artikel verkocht wordt
--       ('webshop', 'toonbank', 'event'). Standaard {webshop}: bestaande
--       artikelen staan pas op de Toonbank als je dat aanzet. Voor de webshop
--       verandert er nu niets: die blijft op actief en publiek kijken.
--       Plus toonbank_groep (de knop op het verkoopscherm, vrije tekst),
--       toonbank_volgorde en toonbank_favoriet (de rij vaste favorieten).
--    4. winkel_catalogus_versie: één teller per organisatie, met dezelfde
--       aanpak als winkel_voorraad_versie (20261005130000): deferred
--       constraint-triggers, hooguit één keer per transactie en organisatie
--       (vlag app.cv_<org>), en nooit een harde fout. GET catalogus geeft hem
--       als ETag; de tablet haalt de catalogus alleen opnieuw op als hij
--       veranderde. laatste_reden = wat de transactie als eerste raakte
--       ('artikel', 'prijs', 'product', 'slot').
--
--  Hergebruik (feat/catalogus, 20261003120000): slug, foto, allergenen,
--  alcohol_pct en pagina_status staan al op winkel_producten; die komen hier
--  niet opnieuw. Alleen foto en foto_url tellen mee voor de catalogusversie.
--
--  Niet in deze stap (contract §2, later): plu, gewijzigd_in_versie per rij
--  (GET catalogus geeft daarom altijd de volledige catalogus, volledig: true),
--  prijs_historie, aangemaakt_via en de artikelstatus concept/goedgekeurd.
--
--  Rechten: de teller is alleen te lezen (authenticated via RLS op de eigen
--  organisatie, service_role voor de Toonbank-API). Schrijven doet alleen de
--  triggerfunctie (SECURITY DEFINER, niemand heeft EXECUTE).


-- ── 0. Pre-flight ───────────────────────────────────────────────────────────
DO $$
DECLARE
    v_sig       TEXT;
    v_ontbreekt TEXT := '';
    v_dubbel    TEXT;
BEGIN
    IF (SELECT count(*) FROM pg_roles WHERE rolname IN ('anon', 'authenticated', 'service_role')) <> 3 THEN
        RAISE EXCEPTION 'toonbank_catalogus: de Supabase-rollen anon, authenticated en service_role ontbreken';
    END IF;

    FOREACH v_sig IN ARRAY ARRAY['private.user_org_ids()', 'private.vereis_org(uuid)', 'private.winkel_voorraad_versie_omhoog()']
    LOOP
        IF to_regprocedure(v_sig) IS NULL THEN
            v_ontbreekt := v_ontbreekt || E'\n  functie ' || v_sig;
        END IF;
    END LOOP;
    FOREACH v_sig IN ARRAY ARRAY['public.organizations', 'public.winkel_artikelen', 'public.winkel_producten', 'public.winkel_artikel_slots']
    LOOP
        IF to_regclass(v_sig) IS NULL THEN
            v_ontbreekt := v_ontbreekt || E'\n  tabel ' || v_sig;
        END IF;
    END LOOP;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'winkel_producten' AND column_name = 'ean') THEN
        v_ontbreekt := v_ontbreekt || E'\n  kolom winkel_producten.ean (migratie 20260928120000_winkelvoorraad_logboek)';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'winkel_producten' AND column_name = 'foto') THEN
        v_ontbreekt := v_ontbreekt || E'\n  kolom winkel_producten.foto (migratie 20261003120000_winkel_catalogus)';
    END IF;
    IF v_ontbreekt <> '' THEN
        RAISE EXCEPTION 'toonbank_catalogus: dit ontbreekt (eerst BA-S, BA-5 en de catalogus; objectproef supabase/checks/verify_winkel_live.sql):%', v_ontbreekt;
    END IF;

    -- Dubbele EAN's binnen een organisatie: melden en afbreken. Niets aanpassen;
    -- welk product de code houdt, beslist Mathijs.
    SELECT string_agg(format('%s · EAN %s: %s', d.organization_id, d.ean, d.namen), E'\n  ' ORDER BY d.organization_id, d.ean)
      INTO v_dubbel
      FROM (
          SELECT p.organization_id, p.ean, string_agg(format('%s (%s)', p.naam, p.id), ', ' ORDER BY p.naam, p.id) AS namen
            FROM public.winkel_producten p
           WHERE p.ean IS NOT NULL
           GROUP BY p.organization_id, p.ean
          HAVING count(*) > 1
      ) d;
    IF v_dubbel IS NOT NULL THEN
        RAISE EXCEPTION E'toonbank_catalogus: dubbele EAN''s in winkel_producten; los ze eerst op (één product per streepjescode), er is niets veranderd:\n  %', v_dubbel;
    END IF;
END $$;


-- ── 1. winkel_producten: statiegeld en unieke EAN ───────────────────────────
ALTER TABLE public.winkel_producten
    ADD COLUMN IF NOT EXISTS statiegeld_cents INTEGER NOT NULL DEFAULT 0
        CONSTRAINT winkel_producten_statiegeld_check CHECK (statiegeld_cents >= 0 AND statiegeld_cents <= 10000);
COMMENT ON COLUMN public.winkel_producten.statiegeld_cents IS
    'Statiegeld per stuk in centen, buiten de btw (0 = geen). De Toonbank maakt er per verkoopregel en onderdeel een eigen statiegeldregel van (contract toonbank/v1 §1.4).';

CREATE UNIQUE INDEX IF NOT EXISTS winkel_producten_ean_uniek
    ON public.winkel_producten (organization_id, ean) WHERE ean IS NOT NULL;
COMMENT ON INDEX public.winkel_producten_ean_uniek IS
    'Eén product per streepjescode binnen een organisatie (BA-4a). De Toonbank zoekt op EAN; twee treffers zou een gok zijn.';


-- ── 2. winkel_artikelen: kanalen en de Toonbank-knop ────────────────────────
ALTER TABLE public.winkel_artikelen
    ADD COLUMN IF NOT EXISTS kanalen TEXT[] NOT NULL DEFAULT ARRAY['webshop']::TEXT[]
        CONSTRAINT winkel_artikelen_kanalen_check CHECK (kanalen <@ ARRAY['webshop', 'toonbank', 'event']::TEXT[]),
    ADD COLUMN IF NOT EXISTS toonbank_groep TEXT
        CONSTRAINT winkel_artikelen_toonbank_groep_check CHECK (toonbank_groep IS NULL OR (length(btrim(toonbank_groep)) BETWEEN 1 AND 40)),
    ADD COLUMN IF NOT EXISTS toonbank_volgorde INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS toonbank_favoriet BOOLEAN NOT NULL DEFAULT false;
COMMENT ON COLUMN public.winkel_artikelen.kanalen IS
    'Waar het artikel verkocht wordt: webshop, toonbank, event. Standaard {webshop}. De Toonbank (GET /api/toonbank/v1/catalogus) toont alleen artikelen met toonbank; de webshop kijkt (nog) naar actief en publiek.';
COMMENT ON COLUMN public.winkel_artikelen.toonbank_groep IS
    'De groepsknop op het verkoopscherm van de Toonbank (bijvoorbeeld "Bier"). Leeg = zonder groep.';
COMMENT ON COLUMN public.winkel_artikelen.toonbank_volgorde IS
    'Volgorde binnen de groep op de Toonbank; laag eerst.';
COMMENT ON COLUMN public.winkel_artikelen.toonbank_favoriet IS
    'In de rij vaste favorieten bovenaan het verkoopscherm van de Toonbank.';

CREATE INDEX IF NOT EXISTS winkel_artikelen_toonbank_idx
    ON public.winkel_artikelen (organization_id) WHERE 'toonbank' = ANY (kanalen);


-- ── 3. winkel_catalogus_versie ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.winkel_catalogus_versie (
    organization_id  UUID        PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
    versie           BIGINT      NOT NULL DEFAULT 0 CHECK (versie >= 0),
    gewijzigd_at     TIMESTAMPTZ,
    laatste_reden    TEXT        CHECK (laatste_reden IS NULL OR laatste_reden IN ('artikel', 'prijs', 'product', 'slot', 'foto'))
);
COMMENT ON TABLE public.winkel_catalogus_versie IS
    'Eén teller per organisatie: gaat één omhoog per transactie die de catalogus van de Toonbank raakt (deferred constraint-triggers, private.winkel_catalogus_versie_omhoog). Alleen te lezen; schrijven doet alleen de trigger.';
COMMENT ON COLUMN public.winkel_catalogus_versie.laatste_reden IS
    'Wat de laatste verhogende transactie als eerste raakte: artikel, prijs, product of slot.';

ALTER TABLE public.winkel_catalogus_versie ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS winkel_catalogus_versie_select ON public.winkel_catalogus_versie;
CREATE POLICY winkel_catalogus_versie_select ON public.winkel_catalogus_versie FOR SELECT TO authenticated
    USING (organization_id IN (SELECT private.user_org_ids()));

REVOKE ALL ON TABLE public.winkel_catalogus_versie FROM PUBLIC, anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public.winkel_catalogus_versie FROM authenticated, service_role;
GRANT SELECT ON TABLE public.winkel_catalogus_versie TO authenticated, service_role;

-- Een rij voor elke organisatie met een kassa; de trigger maakt de rest aan.
INSERT INTO public.winkel_catalogus_versie (organization_id, versie)
SELECT i.organization_id, 0 FROM public.winkel_instellingen i
ON CONFLICT (organization_id) DO NOTHING;


-- ── 4. De teller omhoog: hooguit één keer per transactie en organisatie ────
-- Net als private.winkel_voorraad_versie_omhoog: draait bij het committen,
-- vlag app.cv_<org> (transactie-lokaal), en een fout is alleen een WARNING.
-- TG_ARGV[0] is de reden ('artikel', 'prijs', 'product', 'slot'); bij een
-- artikel wordt het 'prijs' als prijs of btw veranderde.
CREATE OR REPLACE FUNCTION private.winkel_catalogus_versie_omhoog()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_org   UUID;
    v_vlag  TEXT;
    v_reden TEXT := COALESCE(TG_ARGV[0], 'artikel');
BEGIN
    IF TG_OP = 'DELETE' THEN
        v_org := OLD.organization_id;
    ELSE
        v_org := NEW.organization_id;
    END IF;
    IF v_org IS NULL THEN
        RETURN NULL;
    END IF;

    v_vlag := 'app.cv_' || replace(v_org::TEXT, '-', '');
    IF COALESCE(current_setting(v_vlag, true), '') = 'ja' THEN
        RETURN NULL;
    END IF;
    PERFORM set_config(v_vlag, 'ja', true);

    -- Via jsonb: OLD/NEW hebben per tabel andere kolommen, en PL/pgSQL kort
    -- een AND niet af.
    IF TG_OP = 'UPDATE' AND TG_TABLE_NAME = 'winkel_artikelen' THEN
        IF (to_jsonb(OLD) -> 'prijs_cents') IS DISTINCT FROM (to_jsonb(NEW) -> 'prijs_cents')
           OR (to_jsonb(OLD) -> 'btw_pct') IS DISTINCT FROM (to_jsonb(NEW) -> 'btw_pct') THEN
            v_reden := 'prijs';
        END IF;
    END IF;

    BEGIN
        INSERT INTO public.winkel_catalogus_versie AS v (organization_id, versie, gewijzigd_at, laatste_reden)
        SELECT v_org, 1, clock_timestamp(), v_reden
         WHERE EXISTS (SELECT 1 FROM public.organizations o WHERE o.id = v_org)
        ON CONFLICT (organization_id) DO UPDATE
           SET versie = v.versie + 1,
               gewijzigd_at = EXCLUDED.gewijzigd_at,
               laatste_reden = EXCLUDED.laatste_reden;
    EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'winkel_catalogus_versie niet opgehoogd voor %: % (%)', v_org, SQLERRM, SQLSTATE;
    END;

    RETURN NULL;
END $$;
COMMENT ON FUNCTION private.winkel_catalogus_versie_omhoog() IS
    'Deferred constraint-trigger: verhoogt winkel_catalogus_versie hooguit één keer per transactie en organisatie (vlag app.cv_<org>). Faalt nooit hard.';
REVOKE ALL ON FUNCTION private.winkel_catalogus_versie_omhoog() FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS trg_winkel_cv_artikel_erbij ON public.winkel_artikelen;
DROP TRIGGER IF EXISTS trg_winkel_cv_artikel       ON public.winkel_artikelen;
DROP TRIGGER IF EXISTS trg_winkel_cv_product_erbij ON public.winkel_producten;
DROP TRIGGER IF EXISTS trg_winkel_cv_product       ON public.winkel_producten;
DROP TRIGGER IF EXISTS trg_winkel_cv_slots         ON public.winkel_artikel_slots;

-- Een artikel erbij of weg.
CREATE CONSTRAINT TRIGGER trg_winkel_cv_artikel_erbij
    AFTER INSERT OR DELETE ON public.winkel_artikelen
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW EXECUTE FUNCTION private.winkel_catalogus_versie_omhoog('artikel');

-- Wat de Toonbank van een artikel laat zien of waarmee hij rekent.
-- Niet: het quotum (voorraad), momenten, dozen, koppelingen; die raken de
-- catalogus van de Toonbank niet.
CREATE CONSTRAINT TRIGGER trg_winkel_cv_artikel
    AFTER UPDATE OF naam, slug, prijs_cents, btw_pct, btw_verdeling, alcohol, actief,
                    kanalen, toonbank_groep, toonbank_volgorde, toonbank_favoriet
    ON public.winkel_artikelen
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW
    WHEN (OLD.naam IS DISTINCT FROM NEW.naam OR OLD.slug IS DISTINCT FROM NEW.slug
          OR OLD.prijs_cents IS DISTINCT FROM NEW.prijs_cents OR OLD.btw_pct IS DISTINCT FROM NEW.btw_pct
          OR OLD.btw_verdeling IS DISTINCT FROM NEW.btw_verdeling OR OLD.alcohol IS DISTINCT FROM NEW.alcohol
          OR OLD.actief IS DISTINCT FROM NEW.actief OR OLD.kanalen IS DISTINCT FROM NEW.kanalen
          OR OLD.toonbank_groep IS DISTINCT FROM NEW.toonbank_groep
          OR OLD.toonbank_volgorde IS DISTINCT FROM NEW.toonbank_volgorde
          OR OLD.toonbank_favoriet IS DISTINCT FROM NEW.toonbank_favoriet)
    EXECUTE FUNCTION private.winkel_catalogus_versie_omhoog('artikel');

-- Een product erbij of weg.
CREATE CONSTRAINT TRIGGER trg_winkel_cv_product_erbij
    AFTER INSERT OR DELETE ON public.winkel_producten
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW EXECUTE FUNCTION private.winkel_catalogus_versie_omhoog('product');

-- Wat de Toonbank van een product laat zien of waarmee hij rekent: naam,
-- eenheid, statiegeld, alcohol, EAN, foto, de winkelwaarde voor de btw-
-- verdeling van een pakket, en of de voorraad wordt bijgehouden. De
-- voorraad zelf niet (die verandert bij elke verkoop; dat is GET vrij).
CREATE CONSTRAINT TRIGGER trg_winkel_cv_product
    AFTER UPDATE OF naam, eenheid, statiegeld_cents, alcohol, ean, foto, foto_url,
                    winkelprijs_incl_cents, prijs_per, btw_pct, actief, voorraad
    ON public.winkel_producten
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW
    WHEN (OLD.naam IS DISTINCT FROM NEW.naam OR OLD.eenheid IS DISTINCT FROM NEW.eenheid
          OR OLD.statiegeld_cents IS DISTINCT FROM NEW.statiegeld_cents OR OLD.alcohol IS DISTINCT FROM NEW.alcohol
          OR OLD.ean IS DISTINCT FROM NEW.ean OR OLD.foto IS DISTINCT FROM NEW.foto OR OLD.foto_url IS DISTINCT FROM NEW.foto_url
          OR OLD.winkelprijs_incl_cents IS DISTINCT FROM NEW.winkelprijs_incl_cents
          OR OLD.prijs_per IS DISTINCT FROM NEW.prijs_per OR OLD.btw_pct IS DISTINCT FROM NEW.btw_pct
          OR OLD.actief IS DISTINCT FROM NEW.actief
          OR (OLD.voorraad IS NULL) IS DISTINCT FROM (NEW.voorraad IS NULL))
    EXECUTE FUNCTION private.winkel_catalogus_versie_omhoog('product');

-- De onderdelen van een artikel.
CREATE CONSTRAINT TRIGGER trg_winkel_cv_slots
    AFTER INSERT OR UPDATE OR DELETE ON public.winkel_artikel_slots
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW EXECUTE FUNCTION private.winkel_catalogus_versie_omhoog('slot');


-- ── 5. Zelfcontrole ─────────────────────────────────────────────────────────
DO $$
DECLARE
    v_sig    TEXT;
    v_n      INTEGER;
    v_fouten TEXT := '';
BEGIN
    IF has_function_privilege('anon', 'private.winkel_catalogus_versie_omhoog()', 'EXECUTE')
       OR has_function_privilege('authenticated', 'private.winkel_catalogus_versie_omhoog()', 'EXECUTE')
       OR has_function_privilege('service_role', 'private.winkel_catalogus_versie_omhoog()', 'EXECUTE') THEN
        v_fouten := v_fouten || E'\n  de triggerfunctie is aan te roepen';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_proc
                    WHERE oid = 'private.winkel_catalogus_versie_omhoog()'::REGPROCEDURE
                      AND prosecdef
                      AND proconfig @> ARRAY['search_path=public, pg_temp']) THEN
        v_fouten := v_fouten || E'\n  triggerfunctie zonder SECURITY DEFINER of vast search_path';
    END IF;

    FOREACH v_sig IN ARRAY ARRAY[
        'trg_winkel_cv_artikel_erbij', 'trg_winkel_cv_artikel', 'trg_winkel_cv_product_erbij',
        'trg_winkel_cv_product', 'trg_winkel_cv_slots'
    ]
    LOOP
        SELECT count(*) INTO v_n
          FROM pg_trigger t
         WHERE t.tgname = v_sig
           AND t.tgconstraint <> 0
           AND t.tgdeferrable
           AND t.tginitdeferred
           AND t.tgfoid = 'private.winkel_catalogus_versie_omhoog()'::REGPROCEDURE;
        IF v_n <> 1 THEN
            v_fouten := v_fouten || E'\n  deferred constraint-trigger ' || v_sig || ' ontbreekt';
        END IF;
    END LOOP;

    IF NOT (SELECT c.relrowsecurity FROM pg_class c WHERE c.oid = 'public.winkel_catalogus_versie'::REGCLASS) THEN
        v_fouten := v_fouten || E'\n  RLS staat uit op winkel_catalogus_versie';
    END IF;
    IF has_table_privilege('authenticated', 'public.winkel_catalogus_versie', 'INSERT')
       OR has_table_privilege('authenticated', 'public.winkel_catalogus_versie', 'UPDATE')
       OR has_table_privilege('service_role', 'public.winkel_catalogus_versie', 'UPDATE')
       OR has_table_privilege('anon', 'public.winkel_catalogus_versie', 'SELECT') THEN
        v_fouten := v_fouten || E'\n  winkel_catalogus_versie is te beschrijven of door anon te lezen';
    END IF;
    IF NOT has_table_privilege('service_role', 'public.winkel_catalogus_versie', 'SELECT')
       OR NOT has_table_privilege('authenticated', 'public.winkel_catalogus_versie', 'SELECT') THEN
        v_fouten := v_fouten || E'\n  winkel_catalogus_versie niet te lezen door authenticated of service_role';
    END IF;

    IF to_regclass('public.winkel_producten_ean_uniek') IS NULL
       OR NOT (SELECT indisunique FROM pg_index WHERE indexrelid = 'public.winkel_producten_ean_uniek'::REGCLASS) THEN
        v_fouten := v_fouten || E'\n  unieke index winkel_producten_ean_uniek ontbreekt';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                    WHERE table_schema = 'public' AND table_name = 'winkel_artikelen' AND column_name = 'kanalen'
                      AND column_default LIKE '%webshop%') THEN
        v_fouten := v_fouten || E'\n  winkel_artikelen.kanalen zonder standaard {webshop}';
    END IF;

    IF v_fouten <> '' THEN
        RAISE EXCEPTION 'toonbank_catalogus: zelfcontrole mislukt, er is niets veranderd:%', v_fouten;
    END IF;
END $$;


-- ── 6. Verificatie ──────────────────────────────────────────────────────────
--   supabase/tests/toonbank_catalogus.sql      alleen op dev: "GESLAAGD: …"
--   SELECT 'toonbank' = ANY (kanalen) AS toonbank, count(*) FROM winkel_artikelen GROUP BY 1;
