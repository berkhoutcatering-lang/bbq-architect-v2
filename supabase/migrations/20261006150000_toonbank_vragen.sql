-- ════════════════════════════════════════════════════════════════════════════
--  BA-8 — Toonbank: catalogus, vrij, wegzetten, afhaallijst en scannen
--  Plan v5 §M2 (BA-8) · Contract toonbank/v1 §1.9, §1.10, §3.2, §3.3, §3.5
--  Test: supabase/tests/toonbank_vragen.sql (alleen op de dev-database)
-- ════════════════════════════════════════════════════════════════════════════
--
--  Functies voor de Toonbank-API (alleen service_role, behalve scan_resolve):
--    toonbank_catalogus(p_org)      GET catalogus: versie + artikelen met
--                                   kanaal toonbank, producten, EAN-codes,
--                                   groepen. Eén snapshot (STABLE): de versie
--                                   hoort bij de rijen.
--    toonbank_vrij(p_org)           GET vrij: voorraadstand + per product ligt
--                                   er / gereserveerd / vrij met de
--                                   reserveringen per order (nummer, naam,
--                                   afhaalmoment, aantal; nooit e-mail of
--                                   telefoon).
--    toonbank_wegzet_vraag(…)       POST wegzetten/{order_id}(/ongedaan):
--                                   winkel_zet_order_apart(_terug) met bron
--                                   'toonbank', en verzoek + uitkomst in het
--                                   journaal (soort 'wegzetten'). Idempotent op
--                                   gebeurtenis_id: een herhaling geeft het
--                                   bewaarde antwoord en boekt niets.
--    toonbank_afhaallijst(p_org, p_datum)
--                                   GET afhaallijst: betaalde afhaalorders van
--                                   die dag, alleen naam en ordernummer, met
--                                   dozen.
--    toonbank_afhaallijst_versie(p_org)
--                                   de versie van de afhaallijst (ms van de
--                                   laatste wijziging); ook in toonbank_status.
--    scan_resolve(p_org, p_code)    GET scan/{code}: dooscode → doos, EAN van
--                                   een één-slot-artikel op de Toonbank →
--                                   artikel, anders onbekend.
--
--  Lockvolgorde bij wegzetten (20261005120100): order (FOR NO KEY UPDATE) →
--  regels → producten (id-volgorde) → logboek, allemaal in
--  winkel_zet_order_apart(_terug); daarna pas het journaal; de voorraadteller
--  gaat bij het committen (deferred). Een gelijktijdige dubbele vraag met
--  hetzelfde gebeurtenis_id wacht op de order en vindt dan al_apart (niets
--  geboekt); de journaalregel van de eerste wint (ON CONFLICT DO NOTHING).
--
--  Weigeringen (WV006, WV010, WV011, onbekende order) zijn geen fout in de
--  verwerking: verwerk_status 'niet_nodig' met fout_code, zodat ze niet in
--  "Te controleren" komen. Elke andere fout draait alles terug (500).


-- ── 0. Pre-flight ───────────────────────────────────────────────────────────
DO $$
DECLARE
    v_sig       TEXT;
    v_ontbreekt TEXT := '';
BEGIN
    FOREACH v_sig IN ARRAY ARRAY[
        'private.vereis_org(uuid)',
        'public.winkel_voorraad_stand(uuid)',
        'public.winkel_vrij_producten(uuid)',
        'public.winkel_reserveringen(uuid, uuid)',
        'public.winkel_zet_order_apart(uuid, bigint, text, uuid, uuid)',
        'public.winkel_zet_order_apart_terug(uuid, bigint, text, uuid, uuid)',
        'public.toonbank_status(uuid, uuid, bigint, text, text)',
        'public.toonbank_apparaat_gezien(uuid, uuid, bigint, text, text)'
    ] LOOP
        IF to_regprocedure(v_sig) IS NULL THEN
            v_ontbreekt := v_ontbreekt || E'\n  functie ' || v_sig;
        END IF;
    END LOOP;
    FOREACH v_sig IN ARRAY ARRAY['public.winkel_catalogus_versie', 'public.toonbank_journaal', 'public.toonbank_apparaten',
                                 'public.winkel_dozen', 'public.winkel_momenten'] LOOP
        IF to_regclass(v_sig) IS NULL THEN
            v_ontbreekt := v_ontbreekt || E'\n  tabel ' || v_sig;
        END IF;
    END LOOP;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'winkel_artikelen' AND column_name = 'kanalen') THEN
        v_ontbreekt := v_ontbreekt || E'\n  kolom winkel_artikelen.kanalen (BA-4a)';
    END IF;
    IF to_regprocedure('public.scan_resolve(uuid, text)') IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid = to_regprocedure('public.scan_resolve(uuid, text)')
                          AND obj_description(oid, 'pg_proc') LIKE '%BA-8%') THEN
        v_ontbreekt := v_ontbreekt || E'\n  er bestaat al een andere scan_resolve(uuid, text); eerst nakijken';
    END IF;
    IF v_ontbreekt <> '' THEN
        RAISE EXCEPTION 'toonbank_vragen: dit ontbreekt of botst (eerst BA-5, BA-6, BA-4a, BA-7a en BA-7b):%', v_ontbreekt;
    END IF;
END $$;


-- ── 1. De versie van de afhaallijst ─────────────────────────────────────────
-- Het tijdstip (ms) van de laatste wijziging die de afhaallijst raakt: een
-- order (updated_at: status, rest betaald), een opgehaalde doos, of de
-- voorraadteller (apart zetten, ophalen, klaarzetten). Gaat alleen vooruit.
CREATE OR REPLACE FUNCTION public.toonbank_afhaallijst_versie(p_org UUID)
RETURNS BIGINT
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_t TIMESTAMPTZ;
BEGIN
    PERFORM private.vereis_org(p_org);
    SELECT GREATEST(
               (SELECT max(o.updated_at) FROM public.winkel_orders o WHERE o.organization_id = p_org),
               (SELECT max(d.opgehaald_at) FROM public.winkel_dozen d WHERE d.organization_id = p_org),
               (SELECT v.gewijzigd_at FROM public.winkel_voorraad_versie v WHERE v.organization_id = p_org))
      INTO v_t;
    RETURN COALESCE(floor(extract(epoch FROM v_t) * 1000)::BIGINT, 0);
END $$;
COMMENT ON FUNCTION public.toonbank_afhaallijst_versie(UUID) IS
    'Versie van de afhaallijst voor de Toonbank: ms van de laatste wijziging van een order, doos of de voorraadteller. Gaat alleen vooruit. Alleen service_role.';
REVOKE ALL ON FUNCTION public.toonbank_afhaallijst_versie(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.toonbank_afhaallijst_versie(UUID) TO service_role;

-- toonbank_status (BA-7b) rekent voortaan met dezelfde functie.
CREATE OR REPLACE FUNCTION public.toonbank_status(
    p_org              UUID,
    p_apparaat_id      UUID,
    p_volgnummer       BIGINT DEFAULT NULL,
    p_app_versie       TEXT DEFAULT NULL,
    p_contract_versie  TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_app      JSONB;
    v_stand    JSONB;
    v_cv       BIGINT;
    v_inst     public.winkel_instellingen%ROWTYPE;
    v_open     INTEGER;
    v_24u      INTEGER;
    v_tc       INTEGER;
    v_bon      BIGINT;
BEGIN
    PERFORM private.vereis_org(p_org);

    v_app := public.toonbank_apparaat_gezien(p_org, p_apparaat_id, p_volgnummer, p_app_versie, p_contract_versie);
    v_stand := public.winkel_voorraad_stand(p_org);
    SELECT c.versie INTO v_cv FROM public.winkel_catalogus_versie c WHERE c.organization_id = p_org;
    SELECT * INTO v_inst FROM public.winkel_instellingen i WHERE i.organization_id = p_org;

    SELECT count(*), count(*) FILTER (WHERE t.ophalen_binnen_24u)
      INTO v_open, v_24u
      FROM public.winkel_wegzet_taken t
     WHERE t.organization_id = p_org;

    SELECT count(*) INTO v_tc
      FROM public.toonbank_journaal j
     WHERE j.organization_id = p_org AND j.apparaat_id = p_apparaat_id AND j.verwerk_status IN ('fout', 'conflict');

    SELECT max((j.payload->>'bon_volgnummer')::BIGINT) INTO v_bon
      FROM public.toonbank_journaal j
     WHERE j.organization_id = p_org AND j.apparaat_id = p_apparaat_id
       AND j.soort IN ('bon', 'tegenbon')
       AND j.payload->>'bon_volgnummer' ~ '^[0-9]{1,15}$';

    RETURN jsonb_build_object(
        'servertijd', now(),
        'apparaat', jsonb_build_object('apparaat_id', v_app->'id', 'code', v_app->'code', 'naam', v_app->'naam'),
        'catalogus_versie', COALESCE(v_cv, 0),
        'voorraad_versie', COALESCE((v_stand->>'versie')::BIGINT, 0),
        'vrij_verloopt_at', v_stand->'vrij_verloopt_at',
        'afhaallijst_versie', public.toonbank_afhaallijst_versie(p_org),
        'wegzetten_open', v_open,
        'wegzetten_binnen_24u', v_24u,
        'hoogste_volgnummer_gemeld', (v_app->>'hoogste_volgnummer_gemeld')::BIGINT,
        'bevestigd_tot_volgnummer', (v_app->>'bevestigd_tot_volgnummer')::BIGINT,
        'hoogste_bon_volgnummer', COALESCE(v_bon, 0),
        'instellingen', jsonb_build_object(
            'alcohol_toegestaan', COALESCE(v_inst.toonbank_alcohol_toegestaan, false),
            'contant_aan', COALESCE(v_inst.toonbank_contant_aan, true),
            'contant_limiet_cents', LEAST(COALESCE(v_inst.toonbank_contant_limiet_cents, 300000), 300000),
            'beschikbaar_grens', COALESCE(v_inst.beschikbaar_grens, 5)),
        'te_controleren', v_tc);
END $$;
REVOKE ALL ON FUNCTION public.toonbank_status(UUID, UUID, BIGINT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.toonbank_status(UUID, UUID, BIGINT, TEXT, TEXT) TO service_role;


-- ── 2. toonbank_catalogus ───────────────────────────────────────────────────
-- Artikelen: kanaal toonbank, met een prijs, en zonder leeg slot (anders
-- niet te verkopen: geen onderdelen om af te boeken). Per artikel:
--   btw_verdeling  de overschrijving op het artikel, of naar rato van de
--                  winkelwaarde van de onderdelen (btwVerdeling in
--                  src/lib/winkel/rekenen.ts: per slot afgerond, per tarief
--                  opgeteld). NULL als er één tarief is en dat btw_pct is.
--   alcohol        het artikel, of een product in een slot (zoals de webshop).
--   groep_id       een slug van toonbank_groep ("Voor erbij" → voor-erbij).
--   foto / foto_url_ruw  van het product bij een één-slot-artikel; de API
--                  maakt er een URL van 256 px van (winkel-fotos).
-- Producten: wat in de slots van die artikelen zit. Codes: de EAN van het
-- product van een één-slot-artikel (1 stuk), één artikel per code (actief,
-- favoriet, volgorde, naam). Groepen: de gebruikte toonbank_groep's, op naam.
-- Geen open-prijsgroepen en geen PLU in deze versie (contract §2, later).
CREATE OR REPLACE FUNCTION public.toonbank_catalogus(p_org UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_versie  BIGINT;
    v_uit     JSONB;
BEGIN
    PERFORM private.vereis_org(p_org);

    -- Eerst de versie: de rijen hieronder zijn nooit ouder dan deze versie.
    SELECT COALESCE((SELECT c.versie FROM public.winkel_catalogus_versie c WHERE c.organization_id = p_org), 0) INTO v_versie;

    WITH art AS (
        SELECT a.*,
               NULLIF(btrim(regexp_replace(lower(btrim(a.toonbank_groep)), '[^a-z0-9]+', '-', 'g'), '-'), '') AS groep_id
          FROM public.winkel_artikelen a
         WHERE a.organization_id = p_org
           AND 'toonbank' = ANY (a.kanalen)
           AND a.prijs_cents IS NOT NULL
           AND NOT EXISTS (SELECT 1 FROM public.winkel_artikel_slots s WHERE s.artikel_id = a.id AND s.standaard_product_id IS NULL)
           -- Review M2 (klein 2): zonder enig slot boekt een verkoop geen voorraad af
           -- (contract §1.4: elk toonbankartikel heeft minstens één slot).
           AND EXISTS (SELECT 1 FROM public.winkel_artikel_slots s WHERE s.artikel_id = a.id)
    ),
    sl AS (
        SELECT s.id, s.artikel_id, s.volgorde, s.standaard_product_id AS pid, s.hoeveelheid, s.eenheid
          FROM public.winkel_artikel_slots s
          JOIN art ON art.id = s.artikel_id
    ),
    prod AS (
        SELECT p.*
          FROM public.winkel_producten p
         WHERE p.organization_id = p_org
           AND p.id IN (SELECT sl.pid FROM sl)
    ),
    eenslot AS (
        SELECT sl.artikel_id, (array_agg(sl.pid))[1] AS pid, bool_and(sl.hoeveelheid = 1) AS een_stuk
          FROM sl
         GROUP BY sl.artikel_id
        HAVING count(*) = 1
    ),
    gewicht AS (
        SELECT sl.artikel_id, p.btw_pct AS pct,
               sum(round(p.winkelprijs_incl_cents * sl.hoeveelheid / NULLIF(p.prijs_per, 0))) AS g
          FROM sl
          JOIN prod p ON p.id = sl.pid
         WHERE p.winkelprijs_incl_cents IS NOT NULL AND p.winkelprijs_incl_cents > 0
         GROUP BY sl.artikel_id, p.btw_pct
    ),
    verdeling AS (
        SELECT art.id AS aid,
               CASE WHEN art.btw_verdeling IS NOT NULL AND art.btw_verdeling <> '{}'::JSONB THEN
                        (SELECT jsonb_agg(jsonb_build_object('pct', e.k::INTEGER, 'gewicht', e.v::NUMERIC) ORDER BY e.v::NUMERIC DESC, e.k::INTEGER DESC)
                           FROM jsonb_each_text(art.btw_verdeling) AS e(k, v)
                          WHERE e.v::NUMERIC > 0)
                    ELSE
                        (SELECT jsonb_agg(jsonb_build_object('pct', g.pct, 'gewicht', g.g) ORDER BY g.g DESC, g.pct DESC)
                           FROM gewicht g
                          WHERE g.artikel_id = art.id AND g.g > 0)
               END AS v
          FROM art
    ),
    artikelen AS (
        SELECT jsonb_agg(jsonb_build_object(
                   'artikel_id',    art.id,
                   'naam',          art.naam,
                   'prijs_cents',   art.prijs_cents,
                   'btw_pct',       art.btw_pct,
                   'btw_verdeling', CASE WHEN vd.v IS NULL OR jsonb_array_length(vd.v) = 0 THEN NULL
                                         WHEN jsonb_array_length(vd.v) = 1 AND (vd.v->0->>'pct')::INTEGER = art.btw_pct THEN NULL
                                         ELSE vd.v END,
                   'alcohol',       art.alcohol OR EXISTS (SELECT 1 FROM sl JOIN prod p ON p.id = sl.pid WHERE sl.artikel_id = art.id AND p.alcohol),
                   'groep',         art.groep_id,
                   'volgorde',      art.toonbank_volgorde,
                   'favoriet',      art.toonbank_favoriet,
                   'foto',          (SELECT p.foto FROM eenslot e JOIN prod p ON p.id = e.pid WHERE e.artikel_id = art.id),
                   'foto_url_ruw',  (SELECT p.foto_url FROM eenslot e JOIN prod p ON p.id = e.pid WHERE e.artikel_id = art.id),
                   'onderdelen',    COALESCE((SELECT jsonb_agg(jsonb_build_object('product_id', sl.pid, 'hoeveelheid', sl.hoeveelheid, 'eenheid', sl.eenheid)
                                                           ORDER BY sl.volgorde, sl.id)
                                                FROM sl WHERE sl.artikel_id = art.id), '[]'::JSONB),
                   'actief',        art.actief,
                   'kanalen',       to_jsonb(art.kanalen)
               ) ORDER BY art.groep_id NULLS LAST, art.toonbank_volgorde, art.naam, art.id) AS lijst
          FROM art
          LEFT JOIN verdeling vd ON vd.aid = art.id
    ),
    producten AS (
        SELECT jsonb_agg(jsonb_build_object(
                   'product_id',           p.id,
                   'naam',                 p.naam,
                   'statiegeld_cents',     p.statiegeld_cents,
                   'voorraad_bijgehouden', p.voorraad IS NOT NULL,
                   'alcohol',              p.alcohol
               ) ORDER BY p.naam, p.id) AS lijst
          FROM prod p
    ),
    codes AS (
        SELECT jsonb_agg(jsonb_build_object('code', c.ean, 'soort', 'ean', 'artikel_id', c.artikel_id) ORDER BY c.ean) AS lijst
          FROM (
              SELECT DISTINCT ON (p.ean) p.ean, art.id AS artikel_id
                FROM eenslot e
                JOIN art ON art.id = e.artikel_id
                JOIN prod p ON p.id = e.pid
               WHERE e.een_stuk AND p.ean IS NOT NULL
               ORDER BY p.ean, art.actief DESC, art.toonbank_favoriet DESC, art.toonbank_volgorde, art.naam, art.id
          ) c
    ),
    groepen AS (
        SELECT jsonb_agg(jsonb_build_object(
                   'groep_id',   g.groep_id,
                   'naam',       g.naam,
                   'volgorde',   g.nr,
                   'open_prijs', false,
                   'btw_pct',    NULL,
                   'alcohol',    false
               ) ORDER BY g.nr) AS lijst
          FROM (
              SELECT x.groep_id, x.naam, row_number() OVER (ORDER BY lower(x.naam), x.groep_id) AS nr
                FROM (SELECT DISTINCT ON (art.groep_id) art.groep_id, btrim(art.toonbank_groep) AS naam
                        FROM art WHERE art.groep_id IS NOT NULL
                       ORDER BY art.groep_id, btrim(art.toonbank_groep)) x
          ) g
    )
    SELECT jsonb_build_object(
               'versie',    v_versie,
               'volledig',  true,
               'artikelen', COALESCE((SELECT lijst FROM artikelen), '[]'::JSONB),
               'producten', COALESCE((SELECT lijst FROM producten), '[]'::JSONB),
               'codes',     COALESCE((SELECT lijst FROM codes), '[]'::JSONB),
               'groepen',   COALESCE((SELECT lijst FROM groepen), '[]'::JSONB))
      INTO v_uit;
    RETURN v_uit;
END $$;
COMMENT ON FUNCTION public.toonbank_catalogus(UUID) IS
    'GET /api/toonbank/v1/catalogus (BA-8): versie en de volledige catalogus van de Toonbank (artikelen met kanaal toonbank, producten, EAN-codes, groepen). Alleen service_role.';
REVOKE ALL ON FUNCTION public.toonbank_catalogus(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.toonbank_catalogus(UUID) TO service_role;


-- ── 3. toonbank_vrij ────────────────────────────────────────────────────────
-- {versie, vrij_verloopt_at, producten: [{product_id, eenheid, ligt_er,
-- gereserveerd, vrij, bijgehouden, reserveringen}]}, getallen op 3 decimalen.
-- De stand eerst (contract §1.8): het antwoord hoort nooit bij een oudere
-- versie dan zijn getallen.
CREATE OR REPLACE FUNCTION public.toonbank_vrij(p_org UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_stand  JSONB;
    v_lijst  JSONB;
BEGIN
    PERFORM private.vereis_org(p_org);
    v_stand := public.winkel_voorraad_stand(p_org);

    WITH res AS (
        SELECT * FROM public.winkel_reserveringen(p_org, NULL) r WHERE r.aantal > 0
    )
    SELECT jsonb_agg(jsonb_build_object(
               'product_id',    vp.product_id,
               'eenheid',       vp.eenheid,
               'ligt_er',       round(vp.ligt_er, 3),
               'gereserveerd',  round(GREATEST(vp.gereserveerd, 0), 3),
               'vrij',          round(vp.vrij, 3),
               'bijgehouden',   vp.bijgehouden,
               'reserveringen', COALESCE((
                   SELECT jsonb_agg(jsonb_build_object(
                              'order_id',     r.order_id,
                              'nummer',       r.nummer,
                              'naam',         COALESCE(NULLIF(btrim(r.naam), ''), 'Onbekend'),
                              'afhaalmoment', r.afhaalmoment,
                              'aantal',       round(r.aantal, 3)) ORDER BY r.order_id)
                     FROM res r WHERE r.product_id = vp.product_id), '[]'::JSONB)
           ) ORDER BY vp.naam, vp.product_id)
      INTO v_lijst
      FROM public.winkel_vrij_producten(p_org) vp;

    RETURN jsonb_build_object(
        'versie', COALESCE((v_stand->>'versie')::BIGINT, 0),
        'volledig', true,
        'vrij_verloopt_at', v_stand->'vrij_verloopt_at',
        'producten', COALESCE(v_lijst, '[]'::JSONB));
END $$;
COMMENT ON FUNCTION public.toonbank_vrij(UUID) IS
    'GET /api/toonbank/v1/vrij (BA-8): voorraadstand + ligt er / gereserveerd / vrij per product met reserveringen per order (geen e-mail of telefoon). Alleen service_role.';
REVOKE ALL ON FUNCTION public.toonbank_vrij(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.toonbank_vrij(UUID) TO service_role;


-- ── 4. toonbank_wegzet_vraag ────────────────────────────────────────────────
-- Een wegzet-taak afvinken (p_actie 'apart') of dezelfde dag terugdraaien
-- ('ongedaan'), vanaf de Toonbank. Geeft {journaal: 'nieuw'|'bestond',
-- payload, resultaat}; resultaat is {ok: true, uitkomst, order_id, nummer,
-- boekingen, …} of {ok: false, sqlstate, melding, detail}.
CREATE OR REPLACE FUNCTION public.toonbank_wegzet_vraag(
    p_org              UUID,
    p_apparaat_id      UUID,
    p_order_id         BIGINT,
    p_actie            TEXT,
    p_gebeurtenis_id   UUID,
    p_moment           TIMESTAMPTZ,
    p_medewerker_id    UUID,
    p_contract_versie  TEXT DEFAULT NULL,
    p_reden            TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_oud      public.toonbank_journaal%ROWTYPE;
    v_payload  JSONB;
    v_r        JSONB;
    v_res      JSONB;
    v_status   TEXT;
    v_code     TEXT;
    v_melding  TEXT;
    v_detail   TEXT;
    v_state    TEXT;
    v_id       BIGINT;
BEGIN
    PERFORM private.vereis_org(p_org);

    IF p_actie IS NULL OR p_actie NOT IN ('apart', 'ongedaan') THEN
        RAISE EXCEPTION 'wegzetten: actie is apart of ongedaan, niet %', COALESCE(p_actie, 'leeg') USING ERRCODE = '22023';
    END IF;
    IF p_gebeurtenis_id IS NULL THEN
        RAISE EXCEPTION 'wegzetten: gebeurtenis_id ontbreekt' USING ERRCODE = '22023';
    END IF;
    PERFORM 1 FROM public.toonbank_apparaten a
     WHERE a.id = p_apparaat_id AND a.organization_id = p_org AND a.ingetrokken_at IS NULL;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'tablet % niet gevonden of ingetrokken', p_apparaat_id USING ERRCODE = 'P0002';
    END IF;

    -- 1. Al eerder gevraagd? Dan hetzelfde antwoord, niets opnieuw.
    SELECT * INTO v_oud FROM public.toonbank_journaal j WHERE j.organization_id = p_org AND j.gebeurtenis_id = p_gebeurtenis_id;
    IF FOUND THEN
        RETURN jsonb_build_object('journaal', 'bestond', 'soort', v_oud.soort, 'payload', v_oud.payload, 'resultaat', v_oud.resultaat);
    END IF;

    v_payload := jsonb_build_object('order_id', p_order_id, 'actie', p_actie, 'medewerker_id', p_medewerker_id, 'moment', p_moment)
                 || CASE WHEN p_reden IS NOT NULL THEN jsonb_build_object('reden', left(p_reden, 300)) ELSE '{}'::JSONB END;

    -- 2. De vraag: order → regels → producten → logboek (in winkel_zet_order_apart).
    BEGIN
        IF p_actie = 'apart' THEN
            v_r := public.winkel_zet_order_apart(p_org, p_order_id, 'toonbank', NULL, p_medewerker_id);
        ELSE
            v_r := public.winkel_zet_order_apart_terug(p_org, p_order_id, 'toonbank', NULL, p_medewerker_id);
        END IF;
        v_res := jsonb_build_object('ok', true) || v_r;
        v_status := CASE WHEN v_r->>'uitkomst' IN ('apart', 'ongedaan') THEN 'verwerkt' ELSE 'niet_nodig' END;
    EXCEPTION WHEN OTHERS THEN
        GET STACKED DIAGNOSTICS v_state = RETURNED_SQLSTATE, v_melding = MESSAGE_TEXT, v_detail = PG_EXCEPTION_DETAIL;
        IF v_state NOT IN ('WV006', 'WV010', 'WV011', 'P0002') THEN
            RAISE;   -- een echte fout: alles terug, de API antwoordt 500
        END IF;
        v_res := jsonb_build_object('ok', false, 'sqlstate', v_state, 'melding', v_melding,
                                    'detail', CASE WHEN v_detail ~ '^\s*\{' THEN v_detail::JSONB END);
        v_status := 'niet_nodig';
        v_code := v_state;
    END;

    -- 3. Verzoek en uitkomst in het journaal (na het logboek: de vaste lockvolgorde).
    INSERT INTO public.toonbank_journaal AS j (
        organization_id, apparaat_id, gebeurtenis_id, volgnummer, soort, contract_versie, payload, apparaat_tijd,
        verwerk_status, pogingen, fout_code, fout_melding, verwerkt_at, resultaat)
    VALUES (
        p_org, p_apparaat_id, p_gebeurtenis_id, NULL, 'wegzetten', left(p_contract_versie, 20), v_payload, p_moment,
        v_status, 1, v_code, CASE WHEN v_code IS NOT NULL THEN left(v_melding, 500) END, now(), v_res)
    ON CONFLICT (organization_id, gebeurtenis_id) DO NOTHING
    RETURNING j.id INTO v_id;

    IF v_id IS NULL THEN
        -- Een gelijktijdige vraag met hetzelfde gebeurtenis_id was eerder: die geldt.
        SELECT * INTO v_oud FROM public.toonbank_journaal j WHERE j.organization_id = p_org AND j.gebeurtenis_id = p_gebeurtenis_id;
        RETURN jsonb_build_object('journaal', 'bestond', 'soort', v_oud.soort, 'payload', v_oud.payload, 'resultaat', v_oud.resultaat);
    END IF;
    RETURN jsonb_build_object('journaal', 'nieuw', 'soort', 'wegzetten', 'payload', v_payload, 'resultaat', v_res);
END $$;
COMMENT ON FUNCTION public.toonbank_wegzet_vraag(UUID, UUID, BIGINT, TEXT, UUID, TIMESTAMPTZ, UUID, TEXT, TEXT) IS
    'POST wegzetten/{order_id}(/ongedaan) (BA-8): winkel_zet_order_apart(_terug) met bron toonbank, verzoek en uitkomst in het journaal (soort wegzetten), idempotent op gebeurtenis_id. Alleen service_role.';
REVOKE ALL ON FUNCTION public.toonbank_wegzet_vraag(UUID, UUID, BIGINT, TEXT, UUID, TIMESTAMPTZ, UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.toonbank_wegzet_vraag(UUID, UUID, BIGINT, TEXT, UUID, TIMESTAMPTZ, UUID, TEXT, TEXT) TO service_role;


-- ── 5. toonbank_afhaallijst ─────────────────────────────────────────────────
-- Betaalde afhaalorders met minstens één regel op die dag (moment van de
-- regel, anders van de order, anders klaar_op). Alleen naam en ordernummer.
--   afhaalmoment  het vroegste moment van de regels van die dag (datum + van,
--                 Europe/Amsterdam); NULL als die regels geen moment hebben
--   rest_cents    wat bij het afhalen nog betaald moet worden
--   status        'opgehaald' als alle regels mee zijn, anders de orderstatus
--   apart_gezet   de order heeft losse winkelwaar en die staat helemaal apart
CREATE OR REPLACE FUNCTION public.toonbank_afhaallijst(p_org UUID, p_datum DATE)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_lijst JSONB;
BEGIN
    PERFORM private.vereis_org(p_org);
    IF p_datum IS NULL THEN
        RAISE EXCEPTION 'afhaallijst: datum ontbreekt' USING ERRCODE = '22023';
    END IF;

    WITH regels AS (
        SELECT r.id, r.order_id, r.alcohol, r.klaargezet_at, r.opgehaald_at, a.afhandeling,
               COALESCE(rm.datum, om.datum, r.klaar_op) AS dag,
               COALESCE((rm.datum + COALESCE(rm.van, TIME '00:00')) AT TIME ZONE 'Europe/Amsterdam',
                        (om.datum + COALESCE(om.van, TIME '00:00')) AT TIME ZONE 'Europe/Amsterdam') AS moment
          FROM public.winkel_order_regels r
          JOIN public.winkel_orders o ON o.id = r.order_id
          LEFT JOIN public.winkel_artikelen a ON a.id = r.artikel_id
          LEFT JOIN public.winkel_momenten rm ON rm.id = r.moment_id
          LEFT JOIN public.winkel_momenten om ON om.id = o.moment_id
         WHERE o.organization_id = p_org
           AND o.status = 'betaald'
           AND o.leverwijze = 'afhalen'
    ),
    op_dag AS (
        SELECT rg.order_id, min(rg.moment) AS afhaalmoment
          FROM regels rg
         WHERE rg.dag = p_datum
         GROUP BY rg.order_id
    )
    SELECT jsonb_agg(jsonb_build_object(
               'order_id',     o.id,
               'nummer',       o.nummer,
               'naam',         COALESCE(NULLIF(btrim(o.contact_naam), ''), 'Onbekend'),
               'afhaalmoment', d.afhaalmoment,
               'alcohol',      COALESCE((SELECT bool_or(rg.alcohol) FROM regels rg WHERE rg.order_id = o.id), false),
               'rest_cents',   CASE WHEN o.betaalwijze = 'reservering' AND o.rest_betaald_at IS NULL THEN GREATEST(o.rest_cents, 0) ELSE 0 END,
               'status',       CASE WHEN NOT EXISTS (SELECT 1 FROM regels rg WHERE rg.order_id = o.id AND rg.opgehaald_at IS NULL)
                                    THEN 'opgehaald' ELSE o.status END,
               'apart_gezet',  COALESCE((SELECT bool_and(rg.klaargezet_at IS NOT NULL) FROM regels rg
                                          WHERE rg.order_id = o.id AND rg.afhandeling = 'wegzetten'), false),
               'dozen',        COALESCE((SELECT jsonb_agg(jsonb_build_object('code', dz.code, 'omschrijving', dz.omschrijving,
                                                                             'volgnr', dz.volgnr, 'opgehaald_at', dz.opgehaald_at)
                                                          ORDER BY dz.order_regel_id, dz.volgnr)
                                           FROM public.winkel_dozen dz WHERE dz.order_id = o.id AND dz.organization_id = p_org), '[]'::JSONB)
           ) ORDER BY d.afhaalmoment NULLS LAST, o.nummer)
      INTO v_lijst
      FROM op_dag d
      JOIN public.winkel_orders o ON o.id = d.order_id;

    RETURN jsonb_build_object(
        'versie', public.toonbank_afhaallijst_versie(p_org),
        'datum', to_char(p_datum, 'YYYY-MM-DD'),
        'orders', COALESCE(v_lijst, '[]'::JSONB));
END $$;
COMMENT ON FUNCTION public.toonbank_afhaallijst(UUID, DATE) IS
    'GET /api/toonbank/v1/afhaallijst (BA-8): betaalde afhaalorders van die dag met dozen; alleen naam en ordernummer. Alleen service_role.';
REVOKE ALL ON FUNCTION public.toonbank_afhaallijst(UUID, DATE) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.toonbank_afhaallijst(UUID, DATE) TO service_role;


-- ── 6. scan_resolve ─────────────────────────────────────────────────────────
-- Eén opzoekfunctie voor een gescande code (contract §2). Nu:
--   dooscode (32–128 hex)  → {soort: 'doos', code, order_id, nummer}
--   EAN (8–14 cijfers)     → {soort: 'artikel', code, artikel_id}: het
--                            artikel op de Toonbank met precies één slot van
--                            1 stuk van het product met die EAN (actief,
--                            favoriet, volgorde, naam bij meer dan één)
--   anders                 → {soort: 'onbekend', code}
-- PLU en stukcode (kaas) volgen met de volledige catalogus (Fase 3).
-- INVOKER: met RLS voor een ingelogde gebruiker, de API filtert via p_org.
CREATE OR REPLACE FUNCTION public.scan_resolve(p_org UUID, p_code TEXT)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_code    TEXT := btrim(COALESCE(p_code, ''));
    v_order   BIGINT;
    v_nummer  TEXT;
    v_artikel UUID;
BEGIN
    PERFORM private.vereis_org(p_org);

    IF lower(v_code) ~ '^[0-9a-f]{32,128}$' THEN
        SELECT o.id, o.nummer INTO v_order, v_nummer
          FROM public.winkel_dozen d
          JOIN public.winkel_orders o ON o.id = d.order_id
         WHERE d.organization_id = p_org AND d.code = lower(v_code);
        IF FOUND THEN
            RETURN jsonb_build_object('soort', 'doos', 'code', lower(v_code), 'order_id', v_order, 'nummer', v_nummer);
        END IF;
    ELSIF v_code ~ '^[0-9]{8,14}$' THEN
        SELECT a.id INTO v_artikel
          FROM public.winkel_producten p
          JOIN public.winkel_artikel_slots s ON s.standaard_product_id = p.id
          JOIN public.winkel_artikelen a ON a.id = s.artikel_id
         WHERE p.organization_id = p_org
           AND p.ean = v_code
           AND a.organization_id = p_org
           AND 'toonbank' = ANY (a.kanalen)
           AND a.prijs_cents IS NOT NULL
           AND s.hoeveelheid = 1
           AND (SELECT count(*) FROM public.winkel_artikel_slots s2 WHERE s2.artikel_id = a.id) = 1
         ORDER BY a.actief DESC, a.toonbank_favoriet DESC, a.toonbank_volgorde, a.naam, a.id
         LIMIT 1;
        IF v_artikel IS NOT NULL THEN
            RETURN jsonb_build_object('soort', 'artikel', 'code', v_code, 'artikel_id', v_artikel);
        END IF;
    END IF;

    RETURN jsonb_build_object('soort', 'onbekend', 'code', CASE WHEN v_code = '' THEN '?' ELSE left(v_code, 200) END);
END $$;
COMMENT ON FUNCTION public.scan_resolve(UUID, TEXT) IS
    'BA-8: een gescande code opzoeken voor de Toonbank: dooscode → doos, EAN van een één-slot-artikel op de Toonbank → artikel, anders onbekend.';
REVOKE ALL ON FUNCTION public.scan_resolve(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.scan_resolve(UUID, TEXT) TO authenticated, service_role;


-- ── 7. Zelfcontrole ─────────────────────────────────────────────────────────
DO $$
DECLARE
    v_sig    TEXT;
    v_fouten TEXT := '';
BEGIN
    FOREACH v_sig IN ARRAY ARRAY[
        'public.toonbank_afhaallijst_versie(uuid)',
        'public.toonbank_catalogus(uuid)',
        'public.toonbank_vrij(uuid)',
        'public.toonbank_wegzet_vraag(uuid, uuid, bigint, text, uuid, timestamp with time zone, uuid, text, text)',
        'public.toonbank_afhaallijst(uuid, date)',
        'public.toonbank_status(uuid, uuid, bigint, text, text)'
    ] LOOP
        IF has_function_privilege('anon', v_sig, 'EXECUTE') OR has_function_privilege('authenticated', v_sig, 'EXECUTE') THEN
            v_fouten := v_fouten || E'\n  anon of authenticated mag ' || v_sig;
        END IF;
        IF NOT has_function_privilege('service_role', v_sig, 'EXECUTE') THEN
            v_fouten := v_fouten || E'\n  service_role mist ' || v_sig;
        END IF;
    END LOOP;
    IF has_function_privilege('anon', 'public.scan_resolve(uuid, text)', 'EXECUTE')
       OR NOT has_function_privilege('authenticated', 'public.scan_resolve(uuid, text)', 'EXECUTE')
       OR NOT has_function_privilege('service_role', 'public.scan_resolve(uuid, text)', 'EXECUTE') THEN
        v_fouten := v_fouten || E'\n  rechten op scan_resolve kloppen niet';
    END IF;
    FOREACH v_sig IN ARRAY ARRAY[
        'public.toonbank_afhaallijst_versie(uuid)', 'public.toonbank_catalogus(uuid)', 'public.toonbank_vrij(uuid)',
        'public.toonbank_wegzet_vraag(uuid, uuid, bigint, text, uuid, timestamp with time zone, uuid, text, text)',
        'public.toonbank_afhaallijst(uuid, date)', 'public.scan_resolve(uuid, text)'
    ] LOOP
        IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid = v_sig::REGPROCEDURE AND NOT prosecdef AND proconfig @> ARRAY['search_path=public, pg_temp'])
           OR pg_get_functiondef(v_sig::REGPROCEDURE) NOT LIKE '%PERFORM private.vereis_org(p_org)%' THEN
            v_fouten := v_fouten || E'\n  geen INVOKER met vast search_path en vereis_org: ' || v_sig;
        END IF;
    END LOOP;
    IF v_fouten <> '' THEN
        RAISE EXCEPTION 'toonbank_vragen: zelfcontrole mislukt, er is niets veranderd:%', v_fouten;
    END IF;
END $$;
