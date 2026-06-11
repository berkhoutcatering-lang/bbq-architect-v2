-- =============================================================================
-- APK v3 — RLS consolidatie + rol-gating (DRAFT, NIET APPLIED)
-- =============================================================================
-- Hernoem naar `20260609xxxxxx_apk_rls_consolidate.sql` om te activeren.
-- Tasks: #14 (multiple_permissive) + #4 (rol-gating).
--
-- Apply STAPSGEWIJS — niet alles tegelijk. Tussen elke stap: smoke-test.
-- Volgorde:
--   STAP 1 — Pattern A: 10 pure duplicate drops
--   STAP 2 — Pattern B: 6 public-read TO anon
--   STAP 3 — Pattern C (#4): rol-gating op gevoelige tabellen
-- =============================================================================


-- ── STAP 1: Pattern A — pure duplicaten droppen ─────────────────────────────
-- Risico: geen. org_* policies bevatten zelfde of striktere semantiek.

DROP POLICY IF EXISTS supplier_invoices_insert ON public.supplier_invoices;
DROP POLICY IF EXISTS supplier_invoices_select ON public.supplier_invoices;
DROP POLICY IF EXISTS supplier_invoices_update ON public.supplier_invoices;
DROP POLICY IF EXISTS supplier_invoices_delete ON public.supplier_invoices;

DROP POLICY IF EXISTS supplier_invoice_lines_insert ON public.supplier_invoice_lines;
DROP POLICY IF EXISTS supplier_invoice_lines_select ON public.supplier_invoice_lines;
DROP POLICY IF EXISTS supplier_invoice_lines_update ON public.supplier_invoice_lines;
DROP POLICY IF EXISTS supplier_invoice_lines_delete ON public.supplier_invoice_lines;

DROP POLICY IF EXISTS profiles_org ON public.profiles;
DROP POLICY IF EXISTS ai_usage_select_own_org ON public.ai_usage;

-- VERIFY STAP 1:
--   SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename IN ('profiles','ai_usage','supplier_invoices','supplier_invoice_lines');
-- Verwacht: 4+3+4+4 = 15 (was 5+3+8+8 = 24). Profiles: 5→4 (drop profiles_org). ai_usage: 3→3 want drop ai_usage_select_own_org bestond niet onder die naam — verify eerst!


-- ── STAP 2: Pattern B — public-read TO anon (6 edits) ────────────────────────
-- Risico: medium. Verifieer /website preview-page + /q/[token] portal werkt nog.

DROP POLICY IF EXISTS "Public read gangen" ON public.gangen;
CREATE POLICY "Public read gangen" ON public.gangen
  AS PERMISSIVE FOR SELECT TO anon
  USING (true);

DROP POLICY IF EXISTS "Public read website_faq" ON public.website_faq;
CREATE POLICY "Public read website_faq" ON public.website_faq
  AS PERMISSIVE FOR SELECT TO anon
  USING (true);

DROP POLICY IF EXISTS "Public read website_gallery" ON public.website_gallery;
CREATE POLICY "Public read website_gallery" ON public.website_gallery
  AS PERMISSIVE FOR SELECT TO anon
  USING (true);

DROP POLICY IF EXISTS "Public read website_gangen" ON public.website_gangen;
CREATE POLICY "Public read website_gangen" ON public.website_gangen
  AS PERMISSIVE FOR SELECT TO anon
  USING (true);

DROP POLICY IF EXISTS "Public read website_gerechten" ON public.website_gerechten;
CREATE POLICY "Public read website_gerechten" ON public.website_gerechten
  AS PERMISSIVE FOR SELECT TO anon
  USING (true);

DROP POLICY IF EXISTS "Public read website_hero" ON public.website_hero;
CREATE POLICY "Public read website_hero" ON public.website_hero
  AS PERMISSIVE FOR SELECT TO anon
  USING (true);


-- ── STAP 3: Pattern C — rol-gating (#4) ──────────────────────────────────────
-- Risico: medium-hoog. Eerst verifieer: SELECT DISTINCT role FROM organization_members;
-- Verwacht enum: 'Admin', 'Pitmaster', 'Medewerker'. Als andere casing/waarden,
-- pas constraints aan.
--
-- Pattern: behoud bestaande org_* policy (SELECT), voeg aparte Admin-policy
-- toe voor DELETE/UPDATE op gevoelige tabellen.

-- Helper: returnt true als huidige user Admin is in gegeven org
CREATE OR REPLACE FUNCTION private.user_is_admin_in_org(p_org_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE organization_id = p_org_id
      AND user_id = (SELECT auth.uid())
      AND role = 'Admin'
      AND status = 'active'
  );
$$;

-- facturen: alleen Admin mag DELETE en UPDATE
ALTER POLICY org_delete ON public.facturen USING (
  organization_id IN (SELECT private.user_org_ids())
  AND private.user_is_admin_in_org(organization_id)
);
ALTER POLICY org_update ON public.facturen USING (
  organization_id IN (SELECT private.user_org_ids())
  AND private.user_is_admin_in_org(organization_id)
);

-- ai_usage: alleen Admin mag DELETE (read mag elk org-lid)
ALTER POLICY org_delete ON public.ai_usage USING (
  organization_id IN (SELECT private.user_org_ids())
  AND private.user_is_admin_in_org(organization_id)
);

-- organization_members: alleen Admin mag muteren (insert/update/delete)
ALTER POLICY members_insert ON public.organization_members WITH CHECK (
  organization_id IN (SELECT private.user_org_ids())
  AND private.user_is_admin_in_org(organization_id)
);
ALTER POLICY members_update ON public.organization_members USING (
  organization_id IN (SELECT private.user_org_ids())
  AND private.user_is_admin_in_org(organization_id)
);
ALTER POLICY members_delete ON public.organization_members USING (
  organization_id IN (SELECT private.user_org_ids())
  AND private.user_is_admin_in_org(organization_id)
);

-- settings: alleen Admin mag wijzigen (read mag elk org-lid voor brand-info)
ALTER POLICY org_update ON public.settings USING (
  organization_id IN (SELECT private.user_org_ids())
  AND private.user_is_admin_in_org(organization_id)
);

-- voertuigen: alleen Admin mag DELETE + UPDATE
ALTER POLICY voertuigen_delete ON public.voertuigen USING (
  organization_id IN (SELECT private.user_org_ids())
  AND private.user_is_admin_in_org(organization_id)
);
ALTER POLICY voertuigen_update ON public.voertuigen USING (
  organization_id IN (SELECT private.user_org_ids())
  AND private.user_is_admin_in_org(organization_id)
);

-- ritten: alleen Admin mag DELETE (insert/update mag iedereen voor eigen ritten)
ALTER POLICY org_delete ON public.ritten USING (
  organization_id IN (SELECT private.user_org_ids())
  AND private.user_is_admin_in_org(organization_id)
);

-- pdf_templates: alleen Admin mag muteren (rendering shared)
ALTER POLICY org_update ON public.pdf_templates USING (
  organization_id IN (SELECT private.user_org_ids())
  AND private.user_is_admin_in_org(organization_id)
);
ALTER POLICY org_delete ON public.pdf_templates USING (
  organization_id IN (SELECT private.user_org_ids())
  AND private.user_is_admin_in_org(organization_id)
);

-- boekhouder_pakketten: alleen Admin mag muteren
ALTER POLICY org_delete ON public.boekhouder_pakketten USING (
  organization_id IN (SELECT private.user_org_ids())
  AND private.user_is_admin_in_org(organization_id)
);


-- VERIFY STAP 3 (evil-tenant test):
-- 1. Maak in organization_members een Medewerker-user
-- 2. Log in als die user
-- 3. DELETE FROM facturen WHERE id = 1 → moet 0 rows of error geven
-- 4. UPDATE organization_members SET role='Admin' WHERE user_id=auth.uid() → moet falen
