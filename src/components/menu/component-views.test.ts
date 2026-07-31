import { describe, it, expect } from 'vitest';
import { folderLabel } from './component-views';

/* De kaart en de lijst lieten nergens zien in welke map een bouwsteen zat. Deze
   helper is de bron van dat regeltje; hij mag alleen iets zeggen als hij het
   zeker weet, want een verkeerde mapnaam is erger dan geen mapnaam. */

describe('folderLabel', () => {
    it('noemt een bouwsteen zonder map bij naam', () => {
        expect(folderLabel(null, {})).toEqual({ id: null, tekst: 'Zonder map' });
    });

    it('geeft de mapnaam terug als die bekend is', () => {
        expect(folderLabel('abc', { abc: 'Sauzen' })).toEqual({ id: 'abc', tekst: 'Sauzen' });
    });

    it('zegt niets als de map wel bestaat maar de naam ontbreekt', () => {
        expect(folderLabel('abc', {})).toBeNull();
        expect(folderLabel('abc', undefined)).toBeNull();
    });

    it('zegt niets als het veld helemaal niet meegegeven is', () => {
        // undefined betekent "deze aanroep weet het niet", en dat is iets
        // anders dan "zit in geen enkele map".
        expect(folderLabel(undefined, { abc: 'Sauzen' })).toBeNull();
    });
});
