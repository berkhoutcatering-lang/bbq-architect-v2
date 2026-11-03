/**
 * Plekken in de winkel: de vaste afdelingen komen er één keer, een bestaande
 * plek wordt nooit hernoemd, en een product dat al ergens te koop staat
 * wordt niet stil verplaatst.
 */
import { describe, expect, it } from 'vitest';
import { WINKEL_AFDELINGEN, afdelingVoorArtikel, codeVoor, planPlaatsingen, planWinkelPlekken, type LivePlek } from './plekken';

const plek = (over: Partial<LivePlek> & { code: string }): LivePlek => ({
    id: `id-${over.code}`, naam: over.code, soort: 'afdeling', parent_id: null, volgorde: 0, ...over,
});

describe('afdelingVoorArtikel', () => {
    it('op kassagroep; kaas bij Kazen; pakketten nergens', () => {
        expect(afdelingVoorArtikel({ kassagroep: 'Droge worst', slug: 'droge-worst' })).toBe('WINKEL-VLEES');
        expect(afdelingVoorArtikel({ kassagroep: 'Vleeswaren en kaas', slug: 'boterhamworst' })).toBe('WINKEL-BROODBELEG');
        expect(afdelingVoorArtikel({ kassagroep: 'Vleeswaren en kaas', slug: 'hotelblok-kaas' })).toBe('WINKEL-KAZEN');
        expect(afdelingVoorArtikel({ kassagroep: 'Rubs & zouten', slug: 'lemon-myrtle' })).toBe('WINKEL-RUBS');
        expect(afdelingVoorArtikel({ kassagroep: 'Geschenkpakketten', slug: 'bierpakket-20' })).toBeNull();
    });
});

describe('planWinkelPlekken', () => {
    it('maakt de Winkel en de zes afdelingen als er niets staat', () => {
        const plan = planWinkelPlekken([]);
        expect(plan.nieuw.map((p) => p.naam)).toEqual(['Winkel', 'Bier', 'Wijn', 'Nootjes', 'Kazen', 'Vlees (slager)', 'Broodbeleg', 'Uit de vriezer', 'Rubs & zouten']);
        expect(plan.nieuw[0]).toMatchObject({ soort: 'ruimte', ouderCode: null });
        expect(plan.nieuw.slice(1).every((p) => p.soort === 'afdeling' && p.ouderCode === 'WINKEL')).toBe(true);
    });

    it('raakt de lades van de makerij niet en maakt niets dubbel', () => {
        const ruimte = plek({ code: 'WINKEL', soort: 'ruimte' });
        const live = [plek({ code: 'PN229-L1', soort: 'lade' }), ruimte, ...WINKEL_AFDELINGEN.map((a) => plek({ code: a.code, naam: a.naam, parent_id: ruimte.id }))];
        const plan = planWinkelPlekken(live);
        expect(plan.nieuw).toEqual([]);
        expect(plan.bestaat.every((b) => b.melding === null)).toBe(true);
    });

    it('hernoemt nooit, maar meldt een afwijkende plek', () => {
        const ruimte = plek({ code: 'WINKEL', soort: 'ruimte' });
        const plan = planWinkelPlekken([ruimte, plek({ code: 'WINKEL-BIER', naam: 'Speciaalbier', soort: 'stelling' })]);
        expect(plan.nieuw.map((p) => p.code)).not.toContain('WINKEL-BIER');
        expect(plan.bestaat.find((b) => b.code === 'WINKEL-BIER')).toMatchObject({ naam: 'Speciaalbier', melding: 'soort stelling, hangt niet onder de Winkel' });
    });
});

describe('planPlaatsingen', () => {
    const p = (n: string) => ({ productId: `p-${n}`, slug: n, naam: n });

    it('zet producten in volgorde achter wat er al staat', () => {
        const plan = planPlaatsingen([p('a'), p('b'), p('c')], 'bier', [
            { id: 'x', product_id: 'p-a', locatie_id: 'bier', rol: 'verkoop', volgorde: 4 },
        ]);
        expect(plan.alDaar).toEqual(['a']);
        expect(plan.nieuw.map((x) => [x.slug, x.volgorde])).toEqual([['b', 5], ['c', 6]]);
    });

    it('verplaatst niets dat al ergens anders te koop staat', () => {
        const plan = planPlaatsingen([p('a')], 'bier', [{ id: 'x', product_id: 'p-a', locatie_id: 'kassa', rol: 'verkoop', volgorde: 1 }]);
        expect(plan.nieuw).toEqual([]);
        expect(plan.elders.map((x) => x.slug)).toEqual(['a']);
    });

    it('een showmodel elders telt niet als verkoopplek', () => {
        const plan = planPlaatsingen([p('a')], 'bier', [{ id: 'x', product_id: 'p-a', locatie_id: 'etalage', rol: 'showmodel', volgorde: 1 }]);
        expect(plan.nieuw.map((x) => x.slug)).toEqual(['a']);
    });

    it('een dubbel product komt er één keer op', () => {
        expect(planPlaatsingen([p('a'), p('a')], 'bier', []).nieuw).toHaveLength(1);
    });
});

describe('codeVoor', () => {
    it('maakt een leesbare, vrije code', () => {
        expect(codeVoor('Kaas & Worst', 'WINKEL', new Set())).toBe('WINKEL-KAAS-WORST');
        expect(codeVoor('Crème', 'WINKEL', new Set(['WINKEL-CREME']))).toBe('WINKEL-CREME-2');
        expect(codeVoor('!!!', 'WINKEL', new Set())).toBe('WINKEL-PLEK');
    });
});
