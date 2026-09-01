import { describe, it, expect } from 'vitest';
import { beoordeelGerecht, afOverzicht, type GerechtGegevens } from './gerechtAf';

function gerecht(over: Partial<GerechtGegevens> & { naam: string }): GerechtGegevens {
    return {
        id: over.naam.toLowerCase().replace(/\s+/g, '-'),
        ingredienten: 0,
        kostprijsCent: null,
        allergenen: [],
        stappen: 0,
        stappenMetDuur: 0,
        ...over,
    };
}

describe('beoordeelGerecht — vijf eisen', () => {
    it('een gerecht met alleen een naam haalt er nul', () => {
        const o = beoordeelGerecht(gerecht({ naam: 'Gegrilde ananas' }));
        expect(o.gehaald).toBe(0);
        expect(o.af).toBe(false);
        expect(o.volgende?.sleutel).toBe('ingredienten');
    });

    it('een compleet gerecht haalt er vijf en heeft geen volgende stap', () => {
        const o = beoordeelGerecht(gerecht({
            naam: 'Compleet', ingredienten: 13, kostprijsCent: 91,
            allergenen: ['lactose'], stappen: 13, stappenMetDuur: 13,
        }));
        expect(o.gehaald).toBe(5);
        expect(o.af).toBe(true);
        expect(o.volgende).toBeNull();
    });

    it('wijst de eerstvolgende ontbrekende eis aan, in de volgorde die werkt', () => {
        /* Ingrediënten eerst: kostprijs en allergenen volgen daaruit. */
        const o = beoordeelGerecht(gerecht({ naam: 'Half', stappen: 5, stappenMetDuur: 5 }));
        expect(o.volgende?.sleutel).toBe('ingredienten');
    });

    it('stappen zonder tijden halen de handtijd-eis niet', () => {
        const o = beoordeelGerecht(gerecht({
            naam: 'Bavette', ingredienten: 3, kostprijsCent: 36,
            allergenen: ['gluten'], stappen: 3, stappenMetDuur: 0,
        }));
        expect(o.gehaald).toBe(4);
        expect(o.volgende?.sleutel).toBe('handtijd');
    });

    it('een kostprijs van nul telt niet als kostprijs', () => {
        expect(beoordeelGerecht(gerecht({ naam: 'A', kostprijsCent: 0 })).eisen[1].gehaald).toBe(false);
        expect(beoordeelGerecht(gerecht({ naam: 'B', kostprijsCent: 1 })).eisen[1].gehaald).toBe(true);
    });

    it('gaat om met allergenen die geen lijst zijn', () => {
        expect(beoordeelGerecht(gerecht({ naam: 'A', allergenen: null })).eisen[2].gehaald).toBe(false);
        expect(beoordeelGerecht(gerecht({ naam: 'B', allergenen: 'gluten' })).eisen[2].gehaald).toBe(false);
    });

    it('elke eis draagt uit zichzelf waarom hij bestaat', () => {
        const o = beoordeelGerecht(gerecht({ naam: 'A' }));
        for (const e of o.eisen) {
            expect(e.gevolg.length).toBeGreaterThan(20);
            expect(e.label.length).toBeGreaterThan(3);
        }
    });
});

describe('afOverzicht — de stand van het menu van 18 september', () => {
    /* Precies zoals het er op 1 september 2026 bij stond. */
    const MENU = [
        gerecht({ naam: 'Gegrilde kippendij', ingredienten: 1, kostprijsCent: 58 }),
        gerecht({ naam: 'Crispy zalm', ingredienten: 2, kostprijsCent: 37 }),
        gerecht({ naam: 'Gerookte bavette', ingredienten: 3, kostprijsCent: 36, allergenen: ['G', 'E', 'S'], stappen: 3 }),
        gerecht({ naam: 'Gegrilde ananas' }),
        gerecht({ naam: 'Pinsa van de barbecue' }),
        gerecht({ naam: 'Carpaccio van gerookt runder muis' }),
        gerecht({ naam: 'Moink balls van de smoker' }),
        gerecht({ naam: 'Slider van de yoder', allergenen: ['G'] }),
    ].map(beoordeelGerecht);

    it('telt hoeveel er echt af zijn', () => {
        const o = afOverzicht(MENU);
        expect(o.gerechten).toBe(8);
        expect(o.af).toBe(0);
    });

    it('telt de gerechten waar nog niets van staat', () => {
        expect(afOverzicht(MENU).leeg).toBe(4);
    });

    it('wijst de eerste stap in de keten aan, niet het grootste getal', () => {
        const o = afOverzicht(MENU);
        /* Handtijd ontbreekt bij álle acht en is dus het grootste getal — maar
           dat is het slechtste antwoord: zonder ingrediënten en stappen kun je
           er niets mee. Vijf gerechten missen ingrediënten; dáár begin je. */
        expect(o.perEis.handtijd).toBe(0);
        expect(o.eersteGat?.sleutel).toBe('ingredienten');
        expect(o.eersteGat?.ontbreekt).toBe(5);
    });

    it('telt per eis hoeveel gerechten hem halen', () => {
        const o = afOverzicht(MENU);
        expect(o.perEis.ingredienten).toBe(3);
        expect(o.perEis.kostprijs).toBe(3);
        expect(o.perEis.allergenen).toBe(2);
        expect(o.perEis.stappen).toBe(1);
        expect(o.perEis.handtijd).toBe(0);
    });

    it('geeft geen gat aan als alles af is', () => {
        const alles = [beoordeelGerecht(gerecht({
            naam: 'Af', ingredienten: 1, kostprijsCent: 10, allergenen: ['x'], stappen: 1, stappenMetDuur: 1,
        }))];
        expect(afOverzicht(alles).eersteGat).toBeNull();
        expect(afOverzicht(alles).af).toBe(1);
    });

    it('gaat om met een lege lijst', () => {
        const o = afOverzicht([]);
        expect(o.gerechten).toBe(0);
        expect(o.eersteGat).toBeNull();
    });
});
