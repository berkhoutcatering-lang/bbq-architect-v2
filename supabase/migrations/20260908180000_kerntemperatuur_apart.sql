-- Kerntemperatuur los van apparaattemperatuur.
--
-- `temp_doel_c` bevatte tot nu toe drie verschillende dingen door elkaar. In de
-- pulled pork-terrine stond op stap 4 de 115 °C van de smoker, op stap 6 de
-- 67 °C kern van het vlees en op stap 15 de 4 °C van de koeling. Eén kolom,
-- drie betekenissen — en de kerntemperaturen 67 en 88 waar het recept écht op
-- eindigt waren daardoor nergens vastgelegd.
--
-- Dat is niet cosmetisch. Een gaarstap eindigt niet na vier uur, hij eindigt bij
-- kern 70. Wie alleen de tijd kent laat het bord om 14:10 piepen; wie de
-- eindconditie kent laat het piepen als de meter er is. En bij drie recepten op
-- rij bleek dit dezelfde fout, dus voordat er honderd recepten in gaan.
--
-- Verifieer vóór het draaien dat golf 1 al gedraaid heeft.

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'recipe_steps' and column_name = 'duur_bron'
  ) then
    raise exception 'Draai eerst 20260908130000_keukenplanner_golf1.sql';
  end if;
end $$;

alter table public.recipe_steps
  add column if not exists kern_temp_c numeric;

comment on column public.recipe_steps.temp_doel_c is
  'Temperatuur van de OMGEVING: de smoker op 115, de oven op 180, de koeling op 4. Wat het apparaat moet aanhouden.';

comment on column public.recipe_steps.kern_temp_c is
  'Kerntemperatuur van het PRODUCT waarbij deze stap klaar is. Staat dit gevuld, dan eindigt de stap op de meter en niet op de klok — de duur ernaast is dan een schatting van hoe lang dat duurt, geen afspraak.';

-- Zelfde onderscheid op de geplande taak, anders valt het weg zodra een recept
-- een productiedag wordt.
alter table public.prep_tasks
  add column if not exists kern_temp_c numeric;

comment on column public.prep_tasks.kern_temp_c is
  'Overgenomen uit recipe_steps.kern_temp_c: de kerntemperatuur waarbij deze taak klaar is.';
