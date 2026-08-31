import { describe, it, expect } from 'vitest';
import { bouwWerkvolgorde, budgetPerPlaats, taakDuur, formatMin } from './werkvolgorde';
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

describe('taakDuur — handtijd los van wachttijd (golf 2)', () => {
    it('gebruikt de splitsing uit de receptstap als die er is', () => {
        const d = taakDuur(taak({ id: 1, duur_actief_min: 15, duur_passief_min: 720, phase: 'smoke' } as never));
        expect(d).toEqual({ actiefMin: 15, passiefMin: 720, bekend: true });
    });

    it('valt terug op de fase-naam voor taken van vóór golf 2', () => {
        expect(taakDuur(taak({ id: 1, phase: 'smoke', duration_min: 720 } as never)))
            .toEqual({ actiefMin: 0, passiefMin: 720, bekend: true });
        expect(taakDuur(taak({ id: 2, phase: 'koud', duration_min: 45 } as never)))
            .toEqual({ actiefMin: 45, passiefMin: 0, bekend: true });
    });

    it('meldt het eerlijk als niemand een duur heeft opgeschreven', () => {
        expect(taakDuur(taak({ id: 1 }))).toEqual({ actiefMin: 30, passiefMin: 0, bekend: false });
    });

    it('herkent wachten dat buiten de drie oude fases valt — deeg laten rijzen', () => {
        const blokken = bouwWerkvolgorde([
            taak({ id: 1, text: 'Deeg laten rijzen', phase: 'koud', duur_actief_min: 10, duur_passief_min: 120, scheduled_at: '2026-06-20T08:00:00Z' } as never),
        ]);
        /* Onder de oude fase-lijst was dit 130 minuten handwerk. */
        expect(blokken[0].isPassief).toBe(true);
        expect(blokken[0].passiefMin).toBe(120);
        expect(blokken[0].actiefMin).toBe(10);
    });
});

describe('bouwWerkvolgorde — gat-vulling kijkt naar handtijd, niet naar doorlooptijd', () => {
    it('vult een wachtmoment met een klus die lang duurt maar weinig werk is', () => {
        const blokken = bouwWerkvolgorde([
            taak({ id: 1, text: 'Smoker opstoken', duur_actief_min: 15, duur_passief_min: 60, scheduled_at: '2026-06-20T10:00:00Z' } as never),
            // 20 min werk, daarna 2 uur koelen — doorlooptijd 140 min, handtijd 20.
            taak({ id: 2, text: 'Panna cotta', duur_actief_min: 20, duur_passief_min: 120, scheduled_at: '2026-06-20T10:30:00Z' } as never),
        ]);
        const wacht = blokken.find((b) => b.titel === 'Smoker opstoken')!;
        /* Onder de oude logica paste 140 > 60 niet en bleef het wachtuur leeg. */
        expect(wacht.ondertussen).toBeUndefined();
    });

    it('vult met de handtijd van een puur actieve klus', () => {
        const blokken = bouwWerkvolgorde([
            taak({ id: 1, text: 'Smoker opstoken', duur_actief_min: 15, duur_passief_min: 60, scheduled_at: '2026-06-20T10:00:00Z' } as never),
            taak({ id: 2, text: 'Bosui snijden', duur_actief_min: 25, duur_passief_min: 0, scheduled_at: '2026-06-20T10:30:00Z' } as never),
        ]);
        const wacht = blokken.find((b) => b.titel === 'Smoker opstoken')!;
        expect(wacht.ondertussen?.[0].titel).toBe('Bosui snijden');
        expect(wacht.ondertussen?.[0].durationMin).toBe(25);
    });

    it('stelt werk op locatie niet voor tijdens wachten in de keuken thuis', () => {
        const blokken = bouwWerkvolgorde([
            taak({ id: 1, text: 'Jus laten trekken', plaats: 'thuis', duur_actief_min: 5, duur_passief_min: 90, scheduled_at: '2026-06-20T10:00:00Z' } as never),
            taak({ id: 2, text: 'Borden uitzetten', plaats: 'locatie', duur_actief_min: 30, scheduled_at: '2026-06-20T11:00:00Z' } as never),
        ]);
        expect(blokken.find((b) => b.titel === 'Jus laten trekken')!.ondertussen).toBeUndefined();
    });
});

describe('bouwWerkvolgorde — bundelen op prep_group (dezelfde bewerking, andere recepten)', () => {
    it('voegt dezelfde bewerking op dezelfde dag samen tot één blok', () => {
        const blokken = bouwWerkvolgorde([
            taak({ id: 1, text: 'Taco — snijd sjalot', prep_group: 'sjalot-brunoise', plaats: 'thuis', duur_actief_min: 10, scheduled_at: '2026-06-20T09:00:00Z' } as never),
            taak({ id: 2, text: 'Slider — snijd sjalot', prep_group: 'sjalot-brunoise', plaats: 'thuis', duur_actief_min: 10, scheduled_at: '2026-06-20T11:00:00Z' } as never),
        ]);
        expect(blokken.length).toBe(1);
        expect(blokken[0].titel).toBe('Sjalot-brunoise');
        expect(blokken[0].prepGroup).toBe('sjalot-brunoise');
        expect(blokken[0].tasks.length).toBe(2);
        expect(blokken[0].bundelReden).toContain('dezelfde bewerking');
        /* Eén keer het mes pakken, niet twee keer. */
        expect(blokken[0].actiefMin).toBe(10);
    });

    it('bundelt niet over dagen heen', () => {
        const blokken = bouwWerkvolgorde([
            taak({ id: 1, text: 'A', prep_group: 'sjalot-brunoise', scheduled_at: '2026-06-19T09:00:00Z' } as never),
            taak({ id: 2, text: 'B', prep_group: 'sjalot-brunoise', scheduled_at: '2026-06-20T09:00:00Z' } as never),
        ]);
        expect(blokken.length).toBe(2);
    });

    it('bundelt niet over plaatsen heen — thuis en op locatie zijn twee handelingen', () => {
        const blokken = bouwWerkvolgorde([
            taak({ id: 1, text: 'A', prep_group: 'bosui-julienne', plaats: 'thuis', scheduled_at: '2026-06-20T09:00:00Z' } as never),
            taak({ id: 2, text: 'B', prep_group: 'bosui-julienne', plaats: 'locatie', scheduled_at: '2026-06-20T15:00:00Z' } as never),
        ]);
        expect(blokken.length).toBe(2);
    });

    it('laat batch_key voorgaan op prep_group', () => {
        const blokken = bouwWerkvolgorde([
            taak({ id: 1, text: 'Mayo — A', batch_key: 'comp:5:2026-06-20', prep_group: 'mayo', scheduled_at: '2026-06-20T09:00:00Z' } as never),
            taak({ id: 2, text: 'Mayo — B', batch_key: 'comp:5:2026-06-20', prep_group: 'mayo', scheduled_at: '2026-06-20T10:00:00Z' } as never),
        ]);
        expect(blokken[0].key).toBe('batch:comp:5:2026-06-20');
        expect(blokken[0].prepGroup).toBeNull();
    });
});

describe('budgetPerPlaats — thuis en op locatie zijn twee budgetten', () => {
    it('telt handtijd en wachttijd per plaats apart', () => {
        const blokken = bouwWerkvolgorde([
            taak({ id: 1, text: 'Roken', plaats: 'thuis', duur_actief_min: 15, duur_passief_min: 720, scheduled_at: '2026-06-20T04:00:00Z' } as never),
            taak({ id: 2, text: 'Snijden', plaats: 'thuis', duur_actief_min: 45, scheduled_at: '2026-06-20T09:00:00Z' } as never),
            taak({ id: 3, text: 'Afwerken', plaats: 'locatie', duur_actief_min: 25, scheduled_at: '2026-06-20T15:30:00Z' } as never),
        ]);
        const b = budgetPerPlaats(blokken);
        expect(b.thuis.actiefMin).toBe(60);
        expect(b.thuis.passiefMin).toBe(720);
        expect(b.locatie.actiefMin).toBe(25);
        expect(b.bus.blokken).toBe(0);
    });

    it('telt taken zonder plaats bij geen enkel budget', () => {
        const blokken = bouwWerkvolgorde([
            taak({ id: 1, text: 'Oude taak', duration_min: 60, scheduled_at: '2026-06-20T09:00:00Z' } as never),
        ]);
        const b = budgetPerPlaats(blokken);
        expect(b.thuis.blokken).toBe(0);
        expect(b.thuis.actiefMin).toBe(0);
    });

    it('markeert blokken waarvan de duur een terugval is', () => {
        const blokken = bouwWerkvolgorde([
            taak({ id: 1, text: 'Zonder duur', plaats: 'thuis', scheduled_at: '2026-06-20T09:00:00Z' } as never),
        ]);
        expect(blokken[0].duurBekend).toBe(false);
        expect(budgetPerPlaats(blokken).thuis.geschat).toBe(1);
    });
});
