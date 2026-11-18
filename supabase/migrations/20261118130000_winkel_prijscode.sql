-- ════════════════════════════════════════════════════════════════════════════
--  Pakjes met een prijscode (Veerbeek): binnenmelden per pakje, verkopen aan de
--  Toonbank tegen de prijs uit de code
--  Plan: docs/plan-veerbeek-pakjes.md · Test: supabase/tests/winkel_prijscode.sql
-- ════════════════════════════════════════════════════════════════════════════
--
--  De code: EAN-13 `21 AAAAA PPPPP C` (21 = winkelcode met prijs, AAAAA =
--  artikelnummer van de leverancier, PPPPP = totaalprijs in centen, C =
--  controlecijfer). Gewicht en THT staan er niet in.
--
--  Wat erbij komt
--    1. winkel_producten.prijscode_nr: het artikelnummer in de code (5 cijfers,
--       uniek per organisatie). De catalogusversie gaat omhoog als het verandert.
--    2. winkel_stuks.bron: 'sticker' (zoals nu) of 'prijscode'. Een pakje met een
--       prijscode heeft geen gewicht, kiloprijs of stickernummer; dezelfde code
--       mag vaker op voorraad liggen (pakjes met dezelfde prijs).
--    3. winkel_stuk_binnen_prijscode: een gescand pakje binnenmelden; kent BBQ
--       Architect het nummer nog niet, dan geeft het 'onbekend' en kiest de
--       gebruiker het product (dat krijgt dan het nummer). winkel_stuk_weg: een
--       verkeerde scan weghalen zolang het pakje nog ligt.
--    4. toonbank_catalogus geeft per artikel prijscode_nr (het product van een
--       artikel met één vak).
--    5. POST bonnen: prijs_bron 'prijscode'. Vormfout zonder code 21…; daarna
--       controleert toonbank_controleer_prijscode het controlecijfer, de prijs
--       uit de code en of het pakje was binnengemeld. Een afwijking is een
--       melding in "Te controleren"; de bon wordt altijd geboekt.
--    6. Na een prijscoderegel op een bon gaat het oudste pakje met die code (op
--       THT) op verkocht; een tegenbon met goederen terug zet het terug.
--    7. winkel_stuk_afboeken boekt bij een pakje met een prijscode geen voorraad
--       van het product af (die wordt per pakje geteld, niet in gram).
--
--  Gebouwd op de LIVE definities met ankers; vindt de vervanging haar anker niet
--  precies één keer, dan stopt de migratie.
--  Toepassen: met de hand, één keer, in BEGIN/COMMIT; nooit db push.

BEGIN;

-- ── 0. Pre-flight ───────────────────────────────────────────────────────────
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'winkel_producten' AND column_name = 'prijscode_nr') THEN
        RAISE EXCEPTION 'winkel_prijscode: deze migratie is al gedraaid';
    END IF;
    IF to_regprocedure('private.toonbank_controleer_sticker(jsonb)') IS NULL THEN
        RAISE EXCEPTION 'winkel_prijscode: eerst 20261118120000_toonbank_sticker_controle';
    END IF;
    IF to_regclass('public.winkel_stuks') IS NULL OR to_regprocedure('public.winkel_stuk_afboeken(uuid,uuid,text,text)') IS NULL THEN
        RAISE EXCEPTION 'winkel_prijscode: eerst 20261103120000_winkel_stuks';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'winkel_stuks_code_check')
       OR NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'toonbank_bon_regels_prijs_bron_check') THEN
        RAISE EXCEPTION 'winkel_prijscode: een verwachte constraint ontbreekt';
    END IF;
END $$;

-- Vervang een stuk tekst in een functie, precies één keer, of stop.
CREATE OR REPLACE FUNCTION pg_temp.vervang(p_functie TEXT, p_oud TEXT, p_nieuw TEXT)
RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE
    v_def TEXT := pg_get_functiondef(p_functie::REGPROCEDURE);
    v_n   INTEGER := (length(v_def) - length(replace(v_def, p_oud, ''))) / length(p_oud);
BEGIN
    IF v_n <> 1 THEN
        RAISE EXCEPTION 'winkel_prijscode: % is anders dan verwacht (anker % keer gevonden): %', p_functie, v_n, left(p_oud, 80);
    END IF;
    EXECUTE replace(v_def, p_oud, p_nieuw);
END $$;

-- ── 1. Het artikelnummer in de prijscode ────────────────────────────────────
ALTER TABLE public.winkel_producten
    ADD COLUMN prijscode_nr TEXT CHECK (prijscode_nr IS NULL OR prijscode_nr ~ '^[0-9]{5}$');
CREATE UNIQUE INDEX winkel_producten_prijscode_nr_uniek
    ON public.winkel_producten (organization_id, prijscode_nr) WHERE prijscode_nr IS NOT NULL;
COMMENT ON COLUMN public.winkel_producten.prijscode_nr IS
    'Het artikelnummer van de leverancier in de prijscode 21 AAAAA PPPPP C (5 cijfers, uniek per organisatie), bijvoorbeeld Veerbeek 01015 = haasbiefstuk.';

DROP TRIGGER trg_winkel_cv_product ON public.winkel_producten;
CREATE CONSTRAINT TRIGGER trg_winkel_cv_product
    AFTER UPDATE OF naam, eenheid, statiegeld_cents, alcohol, ean, foto, foto_url, winkelprijs_incl_cents,
                    prijs_per, btw_pct, actief, voorraad, ingredienten, allergenen, binnen_per_sticker, prijscode_nr
    ON public.winkel_producten
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW
    WHEN (OLD.naam IS DISTINCT FROM NEW.naam OR OLD.eenheid IS DISTINCT FROM NEW.eenheid
          OR OLD.statiegeld_cents IS DISTINCT FROM NEW.statiegeld_cents OR OLD.alcohol IS DISTINCT FROM NEW.alcohol
          OR OLD.ean IS DISTINCT FROM NEW.ean OR OLD.foto IS DISTINCT FROM NEW.foto OR OLD.foto_url IS DISTINCT FROM NEW.foto_url
          OR OLD.winkelprijs_incl_cents IS DISTINCT FROM NEW.winkelprijs_incl_cents
          OR OLD.prijs_per IS DISTINCT FROM NEW.prijs_per OR OLD.btw_pct IS DISTINCT FROM NEW.btw_pct
          OR OLD.actief IS DISTINCT FROM NEW.actief
          OR (OLD.voorraad IS NULL) IS DISTINCT FROM (NEW.voorraad IS NULL)
          OR OLD.ingredienten IS DISTINCT FROM NEW.ingredienten
          OR OLD.allergenen IS DISTINCT FROM NEW.allergenen
          OR OLD.binnen_per_sticker IS DISTINCT FROM NEW.binnen_per_sticker
          OR OLD.prijscode_nr IS DISTINCT FROM NEW.prijscode_nr)
    EXECUTE FUNCTION private.winkel_catalogus_versie_omhoog('product');

-- ── 2. Stuks: sticker of prijscode ──────────────────────────────────────────
ALTER TABLE public.winkel_stuks
    ADD COLUMN bron TEXT NOT NULL DEFAULT 'sticker' CHECK (bron IN ('sticker', 'prijscode'));
ALTER TABLE public.winkel_stuks
    ALTER COLUMN plu DROP NOT NULL,
    ALTER COLUMN gewicht_g DROP NOT NULL,
    ALTER COLUMN kiloprijs_cents DROP NOT NULL;
ALTER TABLE public.winkel_stuks DROP CONSTRAINT winkel_stuks_code_check;
ALTER TABLE public.winkel_stuks ADD CONSTRAINT winkel_stuks_code_check CHECK (
       (bron = 'sticker'   AND code ~ '^29[0-9]{26}$' AND plu IS NOT NULL AND gewicht_g IS NOT NULL AND kiloprijs_cents IS NOT NULL)
    OR (bron = 'prijscode' AND code ~ '^21[0-9]{11}$'));
-- Een eigen sticker is uniek zolang hij ligt; pakjes met dezelfde prijscode niet.
DROP INDEX public.winkel_stuks_code_op_voorraad;
CREATE UNIQUE INDEX winkel_stuks_code_op_voorraad ON public.winkel_stuks (organization_id, code)
    WHERE status = 'op_voorraad' AND bron = 'sticker';
COMMENT ON COLUMN public.winkel_stuks.bron IS
    'sticker: eigen Toonbank-sticker (29…, met gewicht). prijscode: pakje van de leverancier met de prijs in de code (21…), bij binnenkomst gescand; geen gewicht.';

-- Is de EAN-13 met prijs geldig? (13 cijfers, begint met 21, controlecijfer klopt)
CREATE OR REPLACE FUNCTION private.prijscode_geldig(p_code TEXT)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
SET search_path = pg_temp
AS $$
    SELECT COALESCE(p_code, '') ~ '^21[0-9]{11}$'
       AND (10 - (SELECT sum(substr(p_code, i, 1)::INTEGER * CASE WHEN i % 2 = 0 THEN 3 ELSE 1 END)
                    FROM generate_series(1, 12) i) % 10) % 10 = substr(p_code, 13, 1)::INTEGER
$$;
REVOKE ALL ON FUNCTION private.prijscode_geldig(TEXT) FROM PUBLIC, anon, authenticated, service_role;

-- ── 3. Binnenmelden en een verkeerde scan weghalen ──────────────────────────
CREATE OR REPLACE FUNCTION public.winkel_stuk_binnen_prijscode(p_org UUID, p_code TEXT, p_tht DATE, p_product UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_code    TEXT := btrim(COALESCE(p_code, ''));
    v_nr      TEXT;
    v_prijs   INTEGER;
    v_product public.winkel_producten%ROWTYPE;
    v_ander   TEXT;
    v_artikel UUID;
    v_id      UUID;
BEGIN
    PERFORM private.vereis_org(p_org);
    IF v_code !~ '^21[0-9]{11}$' THEN
        RETURN jsonb_build_object('uitkomst', 'geen_prijscode');
    END IF;
    IF NOT private.prijscode_geldig(v_code) THEN
        RETURN jsonb_build_object('uitkomst', 'controlecijfer');
    END IF;
    IF p_tht IS NULL THEN
        RAISE EXCEPTION 'Vul de THT van de levering in' USING ERRCODE = '22023';
    END IF;
    v_nr := substr(v_code, 3, 5);
    v_prijs := substr(v_code, 8, 5)::INTEGER;

    IF p_product IS NOT NULL THEN
        SELECT * INTO v_product FROM public.winkel_producten WHERE id = p_product AND organization_id = p_org FOR UPDATE;
        IF NOT FOUND THEN RAISE EXCEPTION 'Dit product bestaat niet' USING ERRCODE = 'P0002'; END IF;
        SELECT naam INTO v_ander FROM public.winkel_producten
         WHERE organization_id = p_org AND prijscode_nr = v_nr AND id <> p_product;
        IF FOUND THEN
            RAISE EXCEPTION 'Nummer % hoort al bij %', v_nr, v_ander USING ERRCODE = '23505';
        END IF;
        IF v_product.prijscode_nr IS DISTINCT FROM v_nr THEN
            UPDATE public.winkel_producten SET prijscode_nr = v_nr WHERE id = v_product.id;
        END IF;
    ELSE
        SELECT * INTO v_product FROM public.winkel_producten WHERE organization_id = p_org AND prijscode_nr = v_nr;
        IF NOT FOUND THEN
            RETURN jsonb_build_object('uitkomst', 'onbekend', 'nr', v_nr, 'prijs_cents', v_prijs);
        END IF;
    END IF;

    -- Het eigen artikel van het product (één vak), als dat er is.
    SELECT s.artikel_id INTO v_artikel FROM public.winkel_artikel_slots s
     WHERE s.organization_id = p_org AND s.standaard_product_id = v_product.id
       AND (SELECT count(*) FROM public.winkel_artikel_slots s2 WHERE s2.artikel_id = s.artikel_id) = 1
     LIMIT 1;

    INSERT INTO public.winkel_stuks (organization_id, winkel_product_id, artikel_id, code, bron, prijs_cents, tht, status, gestickerd_at)
    VALUES (p_org, v_product.id, v_artikel, v_code, 'prijscode', v_prijs, p_tht, 'op_voorraad', now())
    RETURNING id INTO v_id;
    RETURN jsonb_build_object('uitkomst', 'binnen', 'stuk_id', v_id, 'product_id', v_product.id, 'naam', v_product.naam,
                              'nr', v_nr, 'prijs_cents', v_prijs, 'tht', p_tht);
END $$;
COMMENT ON FUNCTION public.winkel_stuk_binnen_prijscode(UUID, TEXT, DATE, UUID) IS
    'Een gescand pakje met een prijscode (21 AAAAA PPPPP C) binnenmelden als stuk op voorraad. Uitkomst binnen | onbekend (nummer nog niet gekoppeld; geef p_product mee) | controlecijfer | geen_prijscode.';
REVOKE ALL ON FUNCTION public.winkel_stuk_binnen_prijscode(UUID, TEXT, DATE, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.winkel_stuk_binnen_prijscode(UUID, TEXT, DATE, UUID) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.winkel_stuk_weg(p_org UUID, p_stuk_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_n INTEGER;
BEGIN
    PERFORM private.vereis_org(p_org);
    DELETE FROM public.winkel_stuks
     WHERE id = p_stuk_id AND organization_id = p_org AND bron = 'prijscode' AND status = 'op_voorraad';
    GET DIAGNOSTICS v_n = ROW_COUNT;
    RETURN jsonb_build_object('weg', v_n = 1);
END $$;
COMMENT ON FUNCTION public.winkel_stuk_weg(UUID, UUID) IS
    'Een verkeerd gescand pakje (prijscode) weghalen, alleen zolang het nog op voorraad ligt.';
REVOKE ALL ON FUNCTION public.winkel_stuk_weg(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.winkel_stuk_weg(UUID, UUID) TO authenticated, service_role;

-- ── 4. Catalogus: prijscode_nr per artikel ──────────────────────────────────
SELECT pg_temp.vervang('public.toonbank_catalogus(uuid)',
    $q$'verkoop_per',     art.verkoop_per,$q$,
    $q$'verkoop_per',     art.verkoop_per,
                   -- 20261118130000_winkel_prijscode: het artikelnummer in de prijscode van de leverancier.
                   'prijscode_nr',    (SELECT p.prijscode_nr FROM eenslot e JOIN prod p ON p.id = e.pid WHERE e.artikel_id = art.id),$q$);

-- ── 5. Bonnen: prijs_bron 'prijscode' ───────────────────────────────────────
ALTER TABLE public.toonbank_bon_regels DROP CONSTRAINT toonbank_bon_regels_prijs_bron_check;
ALTER TABLE public.toonbank_bon_regels ADD CONSTRAINT toonbank_bon_regels_prijs_bron_check
    CHECK (prijs_bron IS NULL OR prijs_bron IN ('catalogus', 'open_prijs', 'sticker', 'prijscode'));

SELECT pg_temp.vervang('private.toonbank_bon_fouten(jsonb)',
    $q$NOT IN ('catalogus', 'open_prijs', 'sticker') THEN f := array_append(f, format('regel %s: prijs_bron', v_nr)); END IF;$q$,
    $q$NOT IN ('catalogus', 'open_prijs', 'sticker', 'prijscode') THEN f := array_append(f, format('regel %s: prijs_bron', v_nr)); END IF;
                -- 20261118130000_winkel_prijscode: een pakje met de prijs in de code (21…, 13 cijfers).
                IF r->>'prijs_bron' = 'prijscode' AND COALESCE(r->>'scan_code', '') !~ '^21[0-9]{11}$' THEN
                    f := array_append(f, format('regel %s: een prijscode heeft scan_code (21…, 13 cijfers)', v_nr));
                END IF;$q$);

CREATE OR REPLACE FUNCTION private.toonbank_controleer_prijscode(p_org UUID, p_bon_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
    r     RECORD;
    v_uit JSONB := '[]'::JSONB;
    v_bon RECORD;
BEGIN
    SELECT b.status, b.soort INTO v_bon FROM public.toonbank_bonnen b WHERE b.id = p_bon_id;
    FOR r IN SELECT * FROM public.toonbank_bon_regels
              WHERE organization_id = p_org AND bon_id = p_bon_id AND prijs_bron = 'prijscode' AND soort = 'verkoop'
              ORDER BY regelnr LOOP
        IF NOT private.prijscode_geldig(r.scan_code) THEN
            v_uit := v_uit || jsonb_build_object('code', 'prijscode_code', 'melding',
                format('Regel %s: de code %s klopt niet (controlecijfer).', r.regelnr, r.scan_code));
            CONTINUE;
        END IF;
        IF r.stuk_cents IS DISTINCT FROM substr(r.scan_code, 8, 5)::INTEGER THEN
            v_uit := v_uit || jsonb_build_object('code', 'prijscode_prijs', 'melding',
                format('Regel %s: de code zegt %s ct, op de bon staat %s ct.', r.regelnr, substr(r.scan_code, 8, 5)::INTEGER, COALESCE(r.stuk_cents::TEXT, 'niets')));
        END IF;
        -- Verkocht zonder dat het pakje was binnengemeld: de verkoop telt, de voorraad per pakje niet.
        IF v_bon.status = 'afgerond' AND COALESCE(r.aantal, 0) > 0
           AND NOT EXISTS (SELECT 1 FROM public.winkel_stuks s WHERE s.bon_regel_id = r.id) THEN
            v_uit := v_uit || jsonb_build_object('code', 'prijscode_niet_binnen', 'melding',
                format('Regel %s: pakje %s (%s) is verkocht, maar was niet binnengemeld.', r.regelnr, r.scan_code, COALESCE(r.naam, '')));
        END IF;
    END LOOP;
    RETURN v_uit;
END $$;
COMMENT ON FUNCTION private.toonbank_controleer_prijscode(UUID, UUID) IS
    'Controles op de prijscoderegels van een geboekte bon: controlecijfer, prijs uit de code, binnengemeld. Geeft meldingen voor "Te controleren"; weigert nooit.';
REVOKE ALL ON FUNCTION private.toonbank_controleer_prijscode(UUID, UUID) FROM PUBLIC, anon, authenticated, service_role;

SELECT pg_temp.vervang('public.toonbank_boek_bon(bigint)',
    $q$v_controles := v_controles || private.toonbank_controleer_sticker(v_p->'regels');$q$,
    $q$v_controles := v_controles || private.toonbank_controleer_sticker(v_p->'regels');
    -- 20261118130000_winkel_prijscode: pakjes met de prijs in de code.
    v_controles := v_controles || private.toonbank_controleer_prijscode(v_org, v_bon_id);$q$);

-- ── 6. Een prijscoderegel op een bon: het pakje is verkocht (of komt terug) ─
CREATE OR REPLACE FUNCTION private.winkel_stuk_prijscode_na_bonregel()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_bon RECORD;
    v_id  UUID;
BEGIN
    IF NEW.scan_code IS NULL OR NEW.scan_code !~ '^21[0-9]{11}$' THEN
        RETURN NEW;
    END IF;
    SELECT b.status, b.gebeurd_at INTO v_bon FROM public.toonbank_bonnen b WHERE b.id = NEW.bon_id;
    IF v_bon.status IS DISTINCT FROM 'afgerond' THEN
        RETURN NEW;
    END IF;

    IF COALESCE(NEW.aantal, 0) > 0 THEN
        -- Het oudste pakje met deze code (op THT) gaat de deur uit.
        SELECT id INTO v_id FROM public.winkel_stuks
         WHERE organization_id = NEW.organization_id AND code = NEW.scan_code AND bron = 'prijscode' AND status = 'op_voorraad'
         ORDER BY tht, gestickerd_at, id
         LIMIT 1
         FOR UPDATE;
        IF FOUND THEN
            UPDATE public.winkel_stuks
               SET status = 'verkocht', bon_regel_id = NEW.id, verkocht_cents = NEW.bedrag_cents,
                   afgeboekt_at = COALESCE(v_bon.gebeurd_at, now())
             WHERE id = v_id;
        END IF;
    ELSIF COALESCE(NEW.aantal, 0) < 0 AND COALESCE(NEW.goederen_terug, false) THEN
        UPDATE public.winkel_stuks s
           SET status = 'op_voorraad', bon_regel_id = NULL, verkocht_cents = NULL, afgeboekt_at = NULL,
               notitie = left(concat_ws(' · ', s.notitie, 'Terug via tegenbon'), 500)
         WHERE s.id = (SELECT x.id FROM public.winkel_stuks x
                        WHERE x.organization_id = NEW.organization_id AND x.code = NEW.scan_code AND x.bron = 'prijscode'
                          AND x.status = 'verkocht'
                        ORDER BY x.afgeboekt_at DESC NULLS LAST LIMIT 1);
    END IF;
    RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.winkel_stuk_prijscode_na_bonregel() FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER trg_winkel_stuk_prijscode_na_bonregel
    AFTER INSERT ON public.toonbank_bon_regels
    FOR EACH ROW
    WHEN (NEW.prijs_bron = 'prijscode')
    EXECUTE FUNCTION private.winkel_stuk_prijscode_na_bonregel();

-- ── 7. Afboeken: geen grammen voor een pakje met een prijscode ──────────────
SELECT pg_temp.vervang('public.winkel_stuk_afboeken(uuid,uuid,text,text)',
    $q$IF v_product.voorraad IS NOT NULL THEN$q$,
    $q$IF v_product.voorraad IS NOT NULL AND v_stuk.bron = 'sticker' THEN$q$);

-- ── 8. Nakijken ─────────────────────────────────────────────────────────────
DO $$
BEGIN
    IF position('toonbank_controleer_prijscode' IN pg_get_functiondef('public.toonbank_boek_bon(bigint)'::REGPROCEDURE)) = 0
       OR position('''prijscode''' IN pg_get_functiondef('private.toonbank_bon_fouten(jsonb)'::REGPROCEDURE)) = 0
       OR position('prijscode_nr' IN pg_get_functiondef('public.toonbank_catalogus(uuid)'::REGPROCEDURE)) = 0
       OR position('v_stuk.bron' IN pg_get_functiondef('public.winkel_stuk_afboeken(uuid,uuid,text,text)'::REGPROCEDURE)) = 0 THEN
        RAISE EXCEPTION 'winkel_prijscode: een functie is niet aangevuld';
    END IF;
    IF NOT private.prijscode_geldig('2101015028237') OR private.prijscode_geldig('2101015028238') THEN
        RAISE EXCEPTION 'winkel_prijscode: het controlecijfer rekent verkeerd';
    END IF;
END $$;

COMMIT;
