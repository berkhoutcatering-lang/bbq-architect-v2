-- =============================================================
--  Verlegde BTW op inkoopbonnen — rubriek 4a / 4b
--
--  Een buitenlandse leverancier rekent geen Nederlandse BTW (bv. een
--  software-abonnement van een Amerikaans bedrijf). Die BTW geef je zelf aan:
--    4a  diensten/leveringen uit landen BUITEN de EU
--    4b  diensten/leveringen uit landen BINNEN de EU
--  en je trekt hem in dezelfde aangifte weer af in 5b (als de uitgave zakelijk
--  is en de voorbelasting is bevestigd). Netto vaak €0, maar beide rubrieken
--  moeten wel ingevuld worden.
--
--  Leeg (null) = gewone Nederlandse bon. De app rekent 21% over het netto
--  bedrag; zie src/lib/financeAnalytics.ts (bonBtwBedrag, VERLEGD_PCT).
--
--  Additief: geen kolom verdwijnt, geen bestaande waarde verandert.
--  De app werkt ook zonder deze kolom (dan ontbreekt alleen 4a/4b).
--
--  Draaien:  npx supabase db query --linked -f supabase/migrations/20261026140000_bonnen_btw_verlegd.sql
-- =============================================================

alter table public.bonnen
  add column if not exists btw_verlegd text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'bonnen_btw_verlegd_waarde'
  ) then
    alter table public.bonnen
      add constraint bonnen_btw_verlegd_waarde
      check (btw_verlegd is null or btw_verlegd in ('buiten_eu', 'binnen_eu'));
  end if;
end $$;

comment on column public.bonnen.btw_verlegd is
  'BTW verlegd naar ons: buiten_eu → rubriek 4a, binnen_eu → rubriek 4b. 21% over netto telt in 4a/4b én (na bevestiging) in 5b. Null = gewone NL-bon.';

-- Controle: moet één rij geven met btw_verlegd / text.
select column_name, data_type
from information_schema.columns
where table_schema = 'public' and table_name = 'bonnen' and column_name = 'btw_verlegd';
