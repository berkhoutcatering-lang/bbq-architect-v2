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

// 8 curated theme presets (Sprint 2 C4) — 4 dark / 4 light, hue-spread ≥15°.
// Tokens are OKLCH strings consumed by globals.css selectors `[data-theme-preset="<id>"]`.
// Contrast guarded by src/lib/__tests__/theme-contrast.test.ts (WCAG AA on critical pairs).

export type ThemeMode = 'dark' | 'light';

export interface ThemePreset {
  id: string;
  name: string;
  audience: string;
  mode: ThemeMode;
  tokens: {
    primary: string;       // brand color on app bg/card (dark presets: lighter for legibility)
    primary_print: string; // brand color on white (PDF, logo, print) — always dark enough for ≥3:1 on white
    accent: string;
    bg: string;
    card: string;
    text: string;
    muted: string;
    border: string;
  };
}

export const THEME_PRESETS: ThemePreset[] = [
  {
    id: 'smokehouse-dark',
    name: 'Smokehouse Dark',
    audience: 'Klassiek BBQ',
    mode: 'dark',
    tokens: {
      primary: 'oklch(0.72 0.16 35)',
      primary_print: 'oklch(0.48 0.16 35)',
      accent: 'oklch(0.65 0.18 20)',
      bg: 'oklch(0.16 0.02 25)',
      card: 'oklch(0.22 0.02 25)',
      text: 'oklch(0.95 0.005 25)',
      muted: 'oklch(0.70 0.01 25)',
      border: 'oklch(0.40 0.02 25)',
    },
  },
  {
    id: 'smokehouse-light',
    name: 'Smokehouse Light',
    audience: 'Warm-klassiek',
    mode: 'light',
    tokens: {
      primary: 'oklch(0.50 0.16 35)',
      primary_print: 'oklch(0.50 0.16 35)',
      accent: 'oklch(0.45 0.18 20)',
      bg: 'oklch(0.97 0.015 50)',
      card: 'oklch(0.99 0.01 50)',
      text: 'oklch(0.20 0.02 35)',
      muted: 'oklch(0.45 0.02 35)',
      border: 'oklch(0.76 0.02 50)',
    },
  },
  {
    id: 'graphite',
    name: 'Graphite',
    audience: 'Corporate caterer',
    mode: 'dark',
    tokens: {
      primary: 'oklch(0.72 0.10 220)',
      primary_print: 'oklch(0.45 0.10 220)',
      accent: 'oklch(0.70 0.12 250)',
      bg: 'oklch(0.16 0.01 240)',
      card: 'oklch(0.22 0.01 240)',
      text: 'oklch(0.94 0.005 220)',
      muted: 'oklch(0.70 0.005 220)',
      border: 'oklch(0.40 0.01 240)',
    },
  },
  {
    id: 'linen',
    name: 'Linen',
    audience: 'Bruiloft / fine dining',
    mode: 'light',
    tokens: {
      primary: 'oklch(0.45 0.10 60)',
      primary_print: 'oklch(0.45 0.10 60)',
      accent: 'oklch(0.50 0.12 80)',
      bg: 'oklch(0.97 0.02 75)',
      card: 'oklch(0.99 0.015 75)',
      text: 'oklch(0.20 0.02 60)',
      muted: 'oklch(0.45 0.02 60)',
      border: 'oklch(0.76 0.025 75)',
    },
  },
  {
    id: 'studio',
    name: 'Studio',
    audience: 'Foodtruck / streetfood',
    mode: 'dark',
    tokens: {
      primary: 'oklch(0.70 0.14 290)',
      primary_print: 'oklch(0.45 0.14 290)',
      accent: 'oklch(0.72 0.12 280)',
      bg: 'oklch(0.16 0.015 290)',
      card: 'oklch(0.22 0.015 290)',
      text: 'oklch(0.94 0.005 280)',
      muted: 'oklch(0.70 0.01 280)',
      border: 'oklch(0.40 0.015 290)',
    },
  },
  {
    id: 'cellar',
    name: 'Cellar',
    audience: 'Wijn / proeverijen',
    mode: 'dark',
    tokens: {
      primary: 'oklch(0.62 0.16 25)',
      primary_print: 'oklch(0.42 0.16 25)',
      accent: 'oklch(0.68 0.12 35)',
      bg: 'oklch(0.15 0.03 20)',
      card: 'oklch(0.20 0.03 20)',
      text: 'oklch(0.94 0.005 30)',
      muted: 'oklch(0.70 0.015 25)',
      border: 'oklch(0.40 0.03 20)',
    },
  },
  {
    id: 'garden',
    name: 'Garden',
    audience: 'Duurzaam / bio',
    mode: 'light',
    tokens: {
      primary: 'oklch(0.48 0.10 145)',
      primary_print: 'oklch(0.48 0.10 145)',
      accent: 'oklch(0.45 0.12 160)',
      bg: 'oklch(0.97 0.015 140)',
      card: 'oklch(0.99 0.01 140)',
      text: 'oklch(0.22 0.025 140)',
      muted: 'oklch(0.45 0.02 140)',
      border: 'oklch(0.76 0.02 140)',
    },
  },
  {
    id: 'foundry',
    name: 'Foundry',
    audience: 'Industrieel / urban',
    mode: 'light',
    tokens: {
      primary: 'oklch(0.45 0.16 38)',
      primary_print: 'oklch(0.45 0.16 38)',
      accent: 'oklch(0.50 0.05 220)',
      bg: 'oklch(0.95 0.005 220)',
      card: 'oklch(0.99 0.003 220)',
      text: 'oklch(0.22 0.005 220)',
      muted: 'oklch(0.45 0.005 220)',
      border: 'oklch(0.76 0.005 220)',
    },
  },
];

export function findPreset(id: string): ThemePreset | undefined {
  return THEME_PRESETS.find(p => p.id === id);
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
