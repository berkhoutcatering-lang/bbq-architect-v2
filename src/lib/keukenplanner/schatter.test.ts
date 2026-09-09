import { describe, it, expect } from 'vitest';
import {
    schat,
    moetBijstellen,
    splitsVastEnPerEenheid,
    mediaan,
    duurBronVan,
    MINIMUM_METINGEN,
    type Meting,
} from './schatter';

const m = (min: number, extra: Partial<Meting> = {}): Meting => ({ werkelijkeMin: min, ...extra });

describe('schat — monitorstand', () => {
    it('zegt eerlijk dat er niets bekend is', () => {
        const s = schat([]);
        expect(s.durMin).toBeNull();
        expect(s.stand).toBe('geen');
    });

    it('rekent onder vijf metingen met de hoogste, niet met het gemiddelde', () => {
        /* Te ruim plannen is onschuldig; te krap stapelt zich op. */
        const s = schat([m(10), m(14), m(11)]);
        expect(s.durMin).toBe(14);
        expect(s.stand).toBe('monitor');
    });

    it('slaat om naar gemeten vanaf vijf metingen', () => {
        const s = schat([m(10), m(12), m(11), m(13), m(12)]);
        expect(s.stand).toBe('gemeten');
        expect(s.aantal).toBe(MINIMUM_METINGEN);
    });

    it('gebruikt de mediaan zodat één uitschieter niets verzet', () => {
        /* De 60 is de dag dat de leverancier langskwam zonder dat het vinkje aan stond. */
        const s = schat([m(10), m(11), m(12), m(11), m(60)]);
        expect(s.durMin).toBe(11);
    });

    it('kijkt hooguit tien metingen terug', () => {
        const oud = Array.from({ length: 10 }, () => m(30));
        const nieuw = Array.from({ length: 10 }, () => m(10));
        expect(schat([...oud, ...nieuw]).durMin).toBe(10);
    });
});

describe('schat — spreidingsbewaker', () => {
    it('vlagt een stap waar meer dan een factor twee in zit', () => {
        const s = schat([m(5), m(6), m(7), m(14), m(6)]);
        expect(s.splitsen).toBe(true);
        expect(s.reden).toContain('spreiding');
    });

    it('laat een normale spreiding met rust', () => {
        expect(schat([m(10), m(11), m(12), m(13), m(14)]).splitsen).toBe(false);
    });

    it('staat uit voor passieve stappen — daar slaat hij altijd vals aan', () => {
        /* Een halve en een hele brisket zitten er zo een factor twee uit
           elkaar; dat is geen fout in de definitie maar natuurkunde. */
        const s = schat([m(240, { stukGewichtKg: 4 }), m(480, { stukGewichtKg: 8 })], { passief: true });
        expect(s.splitsen).toBe(false);
    });
});

describe('schat — passieve gaarstappen leren niet op tijd', () => {
    it('blijft in monitorstand, hoeveel metingen er ook zijn', () => {
        const metingen = Array.from({ length: 20 }, (_, i) => m(300 + i, { stukGewichtKg: 5 }));
        const s = schat(metingen, { passief: true });
        expect(s.stand).toBe('monitor');
        expect(s.reden).toContain('verwachting');
    });

    it('valt terug op de hoogste als het stukgewicht ontbreekt', () => {
        const s = schat([m(300), m(340)], { passief: true });
        expect(s.durMin).toBe(340);
    });
});

describe('moetBijstellen — de drempel', () => {
    it('laat een verschil onder tien procent staan', () => {
        expect(moetBijstellen(20, 21)).toBe(false);
    });

    it('neemt een echte verandering over', () => {
        expect(moetBijstellen(20, 24)).toBe(true);
    });

    it('vult een lege schatting altijd', () => {
        expect(moetBijstellen(null, 18)).toBe(true);
    });

    it('doet niets zonder nieuwe waarde', () => {
        expect(moetBijstellen(20, null)).toBe(false);
    });
});

describe('splitsVastEnPerEenheid', () => {
    it('weigert te splitsen als alle metingen bij dezelfde hoeveelheid zijn', () => {
        /* Snipper je vijf keer precies twee kilo, dan weet het systeem niet
           wat het klaarzetten van de machine kost. */
        const zelfde = Array.from({ length: 6 }, () => m(20, { hoeveelheid: 2 }));
        expect(splitsVastEnPerEenheid(zelfde)).toBeNull();
    });

    it('splitst als de hoeveelheden genoeg uiteenlopen', () => {
        /* 5 min opzetten + 5 min per kilo. */
        const metingen = [
            m(10, { hoeveelheid: 1 }), m(15, { hoeveelheid: 2 }), m(20, { hoeveelheid: 3 }),
            m(25, { hoeveelheid: 4 }), m(30, { hoeveelheid: 5 }), m(35, { hoeveelheid: 6 }),
        ];
        const uit = splitsVastEnPerEenheid(metingen);
        expect(uit).not.toBeNull();
        expect(uit!.vastMin).toBeCloseTo(5, 1);
        expect(uit!.perEenheidMin).toBeCloseTo(5, 1);
    });

    it('weigert bij te weinig metingen', () => {
        expect(splitsVastEnPerEenheid([m(10, { hoeveelheid: 1 }), m(20, { hoeveelheid: 4 })])).toBeNull();
    });

    it('weigert een negatieve opzettijd — dan werkt de stap zo niet', () => {
        const raar = [
            m(30, { hoeveelheid: 1 }), m(20, { hoeveelheid: 2 }), m(10, { hoeveelheid: 3 }),
            m(8, { hoeveelheid: 4 }), m(6, { hoeveelheid: 5 }),
        ];
        expect(splitsVastEnPerEenheid(raar)).toBeNull();
    });
});

describe('duurBronVan — welk etiket het scherm toont', () => {
    it('gaar op kern is altijd een verwachting', () => {
        expect(duurBronVan(schat([m(10), m(11), m(12), m(13), m(12)]), true)).toBe('verwacht');
    });
    it('vijf metingen is gemeten', () => {
        expect(duurBronVan(schat([m(10), m(11), m(12), m(13), m(12)]), false)).toBe('gemeten');
    });
    it('minder is monitor', () => {
        expect(duurBronVan(schat([m(10)]), false)).toBe('monitor');
    });
    it('niets is geschat', () => {
        expect(duurBronVan(schat([]), false)).toBe('geschat');
    });
});

describe('mediaan', () => {
    it('werkt bij een oneven aantal', () => {
        expect(mediaan([3, 1, 2])).toBe(2);
    });
    it('middelt de twee middelste bij een even aantal', () => {
        expect(mediaan([1, 2, 3, 4])).toBe(2.5);
    });
});
