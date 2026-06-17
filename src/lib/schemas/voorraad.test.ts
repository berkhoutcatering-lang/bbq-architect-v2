import { describe, it, expect } from 'vitest';
import {
    InventoryItemSchema,
    AdjustStockSchema,
    STOCK_MOVEMENT_TYPES,
} from './voorraad';

describe('InventoryItemSchema', () => {
    it('accepteert minimale input (alleen naam) en zet defaults', () => {
        const result = InventoryItemSchema.safeParse({ naam: 'Pulled pork' });
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.naam).toBe('Pulled pork');
            expect(result.data.current_stock).toBe(0);
            expect(result.data.min_stock).toBe(0);
            expect(result.data.par_level).toBe(0);
            expect(result.data.unit).toBe('stuks');
            expect(result.data.purchase_price).toBe(0);
            expect(result.data.categorie).toBe('');
            expect(result.data.supplier).toBe('');
            expect(result.data.allergenen).toEqual([]);
        }
    });

    it('weigert lege naam', () => {
        const result = InventoryItemSchema.safeParse({ naam: '' });
        expect(result.success).toBe(false);
    });

    it('weigert ontbrekende naam', () => {
        const result = InventoryItemSchema.safeParse({});
        expect(result.success).toBe(false);
    });

    it('weigert naam langer dan 200 chars', () => {
        const result = InventoryItemSchema.safeParse({ naam: 'x'.repeat(201) });
        expect(result.success).toBe(false);
    });

    it('weigert negatieve current_stock (server-side floor)', () => {
        const result = InventoryItemSchema.safeParse({ naam: 'Test', current_stock: -1 });
        expect(result.success).toBe(false);
        if (!result.success) {
            const stockErrors = result.error.flatten().fieldErrors.current_stock;
            expect(stockErrors?.[0]).toContain('niet negatief');
        }
    });

    it('weigert negatieve min_stock', () => {
        const result = InventoryItemSchema.safeParse({ naam: 'Test', min_stock: -5 });
        expect(result.success).toBe(false);
    });

    it('weigert negatieve purchase_price', () => {
        const result = InventoryItemSchema.safeParse({ naam: 'Test', purchase_price: -10 });
        expect(result.success).toBe(false);
    });

    it('weigert yield_factor boven 2 (vangnet voor typfouten met decimal-separator)', () => {
        const result = InventoryItemSchema.safeParse({ naam: 'Test', yield_factor: 2.5 });
        expect(result.success).toBe(false);
    });

    it('weigert negatieve yield_factor', () => {
        const result = InventoryItemSchema.safeParse({ naam: 'Test', yield_factor: -0.5 });
        expect(result.success).toBe(false);
    });

    it('accepteert yield_factor van 0 t/m 2 inclusief', () => {
        for (const yf of [0, 0.5, 0.85, 1.0, 1.5, 2.0]) {
            const result = InventoryItemSchema.safeParse({ naam: 'Test', yield_factor: yf });
            expect(result.success, `yield_factor=${yf}`).toBe(true);
        }
    });

    it('coerced current_stock + purchase_price van string-numbers', () => {
        const result = InventoryItemSchema.safeParse({
            naam: 'Brisket',
            current_stock: '12.5',
            purchase_price: '24.95',
        });
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.current_stock).toBe(12.5);
            expect(result.data.purchase_price).toBe(24.95);
        }
    });

    it('tht accepteert YYYY-MM-DD', () => {
        const result = InventoryItemSchema.safeParse({ naam: 'Yoghurt', tht: '2026-06-15' });
        expect(result.success).toBe(true);
    });

    it('tht weigert slash-formaat', () => {
        const result = InventoryItemSchema.safeParse({ naam: 'Yoghurt', tht: '2026/06/15' });
        expect(result.success).toBe(false);
    });

    it('tht mag null zijn (hardware / equipment zonder vervaldatum)', () => {
        const result = InventoryItemSchema.safeParse({ naam: 'BBQ-tang', tht: null });
        expect(result.success).toBe(true);
    });

    it('leverancier_id mag null zijn (item zonder leverancier-koppeling)', () => {
        const result = InventoryItemSchema.safeParse({ naam: 'Test', leverancier_id: null });
        expect(result.success).toBe(true);
    });

    it('allergenen accepteert string-array', () => {
        const result = InventoryItemSchema.safeParse({
            naam: 'Brood',
            allergenen: ['gluten', 'tarwe'],
        });
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.allergenen).toEqual(['gluten', 'tarwe']);
        }
    });

    it('accepteert volledige happy-path input', () => {
        const result = InventoryItemSchema.safeParse({
            naam: 'Pulled pork (rauw)',
            categorie: 'Vlees',
            current_stock: 8,
            min_stock: 5,
            par_level: 15,
            unit: 'kg',
            purchase_price: 12.95,
            supplier: 'Slagerij Schoonoord',
            leverancier_id: 3,
            yield_factor: 0.65,
            tht: '2026-06-20',
            avg_daily: 1.2,
            allergenen: [],
        });
        expect(result.success).toBe(true);
    });
});

describe('AdjustStockSchema', () => {
    it('accepteert positieve delta (ontvangst)', () => {
        const result = AdjustStockSchema.safeParse({
            inventory_id: 5,
            delta: 10,
            type: 'receive',
        });
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.delta).toBe(10);
            expect(result.data.type).toBe('receive');
        }
    });

    it('accepteert negatieve delta (verbruik)', () => {
        const result = AdjustStockSchema.safeParse({
            inventory_id: 5,
            delta: -3,
            type: 'usage',
        });
        expect(result.success).toBe(true);
    });

    it('weigert inventory_id ≤ 0', () => {
        const a = AdjustStockSchema.safeParse({ inventory_id: 0, delta: 1, type: 'receive' });
        const b = AdjustStockSchema.safeParse({ inventory_id: -1, delta: 1, type: 'receive' });
        expect(a.success).toBe(false);
        expect(b.success).toBe(false);
    });

    it('weigert ontbrekende inventory_id', () => {
        const result = AdjustStockSchema.safeParse({ delta: 1, type: 'receive' });
        expect(result.success).toBe(false);
    });

    it('weigert ongeldig movement-type', () => {
        const result = AdjustStockSchema.safeParse({
            inventory_id: 1,
            delta: 1,
            type: 'shrinkage',
        });
        expect(result.success).toBe(false);
    });

    it('accepteert alle 5 movement-types', () => {
        for (const type of STOCK_MOVEMENT_TYPES) {
            const result = AdjustStockSchema.safeParse({ inventory_id: 1, delta: 1, type });
            expect(result.success, `type=${type}`).toBe(true);
        }
    });

    it('coerced inventory_id + delta van string-numbers', () => {
        const result = AdjustStockSchema.safeParse({
            inventory_id: '7',
            delta: '-2.5',
            type: 'usage',
        });
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.inventory_id).toBe(7);
            expect(result.data.delta).toBe(-2.5);
        }
    });

    it('weigert note langer dan 500 chars', () => {
        const result = AdjustStockSchema.safeParse({
            inventory_id: 1,
            delta: 1,
            type: 'count',
            note: 'x'.repeat(501),
        });
        expect(result.success).toBe(false);
    });
});

describe('STOCK_MOVEMENT_TYPES', () => {
    it('exporteert exact 5 types in vaste volgorde', () => {
        expect(STOCK_MOVEMENT_TYPES).toEqual([
            'receive', 'usage', 'count', 'waste', 'transfer',
        ]);
    });
});
