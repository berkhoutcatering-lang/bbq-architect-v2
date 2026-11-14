import { describe, expect, it } from 'vitest';
import { maandSlot } from './maandslot';
import { filter, nepSupabase } from './nepSupabase';

const ORG = 'org-1';

describe('maandSlot', () => {
    it('dicht als de maand is afgesloten', async () => {
        const { sb, aanroepen } = nepSupabase(() => ({ data: [{ id: 'a1' }], error: null }));
        expect(await maandSlot(sb, ORG, '2026-11-27')).toBe('dicht');
        expect(filter(aanroepen[0], 'eq', 'organization_id')).toBe(ORG);
        expect(filter(aanroepen[0], 'eq', 'jaar')).toBe(2026);
        expect(filter(aanroepen[0], 'eq', 'maand')).toBe(11);
    });
    it('open als er geen afsluiting is', async () => {
        const { sb } = nepSupabase(() => ({ data: [], error: null }));
        expect(await maandSlot(sb, ORG, '2026-11-27')).toBe('open');
    });
    it('niet na te gaan bij een leesfout: dan is het niet "open"', async () => {
        const { sb } = nepSupabase(() => ({ data: null, error: { message: 'de verbinding viel weg' } }));
        expect(await maandSlot(sb, ORG, '2026-11-27')).toBe('onbekend');
    });
    it('de tabel bestaat nog niet: er valt niets af te sluiten, dus open', async () => {
        const { sb } = nepSupabase(() => ({ data: null, error: { message: 'relation does not exist', code: 'PGRST205' } }));
        expect(await maandSlot(sb, ORG, '2026-11-27')).toBe('open');
    });
});
