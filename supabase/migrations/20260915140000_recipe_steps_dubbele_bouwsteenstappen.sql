-- Bouwstenen die al bestonden kregen bij elke nieuwe opslag van de ontleder
-- hun stappen erbíj geplakt (ranchsaus: vier keer opgeslagen op 9 sep, vier
-- keer op het bord). De opslagroute vervangt sinds golf 5; hier de oude rommel:
-- per bouwsteen alleen de laatste opslag-batch (zelfde created_at) houden.
--
-- Alleen stappen van bouwstenen (component_id), niet van gerechten: die worden
-- al vervangen bij bijwerken en hadden dit probleem niet.

with laatste as (
    select component_id, max(created_at) as created_at
    from public.recipe_steps
    where component_id is not null
    group by component_id
)
delete from public.recipe_steps s
using laatste l
where s.component_id = l.component_id
  and s.created_at < l.created_at;
