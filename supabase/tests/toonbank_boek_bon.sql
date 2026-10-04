-- Test voor BA-9 (migratie 20261007120000_toonbank_bonnen): toonbank_boek_bon
-- volgens contract §4.2, de voorraad en vrij_overschreden. Draait in één
-- transactie die aan het eind wordt teruggedraaid.
--
-- ALLEEN op de dev-database, nooit op live en nooit met --linked:
--
--   npx supabase db query --db-url "$DEV_DB_URL" -o table -f supabase/tests/toonbank_boek_bon.sql
--
-- of lokaal: npm --prefix tools/testdb run test -- toonbank_boek_bon
-- Vereist de seed supabase/tests/seed_vier_naober.sql.
--
-- Bewijst onder meer: dezelfde bon twee keer → 'bestond' en één mutatie;
-- een pakket van 3 delen → 3 mutaties; voorraad 1, verkoop 3 → eerst +2
-- tekort_correctie, dan −3 verkoop_kassa met gebeurd_at; voorraad NULL →
-- niet_bijgehouden; tegenbon → retour.
--
-- Verwacht: "GESLAAGD: ..." als EXCEPTION.

create function pg_temp.ond(p_product uuid, p_hoeveelheid numeric)
returns jsonb language sql as $$
    select jsonb_build_object('product_id', p_product, 'hoeveelheid', p_hoeveelheid, 'eenheid', 'stuk')
$$;

create function pg_temp.tb_regel(p_nr int, p_naam text, p_aantal int, p_stuk int, p_pct int, p_onderdelen jsonb, p_extra jsonb default '{}')
returns jsonb language sql as $$
    select jsonb_build_object('regelnr', p_nr, 'soort', 'verkoop', 'artikel_id', null, 'naam', p_naam, 'aantal', p_aantal,
        'stuk_cents', p_stuk, 'korting_cents', 0, 'bedrag_cents', p_aantal * p_stuk,
        'btw', jsonb_build_array(jsonb_build_object('pct', p_pct, 'incl_cents', p_aantal * p_stuk)),
        'alcohol', false, 'onderdelen', p_onderdelen, 'prijs_bron', 'catalogus') || p_extra
$$;

create function pg_temp.tb_bon(p_soort text, p_gid uuid, p_volgnr bigint, p_bonnummer text, p_regels jsonb, p_extra jsonb default '{}')
returns jsonb language sql as $$
    select jsonb_build_object('soort', p_soort, 'gebeurtenis_id', p_gid, 'volgnummer', p_volgnr, 'moment', '2027-03-06T11:12:08+01:00',
        'medewerker_id', null, 'bon_id', p_gid, 'bonnummer', p_bonnummer, 'bon_volgnummer', split_part(p_bonnummer, '-', 2)::int,
        'status', 'afgerond', 'kanaal', 'winkel', 'catalogus_versie', 1, 'leeftijd', null,
        'regels', p_regels || jsonb_build_array(jsonb_build_object('regelnr', 99, 'soort', 'betaling', 'betaalmethode', 'pin',
            'betaal_bevestiging', 'handmatig', 'bedrag_cents', (select coalesce(sum((r->>'bedrag_cents')::int), 0) from jsonb_array_elements(p_regels) r))),
        'totaal_cents', (select coalesce(sum((r->>'bedrag_cents')::int), 0) from jsonb_array_elements(p_regels) r),
        'afronding_cents', 0) || p_extra
$$;

-- Opslaan en de wachtrij van die tablet draaien; geeft de journaalregel.
create function pg_temp.tb_stuur(p_org uuid, p_app uuid, p_m jsonb)
returns public.toonbank_journaal language plpgsql as $$
declare
    v public.toonbank_journaal;
begin
    perform public.toonbank_journaal_opslaan(p_org, p_app, jsonb_build_array(p_m), '1.1.0');
    perform public.toonbank_verwerk_wachtrij(p_org, p_app);
    select * into v from public.toonbank_journaal where organization_id = p_org and gebeurtenis_id = (p_m->>'gebeurtenis_id')::uuid;
    return v;
end $$;

do $$
declare
    v_org       uuid;
    v_sfx       text := substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);
    v_hash      text := repeat('a', 32) || ':' || repeat('b', 128);
    v_app       uuid;
    v_code      text;
    v_app2      uuid;
    v_code2     text;
    v_mw        uuid;
    v_eig       uuid;
    v_bier      uuid;
    v_worst     uuid;
    v_kaas      uuid;
    v_amandel   uuid;
    v_nieuw     uuid;
    v_naober    uuid;
    v_a_naober  uuid;
    v_moment    uuid;
    v_o         public.winkel_orders%rowtype;
    v_o1        bigint;
    v_o2        bigint;
    v_s1        uuid;
    v_s2        uuid;
    v_vnr       bigint := 0;
    v_bnr       int := 0;
    v_b1        uuid := gen_random_uuid();
    v_b2        uuid := gen_random_uuid();
    v_b3        uuid := gen_random_uuid();
    v_b4        uuid := gen_random_uuid();
    v_t1        uuid := gen_random_uuid();
    v_b6        uuid := gen_random_uuid();
    v_t2        uuid := gen_random_uuid();
    v_b7        uuid := gen_random_uuid();
    v_t3        uuid := gen_random_uuid();
    v_b8        uuid := gen_random_uuid();
    v_b9        uuid := gen_random_uuid();
    v_b11       uuid := gen_random_uuid();
    v_b11b      uuid := gen_random_uuid();
    v_b12       uuid := gen_random_uuid();
    v_b13       uuid := gen_random_uuid();
    v_b14       uuid := gen_random_uuid();
    v_b15       uuid := gen_random_uuid();
    v_bn        uuid := gen_random_uuid();
    v_vo1       uuid := gen_random_uuid();
    v_vo2       uuid := gen_random_uuid();
    v_vo3       uuid := gen_random_uuid();
    v_vo4       uuid := gen_random_uuid();
    v_m         jsonb;
    v_j         public.toonbank_journaal%rowtype;
    v_bon       public.toonbank_bonnen%rowtype;
    v_r         jsonb;
    v_n         int;
    v_regel     bigint;
    v_ids       bigint[];
    v_fouten    text := '';
begin
    select id into v_org from public.organizations where slug = 'e2e-hop-en-bites';
    if v_org is null then
        raise exception 'GEWEIGERD: organisatie e2e-hop-en-bites bestaat niet. Deze test draait alleen op de dev-database, na supabase/tests/seed_vier_naober.sql.';
    end if;

    -- ── Opzet: twee tablets, een medewerker en een eigenaar, producten.
    v_r := public.toonbank_apparaat_nieuw(v_org, 'TEST bonnen ' || v_sfx, 'winkel', v_hash);
    v_app := (v_r->>'apparaat_id')::uuid; v_code := v_r->>'code';
    v_r := public.toonbank_apparaat_nieuw(v_org, 'TEST bonnen 2 ' || v_sfx, 'event', v_hash);
    v_app2 := (v_r->>'apparaat_id')::uuid; v_code2 := v_r->>'code';
    insert into public.personeel (organization_id, naam, toonbank_rol) values (v_org, 'TEST Sanne', 'medewerker') returning id into v_mw;
    insert into public.personeel (organization_id, naam, toonbank_rol) values (v_org, 'TEST Mathijs', 'eigenaar') returning id into v_eig;

    insert into public.winkel_producten (organization_id, naam, type, eenheid, prijs_per, btw_pct, alcohol)
    values (v_org, 'TEST bier ' || v_sfx, 'bier', 'stuk', 1, 21, true) returning id into v_bier;
    insert into public.winkel_producten (organization_id, naam, type, eenheid, prijs_per, btw_pct)
    values (v_org, 'TEST worst ' || v_sfx, 'worst', 'stuk', 1, 9) returning id into v_worst;
    insert into public.winkel_producten (organization_id, naam, type, eenheid, prijs_per, btw_pct)
    values (v_org, 'TEST kaas ' || v_sfx, 'kaas', 'stuk', 1, 9) returning id into v_kaas;
    insert into public.winkel_producten (organization_id, naam, type, eenheid, prijs_per, btw_pct)
    values (v_org, 'TEST amandelen ' || v_sfx, 'amandelen', 'stuk', 1, 9) returning id into v_amandel;
    insert into public.winkel_producten (organization_id, naam, type, eenheid, prijs_per, btw_pct)
    values (v_org, 'TEST nog niet geteld ' || v_sfx, 'overig', 'stuk', 1, 9) returning id into v_nieuw;
    perform public.winkel_muteer_voorraad(v_org, v_bier, 'telling', 6);
    perform public.winkel_muteer_voorraad(v_org, v_worst, 'telling', 10);
    perform public.winkel_muteer_voorraad(v_org, v_kaas, 'telling', 5);
    perform public.winkel_muteer_voorraad(v_org, v_amandel, 'telling', 1);

    -- ── 1. Een gewone bon: 2 × bier → één verkoop_kassa −2 met de tijd van de bon.
    v_vnr := v_vnr + 1; v_bnr := v_bnr + 1;
    v_m := pg_temp.tb_bon('bon', v_b1, v_vnr, v_code || '-' || lpad(v_bnr::text, 6, '0'),
        jsonb_build_array(pg_temp.tb_regel(1, 'TEST bier', 2, 345, 21, jsonb_build_array(pg_temp.ond(v_bier, 1)))),
        jsonb_build_object('medewerker_id', v_mw));
    v_j := pg_temp.tb_stuur(v_org, v_app, v_m);
    select * into v_bon from public.toonbank_bonnen where id = v_b1;
    if v_j.verwerk_status <> 'verwerkt' or v_bon.id is null then
        v_fouten := v_fouten || 'bon 1 niet verwerkt: ' || row_to_json(v_j)::text || '; ';
    elsif v_bon.btw <> '{"21": {"incl_cents": 690, "btw_cents": 120}}'::jsonb or v_bon.omzet_incl_cents <> 690 or v_bon.pin_cents <> 690
          or v_bon.totaal_cents <> 690 or v_bon.bedrijfsdag <> '2027-03-06' or v_bon.gebeurd_at <> '2027-03-06T10:12:08Z'::timestamptz
          or v_bon.medewerker_naam <> 'TEST Sanne' or v_bon.soort <> 'verkoop' or v_bon.journaal_id <> v_j.id or v_bon.leeftijd_vastgesteld is not null then
        v_fouten := v_fouten || 'bon 1: ' || row_to_json(v_bon)::text || '; ';
    end if;
    select id into v_regel from public.toonbank_bon_regels where bon_id = v_b1 and regelnr = 1;
    if not exists (select 1 from public.winkel_voorraad_mutaties
                    where winkel_product_id = v_bier and type = 'verkoop_kassa' and hoeveelheid = -2 and resultaat = 4
                      and idempotency_key = format('tb:%s:1:%s:verkoop', v_b1, v_bier)
                      and gebeurd_at = '2027-03-06T10:12:08Z'::timestamptz and toonbank_bon_regel_id = v_regel) then
        v_fouten := v_fouten || 'mutatie bon 1 klopt niet; ';
    end if;
    if (select voorraad_status from public.toonbank_bon_regels where id = v_regel) <> 'geboekt'
       or (select voorraad_status from public.toonbank_bon_regels where bon_id = v_b1 and regelnr = 99) <> 'nvt'
       or (select btw from public.toonbank_bon_regels where id = v_regel) <> '[{"pct": 21, "incl_cents": 690, "btw_cents": 120}]'::jsonb then
        v_fouten := v_fouten || 'regels bon 1; ';
    end if;
    -- Dezelfde bon twee keer: opslaan zegt bestond, boek_bon zegt bestond; één mutatie.
    v_r := public.toonbank_journaal_opslaan(v_org, v_app, jsonb_build_array(v_m), '1.1.0');
    if v_r->'resultaten'->0->>'journaal' <> 'bestond' then v_fouten := v_fouten || 'tweede opslag niet bestond; '; end if;
    v_r := public.toonbank_boek_bon(v_j.id);
    select count(*) into v_n from public.winkel_voorraad_mutaties where idempotency_key like 'tb:' || v_b1 || ':%';
    if v_r->>'uitkomst' <> 'bestond' or v_n <> 1 or (select voorraad from public.winkel_producten where id = v_bier) <> 4 then
        v_fouten := v_fouten || format('dezelfde bon twee keer: %s, %s mutaties; ', v_r->>'uitkomst', v_n);
    end if;

    -- ── 2. Een pakket van 3 delen → 3 mutaties; een product dat twee keer in een pakket zit → één mutatie.
    v_vnr := v_vnr + 1; v_bnr := v_bnr + 1;
    v_j := pg_temp.tb_stuur(v_org, v_app, pg_temp.tb_bon('bon', v_b2, v_vnr, v_code || '-' || lpad(v_bnr::text, 6, '0'), jsonb_build_array(
        pg_temp.tb_regel(1, 'TEST pakket', 1, 1000, 21, jsonb_build_array(pg_temp.ond(v_bier, 1), pg_temp.ond(v_worst, 1), pg_temp.ond(v_kaas, 1)),
                         '{"btw": [{"pct": 21, "incl_cents": 300}, {"pct": 9, "incl_cents": 700}]}'::jsonb),
        pg_temp.tb_regel(2, 'TEST duo worst', 2, 500, 9, jsonb_build_array(pg_temp.ond(v_worst, 1), pg_temp.ond(v_worst, 1))))));
    select count(*) into v_n from public.winkel_voorraad_mutaties m join public.toonbank_bon_regels r on r.id = m.toonbank_bon_regel_id
     where r.bon_id = v_b2 and r.regelnr = 1 and m.type = 'verkoop_kassa' and m.hoeveelheid = -1;
    if v_j.verwerk_status <> 'verwerkt' or v_n <> 3 then
        v_fouten := v_fouten || format('pakket: %s, %s mutaties van regel 1 (verwacht 3); ', v_j.verwerk_status, v_n);
    end if;
    select count(*) into v_n from public.winkel_voorraad_mutaties where idempotency_key = format('tb:%s:2:%s:verkoop', v_b2, v_worst) and hoeveelheid = -4;
    if v_n <> 1 or (select voorraad from public.winkel_producten where id = v_worst) <> 5 then
        v_fouten := v_fouten || 'duo worst niet één mutatie van −4; ';
    end if;
    if (select btw from public.toonbank_bonnen where id = v_b2) <> '{"9": {"incl_cents": 1700, "btw_cents": 140}, "21": {"incl_cents": 300, "btw_cents": 52}}'::jsonb then
        v_fouten := v_fouten || 'btw pakketbon: ' || (select btw::text from public.toonbank_bonnen where id = v_b2) || '; ';
    end if;

    -- ── 3. Voorraad 1, verkoop 3 → eerst +2 tekort_correctie, dan −3 verkoop_kassa.
    v_vnr := v_vnr + 1; v_bnr := v_bnr + 1;
    v_j := pg_temp.tb_stuur(v_org, v_app, pg_temp.tb_bon('bon', v_b3, v_vnr, v_code || '-' || lpad(v_bnr::text, 6, '0'),
        jsonb_build_array(pg_temp.tb_regel(1, 'TEST amandelen', 3, 595, 9, jsonb_build_array(pg_temp.ond(v_amandel, 1))))));
    select array_agg(id order by id) into v_ids from public.winkel_voorraad_mutaties where idempotency_key like 'tb:' || v_b3 || ':%';
    if v_j.verwerk_status <> 'verwerkt' or cardinality(v_ids) <> 2
       or (select type || ' ' || hoeveelheid || ' ' || resultaat || ' ' || idempotency_key from public.winkel_voorraad_mutaties where id = v_ids[1])
          <> format('tekort_correctie 2 3 tb:%s:1:%s:tekort', v_b3, v_amandel)
       or (select type || ' ' || hoeveelheid || ' ' || resultaat || ' ' || idempotency_key from public.winkel_voorraad_mutaties where id = v_ids[2])
          <> format('verkoop_kassa -3 0 tb:%s:1:%s:verkoop', v_b3, v_amandel)
       or (select notitie from public.winkel_voorraad_mutaties where id = v_ids[1]) <> format('Bon %s r1: verkocht 3, systeem had 1', v_code || '-' || lpad(v_bnr::text, 6, '0'))
       or exists (select 1 from public.winkel_voorraad_mutaties where id = any (v_ids) and gebeurd_at is distinct from '2027-03-06T10:12:08Z'::timestamptz)
       or (select voorraad_status from public.toonbank_bon_regels where bon_id = v_b3 and regelnr = 1) <> 'tekort_gecorrigeerd'
       or (select voorraad from public.winkel_producten where id = v_amandel) <> 0 then
        v_fouten := v_fouten || 'tekort: ' || coalesce((select string_agg(type || ' ' || hoeveelheid || ' → ' || resultaat, ', ' order by id) from public.winkel_voorraad_mutaties where id = any (v_ids)), 'geen mutaties') || '; ';
    end if;

    -- ── 4. Voorraad NULL → niet_bijgehouden, geen mutatie, de bon gaat gewoon door.
    v_vnr := v_vnr + 1; v_bnr := v_bnr + 1;
    v_j := pg_temp.tb_stuur(v_org, v_app, pg_temp.tb_bon('bon', v_b4, v_vnr, v_code || '-' || lpad(v_bnr::text, 6, '0'),
        jsonb_build_array(pg_temp.tb_regel(1, 'TEST nog niet geteld', 1, 250, 9, jsonb_build_array(pg_temp.ond(v_nieuw, 1))))));
    if v_j.verwerk_status <> 'verwerkt' or not exists (select 1 from public.toonbank_bonnen where id = v_b4)
       or (select voorraad_status from public.toonbank_bon_regels where bon_id = v_b4 and regelnr = 1) <> 'niet_bijgehouden'
       or exists (select 1 from public.winkel_voorraad_mutaties where winkel_product_id = v_nieuw)
       or (select voorraad from public.winkel_producten where id = v_nieuw) is not null then
        v_fouten := v_fouten || 'niet bijgehouden: ' || row_to_json(v_j)::text || '; ';
    end if;

    -- ── 5. Tegenbon → retour; goederen_terug false → geen voorraad.
    v_vnr := v_vnr + 1; v_bnr := v_bnr + 1;
    v_j := pg_temp.tb_stuur(v_org, v_app, pg_temp.tb_bon('tegenbon', v_t1, v_vnr, v_code || '-' || lpad(v_bnr::text, 6, '0'), jsonb_build_array(
        pg_temp.tb_regel(1, 'TEST bier', -1, 345, 21, jsonb_build_array(pg_temp.ond(v_bier, 1)), '{"verwijst_naar_regelnr": 1}'::jsonb),
        pg_temp.tb_regel(2, 'TEST bier', -1, 345, 21, jsonb_build_array(pg_temp.ond(v_bier, 1)), '{"verwijst_naar_regelnr": 1, "goederen_terug": false}'::jsonb)),
        jsonb_build_object('verwijst_naar_bon_id', v_b1, 'reden', 'verkeerd aangeslagen')));
    select * into v_bon from public.toonbank_bonnen where id = v_t1;
    if v_j.verwerk_status <> 'verwerkt' or v_bon.soort <> 'tegenbon' or v_bon.verwijst_naar_bon_id <> v_b1 or v_bon.omzet_incl_cents <> -690
       or v_bon.btw <> '{"21": {"incl_cents": -690, "btw_cents": -120}}'::jsonb then
        v_fouten := v_fouten || 'tegenbon: ' || row_to_json(v_j)::text || ' / ' || coalesce(row_to_json(v_bon)::text, 'geen bon') || '; ';
    end if;
    if not exists (select 1 from public.winkel_voorraad_mutaties where idempotency_key = format('tb:%s:1:%s:retour', v_t1, v_bier) and type = 'retour' and hoeveelheid = 1)
       or exists (select 1 from public.winkel_voorraad_mutaties where idempotency_key like format('tb:%s:2:%%', v_t1))
       or (select voorraad_status from public.toonbank_bon_regels where bon_id = v_t1 and regelnr = 2) <> 'nvt'
       or (select verwijst_naar_regel_id from public.toonbank_bon_regels where bon_id = v_t1 and regelnr = 1)
          <> (select id from public.toonbank_bon_regels where bon_id = v_b1 and regelnr = 1)
       or (select voorraad from public.winkel_producten where id = v_bier) <> 4 then   -- 6 − 2 − 1 (pakket) + 1 retour
        v_fouten := v_fouten || 'retour van de tegenbon klopt niet; ';
    end if;

    -- ── 6. Een tegenbon van een andere tablet die er eerder is dan zijn bon: wacht, daarna verwerkt.
    v_j := pg_temp.tb_stuur(v_org, v_app2, pg_temp.tb_bon('tegenbon', v_t2, 1, v_code2 || '-000001', jsonb_build_array(
        pg_temp.tb_regel(1, 'TEST worst', -1, 600, 9, jsonb_build_array(pg_temp.ond(v_worst, 1)), '{"verwijst_naar_regelnr": 1}'::jsonb)),
        jsonb_build_object('verwijst_naar_bon_id', v_b6, 'reden', 'teruggebracht', 'kanaal', 'event')));
    if v_j.verwerk_status <> 'wacht' or v_j.fout_code <> 'wacht_op_bon' or exists (select 1 from public.toonbank_bonnen where id = v_t2) then
        v_fouten := v_fouten || 'tegenbon zonder bon wacht niet: ' || row_to_json(v_j)::text || '; ';
    end if;
    v_vnr := v_vnr + 1; v_bnr := v_bnr + 1;
    v_j := pg_temp.tb_stuur(v_org, v_app, pg_temp.tb_bon('bon', v_b6, v_vnr, v_code || '-' || lpad(v_bnr::text, 6, '0'),
        jsonb_build_array(pg_temp.tb_regel(1, 'TEST worst', 1, 600, 9, jsonb_build_array(pg_temp.ond(v_worst, 1))))));
    perform public.toonbank_verwerk_wachtrij(v_org, v_app2);
    select * into v_j from public.toonbank_journaal where organization_id = v_org and gebeurtenis_id = v_t2;
    if v_j.verwerk_status <> 'verwerkt' or v_j.fout_code is not null
       or not exists (select 1 from public.winkel_voorraad_mutaties where idempotency_key = format('tb:%s:1:%s:retour', v_t2, v_worst)) then
        v_fouten := v_fouten || 'tegenbon na zijn bon: ' || row_to_json(v_j)::text || '; ';
    end if;
    -- In één batch: de tegenbon vóór zijn bon (ronde 2 van de wachtrij).
    v_vnr := v_vnr + 2; v_bnr := v_bnr + 2;
    perform public.toonbank_journaal_opslaan(v_org, v_app, jsonb_build_array(
        pg_temp.tb_bon('tegenbon', v_t3, v_vnr - 1, v_code || '-' || lpad((v_bnr - 1)::text, 6, '0'), jsonb_build_array(
            pg_temp.tb_regel(1, 'TEST kaas', -1, 700, 9, jsonb_build_array(pg_temp.ond(v_kaas, 1)), '{"verwijst_naar_regelnr": 1}'::jsonb)),
            jsonb_build_object('verwijst_naar_bon_id', v_b7, 'reden', 'test')),
        pg_temp.tb_bon('bon', v_b7, v_vnr, v_code || '-' || lpad(v_bnr::text, 6, '0'),
            jsonb_build_array(pg_temp.tb_regel(1, 'TEST kaas', 1, 700, 9, jsonb_build_array(pg_temp.ond(v_kaas, 1)))))), '1.1.0');
    v_r := public.toonbank_verwerk_wachtrij(v_org, v_app);
    if (select verwerk_status from public.toonbank_journaal where organization_id = v_org and gebeurtenis_id = v_t3) <> 'verwerkt'
       or (select verwerk_status from public.toonbank_journaal where organization_id = v_org and gebeurtenis_id = v_b7) <> 'verwerkt' then
        v_fouten := v_fouten || 'tegenbon vóór zijn bon in één batch: ' || v_r::text || '; ';
    end if;

    -- ── 7. De btw-regel: 3 × € 3,95 op één bon = 206 (één keer afgerond), niet 3 × 69.
    v_vnr := v_vnr + 1; v_bnr := v_bnr + 1;
    perform pg_temp.tb_stuur(v_org, v_app, pg_temp.tb_bon('bon', v_b8, v_vnr, v_code || '-' || lpad(v_bnr::text, 6, '0'),
        jsonb_build_array(pg_temp.tb_regel(1, 'TEST bier', 3, 395, 21, jsonb_build_array(pg_temp.ond(v_bier, 1))))));
    v_vnr := v_vnr + 1; v_bnr := v_bnr + 1;
    perform pg_temp.tb_stuur(v_org, v_app, pg_temp.tb_bon('bon', v_b9, v_vnr, v_code || '-' || lpad(v_bnr::text, 6, '0'),
        jsonb_build_array(pg_temp.tb_regel(1, 'TEST bier', 1, 395, 21, jsonb_build_array(pg_temp.ond(v_bier, 1))))));
    if (select btw->'21'->>'btw_cents' from public.toonbank_bonnen where id = v_b8) <> '206'
       or (select btw->'21'->>'btw_cents' from public.toonbank_bonnen where id = v_b9) <> '69' then
        v_fouten := v_fouten || 'btw-regel: ' || (select string_agg(btw::text, ' / ') from public.toonbank_bonnen where id in (v_b8, v_b9)) || '; ';
    end if;

    -- ── 8. Een geannuleerde bon wordt bewaard, maar boekt niets. Precies zoals kern hem
    --    maakt (maakGeannuleerdeBon): de regels die er nog op stonden, geen betaling,
    --    totaal 0 (review M2 K1). Die hoort niet in Te controleren.
    v_vnr := v_vnr + 1; v_bnr := v_bnr + 1;
    select count(*) into v_n from public.winkel_voorraad_mutaties where winkel_product_id = v_bier;
    v_m := jsonb_build_array(pg_temp.tb_regel(1, 'TEST bier', 1, 345, 21, jsonb_build_array(pg_temp.ond(v_bier, 1)), '{"alcohol": true}'::jsonb));
    v_j := pg_temp.tb_stuur(v_org, v_app, pg_temp.tb_bon('bon', v_b11, v_vnr, v_code || '-' || lpad(v_bnr::text, 6, '0'), v_m,
        jsonb_build_object('status', 'geannuleerd', 'regels', v_m, 'totaal_cents', 0, 'afronding_cents', 0, 'leeftijd', null)));
    if v_j.verwerk_status <> 'verwerkt' or v_j.fout_code is not null
       or (select status from public.toonbank_bonnen where id = v_b11) <> 'geannuleerd'
       or (select count(*) from public.toonbank_bon_regels where bon_id = v_b11 and soort = 'betaling') <> 0
       or (select count(*) from public.winkel_voorraad_mutaties where winkel_product_id = v_bier) <> v_n
       or (select voorraad_status from public.toonbank_bon_regels where bon_id = v_b11 and regelnr = 1) <> 'nvt'
       or (select leeftijd_vastgesteld from public.toonbank_bonnen where id = v_b11) is not null then
        v_fouten := v_fouten || 'geannuleerde bon (kern-vorm): ' || row_to_json(v_j)::text || '; ';
    end if;
    -- Een geannuleerde bon waarop tóch betaald is: dat wel in Te controleren, en nog steeds niets geboekt.
    v_vnr := v_vnr + 1; v_bnr := v_bnr + 1;
    v_j := pg_temp.tb_stuur(v_org, v_app, pg_temp.tb_bon('bon', v_b11b, v_vnr, v_code || '-' || lpad(v_bnr::text, 6, '0'), v_m,
        '{"status": "geannuleerd"}'::jsonb));
    if v_j.verwerk_status <> 'conflict' or v_j.fout_code <> 'geannuleerd_betaald'
       or (select count(*) from public.winkel_voorraad_mutaties where winkel_product_id = v_bier) <> v_n then
        v_fouten := v_fouten || 'geannuleerde bon met betaling: ' || row_to_json(v_j)::text || '; ';
    end if;

    -- ── 9. Wat niet klopt wordt conflict, maar de bon en de voorraad zijn geboekt.
    v_vnr := v_vnr + 1; v_bnr := v_bnr + 1;
    v_j := pg_temp.tb_stuur(v_org, v_app, pg_temp.tb_bon('bon', v_b12, v_vnr, v_code || '-' || lpad(v_bnr::text, 6, '0'),
        jsonb_build_array(pg_temp.tb_regel(1, 'TEST worst', 1, 600, 9, jsonb_build_array(pg_temp.ond(v_worst, 1)))),
        '{"totaal_cents": 999}'::jsonb));
    if v_j.verwerk_status <> 'conflict' or v_j.fout_code <> 'totaal' or not exists (select 1 from public.toonbank_bonnen where id = v_b12)
       or not exists (select 1 from public.winkel_voorraad_mutaties where idempotency_key = format('tb:%s:1:%s:verkoop', v_b12, v_worst)) then
        v_fouten := v_fouten || 'conflict totaal: ' || row_to_json(v_j)::text || '; ';
    end if;
    -- Statiegeld en order_rest: geen omzet; een rest op een onbekende order = conflict.
    v_vnr := v_vnr + 1; v_bnr := v_bnr + 1;
    v_j := pg_temp.tb_stuur(v_org, v_app, pg_temp.tb_bon('bon', v_b13, v_vnr, v_code || '-' || lpad(v_bnr::text, 6, '0'), jsonb_build_array(
        pg_temp.tb_regel(1, 'TEST worst', 1, 600, 9, jsonb_build_array(pg_temp.ond(v_worst, 1))),
        jsonb_build_object('regelnr', 2, 'soort', 'statiegeld', 'hoort_bij_regelnr', 1, 'product_id', v_worst, 'aantal', 1, 'stuk_cents', 15, 'bedrag_cents', 15),
        jsonb_build_object('regelnr', 3, 'soort', 'order_rest', 'order_id', 999999999, 'nummer', 'E2E-TEST', 'bedrag_cents', 450))));
    select * into v_bon from public.toonbank_bonnen where id = v_b13;
    if v_j.verwerk_status <> 'conflict' or v_j.fout_code <> 'order_onbekend'
       or v_bon.omzet_incl_cents <> 600 or v_bon.statiegeld_cents <> 15 or v_bon.order_rest_cents <> 450 or v_bon.totaal_cents <> 1065
       or v_bon.btw <> '{"9": {"incl_cents": 600, "btw_cents": 50}}'::jsonb then
        v_fouten := v_fouten || 'statiegeld/order_rest: ' || row_to_json(v_j)::text || '; ';
    end if;
    -- Alcohol zonder leeftijd: conflict. Met leeftijd: leeftijd_vastgesteld.
    v_vnr := v_vnr + 1; v_bnr := v_bnr + 1;
    v_j := pg_temp.tb_stuur(v_org, v_app, pg_temp.tb_bon('bon', v_b14, v_vnr, v_code || '-' || lpad(v_bnr::text, 6, '0'),
        jsonb_build_array(pg_temp.tb_regel(1, 'TEST bier', 1, 345, 21, jsonb_build_array(pg_temp.ond(v_bier, 1)), '{"alcohol": true}'::jsonb))));
    if v_j.verwerk_status <> 'conflict' or v_j.fout_code <> 'leeftijd_ontbreekt'
       or (select leeftijd_vastgesteld from public.toonbank_bonnen where id = v_b14) is not false then
        v_fouten := v_fouten || 'alcohol zonder leeftijd: ' || row_to_json(v_j)::text || '; ';
    end if;
    v_vnr := v_vnr + 1; v_bnr := v_bnr + 1;
    v_j := pg_temp.tb_stuur(v_org, v_app, pg_temp.tb_bon('bon', v_b15, v_vnr, v_code || '-' || lpad(v_bnr::text, 6, '0'),
        jsonb_build_array(pg_temp.tb_regel(1, 'TEST bier', 1, 345, 21, jsonb_build_array(pg_temp.ond(v_bier, 1)), '{"alcohol": true}'::jsonb)),
        '{"leeftijd": {"uitkomst": "vastgesteld", "at": "2027-03-06T11:11:40+01:00"}}'::jsonb));
    if v_j.verwerk_status <> 'verwerkt' or (select leeftijd_vastgesteld from public.toonbank_bonnen where id = v_b15) is not true
       or (select leeftijd_vastgesteld_at from public.toonbank_bonnen where id = v_b15) <> '2027-03-06T10:11:40Z'::timestamptz then
        v_fouten := v_fouten || 'alcohol met leeftijd: ' || row_to_json(v_j)::text || '; ';
    end if;

    -- ── 10. Een verwerkte bon verandert niet meer; alleen dagstaat_id (BA-10).
    begin
        update public.toonbank_bonnen set totaal_cents = 0 where id = v_b1;
        v_fouten := v_fouten || 'bon te wijzigen; ';
    exception when sqlstate 'TB002' then null;
    end;
    begin
        delete from public.toonbank_bon_regels where bon_id = v_b1;
        v_fouten := v_fouten || 'bonregel te verwijderen; ';
    exception when sqlstate 'TB002' then null;
    end;
    begin
        update public.toonbank_bon_regels set naam = 'anders' where bon_id = v_b1 and regelnr = 1;
        v_fouten := v_fouten || 'bonregel te wijzigen; ';
    exception when sqlstate 'TB002' then null;
    end;
    begin
        update public.toonbank_bonnen set dagstaat_id = gen_random_uuid() where id = v_b1;
    exception
        when sqlstate 'TB002' then v_fouten := v_fouten || 'dagstaat_id niet te zetten; ';
        when foreign_key_violation then null;   -- de trigger liet hem door (BA-10: foreign key naar de dagstaat)
    end;

    -- ── 11. Het logboek op de tijd van de bon; geboekt_at is nu.
    if not exists (select 1 from public.voorraad_logboek
                    where organization_id = v_org and item_id = v_bier::text and type = 'verkoop_kassa'
                      and created_at = '2027-03-06T10:12:08Z'::timestamptz and gebeurd_at = created_at and geboekt_at > '2026-01-01') then
        v_fouten := v_fouten || 'logboek niet op de tijd van de bon; ';
    end if;
    if not exists (select 1 from public.voorraad_logboek where organization_id = v_org and item_id = v_amandel::text and type = 'tekort_correctie' and hoeveelheid = 2) then
        v_fouten := v_fouten || 'tekort_correctie niet in het logboek; ';
    end if;

    -- ── 12. Het tekortslot is na de bon weer dicht; buiten een bon geen tekortcorrectie.
    if coalesce(current_setting('app.winkel_tekort', true), '') <> '' then v_fouten := v_fouten || 'tekortslot staat nog open; '; end if;
    begin
        perform public.winkel_muteer_voorraad(v_org, v_worst, 'tekort_correctie', 1);
        v_fouten := v_fouten || 'tekort_correctie buiten een bon; ';
    exception when sqlstate 'WV005' then null;
    end;
    begin
        perform set_config('app.winkel_tekort', 'aan', true);
        perform public.winkel_muteer_voorraad(v_org, v_worst, 'tekort_correctie', -1);
        v_fouten := v_fouten || 'negatieve tekort_correctie; ';
    exception when sqlstate 'WV005' then null;
    end;
    perform set_config('app.winkel_tekort', '', true);

    -- ── 13. vrij_overschreden: goedkeuring, hergebruik, offline, en wie komt tekort (nieuwste order eerst).
    insert into public.winkel_producten (organization_id, naam, type, eenheid, prijs_per, winkelprijs_incl_cents, btw_pct, alcohol)
    values (v_org, 'TEST Naober vrij ' || v_sfx, 'bier', 'stuk', 1, 345, 21, true) returning id into v_naober;
    perform public.winkel_muteer_voorraad(v_org, v_naober, 'telling', 6);
    insert into public.winkel_artikelen (organization_id, slug, naam, prijs_cents, btw_pct, actief, kanalen)
    values (v_org, 'test-bb-naober-' || v_sfx, 'TEST Naober', 345, 21, true, array['webshop', 'toonbank']) returning id into v_a_naober;
    insert into public.winkel_artikel_slots (organization_id, artikel_id, volgorde, slot_type, naam, hoeveelheid, eenheid, per, standaard_product_id)
    values (v_org, v_a_naober, 0, 'bier', 'Naober', 1, 'stuk', 'stuk', v_naober);
    insert into public.winkel_momenten (organization_id, groep, datum, van, tot, capaciteit, actief)
    values (v_org, 'test-boekbon', (now() at time zone 'Europe/Amsterdam')::date + 3, '14:00', '17:00', null, true) returning id into v_moment;
    v_o := public.winkel_plaats_order(v_org, 'test-sleutel-' || gen_random_uuid(), 'test-token-' || gen_random_uuid(), 'afhalen', v_moment,
        'Jansen', 'j@example.invalid', null, null, null, 1380, 0, 1380, '{}'::jsonb, 'https://example.invalid',
        jsonb_build_array(jsonb_build_object('artikel_id', v_a_naober, 'slug', 'test-bb-naober', 'naam', 'TEST Naober', 'aantal', 4, 'eenheid', 'per stuk',
            'stuk_cents', 345, 'bedrag_cents', 1380, 'btw_pct', 21, 'eenheden', 1, 'voorraad_eenheden', 0, 'alcohol', true,
            'componenten', jsonb_build_array(jsonb_build_object('product_id', v_naober, 'slot_type', 'bier', 'naam', 'Naober', 'hoeveelheid', 4, 'eenheid', 'stuk')))));
    update public.winkel_orders set status = 'betaald', betaald_at = now() where id = v_o.id;
    v_o1 := v_o.id;
    v_o := public.winkel_plaats_order(v_org, 'test-sleutel-' || gen_random_uuid(), 'test-token-' || gen_random_uuid(), 'afhalen', v_moment,
        'Pietersen', 'p@example.invalid', null, null, null, 690, 0, 690, '{}'::jsonb, 'https://example.invalid',
        jsonb_build_array(jsonb_build_object('artikel_id', v_a_naober, 'slug', 'test-bb-naober', 'naam', 'TEST Naober', 'aantal', 2, 'eenheid', 'per stuk',
            'stuk_cents', 345, 'bedrag_cents', 690, 'btw_pct', 21, 'eenheden', 1, 'voorraad_eenheden', 0, 'alcohol', true,
            'componenten', jsonb_build_array(jsonb_build_object('product_id', v_naober, 'slot_type', 'bier', 'naam', 'Naober', 'hoeveelheid', 2, 'eenheid', 'stuk')))));
    update public.winkel_orders set status = 'betaald', betaald_at = now() where id = v_o.id;
    v_o2 := v_o.id;
    -- Aan de toonbank 3 verkocht terwijl alles gereserveerd was: ligt er 3, gereserveerd 6, vrij −3.
    v_vnr := v_vnr + 1; v_bnr := v_bnr + 1;
    perform pg_temp.tb_stuur(v_org, v_app, pg_temp.tb_bon('bon', v_bn, v_vnr, v_code || '-' || lpad(v_bnr::text, 6, '0'),
        jsonb_build_array(pg_temp.tb_regel(1, 'TEST Naober', 3, 345, 21, jsonb_build_array(pg_temp.ond(v_naober, 1)), '{"alcohol": true}'::jsonb)),
        '{"leeftijd": {"uitkomst": "vastgesteld", "at": "2027-03-06T11:11:40+01:00"}}'::jsonb));
    insert into public.toonbank_sessies (organization_id, apparaat_id, medewerker_id, token_hash, rol, doel, geldig_tot)
    values (v_org, v_app, v_eig, encode(sha256(convert_to(gen_random_uuid()::text, 'UTF8')), 'hex'), 'eigenaar', 'vrij_overschrijden', now() + interval '60 seconds')
    returning id into v_s1;
    insert into public.toonbank_sessies (organization_id, apparaat_id, medewerker_id, token_hash, rol, doel, geldig_tot)
    values (v_org, v_app, v_eig, encode(sha256(convert_to(gen_random_uuid()::text, 'UTF8')), 'hex'), 'eigenaar', 'vrij_overschrijden', now() + interval '60 seconds')
    returning id into v_s2;

    v_vnr := v_vnr + 1;
    v_j := pg_temp.tb_stuur(v_org, v_app, jsonb_build_object('soort', 'vrij_overschreden', 'gebeurtenis_id', v_vo1, 'volgnummer', v_vnr,
        'moment', '2027-03-06T11:12:08+01:00', 'medewerker_id', v_mw, 'bon_id', v_bn, 'regelnr', 1, 'product_id', v_naober,
        'vrij_volgens_tablet', 0, 'verkocht', 3, 'boven_vrij', 3, 'voorraad_versie', 1, 'reden', 'klant stond te wachten',
        'modus', 'online', 'eigenaar_medewerker_id', v_eig, 'goedkeuring_ids', jsonb_build_array(v_s1)));
    if v_j.verwerk_status <> 'conflict' or v_j.fout_code <> 'order_komt_tekort'
       or v_j.resultaat->'orders_tekort' <> jsonb_build_array(
              jsonb_build_object('order_id', v_o2, 'nummer', (select nummer from public.winkel_orders where id = v_o2), 'tekort', 2.000),
              jsonb_build_object('order_id', v_o1, 'nummer', (select nummer from public.winkel_orders where id = v_o1), 'tekort', 1.000))
       or (select gebruikt_gebeurtenis_id from public.toonbank_sessies where id = v_s1) <> v_vo1 then
        v_fouten := v_fouten || 'vrij_overschreden online: ' || row_to_json(v_j)::text || '; ';
    end if;
    -- Dezelfde goedkeuring voor een andere melding: ongeldig.
    v_vnr := v_vnr + 1;
    v_j := pg_temp.tb_stuur(v_org, v_app, jsonb_build_object('soort', 'vrij_overschreden', 'gebeurtenis_id', v_vo2, 'volgnummer', v_vnr,
        'moment', '2027-03-06T11:13:08+01:00', 'medewerker_id', v_mw, 'bon_id', v_b1, 'regelnr', 1, 'product_id', v_bier,
        'vrij_volgens_tablet', 0, 'verkocht', 1, 'boven_vrij', 1, 'voorraad_versie', 1, 'reden', 'nog een',
        'modus', 'online', 'eigenaar_medewerker_id', v_eig, 'goedkeuring_ids', jsonb_build_array(v_s1)));
    if v_j.verwerk_status <> 'conflict' or v_j.fout_code <> 'goedkeuring_ongeldig' then
        v_fouten := v_fouten || 'hergebruikte goedkeuring: ' || row_to_json(v_j)::text || '; ';
    end if;
    -- Offline: ter goedkeuring.
    v_vnr := v_vnr + 1;
    v_j := pg_temp.tb_stuur(v_org, v_app, jsonb_build_object('soort', 'vrij_overschreden', 'gebeurtenis_id', v_vo3, 'volgnummer', v_vnr,
        'moment', '2027-03-06T11:14:08+01:00', 'medewerker_id', v_mw, 'bon_id', v_b1, 'regelnr', 1, 'product_id', v_bier,
        'vrij_volgens_tablet', 0, 'verkocht', 1, 'boven_vrij', 1, 'voorraad_versie', 1, 'reden', 'geen internet',
        'modus', 'offline', 'eigenaar_medewerker_id', null, 'goedkeuring_ids', '[]'::jsonb));
    if v_j.verwerk_status <> 'conflict' or v_j.fout_code <> 'goedkeuring_nodig' then
        v_fouten := v_fouten || 'offline boven vrij: ' || row_to_json(v_j)::text || '; ';
    end if;
    -- Een goede goedkeuring op een product zonder tekort: verwerkt.
    v_vnr := v_vnr + 1;
    v_j := pg_temp.tb_stuur(v_org, v_app, jsonb_build_object('soort', 'vrij_overschreden', 'gebeurtenis_id', v_vo4, 'volgnummer', v_vnr,
        'moment', '2027-03-06T11:15:08+01:00', 'medewerker_id', v_mw, 'bon_id', v_b1, 'regelnr', 1, 'product_id', v_bier,
        'vrij_volgens_tablet', 0, 'verkocht', 1, 'boven_vrij', 1, 'voorraad_versie', 1, 'reden', 'laatste',
        'modus', 'online', 'eigenaar_medewerker_id', v_eig, 'goedkeuring_ids', jsonb_build_array(v_s2)));
    if v_j.verwerk_status <> 'verwerkt' or (select gebruikt_gebeurtenis_id from public.toonbank_sessies where id = v_s2) <> v_vo4 then
        v_fouten := v_fouten || 'goede goedkeuring: ' || row_to_json(v_j)::text || '; ';
    end if;

    -- ── 14. Rechten op de tabellen.
    if has_table_privilege('anon', 'public.toonbank_bonnen', 'SELECT') or has_table_privilege('authenticated', 'public.toonbank_bonnen', 'INSERT')
       or has_table_privilege('service_role', 'public.toonbank_bon_regels', 'UPDATE')
       or not has_table_privilege('authenticated', 'public.toonbank_bon_regels', 'SELECT') then
        v_fouten := v_fouten || 'tabelrechten bonnen kloppen niet; ';
    end if;

    if v_fouten <> '' then raise exception 'FOUT: %', v_fouten; end if;
    raise exception 'GESLAAGD: bon 2 × bier = één verkoop_kassa −2 op de tijd van de bon, btw 690/120; dezelfde bon twee keer = bestond en één mutatie; pakket van 3 delen = 3 mutaties, dubbel onderdeel = één mutatie −4, btw 21/9 = 52/140; voorraad 1 verkoop 3 = +2 tekort_correctie dan −3; NULL = niet_bijgehouden; tegenbon = retour +1 (goederen_terug false = niets), wacht op zijn bon (ook in één batch); btw 3 × 3,95 = 206, 1 × 3,95 = 69; geannuleerd (kern-vorm: regels, geen betaling, totaal 0) = verwerkt en boekt niets, geannuleerd met betaling = geannuleerd_betaald; totaal/order_rest/leeftijd = conflict maar geboekt; bon en regels vast (TB002); logboek op gebeurd_at; tekortslot dicht; vrij_overschreden: goedkeuring één keer, offline ter goedkeuring, order komt tekort 2 + 1 (nieuwste eerst) — alles teruggedraaid';
end $$;
