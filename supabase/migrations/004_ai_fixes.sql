-- ============================================================
-- BBQ Architect v2 — AI/Groq audit fixes
-- Adds offertes.event_id column needed by AppContext, syncEngine,
-- EventWizard and api/ai-execute. Without it, offerte↔event linking
-- silently fails and AI winstgevendheid actions cannot find offertes.
-- ============================================================

ALTER TABLE offertes
  ADD COLUMN IF NOT EXISTS event_id INTEGER REFERENCES events(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS offertes_event_id_idx ON offertes(event_id);

-- Drop redundante "Allow all for anon" RLS-policies op gerechten/gangen.
-- Deze overschreven de org-scoped policies zonder toegevoegde waarde en
-- maakten multi-tenant isolatie onbetrouwbaar. De org_select/insert/update/
-- delete policies blijven intact en beveiligen de tabel correct.
DROP POLICY IF EXISTS "Allow all for anon on gerechten" ON public.gerechten;
DROP POLICY IF EXISTS "Allow all for anon on gangen" ON public.gangen;
DROP POLICY IF EXISTS "Public read gerechten" ON public.gerechten;
