-- ════════════════════════════════════════════════════════════════════════════
--  BA-6 — wegzet-taken: losse winkelwaar apart zetten voor een webshoporder
--  Plan v5 §M1 (BA-6) · Contract toonbank/v1 §1.10, §2 (punt 2), §3.2–3.5
--  Test: supabase/tests/winkel_wegzetten.sql (alleen op de dev-database)
-- ════════════════════════════════════════════════════════════════════════════
--
--  Het verhaal (de 4 Naober)
--    De website verkoopt 4 Naober; BBQ Architect reserveert ze
--    (winkel_bezetting_product). Er liggen er 6, dus 2 vrij. Iemand moet de 4
--    flessen uit het schap pakken en apart zetten: dat is een wegzet-taak, in
--    BBQ Architect (Vandaag en de webshop) en later op de Toonbank.
--    Afvinken boekt −4 als verkoop_online, via winkel_zet_klaargezet. Daarna
--    telt de order niet meer als gereserveerd: er liggen er 2, vrij 2.
--
--  Wat erbij komt
--    1. winkel_artikelen.afhandeling: 'inpakken' (pakketten, planken, dozen:
--       de makerij, zoals nu) of 'wegzetten' (losse winkelwaar uit het schap).
--       Standaard 'inpakken': bij het uitrollen verandert er voor bestaande
--       artikelen niets.
--    2. View winkel_wegzet_taken (security_invoker): per betaalde order de
--       wegzet-regels die nog niet klaargezet en niet opgehaald zijn. Alleen
--       ordernummer en naam van de klant; geen e-mail of telefoon.
--    3. winkel_zet_order_apart: alles of niets. Ligt er voor één product te
--       weinig, dan WV010 en wordt er niets geboekt. Twee keer = al_apart.
--    4. winkel_zet_order_apart_terug: alleen op dezelfde bedrijfsdag
--       (Europe/Amsterdam), anders niet_zelfde_dag. Na ophalen WV011. Een
--       tweede keer = niet_apart.
--
--  Foutcodes erbij (nagekeken op 5 okt: nergens in gebruik, de pre-flight
--  controleert het nog eens in de database):
--    WV010  te weinig voorraad om apart te zetten; er is niets geboekt
--    WV011  apart zetten terugdraaien nadat de order is opgehaald
--  Allebei als ERRCODE P0001, met de code vooraan in de melding en de details
--  als JSON in DETAIL (PostgREST geeft die door als `details`). WV006 (niet
--  betaald) blijft de bestaande SQLSTATE, net als in winkel_zet_klaargezet.
--
--  Lockvolgorde: eerst de order (FOR UPDATE), dan al zijn regels, dan de
--  producten in id-volgorde. winkel_zet_klaargezet en winkel_muteer_voorraad
--  pakken daarna dezelfde rijen nog eens; daar wordt niet meer op gewacht.
--  winkel_doos_ophalen (doos → order → regel → producten) en het losse
--  inpakken (regel → producten) passen in dezelfde volgorde.


-- ── 0. Pre-flight ───────────────────────────────────────────────────────────
DO $$
DECLARE
    v_bezet TEXT;
BEGIN
    IF to_regprocedure('private.vereis_org(uuid)') IS NULL THEN
        RAISE EXCEPTION 'wegzetten: private.vereis_org ontbreekt (migratie 20261003150000, BA-S)';
    END IF;
    IF to_regprocedure('public.winkel_zet_klaargezet(uuid, bigint, boolean)') IS NULL THEN
        RAISE EXCEPTION 'wegzetten: winkel_zet_klaargezet ontbreekt (migratie 20260928120100)';
    END IF;
    IF to_regprocedure('public.winkel_muteer_voorraad(uuid, uuid, text, numeric, text, text, bigint, bigint, date, integer, uuid, text, integer, bigint, uuid)') IS NULL THEN
        RAISE EXCEPTION 'wegzetten: winkel_muteer_voorraad ontbreekt (migratie 20260928120000)';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                    WHERE table_schema = 'public' AND table_name = 'winkel_order_regels' AND column_name = 'opgehaald_at') THEN
        RAISE EXCEPTION 'wegzetten: winkel_order_regels.opgehaald_at ontbreekt (migratie 20260928120100)';
    END IF;
    IF to_regclass('public.winkel_order_regel_componenten') IS NULL THEN
        RAISE EXCEPTION 'wegzetten: winkel_order_regel_componenten ontbreekt (migratie 20260927120000)';
    END IF;
    IF to_regclass('public.personeel') IS NULL THEN
        RAISE EXCEPTION 'wegzetten: personeel ontbreekt (migratie 031_team_uren)';
    END IF;

    -- WV010 en WV011 mogen nog nergens anders in gebruik zijn (live loopt voor op main).
    SELECT string_agg(p.oid::REGPROCEDURE::TEXT, ', ' ORDER BY p.oid)
      INTO v_bezet
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname IN ('public', 'private')
       AND p.proname NOT IN ('winkel_zet_order_apart', 'winkel_zet_order_apart_terug')
       AND (p.prosrc LIKE '%WV010%' OR p.prosrc LIKE '%WV011%');
    IF v_bezet IS NOT NULL THEN
        RAISE EXCEPTION 'wegzetten: foutcode WV010 of WV011 is al in gebruik in %', v_bezet;
    END IF;
END $$;


-- ── 1. winkel_artikelen.afhandeling ─────────────────────────────────────────
ALTER TABLE public.winkel_artikelen
    ADD COLUMN IF NOT EXISTS afhandeling TEXT NOT NULL DEFAULT 'inpakken'
        CONSTRAINT winkel_artikelen_afhandeling_check CHECK (afhandeling IN ('inpakken', 'wegzetten'));
COMMENT ON COLUMN public.winkel_artikelen.afhandeling IS
    'inpakken = pakket, plank of doos uit de makerij (vakjes, etiket, doosscan). wegzetten = losse winkelwaar uit het schap: na betaling een wegzet-taak (winkel_wegzet_taken), afvinken via winkel_zet_order_apart.';

-- De view zoekt open regels per order; dit houdt dat klein.
CREATE INDEX IF NOT EXISTS winkel_order_regels_open_idx
    ON public.winkel_order_regels (organization_id, order_id)
    WHERE klaargezet_at IS NULL AND opgehaald_at IS NULL;


-- ── 2. View winkel_wegzet_taken ─────────────────────────────────────────────
-- Eén rij per betaalde order met minstens één open wegzet-regel.
--   id                  = order_id (useSupabase ordent en ververst op id)
--   afhaalmoment        = het vroegste van de open regels: het moment van de
--                         regel, anders dat van de order (datum + van, in
--                         Europe/Amsterdam; zonder tijdvak 00:00), anders
--                         klaar_op om 00:00
--   ophalen_binnen_24u  = afhaalmoment ≤ nu + 24 uur (ook als het al voorbij is)
--   regels              = [{regel_id, artikel, aantal,
--                           producten: [{product_id, naam, hoeveelheid, eenheid}]}]
-- security_invoker: de RLS van de onderliggende tabellen geldt, dus iedereen
-- ziet alleen de orders van zijn eigen organisatie.
CREATE OR REPLACE VIEW public.winkel_wegzet_taken
WITH (security_invoker = true) AS
WITH open_regels AS (
    SELECT r.id                AS regel_id,
           r.order_id,
           r.naam              AS artikel,
           r.aantal,
           COALESCE(
               (rm.datum + COALESCE(rm.van, TIME '00:00')) AT TIME ZONE 'Europe/Amsterdam',
               (om.datum + COALESCE(om.van, TIME '00:00')) AT TIME ZONE 'Europe/Amsterdam',
               r.klaar_op::TIMESTAMP AT TIME ZONE 'Europe/Amsterdam'
           )                   AS afhaalmoment
      FROM public.winkel_order_regels r
      JOIN public.winkel_orders o     ON o.id = r.order_id
      JOIN public.winkel_artikelen a  ON a.id = r.artikel_id
      LEFT JOIN public.winkel_momenten rm ON rm.id = r.moment_id
      LEFT JOIN public.winkel_momenten om ON om.id = o.moment_id
     WHERE o.status = 'betaald'
       AND a.afhandeling = 'wegzetten'
       AND r.klaargezet_at IS NULL
       AND r.opgehaald_at IS NULL
)
SELECT o.id                                         AS id,
       o.organization_id,
       o.id                                         AS order_id,
       o.nummer,
       o.contact_naam                               AS naam,
       min(orr.afhaalmoment)                        AS afhaalmoment,
       min(orr.afhaalmoment) <= now() + INTERVAL '24 hours' AS ophalen_binnen_24u,
       jsonb_agg(jsonb_build_object(
           'regel_id',  orr.regel_id,
           'artikel',   orr.artikel,
           'aantal',    orr.aantal,
           'producten', COALESCE(p.producten, '[]'::JSONB)
       ) ORDER BY orr.regel_id)                     AS regels
  FROM open_regels orr
  JOIN public.winkel_orders o ON o.id = orr.order_id
  LEFT JOIN LATERAL (
      SELECT jsonb_agg(jsonb_build_object(
                 'product_id',  x.product_id,
                 'naam',        x.naam,
                 'hoeveelheid', x.hoeveelheid,
                 'eenheid',     x.eenheid
             ) ORDER BY x.naam) AS producten
        FROM (
            SELECT c.product_id,
                   COALESCE(wp.naam, min(c.naam)) AS naam,
                   sum(c.hoeveelheid)             AS hoeveelheid,
                   min(c.eenheid)                 AS eenheid
              FROM public.winkel_order_regel_componenten c
              LEFT JOIN public.winkel_producten wp ON wp.id = c.product_id
             WHERE c.order_regel_id = orr.regel_id
             GROUP BY c.product_id, wp.naam, CASE WHEN c.product_id IS NULL THEN c.naam END
        ) x
  ) p ON true
 GROUP BY o.id, o.organization_id, o.nummer, o.contact_naam;

COMMENT ON VIEW public.winkel_wegzet_taken IS
    'Wegzet-taken (BA-6): per betaalde webshoporder de losse winkelwaar (afhandeling wegzetten) die nog apart moet. Verdwijnt als alles klaargezet is. Alleen ordernummer en naam, geen contactgegevens.';

REVOKE ALL ON public.winkel_wegzet_taken FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.winkel_wegzet_taken TO authenticated, service_role;


-- ── 3. winkel_zet_order_apart ───────────────────────────────────────────────
-- Een wegzet-taak afvinken: alle open wegzet-regels van de order in één keer.
--   p_bron          'ba' of 'toonbank'
--   p_door_user_id  wie het deed als er geen sessie is (service_role); bij een
--                   ingelogde gebruiker wint auth.uid()
--   p_medewerker_id personeel.id van wie aan de toonbank afvinkte
-- Geeft {uitkomst: 'apart' | 'al_apart' | 'geen_taak', order_id, nummer, bron,
--        boekingen: [{regel_id, product_id, hoeveelheid, voorraad, type}]}.
-- Fouten: P0002 onbekende order of medewerker; WV006 niet betaald;
--         WV010 te weinig voorraad (DETAIL {wv_code, order_id, nummer,
--         tekorten: [{product_id, naam, ligt_er, nodig}]}).
CREATE OR REPLACE FUNCTION public.winkel_zet_order_apart(
    p_org            UUID,
    p_order_id       BIGINT,
    p_bron           TEXT DEFAULT 'ba',
    p_door_user_id   UUID DEFAULT NULL,
    p_medewerker_id  UUID DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_order       public.winkel_orders%ROWTYPE;
    v_medewerker  TEXT;
    v_wegzet      BIGINT[];
    v_open        BIGINT[];
    v_tekorten    JSONB;
    v_tekst       TEXT;
    v_vanaf       BIGINT;
    v_regel       BIGINT;
    v_r           JSONB;
    v_b           JSONB;
    v_boekingen   JSONB := '[]'::JSONB;
BEGIN
    PERFORM private.vereis_org(p_org);

    IF p_bron IS NULL OR p_bron NOT IN ('ba', 'toonbank') THEN
        RAISE EXCEPTION 'apart zetten: bron is ba of toonbank, niet %', COALESCE(p_bron, 'leeg') USING ERRCODE = '22023';
    END IF;
    IF p_medewerker_id IS NOT NULL THEN
        SELECT naam INTO v_medewerker FROM public.personeel WHERE id = p_medewerker_id AND organization_id = p_org;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'medewerker % niet in deze organisatie', p_medewerker_id USING ERRCODE = 'P0002';
        END IF;
    END IF;

    -- 1. Eerst de order.
    SELECT * INTO v_order FROM public.winkel_orders
     WHERE id = p_order_id AND organization_id = p_org
       FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'order % niet in deze organisatie', p_order_id USING ERRCODE = 'P0002';
    END IF;
    IF v_order.status <> 'betaald' THEN
        RAISE EXCEPTION 'WV006: order % is niet betaald (%): niets apart zetten', v_order.nummer, v_order.status
            USING ERRCODE = 'WV006',
                  DETAIL = jsonb_build_object('wv_code', 'WV006', 'order_id', v_order.id, 'nummer', v_order.nummer, 'status', v_order.status)::TEXT;
    END IF;

    -- 2. Dan zijn regels: alle, in id-volgorde.
    PERFORM 1 FROM public.winkel_order_regels WHERE order_id = p_order_id ORDER BY id FOR UPDATE;

    SELECT COALESCE(array_agg(r.id ORDER BY r.id), '{}'),
           COALESCE(array_agg(r.id ORDER BY r.id) FILTER (WHERE r.klaargezet_at IS NULL AND r.opgehaald_at IS NULL), '{}')
      INTO v_wegzet, v_open
      FROM public.winkel_order_regels r
      JOIN public.winkel_artikelen a ON a.id = r.artikel_id
     WHERE r.order_id = p_order_id
       AND a.afhandeling = 'wegzetten';

    IF cardinality(v_wegzet) = 0 THEN
        RETURN jsonb_build_object('uitkomst', 'geen_taak', 'order_id', v_order.id, 'nummer', v_order.nummer, 'bron', p_bron, 'boekingen', '[]'::JSONB);
    END IF;
    IF cardinality(v_open) = 0 THEN
        RETURN jsonb_build_object('uitkomst', 'al_apart', 'order_id', v_order.id, 'nummer', v_order.nummer, 'bron', p_bron, 'boekingen', '[]'::JSONB);
    END IF;

    -- 3. Dan de producten, in id-volgorde.
    PERFORM 1 FROM public.winkel_producten p
     WHERE p.organization_id = p_org
       AND p.id IN (SELECT c.product_id FROM public.winkel_order_regel_componenten c WHERE c.order_regel_id = ANY (v_open))
     ORDER BY p.id
       FOR UPDATE;

    -- Ligt er genoeg? Alleen bijgehouden producten tellen: een product zonder
    -- voorraadgetal blokkeert nooit (net als winkel_zet_klaargezet).
    SELECT jsonb_agg(jsonb_build_object('product_id', t.product_id, 'naam', t.naam, 'ligt_er', t.ligt_er, 'nodig', t.nodig)
                     ORDER BY t.naam, t.product_id),
           string_agg(format('%s: ligt er %s, nodig %s', t.naam, trim_scale(t.ligt_er), trim_scale(t.nodig)), '; '
                     ORDER BY t.naam, t.product_id)
      INTO v_tekorten, v_tekst
      FROM (
          SELECT c.product_id, p.naam, p.voorraad AS ligt_er, sum(c.hoeveelheid) AS nodig
            FROM public.winkel_order_regel_componenten c
            JOIN public.winkel_producten p ON p.id = c.product_id
           WHERE c.order_regel_id = ANY (v_open)
           GROUP BY c.product_id, p.naam, p.voorraad
      ) t
     WHERE t.ligt_er IS NOT NULL
       AND t.ligt_er < t.nodig;

    IF v_tekorten IS NOT NULL THEN
        RAISE EXCEPTION 'WV010: te weinig voorraad om % apart te zetten (%). Er is niets apart gezet.', v_order.nummer, v_tekst
            USING ERRCODE = 'P0001',
                  DETAIL  = jsonb_build_object('wv_code', 'WV010', 'order_id', v_order.id, 'nummer', v_order.nummer, 'tekorten', v_tekorten)::TEXT,
                  HINT    = 'Tel het schap en corrigeer de voorraad; zet de order daarna opnieuw apart.';
    END IF;

    -- 4. Boeken: per regel winkel_zet_klaargezet (netto en idempotent).
    SELECT COALESCE(max(id), 0) INTO v_vanaf FROM public.winkel_voorraad_mutaties;
    FOREACH v_regel IN ARRAY v_open LOOP
        v_r := public.winkel_zet_klaargezet(p_org, v_regel, true);
        FOR v_b IN SELECT * FROM jsonb_array_elements(COALESCE(v_r->'boekingen', '[]'::JSONB)) LOOP
            v_boekingen := v_boekingen || jsonb_build_object(
                'regel_id',    v_regel,
                'product_id',  v_b->'product_id',
                'hoeveelheid', v_b->'hoeveelheid',
                'voorraad',    v_b->'voorraad',
                'type',        CASE WHEN (v_b->>'hoeveelheid')::NUMERIC < 0 THEN 'verkoop_online' ELSE 'retour' END);
        END LOOP;
    END LOOP;

    -- 5. Wie en waar, bij de regels die net in het logboek kwamen.
    UPDATE public.winkel_voorraad_mutaties m
       SET door_user_id = COALESCE(m.door_user_id, p_door_user_id),
           notitie      = COALESCE(m.notitie,
                              'Apart gezet' || CASE p_bron WHEN 'toonbank' THEN ' aan de toonbank' ELSE ' in BBQ Architect' END
                              || COALESCE(' door ' || v_medewerker, ''))
     WHERE m.id > v_vanaf
       AND m.order_regel_id = ANY (v_open);

    RETURN jsonb_build_object('uitkomst', 'apart', 'order_id', v_order.id, 'nummer', v_order.nummer, 'bron', p_bron, 'boekingen', v_boekingen);
END $$;
COMMENT ON FUNCTION public.winkel_zet_order_apart(UUID, BIGINT, TEXT, UUID, UUID) IS
    'Wegzet-taak afvinken (BA-6): alle open wegzet-regels van een betaalde order via winkel_zet_klaargezet. Alles of niets: te weinig op het schap = WV010 en niets geboekt. Tweede keer = al_apart.';
REVOKE ALL ON FUNCTION public.winkel_zet_order_apart(UUID, BIGINT, TEXT, UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.winkel_zet_order_apart(UUID, BIGINT, TEXT, UUID, UUID) TO authenticated, service_role;


-- ── 4. winkel_zet_order_apart_terug ─────────────────────────────────────────
-- Apart zetten ongedaan maken, op dezelfde bedrijfsdag (Europe/Amsterdam).
-- Boekt per product retour (winkel_zet_klaargezet met false); de order telt
-- weer als gereserveerd en de taak komt terug.
-- Geeft {uitkomst: 'ongedaan' | 'niet_apart' | 'niet_zelfde_dag' | 'geen_taak',
--        order_id, nummer, bron, boekingen}. niet_zelfde_dag boekt niets: dan
-- gaat het via een telling (contract §3.2: 422 niet_zelfde_dag).
-- Fouten: P0002 onbekende order of medewerker; WV011 al opgehaald (DETAIL
--         {wv_code, order_id, nummer, opgehaald_at}).
CREATE OR REPLACE FUNCTION public.winkel_zet_order_apart_terug(
    p_org            UUID,
    p_order_id       BIGINT,
    p_bron           TEXT DEFAULT 'ba',
    p_door_user_id   UUID DEFAULT NULL,
    p_medewerker_id  UUID DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_order       public.winkel_orders%ROWTYPE;
    v_medewerker  TEXT;
    v_wegzet      BIGINT[];
    v_apart       BIGINT[];
    v_opgehaald   TIMESTAMPTZ;
    v_apart_at    TIMESTAMPTZ;
    v_vanaf       BIGINT;
    v_regel       BIGINT;
    v_r           JSONB;
    v_b           JSONB;
    v_boekingen   JSONB := '[]'::JSONB;
BEGIN
    PERFORM private.vereis_org(p_org);

    IF p_bron IS NULL OR p_bron NOT IN ('ba', 'toonbank') THEN
        RAISE EXCEPTION 'apart zetten terug: bron is ba of toonbank, niet %', COALESCE(p_bron, 'leeg') USING ERRCODE = '22023';
    END IF;
    IF p_medewerker_id IS NOT NULL THEN
        SELECT naam INTO v_medewerker FROM public.personeel WHERE id = p_medewerker_id AND organization_id = p_org;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'medewerker % niet in deze organisatie', p_medewerker_id USING ERRCODE = 'P0002';
        END IF;
    END IF;

    -- 1. Eerst de order, dan zijn regels.
    SELECT * INTO v_order FROM public.winkel_orders
     WHERE id = p_order_id AND organization_id = p_org
       FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'order % niet in deze organisatie', p_order_id USING ERRCODE = 'P0002';
    END IF;
    PERFORM 1 FROM public.winkel_order_regels WHERE order_id = p_order_id ORDER BY id FOR UPDATE;

    SELECT COALESCE(array_agg(r.id ORDER BY r.id), '{}'),
           COALESCE(array_agg(r.id ORDER BY r.id) FILTER (WHERE r.klaargezet_at IS NOT NULL), '{}'),
           max(r.opgehaald_at),
           min(r.klaargezet_at)
      INTO v_wegzet, v_apart, v_opgehaald, v_apart_at
      FROM public.winkel_order_regels r
      JOIN public.winkel_artikelen a ON a.id = r.artikel_id
     WHERE r.order_id = p_order_id
       AND a.afhandeling = 'wegzetten';

    IF cardinality(v_wegzet) = 0 THEN
        RETURN jsonb_build_object('uitkomst', 'geen_taak', 'order_id', v_order.id, 'nummer', v_order.nummer, 'bron', p_bron, 'boekingen', '[]'::JSONB);
    END IF;
    IF v_opgehaald IS NOT NULL THEN
        RAISE EXCEPTION 'WV011: order % is al opgehaald (%): apart zetten kan niet meer terug', v_order.nummer,
                        to_char(v_opgehaald AT TIME ZONE 'Europe/Amsterdam', 'DD-MM-YYYY HH24:MI')
            USING ERRCODE = 'P0001',
                  DETAIL  = jsonb_build_object('wv_code', 'WV011', 'order_id', v_order.id, 'nummer', v_order.nummer, 'opgehaald_at', v_opgehaald)::TEXT,
                  HINT    = 'Klopt de voorraad niet meer, corrigeer hem dan met een telling.';
    END IF;
    IF cardinality(v_apart) = 0 THEN
        RETURN jsonb_build_object('uitkomst', 'niet_apart', 'order_id', v_order.id, 'nummer', v_order.nummer, 'bron', p_bron, 'boekingen', '[]'::JSONB);
    END IF;
    IF (v_apart_at AT TIME ZONE 'Europe/Amsterdam')::DATE <> (now() AT TIME ZONE 'Europe/Amsterdam')::DATE THEN
        RETURN jsonb_build_object('uitkomst', 'niet_zelfde_dag', 'order_id', v_order.id, 'nummer', v_order.nummer, 'bron', p_bron,
                                  'apart_gezet_at', v_apart_at, 'boekingen', '[]'::JSONB);
    END IF;

    -- 2. Dan de producten in id-volgorde: wat in de regels zit en wat ervoor geboekt is.
    PERFORM 1 FROM public.winkel_producten p
     WHERE p.organization_id = p_org
       AND (p.id IN (SELECT c.product_id FROM public.winkel_order_regel_componenten c WHERE c.order_regel_id = ANY (v_apart))
         OR p.id IN (SELECT m.winkel_product_id FROM public.winkel_voorraad_mutaties m WHERE m.order_regel_id = ANY (v_apart)))
     ORDER BY p.id
       FOR UPDATE;

    -- 3. Uitpakken = retour, per regel.
    SELECT COALESCE(max(id), 0) INTO v_vanaf FROM public.winkel_voorraad_mutaties;
    FOREACH v_regel IN ARRAY v_apart LOOP
        v_r := public.winkel_zet_klaargezet(p_org, v_regel, false);
        FOR v_b IN SELECT * FROM jsonb_array_elements(COALESCE(v_r->'boekingen', '[]'::JSONB)) LOOP
            v_boekingen := v_boekingen || jsonb_build_object(
                'regel_id',    v_regel,
                'product_id',  v_b->'product_id',
                'hoeveelheid', v_b->'hoeveelheid',
                'voorraad',    v_b->'voorraad',
                'type',        CASE WHEN (v_b->>'hoeveelheid')::NUMERIC < 0 THEN 'verkoop_online' ELSE 'retour' END);
        END LOOP;
    END LOOP;

    UPDATE public.winkel_voorraad_mutaties m
       SET door_user_id = COALESCE(m.door_user_id, p_door_user_id),
           notitie      = COALESCE(m.notitie,
                              'Apart zetten ongedaan' || CASE p_bron WHEN 'toonbank' THEN ' aan de toonbank' ELSE ' in BBQ Architect' END
                              || COALESCE(' door ' || v_medewerker, ''))
     WHERE m.id > v_vanaf
       AND m.order_regel_id = ANY (v_apart);

    RETURN jsonb_build_object('uitkomst', 'ongedaan', 'order_id', v_order.id, 'nummer', v_order.nummer, 'bron', p_bron, 'boekingen', v_boekingen);
END $$;
COMMENT ON FUNCTION public.winkel_zet_order_apart_terug(UUID, BIGINT, TEXT, UUID, UUID) IS
    'Apart zetten ongedaan maken (BA-6), alleen op dezelfde bedrijfsdag: retour per product, de wegzet-taak komt terug. Na ophalen WV011; op een latere dag niet_zelfde_dag (dan via een telling).';
REVOKE ALL ON FUNCTION public.winkel_zet_order_apart_terug(UUID, BIGINT, TEXT, UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.winkel_zet_order_apart_terug(UUID, BIGINT, TEXT, UUID, UUID) TO authenticated, service_role;


-- ── 5. Zelfcontrole ─────────────────────────────────────────────────────────
-- Klopt een recht of een instelling niet, dan draait de hele migratie terug.
DO $$
DECLARE
    v_sig    TEXT;
    v_fouten TEXT := '';
BEGIN
    FOREACH v_sig IN ARRAY ARRAY[
        'public.winkel_zet_order_apart(uuid, bigint, text, uuid, uuid)',
        'public.winkel_zet_order_apart_terug(uuid, bigint, text, uuid, uuid)'
    ] LOOP
        IF has_function_privilege('anon', v_sig, 'EXECUTE') THEN
            v_fouten := v_fouten || E'\n  anon mag ' || v_sig;
        END IF;
        IF NOT has_function_privilege('authenticated', v_sig, 'EXECUTE') THEN
            v_fouten := v_fouten || E'\n  authenticated mist ' || v_sig;
        END IF;
        IF NOT has_function_privilege('service_role', v_sig, 'EXECUTE') THEN
            v_fouten := v_fouten || E'\n  service_role mist ' || v_sig;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_proc
                        WHERE oid = v_sig::REGPROCEDURE
                          AND prosecdef
                          AND proconfig @> ARRAY['search_path=public, pg_temp']) THEN
            v_fouten := v_fouten || E'\n  geen SECURITY DEFINER met search_path public, pg_temp: ' || v_sig;
        END IF;
    END LOOP;

    IF has_table_privilege('anon', 'public.winkel_wegzet_taken', 'SELECT') THEN
        v_fouten := v_fouten || E'\n  anon mag winkel_wegzet_taken lezen';
    END IF;
    IF NOT has_table_privilege('authenticated', 'public.winkel_wegzet_taken', 'SELECT') THEN
        v_fouten := v_fouten || E'\n  authenticated mag winkel_wegzet_taken niet lezen';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_class
                    WHERE oid = 'public.winkel_wegzet_taken'::REGCLASS
                      AND reloptions @> ARRAY['security_invoker=true']) THEN
        v_fouten := v_fouten || E'\n  winkel_wegzet_taken is geen security_invoker-view';
    END IF;

    IF v_fouten <> '' THEN
        RAISE EXCEPTION 'wegzetten: zelfcontrole mislukt, er is niets veranderd:%', v_fouten;
    END IF;
END $$;


-- ── 6. Verificatie ──────────────────────────────────────────────────────────
--   supabase/tests/winkel_wegzetten.sql        alleen op dev: "GESLAAGD: …"
--   supabase/checks/verify_winkel_live.sql     objectproef, op live én dev
--   SELECT afhandeling, count(*) FROM winkel_artikelen GROUP BY 1;   -- alles inpakken tot je kiest
