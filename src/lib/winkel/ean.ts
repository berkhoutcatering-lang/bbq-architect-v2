/**
 * De streepjescode (EAN) van een winkelproduct: de enige controle.
 *
 * Wat de kassa scant, moet precies één product opleveren. Daarom alleen de
 * drie codes die op losse producten in de winkel staan:
 *   - EAN-8  (8 cijfers, kleine verpakkingen)
 *   - UPC-A  (12 cijfers, Amerikaanse producten)
 *   - EAN-13 (13 cijfers, bijna alles)
 * met een kloppend controlecijfer (het laatste cijfer, GS1-regel). Een
 * scanner die een cijfer mist of verkeerd leest, valt daar bijna altijd op.
 *
 * Geen database en geen scherm: dit bestand draait in de browser (meteen
 * melden bij een scan) en op de server (de echte controle vóór opslaan).
 */

export type EanSoort = 'EAN-8' | 'UPC-A' | 'EAN-13';

export type EanControle =
    | { ok: true; code: string; soort: EanSoort }
    | { ok: false; fout: string };

const SOORT_PER_LENGTE: Record<number, EanSoort> = { 8: 'EAN-8', 12: 'UPC-A', 13: 'EAN-13' };

/**
 * Het controlecijfer volgens GS1: van rechts naar links (zonder het laatste
 * cijfer) om en om ×3 en ×1, en dan aanvullen tot een tiental.
 */
export function controlecijfer(zonderLaatste: string): number {
    let som = 0;
    for (let i = 0; i < zonderLaatste.length; i++) {
        const cijfer = zonderLaatste.charCodeAt(zonderLaatste.length - 1 - i) - 48;
        som += cijfer * (i % 2 === 0 ? 3 : 1);
    }
    return (10 - (som % 10)) % 10;
}

/** Controleert een gescande of getypte code. Spaties eromheen tellen niet mee. */
export function controleerEan(invoer: string | null | undefined): EanControle {
    const code = (invoer ?? '').trim();
    if (!code) return { ok: false, fout: 'Er is geen code gescand.' };
    if (!/^\d+$/.test(code)) {
        return { ok: false, fout: 'Een streepjescode bestaat alleen uit cijfers. Dit lijkt een andere soort code.' };
    }
    const soort = SOORT_PER_LENGTE[code.length];
    if (!soort) {
        return { ok: false, fout: `Een streepjescode heeft 8, 12 of 13 cijfers. Deze heeft er ${code.length}.` };
    }
    if (controlecijfer(code.slice(0, -1)) !== Number(code[code.length - 1])) {
        return { ok: false, fout: 'Deze code klopt niet: het laatste cijfer past niet bij de rest. Scan hem nog een keer.' };
    }
    return { ok: true, code, soort };
}

/**
 * Dezelfde code in beide schrijfwijzen. Een UPC-A (12 cijfers) is als EAN-13
 * dezelfde code met een 0 ervoor; sommige scanners sturen de ene, sommige de
 * andere. Voor de controle op dubbelen tellen ze als één.
 */
export function eanVarianten(code: string): string[] {
    if (code.length === 12) return [code, `0${code}`];
    if (code.length === 13 && code.startsWith('0')) return [code, code.slice(1)];
    return [code];
}
