-- Wandscherm (/keuken/scherm) luistert met realtime op prep_tasks
-- (src/app/keuken/scherm/_lib/useKeukenscherm.ts). Geen enkele migratie zette
-- de tabel in de realtime-publicatie; zonder dat ververst het scherm alleen
-- via de 30-secondenpoll. Idempotent: doet niets als hij er al in staat.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'prep_tasks'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.prep_tasks;
  END IF;
END
$$;
