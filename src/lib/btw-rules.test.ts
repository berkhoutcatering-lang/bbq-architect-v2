import { describe, it, expect } from 'vitest';
import {
    BTW_RULES_2026,
    BTW_TARIEVEN,
    BTW_TABEL_VANAF,
    ALCOHOL_GRENS,
    drinkCategoryForAlcohol,
    getBtwRules,
    getBtwRate,
    getBtwPct,
    validateBtwPct,
    categoryFromLegacyPct,
    isMissingBtwPct,
    resolveBtwPct,
    requireBtwPct,
    type BtwCategory,
} from './btw-rules';

describe('BTW_RULES_2026 lookup-tabel', () => {
    it('bevat alle 10 categorieën', () => {
        expect(BTW_RULES_2026.length).toBe(10);
    });

    it('food_catering = 9%', () => {
        const rule = BTW_RULES_2026.find(r => r.category === 'food_catering');
        expect(rule?.rate).toBe(0.09);
        expect(rule?.rate_pct).toBe(9);
    });

    it('alcohol = 21%', () => {
        const rule = BTW_RULES_2026.find(r => r.category === 'alcohol');
        expect(rule?.rate).toBe(0.21);
        expect(rule?.rate_pct).toBe(21);
    });

    /* Regressie: hier stond 21% met de toelichting "sinds 1 jan 2026 alle
       drinks 21%". Dat verwarde de VERBRUIKSBELASTING op frisdrank met de btw.
       Belastingdienst: alcoholvrije dranken staan op 9%. Deze fout rekende te
       veel btw op vrijwel elke cateringfactuur. */
    it('soft_drinks = 9% — alcoholvrije dranken vallen onder het lage tarief', () => {
        const rule = BTW_RULES_2026.find(r => r.category === 'soft_drinks');
        expect(rule?.rate).toBe(0.09);
        expect(rule?.rate_pct).toBe(9);
    });

    it('food en alcoholvrije dranken staan op hetzelfde tarief', () => {
        expect(getBtwPct('soft_drinks')).toBe(getBtwPct('food_catering'));
    });

    it('b2b_intra_eu_reverse = 0%', () => {
        const rule = BTW_RULES_2026.find(r => r.category === 'b2b_intra_eu_reverse');
        expect(rule?.rate).toBe(0);
        expect(rule?.rate_pct).toBe(0);
    });

    it('elk record heeft consistente rate + rate_pct', () => {
        for (const rule of BTW_RULES_2026) {
            expect(rule.rate_pct).toBe(Math.round(rule.rate * 100));
        }
    });

    it('elke categorie heeft label', () => {
        for (const rule of BTW_RULES_2026) {
            expect(rule.label.length).toBeGreaterThan(0);
        }
    });
});

describe('getBtwRate', () => {
    it('returnt decimaal tarief voor bekende categorie', () => {
        expect(getBtwRate('food_catering')).toBe(0.09);
        expect(getBtwRate('service_personnel')).toBe(0.21);
        expect(getBtwRate('export_non_eu')).toBe(0);
    });

    it('throwt bij onbekende categorie', () => {
        expect(() => getBtwRate('food_lasertag' as BtwCategory)).toThrow();
    });
});

describe('getBtwPct', () => {
    it('returnt geheel percentage', () => {
        expect(getBtwPct('food_catering')).toBe(9);
        expect(getBtwPct('alcohol')).toBe(21);
        expect(getBtwPct('exempt')).toBe(0);
    });

    it('throwt bij onbekende categorie', () => {
        expect(() => getBtwPct('niet_bestaand' as BtwCategory)).toThrow();
    });
});

describe('validateBtwPct', () => {
    it('snap naar 0 voor waardes <5', () => {
        expect(validateBtwPct(0)).toBe(0);
        expect(validateBtwPct(1)).toBe(0);
        expect(validateBtwPct(3)).toBe(0);
        expect(validateBtwPct(4.99)).toBe(0);
    });

    it('snap naar 9 voor waardes 5-14', () => {
        expect(validateBtwPct(5)).toBe(9);
        expect(validateBtwPct(8.5)).toBe(9);
        expect(validateBtwPct(9)).toBe(9);
        expect(validateBtwPct(14.99)).toBe(9);
    });

    it('snap naar 21 voor waardes ≥15', () => {
        expect(validateBtwPct(15)).toBe(21);
        expect(validateBtwPct(21)).toBe(21);
        expect(validateBtwPct(22)).toBe(21);
        expect(validateBtwPct(50)).toBe(21);
    });

    it('handelt negatieve / non-numerieke waardes af', () => {
        expect(validateBtwPct(-5)).toBe(0);
        expect(validateBtwPct(NaN)).toBe(0);
        expect(validateBtwPct(undefined)).toBe(0);
        expect(validateBtwPct(null)).toBe(0);
        expect(validateBtwPct('abc')).toBe(0);
    });

    it('parsed string-numbers', () => {
        expect(validateBtwPct('9')).toBe(9);
        expect(validateBtwPct('21')).toBe(21);
        expect(validateBtwPct('3')).toBe(0);
    });

    it('regression check — PR #76 had drempel <=0 (3 → 9). Nu fix.', () => {
        // Test die PR #76 in CI rood maakte:
        // expected 9 to be 0. Nu moet hij 0 zijn.
        expect(validateBtwPct(3)).toBe(0);
    });
});

describe('datumgebonden tarieven', () => {
    it('elke regel heeft een geldig_vanaf', () => {
        for (const r of BTW_TARIEVEN) {
            expect(r.geldig_vanaf).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        }
    });

    it('lookup op een datum binnen bereik werkt', () => {
        expect(getBtwRate('soft_drinks', '2026-03-01')).toBe(0.09);
        expect(getBtwRate('alcohol', '2026-03-01')).toBe(0.21);
    });

    it('weigert datums vóór de gedekte periode in plaats van te gokken', () => {
        expect(() => getBtwRate('food_catering', '2018-12-31')).toThrow();
        expect(() => getBtwRules('2000-01-01')).toThrow();
    });

    it('accepteert de eerste gedekte dag', () => {
        expect(() => getBtwRules(BTW_TABEL_VANAF)).not.toThrow();
    });

    it('geen dubbele categorie op één datum — anders wint een willekeurige', () => {
        const cats = getBtwRules('2026-06-01').map(r => r.category);
        expect(new Set(cats).size).toBe(cats.length);
    });
});

describe('drinkCategoryForAlcohol', () => {
    it('alcoholvrij bier (0,0%) is soft_drinks, dus 9%', () => {
        expect(drinkCategoryForAlcohol(0, 'bier')).toBe('soft_drinks');
        expect(getBtwPct(drinkCategoryForAlcohol(0, 'bier'))).toBe(9);
    });

    it('bier precies op de grens (0,5%) blijft 9%', () => {
        expect(drinkCategoryForAlcohol(ALCOHOL_GRENS.bier_vol_pct, 'bier')).toBe('soft_drinks');
    });

    it('pils (5%) is alcohol, dus 21%', () => {
        expect(drinkCategoryForAlcohol(5, 'bier')).toBe('alcohol');
        expect(getBtwPct(drinkCategoryForAlcohol(5, 'bier'))).toBe(21);
    });

    it('overige dranken hebben een andere grens (1,2%)', () => {
        expect(drinkCategoryForAlcohol(1.2)).toBe('soft_drinks');
        expect(drinkCategoryForAlcohol(1.3)).toBe('alcohol');
        /* 1,0% zou als bier wél 21% zijn, als overige drank niet. */
        expect(drinkCategoryForAlcohol(1.0, 'bier')).toBe('alcohol');
        expect(drinkCategoryForAlcohol(1.0, 'overig')).toBe('soft_drinks');
    });
});

describe('resolveBtwPct / isMissingBtwPct / requireBtwPct', () => {
    /* De kern van de falsy-nul-bug: 0 is een geldig tarief. Op 2026-07-29
       stond `x || 21` op 27 plekken, waaronder UBL/Moneybird/Exact/PDF. */
    it('0 blijft 0 en wordt NIET 21', () => {
        expect(resolveBtwPct(0)).toBe(0);
        expect(isMissingBtwPct(0)).toBe(false);
        expect(requireBtwPct(0, 'test')).toBe(0);
    });

    it('ontbrekende waarde krijgt de fallback', () => {
        expect(resolveBtwPct(undefined)).toBe(21);
        expect(resolveBtwPct(null)).toBe(21);
        expect(resolveBtwPct('')).toBe(21);
        expect(resolveBtwPct('abc')).toBe(21);
        expect(resolveBtwPct(NaN)).toBe(21);
    });

    it('eigen fallback wordt gerespecteerd', () => {
        expect(resolveBtwPct(undefined, 9)).toBe(9);
        expect(resolveBtwPct(0, 9)).toBe(0);
    });

    it('leest numerieke strings', () => {
        expect(resolveBtwPct('9')).toBe(9);
        expect(resolveBtwPct('0')).toBe(0);
    });

    it('isMissingBtwPct herkent alleen écht ontbrekende waardes', () => {
        expect(isMissingBtwPct(undefined)).toBe(true);
        expect(isMissingBtwPct(null)).toBe(true);
        expect(isMissingBtwPct('')).toBe(true);
        expect(isMissingBtwPct('nvt')).toBe(true);
        expect(isMissingBtwPct(9)).toBe(false);
        expect(isMissingBtwPct('21')).toBe(false);
    });

    it('requireBtwPct weigert te raden bij een ontbrekend tarief', () => {
        expect(() => requireBtwPct(undefined, 'factuurregel 1')).toThrow(/factuurregel 1/);
        expect(() => requireBtwPct(null, 'regel')).toThrow();
    });
});

describe('categoryFromLegacyPct', () => {
    it('0 → exempt', () => {
        expect(categoryFromLegacyPct(0)).toBe('exempt');
    });

    it('9 → food_catering', () => {
        expect(categoryFromLegacyPct(9)).toBe('food_catering');
        expect(categoryFromLegacyPct(9, 'food')).toBe('food_catering');
    });

    it('21 default → service_personnel', () => {
        expect(categoryFromLegacyPct(21)).toBe('service_personnel');
    });

    it('21 met hint=rental → equipment_rental', () => {
        expect(categoryFromLegacyPct(21, 'rental')).toBe('equipment_rental');
    });

    it('21 met hint=service → service_personnel', () => {
        expect(categoryFromLegacyPct(21, 'service')).toBe('service_personnel');
    });

    it('throwt bij onbekend percentage', () => {
        expect(() => categoryFromLegacyPct(13)).toThrow();
        expect(() => categoryFromLegacyPct(99)).toThrow();
    });
});
