-- Leveranciersvoorkeur (docs/leveranciersvoorkeur-plan.md, golf 1).
--
-- voorkeur_rang: 1 = de groothandel waarop de kostprijs van recepten rekent
-- (bij Hop & Bites: Bidfood), 2 = tweede keus voor de bestellijst (Sligro),
-- leeg = doet niet mee in kostprijs of winkelkeuze. Per organisatie is elke
-- rang hooguit één keer bezet; een andere cateraar zet zijn eigen groothandel
-- op 1.

alter table public.leveranciers
    add column if not exists voorkeur_rang smallint
        check (voorkeur_rang is null or (voorkeur_rang between 1 and 9));

create unique index if not exists leveranciers_voorkeur_rang_per_org
    on public.leveranciers (organization_id, voorkeur_rang)
    where voorkeur_rang is not null and archived_at is null;

comment on column public.leveranciers.voorkeur_rang is
    '1 = kostprijs-leverancier (recepten rekenen alleen op deze catalogus), 2+ = volgorde voor de winkelkeuze in de bestellijst, null = doet niet mee.';
