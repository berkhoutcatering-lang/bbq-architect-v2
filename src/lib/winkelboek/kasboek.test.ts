import { describe, expect, it } from 'vitest';
import type { DagstaatKort } from './dagboeking';
import { maakKasboek, type KasMutatie } from './kasboek';

const staat = (dag: string, begin: number, verwacht: number, geteld: number, afgeroomd: number, extra: Partial<DagstaatKort> = {}): DagstaatKort => ({
    id: `d-${dag}`, apparaat_id: 'kassa-1',
    bedrijfsdag: dag, status: 'definitief', gesloten_at: `${dag}T17:00:00Z`, aantal_bonnen: 1,
    pin_toonbank_cents: 0, pin_mypos_app_cents: 0, pin_verschil_cents: 0,
    contant_begin_cents: begin, contant_verwacht_cents: verwacht, contant_geteld_cents: geteld,
    contant_verschil_cents: geteld - verwacht, afgeroomd_cents: afgeroomd, verschillen: [], goedgekeurd_at: null, ...extra,
});
const week = [
    staat('2026-11-24', 15000, 23650, 23650, 8500),
    staat('2026-11-25', 15150, 22550, 22550, 7500),
    staat('2026-11-26', 15050, 24300, 24100, 9000),
    staat('2026-11-27', 15100, 33900, 33000, 18000),
    staat('2026-11-28', 15000, 48945, 48945, 34000),
];
const boodschap: KasMutatie = { id: 'm1', datum: '2026-11-27', bedrag_cents: -900, reden: 'uitgave', omschrijving: 'Schoonmaakmiddel', moment: 'tijdens' };

describe('maakKasboek', () => {
    it('rijgt de week aan elkaar en eindigt op wat er in de la ligt', () => {
        const k = maakKasboek(week, [boodschap]);
        expect(k.regels.map((r) => r.soort)).toEqual([
            'beginstand', 'verkoop', 'afgeroomd', 'verkoop', 'afgeroomd', 'verkoop', 'kasverschil', 'afgeroomd',
            'verkoop', 'eigen', 'afgeroomd', 'verkoop', 'afgeroomd',
        ]);
        expect(k.regels.map((r) => r.saldo_cents)).toEqual([
            15000, 23650, 15150, 22550, 15050, 24300, 24100, 15100, 33900, 33000, 15000, 48945, 14945,
        ]);
        expect(k).toMatchObject({ in_de_la_cents: 14945, kasverschil_cents: -200, afgeroomd_cents: 77000 });
    });
    it('een eigen regel verklaart het kasverschil van die dag', () => {
        const k = maakKasboek(week, [boodschap]);
        const vrijdag = k.regels.filter((r) => r.datum === '2026-11-27');
        expect(vrijdag.find((r) => r.soort === 'kasverschil')).toBeUndefined();
        expect(vrijdag.find((r) => r.soort === 'eigen')).toMatchObject({ wat: 'Schoonmaakmiddel', bedrag_cents: -900, bron: 'zelf', mutatie_id: 'm1' });
    });
    it('zonder die regel is het hele bedrag een kasverschil en een aandachtspunt', () => {
        const k = maakKasboek(week, []);
        expect(k.kasverschil_cents).toBe(-1100);
        expect(k.punten.filter((p) => p.includes('Kasverschil'))).toHaveLength(2);
    });
    it('een goedgekeurd kasverschil is geen aandachtspunt meer', () => {
        const k = maakKasboek([staat('2026-11-26', 15050, 24300, 24100, 9000, { goedgekeurd_at: '2026-11-27T08:00:00Z' })], []);
        expect(k.punten).toEqual([]);
        expect(k.regels.find((r) => r.soort === 'kasverschil')).toMatchObject({ bedrag_cents: -200, goedgekeurd: true });
    });
    it('een andere beginstand dan gisteren overbleef wordt een regel en een aandachtspunt', () => {
        const k = maakKasboek([staat('2026-11-24', 15000, 23650, 23650, 8500), staat('2026-11-25', 15000, 22400, 22400, 7400)], []);
        expect(k.regels.find((r) => r.soort === 'tussen_dagen')).toMatchObject({ datum: '2026-11-25', bedrag_cents: -150, saldo_cents: 15000 });
        expect(k.punten.join(' ')).toContain('1,50');
    });
    it('een proefdag laat geen regels na', () => {
        const k = maakKasboek([staat('2026-10-27', 0, 5000, 100, 0), ...week], [boodschap], new Set(['2026-10-27']));
        expect(k.regels[0]).toMatchObject({ soort: 'beginstand', datum: '2026-11-24', saldo_cents: 15000 });
        expect(k.kasverschil_cents).toBe(-200);
    });
    it('twee afsluitingen op één dag rijgen aan elkaar', () => {
        const k = maakKasboek([
            staat('2026-11-24', 15000, 20000, 20000, 5000, { id: 'a', gesloten_at: '2026-11-24T12:00:00Z' }),
            staat('2026-11-24', 15000, 18650, 18650, 3500, { id: 'b', gesloten_at: '2026-11-24T17:00:00Z' }),
        ], []);
        expect(k.regels.map((r) => r.saldo_cents)).toEqual([15000, 20000, 15000, 18650, 15150]);
        expect(k.punten).toEqual([]);
    });
    it('meer dan één kassa geeft een waarschuwing', () => {
        const k = maakKasboek([staat('2026-11-24', 15000, 20000, 20000, 5000), staat('2026-11-25', 15000, 16000, 16000, 1000, { apparaat_id: 'kassa-2' })], []);
        expect(k.punten.join(' ')).toContain('meer dan één kassa');
    });
    it('wisselgeld vóór het openen verklaart het verschil tussen de dagen', () => {
        const k = maakKasboek([staat('2026-11-24', 15000, 23650, 23650, 8500), staat('2026-11-25', 17150, 24550, 24550, 7400)],
            [{ id: 'm3', datum: '2026-11-25', bedrag_cents: 2000, reden: 'wisselgeld', omschrijving: 'Wisselgeld erbij', moment: 'voor_openen' }]);
        expect(k.regels.map((r) => r.soort)).toEqual(['beginstand', 'verkoop', 'afgeroomd', 'eigen', 'verkoop', 'afgeroomd']);
        expect(k).toMatchObject({ kasverschil_cents: 0, in_de_la_cents: 17150, punten: [] });
    });
    it('zonder dagstaten: leeg boek', () => {
        expect(maakKasboek([], [])).toEqual({ regels: [], in_de_la_cents: null, kasverschil_cents: 0, afgeroomd_cents: 0, punten: [] });
    });
    it('met een beginstand uit de vorige periode: begint op dat saldo en meldt een verschil bij de eerste dag', () => {
        const k = maakKasboek([staat('2026-12-01', 15000, 20000, 20000, 5000)], [], undefined, { datum: '2026-12-01', saldo_cents: 14945 });
        expect(k.regels.map((r) => r.soort)).toEqual(['beginstand', 'tussen_dagen', 'verkoop', 'afgeroomd']);
        expect(k.regels.map((r) => r.saldo_cents)).toEqual([14945, 15000, 20000, 15000]);
        expect(k.punten.join(' ')).toContain('0,55');
    });
    it('met een beginstand: het punt noemt de vorige afsluiting als die bekend is', () => {
        const dag = [staat('2026-12-01', 15000, 20000, 20000, 5000)];
        const met = maakKasboek(dag, [], undefined, { datum: '2026-12-01', saldo_cents: 16000, sinds: '2026-11-28' });
        expect(met.punten[0]).toMatch(/^Tussen za 28 nov en di 1 dec ging er .*10,00 uit de la zonder regel\.$/);
        const zonder = maakKasboek(dag, [], undefined, { datum: '2026-12-01', saldo_cents: 16000 });
        expect(zonder.punten[0]).toMatch(/^Vóór di 1 dec ging er/);
    });
    it('met een beginstand: een eigen regel vóór de eerste afsluiting van de periode blijft zichtbaar', () => {
        const k = maakKasboek([staat('2026-12-02', 16945, 20000, 20000, 0)],
            [{ id: 'm9', datum: '2026-12-01', bedrag_cents: 2000, reden: 'wisselgeld', omschrijving: 'Wisselgeld erbij', moment: 'tijdens' }], undefined, { datum: '2026-12-01', saldo_cents: 14945 });
        expect(k.regels.find((r) => r.mutatie_id === 'm9')).toMatchObject({ soort: 'eigen', saldo_cents: 16945 });
        expect(k.punten).toEqual([]);
    });
    it('met een beginstand: een periode zonder afsluiting toont de beginstand en de eigen regels', () => {
        const k = maakKasboek([], [{ id: 'm9', datum: '2026-12-01', bedrag_cents: -500, reden: 'prive', omschrijving: 'Privé', moment: 'tijdens' }], undefined, { datum: '2026-12-01', saldo_cents: 14945 });
        expect(k.regels.map((r) => r.soort)).toEqual(['beginstand', 'eigen']);
        expect(k.in_de_la_cents).toBe(14445);
    });
    it('zonder eerdere afsluiting: een eigen regel vóór de allereerste afsluiting staat in het boek en is weg te halen', () => {
        const k = maakKasboek([staat('2026-11-24', 15000, 23650, 23650, 8500)],
            [{ id: 'm0', datum: '2026-11-23', bedrag_cents: 15000, reden: 'wisselgeld', omschrijving: 'Wisselgeld in de la', moment: 'tijdens' }]);
        expect(k.regels.map((r) => r.soort)).toEqual(['eigen', 'beginstand', 'verkoop', 'afgeroomd']);
        expect(k.regels[0]).toMatchObject({ mutatie_id: 'm0', saldo_cents: 15000 });
        expect(k.in_de_la_cents).toBe(15150);
    });
    it('alleen eigen regels en nog geen afsluiting: de regels staan er, het saldo is onbekend', () => {
        const k = maakKasboek([], [{ id: 'm0', datum: '2026-11-23', bedrag_cents: 15000, reden: 'wisselgeld', omschrijving: 'Wisselgeld in de la', moment: 'tijdens' }]);
        expect(k.regels.map((r) => r.mutatie_id)).toEqual(['m0']);
        expect(k.in_de_la_cents).toBeNull();
    });
    it('een eigen regel op een dag zonder dagstaat schuift het saldo op', () => {
        const k = maakKasboek([staat('2026-11-24', 15000, 23650, 23650, 8500), staat('2026-11-26', 17150, 20000, 20000, 0)],
            [{ id: 'm2', datum: '2026-11-25', bedrag_cents: 2000, reden: 'wisselgeld', omschrijving: 'Wisselgeld erbij', moment: 'tijdens' }]);
        expect(k.regels.find((r) => r.soort === 'tussen_dagen')).toBeUndefined();
        expect(k.in_de_la_cents).toBe(20000);
    });
    it('een kasverschil noemt de dag en of er te weinig of te veel in de la zat', () => {
        const weinig = maakKasboek([staat('2026-11-26', 15050, 24300, 24100, 9000)], []);
        expect(weinig.punten[0]).toMatch(/^Kasverschil op do 26 nov: /);
        expect(weinig.punten[0]).toContain('2,00 te weinig in de la');
        const veel = maakKasboek([staat('2026-11-26', 15050, 24300, 24500, 9000)], []);
        expect(veel.punten[0]).toContain('2,00 te veel in de la');
    });
    it('een verschil tussen de dagen zegt of er geld uit de la ging of bij kwam', () => {
        const eruit = maakKasboek([staat('2026-11-24', 15000, 23650, 23650, 8500), staat('2026-11-25', 15000, 22400, 22400, 7400)], []);
        expect(eruit.punten[0]).toContain('ging er');
        expect(eruit.punten[0]).toContain('1,50 uit de la');
        const erbij = maakKasboek([staat('2026-11-24', 15000, 23650, 23650, 8500), staat('2026-11-25', 15300, 22400, 22400, 7400)], []);
        expect(erbij.punten[0]).toContain('kwam er');
        expect(erbij.punten[0]).toContain('1,50 bij in de la');
    });
});
