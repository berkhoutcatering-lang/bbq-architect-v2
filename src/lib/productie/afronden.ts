/**
 * rondPartijAf — de ene weg van "productie klaar" naar partij + eenheden +
 * voorraad. Wordt aangeroepen door /api/prep/complete-task (tablet), de
 * kookbord-route en een eventuele handmatige afronding; nergens anders wordt
 * de RPC aangeroepen.
 *
 * Volgorde:
 *   1. verpakking bepalen: uit de invoer, anders uit het component
 *      (staat hij nergens → fout "verpakking ontbreekt", de sheet vraagt hem);
 *   2. eenheden berekenen (src/lib/productie/eenheden.ts);
 *   3. THT bepalen (stap > component > geen);
 *   4. HACCP-vrijgave controleren (fase 3; nu: geen verplichte punten → vrij);
 *   5. productie_partij_afronden (één transactie, idempotent);
 *   6. audit-regel.
 *
 * Verpakking die de kok hier voor het eerst invult, wordt op het component
 * bewaard: de volgende keer hoeft het niet meer gevraagd te worden.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { appendKdsAudit } from '../prep/auditLog';
import { logHaccpCheck } from '../dal/haccp';
import { berekenEenheden, normaliseerEenheid, verdeelOverAantal, type Eenheid, type EenheidRegel } from './eenheden';
import { bepaalTht, vandaagIso } from './tht';
import { beoordeel, bepaalVrijgave, vrijgaveTekst, type HaccpMeting, type HaccpPunt } from './vrijgave';

export interface AfrondenInput {
    componentId: number;
    idempotencyKey: string;
    actualQty: number;
    eenheid: string;
    verpakkingGrootte?: number | null;
    verpakkingEenheid?: string | null;
    /** Door de kok gecorrigeerd aantal; null = rekenregel. */
    aantalEenheden?: number | null;
    prepTaskId?: number | null;
    mepItemId?: number | null;
    gerechtId?: string | null;
    eventId?: number | null;
    geplandeHoeveelheid?: number | null;
    productiedatum?: string | null;
    tht?: string | null;
    stapHoudbaarheidDagen?: number | null;
    bewaarmethode?: 'vers' | 'vries' | 'houdbaar' | null;
    bewaaradvies?: string | null;
    opslagLocatieId?: string | null;
    personeelId?: string | null;
    /** HACCP-metingen uit de sheet; worden na de partij als records gelogd. */
    metingen?: Array<{ type: string; temp: number | null }> | null;
    notitie?: string | null;
}

export interface PartijRij {
    id: string;
    partijnummer: string;
    component_id: number;
    aantal_eenheden: number;
    geproduceerde_hoeveelheid: number;
    eenheid: string;
    verpakking_grootte: number;
    verpakking_eenheid: string;
    productiedatum: string;
    tht: string | null;
    bewaaradvies: string | null;
    status: string;
    inventory_id: number | null;
    [k: string]: unknown;
}

export interface EenheidRij {
    id: string;
    volgnummer: number;
    code: string;
    scan_token: string;
    inhoud: number;
    eenheid: string;
    status: string;
    label_geprint_at: string | null;
    label_print_count: number;
    [k: string]: unknown;
}

export type AfrondenUitkomst =
    | { ok: true; bestond: boolean; partij: PartijRij; eenheden: EenheidRij[] }
    | { ok: false; status: number; code: 'verpakking_ontbreekt' | 'component_onbekend' | 'ongeldig' | 'haccp_ontbreekt' | 'db'; error: string; details?: unknown };

interface ComponentProductie {
    id: number;
    name: string;
    verpakking_grootte: number | null;
    verpakking_eenheid: string | null;
    bewaarmethode: string | null;
    bewaaradvies: string | null;
    houdbaarheid_na_bewerking_dagen: number | null;
}

export async function rondPartijAf(
    supabase: SupabaseClient,
    ctx: { orgId: string; userId: string },
    input: AfrondenInput,
): Promise<AfrondenUitkomst> {
    const { data: comp, error: compErr } = await supabase
        .from('components')
        .select('id, name, verpakking_grootte, verpakking_eenheid, bewaarmethode, bewaaradvies, houdbaarheid_na_bewerking_dagen')
        .eq('id', input.componentId)
        .eq('organization_id', ctx.orgId)
        .maybeSingle();
    if (compErr) return { ok: false, status: 500, code: 'db', error: compErr.message };
    if (!comp) return { ok: false, status: 404, code: 'component_onbekend', error: 'Bouwsteen niet gevonden' };
    const c = comp as ComponentProductie;

    /* 1. Verpakking: invoer wint, anders het component. */
    const verpakkingGrootte = input.verpakkingGrootte ?? c.verpakking_grootte ?? null;
    const verpakkingEenheid = normaliseerEenheid(input.verpakkingEenheid ?? c.verpakking_eenheid);
    if (!verpakkingGrootte || !(verpakkingGrootte > 0) || !verpakkingEenheid) {
        return { ok: false, status: 409, code: 'verpakking_ontbreekt', error: `Voor "${c.name}" is nog geen verpakking vastgelegd (bv. 1 kg per zak)` };
    }
    const eenheid = normaliseerEenheid(input.eenheid);
    if (!eenheid) return { ok: false, status: 400, code: 'ongeldig', error: `Onbekende eenheid "${input.eenheid}"` };

    /* 2. Eenheden. */
    const uitkomst = input.aantalEenheden != null
        ? verdeelOverAantal(input.actualQty, eenheid, input.aantalEenheden, verpakkingEenheid)
        : berekenEenheden(input.actualQty, eenheid, verpakkingGrootte, verpakkingEenheid);
    if (uitkomst.fout) return { ok: false, status: 400, code: 'ongeldig', error: uitkomst.fout };

    /* 3. THT. */
    const productiedatum = input.productiedatum ?? vandaagIso();
    const tht = input.tht !== undefined && input.tht !== null
        ? input.tht
        : bepaalTht(productiedatum, { stapDagen: input.stapHoudbaarheidDagen, componentDagen: c.houdbaarheid_na_bewerking_dagen }).tht;

    const bewaarmethode = input.bewaarmethode ?? (c.bewaarmethode as AfrondenInput['bewaarmethode']) ?? null;
    const bewaaradvies = (input.bewaaradvies ?? c.bewaaradvies ?? null)?.trim() || null;

    /* 4. HACCP-vrijgave: de verplichte punten van de bouwsteen, tegen wat er
       al gemeten is op de taak plus wat de sheet nu meestuurt. Niet vrij →
       geen partij, geen voorraad; de sheet toont wat ontbreekt. */
    const { data: puntRijen } = await supabase
        .from('component_haccp_points')
        .select('id, type, threshold_value, threshold_unit, note, verplicht_voor_vrijgave')
        .eq('component_id', c.id)
        .eq('organization_id', ctx.orgId);
    const punten = ((puntRijen ?? []) as Array<Record<string, unknown>>).map((r): HaccpPunt => ({
        id: Number(r.id), type: String(r.type),
        threshold_value: r.threshold_value == null ? null : Number(r.threshold_value),
        threshold_unit: (r.threshold_unit as string | null) ?? null,
        note: (r.note as string | null) ?? null,
        verplicht_voor_vrijgave: r.verplicht_voor_vrijgave === true,
    }));
    const eerdereMetingen: HaccpMeting[] = [];
    if (input.prepTaskId != null && punten.some((p) => p.verplicht_voor_vrijgave)) {
        const { data: recs } = await supabase
            .from('haccp_records')
            .select('check_type, type, temp, status, created_at')
            .eq('organization_id', ctx.orgId)
            .eq('prep_task_id', input.prepTaskId)
            .order('created_at', { ascending: true });
        for (const r of (recs ?? []) as Array<Record<string, unknown>>) {
            eerdereMetingen.push({ type: String(r.check_type ?? r.type ?? ''), temp: r.temp == null ? null : Number(r.temp), status: (r.status as string | null) ?? null });
        }
    }
    const nieuweMetingen: HaccpMeting[] = (input.metingen ?? []).map((m) => ({ type: m.type, temp: m.temp }));
    const vrijgave = bepaalVrijgave(punten, [...eerdereMetingen, ...nieuweMetingen]);
    if (!vrijgave.vrij) {
        return {
            ok: false, status: 409, code: 'haccp_ontbreekt', error: vrijgaveTekst(vrijgave),
            details: { ontbrekend: vrijgave.ontbrekend, afwijkend: vrijgave.afwijkend },
        };
    }
    const haccpSnapshot = punten.length > 0 || nieuweMetingen.length > 0
        ? { beoordeeldOp: new Date().toISOString(), vrij: true, punten: vrijgave.beoordeeld, nieuweMetingen }
        : null;

    /* 5. De transactie. */
    const { data, error } = await supabase.rpc('productie_partij_afronden', {
        p_org: ctx.orgId,
        p_idempotency_key: input.idempotencyKey,
        p_component_id: input.componentId,
        p_geproduceerde_hoeveelheid: input.actualQty,
        p_eenheid: eenheid,
        p_verpakking_grootte: verpakkingGrootte,
        p_verpakking_eenheid: verpakkingEenheid,
        p_eenheden: uitkomst.eenheden.map(alsJson),
        p_productiedatum: productiedatum,
        p_tht: tht,
        p_bewaarmethode: bewaarmethode,
        p_bewaaradvies: bewaaradvies,
        p_opslag_locatie_id: input.opslagLocatieId ?? null,
        p_personeel_id: input.personeelId ?? null,
        p_prep_task_id: input.prepTaskId ?? null,
        p_mep_item_id: input.mepItemId ?? null,
        p_gerecht_id: input.gerechtId ?? null,
        p_event_id: input.eventId ?? null,
        p_geplande_hoeveelheid: input.geplandeHoeveelheid ?? null,
        p_haccp_snapshot: haccpSnapshot,
        p_notitie: input.notitie ?? null,
    });
    if (error) return { ok: false, status: 500, code: 'db', error: error.message };
    const r = data as { bestond: boolean; partij: PartijRij; eenheden: EenheidRij[] };

    /* Verpakking die nu voor het eerst is ingevuld, op het component bewaren
       (best-effort: de partij staat al). */
    if (!r.bestond && (c.verpakking_grootte == null || c.verpakking_eenheid == null || (input.bewaaradvies && !c.bewaaradvies) || (input.bewaarmethode && !c.bewaarmethode))) {
        const update: Record<string, unknown> = {};
        if (c.verpakking_grootte == null) update.verpakking_grootte = verpakkingGrootte;
        if (c.verpakking_eenheid == null) update.verpakking_eenheid = verpakkingEenheid;
        if (input.bewaaradvies && !c.bewaaradvies) update.bewaaradvies = bewaaradvies;
        if (input.bewaarmethode && !c.bewaarmethode) update.bewaarmethode = bewaarmethode;
        if (Object.keys(update).length > 0) {
            await supabase.from('components').update(update).eq('id', c.id).eq('organization_id', ctx.orgId);
        }
    }

    /* 5b. De metingen uit de sheet als échte HACCP-records (append-only),
       gekoppeld aan taak, partij en bouwsteen. Status volgens de drempel van
       het punt (die wint van de preset). Best-effort: de partij staat al. */
    if (!r.bestond && nieuweMetingen.length > 0) {
        const chef = await chefNaam(supabase, ctx.orgId, input.personeelId ?? null);
        for (const m of nieuweMetingen) {
            const punt = punten.find((p) => p.type === m.type) ?? null;
            const b = punt ? beoordeel(punt, m.temp) : null;
            await logHaccpCheck(supabase, ctx.orgId, ctx.userId, {
                planItemId: null, eventId: input.eventId ?? null, gerechtId: input.gerechtId ?? null,
                dishLabel: c.name, checkType: m.type, temp: m.temp, notitie: `Partij ${r.partij.partijnummer}`,
                chef, prepTaskId: input.prepTaskId ?? null, partijId: r.partij.id, componentId: c.id,
                statusOverride: b === 'ok' ? 'ok' : b === 'afwijking' ? 'afwijking' : null,
            });
        }
    }

    /* 6. Audit. */
    if (!r.bestond) {
        await appendKdsAudit(supabase, {
            orgId: ctx.orgId,
            action: 'partij_aangemaakt',
            taskId: input.prepTaskId ?? null,
            personeelId: input.personeelId ?? null,
            metadata: {
                partij_id: r.partij.id, partijnummer: r.partij.partijnummer,
                aantal_eenheden: r.partij.aantal_eenheden, hoeveelheid: input.actualQty, eenheid,
                aantal_gecorrigeerd: input.aantalEenheden != null,
            },
        });
    }

    return { ok: true, bestond: r.bestond, partij: r.partij, eenheden: r.eenheden ?? [] };
}

async function chefNaam(supabase: SupabaseClient, orgId: string, personeelId: string | null): Promise<string> {
    if (!personeelId) return 'keuken';
    const { data } = await supabase.from('personeel').select('naam').eq('id', personeelId).eq('organization_id', orgId).maybeSingle();
    return (data as { naam: string } | null)?.naam ?? 'keuken';
}

function alsJson(e: EenheidRegel): { volgnummer: number; inhoud: number; eenheid: Eenheid } {
    return { volgnummer: e.volgnummer, inhoud: e.inhoud, eenheid: e.eenheid };
}
