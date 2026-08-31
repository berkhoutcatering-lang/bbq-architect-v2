-- ════════════════════════════════════════════════════════════════════════
-- Golf 2 — de prep-planning leert handtijd van wachttijd onderscheiden
-- ════════════════════════════════════════════════════════════════════════
-- Zie docs/agent-architectuur-plan.md hoofdstuk 8, regel "2".
--
-- `recipe_steps` (migratie 20260831200000) heeft de drie velden al: handtijd,
-- wachttijd en plaats, plus de groepeersleutel prep_group. Wat er tot nu toe
-- ontbrak is de doorvoer: een receptstap is kennis over een gerécht, een
-- prep-taak is werk op een dág. Zonder deze kolommen valt alles wat de
-- ontleder heeft opgeschreven op de grond zodra er een taak van gemaakt wordt.
--
-- `prep_tasks` had één `duration_min`. Dat getal betekende soms handwerk
-- ("mayonaise draaien, 25 minuten") en soms wachten ("smoker, 12 uur"), en het
-- verschil zat alleen in de fase-naam — een lijst van drie fases in
-- werkvolgorde.ts. Deeg laten rijzen viel daar buiten en telde dus als
-- handwerk, terwijl je in die tijd rustig iets anders kunt doen.
--
-- Wat elk veld doet:
--   duur_actief_min   handtijd — kost een persoon
--   duur_passief_min  wachttijd — kost een apparaat, geen persoon
--   prep_group        batching-sleutel over recepten heen (sjalot-brunoise)
--   plaats            thuis | bus | locatie — twee budgetten, geen één
--   toezicht_nodig    moet er iemand bij blijven
--   recipe_step_id    herkomst: welke receptstap heeft deze taak gemaakt
--
-- Nadrukkelijk NIET gedaan: bestaande taken achteraf van een geschatte
-- handtijd voorzien. Wat de ontleder niet heeft opgeschreven blijft null en
-- wordt in het scherm "duur onbekend" — een leeg veld is eerlijker dan een
-- schatting die zich voordoet als een meting.
--
-- Vooraf nagemeten (2026-08-31): prep_tasks heeft 51 rijen en geen van deze
-- vijf kolommen; recipe_steps heeft 3 rijen, alle drie met prep_group gevuld
-- en duur_actief_min leeg. `duration_min` en `batch_key` blijven staan en
-- blijven werken — dit is een uitbreiding, geen vervanging.

alter table public.prep_tasks
  add column if not exists duur_actief_min  integer,
  add column if not exists duur_passief_min integer,
  add column if not exists prep_group       text,
  add column if not exists plaats           text,
  add column if not exists toezicht_nodig   boolean,
  add column if not exists recipe_step_id   uuid;

-- De koppeling terug naar de receptstap. `on delete set null`: een recept
-- opnieuw laten ontleden wist zijn stappen (zie bewaarReceptStappen), en dat
-- mag nooit de geplande taken van een lopend event meeslepen.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'prep_tasks_recipe_step_id_fkey') then
    alter table public.prep_tasks
      add constraint prep_tasks_recipe_step_id_fkey
      foreign key (recipe_step_id) references public.recipe_steps(id) on delete set null;
  end if;
end $$;

-- Zelfde drie waarden als recipe_steps.plaats, zodat de twee tabellen niet uit
-- elkaar kunnen lopen. Null blijft toegestaan: bestaande taken van vóór deze
-- migratie weten niet waar ze gebeuren, en dat verzinnen we niet.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'prep_tasks_plaats_geldig') then
    alter table public.prep_tasks
      add constraint prep_tasks_plaats_geldig
      check (plaats is null or plaats in ('thuis', 'bus', 'locatie'));
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'prep_tasks_duur_niet_negatief') then
    alter table public.prep_tasks
      add constraint prep_tasks_duur_niet_negatief
      check (coalesce(duur_actief_min, 0) >= 0 and coalesce(duur_passief_min, 0) >= 0);
  end if;
end $$;

comment on column public.prep_tasks.duur_actief_min is
  'Handtijd — kost een persoon. Null betekent onbekend, niet nul: de bron '
  'heeft het niet opgeschreven. Samen met duur_passief_min vervangt dit de '
  'fase-lijst waarmee werkvolgorde.ts wachttijd raadde.';

comment on column public.prep_tasks.duur_passief_min is
  'Wachttijd — kost een apparaat, geen persoon. Dit is de tijd waarin de '
  'gat-vulling ander werk mag inplannen.';

comment on column public.prep_tasks.prep_group is
  'Batching-sleutel uit recipe_steps, bijvoorbeeld sjalot-brunoise. Bundelt '
  'over recepten heen; batch_key bundelt dezelfde component over events heen. '
  'De twee sluiten elkaar niet uit.';

comment on column public.prep_tasks.plaats is
  'thuis | bus | locatie. Thuis heb je je hele keuken en kies je zelf het '
  'moment; op locatie heb je een fractie daarvan terwijl de gasten wachten.';

comment on column public.prep_tasks.toezicht_nodig is
  'Moet er iemand bij blijven. Null = onbekend, en dat is iets anders dan nee: '
  'bij een taak uit een sjabloon heeft niemand die vraag beantwoord.';

comment on column public.prep_tasks.recipe_step_id is
  'Herkomst — welke receptstap deze taak heeft opgeleverd. Null bij taken uit '
  'een sjabloon, uit de component-pass of met de hand aangemaakt.';

-- Bundelen zoekt over events heen op deze sleutel binnen één dag.
create index if not exists idx_prep_tasks_prep_group
  on public.prep_tasks (organization_id, prep_group)
  where prep_group is not null;

-- Idempotentie bij opnieuw plannen: welke taken komen al uit welke stap.
create index if not exists idx_prep_tasks_recipe_step
  on public.prep_tasks (recipe_step_id)
  where recipe_step_id is not null;

-- ════════════════════════════════════════════════════════════════════════
-- Einde migratie
-- ════════════════════════════════════════════════════════════════════════
