import { describe, it, expect } from 'vitest';
import { vulGaten, magSchoonmaken } from './gatenvullen';
import type { Taak } from './types';

/* 10:00 lokale tijd — het gatenvullen kijkt naar het uur van de dag, dus de
   tests gebruiken bewust lokale tijden en geen UTC-Z. */
const NU = '2026-09-12T10:00:00';

function taak(over: Partial<Taak> & { id: number }): Taak {
    return {
        titel: 'Taak', actiefMin: 0, passiefMin: 0, duurBron: 'geschat',
        toezichtNodig: false, hangtAfVan: [], status: 'planned', ...over,
    };
}

const marges = (paren: Array<[number, number]>) => new Map(paren);

describe('vulGaten — een oventaak krijgt werk in het gat', () => {
    it('zet een actieve taak in een passief blok', () => {
        const taken = [
            taak({ id: 1, titel: 'Ananas in de oven', passiefMin: 10, geplandOp: `${NU}` }),
            taak({ id: 2, titel: 'Robot Coupe schoonmaken', actiefMin: 8 }),
        ];
        const gaten = vulGaten({ taken, margeMin: marges([[1, 300], [2, 200]]), nu: NU });
        expect(gaten).toHaveLength(1);
        expect(gaten[0].suggesties[0].taakId).toBe(2);
        expect(gaten[0].suggesties[0].reden).toContain('past in de');
    });

    it('vult een gat van vijf uur — de oude grens van vier uur is vervallen', () => {
        /* Bij een gaarstap van vijf uur midden op de dag sta je erbij. */
        const taken = [
            taak({ id: 1, titel: 'Doorgaren tot 90 °C', passiefMin: 300, geplandOp: `${NU}` }),
            taak({ id: 2, titel: 'Sriracha mayo mengen', actiefMin: 20 }),
        ];
        const gaten = vulGaten({ taken, margeMin: marges([[1, 400], [2, 300]]), nu: NU });
        expect(gaten[0].suggesties.map((s) => s.taakId)).toContain(2);
    });

    it('stopt met vullen als het gat vol is', () => {
        const taken = [
            taak({ id: 1, passiefMin: 20, geplandOp: `${NU}` }),
            taak({ id: 2, titel: 'A', actiefMin: 15 }),
            taak({ id: 3, titel: 'B', actiefMin: 15 }),
        ];
        const gaten = vulGaten({ taken, margeMin: marges([[1, 300], [2, 100], [3, 200]]), nu: NU });
        expect(gaten[0].suggesties).toHaveLength(1);
        expect(gaten[0].suggesties[0].taakId).toBe(2);
    });

    it('stelt dezelfde taak nooit twee keer voor', () => {
        const taken = [
            taak({ id: 1, passiefMin: 60, geplandOp: `${NU}` }),
            taak({ id: 2, passiefMin: 60, geplandOp: '2026-09-12T11:30:00' }),
            taak({ id: 3, titel: 'Mayo', actiefMin: 20 }),
        ];
        const gaten = vulGaten({ taken, margeMin: marges([[1, 300], [2, 300], [3, 100]]), nu: NU });
        const alle = gaten.flatMap((g) => g.suggesties.map((s) => s.taakId));
        expect(alle.filter((id) => id === 3)).toHaveLength(1);
    });
});

describe('vulGaten — passief betekent niet altijd weglopen', () => {
    it('vult bij natspuiten alleen met kort werk op hetzelfde station', () => {
        const taken = [
            taak({
                id: 1, titel: 'Oerham garen', passiefMin: 150, geplandOp: `${NU}`,
                herhaalIntervalMin: 30, herhaalDuurMin: 1, stationId: 2,
            }),
            taak({ id: 2, titel: 'Smoker aanvegen', actiefMin: 10, stationId: 2 }),
            taak({ id: 3, titel: 'Bosui snijden', actiefMin: 10, stationId: 1 }),
        ];
        const gaten = vulGaten({ taken, margeMin: marges([[1, 300], [2, 200], [3, 100]]), nu: NU });
        const voorgesteld = gaten[0].suggesties.map((s) => s.taakId);
        expect(voorgesteld).toContain(2);
        /* De bosui staat aan de andere kant van de keuken — dan mis je je
           spuitbeurt, hoe krap zijn deadline ook is. */
        expect(voorgesteld).not.toContain(3);
        expect(gaten[0].gebondenAanStationId).toBe(2);
    });

    it('vult niets bij een bewaakte stap', () => {
        const taken = [
            taak({ id: 1, passiefMin: 120, geplandOp: `${NU}`, toezichtNodig: true }),
            taak({ id: 2, actiefMin: 10 }),
        ];
        expect(vulGaten({ taken, margeMin: marges([[1, 300], [2, 100]]), nu: NU })).toHaveLength(0);
    });

    it('houdt de vrije ruimte binnen het interval', () => {
        const taken = [
            taak({
                id: 1, passiefMin: 150, geplandOp: `${NU}`,
                herhaalIntervalMin: 30, herhaalDuurMin: 1, stationId: 2,
            }),
            taak({ id: 2, titel: 'Lange klus', actiefMin: 45, stationId: 2 }),
        ];
        const gaten = vulGaten({ taken, margeMin: marges([[1, 300], [2, 100]]), nu: NU });
        /* 45 minuten past niet tussen twee spuitbeurten van 30. */
        expect(gaten).toHaveLength(0);
    });
});

describe('vulGaten — nooit ten koste van een deadline', () => {
    it('trekt niets naar voren dat daardoor te laat komt', () => {
        const taken = [
            taak({ id: 1, passiefMin: 60, geplandOp: `${NU}` }),
            taak({ id: 2, titel: 'Al te laat', actiefMin: 10 }),
        ];
        const gaten = vulGaten({ taken, margeMin: marges([[1, 300], [2, -30]]), nu: NU });
        expect(gaten).toHaveLength(0);
    });

    it('slaat een blok buiten de werkdag over', () => {
        const taken = [
            taak({ id: 1, titel: 'Pekel', passiefMin: 600, geplandOp: '2026-09-12T23:30:00' }),
            taak({ id: 2, actiefMin: 10 }),
        ];
        expect(vulGaten({ taken, margeMin: marges([[1, 300], [2, 100]]), nu: NU })).toHaveLength(0);
    });
});

describe('magSchoonmaken', () => {
    it('mag als het apparaat die dag niet meer nodig is', () => {
        expect(magSchoonmaken(8, 20, null)).toBe(true);
    });
    it('mag als het binnen het gat past vóór het volgende gebruik', () => {
        expect(magSchoonmaken(8, 20, 15)).toBe(true);
    });
    it('mag niet als het apparaat te snel weer nodig is', () => {
        expect(magSchoonmaken(20, 60, 10)).toBe(false);
    });
    it('mag niet als het niet in het gat past', () => {
        expect(magSchoonmaken(20, 10, null)).toBe(false);
    });
});
