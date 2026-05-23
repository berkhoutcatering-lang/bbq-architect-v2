/**
 * Curated theme library — 8 presets, 4 dark + 4 light, each tuned for a
 * distinct caterer archetype. Single source of truth: imported by the
 * preset picker UI, the server-side FOUC injector in layout.tsx, the
 * ThemeProvider runtime, and the contrast-audit CI job.
 *
 * Adding or editing a preset triggers the contrast-audit; if any of the
 * 12 audited token-pairs falls below WCAG AA, the CI build fails.
 */

export type ThemeMode = 'light' | 'dark';

export type ThemePreset = {
    /** Stable slug — used as cookie value and as DB-side fingerprint via (bg, primary) signature. */
    id: string;
    /** Display name in the picker. */
    name: string;
    /** One-line caterer persona + voice — surfaced in the picker card. */
    description: string;
    /** Perceptual mode — drives mode-aware muted derivation in ThemeProvider. */
    mode: ThemeMode;
    /** Canvas background. */
    bg: string;
    /** Surface (cards, panels). */
    card: string;
    /** Body text. */
    text: string;
    /** Primary brand color — buttons, key accents. */
    primary: string;
    /** Counterpoint accent — secondary CTAs, chips. */
    accent: string;
    /** Deep bg variant — sidebar, footer, "below the fold" surfaces. */
    secondary: string;
};

export const THEMES: readonly ThemePreset[] = [
    // ── 4 dark ────────────────────────────────────────────────────────
    {
        id: 'smoke-and-steel',
        name: 'Smoke & Steel',
        description: 'Pitmaster classic — warm ember + cool steel, ambachtelijk',
        mode: 'dark',
        bg: '#110c0a', card: '#221b18', text: '#f3f2ee',
        primary: '#e78a45', accent: '#5c8f9f', secondary: '#050302',
    },
    {
        id: 'drents-eik',
        name: 'Drents Eik',
        description: 'Outdoor + event cateraar — bos-groen + herfst-tan, organisch',
        mode: 'dark',
        bg: '#10130e', card: '#22251e', text: '#f0eeeb',
        primary: '#9c9e48', accent: '#c89164', secondary: '#050604',
    },
    {
        id: 'brandstapel',
        name: 'Brandstapel',
        description: 'Fine-dining + wijn-pairing — bordeaux + goud, luxurieus',
        mode: 'dark',
        bg: '#160909', card: '#2f1c1c', text: '#f1eee9',
        primary: '#cba553', accent: '#c8635d', secondary: '#090303',
    },
    {
        id: 'nordic-graphite',
        name: 'Nordic Graphite',
        description: 'Tech-forward editorial — graphite + warm gold, minimalistisch',
        mode: 'dark',
        bg: '#0c0d0f', card: '#1d1f23', text: '#f4f5f7',
        primary: '#c8b778', accent: '#9199a5', secondary: '#030304',
    },
    // ── 4 light ───────────────────────────────────────────────────────
    {
        id: 'witte-berken',
        name: 'Witte Berken',
        description: 'Wedding + vintage — berken-wit + walnut, hygge',
        mode: 'light',
        bg: '#f5f1e9', card: '#fefcf7', text: '#1c1411',
        primary: '#6e401e', accent: '#9a5240', secondary: '#e6e0d7',
    },
    {
        id: 'studio-paper',
        name: 'Studio Paper',
        description: 'Pop-up minimalist — pure wit + pantone-rood, editorial',
        mode: 'light',
        bg: '#f5f5f5', card: '#ffffff', text: '#121212',
        primary: '#141618', accent: '#c53637', secondary: '#e8e8e8',
    },
    {
        id: 'moestuin',
        name: 'Moestuin',
        description: 'Vegan + farm-to-table — olive-groen + clay, kitchen garden',
        mode: 'light',
        bg: '#eff0e1', card: '#fcfcf5', text: '#191c12',
        primary: '#465e2c', accent: '#9b4630', secondary: '#dedfd1',
    },
    {
        id: 'zandstrand',
        name: 'Zandstrand',
        description: 'Beach BBQ + festival — warm zand + ocean-teal, zomers',
        mode: 'light',
        bg: '#f5efe3', card: '#fffcf5', text: '#1a1710',
        primary: '#a06828', accent: '#2e7a6a', secondary: '#e8e1d4',
    },
] as const;

export const DEFAULT_PRESET_ID = 'smoke-and-steel';

/** Find the preset whose (bg, primary) signature matches the saved settings, or null for custom hex. */
export function findPresetBySignature(bg?: string | null, primary?: string | null): ThemePreset | null {
    if (!bg || !primary) return null;
    const b = bg.toLowerCase();
    const p = primary.toLowerCase();
    return THEMES.find(t => t.bg.toLowerCase() === b && t.primary.toLowerCase() === p) ?? null;
}
