import { describe, it, expect } from 'vitest';
import {
    generateUBL,
    generateAndValidateUBL,
    checkUblExportable,
    validateUBL,
    UblExportError,
} from './ublExport';
import type { Factuur } from '@/types';

const LEVERANCIER = {
    naam: 'Hop & Bites',
    kvk: '12345678',
    btw_nummer: 'NL123456789B01',
    adres: 'Hoofdstraat 1',
    postcode: '7848 AA',
    plaats: 'Schoonoord',
    iban: 'NL91ABNA0417164300',
};

function factuur(items: Array<{ omschrijving?: string; qty?: number; prijs?: number; btw?: number }>): Factuur {
    return {
        id: 1,
        nummer: '2026-001',
        status: 'verzonden',
        client_naam: 'Klant BV',
        client_adres: 'Kerkstraat 2',
        datum: '2026-04-15',
        vervaldatum: '2026-04-29',
        items,
    } as unknown as Factuur;
}

describe('checkUblExportable', () => {
    it('gewone 21%/9%-factuur is exporteerbaar', () => {
        expect(checkUblExportable(factuur([
            { omschrijving: 'Catering', qty: 50, prijs: 32.5, btw: 9 },
            { omschrijving: 'Bediening', qty: 8, prijs: 45, btw: 21 },
        ]))).toEqual([]);
    });

    /* Regressie: `item.btw || 21` maakte hier stilzwijgend 21% van, waarna een
       0%-factuur met een verkeerd bedrag naar de klant en naar Peppol ging. */
    it('weigert een 0%-regel omdat de reden niet vastligt', () => {
        const problems = checkUblExportable(factuur([{ omschrijving: 'Export order', qty: 1, prijs: 1000, btw: 0 }]));
        expect(problems).toHaveLength(1);
        expect(problems[0]).toMatch(/0%/);
        expect(problems[0]).toMatch(/Export order/);
    });

    it('weigert een regel zonder tarief', () => {
        const problems = checkUblExportable(factuur([{ omschrijving: 'Vergeten regel', qty: 1, prijs: 100 }]));
        expect(problems).toHaveLength(1);
        expect(problems[0]).toMatch(/geen BTW-percentage/);
    });

    it('weigert een negatief tarief', () => {
        const problems = checkUblExportable(factuur([{ qty: 1, prijs: 100, btw: -21 }]));
        expect(problems[0]).toMatch(/negatief/);
    });

    it('noemt elk probleem apart zodat je ze allemaal ziet', () => {
        expect(checkUblExportable(factuur([
            { qty: 1, prijs: 100, btw: 0 },
            { qty: 1, prijs: 100 },
            { qty: 1, prijs: 100, btw: 21 },
        ]))).toHaveLength(2);
    });
});

describe('generateUBL', () => {
    it('rekent 9% als 9% en niet als 21%', () => {
        const xml = generateUBL(factuur([{ omschrijving: 'Catering', qty: 100, prijs: 10, btw: 9 }]), { leverancier: LEVERANCIER });
        expect(xml).toContain('<cbc:Percent>9</cbc:Percent>');
        expect(xml).toContain('<cbc:TaxAmount currencyID="EUR">90.00</cbc:TaxAmount>');
        expect(xml).toContain('<cbc:PayableAmount currencyID="EUR">1090.00</cbc:PayableAmount>');
    });

    it('gooit UblExportError in plaats van een verkeerd bestand te produceren', () => {
        expect(() => generateUBL(factuur([{ qty: 1, prijs: 100, btw: 0 }]), { leverancier: LEVERANCIER }))
            .toThrow(UblExportError);
    });

    it('produceert XML die de eigen BIS-validatie doorstaat', () => {
        const xml = generateUBL(factuur([
            { omschrijving: 'Catering', qty: 50, prijs: 32.5, btw: 9 },
            { omschrijving: 'Bediening', qty: 8, prijs: 45, btw: 21 },
        ]), { leverancier: LEVERANCIER });
        const result = validateUBL(xml);
        expect(result.errors).toEqual([]);
        expect(result.valid).toBe(true);
    });
});

describe('generateAndValidateUBL', () => {
    it('geeft xml null en een leesbare fout bij een niet-exporteerbare factuur', () => {
        const { xml, validation } = generateAndValidateUBL(
            factuur([{ omschrijving: 'Verlegd', qty: 1, prijs: 500, btw: 0 }]),
            { leverancier: LEVERANCIER },
        );
        expect(xml).toBeNull();
        expect(validation.valid).toBe(false);
        expect(validation.errors[0]).toMatch(/Verlegd/);
    });

    it('geeft xml terug bij een gezonde factuur', () => {
        const { xml, validation } = generateAndValidateUBL(
            factuur([{ omschrijving: 'Catering', qty: 50, prijs: 32.5, btw: 9 }]),
            { leverancier: LEVERANCIER },
        );
        expect(xml).toBeTruthy();
        expect(validation.valid).toBe(true);
    });
});
