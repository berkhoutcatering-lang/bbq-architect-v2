/**
 * Wat de webshop-pagina laadt (Kerst-review 8 oktober: "Vakjes toont maar 500
 * orders"). De laatste 500 orders zijn genoeg voor de geschiedenis, maar een
 * vroeg geplaatste order voor een latere dag (een Kerst-Box in oktober voor
 * 24 december) mag daar niet uit vallen. Daarom ook elke order met een regel
 * die vanaf `vanaf` klaar moet zijn, en de componenten van precies die
 * regels (in plaats van de eerste 5000 op id, waarbij juist de nieuwste
 * wegvielen).
 */

/** Zoveel id's per .in()-filter: houdt de URL van PostgREST kort. */
export const PER_KEER = 150;

export function inStukken<T>(lijst: readonly T[], grootte = PER_KEER): T[][] {
    const uit: T[][] = [];
    for (let i = 0; i < lijst.length; i += grootte) uit.push(lijst.slice(i, i + grootte));
    return uit;
}

/** De id's uit `gevraagd` die nog niet in `al` zitten, zonder dubbele. */
export function ontbrekend(gevraagd: readonly number[], al: readonly { id: number }[]): number[] {
    const heb = new Set(al.map((x) => x.id));
    return [...new Set(gevraagd)].filter((id) => !heb.has(id));
}

/** Samenvoegen op id (de eerste wint), nieuwste eerst, zoals de pagina ze altijd toonde. */
export function samenvoegen<T extends { id: number; created_at: string }>(...delen: readonly T[][]): T[] {
    const opId = new Map<number, T>();
    for (const deel of delen) for (const o of deel) if (!opId.has(o.id)) opId.set(o.id, o);
    return [...opId.values()].sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id - a.id);
}

/** "YYYY-MM-DD" een aantal dagen vóór `vandaag` (ook een "YYYY-MM-DD"). */
export function dagenTerug(vandaag: string, dagen: number): string {
    const [j, m, d] = vandaag.split('-').map(Number);
    const t = new Date(Date.UTC(j!, m! - 1, d!));
    t.setUTCDate(t.getUTCDate() - dagen);
    return t.toISOString().slice(0, 10);
}
