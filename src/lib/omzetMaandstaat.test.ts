import { describe, expect, it } from 'vitest';
import type { KassaRegel } from '@/lib/financeAnalytics';
import { maakMaandstaat, maandGrenzen, type DagstaatMin } from './omzetMaandstaat';

const regel = (r: Partial<KassaRegel>): KassaRegel => ({ datum: '2026-11-21', btw_pct: 9, omzet: 10, btw: 0.9, bron: 'toonbank', ...r });
const staat = (s: Partial<DagstaatMin>): DagstaatMin => ({
    bedrijfsdag: '2026-11-21', status: 'definitief', pin_toonbank_cents: 1090, contant_geteld_cents: 0,
    contant_verschil_cents: 0, pin_verschil_cents: 0, goedgekeurd_at: null, ...s,
});

describe('maakMaandstaat', () => {
    it('telt per dag, per tarief en per bron', () => {
        const m = maakMaandstaat(2026, 11, [
            regel({}),
            regel({ btw_pct: 21, omzet: 100, btw: 21, bron: 'webshop' }),
            regel({ datum: '2026-11-22', omzet: 20, btw: 1.8 }),
        ], [staat({})]);
        expect(m.dagen).toHaveLength(2);
        expect(m.dagen[0]).toMatchObject({ toonbank: 10.9, webshop: 121, omzet_9: 10, btw_21: 21, incl: 131.9, pin: 10.9, dagstaat: 'in_orde' });
        expect(m.totaal).toMatchObject({ incl: 153.7, btw_9: 2.7, webshop: 121 });
    });

    it('meldt kassaverkoop zonder afgesloten dag', () => {
        expect(maakMaandstaat(2026, 11, [regel({})], []).open_punten[0]).toContain('niet afgesloten');
    });

    it('een webshopdag zonder kassa is geen open punt', () => {
        expect(maakMaandstaat(2026, 11, [regel({ bron: 'webshop' })], []).open_punten).toEqual([]);
    });

    it('een kasverschil blijft open tot het is goedgekeurd', () => {
        const open = maakMaandstaat(2026, 11, [regel({})], [staat({ contant_verschil_cents: -500 })]);
        expect(open.dagen[0].dagstaat).toBe('te_controleren');
        expect(open.dagen[0].kasverschil).toBe(-5);
        const klaar = maakMaandstaat(2026, 11, [regel({})], [staat({ contant_verschil_cents: -500, goedgekeurd_at: '2026-11-22T09:00:00Z' })]);
        expect(klaar.dagen[0].dagstaat).toBe('in_orde');
    });

    it('een proefdag laat geen sporen na', () => {
        const m = maakMaandstaat(2026, 10, [], [staat({ bedrijfsdag: '2026-10-27', contant_verschil_cents: -20000 })], new Set(['2026-10-27']));
        expect(m.dagen).toEqual([]);
        expect(m.open_punten).toEqual([]);
    });

    it('oude kassa zonder bron telt als oude kassa', () => {
        expect(maakMaandstaat(2026, 8, [regel({ bron: undefined, datum: '2026-08-01' })], []).totaal.kassa_oud).toBe(10.9);
    });
});

describe('maandGrenzen', () => {
    it('kent de laatste dag', () => {
        expect(maandGrenzen(2026, 2)).toEqual({ start: '2026-02-01', eind: '2026-02-28' });
        expect(maandGrenzen(2026, 12)).toEqual({ start: '2026-12-01', eind: '2026-12-31' });
    });
});
