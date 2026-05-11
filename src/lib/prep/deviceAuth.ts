/**
 * Prep-KDS device-token + PIN auth helpers.
 *
 * Twee verschillende cryptographic mechanismen — bewust:
 *
 *   1) Device-tokens (long random strings) → SHA-256 hex.
 *      Entropy = 24 bytes ≈ 192 bits. Brute-force is onhaalbaar.
 *      Volgt patroon van extensionAuth.ts.
 *
 *   2) PINs (4-6 digits) → scrypt.
 *      Entropy = ~13-20 bits. SHA-256 zou een aanvaller die de hash steelt
 *      laten brute-forcen in milliseconden. scrypt maakt het ~100ms per
 *      poging → bruteforce-cost is dan dagen of meer.
 *
 *   Plus: PIN-lockout (5 fails = 5min) → DB-level rate-limit zodat ook
 *   zonder hash-leak een mens niet door 10000 codes kan tikken.
 */

import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';

/* ─── Cost-parameters ─────────────────────────────────────────── */

const SCRYPT_N = 16384;   // CPU/memory cost
const SCRYPT_R = 8;       // block size
const SCRYPT_P = 1;       // parallelization
const PIN_HASH_LEN = 64;

/* Wrap scrypt zelf — promisify(util) accepteert geen options-arg in TS types,
   maar de Node-runtime ondersteunt het wel. Eigen wrapper is type-safe en
   geeft ons controle over de cost-params. */
function scrypt(password: string, salt: Buffer, keylen: number): Promise<Buffer> {
    return new Promise((resolve, reject) => {
        scryptCallback(
            password,
            salt,
            keylen,
            { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P },
            (err, derived) => {
                if (err) reject(err);
                else resolve(derived);
            },
        );
    });
}

/* ─── Device-tokens (16-byte random hex, SHA-256 hash op DB) ─── */

const TOKEN_PREFIX = 'kds_';
const TOKEN_RAW_BYTES = 16;

export function generateDeviceToken(): { rawToken: string; tokenHash: string; tokenPrefix: string } {
    const body = randomBytes(TOKEN_RAW_BYTES).toString('hex'); // 32 hex chars
    const rawToken = `${TOKEN_PREFIX}${body}`;
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');
    const tokenPrefix = `${TOKEN_PREFIX}${body.slice(0, 6)}…`;
    return { rawToken, tokenHash, tokenPrefix };
}

export function hashDeviceToken(raw: string): string {
    return createHash('sha256').update(raw.trim()).digest('hex');
}

/* ─── PIN-hashing (scrypt, 16-byte salt + 64-byte hash) ─────── */

/**
 * Hash een PIN met scrypt + random salt.
 * Returnt format: `<salt-hex>:<hash-hex>` — opslaan in personeel.kds_pin_hash.
 */
export async function hashPin(pin: string): Promise<string> {
    if (!/^\d{4,6}$/.test(pin)) {
        throw new Error('PIN moet 4-6 cijfers zijn');
    }
    const salt = randomBytes(16);
    const derived = await scrypt(pin, salt, PIN_HASH_LEN);
    return `${salt.toString('hex')}:${derived.toString('hex')}`;
}

/**
 * Constant-time vergelijking van een PIN-poging met opgeslagen hash.
 * Returnt true bij match. Returnt false bij ongeldig format, scrypt-fail,
 * of length-mismatch — nooit gooien zodat caller veilig blijft.
 */
export async function verifyPin(pin: string, stored: string | null): Promise<boolean> {
    if (!stored || typeof stored !== 'string') return false;
    if (!/^\d{4,6}$/.test(pin)) return false;
    const [saltHex, hashHex] = stored.split(':');
    if (!saltHex || !hashHex) return false;
    let salt: Buffer;
    let expected: Buffer;
    try {
        salt = Buffer.from(saltHex, 'hex');
        expected = Buffer.from(hashHex, 'hex');
    } catch {
        return false;
    }
    if (expected.length !== PIN_HASH_LEN) return false;
    let derived: Buffer;
    try {
        derived = await scrypt(pin, salt, PIN_HASH_LEN);
    } catch {
        return false;
    }
    if (derived.length !== expected.length) return false;
    return timingSafeEqual(derived, expected);
}

/* ─── Lockout-helpers (5 fails = 5 min lock) ───────────────── */

export const PIN_MAX_ATTEMPTS = 5;
export const PIN_LOCKOUT_MINUTES = 5;
export const PIN_LOCKOUT_LOOKBACK_MINUTES = 10;

/** Returnt ms-timestamp wanneer lockout afloopt, of null als geen lockout actief. */
export function isLockedNow(lockoutUntil: string | null | undefined): boolean {
    if (!lockoutUntil) return false;
    const t = new Date(lockoutUntil).getTime();
    if (!Number.isFinite(t)) return false;
    return t > Date.now();
}
