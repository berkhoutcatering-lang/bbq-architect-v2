import { describe, expect, it } from 'vitest';
import { bepaalTht, vandaagIso } from './tht';

describe('bepaalTht', () => {
    it('stap wint van component', () => {
        expect(bepaalTht('2026-09-16', { stapDagen: 5, componentDagen: 90 })).toEqual({ tht: '2026-09-21', dagen: 5, bron: 'stap' });
    });
    it('component als de stap niets zegt', () => {
        expect(bepaalTht('2026-09-16', { stapDagen: null, componentDagen: 90 })).toEqual({ tht: '2026-12-15', dagen: 90, bron: 'component' });
    });
    it('geen bron = geen THT, nooit een verzonnen aantal dagen', () => {
        expect(bepaalTht('2026-09-16', {})).toEqual({ tht: null, dagen: null, bron: null });
        expect(bepaalTht('2026-09-16', { componentDagen: 0 }).tht).toBeNull();
    });
    it('vandaagIso is een datum in Amsterdam', () => {
        expect(vandaagIso(new Date('2026-09-16T22:30:00Z'))).toBe('2026-09-17');
        expect(vandaagIso(new Date('2026-09-16T10:00:00Z'))).toBe('2026-09-16');
    });
});
