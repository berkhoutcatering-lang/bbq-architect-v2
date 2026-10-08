import { describe, expect, it } from 'vitest';
import { hoeveelheidTekst, kerstFlessen, kerstProductie, kerstTotalen, type KerstOrder } from './kerstTellen';

const regel = (slug: string, aantal: number, dag: string, extra: Partial<KerstOrder['regels'][number]> = {}) => ({ id: Math.random(), slug, aantal, klaar_op: dag, eenheden: slug.startsWith('kerst-box') ? 1 : 0, opgehaald_at: null, ...extra });
const order = (x: Partial<KerstOrder>): KerstOrder => ({ id: 1, nummer: 'HB-1', status: 'betaald', contact_naam: 'A', opmerking: null, totaal_cents: 0, rest_cents: 0, rest_betaald_at: null, aantal_onzeker: false, regels: [], ...x });

describe('kerstTotalen', () => {
    const orders = [
        order({ totaal_cents: 14100, rest_cents: 14100, regels: [regel('kerst-box', 4, '2026-12-23'), regel('kerst-box-vegetarisch', 2, '2026-12-23'), regel('kerst-bierproeverij', 3, '2026-12-23')] }),
        order({ id: 2, totaal_cents: 7050, rest_cents: 7050, rest_betaald_at: 'x', aantal_onzeker: true, opmerking: 'Waarvan vegetarisch: 1', regels: [regel('kerst-box', 3, '2026-12-24', { opgehaald_at: 'y' })] }),
        order({ id: 3, status: 'geannuleerd', totaal_cents: 4700, regels: [regel('kerst-box', 2, '2026-12-24')] }),
    ];
    it('telt per dag en in totaal, zonder geannuleerde orders, met lege dagen erbij', () => {
        const t = kerstTotalen(orders, ['2026-12-23', '2026-12-24', '2026-12-25']);
        expect(t.dagen.map((d) => d.dag)).toEqual(['2026-12-23', '2026-12-24', '2026-12-25']);
        expect(t.dagen[0]).toMatchObject({ orders: 1, personen: 6, vega: 2, gewoon: 4, bier: 3, dozen: 2, openCenten: 14100 });
        expect(t.dagen[1]).toMatchObject({ orders: 1, personen: 3, vega: 1, gewoon: 2, onzeker: 3, openCenten: 0, opgehaald: 1 });
        expect(t.dagen[2]!.orders).toBe(0);
        expect(t.totaal).toMatchObject({ orders: 2, personen: 9, vega: 3, gewoon: 6, totaalCenten: 21150, openCenten: 14100 });
    });
});

describe('kerstProductie', () => {
    it('gewoon en vega apart vermenigvuldigd', () => {
        const rijen = kerstProductie(
            [{ id: 'o', naam: 'Bavette', soort: 'vlees', eenheid: 'gram', per_persoon: 100, per_persoon_vega: 0, volgorde: 1 },
             { id: 'v', naam: 'Paddenstoel', soort: 'vega', eenheid: 'gram', per_persoon: null, per_persoon_vega: 150, volgorde: 2 }],
            [{ dag: 'a', gewoon: 4, vega: 2 }, { dag: 'b', gewoon: 10, vega: 0 }],
        );
        expect(rijen[0]).toMatchObject({ perDag: { a: 400, b: 1000 }, totaal: 1400 });
        expect(rijen[1]).toMatchObject({ perDag: { a: 300, b: 0 }, totaal: 300 });
    });
    it('hoeveelheid leesbaar', () => {
        expect(hoeveelheidTekst(12400, 'gram')).toBe('12,4 kg');
        expect(hoeveelheidTekst(350, 'gram')).toBe('350 g');
        expect(hoeveelheidTekst(0, 'gram')).toBe('—');
        expect(hoeveelheidTekst(24, 'stuk')).toBe('24 st.');
        expect(hoeveelheidTekst(1500, 'ml')).toBe('1,5 l');
    });
});

describe('kerstFlessen', () => {
    it('per proeverij één van elk, per bubbel die fles; niets besteld = geen rij', () => {
        const t = kerstTotalen([
            order({ regels: [regel('kerst-box', 6, '2026-12-23'), regel('kerst-bierproeverij', 6, '2026-12-23'), regel('kerst-wijnproeverij', 2, '2026-12-23'), regel('kerst-cremant', 1, '2026-12-23')] }),
            order({ id: 2, regels: [regel('kerst-box', 4, '2026-12-24'), regel('kerst-wijnproeverij', 1, '2026-12-24')] }),
        ], ['2026-12-23', '2026-12-24']);
        expect(t.totaal).toMatchObject({ bier: 6, wijn: 3, cremant: 1, champagne: 0 });
        const f = kerstFlessen(t.dagen);
        expect(f.map((r) => r.naam)).toEqual([
            "'Louis' Crémant de Loire BIO",
            'Garage Ocata (blik 33 cl)', 'Boulevard Tank 7 (fles 33 cl)', 'Gouden Carolus Whisky Infused (fles 33 cl)',
            'Tre Venti Grillo', 'Locus Primitivo', 'Atlas Son of Titan Shiraz (Penley Estate)',
        ]);
        expect(f.find((r) => r.naam === 'Tre Venti Grillo')).toMatchObject({ perDag: { '2026-12-23': 2, '2026-12-24': 1 }, totaal: 3 });
    });
});
