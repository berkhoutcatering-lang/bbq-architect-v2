import { describe, it, expect } from 'vitest';
import { takenUitReceptuur, minutenNa, duurVanStap, type ReceptStap } from './uitReceptuur';

/**
 * De brug tussen receptuur en productiedag. Alles wordt achteruit gerekend
 * vanaf de uitlevering: een stap van zeven dagen pekelen duwt alles wat ervóór
 * komt een week naar voren, en dat is precies het getal dat je wilt zien.
 */

const UITLEVERING = '2026-09-18T16:00:00.000Z';

function stap(over: Partial<ReceptStap> & { id: string; step_order: number; tekst: string }): ReceptStap {
    return {
        component_id: null,
        componentNaam: null,
        bewerking_code: null,
        duur_actief_min: null,
        duur_passief_min: null,
        temp_doel_c: null,
        kern_temp_c: null,
        materieel_id: null,
        station_id: null,
        kunde: null,
        toezicht_nodig: null,
        herhaal_interval_min: null,
        herhaal_duur_min: null,
        hangt_af_van_stap_id: null,
        prep_group: null,
        plaats: null,
        ...over,
    };
}

describe('duurVanStap', () => {
    it('telt werk en wachten bij elkaar op', () => {
        expect(duurVanStap(stap({ id: 'a', step_order: 1, tekst: 'x', duur_actief_min: 5, duur_passief_min: 60 }))).toBe(65);
    });

    it('onbekend telt als nul, niet als een schatting', () => {
        expect(duurVanStap(stap({ id: 'a', step_order: 1, tekst: 'x' }))).toBe(0);
    });
});

describe('minutenNa — hoeveel er ná een stap nog moet gebeuren', () => {
    it('volgt de expliciete keten', () => {
        const stappen = [
            stap({ id: 'a', step_order: 1, tekst: 'eerst', duur_actief_min: 10 }),
            stap({ id: 'b', step_order: 2, tekst: 'dan', duur_passief_min: 60, hangt_af_van_stap_id: 'a' }),
            stap({ id: 'c', step_order: 3, tekst: 'laatst', duur_actief_min: 5, hangt_af_van_stap_id: 'b' }),
        ];
        const na = minutenNa(stappen);
        expect(na.get('c')).toBe(0);
        expect(na.get('b')).toBe(5);
        expect(na.get('a')).toBe(65);
    });

    it('valt terug op de volgorde als het recept geen keten invult', () => {
        /* Een recept dat zijn afhankelijkheden niet noemt is nog steeds een
           lijst die je van boven naar beneden afwerkt. */
        const stappen = [
            stap({ id: 'a', step_order: 1, tekst: 'eerst', duur_actief_min: 10 }),
            stap({ id: 'b', step_order: 2, tekst: 'dan', duur_actief_min: 20 }),
        ];
        expect(minutenNa(stappen).get('a')).toBe(20);
    });

    it('houdt de delen uit elkaar', () => {
        /* De ranchsaus en het gerecht zijn twee ketens; de saus hoeft niet te
           wachten op iets uit het gerecht. */
        const stappen = [
            stap({ id: 's1', step_order: 1, tekst: 'saus mengen', component_id: 7, duur_actief_min: 10 }),
            stap({ id: 's2', step_order: 2, tekst: 'saus afsmaken', component_id: 7, duur_actief_min: 5 }),
            stap({ id: 'g1', step_order: 3, tekst: 'kip kruiden', duur_actief_min: 8 }),
        ];
        const na = minutenNa(stappen);
        expect(na.get('s1')).toBe(5);
        /* s2 is de laatste van zijn eigen deel, dus er komt niets meer na. */
        expect(na.get('s2')).toBe(0);
        expect(na.get('g1')).toBe(0);
    });

    it('loopt niet vast op een recept dat naar zichzelf wijst', () => {
        const stappen = [
            stap({ id: 'a', step_order: 1, tekst: 'a', duur_actief_min: 10, hangt_af_van_stap_id: 'b' }),
            stap({ id: 'b', step_order: 2, tekst: 'b', duur_actief_min: 10, hangt_af_van_stap_id: 'a' }),
        ];
        expect(() => minutenNa(stappen)).not.toThrow();
    });
});

describe('takenUitReceptuur — achteruit vanaf de uitlevering', () => {
    it('zet de laatste stap op het eind en de rest ervoor', () => {
        const taken = takenUitReceptuur({
            gerechtId: 'g1',
            gerechtNaam: 'Pulled pork',
            uitlevering: UITLEVERING,
            stappen: [
                stap({ id: 'a', step_order: 1, tekst: 'Kruiden', duur_actief_min: 30 }),
                stap({ id: 'b', step_order: 2, tekst: 'Roken', duur_passief_min: 240, hangt_af_van_stap_id: 'a' }),
            ],
        });

        const roken = taken.find((t) => t.recipe_step_id === 'b')!;
        const kruiden = taken.find((t) => t.recipe_step_id === 'a')!;
        /* Roken duurt vier uur en is als laatste klaar om 16:00 → start 12:00. */
        expect(roken.scheduled_at).toBe('2026-09-18T12:00:00.000Z');
        /* Kruiden duurt een half uur en moet daarvoor klaar zijn → 11:30. */
        expect(kruiden.scheduled_at).toBe('2026-09-18T11:30:00.000Z');
    });

    it('een week pekelen duwt de hele keten een week naar voren', () => {
        /* De spiced maple bacon: zeven dagen pekelen, dan pas de rest. Dit is
           het getal waar het om gaat — wanneer moet je beginnen. */
        const taken = takenUitReceptuur({
            gerechtId: 'g1',
            gerechtNaam: 'Spiced maple bacon',
            uitlevering: UITLEVERING,
            stappen: [
                stap({ id: 'a', step_order: 1, tekst: 'Pekel maken', duur_actief_min: 20 }),
                stap({ id: 'b', step_order: 2, tekst: 'Zeven dagen pekelen', duur_passief_min: 10080, hangt_af_van_stap_id: 'a' }),
                stap({ id: 'c', step_order: 3, tekst: 'Roken', duur_passief_min: 240, hangt_af_van_stap_id: 'b' }),
            ],
        });

        const pekelMaken = taken.find((t) => t.recipe_step_id === 'a')!;
        expect(pekelMaken.scheduled_at).toBe('2026-09-11T11:40:00.000Z');
        expect(pekelMaken.dagen).toBe(7);
    });

    it('onbekende duren houden de volgorde overeind', () => {
        /* Alles nul: dan staat alles op de uitlevering, maar de prioriteit
           bewaart de volgorde zodat het bord hem goed toont. */
        const taken = takenUitReceptuur({
            gerechtId: 'g1',
            gerechtNaam: 'Panna cotta',
            uitlevering: UITLEVERING,
            stappen: [
                stap({ id: 'a', step_order: 1, tekst: 'Gelatine weken' }),
                stap({ id: 'b', step_order: 2, tekst: 'Room verwarmen' }),
            ],
        });
        expect(taken.every((t) => t.scheduled_at === UITLEVERING)).toBe(true);
        expect(taken.map((t) => t.priority)).toEqual([1, 2]);
    });

    it('zet het gerecht en het onderdeel in de tekst', () => {
        /* Op het bord staan straks taken van vier gerechten door elkaar, en
           "afspoelen" zegt dan niets. */
        const taken = takenUitReceptuur({
            gerechtId: 'g1',
            gerechtNaam: "Smokey's Chicken Sandwich",
            uitlevering: UITLEVERING,
            stappen: [
                stap({ id: 'a', step_order: 1, tekst: 'Mayonaise glad mengen', component_id: 7, componentNaam: 'Ranchsaus', duur_actief_min: 5 }),
            ],
        });
        expect(taken[0].text).toBe("Smokey's Chicken Sandwich — Ranchsaus — Mayonaise glad mengen");
    });

    it('markeert wat vooruit mag', () => {
        const taken = takenUitReceptuur({
            gerechtId: 'g1',
            gerechtNaam: 'Sandwich',
            uitlevering: UITLEVERING,
            magVooruit: new Set([7]),
            stappen: [
                stap({ id: 'a', step_order: 1, tekst: 'Saus', component_id: 7, duur_actief_min: 5 }),
                stap({ id: 'b', step_order: 2, tekst: 'Broodje beleggen', duur_actief_min: 3 }),
            ],
        });
        expect(taken.find((t) => t.recipe_step_id === 'a')!.magVooruit).toBe(true);
        expect(taken.find((t) => t.recipe_step_id === 'b')!.magVooruit).toBe(false);
    });

    it('een herhaling betekent erbij blijven', () => {
        /* Elk half uur natspuiten is geen vrije wachttijd; de planner mag daar
           geen ander werk in schuiven. */
        const taken = takenUitReceptuur({
            gerechtId: 'g1',
            gerechtNaam: 'Ribs',
            uitlevering: UITLEVERING,
            stappen: [
                stap({ id: 'a', step_order: 1, tekst: 'Roken en elk half uur spuiten', duur_passief_min: 120, herhaal_interval_min: 30 }),
            ],
        });
        expect(taken[0].toezicht_nodig).toBe(true);
    });

    it('geeft niets terug zonder stappen of zonder datum', () => {
        expect(takenUitReceptuur({ gerechtId: 'g', gerechtNaam: 'X', uitlevering: UITLEVERING, stappen: [] })).toEqual([]);
        expect(takenUitReceptuur({
            gerechtId: 'g', gerechtNaam: 'X', uitlevering: 'geen datum',
            stappen: [stap({ id: 'a', step_order: 1, tekst: 'iets' })],
        })).toEqual([]);
    });
});
