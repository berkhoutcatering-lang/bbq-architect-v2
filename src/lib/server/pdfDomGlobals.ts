/**
 * Minimale browser-globals die pdfjs bij het laden verwacht.
 *
 * pdfjs' legacy-build verwijst op module-niveau naar `DOMMatrix`, `Path2D` en
 * `ImageData` — browser-API's die het normaal uit een optionele canvas-module
 * haalt. Op Vercel lukt dat niet en klapt de import met
 * "ReferenceError: DOMMatrix is not defined" (gemeten 2026-07-26 via
 * /api/systeem/pdf-textlayer-check). Lokaal werkte het toevallig wel.
 *
 * Wij lezen alléén de tekstlaag en tekenen niets: die globals worden bij
 * `getTextContent()` niet echt gebruikt, ze moeten alleen bestaan. DOMMatrix
 * krijgt toch echte affiene rekenkunde mee — een stub die stilletjes verkeerd
 * rekent is precies het soort valse zekerheid dat we hier niet willen.
 */
import 'server-only';

/* 2D affiene matrix: [a c e / b d f / 0 0 1] */
class MiniDOMMatrix {
    a = 1; b = 0; c = 0; d = 1; e = 0; f = 0;

    constructor(init?: unknown) {
        if (typeof init === 'string') return;          // CSS-transform: niet nodig voor tekst
        if (Array.isArray(init) && init.length >= 6) {
            [this.a, this.b, this.c, this.d, this.e, this.f] = init as number[];
        } else if (init && typeof init === 'object') {
            const m = init as Partial<MiniDOMMatrix>;
            this.a = m.a ?? 1; this.b = m.b ?? 0; this.c = m.c ?? 0;
            this.d = m.d ?? 1; this.e = m.e ?? 0; this.f = m.f ?? 0;
        }
    }

    get isIdentity(): boolean {
        return this.a === 1 && this.b === 0 && this.c === 0
            && this.d === 1 && this.e === 0 && this.f === 0;
    }

    /** this × other (dezelfde volgorde als DOMMatrix.multiply). */
    multiply(other: MiniDOMMatrix): MiniDOMMatrix {
        const r = new MiniDOMMatrix();
        r.a = this.a * other.a + this.c * other.b;
        r.b = this.b * other.a + this.d * other.b;
        r.c = this.a * other.c + this.c * other.d;
        r.d = this.b * other.c + this.d * other.d;
        r.e = this.a * other.e + this.c * other.f + this.e;
        r.f = this.b * other.e + this.d * other.f + this.f;
        return r;
    }

    /** Inverse; niet-inverteerbaar (determinant 0) → alles NaN, net als de echte API. */
    inverse(): MiniDOMMatrix {
        const det = this.a * this.d - this.b * this.c;
        const r = new MiniDOMMatrix();
        if (det === 0) {
            r.a = r.b = r.c = r.d = r.e = r.f = NaN;
            return r;
        }
        r.a = this.d / det;
        r.b = -this.b / det;
        r.c = -this.c / det;
        r.d = this.a / det;
        r.e = (this.c * this.f - this.d * this.e) / det;
        r.f = (this.b * this.e - this.a * this.f) / det;
        return r;
    }

    transformPoint(p: { x?: number; y?: number } = {}): { x: number; y: number } {
        const x = p.x ?? 0;
        const y = p.y ?? 0;
        return { x: this.a * x + this.c * y + this.e, y: this.b * x + this.d * y + this.f };
    }

    toString(): string {
        return `matrix(${this.a}, ${this.b}, ${this.c}, ${this.d}, ${this.e}, ${this.f})`;
    }
}

/* Alleen relevant bij tekenen; moeten bestaan, verder niets doen. */
class MiniPath2D {
    addPath() {} moveTo() {} lineTo() {} bezierCurveTo() {} quadraticCurveTo() {}
    closePath() {} rect() {} arc() {} ellipse() {}
}

class MiniImageData {
    data: Uint8ClampedArray;
    constructor(public width = 0, public height = 0) {
        this.data = new Uint8ClampedArray(Math.max(0, width * height * 4));
    }
}

/**
 * Zet de ontbrekende globals klaar. Idempotent en niet-destructief: een echte
 * implementatie (browser, of een Node-versie die ze wél heeft) blijft staan.
 * Roep dit aan vlak vóór het importeren van pdfjs.
 */
export function ensurePdfDomGlobals(): void {
    const g = globalThis as Record<string, unknown>;
    if (typeof g.DOMMatrix === 'undefined') g.DOMMatrix = MiniDOMMatrix;
    if (typeof g.Path2D === 'undefined') g.Path2D = MiniPath2D;
    if (typeof g.ImageData === 'undefined') g.ImageData = MiniImageData;
}

/* Alleen voor tests. */
export const __testing = { MiniDOMMatrix };
