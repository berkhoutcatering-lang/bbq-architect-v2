import { describe, expect, it } from 'vitest';
import {
    aantalVellen, eenheidsprijsTekst, inhoudTekst, kaartjesVoorPrint, kaartjeVoorProduct, kaartPrijsCents, kanPrinten, lijnVanType,
    prijsDelen, soortVanProduct, winkelPrijsCents, type Kaartje, type KaartjeProduct,
} from './prijskaartje';

const fles: KaartjeProduct = { id: 'a', naam: 'Rochefort 8', type: 'bier', eenheid: 'stuk', prijs_per: 1, winkelprijs_incl_cents: 395, alcohol: true };
const amandelen: KaartjeProduct = { id: 'b', naam: 'BBQ-amandelen (los)', type: 'amandelen', eenheid: 'gram', prijs_per: 100, winkelprijs_incl_cents: 295, alcohol: false };

describe('prijskaartje', () => {
    it('de soort volgt het product; bier zonder alcohol is Alcoholvrij', () => {
        expect(soortVanProduct(fles)).toBe('Bier');
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
        expect(k).toMatchObject({ soort: 'Bier', naam: 'Rochefort 8', inhoud: null, inhoudEenheid: 'cl', prijsCents: 395, aantal: 1, printen: true, lijn: 'bier', statiegeldCents: null, actie: '' });
        expect(kaartjeVoorProduct(amandelen, null)).toMatchObject({ inhoud: 100, inhoudEenheid: 'los' });
    });

    it('wat bewaard is gaat voor; de prijs komt altijd van het product', () => {
        const k = kaartjeVoorProduct(fles, {
            soort: 'Donker en zwaar', naam: 'Rochefort 8', maker: 'Rochefort', details: 'Trappist · 9,2%',
            inhoud: 33, inhoud_eenheid: 'cl', statiegeld_cents: 15, actie: '2 voor € 5', bij: 'oude kaas', aantal: 2, printen: false,
        });
        expect(k).toMatchObject({ soort: 'Donker en zwaar', maker: 'Rochefort', details: 'Trappist · 9,2%', inhoud: 33, bij: 'oude kaas', aantal: 2, printen: false, prijsCents: 395, statiegeldCents: 15, actie: '2 voor € 5' });
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

    it('prijs en inhoud zoals op het kaartje, met de prijs per liter of kilo', () => {
        const nb = '\u00a0';
        expect(prijsDelen(495)).toEqual(['4', '95']);
        expect(prijsDelen(1250)).toEqual(['12', '50']);
        expect(prijsDelen(800)).toEqual(['8', '00']);
        expect(inhoudTekst({ inhoud: 35.5, inhoudEenheid: 'cl', prijsCents: null, statiegeldCents: null })).toEqual({ onderPrijs: '', links: '35,5 cl' });
        expect(inhoudTekst({ inhoud: 33, inhoudEenheid: 'cl', prijsCents: 295, statiegeldCents: null })).toEqual({ onderPrijs: '', links: `33 cl · €${nb}8,94 per liter` });
        expect(inhoudTekst({ inhoud: 150, inhoudEenheid: 'g', prijsCents: 450, statiegeldCents: null })).toEqual({ onderPrijs: '', links: `150 gram · €${nb}30,00 per kilo` });
        expect(inhoudTekst({ inhoud: 100, inhoudEenheid: 'los', prijsCents: 295, statiegeldCents: null })).toEqual({ onderPrijs: 'per 100 gram', links: '' });
        expect(inhoudTekst({ inhoud: null, inhoudEenheid: 'cl', prijsCents: 295, statiegeldCents: null })).toEqual({ onderPrijs: '', links: '' });
    });

    it('statiegeld onder de prijs, niet in de prijs per liter', () => {
        const nb = '\u00a0';
        expect(inhoudTekst({ inhoud: 33, inhoudEenheid: 'cl', prijsCents: 395, statiegeldCents: 15 }))
            .toEqual({ onderPrijs: `+ €${nb}0,15 statiegeld`, links: `33 cl · €${nb}11,97 per liter` });
        expect(eenheidsprijsTekst({ inhoud: 75, inhoudEenheid: 'cl', prijsCents: 1695 })).toBe(`€${nb}22,60 per liter`);
        expect(eenheidsprijsTekst({ inhoud: 1, inhoudEenheid: 'l', prijsCents: 500 })).toBe(`€${nb}5,00 per liter`);
        expect(eenheidsprijsTekst({ inhoud: 0.5, inhoudEenheid: 'kg', prijsCents: 1000 })).toBe(`€${nb}20,00 per kilo`);
        expect(eenheidsprijsTekst({ inhoud: 33, inhoudEenheid: 'cl', prijsCents: null })).toBe('');
    });

    it('drie lijnen: bier, wijn en de rest', () => {
        expect(lijnVanType('bier')).toBe('bier');
        expect(lijnVanType('wijn')).toBe('wijn');
        expect(lijnVanType('amandelen')).toBe('deli');
        expect(lijnVanType('overig')).toBe('deli');
        expect(kaartjeVoorProduct({ ...amandelen, type: 'wijn' }, null).lijn).toBe('wijn');
    });
});
