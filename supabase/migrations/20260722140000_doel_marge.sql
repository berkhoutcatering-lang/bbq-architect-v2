-- Doel-marge (target margin) voor de seizoensmenu-doorrekening.
--
-- Org-default op `settings`; optionele per-gerecht override op `gerechten`
-- (nullable = erf de org-default). Beide tabellen zijn al RLS-org-scoped, dus
-- geen policy-wijzigingen nodig.
--
-- Defensief met ADD COLUMN IF NOT EXISTS: `gerechten`/`settings` zijn niet
-- volledig repo-tracked (kolommen bestaan deels alleen live). De feature leest
-- settings.doel_marge_pct via select('*') met een default-fallback, dus tot deze
-- migratie draait werkt alles op de default-doel-marge; alleen een EIGEN doel-marge
-- opslaan vereist deze migratie.

alter table if exists public.settings  add column if not exists doel_marge_pct numeric(5,2);
alter table if exists public.gerechten add column if not exists doel_marge_pct numeric(5,2);
