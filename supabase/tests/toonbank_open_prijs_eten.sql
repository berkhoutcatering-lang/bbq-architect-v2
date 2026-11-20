-- Test voor 20261120140000_toonbank_open_prijs_eten: de kassa krijgt een groep
-- "Open prijs eten" (open_prijs, 9% btw, geen alcohol) en een bon met een open prijs
-- in die groep wordt gewoon geboekt.
-- Draait in één transactie die aan het eind wordt teruggedraaid.
--
-- ALLEEN op de dev-database, nooit op live en nooit met --linked:
--   npm --prefix tools/testdb run test -- toonbank_open_prijs_eten
-- Vereist de seed supabase/tests/seed_vier_naober.sql.
--
-- Verwacht: "GESLAAGD: ..." als EXCEPTION.

create function pg_temp.bon(p_soort text, p_gid uuid, p_volgnr bigint, p_bonnummer text, p_regels jsonb, p_extra jsonb default '{}')
returns jsonb language sql as $$
    select jsonb_build_object('soort', p_soort, 'gebeurtenis_id', p_gid, 'volgnummer', p_volgnr, 'moment', now() - interval '1 hour',
        'medewerker_id', null, 'bon_id', p_gid, 'bonnummer', p_bonnummer, 'bon_volgnummer', split_part(p_bonnummer, '-', 2)::int,
        'status', 'afgerond', 'kanaal', 'winkel', 'catalogus_versie', 1, 'leeftijd', null,
        'regels', p_regels || jsonb_build_array(jsonb_build_object('regelnr', 99, 'soort', 'betaling', 'betaalmethode', 'pin',
            'betaal_bevestiging', 'handmatig', 'bedrag_cents', (select coalesce(sum((r->>'bedrag_cents')::int), 0) from jsonb_array_elements(p_regels) r))),
        'totaal_cents', (select coalesce(sum((r->>'bedrag_cents')::int), 0) from jsonb_array_elements(p_regels) r),
        'afronding_cents', 0) || p_extra
$$;

create function pg_temp.stuur(p_org uuid, p_app uuid, p_m jsonb)
returns public.toonbank_journaal language plpgsql as $$
declare
    v public.toonbank_journaal;
begin
    perform public.toonbank_journaal_opslaan(p_org, p_app, jsonb_build_array(p_m), '1.4.0');
    perform public.toonbank_verwerk_wachtrij(p_org, p_app);
    select * into v from public.toonbank_journaal where organization_id = p_org and gebeurtenis_id = (p_m->>'gebeurtenis_id')::uuid;
    return v;
end $$;

do $$
declare
    v_org    uuid;
    v_sfx    text := substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);
    v_hash   text := repeat('a', 32) || ':' || repeat('b', 128);
    v_app    uuid;
    v_r      jsonb;
    v_g      jsonb;
    v_b      uuid := gen_random_uuid();
    v_j      public.toonbank_journaal%rowtype;
    v_regel  public.toonbank_bon_regels%rowtype;
    v_fouten text := '';
begin
    select id into v_org from public.organizations where slug = 'e2e-hop-en-bites';
    if v_org is null then
        raise exception 'GEWEIGERD: organisatie e2e-hop-en-bites bestaat niet. Deze test draait alleen op de dev-database, na de seed.';
    end if;
    v_r := public.toonbank_apparaat_nieuw(v_org, 'TEST open prijs ' || v_sfx, 'winkel', v_hash);
    v_app := (v_r->>'apparaat_id')::uuid;

    -- ── 1. De groep staat achteraan in de catalogus.
    v_r := public.toonbank_catalogus(v_org);
    select g into v_g from jsonb_array_elements(v_r->'groepen') g where g->>'groep_id' = 'open-eten';
    if v_g is null or v_g->>'naam' <> 'Open prijs eten' or not (v_g->>'open_prijs')::boolean
       or (v_g->>'btw_pct')::int <> 9 or (v_g->>'alcohol')::boolean
       or (v_g->>'volgorde')::int <> (select max((g->>'volgorde')::int) from jsonb_array_elements(v_r->'groepen') g) then
        v_fouten := v_fouten || 'groep: ' || coalesce(v_g::text, 'ontbreekt') || '; ';
    end if;
    if (select count(*) from jsonb_array_elements(v_r->'groepen') g where (g->>'open_prijs')::boolean) <> 1 then
        v_fouten := v_fouten || 'meer dan één open-prijsgroep; ';
    end if;
    if exists (select 1 from jsonb_array_elements(v_r->'artikelen') a where a->>'groep_id' = 'open-eten') then
        v_fouten := v_fouten || 'artikelen in de open groep; ';
    end if;

    -- ── 2. Een bon met een kadopakket van € 37,50 als open prijs: geboekt, 9% btw, geen artikel.
    v_j := pg_temp.stuur(v_org, v_app, pg_temp.bon('bon', v_b, 1, 'T1-000001', jsonb_build_array(
        jsonb_build_object('regelnr', 1, 'soort', 'verkoop', 'artikel_id', null, 'open_prijs_groep', 'open-eten',
            'naam', 'Kadopakket', 'aantal', 1, 'stuk_cents', 3750, 'korting_cents', 0, 'bedrag_cents', 3750,
            'btw', jsonb_build_array(jsonb_build_object('pct', 9, 'incl_cents', 3750)),
            'alcohol', false, 'onderdelen', '[]'::jsonb, 'prijs_bron', 'open_prijs'))));
    select * into v_regel from public.toonbank_bon_regels
     where organization_id = v_org and regelnr = 1 and bon_id = (select id from public.toonbank_bonnen where organization_id = v_org and bonnummer = 'T1-000001');
    if v_j.verwerk_status <> 'verwerkt' or v_regel.id is null or v_regel.prijs_bron <> 'open_prijs'
       or v_regel.open_prijs_groep <> 'open-eten' or v_regel.artikel_id is not null or v_regel.bedrag_cents <> 3750 then
        v_fouten := v_fouten || 'bon niet geboekt: ' || coalesce(v_j.verwerk_status, '?') || ' ' || coalesce(v_j.fout_code, '') || ' ' || coalesce(to_jsonb(v_regel)::text, 'geen regel') || '; ';
    end if;

    if v_fouten <> '' then raise exception 'FOUT: %', v_fouten; end if;
    raise exception 'GESLAAGD: groep Open prijs eten achteraan (open_prijs, 9%%, geen alcohol, geen artikelen); bon met een open prijs in die groep geboekt — alles teruggedraaid';
end $$;
