/**
 * W2b — het voorstel in het controlescherm. "Klaar wanneer" uit de opdracht:
 * een Bidfood-factuur met "2 × krat bier (24)" wordt als 48 flesjes in de
 * winkel voorgesteld (en pas na bevestigen geboekt — dat bewaakt de database).
 */
import { describe, expect, it } from 'vitest';
import { klaarOmTeBoeken, koppelSleutel, naamGelijkenis, omrekeningVoor, stelVoor, stuksPerVerpakking, type KeukenKandidaat, type WinkelKandidaat } from './invoer';

const winkel: WinkelKandidaat[] = [
    { id: 'w-bier', naam: 'Hertog Jan pils 30 cl', eenheid: 'stuk', ean: '8712000000017' },
    { id: 'w-amandel', naam: 'BBQ-amandelen', eenheid: 'gram', ean: null },
];
const keuken: KeukenKandidaat[] = [{ id: 7, naam: 'Pekelzout', unit: 'kg' }];

describe('stuks per verpakking uit de tekst', () => {
    it.each([
        ['Krat bier (24)', 24],
        ['Hertog Jan 24 x 30 cl', 24],
        ['Cola 6-pack', 6],
        ['Tray à 12 blikken', 12],
        ['Doos 12 st', 12],
        ['Pekelzout 1 kg', null],
    ])('%s → %s', (tekst, n) => {
        expect(stuksPerVerpakking(tekst)).toBe(n);
    });
});

describe('omrekening', () => {
    it('winkel per stuk: krat = 24; winkel in gram: kg = 1000', () => {
        expect(omrekeningVoor({ naam: 'Krat bier (24)', eenheid: 'krat' }, { plek: 'winkel', eenheid: 'stuk' })).toBe(24);
        expect(omrekeningVoor({ naam: 'Amandelen', eenheid: 'kg' }, { plek: 'winkel', eenheid: 'gram' })).toBe(1000);
        expect(omrekeningVoor({ naam: 'Amandelen', eenheid: 'zak' }, { plek: 'winkel', eenheid: 'gram' })).toBeNull();
    });
    it('keuken: zelfde eenheid 1, g naar kg 0,001, onbekend null', () => {
        expect(omrekeningVoor({ naam: 'x', eenheid: 'kg' }, { plek: 'makerij', unit: 'kg' })).toBe(1);
        expect(omrekeningVoor({ naam: 'x', eenheid: 'g' }, { plek: 'makerij', unit: 'kg' })).toBe(0.001);
        expect(omrekeningVoor({ naam: 'x', eenheid: 'doos' }, { plek: 'makerij', unit: 'kg' })).toBeNull();
    });
});

describe('voorstel per regel', () => {
    const basis = { leverancierId: 3, koppelingen: [], winkel, keuken };

    it('"2 × krat bier (24)" dat eerder bevestigd is: 48 flesjes in de winkel', () => {
        const regel = { naam: 'Krat bier (24)', aantal: 2, eenheid: 'krat', prijs_cents: 2160, btw_pct: 21 };
        const k = [{ sleutel: koppelSleutel(regel, 3), plek: 'winkel' as const, winkel_product_id: 'w-bier', inventory_id: null, omrekening: 24 }];
        expect(stelVoor(regel, { ...basis, koppelingen: k })).toEqual({ plek: 'winkel', winkel_product_id: 'w-bier', inventory_id: null, omrekening: 24, aantal: 48, voorstel: 'onthouden' });
    });
    it('eerste keer, op naam: Hertog Jan 24 x 30 cl → winkelproduct, 24 per krat', () => {
        const v = stelVoor({ naam: 'Hertog Jan pils krat 24 x 30 cl', aantal: 2, eenheid: 'krat', prijs_cents: null, btw_pct: 21 }, basis);
        expect(v).toMatchObject({ plek: 'winkel', winkel_product_id: 'w-bier', omrekening: 24, aantal: 48, voorstel: 'naam' });
    });
    it('op EAN', () => {
        expect(stelVoor({ naam: 'onleesbaar', aantal: 1, eenheid: null, prijs_cents: null, btw_pct: null, ean: '8712000000017' }, basis))
            .toMatchObject({ plek: 'winkel', winkel_product_id: 'w-bier', voorstel: 'ean' });
    });
    it('keukenproduct: pekelzout 5 kg', () => {
        expect(stelVoor({ naam: 'Pekelzout', aantal: 5, eenheid: 'kg', prijs_cents: 180, btw_pct: 9 }, basis))
            .toMatchObject({ plek: 'makerij', inventory_id: 7, omrekening: 1, aantal: 5, voorstel: 'naam' });
    });
    it('niets te vinden: geen product en geen getal verzonnen', () => {
        expect(stelVoor({ naam: 'Truffelolie', aantal: 1, eenheid: 'fles', prijs_cents: null, btw_pct: null }, basis))
            .toEqual({ plek: null, winkel_product_id: null, inventory_id: null, omrekening: null, aantal: null, voorstel: 'geen' });
    });
});

describe('klaar om te boeken', () => {
    it('elke regel die niet overgeslagen is heeft plek, product en aantal', () => {
        const goed = { overslaan: false, plek: 'winkel' as const, winkel_product_id: 'w', inventory_id: null, aantal: 48 };
        expect(klaarOmTeBoeken([goed])).toEqual({ ok: true, open: 0 });
        expect(klaarOmTeBoeken([goed, { ...goed, winkel_product_id: null }])).toEqual({ ok: false, open: 1 });
        expect(klaarOmTeBoeken([{ ...goed, aantal: null, overslaan: true }, goed])).toEqual({ ok: true, open: 0 });
        expect(klaarOmTeBoeken([{ ...goed, overslaan: true }])).toEqual({ ok: false, open: 0 });
    });
    it('naamgelijkenis is woorden, geen gok', () => {
        expect(naamGelijkenis('BBQ-amandelen', 'bbq amandelen')).toBe(1);
        expect(naamGelijkenis('Pekelzout', 'Truffelolie')).toBe(0);
    });
});
