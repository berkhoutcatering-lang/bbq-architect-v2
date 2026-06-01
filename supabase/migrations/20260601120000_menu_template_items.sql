-- ════════════════════════════════════════════════════════════════════════════
--  Migration — menu_template_items (Stel menu samen v2)
--
--  Tot nu toe leefde menu-compositie als `Record<gang_slug, string[]>` met
--  dish-NAMEN in `menu_templates.menu_selectie` JSONB. Probleem: een rename
--  van een gerecht brak silently elk menu dat ernaar verwees. Geen FK, geen
--  RLS op rij-niveau, geen reorder.
--
--  Deze migratie introduceert een relationele join tussen menu_templates en
--  gerechten zodat:
--   • renames niets breken (we koppelen op UUID, niet naam)
--   • per-item RLS afdwingbaar is op organization_id
--   • per-item volgorde gepersisteerd kan worden (drag-to-reorder)
--   • FK ON DELETE RESTRICT voorkomt orphan-templates als een gerecht weg-
--     gegooid wordt — caller moet eerst uit alle menu's verwijderen
--
--  Backwards-compat: menu_templates.menu_selectie BLIJFT BESTAAN als read-
--  cache. De RPC rpc_upsert_menu_template_items regenereert hem bij elke
--  upsert zodat legacy consumers (offerte-wizard prefill via
--  prefillFromTemplate, /q/[id]-portaal renderer, oudere PDFs) blijven
--  werken. Drop in een latere migratie (~3 maanden) als alle consumers
--  via menu_template_items lopen.
--
--  Hard rules:
--   • BTW NOOIT in deze migration (regel #1, BBQ Architect) — alleen koppeling
--   • Allergenen NIET hier (regel #2) — die zitten al in ingredient_allergens
--   • RLS via private.user_org_ids() — consistent met rest van repo (zie
--     bv. 20260601100000_price_intelligence_application_layer.sql)
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. menu_template_items tabel ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.menu_template_items (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    menu_template_id  BIGINT NOT NULL REFERENCES public.menu_templates(id) ON DELETE CASCADE,
    gerecht_id        UUID   NOT NULL REFERENCES public.gerechten(id)      ON DELETE RESTRICT,
    gang_slug         TEXT   NOT NULL,
    volgorde          INTEGER NOT NULL DEFAULT 0,
    organization_id   UUID   NOT NULL REFERENCES public.organizations(id)  ON DELETE CASCADE,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (menu_template_id, gang_slug, gerecht_id)
);

COMMENT ON TABLE  public.menu_template_items IS 'Stel-menu-samen v2: relationele join tussen menu_templates en gerechten. Vervangt name-based JSONB in menu_templates.menu_selectie (die blijft als read-cache).';
COMMENT ON COLUMN public.menu_template_items.gang_slug IS 'Slug van gangen-rij (per org). Stabieler dan FK naar gangen.id omdat slug org-overstijgend conventie is.';
COMMENT ON COLUMN public.menu_template_items.volgorde IS '0-based positie binnen de gang. Drag-to-reorder schrijft hier.';

CREATE INDEX IF NOT EXISTS mti_org_idx       ON public.menu_template_items(organization_id);
CREATE INDEX IF NOT EXISTS mti_template_idx  ON public.menu_template_items(menu_template_id, gang_slug, volgorde);
CREATE INDEX IF NOT EXISTS mti_gerecht_idx   ON public.menu_template_items(gerecht_id);

-- ── 2. RLS ───────────────────────────────────────────────────────────────────
ALTER TABLE public.menu_template_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS mti_select ON public.menu_template_items;
CREATE POLICY mti_select ON public.menu_template_items
    FOR SELECT TO authenticated
    USING (organization_id IN (SELECT private.user_org_ids()));

DROP POLICY IF EXISTS mti_insert ON public.menu_template_items;
CREATE POLICY mti_insert ON public.menu_template_items
    FOR INSERT TO authenticated
    WITH CHECK (organization_id IN (SELECT private.user_org_ids()));

DROP POLICY IF EXISTS mti_update ON public.menu_template_items;
CREATE POLICY mti_update ON public.menu_template_items
    FOR UPDATE TO authenticated
    USING      (organization_id IN (SELECT private.user_org_ids()))
    WITH CHECK (organization_id IN (SELECT private.user_org_ids()));

DROP POLICY IF EXISTS mti_delete ON public.menu_template_items;
CREATE POLICY mti_delete ON public.menu_template_items
    FOR DELETE TO authenticated
    USING (organization_id IN (SELECT private.user_org_ids()));

-- ── 3. RPC: atomaire upsert + JSONB read-cache sync ──────────────────────────
-- Caller stuurt complete items-array. RPC handelt af binnen één transactie:
--   (a) upsert van menu_templates header
--   (b) DELETE van bestaande items
--   (c) bulk-insert nieuwe items
--   (d) regenereer menu_templates.menu_selectie JSONB als afgeleide cache
-- Locking: SELECT … FOR UPDATE op de template-rij voorkomt parallelle race.

CREATE OR REPLACE FUNCTION public.rpc_upsert_menu_template(
    p_id              BIGINT,
    p_naam            TEXT,
    p_beschrijving    TEXT,
    p_basis_prijs_pp  NUMERIC,
    p_aantal_gasten   INTEGER,
    p_is_default      BOOLEAN,
    p_items           JSONB  -- [{gerecht_id, gang_slug, volgorde}, ...]
)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
    v_org_id        UUID;
    v_template_id   BIGINT;
    v_item_count    INTEGER;
BEGIN
    -- Resolve current user's org_id. Faalt als user geen actieve org heeft.
    SELECT user_org_id INTO v_org_id
    FROM (SELECT private.user_org_ids() AS user_org_id LIMIT 1) AS sub;
    IF v_org_id IS NULL THEN
        RAISE EXCEPTION 'rpc_upsert_menu_template: geen actieve organisatie voor user' USING ERRCODE = '42501';
    END IF;

    -- Header upsert + lock
    IF p_id IS NULL THEN
        INSERT INTO public.menu_templates (
            organization_id, naam, beschrijving, basis_prijs_pp,
            aantal_gasten, is_default, menu_selectie
        ) VALUES (
            v_org_id, p_naam, p_beschrijving, COALESCE(p_basis_prijs_pp, 0),
            COALESCE(p_aantal_gasten, 40), COALESCE(p_is_default, false), '{}'::jsonb
        )
        RETURNING id INTO v_template_id;
    ELSE
        -- Lock de bestaande rij om race te voorkomen
        PERFORM 1 FROM public.menu_templates
        WHERE id = p_id AND organization_id = v_org_id
        FOR UPDATE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'rpc_upsert_menu_template: template % niet gevonden voor org', p_id USING ERRCODE = '42501';
        END IF;

        UPDATE public.menu_templates SET
            naam            = p_naam,
            beschrijving    = p_beschrijving,
            basis_prijs_pp  = COALESCE(p_basis_prijs_pp, basis_prijs_pp),
            aantal_gasten   = COALESCE(p_aantal_gasten, aantal_gasten),
            is_default      = COALESCE(p_is_default, is_default),
            updated_at      = now()
        WHERE id = p_id;
        v_template_id := p_id;
    END IF;

    -- Wipe + insert items
    DELETE FROM public.menu_template_items WHERE menu_template_id = v_template_id;

    IF jsonb_typeof(p_items) = 'array' THEN
        INSERT INTO public.menu_template_items
            (menu_template_id, gerecht_id, gang_slug, volgorde, organization_id)
        SELECT
            v_template_id,
            (item->>'gerecht_id')::uuid,
            item->>'gang_slug',
            COALESCE((item->>'volgorde')::int, 0),
            v_org_id
        FROM jsonb_array_elements(p_items) AS item
        WHERE item->>'gerecht_id' IS NOT NULL
          AND item->>'gang_slug'  IS NOT NULL
          -- Defense in depth: alleen gerechten van dezelfde org
          AND EXISTS (
              SELECT 1 FROM public.gerechten g
              WHERE g.id = (item->>'gerecht_id')::uuid
                AND g.organization_id = v_org_id
          );
    END IF;

    GET DIAGNOSTICS v_item_count = ROW_COUNT;

    -- Regenereer menu_selectie JSONB als read-cache (legacy consumers).
    -- Shape blijft { gang_slug: [naam, ...] } zodat oude code blijft werken.
    UPDATE public.menu_templates SET menu_selectie = COALESCE(
        (
            SELECT jsonb_object_agg(gang_slug, dish_names)
            FROM (
                SELECT
                    mti.gang_slug,
                    jsonb_agg(g.naam ORDER BY mti.volgorde) AS dish_names
                FROM public.menu_template_items mti
                JOIN public.gerechten g ON g.id = mti.gerecht_id
                WHERE mti.menu_template_id = v_template_id
                GROUP BY mti.gang_slug
            ) AS agg
        ),
        '{}'::jsonb
    )
    WHERE id = v_template_id;

    RETURN v_template_id;
END;
$$;

COMMENT ON FUNCTION public.rpc_upsert_menu_template IS
'Atomaire upsert van een menu-template + items. Schrijft naar menu_template_items én regenereert menu_templates.menu_selectie als read-cache voor legacy consumers.';

-- ── 4. Best-effort backfill van bestaande by-naam menu_selectie ──────────────
-- Match LOWER(TRIM(name)) per organization. Niet-gematchte namen blijven
-- alleen in JSONB staan; UI toont badge "ongekoppeld" op die items.
-- Idempotent: ON CONFLICT skip + WHERE NOT EXISTS guard.

INSERT INTO public.menu_template_items
    (menu_template_id, gerecht_id, gang_slug, volgorde, organization_id)
SELECT
    mt.id,
    g.id,
    kv.key AS gang_slug,
    (ord.ordinality - 1)::int AS volgorde,
    mt.organization_id
FROM public.menu_templates mt
CROSS JOIN LATERAL jsonb_each(
    CASE
        WHEN jsonb_typeof(mt.menu_selectie) = 'object' THEN mt.menu_selectie
        ELSE '{}'::jsonb
    END
) AS kv
CROSS JOIN LATERAL jsonb_array_elements_text(
    CASE
        WHEN jsonb_typeof(kv.value) = 'array' THEN kv.value
        ELSE '[]'::jsonb
    END
) WITH ORDINALITY AS ord(naam_str, ordinality)
JOIN public.gerechten g
  ON g.organization_id = mt.organization_id
 AND LOWER(TRIM(g.naam)) = LOWER(TRIM(ord.naam_str))
WHERE mt.organization_id IS NOT NULL
  AND NOT EXISTS (
      SELECT 1 FROM public.menu_template_items existing
      WHERE existing.menu_template_id = mt.id
  )
ON CONFLICT (menu_template_id, gang_slug, gerecht_id) DO NOTHING;

-- ── 5. Backfill-statistieken loggen voor inspectie na deploy ────────────────
DO $$
DECLARE
    v_templates_total  INTEGER;
    v_templates_linked INTEGER;
    v_items_inserted   INTEGER;
BEGIN
    SELECT COUNT(*) INTO v_templates_total
    FROM public.menu_templates
    WHERE jsonb_typeof(menu_selectie) = 'object'
      AND menu_selectie <> '{}'::jsonb;

    SELECT COUNT(DISTINCT menu_template_id) INTO v_templates_linked
    FROM public.menu_template_items;

    SELECT COUNT(*) INTO v_items_inserted
    FROM public.menu_template_items;

    RAISE NOTICE 'menu_template_items backfill: % items in % linked templates (van % totaal met JSONB-data)',
        v_items_inserted, v_templates_linked, v_templates_total;
END $$;

-- ── 6. updated_at trigger op menu_template_items (parent-touch) ─────────────
-- Wanneer een item gewijzigd wordt zonder via de RPC te gaan (legacy flows,
-- handmatige PostgREST-call) updaten we de parent template's updated_at zodat
-- de read-cache sync NIET vereist is voor dat geval. RPC doet de cache zelf.

CREATE OR REPLACE FUNCTION public.touch_menu_template_on_item_change()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    UPDATE public.menu_templates
    SET updated_at = now()
    WHERE id = COALESCE(NEW.menu_template_id, OLD.menu_template_id);
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_mti_touch_parent ON public.menu_template_items;
CREATE TRIGGER trg_mti_touch_parent
    AFTER INSERT OR UPDATE OR DELETE ON public.menu_template_items
    FOR EACH ROW
    EXECUTE FUNCTION public.touch_menu_template_on_item_change();
