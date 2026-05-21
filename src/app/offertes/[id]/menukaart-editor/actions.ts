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
import { getTemplate, TEMPLATES, type Overrides } from '@/lib/menukaart/registry';
import { validateOverrides } from '@/lib/menukaart/validation';

const OverridesSchema = z.record(z.string(), z.unknown());

type ActionResult = { ok: true } | { error: string };

const VALID_TEMPLATE_IDS = TEMPLATES.filter(t => t.enabled).map(t => t.id);

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

/* ── Template wisselen ────────────────────────────────────────── */

const SwitchSchema = z.object({
    offerId: z.string(),
    templateId: z.string().refine(v => VALID_TEMPLATE_IDS.includes(v), 'Onbekende template'),
    /** Optioneel: behoud overrides die ook bij de nieuwe template horen, drop de rest. */
    preserveOverrides: z.boolean().optional().default(true),
});

export async function switchOfferTemplate(input: unknown): Promise<ActionResult> {
    const parsed = SwitchSchema.safeParse(input);
    if (!parsed.success) return { error: 'Validatie-fout: ' + parsed.error.issues.map(i => i.message).join(', ') };

    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: 'Niet ingelogd' };

    const { offerId, templateId, preserveOverrides } = parsed.data;
    const newTemplate = getTemplate(templateId);

    let nextOverrides: Overrides = {};
    if (preserveOverrides) {
        const { data: existing } = await supabase
            .from('offertes')
            .select('menukaart_overrides')
            .eq('id', offerId)
            .single();

        const current = (existing?.menukaart_overrides as Overrides) ?? {};
        // Filter alleen keys behouden die door nieuwe allow-list toegestaan zijn
        const check = validateOverrides(newTemplate, current as Record<string, unknown>);
        if (check.ok === true) {
            nextOverrides = check.clean;
        } else {
            // Nooit fout-throwen — neem alleen de geldige keys
            const partial: Record<string, unknown> = {};
            const errorKeys = new Set(check.errors.map(e => e.key));
            for (const [k, v] of Object.entries(current)) {
                if (!errorKeys.has(k)) partial[k] = v;
            }
            const recheck = validateOverrides(newTemplate, partial);
            if (recheck.ok === true) nextOverrides = recheck.clean;
        }
    }

    const { error } = await supabase
        .from('offertes')
        .update({
            menukaart_template_id: templateId,
            menukaart_overrides: nextOverrides,
        })
        .eq('id', offerId);

    if (error) return { error: error.message };

    revalidatePath(`/offertes/${offerId}`);
    revalidatePath(`/offertes/${offerId}/menukaart-editor`);
    revalidatePath(`/q/${offerId}`);
    revalidatePath(`/events`);
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

/* ── Quick-edit: alleen persoonlijke boodschap ─────────────────────────── */

const EventMessageSchema = z.object({
    offerId: z.string(),
    eventTitle: z.string().trim().max(80).optional(),
    eventMessage: z.string().trim().max(300).optional(),
    eventMessagePosition: z.enum(['top', 'bottom']).optional(),
});

/**
 * Snelle update van alleen eventTitle/eventMessage/eventMessagePosition
 * vanuit context buiten de menukaart-editor (bv. event-hub). Behoudt alle
 * andere overrides op de offerte ongewijzigd.
 */
export async function saveEventMessage(input: unknown): Promise<ActionResult> {
    const parsed = EventMessageSchema.safeParse(input);
    if (!parsed.success) {
        return { error: parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join(', ') };
    }

    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: 'Niet ingelogd' };

    const { data: existing, error: fetchErr } = await supabase
        .from('offertes')
        .select('menukaart_overrides')
        .eq('id', parsed.data.offerId)
        .maybeSingle();

    if (fetchErr) return { error: fetchErr.message };
    if (!existing) return { error: 'Offerte niet gevonden' };

    const current = (existing.menukaart_overrides as Overrides) ?? {};
    const next: Overrides = { ...current };

    // Trim + clear-if-empty semantics — gelijk aan validation.ts
    if (parsed.data.eventTitle !== undefined) {
        const v = parsed.data.eventTitle.trim();
        if (v.length === 0) delete next.eventTitle;
        else next.eventTitle = v;
    }
    if (parsed.data.eventMessage !== undefined) {
        const v = parsed.data.eventMessage.trim();
        if (v.length === 0) delete next.eventMessage;
        else next.eventMessage = v;
    }
    if (parsed.data.eventMessagePosition !== undefined) {
        next.eventMessagePosition = parsed.data.eventMessagePosition;
    }

    const { error } = await supabase
        .from('offertes')
        .update({ menukaart_overrides: next })
        .eq('id', parsed.data.offerId);

    if (error) return { error: error.message };

    revalidatePath(`/offertes/${parsed.data.offerId}`);
    revalidatePath(`/q/${parsed.data.offerId}`);
    revalidatePath(`/events`);
    return { ok: true };
}

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
