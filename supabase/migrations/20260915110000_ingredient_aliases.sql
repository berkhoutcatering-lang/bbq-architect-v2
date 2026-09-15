-- Ingrediënt-aliassen (docs/leveranciersvoorkeur-plan.md, golf 4).
--
-- "appelciderazijn" = "Appelazijn, can 5 ltr" — één keer bevestigd door de kok,
-- daarna weet de app het. De receptuur-matcher kijkt hier éérst; een bekend
-- ingrediënt is direct goed, zonder AI.
--
-- Bewust een eigen tabel naast org_product_aliases: die hangt aan
-- master_products (Catalogus A), terwijl Bidfood vrijwel volledig in
-- supplier_products (Catalogus B) staat en een alias ook naar de eigen
-- bibliotheek of voorraad mag wijzen. De twee catalogi worden nooit op id
-- gejoind; hier staat de bron expliciet naast het id.
--
-- product_name staat erbij zodat een alias na een nieuwe prijslijst (nieuw id)
-- op naam terug te vinden is in plaats van stil te verdwijnen.

create table if not exists public.ingredient_aliases (
    id                bigserial primary key,
    organization_id   uuid not null references public.organizations(id) on delete cascade,
    alias             text not null,
    alias_normalized  text not null,
    source            text not null check (source in ('component', 'inventory', 'supplier', 'supplier_product')),
    ref_id            bigint not null,
    product_name      text not null,
    supplier_name     text,
    created_by        uuid references auth.users(id) on delete set null,
    created_at        timestamptz not null default now(),
    updated_at        timestamptz not null default now(),
    unique (organization_id, alias_normalized)
);

create index if not exists ingredient_aliases_org_idx on public.ingredient_aliases (organization_id);

comment on table public.ingredient_aliases is
    'Door de kok bevestigde koppeling ingrediëntnaam → product (eigen bibliotheek, voorraad, prijslijst of gescande catalogus). De matcher kijkt hier eerst.';

alter table public.ingredient_aliases enable row level security;

create policy ingredient_aliases_select on public.ingredient_aliases
  for select to authenticated using (organization_id in (select private.user_org_ids()));
create policy ingredient_aliases_insert on public.ingredient_aliases
  for insert to authenticated with check (organization_id in (select private.user_org_ids()));
create policy ingredient_aliases_update on public.ingredient_aliases
  for update to authenticated
  using (organization_id in (select private.user_org_ids()))
  with check (organization_id in (select private.user_org_ids()));
create policy ingredient_aliases_delete on public.ingredient_aliases
  for delete to authenticated using (organization_id in (select private.user_org_ids()));
