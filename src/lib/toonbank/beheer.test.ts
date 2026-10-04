import { describe, expect, it } from 'vitest';
import { achterstand, resterendeTijd, tabletStatus, toonKoppelcode, zwakkeInlogcode } from './beheer';

const NU = new Date('2027-03-06T10:00:00Z');
const over = (s: number) => new Date(NU.getTime() + s * 1000).toISOString();

describe('tabletStatus', () => {
    const basis = { ingetrokken_at: null, gekoppeld_at: null, koppelcode_geldig_tot: null, koppelpogingen: 0 };
    it('ingetrokken gaat voor alles', () => {
        expect(tabletStatus({ ...basis, ingetrokken_at: over(-60), gekoppeld_at: over(-600) }, NU)).toBe('ingetrokken');
    });
    it('open code = wacht op koppelen, ook als hij al eens gekoppeld was', () => {
        expect(tabletStatus({ ...basis, koppelcode_geldig_tot: over(120) }, NU)).toBe('wacht_op_koppelen');
        expect(tabletStatus({ ...basis, gekoppeld_at: over(-600), koppelcode_geldig_tot: over(120) }, NU)).toBe('wacht_op_koppelen');
    });
    it('5 foute pogingen of verlopen: niet meer open', () => {
        expect(tabletStatus({ ...basis, koppelcode_geldig_tot: over(120), koppelpogingen: 5 }, NU)).toBe('code_verlopen');
        expect(tabletStatus({ ...basis, koppelcode_geldig_tot: over(-1) }, NU)).toBe('code_verlopen');
        expect(tabletStatus({ ...basis, gekoppeld_at: over(-600), koppelcode_geldig_tot: over(-1) }, NU)).toBe('gekoppeld');
        expect(tabletStatus(basis, NU)).toBe('nooit_gekoppeld');
    });
});

describe('kleine helpers', () => {
    it('achterstand nooit negatief', () => {
        expect(achterstand({ hoogste_volgnummer_gemeld: 12, bevestigd_tot_volgnummer: 9 })).toBe(3);
        expect(achterstand({ hoogste_volgnummer_gemeld: 0, bevestigd_tot_volgnummer: 4 })).toBe(0);
    });
    it('resterende tijd als m:ss', () => {
        expect(resterendeTijd(over(299.2), NU)).toBe('5:00');
        expect(resterendeTijd(over(61), NU)).toBe('1:01');
        expect(resterendeTijd(over(0), NU)).toBeNull();
    });
    it('koppelcode in twee groepen', () => {
        expect(toonKoppelcode('042917')).toBe('042 917');
        expect(toonKoppelcode('abc')).toBe('abc');
    });
    it('zwakke inlogcodes', () => {
        for (const c of ['1111', '000000', '1234', '123456', '4321', '9876', '0123']) expect(zwakkeInlogcode(c)).toBe(true);
        for (const c of ['1357', '2468', '840213', '1243']) expect(zwakkeInlogcode(c)).toBe(false);
    });
});
