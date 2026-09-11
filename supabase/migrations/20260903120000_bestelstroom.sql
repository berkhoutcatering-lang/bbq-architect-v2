-- ════════════════════════════════════════════════════════════════════════════
--  Bestelstroom De Eettocht — stap 1 van 7
--  Plan: docs/bestelstroom-bouwplan.md
-- ════════════════════════════════════════════════════════════════════════════
--
--  Een klant bestelt een gourmetbox op een publieke pagina, haalt hem op een
--  gekozen moment op, en scant thuis een QR-code die naar de Experience-app
--  wijst. Deze migratie legt de opslag aan voor de BBQ Architect-kant.
--
--  Vier tabellen:
--    doos_types        het product, maar ALLEEN wat van Hop & Bites is
--    afhaalmomenten    datum + tijd + hoeveel dozen er op dat moment passen
--    bestellingen      de bestelling zelf
--    bestel_wachtlijst één mailadres, één bericht, daarna weg
--
--  Drie regels staan hier in plaats van in de UI, omdat een uitgeschakelde knop
--  geen refactor overleeft en een constraint wel:
--    a. een bestelling met een allergienotitie kan niet naar 'bevestigd'
--       zolang niemand erop geklikt heeft
--    b. wijzigt een bestelling nadat de sticker geprint is, dan gaat er
--       automatisch een 'opnieuw printen'-vlag aan
--    c. twee mensen die tegelijk de laatste doos pakken worden achter elkaar
--       afgehandeld, niet allebei geaccepteerd
--
--  Wat hier NIET staat, met opzet:
--    • geen token-generator. Tokens komen uit de Experience-app, altijd.
--    • geen portiegetallen (8 personen per doos, 2 stuks per gerecht). Die
--      volgen uit de bakjes en horen bij het doostype, dat in de Experience-app
--      woont. Ze komen binnen via aanroep A en staan hier alleen gecachet.
--    • geen verzonnen waarden. Prijs, datums, tijden en maxima blijven leeg
--      tot Mathijs ze levert; het formulier laat weg wat het niet weet.
-- ════════════════════════════════════════════════════════════════════════════


-- ── 0. Pre-flight ───────────────────────────────────────────────────────────
-- Deze migratie leunt op drie dingen die eerdere migraties hebben aangelegd.
-- Aannemen dat ze er zijn geeft een onbegrijpelijke fout halverwege; dit geeft
-- een leesbare fout vooraf.
DO $$
BEGIN
    IF to_regclass('public.organizations') IS NULL THEN
        RAISE EXCEPTION 'bestelstroom: tabel public.organizations ontbreekt';
    END IF;
    IF to_regprocedure('private.user_org_ids()') IS NULL THEN
        RAISE EXCEPTION 'bestelstroom: functie private.user_org_ids() ontbreekt';
    END IF;
    IF to_regprocedure('public.set_updated_at()') IS NULL THEN
        RAISE EXCEPTION 'bestelstroom: functie public.set_updated_at() ontbreekt';
    END IF;
END $$;


-- ── 1. doos_types ───────────────────────────────────────────────────────────
-- De scheiding die dit hele model draagt: wat uit de VERPAKKING volgt hoort bij
-- het doostype en woont in de Experience-app. Wat uit Mathijs' agenda, koeling
-- en prijslijst volgt, woont hier.
CREATE TABLE IF NOT EXISTS public.doos_types (
    id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id       UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,

    slug                  TEXT        NOT NULL,

    -- Van hier: dit zijn zijn beslissingen, geen producteigenschappen.
    prijs_cents           INTEGER     CHECK (prijs_cents IS NULL OR prijs_cents >= 0),
    personen_min          INTEGER     CHECK (personen_min  IS NULL OR personen_min  > 0),
    personen_max          INTEGER     CHECK (personen_max  IS NULL OR personen_max  > 0),
    max_dozen_totaal      INTEGER     CHECK (max_dozen_totaal IS NULL OR max_dozen_totaal >= 0),
    actief                BOOLEAN     NOT NULL DEFAULT false,

    -- Van de andere kant: het laatste geslaagde antwoord van aanroep A.
    experience_cache      JSONB,
    experience_cache_at   TIMESTAMPTZ,

    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT doos_types_slug_uniek UNIQUE (organization_id, slug),
    CONSTRAINT doos_types_personen_range CHECK (
        personen_min IS NULL OR personen_max IS NULL OR personen_min <= personen_max
    )
);

COMMENT ON TABLE public.doos_types IS
    'Gourmetbox-product. Bevat alleen wat van Hop & Bites is (prijs, maxima, actief). De samenstelling en de portiegetallen horen bij het doostype in de Experience-app en komen binnen via aanroep A.';

COMMENT ON COLUMN public.doos_types.experience_cache IS
    'Laatste geslaagde antwoord van GET /api/experience/v1/box-types/:slug. Geen tweede waarheid en niets wat met de hand wordt bijgehouden — puur een cache, zodat het formulier blijft werken als de andere app even weg is en het aantal dozen berekend kan worden op het moment van bestellen. Bevat o.a. personen_per_doos en de onderdelen.';

COMMENT ON COLUMN public.doos_types.max_dozen_totaal IS
    'Hoeveel dozen er in totaal gemaakt worden. Dit begrenst zijn uren en zijn koeling, niet de verpakking — daarom staat het hier en niet in de Experience-app. NULL = geen totaalgrens.';

COMMENT ON COLUMN public.doos_types.prijs_cents IS
    'NULL betekent: nog niet vastgesteld. Het formulier toont dan geen prijs — niet EUR 0,00.';

CREATE INDEX IF NOT EXISTS doos_types_org_idx
    ON public.doos_types(organization_id);
CREATE INDEX IF NOT EXISTS doos_types_org_actief_idx
    ON public.doos_types(organization_id, actief) WHERE actief;


-- ── 2. afhaalmomenten ───────────────────────────────────────────────────────
-- max_dozen is de grens, maar de BEZETTING wordt geteld en nooit opgeslagen:
-- een aantal_gebruikt-kolom loopt vroeg of laat uit de pas met de werkelijkheid
-- en dan verkoop je een doos die er niet is.
CREATE TABLE IF NOT EXISTS public.afhaalmomenten (
    id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id   UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    doos_type_id      UUID        NOT NULL REFERENCES public.doos_types(id)    ON DELETE CASCADE,

    datum             DATE        NOT NULL,
    start_tijd        TIME        NOT NULL,
    eind_tijd         TIME,
    max_dozen         INTEGER     NOT NULL CHECK (max_dozen >= 0),
    actief            BOOLEAN     NOT NULL DEFAULT true,

    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT afhaalmomenten_tijden CHECK (eind_tijd IS NULL OR eind_tijd > start_tijd)
);

COMMENT ON TABLE public.afhaalmomenten IS
    'Wanneer er opgehaald kan worden en hoeveel dozen er op dat moment passen. Bezetting wordt geteld (som van bestellingen.dozen), nooit opgeslagen.';

CREATE INDEX IF NOT EXISTS afhaalmomenten_org_idx
    ON public.afhaalmomenten(organization_id);
CREATE INDEX IF NOT EXISTS afhaalmomenten_type_datum_idx
    ON public.afhaalmomenten(doos_type_id, datum, start_tijd);


-- ── 3. bestellingen ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.bestellingen (
    id                     BIGSERIAL   PRIMARY KEY,
    organization_id        UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,

    -- RESTRICT: een moment waar bestellingen aan hangen gooi je niet zomaar weg.
    doos_type_id           UUID        NOT NULL REFERENCES public.doos_types(id)     ON DELETE RESTRICT,
    afhaalmoment_id        UUID        NOT NULL REFERENCES public.afhaalmomenten(id) ON DELETE RESTRICT,

    personen               INTEGER     NOT NULL CHECK (personen > 0),
    dozen                  INTEGER     NOT NULL CHECK (dozen > 0),

    naam                   TEXT        NOT NULL,
    voornaam               TEXT        NOT NULL,
    email                  TEXT        NOT NULL,
    telefoon               TEXT,

    allergie_notitie       TEXT,
    allergie_gezien_at     TIMESTAMPTZ,
    allergie_gezien_door   UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
    avg_akkoord_at         TIMESTAMPTZ NOT NULL DEFAULT now(),

    status                 TEXT        NOT NULL DEFAULT 'nieuw'
                               CHECK (status IN ('nieuw','bevestigd','klaar','opgehaald','geannuleerd')),

    prijs_cents            INTEGER     CHECK (prijs_cents IS NULL OR prijs_cents >= 0),

    -- Komt van de Experience-app. Wordt hier NOOIT gegenereerd.
    experience_token       TEXT,
    experience_url         TEXT,
    doos_snapshot          JSONB,

    koppel_status          TEXT        NOT NULL DEFAULT 'wacht'
                               CHECK (koppel_status IN ('wacht','gekoppeld','mislukt')),
    koppel_fout            TEXT,
    koppel_poging_at       TIMESTAMPTZ,

    mail_status            TEXT        NOT NULL DEFAULT 'niet_verstuurd'
                               CHECK (mail_status IN ('niet_verstuurd','verstuurd','mislukt')),
    mail_fout              TEXT,
    mail_verstuurd_at      TIMESTAMPTZ,

    sticker_geprint_at     TIMESTAMPTZ,
    sticker_herprint_nodig BOOLEAN     NOT NULL DEFAULT false,

    idempotency_key        TEXT        NOT NULL,

    created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at             TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- ── Regel a: de allergie-poort ──────────────────────────────────────────
    -- Iemand typt "mijn vrouw is allergisch voor noten" en gaat er vanaf dat
    -- moment vanuit dat het gelezen is. Het gevaar is niet dat de notitie
    -- ontbreekt — hij staat er — maar dat de bestelling verder rolt zonder dat
    -- iemand hem opengeklikt heeft. "Bevestigd" betekent voor de klant: het is
    -- gezien en het komt goed. Deze constraint maakt dat waar, ook voor een
    -- bulkactie, een script of een toekomstige AI-actie.
    CONSTRAINT bestellingen_allergie_gezien CHECK (
        status IN ('nieuw','geannuleerd')
        OR allergie_notitie IS NULL
        OR allergie_gezien_at IS NOT NULL
    ),

    -- Eén bestelling, één token: een tweede verzending met dezelfde sleutel
    -- mag geen tweede bestelling worden.
    CONSTRAINT bestellingen_idempotent UNIQUE (organization_id, idempotency_key)
);

COMMENT ON TABLE public.bestellingen IS
    'Bestelling van een gourmetbox via het publieke formulier /bestellen/[slug].';

COMMENT ON COLUMN public.bestellingen.dozen IS
    'ceil(personen / personen_per_doos), berekend uit de experience_cache op het moment van bestellen en daarna vast. Capaciteit telt in dozen, want dat begrenst de uren en de koeling.';

COMMENT ON COLUMN public.bestellingen.voornaam IS
    'Het enige stuk naam dat de grens naar de Experience-app over gaat. Automatisch gevuld met het eerste woord, corrigeerbaar in de hub — anders wordt "Fam. Berkhout" straks "Welkom Fam." op tafel.';

COMMENT ON COLUMN public.bestellingen.naam IS
    'Volledige naam. Komt op de sticker, zodat je bij het afhalen de goede doos pakt. Wordt bij het printen nooit afgekapt.';

COMMENT ON COLUMN public.bestellingen.allergie_notitie IS
    'Vrije tekst van de klant. Dit is een bijzonder persoonsgegeven (AVG art. 9, gezondheid): wordt zes maanden na het afhaalmoment automatisch geleegd door de dagelijkse opruimtaak. NIET verwarren met de allergenen in het eten — die horen bij het product en staan aan de Experience-kant.';

COMMENT ON COLUMN public.bestellingen.experience_token IS
    'Komt van de Experience-app en wordt hier NOOIT gegenereerd, ook niet tijdelijk. Eén generator, in die app.';

COMMENT ON COLUMN public.bestellingen.doos_snapshot IS
    'Haltes + onderdelen zoals ze waren op het moment van koppelen. Printen en HERprinten lezen alleen dit en raken de Experience-API nooit aan: op 22 december mag een haperende andere app niet betekenen dat er geen stickers uit de printer komen. Een herdruk in januari hoort te tonen wat er in DIE doos zat.';

COMMENT ON COLUMN public.bestellingen.idempotency_key IS
    'Door de client gemaakt, per formulier-sessie. Zelfde sleutel + zelfde invoer geeft dezelfde bestelling terug; zelfde sleutel + andere invoer is een fout (BB004), nooit stilzwijgend de oude bestelling.';

CREATE INDEX IF NOT EXISTS bestellingen_org_idx
    ON public.bestellingen(organization_id);
CREATE INDEX IF NOT EXISTS bestellingen_org_status_idx
    ON public.bestellingen(organization_id, status);
CREATE INDEX IF NOT EXISTS bestellingen_moment_idx
    ON public.bestellingen(afhaalmoment_id);
CREATE INDEX IF NOT EXISTS bestellingen_type_idx
    ON public.bestellingen(doos_type_id);
-- Voor de twee tellers bovenaan de hub: allergienotities die nog niet gelezen
-- zijn, en bestellingen die op koppeling wachten.
CREATE INDEX IF NOT EXISTS bestellingen_allergie_open_idx
    ON public.bestellingen(organization_id)
    WHERE allergie_notitie IS NOT NULL AND allergie_gezien_at IS NULL;
CREATE INDEX IF NOT EXISTS bestellingen_koppel_open_idx
    ON public.bestellingen(organization_id)
    WHERE koppel_status <> 'gekoppeld';
-- Voor de opruimtaak.
CREATE INDEX IF NOT EXISTS bestellingen_allergie_opruimen_idx
    ON public.bestellingen(afhaalmoment_id)
    WHERE allergie_notitie IS NOT NULL;


-- ── 4. bestel_wachtlijst ────────────────────────────────────────────────────
-- Het uitverkocht-scherm belooft: "je krijgt één bericht zodra de bestelling
-- volgend jaar opengaat. Verder niets." Dat is doelbinding, en die moet
-- afdwingbaar zijn in plaats van opgeschreven.
--
-- Een APARTE tabel, juist omdat zo'n rij bijna niet te onderscheiden is van een
-- lead — dat is precies hoe een adres per ongeluk in een campagne belandt. Deze
-- rijen horen niet in leads, niet in de pijplijn, niet in een mailinglijst en
-- niet in een AI-context.
CREATE TABLE IF NOT EXISTS public.bestel_wachtlijst (
    id                    BIGSERIAL   PRIMARY KEY,
    organization_id       UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    doos_type_id          UUID        NOT NULL REFERENCES public.doos_types(id)    ON DELETE CASCADE,

    email                 TEXT        NOT NULL,
    bericht_verstuurd_at  TIMESTAMPTZ,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT bestel_wachtlijst_uniek UNIQUE (doos_type_id, email)
);

COMMENT ON TABLE public.bestel_wachtlijst IS
    'Mailadressen van mensen die te laat waren. Eén bericht, dan weg. Geen naam, geen telefoon, geen aantal personen — alleen een adres en waarvoor. Dit is GEEN lead: niet in de pijplijn, niet in een mailinglijst, niet in een AI-context.';

COMMENT ON COLUMN public.bestel_wachtlijst.bericht_verstuurd_at IS
    'Gevuld = deze rij is op; er is geen tweede bericht. De opruimtaak verwijdert de rij daarna, en ook rijen die na achttien maanden nog niets gekregen hebben — dan is de belofte niet waargemaakt en heeft het adres hier niets meer te zoeken.';

CREATE INDEX IF NOT EXISTS bestel_wachtlijst_org_idx
    ON public.bestel_wachtlijst(organization_id);
CREATE INDEX IF NOT EXISTS bestel_wachtlijst_open_idx
    ON public.bestel_wachtlijst(doos_type_id)
    WHERE bericht_verstuurd_at IS NULL;


-- ── 5. Regel b: sticker klopt niet meer ─────────────────────────────────────
-- Het aantal personen verandert nadat de sticker geprint is, en dan klopt de
-- sticker niet meer. Niemand hoeft daaraan te denken.
CREATE OR REPLACE FUNCTION public.bestelling_markeer_herprint()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF OLD.sticker_geprint_at IS NOT NULL
       AND (
            NEW.personen        IS DISTINCT FROM OLD.personen
         OR NEW.dozen           IS DISTINCT FROM OLD.dozen
         OR NEW.naam            IS DISTINCT FROM OLD.naam
         OR NEW.afhaalmoment_id IS DISTINCT FROM OLD.afhaalmoment_id
       )
    THEN
        NEW.sticker_herprint_nodig := true;
    END IF;
    RETURN NEW;
END $$;

COMMENT ON FUNCTION public.bestelling_markeer_herprint() IS
    'Zet sticker_herprint_nodig zodra een geprinte bestelling wijzigt in iets dat op de sticker staat.';

DROP TRIGGER IF EXISTS trg_bestellingen_herprint ON public.bestellingen;
CREATE TRIGGER trg_bestellingen_herprint
    BEFORE UPDATE ON public.bestellingen
    FOR EACH ROW
    EXECUTE FUNCTION public.bestelling_markeer_herprint();

DROP TRIGGER IF EXISTS trg_bestellingen_updated_at ON public.bestellingen;
CREATE TRIGGER trg_bestellingen_updated_at
    BEFORE UPDATE ON public.bestellingen
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_doos_types_updated_at ON public.doos_types;
CREATE TRIGGER trg_doos_types_updated_at
    BEFORE UPDATE ON public.doos_types
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_afhaalmomenten_updated_at ON public.afhaalmomenten;
CREATE TRIGGER trg_afhaalmomenten_updated_at
    BEFORE UPDATE ON public.afhaalmomenten
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- ── 6. Regel c: plaats_bestelling ───────────────────────────────────────────
-- Twee mensen die tegelijk de laatste doos pakken is een echte race.
-- Lezen-dan-schrijven vanuit een API-route lost dat niet op: allebei lezen
-- "nog 1 vrij" en allebei schrijven. Daarom telt en schrijft één functie, in
-- één transactie, met de rijen vergrendeld.
--
-- Vergrendelvolgorde is altijd doos_type → afhaalmoment. Dezelfde volgorde in
-- elke aanroep, anders kunnen twee gelijktijdige bestellingen elkaar klemzetten.
--
-- Foutcodes (de API vertaalt ze naar een zin voor de klant):
--   BB001  moment is vol
--   BB002  moment onbekend, niet actief, of hoort niet bij dit doostype
--   BB003  totaal uitverkocht
--   BB004  zelfde idempotency-sleutel, andere invoer
--   BB005  doosmaat onbekend (cache leeg en aanroep A onbereikbaar)
--   BB006  aantal personen valt buiten de grenzen van dit doostype
CREATE OR REPLACE FUNCTION public.plaats_bestelling(
    p_organization_id   UUID,
    p_doos_type_id      UUID,
    p_afhaalmoment_id   UUID,
    p_personen          INTEGER,
    p_naam              TEXT,
    p_voornaam          TEXT,
    p_email             TEXT,
    p_telefoon          TEXT,
    p_allergie_notitie  TEXT,
    p_idempotency_key   TEXT
)
RETURNS public.bestellingen
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
    v_type              public.doos_types%ROWTYPE;
    v_moment            public.afhaalmomenten%ROWTYPE;
    v_bestaand          public.bestellingen%ROWTYPE;
    v_nieuw             public.bestellingen%ROWTYPE;
    v_personen_per_doos INTEGER;
    v_dozen             INTEGER;
    v_bezet_moment      INTEGER;
    v_bezet_totaal      INTEGER;
    v_allergie          TEXT;
BEGIN
    -- Lege string is geen notitie. Eén keer hier normaliseren, zodat de
    -- allergie-poort en de opruimtaak niet allebei op '' hoeven te letten.
    v_allergie := NULLIF(btrim(COALESCE(p_allergie_notitie, '')), '');

    -- ── Idempotentie ────────────────────────────────────────────────────────
    -- Zelfde sleutel + zelfde invoer geeft dezelfde bestelling terug. Zelfde
    -- sleutel + ANDERE invoer is een fout: stilzwijgend de oude bestelling
    -- teruggeven zou betekenen dat er straks een sticker met de verkeerde
    -- inhoud geprint wordt.
    SELECT * INTO v_bestaand
    FROM public.bestellingen
    WHERE organization_id = p_organization_id
      AND idempotency_key = p_idempotency_key;

    IF FOUND THEN
        IF v_bestaand.doos_type_id     = p_doos_type_id
           AND v_bestaand.afhaalmoment_id = p_afhaalmoment_id
           AND v_bestaand.personen        = p_personen
           AND v_bestaand.naam            = p_naam
           AND v_bestaand.email           = p_email
           AND v_bestaand.allergie_notitie IS NOT DISTINCT FROM v_allergie
        THEN
            RETURN v_bestaand;
        END IF;
        RAISE EXCEPTION 'zelfde sleutel, andere invoer'
            USING ERRCODE = 'BB004';
    END IF;

    -- ── Doostype vergrendelen (eerst, altijd) ───────────────────────────────
    SELECT * INTO v_type
    FROM public.doos_types
    WHERE id = p_doos_type_id
      AND organization_id = p_organization_id
      AND actief
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'doostype onbekend of niet actief'
            USING ERRCODE = 'BB002';
    END IF;

    IF (v_type.personen_min IS NOT NULL AND p_personen < v_type.personen_min)
       OR (v_type.personen_max IS NOT NULL AND p_personen > v_type.personen_max)
    THEN
        RAISE EXCEPTION 'aantal personen valt buiten de grenzen'
            USING ERRCODE = 'BB006';
    END IF;

    -- ── Hoeveel dozen is dit? ───────────────────────────────────────────────
    -- personen_per_doos volgt uit de verpakking en hoort bij het doostype in de
    -- Experience-app. Staat hij niet in de cache, dan weten we de doosmaat niet
    -- en nemen we geen bestelling aan. Liever dicht dan een doosmaat raden.
    -- Bewust via een regex-controle en niet met een kale cast: een cache met
    -- rommel erin hoort een nette "we weten de doosmaat niet" te geven, geen
    -- 500 op het bestelformulier.
    v_personen_per_doos := CASE
        WHEN v_type.experience_cache->>'personen_per_doos' ~ '^[0-9]+$'
        THEN (v_type.experience_cache->>'personen_per_doos')::INTEGER
        ELSE NULL
    END;

    IF v_personen_per_doos IS NULL OR v_personen_per_doos <= 0 THEN
        RAISE EXCEPTION 'doosmaat onbekend'
            USING ERRCODE = 'BB005';
    END IF;

    v_dozen := CEIL(p_personen::NUMERIC / v_personen_per_doos)::INTEGER;

    -- ── Afhaalmoment vergrendelen ───────────────────────────────────────────
    SELECT * INTO v_moment
    FROM public.afhaalmomenten
    WHERE id = p_afhaalmoment_id
      AND organization_id = p_organization_id
      AND doos_type_id = p_doos_type_id
      AND actief
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'afhaalmoment onbekend of niet actief'
            USING ERRCODE = 'BB002';
    END IF;

    -- Bezetting wordt hier geteld, met de rijen vergrendeld. Geannuleerde
    -- bestellingen tellen niet mee — die doos wordt niet gemaakt.
    SELECT COALESCE(SUM(dozen), 0) INTO v_bezet_moment
    FROM public.bestellingen
    WHERE afhaalmoment_id = p_afhaalmoment_id
      AND status <> 'geannuleerd';

    IF v_bezet_moment + v_dozen > v_moment.max_dozen THEN
        RAISE EXCEPTION 'moment vol'
            USING ERRCODE = 'BB001';
    END IF;

    IF v_type.max_dozen_totaal IS NOT NULL THEN
        SELECT COALESCE(SUM(dozen), 0) INTO v_bezet_totaal
        FROM public.bestellingen
        WHERE doos_type_id = p_doos_type_id
          AND status <> 'geannuleerd';

        IF v_bezet_totaal + v_dozen > v_type.max_dozen_totaal THEN
            RAISE EXCEPTION 'totaal uitverkocht'
                USING ERRCODE = 'BB003';
        END IF;
    END IF;

    -- ── Opslaan ─────────────────────────────────────────────────────────────
    -- organization_id gaat expliciet mee (huisregel: nooit op een default of
    -- een trigger vertrouwen bij een insert).
    -- prijs_cents wordt hier vastgelegd: een latere prijswijziging raakt
    -- bestaande bestellingen niet.
    INSERT INTO public.bestellingen (
        organization_id, doos_type_id, afhaalmoment_id,
        personen, dozen,
        naam, voornaam, email, telefoon,
        allergie_notitie, prijs_cents, idempotency_key
    ) VALUES (
        p_organization_id, p_doos_type_id, p_afhaalmoment_id,
        p_personen, v_dozen,
        p_naam, p_voornaam, p_email, NULLIF(btrim(COALESCE(p_telefoon, '')), ''),
        v_allergie, v_type.prijs_cents, p_idempotency_key
    )
    RETURNING * INTO v_nieuw;

    RETURN v_nieuw;
END $$;

COMMENT ON FUNCTION public.plaats_bestelling IS
    'Neemt één bestelling aan, met doos_type en afhaalmoment vergrendeld zodat twee mensen niet allebei de laatste doos krijgen. Foutcodes BB001..BB006 — zie de commentaarkop in de migratie.';

-- Wordt aangeroepen vanaf de publieke route met de service-role client. Niemand
-- anders hoeft erbij: een anon-aanroep zou de capaciteitsregels omzeilen die de
-- API eromheen zet.
REVOKE ALL ON FUNCTION public.plaats_bestelling(UUID, UUID, UUID, INTEGER, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.plaats_bestelling(UUID, UUID, UUID, INTEGER, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO service_role;


-- ── 7. RLS ──────────────────────────────────────────────────────────────────
-- Operator-CRUD via authenticated-policies. De PUBLIEKE inserts (bestelling en
-- wachtlijst) lopen via de service-role client, net als /q/[id] en het
-- aanvraagformulier — daarom bewust GEEN `TO anon`-policy: dat is in deze repo
-- een anti-patroon.
ALTER TABLE public.doos_types        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.afhaalmomenten    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bestellingen      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bestel_wachtlijst ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
    t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY['doos_types','afhaalmomenten','bestellingen','bestel_wachtlijst']
    LOOP
        -- De policy-naam gaat als eigen %I mee. Zou je '%I_select' schrijven,
        -- dan komt dat achtervoegsel buiten de aanhalingstekens te staan zodra
        -- format() de tabelnaam wél moet quoten.
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


-- ── 8. Verificatie na het draaien ───────────────────────────────────────────
--
--   SELECT tablename, count(*) FROM pg_policies
--    WHERE schemaname='public'
--      AND tablename IN ('doos_types','afhaalmomenten','bestellingen','bestel_wachtlijst')
--    GROUP BY tablename;
--   -- Verwacht: 4 per tabel.
--
--   SELECT relname, relrowsecurity FROM pg_class
--    WHERE relname IN ('doos_types','afhaalmomenten','bestellingen','bestel_wachtlijst');
--   -- Verwacht: overal true.
--
-- Er gaat met opzet GEEN voorbeelddata mee. Prijs, datums, tijden en maxima
-- staan nog niet vast; een plausibel getal in de database is erger dan een leeg
-- veld, want het ziet eruit alsof iemand het heeft nagekeken.
