import { describe, expect, it } from 'vitest';
import { etikettenVoorRegel, inpaklijst, plankProductie, qrUrl, restTekst, type ProductieRegel } from './productie';

const plank = { id: 'a-plank', naam: 'Sinterklaas-borrelplank', slug: 'sinterklaas-borrelplank', schaal_verdeling: true, doos_klein_max: 3, doos_groot: 5 };
const bier35 = { id: 'a-bier-35', naam: 'Bierpakket € 35', slug: 'sint-bier-35', alcohol: true };
const wijn35 = { id: 'a-wijn-35', naam: 'Wijnpakket € 35', slug: 'sint-wijn-35', alcohol: true };

const order = (id: number, nummer: string, naam: string, extra: Partial<ProductieRegel['order']> = {}): ProductieRegel['order'] =>
    ({ id, nummer, contact_naam: naam, betaalwijze: 'volledig', nu_te_betalen_cents: 0, rest_cents: 0, rest_betaald_at: null, ...extra });

/** Plank-componenten zoals de kassa ze vastlegt: gram p.p. × personen. */
const plankRegel = (id: number, o: ProductieRegel['order'], personen: number): ProductieRegel => ({
    regel: { id, artikel_id: 'a-plank', slug: 'sinterklaas-borrelplank', naam: 'Sinterklaas-borrelplank', aantal: personen, alcohol: false },
    order: o,
    componenten: [
        { product_id: 'p1', slot_type: 'vleeswaar', naam: 'Pastrami', hoeveelheid: 20 * personen, eenheid: 'gram' },
        { product_id: 'p2', slot_type: 'vleeswaar', naam: 'Eigen grillworst', hoeveelheid: 40 * personen, eenheid: 'gram' },
        { product_id: 'p3', slot_type: 'amandelen', naam: 'BBQ-amandelen', hoeveelheid: 15 * personen, eenheid: 'gram' },
    ],
});
const pakketRegel = (id: number, o: ProductieRegel['order'], artikel: typeof bier35, aantal: number, bier = 'Lokaal bier'): ProductieRegel => ({
    regel: { id, artikel_id: artikel.id, slug: artikel.slug, naam: artikel.naam, aantal, alcohol: true },
    order: o,
    componenten: [
        { product_id: 'b', slot_type: 'bier', naam: bier, hoeveelheid: 5 * aantal, eenheid: 'stuk' },
        { product_id: 'w', slot_type: 'worst', naam: 'Droge worst', hoeveelheid: 1 * aantal, eenheid: 'stuk' },
        { product_id: 'a', slot_type: 'amandelen', naam: 'BBQ-amandelen', hoeveelheid: 150 * aantal, eenheid: 'gram' },
    ],
});

describe('plankProductie (S7)', () => {
    it('telt grammen per onderdeel, schalen en bakjes voor het hele moment', () => {
        const p = plankProductie(plank, [
            plankRegel(1, order(1, 'HB-2026-0002', 'Piet'), 11),
            plankRegel(2, order(2, 'HB-2026-0001', 'Jan'), 4),
        ]);
        expect(p.personen).toBe(15);
        expect(p.orders).toBe(2);
        /* 11 → 5 + 4 + 2; 4 → groot(4): drie grote, één kleine. */
        expect(p.schalen).toEqual({ klein: 1, groot: 3, totaal: 4 });
        expect(p.bakjes).toBe(24);
        expect(p.onderdelen.map((o) => `${o.naam} ${o.totaal} ${o.eenheid} (${o.perPersoon} p.p.)`)).toEqual([
            'Pastrami 300 gram (20 p.p.)', 'Eigen grillworst 600 gram (40 p.p.)', 'BBQ-amandelen 225 gram (15 p.p.)',
        ]);
    });
    it('snij-/opmaaklijst per order: 11 personen = groot (5), groot (4), klein (2) met de grammen per schaal', () => {
        const p = plankProductie(plank, [plankRegel(1, order(1, 'HB-2026-0002', 'Piet'), 11), plankRegel(2, order(2, 'HB-2026-0001', 'Jan'), 4)]);
        expect(p.perOrder.map((o) => o.order.nummer)).toEqual(['HB-2026-0001', 'HB-2026-0002']);
        const piet = p.perOrder[1]!;
        expect(piet.schalen.map((s) => `${s.schaal.maat} (${s.schaal.personen})`)).toEqual(['groot (5)', 'groot (4)', 'klein (2)']);
        expect(piet.schalen[2]!.onderdelen).toEqual([
            { naam: 'Pastrami', hoeveelheid: 40, eenheid: 'gram' },
            { naam: 'Eigen grillworst', hoeveelheid: 80, eenheid: 'gram' },
            { naam: 'BBQ-amandelen', hoeveelheid: 30, eenheid: 'gram' },
        ]);
    });
    it('zonder planken: lege lijst, geen deling door nul', () => {
        expect(plankProductie(plank, [pakketRegel(1, order(1, 'HB-2026-0001', 'Jan'), bier35, 1)])).toMatchObject({ personen: 0, orders: 0, bakjes: 0, onderdelen: [] });
    });
});

describe('inpaklijst (S7)', () => {
    it('groepeert per pakkettype, grootste serie eerst, met de inhoud per stuk', () => {
        const l = inpaklijst([plank, bier35, wijn35], [
            pakketRegel(1, order(1, 'HB-2026-0003', 'Kees'), wijn35, 1),
            pakketRegel(2, order(2, 'HB-2026-0001', 'Jan'), bier35, 3),
            pakketRegel(3, order(3, 'HB-2026-0002', 'Piet'), bier35, 2),
            plankRegel(4, order(4, 'HB-2026-0004', 'Ans'), 4),
        ]);
        expect(l.map((a) => `${a.artikel.naam}: ${a.stuks}`)).toEqual(['Bierpakket € 35: 5', 'Wijnpakket € 35: 1']);
        expect(l[0]!.orders.map((o) => `${o.order.nummer} ×${o.aantal}`)).toEqual(['HB-2026-0001 ×3', 'HB-2026-0002 ×2']);
        expect(l[0]!.inhoudPerStuk).toEqual([
            { product_id: 'b', slot_type: 'bier', naam: 'Lokaal bier', hoeveelheid: 5, eenheid: 'stuk' },
            { product_id: 'w', slot_type: 'worst', naam: 'Droge worst', hoeveelheid: 1, eenheid: 'stuk' },
            { product_id: 'a', slot_type: 'amandelen', naam: 'BBQ-amandelen', hoeveelheid: 150, eenheid: 'gram' },
        ]);
    });
    it('wijkt de inhoud per order af (later: wissels), dan is er geen gedeelde inhoud', () => {
        const l = inpaklijst([bier35], [pakketRegel(1, order(1, 'HB-2026-0001', 'Jan'), bier35, 1), pakketRegel(2, order(2, 'HB-2026-0002', 'Piet'), bier35, 1, 'Mr. Hop')]);
        expect(l[0]!.inhoudPerStuk).toBeNull();
        expect(l[0]!.orders[1]!.inhoudPerStuk[0]!.naam).toBe('Mr. Hop');
    });
});

describe('etiket (S7)', () => {
    it('QR = basis + /sint?artikel=&order=; zonder basis geen QR', () => {
        expect(qrUrl('https://experience.hopbites.nl/', 'sint-bier-35', 'HB-2026-0042')).toBe('https://experience.hopbites.nl/sint?artikel=sint-bier-35&order=HB-2026-0042');
        expect(qrUrl(null, 'x', 'y')).toBeNull();
        expect(qrUrl('  ', 'x', 'y')).toBeNull();
    });
    it('rest-tekst alleen bij een openstaande reservering', () => {
        expect(restTekst(order(1, 'n', 'x', { betaalwijze: 'reservering', nu_te_betalen_cents: 250, rest_cents: 3250 }))).toBe('reeds betaald € 2,50 · rest € 32,50');
        expect(restTekst(order(1, 'n', 'x', { betaalwijze: 'reservering', nu_te_betalen_cents: 250, rest_cents: 3250, rest_betaald_at: '2026-12-04T16:00:00Z' }))).toBe('rest betaald');
        expect(restTekst(order(1, 'n', 'x'))).toBeNull();
    });
    it('één etiket per pakket, één per schaal, met volgnummer en 18+', () => {
        const o = order(1, 'HB-2026-0042', 'Jan Jansen', { betaalwijze: 'reservering', nu_te_betalen_cents: 250, rest_cents: 3250 });
        const pak = etikettenVoorRegel(pakketRegel(1, o, bier35, 2), bier35, 'vr 4 dec · 16:00–18:00', 'https://exp.test');
        expect(pak).toHaveLength(2);
        expect(pak[1]).toEqual({
            klantnaam: 'Jan Jansen', ordernummer: 'HB-2026-0042', moment: 'vr 4 dec · 16:00–18:00', artikel: 'Bierpakket € 35', volgnr: '2/2',
            qrUrl: 'https://exp.test/sint?artikel=sint-bier-35&order=HB-2026-0042', alcohol: true, rest: 'reeds betaald € 2,50 · rest € 32,50',
        });
        const pl = etikettenVoorRegel(plankRegel(2, o, 7), plank, null, null);
        expect(pl.map((e) => `${e.artikel} ${e.volgnr}`)).toEqual(['Sinterklaas-borrelplank · grote schaal · 5 pers. 1/2', 'Sinterklaas-borrelplank · kleine schaal · 2 pers. 2/2']);
        expect(pl[0]!.qrUrl).toBeNull();
        expect(pl[0]!.alcohol).toBe(false);
    });
});
