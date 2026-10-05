-- Seed "Vier Naober" voor de dev-database (plan v5, stap 0.4 en E2E-0).
--
-- ALLEEN op de dev-database, nooit op live en nooit met --linked:
--
--   npx supabase db query --db-url "$DEV_DB_URL" -o table -f supabase/tests/seed_vier_naober.sql
--
-- of via de Supabase-MCP (execute_sql) op het dev-project / de dev-branch.
--
-- Idempotent: nog een keer draaien zet alles terug in dezelfde stand en maakt
-- niets dubbel. Wat er staat na afloop:
--   - organisatie e2e-hop-en-bites ("E2E Hop & Bites"); deze slug is het
--     teken voor de SQL-tests dat ze op dev draaien;
--   - winkel_instellingen: kassa open, site http://localhost:3001 (de website
--     lokaal), reservering € 2,50, ordernummers E2E-… (botst nooit met HB-… in
--     de gedeelde myPOS-testwinkel), verzenden uit;
--   - voorraad_plekken makerij en winkel;
--   - één afhaalmoment (groep 'afhalen', over 7 dagen, 14:00–17:00, onbeperkt);
--   - product Naober (bier, stuk, 18+, € 3,45, 21%), geteld op 6 via
--     winkel_muteer_voorraad (type telling);
--   - artikel roeg-naober (345 ct, btw 21, alcohol, actief, publiek, met
--     afhaalmoment) met één slot: 1 × Naober. Afhandeling 'wegzetten'
--     (losse winkelwaar, BA-6) zodra die kolom bestaat
--     (migratie 20261005140000_winkel_wegzetten).
-- Geen personen, geen e-mailadressen, geen sleutels.
--
-- Guard: weigert als er winkelartikelen of events van een andere organisatie
-- staan. Dat is live (of een kopie met echte data); de seed hoort alleen op
-- een lege dev-database.
--
-- Let op: een nieuwe telling zet het getal op 6, maar reserveringen van
-- eerdere E2E-runs (orders) blijven staan. De laatste SELECT laat zien
-- hoeveel er nog gereserveerd is.

do $$
declare
    v_org      uuid;
    v_prod     uuid;
    v_art      uuid;
    v_voorraad numeric;
    v_slots    int;
    v_goed     boolean;
begin
    -- ── Guard: nooit op live.
    if exists (select 1 from public.winkel_artikelen a
                where not exists (select 1 from public.organizations o where o.id = a.organization_id and o.slug = 'e2e-hop-en-bites'))
       or exists (select 1 from public.events e
                where not exists (select 1 from public.organizations o where o.id = e.organization_id and o.slug = 'e2e-hop-en-bites')) then
        raise exception 'GEWEIGERD: deze database bevat winkelartikelen of events van een andere organisatie dan e2e-hop-en-bites. Dat is live of een kopie met echte data; de seed draait alleen op een lege dev-database.';
    end if;

    -- ── Organisatie.
    insert into public.organizations (name, slug)
    values ('E2E Hop & Bites', 'e2e-hop-en-bites')
    on conflict (slug) do nothing;
    select id into v_org from public.organizations where slug = 'e2e-hop-en-bites';

    -- ── Winkelinstellingen.
    insert into public.winkel_instellingen (
        organization_id, verzendkosten_cents, gratis_verzenden_vanaf_cents, nummer_prefix,
        kassa_open, site_url, reservering_bedrag_cents, qr_basis_url, melding_email)
    values (v_org, null, null, 'E2E', true, 'http://localhost:3001', 250, null, null)
    on conflict (organization_id) do update
       set verzendkosten_cents = null,
           gratis_verzenden_vanaf_cents = null,
           nummer_prefix = 'E2E',
           kassa_open = true,
           site_url = 'http://localhost:3001',
           reservering_bedrag_cents = 250,
           qr_basis_url = null,
           melding_email = null;

    -- ── Plekken.
    insert into public.voorraad_plekken (organization_id, soort, naam)
    values (v_org, 'makerij', 'Keuken/makerij'), (v_org, 'winkel', 'Winkel')
    on conflict (organization_id, soort) do nothing;

    -- ── Eén afhaalmoment in de toekomst (alleen als er nog geen open moment is).
    if not exists (
        select 1 from public.winkel_momenten
         where organization_id = v_org and groep = 'afhalen' and actief
           and datum > (now() at time zone 'Europe/Amsterdam')::date
    ) then
        insert into public.winkel_momenten (organization_id, groep, datum, van, tot, capaciteit, actief)
        values (v_org, 'afhalen', (now() at time zone 'Europe/Amsterdam')::date + 7, '14:00', '17:00', null, true);
    end if;

    -- ── Product Naober.
    select id into v_prod from public.winkel_producten
     where organization_id = v_org and naam = 'Naober'
     order by created_at limit 1;
    if v_prod is null then
        insert into public.winkel_producten (
            organization_id, naam, type, eenheid, prijs_per, winkelprijs_incl_cents, btw_pct, alcohol, actief)
        values (v_org, 'Naober', 'bier', 'stuk', 1, 345, 21, true, true)
        returning id into v_prod;
    else
        update public.winkel_producten
           set type = 'bier', eenheid = 'stuk', prijs_per = 1, winkelprijs_incl_cents = 345,
               btw_pct = 21, alcohol = true, actief = true
         where id = v_prod;
    end if;

    -- Geteld op 6, via het logboek (nooit rechtstreeks: trigger WV003).
    select voorraad into v_voorraad from public.winkel_producten where id = v_prod;
    if v_voorraad is distinct from 6 then
        perform public.winkel_muteer_voorraad(v_org, v_prod, 'telling', 6, p_notitie => 'seed Vier Naober');
    end if;

    -- ── Artikel roeg-naober.
    insert into public.winkel_artikelen (
        organization_id, slug, naam, eenheid, telt, prijs_cents, btw_pct, minimum, maximum,
        verzendbaar, gekoeld, moment_soort, moment_groep, capaciteit_soort, voorraad,
        actief, publiek, alcohol, segment, vast)
    values (
        v_org, 'roeg-naober', 'Naober', 'per stuk', 'stuks', 345, 21, 1, null,
        false, false, 'moment', 'afhalen', 'regel', null,
        true, true, true, 'bier', true)
    on conflict (organization_id, slug) do update
       set naam = 'Naober', eenheid = 'per stuk', telt = 'stuks', prijs_cents = 345, btw_pct = 21,
           minimum = 1, maximum = null, verzendbaar = false, gekoeld = false,
           moment_soort = 'moment', moment_groep = 'afhalen', capaciteit_soort = 'regel', voorraad = null,
           actief = true, publiek = true, alcohol = true, segment = 'bier', vast = true, btw_verdeling = null
    returning id into v_art;

    -- ── BA-6: Naober is losse winkelwaar. Na betaling een wegzet-taak, geen
    --    inpakken in de makerij. Alleen als de migratie er al op staat.
    if exists (select 1 from information_schema.columns
                where table_schema = 'public' and table_name = 'winkel_artikelen' and column_name = 'afhandeling') then
        execute 'update public.winkel_artikelen set afhandeling = ''wegzetten'' where id = $1' using v_art;
    end if;

    -- ── Precies één slot: 1 × Naober. Slots zijn het template; bestaande
    --    orders hebben hun eigen componenten en merken hier niets van.
    select count(*), bool_and(slot_type = 'bier' and hoeveelheid = 1 and eenheid = 'stuk' and per = 'stuk' and standaard_product_id = v_prod)
      into v_slots, v_goed
      from public.winkel_artikel_slots where artikel_id = v_art;
    if v_slots <> 1 or not coalesce(v_goed, false) then
        delete from public.winkel_artikel_slots where artikel_id = v_art;
        insert into public.winkel_artikel_slots (
            organization_id, artikel_id, volgorde, slot_type, naam, hoeveelheid, eenheid, per, standaard_product_id)
        values (v_org, v_art, 1, 'bier', 'Naober', 1, 'stuk', 'stuk', v_prod);
    end if;
end $$;

-- Wat er nu staat.
select o.slug                                          as organisatie,
       i.kassa_open,
       i.site_url,
       i.nummer_prefix,
       p.naam                                          as product,
       p.voorraad                                      as geteld,
       public.winkel_bezetting_product(p.id, null)     as gereserveerd,
       a.slug                                          as artikel,
       a.prijs_cents,
       a.btw_pct,
       a.alcohol,
       a.actief,
       a.publiek,
       (select count(*) from public.winkel_artikel_slots s where s.artikel_id = a.id) as slots,
       (select min(m.datum) from public.winkel_momenten m
         where m.organization_id = o.id and m.groep = 'afhalen' and m.actief
           and m.datum > (now() at time zone 'Europe/Amsterdam')::date)          as afhaalmoment
  from public.organizations o
  join public.winkel_instellingen i on i.organization_id = o.id
  join public.winkel_producten p on p.organization_id = o.id and p.naam = 'Naober'
  join public.winkel_artikelen a on a.organization_id = o.id and a.slug = 'roeg-naober'
 where o.slug = 'e2e-hop-en-bites';
