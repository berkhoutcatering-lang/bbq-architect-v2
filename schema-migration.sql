-- =============================================
-- BBQ Architect — Schema Migration
-- Voeg deze tabellen toe via de Supabase SQL Editor
-- =============================================

-- 1. Add 'menu' column to events (JSONB array of recipe IDs)
ALTER TABLE events ADD COLUMN IF NOT EXISTS menu JSONB DEFAULT '[]';

-- 1b. Add 'offerte_id' column to events (links to source offerte)
ALTER TABLE events ADD COLUMN IF NOT EXISTS offerte_id integer;

-- 2. Inventory (Voorraad)
CREATE TABLE IF NOT EXISTS inventory (
  id SERIAL PRIMARY KEY,
  naam TEXT NOT NULL DEFAULT '',
  categorie TEXT DEFAULT 'Vlees',
  current_stock NUMERIC(10,2) DEFAULT 0,
  min_stock NUMERIC(10,2) DEFAULT 0,
  unit TEXT DEFAULT 'kg',
  purchase_price NUMERIC(10,2) DEFAULT 0,
  supplier TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Prep Suggestions (Smart auto-generated prep tasks)
CREATE TABLE IF NOT EXISTS prep_suggestions (
  id SERIAL PRIMARY KEY,
  task_name TEXT DEFAULT '',
  ingredient_naam TEXT DEFAULT '',
  tekort NUMERIC(10,2) DEFAULT 0,
  unit TEXT DEFAULT 'kg',
  scheduled_at TIMESTAMPTZ DEFAULT now(),
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 4. Time Logs (Uren / Workforce)
CREATE TABLE IF NOT EXISTS time_logs (
  id SERIAL PRIMARY KEY,
  start_time TIMESTAMPTZ NOT NULL DEFAULT now(),
  end_time TIMESTAMPTZ,
  status TEXT DEFAULT 'active',
  locatie TEXT DEFAULT '',
  notitie TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- =============================================
-- RLS Policies
-- =============================================
ALTER TABLE inventory ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all" ON inventory FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE prep_suggestions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all" ON prep_suggestions FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE time_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all" ON time_logs FOR ALL USING (true) WITH CHECK (true);

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
