-- Productie & bewaren op een bouwsteen (plan glistening-brewing-heron, fase 1).
--
-- Een component dat bereid wordt, gaat in een vaste verpakking de voorraad in:
-- pulled pork per 1 kg, saus per 0,5 l, broodjes per 12 stuks. Die maat is de
-- bron voor "12 kg → 12 zakken → 12 labels". Niets hiervan wordt geraden:
-- staat het leeg, dan vraagt de afrond-sheet het één keer en bewaart het hier.
--
--   verpakking_grootte / _eenheid   inhoud van één fysieke eenheid
--   bewaarmethode                   vers | vries | houdbaar (zelfde woorden als inventory.storage_type)
--   bewaaradvies                    vrije tekst, letterlijk op het label ("max. -18 °C")
--   partij_prefix                   letters vóór het partijnummer (PP-20260916-01); leeg = afgeleid uit de naam
--   voorraad_item_id                het eindproduct als voorraadproduct; wordt bij de eerste partij gekoppeld
--
-- houdbaarheid_na_bewerking_dagen bestond al (golf 1) en wordt nu de bron voor de THT.

alter table public.components
    add column if not exists verpakking_grootte numeric(10,3)
        check (verpakking_grootte is null or verpakking_grootte > 0),
    add column if not exists verpakking_eenheid text
        check (verpakking_eenheid is null or verpakking_eenheid in ('g', 'kg', 'ml', 'l', 'stuk', 'portie')),
    add column if not exists bewaarmethode text
        check (bewaarmethode is null or bewaarmethode in ('vers', 'vries', 'houdbaar')),
    add column if not exists bewaaradvies text,
    add column if not exists partij_prefix text
        check (partij_prefix is null or partij_prefix ~ '^[A-Z0-9]{1,4}$'),
    add column if not exists voorraad_item_id integer references public.inventory(id) on delete set null;

comment on column public.components.verpakking_grootte is 'Inhoud van één fysieke eenheid na productie (zak, bak, pot). Bepaalt samen met de gemaakte hoeveelheid het aantal eenheden en dus het aantal labels.';
comment on column public.components.bewaaradvies is 'Letterlijke tekst op het label, bv. "max. -18 °C". Geen berekende grens.';
comment on column public.components.partij_prefix is 'Hoofdletters vóór het partijnummer, max 4. Leeg = beginletters van de naam.';
comment on column public.components.voorraad_item_id is 'Voorraadproduct van het eindproduct. Wordt bij de eerste partij automatisch aangemaakt of gekoppeld.';
