/**
 * Wat het keukenscherm en de tablet over partijen moeten weten — kant-en-klaar,
 * zodat die schermen zelf niets rekenen (bouwregel van de keukenplanner).
 *
 *   nu.partij    bij de taak van nu: is dit een eindstap met een component,
 *                en welke verpakking hoort erbij (voor de afrond-sheet).
 *   afTeMaken    taken die klaar zijn maar nog geen partij hebben:
 *                "Bereid — afmaken met sticker". Op de wand als blok, op de
 *                tablet als lijst met knop.
 *
 * Aparte module naast de planner: de planner blijft puur en ongewijzigd.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Taak } from '../keukenplanner/types';
import { eindstapIds } from './eindstap';
import { normaliseerEenheid, type Eenheid } from './eenheden';

export interface PartijVoorstel {
    mogelijk: boolean;
    taakId: number;
    componentId: number;
    componentNaam: string;
    eventId: number | null;
    gerechtId: string | null;
    hoeveelheid: number | null;
    eenheid: Eenheid | null;
    verpakkingGrootte: number | null;
    verpakkingEenheid: Eenheid | null;
    bewaarmethode: string | null;
    bewaaradvies: string | null;
    houdbaarheidDagen: number | null;
    stapHoudbaarheidDagen: number | null;
    /** Al een partij? Dan is dit hem. */
    partij: { id: string; partijnummer: string; aantalEenheden: number; labelsGeprint: number } | null;
}

export interface AfTeMakenRegel {
    taakId: number;
    titel: string;
    componentId: number;
    componentNaam: string;
    hoeveelheid: number | null;
    eenheid: string | null;
    gerechtNaam: string | null;
    klaarOm: string | null;
    /** Voor de afrond-sheet op de tablet. */
    verpakkingGrootte: number | null;
    verpakkingEenheid: Eenheid | null;
    bewaarmethode: string | null;
    bewaaradvies: string | null;
    houdbaarheidDagen: number | null;
    stapHoudbaarheidDagen: number | null;
}

export interface PartijStand {
    nuPartij: PartijVoorstel | null;
    afTeMaken: AfTeMakenRegel[];
}

interface ComponentRij {
    id: number;
    name: string;
    verpakking_grootte: number | null;
    verpakking_eenheid: string | null;
    bewaarmethode: string | null;
    bewaaradvies: string | null;
    houdbaarheid_na_bewerking_dagen: number | null;
}

export async function laadPartijStand(
    supabase: SupabaseClient,
    orgId: string,
    taken: Taak[],
    nuTaakId: number | null,
): Promise<PartijStand> {
    const eind = eindstapIds(taken.map((t) => ({ id: t.id, componentId: t.componentId, eventId: t.eventId, hangtAfVan: t.hangtAfVan, geplandOp: t.geplandOp })));
    const relevant = taken.filter((t) => eind.has(t.id) && t.componentId != null);
    if (relevant.length === 0) return { nuPartij: null, afTeMaken: [] };

    const taakIds = relevant.map((t) => t.id);
    const componentIds = [...new Set(relevant.map((t) => t.componentId as number))];

    const [partijRes, compRes] = await Promise.all([
        supabase
            .from('productie_partijen')
            .select('id, partijnummer, prep_task_id, aantal_eenheden')
            .eq('organization_id', orgId)
            .in('prep_task_id', taakIds),
        supabase
            .from('components')
            .select('id, name, verpakking_grootte, verpakking_eenheid, bewaarmethode, bewaaradvies, houdbaarheid_na_bewerking_dagen')
            .eq('organization_id', orgId)
            .in('id', componentIds),
    ]);

    const partijPerTaak = new Map<number, { id: string; partijnummer: string; aantal_eenheden: number }>();
    for (const p of (partijRes.data ?? []) as Array<{ id: string; partijnummer: string; prep_task_id: number; aantal_eenheden: number }>) {
        partijPerTaak.set(p.prep_task_id, p);
    }
    const compPerId = new Map<number, ComponentRij>();
    for (const c of (compRes.data ?? []) as ComponentRij[]) compPerId.set(c.id, c);

    /* Labels geprint per partij — alleen nodig voor de taak van nu. */
    let labelsGeprint = 0;
    const nuTaak = nuTaakId != null ? relevant.find((t) => t.id === nuTaakId) ?? null : null;
    const nuPartijRij = nuTaak ? partijPerTaak.get(nuTaak.id) ?? null : null;
    if (nuPartijRij) {
        const { count } = await supabase
            .from('voorraad_eenheden')
            .select('id', { count: 'exact', head: true })
            .eq('partij_id', nuPartijRij.id)
            .not('label_geprint_at', 'is', null);
        labelsGeprint = count ?? 0;
    }

    const nuPartij: PartijVoorstel | null = nuTaak ? maakVoorstel(nuTaak, compPerId.get(nuTaak.componentId as number) ?? null, nuPartijRij, labelsGeprint) : null;

    const afTeMaken: AfTeMakenRegel[] = relevant
        .filter((t) => t.status === 'done' && !partijPerTaak.has(t.id))
        .map((t) => ({
            taakId: t.id,
            titel: t.titel,
            componentId: t.componentId as number,
            componentNaam: compPerId.get(t.componentId as number)?.name ?? t.titel,
            hoeveelheid: t.hoeveelheid ?? null,
            eenheid: t.eenheid ?? null,
            gerechtNaam: t.gerechtNaam ?? null,
            klaarOm: t.bevestigdEind ?? null,
            verpakkingGrootte: compPerId.get(t.componentId as number)?.verpakking_grootte ?? null,
            verpakkingEenheid: normaliseerEenheid(compPerId.get(t.componentId as number)?.verpakking_eenheid),
            bewaarmethode: compPerId.get(t.componentId as number)?.bewaarmethode ?? null,
            bewaaradvies: compPerId.get(t.componentId as number)?.bewaaradvies ?? null,
            houdbaarheidDagen: compPerId.get(t.componentId as number)?.houdbaarheid_na_bewerking_dagen ?? null,
            stapHoudbaarheidDagen: t.houdbaarheidNaDagen ?? null,
        }));

    return { nuPartij, afTeMaken };
}

function maakVoorstel(
    t: Taak,
    c: ComponentRij | null,
    partij: { id: string; partijnummer: string; aantal_eenheden: number } | null,
    labelsGeprint: number,
): PartijVoorstel {
    return {
        mogelijk: true,
        taakId: t.id,
        componentId: t.componentId as number,
        componentNaam: c?.name ?? t.titel,
        eventId: t.eventId ?? null,
        gerechtId: null,
        hoeveelheid: t.hoeveelheid ?? null,
        eenheid: normaliseerEenheid(t.eenheid),
        verpakkingGrootte: c?.verpakking_grootte ?? null,
        verpakkingEenheid: normaliseerEenheid(c?.verpakking_eenheid),
        bewaarmethode: c?.bewaarmethode ?? null,
        bewaaradvies: c?.bewaaradvies ?? null,
        houdbaarheidDagen: c?.houdbaarheid_na_bewerking_dagen ?? null,
        stapHoudbaarheidDagen: t.houdbaarheidNaDagen ?? null,
        partij: partij ? { id: partij.id, partijnummer: partij.partijnummer, aantalEenheden: partij.aantal_eenheden, labelsGeprint } : null,
    };
}

/** Voor de tablet: het voorstel voor een willekeurige (klaar-gemelde) taak uit `afTeMaken`. */
export async function laadPartijVoorstelVoorTaak(
    supabase: SupabaseClient,
    orgId: string,
    taken: Taak[],
    taakId: number,
): Promise<PartijVoorstel | null> {
    const stand = await laadPartijStand(supabase, orgId, taken, taakId);
    return stand.nuPartij;
}
