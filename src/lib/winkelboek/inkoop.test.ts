import { describe, expect, it } from 'vitest';
import { maakLeveringen, type InkoopBon, type Ontvangst } from './inkoop';

const o = (x: Partial<Ontvangst>): Ontvangst => ({ datum: '2026-11-26', product_id: 'p1', product_naam: 'Worst', btw_pct: 9, waarde_cents: 20000, leverancier_id: 7, leverancier: 'Slagerij', ...x });
const bon = (x: Partial<InkoopBon>): InkoopBon => ({ id: 1, datum: '2026-11-27', leverancier_id: 7, netto_cents: 31850, ...x });

describe('maakLeveringen', () => {
    it('groepeert op dag en leverancier en telt bedrag en btw', () => {
        const [l] = maakLeveringen([o({}), o({ product_id: 'p2', product_naam: 'Fuet', waarde_cents: 11850 })], [bon({})]);
        expect(l).toEqual({ datum: '2026-11-26', leverancier_id: 7, leverancier: 'Slagerij', producten: 2, wat: 'Worst en Fuet',
            bedrag_cents: 31850, btw_geschat_cents: 2867, bon: { soort: 'gevonden', id: 1, netto_cents: 31850 } });
    });
    it('schat de btw per regel met het tarief van het product', () => {
        const [l] = maakLeveringen([o({ waarde_cents: 41280, btw_pct: 21 })], []);
        expect(l).toMatchObject({ btw_geschat_cents: 8669, bon: { soort: 'ontbreekt' } });
    });
    it('één regel zonder waarde maakt het bedrag van de levering onbekend', () => {
        expect(maakLeveringen([o({}), o({ product_id: 'p2', waarde_cents: null })], [])[0]).toMatchObject({ bedrag_cents: null, btw_geschat_cents: null });
    });
    it('zoekt de bon van één dag ervoor tot zeven dagen erna, bij dezelfde leverancier', () => {
        expect(maakLeveringen([o({})], [bon({ datum: '2026-11-25' })])[0].bon.soort).toBe('gevonden');
        expect(maakLeveringen([o({})], [bon({ datum: '2026-12-03' })])[0].bon.soort).toBe('gevonden');
        expect(maakLeveringen([o({})], [bon({ datum: '2026-12-04' })])[0].bon.soort).toBe('ontbreekt');
        expect(maakLeveringen([o({})], [bon({ datum: '2026-11-24' })])[0].bon.soort).toBe('ontbreekt');
        expect(maakLeveringen([o({})], [bon({ leverancier_id: 8 })])[0].bon.soort).toBe('ontbreekt');
        expect(maakLeveringen([o({})], [bon({}), bon({ id: 2 })])[0].bon).toEqual({ soort: 'meerdere', aantal: 2 });
    });
    it('zonder leverancier: "Onbekend" en nooit een bon', () => {
        expect(maakLeveringen([o({ leverancier_id: null, leverancier: null })], [bon({ leverancier_id: null })])[0]).toMatchObject({ leverancier: 'Onbekend', bon: { soort: 'ontbreekt' } });
    });
    it('vat lange leveringen samen en zet de nieuwste bovenaan', () => {
        const uit = maakLeveringen([
            o({ datum: '2026-11-24' }),
            o({ product_id: 'a', product_naam: 'Noten' }), o({ product_id: 'b', product_naam: 'Crackers' }),
            o({ product_id: 'c', product_naam: 'Saus' }), o({ product_id: 'd', product_naam: 'Chutney' }),
        ], []);
        expect(uit.map((l) => l.datum)).toEqual(['2026-11-26', '2026-11-24']);
        expect(uit[0].wat).toBe('Noten, Crackers en 2 andere');
    });
    it('meer mutaties van hetzelfde product tellen als één product', () => {
        const [l] = maakLeveringen([o({ waarde_cents: 1000 }), o({ waarde_cents: 2000 })], []);
        expect(l).toMatchObject({ producten: 1, wat: 'Worst', bedrag_cents: 3000, btw_geschat_cents: 270 });
    });
});

describe('welke bon bij welke levering hoort', () => {
    const bonVan = (uit: ReturnType<typeof maakLeveringen>) => Object.fromEntries(uit.map((l) => [l.datum, l.bon.soort === 'gevonden' ? l.bon.id : l.bon.soort]));

    it('een leverancier die elke week levert: elke levering vindt zijn eigen bon', () => {
        const uit = maakLeveringen(
            [o({ datum: '2026-11-24' }), o({ datum: '2026-11-27' }), o({ datum: '2026-12-01' })],
            [bon({ id: 1, datum: '2026-11-24' }), bon({ id: 2, datum: '2026-11-27' }), bon({ id: 3, datum: '2026-12-01' })]);
        expect(bonVan(uit)).toEqual({ '2026-11-24': 1, '2026-11-27': 2, '2026-12-01': 3 });
    });
    it('de bon komt een paar dagen later: de dichtstbijzijnde bon die nog vrij is', () => {
        const uit = maakLeveringen([o({ datum: '2026-11-25' }), o({ datum: '2026-12-02' })], [bon({ id: 1, datum: '2026-11-27' }), bon({ id: 2, datum: '2026-12-02' })]);
        expect(bonVan(uit)).toEqual({ '2026-11-25': 1, '2026-12-02': 2 });
    });
    it('een bon hoort bij één levering: de andere levering blijft zonder', () => {
        const uit = maakLeveringen([o({ datum: '2026-11-24' }), o({ datum: '2026-11-26' })], [bon({ id: 1, datum: '2026-11-26' })]);
        expect(bonVan(uit)).toEqual({ '2026-11-24': 'ontbreekt', '2026-11-26': 1 });
    });
    it('hetzelfde bedrag wint van de dichtstbijzijnde datum', () => {
        const uit = maakLeveringen([o({ datum: '2026-11-24', waarde_cents: 20000 })], [bon({ id: 1, datum: '2026-11-24', netto_cents: 9999 }), bon({ id: 2, datum: '2026-11-26', netto_cents: 20000 })]);
        expect(bonVan(uit)).toEqual({ '2026-11-24': 2 });
    });
    it('twee bonnen even ver weg, geen met hetzelfde bedrag: dan staat er dat er meer zijn', () => {
        const uit = maakLeveringen([o({ datum: '2026-11-25' })], [bon({ id: 1, datum: '2026-11-24' }), bon({ id: 2, datum: '2026-11-26' })]);
        expect(uit[0].bon).toEqual({ soort: 'meerdere', aantal: 2 });
    });
    it('met een periode: een levering erbuiten houdt zijn eigen bon, maar staat niet in de lijst', () => {
        const ontvangsten = [o({ datum: '2026-11-27' }), o({ datum: '2026-12-01' })];
        const bonnen = [bon({ id: 3, datum: '2026-12-01' })];
        const week48 = maakLeveringen(ontvangsten, bonnen, { start: '2026-11-23', eind: '2026-11-29' });
        expect(week48.map((l) => [l.datum, l.bon.soort])).toEqual([['2026-11-27', 'ontbreekt']]);
        /* Zonder de buurman zou de bon van 1 december ten onrechte bij 27 november komen. */
        expect(maakLeveringen([ontvangsten[0]], bonnen)[0].bon.soort).toBe('gevonden');
    });
});
