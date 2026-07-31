/* Ingrediënt-koppeling van een bouwsteen.
 *
 * De regressie die deze tests vastleggen: één ingrediënt zonder hoeveelheid
 * ("peper", geen gram) wiste de complete koppeling van dat component. De oude
 * volgorde was: eerst alle rijen weggooien, daarna één insert met álle regels —
 * inclusief die met hoeveelheid 0. De opslag weigert een hoeveelheid van nul,
 * dus de insert faalde in z'n geheel terwijl de delete al gebeurd was. Vanaf dat
 * moment rekende de bestellijst dat component als niets.
 */

import { describe, it, expect } from 'vitest';
import { syncComponentIngredients } from './componentIngredients';

type Row = Record<string, unknown>;

/* Minimale PostgREST-dubbel met de tafel-regel die er hier toe doet:
   quantity moet groter dan nul zijn, anders weigert de insert. */
function fakeSupabase(bestaand: Row[] = [], weigerNaam?: string) {
    const tabel: Row[] = [...bestaand];
    const log: Array<{ soort: 'delete' | 'insert'; aantal: number }> = [];

    function bouwer(naam: string) {
        const api: Record<string, unknown> = {};
        const zelf = () => api;
        api.select = zelf;
        api.eq = zelf;
        api.order = zelf;
        api.then = (resolve: (v: { data: Row[]; error: null }) => unknown) =>
            resolve({ data: naam === 'component_ingredients' ? [...tabel] : [], error: null });

        api.delete = () => ({
            eq: () => ({
                eq: () => {
                    log.push({ soort: 'delete', aantal: tabel.length });
                    tabel.length = 0;
                    return Promise.resolve({ error: null });
                },
            }),
        });

        api.insert = (payload: Row | Row[]) => {
            const rijen = Array.isArray(payload) ? payload : [payload];
            log.push({ soort: 'insert', aantal: rijen.length });
            const slecht = rijen.find((r) => !(Number(r.quantity) > 0) || (weigerNaam != null && r.fallback_name === weigerNaam));
            if (slecht) {
                return Promise.resolve({
                    error: { message: 'new row violates check constraint "component_ingredients_quantity_check"' },
                });
            }
            rijen.forEach((r) => tabel.push({ ...r }));
            return Promise.resolve({ error: null });
        };
        return api;
    }

    return { client: { from: (naam: string) => bouwer(naam) } as never, tabel, log };
}

const ORG = 'org-1';

describe('syncComponentIngredients — ingrediënt zonder hoeveelheid', () => {
    it('bewaart de goede ingrediënten en slaat alleen de regel zonder hoeveelheid over', async () => {
        const { client, tabel } = fakeSupabase([
            { id: 1, organization_id: ORG, component_id: 7, inventory_id: null, fallback_name: 'oud', quantity: 5, unit: 'g' },
        ]);

        const res = await syncComponentIngredients(client, ORG, 7, [
            { name: 'bavette', qty: 180, unit: 'g' },
            { name: 'peper' },                      // geen hoeveelheid
            { name: 'zeezout', qty: 4, unit: 'g' },
        ]);

        expect(tabel.map((r) => r.fallback_name)).toEqual(['bavette', 'zeezout']);
        expect(res.linked + res.unlinked).toBe(2);
        expect(res.overgeslagen).toEqual(['peper']);
        expect(res.error).toContain('peper');
    });

    it('laat de bestaande koppeling staan als élke regel een hoeveelheid mist', async () => {
        const { client, tabel } = fakeSupabase([
            { id: 1, organization_id: ORG, component_id: 7, inventory_id: null, fallback_name: 'bavette', quantity: 180, unit: 'g' },
        ]);

        const res = await syncComponentIngredients(client, ORG, 7, [{ name: 'peper' }]);

        /* "Ik weet de hoeveelheid nog niet" mag niet hetzelfde uitpakken als
           "er zitten geen ingrediënten in". */
        expect(tabel).toHaveLength(1);
        expect(tabel[0].fallback_name).toBe('bavette');
        expect(res.error).toContain('peper');
    });

    it('leegt de koppeling wél als de gebruiker echt alle ingrediënten weghaalt', async () => {
        const { client, tabel } = fakeSupabase([
            { id: 1, organization_id: ORG, component_id: 7, inventory_id: null, fallback_name: 'bavette', quantity: 180, unit: 'g' },
        ]);

        const res = await syncComponentIngredients(client, ORG, 7, []);

        expect(tabel).toHaveLength(0);
        expect(res.error).toBeUndefined();
    });

    it('zet de vorige lijst terug als het wegschrijven helemaal mislukt', async () => {
        /* De opslag weigert hier élke regel (bv. rechten of een andere
           tafel-regel). Dan is een leeg ingrediëntenlijstje het slechtste
           resultaat: de bestellijst zou dat component vanaf nu overslaan. */
        const { client, tabel } = fakeSupabase([
            { id: 1, organization_id: ORG, component_id: 7, inventory_id: null, fallback_name: 'bavette', quantity: 180, unit: 'g' },
        ], 'peper');

        const res = await syncComponentIngredients(client, ORG, 7, [{ name: 'peper', qty: 2, unit: 'g' }]);

        expect(res.error).toContain('teruggezet');
        expect(tabel).toHaveLength(1);
        expect(tabel[0].fallback_name).toBe('bavette');
    });

    it('slaat de goede regels wél op als één regel geweigerd wordt', async () => {
        const { client, tabel } = fakeSupabase([], 'peper');

        const res = await syncComponentIngredients(client, ORG, 7, [
            { name: 'bavette', qty: 180, unit: 'g' },
            { name: 'peper', qty: 2, unit: 'g' },
        ]);

        expect(tabel.map((r) => r.fallback_name)).toEqual(['bavette']);
        expect(res.linked + res.unlinked).toBe(1);
        expect(res.error).toContain('peper');
    });
});
