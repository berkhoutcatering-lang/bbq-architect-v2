-- ═══════════════════════════════════════════════════════════════════════════
--  Objectproef winkel en voorraad — staat alles er wat feat/winkelvoorraad
--  verwacht?
--  Plan v5, stap 0.2 · Draaiboek: docs/ecosysteem/stap-0-supabase.md
--
--  ALLEEN LEZEN (één SELECT, geen data). Draai hem op live én op dev: de
--  uitkomst moet gelijk zijn, ook na elke migratie. Per object: soort, naam,
--  de migratie waar het vandaan komt, en OK of ONTBREEKT.
--
--  Signaturen zijn de exacte argumenttypes uit de migraties op
--  fix/ba-s-functierechten (basis feat/winkelvoorraad). "één versie" betekent:
--  precies één overload met die naam; twee versies kan PostgREST niet kiezen.
--  private.vereis_org staat ONTBREEKT tot BA-S (20261003150000) live is.
-- ═══════════════════════════════════════════════════════════════════════════

WITH
tabellen(naam, migratie) AS (VALUES
    ('winkel_instellingen',            '20260913120000_winkel_kassa'),
    ('winkel_artikelen',               '20260913120000_winkel_kassa'),
    ('winkel_momenten',                '20260913120000_winkel_kassa'),
    ('winkel_orders',                  '20260913120000_winkel_kassa'),
    ('winkel_order_regels',            '20260913120000_winkel_kassa'),
    ('winkel_betaalberichten',         '20260913120000_winkel_kassa'),
    ('winkel_producten',               '20260927120000_winkel_sinterklaas'),
    ('winkel_artikel_slots',           '20260927120000_winkel_sinterklaas'),
    ('winkel_order_regel_componenten', '20260927120000_winkel_sinterklaas'),
    ('voorraad_plekken',               '20260928120000_winkelvoorraad_logboek'),
    ('winkel_voorraad_mutaties',       '20260928120000_winkelvoorraad_logboek'),
    ('voorraad_melding_staat',         '20260928120200_winkelvoorraad_meldingen_afwijkingen'),
    ('winkel_dozen',                   '20260928130000_geschenkpakketten_dozen'),
    ('voorraad_invoer',                '20260928140000_voorraad_invoer'),
    ('voorraad_invoer_regels',         '20260928140000_voorraad_invoer'),
    ('voorraad_invoer_koppelingen',    '20260928140000_voorraad_invoer')
),
views(naam, migratie) AS (VALUES
    ('voorraad_logboek',           '20260928120000_winkelvoorraad_logboek'),
    ('voorraad_afwijkingen_maand', '20260928120200_winkelvoorraad_meldingen_afwijkingen')
),
kolommen(tabel, kolom, migratie) AS (VALUES
    ('winkel_artikelen',      'gerecht_id',              '20260925120000_winkel_vakjes'),
    ('winkel_artikelen',      'inventory_id',            '20260925120000_winkel_vakjes'),
    ('winkel_artikelen',      'inkoop_per_stuk',         '20260925120000_winkel_vakjes'),
    ('winkel_artikelen',      'dieet',                   '20260925120000_winkel_vakjes'),
    ('winkel_artikelen',      'koppel_voorstel',         '20260925120000_winkel_vakjes'),
    ('winkel_order_regels',   'klaar_op',                '20260925120000_winkel_vakjes'),
    ('winkel_order_regels',   'event_id',                '20260925120000_winkel_vakjes'),
    ('winkel_order_regels',   'klaargezet_at',           '20260925120000_winkel_vakjes'),
    ('winkel_orders',         'wensen',                  '20260925120000_winkel_vakjes'),
    ('winkel_orders',         'wensen_bron',             '20260925120000_winkel_vakjes'),
    ('winkel_orders',         'plaatsing_status',        '20260925120000_winkel_vakjes'),
    ('winkel_orders',         'plaatsing_fout',          '20260925120000_winkel_vakjes'),
    ('winkel_orders',         'plaatsing_at',            '20260925120000_winkel_vakjes'),
    ('events',                'winkel_moment_id',        '20260925120000_winkel_vakjes'),
    ('events',                'menu_gasten',             '20260925120000_winkel_vakjes'),
    ('concept_inkoop_orders', 'vakje',                   '20260926120000_concept_inkoop_orders_vakje'),
    ('concept_inkoop_orders', 'vakje_label',             '20260926120000_concept_inkoop_orders_vakje'),
    ('winkel_artikelen',      'segment',                 '20260927120000_winkel_sinterklaas'),
    ('winkel_artikelen',      'vast',                    '20260927120000_winkel_sinterklaas'),
    ('winkel_artikelen',      'alcohol',                 '20260927120000_winkel_sinterklaas'),
    ('winkel_artikelen',      'schaal_verdeling',        '20260927120000_winkel_sinterklaas'),
    ('winkel_artikelen',      'btw_verdeling',           '20260927120000_winkel_sinterklaas'),
    ('winkel_artikelen',      'verpakking_klein_cents',  '20260927120000_winkel_sinterklaas'),
    ('winkel_artikelen',      'verpakking_groot_cents',  '20260927120000_winkel_sinterklaas'),
    ('winkel_order_regels',   'btw_cents',               '20260927120000_winkel_sinterklaas'),
    ('winkel_order_regels',   'alcohol',                 '20260927120000_winkel_sinterklaas'),
    ('winkel_orders',         'betaalwijze',             '20260927120000_winkel_sinterklaas'),
    ('winkel_orders',         'nu_te_betalen_cents',     '20260927120000_winkel_sinterklaas'),
    ('winkel_orders',         'rest_cents',              '20260927120000_winkel_sinterklaas'),
    ('winkel_orders',         'rest_betaald_at',         '20260927120000_winkel_sinterklaas'),
    ('winkel_orders',         'rest_betaalmethode',      '20260927120000_winkel_sinterklaas'),
    ('winkel_momenten',       'sluit_op',                '20260927120000_winkel_sinterklaas'),
    ('winkel_instellingen',   'reservering_bedrag_cents','20260927120000_winkel_sinterklaas'),
    ('winkel_instellingen',   'qr_basis_url',            '20260927120000_winkel_sinterklaas'),
    ('winkel_producten',      'inventory_id',            '20260928120000_winkelvoorraad_logboek'),
    ('winkel_producten',      'drempel',                 '20260928120000_winkelvoorraad_logboek'),
    ('winkel_producten',      'bestel_hoeveelheid',      '20260928120000_winkelvoorraad_logboek'),
    ('winkel_producten',      'leverancier_id',          '20260928120000_winkelvoorraad_logboek'),
    ('winkel_producten',      'ean',                     '20260928120000_winkelvoorraad_logboek'),
    ('winkel_producten',      'tht',                     '20260928120000_winkelvoorraad_logboek'),
    ('winkel_producten',      'laatste_beweging_at',     '20260928120000_winkelvoorraad_logboek'),
    ('stock_movements',       'reden',                   '20260928120000_winkelvoorraad_logboek'),
    ('winkel_order_regels',   'opgehaald_at',            '20260928120100_winkelvoorraad_inpakken'),
    ('winkel_order_regels',   'opgehaald_door',          '20260928120100_winkelvoorraad_inpakken'),
    ('winkel_instellingen',   'melding_email',           '20260928120200_winkelvoorraad_meldingen_afwijkingen'),
    ('stock_movements',       'idempotency_key',         '20260928120200_winkelvoorraad_meldingen_afwijkingen'),
    ('voorraad_invoer',       'prijzen_incl_btw',        '20260928140100_voorraad_invoer_btw')
),
functies(signatuur, migratie) AS (VALUES
    ('private.user_org_ids()',                                   '20260508084409_security_advisor_hardening'),
    ('public.set_updated_at()',                                  '(basis)'),
    ('public.eenheid_factor(text, text)',                        '20260916130300_productie_partij_afronden_fn'),
    ('public.productie_partij_afronden(uuid, uuid, bigint, numeric, text, numeric, text, jsonb, date, date, text, text, uuid, uuid, integer, bigint, uuid, integer, numeric, jsonb, text)',
                                                                 '20260916130300_productie_partij_afronden_fn'),
    ('public.partij_als_jsonb(uuid, boolean)',                   '20260916130300_productie_partij_afronden_fn'),
    ('public.increment_inventory_stock(uuid, integer, numeric, text, numeric, uuid, text, bigint, uuid)',
                                                                 '20260916130200_stock_movements_partij'),
    ('public.winkel_bezetting_moment(uuid, bigint)',             '20260913120000_winkel_kassa'),
    ('public.winkel_bezetting_voorraad(uuid, bigint)',           '20260913120000_winkel_kassa'),
    ('public.winkel_controleer_capaciteit(uuid, jsonb, bigint)', '20260913120000_winkel_kassa + 20260927120000'),
    ('public.winkel_start_betaalpoging(bigint)',                 '20260913120000_winkel_kassa + 20260928130000'),
    ('public.winkel_bevestig_betaling(bigint, text, integer, text)', '20260913120000_winkel_kassa + 20260927120000'),
    ('public.winkel_regel_klaar_op()',                           '20260925120100_winkel_regels_klaar_op_trigger'),
    ('public.winkel_plaats_order(uuid, text, text, text, uuid, text, text, text, jsonb, text, integer, integer, integer, jsonb, text, jsonb, text, integer, integer)',
                                                                 '20260927120000_winkel_sinterklaas'),
    ('public.winkel_regels_json(bigint)',                        '20260927120000_winkel_sinterklaas'),
    ('public.winkel_boek_rest(bigint, text)',                    '20260927120000_winkel_sinterklaas'),
    ('public.winkel_bezetting_product(uuid, bigint)',            '20260927120000_winkel_sinterklaas + 20260928120100'),
    ('public.winkel_voorraad_bewaken()',                         '20260928120000_winkelvoorraad_logboek'),
    ('public.winkel_muteer_voorraad(uuid, uuid, text, numeric, text, text, bigint, bigint, date, integer, uuid, text, integer, bigint, uuid)',
                                                                 '20260928120000_winkelvoorraad_logboek'),
    ('public.winkel_keuken_factor(text, text)',                  '20260928120000_winkelvoorraad_logboek'),
    ('public.voorraad_overboeken(uuid, integer, uuid, numeric, text, text, text)',
                                                                 '20260928120000_winkelvoorraad_logboek'),
    ('public.winkel_zet_klaargezet(uuid, bigint, boolean)',      '20260928120100_winkelvoorraad_inpakken'),
    ('public.keuken_afwijking(uuid, integer, numeric, text, text, text)',
                                                                 '20260928120200_winkelvoorraad_meldingen_afwijkingen'),
    ('public.winkel_dozen_voor_regel(uuid, bigint, text[])',     '20260928130000_geschenkpakketten_dozen'),
    ('public.winkel_doos_ophalen(uuid, text, text)',             '20260928130000_geschenkpakketten_dozen'),
    ('public.voorraad_invoer_op_slot()',                         '20260928140000_voorraad_invoer'),
    ('public.voorraad_invoer_boeken(uuid, uuid)',                '20260928140000_voorraad_invoer + 20260928140100'),
    ('private.vereis_org(uuid)',                                 '20261003150000_winkel_functies_niet_voor_anon (BA-S)')
),
triggers(tabel, trig, migratie) AS (VALUES
    ('winkel_instellingen',   'trg_winkel_instellingen_updated_at', '20260913120000_winkel_kassa'),
    ('winkel_artikelen',      'trg_winkel_artikelen_updated_at',    '20260913120000_winkel_kassa'),
    ('winkel_momenten',       'trg_winkel_momenten_updated_at',     '20260913120000_winkel_kassa'),
    ('winkel_orders',         'trg_winkel_orders_updated_at',       '20260913120000_winkel_kassa'),
    ('winkel_order_regels',   'trg_winkel_order_regels_klaar_op',   '20260925120100_winkel_regels_klaar_op_trigger'),
    ('winkel_producten',      'trg_winkel_producten_updated_at',    '20260927120000_winkel_sinterklaas'),
    ('winkel_artikel_slots',  'trg_winkel_artikel_slots_updated_at','20260927120000_winkel_sinterklaas'),
    ('winkel_producten',      'trg_winkel_voorraad_bewaken',        '20260928120000_winkelvoorraad_logboek'),
    ('voorraad_plekken',      'trg_voorraad_plekken_updated_at',    '20260928120000_winkelvoorraad_logboek'),
    ('voorraad_invoer',       'trg_voorraad_invoer_updated_at',     '20260928140000_voorraad_invoer'),
    ('voorraad_invoer',       'trg_voorraad_invoer_op_slot',        '20260928140000_voorraad_invoer'),
    ('voorraad_invoer_regels','trg_voorraad_invoer_regels_op_slot', '20260928140000_voorraad_invoer')
),
indexen(naam, migratie) AS (VALUES
    ('winkel_orders_sleutel_idx',     '20260913120000_winkel_kassa'),
    ('events_winkel_moment_uniek',    '20260925120000_winkel_vakjes'),
    ('winkel_mutaties_sleutel_uidx',  '20260928120000_winkelvoorraad_logboek'),
    ('stock_movements_sleutel_uidx',  '20260928120200_winkelvoorraad_meldingen_afwijkingen')
),
proef AS (
    SELECT 1 AS nr, 'tabel' AS soort, 'public.' || t.naam AS naam, t.migratie,
           EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
                    WHERE n.nspname = 'public' AND c.relname = t.naam AND c.relkind IN ('r', 'p')) AS ok
      FROM tabellen t
    UNION ALL
    SELECT 2, 'rls aan', 'public.' || t.naam, t.migratie,
           EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
                    WHERE n.nspname = 'public' AND c.relname = t.naam AND c.relrowsecurity)
      FROM tabellen t
    UNION ALL
    SELECT 3, 'view', 'public.' || v.naam, v.migratie,
           EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
                    WHERE n.nspname = 'public' AND c.relname = v.naam AND c.relkind = 'v')
      FROM views v
    UNION ALL
    SELECT 4, 'kolom', 'public.' || k.tabel || '.' || k.kolom, k.migratie,
           EXISTS (SELECT 1 FROM information_schema.columns ic
                    WHERE ic.table_schema = 'public' AND ic.table_name = k.tabel AND ic.column_name = k.kolom)
      FROM kolommen k
    UNION ALL
    SELECT 5, 'functie', f.signatuur, f.migratie, to_regprocedure(f.signatuur) IS NOT NULL
      FROM functies f
    UNION ALL
    SELECT 6, 'functie (één versie)', split_part(f.signatuur, '(', 1), f.migratie,
           (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
             WHERE n.nspname || '.' || p.proname = split_part(f.signatuur, '(', 1)) = 1
      FROM functies f
     WHERE f.signatuur LIKE 'public.winkel\_%' OR f.signatuur LIKE 'public.voorraad\_%' OR f.signatuur LIKE 'public.keuken\_%'
    UNION ALL
    SELECT 7, 'trigger', tr.trig || ' op public.' || tr.tabel, tr.migratie,
           EXISTS (SELECT 1 FROM pg_trigger tg
                     JOIN pg_class c ON c.oid = tg.tgrelid
                     JOIN pg_namespace n ON n.oid = c.relnamespace
                    WHERE n.nspname = 'public' AND c.relname = tr.tabel AND tg.tgname = tr.trig AND NOT tg.tgisinternal)
      FROM triggers tr
    UNION ALL
    SELECT 8, 'index', 'public.' || i.naam, i.migratie, to_regclass('public.' || i.naam) IS NOT NULL
      FROM indexen i
    UNION ALL
    SELECT 9, 'index', 'public.ux_concept_inkoop_orders_active met vakje', '20260926120000_concept_inkoop_orders_vakje',
           COALESCE(pg_get_indexdef(to_regclass('public.ux_concept_inkoop_orders_active')) LIKE '%vakje%', false)
    UNION ALL
    SELECT 10, 'constraint', 'stock_movements_type_check kent overboeking en afwijking', '20260928120000_winkelvoorraad_logboek',
           EXISTS (SELECT 1 FROM pg_constraint
                    WHERE conrelid = to_regclass('public.stock_movements') AND conname = 'stock_movements_type_check'
                      AND pg_get_constraintdef(oid) LIKE '%overboeking%' AND pg_get_constraintdef(oid) LIKE '%afwijking%')
    UNION ALL
    SELECT 10, 'constraint', 'winkel_mutatie_reden_check op winkel_voorraad_mutaties', '20260928120000_winkelvoorraad_logboek',
           EXISTS (SELECT 1 FROM pg_constraint
                    WHERE conrelid = to_regclass('public.winkel_voorraad_mutaties') AND conname = 'winkel_mutatie_reden_check')
    UNION ALL
    SELECT 10, 'constraint', 'winkel_artikelen_een_koppeling (gerecht óf inventory)', '20260925120000_winkel_vakjes',
           EXISTS (SELECT 1 FROM pg_constraint
                    WHERE conrelid = to_regclass('public.winkel_artikelen') AND conname = 'winkel_artikelen_een_koppeling')
    UNION ALL
    SELECT 11, 'fix', 'myPOS-fix: winkel_start_betaalpoging zet 6 tekens van het token achter het OrderID',
           '20260913200000_winkel_mypos_order_id_uniek, hersteld in 20260928130000',
           COALESCE(pg_get_functiondef(to_regprocedure('public.winkel_start_betaalpoging(bigint)')) LIKE '%substr(token, 1, 6)%', false)
    UNION ALL
    SELECT 11, 'fix', 'btw-fix: voorraad_invoer_boeken haalt btw eraf bij prijzen_incl_btw',
           '20260928140100_voorraad_invoer_btw',
           COALESCE(pg_get_functiondef(to_regprocedure('public.voorraad_invoer_boeken(uuid, uuid)')) LIKE '%prijzen_incl_btw%', false)
    UNION ALL
    SELECT 11, 'fix', 'inpakken: winkel_bezetting_product telt ingepakte regels niet meer mee',
           '20260928120100_winkelvoorraad_inpakken',
           COALESCE(pg_get_functiondef(to_regprocedure('public.winkel_bezetting_product(uuid, bigint)')) LIKE '%klaargezet_at IS NULL%', false)
    UNION ALL
    SELECT 11, 'fix', 'pakketten: winkel_controleer_capaciteit weigert een product dat op is (WK009)',
           '20260927120000_winkel_sinterklaas',
           COALESCE(pg_get_functiondef(to_regprocedure('public.winkel_controleer_capaciteit(uuid, jsonb, bigint)')) LIKE '%WK009%', false)
)
SELECT soort, naam, migratie, CASE WHEN ok THEN 'OK' ELSE 'ONTBREEKT' END AS status
  FROM proef
 ORDER BY nr, naam;
