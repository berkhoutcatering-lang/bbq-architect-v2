-- ════════════════════════════════════════════════════════════════════════════
--  Pakjes van Veerbeek: de code is 21 PPPP K CCCCC E, niet 21 AAAAA PPPPP C
--  Plan: docs/plan-veerbeek-pakjes.md · Test: supabase/tests/winkel_prijscode.sql
--  Herstelt 20261118130000_winkel_prijscode
-- ════════════════════════════════════════════════════════════════════════════
--
--  De opbouw (GS1, winkelcode met een prijs van 5 cijfers, nagerekend op
--  echte stickers van 19 november 2026):
--    21     winkelcode met prijs
--    PPPP   artikelnummer (PLU) van de slager        → winkel_producten.prijscode_nr
--    K      prijscontrolecijfer over de vijf prijscijfers
--    CCCCC  prijs van het pakje in centen
--    E      controlecijfer van de EAN-13
--  Haasbiefstuk: pakje 2101015028237 (PLU 0101, K 5, € 28,23) en krat
--  2101012076774 (PLU 0101, K 2, € 76,77).
--
--  Wat er fout ging: prijscode_nr had 5 cijfers (PLU + de K van één toevallig
--  pakje) en binnenmelden zocht op substr(code, 3, 5). Een pakje met een andere
--  prijs kwam terug als 'onbekend', en koppelen overschreef het nummer met de K
--  van dat pakje.
--
--  Wat erbij komt
--    1. private.prijscode_prijscontrole(prijs): het K-cijfer volgens GS1;
--       private.prijscode_geldig controleert nu ook K. Daarmee ook de controle op
--       de bon (prijscode_code) en binnenmelden ('controlecijfer').
--    2. winkel_producten.prijscode_nr: 4 cijfers (de PLU) in plaats van 5. De
--       bestaande nummers worden ingekort tot hun eerste 4 cijfers. PLU 0000 is
--       niet toegestaan als vast nummer: die gebruikt de slager voor meer
--       producten (gekruid gehakt, Honey Pops). Het nummer 0000(7) van gekruid
--       gehakt wordt leeggemaakt.
--    3. winkel_stuk_binnen_prijscode zoekt op de PLU (substr(code, 3, 4)). Bij
--       PLU 0000 vraagt hij altijd welk product het is ('onbekend', gedeeld:
--       true) en onthoudt hij niets.
--    4. GET catalogus stuurt prijscode_nr zoals het in de tabel staat, nu 4
--       cijfers. LET OP de volgorde live: eerst de Toonbank die 4 of 5 cijfers
--       accepteert (branch fix/tb-slagerscode-vier-cijfers), dan deze migratie.
--       Een Toonbank die nog 5 cijfers eist, keurt anders de catalogus af.
--    Verkopen op een bon verandert niet: de prijs staat nog steeds op positie
--    8–12 en het verkochte pakje wordt op de hele code gezocht.
--
--  Toepassen: met de hand, één keer, in BEGIN/COMMIT; nooit db push.
--  Eerst een proefdraai met ROLLBACK.
BEGIN;

-- ── 0. Pre-flight ───────────────────────────────────────────────────────────
DO $$
DECLARE
    v_dubbel TEXT;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'winkel_producten' AND column_name = 'prijscode_nr') THEN
        RAISE EXCEPTION 'winkel_prijscode_plu: eerst 20261118130000_winkel_prijscode';
    END IF;
    IF to_regprocedure('private.prijscode_prijscontrole(text)') IS NOT NULL THEN
        RAISE EXCEPTION 'winkel_prijscode_plu: deze migratie is al gedraaid';
    END IF;
    IF EXISTS (SELECT 1 FROM public.winkel_producten WHERE prijscode_nr IS NOT NULL AND prijscode_nr !~ '^[0-9]{5}$') THEN
        RAISE EXCEPTION 'winkel_prijscode_plu: er staat een prijscode_nr dat geen 5 cijfers heeft';
    END IF;
    -- Twee producten met dezelfde PLU (behalve 0000, dat wordt leeg): eerst met de hand oplossen.
    SELECT string_agg(organization_id || ' ' || plu || ': ' || namen, '; ') INTO v_dubbel
      FROM (SELECT organization_id, left(prijscode_nr, 4) AS plu, string_agg(naam || ' (' || prijscode_nr || ')', ', ') AS namen
              FROM public.winkel_producten
             WHERE prijscode_nr IS NOT NULL AND left(prijscode_nr, 4) <> '0000'
             GROUP BY 1, 2 HAVING count(*) > 1) d;
    IF v_dubbel IS NOT NULL THEN
        RAISE EXCEPTION 'winkel_prijscode_plu: dezelfde PLU bij meer producten: %', v_dubbel;
    END IF;
END $$;

-- ── 1. Het prijscontrolecijfer ──────────────────────────────────────────────
-- GS1, prijs van 5 cijfers: weging 5+, 2-, 5-, 5+, 2- per positie, som, dan
-- r = (10 - som mod 10) mod 10, en K = de plek van r in de tabel 5-.
CREATE FUNCTION private.prijscode_prijscontrole(p_prijs TEXT)
RETURNS INTEGER
LANGUAGE sql
IMMUTABLE
SET search_path = pg_temp
AS $$
    WITH t AS (
        SELECT ARRAY[0, 2, 4, 6, 8, 9, 1, 3, 5, 7] AS twee_min,
               ARRAY[0, 5, 1, 6, 2, 7, 3, 8, 4, 9] AS vijf_plus,
               ARRAY[0, 5, 9, 4, 8, 3, 7, 2, 6, 1] AS vijf_min
    ), s AS (
        SELECT (10 - (  t.vijf_plus[substr(p_prijs, 1, 1)::INTEGER + 1]
                      + t.twee_min [substr(p_prijs, 2, 1)::INTEGER + 1]
                      + t.vijf_min [substr(p_prijs, 3, 1)::INTEGER + 1]
                      + t.vijf_plus[substr(p_prijs, 4, 1)::INTEGER + 1]
                      + t.twee_min [substr(p_prijs, 5, 1)::INTEGER + 1]) % 10) % 10 AS r,
               t.vijf_min
          FROM t
    )
    SELECT array_position(s.vijf_min, s.r) - 1 FROM s
$$;
COMMENT ON FUNCTION private.prijscode_prijscontrole(TEXT) IS
    'Het prijscontrolecijfer K (GS1) bij een prijs van 5 cijfers, bijvoorbeeld 02823 → 5. In de prijscode 21 PPPP K CCCCC E.';
REVOKE ALL ON FUNCTION private.prijscode_prijscontrole(TEXT) FROM PUBLIC, anon, authenticated, service_role;

-- Geldig = 13 cijfers, begint met 21, EAN-controlecijfer klopt én K klopt bij de prijs.
CREATE OR REPLACE FUNCTION private.prijscode_geldig(p_code TEXT)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
SET search_path = pg_temp
AS $$
    SELECT COALESCE(p_code, '') ~ '^21[0-9]{11}$'
       AND (10 - (SELECT sum(substr(p_code, i, 1)::INTEGER * CASE WHEN i % 2 = 0 THEN 3 ELSE 1 END)
                    FROM generate_series(1, 12) i) % 10) % 10 = substr(p_code, 13, 1)::INTEGER
       AND private.prijscode_prijscontrole(substr(p_code, 8, 5)) = substr(p_code, 7, 1)::INTEGER
$$;
COMMENT ON FUNCTION private.prijscode_geldig(TEXT) IS
    'Is dit een geldige prijscode 21 PPPP K CCCCC E: 13 cijfers, begint met 21, EAN-controlecijfer en prijscontrolecijfer K kloppen.';
REVOKE ALL ON FUNCTION private.prijscode_geldig(TEXT) FROM PUBLIC, anon, authenticated, service_role;

-- ── 2. prijscode_nr = de PLU (4 cijfers) ────────────────────────────────────
ALTER TABLE public.winkel_producten DROP CONSTRAINT winkel_producten_prijscode_nr_check;
UPDATE public.winkel_producten
   SET prijscode_nr = CASE WHEN left(prijscode_nr, 4) = '0000' THEN NULL ELSE left(prijscode_nr, 4) END
 WHERE prijscode_nr IS NOT NULL;
-- De UPDATE zet de (uitgestelde) catalogustrigger klaar; zonder dit weigert Postgres de
-- ALTER TABLE hieronder ("pending trigger events"). De catalogusversie gaat gewoon omhoog.
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE public.winkel_producten ADD CONSTRAINT winkel_producten_prijscode_nr_check
    CHECK (prijscode_nr IS NULL OR (prijscode_nr ~ '^[0-9]{4}$' AND prijscode_nr <> '0000'));
-- De unieke index winkel_producten_prijscode_nr_uniek (organisatie, prijscode_nr) blijft zoals hij is.
COMMENT ON COLUMN public.winkel_producten.prijscode_nr IS
    'Het artikelnummer (PLU) van de leverancier in de prijscode 21 PPPP K CCCCC E: 4 cijfers, uniek per organisatie, bijvoorbeeld Veerbeek 0101 = haasbiefstuk. Nooit 0000: dat nummer deelt de slager tussen producten.';

-- ── 3. Binnenmelden op de PLU ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.winkel_stuk_binnen_prijscode(p_org UUID, p_code TEXT, p_tht DATE, p_product UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_code    TEXT := btrim(COALESCE(p_code, ''));
    v_nr      TEXT;
    v_gedeeld BOOLEAN;
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
    v_nr := substr(v_code, 3, 4);          -- de PLU; positie 7 is het prijscontrolecijfer
    v_gedeeld := v_nr = '0000';            -- die PLU deelt de slager tussen producten
    v_prijs := substr(v_code, 8, 5)::INTEGER;

    IF p_product IS NOT NULL THEN
        SELECT * INTO v_product FROM public.winkel_producten WHERE id = p_product AND organization_id = p_org FOR UPDATE;
        IF NOT FOUND THEN RAISE EXCEPTION 'Dit product bestaat niet' USING ERRCODE = 'P0002'; END IF;
        IF NOT v_gedeeld THEN
            SELECT naam INTO v_ander FROM public.winkel_producten
             WHERE organization_id = p_org AND prijscode_nr = v_nr AND id <> p_product;
            IF FOUND THEN
                RAISE EXCEPTION 'Nummer % hoort al bij %', v_nr, v_ander USING ERRCODE = '23505';
            END IF;
            IF v_product.prijscode_nr IS DISTINCT FROM v_nr THEN
                UPDATE public.winkel_producten SET prijscode_nr = v_nr WHERE id = v_product.id;
            END IF;
        END IF;
    ELSIF v_gedeeld THEN
        RETURN jsonb_build_object('uitkomst', 'onbekend', 'nr', v_nr, 'gedeeld', true, 'prijs_cents', v_prijs);
    ELSE
        SELECT * INTO v_product FROM public.winkel_producten WHERE organization_id = p_org AND prijscode_nr = v_nr;
        IF NOT FOUND THEN
            RETURN jsonb_build_object('uitkomst', 'onbekend', 'nr', v_nr, 'gedeeld', false, 'prijs_cents', v_prijs);
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
    'Een gescand pakje met een prijscode (21 PPPP K CCCCC E) binnenmelden als stuk op voorraad, gezocht op de PLU. Uitkomst binnen | onbekend (PLU nog niet gekoppeld, of 0000 = gedeeld: geef p_product mee) | controlecijfer (EAN of K) | geen_prijscode.';
REVOKE ALL ON FUNCTION public.winkel_stuk_binnen_prijscode(UUID, TEXT, DATE, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.winkel_stuk_binnen_prijscode(UUID, TEXT, DATE, UUID) TO authenticated, service_role;

-- ── 4. Nakijken ─────────────────────────────────────────────────────────────
DO $$
BEGIN
    -- Echte stickers: haasbiefstuk pakje en krat, houthakkerssteak, gekruid gehakt (0000).
    IF private.prijscode_prijscontrole('02823') <> 5 OR private.prijscode_prijscontrole('07677') <> 2
       OR NOT private.prijscode_geldig('2101015028237') OR NOT private.prijscode_geldig('2101012076774')
       OR NOT private.prijscode_geldig('2102218007845') OR NOT private.prijscode_geldig('2100007066967')
       OR private.prijscode_geldig('2101015028230') THEN
        RAISE EXCEPTION 'winkel_prijscode_plu: de controlecijfers rekenen verkeerd';
    END IF;
    IF EXISTS (SELECT 1 FROM public.winkel_producten WHERE prijscode_nr IS NOT NULL AND prijscode_nr !~ '^[0-9]{4}$') THEN
        RAISE EXCEPTION 'winkel_prijscode_plu: niet alle nummers zijn ingekort';
    END IF;
    IF position('substr(v_code, 3, 4)' IN pg_get_functiondef('public.winkel_stuk_binnen_prijscode(uuid,text,date,uuid)'::REGPROCEDURE)) = 0 THEN
        RAISE EXCEPTION 'winkel_prijscode_plu: binnenmelden zoekt nog niet op de PLU';
    END IF;
END $$;

COMMIT;
