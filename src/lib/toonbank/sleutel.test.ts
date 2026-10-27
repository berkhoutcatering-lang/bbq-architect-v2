import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { genereerSessieToken, genereerSleutel, hashSessieToken, hashSleutel, isSessieToken, isSleutel } from './sleutel';
import { maakKoppelcode, hashKoppelcode, koppelcodeKlopt, zoekKoppeling } from './koppelcode';

describe('apparaatsleutel', () => {
    it('tb_ + 32 base32-tekens, SHA-256 van de hele sleutel, prefix van 6', () => {
        const { sleutel, hash, prefix } = genereerSleutel();
        expect(sleutel).toMatch(/^tb_[a-z2-7]{32}$/);
        expect(hash).toBe(createHash('sha256').update(sleutel).digest('hex'));
        expect(prefix).toBe(`${sleutel.slice(0, 9)}…`);
        expect(isSleutel(sleutel)).toBe(true);
        expect(hashSleutel(` ${sleutel} `)).toBe(hash);
    });

    it('is elke keer anders', () => {
        const set = new Set(Array.from({ length: 200 }, () => genereerSleutel().sleutel));
        expect(set.size).toBe(200);
    });

    it('herkent geen andere vormen', () => {
        expect(isSleutel('ext_a3f47x9k2bm8h5t6q1z0wpyc')).toBe(false);
        expect(isSleutel('tb_KORT')).toBe(false);
        expect(isSleutel(`tbs_${'a'.repeat(32)}`)).toBe(false);
        expect(isSleutel(null)).toBe(false);
    });
});

describe('sessietoken', () => {
    it('tbs_ + 32 base32-tekens, hash = SHA-256', () => {
        const { token, hash } = genereerSessieToken();
        expect(isSessieToken(token)).toBe(true);
        expect(isSleutel(token)).toBe(false);
        expect(hashSessieToken(token)).toBe(hash);
    });
});

describe('koppelcode', () => {
    it('altijd 6 cijfers, ook met voorloopnullen', () => {
        for (let i = 0; i < 500; i++) expect(maakKoppelcode()).toMatch(/^\d{6}$/);
    });

    it('scrypt-hash in het formaat van de database; alleen de juiste code klopt', async () => {
        const hash = await hashKoppelcode('042917');
        expect(hash).toMatch(/^[0-9a-f]{32}:[0-9a-f]{128}$/);
        expect(await koppelcodeKlopt('042917', hash)).toBe(true);
        expect(await koppelcodeKlopt('042918', hash)).toBe(false);
        expect(await koppelcodeKlopt('42917', hash)).toBe(false);
        await expect(hashKoppelcode('12345')).rejects.toThrow();
    });

    it('zoekt de juiste open code tussen meerdere', async () => {
        const a = { apparaat_id: 'a', koppelcode_hash: await hashKoppelcode('111111') };
        const b = { apparaat_id: 'b', koppelcode_hash: await hashKoppelcode('222222') };
        expect((await zoekKoppeling([a, b], '222222'))?.apparaat_id).toBe('b');
        expect(await zoekKoppeling([a, b], '333333')).toBeNull();
        expect(await zoekKoppeling([a, b], 'abc')).toBeNull();
    });
});
