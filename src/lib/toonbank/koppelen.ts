/**
 * POST /api/toonbank/v1/koppelen (BA-7b): een tablet koppelen met de code van
 * 6 cijfers uit Instellingen → Toonbank. Contract §3.3.
 *
 * Geen sleutel nodig (die komt hier pas). De organisatie volgt uit de code:
 * de API vergelijkt hem met elke open code (scrypt) en rondt het af in de
 * database, alleen als die code dan nog open is. Altijd 403
 * koppelcode_ongeldig bij een fout: nooit 401, want er is nog geen sleutel
 * om te ontkoppelen.
 *
 * Review M2 (klein 7): een foute code wordt per bron bijgehouden (SHA-256 van
 * het IP-adres; het adres zelf wordt niet bewaard). Een bron mag 5 foute codes
 * per 15 minuten; daarna 429 te_snel zonder dat er iets geprobeerd wordt.
 * Alleen die 5 tellen mee bij de open codes, en een code vervalt pas na 25:
 * één adres kan het koppelen niet meer voor iedereen blokkeren.
 *
 * Hercontrole M2 (N4b): een IPv6-bron is het /56-netwerk, niet het losse
 * adres. Eén aansluiting of server heeft een /64 (2^64 adressen) en vaak een
 * /56; per adres tellen liet één machine met vijf adressen alle open codes
 * van alle organisaties laten vervallen. Een IPv4-adres blijft één bron, en
 * een IPv4-adres in IPv6-vorm (::ffff:192.0.2.1) telt als dat IPv4-adres.
 */
import { createHash } from 'node:crypto';
import { isIPv4, isIPv6 } from 'node:net';
import type { KoppelAntwoord } from './contract';
import { KOPPEL_BRON_MINUTEN, zoekKoppeling } from './koppelcode';
import { genereerSleutel } from './sleutel';
import type { ToonbankStore } from './store';
import { gelukt, mislukt, type Uitkomst } from './uitkomst';

const ONGELDIG = 'Deze koppelcode klopt niet, is al gebruikt of is verlopen. Vraag in BBQ Architect (Instellingen → Toonbank) een nieuwe.';

/** Een IPv6-bron is dit netwerk (prefixlengte in bits). */
export const KOPPEL_IPV6_PREFIX = 56;

/**
 * Het netwerk waar een poging vandaan komt: een IPv4-adres zelf, een
 * IPv6-adres als zijn /56 ("2001:db8:12:3400::/56"). Iets anders (geen
 * leesbaar adres, "onbekend") blijft zoals het is, in kleine letters.
 */
export function koppelNetwerk(ip: string): string {
    let a = ip.trim().toLowerCase();
    const haken = /^\[([^\]]+)\](?::\d+)?$/.exec(a);
    if (haken) a = haken[1];
    const v4poort = /^(\d{1,3}(?:\.\d{1,3}){3}):\d+$/.exec(a);
    if (v4poort) a = v4poort[1];
    a = a.replace(/%.*$/, '');
    if (isIPv4(a)) return a;
    if (!isIPv6(a)) return a;
    const g = ipv6Groepen(a);
    if (!g) return a;
    /* ::ffff:a.b.c.d (IPv4 in IPv6-vorm) is gewoon dat IPv4-adres. */
    if (g.slice(0, 5).every((x) => x === 0) && g[5] === 0xffff) {
        return [g[6] >> 8, g[6] & 0xff, g[7] >> 8, g[7] & 0xff].join('.');
    }
    const bits = KOPPEL_IPV6_PREFIX;
    const net = g.map((x, i) => {
        const van = i * 16;
        if (van + 16 <= bits) return x;
        if (van >= bits) return 0;
        return x & ((0xffff << (16 - (bits - van))) & 0xffff);
    });
    const kop = net.slice(0, Math.ceil(bits / 16)).map((x) => x.toString(16));
    return `${kop.join(':')}::/${bits}`;
}

/** De 8 groepen van 16 bits van een (geldig) IPv6-adres, ook met :: en een IPv4-staart. */
function ipv6Groepen(a: string): number[] | null {
    const delen = a.split('::');
    if (delen.length > 2) return null;
    const lees = (s: string): number[] | null => {
        if (s === '') return [];
        const uit: number[] = [];
        for (const d of s.split(':')) {
            if (d.includes('.')) {
                if (!isIPv4(d)) return null;
                const o = d.split('.').map(Number);
                uit.push((o[0] << 8) | o[1], (o[2] << 8) | o[3]);
            } else {
                uit.push(parseInt(d, 16));
            }
        }
        return uit;
    };
    const kop = lees(delen[0]);
    const staart = delen.length === 2 ? lees(delen[1]) : [];
    if (!kop || !staart) return null;
    const nullen = 8 - kop.length - staart.length;
    if (nullen < 0 || (delen.length === 1 && nullen !== 0)) return null;
    const g = [...kop, ...new Array<number>(nullen).fill(0), ...staart];
    return g.every((x) => Number.isInteger(x) && x >= 0 && x <= 0xffff) ? g : null;
}

/** De bron van een poging: SHA-256 (hex) van het netwerk (koppelNetwerk); het adres zelf wordt nergens bewaard. */
export function koppelBron(ip: string): string {
    return createHash('sha256').update(`toonbank-koppelen:${koppelNetwerk(ip)}`).digest('hex');
}

export async function koppel(store: ToonbankStore, verzoek: { koppelcode: string }, bron: string): Promise<Uitkomst<KoppelAntwoord>> {
    if (await store.koppelGeblokkeerd(bron)) {
        return mislukt('te_snel', `Te veel foute koppelcodes. Probeer het over ${KOPPEL_BRON_MINUTEN} minuten opnieuw.`, { retry_after: KOPPEL_BRON_MINUTEN * 60 });
    }
    const kandidaten = await store.koppelKandidaten();
    const gevonden = await zoekKoppeling(kandidaten, verzoek.koppelcode);
    if (!gevonden) {
        await store.koppelMislukt(bron);
        return mislukt('koppelcode_ongeldig', ONGELDIG);
    }
    const { sleutel, hash, prefix } = genereerSleutel();
    const k = await store.koppelAf(gevonden.apparaat_id, hash, prefix);
    if (!k) return mislukt('koppelcode_ongeldig', ONGELDIG);
    /* De sleutel gaat maar één keer over de lijn; daarna kent BBQ Architect alleen de hash. */
    return gelukt({ apparaat_id: k.apparaat_id, code: k.code, naam: k.naam, sleutel });
}
