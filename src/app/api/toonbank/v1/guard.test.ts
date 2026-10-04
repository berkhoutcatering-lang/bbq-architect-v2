/**
 * Tests voor de Toonbank-API v1, BA-7b: de guard (CORS, contractversie,
 * sleutel, snelheid, body) en de routes koppelen, medewerkers, inloggen en
 * status. De opslag is de geheugen-opslag; elk antwoord wordt tegen de
 * zod-schema's van het contract gelegd (src/lib/toonbank/contract.ts).
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { hashPin } from '@/lib/prep/deviceAuth';
import { EigenaarcodeAntwoord, FoutAntwoord, InlogAntwoord, KoppelAntwoord, MedewerkersAntwoord, StatusAntwoord } from '@/lib/toonbank/contract';
import { maakToonbankGeheugenStore, type GeheugenApparaat, type ToonbankGeheugenStore } from '@/lib/toonbank/geheugenStore';
import { hashKoppelcode } from '@/lib/toonbank/koppelcode';
import { genereerSleutel } from '@/lib/toonbank/sleutel';

const houder = vi.hoisted(() => ({ store: null as unknown }));
vi.mock('@/lib/toonbank/supabaseStore', () => ({ maakToonbankSupabaseStore: () => houder.store }));

import { POST as koppelenPOST, OPTIONS as koppelenOPTIONS } from './koppelen/route';
import { GET as medewerkersGET } from './medewerkers/route';
import { POST as inloggenPOST } from './inloggen/route';
import { GET as statusGET } from './status/route';

const ORG = '00000000-0000-4000-8000-0000000000aa';
const ANDER = '00000000-0000-4000-8000-0000000000bb';
const T1 = '00000000-0000-4000-8000-000000000001';
const T9 = '00000000-0000-4000-8000-000000000009';
const NIEUW = '00000000-0000-4000-8000-000000000003';
const JAN = '10000000-0000-4000-8000-000000000001';
const EIG = '10000000-0000-4000-8000-000000000002';
const PIET = '10000000-0000-4000-8000-000000000003';
const ORIGIN = 'http://localhost:5173';

let pinJan: string;
let pinEig: string;
let koppelHash: string;
const sleutelT1 = genereerSleutel();
const sleutelT9 = genereerSleutel();
/* Alleen voor de snelheidstest: de teller per apparaat leeft in het geheugen van de module. */
const sleutelT5 = genereerSleutel();
const T5 = '00000000-0000-4000-8000-000000000005';

beforeAll(async () => {
    process.env.TOONBANK_ORIGINS = `${ORIGIN}, https://toonbank.hopbites.nl/`;
    pinJan = await hashPin('4826');
    pinEig = await hashPin('739104');
    koppelHash = await hashKoppelcode('042917');
});

let ipTeller = 0;
let store: ToonbankGeheugenStore;

function apparaat(id: string, org: string, code: string, extra: Partial<GeheugenApparaat> = {}): GeheugenApparaat {
    return {
        id, organization_id: org, naam: `Toonbank ${code}`, code, locatie: 'winkel', ingetrokken_at: null,
        hoogste_volgnummer_gemeld: 0, bevestigd_tot_volgnummer: 0,
        sleutel_hash: null, sleutel_prefix: null, koppelcode_hash: null, koppelcode_geldig_tot: null, koppelpogingen: 0, ...extra,
    };
}

beforeEach(() => {
    store = maakToonbankGeheugenStore({
        nu: new Date(),
        apparaten: [
            apparaat(T1, ORG, 'T1', { sleutel_hash: sleutelT1.hash, sleutel_prefix: sleutelT1.prefix }),
            apparaat(T9, ORG, 'T9', { sleutel_hash: sleutelT9.hash, ingetrokken_at: new Date().toISOString() }),
            apparaat(T5, ORG, 'T5', { sleutel_hash: sleutelT5.hash }),
            apparaat(NIEUW, ORG, 'T2', { koppelcode_hash: koppelHash, koppelcode_geldig_tot: new Date(Date.now() + 5 * 60_000).toISOString() }),
        ],
        medewerkers: [
            { id: JAN, organization_id: ORG, naam: 'Jan', actief: true, toonbank_rol: 'medewerker', kds_pin_hash: pinJan, kds_pin_lockout_until: null },
            { id: EIG, organization_id: ORG, naam: 'Mathijs', actief: true, toonbank_rol: 'eigenaar', kds_pin_hash: pinEig, kds_pin_lockout_until: null },
            { id: PIET, organization_id: ORG, naam: 'Piet', actief: true, toonbank_rol: null, kds_pin_hash: pinJan, kds_pin_lockout_until: null },
            { id: '10000000-0000-4000-8000-000000000009', organization_id: ANDER, naam: 'Vreemd', actief: true, toonbank_rol: 'eigenaar', kds_pin_hash: pinJan, kds_pin_lockout_until: null },
        ],
        stand: {
            [ORG]: {
                catalogus_versie: 412, voorraad_versie: 1181, vrij_verloopt_at: '2027-03-06T09:45:00.000Z', afhaallijst_versie: 1772785200000,
                wegzetten_open: 1, wegzetten_binnen_24u: 1, hoogste_bon_volgnummer: 411, te_controleren: 0,
                instellingen: { alcohol_toegestaan: true, contant_aan: true, contant_limiet_cents: 300000, beschikbaar_grens: 5 },
            },
        },
    });
    houder.store = store;
});

interface Opties { methode?: 'GET' | 'POST' | 'OPTIONS'; sleutel?: string | null; contract?: string | null; origin?: string | null; body?: unknown; ruweBody?: string; medewerker?: string; ip?: string }

function verzoek(pad: string, o: Opties = {}): NextRequest {
    const headers = new Headers({ 'content-type': 'application/json', 'x-forwarded-for': o.ip ?? `10.0.0.${++ipTeller % 250}` });
    if (o.contract !== null) headers.set('x-toonbank-contract', o.contract ?? '1.1.0');
    if (o.sleutel !== null && o.sleutel !== undefined) headers.set('x-toonbank-sleutel', o.sleutel);
    if (o.origin) headers.set('origin', o.origin);
    if (o.medewerker) headers.set('x-toonbank-medewerker', o.medewerker);
    headers.set('x-toonbank-app', '0.1.0');
    const methode = o.methode ?? (o.body !== undefined || o.ruweBody !== undefined ? 'POST' : 'GET');
    return new NextRequest(`http://localhost:3000/api/toonbank/v1/${pad}`, {
        method: methode,
        headers,
        body: methode === 'POST' ? (o.ruweBody ?? JSON.stringify(o.body ?? {})) : undefined,
    });
}

const geen = { params: Promise.resolve({}) } as { params: Promise<Record<string, never>> };

async function json(res: Response): Promise<unknown> {
    return res.status === 204 || res.status === 304 ? null : res.json();
}

async function verwachtFout(res: Response, status: number, code: string) {
    expect(res.status).toBe(status);
    const b = await json(res);
    expect(FoutAntwoord.parse(b).fout.code).toBe(code);
    return (b as { fout: { details: Record<string, unknown> } }).fout;
}

describe('guard', () => {
    it('geen of een te oude contractversie: 426 met minimaal en huidig', async () => {
        const f = await verwachtFout(await medewerkersGET(verzoek('medewerkers', { sleutel: sleutelT1.sleutel, contract: null }), geen), 426, 'contract_verouderd');
        expect(f.details).toMatchObject({ minimaal: '1.1.0', huidig: '1.1.0' });
        await verwachtFout(await medewerkersGET(verzoek('medewerkers', { sleutel: sleutelT1.sleutel, contract: '0.9.3' }), geen), 426, 'contract_verouderd');
        /* Review M2 (klein 12): minimaal 1.1.0, zoals het voorbeeld status.json. */
        await verwachtFout(await medewerkersGET(verzoek('medewerkers', { sleutel: sleutelT1.sleutel, contract: '1.0.0' }), geen), 426, 'contract_verouderd');
        expect((await medewerkersGET(verzoek('medewerkers', { sleutel: sleutelT1.sleutel, contract: '1.1.0' }), geen)).status).toBe(200);
    });

    it('sleutel: ontbreekt of onbekend = 401 sleutel_onbekend, ingetrokken = 401 sleutel_ingetrokken', async () => {
        await verwachtFout(await medewerkersGET(verzoek('medewerkers'), geen), 401, 'sleutel_onbekend');
        await verwachtFout(await medewerkersGET(verzoek('medewerkers', { sleutel: 'ext_abc' }), geen), 401, 'sleutel_onbekend');
        await verwachtFout(await medewerkersGET(verzoek('medewerkers', { sleutel: genereerSleutel().sleutel }), geen), 401, 'sleutel_onbekend');
        await verwachtFout(await medewerkersGET(verzoek('medewerkers', { sleutel: sleutelT9.sleutel }), geen), 401, 'sleutel_ingetrokken');
    });

    it('CORS: alleen TOONBANK_ORIGINS, met ETag en Retry-After leesbaar', async () => {
        const goed = await medewerkersGET(verzoek('medewerkers', { sleutel: sleutelT1.sleutel, origin: ORIGIN }), geen);
        expect(goed.status).toBe(200);
        expect(goed.headers.get('access-control-allow-origin')).toBe(ORIGIN);
        expect(goed.headers.get('access-control-expose-headers')).toBe('ETag, Retry-After');
        const ookGoed = await medewerkersGET(verzoek('medewerkers', { sleutel: sleutelT1.sleutel, origin: 'https://toonbank.hopbites.nl' }), geen);
        expect(ookGoed.headers.get('access-control-allow-origin')).toBe('https://toonbank.hopbites.nl');
        const fout = await medewerkersGET(verzoek('medewerkers', { sleutel: sleutelT1.sleutel, origin: 'https://kwaad.example' }), geen);
        await verwachtFout(fout, 403, 'geen_recht');
        expect(fout.headers.get('access-control-allow-origin')).toBeNull();
        const pre = await koppelenOPTIONS(verzoek('koppelen', { methode: 'OPTIONS', origin: ORIGIN }));
        expect(pre.status).toBe(204);
        expect(pre.headers.get('access-control-allow-headers')).toContain('x-toonbank-sleutel');
        expect(pre.headers.get('access-control-allow-headers')).toContain('if-none-match');
        const preKwaad = await koppelenOPTIONS(verzoek('koppelen', { methode: 'OPTIONS', origin: 'https://kwaad.example' }));
        expect(preKwaad.headers.get('access-control-allow-origin')).toBeNull();
    });

    it('body: te groot = 413 te_groot, geen JSON = 400 ongeldig_verzoek, verkeerde velden = 400', async () => {
        await verwachtFout(await inloggenPOST(verzoek('inloggen', { sleutel: sleutelT1.sleutel, ruweBody: JSON.stringify({ x: 'a'.repeat(5000) }) }), geen), 413, 'te_groot');
        await verwachtFout(await inloggenPOST(verzoek('inloggen', { sleutel: sleutelT1.sleutel, ruweBody: '{kapot' }), geen), 400, 'ongeldig_verzoek');
        const f = await verwachtFout(await inloggenPOST(verzoek('inloggen', { sleutel: sleutelT1.sleutel, body: { medewerker_id: JAN, inlogcode: '12', doel: 'sessie' } }), geen), 400, 'ongeldig_verzoek');
        expect(JSON.stringify(f.details)).toContain('inlogcode');
    });

    it('de sleutel vóór de body (review M2, klein 6): zonder geldige sleutel 401, ook bij een te grote of kapotte body', async () => {
        await verwachtFout(await inloggenPOST(verzoek('inloggen', { sleutel: null, ruweBody: JSON.stringify({ x: 'a'.repeat(5000) }) }), geen), 401, 'sleutel_onbekend');
        await verwachtFout(await inloggenPOST(verzoek('inloggen', { sleutel: genereerSleutel().sleutel, ruweBody: '{kapot' }), geen), 401, 'sleutel_onbekend');
    });

    it('snelheid per apparaat: 429 te_snel met Retry-After', async () => {
        let laatste: Response | null = null;
        for (let i = 0; i < 301; i++) laatste = await medewerkersGET(verzoek('medewerkers', { sleutel: sleutelT5.sleutel }), geen);
        const f = await verwachtFout(laatste!, 429, 'te_snel');
        expect(Number(laatste!.headers.get('retry-after'))).toBeGreaterThan(0);
        expect(f.details.retry_after).toBeGreaterThan(0);
    });

    it('elk antwoord: Cache-Control no-store', async () => {
        const res = await medewerkersGET(verzoek('medewerkers', { sleutel: sleutelT1.sleutel }), geen);
        expect(res.headers.get('cache-control')).toBe('no-store');
    });
});

describe('POST koppelen', () => {
    it('juiste code: sleutel één keer, daarna werkt hij; de code werkt geen tweede keer', async () => {
        const res = await koppelenPOST(verzoek('koppelen', { body: { koppelcode: '042917', naam: 'Tablet van de tablet' } }), geen);
        expect(res.status).toBe(200);
        const k = KoppelAntwoord.parse(await res.json());
        expect(k).toMatchObject({ apparaat_id: NIEUW, code: 'T2' });
        expect(store.g.apparaten.find((a) => a.id === NIEUW)!.sleutel_hash).not.toBe(k.sleutel);
        expect((await medewerkersGET(verzoek('medewerkers', { sleutel: k.sleutel }), geen)).status).toBe(200);
        await verwachtFout(await koppelenPOST(verzoek('koppelen', { body: { koppelcode: '042917' } }), geen), 403, 'koppelcode_ongeldig');
    });

    it('foute code: 403 koppelcode_ongeldig (nooit 401); na 5 fouten vervalt de code', async () => {
        for (let i = 0; i < 5; i++) {
            await verwachtFout(await koppelenPOST(verzoek('koppelen', { body: { koppelcode: '111111' } }), geen), 403, 'koppelcode_ongeldig');
        }
        await verwachtFout(await koppelenPOST(verzoek('koppelen', { body: { koppelcode: '042917' } }), geen), 403, 'koppelcode_ongeldig');
        expect(store.g.apparaten.find((a) => a.id === NIEUW)!.koppelcode_hash).toBeNull();
    });

    it('geen 6 cijfers: 400; meer dan 10 per minuut per IP: 429', async () => {
        await verwachtFout(await koppelenPOST(verzoek('koppelen', { body: { koppelcode: '12345' } }), geen), 400, 'ongeldig_verzoek');
        let laatste: Response | null = null;
        for (let i = 0; i < 11; i++) laatste = await koppelenPOST(verzoek('koppelen', { body: { koppelcode: 'x' }, ip: '192.168.1.77' }), geen);
        await verwachtFout(laatste!, 429, 'te_snel');
    });
});

describe('GET medewerkers', () => {
    it('alleen de eigen organisatie, alleen met een rol; geen inloggegevens', async () => {
        const res = await medewerkersGET(verzoek('medewerkers?organization_id=' + ANDER, { sleutel: sleutelT1.sleutel }), geen);
        const b = await res.json();
        expect(MedewerkersAntwoord.parse(b)).toEqual({
            medewerkers: [
                { medewerker_id: JAN, naam: 'Jan', rol: 'medewerker' },
                { medewerker_id: EIG, naam: 'Mathijs', rol: 'eigenaar' },
            ],
        });
        expect(JSON.stringify(b)).not.toMatch(/pin|hash|lockout/);
    });
});

describe('POST inloggen', () => {
    it('dienst: sessie die de guard herkent', async () => {
        const res = await inloggenPOST(verzoek('inloggen', { sleutel: sleutelT1.sleutel, body: { medewerker_id: JAN, inlogcode: '4826', doel: 'sessie' } }), geen);
        expect(res.status).toBe(200);
        const a = InlogAntwoord.parse(await res.json());
        expect(a.naam).toBe('Jan');
        expect(store.g.sessies[0]).toMatchObject({ apparaat_id: T1, organization_id: ORG, doel: 'dienst' });
    });

    it('foute code: 403 inlogcode_onjuist met pogingen_over, nooit 401', async () => {
        const f = await verwachtFout(await inloggenPOST(verzoek('inloggen', { sleutel: sleutelT1.sleutel, body: { medewerker_id: JAN, inlogcode: '0000', doel: 'sessie' } }), geen), 403, 'inlogcode_onjuist');
        expect(f.details.pogingen_over).toBe(4);
    });

    it('eigenaarcode: 60 s goedkeuring; een medewerker of andere organisatie: geen_recht', async () => {
        const res = await inloggenPOST(verzoek('inloggen', { sleutel: sleutelT1.sleutel, body: { medewerker_id: EIG, inlogcode: '739104', doel: 'vrij_overschrijden' } }), geen);
        expect(res.status).toBe(200);
        const e = EigenaarcodeAntwoord.parse(await res.json());
        expect(new Date(e.geldig_tot).getTime() - Date.now()).toBeLessThanOrEqual(60_000);
        await verwachtFout(await inloggenPOST(verzoek('inloggen', { sleutel: sleutelT1.sleutel, body: { medewerker_id: JAN, inlogcode: '4826', doel: 'vrij_overschrijden' } }), geen), 403, 'geen_recht');
        await verwachtFout(await inloggenPOST(verzoek('inloggen', { sleutel: sleutelT1.sleutel, body: { medewerker_id: PIET, inlogcode: '4826', doel: 'sessie' } }), geen), 403, 'geen_recht');
        await verwachtFout(await inloggenPOST(verzoek('inloggen', { sleutel: sleutelT1.sleutel, body: { medewerker_id: '10000000-0000-4000-8000-000000000009', inlogcode: '4826', doel: 'sessie' } }), geen), 403, 'geen_recht');
    });

    it('5 keer fout: 403 medewerker_geblokkeerd', async () => {
        let laatste: Response | null = null;
        for (let i = 0; i < 5; i++) laatste = await inloggenPOST(verzoek('inloggen', { sleutel: sleutelT1.sleutel, body: { medewerker_id: EIG, inlogcode: '000000', doel: 'vrij_overschrijden' } }), geen);
        const f = await verwachtFout(laatste!, 403, 'medewerker_geblokkeerd');
        expect(f.details.geblokkeerd_tot).toBeTruthy();
    });
});

describe('GET status', () => {
    it('volgens het contract, met huidig 1.1.0 en minimaal 1.1.0; het volgnummer gaat nooit omlaag', async () => {
        const res = await statusGET(verzoek('status?volgnummer=1202', { sleutel: sleutelT1.sleutel }), geen);
        expect(res.status).toBe(200);
        const s = StatusAntwoord.parse(await res.json());
        expect(s.contract).toEqual({ huidig: '1.1.0', minimaal: '1.1.0' });
        expect(s.apparaat).toEqual({ apparaat_id: T1, code: 'T1', naam: 'Toonbank T1' });
        expect(s).toMatchObject({ catalogus_versie: 412, voorraad_versie: 1181, wegzetten_open: 1, hoogste_volgnummer_gemeld: 1202, hoogste_bon_volgnummer: 411 });
        const s2 = StatusAntwoord.parse(await (await statusGET(verzoek('status?volgnummer=3', { sleutel: sleutelT1.sleutel }), geen)).json());
        expect(s2.hoogste_volgnummer_gemeld).toBe(1202);
        const s3 = StatusAntwoord.parse(await (await statusGET(verzoek('status', { sleutel: sleutelT1.sleutel }), geen)).json());
        expect(s3.hoogste_volgnummer_gemeld).toBe(1202);
    });

    it('een volgnummer dat geen getal is: 400', async () => {
        await verwachtFout(await statusGET(verzoek('status?volgnummer=-1', { sleutel: sleutelT1.sleutel }), geen), 400, 'ongeldig_verzoek');
    });

    it('een fout in de opslag: 500 serverfout, zonder sleutel in de melding', async () => {
        const kapot = { ...store, status: async () => { throw new Error('verbinding weg'); } };
        houder.store = kapot;
        const res = await statusGET(verzoek('status', { sleutel: sleutelT1.sleutel }), geen);
        const f = await verwachtFout(res, 500, 'serverfout');
        expect(JSON.stringify(f)).not.toContain(sleutelT1.sleutel);
    });
});
