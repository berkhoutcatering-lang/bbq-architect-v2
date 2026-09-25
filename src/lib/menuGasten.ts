/**
 * Gasten per gerecht — plan docs/webshop-beheer-bouwplan.md §4.3.
 *
 * Een gewoon event heeft één aantal gasten en elk gerecht is voor iedereen.
 * Een webshop-vakje niet: 17 Kerst-Boxen en 3 vegetarische op dezelfde dag
 * zijn twee gerechten met elk hun eigen aantal. Dat staat in
 * events.menu_gasten ({ "<gerecht-uuid>": 17, "<vega-uuid>": 3 }).
 *
 * Eén regel, overal dezelfde: staat er voor dit gerecht een getal, dan is dat
 * het aantal; anders het aantal gasten van het event. Bestaande events zonder
 * menu_gasten merken hier niets van.
 */

export interface EventMetGasten {
    guests?: number | null;
    menu_gasten?: unknown;
}

export function gastenVoorGerecht(event: EventMetGasten, gerechtId: string | null | undefined): number {
    const alles = Number(event.guests) || 0;
    if (!gerechtId) return alles;
    let mg = event.menu_gasten;
    if (typeof mg === 'string') {
        try { mg = JSON.parse(mg); } catch { return alles; }
    }
    if (!mg || typeof mg !== 'object' || Array.isArray(mg)) return alles;
    const n = Number((mg as Record<string, unknown>)[gerechtId]);
    return Number.isFinite(n) && n >= 0 ? n : alles;
}

/** Alleen de echte per-gerecht-getallen, als plat object — of null als er geen zijn. */
export function menuGastenVan(event: EventMetGasten): Record<string, number> | null {
    let mg = event.menu_gasten;
    if (typeof mg === 'string') {
        try { mg = JSON.parse(mg); } catch { return null; }
    }
    if (!mg || typeof mg !== 'object' || Array.isArray(mg)) return null;
    const uit: Record<string, number> = {};
    for (const [k, v] of Object.entries(mg as Record<string, unknown>)) {
        const n = Number(v);
        if (Number.isFinite(n) && n >= 0) uit[k] = n;
    }
    return Object.keys(uit).length ? uit : null;
}
