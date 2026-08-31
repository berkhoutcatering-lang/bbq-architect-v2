-- ════════════════════════════════════════════════════════════════════════
-- Valuta bij de prijs — anders tel je kronen bij euro's op
-- ════════════════════════════════════════════════════════════════════════
-- Gevonden door een Tsjechische productpagina te lezen. Die noemde
-- "151 958 Kč bez DPH" en dat werd € 151,96. Twee fouten tegelijk: de valuta
-- werd genegeerd, en de spatie als duizendtalscheiding werd als komma gelezen.
-- Een Bizerba van zesduizend euro stond daarmee voor honderdvijftig in de boeken.
--
-- Bewust NIET automatisch omrekenen. Een wisselkoers verandert dagelijks; sla
-- je de omgerekende euro's op, dan weet je over een jaar niet meer wat er echt
-- op de pagina stond. We bewaren wat er stond, met de valuta erbij, en rekenen
-- pas om op het moment dat iemand een totaal wil zien.

alter table public.materieel
  add column if not exists nieuwprijs_valuta text not null default 'EUR';

comment on column public.materieel.nieuwprijs_valuta is
  'Valutacode van nieuwprijs_cents (EUR, CZK, GBP, USD). Bedragen worden NIET '
  'omgerekend opgeslagen: een koers verandert, de prijs op de pagina niet. '
  'Omrekenen gebeurt pas bij het optellen, met een koers van dat moment.';
