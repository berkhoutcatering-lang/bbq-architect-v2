import { describe, it, expect } from 'vitest';
import {
    fmt2,
    normalizeLeverancier,
    normalizeFactuurnummer,
    fuzzyScore,
    detectDuplicates,
    findDuplicateGroups,
    matchInventoryItem,
    getProductPriceHistory,
} from './_utils';

/* fmt2 gebruikt non-breaking space ( ) tussen € en bedrag — dat voorkomt
   regelafbreking in de UI. Test-strings moeten die ook hebben. */
const NBSP = ' ';
const EUR = `€${NBSP}`;

describe('fmt2 — euro-formatter NL-style', () => {
    it('formatteert getal met 2 decimalen en komma', () => {
        expect(fmt2(12.5)).toBe(`${EUR}12,50`);
        expect(fmt2(0)).toBe(`${EUR}0,00`);
        /* Duizendtal-punt erbij: de oude test legde het ontbreken ervan vast. */
        expect(fmt2(1234.56)).toBe(`${EUR}1.234,56`);
    });

    it('parsed string-numbers', () => {
        expect(fmt2('12.50')).toBe(`${EUR}12,50`);
        expect(fmt2('0.01')).toBe(`${EUR}0,01`);
    });

    it('null/undefined/lege string → € 0,00', () => {
        expect(fmt2(null)).toBe(`${EUR}0,00`);
        expect(fmt2(undefined)).toBe(`${EUR}0,00`);
        expect(fmt2('')).toBe(`${EUR}0,00`);
    });

    it('niet-parseerbare string → € 0,00', () => {
        expect(fmt2('abc')).toBe(`${EUR}0,00`);
        expect(fmt2('--')).toBe(`${EUR}0,00`);
    });

    it('behoudt negatieve waardes', () => {
        expect(fmt2(-25)).toBe(`${EUR}-25,00`);
    });
});

describe('normalizeLeverancier — naam-canonicalisering', () => {
    it('lowercased + trimmed', () => {
        expect(normalizeLeverancier('  Sligro  ')).toBe('sligro');
        expect(normalizeLeverancier('HANOS')).toBe('hanos');
    });

    it('strip bedrijfs-suffixes (BV/NV/VOF/Holding/Groep)', () => {
        expect(normalizeLeverancier('Sligro B.V.')).toBe('sligro');
        expect(normalizeLeverancier('Hanos N.V.')).toBe('hanos');
        expect(normalizeLeverancier('Bakker Holtkamp VOF')).toBe('bakker holtkamp');
        expect(normalizeLeverancier('Makro Holding')).toBe('makro');
        expect(normalizeLeverancier('Berkhout Catering Groep')).toBe('berkhout catering');
    });

    it('strip parenthesized aliassen', () => {
        expect(normalizeLeverancier('Makro (Metro Cash & Carry)')).toBe('makro');
        expect(normalizeLeverancier('Lekkerland (Hanos groep)')).toBe('lekkerland');
    });

    it('collapsed multiple spaces', () => {
        expect(normalizeLeverancier('Sligro    Twente')).toBe('sligro twente');
    });

    it('null/empty/undefined → lege string', () => {
        expect(normalizeLeverancier(null)).toBe('');
        expect(normalizeLeverancier(undefined)).toBe('');
        expect(normalizeLeverancier('')).toBe('');
    });
});

describe('normalizeFactuurnummer — strip alle separators', () => {
    it('strip whitespace, dashes, underscores, slashes, dots', () => {
        expect(normalizeFactuurnummer('F-2026/001')).toBe('f2026001');
        expect(normalizeFactuurnummer('INV 2026-04-12')).toBe('inv20260412');
        expect(normalizeFactuurnummer('F_2026.001')).toBe('f2026001');
    });

    it('lowercased', () => {
        expect(normalizeFactuurnummer('FACT-2026')).toBe('fact2026');
    });

    it('null/empty → lege string', () => {
        expect(normalizeFactuurnummer(null)).toBe('');
        expect(normalizeFactuurnummer('')).toBe('');
    });
});

describe('fuzzyScore — string similarity 0-1', () => {
    it('identieke strings → 1', () => {
        expect(fuzzyScore('sligro', 'sligro')).toBe(1);
        expect(fuzzyScore('  SLIGRO  ', 'sligro')).toBe(1);
    });

    it('substring → 0.85', () => {
        expect(fuzzyScore('sligro twente', 'sligro')).toBe(0.85);
        expect(fuzzyScore('rundvlees', 'rund')).toBe(0.85);
    });

    it('word-overlap geeft fractie', () => {
        // 'pulled pork' en 'pulled' → 1 common word van 2 = score op woord-overlap
        const score = fuzzyScore('pulled pork', 'pulled bbq');
        expect(score).toBeGreaterThan(0);
        expect(score).toBeLessThan(1);
    });

    it('lege strings → 0', () => {
        expect(fuzzyScore('', 'sligro')).toBe(0);
        expect(fuzzyScore('sligro', '')).toBe(0);
        expect(fuzzyScore('', '')).toBe(0);
    });

    it('geen overlap → 0', () => {
        expect(fuzzyScore('hanos', 'pulled')).toBe(0);
    });

    it('case-insensitief', () => {
        expect(fuzzyScore('SLIGRO', 'sligro')).toBe(1);
    });
});

describe('detectDuplicates — exact / likely / possible classificatie', () => {
    const baseExisting = [
        { id: 1, leverancier: 'Sligro B.V.', factuurnummer: 'F-2026-001', datum: '2026-05-15', totaal_incl: 250.00 },
        { id: 2, leverancier: 'Hanos', factuurnummer: 'INV2026-99', datum: '2026-05-10', totaal_incl: 180.50 },
    ];

    it('EXACT match: factuurnr + leverancier komt overeen', () => {
        const candidate = { leverancier: 'Sligro', factuurnummer: 'F 2026 001', datum: '2026-05-20', totaal_incl: 999 };
        const matches = detectDuplicates(candidate, baseExisting);
        expect(matches.length).toBeGreaterThan(0);
        expect(matches[0].type).toBe('exact');
        expect(matches[0].existing.id).toBe(1);
        expect(matches[0].reasons).toContain('Zelfde factuurnummer');
        expect(matches[0].reasons).toContain('Zelfde leverancier');
    });

    it('LIKELY match: leverancier + bedrag + datum (geen factuurnr-overlap)', () => {
        const candidate = { leverancier: 'Sligro', factuurnummer: 'OTHER-99', datum: '2026-05-15', totaal_incl: 250.00 };
        const matches = detectDuplicates(candidate, baseExisting);
        expect(matches.length).toBeGreaterThan(0);
        expect(matches[0].type).toBe('likely');
        expect(matches[0].reasons).toContain('Zelfde leverancier');
        expect(matches[0].reasons).toContain('Zelfde bedrag');
        expect(matches[0].reasons).toContain('Zelfde datum');
    });

    it('POSSIBLE match: alleen bedrag + datum', () => {
        const candidate = { leverancier: 'OnbekendeLeverancier', factuurnummer: 'X', datum: '2026-05-15', totaal_incl: 250.00 };
        const matches = detectDuplicates(candidate, baseExisting);
        expect(matches.length).toBeGreaterThan(0);
        expect(matches[0].type).toBe('possible');
    });

    it('geen match bij verschillend alles', () => {
        const candidate = { leverancier: 'Crisp', factuurnummer: 'X-9999', datum: '2026-01-01', totaal_incl: 50.00 };
        const matches = detectDuplicates(candidate, baseExisting);
        expect(matches).toEqual([]);
    });

    it('respecteert excludeId — eigen rij wordt niet als duplicate gemeld', () => {
        const matches = detectDuplicates(baseExisting[0], baseExisting, 1);
        expect(matches).toEqual([]);
    });

    it('sorteert exact > likely > possible', () => {
        const existing = [
            { id: 1, leverancier: 'X', factuurnummer: 'OTHER', datum: '2026-05-15', totaal_incl: 250 },        // possible
            { id: 2, leverancier: 'Sligro', factuurnummer: 'F-001', datum: '2026-05-15', totaal_incl: 250 },   // likely
            { id: 3, leverancier: 'Sligro', factuurnummer: 'F-2026-001', datum: '2026-05-20', totaal_incl: 99 }, // exact
        ];
        const candidate = { leverancier: 'Sligro B.V.', factuurnummer: 'F 2026 001', datum: '2026-05-15', totaal_incl: 250.00 };
        const matches = detectDuplicates(candidate, existing);
        expect(matches[0].type).toBe('exact');
        expect(matches[matches.length - 1].type).toBe('possible');
    });

    it('werkt met null/undefined velden', () => {
        const candidate = { leverancier: null, factuurnummer: undefined, datum: null, totaal_incl: null };
        const matches = detectDuplicates(candidate, baseExisting);
        expect(matches).toEqual([]);
    });
});

describe('findDuplicateGroups — opruim-helper', () => {
    it('groepeert exact + likely duplicates', () => {
        const list = [
            { id: 1, leverancier: 'Sligro', factuurnummer: 'F-001', datum: '2026-05-15', totaal_incl: 250 },
            { id: 2, leverancier: 'Sligro', factuurnummer: 'F-001', datum: '2026-05-15', totaal_incl: 250 }, // exact dupe
            { id: 3, leverancier: 'Crisp', factuurnummer: 'C-99', datum: '2026-05-10', totaal_incl: 50 },
        ];
        const groups = findDuplicateGroups(list);
        expect(groups.length).toBe(1);
        expect(groups[0].length).toBe(2);
        expect(groups[0].map(g => g.id).sort()).toEqual([1, 2]);
    });

    it('lege groep bij geen duplicaten', () => {
        const list = [
            { id: 1, leverancier: 'Sligro', factuurnummer: 'F-001', datum: '2026-05-15', totaal_incl: 250 },
            { id: 2, leverancier: 'Crisp', factuurnummer: 'C-99', datum: '2026-05-10', totaal_incl: 50 },
        ];
        expect(findDuplicateGroups(list)).toEqual([]);
    });

    it('respecteert non-overlapping — een rij zit in max 1 groep', () => {
        const list = [
            { id: 1, leverancier: 'Sligro', factuurnummer: 'F-001', datum: '2026-05-15', totaal_incl: 250 },
            { id: 2, leverancier: 'Sligro', factuurnummer: 'F-001', datum: '2026-05-15', totaal_incl: 250 },
            { id: 3, leverancier: 'Sligro', factuurnummer: 'F-001', datum: '2026-05-15', totaal_incl: 250 },
        ];
        const groups = findDuplicateGroups(list);
        const allIds = groups.flatMap(g => g.map(x => x.id));
        const uniqueIds = new Set(allIds);
        expect(allIds.length).toBe(uniqueIds.size);
    });
});

describe('matchInventoryItem — fuzzy product-to-inventory', () => {
    const inventory = [
        { id: 10, naam: 'Rundvlees brisket', current_stock: 5 },
        { id: 11, naam: 'Pulled pork', current_stock: 8 },
        { id: 12, naam: 'Coca-Cola 0.33L', current_stock: 24 },
    ];

    it('exacte match → confidence 1', () => {
        const match = matchInventoryItem('Rundvlees brisket', inventory);
        expect(match).not.toBeNull();
        expect(match!.confidence).toBe(1);
        expect(match!.item.id).toBe(10);
    });

    it('substring match → confidence 0.85', () => {
        const match = matchInventoryItem('Pulled pork extra premium', inventory);
        expect(match).not.toBeNull();
        expect(match!.confidence).toBe(0.85);
        expect(match!.item.id).toBe(11);
    });

    it('lage confidence (<0.5) → null', () => {
        const match = matchInventoryItem('Geen overlap met iets', inventory);
        expect(match).toBeNull();
    });

    it('lege productnaam → null', () => {
        expect(matchInventoryItem('', inventory)).toBeNull();
    });

    it('lege inventory → null', () => {
        expect(matchInventoryItem('Rundvlees', [])).toBeNull();
    });

    it('selecteert highest-confidence match', () => {
        const inv = [
            { id: 1, naam: 'rund' },          // substring → 0.85
            { id: 2, naam: 'rundvlees' },     // exact → 1.0
        ];
        const match = matchInventoryItem('rundvlees', inv);
        expect(match!.item.id).toBe(2);
        expect(match!.confidence).toBe(1);
    });
});

describe('getProductPriceHistory — laatste 8, nieuwste eerst', () => {
    const supplierPrices = [
        { product_naam: 'Rundvlees brisket', prijs: '12.50', datum: '2026-05-15' },
        { product_naam: 'Coca-Cola', prijs: '1.20', datum: '2026-04-01' },
    ];

    const invoices = [
        {
            datum: '2026-05-20',
            raw_ai_response: {
                regels: [
                    { product_naam: 'Rundvlees brisket', prijs_per_eenheid: '13.00', prijs_normaal: '13.00' },
                ],
            },
        },
    ];

    it('combineert supplier_prices + invoice regels', () => {
        const history = getProductPriceHistory('Rundvlees brisket', supplierPrices, invoices);
        expect(history.length).toBe(2);
    });

    it('sorteert nieuwste eerst', () => {
        const history = getProductPriceHistory('Rundvlees brisket', supplierPrices, invoices);
        expect(history[0].datum).toBe('2026-05-20');
        expect(history[1].datum).toBe('2026-05-15');
    });

    it('prefereert prijs_normaal boven prijs_per_eenheid bij invoice regels', () => {
        const invs = [
            {
                datum: '2026-05-01',
                raw_ai_response: {
                    regels: [
                        { product_naam: 'Brisket', prijs_per_eenheid: '8.00', prijs_normaal: '12.00' }, // bulk-korting case
                    ],
                },
            },
        ];
        const history = getProductPriceHistory('Brisket', [], invs);
        expect(history[0].prijs).toBe(12.00);
    });

    it('lege productnaam → lege array', () => {
        expect(getProductPriceHistory('', supplierPrices, invoices)).toEqual([]);
    });

    it('cap op 8 resultaten', () => {
        const manyPrices = Array.from({ length: 20 }, (_, i) => ({
            product_naam: 'Rundvlees',
            prijs: String(i),
            datum: `2026-05-${String(i + 1).padStart(2, '0')}`,
        }));
        const history = getProductPriceHistory('Rundvlees', manyPrices, []);
        expect(history.length).toBeLessThanOrEqual(8);
    });

    it('bron-label correct (csv vs factuur)', () => {
        const history = getProductPriceHistory('Rundvlees brisket', supplierPrices, invoices);
        const fromCsv = history.find(h => h.datum === '2026-05-15');
        const fromInvoice = history.find(h => h.datum === '2026-05-20');
        expect(fromCsv?.bron).toBe('csv');
        expect(fromInvoice?.bron).toBe('factuur');
    });
});
