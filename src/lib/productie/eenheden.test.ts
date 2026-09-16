import { describe, expect, it } from 'vitest';
import { berekenEenheden, formatInhoud, naarEenheid, normaliseerEenheid, verdeelOverAantal } from './eenheden';

describe('berekenEenheden — 12 kg → 12 zakken', () => {
    it('12 kg in zakken van 1 kg = exact 12, geen rest', () => {
        const u = berekenEenheden(12, 'kg', 1, 'kg');
        expect(u.fout).toBeNull();
        expect(u.eenheden).toHaveLength(12);
        expect(u.volle).toBe(12);
        expect(u.rest).toBeNull();
        expect(u.eenheden[11]).toEqual({ volgnummer: 12, inhoud: 1, eenheid: 'kg' });
    });
    it('12,4 kg = 12 volle + een rest van 0,4 kg met echt gewicht', () => {
        const u = berekenEenheden(12.4, 'kg', 1, 'kg');
        expect(u.eenheden).toHaveLength(13);
        expect(u.rest).toBe(0.4);
        expect(u.eenheden[12]).toEqual({ volgnummer: 13, inhoud: 0.4, eenheid: 'kg' });
    });
    it('een rest onder 5 % is weegruis en krijgt geen eigen label', () => {
        const u = berekenEenheden(12.03, 'kg', 1, 'kg');
        expect(u.eenheden).toHaveLength(12);
        expect(u.rest).toBeNull();
    });
    it('rekent gram naar kilo: 12000 g in 1 kg = 12', () => {
        expect(berekenEenheden(12000, 'g', 1, 'kg').eenheden).toHaveLength(12);
        expect(berekenEenheden(6, 'l', 500, 'ml').eenheden).toHaveLength(12);
    });
    it('weigert stuks in kilo', () => {
        const u = berekenEenheden(12, 'stuk', 1, 'kg');
        expect(u.fout).toContain('niet om te rekenen');
        expect(u.eenheden).toEqual([]);
    });
    it('te weinig voor één eenheid', () => {
        expect(berekenEenheden(0.02, 'kg', 1, 'kg').fout).toContain('Te weinig');
        expect(berekenEenheden(0, 'kg', 1, 'kg').fout).toBeTruthy();
    });
    it('minder dan één verpakking maar boven de ruis = één resteenheid', () => {
        const u = berekenEenheden(0.7, 'kg', 1, 'kg');
        expect(u.eenheden).toEqual([{ volgnummer: 1, inhoud: 0.7, eenheid: 'kg' }]);
    });
    it('vermijdt drijvende-komma-verrassingen (0,1 + 0,2)', () => {
        const u = berekenEenheden(0.3, 'kg', 0.1, 'kg');
        expect(u.eenheden).toHaveLength(3);
        expect(u.rest).toBeNull();
    });
});

describe('verdeelOverAantal — de kok corrigeert', () => {
    it('12,4 kg in 13 potten = 13 × 0,954', () => {
        const u = verdeelOverAantal(12.4, 'kg', 13, 'kg');
        expect(u.eenheden).toHaveLength(13);
        expect(u.eenheden[0].inhoud).toBe(0.954);
        expect(u.fout).toBeNull();
    });
    it('weigert 0 of 501', () => {
        expect(verdeelOverAantal(12, 'kg', 0, 'kg').fout).toBeTruthy();
        expect(verdeelOverAantal(12, 'kg', 501, 'kg').fout).toBeTruthy();
    });
});

describe('eenheden', () => {
    it('normaliseert de spellingen uit de rest van de app', () => {
        expect(normaliseerEenheid('liter')).toBe('l');
        expect(normaliseerEenheid('stuks')).toBe('stuk');
        expect(normaliseerEenheid('KG')).toBe('kg');
        expect(normaliseerEenheid('bak')).toBeNull();
    });
    it('naarEenheid', () => {
        expect(naarEenheid(1500, 'g', 'kg')).toBe(1.5);
        expect(naarEenheid(2, 'l', 'ml')).toBe(2000);
        expect(naarEenheid(2, 'l', 'kg')).toBeNull();
    });
    it('formatInhoud is wat op het label komt', () => {
        expect(formatInhoud(1, 'kg')).toBe('1,00 kg');
        expect(formatInhoud(0.4, 'kg')).toBe('0,40 kg');
        expect(formatInhoud(500, 'g')).toBe('500 g');
        expect(formatInhoud(12, 'stuk')).toBe('12 stuks');
        expect(formatInhoud(1, 'portie')).toBe('1 portie');
    });
});
