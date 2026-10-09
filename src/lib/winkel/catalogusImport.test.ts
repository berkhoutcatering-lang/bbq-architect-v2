/**
 * De import van de website-catalogus (blok C4): wat er geschreven wordt, en dat
 * een product na de rondreis (website → hier → catalogus-route) hetzelfde is.
 * De volle rondreis draait als de website-repo ernaast staat (WEBSITE_CATALOGUS
 * of het vaste pad); anders alleen de voorbeelden.
 */
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { fotoBasis, importRijen, type SiteProduct } from './catalogusImport';
import { naarCatalogus, type ProductRij } from './productsoorten';

const ORG = '0f8c1d2e-3a4b-4c5d-8e9f-0a1b2c3d4e5f';
const FIXTURE = process.env.WEBSITE_CATALOGUS ?? '/Users/mathi/Documents/Hop&Bites bedrijf/07 Marketing/Website en teksten/websites nieuw makerij/.worktrees/catalogus/tests/fixtures/catalogus.json';

const foto = { basis: '/beeld/BIER-X-02', breedte: 1024, hoogte: 1536, maten: [{ w: 640, h: 960 }], formaten: ['avif', 'webp'] as ('avif' | 'webp')[] };

const bier: SiteProduct = {
    soort: 'bier', slug: 'lupulus-placebo-0-0', naam: 'Placebo 0,0%', prijsCenten: null, eenheid: 'per fles', alcoholPct: 0,
    allergenen: null, ingredienten: null, bewaren: null, lekkerBij: null, foto, volgorde: 30,
    kenmerken: { brouwerij: 'Lupulus', stijl: 'blond', verpakking: { soort: 'fles', cl: 33 } }, proefkaart: null, proefkaartGoedgekeurd: false,
};
const gehakt: SiteProduct = {
    soort: 'vlees', slug: 'rundergehakt', naam: 'Rundergehakt', prijsCenten: null, eenheid: 'per 100 gram', alcoholPct: null,
    allergenen: null, ingredienten: null, bewaren: null, lekkerBij: null, foto, volgorde: 1,
    kenmerken: { soort: 'vers', fotoAlt: 'Rundergehakt op een leisteen.', alleenKaartformaat: true },
};

/** Een geïmporteerd product terug door de catalogus-route, zonder foto en tijd. */
function rondreis(p: SiteProduct) {
    const f = p.foto ? { ...p.foto, basis: fotoBasis(ORG, p.slug) } : null;
    const { product, artikel } = importRijen(p, ORG, f, '2026-10-03T12:00:00Z');
    const terug = naarCatalogus(
        { id: 'x', updated_at: '2026-10-03T12:00:00Z', ...product } as unknown as ProductRij,
        { slug: p.slug, eenheid: artikel.eenheid as string, prijs_cents: artikel.prijs_cents as number | null, actief: true, publiek: true },
        'https://s.supabase.co',
    );
    return terug;
}

describe('importRijen', () => {
    it('alcoholvrij bier: geen 18+, 9 % btw, één slot van één fles', () => {
        const { product, artikel, slot } = importRijen(bier, ORG, null);
        expect(product).toMatchObject({ type: 'bier', alcohol: false, btw_pct: 9, pagina_status: 'live', slug: 'lupulus-placebo-0-0' });
        expect(artikel).toMatchObject({ moment_soort: 'moment', moment_groep: 'bier', actief: false, alcohol: false, segment: 'bier' });
        expect(slot).toMatchObject({ slot_type: 'bier', hoeveelheid: 1, eenheid: 'stuk' });
    });

    it('vers vlees per 100 gram: vleeswaar, in gram, gekoeld', () => {
        const { product, artikel, slot } = importRijen(gehakt, ORG, null);
        expect(product).toMatchObject({ type: 'vleeswaar', eenheid: 'gram', prijs_per: 100, alcohol: false });
        expect(artikel).toMatchObject({ gekoeld: true, eenheid: 'per 100 gram', moment_groep: 'vlees' });
        expect(slot).toMatchObject({ hoeveelheid: 100, eenheid: 'gram' });
    });

    it('een prijs maakt het artikel actief; zonder prijs blijft het uit', () => {
        expect(importRijen({ ...bier, prijsCenten: 295 }, ORG, null).artikel).toMatchObject({ actief: true, prijs_cents: 295 });
    });

    it('weigert kapotte kenmerken in plaats van een halve pagina te importeren', () => {
        expect(() => importRijen({ ...bier, kenmerken: { brouwerij: 'Lupulus' } }, ORG, null)).toThrow(/kenmerken kloppen niet/);
    });

    it('druiven die op de site gecontroleerd waren, blijven goedgekeurd', () => {
        const wijn: SiteProduct = {
            ...bier, soort: 'wijn', slug: 'rueda', alcoholPct: 13.5, druivenGecontroleerd: true,
            kenmerken: {
                producent: 'Bodega', jaargang: '2025', wijnType: 'wit', land: 'Spanje', regio: 'Castilla y León', appellatie: 'DO Rueda',
                druiven: ['Verdejo'], biologisch: false, huiswijn: true, inhoud: '0,75 L', stijl: 'Fris', smaak: 'Citrus.',
                omschrijving: 'Fris.', pastBij: 'Vis.', serveertemperatuur: '8–10 °C',
            },
        };
        expect(rondreis(wijn)).toMatchObject({ druivenGecontroleerd: true });
        expect(importRijen(wijn, ORG, null).product).toMatchObject({ alcohol: true, btw_pct: 21 });
    });

    it('de foto komt in de bucket onder {org}/{slug}-v1', () => {
        expect(rondreis(bier)?.foto?.basis).toBe(`https://s.supabase.co/storage/v1/object/public/winkel-fotos/${ORG}/lupulus-placebo-0-0-v1`);
    });
});

describe.skipIf(!fs.existsSync(FIXTURE))('de volle rondreis met de website-catalogus', () => {
    const { producten } = JSON.parse(fs.existsSync(FIXTURE) ? fs.readFileSync(FIXTURE, 'utf8') : '{"producten":[]}') as { producten: (SiteProduct & { foto: unknown; concept: boolean; bijgewerkt: string })[] };

    it('elk product komt er hetzelfde uit als het erin ging (op foto en tijd na)', () => {
        expect(producten.length).toBe(58);
        for (const p of producten) {
            const terug = rondreis(p);
            const zonder = (x: Record<string, unknown>) => ({ ...x, foto: null, bijgewerkt: null, concept: false });
            expect(zonder(terug as unknown as Record<string, unknown>), p.slug).toEqual(zonder(p as unknown as Record<string, unknown>));
        }
    });
});
