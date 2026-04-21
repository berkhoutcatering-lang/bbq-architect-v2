-- ============================================================
-- BBQ Architect v2 — AI audit trail
-- Optionele FK-kolom ai_conversation_id op tabellen die via
-- AI-acties worden aangepast. Nullable: null = handmatig of van
-- voor deze migratie. Gevuld = rij is aangemaakt door een
-- specifiek AI-gesprek, waardoor rollback en herleiding mogelijk is.
-- ============================================================

ALTER TABLE gerechten
  ADD COLUMN IF NOT EXISTS ai_conversation_id BIGINT REFERENCES ai_conversations(id) ON DELETE SET NULL;
ALTER TABLE events
  ADD COLUMN IF NOT EXISTS ai_conversation_id BIGINT REFERENCES ai_conversations(id) ON DELETE SET NULL;
ALTER TABLE offertes
  ADD COLUMN IF NOT EXISTS ai_conversation_id BIGINT REFERENCES ai_conversations(id) ON DELETE SET NULL;
ALTER TABLE recepten
  ADD COLUMN IF NOT EXISTS ai_conversation_id BIGINT REFERENCES ai_conversations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS gerechten_ai_conv_idx ON gerechten(ai_conversation_id) WHERE ai_conversation_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS events_ai_conv_idx ON events(ai_conversation_id) WHERE ai_conversation_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS offertes_ai_conv_idx ON offertes(ai_conversation_id) WHERE ai_conversation_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS recepten_ai_conv_idx ON recepten(ai_conversation_id) WHERE ai_conversation_id IS NOT NULL;
