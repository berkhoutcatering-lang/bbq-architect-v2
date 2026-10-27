import { describe, expect, it } from 'vitest';
import { controleerDevDb, isLokaleUrl } from './controleer-dev-db.mjs';

/* Verzonnen refs: 20 tekens, zoals een Supabase-project-ref. */
const LIVE = 'abcdefghijklmnopqrst';
const DEV = 'tsrqponmlkjihgfedcba';

describe('controleerDevDb', () => {
    it('weigert zonder LIVE_SUPABASE_REF', () => {
        const u = controleerDevDb({ NEXT_PUBLIC_SUPABASE_URL: `https://${DEV}.supabase.co` });
        expect(u.ok).toBe(false);
        expect(u.reden).toContain('LIVE_SUPABASE_REF ontbreekt');
    });

    it('weigert een lege of witruimte-LIVE_SUPABASE_REF', () => {
        expect(controleerDevDb({ LIVE_SUPABASE_REF: '   ', NEXT_PUBLIC_SUPABASE_URL: `https://${DEV}.supabase.co` }).ok).toBe(false);
    });

    it('weigert een LIVE_SUPABASE_REF die een URL is in plaats van een ref', () => {
        const u = controleerDevDb({ LIVE_SUPABASE_REF: `https://${LIVE}.supabase.co`, NEXT_PUBLIC_SUPABASE_URL: `https://${DEV}.supabase.co` });
        expect(u.ok).toBe(false);
        expect(u.reden).toContain('geen project-ref');
    });

    it('weigert zonder NEXT_PUBLIC_SUPABASE_URL', () => {
        const u = controleerDevDb({ LIVE_SUPABASE_REF: LIVE });
        expect(u.ok).toBe(false);
        expect(u.reden).toContain('NEXT_PUBLIC_SUPABASE_URL ontbreekt');
    });

    it('weigert als de URL naar live wijst, ook met hoofdletters of witruimte', () => {
        for (const url of [`https://${LIVE}.supabase.co`, `  HTTPS://${LIVE.toUpperCase()}.SUPABASE.CO/  `]) {
            const u = controleerDevDb({ LIVE_SUPABASE_REF: LIVE, NEXT_PUBLIC_SUPABASE_URL: url });
            expect(u.ok).toBe(false);
            expect(u.reden).toContain('wijst naar live');
        }
        expect(controleerDevDb({ LIVE_SUPABASE_REF: LIVE.toUpperCase(), NEXT_PUBLIC_SUPABASE_URL: `https://${LIVE}.supabase.co` }).ok).toBe(false);
    });

    it('laat een dev-project en een lokale Supabase door', () => {
        expect(controleerDevDb({ LIVE_SUPABASE_REF: LIVE, NEXT_PUBLIC_SUPABASE_URL: `https://${DEV}.supabase.co` })).toEqual({ ok: true });
        expect(controleerDevDb({ LIVE_SUPABASE_REF: LIVE, NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321' })).toEqual({ ok: true });
    });

    it('laat de lokale testdatabase (api-stand) ook zonder LIVE_SUPABASE_REF door', () => {
        for (const url of ['http://127.0.0.1:54321', 'http://localhost:54321', 'http://[::1]:54321', 'http://api.localhost:54321', '  HTTP://127.0.0.1:54381/  ']) {
            expect(isLokaleUrl(url)).toBe(true);
            expect(controleerDevDb({ NEXT_PUBLIC_SUPABASE_URL: url })).toEqual({ ok: true });
            expect(controleerDevDb({ LIVE_SUPABASE_REF: 'geen-ref', NEXT_PUBLIC_SUPABASE_URL: url })).toEqual({ ok: true });
        }
    });

    it('een lokaal-lijkende hostnaam is niet lokaal', () => {
        for (const url of [`https://localhost.${LIVE}.supabase.co`, 'https://127.0.0.1.nip.io', `https://${LIVE}.supabase.co/localhost`, 'ftp://127.0.0.1', 'geen url']) {
            expect(isLokaleUrl(url)).toBe(false);
            expect(controleerDevDb({ NEXT_PUBLIC_SUPABASE_URL: url }).ok).toBe(false);
        }
    });

    it('weigert een lokale URL waar de live-ref in staat', () => {
        const u = controleerDevDb({ LIVE_SUPABASE_REF: LIVE, NEXT_PUBLIC_SUPABASE_URL: `http://127.0.0.1:54321/${LIVE}` });
        expect(u.ok).toBe(false);
        expect(u.reden).not.toContain(LIVE);
    });

    it('noemt nooit een waarde in de reden', () => {
        const u = controleerDevDb({ LIVE_SUPABASE_REF: LIVE, NEXT_PUBLIC_SUPABASE_URL: `https://${LIVE}.supabase.co` });
        expect(u.ok).toBe(false);
        expect(u.reden).not.toContain(LIVE);
        expect(u.reden).not.toContain('supabase.co');
    });
});
