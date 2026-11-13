import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Dagboeking } from './dagboeking';
import { DAG_GEBOEKT_TYPE, dagMeldingTekst, meldDagGeboekt, meldingId } from './dagMelding';
import { nepSupabase, type Aanroep, type Uitkomst } from './nepSupabase';

/* De melding gebruikt de serviceclient; in de test is dat de nagemaakte client. */
const dienst: { sb: SupabaseClient | null } = { sb: null };
vi.mock('@/lib/supabase-server', () => ({
    createServiceSupabase: () => {
        if (!dienst.sb) throw new Error('geen serviceclient');
        return dienst.sb;
    },
}));

const dag = (x: Partial<Dagboeking>): Dagboeking => ({
    datum: '2026-11-28', binnen: { pin: 0, contant: 0, cadeaubon: 0, totaal: 0 }, hokjes: [], totaal_hokjes: 0,
    sluit: true, stand: 'geboekt', aantal_bonnen: 64, gesloten_at: '2026-11-28T17:07:00Z', punten: [], ...x,
});

describe('dagMeldingTekst', () => {
    it('een geboekte dag', () => {
        expect(dagMeldingTekst(dag({}))).toEqual({ title: 'Dag geboekt · za 28 nov', body: 'Alles klopt, je hoeft niets te doen.' });
    });
    it('een dag met punten', () => {
        expect(dagMeldingTekst(dag({ stand: 'te_controleren', punten: ['a'] }))).toEqual({ title: 'Dag afgesloten · za 28 nov', body: '1 punt om naar te kijken.' });
        expect(dagMeldingTekst(dag({ stand: 'te_controleren', punten: ['a', 'b'] }))?.body).toBe('2 punten om naar te kijken.');
    });
    it('geen melding als de bonnen of dagstaten niet te laden waren: liever niets dan een onterecht vinkje', () => {
        expect(dagMeldingTekst(dag({}), 'Kassabonnen niet te lezen: timeout')).toBeNull();
    });
    it('geen melding voor een open dag of een dag zonder verkoop', () => {
        expect(dagMeldingTekst(dag({ stand: 'open' }))).toBeNull();
        expect(dagMeldingTekst(dag({ stand: 'geen_verkoop' }))).toBeNull();
    });
});

describe('meldingId', () => {
    it('is per organisatie en dag steeds hetzelfde, en een geldig id', () => {
        const id = meldingId('org-1', '2026-11-28');
        expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
        expect(meldingId('org-1', '2026-11-28')).toBe(id);
    });
    it('verschilt per dag en per organisatie', () => {
        expect(meldingId('org-1', '2026-11-27')).not.toBe(meldingId('org-1', '2026-11-28'));
        expect(meldingId('org-2', '2026-11-28')).not.toBe(meldingId('org-1', '2026-11-28'));
    });
});

describe('meldDagGeboekt', () => {
    const ORG = 'org-1';
    const DAG = '2026-11-28';
    const staat = {
        id: 'd1', apparaat_id: 'kassa-1', bedrijfsdag: DAG, status: 'definitief', gesloten_at: `${DAG}T17:07:00Z`, aantal_bonnen: 1,
        pin_toonbank_cents: 1090, pin_mypos_app_cents: 1090, pin_verschil_cents: 0, contant_begin_cents: 15000, contant_verwacht_cents: 15000,
        contant_geteld_cents: 15000, contant_verschil_cents: 0, afgeroomd_cents: 0, verschillen: [], goedgekeurd_at: null,
    };
    const bon = {
        status: 'afgerond', dagstaat_id: 'd1', bedrijfsdag: DAG, totaal_cents: 1090, afronding_cents: 0, btw: { '9': { incl_cents: 1090, btw_cents: 90 } },
        statiegeld_cents: 0, order_rest_cents: 0, pin_cents: 1090, contant_cents: 0, cadeaubon_cents: 0,
    };
    /** Een gewone, kloppende dag; `anders` wijkt per tabel af. */
    const zet = (anders: (a: Aanroep) => Uitkomst | undefined = () => undefined) => {
        const nep = nepSupabase((a) => anders(a) ?? (
            a.tabel === 'toonbank_dagstaten' ? { data: [staat], error: null }
            : a.tabel === 'toonbank_bonnen' ? { data: [bon], error: null }
            : { data: [], error: null }));
        dienst.sb = nep.sb;
        return nep;
    };
    const inserts = (aanroepen: Aanroep[]) => aanroepen.filter((a) => a.tabel === 'notifications' && a.insert).map((a) => a.insert as Record<string, unknown>);

    afterEach(() => { dienst.sb = null; vi.restoreAllMocks(); });

    it('maakt één melding met een vast id per organisatie en dag', async () => {
        const { aanroepen } = zet();
        await meldDagGeboekt(ORG, 'd1');
        expect(inserts(aanroepen)).toEqual([expect.objectContaining({
            id: meldingId(ORG, DAG), organization_id: ORG, type: DAG_GEBOEKT_TYPE, link: `/winkelboek/dag/${DAG}`, body: 'Alles klopt, je hoeft niets te doen.',
        })]);
    });
    it('twee kassa\'s sluiten tegelijk: de tweede botst op hetzelfde id en dat is geen fout', async () => {
        const fouten = vi.spyOn(console, 'error').mockImplementation(() => {});
        zet((a) => (a.tabel === 'notifications' && a.insert ? { data: null, error: { message: 'duplicate key value', code: '23505' } } : undefined));
        await expect(meldDagGeboekt(ORG, 'd1')).resolves.toBeUndefined();
        expect(fouten).not.toHaveBeenCalled();
    });
    it('er is al een melding voor die dag: geen tweede', async () => {
        const { aanroepen } = zet((a) => (a.tabel === 'notifications' && !a.insert ? { data: [{ id: 'x' }], error: null } : undefined));
        await meldDagGeboekt(ORG, 'd1');
        expect(inserts(aanroepen)).toEqual([]);
    });
    it('een proefdag geeft geen melding', async () => {
        const { aanroepen } = zet((a) => (a.tabel === 'btw_kassa_uitsluitingen' ? { data: [{ datum: DAG }], error: null } : undefined));
        await meldDagGeboekt(ORG, 'd1');
        expect(inserts(aanroepen)).toEqual([]);
    });
    it('proefdagen niet te lezen: liever geen melding dan één voor een proefdag', async () => {
        const { aanroepen } = zet((a) => (a.tabel === 'btw_kassa_uitsluitingen' ? { data: null, error: { message: 'de verbinding viel weg' } } : undefined));
        await meldDagGeboekt(ORG, 'd1');
        expect(inserts(aanroepen)).toEqual([]);
    });
    it('bonnen niet te lezen: geen melding', async () => {
        const { aanroepen } = zet((a) => (a.tabel === 'toonbank_bonnen' ? { data: null, error: { message: 'de verbinding viel weg' } } : undefined));
        await meldDagGeboekt(ORG, 'd1');
        expect(inserts(aanroepen)).toEqual([]);
    });
    it('gooit nooit, ook niet als er geen serviceclient is', async () => {
        const fouten = vi.spyOn(console, 'error').mockImplementation(() => {});
        dienst.sb = null;
        await expect(meldDagGeboekt(ORG, 'd1')).resolves.toBeUndefined();
        expect(fouten).toHaveBeenCalledTimes(1);
    });
});
