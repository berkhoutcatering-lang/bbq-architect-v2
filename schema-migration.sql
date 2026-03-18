-- =============================================
-- AI Studio: Gespreksmappen & Gesprekken
-- Voeg toe via Supabase SQL Editor
-- =============================================

-- Mappen voor AI-gesprekken
CREATE TABLE IF NOT EXISTS ai_conversation_folders (
  id BIGSERIAL PRIMARY KEY,
  naam TEXT NOT NULL DEFAULT 'Nieuwe map',
  kleur TEXT DEFAULT '#FFBF00',
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE ai_conversation_folders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all" ON ai_conversation_folders FOR ALL USING (true) WITH CHECK (true);

-- Opgeslagen AI-gesprekken
CREATE TABLE IF NOT EXISTS ai_conversations (
  id BIGSERIAL PRIMARY KEY,
  folder_id BIGINT REFERENCES ai_conversation_folders(id) ON DELETE SET NULL,
  titel TEXT NOT NULL DEFAULT 'Gesprek',
  modus TEXT DEFAULT 'brainstorm', -- 'brainstorm' | 'qa' | 'algemeen'
  messages JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE ai_conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all" ON ai_conversations FOR ALL USING (true) WITH CHECK (true);

-- Index voor snelle folder-query
CREATE INDEX IF NOT EXISTS ai_conversations_folder_idx ON ai_conversations(folder_id);
CREATE INDEX IF NOT EXISTS ai_conversations_updated_idx ON ai_conversations(updated_at DESC);
