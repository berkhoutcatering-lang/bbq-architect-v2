-- Webshop-events hielden de standaardprijs p.p. van de kolom: een Kerst-Box van
-- € 94 stond op € 180. Menukaarten toonden de voorbeeldnaam uit het sjabloon.

update public.events e
set ppp = round((select coalesce(sum(o.totaal_cents), 0) from public.winkel_orders o
                 where o.status = 'betaald'
                   and o.id in (select r.order_id from public.winkel_order_regels r where r.event_id = e.id))::numeric / e.guests / 100, 2)
where e.type = 'Webshop' and e.guests > 0;

update public.settings s
set menukaart_overrides = coalesce(s.menukaart_overrides, '{}'::jsonb) || jsonb_build_object('brandName', s.bedrijfsnaam)
where s.bedrijfsnaam is not null and s.bedrijfsnaam <> ''
  and not coalesce(s.menukaart_overrides, '{}'::jsonb) ? 'brandName';
