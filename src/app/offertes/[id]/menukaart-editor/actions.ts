/**
 * Menukaart-editor Server Actions.
 *
 * Hard rule 5 (BBQ Architect): elke action re-authorized + Zod-gevalideerd.
 * RLS doet tenant-isolatie via organization_id policies op offertes + settings.
 *
 * Allow-list check (validateOverrides) is harder dan Zod: hij valideert tegen
 * de specifieke template-allowList zodat de client geen waardes buiten bereik
 * kan posten.
 */

'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { createServerSupabase } from '@/lib/supabase-server';
import { getTemplate, type Overrides } from '@/lib/menukaart/registry';
import { validateOverrides } from '@/lib/menukaart/validation';

const OverridesSchema = z.record(z.string(), z.unknown());

type ActionResult = { ok: true } | { error: string };

/* ── Offerte-laag (custom) ──────────────────────────────────────── */

export async function saveOfferOverrides(
    offerId: string,
    templateId: string,
    rawOverrides: unknown,
): Promise<ActionResult> {
    const parsed = OverridesSchema.safeParse(rawOverrides);
    if (!parsed.success) return { error: 'Validatie-fout: overrides moet object zijn' };

    const template = getTemplate(templateId);
    const check = validateOverrides(template, parsed.data);
    if (check.ok === false) {
        return { error: `Ongeldige waardes: ${check.errors.map(e => `${e.key} (${e.reason})`).join(', ')}` };
    }

    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: 'Niet ingelogd' };

    const { error } = await supabase
        .from('offertes')
        .update({
            menukaart_template_id: templateId,
            menukaart_overrides: check.clean,
        })
        .eq('id', offerId);

    if (error) return { error: error.message };

    revalidatePath(`/offertes/${offerId}`);
    revalidatePath(`/q/${offerId}`);
    return { ok: true };
}

export async function resetOfferOverrides(offerId: string): Promise<ActionResult> {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: 'Niet ingelogd' };

    const { error } = await supabase
        .from('offertes')
        .update({ menukaart_overrides: {} })
        .eq('id', offerId);

    if (error) return { error: error.message };

    revalidatePath(`/offertes/${offerId}`);
    revalidatePath(`/q/${offerId}`);
    return { ok: true };
}

/* ── Tenant-laag (brand) ──────────────────────────────────────── */

export async function saveTenantBrandOverrides(
    templateId: string,
    rawOverrides: unknown,
): Promise<ActionResult> {
    const parsed = OverridesSchema.safeParse(rawOverrides);
    if (!parsed.success) return { error: 'Validatie-fout: overrides moet object zijn' };

    const template = getTemplate(templateId);
    const check = validateOverrides(template, parsed.data);
    if (check.ok === false) {
        return { error: `Ongeldige waardes: ${check.errors.map(e => `${e.key} (${e.reason})`).join(', ')}` };
    }

    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: 'Niet ingelogd' };

    // settings is per-tenant — RLS doet de scoping
    const { data: settingsRow } = await supabase
        .from('settings')
        .select('id')
        .limit(1)
        .single();

    if (!settingsRow) return { error: 'Settings-row niet gevonden' };

    const { error } = await supabase
        .from('settings')
        .update({
            menukaart_template_id: templateId,
            menukaart_overrides: check.clean,
        })
        .eq('id', settingsRow.id);

    if (error) return { error: error.message };

    revalidatePath('/instellingen');
    return { ok: true };
}

/* ── Reset enkele key (per-key reset in editor) ──────────────────── */

const ResetKeysSchema = z.object({
    offerId: z.string(),
    keys: z.array(z.string()).min(1),
});

export async function resetOfferKeys(input: unknown): Promise<ActionResult> {
    const parsed = ResetKeysSchema.safeParse(input);
    if (!parsed.success) return { error: 'Validatie-fout' };

    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: 'Niet ingelogd' };

    const { data: existing } = await supabase
        .from('offertes')
        .select('menukaart_overrides')
        .eq('id', parsed.data.offerId)
        .single();

    const current: Overrides = (existing?.menukaart_overrides as Overrides) ?? {};
    const next: Overrides = { ...current };
    for (const k of parsed.data.keys) {
        delete (next as Record<string, unknown>)[k];
    }

    const { error } = await supabase
        .from('offertes')
        .update({ menukaart_overrides: next })
        .eq('id', parsed.data.offerId);

    if (error) return { error: error.message };

    revalidatePath(`/offertes/${parsed.data.offerId}`);
    revalidatePath(`/q/${parsed.data.offerId}`);
    return { ok: true };
}
