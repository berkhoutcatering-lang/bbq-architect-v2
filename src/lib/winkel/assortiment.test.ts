import { describe, expect, it } from 'vitest';
import { ALLES, UIT, ZONDER, assortimentKeuzes, assortimentLijst } from './assortiment';

const afdelingen = [
    { id: 'vlees', naam: 'Vlees', volgorde: 2 },
    { id: 'bier', naam: 'Bier', volgorde: 1 },
    { id: 'noten', naam: 'Nootjes', volgorde: 3 },
];
const rij = (naam: string, afdeling_id: string | null, verkocht28 = 0, actief = true) => ({ naam, afdeling_id, verkocht28, actief });
const rijen = [
    rij('Bavette', 'vlees'),
    rij('Vleesribben, dik', 'vlees', 4),
    rij('Bräuweisse', 'bier'),
    rij('Etiket', null),
    rij('Oude worst', 'vlees', 0, false),
];
const ids = new Set(afdelingen.map((a) => a.id));

describe('assortimentKeuzes', () => {
    it('Alles is de som van de afdelingen en Zonder afdeling', () => {
        const k = assortimentKeuzes(afdelingen, rijen);
        const alles = k.find((x) => x.id === ALLES)!.aantal;
        const rest = k.filter((x) => x.id !== ALLES && x.id !== UIT).reduce((s, x) => s + x.aantal, 0);
        expect(alles).toBe(4);
        expect(rest).toBe(alles);
    });

    it('volgt de winkel en laat lege afdelingen weg', () => {
        expect(assortimentKeuzes(afdelingen, rijen).map((x) => x.id)).toEqual([ALLES, 'bier', 'vlees', ZONDER, UIT]);
    });

    it('zonder afdelingen geen dubbele knop naast Alles', () => {
        expect(assortimentKeuzes([], [rij('Etiket', null)]).map((x) => x.id)).toEqual([ALLES]);
    });
});

describe('assortimentLijst', () => {
    it('zet wat het meest verkoopt bovenaan, daarna op naam', () => {
        expect(assortimentLijst(rijen, 'vlees', '', ids).map((r) => r.naam)).toEqual(['Vleesribben, dik', 'Bavette']);
    });

    it('toont uit het assortiment alleen onder die knop', () => {
        expect(assortimentLijst(rijen, ALLES, '', ids).map((r) => r.naam)).not.toContain('Oude worst');
        expect(assortimentLijst(rijen, UIT, '', ids).map((r) => r.naam)).toEqual(['Oude worst']);
    });

    it('zoekt zonder op hoofdletters en accenten te letten', () => {
        expect(assortimentLijst(rijen, ALLES, 'BRAU', ids).map((r) => r.naam)).toEqual(['Bräuweisse']);
        expect(assortimentLijst([rij('Bådin Myken', 'bier')], ALLES, 'badin', ids)).toHaveLength(1);
    });

    it('een plek op een verdwenen afdeling telt als zonder afdeling', () => {
        expect(assortimentLijst([rij('Weg', 'oud')], ZONDER, '', ids)).toHaveLength(1);
    });
});
