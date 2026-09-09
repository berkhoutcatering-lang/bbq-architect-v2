import { describe, it, expect } from 'vitest';
import { bouwScherm, restMin, herplanMelding, aandachtVanTaak, STRAKS_REGELS, MAX_MELDINGEN } from './plan';
import type { Apparaat, Taak } from './types';

const NU = '2026-09-12T10:00:00';
const UITLEVERING = '2026-09-12T16:00:00';

const yoder: Apparaat = {
    id: 12, naam: 'Yoder 1500', aanzetMin: 1, opwarmMin: 35, warmBlijftMin: null,
    schoonmaakMin: 20, exclusiefBezet: true, concurrentJobs: 4, capaciteitWaarde: 20,
    capaciteitEenheid: 'kg', kookoppervlakCm2: 9677, stationId: 2,
};

function taak(over: Partial<Taak> & { id: number }): Taak {
    return {
        titel: 'Taak', actiefMin: 10, passiefMin: 0, duurBron: 'geschat',
        toezichtNodig: false, hangtAfVan: [], status: 'planned', eventId: 1, ...over,
    };
}

const basis = { uitlevering: { 1: UITLEVERING }, nu: NU };

describe('bouwScherm — welk beeld je ziet', () => {
    it('toont de lopende taak groot en verplaatst hem nooit', () => {
        const taken = [
            taak({ id: 1, titel: 'Bavette trimmen', status: 'in_progress', gestartOp: '2026-09-12T09:54:00', hoeveelheid: 8, eenheid: 'kg', gerechtNaam: 'Gerookte bavette', actiefMin: 18 }),
            taak({ id: 2, titel: 'Iets veel urgenters', actiefMin: 300 }),
        ];
        const s = bouwScherm({ ...basis, taken });
        expect(s.stand).toBe('actief');
        expect(s.nu.kop).toBe('Bavette trimmen');
        expect(s.nu.regel).toBe('8 kg · Gerookte bavette');
        expect(s.nu.bezigSinds).not.toBeNull();
    });

    it('toont bij een passieve stap het werk in het gat, met het wachten klein ernaast', () => {
        const taken = [
            taak({ id: 1, titel: 'Doorgaren tot 90 °C', actiefMin: 0, passiefMin: 300, status: 'in_progress', geplandOp: NU, tempDoelC: 90, duurBron: 'verwacht' }),
            taak({ id: 2, titel: 'Sriracha mayo mengen', actiefMin: 20 }),
        ];
        const s = bouwScherm({ ...basis, taken });
        expect(s.stand).toBe('vrij');
        expect(s.nu.kop).toBe('Sriracha mayo mengen');
        expect(s.nu.wachtOp).toBe('Doorgaren tot 90 °C');
        expect(s.nu.wachtNog).not.toBeNull();
    });

    it('zegt het gewoon als er niets te doen is', () => {
        const s = bouwScherm({ ...basis, taken: [] });
        expect(s.stand).toBe('leeg');
        expect(s.nu.kop).toBe('Niets meer voor vandaag');
        expect(s.nu.taakId).toBeNull();
    });

    it('toont hooguit vijf regels onder STRAKS', () => {
        const taken = Array.from({ length: 12 }, (_, i) =>
            taak({ id: i + 1, titel: `Taak ${i + 1}`, geplandOp: `2026-09-12T1${i % 5}:00:00` }),
        );
        expect(bouwScherm({ ...basis, taken }).straks.length).toBeLessThanOrEqual(STRAKS_REGELS);
    });

    it('toont hooguit drie meldingen', () => {
        const taken = Array.from({ length: 8 }, (_, i) =>
            taak({ id: i + 1, actiefMin: null, passiefMin: null }),
        );
        expect(bouwScherm({ ...basis, taken }).meldingen.length).toBeLessThanOrEqual(MAX_MELDINGEN);
    });
});

describe('bouwScherm — eerlijk over wat er niet klopt', () => {
    it('meldt een onbekende duur in plaats van hem als nul te plannen', () => {
        const taken = [taak({ id: 1, titel: 'Karamel passeren', actiefMin: null, passiefMin: null })];
        const s = bouwScherm({ ...basis, taken });
        expect(s.meldingen.some((m) => m.kop.includes('Duur onbekend'))).toBe(true);
    });

    it('zegt dat looptijden nog niet meetellen zolang er niets opgemeten is', () => {
        const s = bouwScherm({ ...basis, taken: [taak({ id: 1 })], afstandenBekend: false });
        expect(s.meldingen.some((m) => m.id === 'afstanden-onbekend')).toBe(true);
    });

    it('zet een gesplitste lading om in een waarschuwing over koelruimte', () => {
        const s = bouwScherm({
            ...basis,
            taken: [taak({ id: 1 })],
            capaciteitsProblemen: [{
                soort: 'gesplitst', apparaatNaam: 'Yoder 1500',
                tekst: '2 ladingen. De eerste moet terugkoelen en weggezet worden.',
                taakIds: [1],
            }],
        });
        const melding = s.meldingen.find((m) => m.kop.includes('ladingen'));
        expect(melding?.ernst).toBe('waarschuwing');
        expect(melding?.verwacht).toContain('koelruimte');
    });

    it('maakt van een stuk dat niet past een alarm', () => {
        const s = bouwScherm({
            ...basis,
            taken: [taak({ id: 1 })],
            capaciteitsProblemen: [{
                soort: 'past_niet', apparaatNaam: 'Yoder 1500', tekst: 'Past niet.', taakIds: [1],
            }],
        });
        expect(s.meldingen[0].ernst).toBe('alarm');
    });
});

describe('restMin — de waarneming wint van de berekening', () => {
    it('rekent op het verwachte eind zolang er niets bevestigd is', () => {
        const t = taak({ id: 1, verwachtEind: '2026-09-12T10:40:00' });
        expect(restMin(t, Date.parse(NU))).toBe(40);
    });

    it('gebruikt het bevestigde eind zodra dat er is', () => {
        const t = taak({ id: 1, verwachtEind: '2026-09-12T10:40:00', bevestigdEind: '2026-09-12T11:20:00' });
        expect(restMin(t, Date.parse(NU))).toBe(80);
    });

    it('trekt de verstreken tijd af van een lopende taak', () => {
        const t = taak({ id: 1, actiefMin: 18, gestartOp: '2026-09-12T09:54:00' });
        expect(restMin(t, Date.parse(NU))).toBe(12);
    });

    it('geeft onbekend terug bij een onbekende duur', () => {
        expect(restMin(taak({ id: 1, actiefMin: null, passiefMin: null }), Date.parse(NU))).toBeNull();
    });
});

describe('herplanMelding — een herplanning moet zich melden', () => {
    it('zegt wat er gebeurde, wat het betekent en of het haalbaar blijft', () => {
        const m = herplanMelding({
            wat: 'Kern loopt achter — brisket zit op 68 °C, verwacht 40 minuten later',
            verschovenTaken: 3, haalbaar: true, uitleveringKlok: '16:00', spelingMin: 22,
        });
        expect(m.ernst).toBe('waarschuwing');
        expect(m.uitleg).toBe('3 taken verschoven.');
        expect(m.verwacht).toContain('blijft haalbaar');
        expect(m.verwacht).toContain('22m');
    });

    it('wordt een alarm als het niet meer haalbaar is', () => {
        const m = herplanMelding({ wat: 'Smoker uit', verschovenTaken: 5, haalbaar: false, uitleveringKlok: '16:00' });
        expect(m.ernst).toBe('alarm');
        expect(m.verwacht).toContain('niet gehaald');
    });
});

describe('aandachtVanTaak', () => {
    it('herkent de vier soorten', () => {
        expect(aandachtVanTaak(taak({ id: 1, actiefMin: 10 }))).toBe('actief');
        expect(aandachtVanTaak(taak({ id: 2, actiefMin: 0, passiefMin: 60 }))).toBe('passief_vrij');
        expect(aandachtVanTaak(taak({ id: 3, actiefMin: 0, passiefMin: 60, herhaalIntervalMin: 30, herhaalDuurMin: 1 }))).toBe('passief_gebonden');
        expect(aandachtVanTaak(taak({ id: 4, actiefMin: 0, passiefMin: 60, toezichtNodig: true }))).toBe('passief_bewaakt');
    });
});

describe('bouwScherm — de tijdlijn', () => {
    it('zet tijdkritisch werk op een vaste klok en schuifbaar werk op een duur', () => {
        const taken = [
            taak({ id: 1, titel: 'Nu bezig', status: 'in_progress' }),
            taak({ id: 2, titel: 'Yoder aan', geplandOp: '2026-09-12T11:30:00', apparaat: yoder, tempDoelC: 110 }),
            taak({ id: 3, titel: 'Mayo mengen', actiefMin: 20 }),
        ];
        const s = bouwScherm({ ...basis, taken });
        const vast = s.straks.find((r) => r.taakId === 2);
        const schuif = s.straks.find((r) => r.taakId === 3);
        expect(vast?.tijdIsVast).toBe(true);
        expect(vast?.tijd).toBe('11:30');
        expect(vast?.waar).toBe('Yoder 1500 · 110 °C');
        expect(schuif?.tijdIsVast).toBe(false);
        expect(schuif?.tijd).toBe('~ 20m');
    });
});
