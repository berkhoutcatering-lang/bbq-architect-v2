-- Follow-up hardening for Supabase Security Advisor findings.

-- Views in exposed schemas should execute with the querying user's privileges,
-- not the view owner's privileges.
DO $$
BEGIN
  IF to_regclass('public.v_org_inbox_address') IS NOT NULL THEN
    ALTER VIEW public.v_org_inbox_address SET (security_invoker = true);
  END IF;
  IF to_regclass('public.inventory_avg_daily_v') IS NOT NULL THEN
    ALTER VIEW public.inventory_avg_daily_v SET (security_invoker = true);
  END IF;
END $$;

-- Keep RLS helper functions out of the exposed public API schema. They still
-- need EXECUTE privileges for RLS policy evaluation, but the private schema is
-- not listed in api.schemas/PostgREST exposed schemas.
CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC;
GRANT USAGE ON SCHEMA private TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION private.user_org_ids()
RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT organization_id
  FROM organization_members
  WHERE user_id = auth.uid()
    AND status = 'active';
$$;

CREATE OR REPLACE FUNCTION private.current_org_id()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT organization_id
  FROM organization_members
  WHERE user_id = auth.uid()
    AND status = 'active'
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION private.user_org_ids() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.current_org_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.user_org_ids() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.current_org_id() TO anon, authenticated, service_role;

DO $$
DECLARE
  pol record;
  new_qual text;
  new_check text;
  stmt text;
BEGIN
  FOR pol IN
    SELECT schemaname, tablename, policyname, qual, with_check
    FROM pg_policies
    WHERE schemaname = 'public'
      AND (
        qual LIKE '%user_org_ids()%'
        OR with_check LIKE '%user_org_ids()%'
        OR qual LIKE '%current_org_id()%'
        OR with_check LIKE '%current_org_id()%'
      )
  LOOP
    new_qual := pol.qual;
    new_check := pol.with_check;

    IF new_qual IS NOT NULL THEN
      new_qual := replace(new_qual, 'private.user_org_ids()', '__PRIVATE_USER_ORG_IDS__');
      new_qual := replace(new_qual, 'private.current_org_id()', '__PRIVATE_CURRENT_ORG_ID__');
      new_qual := replace(new_qual, 'auth.user_org_ids()', 'private.user_org_ids()');
      new_qual := replace(new_qual, 'public.user_org_ids()', 'private.user_org_ids()');
      new_qual := replace(new_qual, 'user_org_ids()', 'private.user_org_ids()');
      new_qual := replace(new_qual, 'auth.current_org_id()', 'private.current_org_id()');
      new_qual := replace(new_qual, 'public.current_org_id()', 'private.current_org_id()');
      new_qual := replace(new_qual, 'current_org_id()', 'private.current_org_id()');
      new_qual := replace(new_qual, '__PRIVATE_USER_ORG_IDS__', 'private.user_org_ids()');
      new_qual := replace(new_qual, '__PRIVATE_CURRENT_ORG_ID__', 'private.current_org_id()');
    END IF;

    IF new_check IS NOT NULL THEN
      new_check := replace(new_check, 'private.user_org_ids()', '__PRIVATE_USER_ORG_IDS__');
      new_check := replace(new_check, 'private.current_org_id()', '__PRIVATE_CURRENT_ORG_ID__');
      new_check := replace(new_check, 'auth.user_org_ids()', 'private.user_org_ids()');
      new_check := replace(new_check, 'public.user_org_ids()', 'private.user_org_ids()');
      new_check := replace(new_check, 'user_org_ids()', 'private.user_org_ids()');
      new_check := replace(new_check, 'auth.current_org_id()', 'private.current_org_id()');
      new_check := replace(new_check, 'public.current_org_id()', 'private.current_org_id()');
      new_check := replace(new_check, 'current_org_id()', 'private.current_org_id()');
      new_check := replace(new_check, '__PRIVATE_USER_ORG_IDS__', 'private.user_org_ids()');
      new_check := replace(new_check, '__PRIVATE_CURRENT_ORG_ID__', 'private.current_org_id()');
    END IF;

    stmt := format('ALTER POLICY %I ON %I.%I', pol.policyname, pol.schemaname, pol.tablename);
    IF new_qual IS NOT NULL THEN
      stmt := stmt || format(' USING (%s)', new_qual);
    END IF;
    IF new_check IS NOT NULL THEN
      stmt := stmt || format(' WITH CHECK (%s)', new_check);
    END IF;
    EXECUTE stmt;
  END LOOP;
END $$;

-- Pin search_path on functions flagged by the advisor when they exist.
DO $$
DECLARE
  fn text;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'public.fill_org_id_from_inventory()',
    'public.set_email_inbox_updated()',
    'public.calc_price_mutation_delta()',
    'public.purge_old_email_inbox_bodies()',
    'public.pdf_templates_touch_updated_at()',
    'public.trigger_service_state_updated_at()',
    'public.update_menu_templates_updated_at()',
    'public.refresh_inventory_used_in(uuid)',
    'public.trg_refresh_used_in()',
    'public.sync_avg_daily(uuid)',
    'public.set_courses_updated_at()',
    'public.set_updated_at_v2()',
    'public.fill_org_id_from_event()'
  ]
  LOOP
    IF to_regprocedure(fn) IS NOT NULL THEN
      EXECUTE format('ALTER FUNCTION %s SET search_path = public, pg_temp', fn);
    END IF;
  END LOOP;
END $$;

-- Trigger/admin functions and server-only maintenance RPCs must not be exposed
-- to public API roles. Service-role access is kept for trusted server routes.
DO $$
DECLARE
  fn text;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'public.current_org_id()',
    'public.purge_old_email_inbox_bodies()',
    'public.refresh_inventory_used_in(uuid)',
    'public.rls_auto_enable()',
    'public.set_activation_event_org_user()',
    'public.sync_avg_daily(uuid)',
    'public.trg_refresh_used_in()',
    'public.user_org_ids()'
  ]
  LOOP
    IF to_regprocedure(fn) IS NOT NULL THEN
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', fn);
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', fn);
    END IF;
  END LOOP;
END $$;

-- Public buckets still serve object URLs without broad SELECT/list policies.
DROP POLICY IF EXISTS materieel_allow_select ON storage.objects;
DROP POLICY IF EXISTS pricelists_allow_select ON storage.objects;
