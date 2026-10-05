-- Handmatige test voor voorraad toevoegen (W2b). Draait in een transactie die
-- aan het eind wordt teruggedraaid.
--
--   npx supabase db query --linked -o table -f supabase/tests/voorraad_invoer.sql
--
-- Verwacht: "GESLAAGD: ..." als EXCEPTION (zie partij_afronden.sql).
--
-- "Klaar wanneer" uit de opdracht: "2 × krat bier (24)" wordt 48 flesjes in
-- de winkel, pas na bevestigen geboekt; de koppeling wordt onthouden; een
-- geboekt concept kan niet nog eens geboekt of gewijzigd worden.

do $$
declare
    v_org    uuid;
    v_bier   uuid;
    v_inv    uuid;
    v_regel  uuid;
    v_r      jsonb;
    v_n      numeric;
    v_k      record;
    v_fouten text := '';
begin
    select organization_id into v_org from public.winkel_instellingen limit 1;
    if v_org is null then raise exception 'geen organisatie met een winkel om mee te testen'; end if;

    insert into public.winkel_producten (organization_id, naam, type, eenheid, prijs_per)
    values (v_org, 'TEST Hertog Jan ' || gen_random_uuid(), 'bier', 'stuk', 1) returning id into v_bier;
    perform public.winkel_muteer_voorraad(v_org, v_bier, 'telling', 10);

    insert into public.voorraad_invoer (organization_id, bron, leverancier_naam, prijzen_incl_btw)
    values (v_org, 'foto', 'TEST Bidfood', false) returning id into v_inv;
    insert into public.voorraad_invoer_regels (organization_id, invoer_id, bron_naam, bron_aantal, bron_eenheid, bron_prijs_cents, btw_pct, plek, winkel_product_id, omrekening, aantal)
    values (v_org, v_inv, 'Krat bier (24)', 2, 'krat', 2160, 21, 'winkel', v_bier, 24, 48) returning id into v_regel;

    -- Nog niets geboekt.
    select voorraad into v_n from public.winkel_producten where id = v_bier;
    if v_n <> 10 then v_fouten := v_fouten || 'voorraad veranderde vóór boeken; '; end if;

    v_r := public.voorraad_invoer_boeken(v_org, v_inv);
    select voorraad into v_n from public.winkel_producten where id = v_bier;
    if v_n <> 58 then v_fouten := v_fouten || 'na boeken ' || v_n || ' i.p.v. 58; '; end if;
    -- € 21,60 per krat / 24 = 90 cent per flesje.
    if (select inkoop_excl_cents from public.winkel_producten where id = v_bier) <> 90 then
        v_fouten := v_fouten || 'inkoop niet 90 cent per flesje; ';
    end if;

    select * into v_k from public.voorraad_invoer_koppelingen
     where organization_id = v_org and sleutel = 'lev:-:krat bier (24)';
    if v_k is null or v_k.omrekening <> 24 or v_k.winkel_product_id <> v_bier then
        v_fouten := v_fouten || 'koppeling niet onthouden; ';
    end if;

    begin
        perform public.voorraad_invoer_boeken(v_org, v_inv);
        v_fouten := v_fouten || 'dubbel boeken niet geweigerd; ';
    exception when sqlstate 'WV008' then null;
    end;
    begin
        update public.voorraad_invoer_regels set aantal = 99 where id = v_regel;
        v_fouten := v_fouten || 'geboekte regel nog te wijzigen; ';
    exception when sqlstate 'WV008' then null;
    end;

    -- Een concept met een regel zonder product boekt niets.
    insert into public.voorraad_invoer (organization_id, bron) values (v_org, 'handmatig') returning id into v_inv;
    insert into public.voorraad_invoer_regels (organization_id, invoer_id, bron_naam, bron_aantal, aantal, plek)
    values (v_org, v_inv, 'Onbekend', 1, 1, 'winkel');
    begin
        perform public.voorraad_invoer_boeken(v_org, v_inv);
        v_fouten := v_fouten || 'regel zonder product niet geweigerd; ';
    exception when sqlstate 'WV009' then null;
    end;

    if v_fouten <> '' then raise exception 'FOUT: %', v_fouten; end if;
    raise exception 'GESLAAGD: 2 × krat (24) = 48 flesjes pas na boeken, inkoop € 0,90 per flesje, koppeling onthouden, dubbel boeken en wijzigen na boeken geweigerd — alles teruggedraaid';
end $$;
