/**
 * De myPOS-client (ePOS API, contract toonbank/v1 1.3): de vorm van de verzoeken zoals de
 * Swagger van myPOS ze beschrijft, het bewaren van token en sessie, en dat een geweigerde sessie
 * nooit automatisch opnieuw geprobeerd wordt (na 3 foute pogingen zet myPOS het account op slot).
 * Geen echte myPOS: een nep-fetch.
 */
import { describe, expect, it } from 'vitest';
import { MyposFout, maakMyposClient, myposConfig, type MyposConfig } from './mypos';

const CFG: MyposConfig = {
    basis: 'https://demo-api-gateway.mypos.com', clientId: 'client_x', clientSecret: 'secret_x', partnerId: 'mps-p-1', applicationId: 'mps-app-1',
    merchantClientId: 'cli_y', merchantSecret: 'sec_y', organisatieId: 'org', appVersie: '1.3.0',
};

type Verzoek = { url: string; init: RequestInit };

function nepMypos(antwoord: (v: Verzoek) => { status: number; body: unknown }) {
    const verzoeken: Verzoek[] = [];
    const f = async (url: string, init: RequestInit = {}) => {
        const v = { url, init };
        verzoeken.push(v);
        const a = antwoord(v);
        return new Response(JSON.stringify(a.body), { status: a.status, headers: { 'content-type': 'application/json' } });
    };
    return { f, verzoeken };
}

const standaard = (v: Verzoek) => {
    if (v.url.endsWith('/api/v1/oauth/token')) return { status: 200, body: { access_token: 'tok', expires_in: 3600, token_type: 'Bearer' } };
    if (v.url.endsWith('/api/v1/auth/session')) return { status: 200, body: { session: 'ses', expires_in: 300 } };
    if (v.url.endsWith('/epos/v1/payments') && v.init.method === 'POST') {
        return { status: 201, body: { payment_id: 'pay-1', status: 'InProgress', amount: { value: 2350, currency_code: 'EUR' }, reference_number: 'T1-000412' } };
    }
    if (v.url.endsWith('/epos/v1/payments/pay-1')) {
        return { status: v.init.method === 'DELETE' ? 202 : 200, body: { payment_id: 'pay-1', status: 'Success', rrn: '629012345678', response_code: '00', amount: { value: 2350 } } };
    }
    return { status: 404, body: { title: 'Not Found' } };
};

describe('myposConfig', () => {
    it('alleen met alle sleutels en een omgeving; anders uit (de Toonbank pint dan met de hand)', () => {
        const env = {
            MYPOS_EPOS_OMGEVING: 'demo', MYPOS_EPOS_CLIENT_ID: 'a', MYPOS_EPOS_CLIENT_SECRET: 'b', MYPOS_EPOS_PARTNER_ID: 'c', MYPOS_EPOS_APPLICATION_ID: 'd',
            MYPOS_EPOS_MERCHANT_CLIENT_ID: 'e', MYPOS_EPOS_MERCHANT_SECRET: 'f', MYPOS_EPOS_ORGANISATIE_ID: 'g',
        };
        expect(myposConfig(env)?.basis).toBe('https://demo-api-gateway.mypos.com');
        expect(myposConfig({ ...env, MYPOS_EPOS_OMGEVING: 'live' })?.basis).toBe('https://api-gateway.mypos.com');
        expect(myposConfig({ ...env, MYPOS_EPOS_OMGEVING: 'iets' })).toBeNull();
        expect(myposConfig({ ...env, MYPOS_EPOS_MERCHANT_SECRET: '' })).toBeNull();
    });
});

describe('maakMyposClient', () => {
    it('een betaling: token, sessie en dan POST /epos/v1/payments met bedrag in centen, EUR, referentie en terminal', async () => {
        const n = nepMypos(standaard);
        const c = maakMyposClient(CFG, n.f);
        const b = await c.betaling({ terminal_id: '12345678', bedrag_cents: 2350, referentie: 'T1-000412', omschrijving: 'Hop & Bites T1-000412' });
        expect(b).toMatchObject({ payment_id: 'pay-1', status: 'InProgress' });
        expect(n.verzoeken.map((v) => v.url.replace(CFG.basis, ''))).toEqual(['/api/v1/oauth/token', '/api/v1/auth/session', '/epos/v1/payments']);
        const token = n.verzoeken[0]!;
        expect(String(token.init.body)).toBe('client_id=client_x&client_secret=secret_x&grant_type=client_credentials');
        expect(JSON.parse(String(n.verzoeken[1]!.init.body))).toEqual({ client_id: 'cli_y', client_secret: 'sec_y' });
        const betaal = n.verzoeken[2]!;
        const h = betaal.init.headers as Record<string, string>;
        expect(h).toMatchObject({ authorization: 'Bearer tok', 'x-session': 'ses', 'x-partner-id': 'mps-p-1', 'x-application-id': 'mps-app-1', 'content-type': 'application/json; x-api-version=1' });
        expect(JSON.parse(String(betaal.init.body))).toEqual({
            reference_number: 'T1-000412', amount: { value: 2350, currency_code: 'EUR', tip: 0 }, description: 'Hop & Bites T1-000412',
            terminal_id: '12345678', app_name: 'Toonbank', app_version: '1.3.0',
        });
    });

    it('token en sessie worden bewaard; de stand en afbreken gebruiken dezelfde', async () => {
        const n = nepMypos(standaard);
        const c = maakMyposClient(CFG, n.f);
        await c.stand('pay-1');
        await c.stand('pay-1');
        await c.annuleer('pay-1');
        expect(n.verzoeken.filter((v) => v.url.endsWith('/oauth/token'))).toHaveLength(1);
        expect(n.verzoeken.filter((v) => v.url.endsWith('/auth/session'))).toHaveLength(1);
        expect(n.verzoeken.at(-1)!.init.method).toBe('DELETE');
    });

    it('na 5 minuten een nieuwe sessie, na een uur een nieuw token', async () => {
        let t = 0;
        const n = nepMypos(standaard);
        const c = maakMyposClient(CFG, n.f, () => t);
        await c.stand('pay-1');
        t += 5 * 60_000;
        await c.stand('pay-1');
        expect(n.verzoeken.filter((v) => v.url.endsWith('/auth/session'))).toHaveLength(2);
        expect(n.verzoeken.filter((v) => v.url.endsWith('/oauth/token'))).toHaveLength(1);
        t += 60 * 60_000;
        await c.stand('pay-1');
        expect(n.verzoeken.filter((v) => v.url.endsWith('/oauth/token'))).toHaveLength(2);
    });

    it('een geweigerde sessie wordt nooit vanzelf opnieuw geprobeerd', async () => {
        const n = nepMypos((v) => (v.url.endsWith('/auth/session') ? { status: 401, body: { title: 'Unauthorized' } } : standaard(v)));
        const c = maakMyposClient(CFG, n.f);
        await expect(c.stand('pay-1')).rejects.toBeInstanceOf(MyposFout);
        expect(n.verzoeken.filter((v) => v.url.endsWith('/auth/session'))).toHaveLength(1);
    });

    it('een 401 op een betaalaanroep (verlopen): een keer vernieuwen', async () => {
        let eerste = true;
        const n = nepMypos((v) => {
            if (v.url.endsWith('/epos/v1/payments/pay-1') && eerste) {
                eerste = false;
                return { status: 401, body: { title: 'Unauthorized' } };
            }
            return standaard(v);
        });
        const c = maakMyposClient(CFG, n.f);
        expect((await c.stand('pay-1')).status).toBe('Success');
        expect(n.verzoeken.filter((v) => v.url.endsWith('/oauth/token'))).toHaveLength(2);
    });

    it('geen verbinding: MyposFout met status 0', async () => {
        const c = maakMyposClient(CFG, async () => {
            throw new TypeError('fetch failed');
        });
        await expect(c.stand('pay-1')).rejects.toMatchObject({ name: 'MyposFout', status: 0 });
    });
});
