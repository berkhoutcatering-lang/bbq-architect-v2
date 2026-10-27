// De voordeur van de api-stand: een klein Node-programma dat zich gedraagt als
// het stuk van Supabase waar BBQ Architect mee praat (Kong voor /rest/v1).
//
//   /rest/v1/*      → PostgREST (zonder het voorvoegsel), zoals Supabase.
//                     Een verzoek zonder apikey krijgt 401, een onbekende
//                     sleutel ook; zonder Authorization gaat de apikey als
//                     Bearer mee (supabase-js stuurt ze allebei).
//   /auth/v1/*      → er is geen GoTrue: 401 voor /user (dus "niet ingelogd"),
//                     501 voor de rest. Schermen achter login werken hier niet.
//   /storage/v1, /realtime/v1, /functions/v1, /graphql/v1 → 501.
//   /               → wat hier draait (JSON).
//
// CORS zoals Supabase: elke origin mag (de sleutels zijn de deur, niet de origin).
// Alleen 127.0.0.1; er gaat nooit iets naar buiten.

import http from 'node:http';

const NIET_DOORGEVEN = new Set(['host', 'connection', 'keep-alive', 'proxy-connection', 'transfer-encoding', 'upgrade', 'te', 'trailer']);

function cors(origin) {
    if (!origin) return {};
    return {
        'access-control-allow-origin': origin,
        'access-control-allow-credentials': 'true',
        'access-control-allow-methods': 'GET, POST, PATCH, PUT, DELETE, OPTIONS, HEAD',
        'access-control-allow-headers': 'authorization, apikey, content-type, content-profile, accept-profile, prefer, range, range-unit, x-client-info, x-supabase-api-version, if-none-match',
        'access-control-expose-headers': 'content-range, content-location, location, preference-applied, range-unit',
        'access-control-max-age': '600',
        vary: 'Origin',
    };
}

function json(res, status, body, extra = {}) {
    res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...extra });
    res.end(JSON.stringify(body));
}

/**
 * @param {{ postgrestPoort: number, sleutels: { anon: string, service_role: string }, log?: (regel: string) => void }} opties
 * @returns {http.Server}
 */
export function maakProxy({ postgrestPoort, sleutels, log = () => {} }) {
    const bekend = new Set([sleutels.anon, sleutels.service_role]);

    const server = http.createServer((req, res) => {
        const origin = req.headers.origin ?? null;
        const extra = cors(origin);
        const url = new URL(req.url ?? '/', 'http://127.0.0.1');
        const pad = url.pathname;

        if (req.method === 'OPTIONS') {
            res.writeHead(204, extra);
            res.end();
            return;
        }

        if (pad === '/' || pad === '/health') {
            json(res, 200, { naam: 'tools/testdb api', rest: '/rest/v1', auth: false, storage: false, realtime: false }, extra);
            return;
        }

        if (pad === '/auth/v1/user') {
            json(res, 401, { code: 401, error_code: 'no_authorization', msg: 'Geen GoTrue in tools/testdb: niemand is ingelogd. Schermen achter login zijn hier niet te gebruiken.' }, extra);
            return;
        }
        for (const dienst of ['/auth/v1', '/storage/v1', '/realtime/v1', '/functions/v1', '/graphql/v1']) {
            if (pad === dienst || pad.startsWith(`${dienst}/`)) {
                json(res, 501, { code: 501, error_code: 'niet_in_testdb', msg: `${dienst} draait niet in tools/testdb (alleen /rest/v1).` }, extra);
                return;
            }
        }

        if (!(pad === '/rest/v1' || pad.startsWith('/rest/v1/'))) {
            json(res, 404, { message: 'no Route matched with those values' }, extra);
            return;
        }

        // Kong: zonder geldige apikey komt niemand binnen.
        const apikey = req.headers.apikey ?? url.searchParams.get('apikey');
        const bearer = /^Bearer\s+(.+)$/i.exec(req.headers.authorization ?? '')?.[1] ?? null;
        if (!apikey) {
            json(res, 401, { message: 'No API key found in request', hint: 'Geef de apikey-header mee (anon- of service_role-sleutel uit tools/testdb).' }, extra);
            return;
        }
        if (!bekend.has(apikey)) {
            json(res, 401, { message: 'Invalid API key', hint: 'Deze sleutel hoort niet bij deze testdatabase.' }, extra);
            return;
        }

        const headers = {};
        for (const [k, v] of Object.entries(req.headers)) {
            if (v === undefined || NIET_DOORGEVEN.has(k)) continue;
            headers[k] = v;
        }
        headers.host = `127.0.0.1:${postgrestPoort}`;
        if (!bearer) headers.authorization = `Bearer ${apikey}`;
        url.searchParams.delete('apikey');
        const doelPad = (pad.slice('/rest/v1'.length) || '/') + (url.search || '');

        const t0 = Date.now();
        const verder = http.request({ host: '127.0.0.1', port: postgrestPoort, method: req.method, path: doelPad, headers }, (antwoord) => {
            const uit = { ...antwoord.headers, ...extra };
            delete uit.connection;
            delete uit['keep-alive'];
            res.writeHead(antwoord.statusCode ?? 502, uit);
            antwoord.pipe(res);
            antwoord.on('end', () => log(`${req.method} ${pad}${url.search} → ${antwoord.statusCode} (${Date.now() - t0} ms)`));
        });
        verder.on('error', (e) => {
            if (res.headersSent) {
                res.destroy(e);
                return;
            }
            json(res, 502, { message: 'PostgREST is niet bereikbaar', details: e.message }, extra);
        });
        req.pipe(verder);
    });

    // Realtime (websocket): bestaat hier niet. Netjes weigeren in plaats van hangen.
    server.on('upgrade', (req, socket) => {
        socket.end('HTTP/1.1 501 Not Implemented\r\ncontent-type: text/plain\r\nconnection: close\r\n\r\nRealtime draait niet in tools/testdb.\r\n');
    });

    return server;
}
