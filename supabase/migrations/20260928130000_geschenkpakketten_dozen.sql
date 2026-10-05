-- ════════════════════════════════════════════════════════════════════════════
--  Geschenkpakketten — hernoemen, twee marmelades, QR per doos, myPOS-ordernummer
--  Opdracht: docs/OVERDRACHT-BBQ-ARCHITECT-GESCHENKPAKKETTEN.md §0, S4, S7
--  Plan: docs/sinterklaas-bouwplan.md · docs/voorraad-bouwplan.md
-- ════════════════════════════════════════════════════════════════════════════
--
--  1. Niets hangt aan Sinterklaas (besluit 0): nieuwe slugs, namen en
--     momentgroepen. Er zijn nog geen orders; alleen rijen met de oude slug
--     worden aangepast, dus een tweede keer draaien doet niets.
--  2. Bier € 50, Wijn € 50 en Bier & wijn € 50: bier- én rodewijnmarmelade
--     (twee slots). "Pizza-dipcrackers" heet "Pizzacrackers".
--  3. QR per doos (S7): winkel_dozen, één rij per etiket, met een onraadbare
--     code die bij het printen ontstaat. Aan de balie zet een scan de doos op
--     opgehaald (winkel_doos_ophalen); de Experience-app leest met dezelfde
--     code alleen het artikel, nooit persoonsgegevens.
--  4. Het myPOS-ordernummer krijgt weer zijn achtervoegsel van 6 tekens uit
--     het token (was per ongeluk weggevallen in 20260927120000). Zonder dat
--     weigert myPOS een OrderID die hij al kent, bijvoorbeeld na een reset
--     van de ordernummerteller.
--
--  Foutcodes erbij:
--    WV007  doos hoort niet bij een betaalde order


-- ── 0. Pre-flight ───────────────────────────────────────────────────────────
DO $$
BEGIN
    IF to_regclass('public.winkel_artikel_slots') IS NULL THEN
        RAISE EXCEPTION 'geschenkpakketten: winkel_artikel_slots ontbreekt (migratie 20260927120000)';
    END IF;
    IF to_regprocedure('public.winkel_zet_klaargezet(uuid, bigint, boolean)') IS NULL THEN
        RAISE EXCEPTION 'geschenkpakketten: winkel_zet_klaargezet ontbreekt (migratie 20260928120100)';
    END IF;
END $$;


-- ── 1. Hernoemen (§0) ───────────────────────────────────────────────────────
UPDATE public.winkel_artikelen a
   SET slug = n.nieuw, naam = COALESCE(n.naam, a.naam),
       moment_groep = CASE a.moment_groep WHEN 'sint-plank' THEN 'borrelplank' WHEN 'sint-pakket' THEN 'geschenkpakket' ELSE a.moment_groep END
  FROM (VALUES
        ('sinterklaas-borrelplank', 'borrelplank',     'Borrelplank'),
        ('sint-bier-20',            'bierpakket-20',   NULL),
        ('sint-bier-35',            'bierpakket-35',   NULL),
        ('sint-bier-50',            'bierpakket-50',   NULL),
        ('sint-wijn-35',            'wijnpakket-35',   NULL),
        ('sint-wijn-50',            'wijnpakket-50',   NULL),
        ('sint-bier-wijn-35',       'bier-en-wijn-35', NULL),
        ('sint-bier-wijn-50',       'bier-en-wijn-50', NULL)
       ) AS n(oud, nieuw, naam)
 WHERE a.slug = n.oud
   AND NOT EXISTS (SELECT 1 FROM public.winkel_artikelen b WHERE b.organization_id = a.organization_id AND b.slug = n.nieuw);

UPDATE public.winkel_momenten SET groep = 'borrelplank'    WHERE groep = 'sint-plank';
UPDATE public.winkel_momenten SET groep = 'geschenkpakket' WHERE groep = 'sint-pakket';


-- ── 2. Pizzacrackers en twee marmelades ─────────────────────────────────────
UPDATE public.winkel_producten SET naam = 'Pizzacrackers 60 g (bakje)' WHERE naam = 'Pizza-dipcrackers 60 g (bakje)';
UPDATE public.winkel_producten SET naam = 'Pizzacrackers (los)'        WHERE naam = 'Pizza-dipcrackers (los)';
UPDATE public.winkel_artikel_slots SET naam = 'Pizzacrackers (bakje 60 g)' WHERE naam = 'Pizza-dipcrackers (bakje 60 g)';
UPDATE public.winkel_artikel_slots SET naam = 'Pizzacrackers'              WHERE naam = 'Pizza-dipcrackers (los)';

-- Biermarmelade als product, zonder prijzen: die staan niet in de opdracht.
INSERT INTO public.winkel_producten (organization_id, naam, type, eenheid, prijs_per, btw_pct, alcohol, actief)
SELECT DISTINCT a.organization_id, 'Biermarmelade', 'marmelade', 'stuk', 1, 9, false, true
  FROM public.winkel_artikelen a
 WHERE a.slug IN ('bierpakket-50', 'wijnpakket-50', 'bier-en-wijn-50')
   AND NOT EXISTS (SELECT 1 FROM public.winkel_producten p WHERE p.organization_id = a.organization_id AND p.naam = 'Biermarmelade');

-- De € 50-pakketten: het oude ene marmelade-slot eruit, bier + rode wijn erin.
-- Alleen zolang er nog geen orders op dat artikel staan.
DO $$
DECLARE
    a RECORD;
    v_volgorde INTEGER;
BEGIN
    FOR a IN
        SELECT id, organization_id FROM public.winkel_artikelen
         WHERE slug IN ('bierpakket-50', 'wijnpakket-50', 'bier-en-wijn-50')
           AND NOT EXISTS (SELECT 1 FROM public.winkel_order_regels r WHERE r.artikel_id = winkel_artikelen.id)
    LOOP
        CONTINUE WHEN (SELECT count(*) FROM public.winkel_artikel_slots WHERE artikel_id = a.id AND slot_type = 'marmelade') = 2
                  AND EXISTS (SELECT 1 FROM public.winkel_artikel_slots WHERE artikel_id = a.id AND naam = 'Biermarmelade');
        SELECT COALESCE(min(volgorde), 90) INTO v_volgorde FROM public.winkel_artikel_slots WHERE artikel_id = a.id AND slot_type = 'marmelade';
        DELETE FROM public.winkel_artikel_slots WHERE artikel_id = a.id AND slot_type = 'marmelade';
        INSERT INTO public.winkel_artikel_slots (organization_id, artikel_id, volgorde, slot_type, naam, hoeveelheid, eenheid, per, standaard_product_id)
        VALUES
            (a.organization_id, a.id, v_volgorde, 'marmelade', 'Biermarmelade', 1, 'stuk', 'stuk',
             (SELECT id FROM public.winkel_producten WHERE organization_id = a.organization_id AND naam = 'Biermarmelade' LIMIT 1)),
            (a.organization_id, a.id, v_volgorde, 'marmelade', 'Rodewijnmarmelade', 1, 'stuk', 'stuk',
             (SELECT id FROM public.winkel_producten WHERE organization_id = a.organization_id AND naam = 'Marmelade rode wijn' LIMIT 1));
    END LOOP;
END $$;


-- ── 3. Dozen: één QR per pakket of schaal (S7) ──────────────────────────────
CREATE TABLE IF NOT EXISTS public.winkel_dozen (
    id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id  UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    order_id         BIGINT      NOT NULL REFERENCES public.winkel_orders(id) ON DELETE CASCADE,
    order_regel_id   BIGINT      NOT NULL REFERENCES public.winkel_order_regels(id) ON DELETE CASCADE,
    volgnr           INTEGER     NOT NULL CHECK (volgnr > 0),
    totaal           INTEGER     NOT NULL CHECK (totaal > 0),
    -- Wat er op het etiket staat: "Bierpakket € 35" of "Borrelplank · kleine schaal · 3 pers."
    omschrijving     TEXT        NOT NULL,
    -- 64 hex-tekens uit twee random uuid's (≥ 128 bit willekeur): onraadbaar.
    code             TEXT        NOT NULL UNIQUE DEFAULT replace(gen_random_uuid()::TEXT || gen_random_uuid()::TEXT, '-', ''),
    opgehaald_at     TIMESTAMPTZ,
    opgehaald_door   UUID,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (order_regel_id, volgnr)
);
COMMENT ON TABLE public.winkel_dozen IS
    'Eén rij per etiket (pakket of schaal). De code staat in de QR ({qr_basis_url}/g/{code}): aan de balie = opgehaald, op een telefoon = de Experience-app. Ontstaat bij het printen.';
CREATE INDEX IF NOT EXISTS winkel_dozen_order_idx ON public.winkel_dozen(order_id);

ALTER TABLE public.winkel_dozen ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS winkel_dozen_select ON public.winkel_dozen;
CREATE POLICY winkel_dozen_select ON public.winkel_dozen FOR SELECT TO authenticated
    USING (organization_id IN (SELECT private.user_org_ids()));
-- Bijwerken alleen voor de handmatige knop "opgehaald" aan de balie; aanmaken
-- gaat via winkel_dozen_voor_regel, scannen via winkel_doos_ophalen.
DROP POLICY IF EXISTS winkel_dozen_update ON public.winkel_dozen;
CREATE POLICY winkel_dozen_update ON public.winkel_dozen FOR UPDATE TO authenticated
    USING      (organization_id IN (SELECT private.user_org_ids()))
    WITH CHECK (organization_id IN (SELECT private.user_org_ids()));

-- De dozen van één regel: bestaande houden hun code, ontbrekende komen erbij.
-- p_omschrijvingen: per volgnr (1..n) de tekst van het etiket.
-- Geeft [{volgnr, code}] in volgorde.
CREATE OR REPLACE FUNCTION public.winkel_dozen_voor_regel(p_org UUID, p_regel_id BIGINT, p_omschrijvingen TEXT[])
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_regel  public.winkel_order_regels%ROWTYPE;
    v_status TEXT;
    v_n      INTEGER := COALESCE(array_length(p_omschrijvingen, 1), 0);
BEGIN
    IF auth.uid() IS NOT NULL AND p_org NOT IN (SELECT private.user_org_ids()) THEN
        RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
    END IF;
    SELECT * INTO v_regel FROM public.winkel_order_regels WHERE id = p_regel_id AND organization_id = p_org FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'regel % niet in deze organisatie', p_regel_id USING ERRCODE = 'P0002';
    END IF;
    SELECT status INTO v_status FROM public.winkel_orders WHERE id = v_regel.order_id;
    IF v_status <> 'betaald' THEN
        RAISE EXCEPTION 'alleen een betaalde order krijgt dozen' USING ERRCODE = 'WV007';
    END IF;

    INSERT INTO public.winkel_dozen (organization_id, order_id, order_regel_id, volgnr, totaal, omschrijving)
    SELECT p_org, v_regel.order_id, p_regel_id, i, v_n, p_omschrijvingen[i]
      FROM generate_series(1, v_n) i
    ON CONFLICT (order_regel_id, volgnr) DO UPDATE SET totaal = EXCLUDED.totaal, omschrijving = EXCLUDED.omschrijving;

    RETURN (SELECT COALESCE(jsonb_agg(jsonb_build_object('volgnr', volgnr, 'code', code) ORDER BY volgnr), '[]'::jsonb)
              FROM public.winkel_dozen WHERE order_regel_id = p_regel_id AND volgnr <= v_n);
END $$;
REVOKE ALL ON FUNCTION public.winkel_dozen_voor_regel(UUID, BIGINT, TEXT[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.winkel_dozen_voor_regel(UUID, BIGINT, TEXT[]) TO authenticated, service_role;

-- De balie scant een doos. Idempotent: een tweede scan geeft al_opgehaald.
--   p_rest_methode: bij een reservering met openstaand rest eerst 'contant'
--   of 'pin'; zonder methode komt 'rest_nodig' terug en verandert er niets.
-- Was de regel nog niet ingepakt, dan boekt dit hem eerst af (een doos die
-- over de toonbank gaat is ingepakt). Als alle dozen van een regel gescand
-- zijn, krijgt de regel opgehaald_at.
CREATE OR REPLACE FUNCTION public.winkel_doos_ophalen(p_org UUID, p_code TEXT, p_rest_methode TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_uid     UUID := auth.uid();
    v_doos    public.winkel_dozen%ROWTYPE;
    v_order   public.winkel_orders%ROWTYPE;
    v_regel   public.winkel_order_regels%ROWTYPE;
    v_open    INTEGER;
    v_zonder  INTEGER;
BEGIN
    IF v_uid IS NOT NULL AND p_org NOT IN (SELECT private.user_org_ids()) THEN
        RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
    END IF;

    SELECT * INTO v_doos FROM public.winkel_dozen WHERE organization_id = p_org AND code = btrim(p_code) FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('uitkomst', 'onbekend');
    END IF;
    SELECT * INTO v_order FROM public.winkel_orders WHERE id = v_doos.order_id FOR UPDATE;
    SELECT * INTO v_regel FROM public.winkel_order_regels WHERE id = v_doos.order_regel_id;

    IF v_doos.opgehaald_at IS NOT NULL THEN
        RETURN jsonb_build_object('uitkomst', 'al_opgehaald', 'opgehaald_at', v_doos.opgehaald_at,
            'nummer', v_order.nummer, 'klant', v_order.contact_naam, 'doos', v_doos.omschrijving);
    END IF;
    IF v_order.status <> 'betaald' THEN
        RETURN jsonb_build_object('uitkomst', 'niet_betaald', 'status', v_order.status, 'nummer', v_order.nummer);
    END IF;

    IF v_order.betaalwijze = 'reservering' AND v_order.rest_cents > 0 AND v_order.rest_betaald_at IS NULL THEN
        IF p_rest_methode IS NULL OR p_rest_methode NOT IN ('contant', 'pin') THEN
            RETURN jsonb_build_object('uitkomst', 'rest_nodig', 'rest_cents', v_order.rest_cents,
                'reeds_cents', v_order.nu_te_betalen_cents, 'nummer', v_order.nummer, 'klant', v_order.contact_naam, 'doos', v_doos.omschrijving);
        END IF;
        UPDATE public.winkel_orders SET rest_betaald_at = now(), rest_betaalmethode = p_rest_methode WHERE id = v_order.id;
    END IF;

    IF v_regel.klaargezet_at IS NULL THEN
        PERFORM public.winkel_zet_klaargezet(p_org, v_regel.id, true);
    END IF;

    UPDATE public.winkel_dozen SET opgehaald_at = now(), opgehaald_door = v_uid WHERE id = v_doos.id;

    IF NOT EXISTS (SELECT 1 FROM public.winkel_dozen WHERE order_regel_id = v_regel.id AND opgehaald_at IS NULL) THEN
        UPDATE public.winkel_order_regels SET opgehaald_at = now(), opgehaald_door = v_uid WHERE id = v_regel.id;
    END IF;

    -- Wat de balie nog mist van deze order: ongescande dozen, en regels
    -- waarvoor nog geen etiket (dus geen doos) is geprint.
    SELECT count(*) INTO v_open FROM public.winkel_dozen WHERE order_id = v_order.id AND opgehaald_at IS NULL;
    SELECT count(*) INTO v_zonder FROM public.winkel_order_regels r
     WHERE r.order_id = v_order.id AND NOT EXISTS (SELECT 1 FROM public.winkel_dozen d WHERE d.order_regel_id = r.id);

    RETURN jsonb_build_object('uitkomst', 'opgehaald', 'nummer', v_order.nummer, 'klant', v_order.contact_naam,
        'doos', v_doos.omschrijving, 'volgnr', v_doos.volgnr, 'totaal', v_doos.totaal,
        'nog_open', v_open, 'regels_zonder_etiket', v_zonder,
        'rest_geboekt', CASE WHEN p_rest_methode IS NOT NULL AND v_order.betaalwijze = 'reservering' AND v_order.rest_betaald_at IS NULL THEN p_rest_methode ELSE NULL END);
END $$;
REVOKE ALL ON FUNCTION public.winkel_doos_ophalen(UUID, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.winkel_doos_ophalen(UUID, TEXT, TEXT) TO authenticated, service_role;


-- ── 4. myPOS-ordernummer weer uniek ─────────────────────────────────────────
-- Gelijk aan 20260927120000 §14, met het achtervoegsel uit 20260913200000 terug.
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
           mypos_order_id = nummer || '-' || (betaalpoging + 1) || '-' || substr(token, 1, 6)
     WHERE id = p_order_id
    RETURNING * INTO v_order;

    RETURN v_order;
END $$;
