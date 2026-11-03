-- ════════════════════════════════════════════════════════════════════════════
--  Winkel: partijen en stuks — elk bakje vlees en elk stuk kaas met een eigen THT
--  Plan: ~/.claude/plans/graceful-stargazing-wolf.md, stap 1 en 2
-- ════════════════════════════════════════════════════════════════════════════
--
--  Het verhaal
--    Veerbeek brengt vlees in bakjes onder beschermende atmosfeer, met een A4
--    waarop per product de productiedatum en de THT staan. Op de Toonbank
--    weegt Mathijs elk bakje op de geijkte Ariva (tarra op de weegschaal),
--    kiest het product en de Zebra print een Hop & Bites-sticker. Aan de
--    toonbank scant de kassa die sticker. Zo heeft elk bakje een eigen
--    gewicht, prijs en THT, en weet BBQ Architect welke bakjes er liggen en
--    welke bijna over de datum gaan.
--
--  Wat erbij komt
--    1. winkel_artikelen: verkoop_per (stuk | kg), kiloprijs_cents,
--       sticker_plu (het nummer in de stickercode) en etiket (houdbaar_dagen,
--       bewaren, rauwe_melk, beschermende_atmosfeer).
--       winkel_producten: binnen_per_sticker — de sticker IS de ontvangst
--       (voorverpakt vlees). Kaas uit een hele kaas niet: die is al binnen.
--    2. winkel_partijen: één levering van één product (A4: productiedatum, THT).
--    3. winkel_stuks: één bakje of stuk met een sticker. Alleen te schrijven via
--       de functies hieronder; lezen mag de organisatie.
--    4. Contract 1.4 met de Toonbank:
--       - toonbank_bon_fouten en de CHECK op toonbank_bon_regels kennen
--         prijs_bron 'sticker' (gewicht_g, kiloprijs_cents, stickercode);
--       - melding 'sticker' → private.toonbank_verwerk_sticker;
--       - na een stickerregel op een bon gaat het stuk op verkocht (trigger),
--         een tegenbon met goederen terug zet het terug;
--       - toonbank_catalogus geeft per artikel verkoop_per, kiloprijs_cents en
--         etiket mee; toonbank_partijen geeft de open partijen.
--    5. voorraad_melding_staat kent tht_bijna en tht_verlopen.
--    6. winkel_stuk_afboeken: naar de keuken of weggooien (derving_tht).
--
--  Wat er niet verandert
--    toonbank_boek_bon zelf. Een stickerregel heeft als onderdeel
--    {product_id, hoeveelheid: gewicht_g, eenheid: gram}: de bestaande
--    boeking (verkoop_kassa in gram) klopt daarmee al.
--
--  Gebouwd op de LIVE definities: toonbank_bon_fouten, toonbank_verwerk_melding
--  en toonbank_catalogus worden met pg_get_functiondef gelezen en op één plek
--  aangevuld. Vindt de vervanging haar ankertekst niet, dan stopt de migratie.
--
--  Toepassen: met de hand, één keer, in BEGIN/COMMIT; nooit db push.

BEGIN;

-- ── 0. Pre-flight ───────────────────────────────────────────────────────────
DO $$
BEGIN
    IF to_regclass('public.winkel_stuks') IS NOT NULL THEN
        RAISE EXCEPTION 'winkel_stuks: deze migratie is al gedraaid';
    END IF;
    IF to_regclass('public.toonbank_bon_regels') IS NULL OR to_regclass('public.toonbank_journaal') IS NULL THEN
        RAISE EXCEPTION 'winkel_stuks: de Toonbank-tabellen ontbreken (eerst 20261028*_toonbank_*)';
    END IF;
    IF to_regprocedure('private.toonbank_bon_fouten(jsonb)') IS NULL
       OR to_regprocedure('private.toonbank_verwerk_melding(bigint,boolean)') IS NULL
       OR to_regprocedure('public.toonbank_catalogus(uuid)') IS NULL THEN
        RAISE EXCEPTION 'winkel_stuks: een Toonbank-functie ontbreekt';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                    WHERE table_schema = 'public' AND table_name = 'winkel_producten' AND column_name = 'allergenen') THEN
        RAISE EXCEPTION 'winkel_stuks: winkel_producten.allergenen ontbreekt (eerst 20261003153616_winkel_catalogus)';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'voorraad_melding_staat_soort_check') THEN
        RAISE EXCEPTION 'winkel_stuks: constraint voorraad_melding_staat_soort_check niet gevonden';
    END IF;
END $$;

-- ── 1. Artikel en product: op gewicht en het etiket ─────────────────────────
ALTER TABLE public.winkel_artikelen
    ADD COLUMN verkoop_per     TEXT    NOT NULL DEFAULT 'stuk' CHECK (verkoop_per IN ('stuk', 'kg')),
    ADD COLUMN kiloprijs_cents INTEGER CHECK (kiloprijs_cents IS NULL OR (kiloprijs_cents > 0 AND kiloprijs_cents <= 99999)),
    ADD COLUMN sticker_plu     INTEGER CHECK (sticker_plu IS NULL OR sticker_plu BETWEEN 1 AND 99999),
    ADD COLUMN etiket          JSONB;
ALTER TABLE public.winkel_artikelen
    ADD CONSTRAINT winkel_artikelen_kg_compleet
    CHECK (verkoop_per = 'stuk' OR (kiloprijs_cents IS NOT NULL AND sticker_plu IS NOT NULL));
CREATE UNIQUE INDEX winkel_artikelen_sticker_plu_uniek
    ON public.winkel_artikelen (organization_id, sticker_plu) WHERE sticker_plu IS NOT NULL;
COMMENT ON COLUMN public.winkel_artikelen.verkoop_per IS
    'stuk (standaard) of kg: op gewicht, vooraf gewogen en gestickerd op de Toonbank. Bij kg: kiloprijs_cents en sticker_plu verplicht.';
COMMENT ON COLUMN public.winkel_artikelen.sticker_plu IS
    'Het nummer van dit artikel in de stickercode 29 PPPPP GGGGG KKKKK JJMMDD VVVV C (1-99999, uniek per organisatie).';
COMMENT ON COLUMN public.winkel_artikelen.etiket IS
    '{houdbaar_dagen, bewaren, rauwe_melk, beschermende_atmosfeer}: wat er naast naam, ingrediënten en allergenen (van het product) op de sticker komt.';

-- Echte stickers (met prijs uit gewicht) pas als de eigenaar dit aanzet, na het
-- antwoord van NMi over weegschaal + kassa + app + printer (WELMEC 2.2). Uit:
-- de Toonbank print alleen een PROEF-sticker. GET status meldt het als
-- instellingen.gewicht_toegestaan.
ALTER TABLE public.winkel_instellingen
    ADD COLUMN toonbank_gewicht_toegestaan BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.winkel_producten
    ADD COLUMN binnen_per_sticker BOOLEAN NOT NULL DEFAULT false;
COMMENT ON COLUMN public.winkel_producten.binnen_per_sticker IS
    'Waar: elke sticker is een ontvangst van dat bakje (voorverpakt vlees van de slager). Onwaar: de voorraad was al binnen (kaas uit een hele kaas).';

-- ── 2. winkel_partijen ──────────────────────────────────────────────────────
CREATE TABLE public.winkel_partijen (
    id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id   UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    winkel_product_id UUID        NOT NULL REFERENCES public.winkel_producten(id) ON DELETE RESTRICT,
    leverancier_id    INTEGER     REFERENCES public.leveranciers(id) ON DELETE SET NULL,
    geleverd_op       DATE        NOT NULL DEFAULT CURRENT_DATE,
    productiedatum    DATE,
    tht               DATE        NOT NULL,
    bron              TEXT        NOT NULL DEFAULT 'handmatig' CHECK (bron IN ('a4', 'handmatig')),
    notitie           TEXT,
    afgesloten_at     TIMESTAMPTZ,
    created_by        UUID,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT winkel_partijen_tht_na_productie CHECK (productiedatum IS NULL OR tht >= productiedatum)
);
COMMENT ON TABLE public.winkel_partijen IS
    'Eén levering van één winkelproduct (het A4 van de slager): productiedatum en THT. De Toonbank kiest bij het stickeren een open partij; de THT komt dan daaruit, nooit getypt.';
CREATE INDEX idx_winkel_partijen_open ON public.winkel_partijen (organization_id, winkel_product_id, tht) WHERE afgesloten_at IS NULL;

CREATE TRIGGER trg_winkel_partijen_updated_at
    BEFORE UPDATE ON public.winkel_partijen
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION private.winkel_partij_bewaken()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.winkel_producten WHERE id = NEW.winkel_product_id AND organization_id = NEW.organization_id) THEN
        RAISE EXCEPTION 'Het product hoort niet bij deze organisatie' USING ERRCODE = '23514';
    END IF;
    IF NEW.leverancier_id IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM public.leveranciers WHERE id = NEW.leverancier_id AND organization_id = NEW.organization_id) THEN
        RAISE EXCEPTION 'De leverancier hoort niet bij deze organisatie' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END $$;

CREATE TRIGGER trg_winkel_partij_bewaken
    BEFORE INSERT OR UPDATE OF organization_id, winkel_product_id, leverancier_id ON public.winkel_partijen
    FOR EACH ROW EXECUTE FUNCTION private.winkel_partij_bewaken();

ALTER TABLE public.winkel_partijen ENABLE ROW LEVEL SECURITY;
CREATE POLICY winkel_partijen_select ON public.winkel_partijen FOR SELECT TO authenticated
    USING (organization_id IN (SELECT private.user_org_ids()));
CREATE POLICY winkel_partijen_insert ON public.winkel_partijen FOR INSERT TO authenticated
    WITH CHECK (organization_id IN (SELECT private.user_org_ids()));
CREATE POLICY winkel_partijen_update ON public.winkel_partijen FOR UPDATE TO authenticated
    USING (organization_id IN (SELECT private.user_org_ids()))
    WITH CHECK (organization_id IN (SELECT private.user_org_ids()));
CREATE POLICY winkel_partijen_delete ON public.winkel_partijen FOR DELETE TO authenticated
    USING (organization_id IN (SELECT private.user_org_ids()));
REVOKE ALL ON public.winkel_partijen FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.winkel_partijen TO authenticated;
GRANT SELECT ON public.winkel_partijen TO service_role;

-- ── 3. winkel_stuks ─────────────────────────────────────────────────────────
CREATE TABLE public.winkel_stuks (
    id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id   UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    winkel_product_id UUID        NOT NULL REFERENCES public.winkel_producten(id) ON DELETE RESTRICT,
    artikel_id        UUID        REFERENCES public.winkel_artikelen(id) ON DELETE SET NULL,
    partij_id         UUID        REFERENCES public.winkel_partijen(id) ON DELETE SET NULL,
    code              TEXT        NOT NULL CHECK (code ~ '^29[0-9]{26}$'),
    plu               INTEGER     NOT NULL,
    volgnummer        INTEGER,
    gewicht_g         INTEGER     NOT NULL CHECK (gewicht_g > 0),
    kiloprijs_cents   INTEGER     NOT NULL CHECK (kiloprijs_cents >= 0),
    prijs_cents       INTEGER     NOT NULL CHECK (prijs_cents >= 0),
    tht               DATE        NOT NULL,
    status            TEXT        NOT NULL DEFAULT 'op_voorraad'
                                  CHECK (status IN ('op_voorraad', 'verkocht', 'afgeschreven', 'naar_keuken')),
    apparaat_id       UUID,
    journaal_id       BIGINT,
    bon_regel_id      BIGINT      REFERENCES public.toonbank_bon_regels(id) ON DELETE SET NULL,
    verkocht_cents    INTEGER,
    gestickerd_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    afgeboekt_at      TIMESTAMPTZ,
    afgeboekt_door    UUID,
    notitie           TEXT,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.winkel_stuks IS
    'Eén gestickerd bakje of stuk (Toonbank, melding sticker). Status op_voorraad → verkocht (bon), afgeschreven (derving_tht) of naar_keuken. Alleen via toonbank_verwerk_sticker, de bonregel-trigger en winkel_stuk_afboeken.';
-- Het volgnummer op de kassa loopt rond (0000-9999): dezelfde code kan na lange
-- tijd terugkomen. Uniek alleen zolang een stuk nog ligt.
CREATE UNIQUE INDEX winkel_stuks_code_op_voorraad ON public.winkel_stuks (organization_id, code) WHERE status = 'op_voorraad';
CREATE INDEX idx_winkel_stuks_code ON public.winkel_stuks (organization_id, code);
CREATE INDEX idx_winkel_stuks_tht ON public.winkel_stuks (organization_id, tht) WHERE status = 'op_voorraad';
CREATE INDEX idx_winkel_stuks_product ON public.winkel_stuks (organization_id, winkel_product_id, status);

CREATE TRIGGER trg_winkel_stuks_updated_at
    BEFORE UPDATE ON public.winkel_stuks
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.winkel_stuks ENABLE ROW LEVEL SECURITY;
CREATE POLICY winkel_stuks_select ON public.winkel_stuks FOR SELECT TO authenticated
    USING (organization_id IN (SELECT private.user_org_ids()));
REVOKE ALL ON public.winkel_stuks FROM anon, authenticated;
GRANT SELECT ON public.winkel_stuks TO authenticated, service_role;

-- ── 4a. Bonregels: prijs_bron 'sticker' ─────────────────────────────────────
ALTER TABLE public.toonbank_bon_regels DROP CONSTRAINT IF EXISTS toonbank_bon_regels_prijs_bron_check;
DO $$
DECLARE
    v_naam TEXT;
BEGIN
    -- De naam van de CHECK uit 20261028160000 is door Postgres gekozen: zoek hem op inhoud.
    FOR v_naam IN SELECT conname FROM pg_constraint
                   WHERE conrelid = 'public.toonbank_bon_regels'::REGCLASS AND contype = 'c'
                     AND pg_get_constraintdef(oid) LIKE '%prijs_bron%' LOOP
        EXECUTE format('ALTER TABLE public.toonbank_bon_regels DROP CONSTRAINT %I', v_naam);
    END LOOP;
END $$;
ALTER TABLE public.toonbank_bon_regels ADD CONSTRAINT toonbank_bon_regels_prijs_bron_check
    CHECK (prijs_bron IS NULL OR prijs_bron IN ('catalogus', 'open_prijs', 'sticker'));

DO $$
DECLARE
    v_def  TEXT := pg_get_functiondef('private.toonbank_bon_fouten(jsonb)'::REGPROCEDURE);
    v_oud  TEXT := $q$IF COALESCE(r->>'prijs_bron', '') NOT IN ('catalogus', 'open_prijs') THEN f := array_append(f, format('regel %s: prijs_bron', v_nr)); END IF;$q$;
    v_nieuw TEXT := $q$IF COALESCE(r->>'prijs_bron', '') NOT IN ('catalogus', 'open_prijs', 'sticker') THEN f := array_append(f, format('regel %s: prijs_bron', v_nr)); END IF;
                -- Contract 1.4: een gescande sticker heeft de stickercode, het gewicht en de kiloprijs.
                IF r->>'prijs_bron' = 'sticker' AND (COALESCE(r->>'scan_code', '') !~ '^29[0-9]{26}$'
                       OR COALESCE(private.tb_int(r->'gewicht_g'), 0) < 1 OR COALESCE(private.tb_int(r->'kiloprijs_cents'), -1) < 0) THEN
                    f := array_append(f, format('regel %s: een sticker heeft scan_code (29…), gewicht_g en kiloprijs_cents', v_nr));
                END IF;$q$;
BEGIN
    IF position(v_oud IN v_def) = 0 THEN
        RAISE EXCEPTION 'winkel_stuks: toonbank_bon_fouten is anders dan verwacht (anker prijs_bron niet gevonden)';
    END IF;
    EXECUTE replace(v_def, v_oud, v_nieuw);
END $$;

-- ── 4b. Melding 'sticker' ───────────────────────────────────────────────────
-- Payload (contract 1.4, Toonbank StickerMelding): artikel_id, plu, code,
-- gewicht_g, kiloprijs_cents, prijs_cents, tht, tht_hele_kaas, kopie, en
-- optioneel partij_id (vlees: de levering van het A4).
CREATE OR REPLACE FUNCTION private.toonbank_verwerk_sticker(p_journaal_id BIGINT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_j        public.toonbank_journaal%ROWTYPE;
    v_p        JSONB;
    v_org      UUID;
    v_artikel  public.winkel_artikelen%ROWTYPE;
    v_product  public.winkel_producten%ROWTYPE;
    v_pid      UUID;
    v_slots    INTEGER;
    v_code     TEXT;
    v_gewicht  INTEGER;
    v_kilo     INTEGER;
    v_prijs    INTEGER;
    v_tht      DATE;
    v_moment   TIMESTAMPTZ;
    v_partij   UUID;
    v_regel    RECORD;
    v_stuk_id  UUID;
    v_status   TEXT;
    v_boekt    BOOLEAN := false;
BEGIN
    SELECT * INTO v_j FROM public.toonbank_journaal WHERE id = p_journaal_id;
    v_org := v_j.organization_id;
    v_p := v_j.payload;
    PERFORM private.vereis_org(v_org);

    v_code := v_p->>'code';
    v_gewicht := private.tb_int(v_p->'gewicht_g');
    v_kilo := private.tb_int(v_p->'kiloprijs_cents');
    v_prijs := private.tb_int(v_p->'prijs_cents');
    IF COALESCE(v_code, '') !~ '^29[0-9]{26}$' OR private.tb_uuid(v_p->>'artikel_id') IS NULL
       OR COALESCE(v_gewicht, 0) < 1 OR COALESCE(v_kilo, -1) < 0 OR COALESCE(v_prijs, -1) < 0
       OR COALESCE(v_p->>'tht', '') !~ '^\d{4}-\d{2}-\d{2}$' THEN
        RAISE EXCEPTION 'sticker: code (29…, 28 cijfers), artikel_id, gewicht_g, kiloprijs_cents, prijs_cents en tht' USING ERRCODE = '22023';
    END IF;
    v_tht := (v_p->>'tht')::DATE;
    -- Nooit later dan nu: een klok die voorloopt zou anders een telling ná de verkoop maken.
    v_moment := LEAST(COALESCE(private.tb_tijd(v_p->>'moment'), v_j.ontvangen_at, now()), now());

    SELECT * INTO v_artikel FROM public.winkel_artikelen
     WHERE id = private.tb_uuid(v_p->>'artikel_id') AND organization_id = v_org;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'sticker: artikel % bestaat niet in deze organisatie', v_p->>'artikel_id' USING ERRCODE = 'P0002';
    END IF;
    SELECT count(*), (array_agg(s.standaard_product_id))[1] INTO v_slots, v_pid
      FROM public.winkel_artikel_slots s WHERE s.artikel_id = v_artikel.id;
    IF v_slots <> 1 OR v_pid IS NULL THEN
        RAISE EXCEPTION 'sticker: % heeft niet precies één product (vak)', v_artikel.naam USING ERRCODE = '22023';
    END IF;
    SELECT * INTO v_product FROM public.winkel_producten WHERE id = v_pid AND organization_id = v_org;

    -- Dezelfde sticker al bekend (een kopie, of dezelfde melding nog eens): niets te doen.
    IF EXISTS (SELECT 1 FROM public.winkel_stuks WHERE organization_id = v_org AND code = v_code AND status = 'op_voorraad')
       OR EXISTS (SELECT 1 FROM public.winkel_stuks WHERE organization_id = v_org AND journaal_id = p_journaal_id) THEN
        UPDATE public.toonbank_journaal
           SET verwerk_status = 'niet_nodig', pogingen = pogingen + 1, fout_code = NULL, fout_melding = NULL, verwerkt_at = now()
         WHERE id = p_journaal_id;
        RETURN jsonb_build_object('uitkomst', 'niet_nodig');
    END IF;

    v_partij := private.tb_uuid(v_p->>'partij_id');
    IF v_partij IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.winkel_partijen WHERE id = v_partij AND organization_id = v_org AND winkel_product_id = v_pid) THEN
        v_partij := NULL;
    END IF;

    -- Kwam de bon met deze sticker al eerder binnen (andere volgorde), dan is hij al verkocht.
    SELECT r.id, r.bedrag_cents, b.gebeurd_at INTO v_regel
      FROM public.toonbank_bon_regels r
      JOIN public.toonbank_bonnen b ON b.id = r.bon_id
     WHERE r.organization_id = v_org AND r.scan_code = v_code AND r.prijs_bron = 'sticker'
       AND b.status = 'afgerond' AND r.aantal > 0
       AND NOT EXISTS (SELECT 1 FROM public.winkel_stuks s WHERE s.bon_regel_id = r.id)
     ORDER BY r.id DESC LIMIT 1;
    v_status := CASE WHEN v_regel.id IS NULL THEN 'op_voorraad' ELSE 'verkocht' END;

    INSERT INTO public.winkel_stuks (
        organization_id, winkel_product_id, artikel_id, partij_id, code, plu, volgnummer,
        gewicht_g, kiloprijs_cents, prijs_cents, tht, status, apparaat_id, journaal_id,
        bon_regel_id, verkocht_cents, gestickerd_at, afgeboekt_at
    ) VALUES (
        v_org, v_pid, v_artikel.id, v_partij, v_code, substr(v_code, 3, 5)::INTEGER, substr(v_code, 24, 4)::INTEGER,
        v_gewicht, v_kilo, v_prijs, v_tht, v_status, v_j.apparaat_id, p_journaal_id,
        v_regel.id, v_regel.bedrag_cents, v_moment, v_regel.gebeurd_at
    )
    RETURNING id INTO v_stuk_id;

    -- Voorverpakt binnengekomen (vlees): de sticker is de ontvangst. Werd het
    -- product nog niet bijgehouden, dan begint het hier bij nul.
    IF v_product.binnen_per_sticker AND NOT COALESCE((v_p->>'kopie')::BOOLEAN, false) THEN
        IF v_product.voorraad IS NULL THEN
            PERFORM public.winkel_muteer_voorraad(v_org, v_pid, 'telling', 0, NULL,
                'Eerste sticker: vanaf nu bijgehouden', NULL, NULL, NULL, NULL, NULL,
                'sticker-start:' || v_pid::TEXT, NULL, NULL, NULL, v_moment, NULL);
        END IF;
        PERFORM public.winkel_muteer_voorraad(v_org, v_pid, 'ontvangst',
            CASE WHEN v_product.eenheid = 'gram' THEN v_gewicht ELSE 1 END, NULL,
            'Sticker ' || v_code, NULL, NULL, v_tht, NULL, NULL,
            'sticker:' || v_code || ':' || p_journaal_id::TEXT, NULL, NULL, NULL, v_moment, NULL);
        v_boekt := true;
    END IF;

    UPDATE public.toonbank_journaal
       SET verwerk_status = 'verwerkt', pogingen = pogingen + 1, fout_code = NULL, fout_melding = NULL, verwerkt_at = now(),
           resultaat = jsonb_build_object('stuk_id', v_stuk_id, 'product_id', v_pid, 'status', v_status, 'ontvangst', v_boekt)
     WHERE id = p_journaal_id;
    -- 'boekingen' zoals toonbank_boek_bon: de wachtrij haalt daar de geraakte producten uit.
    RETURN jsonb_build_object('uitkomst', 'verwerkt', 'stuk_id', v_stuk_id, 'product_id', v_pid, 'ontvangst', v_boekt,
                              'boekingen', CASE WHEN v_boekt THEN jsonb_build_array(jsonb_build_object('product_id', v_pid)) ELSE '[]'::JSONB END);
END $$;
COMMENT ON FUNCTION private.toonbank_verwerk_sticker(BIGINT) IS
    'Contract 1.4: melding sticker → winkel_stuks (op_voorraad, of verkocht als de bon al binnen was). Bij binnen_per_sticker ook een ontvangst in de eenheid van het product. Idempotent op journaalregel en op de code zolang het stuk ligt.';
REVOKE ALL ON FUNCTION private.toonbank_verwerk_sticker(BIGINT) FROM PUBLIC, anon, authenticated, service_role;

DO $$
DECLARE
    v_def  TEXT := pg_get_functiondef('private.toonbank_verwerk_melding(bigint,boolean)'::REGPROCEDURE);
    v_oud  TEXT := $q$ELSIF v_j.soort = 'dagstaat' THEN$q$;
    v_nieuw TEXT := $q$ELSIF v_j.soort = 'sticker' THEN
        -- Contract 1.4 (20261103120000_winkel_stuks).
        RETURN private.toonbank_verwerk_sticker(p_journaal_id);
    ELSIF v_j.soort = 'dagstaat' THEN$q$;
BEGIN
    IF position(v_oud IN v_def) = 0 THEN
        RAISE EXCEPTION 'winkel_stuks: toonbank_verwerk_melding is anders dan verwacht (anker dagstaat niet gevonden)';
    END IF;
    EXECUTE replace(v_def, v_oud, v_nieuw);
END $$;

-- ── 4c. Een stickerregel op een bon: het stuk is verkocht (of komt terug) ───
CREATE OR REPLACE FUNCTION private.winkel_stuk_na_bonregel()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_bon   RECORD;
    v_stuk  public.winkel_stuks%ROWTYPE;
BEGIN
    IF NEW.scan_code IS NULL OR NEW.scan_code !~ '^29[0-9]{26}$' THEN
        RETURN NEW;
    END IF;
    SELECT b.status, b.soort, b.gebeurd_at INTO v_bon FROM public.toonbank_bonnen b WHERE b.id = NEW.bon_id;
    IF v_bon.status IS DISTINCT FROM 'afgerond' THEN
        RETURN NEW;
    END IF;

    IF COALESCE(NEW.aantal, 0) > 0 THEN
        SELECT * INTO v_stuk FROM public.winkel_stuks
         WHERE organization_id = NEW.organization_id AND code = NEW.scan_code AND status = 'op_voorraad'
         FOR UPDATE;
        IF FOUND THEN
            UPDATE public.winkel_stuks
               SET status = 'verkocht', bon_regel_id = NEW.id, verkocht_cents = NEW.bedrag_cents,
                   afgeboekt_at = COALESCE(v_bon.gebeurd_at, now())
             WHERE id = v_stuk.id;
        END IF;
        -- Niet gevonden: de stickermelding komt nog (toonbank_verwerk_sticker ziet de bon dan).
    ELSIF COALESCE(NEW.aantal, 0) < 0 AND COALESCE(NEW.goederen_terug, false) THEN
        UPDATE public.winkel_stuks s
           SET status = 'op_voorraad', bon_regel_id = NULL, verkocht_cents = NULL, afgeboekt_at = NULL,
               notitie = left(concat_ws(' · ', s.notitie, 'Terug via tegenbon'), 500)
         WHERE s.id = (SELECT x.id FROM public.winkel_stuks x
                        WHERE x.organization_id = NEW.organization_id AND x.code = NEW.scan_code AND x.status = 'verkocht'
                        ORDER BY x.afgeboekt_at DESC NULLS LAST LIMIT 1)
           AND NOT EXISTS (SELECT 1 FROM public.winkel_stuks y
                            WHERE y.organization_id = NEW.organization_id AND y.code = NEW.scan_code AND y.status = 'op_voorraad');
    END IF;
    RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.winkel_stuk_na_bonregel() FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER trg_winkel_stuk_na_bonregel
    AFTER INSERT ON public.toonbank_bon_regels
    FOR EACH ROW
    WHEN (NEW.prijs_bron = 'sticker')
    EXECUTE FUNCTION private.winkel_stuk_na_bonregel();

-- ── 4d. Catalogus: verkoop_per, kiloprijs en etiket per artikel ─────────────
DO $$
DECLARE
    v_def  TEXT := pg_get_functiondef('public.toonbank_catalogus(uuid)'::REGPROCEDURE);
    v_oud  TEXT := $q$'kanalen',       to_jsonb(art.kanalen)$q$;
    v_nieuw TEXT := $q$'kanalen',       to_jsonb(art.kanalen),
                   -- Contract 1.4 (20261103120000_winkel_stuks): op gewicht en de sticker.
                   'verkoop_per',     art.verkoop_per,
                   'kiloprijs_cents', CASE WHEN art.verkoop_per = 'kg' THEN art.kiloprijs_cents END,
                   'etiket',          CASE WHEN art.verkoop_per = 'kg' AND art.sticker_plu IS NOT NULL THEN
                                          (SELECT jsonb_build_object(
                                                      'plu',            art.sticker_plu,
                                                      'ingredienten',   NULLIF(array_to_string(p.ingredienten, ', '), ''),
                                                      'allergenen',     to_jsonb(COALESCE(p.allergenen, '{}'::TEXT[])),
                                                      'houdbaar_dagen', LEAST(GREATEST(COALESCE((art.etiket->>'houdbaar_dagen')::INTEGER, 0), 0), 365),
                                                      'bewaren',        NULLIF(btrim(COALESCE(art.etiket->>'bewaren', '')), ''),
                                                      'rauwe_melk',     COALESCE((art.etiket->>'rauwe_melk')::BOOLEAN, false),
                                                      'beschermende_atmosfeer', COALESCE((art.etiket->>'beschermende_atmosfeer')::BOOLEAN, false),
                                                      'tht_uit_partij', COALESCE(p.binnen_per_sticker, false))
                                             FROM eenslot e JOIN prod p ON p.id = e.pid WHERE e.artikel_id = art.id)
                                      END$q$;
BEGIN
    IF position(v_oud IN v_def) = 0 THEN
        RAISE EXCEPTION 'winkel_stuks: toonbank_catalogus is anders dan verwacht (anker kanalen niet gevonden)';
    END IF;
    EXECUTE replace(v_def, v_oud, v_nieuw);
END $$;

-- ── 4e. Open partijen voor het stickeren (GET partijen) ─────────────────────
CREATE OR REPLACE FUNCTION public.toonbank_partijen(p_org UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    PERFORM private.vereis_org(p_org);
    RETURN jsonb_build_object('partijen', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
                   'partij_id',      pa.id,
                   'product_id',     pa.winkel_product_id,
                   'artikel_ids',    COALESCE((SELECT jsonb_agg(a.id ORDER BY a.naam)
                                                 FROM public.winkel_artikelen a
                                                 JOIN public.winkel_artikel_slots s ON s.artikel_id = a.id
                                                WHERE a.organization_id = p_org AND a.verkoop_per = 'kg'
                                                  AND s.standaard_product_id = pa.winkel_product_id), '[]'::JSONB),
                   'leverancier',    l.naam,
                   'geleverd_op',    pa.geleverd_op,
                   'productiedatum', pa.productiedatum,
                   'tht',            pa.tht,
                   'gestickerd',     (SELECT count(*) FROM public.winkel_stuks st WHERE st.partij_id = pa.id))
               ORDER BY pa.tht, pa.geleverd_op, pa.id)
          FROM public.winkel_partijen pa
          LEFT JOIN public.leveranciers l ON l.id = pa.leverancier_id
         WHERE pa.organization_id = p_org AND pa.afgesloten_at IS NULL AND pa.tht >= CURRENT_DATE), '[]'::JSONB));
END $$;
COMMENT ON FUNCTION public.toonbank_partijen(UUID) IS
    'GET /api/toonbank/v1/partijen (contract 1.4): de open partijen (niet afgesloten, THT vandaag of later) om bij het stickeren te kiezen. Alleen service_role.';
REVOKE ALL ON FUNCTION public.toonbank_partijen(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.toonbank_partijen(UUID) TO service_role;

-- ── 5. Meldingen: THT ───────────────────────────────────────────────────────
ALTER TABLE public.voorraad_melding_staat DROP CONSTRAINT voorraad_melding_staat_soort_check;
ALTER TABLE public.voorraad_melding_staat ADD CONSTRAINT voorraad_melding_staat_soort_check
    CHECK (soort IN ('voorraad_laag', 'voorraad_op', 'artikel_dicht', 'voorraad_tekort_vooruit', 'voorraad_tellen',
                     'tht_bijna', 'tht_verlopen'));

-- ── 6. Een stuk afboeken: naar de keuken of weggooien ───────────────────────
CREATE OR REPLACE FUNCTION public.winkel_stuk_afboeken(p_org UUID, p_stuk_id UUID, p_wat TEXT, p_notitie TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_stuk    public.winkel_stuks%ROWTYPE;
    v_product public.winkel_producten%ROWTYPE;
    v_reden   TEXT;
    v_boeking JSONB;
BEGIN
    PERFORM private.vereis_org(p_org);
    IF p_wat NOT IN ('afgeschreven', 'naar_keuken') THEN
        RAISE EXCEPTION 'afboeken: afgeschreven of naar_keuken' USING ERRCODE = '22023';
    END IF;
    SELECT * INTO v_stuk FROM public.winkel_stuks WHERE id = p_stuk_id AND organization_id = p_org FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Dit stuk bestaat niet' USING ERRCODE = 'P0002';
    END IF;
    IF v_stuk.status <> 'op_voorraad' THEN
        RETURN jsonb_build_object('bestond', true, 'status', v_stuk.status);
    END IF;

    v_reden := CASE p_wat WHEN 'naar_keuken' THEN 'keuken_verbruik' ELSE 'derving_tht' END;
    SELECT * INTO v_product FROM public.winkel_producten WHERE id = v_stuk.winkel_product_id;
    -- Alleen als het product wordt bijgehouden; anders is er geen getal om te verlagen.
    IF v_product.voorraad IS NOT NULL THEN
        v_boeking := public.winkel_muteer_voorraad(p_org, v_stuk.winkel_product_id, 'afwijking',
            -LEAST(CASE WHEN v_product.eenheid = 'gram' THEN v_stuk.gewicht_g ELSE 1 END, v_product.voorraad),
            v_reden, left(concat_ws(' · ', 'Sticker ' || v_stuk.code, NULLIF(btrim(COALESCE(p_notitie, '')), '')), 500),
            NULL, NULL, NULL, NULL, NULL, 'stuk:' || v_stuk.id::TEXT || ':' || p_wat);
    END IF;

    UPDATE public.winkel_stuks
       SET status = p_wat, afgeboekt_at = now(), afgeboekt_door = auth.uid(),
           notitie = left(concat_ws(' · ', notitie, NULLIF(btrim(COALESCE(p_notitie, '')), '')), 500)
     WHERE id = v_stuk.id;
    RETURN jsonb_build_object('bestond', false, 'status', p_wat, 'boeking', v_boeking);
END $$;
COMMENT ON FUNCTION public.winkel_stuk_afboeken(UUID, UUID, TEXT, TEXT) IS
    'Een gestickerd stuk uit de winkel halen: naar_keuken (afwijking keuken_verbruik) of afgeschreven (afwijking derving_tht). Idempotent: een stuk dat er niet meer ligt geeft bestond.';
REVOKE ALL ON FUNCTION public.winkel_stuk_afboeken(UUID, UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.winkel_stuk_afboeken(UUID, UUID, TEXT, TEXT) TO authenticated, service_role;

-- ── 7. Nakijken ─────────────────────────────────────────────────────────────
DO $$
BEGIN
    IF NOT (SELECT c.relrowsecurity FROM pg_class c WHERE c.oid = 'public.winkel_stuks'::REGCLASS)
       OR NOT (SELECT c.relrowsecurity FROM pg_class c WHERE c.oid = 'public.winkel_partijen'::REGCLASS) THEN
        RAISE EXCEPTION 'winkel_stuks: RLS staat uit';
    END IF;
    IF position('toonbank_verwerk_sticker' IN pg_get_functiondef('private.toonbank_verwerk_melding(bigint,boolean)'::REGPROCEDURE)) = 0
       OR position('''sticker''' IN pg_get_functiondef('private.toonbank_bon_fouten(jsonb)'::REGPROCEDURE)) = 0
       OR position('verkoop_per' IN pg_get_functiondef('public.toonbank_catalogus(uuid)'::REGPROCEDURE)) = 0 THEN
        RAISE EXCEPTION 'winkel_stuks: een functie is niet aangevuld';
    END IF;
END $$;

COMMIT;
