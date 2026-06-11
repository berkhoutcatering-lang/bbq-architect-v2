 
/**
 * Actieplan-generator — bouwt courses.steps + plating deterministisch
 * uit de receptuur die al aan gerechten hangt. GEEN AI: hoeveelheden en
 * stappen komen 1-op-1 uit componenten / battle-plan / bereidingswijze
 * (huisregel: productie-hoeveelheden nooit door AI laten verzinnen).
 *
 * Bron-volgorde per gerecht:
 *   1. componenten (gerecht_components → components.preparation_steps);
 *      hoeveelheden geschaald: quantity_used geldt voor gerecht.porties
 *      referentie-porties → × (eventPortions / porties)
 *   2. gerechten.battle_plan_steps (string[])
 *   3. gerechten.bereidingswijze (vrije tekst → regels)
 *
 * De caller (KDS detail-view) toont het resultaat als VOORSTEL;
 * de gebruiker bevestigt vóór het naar courses.steps geschreven wordt.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { CourseStep } from '@/app/events/[id]/service/_types/service';
import { formatMiseQty } from '@/lib/miseAggregation';
import { findGerechtMatch } from '@/lib/gerechtMatch';

type Supa = SupabaseClient<any, any, any>;

export interface ActieplanResult {
    steps: CourseStep[];
    plating: string[];
    /* Mensentaal-samenvatting per gerecht ("Pulled pork: 4 stappen (componenten)"). */
    sources: string[];
}

interface GerechtRow {
    id: string;
    naam: string;
    porties?: number | null;
    battle_plan_steps?: unknown;
    bereidingswijze?: string | null;
    service_tip?: string | null;
}

interface ComponentJoinRow {
    gerecht_id: string;
    quantity_used: number | null;
    unit: string | null;
    components: {
        name: string | null;
        preparation_steps?: unknown;
        base_unit?: string | null;
    } | null;
}

function asStringArray(v: unknown): string[] {
    if (!Array.isArray(v)) return [];
    return v.map(x => (typeof x === 'string' ? x.trim() : '')).filter(Boolean);
}

/** Splits vrije bereidingswijze-tekst naar losse stappen (nummering eraf). */
function splitBereidingswijze(text: string): string[] {
    return text
        .split(/\r?\n+/)
        .map(l => l.replace(/^\s*(?:stap\s*)?\d+\s*[.):\-–]\s*/i, '').trim())
        .filter(l => l.length > 3)
        .slice(0, 15);
}

export async function generateActieplan(
    supabase: Supa,
    opts: { gerechtIds: string[]; dishNames: string[]; portions: number },
): Promise<ActieplanResult> {
    const { gerechtIds, dishNames, portions } = opts;

    /* Gerechten ophalen: FK-route eerst, anders exacte naam-match —
       description-namen kwamen oorspronkelijk uit gerechten.naam. */
    const SELECT = 'id, naam, porties, battle_plan_steps, bereidingswijze, service_tip';
    let gerechten: GerechtRow[] = [];
    if (gerechtIds.length > 0) {
        const { data } = await supabase.from('gerechten').select(SELECT).in('id', gerechtIds);
        gerechten = ((data as GerechtRow[]) || [])
            .sort((a, b) => gerechtIds.indexOf(a.id) - gerechtIds.indexOf(b.id));
    }
    if (gerechten.length === 0 && dishNames.length > 0) {
        /* Naam-fallback: haal de org-gerechten op (RLS-scoped, kleine tabel)
           en match per menu-naam — exact eerst, anders uniek-containment. */
        const { data } = await supabase.from('gerechten').select(SELECT);
        const all = (data as GerechtRow[]) || [];
        for (const dn of dishNames) {
            const m = findGerechtMatch(dn, all);
            if (m && !gerechten.includes(m)) gerechten.push(m);
        }
    }
    if (gerechten.length === 0) {
        return {
            steps: [], plating: [],
            sources: ['Geen gerechten gevonden bij deze gang — koppel het menu (Bouw uit menu in de Event Hub) of check de gerecht-namen.'],
        };
    }

    /* Componenten in één call voor alle gerechten van de gang. */
    const ids = gerechten.map(g => g.id);
    const { data: gcData } = await supabase
        .from('gerecht_components')
        .select('gerecht_id, quantity_used, unit, components ( name, preparation_steps, base_unit )')
        .in('gerecht_id', ids);
    const gcRows = (gcData as unknown as ComponentJoinRow[]) || [];

    const steps: CourseStep[] = [];
    const plating: string[] = [];
    const sources: string[] = [];
    let n = 1;

    for (const g of gerechten) {
        const refPorties = Math.max(1, Number(g.porties) || 10);
        const factor = portions > 0 ? portions / refPorties : 1;

        let added = 0;
        let bron = '';

        /* 1) Componenten met eigen bereidingsstappen. */
        for (const r of gcRows.filter(x => x.gerecht_id === g.id)) {
            const comp = r.components;
            const compSteps = asStringArray(comp?.preparation_steps);
            if (!comp?.name || compSteps.length === 0) continue;
            const qty = Number(r.quantity_used) || 0;
            const unit = r.unit || comp.base_unit || '';
            const qtyLabel = qty > 0 ? `${formatMiseQty(qty * factor, unit)} voor ${portions}p` : '';
            compSteps.forEach((s, i) => {
                steps.push({
                    n: n++,
                    action: s,
                    detail: `${g.naam} · ${comp.name}${i === 0 && qtyLabel ? ' · ' + qtyLabel : ''}`,
                });
            });
            added += compSteps.length;
        }
        if (added > 0) bron = 'componenten';

        /* 2) Battle-plan van het gerecht zelf. */
        if (added === 0) {
            const bp = asStringArray(g.battle_plan_steps);
            bp.forEach(s => steps.push({ n: n++, action: s, detail: g.naam }));
            if (bp.length > 0) { added = bp.length; bron = 'actieplan gerecht'; }
        }

        /* 3) Bereidingswijze-tekst. */
        if (added === 0 && g.bereidingswijze) {
            const lines = splitBereidingswijze(g.bereidingswijze);
            lines.forEach(s => steps.push({ n: n++, action: s, detail: g.naam }));
            if (lines.length > 0) { added = lines.length; bron = 'bereidingswijze'; }
        }

        sources.push(added > 0
            ? `${g.naam}: ${added} stappen (${bron})`
            : `${g.naam}: geen receptuur gevonden — vul componenten of bereidingswijze in via Menu`);

        if (g.service_tip) plating.push(`${g.naam}: ${g.service_tip}`);
    }

    return { steps, plating, sources };
}
