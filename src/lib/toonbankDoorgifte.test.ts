import { describe, expect, it } from 'vitest';
// next.config.mjs is gewoon JavaScript; de doorgifte naar de Toonbank staat daar.
import { toonbankDoorgifte, toonbankUpstream } from '../../next.config.mjs';

describe('doorgifte /toonbank naar de Toonbank', () => {
    it('zonder adres geen doorgifte', () => {
        expect(toonbankUpstream('')).toBeNull();
        expect(toonbankUpstream(undefined)).toBeNull();
        expect(toonbankDoorgifte(null)).toEqual([]);
    });

    it('alleen https (http alleen op deze computer), en alleen de basis van het adres', () => {
        expect(toonbankUpstream('https://hopbites-toonbank.vercel.app/')).toBe('https://hopbites-toonbank.vercel.app');
        expect(toonbankUpstream(' https://hopbites-toonbank.vercel.app/iets ')).toBe('https://hopbites-toonbank.vercel.app');
        expect(toonbankUpstream('http://localhost:5173')).toBe('http://localhost:5173');
        expect(toonbankUpstream('http://hopbites-toonbank.vercel.app')).toBeNull();
        expect(toonbankUpstream('hopbites-toonbank.vercel.app')).toBeNull();
    });

    it('geeft /toonbank en alles daaronder door, zonder het voorvoegsel', () => {
        const regels = toonbankDoorgifte('https://hopbites-toonbank.vercel.app');
        expect(regels).toEqual([
            { source: '/toonbank', destination: 'https://hopbites-toonbank.vercel.app/' },
            { source: '/toonbank/', destination: 'https://hopbites-toonbank.vercel.app/' },
            { source: '/toonbank/:pad*', destination: 'https://hopbites-toonbank.vercel.app/:pad*' },
        ]);
    });

    it('leest standaard TOONBANK_UPSTREAM_URL', () => {
        const vorige = process.env.TOONBANK_UPSTREAM_URL;
        try {
            delete process.env.TOONBANK_UPSTREAM_URL;
            expect(toonbankDoorgifte()).toEqual([]);
            process.env.TOONBANK_UPSTREAM_URL = 'https://hopbites-toonbank.vercel.app';
            expect(toonbankDoorgifte()).toHaveLength(3);
        } finally {
            if (vorige === undefined) delete process.env.TOONBANK_UPSTREAM_URL;
            else process.env.TOONBANK_UPSTREAM_URL = vorige;
        }
    });
});
