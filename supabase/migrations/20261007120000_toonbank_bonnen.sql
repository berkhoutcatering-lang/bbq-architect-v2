-- ════════════════════════════════════════════════════════════════════════════
--  BA-9 — Toonbank: bonnen, het journaal verwerken en de voorraad afboeken
--  Plan v5 §M2 (BA-9) · Contract toonbank/v1 §1.2, §1.3, §1.4, §2, §4.1, §4.2
--  Tests: supabase/tests/toonbank_journaal.sql en toonbank_boek_bon.sql
--         (alleen op de dev-database)
-- ════════════════════════════════════════════════════════════════════════════
--
--  Eerst opslaan, dan verwerken (contract §1.2)
--    toonbank_journaal_opslaan(p_org, p_apparaat, p_meldingen)
--        POST bonnen: elke melding met een geldige envelop komt ongewijzigd
--        in toonbank_journaal (INSERT … ON CONFLICT DO NOTHING). Antwoord per
--        melding 'nieuw' of 'bestond'. Een gat in de volgnummers wordt
--        gemarkeerd (gat_voor), nooit geweigerd. Alleen een kapotte envelop
--        (geen uuid, geen volgnummer) is 22023: de API antwoordt dan 400.
--    toonbank_verwerk_wachtrij(p_org, p_apparaat)
--        Elke melding op 'wacht' van deze tablet, op volgnummer, in een eigen
--        deeltransactie (BEGIN … EXCEPTION … END). Een fout zet alleen die
--        melding op 'fout' en de wachtrij gaat door: één rare bon blokkeert
--        nooit de rest. Eén verwerker tegelijk per tablet (advisory lock).
--        Review M2 B1: eerst alle producten van alle wachtende bonnen in één
--        statement vergrendelen (id-volgorde), zodat twee tablets elkaar
--        niet vastzetten; een tijdelijke fout (40P01, 40001, 55P03) laat de
--        melding op 'wacht' (pogingen + 1) in plaats van 'fout'.
--    toonbank_boek_bon(p_journaal_id)
--        Eén bon of tegenbon, precies in de volgorde van contract §4.2:
--          1. het tekortslot aan (app.winkel_tekort);
--          2. toonbank_bonnen en toonbank_bon_regels schrijven (bestaat de
--             bon al: 'bestond', niets opnieuw);
--          3. de producten van de bon vergrendelen, in id-volgorde;
--          4. per regel en product (de onderdelen als momentopname in de
--             regel, jsonb):
--               sleutel tb:{bon}:{regelnr}:{product}:verkoop bestaat al → door;
--               voorraad NULL → regel 'niet_bijgehouden';
--               tekort = max(0, n − voorraad) > 0 → tekort_correctie +tekort
--                 (sleutel …:tekort, notitie "Bon T1-000123 r2: verkocht 3,
--                 systeem had 1");
--               verkoop_kassa −n (de volledige hoeveelheid, sleutel …:verkoop,
--                 gebeurd_at = tijd van de bon).
--             Een tegenbon (negatief aantal) boekt retour +n (sleutel
--             tb:{tegenbon}:{regelnr}:{product}:retour), behalve als
--             goederen_terug false is;
--          6. order_rest: geen voorraad en geen omzet, alleen de koppeling
--             naar de order controleren;
--          7. de journaalregel op 'verwerkt', of 'conflict' als een controle
--             iets vond (de bon is dan wél geboekt: "Te controleren").
--        Een bon wordt nooit geweigerd: de verkoop is al gebeurd.
--
--  Wat erbij komt
--    - toonbank_bonnen, toonbank_bon_regels (contract §1.3, §1.4). Na het
--      verwerken nooit meer te wijzigen of te verwijderen (trigger); alleen
--      dagstaat_id (BA-10) en de voorraadstatus van een regel (stap 4)
--      worden nog gezet. Correcties gaan via een tegenbon.
--    - winkel_voorraad_mutaties: type tekort_correctie (> 0), en de kolommen
--      gebeurd_at (tijd op de tablet) en toonbank_bon_regel_id.
--    - winkel_muteer_voorraad opnieuw aangemaakt: alle bestaande parameters
--      blijven (ook de benoemde aanroep in winkel_zet_klaargezet werkt), plus
--      p_gebeurd_at en p_toonbank_bon_regel_id met standaardwaarde. De
--      org-check is nu private.vereis_org. tekort_correctie mag alleen met
--      set_config('app.winkel_tekort', 'aan'), zoals overboeken.
--    - voorraad_logboek en voorraad_afwijkingen_maand rekenen met
--      COALESCE(gebeurd_at, created_at): een late sync valt in de juiste
--      maand. voorraad_logboek.created_at is dat moment; de kolommen
--      geboekt_at (de echte created_at) en gebeurd_at staan erachter.
--    - toonbank_journaal_markeer (de API: een melding die streng niet aan het
--      contract voldoet → 'fout') en toonbank_journaal_afhandelen (BA:
--      "Opnieuw verwerken" of "Afgehandeld" in Te controleren).
--
--  Lockvolgorde (20261005120100): een bon raakt geen order; hij vergrendelt
--  de producten in id-volgorde, schrijft het logboek, en zet pas aan het
--  eind zijn journaalregel bij. In de wachtrij zijn de producten van de hele
--  batch al vooraf vergrendeld, in één statement (review M2 B1). De voorraadteller gaat bij het committen
--  (deferred trigger, BA-5). Het journaal wordt nooit vooraf vergrendeld:
--  dubbel verwerken wordt tegengehouden door de primaire sleutel van de bon
--  en de unieke voorraadsleutels.
--
--  Rechten: niets voor PUBLIC en anon. De verwerkfuncties alleen voor
--  service_role (de Toonbank-API); toonbank_journaal_afhandelen ook voor
--  authenticated (alleen een Admin). authenticated leest bonnen en regels
--  van de eigen organisatie (RLS).


-- ── 0. Pre-flight ───────────────────────────────────────────────────────────
DO $$
DECLARE
    v_sig       TEXT;
    v_def       TEXT;
    v_ontbreekt TEXT := '';
BEGIN
    FOREACH v_sig IN ARRAY ARRAY[
        'private.vereis_org(uuid)',
        'private.user_org_ids()',
        'public.winkel_muteer_voorraad(uuid, uuid, text, numeric, text, text, bigint, bigint, date, integer, uuid, text, integer, bigint, uuid)',
        'public.winkel_vrij_producten(uuid)',
        'public.winkel_reserveringen(uuid, uuid)',
        'public.winkel_zet_klaargezet(uuid, bigint, boolean)'
    ] LOOP
        IF to_regprocedure(v_sig) IS NULL THEN
            v_ontbreekt := v_ontbreekt || E'\n  functie ' || v_sig;
        END IF;
    END LOOP;
    FOREACH v_sig IN ARRAY ARRAY['public.toonbank_journaal', 'public.toonbank_apparaten', 'public.toonbank_sessies',
                                 'public.winkel_voorraad_mutaties', 'public.winkel_producten', 'public.winkel_artikelen',
                                 'public.winkel_orders', 'public.personeel', 'public.organization_members',
                                 'public.voorraad_logboek', 'public.voorraad_afwijkingen_maand', 'public.voorraad_melding_staat'] LOOP
        IF to_regclass(v_sig) IS NULL THEN
            v_ontbreekt := v_ontbreekt || E'\n  tabel/view ' || v_sig;
        END IF;
    END LOOP;
    IF v_ontbreekt <> '' THEN
        RAISE EXCEPTION 'toonbank_bonnen: dit ontbreekt (eerst BA-S, BA-2, BA-5 en BA-7a):%', v_ontbreekt;
    END IF;

    -- winkel_muteer_voorraad wordt vervangen: alleen de versie uit de repo
    -- (20260928120000), en maar één versie.
    v_def := pg_get_functiondef('public.winkel_muteer_voorraad(uuid, uuid, text, numeric, text, text, bigint, bigint, date, integer, uuid, text, integer, bigint, uuid)'::REGPROCEDURE);
    IF v_def NOT LIKE '%app.winkel_overboeking%' OR v_def NOT LIKE '%WV002%' OR v_def NOT LIKE '%laatste_beweging_at%'
       OR v_def NOT LIKE '%p_door_user_id%' THEN
        RAISE EXCEPTION 'toonbank_bonnen: winkel_muteer_voorraad is niet de versie uit 20260928120000; eerst vergelijken';
    END IF;
    IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public' AND p.proname = 'winkel_muteer_voorraad') <> 1 THEN
        RAISE EXCEPTION 'toonbank_bonnen: er is meer dan één winkel_muteer_voorraad; eerst opruimen';
    END IF;

    -- De type-check van het logboek zoals hij in 20260928120000 staat.
    IF NOT EXISTS (SELECT 1 FROM pg_constraint
                    WHERE conrelid = 'public.winkel_voorraad_mutaties'::REGCLASS AND contype = 'c'
                      AND conname <> 'winkel_mutatie_reden_check'
                      AND pg_get_constraintdef(oid) LIKE '%verkoop_kassa%') THEN
        RAISE EXCEPTION 'toonbank_bonnen: de type-check op winkel_voorraad_mutaties ontbreekt';
    END IF;

    -- Bestaan de tabellen al, dan met een andere vorm: stoppen.
    IF to_regclass('public.toonbank_bonnen') IS NOT NULL OR to_regclass('public.toonbank_bon_regels') IS NOT NULL THEN
        RAISE EXCEPTION 'toonbank_bonnen: toonbank_bonnen of toonbank_bon_regels bestaat al; eerst nakijken';
    END IF;
END $$;


-- ── 1. Kleine hulpfuncties (alleen intern) ──────────────────────────────────
-- Een tekst als uuid, of NULL.
CREATE OR REPLACE FUNCTION private.tb_uuid(p TEXT)
RETURNS UUID
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
    SELECT CASE WHEN p ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN p::UUID END;
$$;

-- Een jsonb-getal zonder decimalen als bigint, of NULL.
CREATE OR REPLACE FUNCTION private.tb_int(p JSONB)
RETURNS BIGINT
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
    SELECT CASE WHEN jsonb_typeof(p) = 'number' AND (p #>> '{}') ~ '^-?[0-9]{1,15}$' THEN (p #>> '{}')::BIGINT END;
$$;

-- Een jsonb-getal als numeric, of NULL.
CREATE OR REPLACE FUNCTION private.tb_getal(p JSONB)
RETURNS NUMERIC
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
    SELECT CASE WHEN jsonb_typeof(p) = 'number' THEN (p #>> '{}')::NUMERIC END;
$$;

-- Een tekst als tijd, of NULL.
CREATE OR REPLACE FUNCTION private.tb_tijd(p TEXT)
RETURNS TIMESTAMPTZ
LANGUAGE plpgsql
STABLE
SET search_path = public, pg_temp
AS $$
BEGIN
    IF p IS NULL OR p !~ '^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}' THEN
        RETURN NULL;
    END IF;
    RETURN p::TIMESTAMPTZ;
EXCEPTION WHEN OTHERS THEN
    RETURN NULL;
END $$;

-- De btw in een bedrag inclusief btw, in hele centen (contract §1.3, "De
-- btw-regel"; btwUitIncl in packages/kern): round(incl × pct / (100 + pct)),
-- en voor een negatief bedrag (tegenbon) precies het tegengestelde.
CREATE OR REPLACE FUNCTION private.toonbank_btw_uit_incl(p_incl BIGINT, p_pct INTEGER)
RETURNS BIGINT
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
    SELECT CASE WHEN p_incl IS NULL OR p_pct IS NULL THEN NULL
                WHEN p_pct <= 0 THEN 0
                ELSE sign(p_incl)::BIGINT * round(abs(p_incl)::NUMERIC * p_pct / (100 + p_pct))::BIGINT END;
$$;

REVOKE ALL ON FUNCTION private.tb_uuid(TEXT) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.tb_int(JSONB) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.tb_getal(JSONB) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.tb_tijd(TEXT) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.toonbank_btw_uit_incl(BIGINT, INTEGER) FROM PUBLIC, anon, authenticated, service_role;

-- De bedrijfsdag van een bon (review M2 K3). Een evenement van 18:00 tot
-- 01:00 is één bedrijfsdag: de dag van de laatste dag_openen van deze tablet
-- vóór de bon. Zonder dag_openen (of een van meer dan 36 uur terug) de
-- kalenderdag in Europe/Amsterdam. p_tablet_tijd is de tijd op de tablet
-- (dezelfde klok als dag_openen); p_tijd is die tijd begrensd op het moment
-- van ontvangen (review M2 punt 8: een klok die voorloopt zet een bon nooit
-- in de toekomst). BA-10 vervangt deze functie: een dag die vóór de bon al
-- is afgesloten (dagstaat), telt dan ook niet meer.
CREATE OR REPLACE FUNCTION private.toonbank_bedrijfsdag(p_apparaat UUID, p_tablet_tijd TIMESTAMPTZ, p_tijd TIMESTAMPTZ)
RETURNS DATE
LANGUAGE plpgsql
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
    v_dag   DATE;
    v_open  TIMESTAMPTZ;
BEGIN
    SELECT CASE WHEN private.tb_tijd((j.payload->>'bedrijfsdag') || 'T12:00:00Z') IS NOT NULL THEN (j.payload->>'bedrijfsdag')::DATE END,
           j.apparaat_tijd
      INTO v_dag, v_open
      FROM public.toonbank_journaal j
     WHERE j.apparaat_id = p_apparaat AND j.soort = 'dag_openen' AND j.verwerk_status <> 'fout'
       AND j.apparaat_tijd IS NOT NULL AND j.apparaat_tijd <= p_tablet_tijd
       AND j.payload->>'bedrijfsdag' ~ '^\d{4}-\d{2}-\d{2}$'
     ORDER BY j.apparaat_tijd DESC, j.volgnummer DESC NULLS LAST
     LIMIT 1;
    IF v_dag IS NULL OR p_tablet_tijd - v_open > INTERVAL '36 hours' THEN
        RETURN (p_tijd AT TIME ZONE 'Europe/Amsterdam')::DATE;
    END IF;
    RETURN v_dag;
END $$;
REVOKE ALL ON FUNCTION private.toonbank_bedrijfsdag(UUID, TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated, service_role;


-- ── 2. toonbank_bonnen ──────────────────────────────────────────────────────
CREATE TABLE public.toonbank_bonnen (
    -- Het bon-ID van de tablet (= gebeurtenis_id in het journaal).
    id                       UUID        PRIMARY KEY,
    organization_id          UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
    apparaat_id              UUID        NOT NULL REFERENCES public.toonbank_apparaten(id) ON DELETE RESTRICT,
    journaal_id              BIGINT      NOT NULL UNIQUE REFERENCES public.toonbank_journaal(id) ON DELETE RESTRICT,
    bonnummer                TEXT        NOT NULL CHECK (bonnummer ~ '^T[0-9]+-[0-9]{6,}$'),
    bon_volgnummer           BIGINT      NOT NULL CHECK (bon_volgnummer > 0),
    soort                    TEXT        NOT NULL CHECK (soort IN ('verkoop', 'tegenbon')),
    status                   TEXT        NOT NULL CHECK (status IN ('afgerond', 'geannuleerd')),
    verwijst_naar_bon_id     UUID        REFERENCES public.toonbank_bonnen(id) ON DELETE RESTRICT,
    reden                    TEXT,
    kanaal                   TEXT        NOT NULL CHECK (kanaal IN ('winkel', 'event')),
    event_label              TEXT,
    -- personeel.id; geen foreign key: een bon blijft 7 jaar staan, ook als de
    -- persoon weg is. De naam is een momentopname.
    medewerker_id            UUID,
    medewerker_naam          TEXT,
    leeftijd_vastgesteld     BOOLEAN,
    leeftijd_vastgesteld_at  TIMESTAMPTZ,
    leeftijd_geweigerd       BOOLEAN     NOT NULL DEFAULT false,
    catalogus_versie         BIGINT,
    voorraad_versie          BIGINT,
    totaal_cents             INTEGER     NOT NULL,
    afronding_cents          INTEGER     NOT NULL DEFAULT 0 CHECK (afronding_cents BETWEEN -2 AND 2),
    omzet_incl_cents         INTEGER     NOT NULL DEFAULT 0,
    btw                      JSONB       NOT NULL DEFAULT '{}'::JSONB,
    statiegeld_cents         INTEGER     NOT NULL DEFAULT 0,
    order_rest_cents         INTEGER     NOT NULL DEFAULT 0,
    korting_cents            INTEGER     NOT NULL DEFAULT 0,
    pin_cents                INTEGER     NOT NULL DEFAULT 0,
    contant_cents            INTEGER     NOT NULL DEFAULT 0,
    prijs_afwijking          BOOLEAN     NOT NULL DEFAULT false,
    -- De tijd op de tablet, begrensd op ontvangen_at (review M2 punt 8).
    gebeurd_at               TIMESTAMPTZ NOT NULL,
    -- De bedrijfsdag van de laatste dag_openen van deze tablet vóór de bon,
    -- anders de kalenderdag in Europe/Amsterdam (review M2 K3;
    -- private.toonbank_bedrijfsdag). Welke dagstaat: toonbank_dagstaat_herberekenen.
    bedrijfsdag              DATE        NOT NULL,
    ontvangen_at             TIMESTAMPTZ NOT NULL,
    verwerkt_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- In welke dagstaat de bon valt (BA-10). De enige kolom die nog verandert.
    dagstaat_id              UUID,
    CONSTRAINT toonbank_bonnen_bonnummer_uniek UNIQUE (organization_id, bonnummer),
    CONSTRAINT toonbank_bonnen_tegenbon CHECK ((soort = 'tegenbon') = (verwijst_naar_bon_id IS NOT NULL))
);
COMMENT ON TABLE public.toonbank_bonnen IS
    'Bonnen en tegenbonnen van de Toonbank (contract toonbank/v1 §1.3), gemaakt door toonbank_boek_bon uit het journaal. Nooit wijzigen of verwijderen (trigger); correcties via een tegenbon. 7 jaar bewaren.';
COMMENT ON COLUMN public.toonbank_bonnen.btw IS
    'De bon-btw per tarief: {"21": {"incl_cents": …, "btw_cents": …}}. Per tarief de incl_cents van de verkoopregels opgeteld en één keer afgerond (btwUitIncl). De dagstaat telt deze op zonder opnieuw af te ronden.';
COMMENT ON COLUMN public.toonbank_bonnen.omzet_incl_cents IS 'Alleen de verkoopregels (inclusief btw). Statiegeld en order_rest zijn geen omzet.';
COMMENT ON COLUMN public.toonbank_bonnen.order_rest_cents IS 'Ontvangst op webshoporders (order_rest-regels); de omzet hoort bij de order, dus niet hier.';

CREATE INDEX toonbank_bonnen_dag_idx ON public.toonbank_bonnen (organization_id, bedrijfsdag, apparaat_id);
CREATE INDEX toonbank_bonnen_apparaat_idx ON public.toonbank_bonnen (apparaat_id, bon_volgnummer);
CREATE INDEX toonbank_bonnen_verwijst_idx ON public.toonbank_bonnen (verwijst_naar_bon_id) WHERE verwijst_naar_bon_id IS NOT NULL;


-- ── 3. toonbank_bon_regels ──────────────────────────────────────────────────
CREATE TABLE public.toonbank_bon_regels (
    id                       BIGINT      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    organization_id          UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
    bon_id                   UUID        NOT NULL REFERENCES public.toonbank_bonnen(id) ON DELETE RESTRICT,
    regelnr                  INTEGER     NOT NULL CHECK (regelnr > 0),
    soort                    TEXT        NOT NULL CHECK (soort IN ('verkoop', 'statiegeld', 'order_rest', 'betaling')),
    -- winkel_artikelen.id; geen foreign key (momentopname, zie naam).
    artikel_id               UUID,
    open_prijs_groep         TEXT,
    naam                     TEXT,
    aantal                   NUMERIC,
    stuk_cents               INTEGER,
    korting_cents            INTEGER,
    bedrag_cents             INTEGER     NOT NULL,
    -- Per tarief [{pct, incl_cents, btw_cents}]; btw_cents alleen ter informatie.
    btw                      JSONB,
    alcohol                  BOOLEAN,
    hoort_bij_regelnr        INTEGER,
    product_id               UUID,
    -- Momentopname van wat er voorraadtechnisch in één stuk zit:
    -- [{product_id, hoeveelheid, eenheid}] (contract §1.4, open punt 4: jsonb).
    onderdelen               JSONB,
    scan_code                TEXT,
    prijs_bron               TEXT        CHECK (prijs_bron IS NULL OR prijs_bron IN ('catalogus', 'open_prijs')),
    voorraad_eenheid_id      UUID,
    order_id                 BIGINT,
    betaalmethode            TEXT        CHECK (betaalmethode IS NULL OR betaalmethode IN ('pin', 'contant')),
    betaal_bevestiging       TEXT,
    contant_ontvangen_cents  INTEGER,
    wisselgeld_cents         INTEGER,
    -- NULL alleen tijdens het boeken (stap 4); daarna altijd gezet.
    voorraad_status          TEXT        CHECK (voorraad_status IS NULL OR voorraad_status IN ('geboekt', 'niet_bijgehouden', 'tekort_gecorrigeerd', 'voor_telling', 'nvt')),
    verwijst_naar_regel_id   BIGINT      REFERENCES public.toonbank_bon_regels(id) ON DELETE RESTRICT,
    verwijst_naar_regelnr    INTEGER,
    goederen_terug           BOOLEAN,
    CONSTRAINT toonbank_bon_regels_regelnr_uniek UNIQUE (bon_id, regelnr)
);
COMMENT ON TABLE public.toonbank_bon_regels IS
    'Regels van een Toonbank-bon (contract §1.4): verkoop, statiegeld, order_rest en betaling. Nooit wijzigen of verwijderen; alleen voorraad_status wordt bij het boeken gezet.';
COMMENT ON COLUMN public.toonbank_bon_regels.voorraad_status IS
    'geboekt | niet_bijgehouden (product nog niet geteld) | tekort_gecorrigeerd (er lag minder dan verkocht) | voor_telling (gebeurd vóór de laatste telling van het product: zat al in de telling, niet nog eens geboekt; review M2 klein 3) | nvt (geen voorraad: statiegeld, order_rest, betaling, open prijs, geannuleerd, tegenbon zonder goederen terug).';

CREATE INDEX toonbank_bon_regels_org_idx ON public.toonbank_bon_regels (organization_id);
CREATE INDEX toonbank_bon_regels_order_idx ON public.toonbank_bon_regels (order_id) WHERE order_id IS NOT NULL;


-- ── 4. Na het verwerken niet meer te wijzigen ───────────────────────────────
CREATE OR REPLACE FUNCTION private.toonbank_bon_vast()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
    c_mag TEXT[] := CASE TG_TABLE_NAME WHEN 'toonbank_bonnen' THEN ARRAY['dagstaat_id'] ELSE ARRAY['voorraad_status'] END;
BEGIN
    IF TG_OP = 'DELETE' OR TG_OP = 'TRUNCATE' THEN
        RAISE EXCEPTION 'TB002: % is niet te verwijderen (7 jaar bewaren; corrigeer met een tegenbon)', TG_TABLE_NAME USING ERRCODE = 'TB002';
    END IF;
    IF (to_jsonb(OLD) - c_mag) IS DISTINCT FROM (to_jsonb(NEW) - c_mag) THEN
        RAISE EXCEPTION 'TB002: een verwerkte bon verandert niet meer (%); corrigeer met een tegenbon', TG_TABLE_NAME USING ERRCODE = 'TB002';
    END IF;
    RETURN NEW;
END $$;
COMMENT ON FUNCTION private.toonbank_bon_vast() IS
    'Trigger op toonbank_bonnen en toonbank_bon_regels: geen DELETE of TRUNCATE (TB002); bij UPDATE alleen dagstaat_id (bon) of voorraad_status (regel).';
REVOKE ALL ON FUNCTION private.toonbank_bon_vast() FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER trg_toonbank_bonnen_vast BEFORE UPDATE OR DELETE ON public.toonbank_bonnen
    FOR EACH ROW EXECUTE FUNCTION private.toonbank_bon_vast();
CREATE TRIGGER trg_toonbank_bonnen_geen_truncate BEFORE TRUNCATE ON public.toonbank_bonnen
    FOR EACH STATEMENT EXECUTE FUNCTION private.toonbank_bon_vast();
CREATE TRIGGER trg_toonbank_bon_regels_vast BEFORE UPDATE OR DELETE ON public.toonbank_bon_regels
    FOR EACH ROW EXECUTE FUNCTION private.toonbank_bon_vast();
CREATE TRIGGER trg_toonbank_bon_regels_geen_truncate BEFORE TRUNCATE ON public.toonbank_bon_regels
    FOR EACH STATEMENT EXECUTE FUNCTION private.toonbank_bon_vast();


-- ── 5. RLS en rechten op de nieuwe tabellen ─────────────────────────────────
ALTER TABLE public.toonbank_bonnen ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.toonbank_bon_regels ENABLE ROW LEVEL SECURITY;

CREATE POLICY toonbank_bonnen_select ON public.toonbank_bonnen FOR SELECT TO authenticated
    USING (organization_id IN (SELECT private.user_org_ids()));
CREATE POLICY toonbank_bon_regels_select ON public.toonbank_bon_regels FOR SELECT TO authenticated
    USING (organization_id IN (SELECT private.user_org_ids()));

-- Schrijven alleen via de functies hieronder (SECURITY DEFINER).
REVOKE ALL ON TABLE public.toonbank_bonnen FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.toonbank_bon_regels FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.toonbank_bonnen TO authenticated, service_role;
GRANT SELECT ON TABLE public.toonbank_bon_regels TO authenticated, service_role;


-- ── 6. winkel_voorraad_mutaties: tekort_correctie, gebeurd_at, bonregel ─────
ALTER TABLE public.winkel_voorraad_mutaties
    ADD COLUMN IF NOT EXISTS gebeurd_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS toonbank_bon_regel_id BIGINT REFERENCES public.toonbank_bon_regels(id) ON DELETE RESTRICT;
COMMENT ON COLUMN public.winkel_voorraad_mutaties.gebeurd_at IS
    'Wanneer het echt gebeurde (tijd op de Toonbank); leeg = created_at. De logboekviews rekenen met COALESCE(gebeurd_at, created_at).';
COMMENT ON COLUMN public.winkel_voorraad_mutaties.toonbank_bon_regel_id IS
    'De Toonbank-bonregel van een verkoop_kassa, tekort_correctie of retour (BA-9).';
CREATE INDEX IF NOT EXISTS winkel_mutaties_bonregel_idx ON public.winkel_voorraad_mutaties (toonbank_bon_regel_id) WHERE toonbank_bon_regel_id IS NOT NULL;

DO $$
DECLARE
    v_naam TEXT;
BEGIN
    FOR v_naam IN
        SELECT conname FROM pg_constraint
         WHERE conrelid = 'public.winkel_voorraad_mutaties'::REGCLASS AND contype = 'c'
           AND conname <> 'winkel_mutatie_reden_check'
           AND pg_get_constraintdef(oid) LIKE '%verkoop_kassa%'
    LOOP
        EXECUTE format('ALTER TABLE public.winkel_voorraad_mutaties DROP CONSTRAINT %I', v_naam);
    END LOOP;
END $$;
ALTER TABLE public.winkel_voorraad_mutaties ADD CONSTRAINT winkel_voorraad_mutaties_type_check
    CHECK (type IN ('telling', 'ontvangst', 'overboeking', 'verkoop_online', 'verkoop_kassa', 'retour', 'afwijking', 'tekort_correctie'));
-- Een tekortcorrectie is altijd een plus (wat er meer verkocht is dan er lag).
-- De redencheck hoeft niet te veranderen: voor dit type is de reden leeg.
ALTER TABLE public.winkel_voorraad_mutaties ADD CONSTRAINT winkel_mutatie_tekort_check
    CHECK (type <> 'tekort_correctie' OR hoeveelheid > 0);

-- ── 6b. De melding "Tel {product}" (contract §4.2 stap 8, review M2 klein 4) ─
-- Na een tekortcorrectie, tot er weer geteld is (src/lib/voorraad/meldingRegels.ts,
-- tellenMeldingen). De staat kent de soort voorraad_tellen erbij.
DO $$
DECLARE
    v_naam TEXT;
BEGIN
    FOR v_naam IN
        SELECT conname FROM pg_constraint
         WHERE conrelid = 'public.voorraad_melding_staat'::REGCLASS AND contype = 'c'
           AND pg_get_constraintdef(oid) LIKE '%voorraad_tekort_vooruit%'
    LOOP
        EXECUTE format('ALTER TABLE public.voorraad_melding_staat DROP CONSTRAINT %I', v_naam);
    END LOOP;
END $$;
ALTER TABLE public.voorraad_melding_staat ADD CONSTRAINT voorraad_melding_staat_soort_check
    CHECK (soort IN ('voorraad_laag', 'voorraad_op', 'artikel_dicht', 'voorraad_tekort_vooruit', 'voorraad_tellen'));


-- ── 7. winkel_muteer_voorraad, opnieuw ──────────────────────────────────────
-- Gelijk aan 20260928120000 §6, met:
--   - private.vereis_org(p_org) in plaats van de eigen tenant-guard;
--   - type tekort_correctie: > 0, alleen met app.winkel_tekort = 'aan'
--     (alleen toonbank_boek_bon zet dat, zoals voorraad_overboeken het
--     overboekslot zet);
--   - p_gebeurd_at (de tijd op de tablet; ook voor laatste_beweging_at) en
--     p_toonbank_bon_regel_id, allebei met standaardwaarde.
-- De handtekening verandert, dus DROP + CREATE en de rechten opnieuw.
DROP FUNCTION public.winkel_muteer_voorraad(UUID, UUID, TEXT, NUMERIC, TEXT, TEXT, BIGINT, BIGINT, DATE, INTEGER, UUID, TEXT, INTEGER, BIGINT, UUID);

CREATE FUNCTION public.winkel_muteer_voorraad(
    p_org                    UUID,
    p_product_id             UUID,
    p_type                   TEXT,
    p_hoeveelheid            NUMERIC,
    p_reden                  TEXT        DEFAULT NULL,
    p_notitie                TEXT        DEFAULT NULL,
    p_order_id               BIGINT      DEFAULT NULL,
    p_order_regel_id         BIGINT      DEFAULT NULL,
    p_tht                    DATE        DEFAULT NULL,
    p_inkoop_excl_cents      INTEGER     DEFAULT NULL,
    p_inkoop_order_id        UUID        DEFAULT NULL,
    p_idempotency_key        TEXT        DEFAULT NULL,
    p_inventory_id           INTEGER     DEFAULT NULL,
    p_stock_movement_id      BIGINT      DEFAULT NULL,
    p_door_user_id           UUID        DEFAULT NULL,
    p_gebeurd_at             TIMESTAMPTZ DEFAULT NULL,
    p_toonbank_bon_regel_id  BIGINT      DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_uid      UUID := COALESCE(auth.uid(), p_door_user_id);
    v_product  public.winkel_producten%ROWTYPE;
    v_mutatie  public.winkel_voorraad_mutaties%ROWTYPE;
    v_oud      NUMERIC;
    v_delta    NUMERIC;
    v_nieuw    NUMERIC;
    v_reden    TEXT := p_reden;
    v_inkoop   INTEGER;
    v_tht      DATE;
    v_plek     UUID;
BEGIN
    PERFORM private.vereis_org(p_org);

    IF p_type = 'overboeking' AND COALESCE(current_setting('app.winkel_overboeking', true), '') <> 'aan' THEN
        RAISE EXCEPTION 'een overboeking loopt via voorraad_overboeken' USING ERRCODE = 'WV005';
    END IF;
    IF p_type = 'tekort_correctie' AND COALESCE(current_setting('app.winkel_tekort', true), '') <> 'aan' THEN
        RAISE EXCEPTION 'een tekortcorrectie loopt via toonbank_boek_bon' USING ERRCODE = 'WV005';
    END IF;
    IF p_hoeveelheid IS NULL
       OR (p_type = 'telling'                                         AND p_hoeveelheid < 0)
       OR (p_type IN ('ontvangst', 'retour', 'tekort_correctie')      AND p_hoeveelheid <= 0)
       OR (p_type IN ('verkoop_online', 'verkoop_kassa', 'afwijking') AND p_hoeveelheid >= 0)
       OR (p_type = 'overboeking'                                     AND p_hoeveelheid = 0) THEN
        RAISE EXCEPTION 'ongeldige hoeveelheid % voor %', p_hoeveelheid, p_type USING ERRCODE = 'WV005';
    END IF;
    IF p_type = 'afwijking' AND (p_reden IS NULL OR p_reden NOT IN ('eigen_gebruik', 'proeven', 'derving_breuk', 'derving_tht', 'keuken_verbruik')) THEN
        RAISE EXCEPTION 'een afwijking heeft een reden (eigen gebruik, proeven, breuk, THT, keukenverbruik)' USING ERRCODE = 'WV005';
    END IF;
    IF p_type <> 'afwijking' AND p_reden IS NOT NULL THEN
        RAISE EXCEPTION 'alleen een afwijking heeft een reden; manko komt uit een telling' USING ERRCODE = 'WV005';
    END IF;

    -- Dubbelklik: dezelfde sleutel geeft de bestaande regel terug.
    IF p_idempotency_key IS NOT NULL THEN
        SELECT * INTO v_mutatie FROM public.winkel_voorraad_mutaties
         WHERE organization_id = p_org AND idempotency_key = p_idempotency_key;
        IF FOUND THEN
            RETURN jsonb_build_object('mutatie', to_jsonb(v_mutatie), 'voorraad', v_mutatie.resultaat, 'bestond', true);
        END IF;
    END IF;

    -- Dezelfde rij-lock als winkel_controleer_capaciteit.
    SELECT * INTO v_product FROM public.winkel_producten
     WHERE id = p_product_id AND organization_id = p_org
     FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'product % niet in deze organisatie', p_product_id USING ERRCODE = 'P0002';
    END IF;

    v_oud := v_product.voorraad;
    IF v_oud IS NULL AND p_type <> 'telling' THEN
        RAISE EXCEPTION '% wordt nog niet bijgehouden: tel het eerst', v_product.naam USING ERRCODE = 'WV002';
    END IF;

    IF p_type = 'telling' THEN
        v_delta := p_hoeveelheid - COALESCE(v_oud, 0);
        -- De eerste telling (nulmeting) is geen manko: er was nog geen getal.
        v_reden := CASE WHEN v_oud IS NULL OR v_delta = 0 THEN NULL
                        WHEN v_delta < 0 THEN 'manko'
                        ELSE 'telling_meer' END;
    ELSE
        v_delta := p_hoeveelheid;
    END IF;

    v_nieuw := COALESCE(v_oud, 0) + v_delta;
    IF v_nieuw < 0 THEN
        RAISE EXCEPTION 'onder nul: % (er is %, gevraagd %)', v_product.naam, COALESCE(v_oud, 0), -v_delta USING ERRCODE = 'WV001';
    END IF;

    -- Ontvangst werkt de inkoopprijs bij (per prijs_per, net als het product).
    v_inkoop := CASE WHEN p_type = 'ontvangst' AND p_inkoop_excl_cents IS NOT NULL THEN p_inkoop_excl_cents ELSE v_product.inkoop_excl_cents END;
    -- THT: de vroegste van wat er ligt. Was het op, dan telt alleen de nieuwe.
    v_tht := v_product.tht;
    IF p_tht IS NOT NULL AND v_delta > 0 THEN
        v_tht := CASE WHEN COALESCE(v_oud, 0) = 0 OR v_product.tht IS NULL THEN p_tht ELSE LEAST(v_product.tht, p_tht) END;
    ELSIF v_nieuw = 0 THEN
        v_tht := NULL;
    END IF;

    PERFORM set_config('app.winkel_logboek', 'aan', true);
    UPDATE public.winkel_producten
       SET voorraad = v_nieuw,
           inkoop_excl_cents = v_inkoop,
           tht = v_tht,
           inventory_id = COALESCE(inventory_id, p_inventory_id),
           -- Een late sync zet de klok niet terug.
           laatste_beweging_at = CASE
               WHEN p_type IN ('verkoop_online', 'verkoop_kassa')
                 OR (p_type = 'afwijking' AND v_reden = 'keuken_verbruik')
                 OR (p_type = 'overboeking' AND v_delta < 0)
               THEN GREATEST(COALESCE(laatste_beweging_at, '-infinity'::TIMESTAMPTZ), COALESCE(LEAST(p_gebeurd_at, now()), now()))
               ELSE laatste_beweging_at END
     WHERE id = p_product_id;
    PERFORM set_config('app.winkel_logboek', '', true);

    SELECT id INTO v_plek FROM public.voorraad_plekken WHERE organization_id = p_org AND soort = 'winkel';

    INSERT INTO public.winkel_voorraad_mutaties (
        organization_id, plek_id, winkel_product_id, type, reden, hoeveelheid, resultaat, waarde_cents, tht,
        order_id, order_regel_id, inventory_id, stock_movement_id, inkoop_order_id,
        door_user_id, notitie, idempotency_key, gebeurd_at, toonbank_bon_regel_id
    ) VALUES (
        p_org, v_plek, p_product_id, p_type, v_reden, v_delta, v_nieuw,
        CASE WHEN v_inkoop IS NULL THEN NULL ELSE round(v_delta * v_inkoop / v_product.prijs_per)::INTEGER END,
        p_tht, p_order_id, p_order_regel_id, p_inventory_id, p_stock_movement_id, p_inkoop_order_id,
        v_uid, NULLIF(btrim(COALESCE(p_notitie, '')), ''), p_idempotency_key, p_gebeurd_at, p_toonbank_bon_regel_id
    )
    RETURNING * INTO v_mutatie;

    RETURN jsonb_build_object('mutatie', to_jsonb(v_mutatie), 'voorraad', v_nieuw, 'bestond', false);
END $$;
COMMENT ON FUNCTION public.winkel_muteer_voorraad(UUID, UUID, TEXT, NUMERIC, TEXT, TEXT, BIGINT, BIGINT, DATE, INTEGER, UUID, TEXT, INTEGER, BIGINT, UUID, TIMESTAMPTZ, BIGINT) IS
    'Eén regel in het winkellogboek (W1, BA-9). tekort_correctie alleen vanuit toonbank_boek_bon (app.winkel_tekort); p_gebeurd_at = tijd op de tablet.';
REVOKE ALL ON FUNCTION public.winkel_muteer_voorraad(UUID, UUID, TEXT, NUMERIC, TEXT, TEXT, BIGINT, BIGINT, DATE, INTEGER, UUID, TEXT, INTEGER, BIGINT, UUID, TIMESTAMPTZ, BIGINT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.winkel_muteer_voorraad(UUID, UUID, TEXT, NUMERIC, TEXT, TEXT, BIGINT, BIGINT, DATE, INTEGER, UUID, TEXT, INTEGER, BIGINT, UUID, TIMESTAMPTZ, BIGINT) TO authenticated, service_role;


-- ── 8. De logboekviews: het moment waarop het gebeurde ──────────────────────
-- Zelfde kolommen in dezelfde volgorde (CREATE OR REPLACE VIEW), plus
-- geboekt_at en gebeurd_at aan het eind. created_at is voortaan het moment
-- waarop het gebeurde: COALESCE(gebeurd_at, created_at).
CREATE OR REPLACE VIEW public.voorraad_logboek
WITH (security_invoker = true) AS
SELECT
    m.organization_id,
    'winkel'::TEXT                      AS plek,
    m.winkel_product_id::TEXT           AS item_id,
    p.naam,
    p.eenheid,
    m.type,
    m.reden,
    m.hoeveelheid,
    m.resultaat,
    m.waarde_cents,
    m.order_id,
    m.door_user_id,
    m.notitie,
    COALESCE(m.gebeurd_at, m.created_at) AS created_at,
    m.created_at                         AS geboekt_at,
    m.gebeurd_at
FROM public.winkel_voorraad_mutaties m
JOIN public.winkel_producten p ON p.id = m.winkel_product_id
UNION ALL
SELECT
    s.organization_id,
    'makerij'::TEXT,
    s.inventory_id::TEXT,
    i.naam,
    i.unit,
    s.type,
    s.reden,
    s.qty,
    s.resulting_stock,
    CASE WHEN COALESCE(s.unit_price, i.last_price_eur, i.purchase_price) IS NULL THEN NULL
         ELSE round(s.qty * COALESCE(s.unit_price, i.last_price_eur, i.purchase_price) * 100)::INTEGER END,
    NULL::BIGINT,
    s.by_user_id,
    s.note,
    s.created_at,
    s.created_at,
    NULL::TIMESTAMPTZ
FROM public.stock_movements s
JOIN public.inventory i ON i.id = s.inventory_id;
COMMENT ON VIEW public.voorraad_logboek IS
    'Eén logboek voor het hele bedrijf: winkel_voorraad_mutaties (plek winkel) en stock_movements (plek makerij). created_at = COALESCE(gebeurd_at, created_at): het moment waarop het gebeurde (een Toonbank-bon op de tijd van de tablet); geboekt_at = wanneer het in het logboek kwam. Waarde in centen tegen de inkoopprijs.';

CREATE OR REPLACE VIEW public.voorraad_afwijkingen_maand
WITH (security_invoker = true) AS
SELECT
    organization_id,
    date_trunc('month', COALESCE(gebeurd_at, geboekt_at) AT TIME ZONE 'Europe/Amsterdam')::DATE AS maand,
    plek,
    reden,
    count(*)                                             AS regels,
    COALESCE(-SUM(waarde_cents), 0)::BIGINT              AS waarde_cents,
    count(*) FILTER (WHERE waarde_cents IS NULL)         AS zonder_prijs
FROM public.voorraad_logboek
WHERE (type = 'afwijking' AND reden IS NOT NULL)
   OR (type = 'telling' AND reden = 'manko')
GROUP BY 1, 2, 3, 4;
COMMENT ON VIEW public.voorraad_afwijkingen_maand IS
    'Afwijkingen en manko per maand (Europe/Amsterdam, op COALESCE(gebeurd_at, created_at)), plek en reden, in centen tegen inkoopprijs. Voor de voorraadkaart (W6) en het maandrapport (W11).';


-- ── 9. Een bon controleren (de vorm) ────────────────────────────────────────
-- Wat toonbank_boek_bon nodig heeft, streng genoeg om niets te raden. Geeft
-- de lijst met problemen; leeg = goed. (De API controleert vooraf ook met
-- zod; deze controle staat erachter, voor alles wat toch binnenkomt.)
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
                IF COALESCE(r->>'betaalmethode', '') NOT IN ('pin', 'contant') THEN f := array_append(f, format('regel %s: betaalmethode is pin of contant', v_nr)); END IF;
            ELSE
                f := array_append(f, format('regel %s: onbekende soort %s', v_nr, COALESCE(v_s, 'leeg')));
        END CASE;
    END LOOP;
    RETURN f;
END $$;
REVOKE ALL ON FUNCTION private.toonbank_bon_fouten(JSONB) FROM PUBLIC, anon, authenticated, service_role;


-- ── 10. order_rest: de koppeling naar de order ──────────────────────────────
-- Alleen lezen, geen lock op de order (de bon wijzigt hem niet). Geeft de
-- controles [{code, melding}]. BA-10 vervangt deze functie zodra de order
-- weet met welke bon de rest betaald is (winkel_orders.rest_bon_id).
CREATE OR REPLACE FUNCTION private.toonbank_controleer_order_rest(p_org UUID, p_bon_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
    v_r      RECORD;
    v_order  public.winkel_orders%ROWTYPE;
    v_uit    JSONB := '[]'::JSONB;
BEGIN
    FOR v_r IN SELECT regelnr, order_id, bedrag_cents FROM public.toonbank_bon_regels
                WHERE bon_id = p_bon_id AND soort = 'order_rest' ORDER BY regelnr LOOP
        SELECT * INTO v_order FROM public.winkel_orders WHERE id = v_r.order_id AND organization_id = p_org;
        IF NOT FOUND THEN
            v_uit := v_uit || jsonb_build_object('code', 'order_onbekend', 'melding', format('Regel %s: restbetaling op order %s, die niet bestaat.', v_r.regelnr, v_r.order_id));
        ELSIF v_order.rest_betaald_at IS NOT NULL THEN
            v_uit := v_uit || jsonb_build_object('code', 'rest_dubbel', 'melding', format('Regel %s: de rest van %s was al betaald (%s). Dubbel betaald?', v_r.regelnr, v_order.nummer, COALESCE(v_order.rest_betaalmethode, '?')));
        ELSIF v_r.bedrag_cents <> v_order.rest_cents THEN
            v_uit := v_uit || jsonb_build_object('code', 'rest_bedrag', 'melding', format('Regel %s: rest %s ct op de bon, de order %s vraagt %s ct.', v_r.regelnr, v_r.bedrag_cents, v_order.nummer, v_order.rest_cents));
        END IF;
    END LOOP;
    RETURN v_uit;
END $$;
REVOKE ALL ON FUNCTION private.toonbank_controleer_order_rest(UUID, UUID) FROM PUBLIC, anon, authenticated, service_role;


-- ── 11. toonbank_journaal_opslaan ───────────────────────────────────────────
-- p_meldingen: [{gebeurtenis_id, volgnummer, soort, moment, …}] (hooguit 50).
-- Geeft {resultaten: [{gebeurtenis_id, journaal: nieuw|bestond, journaal_id,
-- verwerking}], bevestigd_tot_volgnummer}.
--
-- Nooit weigeren om de inhoud: een rare soort, een moment dat geen tijd is,
-- of een volgnummer dat al door een andere melding gebruikt is, wordt toch
-- opgeslagen, met status 'fout' (Te controleren). Met p_contract_verouderd
-- (contract §6.6): opslaan met 'fout' en code contract_verouderd; stuurt de
-- bijgewerkte app hem opnieuw, dan gaat hij terug op 'wacht'.
CREATE OR REPLACE FUNCTION public.toonbank_journaal_opslaan(
    p_org                 UUID,
    p_apparaat            UUID,
    p_meldingen           JSONB,
    p_contract_versie     TEXT    DEFAULT NULL,
    p_contract_verouderd  BOOLEAN DEFAULT false
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_app       public.toonbank_apparaten%ROWTYPE;
    v_m         JSONB;
    v_i         INTEGER := 0;
    v_gid       UUID;
    v_nr        BIGINT;
    v_volgnr    BIGINT;
    v_soort     TEXT;
    v_tijd      TIMESTAMPTZ;
    v_oud       public.toonbank_journaal%ROWTYPE;
    v_id        BIGINT;
    v_status    TEXT;
    v_code      TEXT;
    v_melding   TEXT;
    v_gat       BOOLEAN;
    v_hoogste   BIGINT := 0;
    v_bevestigd BIGINT;
    v_res       JSONB := '[]'::JSONB;
BEGIN
    PERFORM private.vereis_org(p_org);

    IF p_meldingen IS NULL OR jsonb_typeof(p_meldingen) <> 'array' OR jsonb_array_length(p_meldingen) = 0 THEN
        RAISE EXCEPTION 'journaal: meldingen is een lijst met minstens één melding' USING ERRCODE = '22023';
    END IF;
    IF jsonb_array_length(p_meldingen) > 50 THEN
        RAISE EXCEPTION 'journaal: hooguit 50 meldingen per keer' USING ERRCODE = '22023';
    END IF;

    -- Eén verzendbak tegelijk per tablet. NO KEY UPDATE: een journaalregel
    -- die naar dit apparaat verwijst (KEY SHARE) kan er gewoon bij.
    SELECT * INTO v_app FROM public.toonbank_apparaten
     WHERE id = p_apparaat AND organization_id = p_org
       FOR NO KEY UPDATE;
    IF NOT FOUND OR v_app.ingetrokken_at IS NOT NULL THEN
        RAISE EXCEPTION 'tablet % niet gevonden of ingetrokken', p_apparaat USING ERRCODE = 'P0002';
    END IF;

    -- De envelop van de hele batch eerst: klopt die bij één melding niet, dan
    -- is er niets opgeslagen en antwoordt de API 400 (contract §1.2).
    FOR v_m IN SELECT e FROM jsonb_array_elements(p_meldingen) e LOOP
        v_i := v_i + 1;
        IF jsonb_typeof(v_m) IS DISTINCT FROM 'object'
           OR private.tb_uuid(v_m->>'gebeurtenis_id') IS NULL
           OR COALESCE(private.tb_int(v_m->'volgnummer'), 0) < 1
           OR jsonb_typeof(v_m->'soort') IS DISTINCT FROM 'string' OR btrim(v_m->>'soort') = ''
           OR jsonb_typeof(v_m->'moment') IS DISTINCT FROM 'string' OR v_m->>'moment' = '' THEN
            RAISE EXCEPTION 'melding %: de envelop klopt niet (gebeurtenis_id, volgnummer, soort, moment)', v_i
                USING ERRCODE = '22023', DETAIL = jsonb_build_object('index', v_i - 1)::TEXT;
        END IF;
    END LOOP;

    FOR v_m IN SELECT e FROM jsonb_array_elements(p_meldingen) e ORDER BY private.tb_int(e->'volgnummer') LOOP
        v_gid := private.tb_uuid(v_m->>'gebeurtenis_id');
        v_nr := private.tb_int(v_m->'volgnummer');

        SELECT * INTO v_oud FROM public.toonbank_journaal WHERE organization_id = p_org AND gebeurtenis_id = v_gid;
        IF FOUND THEN
            -- Na een update van de app mag een melding die als te oud bewaard was, alsnog verwerkt worden.
            IF v_oud.verwerk_status = 'fout' AND v_oud.fout_code = 'contract_verouderd' AND NOT p_contract_verouderd THEN
                UPDATE public.toonbank_journaal
                   SET verwerk_status = 'wacht', fout_code = NULL, fout_melding = NULL
                 WHERE id = v_oud.id
                RETURNING * INTO v_oud;
            END IF;
            v_res := v_res || jsonb_build_object('gebeurtenis_id', v_gid, 'journaal', 'bestond', 'journaal_id', v_oud.id,
                                                 'verwerking', v_oud.verwerk_status, 'soort', v_oud.soort);
            CONTINUE;
        END IF;

        v_status := 'wacht';
        v_code := NULL;
        v_melding := NULL;
        v_volgnr := v_nr;
        v_soort := lower(btrim(v_m->>'soort'));
        v_tijd := private.tb_tijd(v_m->>'moment');

        IF v_soort !~ '^[a-z][a-z_]{1,40}$' THEN
            v_status := 'fout'; v_code := 'soort_onbekend';
            v_melding := format('onbekende soort "%s"', left(v_m->>'soort', 60));
            v_soort := 'onbekend';
        END IF;
        IF v_tijd IS NULL THEN
            v_status := 'fout'; v_code := COALESCE(v_code, 'moment_ongeldig');
            v_melding := COALESCE(v_melding, format('moment "%s" is geen tijd', left(v_m->>'moment', 60)));
        END IF;
        -- Een volgnummer dat al door een andere melding gebruikt is (een gewiste
        -- tablet die opnieuw begon): toch bewaren, zonder volgnummer.
        IF EXISTS (SELECT 1 FROM public.toonbank_journaal WHERE apparaat_id = p_apparaat AND volgnummer = v_nr) THEN
            v_volgnr := NULL;
            v_status := 'fout'; v_code := 'volgnummer_dubbel';
            v_melding := format('volgnummer %s is al gebruikt door een andere melding van deze tablet', v_nr);
        END IF;
        IF p_contract_verouderd THEN
            v_status := 'fout'; v_code := 'contract_verouderd';
            v_melding := format('gemaakt met een te oude Toonbank-app (contract %s); wordt verwerkt als de bijgewerkte app hem opnieuw stuurt',
                                COALESCE(left(p_contract_versie, 20), 'onbekend'));
        END IF;
        v_gat := v_volgnr IS NOT NULL AND v_volgnr > 1
                 AND NOT EXISTS (SELECT 1 FROM public.toonbank_journaal WHERE apparaat_id = p_apparaat AND volgnummer = v_volgnr - 1);

        v_id := NULL;
        INSERT INTO public.toonbank_journaal AS j (
            organization_id, apparaat_id, gebeurtenis_id, volgnummer, soort, contract_versie, payload, apparaat_tijd,
            gat_voor, vorige_hash, hash, verwerk_status, fout_code, fout_melding)
        VALUES (
            p_org, p_apparaat, v_gid, v_volgnr, v_soort, left(p_contract_versie, 20), v_m, v_tijd,
            v_gat, left(v_m->>'vorige_hash', 200), left(v_m->>'hash', 200), v_status, v_code, v_melding)
        ON CONFLICT DO NOTHING
        RETURNING j.id INTO v_id;

        IF v_id IS NULL THEN
            -- Een gelijktijdige melding met hetzelfde id was net eerder.
            SELECT * INTO v_oud FROM public.toonbank_journaal WHERE organization_id = p_org AND gebeurtenis_id = v_gid;
            v_res := v_res || jsonb_build_object('gebeurtenis_id', v_gid, 'journaal', 'bestond', 'journaal_id', v_oud.id,
                                                 'verwerking', v_oud.verwerk_status, 'soort', v_oud.soort);
            CONTINUE;
        END IF;
        v_res := v_res || jsonb_build_object('gebeurtenis_id', v_gid, 'journaal', 'nieuw', 'journaal_id', v_id,
                                             'verwerking', v_status, 'soort', v_soort);
        v_hoogste := GREATEST(v_hoogste, v_nr);
    END LOOP;

    -- Bevestigd tot: zonder gat, vanaf waar het was.
    v_bevestigd := v_app.bevestigd_tot_volgnummer;
    LOOP
        EXIT WHEN NOT EXISTS (SELECT 1 FROM public.toonbank_journaal WHERE apparaat_id = p_apparaat AND volgnummer = v_bevestigd + 1);
        v_bevestigd := v_bevestigd + 1;
    END LOOP;

    UPDATE public.toonbank_apparaten
       SET bevestigd_tot_volgnummer = v_bevestigd,
           hoogste_volgnummer_gemeld = GREATEST(hoogste_volgnummer_gemeld, v_hoogste),
           laatst_gezien_at = now(),
           contract_versie = COALESCE(left(p_contract_versie, 20), contract_versie)
     WHERE id = p_apparaat;

    RETURN jsonb_build_object('resultaten', v_res, 'bevestigd_tot_volgnummer', v_bevestigd);
END $$;
COMMENT ON FUNCTION public.toonbank_journaal_opslaan(UUID, UUID, JSONB, TEXT, BOOLEAN) IS
    'POST bonnen/dagstaten (BA-9): meldingen ongewijzigd in het journaal (ON CONFLICT DO NOTHING), nieuw|bestond per melding, gat_voor bij een ontbrekend volgnummer, bevestigd_tot_volgnummer. Weigert nooit om de inhoud. Alleen service_role.';
REVOKE ALL ON FUNCTION public.toonbank_journaal_opslaan(UUID, UUID, JSONB, TEXT, BOOLEAN) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.toonbank_journaal_opslaan(UUID, UUID, JSONB, TEXT, BOOLEAN) TO service_role;


-- ── 12. toonbank_boek_bon ───────────────────────────────────────────────────
-- Eén journaalregel (soort bon of tegenbon) → bon, regels en voorraad,
-- volgens contract §4.2. Geeft {uitkomst: verwerkt|conflict|bestond|wacht,
-- bon_id, bonnummer, boekingen, controles}. Een fout in de vorm is 22023
-- (de wachtrij maakt er 'fout' van).
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
        COALESCE(sum(private.tb_int(e->'bedrag_cents')) FILTER (WHERE e->>'soort' = 'betaling' AND e->>'betaalmethode' = 'contant'), 0) AS contant
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
        korting_cents, pin_cents, contant_cents, prijs_afwijking, gebeurd_at, bedrijfsdag, ontvangen_at, verwerkt_at)
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
        v_sommen.omzet, v_btw, v_sommen.statiegeld, v_sommen.order_rest, v_sommen.korting, v_sommen.pin, v_sommen.contant,
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
            verwijst_naar_regel_id, verwijst_naar_regelnr, goederen_terug)
        VALUES (
            v_org, v_bon_id, private.tb_int(v_r->'regelnr'), v_rsoort,
            CASE WHEN v_rsoort = 'verkoop' THEN private.tb_uuid(v_r->>'artikel_id') END,
            left(NULLIF(btrim(COALESCE(v_r->>'open_prijs_groep', '')), ''), 120),
            left(COALESCE(v_r->>'naam',
                          CASE v_rsoort WHEN 'statiegeld' THEN 'Statiegeld'
                                        WHEN 'order_rest' THEN btrim('Restbetaling ' || COALESCE(v_r->>'nummer', ''))
                                        WHEN 'betaling' THEN CASE v_r->>'betaalmethode' WHEN 'pin' THEN 'Pin' ELSE 'Contant' END END), 200),
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
            CASE WHEN jsonb_typeof(v_r->'goederen_terug') = 'boolean' THEN (v_r->>'goederen_terug')::BOOLEAN END);
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


-- ── 12b. Wie komt tekort (contract §1.9, §4.2 stap 9) ───────────────────────
-- Is vrij voor dit product onder nul, dan valt het tekort eerst op de nieuwste
-- betaalde order (hoogste order_id), tot haar hele aantal, dan de order
-- daarvoor (tekortVerdeling in kern). Geeft [{order_id, nummer, tekort}];
-- leeg als vrij niet onder nul is. Gebruikt door toonbank_boek_bon (na een
-- gewone bon, review M2 klein 4) en vrij_overschreden.
CREATE OR REPLACE FUNCTION private.toonbank_orders_tekort(p_org UUID, p_product UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
    v_vrij    NUMERIC;
    v_rest    NUMERIC;
    v_deel    NUMERIC;
    v_res     RECORD;
    v_orders  JSONB := '[]'::JSONB;
BEGIN
    SELECT vp.vrij INTO v_vrij FROM public.winkel_vrij_producten(p_org) vp WHERE vp.product_id = p_product;
    IF v_vrij IS NULL OR v_vrij >= 0 THEN
        RETURN v_orders;
    END IF;
    v_rest := -v_vrij;
    FOR v_res IN SELECT r.order_id, r.nummer, r.aantal FROM public.winkel_reserveringen(p_org, p_product) r
                  WHERE r.aantal > 0 ORDER BY r.order_id DESC LOOP
        EXIT WHEN v_rest <= 0;
        v_deel := LEAST(v_rest, v_res.aantal);
        v_orders := v_orders || jsonb_build_object('order_id', v_res.order_id, 'nummer', v_res.nummer, 'tekort', round(v_deel, 3));
        v_rest := v_rest - v_deel;
    END LOOP;
    RETURN v_orders;
END $$;
REVOKE ALL ON FUNCTION private.toonbank_orders_tekort(UUID, UUID) FROM PUBLIC, anon, authenticated, service_role;


-- ── 13. vrij_overschreden ───────────────────────────────────────────────────
-- Online: elke goedkeuring moet bestaan, van deze tablet en deze eigenaar
-- zijn, nog niet voor een andere melding gebruikt, en horen bij het moment
-- van de verkoop (review M2 klein 9: de verkoop valt tussen het aanmaken en
-- het verlopen van de goedkeuring, met 5 minuten speling voor de klok van de
-- tablet); dan wordt hij aan deze melding gekoppeld. Offline: ter
-- goedkeuring door de eigenaar. Daarna: is vrij onder nul, welke orders
-- komen tekort (private.toonbank_orders_tekort). Alles wat aandacht vraagt
-- → conflict.
CREATE OR REPLACE FUNCTION private.toonbank_verwerk_vrij_overschreden(p_journaal_id BIGINT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_j          public.toonbank_journaal%ROWTYPE;
    v_p          JSONB;
    v_org        UUID;
    v_product    UUID;
    v_modus      TEXT;
    v_eigenaar   UUID;
    v_ids        UUID[];
    v_ok         INTEGER;
    v_buiten     INTEGER;
    v_tijd       TIMESTAMPTZ;
    v_vrij       NUMERIC;
    v_orders     JSONB := '[]'::JSONB;
    v_controles  JSONB := '[]'::JSONB;
    v_uitkomst   TEXT;
BEGIN
    SELECT * INTO v_j FROM public.toonbank_journaal WHERE id = p_journaal_id;
    v_org := v_j.organization_id;
    PERFORM private.vereis_org(v_org);
    v_p := v_j.payload;
    -- Het moment van de verkoop, begrensd op ontvangen (punt 8).
    v_tijd := LEAST(v_j.apparaat_tijd, v_j.ontvangen_at);

    v_product := private.tb_uuid(v_p->>'product_id');
    v_modus := v_p->>'modus';
    v_eigenaar := private.tb_uuid(v_p->>'eigenaar_medewerker_id');
    IF v_product IS NULL OR private.tb_uuid(v_p->>'bon_id') IS NULL OR private.tb_int(v_p->'regelnr') IS NULL
       OR COALESCE(private.tb_getal(v_p->'verkocht'), 0) <= 0 OR COALESCE(private.tb_getal(v_p->'boven_vrij'), 0) <= 0
       OR private.tb_getal(v_p->'boven_vrij') > private.tb_getal(v_p->'verkocht')
       OR COALESCE(v_modus, '') NOT IN ('online', 'offline')
       OR jsonb_typeof(v_p->'goedkeuring_ids') IS DISTINCT FROM 'array'
       OR EXISTS (SELECT 1 FROM jsonb_array_elements_text(v_p->'goedkeuring_ids') x WHERE private.tb_uuid(x) IS NULL) THEN
        RAISE EXCEPTION 'vrij_overschreden klopt niet (product_id, bon_id, regelnr, verkocht, boven_vrij ≤ verkocht, modus, goedkeuring_ids)' USING ERRCODE = '22023';
    END IF;
    v_ids := ARRAY(SELECT DISTINCT private.tb_uuid(x) FROM jsonb_array_elements_text(v_p->'goedkeuring_ids') x);

    IF v_modus = 'online' THEN
        IF v_eigenaar IS NULL OR cardinality(v_ids) = 0 THEN
            v_controles := v_controles || jsonb_build_object('code', 'goedkeuring_ontbreekt', 'melding', 'Online boven vrij verkocht zonder eigenaar of goedkeuring.');
        ELSE
            SELECT count(*) FILTER (WHERE v_tijd BETWEEN s.aangemaakt_at - INTERVAL '5 minutes' AND s.geldig_tot + INTERVAL '5 minutes'),
                   count(*) FILTER (WHERE v_tijd IS NULL OR v_tijd NOT BETWEEN s.aangemaakt_at - INTERVAL '5 minutes' AND s.geldig_tot + INTERVAL '5 minutes')
              INTO v_ok, v_buiten
              FROM public.toonbank_sessies s
              JOIN public.personeel pe ON pe.id = s.medewerker_id
             WHERE s.id = ANY (v_ids)
               AND s.organization_id = v_org AND s.apparaat_id = v_j.apparaat_id
               AND s.doel = 'vrij_overschrijden' AND s.medewerker_id = v_eigenaar AND pe.toonbank_rol = 'eigenaar'
               AND (s.gebruikt_gebeurtenis_id IS NULL OR s.gebruikt_gebeurtenis_id = v_j.gebeurtenis_id);
            IF v_ok <> cardinality(v_ids) THEN
                v_controles := v_controles || jsonb_build_object('code', 'goedkeuring_ongeldig',
                    'melding', format('%s van de %s goedkeuringen kloppen niet (onbekend, andere tablet of eigenaar, al gebruikt, of niet rond het moment van de verkoop%s).',
                                      cardinality(v_ids) - v_ok, cardinality(v_ids),
                                      CASE WHEN v_buiten > 0 THEN format(': %s buiten het tijdvenster', v_buiten) ELSE '' END));
            ELSE
                UPDATE public.toonbank_sessies SET gebruikt_gebeurtenis_id = v_j.gebeurtenis_id
                 WHERE id = ANY (v_ids) AND gebruikt_gebeurtenis_id IS NULL;
            END IF;
        END IF;
    ELSE
        v_controles := v_controles || jsonb_build_object('code', 'goedkeuring_nodig',
            'melding', format('Offline boven vrij verkocht (%s): de eigenaar keurt dit achteraf goed.', left(COALESCE(v_p->>'reden', 'geen reden'), 200)));
    END IF;

    -- Wie komt tekort: de nieuwste order eerst, tot haar hele aantal.
    SELECT vp.vrij INTO v_vrij FROM public.winkel_vrij_producten(v_org) vp WHERE vp.product_id = v_product;
    v_orders := private.toonbank_orders_tekort(v_org, v_product);
    IF jsonb_array_length(v_orders) > 0 THEN
        v_controles := v_controles || jsonb_build_object('code', 'order_komt_tekort', 'melding',
            (SELECT 'Order komt tekort: ' || string_agg(format('%s komt %s tekort', o->>'nummer', o->>'tekort'), ', ') FROM jsonb_array_elements(v_orders) o) || '.');
    END IF;

    v_uitkomst := CASE WHEN jsonb_array_length(v_controles) = 0 THEN 'verwerkt' ELSE 'conflict' END;
    UPDATE public.toonbank_journaal
       SET verwerk_status = v_uitkomst, pogingen = pogingen + 1, verwerkt_at = now(),
           fout_code = CASE WHEN v_uitkomst = 'conflict' THEN v_controles->0->>'code' END,
           fout_melding = CASE WHEN v_uitkomst = 'conflict' THEN left((SELECT string_agg(c->>'melding', ' ') FROM jsonb_array_elements(v_controles) c), 1000) END,
           resultaat = jsonb_build_object('orders_tekort', v_orders, 'controles', v_controles, 'vrij', v_vrij)
     WHERE id = p_journaal_id;
    RETURN jsonb_build_object('uitkomst', v_uitkomst, 'orders_tekort', v_orders, 'controles', v_controles);
END $$;
REVOKE ALL ON FUNCTION private.toonbank_verwerk_vrij_overschreden(BIGINT) FROM PUBLIC, anon, authenticated, service_role;


-- ── 14. Eén melding verwerken (de verdeler) ─────────────────────────────────
-- Alleen een melding op 'wacht' (of met p_opnieuw ook 'fout': "Opnieuw
-- verwerken" in BA). Kleine meldingen (pinpoging, inloggen, uitloggen,
-- dag_openen) worden gecontroleerd en 'niet_nodig': geen boeking. dagstaat
-- volgt in BA-10 (blijft hier op 'wacht'). BA-10 vervangt deze functie.
CREATE OR REPLACE FUNCTION private.toonbank_verwerk_melding(p_journaal_id BIGINT, p_opnieuw BOOLEAN DEFAULT false)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_j  public.toonbank_journaal%ROWTYPE;
    v_p  JSONB;
BEGIN
    SELECT * INTO v_j FROM public.toonbank_journaal WHERE id = p_journaal_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'journaalregel % bestaat niet', p_journaal_id USING ERRCODE = 'P0002';
    END IF;
    PERFORM private.vereis_org(v_j.organization_id);
    IF NOT (v_j.verwerk_status = 'wacht' OR (p_opnieuw AND v_j.verwerk_status = 'fout')) THEN
        RETURN jsonb_build_object('uitkomst', v_j.verwerk_status, 'overgeslagen', true);
    END IF;
    v_p := v_j.payload;

    IF v_j.soort IN ('bon', 'tegenbon') THEN
        RETURN public.toonbank_boek_bon(p_journaal_id);
    ELSIF v_j.soort = 'vrij_overschreden' THEN
        RETURN private.toonbank_verwerk_vrij_overschreden(p_journaal_id);
    ELSIF v_j.soort IN ('pinpoging', 'inloggen', 'uitloggen', 'dag_openen') THEN
        IF COALESCE(jsonb_typeof(v_p->'medewerker_id'), 'null') <> 'null' AND private.tb_uuid(v_p->>'medewerker_id') IS NULL THEN
            RAISE EXCEPTION '%: medewerker_id is geen uuid', v_j.soort USING ERRCODE = '22023';
        END IF;
        IF v_j.soort = 'pinpoging' AND (private.tb_uuid(v_p->>'bon_id') IS NULL OR private.tb_int(v_p->'bedrag_cents') IS NULL
                                        OR COALESCE(v_p->>'uitkomst', '') NOT IN ('gelukt', 'mislukt')) THEN
            RAISE EXCEPTION 'pinpoging: bon_id, bedrag_cents en uitkomst (gelukt of mislukt)' USING ERRCODE = '22023';
        END IF;
        IF v_j.soort = 'uitloggen' AND COALESCE(v_p->>'reden', '') NOT IN ('zelf', 'time_out', 'wissel') THEN
            RAISE EXCEPTION 'uitloggen: reden is zelf, time_out of wissel' USING ERRCODE = '22023';
        END IF;
        IF v_j.soort = 'dag_openen' AND (COALESCE(v_p->>'bedrijfsdag', '') !~ '^\d{4}-\d{2}-\d{2}$' OR private.tb_tijd(v_p->>'bedrijfsdag' || 'T00:00:00Z') IS NULL
                                         OR COALESCE(private.tb_int(v_p->'contant_begin_cents'), -1) < 0) THEN
            RAISE EXCEPTION 'dag_openen: bedrijfsdag (jjjj-mm-dd) en contant_begin_cents ≥ 0' USING ERRCODE = '22023';
        END IF;
        UPDATE public.toonbank_journaal
           SET verwerk_status = 'niet_nodig', pogingen = pogingen + 1, fout_code = NULL, fout_melding = NULL, verwerkt_at = now()
         WHERE id = p_journaal_id;
        RETURN jsonb_build_object('uitkomst', 'niet_nodig');
    ELSIF v_j.soort = 'dagstaat' THEN
        -- BA-10.
        RETURN jsonb_build_object('uitkomst', 'wacht');
    ELSE
        RAISE EXCEPTION 'soort "%" wordt niet via POST bonnen verwerkt', v_j.soort USING ERRCODE = '22023';
    END IF;
END $$;
REVOKE ALL ON FUNCTION private.toonbank_verwerk_melding(BIGINT, BOOLEAN) FROM PUBLIC, anon, authenticated, service_role;


-- ── 14b. De wachtrij: eerst alle producten, en tijdelijke fouten ────────────
-- Review M2 B1 (deadlock tussen tablets). De wachtrij verwerkt tot 200
-- meldingen in één transactie; de productlocks van bon 1 blijven staan
-- terwijl bon 2 lockt. De id-volgorde per bon is dan niet genoeg: tablet A
-- (P2, dan P1) en tablet B (P1, dan P2) zetten elkaar vast. Daarom vóór de
-- lus alle producten van álle wachtende bonnen en tegenbonnen van deze
-- tablet in één statement vergrendelen, in id-volgorde (zoals
-- winkel_controleer_capaciteit). Daarna vraagt de lus geen nieuwe
-- productlock meer aan; een tweede tablet wacht dan netjes tot de eerste
-- klaar is. Een onbekend product (geen rij) vergrendelt niets.
CREATE OR REPLACE FUNCTION private.toonbank_vergrendel_wachtrij(p_org UUID, p_apparaat UUID)
RETURNS VOID
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
    PERFORM 1
      FROM public.winkel_producten p
     WHERE p.organization_id = p_org
       AND p.id IN (SELECT private.tb_uuid(o->>'product_id')
                      FROM public.toonbank_journaal j
                     CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(j.payload->'regels') = 'array' THEN j.payload->'regels' ELSE '[]'::JSONB END) r
                     CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(r->'onderdelen') = 'array' THEN r->'onderdelen' ELSE '[]'::JSONB END) o
                     WHERE j.organization_id = p_org AND j.apparaat_id = p_apparaat
                       AND j.verwerk_status = 'wacht' AND j.soort IN ('bon', 'tegenbon'))
     ORDER BY p.id
       FOR UPDATE OF p;
END $$;
COMMENT ON FUNCTION private.toonbank_vergrendel_wachtrij(UUID, UUID) IS
    'Review M2 B1: vergrendelt in één statement, in id-volgorde, alle producten van alle wachtende bonnen en tegenbonnen van één tablet. Aan het begin van de wachtrij, na de advisory lock.';
REVOKE ALL ON FUNCTION private.toonbank_vergrendel_wachtrij(UUID, UUID) FROM PUBLIC, anon, authenticated, service_role;

-- Een melding die bij het verwerken een fout gaf. Een tijdelijke fout
-- (40P01 deadlock, 40001 serialisatie, 55P03 lock niet te krijgen) is geen
-- fout in de melding: die blijft op 'wacht' met een poging erbij en wordt de
-- volgende keer gewoon verwerkt. Al het andere wordt 'fout' (Te controleren).
-- Geeft de nieuwe status.
CREATE OR REPLACE FUNCTION private.toonbank_melding_mislukt(p_journaal_id BIGINT, p_state TEXT, p_melding TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
    v_tijdelijk CONSTANT BOOLEAN := COALESCE(p_state IN ('40P01', '40001', '55P03'), false);
BEGIN
    UPDATE public.toonbank_journaal
       SET verwerk_status = CASE WHEN v_tijdelijk THEN 'wacht' ELSE 'fout' END,
           pogingen = pogingen + 1,
           fout_code = CASE WHEN v_tijdelijk THEN p_state
                            WHEN p_state = '22023' THEN 'ongeldig'
                            WHEN p_state = '23505' THEN 'dubbel'
                            ELSE p_state END,
           fout_melding = left(CASE WHEN v_tijdelijk THEN format('Tijdelijk (%s), wordt opnieuw verwerkt: ', p_state) ELSE '' END
                               || COALESCE(p_melding, ''), 1000),
           verwerkt_at = CASE WHEN v_tijdelijk THEN verwerkt_at ELSE now() END
     WHERE id = p_journaal_id;
    RETURN CASE WHEN v_tijdelijk THEN 'wacht' ELSE 'fout' END;
END $$;
COMMENT ON FUNCTION private.toonbank_melding_mislukt(BIGINT, TEXT, TEXT) IS
    'Review M2 B1: een verwerkfout vastleggen. 40P01, 40001 en 55P03 blijven op wacht (pogingen + 1); al het andere wordt fout (22023 ongeldig, 23505 dubbel, anders de SQLSTATE).';
REVOKE ALL ON FUNCTION private.toonbank_melding_mislukt(BIGINT, TEXT, TEXT) FROM PUBLIC, anon, authenticated, service_role;


-- ── 15. toonbank_verwerk_wachtrij ───────────────────────────────────────────
-- Alles op 'wacht' van deze tablet, op volgnummer, hooguit 200 per keer.
-- Eerst de producten van alle wachtende bonnen in één keer vergrendelen
-- (§14b, review M2 B1). Elke melding in een eigen deeltransactie: een fout
-- zet alleen die melding op 'fout' (met de melding van de database) en de
-- rest gaat door; een tijdelijke fout laat hem op 'wacht'.
-- Geeft {verwerkt: [{journaal_id, gebeurtenis_id, soort, status, product_ids}]}.
CREATE OR REPLACE FUNCTION public.toonbank_verwerk_wachtrij(p_org UUID, p_apparaat UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_rij      RECORD;
    v_r        JSONB;
    v_state    TEXT;
    v_msg      TEXT;
    v_status   TEXT;
    v_ronde    INTEGER;
    v_wacht    BIGINT[] := '{}';
    v_gedaan   BOOLEAN := false;
    v_uit      JSONB := '{}'::JSONB;
BEGIN
    PERFORM private.vereis_org(p_org);
    PERFORM 1 FROM public.toonbank_apparaten WHERE id = p_apparaat AND organization_id = p_org;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'tablet % niet in deze organisatie', p_apparaat USING ERRCODE = 'P0002';
    END IF;

    -- Eén verwerker tegelijk per tablet (vóór elke andere lock).
    PERFORM pg_advisory_xact_lock(hashtextextended('toonbank_wachtrij:' || p_apparaat::TEXT, 0));
    -- Dan alle producten van alle wachtende bonnen, in één keer, in id-volgorde (B1).
    PERFORM private.toonbank_vergrendel_wachtrij(p_org, p_apparaat);

    -- Ronde 1: alles op wacht, op volgnummer. Ronde 2: alleen wat in ronde 1
    -- bleef wachten (een tegenbon waarvan de bon later in dezelfde batch zat),
    -- en alleen als ronde 1 iets verwerkte.
    FOR v_ronde IN 1..2 LOOP
        EXIT WHEN v_ronde = 2 AND (cardinality(v_wacht) = 0 OR NOT v_gedaan);
        FOR v_rij IN
            SELECT j.id, j.gebeurtenis_id, j.soort FROM public.toonbank_journaal j
             WHERE j.organization_id = p_org AND j.apparaat_id = p_apparaat AND j.verwerk_status = 'wacht'
               AND (v_ronde = 1 OR j.id = ANY (v_wacht))
             ORDER BY j.volgnummer NULLS LAST, j.id
             LIMIT 200
        LOOP
            BEGIN
                v_r := private.toonbank_verwerk_melding(v_rij.id);
            EXCEPTION WHEN OTHERS THEN
                GET STACKED DIAGNOSTICS v_state = RETURNED_SQLSTATE, v_msg = MESSAGE_TEXT;
                v_r := jsonb_build_object('uitkomst', private.toonbank_melding_mislukt(v_rij.id, v_state, v_msg), 'sqlstate', v_state);
            END;
            SELECT verwerk_status INTO v_status FROM public.toonbank_journaal WHERE id = v_rij.id;
            IF v_status = 'wacht' THEN
                IF v_ronde = 1 THEN v_wacht := array_append(v_wacht, v_rij.id); END IF;
            ELSE
                v_gedaan := true;
            END IF;
            v_uit := v_uit || jsonb_build_object(v_rij.id::TEXT, jsonb_build_object(
                'journaal_id', v_rij.id, 'gebeurtenis_id', v_rij.gebeurtenis_id, 'soort', v_rij.soort, 'status', v_status,
                'product_ids', COALESCE((SELECT jsonb_agg(DISTINCT b->'product_id') FROM jsonb_array_elements(COALESCE(v_r->'boekingen', '[]'::JSONB)) b), '[]'::JSONB)));
        END LOOP;
    END LOOP;

    RETURN jsonb_build_object('verwerkt', COALESCE((SELECT jsonb_agg(e.value ORDER BY e.key::BIGINT) FROM jsonb_each(v_uit) e), '[]'::JSONB));
END $$;
COMMENT ON FUNCTION public.toonbank_verwerk_wachtrij(UUID, UUID) IS
    'BA-9: verwerkt de meldingen op wacht van één tablet, op volgnummer, elk in een eigen deeltransactie (fout → fout, de rest gaat door; 40P01/40001/55P03 → blijft wacht). Vergrendelt eerst alle producten van de wachtende bonnen in id-volgorde (review M2 B1). Alleen service_role.';
REVOKE ALL ON FUNCTION public.toonbank_verwerk_wachtrij(UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.toonbank_verwerk_wachtrij(UUID, UUID) TO service_role;


-- ── 16. toonbank_journaal_markeer (de API) ──────────────────────────────────
-- Een melding die bij de strenge controle (zod, Melding) niet aan het
-- contract voldoet: van 'wacht' naar 'fout'. Nooit een andere overgang.
CREATE OR REPLACE FUNCTION public.toonbank_journaal_markeer(
    p_org          UUID,
    p_journaal_id  BIGINT,
    p_code         TEXT,
    p_melding      TEXT
) RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_status TEXT;
BEGIN
    PERFORM private.vereis_org(p_org);
    UPDATE public.toonbank_journaal
       SET verwerk_status = 'fout', pogingen = pogingen + 1,
           fout_code = left(COALESCE(NULLIF(btrim(p_code), ''), 'schema'), 40),
           fout_melding = left(p_melding, 1000), verwerkt_at = now()
     WHERE id = p_journaal_id AND organization_id = p_org AND verwerk_status = 'wacht'
    RETURNING verwerk_status INTO v_status;
    IF v_status IS NULL THEN
        SELECT verwerk_status INTO v_status FROM public.toonbank_journaal WHERE id = p_journaal_id AND organization_id = p_org;
    END IF;
    RETURN v_status;
END $$;
COMMENT ON FUNCTION public.toonbank_journaal_markeer(UUID, BIGINT, TEXT, TEXT) IS
    'BA-9: een melding op wacht die niet aan het contract voldoet → fout (Te controleren). Alleen service_role.';
REVOKE ALL ON FUNCTION public.toonbank_journaal_markeer(UUID, BIGINT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.toonbank_journaal_markeer(UUID, BIGINT, TEXT, TEXT) TO service_role;


-- ── 17. toonbank_journaal_afhandelen (BA: Te controleren) ───────────────────
-- p_actie 'opnieuw'   een melding op fout of wacht nu (opnieuw) verwerken;
--                     lukt het niet, dan weer 'fout' met de nieuwe melding,
--                     of 'wacht' bij een tijdelijke fout (40P01, 40001,
--                     55P03; review M2 B1).
-- p_actie 'opgelost'  een fout, conflict of wachtende melding met de hand
--                     afgehandeld, met een reden (verplicht).
-- Alleen een Admin van de organisatie (of service_role). Geeft
-- {journaal_id, status, uitkomst}.
CREATE OR REPLACE FUNCTION public.toonbank_journaal_afhandelen(
    p_org          UUID,
    p_journaal_id  BIGINT,
    p_actie        TEXT,
    p_reden        TEXT DEFAULT NULL,
    p_door         UUID DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_j      public.toonbank_journaal%ROWTYPE;
    v_r      JSONB;
    v_state  TEXT;
    v_msg    TEXT;
BEGIN
    PERFORM private.vereis_org(p_org);
    IF auth.uid() IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.organization_members m
         WHERE m.organization_id = p_org AND m.user_id = auth.uid() AND m.status = 'active' AND m.role = 'Admin') THEN
        RAISE EXCEPTION 'alleen een beheerder (Admin) handelt Toonbank-meldingen af' USING ERRCODE = '42501';
    END IF;
    IF p_actie IS NULL OR p_actie NOT IN ('opnieuw', 'opgelost') THEN
        RAISE EXCEPTION 'actie is opnieuw of opgelost' USING ERRCODE = '22023';
    END IF;

    SELECT * INTO v_j FROM public.toonbank_journaal WHERE id = p_journaal_id AND organization_id = p_org;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'melding % niet in deze organisatie', p_journaal_id USING ERRCODE = 'P0002';
    END IF;

    IF p_actie = 'opgelost' THEN
        IF NULLIF(btrim(COALESCE(p_reden, '')), '') IS NULL THEN
            RAISE EXCEPTION 'geef een reden waarom dit is afgehandeld' USING ERRCODE = '22023';
        END IF;
        IF v_j.verwerk_status NOT IN ('fout', 'conflict', 'wacht') THEN
            RETURN jsonb_build_object('journaal_id', v_j.id, 'status', v_j.verwerk_status, 'uitkomst', 'niets_te_doen');
        END IF;
        UPDATE public.toonbank_journaal
           SET verwerk_status = 'opgelost', opgelost_door = COALESCE(auth.uid(), p_door),
               opgelost_reden = left(btrim(p_reden), 500), opgelost_at = now()
         WHERE id = v_j.id;
        RETURN jsonb_build_object('journaal_id', v_j.id, 'status', 'opgelost', 'uitkomst', 'opgelost');
    END IF;

    -- opnieuw: alleen wat nog niet verwerkt is. Zelfde slot als de wachtrij.
    IF v_j.verwerk_status NOT IN ('fout', 'wacht') THEN
        RETURN jsonb_build_object('journaal_id', v_j.id, 'status', v_j.verwerk_status, 'uitkomst', 'niets_te_doen');
    END IF;
    IF v_j.fout_code IN ('contract_verouderd', 'volgnummer_dubbel', 'soort_onbekend', 'moment_ongeldig') THEN
        RETURN jsonb_build_object('journaal_id', v_j.id, 'status', v_j.verwerk_status, 'uitkomst', 'kan_niet',
                                  'melding', 'Deze melding kan BBQ Architect niet verwerken; handel hem met de hand af.');
    END IF;
    PERFORM pg_advisory_xact_lock(hashtextextended('toonbank_wachtrij:' || v_j.apparaat_id::TEXT, 0));
    BEGIN
        v_r := private.toonbank_verwerk_melding(v_j.id, true);
    EXCEPTION WHEN OTHERS THEN
        -- Tijdelijk (40P01, 40001, 55P03): terug op wacht, de wachtrij pakt hem op (B1).
        GET STACKED DIAGNOSTICS v_state = RETURNED_SQLSTATE, v_msg = MESSAGE_TEXT;
        v_r := jsonb_build_object('uitkomst', private.toonbank_melding_mislukt(v_j.id, v_state, v_msg), 'sqlstate', v_state);
    END;
    RETURN jsonb_build_object('journaal_id', v_j.id,
                              'status', (SELECT verwerk_status FROM public.toonbank_journaal WHERE id = v_j.id),
                              'uitkomst', v_r->>'uitkomst',
                              'product_ids', COALESCE((SELECT jsonb_agg(DISTINCT b->'product_id') FROM jsonb_array_elements(COALESCE(v_r->'boekingen', '[]'::JSONB)) b), '[]'::JSONB));
END $$;
COMMENT ON FUNCTION public.toonbank_journaal_afhandelen(UUID, BIGINT, TEXT, TEXT, UUID) IS
    'Te controleren (BA-9): een melding opnieuw verwerken, of met de hand afhandelen met een reden. Alleen een Admin (of service_role).';
REVOKE ALL ON FUNCTION public.toonbank_journaal_afhandelen(UUID, BIGINT, TEXT, TEXT, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.toonbank_journaal_afhandelen(UUID, BIGINT, TEXT, TEXT, UUID) TO authenticated, service_role;


-- ── 18. PostgREST kent de nieuwe handtekeningen ─────────────────────────────
NOTIFY pgrst, 'reload schema';


-- ── 19. Zelfcontrole ────────────────────────────────────────────────────────
DO $$
DECLARE
    v_sig    TEXT;
    v_t      TEXT;
    v_fouten TEXT := '';
BEGIN
    -- winkel_muteer_voorraad: één versie, de nieuwe, met vereis_org en de oude parameters.
    IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public' AND p.proname = 'winkel_muteer_voorraad') <> 1
       OR to_regprocedure('public.winkel_muteer_voorraad(uuid, uuid, text, numeric, text, text, bigint, bigint, date, integer, uuid, text, integer, bigint, uuid, timestamp with time zone, bigint)') IS NULL THEN
        v_fouten := v_fouten || E'\n  winkel_muteer_voorraad: niet precies de nieuwe versie';
    ELSIF pg_get_functiondef('public.winkel_muteer_voorraad(uuid, uuid, text, numeric, text, text, bigint, bigint, date, integer, uuid, text, integer, bigint, uuid, timestamp with time zone, bigint)'::REGPROCEDURE)
          NOT LIKE '%PERFORM private.vereis_org(p_org)%app.winkel_tekort%' THEN
        v_fouten := v_fouten || E'\n  winkel_muteer_voorraad zonder vereis_org of tekortslot';
    END IF;

    -- Rechten.
    FOREACH v_sig IN ARRAY ARRAY[
        'public.winkel_muteer_voorraad(uuid, uuid, text, numeric, text, text, bigint, bigint, date, integer, uuid, text, integer, bigint, uuid, timestamp with time zone, bigint)',
        'public.toonbank_journaal_afhandelen(uuid, bigint, text, text, uuid)'
    ] LOOP
        IF has_function_privilege('anon', v_sig, 'EXECUTE') THEN v_fouten := v_fouten || E'\n  anon mag ' || v_sig; END IF;
        IF NOT has_function_privilege('authenticated', v_sig, 'EXECUTE') THEN v_fouten := v_fouten || E'\n  authenticated mist ' || v_sig; END IF;
        IF NOT has_function_privilege('service_role', v_sig, 'EXECUTE') THEN v_fouten := v_fouten || E'\n  service_role mist ' || v_sig; END IF;
    END LOOP;
    FOREACH v_sig IN ARRAY ARRAY[
        'public.toonbank_journaal_opslaan(uuid, uuid, jsonb, text, boolean)',
        'public.toonbank_boek_bon(bigint)',
        'public.toonbank_verwerk_wachtrij(uuid, uuid)',
        'public.toonbank_journaal_markeer(uuid, bigint, text, text)'
    ] LOOP
        IF has_function_privilege('anon', v_sig, 'EXECUTE') OR has_function_privilege('authenticated', v_sig, 'EXECUTE') THEN
            v_fouten := v_fouten || E'\n  anon of authenticated mag ' || v_sig;
        END IF;
        IF NOT has_function_privilege('service_role', v_sig, 'EXECUTE') THEN v_fouten := v_fouten || E'\n  service_role mist ' || v_sig; END IF;
    END LOOP;
    FOREACH v_sig IN ARRAY ARRAY[
        'public.toonbank_journaal_opslaan(uuid, uuid, jsonb, text, boolean)',
        'public.toonbank_verwerk_wachtrij(uuid, uuid)',
        'public.toonbank_journaal_markeer(uuid, bigint, text, text)',
        'public.toonbank_journaal_afhandelen(uuid, bigint, text, text, uuid)'
    ] LOOP
        IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid = v_sig::REGPROCEDURE AND prosecdef AND proconfig @> ARRAY['search_path=public, pg_temp'])
           OR pg_get_functiondef(v_sig::REGPROCEDURE) NOT LIKE '%PERFORM private.vereis_org(p_org)%' THEN
            v_fouten := v_fouten || E'\n  geen SECURITY DEFINER met search_path en vereis_org: ' || v_sig;
        END IF;
    END LOOP;
    IF pg_get_functiondef('public.toonbank_boek_bon(bigint)'::REGPROCEDURE) NOT LIKE '%PERFORM private.vereis_org(v_org)%' THEN
        v_fouten := v_fouten || E'\n  toonbank_boek_bon zonder vereis_org';
    END IF;
    FOREACH v_sig IN ARRAY ARRAY[
        'private.tb_uuid(text)', 'private.tb_int(jsonb)', 'private.tb_getal(jsonb)', 'private.tb_tijd(text)',
        'private.toonbank_bedrijfsdag(uuid, timestamp with time zone, timestamp with time zone)',
        'private.toonbank_btw_uit_incl(bigint, integer)', 'private.toonbank_bon_fouten(jsonb)',
        'private.toonbank_controleer_order_rest(uuid, uuid)', 'private.toonbank_verwerk_vrij_overschreden(bigint)',
        'private.toonbank_verwerk_melding(bigint, boolean)', 'private.toonbank_bon_vast()',
        'private.toonbank_vergrendel_wachtrij(uuid, uuid)', 'private.toonbank_melding_mislukt(bigint, text, text)',
        'private.toonbank_orders_tekort(uuid, uuid)'
    ] LOOP
        IF has_function_privilege('anon', v_sig, 'EXECUTE') OR has_function_privilege('authenticated', v_sig, 'EXECUTE')
           OR has_function_privilege('service_role', v_sig, 'EXECUTE') THEN
            v_fouten := v_fouten || E'\n  een rol mag de interne functie ' || v_sig;
        END IF;
    END LOOP;

    -- B1: de wachtrij vergrendelt eerst alle producten; tijdelijke fouten blijven wacht.
    IF pg_get_functiondef('public.toonbank_verwerk_wachtrij(uuid, uuid)'::REGPROCEDURE)
           NOT LIKE '%pg_advisory_xact_lock%toonbank_vergrendel_wachtrij%toonbank_melding_mislukt%'
       OR pg_get_functiondef('public.toonbank_journaal_afhandelen(uuid, bigint, text, text, uuid)'::REGPROCEDURE) NOT LIKE '%toonbank_melding_mislukt%' THEN
        v_fouten := v_fouten || E'\n  de wachtrij vergrendelt niet eerst alle producten, of een tijdelijke fout wordt fout';
    END IF;

    -- K3 en punt 8: de bedrijfsdag uit dag_openen, de tijd begrensd op ontvangen_at.
    IF pg_get_functiondef('public.toonbank_boek_bon(bigint)'::REGPROCEDURE)
           NOT LIKE '%LEAST(v_j.apparaat_tijd, v_j.ontvangen_at)%toonbank_bedrijfsdag(v_j.apparaat_id, v_j.apparaat_tijd, v_tijd)%' THEN
        v_fouten := v_fouten || E'\n  toonbank_boek_bon zonder begrensde tijd of bedrijfsdag uit dag_openen';
    END IF;

    -- Tabellen: RLS, alleen lezen, append-only.
    FOREACH v_t IN ARRAY ARRAY['public.toonbank_bonnen', 'public.toonbank_bon_regels'] LOOP
        IF NOT (SELECT c.relrowsecurity FROM pg_class c WHERE c.oid = v_t::REGCLASS) THEN v_fouten := v_fouten || E'\n  RLS staat uit op ' || v_t; END IF;
        IF has_table_privilege('anon', v_t, 'SELECT') THEN v_fouten := v_fouten || E'\n  anon leest ' || v_t; END IF;
        IF has_table_privilege('authenticated', v_t, 'INSERT') OR has_table_privilege('authenticated', v_t, 'UPDATE') OR has_table_privilege('authenticated', v_t, 'DELETE')
           OR has_table_privilege('service_role', v_t, 'INSERT') OR has_table_privilege('service_role', v_t, 'UPDATE') OR has_table_privilege('service_role', v_t, 'DELETE') THEN
            v_fouten := v_fouten || E'\n  iemand mag schrijven in ' || v_t;
        END IF;
        IF (SELECT count(*) FROM pg_trigger WHERE tgrelid = v_t::REGCLASS AND NOT tgisinternal AND tgfoid = 'private.toonbank_bon_vast()'::REGPROCEDURE) <> 2 THEN
            v_fouten := v_fouten || E'\n  de vast-triggers op ' || v_t || ' ontbreken';
        END IF;
    END LOOP;

    -- De meldingstaat kent "Tel {product}" (review M2 klein 4).
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.voorraad_melding_staat'::REGCLASS
                     AND conname = 'voorraad_melding_staat_soort_check' AND pg_get_constraintdef(oid) LIKE '%voorraad_tellen%') THEN
        v_fouten := v_fouten || E'\n  voorraad_melding_staat kent de soort voorraad_tellen niet';
    END IF;

    -- Het logboek kent tekort_correctie; de views rekenen met gebeurd_at.
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.winkel_voorraad_mutaties'::REGCLASS
                     AND conname = 'winkel_voorraad_mutaties_type_check' AND pg_get_constraintdef(oid) LIKE '%tekort_correctie%') THEN
        v_fouten := v_fouten || E'\n  type-check zonder tekort_correctie';
    END IF;
    IF pg_get_viewdef('public.voorraad_logboek'::REGCLASS) NOT LIKE '%COALESCE(m.gebeurd_at, m.created_at)%'
       OR pg_get_viewdef('public.voorraad_afwijkingen_maand'::REGCLASS) NOT LIKE '%COALESCE(%gebeurd_at, %geboekt_at)%' THEN
        v_fouten := v_fouten || E'\n  de logboekviews rekenen niet met gebeurd_at';
    END IF;

    IF v_fouten <> '' THEN
        RAISE EXCEPTION 'toonbank_bonnen: zelfcontrole mislukt, er is niets veranderd:%', v_fouten;
    END IF;
END $$;


-- ── 20. Verificatie ─────────────────────────────────────────────────────────
--   supabase/tests/toonbank_journaal.sql en toonbank_boek_bon.sql   alleen op dev
--   supabase/checks/verify_winkel_live.sql                          objectproef, op live én dev
