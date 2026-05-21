-- ============================================================
-- BBQ Architect — Menukaart-editor: template + overrides cascade
-- ============================================================
-- Driehoek voor de visuele wrapper rond een menukaart:
--
--   default (template-built-in)
--      ↓ overridden by
--   brand   (per-tenant, in settings.menukaart_overrides)
--      ↓ overridden by
--   custom  (per-offerte, in offertes.menukaart_overrides)
--
-- De editor schrijft naar 1 van de 2 lagen. /q/[id] resolved cascade
-- bij render. Wijzigingen op brand-niveau raken alleen NIEUWE offertes;
-- bestaande offertes houden hun eigen custom-overrides.

-- ─── Brand-laag op tenant-settings ───────────────────────────
ALTER TABLE settings
    ADD COLUMN IF NOT EXISTS menukaart_template_id TEXT,
    ADD COLUMN IF NOT EXISTS menukaart_overrides JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN settings.menukaart_template_id IS
    'Default template-keuze per tenant. NULL = "restaurant-01". Geldig: zie src/lib/menukaart/registry.ts';
COMMENT ON COLUMN settings.menukaart_overrides IS
    'Brand-laag van de cascade: {accent?: hex, bg?: hex, text?: hex, headingFont?: string, bodyFont?: string, headingSize?: int, bodySize?: int, headingWeight?: int, logoPosition?: enum, logoSize?: int, brandName?: string, subtitle?: string, footer?: string, showOrnament?: bool, showDividers?: bool, showGhostNumbers?: bool}. Allow-list per template gechecked in Server Action.';

-- ─── Custom-laag op offertes ───────────────────────────
ALTER TABLE offertes
    ADD COLUMN IF NOT EXISTS menukaart_template_id TEXT,
    ADD COLUMN IF NOT EXISTS menukaart_overrides JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN offertes.menukaart_template_id IS
    'Per-offerte template-override. NULL = volg tenant-default uit settings.menukaart_template_id.';
COMMENT ON COLUMN offertes.menukaart_overrides IS
    'Offerte-specifieke override-laag. Wint van settings.menukaart_overrides en template-default. Lege strings/null-keys vallen door naar brand-laag.';

-- ─── Index voor /q/[id] lookup (template_id soms in filters) ───────────────────────────
CREATE INDEX IF NOT EXISTS idx_offertes_menukaart_template
    ON offertes(menukaart_template_id)
    WHERE menukaart_template_id IS NOT NULL;
