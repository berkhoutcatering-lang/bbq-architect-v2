-- ════════════════════════════════════════════════════════════════════════
-- Alle machinegegevens bewaren, niet alleen wat in kolommen past
-- ════════════════════════════════════════════════════════════════════════
-- De vaste kolommen (breedte, capaciteit, temperatuur) dekken wat je over
-- álle apparaten wilt kunnen vergelijken. Maar elk apparaat heeft daarnaast
-- eigen specificaties die nergens in passen: een vaatwasser heeft korven per
-- uur, aansluitwaarde en naspoeltemperatuur; een smoker heeft rooster-
-- oppervlak en brandstof; een groentesnijder heeft toerental en schijven.
--
-- Daar veertig kolommen voor maken is onbegonnen werk en levert een tabel op
-- waarin bijna alles leeg is. Dus: het gedeelde deel in kolommen, de rest als
-- sleutel-waardeparen zoals ze op de productpagina staan.
--
-- Waarom niet gewoon in scan_data laten staan: dat is de RUWE uitvoer van het
-- model, inclusief velden die we al naar kolommen hebben verplaatst. Dit veld
-- is bedoeld om getoond te worden en blijft ook staan als je een item met de
-- hand invoert.

alter table public.materieel
  add column if not exists specificaties jsonb;

comment on column public.materieel.specificaties is
  'Specificaties die niet in de vaste kolommen passen, als sleutel-waarde: '
  '{"korven per uur":"30","aansluitwaarde":"6,4 kW","naspoeltemperatuur":"82 °C"}. '
  'Alles wat op de productpagina stond en de moeite waard is om te weten. '
  'Ruwe modeluitvoer blijft in scan_data; dit veld is om te tonen.';

-- ════════════════════════════════════════════════════════════════════════
-- Einde migratie
-- ════════════════════════════════════════════════════════════════════════
