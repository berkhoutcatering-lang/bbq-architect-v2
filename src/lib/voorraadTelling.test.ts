import { describe, it, expect } from 'vitest';
import {
    telTotaal,
    telSom,
    prijsPerEenheid,
    pakVoorstel,
    eenheidVoorstel,
    zoneLabel,
} from './voorraadTelling';

describe('telTotaal — aantal pakken × inhoud', () => {
    it('rekent het voorbeeld uit de keuken: 4 pakken suiker van 1 kilo', () => {
        expect(telTotaal(4, 1)).toBe(4);
    });

    it('werkt met halve pakken en decimale inhoud', () => {
        expect(telTotaal(2, 0.5)).toBe(1);
        expect(telTotaal(3, 2.5)).toBe(7.5);
    });

    it('laat drijvende-komma-ruis niet doorlekken', () => {
        /* 3 × 0,333 is in binair 0.9990000000000001 — dat mag niet in de
           voorraadstand belanden. */
        expect(telTotaal(3, 0.333)).toBe(0.999);
    });

    it('geeft 0 bij onzin in plaats van NaN', () => {
        expect(telTotaal(-1, 2)).toBe(0);
        expect(telTotaal(4, 0)).toBe(0);
        expect(telTotaal(Number.NaN, 2)).toBe(0);
    });

    it('nul pakken is een geldige telling — je hebt het gezien en het was op', () => {
        expect(telTotaal(0, 1)).toBe(0);
    });
});

describe('telSom — de navertelbare zin', () => {
    it('schrijft de som op zoals je hem zou uitspreken', () => {
        expect(telSom(4, 1, 'kg')).toBe('4 × 1 kg = 4 kg');
    });

    it('gebruikt Nederlandse komma-notatie', () => {
        expect(telSom(3, 2.5, 'kg')).toBe('3 × 2,5 kg = 7,5 kg');
    });

    it('zwijgt als er nog niets te tellen valt', () => {
        expect(telSom(0, 1, 'kg')).toBeNull();
    });
});

describe('prijsPerEenheid — afleiden of niets zeggen', () => {
    it('rekent de genormaliseerde catalogus-basis om naar de gekozen eenheid', () => {
        /* €3,29 per 100 g → €32,90 per kg */
        const r = prijsPerEenheid(
            { source: 'supplier_product', base_cost_cents: 329, base_quantity: 100, base_unit: 'g' },
            'kg',
        );
        expect(r).not.toBeNull();
        expect(r!.euro).toBeCloseTo(32.9, 2);
    });

    it('neemt de prijs per kilo uit de prijslijst over', () => {
        const r = prijsPerEenheid({ source: 'price_list', prijs_per_kg: 29.5 }, 'kg');
        expect(r!.euro).toBeCloseTo(29.5, 2);
        expect(r!.bron).toContain('per kg');
    });

    it('rekent per kilo netjes terug naar per gram', () => {
        const r = prijsPerEenheid({ prijs_per_kg: 29.5 }, 'g');
        expect(r!.euro).toBeCloseTo(0.0295, 4);
    });

    it('gebruikt de stuksprijs als je in stuks telt', () => {
        const r = prijsPerEenheid({ prijs_per_stuk: 1.3 }, 'stuks');
        expect(r!.euro).toBeCloseTo(1.3, 2);
    });

    it('zwijgt als de eenheden uit verschillende families komen', () => {
        /* Prijs per kilo, maar jij telt in liters — dat kan niet zonder
           dichtheid. Liever niets dan een verzonnen getal. */
        expect(prijsPerEenheid({ prijs_per_kg: 29.5 }, 'liter')).toBeNull();
    });

    it('zwijgt bij een pakprijs zonder bruikbare eenheid', () => {
        /* "€24,00 per doos" zegt niets over hoeveel er in die doos zit. */
        expect(prijsPerEenheid({ prijs: 24, eenheid: 'doos' }, 'kg')).toBeNull();
    });

    it('leest een pakprijs nooit als eenheidsprijs — ook niet bij een echte maat', () => {
        /* Echte rij uit de prijslijst: "Suikerwafel 90gram", prijs 13,50,
           eenheid 'g'. Die 'g' komt uit de productnaam, 13,50 is de pakprijs.
           Als eenheidsprijs gelezen wordt dat € 13,50 per gram. */
        expect(prijsPerEenheid({ source: 'price_list', prijs: 13.5, eenheid: 'g' }, 'g')).toBeNull();
        expect(prijsPerEenheid({ source: 'price_list', prijs: 13.5, eenheid: 'g' }, 'kg')).toBeNull();
    });

    it('trapt niet in een prijsveld dat de pakinhoud bevat', () => {
        /* "Suikerklontjes, doosje 1,06 kg" komt binnen met prijs 1,06 — dat is
           het gewicht dat in het prijsveld beland is, geen bedrag. */
        expect(prijsPerEenheid({ source: 'price_list', prijs: 1.06, eenheid: 'kg' }, 'kg')).toBeNull();
    });

    it('zwijgt als er helemaal geen prijs is — nooit stil €0', () => {
        expect(prijsPerEenheid({}, 'kg')).toBeNull();
        expect(prijsPerEenheid({ prijs: 0, eenheid: 'kg' }, 'kg')).toBeNull();
    });

    it('kiest de genormaliseerde basis boven de kale pakprijs', () => {
        /* Beide aanwezig: base_cost_cents is betrouwbaarder dan "€29,60 per doos". */
        const r = prijsPerEenheid(
            { base_cost_cents: 141, base_quantity: 100, base_unit: 'g', prijs: 29.6, eenheid: 'doos' },
            'kg',
        );
        expect(r!.euro).toBeCloseTo(14.1, 2);
    });
});

describe('pakVoorstel — wat zit er in één pak', () => {
    it('toont 1000 g als 1 kg, want zo staat het op de verpakking', () => {
        expect(pakVoorstel({ pack_total_quantity: 1000, pack_total_unit: 'g' }))
            .toEqual({ inhoud: 1, eenheid: 'kg' });
    });

    it('laat kleine hoeveelheden in gram staan', () => {
        expect(pakVoorstel({ pack_total_quantity: 250, pack_total_unit: 'g' }))
            .toEqual({ inhoud: 250, eenheid: 'g' });
    });

    it('doet hetzelfde voor volume', () => {
        expect(pakVoorstel({ pack_total_quantity: 1000, pack_total_unit: 'ml' }))
            .toEqual({ inhoud: 1, eenheid: 'liter' });
    });

    it('stelt niets voor als de leverancier de inhoud niet meelevert', () => {
        expect(pakVoorstel({ prijs: 10, eenheid: 'doos' })).toBeNull();
        expect(pakVoorstel({ pack_total_quantity: 1, pack_total_unit: 'doos' })).toBeNull();
    });
});

describe('eenheidVoorstel — waarin houd je dit bij', () => {
    it('volgt de pakinhoud als die bekend is', () => {
        expect(eenheidVoorstel({ pack_total_quantity: 1000, pack_total_unit: 'g' })).toBe('kg');
    });

    it('maakt van een gram-basis een kilo-eenheid', () => {
        expect(eenheidVoorstel({ base_unit: 'g' })).toBe('kg');
    });

    it('valt terug op stuks als er niets bekend is', () => {
        expect(eenheidVoorstel({})).toBe('stuks');
        expect(eenheidVoorstel({ eenheid: 'doos' })).toBe('stuks');
    });
});

describe('zoneLabel', () => {
    it('vertaalt de opslagcodes naar keukentaal', () => {
        expect(zoneLabel('vries')).toBe('Vriezer');
        expect(zoneLabel('vers')).toBe('Koeling');
        expect(zoneLabel('houdbaar')).toBe('Droog');
    });

    it('is eerlijk over items die nog geen plek hebben', () => {
        expect(zoneLabel(null)).toBe('Nog geen plek');
    });
});
