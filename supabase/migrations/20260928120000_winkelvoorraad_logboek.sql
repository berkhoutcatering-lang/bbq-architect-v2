-- ════════════════════════════════════════════════════════════════════════════
--  Winkelvoorraad W1 — twee plekken, één logboek
--  Plan: docs/voorraad-bouwplan.md §3 · Opdracht: docs/OPDRACHT-BBQ-ARCHITECT-WINKELVOORRAAD.md
-- ════════════════════════════════════════════════════════════════════════════
--
--  Alles additief. inventory blijft zoals hij is (met de hand aangemaakt);
--  stock_movements krijgt twee types en een kolom reden erbij.
--
--  Vijf ideeën:
--    1. Twee plekken, één bedrijf: de makerij (inventory + stock_movements)
--       en de winkel (winkel_producten + winkel_voorraad_mutaties). De view
--       voorraad_logboek leest ze samen als één logboek.
--    2. winkel_producten.voorraad blijft het getal waar de webshop tegen
--       reserveert, maar is voortaan de som van het logboek. Een trigger
--       weigert elke wijziging die niet uit winkel_muteer_voorraad komt.
--    3. Nooit stil op nul: onder nul geeft WV001. Een product dat nog niet
--       wordt bijgehouden (voorraad NULL) kent alleen een telling (WV002).
--    4. Een telling krijgt het getelde getal; het verschil wordt onder de
--       rij-lock uitgerekend. Tekort = manko, overschot = telling_meer.
--       Manko bestaat alleen uit een telling.
--    5. Een overboeking is één transactie: eraf in de keuken, erbij in de
--       winkel (of andersom), in beide logboeken, met eenheden omgerekend
--       via eenheid_factor. Kan dat niet, dan weigert hij (WV004).
--
--  Foutcodes:
--    WV001  onder nul (winkel of keuken)
--    WV002  product wordt nog niet bijgehouden: eerst tellen
--    WV003  voorraadgetal buiten het logboek om gewijzigd
--    WV004  eenheden van keuken en winkel niet om te rekenen
--    WV005  ongeldige mutatie (type, teken of reden klopt niet)


-- ── 0. Pre-flight ───────────────────────────────────────────────────────────
DO $$
BEGIN
    IF to_regclass('public.winkel_producten') IS NULL THEN
        RAISE EXCEPTION 'winkelvoorraad: winkel_producten ontbreekt (migratie 20260927120000_winkel_sinterklaas)';
    END IF;
    IF to_regclass('public.inventory') IS NULL OR to_regclass('public.stock_movements') IS NULL THEN
        RAISE EXCEPTION 'winkelvoorraad: inventory of stock_movements ontbreekt';
    END IF;
    IF to_regclass('public.leveranciers') IS NULL OR to_regclass('public.concept_inkoop_orders') IS NULL THEN
        RAISE EXCEPTION 'winkelvoorraad: leveranciers of concept_inkoop_orders ontbreekt';
    END IF;
    IF to_regprocedure('private.user_org_ids()') IS NULL THEN
        RAISE EXCEPTION 'winkelvoorraad: functie private.user_org_ids() ontbreekt';
    END IF;
    IF to_regprocedure('public.eenheid_factor(text, text)') IS NULL THEN
        RAISE EXCEPTION 'winkelvoorraad: functie eenheid_factor ontbreekt (migratie 20260916130300)';
    END IF;
END $$;


-- ── 1. voorraad_plekken ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.voorraad_plekken (
    id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id  UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    soort            TEXT        NOT NULL CHECK (soort IN ('makerij', 'winkel')),
    naam             TEXT        NOT NULL,
    -- Na hoeveel dagen zonder verkoop of verbruik een product "stil" ligt (W6).
    stil_na_dagen    INTEGER     NOT NULL DEFAULT 180 CHECK (stil_na_dagen > 0),
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (organization_id, soort)
);
COMMENT ON TABLE public.voorraad_plekken IS
    'De twee plekken van één bedrijf: makerij (inventory) en winkel (winkel_producten). Eén per soort per organisatie.';

INSERT INTO public.voorraad_plekken (organization_id, soort, naam)
SELECT organization_id, 'makerij', 'Keuken/makerij' FROM public.winkel_instellingen
ON CONFLICT (organization_id, soort) DO NOTHING;
INSERT INTO public.voorraad_plekken (organization_id, soort, naam)
SELECT organization_id, 'winkel', 'Winkel' FROM public.winkel_instellingen
ON CONFLICT (organization_id, soort) DO NOTHING;


-- ── 2. winkel_producten — koppeling, drempel, kassa, THT ────────────────────
ALTER TABLE public.winkel_producten
    ADD COLUMN IF NOT EXISTS inventory_id         INTEGER     REFERENCES public.inventory(id) ON DELETE SET NULL,
    -- NULL = het voorstel (genoeg voor 5 pakketten) geldt; een getal wint.
    ADD COLUMN IF NOT EXISTS drempel              NUMERIC     CHECK (drempel IS NULL OR drempel >= 0),
    ADD COLUMN IF NOT EXISTS bestel_hoeveelheid   NUMERIC     CHECK (bestel_hoeveelheid IS NULL OR bestel_hoeveelheid > 0),
    ADD COLUMN IF NOT EXISTS leverancier_id       INTEGER     REFERENCES public.leveranciers(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS ean                  TEXT,
    -- De vroegste THT van wat er ligt (W7 maakt dit per ontvangst).
    ADD COLUMN IF NOT EXISTS tht                  DATE,
    -- Laatste verkoop of verbruik: de klok voor "stil" (W6).
    ADD COLUMN IF NOT EXISTS laatste_beweging_at  TIMESTAMPTZ;
COMMENT ON COLUMN public.winkel_producten.voorraad IS
    'De som van winkel_voorraad_mutaties. Alleen te wijzigen via winkel_muteer_voorraad (trigger, WV003). NULL = niet bijgehouden, tot de eerste telling.';
COMMENT ON COLUMN public.winkel_producten.drempel IS
    'Bijna-op-grens in eenheid. NULL = het voorstel: genoeg voor 5 pakketten van het artikel dat het meeste van dit product vraagt.';
CREATE INDEX IF NOT EXISTS winkel_producten_inventory_idx ON public.winkel_producten(inventory_id) WHERE inventory_id IS NOT NULL;


-- ── 3. winkel_voorraad_mutaties — het logboek van de winkel ─────────────────
CREATE TABLE IF NOT EXISTS public.winkel_voorraad_mutaties (
    id                  BIGSERIAL   PRIMARY KEY,
    organization_id     UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    plek_id             UUID        REFERENCES public.voorraad_plekken(id) ON DELETE SET NULL,
    winkel_product_id   UUID        NOT NULL REFERENCES public.winkel_producten(id) ON DELETE CASCADE,

    type                TEXT        NOT NULL CHECK (type IN ('telling', 'ontvangst', 'overboeking', 'verkoop_online', 'verkoop_kassa', 'retour', 'afwijking')),
    reden               TEXT,
    -- In de eenheid van het product (stuk of gram), + of −.
    hoeveelheid         NUMERIC     NOT NULL,
    resultaat           NUMERIC     NOT NULL CHECK (resultaat >= 0),
    -- hoeveelheid × inkoop_excl_cents ÷ prijs_per; NULL als de inkoopprijs onbekend is.
    waarde_cents        INTEGER,
    tht                 DATE,

    order_id            BIGINT      REFERENCES public.winkel_orders(id) ON DELETE SET NULL,
    order_regel_id      BIGINT      REFERENCES public.winkel_order_regels(id) ON DELETE SET NULL,
    inventory_id        INTEGER     REFERENCES public.inventory(id) ON DELETE SET NULL,
    stock_movement_id   BIGINT,
    inkoop_order_id     UUID        REFERENCES public.concept_inkoop_orders(id) ON DELETE SET NULL,

    door_user_id        UUID,
    notitie             TEXT,
    idempotency_key     TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT winkel_mutatie_reden_check CHECK (
           (type = 'afwijking' AND reden IN ('eigen_gebruik', 'proeven', 'derving_breuk', 'derving_tht', 'keuken_verbruik'))
        OR (type = 'telling'   AND (reden IS NULL OR reden IN ('manko', 'telling_meer')))
        OR (type NOT IN ('afwijking', 'telling') AND reden IS NULL)
    )
);
COMMENT ON TABLE public.winkel_voorraad_mutaties IS
    'Het logboek van de winkelvoorraad. Elke verandering is een regel; winkel_producten.voorraad is de som. Alleen te schrijven via winkel_muteer_voorraad. Manko ontstaat alleen uit een telling.';
CREATE INDEX IF NOT EXISTS winkel_mutaties_product_idx ON public.winkel_voorraad_mutaties(winkel_product_id, created_at DESC);
CREATE INDEX IF NOT EXISTS winkel_mutaties_org_idx     ON public.winkel_voorraad_mutaties(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS winkel_mutaties_regel_idx   ON public.winkel_voorraad_mutaties(order_regel_id) WHERE order_regel_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS winkel_mutaties_sleutel_uidx
    ON public.winkel_voorraad_mutaties(organization_id, idempotency_key) WHERE idempotency_key IS NOT NULL;


-- ── 4. stock_movements — overboeking en afwijking, met reden ────────────────
ALTER TABLE public.stock_movements ADD COLUMN IF NOT EXISTS reden TEXT;
COMMENT ON COLUMN public.stock_movements.reden IS
    'Bij type afwijking: eigen_gebruik, proeven, derving_breuk, derving_tht, keuken_verbruik (W5).';

DO $$
DECLARE
    v_def TEXT;
BEGIN
    SELECT pg_get_constraintdef(oid) INTO v_def
      FROM pg_constraint
     WHERE conrelid = 'public.stock_movements'::regclass AND conname = 'stock_movements_type_check';
    IF v_def IS NULL OR position('overboeking' IN v_def) = 0 THEN
        ALTER TABLE public.stock_movements DROP CONSTRAINT IF EXISTS stock_movements_type_check;
        ALTER TABLE public.stock_movements ADD CONSTRAINT stock_movements_type_check
            CHECK (type IN ('count', 'usage', 'receive', 'adjust', 'waste', 'productie', 'overboeking', 'afwijking'));
    END IF;
END $$;


-- ── 5. Het getal alleen via het logboek ─────────────────────────────────────
CREATE OR REPLACE FUNCTION public.winkel_voorraad_bewaken()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF COALESCE(current_setting('app.winkel_logboek', true), '') = 'aan' THEN
        RETURN NEW;
    END IF;
    IF TG_OP = 'INSERT' AND NEW.voorraad IS NOT NULL THEN
        RAISE EXCEPTION 'een nieuw product begint zonder voorraad; tel het daarna' USING ERRCODE = 'WV003';
    END IF;
    IF TG_OP = 'UPDATE' AND NEW.voorraad IS DISTINCT FROM OLD.voorraad THEN
        RAISE EXCEPTION 'voorraad van % alleen via het logboek (tellen, ontvangst, overboeken)', OLD.naam USING ERRCODE = 'WV003';
    END IF;
    RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_winkel_voorraad_bewaken ON public.winkel_producten;
CREATE TRIGGER trg_winkel_voorraad_bewaken BEFORE INSERT OR UPDATE OF voorraad ON public.winkel_producten
    FOR EACH ROW EXECUTE FUNCTION public.winkel_voorraad_bewaken();


-- ── 6. winkel_muteer_voorraad ───────────────────────────────────────────────
-- p_hoeveelheid: bij telling het getelde getal (≥ 0), anders de verandering
-- met teken. ontvangst en retour > 0; verkoop en afwijking < 0; overboeking
-- beide, maar alleen vanuit voorraad_overboeken.
--
-- Geeft {mutatie: {...}, voorraad: n, bestond: bool}.
CREATE OR REPLACE FUNCTION public.winkel_muteer_voorraad(
    p_org                UUID,
    p_product_id         UUID,
    p_type               TEXT,
    p_hoeveelheid        NUMERIC,
    p_reden              TEXT    DEFAULT NULL,
    p_notitie            TEXT    DEFAULT NULL,
    p_order_id           BIGINT  DEFAULT NULL,
    p_order_regel_id     BIGINT  DEFAULT NULL,
    p_tht                DATE    DEFAULT NULL,
    p_inkoop_excl_cents  INTEGER DEFAULT NULL,
    p_inkoop_order_id    UUID    DEFAULT NULL,
    p_idempotency_key    TEXT    DEFAULT NULL,
    p_inventory_id       INTEGER DEFAULT NULL,
    p_stock_movement_id  BIGINT  DEFAULT NULL,
    p_door_user_id       UUID    DEFAULT NULL
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
    -- tenant-guard, identiek aan increment_inventory_stock
    IF auth.uid() IS NOT NULL AND p_org NOT IN (SELECT private.user_org_ids()) THEN
        RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
    END IF;

    IF p_type = 'overboeking' AND COALESCE(current_setting('app.winkel_overboeking', true), '') <> 'aan' THEN
        RAISE EXCEPTION 'een overboeking loopt via voorraad_overboeken' USING ERRCODE = 'WV005';
    END IF;
    IF p_hoeveelheid IS NULL
       OR (p_type = 'telling'                          AND p_hoeveelheid < 0)
       OR (p_type IN ('ontvangst', 'retour')           AND p_hoeveelheid <= 0)
       OR (p_type IN ('verkoop_online', 'verkoop_kassa', 'afwijking') AND p_hoeveelheid >= 0)
       OR (p_type = 'overboeking'                      AND p_hoeveelheid = 0) THEN
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
           laatste_beweging_at = CASE
               WHEN p_type IN ('verkoop_online', 'verkoop_kassa')
                 OR (p_type = 'afwijking' AND v_reden = 'keuken_verbruik')
                 OR (p_type = 'overboeking' AND v_delta < 0)
               THEN now() ELSE laatste_beweging_at END
     WHERE id = p_product_id;
    PERFORM set_config('app.winkel_logboek', '', true);

    SELECT id INTO v_plek FROM public.voorraad_plekken WHERE organization_id = p_org AND soort = 'winkel';

    INSERT INTO public.winkel_voorraad_mutaties (
        organization_id, plek_id, winkel_product_id, type, reden, hoeveelheid, resultaat, waarde_cents, tht,
        order_id, order_regel_id, inventory_id, stock_movement_id, inkoop_order_id,
        door_user_id, notitie, idempotency_key
    ) VALUES (
        p_org, v_plek, p_product_id, p_type, v_reden, v_delta, v_nieuw,
        CASE WHEN v_inkoop IS NULL THEN NULL ELSE round(v_delta * v_inkoop / v_product.prijs_per)::INTEGER END,
        p_tht, p_order_id, p_order_regel_id, p_inventory_id, p_stock_movement_id, p_inkoop_order_id,
        v_uid, NULLIF(btrim(COALESCE(p_notitie, '')), ''), p_idempotency_key
    )
    RETURNING * INTO v_mutatie;

    RETURN jsonb_build_object('mutatie', to_jsonb(v_mutatie), 'voorraad', v_nieuw, 'bestond', false);
END $$;
REVOKE ALL ON FUNCTION public.winkel_muteer_voorraad(UUID, UUID, TEXT, NUMERIC, TEXT, TEXT, BIGINT, BIGINT, DATE, INTEGER, UUID, TEXT, INTEGER, BIGINT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.winkel_muteer_voorraad(UUID, UUID, TEXT, NUMERIC, TEXT, TEXT, BIGINT, BIGINT, DATE, INTEGER, UUID, TEXT, INTEGER, BIGINT, UUID) TO authenticated, service_role;


-- ── 7. Eenheden van keuken naar winkel ──────────────────────────────────────
-- Hoeveel keuken-eenheden zit er in één winkel-eenheid? NULL = niet om te
-- rekenen (dan weigert de overboeking). Een pot, fles of bakje is één stuk.
CREATE OR REPLACE FUNCTION public.winkel_keuken_factor(p_winkel_eenheid TEXT, p_keuken_eenheid TEXT)
RETURNS NUMERIC
LANGUAGE sql
IMMUTABLE
AS $$
    SELECT CASE
        WHEN p_winkel_eenheid = 'gram' THEN public.eenheid_factor('g', lower(btrim(COALESCE(p_keuken_eenheid, ''))))
        WHEN p_winkel_eenheid = 'stuk' AND lower(btrim(COALESCE(p_keuken_eenheid, ''))) IN ('stuk', 'stuks', 'st', 'pot', 'potten', 'fles', 'flessen', 'bakje', 'bakjes', 'zak', 'zakken', 'blik', 'doos') THEN 1
        ELSE NULL
    END;
$$;


-- ── 8. voorraad_overboeken ──────────────────────────────────────────────────
-- p_hoeveelheid in de eenheid van het winkelproduct, > 0.
-- p_richting 'naar_winkel' = keuken eraf, winkel erbij; 'naar_keuken' andersom.
CREATE OR REPLACE FUNCTION public.voorraad_overboeken(
    p_org              UUID,
    p_inventory_id     INTEGER,
    p_product_id       UUID,
    p_hoeveelheid      NUMERIC,
    p_richting         TEXT DEFAULT 'naar_winkel',
    p_notitie          TEXT DEFAULT NULL,
    p_idempotency_key  TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_uid        UUID := auth.uid();
    v_inv        RECORD;
    v_product    public.winkel_producten%ROWTYPE;
    v_bestaand   public.winkel_voorraad_mutaties%ROWTYPE;
    v_factor     NUMERIC;
    v_keuken     NUMERIC;
    v_keuken_na  NUMERIC;
    v_move_id    BIGINT;
    v_winkel     JSONB;
BEGIN
    IF v_uid IS NOT NULL AND p_org NOT IN (SELECT private.user_org_ids()) THEN
        RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
    END IF;
    IF p_hoeveelheid IS NULL OR p_hoeveelheid <= 0 THEN
        RAISE EXCEPTION 'overboeken: hoeveelheid moet > 0 zijn' USING ERRCODE = 'WV005';
    END IF;
    IF p_richting NOT IN ('naar_winkel', 'naar_keuken') THEN
        RAISE EXCEPTION 'overboeken: richting naar_winkel of naar_keuken' USING ERRCODE = 'WV005';
    END IF;

    IF p_idempotency_key IS NOT NULL THEN
        SELECT * INTO v_bestaand FROM public.winkel_voorraad_mutaties
         WHERE organization_id = p_org AND idempotency_key = p_idempotency_key;
        IF FOUND THEN
            RETURN jsonb_build_object('mutatie', to_jsonb(v_bestaand), 'voorraad', v_bestaand.resultaat, 'bestond', true);
        END IF;
    END IF;

    SELECT id, naam, unit, current_stock, last_price_eur, purchase_price INTO v_inv
      FROM public.inventory
     WHERE id = p_inventory_id AND organization_id = p_org
     FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'keukenproduct % niet in deze organisatie', p_inventory_id USING ERRCODE = 'P0002';
    END IF;
    SELECT * INTO v_product FROM public.winkel_producten WHERE id = p_product_id AND organization_id = p_org;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'winkelproduct % niet in deze organisatie', p_product_id USING ERRCODE = 'P0002';
    END IF;

    v_factor := public.winkel_keuken_factor(v_product.eenheid, v_inv.unit);
    IF v_factor IS NULL THEN
        RAISE EXCEPTION 'kan % (%) niet omrekenen naar % (%)', v_inv.naam, COALESCE(v_inv.unit, 'geen eenheid'), v_product.naam, v_product.eenheid
            USING ERRCODE = 'WV004';
    END IF;

    v_keuken := p_hoeveelheid * v_factor * CASE WHEN p_richting = 'naar_winkel' THEN -1 ELSE 1 END;
    v_keuken_na := COALESCE(v_inv.current_stock, 0) + v_keuken;
    IF v_keuken_na < 0 THEN
        RAISE EXCEPTION 'onder nul in de keuken: % (er is % %, gevraagd %)', v_inv.naam, COALESCE(v_inv.current_stock, 0), COALESCE(v_inv.unit, ''), -v_keuken
            USING ERRCODE = 'WV001';
    END IF;

    UPDATE public.inventory SET current_stock = v_keuken_na WHERE id = p_inventory_id;
    INSERT INTO public.stock_movements
        (organization_id, inventory_id, type, qty, resulting_stock, unit_price, by_user_id, note)
    VALUES (p_org, p_inventory_id, 'overboeking', v_keuken, v_keuken_na, COALESCE(v_inv.last_price_eur, v_inv.purchase_price), v_uid,
            CASE WHEN p_richting = 'naar_winkel' THEN 'Naar de winkel: ' ELSE 'Terug uit de winkel: ' END || v_product.naam
            || COALESCE(' — ' || NULLIF(btrim(COALESCE(p_notitie, '')), ''), ''))
    RETURNING id INTO v_move_id;

    PERFORM set_config('app.winkel_overboeking', 'aan', true);
    v_winkel := public.winkel_muteer_voorraad(
        p_org, p_product_id, 'overboeking',
        p_hoeveelheid * CASE WHEN p_richting = 'naar_winkel' THEN 1 ELSE -1 END,
        p_notitie => p_notitie, p_idempotency_key => p_idempotency_key,
        p_inventory_id => p_inventory_id, p_stock_movement_id => v_move_id);
    PERFORM set_config('app.winkel_overboeking', '', true);

    RETURN v_winkel || jsonb_build_object('keuken_voorraad', v_keuken_na, 'keuken_mutatie', v_keuken, 'stock_movement_id', v_move_id);
END $$;
REVOKE ALL ON FUNCTION public.voorraad_overboeken(UUID, INTEGER, UUID, NUMERIC, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.voorraad_overboeken(UUID, INTEGER, UUID, NUMERIC, TEXT, TEXT, TEXT) TO authenticated, service_role;


-- ── 9. voorraad_logboek — beide logboeken als één ───────────────────────────
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
    m.created_at
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
    s.created_at
FROM public.stock_movements s
JOIN public.inventory i ON i.id = s.inventory_id;
COMMENT ON VIEW public.voorraad_logboek IS
    'Eén logboek voor het hele bedrijf: winkel_voorraad_mutaties (plek winkel) en stock_movements (plek makerij). Waarde in centen tegen de inkoopprijs.';


-- ── 10. Triggers en RLS ─────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_voorraad_plekken_updated_at ON public.voorraad_plekken;
CREATE TRIGGER trg_voorraad_plekken_updated_at BEFORE UPDATE ON public.voorraad_plekken
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.voorraad_plekken          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.winkel_voorraad_mutaties  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS voorraad_plekken_select ON public.voorraad_plekken;
CREATE POLICY voorraad_plekken_select ON public.voorraad_plekken FOR SELECT TO authenticated
    USING (organization_id IN (SELECT private.user_org_ids()));
DROP POLICY IF EXISTS voorraad_plekken_update ON public.voorraad_plekken;
CREATE POLICY voorraad_plekken_update ON public.voorraad_plekken FOR UPDATE TO authenticated
    USING      (organization_id IN (SELECT private.user_org_ids()))
    WITH CHECK (organization_id IN (SELECT private.user_org_ids()));
DROP POLICY IF EXISTS voorraad_plekken_insert ON public.voorraad_plekken;
CREATE POLICY voorraad_plekken_insert ON public.voorraad_plekken FOR INSERT TO authenticated
    WITH CHECK (organization_id IN (SELECT private.user_org_ids()));

-- Het logboek is alleen te lezen; schrijven gaat via de functies hierboven.
DROP POLICY IF EXISTS winkel_voorraad_mutaties_select ON public.winkel_voorraad_mutaties;
CREATE POLICY winkel_voorraad_mutaties_select ON public.winkel_voorraad_mutaties FOR SELECT TO authenticated
    USING (organization_id IN (SELECT private.user_org_ids()));


-- ── 11. Verificatie ─────────────────────────────────────────────────────────
--   supabase/tests/winkel_voorraad.sql  (draait alles terug)
--   SELECT soort, naam FROM voorraad_plekken;                      -- makerij + winkel per org
--   SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = 'stock_movements_type_check';
