/**
 * Waar komt een partij vandaan? Uit een prep-taak (tablet), een MEP-item
 * (kookbord) of los (component + event). Deze module haalt de context op die
 * rondPartijAf nodig heeft — component, event, gerecht, geplande hoeveelheid,
 * houdbaarheid van de eindstap — en wie de kok is.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { AfrondenInput } from './afronden';
import type { PartijAfrondenInput } from './validators';

export interface BronContext {
    componentId: number;
    eventId: number | null;
    gerechtId: string | null;
    geplandeHoeveelheid: number | null;
    stapHoudbaarheidDagen: number | null;
    prepTaskId: number | null;
    mepItemId: number | null;
    personeelId: string | null;
}

export type BronUitkomst = { ok: true; ctx: BronContext } | { ok: false; status: number; error: string };

function isUuid(v: unknown): v is string {
    return typeof v === 'string' && /^[0-9a-f-]{36}$/i.test(v);
}

export async function personeelIdVanUser(supabase: SupabaseClient, orgId: string, userId: string): Promise<string | null> {
    const { data } = await supabase
        .from('personeel')
        .select('id')
        .eq('organization_id', orgId)
        .eq('user_id', userId)
        .limit(1)
        .maybeSingle();
    return (data as { id: string } | null)?.id ?? null;
}

export async function bepaalBron(
    supabase: SupabaseClient,
    orgId: string,
    userId: string,
    input: PartijAfrondenInput,
): Promise<BronUitkomst> {
    const personeelId = await personeelIdVanUser(supabase, orgId, userId);

    if (input.bron === 'prep_task') {
        const { data: taak, error } = await supabase
            .from('prep_tasks')
            .select('id, organization_id, component_id, event_id, gerecht_id, target_qty, status, assignee_id, recipe_step_id')
            .eq('id', input.prepTaskId)
            .eq('organization_id', orgId)
            .maybeSingle();
        if (error) return { ok: false, status: 500, error: error.message };
        const t = taak as { component_id: number | null; event_id: number | null; gerecht_id: string | null; target_qty: number | null; status: string; assignee_id: string | null; recipe_step_id: string | null } | null;
        if (!t) return { ok: false, status: 404, error: 'Taak niet gevonden' };
        if (t.component_id == null) return { ok: false, status: 409, error: 'Deze taak hoort niet bij een bouwsteen; er kan geen partij van gemaakt worden' };

        let stapDagen: number | null = null;
        if (t.recipe_step_id) {
            const { data: stap } = await supabase.from('recipe_steps').select('houdbaarheid_na_dagen').eq('id', t.recipe_step_id).maybeSingle();
            stapDagen = (stap as { houdbaarheid_na_dagen: number | null } | null)?.houdbaarheid_na_dagen ?? null;
        }
        return {
            ok: true,
            ctx: {
                componentId: t.component_id, eventId: t.event_id, gerechtId: isUuid(t.gerecht_id) ? t.gerecht_id : null,
                geplandeHoeveelheid: t.target_qty, stapHoudbaarheidDagen: stapDagen,
                prepTaskId: input.prepTaskId, mepItemId: null,
                personeelId: t.assignee_id ?? personeelId,
            },
        };
    }

    if (input.bron === 'mep_item') {
        const { data: item, error } = await supabase
            .from('mep_items')
            .select('id, component_id, event_id, gerecht_id, status')
            .eq('id', input.mepItemId)
            .eq('organization_id', orgId)
            .maybeSingle();
        if (error) return { ok: false, status: 500, error: error.message };
        const m = item as { component_id: number; event_id: number; gerecht_id: string | null } | null;
        if (!m) return { ok: false, status: 404, error: 'MEP-item niet gevonden' };
        return {
            ok: true,
            ctx: {
                componentId: m.component_id, eventId: m.event_id, gerechtId: isUuid(m.gerecht_id) ? m.gerecht_id : null,
                geplandeHoeveelheid: null, stapHoudbaarheidDagen: null,
                prepTaskId: null, mepItemId: input.mepItemId, personeelId,
            },
        };
    }

    return {
        ok: true,
        ctx: {
            componentId: input.componentId, eventId: input.eventId, gerechtId: null,
            geplandeHoeveelheid: null, stapHoudbaarheidDagen: null,
            prepTaskId: null, mepItemId: null, personeelId,
        },
    };
}

/** Van validator-blok + bron-context naar de invoer van rondPartijAf. */
export function naarAfrondenInput(input: PartijAfrondenInput, ctx: BronContext): AfrondenInput {
    return {
        componentId: ctx.componentId,
        idempotencyKey: input.idempotencyKey,
        actualQty: input.actualQty,
        eenheid: input.eenheid,
        verpakkingGrootte: input.verpakkingGrootte,
        verpakkingEenheid: input.verpakkingEenheid,
        aantalEenheden: input.aantalEenheden,
        prepTaskId: ctx.prepTaskId,
        mepItemId: ctx.mepItemId,
        gerechtId: ctx.gerechtId,
        eventId: ctx.eventId,
        geplandeHoeveelheid: ctx.geplandeHoeveelheid,
        tht: input.tht,
        stapHoudbaarheidDagen: ctx.stapHoudbaarheidDagen,
        bewaarmethode: input.bewaarmethode,
        bewaaradvies: input.bewaaradvies,
        opslagLocatieId: input.opslagLocatieId,
        personeelId: ctx.personeelId,
        notitie: input.notitie,
    };
}
