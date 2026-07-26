import { describe, it, expect } from 'vitest';
import { ensurePdfDomGlobals, __testing } from './pdfDomGlobals';

const { MiniDOMMatrix } = __testing;

describe('MiniDOMMatrix', () => {
    it('leeg = identiteit', () => {
        const m = new MiniDOMMatrix();
        expect([m.a, m.b, m.c, m.d, m.e, m.f]).toEqual([1, 0, 0, 1, 0, 0]);
        expect(m.isIdentity).toBe(true);
    });
    it('leest een 6-getallen array', () => {
        const m = new MiniDOMMatrix([2, 0, 0, 3, 10, 20]);
        expect([m.a, m.d, m.e, m.f]).toEqual([2, 3, 10, 20]);
        expect(m.isIdentity).toBe(false);
    });
    it('vermenigvuldigen: schaal daarna verschuiven', () => {
        const scale = new MiniDOMMatrix([2, 0, 0, 2, 0, 0]);
        const translate = new MiniDOMMatrix([1, 0, 0, 1, 5, 7]);
        const m = scale.multiply(translate);
        // punt (1,1): eerst verschuiven → (6,8), dan schalen → (12,16)
        expect(m.transformPoint({ x: 1, y: 1 })).toEqual({ x: 12, y: 16 });
    });
    it('inverse maakt de transformatie ongedaan', () => {
        const m = new MiniDOMMatrix([2, 0, 0, 4, 10, 20]);
        const p = m.transformPoint({ x: 3, y: 5 });
        const back = m.inverse().transformPoint(p);
        expect(back.x).toBeCloseTo(3, 10);
        expect(back.y).toBeCloseTo(5, 10);
    });
    it('niet-inverteerbaar → NaN i.p.v. stilletjes 0', () => {
        const m = new MiniDOMMatrix([0, 0, 0, 0, 0, 0]);
        expect(Number.isNaN(m.inverse().a)).toBe(true);
    });
    it('transformPoint zonder argument gebruikt de oorsprong', () => {
        expect(new MiniDOMMatrix([1, 0, 0, 1, 8, 9]).transformPoint()).toEqual({ x: 8, y: 9 });
    });
    it('toString geeft css-matrix-notatie', () => {
        expect(new MiniDOMMatrix([1, 2, 3, 4, 5, 6]).toString()).toBe('matrix(1, 2, 3, 4, 5, 6)');
    });
});

describe('ensurePdfDomGlobals', () => {
    it('zet de ontbrekende globals klaar', () => {
        ensurePdfDomGlobals();
        const g = globalThis as Record<string, unknown>;
        expect(typeof g.DOMMatrix).toBe('function');
        expect(typeof g.Path2D).toBe('function');
        expect(typeof g.ImageData).toBe('function');
    });
    it('overschrijft een bestaande implementatie niet', () => {
        const g = globalThis as Record<string, unknown>;
        const sentinel = class Bestaand {};
        g.DOMMatrix = sentinel;
        ensurePdfDomGlobals();
        expect(g.DOMMatrix).toBe(sentinel);
        delete g.DOMMatrix;
        ensurePdfDomGlobals();          // herstel voor andere tests
    });
});
