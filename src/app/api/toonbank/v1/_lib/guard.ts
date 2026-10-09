/**
 * Gedeelde guard voor alle Toonbank-routes /api/toonbank/v1/* (BA-7b).
 * Naar het voorbeeld van src/app/api/extension/v2/_lib/guard.ts.
 * Contract: hopbites-toonbank/docs/datacontract-toonbank-v1.md §3.1, §3.2, §6.
 *
 * Elke route, in deze volgorde:
 *   1. CORS: alleen de domeinen uit TOONBANK_ORIGINS (komma's ertussen);
 *      ETag en Retry-After zijn leesbaar voor de tablet. Een ander domein
 *      krijgt 403 geen_recht. Zonder Origin-header (geen browser) geen CORS.
 *   2. x-toonbank-contract lager dan CONTRACT_MINIMAAL (of leeg): 426
 *      contract_verouderd met {minimaal, huidig}. Behalve bij bewaarVerouderd
 *      (POST bonnen, POST dagstaten): dan eerst sleutel en opslaan, en
 *      antwoordt de route zelf 426 (contract §6.6).
 *   3. Snelheid per IP (vóór de database): 429 te_snel + Retry-After.
 *   4. x-toonbank-sleutel: onbekend → 401 sleutel_onbekend, ingetrokken →
 *      401 sleutel_ingetrokken. Daarna snelheid per apparaat (429).
 *      De organisatie komt ALLEEN uit de sleutel, nooit uit het verzoek.
 *   5. Body: hooguit maxBody bytes (413 te_groot); geen JSON: 400
 *      ongeldig_verzoek. Pas ná de sleutel (review M2, klein 6): zonder
 *      geldige sleutel leest de server geen body van 1 MB.
 *   6. Optioneel x-toonbank-medewerker (een dienst van dit apparaat): anders
 *      403 medewerker_sessie_verlopen.
 *   7. De handler. Een onverwachte fout: 500 serverfout (zonder sleutel,
 *      token of code in het log).
 * Fouten zijn altijd {fout: {code, melding, details}}; elk antwoord krijgt
 * Cache-Control: no-store, tenzij de route zelf iets zet (ETag-routes).
 *
 * De snelheidslimiet is in het geheugen per serverinstantie
 * (src/lib/rateLimit.ts), een eerste dam; de echte grenzen (koppelpogingen,
 * inlogcode) houdt de database bij. Contract §9 punt 11.
 */
import { NextResponse, type NextRequest } from 'next/server';
import type { z } from 'zod';
import { checkRateLimit } from '@/lib/rateLimit';
import { CONTRACT_HUIDIG, CONTRACT_MINIMAAL, FOUT_STATUS, HEADERS, versieMinstens, type FoutCode } from '@/lib/toonbank/contract';
import { controleerSessie } from '@/lib/toonbank/sessie';
import { hashSleutel, isSleutel } from '@/lib/toonbank/sleutel';
import type { Apparaat, Sessie, ToonbankStore } from '@/lib/toonbank/store';
import { maakToonbankSupabaseStore } from '@/lib/toonbank/supabaseStore';
import type { Uitkomst } from '@/lib/toonbank/uitkomst';

export const STANDAARD_MAX_BODY = 16 * 1024;
export const IP_PER_MINUUT = 600;
export const APPARAAT_PER_MINUUT = 300;

/* ── CORS ─────────────────────────────────────────────────────────────────── */

export function toegestaneOrigins(): string[] {
    return (process.env.TOONBANK_ORIGINS ?? '')
        .split(',')
        .map((o) => o.trim().replace(/\/+$/, ''))
        .filter(Boolean);
}

export function corsHeaders(origin: string | null): Record<string, string> {
    const h: Record<string, string> = { Vary: 'Origin' };
    if (origin && toegestaneOrigins().includes(origin)) {
        h['Access-Control-Allow-Origin'] = origin;
        h['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS';
        h['Access-Control-Allow-Headers'] = ['content-type', HEADERS.sleutel, HEADERS.contract, HEADERS.app, HEADERS.medewerker, 'if-none-match'].join(', ');
        h['Access-Control-Expose-Headers'] = 'ETag, Retry-After';
        h['Access-Control-Max-Age'] = '600';
    }
    return h;
}

/** OPTIONS (preflight): 204, met CORS-headers als het domein mag. */
export async function optionsRoute(req: NextRequest): Promise<Response> {
    return new NextResponse(null, { status: 204, headers: { ...corsHeaders(req.headers.get('origin')), 'Cache-Control': 'no-store' } });
}

/* ── Antwoorden ───────────────────────────────────────────────────────────── */

export function foutAntwoord(code: FoutCode, melding: string, details: Record<string, unknown> = {}, headers: Record<string, string> = {}): NextResponse {
    return NextResponse.json({ fout: { code, melding, details } }, { status: FOUT_STATUS[code], headers: { 'Cache-Control': 'no-store', ...headers } });
}

export function vanUitkomst<T>(u: Uitkomst<T>, headers: Record<string, string> = {}): NextResponse {
    /* 'in' en niet u.ok: de tsconfig staat niet op strict, dan vernauwt een boolean-discriminant niet. */
    if ('body' in u) return NextResponse.json(u.body, { status: u.status ?? 200, headers });
    return foutAntwoord(u.code, u.melding, u.details);
}

function teSnel(seconden: number): NextResponse {
    const s = Math.max(1, Math.ceil(seconden));
    return foutAntwoord('te_snel', 'Te veel verzoeken achter elkaar. Even wachten.', { retry_after: s }, { 'Retry-After': String(s) });
}

/** Leest een verzoek tegen een zod-schema; anders 400 ongeldig_verzoek met de eerste paar punten. */
export function valideer<S extends z.ZodType>(schema: S, data: unknown): { ok: true; data: z.infer<S> } | { ok: false; antwoord: NextResponse } {
    const r = schema.safeParse(data);
    if (r.success) return { ok: true, data: r.data };
    const punten = r.error.issues.slice(0, 5).map((i) => ({ pad: i.path.join('.'), melding: i.message }));
    return { ok: false, antwoord: foutAntwoord('ongeldig_verzoek', 'Het verzoek klopt niet met het contract.', { punten }) };
}

/* ── ETag (catalogus, vrij) ───────────────────────────────────────────────── */

export function etag(soort: string, versie: number | string): string {
    return `W/"${soort}-${versie}"`;
}

/** Stuurt de tablet deze ETag mee in if-none-match? Zwak/sterk maakt niet uit. */
export function komtOvereen(req: Request, tag: string): boolean {
    const inm = req.headers.get('if-none-match');
    if (!inm) return false;
    const kaal = (t: string) => t.trim().replace(/^W\//, '');
    return inm.split(',').some((t) => t.trim() === '*' || kaal(t) === kaal(tag));
}

export function nietGewijzigd(tag: string): NextResponse {
    return new NextResponse(null, { status: 304, headers: { ETag: tag, 'Cache-Control': 'private, no-cache' } });
}

/* ── De route-wrapper ─────────────────────────────────────────────────────── */

export function ipVan(req: Request): string {
    return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'onbekend';
}

async function leesBody(req: NextRequest, max: number): Promise<{ ok: true; body: unknown } | { ok: false; antwoord: NextResponse }> {
    const lengte = Number(req.headers.get('content-length') ?? '0');
    if (Number.isFinite(lengte) && lengte > max) {
        return { ok: false, antwoord: foutAntwoord('te_groot', `Het verzoek is te groot (hooguit ${max} bytes).`, { max_bytes: max }) };
    }
    const tekst = await req.text().catch(() => '');
    if (Buffer.byteLength(tekst, 'utf8') > max) {
        return { ok: false, antwoord: foutAntwoord('te_groot', `Het verzoek is te groot (hooguit ${max} bytes).`, { max_bytes: max }) };
    }
    if (tekst.trim() === '') return { ok: true, body: null };
    try {
        return { ok: true, body: JSON.parse(tekst) as unknown };
    } catch {
        return { ok: false, antwoord: foutAntwoord('ongeldig_verzoek', 'De body is geen leesbare JSON.') };
    }
}

export interface ToonbankContext<P> {
    req: NextRequest;
    params: P;
    store: ToonbankStore;
    nu: Date;
    /** null alleen bij een route zonder sleutel (koppelen). */
    apparaat: Apparaat | null;
    orgId: string | null;
    /** Gezet als de route een medewerker vraagt. */
    sessie: Sessie | null;
    body: unknown;
    contract: string | null;
    app: string | null;
    /** Alleen bij bewaarVerouderd: de app is te oud; opslaan als fout en dan 426 (contract §6.6). */
    verouderd: boolean;
}

export interface RouteOpties {
    /** Voor het log en de snelheidslimiet per IP. */
    naam: string;
    /** Standaard true. Alleen koppelen kan zonder. */
    sleutel?: boolean;
    /** "Sleutel + medewerker" uit het contract. */
    medewerker?: boolean;
    maxBody?: number;
    ipPerMinuut?: number;
    apparaatPerMinuut?: number;
    /**
     * POST bonnen en POST dagstaten (contract §6.6): een te oude app krijgt
     * pas 426 nadat de meldingen zijn opgeslagen, zodat er niets kwijtraakt.
     * De route krijgt verouderd = true en antwoordt zelf 426.
     */
    bewaarVerouderd?: boolean;
}

type RouteHandler<P> = (req: NextRequest, ctx: { params: Promise<P> }) => Promise<Response>;

export function toonbankRoute<P extends Record<string, string> = Record<string, never>>(
    opties: RouteOpties,
    handler: (ctx: ToonbankContext<P>) => Promise<Response>,
): RouteHandler<P> {
    return async (req, routeCtx) => {
        const cors = corsHeaders(req.headers.get('origin'));
        const af = (res: Response): Response => {
            for (const [k, v] of Object.entries(cors)) res.headers.set(k, v);
            if (!res.headers.has('Cache-Control')) res.headers.set('Cache-Control', 'no-store');
            return res;
        };
        try {
            const origin = req.headers.get('origin');
            if (origin && !cors['Access-Control-Allow-Origin']) {
                return af(foutAntwoord('geen_recht', 'Dit domein mag de Toonbank-API niet gebruiken.', { reden: 'origin' }));
            }

            const contract = req.headers.get(HEADERS.contract);
            const verouderd = !versieMinstens(contract, CONTRACT_MINIMAAL);
            if (verouderd && !opties.bewaarVerouderd) {
                return af(foutAntwoord('contract_verouderd', 'Deze Toonbank-app is te oud voor BBQ Architect. Werk de app bij.', {
                    minimaal: CONTRACT_MINIMAAL, huidig: CONTRACT_HUIDIG, ontvangen: contract,
                }));
            }

            const rlIp = checkRateLimit(`toonbank:${opties.naam}:ip:${ipVan(req)}`, opties.ipPerMinuut ?? IP_PER_MINUUT);
            if (!rlIp.allowed) return af(teSnel(rlIp.resetInSeconds));

            const store = maakToonbankSupabaseStore();
            const nu = new Date();
            let apparaat: Apparaat | null = null;
            if (opties.sleutel !== false) {
                const sleutel = req.headers.get(HEADERS.sleutel)?.trim() ?? null;
                if (!isSleutel(sleutel)) return af(foutAntwoord('sleutel_onbekend', 'Deze tablet is niet (meer) gekoppeld. Koppel hem opnieuw.'));
                apparaat = await store.apparaatOpSleutel(hashSleutel(sleutel));
                if (!apparaat) return af(foutAntwoord('sleutel_onbekend', 'Deze tablet is niet (meer) gekoppeld. Koppel hem opnieuw.'));
                if (apparaat.ingetrokken_at) {
                    return af(foutAntwoord('sleutel_ingetrokken', 'Deze tablet is ontkoppeld in BBQ Architect.', { ingetrokken_at: apparaat.ingetrokken_at }));
                }
                const rl = checkRateLimit(`toonbank:apparaat:${apparaat.id}`, opties.apparaatPerMinuut ?? APPARAAT_PER_MINUUT);
                if (!rl.allowed) return af(teSnel(rl.resetInSeconds));
            }

            /* De body pas na de sleutel (review M2, klein 6). */
            let body: unknown = null;
            if (req.method === 'POST') {
                const b = await leesBody(req, opties.maxBody ?? STANDAARD_MAX_BODY);
                if ('antwoord' in b) return af(b.antwoord);
                body = b.body;
            }

            let sessie: Sessie | null = null;
            if (opties.medewerker) {
                if (!apparaat) throw new Error('een route met medewerker heeft ook een sleutel nodig');
                sessie = await controleerSessie(store, { orgId: apparaat.organization_id, apparaatId: apparaat.id }, req.headers.get(HEADERS.medewerker), nu);
                if (!sessie) return af(foutAntwoord('medewerker_sessie_verlopen', 'Log opnieuw in met je code.'));
            }

            const params = (routeCtx?.params ? await routeCtx.params : {}) as P;
            return af(await handler({
                req, params, store, nu, apparaat, orgId: apparaat?.organization_id ?? null, sessie, body,
                contract, app: req.headers.get(HEADERS.app), verouderd,
            }));
        } catch (e) {
            console.error(`[toonbank ${opties.naam}]`, e instanceof Error ? e.message : String(e));
            return af(foutAntwoord('serverfout', 'Er ging iets mis in BBQ Architect. Probeer het zo opnieuw.'));
        }
    };
}
