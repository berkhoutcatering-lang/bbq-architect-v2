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
    /** HACCP-metingen bij deze partij of de taak erachter, oudste eerst. */
    haccp: Array<{ id: number; tijd: string; check_type: string; temp: number | null; status: string; chef: string | null; notitie: string | null }>;
    /** Herkomst: de ingrediënten van de bouwsteen en waar ze het laatst vandaan kwamen (bon/leverancier). Eerlijk tot bon-niveau — leverancierslots worden (nog) niet vastgelegd. */
    herkomst: Array<{ naam: string; hoeveelheid: number | null; eenheid: string | null; inventory_id: number | null; laatsteOntvangst: { datum: string; winkel: string | null; leverancier: string | null; bon_id: number | null } | null }>;
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

    const [eenhedenRes, compRes, allergRes, jobsRes, eventRes, persRes, haccpRes, ingrRes] = await Promise.all([
        supabase.from('voorraad_eenheden').select('*').eq('partij_id', partijId).order('volgnummer', { ascending: true }),
        supabase.from('components').select('id, name, bewaaradvies').eq('id', p.component_id).maybeSingle(),
        supabase.from('component_allergens').select('allergen_code, allergens(nl_label)').eq('component_id', p.component_id).eq('organization_id', orgId),
        supabase.from('print_jobs').select(JOB_KOLOMMEN).eq('partij_id', partijId).order('created_at', { ascending: false }).limit(50),
        p.event_id ? supabase.from('events').select('id, name, date').eq('id', p.event_id).maybeSingle() : Promise.resolve({ data: null }),
        p.personeel_id ? supabase.from('personeel').select('id, naam').eq('id', p.personeel_id as string).maybeSingle() : Promise.resolve({ data: null }),
        supabase.from('haccp_records')
            .select('id, created_at, check_type, type, temp, status, chef, notitie, partij_id, prep_task_id')
            .eq('organization_id', orgId)
            .or(p.prep_task_id ? `partij_id.eq.${partijId},prep_task_id.eq.${p.prep_task_id}` : `partij_id.eq.${partijId}`)
            .order('created_at', { ascending: true })
            .limit(100),
        supabase.from('component_ingredients')
            .select('inventory_id, fallback_name, quantity, unit, inventory(id, naam)')
            .eq('component_id', p.component_id)
            .eq('organization_id', orgId),
    ]);

    const haccp = ((haccpRes.data ?? []) as Array<Record<string, unknown>>).map((r) => ({
        id: Number(r.id), tijd: String(r.created_at), check_type: String(r.check_type ?? r.type ?? ''),
        temp: r.temp == null ? null : Number(r.temp), status: String(r.status ?? ''), chef: (r.chef as string | null) ?? null, notitie: (r.notitie as string | null) ?? null,
    }));

    /* Herkomst: per ingrediënt de laatste ontvangst (bon) — tot bon-niveau. */
    const ingr = ((ingrRes.data ?? []) as Array<Record<string, unknown>>).map((r) => {
        const inv = r.inventory as { id: number; naam: string } | { id: number; naam: string }[] | null;
        const invObj = Array.isArray(inv) ? inv[0] : inv;
        return { naam: invObj?.naam ?? String(r.fallback_name ?? '—'), hoeveelheid: r.quantity == null ? null : Number(r.quantity), eenheid: (r.unit as string | null) ?? null, inventory_id: invObj?.id ?? (r.inventory_id == null ? null : Number(r.inventory_id)) };
    });
    const invIds = ingr.map((i) => i.inventory_id).filter((x): x is number => x != null);
    const laatsteOntvangst = new Map<number, PartijDetail['herkomst'][number]['laatsteOntvangst']>();
    if (invIds.length > 0) {
        const { data: moves } = await supabase
            .from('stock_movements')
            .select('inventory_id, created_at, bon_id, bonnen(id, winkel, datum, leverancier_id, leveranciers(naam))')
            .eq('organization_id', orgId)
            .eq('type', 'receive')
            .in('inventory_id', invIds)
            .order('created_at', { ascending: false })
            .limit(200);
        for (const m of (moves ?? []) as Array<Record<string, unknown>>) {
            const id = Number(m.inventory_id);
            if (laatsteOntvangst.has(id)) continue;
            const bonRaw = m.bonnen as Record<string, unknown> | Record<string, unknown>[] | null;
            const bon = Array.isArray(bonRaw) ? bonRaw[0] : bonRaw;
            const levRaw = bon?.leveranciers as { naam: string } | { naam: string }[] | null | undefined;
            const lev = Array.isArray(levRaw) ? levRaw[0] : levRaw;
            laatsteOntvangst.set(id, {
                datum: String(bon?.datum ?? m.created_at), winkel: (bon?.winkel as string | null) ?? null,
                leverancier: lev?.naam ?? null, bon_id: m.bon_id == null ? null : Number(m.bon_id),
            });
        }
    }
    const herkomst: PartijDetail['herkomst'] = ingr.map((i) => ({ ...i, laatsteOntvangst: i.inventory_id != null ? laatsteOntvangst.get(i.inventory_id) ?? null : null }));

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
            haccp,
            herkomst,
        },
    };
}
