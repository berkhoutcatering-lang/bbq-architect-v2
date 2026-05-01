-- Drop recepten tabel — alle data is fictief (seed) en de schema is samengevouwen
-- met `gerechten` op 2026-05-01.
--
-- ⚠️ NIET DRAAIEN ZONDER EERST DE OVERIGE QUERIES TE MIGREREN ⚠️
--
-- Op moment van schrijven (2026-05-01) verwijzen de volgende files nog naar
-- de recepten-tabel. Drop deze tabel pas NA dat ze gemigreerd zijn naar
-- `gerechten`:
--   - src/lib/bbq-context.ts (regel 48, 98)
--   - src/lib/ai-actions.ts (regel 814, 1093)
--   - src/components/CommandPalette.tsx (regel 143)
--   - src/app/api/ai-execute/route.ts (regel 261, 333)
--   - src/app/api/ai-tools/route.ts (regel 72, 116, 440, 448, 532, 551, 559, 562, 1088)
--   - src/app/events/[id]/hub/page.tsx (regel 137)
--
-- Wat hier WEL al klaar is (veilig):
--   - 014: porties, wijn_suggestie, service_tip toegevoegd aan gerechten
--   - /recepten route is een redirect naar /gerechten
--   - KeukenTabs + sidebar verwijzen niet meer naar recepten
--   - acceptance-workflow.ts gebruikt gerechten ipv recepten (Dag 4)
--
-- Mathijs heeft 2026-05-01 gezegd "alle recepten mogen weg, ze zijn fictief".
-- Dus deze migratie is technisch klaar, alleen de overige queries moeten nog
-- mee zodat ze geen "relation does not exist" gooien.

DROP TABLE IF EXISTS recepten CASCADE;

-- Bevestiging (optioneel — alleen lezen):
-- SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'recepten';
-- Verwacht: geen rijen.
