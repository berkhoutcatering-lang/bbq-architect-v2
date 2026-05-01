-- Drop recepten tabel — alle data was fictief (seed) en de schema is
-- samengevouwen met `gerechten` op 2026-05-01.
--
-- ✅ Veilig om te draaien: alle src-queries zijn gemigreerd naar `gerechten`.
-- bbq-context, ai-actions, ai-tools, ai-execute, CommandPalette en het
-- event-hub lezen nu uit gerechten met dezelfde shape (gang_slug ipv
-- categorie, target_prep_time ipv preptime, bereidingswijze ipv instructies).
--
-- Mathijs heeft 2026-05-01 expliciet bevestigd dat alle recept-data weg mag —
-- de seed-rows zijn fictief en de echte gerechten leven in `gerechten`.

DROP TABLE IF EXISTS recepten CASCADE;

-- Bevestiging (optioneel — alleen lezen):
-- SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'recepten';
-- Verwacht: geen rijen.
