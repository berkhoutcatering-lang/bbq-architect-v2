import { describe, expect, it } from 'vitest';
import { bonKopUitInstellingen } from './bonKop';
import { BonKop } from './contract';

describe('bonKopUitInstellingen', () => {
    it('splitst het adres op de komma en neemt btw en KvK over', () => {
        const kop = bonKopUitInstellingen({ bedrijfsnaam: 'Hop & Bites', adres: 'Tramstraat 13, 7848 BG Schoonoord', kvk: '80189458', btw: 'NL000000000B01' });
        expect(kop).toEqual({ naam: 'Hop & Bites', adresregels: ['Tramstraat 13', '7848 BG Schoonoord'], btw_nummer: 'NL000000000B01', kvk_nummer: '80189458', voettekst: null });
        expect(BonKop.safeParse(kop).success).toBe(true);
    });

    it('valt terug op btw_nummer en laat lege velden weg', () => {
        const kop = bonKopUitInstellingen({ bedrijfsnaam: 'Hop & Bites', adres: '  ', kvk: '', btw: null, btw_nummer: 'NL1' });
        expect(kop).toEqual({ naam: 'Hop & Bites', adresregels: [], btw_nummer: 'NL1', kvk_nummer: null, voettekst: null });
    });

    it('zonder bedrijfsnaam geen kop', () => {
        expect(bonKopUitInstellingen({ bedrijfsnaam: ' ', adres: 'X' })).toBeNull();
        expect(bonKopUitInstellingen(null)).toBeNull();
    });
});
