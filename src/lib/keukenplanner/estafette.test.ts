import { describe, it, expect } from 'vitest';
import {
    geschikteApparaten, kiesApparaat, rondesPerDag, estafetteWinst,
    bepaalFlessenhals, vraagPerApparaat, rookMeerijden, type ApparaatMetKundes,
} from './estafette';

/* De echte twee toestellen van Hop & Bites, plus de Rational die er nog niet
   staat. Dat laatste is bewust: het model moet kunnen laten zien wat zo'n
   apparaat oplevert vóórdat je hem koopt. */

const smoker: ApparaatMetKundes = {
    id: 21, naam: 'Yoder YS1500s', kundes: ['smoker', 'oven'],
    aanzetMin: 1, opwarmMin: 60, warmBlijftMin: null, schoonmaakMin: 20,
    exclusiefBezet: true, concurrentJobs: null, capaciteitWaarde: 60,
    capaciteitEenheid: 'kg', kookoppervlakCm2: 9677,
    temp_min_c: 65, temp_max_c: 260, stationId: 2,
};

const houtskool: ApparaatMetKundes = {
    ...smoker, id: 1, naam: 'Yoder 24×48', kundes: ['grill'],
    opwarmMin: 20, capaciteitWaarde: 40, kookoppervlakCm2: 7432,
    temp_min_c: null, temp_max_c: null,
};

const rational: ApparaatMetKundes = {
    ...smoker, id: 99, naam: 'Rational combisteamer', kundes: ['oven', 'steamer'],
    opwarmMin: 12, capaciteitWaarde: 40, kookoppervlakCm2: null,
    temp_min_c: 30, temp_max_c: 300,
};

describe('geschikteApparaten — een stap vraagt een kunde, geen apparaat', () => {
    it('vindt alles dat de kunde heeft', () => {
        const uit = geschikteApparaten({ kunde: 'oven', tempC: 110 }, [smoker, houtskool, rational]);
        expect(uit.map((a) => a.id).sort()).toEqual([21, 99]);
    });

    it('laat een apparaat vallen dat de temperatuur niet haalt', () => {
        const laag = { ...rational, temp_max_c: 90 };
        expect(geschikteApparaten({ kunde: 'oven', tempC: 110 }, [laag])).toHaveLength(0);
    });

    it('houdt een apparaat met onbekend bereik in de race', () => {
        /* Onbekend is niet hetzelfde als ongeschikt. Het telt straks wel mee
           in de voorkeur. */
        expect(geschikteApparaten({ kunde: 'grill', tempC: 220 }, [houtskool])).toHaveLength(1);
    });

    it('geeft niets terug als niemand het kan', () => {
        expect(geschikteApparaten({ kunde: 'steamer' }, [smoker, houtskool])).toHaveLength(0);
    });
});

describe('kiesApparaat — ontzie de flessenhals', () => {
    it('stuurt de gaarfase naar de Rational en niet naar de smoker', () => {
        /* Dit is de hele truc: beide kunnen het, maar elk uur dat de smoker
           vrij is, is een uur waarin er een lading bij kan. */
        const keuze = kiesApparaat({ kunde: 'oven', tempC: 110 }, [smoker, rational], { flessenhalsId: 21 });
        expect(keuze!.apparaat.id).toBe(99);
    });

    it('kiest de smoker alsnog als er niets anders is', () => {
        const keuze = kiesApparaat({ kunde: 'oven', tempC: 110 }, [smoker], { flessenhalsId: 21 });
        expect(keuze!.apparaat.id).toBe(21);
        expect(keuze!.reden).toContain('flessenhals');
    });

    it('kiest bij gelijke geschiktheid het minst volle apparaat', () => {
        const tweede = { ...rational, id: 98, naam: 'Tweede oven' };
        const keuze = kiesApparaat({ kunde: 'oven', tempC: 110 }, [rational, tweede], {
            bezetMin: new Map([[99, 300], [98, 60]]),
        });
        expect(keuze!.apparaat.id).toBe(98);
    });

    it('geeft niets terug als niemand het kan', () => {
        expect(kiesApparaat({ kunde: 'steamer' }, [smoker, houtskool])).toBeNull();
    });
});

describe('rondesPerDag — opwarmen betaal je één keer', () => {
    it('haalt twee rondes van vijf uur in een dag van twaalf', () => {
        /* 60 min opwarmen + 2 × 300 min + 15 min wisselen = 675 min. */
        const uit = rondesPerDag({ beschikbaarMin: 720, opwarmMin: 60, cyclusMin: 300, wisselMin: 15 });
        expect(uit.rondes).toBe(2);
        expect(uit.eindMin).toBe(675);
    });

    it('haalt er maar één als de cyclus tien uur is', () => {
        /* Blijft het vlees de hele rit op de smoker liggen, dan past er één. */
        expect(rondesPerDag({ beschikbaarMin: 720, opwarmMin: 60, cyclusMin: 600, wisselMin: 15 }).rondes).toBe(1);
    });

    it('geeft nul als er niet eens één ronde in past', () => {
        expect(rondesPerDag({ beschikbaarMin: 240, opwarmMin: 60, cyclusMin: 300 }).rondes).toBe(0);
    });
});

describe('estafetteWinst — wat een overnemer oplevert', () => {
    const dag = { beschikbaarMin: 720, opwarmMin: 60, rookMin: 300, gaarMin: 300, wisselMin: 15 };

    it('verdubbelt wat er door de smoker kan', () => {
        const uit = estafetteWinst({ ...dag, overnemer: rational });
        expect(uit.zonder).toBe(1);
        expect(uit.met).toBe(2);
        expect(uit.extraLadingen).toBe(1);
        expect(uit.uitleg).toContain('Rational');
    });

    it('zegt eerlijk nul als er niets is dat kan overnemen', () => {
        /* Vandaag de waarheid bij Hop & Bites: er staat geen oven. Het model
           laat dan meteen zien wat zo'n apparaat waard zou zijn. */
        const uit = estafetteWinst({ ...dag, overnemer: null });
        expect(uit.extraLadingen).toBe(0);
        expect(uit.uitleg).toContain('geen apparaat');
    });

    it('maakt op een korte dag het verschil tussen niets en één lading', () => {
        /* Zeven uur beschikbaar. Rook plus gaar is tien uur, dus zonder
           overnemer haal je vandaag geen enkele lading. Met overnemer past de
           rookfase van vijf uur er wel in en gaart hij 's avonds door. */
        const kort = estafetteWinst({ ...dag, beschikbaarMin: 420, overnemer: rational });
        expect(kort.zonder).toBe(0);
        expect(kort.met).toBe(1);
        expect(kort.extraLadingen).toBe(1);
    });

    it('levert niets op als de gaarfase toch al kort is', () => {
        /* Tien minuten nagaren haal je niet van de smoker af voor winst — de
           cyclus wordt er nauwelijks korter van. */
        const kortGaren = estafetteWinst({ ...dag, gaarMin: 10, overnemer: rational });
        expect(kortGaren.extraLadingen).toBe(0);
        expect(kortGaren.uitleg).toContain('geen extra lading');
    });
});


describe('bepaalFlessenhals — waar loopt de dag op vast', () => {
    it('kiest het apparaat met de meeste vraag', () => {
        const uit = bepaalFlessenhals(new Map([[21, 600], [1, 120]]));
        expect(uit.apparaatId).toBe(21);
    });

    it('noemt een dag krap boven zeventig procent bezetting', () => {
        /* Tien van de twaalf uur op één toestel: elke uitloop tikt door naar
           het eind van de dag. */
        expect(bepaalFlessenhals(new Map([[21, 600]])).krap).toBe(true);
    });

    it('noemt een rustige dag niet krap', () => {
        /* Twee uur op twaalf — dan is "ontzien" een oplossing voor een
           probleem dat er niet is. */
        expect(bepaalFlessenhals(new Map([[21, 120]])).krap).toBe(false);
    });

    it('geeft niets terug op een dag zonder apparaten', () => {
        expect(bepaalFlessenhals(new Map()).apparaatId).toBeNull();
    });
});

describe('vraagPerApparaat', () => {
    it('telt aanzetten, opwarmen, werken en wachten bij elkaar', () => {
        const app = { id: 21, aanzetMin: 1, opwarmMin: 60 };
        const uit = vraagPerApparaat([
            { apparaat: app, actiefMin: 5, passiefMin: 300 },
            { apparaat: app, actiefMin: 10, passiefMin: 0 },
        ]);
        expect(uit.get(21)).toBe(61 + 305 + 71);
    });

    it('slaat taken zonder apparaat over', () => {
        expect(vraagPerApparaat([{ apparaat: null, actiefMin: 20, passiefMin: 0 }]).size).toBe(0);
    });
});


describe('rookMeerijden — de gerookte cranberries', () => {
    it('laat ze meerijden als de smoker toch al draait', () => {
        /* Een schaal bessen naast het vlees kost niets extra. */
        const uit = rookMeerijden({ draaitAl: true, tempVerschilC: 0, opwarmMin: 60, wat: 'de cranberries' });
        expect(uit.oordeel).toBe('meerijden');
        expect(uit.reden).toContain('geen extra tijd');
    });

    it('vraagt het als de smoker uit staat', () => {
        /* Een uur opwarmen voor een bakje fruit is een keuze, geen aanname. */
        const uit = rookMeerijden({ draaitAl: false, opwarmMin: 60, wat: 'de cranberries' });
        expect(uit.oordeel).toBe('vraag');
        expect(uit.reden).toContain('60 min opwarmen');
        expect(uit.reden).toContain('zonder rook');
    });

    it('vraagt het ook als de temperatuur te ver uit elkaar ligt', () => {
        const uit = rookMeerijden({ draaitAl: true, tempVerschilC: 60, opwarmMin: 60, wat: 'de cranberries' });
        expect(uit.oordeel).toBe('vraag');
        expect(uit.reden).toContain('60 °C anders');
    });

    it('laat een klein temperatuurverschil gewoon meerijden', () => {
        const uit = rookMeerijden({ draaitAl: true, tempVerschilC: 5, opwarmMin: 60, wat: 'de cranberries' });
        expect(uit.oordeel).toBe('meerijden');
    });
});
