/**
 * Meethistorie — periodes openen, afsluiten en teruglezen.
 *
 * Bij een verhuizing, een nieuw apparaat of een andere indeling verandert de
 * werkelijkheid in één keer. Dan wordt de historie afgesloten en begint de
 * teller opnieuw op nul. Nooit oude en nieuwe metingen door elkaar middelen.
 *
 * De schatter leest daarom altijd binnen één periode. Dat is de hele reden
 * dat deze tabel bestaat: het maakt "opnieuw beginnen" een expliciete
 * handeling met een reden erbij, in plaats van iets wat je vergeet.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Meting } from './schatter';

/**
 * De lopende periode, of een nieuwe als er nog geen is.
 *
 * Er kan er maar één tegelijk open staan — dat is een unieke index in de
 * database en niet iets wat deze functie moet bewaken.
 */
export async function lopendePeriodeId(supabase: SupabaseClient, orgId: string): Promise<number | null> {
    const { data } = await supabase
        .from('meethistorie_periodes')
        .select('id')
        .eq('organization_id', orgId)
        .is('afgesloten_op', null)
        .maybeSingle();

    if (data?.id != null) return data.id as number;

    const { data: nieuw, error } = await supabase
        .from('meethistorie_periodes')
        .insert({ organization_id: orgId, reden: 'eerste periode' })
        .select('id')
        .maybeSingle();

    if (error) {
        /* Race: iemand anders was net eerder. Dan is er nu wel één. */
        const { data: alsnog } = await supabase
            .from('meethistorie_periodes')
            .select('id')
            .eq('organization_id', orgId)
            .is('afgesloten_op', null)
            .maybeSingle();
        return (alsnog?.id as number) ?? null;
    }
    return (nieuw?.id as number) ?? null;
}

/**
 * Sluit de lopende periode af en begin een nieuwe.
 *
 * Geeft terug hoeveel metingen er in de afgesloten periode zaten — dat is
 * wat je kwijtraakt, en dat hoort de kok te zien voordat hij het doet.
 */
export async function resetMeethistorie(
    supabase: SupabaseClient,
    orgId: string,
    reden: string,
): Promise<{ afgeslotenPeriodeId: number | null; nieuwePeriodeId: number | null; metingenInOudePeriode: number }> {
    const huidige = await lopendePeriodeId(supabase, orgId);

    let metingen = 0;
    if (huidige != null) {
        const { count } = await supabase
            .from('taakmetingen')
            .select('id', { count: 'exact', head: true })
            .eq('organization_id', orgId)
            .eq('periode_id', huidige);
        metingen = count ?? 0;

        await supabase
            .from('meethistorie_periodes')
            .update({ afgesloten_op: new Date().toISOString(), reden })
            .eq('id', huidige)
            .eq('organization_id', orgId);
    }

    const { data: nieuw } = await supabase
        .from('meethistorie_periodes')
        .insert({ organization_id: orgId, reden: `na: ${reden}` })
        .select('id')
        .maybeSingle();

    return {
        afgeslotenPeriodeId: huidige,
        nieuwePeriodeId: (nieuw?.id as number) ?? null,
        metingenInOudePeriode: metingen,
    };
}

/**
 * Metingen voor één bewerking binnen de lopende periode.
 *
 * Let op de sleutel: **bewerking + component**, niet de receptstap. Bij
 * duizend gerechten haalt een losse stap nooit vijf metingen; "ui snipperen"
 * haalt ze binnen een week, of het nu in gerecht 12 of gerecht 840 zit.
 */
export async function metingenVoorBewerking(
    supabase: SupabaseClient,
    orgId: string,
    periodeId: number,
    bewerkingCode: string,
    componentId: number | null,
    limiet = 10,
): Promise<Meting[]> {
    let q = supabase
        .from('taakmetingen')
        .select('werkelijke_min, hoeveelheid, stuk_gewicht_kg, tijdstip_van_dag')
        .eq('organization_id', orgId)
        .eq('periode_id', periodeId)
        .eq('bewerking_code', bewerkingCode)
        .eq('onderbroken', false)
        .order('created_at', { ascending: false })
        .limit(limiet);

    q = componentId == null ? q.is('component_id', null) : q.eq('component_id', componentId);

    const { data } = await q;
    return ((data ?? []) as Array<Record<string, number | null>>)
        .map((r) => ({
            werkelijkeMin: Number(r.werkelijke_min),
            hoeveelheid: r.hoeveelheid,
            stukGewichtKg: r.stuk_gewicht_kg,
            tijdstipVanDag: r.tijdstip_van_dag,
        }))
        /* Terug in chronologische volgorde: de schatter kijkt naar "de laatste
           tien" en verwacht ze op volgorde van gebeuren. */
        .reverse();
}
