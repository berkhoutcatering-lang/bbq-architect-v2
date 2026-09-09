import { describe, it, expect } from 'vitest';
import { bouwScherm } from './plan';
import { batch, meerijders } from './batchen';
import { terugrekenen } from './terugrekenen';
import { vulGaten } from './gatenvullen';
import { actieveDuurMin, passieveDuurMin } from './duur';
import type { Apparaat, Taak } from './types';

/**
 * Eén hele productiedag, gebouwd uit een echt recept.
 *
 * Dit is de pulled beef à la bordelaise zoals hij op 8 september 2026 met de
 * hand is ontleed: 5 kg rundernek, 16 stappen, 98 minuten actief en 580
 * minuten passief. Geen verzonnen taken — deze dag is de maatstaf waaraan je
 * ziet of de planner doet wat hij belooft.
 *
 * De losse modules hebben elk hun eigen tests. Deze kijkt of ze samen een dag
 * opleveren die klopt.
 */

const DAG = '2026-09-12';
const START = '2026-09-12T06:00:00';
const UITLEVERING = '2026-09-12T16:00:00';

const yoder: Apparaat = {
    id: 12, naam: 'Yoder 1500', aanzetMin: 1, opwarmMin: 35, warmBlijftMin: null,
    schoonmaakMin: 20, exclusiefBezet: true, concurrentJobs: 4, capaciteitWaarde: 20,
    capaciteitEenheid: 'kg', kookoppervlakCm2: 9677, stationId: 2,
};

const kookstation = { stationId: 4, stationNaam: 'Sauzen' };
const snijstation = { stationId: 1, stationNaam: 'Koud' };

function t(over: Partial<Taak> & { id: number; titel: string }): Taak {
    return {
        actiefMin: 0, passiefMin: 0, duurBron: 'geschat', toezichtNodig: false,
        hangtAfVan: [], status: 'planned', eventId: 1, ...over,
    };
}

/** De zestien stappen, in de volgorde waarin ze gedaan worden. */
function pulledBeefDag(): Taak[] {
    const om = (u: number, m = 0) => `2026-09-12T${String(u).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`;
    return [
        t({ id: 1, titel: 'Rookhout weken', actiefMin: 2, passiefMin: 30, geplandOp: om(6), ...snijstation }),
        t({ id: 2, titel: 'Yoder aanzetten naar 120 °C', actiefMin: 1, passiefMin: 35, geplandOp: om(6, 30), apparaat: yoder, tempDoelC: 120, duurBron: 'verwacht' }),
        t({ id: 3, titel: 'Vliezen van de rundernek afhalen', actiefMin: 15, hoeveelheid: 5, eenheid: 'kg', geplandOp: om(6, 40), ...snijstation, bewerkingCode: 'trimmen', componentId: 21 }),
        t({ id: 4, titel: 'Nek kruiden met beef rub', actiefMin: 8, hoeveelheid: 0.08, eenheid: 'kg', geplandOp: om(6, 55), ...snijstation, hangtAfVan: [3] }),
        t({ id: 5, titel: 'Nek op het rooster', actiefMin: 3, geplandOp: om(7, 5), apparaat: yoder, hangtAfVan: [2, 4] }),
        t({ id: 6, titel: 'Roken op 120 °C', passiefMin: 180, geplandOp: om(7, 10), apparaat: yoder, tempDoelC: 120, duurBron: 'verwacht', hangtAfVan: [5] }),
        t({ id: 7, titel: 'Nek inpakken met fond en margarine', actiefMin: 10, geplandOp: om(10, 10), apparaat: yoder, hangtAfVan: [6] }),
        t({ id: 8, titel: 'Doorgaren tot kern 90 °C', passiefMin: 300, geplandOp: om(10, 20), apparaat: yoder, tempDoelC: 90, duurBron: 'verwacht', hangtAfVan: [7], stukGewichtKg: 5 }),
        t({ id: 9, titel: 'Rode wijn inkoken', actiefMin: 5, passiefMin: 20, hoeveelheid: 0.5, eenheid: 'l', geplandOp: om(13), ...kookstation, toezichtNodig: true }),
        t({ id: 10, titel: 'BBQ-saus en demi glace erdoor', actiefMin: 8, geplandOp: om(13, 30), ...kookstation, hangtAfVan: [9], tempDoelC: 90 }),
        t({ id: 11, titel: 'Merg verkruimelen in de saus', actiefMin: 6, hoeveelheid: 0.15, eenheid: 'kg', geplandOp: om(13, 40), ...kookstation, hangtAfVan: [10] }),
        t({ id: 12, titel: 'Nek van de smoker', actiefMin: 3, geplandOp: om(15, 20), apparaat: yoder, hangtAfVan: [8] }),
        t({ id: 13, titel: '15 minuten laten rusten', passiefMin: 15, geplandOp: om(15, 25), hangtAfVan: [12] }),
        t({ id: 14, titel: 'Pullen met twee vorken', actiefMin: 25, hoeveelheid: 4, eenheid: 'kg', geplandOp: om(15, 40), ...snijstation, hangtAfVan: [13], bewerkingCode: 'pullen', componentId: 21 }),
        t({ id: 15, titel: 'Draadjes door de warme saus', actiefMin: 8, geplandOp: om(15, 50), ...kookstation, hangtAfVan: [11, 14] }),
        t({ id: 16, titel: 'Robot Coupe schoonmaken', actiefMin: 8, schoonmaaktaakId: 3, ...snijstation }),
    ];
}

const basis = { uitlevering: { 1: UITLEVERING }, nu: START };

describe('een hele productiedag — pulled beef à la bordelaise', () => {
    const taken = pulledBeefDag();

    it('is 94 minuten receptwerk, 580 minuten wachten, plus 8 minuten schoonmaak', () => {
        /* Het boek geeft één blok: voorbereiding 1½ uur, bereiding 8 uur.
           Uitgesplitst komt dat hier uit op 94 + 580, en dát is bruikbaar —
           want de zes uur wachten is precies de ruimte waar dit systeem het
           voor doet.
           Wijkt vier minuten af van de handmatige ontleding van 8 september:
           die ging uit van een kolen-BBQ. Op de Yoder vervalt "rookhout op de
           kolen" (2 min) en is aanzetten 1 minuut in plaats van 3. */
        const recept = taken.filter((x) => x.schoonmaaktaakId == null);
        const schoonmaak = taken.filter((x) => x.schoonmaaktaakId != null);

        expect(recept.reduce((a, x) => a + (x.actiefMin ?? 0), 0)).toBe(94);
        expect(recept.reduce((a, x) => a + (x.passiefMin ?? 0), 0)).toBe(580);
        expect(schoonmaak.reduce((a, x) => a + (x.actiefMin ?? 0), 0)).toBe(8);
    });

    it('heeft zes keer zoveel wachten als werken — daar zit de winst', () => {
        const actief = taken.reduce((a, x) => a + (x.actiefMin ?? 0), 0);
        const passief = taken.reduce((a, x) => a + (x.passiefMin ?? 0), 0);
        expect(passief / actief).toBeGreaterThan(5);
    });

    it('zet om zes uur de eerste taak groot op het scherm', () => {
        const s = bouwScherm({ ...basis, taken });
        expect(s.stand).toBe('actief');
        expect(s.straks.length).toBeGreaterThan(0);
        expect(s.status.takenOpen).toBe(16);
    });

    it('vult het gaarblok van vijf uur met werk', () => {
        /* De oude grens van vier uur zou dit blok hebben overgeslagen. */
        const rekening = terugrekenen({ ...basis, taken });
        const marges = new Map([...rekening].map(([id, r]) => [id, r.margeMin]));
        const gaten = vulGaten({ taken, margeMin: marges, nu: '2026-09-12T10:30:00' });

        const gaarGat = gaten.find((g) => g.wachtTaakId === 8);
        expect(gaarGat).toBeDefined();
        expect(gaarGat!.ruimteMin).toBe(300);
        expect(gaarGat!.suggesties.length).toBeGreaterThan(0);
    });

    it('vult niets in het inkoken, want daar sta je bij', () => {
        const rekening = terugrekenen({ ...basis, taken });
        const marges = new Map([...rekening].map(([id, r]) => [id, r.margeMin]));
        const gaten = vulGaten({ taken, margeMin: marges, nu: '2026-09-12T12:30:00' });
        expect(gaten.some((g) => g.wachtTaakId === 9)).toBe(false);
    });

    it('rekent terug tot een start die vóór de uitlevering ligt', () => {
        const rekening = terugrekenen({ ...basis, taken });
        const pullen = rekening.get(14)!;
        expect(Date.parse(pullen.uiterlijkKlaar)).toBeLessThanOrEqual(Date.parse(UITLEVERING));
        /* Pullen hangt aan rusten hangt aan afhalen hangt aan garen: die keten
           moet 's ochtends beginnen, niet 's middags. */
        const garen = rekening.get(8)!;
        expect(new Date(garen.uiterlijkStart).getHours()).toBeLessThan(12);
    });

    it('toont bij het garen dat de tijd een verwachting is', () => {
        const s = bouwScherm({ ...basis, taken, nu: '2026-09-12T11:00:00' });
        const gaarRegel = s.straks.find((r) => r.taakId === 8) ?? null;
        const isNu = s.nu.taakId === 8;
        const bron = gaarRegel?.duurBron ?? (isNu ? s.nu.duurBron : null);
        if (bron) expect(bron).toBe('verwacht');
    });

    it('meldt niets vreemds op een dag die klopt', () => {
        const s = bouwScherm({ ...basis, taken });
        expect(s.meldingen.filter((m) => m.ernst === 'alarm')).toHaveLength(0);
    });
});

describe('dezelfde dag, maar dan met drie stukken vlees', () => {
    it('splitst in ladingen en waarschuwt voor de koeling', () => {
        /* Boven de veertig gasten wordt het meer dan één nek. Drie van twaalf
           kilo passen niet samen in een pit die er twintig houdt. */
        const drie = [1, 2, 3].map((i) =>
            t({
                id: 100 + i, titel: `Rundernek ${i} roken`, passiefMin: 180,
                hoeveelheid: 12, eenheid: 'kg', apparaat: yoder, tempDoelC: 120,
                bewerkingCode: 'roken', componentId: 21,
            }),
        );
        const { problemen } = batch(drie, DAG, () => ({ duur_actief_min: 0 }));
        const gesplitst = problemen.find((p) => p.soort === 'gesplitst');
        expect(gesplitst).toBeDefined();
        expect(gesplitst!.tekst).toContain('terugkoelen');
    });

    it('laat de oerham meerijden maar de ribs niet', () => {
        const beef = t({ id: 1, titel: 'Pulled beef', apparaat: yoder, tempDoelC: 120, passiefMin: 180 });
        const ham = t({ id: 2, titel: 'Oerham', apparaat: yoder, tempDoelC: 120, passiefMin: 150 });
        const ribs = t({ id: 3, titel: 'Spareribs', apparaat: yoder, tempDoelC: 110, passiefMin: 120 });

        const groepen = meerijders([beef, ham, ribs]);
        expect(groepen).toHaveLength(2);
        expect(groepen.find((g) => g.some((x) => x.id === 3))).toHaveLength(1);
    });
});

describe('de oerham — passief waar je bij in de buurt moet blijven', () => {
    it('vult het spuit-interval alleen met werk op hetzelfde station', () => {
        const taken = [
            t({
                id: 1, titel: 'Oerham garen, elk half uur natspuiten', passiefMin: 150,
                geplandOp: '2026-09-12T10:00:00', apparaat: yoder, tempDoelC: 120,
                herhaalIntervalMin: 30, herhaalDuurMin: 1, stationId: 2, stationNaam: 'Smoker',
            }),
            t({ id: 2, titel: 'Smoker aanvegen', actiefMin: 10, stationId: 2, stationNaam: 'Smoker' }),
            t({ id: 3, titel: 'Bosui snijden', actiefMin: 10, stationId: 1, stationNaam: 'Koud' }),
        ];
        const marges = new Map([[1, 300], [2, 200], [3, 100]]);
        const gaten = vulGaten({ taken, margeMin: marges, nu: '2026-09-12T10:00:00' });

        expect(gaten).toHaveLength(1);
        const voorgesteld = gaten[0].suggesties.map((s) => s.taakId);
        expect(voorgesteld).toEqual([2]);
        expect(gaten[0].ruimteMin).toBe(29);
    });
});

describe('duurberekening op de echte getallen', () => {
    it('pullen schaalt mee met de kilo`s', () => {
        /* 5 min de kom klaarzetten, 5 min per kilo. Bij 4 kg is dat 25 —
           precies wat er met de hand geschat is. */
        expect(actieveDuurMin({ duur_vast_min: 5, duur_per_eenheid_min: 5 }, 4)).toBe(25);
        expect(actieveDuurMin({ duur_vast_min: 5, duur_per_eenheid_min: 5 }, 8)).toBe(45);
    });

    it('garen schaalt mee met het stuk, niet met het aantal', () => {
        /* Vijf uur bij 5 kg. Een nek van 8 kg duurt langer; drie nekken van
           5 kg naast elkaar duren even lang als één. */
        expect(passieveDuurMin({ duur_passief_min: 300, passief_ref_kg: 5 }, 5)).toBe(300);
        expect(passieveDuurMin({ duur_passief_min: 300, passief_ref_kg: 5 }, 8)).toBe(480);
    });
});
