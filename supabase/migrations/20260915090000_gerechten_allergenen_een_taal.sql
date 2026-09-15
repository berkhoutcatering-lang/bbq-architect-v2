-- gerechten.allergenen sprak drie talen door elkaar: lettercodes uit de
-- AI-check (G, E, L, S), woorden (selderij) en oudere namen (Melk, Eieren).
-- Een filter op "ei" zag "E" niet. Eén taal: de woorden uit lib/constants.
-- V/VE (vegetarisch/vegan) zijn dieetwensen, geen allergenen, en vervallen.

update public.gerechten
set allergenen = (
    select coalesce(array_agg(distinct w order by w), '{}')
    from unnest(allergenen) a
    cross join lateral (
        select case upper(a)
            when 'G' then 'gluten'
            when 'L' then 'lactose'
            when 'N' then 'noten'
            when 'E' then 'ei'
            when 'S' then 'soja'
            when 'F' then 'vis'
            when 'M' then 'mosterd'
            when 'MELK' then 'lactose'
            when 'EIEREN' then 'ei'
            when 'V' then null
            when 'VE' then null
            else lower(a)
        end as w
    ) t
    where w is not null
)
where allergenen is not null and cardinality(allergenen) > 0;
