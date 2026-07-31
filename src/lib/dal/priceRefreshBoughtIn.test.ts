/* Prijs-verversing voor INKOOP-componenten, uit beide catalogi.
 *
 * De regressie die deze test vastlegt: een inkoop-component die aan de
 * PRIJSLIJST hangt (master_product_id) werd door niemand ververst.
 * refreshRecipePrices pakt alleen type='prepared', en refreshBoughtInPrices
 * filterde op `supplier_product_id is not null`. Het bewerk-scherm beloofde
 * ondertussen wél dat de prijs meebeweegt.
 *
 * Tweede regressie: volgen op het opgeslagen supplier_price_id werkt niet. Een
 * prijswijziging zet de oude regel op actief=false en voegt een NIEUWE toe, dus
 * dat id wijst per definitie naar een bevroren prijs. We resolven op
 * master_product_id → nieuwste actieve regel.
 */

import { describe, it, expect } from 'vitest';
import { refreshBoughtInPrices } from './priceRefreshBoughtIn';

type Row = Record<string, unknown>;

/* Minimale PostgREST-dubbel: onthoudt per tabel welke rijen er zijn en welke
   updates er gedaan zijn. Alleen de filters die deze functie gebruikt. */
function fakeSupabase(tabellen: Record<string, Row[]>) {
    const updates: Array<{ tabel: string; id: unknown; patch: Row }> = [];

    function bouwer(tabel: string) {
        let rijen = [...(tabellen[tabel] ?? [])];
        const api: Record<string, unknown> = {};
        const zelf = () => api;

        api.select = zelf;
        api.order = zelf;
        api.eq = (kolom: string, waarde: unknown) => {
            rijen = rijen.filter(r => r[kolom] === waarde);
            return api;
        };
        api.in = (kolom: string, waarden: unknown[]) => {
            rijen = rijen.filter(r => waarden.includes(r[kolom]));
            return api;
        };
        api.not = (kolom: string, _op: string, _waarde: unknown) => {
            rijen = rijen.filter(r => r[kolom] != null);
            return api;
        };
        /* `.or('a.not.is.null,b.not.is.null')` — enige vorm die we gebruiken. */
        api.or = (expr: string) => {
            const kolommen = expr.split(',').map(deel => deel.split('.')[0]);
            rijen = rijen.filter(r => kolommen.some(k => r[k] != null));
            return api;
        };
        api.update = (patch: Row) => ({
            eq: (kolom: string, waarde: unknown) => {
                if (kolom === 'id') {
                    updates.push({ tabel, id: waarde, patch });
                    return { eq: () => Promise.resolve({ error: null }) };
                }
                return { eq: () => Promise.resolve({ error: null }) };
            },
        });
        api.then = (resolve: (v: { data: Row[]; error: null }) => unknown) =>
            resolve({ data: rijen, error: null });
        return api;
    }

    return {
        client: { from: (tabel: string) => bouwer(tabel) } as never,
        updates,
    };
}

const ORG = 'org-1';

describe('refreshBoughtInPrices — prijslijst-koppeling (Catalogus A)', () => {
    it('ververst een inkoop-component die aan de prijslijst hangt', async () => {
        const { client, updates } = fakeSupabase({
            components: [{
                id: 50, organization_id: ORG, type: 'bought_in',
                base_cost_cents: 135, base_quantity: 100, base_unit: 'g',
                supplier_product_id: null, master_product_id: 8767, supplier_price_id: 5834,
            }],
            supplier_prices: [
                /* De NIEUWE actieve prijs: €14,00/kg → €1,40 per 100 g. */
                { id: 9001, organization_id: ORG, master_product_id: 8767, leverancier: 'Beef Club',
                  prijs: 14, eenheid: 'kg', prijs_per_kg: 14, prijs_per_stuk: null, datum: '2026-07-30', actief: true },
            ],
            supplier_products: [],
        });

        const rapport = await refreshBoughtInPrices(client, ORG);

        expect(rapport.bekeken).toBe(1);
        expect(rapport.bijgewerkt).toBe(1);
        expect(updates).toHaveLength(1);
        expect(updates[0].patch.base_cost_cents).toBe(140);
        /* updated_at MOET meegeschreven worden: daar hangt het slot tegen
           gelijktijdig opslaan aan. Zonder die stempel ziet de bewerk-lade deze
           prijswijziging niet en kan ze 'm stil terugdraaien. */
        expect(typeof updates[0].patch.updated_at).toBe('string');
    });

    it('volgt de nieuwste actieve prijs, niet het opgeslagen supplier_price_id', async () => {
        const { client, updates } = fakeSupabase({
            components: [{
                id: 51, organization_id: ORG, type: 'bought_in',
                base_cost_cents: 100, base_quantity: 100, base_unit: 'g',
                supplier_product_id: null, master_product_id: 42, supplier_price_id: 111,
            }],
            supplier_prices: [
                /* 111 is de oude regel en staat op actief=false — die mag niet winnen. */
                { id: 222, organization_id: ORG, master_product_id: 42, leverancier: 'Hanos',
                  prijs: 25, eenheid: 'kg', prijs_per_kg: 25, prijs_per_stuk: null, datum: '2026-07-30', actief: true },
            ],
            supplier_products: [],
        });

        await refreshBoughtInPrices(client, ORG);

        expect(updates[0].patch.base_cost_cents).toBe(250);
    });

    it('laat de basis-eenheid staan en rekent de prijs daarnaartoe om', async () => {
        const { client, updates } = fakeSupabase({
            components: [{
                /* Basis bewust op 1 kg gezet door de gebruiker — die blijft. */
                id: 52, organization_id: ORG, type: 'bought_in',
                base_cost_cents: 1000, base_quantity: 1, base_unit: 'kg',
                supplier_product_id: null, master_product_id: 7, supplier_price_id: null,
            }],
            supplier_prices: [
                { id: 300, organization_id: ORG, master_product_id: 7, leverancier: 'Bidfood',
                  prijs: 12.5, eenheid: 'kg', prijs_per_kg: 12.5, prijs_per_stuk: null, datum: '2026-07-30', actief: true },
            ],
            supplier_products: [],
        });

        await refreshBoughtInPrices(client, ORG);

        /* €12,50/kg op een basis van 1 kg = 1250 cent — géén stille herbasering naar 100 g. */
        expect(updates[0].patch.base_cost_cents).toBe(1250);
    });

    it('telt als ongekoppeld wanneer er geen actieve prijs meer is', async () => {
        const { client, updates } = fakeSupabase({
            components: [{
                id: 53, organization_id: ORG, type: 'bought_in',
                base_cost_cents: 200, base_quantity: 100, base_unit: 'g',
                supplier_product_id: null, master_product_id: 99, supplier_price_id: 5,
            }],
            supplier_prices: [],
            supplier_products: [],
        });

        const rapport = await refreshBoughtInPrices(client, ORG);

        expect(rapport.ongekoppeld).toBe(1);
        expect(updates).toHaveLength(0);
    });

    it('schrijft niets weg bij dryRun, maar meldt wél het verschil', async () => {
        /* Voor een scherm dat "opgeslagen €1,35 → nu €1,40 — Neem over" toont in
           plaats van de nieuwe prijs stil in het veld te zetten. */
        const { client, updates } = fakeSupabase({
            components: [{
                id: 60, organization_id: ORG, type: 'bought_in',
                base_cost_cents: 135, base_quantity: 100, base_unit: 'g',
                supplier_product_id: null, master_product_id: 8767, supplier_price_id: null,
            }],
            supplier_prices: [
                { id: 9001, organization_id: ORG, master_product_id: 8767, leverancier: 'Beef Club',
                  prijs: 14, eenheid: 'kg', prijs_per_kg: 14, prijs_per_stuk: null, datum: '2026-07-30', actief: true },
            ],
            supplier_products: [],
        });

        const rapport = await refreshBoughtInPrices(client, ORG, { dryRun: true });

        expect(updates).toHaveLength(0);
        expect(rapport.wijzigingen).toEqual([{ componentId: 60, oudCents: 135, nieuwCents: 140 }]);
    });

    it('raakt een prijsregel ZONDER genormaliseerde prijs niet aan', async () => {
        /* De regressie die dit vastlegt, is live gebeurd. "Beef Club Burgers 80 gram"
           hangt aan een prijsregel met prijs=123,48 en eenheid 'ST', zonder
           prijs_per_kg of prijs_per_stuk. De algemene resolver leest dat als
           EUR 123,48 per stuk, en de bouwsteen ging van EUR 1,35 naar EUR 12.348
           per 100 stuks. Zo'n vrije eenheid is in de praktijk vaak een doosprijs.
           Een stille schrijver mag daar niet naar gokken: niets doen is het enige
           veilige antwoord. */
        const { client, updates } = fakeSupabase({
            components: [{
                id: 35, organization_id: ORG, type: 'bought_in',
                base_cost_cents: 135, base_quantity: 100, base_unit: 'stuk',
                supplier_product_id: null, master_product_id: 2537, supplier_price_id: 1902,
            }],
            supplier_prices: [
                { id: 1902, organization_id: ORG, master_product_id: 2537, leverancier: 'beef club 29',
                  prijs: 123.48, eenheid: 'ST', prijs_per_kg: null, prijs_per_stuk: null,
                  datum: '2026-07-30', actief: true },
            ],
            supplier_products: [],
        });

        const rapport = await refreshBoughtInPrices(client, ORG);

        expect(updates).toHaveLength(0);
        expect(rapport.ongekoppeld).toBe(1);
        expect(rapport.bijgewerkt).toBe(0);
    });

    it('gebruikt prijs_per_stuk wanneer die er wél is', async () => {
        const { client, updates } = fakeSupabase({
            components: [{
                id: 36, organization_id: ORG, type: 'bought_in',
                base_cost_cents: 100, base_quantity: 1, base_unit: 'stuk',
                supplier_product_id: null, master_product_id: 77, supplier_price_id: null,
            }],
            supplier_prices: [
                { id: 700, organization_id: ORG, master_product_id: 77, leverancier: 'Bidfood',
                  prijs: 29.6, eenheid: 'doos', prijs_per_kg: null, prijs_per_stuk: 1.23,
                  datum: '2026-07-30', actief: true },
            ],
            supplier_products: [],
        });

        await refreshBoughtInPrices(client, ORG);
        expect(updates[0].patch.base_cost_cents).toBe(123);
    });

    it('raakt een handmatige component zonder koppeling niet aan', async () => {
        const { client, updates } = fakeSupabase({
            components: [{
                id: 54, organization_id: ORG, type: 'bought_in',
                base_cost_cents: 500, base_quantity: 100, base_unit: 'g',
                supplier_product_id: null, master_product_id: null, supplier_price_id: null,
            }],
            supplier_prices: [],
            supplier_products: [],
        });

        const rapport = await refreshBoughtInPrices(client, ORG);

        expect(rapport.bekeken).toBe(0);
        expect(updates).toHaveLength(0);
    });
});
