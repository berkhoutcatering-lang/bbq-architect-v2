-- Voeg vertrek_tijd, duur_minuten en status toe aan ritten.
-- Allemaal nullable / met default zodat bestaande rijen + RLS niet breken.
--
-- vertrek_tijd: voor hero-display "08:14" + Belastingdienst-eis bij gemengde ritten
-- duur_minuten: geschatte reistijd (display only, niet voor fiscale calc)
-- status: workflow-state. open = nog te beoordelen, goedgekeurd = klaar voor Moneybird-push.

ALTER TABLE ritten
  ADD COLUMN IF NOT EXISTS vertrek_tijd TIME,
  ADD COLUMN IF NOT EXISTS duur_minuten INTEGER,
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open','goedgekeurd'));

COMMENT ON COLUMN ritten.vertrek_tijd IS 'Optionele vertrektijd voor hero-display + Belastingdienst-eis bij gemengde ritten.';
COMMENT ON COLUMN ritten.duur_minuten IS 'Geschatte reistijd in minuten — voor display, niet voor fiscale calc.';
COMMENT ON COLUMN ritten.status IS 'Workflow-status: open = nog te beoordelen, goedgekeurd = geboekt naar Moneybird.';

CREATE INDEX IF NOT EXISTS idx_ritten_org_status ON ritten(organization_id, status, datum DESC);
