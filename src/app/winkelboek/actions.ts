/**
 * Server Actions voor Boekhouding winkel: een eigen kasregel toevoegen of
 * verwijderen (geld dat je zelf uit of in de la doet).
 *
 * Huisregels (zoals src/app/winkel/actions.ts):
 *  - Zod op alle invoer; re-auth binnen de action.
 *  - De organisatie komt uit organization_members en gaat altijd expliciet mee.
 *  - Een afgesloten maand verandert niet meer: eerst heropenen onder Geld →
 *    Boekhouder.
 */

'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createServerSupabase } from '@/lib/supabase-server';
import { datumNL } from '@/lib/winkel/afdelingen';
import { centenUitInvoer, KasRegelSchema } from '@/lib/winkelboek/kasInvoer';
import { isNogNiet } from '@/lib/winkelboek/laden';

type ActionResult<T = unknown> = { data: T } | { error: string };

const NIET_INGELOGD = { error: 'Je bent niet ingelogd.' };
const NOG_NIET_AAN = { error: 'Eigen kasregels zijn nog niet ingeschakeld.' };
const MAAND_DICHT = { error: 'Deze maand is afgesloten. Heropen hem eerst onder Geld → Boekhouder.' };

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

async function maandAfgesloten(supabase: SupabaseClient, orgId: string, datum: string): Promise<boolean> {
    const { data } = await supabase.from('maand_afsluitingen').select('id')
        .eq('organization_id', orgId).eq('jaar', Number(datum.slice(0, 4))).eq('maand', Number(datum.slice(5, 7)))
        .limit(1).maybeSingle();
    return !!data;
}

export async function voegKasRegelToe(invoer: unknown): Promise<ActionResult<{ id: string }>> {
    const s = await ingelogdMetOrg();
    if (!s) return NIET_INGELOGD;

    const v = KasRegelSchema.safeParse(invoer);
    if (!v.success) return { error: v.error.issues[0]?.message ?? 'Controleer de velden.' };
    const regel = v.data;

    if (regel.datum > datumNL(new Date())) return { error: 'Een kasregel kan niet in de toekomst liggen.' };
    if (await maandAfgesloten(s.supabase, s.orgId, regel.datum)) return MAAND_DICHT;

    const cents = centenUitInvoer(regel.bedrag);
    if (cents === null) return { error: 'Vul een bedrag in, met een komma voor centen.' };

    const { data, error } = await s.supabase.from('winkel_kas_mutaties').insert({
        organization_id: s.orgId,
        datum: regel.datum,
        bedrag_cents: regel.richting === 'uit' ? -cents : cents,
        reden: regel.reden,
        omschrijving: regel.omschrijving,
        moment: regel.moment,
    }).select('id').single();
    if (error) {
        if (isNogNiet(error)) return NOG_NIET_AAN;
        console.error('[winkelboek] kasregel toevoegen mislukt:', error.message);
        return { error: 'De regel kon niet bewaard worden. Probeer het opnieuw.' };
    }

    revalidatePath('/winkelboek', 'layout');
    return { data: { id: String(data.id) } };
}

export async function verwijderKasRegel(id: string): Promise<ActionResult<true>> {
    const s = await ingelogdMetOrg();
    if (!s) return NIET_INGELOGD;
    if (!z.string().uuid().safeParse(id).success) return { error: 'Deze regel bestaat niet meer.' };

    const { data: rij, error: leesFout } = await s.supabase.from('winkel_kas_mutaties').select('id, datum')
        .eq('organization_id', s.orgId).eq('id', id).maybeSingle();
    if (leesFout) return isNogNiet(leesFout) ? NOG_NIET_AAN : { error: 'De regel kon niet gelezen worden. Probeer het opnieuw.' };
    if (!rij) return { error: 'Deze regel bestaat niet meer.' };
    if (await maandAfgesloten(s.supabase, s.orgId, String(rij.datum))) return MAAND_DICHT;

    const { error } = await s.supabase.from('winkel_kas_mutaties').delete().eq('organization_id', s.orgId).eq('id', id);
    if (error) {
        console.error('[winkelboek] kasregel verwijderen mislukt:', error.message);
        return { error: 'De regel kon niet verwijderd worden. Probeer het opnieuw.' };
    }

    revalidatePath('/winkelboek', 'layout');
    return { data: true };
}
