/**
 * De koppelcode van de Toonbank (BA-7a): 6 cijfers, 5 minuten geldig, hooguit
 * 5 foute pogingen per bron en 25 in totaal (review M2 klein 7). Contract:
 * datacontract-toonbank-v1.md §3.3 (POST koppelen).
 *
 *   - Maken: crypto.randomInt (uniform, geen Math.random).
 *   - Bewaren: alleen de scrypt-hash (deviceAuth.hashPin), in
 *     toonbank_apparaten.koppelcode_hash. Zes cijfers zijn maar 20 bits: een
 *     snelle hash zou bij een gelekte database in milliseconden te raden zijn.
 *   - Geldigheid en pogingen houdt de database bij (toonbank_apparaat_nieuw,
 *     toonbank_koppel_mislukt), niet het geheugen van één serverinstantie.
 *
 * Een scrypt-hash heeft een eigen zout, dus opzoeken op hash kan niet: de API
 * vergelijkt de code met elke open code (er staan er hooguit een paar open).
 */
import { randomInt } from 'node:crypto';
import { hashPin, verifyPin } from '@/lib/prep/deviceAuth';

export const KOPPELCODE_MINUTEN = 5;
/* De grenzen (5 per bron per 15 minuten, 25 per code; review M2 klein 7) staan in beheer.ts (puur, ook voor het scherm). */
export { KOPPEL_BRON_MINUTEN, KOPPEL_MAX_POGINGEN, KOPPEL_POGINGEN_PER_BRON } from './beheer';
export const KOPPELCODE_VORM = /^\d{6}$/;

/** Een nieuwe koppelcode, bijvoorbeeld "042917" (voorloopnullen tellen mee). */
export function maakKoppelcode(): string {
    return String(randomInt(0, 1_000_000)).padStart(6, '0');
}

/** De scrypt-hash voor toonbank_apparaten.koppelcode_hash (formaat zout:hash). */
export async function hashKoppelcode(code: string): Promise<string> {
    if (!KOPPELCODE_VORM.test(code)) throw new Error('Een koppelcode is precies 6 cijfers');
    return hashPin(code);
}

/** Klopt deze code bij deze hash? Gooit nooit. */
export async function koppelcodeKlopt(code: string, hash: string | null): Promise<boolean> {
    if (!KOPPELCODE_VORM.test(code)) return false;
    return verifyPin(code, hash);
}

/**
 * Bij welke open code hoort deze invoer? De eerste die klopt, of null.
 * Altijd alle kandidaten doorlopen: zo duurt een foute code net zo lang als
 * een goede (geen tijdverschil om op te meten).
 */
export async function zoekKoppeling<T extends { koppelcode_hash: string }>(kandidaten: readonly T[], code: string): Promise<T | null> {
    if (!KOPPELCODE_VORM.test(code)) return null;
    let gevonden: T | null = null;
    for (const k of kandidaten) {
        const klopt = await verifyPin(code, k.koppelcode_hash);
        if (klopt && !gevonden) gevonden = k;
    }
    return gevonden;
}
