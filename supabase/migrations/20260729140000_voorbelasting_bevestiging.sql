-- =============================================================
--  Voorbelasting: bevestiging vóór aftrek (veiligheidsfase F6)
--
--  Tot nu toe telde rubriek 5b de BTW van ELKE bon in de periode mee als
--  aftrekbare voorbelasting. Dat is te ruim. Aftrek vereist zakelijk gebruik
--  én een factuur die aan de eisen voldoet; bij bonnen boven de kleinbedrag-
--  drempel ontbreken tenaamstelling en BTW-nummer vaak, en privé/gemengd
--  gebruik werd helemaal genegeerd. De aangifte vroeg daarmee structureel
--  te veel terug.
--
--  Vanaf nu telt alleen mee wat een mens heeft nagelopen:
--    voorbelasting_bevestigd = true  → BTW × zakelijk_pct telt in 5b
--    voorbelasting_bevestigd = false → komt in "wacht op bevestiging"
--
--  DEFAULT IS false, OOK VOOR BESTAANDE BONNEN. 5b daalt daardoor direct na
--  deze migratie. Dat is de bedoeling: het oude getal was te hoog, niet te
--  laag. Wie de oude cijfers wil terugzien, bevestigt de bonnen één voor één —
--  precies de controle die eerst ontbrak.
--
--  Additief: geen kolom verdwijnt, geen bestaande waarde verandert.
--  De TS-kant staat in src/lib/financeAnalytics.ts (computeBtwAangifte) en
--  het type BonVoorbelasting.
-- =============================================================

-- ─── 1. Kolommen ─────────────────────────────────────────────

alter table public.bonnen
  add column if not exists voorbelasting_bevestigd boolean not null default false;

comment on column public.bonnen.voorbelasting_bevestigd is
  'Handmatig nagelopen: zakelijk gebruik + geldige factuur. Alleen true telt mee in BTW-rubriek 5b.';

alter table public.bonnen
  add column if not exists zakelijk_pct smallint not null default 100;

comment on column public.bonnen.zakelijk_pct is
  'Zakelijk gebruik in procenten (0-100). Bij gemengd gebruik is maar een deel van de BTW aftrekbaar.';

-- Wie en wanneer — zonder dit is de bevestiging niet herleidbaar, en een
-- niet-herleidbare bevestiging is bij een controle net zo veel waard als geen.
alter table public.bonnen
  add column if not exists voorbelasting_bevestigd_at timestamptz;

alter table public.bonnen
  add column if not exists voorbelasting_bevestigd_by uuid references auth.users(id) on delete set null;

-- ─── 2. Integriteit ──────────────────────────────────────────

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'bonnen_zakelijk_pct_bereik'
  ) then
    alter table public.bonnen
      add constraint bonnen_zakelijk_pct_bereik check (zakelijk_pct between 0 and 100);
  end if;
end $$;

-- Een bevestiging zonder tijdstip/gebruiker is geen bevestiging.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'bonnen_voorbelasting_herleidbaar'
  ) then
    alter table public.bonnen
      add constraint bonnen_voorbelasting_herleidbaar check (
        voorbelasting_bevestigd = false
        or (voorbelasting_bevestigd_at is not null and voorbelasting_bevestigd_by is not null)
      );
  end if;
end $$;

-- ─── 3. Index ────────────────────────────────────────────────
-- De aangifte filtert per periode op onbevestigde bonnen; zonder index is dat
-- een seq scan over het hele bonnenarchief.

create index if not exists bonnen_voorbelasting_open_idx
  on public.bonnen (organization_id, datum)
  where voorbelasting_bevestigd = false;

-- ─── 4. Stempel automatisch zetten ───────────────────────────
-- Zo kan de applicatie niet vergeten wie bevestigde, en kan een client de
-- stempel ook niet vervalsen door zelf een andere user mee te sturen.

create or replace function public.bonnen_stempel_voorbelasting()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  gewijzigd boolean;
begin
  -- OLD bestaat niet bij INSERT; daar telt elke true als een wijziging.
  if tg_op = 'INSERT' then
    gewijzigd := new.voorbelasting_bevestigd;
  else
    gewijzigd := new.voorbelasting_bevestigd is distinct from old.voorbelasting_bevestigd;
  end if;

  if gewijzigd then
    if new.voorbelasting_bevestigd then
      new.voorbelasting_bevestigd_at := now();
      new.voorbelasting_bevestigd_by := auth.uid();
    else
      new.voorbelasting_bevestigd_at := null;
      new.voorbelasting_bevestigd_by := null;
    end if;
  end if;
  return new;
end $$;

drop trigger if exists bonnen_stempel_voorbelasting_trg on public.bonnen;
create trigger bonnen_stempel_voorbelasting_trg
  before insert or update on public.bonnen
  for each row execute function public.bonnen_stempel_voorbelasting();
