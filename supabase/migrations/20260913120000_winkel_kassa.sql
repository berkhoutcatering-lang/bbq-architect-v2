-- ════════════════════════════════════════════════════════════════════════════
--  Winkel-kassa — online afrekenen voor de Hop & Bites-website via myPOS
--  Contract: OVERDRACHT-BBQ-ARCHITECT-WEBSHOP.md (website-repo, 11 sep 2026)
--  Routes:   src/app/api/public-winkel/[slug]/*
-- ════════════════════════════════════════════════════════════════════════════
--
--  De website stuurt artikel-slugs, aantallen, een moment en contactgegevens.
--  BBQ Architect is de financiële autoriteit: prijs, btw, verzendkosten,
--  reservering en betaalstatus staan hier. Bedragen zijn hele centen.
--
--  Vijf tabellen:
--    winkel_instellingen   per organisatie: verzendtarief, gratis-grens,
--                          reserveringsduur, ordernummer-teller
--    winkel_artikelen      de catalogus zoals de kassa hem kent (slug = de
--                          slug van de website)
--    winkel_momenten       afhaalmomenten (planken) en afhaaldagen (Kerst-Box)
--                          met capaciteit
--    winkel_orders         de order: status, bedragen, contact, token
--    winkel_order_regels   de regels, met de capaciteit die ze innemen
--    winkel_betaalberichten elk ontvangen betaalbericht, één keer
--
--  Drie regels staan in de database en niet in de route:
--    a. capaciteit en voorraad worden geteld onder vergrendeling, nooit
--       opgeslagen — twee mensen die tegelijk de laatste plank pakken worden
--       achter elkaar afgehandeld
--    b. een order op 'wacht' houdt zijn plek vast tot reservering_tot; daarna
--       telt hij niet meer mee. Een betaling die daarna alsnog binnenkomt
--       krijgt de plek terug als die er nog is, anders wordt hij 'mislukt'
--       met reden 'verlopen-en-vol' (en terugbetaald door de route)
--    c. een betaalbericht met dezelfde referentie wordt maar één keer verwerkt
--
--  Wat hier NIET staat, met opzet: geen productinformatie (naam, foto,
--  verhaal) — dat blijft op de website. Hier alleen wat geld en capaciteit
--  raakt.
-- ════════════════════════════════════════════════════════════════════════════


-- ── 0. Pre-flight ───────────────────────────────────────────────────────────
DO $$
BEGIN
    IF to_regclass('public.organizations') IS NULL THEN
        RAISE EXCEPTION 'winkel_kassa: tabel public.organizations ontbreekt';
    END IF;
    IF to_regprocedure('private.user_org_ids()') IS NULL THEN
        RAISE EXCEPTION 'winkel_kassa: functie private.user_org_ids() ontbreekt';
    END IF;
    IF to_regprocedure('public.set_updated_at()') IS NULL THEN
        RAISE EXCEPTION 'winkel_kassa: functie public.set_updated_at() ontbreekt';
    END IF;
END $$;


-- ── 1. winkel_instellingen ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.winkel_instellingen (
    organization_id             UUID        PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,

    -- Verzenden: tarief en gratis-grens. NULL tarief = verzenden staat uit.
    verzendkosten_cents         INTEGER     CHECK (verzendkosten_cents IS NULL OR verzendkosten_cents >= 0),
    gratis_verzenden_vanaf_cents INTEGER    CHECK (gratis_verzenden_vanaf_cents IS NULL OR gratis_verzenden_vanaf_cents >= 0),
    verzendkosten_btw_pct       INTEGER     NOT NULL DEFAULT 21 CHECK (verzendkosten_btw_pct IN (0, 9, 21)),

    -- Hoe lang een gestarte order zijn plek vasthoudt, en hoe lang een offerte geldt.
    reservering_minuten         INTEGER     NOT NULL DEFAULT 30 CHECK (reservering_minuten BETWEEN 5 AND 240),
    offerte_geldig_minuten      INTEGER     NOT NULL DEFAULT 15 CHECK (offerte_geldig_minuten BETWEEN 1 AND 240),

    -- Ordernummer: HB-2026-0042. Teller per jaar, vergrendeld bij uitgifte.
    nummer_prefix               TEXT        NOT NULL DEFAULT 'HB',
    nummer_jaar                 INTEGER,
    nummer_laatste              INTEGER     NOT NULL DEFAULT 0,

    -- Open kraan of dicht: zonder 'aan' neemt de kassa geen orders aan.
    kassa_open                  BOOLEAN     NOT NULL DEFAULT false,

    -- De website waar de betaling naar terugkeert (terugUrl uit de order is
    -- een pad op déze site). Alleen dit domein is een geldige terug-URL.
    site_url                    TEXT,

    created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.winkel_instellingen IS
    'Kassa-instellingen per organisatie: verzendtarief, reserveringsduur, ordernummer-teller. Eén rij per organisatie.';
COMMENT ON COLUMN public.winkel_instellingen.verzendkosten_cents IS
    'NULL = verzenden staat uit (de offerte weigert leverwijze verzenden). Tarief nog niet definitief — zie de open vragen in de overdracht.';
COMMENT ON COLUMN public.winkel_instellingen.gratis_verzenden_vanaf_cents IS
    'Subtotaal vanaf waar verzenden gratis is. NULL = nooit gratis.';


-- ── 2. winkel_artikelen ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.winkel_artikelen (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id     UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,

    slug                TEXT        NOT NULL,
    naam                TEXT        NOT NULL,
    eenheid             TEXT        NOT NULL DEFAULT 'per stuk',
    telt                TEXT        NOT NULL DEFAULT 'stuks' CHECK (telt IN ('stuks', 'personen')),

    -- Geld. NULL prijs = prijs volgt: het artikel is dan niet te bestellen.
    prijs_cents         INTEGER     CHECK (prijs_cents IS NULL OR prijs_cents >= 0),
    btw_pct             INTEGER     NOT NULL DEFAULT 9 CHECK (btw_pct IN (0, 9, 21)),

    minimum             INTEGER     NOT NULL DEFAULT 1 CHECK (minimum > 0),
    maximum             INTEGER     CHECK (maximum IS NULL OR maximum >= minimum),

    verzendbaar         BOOLEAN     NOT NULL DEFAULT false,
    gekoeld             BOOLEAN     NOT NULL DEFAULT false,

    -- Hoe het afhalen werkt:
    --   geen    geen eigen afspraak (losse producten)
    --   moment  de klant kiest een afhaalmoment uit de agenda (planken)
    --   dag     de klant kiest een dag, zonder tijdvak (Kerst-Box)
    -- moment_groep zegt uit welke groep momenten er gekozen wordt: 'agenda'
    -- voor planken, 'kerst-box' voor beide Kerst-Box-varianten (die delen zo
    -- de dagen én de capaciteit).
    moment_soort        TEXT        NOT NULL DEFAULT 'geen' CHECK (moment_soort IN ('geen', 'moment', 'dag')),
    moment_groep        TEXT,
    afhaalmoment_tekst  TEXT,

    -- Capaciteit: hoeveel eenheden neemt een regel in op een moment/dag?
    --   regel   één per regel (een plank is één plank, hoe groot ook)
    --   aantal  het aantal (stuks)
    --   dozen   de dozen waarin het aantal personen verdeeld wordt (Kerst-Box)
    capaciteit_soort    TEXT        NOT NULL DEFAULT 'regel' CHECK (capaciteit_soort IN ('regel', 'aantal', 'dozen')),
    -- Doosverdeling voor capaciteit_soort 'dozen': tot en met doos_klein_max
    -- personen past het in een kleine doos, daarboven in dozen van doos_groot.
    doos_klein_max      INTEGER     CHECK (doos_klein_max IS NULL OR doos_klein_max > 0),
    doos_groot          INTEGER     CHECK (doos_groot IS NULL OR doos_groot > 0),

    -- Voorraad in stuks. NULL = onbeperkt (op bestelling gemaakt).
    voorraad            INTEGER     CHECK (voorraad IS NULL OR voorraad >= 0),

    actief              BOOLEAN     NOT NULL DEFAULT false,
    -- Niet publiek = wel bestelbaar op slug, maar niet in een catalogus-lijst
    -- (de vegetarische Kerst-Box: het menu blijft nog even geheim).
    publiek             BOOLEAN     NOT NULL DEFAULT true,

    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT winkel_artikelen_slug_uniek UNIQUE (organization_id, slug),
    CONSTRAINT winkel_artikelen_moment_groep CHECK (moment_soort = 'geen' OR moment_groep IS NOT NULL),
    CONSTRAINT winkel_artikelen_dozen_config CHECK (
        capaciteit_soort <> 'dozen' OR (doos_klein_max IS NOT NULL AND doos_groot IS NOT NULL AND doos_klein_max < doos_groot)
    )
);

COMMENT ON TABLE public.winkel_artikelen IS
    'De catalogus zoals de kassa hem kent. De slug is de slug van de website; naam, foto en verhaal blijven daar.';
COMMENT ON COLUMN public.winkel_artikelen.prijs_cents IS
    'NULL = prijs volgt. Nooit EUR 0,00 als gok.';

CREATE INDEX IF NOT EXISTS winkel_artikelen_org_idx ON public.winkel_artikelen(organization_id);


-- ── 3. winkel_momenten ──────────────────────────────────────────────────────
-- Eén tabel voor twee dingen: de agenda-momenten voor planken (groep 'agenda',
-- met tijdvak) en de afhaaldagen van de Kerst-Box (groep 'kerst-box', zonder
-- tijdvak: de tijd komt in de bevestiging). Artikelen wijzen met moment_groep
-- naar de groep waaruit gekozen wordt.
CREATE TABLE IF NOT EXISTS public.winkel_momenten (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id     UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    groep               TEXT        NOT NULL DEFAULT 'agenda',

    datum               DATE        NOT NULL,
    van                 TIME,
    tot                 TIME,
    capaciteit          INTEGER     NOT NULL CHECK (capaciteit >= 0),
    -- De laatste dag waarop hiervoor besteld kan worden (besteltermijn).
    bestellen_tot       DATE,
    actief              BOOLEAN     NOT NULL DEFAULT true,

    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT winkel_momenten_tijden CHECK (tot IS NULL OR van IS NULL OR tot > van)
);

COMMENT ON TABLE public.winkel_momenten IS
    'Afhaalmomenten per groep: agenda (planken, met tijdvak) en kerst-box (dagen zonder tijdvak). Capaciteit in eenheden; bezetting wordt geteld, nooit opgeslagen.';

CREATE INDEX IF NOT EXISTS winkel_momenten_org_groep_datum_idx ON public.winkel_momenten(organization_id, groep, datum);


-- ── 4. winkel_orders + regels ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.winkel_orders (
    id                  BIGSERIAL   PRIMARY KEY,
    organization_id     UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,

    nummer              TEXT        NOT NULL,
    -- Onraadbaar: 32 bytes willekeur als hex (256 bit). Dit is de enige sleutel
    -- waarmee een klant zijn status ziet.
    token               TEXT        NOT NULL,
    -- Idempotentiesleutel van de website: zelfde sleutel = zelfde order.
    sleutel             TEXT        NOT NULL,

    status              TEXT        NOT NULL DEFAULT 'wacht'
                            CHECK (status IN ('wacht', 'betaald', 'afgebroken', 'mislukt', 'verlopen')),
    status_reden        TEXT,

    leverwijze          TEXT        NOT NULL CHECK (leverwijze IN ('afhalen', 'verzenden')),
    moment_id           UUID        REFERENCES public.winkel_momenten(id) ON DELETE RESTRICT,

    contact_naam        TEXT        NOT NULL,
    contact_email       TEXT        NOT NULL,
    contact_telefoon    TEXT,
    adres               JSONB,
    opmerking           TEXT,

    subtotaal_cents     INTEGER     NOT NULL CHECK (subtotaal_cents >= 0),
    leverkosten_cents   INTEGER     NOT NULL DEFAULT 0 CHECK (leverkosten_cents >= 0),
    totaal_cents        INTEGER     NOT NULL CHECK (totaal_cents >= 0),
    -- Btw per tarief, in centen: {"9": 1234, "21": 56}. Informatief; de site
    -- toont alleen totalen inclusief.
    btw_cents           JSONB       NOT NULL DEFAULT '{}'::jsonb,

    -- Tot wanneer deze order zijn plek vasthoudt terwijl hij op 'wacht' staat.
    reservering_tot     TIMESTAMPTZ NOT NULL,
    terug_url           TEXT        NOT NULL,

    -- Betaling (myPOS). Elke poging krijgt een eigen OrderID richting myPOS:
    -- "<nummer>-<poging>", zodat een herhaalde poging nooit met de vorige botst.
    betaalpoging        INTEGER     NOT NULL DEFAULT 0,
    mypos_order_id      TEXT,
    mypos_trnref        TEXT,
    betaald_cents       INTEGER,
    betaald_at          TIMESTAMPTZ,
    betaalmethode       TEXT,

    -- Terugbetaling, alleen voor 'verlopen-en-vol'.
    refund_status       TEXT        CHECK (refund_status IS NULL OR refund_status IN ('nodig', 'gelukt', 'mislukt')),
    refund_fout         TEXT,

    mail_status         TEXT        NOT NULL DEFAULT 'niet_verstuurd'
                            CHECK (mail_status IN ('niet_verstuurd', 'verstuurd', 'mislukt')),
    mail_fout           TEXT,
    mail_verstuurd_at   TIMESTAMPTZ,

    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT winkel_orders_nummer_uniek UNIQUE (organization_id, nummer),
    CONSTRAINT winkel_orders_token_uniek  UNIQUE (token)
);

-- Zelfde sleutel = zelfde order, behalve als die order verlopen is: dan mag de
-- klant met dezelfde mand opnieuw beginnen en krijgt hij een verse reservering.
CREATE UNIQUE INDEX IF NOT EXISTS winkel_orders_sleutel_idx
    ON public.winkel_orders(organization_id, sleutel)
    WHERE status <> 'verlopen';

CREATE INDEX IF NOT EXISTS winkel_orders_org_status_idx ON public.winkel_orders(organization_id, status);
CREATE INDEX IF NOT EXISTS winkel_orders_mypos_idx ON public.winkel_orders(mypos_order_id);

COMMENT ON TABLE public.winkel_orders IS
    'Webshop-order van de Hop & Bites-website. Status volgt de myPOS-betaling; een bezoek aan de terug-URL is geen bewijs van betaling.';
COMMENT ON COLUMN public.winkel_orders.reservering_tot IS
    'Een order op wacht telt mee in capaciteit en voorraad tot dit tijdstip. Daarna is de plek weer vrij; komt de betaling alsnog, dan wordt opnieuw geteld.';


CREATE TABLE IF NOT EXISTS public.winkel_order_regels (
    id                  BIGSERIAL   PRIMARY KEY,
    organization_id     UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    order_id            BIGINT      NOT NULL REFERENCES public.winkel_orders(id) ON DELETE CASCADE,
    artikel_id          UUID        NOT NULL REFERENCES public.winkel_artikelen(id) ON DELETE RESTRICT,

    slug                TEXT        NOT NULL,
    naam                TEXT        NOT NULL,
    aantal              INTEGER     NOT NULL CHECK (aantal > 0),
    eenheid             TEXT        NOT NULL,
    stuk_cents          INTEGER     NOT NULL CHECK (stuk_cents >= 0),
    bedrag_cents        INTEGER     NOT NULL CHECK (bedrag_cents >= 0),
    btw_pct             INTEGER     NOT NULL,

    -- Het moment/de dag van deze regel (planken: het ordermoment; Kerst-Box: de dag).
    moment_id           UUID        REFERENCES public.winkel_momenten(id) ON DELETE RESTRICT,
    -- Hoeveel capaciteit deze regel inneemt op dat moment (zie capaciteit_soort).
    eenheden            INTEGER     NOT NULL DEFAULT 1 CHECK (eenheden >= 0),
    -- Hoeveel voorraad deze regel inneemt (alleen artikelen met voorraad).
    voorraad_eenheden   INTEGER     NOT NULL DEFAULT 0 CHECK (voorraad_eenheden >= 0),
    -- De afhaalafspraak in woorden, gaat mee tot en met de bevestiging.
    afhaalmoment_tekst  TEXT,

    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS winkel_order_regels_order_idx   ON public.winkel_order_regels(order_id);
CREATE INDEX IF NOT EXISTS winkel_order_regels_moment_idx  ON public.winkel_order_regels(moment_id);
CREATE INDEX IF NOT EXISTS winkel_order_regels_artikel_idx ON public.winkel_order_regels(artikel_id);


-- ── 5. winkel_betaalberichten ───────────────────────────────────────────────
-- Elk betaalbericht van myPOS één keer. De referentie is IPC_Trnref (of, als
-- die ontbreekt, een hash van het hele bericht). Een herhaald bericht botst op
-- de unieke index en verandert niets.
CREATE TABLE IF NOT EXISTS public.winkel_betaalberichten (
    id                  BIGSERIAL   PRIMARY KEY,
    organization_id     UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    order_id            BIGINT      REFERENCES public.winkel_orders(id) ON DELETE SET NULL,
    referentie          TEXT        NOT NULL,
    methode             TEXT        NOT NULL,
    payload             JSONB       NOT NULL,
    uitkomst            TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT winkel_betaalberichten_uniek UNIQUE (organization_id, referentie)
);


-- ── 6. Triggers ─────────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_winkel_instellingen_updated_at ON public.winkel_instellingen;
CREATE TRIGGER trg_winkel_instellingen_updated_at BEFORE UPDATE ON public.winkel_instellingen
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS trg_winkel_artikelen_updated_at ON public.winkel_artikelen;
CREATE TRIGGER trg_winkel_artikelen_updated_at BEFORE UPDATE ON public.winkel_artikelen
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS trg_winkel_momenten_updated_at ON public.winkel_momenten;
CREATE TRIGGER trg_winkel_momenten_updated_at BEFORE UPDATE ON public.winkel_momenten
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS trg_winkel_orders_updated_at ON public.winkel_orders;
CREATE TRIGGER trg_winkel_orders_updated_at BEFORE UPDATE ON public.winkel_orders
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- ── 7. Bezetting tellen ─────────────────────────────────────────────────────
-- Wat telt mee: betaalde orders, en orders op 'wacht' waarvan de reservering
-- nog loopt. Afgebroken/mislukt/verlopen houden geen plek vast.
CREATE OR REPLACE FUNCTION public.winkel_bezetting_moment(p_moment_id UUID, p_zonder_order BIGINT DEFAULT NULL)
RETURNS INTEGER
LANGUAGE sql
STABLE
AS $$
    SELECT COALESCE(SUM(r.eenheden), 0)::INTEGER
    FROM public.winkel_order_regels r
    JOIN public.winkel_orders o ON o.id = r.order_id
    WHERE r.moment_id = p_moment_id
      AND (p_zonder_order IS NULL OR o.id <> p_zonder_order)
      AND (o.status = 'betaald' OR (o.status = 'wacht' AND o.reservering_tot > now()));
$$;

CREATE OR REPLACE FUNCTION public.winkel_bezetting_voorraad(p_artikel_id UUID, p_zonder_order BIGINT DEFAULT NULL)
RETURNS INTEGER
LANGUAGE sql
STABLE
AS $$
    SELECT COALESCE(SUM(r.voorraad_eenheden), 0)::INTEGER
    FROM public.winkel_order_regels r
    JOIN public.winkel_orders o ON o.id = r.order_id
    WHERE r.artikel_id = p_artikel_id
      AND (p_zonder_order IS NULL OR o.id <> p_zonder_order)
      AND (o.status = 'betaald' OR (o.status = 'wacht' AND o.reservering_tot > now()));
$$;


-- ── 8. Capaciteit controleren onder vergrendeling ───────────────────────────
-- Gedeeld door plaatsen, herstarten en betalen-na-verlopen. Vergrendelt de
-- momenten en artikelen van de regels (altijd in id-volgorde, zodat twee
-- gelijktijdige orders elkaar niet klemzetten) en gooit WK001/WK002 als het
-- niet past.
--
-- Foutcodes (de route vertaalt ze naar het contract van de website):
--   WK001  moment vol
--   WK002  voorraad op
--   WK003  moment onbekend of niet meer actief
--   WK004  artikel onbekend of niet meer actief
CREATE OR REPLACE FUNCTION public.winkel_controleer_capaciteit(
    p_organization_id UUID,
    p_regels          JSONB,
    p_zonder_order    BIGINT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
    v_moment_id  UUID;
    v_artikel_id UUID;
    v_nodig      INTEGER;
    v_moment     public.winkel_momenten%ROWTYPE;
    v_artikel    public.winkel_artikelen%ROWTYPE;
BEGIN
    -- Vergrendelen in id-volgorde.
    PERFORM 1 FROM public.winkel_momenten
     WHERE id IN (SELECT (r->>'moment_id')::UUID FROM jsonb_array_elements(p_regels) r WHERE r->>'moment_id' IS NOT NULL)
     ORDER BY id FOR UPDATE;
    PERFORM 1 FROM public.winkel_artikelen
     WHERE id IN (SELECT (r->>'artikel_id')::UUID FROM jsonb_array_elements(p_regels) r)
     ORDER BY id FOR UPDATE;

    -- Momenten: som van de eenheden per moment moet passen.
    FOR v_moment_id, v_nodig IN
        SELECT (r->>'moment_id')::UUID, SUM((r->>'eenheden')::INTEGER)
        FROM jsonb_array_elements(p_regels) r
        WHERE r->>'moment_id' IS NOT NULL
        GROUP BY 1
    LOOP
        SELECT * INTO v_moment FROM public.winkel_momenten
         WHERE id = v_moment_id AND organization_id = p_organization_id AND actief;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'moment onbekend of niet actief' USING ERRCODE = 'WK003';
        END IF;
        IF public.winkel_bezetting_moment(v_moment_id, p_zonder_order) + v_nodig > v_moment.capaciteit THEN
            RAISE EXCEPTION 'moment vol' USING ERRCODE = 'WK001';
        END IF;
    END LOOP;

    -- Voorraad: alleen artikelen met een voorraadgetal.
    FOR v_artikel_id, v_nodig IN
        SELECT (r->>'artikel_id')::UUID, SUM((r->>'voorraad_eenheden')::INTEGER)
        FROM jsonb_array_elements(p_regels) r
        GROUP BY 1
    LOOP
        SELECT * INTO v_artikel FROM public.winkel_artikelen
         WHERE id = v_artikel_id AND organization_id = p_organization_id AND actief;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'artikel onbekend of niet actief' USING ERRCODE = 'WK004';
        END IF;
        IF v_artikel.voorraad IS NOT NULL
           AND public.winkel_bezetting_voorraad(v_artikel_id, p_zonder_order) + v_nodig > v_artikel.voorraad THEN
            RAISE EXCEPTION 'voorraad op' USING ERRCODE = 'WK002';
        END IF;
    END LOOP;
END $$;


-- ── 9. Order plaatsen ───────────────────────────────────────────────────────
-- De route heeft de offerte al berekend (prijs, btw, verzendkosten). Deze
-- functie doet wat alleen in één transactie kan: nummer uitgeven, capaciteit
-- en voorraad controleren onder vergrendeling, order + regels schrijven.
--
-- p_regels: [{artikel_id, slug, naam, aantal, eenheid, stuk_cents, bedrag_cents,
--             btw_pct, moment_id, eenheden, voorraad_eenheden, afhaalmoment_tekst}]
CREATE OR REPLACE FUNCTION public.winkel_plaats_order(
    p_organization_id   UUID,
    p_sleutel           TEXT,
    p_token             TEXT,
    p_leverwijze        TEXT,
    p_moment_id         UUID,
    p_contact_naam      TEXT,
    p_contact_email     TEXT,
    p_contact_telefoon  TEXT,
    p_adres             JSONB,
    p_opmerking         TEXT,
    p_subtotaal_cents   INTEGER,
    p_leverkosten_cents INTEGER,
    p_totaal_cents      INTEGER,
    p_btw_cents         JSONB,
    p_terug_url         TEXT,
    p_regels            JSONB
)
RETURNS public.winkel_orders
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
    v_inst      public.winkel_instellingen%ROWTYPE;
    v_bestaand  public.winkel_orders%ROWTYPE;
    v_order     public.winkel_orders%ROWTYPE;
    v_jaar      INTEGER := EXTRACT(YEAR FROM (now() AT TIME ZONE 'Europe/Amsterdam'))::INTEGER;
    v_nummer    TEXT;
    r           JSONB;
BEGIN
    -- Instellingen vergrendelen: dit is ook de nummer-teller.
    SELECT * INTO v_inst FROM public.winkel_instellingen
     WHERE organization_id = p_organization_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'geen winkelinstellingen' USING ERRCODE = 'WK005';
    END IF;

    -- Idempotentie: zelfde sleutel (en niet verlopen) = dezelfde order terug.
    -- Na de lock, zodat twee gelijktijdige klikken elkaar hier treffen.
    SELECT * INTO v_bestaand FROM public.winkel_orders
     WHERE organization_id = p_organization_id AND sleutel = p_sleutel AND status <> 'verlopen';
    IF FOUND THEN
        RETURN v_bestaand;
    END IF;

    PERFORM public.winkel_controleer_capaciteit(p_organization_id, p_regels, NULL);

    -- Nummer: HB-2026-0042, teller per jaar.
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
        reservering_tot, terug_url
    ) VALUES (
        p_organization_id, v_nummer, p_token, p_sleutel, 'wacht', p_leverwijze, p_moment_id,
        p_contact_naam, p_contact_email, NULLIF(btrim(COALESCE(p_contact_telefoon, '')), ''), p_adres,
        NULLIF(btrim(COALESCE(p_opmerking, '')), ''),
        p_subtotaal_cents, p_leverkosten_cents, p_totaal_cents, COALESCE(p_btw_cents, '{}'::jsonb),
        now() + make_interval(mins => v_inst.reservering_minuten), p_terug_url
    )
    RETURNING * INTO v_order;

    FOR r IN SELECT * FROM jsonb_array_elements(p_regels)
    LOOP
        INSERT INTO public.winkel_order_regels (
            organization_id, order_id, artikel_id, slug, naam, aantal, eenheid,
            stuk_cents, bedrag_cents, btw_pct, moment_id, eenheden, voorraad_eenheden, afhaalmoment_tekst
        ) VALUES (
            p_organization_id, v_order.id, (r->>'artikel_id')::UUID, r->>'slug', r->>'naam',
            (r->>'aantal')::INTEGER, r->>'eenheid',
            (r->>'stuk_cents')::INTEGER, (r->>'bedrag_cents')::INTEGER, (r->>'btw_pct')::INTEGER,
            (r->>'moment_id')::UUID, COALESCE((r->>'eenheden')::INTEGER, 0),
            COALESCE((r->>'voorraad_eenheden')::INTEGER, 0), r->>'afhaalmoment_tekst'
        );
    END LOOP;

    RETURN v_order;
END $$;


-- ── 10. Betaalpoging (her)starten ───────────────────────────────────────────
-- Bij de eerste poging en bij "opnieuw proberen" na afgebroken/mislukt. Zet de
-- order (terug) op 'wacht' met een verse reservering — alleen als de plek er
-- nog is — en geeft het OrderID voor myPOS terug ("<nummer>-<poging>").
CREATE OR REPLACE FUNCTION public.winkel_start_betaalpoging(p_order_id BIGINT)
RETURNS public.winkel_orders
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
    v_order  public.winkel_orders%ROWTYPE;
    v_inst   public.winkel_instellingen%ROWTYPE;
    v_regels JSONB;
BEGIN
    SELECT * INTO v_order FROM public.winkel_orders WHERE id = p_order_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'order onbekend' USING ERRCODE = 'WK006';
    END IF;
    IF v_order.status = 'betaald' THEN
        RAISE EXCEPTION 'al betaald' USING ERRCODE = 'WK007';
    END IF;

    SELECT * INTO v_inst FROM public.winkel_instellingen WHERE organization_id = v_order.organization_id;

    -- Loopt de reservering nog en is er al een poging? Dan dezelfde poging
    -- hergebruiken: een herlaad van de betaalpagina is geen nieuwe poging.
    IF v_order.status = 'wacht' AND v_order.reservering_tot > now() AND v_order.betaalpoging > 0 THEN
        RETURN v_order;
    END IF;

    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'artikel_id', artikel_id, 'moment_id', moment_id,
        'eenheden', eenheden, 'voorraad_eenheden', voorraad_eenheden)), '[]'::jsonb)
      INTO v_regels
      FROM public.winkel_order_regels WHERE order_id = p_order_id;

    -- Past het nog? Onze eigen (verlopen) regels tellen we niet mee.
    PERFORM public.winkel_controleer_capaciteit(v_order.organization_id, v_regels, p_order_id);

    UPDATE public.winkel_orders
       SET status = 'wacht',
           status_reden = NULL,
           reservering_tot = now() + make_interval(mins => COALESCE(v_inst.reservering_minuten, 30)),
           betaalpoging = betaalpoging + 1,
           mypos_order_id = nummer || '-' || (betaalpoging + 1)
     WHERE id = p_order_id
    RETURNING * INTO v_order;

    RETURN v_order;
END $$;


-- ── 11. Betaling bevestigen ─────────────────────────────────────────────────
-- Vanuit het betaalbericht (webhook) of de statuscontrole bij myPOS. Idempotent:
-- een al betaalde order blijft betaald en geeft 'al_betaald' terug. Is de
-- reservering verlopen, dan wordt opnieuw geteld: past het nog, dan alsnog
-- betaald; anders 'mislukt' met reden 'verlopen-en-vol' en refund_status
-- 'nodig' — de route betaalt dan terug.
CREATE OR REPLACE FUNCTION public.winkel_bevestig_betaling(
    p_order_id      BIGINT,
    p_trnref        TEXT,
    p_bedrag_cents  INTEGER,
    p_methode       TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
    v_order  public.winkel_orders%ROWTYPE;
    v_regels JSONB;
BEGIN
    SELECT * INTO v_order FROM public.winkel_orders WHERE id = p_order_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN 'onbekend';
    END IF;
    IF v_order.status = 'betaald' THEN
        RETURN 'al_betaald';
    END IF;

    IF v_order.status <> 'wacht' OR v_order.reservering_tot <= now() THEN
        SELECT COALESCE(jsonb_agg(jsonb_build_object(
            'artikel_id', artikel_id, 'moment_id', moment_id,
            'eenheden', eenheden, 'voorraad_eenheden', voorraad_eenheden)), '[]'::jsonb)
          INTO v_regels
          FROM public.winkel_order_regels WHERE order_id = p_order_id;
        BEGIN
            PERFORM public.winkel_controleer_capaciteit(v_order.organization_id, v_regels, p_order_id);
        EXCEPTION WHEN SQLSTATE 'WK001' OR SQLSTATE 'WK002' OR SQLSTATE 'WK003' OR SQLSTATE 'WK004' THEN
            UPDATE public.winkel_orders
               SET status = 'mislukt', status_reden = 'verlopen-en-vol',
                   mypos_trnref = p_trnref, betaald_cents = p_bedrag_cents, betaalmethode = p_methode,
                   refund_status = 'nodig'
             WHERE id = p_order_id;
            RETURN 'vol';
        END;
    END IF;

    UPDATE public.winkel_orders
       SET status = 'betaald', status_reden = NULL,
           mypos_trnref = p_trnref, betaald_cents = p_bedrag_cents, betaald_at = now(), betaalmethode = p_methode
     WHERE id = p_order_id;
    RETURN 'betaald';
END $$;


-- ── 12. Rechten en RLS ──────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION public.winkel_plaats_order(UUID, TEXT, TEXT, TEXT, UUID, TEXT, TEXT, TEXT, JSONB, TEXT, INTEGER, INTEGER, INTEGER, JSONB, TEXT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.winkel_plaats_order(UUID, TEXT, TEXT, TEXT, UUID, TEXT, TEXT, TEXT, JSONB, TEXT, INTEGER, INTEGER, INTEGER, JSONB, TEXT, JSONB) TO service_role;
REVOKE ALL ON FUNCTION public.winkel_start_betaalpoging(BIGINT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.winkel_start_betaalpoging(BIGINT) TO service_role;
REVOKE ALL ON FUNCTION public.winkel_bevestig_betaling(BIGINT, TEXT, INTEGER, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.winkel_bevestig_betaling(BIGINT, TEXT, INTEGER, TEXT) TO service_role;
REVOKE ALL ON FUNCTION public.winkel_controleer_capaciteit(UUID, JSONB, BIGINT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.winkel_controleer_capaciteit(UUID, JSONB, BIGINT) TO service_role;

ALTER TABLE public.winkel_instellingen    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.winkel_artikelen       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.winkel_momenten        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.winkel_orders          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.winkel_order_regels    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.winkel_betaalberichten ENABLE ROW LEVEL SECURITY;

-- Operator-CRUD via authenticated; de publieke routes gebruiken de service-role
-- client (geen TO anon-policy — in deze repo een anti-patroon).
DO $$
DECLARE
    t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY['winkel_instellingen','winkel_artikelen','winkel_momenten','winkel_orders','winkel_order_regels','winkel_betaalberichten']
    LOOP
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


-- ── 13. Verificatie ─────────────────────────────────────────────────────────
--   SELECT tablename, count(*) FROM pg_policies WHERE tablename LIKE 'winkel_%' GROUP BY 1;
--   -- Verwacht: 4 per tabel, zes tabellen.
--
-- Er gaat GEEN voorbeelddata mee. De artikelen voor Hop & Bites staan in
-- scripts/winkel-seed-hop-en-bites.sql — alleen wat vaststaat, de rest leeg.
