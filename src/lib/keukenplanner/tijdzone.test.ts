import { describe, expect, it } from 'vitest';
import { amsterdamNaarIso, datumAmsterdam, klokAmsterdam, plusDagen, uurAmsterdam } from './tijdzone';
import { dagvenster } from './laden';

const ms = (iso: string) => Date.parse(iso);

describe('tijdzone (Europe/Amsterdam, los van de servertijd)', () => {
    it('wintertijd: UTC+1', () => {
        expect(klokAmsterdam(ms('2026-12-23T15:00:00Z'))).toBe('16:00');
        expect(uurAmsterdam(ms('2026-12-23T03:30:00Z'))).toBe(4);
        expect(amsterdamNaarIso('2026-12-23', '16:00')).toBe('2026-12-23T15:00:00.000Z');
    });

    it('zomertijd: UTC+2', () => {
        expect(klokAmsterdam(ms('2026-07-01T14:05:00Z'))).toBe('16:05');
        expect(amsterdamNaarIso('2026-07-01', '04:00:00')).toBe('2026-07-01T02:00:00.000Z');
    });

    it('kalenderdag volgt Amsterdam, niet UTC', () => {
        /* 23:30 UTC op de 23e is in Amsterdam al de 24e. */
        expect(datumAmsterdam(ms('2026-12-23T23:30:00Z'))).toBe('2026-12-24');
    });

    it('rond de wisselnachten', () => {
        /* 25 okt 2026: 03:00 zomertijd wordt 02:00 wintertijd. 04:00 is dan UTC+1. */
        expect(amsterdamNaarIso('2026-10-25', '04:00')).toBe('2026-10-25T03:00:00.000Z');
        expect(amsterdamNaarIso('2026-10-24', '04:00')).toBe('2026-10-24T02:00:00.000Z');
        /* 29 mrt 2026: 02:00 wintertijd wordt 03:00 zomertijd. 04:00 is dan UTC+2. */
        expect(amsterdamNaarIso('2026-03-29', '04:00')).toBe('2026-03-29T02:00:00.000Z');
    });

    it('plusDagen gaat over maand- en jaargrenzen', () => {
        expect(plusDagen('2026-12-31', 1)).toBe('2027-01-01');
        expect(plusDagen('2026-03-01', -1)).toBe('2026-02-28');
    });
});

describe('dagvenster — de keukendag draait om 04:00 Nederlandse tijd', () => {
    it('om 10:00 in december loopt de dag van 04:00 tot 04:00 de volgende ochtend', () => {
        expect(dagvenster(new Date('2026-12-23T09:00:00Z'))).toEqual({ van: '2026-12-23T03:00:00.000Z', tot: '2026-12-24T03:00:00.000Z' });
    });
    it('om half twee \'s nachts hoort het nog bij de vorige dag', () => {
        expect(dagvenster(new Date('2026-12-24T00:30:00Z')).van).toBe('2026-12-23T03:00:00.000Z');
    });
    it('om 04:30 Nederlandse tijd (03:30 UTC) is de nieuwe dag begonnen', () => {
        expect(dagvenster(new Date('2026-12-24T03:30:00Z')).van).toBe('2026-12-24T03:00:00.000Z');
    });
});
