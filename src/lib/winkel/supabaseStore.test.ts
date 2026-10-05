/**
 * laadTenant: een fout van Supabase is geen onbekende winkel (keten-run 4 na
 * de reviews: 240 s lang 404 op beschikbaarheid, zonder iets in het log).
 * Tegen een nep-client: alleen de keten from().select().eq().maybeSingle().
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { haalBeschikbaarheid, type KassaContext } from './kassa';
import { maakSupabaseStore } from './supabaseStore';

type Antwoord = { data: unknown; error: { code?: string; message: string } | null };

function nepClient(perTabel: Record<string, Antwoord>): SupabaseClient {
    return {
        from(tabel: string) {
            const antwoord = perTabel[tabel] ?? { data: null, error: null };
            const keten = { select: () => keten, eq: () => keten, maybeSingle: async () => antwoord };
            return keten;
        },
    } as unknown as SupabaseClient;
}

describe('laadTenant (winkel, supabaseStore)', () => {
    it('een verbindingsfout gooit (geen null = geen "Onbekende winkel")', async () => {
        const store = maakSupabaseStore(nepClient({ organizations: { data: null, error: { code: '08006', message: 'connection refused' } } }));
        await expect(store.laadTenant('e2e-hop-en-bites')).rejects.toThrow(/organisatie lezen faalde: 08006 connection refused/);
    });

    it('een fout bij de instellingen gooit ook', async () => {
        const store = maakSupabaseStore(nepClient({
            organizations: { data: { id: 'org-1', slug: 'e2e-hop-en-bites' }, error: null },
            settings: { data: null, error: { message: 'timeout' } },
        }));
        await expect(store.laadTenant('e2e-hop-en-bites')).rejects.toThrow(/settings lezen faalde/);
    });

    it('echt onbekend blijft null; zonder instellingen de standaardnaam', async () => {
        expect(await maakSupabaseStore(nepClient({})).laadTenant('bestaat-niet')).toBeNull();
        const t = await maakSupabaseStore(nepClient({ organizations: { data: { id: 'org-1', slug: 'e2e-hop-en-bites' }, error: null } })).laadTenant('e2e-hop-en-bites');
        expect(t).toMatchObject({ orgId: 'org-1', slug: 'e2e-hop-en-bites', bedrijfsnaam: 'Hop & Bites' });
    });

    it('beschikbaarheid: verbindingsfout = 503 met een regel in het log, onbekend = 404', async () => {
        const log = vi.spyOn(console, 'error').mockImplementation(() => {});
        const ctx = (client: SupabaseClient) => ({ store: maakSupabaseStore(client), mypos: null, appUrl: 'http://localhost:3000' }) as unknown as KassaContext;
        const fout = await haalBeschikbaarheid(ctx(nepClient({ organizations: { data: null, error: { message: 'connection refused' } } })), 'e2e-hop-en-bites');
        expect(fout.status).toBe(503);
        expect(log).toHaveBeenCalled();
        const onbekend = await haalBeschikbaarheid(ctx(nepClient({})), 'bestaat-niet');
        expect(onbekend.status).toBe(404);
        log.mockRestore();
    });
});
