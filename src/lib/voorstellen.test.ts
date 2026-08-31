/**
 * De lade mag nooit een voorstel laten bevestigen dat allang verlopen is: dat
 * rekent op prijzen en voorraad van gisteren. Deze tests leggen die grens vast.
 */
import { describe, it, expect } from 'vitest';
import {
    tijdOver,
    isTeBevestigen,
    VOORSTEL_TYPES,
    VOORSTEL_SOORTEN,
    type Voorstel,
} from './voorstellen';

const NU = new Date('2026-08-31T12:00:00Z');
const over = (uren: number) => ({ expires_at: new Date(NU.getTime() + uren * 3600_000).toISOString() });

describe('tijdOver', () => {
    it('rekent uren om naar mensentaal', () => {
        expect(tijdOver(over(23), NU).tekst).toBe('nog 23 uur');
        // Naar beneden afronden: liever iets minder beloven dan iets meer.
        expect(tijdOver(over(1.5), NU).tekst).toBe('nog 1 uur');
    });

    it('schakelt onder het uur over op minuten', () => {
        expect(tijdOver(over(0.5), NU).tekst).toBe('nog 30 min');
        expect(tijdOver(over(0.05), NU).tekst).toBe('nog 3 min');
    });

    it('noemt verstreken tijd verlopen', () => {
        const t = tijdOver(over(-1), NU);
        expect(t.verlopen).toBe(true);
        expect(t.tekst).toBe('verlopen');
        expect(t.minuten).toBe(0);
    });

    it('is op het exacte moment van verlopen al verlopen', () => {
        expect(tijdOver(over(0), NU).verlopen).toBe(true);
    });
});

describe('isTeBevestigen', () => {
    const basis = { status: 'pending' as const };

    it('laat een openstaand, geldig voorstel door', () => {
        expect(isTeBevestigen({ ...basis, ...over(5) }, NU)).toBe(true);
    });

    it('weigert een verlopen voorstel, ook als de status nog pending zegt', () => {
        // De status kan achterlopen tot iemand kijkt — daarom allebei checken.
        expect(isTeBevestigen({ ...basis, ...over(-1) }, NU)).toBe(false);
    });

    it('weigert alles wat al behandeld is', () => {
        for (const s of ['confirmed', 'edited', 'cancelled', 'expired'] as const) {
            expect(isTeBevestigen({ status: s, ...over(5) }, NU)).toBe(false);
        }
    });
});

describe('VOORSTEL_SOORTEN', () => {
    it('beschrijft elk type dat bestaat', () => {
        for (const t of VOORSTEL_TYPES) {
            const s = VOORSTEL_SOORTEN[t];
            expect(s, `type ${t} mist een omschrijving`).toBeTruthy();
            expect(s.titel.length).toBeGreaterThan(0);
            expect(s.gevolg.length, `type ${t} mist een gevolg-zin`).toBeGreaterThan(0);
        }
    });

    it('merkt alles wat het bedrijf verlaat als extern', () => {
        // De harde regel uit het plan: extern of onomkeerbaar → altijd tekenen.
        expect(VOORSTEL_SOORTEN.email_draft.zwaarte).toBe('extern');
        expect(VOORSTEL_SOORTEN.offerte_draft.zwaarte).toBe('extern');
        expect(VOORSTEL_SOORTEN.inkoop_order.zwaarte).toBe('extern');
    });

    it('houdt intern werk intern', () => {
        expect(VOORSTEL_SOORTEN.recept_ontleding.zwaarte).toBe('intern');
        expect(VOORSTEL_SOORTEN.ingredient_profiel.zwaarte).toBe('intern');
    });
});

describe('Voorstel-vorm', () => {
    it('houdt de payload generiek', () => {
        // Elk soort voorstel heeft zijn eigen vorm; de lade hoeft die niet te
        // kennen. Dit is een typetest die faalt zodra dat verandert.
        const v: Voorstel<{ stappen: string[] }> = {
            id: 'a', organization_id: 'b', user_id: 'c',
            proposal_type: 'recept_ontleding',
            payload: { stappen: ['trimmen', 'rub'] },
            status: 'pending', chat_message_id: null, result_id: null,
            created_at: NU.toISOString(), expires_at: over(24).expires_at, confirmed_at: null,
        };
        expect(v.payload.stappen).toHaveLength(2);
    });
});
