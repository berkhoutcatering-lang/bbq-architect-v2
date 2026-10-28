/**
 * myPOS ePOS API — een betaling op de myPOS Ultra starten, de stand opvragen en afbreken
 * (contract toonbank/v1 1.3, besluit Mathijs 28 oktober 2026). Alleen op de server: de sleutels
 * van myPOS komen nooit op de tablet en nooit in de browser.
 *
 * Bron: https://developers.mypos.com/apis/epos, de Swagger https://developers.mypos.com/pos-83.json
 * en https://developers.mypos.com/identity-83.json (gelezen op 28 oktober 2026; uitwerking in
 * hopbites-toonbank, research_notes/myPOS Ultra inzet bij de Toonbank/epos_api_details.md).
 *
 *   1. POST /api/v1/oauth/token  (form: client_id, client_secret, grant_type=client_credentials)
 *      → Bearer-token, 1 uur geldig. De partnersleutels (client_… / secret_…).
 *   2. POST /api/v1/auth/session (JSON: client_id = cli_…, client_secret = sec_…, met Bearer)
 *      → X-Session, 5 minuten geldig. De sleutels van de winkel zelf (de merchant).
 *   3. POST   /epos/v1/payments       betaling naar de terminal (201)
 *      GET    /epos/v1/payments/{id}  de stand (InProgress, Success, Canceled, Failed, Reversed, Rejected)
 *      DELETE /epos/v1/payments/{id}  afbreken (202; daarna nog de stand opvragen)
 *      Elke aanroep: Authorization: Bearer, X-Session, X-Partner-Id (mps-p-…), X-Application-Id (mps-app-…).
 *
 * Let op (myPOS): na 3 mislukte pogingen met de sessiesleutels gaat het account op slot. Daarom
 * hier nooit opnieuw proberen als de sessie geweigerd wordt; alleen een verlopen token of sessie
 * (401 op een betaalaanroep) wordt één keer vernieuwd.
 *
 * [ONZEKER] Of de identiteitsroutes op dezelfde host staan als ePOS (api-gateway.mypos.com): de
 * officiële SDK (npm mypos-api-gateway) doet dat. Te bevestigen met de demo-omgeving.
 */

export type MyposOmgeving = 'demo' | 'live';

export interface MyposConfig {
    basis: string;
    clientId: string;
    clientSecret: string;
    partnerId: string;
    applicationId: string;
    merchantClientId: string;
    merchantSecret: string;
    /** De organisatie in BBQ Architect waar deze myPOS-account bij hoort; een andere organisatie krijgt geen koppeling. */
    organisatieId: string;
    appVersie: string;
}

const BASIS: Record<MyposOmgeving, string> = {
    demo: 'https://demo-api-gateway.mypos.com',
    live: 'https://api-gateway.mypos.com',
};

/**
 * De instellingen uit de omgevingsvariabelen (Vercel, nooit in de repo). Ontbreekt er één, dan
 * staat de koppeling uit en pint de Toonbank met de hand.
 */
export function myposConfig(env: Record<string, string | undefined> = process.env): MyposConfig | null {
    const v = (n: string) => env[n]?.trim() || null;
    const omgeving = v('MYPOS_EPOS_OMGEVING') === 'live' ? 'live' : v('MYPOS_EPOS_OMGEVING') === 'demo' ? 'demo' : null;
    const delen = {
        clientId: v('MYPOS_EPOS_CLIENT_ID'),
        clientSecret: v('MYPOS_EPOS_CLIENT_SECRET'),
        partnerId: v('MYPOS_EPOS_PARTNER_ID'),
        applicationId: v('MYPOS_EPOS_APPLICATION_ID'),
        merchantClientId: v('MYPOS_EPOS_MERCHANT_CLIENT_ID'),
        merchantSecret: v('MYPOS_EPOS_MERCHANT_SECRET'),
        organisatieId: v('MYPOS_EPOS_ORGANISATIE_ID'),
    };
    if (!omgeving || Object.values(delen).some((x) => !x)) return null;
    return { basis: BASIS[omgeving], appVersie: '1.3.0', ...(delen as Record<keyof typeof delen, string>) };
}

export type MyposStatus = 'InProgress' | 'Success' | 'Canceled' | 'Failed' | 'Reversed' | 'Rejected';

/** Wat de Toonbank van een betaling nodig heeft (uit PaymentInfoDTO). */
export interface MyposBetaling {
    payment_id: string;
    status: MyposStatus | string;
    bedrag_cents: number | null;
    rrn: string | null;
    auth_code: string | null;
    status_message: string | null;
    response_code: string | null;
}

/** myPOS gaf een fout, of was niet bereikbaar (status 0). */
export class MyposFout extends Error {
    /** Gezet als het om de sleutels gaat (token, sessie of de rem), niet om de betaling zelf. */
    sleutels = false;
    constructor(public readonly status: number, melding: string, public readonly detail: unknown = null) {
        super(melding);
        this.name = 'MyposFout';
    }
}

/** Een terminal in de myPOS-account (GET /pos/v1/terminals). Model N96 is de myPOS Ultra. */
export interface MyposTerminal {
    terminal_id: string;
    serial_number: string | null;
    model: string | null;
}

function sleutelFout(status: number, melding: string, detail: unknown = null): MyposFout {
    const f = new MyposFout(status, melding, detail);
    f.sleutels = true;
    return f;
}

export interface MyposClient {
    /** De terminals in de myPOS-account: om de koppeling te testen en het terminal-ID te vinden. */
    terminals(): Promise<MyposTerminal[]>;
    betaling(v: { terminal_id: string; bedrag_cents: number; referentie: string; omschrijving: string }): Promise<MyposBetaling>;
    stand(paymentId: string): Promise<MyposBetaling>;
    annuleer(paymentId: string): Promise<MyposBetaling>;
}

type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

/**
 * De rem (besluit 28 oktober 2026, live zonder demo): na 3 foute pogingen met de sleutels zet myPOS
 * het account op slot. Weigert myPOS de sleutels één keer (400, 401 of 403 bij token of sessie),
 * dan probeert deze serverinstantie het een uur lang niet meer; de kassa pint dan met de hand.
 * Per sleutelset bijgehouden, voor de hele instantie (ook over clients heen).
 */
const REM_MS = 60 * 60_000;
const REM = new Map<string, number>();
const remSleutel = (cfg: MyposConfig) => `${cfg.basis}|${cfg.clientId}|${cfg.merchantClientId}`;

/** Tot wanneer de rem erop staat (ms), of null. */
export function remTot(cfg: MyposConfig, nu: number = Date.now()): number | null {
    const t = REM.get(remSleutel(cfg));
    return t && t > nu ? t : null;
}

/** Alleen voor tests. */
export function remLos(): void {
    REM.clear();
}

/** Hoe lang op myPOS gewacht wordt; daarna telt het als onbereikbaar. */
const TIJDSLIMIET_MS = 8000;

function naarBetaling(r: Record<string, unknown>): MyposBetaling {
    const s = (v: unknown) => (v == null || v === '' ? null : String(v));
    const amount = (r.amount ?? {}) as Record<string, unknown>;
    return {
        payment_id: String(r.payment_id ?? ''),
        status: String(r.status ?? ''),
        bedrag_cents: typeof amount.value === 'number' ? amount.value : null,
        rrn: s(r.rrn),
        auth_code: s(r.auth_code),
        status_message: s(r.status_message),
        response_code: s(r.response_code),
    };
}

/**
 * Een client per serverinstantie: token en sessie worden bewaard tot vlak voor ze verlopen
 * (token 60 s eerder, sessie 30 s eerder, zoals de SDK van myPOS).
 */
export function maakMyposClient(cfg: MyposConfig, f: Fetch = fetch, nu: () => number = Date.now): MyposClient {
    let token: { waarde: string; tot: number } | null = null;
    let sessie: { waarde: string; tot: number } | null = null;

    const metTijd = async (url: string, init: RequestInit): Promise<Response> => {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), TIJDSLIMIET_MS);
        try {
            return await f(url, { ...init, signal: ctrl.signal });
        } catch (e) {
            throw new MyposFout(0, `myPOS niet bereikbaar (${e instanceof Error ? e.message : String(e)})`);
        } finally {
            clearTimeout(t);
        }
    };

    const leesJson = async (res: Response): Promise<Record<string, unknown>> => {
        const tekst = await res.text();
        try {
            return tekst ? (JSON.parse(tekst) as Record<string, unknown>) : {};
        } catch {
            return { detail: tekst.slice(0, 200) };
        }
    };

    const remmen = (status: number) => {
        if (status === 400 || status === 401 || status === 403) REM.set(remSleutel(cfg), nu() + REM_MS);
    };
    const remCheck = () => {
        const t = REM.get(remSleutel(cfg));
        if (t && t > nu()) {
            throw sleutelFout(423, `myPOS weigerde de sleutels net. BBQ Architect probeert het pas om ${new Date(t).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Amsterdam' })} opnieuw, zodat het account niet op slot gaat. Kijk de MYPOS_EPOS-sleutels in Vercel na.`);
        }
    };

    const haalToken = async (): Promise<string> => {
        if (token && token.tot > nu()) return token.waarde;
        remCheck();
        const res = await metTijd(`${cfg.basis}/api/v1/oauth/token`, {
            method: 'POST',
            headers: { 'content-type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({ client_id: cfg.clientId, client_secret: cfg.clientSecret, grant_type: 'client_credentials' }).toString(),
        });
        const j = await leesJson(res);
        if (!res.ok || typeof j.access_token !== 'string') {
            remmen(res.status);
            throw sleutelFout(res.status, 'myPOS weigerde de partnersleutels (MYPOS_EPOS_CLIENT_ID en _SECRET).', j);
        }
        token = { waarde: j.access_token, tot: nu() + Math.max(60, Number(j.expires_in ?? 3600) - 60) * 1000 };
        return token.waarde;
    };

    const haalSessie = async (): Promise<string> => {
        if (sessie && sessie.tot > nu()) return sessie.waarde;
        remCheck();
        const bearer = await haalToken();
        const res = await metTijd(`${cfg.basis}/api/v1/auth/session`, {
            method: 'POST',
            headers: { 'content-type': 'application/json', authorization: `Bearer ${bearer}` },
            body: JSON.stringify({ client_id: cfg.merchantClientId, client_secret: cfg.merchantSecret }),
        });
        const j = await leesJson(res);
        // Nooit automatisch opnieuw: na 3 foute pogingen zet myPOS het account op slot.
        if (!res.ok || typeof j.session !== 'string') {
            remmen(res.status);
            throw sleutelFout(res.status, 'myPOS weigerde de sleutels van de winkel (MYPOS_EPOS_MERCHANT_CLIENT_ID en _SECRET).', j);
        }
        // De bronnen spreken elkaar tegen (5 minuten of 3600 s): hooguit 5 minuten aanhouden.
        const geldig = Math.min(300, Number(j.expires_in ?? 300));
        sessie = { waarde: j.session, tot: nu() + Math.max(30, geldig - 30) * 1000 };
        return sessie.waarde;
    };

    const roep = async (methode: 'GET' | 'POST' | 'DELETE', pad: string, body?: unknown, opnieuw = true): Promise<Record<string, unknown>> => {
        const [bearer, s] = [await haalToken(), await haalSessie()];
        const res = await metTijd(`${cfg.basis}${pad}`, {
            method: methode,
            headers: {
                authorization: `Bearer ${bearer}`,
                'x-session': s,
                'x-partner-id': cfg.partnerId,
                'x-application-id': cfg.applicationId,
                accept: 'application/json',
                ...(body !== undefined ? { 'content-type': 'application/json; x-api-version=1' } : {}),
            },
            ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
        });
        const j = await leesJson(res);
        if (res.status === 401 && opnieuw) {
            // Verlopen token of sessie: één keer vernieuwen.
            token = null;
            sessie = null;
            return roep(methode, pad, body, false);
        }
        if (!res.ok) throw new MyposFout(res.status, String(j.detail ?? j.title ?? `myPOS antwoordde ${res.status}`), j);
        return j;
    };

    return {
        async terminals() {
            const j = await roep('GET', '/pos/v1/terminals?page=1&size=100');
            const lijst = Array.isArray(j.terminals) ? (j.terminals as Record<string, unknown>[]) : [];
            return lijst
                .filter((t) => t && t.terminal_id != null)
                .map((t) => ({ terminal_id: String(t.terminal_id), serial_number: t.serial_number == null ? null : String(t.serial_number), model: t.model == null ? null : String(t.model) }));
        },
        async betaling(v) {
            const j = await roep('POST', '/epos/v1/payments', {
                reference_number: v.referentie.slice(0, 50),
                amount: { value: v.bedrag_cents, currency_code: 'EUR', tip: 0 },
                description: v.omschrijving.slice(0, 100),
                terminal_id: v.terminal_id,
                app_name: 'Toonbank',
                app_version: cfg.appVersie,
            });
            const b = naarBetaling(j);
            if (!b.payment_id) throw new MyposFout(502, 'myPOS gaf geen payment_id terug.', j);
            return b;
        },
        async stand(paymentId) {
            return naarBetaling(await roep('GET', `/epos/v1/payments/${encodeURIComponent(paymentId)}`));
        },
        async annuleer(paymentId) {
            return naarBetaling(await roep('DELETE', `/epos/v1/payments/${encodeURIComponent(paymentId)}`));
        },
    };
}
