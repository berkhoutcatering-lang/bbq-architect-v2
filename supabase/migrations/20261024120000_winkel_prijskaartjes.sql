-- ════════════════════════════════════════════════════════════════════════════
--  Prijskaartjes voor de winkel — en wat er in de winkel ligt
--  Pagina: /voorraad/prijskaartjes · Rekenwerk en tekening: src/lib/winkel/prijskaartje.ts
-- ════════════════════════════════════════════════════════════════════════════
--
--  Het losse systeempje van Mathijs (hop-bites-prijskaartjes, 13 oktober 2026)
--  zit nu in BBQ Architect. Alles additief, en opnieuw draaien is veilig:
--  elke stap kijkt eerst of het er al is.
--
--    1. winkel_prijskaartjes: per winkelproduct de teksten van het kaartje
--       (soort, naam, maker, details, inhoud, statiegeld, actie, "Lekker bij",
--       aantal, printen). De prijs staat hier níet: dat is
--       winkelprijs_incl_cents van het product, één plek voor een prijs.
--    2. Wat er in de winkel ligt (26 oktober 2026), als winkelproduct met een
--       kaartje — alleen als er nog geen product met dezelfde naam is:
--         · bier: de dertig bieren uit bestelling C-6021 bij Elings Craftbeer
--           Company (20 oktober). De kopbalk is de stijlgroep van de website;
--           blik met € 0,15 statiegeld;
--         · wijn: twintig wijnen uit de wijnlijst van Mathijs (2 oktober), met
--           zijn verkoopprijs. Niet de drie ports en de Amarone: 15 % of meer;
--         · noten en zoet: de 31 producten uit offerte 31423 van Noix
--           (16 oktober), met de acties van Noix op het kaartje (blauw 3 voor
--           € 12, groen 2 voor € 7, rood 3 voor € 7);
--         · de drie droge worsten van de website, € 4,65 (Mathijs, 2 oktober).
--       Prijzen: wijn en worst van Mathijs; bier en noten een VOORSTEL (bier op
--       het niveau van de goedkopere webwinkels, noten passend bij de acties
--       van Noix). Een prijs wordt alleen gezet waar het product nog geen
--       winkelprijs heeft; Mathijs past hem aan op de kaartjespagina.
--    3. De leveringen van Elings en Noix als ontvangst in concept
--       (voorraad_invoer, handmatig). Er gaat niets de voorraad in voordat
--       Mathijs op /voorraad/ontvangst "Klopt, boeken" zegt. De prijzen staan
--       zoals op het papier, excl. btw.


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
    -- Per stuk, onder de prijs: "+ € 0,15 statiegeld". NULL = geen.
    statiegeld_cents   INTEGER     CHECK (statiegeld_cents IS NULL OR statiegeld_cents >= 0),
    -- Boven de prijs: "3 voor € 12". NULL = geen.
    actie              TEXT,
    bij                TEXT,
    aantal             INTEGER     NOT NULL DEFAULT 1 CHECK (aantal BETWEEN 1 AND 50),
    printen            BOOLEAN     NOT NULL DEFAULT true,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.winkel_prijskaartjes IS
    'De teksten van het prijskaartje per winkelproduct (85 × 55 mm, schaphouder). De prijs is winkel_producten.winkelprijs_incl_cents.';
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


-- ── 2. Wat er in de winkel ligt ─────────────────────────────────────────────
--  bron: elings (bier), wijn, noix (noten en zoet), worst. Btw 21 % met
--  alcohol, 9 % zonder (alcoholvrij is tot en met 0,5 %). Bier: brouwerij,
--  land, stijl en alcohol zoals op de website (lib/content/bier.ts en de
--  proefkaarten), inhoud en doosgrootte uit de bestelling. Wijn: producent,
--  streek, druif en jaargang uit de wijnlijst. "Lekker bij" is een voorstel.
DROP TABLE IF EXISTS pg_temp.winkel_c;
CREATE TEMP TABLE winkel_c (
    bron              TEXT,
    volgorde          INTEGER,
    bron_naam         TEXT,
    product_naam      TEXT,
    type              TEXT,
    btw_pct           INTEGER,
    alcohol           BOOLEAN,
    prijs_cents       INTEGER,
    inkoop_cents      INTEGER,
    soort             TEXT,
    kaart_naam        TEXT,
    maker             TEXT,
    details           TEXT,
    inhoud            NUMERIC,
    inhoud_eenheid    TEXT,
    statiegeld_cents  INTEGER,
    actie             TEXT,
    bij               TEXT,
    per_doos          INTEGER,
    bron_aantal       INTEGER,
    bron_prijs_cents  INTEGER,
    bron_eenheid      TEXT
);

INSERT INTO winkel_c VALUES
    ('elings', 1, 'Rochefort 8', 'Rochefort 8', 'bier', 21, true, 295, NULL, 'Donker en zwaar', 'Rochefort 8', 'Rochefort · België', 'Trappist · 9,2%', 33, 'cl', NULL, NULL, 'oude kaas', 24, 1, 4156, '24×33CL'),
    ('elings', 2, 'Prior 8', 'St. Bernardus Prior 8', 'bier', 21, true, 235, NULL, 'Donker en zwaar', 'Prior 8', 'St. Bernardus · België', 'Dubbel · 8%', 33, 'cl', NULL, NULL, 'spareribs', 24, 1, 3270, '24×33CL'),
    ('elings', 3, 'Achel Tripel', 'Achel Tripel', 'bier', 21, true, 260, NULL, 'Blond, tripel en saison', 'Achel Tripel', 'Achel · België', 'Tripel · 8%', 33, 'cl', NULL, NULL, 'pulled chicken', 24, 1, 3599, '24×33CL'),
    ('elings', 4, 'Achel Gallant Grand Cru Special', 'Achel Gallant Grand Cru Special', 'bier', 21, true, 295, NULL, 'Blond, tripel en saison', 'Gallant Grand Cru Special', 'Achel · België', 'Sterk blond · 9,5%', 33, 'cl', NULL, NULL, 'kip van de grill', 24, 1, 4421, '24×33CL'),
    ('elings', 5, 'Straffe Hendrik Quadrupel', 'Straffe Hendrik Quadrupel', 'bier', 21, true, 360, NULL, 'Donker en zwaar', 'Straffe Hendrik Quadrupel', 'De Halve Maan · België', 'Quadrupel · 11%', 33, 'cl', NULL, NULL, 'rendang', 24, 1, 5254, '24×33CL'),
    ('elings', 6, 'Gouden Carolus Whisky Infused', 'Gouden Carolus Whisky Infused', 'bier', 21, true, 295, NULL, 'Donker en zwaar', 'Gouden Carolus Whisky Infused', 'Het Anker · België', 'Dark ale · 9%', 33, 'cl', NULL, NULL, 'pure chocolade', 24, 1, 4337, '24×33CL'),
    ('elings', 7, 'SchuppenBoer Grand Cru', 'Schuppenboer Grand Cru', 'bier', 21, true, 320, NULL, 'Blond, tripel en saison', 'Schuppenboer Grand Cru', 'Het Nest · België', 'Sterk blond · 9%', 33, 'cl', NULL, NULL, 'belegen kaas', 24, 2, 4870, '24×33CL'),
    ('elings', 8, 'Saison Dupont', 'Saison Dupont', 'bier', 21, true, 240, NULL, 'Blond, tripel en saison', 'Saison Dupont', 'Dupont · België', 'Saison · 6,5%', 33, 'cl', NULL, NULL, 'de borrelplank', 24, 1, 2956, '24×33CL'),
    ('elings', 9, 'Kriek', 'Boon Oude Kriek', 'bier', 21, true, 465, NULL, 'Zuur en fruit', 'Oude Kriek', 'Boon · België', 'Kriek · 6,5%', 37.5, 'cl', NULL, NULL, 'buikspek', 12, 1, 2839, '12×37,5CL'),
    ('elings', 10, 'Geuze Mariage Parfait', 'Boon Oude Geuze Mariage Parfait', 'bier', 21, true, 435, NULL, 'Zuur en fruit', 'Oude Geuze Mariage Parfait', 'Boon · België', 'Oude geuze · 8%', 37.5, 'cl', NULL, NULL, 'oude kaas', 12, 1, 3962, '12×37,5CL'),
    ('elings', 11, 'Tank 7', 'Boulevard Tank 7', 'bier', 21, true, 385, NULL, 'Blond, tripel en saison', 'Tank 7', 'Boulevard Brewing Co. · Verenigde Staten', 'Farmhouse ale · 8,5%', 33, 'cl', NULL, NULL, 'pulled pork', 24, 2, 5110, '24×33CL'),
    ('elings', 12, 'Lazurite', 'Warpigs Lazurite', 'bier', 21, true, 535, NULL, 'Hop en IPA', 'Lazurite', 'Warpigs · Denemarken', 'American IPA · 7,4%', 44, 'cl', 15, NULL, 'BBQ-amandelen', 12, 1, 3668, '12×44CL'),
    ('elings', 13, 'Imparable', 'Basqueland Imparable', 'bier', 21, true, 345, NULL, 'Hop en IPA', 'Imparable', 'Basqueland · Spanje', 'West Coast IPA · 6,8%', 33, 'cl', 15, NULL, 'pulled chicken', 24, 1, 4615, '24×33CL'),
    ('elings', 14, 'Ocata', 'Garage Ocata', 'bier', 21, true, 355, NULL, 'Hop en IPA', 'Ocata', 'Garage Beer Co. · Spanje', 'Session IPA · 5,4%', 33, 'cl', 15, NULL, 'de borrelplank', 16, 1, 3374, '16×33CL'),
    ('elings', 15, 'Patt', 'Pühaste Patt', 'bier', 21, true, 350, NULL, 'Donker en zwaar', 'Patt', 'Pühaste · Estland', 'American porter · 6,6%', 33, 'cl', 15, NULL, 'spareribs', 24, 1, 4555, '24×33CL'),
    ('elings', 16, 'Madame Butterfly', 'Pühaste Madame Butterfly', 'bier', 21, true, 350, NULL, 'Pils en amber', 'Madame Butterfly', 'Pühaste · Estland', 'Amber ale · 6%', 33, 'cl', NULL, NULL, 'pulled pork', 24, 1, 4727, '24×33CL'),
    ('elings', 17, 'Patience & Fortitude', 'Wild East Patience & Fortitude', 'bier', 21, true, 695, NULL, 'Pils en amber', 'Patience & Fortitude', 'Wild East Brewing Co. · Verenigde Staten', 'Tsjechische pils · 4,7%', 47.3, 'cl', 15, NULL, 'droge worst', 6, 1, 1906, '6×47,3CL'),
    ('elings', 18, 'Quad', 'Moersleutel Quad', 'bier', 21, true, 495, NULL, 'Donker en zwaar', 'Quad', 'Moersleutel · Nederland', 'Quadrupel · 11%', 33, 'cl', 15, NULL, 'pure chocolade', 12, 2, 2914, '12×33CL'),
    ('elings', 19, 'Tripel for the Crowd', 'Oproer Tripel for the Crowd', 'bier', 21, true, 395, NULL, 'Blond, tripel en saison', 'Tripel for the Crowd', 'Oproer · Nederland', 'Tripel · 8,5%', 33, 'cl', 15, NULL, 'pulled chicken', 24, 1, 5300, '24×33CL'),
    ('elings', 20, 'Weihenstephaner Vitus', 'Weihenstephaner Vitus', 'bier', 21, true, 295, NULL, 'Weizen', 'Vitus', 'Weihenstephaner · Duitsland', 'Weizenbock · 7,7%', 50, 'cl', NULL, NULL, 'kip van de grill', 20, 1, 3507, '20×50CL'),
    ('elings', 21, 'Celebrator Dobbelbock', 'Ayinger Celebrator', 'bier', 21, true, 215, NULL, 'Donker en zwaar', 'Celebrator', 'Ayinger · Duitsland', 'Doppelbock · 6,7%', 33, 'cl', NULL, NULL, 'pastrami', 24, 1, 3009, '24×33CL'),
    ('elings', 22, 'Ayinger Bräuweisse', 'Ayinger Bräuweisse', 'bier', 21, true, 245, NULL, 'Weizen', 'Bräuweisse', 'Ayinger · Duitsland', 'Hefeweizen · 5,1%', 50, 'cl', NULL, NULL, 'droge worst', 20, 1, 2740, '20×50CL'),
    ('elings', 23, 'Salted Caramel Choc Chip Cookie', 'Amundsen Salted Caramel Chocolate Chip Cookie', 'bier', 21, true, 480, NULL, 'Donker en zwaar', 'Salted Caramel Chocolate Chip Cookie', 'Amundsen · Noorwegen', 'Pastry stout · 10,5%', 33, 'cl', 15, NULL, 'karamelfudge', 12, 1, 3615, '12×33CL'),
    ('elings', 24, 'Strawberry Sundae', 'Vault City Strawberry Sundae', 'bier', 21, true, 355, NULL, 'Zuur en fruit', 'Strawberry Sundae', 'Vault City · Schotland', 'Fruited sour · 5%', 33, 'cl', 15, NULL, 'witte chocolade', 24, 1, 4430, '24×33CL'),
    ('elings', 25, 'Placebo 0.0%', 'Lupulus Placebo 0,0%', 'bier', 9, false, 230, NULL, 'Alcoholvrij', 'Placebo 0,0%', 'Lupulus · België', 'Blond · 0,0%', 33, 'cl', NULL, NULL, 'droge worst', 24, 1, 3616, '24×33CL'),
    ('elings', 26, 'Maisel''s Weisse Alkoholfrei', 'Maisel''s Weisse Alkoholfrei', 'bier', 9, false, 155, NULL, 'Alcoholvrij', 'Weisse Alkoholfrei', 'Maisel''s · Duitsland', 'Weissbier · 0,5%', 50, 'cl', NULL, NULL, 'kip van de grill', 20, 1, 2123, '20×50CL'),
    ('elings', 27, 'Bon Chef 0.5%', 'Two Chefs Bon Chef 0,5%', 'bier', 9, false, 275, NULL, 'Alcoholvrij', 'Bon Chef 0,5%', 'Two Chefs Brewing · Nederland', 'Alcoholvrije IPA · 0,5%', 33, 'cl', 15, NULL, 'pulled chicken', 12, 2, 2148, '12×33CL'),
    ('elings', 28, 'Luwte', 'Homeland Luwte', 'bier', 9, false, 225, NULL, 'Alcoholvrij', 'Luwte', 'Homeland · Nederland', 'Citrus blond · 0,5%', 33, 'cl', 15, NULL, 'een frisse salade', 24, 1, 4701, '24×33CL'),
    ('elings', 29, 'Bali', 'Prizm Bali', 'bier', 21, true, 395, NULL, 'Hop en IPA', 'Bali', 'Prizm Brewing Co. · Frankrijk', 'NEIPA · 5,7%', 33, 'cl', 15, NULL, 'rendang', 24, 1, 4758, '24×33CL'),
    ('elings', 30, 'Kasteel Tropical 0.0', 'Kasteel Tropical 0,0%', 'bier', 9, false, 195, NULL, 'Alcoholvrij', 'Tropical 0,0%', 'Kasteel · België', 'Alcoholvrij fruitbier · 0,0%', 33, 'cl', NULL, NULL, 'BBQ-amandelen', 24, 1, 3949, '24×33CL'),
    ('wijn', 1, NULL, 'Dama del Lago Rueda Verdejo', 'wijn', 21, true, 795, NULL, 'Wijn · wit', 'Dama del Lago Verdejo', 'Bodega Cuatro Rayas · Rueda', 'Verdejo · 2025', 75, 'cl', NULL, NULL, 'kip van de grill', NULL, NULL, NULL, NULL),
    ('wijn', 2, NULL, 'Pietrame Montepulciano d''Abruzzo', 'wijn', 21, true, 795, NULL, 'Wijn · rood', 'Pietrame Montepulciano', 'Cantina Tollo · Abruzzo', 'Montepulciano · 2024', 75, 'cl', NULL, NULL, 'droge worst', NULL, NULL, NULL, NULL),
    ('wijn', 3, NULL, 'Vermador Rosado BIO', 'wijn', 21, true, 850, NULL, 'Wijn · rosé', 'Vermador Rosado BIO', 'La Bodega de Pinoso · Alicante', 'Monastrell · 2025', 75, 'cl', NULL, NULL, 'tapas', NULL, NULL, NULL, NULL),
    ('wijn', 4, NULL, 'Maubet Blanc Sec', 'wijn', 21, true, 1095, NULL, 'Wijn · wit', 'Maubet Blanc Sec', 'Maison Fontan · Gascogne', 'Colombard, ugni blanc, gros manseng · 2025', 75, 'cl', NULL, NULL, 'zachte kaas', NULL, NULL, NULL, NULL),
    ('wijn', 5, NULL, 'Tre Venti Grillo', 'wijn', 21, true, 1095, NULL, 'Wijn · wit', 'Tre Venti Grillo', 'Cantine Birgi · Sicilië', 'Grillo · 2025', 75, 'cl', NULL, NULL, 'gamba''s', NULL, NULL, NULL, NULL),
    ('wijn', 6, NULL, 'Maubet Rosé', 'wijn', 21, true, 1095, NULL, 'Wijn · rosé', 'Maubet Rosé', 'Maison Fontan · Gascogne', 'Fris en fruitig · 2025', 75, 'cl', NULL, NULL, 'gegrilde groente', NULL, NULL, NULL, NULL),
    ('wijn', 7, NULL, 'Locus Primitivo', 'wijn', 21, true, 1095, NULL, 'Wijn · rood', 'Locus Primitivo', 'Cantine Teanum · Puglia', 'Primitivo · 2024', 75, 'cl', NULL, NULL, 'spareribs', NULL, NULL, NULL, NULL),
    ('wijn', 8, NULL, 'Lar de Sotomayor Rioja Crianza', 'wijn', 21, true, 1295, NULL, 'Wijn · rood', 'Lar de Sotomayor Crianza', 'Domeco de Jarauta · Rioja', 'Tempranillo · 2023', 75, 'cl', NULL, NULL, 'pastrami', NULL, NULL, NULL, NULL),
    ('wijn', 9, NULL, 'Nadal Prosecco Extra Dry', 'wijn', 21, true, 1395, NULL, 'Bubbels', 'Nadal Prosecco Extra Dry', 'Vini Nadal · Veneto', 'Glera', 75, 'cl', NULL, NULL, 'borrelhapjes', NULL, NULL, NULL, NULL),
    ('wijn', 10, NULL, 'Kranz Riesling BIO', 'wijn', 21, true, 1795, NULL, 'Wijn · wit', 'Kranz Riesling BIO', 'Weingut Kranz · Pfalz', 'Riesling · 2025', 75, 'cl', NULL, NULL, 'buikspek', NULL, NULL, NULL, NULL),
    ('wijn', 11, NULL, 'Lugana BIO', 'wijn', 21, true, 2150, NULL, 'Wijn · wit', 'Lugana BIO', 'Marangona · Gardameer', 'Turbiana · 2025', 75, 'cl', NULL, NULL, 'risotto', NULL, NULL, NULL, NULL),
    ('wijn', 12, NULL, 'Atlas Son of Titan Shiraz', 'wijn', 21, true, 1695, NULL, 'Wijn · rood', 'Atlas Son of Titan Shiraz', 'Penley Estate · Coonawarra', 'Shiraz · 2021', 75, 'cl', NULL, NULL, 'burnt ends', NULL, NULL, NULL, NULL),
    ('wijn', 13, NULL, 'Mazas Tinta de Toro', 'wijn', 21, true, 1995, NULL, 'Wijn · rood', 'Mazas Tinta de Toro', 'Bodegas Mazas · Castilla y León', 'Tinta de Toro · 2022', 75, 'cl', NULL, NULL, 'brisket', NULL, NULL, NULL, NULL),
    ('wijn', 14, NULL, 'Moscato d''Asti', 'wijn', 21, true, 2095, NULL, 'Zoet', 'Moscato d''Asti', 'Mario Giribaldi · Piemonte', 'Moscato bianco · 2025', 75, 'cl', NULL, NULL, 'karamelfudge', NULL, NULL, NULL, NULL),
    ('wijn', 15, NULL, '''Louis'' Crémant de Loire BIO', 'wijn', 21, true, 2250, NULL, 'Bubbels', 'Crémant de Loire ''Louis'' BIO', 'Louis de Grenelle · Saumur', 'Chenin blanc, chardonnay', 75, 'cl', NULL, NULL, 'de borrelplank', NULL, NULL, NULL, NULL),
    ('wijn', 16, NULL, 'Chablis BIO', 'wijn', 21, true, 3295, NULL, 'Wijn · wit', 'Chablis BIO', 'Domaine Jean Goulley · Bourgogne', 'Chardonnay · 2023', 75, 'cl', NULL, NULL, 'geitenkaas', NULL, NULL, NULL, NULL),
    ('wijn', 17, NULL, 'Bourgogne Hautes-Côtes de Beaune Rouge BIO', 'wijn', 21, true, 3295, NULL, 'Wijn · rood', 'Hautes-Côtes de Beaune BIO', 'Domaine Lucien Jacob · Bourgogne', 'Pinot noir · 2023', 75, 'cl', NULL, NULL, 'gevogelte', NULL, NULL, NULL, NULL),
    ('wijn', 18, NULL, 'Belcanto Chianti Classico BIO', 'wijn', 21, true, 2795, NULL, 'Wijn · rood', 'Belcanto Chianti Classico BIO', 'Fattoria Nittardi · Toscane', 'Sangiovese · 2023', 75, 'cl', NULL, NULL, 'steak', NULL, NULL, NULL, NULL),
    ('wijn', 19, NULL, 'Champagne Grande Réserve Brut', 'wijn', 21, true, 4250, NULL, 'Bubbels', 'Champagne Grande Réserve Brut', 'Emilien Fresne · Champagne', 'Brut', 75, 'cl', NULL, NULL, 'de borrelplank', NULL, NULL, NULL, NULL),
    ('wijn', 20, NULL, 'Bellerive 0% Mousserend Wit BIO', 'wijn', 9, false, 1295, NULL, 'Alcoholvrij', 'Bellerive 0% Mousserend BIO', 'Domaine La Colombette · Languedoc', 'Souvignier gris · 0,0%', 75, 'cl', NULL, NULL, 'borrelhapjes', NULL, NULL, NULL, NULL),
    ('noix', 1, 'BL - Cup M - Huismix 180 gram', 'Huismix 180 g', 'overig', 9, false, 450, 222, 'Noten', 'Huismix', NULL, 'Notenmix', 180, 'g', NULL, '3 voor € 12', 'een tripel', 1, 5, 222, 'stuk'),
    ('noix', 2, 'BL - Cup L - Oranje Notenmix 220 gram', 'Oranje notenmix 220 g', 'overig', 9, false, 450, 226, 'Noten', 'Oranje notenmix', NULL, 'Notenmix', 220, 'g', NULL, '3 voor € 12', 'een saison', 1, 5, 226, 'stuk'),
    ('noix', 3, 'BL - Cup S - Wilde mannenmix 120 gram', 'Wilde mannenmix 120 g', 'overig', 9, false, 450, 234, 'Noten', 'Wilde mannenmix', NULL, 'Notenmix', 120, 'g', NULL, '3 voor € 12', 'een IPA', 1, 5, 234, 'stuk'),
    ('noix', 4, 'BL - Cup S - Macadamiamix gezouten 140 gram', 'Macadamiamix 140 g', 'overig', 9, false, 450, 281, 'Noten', 'Macadamiamix', NULL, 'Gezouten', 140, 'g', NULL, '3 voor € 12', 'een weizen', 1, 5, 281, 'stuk'),
    ('noix', 5, 'BL - Cup M - Zeistermix 220 gram', 'Zeistermix 220 g', 'overig', 9, false, 450, 195, 'Noten', 'Zeistermix', NULL, 'Notenmix', 220, 'g', NULL, '3 voor € 12', 'een dubbel', 1, 25, 195, 'stuk'),
    ('noix', 6, 'BL - Cup S - Stoere vrouwenmix 130 gram', 'Stoere vrouwenmix 130 g', 'overig', 9, false, 450, 232, 'Noten', 'Stoere vrouwenmix', NULL, 'Notenmix', 130, 'g', NULL, '3 voor € 12', 'een rosé', 1, 5, 232, 'stuk'),
    ('noix', 7, 'BL - Cup M - Studentenhaver naturel 200 gram', 'Studentenhaver 200 g', 'overig', 9, false, 450, 251, 'Noten', 'Studentenhaver', NULL, 'Naturel', 200, 'g', NULL, '3 voor € 12', 'een kriek', 1, 5, 251, 'stuk'),
    ('noix', 8, 'BL - Cup L - Barmix 270 gram', 'Barmix 270 g', 'overig', 9, false, 450, 216, 'Noten', 'Barmix', NULL, 'Notenmix', 270, 'g', NULL, '3 voor € 12', 'een pils', 1, 10, 216, 'stuk'),
    ('noix', 9, 'BL - Cup S - Cashewnoten gezouten 150 gram', 'Cashewnoten 150 g', 'overig', 9, false, 450, 256, 'Noten', 'Cashewnoten', NULL, 'Gezouten', 150, 'g', NULL, '3 voor € 12', 'een IPA', 1, 5, 256, 'stuk'),
    ('noix', 10, 'RD - Cup M - Cocktailnoten 140 gram', 'Cocktailnoten 140 g', 'overig', 9, false, 275, 154, 'Noten', 'Cocktailnoten', NULL, NULL, 140, 'g', NULL, '3 voor € 7', 'een pils', 1, 5, 154, 'stuk'),
    ('noix', 11, 'RD - Cup L - Cocktail snackmix / pretzelmix 100 gram', 'Cocktail snackmix 100 g', 'overig', 9, false, 275, 109, 'Borrel', 'Cocktail snackmix', NULL, 'Met pretzels', 100, 'g', NULL, '3 voor € 7', 'een weizen', 1, 5, 109, 'stuk'),
    ('noix', 12, 'RD - Cup L - Ratjetoe 140 gram', 'Ratjetoe 140 g', 'overig', 9, false, 275, 142, 'Borrel', 'Ratjetoe', NULL, 'Snackmix', 140, 'g', NULL, '3 voor € 7', 'een blond bier', 1, 5, 142, 'stuk'),
    ('noix', 13, 'RD - Cup M - Pesto sticks 70 gram', 'Pesto sticks 70 g', 'overig', 9, false, 275, 145, 'Borrel', 'Pesto sticks', NULL, NULL, 70, 'g', NULL, '3 voor € 7', 'een witte wijn', 1, 5, 145, 'stuk'),
    ('noix', 14, 'RD - Cup M - Suikerpinda''s 180 gram', 'Suikerpinda''s 180 g', 'overig', 9, false, 275, 150, 'Noten', 'Suikerpinda''s', NULL, NULL, 180, 'g', NULL, '3 voor € 7', 'een dubbel', 1, 5, 150, 'stuk'),
    ('noix', 15, 'RD - Cup M - Sporthaver 180 gram', 'Sporthaver 180 g', 'overig', 9, false, 275, 146, 'Noten', 'Sporthaver', NULL, 'Notenmix', 180, 'g', NULL, '3 voor € 7', NULL, 1, 5, 146, 'stuk'),
    ('noix', 16, 'RD - Cup M - Sushi Cheese 80 gram', 'Sushi cheese 80 g', 'overig', 9, false, 275, 159, 'Borrel', 'Sushi cheese', NULL, NULL, 80, 'g', NULL, '3 voor € 7', 'een saison', 1, 5, 159, 'stuk'),
    ('noix', 17, 'GR - Cup M - Kaasbollen 90 gram', 'Kaasbollen 90 g', 'overig', 9, false, 395, 251, 'Borrel', 'Kaasbollen', NULL, NULL, 90, 'g', NULL, '2 voor € 7', 'een tripel', 1, 5, 251, 'stuk'),
    ('noix', 18, 'GR - Cup S - Amandelfeest 140 gram', 'Amandelfeest 140 g', 'overig', 9, false, 395, 226, 'Noten', 'Amandelfeest', NULL, NULL, 140, 'g', NULL, '2 voor € 7', 'een quadrupel', 1, 1, 226, 'stuk'),
    ('noix', 19, 'GR - Cup M - Pindarotsen ambachtelijk melk 140 gram', 'Pindarotsen melk 140 g', 'overig', 9, false, 395, 223, 'Zoet', 'Pindarotsen melk', NULL, 'Melkchocolade', 140, 'g', NULL, '2 voor € 7', 'een dubbel', 1, 5, 223, 'stuk'),
    ('noix', 20, 'GR - Cup M - Pindarotsen ambachtelijk puur 140 gram', 'Pindarotsen puur 140 g', 'overig', 9, false, 395, 238, 'Zoet', 'Pindarotsen puur', NULL, 'Pure chocolade', 140, 'g', NULL, '2 voor € 7', 'een quadrupel', 1, 5, 238, 'stuk'),
    ('noix', 21, 'GR - Cup M - Pindarotsen ambachtelijk wit 140 gram', 'Pindarotsen wit 140 g', 'overig', 9, false, 395, 213, 'Zoet', 'Pindarotsen wit', NULL, 'Witte chocolade', 140, 'g', NULL, '2 voor € 7', 'Moscato d''Asti', 1, 5, 213, 'stuk'),
    ('noix', 22, 'GR - Cup S - Cacaotruffel choco 100 gram', 'Cacaotruffels 100 g', 'overig', 9, false, 395, 243, 'Zoet', 'Cacaotruffels', NULL, 'Chocolade', 100, 'g', NULL, '2 voor € 7', 'een stout', 1, 8, 243, 'stuk'),
    ('noix', 23, 'GR - Cup S - Haknougat (6 kleuren) 120 gram', 'Haknougat 120 g', 'overig', 9, false, 395, 179, 'Zoet', 'Haknougat', NULL, 'Zes kleuren', 120, 'g', NULL, '2 voor € 7', NULL, 1, 3, 179, 'stuk'),
    ('noix', 24, 'GR - Cup M - Fudge vanille 180 gram', 'Fudge vanille 180 g', 'overig', 9, false, 395, 204, 'Zoet', 'Fudge vanille', NULL, 'Vanille', 180, 'g', NULL, '2 voor € 7', NULL, 1, 3, 204, 'stuk'),
    ('noix', 25, 'GR - Cup M - Fudge Karamel zeezout 180 gram', 'Fudge karamel zeezout 180 g', 'overig', 9, false, 395, 204, 'Zoet', 'Fudge karamel zeezout', NULL, 'Karamel en zeezout', 180, 'g', NULL, '2 voor € 7', 'een pastry stout', 1, 3, 204, 'stuk'),
    ('noix', 26, 'GR - Cup M - Riceballs choco gemengd 130 gram', 'Riceballs choco 130 g', 'overig', 9, false, 395, 176, 'Zoet', 'Riceballs choco', NULL, 'Gemengd', 130, 'g', NULL, '2 voor € 7', NULL, 1, 8, 176, 'stuk'),
    ('noix', 27, 'GR - Zak - Chocoladereep ambachtelijk melk 100 gram', 'Chocoladereep melk 100 g', 'overig', 9, false, 395, 233, 'Zoet', 'Chocoladereep melk', NULL, 'Melkchocolade', 100, 'g', NULL, '2 voor € 7', 'een dubbel', 1, 5, 233, 'stuk'),
    ('noix', 28, 'GR - Zak - Chocoladereep ambachtelijk puur 100 gram', 'Chocoladereep puur 100 g', 'overig', 9, false, 395, 253, 'Zoet', 'Chocoladereep puur', NULL, 'Pure chocolade', 100, 'g', NULL, '2 voor € 7', 'een quadrupel', 1, 5, 253, 'stuk'),
    ('noix', 29, 'GR - Zak - Chocoladereep ambachtelijk wit 100 gram', 'Chocoladereep wit 100 g', 'overig', 9, false, 395, 217, 'Zoet', 'Chocoladereep wit', NULL, 'Witte chocolade', 100, 'g', NULL, '2 voor € 7', NULL, 1, 5, 217, 'stuk'),
    ('noix', 30, 'KS - Zakje - Drentsche notenmix 340 gram', 'Drentsche notenmix 340 g', 'overig', 9, false, 500, 379, 'Noten', 'Drentsche notenmix', NULL, 'Seizoensmelange', 340, 'g', NULL, NULL, 'een dubbel', 1, 10, 379, 'stuk'),
    ('noix', 31, 'AC - Luxe reep vierkant Stroopwafel melk', 'Luxe reep stroopwafel', 'overig', 9, false, 395, 236, 'Zoet', 'Luxe reep stroopwafel', NULL, 'Melkchocolade', NULL, 'g', NULL, NULL, NULL, 1, 5, 236, 'stuk'),
    ('worst', 1, NULL, 'Droge worst, gerookt', 'worst', 9, false, 465, NULL, 'Droge worst', 'Droge worst, gerookt', NULL, 'Gerookt', NULL, 'g', NULL, NULL, 'een saison', NULL, NULL, NULL, NULL),
    ('worst', 2, NULL, 'Droge worst met comté', 'worst', 9, false, 465, NULL, 'Droge worst', 'Droge worst met comté', NULL, 'Met comté', NULL, 'g', NULL, NULL, 'een rode wijn', NULL, NULL, NULL, NULL),
    ('worst', 3, NULL, 'Droge worst met BBQ-kruiden', 'worst', 9, false, 465, NULL, 'Droge worst', 'Droge worst met BBQ-kruiden', NULL, 'Met BBQ-kruiden', 160, 'g', NULL, NULL, 'een tripel', NULL, NULL, NULL, NULL);

INSERT INTO public.winkel_producten (organization_id, naam, type, eenheid, prijs_per, btw_pct, alcohol, actief, winkelprijs_incl_cents, inkoop_excl_cents)
SELECT i.organization_id, c.product_naam, c.type, 'stuk', 1, c.btw_pct, c.alcohol, true, c.prijs_cents, c.inkoop_cents
  FROM public.winkel_instellingen i
 CROSS JOIN winkel_c c
 WHERE NOT EXISTS (
        SELECT 1 FROM public.winkel_producten p
         WHERE p.organization_id = i.organization_id AND lower(p.naam) = lower(c.product_naam));

-- Een product dat er al was, krijgt de prijs alleen als het er nog geen had.
UPDATE public.winkel_producten p
   SET winkelprijs_incl_cents = c.prijs_cents
  FROM winkel_c c
 WHERE lower(p.naam) = lower(c.product_naam)
   AND p.winkelprijs_incl_cents IS NULL AND p.eenheid = 'stuk' AND p.prijs_per = 1
   AND p.organization_id IN (SELECT organization_id FROM public.winkel_instellingen);

INSERT INTO public.winkel_prijskaartjes (organization_id, winkel_product_id, soort, naam, maker, details, inhoud, inhoud_eenheid, statiegeld_cents, actie, bij)
SELECT p.organization_id, p.id, c.soort, c.kaart_naam, c.maker, c.details, c.inhoud, c.inhoud_eenheid, c.statiegeld_cents, c.actie, c.bij
  FROM public.winkel_producten p
  JOIN winkel_c c ON lower(p.naam) = lower(c.product_naam)
 WHERE p.organization_id IN (SELECT organization_id FROM public.winkel_instellingen)
ON CONFLICT (winkel_product_id) DO NOTHING;


-- ── 3. De leveringen als ontvangst in concept ───────────────────────────────
DO $$
DECLARE
    v_org    UUID;
    v_invoer UUID;
    l        RECORD;
BEGIN
    FOR v_org IN SELECT organization_id FROM public.winkel_instellingen LOOP
        FOR l IN
            SELECT * FROM (VALUES
                ('elings', 'Elings Craftbeer Company', 'C-6021', DATE '2026-10-20', 129471,
                 'Bestelbevestiging van 20 oktober 2026: 30 bieren, 34 dozen. Controleer de aantallen tegen de levering en de btw tegen de factuur, dan boeken.'),
                ('noix', 'NOIX Notenatelier', 'Offerte 31423', DATE '2026-10-16', 42530,
                 'Offerte 31423 van 16 oktober 2026 (€ 390,19 excl. btw, € 425,30 incl.): 31 producten, 181 stuks; levering dinsdag 3 november met het proefdisplay. Controleer tegen de pakbon, dan boeken.')
            ) AS t(bron, leverancier, nummer, datum, totaal, notitie)
        LOOP
            CONTINUE WHEN EXISTS (
                SELECT 1 FROM public.voorraad_invoer
                 WHERE organization_id = v_org AND lower(factuurnummer) = lower(l.nummer));

            INSERT INTO public.voorraad_invoer (organization_id, bron, status, leverancier_naam, factuurnummer, datum, totaal_cents, prijzen_incl_btw, notitie)
            VALUES (v_org, 'handmatig', 'concept', l.leverancier, l.nummer, l.datum, l.totaal, false, l.notitie)
            RETURNING id INTO v_invoer;

            INSERT INTO public.voorraad_invoer_regels (organization_id, invoer_id, volgorde, bron_naam, bron_aantal, bron_eenheid, bron_prijs_cents,
                                                       btw_pct, plek, winkel_product_id, omrekening, aantal, voorstel)
            SELECT v_org, v_invoer, c.volgorde, c.bron_naam, c.bron_aantal, c.bron_eenheid, c.bron_prijs_cents,
                   c.btw_pct, 'winkel', p.id, c.per_doos, c.bron_aantal * c.per_doos, 'naam'
              FROM winkel_c c
              LEFT JOIN LATERAL (
                    SELECT id FROM public.winkel_producten
                     WHERE organization_id = v_org AND lower(naam) = lower(c.product_naam)
                     ORDER BY created_at LIMIT 1) p ON true
             WHERE c.bron = l.bron
             ORDER BY c.volgorde;
        END LOOP;
    END LOOP;
END $$;


-- ── 4. Verificatie ──────────────────────────────────────────────────────────
DO $$
BEGIN
    IF (SELECT count(*) FROM winkel_c WHERE bron = 'elings') <> 30
       OR (SELECT sum(bron_aantal * bron_prijs_cents) FROM winkel_c WHERE bron = 'elings') <> 129471 THEN
        RAISE EXCEPTION 'prijskaartjes: de bestelling C-6021 klopt niet (30 regels, € 1.294,71)';
    END IF;
    IF (SELECT count(*) FROM winkel_c WHERE bron = 'noix') <> 31
       OR (SELECT sum(bron_aantal * bron_prijs_cents) FROM winkel_c WHERE bron = 'noix') <> 39019 THEN
        RAISE EXCEPTION 'prijskaartjes: offerte 31423 klopt niet (31 regels, € 390,19 excl. btw)';
    END IF;
END $$;

DROP TABLE IF EXISTS pg_temp.winkel_c;
