/**
 * Kassa → voorraad: "twee afgerekend bij de kassa, dan staat er twee minder"
 * (Mathijs). Dubbel melden boekt één keer; niets wordt stil overgeslagen.
 */
import { describe, expect, it } from 'vitest';
import { verwerkKassaBon, type KassaDeps } from './kassaVerkoop';

function nepKassa(voorraad: Record<string, number | null>) {
    const geboekt = new Map<string, number>();
    const namen: Record<string, string> = { '8710000000001': 'p-bier', '8710000000002': 'p-wijn', '8710000000003': 'p-nieuw' };
    const deps: KassaDeps = {
        async zoekProduct(r) {
            const id = r.product_id ?? (r.ean ? namen[r.ean] : undefined);
            return id && id in voorraad ? { id, naam: id } : null;
        },
        async muteer(a) {
            if (geboekt.has(a.sleutel)) return { voorraad: voorraad[a.product_id]!, bestond: true };
            const v = voorraad[a.product_id];
            if (v == null) throw Object.assign(new Error('niet bijgehouden'), { code: 'WV002' });
            if (v + a.hoeveelheid < 0) throw Object.assign(new Error('onder nul'), { code: 'WV001' });
            voorraad[a.product_id] = v + a.hoeveelheid;
            geboekt.set(a.sleutel, a.hoeveelheid);
            return { voorraad: voorraad[a.product_id]!, bestond: false };
        },
    };
    return { deps, voorraad, geboekt };
}

describe('kassa → voorraad', () => {
    it('twee bier afgerekend: er staat er twee minder', async () => {
        const k = nepKassa({ 'p-bier': 30 });
        const uit = await verwerkKassaBon('B-1001', [{ ean: '8710000000001', aantal: 2 }], k.deps);
        expect(uit).toEqual([{ regel: 1, status: 'geboekt', product_id: 'p-bier', naam: 'p-bier', voorraad: 28, al_gemeld: false }]);
    });
    it('dezelfde bon twee keer gemeld: één keer geboekt', async () => {
        const k = nepKassa({ 'p-bier': 30 });
        await verwerkKassaBon('B-1001', [{ ean: '8710000000001', aantal: 2 }], k.deps);
        const tweede = await verwerkKassaBon('B-1001', [{ ean: '8710000000001', aantal: 2 }], k.deps);
        expect(k.voorraad['p-bier']).toBe(28);
        expect(tweede[0]).toMatchObject({ status: 'geboekt', al_gemeld: true });
    });
    it('retour (negatief aantal) komt er weer bij', async () => {
        const k = nepKassa({ 'p-bier': 30 });
        await verwerkKassaBon('B-1002', [{ product_id: 'p-bier', aantal: -1 }], k.deps);
        expect(k.voorraad['p-bier']).toBe(31);
    });
    it('onbekende barcode, niet bijgehouden en tekort: alle drie terug, niets stil', async () => {
        const k = nepKassa({ 'p-bier': 1, 'p-wijn': null });
        const uit = await verwerkKassaBon('B-1003', [
            { ean: '9999999999999', aantal: 1 },
            { ean: '8710000000002', aantal: 1 },
            { ean: '8710000000001', aantal: 3 },
        ], k.deps);
        expect(uit.map((u) => u.status)).toEqual(['onbekend', 'niet_bijgehouden', 'tekort']);
        expect(k.voorraad['p-bier']).toBe(1);
    });
});
