-- =============================================================
--  Fix: audit_log_record_table_check blokkeerde time_logs
--
--  Symptoom: "Inklokken mislukt" op /uren sinds eind mei 2026.
--  Oorzaak: trg_time_log_audit (AFTER INSERT/UPDATE/DELETE op
--  time_logs) schrijft record_table='time_logs' naar audit_log,
--  maar de live CHECK-constraint bevatte 'time_logs' niet meer.
--  Daardoor faalde elke inklok/uitklok/correctie/verwijdering.
--
--  Hoe het misging: de constraint is 4x hardcoded herbouwd
--  (017 → 020 → 031 → 20260525136000), waarbij elke rebuild de
--  waarden van eerdere features wiste. 20260527020000 herbouwde
--  daarna dynamisch, maar kon 'time_logs' niet meer terugvinden
--  omdat er (door de blokkade) nooit audit-rijen voor bestonden.
--
--  ⚠️ REGEL VOOR TOEKOMSTIGE MIGRATIES:
--  Vervang deze constraint NOOIT met een hardcoded lijst.
--  Gebruik ALTIJD het union-patroon hieronder: canonieke lijst
--  ∪ bestaande distinct waarden, en voeg je nieuwe waarde toe
--  aan de canonieke array. Een waarde die ontbreekt terwijl een
--  trigger 'm schrijft = die hele feature kapot (rollback).
-- =============================================================

DO $$
DECLARE
    v_list TEXT;
BEGIN
    SELECT string_agg(quote_literal(val), ', ')
    INTO v_list
    FROM (
        SELECT DISTINCT val
        FROM (
            -- Canonieke lijst: alle tabellen waarvoor audit-triggers
            -- bestaan of waarvoor eerdere migraties audit voorzagen.
            SELECT unnest(ARRAY[
                'gerechten', 'offertes', 'facturen', 'menu_templates',
                'ritten', 'voertuigen', 'time_logs', 'personeel',
                'bonnen', 'concept_inkoop_orders'
            ]) AS val
            UNION
            -- Defensief: behoud alles wat al in audit_log staat,
            -- ook waarden die hierboven (nog) niet genoemd zijn.
            SELECT record_table FROM audit_log WHERE record_table IS NOT NULL
        ) u
    ) d;

    EXECUTE 'ALTER TABLE public.audit_log DROP CONSTRAINT IF EXISTS audit_log_record_table_check';
    EXECUTE format(
        'ALTER TABLE public.audit_log ADD CONSTRAINT audit_log_record_table_check CHECK (record_table IN (%s)) NOT VALID',
        v_list
    );
END $$;
