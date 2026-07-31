import { describe, it, expect } from 'vitest';
import { beschrijfVerwijderGevolgen, schoonParentId } from './FolderModal';

/* Eerder stond er alleen "Weet je het zeker?" bij het verwijderen van een map.
   Deze tests bewaken dat de bevestiging vertelt wat er met de submappen en de
   bouwstenen gebeurt — anders zegt iemand ja tegen iets wat hij niet ziet. */
describe('beschrijfVerwijderGevolgen', () => {
    it('noemt de map, de submappen en de bouwstenen', () => {
        const tekst = beschrijfVerwijderGevolgen({
            mapNaam: 'Vlees',
            submapNamen: ['Gevogelte', 'Rund', 'Varken'],
            aantalComponenten: 42,
        });
        expect(tekst).toContain('"Vlees" verwijderen?');
        expect(tekst).toContain('3 submappen');
        expect(tekst).toContain('Gevogelte, Rund, Varken');
        expect(tekst).toContain('één niveau omhoog');
        expect(tekst).toContain('42 bouwstenen');
        expect(tekst).toContain('"Zonder folder"');
        expect(tekst).not.toContain('undefined');
    });

    it('schrijft enkelvoud als er één van elk is', () => {
        const tekst = beschrijfVerwijderGevolgen({
            mapNaam: 'Sauzen',
            submapNamen: ['Warm'],
            aantalComponenten: 1,
        });
        expect(tekst).toContain('1 submap (Warm)');
        expect(tekst).toContain('1 bouwsteen');
        expect(tekst).not.toContain('submappen');
        expect(tekst).not.toContain('bouwstenen');
    });

    it('zegt eerlijk dat een lege map leeg is', () => {
        const tekst = beschrijfVerwijderGevolgen({ mapNaam: 'Test', submapNamen: [], aantalComponenten: 0 });
        expect(tekst).toContain('De map is leeg.');
        expect(tekst).not.toContain('submap');
        expect(tekst).not.toContain('bouwsteen');
    });

    it('somt namen niet op bij een lange lijst, maar telt wel', () => {
        const tekst = beschrijfVerwijderGevolgen({
            mapNaam: 'Vlees',
            submapNamen: ['a', 'b', 'c', 'd', 'e'],
            aantalComponenten: 0,
        });
        expect(tekst).toContain('5 submappen');
        expect(tekst).not.toContain('(a, b');
    });
});

describe('schoonParentId', () => {
    it('houdt een echte map-id vast', () => {
        const id = '3f7a1c2e-4b5d-4e6f-8a9b-0c1d2e3f4a5b';
        expect(schoonParentId(id)).toBe(id);
    });

    it('"Zonder folder" is geen map — een nieuwe map komt op het hoogste niveau', () => {
        expect(schoonParentId('__root__')).toBeNull();
        expect(schoonParentId(null)).toBeNull();
        expect(schoonParentId(undefined)).toBeNull();
    });
});
