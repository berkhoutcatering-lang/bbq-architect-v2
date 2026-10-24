-- ════════════════════════════════════════════════════════════════════════════
--  Prijskaartjes voor de winkel — en de bierlijn van Elings als voorraad
--  Pagina: /voorraad/prijskaartjes · Rekenwerk en tekening: src/lib/winkel/prijskaartje.ts
-- ════════════════════════════════════════════════════════════════════════════
--
--  Het losse systeempje van Mathijs (hop-bites-prijskaartjes, 13 oktober 2026)
--  zit nu in BBQ Architect. Alles additief.
--
--    1. winkel_prijskaartjes: per winkelproduct de teksten van het kaartje
--       (soort, naam, maker, stijl en alcohol, inhoud, "Lekker bij", aantal,
--       printen). De prijs staat hier níet: dat is winkelprijs_incl_cents van
--       het product, zodat een prijswijziging op één plek gebeurt.
--    2. De dertig bieren uit bestelling C-6021 bij Elings Craftbeer Company
--       (20 oktober 2026) als winkelproduct, met een kaartje — alleen als er
--       nog geen product met dezelfde naam is. Zonder winkelprijs: die zet
--       Mathijs op de kaartjespagina. Zonder voorraad: die komt uit stap 3.
--    3. De levering als ontvangst in concept (voorraad_invoer, handmatig): 34
--       dozen, omgerekend naar flessen en blikken. Er gaat niets de voorraad in
--       voordat Mathijs op /voorraad/ontvangst "Klopt, boeken" zegt. De
--       prijzen per doos staan zoals op de bestelbevestiging, als excl. btw
--       (zoals een factuur); klopt dat niet, dan zet hij het daar om.
--
--  Opnieuw draaien is veilig: elke stap kijkt eerst of het er al is.


-- ── 0. Pre-flight ───────────────────────────────────────────────────────────
DO $$
BEGIN
    IF to_regclass('public.winkel_producten') IS NULL OR to_regclass('public.winkel_instellingen') IS NULL THEN
        RAISE EXCEPTION 'prijskaartjes: winkel_producten of winkel_instellingen ontbreekt';
    END IF;
    IF to_regclass('public.voorraad_invoer_regels') IS NULL THEN
        RAISE EXCEPTION 'prijskaartjes: voorraad_invoer ontbreekt (migratie 20260928140000)';
    END IF;
    IF to_regprocedure('private.user_org_ids()') IS NULL OR to_regprocedure('public.set_updated_at()') IS NULL THEN
        RAISE EXCEPTION 'prijskaartjes: private.user_org_ids() of set_updated_at() ontbreekt';
    END IF;
END $$;


-- ── 1. winkel_prijskaartjes ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.winkel_prijskaartjes (
    id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id    UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    winkel_product_id  UUID        NOT NULL UNIQUE REFERENCES public.winkel_producten(id) ON DELETE CASCADE,
    soort              TEXT,
    naam               TEXT        NOT NULL,
    maker              TEXT,
    details            TEXT,
    inhoud             NUMERIC     CHECK (inhoud IS NULL OR inhoud >= 0),
    -- 'los' = los gewogen: de prijs op het kaartje is per 100 gram.
    inhoud_eenheid     TEXT        NOT NULL DEFAULT 'cl' CHECK (inhoud_eenheid IN ('cl', 'ml', 'l', 'g', 'kg', 'los')),
    bij                TEXT,
    aantal             INTEGER     NOT NULL DEFAULT 1 CHECK (aantal BETWEEN 1 AND 50),
    printen            BOOLEAN     NOT NULL DEFAULT true,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.winkel_prijskaartjes IS
    'De teksten van het prijskaartje per winkelproduct (90 × 55 mm, schaphouder). De prijs is winkel_producten.winkelprijs_incl_cents.';
CREATE INDEX IF NOT EXISTS winkel_prijskaartjes_org_idx ON public.winkel_prijskaartjes(organization_id);

DROP TRIGGER IF EXISTS trg_winkel_prijskaartjes_updated_at ON public.winkel_prijskaartjes;
CREATE TRIGGER trg_winkel_prijskaartjes_updated_at BEFORE UPDATE ON public.winkel_prijskaartjes
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.winkel_prijskaartjes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.winkel_prijskaartjes FROM anon;

DROP POLICY IF EXISTS winkel_prijskaartjes_select ON public.winkel_prijskaartjes;
CREATE POLICY winkel_prijskaartjes_select ON public.winkel_prijskaartjes FOR SELECT TO authenticated
    USING (organization_id IN (SELECT private.user_org_ids()));
DROP POLICY IF EXISTS winkel_prijskaartjes_insert ON public.winkel_prijskaartjes;
CREATE POLICY winkel_prijskaartjes_insert ON public.winkel_prijskaartjes FOR INSERT TO authenticated
    WITH CHECK (organization_id IN (SELECT private.user_org_ids()));
DROP POLICY IF EXISTS winkel_prijskaartjes_update ON public.winkel_prijskaartjes;
CREATE POLICY winkel_prijskaartjes_update ON public.winkel_prijskaartjes FOR UPDATE TO authenticated
    USING (organization_id IN (SELECT private.user_org_ids()))
    WITH CHECK (organization_id IN (SELECT private.user_org_ids()));
DROP POLICY IF EXISTS winkel_prijskaartjes_delete ON public.winkel_prijskaartjes;
CREATE POLICY winkel_prijskaartjes_delete ON public.winkel_prijskaartjes FOR DELETE TO authenticated
    USING (organization_id IN (SELECT private.user_org_ids()));


-- ── 2. De bieren van Elings (bestelling C-6021, 20 oktober 2026) ────────────
--  Brouwerij, stijl, alcohol en inhoud zoals op de website (hop-en-bites-website,
--  lib/content/bier.ts); de inhoud en de doosgrootte uit de bestelling. Btw:
--  21 % met alcohol, 9 % voor alcoholvrij (tot en met 0,5 %).
DROP TABLE IF EXISTS pg_temp.elings_c6021;
CREATE TEMP TABLE elings_c6021 (
    volgorde         INTEGER,
    elings_naam      TEXT,
    product_naam     TEXT,
    kaart_naam       TEXT,
    maker            TEXT,
    details          TEXT,
    cl               NUMERIC,
    alcohol          BOOLEAN,
    btw_pct          INTEGER,
    soort            TEXT,
    per_doos         INTEGER,
    dozen            INTEGER,
    doosprijs_cents  INTEGER,
    verpakking       TEXT
);

INSERT INTO elings_c6021 VALUES
    (1, 'Rochefort 8', 'Rochefort 8', 'Rochefort 8', 'Rochefort', 'Trappist · 9,2%', 33, true, 21, 'Speciaalbier', 24, 1, 4156, '24×33CL'),
    (2, 'Prior 8', 'St. Bernardus Prior 8', 'Prior 8', 'St. Bernardus', 'Dubbel · 8%', 33, true, 21, 'Speciaalbier', 24, 1, 3270, '24×33CL'),
    (3, 'Achel Tripel', 'Achel Tripel', 'Achel Tripel', 'Achel', 'Tripel · 8%', 33, true, 21, 'Speciaalbier', 24, 1, 3599, '24×33CL'),
    (4, 'Achel Gallant Grand Cru Special', 'Achel Gallant Grand Cru Special', 'Gallant Grand Cru Special', 'Achel', 'Sterk blond · 9,5%', 33, true, 21, 'Speciaalbier', 24, 1, 4421, '24×33CL'),
    (5, 'Straffe Hendrik Quadrupel', 'Straffe Hendrik Quadrupel', 'Straffe Hendrik Quadrupel', 'De Halve Maan', 'Quadrupel · 11%', 33, true, 21, 'Speciaalbier', 24, 1, 5254, '24×33CL'),
    (6, 'Gouden Carolus Whisky Infused', 'Gouden Carolus Whisky Infused', 'Gouden Carolus Whisky Infused', 'Het Anker', 'Dark ale · 9%', 33, true, 21, 'Speciaalbier', 24, 1, 4337, '24×33CL'),
    (7, 'SchuppenBoer Grand Cru', 'Schuppenboer Grand Cru', 'Schuppenboer Grand Cru', 'Het Nest', 'Sterk blond · 9%', 33, true, 21, 'Speciaalbier', 24, 2, 4870, '24×33CL'),
    (8, 'Saison Dupont', 'Saison Dupont', 'Saison Dupont', 'Dupont', 'Saison · 6,5%', 33, true, 21, 'Speciaalbier', 24, 1, 2956, '24×33CL'),
    (9, 'Kriek', 'Boon Oude Kriek', 'Oude Kriek', 'Boon', 'Kriek · 6,5%', 37.5, true, 21, 'Speciaalbier', 12, 1, 2839, '12×37,5CL'),
    (10, 'Geuze Mariage Parfait', 'Boon Oude Geuze Mariage Parfait', 'Oude Geuze Mariage Parfait', 'Boon', 'Oude geuze · 8%', 37.5, true, 21, 'Speciaalbier', 12, 1, 3962, '12×37,5CL'),
    (11, 'Tank 7', 'Boulevard Tank 7', 'Tank 7', 'Boulevard Brewing Co.', 'Farmhouse ale · 8,5%', 33, true, 21, 'Speciaalbier', 24, 2, 5110, '24×33CL'),
    (12, 'Lazurite', 'Warpigs Lazurite', 'Lazurite', 'Warpigs', 'American IPA · 7,4%', 44, true, 21, 'Speciaalbier', 12, 1, 3668, '12×44CL'),
    (13, 'Imparable', 'Basqueland Imparable', 'Imparable', 'Basqueland', 'West Coast IPA · 6,8%', 33, true, 21, 'Speciaalbier', 24, 1, 4615, '24×33CL'),
    (14, 'Ocata', 'Garage Ocata', 'Ocata', 'Garage Beer Co.', 'Session IPA · 5,4%', 33, true, 21, 'Speciaalbier', 16, 1, 3374, '16×33CL'),
    (15, 'Patt', 'Pühaste Patt', 'Patt', 'Pühaste', 'American porter · 6,6%', 33, true, 21, 'Speciaalbier', 24, 1, 4555, '24×33CL'),
    (16, 'Madame Butterfly', 'Pühaste Madame Butterfly', 'Madame Butterfly', 'Pühaste', 'Amber ale · 6%', 33, true, 21, 'Speciaalbier', 24, 1, 4727, '24×33CL'),
    (17, 'Patience & Fortitude', 'Wild East Patience & Fortitude', 'Patience & Fortitude', 'Wild East Brewing Co.', 'Tsjechische pils · 4,7%', 47.3, true, 21, 'Speciaalbier', 6, 1, 1906, '6×47,3CL'),
    (18, 'Quad', 'Moersleutel Quad', 'Quad', 'Moersleutel', 'Quadrupel · 11%', 33, true, 21, 'Speciaalbier', 12, 2, 2914, '12×33CL'),
    (19, 'Tripel for the Crowd', 'Oproer Tripel for the Crowd', 'Tripel for the Crowd', 'Oproer', 'Tripel · 8,5%', 33, true, 21, 'Speciaalbier', 24, 1, 5300, '24×33CL'),
    (20, 'Weihenstephaner Vitus', 'Weihenstephaner Vitus', 'Vitus', 'Weihenstephaner', 'Weizenbock · 7,7%', 50, true, 21, 'Speciaalbier', 20, 1, 3507, '20×50CL'),
    (21, 'Celebrator Dobbelbock', 'Ayinger Celebrator', 'Celebrator', 'Ayinger', 'Doppelbock · 6,7%', 33, true, 21, 'Speciaalbier', 24, 1, 3009, '24×33CL'),
    (22, 'Ayinger Bräuweisse', 'Ayinger Bräuweisse', 'Bräuweisse', 'Ayinger', 'Hefeweizen · 5,1%', 50, true, 21, 'Speciaalbier', 20, 1, 2740, '20×50CL'),
    (23, 'Salted Caramel Choc Chip Cookie', 'Amundsen Salted Caramel Chocolate Chip Cookie', 'Salted Caramel Chocolate Chip Cookie', 'Amundsen', 'Pastry stout · 10,5%', 33, true, 21, 'Speciaalbier', 12, 1, 3615, '12×33CL'),
    (24, 'Strawberry Sundae', 'Vault City Strawberry Sundae', 'Strawberry Sundae', 'Vault City', 'Fruited sour · 5%', 33, true, 21, 'Speciaalbier', 24, 1, 4430, '24×33CL'),
    (25, 'Placebo 0.0%', 'Lupulus Placebo 0,0%', 'Placebo 0,0%', 'Lupulus', 'Blond · 0,0%', 33, false, 9, 'Alcoholvrij', 24, 1, 3616, '24×33CL'),
    (26, 'Maisel''s Weisse Alkoholfrei', 'Maisel''s Weisse Alkoholfrei', 'Weisse Alkoholfrei', 'Maisel''s', 'Weissbier · 0,5%', 50, false, 9, 'Alcoholvrij', 20, 1, 2123, '20×50CL'),
    (27, 'Bon Chef 0.5%', 'Two Chefs Bon Chef 0,5%', 'Bon Chef 0,5%', 'Two Chefs Brewing', 'Alcoholvrije IPA · 0,5%', 33, false, 9, 'Alcoholvrij', 12, 2, 2148, '12×33CL'),
    (28, 'Luwte', 'Homeland Luwte', 'Luwte', 'Homeland', 'Citrus blond · 0,5%', 33, false, 9, 'Alcoholvrij', 24, 1, 4701, '24×33CL'),
    (29, 'Bali', 'Prizm Bali', 'Bali', 'Prizm Brewing Co.', 'NEIPA · 5,7%', 33, true, 21, 'Speciaalbier', 24, 1, 4758, '24×33CL'),
    (30, 'Kasteel Tropical 0.0', 'Kasteel Tropical 0,0%', 'Tropical 0,0%', 'Kasteel', 'Alcoholvrij fruitbier · 0,0%', 33, false, 9, 'Alcoholvrij', 24, 1, 3949, '24×33CL')
;

INSERT INTO public.winkel_producten (organization_id, naam, type, eenheid, prijs_per, btw_pct, alcohol, actief)
SELECT i.organization_id, e.product_naam, 'bier', 'stuk', 1, e.btw_pct, e.alcohol, true
  FROM public.winkel_instellingen i
 CROSS JOIN elings_c6021 e
 WHERE NOT EXISTS (
        SELECT 1 FROM public.winkel_producten p
         WHERE p.organization_id = i.organization_id AND lower(p.naam) = lower(e.product_naam));

INSERT INTO public.winkel_prijskaartjes (organization_id, winkel_product_id, soort, naam, maker, details, inhoud, inhoud_eenheid)
SELECT p.organization_id, p.id, e.soort, e.kaart_naam, e.maker, e.details, e.cl, 'cl'
  FROM public.winkel_producten p
  JOIN elings_c6021 e ON lower(p.naam) = lower(e.product_naam)
 WHERE p.organization_id IN (SELECT organization_id FROM public.winkel_instellingen)
ON CONFLICT (winkel_product_id) DO NOTHING;


-- ── 3. De levering als ontvangst in concept ─────────────────────────────────
DO $$
DECLARE
    v_org    UUID;
    v_invoer UUID;
BEGIN
    FOR v_org IN SELECT organization_id FROM public.winkel_instellingen LOOP
        CONTINUE WHEN EXISTS (
            SELECT 1 FROM public.voorraad_invoer
             WHERE organization_id = v_org AND lower(factuurnummer) = 'c-6021');

        INSERT INTO public.voorraad_invoer (organization_id, bron, status, leverancier_naam, factuurnummer, datum, totaal_cents, prijzen_incl_btw, notitie)
        VALUES (v_org, 'handmatig', 'concept', 'Elings Craftbeer Company', 'C-6021', DATE '2026-10-20', 129471, false,
                'Bestelbevestiging van 20 oktober 2026: 30 bieren, 34 dozen. Controleer de aantallen tegen de levering en de btw tegen de factuur, dan boeken.')
        RETURNING id INTO v_invoer;

        INSERT INTO public.voorraad_invoer_regels (organization_id, invoer_id, volgorde, bron_naam, bron_aantal, bron_eenheid, bron_prijs_cents,
                                                   btw_pct, plek, winkel_product_id, omrekening, aantal, voorstel)
        SELECT v_org, v_invoer, e.volgorde, e.elings_naam, e.dozen, e.verpakking, e.doosprijs_cents,
               e.btw_pct, 'winkel', p.id, e.per_doos, e.dozen * e.per_doos, 'naam'
          FROM elings_c6021 e
          LEFT JOIN LATERAL (
                SELECT id FROM public.winkel_producten
                 WHERE organization_id = v_org AND lower(naam) = lower(e.product_naam)
                 ORDER BY created_at LIMIT 1) p ON true
         ORDER BY e.volgorde;
    END LOOP;
END $$;


-- ── 4. Verificatie ──────────────────────────────────────────────────────────
DO $$
BEGIN
    IF (SELECT count(*) FROM elings_c6021) <> 30 OR (SELECT sum(dozen * doosprijs_cents) FROM elings_c6021) <> 129471 THEN
        RAISE EXCEPTION 'prijskaartjes: de bestelling C-6021 klopt niet (30 regels, € 1.294,71)';
    END IF;
END $$;

DROP TABLE IF EXISTS pg_temp.elings_c6021;
