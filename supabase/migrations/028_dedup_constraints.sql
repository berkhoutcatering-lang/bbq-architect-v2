-- ════════════════════════════════════════════════════════════════════════════
--  028 — Dedup-constraints (DB-niveau, niet alleen UI)
--
--  Garandeert dat de app NOOIT dubbele producten kan toevoegen, ook niet bij
--  een race-condition of via SQL-import. Faalt graceful als bestaande data al
--  duplicates bevat (notice in plaats van migration-crash).
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. INVENTORY: 1 naam per organisatie ─────────────────────────────────
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'inventory') THEN
        BEGIN
            CREATE UNIQUE INDEX IF NOT EXISTS ux_inventory_naam_org
                ON inventory (organization_id, lower(trim(naam)))
                WHERE organization_id IS NOT NULL;
        EXCEPTION WHEN unique_violation THEN
            RAISE NOTICE 'inventory bevat duplicates op (organization_id, naam) — UNIQUE-index niet aangemaakt. Dedup eerst handmatig.';
        END;
    END IF;
END $$;

-- ── 2. ORG_PRICE_MUTATIONS: max 1 pending per (leverancier, naam, eenheid) ─
DO $$
BEGIN
    BEGIN
        CREATE UNIQUE INDEX IF NOT EXISTS ux_mut_pending_dedup
            ON org_price_mutations (
                organization_id,
                COALESCE(leverancier_id, 0),
                lower(trim(parsed_naam)),
                lower(trim(coalesce(parsed_eenheid, 'stuks')))
            )
            WHERE status = 'pending';
    EXCEPTION WHEN unique_violation THEN
        RAISE NOTICE 'org_price_mutations bevat duplicates pending — eerst dedup-DELETE draaien (zie helper hieronder).';
    END;
END $$;

-- ── 3. LEVERANCIERS: 1 naam per org (case-insensitive) ───────────────────
DO $$
BEGIN
    BEGIN
        CREATE UNIQUE INDEX IF NOT EXISTS ux_leveranciers_naam_org
            ON leveranciers (organization_id, lower(trim(naam)))
            WHERE archived_at IS NULL;
    EXCEPTION WHEN unique_violation THEN
        RAISE NOTICE 'leveranciers bevat duplicates op (organization_id, naam) — UNIQUE-index niet aangemaakt. Dedup eerst.';
    END;
END $$;

-- ── 4. AUTO-DEDUP HELPER (optioneel, alleen handmatig draaien) ───────────
-- Verwijdert duplicate pending mutations en behoudt de meest recente.
-- DRAAI ALLEEN ALS migratie #2 hierboven met "duplicates" notice faalde.
--   DELETE FROM org_price_mutations a USING org_price_mutations b
--   WHERE a.id < b.id
--     AND a.organization_id = b.organization_id
--     AND a.leverancier_id IS NOT DISTINCT FROM b.leverancier_id
--     AND lower(trim(a.parsed_naam)) = lower(trim(b.parsed_naam))
--     AND lower(trim(coalesce(a.parsed_eenheid,'stuks'))) = lower(trim(coalesce(b.parsed_eenheid,'stuks')))
--     AND a.status = 'pending' AND b.status = 'pending';

-- ── 5. AUDIT LOG ─────────────────────────────────────────────────────────
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'audit_log') THEN
        INSERT INTO audit_log (entity_type, entity_id, action, metadata, created_at)
        VALUES ('migration', NULL, 'applied', jsonb_build_object('migration', '028_dedup_constraints'), now())
        ON CONFLICT DO NOTHING;
    END IF;
END $$;
