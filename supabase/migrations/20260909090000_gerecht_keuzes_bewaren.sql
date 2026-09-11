-- De beslissingen bij een recept bewaren.
--
-- Op de goedkeur-lade kiest de kok "porchetta op 150 °C" of "centraal garen, op
-- locatie afwerken". Die keuze werd gecontroleerd, de opslaan-knop ging open —
-- en het antwoord verdween. Het recept zag er compleet uit en was het niet.
--
-- Eén antwoord per gerecht. Per event afwijken bestaat nog niet; als dat er ooit
-- komt hoort dat een eigen laag te worden en niet een tweede betekenis van deze
-- kolom.

alter table public.gerechten
  add column if not exists keuzes jsonb;

comment on column public.gerechten.keuzes is
  'Beslissingen die de kok nam toen dit recept werd ingevoerd, als [{vraag, antwoord}]. Waarom de porchetta op 150 graden staat en niet op 130 is anders over een half jaar niet meer te achterhalen. Eén antwoord per gerecht; per-event afwijken bestaat (nog) niet.';
