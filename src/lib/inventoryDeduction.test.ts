import { describe, it, expect } from 'vitest';
import {
    parseQty,
    matchInventory,
    normalizeInventoryName,
    type InventoryRow,
} from './inventoryDeduction';

describe('normalizeInventoryName', () => {
    it('lowercase + trim + alphanumeriek-only', () => {
        expect(normalizeInventoryName('  Pulled-Pork! ')).toBe('pulledpork');
        expect(normalizeInventoryName('Mac & Cheese')).toBe('mac  cheese');
        expect(normalizeInventoryName('')).toBe('');
    });
});

describe('parseQty', () => {
    it('parsed eenheid + qty + rest naam', () => {
        expect(parseQty('1.5 kg pulled pork')).toEqual({ qty: 1.5, unit: 'kg', rest: 'pulled pork' });
        expect(parseQty('300g brisket')).toEqual({ qty: 300, unit: 'g', rest: 'brisket' });
        expect(parseQty('8 stuks brood')).toEqual({ qty: 8, unit: 'stuks', rest: 'brood' });
        expect(parseQty('500 ml saus')).toEqual({ qty: 500, unit: 'ml', rest: 'saus' });
    });

    it('accepteert komma als decimaal-separator', () => {
        expect(parseQty('2,5 kg pp')?.qty).toBe(2.5);
    });

    it('parsed zonder unit', () => {
        const r = parseQty('5 brood');
        expect(r?.qty).toBe(5);
        expect(r?.unit).toBeNull();
        expect(r?.rest).toBe('brood');
    });

    it('returnt null bij ongeldige input', () => {
        expect(parseQty('')).toBeNull();
        expect(parseQty('geen getal')).toBeNull();
        expect(parseQty('0 kg pp')).toBeNull(); /* qty <= 0 */
    });

    it('parsed qty zonder rest-naam', () => {
        const r = parseQty('1.5 kg');
        expect(r?.qty).toBe(1.5);
        expect(r?.unit).toBe('kg');
        expect(r?.rest).toBe('');
    });
});

describe('matchInventory', () => {
    const inv: InventoryRow[] = [
        { id: 1, naam: 'Pulled Pork', current_stock: 10 },
        { id: 2, naam: 'Pulled Pork Shoulder', current_stock: 5 },
        { id: 3, naam: 'Pulled Pork Rub', current_stock: 2 },
        { id: 4, naam: 'Brisket', current_stock: 8 },
        { id: 5, naam: 'Coleslaw Mix', current_stock: 4 },
    ];

    it('exacte match wint van prefix-match', () => {
        const r = matchInventory('Pulled Pork', inv);
        expect(r?.id).toBe(1);
    });

    it('prefix-match met kortste naam wint', () => {
        const r = matchInventory('Pulled', inv);
        /* Geen exact; alle 3 starten met "pulled". Kortste is "Pulled Pork" (id=1). */
        expect(r?.id).toBe(1);
    });

    it('case + spaces normaliseren correct', () => {
        const r = matchInventory('  brisket  ', inv);
        expect(r?.id).toBe(4);
    });

    it('returnt null voor onbekend ingredient', () => {
        expect(matchInventory('Tofu', inv)).toBeNull();
    });

    it('returnt null voor te korte query (<3 chars)', () => {
        expect(matchInventory('aa', inv)).toBeNull();
    });

    it('reverse match: query bevat inventory naam', () => {
        const inv2: InventoryRow[] = [{ id: 1, naam: 'Brisket' }];
        /* Query is langer dan inv-naam — moet nog matchen */
        expect(matchInventory('Smoked Brisket Texas Style', inv2)?.id).toBe(1);
    });

    it('selecteer specifiekere match (exact > prefix > include)', () => {
        const inv2: InventoryRow[] = [
            { id: 1, naam: 'Pork' },
            { id: 2, naam: 'Pulled Pork' },
        ];
        /* Exact "Pulled Pork" wint van include-match op "Pork". */
        expect(matchInventory('Pulled Pork', inv2)?.id).toBe(2);
    });
});
