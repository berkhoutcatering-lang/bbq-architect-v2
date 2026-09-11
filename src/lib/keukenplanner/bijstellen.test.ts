import { describe, it, expect, vi } from 'vitest';
import { stelBij } from './bijstellen';

/**
 * Minimale nagebootste Supabase. Alleen de aanroepen die `stelBij` echt doet,
 * in dezelfde volgorde — genoeg om de leerlus te testen zonder database.
 */
function nepSupabase(opties: {
    metingen: Array<{ werkelijke_min: number; hoeveelheid?: number | null; stuk_gewicht_kg?: number | null }>;
    stappen: Array<{ id: string; duur_vast_min: number | null; duur_per_eenheid_min: number | null; duur_actief_min: number | null; duur_bron: string }>;
    periodeId?: number | null;
}) {
    const updates: Array<Record<string, unknown>> = [];

    const bouwer = (tabel: string) => {
        const ketting: Record<string, unknown> = {};
        const zelf = () => ketting;

        for (const naam of ['select', 'eq', 'is', 'neq', 'in', 'order', 'limit']) {
            ketting[naam] = vi.fn(() => zelf());
        }

        ketting.maybeSingle = vi.fn(async () => {
            if (tabel === 'meethistorie_periodes') {
                return { data: opties.periodeId === null ? null : { id: opties.periodeId ?? 1 }, error: null };
            }
            return { data: null, error: null };
        });

        /* Bij periodeId === null lukt ook het aanmaken niet — anders zou de
           test slagen omdat er alsnog een periode ontstaat, en dan test hij
           niets. */
        ketting.insert = vi.fn(() => ({
            select: () => ({
                maybeSingle: async () => opties.periodeId === null
                    ? { data: null, error: { message: 'geen periode' } }
                    : { data: { id: opties.periodeId ?? 1 }, error: null },
            }),
        }));

        ketting.update = vi.fn((patch: Record<string, unknown>) => {
            updates.push(patch);
            const na: Record<string, unknown> = {};
            for (const naam of ['eq', 'in', 'is', 'neq']) na[naam] = vi.fn(() => na);
            /* De laatste schakel wordt ge-await; die moet een thenable zijn. */
            na.then = (res: (v: unknown) => unknown) => Promise.resolve({ error: null }).then(res);
            return na;
        });

        /* De select-ketting wordt ge-await zonder maybeSingle: dan komt de lijst. */
        ketting.then = (res: (v: unknown) => unknown) => {
            const data = tabel === 'taakmetingen' ? opties.metingen : opties.stappen;
            return Promise.resolve({ data, error: null }).then(res);
        };

        return ketting;
    };

    return {
        klant: { from: vi.fn((tabel: string) => bouwer(tabel)) } as never,
        updates,
    };
}

const stap = (over: Partial<{ duur_vast_min: number | null; duur_bron: string }> = {}) => ({
    id: 'stap-1', duur_vast_min: 20, duur_per_eenheid_min: null, duur_actief_min: null,
    duur_bron: 'monitor', ...over,
});

describe('stelBij — de leerlus', () => {
    it('neemt een echte verandering over en zet het etiket op gemeten', async () => {
        const { klant, updates } = nepSupabase({
            /* Vijf metingen rond de 30 tegenover een opgeslagen 20: dat is
               ruim boven de drempel van tien procent. */
            metingen: [30, 31, 29, 30, 32].map((m) => ({ werkelijke_min: m })),
            stappen: [stap({ duur_vast_min: 20 })],
        });

        const uit = await stelBij(klant, 'org-1', 'snijden', 5);

        expect(uit.bijgesteld).toBe(true);
        expect(uit.stand).toBe('gemeten');
        expect(uit.nieuweDuurMin).toBe(30);
        expect(updates.at(-1)).toMatchObject({ duur_vast_min: 30, duur_bron: 'gemeten' });
    });

    it('laat de schatting staan als de afwijking onder de drempel blijft', async () => {
        const { klant, updates } = nepSupabase({
            metingen: [21, 20, 21, 20, 21].map((m) => ({ werkelijke_min: m })),
            stappen: [stap({ duur_vast_min: 20 })],
        });

        const uit = await stelBij(klant, 'org-1', 'snijden', 5);

        expect(uit.bijgesteld).toBe(false);
        expect(uit.reden).toContain('drempel');
        /* De vlag wordt wel bijgewerkt, de duur niet. */
        expect(updates.at(-1)).not.toHaveProperty('duur_vast_min');
    });

    it('splitst vast en per eenheid zodra de hoeveelheden uiteenlopen', async () => {
        const { klant, updates } = nepSupabase({
            metingen: [
                { werkelijke_min: 10, hoeveelheid: 1 },
                { werkelijke_min: 15, hoeveelheid: 2 },
                { werkelijke_min: 20, hoeveelheid: 3 },
                { werkelijke_min: 25, hoeveelheid: 4 },
                { werkelijke_min: 30, hoeveelheid: 5 },
            ],
            stappen: [stap({ duur_vast_min: 40 })],
        });

        await stelBij(klant, 'org-1', 'snijden', 5);

        const patch = updates.at(-1)!;
        expect(patch.duur_vast_min).toBe(5);
        expect(patch.duur_per_eenheid_min).toBeCloseTo(5, 1);
    });

    it('vlagt een stap waar te veel spreiding in zit', async () => {
        const { klant, updates } = nepSupabase({
            metingen: [5, 6, 7, 14, 6].map((m) => ({ werkelijke_min: m })),
            stappen: [stap({ duur_vast_min: 6 })],
        });

        const uit = await stelBij(klant, 'org-1', 'snijden', 5);

        expect(uit.splitsen).toBe(true);
        expect(updates.at(-1)).toMatchObject({ splitsen_gevlagd: true });
    });

    it('doet niets zonder metingen', async () => {
        const { klant } = nepSupabase({ metingen: [], stappen: [stap()] });
        const uit = await stelBij(klant, 'org-1', 'snijden', 5);
        expect(uit.bijgesteld).toBe(false);
        expect(uit.stand).toBe('geen');
    });

    it('leert niet op tijd bij een passieve gaarstap', async () => {
        const { klant } = nepSupabase({
            metingen: Array.from({ length: 12 }, (_, i) => ({ werkelijke_min: 300 + i, stuk_gewicht_kg: 5 })),
            stappen: [stap({ duur_vast_min: 300 })],
        });

        const uit = await stelBij(klant, 'org-1', 'roken', 9, { passief: true });

        expect(uit.bijgesteld).toBe(false);
        expect(uit.reden).toContain('verwachting');
    });

    it('valt zacht om als er geen meetperiode is', async () => {
        const { klant, updates } = nepSupabase({
            /* Metingen genoeg — het moet stuklopen op de ontbrekende periode
               en niet op een lege lijst, anders test dit niets. */
            metingen: [30, 31, 29, 30, 32].map((m) => ({ werkelijke_min: m })),
            stappen: [stap()],
            periodeId: null,
        });
        const uit = await stelBij(klant, 'org-1', 'snijden', 5);
        expect(uit.bijgesteld).toBe(false);
        expect(uit.reden).toContain('meetperiode');
        expect(updates).toHaveLength(0);
    });
});
