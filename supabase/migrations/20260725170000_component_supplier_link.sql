-- Blijvende koppeling: (inkoop-)component → leverancier-prijs uit Catalog A
-- (master_products + supplier_prices), zodat de kostprijs meebeweegt met de
-- prijslijst en je "Gekoppeld aan <leverancier>" ziet.
--
-- Bewust NIET via components.supplier_product_id — dat is de ANDERE catalogus
-- (supplier_products, bestellen) met een bekende id-mismatch. De kostprijs-bron
-- is Catalog A. Zie /api/catalog/search en [[project_leverancierssync_rebuild]].
--
-- Beide nullable + IF NOT EXISTS: components is niet volledig repo-tracked, en
-- zonder koppeling werkt alles gewoon op de handmatige base_cost_cents (de
-- feature degradeert netjes tot deze migratie gedraaid is).

alter table if exists public.components add column if not exists master_product_id bigint;
alter table if exists public.components add column if not exists supplier_price_id bigint;

-- Voor de "ververs gekoppelde prijzen"-lookup: snel alle componenten vinden die
-- aan een bepaalde leverancier-prijs hangen.
create index if not exists components_supplier_price_id_idx
    on public.components (supplier_price_id)
    where supplier_price_id is not null;

-- RLS: components is al org-scoped; nieuwe nullable kolommen erven het beleid,
-- geen policy-wijziging nodig.
