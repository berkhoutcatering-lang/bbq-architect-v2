-- ============================================================
-- BBQ Architect v2 — Multi-Tenant Migration
-- Adds organizations, membership, invitations and scopes
-- ALL data tables by organization_id with proper RLS.
-- ============================================================

-- ─── 1. Core Tenant Tables ──────────────────────────────────

CREATE TABLE IF NOT EXISTS organizations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  slug        TEXT NOT NULL UNIQUE,
  logo_url    TEXT,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS organization_members (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role            TEXT NOT NULL DEFAULT 'Medewerker'
                    CHECK (role IN ('Admin', 'Pitmaster', 'Medewerker')),
  status          TEXT NOT NULL DEFAULT 'active'
                    CHECK (status IN ('invited', 'active', 'inactive')),
  invited_by      UUID REFERENCES auth.users(id),
  joined_at       TIMESTAMPTZ DEFAULT now(),
  created_at      TIMESTAMPTZ DEFAULT now(),
  UNIQUE(organization_id, user_id)
);

CREATE TABLE IF NOT EXISTS invitations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email           TEXT NOT NULL,
  role            TEXT NOT NULL DEFAULT 'Medewerker',
  invited_by      UUID NOT NULL REFERENCES auth.users(id),
  token           TEXT NOT NULL UNIQUE DEFAULT gen_random_uuid()::text,
  expires_at      TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '7 days'),
  accepted_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- ─── 2. Helper Functions ────────────────────────────────────

CREATE OR REPLACE FUNCTION auth.user_org_ids()
RETURNS SETOF UUID
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT organization_id
  FROM organization_members
  WHERE user_id = auth.uid()
    AND status = 'active';
$$;

CREATE OR REPLACE FUNCTION auth.current_org_id()
RETURNS UUID
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT organization_id
  FROM organization_members
  WHERE user_id = auth.uid()
    AND status = 'active'
  LIMIT 1;
$$;

-- ─── 3. Modify profiles table ───────────────────────────────

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS avatar_url TEXT;

-- ─── 4. Modify settings table (remove single-row constraint) ─

ALTER TABLE settings DROP CONSTRAINT IF EXISTS settings_id_check;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE;

-- ─── 5. Add organization_id to ALL data tables ─────────────

DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOR tbl IN
    SELECT unnest(ARRAY[
      'recepten', 'facturen', 'offertes', 'events', 'prep_tasks',
      'rtr_items', 'pack_lists', 'haccp_records', 'leveranciers',
      'inkooplijsten', 'materieel', 'bonnen', 'inventory',
      'prep_suggestions', 'time_logs', 'ai_conversation_folders',
      'ai_conversations', 'profiles', 'gerechten', 'gangen',
      'klanten', 'berichten', 'emails', 'email_templates',
      'photo_logbook', 'hardware_items', 'service_logs',
      'event_reflecties', 'website_faq', 'website_gallery',
      'website_hero', 'website_gangen', 'website_gerechten'
    ])
  LOOP
    EXECUTE format(
      'ALTER TABLE %I ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE',
      tbl
    );
    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS idx_%s_org ON %I(organization_id)',
      tbl, tbl
    );
  END LOOP;
END;
$$;

-- ─── 6. Add public_token to offertes for public access ─────

ALTER TABLE offertes ADD COLUMN IF NOT EXISTS public_token UUID DEFAULT gen_random_uuid();
CREATE UNIQUE INDEX IF NOT EXISTS idx_offertes_public_token ON offertes(public_token);

-- ─── 7. RLS Policies ───────────────────────────────────────

-- Enable RLS on new tables
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;

-- Organizations: members can view their own org
CREATE POLICY "org_member_select" ON organizations
  FOR SELECT USING (id IN (SELECT auth.user_org_ids()));

-- Organization members: members can view their org's members
CREATE POLICY "org_members_select" ON organization_members
  FOR SELECT USING (organization_id IN (SELECT auth.user_org_ids()));

-- Organization members: admins can manage members
CREATE POLICY "org_members_admin_manage" ON organization_members
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM organization_members om
      WHERE om.user_id = auth.uid()
        AND om.organization_id = organization_members.organization_id
        AND om.role = 'Admin'
        AND om.status = 'active'
    )
  );

-- Invitations: org members can view, admins can manage
CREATE POLICY "invitations_select" ON invitations
  FOR SELECT USING (organization_id IN (SELECT auth.user_org_ids()));
CREATE POLICY "invitations_admin_manage" ON invitations
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM organization_members om
      WHERE om.user_id = auth.uid()
        AND om.organization_id = invitations.organization_id
        AND om.role = 'Admin'
        AND om.status = 'active'
    )
  );

-- Drop all existing "Allow all" policies and create org-scoped ones
DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOR tbl IN
    SELECT unnest(ARRAY[
      'recepten', 'facturen', 'offertes', 'events', 'prep_tasks',
      'rtr_items', 'pack_lists', 'haccp_records', 'leveranciers',
      'inkooplijsten', 'materieel', 'bonnen', 'inventory',
      'prep_suggestions', 'time_logs', 'ai_conversation_folders',
      'ai_conversations', 'profiles', 'gerechten', 'gangen',
      'klanten', 'berichten', 'emails', 'email_templates',
      'photo_logbook', 'hardware_items', 'service_logs',
      'event_reflecties', 'website_faq', 'website_gallery',
      'website_hero', 'website_gangen', 'website_gerechten',
      'settings'
    ])
  LOOP
    -- Drop old permissive policy
    EXECUTE format('DROP POLICY IF EXISTS "Allow all" ON %I', tbl);

    -- Create org-scoped policies
    EXECUTE format(
      'CREATE POLICY "org_select" ON %I FOR SELECT USING (organization_id IN (SELECT auth.user_org_ids()))',
      tbl
    );
    EXECUTE format(
      'CREATE POLICY "org_insert" ON %I FOR INSERT WITH CHECK (organization_id IN (SELECT auth.user_org_ids()))',
      tbl
    );
    EXECUTE format(
      'CREATE POLICY "org_update" ON %I FOR UPDATE USING (organization_id IN (SELECT auth.user_org_ids()))',
      tbl
    );
    EXECUTE format(
      'CREATE POLICY "org_delete" ON %I FOR DELETE USING (organization_id IN (SELECT auth.user_org_ids()))',
      tbl
    );
  END LOOP;
END;
$$;

-- Special: offertes need anonymous read access for public quote page
CREATE POLICY "public_quote_view" ON offertes
  FOR SELECT USING (
    auth.role() = 'anon' AND public_token IS NOT NULL
  );

-- ─── 8. Auto-create profile on signup ──────────────────────

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO profiles (naam, email, user_id, rol, status)
  VALUES (
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    NEW.email,
    NEW.id,
    'Admin',
    'Actief'
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ─── 9. Data Migration for existing data ───────────────────
-- Run this AFTER creating your first organization to backfill:
--
-- UPDATE recepten SET organization_id = '<your-org-uuid>' WHERE organization_id IS NULL;
-- UPDATE events SET organization_id = '<your-org-uuid>' WHERE organization_id IS NULL;
-- ... (repeat for all tables)
--
-- Then add NOT NULL constraints:
-- ALTER TABLE recepten ALTER COLUMN organization_id SET NOT NULL;
-- ... etc
