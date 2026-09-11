import { describe, it, expect } from 'vitest';
import { verdeelOverApparaten, botsingMelding, type BezettingsTaak } from './bezetting';

/**
 * De inductieplaat is één pit: `concurrent_jobs = 1`, 3500 W, pan van hooguit
 * 28 cm. Dat kwam pas boven water bij een Italiaans kookboek — gesmoord
 * rundvlees twee uur, gestoofde varkensnek anderhalf uur, gehaktballen twintig
 * minuten, allemaal op dezelfde plaat. Bij BBQ viel het niet op omdat het werk
 * zich over smoker en grill verdeelt.
 */

const INDUCTIE = 38;
const SMOKER = 21;

function taak(over: Partial<BezettingsTaak> & { id: number }): BezettingsTaak {
    return {
        apparaatId: INDUCTIE,
        concurrentJobs: 1,
        exclusiefBezet: true,
        vroegsteStart: '2026-09-09T09:00:00.000Z',
        duurMin: 60,
        uiterlijkKlaar: null,
        ...over,
    };
}

describe('verdeelOverApparaten — één pit tegelijk', () => {
    it('zet twee pannen achter elkaar in plaats van naast elkaar', () => {
        const { plekken } = verdeelOverApparaten([
            taak({ id: 1, duurMin: 120, uiterlijkKlaar: '2026-09-09T16:00:00.000Z' }),
            taak({ id: 2, duurMin: 90, uiterlijkKlaar: '2026-09-09T17:00:00.000Z' }),
        ]);

        expect(plekken.get(1)!.start).toBe('2026-09-09T09:00:00.000Z');
        expect(plekken.get(1)!.wachtOpApparaatMin).toBe(0);
        /* De tweede kan pas als de eerste van de plaat af is. */
        expect(plekken.get(2)!.start).toBe('2026-09-09T11:00:00.000Z');
        expect(plekken.get(2)!.wachtOpApparaatMin).toBe(120);
    });

    it('laat verschillende toestellen elkaar met rust', () => {
        const { plekken, botsingen } = verdeelOverApparaten([
            taak({ id: 1, duurMin: 120 }),
            taak({ id: 2, apparaatId: SMOKER, concurrentJobs: null, duurMin: 360 }),
        ]);

        expect(plekken.get(2)!.start).toBe('2026-09-09T09:00:00.000Z');
        expect(botsingen).toHaveLength(0);
    });

    it('de krapste deadline gaat voor', () => {
        /* Wie het laatst klaar moet zijn kan het langst wachten. */
        const { plekken } = verdeelOverApparaten([
            taak({ id: 1, duurMin: 60, uiterlijkKlaar: '2026-09-09T18:00:00.000Z' }),
            taak({ id: 2, duurMin: 60, uiterlijkKlaar: '2026-09-09T11:00:00.000Z' }),
        ]);

        expect(plekken.get(2)!.start).toBe('2026-09-09T09:00:00.000Z');
        expect(plekken.get(1)!.start).toBe('2026-09-09T10:00:00.000Z');
    });

    it('een taak zonder deadline gaat achteraan', () => {
        /* Geen deadline is geen haast. Dezelfde fout stond op de eerste demodag
           groot op het wandscherm: een losse schoonmaaktaak boven de brisket. */
        const { plekken } = verdeelOverApparaten([
            taak({ id: 1, duurMin: 30, uiterlijkKlaar: null }),
            taak({ id: 2, duurMin: 30, uiterlijkKlaar: '2026-09-09T12:00:00.000Z' }),
        ]);

        expect(plekken.get(2)!.start).toBe('2026-09-09T09:00:00.000Z');
        expect(plekken.get(1)!.start).toBe('2026-09-09T09:30:00.000Z');
    });

    it('meldt het als iemand door het wachten te laat komt', () => {
        const { plekken, botsingen } = verdeelOverApparaten([
            taak({ id: 1, duurMin: 120, uiterlijkKlaar: '2026-09-09T11:30:00.000Z' }),
            taak({ id: 2, duurMin: 60, uiterlijkKlaar: '2026-09-09T11:30:00.000Z' }),
        ]);

        /* Nummer 2 moet twee uur wachten en is dan een half uur te laat. */
        expect(plekken.get(2)!.teLaat).toBe(true);
        expect(botsingen).toHaveLength(1);
        expect(botsingen[0].teLaat).toEqual([2]);
    });

    it('meldt niets als twee taken elkaar niet raken', () => {
        const { botsingen } = verdeelOverApparaten([
            taak({ id: 1, duurMin: 30 }),
            taak({ id: 2, duurMin: 30, vroegsteStart: '2026-09-09T14:00:00.000Z' }),
        ]);
        expect(botsingen).toHaveLength(0);
    });

    it('gebruikt de tweede plek als het toestel er twee heeft', () => {
        const { plekken, botsingen } = verdeelOverApparaten([
            taak({ id: 1, concurrentJobs: 2, duurMin: 60 }),
            taak({ id: 2, concurrentJobs: 2, duurMin: 60 }),
            taak({ id: 3, concurrentJobs: 2, duurMin: 60 }),
        ]);

        expect(plekken.get(1)!.wachtOpApparaatMin).toBe(0);
        expect(plekken.get(2)!.wachtOpApparaatMin).toBe(0);
        /* Pas de derde moet wachten tot er eentje afloopt. */
        expect(plekken.get(3)!.wachtOpApparaatMin).toBe(60);
        expect(botsingen).toHaveLength(1);
    });

    it('onbekende gelijktijdigheid telt als één', () => {
        /* De veilige kant van de fout: liever een taak te laat inplannen dan een
           dag beloven die niet kan. */
        const { plekken } = verdeelOverApparaten([
            taak({ id: 1, concurrentJobs: null, duurMin: 45 }),
            taak({ id: 2, concurrentJobs: null, duurMin: 45 }),
        ]);
        expect(plekken.get(2)!.wachtOpApparaatMin).toBe(45);
    });

    it('een taak zonder apparaat staat nooit in de weg', () => {
        const { plekken, botsingen } = verdeelOverApparaten([
            taak({ id: 1, apparaatId: null, duurMin: 120 }),
            taak({ id: 2, apparaatId: null, duurMin: 120 }),
        ]);
        expect(plekken.get(1)!.start).toBe(plekken.get(2)!.start);
        expect(botsingen).toHaveLength(0);
    });

    it('een niet-exclusief toestel houdt niemand tegen', () => {
        /* Een werkbank waar twee mensen naast elkaar aan kunnen staan. */
        const { plekken } = verdeelOverApparaten([
            taak({ id: 1, exclusiefBezet: false, duurMin: 90 }),
            taak({ id: 2, exclusiefBezet: false, duurMin: 90 }),
        ]);
        expect(plekken.get(2)!.wachtOpApparaatMin).toBe(0);
    });

    it('geeft bij dezelfde invoer altijd dezelfde uitkomst', () => {
        const invoer = [
            taak({ id: 3, duurMin: 30 }),
            taak({ id: 1, duurMin: 30 }),
            taak({ id: 2, duurMin: 30 }),
        ];
        const eerste = verdeelOverApparaten(invoer);
        const tweede = verdeelOverApparaten([...invoer].reverse());
        for (const id of [1, 2, 3]) {
            expect(tweede.plekken.get(id)!.start).toBe(eerste.plekken.get(id)!.start);
        }
    });

    it('drie Italiaanse stoofpotten op één plaat', () => {
        /* Het echte geval: gesmoord rundvlees 2 uur, varkensnek 1½ uur,
           gehaktballen 20 minuten. Samen 3 uur 50 aan één pit. */
        const { plekken, botsingen } = verdeelOverApparaten([
            taak({ id: 1, duurMin: 120, uiterlijkKlaar: '2026-09-09T17:00:00.000Z' }),
            taak({ id: 2, duurMin: 90, uiterlijkKlaar: '2026-09-09T17:00:00.000Z' }),
            taak({ id: 3, duurMin: 20, uiterlijkKlaar: '2026-09-09T17:00:00.000Z' }),
        ]);

        expect(plekken.get(3)!.eind).toBe('2026-09-09T12:50:00.000Z');
        expect(botsingen[0].langsteWachtMin).toBe(210);
        expect(botsingen[0].teLaat).toHaveLength(0);
    });
});

describe('botsingMelding — de dag zoals hij is', () => {
    it('zegt hoeveel er in de rij staan en hoeveel later', () => {
        const { botsingen } = verdeelOverApparaten([
            taak({ id: 1, duurMin: 120 }),
            taak({ id: 2, duurMin: 60 }),
        ]);
        expect(botsingMelding(botsingen[0], 'inductieplaat', 1))
            .toBe('De inductieplaat kan er één tegelijk: 2 taken in de rij, de laatste begint 120 min later.');
    });

    it('noemt de deadline zodra iemand hem niet haalt', () => {
        const { botsingen } = verdeelOverApparaten([
            taak({ id: 1, duurMin: 120, uiterlijkKlaar: '2026-09-09T11:30:00.000Z' }),
            taak({ id: 2, duurMin: 60, uiterlijkKlaar: '2026-09-09T11:30:00.000Z' }),
        ]);
        expect(botsingMelding(botsingen[0], 'inductieplaat', 1)).toContain('haalt de deadline niet');
    });
});
