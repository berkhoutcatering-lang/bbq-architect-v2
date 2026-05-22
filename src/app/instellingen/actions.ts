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

import { revalidatePath } from 'next/cache';
import { createServerSupabase } from '@/lib/supabase-server';
import { SettingsSchema, type SettingsInput } from '@/lib/schemas/settings';
import { findPreset } from '@/lib/branding';
import { toHex } from '@/lib/contrast';

export type { SettingsInput };

interface ActionResult<T = unknown> {
    data?: T;
    error?: string;
    fields?: Record<string, string[]>;
}

/**
 * Bij een theme_preset wijziging deriven we de brand_* hex-velden deterministisch
 * uit de preset's OKLCH tokens — zodat de bestaande ThemeProvider (die hex
 * verwacht) blijft werken zonder wijziging. Geen AI in dit pad. Loopt alleen
 * als de input een theme_preset bevat én de tenant niet handmatig brand_* heeft
 * overschreven in dezelfde request.
 */
function derivePresetTokens(input: SettingsInput): SettingsInput {
    if (!input.theme_preset) return input;
    const preset = findPreset(input.theme_preset);
    if (!preset) return input;

    // Output object — start van input, override brand_* alleen waar gebruiker
    // niet expliciet een hex meegaf in dezelfde request. Dit laat power-users
    // hun eigen brand_primary overlayen op een preset.
    const out: SettingsInput = { ...input };
    const map = {
        brand_primary: preset.tokens.primary_print,
        brand_accent: preset.tokens.accent,
        brand_background: preset.tokens.bg,
        brand_card: preset.tokens.card,
        brand_text: preset.tokens.text,
        brand_secondary: preset.tokens.bg, // deeper-bg = bg in nieuwe preset-model
    } as const;
    for (const [key, oklchValue] of Object.entries(map)) {
        if (out[key as keyof typeof map] == null) {
            out[key as keyof typeof map] = toHex(oklchValue);
        }
    }
    return out;
}

export async function updateSettings(input: unknown): Promise<ActionResult<{ ok: true }>> {
    const parsed = SettingsSchema.safeParse(input);
    if (!parsed.success) {
        return {
            error: 'validation',
            fields: parsed.error.flatten().fieldErrors as Record<string, string[]>,
        };
    }

    // Preset → hex derive (geen AI, deterministisch via toHex())
    const dataToWrite = derivePresetTokens(parsed.data);

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
        .update(dataToWrite)
        .eq('organization_id', orgId);
    if (error) return { error: error.message };

    revalidatePath('/instellingen');
    revalidatePath('/');  // brand-tokens raken Vandaag-hub direct
    return { data: { ok: true } };
}
