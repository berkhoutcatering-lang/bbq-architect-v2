import { describe, it, expect } from 'vitest';
import {
    normalizeComponentName,
    likePatternForName,
    vindDuplicaat,
    duplicaatMelding,
    haalAlleRijen,
    type BestaandeBouwsteen,
} from './route';

/* Deze tests bewaken twee dingen die de gebruiker direct raken:
   1. dat dezelfde bouwsteen niet twee/drie keer in de bibliotheek belandt;
   2. dat we nooit stilzwijgend rijen weglaten (dan gaan 'in gebruik' en
      'ongebruikt' liegen). */

const brioche: BestaandeBouwsteen = {
    id: 7,
    name: 'Brioche bun',
    type: 'bought_in',
    base_quantity: 12,
    base_unit: 'stuk',
    base_cost_cents: 450,
    supplier_product_id: 88,
    master_product_id: null,
};

describe('normalizeComponentName', () => {
    it('negeert hoofdletters, dubbele spaties en spaties aan de randen', () => {
        expect(normalizeComponentName('  Brioche   BUN ')).toBe('brioche bun');
    });
});

describe('likePatternForName', () => {
    it('maakt jokertekens uit een productnaam onschadelijk', () => {
        expect(likePatternForName('50% room_kaas')).toBe('50_%room_kaas');
    });
    it('laat spaties ruim matchen zodat dubbele spaties toch gevonden worden', () => {
        expect(likePatternForName('Brioche bun')).toBe('Brioche%bun');
    });
});

describe('vindDuplicaat', () => {
    it('herkent dezelfde naam ondanks hoofdletters en extra spaties', () => {
        const t = vindDuplicaat([brioche], { name: 'brioche  BUN' });
        expect(t?.bestaand.id).toBe(7);
        expect(t?.reden).toBe('naam');
    });

    it('herkent hetzelfde prijslijst-product ook als de naam anders is', () => {
        const t = vindDuplicaat([brioche], { name: 'Hamburgerbroodje groot', supplier_product_id: 88 });
        expect(t?.reden).toBe('product');
    });

    it('herkent de koppeling aan de prijslijst-catalogus', () => {
        const uitCatalogA: BestaandeBouwsteen = { ...brioche, id: 9, supplier_product_id: null, master_product_id: 1234 };
        const t = vindDuplicaat([uitCatalogA], { name: 'Iets anders', master_product_id: 1234 });
        expect(t?.bestaand.id).toBe(9);
    });

    it('ziet een 0-koppeling niet als koppeling (gescand product zonder id)', () => {
        const zonderKoppeling: BestaandeBouwsteen = { ...brioche, name: 'Sla', supplier_product_id: 0, master_product_id: 0 };
        const t = vindDuplicaat([zonderKoppeling], { name: 'Tomaat', supplier_product_id: 0, master_product_id: 0 });
        expect(t).toBeNull();
    });

    it('laat een echt nieuwe bouwsteen gewoon door', () => {
        expect(vindDuplicaat([brioche], { name: 'Pulled pork' })).toBeNull();
    });
});

describe('duplicaatMelding', () => {
    it('noemt de bestaande bouwsteen met prijs in NL-notatie', () => {
        const m = duplicaatMelding(brioche, 'naam');
        expect(m).toContain('Brioche bun');
        expect(m).toContain('12 stuk');
        expect(m).toMatch(/€\s?4,50/);
    });
    it('gebruikt geen database-jargon', () => {
        for (const reden of ['naam', 'product'] as const) {
            const m = duplicaatMelding(brioche, reden);
            expect(m).not.toMatch(/component|supplier_product_id|master_product_id|organization_id|null/i);
        }
    });
});

/* Kleine nep-database die zich gedraagt zoals PostgREST: hij geeft nooit meer
   dan maxRows per keer terug, ook als je om meer vraagt. */
function nepTabel(totaal: number, maxRows: number, telling: number | null = totaal) {
    return async (van: number, tot: number) => {
        const eind = Math.min(tot + 1, van + maxRows, totaal);
        const data = [];
        for (let i = van; i < eind; i++) data.push({ i });
        return { data, error: null, count: telling };
    };
}

describe('haalAlleRijen', () => {
    it('haalt alles op, ook boven de 1000 rijen', async () => {
        const res = await haalAlleRijen(nepTabel(2350, 1000), 5000);
        expect(res.rijen.length).toBe(2350);
        expect(res.afgekapt).toBe(false);
        expect(res.totaal).toBe(2350);
    });

    it('stopt niet te vroeg als de server een kleinere paginagrootte hanteert', async () => {
        const res = await haalAlleRijen(nepTabel(1200, 500), 5000);
        expect(res.rijen.length).toBe(1200);
        expect(res.afgekapt).toBe(false);
    });

    it('meldt het als het plafond bereikt is in plaats van stil af te kappen', async () => {
        const res = await haalAlleRijen(nepTabel(9000, 1000), 2000);
        expect(res.rijen.length).toBe(2000);
        expect(res.afgekapt).toBe(true);
        expect(res.totaal).toBe(9000);
    });

    it('geeft een fout terug in plaats van een half gevulde lijst als waarheid', async () => {
        const res = await haalAlleRijen(async () => ({ data: null, error: { message: 'stuk' }, count: null }), 5000);
        expect(res.error).toBe('stuk');
        expect(res.rijen).toEqual([]);
    });

    it('werkt ook zonder telling van de database', async () => {
        const res = await haalAlleRijen(nepTabel(1500, 1000, null), 5000);
        expect(res.rijen.length).toBe(1500);
        expect(res.afgekapt).toBe(false);
    });
});
