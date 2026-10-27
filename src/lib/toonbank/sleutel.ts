/**
 * Apparaatsleutels en sessietokens van de Toonbank (BA-7a).
 * Contract: hopbites-toonbank/docs/datacontract-toonbank-v1.md §1.1, §3.1.
 *
 * Zelfde stijl als src/lib/extensionAuth.ts (voorvoegsel + base32, SHA-256 in
 * de database, de sleutel zelf maar één keer getoond), met twee verschillen:
 *   - elk teken komt uit een eigen willekeurige byte (32 tekens = 160 bits);
 *   - geen database-aanroepen hier: dit bestand is puur, de opslag zit in
 *     ToonbankStore (store.ts).
 *
 *   apparaatsleutel  tb_<32 base32>   header x-toonbank-sleutel, lang geldig
 *   sessietoken      tbs_<32 base32>  header x-toonbank-medewerker, een dienst
 *                                     (12 uur) of een eigenaargoedkeuring (60 s)
 *
 * Opgeslagen: SHA-256 (hex) van de hele tekst. Een hoge entropie maakt
 * scrypt hier overbodig; voor de korte codes (koppelcode, inlogcode) is dat
 * anders, zie koppelcode.ts en src/lib/prep/deviceAuth.ts.
 */
import { createHash, randomBytes } from 'node:crypto';

export const SLEUTEL_VOORVOEGSEL = 'tb_';
export const SESSIE_VOORVOEGSEL = 'tbs_';
const LENGTE = 32;
const BASE32 = 'abcdefghijklmnopqrstuvwxyz234567';

const SLEUTEL_VORM = /^tb_[a-z2-7]{32}$/;
const SESSIE_VORM = /^tbs_[a-z2-7]{32}$/;

function base32(lengte: number): string {
    const buf = randomBytes(lengte);
    let uit = '';
    /* 256 is een veelvoud van 32: byte & 31 is zuiver uniform. */
    for (let i = 0; i < lengte; i++) uit += BASE32[buf[i]! & 31];
    return uit;
}

export function sha256Hex(tekst: string): string {
    return createHash('sha256').update(tekst, 'utf8').digest('hex');
}

/** Een nieuwe apparaatsleutel: alleen `sleutel` gaat (één keer) naar de tablet. */
export function genereerSleutel(): { sleutel: string; hash: string; prefix: string } {
    const body = base32(LENGTE);
    const sleutel = `${SLEUTEL_VOORVOEGSEL}${body}`;
    return { sleutel, hash: sha256Hex(sleutel), prefix: `${SLEUTEL_VOORVOEGSEL}${body.slice(0, 6)}…` };
}

/** Heeft deze tekst de vorm van een apparaatsleutel? (Niets zeggen over bestaan.) */
export function isSleutel(tekst: string | null | undefined): tekst is string {
    return typeof tekst === 'string' && SLEUTEL_VORM.test(tekst);
}

/** De hash zoals hij in toonbank_apparaten.sleutel_hash staat. Spaties eromheen tellen niet. */
export function hashSleutel(tekst: string): string {
    return sha256Hex(tekst.trim());
}

/** Een nieuw sessietoken (dienst of eigenaargoedkeuring). */
export function genereerSessieToken(): { token: string; hash: string } {
    const token = `${SESSIE_VOORVOEGSEL}${base32(LENGTE)}`;
    return { token, hash: sha256Hex(token) };
}

export function isSessieToken(tekst: string | null | undefined): tekst is string {
    return typeof tekst === 'string' && SESSIE_VORM.test(tekst);
}

export function hashSessieToken(tekst: string): string {
    return sha256Hex(tekst.trim());
}
