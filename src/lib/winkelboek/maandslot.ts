/**
 * Is de boekhoudmaand van een datum afgesloten (Geld → Boekhouder)? Een eigen
 * kasregel in een afgesloten maand verandert niet meer.
 *
 * Kan het niet nagegaan worden, dan is het antwoord 'onbekend' en nooit 'open':
 * een leesfout mag geen deur openzetten.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { isNogNiet } from './laden';

export type MaandSlot = 'open' | 'dicht' | 'onbekend';

export async function maandSlot(sb: SupabaseClient, orgId: string, datum: string): Promise<MaandSlot> {
    const { data, error } = await sb.from('maand_afsluitingen').select('id')
        .eq('organization_id', orgId).eq('jaar', Number(datum.slice(0, 4))).eq('maand', Number(datum.slice(5, 7)))
        .limit(1).maybeSingle();
    /* Bestaat de tabel niet, dan valt er niets af te sluiten. */
    if (error) return isNogNiet(error) ? 'open' : 'onbekend';
    return data ? 'dicht' : 'open';
}
