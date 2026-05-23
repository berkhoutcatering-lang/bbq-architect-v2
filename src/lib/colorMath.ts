import { converter } from 'culori';

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
