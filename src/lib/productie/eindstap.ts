/**
 * Welke taak is "de productie"? Pulled pork heeft pekelen, rubben, roken en
 * pullen als losse taken; alleen het einde levert zakken op. Een partij hoort
 * dus bij de eindstap: de taak met een component waar geen andere taak (zelfde
 * event, zelfde component) via `hangt_af_van_stap_id` op volgt.
 *
 * Zonder receptstappen (bulk-ingeplande taken) is de laatst ingeplande taak
 * van dat component de eindstap. Puur en getest.
 */

export interface EindstapTaak {
    id: number;
    componentId: number | null;
    eventId: number | null;
    recipeStepId: string | null;
    /** Volgorde-hint als er geen stappen zijn: scheduled_at of step_order. */
    volgorde: number | string | null;
}

export interface EindstapStap {
    id: string;
    hangtAfVanStapId: string | null;
}

export function isEindstap(taak: EindstapTaak, alleTaken: EindstapTaak[], stappen: EindstapStap[]): boolean {
    if (taak.componentId == null) return false;
    const groep = alleTaken.filter((t) => t.componentId === taak.componentId && t.eventId === taak.eventId);
    if (groep.length <= 1) return true;

    if (taak.recipeStepId) {
        const stapVan = new Map(stappen.map((s) => [s.id, s]));
        /* Volgt er een taak in de groep waarvan de stap van deze stap afhangt? */
        const volgers = groep.filter((t) => t.id !== taak.id && t.recipeStepId && stapVan.get(t.recipeStepId)?.hangtAfVanStapId === taak.recipeStepId);
        if (volgers.length > 0) return false;
        /* Geen expliciete volger: eindstap is de taak met de laatste stap in de keten. */
        const metStap = groep.filter((t) => t.recipeStepId);
        if (metStap.length > 1) {
            const laatste = metStap.reduce((a, b) => (vergelijk(a.volgorde, b.volgorde) >= 0 ? a : b));
            return laatste.id === taak.id;
        }
        return true;
    }

    const laatste = groep.reduce((a, b) => (vergelijk(a.volgorde, b.volgorde) >= 0 ? a : b));
    return laatste.id === taak.id;
}

export function bepaalEindstap(alleTaken: EindstapTaak[], stappen: EindstapStap[]): EindstapTaak[] {
    return alleTaken.filter((t) => isEindstap(t, alleTaken, stappen));
}

function vergelijk(a: number | string | null, b: number | string | null): number {
    if (a == null && b == null) return 0;
    if (a == null) return -1;
    if (b == null) return 1;
    if (typeof a === 'number' && typeof b === 'number') return a - b;
    return String(a).localeCompare(String(b));
}

/* ── Variant op taak-afhankelijkheden ───────────────────────────────────────
   De keukenplanner heeft per taak al `hangtAfVan: number[]` (taak-ids)
   uitgerekend, inclusief wat uit de receptstappen komt. Daar kan de eindstap
   direct uit: de taak met een component waar geen andere taak in dezelfde
   groep (event + component) van afhangt. Zonder afhankelijkheden wint de
   laatst geplande. */

export interface TaakMetDeps {
    id: number;
    componentId: number | null | undefined;
    eventId: number | null | undefined;
    hangtAfVan: number[];
    geplandOp?: string | null;
}

export function eindstapIds(taken: TaakMetDeps[]): Set<number> {
    const uit = new Set<number>();
    const groepen = new Map<string, TaakMetDeps[]>();
    for (const t of taken) {
        if (t.componentId == null) continue;
        const k = `${t.eventId ?? 'x'}:${t.componentId}`;
        const g = groepen.get(k) ?? [];
        g.push(t);
        groepen.set(k, g);
    }
    for (const g of groepen.values()) {
        const kandidaten = g.filter((t) => !g.some((ander) => ander.id !== t.id && ander.hangtAfVan.includes(t.id)));
        if (kandidaten.length === 1) { uit.add(kandidaten[0].id); continue; }
        const heeftDeps = g.some((t) => t.hangtAfVan.some((d) => g.some((x) => x.id === d)));
        if (heeftDeps) { for (const k of kandidaten) uit.add(k.id); continue; }
        const laatste = g.reduce((a, b) => (vergelijk(a.geplandOp ?? null, b.geplandOp ?? null) >= 0 ? a : b));
        uit.add(laatste.id);
    }
    return uit;
}
