import { describe, it, expect } from 'vitest';
import {
    computeAging,
    computeConcentration,
    computeCashflow,
    currentQuarterPeriod,
    computeBtwAangifte,
    computeBoekhoudChecks,
    computeResultatenrekening,
    computeBalans,
    quarterPeriod,
    bonBtwBedrag,
    bonWachtOpVoorbelasting,
    type KassaRegel,
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

    it('5b: voorbelasting uit BEVESTIGDE bonnen', () => {
        const r = computeBtwAangifte([], [
            { datum: '2026-04-10', btw_laag_bedrag: 9, btw_hoog_bedrag: 0, voorbelasting_bevestigd: true },
            { datum: '2026-05-20', btw_laag_bedrag: 0, btw_hoog_bedrag: 42, voorbelasting_bevestigd: true },
        ], period);
        expect(r.rubriek_5b).toBe(51);
        expect(r.voorbelasting_onbevestigd).toBe(0);
    });

    it('5b telt onbevestigde bonnen NIET mee, maar maakt ze wel zichtbaar', () => {
        const r = computeBtwAangifte([], [
            { datum: '2026-04-10', btw_laag_bedrag: 9, btw_hoog_bedrag: 0, voorbelasting_bevestigd: true },
            { datum: '2026-05-20', btw_laag_bedrag: 0, btw_hoog_bedrag: 42 },
        ], period);
        expect(r.rubriek_5b).toBe(9);
        expect(r.voorbelasting_onbevestigd).toBe(42);
        expect(r.voorbelasting_onbevestigd_count).toBe(1);
    });

    it('zakelijk_pct kort de aftrek naar rato in', () => {
        const r = computeBtwAangifte([], [
            { datum: '2026-04-10', btw_hoog_bedrag: 100, voorbelasting_bevestigd: true, zakelijk_pct: 60 },
        ], period);
        expect(r.rubriek_5b).toBe(60);
    });

    it('saldo = 5a - 5b', () => {
        const r = computeBtwAangifte(
            [{ status: 'verzonden', datum: '2026-04-15', items: [{ qty: 1, prijs: 1000, btw: 21 }] }],
            [{ datum: '2026-04-15', btw_hoog_bedrag: 21, voorbelasting_bevestigd: true }],
            period,
        );
        expect(r.saldo).toBe(189); // 210 - 21
    });

    /* ── Gaten-lijst: wat NIET automatisch te classificeren is ───────────── */

    it('0%-regel verdwijnt niet stil maar komt in de gaten-lijst', () => {
        const r = computeBtwAangifte([
            { status: 'verzonden', nummer: '2026-004', datum: '2026-04-15', items: [
                { qty: 1, prijs: 1000, btw: 21 },
                { qty: 1, prijs: 800, btw: 0 },
            ]},
        ], [], period);
        expect(r.rubriek_1a.omzet).toBe(1000);
        expect(r.gaten).toHaveLength(1);
        expect(r.gaten[0].referentie).toBe('2026-004');
        expect(r.gaten[0].bedrag).toBe(800);
        expect(r.gaten[0].pct).toBe(0);
        expect(r.gaten_bedrag).toBe(800);
    });

    it('regel zonder tarief komt in de gaten-lijst met pct null', () => {
        const r = computeBtwAangifte([
            { status: 'verzonden', nummer: '2026-005', datum: '2026-04-15', items: [
                { qty: 2, prijs: 250 },
            ]},
        ], [], period);
        expect(r.gaten).toHaveLength(1);
        expect(r.gaten[0].pct).toBeNull();
        expect(r.gaten[0].bedrag).toBe(500);
        expect(r.rubriek_1a.omzet).toBe(0);
        expect(r.rubriek_1b.omzet).toBe(0);
    });

    it('onbekend percentage (legacy 6%) komt in de gaten-lijst', () => {
        const r = computeBtwAangifte([
            { status: 'verzonden', nummer: '2026-006', datum: '2026-04-15', items: [
                { qty: 1, prijs: 100, btw: 6 },
            ]},
        ], [], period);
        expect(r.gaten).toHaveLength(1);
        expect(r.gaten[0].pct).toBe(6);
    });

    it('2a wordt niet automatisch gevuld — verlegging is niet af te leiden', () => {
        const r = computeBtwAangifte([
            { status: 'verzonden', datum: '2026-04-15', items: [{ qty: 1, prijs: 1000, btw: 0 }] },
        ], [], period);
        expect(r.rubriek_2a.omzet).toBe(0);
        expect(r.rubriek_2a.btw).toBe(0);
        expect(r.rubriek_5a).toBe(0);
    });

    it('gezonde aangifte heeft een lege gaten-lijst', () => {
        const r = computeBtwAangifte([
            { status: 'verzonden', datum: '2026-04-15', items: [
                { qty: 1, prijs: 1000, btw: 21 },
                { qty: 1, prijs: 500, btw: 9 },
            ]},
        ], [], period);
        expect(r.gaten).toHaveLength(0);
        expect(r.gaten_bedrag).toBe(0);
    });
});

describe('computeBtwAangifte — kassaverkoop', () => {
    const q3 = quarterPeriod(2026, 3, new Date('2026-10-26'));
    const kassa = (datum: string, btw_pct: number | null, omzet: number, btw: number): KassaRegel =>
        ({ datum, btw_pct, omzet, btw });

    it('kassaregels tellen mee in 1b (9%) en 1a (21%) op de verkoopdag', () => {
        const r = computeBtwAangifte([], [], q3, [
            kassa('2026-08-29', 9, 600, 54),
            kassa('2026-08-30', 21, 100, 21),
        ]);
        expect(r.rubriek_1b).toEqual({ omzet: 600, btw: 54 });
        expect(r.rubriek_1a).toEqual({ omzet: 100, btw: 21 });
        expect(r.rubriek_5a).toBe(75);
        expect(r.kassa).toEqual({ omzet_laag: 600, btw_laag: 54, omzet_hoog: 100, btw_hoog: 21, regels: 2 });
    });

    it('neemt de BTW van de kassa over in plaats van hem te herrekenen', () => {
        /* De kassa rondt per regel af: 176 × (5,96 excl + 0,54 btw) is meer dan 9% van het totaal. */
        const r = computeBtwAangifte([], [], q3, [kassa('2026-08-29', 9, 1049.5, 94.5)]);
        expect(r.rubriek_1b.btw).toBe(94.5);
    });

    it('kassaverkoop buiten het kwartaal telt niet mee', () => {
        const r = computeBtwAangifte([], [], q3, [
            kassa('2026-06-30', 9, 100, 9),
            kassa('2026-10-01', 9, 100, 9),
        ]);
        expect(r.rubriek_1b.omzet).toBe(0);
        expect(r.kassa.regels).toBe(0);
    });

    it('kassaregel zonder bruikbaar tarief komt in de gatenlijst, niet stil in 1a', () => {
        const r = computeBtwAangifte([], [], q3, [kassa('2026-08-29', null, 10, 0), kassa('2026-08-29', 0, 5, 0)]);
        expect(r.rubriek_1a.omzet).toBe(0);
        expect(r.gaten).toHaveLength(2);
        expect(r.gaten.every(g => g.bron === 'kassa')).toBe(true);
        expect(r.gaten_bedrag).toBe(15);
    });

    it('kassa en facturen tellen samen op in dezelfde rubriek', () => {
        const r = computeBtwAangifte(
            [{ status: 'verzonden', datum: '2026-09-12', items: [{ qty: 1, prijs: 2992.66, btw: 9 }] }],
            [], q3,
            [kassa('2026-08-29', 9, 1049.5, 94.5)],
        );
        expect(r.rubriek_1b.omzet).toBe(4042.16);
        expect(r.rubriek_1b.btw).toBe(363.84);
    });
});

describe('computeBtwAangifte — verlegde BTW (4a/4b)', () => {
    const q3 = quarterPeriod(2026, 3, new Date('2026-10-26'));

    it('buiten EU: 21% over het bedrag in 4a én (bevestigd) in 5b — saldo-neutraal', () => {
        const r = computeBtwAangifte([], [
            { datum: '2026-08-04', totaal_bedrag: 144, netto_bedrag: 144, btw_verlegd: 'buiten_eu', voorbelasting_bevestigd: true },
        ], q3);
        expect(r.rubriek_4a).toEqual({ omzet: 144, btw: 30.24 });
        expect(r.rubriek_4b).toEqual({ omzet: 0, btw: 0 });
        expect(r.rubriek_5a).toBe(30.24);
        expect(r.rubriek_5b).toBe(30.24);
        expect(r.rubriek_5b_detail.verlegd).toBe(30.24);
        expect(r.saldo).toBe(0);
    });

    it('binnen EU gaat naar 4b', () => {
        const r = computeBtwAangifte([], [
            { datum: '2026-08-04', totaal_bedrag: 100, btw_verlegd: 'binnen_eu', voorbelasting_bevestigd: true },
        ], q3);
        expect(r.rubriek_4b).toEqual({ omzet: 100, btw: 21 });
        expect(r.rubriek_4a.btw).toBe(0);
    });

    it('verlegd maar nog niet bevestigd: wel verschuldigd in 4a, niet afgetrokken in 5b', () => {
        const r = computeBtwAangifte([], [
            { datum: '2026-08-04', totaal_bedrag: 144, btw_verlegd: 'buiten_eu' },
        ], q3);
        expect(r.rubriek_4a.btw).toBe(30.24);
        expect(r.rubriek_5b).toBe(0);
        expect(r.voorbelasting_onbevestigd).toBe(30.24);
        expect(r.voorbelasting_onbevestigd_count).toBe(1);
        expect(r.saldo).toBe(30.24);
    });

    it('zakelijk_pct kort alleen de aftrek in, niet de verschuldigde BTW', () => {
        const r = computeBtwAangifte([], [
            { datum: '2026-08-04', totaal_bedrag: 100, btw_verlegd: 'buiten_eu', voorbelasting_bevestigd: true, zakelijk_pct: 50 },
        ], q3);
        expect(r.rubriek_4a.btw).toBe(21);
        expect(r.rubriek_5b).toBe(10.5);
    });

    it('gewone bon zonder BTW levert niets op en wacht ook niet', () => {
        const bon = { datum: '2026-08-04', totaal_bedrag: 144 };
        expect(bonBtwBedrag(bon)).toBe(0);
        expect(bonWachtOpVoorbelasting(bon)).toBe(false);
        expect(bonWachtOpVoorbelasting({ ...bon, btw_verlegd: 'buiten_eu' })).toBe(true);
    });

    it('5b-opbouw splitst 9%, 21% en verlegd', () => {
        const r = computeBtwAangifte([], [
            { datum: '2026-07-10', btw_laag_bedrag: 9, voorbelasting_bevestigd: true },
            { datum: '2026-07-11', btw_hoog_bedrag: 21, voorbelasting_bevestigd: true },
            { datum: '2026-07-12', totaal_bedrag: 100, btw_verlegd: 'buiten_eu', voorbelasting_bevestigd: true },
        ], q3);
        expect(r.rubriek_5b_detail).toEqual({ laag: 9, hoog: 21, verlegd: 21 });
        expect(r.rubriek_5b).toBe(51);
    });
});

describe('computeBtwAangifte — Q3 2026 zoals handmatig nagerekend', () => {
    /* Nagespeeld naar de live-controle van 2026-10-26. Uit die controle komen
       alleen de TOTALEN: facturen F2026-016 + -017 samen € 2.992,66 excl. op 9%,
       kassa zomerfair 29-30 aug € 1.049,50 + € 94,50, Wispr € 144 zonder BTW
       uit de VS, en dat F2026-011 en -018 niet meetellen. De verdeling per
       factuur, de statussen en de overige bonnen hieronder zijn verzonnen
       testdata om die regels te raken. */
    const q3 = quarterPeriod(2026, 3, new Date('2026-10-26'));
    const r = computeBtwAangifte(
        [
            { nummer: 'F2026-016', status: 'betaald', datum: '2026-07-20', items: [{ qty: 1, prijs: 1500, btw: 9 }] },
            { nummer: 'F2026-017', status: 'verzonden', datum: '2026-09-05', items: [{ qty: 1, prijs: 1492.66, btw: 9 }] },
            { nummer: 'F2026-011', status: 'geannuleerd', datum: '2026-08-01', items: [{ qty: 1, prijs: 999, btw: 9 }] },
            { nummer: 'F2026-018', status: 'concept', datum: '2026-09-28', items: [{ qty: 1, prijs: 999, btw: 9 }] },
        ],
        [
            { datum: '2026-08-04', totaal_bedrag: 144, netto_bedrag: 144, btw_verlegd: 'buiten_eu', voorbelasting_bevestigd: true },
            { datum: '2026-08-20', btw_hoog_bedrag: 10, voorbelasting_bevestigd: true },
            { datum: '2026-08-21', btw_hoog_bedrag: 99 /* nog niet bevestigd */ },
        ],
        q3,
        [
            { datum: '2026-08-29', btw_pct: 9, omzet: 600, btw: 54 },
            { datum: '2026-08-30', btw_pct: 9, omzet: 449.5, btw: 40.5 },
        ],
    );

    it('1b = € 4.042,16 omzet / € 363,84 btw', () => {
        expect(r.rubriek_1b).toEqual({ omzet: 4042.16, btw: 363.84 });
    });
    it('4a = € 144 / € 30,24', () => {
        expect(r.rubriek_4a).toEqual({ omzet: 144, btw: 30.24 });
    });
    it('5b = som van de bevestigde bonnen', () => {
        expect(r.rubriek_5b).toBe(40.24);
        expect(r.voorbelasting_onbevestigd).toBe(99);
    });
    it('saldo = 5a − 5b', () => {
        expect(r.rubriek_5a).toBe(394.08);
        expect(r.saldo).toBe(353.84);
    });
});

describe('computeBoekhoudChecks', () => {
    const period = currentQuarterPeriod(new Date('2026-05-27'));
    const find = (checks: ReturnType<typeof computeBoekhoudChecks>, id: string) =>
        checks.find(c => c.id === id)!;

    it('flag factuur met 0% BTW én een bedrag (verkeerd-tarief-risico)', () => {
        const checks = computeBoekhoudChecks(
            [{ nummer: 'F1', status: 'betaald', datum: '2026-04-13', items: [{ qty: 37, prijs: 42.25, btw: 0 }] }],
            [], period,
        );
        const c = find(checks, 'nul_btw');
        expect(c.severity).toBe('error');
        expect(c.count).toBe(1);
        expect(c.refs).toContain('F1');
    });

    it('0%-regel zonder bedrag telt NIET als fout', () => {
        const checks = computeBoekhoudChecks(
            [{ nummer: 'F1', status: 'concept', datum: '2026-04-13', items: [{ qty: 0, prijs: 0, btw: 0 }] }],
            [], period,
        );
        expect(find(checks, 'nul_btw').severity).toBe('ok');
    });

    it('flag dubbele factuurnummers (jaarbreed, ook buiten periode)', () => {
        const checks = computeBoekhoudChecks(
            [
                { nummer: 'F2026-004', status: 'concept', datum: '2026-03-05', items: [] },
                { nummer: 'F2026-004', status: 'concept', datum: '2026-03-05', items: [] },
            ],
            [], period,
        );
        const c = find(checks, 'dubbele_nummers');
        expect(c.severity).toBe('error');
        expect(c.refs).toEqual(['F2026-004']);
    });

    it('flag concept-facturen in de periode', () => {
        const checks = computeBoekhoudChecks(
            [{ nummer: 'F1', status: 'concept', datum: '2026-04-13', items: [{ qty: 1, prijs: 100, btw: 9 }] }],
            [], period,
        );
        expect(find(checks, 'concept_facturen').count).toBe(1);
    });

    it('flag niet-geclassificeerde bonnen', () => {
        const checks = computeBoekhoudChecks(
            [],
            [
                { datum: '2026-04-10', btw_laag_bedrag: 9, rgs_code: 'WKprIng', ai_classify_status: 'verified' },
                { datum: '2026-04-11', btw_hoog_bedrag: 5, ai_classify_status: 'twijfel' },
                { datum: '2026-04-12', btw_hoog_bedrag: 5, rgs_code: null },
            ],
            period,
        );
        const c = find(checks, 'bonnen_classificatie');
        expect(c.severity).toBe('warning');
        expect(c.count).toBe(2);
    });

    it('schone boekhouding → alles ok', () => {
        const checks = computeBoekhoudChecks(
            [{ nummer: 'F1', status: 'betaald', datum: '2026-04-13', items: [{ qty: 1, prijs: 100, btw: 9 }] }],
            [{ datum: '2026-04-10', btw_laag_bedrag: 9, rgs_code: 'WKprIng', ai_classify_status: 'verified' }],
            period,
        );
        expect(checks.every(c => c.severity === 'ok')).toBe(true);
    });
});

describe('computeResultatenrekening', () => {
    it('omzet excl BTW - kosten = resultaat, met marge', () => {
        const r = computeResultatenrekening(
            [
                { status: 'betaald', datum: '2026-04-13', items: [{ qty: 10, prijs: 100, btw: 9 }] }, // 1000 omzet
                { status: 'concept', datum: '2026-05-01', items: [{ qty: 5, prijs: 100, btw: 9 }] },  // telt NIET (concept)
            ],
            [
                { datum: '2026-04-02', netto_bedrag: 300, rgs_category_label: 'Inkoop vlees' },
                { datum: '2026-04-20', netto_bedrag: 100, rgs_category_label: 'Brandstof' },
            ],
            2026,
        );
        expect(r.omzet).toBe(1000);
        expect(r.kosten_totaal).toBe(400);
        expect(r.resultaat).toBe(600);
        expect(r.marge_pct).toBe(60);
        expect(r.kosten_per_categorie[0]).toEqual({ label: 'Inkoop vlees', bedrag: 300 });
    });

    it('netto uit totaal-btw als netto_bedrag ontbreekt', () => {
        const r = computeResultatenrekening(
            [],
            [{ datum: '2026-04-02', totaal_bedrag: 121, btw_hoog_bedrag: 21, categorie: 'Overig' }],
            2026,
        );
        expect(r.kosten_totaal).toBe(100);
    });

    it('filtert op jaar', () => {
        const r = computeResultatenrekening(
            [{ status: 'betaald', datum: '2025-12-31', items: [{ qty: 1, prijs: 500, btw: 9 }] }],
            [],
            2026,
        );
        expect(r.omzet).toBe(0);
    });
});

describe('computeBalans', () => {
    it('debiteuren = open verstuurde facturen incl BTW', () => {
        const b = computeBalans(
            [
                { status: 'verzonden', datum: '2026-04-13', items: [{ qty: 10, prijs: 100, btw: 9 }] }, // 1090 incl
                { status: 'betaald', datum: '2026-04-14', items: [{ qty: 10, prijs: 100, btw: 9 }] },   // betaald → geen debiteur
                { status: 'concept', datum: '2026-04-15', items: [{ qty: 10, prijs: 100, btw: 9 }] },   // concept → niet
            ],
            [],
            2026,
        );
        expect(b.debiteuren).toBe(1090);
        expect(b.debiteuren_count).toBe(1);
    });

    it('BTW-vordering als voorbelasting groter is dan verschuldigd', () => {
        const b = computeBalans(
            [{ status: 'betaald', datum: '2026-04-13', items: [{ qty: 1, prijs: 100, btw: 9 }] }], // verschuldigd 9
            [{ datum: '2026-04-02', btw_hoog_bedrag: 100, voorbelasting_bevestigd: true }],           // voorbelasting 100
            2026,
        );
        expect(b.btw_vordering).toBe(91);
        expect(b.btw_schuld).toBe(0);
    });

    it('netto = debiteuren + btw_vordering - schuld', () => {
        const b = computeBalans(
            [{ status: 'verzonden', datum: '2026-04-13', items: [{ qty: 1, prijs: 1000, btw: 21 }] }], // debiteur 1210, verschuldigd 210
            [],
            2026,
        );
        expect(b.debiteuren).toBe(1210);
        expect(b.btw_schuld).toBe(210);
        expect(b.netto).toBe(1000);
    });
});
