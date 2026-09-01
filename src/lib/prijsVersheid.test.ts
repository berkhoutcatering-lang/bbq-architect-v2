import { describe, it, expect } from 'vitest';
import {
    beoordeelVersheid, leeftijdTekst, syncVastgelopen, scanOverzicht,
    VERS_DAGEN, OUD_DAGEN,
} from './prijsVersheid';

/* Vaste peildatum: 1 september 2026, de dag dat dit gemeten is. */
const NU = new Date('2026-09-01T12:00:00Z');

describe('beoordeelVersheid — sluit aan op scrapen elke twee à drie weken', () => {
    it('een scan van vandaag is vers', () => {
        const o = beoordeelVersheid('2026-09-01T08:00:00Z', NU);
        expect(o.stand).toBe('vers');
        expect(o.toeAanScan).toBe(false);
    });

    it('dertien dagen is nog vers, veertien wordt oud', () => {
        expect(beoordeelVersheid('2026-08-19T12:00:00Z', NU).stand).toBe('vers');
        expect(beoordeelVersheid('2026-08-18T12:00:00Z', NU).stand).toBe('wordt-oud');
    });

    it('vanaf drie weken is het tijd voor een nieuwe scan', () => {
        const o = beoordeelVersheid('2026-08-11T12:00:00Z', NU);
        expect(o.dagen).toBe(OUD_DAGEN);
        expect(o.stand).toBe('oud');
        expect(o.toeAanScan).toBe(true);
    });

    it('nooit gescand telt als toe aan een scan', () => {
        const o = beoordeelVersheid(null, NU);
        expect(o.stand).toBe('nooit');
        expect(o.toeAanScan).toBe(true);
        expect(o.tekst).toBe('nog nooit gescand');
    });

    it('rekent een onleesbare datum niet stiekem als vers', () => {
        expect(beoordeelVersheid('zomaar wat', NU).toeAanScan).toBe(true);
    });
});

describe('de echte stand van 1 september 2026', () => {
    /* Precies de leveranciers zoals ze er die dag bij stonden. */
    it.each([
        ['Bidfood', '2026-07-31T07:30:27Z', 'oud', 32],
        ['Baktotaal', '2026-07-23T21:02:33Z', 'oud', 39],
        ['Sligro', '2026-06-01T18:23:13Z', 'oud', 91],
        ['Makro', '2026-05-09T09:14:09Z', 'oud', 115],
        ['Vuur & Rook', '2026-05-04T09:52:01Z', 'oud', 120],
    ])('%s was %s dagen oud', (_naam, iso, stand, dagen) => {
        const o = beoordeelVersheid(String(iso), NU);
        expect(o.stand).toBe(stand);
        expect(o.dagen).toBe(Number(dagen));
    });

    it('geen enkele leverancier stond er die dag goed voor', () => {
        const lijst = [
            { last_sync_at: '2026-07-31T07:30:27Z', products_count: 7575 },
            { last_sync_at: '2026-07-23T21:02:33Z', products_count: 181 },
            { last_sync_at: '2026-06-01T18:23:13Z', products_count: 2833 },
            { last_sync_at: '2026-05-09T09:14:09Z', products_count: 157 },
            { last_sync_at: '2026-05-04T09:52:01Z', products_count: 243, last_sync_status: 'running' },
        ];
        const o = scanOverzicht(lijst, NU);
        expect(o.toeAanScan).toBe(5);
        expect(o.oudsteDagen).toBe(120);
        expect(o.vastgelopen).toBe(1);
    });

    it('telt lege leveranciers niet als achterstand', () => {
        const o = scanOverzicht([
            { last_sync_at: null, products_count: 0 },
            { last_sync_at: null, products_count: null },
        ], NU);
        expect(o.toeAanScan).toBe(0);
        expect(o.oudsteDagen).toBeNull();
    });
});

describe('syncVastgelopen — een spinner die vier maanden draait', () => {
    it('herkent Vuur & Rook: sinds 4 mei op running', () => {
        expect(syncVastgelopen('running', '2026-05-04T09:52:01Z', NU)).toBe(true);
    });

    it('laat een scan die net begon met rust', () => {
        expect(syncVastgelopen('running', '2026-09-01T11:30:00Z', NU)).toBe(false);
    });

    it('zegt niets over een status die niet running is', () => {
        expect(syncVastgelopen('completed', '2026-05-04T09:52:01Z', NU)).toBe(false);
        expect(syncVastgelopen('partial', '2026-01-01T00:00:00Z', NU)).toBe(false);
        expect(syncVastgelopen(null, null, NU)).toBe(false);
    });
});

describe('leeftijdTekst — dagen die je niet hoeft om te rekenen', () => {
    it.each([
        [0, 'vandaag bijgewerkt'],
        [1, 'gisteren bijgewerkt'],
        [9, '9 dagen oud'],
        [21, '3 weken oud'],
        [39, '6 weken oud'],
        [91, '3 maanden oud'],
        [120, '4 maanden oud'],
        [136, 'ruim 4 maanden oud'],
    ])('%i dagen → %s', (dagen, verwacht) => {
        expect(leeftijdTekst(Number(dagen))).toBe(verwacht);
    });

    it('gebruikt weken zodra dagen gaan tellen', () => {
        expect(leeftijdTekst(VERS_DAGEN)).toBe('2 weken oud');
    });
});
