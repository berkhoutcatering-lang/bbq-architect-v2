import { describe, it, expect } from 'vitest';
import { dbEventToServiceEvent } from './serviceData';
import type { DbEvent, DbCourse, DbEventAllergy } from '@/types';

const baseEvent: DbEvent = {
    id: 9,
    name: 'Bruiloft Mariel',
    date: '2099-06-20',
    start_time: '17:00',
    end_time: '23:00',
    guests: 80,
    veg_guests: 5,
    vegan_guests: 2,
    gluten_free_guests: 1,
    location: 'Landgoed X',
    ppp: 45,
    status: 'confirmed',
    client_naam: 'Mariel',
    client_adres: '',
    client_tel: '',
    client_email: '',
    type: 'Bruiloft',
    notitie: 'Premium menu',
    menu: [],
    created_at: '',
};

const baseCourse: DbCourse = {
    id: 1,
    event_id: 9,
    num: 1,
    title: 'Voorgerecht',
    description: 'Soep',
    status: 'queued',
    emoji: '🥣',
    image_gradient: null,
    prep_time_minutes: 15,
    serve_offset_minutes: 30,
    veg_option: null,
    ai_note: null,
    steps: [{ n: 1, action: 'Soep opwarmen', detail: '70°C' }],
    mise: [{ item: 'Soep', qty: '4 L' }],
    plating: ['Bord links'],
    quality_checks: ['Heet'],
    items: [{ table: 1, count: 8 }, { table: 2, count: 8 }],
    organization_id: null,
    created_at: '',
    updated_at: '',
};

describe('dbEventToServiceEvent', () => {
    it('returnt null als er geen courses zijn voor het event', () => {
        const r = dbEventToServiceEvent(baseEvent, [], []);
        expect(r).toBeNull();
    });

    it('returnt null als courses van een ander event zijn', () => {
        const otherCourse = { ...baseCourse, event_id: 999 };
        const r = dbEventToServiceEvent(baseEvent, [otherCourse], []);
        expect(r).toBeNull();
    });

    it('mapt basis-velden correct', () => {
        const r = dbEventToServiceEvent(baseEvent, [baseCourse], []);
        expect(r).not.toBeNull();
        expect(r!.id).toBe('evt_db_9');
        expect(r!.title).toBe('Bruiloft Mariel');
        expect(r!.venue).toBe('Landgoed X');
        expect(r!.guests).toBe(80);
        expect(r!.vegGuests).toBe(5);
        expect(r!.veganGuests).toBe(2);
        expect(r!.glutenFreeGuests).toBe(1);
        expect(r!.startTime).toBe('17:00');
    });

    it('mapt course shape met defaults voor null-velden', () => {
        const r = dbEventToServiceEvent(baseEvent, [baseCourse], []);
        const c = r!.courses[0];
        expect(c.id).toBe('c_1');
        expect(c.num).toBe(1);
        expect(c.title).toBe('Voorgerecht');
        expect(c.emoji).toBe('🥣');
        expect(c.imgGradient).toMatch(/linear-gradient/);
        expect(c.prepTime).toBe(15);
        expect(c.serveTime).toBe(30);
        expect(c.steps).toHaveLength(1);
        expect(c.mise).toHaveLength(1);
        expect(c.items).toHaveLength(2);
    });

    it('sorteert courses op num', () => {
        const c1 = { ...baseCourse, id: 1, num: 3, title: 'Drie' };
        const c2 = { ...baseCourse, id: 2, num: 1, title: 'Een' };
        const c3 = { ...baseCourse, id: 3, num: 2, title: 'Twee' };
        const r = dbEventToServiceEvent(baseEvent, [c1, c2, c3], []);
        expect(r!.courses.map(c => c.title)).toEqual(['Een', 'Twee', 'Drie']);
    });

    it('hero + banner zijn type-afhankelijk', () => {
        const bruiloft = dbEventToServiceEvent({ ...baseEvent, type: 'Bruiloft' }, [baseCourse], []);
        expect(bruiloft!.hero).toBe('💍');

        const bedrijf = dbEventToServiceEvent({ ...baseEvent, type: 'Bedrijfsfeest' }, [baseCourse], []);
        expect(bedrijf!.hero).toBe('🏢');

        const verjaardag = dbEventToServiceEvent({ ...baseEvent, type: 'Verjaardag' }, [baseCourse], []);
        expect(verjaardag!.hero).toBe('🎂');

        const onbekend = dbEventToServiceEvent({ ...baseEvent, type: 'Onbekend' }, [baseCourse], []);
        expect(onbekend!.hero).toBe('🍽️'); /* default */
    });

    it('mapt allergie-rijen met sortering op tafel-nummer', () => {
        const allergies: DbEventAllergy[] = [
            { id: 1, event_id: 9, table_num: 5, seat_num: 2, name: 'Lars', allergens: ['N'], note: 'Notenallergie', severity: 'critical', organization_id: null, created_at: '' },
            { id: 2, event_id: 9, table_num: 1, seat_num: 1, name: 'Anna', allergens: ['G'], note: '', severity: 'normal', organization_id: null, created_at: '' },
        ];
        const r = dbEventToServiceEvent(baseEvent, [baseCourse], allergies);
        expect(r!.allergyTable.map(a => a.name)).toEqual(['Anna', 'Lars']);
        expect(r!.allergyTable[1].allergens).toEqual(['N']);
    });

    it('filtert allergieën van andere events', () => {
        const allergies: DbEventAllergy[] = [
            { id: 1, event_id: 999, table_num: 1, seat_num: 1, name: 'Andere', allergens: [], note: '', severity: 'normal', organization_id: null, created_at: '' },
        ];
        const r = dbEventToServiceEvent(baseEvent, [baseCourse], allergies);
        expect(r!.allergyTable).toEqual([]);
    });

    it('default startTime "17:00" als event geen start_time heeft', () => {
        const noTime = { ...baseEvent, start_time: null };
        const r = dbEventToServiceEvent(noTime, [baseCourse], []);
        expect(r!.startTime).toBe('17:00');
    });

    it('default 0 voor diet-counts als null', () => {
        const noDiets = { ...baseEvent, veg_guests: null, vegan_guests: null, gluten_free_guests: null };
        const r = dbEventToServiceEvent(noDiets, [baseCourse], []);
        expect(r!.vegGuests).toBe(0);
        expect(r!.veganGuests).toBe(0);
        expect(r!.glutenFreeGuests).toBe(0);
    });

    it('beschermt tegen non-array JSONB-velden in courses', () => {
        const broken: DbCourse = {
            ...baseCourse,
            steps: null as any,
            mise: 'string' as any,
            plating: null as any,
            quality_checks: undefined as any,
            items: null as any,
        };
        const r = dbEventToServiceEvent(baseEvent, [broken], []);
        const c = r!.courses[0];
        expect(c.steps).toEqual([]);
        expect(c.mise).toEqual([]);
        expect(c.plating).toEqual([]);
        expect(c.qualityChecks).toEqual([]);
        expect(c.items).toEqual([]);
    });
});
