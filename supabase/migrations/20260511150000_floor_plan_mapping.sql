-- =============================================================
--  Floor-Plan Mapping — Service-modus voor Prep-KDS
-- =============================================================
--
--  Bouwt voort op prep-KDS migration (20260511140000). Voegt drie tables toe
--  zodat catering-team op locatie snel een plattegrond kan tekenen met
--  gast-pins (allergeen-info), service-zones (team-toewijzing) en optionele
--  achtergrond-foto (eigen tent / venue).
--
--  Pillar #4: Schets-in-30s (Konva canvas met BBQ-templates)
--  Pillar #5: Allergeen-radar (gast-pins met EU-14 kleur-ring + cluster-detect)
--  Pillar #6: Offline-by-default (canvas_json blob lokaal cacheable)
--
--  AVG / Art. 9 (gezondheidsdata): dieet- en allergeen-info bij gast-namen
--  is bijzondere persoonsgegevens. Daarom:
--    - retention: 30 dagen na event-datum → cron leegt full_name + note
--    - audit-log via kds_audit_logs (action: pin_created / pin_updated / etc)
--    - display-mode-routes filtert PII server-side
--    - storage-bucket 'floor-plans' is PRIVATE met folder-RLS per org
-- =============================================================

-- ── 1. floor_plans (1+ per event; varianten mogelijk) ──────────
CREATE TABLE IF NOT EXISTS floor_plans (
    id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id               INT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    organization_id        UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name                   TEXT NOT NULL DEFAULT 'Hoofd-plattegrond',
    -- Storage-path naar background-foto (signed-URL bij read, signed-upload bij write)
    background_image_path  TEXT,
    background_width_px    INT,
    background_height_px   INT,
    -- Optimistic concurrency — counter wordt door save-canvas Server Action gebumpt
    canvas_version         INT NOT NULL DEFAULT 1,
    -- Konva JSON snapshot van shapes (tafels, smoker, wegen, tekst). Geen PII.
    canvas_json            JSONB NOT NULL DEFAULT '{}'::jsonb,
    is_locked              BOOLEAN NOT NULL DEFAULT false,
    last_edited_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (event_id, name)
);

COMMENT ON TABLE floor_plans IS
    'Per event 1+ plattegronden. Shapes leven in canvas_json blob (Konva-export). Guest-pins + service-zones zijn separate tables ivm AVG-retention.';
COMMENT ON COLUMN floor_plans.canvas_json IS
    'Konva.Stage.toJSON()-output. Bevat alleen visuele shapes — GEEN persoonsgegevens.';

CREATE INDEX IF NOT EXISTS floor_plans_event_idx ON floor_plans(event_id);
CREATE INDEX IF NOT EXISTS floor_plans_org_idx ON floor_plans(organization_id);

-- ── 2. floor_plan_guests (PII + Art.9 gezondheidsdata) ─────────
-- BELANGRIJK: deze tabel valt onder AVG Art. 9 (bijzondere categorie data).
-- Retention 30 dagen na event-datum → cron leegt full_name + note.
CREATE TABLE IF NOT EXISTS floor_plan_guests (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    floor_plan_id       UUID NOT NULL REFERENCES floor_plans(id) ON DELETE CASCADE,
    organization_id     UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    event_id            INT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    -- Positie op canvas — percentage 0..100 zodat responsive resize werkt
    x_pct               NUMERIC(5,2) NOT NULL CHECK (x_pct >= 0 AND x_pct <= 100),
    y_pct               NUMERIC(5,2) NOT NULL CHECK (y_pct >= 0 AND y_pct <= 100),
    -- Display-safe label (initialen of tafel-code) — NOOIT NULL, blijft na anonymize
    label               TEXT NOT NULL,
    -- PII — wordt door cron leeggemaakt 30d na event.date
    full_name           TEXT,
    -- Art. 9 data — allergens uit EU-14 lijst (zie src/lib/prep/allergens.ts)
    allergens           TEXT[] NOT NULL DEFAULT '{}'::text[],
    dietary_restriction TEXT,
    severity            TEXT NOT NULL DEFAULT 'normal'
                          CHECK (severity IN ('normal','high','critical')),
    -- VIP/groep-marker hex-color (#rrggbb), niet AVG-gevoelig
    color               TEXT,
    -- PII — wordt door cron leeggemaakt
    note                TEXT,
    pii_anonymized_at   TIMESTAMPTZ,
    -- Optionele koppeling naar event_allergies-rij (idem gast op andere systeem)
    event_allergy_id    BIGINT REFERENCES event_allergies(id) ON DELETE SET NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE floor_plan_guests IS
    'Gast-pins met persoonsgegevens. AVG Art. 9 — retention 30 dagen via cron-anonymize.';
COMMENT ON COLUMN floor_plan_guests.label IS
    'Display-safe identifier (bv "G3" of "T5-S2"). NOOIT leeg — blijft na anonymize behouden voor analytics.';
COMMENT ON COLUMN floor_plan_guests.full_name IS
    'PII — wordt 30 dagen na event leeggemaakt door anonymize_old_floor_plan_guests().';
COMMENT ON COLUMN floor_plan_guests.allergens IS
    'EU-14 hoofd-allergeen-codes (gluten/noten/pinda/etc). Validatie in app-laag (src/lib/prep/allergens.ts isAllergen).';

CREATE INDEX IF NOT EXISTS fpg_floor_plan_idx ON floor_plan_guests(floor_plan_id);
CREATE INDEX IF NOT EXISTS fpg_org_idx ON floor_plan_guests(organization_id);
CREATE INDEX IF NOT EXISTS fpg_event_idx ON floor_plan_guests(event_id);
-- Cron-index: snel vinden van rijen die nog te anonymizen zijn
CREATE INDEX IF NOT EXISTS fpg_retention_pending_idx
    ON floor_plan_guests(event_id)
    WHERE pii_anonymized_at IS NULL;

-- AVG Art. 15 export — fuzzy-search op naam. Pg_trgm extension nodig.
-- Wordt skipped als extension niet beschikbaar is (dan moet aanvrager bouwen).
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'pg_trgm') THEN
        CREATE EXTENSION IF NOT EXISTS pg_trgm;
        CREATE INDEX IF NOT EXISTS fpg_name_trgm_idx
            ON floor_plan_guests USING gin (full_name gin_trgm_ops);
    END IF;
END;
$$;

-- ── 3. service_zones (team-toewijzing van een polygon) ─────────
CREATE TABLE IF NOT EXISTS service_zones (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    floor_plan_id         UUID NOT NULL REFERENCES floor_plans(id) ON DELETE CASCADE,
    organization_id       UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name                  TEXT NOT NULL,
    -- { type:'polygon', points:[{x_pct,y_pct},...] }
    geometry              JSONB NOT NULL,
    assigned_personeel_id UUID REFERENCES personeel(id) ON DELETE SET NULL,
    color                 TEXT,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE service_zones IS
    'Service-team-zones op een floor_plan. Polygon-shape met optionele personeel-koppeling.';

CREATE INDEX IF NOT EXISTS service_zones_fp_idx ON service_zones(floor_plan_id);
CREATE INDEX IF NOT EXISTS service_zones_org_idx ON service_zones(organization_id);

-- ── 4. updated_at triggers ─────────────────────────────────────
CREATE OR REPLACE FUNCTION trigger_floor_plan_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS floor_plans_updated_at_trg ON floor_plans;
CREATE TRIGGER floor_plans_updated_at_trg
    BEFORE UPDATE ON floor_plans
    FOR EACH ROW EXECUTE FUNCTION trigger_floor_plan_updated_at();

DROP TRIGGER IF EXISTS fpg_updated_at_trg ON floor_plan_guests;
CREATE TRIGGER fpg_updated_at_trg
    BEFORE UPDATE ON floor_plan_guests
    FOR EACH ROW EXECUTE FUNCTION trigger_floor_plan_updated_at();

-- ── 5. RLS — alleen org-leden ──────────────────────────────────
ALTER TABLE floor_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE floor_plan_guests ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_zones ENABLE ROW LEVEL SECURITY;

-- floor_plans policies
DROP POLICY IF EXISTS fp_select ON floor_plans;
DROP POLICY IF EXISTS fp_insert ON floor_plans;
DROP POLICY IF EXISTS fp_update ON floor_plans;
DROP POLICY IF EXISTS fp_delete ON floor_plans;

CREATE POLICY fp_select ON floor_plans FOR SELECT
    USING (organization_id IN (
        SELECT organization_id FROM organization_members
        WHERE user_id = auth.uid() AND status = 'active'
    ));
CREATE POLICY fp_insert ON floor_plans FOR INSERT
    WITH CHECK (organization_id IN (
        SELECT organization_id FROM organization_members
        WHERE user_id = auth.uid() AND status = 'active'
    ));
CREATE POLICY fp_update ON floor_plans FOR UPDATE
    USING (organization_id IN (
        SELECT organization_id FROM organization_members
        WHERE user_id = auth.uid() AND status = 'active'
    ));
CREATE POLICY fp_delete ON floor_plans FOR DELETE
    USING (organization_id IN (
        SELECT organization_id FROM organization_members
        WHERE user_id = auth.uid() AND status = 'active'
    ));

-- floor_plan_guests policies (same pattern)
DROP POLICY IF EXISTS fpg_select ON floor_plan_guests;
DROP POLICY IF EXISTS fpg_insert ON floor_plan_guests;
DROP POLICY IF EXISTS fpg_update ON floor_plan_guests;
DROP POLICY IF EXISTS fpg_delete ON floor_plan_guests;

CREATE POLICY fpg_select ON floor_plan_guests FOR SELECT
    USING (organization_id IN (
        SELECT organization_id FROM organization_members
        WHERE user_id = auth.uid() AND status = 'active'
    ));
CREATE POLICY fpg_insert ON floor_plan_guests FOR INSERT
    WITH CHECK (organization_id IN (
        SELECT organization_id FROM organization_members
        WHERE user_id = auth.uid() AND status = 'active'
    ));
CREATE POLICY fpg_update ON floor_plan_guests FOR UPDATE
    USING (organization_id IN (
        SELECT organization_id FROM organization_members
        WHERE user_id = auth.uid() AND status = 'active'
    ));
CREATE POLICY fpg_delete ON floor_plan_guests FOR DELETE
    USING (organization_id IN (
        SELECT organization_id FROM organization_members
        WHERE user_id = auth.uid() AND status = 'active'
    ));

-- service_zones policies (same pattern)
DROP POLICY IF EXISTS sz_select ON service_zones;
DROP POLICY IF EXISTS sz_insert ON service_zones;
DROP POLICY IF EXISTS sz_update ON service_zones;
DROP POLICY IF EXISTS sz_delete ON service_zones;

CREATE POLICY sz_select ON service_zones FOR SELECT
    USING (organization_id IN (
        SELECT organization_id FROM organization_members
        WHERE user_id = auth.uid() AND status = 'active'
    ));
CREATE POLICY sz_insert ON service_zones FOR INSERT
    WITH CHECK (organization_id IN (
        SELECT organization_id FROM organization_members
        WHERE user_id = auth.uid() AND status = 'active'
    ));
CREATE POLICY sz_update ON service_zones FOR UPDATE
    USING (organization_id IN (
        SELECT organization_id FROM organization_members
        WHERE user_id = auth.uid() AND status = 'active'
    ));
CREATE POLICY sz_delete ON service_zones FOR DELETE
    USING (organization_id IN (
        SELECT organization_id FROM organization_members
        WHERE user_id = auth.uid() AND status = 'active'
    ));

-- ── 6. AVG retention-cron functie ──────────────────────────────
-- Wordt aangeroepen door /api/cron/anonymize-floor-plan-guests
-- (Vercel cron of Supabase pg_cron). Verwijdert PII van rijen waar
-- het event > 30 dagen geleden plaatsvond.
CREATE OR REPLACE FUNCTION anonymize_old_floor_plan_guests()
RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
    affected INT := 0;
BEGIN
    UPDATE floor_plan_guests fpg
    SET full_name = NULL,
        note      = NULL,
        pii_anonymized_at = now()
    FROM events e
    WHERE fpg.event_id = e.id
      AND fpg.pii_anonymized_at IS NULL
      AND e.date IS NOT NULL
      AND (e.date::date + INTERVAL '30 days') < now()::date;
    GET DIAGNOSTICS affected = ROW_COUNT;
    RETURN affected;
END;
$$;

COMMENT ON FUNCTION anonymize_old_floor_plan_guests IS
    'AVG Art. 9 retention. Verwijdert full_name + note 30 dagen na event-datum. Behoudt label + allergens + posities voor anonieme pattern-rapportage.';

-- ── 7. Storage bucket — PRIVATE met folder-RLS ─────────────────
-- Achtergrond-fotos van locaties (tent, boerderij) — kunnen herkenbaar
-- zijn dus PRIVATE; toegang alleen via signed-URLs door API.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'floor-plans',
    'floor-plans',
    false,
    5 * 1024 * 1024,  -- 5 MB
    ARRAY['image/png','image/jpeg','image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- Storage-policies: alleen org-leden mogen op {org_id}/* lezen/schrijven.
-- Pad-conventie: floor-plans/{org_uuid}/{event_id}/{file_name}
DROP POLICY IF EXISTS floor_plans_org_read ON storage.objects;
DROP POLICY IF EXISTS floor_plans_org_write ON storage.objects;
DROP POLICY IF EXISTS floor_plans_org_update ON storage.objects;
DROP POLICY IF EXISTS floor_plans_org_delete ON storage.objects;

CREATE POLICY floor_plans_org_read ON storage.objects FOR SELECT
    USING (
        bucket_id = 'floor-plans'
        AND auth.role() = 'authenticated'
        AND (storage.foldername(name))[1] IN (
            SELECT organization_id::text FROM organization_members
            WHERE user_id = auth.uid() AND status = 'active'
        )
    );
CREATE POLICY floor_plans_org_write ON storage.objects FOR INSERT
    WITH CHECK (
        bucket_id = 'floor-plans'
        AND auth.role() = 'authenticated'
        AND (storage.foldername(name))[1] IN (
            SELECT organization_id::text FROM organization_members
            WHERE user_id = auth.uid() AND status = 'active'
        )
    );
CREATE POLICY floor_plans_org_update ON storage.objects FOR UPDATE
    USING (
        bucket_id = 'floor-plans'
        AND (storage.foldername(name))[1] IN (
            SELECT organization_id::text FROM organization_members
            WHERE user_id = auth.uid() AND status = 'active'
        )
    );
CREATE POLICY floor_plans_org_delete ON storage.objects FOR DELETE
    USING (
        bucket_id = 'floor-plans'
        AND (storage.foldername(name))[1] IN (
            SELECT organization_id::text FROM organization_members
            WHERE user_id = auth.uid() AND status = 'active'
        )
    );

-- =============================================================
--  Einde 20260511150000_floor_plan_mapping.sql
-- =============================================================
