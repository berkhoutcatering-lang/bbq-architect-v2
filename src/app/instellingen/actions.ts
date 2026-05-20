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

export type { SettingsInput };

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
