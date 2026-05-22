/**
 * WCAG 2.1 contrast utility — interim versie voor Sprint 3 C6.
 *
 * Bij Sprint 2 merge: deze file verdwijnt en `getContrast` komt uit
 * de Sprint-2 versie (zelfde API: `getContrast(hex1, hex2): number`).
 *
 * Formule: https://www.w3.org/TR/WCAG21/#dfn-contrast-ratio
 *  contrast = (L1 + 0.05) / (L2 + 0.05), waar L1 ≥ L2.
 *  L = relatieve luminance van de kleur (sRGB → linear → gewogen som).
 */

function srgbToLinear(channel: number): number {
    const c = channel / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
    const h = hex.replace('#', '').trim();
    if (h.length !== 6) return null;
    const num = parseInt(h, 16);
    if (Number.isNaN(num)) return null;
    return { r: (num >> 16) & 0xff, g: (num >> 8) & 0xff, b: num & 0xff };
}

function relativeLuminance(hex: string): number {
    const rgb = hexToRgb(hex);
    if (!rgb) return 0;
    const r = srgbToLinear(rgb.r);
    const g = srgbToLinear(rgb.g);
    const b = srgbToLinear(rgb.b);
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Returnt de WCAG-contrast-ratio tussen twee hex-kleuren.
 * 1.0 = identiek, 21.0 = zwart-op-wit.
 * AA  threshold: ≥ 4.5 voor body text, ≥ 3 voor large text.
 * AAA threshold: ≥ 7   voor body text, ≥ 4.5 voor large text.
 */
export function getContrast(hex1: string, hex2: string): number {
    const l1 = relativeLuminance(hex1);
    const l2 = relativeLuminance(hex2);
    const lighter = Math.max(l1, l2);
    const darker = Math.min(l1, l2);
    return (lighter + 0.05) / (darker + 0.05);
}

export type ContrastVerdict = 'AAA' | 'AA' | 'FAIL';

export function verdictFor(hex1: string, hex2: string): ContrastVerdict {
    const ratio = getContrast(hex1, hex2);
    if (ratio >= 7) return 'AAA';
    if (ratio >= 4.5) return 'AA';
    return 'FAIL';
}
