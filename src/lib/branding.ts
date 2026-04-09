// Per-tenant branding utilities
// Converts settings branding fields into a config usable by PDF generator, quote page, emails

export interface BrandingConfig {
  logoUrl: string | null;
  logoDarkUrl: string | null;
  primaryColor: string;
  accentColor: string;
  primaryRgb: [number, number, number];
  accentRgb: [number, number, number];
}

// Default brand colors (Hop & Bites gold)
const DEFAULT_PRIMARY = '#9e781c';

export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const num = parseInt(h.length === 3
    ? h[0] + h[0] + h[1] + h[1] + h[2] + h[2]
    : h, 16);
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

export function rgbToHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map(function (c) {
    return Math.max(0, Math.min(255, Math.round(c))).toString(16).padStart(2, '0');
  }).join('');
}

export function darkenHex(hex: string, amount: number): string {
  const [r, g, b] = hexToRgb(hex);
  const factor = 1 - amount;
  return rgbToHex(r * factor, g * factor, b * factor);
}

export function lightenHex(hex: string, amount: number): string {
  const [r, g, b] = hexToRgb(hex);
  return rgbToHex(
    r + (255 - r) * amount,
    g + (255 - g) * amount,
    b + (255 - b) * amount,
  );
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export function buildBrandingConfig(settings: any): BrandingConfig {
  const primary = (settings?.brand_primary as string) || DEFAULT_PRIMARY;
  const accent = (settings?.brand_accent as string) || darkenHex(primary, 0.18);
  return {
    logoUrl: (settings?.logo_url as string) || null,
    logoDarkUrl: (settings?.logo_dark_url as string) || null,
    primaryColor: primary,
    accentColor: accent,
    primaryRgb: hexToRgb(primary),
    accentRgb: hexToRgb(accent),
  };
}
