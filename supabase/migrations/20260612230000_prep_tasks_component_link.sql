-- Kookbord v2: component-gestuurde prep-taken + batch-bundeling.
--
-- prep_tasks krijgt:
--   component_id  → welke component deze taak maakt (FK components, NULL voor
--                   template-/fallback-taken — backward compatible)
--   duration_min  → geschatte werkduur; bron: components.prep_minutes of
--                   deterministische default. Voedt de werklijst/gat-vulling.
--   batch_key     → bundel-sleutel "comp:<component_id>:<datum>" zodat de UI
--                   dezelfde component over events/gerechten heen als één
--                   batch-taak kan tonen ("3x mayonaise -> 1x maken").
--
-- components krijgt prep_minutes (additief; componenten-UI kan dit later
-- invulbaar maken — generator valt terug op default zolang NULL).
--
-- Geen RLS-wijzigingen: prep_tasks en components zijn al org-scoped;
-- nieuwe kolommen erven bestaande policies.

alter table prep_tasks
    add column if not exists component_id bigint references components(id) on delete set null;

alter table prep_tasks
    add column if not exists duration_min integer;

alter table prep_tasks
    add column if not exists batch_key text;

alter table components
    add column if not exists prep_minutes integer;

-- Join-lookups vanuit de werklijst (taak -> component-receptuur).
create index if not exists idx_prep_tasks_component_id
    on prep_tasks (component_id)
    where component_id is not null;
