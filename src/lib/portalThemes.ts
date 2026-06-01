/* White-label portal themes — 8 OKLCH presets.
   Tenant kiest één via settings.brand_theme (default: 'warm-amber').
   Token-set per theme = 5 brand tokens × derived surface/border/text scale.
   Mode (light/dark) bepaalt ook shadow-style. */

export type ThemeMode = 'light' | 'dark';

export interface ThemeDef {
  id: string;
  label: string;
  sub: string;
  mode: ThemeMode;
  vars: Record<string, string>;
}

export const PORTAL_THEMES: ThemeDef[] = [
  {
    id: 'warm-amber', label: 'Warm amber', sub: 'op crème', mode: 'light',
    vars: {
      '--surface': 'oklch(0.962 0.010 82)', '--surface-2': 'oklch(0.992 0.004 82)', '--surface-3': 'oklch(0.930 0.013 80)',
      '--text': 'oklch(0.255 0.020 62)', '--text-muted': 'oklch(0.480 0.020 62)', '--text-faint': 'oklch(0.620 0.016 64)',
      '--border': 'oklch(0.885 0.012 78)', '--border-strong': 'oklch(0.815 0.016 76)',
      '--brand-1': 'oklch(0.760 0.150 74)', '--brand-2': 'oklch(0.560 0.090 56)', '--brand-3': 'oklch(0.700 0.130 48)',
      '--on-brand': 'oklch(0.230 0.030 64)', '--scrim': 'rgba(28, 20, 8, 0.55)',
    },
  },
  {
    id: 'deep-green', label: 'Deep green', sub: 'op crème', mode: 'light',
    vars: {
      '--surface': 'oklch(0.964 0.012 96)', '--surface-2': 'oklch(0.992 0.005 96)', '--surface-3': 'oklch(0.934 0.014 110)',
      '--text': 'oklch(0.268 0.025 150)', '--text-muted': 'oklch(0.452 0.022 150)', '--text-faint': 'oklch(0.598 0.018 150)',
      '--border': 'oklch(0.882 0.014 120)', '--border-strong': 'oklch(0.808 0.018 130)',
      '--brand-1': 'oklch(0.468 0.108 155)', '--brand-2': 'oklch(0.420 0.078 150)', '--brand-3': 'oklch(0.660 0.120 128)',
      '--on-brand': 'oklch(0.985 0.018 120)', '--scrim': 'rgba(12, 30, 18, 0.55)',
    },
  },
  {
    id: 'terracotta', label: 'Terracotta', sub: 'op zand', mode: 'light',
    vars: {
      '--surface': 'oklch(0.960 0.014 60)', '--surface-2': 'oklch(0.990 0.006 62)', '--surface-3': 'oklch(0.925 0.016 55)',
      '--text': 'oklch(0.290 0.028 48)', '--text-muted': 'oklch(0.470 0.026 48)', '--text-faint': 'oklch(0.610 0.020 52)',
      '--border': 'oklch(0.882 0.015 55)', '--border-strong': 'oklch(0.812 0.019 52)',
      '--brand-1': 'oklch(0.620 0.135 46)', '--brand-2': 'oklch(0.520 0.100 42)', '--brand-3': 'oklch(0.715 0.110 70)',
      '--on-brand': 'oklch(0.990 0.010 60)', '--scrim': 'rgba(45, 22, 12, 0.52)',
    },
  },
  {
    id: 'sage', label: 'Sage', sub: 'op linnen', mode: 'light',
    vars: {
      '--surface': 'oklch(0.957 0.012 130)', '--surface-2': 'oklch(0.989 0.006 130)', '--surface-3': 'oklch(0.922 0.014 130)',
      '--text': 'oklch(0.300 0.018 150)', '--text-muted': 'oklch(0.480 0.016 150)', '--text-faint': 'oklch(0.620 0.014 150)',
      '--border': 'oklch(0.880 0.012 135)', '--border-strong': 'oklch(0.810 0.016 140)',
      '--brand-1': 'oklch(0.560 0.078 150)', '--brand-2': 'oklch(0.480 0.058 155)', '--brand-3': 'oklch(0.660 0.080 120)',
      '--on-brand': 'oklch(0.990 0.010 150)', '--scrim': 'rgba(28, 34, 26, 0.50)',
    },
  },
  {
    id: 'copper-rust', label: 'Copper rust', sub: 'op klei', mode: 'light',
    vars: {
      '--surface': 'oklch(0.953 0.013 52)', '--surface-2': 'oklch(0.987 0.006 52)', '--surface-3': 'oklch(0.918 0.017 48)',
      '--text': 'oklch(0.282 0.030 42)', '--text-muted': 'oklch(0.466 0.028 42)', '--text-faint': 'oklch(0.606 0.020 46)',
      '--border': 'oklch(0.878 0.016 48)', '--border-strong': 'oklch(0.806 0.020 46)',
      '--brand-1': 'oklch(0.550 0.145 42)', '--brand-2': 'oklch(0.478 0.110 38)', '--brand-3': 'oklch(0.680 0.130 62)',
      '--on-brand': 'oklch(0.985 0.012 60)', '--scrim': 'rgba(40, 18, 8, 0.55)',
    },
  },
  {
    id: 'charcoal', label: 'Charcoal', sub: 'donker · goud', mode: 'dark',
    vars: {
      '--surface': 'oklch(0.205 0.006 70)', '--surface-2': 'oklch(0.252 0.007 70)', '--surface-3': 'oklch(0.305 0.008 70)',
      '--text': 'oklch(0.962 0.004 80)', '--text-muted': 'oklch(0.720 0.008 75)', '--text-faint': 'oklch(0.560 0.010 72)',
      '--border': 'oklch(0.380 0.008 75)', '--border-strong': 'oklch(0.470 0.010 75)',
      '--brand-1': 'oklch(0.790 0.115 78)', '--brand-2': 'oklch(0.800 0.060 80)', '--brand-3': 'oklch(0.720 0.120 55)',
      '--on-brand': 'oklch(0.200 0.020 70)', '--scrim': 'rgba(0, 0, 0, 0.64)',
    },
  },
  {
    id: 'midnight-blue', label: 'Midnight', sub: 'donker · blauw', mode: 'dark',
    vars: {
      '--surface': 'oklch(0.220 0.024 256)', '--surface-2': 'oklch(0.272 0.030 256)', '--surface-3': 'oklch(0.322 0.034 256)',
      '--text': 'oklch(0.952 0.008 250)', '--text-muted': 'oklch(0.720 0.020 250)', '--text-faint': 'oklch(0.560 0.025 250)',
      '--border': 'oklch(0.400 0.030 255)', '--border-strong': 'oklch(0.480 0.035 255)',
      '--brand-1': 'oklch(0.680 0.140 248)', '--brand-2': 'oklch(0.740 0.090 232)', '--brand-3': 'oklch(0.790 0.105 206)',
      '--on-brand': 'oklch(0.990 0.010 250)', '--scrim': 'rgba(4, 8, 22, 0.66)',
    },
  },
  {
    id: 'gold-on-black', label: 'Gold on black', sub: 'maximaal contrast', mode: 'dark',
    vars: {
      '--surface': 'oklch(0.148 0.004 85)', '--surface-2': 'oklch(0.198 0.006 85)', '--surface-3': 'oklch(0.258 0.008 85)',
      '--text': 'oklch(0.970 0.006 85)', '--text-muted': 'oklch(0.720 0.010 82)', '--text-faint': 'oklch(0.540 0.012 80)',
      '--border': 'oklch(0.360 0.008 85)', '--border-strong': 'oklch(0.460 0.010 85)',
      '--brand-1': 'oklch(0.805 0.130 88)', '--brand-2': 'oklch(0.760 0.090 85)', '--brand-3': 'oklch(0.700 0.120 60)',
      '--on-brand': 'oklch(0.180 0.020 85)', '--scrim': 'rgba(0, 0, 0, 0.70)',
    },
  },
];

const SHADOWS = {
  light: {
    '--shadow-sm': '0 1px 2px rgba(40,28,12,0.06), 0 1px 3px rgba(40,28,12,0.05)',
    '--shadow-md': '0 6px 18px rgba(40,28,12,0.10)',
    '--shadow-lg': '0 18px 50px rgba(30,20,10,0.16)',
  },
  dark: {
    '--shadow-sm': '0 1px 2px rgba(0,0,0,0.40)',
    '--shadow-md': '0 8px 24px rgba(0,0,0,0.46)',
    '--shadow-lg': '0 22px 60px rgba(0,0,0,0.62)',
  },
};

const THEME_BY_ID = Object.fromEntries(PORTAL_THEMES.map((t) => [t.id, t]));

export function getTheme(themeId: string | null | undefined): ThemeDef {
  return THEME_BY_ID[themeId || ''] || PORTAL_THEMES[0];
}

/* Inline style-vars voor een tenant-thema — set op de portal-root via
   React inline style. Werkt zonder client-side JS (Server Component vriendelijk). */
export function themeStyleVars(themeId: string | null | undefined): React.CSSProperties {
  const t = getTheme(themeId);
  const all: Record<string, string> = { ...t.vars, ...SHADOWS[t.mode] };
  const css: Record<string, string> = {};
  for (const k in all) css[k] = all[k];
  return css as React.CSSProperties;
}

export function getThemeMode(themeId: string | null | undefined): ThemeMode {
  return getTheme(themeId).mode;
}
