-- 021_ritten_dedup.sql
--
-- Voorkom duplicate ritten door dubbel-klikken op "Opslaan" of bij offline-sync
-- die per ongeluk twee keer dezelfde rit pusht. Een rit is "dezelfde" als
-- voertuig + datum + km_begin + km_eind alle vier matchen — dat is de natuurlijke
-- key (een chauffeur kan niet twee keer met dezelfde auto, op dezelfde dag,
-- van km-stand X naar km-stand Y rijden).
--
-- Als deze constraint per ongeluk een legitieme dubbele rit blokkeert (bv twee
-- losse heen-en-weer ritten die toevallig zelfde km-deltas hebben), kan operator
-- 1 km verschil geven of de tweede combineren. Edge-case is acceptabel om
-- duplicate-bug volledig uit te sluiten.

CREATE UNIQUE INDEX IF NOT EXISTS idx_ritten_dedup
    ON ritten (voertuig_id, datum, km_begin, km_eind);

COMMENT ON INDEX idx_ritten_dedup IS 'Voorkomt duplicate ritten bij dubbel-klik of sync-race. Natural key voor één rit.';
