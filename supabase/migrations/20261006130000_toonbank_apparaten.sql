-- ════════════════════════════════════════════════════════════════════════════
--  BA-7a — Toonbank: apparaten, sessies, inlogrol en het journaal
--  Plan v5 §M2 (BA-7a) · Contract toonbank/v1 §1.1, §1.2, §2 (inlogcode),
--  §3.2, §3.3 (koppelen, inloggen), §7
--  Test: supabase/tests/toonbank_apparaten.sql (alleen op de dev-database)
-- ════════════════════════════════════════════════════════════════════════════
--
--  Wat erbij komt
--    1. personeel.toonbank_rol: 'medewerker' of 'eigenaar'; NULL = geen
--       toegang tot de Toonbank. De inlogcode is de bestaande
--       personeel.kds_pin_hash (scrypt, src/lib/prep/deviceAuth.ts), met de
--       bestaande blokkade kds_pin_lockout_until: één code per persoon.
--    2. toonbank_apparaten: één rij per tablet. De sleutel (tb_…) staat er
--       alleen als SHA-256; hij wordt één keer getoond. Koppelen gaat met een
--       code van 6 cijfers (scrypt-hash, 5 minuten geldig). Een apparaat
--       wordt nooit verwijderd, alleen ingetrokken.
--    3. toonbank_sessies: ingelogde medewerkers (doel 'dienst') en
--       eigenaargoedkeuringen voor verkopen boven vrij (doel
--       'vrij_overschrijden', 60 seconden; het id is het goedkeuring_id uit
--       het contract). Alleen service_role: geen policies.
--    4. toonbank_journaal: alles wat de Toonbank meldt, ongewijzigd. Uniek op
--       (organization_id, gebeurtenis_id) en (apparaat_id, volgnummer). Een
--       trigger weigert DELETE en TRUNCATE, en bij UPDATE mag alleen de
--       verwerking veranderen (verwerk_status … opgelost_at, resultaat).
--       Bewaren: 7 jaar, daarom ON DELETE RESTRICT naar organisatie en
--       apparaat.
--
--  Koppelen (contract §3.3, POST koppelen): de tablet stuurt alleen de code;
--  de organisatie is dan nog onbekend. De API haalt de open codes op
--  (toonbank_koppel_kandidaten), controleert ze met scrypt en maakt het af
--  met toonbank_koppel_af (alleen als de code nog open is: geen race). Een
--  foute code wordt per bron (SHA-256 van het IP-adres, bij IPv6 van het
--  /56-netwerk: hercontrole N4b) bijgehouden: 5 per
--  15 minuten, daarna 429 (toonbank_koppel_geblokkeerd). Die 5 tellen mee
--  bij álle open codes (toonbank_koppel_mislukt); na 25 vervalt een code
--  (review M2 klein 7: eerst blokkeerden 5 verzoeken het koppelen voor
--  iedereen). Zo houdt de database de pogingen bij, niet het geheugen van één
--  serverinstantie.
--
--  Inlogcode fout (toonbank_inlogcode_mislukt): telt de mislukte pogingen
--  van deze persoon sinds zijn laatste Toonbank-sessie in de laatste 10
--  minuten (kds_audit_logs, net als de KDS), en zet bij 5 de blokkade van 5
--  minuten. De persoon is vergrendeld (FOR UPDATE): twee tablets tegelijk
--  tellen samen.
--
--  Rechten
--    - Beheer (apparaat nieuw, nieuwe koppelcode, intrekken): SECURITY
--      DEFINER met private.vereis_org, voor authenticated en service_role;
--      voor een ingelogde gebruiker alleen als Admin (review M2 K4,
--      private.toonbank_vereis_admin).
--    - personeel: toonbank_rol, kds_pin_hash en kds_pin_lockout_until zet
--      via de API alleen een Admin (trigger); kds_pin_hash is voor ingelogde
--      gebruikers niet leesbaar (kolomrechten, review M2 K4).
--    - Koppelen en de inlogteller: alleen service_role (de Toonbank-API).
--    - authenticated leest apparaten (zonder de hashes) en het journaal van
--      de eigen organisatie; schrijven alleen via de functies.
--    - Niets voor PUBLIC en anon.


-- ── 0. Pre-flight ───────────────────────────────────────────────────────────
DO $$
DECLARE
    v_sig       TEXT;
    v_ontbreekt TEXT := '';
BEGIN
    IF (SELECT count(*) FROM pg_roles WHERE rolname IN ('anon', 'authenticated', 'service_role')) <> 3 THEN
        RAISE EXCEPTION 'toonbank_apparaten: de Supabase-rollen anon, authenticated en service_role ontbreken';
    END IF;
    FOREACH v_sig IN ARRAY ARRAY['private.user_org_ids()', 'private.vereis_org(uuid)']
    LOOP
        IF to_regprocedure(v_sig) IS NULL THEN
            v_ontbreekt := v_ontbreekt || E'\n  functie ' || v_sig;
        END IF;
    END LOOP;
    FOREACH v_sig IN ARRAY ARRAY['public.organizations', 'public.personeel', 'public.kds_audit_logs', 'public.winkel_catalogus_versie']
    LOOP
        IF to_regclass(v_sig) IS NULL THEN
            v_ontbreekt := v_ontbreekt || E'\n  tabel ' || v_sig;
        END IF;
    END LOOP;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'personeel' AND column_name = 'kds_pin_hash')
       OR NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'personeel' AND column_name = 'kds_pin_lockout_until') THEN
        v_ontbreekt := v_ontbreekt || E'\n  kolommen personeel.kds_pin_hash / kds_pin_lockout_until (migratie 20260511140000_prep_kds)';
    END IF;
    IF v_ontbreekt <> '' THEN
        RAISE EXCEPTION 'toonbank_apparaten: dit ontbreekt (eerst BA-S en BA-4a):%', v_ontbreekt;
    END IF;
END $$;


-- ── 1. personeel.toonbank_rol ───────────────────────────────────────────────
ALTER TABLE public.personeel
    ADD COLUMN IF NOT EXISTS toonbank_rol TEXT
        CONSTRAINT personeel_toonbank_rol_check CHECK (toonbank_rol IS NULL OR toonbank_rol IN ('medewerker', 'eigenaar'));
COMMENT ON COLUMN public.personeel.toonbank_rol IS
    'Toegang tot de Toonbank: medewerker of eigenaar (mag verkopen boven vrij goedkeuren). NULL = geen toegang. De inlogcode is kds_pin_hash (één code per persoon), in te stellen in Instellingen → Toonbank.';


-- ── 1b. Alleen een Admin beheert de Toonbank (review M2 K4) ─────────────────
-- De controle "alleen een Admin" zat alleen in de server actions. Een gewoon
-- lid kon de beheerfuncties direct aanroepen (een eigen tablet met een eigen
-- koppelcode-hash), en via personeel (RLS: elk actief lid mag lezen en
-- bijwerken) zichzelf eigenaar maken, een eigen inlogcode-hash zetten, de
-- blokkade opheffen en kds_pin_hash lezen (scrypt van 4-6 cijfers: offline
-- te kraken).
--
-- private.toonbank_vereis_admin(p_org): door bij een directe verbinding
-- (migratie, test) en service_role (de Toonbank-API); authenticated alleen als
-- actieve Admin van p_org. Anders 42501. Zelf SECURITY DEFINER, zodat ook de
-- trigger hieronder (die als authenticated draait) organization_members kan
-- lezen zonder RLS.
CREATE OR REPLACE FUNCTION private.toonbank_vereis_admin(p_org UUID)
RETURNS VOID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_claims TEXT := NULLIF(current_setting('request.jwt.claims', true), '');
BEGIN
    PERFORM private.vereis_org(p_org);
    IF v_claims IS NULL OR v_claims::JSONB ->> 'role' = 'service_role' THEN
        RETURN;
    END IF;
    IF EXISTS (SELECT 1 FROM public.organization_members m
                WHERE m.organization_id = p_org AND m.user_id = auth.uid() AND m.status = 'active' AND m.role = 'Admin') THEN
        RETURN;
    END IF;
    RAISE EXCEPTION 'alleen een beheerder (Admin) beheert de Toonbank: tablets, rollen en inlogcodes' USING ERRCODE = '42501';
END $$;
COMMENT ON FUNCTION private.toonbank_vereis_admin(UUID) IS
    'Review M2 K4: vereis_org plus, voor een ingelogde gebruiker, de rol Admin in p_org. Directe verbinding en service_role: door. Anders 42501.';
REVOKE ALL ON FUNCTION private.toonbank_vereis_admin(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.toonbank_vereis_admin(UUID) TO authenticated, service_role;

-- Op personeel: toonbank_rol, kds_pin_hash en kds_pin_lockout_until wijzigt
-- (of zet bij een nieuwe rij) alleen een Admin. service_role (de Toonbank-API,
-- de KDS-pincheck) en de eigenaar van de tabel (migraties en SECURITY
-- DEFINER-functies zoals toonbank_inlogcode_mislukt) mogen altijd: dan is
-- current_user niet authenticated of anon. Andere kolommen (naam, uurtarief,
-- actief …) blijven voor elk lid zoals ze waren.
CREATE OR REPLACE FUNCTION private.personeel_toonbank_bewaken()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
    IF current_user NOT IN ('authenticated', 'anon') THEN
        RETURN NEW;
    END IF;
    IF TG_OP = 'INSERT' THEN
        IF NEW.toonbank_rol IS NULL AND NEW.kds_pin_hash IS NULL AND NEW.kds_pin_lockout_until IS NULL THEN
            RETURN NEW;
        END IF;
    ELSIF NEW.toonbank_rol IS NOT DISTINCT FROM OLD.toonbank_rol
          AND NEW.kds_pin_hash IS NOT DISTINCT FROM OLD.kds_pin_hash
          AND NEW.kds_pin_lockout_until IS NOT DISTINCT FROM OLD.kds_pin_lockout_until
          AND NEW.organization_id IS NOT DISTINCT FROM OLD.organization_id THEN
        RETURN NEW;
    END IF;
    PERFORM private.toonbank_vereis_admin(NEW.organization_id);
    IF TG_OP = 'UPDATE' AND NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
        PERFORM private.toonbank_vereis_admin(OLD.organization_id);
    END IF;
    RETURN NEW;
END $$;
COMMENT ON FUNCTION private.personeel_toonbank_bewaken() IS
    'Review M2 K4: trigger op personeel. toonbank_rol, kds_pin_hash en kds_pin_lockout_until wijzigt via de API alleen een Admin (42501); service_role en SECURITY DEFINER-functies altijd.';
REVOKE ALL ON FUNCTION private.personeel_toonbank_bewaken() FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS trg_personeel_toonbank_bewaken ON public.personeel;
CREATE TRIGGER trg_personeel_toonbank_bewaken
    BEFORE INSERT OR UPDATE ON public.personeel
    FOR EACH ROW EXECUTE FUNCTION private.personeel_toonbank_bewaken();

-- kds_pin_hash is voor ingelogde gebruikers niet meer leesbaar. Een
-- kolomrecht intrekken helpt niet zolang het tabelrecht SELECT er is; dus het
-- tabelrecht weg en SELECT op alle andere kolommen terug. Let op: een kolom
-- die later bij personeel komt, krijgt authenticated dan niet vanzelf (de
-- objectproef meldt het); select('*') op personeel kan een gebruiker niet
-- meer. BBQ Architect leest personeel daarom met een kolomlijst
-- (usePersoneel), de KDS-pincheck met service_role, en het beheerscherm krijgt
-- alleen "ingesteld ja/nee" (toonbank_inlogcodes_ingesteld).
DO $$
DECLARE
    v_rol   TEXT;
    v_kol   TEXT;
BEGIN
    SELECT string_agg(quote_ident(a.attname), ', ' ORDER BY a.attnum) INTO v_kol
      FROM pg_attribute a
     WHERE a.attrelid = 'public.personeel'::REGCLASS AND a.attnum > 0 AND NOT a.attisdropped AND a.attname <> 'kds_pin_hash';
    FOREACH v_rol IN ARRAY ARRAY['anon', 'authenticated'] LOOP
        IF has_table_privilege(v_rol, 'public.personeel', 'SELECT') THEN
            EXECUTE format('REVOKE SELECT ON TABLE public.personeel FROM %I', v_rol);
            EXECUTE format('GRANT SELECT (%s) ON public.personeel TO %I', v_kol, v_rol);
        END IF;
        EXECUTE format('REVOKE SELECT (kds_pin_hash) ON public.personeel FROM %I', v_rol);
    END LOOP;
END $$;

-- Voor het beheerscherm: per medewerker alleen of er een inlogcode is.
CREATE OR REPLACE FUNCTION public.toonbank_inlogcodes_ingesteld(p_org UUID)
RETURNS TABLE (personeel_id UUID, ingesteld BOOLEAN)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    PERFORM private.vereis_org(p_org);
    RETURN QUERY
        SELECT p.id, p.kds_pin_hash IS NOT NULL
          FROM public.personeel p
         WHERE p.organization_id = p_org;
END $$;
COMMENT ON FUNCTION public.toonbank_inlogcodes_ingesteld(UUID) IS
    'Review M2 K4: per medewerker van p_org of er een inlogcode (kds_pin_hash) is, zonder de hash. Voor Instellingen → Toonbank.';
REVOKE ALL ON FUNCTION public.toonbank_inlogcodes_ingesteld(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.toonbank_inlogcodes_ingesteld(UUID) TO authenticated, service_role;


-- ── 2. toonbank_apparaten ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.toonbank_apparaten (
    id                         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id            UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
    naam                       TEXT        NOT NULL CHECK (length(btrim(naam)) BETWEEN 1 AND 60),
    code                       TEXT        NOT NULL CHECK (code ~ '^T[1-9][0-9]{0,3}$'),
    sleutel_hash               TEXT        UNIQUE CHECK (sleutel_hash IS NULL OR sleutel_hash ~ '^[0-9a-f]{64}$'),
    sleutel_prefix             TEXT,
    koppelcode_hash            TEXT        CHECK (koppelcode_hash IS NULL OR koppelcode_hash ~ '^[0-9a-f]{32}:[0-9a-f]{128}$'),
    koppelcode_geldig_tot      TIMESTAMPTZ,
    koppelpogingen             INTEGER     NOT NULL DEFAULT 0 CHECK (koppelpogingen >= 0),
    gekoppeld_at               TIMESTAMPTZ,
    locatie                    TEXT        NOT NULL DEFAULT 'winkel' CHECK (locatie IN ('winkel', 'event')),
    app_versie                 TEXT,
    contract_versie            TEXT,
    laatst_gezien_at           TIMESTAMPTZ,
    hoogste_volgnummer_gemeld  BIGINT      NOT NULL DEFAULT 0 CHECK (hoogste_volgnummer_gemeld >= 0),
    bevestigd_tot_volgnummer   BIGINT      NOT NULL DEFAULT 0 CHECK (bevestigd_tot_volgnummer >= 0),
    ingetrokken_at             TIMESTAMPTZ,
    ingetrokken_door           UUID,
    ingetrokken_reden          TEXT,
    aangemaakt_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    aangemaakt_door            UUID,
    CONSTRAINT toonbank_apparaten_code_uniek UNIQUE (organization_id, code),
    CONSTRAINT toonbank_apparaten_koppelcode_compleet CHECK ((koppelcode_hash IS NULL) = (koppelcode_geldig_tot IS NULL))
);
COMMENT ON TABLE public.toonbank_apparaten IS
    'Gekoppelde Toonbank-tablets (contract toonbank/v1 §1.1). Nooit verwijderen, alleen intrekken: bonnen en dagstaten verwijzen ernaar. Sleutel en koppelcode alleen als hash.';
COMMENT ON COLUMN public.toonbank_apparaten.sleutel_hash IS 'SHA-256 (hex) van de apparaatsleutel tb_…; de sleutel zelf wordt nergens bewaard.';
COMMENT ON COLUMN public.toonbank_apparaten.koppelcode_hash IS 'scrypt-hash (deviceAuth.hashPin) van de koppelcode van 6 cijfers; leeg buiten het koppelen.';
COMMENT ON COLUMN public.toonbank_apparaten.koppelpogingen IS 'Foute koppelpogingen sinds deze code (hooguit 5 per bron per 15 minuten); bij 25 vervalt de code (toonbank_koppel_mislukt).';

CREATE INDEX IF NOT EXISTS toonbank_apparaten_org_idx ON public.toonbank_apparaten (organization_id);
CREATE INDEX IF NOT EXISTS toonbank_apparaten_koppel_idx ON public.toonbank_apparaten (koppelcode_geldig_tot) WHERE koppelcode_hash IS NOT NULL;

ALTER TABLE public.toonbank_apparaten ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS toonbank_apparaten_select ON public.toonbank_apparaten;
CREATE POLICY toonbank_apparaten_select ON public.toonbank_apparaten FOR SELECT TO authenticated
    USING (organization_id IN (SELECT private.user_org_ids()));

REVOKE ALL ON TABLE public.toonbank_apparaten FROM PUBLIC, anon, authenticated, service_role;
-- authenticated: lezen zonder de hashes (kolomrechten); schrijven via de functies.
GRANT SELECT (id, organization_id, naam, code, sleutel_prefix, koppelcode_geldig_tot, koppelpogingen, gekoppeld_at,
              locatie, app_versie, contract_versie, laatst_gezien_at, hoogste_volgnummer_gemeld, bevestigd_tot_volgnummer,
              ingetrokken_at, ingetrokken_door, ingetrokken_reden, aangemaakt_at, aangemaakt_door)
    ON public.toonbank_apparaten TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.toonbank_apparaten TO service_role;


-- ── 3. toonbank_sessies ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.toonbank_sessies (
    id                       UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id          UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    apparaat_id              UUID        NOT NULL REFERENCES public.toonbank_apparaten(id) ON DELETE CASCADE,
    medewerker_id            UUID        NOT NULL REFERENCES public.personeel(id) ON DELETE CASCADE,
    token_hash               TEXT        NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
    rol                      TEXT        NOT NULL CHECK (rol IN ('medewerker', 'eigenaar')),
    doel                     TEXT        NOT NULL CHECK (doel IN ('dienst', 'vrij_overschrijden')),
    geldig_tot               TIMESTAMPTZ NOT NULL,
    aangemaakt_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    beeindigd_at             TIMESTAMPTZ,
    -- Bij een goedkeuring (doel vrij_overschrijden): de melding vrij_overschreden die hem gebruikte (BA-9).
    gebruikt_gebeurtenis_id  UUID,
    CONSTRAINT toonbank_sessies_eigenaar CHECK (doel <> 'vrij_overschrijden' OR rol = 'eigenaar'),
    CONSTRAINT toonbank_sessies_duur CHECK (geldig_tot > aangemaakt_at)
);
COMMENT ON TABLE public.toonbank_sessies IS
    'Inlogsessies van de Toonbank (doel dienst) en eigenaargoedkeuringen voor verkopen boven vrij (doel vrij_overschrijden, 60 s; id = goedkeuring_id). Token alleen als SHA-256. Alleen service_role.';

CREATE INDEX IF NOT EXISTS toonbank_sessies_medewerker_idx ON public.toonbank_sessies (medewerker_id, aangemaakt_at DESC);
CREATE INDEX IF NOT EXISTS toonbank_sessies_apparaat_idx ON public.toonbank_sessies (apparaat_id) WHERE beeindigd_at IS NULL;

ALTER TABLE public.toonbank_sessies ENABLE ROW LEVEL SECURITY;
-- Geen policies: alleen service_role (die gaat langs RLS).
REVOKE ALL ON TABLE public.toonbank_sessies FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.toonbank_sessies TO service_role;

-- ── 3b. Rol, inlogcode of actief anders: open sessies stoppen (review M2 K7)
-- Een dienst duurt 12 uur. Gaat de rol op NULL, wordt iemand op niet-actief
-- gezet of krijgt hij een nieuwe inlogcode, dan stoppen zijn open sessies
-- meteen, langs welke weg de wijziging ook komt (Instellingen → Toonbank, het
-- personeelsscherm, service_role). SECURITY DEFINER: de gebruikersclient mag
-- zelf niet in toonbank_sessies schrijven. De Toonbank-API controleert bij
-- elk verzoek bovendien dat de persoon actief is met een rol (sessieOpToken).
CREATE OR REPLACE FUNCTION private.personeel_toonbank_sessies_stoppen()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    UPDATE public.toonbank_sessies
       SET beeindigd_at = now()
     WHERE medewerker_id = NEW.id AND beeindigd_at IS NULL;
    RETURN NULL;
END $$;
COMMENT ON FUNCTION private.personeel_toonbank_sessies_stoppen() IS
    'Review M2 K7: trigger op personeel. Andere toonbank_rol, kds_pin_hash of actief → alle open Toonbank-sessies van die persoon beëindigd.';
REVOKE ALL ON FUNCTION private.personeel_toonbank_sessies_stoppen() FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS trg_personeel_toonbank_sessies_stoppen ON public.personeel;
CREATE TRIGGER trg_personeel_toonbank_sessies_stoppen
    AFTER UPDATE OF toonbank_rol, kds_pin_hash, actief ON public.personeel
    FOR EACH ROW
    WHEN (OLD.toonbank_rol IS DISTINCT FROM NEW.toonbank_rol
          OR OLD.kds_pin_hash IS DISTINCT FROM NEW.kds_pin_hash
          OR OLD.actief IS DISTINCT FROM NEW.actief)
    EXECUTE FUNCTION private.personeel_toonbank_sessies_stoppen();


-- ── 4. toonbank_journaal ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.toonbank_journaal (
    id               BIGINT      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    organization_id  UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
    apparaat_id      UUID        NOT NULL REFERENCES public.toonbank_apparaten(id) ON DELETE RESTRICT,
    gebeurtenis_id   UUID        NOT NULL,
    -- Leeg bij een vraag (wegzetten, ophalen): die gaan niet via de verzendbak (contract §1.2).
    volgnummer       BIGINT      CHECK (volgnummer IS NULL OR volgnummer > 0),
    soort            TEXT        NOT NULL CHECK (soort ~ '^[a-z][a-z_]{1,40}$'),
    contract_versie  TEXT,
    payload          JSONB       NOT NULL,
    apparaat_tijd    TIMESTAMPTZ,
    ontvangen_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    gat_voor         BOOLEAN     NOT NULL DEFAULT false,
    vorige_hash      TEXT,
    hash             TEXT,
    -- Verwerking (alleen deze kolommen mogen nog veranderen):
    verwerk_status   TEXT        NOT NULL DEFAULT 'wacht'
                                 CHECK (verwerk_status IN ('wacht', 'verwerkt', 'niet_nodig', 'fout', 'conflict', 'opgelost')),
    pogingen         INTEGER     NOT NULL DEFAULT 0 CHECK (pogingen >= 0),
    fout_code        TEXT,
    fout_melding     TEXT,
    verwerkt_at      TIMESTAMPTZ,
    opgelost_door    UUID,
    opgelost_reden   TEXT,
    opgelost_at      TIMESTAMPTZ,
    resultaat        JSONB,
    CONSTRAINT toonbank_journaal_gebeurtenis_uniek UNIQUE (organization_id, gebeurtenis_id),
    CONSTRAINT toonbank_journaal_volgnummer_uniek UNIQUE (apparaat_id, volgnummer)
);
COMMENT ON TABLE public.toonbank_journaal IS
    'Alles wat de Toonbank meldt, ongewijzigd (contract toonbank/v1 §1.2): eerst opslaan, dan verwerken. Append-only: geen DELETE, en bij UPDATE alleen de verwerking. 7 jaar bewaren.';
COMMENT ON COLUMN public.toonbank_journaal.resultaat IS
    'De uitkomst van de verwerking of van een vraag (bijvoorbeeld wegzetten: uitkomst en boekingen). [voorstel BA-7a: niet in contract §1.2]';

CREATE INDEX IF NOT EXISTS toonbank_journaal_apparaat_idx ON public.toonbank_journaal (apparaat_id, volgnummer DESC);
CREATE INDEX IF NOT EXISTS toonbank_journaal_controleren_idx ON public.toonbank_journaal (organization_id, apparaat_id)
    WHERE verwerk_status IN ('fout', 'conflict');
CREATE INDEX IF NOT EXISTS toonbank_journaal_wacht_idx ON public.toonbank_journaal (organization_id, id)
    WHERE verwerk_status = 'wacht';

-- Append-only: DELETE en TRUNCATE nooit; UPDATE alleen op de verwerking.
CREATE OR REPLACE FUNCTION private.toonbank_journaal_alleen_toevoegen()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
    c_verwerking CONSTANT TEXT[] := ARRAY['verwerk_status', 'pogingen', 'fout_code', 'fout_melding', 'verwerkt_at',
                                          'opgelost_door', 'opgelost_reden', 'opgelost_at', 'resultaat'];
BEGIN
    IF TG_OP = 'DELETE' OR TG_OP = 'TRUNCATE' THEN
        RAISE EXCEPTION 'TB001: het toonbank-journaal is niet te verwijderen (7 jaar bewaren)' USING ERRCODE = 'TB001';
    END IF;
    IF (to_jsonb(OLD) - c_verwerking) IS DISTINCT FROM (to_jsonb(NEW) - c_verwerking) THEN
        RAISE EXCEPTION 'TB001: in het toonbank-journaal mag alleen de verwerking veranderen (melding %)', OLD.id USING ERRCODE = 'TB001';
    END IF;
    RETURN NEW;
END $$;
COMMENT ON FUNCTION private.toonbank_journaal_alleen_toevoegen() IS
    'Trigger op toonbank_journaal: weigert DELETE en TRUNCATE (TB001) en elke UPDATE buiten de verwerkingsvelden.';
REVOKE ALL ON FUNCTION private.toonbank_journaal_alleen_toevoegen() FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS trg_toonbank_journaal_alleen_toevoegen ON public.toonbank_journaal;
CREATE TRIGGER trg_toonbank_journaal_alleen_toevoegen
    BEFORE UPDATE OR DELETE ON public.toonbank_journaal
    FOR EACH ROW EXECUTE FUNCTION private.toonbank_journaal_alleen_toevoegen();
DROP TRIGGER IF EXISTS trg_toonbank_journaal_geen_truncate ON public.toonbank_journaal;
CREATE TRIGGER trg_toonbank_journaal_geen_truncate
    BEFORE TRUNCATE ON public.toonbank_journaal
    FOR EACH STATEMENT EXECUTE FUNCTION private.toonbank_journaal_alleen_toevoegen();

ALTER TABLE public.toonbank_journaal ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS toonbank_journaal_select ON public.toonbank_journaal;
CREATE POLICY toonbank_journaal_select ON public.toonbank_journaal FOR SELECT TO authenticated
    USING (organization_id IN (SELECT private.user_org_ids()));

REVOKE ALL ON TABLE public.toonbank_journaal FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.toonbank_journaal TO authenticated;
GRANT SELECT, INSERT ON TABLE public.toonbank_journaal TO service_role;
GRANT UPDATE (verwerk_status, pogingen, fout_code, fout_melding, verwerkt_at, opgelost_door, opgelost_reden, opgelost_at, resultaat)
    ON public.toonbank_journaal TO service_role;


-- ── 5. Beheer: apparaat nieuw, nieuwe koppelcode, intrekken ────────────────
-- De koppelcode maakt BBQ Architect (crypto.randomInt) en hasht hij met
-- scrypt; hier komt alleen de hash. Geldig: 5 minuten vanaf nu (de database
-- bepaalt de klok).
CREATE OR REPLACE FUNCTION public.toonbank_apparaat_nieuw(
    p_org              UUID,
    p_naam             TEXT,
    p_locatie          TEXT,
    p_koppelcode_hash  TEXT,
    p_door             UUID DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_nr   INTEGER;
    v_rij  public.toonbank_apparaten%ROWTYPE;
BEGIN
    PERFORM private.vereis_org(p_org);
    PERFORM private.toonbank_vereis_admin(p_org);

    IF p_naam IS NULL OR length(btrim(p_naam)) NOT BETWEEN 1 AND 60 THEN
        RAISE EXCEPTION 'naam van de tablet: 1 tot 60 tekens' USING ERRCODE = '22023';
    END IF;
    IF p_koppelcode_hash IS NULL OR p_koppelcode_hash !~ '^[0-9a-f]{32}:[0-9a-f]{128}$' THEN
        RAISE EXCEPTION 'koppelcode-hash in het verkeerde formaat' USING ERRCODE = '22023';
    END IF;

    -- Eén nummer tegelijk per organisatie: T1, T2, … (gaten blijven gaten).
    PERFORM pg_advisory_xact_lock(hashtextextended('toonbank_apparaat_code:' || p_org::TEXT, 0));
    SELECT COALESCE(max(substr(a.code, 2)::INTEGER), 0) + 1 INTO v_nr
      FROM public.toonbank_apparaten a
     WHERE a.organization_id = p_org;

    INSERT INTO public.toonbank_apparaten (organization_id, naam, code, locatie, koppelcode_hash, koppelcode_geldig_tot, aangemaakt_door)
    VALUES (p_org, btrim(p_naam), 'T' || v_nr, COALESCE(p_locatie, 'winkel'), p_koppelcode_hash, now() + INTERVAL '5 minutes',
            COALESCE(auth.uid(), p_door))
    RETURNING * INTO v_rij;

    RETURN jsonb_build_object('apparaat_id', v_rij.id, 'code', v_rij.code, 'naam', v_rij.naam,
                              'koppelcode_geldig_tot', v_rij.koppelcode_geldig_tot);
END $$;
COMMENT ON FUNCTION public.toonbank_apparaat_nieuw(UUID, TEXT, TEXT, TEXT, UUID) IS
    'Tablet toevoegen (BA-7a): nieuw apparaat met code T<n> en een koppelcode-hash die 5 minuten geldig is.';
REVOKE ALL ON FUNCTION public.toonbank_apparaat_nieuw(UUID, TEXT, TEXT, TEXT, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.toonbank_apparaat_nieuw(UUID, TEXT, TEXT, TEXT, UUID) TO authenticated, service_role;

-- Opnieuw koppelen (nieuwe tablet, gewiste opslag): een nieuwe code. De oude
-- sleutel blijft werken tot de nieuwe koppeling lukt.
CREATE OR REPLACE FUNCTION public.toonbank_apparaat_koppelcode(
    p_org              UUID,
    p_apparaat_id      UUID,
    p_koppelcode_hash  TEXT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_rij public.toonbank_apparaten%ROWTYPE;
BEGIN
    PERFORM private.vereis_org(p_org);
    PERFORM private.toonbank_vereis_admin(p_org);

    IF p_koppelcode_hash IS NULL OR p_koppelcode_hash !~ '^[0-9a-f]{32}:[0-9a-f]{128}$' THEN
        RAISE EXCEPTION 'koppelcode-hash in het verkeerde formaat' USING ERRCODE = '22023';
    END IF;

    UPDATE public.toonbank_apparaten
       SET koppelcode_hash = p_koppelcode_hash,
           koppelcode_geldig_tot = now() + INTERVAL '5 minutes',
           koppelpogingen = 0
     WHERE id = p_apparaat_id AND organization_id = p_org AND ingetrokken_at IS NULL
    RETURNING * INTO v_rij;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'tablet % niet gevonden of ingetrokken', p_apparaat_id USING ERRCODE = 'P0002';
    END IF;

    RETURN jsonb_build_object('apparaat_id', v_rij.id, 'code', v_rij.code, 'naam', v_rij.naam,
                              'koppelcode_geldig_tot', v_rij.koppelcode_geldig_tot);
END $$;
COMMENT ON FUNCTION public.toonbank_apparaat_koppelcode(UUID, UUID, TEXT) IS
    'Nieuwe koppelcode (5 minuten) voor een bestaande tablet; telt de pogingen opnieuw.';
REVOKE ALL ON FUNCTION public.toonbank_apparaat_koppelcode(UUID, UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.toonbank_apparaat_koppelcode(UUID, UUID, TEXT) TO authenticated, service_role;

-- Intrekken: de sleutel werkt meteen niet meer, open sessies stoppen.
-- Nooit verwijderen. Een tweede keer: niets nieuws.
CREATE OR REPLACE FUNCTION public.toonbank_apparaat_intrekken(
    p_org          UUID,
    p_apparaat_id  UUID,
    p_reden        TEXT DEFAULT NULL,
    p_door         UUID DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_rij public.toonbank_apparaten%ROWTYPE;
BEGIN
    PERFORM private.vereis_org(p_org);
    PERFORM private.toonbank_vereis_admin(p_org);

    SELECT * INTO v_rij FROM public.toonbank_apparaten
     WHERE id = p_apparaat_id AND organization_id = p_org
       FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'tablet % niet in deze organisatie', p_apparaat_id USING ERRCODE = 'P0002';
    END IF;
    IF v_rij.ingetrokken_at IS NOT NULL THEN
        RETURN jsonb_build_object('uitkomst', 'al_ingetrokken', 'apparaat_id', v_rij.id, 'ingetrokken_at', v_rij.ingetrokken_at);
    END IF;

    UPDATE public.toonbank_apparaten
       SET ingetrokken_at = now(),
           ingetrokken_door = COALESCE(auth.uid(), p_door),
           ingetrokken_reden = NULLIF(btrim(COALESCE(p_reden, '')), ''),
           koppelcode_hash = NULL,
           koppelcode_geldig_tot = NULL
     WHERE id = v_rij.id
    RETURNING * INTO v_rij;

    UPDATE public.toonbank_sessies
       SET beeindigd_at = now()
     WHERE apparaat_id = v_rij.id AND beeindigd_at IS NULL;

    RETURN jsonb_build_object('uitkomst', 'ingetrokken', 'apparaat_id', v_rij.id, 'ingetrokken_at', v_rij.ingetrokken_at);
END $$;
COMMENT ON FUNCTION public.toonbank_apparaat_intrekken(UUID, UUID, TEXT, UUID) IS
    'Tablet intrekken: sleutel meteen ongeldig, open sessies beëindigd. Nooit verwijderen.';
REVOKE ALL ON FUNCTION public.toonbank_apparaat_intrekken(UUID, UUID, TEXT, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.toonbank_apparaat_intrekken(UUID, UUID, TEXT, UUID) TO authenticated, service_role;


-- ── 6. Koppelen (alleen service_role: de Toonbank-API) ──────────────────────
-- SECURITY INVOKER: draait met de rechten van service_role. Geen p_org: bij
-- het koppelen is de organisatie nog niet bekend; de code bepaalt hem.
--
-- Review M2 (klein 7): eerst telde elke foute code mee bij álle open codes
-- van alle organisaties, en na 5 verviel een code: vijf verzoeken blokkeerden
-- het koppelen voor iedereen. Nu per bron (SHA-256 van het IP-adres, bij
-- IPv6 van het /56-netwerk (hercontrole N4b, koppelen.ts koppelNetwerk); nooit
-- het adres zelf): een bron mag 5 foute codes per 15 minuten, daarna 429
-- (toonbank_koppel_geblokkeerd). Alleen die 5 tellen mee bij de open codes;
-- een code vervalt pas na 25 foute pogingen, dus van minstens 5 bronnen. Wie
-- raadt, heeft zo hooguit 25 kansen op 1.000.000 per code.
CREATE TABLE IF NOT EXISTS public.toonbank_koppel_pogingen (
    id    BIGINT      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    bron  TEXT        NOT NULL CHECK (bron ~ '^[0-9a-f]{64}$'),
    at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.toonbank_koppel_pogingen IS
    'Foute koppelcodes per bron (SHA-256 van het IPv4-adres of het IPv6-/56-netwerk), voor de grens van 5 per 15 minuten (review M2 klein 7). Ouder dan een dag wordt opgeruimd. Alleen service_role.';
CREATE INDEX IF NOT EXISTS toonbank_koppel_pogingen_bron_idx ON public.toonbank_koppel_pogingen (bron, at DESC);
ALTER TABLE public.toonbank_koppel_pogingen ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.toonbank_koppel_pogingen FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, DELETE ON TABLE public.toonbank_koppel_pogingen TO service_role;

-- De open koppelcodes (hooguit een handvol tegelijk).
CREATE OR REPLACE FUNCTION public.toonbank_koppel_kandidaten()
RETURNS TABLE (apparaat_id UUID, organization_id UUID, koppelcode_hash TEXT)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
    SELECT a.id, a.organization_id, a.koppelcode_hash
      FROM public.toonbank_apparaten a
     WHERE a.koppelcode_hash IS NOT NULL
       AND a.koppelcode_geldig_tot > now()
       AND a.koppelpogingen < 25
       AND a.ingetrokken_at IS NULL
     ORDER BY a.koppelcode_geldig_tot
     LIMIT 50;
$$;
COMMENT ON FUNCTION public.toonbank_koppel_kandidaten() IS
    'De open koppelcodes (hash), voor POST /api/toonbank/v1/koppelen. Alleen service_role.';
REVOKE ALL ON FUNCTION public.toonbank_koppel_kandidaten() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.toonbank_koppel_kandidaten() TO service_role;

-- Mag deze bron nog een code proberen? Nee na 5 foute codes in 15 minuten.
CREATE OR REPLACE FUNCTION public.toonbank_koppel_geblokkeerd(p_bron TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
    SELECT (SELECT count(*) FROM public.toonbank_koppel_pogingen p
             WHERE p.bron = p_bron AND p.at > now() - INTERVAL '15 minutes') >= 5;
$$;
COMMENT ON FUNCTION public.toonbank_koppel_geblokkeerd(TEXT) IS
    'Review M2 klein 7: 5 foute koppelcodes van deze bron (SHA-256 van het IPv4-adres of het IPv6-/56-netwerk) in 15 minuten → true (de API antwoordt 429). Alleen service_role.';
REVOKE ALL ON FUNCTION public.toonbank_koppel_geblokkeerd(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.toonbank_koppel_geblokkeerd(TEXT) TO service_role;

-- Een foute code: vastleggen bij de bron; telt (alleen binnen de 5 van die
-- bron) mee bij álle open codes; bij 25 vervalt een code. Geeft het aantal
-- codes dat daardoor verviel.
CREATE OR REPLACE FUNCTION public.toonbank_koppel_mislukt(p_bron TEXT DEFAULT NULL)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_n     INTEGER;
    v_bron  INTEGER := 1;
BEGIN
    DELETE FROM public.toonbank_koppel_pogingen WHERE at < now() - INTERVAL '1 day';
    IF p_bron IS NOT NULL THEN
        INSERT INTO public.toonbank_koppel_pogingen (bron) VALUES (p_bron);
        SELECT count(*) INTO v_bron FROM public.toonbank_koppel_pogingen p
         WHERE p.bron = p_bron AND p.at > now() - INTERVAL '15 minutes';
    END IF;

    -- Een bron telt hooguit 5 keer mee: één adres kan het koppelen niet voor iedereen blokkeren.
    IF v_bron <= 5 THEN
        UPDATE public.toonbank_apparaten a
           SET koppelpogingen = a.koppelpogingen + 1
         WHERE a.koppelcode_hash IS NOT NULL
           AND a.koppelcode_geldig_tot > now()
           AND a.ingetrokken_at IS NULL;
    END IF;

    UPDATE public.toonbank_apparaten a
       SET koppelcode_hash = NULL,
           koppelcode_geldig_tot = NULL
     WHERE a.koppelcode_hash IS NOT NULL
       AND a.koppelpogingen >= 25;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    RETURN v_n;
END $$;
COMMENT ON FUNCTION public.toonbank_koppel_mislukt(TEXT) IS
    'Foute koppelcode (review M2 klein 7): vastgelegd bij de bron; de eerste 5 per bron per 15 minuten tellen +1 bij alle open codes, na 25 vervalt een code. Alleen service_role.';
REVOKE ALL ON FUNCTION public.toonbank_koppel_mislukt(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.toonbank_koppel_mislukt(TEXT) TO service_role;

-- De code klopte (scrypt in de API): sleutel vastleggen, code wissen. Alleen
-- als de code nog open is; anders NULL (een tweede tablet was net eerder).
CREATE OR REPLACE FUNCTION public.toonbank_koppel_af(
    p_apparaat_id     UUID,
    p_sleutel_hash    TEXT,
    p_sleutel_prefix  TEXT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_rij public.toonbank_apparaten%ROWTYPE;
BEGIN
    IF p_sleutel_hash IS NULL OR p_sleutel_hash !~ '^[0-9a-f]{64}$' THEN
        RAISE EXCEPTION 'sleutel-hash in het verkeerde formaat' USING ERRCODE = '22023';
    END IF;

    UPDATE public.toonbank_apparaten a
       SET sleutel_hash = p_sleutel_hash,
           sleutel_prefix = p_sleutel_prefix,
           gekoppeld_at = now(),
           koppelcode_hash = NULL,
           koppelcode_geldig_tot = NULL,
           koppelpogingen = 0
     WHERE a.id = p_apparaat_id
       AND a.koppelcode_hash IS NOT NULL
       AND a.koppelcode_geldig_tot > now()
       AND a.koppelpogingen < 25
       AND a.ingetrokken_at IS NULL
    RETURNING * INTO v_rij;
    IF NOT FOUND THEN
        RETURN NULL;
    END IF;

    -- Een nieuwe sleutel: sessies van de vorige tablet stoppen.
    UPDATE public.toonbank_sessies SET beeindigd_at = now()
     WHERE apparaat_id = v_rij.id AND beeindigd_at IS NULL;

    RETURN jsonb_build_object('apparaat_id', v_rij.id, 'organization_id', v_rij.organization_id,
                              'code', v_rij.code, 'naam', v_rij.naam);
END $$;
COMMENT ON FUNCTION public.toonbank_koppel_af(UUID, TEXT, TEXT) IS
    'Koppelen afronden: sleutel-hash vastleggen als de koppelcode nog open is (anders NULL). Alleen service_role.';
REVOKE ALL ON FUNCTION public.toonbank_koppel_af(UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.toonbank_koppel_af(UUID, TEXT, TEXT) TO service_role;


-- ── 7. Inlogcode fout: tellen en blokkeren ──────────────────────────────────
-- Telt in kds_audit_logs (pin_failed, metadata.result = 'fail'), net als de
-- KDS, sinds de laatste Toonbank-sessie van deze persoon en hooguit 10
-- minuten terug. Bij 5: kds_pin_lockout_until = nu + 5 minuten.
-- Geeft {mislukt, over, geblokkeerd_tot}.
CREATE OR REPLACE FUNCTION public.toonbank_inlogcode_mislukt(
    p_org            UUID,
    p_medewerker_id  UUID,
    p_apparaat_id    UUID
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_persoon  public.personeel%ROWTYPE;
    v_sinds    TIMESTAMPTZ;
    v_n        INTEGER;
    v_tot      TIMESTAMPTZ;
BEGIN
    PERFORM private.vereis_org(p_org);

    SELECT * INTO v_persoon FROM public.personeel
     WHERE id = p_medewerker_id AND organization_id = p_org
       FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'medewerker % niet in deze organisatie', p_medewerker_id USING ERRCODE = 'P0002';
    END IF;

    INSERT INTO public.kds_audit_logs (organization_id, personeel_id, action, metadata)
    VALUES (p_org, p_medewerker_id, 'pin_failed',
            jsonb_build_object('result', 'fail', 'bron', 'toonbank', 'apparaat_id', p_apparaat_id));

    SELECT GREATEST(now() - INTERVAL '10 minutes',
                    COALESCE((SELECT max(s.aangemaakt_at) FROM public.toonbank_sessies s WHERE s.medewerker_id = p_medewerker_id),
                             '-infinity'::TIMESTAMPTZ))
      INTO v_sinds;
    SELECT count(*) INTO v_n
      FROM public.kds_audit_logs l
     WHERE l.organization_id = p_org
       AND l.personeel_id = p_medewerker_id
       AND l.action = 'pin_failed'
       AND COALESCE(l.metadata->>'result', 'fail') = 'fail'
       AND l.at_time >= v_sinds;

    v_tot := v_persoon.kds_pin_lockout_until;
    IF v_n >= 5 THEN
        v_tot := now() + INTERVAL '5 minutes';
        UPDATE public.personeel SET kds_pin_lockout_until = v_tot WHERE id = p_medewerker_id;
        INSERT INTO public.kds_audit_logs (organization_id, personeel_id, action, metadata)
        VALUES (p_org, p_medewerker_id, 'pin_locked',
                jsonb_build_object('bron', 'toonbank', 'apparaat_id', p_apparaat_id, 'lockedUntil', v_tot, 'fail_count', v_n));
    END IF;

    RETURN jsonb_build_object('mislukt', v_n, 'over', GREATEST(5 - v_n, 0),
                              'geblokkeerd_tot', CASE WHEN v_tot > now() THEN v_tot END);
END $$;
COMMENT ON FUNCTION public.toonbank_inlogcode_mislukt(UUID, UUID, UUID) IS
    'Foute inlogcode op de Toonbank: vastleggen, tellen (sinds de laatste sessie, max. 10 min) en bij 5 de persoon 5 minuten blokkeren. Alleen service_role.';
REVOKE ALL ON FUNCTION public.toonbank_inlogcode_mislukt(UUID, UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.toonbank_inlogcode_mislukt(UUID, UUID, UUID) TO service_role;


-- ── 8. Apparaat gezien (GET status) ─────────────────────────────────────────
-- Laatst gezien, app- en contractversie, en het hoogste volgnummer dat de
-- tablet meldt (nooit omlaag). Geeft de rij als jsonb, zonder hashes.
CREATE OR REPLACE FUNCTION public.toonbank_apparaat_gezien(
    p_org              UUID,
    p_apparaat_id      UUID,
    p_volgnummer       BIGINT DEFAULT NULL,
    p_app_versie       TEXT DEFAULT NULL,
    p_contract_versie  TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_rij public.toonbank_apparaten%ROWTYPE;
BEGIN
    PERFORM private.vereis_org(p_org);

    UPDATE public.toonbank_apparaten
       SET laatst_gezien_at = now(),
           app_versie = COALESCE(left(p_app_versie, 40), app_versie),
           contract_versie = COALESCE(left(p_contract_versie, 20), contract_versie),
           hoogste_volgnummer_gemeld = GREATEST(hoogste_volgnummer_gemeld, COALESCE(p_volgnummer, 0))
     WHERE id = p_apparaat_id AND organization_id = p_org AND ingetrokken_at IS NULL
    RETURNING * INTO v_rij;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'tablet % niet gevonden of ingetrokken', p_apparaat_id USING ERRCODE = 'P0002';
    END IF;

    RETURN to_jsonb(v_rij) - 'sleutel_hash' - 'koppelcode_hash';
END $$;
COMMENT ON FUNCTION public.toonbank_apparaat_gezien(UUID, UUID, BIGINT, TEXT, TEXT) IS
    'GET status: laatst gezien, app- en contractversie en het hoogste gemelde volgnummer (nooit omlaag). Alleen service_role.';
REVOKE ALL ON FUNCTION public.toonbank_apparaat_gezien(UUID, UUID, BIGINT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.toonbank_apparaat_gezien(UUID, UUID, BIGINT, TEXT, TEXT) TO service_role;


-- ── 9. Zelfcontrole ─────────────────────────────────────────────────────────
DO $$
DECLARE
    v_sig    TEXT;
    v_t      TEXT;
    v_fouten TEXT := '';
BEGIN
    -- Beheer: authenticated en service_role, niet anon.
    FOREACH v_sig IN ARRAY ARRAY[
        'public.toonbank_apparaat_nieuw(uuid, text, text, text, uuid)',
        'public.toonbank_apparaat_koppelcode(uuid, uuid, text)',
        'public.toonbank_apparaat_intrekken(uuid, uuid, text, uuid)'
    ] LOOP
        IF has_function_privilege('anon', v_sig, 'EXECUTE') THEN v_fouten := v_fouten || E'\n  anon mag ' || v_sig; END IF;
        IF NOT has_function_privilege('authenticated', v_sig, 'EXECUTE') THEN v_fouten := v_fouten || E'\n  authenticated mist ' || v_sig; END IF;
        IF NOT has_function_privilege('service_role', v_sig, 'EXECUTE') THEN v_fouten := v_fouten || E'\n  service_role mist ' || v_sig; END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid = v_sig::REGPROCEDURE AND prosecdef AND proconfig @> ARRAY['search_path=public, pg_temp'])
           OR pg_get_functiondef(v_sig::REGPROCEDURE) NOT LIKE '%PERFORM private.vereis_org(p_org)%' THEN
            v_fouten := v_fouten || E'\n  geen SECURITY DEFINER met search_path en vereis_org: ' || v_sig;
        END IF;
        IF pg_get_functiondef(v_sig::REGPROCEDURE) NOT LIKE '%PERFORM private.toonbank_vereis_admin(p_org)%' THEN
            v_fouten := v_fouten || E'\n  beheer zonder Admin-controle (review M2 K4): ' || v_sig;
        END IF;
    END LOOP;
    -- Review M2 K4: personeel bewaakt, de inlogcode-hash niet leesbaar. K7: sessies stoppen.
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.personeel'::REGCLASS AND tgname = 'trg_personeel_toonbank_bewaken' AND NOT tgisinternal)
       OR NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.personeel'::REGCLASS AND tgname = 'trg_personeel_toonbank_sessies_stoppen' AND NOT tgisinternal) THEN
        v_fouten := v_fouten || E'\n  trigger trg_personeel_toonbank_bewaken of trg_personeel_toonbank_sessies_stoppen ontbreekt';
    END IF;
    IF has_function_privilege('authenticated', 'private.personeel_toonbank_sessies_stoppen()', 'EXECUTE')
       OR has_function_privilege('service_role', 'private.personeel_toonbank_sessies_stoppen()', 'EXECUTE') THEN
        v_fouten := v_fouten || E'\n  een rol mag private.personeel_toonbank_sessies_stoppen() los aanroepen';
    END IF;
    IF has_column_privilege('authenticated', 'public.personeel', 'kds_pin_hash', 'SELECT')
       OR has_column_privilege('anon', 'public.personeel', 'kds_pin_hash', 'SELECT') THEN
        v_fouten := v_fouten || E'\n  anon of authenticated leest personeel.kds_pin_hash';
    END IF;
    IF NOT has_column_privilege('authenticated', 'public.personeel', 'naam', 'SELECT')
       OR NOT has_column_privilege('authenticated', 'public.personeel', 'kds_pin_lockout_until', 'SELECT')
       OR NOT has_column_privilege('service_role', 'public.personeel', 'kds_pin_hash', 'SELECT') THEN
        v_fouten := v_fouten || E'\n  te veel ingetrokken op personeel (naam/blokkade voor authenticated, hash voor service_role)';
    END IF;
    IF has_function_privilege('anon', 'public.toonbank_inlogcodes_ingesteld(uuid)', 'EXECUTE')
       OR NOT has_function_privilege('authenticated', 'public.toonbank_inlogcodes_ingesteld(uuid)', 'EXECUTE')
       OR has_function_privilege('authenticated', 'private.personeel_toonbank_bewaken()', 'EXECUTE')
       OR has_function_privilege('anon', 'private.toonbank_vereis_admin(uuid)', 'EXECUTE') THEN
        v_fouten := v_fouten || E'\n  rechten op toonbank_inlogcodes_ingesteld, de personeel-trigger of toonbank_vereis_admin kloppen niet';
    END IF;
    -- Alleen service_role.
    FOREACH v_sig IN ARRAY ARRAY[
        'public.toonbank_koppel_kandidaten()',
        'public.toonbank_koppel_mislukt(text)',
        'public.toonbank_koppel_geblokkeerd(text)',
        'public.toonbank_koppel_af(uuid, text, text)',
        'public.toonbank_inlogcode_mislukt(uuid, uuid, uuid)',
        'public.toonbank_apparaat_gezien(uuid, uuid, bigint, text, text)'
    ] LOOP
        IF has_function_privilege('anon', v_sig, 'EXECUTE') OR has_function_privilege('authenticated', v_sig, 'EXECUTE') THEN
            v_fouten := v_fouten || E'\n  anon of authenticated mag ' || v_sig;
        END IF;
        IF NOT has_function_privilege('service_role', v_sig, 'EXECUTE') THEN v_fouten := v_fouten || E'\n  service_role mist ' || v_sig; END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid = v_sig::REGPROCEDURE AND proconfig @> ARRAY['search_path=public, pg_temp']) THEN
            v_fouten := v_fouten || E'\n  geen vast search_path: ' || v_sig;
        END IF;
    END LOOP;
    FOREACH v_sig IN ARRAY ARRAY['public.toonbank_inlogcode_mislukt(uuid, uuid, uuid)', 'public.toonbank_apparaat_gezien(uuid, uuid, bigint, text, text)'] LOOP
        IF pg_get_functiondef(v_sig::REGPROCEDURE) NOT LIKE '%PERFORM private.vereis_org(p_org)%' THEN
            v_fouten := v_fouten || E'\n  zonder vereis_org: ' || v_sig;
        END IF;
    END LOOP;

    -- Review M2 klein 7: de koppelpogingen per bron alleen voor service_role.
    IF NOT (SELECT c.relrowsecurity FROM pg_class c WHERE c.oid = 'public.toonbank_koppel_pogingen'::REGCLASS)
       OR has_table_privilege('anon', 'public.toonbank_koppel_pogingen', 'SELECT')
       OR has_table_privilege('authenticated', 'public.toonbank_koppel_pogingen', 'SELECT')
       OR NOT has_table_privilege('service_role', 'public.toonbank_koppel_pogingen', 'INSERT') THEN
        v_fouten := v_fouten || E'\n  rechten of RLS op toonbank_koppel_pogingen kloppen niet';
    END IF;

    -- Tabellen: RLS aan, niets voor anon, sessies niet voor authenticated.
    FOREACH v_t IN ARRAY ARRAY['public.toonbank_apparaten', 'public.toonbank_sessies', 'public.toonbank_journaal'] LOOP
        IF NOT (SELECT c.relrowsecurity FROM pg_class c WHERE c.oid = v_t::REGCLASS) THEN
            v_fouten := v_fouten || E'\n  RLS staat uit op ' || v_t;
        END IF;
        IF has_table_privilege('anon', v_t, 'SELECT') OR has_table_privilege('anon', v_t, 'INSERT')
           OR has_table_privilege('anon', v_t, 'UPDATE') OR has_table_privilege('anon', v_t, 'DELETE') THEN
            v_fouten := v_fouten || E'\n  anon heeft rechten op ' || v_t;
        END IF;
        IF has_table_privilege('authenticated', v_t, 'INSERT') OR has_table_privilege('authenticated', v_t, 'UPDATE')
           OR has_table_privilege('authenticated', v_t, 'DELETE') THEN
            v_fouten := v_fouten || E'\n  authenticated mag schrijven in ' || v_t;
        END IF;
        IF has_table_privilege('service_role', v_t, 'DELETE') OR has_table_privilege('service_role', v_t, 'TRUNCATE') THEN
            v_fouten := v_fouten || E'\n  service_role mag verwijderen uit ' || v_t;
        END IF;
    END LOOP;
    IF has_table_privilege('authenticated', 'public.toonbank_sessies', 'SELECT') THEN
        v_fouten := v_fouten || E'\n  authenticated leest toonbank_sessies';
    END IF;
    IF EXISTS (SELECT 1 FROM pg_policy WHERE polrelid = 'public.toonbank_sessies'::REGCLASS) THEN
        v_fouten := v_fouten || E'\n  toonbank_sessies heeft policies (hoort alleen service_role)';
    END IF;
    IF has_column_privilege('authenticated', 'public.toonbank_apparaten', 'sleutel_hash', 'SELECT')
       OR has_column_privilege('authenticated', 'public.toonbank_apparaten', 'koppelcode_hash', 'SELECT') THEN
        v_fouten := v_fouten || E'\n  authenticated leest de hashes van toonbank_apparaten';
    END IF;
    IF has_column_privilege('service_role', 'public.toonbank_journaal', 'payload', 'UPDATE') THEN
        v_fouten := v_fouten || E'\n  service_role mag de payload van het journaal wijzigen';
    END IF;
    IF (SELECT count(*) FROM pg_trigger WHERE tgrelid = 'public.toonbank_journaal'::REGCLASS AND NOT tgisinternal
          AND tgfoid = 'private.toonbank_journaal_alleen_toevoegen()'::REGPROCEDURE) <> 2 THEN
        v_fouten := v_fouten || E'\n  de append-only-triggers op toonbank_journaal ontbreken';
    END IF;

    IF v_fouten <> '' THEN
        RAISE EXCEPTION 'toonbank_apparaten: zelfcontrole mislukt, er is niets veranderd:%', v_fouten;
    END IF;
END $$;


-- ── 10. Verificatie ─────────────────────────────────────────────────────────
--   supabase/tests/toonbank_apparaten.sql      alleen op dev: "GESLAAGD: …"
--   supabase/checks/verify_winkel_live.sql     objectproef, op live én dev
