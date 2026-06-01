-- ============================================================
-- Migration 013 — Sluit cross-tenant lek in supplier_invoices + KDS-tabellen
-- ============================================================
--
-- ACHTERGROND
-- ───────────
-- Pre-launch audit 2026-06-01 (docs/audits/pre-launch-audit-2026-06-01.md)
-- markeerde vijf RLS-policies als P0 cross-tenant lek: USING (true) /
-- WITH CHECK (true) op tabellen met tenant-scoped data. Een ingelogde
-- gebruiker van tenant A kon dus rijen van tenant B lezen en schrijven.
--
-- Concreet onveilig:
--   • supplier_invoices    — leveranciersfacturen (Belastingdienst-risico)
--   • supplier_invoice_lines — regels onder die facturen
--   • service_state        — live KDS-state per event
--   • service_audit_logs   — KHN-hygiënecode-proof audit-trail
--
-- PATROON
-- ───────
-- Gevolgde stijl uit 20260516100000_ai_usage_table.sql + 011_activation_events.sql:
--
--   USING (
--     organization_id IN (
--       SELECT organization_id FROM organization_members
--       WHERE user_id = (select auth.uid()) AND status = 'active'
--     )
--   )
--
-- De `(select auth.uid())`-wrap zorgt dat Postgres de uitkomst per query
-- cachet (init-plan) i.p.v. per rij re-evalueert → RLS-perf-best-practice.
-- Alleen 'active' members tellen — invited/inactive krijgt geen toegang.
--
-- KOLOM-LET-OP
-- ────────────
-- supplier_invoices.organization_id      → UUID, eigen kolom
-- supplier_invoice_lines.organization_id → UUID, eigen kolom (mag NULL zijn → backfill)
-- service_state.org_id                   → UUID, eigen kolom (mag NULL zijn → backfill)
-- service_audit_logs.org_id              → UUID, eigen kolom (mag NULL zijn → backfill)
--
-- service_audit_logs blijft append-only — alleen SELECT + INSERT, GEEN
-- UPDATE/DELETE-policy (KHN-hygiënecode + AVG immutability).

-- ─── 0. Defensive pre-flight ────────────────────────────────────────────
-- Memory: feedback_migration_dependencies — niet aannemen dat eerdere
-- migraties al gedraaid zijn. Check via information_schema.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'organization_members'
  ) THEN
    RAISE EXCEPTION 'organization_members ontbreekt — draai eerst 001_multi_tenant.sql';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'supplier_invoices'
  ) THEN
    RAISE EXCEPTION 'supplier_invoices ontbreekt — draai eerst 004_supplier_invoices.sql';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'service_state'
  ) THEN
    RAISE EXCEPTION 'service_state ontbreekt — draai eerst 012_kds_service_state.sql';
  END IF;
END $$;

-- ─── 1. Backfill organization_id voor supplier_invoice_lines ────────────
-- Kolom bestaat al sinds 004 (ALTER ADD IF NOT EXISTS), maar oude rijen
-- kunnen NULL zijn (open policy liet dat toe). Vul aan via invoice-join.

UPDATE supplier_invoice_lines sil
   SET organization_id = si.organization_id
  FROM supplier_invoices si
 WHERE sil.invoice_id = si.id
   AND sil.organization_id IS NULL
   AND si.organization_id IS NOT NULL;

-- ─── 2. Backfill org_id voor service_state + service_audit_logs ─────────
-- Beide referen via event_id naar events(id). Events heeft organization_id
-- sinds 001_multi_tenant. Defensieve existence-check voor de zekerheid.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'events'
       AND column_name = 'organization_id'
  ) THEN
    UPDATE service_state ss
       SET org_id = e.organization_id
      FROM events e
     WHERE ss.event_id = e.id
       AND ss.org_id IS NULL
       AND e.organization_id IS NOT NULL;

    UPDATE service_audit_logs sal
       SET org_id = e.organization_id
      FROM events e
     WHERE sal.event_id = e.id
       AND sal.org_id IS NULL
       AND e.organization_id IS NOT NULL;
  END IF;
END $$;

-- ─── 3. Index op org-kolommen (RLS-perf — policy filtert op deze kolom) ─

CREATE INDEX IF NOT EXISTS idx_service_state_org_id
  ON service_state(org_id);

CREATE INDEX IF NOT EXISTS idx_service_audit_logs_org_id
  ON service_audit_logs(org_id);

-- supplier_invoices + supplier_invoice_lines hebben deze indexen al
-- (idx_supplier_invoices_org + idx_supplier_invoice_lines_org uit 004).

-- ─── 4. Drop oude open policies ─────────────────────────────────────────

DROP POLICY IF EXISTS "Allow all"                   ON supplier_invoices;
DROP POLICY IF EXISTS "Allow all"                   ON supplier_invoice_lines;
DROP POLICY IF EXISTS "service_state_all_by_org"    ON service_state;
DROP POLICY IF EXISTS "service_audit_logs_select"   ON service_audit_logs;
DROP POLICY IF EXISTS "service_audit_logs_insert"   ON service_audit_logs;

-- Idempotent: drop ook eventueel al-eerder-aangemaakte nieuwe policies
-- zodat hertoepassen niet faalt.
DROP POLICY IF EXISTS "supplier_invoices_select"        ON supplier_invoices;
DROP POLICY IF EXISTS "supplier_invoices_insert"        ON supplier_invoices;
DROP POLICY IF EXISTS "supplier_invoices_update"        ON supplier_invoices;
DROP POLICY IF EXISTS "supplier_invoices_delete"        ON supplier_invoices;
DROP POLICY IF EXISTS "supplier_invoice_lines_select"   ON supplier_invoice_lines;
DROP POLICY IF EXISTS "supplier_invoice_lines_insert"   ON supplier_invoice_lines;
DROP POLICY IF EXISTS "supplier_invoice_lines_update"   ON supplier_invoice_lines;
DROP POLICY IF EXISTS "supplier_invoice_lines_delete"   ON supplier_invoice_lines;
DROP POLICY IF EXISTS "service_state_select"            ON service_state;
DROP POLICY IF EXISTS "service_state_insert"            ON service_state;
DROP POLICY IF EXISTS "service_state_update"            ON service_state;
DROP POLICY IF EXISTS "service_state_delete"            ON service_state;
DROP POLICY IF EXISTS "service_audit_logs_select_org"   ON service_audit_logs;
DROP POLICY IF EXISTS "service_audit_logs_insert_org"   ON service_audit_logs;

-- ─── 5. supplier_invoices — org-scoped CRUD ─────────────────────────────

CREATE POLICY "supplier_invoices_select" ON supplier_invoices
  FOR SELECT TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_members
       WHERE user_id = (select auth.uid()) AND status = 'active'
    )
  );

CREATE POLICY "supplier_invoices_insert" ON supplier_invoices
  FOR INSERT TO authenticated
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM organization_members
       WHERE user_id = (select auth.uid()) AND status = 'active'
    )
  );

CREATE POLICY "supplier_invoices_update" ON supplier_invoices
  FOR UPDATE TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_members
       WHERE user_id = (select auth.uid()) AND status = 'active'
    )
  )
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM organization_members
       WHERE user_id = (select auth.uid()) AND status = 'active'
    )
  );

CREATE POLICY "supplier_invoices_delete" ON supplier_invoices
  FOR DELETE TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_members
       WHERE user_id = (select auth.uid()) AND status = 'active'
    )
  );

-- ─── 6. supplier_invoice_lines — org-scoped CRUD ────────────────────────

CREATE POLICY "supplier_invoice_lines_select" ON supplier_invoice_lines
  FOR SELECT TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_members
       WHERE user_id = (select auth.uid()) AND status = 'active'
    )
  );

CREATE POLICY "supplier_invoice_lines_insert" ON supplier_invoice_lines
  FOR INSERT TO authenticated
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM organization_members
       WHERE user_id = (select auth.uid()) AND status = 'active'
    )
  );

CREATE POLICY "supplier_invoice_lines_update" ON supplier_invoice_lines
  FOR UPDATE TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_members
       WHERE user_id = (select auth.uid()) AND status = 'active'
    )
  )
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM organization_members
       WHERE user_id = (select auth.uid()) AND status = 'active'
    )
  );

CREATE POLICY "supplier_invoice_lines_delete" ON supplier_invoice_lines
  FOR DELETE TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_members
       WHERE user_id = (select auth.uid()) AND status = 'active'
    )
  );

-- ─── 7. service_state — org-scoped CRUD (live KDS) ──────────────────────

CREATE POLICY "service_state_select" ON service_state
  FOR SELECT TO authenticated
  USING (
    org_id IN (
      SELECT organization_id FROM organization_members
       WHERE user_id = (select auth.uid()) AND status = 'active'
    )
  );

CREATE POLICY "service_state_insert" ON service_state
  FOR INSERT TO authenticated
  WITH CHECK (
    org_id IN (
      SELECT organization_id FROM organization_members
       WHERE user_id = (select auth.uid()) AND status = 'active'
    )
  );

CREATE POLICY "service_state_update" ON service_state
  FOR UPDATE TO authenticated
  USING (
    org_id IN (
      SELECT organization_id FROM organization_members
       WHERE user_id = (select auth.uid()) AND status = 'active'
    )
  )
  WITH CHECK (
    org_id IN (
      SELECT organization_id FROM organization_members
       WHERE user_id = (select auth.uid()) AND status = 'active'
    )
  );

CREATE POLICY "service_state_delete" ON service_state
  FOR DELETE TO authenticated
  USING (
    org_id IN (
      SELECT organization_id FROM organization_members
       WHERE user_id = (select auth.uid()) AND status = 'active'
    )
  );

-- ─── 8. service_audit_logs — SELECT + INSERT only (append-only) ─────────
-- Bewust GEEN UPDATE/DELETE-policy → KHN-hygiënecode + AVG-trail immutable.

CREATE POLICY "service_audit_logs_select_org" ON service_audit_logs
  FOR SELECT TO authenticated
  USING (
    org_id IN (
      SELECT organization_id FROM organization_members
       WHERE user_id = (select auth.uid()) AND status = 'active'
    )
  );

CREATE POLICY "service_audit_logs_insert_org" ON service_audit_logs
  FOR INSERT TO authenticated
  WITH CHECK (
    org_id IN (
      SELECT organization_id FROM organization_members
       WHERE user_id = (select auth.uid()) AND status = 'active'
    )
  );

-- ─── 9. Post-flight sanity-NOTICE ───────────────────────────────────────
-- Toon hoeveel rijen er nog NULL-org hebben → die zijn na deze migration
-- onbereikbaar via RLS (server-role bypasst RLS, dus data is niet verloren).

DO $$
DECLARE
  n_si_null  INTEGER;
  n_sil_null INTEGER;
  n_ss_null  INTEGER;
  n_sal_null INTEGER;
BEGIN
  SELECT count(*) INTO n_si_null  FROM supplier_invoices       WHERE organization_id IS NULL;
  SELECT count(*) INTO n_sil_null FROM supplier_invoice_lines  WHERE organization_id IS NULL;
  SELECT count(*) INTO n_ss_null  FROM service_state           WHERE org_id IS NULL;
  SELECT count(*) INTO n_sal_null FROM service_audit_logs      WHERE org_id IS NULL;

  IF n_si_null + n_sil_null + n_ss_null + n_sal_null > 0 THEN
    RAISE NOTICE 'Migration 013: % supplier_invoices, % supplier_invoice_lines, % service_state, % service_audit_logs hebben NULL org — niet RLS-bereikbaar. Backfill handmatig of negeer als testdata.',
      n_si_null, n_sil_null, n_ss_null, n_sal_null;
  END IF;
END $$;

COMMENT ON POLICY "supplier_invoices_select"      ON supplier_invoices      IS 'Org-scoped — vervangt "Allow all" uit 004 (cross-tenant lek dichtgezet 2026-06-01).';
COMMENT ON POLICY "supplier_invoice_lines_select" ON supplier_invoice_lines IS 'Org-scoped — vervangt "Allow all" uit 004 (cross-tenant lek dichtgezet 2026-06-01).';
COMMENT ON POLICY "service_state_select"          ON service_state          IS 'Org-scoped — vervangt "service_state_all_by_org" uit 012 (cross-tenant lek dichtgezet 2026-06-01).';
COMMENT ON POLICY "service_audit_logs_select_org" ON service_audit_logs     IS 'Org-scoped — vervangt USING(true) uit 012. Append-only behouden (geen UPDATE/DELETE-policy).';
