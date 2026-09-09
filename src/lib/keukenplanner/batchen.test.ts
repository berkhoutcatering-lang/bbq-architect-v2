import { describe, it, expect } from 'vitest';
import { batch, verdeelOverLadingen, verdeelGelijkmatig, magMeerijden, meerijders, batchSleutel } from './batchen';
import type { Apparaat, Taak } from './types';

const DAG = '2026-09-12';

const yoder: Apparaat = {
    id: 12, naam: 'Yoder 1500', aanzetMin: 1, opwarmMin: 35, warmBlijftMin: null,
    schoonmaakMin: 20, exclusiefBezet: true, concurrentJobs: 4, capaciteitWaarde: 20,
    capaciteitEenheid: 'kg', kookoppervlakCm2: 9677, stationId: 2,
};

const robotCoupe: Apparaat = {
    id: 7, naam: 'Robot Coupe CL50', aanzetMin: 1, opwarmMin: null, warmBlijftMin: null,
    schoonmaakMin: 8, exclusiefBezet: true, concurrentJobs: null, capaciteitWaarde: null,
    capaciteitEenheid: null, kookoppervlakCm2: null, stationId: 1,
};

function taak(over: Partial<Taak> & { id: number }): Taak {
    return {
        titel: 'Taak', actiefMin: 10, passiefMin: 0, duurBron: 'geschat',
        toezichtNodig: false, hangtAfVan: [], status: 'planned', ...over,
    };
}

const velden = () => ({ duur_vast_min: 5, duur_per_eenheid_min: 2 });

describe('batchSleutel — het werkwoord alleen is te grof', () => {
    it('neemt bewerking, component en apparaat mee', () => {
        const t = taak({ id: 1, bewerkingCode: 'snijden', componentId: 5, apparaat: robotCoupe });
        expect(batchSleutel(t, DAG)).toBe('snijden:5:7:2026-09-12');
    });

    it('ui en bosui vallen niet in dezelfde batch', () => {
        const ui = taak({ id: 1, bewerkingCode: 'snijden', componentId: 5 });
        const bosui = taak({ id: 2, bewerkingCode: 'snijden', componentId: 9 });
        expect(batchSleutel(ui, DAG)).not.toBe(batchSleutel(bosui, DAG));
    });

    it('zonder bewerking wordt er niet gebatcht', () => {
        expect(batchSleutel(taak({ id: 1 }), DAG)).toBeNull();
    });
});

describe('batch — drie gerechten met ui leveren één snippertaak op', () => {
    it('bundelt en telt de hoeveelheden op', () => {
        const taken = [1, 2, 3].map((i) =>
            taak({ id: i, titel: 'Ui snipperen', bewerkingCode: 'snijden', componentId: 5, hoeveelheid: 2, eenheid: 'kg', actiefMin: 9 }),
        );
        const { batches } = batch(taken, DAG, velden);
        expect(batches).toHaveLength(1);
        expect(batches[0].taken).toHaveLength(3);
        expect(batches[0].totaalHoeveelheid).toBe(6);
        /* 5 min opzetten + 2 min/kg × 6 kg = 17, tegenover 27 los. */
        expect(batches[0].actiefMin).toBe(17);
        expect(batches[0].reden).toContain('3×');
    });

    it('laat losse taken met rust', () => {
        const { batches } = batch([taak({ id: 1 }), taak({ id: 2 })], DAG, velden);
        expect(batches).toHaveLength(2);
        expect(batches.every((b) => b.taken.length === 1)).toBe(true);
    });
});

describe('verdeelOverLadingen — veertig kilo past niet in een smoker van twintig', () => {
    it('splitst op gewicht', () => {
        const groep = [1, 2, 3, 4].map((i) =>
            taak({ id: i, titel: `Brisket ${i}`, hoeveelheid: 12, eenheid: 'kg', apparaat: yoder }),
        );
        const { ladingen, problemen } = verdeelOverLadingen(groep);
        expect(ladingen.length).toBeGreaterThan(1);
        expect(ladingen.every((l) => l.reduce((a, t) => a + (t.hoeveelheid ?? 0), 0) <= 20 || l.length === 1)).toBe(true);
        expect(problemen.some((p) => p.soort === 'gesplitst')).toBe(true);
    });

    it('waarschuwt dat de eerste lading moet terugkoelen', () => {
        const groep = [1, 2, 3].map((i) => taak({ id: i, hoeveelheid: 12, apparaat: yoder }));
        const { problemen } = verdeelOverLadingen(groep);
        const gesplitst = problemen.find((p) => p.soort === 'gesplitst');
        expect(gesplitst?.tekst).toContain('terugkoelen');
    });

    it('splitst op aantal', () => {
        const groep = [1, 2, 3, 4, 5, 6].map((i) => taak({ id: i, hoeveelheid: 1, apparaat: yoder }));
        const { ladingen } = verdeelOverLadingen(groep);
        expect(ladingen.every((l) => l.length <= 4)).toBe(true);
    });

    it('meldt hard als één stuk al niet past — dat is geen batch-probleem', () => {
        const groep = [taak({ id: 1, titel: 'Brisket', hoeveelheid: 25, eenheid: 'kg', apparaat: yoder })];
        const { problemen } = verdeelOverLadingen(groep);
        expect(problemen.some((p) => p.soort === 'past_niet')).toBe(true);
    });

    it('batcht niet bij onbekende capaciteit — de veilige kant van de fout', () => {
        const groep = [1, 2, 3].map((i) => taak({ id: i, hoeveelheid: 2, apparaat: robotCoupe }));
        const { ladingen, problemen } = verdeelOverLadingen(groep);
        expect(ladingen).toHaveLength(3);
        expect(problemen.some((p) => p.soort === 'capaciteit_onbekend')).toBe(true);
    });
});

describe('oppervlak — bij een barbecue is plek de grens, niet gewicht', () => {
    /* De echte YS1500s: 9.677 cm² rooster, 60 kg belading. Twee briskets van
       6 kg passen qua gewicht ruim, en toch niet naast elkaar. */
    const grill: Apparaat = { ...yoder, concurrentJobs: null, capaciteitWaarde: 60, kookoppervlakCm2: 9677 };

    it('splitst op oppervlak terwijl het gewicht nog lang niet vol is', () => {
        const groep = [1, 2, 3].map((i) =>
            taak({ id: i, titel: `Brisket ${i}`, hoeveelheid: 6, eenheid: 'kg', oppervlakCm2: 4000, apparaat: grill }),
        );
        const { ladingen } = verdeelOverLadingen(groep);
        expect(ladingen).toHaveLength(2);
        expect(ladingen[0]).toHaveLength(2);
    });

    it('meldt hard als één stuk het hele rooster al niet haalt', () => {
        const groep = [taak({ id: 1, titel: 'Heel speenvarken', oppervlakCm2: 12000, apparaat: grill })];
        const { problemen } = verdeelOverLadingen(groep);
        const past = problemen.find((p) => p.soort === 'past_niet');
        expect(past?.tekst).toContain('cm² rooster');
    });

    it('rekent niet op oppervlak als dat onbekend is', () => {
        const groep = [1, 2].map((i) => taak({ id: i, hoeveelheid: 6, eenheid: 'kg', apparaat: grill }));
        expect(verdeelOverLadingen(groep).ladingen).toHaveLength(1);
    });
});

describe('gelijkmatig verdelen — 45 en 45, niet 60 en 30', () => {
    /* Een volle en een halfvolle smoker garen ongelijk, en dan smaakt de ene
       lading anders dan de andere. Gelijkmatig beladen is kwaliteit, geen
       netjesheid. */
    const grenzen = { maxAantal: null, maxGewicht: 60, maxOppervlak: null };

    it('verdeelt 90 kilo in twee gelijke ladingen', () => {
        /* Achttien procureurs van 5 kg. Greedy zou 60 en 30 doen; dit wordt
           45 en 45. */
        const stukken = Array.from({ length: 18 }, (_, i) =>
            taak({ id: i + 1, titel: `Procureur ${i + 1}`, hoeveelheid: 5, eenheid: 'kg' }),
        );
        const ladingen = verdeelGelijkmatig(stukken, grenzen);
        expect(ladingen).toHaveLength(2);
        const kilos = ladingen.map((l) => l.reduce((a, t) => a + (t.hoeveelheid ?? 0), 0));
        expect(kilos).toEqual([45, 45]);
    });

    it('komt zo dicht bij gelijk als de stukken toelaten', () => {
        /* Vijftien stukken van 6 kg is 90 kilo, maar 45 per lading zou 7,5
           stuk zijn. Je kunt geen halve procureur roken, dus 48/42 is het
           beste dat er in zit — en dat is nog steeds beter dan 60/30. */
        const stukken = Array.from({ length: 15 }, (_, i) => taak({ id: i + 1, hoeveelheid: 6 }));
        const kilos = verdeelGelijkmatig(stukken, grenzen)
            .map((l) => l.reduce((a, t) => a + (t.hoeveelheid ?? 0), 0))
            .sort((a, b) => b - a);
        expect(kilos).toEqual([48, 42]);
        expect(kilos[0] - kilos[1]).toBeLessThanOrEqual(6);   // hooguit één stuk verschil
    });

    it('gebruikt niet meer ladingen dan strikt nodig', () => {
        const stukken = Array.from({ length: 10 }, (_, i) => taak({ id: i + 1, hoeveelheid: 6 }));
        expect(verdeelGelijkmatig(stukken, grenzen)).toHaveLength(1);
    });

    it('blijft binnen de gewichtsgrens', () => {
        const stukken = Array.from({ length: 21 }, (_, i) => taak({ id: i + 1, hoeveelheid: 6 }));
        const ladingen = verdeelGelijkmatig(stukken, grenzen);
        for (const l of ladingen) {
            expect(l.reduce((a, t) => a + (t.hoeveelheid ?? 0), 0)).toBeLessThanOrEqual(60);
        }
    });

    it('legt grote stukken eerst zodat er geen scheve rest overblijft', () => {
        /* 40 + 3×10 = 70 kg bij een grens van 60. Greedy zou 40+10+10 = 60 en
           dan 10 doen; gelijkmatig maakt er 40 en 30 van. */
        const stukken = [
            taak({ id: 1, hoeveelheid: 40 }),
            taak({ id: 2, hoeveelheid: 10 }),
            taak({ id: 3, hoeveelheid: 10 }),
            taak({ id: 4, hoeveelheid: 10 }),
        ];
        const kilos = verdeelGelijkmatig(stukken, grenzen)
            .map((l) => l.reduce((a, t) => a + (t.hoeveelheid ?? 0), 0))
            .sort((a, b) => b - a);
        expect(kilos).toEqual([40, 30]);
    });

    it('splitst ook op oppervlak', () => {
        const stukken = Array.from({ length: 4 }, (_, i) => taak({ id: i + 1, oppervlakCm2: 3000 }));
        const ladingen = verdeelGelijkmatig(stukken, { maxAantal: null, maxGewicht: null, maxOppervlak: 9677 });
        expect(ladingen).toHaveLength(2);
        expect(ladingen[0]).toHaveLength(2);
    });

    it('laat een stuk dat nergens past in zijn eigen lading', () => {
        const stukken = [taak({ id: 1, hoeveelheid: 80 }), taak({ id: 2, hoeveelheid: 10 })];
        const ladingen = verdeelGelijkmatig(stukken, grenzen);
        expect(ladingen).toHaveLength(2);
    });
});

describe('meerijden — de temperatuurtoets die batchen niet nodig heeft', () => {
    const pulledBeef = taak({ id: 1, titel: 'Pulled beef', apparaat: yoder, tempDoelC: 120 });
    const oerham = taak({ id: 2, titel: 'Oerham', apparaat: yoder, tempDoelC: 120 });
    const ribs = taak({ id: 3, titel: 'Spareribs', apparaat: yoder, tempDoelC: 110 });

    it('laat gelijke temperaturen samen de smoker in', () => {
        expect(magMeerijden(pulledBeef, oerham)).toBe(true);
    });

    it('houdt ribs van 110 uit een pit van 120, hoeveel plek er ook is', () => {
        expect(magMeerijden(pulledBeef, ribs)).toBe(false);
    });

    it('groepeert per temperatuur', () => {
        const groepen = meerijders([pulledBeef, oerham, ribs]);
        expect(groepen).toHaveLength(2);
        expect(groepen[0].map((t) => t.id).sort()).toEqual([1, 2]);
        expect(groepen[1].map((t) => t.id)).toEqual([3]);
    });

    it('laat verschillende apparaten nooit meerijden', () => {
        const koud = taak({ id: 4, apparaat: robotCoupe, tempDoelC: 120 });
        expect(magMeerijden(pulledBeef, koud)).toBe(false);
    });

    it('rijdt niet mee als de temperatuur onbekend is', () => {
        const zonder = taak({ id: 5, apparaat: yoder, tempDoelC: null });
        expect(magMeerijden(pulledBeef, zonder)).toBe(false);
    });
});
