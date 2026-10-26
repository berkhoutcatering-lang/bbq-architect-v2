-- ════════════════════════════════════════════════════════════════════════════
--  Keuzevakken — een combideal waarin de klant zelf kiest
--  Plan: docs/context/winkel-aanbod-en-vloer-plan.md, fase 2
-- ════════════════════════════════════════════════════════════════════════════
--
--  "Twee biertjes, twee soorten worst en een blokje kaas, en de klant mag zelf
--  kiezen wat het wordt." Een vak is vast (zoals nu) of 'kies': de klant kiest
--  `keuzes` keer uit de opties van dat vak, eventueel elk een andere, met per
--  optie een meerprijs. Het rekenwerk staat in src/lib/winkel/rekenen.ts
--  (valideerKeuzes, componentenVan, btwVerdeling); de database legt vast.
--
--  Alles additief. Bestaande vakken krijgen keuze = 'vast' en werken precies
--  als voorheen. winkel_plaats_order en winkel_vrij_artikelen worden vervangen
--  door de LIVE versie (opgehaald 26 okt 2026) met alleen de kies-vak-stukken
--  erbij; handtekening en rechten blijven gelijk.
--
--  Toepassen: één keer, met de hand (npx supabase db query --linked -f …).
--  Nooit db push. Mag opnieuw: elk deel is idempotent.


-- ── 0. Pre-flight ───────────────────────────────────────────────────────────
DO $$
BEGIN
    IF to_regclass('public.winkel_artikel_slots') IS NULL
       OR to_regclass('public.winkel_producten') IS NULL
       OR to_regclass('public.winkel_order_regel_componenten') IS NULL THEN
        RAISE EXCEPTION 'winkel_keuzevakken: de template-tabellen ontbreken (migratie 20260927120000_winkel_sinterklaas)';
    END IF;
    IF to_regprocedure('public.winkel_vrij_producten(uuid)') IS NULL
       OR to_regprocedure('private.winkel_voorraad_versie_omhoog()') IS NULL THEN
        RAISE EXCEPTION 'winkel_keuzevakken: winkel_vrij_producten of de versie-trigger ontbreekt (migratie 20261005130000_winkel_vrij)';
    END IF;
    IF to_regprocedure('private.user_org_ids()') IS NULL THEN
        RAISE EXCEPTION 'winkel_keuzevakken: functie private.user_org_ids() ontbreekt';
    END IF;
    IF to_regprocedure('public.winkel_controleer_capaciteit(uuid, jsonb, bigint)') IS NULL THEN
        RAISE EXCEPTION 'winkel_keuzevakken: winkel_controleer_capaciteit(uuid, jsonb, bigint) ontbreekt — de bestelfunctie roept hem aan';
    END IF;
END $$;


-- ── 1. Het vak: vast of kies ────────────────────────────────────────────────
ALTER TABLE public.winkel_artikel_slots
    ADD COLUMN IF NOT EXISTS keuze        TEXT    NOT NULL DEFAULT 'vast',
    ADD COLUMN IF NOT EXISTS keuzes       INTEGER NOT NULL DEFAULT 1,
    ADD COLUMN IF NOT EXISTS verschillend BOOLEAN NOT NULL DEFAULT false;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'winkel_artikel_slots_keuze_check') THEN
        ALTER TABLE public.winkel_artikel_slots
            ADD CONSTRAINT winkel_artikel_slots_keuze_check CHECK (keuze IN ('vast', 'kies'));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'winkel_artikel_slots_keuzes_check') THEN
        ALTER TABLE public.winkel_artikel_slots
            ADD CONSTRAINT winkel_artikel_slots_keuzes_check CHECK (keuzes BETWEEN 1 AND 24);
    END IF;
END $$;

COMMENT ON COLUMN public.winkel_artikel_slots.keuze IS
    'vast = altijd standaard_product_id; kies = de klant kiest `keuzes` keer uit winkel_slot_opties (standaard_product_id is dan de voorkeuze).';
COMMENT ON COLUMN public.winkel_artikel_slots.keuzes IS
    'Kies-vak: hoe vaak de klant kiest. hoeveelheid is per keuze.';
COMMENT ON COLUMN public.winkel_artikel_slots.verschillend IS
    'Kies-vak: elke keuze een ander product ("twee sóórten worst").';


-- ── 2. De opties van een kies-vak ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.winkel_slot_opties (
    id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id  UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    slot_id          UUID        NOT NULL REFERENCES public.winkel_artikel_slots(id) ON DELETE CASCADE,
    product_id       UUID        NOT NULL REFERENCES public.winkel_producten(id) ON DELETE CASCADE,
    -- Bovenop de pakketprijs, per keuze, incl. btw. Telt tegen het tarief van dit product.
    meerprijs_cents  INTEGER     NOT NULL DEFAULT 0 CHECK (meerprijs_cents BETWEEN 0 AND 100000),
    volgorde         INTEGER     NOT NULL DEFAULT 0,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT winkel_slot_opties_uniek UNIQUE (slot_id, product_id)
);
COMMENT ON TABLE public.winkel_slot_opties IS
    'Waaruit de klant kiest in een kies-vak (winkel_artikel_slots.keuze = kies), met meerprijs per keuze. Een verwijderd product verdwijnt vanzelf uit de opties.';
CREATE INDEX IF NOT EXISTS winkel_slot_opties_slot_idx    ON public.winkel_slot_opties(slot_id, volgorde);
CREATE INDEX IF NOT EXISTS winkel_slot_opties_product_idx ON public.winkel_slot_opties(product_id);
CREATE INDEX IF NOT EXISTS winkel_slot_opties_org_idx     ON public.winkel_slot_opties(organization_id);

-- Vak en product horen bij dezelfde organisatie als de optie.
CREATE OR REPLACE FUNCTION private.winkel_slot_optie_controle()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.winkel_artikel_slots s WHERE s.id = NEW.slot_id AND s.organization_id = NEW.organization_id)
       OR NOT EXISTS (SELECT 1 FROM public.winkel_producten p WHERE p.id = NEW.product_id AND p.organization_id = NEW.organization_id) THEN
        RAISE EXCEPTION 'optie hoort niet bij deze organisatie' USING ERRCODE = 'WK010';
    END IF;
    RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.winkel_slot_optie_controle() FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS trg_winkel_slot_optie_controle ON public.winkel_slot_opties;
CREATE TRIGGER trg_winkel_slot_optie_controle BEFORE INSERT OR UPDATE ON public.winkel_slot_opties
    FOR EACH ROW EXECUTE FUNCTION private.winkel_slot_optie_controle();

-- De website hoort het als de keuzes veranderen (zelfde sein als bij de vakken).
DROP TRIGGER IF EXISTS trg_winkel_vv_slot_opties ON public.winkel_slot_opties;
CREATE CONSTRAINT TRIGGER trg_winkel_vv_slot_opties
    AFTER INSERT OR UPDATE OR DELETE ON public.winkel_slot_opties
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW EXECUTE FUNCTION private.winkel_voorraad_versie_omhoog();

ALTER TABLE public.winkel_slot_opties ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS winkel_slot_opties_select ON public.winkel_slot_opties;
CREATE POLICY winkel_slot_opties_select ON public.winkel_slot_opties FOR SELECT TO authenticated
    USING (organization_id IN (SELECT private.user_org_ids()));
DROP POLICY IF EXISTS winkel_slot_opties_insert ON public.winkel_slot_opties;
CREATE POLICY winkel_slot_opties_insert ON public.winkel_slot_opties FOR INSERT TO authenticated
    WITH CHECK (organization_id IN (SELECT private.user_org_ids()));
DROP POLICY IF EXISTS winkel_slot_opties_update ON public.winkel_slot_opties;
CREATE POLICY winkel_slot_opties_update ON public.winkel_slot_opties FOR UPDATE TO authenticated
    USING      (organization_id IN (SELECT private.user_org_ids()))
    WITH CHECK (organization_id IN (SELECT private.user_org_ids()));
DROP POLICY IF EXISTS winkel_slot_opties_delete ON public.winkel_slot_opties;
CREATE POLICY winkel_slot_opties_delete ON public.winkel_slot_opties FOR DELETE TO authenticated
    USING (organization_id IN (SELECT private.user_org_ids()));


-- ── 3. De inhoud van een order onthoudt het vak en de keuze ─────────────────
ALTER TABLE public.winkel_order_regel_componenten
    ADD COLUMN IF NOT EXISTS slot_id UUID    REFERENCES public.winkel_artikel_slots(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS gekozen BOOLEAN NOT NULL DEFAULT false;
COMMENT ON COLUMN public.winkel_order_regel_componenten.gekozen IS
    'true = de klant koos dit product in een kies-vak (inpaklijst: "klant koos").';


-- ── 4. winkel_plaats_order — de live versie, plus slot_id en gekozen ────────
-- Ongewijzigd behalve de INSERT in winkel_order_regel_componenten (gemarkeerd).
-- Oude aanroepen zonder slot_id/gekozen werken als voorheen (NULL / false).
CREATE OR REPLACE FUNCTION public.winkel_plaats_order(p_organization_id uuid, p_sleutel text, p_token text, p_leverwijze text, p_moment_id uuid, p_contact_naam text, p_contact_email text, p_contact_telefoon text, p_adres jsonb, p_opmerking text, p_subtotaal_cents integer, p_leverkosten_cents integer, p_totaal_cents integer, p_btw_cents jsonb, p_terug_url text, p_regels jsonb, p_betaalwijze text DEFAULT 'volledig'::text, p_nu_te_betalen_cents integer DEFAULT NULL::integer, p_rest_cents integer DEFAULT 0)
 RETURNS winkel_orders
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_inst      public.winkel_instellingen%ROWTYPE;
    v_bestaand  public.winkel_orders%ROWTYPE;
    v_order     public.winkel_orders%ROWTYPE;
    v_jaar      INTEGER := EXTRACT(YEAR FROM (now() AT TIME ZONE 'Europe/Amsterdam'))::INTEGER;
    v_nummer    TEXT;
    v_regel_id  BIGINT;
    r           JSONB;
    c           JSONB;
BEGIN
    SELECT * INTO v_inst FROM public.winkel_instellingen
     WHERE organization_id = p_organization_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'geen winkelinstellingen' USING ERRCODE = 'WK005';
    END IF;

    SELECT * INTO v_bestaand FROM public.winkel_orders
     WHERE organization_id = p_organization_id AND sleutel = p_sleutel AND status <> 'verlopen';
    IF FOUND THEN
        RETURN v_bestaand;
    END IF;

    PERFORM public.winkel_controleer_capaciteit(p_organization_id, p_regels, NULL);

    IF v_inst.nummer_jaar IS DISTINCT FROM v_jaar THEN
        v_inst.nummer_jaar := v_jaar;
        v_inst.nummer_laatste := 0;
    END IF;
    v_inst.nummer_laatste := v_inst.nummer_laatste + 1;
    UPDATE public.winkel_instellingen
       SET nummer_jaar = v_inst.nummer_jaar, nummer_laatste = v_inst.nummer_laatste
     WHERE organization_id = p_organization_id;
    v_nummer := v_inst.nummer_prefix || '-' || v_jaar || '-' || lpad(v_inst.nummer_laatste::TEXT, 4, '0');

    INSERT INTO public.winkel_orders (
        organization_id, nummer, token, sleutel, status, leverwijze, moment_id,
        contact_naam, contact_email, contact_telefoon, adres, opmerking,
        subtotaal_cents, leverkosten_cents, totaal_cents, btw_cents,
        reservering_tot, terug_url,
        betaalwijze, nu_te_betalen_cents, rest_cents
    ) VALUES (
        p_organization_id, v_nummer, p_token, p_sleutel, 'wacht', p_leverwijze, p_moment_id,
        p_contact_naam, p_contact_email, NULLIF(btrim(COALESCE(p_contact_telefoon, '')), ''), p_adres,
        NULLIF(btrim(COALESCE(p_opmerking, '')), ''),
        p_subtotaal_cents, p_leverkosten_cents, p_totaal_cents, COALESCE(p_btw_cents, '{}'::jsonb),
        now() + make_interval(mins => v_inst.reservering_minuten), p_terug_url,
        COALESCE(p_betaalwijze, 'volledig'), COALESCE(p_nu_te_betalen_cents, p_totaal_cents), COALESCE(p_rest_cents, 0)
    )
    RETURNING * INTO v_order;

    FOR r IN SELECT * FROM jsonb_array_elements(p_regels)
    LOOP
        INSERT INTO public.winkel_order_regels (
            organization_id, order_id, artikel_id, slug, naam, aantal, eenheid,
            stuk_cents, bedrag_cents, btw_pct, btw_cents, alcohol, moment_id, eenheden, voorraad_eenheden, afhaalmoment_tekst
        ) VALUES (
            p_organization_id, v_order.id, (r->>'artikel_id')::UUID, r->>'slug', r->>'naam',
            (r->>'aantal')::INTEGER, r->>'eenheid',
            (r->>'stuk_cents')::INTEGER, (r->>'bedrag_cents')::INTEGER, (r->>'btw_pct')::INTEGER, r->'btw_cents',
            COALESCE((r->>'alcohol')::BOOLEAN, false),
            (r->>'moment_id')::UUID, COALESCE((r->>'eenheden')::INTEGER, 0),
            COALESCE((r->>'voorraad_eenheden')::INTEGER, 0), r->>'afhaalmoment_tekst'
        )
        RETURNING id INTO v_regel_id;

        FOR c IN SELECT * FROM jsonb_array_elements(COALESCE(r->'componenten', '[]'::jsonb))
        LOOP
            -- Keuzevakken: slot_id en gekozen erbij (nieuw op 26 okt 2026).
            INSERT INTO public.winkel_order_regel_componenten (
                organization_id, order_regel_id, product_id, slot_type, naam, hoeveelheid, eenheid, slot_id, gekozen
            ) VALUES (
                p_organization_id, v_regel_id, (c->>'product_id')::UUID, COALESCE(c->>'slot_type', 'overig'),
                COALESCE(c->>'naam', ''), (c->>'hoeveelheid')::NUMERIC, COALESCE(c->>'eenheid', 'stuk'),
                (c->>'slot_id')::UUID, COALESCE((c->>'gekozen')::BOOLEAN, false)
            );
        END LOOP;
    END LOOP;

    RETURN v_order;
END $function$;


-- ── 5. winkel_vrij_artikelen — de live versie, plus kies-vakken ─────────────
-- Gelijk aan src/lib/winkel/vrij.ts + voorraad.ts (pakkettenTeMaken, leegVak):
--   * vast vak zonder product → 0 (zoals voorheen);
--   * kies-vak zonder opties (of te weinig voor "elk een andere") → 0;
--   * een kies-vak telt zijn opties samen: ⌊Σ max(vrij, 0) ÷ (hoeveelheid × keuzes)⌋;
--     één niet-bijgehouden optie = dat vak begrenst niets;
--   * beperkend_product_id alleen voor een vast product; bij gelijkstand wint dat.
CREATE OR REPLACE FUNCTION public.winkel_vrij_artikelen(p_org uuid)
 RETURNS TABLE(artikel_id uuid, slug text, vrij integer, beperkend_product_id uuid, bijgehouden boolean)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
    optie_telling AS (
        SELECT o.slot_id AS sid, COUNT(*) AS n
          FROM public.winkel_slot_opties o
         WHERE o.organization_id = p_org
         GROUP BY o.slot_id
    ),
    leeg AS (
        SELECT DISTINCT s.artikel_id AS aid
          FROM public.winkel_artikel_slots s
          JOIN art ON art.aid = s.artikel_id
          LEFT JOIN optie_telling ot ON ot.sid = s.id
         WHERE (s.keuze = 'vast' AND s.standaard_product_id IS NULL)
            OR (s.keuze = 'kies' AND COALESCE(ot.n, 0) < CASE WHEN s.verschillend THEN s.keuzes ELSE 1 END)
    ),
    vraag AS (
        SELECT s.artikel_id AS aid, s.standaard_product_id AS pid,
               SUM(s.hoeveelheid) AS per_stuk, MIN(s.volgorde) AS eerste
          FROM public.winkel_artikel_slots s
          JOIN art ON art.aid = s.artikel_id
         WHERE s.keuze = 'vast' AND s.standaard_product_id IS NOT NULL
         GROUP BY s.artikel_id, s.standaard_product_id
    ),
    per_product AS (
        SELECT q.aid, q.pid, q.eerste, false AS kies,
               floor(round(pr.pvrij / q.per_stuk, 3)) AS n
          FROM vraag q
          JOIN prod pr ON pr.pid = q.pid
         WHERE pr.pvrij IS NOT NULL
    ),
    per_kiesvak AS (
        SELECT s.artikel_id AS aid, NULL::UUID AS pid, s.volgorde AS eerste, true AS kies,
               GREATEST(floor(round(SUM(GREATEST(pr.pvrij, 0)) / (s.hoeveelheid * s.keuzes), 3)), 0) AS n
          FROM public.winkel_artikel_slots s
          JOIN art ON art.aid = s.artikel_id
          JOIN public.winkel_slot_opties o ON o.slot_id = s.id
          LEFT JOIN prod pr ON pr.pid = o.product_id
         WHERE s.keuze = 'kies'
         GROUP BY s.id, s.artikel_id, s.volgorde, s.hoeveelheid, s.keuzes
        HAVING bool_and(pr.pvrij IS NOT NULL)
    ),
    onderdelen AS (
        SELECT DISTINCT ON (x.aid) x.aid, x.pid, x.n
          FROM (SELECT * FROM per_product UNION ALL SELECT * FROM per_kiesvak) x
         ORDER BY x.aid, x.n, x.kies, x.eerste, x.pid
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
END $function$;


-- ── 6. Verificatie ──────────────────────────────────────────────────────────
--   SELECT keuze, count(*) FROM winkel_artikel_slots GROUP BY 1;                     -- alles 'vast'
--   SELECT count(*) FROM pg_policies WHERE tablename = 'winkel_slot_opties';         -- 4
--   SELECT proname, prosecdef FROM pg_proc WHERE proname IN ('winkel_plaats_order','winkel_vrij_artikelen');  -- elk één keer
--   SELECT has_function_privilege('anon', 'public.winkel_plaats_order(uuid, text, text, text, uuid, text, text, text, jsonb, text, integer, integer, integer, jsonb, text, jsonb, text, integer, integer)', 'execute');  -- false
--   SELECT * FROM winkel_vrij_artikelen('<org>');                                    -- zelfde als vóór de migratie
