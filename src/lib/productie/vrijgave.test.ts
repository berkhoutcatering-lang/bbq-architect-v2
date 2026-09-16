import { describe, expect, it } from 'vitest';
import { beoordeel, bepaalVrijgave, haccpPuntNaarCheckType, puntVraagtWaarde, vrijgaveTekst, type HaccpPunt } from './vrijgave';

const KERN: HaccpPunt = { type: 'kerntemp', threshold_value: 74, threshold_unit: 'celsius', verplicht_voor_vrijgave: true };
const KOEL: HaccpPunt = { type: 'koeltemp', threshold_value: 4, threshold_unit: 'celsius', verplicht_voor_vrijgave: true };
const HYG: HaccpPunt = { type: 'handhygiene', threshold_value: null, threshold_unit: null, verplicht_voor_vrijgave: true };
const OPT: HaccpPunt = { type: 'kruisbesmetting', threshold_value: null, threshold_unit: null, verplicht_voor_vrijgave: false };

describe('bepaalVrijgave', () => {
    it('geen verplichte punten → vrij, ook zonder metingen (geen verzonnen regels)', () => {
        expect(bepaalVrijgave([], []).vrij).toBe(true);
        expect(bepaalVrijgave([OPT], []).vrij).toBe(true);
    });
    it('verplicht punt zonder meting → niet vrij, staat bij ontbrekend', () => {
        const u = bepaalVrijgave([KERN], []);
        expect(u.vrij).toBe(false);
        expect(u.ontbrekend).toEqual([KERN]);
    });
    it('de laatste meting telt: 61,8 onvoldoende, daarna 74,1 akkoord → vrij', () => {
        const u = bepaalVrijgave([KERN], [{ type: 'kerntemp', temp: 61.8 }, { type: 'kerntemp', temp: 74.1 }]);
        expect(u.vrij).toBe(true);
        expect(u.beoordeeld[0]).toMatchObject({ type: 'kerntemp', temp: 74.1, beoordeling: 'ok' });
    });
    it('drempel niet gehaald → afwijkend, niet vrij', () => {
        const u = bepaalVrijgave([KERN], [{ type: 'kerntemp', temp: 61.8 }]);
        expect(u.vrij).toBe(false);
        expect(u.afwijkend[0].temp).toBe(61.8);
        expect(vrijgaveTekst(u)).toContain('Kerntemperatuur 61.8 (eis ≥ 74)');
    });
    it('koeltemp is een maximum', () => {
        expect(bepaalVrijgave([KOEL], [{ type: 'koeltemp', temp: 3 }]).vrij).toBe(true);
        expect(bepaalVrijgave([KOEL], [{ type: 'koeltemp', temp: 6 }]).vrij).toBe(false);
    });
    it('metingen in de oude taal (check_type "kern") tellen mee', () => {
        expect(bepaalVrijgave([KERN], [{ type: 'kern', temp: 80 }]).vrij).toBe(true);
        expect(haccpPuntNaarCheckType('kerntemp')).toBe('kern');
        expect(haccpPuntNaarCheckType('handhygiene')).toBe('handhygiene');
    });
    it('punt zonder drempel: geregistreerd is genoeg', () => {
        expect(bepaalVrijgave([HYG], [{ type: 'handhygiene', temp: null }]).vrij).toBe(true);
        expect(beoordeel(HYG, null)).toBe('geregistreerd');
        expect(puntVraagtWaarde('handhygiene')).toBe(false);
        expect(puntVraagtWaarde('kerntemp')).toBe(true);
    });
    it('component-drempel wint: 70 °C is bij een eis van 74 een afwijking, ook al zou de preset (60) het "warn" noemen', () => {
        expect(beoordeel(KERN, 70)).toBe('afwijking');
        expect(beoordeel({ ...KERN, threshold_value: 65 }, 70)).toBe('ok');
    });
    it('meerdere punten: één ontbrekend is genoeg om te blokkeren', () => {
        const u = bepaalVrijgave([KERN, KOEL], [{ type: 'kerntemp', temp: 80 }]);
        expect(u.vrij).toBe(false);
        expect(u.ontbrekend.map((p) => p.type)).toEqual(['koeltemp']);
        expect(vrijgaveTekst(u)).toContain('nog niet gemeten: Koeltemperatuur');
    });
});
