/**
 * Server Actions voor /verkoop/website — de site bijsturen.
 * Plan: BOUWBRIEF-BEHEERSCHERM.md (website-repo), blok B1.
 *
 * Huisregels (zie ook verkoop/bestellingen/actions.ts):
 *  - Zod op alle invoer.
 *  - Re-auth BINNEN de action; de proxy alleen is niet genoeg.
 *  - De organisatie komt uit organization_members, nooit uit de client.
 *
 * Wat hier NIET kan, met opzet: de winkelfase omzetten, alcohol vrijgeven, de
 * webshop aanzetten. Die besluiten staan in git aan de kant van de site. Dit
 * scherm kan alleen dichtdoen — nooit opendoen.
 */

'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { createServerSupabase } from '@/lib/supabase-server';
import { SLUG_PATROON } from '@/lib/websiteBijsturing';

type ActionResult<T = unknown> = { data: T } | { error: string };

const PAD = '/verkoop/website';

async function ingelogdMetOrg() {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const { data } = await supabase
        .from('organization_members')
        .select('organization_id')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .limit(1)
        .maybeSingle();
    if (!data?.organization_id) return null;

    return { supabase, user, orgId: data.organization_id as string };
}

/** Eén rij per organisatie; bestaat hij nog niet, dan wordt hij nu aangemaakt. */
async function schrijfBijsturing(velden: Record<string, unknown>): Promise<ActionResult<{ ok: true }>> {
    const s = await ingelogdMetOrg();
    if (!s) return { error: 'unauthorized' };

    const { error } = await s.supabase
        .from('website_bijsturing')
        .upsert({ organization_id: s.orgId, ...velden }, { onConflict: 'organization_id' });
    if (error) return { error: error.message };

    revalidatePath(PAD);
    return { data: { ok: true } };
}

const Slugs = z.array(z.string().regex(SLUG_PATROON, 'Een slug bestaat uit kleine letters, cijfers en koppeltekens')).max(60);

/* ── 1. Vandaag dicht ────────────────────────────────────────────────────── */

const SluitingSchema = z.object({
    reden: z.string().trim().max(160, 'Hou de reden kort — hooguit 160 tekens').optional().default(''),
    /* ISO-tijdstip, of leeg voor "tot nader bericht". */
    tot: z.string().trim().optional().default(''),
});

export async function zetSluiting(input: unknown): Promise<ActionResult<{ ok: true }>> {
    const parsed = SluitingSchema.safeParse(input);
    if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Controleer de velden' };

    let tot: string | null = null;
    if (parsed.data.tot) {
        const t = Date.parse(parsed.data.tot);
        if (Number.isNaN(t)) return { error: 'Dat is geen geldig tijdstip.' };
        if (t <= Date.now()) return { error: 'Dat tijdstip is al voorbij.' };
        tot = new Date(t).toISOString();
    }

    return schrijfBijsturing({
        sluiting_actief: true,
        sluiting_reden: parsed.data.reden || null,
        sluiting_tot: tot,
    });
}

export async function hefSluitingOp(): Promise<ActionResult<{ ok: true }>> {
    return schrijfBijsturing({ sluiting_actief: false, sluiting_reden: null, sluiting_tot: null });
}

/* ── 2. Openingstijden ───────────────────────────────────────────────────── */

const KLOK = /^([01]\d|2[0-3]):[0-5]\d$/;

const OpeningstijdSchema = z.object({
    datum: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Kies een datum'),
    gesloten: z.boolean().default(false),
    van: z.string().regex(KLOK, 'Tijd als 10:00').optional().or(z.literal('')),
    tot: z.string().regex(KLOK, 'Tijd als 17:00').optional().or(z.literal('')),
});

export async function zetOpeningstijd(input: unknown): Promise<ActionResult<{ ok: true }>> {
    const parsed = OpeningstijdSchema.safeParse(input);
    if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Controleer de velden' };

    const { datum, gesloten } = parsed.data;
    const van = parsed.data.van || null;
    const tot = parsed.data.tot || null;
    if (!gesloten) {
        if (!van || !tot) return { error: 'Vul een begin- én eindtijd in, of zet de dag op gesloten.' };
        if (tot <= van) return { error: 'De eindtijd moet ná de begintijd liggen.' };
    }

    const s = await ingelogdMetOrg();
    if (!s) return { error: 'unauthorized' };

    const { error } = await s.supabase
        .from('website_openingstijden')
        .upsert(
            { organization_id: s.orgId, datum, gesloten, van: gesloten ? null : van, tot: gesloten ? null : tot },
            { onConflict: 'organization_id,datum' },
        );
    if (error) return { error: error.message };

    revalidatePath(PAD);
    return { data: { ok: true } };
}

export async function verwijderOpeningstijd(input: unknown): Promise<ActionResult<{ ok: true }>> {
    const parsed = z.object({ id: z.string().uuid() }).safeParse(input);
    if (!parsed.success) return { error: 'validation' };

    const s = await ingelogdMetOrg();
    if (!s) return { error: 'unauthorized' };

    const { error } = await s.supabase
        .from('website_openingstijden')
        .delete()
        .eq('id', parsed.data.id)
        .eq('organization_id', s.orgId);
    if (error) return { error: error.message };

    revalidatePath(PAD);
    return { data: { ok: true } };
}

/* ── 3. Weekaanbod ───────────────────────────────────────────────────────── */

const WeekaanbodSchema = z.object({
    van: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Kies een begindatum'),
    tot: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Kies een einddatum'),
    titel: z.string().trim().max(80, 'Hou de titel kort — hooguit 80 tekens').optional().default(''),
    tekst: z.string().trim().max(400, 'Hou de tekst kort — hooguit 400 tekens').optional().default(''),
    producten: Slugs.default([]),
});

export async function zetWeekaanbod(input: unknown): Promise<ActionResult<{ ok: true }>> {
    const parsed = WeekaanbodSchema.safeParse(input);
    if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Controleer de velden' };
    if (parsed.data.tot < parsed.data.van) return { error: 'De einddatum ligt vóór de begindatum.' };
    if (!parsed.data.titel && !parsed.data.tekst && parsed.data.producten.length === 0) {
        return { error: 'Een weekaanbod zonder titel, tekst of producten heeft niets te vertellen.' };
    }

    return schrijfBijsturing({
        weekaanbod_van: parsed.data.van,
        weekaanbod_tot: parsed.data.tot,
        weekaanbod_titel: parsed.data.titel || null,
        weekaanbod_tekst: parsed.data.tekst || null,
        weekaanbod_producten: [...new Set(parsed.data.producten)],
    });
}

export async function wisWeekaanbod(): Promise<ActionResult<{ ok: true }>> {
    return schrijfBijsturing({
        weekaanbod_van: null,
        weekaanbod_tot: null,
        weekaanbod_titel: null,
        weekaanbod_tekst: null,
        weekaanbod_producten: [],
    });
}

/* ── 4. Uitverkocht ──────────────────────────────────────────────────────── */

export async function zetUitverkocht(input: unknown): Promise<ActionResult<{ ok: true }>> {
    const parsed = z.object({ slugs: Slugs }).safeParse(input);
    if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Controleer de slugs' };

    return schrijfBijsturing({ uitverkocht: [...new Set(parsed.data.slugs)] });
}
