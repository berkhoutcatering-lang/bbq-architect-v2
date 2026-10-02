import { describe, expect, it } from 'vitest';
import { amsterdamDag, magDeployen } from '../../scripts/deploypoort.mjs';

/** Middag in Amsterdam op een gegeven datum (UTC 11:00 = 12:00 of 13:00 lokaal). */
const op = (datum: string) => new Date(`${datum}T11:00:00Z`);

describe('deploypoort', () => {
    it('bouwt previews altijd, ook op zaterdag en in de bevriezing', () => {
        expect(magDeployen({ nu: op('2026-10-03'), omgeving: 'preview' }).bouwen).toBe(true);
        expect(magDeployen({ nu: op('2026-12-01'), omgeving: 'preview' }).bouwen).toBe(true);
    });

    it('laat productie toe op maandag, dinsdag en woensdag', () => {
        expect(magDeployen({ nu: op('2026-10-05'), omgeving: 'production' }).bouwen).toBe(true); // ma
        expect(magDeployen({ nu: op('2026-10-06'), omgeving: 'production' }).bouwen).toBe(true); // di
        expect(magDeployen({ nu: op('2026-10-07'), omgeving: 'production' }).bouwen).toBe(true); // wo
    });

    it('slaat productie over van donderdag t/m zondag', () => {
        for (const datum of ['2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11']) {
            const u = magDeployen({ nu: op(datum), omgeving: 'production' });
            expect(u.bouwen, datum).toBe(false);
            expect(u.reden).toContain('maandag t/m woensdag');
        }
    });

    it('slaat productie over tijdens de bevriezing, grenzen inbegrepen', () => {
        expect(magDeployen({ nu: op('2026-11-16'), omgeving: 'production' }).bouwen).toBe(false); // ma, bevroren
        expect(magDeployen({ nu: op('2026-11-14'), omgeving: 'production' }).reden).toContain('bevriezing');
        expect(magDeployen({ nu: op('2027-01-03'), omgeving: 'production' }).reden).toContain('bevriezing');
        expect(magDeployen({ nu: op('2027-01-04'), omgeving: 'production' }).bouwen).toBe(true); // ma na de bevriezing
    });

    it('laat een noodfix altijd door', () => {
        const u = magDeployen({ nu: op('2026-12-24'), omgeving: 'production', bericht: 'Fix afhaalscan [noodfix]' });
        expect(u.bouwen).toBe(true);
        expect(u.reden).toContain('noodfix');
    });

    it('rekent in Amsterdamse tijd, niet in UTC', () => {
        // Woensdag 23:30 UTC = donderdag 01:30 in Amsterdam (zomertijd).
        expect(amsterdamDag(new Date('2026-10-07T23:30:00Z'))).toEqual({ datum: '2026-10-08', weekdag: 4 });
        expect(magDeployen({ nu: new Date('2026-10-07T23:30:00Z'), omgeving: 'production' }).bouwen).toBe(false);
    });
});
