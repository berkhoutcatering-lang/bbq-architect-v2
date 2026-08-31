-- ════════════════════════════════════════════════════════════════════════
-- De goedkeur-lade werkend maken
-- ════════════════════════════════════════════════════════════════════════
-- Zie docs/agent-architectuur-plan.md hoofdstuk 2 en 8 (golf 0b).
--
-- `ai_action_proposals` staat er sinds 1 juni met de juiste levenscyclus, maar
-- er is nooit één regel code geweest die hem gebruikt. Twee dingen ontbraken
-- waardoor hij ook niet gebruikt kón worden:
--
--   1. `proposal_type` stond vast op vier soorten. Elke nieuwe H-agent — de
--      receptuur-ontleder, het ontwerpen, een conceptbestelling — werd door de
--      database geweigerd.
--   2. `expires_at` was decoratie. De tabel belooft in zijn eigen toelichting
--      een opruimtaak, maar die bestaat niet: een voorstel van drie maanden
--      geleden staat nog steeds op `pending`.
--
-- Dit is het primitief waar álles doorheen gaat: de ontleder, het ontwerpen,
-- de bestellingen en de mails naar klanten. Eén keer goed loont vier keer.

-- ─── 1. Meer soorten voorstellen ───────────────────────────────────────
-- Drop-en-hermaak, want een CHECK is niet uit te breiden. De bestaande vier
-- blijven staan zodat er niets omvalt.
alter table public.ai_action_proposals
  drop constraint if exists ai_action_proposals_proposal_type_check;

alter table public.ai_action_proposals
  add constraint ai_action_proposals_proposal_type_check
  check (proposal_type in (
    -- bestaand
    'offerte_draft',
    'event_draft',
    'klant_upsert',
    'email_draft',
    -- receptuur (golf 1 en 4)
    'recept_ontleding',      -- korte bereidingswijze → micro-stappen
    'recept_ontwerp',        -- nieuw gerecht binnen een sjabloon
    'verbindende_component', -- twee componenten vast, de brug gezocht
    'gerecht_profiel',       -- zes smaakassen, textuur, luidheid
    -- kennisbank
    'ingredient_profiel',    -- per productgroep goedkeuren
    'techniek_profiel',
    'kookles',               -- afgeleide vuistregel ter bevestiging
    -- inkoop (golf 6)
    'inkoop_order'
  ));

comment on column public.ai_action_proposals.proposal_type is
  'Wat voor voorstel het is. Bepaalt hoe de lade het toont en welke code het '
  'uitvoert na bevestiging. Nieuwe soort? Eerst hier toevoegen, anders weigert '
  'de database de rij.';

-- ─── 2. Verlopen laten werken ──────────────────────────────────────────
-- Bewust géén cron: op Vercel Hobby moet alles dagelijks draaien en er staan
-- er al acht. Deze functie wordt aangeroepen op het moment dat er gelezen
-- wordt — dan is de lijst per definitie actueel op het moment dat het uitmaakt,
-- en kan er niets stilletjes achterlopen.
create or replace function public.voorstellen_verlopen_markeren()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  aantal integer;
begin
  update public.ai_action_proposals
     set status = 'expired'
   where status = 'pending'
     and expires_at < now();
  get diagnostics aantal = row_count;
  return aantal;
end;
$$;

comment on function public.voorstellen_verlopen_markeren() is
  'Zet pending-voorstellen die over hun 24 uur heen zijn op expired. Wordt '
  'aangeroepen vlak vóór het ophalen van de lijst, zodat je nooit een voorstel '
  'bevestigt dat allang verlopen had moeten zijn.';

revoke all on function public.voorstellen_verlopen_markeren() from public;
grant execute on function public.voorstellen_verlopen_markeren() to authenticated;

-- ─── 3. Sneller de openstaande voorstellen vinden ──────────────────────
-- De lade vraagt altijd hetzelfde: mijn org, status pending, nieuwste eerst.
create index if not exists idx_ai_action_proposals_open
  on public.ai_action_proposals (organization_id, proposal_type, created_at desc)
  where status = 'pending';

-- ════════════════════════════════════════════════════════════════════════
-- Einde migratie
-- ════════════════════════════════════════════════════════════════════════
