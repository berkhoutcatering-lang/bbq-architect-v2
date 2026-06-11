/**
 * Naam-matching tussen menu-namen (offerte.menu_selectie, course.description)
 * en gerechten.naam. In de praktijk wijken die af: menu zegt "Bavette",
 * het gerecht heet "Gerookte bavette"; menu zegt "Kippendij", gerecht
 * "Gegrilde kippendij. " (incl. trailing punt/spatie).
 *
 * Match-strategie — bewust conservatief, deterministisch, geen AI:
 *   1. Exact (genormaliseerd: lowercase, trim, trailing leestekens eraf)
 *   2. Woord-grens containment ("bavette" ⊂ "gerookte bavette"),
 *      MAAR alleen geaccepteerd als er precies ÉÉN kandidaat is —
 *      ambiguïteit ("zalm" matcht 2 gerechten) levert null op, zodat we
 *      nooit verkeerde allergie-flags of foto's tonen.
 *   3. Zelfde, met enkelvoud-vorm ("Sliders" → "slider").
 */

export function normalizeGerechtNaam(s: string): string {
    return s.toLowerCase().trim().replace(/[.,;:!\s]+$/g, '');
}

function escapeRegex(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function uniqueContainment<T extends { naam: string }>(q: string, gerechten: T[]): T | null {
    if (q.length < 3) return null; /* te kort → te veel valse hits */
    const re = new RegExp(`(^|[^a-z0-9à-ž])${escapeRegex(q)}([^a-z0-9à-ž]|$)`, 'i');
    const cands = gerechten.filter(g => re.test(normalizeGerechtNaam(g.naam)));
    return cands.length === 1 ? cands[0] : null;
}

export function findGerechtMatch<T extends { naam: string }>(zoeknaam: string, gerechten: T[]): T | null {
    const q = normalizeGerechtNaam(zoeknaam);
    if (!q) return null;

    const exact = gerechten.find(g => normalizeGerechtNaam(g.naam) === q);
    if (exact) return exact;

    const contained = uniqueContainment(q, gerechten);
    if (contained) return contained;

    if (q.endsWith('s')) {
        const singular = q.slice(0, -1);
        const exactSing = gerechten.find(g => normalizeGerechtNaam(g.naam) === singular);
        if (exactSing) return exactSing;
        return uniqueContainment(singular, gerechten);
    }
    return null;
}
