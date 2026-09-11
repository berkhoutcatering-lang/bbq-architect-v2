import { describe, it, expect } from 'vitest';
// Importeert de EXTENSIE-adapter-helpers rechtstreeks (één bron van waarheid).
import { toDecimalString, parsePackaging } from '../../../chrome-extension/adapters/lib/parse.js';
import { bidfoodPackText } from '../../../chrome-extension/adapters/bidfood.js';

describe('extension adapter — toDecimalString', () => {
    it('NL en internationale notatie → canonieke decimale string', () => {
        expect(toDecimalString('€ 22,50')).toBe('22.50');
        expect(toDecimalString('18.96')).toBe('18.96');
        expect(toDecimalString('1.234,56')).toBe('1234.56');
        expect(toDecimalString('1,234.56')).toBe('1234.56');
        expect(toDecimalString('8,25')).toBe('8.25');
    });
    it('onbruikbaar → null', () => {
        expect(toDecimalString('op aanvraag')).toBeNull();
        expect(toDecimalString(null)).toBeNull();
    });
});

describe('extension adapter — parsePackaging (§14.2 bronvelden)', () => {
    it('enkel gewicht "2,5 kg"', () => {
        const p = parsePackaging('Zak 2,5 kg');
        expect(p.priceBasis).toBe('package');
        expect(p.packCount).toBe('1');
        expect(p.contentPerItemQuantity).toBe('2.5');
        expect(p.contentPerItemUnit).toBe('kg');
        expect(p.packageDescriptionRaw).toBe('Zak 2,5 kg');
    });
    it('multipack "24 × 330 ml"', () => {
        const p = parsePackaging('24 × 330 ml');
        expect(p.packCount).toBe('24');
        expect(p.contentPerItemQuantity).toBe('330');
        expect(p.contentPerItemUnit).toBe('ml');
    });
    it('multipack "6 x 1,5 L"', () => {
        const p = parsePackaging('6 x 1,5 L');
        expect(p.packCount).toBe('6');
        expect(p.contentPerItemQuantity).toBe('1.5');
        expect(p.contentPerItemUnit).toBe('liter');
    });
    it('stuks "12 stuks"', () => {
        const p = parsePackaging('12 stuks');
        expect(p.packCount).toBe('12');
        expect(p.contentPerItemUnit).toBe('piece');
    });
    it('"750 g"', () => {
        const p = parsePackaging('750 g');
        expect(p.contentPerItemQuantity).toBe('750');
        expect(p.contentPerItemUnit).toBe('g');
    });
    it('"2 × 1 kg" → aantal 2, inhoud 1 kg (prijs blijft pakprijs)', () => {
        const p = parsePackaging('2 × 1 kg');
        expect(p.packCount).toBe('2');
        expect(p.contentPerItemQuantity).toBe('1');
        expect(p.contentPerItemUnit).toBe('kg');
    });
    it('variabel gewicht "per kg"', () => {
        const p = parsePackaging('Prijs per kg (vanggewicht)');
        expect(p.priceBasis).toBe('kg');
        expect(p.variableWeight).toBe(true);
    });
    it('onbekende verpakking blijft unknown', () => {
        const p = parsePackaging('assortiment');
        expect(p.priceBasis).toBe('unknown');
    });

    /* Bidfood schrijft "gr", niet "g" of "gram". Die ene lettergreep hield op
       9 september 1.045 producten in de wachtkamer — vrijwel de hele
       kruidenkast, want kruiden worden nu eenmaal per gram verkocht. */
    it('leest "gr" als gram', () => {
        const p = parsePackaging('Paprikapoeder, bus 500 gr');
        expect(p.priceBasis).toBe('package');
        expect(p.packCount).toBe('1');
        expect(p.contentPerItemQuantity).toBe('500');
        expect(p.contentPerItemUnit).toBe('g');
    });

    it('leest "grammen" ook', () => {
        expect(parsePackaging('zak 250 grammen').contentPerItemUnit).toBe('g');
    });

    /* Centiliter is geen basiseenheid; 75 cl en 750 ml moeten hetzelfde
       opleveren, anders staat dezelfde fles twee keer verschillend in de kast. */
    it('rekent centiliter om naar milliliter', () => {
        const p = parsePackaging('Sushi azijn, fles 50 cl');
        expect(p.contentPerItemQuantity).toBe('500');
        expect(p.contentPerItemUnit).toBe('ml');
    });

    it('rekent deciliter om naar milliliter', () => {
        const p = parsePackaging('fles 5 dl');
        expect(p.contentPerItemQuantity).toBe('500');
        expect(p.contentPerItemUnit).toBe('ml');
    });

    it('leest "lt" als liter', () => {
        const p = parsePackaging('Frituurvet vloeibaar regular, emmer 10 lt');
        expect(p.contentPerItemQuantity).toBe('10');
        expect(p.contentPerItemUnit).toBe('liter');
    });

    it('telt verpakkingswoorden als stuks wanneer er geen gewicht staat', () => {
        const p = parsePackaging('Drinkbouillon tomaat sticks, doosje 80 zakjes');
        expect(p.priceBasis).toBe('package');
        expect(p.packCount).toBe('80');
        expect(p.contentPerItemUnit).toBe('piece');
    });

    it('gewicht wint van het verpakkingswoord', () => {
        /* "40 gr per zakje, doos 12 zakjes" gaat over 40 gram, niet over 12. */
        const p = parsePackaging('Winegums 120 gr per zakje, doos 12 zakjes');
        expect(p.contentPerItemQuantity).toBe('120');
        expect(p.contentPerItemUnit).toBe('g');
    });

    it('houdt echt onduidelijke verpakking onduidelijk', () => {
        /* Deze horen in de wachtkamer thuis; een gok is erger dan een gat. */
        expect(parsePackaging('Houtduif, per stuk').priceBasis).not.toBe('package');
        expect(parsePackaging('Spareribs sous-vide gegaard, krat 8 x 3 ribben').priceBasis).toBe('unknown');
    });
});

/**
 * Bidfood beschrijft een omdoos in twee helften: "40 gr per zakje, doos 12
 * zakjes". Wie alleen de eerste helft leest houdt 40 gram over terwijl de prijs
 * over 480 gram gaat. Op 9 september 2026 stond 45% van alle producten met een
 * graminhoud daardoor boven de 150 euro per kilo — zalmfilet op 554, kipdij­
 * shoarma op 338. Deze helper zet de twee helften weer bij elkaar.
 */
describe('bidfoodPackText — omdoos uit de productnaam', () => {
    it('telt stuks maal stukgewicht', () => {
        expect(bidfoodPackText('Zalmfilet zonder vel vacuüm ASC 180 gr per stuk, doos 25 stuks'))
            .toBe('25 × 180 g');
    });

    it('herkent ook zakje, cupje en bus als inhoudswoord', () => {
        expect(bidfoodPackText('Peper sticks 0,2 gr per zakje, doos 750 zakjes')).toBe('750 × 0,2 g');
        expect(bidfoodPackText('Mayonaise 25 gr per cupje, doos 100 cupjes')).toBe('100 × 25 g');
        expect(bidfoodPackText('Chips hot & spicy 40 gr per bus, tray 12 bussen')).toBe('12 × 40 g');
    });

    it('een genoemd totaal wint van het stukgewicht', () => {
        /* "20 gr per stuk, zak 1 kg" — de zak is de verpakking, het stukgewicht
           een bijzin. Zonder deze regel lees je 20 gram: vijftig keer te weinig. */
        expect(bidfoodPackText('Plantaardige kipnuggets 20 gr per stuk, zak 1 kg')).toBe('1 kg');
        expect(bidfoodPackText('Rundergehaktbal Albondigas ca. 30 gr per stuk, doos 5 kg')).toBe('5 kg');
    });

    it('laat een naam zonder omdoos met rust', () => {
        expect(bidfoodPackText('Paprikapoeder, bus 500 gr')).toBe('Paprikapoeder, bus 500 gr');
    });

    it('leest het aantal ná de inhoudsmaat, niet ervoor', () => {
        /* Anders wordt "12 gr per stuk" zelf als aantal gelezen. */
        expect(bidfoodPackText('Bonbon 12 gr per stuk, doos 40 stuks')).toBe('40 × 12 g');
    });
});
