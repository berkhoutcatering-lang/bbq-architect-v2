import { describe, it, expect } from 'vitest';
import { bouwWerkvolgorde, formatMin } from './werkvolgorde';
import type { PrepTask } from '@/types/database.types';

/** Minimale taak-factory — alleen de velden die de motor leest. */
function taak(over: Partial<PrepTask> & { id: number }): PrepTask {
    return {
        event_id: 1,
        text: 'Taak',
        dagen: 0,
        done: false,
        status: 'planned',
        created_at: '2026-06-12T10:00:00Z',
        ...over,
    } as PrepTask;
}

describe('bouwWerkvolgorde — bundeling (Mathijs: "3 mayonaises, pot is toch open")', () => {
    it('bundelt taken met dezelfde batch_key over events heen, met som-hoeveelheid', () => {
        const blokken = bouwWerkvolgorde([
            taak({ id: 1, event_id: 1, text: 'Mayonaise — Sliders', batch_key: 'comp:5:2026-06-20', target_qty: 0.8, target_unit: 'l', duration_min: 25, scheduled_at: '2026-06-20T10:00:00Z' } as never),
            taak({ id: 2, event_id: 2, text: 'Mayonaise — Taco', batch_key: 'comp:5:2026-06-20', target_qty: 0.6, target_unit: 'l', duration_min: 25, scheduled_at: '2026-06-20T11:00:00Z' } as never),
            taak({ id: 3, event_id: 1, text: 'Bavette trimmen', scheduled_at: '2026-06-20T12:00:00Z', duration_min: 60 } as never),
        ]);
        const bundel = blokken.find((b) => b.key === 'batch:comp:5:2026-06-20');
        expect(bundel).toBeDefined();
        expect(bundel!.tasks.length).toBe(2);
        expect(bundel!.totalQty).toBe(1.4);
        expect(bundel!.totalUnit).toBe('l');
        expect(bundel!.eventIds.sort()).toEqual([1, 2]);
        expect(bundel!.bundelReden).toContain('één batch');
        // bundel-duur = 1x maken, niet 2x
        expect(bundel!.durationMin).toBe(25);
    });

    it('telt hoeveelheden NIET op bij verschillende eenheden (geen wilde som)', () => {
        const blokken = bouwWerkvolgorde([
            taak({ id: 1, text: 'Rub — A', batch_key: 'comp:9:2026-06-20', target_qty: 2, target_unit: 'kg', scheduled_at: '2026-06-20T08:00:00Z' } as never),
            taak({ id: 2, text: 'Rub — B', batch_key: 'comp:9:2026-06-20', target_qty: 500, target_unit: 'g', scheduled_at: '2026-06-20T08:00:00Z' } as never),
        ]);
        expect(blokken[0].totalQty).toBeNull();
    });

    it('laat done/skipped taken buiten de werkvolgorde', () => {
        const blokken = bouwWerkvolgorde([
            taak({ id: 1, text: 'Klaar ding', status: 'done', scheduled_at: '2026-06-20T08:00:00Z' }),
            taak({ id: 2, text: 'Open ding', scheduled_at: '2026-06-20T09:00:00Z' }),
        ]);
        expect(blokken.length).toBe(1);
        expect(blokken[0].titel).toBe('Open ding');
    });
});

describe('bouwWerkvolgorde — gat-vulling (Mathijs: "smoker 1,5u opwarmen → plan er werk in")', () => {
    it('vult een wacht-blok met actieve taken die er qua duur in passen', () => {
        const blokken = bouwWerkvolgorde([
            // smoke = passief wacht-blok van 90 min
            taak({ id: 1, text: 'Bavette — Hot-smoke', phase: 'smoke', duration_min: 90, scheduled_at: '2026-06-20T10:00:00Z' } as never),
            // actief werk dat erna gepland staat
            taak({ id: 2, text: 'Vlees voorbereiden', phase: 'koud', duration_min: 60, scheduled_at: '2026-06-20T11:00:00Z' } as never),
            taak({ id: 3, text: 'Dille-roomsaus', phase: 'warm', duration_min: 25, scheduled_at: '2026-06-20T12:00:00Z' } as never),
            // te groot voor het restant (90-60-25=5 over)
            taak({ id: 4, text: 'Groot project', phase: 'koud', duration_min: 80, scheduled_at: '2026-06-20T13:00:00Z' } as never),
        ]);
        const wacht = blokken.find((b) => b.isPassief)!;
        expect(wacht.ondertussen).toBeDefined();
        const titels = wacht.ondertussen!.map((s) => s.titel);
        expect(titels).toContain('Vlees voorbereiden');
        expect(titels).toContain('Dille-roomsaus');
        expect(titels).not.toContain('Groot project');
        expect(wacht.ondertussen![0].reden).toContain('wachttijd');
    });

    it('vult overnight-wachten (> 4 uur, bv. pekel) NIET — daar sta je niet bij', () => {
        const blokken = bouwWerkvolgorde([
            taak({ id: 1, text: 'Dry-cure overnight', phase: 'pekel', duration_min: 720, scheduled_at: '2026-06-20T03:00:00Z' } as never),
            taak({ id: 2, text: 'Saus', phase: 'warm', duration_min: 25, scheduled_at: '2026-06-20T10:00:00Z' } as never),
        ]);
        const wacht = blokken.find((b) => b.isPassief)!;
        expect(wacht.ondertussen ?? []).toEqual([]);
    });

    it('trekt geen werk van een ander dagdeel (> 6 uur verder) naar voren', () => {
        const blokken = bouwWerkvolgorde([
            taak({ id: 1, text: 'Smoke', phase: 'smoke', duration_min: 90, scheduled_at: '2026-06-20T10:00:00Z' } as never),
            // avondwerk, 8 uur later — hoort niet in een ochtend-wachtblok
            taak({ id: 2, text: 'Avondwerk', phase: 'koud', duration_min: 30, scheduled_at: '2026-06-20T18:00:00Z' } as never),
        ]);
        const wacht = blokken.find((b) => b.isPassief)!;
        expect(wacht.ondertussen ?? []).toEqual([]);
    });

    it('stelt werk dat vóór de wacht-start moet niet voor als vulling', () => {
        const blokken = bouwWerkvolgorde([
            taak({ id: 1, text: 'Smoke', phase: 'smoke', duration_min: 120, scheduled_at: '2026-06-20T10:00:00Z' } as never),
            taak({ id: 2, text: 'Eerder werk', phase: 'koud', duration_min: 30, scheduled_at: '2026-06-20T08:00:00Z' } as never),
        ]);
        const wacht = blokken.find((b) => b.isPassief)!;
        expect(wacht.ondertussen ?? []).toEqual([]);
    });

    it('claimt een actief blok maar één keer over meerdere wacht-blokken', () => {
        const blokken = bouwWerkvolgorde([
            taak({ id: 1, text: 'Smoke A', phase: 'smoke', duration_min: 60, scheduled_at: '2026-06-20T08:00:00Z' } as never),
            taak({ id: 2, text: 'Smoke B', phase: 'smoke', duration_min: 60, scheduled_at: '2026-06-20T10:00:00Z' } as never),
            taak({ id: 3, text: 'Saus', phase: 'warm', duration_min: 30, scheduled_at: '2026-06-20T11:00:00Z' } as never),
        ]);
        const passief = blokken.filter((b) => b.isPassief);
        const alleSuggesties = passief.flatMap((b) => b.ondertussen ?? []);
        expect(alleSuggesties.filter((s) => s.titel === 'Saus').length).toBe(1);
    });
});

describe('bouwWerkvolgorde — volgorde', () => {
    it('sorteert chronologisch, taken zonder tijd achteraan', () => {
        const blokken = bouwWerkvolgorde([
            taak({ id: 1, text: 'Later', scheduled_at: '2026-06-20T14:00:00Z' }),
            taak({ id: 2, text: 'Zonder tijd', scheduled_at: null } as never),
            taak({ id: 3, text: 'Eerst', scheduled_at: '2026-06-20T08:00:00Z' }),
        ]);
        expect(blokken.map((b) => b.titel)).toEqual(['Eerst', 'Later', 'Zonder tijd']);
    });
});

describe('formatMin', () => {
    it('formatteert minuten leesbaar', () => {
        expect(formatMin(45)).toBe('45 min');
        expect(formatMin(60)).toBe('1 uur');
        expect(formatMin(90)).toBe('1u30');
    });
});
