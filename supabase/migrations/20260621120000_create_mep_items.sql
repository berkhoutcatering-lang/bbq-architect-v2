CREATE TABLE IF NOT EXISTS public.mep_items (
  id BIGSERIAL PRIMARY KEY,
  organization_id UUID NOT NULL,
  event_id INTEGER NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  component_id INTEGER NOT NULL REFERENCES public.components(id) ON DELETE CASCADE,
  gerecht_id INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'todo'
    CHECK (status IN ('todo', 'bezig', 'klaar')),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  completed_by TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, event_id, component_id, gerecht_id)
);

CREATE INDEX IF NOT EXISTS mep_items_org_event_idx
  ON public.mep_items (organization_id, event_id);

CREATE INDEX IF NOT EXISTS mep_items_org_event_status_idx
  ON public.mep_items (organization_id, event_id, status);

ALTER TABLE public.mep_items ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'mep_items'
      AND policyname = 'mep_items_tenant'
  ) THEN
    CREATE POLICY "mep_items_tenant" ON public.mep_items
      USING (
        organization_id IN (
          SELECT organization_id
          FROM public.organization_members
          WHERE user_id = auth.uid()
            AND status = 'active'
        )
      )
      WITH CHECK (
        organization_id IN (
          SELECT organization_id
          FROM public.organization_members
          WHERE user_id = auth.uid()
            AND status = 'active'
        )
      );
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'mep_items'
      AND policyname = 'mep_items_service'
  ) THEN
    CREATE POLICY "mep_items_service" ON public.mep_items
      USING (auth.role() = 'service_role')
      WITH CHECK (auth.role() = 'service_role');
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'mep_items'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.mep_items;
  END IF;
END
$$;
