import { describe, it, expect, beforeEach, vi } from 'vitest';
import { dedupe, _resetDedupe } from './requestDedupe';

describe('dedupe', () => {
    beforeEach(function () { _resetDedupe(); });

    it('doet gelijktijdige identieke vragen maar één keer', async () => {
        const run = vi.fn(function () {
            return new Promise(function (r) { setTimeout(function () { r('ok'); }, 10); });
        });
        const [a, b, c] = await Promise.all([
            dedupe('zelfde', run), dedupe('zelfde', run), dedupe('zelfde', run),
        ]);
        expect(run).toHaveBeenCalledTimes(1);
        expect([a, b, c]).toEqual(['ok', 'ok', 'ok']);
    });

    it('houdt verschillende sleutels gescheiden', async () => {
        const run = vi.fn(function () { return Promise.resolve('x'); });
        await Promise.all([dedupe('a', run), dedupe('b', run)]);
        expect(run).toHaveBeenCalledTimes(2);
    });

    it('bewaart niets ná afloop — een latere vraag haalt opnieuw op', async () => {
        const run = vi.fn(function () { return Promise.resolve('vers'); });
        await dedupe('k', run);
        await dedupe('k', run);
        expect(run).toHaveBeenCalledTimes(2);
    });

    it('geeft een fout aan alle wachters door en blokkeert daarna niet', async () => {
        const stuk = vi.fn(function () { return Promise.reject(new Error('kapot')); });
        const beide = await Promise.allSettled([dedupe('f', stuk), dedupe('f', stuk)]);
        expect(beide.every(function (r) { return r.status === 'rejected'; })).toBe(true);
        expect(stuk).toHaveBeenCalledTimes(1);

        // sleutel moet weer vrij zijn
        const goed = vi.fn(function () { return Promise.resolve('weer ok'); });
        await expect(dedupe('f', goed)).resolves.toBe('weer ok');
    });
});
