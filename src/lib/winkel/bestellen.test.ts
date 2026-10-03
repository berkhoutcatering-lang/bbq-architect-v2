/**
 * Winkel bestellen — met het voorbeeld van Mathijs:
 * 30 blikjes, minimum 10, 21 verkocht → 9 over → op de bestellijst:
 * aanvullen tot 30 = 21 nodig → 1 krat (24). En: 8 nodig = 1 krat, want
 * je kunt geen 8 blikjes bestellen.
 */
import { describe, expect, it } from 'vitest';
import { bestelVoorstel, besteleenheidLabel, type BestelProduct } from './bestellen';

const bier = (over: Partial<BestelProduct> = {}): BestelProduct => ({
    id: 'p-bier', naam: 'Hertog Jan blik', eenheid: 'stuk', voorraad: 9, voorraad_bezet: 0,
    minimum: 10, par_niveau: 30, bestel_hoeveelheid: 24, bestel_eenheid_naam: 'krat', bestel_prijs_cents: 2160, ...over,
});

describe('het voorbeeld van Mathijs', () => {
    it('9 over, minimum 10, aanvullen tot 30 → 21 nodig → 1 krat (24)', () => {
        const r = bestelVoorstel(bier())!;
        expect(r).toMatchObject({ nodig: 21, besteld: 24, eenheden: 1, eenheid_label: '1 krat (24)' });
        expect(r.uitleg).toBe('9 st. vrij · minimum 10 st. · aanvullen tot 30 st. → 21 st. nodig → 1 krat (24)');
        expect(r.prijs_per_eenheid_eur).toBe(0.9);
    });
    it('8 nodig = 1 krat van 24, nooit 8', () => {
        const r = bestelVoorstel(bier({ voorraad: 10, par_niveau: 18 }))!;
        expect(r).toMatchObject({ nodig: 8, besteld: 24, eenheden: 1 });
    });
    it('25 nodig = 2 kratten (48)', () => {
        expect(bestelVoorstel(bier({ voorraad: 5, par_niveau: 30 }))).toMatchObject({ nodig: 25, besteld: 48, eenheid_label: '2 kratten (24)' });
    });
});

describe('wanneer niet', () => {
    it('boven het minimum: niets', () => {
        expect(bestelVoorstel(bier({ voorraad: 11 }))).toBeNull();
    });
    it('al een krat onderweg: niets dubbel', () => {
        expect(bestelVoorstel(bier(), 24)).toBeNull();
    });
    it('niet bijgehouden of geen minimum: geen gok', () => {
        expect(bestelVoorstel(bier({ voorraad: null }))).toBeNull();
        expect(bestelVoorstel(bier({ minimum: null }))).toBeNull();
    });
});

describe('webshop en zonder aanvullen tot', () => {
    it('besteld-niet-ingepakt telt mee: 20 staan, 12 besteld = 8 vrij → onder het minimum', () => {
        expect(bestelVoorstel(bier({ voorraad: 20, voorraad_bezet: 12 }))).toMatchObject({ beschikbaar: 8, nodig: 22, besteld: 24 });
    });
    it('zonder aanvullen tot: één besteleenheid erbij', () => {
        expect(bestelVoorstel(bier({ par_niveau: null }))).toMatchObject({ nodig: 2, besteld: 24, aanvullen_tot: null });
    });
    it('zonder besteleenheid: 1-op-1, en dat staat erbij', () => {
        const r = bestelVoorstel(bier({ bestel_hoeveelheid: null }))!;
        expect(r).toMatchObject({ besteld: 21, eenheden: null, zonder_besteleenheid: true });
        expect(r.uitleg).toContain('besteleenheid nog invullen');
    });
    it('kaas per wiel in gram: 600 g vrij, minimum 1 kg, aanvullen tot 3 kg → 1 wiel (4 kg)', () => {
        const kaas: BestelProduct = { id: 'k', naam: 'Hooikaas', eenheid: 'gram', voorraad: 600, minimum: 1000, par_niveau: 3000, bestel_hoeveelheid: 4000, bestel_eenheid_naam: 'wiel', bestel_prijs_cents: 5200 };
        expect(bestelVoorstel(kaas)).toMatchObject({ nodig: 2400, besteld: 4000, eenheid_label: '1 wiel (4 kg)' });
    });
});

describe('label', () => {
    it.each([
        [1, 24, 'krat', '1 krat (24)'],
        [2, 24, 'krat', '2 kratten (24)'],
        [2, 4000, 'wiel', '2 wielen (4 kg)'],
        [3, 6, 'doos', '3 dozen (6)'],
        [2, 12, null, '2× 12'],
    ] as const)('%s × %s %s → %s', (n, g, naam, uit) => {
        expect(besteleenheidLabel(n, g, naam, g === 4000 ? 'gram' : 'stuk')).toBe(uit);
    });
});
