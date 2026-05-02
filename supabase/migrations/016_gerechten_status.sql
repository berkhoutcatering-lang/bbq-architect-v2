-- Status-systeem op gerechten (vervangt binaire `actief`-kolom)
--
-- UX-audit (Phase 3, 2026-05-01): de huidige `actief: boolean` is te grof. Een
-- mature SaaS heeft expliciete states zodat AI-creaties als concept binnen-
-- komen, ingebouwde reviews mogelijk zijn, en de wizard alleen klant-klare
-- gerechten toont.
--
-- States:
--   - `concept`        — net aangemaakt (vooral AI-output), niet klant-klaar
--   - `review_nodig`   — kostprijs of allergenen ontbreken; wizard verbergt
--   - `actief`         — klaar voor offerte (default voor handmatige creaties)
--   - `inactief`       — bewust uitgezet
--
-- `actief` blijft bestaan als backwards-compat-kolom (oudere code leest 'm
-- nog), maar `status` is de single source of truth. Een trigger houdt
-- `actief = (status = 'actief')` in sync zodat oude queries niet breken.
--
-- `bron` (`manual` | `ai`) wordt apart bijgehouden voor visuele differentiatie
-- (diagonal-stripe pattern op AI-cards) en voor audit ("waar komt dit gerecht
-- vandaan?").

ALTER TABLE gerechten
    ADD COLUMN IF NOT EXISTS status TEXT;

ALTER TABLE gerechten
    ADD COLUMN IF NOT EXISTS bron TEXT DEFAULT 'manual';

-- Backfill: bestaande gerechten krijgen status op basis van `actief`.
UPDATE gerechten SET status = 'actief' WHERE status IS NULL AND actief = true;
UPDATE gerechten SET status = 'inactief' WHERE status IS NULL AND (actief = false OR actief IS NULL);
UPDATE gerechten SET bron = 'manual' WHERE bron IS NULL;

-- Vanaf nu is status NOT NULL met een check-constraint op de toegestane waarden.
ALTER TABLE gerechten
    ALTER COLUMN status SET NOT NULL,
    ALTER COLUMN status SET DEFAULT 'actief';

ALTER TABLE gerechten
    DROP CONSTRAINT IF EXISTS gerechten_status_check;
ALTER TABLE gerechten
    ADD CONSTRAINT gerechten_status_check
    CHECK (status IN ('concept', 'review_nodig', 'actief', 'inactief'));

ALTER TABLE gerechten
    DROP CONSTRAINT IF EXISTS gerechten_bron_check;
ALTER TABLE gerechten
    ADD CONSTRAINT gerechten_bron_check
    CHECK (bron IN ('manual', 'ai'));

COMMENT ON COLUMN gerechten.status IS 'Workflow-status: concept = niet klant-klaar (vooral AI-creaties); review_nodig = ontbrekende verplicht velden; actief = klaar voor offerte; inactief = bewust uitgezet.';
COMMENT ON COLUMN gerechten.bron IS 'Hoe het gerecht in de bibliotheek kwam. manual = user-input; ai = via AI-tool of recipe-generate.';

-- Index voor de filter-pills op /gerechten en de wizard die alleen status=actief toont.
CREATE INDEX IF NOT EXISTS idx_gerechten_status_org ON gerechten(organization_id, status);

-- Trigger: houd `actief` in sync met `status` voor backwards-compat.
-- Dit voorkomt dat code die nog op `actief` filtert ineens niets meer ziet.
CREATE OR REPLACE FUNCTION sync_gerechten_actief_with_status()
RETURNS TRIGGER AS $$
BEGIN
    NEW.actief := (NEW.status = 'actief');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_gerechten_sync_actief ON gerechten;
CREATE TRIGGER trg_gerechten_sync_actief
    BEFORE INSERT OR UPDATE OF status ON gerechten
    FOR EACH ROW
    EXECUTE FUNCTION sync_gerechten_actief_with_status();
