-- Klant wordt een echte koppeling.
-- Plan: docs/een-geheel-plan.md, blok 4.
--
-- Offertes, events, facturen, aanvragen en webshoporders kenden hun klant
-- alleen als losse naam of e-mail. Daardoor bestond er geen betrouwbaar
-- klantdossier. Alleen toevoegen: de bestaande naam- en e-mailvelden blijven
-- staan en er verdwijnt niets.
--
-- Regel: alleen bij een unieke match. E-mail gaat voor, daarna exact dezelfde
-- naam binnen het bedrijf. Bij twijfel blijft het veld leeg.

alter table public.offertes      add column if not exists klant_id integer references public.klanten(id) on delete set null;
alter table public.events        add column if not exists klant_id integer references public.klanten(id) on delete set null;
alter table public.facturen      add column if not exists klant_id integer references public.klanten(id) on delete set null;
alter table public.leads         add column if not exists klant_id integer references public.klanten(id) on delete set null;
alter table public.winkel_orders add column if not exists klant_id integer references public.klanten(id) on delete set null;

create index if not exists offertes_klant_id_idx      on public.offertes (klant_id)      where klant_id is not null;
create index if not exists events_klant_id_idx        on public.events (klant_id)        where klant_id is not null;
create index if not exists facturen_klant_id_idx      on public.facturen (klant_id)      where klant_id is not null;
create index if not exists leads_klant_id_idx         on public.leads (klant_id)         where klant_id is not null;
create index if not exists winkel_orders_klant_id_idx on public.winkel_orders (klant_id) where klant_id is not null;
create index if not exists klanten_org_email_idx      on public.klanten (organization_id, lower(trim(email))) where email is not null;
create index if not exists klanten_org_naam_idx       on public.klanten (organization_id, lower(trim(naam)));

create or replace function private.klant_bij(p_org uuid, p_naam text, p_email text)
returns integer
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
    v_email text := nullif(lower(trim(p_email)), '');
    v_naam  text := nullif(lower(trim(p_naam)), '');
    v_ids   integer[];
begin
    if p_org is null then
        return null;
    end if;

    if v_email is not null then
        select array_agg(k.id) into v_ids
        from public.klanten k
        where k.organization_id = p_org and lower(trim(k.email)) = v_email;
        if cardinality(v_ids) = 1 then
            return v_ids[1];
        end if;
    end if;

    if v_naam is not null then
        select array_agg(k.id) into v_ids
        from public.klanten k
        where k.organization_id = p_org and lower(trim(k.naam)) = v_naam;
        if cardinality(v_ids) = 1 then
            return v_ids[1];
        end if;
    end if;

    return null;
end;
$$;

create or replace function private.koppel_klant()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
    v jsonb := to_jsonb(new);
begin
    if new.klant_id is null then
        new.klant_id := private.klant_bij(
            new.organization_id,
            coalesce(nullif(v->>'client_naam', ''), nullif(v->>'contact_naam', ''), nullif(v->>'naam', '')),
            coalesce(nullif(v->>'client_email', ''), nullif(v->>'contact_email', ''), nullif(v->>'email', ''))
        );
    end if;
    return new;
end;
$$;

-- Een nieuwe of gewijzigde klant pakt losse records met dezelfde naam of e-mail op.
create or replace function private.klant_pakt_records_op()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    update public.offertes o set klant_id = new.id
    where o.klant_id is null and o.organization_id = new.organization_id
      and private.klant_bij(o.organization_id, o.client_naam, o.client_email) = new.id;

    update public.events e set klant_id = new.id
    where e.klant_id is null and e.organization_id = new.organization_id
      and private.klant_bij(e.organization_id, e.client_naam, e.client_email) = new.id;

    update public.facturen f set klant_id = new.id
    where f.klant_id is null and f.organization_id = new.organization_id
      and private.klant_bij(f.organization_id, f.client_naam, null) = new.id;

    update public.leads l set klant_id = new.id
    where l.klant_id is null and l.organization_id = new.organization_id
      and private.klant_bij(l.organization_id, coalesce(nullif(l.client_naam, ''), l.naam), l.email) = new.id;

    update public.winkel_orders w set klant_id = new.id
    where w.klant_id is null and w.organization_id = new.organization_id
      and private.klant_bij(w.organization_id, w.contact_naam, w.contact_email) = new.id;

    return null;
end;
$$;

revoke all on function private.klant_bij(uuid, text, text) from public, anon, authenticated;
revoke all on function private.koppel_klant() from public, anon, authenticated;
revoke all on function private.klant_pakt_records_op() from public, anon, authenticated;

-- Bestaande records. updated_at blijft staan: dit is geen wijziging door de gebruiker.
alter table public.leads disable trigger trg_leads_updated_at;
alter table public.winkel_orders disable trigger trg_winkel_orders_updated_at;

update public.offertes o set klant_id = private.klant_bij(o.organization_id, o.client_naam, o.client_email)
where o.klant_id is null;
update public.events e set klant_id = private.klant_bij(e.organization_id, e.client_naam, e.client_email)
where e.klant_id is null;
update public.facturen f set klant_id = private.klant_bij(f.organization_id, f.client_naam, null)
where f.klant_id is null;
update public.leads l set klant_id = private.klant_bij(l.organization_id, coalesce(nullif(l.client_naam, ''), l.naam), l.email)
where l.klant_id is null;
update public.winkel_orders w set klant_id = private.klant_bij(w.organization_id, w.contact_naam, w.contact_email)
where w.klant_id is null;

alter table public.leads enable trigger trg_leads_updated_at;
alter table public.winkel_orders enable trigger trg_winkel_orders_updated_at;

drop trigger if exists trg_offertes_koppel_klant on public.offertes;
create trigger trg_offertes_koppel_klant before insert or update of client_naam, client_email on public.offertes
    for each row execute function private.koppel_klant();
drop trigger if exists trg_events_koppel_klant on public.events;
create trigger trg_events_koppel_klant before insert or update of client_naam, client_email on public.events
    for each row execute function private.koppel_klant();
drop trigger if exists trg_facturen_koppel_klant on public.facturen;
create trigger trg_facturen_koppel_klant before insert or update of client_naam on public.facturen
    for each row execute function private.koppel_klant();
drop trigger if exists trg_leads_koppel_klant on public.leads;
create trigger trg_leads_koppel_klant before insert or update of client_naam, naam, email on public.leads
    for each row execute function private.koppel_klant();
drop trigger if exists trg_winkel_orders_koppel_klant on public.winkel_orders;
create trigger trg_winkel_orders_koppel_klant before insert or update of contact_naam, contact_email on public.winkel_orders
    for each row execute function private.koppel_klant();

drop trigger if exists trg_klanten_pakt_records_op on public.klanten;
create trigger trg_klanten_pakt_records_op after insert or update of naam, email on public.klanten
    for each row execute function private.klant_pakt_records_op();
