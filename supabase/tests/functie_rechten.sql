-- Rechten-test voor BA-S (migratie 20261003150000_winkel_functies_niet_voor_anon).
-- Draait in een transactie die aan het eind wordt teruggedraaid: er blijft
-- niets achter, ook niet de tijdelijke testgebruiker.
--
-- ALLEEN op de dev-database, nooit op live en nooit met --linked:
--
--   npx supabase db query --db-url "$DEV_DB_URL" -o table -f supabase/tests/functie_rechten.sql
--
-- of via de Supabase-MCP (execute_sql) op het dev-project / de dev-branch.
-- Vereist de seed supabase/tests/seed_vier_naober.sql (organisatie
-- e2e-hop-en-bites); zonder die organisatie weigert de test te draaien.
--
-- Verwacht: "GESLAAGD: ..." als EXCEPTION (zie partij_afronden.sql). Elke
-- andere foutmelding is een echte fout.
--
-- Wat hij bewijst:
--   - anon mag geen enkele winkel_%-, voorraad_%-functie of keuken_afwijking
--     (alle overloads) en ook private.vereis_org niet; evenmin
--     productie_partij_afronden, partij_als_jsonb en increment_inventory_stock;
--   - wat de BA-gebruikersclient aanroept mag authenticated (o.a.
--     winkel_bezetting_product), wat alleen via de service-client loopt niet;
--   - nieuwe functies van postgres in public krijgen geen grant voor anon;
--   - in het echt: anon wordt geweigerd vóór de functie draait (ook bij de
--     productie- en keukenfuncties), en een lid van e2e-hop-en-bites mag
--     winkel_bezetting_product maar niet partij_als_jsonb;
--   - private.vereis_org laat door: geen claims, service_role, eigen
--     organisatie; en weigert: anon, een vreemde organisatie, geen lid.

do $$
declare
    v_org      uuid;
    v_ander    uuid := gen_random_uuid();
    v_user     uuid := gen_random_uuid();
    v_lijst    text;
    v_sig      text;
    v_n        numeric;
    v_aantal   int;
    v_gebruiker_ok boolean := false;
    v_fouten   text := '';
begin
    -- ── Dev-only-guard: de e2e-organisatie bestaat alleen op de dev-database.
    select id into v_org from public.organizations where slug = 'e2e-hop-en-bites';
    if v_org is null then
        raise exception 'GEWEIGERD: organisatie e2e-hop-en-bites bestaat niet. Deze test draait alleen op de dev-database, na supabase/tests/seed_vier_naober.sql.';
    end if;

    -- ── 1. anon: geen enkele winkel_/voorraad_-functie, alle overloads.
    select count(*) into v_aantal
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and (p.proname like 'winkel\_%' or p.proname like 'voorraad\_%' or p.proname = 'keuken_afwijking');
    if v_aantal < 20 then
        v_fouten := v_fouten || 'maar ' || v_aantal || ' winkel_/voorraad_-functies gevonden (verwacht ≥ 20): objectproef draaien; ';
    end if;

    select string_agg(p.oid::regprocedure::text, ', ' order by p.oid::regprocedure::text) into v_lijst
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and (p.proname like 'winkel\_%' or p.proname like 'voorraad\_%'
            or p.proname in ('keuken_afwijking', 'productie_partij_afronden', 'partij_als_jsonb', 'increment_inventory_stock'))
       and has_function_privilege('anon', p.oid, 'EXECUTE');
    if v_lijst is not null then v_fouten := v_fouten || 'anon mag: ' || v_lijst || '; '; end if;

    -- ── 2. private.vereis_org: bestaat, SECURITY DEFINER, vast search_path, niet voor anon.
    if to_regprocedure('private.vereis_org(uuid)') is null then
        v_fouten := v_fouten || 'private.vereis_org(uuid) ontbreekt; ';
    else
        if has_function_privilege('anon', 'private.vereis_org(uuid)', 'EXECUTE') then
            v_fouten := v_fouten || 'anon mag private.vereis_org; ';
        end if;
        if not has_function_privilege('authenticated', 'private.vereis_org(uuid)', 'EXECUTE')
           or not has_function_privilege('service_role', 'private.vereis_org(uuid)', 'EXECUTE') then
            v_fouten := v_fouten || 'authenticated of service_role mist private.vereis_org; ';
        end if;
        if not exists (select 1 from pg_proc
                        where oid = 'private.vereis_org(uuid)'::regprocedure
                          and prosecdef
                          and proconfig @> array['search_path=public, pg_temp']) then
            v_fouten := v_fouten || 'private.vereis_org is geen SECURITY DEFINER met search_path public, pg_temp; ';
        end if;
    end if;

    -- ── 3. Gebruikersclient: authenticated én service_role.
    foreach v_sig in array array[
        'public.winkel_bezetting_product(uuid, bigint)',
        'public.winkel_zet_klaargezet(uuid, bigint, boolean)',
        'public.winkel_doos_ophalen(uuid, text, text)',
        'public.winkel_boek_rest(bigint, text)',
        'public.winkel_dozen_voor_regel(uuid, bigint, text[])',
        'public.winkel_muteer_voorraad(uuid, uuid, text, numeric, text, text, bigint, bigint, date, integer, uuid, text, integer, bigint, uuid)',
        'public.voorraad_overboeken(uuid, integer, uuid, numeric, text, text, text)',
        'public.keuken_afwijking(uuid, integer, numeric, text, text, text)',
        'public.voorraad_invoer_boeken(uuid, uuid)',
        'public.productie_partij_afronden(uuid, uuid, bigint, numeric, text, numeric, text, jsonb, date, date, text, text, uuid, uuid, integer, bigint, uuid, integer, numeric, jsonb, text)',
        'public.increment_inventory_stock(uuid, integer, numeric, text, numeric, uuid, text, bigint, uuid)',
        -- BA-2 (20261005120000): zetOpgehaald, en straks de Toonbank via service_role
        'public.winkel_order_ophalen(uuid, bigint, text, text, text, uuid, uuid)',
        'public.winkel_order_ophalen_terug(uuid, bigint)',
        -- BA-5 (20261005130000): voorraad/winkel, meldingen, beschikbaarheid, straks de Toonbank
        'public.winkel_vrij_producten(uuid)',
        'public.winkel_vrij_artikelen(uuid)',
        'public.winkel_reserveringen(uuid, uuid)',
        'public.winkel_voorraad_stand(uuid)',
        -- BA-6 (20261005140000): paneel Apart zetten, straks de Toonbank via service_role
        'public.winkel_zet_order_apart(uuid, bigint, text, uuid, uuid)',
        'public.winkel_zet_order_apart_terug(uuid, bigint, text, uuid, uuid)'
    ] loop
        if to_regprocedure(v_sig) is null then
            v_fouten := v_fouten || v_sig || ' ontbreekt; ';
        else
            if not has_function_privilege('authenticated', v_sig, 'EXECUTE') then v_fouten := v_fouten || 'authenticated mist ' || v_sig || '; '; end if;
            if not has_function_privilege('service_role',  v_sig, 'EXECUTE') then v_fouten := v_fouten || 'service_role mist '  || v_sig || '; '; end if;
        end if;
    end loop;

    -- ── 3b. De triggerfunctie van de voorraadversie (BA-5): voor niemand los aan te roepen.
    if to_regprocedure('private.winkel_voorraad_versie_omhoog()') is null then
        v_fouten := v_fouten || 'private.winkel_voorraad_versie_omhoog() ontbreekt; ';
    elsif has_function_privilege('anon', 'private.winkel_voorraad_versie_omhoog()', 'EXECUTE')
       or has_function_privilege('authenticated', 'private.winkel_voorraad_versie_omhoog()', 'EXECUTE')
       or has_function_privilege('service_role', 'private.winkel_voorraad_versie_omhoog()', 'EXECUTE') then
        v_fouten := v_fouten || 'private.winkel_voorraad_versie_omhoog() is aan te roepen door anon, authenticated of service_role; ';
    end if;

    -- ── 3c. De view winkel_wegzet_taken (BA-6): lezen voor authenticated en service_role, niet voor anon.
    if to_regclass('public.winkel_wegzet_taken') is null then
        v_fouten := v_fouten || 'view winkel_wegzet_taken ontbreekt; ';
    elsif has_table_privilege('anon', 'public.winkel_wegzet_taken', 'SELECT')
       or not has_table_privilege('authenticated', 'public.winkel_wegzet_taken', 'SELECT')
       or not has_table_privilege('service_role', 'public.winkel_wegzet_taken', 'SELECT') then
        v_fouten := v_fouten || 'rechten op winkel_wegzet_taken kloppen niet (anon nee, authenticated en service_role ja); ';
    end if;

    -- ── 4. Alleen de service-client: service_role ja, authenticated nee.
    foreach v_sig in array array[
        'public.winkel_plaats_order(uuid, text, text, text, uuid, text, text, text, jsonb, text, integer, integer, integer, jsonb, text, jsonb, text, integer, integer)',
        'public.winkel_start_betaalpoging(bigint)',
        'public.winkel_bevestig_betaling(bigint, text, integer, text)',
        'public.winkel_controleer_capaciteit(uuid, jsonb, bigint)',
        'public.winkel_regels_json(bigint)',
        'public.winkel_bezetting_moment(uuid, bigint)',
        'public.winkel_bezetting_voorraad(uuid, bigint)',
        'public.winkel_keuken_factor(text, text)',
        'public.partij_als_jsonb(uuid, boolean)'
    ] loop
        if to_regprocedure(v_sig) is null then
            v_fouten := v_fouten || v_sig || ' ontbreekt; ';
        else
            if not has_function_privilege('service_role', v_sig, 'EXECUTE') then v_fouten := v_fouten || 'service_role mist ' || v_sig || '; '; end if;
            if has_function_privilege('authenticated', v_sig, 'EXECUTE')    then v_fouten := v_fouten || 'authenticated mag nog ' || v_sig || '; '; end if;
        end if;
    end loop;

    -- ── 5. Standaardrechten: nieuwe functies van postgres in public niet voor anon.
    if exists (
        select 1
          from pg_default_acl d
          join pg_namespace n on n.oid = d.defaclnamespace
          cross join lateral aclexplode(d.defaclacl) a
         where n.nspname = 'public'
           and d.defaclobjtype = 'f'
           and d.defaclrole = 'postgres'::regrole
           and a.grantee = 'anon'::regrole
    ) then
        v_fouten := v_fouten || 'standaardrechten van postgres in public geven anon nog EXECUTE; ';
    end if;

    -- ── 6. In het echt: anon wordt geweigerd vóór de functie draait.
    foreach v_sig in array array['winkel_muteer_voorraad', 'winkel_bezetting_product', 'voorraad_overboeken',
                                 'productie_partij_afronden', 'partij_als_jsonb', 'increment_inventory_stock'] loop
        begin
            perform set_config('request.jwt.claims', '{"role":"anon"}', true);
            perform set_config('role', 'anon', true);
            if v_sig = 'winkel_muteer_voorraad' then
                perform public.winkel_muteer_voorraad(v_org, gen_random_uuid(), 'telling', 0);
            elsif v_sig = 'winkel_bezetting_product' then
                perform public.winkel_bezetting_product(gen_random_uuid(), null);
            elsif v_sig = 'productie_partij_afronden' then
                perform public.productie_partij_afronden(v_org, gen_random_uuid(), 0, 1, 'kg', 1, 'kg', '[]'::jsonb);
            elsif v_sig = 'partij_als_jsonb' then
                perform public.partij_als_jsonb(gen_random_uuid(), false);
            elsif v_sig = 'increment_inventory_stock' then
                perform public.increment_inventory_stock(v_org, 0, 0, 'count');
            else
                perform public.voorraad_overboeken(v_org, 0, gen_random_uuid(), 1);
            end if;
            raise exception 'anon_kwam_erdoor';
        exception
            when insufficient_privilege then
                if sqlerrm not like 'permission denied for function%' then
                    v_fouten := v_fouten || 'anon op ' || v_sig || ': verkeerde weigering (' || sqlerrm || '); ';
                end if;
            when others then
                v_fouten := v_fouten || 'anon kwam langs de rechten van ' || v_sig || ' (' || sqlerrm || '); ';
        end;
    end loop;

    -- ── 7. In het echt: een lid van e2e-hop-en-bites. Tijdelijke gebruiker, teruggedraaid.
    begin
        insert into auth.users (id, aud, role, email)
        values (v_user, 'authenticated', 'authenticated', 'functie-rechten-' || v_user || '@example.invalid');
        insert into public.organization_members (organization_id, user_id, role, status)
        values (v_org, v_user, 'Medewerker', 'active');
        v_gebruiker_ok := true;
    exception when others then
        v_fouten := v_fouten || 'tijdelijke testgebruiker niet aan te maken (' || sqlerrm || '); ';
    end;

    if v_gebruiker_ok then
        begin
            perform set_config('request.jwt.claims', json_build_object('sub', v_user, 'role', 'authenticated')::text, true);
            perform set_config('role', 'authenticated', true);

            v_n := public.winkel_bezetting_product(gen_random_uuid(), null);
            if v_n is distinct from 0 then
                v_fouten := v_fouten || 'winkel_bezetting_product gaf ' || coalesce(v_n::text, 'null') || ' i.p.v. 0; ';
            end if;

            perform private.vereis_org(v_org);

            begin
                perform private.vereis_org(v_ander);
                v_fouten := v_fouten || 'vereis_org liet een vreemde organisatie door; ';
            exception when insufficient_privilege then null;
            end;

            begin
                perform public.winkel_bevestig_betaling(0, 'test', 0, 'test');
                v_fouten := v_fouten || 'authenticated kon winkel_bevestig_betaling aanroepen; ';
            exception when insufficient_privilege then null;
            end;

            begin
                perform public.partij_als_jsonb(gen_random_uuid(), false);
                v_fouten := v_fouten || 'authenticated kon partij_als_jsonb aanroepen; ';
            exception when insufficient_privilege then null;
            end;

            raise exception 'terug_naar_postgres';
        exception when others then
            if sqlerrm <> 'terug_naar_postgres' then
                v_fouten := v_fouten || 'als lid van e2e: ' || sqlerrm || '; ';
            end if;
        end;
    end if;

    -- ── 8. private.vereis_org per pad (als postgres, alleen de claims wisselen).
    perform set_config('request.jwt.claims', '', true);
    begin
        perform private.vereis_org(v_ander);
    exception when others then
        v_fouten := v_fouten || 'vereis_org zonder claims (directe verbinding) weigerde: ' || sqlerrm || '; ';
    end;

    perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
    begin
        perform private.vereis_org(v_ander);
    exception when others then
        v_fouten := v_fouten || 'vereis_org met service_role weigerde: ' || sqlerrm || '; ';
    end;

    perform set_config('request.jwt.claims', '{"role":"anon"}', true);
    begin
        perform private.vereis_org(v_org);
        v_fouten := v_fouten || 'vereis_org liet anon door; ';
    exception when insufficient_privilege then null;
    end;

    perform set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid(), 'role', 'authenticated')::text, true);
    begin
        perform private.vereis_org(v_org);
        v_fouten := v_fouten || 'vereis_org liet een niet-lid door; ';
    exception when insufficient_privilege then null;
    end;

    perform set_config('request.jwt.claims', json_build_object('sub', v_user, 'role', 'authenticated')::text, true);
    begin
        perform private.vereis_org(null);
        v_fouten := v_fouten || 'vereis_org liet organisatie NULL door; ';
    exception when insufficient_privilege then null;
    end;
    perform set_config('request.jwt.claims', '', true);

    if v_fouten <> '' then raise exception 'FOUT: %', v_fouten; end if;
    raise exception 'GESLAAGD: % winkel_/voorraad_-functies, geen enkele voor anon (ook productie_partij_afronden, partij_als_jsonb en increment_inventory_stock niet); gebruikersclient-functies voor authenticated, betaal- en plaatsfuncties en partij_als_jsonb alleen service_role; standaardrechten zonder anon; anon in het echt geweigerd; lid van e2e mag winkel_bezetting_product; vereis_org klopt op alle paden — alles teruggedraaid', v_aantal;
end $$;
