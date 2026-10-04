-- Test voor BA-4a (migratie 20261006120000_toonbank_catalogus): statiegeld,
-- unieke EAN per organisatie, kanalen en de Toonbank-velden op artikelen, en
-- de teller winkel_catalogus_versie. Draait in één transactie die aan het
-- eind wordt teruggedraaid: er blijft niets achter.
--
-- ALLEEN op de dev-database, nooit op live en nooit met --linked:
--
--   npx supabase db query --db-url "$DEV_DB_URL" -o table -f supabase/tests/toonbank_catalogus.sql
--
-- of lokaal: npm --prefix tools/testdb run test -- toonbank_catalogus
-- Vereist de seed supabase/tests/seed_vier_naober.sql (organisatie
-- e2e-hop-en-bites); zonder die organisatie weigert de test te draaien.
--
-- Verwacht: "GESLAAGD: ..." als EXCEPTION. Elke andere foutmelding is een
-- echte fout.
--
-- De triggers zijn DEFERRABLE INITIALLY DEFERRED; net als winkel_vrij.sql zet
-- de test SET CONSTRAINTS ALL IMMEDIATE en bootst hij een volgende transactie
-- na door de vlag app.cv_<org> te wissen.

do $$
declare
    v_org      uuid;
    v_ander    uuid;
    v_suffix   text := substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);
    v_ean      text := '87' || lpad((floor(random() * 1e11))::bigint::text, 11, '0');
    v_p1       uuid;
    v_p2       uuid;
    v_p3       uuid;
    v_art      uuid;
    v_rij      record;
    v_v0       bigint;
    v_v        bigint;
    v_reden    text;
    v_vlag     text;
    v_fouten   text := '';
begin
    -- ── Dev-only-guard.
    select id into v_org from public.organizations where slug = 'e2e-hop-en-bites';
    if v_org is null then
        raise exception 'GEWEIGERD: organisatie e2e-hop-en-bites bestaat niet. Deze test draait alleen op de dev-database, na supabase/tests/seed_vier_naober.sql.';
    end if;
    v_vlag := 'app.cv_' || replace(v_org::text, '-', '');
    select coalesce((select versie from public.winkel_catalogus_versie where organization_id = v_org), 0) into v_v0;

    -- Een tweede organisatie voor "andere org" (alleen in deze transactie).
    insert into public.organizations (name, slug) values ('Test ander ' || v_suffix, 'test-ander-' || v_suffix) returning id into v_ander;

    -- ── 1. statiegeld_cents: standaard 0, nooit negatief.
    insert into public.winkel_producten (organization_id, naam, type, eenheid, prijs_per, btw_pct, alcohol, actief, ean)
    values (v_org, 'TEST blik ' || v_suffix, 'bier', 'stuk', 1, 21, true, true, v_ean)
    returning id into v_p1;
    select * into v_rij from public.winkel_producten where id = v_p1;
    if v_rij.statiegeld_cents is distinct from 0 then v_fouten := v_fouten || 'statiegeld niet standaard 0; '; end if;
    begin
        update public.winkel_producten set statiegeld_cents = -1 where id = v_p1;
        v_fouten := v_fouten || 'negatief statiegeld toegestaan; ';
    exception when check_violation then null;
    end;
    update public.winkel_producten set statiegeld_cents = 15 where id = v_p1;

    -- ── 2. EAN uniek per organisatie; dezelfde EAN in een andere org mag.
    begin
        insert into public.winkel_producten (organization_id, naam, type, eenheid, prijs_per, btw_pct, alcohol, actief, ean)
        values (v_org, 'TEST dubbel ' || v_suffix, 'bier', 'stuk', 1, 21, true, true, v_ean);
        v_fouten := v_fouten || 'dubbele EAN in dezelfde organisatie toegestaan; ';
    exception when unique_violation then
        if sqlerrm not like '%winkel_producten_ean_uniek%' then v_fouten := v_fouten || 'dubbele EAN met andere index: ' || sqlerrm || '; '; end if;
    end;
    insert into public.winkel_producten (organization_id, naam, type, eenheid, prijs_per, btw_pct, alcohol, actief, ean)
    values (v_ander, 'TEST zelfde EAN andere org', 'bier', 'stuk', 1, 21, true, true, v_ean)
    returning id into v_p3;
    -- Zonder EAN mag vaker.
    insert into public.winkel_producten (organization_id, naam, type, eenheid, prijs_per, btw_pct, alcohol, actief)
    values (v_org, 'TEST zonder EAN a ' || v_suffix, 'worst', 'stuk', 1, 9, false, true),
           (v_org, 'TEST zonder EAN b ' || v_suffix, 'worst', 'stuk', 1, 9, false, true);
    select id into v_p2 from public.winkel_producten where organization_id = v_org and naam = 'TEST zonder EAN a ' || v_suffix;

    -- ── 3. kanalen: standaard {webshop}; toonbank en event mogen; iets anders niet.
    insert into public.winkel_artikelen (organization_id, slug, naam, eenheid, telt, prijs_cents, btw_pct, minimum, actief, publiek)
    values (v_org, 'test-tb-' || v_suffix, 'TEST Toonbank ' || v_suffix, 'per stuk', 'stuks', 395, 21, 1, true, false)
    returning id into v_art;
    select * into v_rij from public.winkel_artikelen where id = v_art;
    if v_rij.kanalen is distinct from array['webshop']::text[] then v_fouten := v_fouten || 'kanalen niet standaard {webshop}: ' || coalesce(v_rij.kanalen::text, 'leeg') || '; '; end if;
    if v_rij.toonbank_volgorde <> 0 or v_rij.toonbank_favoriet or v_rij.toonbank_groep is not null then v_fouten := v_fouten || 'toonbank-velden niet leeg; '; end if;
    update public.winkel_artikelen set kanalen = array['webshop', 'toonbank', 'event'], toonbank_groep = 'Bier', toonbank_volgorde = 3, toonbank_favoriet = true where id = v_art;
    begin
        update public.winkel_artikelen set kanalen = array['kassa'] where id = v_art;
        v_fouten := v_fouten || 'kanaal kassa toegestaan; ';
    exception when check_violation then null;
    end;
    begin
        update public.winkel_artikelen set toonbank_groep = '   ' where id = v_art;
        v_fouten := v_fouten || 'lege groepsnaam toegestaan; ';
    exception when check_violation then null;
    end;
    insert into public.winkel_artikel_slots (organization_id, artikel_id, volgorde, slot_type, naam, hoeveelheid, eenheid, per, standaard_product_id)
    values (v_org, v_art, 0, 'bier', 'TEST blik', 1, 'stuk', 'stuk', v_p1);

    -- ── 4. De teller: nog niets vóór het committen, daarna precies één keer.
    select coalesce((select versie from public.winkel_catalogus_versie where organization_id = v_org), 0) into v_v;
    if v_v <> v_v0 then v_fouten := v_fouten || format('teller ging al omhoog vóór het committen (%s → %s); ', v_v0, v_v); end if;

    set constraints all immediate;
    select versie, laatste_reden into v_v, v_reden from public.winkel_catalogus_versie where organization_id = v_org;
    if v_v is distinct from v_v0 + 1 then v_fouten := v_fouten || format('teller na de hele opbouw %s i.p.v. %s; ', v_v, v_v0 + 1); end if;
    if v_reden is distinct from 'product' then v_fouten := v_fouten || format('eerste reden %s i.p.v. product; ', v_reden); end if;
    if coalesce(current_setting(v_vlag, true), '') <> 'ja' then v_fouten := v_fouten || 'vlag app.cv_<org> niet gezet; '; end if;
    -- De andere organisatie kreeg zijn eigen teller.
    if not exists (select 1 from public.winkel_catalogus_versie where organization_id = v_ander and versie = 1) then
        v_fouten := v_fouten || 'andere organisatie kreeg geen eigen teller; ';
    end if;

    -- Nog een wijziging in dezelfde transactie: blijft v0 + 1.
    update public.winkel_artikelen set naam = naam || ' (2)' where id = v_art;
    select versie into v_v from public.winkel_catalogus_versie where organization_id = v_org;
    if v_v is distinct from v_v0 + 1 then v_fouten := v_fouten || format('tweede wijziging in dezelfde transactie: %s; ', v_v); end if;

    -- Volgende transactie: een prijs → +1 met reden prijs.
    perform set_config(v_vlag, '', true);
    update public.winkel_artikelen set prijs_cents = 425 where id = v_art;
    select versie, laatste_reden into v_v, v_reden from public.winkel_catalogus_versie where organization_id = v_org;
    if v_v is distinct from v_v0 + 2 or v_reden is distinct from 'prijs' then v_fouten := v_fouten || format('prijs: %s/%s; ', v_v, v_reden); end if;

    -- Wat de catalogus niet raakt: het quotum, de drempel, de voorraad zelf, een update zonder wijziging.
    perform set_config(v_vlag, '', true);
    update public.winkel_artikelen set voorraad = 10 where id = v_art;
    update public.winkel_artikelen set kanalen = kanalen, toonbank_volgorde = toonbank_volgorde where id = v_art;
    update public.winkel_producten set drempel = 4 where id = v_p1;
    select versie into v_v from public.winkel_catalogus_versie where organization_id = v_org;
    if v_v is distinct from v_v0 + 2 then v_fouten := v_fouten || format('quotum/drempel/no-op verhoogde de teller (%s); ', v_v); end if;
    perform public.winkel_muteer_voorraad(v_org, v_p1, 'telling', 12);   -- van niet bijgehouden naar 12: wel
    select versie into v_v from public.winkel_catalogus_versie where organization_id = v_org;
    if v_v is distinct from v_v0 + 3 then v_fouten := v_fouten || format('bijgehouden worden: teller %s i.p.v. %s; ', v_v, v_v0 + 3); end if;
    perform set_config(v_vlag, '', true);
    perform public.winkel_muteer_voorraad(v_org, v_p1, 'telling', 11);   -- 12 → 11: niet (dat is GET vrij)
    select versie into v_v from public.winkel_catalogus_versie where organization_id = v_org;
    if v_v is distinct from v_v0 + 3 then v_fouten := v_fouten || format('een telling verhoogde de catalogus (%s); ', v_v); end if;

    -- Per bron: statiegeld, EAN, slot, kanaal, favoriet, artikel weg — telkens +1.
    perform set_config(v_vlag, '', true);
    update public.winkel_producten set statiegeld_cents = 10 where id = v_p1;
    select versie into v_v from public.winkel_catalogus_versie where organization_id = v_org;
    if v_v is distinct from v_v0 + 4 then v_fouten := v_fouten || format('statiegeld: %s; ', v_v); end if;

    perform set_config(v_vlag, '', true);
    update public.winkel_producten set ean = v_ean || '1' where id = v_p2;
    select versie into v_v from public.winkel_catalogus_versie where organization_id = v_org;
    if v_v is distinct from v_v0 + 5 then v_fouten := v_fouten || format('ean: %s; ', v_v); end if;

    perform set_config(v_vlag, '', true);
    update public.winkel_artikel_slots set hoeveelheid = 2 where artikel_id = v_art;
    select versie, laatste_reden into v_v, v_reden from public.winkel_catalogus_versie where organization_id = v_org;
    if v_v is distinct from v_v0 + 6 or v_reden is distinct from 'slot' then v_fouten := v_fouten || format('slot: %s/%s; ', v_v, v_reden); end if;

    perform set_config(v_vlag, '', true);
    update public.winkel_artikelen set toonbank_favoriet = false where id = v_art;
    select versie into v_v from public.winkel_catalogus_versie where organization_id = v_org;
    if v_v is distinct from v_v0 + 7 then v_fouten := v_fouten || format('favoriet: %s; ', v_v); end if;

    perform set_config(v_vlag, '', true);
    delete from public.winkel_artikelen where id = v_art;
    select versie, laatste_reden into v_v, v_reden from public.winkel_catalogus_versie where organization_id = v_org;
    if v_v is distinct from v_v0 + 8 or v_reden is distinct from 'artikel' then v_fouten := v_fouten || format('artikel weg: %s/%s; ', v_v, v_reden); end if;

    -- ── 5. Rechten: niet voor anon, schrijven door niemand, RLS per organisatie.
    if has_table_privilege('anon', 'public.winkel_catalogus_versie', 'SELECT') then v_fouten := v_fouten || 'anon leest de teller; '; end if;
    if has_table_privilege('authenticated', 'public.winkel_catalogus_versie', 'UPDATE') then v_fouten := v_fouten || 'authenticated schrijft de teller; '; end if;
    if has_function_privilege('authenticated', 'private.winkel_catalogus_versie_omhoog()', 'EXECUTE') then v_fouten := v_fouten || 'triggerfunctie aan te roepen; '; end if;
    perform set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid(), 'role', 'authenticated')::text, true);
    perform set_config('role', 'authenticated', true);
    if exists (select 1 from public.winkel_catalogus_versie) then v_fouten := v_fouten || 'niet-lid ziet tellers; '; end if;
    perform set_config('role', 'postgres', true);
    perform set_config('request.jwt.claims', '', true);

    if v_fouten <> '' then raise exception 'FOUT: %', v_fouten; end if;
    raise exception 'GESLAAGD: statiegeld standaard 0 en nooit negatief; EAN uniek per organisatie (andere org mag, leeg mag vaker); kanalen standaard {webshop}, kassa geweigerd; catalogusteller één keer per transactie (% → %), reden product/prijs/slot/artikel, niet bij quotum, drempel, telling of no-op, wel bij bijgehouden worden, statiegeld, EAN, slot, favoriet en artikel weg; niet voor anon, niet-lid ziet niets — alles teruggedraaid', v_v0, v_v;
end $$;
