import { describe, it, expect } from 'vitest';
import {
    computeAging,
    computeConcentration,
    computeCashflow,
    currentQuarterPeriod,
    computeBtwAangifte,
} from './financeAnalytics';

const TODAY = new Date('2026-05-27T12:00:00Z');

describe('computeAging', () => {
    it('DSO uit betaalde facturen', () => {
        const r = computeAging([
            { id: 1, datum: '2026-03-01', betaaldatum: '2026-03-25', status: 'betaald', items: [{ qty: 1, prijs: 1000 }] },
            { id: 2, datum: '2026-04-01', betaaldatum: '2026-04-15', status: 'betaald', items: [{ qty: 1, prijs: 1000 }] },
        ], TODAY);
        // (24 + 14) / 2 = 19
        expect(r.dso_days).toBe(19);
    });

    it('aging buckets — 4 buckets, dagen sinds vervaldatum', () => {
        const r = computeAging([
            { id: 1, datum: '2026-05-01', vervaldatum: '2026-05-15', status: 'verzonden', items: [{ qty: 1, prijs: 100 }] }, // 12 dagen oud → 0-30
            { id: 2, datum: '2026-04-01', vervaldatum: '2026-04-15', status: 'verzonden', items: [{ qty: 1, prijs: 200 }] }, // 42 dagen → 30-60
            { id: 3, datum: '2026-03-01', vervaldatum: '2026-03-15', status: 'verzonden', items: [{ qty: 1, prijs: 300 }] }, // 73 dagen → 60-90
            { id: 4, datum: '2026-01-01', vervaldatum: '2026-01-15', status: 'verzonden', items: [{ qty: 1, prijs: 400 }] }, // 132 dagen → 90+
        ], TODAY);
        expect(r.buckets[0].count).toBe(1);
        expect(r.buckets[1].count).toBe(1);
        expect(r.buckets[2].count).toBe(1);
        expect(r.buckets[3].count).toBe(1);
    });

    it('skip betaald + geannuleerd + concept', () => {
        const r = computeAging([
            { id: 1, datum: '2026-04-01', status: 'betaald', items: [{ qty: 1, prijs: 100 }] },
            { id: 2, datum: '2026-04-01', status: 'concept', items: [{ qty: 1, prijs: 200 }] },
            { id: 3, datum: '2026-04-01', status: 'geannuleerd', items: [{ qty: 1, prijs: 300 }] },
        ], TODAY);
        expect(r.totaal_openstaand).toBe(0);
    });
});

describe('computeConcentration', () => {
    it('top-1 klant >30% triggert warning', () => {
        const r = computeConcentration([
            { status: 'betaald', client_naam: 'Heineken', items: [{ qty: 1, prijs: 50000 }] },
            { status: 'betaald', client_naam: 'KPMG', items: [{ qty: 1, prijs: 30000 }] },
            { status: 'betaald', client_naam: 'Rabo', items: [{ qty: 1, prijs: 20000 }] },
        ]);
        expect(r.top_client).toBe('Heineken');
        expect(r.top_client_pct).toBe(50);
        expect(r.warning).toBe(true);
    });

    it('top-1 klant <30% geen warning', () => {
        const r = computeConcentration([
            { status: 'betaald', client_naam: 'A', items: [{ qty: 1, prijs: 25000 }] },
            { status: 'betaald', client_naam: 'B', items: [{ qty: 1, prijs: 25000 }] },
            { status: 'betaald', client_naam: 'C', items: [{ qty: 1, prijs: 25000 }] },
            { status: 'betaald', client_naam: 'D', items: [{ qty: 1, prijs: 25000 }] },
        ]);
        expect(r.warning).toBe(false);
        expect(r.top_client_pct).toBe(25);
    });

    it('geen betaalde facturen: defaults', () => {
        const r = computeConcentration([{ status: 'concept', client_naam: 'X', items: [{ qty: 1, prijs: 100 }] }]);
        expect(r.top_client).toBeNull();
        expect(r.warning).toBe(false);
    });
});

describe('computeCashflow', () => {
    it('genereert 13 weken', () => {
        const r = computeCashflow([], [], [], [], { today: TODAY });
        expect(r.weeks).toHaveLength(13);
    });

    it('inkomend: openstaande factuur in week 0', () => {
        const r = computeCashflow(
            [],
            [{ status: 'verzonden', vervaldatum: '2026-05-28', datum: '2026-05-01', items: [{ qty: 1, prijs: 2000, btw: 21 }] }],
            [], [],
            { today: TODAY },
        );
        expect(r.weeks[0].inkomend).toBeGreaterThan(2000);
    });

    it('vaste maandkosten verspreid over weken', () => {
        const r = computeCashflow([], [], [], [], { today: TODAY, monthly_fixed_costs: 4330 });
        // €4.330 / 4.33 = €1.000 per week
        expect(r.weeks[0].uitgaand).toBe(1000);
    });

    it('cumulatief saldo vanaf start_balance', () => {
        const r = computeCashflow([], [], [], [], { today: TODAY, start_balance: 10000, monthly_fixed_costs: 4330 });
        // Week 0: 10000 + (0 - 1000) = 9000
        expect(r.weeks[0].cumulatief).toBe(9000);
    });

    it('risico-flag onder buffer', () => {
        const r = computeCashflow([], [], [], [], { today: TODAY, start_balance: 1000, buffer_grens: 2500 });
        expect(r.weeks[0].risico).toBe(true);
        expect(r.first_risk_week_index).toBe(0);
    });
});

describe('currentQuarterPeriod', () => {
    it('mei → Q2 aangeven (deadline 31 jul)', () => {
        const p = currentQuarterPeriod(new Date('2026-05-27'));
        expect(p.quarter).toBe(2);
        expect(p.deadline).toBe('2026-07-31');
    });

    it('januari → Q4 vorig jaar', () => {
        const p = currentQuarterPeriod(new Date('2026-01-15'));
        expect(p.quarter).toBe(4);
        expect(p.year).toBe(2025);
        expect(p.deadline).toBe('2026-01-31');
    });

    it('april → Q1 aangifte deadline 30 apr', () => {
        const p = currentQuarterPeriod(new Date('2026-04-15'));
        expect(p.quarter).toBe(1);
        expect(p.deadline).toBe('2026-04-30');
    });
});

describe('computeBtwAangifte', () => {
    const period = currentQuarterPeriod(new Date('2026-05-27'));

    it('1a (21%) + 1b (9%) splitten', () => {
        const r = computeBtwAangifte([
            { status: 'verzonden', datum: '2026-04-15', items: [
                { qty: 1, prijs: 1000, btw: 21 },
                { qty: 1, prijs: 500, btw: 9 },
            ]},
        ], [], period);
        expect(r.rubriek_1a.omzet).toBe(1000);
        expect(r.rubriek_1a.btw).toBe(210);
        expect(r.rubriek_1b.omzet).toBe(500);
        expect(r.rubriek_1b.btw).toBe(45);
        expect(r.rubriek_5a).toBe(255);
    });

    it('5b: voorbelasting uit bonnen', () => {
        const r = computeBtwAangifte([], [
            { datum: '2026-04-10', btw_laag_bedrag: 9, btw_hoog_bedrag: 0 },
            { datum: '2026-05-20', btw_laag_bedrag: 0, btw_hoog_bedrag: 42 },
        ], period);
        expect(r.rubriek_5b).toBe(51);
    });

    it('saldo = 5a - 5b', () => {
        const r = computeBtwAangifte(
            [{ status: 'verzonden', datum: '2026-04-15', items: [{ qty: 1, prijs: 1000, btw: 21 }] }],
            [{ datum: '2026-04-15', btw_hoog_bedrag: 21 }],
            period,
        );
        expect(r.saldo).toBe(189); // 210 - 21
    });
});
