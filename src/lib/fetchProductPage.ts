/**
 * Haalt een openbare productpagina op en maakt er leesbare tekst van.
 *
 * Waarvoor: je plakt de link van je Hasegawa-snijplank of je Bizerba-snijmachine,
 * en de AI leest de specificaties eruit in plaats van dat jij ze overtypt.
 *
 * Dit is géén scraper. Eén pagina, één keer, van een apparaat dat in je keuken
 * staat — hetzelfde als die pagina zelf openen, alleen leest de computer mee.
 * (De doorlopende scraper-route voor leveranciersprijzen is bewust afgewezen;
 * dat was iets anders: dagelijks, achter inlogschermen, continu veranderend.)
 *
 * Eerlijke beperking: sommige webwinkels bouwen hun pagina pas op in de browser.
 * Dan krijgt de server een lege huls en valt er niets te lezen. We geven dat
 * expliciet terug zodat de UI kan terugvallen op de screenshot-route, in plaats
 * van een leeg resultaat te tonen dat zich voordoet als gelukt.
 */
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

export interface ProductPagina {
    url: string;
    titel: string | null;
    tekst: string;
    afbeelding: string | null;
}

export class ProductPaginaError extends Error {
    constructor(
        message: string,
        readonly reden: 'ongeldig' | 'geblokkeerd' | 'onbereikbaar' | 'leeg'
    ) {
        super(message);
        this.name = 'ProductPaginaError';
    }
}

const MAX_BYTES = 2_000_000; // 2 MB — een productpagina is nooit groter
const TIMEOUT_MS = 12_000;
const MAX_TEKST = 24_000; // ruim genoeg voor specs, scheelt tokens

/** Blokkeert alles wat niet het open internet is: localhost, je eigen netwerk,
 *  cloud-metadata. Zonder deze check kan een geplakte link de server naar
 *  binnen laten kijken. */
function isPrivaatAdres(ip: string): boolean {
    if (ip === '::1' || ip.startsWith('fc') || ip.startsWith('fd') || ip.startsWith('fe80')) return true;
    const d = ip.split('.').map(Number);
    if (d.length !== 4 || d.some((n) => Number.isNaN(n))) return false;
    if (d[0] === 127 || d[0] === 10 || d[0] === 0) return true;
    if (d[0] === 172 && d[1] >= 16 && d[1] <= 31) return true;
    if (d[0] === 192 && d[1] === 168) return true;
    if (d[0] === 169 && d[1] === 254) return true; // cloud-metadata
    return false;
}

async function controleerDoel(url: URL): Promise<void> {
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        throw new ProductPaginaError('Alleen gewone webadressen (http of https).', 'ongeldig');
    }
    const host = url.hostname;
    if (host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal')) {
        throw new ProductPaginaError('Dit adres wijst naar je eigen netwerk.', 'geblokkeerd');
    }
    if (isIP(host)) {
        if (isPrivaatAdres(host)) {
            throw new ProductPaginaError('Dit adres wijst naar je eigen netwerk.', 'geblokkeerd');
        }
        return;
    }
    try {
        const { address } = await lookup(host);
        if (isPrivaatAdres(address)) {
            throw new ProductPaginaError('Dit adres wijst naar je eigen netwerk.', 'geblokkeerd');
        }
    } catch (e) {
        if (e instanceof ProductPaginaError) throw e;
        throw new ProductPaginaError('Dit webadres bestaat niet of is niet bereikbaar.', 'onbereikbaar');
    }
}

/** Ruwe HTML → leesbare tekst. Geen parser-library nodig: we hoeven de pagina
 *  niet te begrijpen, alleen de tekst eraf te halen zodat het model hem leest. */
function naarTekst(html: string): { titel: string | null; tekst: string; afbeelding: string | null } {
    const titel =
        html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)?.[1] ??
        html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim() ??
        null;

    const afbeelding =
        html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)?.[1] ?? null;

    const tekst = html
        .replace(/<script[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
        .replace(/<!--[\s\S]*?-->/g, ' ')
        // tabellen zijn waar specificaties in staan — rijen als regels houden
        .replace(/<\/(tr|li|p|div|h[1-6])>/gi, '\n')
        .replace(/<\/t[dh]>/gi, ' · ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/[ \t]+/g, ' ')
        .replace(/\n\s*\n\s*\n+/g, '\n\n')
        .trim();

    return { titel: titel ? titel.replace(/\s+/g, ' ').trim() : null, tekst, afbeelding };
}

export async function fetchProductPage(rawUrl: string): Promise<ProductPagina> {
    let url: URL;
    try {
        url = new URL(rawUrl.trim());
    } catch {
        throw new ProductPaginaError('Dat is geen geldig webadres.', 'ongeldig');
    }

    await controleerDoel(url);

    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);

    let res: Response;
    try {
        res = await fetch(url, {
            signal: ac.signal,
            redirect: 'follow',
            headers: {
                // Eerlijk over wie we zijn, en vragen om Nederlands waar dat kan.
                'User-Agent': 'BBQArchitect/1.0 (productspecificaties uitlezen)',
                Accept: 'text/html,application/xhtml+xml',
                'Accept-Language': 'nl-NL,nl;q=0.9,en;q=0.8',
            },
        });
    } catch {
        throw new ProductPaginaError('De pagina kon niet worden opgehaald.', 'onbereikbaar');
    } finally {
        clearTimeout(timer);
    }

    if (!res.ok) {
        throw new ProductPaginaError(
            `De website gaf een foutmelding (${res.status}). Sommige winkels blokkeren dit — gebruik dan een screenshot.`,
            'onbereikbaar'
        );
    }

    const type = res.headers.get('content-type') ?? '';
    if (!type.includes('html')) {
        throw new ProductPaginaError('Dit adres is geen webpagina.', 'ongeldig');
    }

    const buf = await res.arrayBuffer();
    if (buf.byteLength > MAX_BYTES) {
        throw new ProductPaginaError('De pagina is te groot om te lezen.', 'onbereikbaar');
    }
    const html = new TextDecoder('utf-8').decode(buf);

    const { titel, tekst, afbeelding } = naarTekst(html);

    // Te weinig tekst betekent bijna altijd: pagina wordt pas in de browser
    // opgebouwd. Dat eerlijk melden is beter dan een leeg voorstel tonen.
    if (tekst.length < 200) {
        throw new ProductPaginaError(
            'Deze pagina bouwt zich pas op in de browser, dus er valt niets te lezen. Maak er een screenshot van en upload die.',
            'leeg'
        );
    }

    return {
        url: url.toString(),
        titel,
        tekst: tekst.slice(0, MAX_TEKST),
        afbeelding: afbeelding && /^https?:\/\//.test(afbeelding) ? afbeelding : null,
    };
}
