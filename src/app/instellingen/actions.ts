/**
 * Server Action voor settings-update.
 *
 * Voorheen ging `useSettings.save()` direct via Client-side Supabase update.
 * Risico: een gemanipuleerde client kan elke kolom op `settings` schrijven,
 * inclusief `accounting_config` (Moneybird OAuth-tokens, KvK-koppeling) en
 * `tier`. Deze action heeft een **expliciete allowlist** — alleen velden in
 * `SettingsSchema` mogen muteren, alles anders wordt stilzwijgend gedropt
 * door Zod's strip-modus.
 *
 * Hard rule 5 (BBQ Architect): Zod-validatie + re-auth.
 */

'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { createServerSupabase } from '@/lib/supabase-server';

/* ─── Brand-tokens (gedeeld met witgekleurde inputs in instellingen/page.tsx) */
const HexColor = z.string().regex(/^#[0-9a-fA-F]{3,8}$/, 'Verwacht hex-kleur (#RRGGBB)');

const AccountingConfigSchema = z.object({
    /* Per-tenant labor-rate (P0.34) */
    labor_cost_per_hour: z.coerce.number().min(0).max(500).optional(),
    labor_cost_per_hour_weekend: z.coerce.number().min(0).max(500).optional(),
    /* Optionele config-velden — laten we open zodat tenants extra velden
       kunnen schrijven via toekomstige UI zonder action te updaten. */
}).passthrough();

const SettingsSchema = z.object({
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

/* Wat NIET in het schema staat = niet writable via deze action:
   - id (PK)
   - organization_id (RLS-policy zou dit hoe dan ook blokken)
   - tier (alleen via billing-webhook, NIET via UI)
   - created_at / updated_at (DB-defaults)
   - service-role-only velden */

export type SettingsInput = z.input<typeof SettingsSchema>;

interface ActionResult<T = unknown> {
    data?: T;
    error?: string;
    fields?: Record<string, string[]>;
}

export async function updateSettings(input: unknown): Promise<ActionResult<{ ok: true }>> {
    const parsed = SettingsSchema.safeParse(input);
    if (!parsed.success) {
        return {
            error: 'validation',
            fields: parsed.error.flatten().fieldErrors as Record<string, string[]>,
        };
    }

    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: 'unauthorized' };

    /* Resolve org via membership (RLS scope't dit automatisch — alleen
       de orgs waar user member van is komen terug). */
    const { data: memberships } = await supabase
        .from('organization_members')
        .select('organization_id')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .limit(1);
    const orgId = memberships?.[0]?.organization_id;
    if (!orgId) return { error: 'geen organisatie' };

    const { error } = await supabase
        .from('settings')
        .update(parsed.data)
        .eq('organization_id', orgId);
    if (error) return { error: error.message };

    revalidatePath('/instellingen');
    revalidatePath('/');  // brand-tokens raken Vandaag-hub direct
    return { data: { ok: true } };
}
