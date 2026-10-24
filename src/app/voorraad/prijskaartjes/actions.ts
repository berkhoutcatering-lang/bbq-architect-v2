/**
 * Server Action voor de prijskaartjes: de teksten van een kaartje bewaren
 * (winkel_prijskaartjes) en de prijs als winkelprijs van het product
 * (winkel_producten.winkelprijs_incl_cents). Eén plek voor een prijs: wat op
 * het kaartje staat, is wat het product kost.
 *
 * Huisregels (zie voorraad/winkel/actions.ts): Zod op alle invoer, re-auth
 * binnen de action, organisatie uit organization_members.
 */

'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { createServerSupabase } from '@/lib/supabase-server';
import { INHOUD_EENHEDEN, winkelPrijsCents } from '@/lib/winkel/prijskaartje';

type ActionResult<T = unknown> = { data: T } | { error: string };

const Tekst = (max: number) => z.string().trim().max(max);

const KaartjeInvoer = z.object({
    productId: z.string().uuid(),
    soort: Tekst(40),
    naam: Tekst(80).min(1, 'Een kaartje heeft een naam'),
    maker: Tekst(80),
    details: Tekst(80),
    inhoud: z.number().min(0).max(100000).nullable(),
    inhoudEenheid: z.enum(INHOUD_EENHEDEN),
    /** Per stuk, of per 100 gram bij los gewogen waar. null = geen prijs. */
    prijsCents: z.number().int().min(0, 'Een prijs is 0 of meer').max(1000000).nullable(),
    bij: Tekst(60),
    aantal: z.number().int().min(1).max(50),
    printen: z.boolean(),
});

/** Bewaart de gewijzigde kaartjes in één keer. */
export async function bewaarPrijskaartjes(input: unknown): Promise<ActionResult<{ bewaard: number }>> {
    const parsed = z.array(KaartjeInvoer).min(1).max(500).safeParse(input);
    if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Controleer de velden' };

    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: 'unauthorized' };
    const { data: lid } = await supabase
        .from('organization_members')
        .select('organization_id')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .limit(1)
        .maybeSingle();
    const orgId = lid?.organization_id as string | undefined;
    if (!orgId) return { error: 'unauthorized' };

    const kaartjes = parsed.data;
    const { data: producten, error: fout } = await supabase
        .from('winkel_producten')
        .select('id, eenheid, prijs_per, winkelprijs_incl_cents')
        .eq('organization_id', orgId)
        .in('id', kaartjes.map((k) => k.productId));
    if (fout) return { error: fout.message };
    const perId = new Map((producten ?? []).map((p) => [p.id as string, p]));

    for (const k of kaartjes) {
        const p = perId.get(k.productId);
        if (!p) return { error: 'Product niet gevonden' };

        const { error: kFout } = await supabase.from('winkel_prijskaartjes').upsert({
            organization_id: orgId,
            winkel_product_id: k.productId,
            soort: k.soort || null,
            naam: k.naam,
            maker: k.maker || null,
            details: k.details || null,
            inhoud: k.inhoud,
            inhoud_eenheid: k.inhoudEenheid,
            bij: k.bij || null,
            aantal: k.aantal,
            printen: k.printen,
        }, { onConflict: 'winkel_product_id' });
        if (kFout) return { error: kFout.message };

        const nieuw = k.prijsCents == null
            ? null
            : winkelPrijsCents(k.prijsCents, { eenheid: p.eenheid as 'stuk' | 'gram', prijs_per: Number(p.prijs_per) });
        if (nieuw !== (p.winkelprijs_incl_cents as number | null)) {
            const { error: pFout } = await supabase.from('winkel_producten')
                .update({ winkelprijs_incl_cents: nieuw })
                .eq('id', k.productId)
                .eq('organization_id', orgId);
            if (pFout) return { error: pFout.message };
        }
    }

    revalidatePath('/voorraad/prijskaartjes');
    revalidatePath('/voorraad/winkel');
    return { data: { bewaard: kaartjes.length } };
}
