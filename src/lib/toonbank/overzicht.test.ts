import { describe, expect, it } from 'vitest';
import { controleLabel, dagTotalen, euro, geldigeDatum, meldingSamenvatting, vandaagAmsterdam, verschilLabel, type BonRij } from './overzicht';

const bon = (o: Partial<BonRij>): BonRij => ({
    id: crypto.randomUUID(), soort: 'verkoop', status: 'afgerond', totaal_cents: 0, omzet_incl_cents: 0, btw: {}, statiegeld_cents: 0,
    order_rest_cents: 0, korting_cents: 0, afronding_cents: 0, pin_cents: 0, contant_cents: 0, ...o,
});

describe('dagTotalen', () => {
    it('telt de bon-btw op zonder opnieuw af te ronden: 2 × € 3,95 = 138, niet 137', () => {
        const t = dagTotalen([
            bon({ omzet_incl_cents: 395, btw: { 21: { incl_cents: 395, btw_cents: 69 } }, pin_cents: 395, totaal_cents: 395 }),
            bon({ omzet_incl_cents: 395, btw: { 21: { incl_cents: 395, btw_cents: 69 } }, contant_cents: 395, totaal_cents: 395 }),
        ]);
        expect(t.omzet).toEqual([{ pct: 21, incl_cents: 790, grondslag_cents: 652, btw_cents: 138 }]);
        expect(t.pin_cents).toBe(395);
        expect(t.contant_cents).toBe(395);
        expect(t.aantal_bonnen).toBe(2);
    });

    it('netto met tegenbonnen, zonder geannuleerde bonnen; statiegeld en order_rest zijn geen omzet', () => {
        const t = dagTotalen([
            bon({ omzet_incl_cents: 1495, btw: { 21: { incl_cents: 996, btw_cents: 173 }, 9: { incl_cents: 499, btw_cents: 41 } }, statiegeld_cents: 45, order_rest_cents: 450, pin_cents: 1990 }),
            bon({ soort: 'tegenbon', omzet_incl_cents: -499, btw: { 9: { incl_cents: -499, btw_cents: -41 } }, statiegeld_cents: -15, contant_cents: -514, totaal_cents: -514 }),
            bon({ status: 'geannuleerd', omzet_incl_cents: 1000, btw: { 21: { incl_cents: 1000, btw_cents: 174 } }, pin_cents: 1000 }),
        ]);
        expect(t.omzet).toEqual([
            { pct: 21, incl_cents: 996, grondslag_cents: 823, btw_cents: 173 },
            { pct: 9, incl_cents: 0, grondslag_cents: 0, btw_cents: 0 },
        ]);
        expect([t.aantal_bonnen, t.aantal_tegenbonnen, t.aantal_geannuleerd]).toEqual([1, 1, 1]);
        expect(t.omzet_incl_cents).toBe(996);
        /* Het totaal van de tegenbon, met statiegeld (zoals kern dagCijfers; review M2 K2), niet alleen de omzet. */
        expect(t.tegenbonnen_cents).toBe(-514);
        expect(t.statiegeld_cents).toBe(30);
        expect(t.order_rest_cents).toBe(450);
        expect(t.pin_cents).toBe(1990);
    });
});

describe('kleine hulpjes', () => {
    it('euro', () => {
        expect(euro(395)).toBe('€ 3,95');
        expect(euro(-595)).toBe('−€ 5,95');
        expect(euro(300000)).toBe('€ 3.000,00');
    });
    it('controleLabel kent de codes en valt terug op de code', () => {
        expect(controleLabel('rest_dubbel')).toBe('Rest dubbel betaald?');
        expect(controleLabel('WV001')).toBe('WV001');
        expect(controleLabel(null)).toBe('Te controleren');
    });
    it('verschilLabel', () => {
        expect(verschilLabel('omzet_21_btw')).toBe('Btw 21%');
        expect(verschilLabel('omzet_9_incl')).toBe('Omzet 9% (incl. btw)');
        expect(verschilLabel('aantal_bonnen')).toBe('Aantal bonnen');
        expect(verschilLabel('iets_nieuws')).toBe('iets_nieuws');
    });
    it('meldingSamenvatting', () => {
        expect(meldingSamenvatting('bon', { bonnummer: 'T1-000412', totaal_cents: 2460, regels: [{}, {}, {}] })).toBe('T1-000412 · € 24,60 · 3 regels');
        expect(meldingSamenvatting('vrij_overschreden', { boven_vrij: 1, verkocht: 3, modus: 'offline', reden: 'geen internet' }))
            .toBe('1 van 3 boven vrij verkocht (offline) · “geen internet”');
        expect(meldingSamenvatting('dag_openen', { bedrijfsdag: '2027-03-06', contant_begin_cents: 10000 })).toBe('Dag 2027-03-06 geopend met € 100,00 wisselgeld');
        expect(meldingSamenvatting('raar', null)).toBe('raar');
    });
    it('vandaag in Amsterdam en een geldige datum', () => {
        expect(vandaagAmsterdam(new Date('2027-03-06T23:30:00Z'))).toBe('2027-03-07');
        expect(geldigeDatum('2027-02-30', '2027-03-06')).toBe('2027-03-06');
        expect(geldigeDatum('2027-02-28', '2027-03-06')).toBe('2027-02-28');
        expect(geldigeDatum(null, 'x')).toBe('x');
    });
});
