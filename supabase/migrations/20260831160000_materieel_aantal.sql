-- ════════════════════════════════════════════════════════════════════════
-- Materieel: hoeveel heb je ervan
-- ════════════════════════════════════════════════════════════════════════
-- Tot nu toe was elk item één regel. Dat werkt voor de smoker en de
-- broodbuffetwagen, maar niet voor gastronorm-bakken: daar heb je er zeven van
-- hetzelfde formaat, en dertig losse regels aanmaken is onzin.
--
-- Met `aantal` wordt één regel "7× GN 1/1-65, in de bus". De maten en de
-- inhoud staan in gn_maten — wereldstandaard, die vul je nooit met de hand in.
-- Hier staat alleen wat JIJ ervan hebt.

alter table public.materieel
  add column if not exists aantal integer not null default 1;

comment on column public.materieel.aantal is
  'Hoeveel exemplaren van dit item. Eén regel per soort, niet per stuk — '
  'zeven identieke GN-bakken zijn één regel met aantal 7.';

-- Een negatief aantal is altijd een fout, geen keuze.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'materieel_aantal_positief'
  ) then
    alter table public.materieel
      add constraint materieel_aantal_positief check (aantal >= 0);
  end if;
end $$;

-- ════════════════════════════════════════════════════════════════════════
-- Einde migratie
-- ════════════════════════════════════════════════════════════════════════
