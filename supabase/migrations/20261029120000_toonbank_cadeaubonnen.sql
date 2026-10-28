-- ════════════════════════════════════════════════════════════════════════════
--  Toonbank — cadeaubonnen (contract toonbank/v1 1.2, op verzoek van Mathijs,
--  28 oktober 2026). Een cadeaubon op nummer opzoeken en er bij het afrekenen
--  een bedrag van afschrijven, zoals bij een creditcard; wat overblijft staat
--  er de volgende keer nog op.
--  Contract: hopbites-toonbank/docs/datacontract-toonbank-v1.md, "Wat is nieuw
--  in 1.2.0-ontwerp", §1.4, §1.5, §3.2, §3.3.
--  Tests: supabase/tests/toonbank_cadeaubonnen.sql (alleen op de dev-database)
-- ════════════════════════════════════════════════════════════════════════════
--
--  BBQ Architect bezit de cadeaubon en het saldo, net als de voorraad. De
--  Toonbank vraagt en meldt alleen:
--    GET  cadeaubonnen/{code}              → toonbank_cadeaubon_opzoeken
--    POST cadeaubonnen/{code}/reserveren   → toonbank_cadeaubon_reserveren
--    POST cadeaubonnen/{code}/vrijgeven    → toonbank_cadeaubon_vrijgeven
--    POST bonnen (betaalregel cadeaubon)   → toonbank_boek_bon schrijft af
--
--  Wat erbij komt
--    1. cadeaubonnen: per organisatie een code (uniek), de waarde, het saldo,
--       geldig tot (leeg = geen einddatum), wie hem uitgaf, een notitie en
--       of hij geblokkeerd is. De status (actief, leeg, verlopen,
--       geblokkeerd) wordt afgeleid, niet opgeslagen: zo verloopt een bon
--       vanzelf op de dag na geldig_tot, zonder nachtelijke taak.
--    2. cadeaubon_mutaties: alleen toevoegen (trigger, TB003). Uitgifte,
--       reservering, vrijgave, afschrijving, correctie, blokkade en
--       deblokkade. Het saldo is altijd de som van saldo_wijziging_cents; een
--       uitgestelde controle (constraint trigger) bewaakt dat bij elke commit.
--    3. cadeaubon_reserveringen: een bedrag dat voor een bon wordt
--       vastgehouden (reservering_id van de tablet, uniek per organisatie),
--       15 minuten. vast → vrij (vrijgegeven) of gebruikt (de bon kwam
--       binnen). Een verlopen reservering telt gewoon niet meer mee.
--    4. toonbank_bonnen.cadeaubon_cents, toonbank_bon_regels.cadeaubon_code en
--       .reservering_id; betaalmethode mag ook 'cadeaubon'.
--    5. winkel_instellingen.toonbank_cadeaubon_aan (standaard uit): pas dan
--       meldt GET status instellingen.cadeaubon_aan en toont de tablet de
--       betaalwijze.
--    6. toonbank_bon_fouten en toonbank_boek_bon opnieuw (uit 20261028160000):
--       ze kennen de betaalregel cadeaubon. toonbank_boek_bon schrijft af in
--       dezelfde transactie als de bon (idempotent op bon + reservering).
--       Een bon die al betaald is, wordt NOOIT geweigerd: een onbekende code,
--       een verlopen of ontbrekende reservering, een geblokkeerde of verlopen
--       bon, of een saldo onder nul wordt een controle (de journaalregel op
--       'conflict', dus "Te controleren"); de bon is dan wel geboekt.
--       Een onverwachte databasefout laat alleen die ene melding op 'fout'
--       (de wachtrij gaat door, en "Opnieuw verwerken" probeert hem weer).
--    7. Beheer (Instellingen → Toonbank → Cadeaubonnen, alleen een Admin):
--       cadeaubon_uitgeven, cadeaubon_blokkeren en cadeaubon_corrigeren.
--
--  Niet in deze stap [open]: een cadeaubon verkopen of opwaarderen aan de
--  toonbank of in de webshop (de verkoop van een meervoudige voucher is geen
--  omzet en heeft geen btw; laten toetsen door de boekhouder), terugbetalen op
--  een cadeaubon bij een retour (een tegenbon met een cadeaubon wordt een
--  controle), en de cadeaubon in de dagstaat narekenen (de tablet stuurt
--  cadeaubon_cents mee; het staat in het journaal).
--
--  Volgorde: eerst testen op een Supabase-branch, dan met de hand naar live,
--  vóór de code die het nodig heeft (CLAUDE.md van hopbites-toonbank §8). De
--  code werkt ook zonder deze migratie: dan staat cadeaubon_aan uit.
--
--  Rechten: niets voor PUBLIC en anon. De Toonbank-functies alleen voor
--  service_role; de beheerfuncties ook voor authenticated (alleen een Admin,
--  private.toonbank_vereis_admin). Een Admin leest de cadeaubonnen van de
--  eigen organisatie (RLS): de code is als geld, dus niet voor elk lid.


-- ── 0. Pre-flight ───────────────────────────────────────────────────────────
DO $$
DECLARE
    v_sig       TEXT;
    v_def       TEXT;
    v_ontbreekt TEXT := '';
BEGIN
    FOREACH v_sig IN ARRAY ARRAY[
        'private.vereis_org(uuid)',
        'private.toonbank_vereis_admin(uuid)',
        'private.tb_uuid(text)',
        'private.tb_int(jsonb)',
        'private.toonbank_bon_fouten(jsonb)',
        'public.toonbank_boek_bon(bigint)'
    ] LOOP
        IF to_regprocedure(v_sig) IS NULL THEN
            v_ontbreekt := v_ontbreekt || E'\n  functie ' || v_sig;
        END IF;
    END LOOP;
    FOREACH v_sig IN ARRAY ARRAY['public.organizations', 'public.organization_members', 'public.toonbank_apparaten',
                                 'public.toonbank_bonnen', 'public.toonbank_bon_regels', 'public.winkel_instellingen'] LOOP
        IF to_regclass(v_sig) IS NULL THEN
            v_ontbreekt := v_ontbreekt || E'\n  tabel ' || v_sig;
        END IF;
    END LOOP;
    IF v_ontbreekt <> '' THEN
        RAISE EXCEPTION 'toonbank_cadeaubonnen: dit ontbreekt (eerst BA-7a, BA-9 en BA-10):%', v_ontbreekt;
    END IF;

    -- toonbank_boek_bon en toonbank_bon_fouten worden vervangen: alleen de
    -- versie uit 20261028160000, nog zonder cadeaubon.
    v_def := pg_get_functiondef('public.toonbank_boek_bon(bigint)'::REGPROCEDURE);
    IF v_def LIKE '%cadeaubon%' OR v_def NOT LIKE '%tekort_correctie%' OR v_def NOT LIKE '%order_komt_tekort%'
       OR v_def NOT LIKE '%alcohol_niet_toegestaan%' THEN
        RAISE EXCEPTION 'toonbank_cadeaubonnen: toonbank_boek_bon is niet de versie uit 20261028160000; eerst vergelijken';
    END IF;
    v_def := pg_get_functiondef('private.toonbank_bon_fouten(jsonb)'::REGPROCEDURE);
    IF v_def NOT LIKE '%betaalmethode is pin of contant%' THEN
        RAISE EXCEPTION 'toonbank_cadeaubonnen: toonbank_bon_fouten is niet de versie uit 20261028160000; eerst vergelijken';
    END IF;

    IF to_regclass('public.cadeaubonnen') IS NOT NULL OR to_regclass('public.cadeaubon_mutaties') IS NOT NULL
       OR to_regclass('public.cadeaubon_reserveringen') IS NOT NULL THEN
        RAISE EXCEPTION 'toonbank_cadeaubonnen: een van de cadeaubon-tabellen bestaat al; eerst nakijken';
    END IF;
END $$;


-- ── 1. cadeaubonnen ─────────────────────────────────────────────────────────
CREATE TABLE public.cadeaubonnen (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id     UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
    -- Het nummer op de bon (of wat de QR-code bevat): hoofdletters, cijfers en
    -- streepjes, zoals Cadeauboncode in het contract.
    code                TEXT        NOT NULL CHECK (code ~ '^[A-Z0-9-]{4,40}$'),
    waarde_cents        INTEGER     NOT NULL CHECK (waarde_cents > 0),
    -- Kan onder nul komen: een bon die al betaald is, wordt nooit geweigerd
    -- (dan "Te controleren"). Alleen via de functies hieronder te wijzigen.
    saldo_cents         INTEGER     NOT NULL,
    -- Tot en met deze dag te gebruiken (Europe/Amsterdam); leeg = geen einddatum.
    geldig_tot          DATE        NULL,
    geblokkeerd_at      TIMESTAMPTZ NULL,
    geblokkeerd_door    UUID        NULL,
    geblokkeerd_reden   TEXT        NULL,
    uitgegeven_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- auth.users.id van wie hem uitgaf; geen foreign key (blijft staan als de persoon weg is).
    uitgegeven_door     UUID        NULL,
    notitie             TEXT        NULL CHECK (notitie IS NULL OR length(notitie) <= 500),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT cadeaubonnen_code_uniek UNIQUE (organization_id, code)
);
COMMENT ON TABLE public.cadeaubonnen IS
    'Cadeaubonnen (Toonbank contract 1.2): code, waarde en saldo. De status (actief, leeg, verlopen, geblokkeerd) is afgeleid (private.cadeaubon_status). Het saldo is altijd de som van cadeaubon_mutaties (uitgestelde controle). Alleen de functies schrijven.';
COMMENT ON COLUMN public.cadeaubonnen.saldo_cents IS
    'Het saldo zonder de lopende reserveringen eraf. Kan onder nul komen als een bon die al betaald is later binnenkomt; dat is dan een melding in Te controleren.';

CREATE INDEX cadeaubonnen_org_idx ON public.cadeaubonnen (organization_id, uitgegeven_at DESC);


-- ── 2. cadeaubon_reserveringen ──────────────────────────────────────────────
CREATE TABLE public.cadeaubon_reserveringen (
    organization_id     UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
    -- Gemaakt op de tablet; dezelfde id opnieuw reserveert niet nog een keer.
    reservering_id      UUID        NOT NULL,
    cadeaubon_id        UUID        NOT NULL REFERENCES public.cadeaubonnen(id) ON DELETE RESTRICT,
    apparaat_id         UUID        NOT NULL REFERENCES public.toonbank_apparaten(id) ON DELETE RESTRICT,
    medewerker_id       UUID        NULL,
    bon_id              UUID        NOT NULL,
    bedrag_cents        INTEGER     NOT NULL CHECK (bedrag_cents > 0),
    -- vast: houdt het bedrag vast tot verloopt_at · vrij: vrijgegeven ·
    -- gebruikt: de bon kwam binnen en er is afgeschreven.
    status              TEXT        NOT NULL DEFAULT 'vast' CHECK (status IN ('vast', 'vrij', 'gebruikt')),
    verloopt_at         TIMESTAMPTZ NOT NULL,
    vrijgegeven_at      TIMESTAMPTZ NULL,
    gebruikt_at         TIMESTAMPTZ NULL,
    gebruikt_bon_id     UUID        NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (organization_id, reservering_id)
);
COMMENT ON TABLE public.cadeaubon_reserveringen IS
    'Toonbank contract 1.2: een bedrag dat BBQ Architect 15 minuten voor een bon vasthoudt. Telt mee bij "gereserveerd" zolang status vast is en verloopt_at nog niet voorbij. Er wordt pas afgeschreven als de bon binnenkomt.';

CREATE INDEX cadeaubon_reserveringen_lopend_idx ON public.cadeaubon_reserveringen (cadeaubon_id, verloopt_at) WHERE status = 'vast';


-- ── 3. cadeaubon_mutaties (alleen toevoegen) ────────────────────────────────
CREATE TABLE public.cadeaubon_mutaties (
    id                      BIGINT      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    organization_id         UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
    cadeaubon_id            UUID        NOT NULL REFERENCES public.cadeaubonnen(id) ON DELETE RESTRICT,
    soort                   TEXT        NOT NULL CHECK (soort IN ('uitgifte', 'reservering', 'vrijgave', 'afschrijving', 'correctie', 'blokkade', 'deblokkade')),
    -- Het bedrag waar het om gaat (bij een reservering het vastgehouden bedrag).
    bedrag_cents            INTEGER     NOT NULL,
    -- Wat er met het saldo gebeurt: uitgifte +, afschrijving −, correctie ±, de rest 0.
    saldo_wijziging_cents   INTEGER     NOT NULL,
    saldo_na_cents          INTEGER     NOT NULL,
    reservering_id          UUID        NULL,
    bon_id                  UUID        NULL,
    bonnummer               TEXT        NULL,
    apparaat_id             UUID        NULL,
    medewerker_id           UUID        NULL,
    -- auth.users.id bij een actie in BBQ Architect.
    door_user_id            UUID        NULL,
    notitie                 TEXT        NULL,
    -- tb:{bon_id}:{reservering_id} bij een afschrijving: precies één keer per bon en reservering.
    idempotency_key         TEXT        NULL,
    gebeurd_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT cadeaubon_mutaties_wijziging CHECK (
        (soort = 'uitgifte' AND saldo_wijziging_cents > 0)
        OR (soort = 'afschrijving' AND saldo_wijziging_cents < 0)
        OR (soort = 'correctie' AND saldo_wijziging_cents <> 0)
        OR (soort IN ('reservering', 'vrijgave', 'blokkade', 'deblokkade') AND saldo_wijziging_cents = 0))
);
COMMENT ON TABLE public.cadeaubon_mutaties IS
    'Alles wat er met een cadeaubon gebeurt, alleen toevoegen (TB003). Het saldo van een cadeaubon is de som van saldo_wijziging_cents. 7 jaar bewaren.';

CREATE INDEX cadeaubon_mutaties_bon_idx ON public.cadeaubon_mutaties (cadeaubon_id, id);
CREATE INDEX cadeaubon_mutaties_toonbank_bon_idx ON public.cadeaubon_mutaties (organization_id, bon_id) WHERE bon_id IS NOT NULL;
CREATE UNIQUE INDEX cadeaubon_mutaties_sleutel_uniek ON public.cadeaubon_mutaties (organization_id, idempotency_key) WHERE idempotency_key IS NOT NULL;

CREATE OR REPLACE FUNCTION private.cadeaubon_mutaties_alleen_toevoegen()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
    RAISE EXCEPTION 'TB003: cadeaubon_mutaties is alleen toevoegen (%); corrigeer met een correctie', TG_OP USING ERRCODE = 'TB003';
END $$;
COMMENT ON FUNCTION private.cadeaubon_mutaties_alleen_toevoegen() IS
    'Trigger op cadeaubon_mutaties: geen UPDATE, DELETE of TRUNCATE (TB003).';
REVOKE ALL ON FUNCTION private.cadeaubon_mutaties_alleen_toevoegen() FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER trg_cadeaubon_mutaties_alleen_toevoegen BEFORE UPDATE OR DELETE ON public.cadeaubon_mutaties
    FOR EACH ROW EXECUTE FUNCTION private.cadeaubon_mutaties_alleen_toevoegen();
CREATE TRIGGER trg_cadeaubon_mutaties_geen_truncate BEFORE TRUNCATE ON public.cadeaubon_mutaties
    FOR EACH STATEMENT EXECUTE FUNCTION private.cadeaubon_mutaties_alleen_toevoegen();

-- Het saldo is altijd te verantwoorden: bij elke commit is saldo_cents de som
-- van de mutaties. Uitgesteld, zodat een functie eerst het saldo en dan de
-- mutatie kan schrijven.
CREATE OR REPLACE FUNCTION private.cadeaubon_saldo_klopt()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
    v_saldo  INTEGER;
    v_som    BIGINT;
BEGIN
    SELECT saldo_cents INTO v_saldo FROM public.cadeaubonnen WHERE id = NEW.id;
    SELECT COALESCE(sum(saldo_wijziging_cents), 0) INTO v_som FROM public.cadeaubon_mutaties WHERE cadeaubon_id = NEW.id;
    IF v_saldo IS DISTINCT FROM v_som THEN
        RAISE EXCEPTION 'TB003: het saldo van cadeaubon % (% ct) is niet de som van de mutaties (% ct)', NEW.code, v_saldo, v_som
            USING ERRCODE = 'TB003';
    END IF;
    RETURN NULL;
END $$;
COMMENT ON FUNCTION private.cadeaubon_saldo_klopt() IS
    'Uitgestelde controle op cadeaubonnen: saldo_cents = som van cadeaubon_mutaties.saldo_wijziging_cents (TB003).';
REVOKE ALL ON FUNCTION private.cadeaubon_saldo_klopt() FROM PUBLIC, anon, authenticated, service_role;

CREATE CONSTRAINT TRIGGER trg_cadeaubon_saldo_klopt
    AFTER INSERT OR UPDATE OF saldo_cents ON public.cadeaubonnen
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW EXECUTE FUNCTION private.cadeaubon_saldo_klopt();


-- ── 4. RLS en rechten ───────────────────────────────────────────────────────
-- Alleen een Admin leest (de code is als geld); alleen service_role en de
-- functies hieronder (SECURITY DEFINER) schrijven.
ALTER TABLE public.cadeaubonnen ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cadeaubon_reserveringen ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cadeaubon_mutaties ENABLE ROW LEVEL SECURITY;

CREATE POLICY cadeaubonnen_select_admin ON public.cadeaubonnen FOR SELECT TO authenticated
    USING (organization_id IN (SELECT m.organization_id FROM public.organization_members m
                                WHERE m.user_id = (SELECT auth.uid()) AND m.status = 'active' AND m.role = 'Admin'));
CREATE POLICY cadeaubon_reserveringen_select_admin ON public.cadeaubon_reserveringen FOR SELECT TO authenticated
    USING (organization_id IN (SELECT m.organization_id FROM public.organization_members m
                                WHERE m.user_id = (SELECT auth.uid()) AND m.status = 'active' AND m.role = 'Admin'));
CREATE POLICY cadeaubon_mutaties_select_admin ON public.cadeaubon_mutaties FOR SELECT TO authenticated
    USING (organization_id IN (SELECT m.organization_id FROM public.organization_members m
                                WHERE m.user_id = (SELECT auth.uid()) AND m.status = 'active' AND m.role = 'Admin'));

REVOKE ALL ON TABLE public.cadeaubonnen, public.cadeaubon_reserveringen, public.cadeaubon_mutaties FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.cadeaubonnen, public.cadeaubon_reserveringen, public.cadeaubon_mutaties TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.cadeaubonnen, public.cadeaubon_reserveringen TO service_role;
GRANT SELECT, INSERT ON TABLE public.cadeaubon_mutaties TO service_role;


-- ── 5. Bonnen en regels kennen de cadeaubon ─────────────────────────────────
-- Nieuwe kolommen met een standaardwaarde: geen UPDATE van bestaande rijen,
-- dus de trigger toonbank_bon_vast gaat niet af.
ALTER TABLE public.toonbank_bonnen
    ADD COLUMN cadeaubon_cents INTEGER NOT NULL DEFAULT 0;
COMMENT ON COLUMN public.toonbank_bonnen.cadeaubon_cents IS
    'Contract 1.2: wat er met een cadeaubon is betaald (een betaalwijze, zoals pin en contant). Geen omzet: die staat op de verkoopregels.';

ALTER TABLE public.toonbank_bon_regels
    ADD COLUMN cadeaubon_code TEXT NULL,
    ADD COLUMN reservering_id UUID NULL;
COMMENT ON COLUMN public.toonbank_bon_regels.cadeaubon_code IS 'Contract 1.2: bij een betaling met een cadeaubon de code (hoofdletters).';
COMMENT ON COLUMN public.toonbank_bon_regels.reservering_id IS 'Contract 1.2: bij een betaling met een cadeaubon de reservering waarmee is afgeschreven.';

DO $$
DECLARE
    v_naam TEXT;
BEGIN
    FOR v_naam IN SELECT conname FROM pg_constraint
                   WHERE conrelid = 'public.toonbank_bon_regels'::REGCLASS AND contype = 'c'
                     AND pg_get_constraintdef(oid) LIKE '%betaalmethode%' LOOP
        EXECUTE format('ALTER TABLE public.toonbank_bon_regels DROP CONSTRAINT %I', v_naam);
    END LOOP;
END $$;
ALTER TABLE public.toonbank_bon_regels
    ADD CONSTRAINT toonbank_bon_regels_betaalmethode_check
    CHECK (betaalmethode IS NULL OR betaalmethode IN ('pin', 'contant', 'cadeaubon'));


-- ── 6. De instelling ────────────────────────────────────────────────────────
ALTER TABLE public.winkel_instellingen
    ADD COLUMN IF NOT EXISTS toonbank_cadeaubon_aan BOOLEAN NOT NULL DEFAULT false;
COMMENT ON COLUMN public.winkel_instellingen.toonbank_cadeaubon_aan IS
    'Toonbank (contract 1.2): betalen met een cadeaubon kan. Standaard uit; GET status meldt het als instellingen.cadeaubon_aan.';


-- ── 7. Hulpfuncties ─────────────────────────────────────────────────────────
-- De status van een cadeaubon. Geblokkeerd gaat voor verlopen, verlopen voor leeg.
CREATE OR REPLACE FUNCTION private.cadeaubon_status(p_geblokkeerd_at TIMESTAMPTZ, p_geldig_tot DATE, p_saldo_cents INTEGER)
RETURNS TEXT
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
    SELECT CASE
        WHEN p_geblokkeerd_at IS NOT NULL THEN 'geblokkeerd'
        WHEN p_geldig_tot IS NOT NULL AND p_geldig_tot < (now() AT TIME ZONE 'Europe/Amsterdam')::DATE THEN 'verlopen'
        WHEN p_saldo_cents <= 0 THEN 'leeg'
        ELSE 'actief'
    END
$$;
COMMENT ON FUNCTION private.cadeaubon_status(TIMESTAMPTZ, DATE, INTEGER) IS
    'De status van een cadeaubon: geblokkeerd, verlopen (geldig_tot voorbij in Europe/Amsterdam), leeg (saldo 0 of minder) of actief.';
REVOKE ALL ON FUNCTION private.cadeaubon_status(TIMESTAMPTZ, DATE, INTEGER) FROM PUBLIC, anon, authenticated, service_role;


-- Wat er nu vastgehouden wordt: lopende reserveringen (vast en niet verlopen).
CREATE OR REPLACE FUNCTION private.cadeaubon_gereserveerd(p_cadeaubon_id UUID)
RETURNS INTEGER
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
    SELECT COALESCE(sum(r.bedrag_cents), 0)::INTEGER
      FROM public.cadeaubon_reserveringen r
     WHERE r.cadeaubon_id = p_cadeaubon_id AND r.status = 'vast' AND r.verloopt_at > now()
$$;
REVOKE ALL ON FUNCTION private.cadeaubon_gereserveerd(UUID) FROM PUBLIC, anon, authenticated, service_role;

-- De stand zoals GET cadeaubonnen/{code} hem geeft (contract §3.3). Het saldo
-- in het antwoord is nooit onder nul (het contract kent alleen 0 en meer).
CREATE OR REPLACE FUNCTION private.cadeaubon_stand(p_cb public.cadeaubonnen)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
    v_status       TEXT := private.cadeaubon_status(p_cb.geblokkeerd_at, p_cb.geldig_tot, p_cb.saldo_cents);
    v_gereserveerd INTEGER := private.cadeaubon_gereserveerd(p_cb.id);
BEGIN
    RETURN jsonb_build_object(
        'code', p_cb.code,
        'status', v_status,
        'saldo_cents', GREATEST(p_cb.saldo_cents, 0),
        'gereserveerd_cents', v_gereserveerd,
        'beschikbaar_cents', CASE WHEN v_status = 'actief' THEN GREATEST(p_cb.saldo_cents - v_gereserveerd, 0) ELSE 0 END,
        'waarde_cents', p_cb.waarde_cents,
        'geldig_tot', to_char(p_cb.geldig_tot, 'YYYY-MM-DD'));
END $$;
REVOKE ALL ON FUNCTION private.cadeaubon_stand(public.cadeaubonnen) FROM PUBLIC, anon, authenticated, service_role;

-- Spaties weg en hoofdletters, zoals normaliseerCadeauboncode in de Toonbank-app (kern).
CREATE OR REPLACE FUNCTION private.cadeaubon_code(p_code TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
    SELECT NULLIF(upper(regexp_replace(COALESCE(p_code, ''), '\s+', '', 'g')), '')
$$;
REVOKE ALL ON FUNCTION private.cadeaubon_code(TEXT) FROM PUBLIC, anon, authenticated, service_role;



-- ── 8. GET cadeaubonnen/{code} ──────────────────────────────────────────────
-- Geeft de stand, of NULL als de code in deze organisatie niet bestaat (404).
CREATE OR REPLACE FUNCTION public.toonbank_cadeaubon_opzoeken(p_org UUID, p_code TEXT)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_cb public.cadeaubonnen%ROWTYPE;
BEGIN
    PERFORM private.vereis_org(p_org);
    SELECT * INTO v_cb FROM public.cadeaubonnen WHERE organization_id = p_org AND code = private.cadeaubon_code(p_code);
    IF NOT FOUND THEN
        RETURN NULL;
    END IF;
    RETURN private.cadeaubon_stand(v_cb);
END $$;
COMMENT ON FUNCTION public.toonbank_cadeaubon_opzoeken(UUID, TEXT) IS
    'GET /api/toonbank/v1/cadeaubonnen/{code} (contract 1.2): {code, status, saldo_cents, gereserveerd_cents, beschikbaar_cents, waarde_cents, geldig_tot}, of NULL (404). Alleen service_role.';
REVOKE ALL ON FUNCTION public.toonbank_cadeaubon_opzoeken(UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.toonbank_cadeaubon_opzoeken(UUID, TEXT) TO service_role;


-- ── 9. POST cadeaubonnen/{code}/reserveren ──────────────────────────────────
-- Idempotent op reservering_id: bestaat hij al, dan hetzelfde antwoord (en
-- niets nieuws). Geeft {ok: true, reservering_id, code, bedrag_cents,
-- beschikbaar_na_cents, verloopt_at} of {ok: false, fout, beschikbaar_cents}
-- met fout cadeaubon_onbekend, cadeaubon_geblokkeerd, cadeaubon_verlopen,
-- cadeaubon_saldo_te_laag of reservering_anders (zelfde reservering_id, maar
-- een andere code, bon of bedrag).
CREATE OR REPLACE FUNCTION public.toonbank_cadeaubon_reserveren(
    p_org             UUID,
    p_apparaat_id     UUID,
    p_code            TEXT,
    p_reservering_id  UUID,
    p_bon_id          UUID,
    p_bedrag_cents    INTEGER,
    p_medewerker_id   UUID DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    c_duur   CONSTANT INTERVAL := interval '15 minutes';
    v_cb     public.cadeaubonnen%ROWTYPE;
    v_res    public.cadeaubon_reserveringen%ROWTYPE;
    v_stand  JSONB;
    v_status TEXT;
BEGIN
    PERFORM private.vereis_org(p_org);
    IF p_reservering_id IS NULL OR p_bon_id IS NULL OR COALESCE(p_bedrag_cents, 0) <= 0 THEN
        RAISE EXCEPTION 'reserveren: reservering_id, bon_id en een bedrag boven 0' USING ERRCODE = '22023';
    END IF;
    PERFORM 1 FROM public.toonbank_apparaten WHERE id = p_apparaat_id AND organization_id = p_org AND ingetrokken_at IS NULL;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'tablet % niet in deze organisatie of ingetrokken', p_apparaat_id USING ERRCODE = 'P0002';
    END IF;

    -- De cadeaubon vergrendelen: twee tablets kunnen zo niet tegelijk hetzelfde saldo reserveren.
    SELECT * INTO v_cb FROM public.cadeaubonnen WHERE organization_id = p_org AND code = private.cadeaubon_code(p_code) FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'fout', 'cadeaubon_onbekend', 'beschikbaar_cents', 0);
    END IF;

    -- Bestaat de reservering al: hetzelfde antwoord, niets nieuws.
    SELECT * INTO v_res FROM public.cadeaubon_reserveringen WHERE organization_id = p_org AND reservering_id = p_reservering_id;
    IF FOUND THEN
        IF v_res.cadeaubon_id <> v_cb.id OR v_res.bon_id <> p_bon_id OR v_res.bedrag_cents <> p_bedrag_cents THEN
            RETURN jsonb_build_object('ok', false, 'fout', 'reservering_anders', 'beschikbaar_cents', 0);
        END IF;
        v_stand := private.cadeaubon_stand(v_cb);
        RETURN jsonb_build_object('ok', true, 'reservering_id', v_res.reservering_id, 'code', v_cb.code, 'bedrag_cents', v_res.bedrag_cents,
                                  'beschikbaar_na_cents', (v_stand->>'beschikbaar_cents')::INTEGER, 'verloopt_at', v_res.verloopt_at);
    END IF;

    v_stand := private.cadeaubon_stand(v_cb);
    v_status := v_stand->>'status';
    IF v_status = 'geblokkeerd' THEN
        RETURN jsonb_build_object('ok', false, 'fout', 'cadeaubon_geblokkeerd', 'beschikbaar_cents', 0);
    ELSIF v_status = 'verlopen' THEN
        RETURN jsonb_build_object('ok', false, 'fout', 'cadeaubon_verlopen', 'beschikbaar_cents', 0, 'geldig_tot', v_stand->'geldig_tot');
    ELSIF (v_stand->>'beschikbaar_cents')::INTEGER < p_bedrag_cents THEN
        RETURN jsonb_build_object('ok', false, 'fout', 'cadeaubon_saldo_te_laag', 'beschikbaar_cents', (v_stand->>'beschikbaar_cents')::INTEGER);
    END IF;

    INSERT INTO public.cadeaubon_reserveringen (organization_id, reservering_id, cadeaubon_id, apparaat_id, medewerker_id, bon_id, bedrag_cents, verloopt_at)
    VALUES (p_org, p_reservering_id, v_cb.id, p_apparaat_id, p_medewerker_id, p_bon_id, p_bedrag_cents, now() + c_duur)
    RETURNING * INTO v_res;
    INSERT INTO public.cadeaubon_mutaties (organization_id, cadeaubon_id, soort, bedrag_cents, saldo_wijziging_cents, saldo_na_cents,
                                           reservering_id, bon_id, apparaat_id, medewerker_id)
    VALUES (p_org, v_cb.id, 'reservering', p_bedrag_cents, 0, v_cb.saldo_cents, p_reservering_id, p_bon_id, p_apparaat_id, p_medewerker_id);

    RETURN jsonb_build_object('ok', true, 'reservering_id', v_res.reservering_id, 'code', v_cb.code, 'bedrag_cents', v_res.bedrag_cents,
                              'beschikbaar_na_cents', (private.cadeaubon_stand(v_cb)->>'beschikbaar_cents')::INTEGER, 'verloopt_at', v_res.verloopt_at);
END $$;
COMMENT ON FUNCTION public.toonbank_cadeaubon_reserveren(UUID, UUID, TEXT, UUID, UUID, INTEGER, UUID) IS
    'POST /api/toonbank/v1/cadeaubonnen/{code}/reserveren (contract 1.2): houdt het bedrag 15 minuten vast voor een bon. Idempotent op reservering_id. Er wordt nog niets afgeschreven. Alleen service_role.';
REVOKE ALL ON FUNCTION public.toonbank_cadeaubon_reserveren(UUID, UUID, TEXT, UUID, UUID, INTEGER, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.toonbank_cadeaubon_reserveren(UUID, UUID, TEXT, UUID, UUID, INTEGER, UUID) TO service_role;


-- ── 10. POST cadeaubonnen/{code}/vrijgeven ──────────────────────────────────
-- De verkoop gaat niet door. Twee keer kan geen kwaad: vrijgegeven is alleen
-- waar als de reservering nu nog vast was (niet verlopen, niet gebruikt).
-- Alleen een reservering van deze tablet. Geeft {ok: true, reservering_id,
-- vrijgegeven, beschikbaar_cents} of {ok: false, fout: cadeaubon_onbekend}.
CREATE OR REPLACE FUNCTION public.toonbank_cadeaubon_vrijgeven(
    p_org             UUID,
    p_apparaat_id     UUID,
    p_code            TEXT,
    p_reservering_id  UUID,
    p_medewerker_id   UUID DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_cb   public.cadeaubonnen%ROWTYPE;
    v_res  public.cadeaubon_reserveringen%ROWTYPE;
    v_vrij BOOLEAN := false;
BEGIN
    PERFORM private.vereis_org(p_org);
    IF p_reservering_id IS NULL THEN
        RAISE EXCEPTION 'vrijgeven: reservering_id ontbreekt' USING ERRCODE = '22023';
    END IF;
    SELECT * INTO v_cb FROM public.cadeaubonnen WHERE organization_id = p_org AND code = private.cadeaubon_code(p_code) FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'fout', 'cadeaubon_onbekend');
    END IF;

    SELECT * INTO v_res FROM public.cadeaubon_reserveringen
     WHERE organization_id = p_org AND reservering_id = p_reservering_id AND cadeaubon_id = v_cb.id AND apparaat_id = p_apparaat_id
       FOR UPDATE;
    IF FOUND AND v_res.status = 'vast' AND v_res.verloopt_at > now() THEN
        UPDATE public.cadeaubon_reserveringen
           SET status = 'vrij', vrijgegeven_at = now(), updated_at = now()
         WHERE organization_id = p_org AND reservering_id = p_reservering_id;
        INSERT INTO public.cadeaubon_mutaties (organization_id, cadeaubon_id, soort, bedrag_cents, saldo_wijziging_cents, saldo_na_cents,
                                               reservering_id, bon_id, apparaat_id, medewerker_id)
        VALUES (p_org, v_cb.id, 'vrijgave', v_res.bedrag_cents, 0, v_cb.saldo_cents, p_reservering_id, v_res.bon_id, p_apparaat_id, p_medewerker_id);
        v_vrij := true;
    END IF;

    RETURN jsonb_build_object('ok', true, 'reservering_id', p_reservering_id, 'vrijgegeven', v_vrij,
                              'beschikbaar_cents', (private.cadeaubon_stand(v_cb)->>'beschikbaar_cents')::INTEGER);
END $$;
COMMENT ON FUNCTION public.toonbank_cadeaubon_vrijgeven(UUID, UUID, TEXT, UUID, UUID) IS
    'POST /api/toonbank/v1/cadeaubonnen/{code}/vrijgeven (contract 1.2): de reservering van deze tablet vervalt. Twee keer kan geen kwaad. Alleen service_role.';
REVOKE ALL ON FUNCTION public.toonbank_cadeaubon_vrijgeven(UUID, UUID, TEXT, UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.toonbank_cadeaubon_vrijgeven(UUID, UUID, TEXT, UUID, UUID) TO service_role;


-- ── 11. Afschrijven als de bon binnenkomt ───────────────────────────────────
-- Aangeroepen door toonbank_boek_bon, in dezelfde transactie als de bon.
-- Per betaalregel cadeaubon: afschrijven met sleutel tb:{bon}:{reservering}
-- (of tb:{bon}:regel-{n} zonder reservering). Nooit een weigering en geen
-- fout voor iets wat de bon zegt: alles wat niet klopt wordt een controle
-- [{code, melding}], die toonbank_boek_bon "Te controleren" maakt.
--   - een tegenbon met een cadeaubon: niets teruggezet (niet in 1.2);
--   - geen code, geen bedrag, of een code die niet bestaat: niets afgeschreven;
--   - geen, een onbekende of een al gebruikte reservering, een ander bedrag,
--     een geblokkeerde of verlopen cadeaubon: wél afgeschreven, met controle;
--   - een reservering die verliep: gewoon afgeschreven; alleen als het saldo
--     daardoor onder nul komt een controle.
CREATE OR REPLACE FUNCTION private.toonbank_cadeaubon_boek_bon(
    p_org       UUID,
    p_apparaat  UUID,
    p_bon_id    UUID,
    p_bonnummer TEXT,
    p_soort     TEXT,
    p_regels    JSONB,
    p_tijd      TIMESTAMPTZ
) RETURNS JSONB
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
    v_r        JSONB;
    v_nr       BIGINT;
    v_bedrag   BIGINT;
    v_code     TEXT;
    v_res_id   UUID;
    v_sleutel  TEXT;
    v_cb       public.cadeaubonnen%ROWTYPE;
    v_res      public.cadeaubon_reserveringen%ROWTYPE;
    v_saldo    INTEGER;
    v_mw       UUID;
    v_c        JSONB := '[]'::JSONB;
BEGIN
    FOR v_r IN SELECT e FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p_regels) = 'array' THEN p_regels ELSE '[]'::JSONB END) e
                WHERE e->>'soort' = 'betaling' AND e->>'betaalmethode' = 'cadeaubon'
                ORDER BY private.tb_int(e->'regelnr') LOOP
        v_nr := private.tb_int(v_r->'regelnr');
        v_bedrag := private.tb_int(v_r->'bedrag_cents');
        v_code := private.cadeaubon_code(v_r->>'cadeaubon_code');
        v_res_id := private.tb_uuid(v_r->>'reservering_id');

        IF p_soort = 'tegenbon' THEN
            v_c := v_c || jsonb_build_object('code', 'cadeaubon_terug', 'melding',
                format('Regel %s: %s ct terug op cadeaubon %s. Terugbetalen op een cadeaubon kan nog niet; niets teruggezet. Corrigeer het saldo met de hand als dat de bedoeling was.',
                       v_nr, v_bedrag, COALESCE(v_code, '(zonder code)')));
            CONTINUE;
        END IF;
        IF v_bedrag IS NULL OR v_bedrag <= 0 THEN
            v_c := v_c || jsonb_build_object('code', 'cadeaubon_bedrag', 'melding',
                format('Regel %s: betaling met cadeaubon %s zonder bedrag boven 0; niets afgeschreven.', v_nr, COALESCE(v_code, '(zonder code)')));
            CONTINUE;
        END IF;
        IF v_code IS NULL THEN
            v_c := v_c || jsonb_build_object('code', 'cadeaubon_zonder_code', 'melding',
                format('Regel %s: %s ct betaald met een cadeaubon zonder code; niets afgeschreven. Zoek uit welke cadeaubon het was en corrigeer het saldo.', v_nr, v_bedrag));
            CONTINUE;
        END IF;

        -- Al afgeschreven (dezelfde bon en reservering): niets opnieuw.
        v_sleutel := format('tb:%s:%s', p_bon_id, COALESCE(v_res_id::TEXT, 'regel-' || v_nr));
        CONTINUE WHEN EXISTS (SELECT 1 FROM public.cadeaubon_mutaties WHERE organization_id = p_org AND idempotency_key = v_sleutel);

        SELECT * INTO v_cb FROM public.cadeaubonnen WHERE organization_id = p_org AND code = v_code FOR UPDATE;
        IF NOT FOUND THEN
            v_c := v_c || jsonb_build_object('code', 'cadeaubon_onbekend', 'melding',
                format('Regel %s: %s ct betaald met cadeaubon %s, die BBQ Architect niet kent; niets afgeschreven. De bon is wel geboekt.', v_nr, v_bedrag, v_code));
            CONTINUE;
        END IF;

        -- De reservering: gebruikt, wat er ook mee is. Afwijkingen worden een controle.
        v_mw := NULL;
        IF v_res_id IS NULL THEN
            v_c := v_c || jsonb_build_object('code', 'cadeaubon_zonder_reservering', 'melding',
                format('Regel %s: cadeaubon %s zonder reservering; toch %s ct afgeschreven.', v_nr, v_code, v_bedrag));
        ELSE
            SELECT * INTO v_res FROM public.cadeaubon_reserveringen WHERE organization_id = p_org AND reservering_id = v_res_id FOR UPDATE;
            IF NOT FOUND OR v_res.cadeaubon_id <> v_cb.id THEN
                v_c := v_c || jsonb_build_object('code', 'cadeaubon_reservering_onbekend', 'melding',
                    format('Regel %s: de reservering hoort niet bij cadeaubon %s; toch %s ct afgeschreven.', v_nr, v_code, v_bedrag));
            ELSIF v_res.status = 'gebruikt' AND v_res.gebruikt_bon_id IS DISTINCT FROM p_bon_id THEN
                v_c := v_c || jsonb_build_object('code', 'cadeaubon_reservering_gebruikt', 'melding',
                    format('Regel %s: de reservering op cadeaubon %s was al gebruikt voor een andere bon; toch %s ct afgeschreven. Twee keer betaald?', v_nr, v_code, v_bedrag));
            ELSE
                IF v_res.bedrag_cents <> v_bedrag THEN
                    v_c := v_c || jsonb_build_object('code', 'cadeaubon_bedrag_anders', 'melding',
                        format('Regel %s: op cadeaubon %s was %s ct gereserveerd, op de bon staat %s ct; dat is afgeschreven.', v_nr, v_code, v_res.bedrag_cents, v_bedrag));
                END IF;
                v_mw := v_res.medewerker_id;
                UPDATE public.cadeaubon_reserveringen
                   SET status = 'gebruikt', gebruikt_at = now(), gebruikt_bon_id = p_bon_id, updated_at = now()
                 WHERE organization_id = p_org AND reservering_id = v_res_id;
            END IF;
        END IF;
        IF v_cb.geblokkeerd_at IS NOT NULL THEN
            v_c := v_c || jsonb_build_object('code', 'cadeaubon_geblokkeerd', 'melding',
                format('Regel %s: cadeaubon %s is geblokkeerd, maar er is mee betaald; toch %s ct afgeschreven.', v_nr, v_code, v_bedrag));
        END IF;
        IF v_cb.geldig_tot IS NOT NULL AND v_cb.geldig_tot < (p_tijd AT TIME ZONE 'Europe/Amsterdam')::DATE THEN
            v_c := v_c || jsonb_build_object('code', 'cadeaubon_verlopen', 'melding',
                format('Regel %s: cadeaubon %s was op de dag van de bon al verlopen (geldig tot %s); toch %s ct afgeschreven.',
                       v_nr, v_code, to_char(v_cb.geldig_tot, 'DD-MM-YYYY'), v_bedrag));
        END IF;

        UPDATE public.cadeaubonnen SET saldo_cents = saldo_cents - v_bedrag::INTEGER, updated_at = now()
         WHERE id = v_cb.id
        RETURNING saldo_cents INTO v_saldo;
        INSERT INTO public.cadeaubon_mutaties (organization_id, cadeaubon_id, soort, bedrag_cents, saldo_wijziging_cents, saldo_na_cents,
                                               reservering_id, bon_id, bonnummer, apparaat_id, medewerker_id, idempotency_key, gebeurd_at, notitie)
        VALUES (p_org, v_cb.id, 'afschrijving', v_bedrag::INTEGER, -v_bedrag::INTEGER, v_saldo, v_res_id, p_bon_id, p_bonnummer, p_apparaat, v_mw,
                v_sleutel, p_tijd, format('Bon %s r%s', p_bonnummer, v_nr));
        IF v_saldo < 0 THEN
            v_c := v_c || jsonb_build_object('code', 'cadeaubon_saldo_negatief', 'melding',
                format('Regel %s: na bon %s staat cadeaubon %s op %s ct (onder nul): er is meer afgeschreven dan erop stond. De bon kwam waarschijnlijk binnen nadat de reservering verliep.',
                       v_nr, p_bonnummer, v_code, v_saldo));
        END IF;
    END LOOP;
    RETURN v_c;
END $$;
COMMENT ON FUNCTION private.toonbank_cadeaubon_boek_bon(UUID, UUID, UUID, TEXT, TEXT, JSONB, TIMESTAMPTZ) IS
    'Contract 1.2: schrijft de betaalregels cadeaubon van een binnengekomen bon af (idempotent op tb:{bon}:{reservering}). Weigert nooit; geeft de controles [{code, melding}] voor Te controleren. Alleen vanuit toonbank_boek_bon.';
REVOKE ALL ON FUNCTION private.toonbank_cadeaubon_boek_bon(UUID, UUID, UUID, TEXT, TEXT, JSONB, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated, service_role;


-- ── 12. Beheer: uitgeven, blokkeren, corrigeren (alleen een Admin) ──────────
-- Een cadeaubon uitgeven. De code maakt BBQ Architect (src/lib/toonbank/
-- cadeaubonnen.ts) of de Admin geeft hem op (een voorgedrukte bon). Een code
-- die al bestaat: 23505. Hoe de verkoop van de cadeaubon zelf geboekt wordt
-- (webshop, BBQ Architect, Toonbank; geen omzet, geen btw) is nog niet besloten:
-- dit legt alleen de bon en zijn waarde vast, met een notitie.
CREATE OR REPLACE FUNCTION public.cadeaubon_uitgeven(
    p_org           UUID,
    p_code          TEXT,
    p_waarde_cents  INTEGER,
    p_geldig_tot    DATE DEFAULT NULL,
    p_notitie       TEXT DEFAULT NULL,
    p_door          UUID DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_code TEXT := private.cadeaubon_code(p_code);
    v_door UUID := COALESCE(auth.uid(), p_door);
    v_cb   public.cadeaubonnen%ROWTYPE;
BEGIN
    PERFORM private.vereis_org(p_org);
    PERFORM private.toonbank_vereis_admin(p_org);
    IF v_code IS NULL OR v_code !~ '^[A-Z0-9-]{4,40}$' THEN
        RAISE EXCEPTION 'een code is 4 tot 40 tekens: hoofdletters, cijfers en streepjes' USING ERRCODE = '22023';
    END IF;
    IF COALESCE(p_waarde_cents, 0) <= 0 THEN
        RAISE EXCEPTION 'de waarde is meer dan € 0' USING ERRCODE = '22023';
    END IF;
    IF p_geldig_tot IS NOT NULL AND p_geldig_tot < (now() AT TIME ZONE 'Europe/Amsterdam')::DATE THEN
        RAISE EXCEPTION 'geldig tot ligt in het verleden' USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.cadeaubonnen (organization_id, code, waarde_cents, saldo_cents, geldig_tot, uitgegeven_door, notitie)
    VALUES (p_org, v_code, p_waarde_cents, p_waarde_cents, p_geldig_tot, v_door, NULLIF(left(btrim(COALESCE(p_notitie, '')), 500), ''))
    RETURNING * INTO v_cb;
    INSERT INTO public.cadeaubon_mutaties (organization_id, cadeaubon_id, soort, bedrag_cents, saldo_wijziging_cents, saldo_na_cents, door_user_id, notitie)
    VALUES (p_org, v_cb.id, 'uitgifte', p_waarde_cents, p_waarde_cents, p_waarde_cents, v_door, v_cb.notitie);

    RETURN jsonb_build_object('id', v_cb.id, 'code', v_cb.code, 'waarde_cents', v_cb.waarde_cents, 'saldo_cents', v_cb.saldo_cents,
                              'geldig_tot', to_char(v_cb.geldig_tot, 'YYYY-MM-DD'));
END $$;
COMMENT ON FUNCTION public.cadeaubon_uitgeven(UUID, TEXT, INTEGER, DATE, TEXT, UUID) IS
    'Instellingen → Toonbank → Cadeaubonnen: een cadeaubon uitgeven (code, waarde, geldig tot, notitie), met een mutatie uitgifte. Alleen een Admin (of service_role). Een bestaande code: 23505.';
REVOKE ALL ON FUNCTION public.cadeaubon_uitgeven(UUID, TEXT, INTEGER, DATE, TEXT, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cadeaubon_uitgeven(UUID, TEXT, INTEGER, DATE, TEXT, UUID) TO authenticated, service_role;

-- Blokkeren (verloren, gestolen, misbruik) of weer vrijgeven. Een reden is
-- verplicht bij blokkeren. Lopende reserveringen blijven staan; een bon die
-- daarmee al betaald is, wordt bij binnenkomst toch afgeschreven (controle).
CREATE OR REPLACE FUNCTION public.cadeaubon_blokkeren(
    p_org          UUID,
    p_id           UUID,
    p_blokkeren    BOOLEAN,
    p_reden        TEXT DEFAULT NULL,
    p_door         UUID DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_door  UUID := COALESCE(auth.uid(), p_door);
    v_reden TEXT := NULLIF(left(btrim(COALESCE(p_reden, '')), 500), '');
    v_cb    public.cadeaubonnen%ROWTYPE;
BEGIN
    PERFORM private.vereis_org(p_org);
    PERFORM private.toonbank_vereis_admin(p_org);
    IF p_blokkeren IS NULL THEN
        RAISE EXCEPTION 'blokkeren is waar of onwaar' USING ERRCODE = '22023';
    END IF;
    IF p_blokkeren AND v_reden IS NULL THEN
        RAISE EXCEPTION 'geef een reden waarom de cadeaubon geblokkeerd wordt' USING ERRCODE = '22023';
    END IF;
    SELECT * INTO v_cb FROM public.cadeaubonnen WHERE id = p_id AND organization_id = p_org FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'cadeaubon % niet in deze organisatie', p_id USING ERRCODE = 'P0002';
    END IF;
    IF (v_cb.geblokkeerd_at IS NOT NULL) = p_blokkeren THEN
        RETURN jsonb_build_object('id', v_cb.id, 'status', private.cadeaubon_status(v_cb.geblokkeerd_at, v_cb.geldig_tot, v_cb.saldo_cents), 'uitkomst', 'niets_te_doen');
    END IF;

    UPDATE public.cadeaubonnen
       SET geblokkeerd_at = CASE WHEN p_blokkeren THEN now() END,
           geblokkeerd_door = CASE WHEN p_blokkeren THEN v_door END,
           geblokkeerd_reden = CASE WHEN p_blokkeren THEN v_reden END,
           updated_at = now()
     WHERE id = v_cb.id
    RETURNING * INTO v_cb;
    INSERT INTO public.cadeaubon_mutaties (organization_id, cadeaubon_id, soort, bedrag_cents, saldo_wijziging_cents, saldo_na_cents, door_user_id, notitie)
    VALUES (p_org, v_cb.id, CASE WHEN p_blokkeren THEN 'blokkade' ELSE 'deblokkade' END, 0, 0, v_cb.saldo_cents, v_door, v_reden);

    RETURN jsonb_build_object('id', v_cb.id, 'status', private.cadeaubon_status(v_cb.geblokkeerd_at, v_cb.geldig_tot, v_cb.saldo_cents),
                              'uitkomst', CASE WHEN p_blokkeren THEN 'geblokkeerd' ELSE 'vrijgegeven' END);
END $$;
COMMENT ON FUNCTION public.cadeaubon_blokkeren(UUID, UUID, BOOLEAN, TEXT, UUID) IS
    'Instellingen → Toonbank → Cadeaubonnen: een cadeaubon blokkeren (met reden) of weer vrijgeven, met een mutatie blokkade of deblokkade. Alleen een Admin (of service_role).';
REVOKE ALL ON FUNCTION public.cadeaubon_blokkeren(UUID, UUID, BOOLEAN, TEXT, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cadeaubon_blokkeren(UUID, UUID, BOOLEAN, TEXT, UUID) TO authenticated, service_role;

-- Het saldo met de hand corrigeren (plus of min), altijd met een reden. Voor
-- wat er in Te controleren opviel: een saldo onder nul, een bon met een
-- onbekende code, of een retour dat op de cadeaubon terug moet.
CREATE OR REPLACE FUNCTION public.cadeaubon_corrigeren(
    p_org          UUID,
    p_id           UUID,
    p_bedrag_cents INTEGER,
    p_reden        TEXT,
    p_door         UUID DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_door  UUID := COALESCE(auth.uid(), p_door);
    v_reden TEXT := NULLIF(left(btrim(COALESCE(p_reden, '')), 500), '');
    v_cb    public.cadeaubonnen%ROWTYPE;
BEGIN
    PERFORM private.vereis_org(p_org);
    PERFORM private.toonbank_vereis_admin(p_org);
    IF COALESCE(p_bedrag_cents, 0) = 0 THEN
        RAISE EXCEPTION 'een correctie is een bedrag, plus of min, niet 0' USING ERRCODE = '22023';
    END IF;
    IF v_reden IS NULL THEN
        RAISE EXCEPTION 'geef een reden voor de correctie' USING ERRCODE = '22023';
    END IF;
    SELECT * INTO v_cb FROM public.cadeaubonnen WHERE id = p_id AND organization_id = p_org FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'cadeaubon % niet in deze organisatie', p_id USING ERRCODE = 'P0002';
    END IF;

    UPDATE public.cadeaubonnen SET saldo_cents = saldo_cents + p_bedrag_cents, updated_at = now()
     WHERE id = v_cb.id
    RETURNING * INTO v_cb;
    INSERT INTO public.cadeaubon_mutaties (organization_id, cadeaubon_id, soort, bedrag_cents, saldo_wijziging_cents, saldo_na_cents, door_user_id, notitie)
    VALUES (p_org, v_cb.id, 'correctie', abs(p_bedrag_cents), p_bedrag_cents, v_cb.saldo_cents, v_door, v_reden);

    RETURN jsonb_build_object('id', v_cb.id, 'saldo_cents', v_cb.saldo_cents,
                              'status', private.cadeaubon_status(v_cb.geblokkeerd_at, v_cb.geldig_tot, v_cb.saldo_cents));
END $$;
COMMENT ON FUNCTION public.cadeaubon_corrigeren(UUID, UUID, INTEGER, TEXT, UUID) IS
    'Instellingen → Toonbank → Cadeaubonnen: het saldo met de hand corrigeren (plus of min, met reden), als mutatie correctie. Alleen een Admin (of service_role).';
REVOKE ALL ON FUNCTION public.cadeaubon_corrigeren(UUID, UUID, INTEGER, TEXT, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cadeaubon_corrigeren(UUID, UUID, INTEGER, TEXT, UUID) TO authenticated, service_role;

-- De lijst voor het beheerscherm: met de afgeleide status en wat er nu
-- gereserveerd is. Alleen een Admin.
CREATE OR REPLACE FUNCTION public.cadeaubonnen_overzicht(p_org UUID, p_limiet INTEGER DEFAULT 500)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    PERFORM private.vereis_org(p_org);
    PERFORM private.toonbank_vereis_admin(p_org);
    RETURN COALESCE((
        SELECT jsonb_agg(x.rij ORDER BY x.uitgegeven_at DESC, x.code)
          FROM (SELECT c.uitgegeven_at, c.code,
                       jsonb_build_object(
                           'id', c.id, 'code', c.code, 'waarde_cents', c.waarde_cents, 'saldo_cents', c.saldo_cents,
                           'gereserveerd_cents', private.cadeaubon_gereserveerd(c.id),
                           'status', private.cadeaubon_status(c.geblokkeerd_at, c.geldig_tot, c.saldo_cents),
                           'geldig_tot', to_char(c.geldig_tot, 'YYYY-MM-DD'), 'uitgegeven_at', c.uitgegeven_at,
                           'notitie', c.notitie, 'geblokkeerd_reden', c.geblokkeerd_reden,
                           'laatste_mutatie_at', (SELECT max(m.created_at) FROM public.cadeaubon_mutaties m WHERE m.cadeaubon_id = c.id)) AS rij
                  FROM public.cadeaubonnen c
                 WHERE c.organization_id = p_org
                 ORDER BY c.uitgegeven_at DESC, c.code
                 LIMIT LEAST(GREATEST(COALESCE(p_limiet, 500), 1), 2000)) x), '[]'::JSONB);
END $$;
COMMENT ON FUNCTION public.cadeaubonnen_overzicht(UUID, INTEGER) IS
    'Instellingen → Toonbank → Cadeaubonnen: de cadeaubonnen met afgeleide status en lopende reserveringen, nieuwste eerst. Alleen een Admin (of service_role).';
REVOKE ALL ON FUNCTION public.cadeaubonnen_overzicht(UUID, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cadeaubonnen_overzicht(UUID, INTEGER) TO authenticated, service_role;


-- ── 13. toonbank_bon_fouten opnieuw: de betaalregel cadeaubon ───────────────
-- Letterlijk de versie uit 20261028160000 (§9), met één verschil: een
-- betaalregel mag ook betaalmethode 'cadeaubon' hebben.
CREATE OR REPLACE FUNCTION private.toonbank_bon_fouten(p JSONB)
RETURNS TEXT[]
LANGUAGE plpgsql
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
    f      TEXT[] := '{}';
    r      JSONB;
    b      JSONB;
    o      JSONB;
    v_nr   BIGINT;
    v_nrs  BIGINT[] := '{}';
    v_s    TEXT;
BEGIN
    IF jsonb_typeof(p) IS DISTINCT FROM 'object' THEN
        RETURN ARRAY['de bon is geen object'];
    END IF;
    IF private.tb_uuid(p->>'bon_id') IS NULL THEN f := array_append(f, 'bon_id is geen uuid'); END IF;
    IF COALESCE(p->>'bonnummer', '') !~ '^T[0-9]+-[0-9]{6,}$' THEN f := array_append(f, 'bonnummer is niet zoals T1-000412'); END IF;
    IF COALESCE(private.tb_int(p->'bon_volgnummer'), 0) < 1 THEN f := array_append(f, 'bon_volgnummer ontbreekt'); END IF;
    IF COALESCE(p->>'status', '') NOT IN ('afgerond', 'geannuleerd') THEN f := array_append(f, 'status is afgerond of geannuleerd'); END IF;
    IF COALESCE(p->>'kanaal', '') NOT IN ('winkel', 'event') THEN f := array_append(f, 'kanaal is winkel of event'); END IF;
    IF private.tb_int(p->'totaal_cents') IS NULL THEN f := array_append(f, 'totaal_cents ontbreekt'); END IF;
    IF COALESCE(jsonb_typeof(p->'afronding_cents'), 'null') <> 'null'
       AND (private.tb_int(p->'afronding_cents') IS NULL OR abs(private.tb_int(p->'afronding_cents')) > 2) THEN
        f := array_append(f, 'afronding_cents is −2 tot en met 2');
    END IF;
    IF jsonb_typeof(p->'leeftijd') = 'object' THEN
        IF COALESCE(p->'leeftijd'->>'uitkomst', '') NOT IN ('vastgesteld', 'geweigerd') OR private.tb_tijd(p->'leeftijd'->>'at') IS NULL THEN
            f := array_append(f, 'leeftijd: uitkomst vastgesteld of geweigerd, met een tijd');
        END IF;
    ELSIF COALESCE(jsonb_typeof(p->'leeftijd'), 'null') <> 'null' THEN
        f := array_append(f, 'leeftijd is een object of null');
    END IF;
    IF p->>'soort' = 'tegenbon' AND private.tb_uuid(p->>'verwijst_naar_bon_id') IS NULL THEN
        f := array_append(f, 'een tegenbon verwijst naar een bon (verwijst_naar_bon_id)');
    END IF;
    IF COALESCE(jsonb_typeof(p->'catalogus_versie'), 'null') <> 'null' AND private.tb_int(p->'catalogus_versie') IS NULL THEN
        f := array_append(f, 'catalogus_versie is een geheel getal');
    END IF;
    IF jsonb_typeof(p->'regels') IS DISTINCT FROM 'array' THEN
        RETURN array_append(f, 'regels is geen lijst');
    END IF;

    FOR r IN SELECT e FROM jsonb_array_elements(p->'regels') e LOOP
        v_nr := private.tb_int(r->'regelnr');
        IF jsonb_typeof(r) IS DISTINCT FROM 'object' OR v_nr IS NULL OR v_nr < 1 OR v_nr > 100000 THEN
            f := array_append(f, 'een regel zonder geldig regelnr');
            CONTINUE;
        END IF;
        IF v_nr = ANY (v_nrs) THEN f := array_append(f, format('regelnr %s staat er twee keer', v_nr)); END IF;
        v_nrs := array_append(v_nrs, v_nr);
        IF private.tb_int(r->'bedrag_cents') IS NULL THEN f := array_append(f, format('regel %s: bedrag_cents ontbreekt', v_nr)); END IF;
        v_s := r->>'soort';
        CASE v_s
            WHEN 'verkoop' THEN
                IF private.tb_int(r->'aantal') IS NULL THEN f := array_append(f, format('regel %s: aantal is een geheel getal', v_nr)); END IF;
                IF COALESCE(private.tb_int(r->'stuk_cents'), -1) < 0 THEN f := array_append(f, format('regel %s: stuk_cents ontbreekt', v_nr)); END IF;
                IF private.tb_int(r->'korting_cents') IS NULL THEN f := array_append(f, format('regel %s: korting_cents ontbreekt', v_nr)); END IF;
                IF jsonb_typeof(r->'alcohol') IS DISTINCT FROM 'boolean' THEN f := array_append(f, format('regel %s: alcohol is waar of onwaar', v_nr)); END IF;
                IF COALESCE(r->>'prijs_bron', '') NOT IN ('catalogus', 'open_prijs') THEN f := array_append(f, format('regel %s: prijs_bron', v_nr)); END IF;
                IF COALESCE(jsonb_typeof(r->'artikel_id'), 'null') <> 'null' AND private.tb_uuid(r->>'artikel_id') IS NULL THEN
                    f := array_append(f, format('regel %s: artikel_id is geen uuid', v_nr));
                END IF;
                IF jsonb_typeof(r->'btw') IS DISTINCT FROM 'array' OR jsonb_array_length(r->'btw') = 0 THEN
                    f := array_append(f, format('regel %s: btw per tarief ontbreekt', v_nr));
                ELSE
                    FOR b IN SELECT e FROM jsonb_array_elements(r->'btw') e LOOP
                        IF private.tb_int(b->'pct') IS NULL OR private.tb_int(b->'pct') NOT BETWEEN 0 AND 100 OR private.tb_int(b->'incl_cents') IS NULL THEN
                            f := array_append(f, format('regel %s: btw is [{pct, incl_cents}]', v_nr));
                        END IF;
                    END LOOP;
                END IF;
                IF jsonb_typeof(r->'onderdelen') IS DISTINCT FROM 'array' THEN
                    f := array_append(f, format('regel %s: onderdelen is een lijst', v_nr));
                ELSE
                    FOR o IN SELECT e FROM jsonb_array_elements(r->'onderdelen') e LOOP
                        IF private.tb_uuid(o->>'product_id') IS NULL OR COALESCE(private.tb_getal(o->'hoeveelheid'), 0) <= 0 THEN
                            f := array_append(f, format('regel %s: onderdeel zonder product_id of hoeveelheid', v_nr));
                        END IF;
                    END LOOP;
                END IF;
                IF COALESCE(jsonb_typeof(r->'goederen_terug'), 'null') NOT IN ('null', 'boolean') THEN
                    f := array_append(f, format('regel %s: goederen_terug is waar of onwaar', v_nr));
                END IF;
            WHEN 'statiegeld' THEN
                IF private.tb_int(r->'hoort_bij_regelnr') IS NULL OR private.tb_uuid(r->>'product_id') IS NULL OR private.tb_int(r->'aantal') IS NULL THEN
                    f := array_append(f, format('regel %s: statiegeld met hoort_bij_regelnr, product_id en aantal', v_nr));
                END IF;
            WHEN 'order_rest' THEN
                IF COALESCE(private.tb_int(r->'order_id'), 0) < 1 THEN f := array_append(f, format('regel %s: order_rest zonder order_id', v_nr)); END IF;
            WHEN 'betaling' THEN
                -- Contract 1.2: ook een cadeaubon. Geen code of geen reservering is geen fout in de vorm:
                -- de bon wordt geboekt en het wordt een controle (toonbank_cadeaubon_boek_bon).
                IF COALESCE(r->>'betaalmethode', '') NOT IN ('pin', 'contant', 'cadeaubon') THEN f := array_append(f, format('regel %s: betaalmethode is pin, contant of cadeaubon', v_nr)); END IF;
            ELSE
                f := array_append(f, format('regel %s: onbekende soort %s', v_nr, COALESCE(v_s, 'leeg')));
        END CASE;
    END LOOP;
    RETURN f;
END $$;
REVOKE ALL ON FUNCTION private.toonbank_bon_fouten(JSONB) FROM PUBLIC, anon, authenticated, service_role;


-- ── 14. toonbank_boek_bon opnieuw: afschrijven van de cadeaubon ─────────────
-- Letterlijk de versie uit 20261028160000 (§12), met deze verschillen:
--   - de som van de betalingen met een cadeaubon in toonbank_bonnen.cadeaubon_cents;
--   - op de regel cadeaubon_code en reservering_id, en de naam "Cadeaubon";
--   - na de controle van order_rest: private.toonbank_cadeaubon_boek_bon
--     (alleen bij een afgeronde bon). Zijn controles komen bij de andere,
--     dus een cadeaubon die niet klopt maakt de bon 'conflict', nooit 'fout'.
-- Het totaal blijft kloppen: betaald (pin + contant + cadeaubon) = totaal.
CREATE OR REPLACE FUNCTION public.toonbank_boek_bon(p_journaal_id BIGINT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_j          public.toonbank_journaal%ROWTYPE;
    v_org        UUID;
    v_p          JSONB;
    v_fouten     TEXT[];
    v_app        public.toonbank_apparaten%ROWTYPE;
    v_bon_id     UUID;
    v_soort      TEXT;
    v_status     TEXT;
    v_tijd       TIMESTAMPTZ;
    v_bonnummer  TEXT;
    v_orig       public.toonbank_bonnen%ROWTYPE;
    v_mw         UUID;
    v_mw_naam    TEXT;
    v_leeftijd   JSONB;
    v_alcohol    BOOLEAN;
    v_r          JSONB;
    v_rsoort     TEXT;
    v_verwijst   BIGINT;
    v_rij        RECORD;
    v_voorraad   NUMERIC;
    v_n          NUMERIC;
    v_tekort     NUMERIC;
    v_sleutel    TEXT;
    v_m          JSONB;
    v_rstatus    JSONB := '{}'::JSONB;
    v_nieuw      TEXT;
    v_boekingen  JSONB := '[]'::JSONB;
    v_controles  JSONB := '[]'::JSONB;
    v_sommen     RECORD;
    v_btw        JSONB;
    v_uitkomst   TEXT;
    c_rang       CONSTANT JSONB := '{"nvt": 1, "niet_bijgehouden": 2, "geboekt": 3, "voor_telling": 4, "tekort_gecorrigeerd": 5}'::JSONB;
    v_verkocht   UUID[] := '{}';
    v_pid        UUID;
    v_rr         RECORD;
    v_tekorten   JSONB;
    v_orders     JSONB := '[]'::JSONB;
BEGIN
    SELECT * INTO v_j FROM public.toonbank_journaal WHERE id = p_journaal_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'journaalregel % bestaat niet', p_journaal_id USING ERRCODE = 'P0002';
    END IF;
    v_org := v_j.organization_id;
    PERFORM private.vereis_org(v_org);
    IF v_j.soort NOT IN ('bon', 'tegenbon') THEN
        RAISE EXCEPTION 'journaalregel % is geen bon maar %', p_journaal_id, v_j.soort USING ERRCODE = '22023';
    END IF;
    v_p := v_j.payload;

    -- 1. Het tekortslot: alleen deze transactie mag een tekort corrigeren.
    PERFORM set_config('app.winkel_tekort', 'aan', true);

    -- De vorm. Klopt die niet, dan wordt er niets geboekt (de wachtrij zet 'fout').
    v_fouten := private.toonbank_bon_fouten(v_p);
    IF v_j.apparaat_tijd IS NULL THEN v_fouten := array_append(v_fouten, 'moment is geen tijd'); END IF;
    IF private.tb_uuid(v_p->>'bon_id') IS DISTINCT FROM v_j.gebeurtenis_id THEN
        v_fouten := array_append(v_fouten, 'bon_id is niet gelijk aan gebeurtenis_id');
    END IF;
    IF (v_j.soort = 'tegenbon') <> (v_p->>'soort' = 'tegenbon') THEN
        v_fouten := array_append(v_fouten, 'soort van de melding en de bon verschillen');
    END IF;
    IF cardinality(v_fouten) > 0 THEN
        RAISE EXCEPTION 'bon klopt niet: %', array_to_string(v_fouten[1:8], '; ') USING ERRCODE = '22023';
    END IF;

    v_bon_id := v_j.gebeurtenis_id;
    v_soort := CASE WHEN v_j.soort = 'tegenbon' THEN 'tegenbon' ELSE 'verkoop' END;
    v_status := v_p->>'status';
    -- Review M2 punt 8: de tijd van de tablet, maar nooit later dan het moment
    -- waarop BBQ Architect de melding ontving (een klok die voorloopt).
    v_tijd := LEAST(v_j.apparaat_tijd, v_j.ontvangen_at);
    v_bonnummer := v_p->>'bonnummer';

    -- 2a. Bestaat de bon al: niets opnieuw (idempotent).
    IF EXISTS (SELECT 1 FROM public.toonbank_bonnen WHERE id = v_bon_id) THEN
        UPDATE public.toonbank_journaal
           SET verwerk_status = CASE WHEN verwerk_status IN ('wacht', 'fout') THEN 'verwerkt' ELSE verwerk_status END,
               verwerkt_at = COALESCE(verwerkt_at, now())
         WHERE id = p_journaal_id;
        PERFORM set_config('app.winkel_tekort', '', true);
        RETURN jsonb_build_object('uitkomst', 'bestond', 'bon_id', v_bon_id, 'bonnummer', v_bonnummer, 'boekingen', '[]'::JSONB);
    END IF;

    -- 2b. Een tegenbon wacht tot de bon waarnaar hij verwijst verwerkt is.
    IF v_soort = 'tegenbon' THEN
        SELECT * INTO v_orig FROM public.toonbank_bonnen
         WHERE id = private.tb_uuid(v_p->>'verwijst_naar_bon_id') AND organization_id = v_org;
        IF NOT FOUND THEN
            UPDATE public.toonbank_journaal
               SET pogingen = pogingen + 1, fout_code = 'wacht_op_bon',
                   fout_melding = format('wacht op bon %s', v_p->>'verwijst_naar_bon_id')
             WHERE id = p_journaal_id;
            PERFORM set_config('app.winkel_tekort', '', true);
            RETURN jsonb_build_object('uitkomst', 'wacht', 'bon_id', v_bon_id, 'bonnummer', v_bonnummer, 'boekingen', '[]'::JSONB);
        END IF;
    END IF;

    SELECT * INTO v_app FROM public.toonbank_apparaten WHERE id = v_j.apparaat_id;
    v_mw := private.tb_uuid(v_p->>'medewerker_id');
    IF v_mw IS NOT NULL THEN
        SELECT naam INTO v_mw_naam FROM public.personeel WHERE id = v_mw AND organization_id = v_org;
        IF NOT FOUND THEN
            v_controles := v_controles || jsonb_build_object('code', 'medewerker_onbekend', 'melding', 'De medewerker op de bon is onbekend in BBQ Architect.');
        END IF;
    END IF;
    v_leeftijd := CASE WHEN jsonb_typeof(v_p->'leeftijd') = 'object' THEN v_p->'leeftijd' END;
    SELECT COALESCE(bool_or((e->>'alcohol')::BOOLEAN AND private.tb_int(e->'aantal') > 0), false) INTO v_alcohol
      FROM jsonb_array_elements(v_p->'regels') e WHERE e->>'soort' = 'verkoop';

    -- De sommen van de bon.
    SELECT
        COALESCE(sum(private.tb_int(e->'bedrag_cents')) FILTER (WHERE e->>'soort' = 'verkoop'), 0)    AS omzet,
        COALESCE(sum(private.tb_int(e->'bedrag_cents')) FILTER (WHERE e->>'soort' = 'statiegeld'), 0) AS statiegeld,
        COALESCE(sum(private.tb_int(e->'bedrag_cents')) FILTER (WHERE e->>'soort' = 'order_rest'), 0) AS order_rest,
        COALESCE(sum(private.tb_int(e->'korting_cents')) FILTER (WHERE e->>'soort' = 'verkoop'), 0)   AS korting,
        COALESCE(sum(private.tb_int(e->'bedrag_cents')) FILTER (WHERE e->>'soort' = 'betaling'), 0)   AS betaald,
        COALESCE(sum(private.tb_int(e->'bedrag_cents')) FILTER (WHERE e->>'soort' = 'betaling' AND e->>'betaalmethode' = 'pin'), 0)     AS pin,
        COALESCE(sum(private.tb_int(e->'bedrag_cents')) FILTER (WHERE e->>'soort' = 'betaling' AND e->>'betaalmethode' = 'contant'), 0) AS contant,
        COALESCE(sum(private.tb_int(e->'bedrag_cents')) FILTER (WHERE e->>'soort' = 'betaling' AND e->>'betaalmethode' = 'cadeaubon'), 0) AS cadeaubon
      INTO v_sommen
      FROM jsonb_array_elements(v_p->'regels') e;

    -- De bon-btw: per tarief de incl van de verkoopregels optellen, één keer afronden.
    SELECT COALESCE(jsonb_object_agg(t.pct::TEXT, jsonb_build_object('incl_cents', t.incl, 'btw_cents', private.toonbank_btw_uit_incl(t.incl, t.pct))), '{}'::JSONB)
      INTO v_btw
      FROM (SELECT private.tb_int(b->'pct')::INTEGER AS pct, sum(private.tb_int(b->'incl_cents'))::BIGINT AS incl
              FROM jsonb_array_elements(v_p->'regels') e, jsonb_array_elements(e->'btw') b
             WHERE e->>'soort' = 'verkoop'
             GROUP BY 1) t;

    -- 2c. De bon.
    INSERT INTO public.toonbank_bonnen (
        id, organization_id, apparaat_id, journaal_id, bonnummer, bon_volgnummer, soort, status, verwijst_naar_bon_id, reden,
        kanaal, event_label, medewerker_id, medewerker_naam, leeftijd_vastgesteld, leeftijd_vastgesteld_at, leeftijd_geweigerd,
        catalogus_versie, voorraad_versie, totaal_cents, afronding_cents, omzet_incl_cents, btw, statiegeld_cents, order_rest_cents,
        korting_cents, pin_cents, contant_cents, cadeaubon_cents, prijs_afwijking, gebeurd_at, bedrijfsdag, ontvangen_at, verwerkt_at)
    VALUES (
        v_bon_id, v_org, v_j.apparaat_id, v_j.id, v_bonnummer, private.tb_int(v_p->'bon_volgnummer'), v_soort, v_status,
        CASE WHEN v_soort = 'tegenbon' THEN v_orig.id END,
        CASE WHEN v_soort = 'tegenbon' THEN left(v_p->>'reden', 500) END,
        v_p->>'kanaal', left(v_p->>'event_label', 120), v_mw, v_mw_naam,
        CASE WHEN v_alcohol AND v_status = 'afgerond' THEN COALESCE(v_leeftijd->>'uitkomst' = 'vastgesteld', false) END,
        CASE WHEN v_leeftijd->>'uitkomst' = 'vastgesteld' THEN LEAST(private.tb_tijd(v_leeftijd->>'at'), v_j.ontvangen_at) END,
        COALESCE(v_leeftijd->>'uitkomst' = 'geweigerd', false),
        private.tb_int(v_p->'catalogus_versie'), private.tb_int(v_p->'voorraad_versie'),
        private.tb_int(v_p->'totaal_cents'), COALESCE(private.tb_int(v_p->'afronding_cents'), 0),
        v_sommen.omzet, v_btw, v_sommen.statiegeld, v_sommen.order_rest, v_sommen.korting, v_sommen.pin, v_sommen.contant, v_sommen.cadeaubon,
        EXISTS (SELECT 1 FROM jsonb_array_elements(v_p->'regels') e
                  JOIN public.winkel_artikelen a ON a.id = private.tb_uuid(e->>'artikel_id') AND a.organization_id = v_org
                 WHERE e->>'soort' = 'verkoop' AND e->>'prijs_bron' = 'catalogus'
                   AND a.prijs_cents IS DISTINCT FROM private.tb_int(e->'stuk_cents')),
        -- gebeurd_at begrensd (punt 8); de bedrijfsdag uit dag_openen (K3).
        v_tijd, private.toonbank_bedrijfsdag(v_j.apparaat_id, v_j.apparaat_tijd, v_tijd), v_j.ontvangen_at, now());

    -- 2d. De regels (de onderdelen als momentopname).
    FOR v_r IN SELECT e FROM jsonb_array_elements(v_p->'regels') e ORDER BY private.tb_int(e->'regelnr') LOOP
        v_rsoort := v_r->>'soort';
        v_verwijst := NULL;
        IF v_soort = 'tegenbon' AND private.tb_int(v_r->'verwijst_naar_regelnr') IS NOT NULL THEN
            SELECT id INTO v_verwijst FROM public.toonbank_bon_regels
             WHERE bon_id = v_orig.id AND regelnr = private.tb_int(v_r->'verwijst_naar_regelnr');
            IF NOT FOUND THEN
                v_controles := v_controles || jsonb_build_object('code', 'regel_onbekend',
                    'melding', format('Regel %s verwijst naar regel %s van %s, die niet bestaat.', v_r->>'regelnr', v_r->>'verwijst_naar_regelnr', v_orig.bonnummer));
            END IF;
        END IF;
        INSERT INTO public.toonbank_bon_regels (
            organization_id, bon_id, regelnr, soort, artikel_id, open_prijs_groep, naam, aantal, stuk_cents, korting_cents,
            bedrag_cents, btw, alcohol, hoort_bij_regelnr, product_id, onderdelen, scan_code, prijs_bron, order_id,
            betaalmethode, betaal_bevestiging, contant_ontvangen_cents, wisselgeld_cents, voorraad_status,
            verwijst_naar_regel_id, verwijst_naar_regelnr, goederen_terug, cadeaubon_code, reservering_id)
        VALUES (
            v_org, v_bon_id, private.tb_int(v_r->'regelnr'), v_rsoort,
            CASE WHEN v_rsoort = 'verkoop' THEN private.tb_uuid(v_r->>'artikel_id') END,
            left(NULLIF(btrim(COALESCE(v_r->>'open_prijs_groep', '')), ''), 120),
            left(COALESCE(v_r->>'naam',
                          CASE v_rsoort WHEN 'statiegeld' THEN 'Statiegeld'
                                        WHEN 'order_rest' THEN btrim('Restbetaling ' || COALESCE(v_r->>'nummer', ''))
                                        WHEN 'betaling' THEN CASE v_r->>'betaalmethode' WHEN 'pin' THEN 'Pin' WHEN 'cadeaubon' THEN 'Cadeaubon' ELSE 'Contant' END END), 200),
            private.tb_getal(v_r->'aantal'),
            private.tb_int(v_r->'stuk_cents'), private.tb_int(v_r->'korting_cents'), private.tb_int(v_r->'bedrag_cents'),
            CASE WHEN v_rsoort = 'verkoop' THEN
                (SELECT jsonb_agg(jsonb_build_object('pct', private.tb_int(b->'pct'), 'incl_cents', private.tb_int(b->'incl_cents'),
                                                     'btw_cents', private.toonbank_btw_uit_incl(private.tb_int(b->'incl_cents'), private.tb_int(b->'pct')::INTEGER)))
                   FROM jsonb_array_elements(v_r->'btw') b) END,
            CASE WHEN v_rsoort = 'verkoop' THEN (v_r->>'alcohol')::BOOLEAN END,
            private.tb_int(v_r->'hoort_bij_regelnr'),
            CASE WHEN v_rsoort = 'statiegeld' THEN private.tb_uuid(v_r->>'product_id') END,
            CASE WHEN v_rsoort = 'verkoop' THEN v_r->'onderdelen' END,
            left(v_r->>'scan_code', 200),
            CASE WHEN v_rsoort = 'verkoop' THEN v_r->>'prijs_bron' END,
            CASE WHEN v_rsoort = 'order_rest' THEN private.tb_int(v_r->'order_id') END,
            CASE WHEN v_rsoort = 'betaling' THEN v_r->>'betaalmethode' END,
            CASE WHEN v_rsoort = 'betaling' THEN left(v_r->>'betaal_bevestiging', 40) END,
            CASE WHEN v_rsoort = 'betaling' THEN private.tb_int(v_r->'contant_ontvangen_cents') END,
            CASE WHEN v_rsoort = 'betaling' THEN private.tb_int(v_r->'wisselgeld_cents') END,
            CASE WHEN v_rsoort = 'verkoop' AND v_status = 'afgerond' AND private.tb_int(v_r->'aantal') <> 0
                      AND jsonb_array_length(v_r->'onderdelen') > 0 THEN NULL ELSE 'nvt' END,
            v_verwijst, private.tb_int(v_r->'verwijst_naar_regelnr'),
            CASE WHEN jsonb_typeof(v_r->'goederen_terug') = 'boolean' THEN (v_r->>'goederen_terug')::BOOLEAN END,
            CASE WHEN v_rsoort = 'betaling' AND v_r->>'betaalmethode' = 'cadeaubon' THEN left(private.cadeaubon_code(v_r->>'cadeaubon_code'), 40) END,
            CASE WHEN v_rsoort = 'betaling' AND v_r->>'betaalmethode' = 'cadeaubon' THEN private.tb_uuid(v_r->>'reservering_id') END);
    END LOOP;

    IF v_status = 'afgerond' THEN
        -- 3. De producten van de bon, in id-volgorde (zoals winkel_controleer_capaciteit).
        PERFORM 1 FROM public.winkel_producten p
         WHERE p.organization_id = v_org
           AND p.id IN (SELECT (o->>'product_id')::UUID
                          FROM public.toonbank_bon_regels r, jsonb_array_elements(r.onderdelen) o
                         WHERE r.bon_id = v_bon_id AND r.voorraad_status IS NULL)
         ORDER BY p.id
           FOR UPDATE;

        -- 4. Per regel en per product (een product dat twee keer in een pakket zit telt één keer, opgeteld).
        FOR v_rij IN
            SELECT r.id AS regel_id, r.regelnr, r.aantal, r.goederen_terug, x.product_id, x.h, (p.id IS NOT NULL) AS bekend, p.naam
              FROM public.toonbank_bon_regels r
              CROSS JOIN LATERAL (SELECT (o->>'product_id')::UUID AS product_id, sum((o->>'hoeveelheid')::NUMERIC) AS h
                                    FROM jsonb_array_elements(r.onderdelen) o GROUP BY 1) x
              LEFT JOIN public.winkel_producten p ON p.id = x.product_id AND p.organization_id = v_org
             WHERE r.bon_id = v_bon_id AND r.voorraad_status IS NULL
             ORDER BY r.regelnr, x.product_id
        LOOP
            v_n := abs(v_rij.aantal) * v_rij.h;
            v_nieuw := NULL;
            IF NOT v_rij.bekend THEN
                v_nieuw := 'nvt';
                v_controles := v_controles || jsonb_build_object('code', 'product_onbekend',
                    'melding', format('Regel %s: product %s bestaat niet (meer) in BBQ Architect; niets afgeboekt.', v_rij.regelnr, v_rij.product_id));
            ELSIF v_rij.aantal < 0 AND (COALESCE(v_orig.status, '') = 'geannuleerd' OR v_rij.goederen_terug IS NOT TRUE) THEN
                -- Tegenbon zonder goederen terug in het schap (false), op een geannuleerde bon
                -- (er ging niets de deur uit), of zonder goederen_terug (review M2 klein 5:
                -- nooit raden, dus geen retour en Te controleren): geen voorraad.
                v_nieuw := 'nvt';
                IF COALESCE(v_orig.status, '') <> 'geannuleerd' AND v_rij.goederen_terug IS NULL THEN
                    v_controles := v_controles || jsonb_build_object('code', 'goederen_terug_onbekend', 'melding',
                        format('Regel %s: de tegenbon zegt niet of %s terug in het schap ligt; niets teruggeboekt. Tel het product.', v_rij.regelnr, v_rij.naam));
                END IF;
            ELSE
                -- 4.1 Al geboekt? Door naar het volgende product.
                v_sleutel := format('tb:%s:%s:%s:%s', v_bon_id, v_rij.regelnr, v_rij.product_id, CASE WHEN v_rij.aantal > 0 THEN 'verkoop' ELSE 'retour' END);
                IF EXISTS (SELECT 1 FROM public.winkel_voorraad_mutaties WHERE organization_id = v_org AND idempotency_key = v_sleutel) THEN
                    v_nieuw := 'geboekt';
                ELSE
                    SELECT voorraad INTO v_voorraad FROM public.winkel_producten WHERE id = v_rij.product_id;
                    IF v_voorraad IS NULL THEN
                        -- 4.2 Niet bijgehouden: de bon mislukt er nooit door.
                        v_nieuw := 'niet_bijgehouden';
                    ELSIF EXISTS (SELECT 1 FROM public.winkel_voorraad_mutaties t
                                   WHERE t.organization_id = v_org AND t.winkel_product_id = v_rij.product_id AND t.type = 'telling'
                                     AND COALESCE(t.gebeurd_at, t.created_at) > v_tijd) THEN
                        -- Review M2 klein 3: gebeurd vóór de laatste telling van dit product (een
                        -- late sync). Die telling heeft de verkoop of het retour al meegenomen;
                        -- nog eens boeken telt dubbel. Niets boeken, wel Te controleren.
                        v_nieuw := 'voor_telling';
                        v_controles := v_controles || jsonb_build_object('code', 'bon_voor_telling', 'melding',
                            format('Regel %s: %s is na deze bon (%s) nog geteld; die telling heeft hem al meegenomen, dus niets %s. Klopt de telling?',
                                   v_rij.regelnr, v_rij.naam, to_char(v_tijd AT TIME ZONE 'Europe/Amsterdam', 'DD-MM-YYYY HH24:MI'),
                                   CASE WHEN v_rij.aantal > 0 THEN 'afgeboekt' ELSE 'teruggeboekt' END));
                    ELSIF v_rij.aantal < 0 THEN
                        -- Tegenbon (negatief aantal), goederen terug in het schap: retour.
                        v_m := public.winkel_muteer_voorraad(
                            v_org, v_rij.product_id, 'retour', v_n,
                            p_notitie => format('Tegenbon %s r%s', v_bonnummer, v_rij.regelnr),
                            p_idempotency_key => v_sleutel,
                            p_gebeurd_at => v_tijd, p_toonbank_bon_regel_id => v_rij.regel_id);
                        v_boekingen := v_boekingen || jsonb_build_object('regelnr', v_rij.regelnr, 'product_id', v_rij.product_id,
                            'type', 'retour', 'hoeveelheid', v_n, 'voorraad', v_m->'voorraad');
                        v_nieuw := 'geboekt';
                    ELSE
                        -- 4.3 en 4.4 Het tekort eerst rechtzetten.
                        v_tekort := GREATEST(0, v_n - v_voorraad);
                        IF v_tekort > 0 THEN
                            v_m := public.winkel_muteer_voorraad(
                                v_org, v_rij.product_id, 'tekort_correctie', v_tekort,
                                p_notitie => format('Bon %s r%s: verkocht %s, systeem had %s', v_bonnummer, v_rij.regelnr, trim_scale(v_n), trim_scale(v_voorraad)),
                                p_idempotency_key => format('tb:%s:%s:%s:tekort', v_bon_id, v_rij.regelnr, v_rij.product_id),
                                p_gebeurd_at => v_tijd, p_toonbank_bon_regel_id => v_rij.regel_id);
                            v_boekingen := v_boekingen || jsonb_build_object('regelnr', v_rij.regelnr, 'product_id', v_rij.product_id,
                                'type', 'tekort_correctie', 'hoeveelheid', v_tekort, 'voorraad', v_m->'voorraad');
                        END IF;
                        -- 4.5 De volledige verkoop.
                        v_m := public.winkel_muteer_voorraad(
                            v_org, v_rij.product_id, 'verkoop_kassa', -v_n,
                            p_notitie => format('Bon %s r%s', v_bonnummer, v_rij.regelnr),
                            p_idempotency_key => v_sleutel,
                            p_gebeurd_at => v_tijd, p_toonbank_bon_regel_id => v_rij.regel_id);
                        v_boekingen := v_boekingen || jsonb_build_object('regelnr', v_rij.regelnr, 'product_id', v_rij.product_id,
                            'type', 'verkoop_kassa', 'hoeveelheid', -v_n, 'voorraad', v_m->'voorraad');
                        v_nieuw := CASE WHEN v_tekort > 0 THEN 'tekort_gecorrigeerd' ELSE 'geboekt' END;
                        v_verkocht := array_append(v_verkocht, v_rij.product_id);
                    END IF;
                END IF;
            END IF;
            -- De status van de regel: de "zwaarste" van zijn producten.
            IF COALESCE((c_rang->>v_nieuw)::INTEGER, 0) > COALESCE((c_rang->>(v_rstatus->>v_rij.regel_id::TEXT))::INTEGER, 0) THEN
                v_rstatus := v_rstatus || jsonb_build_object(v_rij.regel_id::TEXT, v_nieuw);
            END IF;
        END LOOP;
    END IF;

    -- Het tekortslot weer dicht: verder in deze transactie geen tekortcorrectie.
    PERFORM set_config('app.winkel_tekort', '', true);

    UPDATE public.toonbank_bon_regels r
       SET voorraad_status = COALESCE(v_rstatus->>r.id::TEXT, 'nvt')
     WHERE r.bon_id = v_bon_id AND r.voorraad_status IS NULL;

    -- 6. order_rest: alleen de koppeling naar de order.
    v_controles := v_controles || private.toonbank_controleer_order_rest(v_org, v_bon_id);

    -- Contract 1.2: de betalingen met een cadeaubon afschrijven, in deze
    -- transactie (idempotent op bon en reservering). Nooit een weigering: wat
    -- niet klopt (onbekende code, verlopen reservering, saldo onder nul) wordt
    -- een controle, dus "Te controleren"; de bon is dan wel geboekt.
    IF v_status = 'afgerond' THEN
        v_controles := v_controles || private.toonbank_cadeaubon_boek_bon(v_org, v_j.apparaat_id, v_bon_id, v_bonnummer, v_soort, v_p->'regels', v_tijd);
    END IF;

    -- Controles op de bon zelf: geen weigering, wel "Te controleren".
    -- Review M2 K1: de totaalcontrole alleen bij een afgeronde bon. Een
    -- geannuleerde bon maakt kern (maakGeannuleerdeBon) mét de regels die er
    -- nog op stonden, zonder betaling en met totaal 0; daar telt alleen dat er
    -- niets betaald is.
    IF v_status = 'afgerond'
       AND (v_sommen.betaald <> private.tb_int(v_p->'totaal_cents')
            OR v_sommen.omzet + v_sommen.statiegeld + v_sommen.order_rest + COALESCE(private.tb_int(v_p->'afronding_cents'), 0) <> private.tb_int(v_p->'totaal_cents')) THEN
        v_controles := v_controles || jsonb_build_object('code', 'totaal', 'melding',
            format('Het totaal klopt niet: betaald %s ct, regels %s ct + afronding %s ct, totaal %s ct.',
                   v_sommen.betaald, v_sommen.omzet + v_sommen.statiegeld + v_sommen.order_rest,
                   COALESCE(private.tb_int(v_p->'afronding_cents'), 0), private.tb_int(v_p->'totaal_cents')));
    ELSIF v_status = 'geannuleerd' AND v_sommen.betaald <> 0 THEN
        v_controles := v_controles || jsonb_build_object('code', 'geannuleerd_betaald', 'melding',
            format('Geannuleerde bon met %s ct aan betalingen: is er toch afgerekend?', v_sommen.betaald));
    END IF;
    IF EXISTS (SELECT 1 FROM jsonb_array_elements(v_p->'regels') e
                WHERE e->>'soort' = 'verkoop'
                  AND (SELECT COALESCE(sum(private.tb_int(b->'incl_cents')), 0) FROM jsonb_array_elements(e->'btw') b) <> private.tb_int(e->'bedrag_cents')) THEN
        v_controles := v_controles || jsonb_build_object('code', 'btw_regel', 'melding', 'Bij een regel tellen de bedragen per btw-tarief niet op tot het regelbedrag.');
    END IF;
    IF v_status = 'afgerond' AND v_sommen.contant >= 300000 THEN
        v_controles := v_controles || jsonb_build_object('code', 'contant_limiet', 'melding',
            format('Contant %s ct op één bon: vanaf € 3.000 mag dat niet (Wwft).', v_sommen.contant));
    END IF;
    IF split_part(v_bonnummer, '-', 1) IS DISTINCT FROM v_app.code
       OR split_part(v_bonnummer, '-', 2)::NUMERIC IS DISTINCT FROM private.tb_int(v_p->'bon_volgnummer') THEN
        v_controles := v_controles || jsonb_build_object('code', 'bonnummer', 'melding',
            format('Bonnummer %s past niet bij tablet %s en bonvolgnummer %s.', v_bonnummer, v_app.code, v_p->>'bon_volgnummer'));
    END IF;
    IF v_status = 'afgerond' AND v_alcohol AND v_leeftijd IS NULL THEN
        v_controles := v_controles || jsonb_build_object('code', 'leeftijd_ontbreekt', 'melding', 'Alcohol verkocht zonder leeftijdscontrole op de bon.');
    ELSIF v_status = 'afgerond' AND v_alcohol AND v_leeftijd->>'uitkomst' = 'geweigerd' THEN
        v_controles := v_controles || jsonb_build_object('code', 'leeftijd_geweigerd', 'melding', 'Leeftijd geweigerd, maar er staat toch alcohol op de bon.');
    END IF;

    -- Review M2 klein 10: de alcoholregels (M6). Alcohol mag alleen als het in
    -- Instellingen → Toonbank aan staat, en een alcoholregel is minstens 75%
    -- van de gewone prijs (catalogusprijs × aantal); een open prijs op alcohol
    -- kan niet. Zoals controleerBon en alcoholPrijsToegestaan in kern.
    IF v_status = 'afgerond' AND v_soort = 'verkoop' AND v_alcohol THEN
        IF NOT COALESCE((SELECT i.toonbank_alcohol_toegestaan FROM public.winkel_instellingen i WHERE i.organization_id = v_org), false) THEN
            v_controles := v_controles || jsonb_build_object('code', 'alcohol_niet_toegestaan', 'melding',
                'Alcohol verkocht terwijl alcohol op de Toonbank uit staat (Instellingen → Toonbank).');
        END IF;
        FOR v_rr IN
            SELECT private.tb_int(e->'regelnr') AS regelnr, e->>'naam' AS naam, e->>'prijs_bron' AS bron,
                   private.tb_int(e->'bedrag_cents') AS bedrag, private.tb_int(e->'aantal') AS aantal, a.prijs_cents
              FROM jsonb_array_elements(v_p->'regels') e
              LEFT JOIN public.winkel_artikelen a ON a.id = private.tb_uuid(e->>'artikel_id') AND a.organization_id = v_org
             WHERE e->>'soort' = 'verkoop' AND (e->>'alcohol')::BOOLEAN AND private.tb_int(e->'aantal') > 0
             ORDER BY 1
        LOOP
            IF v_rr.bron = 'open_prijs' THEN
                v_controles := v_controles || jsonb_build_object('code', 'alcohol_prijs', 'melding',
                    format('Regel %s (%s): alcohol met een open prijs; dan is de 25%%-regel niet te controleren.', v_rr.regelnr, v_rr.naam));
            ELSIF v_rr.prijs_cents IS NOT NULL AND v_rr.bedrag * 100 < v_rr.prijs_cents::BIGINT * v_rr.aantal * 75 THEN
                v_controles := v_controles || jsonb_build_object('code', 'alcohol_prijs', 'melding',
                    format('Regel %s (%s): %s ct, minder dan 75%% van de gewone prijs (%s × %s ct): op alcohol hooguit 25%% korting.',
                           v_rr.regelnr, v_rr.naam, v_rr.bedrag, v_rr.aantal, v_rr.prijs_cents));
            END IF;
        END LOOP;
    END IF;

    -- Review M2 klein 5: een tegenbon op een geannuleerde bon, of meer terug dan verkocht.
    IF v_soort = 'tegenbon' AND v_status = 'afgerond' THEN
        IF v_orig.status = 'geannuleerd' THEN
            v_controles := v_controles || jsonb_build_object('code', 'tegenbon_op_geannuleerd', 'melding',
                format('Tegenbon op %s, een geannuleerde bon: daar is niets verkocht. Niets teruggeboekt.', v_orig.bonnummer));
        END IF;
        FOR v_rr IN
            SELECT o.regelnr, o.naam, o.aantal AS verkocht, sum(-t.aantal) AS terug
              FROM public.toonbank_bon_regels o
              JOIN public.toonbank_bon_regels t ON t.verwijst_naar_regel_id = o.id AND t.soort = 'verkoop'
              JOIN public.toonbank_bonnen tb ON tb.id = t.bon_id AND tb.status = 'afgerond'
             WHERE o.bon_id = v_orig.id AND o.soort = 'verkoop'
             GROUP BY o.regelnr, o.naam, o.aantal
            HAVING sum(-t.aantal) > o.aantal
             ORDER BY o.regelnr
        LOOP
            v_controles := v_controles || jsonb_build_object('code', 'tegenbon_te_veel', 'melding',
                format('Regel %s van %s (%s): %s verkocht, met de tegenbonnen in totaal %s terug.',
                       v_rr.regelnr, v_orig.bonnummer, v_rr.naam, trim_scale(v_rr.verkocht), trim_scale(v_rr.terug)));
        END LOOP;
        IF (SELECT COALESCE(sum(-tb.totaal_cents), 0) FROM public.toonbank_bonnen tb
             WHERE tb.verwijst_naar_bon_id = v_orig.id AND tb.status = 'afgerond') > GREATEST(v_orig.totaal_cents, 0) THEN
            v_controles := v_controles || jsonb_build_object('code', 'tegenbon_te_veel', 'melding',
                format('Op %s is met de tegenbonnen meer terugbetaald dan de bon was (%s ct).', v_orig.bonnummer, v_orig.totaal_cents));
        END IF;
    END IF;

    -- Review M2 klein 4 (contract §4.2 stap 9): bracht deze bon vrij onder nul,
    -- dan komt een betaalde webshoporder tekort (nieuwste order eerst). Niet als
    -- er al een melding vrij_overschreden voor deze bon en dit product is: die
    -- meldt het zelf.
    FOREACH v_pid IN ARRAY ARRAY(SELECT DISTINCT x FROM unnest(v_verkocht) x ORDER BY 1) LOOP
        CONTINUE WHEN EXISTS (SELECT 1 FROM public.toonbank_journaal jv
                               WHERE jv.organization_id = v_org AND jv.soort = 'vrij_overschreden'
                                 AND jv.payload->>'bon_id' = v_bon_id::TEXT AND jv.payload->>'product_id' = v_pid::TEXT);
        v_tekorten := private.toonbank_orders_tekort(v_org, v_pid);
        IF jsonb_array_length(v_tekorten) > 0 THEN
            v_orders := v_orders || (SELECT jsonb_agg(e || jsonb_build_object('product_id', v_pid)) FROM jsonb_array_elements(v_tekorten) e);
        END IF;
    END LOOP;
    IF jsonb_array_length(v_orders) > 0 THEN
        v_controles := v_controles || jsonb_build_object('code', 'order_komt_tekort', 'melding',
            (SELECT 'Na deze bon is er minder dan gereserveerd. Order komt tekort: '
                    || string_agg(format('%s komt %s tekort', o->>'nummer', o->>'tekort'), ', ') FROM jsonb_array_elements(v_orders) o) || '.');
    END IF;

    -- 7. De journaalregel: verwerkt, of conflict als er iets te controleren is.
    v_uitkomst := CASE WHEN jsonb_array_length(v_controles) = 0 THEN 'verwerkt' ELSE 'conflict' END;
    UPDATE public.toonbank_journaal
       SET verwerk_status = v_uitkomst,
           pogingen = pogingen + 1,
           fout_code = CASE WHEN v_uitkomst = 'conflict' THEN v_controles->0->>'code' END,
           fout_melding = CASE WHEN v_uitkomst = 'conflict' THEN left((SELECT string_agg(c->>'melding', ' ') FROM jsonb_array_elements(v_controles) c), 1000) END,
           verwerkt_at = now(),
           resultaat = jsonb_build_object('bon_id', v_bon_id, 'bonnummer', v_bonnummer, 'boekingen', v_boekingen, 'controles', v_controles,
                                          'orders_tekort', v_orders)
     WHERE id = p_journaal_id;

    RETURN jsonb_build_object('uitkomst', v_uitkomst, 'bon_id', v_bon_id, 'bonnummer', v_bonnummer,
                              'boekingen', v_boekingen, 'controles', v_controles, 'orders_tekort', v_orders);
END $$;
COMMENT ON FUNCTION public.toonbank_boek_bon(BIGINT) IS
    'BA-9: één journaalregel (bon of tegenbon) → toonbank_bonnen, toonbank_bon_regels en de voorraad, in de volgorde van contract §4.2 (producten in id-volgorde, sleutels tb:{bon}:{regelnr}:{product}:verkoop|tekort|retour, tekort_correctie vóór verkoop_kassa, NULL-voorraad = niet_bijgehouden, vóór de laatste telling = voor_telling zonder boeking). Nooit een weigering: wat niet klopt wordt conflict (ook alcoholregels, tegenbon te veel of op een geannuleerde bon, goederen_terug onbekend, en een webshoporder die tekortkomt). Alleen service_role.';
REVOKE ALL ON FUNCTION public.toonbank_boek_bon(BIGINT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.toonbank_boek_bon(BIGINT) TO service_role;

COMMENT ON FUNCTION public.toonbank_boek_bon(BIGINT) IS
    'BA-9 + contract 1.2: één journaalregel (bon of tegenbon) → toonbank_bonnen, toonbank_bon_regels en de voorraad, in de volgorde van contract §4.2 (producten in id-volgorde, sleutels tb:{bon}:{regelnr}:{product}:verkoop|tekort|retour, tekort_correctie vóór verkoop_kassa, NULL-voorraad = niet_bijgehouden, vóór de laatste telling = voor_telling zonder boeking), en de betalingen met een cadeaubon afgeschreven (tb:{bon}:{reservering}). Nooit een weigering: wat niet klopt wordt conflict (ook alcoholregels, tegenbon te veel of op een geannuleerde bon, goederen_terug onbekend, een webshoporder die tekortkomt, en alles rond de cadeaubon). Alleen service_role.';


-- ── 15. Nakijken ────────────────────────────────────────────────────────────
DO $$
DECLARE
    v_t TEXT;
BEGIN
    FOREACH v_t IN ARRAY ARRAY['public.cadeaubonnen', 'public.cadeaubon_reserveringen', 'public.cadeaubon_mutaties'] LOOP
        IF NOT (SELECT c.relrowsecurity FROM pg_class c WHERE c.oid = v_t::REGCLASS) THEN
            RAISE EXCEPTION 'toonbank_cadeaubonnen: RLS staat uit op %', v_t;
        END IF;
        IF has_table_privilege('anon', v_t, 'SELECT') OR has_table_privilege('authenticated', v_t, 'INSERT')
           OR has_table_privilege('authenticated', v_t, 'UPDATE') OR has_table_privilege('authenticated', v_t, 'DELETE') THEN
            RAISE EXCEPTION 'toonbank_cadeaubonnen: te veel rechten op %', v_t;
        END IF;
    END LOOP;
    IF pg_get_functiondef('public.toonbank_boek_bon(bigint)'::REGPROCEDURE) NOT LIKE '%toonbank_cadeaubon_boek_bon%' THEN
        RAISE EXCEPTION 'toonbank_cadeaubonnen: toonbank_boek_bon schrijft de cadeaubon niet af';
    END IF;
    IF has_function_privilege('authenticated', 'public.toonbank_cadeaubon_reserveren(uuid, uuid, text, uuid, uuid, integer, uuid)', 'EXECUTE')
       OR has_function_privilege('anon', 'public.cadeaubon_uitgeven(uuid, text, integer, date, text, uuid)', 'EXECUTE') THEN
        RAISE EXCEPTION 'toonbank_cadeaubonnen: de rechten op de functies kloppen niet';
    END IF;
END $$;


-- ── 16. PostgREST kent de nieuwe handtekeningen ─────────────────────────────
NOTIFY pgrst, 'reload schema';
