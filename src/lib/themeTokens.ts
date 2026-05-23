import type { ThemeMode, ThemePreset } from './themes';

/**
 * Build the :root CSS-variable declarations for a theme. Used by both the
 * server-side FOUC injector in layout.tsx (full preset → string) and the
 * client-side ThemeProvider (raw hex → array of setProperty calls).
 *
 * Mode-aware muted weights solve the "letters vallen weg" bug: on light
 * themes the eye is more sensitive to dark dots on bright canvas, so we
 * mix muted text MORE toward the bg (65/78%) than on dark themes (55/70%).
 * Without this, --muted on Witte Berken landed at ~3.2:1 — below WCAG AA
 * for body text.
 */

export type RawTokens = {
    bg: string;
    text: string;
    card: string;
    primary: string;
    accent: string;
    secondary: string;
    mode: ThemeMode;
};

type CssVar = [name: string, value: string];

function tokensFromPreset(p: ThemePreset): RawTokens {
    return { bg: p.bg, text: p.text, card: p.card, primary: p.primary, accent: p.accent, secondary: p.secondary, mode: p.mode };
}

export function themeCssVars(input: ThemePreset | RawTokens): CssVar[] {
    const t: RawTokens = 'id' in input ? tokensFromPreset(input) : input;
    const { bg, text, card, primary, accent, secondary, mode } = t;

    const wMuted = mode === 'light' ? '65%' : '55%';
    const wMutedLight = mode === 'light' ? '78%' : '70%';
    const wGhost = mode === 'light' ? '50%' : '35%';

    return [
        // ── source tokens ─────────────────────────────────────────────
        ['--bg', bg],
        ['--text', text],
        ['--card', card],
        ['--card-solid', card],
        ['--brand', primary],
        ['--brand-primary', primary],
        ['--brand-accent', accent],
        ['--brand-secondary', secondary],
        ['--hb-gold', primary],
        ['--color-accent-gold', primary],

        // ── legacy semantic aliases ───────────────────────────────────
        ['--color-bg-primary', bg],
        ['--color-bg-card', card],
        ['--color-text-primary', text],

        // ── derived via color-mix(in oklch) — browser computes at paint
        ['--muted', `color-mix(in oklch, ${text} ${wMuted}, ${bg})`],
        ['--muted-light', `color-mix(in oklch, ${text} ${wMutedLight}, ${bg})`],
        ['--color-text-muted', `color-mix(in oklch, ${text} ${wMuted}, ${bg})`],
        ['--color-text-ghost', `color-mix(in oklch, ${text} ${wGhost}, ${bg})`],

        // ── borders + hover surfaces track text-direction from card ───
        ['--border', `color-mix(in oklch, ${card}, ${text} 12%)`],
        ['--border-strong', `color-mix(in oklch, ${card}, ${text} 24%)`],
        ['--color-border', `color-mix(in oklch, ${card}, ${text} 12%)`],
        ['--color-border-hover', `color-mix(in oklch, ${card}, ${text} 20%)`],
        ['--sidebar-bg-hover', `color-mix(in oklch, ${card}, ${text} 8%)`],
        ['--color-bg-elevated', `color-mix(in oklch, ${card}, ${text} 4%)`],

        // ── deep bg goes absolute darker, not text-direction ──────────
        ['--color-bg-deep', `color-mix(in oklch, ${bg}, black 5%)`],
        ['--color-bg-darker', `color-mix(in oklch, ${bg}, black 12%)`],
    ];
}

/** Serialize to a `:root{...}` block — for server-side injection in layout.tsx. */
export function themeCssVarsBlock(input: ThemePreset | RawTokens): string {
    const decls = themeCssVars(input).map(([k, v]) => `${k}:${v}`).join(';');
    return `:root{${decls}}`;
}
