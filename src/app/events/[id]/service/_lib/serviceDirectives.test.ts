import { describe, it, expect } from 'vitest';
import { buildServiceDirectives } from './serviceDirectives';
import type { ServiceEvent, Course, AllergyEntry } from '../_types/service';

function makeCourse(overrides: Partial<Course> = {}): Course {
    return {
        id: 'c1',
        num: 1,
        title: 'Test Course',
        emoji: '🍽️',
        imgGradient: 'linear-gradient(135deg, #000, #fff)',
        prepTime: 10,
        serveTime: 0,
        status: 'queued',
        description: 'Test',
        mise: [],
        steps: [],
        plating: [],
        qualityChecks: [],
        items: [],
        ...overrides,
    };
}

function makeAllergy(overrides: Partial<AllergyEntry> = {}): AllergyEntry {
    return {
        table: 1,
        seat: 1,
        name: 'Test Gast',
        allergens: ['G'],
        note: 'Coeliakie',
        ...overrides,
    };
}

function makeEvent(overrides: Partial<ServiceEvent> = {}): ServiceEvent {
    return {
        id: 'ev1',
        date: 'Vandaag',
        title: 'Test Event',
        venue: 'Test Venue',
        guests: 10,
        vegGuests: 0,
        veganGuests: 0,
        glutenFreeGuests: 0,
        type: 'Test',
        package: 'Standard',
        status: 'live',
        startTime: '12:00',
        staff: ['MB'],
        hero: '🎉',
        banner: '',
        allergyTable: [],
        courses: [],
        ...overrides,
    };
}

describe('buildServiceDirectives', () => {
    it('lege array bij null event', () => {
        expect(buildServiceDirectives(null)).toEqual([]);
    });

    it('lege array bij event zonder courses en zonder allergieën', () => {
        const event = makeEvent({ courses: [], allergyTable: [] });
        expect(buildServiceDirectives(event)).toEqual([]);
    });

    it('CRITICAL directives voor allergieën bij actieve courses', () => {
        const event = makeEvent({
            courses: [makeCourse({ status: 'active' })],
            allergyTable: [
                makeAllergy({ table: 1, name: 'Tante Greet', allergens: ['N'], note: 'Notenallergie' }),
                makeAllergy({ table: 2, name: 'Sjoerd', allergens: ['G'], note: 'Coeliakie' }),
            ],
        });
        const directives = buildServiceDirectives(event);
        const critical = directives.filter(d => d.severity === 'critical');
        expect(critical.length).toBe(2);
        expect(critical[0].title).toContain('Tafel 1');
        expect(critical[0].title).toContain('Tante Greet');
        expect(critical[0].body).toContain('Noten');
    });

    it('GEEN allergie-directives als alle courses geserveerd zijn', () => {
        const event = makeEvent({
            courses: [makeCourse({ status: 'served' })],
            allergyTable: [makeAllergy()],
        });
        const directives = buildServiceDirectives(event);
        expect(directives.filter(d => d.severity === 'critical')).toEqual([]);
    });

    it('OPPORTUNITY directives uit course.aiNote', () => {
        const event = makeEvent({
            courses: [
                makeCourse({ id: 'c1', num: 1, title: 'Brood', status: 'queued', aiNote: 'Brood op tijd opwarmen' }),
                makeCourse({ id: 'c2', num: 2, title: 'Tartaar', status: 'active', aiNote: 'Tafel 4 lactosevrij' }),
            ],
        });
        const directives = buildServiceDirectives(event);
        const opportunity = directives.filter(d => d.severity === 'opportunity');
        expect(opportunity.length).toBe(2);
        expect(opportunity[0].title).toContain('Gang 1');
        expect(opportunity[0].body).toBe('Brood op tijd opwarmen');
        expect(opportunity[1].body).toBe('Tafel 4 lactosevrij');
    });

    it('GEEN opportunity-directive voor aiNote op served course', () => {
        const event = makeEvent({
            courses: [
                makeCourse({ status: 'served', aiNote: 'Was-belangrijk-maar-nu-niet-meer' }),
            ],
        });
        const directives = buildServiceDirectives(event);
        expect(directives.filter(d => d.severity === 'opportunity')).toEqual([]);
    });

    it('INFO directive met service-status', () => {
        const event = makeEvent({
            courses: [
                makeCourse({ id: 'c1', status: 'served' }),
                makeCourse({ id: 'c2', status: 'active' }),
                makeCourse({ id: 'c3', status: 'queued' }),
                makeCourse({ id: 'c4', status: 'queued' }),
            ],
        });
        const directives = buildServiceDirectives(event);
        const info = directives.filter(d => d.severity === 'info');
        expect(info.length).toBe(1);
        expect(info[0].title).toBe('Service 1/4');
        expect(info[0].body).toContain('1 gang in bereiding');
        expect(info[0].body).toContain('2 wachtend');
    });

    it('GEEN info-directive als alles geserveerd is', () => {
        const event = makeEvent({
            courses: [
                makeCourse({ status: 'served' }),
                makeCourse({ status: 'served' }),
            ],
        });
        const directives = buildServiceDirectives(event);
        expect(directives.filter(d => d.severity === 'info')).toEqual([]);
    });

    it('begrenst CRITICAL-directives op 3 (allergie-tabel cap)', () => {
        const allergies: AllergyEntry[] = Array.from({ length: 7 }, (_, i) =>
            makeAllergy({ table: i + 1, name: `Gast ${i + 1}` })
        );
        const event = makeEvent({
            courses: [makeCourse({ status: 'active' })],
            allergyTable: allergies,
        });
        const directives = buildServiceDirectives(event);
        const critical = directives.filter(d => d.severity === 'critical');
        expect(critical.length).toBe(3);
    });

    it('combineert alle types in juiste volgorde: critical → opportunity → info', () => {
        const event = makeEvent({
            courses: [
                makeCourse({ id: 'c1', status: 'active', aiNote: 'Note A' }),
                makeCourse({ id: 'c2', status: 'queued' }),
            ],
            allergyTable: [makeAllergy()],
        });
        const directives = buildServiceDirectives(event);
        expect(directives.length).toBeGreaterThan(0);
        expect(directives[0].severity).toBe('critical');
        // Laatste = info (status-summary)
        expect(directives[directives.length - 1].severity).toBe('info');
    });
});
