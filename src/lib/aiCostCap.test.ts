import { describe, it, expect } from 'vitest';
import { getTierCaps, type Tier } from './aiCostCap';

describe('getTierCaps', () => {
    it('starter caps zijn soft €3 / hard €4.50', () => {
        const caps = getTierCaps('starter');
        expect(caps.soft_eur).toBe(3.00);
        expect(caps.hard_eur).toBe(4.50);
    });

    it('pro caps zijn soft €15 / hard €22.50', () => {
        const caps = getTierCaps('pro');
        expect(caps.soft_eur).toBe(15.00);
        expect(caps.hard_eur).toBe(22.50);
    });

    it('enterprise caps zijn soft €50 / hard €75', () => {
        const caps = getTierCaps('enterprise');
        expect(caps.soft_eur).toBe(50.00);
        expect(caps.hard_eur).toBe(75.00);
    });

    it('hard-cap is altijd 150% van soft-cap (1.5× regel)', () => {
        for (const tier of ['starter', 'pro', 'enterprise'] as Tier[]) {
            const caps = getTierCaps(tier);
            const ratio = caps.hard_eur / caps.soft_eur;
            expect(ratio).toBeCloseTo(1.5, 2);
        }
    });

    it('soft-cap stijgt monotoon per tier', () => {
        expect(getTierCaps('starter').soft_eur).toBeLessThan(getTierCaps('pro').soft_eur);
        expect(getTierCaps('pro').soft_eur).toBeLessThan(getTierCaps('enterprise').soft_eur);
    });

    it('hard-cap stijgt monotoon per tier', () => {
        expect(getTierCaps('starter').hard_eur).toBeLessThan(getTierCaps('pro').hard_eur);
        expect(getTierCaps('pro').hard_eur).toBeLessThan(getTierCaps('enterprise').hard_eur);
    });
});
