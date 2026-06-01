-- Pre-launch audit P0 (geherscoped na Mathijs' akkoord 2026-06-01):
-- Sluit cross-tenant lek via SECURITY DEFINER views uit Supabase advisor.
--
-- Origineel plan noemde supplier_invoices/kds_service_state RLS-fix, maar
-- die was al opgelost in migration 20260421134757. De echte security-
-- errors uit de advisor zijn drie SECURITY DEFINER views + één tabel
-- met RLS-aan zonder policy. Mathijs gaf hiervoor akkoord.
--
-- 1. event_checklist_legacy_v — geen code-references (grep src/ = 0 hits),
--    naam zegt "legacy" → drop
-- 2. haccp_event_summary — geen code-references maar nuttige aggregatie,
--    convert naar SECURITY INVOKER (Postgres 15+ feature)
-- 3. v_pricelist_upload_with_chunks — geen code-references, wrapper over
--    org_pricelist_uploads → convert
-- 4. meat_taxonomy heeft RLS-aan zonder policy = dichtgegooid voor
--    user-queries (alleen service-role kan erbij). Maar feature gebruikt
--    het via Server Actions (gerechten/SubstitutionDrawer, price-intelligence).
--    Conform allergens-pattern: public_read SELECT (reference data, geen
--    organization_id-kolom).

DROP VIEW IF EXISTS public.event_checklist_legacy_v;

ALTER VIEW public.haccp_event_summary SET (security_invoker = true);
ALTER VIEW public.v_pricelist_upload_with_chunks SET (security_invoker = true);

DROP POLICY IF EXISTS "public_read" ON public.meat_taxonomy;
CREATE POLICY "public_read" ON public.meat_taxonomy
    FOR SELECT
    USING (true);

COMMENT ON POLICY "public_read" ON public.meat_taxonomy IS 'Reference data — geen organization_id. Iedere ingelogde user mag lezen, alleen service-role schrijft (via seed scripts).';
