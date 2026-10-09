/**
 * BA-5c — het ververs-signaal naar de website. De gedeelde testvector staat
 * ook aan de websitekant (WEB-2b, app/api/revalidate): als die twee ooit
 * verschillen, weigert de website elk signaal.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { maakHandtekening, stuurVerversSignaal, verversNaAfloop, VERVERS_TIMEOUT_MS } from './verversSignaal';

const GEHEIM = 'testgeheim-hop-en-bites';
const TIJD = '1791000000';
const BODY = '{"tags":["beschikbaarheid"]}';
const HANDTEKENING = 'sha256=67c7c403fe3d7c60339cc7983cd93326dffd55f06331fd025f644590b3a2455a';

afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

function metEnv() {
    vi.stubEnv('WEBSITE_VERVERS_URL', 'https://website.test/api/revalidate');
    vi.stubEnv('WEBSITE_VERVERS_GEHEIM', GEHEIM);
}

describe('maakHandtekening', () => {
    it('de gedeelde testvector', () => {
        expect(maakHandtekening(GEHEIM, TIJD, BODY)).toBe(HANDTEKENING);
    });
    it('elk ander geheim, tijd of body geeft een andere handtekening', () => {
        expect(maakHandtekening(GEHEIM + 'x', TIJD, BODY)).not.toBe(HANDTEKENING);
        expect(maakHandtekening(GEHEIM, '1791000001', BODY)).not.toBe(HANDTEKENING);
        expect(maakHandtekening(GEHEIM, TIJD, '{"tags":["catalogus"]}')).not.toBe(HANDTEKENING);
    });
});

describe('stuurVerversSignaal', () => {
    it('zonder beide variabelen gebeurt er niets', async () => {
        const f = vi.fn();
        vi.stubEnv('WEBSITE_VERVERS_URL', '');
        vi.stubEnv('WEBSITE_VERVERS_GEHEIM', GEHEIM);
        expect(await stuurVerversSignaal(['beschikbaarheid'], { fetch: f })).toBe(false);
        vi.stubEnv('WEBSITE_VERVERS_URL', 'https://website.test/api/revalidate');
        vi.stubEnv('WEBSITE_VERVERS_GEHEIM', '');
        expect(await stuurVerversSignaal(['beschikbaarheid'], { fetch: f })).toBe(false);
        expect(f).not.toHaveBeenCalled();
    });

    it('POST met body, x-hb-tijd en x-hb-handtekening zoals de testvector, en een timeout', async () => {
        metEnv();
        const f = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => new Response('ok', { status: 200 }));
        const ok = await stuurVerversSignaal(['beschikbaarheid'], { fetch: f as unknown as typeof fetch, nu: () => new Date(Number(TIJD) * 1000 + 999) });
        expect(ok).toBe(true);
        expect(f).toHaveBeenCalledTimes(1);
        const [url, init] = f.mock.calls[0]!;
        expect(url).toBe('https://website.test/api/revalidate');
        expect(init?.method).toBe('POST');
        expect(init?.body).toBe(BODY);
        expect(init?.headers).toMatchObject({ 'content-type': 'application/json', 'x-hb-tijd': TIJD, 'x-hb-handtekening': HANDTEKENING });
        expect(init?.signal).toBeInstanceOf(AbortSignal);
    });

    it('gooit nooit: een netwerkfout of een 500 is false', async () => {
        metEnv();
        vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        expect(await stuurVerversSignaal(['beschikbaarheid'], { fetch: (async () => { throw new TypeError('fetch failed'); }) as typeof fetch })).toBe(false);
        expect(await stuurVerversSignaal(['beschikbaarheid'], { fetch: (async () => new Response('nee', { status: 500 })) as typeof fetch })).toBe(false);
    });

    it('wacht hooguit 2 seconden', async () => {
        metEnv();
        vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        /* Een website die nooit antwoordt: alleen het afbreken maakt hier een eind aan. */
        const hangt = ((_u: unknown, init?: RequestInit) => new Promise<Response>((_res, rej) => {
            init?.signal?.addEventListener('abort', () => rej(init.signal!.reason));
        })) as typeof fetch;
        const start = Date.now();
        expect(await stuurVerversSignaal(['beschikbaarheid'], { fetch: hangt })).toBe(false);
        const duur = Date.now() - start;
        expect(duur).toBeGreaterThanOrEqual(VERVERS_TIMEOUT_MS - 50);
        expect(duur).toBeLessThan(VERVERS_TIMEOUT_MS + 1000);
    }, 5000);
});

describe('verversNaAfloop', () => {
    it('buiten een verzoek: gaat los, gooit niet', async () => {
        metEnv();
        const f = vi.fn(async () => new Response('ok', { status: 200 }));
        vi.stubGlobal('fetch', f);
        expect(() => verversNaAfloop()).not.toThrow();
        await vi.waitFor(() => expect(f).toHaveBeenCalledTimes(1));
        const init = (f.mock.calls[0] as unknown as [string, RequestInit])[1];
        expect(init.body).toBe(BODY);
    });
    it('zonder variabelen: niets', () => {
        const f = vi.fn();
        vi.stubGlobal('fetch', f);
        vi.stubEnv('WEBSITE_VERVERS_URL', '');
        verversNaAfloop();
        expect(f).not.toHaveBeenCalled();
    });
});
