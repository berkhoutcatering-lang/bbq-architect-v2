-- ════════════════════════════════════════════════════════════════════════════
--  SMOKE-TEST — extension_v2_apply_checkpoint (PROD-VEILIG: rolt alles terug)
--
--  Maakt een throwaway-run + één "2,5 kg voor €22,50"-product, roept de RPC
--  TWEE keer aan met dezelfde idempotency-key, en controleert:
--    • ACK1: accepted=1, duplicateReplay=false
--    • ACK2: duplicateReplay=true          (replay → géén dubbel werk)
--    • supplier_products = 1               (geen duplicaat)
--    • current price      = 1, per_kg = 9  (deterministische prijs)
--
--  Aan het eind wordt EXPRES een exception geworpen → de hele transactie rolt
--  terug. Er blijft NIETS op productie staan. Zie je "SMOKETEST-OK ✅ ..." dan
--  is de RPC end-to-end correct. Zie je een ándere fout, dan wijst die de
--  probleemregel in de RPC aan.
-- ════════════════════════════════════════════════════════════════════════════
do $$
declare
  v_org uuid; v_lev int; v_run uuid; v_task uuid;
  v_dec jsonb; v_r1 jsonb; v_r2 jsonb;
  v_sp int; v_price int; v_kg numeric; v_verdict text;
begin
  select id, organization_id into v_lev, v_org
    from public.leveranciers where organization_id is not null limit 1;
  if v_org is null then raise exception 'Geen leverancier met organisatie gevonden om mee te testen'; end if;

  insert into public.leverancier_sync_runs(organization_id, leverancier_id, status, mode, adapter_key, adapter_version, supplier_account_key)
    values (v_org, v_lev, 'running', 'full', 'baktotaal', '1.0.0', 'main') returning id into v_run;

  insert into public.supplier_sync_tasks(organization_id, run_id, supplier_id, idempotency_key, task_type, status)
    values (v_org, v_run, v_lev, 'smoke-task', 'category_page', 'claimed') returning id into v_task;

  v_dec := jsonb_build_array(jsonb_build_object(
    'raw_hash','smoke-hash-1',
    'validation_status','accepted',
    'validation_codes', jsonb_build_array(),
    'identity_key','smoke-ident-1',
    'pack_variant_key','pack:package|1|2.5|kg||',
    'observation', jsonb_build_object(
      'supplier_id', v_lev, 'supplier_account_key','main', 'supplier_sku','SMOKE-P123', 'ean', null,
      'product_name','SMOKETEST procureur 2,5kg', 'description', null, 'category','Test',
      'product_url','https://www.baktotaal.nl/product/smoke',
      'currency','EUR','tax_mode','ex_vat','vat_pct','9','price_basis','package',
      'pack_count','1','content_per_item_quantity','2.5','content_per_item_unit','kg',
      'variable_weight', false, 'package_description_raw','Zak 2,5 kg',
      'captured_at', now(), 'extraction_method','dom_adapter','adapter_key','baktotaal','adapter_version','1.0.0',
      'source_cursor', null, 'field_confidence','{}'::jsonb, 'raw_record','{}'::jsonb, 'source','extension'
    ),
    'price', jsonb_build_object(
      'effective_price_ex_vat','22.50','effective_price_cents',2250,'unit','kg',
      'total_base_quantity',2500,'base_unit','g','price_basis','package',
      'regular_price_ex_vat','22.50','promo_price_ex_vat', null,
      'price_per_kg_ex_vat',9,'price_per_liter_ex_vat', null,'price_per_piece_ex_vat', null
    ),
    'review_payload','{}'::jsonb
  ));

  v_r1 := public.extension_v2_apply_checkpoint(v_org, v_run, v_task, 'smoke-idem-1', v_dec, '[]'::jsonb, '{}'::jsonb, null);
  v_r2 := public.extension_v2_apply_checkpoint(v_org, v_run, v_task, 'smoke-idem-1', v_dec, '[]'::jsonb, '{}'::jsonb, null);

  select count(*) into v_sp
    from public.supplier_products where organization_id = v_org and identity_key = 'smoke-ident-1';
  select count(*), max(price_per_kg_ex_vat) into v_price, v_kg
    from public.supplier_product_prices spp
    join public.supplier_products sp on sp.id = spp.supplier_product_id
    where sp.identity_key = 'smoke-ident-1' and spp.is_current;

  v_verdict := format(
    'ACK1 accepted=%s dup=%s | ACK2 dup=%s | supplier_products=%s (verwacht 1) | current_prices=%s (verwacht 1) | per_kg=%s (verwacht 9)',
    v_r1->>'accepted', v_r1->>'duplicateReplay', v_r2->>'duplicateReplay', v_sp, v_price, v_kg
  );

  raise exception 'SMOKETEST-OK ✅  %', v_verdict;  -- opzettelijk → rollback, niets blijft staan
end $$;
