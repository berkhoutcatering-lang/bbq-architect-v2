import { describe, expect, it } from 'vitest';
import { eanBijAnderProduct, koppelEan, type EanOpslag, type EanProduct } from './eanKoppelen';
import { EAN_INDEX } from './toonbankVelden';

/** Een opslag in het geheugen die zich gedraagt als de unieke index. */
function geheugen(begin: EanProduct[], opties: { indexFout?: boolean } = {}) {
    const rijen = new Map(begin.map((p) => [p.id, { ...p }]));
    const schrijf: { id: string; ean: string | null }[] = [];
    const db: EanOpslag = {
        async product(id) { const p = rijen.get(id); return p ? { ...p } : null; },
        async metCodes(codes) { return [...rijen.values()].filter((p) => p.ean != null && codes.includes(p.ean)); },
        async zetEan(id, ean) {
            if (opties.indexFout) return { code: '23505', message: `duplicate key value violates unique constraint "${EAN_INDEX}"` };
            schrijf.push({ id, ean });
            rijen.get(id)!.ean = ean;
            return null;
        },
    };
    return { db, rijen, schrijf };
}

const HERTOG = { id: 'p-hertog', naam: 'Hertog Jan 0,30', ean: null };
const LA_TRAPPE = { id: 'p-trappe', naam: 'La Trappe Dubbel', ean: '8712345678906' };

describe('koppelEan', () => {
    it('koppelt een goede code aan een product zonder code', async () => {
        const { db, rijen } = geheugen([HERTOG, LA_TRAPPE]);
        const r = await koppelEan(db, 'p-hertog', '96385074');
        expect(r).toEqual({ ok: true, product: { id: 'p-hertog', naam: 'Hertog Jan 0,30' }, ean: '96385074', vorige: null });
        expect(rijen.get('p-hertog')!.ean).toBe('96385074');
    });

    it('slaat de code op zonder de spaties en het regeleinde van de scanner', async () => {
        const { db, rijen } = geheugen([HERTOG]);
        await koppelEan(db, 'p-hertog', ' 96385074\n');
        expect(rijen.get('p-hertog')!.ean).toBe('96385074');
    });

    it('koppelt niets als de code al bij een ander product hoort, en noemt dat product', async () => {
        const { db, schrijf } = geheugen([HERTOG, LA_TRAPPE]);
        const r = await koppelEan(db, 'p-hertog', '8712345678906');
        expect(r).toEqual({
            ok: false,
            fout: 'Deze code hoort al bij La Trappe Dubbel. Er is niets gekoppeld.',
            bijProduct: { id: 'p-trappe', naam: 'La Trappe Dubbel' },
        });
        expect(schrijf).toEqual([]);
    });

    it('ziet een UPC-A en dezelfde code als EAN-13 als één code', async () => {
        const { db, schrijf } = geheugen([HERTOG, { id: 'p-us', naam: 'Amerikaanse rub', ean: '036000291452' }]);
        const r = await koppelEan(db, 'p-hertog', '0036000291452');
        expect(r.ok).toBe(false);
        if (r.ok === false) expect(r.bijProduct?.naam).toBe('Amerikaanse rub');
        expect(schrijf).toEqual([]);
    });

    it('koppelt niets bij een verkeerd controlecijfer', async () => {
        const { db, schrijf } = geheugen([HERTOG]);
        const r = await koppelEan(db, 'p-hertog', '8712345678907');
        expect(r.ok).toBe(false);
        expect(schrijf).toEqual([]);
    });

    it('vervangt een verkeerd gekoppelde code en geeft de oude terug', async () => {
        const { db, rijen } = geheugen([LA_TRAPPE]);
        const r = await koppelEan(db, 'p-trappe', '96385074');
        expect(r).toMatchObject({ ok: true, ean: '96385074', vorige: '8712345678906' });
        expect(rijen.get('p-trappe')!.ean).toBe('96385074');
    });

    it('haalt een code weg', async () => {
        const { db, rijen } = geheugen([LA_TRAPPE]);
        const r = await koppelEan(db, 'p-trappe', null);
        expect(r).toMatchObject({ ok: true, ean: null, vorige: '8712345678906' });
        expect(rijen.get('p-trappe')!.ean).toBeNull();
    });

    it('dezelfde code nog een keer scannen op hetzelfde product is geen fout en schrijft niets', async () => {
        const { db, schrijf } = geheugen([LA_TRAPPE]);
        const r = await koppelEan(db, 'p-trappe', '8712345678906');
        expect(r).toMatchObject({ ok: true, ean: '8712345678906' });
        expect(schrijf).toEqual([]);
    });

    it('meldt een onbekend product', async () => {
        const { db } = geheugen([]);
        const r = await koppelEan(db, 'p-weg', '96385074');
        expect(r.ok).toBe(false);
    });

    it('vertaalt de unieke index als twee scans tegelijk dezelfde code wilden', async () => {
        const { db } = geheugen([HERTOG], { indexFout: true });
        const r = await koppelEan(db, 'p-hertog', '96385074');
        expect(r.ok).toBe(false);
        if (r.ok === false) expect(r.fout).toMatch(/hoort al bij een ander product/);
    });
});

describe('eanBijAnderProduct', () => {
    it('telt het eigen product niet als dubbel, een nieuw product (null) wel elk ander', async () => {
        const { db } = geheugen([LA_TRAPPE]);
        expect(await eanBijAnderProduct(db, '8712345678906', 'p-trappe')).toBeNull();
        expect((await eanBijAnderProduct(db, '8712345678906', null))?.naam).toBe('La Trappe Dubbel');
    });
});
