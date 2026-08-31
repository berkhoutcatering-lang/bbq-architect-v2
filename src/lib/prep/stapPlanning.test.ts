import { describe, it, expect } from 'vitest';
import {
    stapDuur,
    planStappenTerug,
    totalenPerPlaats,
    prepGroupBatchKey,
    faseVoorActie,
    normaliseerPlaats,
    type ReceptStap,
} from './stapPlanning';

function stap(over: Partial<ReceptStap> & { step_order: number }): ReceptStap {
    return {
        id: `stap-${over.step_order}`,
        tekst: 'Handeling',
        ...over,
    };
}

describe('stapDuur — handtijd los van wachttijd', () => {
    it('neemt beide duren over als het recept ze noemt', () => {
        const d = stapDuur(stap({ step_order: 1, duur_actief_min: 15, duur_passief_min: 45 }));
        expect(d.actiefMin).toBe(15);
        expect(d.passiefMin).toBe(45);
        expect(d.plaatsingMin).toBe(60);
        expect(d.bron).toBe('recept');
    });

    it('telt twaalf uur smoken niet als twaalf uur werk', () => {
        const d = stapDuur(stap({ step_order: 1, actie: 'smoken', duur_actief_min: 15, duur_passief_min: 720 }));
        expect(d.actiefMin).toBe(15);
        expect(d.passiefMin).toBe(720);
    });

    it('een enkel ingevuld veld is een volledig antwoord — nul wachttijd is een antwoord', () => {
        const d = stapDuur(stap({ step_order: 1, actie: 'snijden', duur_actief_min: 20 }));
        expect(d.bron).toBe('recept');
        expect(d.actiefMin).toBe(20);
        expect(d.passiefMin).toBeNull();
        expect(d.plaatsingMin).toBe(20);
    });

    it('verzint geen duur als de bron zweeg — de velden blijven leeg en de bron is schatting', () => {
        const d = stapDuur(stap({ step_order: 1, actie: 'snijden' }));
        expect(d.actiefMin).toBeNull();
        expect(d.passiefMin).toBeNull();
        expect(d.bron).toBe('schatting');
        /* Wel een plaatsingsduur, anders valt de stap samen met de volgende. */
        expect(d.plaatsingMin).toBeGreaterThan(0);
    });

    it('valt terug op een neutrale duur bij een onbekende actie', () => {
        const d = stapDuur(stap({ step_order: 1, actie: 'flamberen-met-gevoel' }));
        expect(d.bron).toBe('schatting');
        expect(d.plaatsingMin).toBeGreaterThan(0);
    });

    it('behandelt een stap die volgens het recept nul minuten duurt als één minuut', () => {
        const d = stapDuur(stap({ step_order: 1, duur_actief_min: 0, duur_passief_min: 0 }));
        expect(d.bron).toBe('recept');
        expect(d.plaatsingMin).toBe(1);
    });
});

describe('planStappenTerug — terugrekenen over de keten', () => {
    const eventStart = '2026-09-05T16:00:00.000Z';

    it('laat de laatste stap eindigen als de gasten eten', () => {
        const p = planStappenTerug([
            stap({ step_order: 1, actie: 'snijden', duur_actief_min: 30 }),
            stap({ step_order: 2, actie: 'afwerken', duur_actief_min: 15 }),
        ], eventStart);
        expect(p.stappen[1].eindISO).toBe(eventStart);
        expect(p.stappen[1].startISO).toBe('2026-09-05T15:45:00.000Z');
        expect(p.stappen[0].eindISO).toBe('2026-09-05T15:45:00.000Z');
        expect(p.stappen[0].startISO).toBe('2026-09-05T15:15:00.000Z');
        expect(p.doorlooptijdMin).toBe(45);
        expect(p.startISO).toBe('2026-09-05T15:15:00.000Z');
    });

    it('schuift de hele keten naar voren door wachttijd waar niemand bij staat', () => {
        const zonderRook = planStappenTerug([
            stap({ step_order: 1, actie: 'snijden', duur_actief_min: 30 }),
        ], eventStart);
        const metRook = planStappenTerug([
            stap({ step_order: 1, actie: 'smoken', duur_actief_min: 15, duur_passief_min: 12 * 60 }),
            stap({ step_order: 2, actie: 'snijden', duur_actief_min: 30 }),
        ], eventStart);
        /* 12u45 eerder beginnen, terwijl er maar 45 minuten handwerk in zit. */
        expect(metRook.doorlooptijdMin).toBe(12 * 60 + 45);
        expect(new Date(metRook.startISO).getTime())
            .toBeLessThan(new Date(zonderRook.startISO).getTime());
    });

    it('sorteert op step_order, ook als de rijen door elkaar binnenkomen', () => {
        const p = planStappenTerug([
            stap({ step_order: 3, tekst: 'Derde', duur_actief_min: 10 }),
            stap({ step_order: 1, tekst: 'Eerste', duur_actief_min: 10 }),
            stap({ step_order: 2, tekst: 'Tweede', duur_actief_min: 10 }),
        ], eventStart);
        expect(p.stappen.map((s) => s.stap.tekst)).toEqual(['Eerste', 'Tweede', 'Derde']);
    });

    it('telt hoeveel stappen op een schatting drijven', () => {
        const p = planStappenTerug([
            stap({ step_order: 1, actie: 'snijden', duur_actief_min: 10 }),
            stap({ step_order: 2, actie: 'snijden' }),
            stap({ step_order: 3, actie: 'afwerken' }),
        ], eventStart);
        expect(p.geschatteStappen).toBe(2);
        expect(p.stappen[0].duur.bron).toBe('recept');
        expect(p.stappen[1].duur.bron).toBe('schatting');
    });

    it('geeft een lege keten netjes terug in plaats van te crashen', () => {
        const p = planStappenTerug([], eventStart);
        expect(p.stappen).toEqual([]);
        expect(p.doorlooptijdMin).toBe(0);
        expect(p.startISO).toBe(eventStart);
    });
});

describe('totalenPerPlaats — thuis en op locatie zijn twee budgetten', () => {
    it('splitst handtijd en wachttijd per plaats', () => {
        const t = totalenPerPlaats([
            stap({ step_order: 1, plaats: 'thuis', duur_actief_min: 60, duur_passief_min: 720 }),
            stap({ step_order: 2, plaats: 'thuis', duur_actief_min: 30 }),
            stap({ step_order: 3, plaats: 'locatie', duur_actief_min: 25 }),
            stap({ step_order: 4, plaats: 'bus', duur_passief_min: 40 }),
        ]);
        expect(t.thuis.actiefMin).toBe(90);
        expect(t.thuis.passiefMin).toBe(720);
        expect(t.locatie.actiefMin).toBe(25);
        expect(t.bus.actiefMin).toBe(0);
        expect(t.bus.passiefMin).toBe(40);
    });

    it('telt onbekende duren apart in plaats van ze als nul mee te tellen', () => {
        const t = totalenPerPlaats([
            stap({ step_order: 1, plaats: 'locatie', duur_actief_min: 20 }),
            stap({ step_order: 2, plaats: 'locatie', actie: 'afwerken' }),
        ]);
        expect(t.locatie.actiefMin).toBe(20);
        expect(t.locatie.onbekend).toBe(1);
        expect(t.locatie.stappen).toBe(2);
    });

    it('rekent een onbekende plaats als thuis', () => {
        const t = totalenPerPlaats([stap({ step_order: 1, plaats: 'schuur', duur_actief_min: 10 })]);
        expect(t.thuis.actiefMin).toBe(10);
    });
});

describe('prepGroupBatchKey — bundelen binnen één werkdag', () => {
    it('maakt dezelfde sleutel voor dezelfde groep op dezelfde dag', () => {
        expect(prepGroupBatchKey('sjalot-brunoise', '2026-09-05'))
            .toBe(prepGroupBatchKey('Sjalot-Brunoise', '2026-09-05'));
    });

    it('bundelt niet over dagen heen — donderdag snipperen voor zaterdag is geen winst', () => {
        expect(prepGroupBatchKey('sjalot-brunoise', '2026-09-03'))
            .not.toBe(prepGroupBatchKey('sjalot-brunoise', '2026-09-05'));
    });

    it('geeft null als er geen groep is', () => {
        expect(prepGroupBatchKey(null, '2026-09-05')).toBeNull();
        expect(prepGroupBatchKey('  ', '2026-09-05')).toBeNull();
    });
});

describe('faseVoorActie en normaliseerPlaats', () => {
    it('vertaalt de acties van de ontleder naar bestaande prep-fases', () => {
        expect(faseVoorActie('smoken')).toBe('smoke');
        expect(faseVoorActie('marineren')).toBe('marinade');
        expect(faseVoorActie('afwerken')).toBe('plate');
        expect(faseVoorActie('snijden')).toBe('koud');
        expect(faseVoorActie(null)).toBe('other');
        expect(faseVoorActie('iets nieuws')).toBe('other');
    });

    it('accepteert alleen de drie plaatsen', () => {
        expect(normaliseerPlaats('locatie')).toBe('locatie');
        expect(normaliseerPlaats('BUS')).toBe('bus');
        expect(normaliseerPlaats(null)).toBe('thuis');
    });
});
