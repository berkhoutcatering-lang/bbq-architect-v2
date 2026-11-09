import { describe, expect, it } from 'vitest';
import { bestellingTaken, dagenTot, seintjeVenster, type ZelfIngevoerdeRij } from './bestelling-taken';

const NU = new Date(2026, 11, 18, 9, 30); // 18 december, ochtend

function rij(p: Partial<ZelfIngevoerdeRij> & { klaar_op: string }): ZelfIngevoerdeRij {
    return {
        id: 6, nummer: 'HB-2026-0006', contact_naam: 'Nienke', bron: 'mail',
        wensen: { vegetarisch: 0, veganistisch: 0, glutenvrij: 0, allergenen: [], overig: ['geen olijven'] },
        winkel_order_regels: [
            { naam: 'Kerst-Box', aantal: 2, klaar_op: p.klaar_op },
            { naam: 'Kerstavonddiner', aantal: 2, klaar_op: p.klaar_op, prijs_volgt: true },
        ],
        ...p,
    };
}

describe('bestellingTaken', () => {
    it('een week van tevoren: met !, prijs volgt en de bron', () => {
        const [t] = bestellingTaken([rij({ klaar_op: '2026-12-23' })], NU);
        expect(t).toMatchObject({
            id: 'bestelling-6',
            urgentie: 'deze-week',
            titel: 'Over 5 dagen: Nienke — 2× Kerst-Box, 2× Kerstavonddiner',
            detail: '! geen olijven · prijs volgt (1) · Mail · HB-2026-0006',
            bron: 'winkel',
            onderwerp: 'bestelling:6',
        });
    });

    it('morgen is nu, over drie dagen is vandaag', () => {
        expect(bestellingTaken([rij({ klaar_op: '2026-12-19' })], NU)[0]!.urgentie).toBe('nu');
        expect(bestellingTaken([rij({ klaar_op: '2026-12-21' })], NU)[0]!.urgentie).toBe('vandaag');
        expect(bestellingTaken([rij({ klaar_op: '2026-12-19' })], NU)[0]!.titel).toMatch(/^Morgen:/);
    });

    it('verder dan een week, voorbij of van de website: geen taak', () => {
        expect(bestellingTaken([rij({ klaar_op: '2026-12-26' })], NU)).toEqual([]);
        expect(bestellingTaken([rij({ klaar_op: '2026-12-17' })], NU)).toEqual([]);
        expect(bestellingTaken([rij({ klaar_op: '2026-12-20', bron: null })], NU)).toEqual([]);
        expect(bestellingTaken([rij({ klaar_op: '2026-12-20', bron: 'website' })], NU)).toEqual([]);
    });

    it('de vroegste eerst', () => {
        const t = bestellingTaken([rij({ id: 1, klaar_op: '2026-12-24' }), rij({ id: 2, klaar_op: '2026-12-20' })], NU);
        expect(t.map((x) => x.id)).toEqual(['bestelling-2', 'bestelling-1']);
    });
});

describe('kalender', () => {
    it('telt hele dagen, ook over de jaargrens', () => {
        expect(dagenTot('2026-12-18', NU)).toBe(0);
        expect(dagenTot('2027-01-01', NU)).toBe(14);
        expect(seintjeVenster(NU)).toEqual({ van: '2026-12-18', tot: '2026-12-25' });
    });
});
