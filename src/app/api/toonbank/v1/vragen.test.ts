/**
 * Tests voor de Toonbank-API v1, BA-8: catalogus, vrij, wegzetten (lijst,
 * afvinken, ongedaan), afhaallijst en scan. De geheugen-opslag geeft wat de
 * databasefuncties zouden geven (die zelf getest worden in
 * supabase/tests/toonbank_vragen.sql); hier gaat het om de vorm van het
 * contract, ETag/304, de vertaling van uitkomsten naar HTTP en idempotentie.
 * Elk antwoord wordt tegen de zod-schema's gelegd.
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import {
    AfhaallijstAntwoord, CatalogusAntwoord, FoutAlOpgehaald, FoutAntwoord, FoutNietBetaald, FoutNietZelfdeDag, FoutTeWeinigVoorraad,
    OngedaanAntwoord, ScanAntwoord, VrijAntwoord, WegzetAntwoord, WegzettenAntwoord,
} from '@/lib/toonbank/contract';
import { maakToonbankGeheugenStore, type ToonbankGeheugenStore } from '@/lib/toonbank/geheugenStore';
import { genereerSessieToken, genereerSleutel } from '@/lib/toonbank/sleutel';
import type { WegzetVraag } from '@/lib/toonbank/store';

const houder = vi.hoisted(() => ({ store: null as unknown }));
vi.mock('@/lib/toonbank/supabaseStore', () => ({ maakToonbankSupabaseStore: () => houder.store }));

import { GET as catalogusGET } from './catalogus/route';
import { GET as vrijGET } from './vrij/route';
import { GET as wegzettenGET } from './wegzetten/route';
import { POST as apartPOST } from './wegzetten/[order_id]/route';
import { POST as ongedaanPOST } from './wegzetten/[order_id]/ongedaan/route';
import { GET as afhaallijstGET } from './afhaallijst/route';
import { GET as scanGET } from './scan/[code]/route';

const ORG = '00000000-0000-4000-8000-0000000000aa';
const T1 = '00000000-0000-4000-8000-000000000001';
const JAN = '10000000-0000-4000-8000-000000000001';
const NAOBER = '8e8f4864-9729-43e2-830e-98bd8eb188b4';
const WORST = 'b4031e10-fa38-4186-8d58-133ea69360d1';
const A_LOS = 'cdfad5ab-e04d-41d4-ba04-f34968b2125c';
const A_PAK = 'c6652e56-78a0-4681-8720-a7adcc9706b5';
const DOOS = 'ab'.repeat(32);
const sleutel = genereerSleutel();
const sessie = genereerSessieToken();

beforeAll(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://projectref.supabase.co';
});

let store: ToonbankGeheugenStore;
let ip = 0;

function resultaatVoor(v: WegzetVraag): Record<string, unknown> {
    switch (v.orderId) {
        case 1042: return v.actie === 'apart'
            ? { ok: true, uitkomst: 'apart', order_id: 1042, nummer: 'HB-2027-1042', bron: 'toonbank', boekingen: [{ regel_id: 77, product_id: NAOBER, hoeveelheid: -4, voorraad: 2, type: 'verkoop_online' }] }
            : { ok: true, uitkomst: 'ongedaan', order_id: 1042, nummer: 'HB-2027-1042', bron: 'toonbank', boekingen: [{ regel_id: 77, product_id: NAOBER, hoeveelheid: 4, voorraad: 6, type: 'retour' }] };
        case 1043: return { ok: false, sqlstate: 'WV010', melding: 'WV010: …', detail: { wv_code: 'WV010', order_id: 1043, nummer: 'HB-2027-1043', tekorten: [{ product_id: NAOBER, naam: 'Naober', ligt_er: 3, nodig: 4 }] } };
        case 1044: return { ok: false, sqlstate: 'WV006', melding: 'WV006: …', detail: { wv_code: 'WV006', order_id: 1044, nummer: 'HB-2027-1044', status: 'wacht' } };
        case 1045: return { ok: true, uitkomst: 'niet_zelfde_dag', order_id: 1045, nummer: 'HB-2027-1045', apart_gezet_at: '2027-03-05T15:10:00+00:00', boekingen: [] };
        case 1046: return { ok: false, sqlstate: 'WV011', melding: 'WV011: …', detail: { wv_code: 'WV011', order_id: 1046, nummer: 'HB-2027-1046', opgehaald_at: '2027-03-06T16:31:12.123456+00:00' } };
        case 1047: return { ok: true, uitkomst: 'geen_taak', order_id: 1047, nummer: 'HB-2027-1047', boekingen: [] };
        default: return { ok: false, sqlstate: 'P0002', melding: 'order niet in deze organisatie', detail: null };
    }
}

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
        stand: {
            [ORG]: {
                catalogus_versie: 412, voorraad_versie: 1183, vrij_verloopt_at: '2027-03-06T09:45:00+00:00', afhaallijst_versie: 1, wegzetten_open: 1,
                wegzetten_binnen_24u: 1, hoogste_bon_volgnummer: 0, te_controleren: 0,
                instellingen: { alcohol_toegestaan: true, contant_aan: true, contant_limiet_cents: 300000, beschikbaar_grens: 5 },
            },
        },
        catalogus: {
            [ORG]: {
                versie: 412, volledig: true,
                artikelen: [
                    {
                        artikel_id: A_LOS, naam: 'Naober', prijs_cents: 345, btw_pct: 21, btw_verdeling: null, alcohol: true, groep: 'bier', volgorde: 1, favoriet: true,
                        foto: { basis: `${ORG}/naober-1700000000`, breedte: 1024, hoogte: 1536, maten: [{ w: 640, h: 960 }, { w: 320, h: 480 }, { w: 160, h: 240 }], formaten: ['avif', 'webp'] },
                        foto_url_ruw: null, onderdelen: [{ product_id: NAOBER, hoeveelheid: 1, eenheid: 'stuk' }], actief: true, kanalen: ['webshop', 'toonbank'],
                    },
                    {
                        artikel_id: A_PAK, naam: 'Proefpakket', prijs_cents: 1495, btw_pct: 21, btw_verdeling: [{ pct: 21, gewicht: 1185 }, { pct: 9, gewicht: 595 }],
                        alcohol: true, groep: 'pakketten', volgorde: 1, favoriet: false, foto: null, foto_url_ruw: 'niet-een-url',
                        onderdelen: [{ product_id: NAOBER, hoeveelheid: 3, eenheid: 'stuk' }, { product_id: WORST, hoeveelheid: 1, eenheid: 'stuk' }], actief: true, kanalen: ['toonbank'],
                    },
                ],
                producten: [
                    { product_id: NAOBER, naam: 'Naober', statiegeld_cents: 15, voorraad_bijgehouden: true, alcohol: true },
                    { product_id: WORST, naam: 'Worst', statiegeld_cents: 0, voorraad_bijgehouden: false, alcohol: false },
                ],
                codes: [{ code: '2000000000015', soort: 'ean', artikel_id: A_LOS }],
                groepen: [{ groep_id: 'bier', naam: 'Bier', volgorde: 1, open_prijs: false, btw_pct: null, alcohol: false }, { groep_id: 'pakketten', naam: 'Pakketten', volgorde: 2, open_prijs: false, btw_pct: null, alcohol: false }],
            },
        },
        vrij: {
            [ORG]: {
                versie: 1183, volledig: true, vrij_verloopt_at: '2027-03-06T09:45:00+00:00',
                producten: [
                    { product_id: NAOBER, eenheid: 'stuk', ligt_er: 6.0, gereserveerd: 4.0, vrij: 2.0, bijgehouden: true,
                      reserveringen: [{ order_id: 1042, nummer: 'HB-2027-1042', naam: 'Jansen', afhaalmoment: '2027-03-06T15:30:00+00:00', aantal: 4.0 }] },
                    { product_id: WORST, eenheid: 'gram', ligt_er: null, gereserveerd: 0, vrij: null, bijgehouden: false, reserveringen: [] },
                ],
            },
        },
        wegzetTaken: {
            [ORG]: [{
                order_id: 1042, nummer: 'HB-2027-1042', naam: 'Jansen', afhaalmoment: '2027-03-06T15:30:00+00:00', ophalen_binnen_24u: true,
                regels: [{ regel_id: 77, artikel: 'Naober', aantal: 4, producten: [{ product_id: NAOBER, naam: 'Naober', hoeveelheid: 4, eenheid: 'stuk' }, { product_id: null, naam: 'zonder product', hoeveelheid: 1, eenheid: 'stuk' }] }],
            }],
        },
        afhaallijst: {
            [ORG]: {
                '2027-03-06': {
                    versie: 1772785200000, datum: '2027-03-06',
                    orders: [{ order_id: 1042, nummer: 'HB-2027-1042', naam: 'Jansen', afhaalmoment: '2027-03-06T15:30:00+00:00', alcohol: true, rest_cents: 450, status: 'betaald', apart_gezet: true,
                               dozen: [{ code: DOOS, omschrijving: 'Bierpakket', volgnr: 1, opgehaald_at: null }] }],
                },
            },
        },
        scan: {
            [ORG]: {
                '2000000000015': { soort: 'artikel', code: '2000000000015', artikel_id: A_LOS },
                [DOOS]: { soort: 'doos', code: DOOS, order_id: 1042, nummer: 'HB-2027-1042' },
            },
        },
        wegzetResultaat: resultaatVoor,
    });
    houder.store = store;
});

function verzoek(pad: string, o: { body?: unknown; medewerker?: string | null; inm?: string } = {}): NextRequest {
    const headers = new Headers({
        'content-type': 'application/json', 'x-forwarded-for': `10.1.0.${++ip % 250}`,
        'x-toonbank-contract': '1.1.0', 'x-toonbank-sleutel': sleutel.sleutel, 'x-toonbank-app': '0.1.0',
    });
    if (o.medewerker !== null) headers.set('x-toonbank-medewerker', o.medewerker ?? sessie.token);
    if (o.inm) headers.set('if-none-match', o.inm);
    return new NextRequest(`http://localhost:3000/api/toonbank/v1/${pad}`, {
        method: o.body !== undefined ? 'POST' : 'GET', headers, body: o.body !== undefined ? JSON.stringify(o.body) : undefined,
    });
}

const ctx = <P extends Record<string, string>>(p: P) => ({ params: Promise.resolve(p) });
const geen = ctx({} as Record<string, never>);
const gebeurtenis = () => crypto.randomUUID();
const moment = '2027-03-06T10:15:00+01:00';

async function fout(res: Response, status: number, code: string): Promise<unknown> {
    expect(res.status).toBe(status);
    const b = await res.json();
    expect(FoutAntwoord.parse(b).fout.code).toBe(code);
    return b;
}

describe('GET catalogus', () => {
    it('volgens het contract, met ETag en een foto van 256+ px', async () => {
        const res = await catalogusGET(verzoek('catalogus?sinds=400'), geen);
        expect(res.status).toBe(200);
        expect(res.headers.get('etag')).toBe('W/"catalogus-412"');
        const b = CatalogusAntwoord.parse(await res.json());
        expect(b.volledig).toBe(true);
        expect(b.artikelen[0]!.foto_url).toBe(`https://projectref.supabase.co/storage/v1/object/public/winkel-fotos/${ORG}/naober-1700000000-320.webp`);
        expect(b.artikelen[1]!.foto_url).toBeNull();
        expect(b.producten.find((p) => p.product_id === NAOBER)!.statiegeld_cents).toBe(15);
    });

    it('dezelfde versie met if-none-match: 304 zonder body; sinds geen getal: 400', async () => {
        const res = await catalogusGET(verzoek('catalogus', { inm: 'W/"catalogus-412"' }), geen);
        expect(res.status).toBe(304);
        expect(res.headers.get('etag')).toBe('W/"catalogus-412"');
        expect((await catalogusGET(verzoek('catalogus', { inm: '"catalogus-411"' }), geen)).status).toBe(200);
        await fout(await catalogusGET(verzoek('catalogus?sinds=abc'), geen), 400, 'ongeldig_verzoek');
    });
});

describe('GET vrij', () => {
    it('volgens het contract, getallen en tijden netjes, met ETag op versie en verloopmoment', async () => {
        const res = await vrijGET(verzoek('vrij?sinds=1180'), geen);
        expect(res.status).toBe(200);
        const b = VrijAntwoord.parse(await res.json());
        expect(b.producten[0]).toEqual({
            product_id: NAOBER, eenheid: 'stuk', ligt_er: 6, gereserveerd: 4, vrij: 2, bijgehouden: true,
            reserveringen: [{ order_id: 1042, nummer: 'HB-2027-1042', naam: 'Jansen', afhaalmoment: '2027-03-06T15:30:00.000Z', aantal: 4 }],
        });
        const tag = res.headers.get('etag')!;
        expect(tag).toBe(`W/"vrij-1183-${Date.parse('2027-03-06T09:45:00Z')}"`);
        expect((await vrijGET(verzoek('vrij', { inm: tag }), geen)).status).toBe(304);
        /* De reservering verliep: zelfde versie, ander verloopmoment → geen 304. */
        store.g.stand[ORG]!.vrij_verloopt_at = null;
        expect((await vrijGET(verzoek('vrij', { inm: tag }), geen)).status).toBe(200);
    });
});

describe('GET wegzetten', () => {
    it('de open taken, zonder onderdelen zonder product', async () => {
        const b = WegzettenAntwoord.parse(await (await wegzettenGET(verzoek('wegzetten'), geen)).json());
        expect(b.taken).toHaveLength(1);
        expect(b.taken[0]!.regels[0]!.producten).toEqual([{ product_id: NAOBER, naam: 'Naober', hoeveelheid: 4 }]);
        expect(JSON.stringify(b)).not.toMatch(/@|telefoon|email/);
    });
});

describe('POST wegzetten/{order_id}', () => {
    it('zonder ingelogde medewerker: 403 medewerker_sessie_verlopen', async () => {
        await fout(await apartPOST(verzoek('wegzetten/1042', { body: { gebeurtenis_id: gebeurtenis(), moment }, medewerker: null }), ctx({ order_id: '1042' })), 403, 'medewerker_sessie_verlopen');
        expect(store.g.wegzetUitgevoerd).toBe(0);
    });

    it('apart: 200 met de nieuwe voorraadversie; een herhaling geeft hetzelfde zonder opnieuw uit te voeren', async () => {
        const g = gebeurtenis();
        const res = await apartPOST(verzoek('wegzetten/1042', { body: { gebeurtenis_id: g, moment } }), ctx({ order_id: '1042' }));
        expect(res.status).toBe(200);
        const b = WegzetAntwoord.parse(await res.json());
        expect(b).toEqual({ uitkomst: 'apart', voorraad_versie: 1183, boekingen: [{ regel_id: 77, product_id: NAOBER, hoeveelheid: -4, voorraad: 2, type: 'verkoop_online' }] });
        const nog = WegzetAntwoord.parse(await (await apartPOST(verzoek('wegzetten/1042', { body: { gebeurtenis_id: g, moment } }), ctx({ order_id: '1042' }))).json());
        expect(nog).toEqual(b);
        expect(store.g.wegzetUitgevoerd).toBe(1);
        expect(store.g.journaal[0]!.payload).toMatchObject({ order_id: 1042, actie: 'apart', medewerker_id: JAN });
        /* Hetzelfde gebeurtenis_id voor een andere order: 400. */
        await fout(await apartPOST(verzoek('wegzetten/1047', { body: { gebeurtenis_id: g, moment } }), ctx({ order_id: '1047' })), 400, 'ongeldig_verzoek');
    });

    it('geen_taak: 200', async () => {
        const b = WegzetAntwoord.parse(await (await apartPOST(verzoek('wegzetten/1047', { body: { gebeurtenis_id: gebeurtenis(), moment } }), ctx({ order_id: '1047' }))).json());
        expect(b.uitkomst).toBe('geen_taak');
    });

    it('WV010: 422 te_weinig_voorraad met de tekorten; WV006: 409 niet_betaald; onbekend: 404', async () => {
        const wv010 = FoutTeWeinigVoorraad.parse(await fout(await apartPOST(verzoek('wegzetten/1043', { body: { gebeurtenis_id: gebeurtenis(), moment } }), ctx({ order_id: '1043' })), 422, 'te_weinig_voorraad'));
        expect(wv010.fout.details.tekorten).toEqual([{ product_id: NAOBER, naam: 'Naober', ligt_er: 3, nodig: 4 }]);
        expect(wv010.fout.melding).toBe('Er liggen er 3 Naober, deze order vraagt er 4. Er is niets apart gezet. Tel het schap en corrigeer de voorraad in BBQ Architect.');
        FoutNietBetaald.parse(await fout(await apartPOST(verzoek('wegzetten/1044', { body: { gebeurtenis_id: gebeurtenis(), moment } }), ctx({ order_id: '1044' })), 409, 'niet_betaald'));
        await fout(await apartPOST(verzoek('wegzetten/99', { body: { gebeurtenis_id: gebeurtenis(), moment } }), ctx({ order_id: '99' })), 404, 'niet_gevonden');
        await fout(await apartPOST(verzoek('wegzetten/abc', { body: { gebeurtenis_id: gebeurtenis(), moment } }), ctx({ order_id: 'abc' })), 404, 'niet_gevonden');
    });

    it('een body zonder gebeurtenis_id of met een tijd zonder zone: 400', async () => {
        await fout(await apartPOST(verzoek('wegzetten/1042', { body: { moment } }), ctx({ order_id: '1042' })), 400, 'ongeldig_verzoek');
        await fout(await apartPOST(verzoek('wegzetten/1042', { body: { gebeurtenis_id: gebeurtenis(), moment: '2027-03-06 10:15' } }), ctx({ order_id: '1042' })), 400, 'ongeldig_verzoek');
        expect(store.g.wegzetUitgevoerd).toBe(0);
    });
});

describe('POST wegzetten/{order_id}/ongedaan', () => {
    it('ongedaan: 200 met retour; de reden gaat mee in het journaal', async () => {
        const b = OngedaanAntwoord.parse(await (await ongedaanPOST(verzoek('wegzetten/1042/ongedaan', { body: { gebeurtenis_id: gebeurtenis(), moment, reden: 'verkeerde krat' } }), ctx({ order_id: '1042' }))).json());
        expect(b).toMatchObject({ uitkomst: 'ongedaan', boekingen: [{ hoeveelheid: 4, type: 'retour' }] });
        expect(store.g.journaal[0]!.payload).toMatchObject({ actie: 'ongedaan', reden: 'verkeerde krat' });
    });

    it('een eerdere dag: 422 niet_zelfde_dag; al opgehaald: 422 al_opgehaald (WV011)', async () => {
        const z = FoutNietZelfdeDag.parse(await fout(await ongedaanPOST(verzoek('wegzetten/1045/ongedaan', { body: { gebeurtenis_id: gebeurtenis(), moment } }), ctx({ order_id: '1045' })), 422, 'niet_zelfde_dag'));
        expect(z.fout.details.apart_gezet_at).toBe('2027-03-05T15:10:00.000Z');
        const o = FoutAlOpgehaald.parse(await fout(await ongedaanPOST(verzoek('wegzetten/1046/ongedaan', { body: { gebeurtenis_id: gebeurtenis(), moment } }), ctx({ order_id: '1046' })), 422, 'al_opgehaald'));
        expect(o.fout.details.opgehaald_at).toBe('2027-03-06T16:31:12.123Z');
    });
});

describe('GET afhaallijst', () => {
    it('volgens het contract; een ontbrekende of onmogelijke datum: 400', async () => {
        const b = AfhaallijstAntwoord.parse(await (await afhaallijstGET(verzoek('afhaallijst?datum=2027-03-06'), geen)).json());
        expect(b.orders[0]).toMatchObject({ order_id: 1042, naam: 'Jansen', rest_cents: 450, apart_gezet: true, dozen: [{ code: DOOS, volgnr: 1, opgehaald_at: null }] });
        await fout(await afhaallijstGET(verzoek('afhaallijst'), geen), 400, 'ongeldig_verzoek');
        await fout(await afhaallijstGET(verzoek('afhaallijst?datum=2027-02-30'), geen), 400, 'ongeldig_verzoek');
        expect(AfhaallijstAntwoord.parse(await (await afhaallijstGET(verzoek('afhaallijst?datum=2027-03-07'), geen)).json()).orders).toEqual([]);
    });
});

describe('GET scan/{code}', () => {
    it('EAN → artikel, doos-URL → doos, de rest onbekend', async () => {
        expect(ScanAntwoord.parse(await (await scanGET(verzoek('scan/2000000000015'), ctx({ code: '2000000000015' }))).json()))
            .toEqual({ soort: 'artikel', code: '2000000000015', artikel_id: A_LOS });
        const url = `https://hopbites.nl/g/${DOOS.toUpperCase()}`;
        expect(ScanAntwoord.parse(await (await scanGET(verzoek(`scan/${encodeURIComponent(url)}`), ctx({ code: url }))).json()))
            .toEqual({ soort: 'doos', code: DOOS, order_id: 1042, nummer: 'HB-2027-1042' });
        expect(ScanAntwoord.parse(await (await scanGET(verzoek('scan/kassabon'), ctx({ code: ' kassabon ' }))).json()))
            .toEqual({ soort: 'onbekend', code: 'kassabon' });
    });
});
