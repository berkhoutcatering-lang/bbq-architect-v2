-- Migration 011: Auto-fill trigger voor activation_events
--
-- Achtergrond: tabel activation_events bestaat al (created in migratie
-- "create_activation_events" op 2026-04-21, version 20260421141845).
-- Schema: id bigint, organization_id uuid NOT NULL, user_id uuid NULL,
-- event_type text NOT NULL, metadata jsonb, created_at timestamptz.
--
-- Probleem: client-side track-helper kent organization_id niet zonder
-- expliciet via OrgContext lookup; auto.uid() is wel beschikbaar via Supabase RLS.
--
-- Oplossing: BEFORE-INSERT trigger die organization_id én user_id auto-vult
-- op basis van auth.uid() + organization_members lookup. Helper hoeft alleen
-- event_type + metadata te leveren.
--
-- Live applied via Supabase MCP op 2026-05-01 (project oheilybckvtsczmbczot).

CREATE OR REPLACE FUNCTION set_activation_event_org_user()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.user_id IS NULL AND auth.uid() IS NOT NULL THEN
    NEW.user_id := auth.uid();
  END IF;

  IF NEW.organization_id IS NULL AND auth.uid() IS NOT NULL THEN
    SELECT organization_id INTO NEW.organization_id
    FROM organization_members
    WHERE user_id = auth.uid()
    LIMIT 1;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS auto_fill_activation_event_org ON activation_events;

CREATE TRIGGER auto_fill_activation_event_org
  BEFORE INSERT ON activation_events
  FOR EACH ROW EXECUTE FUNCTION set_activation_event_org_user();

COMMENT ON FUNCTION set_activation_event_org_user() IS
  'Auto-fills organization_id and user_id on activation_events inserts based on auth.uid(). See src/lib/track.ts.';
