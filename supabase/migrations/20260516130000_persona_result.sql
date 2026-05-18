-- Pillar #2 (Pro-tier onboarding) — persona-quiz resultaat persist.
-- Was alleen localStorage; nu ook server-side zodat:
--  1) andere devices van dezelfde user de voorkeuren kennen
--  2) Vandaag-dashboard de juiste widgets als default-aan kan tonen
--  3) /admin/funnel kan rapporteren wat pro-tier-tenants kiezen

ALTER TABLE settings
  ADD COLUMN IF NOT EXISTS persona_result jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN settings.persona_result IS
  'PersonaQuiz antwoorden: {eventsPerYear, biggestPain, bedrijfsnaam}. Gevuld na onboarding-flow.';
