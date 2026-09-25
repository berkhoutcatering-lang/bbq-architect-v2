import { describe, expect, it } from 'vitest';
import { dagPseudoEventId, leesVakjeSleutel, webshopRegelsNaarVraag, type WebshopRegel } from './vakje';

describe('leesVakjeSleutel', () => {
    it('leest moment en dag, weigert onzin', () => {
        expect(leesVakjeSleutel('moment:2f1c0a4e-1b2c-4d3e-8f9a-0b1c2d3e4f5a')).toEqual({ soort: 'moment', momentId: '2f1c0a4e-1b2c-4d3e-8f9a-0b1c2d3e4f5a' });
        expect(leesVakjeSleutel('dag:2026-12-23')).toEqual({ soort: 'dag', datum: '2026-12-23' });
        expect(leesVakjeSleutel('dag:kerst')).toBeNull();
        expect(leesVakjeSleutel('moment:1')).toBeNull();
        expect(leesVakjeSleutel('')).toBeNull();
    });
});

describe('dagPseudoEventId', () => {
    it('is negatief en per dag anders', () => {
        const a = dagPseudoEventId('2026-09-25');
        const b = dagPseudoEventId('2026-09-26');
        expect(a).toBeLessThan(0);
        expect(b).toBe(a - 1);
    });
});

describe('webshopRegelsNaarVraag', () => {
    const regel = (aantal: number, klaar_op: string, per: number | null = null): WebshopRegel => ({ aantal, klaar_op, inventory_id: 7, inkoop_per_stuk: per, artikel_naam: 'Speciaalbier' });
    const opts = { vandaag: '2026-09-25', vensterEind: '2026-10-09' };

    it('5 flessen = 5 op het item, op de dag van het vakje', () => {
        const v = webshopRegelsNaarVraag([regel(5, '2026-09-25')], opts);
        expect(v).toHaveLength(1);
        expect(v[0].qty).toBe(5);
        expect(v[0].event).toEqual({ id: dagPseudoEventId('2026-09-25'), name: 'Webshop · vr 25 sep', date: '2026-09-25' });
    });

    it('rekent inkoop_per_stuk mee (een bierpakket van 3)', () => {
        expect(webshopRegelsNaarVraag([regel(2, '2026-09-25', 3)], opts)[0].qty).toBe(6);
    });

    it('een oude, niet klaargezette regel schuift naar vandaag', () => {
        expect(webshopRegelsNaarVraag([regel(1, '2026-09-20')], opts)[0].event.date).toBe('2026-09-25');
    });

    it('buiten het venster telt niet mee; met een datum alleen die dag', () => {
        expect(webshopRegelsNaarVraag([regel(1, '2026-12-23')], opts)).toHaveLength(0);
        expect(webshopRegelsNaarVraag([regel(1, '2026-12-23'), regel(1, '2026-09-25')], { ...opts, datum: '2026-12-23' }).map((v) => v.event.date)).toEqual(['2026-12-23']);
        /* Vandaag als vakje: ook wat van eerder is blijven liggen. */
        expect(webshopRegelsNaarVraag([regel(1, '2026-09-20')], { ...opts, datum: '2026-09-25' })).toHaveLength(1);
    });
});
