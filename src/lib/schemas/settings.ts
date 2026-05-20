/**
 * Zod-schema voor settings-update.
 *
 * Geëxtraheerd uit `src/app/instellingen/actions.ts`. Dit schema is
 * de SECURITY-POLICY voor wat een ingelogde user mag muteren op de
 * `settings`-tabel van zijn eigen tenant. Strip-modus (default) dropt
 * elk veld dat niet expliciet vermeld is — bv. `id`, `organization_id`,
 * `tier`, `created_at`. Dit voorkomt dat een gemanipuleerde request
 * de billing-tier kan upgraden of een ander tenant's settings raakt.
 *
 * Wat NIET in dit schema mag (en dus stilzwijgend wordt gedropt):
 *   - `id` (PK, niet writable)
 *   - `organization_id` (RLS-policy blokt dit als laatste vangnet)
 *   - `tier` (alleen via billing-webhook, NIET via UI)
 *   - `created_at` / `updated_at` (DB-defaults)
 *   - Service-role-only velden (bv. `internal_notes`,
 *     `feature_flags_admin`)
 *
 * Herbruikbaar voor:
 *   - API-route die settings via een andere flow update (CSV-import,
 *     onboarding-wizard)
 *   - Test-cases zonder Supabase-mocks
 *   - Toekomstige bulk-tenant-update vanuit het admin-panel
 *
 * Veld-conventies:
 *   - `HexColor` helper voor brand-tokens — voorkomt dat ongeldige
 *     CSS-waarden in het theming-systeem belanden (CSS-injection vector).
 *   - `AccountingConfigSchema` heeft `.passthrough()` zodat tenants
 *     toekomstige config-velden kunnen schrijven zonder dat we deze
 *     allowlist per release moeten updaten. De BEKENDE velden
 *     (`labor_cost_per_hour`) zijn wel strict gevalideerd.
 *   - `default_btw` is `min(0).max(100)` — generiek, geen
 *     BTW_RULES_2026-enforce hier (dat is voor factuur-items).
 */

import { z } from 'zod';

export const HexColor = z.string().regex(
    /^#[0-9a-fA-F]{3,8}$/,
    'Verwacht hex-kleur (#RRGGBB)',
);

export const AccountingConfigSchema = z.object({
    /* Per-tenant labor-rate (P0.34) */
    labor_cost_per_hour: z.coerce.number().min(0).max(500).optional(),
    labor_cost_per_hour_weekend: z.coerce.number().min(0).max(500).optional(),
    /* Optionele config-velden — laten we open zodat tenants extra velden
       kunnen schrijven via toekomstige UI zonder action te updaten. */
}).passthrough();

export const SettingsSchema = z.object({
    /* Identiteit + contact — strings met sane caps */
    bedrijfsnaam: z.string().max(200).optional(),
    ondertitel: z.string().max(200).optional(),
    email: z.string().email('Ongeldig e-mailadres').or(z.literal('')).optional(),
    telefoon: z.string().max(50).optional(),
    adres: z.string().max(500).optional(),
    kvk: z.string().max(50).optional(),
    btw: z.string().max(50).optional(),
    iban: z.string().max(50).optional(),

    /* Document-instellingen */
    factuur_prefix: z.string().max(20).optional(),
    offerte_prefix: z.string().max(20).optional(),
    default_btw: z.coerce.number().min(0).max(100).optional(),
    betaaltermijn: z.coerce.number().int().min(0).max(365).optional(),
    offerte_geldig: z.coerce.number().int().min(0).max(365).optional(),
    betaalvoorwaarden: z.string().max(2000).optional(),
    website: z.string().max(500).optional(),

    /* Huisstijl — logo URL's en thema-tokens (5×8 white-label) */
    logo_url: z.string().url().or(z.literal('')).nullable().optional(),
    logo_dark_url: z.string().url().or(z.literal('')).nullable().optional(),
    brand_primary: HexColor.nullable().optional(),
    brand_accent: HexColor.nullable().optional(),
    brand_secondary: HexColor.nullable().optional(),
    brand_background: HexColor.nullable().optional(),
    brand_text: HexColor.nullable().optional(),
    brand_card: HexColor.nullable().optional(),

    /* Accounting-config jsonb. Inhoud bounded via AccountingConfigSchema. */
    accounting_config: AccountingConfigSchema.optional(),
});

export type SettingsInput = z.input<typeof SettingsSchema>;
export type SettingsParsed = z.output<typeof SettingsSchema>;
export type AccountingConfigInput = z.input<typeof AccountingConfigSchema>;
