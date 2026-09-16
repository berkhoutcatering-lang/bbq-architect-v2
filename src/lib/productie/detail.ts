/**
 * Eén partij ophalen zoals de schermen hem nodig hebben: de partij zelf, de
 * eenheden, het component (met allergenen in mensentaal), de printjobs en
 * — bij een scan — de gescande eenheid vooraan. Fase 4 hangt hier HACCP en
 * de herkomst (componenten → ingrediënten → bonnen) aan.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { EenheidRij, PartijRij } from './afronden';
import { JOB_KOLOMMEN } from '../labelprinter/db';

export interface PartijDetail {
    partij: PartijRij;
    eenheden: EenheidRij[];
    component: { id: number; name: string; allergenen: string[]; bewaaradvies: string | null } | null;
    event: { id: number; name: string; date: string } | null;
    personeel: { id: string; naam: string } | null;
    printJobs: Array<Record<string, unknown>>;
    /** Bij een scan: de eenheid waarvan de QR gescand is. */
    gescand: EenheidRij | null;
}

export type DetailUitkomst = { ok: true; data: PartijDetail } | { ok: false; status: number; error: string };

export async function laadPartijDetail(
    supabase: SupabaseClient,
    orgId: string,
    zoek: { partijId: string } | { scanToken: string },
): Promise<DetailUitkomst> {
    let partijId: string;
    let gescand: EenheidRij | null = null;

    if ('scanToken' in zoek) {
        const { data, error } = await supabase
            .from('voorraad_eenheden')
            .select('*')
            .eq('scan_token', zoek.scanToken)
            .eq('organization_id', orgId)
            .maybeSingle();
        if (error) return { ok: false, status: 500, error: error.message };
        if (!data) return { ok: false, status: 404, error: 'Onbekend label — hoort deze code bij jouw organisatie?' };
        gescand = data as EenheidRij;
        partijId = String((data as { partij_id: string }).partij_id);
    } else {
        partijId = zoek.partijId;
    }

    const { data: partij, error: pErr } = await supabase
        .from('productie_partijen')
        .select('*')
        .eq('id', partijId)
        .eq('organization_id', orgId)
        .maybeSingle();
    if (pErr) return { ok: false, status: 500, error: pErr.message };
    if (!partij) return { ok: false, status: 404, error: 'Partij niet gevonden' };
    const p = partij as PartijRij;

    const [eenhedenRes, compRes, allergRes, jobsRes, eventRes, persRes] = await Promise.all([
        supabase.from('voorraad_eenheden').select('*').eq('partij_id', partijId).order('volgnummer', { ascending: true }),
        supabase.from('components').select('id, name, bewaaradvies').eq('id', p.component_id).maybeSingle(),
        supabase.from('component_allergens').select('allergen_code, allergens(nl_label)').eq('component_id', p.component_id).eq('organization_id', orgId),
        supabase.from('print_jobs').select(JOB_KOLOMMEN).eq('partij_id', partijId).order('created_at', { ascending: false }).limit(50),
        p.event_id ? supabase.from('events').select('id, name, date').eq('id', p.event_id).maybeSingle() : Promise.resolve({ data: null }),
        p.personeel_id ? supabase.from('personeel').select('id, naam').eq('id', p.personeel_id as string).maybeSingle() : Promise.resolve({ data: null }),
    ]);

    const allergenen = ((allergRes.data ?? []) as Array<{ allergen_code: string; allergens: { nl_label: string } | { nl_label: string }[] | null }>)
        .map((r) => (Array.isArray(r.allergens) ? r.allergens[0]?.nl_label : r.allergens?.nl_label) ?? r.allergen_code)
        .filter((x): x is string => !!x);

    const comp = compRes.data as { id: number; name: string; bewaaradvies: string | null } | null;

    return {
        ok: true,
        data: {
            partij: p,
            eenheden: (eenhedenRes.data ?? []) as EenheidRij[],
            component: comp ? { id: comp.id, name: comp.name, allergenen, bewaaradvies: comp.bewaaradvies } : null,
            event: (eventRes.data as PartijDetail['event']) ?? null,
            personeel: (persRes.data as PartijDetail['personeel']) ?? null,
            printJobs: (jobsRes.data ?? []) as Array<Record<string, unknown>>,
            gescand,
        },
    };
}
