-- C13 pre-launch perfectionist route: BlockNote-editor in GerechtDetailDrawer.
-- Voegt JSONB-kolom toe naast bestaande `beschrijving` text-kolom.
-- `beschrijving` blijft de plain-text snapshot (zoekbaar, AI-leesbaar);
-- `beschrijving_blocks` bevat de rijke editor-state (headings, lijsten, etc).

ALTER TABLE gerechten
  ADD COLUMN IF NOT EXISTS beschrijving_blocks JSONB DEFAULT NULL;

COMMENT ON COLUMN gerechten.beschrijving_blocks IS
  'BlockNote document-state. NULL = legacy gerecht zonder rich-editor content; gebruik dan `beschrijving` text-kolom als fallback. Bij save: schrijf altijd BEIDE — blocks JSONB + plain-text snapshot in beschrijving.';
