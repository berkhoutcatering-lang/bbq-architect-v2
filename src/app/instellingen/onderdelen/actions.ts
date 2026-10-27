'use server';

/**
 * Onderdelen aan/uit (werkruimtes, 2026-10-20).
 *
 * Schrijft settings.verborgen_onderdelen voor één bedrijf. Alleen de rol
 * Admin van dát bedrijf mag dit; dat controleren we hier opnieuw (de knop
 * verbergen in de UI is geen beveiliging). Alleen bekende sleutels uit
 * navigation.tsx komen erdoor — de rest wordt stil weggelaten.
 */

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { createServerSupabase } from '@/lib/supabase-server';
import { uitzetbareSleutels } from '@/lib/navigation';

const Invoer = z.object({
    orgId: z.string().uuid(),
    verborgen: z.array(z.string().max(120)).max(200),
});

type Uitkomst = { data: { verborgen: string[] } } | { error: string };

export async function zetVerborgenOnderdelen(input: unknown): Promise<Uitkomst> {
    const parsed = Invoer.safeParse(input);
    if (!parsed.success) return { error: 'Ongeldige invoer' };
    const { orgId } = parsed.data;

    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: 'Je bent niet ingelogd' };

    const { data: lid } = await supabase
        .from('organization_members')
        .select('role')
        .eq('user_id', user.id)
        .eq('organization_id', orgId)
        .eq('status', 'active')
        .maybeSingle();
    if (!lid) return { error: 'Geen toegang tot dit bedrijf' };
    if (lid.role !== 'Admin') return { error: 'Alleen een beheerder (rol Admin) kan onderdelen aan- of uitzetten' };

    const toegestaan = uitzetbareSleutels();
    const verborgen = Array.from(new Set(parsed.data.verborgen.filter(function (k) { return toegestaan.has(k); }))).sort();

    const { data: rijen, error } = await supabase
        .from('settings')
        .update({ verborgen_onderdelen: verborgen } as never)
        .eq('organization_id', orgId)
        .select('id');
    if (!error && (!rijen || rijen.length === 0)) {
        /* Geen instellingen-rij (of RLS liet hem niet zien): niet stil doen
           alsof het gelukt is. */
        return { error: 'Er zijn nog geen bedrijfsinstellingen opgeslagen — sla eerst Instellingen één keer op' };
    }
    if (error) {
        /* Migratie 20261020120000 nog niet gedraaid: zeg dat eerlijk. */
        if (/verborgen_onderdelen/.test(error.message)) {
            return { error: 'De database kent deze instelling nog niet (migratie 20261020120000 ontbreekt)' };
        }
        return { error: error.message };
    }

    revalidatePath('/instellingen/onderdelen');
    return { data: { verborgen } };
}
