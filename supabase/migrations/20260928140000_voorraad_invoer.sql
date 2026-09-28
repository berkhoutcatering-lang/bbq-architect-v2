-- ════════════════════════════════════════════════════════════════════════════
--  Winkelvoorraad W2b — voorraad toevoegen op elke manier, één controlescherm
--  Plan: docs/voorraad-bouwplan.md §3 W2b · Opdracht: docs/OPDRACHT-BBQ-ARCHITECT-WINKELVOORRAAD.md
-- ════════════════════════════════════════════════════════════════════════════
--
--  Elke manier (handmatig, foto/pdf/e-factuur, barcode, inkooporder) maakt
--  eerst een concept: voorraad_invoer + regels. Niets gaat de voorraad in
--  voordat Mathijs "Klopt, boeken" zegt; dan boekt voorraad_invoer_boeken
--  alles in één transactie, per regel naar de winkel (winkel_muteer_voorraad,
--  type ontvangst) of de makerij (increment_inventory_stock, type receive).
--
--  De omrekening ("1 krat = 24 flesjes") en de keuze van product en plek
--  worden per leverancier + regelnaam (of EAN) onthouden in
--  voorraad_invoer_koppelingen: de volgende factuur stelt het zelf voor.
--
--  Foutcodes erbij:
--    WV008  concept is al geboekt of verworpen
--    WV009  regel zonder product of zonder aantal


-- ── 0. Pre-flight ───────────────────────────────────────────────────────────
DO $$
BEGIN
    IF to_regprocedure('public.winkel_muteer_voorraad(uuid, uuid, text, numeric, text, text, bigint, bigint, date, integer, uuid, text, integer, bigint, uuid)') IS NULL THEN
        RAISE EXCEPTION 'voorraad_invoer: winkel_muteer_voorraad ontbreekt (migratie 20260928120000)';
    END IF;
    IF to_regclass('public.bonnen') IS NULL THEN
        RAISE EXCEPTION 'voorraad_invoer: bonnen ontbreekt';
    END IF;
END $$;


-- ── 1. Het concept ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.voorraad_invoer (
    id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id  UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    bron             TEXT        NOT NULL CHECK (bron IN ('handmatig', 'foto', 'pdf', 'ubl', 'mail', 'barcode', 'inkooporder')),
    status           TEXT        NOT NULL DEFAULT 'concept' CHECK (status IN ('concept', 'geboekt', 'verworpen')),
    leverancier_id   INTEGER     REFERENCES public.leveranciers(id) ON DELETE SET NULL,
    leverancier_naam TEXT,
    factuurnummer    TEXT,
    datum            DATE,
    totaal_cents     INTEGER,
    -- SHA-256 van het bestand (zoals bonnen.image_hash): dubbel inlezen herkennen.
    image_hash       TEXT,
    bon_id           BIGINT      REFERENCES public.bonnen(id) ON DELETE SET NULL,
    inkoop_order_id  UUID        REFERENCES public.concept_inkoop_orders(id) ON DELETE SET NULL,
    notitie          TEXT,
    door_user_id     UUID,
    geboekt_at       TIMESTAMPTZ,
    geboekt_door     UUID,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.voorraad_invoer IS
    'Een ontvangst in concept (W2b): van factuur, foto, barcode, inkooporder of handmatig. Pas na controle geboekt via voorraad_invoer_boeken.';
CREATE INDEX IF NOT EXISTS voorraad_invoer_org_idx   ON public.voorraad_invoer(organization_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS voorraad_invoer_hash_idx  ON public.voorraad_invoer(organization_id, image_hash) WHERE image_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS voorraad_invoer_fnr_idx   ON public.voorraad_invoer(organization_id, lower(factuurnummer)) WHERE factuurnummer IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.voorraad_invoer_regels (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id     UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    invoer_id           UUID        NOT NULL REFERENCES public.voorraad_invoer(id) ON DELETE CASCADE,
    volgorde            INTEGER     NOT NULL DEFAULT 0,

    -- Zoals het op de factuur staat: "2 × krat bier (24)", € 21,60 per krat.
    bron_naam           TEXT        NOT NULL,
    bron_aantal         NUMERIC,
    bron_eenheid        TEXT,
    bron_prijs_cents    INTEGER,
    btw_pct             INTEGER     CHECK (btw_pct IS NULL OR btw_pct IN (0, 9, 21)),
    ean                 TEXT,

    -- Waar het heen gaat.
    plek                TEXT        CHECK (plek IS NULL OR plek IN ('winkel', 'makerij')),
    winkel_product_id   UUID        REFERENCES public.winkel_producten(id) ON DELETE SET NULL,
    inventory_id        INTEGER     REFERENCES public.inventory(id) ON DELETE SET NULL,
    -- Hoeveel voorraad-eenheden in één factuur-eenheid (krat → 24 flesjes; kg → 1000 g).
    omrekening          NUMERIC     CHECK (omrekening IS NULL OR omrekening > 0),
    -- Uitkomst in de eenheid van het doelproduct: bron_aantal × omrekening, of met de hand.
    aantal              NUMERIC     CHECK (aantal IS NULL OR aantal >= 0),
    tht                 DATE,
    overslaan           BOOLEAN     NOT NULL DEFAULT false,
    -- Hoe het voorstel ontstond: onthouden, EAN, naam, of niets.
    voorstel            TEXT        CHECK (voorstel IS NULL OR voorstel IN ('onthouden', 'ean', 'naam', 'inkooporder', 'geen')),

    inkoop_order_line_id UUID,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.voorraad_invoer_regels IS
    'De regels van een ontvangst in concept. bron_* is wat er op het papier staat; plek/product/omrekening/aantal is wat Mathijs bevestigt.';
CREATE INDEX IF NOT EXISTS voorraad_invoer_regels_idx ON public.voorraad_invoer_regels(invoer_id, volgorde);


-- ── 2. Onthouden: welke regel is welk product, en hoeveel zit erin ──────────
CREATE TABLE IF NOT EXISTS public.voorraad_invoer_koppelingen (
    id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id    UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    -- Sleutel: EAN, of leverancier + genormaliseerde regelnaam.
    sleutel            TEXT        NOT NULL,
    leverancier_id     INTEGER     REFERENCES public.leveranciers(id) ON DELETE CASCADE,
    bron_naam          TEXT        NOT NULL,
    bron_eenheid       TEXT,
    plek               TEXT        NOT NULL CHECK (plek IN ('winkel', 'makerij')),
    winkel_product_id  UUID        REFERENCES public.winkel_producten(id) ON DELETE CASCADE,
    inventory_id       INTEGER     REFERENCES public.inventory(id) ON DELETE CASCADE,
    omrekening         NUMERIC     NOT NULL DEFAULT 1 CHECK (omrekening > 0),
    keer_gebruikt      INTEGER     NOT NULL DEFAULT 1,
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (organization_id, sleutel),
    CHECK ((plek = 'winkel' AND winkel_product_id IS NOT NULL) OR (plek = 'makerij' AND inventory_id IS NOT NULL))
);
COMMENT ON TABLE public.voorraad_invoer_koppelingen IS
    'Wat Mathijs bij een eerdere ontvangst bevestigde: deze factuurregel (of EAN) = dit product op deze plek, met deze omrekening. Wordt bij boeken bijgewerkt.';


-- ── 3. Triggers en RLS ──────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_voorraad_invoer_updated_at ON public.voorraad_invoer;
CREATE TRIGGER trg_voorraad_invoer_updated_at BEFORE UPDATE ON public.voorraad_invoer
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.voorraad_invoer              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.voorraad_invoer_regels       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.voorraad_invoer_koppelingen  ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
    t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY['voorraad_invoer', 'voorraad_invoer_regels', 'voorraad_invoer_koppelingen']
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_select', t);
        EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated
             USING (organization_id IN (SELECT private.user_org_ids()))', t || '_select', t);
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_insert', t);
        EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT TO authenticated
             WITH CHECK (organization_id IN (SELECT private.user_org_ids()))', t || '_insert', t);
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_update', t);
        EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated
             USING (organization_id IN (SELECT private.user_org_ids()))
             WITH CHECK (organization_id IN (SELECT private.user_org_ids()))', t || '_update', t);
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_delete', t);
        EXECUTE format('CREATE POLICY %I ON public.%I FOR DELETE TO authenticated
             USING (organization_id IN (SELECT private.user_org_ids()))', t || '_delete', t);
    END LOOP;
END $$;

-- Een geboekt concept verandert niet meer: regels en kop op slot.
CREATE OR REPLACE FUNCTION public.voorraad_invoer_op_slot()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_status TEXT;
BEGIN
    IF COALESCE(current_setting('app.invoer_boeken', true), '') = 'aan' THEN
        RETURN COALESCE(NEW, OLD);
    END IF;
    IF TG_TABLE_NAME = 'voorraad_invoer' THEN
        v_status := OLD.status;
    ELSE
        SELECT status INTO v_status FROM public.voorraad_invoer WHERE id = COALESCE(NEW.invoer_id, OLD.invoer_id);
    END IF;
    IF v_status = 'geboekt' THEN
        RAISE EXCEPTION 'deze ontvangst is al geboekt en verandert niet meer' USING ERRCODE = 'WV008';
    END IF;
    RETURN COALESCE(NEW, OLD);
END $$;
DROP TRIGGER IF EXISTS trg_voorraad_invoer_op_slot ON public.voorraad_invoer;
CREATE TRIGGER trg_voorraad_invoer_op_slot BEFORE UPDATE OR DELETE ON public.voorraad_invoer
    FOR EACH ROW EXECUTE FUNCTION public.voorraad_invoer_op_slot();
DROP TRIGGER IF EXISTS trg_voorraad_invoer_regels_op_slot ON public.voorraad_invoer_regels;
CREATE TRIGGER trg_voorraad_invoer_regels_op_slot BEFORE INSERT OR UPDATE OR DELETE ON public.voorraad_invoer_regels
    FOR EACH ROW EXECUTE FUNCTION public.voorraad_invoer_op_slot();


-- ── 4. "Klopt, boeken" ──────────────────────────────────────────────────────
-- Eén transactie: alle regels of geen. Idempotent: een geboekt concept geeft
-- WV008. Een regel zonder product of aantal (en niet overgeslagen) geeft WV009.
-- Werkt de koppelingen bij zodat de volgende keer hetzelfde wordt voorgesteld.
CREATE OR REPLACE FUNCTION public.voorraad_invoer_boeken(p_org UUID, p_invoer_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_uid     UUID := auth.uid();
    v_invoer  public.voorraad_invoer%ROWTYPE;
    r         public.voorraad_invoer_regels%ROWTYPE;
    v_prod    public.winkel_producten%ROWTYPE;
    v_inkoop  INTEGER;
    v_prijs   NUMERIC;
    v_winkel  INTEGER := 0;
    v_keuken  INTEGER := 0;
    v_sleutel TEXT;
BEGIN
    IF v_uid IS NOT NULL AND p_org NOT IN (SELECT private.user_org_ids()) THEN
        RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
    END IF;
    SELECT * INTO v_invoer FROM public.voorraad_invoer WHERE id = p_invoer_id AND organization_id = p_org FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'ontvangst niet gevonden' USING ERRCODE = 'P0002';
    END IF;
    IF v_invoer.status <> 'concept' THEN
        RAISE EXCEPTION 'deze ontvangst is al %', v_invoer.status USING ERRCODE = 'WV008';
    END IF;

    FOR r IN SELECT * FROM public.voorraad_invoer_regels WHERE invoer_id = p_invoer_id AND NOT overslaan ORDER BY volgorde, created_at
    LOOP
        IF r.plek IS NULL OR r.aantal IS NULL OR r.aantal <= 0
           OR (r.plek = 'winkel' AND r.winkel_product_id IS NULL)
           OR (r.plek = 'makerij' AND r.inventory_id IS NULL) THEN
            RAISE EXCEPTION 'regel "%" heeft nog geen product of aantal', r.bron_naam USING ERRCODE = 'WV009';
        END IF;

        -- Inkoopprijs per voorraad-eenheid: factuurprijs ÷ omrekening.
        v_prijs := CASE WHEN r.bron_prijs_cents IS NULL OR COALESCE(r.omrekening, 0) <= 0 THEN NULL
                        ELSE r.bron_prijs_cents::NUMERIC / r.omrekening END;

        IF r.plek = 'winkel' THEN
            SELECT * INTO v_prod FROM public.winkel_producten WHERE id = r.winkel_product_id AND organization_id = p_org;
            -- Winkelprijzen gelden per prijs_per eenheden.
            v_inkoop := CASE WHEN v_prijs IS NULL THEN NULL ELSE round(v_prijs * v_prod.prijs_per)::INTEGER END;
            IF v_prod.voorraad IS NULL THEN
                -- Nog nooit geteld: de ontvangst is dan de eerste telling vanaf 0.
                PERFORM public.winkel_muteer_voorraad(p_org, r.winkel_product_id, 'telling', 0,
                    p_notitie => 'Start bij eerste ontvangst', p_door_user_id => v_uid);
            END IF;
            PERFORM public.winkel_muteer_voorraad(p_org, r.winkel_product_id, 'ontvangst', r.aantal,
                p_tht => r.tht, p_inkoop_excl_cents => v_inkoop, p_inkoop_order_id => v_invoer.inkoop_order_id,
                p_notitie => COALESCE(v_invoer.leverancier_naam || ' · ', '') || r.bron_naam,
                p_idempotency_key => 'invoer:' || r.id, p_door_user_id => v_uid);
            v_winkel := v_winkel + 1;
        ELSE
            PERFORM public.increment_inventory_stock(
                p_org => p_org, p_inventory_id => r.inventory_id, p_delta => r.aantal, p_type => 'receive',
                p_unit_price => CASE WHEN v_prijs IS NULL THEN NULL ELSE round(v_prijs) / 100.0 END,
                p_note => COALESCE(v_invoer.leverancier_naam || ' · ', '') || r.bron_naam,
                p_bon_id => v_invoer.bon_id);
            IF v_prijs IS NOT NULL THEN
                UPDATE public.inventory SET last_price_eur = round(v_prijs) / 100.0 WHERE id = r.inventory_id AND organization_id = p_org;
            END IF;
            IF r.tht IS NOT NULL THEN
                UPDATE public.inventory SET tht = LEAST(COALESCE(tht, r.tht), r.tht) WHERE id = r.inventory_id AND organization_id = p_org;
            END IF;
            v_keuken := v_keuken + 1;
        END IF;

        -- Onthouden voor de volgende keer.
        v_sleutel := CASE WHEN r.ean IS NOT NULL AND r.ean <> '' THEN 'ean:' || r.ean
                          ELSE 'lev:' || COALESCE(v_invoer.leverancier_id::TEXT, '-') || ':' || lower(regexp_replace(btrim(r.bron_naam), '\s+', ' ', 'g')) END;
        INSERT INTO public.voorraad_invoer_koppelingen AS k
            (organization_id, sleutel, leverancier_id, bron_naam, bron_eenheid, plek, winkel_product_id, inventory_id, omrekening)
        VALUES (p_org, v_sleutel, v_invoer.leverancier_id, r.bron_naam, r.bron_eenheid, r.plek,
                CASE WHEN r.plek = 'winkel' THEN r.winkel_product_id END,
                CASE WHEN r.plek = 'makerij' THEN r.inventory_id END,
                COALESCE(r.omrekening, 1))
        ON CONFLICT (organization_id, sleutel) DO UPDATE
           SET plek = EXCLUDED.plek, winkel_product_id = EXCLUDED.winkel_product_id, inventory_id = EXCLUDED.inventory_id,
               omrekening = EXCLUDED.omrekening, bron_eenheid = EXCLUDED.bron_eenheid,
               keer_gebruikt = k.keer_gebruikt + 1, updated_at = now();
        IF r.ean IS NOT NULL AND r.ean <> '' AND r.plek = 'winkel' THEN
            UPDATE public.winkel_producten SET ean = r.ean WHERE id = r.winkel_product_id AND ean IS NULL;
        END IF;
    END LOOP;

    IF v_winkel + v_keuken = 0 THEN
        RAISE EXCEPTION 'er staat niets te boeken' USING ERRCODE = 'WV009';
    END IF;

    PERFORM set_config('app.invoer_boeken', 'aan', true);
    UPDATE public.voorraad_invoer SET status = 'geboekt', geboekt_at = now(), geboekt_door = v_uid WHERE id = p_invoer_id;
    PERFORM set_config('app.invoer_boeken', '', true);

    RETURN jsonb_build_object('winkel', v_winkel, 'makerij', v_keuken);
END $$;
REVOKE ALL ON FUNCTION public.voorraad_invoer_boeken(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.voorraad_invoer_boeken(UUID, UUID) TO authenticated, service_role;
