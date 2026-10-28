/**
 * Tests voor de Toonbank-API v1, contract 1.2: GET cadeaubonnen/{code}, POST …/reserveren en
 * POST …/vrijgeven. De geheugen-opslag doet wat de databasefuncties doen (de echte worden getest in
 * supabase/tests/toonbank_cadeaubonnen.sql); hier gaat het om de route: sleutel en medewerker,
 * de vorm van het contract, de HTTP-status van elke fout en de code in het adres.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { CadeaubonAntwoord, CadeaubonReserveerAntwoord, CadeaubonVrijgevenAntwoord, FoutAntwoord } from '@/lib/toonbank/contract';
import { maakToonbankGeheugenStore, STANDAARD_STAND, type ToonbankGeheugenStore } from '@/lib/toonbank/geheugenStore';
import { genereerSessieToken, genereerSleutel } from '@/lib/toonbank/sleutel';

const houder = vi.hoisted(() => ({ store: null as unknown }));
vi.mock('@/lib/toonbank/supabaseStore', () => ({ maakToonbankSupabaseStore: () => houder.store }));

import { GET as cadeaubonGET } from './cadeaubonnen/[code]/route';
import { POST as reserverenPOST } from './cadeaubonnen/[code]/reserveren/route';
import { POST as vrijgevenPOST } from './cadeaubonnen/[code]/vrijgeven/route';

const ORG = '00000000-0000-4000-8000-0000000000aa';
const T1 = '00000000-0000-4000-8000-000000000001';
const JAN = '10000000-0000-4000-8000-000000000001';
const sleutel = genereerSleutel();
const sessie = genereerSessieToken();
const RES = '5b6d1f0e-2c4a-4f7e-9a31-8e2d7c0b4a15';
const BON = '8c1e2f47-6a3b-4d59-b0e7-3f9a2c6d1e08';

let store: ToonbankGeheugenStore;
let ip = 0;

beforeEach(() => {
    store = maakToonbankGeheugenStore({
        apparaten: [{
            id: T1, organization_id: ORG, naam: 'Toonbank winkel', code: 'T1', locatie: 'winkel', ingetrokken_at: null,
            hoogste_volgnummer_gemeld: 0, bevestigd_tot_volgnummer: 0, sleutel_hash: sleutel.hash, sleutel_prefix: sleutel.prefix,
            koppelcode_hash: null, koppelcode_geldig_tot: null, koppelpogingen: 0,
        }],
        medewerkers: [{ id: JAN, organization_id: ORG, naam: 'Jan', actief: true, toonbank_rol: 'medewerker', kds_pin_hash: null, kds_pin_lockout_until: null }],
        sessies: [{
            id: '20000000-0000-4000-8000-000000000001', organization_id: ORG, apparaat_id: T1, medewerker_id: JAN, rol: 'medewerker', doel: 'dienst',
            geldig_tot: new Date(Date.now() + 3_600_000).toISOString(), beeindigd_at: null, token_hash: sessie.hash, aangemaakt_at: new Date().toISOString(),
        }],
        stand: { [ORG]: STANDAARD_STAND },
        cadeaubonnen: [{ id: '30000000-0000-4000-8000-000000000001', organization_id: ORG, code: 'HB-CB-1001', waarde_cents: 2500, saldo_cents: 1850, geldig_tot: '2028-12-31', geblokkeerd: false }],
        cadeaubonAan: { [ORG]: true },
    });
    houder.store = store;
});

function verzoek(pad: string, o: { body?: unknown; medewerker?: string | null } = {}): NextRequest {
    const headers = new Headers({
        'content-type': 'application/json', 'x-forwarded-for': `10.2.0.${++ip % 250}`,
        'x-toonbank-contract': '1.2.0', 'x-toonbank-sleutel': sleutel.sleutel, 'x-toonbank-app': '0.2.0',
    });
    if (o.medewerker !== null) headers.set('x-toonbank-medewerker', o.medewerker ?? sessie.token);
    return new NextRequest(`http://localhost:3000/api/toonbank/v1/${pad}`, {
        method: o.body !== undefined ? 'POST' : 'GET', headers, body: o.body !== undefined ? JSON.stringify(o.body) : undefined,
    });
}
const ctx = (code: string) => ({ params: Promise.resolve({ code }) });

async function fout(res: Response, status: number, code: string): Promise<{ fout: { details: Record<string, unknown>; melding: string } }> {
    expect(res.status).toBe(status);
    const b = await res.json();
    expect(FoutAntwoord.parse(b).fout.code).toBe(code);
    return b;
}

describe('GET cadeaubonnen/{code}', () => {
    it('200 volgens het contract, ook met kleine letters; nooit gecachet', async () => {
        const res = await cadeaubonGET(verzoek('cadeaubonnen/hb-cb-1001'), ctx('hb-cb-1001'));
        expect(res.status).toBe(200);
        expect(res.headers.get('cache-control')).toBe('no-store');
        expect(CadeaubonAntwoord.parse(await res.json())).toEqual({
            code: 'HB-CB-1001', status: 'actief', saldo_cents: 1850, gereserveerd_cents: 0, beschikbaar_cents: 1850, waarde_cents: 2500, geldig_tot: '2028-12-31',
        });
    });

    it('onbekend: 404 cadeaubon_onbekend; zonder sleutel: 401', async () => {
        await fout(await cadeaubonGET(verzoek('cadeaubonnen/HB-WEG-1'), ctx('HB-WEG-1')), 404, 'cadeaubon_onbekend');
        const zonder = verzoek('cadeaubonnen/HB-CB-1001');
        zonder.headers.delete('x-toonbank-sleutel');
        await fout(await cadeaubonGET(zonder, ctx('HB-CB-1001')), 401, 'sleutel_onbekend');
    });
});

describe('POST cadeaubonnen/{code}/reserveren', () => {
    const body = { reservering_id: RES, bon_id: BON, bedrag_cents: 1000 };

    it('zonder ingelogde medewerker: 403, er is niets gereserveerd', async () => {
        await fout(await reserverenPOST(verzoek('cadeaubonnen/HB-CB-1001/reserveren', { body, medewerker: null }), ctx('HB-CB-1001')), 403, 'medewerker_sessie_verlopen');
        expect(store.g.cadeaubonReserveringen).toHaveLength(0);
    });

    it('200: vastgehouden voor de medewerker; een herhaling geeft hetzelfde', async () => {
        const res = await reserverenPOST(verzoek('cadeaubonnen/HB-CB-1001/reserveren', { body }), ctx('HB-CB-1001'));
        expect(res.status).toBe(200);
        const b = CadeaubonReserveerAntwoord.parse(await res.json());
        expect(b).toMatchObject({ reservering_id: RES, code: 'HB-CB-1001', bedrag_cents: 1000, beschikbaar_na_cents: 850 });
        const nog = CadeaubonReserveerAntwoord.parse(await (await reserverenPOST(verzoek('cadeaubonnen/HB-CB-1001/reserveren', { body }), ctx('HB-CB-1001'))).json());
        expect(nog).toEqual(b);
        expect(store.g.cadeaubonReserveringen).toEqual([expect.objectContaining({ medewerker_id: JAN, apparaat_id: T1, status: 'vast' })]);
    });

    it('te weinig: 422 met beschikbaar_cents; onbekend 404; geblokkeerd en verlopen 422', async () => {
        const te = await fout(await reserverenPOST(verzoek('cadeaubonnen/HB-CB-1001/reserveren', { body: { ...body, bedrag_cents: 2000 } }), ctx('HB-CB-1001')), 422, 'cadeaubon_saldo_te_laag');
        expect(te.fout.details.beschikbaar_cents).toBe(1850);
        await fout(await reserverenPOST(verzoek('cadeaubonnen/HB-WEG-1/reserveren', { body }), ctx('HB-WEG-1')), 404, 'cadeaubon_onbekend');
        store.g.cadeaubonnen[0]!.geblokkeerd = true;
        await fout(await reserverenPOST(verzoek('cadeaubonnen/HB-CB-1001/reserveren', { body }), ctx('HB-CB-1001')), 422, 'cadeaubon_geblokkeerd');
        store.g.cadeaubonnen[0]!.geblokkeerd = false;
        store.g.cadeaubonnen[0]!.geldig_tot = '2020-01-01';
        await fout(await reserverenPOST(verzoek('cadeaubonnen/HB-CB-1001/reserveren', { body }), ctx('HB-CB-1001')), 422, 'cadeaubon_verlopen');
        expect(store.g.cadeaubonReserveringen).toHaveLength(0);
    });

    it('een body die niet klopt: 400 ongeldig_verzoek', async () => {
        for (const b of [{}, { ...body, bedrag_cents: 0 }, { ...body, reservering_id: 'abc' }, { ...body, bedrag_cents: 10.5 }]) {
            await fout(await reserverenPOST(verzoek('cadeaubonnen/HB-CB-1001/reserveren', { body: b }), ctx('HB-CB-1001')), 400, 'ongeldig_verzoek');
        }
    });
});

describe('POST cadeaubonnen/{code}/vrijgeven', () => {
    it('vrijgegeven, en een tweede keer onwaar; zonder medewerker 403', async () => {
        await reserverenPOST(verzoek('cadeaubonnen/HB-CB-1001/reserveren', { body: { reservering_id: RES, bon_id: BON, bedrag_cents: 1000 } }), ctx('HB-CB-1001'));
        await fout(await vrijgevenPOST(verzoek('cadeaubonnen/HB-CB-1001/vrijgeven', { body: { reservering_id: RES }, medewerker: null }), ctx('HB-CB-1001')), 403, 'medewerker_sessie_verlopen');
        const een = await vrijgevenPOST(verzoek('cadeaubonnen/HB-CB-1001/vrijgeven', { body: { reservering_id: RES } }), ctx('HB-CB-1001'));
        expect(een.status).toBe(200);
        expect(CadeaubonVrijgevenAntwoord.parse(await een.json())).toEqual({ reservering_id: RES, vrijgegeven: true, beschikbaar_cents: 1850 });
        const twee = await vrijgevenPOST(verzoek('cadeaubonnen/HB-CB-1001/vrijgeven', { body: { reservering_id: RES } }), ctx('HB-CB-1001'));
        expect(CadeaubonVrijgevenAntwoord.parse(await twee.json()).vrijgegeven).toBe(false);
        await fout(await vrijgevenPOST(verzoek('cadeaubonnen/HB-CB-1001/vrijgeven', { body: {} }), ctx('HB-CB-1001')), 400, 'ongeldig_verzoek');
    });
});
