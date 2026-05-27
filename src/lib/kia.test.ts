import { describe, it, expect } from 'vitest';
import { computeKia, buildKiaScenarios, KIA_2026 } from './kia';

describe('KIA 2026 brackets', () => {
    it('onder drempel (€0): geen aftrek', () => {
        const r = computeKia(0);
        expect(r.aftrek).toBe(0);
        expect(r.bracket).toBe('onder_drempel');
    });

    it('onder drempel (€2.900): geen aftrek — net onder grens', () => {
        const r = computeKia(2900);
        expect(r.aftrek).toBe(0);
        expect(r.bracket).toBe('onder_drempel');
    });

    it('bracket 1 (€2.901 net boven drempel): 28% van bedrag', () => {
        const r = computeKia(2901);
        expect(r.bracket).toBe('percentueel');
        expect(r.aftrek).toBe(Math.round(2901 * 0.28));
    });

    it('bracket 1 (€31.500 Hop & Bites voorbeeld): 28%', () => {
        const r = computeKia(31500);
        expect(r.bracket).toBe('percentueel');
        expect(r.aftrek).toBe(Math.round(31500 * 0.28));
        expect(r.aftrek).toBe(8820);
    });

    it('bracket 1 (€71.683 op de grens): nog 28%', () => {
        const r = computeKia(71683);
        expect(r.bracket).toBe('percentueel');
        expect(r.aftrek).toBe(Math.round(71683 * 0.28));
    });

    it('bracket 2 (€71.684): vast maximum €20.072', () => {
        const r = computeKia(71684);
        expect(r.bracket).toBe('vast_maximum');
        expect(r.aftrek).toBe(20072);
    });

    it('bracket 2 (€100.000 midden): nog steeds vast €20.072', () => {
        const r = computeKia(100000);
        expect(r.bracket).toBe('vast_maximum');
        expect(r.aftrek).toBe(20072);
    });

    it('bracket 2 (€132.746 op de grens): nog €20.072', () => {
        const r = computeKia(132746);
        expect(r.bracket).toBe('vast_maximum');
        expect(r.aftrek).toBe(20072);
    });

    it('bracket 3 (€132.747): begint af te lopen', () => {
        const r = computeKia(132747);
        expect(r.bracket).toBe('aflopend');
        // €20.072 - (€132.747 - €132.746) × 7.56% = €20.072 - €0.0756 ≈ €20.072
        expect(r.aftrek).toBeLessThanOrEqual(20072);
        expect(r.aftrek).toBeGreaterThan(20070);
    });

    it('bracket 3 (€200.000): aflopend ~€14.978', () => {
        const r = computeKia(200000);
        expect(r.bracket).toBe('aflopend');
        // €20.072 - (€200.000 - €132.746) × 7.56% = €20.072 - €5.084,40 ≈ €14.988
        expect(r.aftrek).toBeGreaterThan(14000);
        expect(r.aftrek).toBeLessThan(16000);
    });

    it('boven drempel (€398.237): geen aftrek meer', () => {
        const r = computeKia(398237);
        expect(r.bracket).toBe('boven_drempel');
        expect(r.aftrek).toBe(0);
    });

    it('boven drempel (€500.000): geen aftrek meer', () => {
        const r = computeKia(500000);
        expect(r.bracket).toBe('boven_drempel');
        expect(r.aftrek).toBe(0);
    });

    it('negatief bedrag: 0 + waarschuwing in message', () => {
        const r = computeKia(-100);
        expect(r.aftrek).toBe(0);
        expect(r.message).toContain('ongeldig');
    });

    it('NaN bedrag: 0 + waarschuwing', () => {
        const r = computeKia(Number.NaN);
        expect(r.aftrek).toBe(0);
    });

    it('belasting-besparing default 37%', () => {
        const r = computeKia(31500);
        // €8.820 × 0.37 = €3.263,40 → 3263
        expect(r.indicative_tax_saving).toBe(Math.round(8820 * 0.37));
    });

    it('belasting-besparing custom IB-tarief', () => {
        const r = computeKia(31500, 0.495);
        expect(r.indicative_tax_saving).toBe(Math.round(8820 * 0.495));
    });
});

describe('KIA_2026 constanten — Belastingdienst 2026', () => {
    it('drempels matchen officiële tabel', () => {
        expect(KIA_2026.threshold_min).toBe(2901);
        expect(KIA_2026.bracket1_max).toBe(71683);
        expect(KIA_2026.bracket2_fixed).toBe(20072);
        expect(KIA_2026.bracket2_max).toBe(132746);
        expect(KIA_2026.threshold_max).toBe(398236);
    });

    it('bracket1 percentage = 28%', () => {
        expect(KIA_2026.bracket1_pct).toBe(0.28);
    });

    it('bracket3 reductie = 7.56%', () => {
        expect(KIA_2026.bracket3_reduction_rate).toBe(0.0756);
    });
});

describe('buildKiaScenarios', () => {
    it('returnt exact 3 scenarios', () => {
        const s = buildKiaScenarios(31500);
        expect(s).toHaveLength(3);
    });

    it('scenario 1: "Niets doen" = huidige investering', () => {
        const s = buildKiaScenarios(31500);
        expect(s[0].label).toBe('Niets doen');
        expect(s[0].investment_amount).toBe(31500);
        expect(s[0].extra_investment).toBe(0);
        expect(s[0].extra_tax_saving).toBe(0);
    });

    it('scenario 2: "Tot optimaal" = €71.684 (vast maximum)', () => {
        const s = buildKiaScenarios(31500);
        expect(s[1].investment_amount).toBe(71684);
        expect(s[1].result.aftrek).toBe(20072);
        expect(s[1].extra_investment).toBe(71684 - 31500);
        expect(s[1].extra_tax_saving).toBeGreaterThan(0);
    });

    it('scenario 3: "Tot topgrens" = €132.746', () => {
        const s = buildKiaScenarios(31500);
        expect(s[2].investment_amount).toBe(132746);
        expect(s[2].result.aftrek).toBe(20072);
        expect(s[2].extra_investment).toBe(132746 - 31500);
    });

    it('al boven scenario-target: extra_investment blijft 0', () => {
        const s = buildKiaScenarios(150000);
        expect(s[1].extra_investment).toBe(0);
        expect(s[2].extra_investment).toBe(0);
    });
});
