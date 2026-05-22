/**
 * Theme-preset catalog — interim source-of-truth voor Sprint 3 C6 (theme-picker UX).
 *
 * Bij Sprint 2 merge: deze file verdwijnt en de presets verhuizen naar
 * `ThemeProvider.tsx` (export `PRESETS`). API-shape blijft hetzelfde.
 *
 * 8 archetypes:
 *  - 4 donker (Smokehouse / Graphite / Cellar / Foundry)
 *  - 4 licht  (Smokehouse Light / Linen / Studio / Garden)
 *
 * Geen 2 presets binnen ±15° hue. Elk preset met text-op-card ≥ 4.5:1 op
 * de stevige tekst, en met een eigen "audience" zodat de picker kan vertellen
 * voor wie het preset bedoeld is.
 */
export type ThemeAudience = 'lars' | 'pro' | 'showcase' | 'demo';
export type ThemeMode = 'dark' | 'light';

export interface ThemeTokens {
    bg: string;
    card: string;
    text: string;
    primary: string;
    accent: string;
    secondary: string;
}

export interface ThemePreset {
    id: string;
    naam: string;
    omschrijving: string;
    audience: ThemeAudience;
    audienceLabel: string;
    mode: ThemeMode;
    tokens: ThemeTokens;
}

export const PRESETS: readonly ThemePreset[] = [
    {
        id: 'smokehouse',
        naam: 'Smokehouse',
        omschrijving: 'Voor traditionele BBQ-caterers — slow smoke, charcoal, pitmaster',
        audience: 'lars',
        audienceLabel: 'Lars-vriendelijk',
        mode: 'dark',
        tokens: { bg: '#181412', card: '#2c241d', text: '#f4efe4', primary: '#d49b4d', accent: '#b3611f', secondary: '#100c0a' },
    },
    {
        id: 'smokehouse-light',
        naam: 'Smokehouse Light',
        omschrijving: 'Lichte variant — voor caterers die overdag presenteren onder fel licht',
        audience: 'lars',
        audienceLabel: 'Lars-vriendelijk',
        mode: 'light',
        tokens: { bg: '#f8efdf', card: '#fdf7eb', text: '#2a1f15', primary: '#b3611f', accent: '#7a3d10', secondary: '#ecdfca' },
    },
    {
        id: 'graphite',
        naam: 'Graphite',
        omschrijving: 'Voor moderne event-caterers — editorial, premium, tech-forward',
        audience: 'pro',
        audienceLabel: 'Pro-tier',
        mode: 'dark',
        tokens: { bg: '#0e1014', card: '#1f2128', text: '#f4f5f7', primary: '#d8c277', accent: '#a89d83', secondary: '#08090d' },
    },
    {
        id: 'linen',
        naam: 'Linen',
        omschrijving: 'Voor klassieke wedding-caterers — papier-en-inkt, professioneel',
        audience: 'pro',
        audienceLabel: 'Pro-tier',
        mode: 'light',
        tokens: { bg: '#f4eed8', card: '#fcfaf3', text: '#1c1814', primary: '#9a6a3e', accent: '#6b4a30', secondary: '#e7dfc6' },
    },
    {
        id: 'studio',
        naam: 'Studio',
        omschrijving: 'Voor minimalistische caterers — magazine-clean, één scherpe rode accent',
        audience: 'showcase',
        audienceLabel: 'Magazine',
        mode: 'light',
        tokens: { bg: '#f6f6f6', card: '#ffffff', text: '#181818', primary: '#222222', accent: '#b73020', secondary: '#ebebeb' },
    },
    {
        id: 'cellar',
        naam: 'Cellar',
        omschrijving: 'Voor fine-dining caterers en premium bruiloften — kelder-warm, gastronomisch',
        audience: 'pro',
        audienceLabel: 'Premium',
        mode: 'dark',
        tokens: { bg: '#241015', card: '#4a1f2a', text: '#f1ead8', primary: '#dac786', accent: '#a96940', secondary: '#1a0a0d' },
    },
    {
        id: 'garden',
        naam: 'Garden',
        omschrijving: 'Voor garden-party en sustainable caterers — organisch, plantaardig, aards',
        audience: 'pro',
        audienceLabel: 'Sustainable',
        mode: 'light',
        tokens: { bg: '#ece9d6', card: '#fbf9ef', text: '#1f2117', primary: '#6b7847', accent: '#a96b40', secondary: '#dad6b8' },
    },
    {
        id: 'foundry',
        naam: 'Foundry',
        omschrijving: 'Industrial slate + copper — voor stoere event-locaties met staal en beton',
        audience: 'demo',
        audienceLabel: 'Industrial nieuw',
        mode: 'dark',
        tokens: { bg: '#1a1d20', card: '#2a2e33', text: '#e8e6e3', primary: '#b87432', accent: '#7c8590', secondary: '#0f1114' },
    },
] as const;

export function findPresetById(id: string | null | undefined): ThemePreset | undefined {
    if (!id) return undefined;
    return PRESETS.find((p) => p.id === id);
}

export function matchPresetByTokens(bg: string | undefined, primary: string | undefined): ThemePreset | undefined {
    if (!bg || !primary) return undefined;
    return PRESETS.find((p) => p.tokens.bg.toLowerCase() === bg.toLowerCase() && p.tokens.primary.toLowerCase() === primary.toLowerCase());
}
