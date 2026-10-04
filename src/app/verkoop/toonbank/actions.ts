/**
 * Server Actions voor Verkoop → Toonbank (BA-9, BA-10).
 *
 * Huisregels: zod op alle invoer, re-auth binnen de action, de organisatie
 * uit organization_members. Afhandelen en goedkeuren mag alleen een Admin;
 * de databasefuncties controleren dat zelf ook (toonbank_journaal_afhandelen,
 * toonbank_dagstaat_goedkeuren).
 */

'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { naToonbankBoekingen } from '@/lib/toonbank/naAfloop';
import { toonbankLid } from './_lib/lid';

type ActionResult<T = unknown> = { data: T } | { error: string };

async function alsAdmin() {
    const s = await toonbankLid();
    if (!s.user || !s.orgId || !s.isAdmin) return null;
    return s as typeof s & { orgId: string };
}

export interface AfhandelUitkomst {
    status: string;
    uitkomst: string;
}

/** Te controleren: een melding opnieuw verwerken, of met de hand afhandelen (met reden). */
export async function handelMeldingAf(input: unknown): Promise<ActionResult<AfhandelUitkomst>> {
    const parsed = z.object({
        journaalId: z.coerce.number().int().positive(),
        actie: z.enum(['opnieuw', 'opgelost']),
        reden: z.string().trim().max(500).nullable().default(null),
    }).safeParse(input);
    if (!parsed.success) return { error: 'validation' };
    if (parsed.data.actie === 'opgelost' && !parsed.data.reden) return { error: 'Geef een reden waarom dit is afgehandeld.' };
    const s = await alsAdmin();
    if (!s) return { error: 'Alleen een beheerder (Admin) handelt Toonbank-meldingen af.' };

    const { data, error } = await s.supabase.rpc('toonbank_journaal_afhandelen', {
        p_org: s.orgId, p_journaal_id: parsed.data.journaalId, p_actie: parsed.data.actie, p_reden: parsed.data.reden, p_door: s.user!.id,
    });
    if (error) return { error: error.code === '42501' ? 'Alleen een beheerder (Admin) handelt Toonbank-meldingen af.' : error.message };
    const r = (data ?? {}) as { status?: string; uitkomst?: string; product_ids?: string[]; melding?: string };
    if (r.uitkomst === 'kan_niet') return { error: r.melding ?? 'Deze melding kan BBQ Architect niet verwerken; handel hem met de hand af.' };
    naToonbankBoekingen(s.orgId, (r.product_ids ?? []).map(String));
    revalidatePath('/verkoop/toonbank', 'layout');
    return { data: { status: String(r.status ?? ''), uitkomst: String(r.uitkomst ?? '') } };
}
