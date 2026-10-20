-- Onderdelen aan/uit per bedrijf (werkruimtes, 2026-10-20).
--
-- Een lijst met wat het bedrijf uitzette: een werkruimte-slug ('voorraad',
-- 'geld', …) of een tabblad-href ('/verkoop/kerst'). Leeg = alles aan.
-- Puur weergave: uitzetten verbergt een onderdeel uit tegelscherm, balk,
-- onderbalk en zoekvenster; er wordt niets verwijderd en een directe link
-- blijft werken. Zie src/lib/navigation.tsx (zichtbareWerkruimtes).
--
-- Additief en idempotent. De app werkt ook zonder deze kolom (alles aan).
-- Schrijven gaat via de server-actie in src/app/instellingen/onderdelen
-- (alleen de rol Admin); de bestaande RLS op settings (org_update) blijft
-- de grens.

alter table public.settings
  add column if not exists verborgen_onderdelen text[] not null default '{}';

comment on column public.settings.verborgen_onderdelen is
  'Onderdelen die dit bedrijf uitzette: werkruimte-slug of tab-href. Alleen weergave; zie src/lib/navigation.tsx.';
