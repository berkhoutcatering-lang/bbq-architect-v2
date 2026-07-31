import { describe, it, expect } from 'vitest';
import { parseHoeveelheid, eenheidsOpties } from './GerechtComponentenEditor';

/* Deze twee helpers bestonden niet toen de hoeveelheid van een bouwsteen in een
   gerecht helemaal niet in te vullen was: er ging altijd de basis-hoeveelheid
   van de bibliotheek mee, en corrigeren kon alleen door de koppeling weg te
   gooien. Ze bewaken samen dat er nooit een verzonnen of onbedoeld getal in de
   kostprijs terechtkomt. */

describe('parseHoeveelheid', () => {
    it('leest een Nederlandse komma als decimaalteken', () => {
        expect(parseHoeveelheid('1,5')).toBe(1.5);
        expect(parseHoeveelheid(' 0,25 ')).toBe(0.25);
    });

    it('leest een gewone punt ook', () => {
        expect(parseHoeveelheid('150')).toBe(150);
        expect(parseHoeveelheid('2.5')).toBe(2.5);
    });

    it('weigert alles wat geen hoeveelheid boven nul is', () => {
        // Anders glipt er een 0 of NaN in de dosering en rekent het gerecht
        // stilzwijgend met niets.
        expect(parseHoeveelheid('')).toBeNull();
        expect(parseHoeveelheid('   ')).toBeNull();
        expect(parseHoeveelheid('0')).toBeNull();
        expect(parseHoeveelheid('-3')).toBeNull();
        expect(parseHoeveelheid('honderd gram')).toBeNull();
        expect(parseHoeveelheid('1,')).toBeNull();
    });
});

describe('eenheidsOpties', () => {
    it('biedt alleen eenheden die bij de basis passen', () => {
        expect(eenheidsOpties('g', 'g')).toEqual(['g', 'kg']);
        expect(eenheidsOpties('ml', 'ml')).toEqual(['ml', 'liter']);
        expect(eenheidsOpties('stuk', 'stuk')).toEqual(['stuk', 'portie']);
    });

    it('houdt de eenheid die er nu staat in de lijst, ook als hij er niet bij hoort', () => {
        // Een keuzelijst die de opgeslagen waarde niet kent, toont de eerste
        // optie — en dan verandert een bedrag zonder dat iemand iets koos.
        expect(eenheidsOpties('g', 'stuk')).toEqual(['g', 'kg', 'stuk']);
    });

    it('valt terug op de huidige eenheid als de basis onbekend is', () => {
        expect(eenheidsOpties(undefined, 'zak')).toEqual(['zak']);
    });
});
