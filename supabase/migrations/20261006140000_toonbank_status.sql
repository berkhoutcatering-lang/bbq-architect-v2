-- ════════════════════════════════════════════════════════════════════════════
--  BA-7b — Toonbank: instellingen en GET status in één aanroep
--  Plan v5 §M2 (BA-7b) · Contract toonbank/v1 §3.3 (GET status), §1.8
--  Test: supabase/tests/toonbank_status.sql (alleen op de dev-database)
-- ════════════════════════════════════════════════════════════════════════════
--
--  Wat erbij komt
--    1. Drie instellingen op winkel_instellingen, voor de Toonbank:
--       - toonbank_alcohol_toegestaan (standaard false): alcohol verkopen kan
--         pas als Mathijs de winkelstatus heeft bevestigd (contract §3.3);
--       - toonbank_contant_aan (standaard true);
--       - toonbank_contant_limiet_cents (standaard 300000 = € 3.000, nooit
--         hoger: contant vanaf € 3.000 is verboden sinds 1 januari 2026).
--    2. toonbank_status(p_org, p_apparaat_id, p_volgnummer, p_app_versie,
--       p_contract_versie): legt "laatst gezien" en het hoogste volgnummer
--       vast (toonbank_apparaat_gezien) en geeft alles wat GET status nodig
--       heeft in één jsonb. Elke 30 seconden per tablet, dus één aanroep.
--
--  afhaallijst_versie [voorstel BA-7b]: er is (nog) geen eigen teller. De
--  versie is het tijdstip in milliseconden van de laatste wijziging die de
--  afhaallijst raakt: een order (updated_at: status, rest betaald, …), een
--  doos die is opgehaald, of de voorraadteller (apart zetten, ophalen,
--  klaarzetten; winkel_voorraad_versie.gewijzigd_at). Alle drie gaan alleen
--  vooruit, dus de versie ook; de tablet vergelijkt alleen op "anders".
--
--  hoogste_bon_volgnummer: het hoogste bon_volgnummer van dit apparaat in het
--  journaal (bon en tegenbon). bevestigd_tot_volgnummer houdt BA-9 bij.
--
--  Rechten: SECURITY INVOKER met private.vereis_org, alleen voor
--  service_role (de Toonbank-API). service_role gaat langs RLS: daarom
--  filtert elke query hier op p_org.


-- ── 0. Pre-flight ───────────────────────────────────────────────────────────
DO $$
DECLARE
    v_sig       TEXT;
    v_ontbreekt TEXT := '';
BEGIN
    FOREACH v_sig IN ARRAY ARRAY[
        'private.vereis_org(uuid)',
        'public.winkel_voorraad_stand(uuid)',
        'public.toonbank_apparaat_gezien(uuid, uuid, bigint, text, text)'
    ] LOOP
        IF to_regprocedure(v_sig) IS NULL THEN
            v_ontbreekt := v_ontbreekt || E'\n  functie ' || v_sig;
        END IF;
    END LOOP;
    FOREACH v_sig IN ARRAY ARRAY['public.winkel_instellingen', 'public.winkel_catalogus_versie', 'public.winkel_voorraad_versie',
                                 'public.winkel_wegzet_taken', 'public.winkel_dozen', 'public.toonbank_apparaten', 'public.toonbank_journaal'] LOOP
        IF to_regclass(v_sig) IS NULL THEN
            v_ontbreekt := v_ontbreekt || E'\n  tabel/view ' || v_sig;
        END IF;
    END LOOP;
    IF v_ontbreekt <> '' THEN
        RAISE EXCEPTION 'toonbank_status: dit ontbreekt (eerst BA-5, BA-6, BA-4a en BA-7a):%', v_ontbreekt;
    END IF;
END $$;


-- ── 1. Instellingen voor de Toonbank ────────────────────────────────────────
ALTER TABLE public.winkel_instellingen
    ADD COLUMN IF NOT EXISTS toonbank_alcohol_toegestaan BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS toonbank_contant_aan BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS toonbank_contant_limiet_cents INTEGER NOT NULL DEFAULT 300000
        CONSTRAINT winkel_instellingen_toonbank_contant_limiet_check CHECK (toonbank_contant_limiet_cents BETWEEN 1 AND 300000);
COMMENT ON COLUMN public.winkel_instellingen.toonbank_alcohol_toegestaan IS
    'Toonbank: alcohol verkopen mag (pas aanzetten als de winkelstatus is bevestigd). Standaard uit.';
COMMENT ON COLUMN public.winkel_instellingen.toonbank_contant_aan IS 'Toonbank: contant betalen kan.';
COMMENT ON COLUMN public.winkel_instellingen.toonbank_contant_limiet_cents IS
    'Toonbank: contant alleen onder dit bedrag per bon. Nooit hoger dan 300000 (€ 3.000, Wwft sinds 1 januari 2026).';


-- ── 2. toonbank_status ──────────────────────────────────────────────────────
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
    v_afh      TIMESTAMPTZ;
BEGIN
    PERFORM private.vereis_org(p_org);

    -- Laatst gezien en het hoogste volgnummer (nooit omlaag); P0002 als de
    -- tablet niet (meer) bestaat of is ingetrokken.
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

    SELECT GREATEST(
               (SELECT max(o.updated_at) FROM public.winkel_orders o WHERE o.organization_id = p_org),
               (SELECT max(d.opgehaald_at) FROM public.winkel_dozen d WHERE d.organization_id = p_org),
               (SELECT v.gewijzigd_at FROM public.winkel_voorraad_versie v WHERE v.organization_id = p_org))
      INTO v_afh;

    RETURN jsonb_build_object(
        'servertijd', now(),
        'apparaat', jsonb_build_object('apparaat_id', v_app->'id', 'code', v_app->'code', 'naam', v_app->'naam'),
        'catalogus_versie', COALESCE(v_cv, 0),
        'voorraad_versie', COALESCE((v_stand->>'versie')::BIGINT, 0),
        'vrij_verloopt_at', v_stand->'vrij_verloopt_at',
        'afhaallijst_versie', COALESCE(floor(extract(epoch FROM v_afh) * 1000)::BIGINT, 0),
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
COMMENT ON FUNCTION public.toonbank_status(UUID, UUID, BIGINT, TEXT, TEXT) IS
    'GET /api/toonbank/v1/status in één aanroep: apparaat gezien + catalogus-, voorraad- en afhaallijstversie, wegzet-badge, te controleren, instellingen. Alleen service_role.';
REVOKE ALL ON FUNCTION public.toonbank_status(UUID, UUID, BIGINT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.toonbank_status(UUID, UUID, BIGINT, TEXT, TEXT) TO service_role;


-- ── 3. Zelfcontrole ─────────────────────────────────────────────────────────
DO $$
DECLARE
    v_sig    TEXT := 'public.toonbank_status(uuid, uuid, bigint, text, text)';
    v_fouten TEXT := '';
BEGIN
    IF has_function_privilege('anon', v_sig, 'EXECUTE') OR has_function_privilege('authenticated', v_sig, 'EXECUTE') THEN
        v_fouten := v_fouten || E'\n  anon of authenticated mag ' || v_sig;
    END IF;
    IF NOT has_function_privilege('service_role', v_sig, 'EXECUTE') THEN
        v_fouten := v_fouten || E'\n  service_role mist ' || v_sig;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid = v_sig::REGPROCEDURE AND NOT prosecdef AND proconfig @> ARRAY['search_path=public, pg_temp'])
       OR pg_get_functiondef(v_sig::REGPROCEDURE) NOT LIKE '%PERFORM private.vereis_org(p_org)%' THEN
        v_fouten := v_fouten || E'\n  geen INVOKER met vast search_path en vereis_org: ' || v_sig;
    END IF;
    IF v_fouten <> '' THEN
        RAISE EXCEPTION 'toonbank_status: zelfcontrole mislukt, er is niets veranderd:%', v_fouten;
    END IF;
END $$;
