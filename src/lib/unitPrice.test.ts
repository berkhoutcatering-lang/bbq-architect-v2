import { describe, it, expect } from 'vitest';
import { packToBase, packToBaseMulti, unitPriceLabel, exampleUseCost, normalizeYield, effectiveBaseCostCents, costAtUseCents, purchaseQtyForUse, convertQty, unitsCompatible, compatibleUnits } from './unitPrice';

/* Deze tests ontbraken volledig (briefing §20.1). unitPrice is de
   rekenkundige canon voor gerecht-kostprijzen — hier hard vastgelegd. */

describe('packToBase — gewicht naar per 100 g', () => {
    it('2,5 kg voor €22,50 → base per 100 g', () => {
        const b = packToBase(2250, 2.5, 'kg');
        expect(b).toEqual({ base_quantity: 100, base_unit: 'g', base_cost_cents: 90 });
        // 90 cent / 100 g = €9,00 / kg
        expect(unitPriceLabel(b!.base_cost_cents, b!.base_quantity, b!.base_unit)).toBe('€ 9,00 / kg');
    });
    it('750 g voor €8,25 → €11,00 / kg', () => {
        const b = packToBase(825, 750, 'g');
        expect(b!.base_cost_cents).toBe(110); // 110 cent / 100 g
        expect(unitPriceLabel(b!.base_cost_cents, b!.base_quantity, b!.base_unit)).toBe('€ 11,00 / kg');
    });
    it('gram-invoer werkt gelijk aan kg-invoer', () => {
        expect(packToBase(2250, 2500, 'g')).toEqual(packToBase(2250, 2.5, 'kg'));
    });
});

describe('packToBase — volume en stuks', () => {
    it('1 liter voor €6,80 → €6,80 / liter', () => {
        const b = packToBase(680, 1, 'liter');
        expect(b).toEqual({ base_quantity: 100, base_unit: 'ml', base_cost_cents: 68 });
        expect(unitPriceLabel(b!.base_cost_cents, b!.base_quantity, b!.base_unit)).toBe('€ 6,80 / liter');
    });
    it('12 stuks voor €5,04 → €0,42 / stuk', () => {
        const b = packToBase(504, 12, 'stuk');
        expect(b).toEqual({ base_quantity: 1, base_unit: 'stuk', base_cost_cents: 42 });
        expect(unitPriceLabel(b!.base_cost_cents, b!.base_quantity, b!.base_unit)).toBe('€ 0,42 / stuk');
    });
});

describe('packToBase — randgevallen', () => {
    it('null bij ongeldige input', () => {
        expect(packToBase(-1, 1, 'kg')).toBeNull();
        expect(packToBase(100, 0, 'kg')).toBeNull();
        expect(packToBase(100, -5, 'liter')).toBeNull();
    });
});

describe('packToBaseMulti — multipacks', () => {
    it('24 × 330 ml voor €18,96 → per 100 ml (≈€2,39/L)', () => {
        const b = packToBaseMulti(1896, 24, 330, 'ml');
        // totaal 7920 ml → base_cost_cents = round(1896*100/7920) = 24
        expect(b).toEqual({ base_quantity: 100, base_unit: 'ml', base_cost_cents: 24 });
    });
    it('6 × 1,5 L voor €13,50 → €1,50 / liter', () => {
        const b = packToBaseMulti(1350, 6, 1.5, 'liter');
        // totaal 9000 ml → round(1350*100/9000) = 15 cent/100ml = €1,50/L
        expect(b!.base_cost_cents).toBe(15);
        expect(unitPriceLabel(b!.base_cost_cents, b!.base_quantity, b!.base_unit)).toBe('€ 1,50 / liter');
    });
    it('2 × 1 kg voor €18,95 → gebruikt de pakprijs, niet het aantal', () => {
        const b = packToBaseMulti(1895, 2, 1, 'kg');
        // totaal 2000 g → round(1895*100/2000) = 95 cent/100g = €9,475/kg → label €9.48
        expect(b!.base_cost_cents).toBe(95);
    });
    it("'piece' wordt als 'stuk' behandeld", () => {
        const b = packToBaseMulti(504, 12, 1, 'piece');
        expect(b).toEqual({ base_quantity: 1, base_unit: 'stuk', base_cost_cents: 42 });
    });
    it('null bij ongeldig aantal of inhoud', () => {
        expect(packToBaseMulti(1000, 0, 330, 'ml')).toBeNull();
        expect(packToBaseMulti(1000, 24, 0, 'ml')).toBeNull();
    });
});

describe('exampleUseCost', () => {
    it('200 g dosering uit een per-100g base', () => {
        const b = packToBase(2250, 2.5, 'kg')!; // 90 cent / 100 g
        const use = exampleUseCost(b);
        expect(use).toEqual({ qty: 200, unit: 'g', cents: 180 }); // 200 g = €1,80
    });
});

/* ── Snijverlies (yield) ─────────────────────────────────────────────────── */

describe('normalizeYield — klemt naar (0,1], nooit een kostprijs opblazen', () => {
    it('laat een geldige yield staan', () => {
        expect(normalizeYield(0.7)).toBe(0.7);
        expect(normalizeYield(1)).toBe(1);
    });
    it('ontbrekend/ongeldig → 1 (geen verlies), niet 0', () => {
        for (const bad of [undefined, null, '', 'abc', NaN, 0, -0.5]) {
            expect(normalizeYield(bad)).toBe(1);
        }
    });
    it('boven 1 wordt geklemd — een yield mag de kostprijs nooit VERLAGEN', () => {
        expect(normalizeYield(1.5)).toBe(1);
        expect(normalizeYield(14)).toBe(1);
    });
});

describe('costAtUseCents — Sam’s bavette, het ijkpunt', () => {
    /* Vittore Bavette: €3,29 per 100 g inkoop, 70% bruikbaar, 40 g op het bord. */
    const bavette = { quantityUsed: 40, baseQuantity: 100, baseCostCents: 329 };

    it('zonder snijverlies: €1,32', () => {
        expect(costAtUseCents({ ...bavette, yieldFactor: 1 })).toBe(132);
    });
    it('met 70% opbrengst: €1,88', () => {
        expect(costAtUseCents({ ...bavette, yieldFactor: 0.7 })).toBe(188);
    });
    it('effectieve prijs per 100 g wordt €4,70', () => {
        expect(effectiveBaseCostCents(329, 0.7)).toBe(470);
    });
    it('je koopt 57 g in voor 40 g op het bord', () => {
        expect(Math.round(purchaseQtyForUse(40, 0.7))).toBe(57);
    });
    it('ontbrekende yield gedraagt zich als 1 (identiek aan vandaag)', () => {
        expect(costAtUseCents(bavette)).toBe(132);
        expect(costAtUseCents({ ...bavette, yieldFactor: null })).toBe(132);
    });
    it('base_quantity 0 geeft 0, geen deling door nul', () => {
        expect(costAtUseCents({ quantityUsed: 40, baseQuantity: 0, baseCostCents: 329, yieldFactor: 0.7 })).toBe(0);
    });
    it('nooit negatief', () => {
        expect(costAtUseCents({ quantityUsed: -40, baseQuantity: 100, baseCostCents: 329, yieldFactor: 0.7 })).toBe(0);
    });
});

describe('costAtUseCents — pariteit met de SQL-formule', () => {
    /* Spiegelt GREATEST(0, ROUND(qty/base * cost / yield)) uit migratie
       20260729120000. Wijkt dit af, dan lopen DB en app uit elkaar. */
    const rows: Array<[number, number, number, number, number]> = [
        // qty, base, cost, yield, verwacht
        [40, 100, 329, 0.7, 188],
        [100, 100, 329, 0.7, 470],
        [250, 100, 329, 1, 823],
        [1, 1, 600, 0.5, 1200],
        [8, 100, 263, 0.85, 25],
        [200, 100, 82, 0.9, 182],
        [5, 100, 82, 1, 4],
    ];
    for (const [qty, base, cost, y, verwacht] of rows) {
        it(`${qty}/${base} × ${cost}c ÷ ${y} = ${verwacht}c`, () => {
            expect(costAtUseCents({ quantityUsed: qty, baseQuantity: base, baseCostCents: cost, yieldFactor: y })).toBe(verwacht);
        });
    }
});

/* ── Eenheid-conversie ───────────────────────────────────────────────────── */

describe('convertQty — binnen een familie exact, daarbuiten null', () => {
    it('gewicht', () => {
        expect(convertQty(2.5, 'kg', 'g')).toBe(2500);
        expect(convertQty(250, 'g', 'kg')).toBe(0.25);
    });
    it('volume', () => {
        expect(convertQty(1, 'liter', 'ml')).toBe(1000);
        expect(convertQty(500, 'ml', 'liter')).toBe(0.5);
    });
    it('stuk en portie zijn 1-op-1', () => {
        expect(convertQty(3, 'stuk', 'portie')).toBe(3);
    });
    it('tussen families kan het NIET — geen verzonnen getal', () => {
        expect(convertQty(5, 'g', 'ml')).toBeNull();
        expect(convertQty(1, 'stuk', 'g')).toBeNull();
        expect(convertQty(1, 'kg', 'stuk')).toBeNull();
    });
    it('onbekende eenheid geeft null', () => {
        expect(convertQty(1, 'snufje', 'g')).toBeNull();
    });
});

describe('unitsCompatible / compatibleUnits', () => {
    it('herkent families', () => {
        expect(unitsCompatible('kg', 'g')).toBe(true);
        expect(unitsCompatible('ml', 'liter')).toBe(true);
        expect(unitsCompatible('g', 'ml')).toBe(false);
    });
    it('biedt alleen passende eenheden aan', () => {
        expect(compatibleUnits('g')).toEqual(['g', 'kg']);
        expect(compatibleUnits('ml')).toEqual(['ml', 'liter']);
        expect(compatibleUnits('stuk')).toEqual(['stuk', 'portie']);
    });
});

describe('costAtUseCents — de kg-op-100g-fout uit Sams data', () => {
    /* "MC KP Dij" — 2,5 kg gebruikt op een component van 100 g à €0,06.
       Vóór de fix: 2,5/100 x 6 = 0,15 cent => €0,00. Moet €1,50 zijn. */
    it('rekent kg om naar de basis in gram', () => {
        expect(costAtUseCents({
            quantityUsed: 2.5, usedUnit: 'kg',
            baseQuantity: 100, baseUnit: 'g', baseCostCents: 6,
        })).toBe(150);
    });
    it('zonder eenheden gedraagt het zich als voorheen', () => {
        expect(costAtUseCents({ quantityUsed: 2.5, baseQuantity: 100, baseCostCents: 6 })).toBe(0);
    });
    it('gelijke eenheden veranderen niets', () => {
        expect(costAtUseCents({
            quantityUsed: 40, usedUnit: 'g', baseQuantity: 100, baseUnit: 'g', baseCostCents: 329,
        })).toBe(132);
    });
    it('onmogelijke combinatie verzint niets — laat de hoeveelheid staan', () => {
        expect(costAtUseCents({
            quantityUsed: 5, usedUnit: 'g', baseQuantity: 100, baseUnit: 'ml', baseCostCents: 82,
        })).toBe(4);
    });
    it('conversie en snijverlies werken samen', () => {
        /* 1 kg op een 100g-basis van €3,29, 70% opbrengst:
           1000/100 x 329 = 3290 c, / 0,7 = 4700 c = €47,00 */
        expect(costAtUseCents({
            quantityUsed: 1, usedUnit: 'kg',
            baseQuantity: 100, baseUnit: 'g', baseCostCents: 329, yieldFactor: 0.7,
        })).toBe(4700);
    });
});
