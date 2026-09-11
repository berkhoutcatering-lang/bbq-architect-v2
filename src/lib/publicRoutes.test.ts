/**
 * Twee lijsten die gelijk moeten lopen, en die niemand bijhoudt.
 *
 *   src/proxy.ts            PUBLIC_ROUTES  — de auth-poort: wie hier niet in
 *                                            staat wordt naar /login gestuurd
 *   src/components/AppShell PUBLIC_PAGES   — de chrome-poort: wie hier niet in
 *                                            staat krijgt de sidebar eromheen
 *
 * Een publieke pagina die in de ene staat en niet in de andere gaat op twee
 * manieren mis: óf de klant komt op het inlogscherm, óf hij krijgt de
 * operator-sidebar om zijn bestelformulier. Beide zijn al eens gebeurd. Dit is
 * geen aantekening in een plan meer maar iets dat vanzelf afgaat.
 *
 * De test leest de bronbestanden, niet de modules: proxy.ts importeert
 * Next-runtime en AppShell is een React-component. De arrays zijn letterlijk
 * en op één regel, dus een regex volstaat.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const PROXY = readFileSync(path.resolve(__dirname, '../proxy.ts'), 'utf8');
const SHELL = readFileSync(path.resolve(__dirname, '../components/AppShell.tsx'), 'utf8');

function lees(bron: string, naam: string): string[] {
    const m = new RegExp(`const ${naam}\\s*=\\s*\\[([^\\]]*)\\]`).exec(bron);
    if (!m) throw new Error(`${naam} niet gevonden — is de array nog letterlijk en op één plek?`);
    return Array.from(m[1].matchAll(/'([^']+)'/g), (x) => x[1]);
}

/** '/legal' en '/legal/' zijn dezelfde poort. */
const norm = (p: string) => p.replace(/\/+$/, '');

const PUBLIC_ROUTES = lees(PROXY, 'PUBLIC_ROUTES');
const PUBLIC_PAGES = lees(SHELL, 'PUBLIC_PAGES');
const AUTH_PAGES = lees(SHELL, 'AUTH_PAGES');

/* Pagina's die WEL zonder sidebar renderen maar WEL een login vereisen. Die
   staan terecht niet in PUBLIC_ROUTES. Bestonden al vóór deze test; een nieuwe
   toevoeging hier is een bewuste keuze die in de diff zichtbaar wordt. */
const SHELL_LOOS_MAAR_INGELOGD = ['/share', '/m'];

/* Andersom: publiek bereikbaar, maar bewust MÉT de app eromheen.
 *
 * /contact is een supportpagina die zowel ingelogd als uitgelogd werkt. Hem in
 * PUBLIC_PAGES zetten zou de sidebar ook weghalen voor iemand die wél is
 * ingelogd, en dat is een verslechtering. Hem eruit laten betekent dat een
 * uitgelogde bezoeker de app-schil om een supportpagina krijgt.
 *
 * Geen van beide is duidelijk goed, dus dit staat hier als bekende uitzondering
 * in plaats van als stilzwijgend opgeloste keuze. Openstaande vraag voor
 * Mathijs — zie docs/bestelstroom-bouwplan.md §12. */
const PUBLIEK_MAAR_MET_SCHIL = ['/contact'];

describe('PUBLIC_ROUTES (proxy) en PUBLIC_PAGES (AppShell) lopen gelijk', () => {
    it('vindt beide lijsten', () => {
        expect(PUBLIC_ROUTES.length).toBeGreaterThan(5);
        expect(PUBLIC_PAGES.length).toBeGreaterThan(3);
    });

    it('elke publieke pagina uit de proxy rendert ook zonder sidebar', () => {
        const pages = new Set(PUBLIC_PAGES.map(norm));
        const auth = AUTH_PAGES.map(norm);

        const ontbreekt = PUBLIC_ROUTES
            .map(norm)
            .filter((r) => !r.startsWith('/api/'))
            .filter((r) => !auth.some((a) => r.startsWith(a)))
            .filter((r) => !PUBLIEK_MAAR_MET_SCHIL.includes(r))
            .filter((r) => !pages.has(r));

        expect(ontbreekt, 'staat in PUBLIC_ROUTES maar niet in PUBLIC_PAGES — klant krijgt de sidebar').toEqual([]);
    });

    it('elke sidebar-loze pagina komt ook langs de auth-poort, of staat op de uitzonderingslijst', () => {
        const routes = new Set(PUBLIC_ROUTES.map(norm));

        const ontbreekt = PUBLIC_PAGES
            .map(norm)
            .filter((p) => !routes.has(p))
            .filter((p) => !SHELL_LOOS_MAAR_INGELOGD.includes(p));

        expect(ontbreekt, 'staat in PUBLIC_PAGES maar niet in PUBLIC_ROUTES — klant komt op het inlogscherm').toEqual([]);
    });

    it('de bestelstroom staat in allebei', () => {
        expect(PUBLIC_ROUTES.map(norm)).toContain('/bestellen');
        expect(PUBLIC_PAGES.map(norm)).toContain('/bestellen');
        expect(PUBLIC_ROUTES).toContain('/api/public-bestelling');
        expect(PUBLIC_ROUTES).toContain('/api/public-wachtlijst');
    });
});
