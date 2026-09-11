-- Waar een bouwsteen vandaan komt.
--
-- De receptlezer haalt onderdelen los uit een gerecht: bij de chicken sandwich
-- maken stap 1-2 de ranchsaus en stap 3-6 de salsa. Die stappen hangen aan de
-- bouwsteen en niet aan het gerecht — precies de bedoeling, want dan mogen ze
-- dagen eerder gemaakt worden.
--
-- Maar dan is er geen draad meer terug: op de gerechtpagina zijn die stappen
-- onvindbaar. De voor de hand liggende plek (gerecht_components) kan niet, en
-- terecht: daar staat `quantity_used > 0` op, en hoeveel ranchsaus er per
-- broodje in gaat weet niemand uit een kookboek. Die constraint beschermt de
-- kostprijs en blijft staan.
--
-- Dus: herkomst op de bouwsteen. Gebruik blijft in gerecht_components.

alter table public.components
  add column if not exists uit_gerecht_id uuid references public.gerechten(id) on delete set null;

comment on column public.components.uit_gerecht_id is
  'Uit welk recept deze bouwsteen is ontstaan. De receptlezer haalt onderdelen los uit een gerecht (de ranchsaus van de chicken sandwich) en hangt hun stappen aan de bouwsteen, zodat ze dagen eerder gemaakt kunnen worden. Zonder deze verwijzing zijn die stappen niet meer terug te vinden vanaf het gerecht. LET OP: dit is herkomst, geen gebruik. Wélke gerechten deze bouwsteen gebruiken en in welke hoeveelheid staat in gerecht_components, en daar hoort een echte hoeveelheid bij (quantity_used > 0).';

create index if not exists components_uit_gerecht_idx
  on public.components (uit_gerecht_id) where uit_gerecht_id is not null;
