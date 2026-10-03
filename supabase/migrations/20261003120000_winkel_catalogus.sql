-- ════════════════════════════════════════════════════════════════════════════
--  Catalogus — één product, één rij: ook foto en tekst wonen hier
--  Plan: docs/OPDRACHT-BBQ-ARCHITECT-CATALOGUS.md (blok C1)
-- ════════════════════════════════════════════════════════════════════════════
--
--  Tot nu toe stond "naam, foto en verhaal blijven op de website"
--  (20260913120000_winkel_kassa). Voor wat los te koop is — bier, wijn, worst,
--  later kaas — draait dat om (besluit Mathijs, 3 oktober 2026): toevoegen
--  gebeurt op één plek, hier, en de website, BBQ Architect en straks de kassa
--  lezen dezelfde rij.
--
--  Alles additief. Een product zonder pagina (pagina_status 'geen') werkt
--  precies zoals voorheen: een component in een pakket.
--
--  De website haalt de catalogus op bij elke build; "zet live" start een
--  nieuwe build (deploy hook, ±2 minuten). Een voorbeeld van een concept
--  rendert de website los, op aanvraag.
--
--  Vier ideeën:
--    1. Een product met een pagina heeft een slug. De losse verkoop is het
--       artikel met dezelfde slug en één slot naar dit product — zo lopen
--       prijs, 18+, voorraad en afboeken via het bestaande kassapad.
--    2. Wat per soort verschilt (brouwerij, stijl, jaargang, druiven …) staat
--       in `kenmerken`; de vorm bewaakt de app (src/lib/winkel/productsoorten.ts).
--    3. Wat de AI voorstelt is een concept. Wat Mathijs nakeek staat in
--       `goedgekeurd` (per veldgroep wie en wanneer); de website toont een
--       proefkaart of druiven pas als die groep goedgekeurd is.
--    4. Live = op de site. Te koop = daarnaast prijs, allergenen (en bij
--       vlees ingrediënten en bewaren) — dat bewaken de kassa en de website
--       al. De poort hier weigert alleen wat nooit online mag (sterke drank).


-- ── 0. Pre-flight ───────────────────────────────────────────────────────────
DO $$
BEGIN
    IF to_regclass('public.winkel_producten') IS NULL OR to_regclass('public.winkel_artikelen') IS NULL THEN
        RAISE EXCEPTION 'winkel_catalogus: winkel_producten/winkel_artikelen ontbreken (migraties 20260913 en 20260927)';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'winkel_producten' AND column_name = 'ean') THEN
        RAISE EXCEPTION 'winkel_catalogus: winkel_producten.ean ontbreekt (migratie 20260928120000_winkelvoorraad_logboek)';
    END IF;
END $$;


-- ── 1. winkel_producten — de pagina ─────────────────────────────────────────
ALTER TABLE public.winkel_producten
    ADD COLUMN IF NOT EXISTS slug            TEXT        CHECK (slug IS NULL OR slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
    ADD COLUMN IF NOT EXISTS kenmerken       JSONB       NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(kenmerken) = 'object'),
    ADD COLUMN IF NOT EXISTS alcohol_pct     NUMERIC(4,2) CHECK (alcohol_pct IS NULL OR (alcohol_pct >= 0 AND alcohol_pct < 100)),
    -- Van het etiket of de receptuur, nooit van de AI. NULL = nog niet ingevuld.
    ADD COLUMN IF NOT EXISTS allergenen      TEXT[],
    ADD COLUMN IF NOT EXISTS ingredienten    TEXT[],
    ADD COLUMN IF NOT EXISTS bewaren         TEXT,
    ADD COLUMN IF NOT EXISTS lekker_bij      TEXT,
    -- De foto in de bucket winkel-fotos, in een paar breedtes:
    -- {"basis": "{org_id}/{slug}-{tijd}", "breedte": 1024, "hoogte": 1536,
    --  "maten": [{"w": 640, "h": 960}, ...], "formaten": ["webp"]}
    -- Bestanden: {basis}-{w}.{formaat}. Zo kan de website een srcset maken.
    ADD COLUMN IF NOT EXISTS foto            JSONB       CHECK (foto IS NULL OR (jsonb_typeof(foto) = 'object' AND foto ? 'basis' AND foto ? 'maten')),
    ADD COLUMN IF NOT EXISTS pagina_status   TEXT        NOT NULL DEFAULT 'geen' CHECK (pagina_status IN ('geen', 'concept', 'live')),
    ADD COLUMN IF NOT EXISTS pagina_volgorde INTEGER,
    ADD COLUMN IF NOT EXISTS pagina_live_at  TIMESTAMPTZ,
    -- {"proefkaart": {"door": "<uuid>", "op": "<iso>"}, "druiven": {...}}
    ADD COLUMN IF NOT EXISTS goedgekeurd     JSONB       NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(goedgekeurd) = 'object'),
    -- Wat de AI waar vond: [{"veld": "kenmerken.stijl", "url": "...", "titel": "..."}]
    ADD COLUMN IF NOT EXISTS bronnen         JSONB       NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(bronnen) = 'array');

COMMENT ON COLUMN public.winkel_producten.slug IS
    'Het adres op de website (/bestellen/<slug>) en de slug van het artikel voor de losse verkoop. NULL = geen eigen pagina.';
COMMENT ON COLUMN public.winkel_producten.kenmerken IS
    'Per soort (bier: brouwerij, stijl, verpakking, proefkaart; wijn: producent, jaargang, druiven …). Vorm: src/lib/winkel/productsoorten.ts.';
COMMENT ON COLUMN public.winkel_producten.pagina_status IS
    'geen = alleen component; concept = in de maak, alleen via een voorbeeldlink te zien; live = op de website.';
COMMENT ON COLUMN public.winkel_producten.goedgekeurd IS
    'Per veldgroep wie het nakeek en wanneer. Wat de AI invulde en niet goedgekeurd is, toont de website niet als feit.';

CREATE UNIQUE INDEX IF NOT EXISTS winkel_producten_slug_uniek
    ON public.winkel_producten(organization_id, slug) WHERE slug IS NOT NULL;
CREATE INDEX IF NOT EXISTS winkel_producten_live_idx
    ON public.winkel_producten(organization_id, type) WHERE pagina_status = 'live';


-- ── 2. De poort naar live ───────────────────────────────────────────────────
--   Op de site staan en te koop zijn is niet hetzelfde (regel 4 van de
--   website: verkoopbaarheid en publicatie). Live = zichtbaar; een bier
--   zonder prijs of allergenen staat er met "nu niet online te bestellen" en
--   de kassa weigert het. Hier alleen wat nooit zichtbaar mag:
--   WC001  geen slug
--   WC003  alcohol 15 % of meer, of alcohol zonder percentage (online alleen < 15 %)
CREATE OR REPLACE FUNCTION public.winkel_catalogus_poort()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.pagina_status = 'live' THEN
        IF NEW.slug IS NULL THEN
            RAISE EXCEPTION 'live vraagt een slug' USING ERRCODE = 'WC001';
        END IF;
        IF NEW.alcohol AND (NEW.alcohol_pct IS NULL OR NEW.alcohol_pct >= 15) THEN
            RAISE EXCEPTION 'online alleen drank onder de 15 %%' USING ERRCODE = 'WC003';
        END IF;
        IF TG_OP = 'INSERT' OR OLD.pagina_status IS DISTINCT FROM 'live' THEN
            NEW.pagina_live_at := now();
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

ALTER FUNCTION public.winkel_catalogus_poort() SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS trg_winkel_catalogus_poort ON public.winkel_producten;
CREATE TRIGGER trg_winkel_catalogus_poort BEFORE INSERT OR UPDATE ON public.winkel_producten
    FOR EACH ROW EXECUTE FUNCTION public.winkel_catalogus_poort();


-- ── 3. Bucket winkel-fotos ──────────────────────────────────────────────────
-- Publiek te lezen (de website toont ze); schrijven alleen door org-leden in
-- hun eigen map: winkel-fotos/{org_uuid}/{bestand}.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('winkel-fotos', 'winkel-fotos', true, 10 * 1024 * 1024, ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/avif'])
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS winkel_fotos_org_read   ON storage.objects;
DROP POLICY IF EXISTS winkel_fotos_org_write  ON storage.objects;
DROP POLICY IF EXISTS winkel_fotos_org_update ON storage.objects;
DROP POLICY IF EXISTS winkel_fotos_org_delete ON storage.objects;

-- Lezen via de API (nodig voor upsert); de publieke URL werkt los daarvan voor iedereen.
CREATE POLICY winkel_fotos_org_read ON storage.objects FOR SELECT
    USING (
        bucket_id = 'winkel-fotos'
        AND (storage.foldername(name))[1] IN (
            SELECT organization_id::text FROM organization_members
            WHERE user_id = auth.uid() AND status = 'active'
        )
    );
CREATE POLICY winkel_fotos_org_write ON storage.objects FOR INSERT
    WITH CHECK (
        bucket_id = 'winkel-fotos'
        AND auth.role() = 'authenticated'
        AND (storage.foldername(name))[1] IN (
            SELECT organization_id::text FROM organization_members
            WHERE user_id = auth.uid() AND status = 'active'
        )
    );
CREATE POLICY winkel_fotos_org_update ON storage.objects FOR UPDATE
    USING (
        bucket_id = 'winkel-fotos'
        AND (storage.foldername(name))[1] IN (
            SELECT organization_id::text FROM organization_members
            WHERE user_id = auth.uid() AND status = 'active'
        )
    );
CREATE POLICY winkel_fotos_org_delete ON storage.objects FOR DELETE
    USING (
        bucket_id = 'winkel-fotos'
        AND (storage.foldername(name))[1] IN (
            SELECT organization_id::text FROM organization_members
            WHERE user_id = auth.uid() AND status = 'active'
        )
    );


-- ── 4. Het oude besluit, bijgewerkt ─────────────────────────────────────────
COMMENT ON TABLE public.winkel_artikelen IS
    'De catalogus zoals de kassa hem kent. De slug is de slug van de website. Voor losse producten (bier, wijn, worst) wonen naam, foto en tekst sinds 3 oktober 2026 in winkel_producten met dezelfde slug; voor de rest (Kerst-Box, pakketten) nog op de website.';

-- =============================================================
--  Einde 20261003120000_winkel_catalogus.sql
-- =============================================================
