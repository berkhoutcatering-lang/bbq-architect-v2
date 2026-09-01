import { describe, it, expect } from 'vitest';
import {
    vergelijkBon, vergelijkBonregel, vergelijkbaar, zoekLijstregel,
    type BonRegel, type LijstRegel,
} from './bonPrijsvergelijking';

/**
 * Alle gevallen komen van de Beef Club-factuur van 29 mei 2026 en de
 * prijslijsten die daar op dat moment tegenover stonden. Verzonnen voorbeelden
 * bewijzen niets over de vraag of dit in deze keuken werkt.
 */
const LIJST: LijstRegel[] = [
    { product_naam: 'Spiering Uitgebeend', eenheid: 'KG', prijs: 7.15, prijs_per_kg: 7.15 },
    { product_naam: 'Brasvar Coppa', eenheid: 'KG', prijs: 21.95, prijs_per_kg: 21.95 },
    { product_naam: 'Pulled Beef', eenheid: '1kg', prijs: 27.2, prijs_per_kg: null },
    { product_naam: 'Beef Burger 100x80gr', eenheid: '100x80gr', prijs: 13.5, prijs_per_kg: null },
    { product_naam: 'Kippenbil Uitgebeend Zonder Vel', eenheid: 'KG', prijs: 7.2, prijs_per_kg: 7.2 },
];

describe('vergelijkBonregel — de echte factuurregels', () => {
    it('Spiering Uitgebeend: €7,15 op de lijst, €8,10 betaald → 13,3% duurder', () => {
        const v = vergelijkBonregel({ naam: 'Spiering Uitgebeend', unit: 'kg', prijs: 8.1, aantal: 39.48 }, LIJST);
        expect(v.stand).toBe('duurder');
        expect(v.verschilPct).toBeCloseTo(13.3, 1);
        expect(v.lijstPrijs).toBe(7.15);
        /* Nederlandse notatie, en geen alarmtaal: een opslag is geen fout. */
        expect(v.toelichting).toContain('13,3%');
        expect(v.toelichting).toContain('opslag van je leverancier');
    });

    it('Brasvar Coppa: factuur en lijst zeggen hetzelfde', () => {
        const v = vergelijkBonregel({ naam: 'Brasvar Coppa', unit: 'kg', prijs: 21.95, aantal: 1.53 }, LIJST);
        expect(v.stand).toBe('gelijk');
        expect(v.verschilPct).toBe(0);
    });

    it('een verschil van een halve cent op tien euro is ruis, geen afwijking', () => {
        const v = vergelijkBonregel({ naam: 'Brasvar Coppa', unit: 'kg', prijs: 22.0, aantal: 1 }, LIJST);
        expect(v.stand).toBe('gelijk');
    });

    it('meldt het eerlijk als een product niet in de lijst staat', () => {
        const v = vergelijkBonregel({ naam: 'Vittore Tartaar 6x1KG', unit: 'kg', prijs: 32.5 }, LIJST);
        expect(v.stand).toBe('geen-match');
        expect(v.verschilPct).toBeUndefined();
    });
});

describe('de pak-versus-eenheid-val', () => {
    /* Dit is waar deze module voor bestaat. De factuur zegt €115,20 voor één
       doos van 100 × 80 gram; de lijst zegt €13,50 per kilo. Delen geeft
       +753% en dat is geen prijsverhoging maar een rekenfout. */
    it('vergelijkt een doosprijs niet met een kiloprijs', () => {
        const v = vergelijkBonregel(
            { naam: 'Beef Burger 100x80gr', unit: 'stuks', prijs: 115.2, aantal: 1 },
            LIJST,
        );
        expect(v.stand).toBe('eenheden-verschillen');
        expect(v.verschilPct).toBeUndefined();
        expect(v.toelichting).toContain('vergelijken we ze niet');
    });

    it('vergelijkbaar() kent de drie families', () => {
        expect(vergelijkbaar('kg', 'KG')).toBe(true);
        expect(vergelijkbaar('g', 'kg')).toBe(true);
        expect(vergelijkbaar('liter', 'ml')).toBe(true);
        expect(vergelijkbaar('stuks', 'doos')).toBe(true);
        expect(vergelijkbaar('kg', 'stuks')).toBe(false);
        expect(vergelijkbaar('kg', 'liter')).toBe(false);
    });

    it('zonder eenheid geen oordeel', () => {
        expect(vergelijkbaar(null, 'kg')).toBe(false);
        expect(vergelijkbaar('kg', '')).toBe(false);
        expect(vergelijkbaar('bakje', 'kg')).toBe(false);
    });
});

describe('zoekLijstregel', () => {
    it('vindt een exacte naam ongeacht hoofdletters en leestekens', () => {
        expect(zoekLijstregel('spiering uitgebeend', LIJST)?.regel.prijs).toBe(7.15);
        expect(zoekLijstregel('SPIERING UITGEBEEND', LIJST)?.zekerheid).toBe(1);
    });

    it('geeft niets terug bij een product dat er niet op lijkt', () => {
        expect(zoekLijstregel('Aardbeienpuree', LIJST)).toBeNull();
    });

    it('geeft niets terug bij een lege naam', () => {
        expect(zoekLijstregel('', LIJST)).toBeNull();
    });
});

describe('vergelijkBon — de hele factuur van 29 mei', () => {
    const BON: BonRegel[] = [
        { naam: 'Spiering Uitgebeend', unit: 'kg', prijs: 8.1, aantal: 39.48 },
        { naam: 'Brasvar Coppa', unit: 'kg', prijs: 21.95, aantal: 1.53 },
        { naam: 'Beef Burger 100x80gr', unit: 'stuks', prijs: 115.2, aantal: 1 },
        { naam: 'Vittore Tartaar 6x1KG', unit: 'kg', prijs: 32.5, aantal: 6.22 },
    ];

    it('telt alleen wat echt vergeleken kon worden', () => {
        const r = vergelijkBon(BON, LIJST);
        expect(r.regels.length).toBe(4);
        /* Twee vergelijkbaar, één andere eenheid, één niet in de lijst. */
        expect(r.vergeleken).toBe(2);
        expect(r.afwijkend).toBe(1);
    });

    it('middelt de afwijking niet weg met regels die niets zeggen', () => {
        const r = vergelijkBon(BON, LIJST);
        /* (13,3 + 0) / 2 = 6,7 — niet gedeeld door vier. */
        expect(r.gemiddeldPct).toBeCloseTo(6.7, 1);
    });

    it('geeft null als er niets te vergelijken viel', () => {
        const r = vergelijkBon([{ naam: 'Onbekend ding', unit: 'kg', prijs: 5 }], LIJST);
        expect(r.vergeleken).toBe(0);
        expect(r.gemiddeldPct).toBeNull();
    });
});
