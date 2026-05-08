-- Security hardening after public quote flow was moved behind server routes.

-- Public quote pages now use /api/public-offerte/[token] with service-role lookup.
-- Do not expose all published quotes through the anon Data API.
DROP POLICY IF EXISTS "public_quote_view" ON offertes;

-- Supplier invoice data is tenant data. Older installs had permissive "Allow all"
-- policies, while the linked production project already has org_* policies. Drop
-- only unsafe/custom policies and add scoped fallbacks when org_* is missing.
DROP POLICY IF EXISTS "Allow all" ON supplier_invoices;
DROP POLICY IF EXISTS supplier_invoices_select ON supplier_invoices;
DROP POLICY IF EXISTS supplier_invoices_insert ON supplier_invoices;
DROP POLICY IF EXISTS supplier_invoices_update ON supplier_invoices;
DROP POLICY IF EXISTS supplier_invoices_delete ON supplier_invoices;

DROP POLICY IF EXISTS "Allow all" ON supplier_invoice_lines;
DROP POLICY IF EXISTS supplier_invoice_lines_select ON supplier_invoice_lines;
DROP POLICY IF EXISTS supplier_invoice_lines_insert ON supplier_invoice_lines;
DROP POLICY IF EXISTS supplier_invoice_lines_update ON supplier_invoice_lines;
DROP POLICY IF EXISTS supplier_invoice_lines_delete ON supplier_invoice_lines;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'supplier_invoices'
      AND policyname = 'org_select'
  ) THEN
    CREATE POLICY supplier_invoices_select ON supplier_invoices
      FOR SELECT TO authenticated
      USING (organization_id IN (SELECT public.user_org_ids()));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'supplier_invoices'
      AND policyname = 'org_insert'
  ) THEN
    CREATE POLICY supplier_invoices_insert ON supplier_invoices
      FOR INSERT TO authenticated
      WITH CHECK (organization_id IN (SELECT public.user_org_ids()));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'supplier_invoices'
      AND policyname = 'org_update'
  ) THEN
    CREATE POLICY supplier_invoices_update ON supplier_invoices
      FOR UPDATE TO authenticated
      USING (organization_id IN (SELECT public.user_org_ids()))
      WITH CHECK (organization_id IN (SELECT public.user_org_ids()));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'supplier_invoices'
      AND policyname = 'org_delete'
  ) THEN
    CREATE POLICY supplier_invoices_delete ON supplier_invoices
      FOR DELETE TO authenticated
      USING (organization_id IN (SELECT public.user_org_ids()));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'supplier_invoice_lines'
      AND policyname = 'org_select'
  ) THEN
    CREATE POLICY supplier_invoice_lines_select ON supplier_invoice_lines
      FOR SELECT TO authenticated
      USING (organization_id IN (SELECT public.user_org_ids()));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'supplier_invoice_lines'
      AND policyname = 'org_insert'
  ) THEN
    CREATE POLICY supplier_invoice_lines_insert ON supplier_invoice_lines
      FOR INSERT TO authenticated
      WITH CHECK (organization_id IN (SELECT public.user_org_ids()));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'supplier_invoice_lines'
      AND policyname = 'org_update'
  ) THEN
    CREATE POLICY supplier_invoice_lines_update ON supplier_invoice_lines
      FOR UPDATE TO authenticated
      USING (organization_id IN (SELECT public.user_org_ids()))
      WITH CHECK (organization_id IN (SELECT public.user_org_ids()));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'supplier_invoice_lines'
      AND policyname = 'org_delete'
  ) THEN
    CREATE POLICY supplier_invoice_lines_delete ON supplier_invoice_lines
      FOR DELETE TO authenticated
      USING (organization_id IN (SELECT public.user_org_ids()));
  END IF;
END $$;

-- KDS live-service tables already carry org_id. Scope policies to active orgs.
DROP POLICY IF EXISTS "service_state_all_by_org" ON service_state;
DROP POLICY IF EXISTS service_state_select ON service_state;
DROP POLICY IF EXISTS service_state_insert ON service_state;
DROP POLICY IF EXISTS service_state_update ON service_state;
DROP POLICY IF EXISTS service_state_delete ON service_state;

CREATE POLICY service_state_select ON service_state
  FOR SELECT TO authenticated
  USING (org_id IN (SELECT public.user_org_ids()));

CREATE POLICY service_state_insert ON service_state
  FOR INSERT TO authenticated
  WITH CHECK (org_id IN (SELECT public.user_org_ids()));

CREATE POLICY service_state_update ON service_state
  FOR UPDATE TO authenticated
  USING (org_id IN (SELECT public.user_org_ids()))
  WITH CHECK (org_id IN (SELECT public.user_org_ids()));

CREATE POLICY service_state_delete ON service_state
  FOR DELETE TO authenticated
  USING (org_id IN (SELECT public.user_org_ids()));

DROP POLICY IF EXISTS "service_audit_logs_select" ON service_audit_logs;
DROP POLICY IF EXISTS service_audit_logs_select ON service_audit_logs;

CREATE POLICY service_audit_logs_select ON service_audit_logs
  FOR SELECT TO authenticated
  USING (org_id IN (SELECT public.user_org_ids()));

DROP POLICY IF EXISTS "service_audit_logs_insert" ON service_audit_logs;
DROP POLICY IF EXISTS service_audit_logs_insert ON service_audit_logs;

CREATE POLICY service_audit_logs_insert ON service_audit_logs
  FOR INSERT TO authenticated
  WITH CHECK (org_id IN (SELECT public.user_org_ids()));
