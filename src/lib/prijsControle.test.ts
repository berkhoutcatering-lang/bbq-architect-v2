import { describe, it, expect } from 'vitest';
import { controleerLeveranciersprijs, perBasisEuro, ONDERGRENS_EURO_PER_BASIS } from './prijsControle';

/* Intl zet een vaste spatie tussen het euroteken en het bedrag; die is in een
   test niet te zien en levert anders een raadselachtige mislukking op. */
const plat = (t: string | undefined) => (t ?? '').replace(/\u00A0/g, ' ');

/**
 * De gevallen komen uit de echte catalogus van Hop & Bites, nagemeten op
 * 2026-09-01. Dat is met opzet: een drempel die op verzonnen voorbeelden werkt
 * zegt niets over de vraag of hij in deze keuken bruikbaar is.
 */
describe('controleerLeveranciersprijs — wijst aan wat niet kan', () => {
    it('vangt de kipdij: €5,99 voor een doos van 10 kilo', () => {
        const o = controleerLeveranciersprijs({
            name: 'MC KP Dij ZB/ZV 4X2.5 KG DV-W',
            price_cents: 599, unit: 'kg', package_size: 10, package_unit: 'kg',
        });
        expect(o.verdacht).toBe(true);
        expect(o.reden).toBe('onwaarschijnlijk-goedkoop');
        expect(o.perBasisEuro).toBeCloseTo(0.60, 2);
        /* De vraag die de keuken moet beantwoorden staat in de tekst. */
        expect(o.toelichting).toContain('per kilo');
        /* Bedragen in NL-notatie, via de geld-canon in format.ts. */
        expect(plat(o.toelichting)).toContain('€ 0,60');
        expect(plat(o.toelichting)).toContain('€ 5,99');
    });

    it('vangt het paneermeel: 8 cent voor 150 gram', () => {
        const o = controleerLeveranciersprijs({
            name: 'Paneermeel 150g', price_cents: 8, unit: 'g', package_size: 150, package_unit: 'g',
        });
        expect(o.verdacht).toBe(true);
        expect(o.reden).toBe('onwaarschijnlijk-goedkoop');
    });

    it('vangt het gewicht-in-het-prijsveld: tray 1,50 kg voor €1,50', () => {
        const o = controleerLeveranciersprijs({
            name: 'Zalmfilet D-trim ASC, tray 1,50 kg',
            price_cents: 150, unit: 'kg', package_size: 1500, package_unit: 'g',
        });
        expect(o.verdacht).toBe(true);
        expect(o.reden).toBe('prijs-is-pakgewicht');
        expect(o.toelichting).toContain('gewicht');
    });

    it('herkent dat patroon ook bij een doosje van 1,75 kg', () => {
        const o = controleerLeveranciersprijs({
            name: 'Achtermuis carpacciorol, doosje 1,75 kg',
            price_cents: 175, unit: 'kg', package_size: 1750, package_unit: 'g',
        });
        expect(o.reden).toBe('prijs-is-pakgewicht');
    });
});

describe('controleerLeveranciersprijs — laat met rust wat wél klopt', () => {
    /* Deze vier stonden in mijn eerste lezing ten onrechte als verdacht. Ze
       kloppen alle vier onder de canon, en de test houdt dat vast. */
    it.each([
        ['Aardappelsalade, emmer 5 kg', 1706, 5000, 3.41],
        ['Oerfriet 14 mm, doos 5 kg', 2051, 5000, 4.10],
        ['Witte pistolets, doos 6 kg', 1746, 6000, 2.91],
        ['Tomatensalsa, bak 1 kg', 750, 1000, 7.50],
    ])('%s blijft ongemoeid', (name, price_cents, package_size, verwachtPerKg) => {
        const o = controleerLeveranciersprijs({
            name: String(name), price_cents: Number(price_cents),
            unit: 'kg', package_size: Number(package_size), package_unit: 'g',
        });
        expect(o.verdacht).toBe(false);
        expect(o.perBasisEuro).toBeCloseTo(Number(verwachtPerKg), 2);
    });

    it('budget-appels op €0,90 per kilo blijven staan — dat is een echte prijs', () => {
        const o = controleerLeveranciersprijs({
            name: 'Appels budget middel, kist 15 kg',
            price_cents: 1350, unit: 'kg', package_size: 15000, package_unit: 'g',
        });
        expect(o.verdacht).toBe(false);
        expect(o.perBasisEuro).toBeCloseTo(0.90, 2);
        /* Precies de reden dat de grens op 75 cent ligt en niet op een euro. */
        expect(o.perBasisEuro!).toBeGreaterThan(ONDERGRENS_EURO_PER_BASIS);
    });
});

describe('controleerLeveranciersprijs — houdt zich stil waar hij niets weet', () => {
    it('zegt niets over een pak in stuks', () => {
        const o = controleerLeveranciersprijs({
            name: 'Brioche bun, doos 48 stuks', price_cents: 2317, unit: 'stuk',
            package_size: 48, package_unit: 'stuk',
        });
        expect(o.verdacht).toBe(false);
        expect(o.perBasisEuro).toBeNull();
    });

    it('zegt niets als er geen pakinhoud bekend is', () => {
        const o = controleerLeveranciersprijs({ price_cents: 895, unit: 'kg', package_size: null, package_unit: null });
        expect(o.verdacht).toBe(false);
        expect(o.perBasisEuro).toBeNull();
    });

    it('zegt niets bij een onzinnige prijs in plaats van te raden', () => {
        expect(controleerLeveranciersprijs({ price_cents: Number.NaN, package_size: 1000, package_unit: 'g' }).verdacht).toBe(false);
        expect(controleerLeveranciersprijs({ price_cents: -5, package_size: 1000, package_unit: 'g' }).verdacht).toBe(false);
    });
});

describe('perBasisEuro', () => {
    it('rekent liters net zo als kilos', () => {
        expect(perBasisEuro({ price_cents: 478, package_size: 960, package_unit: 'ml' })).toBeCloseTo(4.98, 2);
    });

    it('rekent een pak in kilo om naar gram', () => {
        expect(perBasisEuro({ price_cents: 599, package_size: 10, package_unit: 'kg' })).toBeCloseTo(0.60, 2);
    });
});
