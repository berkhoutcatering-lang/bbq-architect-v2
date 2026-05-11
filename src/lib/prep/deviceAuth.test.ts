import { describe, it, expect } from 'vitest';
import {
    generateDeviceToken,
    hashDeviceToken,
    hashPin,
    verifyPin,
    isLockedNow,
    PIN_MAX_ATTEMPTS,
    PIN_LOCKOUT_MINUTES,
} from './deviceAuth';

describe('generateDeviceToken', () => {
    it('returnt prefix kds_ + 32 hex chars', () => {
        const { rawToken } = generateDeviceToken();
        expect(rawToken).toMatch(/^kds_[0-9a-f]{32}$/);
    });
    it('token-hash is SHA-256 hex (64 chars)', () => {
        const { tokenHash } = generateDeviceToken();
        expect(tokenHash).toMatch(/^[0-9a-f]{64}$/);
    });
    it('genereert unieke tokens', () => {
        const a = generateDeviceToken();
        const b = generateDeviceToken();
        expect(a.rawToken).not.toBe(b.rawToken);
    });
});

describe('hashDeviceToken', () => {
    it('is deterministisch', () => {
        expect(hashDeviceToken('kds_abc')).toBe(hashDeviceToken('kds_abc'));
    });
    it('strip whitespace', () => {
        expect(hashDeviceToken('  kds_abc  ')).toBe(hashDeviceToken('kds_abc'));
    });
    it('verschilt voor verschillende inputs', () => {
        expect(hashDeviceToken('kds_a')).not.toBe(hashDeviceToken('kds_b'));
    });
});

describe('hashPin + verifyPin', () => {
    it('hash en verify roundtrip werkt', async () => {
        const hashed = await hashPin('1234');
        const ok = await verifyPin('1234', hashed);
        expect(ok).toBe(true);
    });
    it('verifyPin returnt false bij verkeerde PIN', async () => {
        const hashed = await hashPin('1234');
        expect(await verifyPin('1235', hashed)).toBe(false);
    });
    it('hash bevat salt:hash format', async () => {
        const hashed = await hashPin('1234');
        expect(hashed).toMatch(/^[0-9a-f]+:[0-9a-f]+$/);
    });
    it('zelfde PIN → andere hash (salt-uniqueness)', async () => {
        const a = await hashPin('1234');
        const b = await hashPin('1234');
        expect(a).not.toBe(b);
    });
    it('werpt bij ongeldige PIN-format bij hash', async () => {
        await expect(hashPin('12')).rejects.toThrow(/4-6 cijfers/);
        await expect(hashPin('abcd')).rejects.toThrow(/4-6 cijfers/);
    });
    it('verifyPin returnt false bij null stored', async () => {
        expect(await verifyPin('1234', null)).toBe(false);
    });
    it('verifyPin returnt false bij corrupted stored', async () => {
        expect(await verifyPin('1234', 'niet-een-hash')).toBe(false);
        expect(await verifyPin('1234', ':')).toBe(false);
        expect(await verifyPin('1234', 'nothex:nothex')).toBe(false);
    });
    it('verifyPin returnt false bij ongeldige PIN-input', async () => {
        const hashed = await hashPin('1234');
        expect(await verifyPin('abc', hashed)).toBe(false);
        expect(await verifyPin('', hashed)).toBe(false);
    });
    it('6-digit PIN werkt ook', async () => {
        const hashed = await hashPin('987654');
        expect(await verifyPin('987654', hashed)).toBe(true);
        expect(await verifyPin('987653', hashed)).toBe(false);
    });
});

describe('isLockedNow', () => {
    it('null = niet locked', () => {
        expect(isLockedNow(null)).toBe(false);
        expect(isLockedNow(undefined)).toBe(false);
    });
    it('verleden timestamp = niet locked', () => {
        const past = new Date(Date.now() - 60_000).toISOString();
        expect(isLockedNow(past)).toBe(false);
    });
    it('toekomst timestamp = locked', () => {
        const future = new Date(Date.now() + 60_000).toISOString();
        expect(isLockedNow(future)).toBe(true);
    });
    it('ongeldige string = niet locked', () => {
        expect(isLockedNow('not-a-date')).toBe(false);
    });
});

describe('Lockout constants', () => {
    it('5 attempts max', () => {
        expect(PIN_MAX_ATTEMPTS).toBe(5);
    });
    it('5 min lockout', () => {
        expect(PIN_LOCKOUT_MINUTES).toBe(5);
    });
});
