import { describe, expect, it } from 'vitest';
import {
    isNogNiet, laadAfdelingVanProduct, laadDerving, laadInkoopBonnen, laadKasBegin, laadKasMutaties, laadLoperInvoer, laadUitsluitingen,
    laadVerkoopRegels, laadVoorraadwaarde, zonderProefdagen,
} from './laden';
import { filter, nepSupabase, type Aanroep, type Uitkomst } from './nepSupabase';

const ORG = 'org-1';
const NIET_ER = { message: 'relation does not exist', code: 'PGRST205' };
const STUK = { message: 'de verbinding viel weg' };
const leeg: Uitkomst = { data: [], error: null };

describe('isNogNiet', () => {
    it('herkent een tabel of kolom die er nog niet is', () => {
        for (const code of ['42P01', '42703', 'PGRST200', 'PGRST204', 'PGRST205']) expect(isNogNiet({ code })).toBe(true);
    });
    it('een andere fout of geen fout is het niet', () => {
        expect(isNogNiet({ code: '42501' })).toBe(false);
        expect(isNogNiet(null)).toBe(false);
        expect(isNogNiet({})).toBe(false);
    });
});

describe('zonderProefdagen', () => {
    it('laat rijen van uitgesloten dagen weg', () => {
        const rijen = [{ bedrijfsdag: '2026-10-27', x: 1 }, { bedrijfsdag: '2026-11-21', x: 2 }];
        expect(zonderProefdagen(rijen, new Set(['2026-10-27']))).toEqual([{ bedrijfsdag: '2026-11-21', x: 2 }]);
        expect(zonderProefdagen(rijen, new Set())).toHaveLength(2);
    });
});

describe('laadKasMutaties', () => {
    it('de tabel is er nog niet: geen regels, niet beschikbaar, en dat is geen fout', async () => {
        const { sb } = nepSupabase(() => ({ data: null, error: NIET_ER }));
        expect(await laadKasMutaties(sb, ORG, '2026-11-01', '2026-11-30')).toEqual({ mutaties: [], beschikbaar: false, fout: null });
    });
    it('een andere fout wordt gemeld en niet voor "geen regels" aangezien', async () => {
        const { sb } = nepSupabase(() => ({ data: null, error: STUK }));
        const uit = await laadKasMutaties(sb, ORG, '2026-11-01', '2026-11-30');
        expect(uit).toMatchObject({ mutaties: [], beschikbaar: true });
        expect(uit.fout).toContain('de verbinding viel weg');
    });
    it('leest de regels van de eigen organisatie', async () => {
        const { sb, aanroepen } = nepSupabase(() => ({
            data: [{ id: 'm1', datum: '2026-11-27', bedrag_cents: -900, reden: 'uitgave', omschrijving: 'Schoonmaakmiddel', moment: 'tijdens', created_at: '2026-11-27T10:00:00Z' }], error: null,
        }));
        const uit = await laadKasMutaties(sb, ORG, '2026-11-01', '2026-11-30');
        expect(uit).toEqual({ mutaties: [{ id: 'm1', datum: '2026-11-27', bedrag_cents: -900, reden: 'uitgave', omschrijving: 'Schoonmaakmiddel', moment: 'tijdens' }], beschikbaar: true, fout: null });
        expect(filter(aanroepen[0], 'eq', 'organization_id')).toBe(ORG);
    });
});

describe('een laadfout wordt gemeld, niet ingeslikt', () => {
    const stuk = () => nepSupabase(() => ({ data: null, error: STUK })).sb;
    const nietEr = () => nepSupabase(() => ({ data: null, error: NIET_ER })).sb;

    it('proefdagen', async () => {
        const uit = await laadUitsluitingen(stuk(), ORG, '2026-11-01', '2026-11-30');
        expect(uit.dagen.size).toBe(0);
        expect(uit.fout).toContain('de verbinding viel weg');
    });
    it('proefdagen gelezen: de dagen, zonder fout', async () => {
        const { sb } = nepSupabase(() => ({ data: [{ datum: '2026-10-27' }], error: null }));
        const uit = await laadUitsluitingen(sb, ORG, '2026-10-01', '2026-10-31');
        expect([...uit.dagen]).toEqual(['2026-10-27']);
        expect(uit.fout).toBeNull();
    });
    it('inkoopbonnen', async () => {
        expect(await laadInkoopBonnen(stuk(), ORG, '2026-11-01', '2026-11-30')).toMatchObject({ bonnen: [], fout: expect.stringContaining('de verbinding viel weg') });
    });
    it('voorraadwaarde', async () => {
        expect(await laadVoorraadwaarde(stuk(), ORG)).toMatchObject({ cents: 0, producten: 0, fout: expect.stringContaining('de verbinding viel weg') });
    });
    it('derving', async () => {
        expect(await laadDerving(stuk(), ORG, '2026-11-01', '2026-11-30')).toMatchObject({ aantal: 0, fout: expect.stringContaining('de verbinding viel weg') });
    });
    it('een tabel die er nog niet is, is geen fout', async () => {
        expect((await laadUitsluitingen(nietEr(), ORG, '2026-11-01', '2026-11-30')).fout).toBeNull();
        expect((await laadInkoopBonnen(nietEr(), ORG, '2026-11-01', '2026-11-30')).fout).toBeNull();
        expect((await laadVoorraadwaarde(nietEr(), ORG)).fout).toBeNull();
        expect((await laadDerving(nietEr(), ORG, '2026-11-01', '2026-11-30')).fout).toBeNull();
    });
});

describe('laadAfdelingVanProduct', () => {
    const plekken = [
        { id: 'r', code: 'WINKEL', naam: 'Winkel', parent_id: null },
        { id: 'a1', code: 'WINKEL-VLEES', naam: 'Vlees', parent_id: 'r' },
    ];
    it('vraagt alleen de eigen organisatie op', async () => {
        const { sb, aanroepen } = nepSupabase((a) => (a.tabel === 'opslag_locaties' ? { data: plekken, error: null } : leeg));
        await laadAfdelingVanProduct(sb, ORG);
        expect(aanroepen.length).toBeGreaterThanOrEqual(2);
        for (const a of aanroepen) expect(filter(a, 'eq', 'organization_id')).toBe(ORG);
    });
    it('bladert door meer dan duizend plaatsingen', async () => {
        const plaatsingen = Array.from({ length: 1500 }, (_, i) => ({ product_id: `p${i}`, locatie_id: 'a1' }));
        const { sb } = nepSupabase((a) => (a.tabel === 'opslag_locaties' ? { data: plekken, error: null } : { data: plaatsingen, error: null }));
        const uit = await laadAfdelingVanProduct(sb, ORG);
        expect(uit.fout).toBeNull();
        expect(uit.afdelingen.size).toBe(1500);
        expect(uit.afdelingen.get('p1499')).toBe('Vlees');
    });
    it('een leesfout wordt gemeld', async () => {
        const { sb } = nepSupabase(() => ({ data: null, error: STUK }));
        const uit = await laadAfdelingVanProduct(sb, ORG);
        expect(uit.afdelingen.size).toBe(0);
        expect(uit.fout).toContain('de verbinding viel weg');
    });
});

describe('laadKasBegin', () => {
    it('rekent de beginstand uit de laatste afsluiting en de eigen regels daarna', async () => {
        const { sb } = nepSupabase((a) => {
            if (a.tabel === 'toonbank_dagstaten') return { data: [{ bedrijfsdag: '2026-11-28', gesloten_at: '2026-11-28T17:00:00Z', contant_geteld_cents: 48945, afgeroomd_cents: 34000 }], error: null };
            if (a.tabel === 'winkel_kas_mutaties') return { data: [{ id: 'm9', datum: '2026-11-30', bedrag_cents: 2000, reden: 'wisselgeld', omschrijving: 'Wisselgeld erbij', moment: 'tijdens', created_at: 'x' }], error: null };
            return leeg;
        });
        expect(await laadKasBegin(sb, ORG, '2026-12-01')).toEqual({ begin: { datum: '2026-12-01', saldo_cents: 16945 }, fout: null });
    });
    it('nog nooit afgesloten: geen beginstand en geen fout', async () => {
        const { sb } = nepSupabase(() => leeg);
        expect(await laadKasBegin(sb, ORG, '2026-12-01')).toEqual({ begin: null, fout: null });
    });
    it('een leesfout is een fout, geen "nog nooit afgesloten"', async () => {
        const { sb } = nepSupabase(() => ({ data: null, error: STUK }));
        const uit = await laadKasBegin(sb, ORG, '2026-12-01');
        expect(uit.begin).toBeNull();
        expect(uit.fout).toContain('de verbinding viel weg');
    });
    it('eigen kasregels niet te lezen: geen beginstand die er half naast zit', async () => {
        const { sb } = nepSupabase((a) => {
            if (a.tabel === 'toonbank_dagstaten') return { data: [{ bedrijfsdag: '2026-11-28', gesloten_at: '2026-11-28T17:00:00Z', contant_geteld_cents: 48945, afgeroomd_cents: 34000 }], error: null };
            if (a.tabel === 'winkel_kas_mutaties') return { data: null, error: STUK };
            return leeg;
        });
        const uit = await laadKasBegin(sb, ORG, '2026-12-01');
        expect(uit.begin).toBeNull();
        expect(uit.fout).toContain('de verbinding viel weg');
    });
});

const bonRegel = (id: number) => ({
    id, artikel_id: 'a-worst', naam: 'Droge worst', open_prijs_groep: null, aantal: 1, bedrag_cents: 600, btw: [{ pct: 9, incl_cents: 600 }],
    onderdelen: [{ product_id: 'p-worst', hoeveelheid: 1, eenheid: 'stuk' }], goederen_terug: null,
    toonbank_bonnen: { bedrijfsdag: '2026-11-28', gebeurd_at: '2026-11-28T12:00:00Z', status: 'afgerond' },
});

describe('laadVerkoopRegels', () => {
    it('inkoopprijzen niet te lezen: de regels komen terug, met de fout erbij', async () => {
        const { sb } = nepSupabase((a) => {
            if (a.tabel === 'toonbank_bon_regels') return { data: [bonRegel(1)], error: null };
            if (a.tabel === 'winkel_producten') return { data: null, error: STUK };
            return leeg;
        });
        const uit = await laadVerkoopRegels(sb, ORG, '2026-11-01', '2026-11-30', new Set());
        expect(uit.regels).toHaveLength(1);
        expect(uit.fout).toContain('Inkoopprijzen');
    });

    it('haalt het voorraadlogboek in stukken tegelijk op, niet één voor één', async () => {
        const regels = Array.from({ length: 1600 }, (_, i) => bonRegel(i + 1));
        let bezig = 0;
        let meeste = 0;
        const { sb, aanroepen } = nepSupabase(async (a: Aanroep) => {
            if (a.tabel === 'toonbank_bon_regels') return { data: regels, error: null };
            if (a.tabel === 'winkel_voorraad_mutaties') {
                bezig += 1;
                meeste = Math.max(meeste, bezig);
                await new Promise((klaar) => setTimeout(klaar, 5));
                bezig -= 1;
                const ids = filter(a, 'in', 'toonbank_bon_regel_id') as number[];
                return { data: ids.map((id) => ({ toonbank_bon_regel_id: id, winkel_product_id: 'p-worst', type: 'verkoop_kassa', waarde_cents: -40 })), error: null };
            }
            return leeg;
        });
        const uit = await laadVerkoopRegels(sb, ORG, '2026-11-01', '2026-11-30', new Set());
        expect(uit.fout).toBeNull();
        expect(uit.regels).toHaveLength(1600);
        expect(uit.regels.every((r) => r.inkoop_cents === 40 && r.inkoop_bron === 'logboek')).toBe(true);
        expect(aanroepen.filter((a) => a.tabel === 'winkel_voorraad_mutaties')).toHaveLength(8);
        expect(meeste).toBeGreaterThan(1);
        expect(meeste).toBeLessThanOrEqual(5);
    });
});

describe('laadLoperInvoer', () => {
    it('artikelen niet te lezen: een fout, geen lege winkel', async () => {
        const { sb } = nepSupabase((a) => {
            if (a.tabel === 'winkel_artikelen') return { data: null, error: STUK };
            if (a.tabel === 'winkel_producten') return { data: [{ id: 'p1', naam: 'Worst', eenheid: 'stuk', voorraad: 4, tht: null, inkoop_excl_cents: 300, prijs_per: 1 }], error: null };
            return leeg;
        });
        const uit = await laadLoperInvoer(sb, ORG, new Date('2026-11-28T12:00:00Z'));
        expect(uit.fout).toContain('de verbinding viel weg');
    });
});
