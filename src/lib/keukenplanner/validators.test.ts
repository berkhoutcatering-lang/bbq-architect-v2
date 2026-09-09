import { describe, it, expect } from 'vitest';
import { valideerKloptNiet, valideerVerstoring, valideerMeethistorieReset } from './validators';

describe('valideerKloptNiet', () => {
    it('neemt een nette afkeuring aan', () => {
        const r = valideerKloptNiet({ taakId: 42, werkelijkeMin: 26, hoeveelheid: 4, onderbroken: false });
        expect(r.ok).toBe(true);
        if (r.ok) expect(r.data.werkelijkeMin).toBe(26);
    });

    it('gaat uit van doorgewerkt als het vinkje ontbreekt', () => {
        const r = valideerKloptNiet({ taakId: 1, werkelijkeMin: 10 });
        expect(r.ok && r.data.onderbroken).toBe(false);
    });

    it('weigert een duur van nul', () => {
        expect(valideerKloptNiet({ taakId: 1, werkelijkeMin: 0 }).ok).toBe(false);
    });

    it('weigert een duur die geen taakduur meer is', () => {
        /* Twintig uur is geen taak maar een vergeten stopknop; zo'n meting
           zou de mediaan jarenlang vervuilen. */
        expect(valideerKloptNiet({ taakId: 1, werkelijkeMin: 20 * 60 }).ok).toBe(false);
    });

    it('weigert een taakId dat geen geheel getal is', () => {
        expect(valideerKloptNiet({ taakId: 1.5, werkelijkeMin: 10 }).ok).toBe(false);
        expect(valideerKloptNiet({ taakId: '1', werkelijkeMin: 10 }).ok).toBe(false);
    });

    it('weigert een lege body', () => {
        expect(valideerKloptNiet(null).ok).toBe(false);
    });
});

describe('valideerVerstoring', () => {
    it('neemt een apparaat met eindtijd aan', () => {
        const r = valideerVerstoring({ materieelId: 12, totMoment: '2026-09-12T14:00:00.000Z', reden: 'komt niet boven 105' });
        expect(r.ok).toBe(true);
    });

    it('staat toe dat de eindtijd ontbreekt — tot nader order', () => {
        const r = valideerVerstoring({ materieelId: 12 });
        expect(r.ok && r.data.totMoment).toBeNull();
    });

    it('weigert een onzintijd', () => {
        expect(valideerVerstoring({ materieelId: 12, totMoment: 'morgenochtend' }).ok).toBe(false);
    });

    it('weigert een ontbrekend apparaat', () => {
        expect(valideerVerstoring({ reden: 'stuk' }).ok).toBe(false);
    });
});

describe('valideerMeethistorieReset', () => {
    it('eist een reden — zonder reden is de breuk later niet te verklaren', () => {
        expect(valideerMeethistorieReset({}).ok).toBe(false);
        expect(valideerMeethistorieReset({ reden: 'x' }).ok).toBe(false);
    });

    it('neemt een reden aan en trimt hem', () => {
        const r = valideerMeethistorieReset({ reden: '  verhuisd naar de Tramstraat  ' });
        expect(r.ok && r.data.reden).toBe('verhuisd naar de Tramstraat');
    });

    it('accepteert een selectie van stappen', () => {
        const r = valideerMeethistorieReset({ reden: 'nieuwe smoker', recipeStepIds: ['a', 'b'] });
        expect(r.ok && r.data.recipeStepIds).toEqual(['a', 'b']);
    });

    it('weigert een lijst die geen lijst met ids is', () => {
        expect(valideerMeethistorieReset({ reden: 'nieuwe smoker', recipeStepIds: [1, 2] }).ok).toBe(false);
    });
});
