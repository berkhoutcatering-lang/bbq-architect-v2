import { converter, interpolate, formatHex } from 'culori';

const toOklch = converter('oklch');

/**
 * Perceptual lightness (OKLCH L) of a hex color, 0-1. Used to decide
 * whether to treat a theme as light or dark — the boundary at 0.5
 * is perceptually neutral, unlike sRGB luminance which over-weights
 * green and under-weights blue on warm and cool surfaces.
 */
export function perceivedLightness(hex: string): number {
    try {
        const oklch = toOklch(hex);
        return oklch?.l ?? 0.5;
    } catch {
        return 0.5;
    }
}

// ── WCAG 2.x contrast ────────────────────────────────────────────────
export function hexToRgb(hex: string): [number, number, number] {
    const h = hex.replace('#', '');
    const expanded = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
    const v = parseInt(expanded, 16);
    return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

export function relativeLuminance(rgb: [number, number, number]): number {
    const [rs, gs, bs] = rgb.map(c => {
        const x = c / 255;
        return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

export function contrastRatio(a: string, b: string): number {
    const L1 = relativeLuminance(hexToRgb(a));
    const L2 = relativeLuminance(hexToRgb(b));
    return (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
}

export type WcagLevel = { label: 'AAA' | 'AA' | 'AA Large' | 'Faalt'; pass: boolean };
export function wcagLevel(ratio: number): WcagLevel {
    if (ratio >= 7) return { label: 'AAA', pass: true };
    if (ratio >= 4.5) return { label: 'AA', pass: true };
    if (ratio >= 3) return { label: 'AA Large', pass: true };
    return { label: 'Faalt', pass: false };
}

// ── OKLCH mixing — matches what the browser does for color-mix(in oklch, ..)
export function mixOklch(a: string, b: string, t: number): string {
    try {
        const interp = interpolate([a, b], 'oklch');
        return formatHex(interp(t)) ?? a;
    } catch {
        return a;
    }
}

/**
 * Tint a hex color toward a target by a percentage (0 = original, 100 = target).
 * Used by the advanced color editor's per-token sliders. Mixing is done in
 * OKLCH so the slider position corresponds to the perceived halfway between
 * the original and white/black, not the sRGB-linear midpoint (which looks
 * too dark on light slides and too light on dark slides).
 */
export function tintToward(hex: string, percent: number, target: string = '#ffffff'): string {
    return mixOklch(hex, target, Math.max(0, Math.min(100, percent)) / 100);
}

/**
 * Bump a foreground color's lightness until it hits the target contrast
 * against bg. Used by the editor's "Verbeter"-button on a failing pair.
 * Returns the closest passing hex, or pure white/black if nothing works.
 */
export function autoFixContrast(fgHex: string, bgHex: string, targetRatio = 4.5): string {
    const bgLum = relativeLuminance(hexToRgb(bgHex));
    const dark = bgLum < 0.2;
    // Walk along the OKLCH line from fg toward white (on dark bg) or black (on light bg).
    const target = dark ? '#ffffff' : '#000000';
    for (let step = 1; step <= 100; step++) {
        const candidate = mixOklch(fgHex, target, step / 100);
        if (contrastRatio(candidate, bgHex) >= targetRatio) return candidate;
    }
    return target;
}
