-- ════════════════════════════════════════════════════════════════════════════
--  Sinterklaas 2026 — pakketten als template met slots, producten met
--  voorraad, twee betaalwijzen, btw-verdeling per regel
--  Plan: docs/sinterklaas-bouwplan.md §1 · Opdracht: docs/OVERDRACHT-BBQ-ARCHITECT-SINTERKLAAS.md
-- ════════════════════════════════════════════════════════════════════════════
--
--  Alles additief. Bestaande orders krijgen betaalwijze 'volledig' en hun
--  totaal als nu_te_betalen; bestaande artikelen hebben geen slots en werken
--  precies zoals voorheen.
--
--  Vijf ideeën:
--    1. Een product (bier, worst, amandelen) is wat er in een pakket of op een
--       plank ligt. Voorraad NULL = niet bijgehouden en blokkeert nooit.
--    2. Een artikel kan slots hebben: per slot een type, een hoeveelheid en
--       (als hij ingevuld is) een product. Zonder product in elk slot is het
--       artikel niet verkoopbaar. De plank is hetzelfde model, per persoon.
--    3. Bij het plaatsen wordt de inhoud van elke regel vastgelegd
--       (componenten). Daarop wordt gereserveerd en ingepakt — een latere
--       wissel in het template raakt bestaande orders niet.
--    4. Twee betaalwijzen: volledig, of een reservering (€ 2,50 per order) nu
--       en de rest in de winkel. Status blijft 'betaald' zodra de online
--       betaling binnen is; 'rest betaald' is rest_betaald_at.
--    5. Btw per regel verdeeld over 9 en 21 (naar rato, of overschreven).


-- ── 0. Pre-flight ───────────────────────────────────────────────────────────
DO $$
BEGIN
    IF to_regclass('public.winkel_artikelen') IS NULL
       OR to_regclass('public.winkel_orders') IS NULL
       OR to_regclass('public.winkel_order_regels') IS NULL
       OR to_regclass('public.winkel_momenten') IS NULL
       OR to_regclass('public.winkel_instellingen') IS NULL THEN
        RAISE EXCEPTION 'winkel_sinterklaas: de winkel_-tabellen ontbreken (migratie 20260913120000_winkel_kassa)';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'winkel_order_regels' AND column_name = 'klaar_op') THEN
        RAISE EXCEPTION 'winkel_sinterklaas: winkel_order_regels.klaar_op ontbreekt (migratie 20260925120000_winkel_vakjes)';
    END IF;
    IF to_regprocedure('private.user_org_ids()') IS NULL THEN
        RAISE EXCEPTION 'winkel_sinterklaas: functie private.user_org_ids() ontbreekt';
    END IF;
END $$;


-- ── 1. winkel_producten ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.winkel_producten (
    id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id         UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,

    naam                    TEXT        NOT NULL,
    type                    TEXT        NOT NULL CHECK (type IN ('bier','wijn','worst','amandelen','crackers','marmelade','doos','vleeswaar','kaas','zuur','krokant','verpakking','overig')),
    omschrijving            TEXT,
    foto_url                TEXT,

    -- Prijzen gelden per prijs_per eenheden: een fles per 1 stuk, amandelen per 100 gram.
    eenheid                 TEXT        NOT NULL DEFAULT 'stuk' CHECK (eenheid IN ('stuk', 'gram')),
    prijs_per               NUMERIC     NOT NULL DEFAULT 1 CHECK (prijs_per > 0),
    winkelprijs_incl_cents  INTEGER     CHECK (winkelprijs_incl_cents IS NULL OR winkelprijs_incl_cents >= 0),
    inkoop_excl_cents       INTEGER     CHECK (inkoop_excl_cents IS NULL OR inkoop_excl_cents >= 0),
    btw_pct                 INTEGER     NOT NULL DEFAULT 9 CHECK (btw_pct IN (0, 9, 21)),

    herkomst                TEXT        CHECK (herkomst IS NULL OR herkomst IN ('lokaal', 'groothandel', 'mr_hop', 'eigen')),
    alcohol                 BOOLEAN     NOT NULL DEFAULT false,
    -- Voor de smaakwijzer (fase 2). Nu leeg.
    smaakprofiel            JSONB,
    hop_and_bites_tip       BOOLEAN     NOT NULL DEFAULT false,

    -- NULL = niet bijgehouden: blokkeert nooit. Een getal = harde grens op
    -- gereserveerd + besteld (in `eenheid`).
    voorraad                NUMERIC     CHECK (voorraad IS NULL OR voorraad >= 0),
    actief                  BOOLEAN     NOT NULL DEFAULT true,

    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.winkel_producten IS
    'Wat er in een pakket of op een plank ligt: bier, wijn, worst, amandelen, doos. Prijzen per prijs_per eenheden; voorraad NULL = niet bijgehouden.';
CREATE INDEX IF NOT EXISTS winkel_producten_org_idx ON public.winkel_producten(organization_id, type);


-- ── 2. winkel_artikel_slots — het template ──────────────────────────────────
CREATE TABLE IF NOT EXISTS public.winkel_artikel_slots (
    id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id         UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    artikel_id              UUID        NOT NULL REFERENCES public.winkel_artikelen(id) ON DELETE CASCADE,
    volgorde                INTEGER     NOT NULL DEFAULT 0,

    slot_type               TEXT        NOT NULL CHECK (slot_type IN ('bier','wijn','worst','amandelen','crackers','marmelade','doos','vleeswaar','kaas','zuur','krokant','verpakking','overig')),
    -- Zoals het op de inpaklijst staat: "Droge worst, soort 1", "Bijzonder bier (Mr. Hop)".
    naam                    TEXT        NOT NULL,
    hoeveelheid             NUMERIC     NOT NULL CHECK (hoeveelheid > 0),
    eenheid                 TEXT        NOT NULL DEFAULT 'stuk' CHECK (eenheid IN ('stuk', 'gram')),
    -- 'stuk' = per besteld pakket; 'persoon' = per persoon (de plank).
    per                     TEXT        NOT NULL DEFAULT 'stuk' CHECK (per IN ('stuk', 'persoon')),

    standaard_product_id    UUID        REFERENCES public.winkel_producten(id) ON DELETE SET NULL,
    -- Fase 2: wisselen. Nu overal false en leeg.
    wisselbaar              BOOLEAN     NOT NULL DEFAULT false,
    alternatieven           UUID[]      NOT NULL DEFAULT '{}',

    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.winkel_artikel_slots IS
    'Het template van een artikel: per slot een type, hoeveelheid en (als ingevuld) een product. Zonder product in elk slot is het artikel niet verkoopbaar. per = persoon voor de plank.';
CREATE INDEX IF NOT EXISTS winkel_artikel_slots_artikel_idx ON public.winkel_artikel_slots(artikel_id, volgorde);


-- ── 3. winkel_artikelen — segment, 18+, schalen, btw-verdeling, verpakking ──
ALTER TABLE public.winkel_artikelen
    ADD COLUMN IF NOT EXISTS segment                 TEXT    CHECK (segment IS NULL OR segment IN ('bier', 'wijn', 'combi')),
    ADD COLUMN IF NOT EXISTS vast                    BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS alcohol                 BOOLEAN NOT NULL DEFAULT false,
    -- Personen worden voor de productie over schalen verdeeld: klein 2–3, groot 4–5, nooit 1.
    ADD COLUMN IF NOT EXISTS schaal_verdeling        BOOLEAN NOT NULL DEFAULT false,
    -- Overschrijving van de naar-rato-splitsing: {"9": 30.2, "21": 69.8} (procenten, samen 100).
    ADD COLUMN IF NOT EXISTS btw_verdeling           JSONB,
    -- Verpakkingsbudget incl. btw, alleen voor de marge. Nooit voor de klant.
    ADD COLUMN IF NOT EXISTS verpakking_klein_cents  INTEGER CHECK (verpakking_klein_cents IS NULL OR verpakking_klein_cents >= 0),
    ADD COLUMN IF NOT EXISTS verpakking_groot_cents  INTEGER CHECK (verpakking_groot_cents IS NULL OR verpakking_groot_cents >= 0);
COMMENT ON COLUMN public.winkel_artikelen.alcohol IS '18+: markering op order, mail en etiket voor de balie.';
COMMENT ON COLUMN public.winkel_artikelen.btw_verdeling IS 'Overschrijving van de naar-rato-btw-splitsing, procenten per tarief. NULL = naar rato van de winkelwaarde van de componenten; zonder componenten alles op btw_pct.';


-- ── 4. winkel_order_regel_componenten — de inhoud, vastgelegd bij plaatsen ──
CREATE TABLE IF NOT EXISTS public.winkel_order_regel_componenten (
    id                  BIGSERIAL   PRIMARY KEY,
    organization_id     UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    order_regel_id      BIGINT      NOT NULL REFERENCES public.winkel_order_regels(id) ON DELETE CASCADE,
    product_id          UUID        REFERENCES public.winkel_producten(id) ON DELETE SET NULL,
    slot_type           TEXT        NOT NULL,
    naam                TEXT        NOT NULL,
    hoeveelheid         NUMERIC     NOT NULL CHECK (hoeveelheid > 0),
    eenheid             TEXT        NOT NULL DEFAULT 'stuk' CHECK (eenheid IN ('stuk', 'gram')),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.winkel_order_regel_componenten IS
    'Per orderregel de inhoud (slots × aantal) zoals die bij het plaatsen was. Hierop wordt productvoorraad gereserveerd en ingepakt; een latere wissel in het template raakt dit niet.';
CREATE INDEX IF NOT EXISTS winkel_orc_regel_idx   ON public.winkel_order_regel_componenten(order_regel_id);
CREATE INDEX IF NOT EXISTS winkel_orc_product_idx ON public.winkel_order_regel_componenten(product_id) WHERE product_id IS NOT NULL;


-- ── 5. winkel_order_regels — btw per tarief ─────────────────────────────────
ALTER TABLE public.winkel_order_regels
    ADD COLUMN IF NOT EXISTS btw_cents JSONB,
    -- 18+ op het moment van bestellen (artikel of een component met alcohol).
    ADD COLUMN IF NOT EXISTS alcohol   BOOLEAN NOT NULL DEFAULT false;
COMMENT ON COLUMN public.winkel_order_regels.btw_cents IS
    'Btw van deze regel per tarief, in centen: {"9": 312, "21": 424}. Telt op tot het btw-deel van bedrag_cents. NULL bij oude regels = alles op btw_pct.';


-- ── 6. winkel_orders — twee betaalwijzen ────────────────────────────────────
ALTER TABLE public.winkel_orders
    ADD COLUMN IF NOT EXISTS betaalwijze          TEXT        NOT NULL DEFAULT 'volledig' CHECK (betaalwijze IN ('volledig', 'reservering')),
    -- Wat naar myPOS gaat: het totaal, of het reserveringsbedrag.
    ADD COLUMN IF NOT EXISTS nu_te_betalen_cents  INTEGER     CHECK (nu_te_betalen_cents IS NULL OR nu_te_betalen_cents >= 0),
    -- Wat in de winkel betaald wordt bij afhalen (0 bij volledig).
    ADD COLUMN IF NOT EXISTS rest_cents           INTEGER     NOT NULL DEFAULT 0 CHECK (rest_cents >= 0),
    ADD COLUMN IF NOT EXISTS rest_betaald_at      TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS rest_betaalmethode   TEXT        CHECK (rest_betaalmethode IS NULL OR rest_betaalmethode IN ('contant', 'pin'));
UPDATE public.winkel_orders SET nu_te_betalen_cents = totaal_cents WHERE nu_te_betalen_cents IS NULL;
ALTER TABLE public.winkel_orders ALTER COLUMN nu_te_betalen_cents SET NOT NULL;
COMMENT ON COLUMN public.winkel_orders.betaalwijze IS
    'volledig = alles online; reservering = het reserveringsbedrag online, de rest in de winkel. Status wordt in beide gevallen betaald zodra myPOS het online deel bevestigt.';


-- ── 7. winkel_momenten — onbeperkt en een deadline met tijd ─────────────────
ALTER TABLE public.winkel_momenten ALTER COLUMN capaciteit DROP NOT NULL;
ALTER TABLE public.winkel_momenten ADD COLUMN IF NOT EXISTS sluit_op TIMESTAMPTZ;
COMMENT ON COLUMN public.winkel_momenten.capaciteit IS
    'Capaciteit in eenheden (zie capaciteit_soort van de artikelen in de groep). NULL = onbeperkt.';
COMMENT ON COLUMN public.winkel_momenten.sluit_op IS
    'Besteldeadline met tijd. Daarna staat het moment niet meer in GET momenten en geeft een order moment-verlopen. Naast bestellen_tot (alleen een dag).';


-- ── 8. winkel_instellingen — reservering en QR ──────────────────────────────
ALTER TABLE public.winkel_instellingen
    ADD COLUMN IF NOT EXISTS reservering_bedrag_cents INTEGER CHECK (reservering_bedrag_cents IS NULL OR reservering_bedrag_cents > 0),
    ADD COLUMN IF NOT EXISTS qr_basis_url             TEXT;
COMMENT ON COLUMN public.winkel_instellingen.reservering_bedrag_cents IS
    'Het reserveringsbedrag per order bij betaalwijze reservering. NULL = reservering staat uit.';
COMMENT ON COLUMN public.winkel_instellingen.qr_basis_url IS
    'Basis-URL van de Experience-app voor de QR op het etiket: {qr_basis_url}/sint?artikel=<slug>&order=<nummer>. BBQ Architect maakt geen token.';


-- ── 8b. print_jobs — het winkel-etiket als printsoort ───────────────────────
DO $$
BEGIN
    IF to_regclass('public.print_jobs') IS NOT NULL THEN
        ALTER TABLE public.print_jobs DROP CONSTRAINT IF EXISTS print_jobs_soort_check;
        ALTER TABLE public.print_jobs ADD CONSTRAINT print_jobs_soort_check
            CHECK (soort IN ('partij_labels', 'herprint', 'los_label', 'testlabel', 'doos_sticker', 'haccp_sticker', 'winkel_etiket'));
    END IF;
END $$;


-- ── 9. Triggers ─────────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_winkel_producten_updated_at ON public.winkel_producten;
CREATE TRIGGER trg_winkel_producten_updated_at BEFORE UPDATE ON public.winkel_producten
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS trg_winkel_artikel_slots_updated_at ON public.winkel_artikel_slots;
CREATE TRIGGER trg_winkel_artikel_slots_updated_at BEFORE UPDATE ON public.winkel_artikel_slots
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- ── 10. Bezetting van een product ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.winkel_bezetting_product(p_product_id UUID, p_zonder_order BIGINT DEFAULT NULL)
RETURNS NUMERIC
LANGUAGE sql
STABLE
AS $$
    SELECT COALESCE(SUM(c.hoeveelheid), 0)::NUMERIC
    FROM public.winkel_order_regel_componenten c
    JOIN public.winkel_order_regels r ON r.id = c.order_regel_id
    JOIN public.winkel_orders o ON o.id = r.order_id
    WHERE c.product_id = p_product_id
      AND (p_zonder_order IS NULL OR o.id <> p_zonder_order)
      AND (o.status = 'betaald' OR (o.status = 'wacht' AND o.reservering_tot > now()));
$$;
REVOKE ALL ON FUNCTION public.winkel_bezetting_product(UUID, BIGINT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.winkel_bezetting_product(UUID, BIGINT) TO service_role;


-- ── 11. Capaciteit controleren onder vergrendeling ──────────────────────────
--   WK001  moment vol
--   WK002  voorraad op (artikel)
--   WK003  moment onbekend of niet meer actief
--   WK004  artikel onbekend of niet meer actief
--   WK008  groep vol (alleen als winkel_groepen bestaat — blok A7)
--   WK009  product op (een component van een pakket of plank)
--
-- p_regels: [{artikel_id, moment_id, eenheden, voorraad_eenheden,
--             componenten: [{product_id, hoeveelheid}]}]
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
    v_product_id UUID;
    v_groep      TEXT;
    v_nodig      NUMERIC;
    v_max        INTEGER;
    v_bezet      NUMERIC;
    v_moment     public.winkel_momenten%ROWTYPE;
    v_artikel    public.winkel_artikelen%ROWTYPE;
    v_product    public.winkel_producten%ROWTYPE;
BEGIN
    -- Vergrendelen in id-volgorde.
    PERFORM 1 FROM public.winkel_momenten
     WHERE id IN (SELECT (r->>'moment_id')::UUID FROM jsonb_array_elements(p_regels) r WHERE r->>'moment_id' IS NOT NULL)
     ORDER BY id FOR UPDATE;
    PERFORM 1 FROM public.winkel_artikelen
     WHERE id IN (SELECT (r->>'artikel_id')::UUID FROM jsonb_array_elements(p_regels) r)
     ORDER BY id FOR UPDATE;
    PERFORM 1 FROM public.winkel_producten
     WHERE id IN (SELECT (c->>'product_id')::UUID
                    FROM jsonb_array_elements(p_regels) r, jsonb_array_elements(COALESCE(r->'componenten', '[]'::jsonb)) c
                   WHERE c->>'product_id' IS NOT NULL)
     ORDER BY id FOR UPDATE;

    -- Momenten: som van de eenheden per moment moet passen — als er een grens is.
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
        IF v_moment.capaciteit IS NOT NULL
           AND public.winkel_bezetting_moment(v_moment_id, p_zonder_order) + v_nodig > v_moment.capaciteit THEN
            RAISE EXCEPTION 'moment vol' USING ERRCODE = 'WK001';
        END IF;
    END LOOP;

    -- Kassa-voorraad per artikel: alleen artikelen met een voorraadgetal.
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

    -- Productvoorraad: de componenten van pakketten en planken, alleen
    -- producten met een voorraadgetal (NULL = niet bijgehouden).
    FOR v_product_id, v_nodig IN
        SELECT (c->>'product_id')::UUID, SUM((c->>'hoeveelheid')::NUMERIC)
        FROM jsonb_array_elements(p_regels) r, jsonb_array_elements(COALESCE(r->'componenten', '[]'::jsonb)) c
        WHERE c->>'product_id' IS NOT NULL
        GROUP BY 1
    LOOP
        SELECT * INTO v_product FROM public.winkel_producten
         WHERE id = v_product_id AND organization_id = p_organization_id;
        IF FOUND AND v_product.voorraad IS NOT NULL
           AND public.winkel_bezetting_product(v_product_id, p_zonder_order) + v_nodig > v_product.voorraad THEN
            RAISE EXCEPTION 'product op: %', v_product.naam USING ERRCODE = 'WK009';
        END IF;
    END LOOP;

    -- Groepstotaal (blok A7, winkel_groepen): alleen als die tabel bestaat.
    -- Dynamisch, zodat deze functie ook zonder A7 aan te maken is en A7 er
    -- later zonder verlies overheen kan.
    IF to_regclass('public.winkel_groepen') IS NOT NULL THEN
        FOR v_groep, v_nodig IN
            SELECT a.moment_groep, SUM((r->>'aantal')::INTEGER)
            FROM jsonb_array_elements(p_regels) r
            JOIN public.winkel_artikelen a ON a.id = (r->>'artikel_id')::UUID
            WHERE a.moment_groep IS NOT NULL AND r->>'aantal' IS NOT NULL
            GROUP BY 1
        LOOP
            EXECUTE 'SELECT max_aantal FROM public.winkel_groepen WHERE organization_id = $1 AND groep = $2'
               INTO v_max USING p_organization_id, v_groep;
            IF v_max IS NOT NULL THEN
                EXECUTE 'SELECT COALESCE(SUM(r.aantal), 0) FROM public.winkel_order_regels r
                           JOIN public.winkel_orders o ON o.id = r.order_id
                           JOIN public.winkel_artikelen a ON a.id = r.artikel_id
                          WHERE o.organization_id = $1 AND a.moment_groep = $2
                            AND ($3 IS NULL OR o.id <> $3)
                            AND (o.status = ''betaald'' OR (o.status = ''wacht'' AND o.reservering_tot > now()))'
                   INTO v_bezet USING p_organization_id, v_groep, p_zonder_order;
                IF v_bezet + v_nodig > v_max THEN
                    RAISE EXCEPTION 'groep vol' USING ERRCODE = 'WK008';
                END IF;
            END IF;
        END LOOP;
    END IF;
END $$;
REVOKE ALL ON FUNCTION public.winkel_controleer_capaciteit(UUID, JSONB, BIGINT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.winkel_controleer_capaciteit(UUID, JSONB, BIGINT) TO service_role;


-- ── 12. De regels van een order als JSON voor de hercontrole ────────────────
CREATE OR REPLACE FUNCTION public.winkel_regels_json(p_order_id BIGINT)
RETURNS JSONB
LANGUAGE sql
STABLE
AS $$
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'artikel_id', r.artikel_id, 'moment_id', r.moment_id, 'aantal', r.aantal,
        'eenheden', r.eenheden, 'voorraad_eenheden', r.voorraad_eenheden,
        'componenten', COALESCE((
            SELECT jsonb_agg(jsonb_build_object('product_id', c.product_id, 'hoeveelheid', c.hoeveelheid))
              FROM public.winkel_order_regel_componenten c WHERE c.order_regel_id = r.id AND c.product_id IS NOT NULL
        ), '[]'::jsonb)
    )), '[]'::jsonb)
    FROM public.winkel_order_regels r WHERE r.order_id = p_order_id;
$$;
REVOKE ALL ON FUNCTION public.winkel_regels_json(BIGINT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.winkel_regels_json(BIGINT) TO service_role;


-- ── 13. Order plaatsen ──────────────────────────────────────────────────────
-- De oude signatuur weg: twee overloads met dezelfde namen zou PostgREST niet
-- kunnen kiezen.
DROP FUNCTION IF EXISTS public.winkel_plaats_order(UUID, TEXT, TEXT, TEXT, UUID, TEXT, TEXT, TEXT, JSONB, TEXT, INTEGER, INTEGER, INTEGER, JSONB, TEXT, JSONB);

-- p_regels: [{artikel_id, slug, naam, aantal, eenheid, stuk_cents, bedrag_cents,
--             btw_pct, btw_cents, alcohol, moment_id, eenheden, voorraad_eenheden,
--             afhaalmoment_tekst,
--             componenten: [{product_id, slot_type, naam, hoeveelheid, eenheid}]}]
CREATE OR REPLACE FUNCTION public.winkel_plaats_order(
    p_organization_id     UUID,
    p_sleutel             TEXT,
    p_token               TEXT,
    p_leverwijze          TEXT,
    p_moment_id           UUID,
    p_contact_naam        TEXT,
    p_contact_email       TEXT,
    p_contact_telefoon    TEXT,
    p_adres               JSONB,
    p_opmerking           TEXT,
    p_subtotaal_cents     INTEGER,
    p_leverkosten_cents   INTEGER,
    p_totaal_cents        INTEGER,
    p_btw_cents           JSONB,
    p_terug_url           TEXT,
    p_regels              JSONB,
    p_betaalwijze         TEXT    DEFAULT 'volledig',
    p_nu_te_betalen_cents INTEGER DEFAULT NULL,
    p_rest_cents          INTEGER DEFAULT 0
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
            INSERT INTO public.winkel_order_regel_componenten (
                organization_id, order_regel_id, product_id, slot_type, naam, hoeveelheid, eenheid
            ) VALUES (
                p_organization_id, v_regel_id, (c->>'product_id')::UUID, COALESCE(c->>'slot_type', 'overig'),
                COALESCE(c->>'naam', ''), (c->>'hoeveelheid')::NUMERIC, COALESCE(c->>'eenheid', 'stuk')
            );
        END LOOP;
    END LOOP;

    RETURN v_order;
END $$;
REVOKE ALL ON FUNCTION public.winkel_plaats_order(UUID, TEXT, TEXT, TEXT, UUID, TEXT, TEXT, TEXT, JSONB, TEXT, INTEGER, INTEGER, INTEGER, JSONB, TEXT, JSONB, TEXT, INTEGER, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.winkel_plaats_order(UUID, TEXT, TEXT, TEXT, UUID, TEXT, TEXT, TEXT, JSONB, TEXT, INTEGER, INTEGER, INTEGER, JSONB, TEXT, JSONB, TEXT, INTEGER, INTEGER) TO service_role;


-- ── 14. Betaalpoging en bevestiging: hercontrole mét componenten ────────────
CREATE OR REPLACE FUNCTION public.winkel_start_betaalpoging(p_order_id BIGINT)
RETURNS public.winkel_orders
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
    v_order  public.winkel_orders%ROWTYPE;
    v_inst   public.winkel_instellingen%ROWTYPE;
BEGIN
    SELECT * INTO v_order FROM public.winkel_orders WHERE id = p_order_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'order onbekend' USING ERRCODE = 'WK006';
    END IF;
    IF v_order.status = 'betaald' THEN
        RAISE EXCEPTION 'al betaald' USING ERRCODE = 'WK007';
    END IF;

    SELECT * INTO v_inst FROM public.winkel_instellingen WHERE organization_id = v_order.organization_id;

    IF v_order.status = 'wacht' AND v_order.reservering_tot > now() AND v_order.betaalpoging > 0 THEN
        RETURN v_order;
    END IF;

    PERFORM public.winkel_controleer_capaciteit(v_order.organization_id, public.winkel_regels_json(p_order_id), p_order_id);

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
BEGIN
    SELECT * INTO v_order FROM public.winkel_orders WHERE id = p_order_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN 'onbekend';
    END IF;
    IF v_order.status = 'betaald' THEN
        RETURN 'al_betaald';
    END IF;

    IF v_order.status <> 'wacht' OR v_order.reservering_tot <= now() THEN
        BEGIN
            PERFORM public.winkel_controleer_capaciteit(v_order.organization_id, public.winkel_regels_json(p_order_id), p_order_id);
        EXCEPTION WHEN SQLSTATE 'WK001' OR SQLSTATE 'WK002' OR SQLSTATE 'WK003' OR SQLSTATE 'WK004' OR SQLSTATE 'WK008' OR SQLSTATE 'WK009' THEN
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


-- ── 15. De balie: het restbedrag boeken ─────────────────────────────────────
-- Idempotent: een tweede keer boeken verandert niets en geeft 'al_geboekt'.
CREATE OR REPLACE FUNCTION public.winkel_boek_rest(p_order_id BIGINT, p_methode TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
    v_order public.winkel_orders%ROWTYPE;
BEGIN
    SELECT * INTO v_order FROM public.winkel_orders WHERE id = p_order_id FOR UPDATE;
    IF NOT FOUND THEN RETURN 'onbekend'; END IF;
    IF v_order.status <> 'betaald' THEN RETURN 'niet_betaald'; END IF;
    IF v_order.rest_betaald_at IS NOT NULL THEN RETURN 'al_geboekt'; END IF;
    IF v_order.rest_cents = 0 THEN RETURN 'geen_rest'; END IF;
    IF p_methode NOT IN ('contant', 'pin') THEN RETURN 'onbekende_methode'; END IF;
    UPDATE public.winkel_orders SET rest_betaald_at = now(), rest_betaalmethode = p_methode WHERE id = p_order_id;
    RETURN 'geboekt';
END $$;
REVOKE ALL ON FUNCTION public.winkel_boek_rest(BIGINT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.winkel_boek_rest(BIGINT, TEXT) TO authenticated, service_role;


-- ── 16. RLS ─────────────────────────────────────────────────────────────────
ALTER TABLE public.winkel_producten                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.winkel_artikel_slots            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.winkel_order_regel_componenten  ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
    t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY['winkel_producten','winkel_artikel_slots','winkel_order_regel_componenten']
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


-- ── 17. Verificatie ─────────────────────────────────────────────────────────
--   SELECT tablename, count(*) FROM pg_policies WHERE tablename IN ('winkel_producten','winkel_artikel_slots','winkel_order_regel_componenten') GROUP BY 1;  -- 4, 4, 4
--   SELECT proname FROM pg_proc WHERE proname LIKE 'winkel_%';  -- plaats_order maar één keer
--   SELECT betaalwijze, nu_te_betalen_cents, totaal_cents FROM winkel_orders LIMIT 5;  -- volledig, gelijk
--
-- Er gaat GEEN voorbeelddata mee. De Sinterklaas-artikelen, slots en producten
-- staan in scripts/winkel-seed-hop-en-bites.mjs — alleen wat vaststaat.
