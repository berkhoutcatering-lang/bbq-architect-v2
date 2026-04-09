-- ============================================================
-- BBQ Architect v2 — Health Scores, Changelog & Onboarding Events
-- Applied: 2026-04-09
-- ============================================================

-- Helper function for RLS (public schema)
CREATE OR REPLACE FUNCTION public.user_org_ids()
RETURNS SETOF UUID
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT organization_id
  FROM organization_members
  WHERE user_id = auth.uid()
    AND status = 'active';
$$;

-- ─── 1. Onboarding Events (TTFV tracking) ──────────────────
CREATE TABLE IF NOT EXISTS onboarding_events (
  id              BIGSERIAL PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id         UUID REFERENCES auth.users(id),
  milestone       TEXT NOT NULL,
  metadata        JSONB DEFAULT '{}',
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_onboarding_events_org ON onboarding_events(organization_id);
CREATE INDEX IF NOT EXISTS idx_onboarding_events_milestone ON onboarding_events(organization_id, milestone);

ALTER TABLE onboarding_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "onboarding_org_select" ON onboarding_events
  FOR SELECT USING (organization_id IN (SELECT public.user_org_ids()));
CREATE POLICY "onboarding_org_insert" ON onboarding_events
  FOR INSERT WITH CHECK (organization_id IN (SELECT public.user_org_ids()));

-- ─── 2. Changelog Entries ───────────────────────────────────
CREATE TABLE IF NOT EXISTS changelog_entries (
  id              BIGSERIAL PRIMARY KEY,
  version         TEXT NOT NULL,
  title           TEXT NOT NULL,
  description     TEXT NOT NULL,
  category        TEXT NOT NULL DEFAULT 'feature'
                    CHECK (category IN ('feature', 'improvement', 'fix', 'breaking')),
  published_at    TIMESTAMPTZ DEFAULT now(),
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_changelog_published ON changelog_entries(published_at DESC);

ALTER TABLE changelog_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "changelog_select_all" ON changelog_entries
  FOR SELECT TO authenticated USING (true);

-- ─── 3. Changelog Read Tracking ─────────────────────────────
CREATE TABLE IF NOT EXISTS changelog_reads (
  id              BIGSERIAL PRIMARY KEY,
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  last_read_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at      TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id)
);

ALTER TABLE changelog_reads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "changelog_reads_own_select" ON changelog_reads
  FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "changelog_reads_own_insert" ON changelog_reads
  FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "changelog_reads_own_update" ON changelog_reads
  FOR UPDATE USING (user_id = auth.uid());

-- ─── 4. Activity Tracking (for health scores) ──────────────
CREATE TABLE IF NOT EXISTS activity_log (
  id              BIGSERIAL PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id         UUID REFERENCES auth.users(id),
  action          TEXT NOT NULL,
  page            TEXT,
  metadata        JSONB DEFAULT '{}',
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_activity_log_org ON activity_log(organization_id);
CREATE INDEX IF NOT EXISTS idx_activity_log_created ON activity_log(organization_id, created_at DESC);

ALTER TABLE activity_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "activity_org_select" ON activity_log
  FOR SELECT USING (organization_id IN (SELECT public.user_org_ids()));
CREATE POLICY "activity_org_insert" ON activity_log
  FOR INSERT WITH CHECK (organization_id IN (SELECT public.user_org_ids()));

-- ─── 5. Seed changelog entries ──────────────────────────────
INSERT INTO changelog_entries (version, title, description, category, published_at) VALUES
  ('2.4.0', 'Multi-tenant platform', 'Meerdere organisaties kunnen nu hun eigen omgeving beheren met volledige data-isolatie.', 'feature', '2026-03-15'),
  ('2.4.1', 'Uitnodigingssysteem', 'Nodig teamleden uit via email met een veilige token-link. Rollen: Admin, Pitmaster, Medewerker.', 'feature', '2026-03-18'),
  ('2.4.2', 'Platform Admin Portal', 'Beheer alle organisaties, bekijk statistieken en maak nieuwe klantomgevingen aan.', 'feature', '2026-03-20'),
  ('2.4.3', 'Branding per organisatie', 'Elke organisatie kan eigen logo en huisstijlkleuren instellen voor offertes en facturen.', 'feature', '2026-03-25'),
  ('2.5.0', 'Customer Health Scores', 'Automatische gezondheidsscores per organisatie op basis van activiteit, data en adoptie.', 'feature', '2026-04-09'),
  ('2.5.1', 'Changelog & Updates', 'In-app changelog zodat je altijd weet wat er nieuw is in BBQ Architect.', 'feature', '2026-04-09'),
  ('2.5.2', 'Activiteitsmonitoring', 'Automatische tracking van inactiviteit met alerts voor de platform beheerder.', 'improvement', '2026-04-09'),
  ('2.5.3', 'Onboarding Milestones', 'Track de voortgang van nieuwe klanten met TTFV (Time-to-First-Value) metrics.', 'improvement', '2026-04-09');
