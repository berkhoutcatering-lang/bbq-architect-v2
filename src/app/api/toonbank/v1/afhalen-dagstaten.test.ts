/**
 * Tests voor BA-10: POST orders/{order_id}/ophalen, POST dozen/{code}/ophalen,
 * GET dagstaat en POST dagstaten. De geheugen-opslag geeft wat de
 * databasefuncties geven (die zelf getest worden in
 * supabase/tests/toonbank_ophalen.sql en toonbank_dagstaat.sql); hier gaat het
 * om de vorm van het contract, idempotentie, 400/403/426 en de voorbeelden.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { DagstaatOverzicht, DagstatenAntwoord, DoosOphalenAntwoord, FoutAntwoord, OrderOphalenAntwoord } from '@/lib/toonbank/contract';
import { maakToonbankGeheugenStore, type ToonbankGeheugenStore } from '@/lib/toonbank/geheugenStore';
import { genereerSessieToken, genereerSleutel } from '@/lib/toonbank/sleutel';
import type { OphaalVraag } from '@/lib/toonbank/store';

const houder = vi.hoisted(() => ({ store: null as unknown, na: [] as { orgId: string; productIds: string[] }[] }));
vi.mock('@/lib/toonbank/supabaseStore', () => ({ maakToonbankSupabaseStore: () => houder.store }));
vi.mock('@/lib/toonbank/naAfloop', () => ({ naToonbankBoekingen: (orgId: string, productIds: string[]) => { houder.na.push({ orgId, productIds }); } }));

import { POST as orderPOST } from './orders/[order_id]/ophalen/route';
import { POST as doosPOST } from './dozen/[code]/ophalen/route';
import { GET as dagstaatGET } from './dagstaat/route';
import { POST as dagstatenPOST } from './dagstaten/route';

const ORG = '00000000-0000-4000-8000-0000000000aa';
const T1 = '00000000-0000-4000-8000-000000000001';
const JAN = '10000000-0000-4000-8000-000000000001';
const NAOBER = '8e8f4864-9729-43e2-830e-98bd8eb188b4';
const DOOS = 'ab'.repeat(32);
const sleutel = genereerSleutel();
const sessie = genereerSessieToken();
const MAP = path.join(__dirname, '..', '..', '..', '..', 'lib', 'toonbank', 'contract', 'voorbeelden');
const voorbeeld = (naam: string) => JSON.parse(readFileSync(path.join(MAP, naam), 'utf8')) as Record<string, unknown>;

let store: ToonbankGeheugenStore;
let ip = 0;

function ophaalResultaat(v: OphaalVraag): Record<string, unknown> {
    if (v.soort === 'order' && v.orderId === 1042) {
        if (!v.restMethode) return { uitkomst: 'rest_nodig', order_id: 1042, nummer: 'HB-2027-1042', rest_cents: 450, reeds_cents: 250 };
        return { uitkomst: 'opgehaald', order_id: 1042, nummer: 'HB-2027-1042', rest_cents: 450, opgehaald_at: '2027-03-06T15:32:41.123456+00:00', rest_geboekt: v.restMethode,
                 boekingen: [{ product_id: NAOBER, hoeveelheid: -4, voorraad: 2 }] };
    }
    if (v.soort === 'doos' && v.code === DOOS) {
        return v.leeftijd ? { uitkomst: 'opgehaald', order_id: 1050, nummer: 'HB-2027-1050', code: DOOS, nog_open: 1, rest_cents: 0, opgehaald_at: '2027-03-06T14:05:13+00:00', boekingen: [] }
                          : { uitkomst: 'leeftijd_nodig', order_id: 1050, nummer: 'HB-2027-1050', code: DOOS, nog_open: 2, rest_cents: 0, alcohol: true };
    }
    return { uitkomst: 'onbekend', order_id: v.orderId, code: v.code };
}

beforeEach(() => {
    houder.na = [];
    store = maakToonbankGeheugenStore({
        apparaten: [{
            id: T1, organization_id: ORG, naam: 'Toonbank winkel', code: 'T1', locatie: 'winkel', ingetrokken_at: null,
            hoogste_volgnummer_gemeld: 0, bevestigd_tot_volgnummer: 1214, sleutel_hash: sleutel.hash, sleutel_prefix: sleutel.prefix,
            koppelcode_hash: null, koppelcode_geldig_tot: null, koppelpogingen: 0,
        }],
        medewerkers: [{ id: JAN, organization_id: ORG, naam: 'Jan', actief: true, toonbank_rol: 'medewerker', kds_pin_hash: null, kds_pin_lockout_until: null }],
        sessies: [{
            id: '20000000-0000-4000-8000-000000000001', organization_id: ORG, apparaat_id: T1, medewerker_id: JAN, rol: 'medewerker', doel: 'dienst',
            geldig_tot: new Date(Date.now() + 3_600_000).toISOString(), beeindigd_at: null, token_hash: sessie.hash, aangemaakt_at: new Date().toISOString(),
        }],
        ophaalResultaat,
        dagstaatOverzicht: {
            [ORG]: { '2027-03-06': { datum: '2027-03-06', apparaat_code: 'T1', aantal_bonnen: '5', hoogste_bonnummer: 'T1-000416',
                omzet: [{ pct: 21, incl_cents: '4401', btw_cents: '764' }, { pct: 9, incl_cents: 1089, btw_cents: 90 }], pin_cents: 4540, contant_cents: 1535 } },
        },
    });
    houder.store = store;
});

function verzoek(pad: string, o: { body?: unknown; medewerker?: string | null; contract?: string } = {}): NextRequest {
    const headers = new Headers({
        'content-type': 'application/json', 'x-forwarded-for': `10.3.0.${++ip % 250}`,
        'x-toonbank-contract': o.contract ?? '1.1.0', 'x-toonbank-sleutel': sleutel.sleutel, 'x-toonbank-app': '0.1.0',
    });
    if (o.medewerker !== null) headers.set('x-toonbank-medewerker', o.medewerker ?? sessie.token);
    return new NextRequest(`http://localhost:3000/api/toonbank/v1/${pad}`, {
        method: o.body !== undefined ? 'POST' : 'GET', headers, body: o.body !== undefined ? JSON.stringify(o.body) : undefined,
    });
}

const ctx = <P extends Record<string, string>>(p: P) => ({ params: Promise.resolve(p) });
const geen = ctx({} as Record<string, never>);

async function fout(res: Response, status: number, code: string): Promise<unknown> {
    expect(res.status).toBe(status);
    const b = await res.json();
    expect(FoutAntwoord.parse(b).fout.code).toBe(code);
    return b;
}

describe('POST orders/{order_id}/ophalen', () => {
    it('het voorbeeld ophalen-rest: opgehaald, rest 0, met de medewerker en de bon; herhaling = hetzelfde', async () => {
        const body = voorbeeld('ophalen-rest.json');
        const res = await orderPOST(verzoek('orders/1042/ophalen', { body }), ctx({ order_id: '1042' }));
        expect(res.status).toBe(200);
        const b = OrderOphalenAntwoord.parse(await res.json());
        expect(b).toEqual({ uitkomst: 'opgehaald', order_id: 1042, nummer: 'HB-2027-1042', rest_cents: 0, opgehaald_at: '2027-03-06T15:32:41.123Z' });
        expect(store.g.journaal[0]!.payload).toMatchObject({ order_id: 1042, bon_id: body.bon_id, medewerker_id: JAN, rest: { methode: 'pin', bedrag_cents: 450 }, leeftijd: 'vastgesteld' });
        expect(houder.na).toEqual([{ orgId: ORG, productIds: [NAOBER] }]);

        const res2 = await orderPOST(verzoek('orders/1042/ophalen', { body }), ctx({ order_id: '1042' }));
        expect(OrderOphalenAntwoord.parse(await res2.json())).toEqual(b);
        expect(store.g.ophaalUitgevoerd).toBe(1);
        expect(houder.na[1]).toEqual({ orgId: ORG, productIds: [] });
        // Hetzelfde gebeurtenis_id voor een andere order: 400.
        await fout(await orderPOST(verzoek('orders/1043/ophalen', { body }), ctx({ order_id: '1043' })), 400, 'ongeldig_verzoek');
    });

    it('rest_nodig is een 200 met wat er nog betaald moet worden; onbekend ook', async () => {
        const body = { gebeurtenis_id: crypto.randomUUID(), moment: '2027-03-06T16:30:00+01:00', bon_id: null, rest: null, leeftijd: null };
        const b = OrderOphalenAntwoord.parse(await (await orderPOST(verzoek('orders/1042/ophalen', { body }), ctx({ order_id: '1042' }))).json());
        expect(b).toMatchObject({ uitkomst: 'rest_nodig', rest_cents: 450, opgehaald_at: null });
        const o = OrderOphalenAntwoord.parse(await (await orderPOST(verzoek('orders/9/ophalen', { body: { ...body, gebeurtenis_id: crypto.randomUUID() } }), ctx({ order_id: '9' }))).json());
        expect(o).toMatchObject({ uitkomst: 'onbekend', order_id: 9, nummer: null });
    });

    it('een rest zonder bon, zonder medewerker of met een rare order: geweigerd vóór de database', async () => {
        const body = { gebeurtenis_id: crypto.randomUUID(), moment: '2027-03-06T16:30:00+01:00', bon_id: null, rest: { methode: 'pin', bedrag_cents: 450 }, leeftijd: null };
        await fout(await orderPOST(verzoek('orders/1042/ophalen', { body }), ctx({ order_id: '1042' })), 400, 'ongeldig_verzoek');
        await fout(await orderPOST(verzoek('orders/1042/ophalen', { body: voorbeeld('ophalen-rest.json'), medewerker: null }), ctx({ order_id: '1042' })), 403, 'medewerker_sessie_verlopen');
        await fout(await orderPOST(verzoek('orders/abc/ophalen', { body: voorbeeld('ophalen-rest.json') }), ctx({ order_id: 'abc' })), 404, 'niet_gevonden');
        expect(store.g.ophaalUitgevoerd).toBe(0);
    });
});

describe('POST dozen/{code}/ophalen', () => {
    it('het voorbeeld doos-ophalen (met leeftijd): opgehaald, met code en nog_open', async () => {
        const res = await doosPOST(verzoek(`dozen/${DOOS}/ophalen`, { body: voorbeeld('doos-ophalen.json') }), ctx({ code: DOOS }));
        const b = DoosOphalenAntwoord.parse(await res.json());
        expect(b).toEqual({ uitkomst: 'opgehaald', order_id: 1050, nummer: 'HB-2027-1050', rest_cents: 0, opgehaald_at: '2027-03-06T14:05:13.000Z', code: DOOS, nog_open: 1 });
    });

    it('alcohol zonder leeftijd: leeftijd_nodig; een volledige doos-URL wordt de code', async () => {
        const body = { gebeurtenis_id: crypto.randomUUID(), moment: '2027-03-06T15:05:12+01:00', bon_id: null, rest: null, leeftijd: null };
        const url = `https://hopbites.nl/g/${DOOS}`;
        const res = await doosPOST(verzoek(`dozen/${encodeURIComponent(url)}/ophalen`, { body }), ctx({ code: url }));
        expect(DoosOphalenAntwoord.parse(await res.json())).toMatchObject({ uitkomst: 'leeftijd_nodig', code: DOOS, nog_open: 2, opgehaald_at: null });
    });
});

describe('GET dagstaat', () => {
    it('in de vorm van het contract (getallen als tekst worden getallen)', async () => {
        const res = await dagstaatGET(verzoek('dagstaat?datum=2027-03-06'), geen);
        expect(res.status).toBe(200);
        expect(DagstaatOverzicht.parse(await res.json())).toEqual({
            datum: '2027-03-06', apparaat_code: 'T1', aantal_bonnen: 5, hoogste_bonnummer: 'T1-000416',
            omzet: [{ pct: 21, incl_cents: 4401, btw_cents: 764 }, { pct: 9, incl_cents: 1089, btw_cents: 90 }], pin_cents: 4540, contant_cents: 1535,
        });
    });
    it('zonder geldige datum 400, zonder medewerker 403', async () => {
        await fout(await dagstaatGET(verzoek('dagstaat?datum=2027-02-30'), geen), 400, 'ongeldig_verzoek');
        await fout(await dagstaatGET(verzoek('dagstaat?datum=2027-03-06', { medewerker: null }), geen), 403, 'medewerker_sessie_verlopen');
    });
});

describe('POST dagstaten', () => {
    it('het voorbeeld: opgeslagen, verwerkt, met de status en verschillen van BBQ Architect', async () => {
        const body = voorbeeld('dagstaat.json');
        store.g.dagstaten[String(body.dagstaat_id)] = { status: 'definitief', verschillen: [] };
        const res = await dagstatenPOST(verzoek('dagstaten', { body }), geen);
        expect(res.status).toBe(200);
        expect(DagstatenAntwoord.parse(await res.json())).toEqual({ dagstaat_id: body.dagstaat_id, journaal: 'nieuw', status: 'definitief', verschillen: [] });
        expect(store.g.meldingen[0]).toMatchObject({ soort: 'dagstaat', verwerk_status: 'verwerkt', payload: body });
        expect(store.g.apparaten[0]!.bevestigd_tot_volgnummer).toBe(1215);

        store.g.dagstaten[String(body.dagstaat_id)] = { status: 'aangevuld', verschillen: [{ veld: 'aantal_bonnen', tablet_cents: 4, ba_cents: 5 }] };
        const b = DagstatenAntwoord.parse(await (await dagstatenPOST(verzoek('dagstaten', { body }), geen)).json());
        expect(b).toMatchObject({ journaal: 'bestond', status: 'aangevuld', verschillen: [{ veld: 'aantal_bonnen', tablet_cents: 4, ba_cents: 5 }] });
    });

    it('voldoet hij niet aan het contract: toch opgeslagen, fout, voorlopig', async () => {
        const body = { ...voorbeeld('dagstaat.json'), omzet: 'kapot' };
        const b = DagstatenAntwoord.parse(await (await dagstatenPOST(verzoek('dagstaten', { body }), geen)).json());
        expect(b).toMatchObject({ journaal: 'nieuw', status: 'voorlopig', verschillen: [] });
        expect(store.g.meldingen[0]).toMatchObject({ verwerk_status: 'fout', fout_code: 'schema' });
    });

    it('een kapotte envelop: 400; een te oude app: eerst opslaan, dan 426', async () => {
        await fout(await dagstatenPOST(verzoek('dagstaten', { body: { soort: 'dagstaat' } }), geen), 400, 'ongeldig_verzoek');
        expect(store.g.meldingen).toHaveLength(0);
        await fout(await dagstatenPOST(verzoek('dagstaten', { body: voorbeeld('dagstaat.json'), contract: '0.9.0' }), geen), 426, 'contract_verouderd');
        expect(store.g.meldingen[0]).toMatchObject({ verwerk_status: 'fout', fout_code: 'contract_verouderd' });
    });
});
