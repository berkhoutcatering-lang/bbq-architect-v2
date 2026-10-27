-- Onderdelen aan/uit: alleen de rol Admin mag het wijzigen (2026-10-20).
--
-- De server-actie (src/app/instellingen/onderdelen/actions.ts) controleert de
-- rol al, maar de RLS op settings (org_update) laat elk lid de rij bijwerken.
-- Zonder deze trigger kon een Medewerker vanuit de browser rechtstreeks
-- settings.verborgen_onderdelen zetten en zo onderdelen voor het hele bedrijf
-- verbergen. Andere kolommen van settings raakt deze trigger niet.
--
-- Zonder ingelogde gebruiker (service-role, migraties) mag het wel.

create or replace function public.settings_onderdelen_alleen_admin()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  gewijzigd boolean;
begin
  if tg_op = 'INSERT' then
    gewijzigd := coalesce(cardinality(new.verborgen_onderdelen), 0) > 0;
  else
    gewijzigd := new.verborgen_onderdelen is distinct from old.verborgen_onderdelen;
  end if;

  if gewijzigd and auth.uid() is not null and not exists (
    select 1 from public.organization_members m
    where m.organization_id = new.organization_id
      and m.user_id = auth.uid()
      and m.status = 'active'
      and m.role = 'Admin'
  ) then
    raise exception 'Alleen een beheerder (rol Admin) kan onderdelen aan- of uitzetten'
      using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists settings_onderdelen_alleen_admin on public.settings;
create trigger settings_onderdelen_alleen_admin
  before insert or update on public.settings
  for each row execute function public.settings_onderdelen_alleen_admin();
