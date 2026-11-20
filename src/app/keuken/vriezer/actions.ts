'use server';

/**
 * Vriezerlijst: een ingevroren stuk als gebruikt afvinken, of dat terugdraaien. Alleen via
 * winkel_stuk_opgebruikt (migratie 20261120130000); de organisatie gaat altijd expliciet mee.
 */
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { createServerSupabase } from '@/lib/supabase-server';

type ActionResult<T = unknown> = { data: T } | { error: string };

export async function zetGebruikt(input: unknown): Promise<ActionResult<{ gebruikt: boolean }>> {
    const parsed = z.object({ stukId: z.string().uuid('Onbekend stuk'), gebruikt: z.boolean() }).safeParse(input);
    if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Controleer de velden' };
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: 'Je bent niet ingelogd.' };
    const { data: lid } = await supabase.from('organization_members').select('organization_id')
        .eq('user_id', user.id).eq('status', 'active').limit(1).maybeSingle();
    if (!lid?.organization_id) return { error: 'Je bent niet ingelogd.' };
    const { error } = await supabase.rpc('winkel_stuk_opgebruikt', {
        p_org: lid.organization_id, p_stuk_id: parsed.data.stukId, p_gebruikt: parsed.data.gebruikt,
    });
    if (error) return { error: error.code === 'P0002' ? 'Dit stuk ligt niet (meer) in de vriezer.' : error.message };
    revalidatePath('/keuken/vriezer');
    return { data: { gebruikt: parsed.data.gebruikt } };
}
