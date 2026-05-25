-- ═══════════════════════════════════════════════════════════════
-- Bucket C P0-5 — Menu view preference persistence (server-side)
-- ═══════════════════════════════════════════════════════════════
-- Klant-zijde gebruikt useMenuView hook met localStorage als primaire
-- store. Deze tabel is optioneel cross-device sync; wordt nu nog niet
-- bedraad in de hook. Sam kan later kiezen om dit aan te zetten.
--
-- Multi-tenant via RLS: alleen eigen user_id reads/writes.
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS user_settings (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    menu_view TEXT DEFAULT 'grid' CHECK (menu_view IN ('grid', 'list', 'gallery')),
    menu_density TEXT DEFAULT 'comfortable' CHECK (menu_density IN ('compact', 'comfortable')),
    menu_photo_mode TEXT DEFAULT 'mixed' CHECK (menu_photo_mode IN ('all', 'mixed', 'none')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index op user_id is impliciet via primary key.

-- RLS — wrapped (select auth.uid()) policies voor performance.
ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_settings_select_own" ON user_settings;
CREATE POLICY "user_settings_select_own" ON user_settings
    FOR SELECT
    USING (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "user_settings_insert_own" ON user_settings;
CREATE POLICY "user_settings_insert_own" ON user_settings
    FOR INSERT
    WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "user_settings_update_own" ON user_settings;
CREATE POLICY "user_settings_update_own" ON user_settings
    FOR UPDATE
    USING (user_id = (select auth.uid()))
    WITH CHECK (user_id = (select auth.uid()));

-- updated_at trigger
CREATE OR REPLACE FUNCTION set_user_settings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS user_settings_updated_at_trigger ON user_settings;
CREATE TRIGGER user_settings_updated_at_trigger
    BEFORE UPDATE ON user_settings
    FOR EACH ROW
    EXECUTE FUNCTION set_user_settings_updated_at();

COMMENT ON TABLE user_settings IS 'Per-user UI preferences. Bucket C 2026-05-25: menu_view (grid|list|gallery), menu_density, menu_photo_mode. Client-side gebruikt localStorage als primaire store; deze tabel is voor optionele cross-device sync.';
