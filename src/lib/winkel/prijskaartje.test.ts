import { describe, expect, it } from 'vitest';
import {
    aantalVellen, inhoudTekst, kaartjesVoorPrint, kaartjeVoorProduct, kaartPrijsCents, kanPrinten, prijsDelen,
    soortVanProduct, winkelPrijsCents, type Kaartje, type KaartjeProduct,
} from './prijskaartje';

const fles: KaartjeProduct = { id: 'a', naam: 'Rochefort 8', type: 'bier', eenheid: 'stuk', prijs_per: 1, winkelprijs_incl_cents: 395, alcohol: true };
const amandelen: KaartjeProduct = { id: 'b', naam: 'BBQ-amandelen (los)', type: 'amandelen', eenheid: 'gram', prijs_per: 100, winkelprijs_incl_cents: 295, alcohol: false };

describe('prijskaartje', () => {
    it('de soort volgt het product; bier zonder alcohol is Alcoholvrij', () => {
        expect(soortVanProduct(fles)).toBe('Speciaalbier');
        expect(soortVanProduct({ type: 'bier', alcohol: false })).toBe('Alcoholvrij');
        expect(soortVanProduct(amandelen)).toBe('Noten');
        expect(soortVanProduct({ type: 'overig', alcohol: false })).toBe('');
    });

    it('de prijs op het kaartje is per stuk, of per 100 gram — en terug', () => {
        expect(kaartPrijsCents(fles)).toBe(395);
        expect(kaartPrijsCents(amandelen)).toBe(295);
        // Een prijs per 250 gram wordt op het kaartje per 100 gram.
        expect(kaartPrijsCents({ eenheid: 'gram', prijs_per: 250, winkelprijs_incl_cents: 1000 })).toBe(400);
        expect(winkelPrijsCents(400, { eenheid: 'gram', prijs_per: 250 })).toBe(1000);
        expect(winkelPrijsCents(395, fles)).toBe(395);
        expect(kaartPrijsCents({ ...fles, winkelprijs_incl_cents: null })).toBeNull();
    });

    it('zonder bewaard kaartje: een voorstel uit het product', () => {
        const k = kaartjeVoorProduct(fles, null);
        expect(k).toMatchObject({ soort: 'Speciaalbier', naam: 'Rochefort 8', inhoud: null, inhoudEenheid: 'cl', prijsCents: 395, aantal: 1, printen: true });
        expect(kaartjeVoorProduct(amandelen, null)).toMatchObject({ inhoud: 100, inhoudEenheid: 'los' });
    });

    it('wat bewaard is gaat voor; de prijs komt altijd van het product', () => {
        const k = kaartjeVoorProduct(fles, {
            soort: 'Speciaalbier', naam: 'Rochefort 8', maker: 'Rochefort', details: 'Trappist · 9,2%',
            inhoud: 33, inhoud_eenheid: 'cl', bij: 'oude kaas', aantal: 2, printen: false,
        });
        expect(k).toMatchObject({ maker: 'Rochefort', details: 'Trappist · 9,2%', inhoud: 33, bij: 'oude kaas', aantal: 2, printen: false, prijsCents: 395 });
    });

    it('zonder prijs komt een kaartje niet op het vel; aantal telt, tussen 1 en 50', () => {
        const met: Kaartje = { ...kaartjeVoorProduct(fles, null), aantal: 3 };
        const zonder: Kaartje = kaartjeVoorProduct({ ...fles, id: 'c', winkelprijs_incl_cents: null }, null);
        const uit: Kaartje = { ...met, productId: 'd', printen: false };
        expect(kanPrinten(zonder)).toBe(false);
        expect(kaartjesVoorPrint([met, zonder, uit])).toHaveLength(3);
        expect(kaartjesVoorPrint([{ ...met, aantal: 500 }])).toHaveLength(50);
        expect(kaartjesVoorPrint([{ ...met, aantal: 0 }])).toHaveLength(1);
    });

    it('tien kaartjes per vel', () => {
        expect(aantalVellen(0)).toBe(1);
        expect(aantalVellen(10)).toBe(1);
        expect(aantalVellen(11)).toBe(2);
        expect(aantalVellen(36)).toBe(4);
    });

    it('prijs en inhoud zoals op het kaartje', () => {
        expect(prijsDelen(495)).toEqual(['4', '95']);
        expect(prijsDelen(1250)).toEqual(['12', '50']);
        expect(prijsDelen(800)).toEqual(['8', '00']);
        expect(inhoudTekst({ inhoud: 35.5, inhoudEenheid: 'cl' })).toEqual({ onderPrijs: '', links: '35,5 cl' });
        expect(inhoudTekst({ inhoud: 150, inhoudEenheid: 'g' })).toEqual({ onderPrijs: '', links: '150 gram' });
        expect(inhoudTekst({ inhoud: 100, inhoudEenheid: 'los' })).toEqual({ onderPrijs: 'per 100 gram', links: '' });
        expect(inhoudTekst({ inhoud: null, inhoudEenheid: 'cl' })).toEqual({ onderPrijs: '', links: '' });
    });
});
