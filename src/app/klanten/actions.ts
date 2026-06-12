/**
 * Server Actions voor klant-CRUD.
 *
 * Hard rule 5 (BBQ Architect): Zod-validatie + re-auth binnen de actie.
 * RLS doet tenant-isolatie via `organization_id` policies op `klanten`.
 *
 * Vervangt direct-Supabase calls vanuit de Client component, waarmee een
 * gemanipuleerde request niet langer rechtstreeks naar `klanten` kan
 * schrijven met een vervalste shape — alles gaat eerst door dit schema.
 */

'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { createServerSupabase } from '@/lib/supabase-server';

const KlantSchema = z.object({
    id: z.union([z.string().uuid(), z.coerce.number().int()]).optional(),
    naam: z.string().min(1, 'Naam is verplicht').max(200),
    bedrijf: z.string().max(200).optional().default(''),
    /* Postcode + plaats blijven optioneel — kleine klanten leveren alleen
       een naam en telefoon aan, adres pas later. */
    adres: z.string().max(500).optional().default(''),
    postcode: z.string().max(20).optional().default(''),
    plaats: z.string().max(200).optional().default(''),
    telefoon: z.string().max(50).optional().default(''),
    /* Email is nice-to-have; offerte-mail kan niet zonder, maar klanten
       in de eerste fase kunnen "WhatsApp-only" zijn. */
    email: z.string().email('Ongeldig e-mailadres').or(z.literal('')).optional().default(''),
    /* `type` is een vrij veld in DB (Particulier, Bedrijf, Stichting...).
       Geen enum hier — schrijven van losse waarden moet kunnen, lijst-UI
       gebruikt het voor filtering. */
    type: z.string().max(100).optional().default(''),
    notities: z.string().max(5000).optional().default(''),
});

export type KlantInput = z.input<typeof KlantSchema>;

interface ActionResult<T = unknown> {
    data?: T;
    error?: string;
    fields?: Record<string, string[]>;
}

export async function upsertKlant(input: unknown): Promise<ActionResult<{ id: number | string }>> {
    const parsed = KlantSchema.safeParse(input);
    if (!parsed.success) {
        return {
            error: 'validation',
            fields: parsed.error.flatten().fieldErrors as Record<string, string[]>,
        };
    }

    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: 'unauthorized' };

    const { id, ...rest } = parsed.data;

    /* RLS-fix 2026-06-12: WITH CHECK op `klanten` eist een geldig
       organization_id — RLS vult dat niet zelf in. Zonder dit veld werd
       elke nieuwe klant stilletjes geweigerd ("new row violates RLS"). */
    const { data: mem } = await supabase
        .from('organization_members')
        .select('organization_id')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .limit(1)
        .maybeSingle();
    if (!mem?.organization_id) return { error: 'geen actieve organisatie gevonden' };

    if (id) {
        const { data, error } = await supabase
            .from('klanten')
            .update(rest)
            .eq('id', id)
            .select('id')
            .single();
        if (error) return { error: error.message };
        revalidatePath('/klanten');
        return { data: { id: data.id } };
    }

    const { data, error } = await supabase
        .from('klanten')
        .insert({ ...rest, organization_id: mem.organization_id })
        .select('id')
        .single();
    if (error) return { error: error.message };
    revalidatePath('/klanten');
    return { data: { id: data.id } };
}

export async function deleteKlant(id: number | string): Promise<ActionResult<{ ok: true }>> {
    const parsedId = z.union([z.string().uuid(), z.coerce.number().int()]).safeParse(id);
    if (!parsedId.success) return { error: 'validation' };

    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: 'unauthorized' };

    /* Zachte fail bij FK-conflict: een klant met events/offertes/facturen
       mag niet stilletjes verdwijnen. RLS + DB-constraint zijn de echte
       backstop; we leveren hier een leesbare error voor de UI. */
    const { error } = await supabase.from('klanten').delete().eq('id', parsedId.data);
    if (error) {
        const msg = error.message.toLowerCase();
        if (msg.includes('foreign key') || msg.includes('violates')) {
            return { error: 'klant heeft nog gekoppelde events/offertes/facturen' };
        }
        return { error: error.message };
    }
    revalidatePath('/klanten');
    return { data: { ok: true } };
}
