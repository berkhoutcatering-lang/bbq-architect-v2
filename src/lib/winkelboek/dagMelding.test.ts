import { describe, expect, it } from 'vitest';
import type { Dagboeking } from './dagboeking';
import { dagMeldingTekst } from './dagMelding';

const dag = (x: Partial<Dagboeking>): Dagboeking => ({
    datum: '2026-11-28', binnen: { pin: 0, contant: 0, cadeaubon: 0, totaal: 0 }, hokjes: [], totaal_hokjes: 0,
    sluit: true, stand: 'geboekt', aantal_bonnen: 64, gesloten_at: '2026-11-28T17:07:00Z', punten: [], ...x,
});

describe('dagMeldingTekst', () => {
    it('een geboekte dag', () => {
        expect(dagMeldingTekst(dag({}))).toEqual({ title: 'Dag geboekt · za 28 nov', body: 'Alles klopt, je hoeft niets te doen.' });
    });
    it('een dag met punten', () => {
        expect(dagMeldingTekst(dag({ stand: 'te_controleren', punten: ['a'] }))).toEqual({ title: 'Dag afgesloten · za 28 nov', body: '1 punt om naar te kijken.' });
        expect(dagMeldingTekst(dag({ stand: 'te_controleren', punten: ['a', 'b'] }))?.body).toBe('2 punten om naar te kijken.');
    });
    it('geen melding voor een open dag of een dag zonder verkoop', () => {
        expect(dagMeldingTekst(dag({ stand: 'open' }))).toBeNull();
        expect(dagMeldingTekst(dag({ stand: 'geen_verkoop' }))).toBeNull();
    });
});
