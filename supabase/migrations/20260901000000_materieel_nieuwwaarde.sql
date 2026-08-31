-- ════════════════════════════════════════════════════════════════════════
-- Wat je spullen waard zijn
-- ════════════════════════════════════════════════════════════════════════
-- Twee bedragen die vaak door elkaar worden gehaald en allebei nodig zijn:
--
--   aanschafprijs_cents — wat jij ervoor betaald hebt. Zegt iets over je
--     boekhouding en over afschrijving.
--   nieuwprijs_cents    — wat het vandaag nieuw kost. Dít is het getal dat
--     telt bij een verzekering of bij de vraag "wat staat er in mijn keuken".
--
-- Ze lopen ver uiteen. Een tweedehands machine kan de helft gekost hebben van
-- wat vervanging nu kost, en dan is de aanschafprijs een gevaarlijk getal om
-- je op te verzekeren.
--
-- prijs_incl_btw legt vast hoe je het bedrag moet lezen. Consumentensites
-- noemen prijzen inclusief, groothandels exclusief, en zonder dat veld tel je
-- straks appels bij peren op met 21% verschil.

alter table public.materieel
  add column if not exists nieuwprijs_cents integer,
  add column if not exists prijs_incl_btw boolean,
  add column if not exists prijs_bijgewerkt_op date;

comment on column public.materieel.nieuwprijs_cents is
  'Wat dit vandaag nieuw kost, in centen. Vervangingswaarde — niet wat je '
  'ervoor betaald hebt; daarvoor is aanschafprijs_cents.';

comment on column public.materieel.prijs_incl_btw is
  'Of de bedragen inclusief btw zijn. Consumentensites noemen inclusief, '
  'groothandels exclusief. Zonder dit veld tel je bedragen op die 21% uit '
  'elkaar liggen.';

comment on column public.materieel.prijs_bijgewerkt_op is
  'Wanneer de nieuwprijs voor het laatst is opgehaald. Een prijs van twee jaar '
  'oud is geen vervangingswaarde meer.';

-- ════════════════════════════════════════════════════════════════════════
-- Einde migratie
-- ════════════════════════════════════════════════════════════════════════
