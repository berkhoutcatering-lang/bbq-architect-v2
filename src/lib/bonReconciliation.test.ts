import { describe, it, expect } from 'vitest';
import { reconcileBon, shouldEscalate } from './bonReconciliation';
import type { BonItemRow } from '@/types';

function mkItem(naam: string, aantal: number, prijs: number, btw_pct: 0 | 9 | 21 = 21, totaal?: number): BonItemRow {
    return {
        naam,
        aantal,
        unit: 'stuks',
        prijs,
        btw_pct,
        totaal: totaal ?? aantal * prijs,
    };
}

describe('reconcileBon', () => {
    it('exact match → ok', () => {
        const items = [mkItem('A', 1, 50), mkItem('B', 2, 25)];  // som 100
        const r = reconcileBon(items, 100);
        expect(r.status).toBe('ok');
        expect(r.sum_items_eur).toBe(100);
        expect(r.claimed_total_eur).toBe(100);
        expect(r.mismatch_eur).toBe(0);
    });

    it('within €0.10 tolerance → ok (afronding)', () => {
        const items = [mkItem('A', 1, 50.05)];
        const r = reconcileBon(items, 50);
        expect(r.status).toBe('ok');
    });

    it('€0.30 verschil → minor_drift (BTW-afronding)', () => {
        const items = [mkItem('A', 1, 100)];
        const r = reconcileBon(items, 100.30);
        expect(r.status).toBe('minor_drift');
        expect(r.mismatch_eur).toBe(0.30);
    });

    it('€5 verschil hoger → mismatch met "hoger"-uitleg', () => {
        const items = [mkItem('A', 1, 100), mkItem('B', 1, 10)];  // som 110
        const r = reconcileBon(items, 105);
        expect(r.status).toBe('mismatch');
        expect(r.explanation).toContain('hoger');
    });

    it('€5 verschil lager → mismatch met "lager"-uitleg (gemiste regel)', () => {
        const items = [mkItem('A', 1, 100)];  // som 100
        const r = reconcileBon(items, 105);
        expect(r.status).toBe('mismatch');
        expect(r.explanation).toContain('lager');
    });

    it('geen totaal_bedrag → no_total', () => {
        const items = [mkItem('A', 1, 50)];
        const r = reconcileBon(items, null);
        expect(r.status).toBe('no_total');
        expect(r.sum_items_eur).toBe(50);
    });

    it('telt negative items voor korting-detectie', () => {
        const items = [
            mkItem('A', 1, 100),
            mkItem('Korting', 1, -10, 21, -10),
        ];
        const r = reconcileBon(items, 90);
        expect(r.status).toBe('ok');
        expect(r.negative_items_count).toBe(1);
    });

    it('lege items + geen totaal → no_total met passende uitleg', () => {
        const r = reconcileBon([], null);
        expect(r.status).toBe('no_total');
        expect(r.explanation).toContain('controleer');
    });

    it('claimed_total = 0 → no_total (gedacht als ontbrekend)', () => {
        const items = [mkItem('A', 1, 50)];
        const r = reconcileBon(items, 0);
        expect(r.status).toBe('no_total');
    });
});

describe('shouldEscalate', () => {
    const okRecon = reconcileBon([mkItem('A', 1, 100)], 100);
    const mismatchRecon = reconcileBon([mkItem('A', 1, 100)], 110);

    it('escaleert bij lage confidence', () => {
        expect(shouldEscalate(0.5, 5, okRecon)).toBe(true);
    });

    it('niet escaleren bij hoge confidence + ok reconciliation', () => {
        expect(shouldEscalate(0.9, 5, okRecon)).toBe(false);
    });

    it('escaleert bij 0 items', () => {
        expect(shouldEscalate(0.9, 0, okRecon)).toBe(true);
    });

    it('escaleert bij mismatch zelfs met hoge confidence', () => {
        expect(shouldEscalate(0.95, 5, mismatchRecon)).toBe(true);
    });

    it('escaleert bij mismatch > €1 ook zonder explicit mismatch-status', () => {
        const minor = reconcileBon([mkItem('A', 1, 100)], 100.30);
        expect(minor.status).toBe('minor_drift');
        // €0.30 mismatch — geen escalatie nodig
        expect(shouldEscalate(0.9, 5, minor)).toBe(false);
    });
});
